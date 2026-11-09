import os from "node:os";
import type pg from "pg";
import { HttpError } from "./db.js";
import { loadEventWiclaxContext, startWiclaxBridge } from "./wiclax-bridge.js";

export type WiclaxSource = {
  id: string;
  name: string;
  kind: string;
  sequence: number;
};

export type WiclaxStatus = {
  active: boolean;
  event_id: string;
  port: number | null;
  host: string | null;
  addresses: string[];
  clients: number;
  reading_clients: number;
  sources: WiclaxSource[];
};

type Managed = {
  organizationId: string;
  bridge: ReturnType<typeof startWiclaxBridge>;
};

const byEvent = new Map<string, Managed>();
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

/** IPs anunciáveis ao Wiclax. WICLAX_ADVERTISE_IP fixa o destaque (ex.: IP público da VPS). */
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

async function sourcesOf(
  pool: pg.Pool | null,
  organizationId: string | null,
  eventId: string,
): Promise<WiclaxSource[]> {
  if (!pool || !organizationId) return [];
  try {
    const ctx = await loadEventWiclaxContext(pool, organizationId, eventId);
    return ctx.sources;
  } catch {
    return [];
  }
}

async function statusOf(
  eventId: string,
  pool: pg.Pool | null = null,
  organizationId: string | null = null,
): Promise<WiclaxStatus> {
  const managed = byEvent.get(eventId);
  const sources = await sourcesOf(pool, organizationId ?? managed?.organizationId ?? null, eventId);
  if (!managed) {
    return {
      active: false,
      event_id: eventId,
      port: null,
      host: null,
      addresses: lanAddresses(),
      clients: 0,
      reading_clients: 0,
      sources,
    };
  }
  const stats = managed.bridge.stats();
  return {
    active: true,
    event_id: eventId,
    port: managed.bridge.port,
    host: managed.bridge.host,
    addresses: lanAddresses(),
    clients: stats.clients,
    reading_clients: stats.reading,
    sources,
  };
}

export async function getWiclaxStatus(eventId: string, pool?: pg.Pool, organizationId?: string) {
  return statusOf(eventId, pool ?? null, organizationId ?? null);
}

export async function startWiclaxForEvent(
  pool: pg.Pool,
  organizationId: string,
  eventId: string,
  port = 3097,
) {
  const existing = byEvent.get(eventId);
  if (existing) {
    if (existing.organizationId !== organizationId)
      throw new HttpError(403, "FORBIDDEN", "Bridge pertence a outra organização.");
    return statusOf(eventId, pool, organizationId);
  }
  const owner = byPort.get(port);
  if (owner && owner !== eventId)
    throw new HttpError(
      409,
      "PORT_IN_USE",
      "A porta " +
        port +
        " já está em uso por outro evento. Escolha outra porta ou desconecte o outro bridge.",
    );
  await loadEventWiclaxContext(pool, organizationId, eventId);
  const bridge = startWiclaxBridge({
    pool,
    organizationId,
    eventId,
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
    if (e instanceof Error && e.message.startsWith("Evento não encontrado"))
      throw new HttpError(404, "NOT_FOUND", "Evento não encontrado");
    throw new HttpError(500, "WICLAX_START_FAILED", "Não foi possível abrir o bridge Wiclax.");
  }
  byEvent.set(eventId, { organizationId, bridge });
  byPort.set(port, eventId);
  return statusOf(eventId, pool, organizationId);
}

export async function stopWiclaxForEvent(organizationId: string, eventId: string, pool?: pg.Pool) {
  const managed = byEvent.get(eventId);
  if (!managed) return statusOf(eventId, pool ?? null, organizationId);
  if (managed.organizationId !== organizationId)
    throw new HttpError(403, "FORBIDDEN", "Bridge pertence a outra organização.");
  const port = managed.bridge.port;
  await managed.bridge.close();
  byEvent.delete(eventId);
  if (byPort.get(port) === eventId) byPort.delete(port);
  return statusOf(eventId, pool ?? null, organizationId);
}
