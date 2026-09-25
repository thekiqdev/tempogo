import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const image = "postgres:18.6-bookworm",
  suffix = randomUUID().slice(0, 8),
  source = "cc-pitr-source-" + suffix,
  restored = "cc-pitr-restore-" + suffix;
const volumes = {
  data: "cc-pitr-data-" + suffix,
  archive: "cc-pitr-wal-" + suffix,
  base: "cc-pitr-base-" + suffix,
  restore: "cc-pitr-restored-" + suffix,
};
const folder = "tmp/sprint-05/pitr-" + suffix;
await mkdir(folder, { recursive: true });
async function docker(args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const chunks = [];
    let error = "";
    p.stdout.on("data", (c) => chunks.push(c));
    p.stderr.on("data", (c) => (error += c));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(new Error("Docker command failed: " + error.slice(-2000))),
    );
    p.stdin.on("error", () => {});
    p.stdin.end(input);
  });
}
async function sql(container, query) {
  return (
    await docker(
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-X",
        "-q",
        "-t",
        "-A",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      query,
    )
  )
    .toString()
    .trim();
}
async function ready(container) {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await sql(container, "SELECT 1")) === "1") return;
    } catch {}
    await sleep(1000);
  }
  throw new Error("Database did not start");
}
const schemaFiles = (await readdir("apps/api/migrations")).filter((f) => f.endsWith(".sql")).sort();
const seed = `DO $$ DECLARE org uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); ev uuid:=gen_random_uuid(); cat uuid:=gen_random_uuid(); cp uuid:=gen_random_uuid(); cred uuid:=gen_random_uuid(); sess uuid:=gen_random_uuid(); device uuid:=gen_random_uuid(); BEGIN
 INSERT INTO app.organizations(id,name) VALUES(org,'Restore synthetic'),(other_org,'Other tenant');
 INSERT INTO app.users(id,email) VALUES(u,'restore@synthetic.test');
 INSERT INTO app.memberships(organization_id,user_id) VALUES(org,u);
 INSERT INTO app.events(id,organization_id,name,local_date,timezone,state,created_by) VALUES(ev,org,'Restore race',CURRENT_DATE,'UTC','closed',u);
 INSERT INTO app.race_categories(id,organization_id,event_id,name) VALUES(cat,org,ev,'5k');
 INSERT INTO app.checkpoints(id,organization_id,event_id,race_category_id,name,kind,sequence) VALUES(cp,org,ev,cat,'Finish','finish',1);
 INSERT INTO app.checkpoint_credentials(id,organization_id,event_id,checkpoint_id,device_id,code,password_hash,label,expires_at) VALUES(cred,org,ev,cp,device,'ABCDEF01','disabled','Restore phone',now()+interval '1 hour');
 INSERT INTO app.checkpoint_sessions(id,token_hash,organization_id,event_id,checkpoint_id,credential_id,expires_at) VALUES(sess,'synthetic-disabled',org,ev,cp,cred,now()+interval '1 hour');
 INSERT INTO app.observations(organization_id,event_id,checkpoint_id,session_id,device_id,client_event_id,bib,raw_captured_at,canonical_payload)
 SELECT org,ev,cp,sess,device,gen_random_uuid(),lpad(n::text,8,'0'),clock_timestamp(),jsonb_build_object('bib',lpad(n::text,8,'0')) FROM generate_series(1,1000) n;
 INSERT INTO app.audit_events(organization_id,actor_id,action,resource_id,details) SELECT org,u,'observation.created',id,jsonb_build_object('event_id',ev) FROM app.observations WHERE organization_id=org;
 INSERT INTO app.observation_flags(organization_id,observation_id,reason) SELECT org,id,'recovery' FROM app.observations WHERE organization_id=org LIMIT 1;
 INSERT INTO app.observation_revisions(organization_id,observation_id,request_id,version,actor_id,reason,bib,captured_at,disposition,before_value,canonical_payload,reviewed_flags,reviewed_requests)
 SELECT org,id,gen_random_uuid(),1,u,'Conferência de restauração',bib,raw_captured_at,'accepted','{}','{}',ARRAY['recovery'],ARRAY[]::uuid[] FROM app.observations WHERE organization_id=org LIMIT 1;
 END $$;
 CREATE TABLE public.restore_probe(id int PRIMARY KEY,committed_at timestamptz NOT NULL DEFAULT clock_timestamp());
 INSERT INTO public.restore_probe(id) VALUES(1);`;
const fingerprint = `SELECT json_build_object('observations', (SELECT count(*) FROM app.observations),'audit',(SELECT count(*) FROM app.audit_events),'revisions',(SELECT count(*) FROM app.observation_revisions),'raw_hash',(SELECT md5(string_agg(row_to_json(o)::text,'' ORDER BY id)) FROM app.observations o),'audit_hash',(SELECT md5(string_agg(row_to_json(a)::text,'' ORDER BY id)) FROM app.audit_events a),'revision_hash',(SELECT md5(string_agg(row_to_json(r)::text,'' ORDER BY id)) FROM app.observation_revisions r),'rls_tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND relrowsecurity AND relforcerowsecurity))::text;`;
let sourceStarted = false,
  restoreStarted = false;
try {
  for (const v of Object.values(volumes)) await docker(["volume", "create", v]);
  await docker([
    "run",
    "--rm",
    "--network",
    "none",
    "-v",
    volumes.archive + ":/archive",
    "-v",
    volumes.base + ":/backup",
    image,
    "chown",
    "postgres:postgres",
    "/archive",
    "/backup",
  ]);
  await docker([
    "run",
    "-d",
    "--name",
    source,
    "--network",
    "none",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "-v",
    volumes.data + ":/var/lib/postgresql",
    "-v",
    volumes.archive + ":/archive",
    "-v",
    volumes.base + ":/backup",
    image,
    "postgres",
    "-c",
    "wal_level=replica",
    "-c",
    "archive_mode=on",
    "-c",
    "archive_timeout=60s",
    "-c",
    "archive_command=test ! -f /archive/%f && cp %p /archive/%f",
  ]);
  sourceStarted = true;
  await ready(source);
  for (const file of schemaFiles)
    await sql(source, await readFile("apps/api/migrations/" + file, "utf8"));
  await sql(source, seed);
  const before = JSON.parse(await sql(source, fingerprint));
  const backupStarted = performance.now();
  await docker([
    "exec",
    source,
    "pg_basebackup",
    "-U",
    "postgres",
    "-h",
    "/var/run/postgresql",
    "-D",
    "/backup/base",
    "-X",
    "stream",
    "-c",
    "fast",
  ]);
  const archive = await docker(["exec", source, "tar", "-C", "/backup/base", "-cf", "-", "."]);
  const key = randomBytes(32),
    nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, nonce);
  const sealed = Buffer.concat([
    nonce,
    cipher.update(archive),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  await writeFile(folder + "/base.tar.aesgcm", sealed, { mode: 0o600 });
  await writeFile(folder + "/local-drill.key", key, { mode: 0o600 });
  function decrypt(bytes) {
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]);
  }
  const tampered = Buffer.from(sealed);
  tampered[20] ^= 1;
  assert.throws(() => decrypt(tampered));
  const decrypted = decrypt(await readFile(folder + "/base.tar.aesgcm"));
  assert.equal(
    createHash("sha256").update(archive).digest("hex"),
    createHash("sha256").update(decrypted).digest("hex"),
  );
  const backupSeconds = (performance.now() - backupStarted) / 1000;
  await sql(source, "INSERT INTO public.restore_probe(id) VALUES(2)");
  const target = await sql(source, "SELECT clock_timestamp()");
  assert.match(target, /^[0-9 .:+-]+$/);
  await sleep(1100);
  await sql(source, "INSERT INTO public.restore_probe(id) VALUES(3)");
  const failureTime = await sql(source, "SELECT max(committed_at) FROM public.restore_probe");
  await sql(source, "SELECT pg_switch_wal()");
  for (let i = 0; i < 30; i++) {
    const files = (await docker(["exec", source, "sh", "-c", "ls /archive"])).toString();
    if (
      files.match(/[A-F0-9]{24}/) &&
      Number(await sql(source, "SELECT archived_count FROM pg_stat_archiver")) >= 2
    )
      break;
    await sleep(1000);
  }
  const restoreStart = performance.now();
  await docker(
    [
      "run",
      "--rm",
      "-i",
      "--network",
      "none",
      "-v",
      volumes.restore + ":/restore",
      image,
      "sh",
      "-c",
      "mkdir -p /restore/18/docker && tar -xf - -C /restore/18/docker && chown -R postgres:postgres /restore",
    ],
    decrypted,
  );
  const config =
    "restore_command = 'cp /archive/%f %p'\nrecovery_target_time = '" +
    target +
    "'\nrecovery_target_action = 'promote'\n";
  await docker(
    [
      "run",
      "--rm",
      "-i",
      "--network",
      "none",
      "-v",
      volumes.restore + ":/restore",
      image,
      "sh",
      "-c",
      "cat >> /restore/18/docker/postgresql.auto.conf && touch /restore/18/docker/recovery.signal && chown postgres:postgres /restore/18/docker/recovery.signal",
    ],
    config,
  );
  await docker([
    "run",
    "-d",
    "--name",
    restored,
    "--network",
    "none",
    "-v",
    volumes.restore + ":/var/lib/postgresql",
    "-v",
    volumes.archive + ":/archive:ro",
    image,
    "postgres",
    "-c",
    "archive_mode=off",
  ]);
  restoreStarted = true;
  await ready(restored);
  for (let i = 0; i < 30; i++) {
    if ((await sql(restored, "SELECT pg_is_in_recovery()")) === "f") break;
    await sleep(1000);
  }
  assert.equal(await sql(restored, "SELECT pg_is_in_recovery()"), "f");
  const after = JSON.parse(await sql(restored, fingerprint));
  assert.deepEqual(after, before);
  assert.equal(
    await sql(restored, "SELECT string_agg(id::text,',' ORDER BY id) FROM public.restore_probe"),
    "1,2",
  );
  const rls = await sql(
    restored,
    "SET ROLE cronocheckpoint_app; SELECT count(*) FROM app.observations",
  );
  assert.equal(rls, "0");
  const recoveredTime = await sql(restored, "SELECT max(committed_at) FROM public.restore_probe");
  const report = {
    passed: true,
    source,
    restored,
    volumes,
    backupSeconds,
    restoreSeconds: (performance.now() - restoreStart) / 1000,
    controlledRpoSeconds: (Date.parse(failureTime) - Date.parse(recoveredTime)) / 1000,
    target,
    before,
    after,
    walReplayProved: true,
    afterTargetExcluded: true,
    tamperingRejected: true,
    rlsNoContextRows: 0,
    productionRpoProved: false,
    productionRtoProved: false,
    limitation:
      "Isolated local synthetic drill. WAL remains on same host. Encryption key colocated for reproducibility only; separate key custody/offsite WAL required in VPS.",
  };
  await writeFile(folder + "/result.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  if (restoreStarted) await docker(["stop", restored]);
  if (sourceStarted) await docker(["stop", source]);
  // Retain isolated stopped containers and volumes for inspection; never remove shared databases.
}
