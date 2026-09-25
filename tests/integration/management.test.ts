import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { buildApp } from "../../apps/api/src/app.js";
import { csvCell } from "../../apps/api/src/management.js";
import { migrate } from "../../apps/api/src/migrations.js";
import { csrfFor, digest, token } from "../../apps/api/src/security.js";

test("Sprint 04: revisão, exportação e conciliação", async (t) => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url && new URL(url).pathname.endsWith("_test"));
  const db = new pg.Pool({ connectionString: url });
  await migrate(db, new URL("../../apps/api/migrations/", import.meta.url));
  const pool = new pg.Pool({
    connectionString: url,
    options: "-c role=cronocheckpoint_app",
    max: 10,
  });
  const origin = "http://127.0.0.1:5173",
    app = buildApp(async () => {}, false, {
      pool,
      origin,
      secure: false,
      sendReset: async () => {},
    });
  async function identity() {
    const org = (
      await db.query("INSERT INTO app.organizations(name) VALUES('Review test') RETURNING id")
    ).rows[0].id;
    const user = (
      await db.query("INSERT INTO app.users(email) VALUES($1) RETURNING id", [
        randomUUID() + "@review.test",
      ])
    ).rows[0].id;
    await db.query("INSERT INTO app.memberships(organization_id,user_id) VALUES($1,$2)", [
      org,
      user,
    ]);
    const raw = token();
    await db.query(
      "INSERT INTO app.sessions(token_hash,user_id,organization_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
      [digest(raw), user, org],
    );
    return { org, user, raw };
  }
  const one = await identity(),
    other = await identity();
  function admin(method: "GET" | "POST", path: string, payload?: unknown, raw = one.raw) {
    return app.inject({
      method,
      url: "/api/v1" + path,
      headers: { origin, cookie: "cc_session=" + raw, "x-csrf-token": csrfFor(raw) },
      payload: payload as Record<string, unknown>,
    });
  }
  const event = (
    await db.query(
      "INSERT INTO app.events(organization_id,name,local_date,timezone,state,created_by) VALUES($1,'Race',CURRENT_DATE,'America/Sao_Paulo','running',$2) RETURNING id",
      [one.org, one.user],
    )
  ).rows[0].id;
  const cat = (
    await db.query(
      "INSERT INTO app.race_categories(organization_id,event_id,name) VALUES($1,$2,'5k') RETURNING id",
      [one.org, event],
    )
  ).rows[0].id;
  const cp = (
    await db.query(
      "INSERT INTO app.checkpoints(organization_id,event_id,race_category_id,name,kind,sequence) VALUES($1,$2,$3,$4,'finish',1) RETURNING id",
      [one.org, event, cat, ' =HYPERLINK("danger")'],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO app.capture_windows(organization_id,event_id,opened_at,reason) VALUES($1,$2,now(),'test')",
    [one.org, event],
  );
  const access = (
    await admin("POST", "/checkpoints/" + cp + "/access", {
      label: "Phone",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    })
  ).json();
  async function login() {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/field/login",
      headers: { origin },
      payload: { code: access.code, password: access.password },
    });
    assert.equal(r.statusCode, 200, r.body);
    return { cookie: String(r.headers["set-cookie"]).split(";")[0]!, csrf: r.json().csrf_token };
  }
  const fieldOne = await login(),
    fieldTwo = await login();
  function field(method: "GET" | "POST", path: string, payload?: unknown, who = fieldOne) {
    return app.inject({
      method,
      url: "/api/v1/field" + path,
      headers: { origin, cookie: who.cookie, "x-csrf-token": who.csrf },
      payload: payload as Record<string, unknown>,
    });
  }
  const obs = (
    await field("POST", "/observations", {
      client_event_id: randomUUID(),
      bib: "00012",
      raw_captured_at: new Date().toISOString(),
    })
  ).json();
  assert.ok(obs.id);
  const base = "/events/" + event,
    detail = () => admin("GET", base + "/observations/" + obs.id);
  async function revision(patch: Record<string, unknown> = {}) {
    const o = (await detail()).json().observation;
    return {
      request_id: randomUUID(),
      expected_version: o.version,
      expected_evidence: o.evidence_version,
      bib: o.effective_bib,
      captured_at: o.effective_captured_at,
      disposition: "accepted",
      reason: "Conferido com operador",
      ...patch,
    };
  }
  async function transition(state: string, extra: Record<string, unknown> = {}) {
    const e = (await admin("GET", base)).json();
    return admin("POST", base + "/transitions", {
      target_state: state,
      expected_version: e.version,
      reason: "Conferência administrativa",
      ...extra,
    });
  }
  try {
    await t.test("filtros, paginação, CSV e isolamento entre organizações", async () => {
      const r = await admin("GET", base + "/observations?bib=00012&limit=1&offset=0");
      assert.equal(r.statusCode, 200, r.body);
      assert.equal(r.json().total, 1);
      assert.equal(r.json().items[0].bib, "00012");
      assert.equal((await admin("GET", base + "/observations?offset=1")).json().items.length, 0);
      assert.equal((await admin("GET", base + "/observations?bib=12")).json().total, 0);
      for (const suffix of [
        "/observations",
        "/observations.csv",
        "/observations/" + obs.id,
        "/audit",
        "/reconciliation",
      ]) {
        assert.equal((await admin("GET", base + suffix, undefined, other.raw)).statusCode, 404);
      }
      assert.equal((await admin("GET", base + "/observations?limit=0")).statusCode, 422);
      const csv = await admin("GET", base + "/observations.csv?bib=00012");
      assert.equal(csv.statusCode, 200, csv.body);
      assert.ok(csv.body.includes('"00012"'));
      assert.ok(csv.body.includes('"\' =HYPERLINK(""danger"")"'));
      assert.ok(csv.body.includes("America/Sao_Paulo"));
      for (const attack of ["=1+1", " +SUM(1)", "\t@SUM(1)", "-2+3", "\r=CMD()"])
        assert.ok(csvCell(attack).startsWith("\"'"));
    });
    await t.test("pedido do operador é restrito à própria sessão e idempotente", async () => {
      const v = { request_id: randomUUID(), reason: "Número digitado incorretamente" };
      assert.equal(
        (await field("POST", "/observations/" + obs.id + "/review-requests", v, fieldTwo))
          .statusCode,
        404,
      );
      for (let i = 0; i < 2; i++)
        assert.equal(
          (await field("POST", "/observations/" + obs.id + "/review-requests", v)).statusCode,
          200,
        );
      assert.equal((await detail()).json().requests.length, 1);
      assert.equal((await detail()).json().observation.status, "pending");
    });
    await t.test("revisão concorrente, original imutável e repetição após timeout", async () => {
      const v = await revision({ bib: "00999" });
      const responses = await Promise.all(
        Array.from({ length: 10 }, () =>
          admin("POST", base + "/observations/" + obs.id + "/revisions", v),
        ),
      );
      for (const r of responses) assert.equal(r.statusCode, 200, r.body);
      assert.equal(responses.filter((r) => !r.json().replayed).length, 1);
      const d = (await detail()).json();
      assert.equal(d.observation.bib, "00012");
      assert.equal(d.observation.effective_bib, "00999");
      assert.equal(d.observation.status, "accepted");
      assert.equal(d.revisions.length, 1);
      assert.equal(
        (await admin("POST", base + "/observations/" + obs.id + "/revisions", { ...v, bib: "111" }))
          .statusCode,
        409,
      );
      const concurrent = await revision();
      const races = await Promise.all([
        admin("POST", base + "/observations/" + obs.id + "/revisions", concurrent),
        admin("POST", base + "/observations/" + obs.id + "/revisions", {
          ...concurrent,
          request_id: randomUUID(),
          disposition: "invalidated",
        }),
      ]);
      assert.deepEqual(races.map((r) => r.statusCode).sort(), [200, 409]);
    });
    await t.test("novas evidências exigem releitura antes da decisão", async () => {
      const stale = await revision();
      await field("POST", "/observations/" + obs.id + "/review-requests", {
        request_id: randomUUID(),
        reason: "Nova informação do operador",
      });
      assert.equal((await detail()).json().observation.status, "pending");
      assert.equal(
        (await admin("POST", base + "/observations/" + obs.id + "/revisions", stale)).statusCode,
        409,
      );
      const v = await revision({ disposition: "invalidated" });
      assert.equal(
        (await admin("POST", base + "/observations/" + obs.id + "/revisions", v)).statusCode,
        200,
      );
      assert.equal((await admin("GET", base + "/observations?status=invalidated")).json().total, 1);
      assert.equal((await admin("GET", base + "/observations?bib=00999")).json().total, 1);
    });
    await t.test(
      "duplicata e recuperação resolvidas preservam flags e corrigem horário",
      async () => {
        await db.query(
          "INSERT INTO app.observation_flags(organization_id,observation_id,reason) VALUES($1,$2,'possible_duplicate'),($1,$2,'recovery')",
          [one.org, obs.id],
        );
        assert.equal((await detail()).json().observation.status, "pending");
        const original = (await detail()).json().observation.raw_captured_at;
        const corrected = new Date(Date.parse(original) - 10000).toISOString();
        const response = await admin(
          "POST",
          base + "/observations/" + obs.id + "/revisions",
          await revision({ captured_at: corrected }),
        );
        assert.equal(response.statusCode, 200, response.body);
        const d = (await detail()).json();
        assert.equal(d.observation.effective_captured_at, corrected);
        assert.equal(d.observation.raw_captured_at, original);
        assert.equal(d.observation.status, "accepted");
        assert.equal(d.flags.length, 2);
        assert.equal((await field("GET", "/observations")).json().items[0].needs_review, false);
      },
    );
    await t.test(
      "falha de auditoria desfaz revisão e permite repetir o mesmo identificador",
      async () => {
        const fn = "review_fail_" + randomUUID().replaceAll("-", "");
        const v = await revision(),
          before = (await detail()).json().revisions.length;
        await db.query(
          `CREATE FUNCTION app.${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.organization_id='${one.org}'::uuid AND NEW.action='observation.revised' THEN RAISE EXCEPTION 'test'; END IF; RETURN NEW; END $$`,
        );
        await db.query(
          `CREATE TRIGGER ${fn} BEFORE INSERT ON app.audit_events FOR EACH ROW EXECUTE FUNCTION app.${fn}()`,
        );
        try {
          assert.equal(
            (await admin("POST", base + "/observations/" + obs.id + "/revisions", v)).statusCode,
            500,
          );
          assert.equal((await detail()).json().revisions.length, before);
        } finally {
          await db.query(`DROP TRIGGER ${fn} ON app.audit_events`);
          await db.query(`DROP FUNCTION app.${fn}()`);
        }
        assert.equal(
          (await admin("POST", base + "/observations/" + obs.id + "/revisions", v)).statusCode,
          200,
        );
        assert.equal((await detail()).json().revisions.length, before + 1);
      },
    );
    await t.test("revisões e pedidos protegidos contra alteração pelo runtime", async () => {
      for (const table of ["observation_revisions", "review_requests", "device_reconciliations"]) {
        await assert.rejects(
          pool.query("DELETE FROM app." + table),
          (e) => (e as { code: string }).code === "42501",
        );
        await assert.rejects(
          pool.query("UPDATE app." + table + " SET reason='changed'"),
          (e) => (e as { code: string }).code === "42501",
        );
        assert.equal((await pool.query("SELECT * FROM app." + table)).rowCount, 0);
      }
    });
    await t.test("conciliação exige evento fechado e comunicação sem pendências", async () => {
      assert.equal((await transition("finalized")).statusCode, 409);
      assert.equal((await transition("closed")).statusCode, 200);
      const e = (await admin("GET", base)).json(),
        v = {
          credential_id: access.id,
          expected_version: e.version,
          reason: "Fila conferida com operador",
        };
      assert.equal((await admin("POST", base + "/reconciliation", v)).statusCode, 409);
      await field("POST", "/heartbeat", { pending: 1, sending: 0, synced: 1, blocked: 0 });
      assert.equal((await admin("POST", base + "/reconciliation", v)).statusCode, 409);
      await field("POST", "/heartbeat", { pending: 0, sending: 0, synced: 1, blocked: 0 });
      assert.equal((await admin("POST", base + "/reconciliation", v)).statusCode, 200);
      assert.equal((await admin("GET", base + "/reconciliation")).json().items[0].reconciled, true);
      await field("POST", "/heartbeat", { pending: 1, sending: 0, synced: 1, blocked: 0 });
      assert.equal(
        (await admin("GET", base + "/reconciliation")).json().items[0].reconciled,
        false,
      );
    });
    await t.test(
      "finalização bloqueia pendências; exceção, captura e reabertura auditadas",
      async () => {
        assert.equal((await transition("finalized")).statusCode, 409);
        await field("POST", "/observations/" + obs.id + "/review-requests", {
          request_id: randomUUID(),
          reason: "Verificação final pendente",
        });
        assert.equal(
          (await transition("finalized", { exception_reason: "Aparelho perdido pela equipe" }))
            .statusCode,
          409,
        );
        assert.equal(
          (await admin("POST", base + "/observations/" + obs.id + "/revisions", await revision()))
            .statusCode,
          200,
        );
        assert.equal(
          (await transition("finalized", { exception_reason: "Aparelho perdido pela equipe" }))
            .statusCode,
          200,
        );
        assert.equal(
          (
            await field("POST", "/observations", {
              client_event_id: randomUUID(),
              bib: "1",
              raw_captured_at: new Date().toISOString(),
            })
          ).statusCode,
          409,
        );
        assert.equal(
          (await admin("POST", base + "/observations/" + obs.id + "/revisions", await revision()))
            .statusCode,
          409,
        );
        assert.equal((await transition("closed")).statusCode, 200);
        assert.equal(
          (await admin("GET", base + "/reconciliation")).json().items[0].reconciled,
          false,
        );
        const history = (await admin("GET", base + "/audit?limit=100")).json();
        assert.ok(
          history.items.some((a: { action: string }) => a.action === "event.finalization_checked"),
        );
        assert.ok(
          history.items.some((a: { action: string }) => a.action === "observation.revised"),
        );
        assert.equal(JSON.stringify(history).includes(access.password), false);
        assert.equal((await admin("GET", base + "/audit?limit=1")).json().items.length, 1);
      },
    );
  } finally {
    await app.close();
    await pool.end();
    await db.end();
  }
});
