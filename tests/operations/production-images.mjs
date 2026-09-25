import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const suffix = randomUUID().slice(0, 8),
  api = "cc-s05-api-" + suffix,
  web = "cc-s05-web-" + suffix,
  secret = randomBytes(32).toString("hex");
assert.ok(process.env.HOMOLOG_RUNTIME_PASSWORD);
async function docker(args, extra = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn("docker", args, { env: { ...process.env, ...extra }, windowsHide: true });
    let out = "",
      error = "";
    p.stdout.on("data", (c) => (out += c));
    p.stderr.on("data", (c) => (error += c));
    p.on("error", reject);
    p.on("close", (n) => (n === 0 ? resolve(out.trim()) : reject(new Error(error.slice(-1500)))));
  });
}
let createdApi = false,
  createdWeb = false;
try {
  await docker(
    [
      "run",
      "-d",
      "--name",
      api,
      "--network",
      "cronocheckpoint-homolog_default",
      "-e",
      "DATABASE_URL",
      "-e",
      "PUBLIC_ORIGIN=https://localhost:5443",
      "-e",
      "SMTP_HOST=mailpit",
      "-e",
      "METRICS_TOKEN",
      "cronocheckpoint-api:sprint05-candidate",
    ],
    {
      DATABASE_URL:
        "postgresql://cronocheckpoint_runtime:" +
        encodeURIComponent(process.env.HOMOLOG_RUNTIME_PASSWORD) +
        "@database:5432/cronocheckpoint_homolog",
      METRICS_TOKEN: secret,
    },
  );
  createdApi = true;
  await docker([
    "run",
    "-d",
    "--name",
    web,
    "--network",
    "cronocheckpoint-homolog_default",
    "-p",
    "127.0.0.1::80",
    "-e",
    "API_UPSTREAM=" + api + ":3001",
    "cronocheckpoint-web:sprint05-candidate",
  ]);
  createdWeb = true;
  const binding = await docker(["port", web, "80"]);
  assert.match(binding, /^127\.0\.0\.1:\d+$/);
  const base = "http://" + binding;
  for (let i = 0; i < 30; i++) {
    try {
      if ((await fetch(base + "/api/v1/health/ready")).ok) break;
    } catch {}
    await sleep(1000);
  }
  const ready = await fetch(base + "/api/v1/health/ready");
  assert.equal(ready.status, 200);
  const home = await fetch(base + "/checkpoint");
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.match(await home.text(), /root/);
  assert.equal(
    (
      await fetch(base + "/api/v1/operations/metrics", {
        headers: { authorization: "Bearer " + secret },
      })
    ).status,
    404,
  );
  const privateStatus = await docker([
    "exec",
    api,
    "node",
    "-e",
    "fetch('http://127.0.0.1:3001/api/v1/operations/metrics',{headers:{authorization:'Bearer '+process.env.METRICS_TOKEN}}).then(r=>console.log(r.status))",
  ]);
  assert.equal(privateStatus, "200");
  await fetch(base + "/api/v1/health/live?password=" + secret, {
    headers: { cookie: "canary=" + secret },
  });
  const logs = await docker(["logs", api]);
  assert.equal(logs.includes(secret), false);
  const images = {
    api: await docker(["inspect", api, "--format", "{{.Image}}"]),
    web: await docker(["inspect", web, "--format", "{{.Image}}"]),
  };
  const report = {
    passed: true,
    images,
    runtimeUser: await docker(["exec", api, "id", "-un"]),
    privateMetricsStatus: Number(privateStatus),
    publicMetricsStatus: 404,
    secretsInLogs: false,
    environment: "Local smoke of Contabo/Easypanel images; no VPS deployment",
  };
  await mkdir("tmp/sprint-05", { recursive: true });
  await writeFile("tmp/sprint-05/production-images.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  if (createdWeb) await docker(["rm", "-f", web]);
  if (createdApi) await docker(["rm", "-f", api]);
}
