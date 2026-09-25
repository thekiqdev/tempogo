import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../../apps/api/src/app.js";
import { readConfig } from "../../apps/api/src/config.js";

test("liveness independe de banco e readiness reflete indisponibilidade sem vazar segredo", async () => {
  const app = buildApp(async () => {
    throw new Error("postgres://secret@private-host");
  });
  try {
    assert.equal((await app.inject("/api/v1/health/live")).statusCode, 200);
    const response = await app.inject("/api/v1/health/ready");
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), { status: "unavailable" });
    assert.equal(response.headers["cache-control"], "no-store");
  } finally {
    await app.close();
  }
});
test("readiness responde pronta quando a consulta funciona", async () => {
  const app = buildApp(async () => {});
  try {
    assert.deepEqual((await app.inject("/api/v1/health/ready")).json(), { status: "ready" });
  } finally {
    await app.close();
  }
});
test("configuração inválida falha antes de iniciar e não revela URL", () => {
  assert.throws(() => readConfig({}), /obrigatória/);
  assert.throws(() => readConfig({ DATABASE_URL: "secret" }), /^Error: DATABASE_URL inválida$/);
  assert.throws(
    () => readConfig({ DATABASE_URL: "https://example.com", API_PORT: "3001" }),
    /PostgreSQL/,
  );
  assert.throws(
    () => readConfig({ DATABASE_URL: "postgres://localhost/db", API_PORT: "0" }),
    /API_PORT/,
  );
});
