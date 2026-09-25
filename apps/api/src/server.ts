import pg from "pg";
import { buildApp } from "./app.js";
import { readConfig } from "./config.js";
import { mailSender } from "./mail.js";
import { platformMailSender } from "./platform-mail.js";
import { assertPlatformRole, assertRuntimeRole } from "./runtime-role.js";

const config = readConfig(process.env);
const pool = new pg.Pool({
  connectionString: config.connectionString,
  max: 5,
  connectionTimeoutMillis: 2000,
  query_timeout: 2000,
});
pool.on("error", () => app.log.error("Conexão ociosa do banco indisponível"));
const origin = process.env.PUBLIC_ORIGIN ?? "http://127.0.0.1:5173";
if (process.env.NODE_ENV === "production" && !origin.startsWith("https:"))
  throw new Error("Produção exige PUBLIC_ORIGIN HTTPS");
if (Boolean(process.env.PLATFORM_DATABASE_URL) !== Boolean(process.env.PLATFORM_MFA_KEY))
  throw new Error("Configure PLATFORM_DATABASE_URL e PLATFORM_MFA_KEY juntos");
const platformPool = process.env.PLATFORM_DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.PLATFORM_DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 2000,
      query_timeout: 3000,
    })
  : undefined;
platformPool?.on("error", () => app.log.error("Conexão da plataforma indisponível"));
const app = buildApp(
  async () => {
    await pool.query("SELECT 1");
    if (platformPool) await platformPool.query("SELECT 1");
  },
  true,
  {
    pool,
    origin,
    secure: origin.startsWith("https:"),
    metricsToken: process.env.METRICS_TOKEN,
    sendReset: mailSender(process.env, origin),
    platform: platformPool
      ? {
          pool: platformPool,
          key: process.env.PLATFORM_MFA_KEY!,
          origin,
          secure: origin.startsWith("https:"),
          sendMail: platformMailSender(process.env, origin),
        }
      : undefined,
  },
);
app.addHook("onClose", async () => {
  await pool.end();
  await platformPool?.end();
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await app.close();
  });
}
try {
  await assertRuntimeRole(pool);
  if (platformPool) await assertPlatformRole(platformPool);
  await app.listen({ port: config.port, host: config.host });
} catch {
  app.log.error("Não foi possível iniciar a API");
  await app.close();
  process.exitCode = 1;
}
