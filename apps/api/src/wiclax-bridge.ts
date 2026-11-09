import net from "node:net";
import type pg from "pg";
import { transaction } from "./db.js";
import {
  formatWiclaxClock,
  formatWiclaxPassing,
  parseWiclaxCommand,
  type WiclaxPassing,
} from "./wiclax-protocol.js";

export type WiclaxBridgeOptions = {
  pool: pg.Pool;
  organizationId: string;
  eventId: string;
  host?: string;
  port?: number;
  pollMs?: number;
  heartbeatMs?: number;
  quiet?: boolean;
};

type ClientState = {
  socket: net.Socket;
  buffer: string;
  reading: boolean;
  sent: Set<string>;
};

type PassingRow = {
  id: string;
  tag: string;
  captured_at: Date;
  received_at: Date;
  checkpoint_name: string;
};

export type EventWiclaxContext = {
  event_id: string;
  event_name: string;
  timezone: string;
  sources: { id: string; name: string; kind: string; sequence: number }[];
};

const passingQuery = `SELECT v.id,
  coalesce(nullif(v.chip,''), v.effective_bib) AS tag,
  v.effective_captured_at AS captured_at,
  v.received_at,
  v.checkpoint_name
 FROM (
   SELECT o.id,o.organization_id,o.event_id,o.received_at,
     coalesce(r.bib,o.bib) effective_bib,
     coalesce(r.captured_at,o.estimated_captured_at,o.raw_captured_at) effective_captured_at,
     coalesce(r.disposition,'accepted') disposition,
     chips.chip,p.name checkpoint_name
   FROM app.observations o
   JOIN app.checkpoints p ON p.organization_id=o.organization_id AND p.id=o.checkpoint_id
   LEFT JOIN LATERAL (
     SELECT * FROM app.observation_revisions r
     WHERE r.organization_id=o.organization_id AND r.observation_id=o.id
     ORDER BY version DESC LIMIT 1
   ) r ON true
   LEFT JOIN app.event_chips chips
     ON chips.organization_id=o.organization_id AND chips.event_id=o.event_id
    AND chips.bib=coalesce(r.bib,o.bib)
   WHERE o.event_id=$1
 ) v
 WHERE v.disposition<>'invalidated'`;

export async function loadEventWiclaxContext(
  pool: pg.Pool,
  organizationId: string,
  eventId: string,
): Promise<EventWiclaxContext> {
  return transaction(
    pool,
    async (c) => {
      const event = (
        await c.query<{ event_id: string; event_name: string; timezone: string }>(
          "SELECT id AS event_id, name AS event_name, timezone FROM app.events WHERE organization_id=$1 AND id=$2",
          [organizationId, eventId],
        )
      ).rows[0];
      if (!event) throw new Error("Evento não encontrado para o bridge Wiclax.");
      const sources = (
        await c.query<{ id: string; name: string; kind: string; sequence: number }>(
          `SELECT id,name,kind,sequence FROM app.checkpoints
           WHERE organization_id=$1 AND event_id=$2 AND active
           ORDER BY sequence,id`,
          [organizationId, eventId],
        )
      ).rows;
      return { ...event, sources };
    },
    organizationId,
  );
}

async function fetchNew(
  pool: pg.Pool,
  organizationId: string,
  eventId: string,
  afterReceived: Date | null,
): Promise<PassingRow[]> {
  return transaction(
    pool,
    async (c) => {
      const rows = (
        await c.query<PassingRow>(
          passingQuery +
            " AND ($2::timestamptz IS NULL OR v.received_at>$2) ORDER BY v.received_at,v.id LIMIT 200",
          [eventId, afterReceived],
        )
      ).rows;
      return rows.map((r) => ({
        ...r,
        captured_at: new Date(r.captured_at),
        received_at: new Date(r.received_at),
      }));
    },
    organizationId,
  );
}

async function fetchRange(
  pool: pg.Pool,
  organizationId: string,
  eventId: string,
  from: Date,
  to: Date,
): Promise<PassingRow[]> {
  return transaction(
    pool,
    async (c) => {
      const rows = (
        await c.query<PassingRow>(
          passingQuery +
            " AND v.effective_captured_at>=$2 AND v.effective_captured_at<=$3 ORDER BY v.effective_captured_at,v.id LIMIT 5000",
          [eventId, from, to],
        )
      ).rows;
      return rows.map((r) => ({
        ...r,
        captured_at: new Date(r.captured_at),
        received_at: new Date(r.received_at),
      }));
    },
    organizationId,
  );
}

function toPassing(row: PassingRow, rewind: boolean): WiclaxPassing {
  return {
    tag: row.tag,
    capturedAt: row.captured_at,
    source: row.checkpoint_name,
    rewind,
  };
}

function write(socket: net.Socket, data: string) {
  if (!socket.destroyed) socket.write(data, "utf8");
}

export function startWiclaxBridge(options: WiclaxBridgeOptions) {
  const host = options.host ?? "0.0.0.0";
  const port = options.port ?? 3097;
  const pollMs = options.pollMs ?? 1000;
  const heartbeatMs = options.heartbeatMs ?? 15000;
  const clients = new Set<ClientState>();
  let timezone = "UTC";
  let label = options.eventId;
  let cursor: Date | null = null;
  let stopping = false;

  const broadcastLive = (line: string, id: string) => {
    for (const client of clients) {
      if (!client.reading) continue;
      if (client.sent.has(id)) continue;
      client.sent.add(id);
      write(client.socket, line);
    }
  };

  const handleLine = async (client: ClientState, line: string) => {
    const cmd = parseWiclaxCommand(line);
    switch (cmd.type) {
      case "clock_get":
        write(client.socket, formatWiclaxClock(new Date(), timezone));
        return;
      case "clock_set":
        write(client.socket, "CLOCKOK\r");
        return;
      case "start_read":
        client.reading = true;
        write(client.socket, "READOK\r");
        return;
      case "stop_read":
        client.reading = false;
        write(client.socket, "READOK\r");
        return;
      case "rewind": {
        const rows = await fetchRange(
          options.pool,
          options.organizationId,
          options.eventId,
          cmd.from,
          cmd.to,
        );
        for (const row of rows) {
          write(client.socket, formatWiclaxPassing(toPassing(row, true), timezone));
        }
        return;
      }
      default:
        return;
    }
  };

  const server = net.createServer((socket) => {
    const client: ClientState = {
      socket,
      buffer: "",
      reading: false,
      sent: new Set(),
    };
    clients.add(client);
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      client.buffer += chunk;
      let idx = client.buffer.search(/[\r\n]/);
      while (idx >= 0) {
        const line = client.buffer.slice(0, idx);
        client.buffer = client.buffer.slice(idx + 1).replace(/^\n/, "");
        if (line.trim()) void handleLine(client, line).catch(() => undefined);
        idx = client.buffer.search(/[\r\n]/);
      }
    });
    socket.on("close", () => clients.delete(client));
    socket.on("error", () => clients.delete(client));
  });

  const poll = async () => {
    if (stopping) return;
    try {
      const rows = await fetchNew(options.pool, options.organizationId, options.eventId, cursor);
      for (const row of rows) {
        broadcastLive(formatWiclaxPassing(toPassing(row, false), timezone), row.id);
        cursor = row.received_at;
      }
    } catch {
      /* keep polling; next tick retries */
    }
  };

  let pollTimer: NodeJS.Timeout | undefined;
  let beatTimer: NodeJS.Timeout | undefined;

  const ready = (async () => {
    const ctx = await loadEventWiclaxContext(options.pool, options.organizationId, options.eventId);
    timezone = ctx.timezone || "UTC";
    label = ctx.event_name;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => resolve());
    });
    cursor = new Date();
    pollTimer = setInterval(() => void poll(), pollMs);
    beatTimer = setInterval(() => {
      for (const client of clients) write(client.socket, "*\r");
    }, heartbeatMs);
    if (!options.quiet) {
      console.log(
        `Bridge Wiclax ouvindo em ${host}:${port} · evento "${label}" (${options.eventId}) · fuso ${timezone}`,
      );
    }
  })();

  return {
    ready,
    host,
    port,
    eventId: options.eventId,
    stats: () => ({
      clients: clients.size,
      reading: [...clients].filter((c) => c.reading).length,
    }),
    close: async () => {
      stopping = true;
      if (pollTimer) clearInterval(pollTimer);
      if (beatTimer) clearInterval(beatTimer);
      for (const client of clients) client.socket.destroy();
      clients.clear();
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    },
  };
}
