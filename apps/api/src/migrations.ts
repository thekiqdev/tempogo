import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type pg from "pg";

// Uma transação e lock global evitam aplicar migrations concorrentes/parciais.
export async function migrate(pool: pg.Pool, directory: URL): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(74892001)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const files = (await readdir(directory))
      .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
      .sort();
    const previous = await client.query<{ name: string; checksum: string }>(
      "SELECT name, checksum FROM schema_migrations ORDER BY name",
    );
    if (previous.rows.some((row) => !files.includes(row.name)))
      throw new Error("Migration aplicada ausente no diretório");
    for (const name of files) {
      const sql = await readFile(new URL(name, directory), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const old = previous.rows.find((row) => row.name === name);
      if (old) {
        if (old.checksum !== checksum)
          throw new Error(`Migration alterada após aplicação: ${name}`);
        continue;
      }
      if (previous.rows.some((row) => row.name > name))
        throw new Error(`Migration fora de ordem: ${name}`);
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [
        name,
        checksum,
      ]);
      applied.push(name);
    }
    await client.query("COMMIT");
    return applied;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
