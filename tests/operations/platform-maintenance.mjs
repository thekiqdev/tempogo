import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import https from "node:https";

const base = ["compose", "-f", "infra/compose.homolog.yaml", "--env-file", ".env.homolog"];
function docker(args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn("docker", args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (b) => (out += b));
    p.stderr.on("data", () => {});
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(Error("Docker local retornou " + code)),
    );
    p.stdin.on("error", () => {});
    p.stdin.end(input);
  });
}
function get() {
  return new Promise((resolve, reject) => {
    https
      .get(
        "https://localhost:5443/api/v1/health/ready",
        { rejectUnauthorized: false, timeout: 4000 },
        (r) => {
          r.resume();
          resolve(r.statusCode);
        },
      )
      .on("error", reject)
      .on("timeout", function () {
        this.destroy();
      });
  });
}
async function snapshot() {
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
    "SELECT count(*)||':'||coalesce(md5(string_agg(row_to_json(o)::text,'' ORDER BY id)),'empty') FROM app.observations o;",
  );
}
const before = await snapshot();
assert.equal(await get(), 200);
try {
  await docker([...base, "stop", "api"]);
  assert.notEqual(await get(), 200);
} finally {
  await docker([...base, "start", "api"]);
}
for (let i = 0; i < 30; i++) {
  if ((await get()) === 200) break;
  await new Promise((r) => setTimeout(r, 1000));
}
assert.equal(await get(), 200);
assert.equal(await snapshot(), before);
const images = {};
for (const name of ["api", "web"])
  images[name] = await docker([
    "image",
    "inspect",
    "cronocheckpoint-homolog-" + name,
    "--format",
    "{{.Id}}",
  ]);
const result = {
  passed: true,
  strategy: "maintenance and forward recovery; no legacy authorization image",
  preservedObservations: true,
  images,
  recordedAt: new Date().toISOString(),
};
await mkdir("tmp/sa-06", { recursive: true });
await writeFile("tmp/sa-06/maintenance.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
