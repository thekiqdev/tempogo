import pg from "pg";

const url = process.env.MIGRATION_DATABASE_URL,
  password = process.env.PLATFORM_RUNTIME_PASSWORD,
  expected = process.env.EXPECTED_DATABASE_NAME;
if (!url || !expected || !password || !/^[A-Za-z0-9_-]{32,128}$/.test(password))
  throw new Error(
    "Configure MIGRATION_DATABASE_URL, EXPECTED_DATABASE_NAME e PLATFORM_RUNTIME_PASSWORD aleatória de 32–128 caracteres seguros",
  );
const pool = new pg.Pool({ connectionString: url });
try {
  if ((await pool.query("SELECT current_database() name")).rows[0].name !== expected)
    throw new Error("Banco não corresponde ao esperado");
  if (
    (await pool.query("SELECT 1 FROM pg_roles WHERE rolname='cronocheckpoint_platform_runtime'"))
      .rowCount
  )
    throw new Error(
      "Role já existe; preserve a credencial atual e siga o procedimento de rotação separado",
    );
  await pool.query("BEGIN");
  await pool.query(
    "CREATE ROLE cronocheckpoint_platform_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '" +
      password +
      "'",
  );
  await pool.query("GRANT cronocheckpoint_platform TO cronocheckpoint_platform_runtime");
  await pool.query("COMMIT");
  console.log(
    "Runtime limitado provisionado. Configure PLATFORM_DATABASE_URL no serviço da API e retire as credenciais de migration.",
  );
} catch {
  await pool.query("ROLLBACK").catch(() => {});
  console.error(
    "Provisionamento não aplicado. Confira banco esperado, role existente, migrations e variáveis; nenhum segredo foi impresso.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
