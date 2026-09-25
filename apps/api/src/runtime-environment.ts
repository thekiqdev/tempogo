import { createHmac } from "node:crypto";

// Domain-separated credentials remain stable across container recreation.
export function environmentRuntime(env: NodeJS.ProcessEnv) {
  const key = env.PLATFORM_MFA_KEY;
  if (!key || !/^[a-fA-F0-9]{64}$/.test(key))
    throw new Error(
      "PLATFORM_MFA_KEY deve conter 64 caracteres hexadecimais e permanecer estável.",
    );
  const source = new URL(env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL ?? "");
  const connection = (role: string) => {
    const url = new URL(source);
    url.username = role;
    url.password = createHmac("sha256", Buffer.from(key, "hex"))
      .update(`tempogo:postgres-runtime:v1:${source.pathname}:${role}`)
      .digest("hex");
    return url.toString();
  };
  return {
    DATABASE_URL: connection("cronocheckpoint_runtime"),
    PLATFORM_DATABASE_URL: connection("cronocheckpoint_platform_runtime"),
    PLATFORM_MFA_KEY: key,
  };
}
