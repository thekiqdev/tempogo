import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { buildApp } from "../../apps/api/src/app.js";
import { migrate } from "../../apps/api/src/migrations.js";
import { digest, hashPassword } from "../../apps/api/src/security.js";

const origin = "http://127.0.0.1:5173";
test("Sprint 01: identidade, isolamento, configuração e auditoria em PostgreSQL real", async (t) => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url);
  assert.ok(new URL(url).pathname.endsWith("_test"));
  assert.notEqual(new URL(url).pathname, new URL(process.env.DATABASE_URL ?? url).pathname);
  const admin = new pg.Pool({ connectionString: url });
  await migrate(admin, new URL("../../apps/api/migrations/", import.meta.url));
  const pool = new pg.Pool({
    connectionString: url,
    options: "-c role=cronocheckpoint_app",
    max: 1,
  });
  const sent: { email: string; token: string }[] = [];
  const app = buildApp(
    async () => {
      await pool.query("SELECT 1");
    },
    false,
    {
      pool,
      origin,
      secure: false,
      sendReset: async (email, token) => {
        sent.push({ email, token });
      },
    },
  );
  const suffix = randomUUID(),
    password = "Strong-test-password-" + suffix;
  async function fixture(label: string) {
    const org = (
      await admin.query("INSERT INTO app.organizations(name) VALUES($1) RETURNING id", [
        "Test " + label + " " + suffix,
      ])
    ).rows[0].id as string;
    const email = label + "-" + suffix + "@example.test";
    const user = (
      await admin.query("INSERT INTO app.users(email,password_hash) VALUES($1,$2) RETURNING id", [
        email,
        await hashPassword(password),
      ])
    ).rows[0].id as string;
    await admin.query("INSERT INTO app.memberships(organization_id,user_id) VALUES($1,$2)", [
      org,
      user,
    ]);
    return { org, user, email };
  }
  const a = await fixture("a"),
    b = await fixture("b");
  let cookieA = "",
    csrfA = "",
    cookieB = "",
    csrfB = "",
    eventId = "",
    cpId = "",
    categoryId = "";
  const body = {
    name: "Corrida de teste",
    local_date: "2026-10-04",
    timezone: "America/Sao_Paulo",
    location: "Parque",
    category_name: "5 km",
    distance_m: 5000,
  };
  function request(
    method: "GET" | "POST" | "PATCH",
    url: string,
    payload?: unknown,
    who = "a",
    csrf = true,
  ) {
    return app.inject({
      method,
      url: "/api/v1" + url,
      headers: {
        origin,
        cookie: who === "a" ? cookieA : cookieB,
        ...(csrf ? { "x-csrf-token": who === "a" ? csrfA : csrfB } : {}),
      },
      payload: payload as Record<string, unknown>,
    });
  }
  async function state() {
    return (await request("GET", "/events/" + eventId)).json();
  }
  try {
    await t.test("login genérico, cookie HttpOnly, sessão e CSRF", async () => {
      const invalid = await app.inject({
        method: "POST",
        url: "/api/v1/auth/admin/login",
        headers: { origin },
        payload: { email: a.email, password: "invalid" },
      });
      assert.equal(invalid.statusCode, 401);
      for (const [user, set] of [
        [
          a,
          (c: string, s: string) => {
            cookieA = c;
            csrfA = s;
          },
        ],
        [
          b,
          (c: string, s: string) => {
            cookieB = c;
            csrfB = s;
          },
        ],
      ] as const) {
        const r = await app.inject({
          method: "POST",
          url: "/api/v1/auth/admin/login",
          headers: { origin },
          payload: { email: user.email, password },
        });
        assert.equal(r.statusCode, 200, r.body);
        assert.match(String(r.headers["set-cookie"]), /HttpOnly/);
        assert.match(String(r.headers["set-cookie"]), /SameSite=Strict/);
        set(String(r.headers["set-cookie"]).split(";")[0] ?? "", r.json().csrf_token);
      }
      assert.equal((await request("GET", "/auth/me")).json().organization.id, a.org);
      assert.equal((await request("POST", "/events", body, "a", false)).statusCode, 403);
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/events",
            headers: { origin: "http://evil.example", cookie: cookieA, "x-csrf-token": csrfA },
            payload: body,
          })
        ).statusCode,
        403,
      );
    });
    await t.test("criar evento e negar IDs, filtros e escrita de outra organização", async () => {
      const r = await request("POST", "/events", body);
      assert.equal(r.statusCode, 201, r.body);
      eventId = r.json().id;
      categoryId = (await state()).category_id;
      assert.equal((await request("GET", "/events/" + eventId, undefined, "b")).statusCode, 404);
      assert.equal(
        (await request("GET", "/events/" + eventId + "/checkpoints", undefined, "b")).statusCode,
        404,
      );
      assert.equal(
        (await request("GET", "/events/" + eventId + "/audit", undefined, "b")).statusCode,
        404,
      );
      assert.equal(
        (await request("PATCH", "/events/" + eventId, { ...body, expected_version: 0 }, "b"))
          .statusCode,
        404,
      );
      assert.equal((await request("GET", "/events", undefined, "b")).json().items.length, 0);
      assert.equal(
        (await request("GET", "/events?organization_id=" + a.org, undefined, "b")).statusCode,
        422,
      );
      assert.equal(
        (await request("POST", "/events", { ...body, organization_id: b.org })).statusCode,
        422,
      );
      assert.equal(
        (await request("GET", "/events"))
          .json()
          .items.some((x: { id: string }) => x.id === eventId),
        true,
      );
    });
    await t.test("RLS sem contexto, pool reutilizado e FK composta", async () => {
      assert.equal(
        (await pool.query("SELECT current_user AS name")).rows[0].name,
        "cronocheckpoint_app",
      );
      assert.equal((await pool.query("SELECT id FROM app.events")).rowCount, 0);
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        await c.query("SELECT set_config('app.organization_id',$1,true)", [b.org]);
        assert.equal(
          (await c.query("SELECT id FROM app.events WHERE id=$1", [eventId])).rowCount,
          0,
        );
        await assert.rejects(
          c.query(
            "INSERT INTO app.checkpoints(organization_id,event_id,race_category_id,name,kind,sequence) VALUES($1,$2,$3,'Inválido','start',1)",
            [b.org, eventId, categoryId],
          ),
          (e) => (e as { code: string }).code === "23503",
        );
        await c.query("ROLLBACK");
      } finally {
        c.release();
      }
      assert.equal((await pool.query("SELECT id FROM app.events")).rowCount, 0);
    });
    await t.test("validação, ordem e conflito concorrente de checkpoint", async () => {
      let r = await request("POST", "/events/" + eventId + "/transitions", {
        target_state: "ready",
        expected_version: 0,
        reason: "Preparação",
      });
      assert.equal(r.statusCode, 409);
      r = await request("POST", "/events/" + eventId + "/checkpoints", {
        name: "Largada",
        kind: "start",
        sequence: 1,
        distance_m: 0,
        active: true,
      });
      assert.equal(r.statusCode, 201, r.body);
      cpId = r.json().id;
      assert.equal(
        (
          await request(
            "PATCH",
            "/checkpoints/" + cpId,
            {
              name: "Largada",
              kind: "start",
              sequence: 1,
              distance_m: 0,
              active: true,
              expected_version: 0,
            },
            "b",
          )
        ).statusCode,
        404,
      );
      assert.equal(
        (
          await request("POST", "/events/" + eventId + "/checkpoints", {
            name: "CP inválido",
            kind: "intermediate",
            sequence: 2,
            distance_m: -1,
          })
        ).statusCode,
        422,
      );
      const cp = {
        name: "CP 2,5 km",
        kind: "intermediate",
        sequence: 2,
        distance_m: 2500,
        active: true,
      };
      const both = await Promise.all([
        request("POST", "/events/" + eventId + "/checkpoints", cp),
        request("POST", "/events/" + eventId + "/checkpoints", cp),
      ]);
      assert.deepEqual(both.map((x) => x.statusCode).sort(), [201, 409]);
      assert.equal(
        (
          await request("POST", "/events/" + eventId + "/checkpoints", {
            ...cp,
            sequence: 3,
            distance_m: 1000,
          })
        ).statusCode,
        422,
      );
      assert.equal(
        (
          await request("POST", "/events/" + eventId + "/checkpoints", {
            name: "Chegada",
            kind: "finish",
            sequence: 3,
            distance_m: 5000,
          })
        ).statusCode,
        201,
      );
    });
    await t.test("edições com versão e rollback preservam valores", async () => {
      const e = await state();
      const both = await Promise.all([
        request("PATCH", "/events/" + eventId, {
          ...body,
          name: "Nome A",
          expected_version: e.version,
        }),
        request("PATCH", "/events/" + eventId, {
          ...body,
          name: "Nome B",
          expected_version: e.version,
        }),
      ]);
      assert.deepEqual(both.map((x) => x.statusCode).sort(), [200, 409]);
      const current = await state();
      assert.equal(
        (
          await request("PATCH", "/events/" + eventId, {
            ...body,
            distance_m: 1000,
            expected_version: current.version,
          })
        ).statusCode,
        422,
      );
      assert.equal((await state()).distance_m, 5000);
      assert.equal(
        (await request("POST", "/events", { ...body, local_date: "2026-02-30" })).statusCode,
        422,
      );
      assert.equal(
        (await request("POST", "/events", { ...body, timezone: "Invalid/Zone" })).statusCode,
        422,
      );
    });
    await t.test("estados, congelamento estrutural e largada", async () => {
      async function change(target: string, extra: Record<string, unknown> = {}) {
        const e = await state();
        return request("POST", "/events/" + eventId + "/transitions", {
          target_state: target,
          expected_version: e.version,
          reason: "Teste da operação",
          ...extra,
        });
      }
      assert.equal((await change("ready")).statusCode, 200);
      assert.equal(
        (
          await request("PATCH", "/events/" + eventId, {
            ...body,
            expected_version: (await state()).version,
          })
        ).statusCode,
        409,
      );
      assert.equal((await change("draft")).statusCode, 200);
      assert.equal((await change("ready")).statusCode, 200);
      assert.equal((await change("running")).statusCode, 422);
      const start = new Date(Date.now() - 5000).toISOString();
      assert.equal((await change("running", { gun_start_at: start })).statusCode, 200);
      assert.equal(
        (
          await request("PATCH", "/checkpoints/" + cpId, {
            name: "Alterado",
            kind: "start",
            sequence: 1,
            distance_m: 0,
            active: true,
            expected_version: 0,
          })
        ).statusCode,
        409,
      );
      assert.equal((await change("closed")).statusCode, 200);
      assert.equal((await change("running", { gun_start_at: start })).statusCode, 422);
      assert.equal((await change("running")).statusCode, 200);
      assert.equal((await change("closed")).statusCode, 200);
      assert.equal((await change("finalized")).statusCode, 200);
      assert.equal((await change("closed")).statusCode, 200);
      const windows = await admin.query("SELECT * FROM app.capture_windows WHERE event_id=$1", [
        eventId,
      ]);
      assert.equal(windows.rowCount, 2);
    });
    await t.test("auditoria transacional e sem permissão de edição", async () => {
      const r = await request("GET", "/events/" + eventId + "/audit");
      assert.equal(r.statusCode, 200, r.body);
      assert.ok(r.json().items.length >= 8);
      assert.equal(JSON.stringify(r.json()).includes(password), false);
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        await c.query("SELECT set_config('app.organization_id',$1,true)", [a.org]);
        await assert.rejects(
          c.query("UPDATE app.audit_events SET action='tampered' WHERE organization_id=$1", [
            a.org,
          ]),
          (e) => (e as { code: string }).code === "42501",
        );
        await c.query("ROLLBACK");
      } finally {
        c.release();
      }
    });
    await t.test("recuperação genérica, uso único e invalidação de sessões", async () => {
      const unknown = await request("POST", "/auth/password/forgot", {
        email: "unknown-" + suffix + "@example.test",
      });
      const known = await request("POST", "/auth/password/forgot", { email: a.email });
      assert.deepEqual(known.json(), unknown.json());
      const reset = sent.find((x) => x.email === a.email);
      assert.ok(reset);
      const payload = { token: reset.token, password: "New-password-" + suffix };
      assert.equal((await request("POST", "/auth/password/reset", payload)).statusCode, 200);
      assert.equal((await request("POST", "/auth/password/reset", payload)).statusCode, 400);
      assert.equal((await request("GET", "/auth/me")).statusCode, 401);
      await request("POST", "/auth/password/forgot", { email: a.email });
      const expired = sent.at(-1);
      assert.ok(expired);
      await admin.query(
        "UPDATE app.password_tokens SET expires_at=now()-interval '1 minute' WHERE token_hash=$1",
        [digest(expired.token)],
      );
      assert.equal(
        (await request("POST", "/auth/password/reset", { ...payload, token: expired.token }))
          .statusCode,
        400,
      );
    });
    await t.test("logout revoga a sessão e expiração bloqueia", async () => {
      assert.equal((await request("POST", "/auth/logout", {}, "b")).statusCode, 200);
      assert.equal((await request("GET", "/auth/me", undefined, "b")).statusCode, 401);
      const r = await app.inject({
        method: "POST",
        url: "/api/v1/auth/admin/login",
        headers: { origin },
        payload: { email: b.email, password },
      });
      const cookie = String(r.headers["set-cookie"]).split(";")[0] ?? "";
      const raw = cookie.split("=")[1] ?? "";
      await admin.query(
        "UPDATE app.sessions SET last_seen_at=now()-interval '31 minutes' WHERE token_hash=$1",
        [digest(raw)],
      );
      assert.equal(
        (await app.inject({ url: "/api/v1/auth/me", headers: { cookie } })).statusCode,
        401,
      );
    });
    await t.test("limite de tentativas", async () => {
      const statuses = [];
      for (let i = 0; i < 6; i++)
        statuses.push(
          (
            await app.inject({
              method: "POST",
              url: "/api/v1/auth/admin/login",
              headers: { origin },
              payload: { email: "rate-" + suffix + "@example.test", password: "wrong" },
            })
          ).statusCode,
        );
      assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429]);
    });
  } finally {
    await app.close();
    await pool.end();
    await admin.end();
  }
});
