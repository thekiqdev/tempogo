import pg from "pg";
import { migrate } from "./migrations.js";

const connectionString = process.env.MIGRATION_DATABASE_URL;
const password = process.env.RUNTIME_PASSWORD;
if (
  process.env.LOCAL_HOMOLOG !== "true" ||
  !connectionString ||
  !password ||
  !/^[a-f0-9]{64}$/.test(password)
)
  throw new Error("Configuração exclusiva da homologação local incompleta");
const target = new URL(connectionString);
if (target.hostname !== "database" || target.pathname !== "/cronocheckpoint_homolog")
  throw new Error("Alvo de homologação inesperado");
const pool = new pg.Pool({ connectionString });
try {
  await migrate(pool, new URL("../migrations/", import.meta.url));
  if (
    !(await pool.query("SELECT 1 FROM pg_roles WHERE rolname='cronocheckpoint_runtime'")).rowCount
  )
    await pool.query(
      "CREATE ROLE cronocheckpoint_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
    );
  await pool.query("ALTER ROLE cronocheckpoint_runtime WITH PASSWORD '" + password + "'");
  await pool.query("GRANT cronocheckpoint_app TO cronocheckpoint_runtime");
  const platformPassword = process.env.PLATFORM_RUNTIME_PASSWORD;
  if (platformPassword) {
    if (!/^[a-f0-9]{64}$/.test(platformPassword)) throw new Error("Credencial de runtime inválida");
    if (
      !(await pool.query("SELECT 1 FROM pg_roles WHERE rolname='cronocheckpoint_platform_runtime'"))
        .rowCount
    )
      await pool.query(
        "CREATE ROLE cronocheckpoint_platform_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
      );
    await pool.query(
      "ALTER ROLE cronocheckpoint_platform_runtime WITH PASSWORD '" + platformPassword + "'",
    );
    await pool.query("GRANT cronocheckpoint_platform TO cronocheckpoint_platform_runtime");
  }
  console.log("Homologação local migrada com runtime separado.");
} finally {
  await pool.end();
}
