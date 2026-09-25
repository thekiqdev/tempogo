import { orderedPayload } from "@tempogo/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import { z } from "zod";
import type { AuthOptions, authService } from "./auth.js";
import { syncBody, syncReply } from "./capture-contract.js";
import { audit, HttpError, transaction } from "./db.js";
import { effectiveView } from "./management.js";
import { digest } from "./security.js";
export type FieldScope = {
  id: string;
  organization_id: string;
  event_id: string;
  checkpoint_id: string;
  credential_id: string;
  device_id: string;
  expires_at: Date;
  state: string;
};
type Context = <T>(
  req: FastifyRequest,
  fn: (c: pg.PoolClient, s: FieldScope) => Promise<T>,
) => Promise<T>;
const date = z.string().datetime({ offset: true }),
  uuid = z.string().uuid();
export const syncPayload = z
  .object({
    client_event_id: uuid,
    bib: z.string().regex(/^[0-9]{1,8}$/),
    raw_captured_at: date,
    capture_session_id: uuid,
    grant_id: uuid.optional(),
    clock: z
      .object({
        offset_ms: z.number().finite().min(-86400000).max(86400000),
        rtt_ms: z.number().finite().min(0).max(60000),
        measured_at: date,
        uncertain: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (p) => Boolean(p.grant_id) === Boolean(p.clock),
    "Concessão e relógio devem ser enviados juntos",
  );
export const observationView = `SELECT o.id,o.client_event_id,o.bib,o.raw_captured_at,o.estimated_captured_at,o.received_at,o.source,o.possible_duplicate,o.status='pending' needs_review FROM (${effectiveView}) o`;
async function ingest(
  c: pg.PoolClient,
  current: FieldScope,
  p: z.infer<typeof syncPayload>,
  requestId: string,
  recovery?: { actor: string; reason: string },
) {
  const original = (
    await c.query(
      `SELECT s.*,cr.device_id FROM app.checkpoint_sessions s JOIN app.checkpoint_credentials cr ON cr.id=s.credential_id
 WHERE s.organization_id=$1 AND s.id=$2 AND s.event_id=$3 AND s.checkpoint_id=$4`,
      [current.organization_id, p.capture_session_id, current.event_id, current.checkpoint_id],
    )
  ).rows[0];
  if (!original || (!recovery && original.credential_id !== current.credential_id))
    throw new HttpError(403, "SCOPE_MISMATCH", "O registro pertence a outro acesso");
  if (["finalized", "archived"].includes(current.state))
    throw new HttpError(
      409,
      "EVENT_FINALIZED",
      "Reabra o evento de forma auditada antes de recuperar registros",
    );
  if (!["running", "closed"].includes(current.state))
    throw new HttpError(409, "EVENT_NOT_RUNNING", "Evento indisponível para recebimento");
  const grant = p.grant_id
    ? (
        await c.query(
          "SELECT g.*,w.closed_at FROM app.capture_grants g JOIN app.capture_windows w ON w.id=g.window_id WHERE g.organization_id=$1 AND g.id=$2 AND g.session_id=$3",
          [current.organization_id, p.grant_id, p.capture_session_id],
        )
      ).rows[0]
    : null;
  if (p.grant_id && !grant)
    throw new HttpError(409, "GRANT_INVALID", "Concessão não corresponde à sessão original");
  const canonical = {
    client_event_id: p.client_event_id,
    bib: p.bib,
    raw_captured_at: new Date(p.raw_captured_at).toISOString(),
    checkpoint_id: current.checkpoint_id,
    device_id: original.device_id,
    session_id: p.capture_session_id,
    source: "manual",
    ...(p.grant_id ? { grant_id: p.grant_id, clock: p.clock } : {}),
  };
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    current.organization_id + ":" + current.event_id,
  ]);
  const old = (
    await c.query(
      "SELECT id,canonical_payload FROM app.observations WHERE organization_id=$1 AND event_id=$2 AND client_event_id=$3",
      [current.organization_id, current.event_id, p.client_event_id],
    )
  ).rows[0];
  if (old) {
    if (
      !(
        await c.query("SELECT $1::jsonb=$2::jsonb AS equal", [
          old.canonical_payload,
          JSON.stringify(canonical),
        ])
      ).rows[0].equal
    )
      throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "UUID já utilizado com conteúdo diferente");
    if (recovery) {
      await flag(c, current.organization_id, old.id, "recovery");
      await audit(
        c,
        current.organization_id,
        recovery.actor,
        "observation.recovered",
        old.id,
        { event_id: current.event_id, reason: recovery.reason, replayed: true },
        requestId,
      );
    }
    return {
      ...(await c.query(observationView + " WHERE o.id=$1", [old.id])).rows[0],
      replayed: true,
    };
  }
  const now = Date.now(),
    raw = Date.parse(p.raw_captured_at),
    clock = p.clock;
  const estimated = clock ? raw + clock.offset_ms : null;
  const reasons: string[] = [];
  if (recovery) reasons.push("recovery");
  if (current.state === "closed" || grant?.closed_at) reasons.push("late_upload");
  if (
    !clock ||
    clock.uncertain ||
    clock.rtt_ms > 1000 ||
    Math.abs(raw - Date.parse(clock.measured_at)) > 300000 ||
    estimated === null ||
    Math.abs(estimated - now) > 86400000 ||
    estimated > now + 1000
  )
    reasons.push("time_uncertain");
  // Device dates alone never establish entitlement: late receipt is ALWAYS reviewed.
  if (
    grant &&
    (now > Date.parse(grant.expires_at) ||
      estimated === null ||
      estimated < Date.parse(grant.issued_at) - 1000 ||
      estimated > Date.parse(grant.expires_at))
  )
    reasons.push("outside_grant");
  if (!grant && !recovery) reasons.push("time_uncertain");
  const row = (
    await c.query(
      `INSERT INTO app.observations(organization_id,event_id,checkpoint_id,session_id,device_id,client_event_id,bib,raw_captured_at,canonical_payload,estimated_captured_at,timing)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [
        current.organization_id,
        current.event_id,
        current.checkpoint_id,
        original.id,
        original.device_id,
        p.client_event_id,
        p.bib,
        canonical.raw_captured_at,
        JSON.stringify(canonical),
        estimated === null ? null : new Date(estimated),
        clock ? JSON.stringify(clock) : null,
      ],
    )
  ).rows[0];
  const duplicates = (
    await c.query(
      `SELECT id FROM app.observations WHERE organization_id=$1 AND event_id=$2 AND checkpoint_id=$3 AND bib=$4
 AND raw_captured_at BETWEEN $5::timestamptz-interval '5 seconds' AND $5::timestamptz+interval '5 seconds' AND id<>$6`,
      [
        current.organization_id,
        current.event_id,
        current.checkpoint_id,
        p.bib,
        canonical.raw_captured_at,
        row.id,
      ],
    )
  ).rows;
  if (duplicates.length)
    for (const other of [row, ...duplicates])
      await flag(c, current.organization_id, other.id, "possible_duplicate");
  for (const reason of reasons) await flag(c, current.organization_id, row.id, reason);
  await audit(
    c,
    current.organization_id,
    recovery?.actor ?? null,
    recovery ? "observation.recovered" : "observation.created",
    row.id,
    {
      event_id: current.event_id,
      checkpoint_id: current.checkpoint_id,
      session_id: original.id,
      device_id: original.device_id,
      reasons,
      ...(recovery ? { reason: recovery.reason } : {}),
    },
    requestId,
  );
  return {
    ...(await c.query(observationView + " WHERE o.id=$1", [row.id])).rows[0],
    replayed: false,
  };
}
async function flag(c: pg.PoolClient, org: string, id: string, reason: string) {
  await c.query(
    "INSERT INTO app.observation_flags(organization_id,observation_id,reason) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
    [org, id, reason],
  );
}
export function registerOffline(
  app: FastifyInstance,
  options: AuthOptions,
  auth: ReturnType<typeof authService>,
  context: Context,
) {
  const { pool } = options;
  app.get("/api/v1/field/time", async (req) =>
    context(req, async () => ({ server_time: new Date().toISOString() })),
  );
  app.post("/api/v1/field/prepare", async (req) =>
    context(req, async (c, s) => {
      if (s.state !== "running")
        throw new HttpError(
          409,
          "EVENT_NOT_RUNNING",
          "A corrida precisa estar em andamento para preparar captura",
        );
      const w = (
        await c.query(
          "SELECT id FROM app.capture_windows WHERE organization_id=$1 AND event_id=$2 AND closed_at IS NULL",
          [s.organization_id, s.event_id],
        )
      ).rows[0];
      if (!w) throw new HttpError(409, "NO_CAPTURE_WINDOW", "Janela indisponível");
      const grant = (
        await c.query(
          `INSERT INTO app.capture_grants(organization_id,session_id,event_id,checkpoint_id,window_id,expires_at)
   VALUES($1,$2,$3,$4,$5,LEAST($6,now()+interval '2 hours')) RETURNING id,issued_at,expires_at,window_id`,
          [s.organization_id, s.id, s.event_id, s.checkpoint_id, w.id, s.expires_at],
        )
      ).rows[0];
      return { grant, server_time: new Date().toISOString() };
    }),
  );
  app.post(
    "/api/v1/field/sync",
    {
      config: { rateLimit: { max: 600, timeWindow: "1 minute" } },
      schema: { body: syncBody, response: { 200: syncReply, 201: syncReply } },
    },
    async (req, reply) => {
      const p = syncPayload.parse(req.body);
      const result = await context(req, (c, s) => ingest(c, s, p, req.id));
      reply.code(result.replayed ? 200 : 201);
      return result;
    },
  );
  app.post("/api/v1/field/heartbeat", async (req) => {
    const count = z.number().int().min(0).max(1000000);
    const p = z
      .object({ pending: count, sending: count, synced: count, blocked: count })
      .strict()
      .parse(req.body);
    return context(req, async (c, s) => {
      await c.query(
        `INSERT INTO app.device_status(organization_id,credential_id,session_id,pending,sending,synced,blocked) VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(organization_id,credential_id) DO UPDATE SET session_id=excluded.session_id,last_seen_at=clock_timestamp(),pending=excluded.pending,sending=excluded.sending,synced=excluded.synced,blocked=excluded.blocked`,
        [s.organization_id, s.credential_id, s.id, p.pending, p.sending, p.synced, p.blocked],
      );
      return { received_at: new Date().toISOString() };
    });
  });
  app.get("/api/v1/events/:id/devices", async (req) => {
    const a = await auth.authenticate(req),
      event = uuid.parse((req.params as { id: string }).id);
    return transaction(
      pool,
      async (c) => ({
        items: (
          await c.query(
            `SELECT cr.id,cr.label,cr.device_id,p.name checkpoint_name,d.last_seen_at,d.pending,d.sending,d.synced,d.blocked,
   (d.last_seen_at IS NULL OR d.last_seen_at<now()-interval '2 minutes') AS stale
   FROM app.checkpoint_credentials cr JOIN app.checkpoints p ON p.id=cr.checkpoint_id
   LEFT JOIN app.device_status d ON d.credential_id=cr.id AND d.organization_id=cr.organization_id
   WHERE cr.organization_id=$1 AND cr.event_id=$2 ORDER BY cr.created_at`,
            [a.organization_id, event],
          )
        ).rows,
      }),
      a.organization_id,
    );
  });
  const pkg = z
    .object({
      version: z.literal(1),
      event_id: uuid,
      checkpoint_id: uuid,
      items: z
        .array(
          z.object({ payload: syncPayload, sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
        )
        .min(1)
        .max(100),
    })
    .strict();
  app.post("/api/v1/events/:id/recovery", { bodyLimit: 1024 * 256 }, async (req) => {
    const a = await auth.authenticate(req),
      event = uuid.parse((req.params as { id: string }).id);
    const input = z
      .object({ reason: z.string().trim().min(10).max(500), package: pkg })
      .strict()
      .parse(req.body);
    if (input.package.event_id !== event)
      throw new HttpError(422, "SCOPE_MISMATCH", "O pacote pertence a outro evento");
    return transaction(
      pool,
      async (c) => {
        const e = (
          await c.query(
            "SELECT state FROM app.events WHERE organization_id=$1 AND id=$2 FOR SHARE",
            [a.organization_id, event],
          )
        ).rows[0];
        if (!e) throw new HttpError(404, "NOT_FOUND", "Evento não encontrado");
        const results = [];
        for (const item of input.package.items) {
          if (digest(JSON.stringify(orderedPayload(item.payload))) !== item.sha256)
            throw new HttpError(422, "HASH_MISMATCH", "Integridade do pacote inválida");
          const s = (
            await c.query(
              `SELECT s.*,cr.device_id FROM app.checkpoint_sessions s JOIN app.checkpoint_credentials cr ON cr.id=s.credential_id
     WHERE s.organization_id=$1 AND s.event_id=$2 AND s.checkpoint_id=$3 AND s.id=$4`,
              [
                a.organization_id,
                event,
                input.package.checkpoint_id,
                item.payload.capture_session_id,
              ],
            )
          ).rows[0];
          if (!s) throw new HttpError(403, "SCOPE_MISMATCH", "Sessão original fora do escopo");
          results.push(
            await ingest(c, { ...s, state: e.state }, item.payload, req.id, {
              actor: a.user_id,
              reason: input.reason,
            }),
          );
        }
        return { items: results };
      },
      a.organization_id,
    );
  });
}
