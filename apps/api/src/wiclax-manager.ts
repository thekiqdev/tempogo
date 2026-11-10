import os from "node:os";
import type pg from "pg";
import { HttpError, transaction } from "./db.js";
import { loadCheckpointWiclaxContext, startWiclaxBridge } from "./wiclax-bridge.js";
import { DEFAULT_WICLAX_PORTS } from "./wiclax-ports.js";

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
  pool_exhausted: boolean;
};

type Managed = {
  organizationId: string;
  eventId: string;
  checkpointName: string;
  bridge: ReturnType<typeof startWiclaxBridge>;
};

type LeaseRow = {
  port: number;
  kind: "lease" | "blocked";
  organization_id: string | null;
  event_id: string | null;
  checkpoint_id: string | null;
  checkpoint_name: string | null;
  note: string | null;
  updated_at: Date;
};

const byCheckpoint = new Map<string, Managed>();
const byPort = new Map<number, string>();
let restorePromise: Promise<void> | null = null;

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

async function loadLeases(pool: pg.Pool): Promise<LeaseRow[]> {
  try {
    return (
      await pool.query<LeaseRow>(
        `SELECT port, kind, organization_id, event_id, checkpoint_id, checkpoint_name, note, updated_at
           FROM app.wiclax_port_leases
          ORDER BY port`,
      )
    ).rows;
  } catch {
    return [];
  }
}

async function upsertLease(
  pool: pg.Pool,
  row: {
    port: number;
    organizationId: string;
    eventId: string;
    checkpointId: string;
    checkpointName: string;
  },
) {
  await pool.query(
    `DELETE FROM app.wiclax_port_leases
      WHERE checkpoint_id=$1 OR port=$2`,
    [row.checkpointId, row.port],
  );
  await pool.query(
    `INSERT INTO app.wiclax_port_leases(port, kind, organization_id, event_id, checkpoint_id, checkpoint_name, note, updated_at)
     VALUES ($1,'lease',$2,$3,$4,$5,NULL,now())`,
    [row.port, row.organizationId, row.eventId, row.checkpointId, row.checkpointName],
  );
}

async function upsertBlocked(pool: pg.Pool, port: number, note: string) {
  await pool.query(
    `INSERT INTO app.wiclax_port_leases(port, kind, organization_id, event_id, checkpoint_id, checkpoint_name, note, updated_at)
     VALUES ($1,'blocked',NULL,NULL,NULL,NULL,$2,now())
     ON CONFLICT (port) DO UPDATE SET
       kind='blocked',
       organization_id=NULL,
       event_id=NULL,
       checkpoint_id=NULL,
       checkpoint_name=NULL,
       note=EXCLUDED.note,
       updated_at=now()`,
    [port, note],
  );
  byPort.set(port, "external:" + port);
}

async function deleteLeaseByCheckpoint(pool: pg.Pool, checkpointId: string) {
  await pool.query(`DELETE FROM app.wiclax_port_leases WHERE checkpoint_id=$1`, [checkpointId]);
}

async function deleteLeaseByPort(pool: pg.Pool, port: number) {
  await pool.query(`DELETE FROM app.wiclax_port_leases WHERE port=$1`, [port]);
}

function occupiedPorts(leases: LeaseRow[]): Set<number> {
  const set = new Set<number>();
  for (const lease of leases) set.add(lease.port);
  for (const port of byPort.keys()) set.add(port);
  return set;
}

function pickFreePort(poolPorts: number[], occupied: Set<number>): number {
  for (const port of poolPorts) {
    if (!occupied.has(port)) return port;
  }
  throw new HttpError(
    409,
    "PORT_POOL_EXHAUSTED",
    "Todas as portas Wiclax do pool estão em uso. Desconecte um checkpoint, limpe bloqueios no Super Admin ou amplie o pool.",
  );
}

async function statusOf(
  checkpointId: string,
  pool: pg.Pool | null = null,
  organizationId: string | null = null,
): Promise<WiclaxStatus> {
  const managed = byCheckpoint.get(checkpointId);
  const portPool = pool ? await loadWiclaxPortPool(pool) : [...DEFAULT_WICLAX_PORTS];
  const leases = pool ? await loadLeases(pool) : [];
  const occupied = occupiedPorts(leases);
  const free = portPool.filter((p) => !occupied.has(p)).length;

  if (!managed) {
    let eventId = "";
    let checkpointName = "";
    let reservedPort: number | null = null;
    if (pool && organizationId) {
      try {
        const ctx = await loadCheckpointWiclaxContext(pool, organizationId, checkpointId);
        eventId = ctx.event_id;
        checkpointName = ctx.checkpoint_name;
      } catch {
        /* status sem contexto */
      }
    }
    const lease = leases.find((l) => l.kind === "lease" && l.checkpoint_id === checkpointId);
    if (lease) reservedPort = lease.port;
    return {
      active: false,
      event_id: eventId,
      checkpoint_id: checkpointId,
      checkpoint_name: checkpointName,
      port: reservedPort,
      host: null,
      addresses: lanAddresses(),
      clients: 0,
      reading_clients: 0,
      source: checkpointName,
      pool_size: portPool.length,
      pool_free: free,
      pool_exhausted: free === 0,
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
    pool_exhausted: free === 0,
  };
}

export async function getWiclaxStatus(
  checkpointId: string,
  pool?: pg.Pool,
  organizationId?: string,
) {
  if (pool) await ensureWiclaxRestored(pool);
  return statusOf(checkpointId, pool ?? null, organizationId ?? null);
}

async function bindBridge(
  pool: pg.Pool,
  organizationId: string,
  eventId: string,
  checkpointId: string,
  checkpointName: string,
  port: number,
) {
  const bridge = startWiclaxBridge({
    pool,
    organizationId,
    eventId,
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
      await upsertBlocked(pool, port, "Porta ocupada no sistema operacional (EADDRINUSE).");
      throw Object.assign(new Error("EADDRINUSE"), { code: "EADDRINUSE", port });
    }
    if (e instanceof Error && e.message.startsWith("Checkpoint não encontrado"))
      throw new HttpError(404, "NOT_FOUND", "Checkpoint não encontrado");
    throw new HttpError(500, "WICLAX_START_FAILED", "Não foi possível abrir o bridge Wiclax.");
  }
  byCheckpoint.set(checkpointId, {
    organizationId,
    eventId,
    checkpointName,
    bridge,
  });
  byPort.set(port, checkpointId);
  await upsertLease(pool, {
    port,
    organizationId,
    eventId,
    checkpointId,
    checkpointName,
  });
  return statusOf(checkpointId, pool, organizationId);
}

export async function startWiclaxForCheckpoint(
  pool: pg.Pool,
  organizationId: string,
  checkpointId: string,
) {
  await ensureWiclaxRestored(pool);
  const existing = byCheckpoint.get(checkpointId);
  if (existing) {
    if (existing.organizationId !== organizationId)
      throw new HttpError(403, "FORBIDDEN", "Bridge pertence a outra organização.");
    return statusOf(checkpointId, pool, organizationId);
  }

  const ctx = await loadCheckpointWiclaxContext(pool, organizationId, checkpointId);
  const portPool = await loadWiclaxPortPool(pool);
  const leases = await loadLeases(pool);
  const preferred = leases.find((l) => l.kind === "lease" && l.checkpoint_id === checkpointId);

  if (preferred) {
    try {
      return await bindBridge(
        pool,
        organizationId,
        ctx.event_id,
        checkpointId,
        ctx.checkpoint_name,
        preferred.port,
      );
    } catch (e) {
      if (
        !(
          e &&
          typeof e === "object" &&
          "code" in e &&
          (e as { code: string }).code === "EADDRINUSE"
        )
      )
        throw e;
      await deleteLeaseByCheckpoint(pool, checkpointId);
    }
  }

  let lastBusy: number | null = null;
  for (let attempt = 0; attempt < portPool.length; attempt++) {
    const occupied = occupiedPorts(await loadLeases(pool));
    let port: number;
    try {
      port = pickFreePort(portPool, occupied);
    } catch (e) {
      throw e;
    }
    try {
      return await bindBridge(
        pool,
        organizationId,
        ctx.event_id,
        checkpointId,
        ctx.checkpoint_name,
        port,
      );
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
      ? "Nenhuma porta do pool pôde ser aberta neste servidor. Confira as portas publicadas no Easypanel ou limpe bloqueios no Super Admin."
      : "Todas as portas Wiclax do pool estão em uso.",
  );
}

export async function stopWiclaxForCheckpoint(
  organizationId: string,
  checkpointId: string,
  pool?: pg.Pool,
) {
  if (pool) await ensureWiclaxRestored(pool);
  const managed = byCheckpoint.get(checkpointId);
  if (!managed) {
    if (pool) await deleteLeaseByCheckpoint(pool, checkpointId);
    return statusOf(checkpointId, pool ?? null, organizationId);
  }
  if (managed.organizationId !== organizationId)
    throw new HttpError(403, "FORBIDDEN", "Bridge pertence a outra organização.");
  const port = managed.bridge.port;
  await managed.bridge.close();
  byCheckpoint.delete(checkpointId);
  if (byPort.get(port) === checkpointId) byPort.delete(port);
  if (pool) await deleteLeaseByCheckpoint(pool, checkpointId);
  return statusOf(checkpointId, pool ?? null, organizationId);
}

export async function wiclaxPoolSnapshot(pool: pg.Pool, opts?: { restore?: boolean }) {
  if (opts?.restore !== false) await ensureWiclaxRestored(pool);
  const ports = await loadWiclaxPortPool(pool);
  const leases = await loadLeases(pool);
  const byLeasePort = new Map(leases.map((l) => [l.port, l]));
  const items = ports.map((port) => {
    const lease = byLeasePort.get(port);
    const owner = byPort.get(port);
    const managed = owner && !owner.startsWith("external:") ? byCheckpoint.get(owner) : undefined;
    if (managed) {
      return {
        port,
        state: "busy" as const,
        checkpoint_id: owner!,
        checkpoint_name: managed.checkpointName,
        event_id: managed.eventId,
        organization_id: managed.organizationId,
        note: null as string | null,
        live: true,
      };
    }
    if (lease?.kind === "blocked" || owner?.startsWith("external:")) {
      return {
        port,
        state: "blocked" as const,
        checkpoint_id: null,
        checkpoint_name: null,
        event_id: null,
        organization_id: null,
        note: lease?.note ?? "Porta bloqueada neste processo",
        live: false,
      };
    }
    if (lease?.kind === "lease") {
      return {
        port,
        state: "busy" as const,
        checkpoint_id: lease.checkpoint_id,
        checkpoint_name: lease.checkpoint_name,
        event_id: lease.event_id,
        organization_id: lease.organization_id,
        note: "Reservada no banco; bridge ainda não ativo neste processo",
        live: false,
      };
    }
    return {
      port,
      state: "free" as const,
      checkpoint_id: null,
      checkpoint_name: null,
      event_id: null,
      organization_id: null,
      note: null as string | null,
      live: false,
    };
  });
  const free = items.filter((i) => i.state === "free").length;
  return {
    ports,
    free,
    busy: items.filter((i) => i.state === "busy").length,
    blocked: items.filter((i) => i.state === "blocked").length,
    exhausted: free === 0,
    items,
  };
}

export async function clearWiclaxBlockedPorts(pool: pg.Pool) {
  const result = await pool.query(
    `DELETE FROM app.wiclax_port_leases WHERE kind='blocked' RETURNING port`,
  );
  for (const row of result.rows as { port: number }[]) {
    const owner = byPort.get(row.port);
    if (owner?.startsWith("external:")) byPort.delete(row.port);
  }
  return wiclaxPoolSnapshot(pool);
}

/** Restaura bridges a partir das leases persistidas (idempotente). */
export async function restoreWiclaxBridges(pool: pg.Pool): Promise<void> {
  const leases = await loadLeases(pool);
  for (const lease of leases) {
    if (lease.kind === "blocked") {
      byPort.set(lease.port, "external:" + lease.port);
      continue;
    }
    if (!lease.checkpoint_id || !lease.organization_id || !lease.event_id || !lease.checkpoint_name)
      continue;
    if (byCheckpoint.has(lease.checkpoint_id)) continue;
    try {
      await bindBridge(
        pool,
        lease.organization_id,
        lease.event_id,
        lease.checkpoint_id,
        lease.checkpoint_name,
        lease.port,
      );
    } catch (e) {
      if (
        e &&
        typeof e === "object" &&
        "code" in e &&
        (e as { code: string }).code === "EADDRINUSE"
      ) {
        continue;
      }
      await deleteLeaseByPort(pool, lease.port);
    }
  }
}

export function ensureWiclaxRestored(pool: pg.Pool): Promise<void> {
  if (!restorePromise) {
    restorePromise = restoreWiclaxBridges(pool).catch((e) => {
      restorePromise = null;
      throw e;
    });
  }
  return restorePromise;
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
