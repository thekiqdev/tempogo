import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { buildApp } from "../../apps/api/src/app.js";
import { migrate } from "../../apps/api/src/migrations.js";
import { assertRuntimeRole } from "../../apps/api/src/runtime-role.js";
import { csrfFor, digest, token } from "../../apps/api/src/security.js";

test("S05: cota por credencial validada, cookies forjados e role de runtime", async () => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url && new URL(url).pathname.endsWith("_test"));
  const db = new pg.Pool({ connectionString: url }),
    pool = new pg.Pool({ connectionString: url, options: "-c role=cronocheckpoint_app" });
  await migrate(db, new URL("../../apps/api/migrations/", import.meta.url));
  const app = buildApp(async () => {}, false, {
    pool,
    origin: "http://127.0.0.1:5173",
    secure: false,
    sendReset: async () => {},
  });
  try {
    await assert.rejects(assertRuntimeRole(db));
    await assertRuntimeRole(pool);
    const org = (
      await db.query("INSERT INTO app.organizations(name) VALUES('Limits test') RETURNING id")
    ).rows[0].id;
    const user = (
      await db.query("INSERT INTO app.users(email) VALUES($1) RETURNING id", [
        randomUUID() + "@limits.test",
      ])
    ).rows[0].id;
    const event = (
      await db.query(
        "INSERT INTO app.events(organization_id,name,local_date,timezone,state,created_by) VALUES($1,'Limits race',CURRENT_DATE,'UTC','running',$2) RETURNING id",
        [org, user],
      )
    ).rows[0].id;
    const cat = (
      await db.query(
        "INSERT INTO app.race_categories(organization_id,event_id,name) VALUES($1,$2,'5k') RETURNING id",
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
    const devices = [];
    for (let i = 0; i < 2; i++) {
      const raw = token(),
        credential = (
          await db.query(
            "INSERT INTO app.checkpoint_credentials(organization_id,event_id,checkpoint_id,code,password_hash,label,expires_at) VALUES($1,$2,$3,$4,'disabled','Device',now()+interval '1 hour') RETURNING id",
            [org, event, cp, randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()],
          )
        ).rows[0].id;
      await db.query(
        "INSERT INTO app.checkpoint_sessions(token_hash,organization_id,event_id,checkpoint_id,credential_id,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '1 hour')",
        [digest(raw), org, event, cp, credential],
      );
      devices.push({ raw, credential });
    }
    const payload = {
      client_event_id: randomUUID(),
      bib: "00123",
      raw_captured_at: new Date().toISOString(),
    };
    const request = (raw: string) =>
      app.inject({
        method: "POST",
        url: "/api/v1/field/observations",
        headers: {
          cookie: "cc_checkpoint=" + raw,
          origin: "http://127.0.0.1:5173",
          "x-csrf-token": csrfFor(raw),
        },
        payload,
      });
    for (let i = 0; i < 600; i++) {
      const r = await request(devices[0]!.raw);
      assert.equal(r.statusCode, i ? 200 : 201, r.body);
    }
    assert.equal((await request(devices[0]!.raw)).statusCode, 429);
    // Same IP, another validated credential is not blocked by the first.
    const second = await app.inject({
      url: "/api/v1/field/me",
      headers: { cookie: "cc_checkpoint=" + devices[1]!.raw },
    });
    assert.equal(second.statusCode, 200);
    await db.query("UPDATE app.checkpoint_credentials SET revoked_at=now() WHERE id=$1", [
      devices[1]!.credential,
    ]);
    assert.equal((await request(devices[1]!.raw)).statusCode, 401);
    for (let i = 0; i < 120; i++) {
      const r = await app.inject({
        url: "/api/v1/field/me",
        remoteAddress: "127.0.0.7",
        headers: { cookie: "cc_checkpoint=" + token() },
      });
      assert.equal(r.statusCode, 401);
    }
    assert.equal(
      (
        await app.inject({
          url: "/api/v1/field/me",
          remoteAddress: "127.0.0.7",
          headers: { cookie: "cc_checkpoint=" + token() },
        })
      ).statusCode,
      429,
    );
  } finally {
    await app.close();
    await pool.end();
    await db.end();
  }
});
