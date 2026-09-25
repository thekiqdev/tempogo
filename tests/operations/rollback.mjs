import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import https from "node:https";
import { setTimeout as sleep } from "node:timers/promises";

const base = ["compose", "-f", "infra/compose.homolog.yaml", "--env-file", ".env.homolog"];
async function docker(args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let out = "",
      error = "";
    p.stdout.on("data", (c) => (out += c));
    p.stderr.on("data", (c) => (error += c));
    p.on("error", reject);
    p.on("close", (n) => (n === 0 ? resolve(out.trim()) : reject(new Error(error.slice(-1500)))));
    p.stdin.on("error", () => {});
    p.stdin.end(input);
  });
}
async function sql(q) {
  return docker(
    [
      ...base,
      "exec",
      "-T",
      "database",
      "psql",
      "-U",
      "cronocheckpoint",
      "-d",
      "cronocheckpoint_homolog",
      "-X",
      "-q",
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    q,
  );
}
if (
  Number(
    await sql(
      "SELECT count(*) FROM schema_migrations WHERE name='009_organization_lifecycle.sql';",
    ),
  ) > 0
)
  throw new Error(
    "Rollback legado bloqueado: use platform-maintenance.mjs e correção progressiva após SA-03.",
  );

const cookie = randomBytes(32).toString("hex"),
  hash = createHash("sha256").update(cookie).digest("hex");
function get(path) {
  return new Promise((resolve, reject) => {
    https
      .get(
        "https://localhost:5443" + path,
        { rejectUnauthorized: false, headers: { cookie: "cc_session=" + cookie } },
        (r) => {
          let body = "";
          r.on("data", (c) => (body += c));
          r.on("end", () => resolve({ status: r.statusCode, body }));
        },
      )
      .on("error", reject);
  });
}
async function ready() {
  for (let i = 0; i < 45; i++) {
    try {
      if ((await get("/api/v1/health/ready")).status === 200) return;
    } catch {}
    await sleep(1000);
  }
  throw new Error("Readiness timeout");
}
await mkdir("tmp/sprint-05", { recursive: true });
const beforeImage = await docker([
  "inspect",
  "cronocheckpoint-homolog-api-1",
  "--format",
  "{{.Image}}",
]);
const previousImage = await docker([
  "image",
  "inspect",
  "cronocheckpoint-api:sprint04-rollback",
  "--format",
  "{{.Id}}",
]);
await writeFile(
  "tmp/sprint-05/rollback.yaml",
  "services:\n  api:\n    image: cronocheckpoint-api:sprint04-rollback\n",
);
const snapshot = () =>
  sql(
    "SELECT json_build_object('count',(SELECT count(*) FROM app.observations),'hash',(SELECT md5(string_agg(row_to_json(o)::text,'' ORDER BY id)) FROM app.observations o),'revisions',(SELECT count(*) FROM app.observation_revisions),'audit',(SELECT count(*) FROM app.audit_events))::text",
  );
const before = JSON.parse(await snapshot());
await sql(
  "INSERT INTO app.sessions(token_hash,user_id,organization_id,expires_at) SELECT '" +
    hash +
    "',u.id,m.organization_id,now()+interval '5 minutes' FROM app.users u JOIN app.memberships m ON m.user_id=u.id WHERE email='admin@corrida-a.test' LIMIT 1",
);
let restored = false;
try {
  const start = performance.now();
  await docker([
    ...base,
    "-f",
    "tmp/sprint-05/rollback.yaml",
    "up",
    "-d",
    "--no-deps",
    "--no-build",
    "api",
  ]);
  await ready();
  assert.equal(
    await docker(["inspect", "cronocheckpoint-homolog-api-1", "--format", "{{.Image}}"]),
    previousImage,
  );
  assert.equal((await get("/api/v1/events")).status, 200);
  const rollbackSeconds = (performance.now() - start) / 1000;
  assert.deepEqual(JSON.parse(await snapshot()), before);
  await docker([...base, "up", "-d", "--no-deps", "--no-build", "api"]);
  await ready();
  restored = true;
  assert.equal(
    await docker(["inspect", "cronocheckpoint-homolog-api-1", "--format", "{{.Image}}"]),
    beforeImage,
  );
  assert.equal((await get("/api/v1/events")).status, 200);
  assert.deepEqual(JSON.parse(await snapshot()), before);
  const report = {
    passed: true,
    beforeImage,
    previousImage,
    rollbackSeconds,
    dataPreserved: before,
    currentRestored: true,
    databaseDowngraded: false,
  };
  await writeFile("tmp/sprint-05/rollback.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  if (!restored) {
    await docker([...base, "up", "-d", "--no-deps", "--no-build", "api"]);
    await ready();
  }
  await sql("UPDATE app.sessions SET revoked_at=now() WHERE token_hash='" + hash + "'");
}
