import pg from "pg";
import { z } from "zod";
import { bootstrapPlatform, emergencyMfaReset } from "./platform-admin.js";
import { platformMailSender } from "./platform-mail.js";

const pool = new pg.Pool({
  connectionString: process.env.MIGRATION_DATABASE_URL,
  connectionTimeoutMillis: 3000,
});
try {
  if (!process.env.MIGRATION_DATABASE_URL) throw new Error("Migration URL necessária");
  const email = z
    .string()
    .email()
    .transform((v) => v.toLowerCase())
    .parse(process.argv[3]);
  const command = process.argv[2];
  let raw: string;
  if (command === "bootstrap") raw = await bootstrapPlatform(pool, email);
  else if (command === "recover-mfa") {
    const reason = z.string().min(10).max(1000).parse(process.argv[4]);
    if (process.env.PLATFORM_RECOVERY_CONFIRMED !== "true")
      throw new Error("Confirmação técnica necessária");
    raw = await emergencyMfaReset(pool, email, reason);
  } else throw new Error("Comando inválido");
  await platformMailSender(process.env, process.env.PUBLIC_ORIGIN ?? "http://127.0.0.1:5173")(
    email,
    raw,
    command === "bootstrap" ? "password" : "mfa",
  );
  console.log("Operação registrada. Instruções enviadas ao email; nenhum segredo foi exibido.");
} catch {
  console.error(
    "Falha na operação ou envio. Confira configuração e auditoria. Não repita bootstrap; use recuperação de senha se já criado. Recuperação MFA pode ser reemitida pelo comando técnico.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
