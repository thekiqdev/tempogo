import { environmentRuntime } from "./runtime-environment.js";

if (process.env.SETUP_ON_START === "true") {
  await import("./setup-cli.js");
  if (process.exitCode) process.exit(process.exitCode);
  Object.assign(process.env, environmentRuntime(process.env));
  // HTTP handlers only receive limited database connections.
  delete process.env.MIGRATION_DATABASE_URL;
  delete process.env.SETUP_RESET_RUNTIME_PASSWORDS;
}
await import("./server.js");
