import pg from "pg";
import { z } from "zod";
import { authService } from "./auth.js";
import { audit, transaction } from "./db.js";
import { mailSender } from "./mail.js";

const email = z
  .string()
  .email()
  .transform((v) => v.toLowerCase())
  .parse(process.argv[2]);
const name = z.string().min(2).max(120).parse(process.argv[3]);
const pool = new pg.Pool({
  connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL,
});
try {
  await transaction(pool, async (c) => {
    if ((await c.query("SELECT id FROM app.users WHERE email=$1", [email])).rowCount)
      throw new Error("Email já provisionado. Use recuperação de senha.");
    const org = (
        await c.query("INSERT INTO app.organizations(name) VALUES($1) RETURNING id", [name])
      ).rows[0],
      user = (await c.query("INSERT INTO app.users(email) VALUES($1) RETURNING id", [email]))
        .rows[0];
    await c.query("INSERT INTO app.memberships(organization_id,user_id) VALUES($1,$2)", [
      org.id,
      user.id,
    ]);
    await c.query("SELECT set_config('app.organization_id',$1,true)", [org.id]);
    await audit(c, org.id, user.id, "admin.provisioned", user.id);
  });
  const origin = process.env.PUBLIC_ORIGIN ?? "http://127.0.0.1:5173";
  await authService({
    pool,
    origin,
    secure: origin.startsWith("https:"),
    sendReset: mailSender(process.env, origin),
  }).issueReset(email);
  console.log(
    "Admin provisionado. Defina a senha pelo email de uso único; em desenvolvimento, abra o Mailpit local.",
  );
} catch (e) {
  console.error(
    e instanceof Error && e.message.startsWith("Email já")
      ? e.message
      : "Falha no provisionamento ou envio. Se a conta foi criada, use recuperação de senha.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
