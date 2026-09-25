import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import { z } from "zod";
import type { AuthOptions, authService } from "./auth.js";
import { audit, HttpError, transaction } from "./db.js";
import type { FieldScope } from "./offline.js";

const uuid = z.string().uuid(),
  reason = z.string().trim().min(3).max(500);
const filters = z
  .object({
    bib: z
      .string()
      .regex(/^[0-9]{1,8}$/)
      .optional(),
    checkpoint_id: uuid.optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    status: z.enum(["accepted", "invalidated", "pending"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(1000000).default(0),
  })
  .strict()
  .refine((v) => !v.from || !v.to || Date.parse(v.from) <= Date.parse(v.to), "Período inválido");

// Pending evidence is acknowledged explicitly by each immutable revision.
export const effectiveView = `SELECT o.*,p.name checkpoint_name,
 coalesce(r.version,0) version,
 (SELECT count(*) FROM app.observation_flags f WHERE f.organization_id=o.organization_id AND f.observation_id=o.id)::int + (SELECT count(*) FROM app.review_requests q WHERE q.organization_id=o.organization_id AND q.observation_id=o.id)::int evidence_version, coalesce(r.bib,o.bib) effective_bib,
 coalesce(r.captured_at,o.estimated_captured_at,o.raw_captured_at) effective_captured_at,
 coalesce(r.disposition,'accepted') disposition,
 CASE WHEN EXISTS(SELECT 1 FROM app.observation_flags f WHERE f.organization_id=o.organization_id AND f.observation_id=o.id AND NOT(f.reason=ANY(coalesce(r.reviewed_flags,ARRAY[]::text[]))))
 OR EXISTS(SELECT 1 FROM app.review_requests q WHERE q.organization_id=o.organization_id AND q.observation_id=o.id AND NOT(q.id=ANY(coalesce(r.reviewed_requests,ARRAY[]::uuid[]))))
 THEN 'pending' ELSE coalesce(r.disposition,'accepted') END status,
 EXISTS(SELECT 1 FROM app.observation_flags f WHERE f.organization_id=o.organization_id AND f.observation_id=o.id AND f.reason='possible_duplicate') possible_duplicate
 FROM app.observations o JOIN app.checkpoints p ON p.organization_id=o.organization_id AND p.id=o.checkpoint_id
 LEFT JOIN LATERAL(SELECT * FROM app.observation_revisions r WHERE r.organization_id=o.organization_id AND r.observation_id=o.id ORDER BY version DESC LIMIT 1) r ON true`;

export async function eventLock(c: pg.PoolClient, org: string, id: string, exclusive = false) {
  const e = (
    await c.query(
      `SELECT * FROM app.events WHERE organization_id=$1 AND id=$2 FOR ${exclusive ? "UPDATE" : "SHARE"}`,
      [org, id],
    )
  ).rows[0];
  if (!e) throw new HttpError(404, "NOT_FOUND", "Evento não encontrado");
  return e;
}
async function observation(c: pg.PoolClient, org: string, event: string, id: string) {
  const row = (
    await c.query(
      `SELECT * FROM (${effectiveView}) v WHERE organization_id=$1 AND event_id=$2 AND id=$3`,
      [org, event, id],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "NOT_FOUND", "Passagem não encontrada");
  return row;
}
export async function reconciliation(
  c: pg.PoolClient,
  org: string,
  e: { id: string; version: number },
) {
  const devices = (
    await c.query(
      `SELECT cr.id,cr.label,p.name checkpoint_name,s.last_seen_at,s.pending,s.sending,s.blocked,
 s.last_seen_at IS NULL OR s.last_seen_at<clock_timestamp()-interval '2 minutes' stale,
 jsonb_build_object('observations',(SELECT count(*) FROM app.observations o JOIN app.checkpoint_sessions cs ON cs.id=o.session_id WHERE o.organization_id=cr.organization_id AND o.event_id=cr.event_id AND cs.credential_id=cr.id),
 'pending',s.pending,'sending',s.sending,'blocked',s.blocked) evidence,
 r.event_version reconciled_version,r.evidence reconciled_evidence,r.reason,r.created_at reconciled_at
 FROM app.checkpoint_credentials cr JOIN app.checkpoints p ON p.id=cr.checkpoint_id
 LEFT JOIN app.device_status s ON s.organization_id=cr.organization_id AND s.credential_id=cr.id
 LEFT JOIN LATERAL(SELECT * FROM app.device_reconciliations r WHERE r.organization_id=cr.organization_id AND r.credential_id=cr.id ORDER BY created_at DESC,id DESC LIMIT 1) r ON true
 WHERE cr.organization_id=$1 AND cr.event_id=$2 ORDER BY p.sequence,cr.label,cr.id`,
      [org, e.id],
    )
  ).rows;
  const items = devices.map((d) => ({
    ...d,
    reconciled:
      d.reconciled_version === e.version &&
      JSON.stringify(d.evidence) === JSON.stringify(d.reconciled_evidence),
  }));
  const pending = Number(
    (
      await c.query(
        `SELECT count(*) FROM (${effectiveView}) v WHERE organization_id=$1 AND event_id=$2 AND status='pending'`,
        [org, e.id],
      )
    ).rows[0].count,
  );
  return {
    items,
    pending_reviews: pending,
    unreconciled_devices: items.filter((d) => !d.reconciled).length,
  };
}
export function csvCell(value: unknown) {
  let s = value == null ? "" : String(value);
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function registerManagement(
  app: FastifyInstance,
  options: AuthOptions,
  auth: ReturnType<typeof authService>,
  context: <T>(
    req: FastifyRequest,
    fn: (c: pg.PoolClient, s: FieldScope) => Promise<T>,
  ) => Promise<T>,
) {
  const base = "/api/v1/events/:id";
  const params = (req: FastifyRequest) =>
    z.object({ id: uuid, observationId: uuid.optional() }).parse(req.params);
  const scoped = async <T>(
    req: FastifyRequest,
    fn: (
      c: pg.PoolClient,
      a: Awaited<ReturnType<typeof auth.authenticate>>,
      e: { id: string; version: number; state: string; timezone: string },
    ) => Promise<T>,
    exclusive = false,
  ) => {
    const a = await auth.authenticate(req),
      id = params(req).id;
    return transaction(
      options.pool,
      async (c) => fn(c, a, await eventLock(c, a.organization_id, id, exclusive)),
      a.organization_id,
    );
  };
  async function query(
    req: FastifyRequest,
    c: pg.PoolClient,
    org: string,
    event: string,
    exporting = false,
  ) {
    const f = filters.parse(req.query);
    const values: unknown[] = [org, event];
    const conditions = ["organization_id=$1", "event_id=$2"];
    for (const [name, op, value] of [
      ["effective_bib", "=", f.bib],
      ["checkpoint_id", "=", f.checkpoint_id],
      ["effective_captured_at", ">=", f.from],
      ["effective_captured_at", "<=", f.to],
      ["status", "=", f.status],
    ] as const) {
      if (value !== undefined) {
        values.push(value);
        conditions.push(name + op + "$" + values.length);
      }
    }
    const where = conditions.join(" AND "),
      source = `FROM (${effectiveView}) v WHERE ${where}`;
    const summary = (
      await c.query(
        `SELECT count(*)::int total,count(*) FILTER(WHERE status='pending')::int pending,count(*) FILTER(WHERE status='invalidated')::int invalidated ${source}`,
        values,
      )
    ).rows[0];
    if (exporting && summary.total > 50000)
      throw new HttpError(422, "EXPORT_TOO_LARGE", "Filtre a exportação para até 50.000 passagens");
    const rows = (
      await c.query(
        `SELECT id,bib,raw_captured_at,estimated_captured_at,received_at,source,checkpoint_id,checkpoint_name,version,effective_bib,effective_captured_at,disposition,status,possible_duplicate,status='pending' needs_review ${source} ORDER BY received_at DESC,id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, exporting ? 50000 : f.limit, exporting ? 0 : f.offset],
      )
    ).rows;
    return {
      items: rows,
      ...summary,
      limit: f.limit,
      offset: f.offset,
      updated_at: new Date().toISOString(),
    };
  }
  app.get(base + "/observations", (req) =>
    scoped(req, (c, a, e) => query(req, c, a.organization_id, e.id)),
  );
  app.get(base + "/observations.csv", async (req, reply) => {
    const output = await scoped(
      req,
      async (c, a, e) => {
        const result = await query(req, c, a.organization_id, e.id, true);
        const columns = [
          "id",
          "effective_bib",
          "bib",
          "checkpoint_name",
          "effective_captured_at",
          "raw_captured_at",
          "estimated_captured_at",
          "received_at",
          "timezone",
          "source",
          "status",
          "version",
        ];
        const lines = [columns.map(csvCell).join(",")];
        for (const row of result.items)
          lines.push(
            columns
              .map((k) =>
                csvCell(
                  k === "timezone"
                    ? e.timezone
                    : row[k] instanceof Date
                      ? row[k].toISOString()
                      : row[k],
                ),
              )
              .join(","),
          );
        await audit(
          c,
          a.organization_id,
          a.user_id,
          "observations.exported",
          e.id,
          { event_id: e.id, filters: req.query, count: result.total },
          req.id,
        );
        return "\uFEFF" + lines.join("\r\n") + "\r\n";
      },
      true,
    );
    reply
      .header("Cache-Control", "no-store")
      .header("Content-Disposition", 'attachment; filename="passagens.csv"')
      .type("text/csv; charset=utf-8");
    return output;
  });
  app.get(base + "/observations/:observationId", (req) =>
    scoped(req, async (c, a, e) => {
      const id = params(req).observationId!;
      return {
        observation: await observation(c, a.organization_id, e.id, id),
        revisions: (
          await c.query(
            "SELECT r.*,u.email actor FROM app.observation_revisions r JOIN app.users u ON u.id=r.actor_id WHERE r.organization_id=$1 AND observation_id=$2 ORDER BY version DESC",
            [a.organization_id, id],
          )
        ).rows,
        requests: (
          await c.query(
            "SELECT id,reason,created_at FROM app.review_requests WHERE organization_id=$1 AND observation_id=$2 ORDER BY created_at",
            [a.organization_id, id],
          )
        ).rows,
        flags: (
          await c.query(
            "SELECT reason,created_at FROM app.observation_flags WHERE organization_id=$1 AND observation_id=$2",
            [a.organization_id, id],
          )
        ).rows,
      };
    }),
  );
  app.post(base + "/observations/:observationId/revisions", (req) =>
    scoped(req, async (c, a, e) => {
      const v = z
        .object({
          request_id: uuid,
          expected_version: z.number().int().min(0),
          expected_evidence: z.number().int().min(0),
          reason,
          bib: z.string().regex(/^[0-9]{1,8}$/),
          captured_at: z.string().datetime({ offset: true }),
          disposition: z.enum(["accepted", "invalidated"]),
        })
        .strict()
        .parse(req.body);
      const id = params(req).observationId!;
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [e.id]);
      const canonical = { ...v, observation_id: id };
      const prior = (
        await c.query(
          "SELECT *,canonical_payload=$3::jsonb matches FROM app.observation_revisions WHERE organization_id=$1 AND request_id=$2",
          [a.organization_id, v.request_id, JSON.stringify(canonical)],
        )
      ).rows[0];
      if (prior) {
        if (!prior.matches)
          throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Identificador de revisão já utilizado");
        return { revision: prior, replayed: true };
      }
      if (["finalized", "archived"].includes(e.state))
        throw new HttpError(409, "EVENT_FINALIZED", "Reabra o evento antes de revisar");
      const before = await observation(c, a.organization_id, e.id, id);
      if (before.version !== v.expected_version || before.evidence_version !== v.expected_evidence)
        throw new HttpError(
          409,
          "VERSION_CONFLICT",
          "Outra revisão foi salva. Atualize antes de corrigir.",
        );
      const result = (
        await c.query(
          `INSERT INTO app.observation_revisions(organization_id,observation_id,request_id,version,actor_id,reason,bib,captured_at,disposition,before_value,canonical_payload,reviewed_flags,reviewed_requests)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
 ARRAY(SELECT reason FROM app.observation_flags WHERE organization_id=$1 AND observation_id=$2),
 ARRAY(SELECT id FROM app.review_requests WHERE organization_id=$1 AND observation_id=$2)) RETURNING *`,
          [
            a.organization_id,
            id,
            v.request_id,
            before.version + 1,
            a.user_id,
            v.reason,
            v.bib,
            v.captured_at,
            v.disposition,
            JSON.stringify({
              bib: before.effective_bib,
              captured_at: before.effective_captured_at,
              disposition: before.disposition,
              status: before.status,
            }),
            JSON.stringify(canonical),
          ],
        )
      ).rows[0];
      await audit(
        c,
        a.organization_id,
        a.user_id,
        "observation.revised",
        id,
        {
          event_id: e.id,
          revision_id: result.id,
          before: result.before_value,
          after: { bib: v.bib, captured_at: v.captured_at, disposition: v.disposition },
          reason: v.reason,
        },
        req.id,
      );
      return { revision: result, replayed: false };
    }),
  );
  app.post("/api/v1/field/observations/:observationId/review-requests", (req) =>
    context(req, async (c, s) => {
      const id = uuid.parse((req.params as { observationId: string }).observationId);
      const v = z.object({ request_id: uuid, reason }).strict().parse(req.body);
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [s.event_id]);
      const own = (
        await c.query(
          "SELECT id FROM app.observations WHERE organization_id=$1 AND id=$2 AND session_id=$3",
          [s.organization_id, id, s.id],
        )
      ).rowCount;
      if (!own) throw new HttpError(404, "NOT_FOUND", "Passagem não encontrada nesta sessão");
      const prior = (
        await c.query(
          "SELECT * FROM app.review_requests WHERE organization_id=$1 AND request_id=$2",
          [s.organization_id, v.request_id],
        )
      ).rows[0];
      if (prior) {
        if (prior.observation_id !== id || prior.reason !== v.reason || prior.session_id !== s.id)
          throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Identificador já utilizado");
        return prior;
      }
      if (["finalized", "archived"].includes(s.state))
        throw new HttpError(409, "EVENT_FINALIZED", "Solicite ao administrador a reabertura");
      const row = (
        await c.query(
          "INSERT INTO app.review_requests(organization_id,observation_id,session_id,request_id,reason) VALUES($1,$2,$3,$4,$5) RETURNING *",
          [s.organization_id, id, s.id, v.request_id, v.reason],
        )
      ).rows[0];
      await audit(
        c,
        s.organization_id,
        null,
        "observation.review_requested",
        id,
        { event_id: s.event_id, session_id: s.id, reason: v.reason },
        req.id,
      );
      return row;
    }),
  );
  app.get(base + "/reconciliation", (req) =>
    scoped(req, (c, a, e) =>
      reconciliation(c, a.organization_id, { id: e.id, version: e.version }),
    ),
  );
  app.post(base + "/reconciliation", (req) =>
    scoped(
      req,
      async (c, a, e) => {
        const v = z
          .object({ credential_id: uuid, reason, expected_version: z.number().int().min(0) })
          .strict()
          .parse(req.body);
        if (e.state !== "closed")
          throw new HttpError(409, "EVENT_NOT_CLOSED", "Feche a coleta antes de conciliar");
        if (e.version !== v.expected_version)
          throw new HttpError(409, "VERSION_CONFLICT", "Atualize o evento");
        const devices = await reconciliation(c, a.organization_id, {
          id: e.id,
          version: e.version,
        });
        const device = devices.items.find((d) => d.id === v.credential_id);
        if (!device) throw new HttpError(404, "NOT_FOUND", "Aparelho não encontrado");
        if (device.stale || device.pending !== 0 || device.sending !== 0 || device.blocked !== 0)
          throw new HttpError(
            409,
            "DEVICE_PENDING",
            "Aparelho sem confirmação recente ou com registros pendentes. Sincronize ou use exceção ao finalizar.",
          );
        await c.query(
          "INSERT INTO app.device_reconciliations(organization_id,event_id,credential_id,actor_id,reason,event_version,evidence) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            a.organization_id,
            e.id,
            v.credential_id,
            a.user_id,
            v.reason,
            e.version,
            JSON.stringify(device.evidence),
          ],
        );
        await audit(
          c,
          a.organization_id,
          a.user_id,
          "device.reconciled",
          v.credential_id,
          { event_id: e.id, reason: v.reason, evidence: device.evidence },
          req.id,
        );
        return { reconciled: true };
      },
      true,
    ),
  );
}
