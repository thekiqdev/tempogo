import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import http from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import pg from "pg";
import { buildApp } from "../../apps/api/src/app.js";
import { migrate } from "../../apps/api/src/migrations.js";
import { csrfFor, digest, token } from "../../apps/api/src/security.js";

const url = process.env.TEST_DATABASE_URL;
assert.ok(
  url &&
    new URL(url).pathname.endsWith("_test") &&
    ["localhost", "127.0.0.1"].includes(new URL(url).hostname),
  "Somente banco local de testes",
);
const seconds = Number(process.env.LOAD_SECONDS ?? 900),
  burstCount = Number(process.env.LOAD_BURST ?? 1000);
assert.ok(Number.isInteger(seconds) && seconds >= 1 && seconds <= 900);
assert.ok(Number.isInteger(burstCount) && burstCount >= 0 && burstCount <= 1000);
const db = new pg.Pool({ connectionString: url }),
  pool = new pg.Pool({
    connectionString: url,
    options: "-c role=cronocheckpoint_app",
    max: 5,
    connectionTimeoutMillis: 2000,
    query_timeout: 2000,
  });
await migrate(db, new URL("../../apps/api/migrations/", import.meta.url));
const app = buildApp(
  async () => {
    await pool.query("SELECT 1");
  },
  false,
  { pool, origin: "http://127.0.0.1:5173", secure: false, sendReset: async () => {} },
);
const endpoint = await app.listen({ port: 0, host: "127.0.0.1" });
const agents = Array.from({ length: 21 }, () => new http.Agent({ keepAlive: true, maxSockets: 1 }));
const org = (
  await db.query(
    "INSERT INTO app.organizations(name) VALUES('Sprint05 load synthetic') RETURNING id",
  )
).rows[0].id;
const user = (
  await db.query("INSERT INTO app.users(email) VALUES($1) RETURNING id", [
    randomUUID() + "@load.test",
  ])
).rows[0].id;
await db.query("INSERT INTO app.memberships(organization_id,user_id) VALUES($1,$2)", [org, user]);
const admin = token();
await db.query(
  "INSERT INTO app.sessions(token_hash,user_id,organization_id,expires_at) VALUES($1,$2,$3,now()+interval '2 hours')",
  [digest(admin), user, org],
);
const event = (
  await db.query(
    "INSERT INTO app.events(organization_id,name,local_date,timezone,state,created_by) VALUES($1,'Load race',CURRENT_DATE,'UTC','running',$2) RETURNING id",
    [org, user],
  )
).rows[0].id;
const cat = (
  await db.query(
    "INSERT INTO app.race_categories(organization_id,event_id,name) VALUES($1,$2,'5k') RETURNING id",
    [org, event],
  )
).rows[0].id;
await db.query(
  "INSERT INTO app.capture_windows(organization_id,event_id,opened_at,reason) VALUES($1,$2,now()-interval '1 minute','synthetic')",
  [org, event],
);
const devices = [];
const points = [];
for (let i = 0; i < 10; i++)
  points.push(
    (
      await db.query(
        "INSERT INTO app.checkpoints(organization_id,event_id,race_category_id,name,kind,sequence) VALUES($1,$2,$3,$4,'intermediate',$5) RETURNING id",
        [org, event, cat, "CP " + i, i + 1],
      )
    ).rows[0].id,
  );
for (let i = 0; i < 20; i++) {
  const cp = points[Math.floor(i / 2)],
    raw = token();
  const credential = (
    await db.query(
      "INSERT INTO app.checkpoint_credentials(organization_id,event_id,checkpoint_id,code,password_hash,label,expires_at) VALUES($1,$2,$3,$4,'not-login-enabled',$5,now()+interval '2 hours') RETURNING id",
      [org, event, cp, randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase(), "Device " + i],
    )
  ).rows[0].id;
  const session = (
    await db.query(
      "INSERT INTO app.checkpoint_sessions(token_hash,organization_id,event_id,checkpoint_id,credential_id,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '2 hours') RETURNING id",
      [digest(raw), org, event, cp, credential],
    )
  ).rows[0].id;
  devices.push({ raw, session, grant: "", index: i });
}
function request(index, path, raw, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body),
      started = performance.now();
    const req = http.request(
      endpoint + "/api/v1" + path,
      {
        method: payload ? "POST" : "GET",
        agent: agents[index],
        headers: {
          origin: "http://127.0.0.1:5173",
          cookie: (index === 20 ? "cc_session=" : "cc_checkpoint=") + raw,
          "x-csrf-token": csrfFor(raw),
          ...(payload
            ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (text += c));
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode,
              body: JSON.parse(text),
              ms: performance.now() - started,
            });
          } catch {
            reject(new Error("Invalid API response"));
          }
        });
      },
    );
    req.setTimeout(10000, () => req.destroy(new Error("Request timeout")));
    req.on("error", reject);
    req.end(payload);
  });
}
for (const d of devices) {
  const r = await request(d.index, "/field/prepare", d.raw, {});
  assert.equal(r.status, 200);
  d.grant = r.body.grant.id;
}
let issued = 0,
  completed = 0,
  replays = 0,
  failures = [],
  latencies = [],
  burstLatencies = [],
  panelLatencies = [],
  backlogMax = 0;
const cpuStart = process.cpuUsage(),
  started = performance.now(),
  samples = [];
let sampling = false;
const sample = async () => {
  if (sampling) return;
  sampling = true;
  try {
    const r = await request(20, "/events/" + event + "/observations?limit=50", admin);
    panelLatencies.push(r.ms);
    if (r.status !== 200) failures.push({ phase: "panel", status: r.status });
    const state = (
      await db.query(
        "SELECT count(*)::int connections,count(*) FILTER(WHERE wait_event_type='Lock')::int waiting FROM pg_stat_activity WHERE datname=current_database()",
      )
    ).rows[0];
    samples.push({
      elapsed: Math.round((performance.now() - started) / 1000),
      rss: process.memoryUsage().rss,
      poolWaiting: pool.waitingCount,
      ...state,
    });
  } catch {
    failures.push({ phase: "sample", status: 0 });
  } finally {
    sampling = false;
  }
};
const sampler = setInterval(() => void sample(), 10000),
  progress = setInterval(
    () =>
      console.log(
        JSON.stringify({
          elapsedSeconds: Math.round((performance.now() - started) / 1000),
          issued,
          completed,
          errors: failures.length,
          backlog: issued - completed,
        }),
      ),
    30000,
  );
async function send(d, phase) {
  const now = new Date().toISOString(),
    payload = {
      client_event_id: randomUUID(),
      bib: String(issued % 1000).padStart(5, "0"),
      raw_captured_at: now,
      capture_session_id: d.session,
      grant_id: d.grant,
      clock: { offset_ms: 0, rtt_ms: 1, measured_at: now, uncertain: false },
    };
  issued++;
  backlogMax = Math.max(backlogMax, issued - completed);
  const r = await request(d.index, "/field/sync", d.raw, payload);
  (phase === "steady" ? latencies : burstLatencies).push(r.ms);
  if (r.status !== 201) failures.push({ phase, status: r.status, code: r.body.error?.code });
  else completed++;
  if (phase === "burst" && completed % 1000 === 0) {
    const replay = await request(d.index, "/field/sync", d.raw, payload);
    if (replay.status === 200 && replay.body.id === r.body.id) replays++;
    else failures.push({ phase: "replay", status: replay.status });
  }
}
try {
  // Twenty independent devices, one shared network address as on venue Wi-Fi.
  await Promise.all(
    devices.map(async (d) => {
      for (let n = 0; n < seconds; n++) {
        await sleep(Math.max(0, started + n * 1000 + d.index * 50 - performance.now()));
        await send(d, "steady");
      }
    }),
  );
  const steadyElapsed = (performance.now() - started) / 1000;
  const burstStart = performance.now();
  await Promise.all(
    devices.map(async (d) => {
      for (let n = 0; n < burstCount; n++) {
        await sleep(Math.max(0, burstStart + n * 300 + d.index * 10 - performance.now()));
        await send(d, "burst");
      }
    }),
  );
  clearInterval(sampler);
  clearInterval(progress);
  while (sampling) await sleep(20);
  const counts = (
    await db.query(
      "SELECT count(*)::int total,count(DISTINCT client_event_id)::int unique_ids FROM app.observations WHERE organization_id=$1 AND event_id=$2",
      [org, event],
    )
  ).rows[0];
  const stats = (values) => {
    const a = [...values].sort((a, b) => a - b);
    return {
      count: a.length,
      p50_ms: a[Math.floor(a.length * 0.5)] ?? null,
      p95_ms: a[Math.floor(a.length * 0.95)] ?? null,
      p99_ms: a[Math.floor(a.length * 0.99)] ?? null,
      max_ms: a.at(-1) ?? null,
    };
  };
  const report = {
    passed:
      failures.length === 0 &&
      counts.total === issued &&
      counts.unique_ids === issued &&
      stats(latencies).p95_ms <= 1000,
    environment: "Windows Node + Docker PostgreSQL local; HTTP real; shared IP; runtime pool=5",
    devices: 20,
    checkpoints: 10,
    participantsSynthetic: 1000,
    requestedSeconds: seconds,
    steadyElapsedSeconds: steadyElapsed,
    burstItemsPerDevice: burstCount,
    burstElapsedSeconds: (performance.now() - burstStart) / 1000,
    issued,
    completed,
    counts,
    replays,
    errors: failures.slice(0, 50),
    errorCount: failures.length,
    steady: stats(latencies),
    burst: stats(burstLatencies),
    panel: stats(panelLatencies),
    backlogMax,
    cpuMicroseconds: process.cpuUsage(cpuStart),
    samples,
    organization_id: org,
    event_id: event,
  };
  await mkdir("tmp/sprint-05", { recursive: true });
  await writeFile("tmp/sprint-05/load-" + seconds + ".json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, samples: undefined, errors: undefined }));
  if (!report.passed) process.exitCode = 1;
} finally {
  clearInterval(sampler);
  clearInterval(progress);
  agents.forEach((a) => a.destroy());
  await app.close();
  await pool.end();
  await db.end();
}
