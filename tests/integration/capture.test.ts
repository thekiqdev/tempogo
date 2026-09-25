import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { buildApp } from "../../apps/api/src/app.js";
import { migrate } from "../../apps/api/src/migrations.js";
import { csrfFor, digest, hashPassword, token } from "../../apps/api/src/security.js";

test("Sprint 02: captura manual, credenciais e concorrência", async (t) => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url && new URL(url).pathname.endsWith("_test"));
  assert.notEqual(new URL(url).pathname, new URL(process.env.DATABASE_URL ?? url).pathname);
  const db = new pg.Pool({ connectionString: url });
  await migrate(db, new URL("../../apps/api/migrations/", import.meta.url));
  const pool = new pg.Pool({
    connectionString: url,
    options: "-c role=cronocheckpoint_app",
    max: 10,
  });
  const origin = "http://127.0.0.1:5173";
  const app = buildApp(async () => {}, false, {
    pool,
    origin,
    secure: false,
    sendReset: async () => {},
  });
  const org = (
    await db.query("INSERT INTO app.organizations(name) VALUES('Capture test') RETURNING id")
  ).rows[0].id;
  const user = (
    await db.query("INSERT INTO app.users(email) VALUES($1) RETURNING id", [
      randomUUID() + "@capture.test",
    ])
  ).rows[0].id;
  await db.query("INSERT INTO app.memberships(organization_id,user_id) VALUES($1,$2)", [org, user]);
  const adminRaw = token();
  await db.query(
    "INSERT INTO app.sessions(token_hash,user_id,organization_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
    [digest(adminRaw), user, org],
  );
  const event = (
    await db.query(
      "INSERT INTO app.events(organization_id,name,local_date,timezone,state,created_by) VALUES($1,'Race',CURRENT_DATE,'UTC','running',$2) RETURNING id",
      [org, user],
    )
  ).rows[0].id;
  const cat = (
    await db.query(
      "INSERT INTO app.race_categories(organization_id,event_id,name,gun_start_at) VALUES($1,$2,'5k',now()) RETURNING id",
      [org, event],
    )
  ).rows[0].id;
  const cp = (
    await db.query(
      "INSERT INTO app.checkpoints(organization_id,event_id,race_category_id,name,kind,sequence) VALUES($1,$2,$3,'Finish','finish',1) RETURNING id",
      [org, event, cat],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO app.capture_windows(organization_id,event_id,opened_at,reason) VALUES($1,$2,now(),'test')",
    [org, event],
  );
  function admin(method: "GET" | "POST", path: string, payload?: unknown) {
    return app.inject({
      method,
      url: "/api/v1" + path,
      headers: { origin, cookie: "cc_session=" + adminRaw, "x-csrf-token": csrfFor(adminRaw) },
      payload: payload as Record<string, unknown>,
    });
  }
  type Identity = { cookie: string; csrf: string; id: string };
  async function login(code: string, password: string): Promise<Identity> {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/field/login",
      headers: { origin },
      payload: { code, password },
    });
    assert.equal(r.statusCode, 200, r.body);
    const cookie = String(r.headers["set-cookie"]).split(";")[0] ?? "";
    assert.match(String(r.headers["set-cookie"]), /HttpOnly/);
    assert.match(String(r.headers["set-cookie"]), /SameSite=Strict/);
    const me = await app.inject({ method: "GET", url: "/api/v1/field/me", headers: { cookie } });
    assert.equal(me.statusCode, 200, me.body);
    return { cookie, csrf: r.json().csrf_token, id: me.json().session_id };
  }
  function field(who: Identity, method: "GET" | "POST", path: string, payload?: unknown) {
    return app.inject({
      method,
      url: "/api/v1/field" + path,
      headers: { origin, cookie: who.cookie, "x-csrf-token": who.csrf },
      payload: payload as Record<string, unknown>,
    });
  }
  let access: { id: string; code: string; password: string }, one: Identity, two: Identity;
  const payload = {
    client_event_id: randomUUID(),
    bib: "00152",
    raw_captured_at: new Date().toISOString(),
  };
  try {
    await t.test("emissão, senha somente uma vez e duas sessões isoladas", async () => {
      const issued = await admin("POST", "/checkpoints/" + cp + "/access", {
        label: "Celular 01",
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      });
      assert.equal(issued.statusCode, 201, issued.body);
      access = issued.json();
      assert.ok(access.password.length >= 12);
      const list = await admin("GET", "/checkpoints/" + cp + "/access");
      assert.equal(list.json().items[0].password, undefined);
      assert.equal(list.json().items[0].password_hash, undefined);
      one = await login(access.code, access.password);
      two = await login(access.code, access.password);
      assert.notEqual(one.id, two.id);
    });
    await t.test(
      "contrato executável, entradas inválidas, sem IA e sem escolha de checkpoint",
      async () => {
        const spec = (await app.inject("/api/v1/capture/openapi.json")).json();
        assert.equal(spec.openapi, "3.0.3");
        assert.equal(
          spec.paths["/api/v1/field/observations"].post.requestBody.content["application/json"]
            .schema.additionalProperties,
          false,
        );
        for (const patch of [
          { bib: "" },
          { bib: "abc" },
          { bib: "123456789" },
          { bib: 152 },
          { source: "ai" },
          { confidence: 0.9 },
          { checkpoint_id: randomUUID() },
          { raw_captured_at: "invalid" },
        ]) {
          const r = await field(one, "POST", "/observations", { ...payload, ...patch });
          assert.equal(r.statusCode, 400, r.body);
        }
        const denied = await app.inject({
          method: "POST",
          url: "/api/v1/field/observations",
          headers: { origin, cookie: one.cookie },
          payload,
        });
        assert.equal(denied.statusCode, 403);
      },
    );
    await t.test("20 requisições concorrentes, commit único e zeros preservados", async () => {
      const responses = await Promise.all(
        Array.from({ length: 20 }, () => field(one, "POST", "/observations", payload)),
      );
      assert.equal(
        responses.filter((r) => r.statusCode === 201).length,
        1,
        responses.map((r) => r.body).join("\n"),
      );
      assert.equal(responses.filter((r) => r.statusCode === 200).length, 19);
      const ids = new Set(responses.map((r) => r.json().id));
      assert.equal(ids.size, 1);
      assert.equal(responses[0]?.json().bib, "00152");
      assert.ok(responses[0]?.json().received_at);
      assert.equal(responses[0]?.json().source, "manual");
      const count = await db.query(
        "SELECT count(*)::int AS n FROM app.observations WHERE event_id=$1",
        [event],
      );
      assert.equal(count.rows[0].n, 1);
      const audits = await db.query(
        "SELECT count(*)::int AS n FROM app.audit_events WHERE action='observation.created' AND details->>'event_id'=$1",
        [event],
      );
      assert.equal(audits.rows[0].n, 1);
    });
    await t.test(
      "resposta perdida e payload divergente, sem revelar registro de outra sessão",
      async () => {
        assert.equal((await field(one, "POST", "/observations", payload)).statusCode, 200);
        assert.equal(
          (await field(one, "POST", "/observations", { ...payload, bib: "999" })).statusCode,
          409,
        );
        assert.equal((await field(two, "POST", "/observations", payload)).statusCode, 409);
        assert.equal((await field(two, "GET", "/observations")).json().items.length, 0);
        assert.equal(
          (
            await app.inject({
              url: "/api/v1/events/" + event + "/observations",
              headers: { cookie: one.cookie },
            })
          ).statusCode,
          401,
        );
      },
    );
    await t.test("intenções humanas concorrentes preservadas e ambas sinalizadas", async () => {
      const bodies = [
        { ...payload, client_event_id: randomUUID(), bib: "00007" },
        { ...payload, client_event_id: randomUUID(), bib: "00007" },
      ];
      const r = await Promise.all(
        bodies.map((b, i) => field(i ? two : one, "POST", "/observations", b)),
      );
      assert.ok(
        r.every((x) => x.statusCode === 201),
        r.map((x) => x.body).join("\n"),
      );
      const flags = await db.query(
        "SELECT count(*)::int AS n FROM app.observation_flags f JOIN app.observations o ON o.id=f.observation_id WHERE o.event_id=$1 AND o.bib='00007'",
        [event],
      );
      assert.equal(flags.rows[0].n, 2);
      const list = await admin("GET", "/events/" + event + "/observations");
      assert.equal(list.statusCode, 200, list.body);
      assert.equal(list.json().items.length, 3);
      assert.equal(
        list.json().items.filter((x: { possible_duplicate: boolean }) => x.possible_duplicate)
          .length,
        2,
      );
    });
    await t.test(
      "imutabilidade e RLS: runtime não edita observações nem lê outro tenant",
      async () => {
        await assert.rejects(
          pool.query("UPDATE app.observations SET bib='9' WHERE event_id=$1", [event]),
          /permission denied/,
        );
        await assert.rejects(
          pool.query("DELETE FROM app.observations WHERE event_id=$1", [event]),
          /permission denied/,
        );
        assert.equal((await pool.query("SELECT * FROM app.observations")).rowCount, 0);
        const other = (
          await db.query(
            "INSERT INTO app.organizations(name) VALUES('Other capture org') RETURNING id",
          )
        ).rows[0].id;
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          await c.query("SELECT set_config('app.organization_id',$1,true)", [other]);
          assert.equal(
            (await c.query("SELECT * FROM app.observations WHERE event_id=$1", [event])).rowCount,
            0,
          );
          await c.query("ROLLBACK");
        } finally {
          c.release();
        }
      },
    );

    await t.test(
      "falha na auditoria desfaz observação e permite retry com o mesmo UUID",
      async () => {
        const trigger = "capture_probe_" + randomUUID().replaceAll("-", "");
        const probe = { ...payload, client_event_id: randomUUID(), bib: "666" };
        await db.query(`CREATE FUNCTION app.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $audit$
       BEGIN IF NEW.action='observation.created' AND NEW.details->>'event_id'=TG_ARGV[0] THEN RAISE EXCEPTION 'simulated audit failure'; END IF; RETURN NEW; END $audit$`);
        try {
          await db.query(
            `CREATE TRIGGER ${trigger} BEFORE INSERT ON app.audit_events FOR EACH ROW EXECUTE FUNCTION app.${trigger}('${event}')`,
          );
          const rejected = await field(one, "POST", "/observations", probe);
          assert.equal(rejected.statusCode, 500, rejected.body);
          assert.equal(
            (
              await db.query("SELECT * FROM app.observations WHERE client_event_id=$1", [
                probe.client_event_id,
              ])
            ).rowCount,
            0,
          );
        } finally {
          await db.query(`DROP TRIGGER IF EXISTS ${trigger} ON app.audit_events`);
          await db.query(`DROP FUNCTION app.${trigger}()`);
        }
        assert.equal((await field(one, "POST", "/observations", probe)).statusCode, 201);
      },
    );
    await t.test("encerramento bloqueia intenção nova, preserva replay já confirmado", async () => {
      await db.query("UPDATE app.events SET state='closed' WHERE id=$1", [event]);
      assert.equal(
        (await field(one, "POST", "/observations", { ...payload, client_event_id: randomUUID() }))
          .statusCode,
        409,
      );
      assert.equal((await field(one, "POST", "/observations", payload)).statusCode, 200);
      await db.query("UPDATE app.events SET state='running' WHERE id=$1", [event]);
    });
    await t.test("expiração e revogação impedem a próxima chamada e novo login", async () => {
      await db.query(
        "UPDATE app.checkpoint_sessions SET expires_at=now()-interval '1 second' WHERE id=$1",
        [two.id],
      );
      assert.equal((await field(two, "GET", "/me")).statusCode, 401);
      assert.equal((await admin("POST", "/access/" + access.id + "/revoke", {})).statusCode, 200);
      assert.equal(
        (await field(one, "POST", "/observations", { ...payload, client_event_id: randomUUID() }))
          .statusCode,
        401,
      );
      const r = await app.inject({
        method: "POST",
        url: "/api/v1/field/login",
        headers: { origin },
        payload: { code: access.code, password: access.password },
      });
      assert.equal(r.statusCode, 401);
    });
    await t.test("limite persistente de tentativas por código", async () => {
      const code = "AB" + randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
      await db.query("INSERT INTO app.auth_limits(key,attempts,window_start) VALUES($1,10,now())", [
        digest("field:" + code),
      ]);
      const r = await app.inject({
        method: "POST",
        url: "/api/v1/field/login",
        headers: { origin },
        payload: { code, password: "invalid" },
      });
      assert.equal(r.statusCode, 429);
    });
  } finally {
    await app.close();
    await pool.end();
    await db.end();
  }
});
