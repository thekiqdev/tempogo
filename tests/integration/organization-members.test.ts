import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { buildApp } from "../../apps/api/src/app.js";
import { transaction } from "../../apps/api/src/db.js";
import { migrate } from "../../apps/api/src/migrations.js";
import type { PlatformOptions } from "../../apps/api/src/platform.js";
import { deliverInvitations } from "../../apps/api/src/platform-management.js";
import { csrfFor, digest, token } from "../../apps/api/src/security.js";

test("Administração direta: usuários, ativação e senhas sem SMTP", async (t) => {
  const original = process.env.TEST_DATABASE_URL;
  assert.ok(original && new URL(original).pathname.endsWith("_test"));
  const name = "cc_sa03_" + randomUUID().replaceAll("-", "") + "_test",
    admin = new pg.Pool({ connectionString: original });
  await admin.query('CREATE DATABASE "' + name + '"');
  const url = new URL(original);
  url.pathname = "/" + name;
  const db = new pg.Pool({ connectionString: url.href }),
    tenant = new pg.Pool({
      connectionString: url.href,
      options: "-c role=cronocheckpoint_app",
    }),
    platform = new pg.Pool({
      connectionString: url.href,
      options: "-c role=cronocheckpoint_platform",
    });
  await migrate(db, new URL("../../apps/api/migrations/", import.meta.url));
  const actor = (
    await db.query("INSERT INTO app.users(email) VALUES('platform@sa03.test') RETURNING id")
  ).rows[0].id;
  await db.query("INSERT INTO app.platform_privileges(user_id,state) VALUES($1,'active')", [actor]);
  const raw = token();
  await db.query(
    "INSERT INTO app.platform_sessions(token_hash,user_id,auth_version,expires_at,reauthenticated_until) VALUES($1,$2,0,now()+interval '1 hour',NULL)",
    [digest(raw), actor],
  );
  const origin = "http://127.0.0.1:5173",
    sent: { email: string; raw: string }[] = [];
  let smtpFails = false;
  const options: PlatformOptions = {
    pool: platform,
    key: "ca".repeat(32),
    origin,
    secure: false,
    sendMail: async (email, raw, kind) => {
      if (kind === "invitation") {
        if (smtpFails) throw new Error("simulated SMTP outage");
        sent.push({ email, raw });
      }
    },
  };
  const app = buildApp(async () => {}, false, {
    pool: tenant,
    origin,
    secure: false,
    sendReset: async () => {},
    platform: options,
  });
  const call = (
    path: string,
    body?: unknown,
    key = randomUUID(),
    method = "POST",
    cookie = "cc_platform_session=" + raw,
  ) =>
    app.inject({
      method: body === undefined ? "GET" : (method as "POST"),
      url: "/api/v1/platform" + path,
      headers: {
        origin,
        cookie,
        "x-csrf-token": csrfFor(raw),
        "idempotency-key": key,
      },
      payload: body,
    });
  try {
    const r = await call("/organizations", {
      name: "Organização direta",
      contact_email: "contact@example.test",
    });
    assert.equal(r.statusCode, 201, r.body);
    const org = r.json().organization;
    const email = "member@example.test",
      password = "Temporary-password-123",
      newPassword = "Personal-password-456";
    const body = { email, password, mode: "create", version: org.version, complete_setup: true };
    const key = randomUUID();
    const added = await call(`/organizations/${org.id}/members`, body, key);
    assert.equal(added.statusCode, 200, added.body);
    const id = added.json().id;
    assert.equal((await call(`/organizations/${org.id}/members`, body, key)).json().id, id);
    assert.equal(
      (
        await call(
          `/organizations/${org.id}/members`,
          { ...body, password: "Different-password-123" },
          key,
        )
      ).statusCode,
      409,
    );
    const details = (await call(`/organizations/${org.id}`)).json().organization;
    assert.equal(details.status, "active");
    assert.equal(details.responsible_user_id, id);
    assert.equal(
      (await db.query("SELECT active FROM app.organizations WHERE id=$1", [org.id])).rows[0].active,
      true,
    );
    const auth = (path: string, data: unknown) =>
      app.inject({
        method: "POST",
        url: "/api/v1/auth/" + path,
        headers: { origin },
        payload: data,
      });
    const login = await auth("admin/login", { email, password });
    assert.equal(login.statusCode, 200, login.body);
    assert.equal(login.json().password_change_required, true);
    assert.equal(login.headers["set-cookie"], undefined);
    const changed = await auth("password/change-initial", {
      email,
      password,
      new_password: newPassword,
    });
    assert.equal(changed.statusCode, 200, changed.body);
    const normal = await auth("admin/login", { email, password: newPassword });
    assert.equal(normal.statusCode, 200, normal.body);
    assert.ok(normal.headers["set-cookie"]);
    const members = (await call(`/organizations/${org.id}/members?q=member`)).json().items;
    assert.equal(members.length, 1);
    const reset = await call(`/organizations/${org.id}/members/${id}/password`, {
      password,
      version: members[0].user_version,
      confirm_global: true,
    });
    assert.equal(reset.statusCode, 200, reset.body);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM app.sessions WHERE user_id=$1 AND revoked_at IS NULL",
          [id],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (await db.query("SELECT must_change_password FROM app.users WHERE id=$1", [id])).rows[0]
        .must_change_password,
      true,
    );
    const serialized =
      JSON.stringify((await db.query("SELECT * FROM app.platform_commands")).rows) +
      JSON.stringify((await db.query("SELECT * FROM app.platform_audit")).rows);
    assert.ok(!serialized.includes(password));
    assert.equal(
      (await db.query("SELECT count(*)::int n FROM app.invitation_outbox")).rows[0].n,
      0,
    );
    const second = (
      await call("/organizations", {
        name: "Outra organização",
        contact_email: "other@example.test",
      })
    ).json().organization;
    assert.equal(
      (
        await call(`/organizations/${second.id}/members/${id}/password`, {
          password,
          version: 0,
          confirm_global: true,
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await call(`/organizations/${second.id}/members`, {
          email,
          mode: "link",
          version: second.version,
        })
      ).statusCode,
      200,
    );
    await db.query(
      "UPDATE app.platform_sessions SET reauthenticated_until=now()-interval '1 hour'",
    );
    const currentVersion = (await db.query("SELECT version FROM app.users WHERE id=$1", [id]))
      .rows[0].version;
    assert.equal(
      (
        await call(`/organizations/${org.id}/members/${id}/password`, {
          password,
          version: currentVersion,
          confirm_global: true,
        })
      ).statusCode,
      200,
    );
    const globalAction = await call(`/users/${id}/sessions/revoke`, {
      scope: "all",
      reason: "Teste de alcance global",
    });
    assert.equal(globalAction.statusCode, 403);
    assert.equal(globalAction.json().error.code, "REAUTH_REQUIRED");
    const csrfRejected = await app.inject({
      method: "POST",
      url: `/api/v1/platform/organizations/${org.id}/members/${id}/password`,
      headers: { origin, cookie: "cc_platform_session=" + raw, "idempotency-key": randomUUID() },
      payload: { password, version: currentVersion + 1, confirm_global: true },
    });
    assert.equal(csrfRejected.statusCode, 403);
    assert.equal(csrfRejected.json().error.code, "CSRF_INVALID");
    await db.query("UPDATE app.organizations SET status='suspended',active=false WHERE id=$1", [
      second.id,
    ]);
    const suspendedVersion = (await call(`/organizations/${second.id}`)).json().organization
      .version;
    assert.equal(
      (
        await call(`/organizations/${second.id}/members`, {
          email: "suspended@example.test",
          password,
          mode: "create",
          version: suspendedVersion,
          complete_setup: true,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await call(`/organizations/${second.id}`)).json().organization.status,
      "suspended",
    );
    await db.query("UPDATE app.organizations SET status='closed',active=false WHERE id=$1", [
      second.id,
    ]);
    const closedVersion = (await call(`/organizations/${second.id}`)).json().organization.version;
    assert.equal(
      (
        await call(`/organizations/${second.id}/members`, {
          email: "closed@example.test",
          password,
          mode: "create",
          version: closedVersion,
          complete_setup: true,
        })
      ).json().error.code,
      "ORGANIZATION_CLOSED",
    );
    assert.equal(
      (await db.query("SELECT 1 FROM app.users WHERE email='closed@example.test'")).rowCount,
      0,
    );
    await db.query("UPDATE app.platform_sessions SET revoked_at=now()");
    assert.equal(
      (
        await call(`/organizations/${org.id}/members/${id}/password`, {
          password,
          version: currentVersion + 1,
          confirm_global: true,
        })
      ).statusCode,
      401,
    );
  } finally {
    await app.close();
    await Promise.all([db.end(), tenant.end(), platform.end()]);
    await admin.query('DROP DATABASE "' + name + '"');
    await admin.end();
  }
});
