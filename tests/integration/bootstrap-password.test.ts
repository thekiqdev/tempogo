import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { buildApp } from "../../apps/api/src/app.js";
import { migrate } from "../../apps/api/src/migrations.js";
import { bootstrapPlatformWithPassword } from "../../apps/api/src/platform-admin.js";
import { hashPassword, verifyPassword } from "../../apps/api/src/security.js";

async function withTempDb(run: (pool: pg.Pool) => Promise<void>) {
  const original = process.env.TEST_DATABASE_URL;
  assert.ok(original && new URL(original).pathname.endsWith("_test"));
  const name = "bootstrap_" + randomUUID().replaceAll("-", "") + "_test";
  const admin = new pg.Pool({ connectionString: original });
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(original);
  url.pathname = "/" + name;
  const pool = new pg.Pool({ connectionString: url.href });
  try {
    await migrate(pool, new URL("../../apps/api/migrations/", import.meta.url));
    await run(pool);
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  }
}

test("bootstrap sem SMTP: senha, MFA obrigatório e repetição recusada", async () => {
  await withTempDb(async (pool) => {
    const email = "first@example.test",
      password = "Synthetic-password-12345";
    await bootstrapPlatformWithPassword(pool, email, password);
    const row = (await pool.query("SELECT password_hash FROM app.users WHERE email=$1", [email]))
      .rows[0];
    assert.notEqual(row.password_hash, password);
    assert.equal(await verifyPassword(password, row.password_hash), true);
    await assert.rejects(
      bootstrapPlatformWithPassword(pool, "second@example.test", password),
      /Bootstrap já realizado/,
    );
    assert.equal(
      (await pool.query("SELECT count(*)::int n FROM app.platform_privileges")).rows[0].n,
      1,
    );
    assert.equal(
      (await pool.query("SELECT count(*)::int n FROM app.password_tokens")).rows[0].n,
      0,
    );
    const noMail = async () => {
      throw new Error("SMTP não deve ser chamado");
    };
    const app = buildApp(async () => {}, false, {
      pool,
      origin: "https://tempogo.example.com",
      secure: true,
      sendReset: noMail,
      platform: {
        pool,
        key: "ab".repeat(32),
        origin: "https://tempogo.example.com",
        secure: true,
        sendMail: noMail,
      },
    });
    try {
      const r = await app.inject({
        method: "POST",
        url: "/api/v1/platform/auth/login",
        headers: { origin: "https://tempogo.example.com" },
        payload: { email, password },
      });
      assert.equal(r.statusCode, 202, r.body);
      assert.equal(r.json().next, "mfa_enroll");
    } finally {
      await app.close();
    }
  });
});

test("force reset: redefine senha, promove organizador e limpa MFA", async () => {
  await withTempDb(async (pool) => {
    const email = "org@example.test";
    const oldPassword = "Old-password-123456";
    const newPassword = "New-password-123456";
    const user = (
      await pool.query(
        "INSERT INTO app.users(email,password_hash,active) VALUES($1,$2,false) RETURNING id",
        [email, await hashPassword(oldPassword)],
      )
    ).rows[0];
    await pool.query(
      "INSERT INTO app.platform_mfa(user_id,secret_cipher) VALUES($1,'cipher-placeholder')",
      [user.id],
    );
    await pool.query(
      "INSERT INTO app.platform_recovery_codes(user_id,code_hash) VALUES($1,'code-hash')",
      [user.id],
    );
    await assert.rejects(
      bootstrapPlatformWithPassword(pool, email, newPassword),
      /Email já pertence/,
    );
    const outcome = await bootstrapPlatformWithPassword(pool, email, newPassword, { force: true });
    assert.equal(outcome, "recovered");
    const row = (
      await pool.query(
        "SELECT u.active,u.password_hash,p.state,p.recovery_pending FROM app.users u JOIN app.platform_privileges p ON p.user_id=u.id WHERE u.email=$1",
        [email],
      )
    ).rows[0];
    assert.equal(row.active, true);
    assert.equal(row.state, "invited");
    assert.equal(row.recovery_pending, false);
    assert.equal(await verifyPassword(oldPassword, row.password_hash), false);
    assert.equal(await verifyPassword(newPassword, row.password_hash), true);
    assert.equal(
      (await pool.query("SELECT count(*)::int n FROM app.platform_mfa WHERE user_id=$1", [user.id]))
        .rows[0].n,
      0,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int n FROM app.platform_recovery_codes WHERE user_id=$1",
          [user.id],
        )
      ).rows[0].n,
      0,
    );
    const noMail = async () => {
      throw new Error("SMTP não deve ser chamado");
    };
    const app = buildApp(async () => {}, false, {
      pool,
      origin: "https://tempogo.example.com",
      secure: true,
      sendReset: noMail,
      platform: {
        pool,
        key: "ab".repeat(32),
        origin: "https://tempogo.example.com",
        secure: true,
        sendMail: noMail,
      },
    });
    try {
      const r = await app.inject({
        method: "POST",
        url: "/api/v1/platform/auth/login",
        headers: { origin: "https://tempogo.example.com" },
        payload: { email, password: newPassword },
      });
      assert.equal(r.statusCode, 202, r.body);
      assert.equal(r.json().next, "mfa_enroll");
    } finally {
      await app.close();
    }
  });
});

test("force reset: recupera superadmin já bootstrapado", async () => {
  await withTempDb(async (pool) => {
    const email = "admin@example.test";
    await bootstrapPlatformWithPassword(pool, email, "First-password-12345");
    const outcome = await bootstrapPlatformWithPassword(pool, email, "Second-password-12345", {
      force: true,
    });
    assert.equal(outcome, "recovered");
    const row = (await pool.query("SELECT password_hash FROM app.users WHERE email=$1", [email]))
      .rows[0];
    assert.equal(await verifyPassword("Second-password-12345", row.password_hash), true);
    assert.equal(
      (await pool.query("SELECT count(*)::int n FROM app.platform_privileges")).rows[0].n,
      1,
    );
  });
});
