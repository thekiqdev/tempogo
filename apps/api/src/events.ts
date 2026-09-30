import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import type { authService, Principal } from "./auth.js";
import { audit, HttpError, transaction } from "./db.js";
import { chipMappings, importChips } from "./event-chips.js";
import { reconciliation } from "./management.js";

const id = z.string().uuid(),
  name = z.string().trim().min(2).max(120);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Data inválida",
  );
const timezone = z
  .string()
  .max(80)
  .refine((v) => {
    try {
      new Intl.DateTimeFormat("pt-BR", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "Fuso inválido");
const eventInput = z
  .object({
    name,
    local_date: date,
    timezone,
    location: z.string().trim().max(200).default(""),
    category_name: name,
    laps: z.number().int().min(1).max(999).default(1),
    min_lap_seconds: z.number().int().min(11).max(86400).default(60),
    chip_mappings: chipMappings.optional(),
    distance_m: z.number().int().positive().max(1000000).nullable(),
  })
  .strict();
const cpInput = z
  .object({
    name,
    kind: z.enum(["start", "intermediate", "finish"]),
    sequence: z.number().int().min(1).max(10000),
    distance_m: z.number().int().min(0).max(1000000).nullable(),
    active: z.boolean().default(true),
  })
  .strict();
const expected_version = z.number().int().nonnegative();
const transition = z
  .object({
    target_state: z.enum(["draft", "ready", "running", "closed", "finalized", "archived"]),
    expected_version,
    reason: z.string().trim().min(3).max(500),
    gun_start_at: z.string().datetime({ offset: true }).optional(),
    exception_reason: z.string().trim().min(10).max(500).optional(),
  })
  .strict();
type EventRow = { id: string; state: string; version: number; paused_for_edit: boolean };
type CP = z.infer<typeof cpInput> & { id: string; version: number };
async function lock(c: pg.PoolClient, org: string, eventId: string) {
  const e = (
    await c.query<EventRow>(
      "SELECT * FROM app.events WHERE organization_id=$1 AND id=$2 FOR UPDATE",
      [org, eventId],
    )
  ).rows[0];
  if (!e) throw new HttpError(404, "NOT_FOUND", "Evento não encontrado");
  return e;
}
function version(actual: number, expected: number) {
  if (actual !== expected)
    throw new HttpError(409, "VERSION_CONFLICT", "Os dados mudaram. Atualize antes de salvar");
}
function draft(event: EventRow) {
  if (event.state !== "draft" && !(event.state === "closed" && event.paused_for_edit))
    throw new HttpError(
      409,
      "EVENT_LOCKED",
      "Pause o evento para editar ou use um evento em rascunho",
    );
}
async function validate(c: pg.PoolClient, org: string, eventId: string, candidate?: CP) {
  let rows = (
    await c.query<CP>("SELECT * FROM app.checkpoints WHERE organization_id=$1 AND event_id=$2", [
      org,
      eventId,
    ])
  ).rows;
  if (candidate) rows = [...rows.filter((x) => x.id !== candidate.id), candidate];
  rows.sort((a, b) => a.sequence - b.sequence);
  if (new Set(rows.map((r) => r.sequence)).size !== rows.length)
    throw new HttpError(409, "SEQUENCE_CONFLICT", "Ordem já utilizada");
  const total = (
    await c.query<{ distance_m: number | null }>(
      "SELECT distance_m FROM app.race_categories WHERE organization_id=$1 AND event_id=$2",
      [org, eventId],
    )
  ).rows[0]?.distance_m;
  let previous = -1;
  for (const row of rows)
    if (row.distance_m !== null) {
      if (row.distance_m < previous || (total != null && row.distance_m > total))
        throw new HttpError(
          422,
          "DISTANCE_ORDER",
          "Distâncias devem seguir a ordem do percurso e não ultrapassar a modalidade",
        );
      previous = row.distance_m;
    }
  const active = rows.filter((r) => r.active);
  for (const kind of ["start", "finish"])
    if (active.filter((r) => r.kind === kind).length > 1)
      throw new HttpError(422, "CHECKPOINT_KIND", "Use somente uma largada e uma chegada ativas");
  const start = active.find((r) => r.kind === "start"),
    finish = active.find((r) => r.kind === "finish");
  if ((start && active[0]?.id !== start.id) || (finish && active.at(-1)?.id !== finish.id))
    throw new HttpError(
      422,
      "CHECKPOINT_ORDER",
      "Largada deve ser o primeiro ponto; chegada, o último",
    );
  return active;
}
const select = `SELECT e.*,to_char(e.local_date,'YYYY-MM-DD') AS local_date,c.name AS category_name,c.distance_m,c.gun_start_at,c.id AS category_id FROM app.events e JOIN app.race_categories c ON c.organization_id=e.organization_id AND c.event_id=e.id`;
export function registerEvents(
  app: FastifyInstance,
  pool: pg.Pool,
  auth: ReturnType<typeof authService>,
) {
  const scoped = <T>(p: Principal, fn: (c: pg.PoolClient) => Promise<T>) =>
    transaction(pool, fn, p.organization_id);
  app.get("/api/v1/events", async (req) => {
    const p = await auth.authenticate(req),
      q = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(50),
          offset: z.coerce.number().int().min(0).max(100000).default(0),
        })
        .strict()
        .parse(req.query);
    return scoped(p, async (c) => ({
      items: (
        await c.query(
          select + " WHERE e.organization_id=$1 ORDER BY e.created_at DESC,e.id LIMIT $2 OFFSET $3",
          [p.organization_id, q.limit, q.offset],
        )
      ).rows,
    }));
  });
  app.post("/api/v1/events", { bodyLimit: 2 * 1024 * 1024 }, async (req, reply) => {
    const p = await auth.authenticate(req),
      v = eventInput.parse(req.body);
    const result = await scoped(p, async (c) => {
      const e = (
        await c.query<EventRow>(
          "INSERT INTO app.events(organization_id,name,local_date,timezone,location,created_by,laps,min_lap_seconds) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
          [
            p.organization_id,
            v.name,
            v.local_date,
            v.timezone,
            v.location,
            p.user_id,
            v.laps,
            v.min_lap_seconds,
          ],
        )
      ).rows[0];
      if (!e) throw new Error("Evento não criado");
      await c.query(
        "INSERT INTO app.race_categories(organization_id,event_id,name,distance_m) VALUES($1,$2,$3,$4)",
        [p.organization_id, e.id, v.category_name, v.distance_m],
      );
      if (v.chip_mappings)
        await importChips(c, p.organization_id, e.id, v.chip_mappings, p.user_id, req.id);
      await audit(c, p.organization_id, p.user_id, "event.created", e.id, { after: v }, req.id);
      return { id: e.id };
    });
    reply.code(201);
    return result;
  });
  app.get("/api/v1/events/:id/chips", async (req) => {
    const p = await auth.authenticate(req),
      eid = id.parse((req.params as { id: string }).id);
    return scoped(p, async (c) => {
      await lock(c, p.organization_id, eid);
      const total = Number(
        (
          await c.query(
            "SELECT count(*) FROM app.event_chips WHERE organization_id=$1 AND event_id=$2",
            [p.organization_id, eid],
          )
        ).rows[0].count,
      );
      const items = (
        await c.query(
          "SELECT bib,chip FROM app.event_chips WHERE organization_id=$1 AND event_id=$2 ORDER BY bib LIMIT 20",
          [p.organization_id, eid],
        )
      ).rows;
      return { total, items };
    });
  });
  app.post("/api/v1/events/:id/chips", { bodyLimit: 2 * 1024 * 1024 }, async (req) => {
    const p = await auth.authenticate(req),
      eid = id.parse((req.params as { id: string }).id);
    const v = z
      .object({ rows: chipMappings.min(1) })
      .strict()
      .parse(req.body);
    return scoped(p, async (c) => {
      const event = await lock(c, p.organization_id, eid);
      if (["finalized", "archived"].includes(event.state))
        throw new HttpError(409, "EVENT_LOCKED", "Evento finalizado: reabra para importar chips.");
      await importChips(c, p.organization_id, eid, v.rows, p.user_id, req.id);
      return { imported: v.rows.length };
    });
  });
  app.get("/api/v1/events/:id", async (req) => {
    const p = await auth.authenticate(req),
      eid = id.parse((req.params as { id: string }).id);
    return scoped(p, async (c) => {
      const e = (
        await c.query(select + " WHERE e.organization_id=$1 AND e.id=$2", [p.organization_id, eid])
      ).rows[0];
      if (!e) throw new HttpError(404, "NOT_FOUND", "Evento não encontrado");
      return e;
    });
  });
  app.patch("/api/v1/events/:id", { bodyLimit: 2 * 1024 * 1024 }, async (req) => {
    const p = await auth.authenticate(req),
      eid = id.parse((req.params as { id: string }).id),
      v = eventInput.extend({ expected_version }).parse(req.body);
    return scoped(p, async (c) => {
      const before = await lock(c, p.organization_id, eid);
      draft(before);
      version(before.version, v.expected_version);
      await c.query(
        "UPDATE app.race_categories SET name=$1,distance_m=$2 WHERE organization_id=$3 AND event_id=$4",
        [v.category_name, v.distance_m, p.organization_id, eid],
      );
      await validate(c, p.organization_id, eid);
      const result = await c.query(
        "UPDATE app.events SET name=$1,local_date=$2,timezone=$3,location=$4,laps=$7,min_lap_seconds=$8,version=version+1 WHERE organization_id=$5 AND id=$6 RETURNING version",
        [
          v.name,
          v.local_date,
          v.timezone,
          v.location,
          p.organization_id,
          eid,
          v.laps,
          v.min_lap_seconds,
        ],
      );
      if (v.chip_mappings)
        await importChips(c, p.organization_id, eid, v.chip_mappings, p.user_id, req.id);
      await audit(
        c,
        p.organization_id,
        p.user_id,
        "event.updated",
        eid,
        { before, after: v },
        req.id,
      );
      return result.rows[0];
    });
  });
  app.get("/api/v1/events/:id/checkpoints", async (req) => {
    const p = await auth.authenticate(req),
      eid = id.parse((req.params as { id: string }).id);
    return scoped(p, async (c) => {
      await lock(c, p.organization_id, eid);
      return {
        items: (
          await c.query(
            `SELECT p.*, (SELECT count(*)::int FROM app.checkpoint_credentials cr
 JOIN app.device_status d ON d.organization_id=cr.organization_id AND d.credential_id=cr.id
 JOIN app.checkpoint_sessions s ON s.organization_id=cr.organization_id AND s.id=d.session_id
 WHERE cr.organization_id=p.organization_id AND cr.checkpoint_id=p.id AND p.active
 AND EXISTS(SELECT 1 FROM app.events e WHERE e.organization_id=p.organization_id AND e.id=p.event_id AND (e.state IN ('draft','ready','running') OR (e.state='closed' AND e.paused_for_edit))) AND cr.revoked_at IS NULL AND (cr.expires_at IS NULL OR cr.expires_at>clock_timestamp()) AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>clock_timestamp())
 AND d.last_seen_at>clock_timestamp()-interval '2 minutes') online_devices
 FROM app.checkpoints p WHERE p.organization_id=$1 AND p.event_id=$2 ORDER BY p.sequence`,
            [p.organization_id, eid],
          )
        ).rows,
      };
    });
  });
  app.post("/api/v1/events/:id/checkpoints", async (req, reply) => {
    const p = await auth.authenticate(req),
      eid = id.parse((req.params as { id: string }).id),
      v = cpInput.parse(req.body);
    const result = await scoped(p, async (c) => {
      draft(await lock(c, p.organization_id, eid));
      await validate(c, p.organization_id, eid, { ...v, id: "new", version: 0 });
      const cp = (
        await c.query(
          `INSERT INTO app.checkpoints(organization_id,event_id,race_category_id,name,kind,sequence,distance_m,active) SELECT $1,$2,id,$3,$4,$5,$6,$7 FROM app.race_categories WHERE organization_id=$1 AND event_id=$2 RETURNING *`,
          [p.organization_id, eid, v.name, v.kind, v.sequence, v.distance_m, v.active],
        )
      ).rows[0];
      await c.query("UPDATE app.events SET version=version+1 WHERE organization_id=$1 AND id=$2", [
        p.organization_id,
        eid,
      ]);
      await audit(
        c,
        p.organization_id,
        p.user_id,
        "checkpoint.created",
        cp.id,
        { event_id: eid, after: v },
        req.id,
      );
      return cp;
    });
    reply.code(201);
    return result;
  });
  app.patch("/api/v1/checkpoints/:id", async (req) => {
    const p = await auth.authenticate(req),
      cid = id.parse((req.params as { id: string }).id),
      v = cpInput.extend({ expected_version }).parse(req.body);
    return scoped(p, async (c) => {
      const ref = (
        await c.query<{ event_id: string }>(
          "SELECT event_id FROM app.checkpoints WHERE organization_id=$1 AND id=$2",
          [p.organization_id, cid],
        )
      ).rows[0];
      if (!ref) throw new HttpError(404, "NOT_FOUND", "Checkpoint não encontrado");
      draft(await lock(c, p.organization_id, ref.event_id));
      const before = (
        await c.query<CP>(
          "SELECT * FROM app.checkpoints WHERE organization_id=$1 AND id=$2 FOR UPDATE",
          [p.organization_id, cid],
        )
      ).rows[0];
      if (!before) throw new HttpError(404, "NOT_FOUND", "Checkpoint não encontrado");
      version(before.version, v.expected_version);
      await validate(c, p.organization_id, ref.event_id, {
        ...v,
        id: cid,
        version: before.version,
      });
      const result = await c.query(
        "UPDATE app.checkpoints SET name=$1,kind=$2,sequence=$3,distance_m=$4,active=$5,version=version+1 WHERE organization_id=$6 AND id=$7 RETURNING *",
        [v.name, v.kind, v.sequence, v.distance_m, v.active, p.organization_id, cid],
      );
      await c.query("UPDATE app.events SET version=version+1 WHERE organization_id=$1 AND id=$2", [
        p.organization_id,
        ref.event_id,
      ]);
      await audit(
        c,
        p.organization_id,
        p.user_id,
        "checkpoint.updated",
        cid,
        { event_id: ref.event_id, before, after: v },
        req.id,
      );
      return result.rows[0];
    });
  });
  async function preparation(c: pg.PoolClient, org: string, event: string) {
    const points = (
      await c.query(
        `SELECT p.id,p.name,EXISTS(SELECT 1 FROM app.checkpoint_credentials cr WHERE cr.organization_id=p.organization_id AND cr.checkpoint_id=p.id AND cr.revoked_at IS NULL AND (cr.expires_at IS NULL OR cr.expires_at>clock_timestamp())) has_access FROM app.checkpoints p WHERE p.organization_id=$1 AND p.event_id=$2 AND p.active ORDER BY p.sequence`,
        [org, event],
      )
    ).rows;
    return {
      active_checkpoints: points.length,
      missing_access: points.filter((p) => !p.has_access).map((p) => ({ id: p.id, name: p.name })),
      ready: points.length > 0 && points.every((p) => p.has_access),
    };
  }
  app.get("/api/v1/events/:id/preparation", async (req) => {
    const p = await auth.authenticate(req),
      eid = id.parse((req.params as { id: string }).id);
    return scoped(p, async (c) => {
      await lock(c, p.organization_id, eid);
      return preparation(c, p.organization_id, eid);
    });
  });
  app.post("/api/v1/events/:id/operations", async (req) => {
    const p = await auth.authenticate(req),
      eid = id.parse((req.params as { id: string }).id);
    const v = z
      .object({ action: z.enum(["start", "pause", "resume"]), expected_version })
      .strict()
      .parse(req.body);
    return scoped(p, async (c) => {
      const e = await lock(c, p.organization_id, eid);
      version(e.version, v.expected_version);
      const valid =
        v.action === "start"
          ? ["draft", "ready"].includes(e.state)
          : v.action === "pause"
            ? e.state === "running"
            : e.state === "closed" && e.paused_for_edit;
      if (!valid)
        throw new HttpError(
          409,
          "INVALID_TRANSITION",
          "A situação do evento mudou. Atualize antes de continuar.",
        );
      const reason = {
        start: "Evento iniciado pelo organizador",
        pause: "Pausa para edição solicitada pelo organizador",
        resume: "Coleta retomada após edição",
      }[v.action];
      if (v.action === "pause") {
        await c.query(
          "UPDATE app.capture_windows SET closed_at=GREATEST(clock_timestamp(),opened_at) WHERE organization_id=$1 AND event_id=$2 AND closed_at IS NULL",
          [p.organization_id, eid],
        );
      } else {
        if (!(await validate(c, p.organization_id, eid)).length)
          throw new HttpError(409, "NO_CHECKPOINT", "Cadastre ao menos um checkpoint ativo.");
        const check = await preparation(c, p.organization_id, eid);
        if (!check.ready)
          throw new HttpError(
            409,
            "ACCESS_REQUIRED",
            "Crie um acesso válido para cada checkpoint ativo antes de iniciar ou retomar.",
          );
        if (v.action === "start")
          await c.query(
            "UPDATE app.race_categories SET gun_start_at=clock_timestamp() WHERE organization_id=$1 AND event_id=$2",
            [p.organization_id, eid],
          );
        await c.query(
          "INSERT INTO app.capture_windows(organization_id,event_id,opened_at,reason) VALUES($1,$2,CASE WHEN $4 THEN (SELECT gun_start_at FROM app.race_categories WHERE organization_id=$1 AND event_id=$2) ELSE clock_timestamp() END,$3)",
          [p.organization_id, eid, reason, v.action === "start"],
        );
      }
      const result = (
        await c.query(
          "UPDATE app.events SET state=$1,paused_for_edit=$2,version=version+1 WHERE organization_id=$3 AND id=$4 RETURNING state,paused_for_edit,version",
          [
            v.action === "pause" ? "closed" : "running",
            v.action === "pause",
            p.organization_id,
            eid,
          ],
        )
      ).rows[0];
      await audit(
        c,
        p.organization_id,
        p.user_id,
        "event." + v.action,
        eid,
        { from: e.state, to: result.state, reason, paused_for_edit: result.paused_for_edit },
        req.id,
      );
      return result;
    });
  });
  app.post("/api/v1/events/:id/transitions", async (req) => {
    const p = await auth.authenticate(req),
      eid = id.parse((req.params as { id: string }).id),
      v = transition.parse(req.body);
    return scoped(p, async (c) => {
      const e = await lock(c, p.organization_id, eid);
      version(e.version, v.expected_version);
      if (v.target_state === "finalized") {
        if (e.state !== "closed")
          throw new HttpError(
            409,
            "RECONCILIATION_REQUIRED",
            "Feche e concilie a coleta antes de finalizar",
          );
        const check = await reconciliation(c, p.organization_id, e);
        if (check.pending_reviews)
          throw new HttpError(409, "REVIEWS_PENDING", "Resolva as passagens pendentes de revisão");
        if (check.unreconciled_devices && !v.exception_reason)
          throw new HttpError(
            409,
            "RECONCILIATION_REQUIRED",
            "Concilie todos os aparelhos ou justifique a exceção",
          );
        await audit(
          c,
          p.organization_id,
          p.user_id,
          "event.finalization_checked",
          eid,
          {
            event_id: eid,
            exception_reason: v.exception_reason,
            unreconciled_devices: check.items
              .filter((d) => !d.reconciled)
              .map((d) => ({ id: d.id, label: d.label, evidence: d.evidence, stale: d.stale })),
          },
          req.id,
        );
      } else if (v.exception_reason)
        throw new HttpError(
          422,
          "EXCEPTION_NOT_APPLICABLE",
          "Exceção só é permitida na finalização",
        );
      const allowed: Record<string, string[]> = {
        draft: ["ready"],
        ready: ["draft", "running"],
        running: ["closed"],
        closed: ["running", "finalized"],
        finalized: ["closed"],
      };
      if (!allowed[e.state]?.includes(v.target_state))
        throw new HttpError(409, "INVALID_TRANSITION", "Mudança de estado não permitida");
      if (
        ["ready", "running"].includes(v.target_state) &&
        !(await validate(c, p.organization_id, eid)).length
      )
        throw new HttpError(409, "NO_CHECKPOINT", "Cadastre ao menos um checkpoint ativo");
      if (v.target_state === "running") {
        if (e.state === "ready") {
          if (!v.gun_start_at)
            throw new HttpError(422, "START_REQUIRED", "Informe o horário real da largada");
          if (new Date(v.gun_start_at).getTime() > Date.now() + 60000)
            throw new HttpError(422, "START_IN_FUTURE", "A largada real não pode estar no futuro");
          await c.query(
            "UPDATE app.race_categories SET gun_start_at=$1 WHERE organization_id=$2 AND event_id=$3",
            [v.gun_start_at, p.organization_id, eid],
          );
        } else if (v.gun_start_at)
          throw new HttpError(422, "START_IMMUTABLE", "Reabrir não altera a largada original");
        await c.query(
          "INSERT INTO app.capture_windows(organization_id,event_id,opened_at,reason) VALUES($1,$2,$3,$4)",
          [
            p.organization_id,
            eid,
            e.state === "ready" ? v.gun_start_at : new Date().toISOString(),
            v.reason,
          ],
        );
      } else if (v.gun_start_at)
        throw new HttpError(422, "START_NOT_APPLICABLE", "Horário só é permitido ao iniciar");
      if (v.target_state === "closed")
        await c.query(
          "UPDATE app.capture_windows SET closed_at=GREATEST(now(),opened_at) WHERE organization_id=$1 AND event_id=$2 AND closed_at IS NULL",
          [p.organization_id, eid],
        );
      const result = await c.query(
        "UPDATE app.events SET state=$1,paused_for_edit=false,version=version+1 WHERE organization_id=$2 AND id=$3 RETURNING state,version",
        [v.target_state, p.organization_id, eid],
      );
      await audit(
        c,
        p.organization_id,
        p.user_id,
        "event.transition",
        eid,
        { from: e.state, to: v.target_state, reason: v.reason, gun_start_at: v.gun_start_at },
        req.id,
      );
      return result.rows[0];
    });
  });
  app.get("/api/v1/events/:id/audit", async (req) => {
    const p = await auth.authenticate(req),
      eid = id.parse((req.params as { id: string }).id);
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).max(1000000).default(0),
      })
      .strict()
      .parse(req.query);
    return scoped(p, async (c) => {
      await lock(c, p.organization_id, eid);
      const where =
        "a.organization_id=$1 AND (a.resource_id=$2 OR a.details->>'event_id'=$2::text)";
      return {
        items: (
          await c.query(
            "SELECT a.id,a.action,a.actor_id,u.email actor,a.details,a.created_at FROM app.audit_events a LEFT JOIN app.users u ON u.id=a.actor_id WHERE " +
              where +
              " ORDER BY a.created_at DESC,a.id LIMIT $3 OFFSET $4",
            [p.organization_id, eid, q.limit, q.offset],
          )
        ).rows,
        total: Number(
          (
            await c.query("SELECT count(*) FROM app.audit_events a WHERE " + where, [
              p.organization_id,
              eid,
            ])
          ).rows[0].count,
        ),
      };
    });
  });
}
