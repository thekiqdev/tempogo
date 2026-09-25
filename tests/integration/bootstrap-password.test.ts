import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { buildApp } from "../../apps/api/src/app.js";
import { migrate } from "../../apps/api/src/migrations.js";
import { bootstrapPlatformWithPassword } from "../../apps/api/src/platform-admin.js";
import { verifyPassword } from "../../apps/api/src/security.js";

test("bootstrap sem SMTP: senha, MFA obrigatório e repetição recusada", async () => {
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
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  }
});
