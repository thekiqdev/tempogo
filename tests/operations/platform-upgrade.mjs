import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { migrate } from "../../apps/api/src/migrations.ts";
import { newTotpSecret, platformCipher, totp } from "../../apps/api/src/platform-crypto.ts";

const source = process.env.TEST_DATABASE_URL;
assert.ok(source && new URL(source).pathname.endsWith("_test"));
const address = new URL(source);
assert.ok(
  ["127.0.0.1", "localhost"].includes(address.hostname) && address.port === "55432",
  "Ensaio exclusivo do Postgres Docker local",
);
const suffix = randomUUID().replaceAll("-", ""),
  name = "cc_sa06_" + suffix + "_test",
  restored = name.replace("_test", "_restore_test");
const admin = new pg.Pool({ connectionString: source });
const url = new URL(source);
url.pathname = "/" + name;
const restoreUrl = new URL(source);
restoreUrl.pathname = "/" + restored;
let db, copy;
async function docker(args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn("docker", ["exec", "-i", "cronocheckpoint-database-1", ...args], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out = [];
    p.stdout.on("data", (v) => out.push(v));
    p.stderr.on("data", () => {});
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(out))
        : reject(Error("Falha no dump/restore local: " + code)),
    );
    p.stdin.on("error", () => {});
    p.stdin.end(input);
  });
}
try {
  await admin.query('CREATE DATABASE "' + name + '"');
  await admin.query('CREATE DATABASE "' + restored + '"');
  db = new pg.Pool({ connectionString: url.href });
  copy = new pg.Pool({ connectionString: restoreUrl.href });
  const prior = resolve("tmp/sa-06/prior-" + suffix);
  await mkdir(prior, { recursive: true });
  const migrationDir = new URL("../../apps/api/migrations/", import.meta.url);
  for (const file of await readdir(migrationDir))
    if (/^00[1-6]_.*\.sql$/.test(file))
      await copyFile(new URL(file, migrationDir), resolve(prior, file));
  await migrate(db, pathToFileURL(prior + "/"));
  const actor = (
    await db.query(
      "INSERT INTO app.users(email,password_hash) VALUES('migration@sa06.test','synthetic') RETURNING id",
    )
  ).rows[0].id;
  const a = (
    await db.query("INSERT INTO app.organizations(name) VALUES('Legado ativo') RETURNING id")
  ).rows[0].id;
  const b = (
    await db.query(
      "INSERT INTO app.organizations(name,active) VALUES('Legado inativo',false) RETURNING id",
    )
  ).rows[0].id;
  await db.query("INSERT INTO app.memberships(organization_id,user_id) VALUES($1,$2),($3,$2)", [
    a,
    actor,
    b,
  ]);
  const event = (
    await db.query(
      "INSERT INTO app.events(organization_id,name,local_date,timezone,state,created_by) VALUES($1,'Corrida anterior',CURRENT_DATE,'UTC','running',$2) RETURNING id",
      [a, actor],
    )
  ).rows[0].id;
  const category = (
    await db.query(
      "INSERT INTO app.race_categories(organization_id,event_id,name) VALUES($1,$2,'5km') RETURNING id",
      [a, event],
    )
  ).rows[0].id;
  const checkpoint = (
    await db.query(
      "INSERT INTO app.checkpoints(organization_id,event_id,race_category_id,name,kind,sequence) VALUES($1,$2,$3,'Chegada','finish',1) RETURNING id",
      [a, event, category],
    )
  ).rows[0].id;
  const credential = (
    await db.query(
      "INSERT INTO app.checkpoint_credentials(organization_id,event_id,checkpoint_id,code,password_hash,label,expires_at) VALUES($1,$2,$3,'ABCDEF12','synthetic','Teste',now()+interval '1 hour') RETURNING id,device_id",
      [a, event, checkpoint],
    )
  ).rows[0];
  const session = (
    await db.query(
      "INSERT INTO app.checkpoint_sessions(token_hash,organization_id,event_id,checkpoint_id,credential_id,expires_at) VALUES('synthetic',$1,$2,$3,$4,now()+interval '1 hour') RETURNING id",
      [a, event, checkpoint, credential.id],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO app.observations(organization_id,event_id,checkpoint_id,session_id,device_id,client_event_id,bib,raw_captured_at,canonical_payload) VALUES($1,$2,$3,$4,$5,$6,'0001',now(),'{\"bib\":\"0001\"}')",
    [a, event, checkpoint, session, credential.device_id, randomUUID()],
  );
  async function snapshot(pool) {
    const result = {};
    for (const table of [
      "events",
      "race_categories",
      "checkpoints",
      "checkpoint_credentials",
      "checkpoint_sessions",
      "observations",
    ])
      result[table] = (await pool.query("SELECT * FROM app." + table + " ORDER BY id")).rows;
    result.memberships = (
      await pool.query(
        "SELECT organization_id,user_id,role FROM app.memberships ORDER BY organization_id,user_id",
      )
    ).rows;
    return JSON.stringify(result);
  }
  const before = await snapshot(db);
  const applied = await migrate(db, migrationDir);
  assert.equal(applied.length, 4);
  assert.equal(await snapshot(db), before);
  assert.deepEqual(await migrate(db, migrationDir), []);
  const organizations = (
    await db.query("SELECT id,status,responsible_user_id FROM app.organizations ORDER BY id")
  ).rows;
  assert.equal(organizations.find((o) => o.id === a).status, "active");
  assert.equal(organizations.find((o) => o.id === b).status, "suspended");
  assert.ok(organizations.every((o) => o.responsible_user_id === actor));
  const key = randomBytes(32).toString("hex"),
    secret = newTotpSecret();
  await db.query("INSERT INTO app.platform_privileges(user_id,state) VALUES($1,'active')", [actor]);
  await db.query("INSERT INTO app.platform_mfa(user_id,secret_cipher) VALUES($1,$2)", [
    actor,
    platformCipher(key).seal(secret, actor),
  ]);
  const dump = await docker(["pg_dump", "-U", address.username, "-d", name, "-Fc", "--no-owner"]);
  await docker(
    ["pg_restore", "-U", address.username, "-d", restored, "--no-owner", "--exit-on-error"],
    dump,
  );
  assert.equal(await snapshot(copy), before);
  const restoredCipher = (
    await copy.query("SELECT secret_cipher FROM app.platform_mfa WHERE user_id=$1", [actor])
  ).rows[0].secret_cipher;
  assert.equal(platformCipher(key).open(restoredCipher, actor), secret);
  assert.throws(() => platformCipher(randomBytes(32).toString("hex")).open(restoredCipher, actor));
  assert.equal(totp(platformCipher(key).open(restoredCipher, actor), 100), totp(secret, 100));
  assert.deepEqual(await migrate(copy, migrationDir), []);
  const result = {
    passed: true,
    upgradeFrom: "006",
    applied,
    preservedLegacyData: true,
    restoredLogicalBackup: true,
    mfaRequiresExternalKey: true,
    idempotentMigrations: true,
    backupSha256: createHash("sha256").update(dump).digest("hex"),
    recordedAt: new Date().toISOString(),
  };
  await mkdir("tmp/sa-06", { recursive: true });
  await writeFile("tmp/sa-06/migration-restore.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await db?.end();
  await copy?.end();
  for (const owned of [name, restored])
    await admin.query('DROP DATABASE IF EXISTS "' + owned + '"');
  await admin.end();
}
