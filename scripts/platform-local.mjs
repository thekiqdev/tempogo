import { randomBytes } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import pg from "pg";

const raw = process.env.MIGRATION_DATABASE_URL;
if (!raw) throw new Error("MIGRATION_DATABASE_URL local necessária");
const url = new URL(raw);
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/cronocheckpoint" ||
  process.env.NODE_ENV === "production"
)
  throw new Error("Somente banco local de desenvolvimento");
const db = new pg.Pool({ connectionString: raw });
try {
  const env = await readFile(".env", "utf8");
  if (/^PLATFORM_DATABASE_URL=/m.test(env) || /^PLATFORM_MFA_KEY=/m.test(env)) {
    if (!process.env.PLATFORM_DATABASE_URL || !process.env.PLATFORM_MFA_KEY)
      throw new Error("Configuração parcial; preserve a chave existente e complete manualmente");
    console.log("Configuração existente preservada.");
  } else {
    if (
      (await db.query("SELECT 1 FROM pg_roles WHERE rolname='cronocheckpoint_platform_runtime'"))
        .rowCount
    )
      throw new Error("Runtime existente sem configuração local; não rotacionar automaticamente");
    const password = randomBytes(32).toString("hex"),
      key = randomBytes(32).toString("hex");
    await db.query(
      "CREATE ROLE cronocheckpoint_platform_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '" +
        password +
        "'",
    );
    await db.query("GRANT cronocheckpoint_platform TO cronocheckpoint_platform_runtime");
    url.username = "cronocheckpoint_platform_runtime";
    url.password = password;
    await appendFile(
      ".env",
      "\n# Plataforma local — não compartilhar esta chave\nPLATFORM_DATABASE_URL=" +
        url.href +
        "\nPLATFORM_MFA_KEY=" +
        key +
        "\n",
    );
    console.log(
      "Runtime e chave locais configurados sem imprimir segredos. Reinicie a API para carregar as variáveis.",
    );
  }
} finally {
  await db.end();
}
