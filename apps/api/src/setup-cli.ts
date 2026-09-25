import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import pg from "pg";
import { migrate } from "./migrations.js";
import { assertPlatformRole, assertRuntimeRole } from "./runtime-role.js";

// Keep generated credentials before changing the database, so a failed run can resume.
const output = resolve("tempogo-runtime.env");
class SetupError extends Error {}
let pool: pg.Pool | undefined;
try {
  const source = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!source)
    throw new SetupError("Configure DATABASE_URL com a URL de conexão interna do PostgreSQL.");
  let admin: URL;
  try {
    admin = new URL(source);
  } catch {
    throw new SetupError(
      "DATABASE_URL precisa ser uma URL PostgreSQL completa, não apenas o host.",
    );
  }
  if (
    !["postgres:", "postgresql:"].includes(admin.protocol) ||
    !admin.hostname ||
    !admin.pathname.slice(1)
  )
    throw new SetupError("Informe uma URL PostgreSQL com host e nome do banco.");
  const origin = process.env.PUBLIC_ORIGIN;
  if (!origin || !/^https:\/\/[^/]+$/.test(origin))
    throw new SetupError(
      "Configure PUBLIC_ORIGIN com o domínio HTTPS do frontend, sem barra final.",
    );
  pool = new pg.Pool({ connectionString: source, connectionTimeoutMillis: 5000 });
  await pool.query("SELECT 1");
  console.log("Conexão PostgreSQL confirmada.");
  let values: Record<string, string | undefined>;
  try {
    values = parseEnv(await readFile(output, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    const existing = await pool.query(
      "SELECT rolname FROM pg_roles WHERE rolname IN ('cronocheckpoint_runtime','cronocheckpoint_platform_runtime')",
    );
    if (existing.rowCount)
      throw new SetupError(
        "Acessos já existem. Preserve as senhas atuais: restaure tempogo-runtime.env para repetir o setup. Nenhuma senha foi alterada.",
      );
    const key = process.env.PLATFORM_MFA_KEY ?? randomBytes(32).toString("hex");
    if (!/^[a-fA-F0-9]{64}$/.test(key))
      throw new SetupError(
        "PLATFORM_MFA_KEY inválida: exige 64 caracteres hexadecimais. Em instalação nova, remova o valor de exemplo para gerar automaticamente.",
      );
    const connection = (role: string) => {
      const url = new URL(admin);
      url.username = role;
      url.password = randomBytes(32).toString("hex");
      return url.toString();
    };
    values = {
      NODE_ENV: "production",
      API_HOST: "0.0.0.0",
      API_PORT: "3001",
      PUBLIC_ORIGIN: origin,
      DATABASE_URL: connection("cronocheckpoint_runtime"),
      PLATFORM_DATABASE_URL: connection("cronocheckpoint_platform_runtime"),
      PLATFORM_MFA_KEY: key,
      METRICS_TOKEN:
        process.env.METRICS_TOKEN && !process.env.METRICS_TOKEN.startsWith("REPLACE")
          ? process.env.METRICS_TOKEN
          : randomBytes(32).toString("hex"),
    };
    // Exclude administrative credentials. SMTP stays in the service's existing environment.
    await writeFile(
      output,
      Object.entries(values)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") + "\n",
      { flag: "wx", mode: 0o600 },
    );
  }
  if (!/^[a-fA-F0-9]{64}$/.test(values.PLATFORM_MFA_KEY ?? ""))
    throw new SetupError("Arquivo de configuração com chave MFA inválida.");
  const roles = [
    ["DATABASE_URL", "cronocheckpoint_runtime", "cronocheckpoint_app"],
    ["PLATFORM_DATABASE_URL", "cronocheckpoint_platform_runtime", "cronocheckpoint_platform"],
  ] as const;
  for (const [key, role] of roles) {
    const url = new URL(values[key]!);
    if (
      url.host !== admin.host ||
      url.pathname !== admin.pathname ||
      url.username !== role ||
      !/^[a-f0-9]{64}$/.test(url.password)
    )
      throw new SetupError(
        "tempogo-runtime.env não corresponde ao banco informado. Preserve o arquivo e confira o ambiente.",
      );
  }
  const applied = await migrate(pool, new URL("../migrations/", import.meta.url));
  console.log(`${applied.length} migrations aplicadas; esquema atualizado.`);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(74892002)");
    for (const [key, role, group] of roles) {
      const found = await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role]);
      if (!found.rowCount) {
        const password = new URL(values[key]!).password;
        const statement = await client.query<{ sql: string }>(
          "SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', $1::text, $2::text) sql",
          [role, password],
        );
        await client.query(statement.rows[0]!.sql);
        await client.query(`GRANT ${group} TO ${role}`);
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  for (const [key] of roles) {
    const runtime = new pg.Pool({ connectionString: values[key], connectionTimeoutMillis: 5000 });
    try {
      await (key === "DATABASE_URL" ? assertRuntimeRole(runtime) : assertPlatformRole(runtime));
    } finally {
      await runtime.end();
    }
  }
  console.log("Instalação concluída e conexões da API verificadas.");
  console.log(
    `Configuração salva em ${output}. Copie seu conteúdo para Environment do backend e guarde uma cópia segura antes de recriar o container.`,
  );
  console.log(
    "Preserve o SMTP existente. Remova MIGRATION_DATABASE_URL do serviço permanente e faça o deploy. Nenhum segredo foi impresso neste log.",
  );
} catch (e) {
  const code = (e as NodeJS.ErrnoException).code;
  const known: Record<string, string> = {
    ENOTFOUND: "Host PostgreSQL não encontrado. Use o host interno e a rede do mesmo projeto.",
    ECONNREFUSED: "Conexão recusada. Confira host, porta 5432 e estado do banco.",
    "28P01": "Senha ou usuário do PostgreSQL incorretos.",
    "42501":
      "O usuário informado não tem permissão para preparar o banco. Use a conexão administrativa nesta instalação.",
    "3D000": "Banco não encontrado. Confira o nome no final da URL.",
    EACCES: "Sem permissão para gravar tempogo-runtime.env. Execute em /app/apps/api.",
  };
  // Only our own validation messages are printed; driver errors can contain connection details.
  console.error(
    code
      ? (known[code] ?? `Instalação não concluída (código ${code}). Confira conexão e permissões.`)
      : e instanceof SetupError
        ? e.message
        : "Instalação não concluída. Confira conexão, migrations e permissões.",
  );
  process.exitCode = 1;
} finally {
  await pool?.end();
}
