import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { buildApp } from "../../apps/api/src/app.js";
import { migrate } from "../../apps/api/src/migrations.js";
import type { PlatformOptions } from "../../apps/api/src/platform.js";
import { deliverAccountMessages } from "../../apps/api/src/platform-accounts.js";
import { newTotpSecret, platformCipher, totp } from "../../apps/api/src/platform-crypto.js";
import { deliverInvitations } from "../../apps/api/src/platform-management.js";
import { csrfFor, digest, hashPassword, token } from "../../apps/api/src/security.js";

test("SA04: contas, privilégios, recuperação e último administrador", async (t) => {
  const source = process.env.TEST_DATABASE_URL;
  assert.ok(source && new URL(source).pathname.endsWith("_test"));
  const name = "cc_sa04_" + randomUUID().replaceAll("-", "") + "_test",
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
  const why = "Conferência administrativa sintética";
  let second: string, owner: string, org: string, member: string;
  try {
    await t.test("não remover nem bloquear único super admin", async () => {
      assert.equal(
        (await call("/super-admins/" + actor + "/revoke", { version: 0, reason: why })).json().error
          .code,
        "LAST_SUPER_ADMIN",
      );
      assert.equal(
        (await call("/users/" + actor + "/status", { version: 0, active: false, reason: why }))
          .statusCode,
        409,
      );
    });
    await t.test("convite global de uso único só ativa privilégio após MFA", async () => {
      const r = await call("/super-admin-invitations", { email: "second@sa04.test" });
      assert.equal(r.statusCode, 201, r.body);
      await deliverInvitations(options);
      const invitation = sent.find((m) => m.kind === "super-invitation")!;
      assert.ok(invitation);
      assert.equal(
        (await call("/super-admin-invitations/inspect", { token: invitation.raw })).statusCode,
        200,
      );
      assert.equal(
        (await call("/super-admin-invitations/accept", { token: invitation.raw, password }))
          .statusCode,
        200,
      );
      assert.equal(
        (await call("/super-admin-invitations/accept", { token: invitation.raw, password }))
          .statusCode,
        410,
      );
      second = (await db.query("SELECT id FROM app.users WHERE email='second@sa04.test'")).rows[0]
        .id;
      assert.equal(
        (await db.query("SELECT state FROM app.platform_privileges WHERE user_id=$1", [second]))
          .rows[0].state,
        "invited",
      );
      assert.equal(
        (await call("/super-admins/" + actor + "/revoke", { version: 0, reason: why })).statusCode,
        409,
      );
      const login = await app.inject({
        method: "POST",
        url: "/api/v1/platform/auth/login",
        headers: { origin },
        payload: { email: "second@sa04.test", password },
      });
      const cookie = login.cookies.map((c) => c.name + "=" + c.value).join("; "),
        csrf = login.json().csrf_token;
      const request = (path: string, body: unknown) =>
        app.inject({
          method: "POST",
          url: "/api/v1/platform/auth" + path,
          headers: { origin, cookie, "x-csrf-token": csrf },
          payload: body,
        });
      const setup = await request("/mfa/enroll", {});
      assert.equal(setup.statusCode, 200, setup.body);
      assert.equal(
        (
          await request("/mfa/confirm", {
            code: totp(setup.json().secret, Math.floor(Date.now() / 30000)),
          })
        ).statusCode,
        200,
      );
      assert.equal(
        (await db.query("SELECT state FROM app.platform_privileges WHERE user_id=$1", [second]))
          .rows[0].state,
        "active",
      );
    });
    await t.test("último admin organizacional e responsável precisam de substituição", async () => {
      owner = (
        await db.query(
          "INSERT INTO app.users(email,password_hash) VALUES('owner@sa04.test',$1) RETURNING id",
          [await hashPassword(password)],
        )
      ).rows[0].id;
      member = (
        await db.query(
          "INSERT INTO app.users(email,password_hash) VALUES('member@sa04.test',$1) RETURNING id",
          [await hashPassword(password)],
        )
      ).rows[0].id;
      org = (await db.query("INSERT INTO app.organizations(name) VALUES('Org SA04') RETURNING id"))
        .rows[0].id;
      await db.query("INSERT INTO app.memberships(organization_id,user_id) VALUES($1,$2)", [
        org,
        owner,
      ]);
      await db.query("UPDATE app.organizations SET responsible_user_id=$2 WHERE id=$1", [
        org,
        owner,
      ]);
      assert.equal(
        (
          await call("/users/" + owner + "/status", { version: 0, active: false, reason: why })
        ).json().error.code,
        "LAST_ORGANIZATION_ADMIN",
      );
      await db.query("INSERT INTO app.memberships(organization_id,user_id) VALUES($1,$2)", [
        org,
        member,
      ]);
      assert.equal(
        (
          await call("/users/" + owner + "/status", { version: 0, active: false, reason: why })
        ).json().error.code,
        "RESPONSIBLE_REPLACEMENT_REQUIRED",
      );
      const r = await call("/users/" + owner + "/status", {
        version: 0,
        active: false,
        reason: why,
        responsible_replacements: [{ organization_id: org, user_id: member, version: 0 }],
      });
      assert.equal(r.statusCode, 200, r.body);
      assert.equal(
        (await db.query("SELECT responsible_user_id FROM app.organizations WHERE id=$1", [org]))
          .rows[0].responsible_user_id,
        member,
      );
      assert.equal(
        (
          await call("/organizations/" + org + "/members/" + member + "/status", {
            version: 0,
            active: false,
            reason: why,
          })
        ).statusCode,
        409,
      );
    });
    await t.test(
      "email exige senha/prova, preserva antigo até confirmar e revoga sessões",
      async () => {
        const row = (await db.query("SELECT version FROM app.users WHERE id=$1", [member])).rows[0];
        assert.equal(
          (
            await call("/users/" + member + "/email-change", {
              version: row.version,
              new_email: "new-member@sa04.test",
              reason: why,
            })
          ).statusCode,
          200,
        );
        await deliverAccountMessages(options);
        const mail = sent.find((m) => m.kind === "email")!;
        assert.ok(mail);
        assert.equal(
          (await db.query("SELECT email FROM app.users WHERE id=$1", [member])).rows[0].email,
          "member@sa04.test",
        );
        assert.equal(
          (await call("/email-change/confirm", { token: mail.raw, password: "wrong" })).statusCode,
          401,
        );
        assert.equal(
          (await call("/email-change/confirm", { token: mail.raw, password })).statusCode,
          200,
        );
        assert.equal(
          (await call("/email-change/confirm", { token: mail.raw, password })).statusCode,
          410,
        );
        assert.equal(
          (await db.query("SELECT email FROM app.users WHERE id=$1", [member])).rows[0].email,
          "new-member@sa04.test",
        );
        await deliverAccountMessages(options);
        assert.ok(sent.some((m) => m.kind === "email-notice" && m.email === "member@sa04.test"));
      },
    );
    await t.test("reset de senha e revogação têm alcance explícito", async () => {
      const r = await call("/users/" + member + "/password-reset", { reason: why });
      assert.equal(r.statusCode, 200, r.body);
      await deliverAccountMessages(options);
      assert.ok(sent.some((m) => m.kind === "user-password"));
      assert.equal(
        (
          await call("/users/" + member + "/sessions/revoke", {
            scope: "organization",
            reason: why,
          })
        ).statusCode,
        422,
      );
      assert.equal(
        (
          await call("/users/" + member + "/sessions/revoke", {
            scope: "organization",
            organization_id: org,
            reason: why,
          })
        ).statusCode,
        200,
      );
    });
    await t.test("falha de auditoria reverte alteração da conta", async () => {
      await db.query("REVOKE INSERT ON app.platform_audit FROM cronocheckpoint_platform");
      try {
        const r = await call("/users/" + owner + "/status", {
          version: 1,
          active: true,
          reason: why,
        });
        assert.equal(r.statusCode, 500);
        assert.equal(
          (await db.query("SELECT active FROM app.users WHERE id=$1", [owner])).rows[0].active,
          false,
        );
      } finally {
        await db.query("GRANT INSERT ON app.platform_audit TO cronocheckpoint_platform");
      }
    });
    await t.test("duas revogações concorrentes nunca removem os dois super admins", async () => {
      const v = (
        await db.query("SELECT version FROM app.platform_privileges WHERE user_id=$1", [second])
      ).rows[0].version;
      const r = await Promise.all([
        call("/super-admins/" + second + "/revoke", { version: v, reason: why }),
        call("/super-admins/" + actor + "/revoke", { version: 0, reason: why }),
      ]);
      assert.equal(r.filter((x) => x.statusCode === 200).length, 1);
      assert.equal(
        (await db.query("SELECT count(*)::int n FROM app.platform_privileges WHERE state='active'"))
          .rows[0].n,
        1,
      );
    });
  } finally {
    await app.close();
    await Promise.all([db.end(), pool.end(), platform.end()]);
    await admin.query('DROP DATABASE "' + name + '"');
    await admin.end();
  }
});
