import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import pg from "pg";
import { buildApp } from "../../apps/api/src/app.js";
import { evaluateErrors, evaluateHealth } from "./alerts.mjs";

const value = process.env.TEST_DATABASE_URL;
assert.ok(value && new URL(value).pathname.endsWith("_test"));
const target = new URL(value);
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
let blocked = false;
const sockets = new Set();
const proxy = net.createServer((client) => {
  if (blocked) {
    client.destroy();
    return;
  }
  const upstream = net.connect({ host: target.hostname, port: Number(target.port || 5432) });
  for (const s of [client, upstream]) {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
    s.on("error", () => {
      client.destroy();
      upstream.destroy();
    });
  }
  client.pipe(upstream).pipe(client);
});
await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
const forward = new URL(value);
forward.hostname = "127.0.0.1";
forward.port = String(proxy.address().port);
const pool = new pg.Pool({
  connectionString: forward.href,
  options: "-c role=cronocheckpoint_app",
  connectionTimeoutMillis: 1000,
  query_timeout: 1000,
});
pool.on("error", () => {});
const app = buildApp(async () => {
  await pool.query("SELECT 1");
});
const address = await app.listen({ host: "127.0.0.1", port: 0 });
async function probe() {
  const status = async (p) => {
    try {
      return (await fetch(address + p, { signal: AbortSignal.timeout(3000) })).ok;
    } catch {
      return false;
    }
  };
  return evaluateHealth({
    live: await status("/api/v1/health/live"),
    ready: await status("/api/v1/health/ready"),
  });
}
try {
  assert.equal((await probe()).code, "RECOVERED");
  blocked = true;
  for (const s of sockets) s.destroy();
  const failed = await probe();
  assert.equal(failed.code, "DATABASE_UNAVAILABLE");
  const start = performance.now();
  blocked = false;
  const recovered = await probe();
  assert.equal(recovered.code, "RECOVERED");
  const recoveryMs = performance.now() - start;
  await app.close();
  const apiDown = await probe();
  assert.equal(apiDown.code, "API_UNAVAILABLE");
  assert.equal(evaluateErrors(100, 2).code, "INGESTION_ERRORS");
  assert.equal(evaluateErrors(100, 1).code, "WITHIN_THRESHOLD");
  const report = {
    passed: true,
    failed,
    recovered,
    apiDown,
    recoveryMs,
    method:
      "Real TCP proxy interruption to isolated test DB; live API kept running; no shared container stopped",
    notificationsSent: false,
  };
  await mkdir("tmp/sprint-05", { recursive: true });
  await writeFile("tmp/sprint-05/faults.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await app.close();
  await pool.end();
  for (const s of sockets) s.destroy();
  await new Promise((resolve) => proxy.close(resolve));
}
