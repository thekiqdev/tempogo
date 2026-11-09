import os from "node:os";
import type pg from "pg";
import { HttpError } from "./db.js";
import { loadCheckpointContext, startWiclaxBridge } from "./wiclax-bridge.js";

export type WiclaxStatus = {
  active: boolean;
  checkpoint_id: string;
  event_id: string | null;
  port: number | null;
  host: string | null;
  addresses: string[];
  clients: number;
  reading_clients: number;
};

type Managed = {
  organizationId: string;
  eventId: string;
  bridge: ReturnType<typeof startWiclaxBridge>;
};

const byCheckpoint = new Map<string, Managed>();
const byPort = new Map<number, string>();

function isDockerBridgeIp(ip: string) {
  const m = /^172\.(\d+)\./.exec(ip);
  if (!m) return false;
  const second = Number(m[1]);
  return second >= 16 && second <= 31;
}

function advertiseIp(env: NodeJS.ProcessEnv = process.env) {
  const raw = (env.WICLAX_ADVERTISE_IP ?? "").trim();
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(raw) ? raw : "";
}

function addressRank(ip: string, preferred: string, production: boolean) {
  if (preferred && ip === preferred) return 0;
  if (production) {
    if (isDockerBridgeIp(ip)) return 1;
    if (ip.startsWith("10.")) return 2;
    if (ip.startsWith("192.168.")) return 3;
    return 4;
  }
  if (ip.startsWith("192.168.")) return 1;
  if (ip.startsWith("10.")) return 2;
  if (isDockerBridgeIp(ip)) return 4;
  if (ip.startsWith("172.")) return 3;
  return 5;
}

/** IPs anunciáveis ao Wiclax. Em produção prioriza bridge Docker; WICLAX_ADVERTISE_IP fixa o destaque. */
export function lanAddresses(env: NodeJS.ProcessEnv = process.env): string[] {
  const preferred = advertiseIp(env);
  const production = (env.NODE_ENV ?? "").toLowerCase() === "production";
  const out: string[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (String(entry.family) !== "IPv4" && String(entry.family) !== "4") continue;
      if (entry.internal) continue;
      out.push(entry.address);
    }
  }
  if (preferred && !out.includes(preferred)) out.push(preferred);
  return [...new Set(out)].sort((a, b) => {
    const rank = addressRank(a, preferred, production) - addressRank(b, preferred, production);
    return rank !== 0 ? rank : a.localeCompare(b);
  });
}

function statusOf(checkpointId: string): WiclaxStatus {
  const managed = byCheckpoint.get(checkpointId);
  if (!managed) {
    return {
      active: false,
      checkpoint_id: checkpointId,
      event_id: null,
      port: null,
      host: null,
      addresses: lanAddresses(),
      clients: 0,
      reading_clients: 0,
    };
  }
  const stats = managed.bridge.stats();
  return {
    active: true,
    checkpoint_id: checkpointId,
    event_id: managed.eventId,
    port: managed.bridge.port,
    host: managed.bridge.host,
    addresses: lanAddresses(),
    clients: stats.clients,
    reading_clients: stats.reading,
  };
}

export function getWiclaxStatus(checkpointId: string) {
  return statusOf(checkpointId);
}

export async function startWiclaxForCheckpoint(
  pool: pg.Pool,
  organizationId: string,
  checkpointId: string,
  port = 3097,
) {
  const existing = byCheckpoint.get(checkpointId);
  if (existing) {
    if (existing.organizationId !== organizationId)
      throw new HttpError(403, "FORBIDDEN", "Bridge pertence a outra organização.");
    return statusOf(checkpointId);
  }
  const owner = byPort.get(port);
  if (owner && owner !== checkpointId)
    throw new HttpError(
      409,
      "PORT_IN_USE",
      "A porta " +
        port +
        " já está em uso por outro checkpoint. Escolha outra porta ou desconecte o outro bridge.",
    );
  const ctx = await loadCheckpointContext(pool, organizationId, checkpointId);
  const bridge = startWiclaxBridge({
    pool,
    organizationId,
    eventId: ctx.event_id,
    checkpointId,
    host: "0.0.0.0",
    port,
    quiet: true,
  });
  try {
    await bridge.ready;
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
    if (code === "EADDRINUSE")
      throw new HttpError(
        409,
        "PORT_IN_USE",
        "A porta " + port + " já está ocupada neste servidor. Escolha outra porta.",
      );
    if (e instanceof Error && e.message.startsWith("Checkpoint não encontrado"))
      throw new HttpError(404, "NOT_FOUND", "Checkpoint não encontrado");
    throw new HttpError(500, "WICLAX_START_FAILED", "Não foi possível abrir o bridge Wiclax.");
  }
  byCheckpoint.set(checkpointId, {
    organizationId,
    eventId: ctx.event_id,
    bridge,
  });
  byPort.set(port, checkpointId);
  return statusOf(checkpointId);
}

export async function stopWiclaxForCheckpoint(organizationId: string, checkpointId: string) {
  const managed = byCheckpoint.get(checkpointId);
  if (!managed) return statusOf(checkpointId);
  if (managed.organizationId !== organizationId)
    throw new HttpError(403, "FORBIDDEN", "Bridge pertence a outra organização.");
  const port = managed.bridge.port;
  await managed.bridge.close();
  byCheckpoint.delete(checkpointId);
  if (byPort.get(port) === checkpointId) byPort.delete(port);
  return statusOf(checkpointId);
}
