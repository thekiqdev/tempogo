import os from "node:os";
import type pg from "pg";
import { HttpError, transaction } from "./db.js";
import { loadCheckpointWiclaxContext, startWiclaxBridge } from "./wiclax-bridge.js";
import { DEFAULT_WICLAX_PORTS } from "./wiclax-ports.js";

export type WiclaxSource = {
  id: string;
  name: string;
  kind: string;
  sequence: number;
};

export type WiclaxStatus = {
  active: boolean;
  event_id: string;
  checkpoint_id: string;
  checkpoint_name: string;
  port: number | null;
  host: string | null;
  addresses: string[];
  clients: number;
  reading_clients: number;
  source: string;
  pool_size: number;
  pool_free: number;
};

type Managed = {
  organizationId: string;
  eventId: string;
  checkpointName: string;
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

export async function loadWiclaxPortPool(pool: pg.Pool): Promise<number[]> {
  try {
    const row = (
      await pool.query<{ wiclax_ports: number[] | null }>(
        "SELECT wiclax_ports FROM app.platform_settings WHERE singleton",
      )
    ).rows[0];
    const ports = (row?.wiclax_ports ?? []).filter(
      (p) => Number.isInteger(p) && p >= 1024 && p <= 65535,
    );
    return ports.length ? [...new Set(ports)].sort((a, b) => a - b) : [...DEFAULT_WICLAX_PORTS];
  } catch {
    return [...DEFAULT_WICLAX_PORTS];
  }
}

function pickFreePort(pool: number[]): number {
  for (const port of pool) {
    if (!byPort.has(port)) return port;
  }
  throw new HttpError(
    409,
    "PORT_POOL_EXHAUSTED",
    "Todas as portas Wiclax do pool estão em uso. Desconecte um checkpoint ou amplie o pool no Super Admin.",
  );
}

async function statusOf(
  checkpointId: string,
  pool: pg.Pool | null = null,
  organizationId: string | null = null,
): Promise<WiclaxStatus> {
  const managed = byCheckpoint.get(checkpointId);
  const portPool = pool ? await loadWiclaxPortPool(pool) : [...DEFAULT_WICLAX_PORTS];
  const free = portPool.filter((p) => !byPort.has(p)).length;

  if (!managed) {
    let eventId = "";
    let checkpointName = "";
    if (pool && organizationId) {
      try {
        const ctx = await loadCheckpointWiclaxContext(pool, organizationId, checkpointId);
        eventId = ctx.event_id;
        checkpointName = ctx.checkpoint_name;
      } catch {
        /* status sem contexto */
      }
    }
    return {
      active: false,
      event_id: eventId,
      checkpoint_id: checkpointId,
      checkpoint_name: checkpointName,
      port: null,
      host: null,
      addresses: lanAddresses(),
      clients: 0,
      reading_clients: 0,
      source: checkpointName,
      pool_size: portPool.length,
      pool_free: free,
    };
  }

  const stats = managed.bridge.stats();
  return {
    active: true,
    event_id: managed.eventId,
    checkpoint_id: checkpointId,
    checkpoint_name: managed.checkpointName,
    port: managed.bridge.port,
    host: managed.bridge.host,
    addresses: lanAddresses(),
    clients: stats.clients,
    reading_clients: stats.reading,
    source: managed.checkpointName,
    pool_size: portPool.length,
    pool_free: free,
  };
}

export async function getWiclaxStatus(
  checkpointId: string,
  pool?: pg.Pool,
  organizationId?: string,
) {
  return statusOf(checkpointId, pool ?? null, organizationId ?? null);
}

export async function startWiclaxForCheckpoint(
  pool: pg.Pool,
  organizationId: string,
  checkpointId: string,
) {
  const existing = byCheckpoint.get(checkpointId);
  if (existing) {
    if (existing.organizationId !== organizationId)
      throw new HttpError(403, "FORBIDDEN", "Bridge pertence a outra organização.");
    return statusOf(checkpointId, pool, organizationId);
  }

  const ctx = await loadCheckpointWiclaxContext(pool, organizationId, checkpointId);
  const portPool = await loadWiclaxPortPool(pool);

  const tryStart = async (port: number) => {
    const owner = byPort.get(port);
    if (owner && owner !== checkpointId)
      throw new HttpError(409, "PORT_IN_USE", "A porta " + port + " já está em uso.");
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
      if (code === "EADDRINUSE") {
        byPort.set(port, "external:" + port);
        throw Object.assign(new Error("EADDRINUSE"), { code: "EADDRINUSE", port });
      }
      if (e instanceof Error && e.message.startsWith("Checkpoint não encontrado"))
        throw new HttpError(404, "NOT_FOUND", "Checkpoint não encontrado");
      throw new HttpError(500, "WICLAX_START_FAILED", "Não foi possível abrir o bridge Wiclax.");
    }
    byCheckpoint.set(checkpointId, {
      organizationId,
      eventId: ctx.event_id,
      checkpointName: ctx.checkpoint_name,
      bridge,
    });
    byPort.set(port, checkpointId);
    return statusOf(checkpointId, pool, organizationId);
  };

  let lastBusy: number | null = null;
  for (let attempt = 0; attempt < portPool.length; attempt++) {
    let port: number;
    try {
      port = pickFreePort(portPool);
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw e;
    }
    try {
      return await tryStart(port);
    } catch (e) {
      if (
        e &&
        typeof e === "object" &&
        "code" in e &&
        (e as { code: string }).code === "EADDRINUSE"
      ) {
        lastBusy = port;
        continue;
      }
      throw e;
    }
  }

  throw new HttpError(
    409,
    "PORT_POOL_EXHAUSTED",
    lastBusy
      ? "Nenhuma porta do pool pôde ser aberta neste servidor. Confira as portas publicadas no Easypanel."
      : "Todas as portas Wiclax do pool estão em uso.",
  );
}

export async function stopWiclaxForCheckpoint(
  organizationId: string,
  checkpointId: string,
  pool?: pg.Pool,
) {
  const managed = byCheckpoint.get(checkpointId);
  if (!managed) return statusOf(checkpointId, pool ?? null, organizationId);
  if (managed.organizationId !== organizationId)
    throw new HttpError(403, "FORBIDDEN", "Bridge pertence a outra organização.");
  const port = managed.bridge.port;
  await managed.bridge.close();
  byCheckpoint.delete(checkpointId);
  if (byPort.get(port) === checkpointId) byPort.delete(port);
  return statusOf(checkpointId, pool ?? null, organizationId);
}

/** Snapshot do pool para o Super Admin (ocupação em memória neste processo). */
export async function wiclaxPoolSnapshot(pool: pg.Pool) {
  const ports = await loadWiclaxPortPool(pool);
  return {
    ports,
    items: ports.map((port) => {
      const owner = byPort.get(port);
      const managed = owner && !owner.startsWith("external:") ? byCheckpoint.get(owner) : undefined;
      return {
        port,
        state: owner ? (owner.startsWith("external:") ? "blocked" : "busy") : "free",
        checkpoint_id: managed ? owner : null,
        checkpoint_name: managed?.checkpointName ?? null,
        event_id: managed?.eventId ?? null,
      };
    }),
  };
}

export async function readCheckpointOrg(
  pool: pg.Pool,
  organizationId: string,
  checkpointId: string,
) {
  return transaction(
    pool,
    async (c) => {
      const row = (
        await c.query<{ event_id: string }>(
          "SELECT event_id FROM app.checkpoints WHERE organization_id=$1 AND id=$2",
          [organizationId, checkpointId],
        )
      ).rows[0];
      if (!row) throw new HttpError(404, "NOT_FOUND", "Checkpoint não encontrado");
      return row;
    },
    organizationId,
  );
}
