import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { buildApp } from "../../apps/api/src/app.js";
import { migrate } from "../../apps/api/src/migrations.js";
import { bootstrapPlatform, emergencyMfaReset } from "../../apps/api/src/platform-admin.js";
import { platformCipher, totp } from "../../apps/api/src/platform-crypto.js";
import { assertPlatformRole } from "../../apps/api/src/runtime-role.js";
import { csrfFor, hashPassword, token } from "../../apps/api/src/security.js";

test("SA02: plataforma isolada, bootstrap, MFA, sessões e recuperação", async (t) => {
  const original = process.env.TEST_DATABASE_URL;
  assert.ok(original && new URL(original).pathname.endsWith("_test"));
  const name = "cc_sa02_" + randomUUID().replaceAll("-", "") + "_test",
    admin = new pg.Pool({ connectionString: original });
  await admin.query('CREATE DATABASE "' + name + '"');
  const url = new URL(original);
  url.pathname = "/" + name;
  const db = new pg.Pool({ connectionString: url.href }),
    tenant = new pg.Pool({ connectionString: url.href, options: "-c role=cronocheckpoint_app" }),
    platform = new pg.Pool({
      connectionString: url.href,
      options: "-c role=cronocheckpoint_platform",
    });
  const origin = "http://127.0.0.1:5173",
    key = "ab".repeat(32),
    email = "super@sa02.test",
    pass = "Synthetic-SA02-password-123";
  const emails: { email: string; raw: string; kind: string }[] = [];
  await migrate(db, new URL("../../apps/api/migrations/", import.meta.url));
  const app = buildApp(async () => {}, false, {
    pool: tenant,
    origin,
    secure: false,
    sendReset: async () => {},
    platform: {
      pool: platform,
      key,
      origin,
      secure: false,
      sendMail: async (email, raw, kind) => {
        emails.push({ email, raw, kind });
      },
    },
  });
  let cookies = "",
    csrf = "",
    secret = "",
    recovery: string[] = [],
    id = "";
  async function call(
    path: string,
    body?: unknown,
    custom?: { cookie?: string; csrf?: string; origin?: string },
  ) {
    const r = await app.inject({
      method: body === undefined ? "GET" : "POST",
      url: "/api/v1/platform/auth" + path,
      headers: {
        origin: custom?.origin ?? origin,
        cookie: custom?.cookie ?? cookies,
        "x-csrf-token": custom?.csrf ?? csrf,
      },
      payload: body,
    });
    const values = new Map(
      cookies
        .split("; ")
        .filter(Boolean)
        .map((x) => {
          const i = x.indexOf("=");
          return [x.slice(0, i), x.slice(i + 1)];
        }),
    );
    for (const c of r.cookies) {
      if (c.value) values.set(c.name, c.value);
      else values.delete(c.name);
    }
    cookies = [...values].map(([k, v]) => k + "=" + v).join("; ");
    if (r.statusCode < 300 && r.body) {
      const d = r.json();
      if (d.csrf_token) csrf = d.csrf_token;
    }
    return r;
  }
  try {
    await t.test("runtime restrito e bootstrap atômico de uso único", async () => {
      await assertPlatformRole(platform);
      await assert.rejects(assertPlatformRole(tenant));
      assert.equal((await platform.query("SELECT * FROM app.observations")).rowCount, 0);
      await assert.rejects(platform.query("DELETE FROM app.observations"));
      await assert.rejects(tenant.query("SELECT * FROM app.platform_mfa"));
      const raw = await bootstrapPlatform(db, email);
      await assert.rejects(bootstrapPlatform(db, "other@sa02.test"));
      id = (await db.query("SELECT id FROM app.users WHERE email=$1", [email])).rows[0].id;
      assert.equal((await call("/password/reset", { token: raw, password: pass })).statusCode, 204);
      assert.equal((await call("/password/reset", { token: raw, password: pass })).statusCode, 401);
    });
    await t.test("login não concede sessão antes de MFA e desafia CSRF/Origin", async () => {
      assert.equal(
        (await call("/login", { email, password: pass }, { origin: "https://evil.test" }))
          .statusCode,
        403,
      );
      assert.equal((await call("/login", { email, password: pass })).json().next, "mfa_enroll");
      assert.equal((await call("/me")).statusCode, 401);
      assert.equal((await call("/mfa/enroll", {}, { csrf: "wrong" })).statusCode, 403);
      const enrolled = await call("/mfa/enroll", {});
      assert.equal(enrolled.statusCode, 200);
      secret = enrolled.json().secret;
      assert.equal((await call("/mfa/enroll", {})).statusCode, 409);
      const confirmed = await call("/mfa/confirm", {
        code: totp(secret, Math.floor(Date.now() / 30000)),
      });
      assert.equal(confirmed.statusCode, 200);
      recovery = confirmed.json().recovery_codes;
      assert.equal(recovery.length, 10);
      const cookie = confirmed.cookies.find((c) => c.name === "cc_platform_session");
      assert.equal(cookie?.httpOnly, true);
      assert.equal(cookie?.path, "/api/v1/platform");
      assert.equal((await call("/me")).statusCode, 200);
      assert.equal(
        (await call("/me", undefined, { cookie: "cc_session=" + token() })).statusCode,
        401,
      );
    });
    await t.test("MFA cifrado, reautenticação recente, logout e replay", async () => {
      const row = (await db.query("SELECT * FROM app.platform_mfa WHERE user_id=$1", [id])).rows[0];
      assert.ok(!row.secret_cipher.includes(secret));
      assert.equal(platformCipher(key).open(row.secret_cipher, id), secret);
      const next = totp(secret, Math.floor(Date.now() / 30000) + 1);
      assert.equal((await call("/reauthenticate", { password: pass, code: next })).statusCode, 200);
      const previous = cookies;
      assert.equal((await call("/logout", {})).statusCode, 204);
      assert.equal((await call("/me", undefined, { cookie: previous })).statusCode, 401);
      assert.equal((await call("/login", { email, password: pass })).json().next, "mfa_verify");
      assert.equal((await call("/mfa/verify", { code: next })).statusCode, 401);
    });
    await t.test("recuperação de uso único só libera recadastro, sem acesso direto", async () => {
      assert.equal(
        (await call("/mfa/recovery", { recovery_code: recovery[0] })).json().next,
        "mfa_enroll",
      );
      assert.equal((await call("/me")).statusCode, 401);
      secret = (await call("/mfa/enroll", {})).json().secret;
      const r = await call("/mfa/confirm", { code: totp(secret, Math.floor(Date.now() / 30000)) });
      assert.equal(r.statusCode, 200);
      assert.notDeepEqual(r.json().recovery_codes, recovery);
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM app.platform_recovery_codes WHERE user_id=$1",
            [id],
          )
        ).rows[0].n,
        10,
      );
    });
    await t.test("reset organizacional invalida também sessão e desafio globais", async () => {
      const old = cookies;
      await db.query("UPDATE app.users SET password_hash=$2 WHERE id=$1", [
        id,
        await hashPassword(pass),
      ]);
      assert.equal((await call("/me", undefined, { cookie: old })).statusCode, 401);
      await call("/login", { email, password: pass });
      await db.query("UPDATE app.users SET active=false WHERE id=$1", [id]);
      assert.equal(
        (await call("/mfa/verify", { code: totp(secret, Math.floor(Date.now() / 30000) + 1) }))
          .statusCode,
        401,
      );
      await db.query("UPDATE app.users SET active=true WHERE id=$1", [id]);
    });
    await t.test("recuperação emergencial exige senha, token único e novo MFA", async () => {
      const raw = await emergencyMfaReset(db, email, "Identidade conferida em teste sintético");
      assert.equal(
        (await call("/mfa/reset/accept", { token: raw, password: "incorrect" })).statusCode,
        401,
      );
      const r = await call("/mfa/reset/accept", { token: raw, password: pass });
      assert.equal(r.json().next, "mfa_enroll");
      assert.equal(
        (await call("/mfa/reset/accept", { token: raw, password: pass })).statusCode,
        401,
      );
      secret = (await call("/mfa/enroll", {})).json().secret;
      assert.equal(
        (await call("/mfa/confirm", { code: totp(secret, Math.floor(Date.now() / 30000)) }))
          .statusCode,
        200,
      );
      await db.query("UPDATE app.platform_sessions SET last_seen_at=now()-interval '16 minutes'");
      assert.equal((await call("/me")).statusCode, 401);
    });
    await t.test("desafio consumido uma única vez sob verificação concorrente", async () => {
      await db.query("DELETE FROM app.auth_limits");
      await call("/login", { email, password: pass });
      const result = await Promise.all([
        call("/mfa/verify", { code: totp(secret, Math.floor(Date.now() / 30000) + 1) }),
        call("/mfa/verify", { code: totp(secret, Math.floor(Date.now() / 30000) + 1) }),
      ]);
      assert.deepEqual(result.map((r) => r.statusCode).sort(), [200, 401]);
    });
    await t.test("forgot genérico, auditoria imutável e desafios limitados", async () => {
      assert.equal((await call("/password/forgot", { email })).statusCode, 202);
      assert.equal((await call("/password/forgot", { email: "absent@sa02.test" })).statusCode, 202);
      assert.ok(emails.some((e) => e.kind === "password"));
      assert.ok((await db.query("SELECT count(*)::int n FROM app.platform_audit")).rows[0].n >= 6);
      await assert.rejects(platform.query("DELETE FROM app.platform_audit"));
      await db.query("DELETE FROM app.auth_limits");
      await call("/login", { email, password: pass });
      for (let i = 0; i < 6; i++)
        assert.equal((await call("/mfa/verify", { code: "000000" })).statusCode, 401);
    });
  } finally {
    await app.close();
    await Promise.all([db.end(), tenant.end(), platform.end()]);
    await admin.query('DROP DATABASE "' + name + '"');
    await admin.end();
  }
});
