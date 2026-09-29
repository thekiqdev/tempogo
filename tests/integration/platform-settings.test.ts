import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { buildApp } from "../../apps/api/src/app.js";
import { migrate } from "../../apps/api/src/migrations.js";
import { csrfFor, digest, hashPassword, token } from "../../apps/api/src/security.js";

test("Configurações: logo, autorização e MFA opcional no login e reautenticação", async () => {
  const original = process.env.TEST_DATABASE_URL;
  assert.ok(original && new URL(original).pathname.endsWith("_test"));
  const name = "settings_" + randomUUID().replaceAll("-", "") + "_test";
  const admin = new pg.Pool({ connectionString: original });
  await admin.query('CREATE DATABASE "' + name + '"');
  const url = new URL(original);
  url.pathname = "/" + name;
  const db = new pg.Pool({ connectionString: url.href });
  const tenant = new pg.Pool({
    connectionString: url.href,
    options: "-c role=cronocheckpoint_app",
  });
  const platform = new pg.Pool({
    connectionString: url.href,
    options: "-c role=cronocheckpoint_platform",
  });
  await migrate(db, new URL("../../apps/api/migrations/", import.meta.url));
  const origin = "http://127.0.0.1:5173",
    password = "Settings-password-12345";
  const app = buildApp(async () => {}, false, {
    pool: tenant,
    origin,
    secure: false,
    sendReset: async () => {},
    platform: {
      pool: platform,
      key: "ab".repeat(32),
      origin,
      secure: false,
      sendMail: async () => {},
    },
  });
  let raw = token();
  const call = (path: string, body?: unknown, authenticated = true, csrf = csrfFor(raw)) =>
    app.inject({
      method: body === undefined ? "GET" : "POST",
      url: "/api/v1/platform" + path,
      headers: {
        origin,
        cookie: authenticated ? "cc_platform_session=" + raw : "",
        "x-csrf-token": csrf,
      },
      payload: body,
    });
  try {
    const u = (
      await db.query(
        "INSERT INTO app.users(email,password_hash) VALUES($1,$2) RETURNING id,auth_version",
        ["admin@settings.test", await hashPassword(password)],
      )
    ).rows[0];
    await db.query("INSERT INTO app.platform_privileges(user_id,state) VALUES($1,'active')", [
      u.id,
    ]);
    await db.query(
      "INSERT INTO app.platform_sessions(token_hash,user_id,auth_version,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
      [digest(raw), u.id, u.auth_version],
    );
    assert.equal((await call("/settings", undefined, false)).statusCode, 401);
    assert.equal((await call("/settings")).json().mfa_required, true);
    const settings = { version: 0, logo_data_url: null, mfa_required: false };
    assert.equal((await call("/settings", settings, true, "invalid")).statusCode, 403);
    assert.equal(
      (
        await call("/settings", {
          ...settings,
          logo_data_url: "data:image/svg+xml;base64,PHN2Zy8+",
        })
      ).statusCode,
      422,
    );
    const logo =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
    const saved = await call("/settings", { ...settings, logo_data_url: logo });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.equal((await call("/branding", undefined, false)).json().logo_data_url, logo);
    assert.equal((await call("/settings", settings)).statusCode, 409);
    assert.equal(
      (await call("/auth/login", { email: "admin@settings.test", password: "wrong" }, false))
        .statusCode,
      401,
    );
    const login = await call("/auth/login", { email: "admin@settings.test", password }, false);
    assert.equal(login.statusCode, 200, login.body);
    assert.equal(login.json().next, undefined);
    raw = login.cookies.find((c) => c.name === "cc_platform_session")!.value;
    assert.equal((await call("/auth/me")).json().mfa_required, false);
    assert.equal((await call("/auth/reauthenticate", { password })).statusCode, 200);
    // Already enrolled users also log in without a code when the global requirement is off.
    await db.query(
      "INSERT INTO app.platform_mfa(user_id,secret_cipher,last_step) VALUES($1,'unused',-1)",
      [u.id],
    );
    assert.equal(
      (await call("/auth/login", { email: "admin@settings.test", password }, false)).statusCode,
      200,
    );
    await db.query("DELETE FROM app.platform_mfa WHERE user_id=$1", [u.id]);
    const invited = (
      await db.query("INSERT INTO app.users(email,password_hash) VALUES($1,$2) RETURNING id", [
        "new@settings.test",
        await hashPassword(password),
      ])
    ).rows[0];
    await db.query("INSERT INTO app.platform_privileges(user_id,state) VALUES($1,'invited')", [
      invited.id,
    ]);
    assert.equal(
      (await call("/auth/login", { email: "new@settings.test", password }, false)).statusCode,
      200,
    );
    assert.equal(
      (await db.query("SELECT state FROM app.platform_privileges WHERE user_id=$1", [invited.id]))
        .rows[0].state,
      "active",
    );
    assert.equal(
      (await call("/settings", { version: 1, logo_data_url: null, mfa_required: true })).statusCode,
      200,
    );
    assert.equal((await call("/auth/me")).statusCode, 401);
    const required = await call("/auth/login", { email: "admin@settings.test", password }, false);
    assert.equal(required.statusCode, 202, required.body);
    assert.equal(required.json().next, "mfa_enroll");
    assert.equal((await call("/branding", undefined, false)).json().logo_data_url, null);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM app.platform_audit WHERE action='platform.settings.updated'",
        )
      ).rows[0].n,
      2,
    );
    await assert.rejects(tenant.query("SELECT * FROM app.platform_settings"));
  } finally {
    await app.close();
    await Promise.all([db.end(), tenant.end(), platform.end()]);
    await admin.query('DROP DATABASE "' + name + '"');
    await admin.end();
  }
});
