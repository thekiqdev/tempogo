import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("Conexão de migration obrigatória");
const target = new URL(url);
if (!["127.0.0.1", "localhost"].includes(target.hostname))
  throw new Error("Este bootstrap é exclusivo do banco local");
const pool = new pg.Pool({ connectionString: url });
try {
  const password = randomBytes(32).toString("hex");
  if (
    !(await pool.query("SELECT 1 FROM pg_roles WHERE rolname='cronocheckpoint_runtime'")).rowCount
  )
    await pool.query(
      "CREATE ROLE cronocheckpoint_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
    );
  await pool.query("ALTER ROLE cronocheckpoint_runtime WITH PASSWORD '" + password + "'");
  await pool.query("GRANT cronocheckpoint_app TO cronocheckpoint_runtime");
  target.username = "cronocheckpoint_runtime";
  target.password = password;
  let env = await readFile(".env", "utf8");
  env = env.replace(/^DATABASE_URL=.*$/m, "DATABASE_URL=" + target.href);
  if (!/^MIGRATION_DATABASE_URL=/m.test(env)) env += "\nMIGRATION_DATABASE_URL=" + url + "\n";
  await writeFile(".env", env);
  console.log("Credencial restrita de runtime criada/rotacionada em .env. Reinicie a API.");
} finally {
  await pool.end();
}
