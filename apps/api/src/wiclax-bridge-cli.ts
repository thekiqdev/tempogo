import pg from "pg";
import { z } from "zod";
import { transaction } from "./db.js";
import { startWiclaxBridge } from "./wiclax-bridge.js";

const env = z
  .object({
    WICLAX_CHECKPOINT_ID: z.string().uuid(),
    WICLAX_BRIDGE_HOST: z.string().default("0.0.0.0"),
    WICLAX_BRIDGE_PORT: z.coerce.number().int().min(1).max(65535).default(3097),
    WICLAX_POLL_MS: z.coerce.number().int().min(200).max(60000).default(1000),
  })
  .safeParse(process.env);

if (!env.success) {
  console.error(
    "Configure WICLAX_CHECKPOINT_ID. Opcionais: WICLAX_BRIDGE_HOST, WICLAX_BRIDGE_PORT (padrão 3097), WICLAX_POLL_MS.",
  );
  process.exitCode = 1;
} else {
  const connectionString = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Configure MIGRATION_DATABASE_URL ou DATABASE_URL para o bridge.");
    process.exitCode = 1;
  } else {
    const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 });
    const shutdownPool = async () => {
      await pool.end();
    };
    try {
      const checkpoint = (
        await pool.query<{ organization_id: string; event_id: string }>(
          "SELECT organization_id,event_id FROM app.checkpoints WHERE id=$1",
          [env.data.WICLAX_CHECKPOINT_ID],
        )
      ).rows[0];
      if (!checkpoint) throw new Error("Checkpoint não encontrado para o bridge Wiclax.");
      await transaction(
        pool,
        async (c) => {
          const row = await c.query("SELECT 1 FROM app.checkpoints WHERE id=$1", [
            env.data.WICLAX_CHECKPOINT_ID,
          ]);
          if (!row.rowCount) throw new Error("Checkpoint não encontrado para o bridge Wiclax.");
        },
        checkpoint.organization_id,
      );
      const bridge = startWiclaxBridge({
        pool,
        organizationId: checkpoint.organization_id,
        eventId: checkpoint.event_id,
        checkpointId: env.data.WICLAX_CHECKPOINT_ID,
        host: env.data.WICLAX_BRIDGE_HOST,
        port: env.data.WICLAX_BRIDGE_PORT,
        pollMs: env.data.WICLAX_POLL_MS,
      });
      const shutdown = async () => {
        try {
          await bridge.close();
        } finally {
          await shutdownPool();
        }
      };
      process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
      process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));
      await bridge.ready;
    } catch (e) {
      console.error(
        e instanceof Error && e.message.startsWith("Checkpoint não encontrado")
          ? e.message
          : "Não foi possível iniciar o bridge Wiclax. Confira checkpoint, porta livre e conexão com o banco.",
      );
      await shutdownPool();
      process.exitCode = 1;
    }
  }
}
