import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { buildApp } from "../../apps/api/src/app.js";
import { migrate } from "../../apps/api/src/migrations.js";

test("PostgreSQL real: migration repetível, rollback e readiness", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "TEST_DATABASE_URL é obrigatória; integração não pode ser ignorada");
  assert.ok(new URL(connectionString).pathname.endsWith("_test"), "Use banco com sufixo _test");
  assert.notEqual(
    new URL(connectionString).pathname,
    new URL(process.env.DATABASE_URL ?? connectionString).pathname,
    "Banco de teste deve ser diferente do desenvolvimento",
  );
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 2000 });
  const directory = await mkdtemp(join(tmpdir(), "tempogo-migration-"));
  const app = buildApp(async () => {
    await pool.query("SELECT 1");
  });
  try {
    const migrations = new URL("../../apps/api/migrations/", import.meta.url);
    await migrate(pool, migrations);
    assert.deepEqual(await migrate(pool, migrations), []);
    assert.equal((await app.inject("/api/v1/health/ready")).statusCode, 200);
    const history = await pool.query("SELECT count(*)::int AS total FROM schema_migrations");
    const names = (await readdir(migrations)).filter((n) => n.endsWith(".sql"));
    assert.equal(history.rows[0].total, names.length);
    for (const name of names)
      await writeFile(join(directory, name), await readFile(new URL(name, migrations)));
    // Uma cópia com checksum diferente deve ser recusada, sem alterar histórico.
    await writeFile(join(directory, "001_foundation.sql"), "SELECT 2;");
    await assert.rejects(migrate(pool, pathToFileURL(`${directory}/`)), /alterada/);
    // Uma migration nova com falha precisa desfazer o DDL executado antes do erro.
    await writeFile(
      join(directory, "001_foundation.sql"),
      await readFile(new URL("001_foundation.sql", migrations)),
    );
    await writeFile(
      join(directory, "999_invalid.sql"),
      "CREATE TABLE app.rollback_probe (id int); SELECT * FROM app.nonexistent_table;",
    );
    await assert.rejects(migrate(pool, pathToFileURL(`${directory}/`)));
    assert.equal(
      (await pool.query("SELECT to_regclass('app.rollback_probe') AS name")).rows[0].name,
      null,
    );
    assert.equal(
      (await pool.query("SELECT count(*)::int AS total FROM schema_migrations")).rows[0].total,
      names.length,
    );
  } finally {
    await app.close();
    await pool.end();
    assert.ok(directory.startsWith(join(tmpdir(), "tempogo-migration-")));
    await rm(directory, { recursive: true, force: true });
  }
});
