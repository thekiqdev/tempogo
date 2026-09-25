import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { type CapturePayload, orderedPayload } from "@tempogo/contracts";
import pg from "pg";
import { buildApp } from "../../apps/api/src/app.js";
import { migrate } from "../../apps/api/src/migrations.js";
import { csrfFor, digest, hashPassword, token } from "../../apps/api/src/security.js";

test("Sprint 03: concessões, sincronização e recuperação", async (t) => {
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

  let grant: { id: string; expires_at: string }, first: CapturePayload, recovered: CapturePayload;
  function body(bib: string): CapturePayload {
    return {
      client_event_id: randomUUID(),
      bib,
      raw_captured_at: new Date().toISOString(),
      capture_session_id: one.id,
      grant_id: grant.id,
      clock: { offset_ms: 0, rtt_ms: 10, measured_at: new Date().toISOString(), uncertain: false },
    };
  }
  const entry = (p: CapturePayload) => ({
    payload: p,
    sha256: digest(JSON.stringify(orderedPayload(p))),
  });
  const recover = (items: CapturePayload[]) =>
    admin("POST", "/events/" + event + "/recovery", {
      reason: "Recovery test with mandatory review",
      package: { version: 1, event_id: event, checkpoint_id: cp, items: items.map(entry) },
    });

  try {
    await t.test("preparação online em janela ativa e concessão limitada", async () => {
      const issued = await admin("POST", "/checkpoints/" + cp + "/access", {
        label: "Offline test",
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      });
      assert.equal(issued.statusCode, 201, issued.body);
      access = issued.json();
      one = await login(access.code, access.password);
      const prepared = await field(one, "POST", "/prepare", {});
      assert.equal(prepared.statusCode, 200, prepared.body);
      grant = prepared.json().grant;
      assert.ok(Date.parse(grant.expires_at) - Date.now() <= 3600000);
      const time = await field(one, "GET", "/time");
      assert.equal(time.statusCode, 200);
      assert.ok(Date.parse(time.json().server_time));
    });
    await t.test("sync idempotente preserva relógio bruto e estimado", async () => {
      const p = body("000123");
      first = p;
      const all = await Promise.all(
        Array.from({ length: 20 }, () => field(one, "POST", "/sync", p)),
      );
      assert.equal(
        all.filter((r) => r.statusCode === 201).length,
        1,
        all.map((r) => r.body).join("\n"),
      );
      assert.equal(new Set(all.map((r) => r.json().id)).size, 1);
      assert.equal(all[0].json().raw_captured_at, p.raw_captured_at);
      assert.ok(all[0].json().estimated_captured_at);
      assert.equal((await field(one, "POST", "/sync", { ...p, bib: "123" })).statusCode, 409);
      assert.equal((await field(one, "POST", "/sync", { ...p, source: "ai" })).statusCode, 400);
    });
    await t.test("heartbeat ausente/antigo não afirma fila vazia", async () => {
      let r = await admin("GET", "/events/" + event + "/devices");
      assert.equal(r.json().items[0].stale, true);
      assert.equal(r.json().items[0].pending, null);
      assert.equal(
        (
          await field(one, "POST", "/heartbeat", {
            pending: 100,
            sending: 1,
            synced: 20,
            blocked: 3,
          })
        ).statusCode,
        200,
      );
      r = await admin("GET", "/events/" + event + "/devices");
      assert.equal(r.json().items[0].pending, 100);
      assert.equal(r.json().items[0].stale, false);
      await db.query(
        "UPDATE app.device_status SET last_seen_at=now()-interval '3 minutes' WHERE organization_id=$1",
        [org],
      );
      assert.equal(
        (await admin("GET", "/events/" + event + "/devices")).json().items[0].stale,
        true,
      );
    });
    await t.test(
      "sessão renovada mantém UUID/escopo antigo; outra credencial não pode assumir fila",
      async () => {
        await db.query(
          "UPDATE app.checkpoint_sessions SET expires_at=now()-interval '1 second' WHERE id=$1",
          [one.id],
        );
        two = await login(access.code, access.password);
        assert.equal((await field(two, "POST", "/sync", first)).statusCode, 200);
        const issued = await admin("POST", "/checkpoints/" + cp + "/access", {
          label: "Other device",
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        });
        const other = await login(issued.json().code, issued.json().password);
        assert.equal((await field(other, "POST", "/sync", body("555"))).statusCode, 403);
      },
    );
    await t.test("salto, referência antiga e concessão vencida sempre em revisão", async () => {
      for (const clock of [
        { ...first.clock, uncertain: true },
        { ...first.clock, rtt_ms: 1500 },
        { ...first.clock, measured_at: new Date(Date.now() - 600000).toISOString() },
      ]) {
        const p = { ...body("777"), clock };
        const r = await field(two, "POST", "/sync", p);
        assert.equal(r.statusCode, 201, r.body);
        assert.equal(r.json().needs_review, true);
      }
      await db.query(
        "UPDATE app.capture_grants SET expires_at=now()-interval '1 second' WHERE id=$1",
        [grant.id],
      );
      const r = await field(two, "POST", "/sync", body("778"));
      assert.equal(r.statusCode, 201, r.body);
      assert.equal(r.json().needs_review, true);
    });
    await t.test(
      "fechado recebe em revisão; reabertura não valida automaticamente janela anterior",
      async () => {
        await db.query("UPDATE app.events SET state='closed' WHERE id=$1", [event]);
        await db.query(
          "UPDATE app.capture_windows SET closed_at=now() WHERE event_id=$1 AND closed_at IS NULL",
          [event],
        );
        const r = await field(two, "POST", "/sync", body("888"));
        assert.equal(r.statusCode, 201, r.body);
        assert.equal(r.json().needs_review, true);
        await db.query("UPDATE app.events SET state='running' WHERE id=$1", [event]);
        await db.query(
          "INSERT INTO app.capture_windows(organization_id,event_id,opened_at,reason) VALUES($1,$2,now(),'reopen test')",
          [org, event],
        );
        const reopened = await field(two, "POST", "/sync", body("889"));
        assert.equal(reopened.statusCode, 201);
        assert.equal(reopened.json().needs_review, true);
      },
    );
    await t.test(
      "revogação bloqueia automático; recuperação administrativa preserva conteúdo e exige revisão",
      async () => {
        assert.equal((await admin("POST", "/access/" + access.id + "/revoke", {})).statusCode, 200);
        const p = body("009999");
        recovered = p;
        assert.equal((await field(two, "GET", "/me")).statusCode, 401);
        assert.equal((await field(two, "POST", "/sync", p)).statusCode, 401);
        const r = await recover([p]);
        assert.equal(r.statusCode, 200, r.body);
        assert.equal(r.json().items[0].needs_review, true);
        const again = await recover([p]);
        assert.equal(again.statusCode, 200, again.body);
        assert.equal(again.json().items[0].replayed, true);
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::int n FROM app.observations WHERE client_event_id=$1",
              [p.client_event_id],
            )
          ).rows[0].n,
          1,
        );
        const evidence = (
          await db.query(
            "SELECT details FROM app.audit_events WHERE action='observation.recovered' AND resource_id=$1",
            [r.json().items[0].id],
          )
        ).rows[0];
        assert.ok(evidence.details.reason);
      },
    );
    await t.test(
      "pacote sem autoridade: hash inválido, sessão estrangeira, escopo e rollback por lote",
      async () => {
        const p = body("990"),
          q = body("991");
        const r = await admin("POST", "/events/" + event + "/recovery", {
          reason: "Test malformed batch atomically",
          package: {
            version: 1,
            event_id: event,
            checkpoint_id: cp,
            items: [entry(p), { ...entry(q), sha256: "0".repeat(64) }],
          },
        });
        assert.equal(r.statusCode, 422, r.body);
        assert.equal(
          (
            await db.query("SELECT * FROM app.observations WHERE client_event_id=$1", [
              p.client_event_id,
            ])
          ).rowCount,
          0,
        );
        assert.equal((await recover([{ ...p, capture_session_id: randomUUID() }])).statusCode, 403);
        assert.equal((await recover([{ ...recovered, bib: "888888" }])).statusCode, 409);
        const wrong = await admin("POST", "/events/" + randomUUID() + "/recovery", {
          reason: "Wrong event test",
          package: { version: 1, event_id: event, checkpoint_id: cp, items: [entry(p)] },
        });
        assert.equal(wrong.statusCode, 422);
      },
    );
    await t.test("finalizado/arquivado rejeita recuperação sem alterar registros", async () => {
      for (const state of ["finalized", "archived"]) {
        await db.query("UPDATE app.events SET state=$2 WHERE id=$1", [event, state]);
        assert.equal((await recover([body("999")])).statusCode, 409);
      }
    });
  } finally {
    await app.close();
    await pool.end();
    await db.end();
  }
});
