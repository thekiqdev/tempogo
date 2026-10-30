import pg from "pg";
import { z } from "zod";
import { bootstrapPlatformWithPassword } from "./platform-admin.js";

let pool: pg.Pool | undefined;
try {
  const input = z
    .object({
      SUPERADMIN_EMAIL: z
        .string()
        .trim()
        .email()
        .transform((v) => v.toLowerCase()),
      SUPERADMIN_PASSWORD: z.string().min(12).max(128),
    })
    .safeParse(process.env);
  if (!input.success)
    throw new Error(
      "Configure SUPERADMIN_EMAIL válido e SUPERADMIN_PASSWORD com 12 a 128 caracteres.",
    );
  const connectionString = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString)
    throw new Error(
      "Configure a conexão administrativa em MIGRATION_DATABASE_URL ou DATABASE_URL.",
    );
  pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 });
  const forceFlag = (process.env.SUPERADMIN_FORCE_RESET ?? "").trim().toLowerCase();
  const force = forceFlag === "true" || forceFlag === "1" || forceFlag === "yes";
  await bootstrapPlatformWithPassword(
    pool,
    input.data.SUPERADMIN_EMAIL,
    input.data.SUPERADMIN_PASSWORD,
    { force },
  );
  console.log(
    force
      ? "Recuperação concluída: senha redefinida, privilégio de superadmin garantido e MFA limpo. Acesse /plataforma, configure o Authenticator e remova SUPERADMIN_PASSWORD, SUPERADMIN_EMAIL e SUPERADMIN_FORCE_RESET do ambiente."
      : "Primeiro superadmin criado sem envio de email. Acesse /plataforma com o email e a senha e configure MFA. Remova SUPERADMIN_PASSWORD e SUPERADMIN_EMAIL do ambiente após concluir.",
  );
} catch (e) {
  const message = e instanceof Error ? e.message : "";
  const permitted = [
    "Configure SUPERADMIN_EMAIL",
    "Configure a conexão administrativa",
    "Bootstrap já realizado",
    "Email já pertence",
  ];
  console.error(
    permitted.some((p) => message.startsWith(p))
      ? message
      : "Não foi possível criar o superadmin. Confira migrations, conexão administrativa e permissões. Nenhum segredo foi exibido.",
  );
  process.exitCode = 1;
} finally {
  await pool?.end();
}
