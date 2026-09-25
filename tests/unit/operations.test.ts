import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import pg from "pg";
import { buildApp } from "../../apps/api/src/app.js";

test("limite HTTP ativo, logs sem segredos e métricas privadas", async () => {
  const output = new PassThrough();
  let logs = "";
  output.on("data", (chunk) => {
    logs += chunk.toString();
  });
  const pool = new pg.Pool({ connectionString: "postgresql://invalid@127.0.0.1:1/unused" });
  const secret = "CANARY-secret-must-not-leak",
    app = buildApp(
      async () => {},
      { stream: output },
      {
        pool,
        origin: "http://127.0.0.1:5173",
        secure: false,
        sendReset: async () => {},
        metricsToken: secret,
      },
    );
  try {
    const reply = await app.inject({
      method: "GET",
      url: "/api/v1/health/live?password=" + secret,
      headers: {
        authorization: "Bearer " + secret,
        cookie: "cc_session=" + secret,
        "x-request-id": secret,
      },
    });
    assert.equal(reply.statusCode, 200);
    assert.ok(reply.headers["x-request-id"]);
    assert.notEqual(reply.headers["x-request-id"], secret);
    for (let n = 1; n < 120; n++)
      assert.equal((await app.inject("/api/v1/health/live")).statusCode, 200);
    assert.equal((await app.inject("/api/v1/health/live")).statusCode, 429);
    const unauthorized = await app.inject({
      url: "/api/v1/operations/metrics",
      remoteAddress: "127.0.0.3",
    });
    assert.equal(unauthorized.statusCode, 404);
    const metrics = await app.inject({
      url: "/api/v1/operations/metrics",
      remoteAddress: "127.0.0.3",
      headers: { authorization: "Bearer " + secret },
    });
    assert.equal(metrics.statusCode, 200);
    assert.match(metrics.body, /tempogo_http_requests_total/);
    assert.match(metrics.body, /status="429"/);
    assert.equal(metrics.body.includes(secret), false);
    await app.close();
    assert.equal(logs.includes(secret), false);
    assert.match(logs, /request.completed/);
    assert.match(logs, /reqId/);
  } finally {
    await app.close();
    await pool.end();
  }
});
test("readiness indisponível preserva liveness e não expõe erro de banco", async () => {
  const app = buildApp(async () => {
    throw new Error("database-password-canary");
  });
  try {
    assert.equal((await app.inject("/api/v1/health/live")).statusCode, 200);
    const r = await app.inject("/api/v1/health/ready");
    assert.equal(r.statusCode, 503);
    assert.equal(r.body.includes("canary"), false);
  } finally {
    await app.close();
  }
});
