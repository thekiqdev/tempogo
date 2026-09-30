import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { buildApp } from "../../apps/api/src/app.js";
import { migrate } from "../../apps/api/src/migrations.js";
import { csrfFor, digest, token } from "../../apps/api/src/security.js";

test("Voltas e chips: importação, agrupamento e exportação", async (t) => {
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
  async function login(credential = access) {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/field/login",
      headers: { origin },
      payload: { code: credential.code, password: credential.password },
    });
    assert.equal(r.statusCode, 200, r.body);
    return { cookie: String(r.headers["set-cookie"]).split(";")[0]!, csrf: r.json().csrf_token };
  }
  const fieldOne = await login();
  const secondAccess = (
    await admin("POST", "/checkpoints/" + cp + "/access", {
      label: "Independent phone",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    })
  ).json();
  const fieldTwo = await login(secondAccess);
  function field(method: "GET" | "POST", path: string, payload?: unknown, who = fieldOne) {
    return app.inject({
      method,
      url: "/api/v1/field" + path,
      headers: { origin, cookie: who.cookie, "x-csrf-token": who.csrf },
      payload: payload as Record<string, unknown>,
    });
  }
  const base = "/events/" + event;
  try {
    await t.test("importação atômica, duplicidades, conflitos e isolamento", async () => {
      const created = await admin("POST", "/events", {
        name: "Com chips",
        category_name: "Corrida",
        distance_m: 5000,
        local_date: "2026-10-01",
        timezone: "America/Sao_Paulo",
        laps: 3,
        min_lap_seconds: 300,
        chip_mappings: [{ bib: "001", chip: "000000000109000000000001" }],
      });
      assert.equal(created.statusCode, 201, created.body);
      const fresh = "/events/" + created.json().id;
      const eventData = (await admin("GET", fresh)).json();
      assert.equal(eventData.laps, 3);
      assert.equal(eventData.min_lap_seconds, 300);
      assert.equal((await admin("GET", fresh + "/chips")).json().total, 1);
      const rows = [
        { bib: "001", chip: "000000000109000000000001" },
        { bib: "002", chip: "ABC002" },
      ];
      assert.equal((await admin("POST", base + "/chips", { rows })).statusCode, 200);
      assert.equal((await admin("POST", base + "/chips", { rows })).statusCode, 200);
      assert.equal(
        (
          await admin("POST", base + "/chips", {
            rows: [
              { bib: "003", chip: "ABC003" },
              { bib: "004", chip: "ABC002" },
            ],
          })
        ).statusCode,
        409,
      );
      assert.equal((await admin("GET", base + "/chips")).json().total, 2);
      assert.equal(
        (
          await admin("POST", base + "/chips", {
            rows: [
              { bib: "003", chip: "A" },
              { bib: "003", chip: "B" },
            ],
          })
        ).statusCode,
        422,
      );
      assert.equal((await admin("GET", base + "/chips", undefined, other.raw)).statusCode, 404);
      assert.equal((await admin("POST", base + "/chips", { rows }, other.raw)).statusCode, 404);
      const c = await pool.connect();
      try {
        assert.equal(
          (await c.query("SELECT * FROM app.event_chips WHERE event_id=$1", [event])).rowCount,
          0,
        );
      } finally {
        c.release();
      }
    });
    await t.test(
      "10s inclusivos, intervalo por volta, atrasados, filtros e originais",
      async () => {
        await db.query("UPDATE app.events SET laps=2,min_lap_seconds=60 WHERE id=$1", [event]);
        const session = (
          await db.query(
            "SELECT * FROM app.checkpoint_sessions WHERE credential_id=$1 AND revoked_at IS NULL",
            [access.id],
          )
        ).rows[0];
        const time = Date.now() - 200000;
        const ids: Record<number, string> = {};
        for (const delta of [120, 60, 10, 0, 11, 59]) {
          const r = await db.query(
            `INSERT INTO app.observations(organization_id,event_id,checkpoint_id,session_id,device_id,client_event_id,bib,raw_captured_at,canonical_payload) VALUES($1,$2,$3,$4,$5,$6,'001',$7,'{}') RETURNING id`,
            [
              one.org,
              event,
              cp,
              session.id,
              access.device_id,
              randomUUID(),
              new Date(time + delta * 1000),
            ],
          );
          ids[delta] = r.rows[0].id;
        }
        const r = await admin("GET", base + "/observations?view=consolidated&bib=001");
        assert.equal(r.statusCode, 200, r.body);
        const items = r.json().items;
        const first = items.find((i: { id: string }) => i.id === ids[0]);
        assert.equal(first.observation_count, 2);
        assert.equal(first.lap_number, 1);
        assert.equal(first.chip, "000000000109000000000001");
        assert.equal(items.find((i: { id: string }) => i.id === ids[11]).lap_too_soon, true);
        // Group at 59 seconds contains the capture at 60; earliest capture remains authoritative.
        assert.equal(items.find((i: { id: string }) => i.id === ids[59]).lap_number, 1);
        assert.equal(items.find((i: { id: string }) => i.id === ids[120]).lap_number, 2);
        const originals = (await admin("GET", base + "/observations?view=records&bib=001")).json()
          .items;
        assert.equal(originals.length, 6);
        assert.equal(originals.find((i: { id: string }) => i.id === ids[10]).lap_number, 1);
        const filtered = (
          await admin(
            "GET",
            base +
              "/observations?view=consolidated&from=" +
              encodeURIComponent(new Date(time + 100000).toISOString()) +
              "&limit=1",
          )
        ).json();
        assert.equal(filtered.items[0].lap_number, 2);
        const txt = await admin("GET", base + "/observations.txt?view=consolidated&bib=001");
        assert.equal(txt.statusCode, 200, txt.body);
        assert.ok(txt.body.startsWith("000000000109000000000001;"));
        const csv = await admin("GET", base + "/observations.csv?bib=001");
        assert.ok(csv.body.includes('"chip"'));
        assert.ok(csv.body.includes('"lap_number"'));
        const d = (await admin("GET", base + "/observations/" + ids[0])).json().observation;
        const revised = await admin("POST", base + "/observations/" + ids[0] + "/revisions", {
          request_id: randomUUID(),
          expected_version: d.version,
          expected_evidence: d.evidence_version,
          bib: d.effective_bib,
          captured_at: d.effective_captured_at,
          disposition: "invalidated",
          reason: "Conferência de teste",
        });
        assert.equal(revised.statusCode, 200, revised.body);
        const after = (await admin("GET", base + "/observations?view=consolidated&bib=001")).json()
          .items;
        assert.equal(after.find((i: { id: string }) => i.id === ids[0]).lap_number, null);
        assert.equal(after.find((i: { id: string }) => i.id === ids[10]).lap_number, 1);
      },
    );
    await t.test("intervalo exato avança volta e excedentes permanecem registrados", async () => {
      const session = (
        await db.query(
          "SELECT * FROM app.checkpoint_sessions WHERE credential_id=$1 AND revoked_at IS NULL",
          [access.id],
        )
      ).rows[0];
      const start = Date.now() - 300000;
      for (const delta of [0, 60, 120])
        await db.query(
          `INSERT INTO app.observations(organization_id,event_id,checkpoint_id,session_id,device_id,client_event_id,bib,raw_captured_at,canonical_payload) VALUES($1,$2,$3,$4,$5,$6,'009',$7,'{}')`,
          [
            one.org,
            event,
            cp,
            session.id,
            access.device_id,
            randomUUID(),
            new Date(start + delta * 1000),
          ],
        );
      const response = await admin("GET", base + "/observations?view=consolidated&bib=009");
      assert.equal(response.statusCode, 200, response.body);
      const rows = response
        .json()
        .items.sort(
          (a: { lap_number: number }, b: { lap_number: number }) => a.lap_number - b.lap_number,
        );
      assert.deepEqual(
        rows.map((r: { lap_number: number }) => r.lap_number),
        [1, 2, 3],
      );
      assert.equal(rows[1].lap_too_soon, false);
      assert.equal(rows[2].lap_exceeded, true);
    });
    await t.test("não importar em evento finalizado", async () => {
      await db.query("UPDATE app.events SET state='finalized' WHERE id=$1", [event]);
      assert.equal(
        (await admin("POST", base + "/chips", { rows: [{ bib: "007", chip: "XYZ" }] })).statusCode,
        409,
      );
    });
  } finally {
    await app.close();
    await pool.end();
    await db.end();
  }
});
