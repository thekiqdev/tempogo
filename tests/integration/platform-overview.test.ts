import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { buildApp } from "../../apps/api/src/app.js";
import { migrate } from "../../apps/api/src/migrations.js";
import type { PlatformOptions } from "../../apps/api/src/platform.js";
import { newTotpSecret, platformCipher } from "../../apps/api/src/platform-crypto.js";
import { csrfFor, digest, hashPassword, token } from "../../apps/api/src/security.js";

test("SA05: indicadores e auditoria administrativa", async (t) => {
  const source = process.env.TEST_DATABASE_URL;
  assert.ok(source && new URL(source).pathname.endsWith("_test"));
  const name = "cc_sa05_" + randomUUID().replaceAll("-", "") + "_test",
    admin = new pg.Pool({ connectionString: source });
  await admin.query('CREATE DATABASE "' + name + '"');
  const url = new URL(source);
  url.pathname = "/" + name;
  const db = new pg.Pool({ connectionString: url.href }),
    pool = new pg.Pool({ connectionString: url.href, options: "-c role=cronocheckpoint_app" }),
    platform = new pg.Pool({
      connectionString: url.href,
      options: "-c role=cronocheckpoint_platform",
    });
  await migrate(db, new URL("../../apps/api/migrations/", import.meta.url));
  const password = "SA04-test-password-123",
    key = "ac".repeat(32),
    actor = (
      await db.query(
        "INSERT INTO app.users(email,password_hash) VALUES('first@sa04.test',$1) RETURNING id",
        [await hashPassword(password)],
      )
    ).rows[0].id;
  await db.query("INSERT INTO app.platform_privileges(user_id,state) VALUES($1,'active')", [actor]);
  await db.query("INSERT INTO app.platform_mfa(user_id,secret_cipher) VALUES($1,$2)", [
    actor,
    platformCipher(key).seal(newTotpSecret(), actor),
  ]);
  const raw = token();
  await db.query(
    "INSERT INTO app.platform_sessions(token_hash,user_id,auth_version,expires_at,reauthenticated_until) VALUES($1,$2,0,now()+interval '1 hour',now()+interval '5 minutes')",
    [digest(raw), actor],
  );
  const sent: { email: string; raw: string; kind: string }[] = [],
    origin = "http://127.0.0.1:5173";
  const options: PlatformOptions = {
    pool: platform,
    key,
    origin,
    secure: false,
    sendMail: async (email, raw, kind) => {
      sent.push({ email, raw, kind });
    },
  };
  const app = buildApp(async () => {}, false, {
    pool,
    origin,
    secure: false,
    sendReset: async () => {},
    platform: options,
  });
  const call = (path: string, body?: unknown) =>
    app.inject({
      method: body === undefined ? "GET" : "POST",
      url: "/api/v1/platform" + path,
      headers: {
        origin,
        cookie: "cc_platform_session=" + raw,
        "x-csrf-token": csrfFor(raw),
        "idempotency-key": randomUUID(),
      },
      payload: body,
    });
  try {
    await t.test("totais, contagens RLS, paginação e isolamento", async () => {
      const a = (
        await db.query("INSERT INTO app.organizations(name) VALUES('Métricas A') RETURNING id")
      ).rows[0].id;
      const b = (
        await db.query(
          "INSERT INTO app.organizations(name,active,status) VALUES('Métricas B',false,'suspended') RETURNING id",
        )
      ).rows[0].id;
      const event = (
        await db.query(
          "INSERT INTO app.events(organization_id,name,local_date,timezone,state,created_by) VALUES($1,'Corrida teste',CURRENT_DATE,'UTC','running',$2) RETURNING id",
          [a, actor],
        )
      ).rows[0].id;
      const category = (
        await db.query(
          "INSERT INTO app.race_categories(organization_id,event_id,name) VALUES($1,$2,'5km') RETURNING id",
          [a, event],
        )
      ).rows[0].id;
      const checkpoint = (
        await db.query(
          "INSERT INTO app.checkpoints(organization_id,event_id,race_category_id,name,kind,sequence) VALUES($1,$2,$3,'Chegada','finish',1) RETURNING id",
          [a, event, category],
        )
      ).rows[0].id;
      const credential = (
        await db.query(
          "INSERT INTO app.checkpoint_credentials(organization_id,event_id,checkpoint_id,code,password_hash,label,expires_at) VALUES($1,$2,$3,'ABCDEF12','synthetic','Teste',now()+interval '1 hour') RETURNING id,device_id",
          [a, event, checkpoint],
        )
      ).rows[0];
      const session = (
        await db.query(
          "INSERT INTO app.checkpoint_sessions(token_hash,organization_id,event_id,checkpoint_id,credential_id,expires_at) VALUES('synthetic',$1,$2,$3,$4,now()+interval '1 hour') RETURNING id",
          [a, event, checkpoint, credential.id],
        )
      ).rows[0].id;
      await db.query(
        "INSERT INTO app.observations(organization_id,event_id,checkpoint_id,session_id,device_id,client_event_id,bib,raw_captured_at,canonical_payload) VALUES($1,$2,$3,$4,$5,$6,'0001',now(),'{}')",
        [a, event, checkpoint, session, credential.device_id, randomUUID()],
      );
      const one = await call("/overview");
      assert.equal(one.statusCode, 200, one.body);
      assert.equal(one.json().users, 1);
      assert.equal(one.json().organizations.length, 2);
      const first = await call("/organization-metrics?limit=1");
      assert.equal(first.statusCode, 200, first.body);
      assert.equal(first.json().items.length, 1);
      assert.ok(first.json().next_cursor);
      const second = await call("/organization-metrics?limit=1&cursor=" + first.json().next_cursor);
      assert.equal(second.json().items.length, 1);
      assert.notEqual(first.json().items[0].id, second.json().items[0].id);
      const metrics = [...first.json().items, ...second.json().items];
      assert.deepEqual(
        [
          metrics.find((x) => x.id === a).events,
          metrics.find((x) => x.id === a).running_events,
          metrics.find((x) => x.id === a).checkpoints,
          metrics.find((x) => x.id === a).observations,
        ],
        [1, 1, 1, 1],
      );
      assert.equal(metrics.find((x) => x.id === b).observations, 0);
      assert.equal(
        (await platform.query("SELECT count(*)::int n FROM app.observations")).rows[0].n,
        0,
      );
      assert.equal((await app.inject({ url: "/api/v1/platform/overview" })).statusCode, 401);
      assert.equal((await call("/organization-metrics?limit=26")).statusCode, 422);
      await db.query(
        "INSERT INTO app.platform_audit(actor_id,organization_id,action,request_id,details,created_at) VALUES($1,$2,'test.action','test-1','{}','2026-09-23T10:00:00.123456Z'),($1,$2,'test.action','test-2','{}','2026-09-23T10:00:00.123456Z'),($1,$3,'test.other','test-3','{}','2026-09-23T10:00:00.123455Z')",
        [actor, a, b],
      );
      const filter = "/audit?from=2026-09-23T00:00:00Z&to=2026-09-24T00:00:00Z&limit=1";
      const pages = [];
      let cursor = "";
      do {
        const r = await call(filter + (cursor ? "&cursor=" + cursor : ""));
        assert.equal(r.statusCode, 200, r.body);
        pages.push(...r.json().items);
        cursor = r.json().next_cursor;
      } while (cursor);
      assert.equal(pages.length, 3);
      assert.equal(new Set(pages.map((x) => x.id)).size, 3);
      const r = await call(
        filter + "&actor_id=" + actor + "&organization_id=" + a + "&action=test.action",
      );
      assert.equal(r.json().items[0].organization_id, a);
      assert.equal(r.json().items[0].action, "test.action");
      assert.equal((await call("/audit?cursor=invalid")).statusCode, 422);
      assert.equal((await call("/audit?from=2020-01-01T00:00:00Z")).statusCode, 422);
      await assert.rejects(platform.query("DELETE FROM app.platform_audit"));
      await assert.rejects(platform.query("UPDATE app.platform_audit SET reason='tampered'"));
      const blocked = await call("/super-admins/" + actor + "/revoke", {
        version: 0,
        reason: "Teste da proteção administrativa",
      });
      assert.equal(blocked.statusCode, 409);
      const denied = await call("/audit?action=management.denied");
      assert.equal(denied.statusCode, 200, denied.body);
      assert.equal(denied.json().items[0].details.code, "LAST_SUPER_ADMIN");
      assert.equal(JSON.stringify(denied.json()).includes(password), false);
      await db.query(
        "INSERT INTO app.organization_invitations(organization_id,email,token_hash,kind,expires_at) VALUES($1,'invite-org@ux.test','ux-org','organization_admin',now()+interval '1 day'),(null,'invite-super@ux.test','ux-super','platform_admin',now()-interval '1 day')",
        [a],
      );
      const directory = await call("/directory/invitations?limit=1");
      assert.equal(directory.statusCode, 200, directory.body);
      assert.equal(directory.json().items.length, 1);
      assert.ok(directory.json().next_cursor);
      const next = await call(
        "/directory/invitations?limit=1&cursor=" + directory.json().next_cursor,
      );
      assert.notEqual(next.json().items[0].id, directory.json().items[0].id);
      const organizationInvites = await call("/directory/invitations?organization_id=" + a);
      assert.equal(organizationInvites.statusCode, 200, organizationInvites.body);
      assert.equal(organizationInvites.json().items.length, 1);
      assert.equal(organizationInvites.json().items[0].organization_id, a);
      const expired = await call("/directory/invitations?status=expired&kind=platform_admin");
      assert.equal(expired.json().items.length, 1);
      assert.equal(expired.json().items[0].email, "invite-super@ux.test");
      assert.equal(
        (await app.inject({ url: "/api/v1/platform/directory/invitations" })).statusCode,
        401,
      );
      await db.query("INSERT INTO app.users(email) VALUES('no-platform@ux.test')");
      const supers = await call("/users?platform=true");
      assert.equal(supers.statusCode, 200, supers.body);
      assert.equal(supers.json().items.length, 1);
      assert.equal(supers.json().items[0].id, actor);
      await db.query("INSERT INTO app.memberships(organization_id,user_id) VALUES($1,$2)", [
        a,
        actor,
      ]);
      assert.equal((await call("/users?organization_id=" + a)).json().items.length, 1);
      await db.query(
        "WITH o AS (INSERT INTO app.organizations(name) SELECT 'Vínculo UX '||s FROM generate_series(1,30) s RETURNING id) INSERT INTO app.memberships(organization_id,user_id) SELECT id,$1 FROM o",
        [actor],
      );
      const person = (await call("/users/" + actor)).json();
      assert.equal(person.memberships.length, 25);
      assert.ok(person.memberships_next_cursor);
      const remaining = await call(
        "/users/" + actor + "/memberships?cursor=" + person.memberships_next_cursor,
      );
      assert.equal(remaining.json().items.length, 6);
    });
  } finally {
    await app.close();
    await Promise.all([db.end(), pool.end(), platform.end()]);
    await admin.query('DROP DATABASE "' + name + '"');
    await admin.end();
  }
});
