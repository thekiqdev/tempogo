import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import { z } from "zod";
import type { AuthOptions, authService } from "./auth.js";
import { captureOpenApi, manualBody, manualReply } from "./capture-contract.js";
import { audit, HttpError, transaction } from "./db.js";
import { eventLock, registerManagement } from "./management.js";
import { observationView, registerOffline } from "./offline.js";
import { csrfFor, digest, equal, hashPassword, token, verifyPassword } from "./security.js";

const uuid = z.string().uuid();
const cookieName = "cc_checkpoint";
type Field = {
  id: string;
  organization_id: string;
  event_id: string;
  checkpoint_id: string;
  credential_id: string;
  device_id: string;
  label: string;
  expires_at: Date;
  event_name: string;
  checkpoint_name: string;
  state: string;
};
const observationSelect = observationView;
export function registerCapture(
  app: FastifyInstance,
  options: AuthOptions,
  auth: ReturnType<typeof authService>,
) {
  const { pool } = options;
  app.addHook("onRequest", async (req, reply) => {
    if (req.url.startsWith("/api/v1/field") || req.url.includes("/access"))
      reply.header("Cache-Control", "no-store");
  });
  async function context<T>(
    req: FastifyRequest,
    fn: (c: pg.PoolClient, s: Field) => Promise<T>,
  ): Promise<T> {
    const raw = req.cookies[cookieName];
    if (!raw || !/^[a-f0-9]{64}$/.test(raw))
      throw new HttpError(401, "FIELD_SESSION_EXPIRED", "Entre com o código do checkpoint");
    if (
      !["GET", "HEAD"].includes(req.method) &&
      !equal(String(req.headers["x-csrf-token"] ?? ""), csrfFor(raw))
    )
      throw new HttpError(403, "CSRF_INVALID", "Atualize a página");
    const locator = (
      await pool.query("SELECT organization_id FROM app.checkpoint_sessions WHERE token_hash=$1", [
        digest(raw),
      ])
    ).rows[0];
    if (!locator) throw new HttpError(401, "FIELD_SESSION_EXPIRED", "Acesso expirado ou revogado");
    return transaction(
      pool,
      async (c) => {
        // Shared locks keep revocation and event transitions ordered against a commit.
        const s = (
          await c.query<Field>(
            `SELECT s.*,cr.device_id,cr.label,e.name AS event_name,e.state,p.name AS checkpoint_name
    FROM app.checkpoint_sessions s JOIN app.checkpoint_credentials cr ON cr.id=s.credential_id
    JOIN app.events e ON e.id=s.event_id AND e.organization_id=s.organization_id
    JOIN app.checkpoints p ON p.id=s.checkpoint_id AND p.organization_id=s.organization_id
    JOIN app.organizations org ON org.id=s.organization_id
    WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
    AND cr.revoked_at IS NULL AND cr.expires_at>clock_timestamp() AND p.active AND org.active
    FOR SHARE OF s,cr,e,p`,
            [digest(raw)],
          )
        ).rows[0];
        if (!s)
          throw new HttpError(
            401,
            "FIELD_SESSION_EXPIRED",
            "Acesso expirado, desativado ou revogado",
          );
        return fn(c, s);
      },
      locator.organization_id,
    );
  }
  registerOffline(app, options, auth, context);
  registerManagement(app, options, auth, context);
  app.get("/api/v1/capture/openapi.json", async () => captureOpenApi);
  app.post("/api/v1/checkpoints/:id/access", async (req, reply) => {
    const a = await auth.authenticate(req),
      id = uuid.parse((req.params as { id: string }).id);
    const input = z
      .object({
        label: z.string().trim().min(2).max(80),
        expires_at: z.string().datetime({ offset: true }),
      })
      .strict()
      .parse(req.body);
    const expiry = new Date(input.expires_at);
    if (expiry.getTime() <= Date.now() || expiry.getTime() > Date.now() + 30 * 86400000)
      throw new HttpError(422, "INVALID_EXPIRY", "Escolha uma validade futura de até 30 dias");
    const password = randomBytes(18).toString("base64url"),
      hash = await hashPassword(password),
      code = randomBytes(4).toString("hex").toUpperCase();
    const result = await transaction(
      pool,
      async (c) => {
        const p = (
          await c.query(
            "SELECT * FROM app.checkpoints WHERE organization_id=$1 AND id=$2 AND active FOR SHARE",
            [a.organization_id, id],
          )
        ).rows[0];
        if (!p) throw new HttpError(404, "NOT_FOUND", "Checkpoint não encontrado ou inativo");
        const event = await eventLock(c, a.organization_id, p.event_id);
        if (["finalized", "archived"].includes(event.state))
          throw new HttpError(409, "EVENT_FINALIZED", "Reabra o evento antes de emitir acesso");
        const r = (
          await c.query(
            `INSERT INTO app.checkpoint_credentials(organization_id,event_id,checkpoint_id,code,password_hash,label,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,code,label,device_id,expires_at,revoked_at`,
            [a.organization_id, p.event_id, id, code, hash, input.label, expiry],
          )
        ).rows[0];
        await audit(
          c,
          a.organization_id,
          a.user_id,
          "checkpoint.access_created",
          r.id,
          { event_id: p.event_id, checkpoint_id: id, label: input.label },
          req.id,
        );
        return r;
      },
      a.organization_id,
    );
    reply.code(201);
    return { ...result, password };
  });
  app.get("/api/v1/checkpoints/:id/access", async (req) => {
    const a = await auth.authenticate(req),
      id = uuid.parse((req.params as { id: string }).id);
    return {
      items: (
        await pool.query(
          `SELECT id,code,label,device_id,expires_at,revoked_at FROM app.checkpoint_credentials
   WHERE organization_id=$1 AND checkpoint_id=$2 ORDER BY created_at DESC`,
          [a.organization_id, id],
        )
      ).rows,
    };
  });
  app.post("/api/v1/access/:id/revoke", async (req) => {
    const a = await auth.authenticate(req),
      id = uuid.parse((req.params as { id: string }).id);
    return transaction(
      pool,
      async (c) => {
        const r = (
          await c.query(
            "UPDATE app.checkpoint_credentials SET revoked_at=COALESCE(revoked_at,now()) WHERE organization_id=$1 AND id=$2 RETURNING event_id,checkpoint_id",
            [a.organization_id, id],
          )
        ).rows[0];
        if (!r) throw new HttpError(404, "NOT_FOUND", "Acesso não encontrado");
        await audit(c, a.organization_id, a.user_id, "checkpoint.access_revoked", id, r, req.id);
        return { revoked: true };
      },
      a.organization_id,
    );
  });
  app.post(
    "/api/v1/field/login",
    { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const input = z
        .object({
          code: z
            .string()
            .trim()
            .toUpperCase()
            .regex(/^[A-F0-9]{8}$/),
          password: z.string().min(1).max(128),
        })
        .strict()
        .parse(req.body);
      const limited = (
        await pool.query(
          `INSERT INTO app.auth_limits(key,attempts,window_start) VALUES($1,1,now())
   ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN app.auth_limits.window_start<now()-interval '15 minutes' THEN 1 ELSE app.auth_limits.attempts+1 END,
   window_start=CASE WHEN app.auth_limits.window_start<now()-interval '15 minutes' THEN now() ELSE app.auth_limits.window_start END RETURNING attempts`,
          [digest("field:" + input.code)],
        )
      ).rows[0];
      if (limited.attempts > 10)
        throw new HttpError(429, "RATE_LIMITED", "Muitas tentativas. Aguarde 15 minutos");
      const credential = (
        await pool.query("SELECT * FROM app.checkpoint_credentials WHERE code=$1", [input.code])
      ).rows[0];
      if (!(await verifyPassword(input.password, credential?.password_hash ?? null)))
        throw new HttpError(401, "INVALID_CREDENTIAL", "Código ou senha inválidos");
      const raw = token();
      await transaction(
        pool,
        async (c) => {
          const cr = (
            await c.query(
              `SELECT cr.* FROM app.checkpoint_credentials cr
    JOIN app.checkpoints p ON p.id=cr.checkpoint_id AND p.organization_id=cr.organization_id
    JOIN app.organizations o ON o.id=cr.organization_id
    WHERE cr.id=$1 AND cr.revoked_at IS NULL AND cr.expires_at>clock_timestamp() AND p.active AND o.active FOR SHARE OF cr,p`,
              [credential.id],
            )
          ).rows[0];
          if (!cr) throw new HttpError(401, "INVALID_CREDENTIAL", "Código ou senha inválidos");
          const s = (
            await c.query(
              `INSERT INTO app.checkpoint_sessions(token_hash,organization_id,event_id,checkpoint_id,credential_id,expires_at)
    VALUES($1,$2,$3,$4,$5,LEAST($6,now()+interval '12 hours')) RETURNING id`,
              [
                digest(raw),
                cr.organization_id,
                cr.event_id,
                cr.checkpoint_id,
                cr.id,
                cr.expires_at,
              ],
            )
          ).rows[0];
          await audit(
            c,
            cr.organization_id,
            null,
            "checkpoint.login",
            s.id,
            { event_id: cr.event_id, checkpoint_id: cr.checkpoint_id, device_id: cr.device_id },
            req.id,
          );
          await c.query("DELETE FROM app.auth_limits WHERE key=$1", [
            digest("field:" + input.code),
          ]);
        },
        credential.organization_id,
      );
      reply.setCookie(cookieName, raw, {
        path: "/api/v1/field",
        httpOnly: true,
        sameSite: "strict",
        secure: options.secure,
        maxAge: 12 * 3600,
      });
      return { csrf_token: csrfFor(raw) };
    },
  );
  app.get("/api/v1/field/me", async (req) =>
    context(req, async (c, s) => ({
      previous_session_ids: (
        await c.query(
          "SELECT id FROM app.checkpoint_sessions WHERE organization_id=$1 AND credential_id=$2",
          [s.organization_id, s.credential_id],
        )
      ).rows.map((row) => row.id as string),
      session_id: s.id,
      credential_id: s.credential_id,
      organization_id: s.organization_id,
      event_id: s.event_id,
      checkpoint_id: s.checkpoint_id,
      device_id: s.device_id,
      event_name: s.event_name,
      checkpoint_name: s.checkpoint_name,
      label: s.label,
      state: s.state,
      expires_at: s.expires_at,
      csrf_token: csrfFor(req.cookies[cookieName] ?? ""),
    })),
  );
  app.post("/api/v1/field/logout", async (req, reply) => {
    // authenticate in a completed read transaction, then revoke; avoids upgrading concurrent shared session locks.
    const id = await context(req, async (_c, s) => s.id);
    await pool.query("UPDATE app.checkpoint_sessions SET revoked_at=now() WHERE id=$1", [id]);
    reply.clearCookie(cookieName, {
      path: "/api/v1/field",
      secure: options.secure,
      sameSite: "strict",
    });
    return { ok: true };
  });
  app.post(
    "/api/v1/field/observations",
    {
      config: { rateLimit: { max: 600, timeWindow: "1 minute" } },
      schema: { body: manualBody, response: { 200: manualReply, 201: manualReply } },
    },
    async (req, reply) => {
      const input = z
        .object({
          client_event_id: uuid,
          bib: z.string().regex(/^[0-9]{1,8}$/),
          raw_captured_at: z.string().datetime({ offset: true }),
        })
        .strict()
        .parse(req.body);
      const result = await context(req, async (c, s) => {
        // One event lock serializes UUID and human-duplicate decisions across devices.
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          s.organization_id + ":" + s.event_id,
        ]);
        const canonical = {
          ...input,
          raw_captured_at: new Date(input.raw_captured_at).toISOString(),
          checkpoint_id: s.checkpoint_id,
          device_id: s.device_id,
          session_id: s.id,
          source: "manual",
        };
        const old = (
          await c.query(
            "SELECT * FROM app.observations WHERE organization_id=$1 AND event_id=$2 AND client_event_id=$3",
            [s.organization_id, s.event_id, input.client_event_id],
          )
        ).rows[0];
        if (old) {
          const identical = (
            await c.query("SELECT $1::jsonb=$2::jsonb AS equal", [
              old.canonical_payload,
              JSON.stringify(canonical),
            ])
          ).rows[0].equal;
          if (!identical)
            throw new HttpError(
              409,
              "IDEMPOTENCY_CONFLICT",
              "UUID já utilizado com outro conteúdo",
            );
          return {
            ...(await c.query(observationSelect + " WHERE o.id=$1", [old.id])).rows[0],
            replayed: true,
          };
        }
        if (s.state !== "running")
          throw new HttpError(409, "EVENT_NOT_RUNNING", "A corrida não está em andamento");
        const window = (
          await c.query(
            "SELECT opened_at FROM app.capture_windows WHERE organization_id=$1 AND event_id=$2 AND closed_at IS NULL",
            [s.organization_id, s.event_id],
          )
        ).rows[0];
        if (!window)
          throw new HttpError(409, "NO_CAPTURE_WINDOW", "Janela de captura indisponível");
        // Raw device time is evidence, never an official/estimated race time.
        const row = (
          await c.query(
            `INSERT INTO app.observations(organization_id,event_id,checkpoint_id,session_id,device_id,client_event_id,bib,raw_captured_at,canonical_payload)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
            [
              s.organization_id,
              s.event_id,
              s.checkpoint_id,
              s.id,
              s.device_id,
              input.client_event_id,
              input.bib,
              canonical.raw_captured_at,
              JSON.stringify(canonical),
            ],
          )
        ).rows[0];
        const duplicates = await c.query(
          `SELECT id FROM app.observations WHERE organization_id=$1 AND event_id=$2 AND checkpoint_id=$3 AND bib=$4
    AND raw_captured_at BETWEEN $5::timestamptz-interval '5 seconds' AND $5::timestamptz+interval '5 seconds' AND id<>$6`,
          [
            s.organization_id,
            s.event_id,
            s.checkpoint_id,
            input.bib,
            canonical.raw_captured_at,
            row.id,
          ],
        );
        if (duplicates.rowCount) {
          for (const item of [row, ...duplicates.rows])
            await c.query(
              "INSERT INTO app.observation_flags(organization_id,observation_id,reason) VALUES($1,$2,'possible_duplicate') ON CONFLICT DO NOTHING",
              [s.organization_id, item.id],
            );
        }
        await audit(
          c,
          s.organization_id,
          null,
          "observation.created",
          row.id,
          {
            event_id: s.event_id,
            checkpoint_id: s.checkpoint_id,
            session_id: s.id,
            device_id: s.device_id,
            possible_duplicate: Boolean(duplicates.rowCount),
          },
          req.id,
        );
        return {
          ...(await c.query(observationSelect + " WHERE o.id=$1", [row.id])).rows[0],
          replayed: false,
        };
      });
      reply.code(result.replayed ? 200 : 201);
      return result;
    },
  );
  app.get("/api/v1/field/observations", async (req) =>
    context(req, async (c, s) => ({
      items: (
        await c.query(
          observationSelect +
            " WHERE o.organization_id=$1 AND o.session_id=$2 ORDER BY o.received_at DESC,o.id LIMIT 100",
          [s.organization_id, s.id],
        )
      ).rows,
    })),
  );
}
