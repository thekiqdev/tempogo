export function readConfig(env: NodeJS.ProcessEnv) {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL é obrigatória");
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL inválida");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL deve usar PostgreSQL");
  }
  const port = Number(env.API_PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("API_PORT inválida");
  }
  return { connectionString, port, host: env.API_HOST ?? "127.0.0.1" };
}
