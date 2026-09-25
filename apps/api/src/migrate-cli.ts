import pg from "pg";
import { readConfig } from "./config.js";
import { migrate } from "./migrations.js";

const { connectionString } = readConfig({
  ...process.env,
  DATABASE_URL: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL,
});
const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 3000 });
try {
  const applied = await migrate(pool, new URL("../migrations/", import.meta.url));
  console.log(
    applied.length
      ? `Migrations aplicadas: ${applied.join(", ")}`
      : "Banco atualizado; nenhuma migration pendente.",
  );
} catch {
  console.error(
    "Migration falhou. Confira conexão, permissões e histórico; nenhuma alteração desta execução foi confirmada.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
