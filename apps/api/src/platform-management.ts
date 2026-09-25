import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { HttpError, transaction } from "./db.js";
import type { PlatformOptions } from "./platform.js";
import { platformCipher } from "./platform-crypto.js";
import { digest, hashPassword, token, verifyPassword } from "./security.js";
export type PlatformGuard = (
  r: FastifyRequest,
  c: pg.PoolClient,
  write?: boolean,
) => Promise<{ u: { user_id: string }; reauthenticated_until?: Date }>;
export const uuid = z.string().uuid(),
  email = z.string().trim().toLowerCase().email().max(254),
  version = z.number().int().nonnegative(),
  reason = z.string().trim().min(10).max(1000);
export const failure = (code: string, message: string, status = 409) =>
  new HttpError(status, code, message);
export const orgColumns =
  "id,name,status,version,contact_email,contact_phone,notes,responsible_user_id,created_at";
export async function lockOrganization(c: pg.PoolClient, id: string) {
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,7303))", [id]);
}
export async function setOrganization(c: pg.PoolClient, id: string) {
  await c.query("SELECT set_config('app.organization_id',$1,true)", [id]);
}
export async function managementAudit(
  c: pg.PoolClient,
  actor: string | null,
  org: string | null,
  action: string,
  resource: string,
  requestId: string,
  details: unknown = {},
  why?: string,
) {
  await c.query(
    "INSERT INTO app.platform_audit(actor_id,organization_id,action,resource_id,request_id,details,reason) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [actor, org, action, resource, requestId, JSON.stringify(details), why ?? null],
  );
}
export function managementService(o: PlatformOptions, guard: PlatformGuard) {
  const cipher = platformCipher(o.key);
  async function write<T>(
    req: FastifyRequest,
    operation: string,
    body: unknown,
    org: string | ((c: pg.PoolClient) => Promise<string[]>) | undefined,
    fn: (c: pg.PoolClient, actor: string) => Promise<T>,
  ): Promise<T> {
    const key = uuid.parse(req.headers["idempotency-key"]);
    let authorizedActor: string | undefined;
    return transaction(o.pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(730207)");
      const organizations = typeof org === "function" ? await org(c) : org ? [org] : [];
      for (const id of [...new Set(organizations)].sort()) await lockOrganization(c, id);
      const s = await guard(req, c, true);
      authorizedActor = s.u.user_id;
      if (!s.reauthenticated_until || new Date(s.reauthenticated_until).getTime() < Date.now())
        throw failure("REAUTH_REQUIRED", "Confirme sua identidade antes de continuar.", 403);
      const hash = digest(JSON.stringify(body)),
        old = (
          await c.query(
            "SELECT * FROM app.platform_commands WHERE actor_id=$1 AND command_id=$2 AND created_at>now()-interval '24 hours'",
            [s.u.user_id, key],
          )
        ).rows[0];
      if (old) {
        if (old.operation !== operation || old.body_hash !== hash)
          throw failure("IDEMPOTENCY_CONFLICT", "Chave reutilizada com operação diferente.");
        return old.response;
      }
      await c.query("DELETE FROM app.platform_commands WHERE actor_id=$1 AND command_id=$2", [
        s.u.user_id,
        key,
      ]);
      const result = await fn(c, s.u.user_id);
      await c.query(
        "INSERT INTO app.platform_commands(actor_id,command_id,operation,body_hash,response) VALUES($1,$2,$3,$4,$5)",
        [s.u.user_id, key, operation, hash, JSON.stringify(result)],
      );
      return result;
    }).catch(async (error: unknown) => {
      if (authorizedActor) {
        try {
          await transaction(o.pool, (c) =>
            managementAudit(
              c,
              authorizedActor!,
              null,
              "management.denied",
              authorizedActor!,
              req.id,
              { operation, code: error instanceof HttpError ? error.code : "INTERNAL_ERROR" },
            ),
          );
        } catch {
          req.log.error(
            { action: "platform.audit_failed", request_id: req.id },
            "Falha ao registrar tentativa administrativa",
          );
        }
      }
      throw error;
    });
  }
  async function organization(c: pg.PoolClient, id: string, v?: number) {
    const row = (
      await c.query("SELECT " + orgColumns + " FROM app.organizations WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!row) throw failure("NOT_FOUND", "Organização não encontrada.", 404);
    if (v !== undefined && v !== row.version)
      throw failure("VERSION_CONFLICT", "Cadastro alterado. Atualize os dados.");
    return row;
  }
  async function invitation(c: pg.PoolClient, org: string, recipient: string, initial: boolean) {
    await c.query(
      "UPDATE app.organization_invitations SET status='cancelled',version=version+1 WHERE organization_id=$1 AND email=$2 AND status='pending' AND expires_at<=now()",
      [org, recipient],
    );
    if (
      (
        await c.query(
          "SELECT 1 FROM app.organization_invitations WHERE organization_id=$1 AND email=$2 AND status='pending'",
          [org, recipient],
        )
      ).rowCount
    )
      throw failure("INVITATION_PENDING", "Convite pendente já existe. Utilize reenviar.");
    const raw = token(),
      r = (
        await c.query(
          "INSERT INTO app.organization_invitations(organization_id,email,token_hash,initial_responsible) VALUES($1,$2,$3,$4) RETURNING id,email,status,version,expires_at",
          [org, recipient, digest(raw), initial],
        )
      ).rows[0];
    await queue(c, r.id, raw);
    return { ...r, delivery_status: "pending" };
  }
  async function queue(c: pg.PoolClient, id: string, raw: string) {
    await c.query(
      "INSERT INTO app.invitation_outbox(invitation_id,token_hash,token_cipher) VALUES($1,$2,$3)",
      [id, digest(raw), cipher.seal(raw, "invitation:" + id)],
    );
  }
  return { write, organization, invitation, queue };
}
export function registerOrganizations(
  app: FastifyInstance,
  o: PlatformOptions,
  guard: PlatformGuard,
) {
  const service = managementService(o, guard),
    base = "/api/v1/platform";
  const getId = (req: FastifyRequest) => z.object({ id: uuid }).parse(req.params).id;
  const page = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: uuid.optional(),
  });
  app.get(base + "/organizations", async (req) => {
    const q = page
      .extend({
        q: z.string().max(120).default(""),
        status: z.enum(["pending", "active", "suspended", "closed"]).optional(),
      })
      .strict()
      .parse(req.query);
    return transaction(o.pool, async (c) => {
      await guard(req, c);
      const rows = (
        await c.query(
          "SELECT " +
            orgColumns
              .split(",")
              .map((k) => "o." + k)
              .join(",") +
            ",u.email responsible_email FROM app.organizations o LEFT JOIN app.users u ON u.id=o.responsible_user_id WHERE o.name ILIKE $1 AND ($2::text IS NULL OR o.status=$2) AND ($3::uuid IS NULL OR o.id>$3) ORDER BY o.id LIMIT $4",
          ["%" + q.q + "%", q.status ?? null, q.cursor ?? null, q.limit + 1],
        )
      ).rows;
      return {
        items: rows.slice(0, q.limit),
        next_cursor: rows.length > q.limit ? rows[q.limit - 1].id : null,
      };
    });
  });
  const fields = z.object({
    name: z.string().trim().min(2).max(120),
    contact_email: email,
    contact_phone: z.string().trim().max(30).default(""),
    notes: z.string().max(2000).default(""),
  });
  app.post(base + "/organizations", async (req, reply) => {
    const input = fields.extend({ responsible_email: email }).strict().parse(req.body);
    const id = randomUUID();
    const result = await service.write(req, "organization.create", input, id, async (c, actor) => {
      const organization = (
        await c.query(
          "INSERT INTO app.organizations(id,name,active,status,contact_email,contact_phone,notes) VALUES($1,$2,false,'pending',$3,$4,$5) RETURNING " +
            orgColumns,
          [id, input.name, input.contact_email, input.contact_phone, input.notes],
        )
      ).rows[0];
      const invitation = await service.invitation(c, id, input.responsible_email, true);
      await managementAudit(c, actor, id, "organization.created", id, req.id, { name: input.name });
      return { organization, invitation };
    });
    reply.code(201);
    return result;
  });
  app.get(base + "/organizations/:id", async (req) =>
    transaction(o.pool, async (c) => {
      await guard(req, c);
      const id = getId(req),
        row = (await c.query("SELECT " + orgColumns + " FROM app.organizations WHERE id=$1", [id]))
          .rows[0];
      if (!row) throw failure("NOT_FOUND", "Organização não encontrada.", 404);
      await setOrganization(c, id);
      const usage = (
        await c.query(
          "SELECT (SELECT count(*)::int FROM app.events WHERE organization_id=$1) events,(SELECT count(*)::int FROM app.events WHERE organization_id=$1 AND state='running') running_events,(SELECT count(*)::int FROM app.checkpoints WHERE organization_id=$1) checkpoints,(SELECT count(*)::int FROM app.observations WHERE organization_id=$1) observations",
          [id],
        )
      ).rows[0];
      return { organization: row, usage };
    }),
  );
  app.patch(base + "/organizations/:id", async (req) => {
    const id = getId(req),
      input = fields.extend({ version }).strict().parse(req.body);
    return service.write(req, "organization.edit:" + id, input, id, async (c, actor) => {
      const before = await service.organization(c, id, input.version);
      if (before.status === "closed")
        throw failure("ORGANIZATION_CLOSED", "Organização encerrada.");
      const row = (
        await c.query(
          "UPDATE app.organizations SET name=$2,contact_email=$3,contact_phone=$4,notes=$5,version=version+1 WHERE id=$1 RETURNING " +
            orgColumns,
          [id, input.name, input.contact_email, input.contact_phone, input.notes],
        )
      ).rows[0];
      await managementAudit(c, actor, id, "organization.updated", id, req.id, {
        before: {
          name: before.name,
          contact_email: before.contact_email,
          contact_phone: before.contact_phone,
        },
        after: {
          name: row.name,
          contact_email: row.contact_email,
          contact_phone: row.contact_phone,
        },
      });
      return row;
    });
  });
  app.post(base + "/organizations/:id/transitions", async (req) => {
    const id = getId(req),
      input = z
        .object({
          version,
          to: z.enum(["active", "suspended", "closed"]),
          reason,
          acknowledge_running_events: z.boolean(),
        })
        .strict()
        .parse(req.body);
    return service.write(req, "organization.transition:" + id, input, id, async (c, actor) => {
      const old = await service.organization(c, id, input.version);
      const allowed: Record<string, string[]> = {
        pending: ["closed"],
        active: ["suspended", "closed"],
        suspended: ["active", "closed"],
        closed: [],
      };
      if (!allowed[old.status]?.includes(input.to))
        throw failure("INVALID_TRANSITION", "Transição não permitida.");
      await setOrganization(c, id);
      const running = (
        await c.query(
          "SELECT count(*)::int n FROM app.events WHERE organization_id=$1 AND state='running'",
          [id],
        )
      ).rows[0].n;
      if (running && !input.acknowledge_running_events)
        throw failure(
          "RUNNING_EVENTS_CONFIRMATION_REQUIRED",
          "Confirme o impacto nas provas em andamento.",
        );
      if (
        input.to === "active" &&
        !(
          await c.query(
            "SELECT 1 FROM app.memberships m JOIN app.users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.user_id=$2 AND m.active AND u.active",
            [id, old.responsible_user_id],
          )
        ).rowCount
      )
        throw failure("RESPONSIBLE_REQUIRED", "Selecione um responsável ativo antes de reativar.");
      let revoked = 0;
      if (input.to !== "active") {
        for (const table of ["sessions", "checkpoint_credentials", "checkpoint_sessions"]) {
          revoked +=
            (
              await c.query(
                "UPDATE app." +
                  table +
                  " SET revoked_at=now() WHERE organization_id=$1 AND revoked_at IS NULL",
                [id],
              )
            ).rowCount ?? 0;
        }
        await c.query(
          "UPDATE app.organization_invitations SET status='cancelled',version=version+1 WHERE organization_id=$1 AND status='pending'",
          [id],
        );
        await c.query(
          "UPDATE app.invitation_outbox SET delivery_status='cancelled',token_cipher=NULL WHERE invitation_id IN (SELECT id FROM app.organization_invitations WHERE organization_id=$1) AND delivery_status IN ('pending','sending','failed')",
          [id],
        );
      }
      const organization = (
        await c.query(
          "UPDATE app.organizations SET status=$2,active=($2='active'),version=version+1 WHERE id=$1 RETURNING " +
            orgColumns,
          [id, input.to],
        )
      ).rows[0];
      await managementAudit(
        c,
        actor,
        id,
        "organization." + input.to,
        id,
        req.id,
        { before: old.status, after: input.to, revoked },
        input.reason,
      );
      return { organization, revoked_count: revoked };
    });
  });
  app.get(base + "/organizations/:id/members", async (req) =>
    transaction(o.pool, async (c) => {
      await guard(req, c);
      const input = page.strict().parse(req.query),
        id = getId(req);
      const rows = (
        await c.query(
          "SELECT u.id,u.email,u.active user_active,m.active,m.version,m.role FROM app.memberships m JOIN app.users u ON u.id=m.user_id WHERE m.organization_id=$1 AND ($2::uuid IS NULL OR u.id>$2) ORDER BY u.id LIMIT $3",
          [id, input.cursor ?? null, input.limit + 1],
        )
      ).rows;
      return {
        items: rows.slice(0, input.limit),
        next_cursor: rows.length > input.limit ? rows[input.limit - 1].id : null,
      };
    }),
  );
  app.post(base + "/organizations/:id/responsible", async (req) => {
    const id = getId(req),
      input = z.object({ version, user_id: uuid, reason }).strict().parse(req.body);
    return service.write(req, "responsible:" + id, input, id, async (c, actor) => {
      const old = await service.organization(c, id, input.version);
      if (old.status === "closed") throw failure("ORGANIZATION_CLOSED", "Organização encerrada.");
      if (
        !(
          await c.query(
            "SELECT 1 FROM app.memberships m JOIN app.users u ON u.id=m.user_id WHERE organization_id=$1 AND user_id=$2 AND m.active AND u.active",
            [id, input.user_id],
          )
        ).rowCount
      )
        throw failure("MEMBER_REQUIRED", "Responsável precisa de vínculo ativo.");
      const row = (
        await c.query(
          "UPDATE app.organizations SET responsible_user_id=$2,version=version+1 WHERE id=$1 RETURNING " +
            orgColumns,
          [id, input.user_id],
        )
      ).rows[0];
      await managementAudit(
        c,
        actor,
        id,
        "responsible.changed",
        input.user_id,
        req.id,
        { previous: old.responsible_user_id },
        input.reason,
      );
      return row;
    });
  });
  app.post(base + "/invitations", async (req, reply) => {
    const input = z
      .object({ kind: z.literal("organization_admin"), email, organization_id: uuid })
      .strict()
      .parse(req.body);
    const r = await service.write(
      req,
      "invitation.create",
      input,
      input.organization_id,
      async (c, actor) => {
        const org = await service.organization(c, input.organization_id);
        if (org.status === "closed") throw failure("ORGANIZATION_CLOSED", "Organização encerrada.");
        const result = await service.invitation(c, org.id, input.email, org.status === "pending");
        await managementAudit(c, actor, org.id, "invitation.created", result.id, req.id);
        return result;
      },
    );
    reply.code(201);
    return r;
  });
  app.get(base + "/invitations", async (req) =>
    transaction(o.pool, async (c) => {
      await guard(req, c);
      const q = page.extend({ organization_id: uuid }).strict().parse(req.query);
      const rows = (
        await c.query(
          "SELECT i.id,i.email,i.version,i.expires_at,CASE WHEN i.status='pending' AND i.expires_at<=now() THEN 'expired' ELSE i.status END status,coalesce((SELECT delivery_status FROM app.invitation_outbox b WHERE b.invitation_id=i.id ORDER BY b.created_at DESC,b.id DESC LIMIT 1),'pending') delivery_status FROM app.organization_invitations i WHERE organization_id=$1 AND ($2::uuid IS NULL OR i.id>$2) ORDER BY i.id LIMIT $3",
          [q.organization_id, q.cursor ?? null, q.limit + 1],
        )
      ).rows;
      return {
        items: rows.slice(0, q.limit),
        next_cursor: rows.length > q.limit ? rows[q.limit - 1].id : null,
      };
    }),
  );
  for (const action of ["resend", "cancel"])
    app.post(base + "/invitations/:id/" + action, async (req) => {
      const id = getId(req),
        input = z.object({ version, reason: reason.optional() }).strict().parse(req.body);
      if (action === "cancel" && !input.reason)
        throw failure("REASON_REQUIRED", "Informe o motivo.", 422);
      const org = (
        await o.pool.query("SELECT organization_id FROM app.organization_invitations WHERE id=$1", [
          id,
        ])
      ).rows[0]?.organization_id;
      return service.write(req, "invitation." + action + ":" + id, input, org, async (c, actor) => {
        if (!org) throw failure("NOT_FOUND", "Convite não encontrado.", 404);
        const organization = await service.organization(c, org);
        if (organization.status === "closed")
          throw failure("ORGANIZATION_CLOSED", "Organização encerrada.");
        const i = (
          await c.query("SELECT * FROM app.organization_invitations WHERE id=$1 FOR UPDATE", [id])
        ).rows[0];
        if (i.status !== "pending" || i.version !== input.version)
          throw failure("INVITATION_CONFLICT", "Convite alterado ou utilizado.");
        await c.query(
          "UPDATE app.invitation_outbox SET delivery_status='cancelled',token_cipher=NULL WHERE invitation_id=$1 AND delivery_status IN ('pending','sending','failed')",
          [id],
        );
        const raw = token();
        const r =
          action === "resend"
            ? await c.query(
                "UPDATE app.organization_invitations SET token_hash=$2,expires_at=now()+interval '24 hours',version=version+1 WHERE id=$1 RETURNING id,version,status",
                [id, digest(raw)],
              )
            : await c.query(
                "UPDATE app.organization_invitations SET status='cancelled',version=version+1 WHERE id=$1 RETURNING id,version,status",
                [id],
              );
        if (action === "resend") await service.queue(c, id, raw);
        await managementAudit(c, actor, org, "invitation." + action, id, req.id, {}, input.reason);
        return r.rows[0];
      });
    });
  async function limit(req: FastifyRequest) {
    const r = await o.pool.query(
      "INSERT INTO app.auth_limits(key,attempts,window_start) VALUES($1,1,now()) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN app.auth_limits.window_start<now()-interval '15 minutes' THEN 1 ELSE app.auth_limits.attempts+1 END,window_start=CASE WHEN app.auth_limits.window_start<now()-interval '15 minutes' THEN now() ELSE app.auth_limits.window_start END RETURNING attempts",
      [digest("invite:" + req.ip)],
    );
    if (r.rows[0].attempts > 20)
      throw failure("RATE_LIMITED", "Muitas tentativas. Aguarde 15 minutos.", 429);
  }
  const publicToken = z.string().regex(/^[a-f0-9]{64}$/);
  app.post(base + "/invitations/inspect", async (req) => {
    await limit(req);
    const input = z.object({ token: publicToken }).strict().parse(req.body);
    const row = (
      await o.pool.query(
        "SELECT o.name organization_name,i.expires_at,EXISTS(SELECT 1 FROM app.users u WHERE u.email=i.email) existing_identity FROM app.organization_invitations i JOIN app.organizations o ON o.id=i.organization_id WHERE i.token_hash=$1 AND i.status='pending' AND i.expires_at>now() AND o.status!='closed'",
        [digest(input.token)],
      )
    ).rows[0];
    if (!row) throw failure("INVITATION_INVALID", "Convite inválido, utilizado ou expirado.", 410);
    return { kind: "organization_admin", ...row };
  });
  app.post(base + "/invitations/accept", async (req) => {
    await limit(req);
    const input = z
      .object({ token: publicToken, password: z.string().min(1).max(128) })
      .strict()
      .parse(req.body);
    const locator = (
      await o.pool.query(
        "SELECT organization_id FROM app.organization_invitations WHERE token_hash=$1",
        [digest(input.token)],
      )
    ).rows[0];
    if (!locator)
      throw failure("INVITATION_INVALID", "Convite inválido, utilizado ou expirado.", 410);
    return transaction(o.pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(730207)");
      await lockOrganization(c, locator.organization_id);
      const org = await service.organization(c, locator.organization_id),
        i = (
          await c.query(
            "SELECT * FROM app.organization_invitations WHERE token_hash=$1 AND status='pending' AND expires_at>now() FOR UPDATE",
            [digest(input.token)],
          )
        ).rows[0];
      if (!i || org.status === "closed")
        throw failure("INVITATION_INVALID", "Convite inválido, utilizado ou expirado.", 410);
      let u = (
        await c.query("SELECT id,active,password_hash FROM app.users WHERE email=$1 FOR UPDATE", [
          i.email,
        ])
      ).rows[0];
      if (u) {
        if (!u.active || !(await verifyPassword(input.password, u.password_hash)))
          throw failure(
            "INVALID_CREDENTIALS",
            "Use a senha atual da sua conta ou recupere seu acesso.",
            401,
          );
      } else {
        if (input.password.length < 12)
          throw failure("PASSWORD_TOO_SHORT", "Use pelo menos 12 caracteres.", 422);
        u = (
          await c.query("INSERT INTO app.users(email,password_hash) VALUES($1,$2) RETURNING id", [
            i.email,
            await hashPassword(input.password),
          ])
        ).rows[0];
      }
      const member = (
        await c.query(
          "SELECT active FROM app.memberships WHERE organization_id=$1 AND user_id=$2",
          [org.id, u.id],
        )
      ).rows[0];
      if (member && !member.active)
        throw failure("MEMBERSHIP_BLOCKED", "Vínculo bloqueado. Contate o administrador.");
      await c.query(
        "INSERT INTO app.memberships(organization_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [org.id, u.id],
      );
      await c.query(
        "UPDATE app.organization_invitations SET status='accepted',accepted_by=$2,version=version+1 WHERE id=$1",
        [i.id, u.id],
      );
      await c.query(
        "UPDATE app.invitation_outbox SET token_cipher=NULL,delivery_status=CASE WHEN delivery_status='sent' THEN 'sent' ELSE 'cancelled' END WHERE invitation_id=$1",
        [i.id],
      );
      if (org.status === "pending" && i.initial_responsible)
        await c.query(
          "UPDATE app.organizations SET active=true,status='active',responsible_user_id=$2,version=version+1 WHERE id=$1",
          [org.id, u.id],
        );
      await managementAudit(c, u.id, org.id, "invitation.accepted", i.id, req.id);
      return {
        next: "organization_login",
        organization_status: org.status === "pending" ? "active" : org.status,
      };
    });
  });
}
export async function deliverInvitations(o: PlatformOptions) {
  const cipher = platformCipher(o.key);
  const row = await transaction(o.pool, async (c) => {
    await c.query(
      "UPDATE app.invitation_outbox b SET delivery_status='cancelled',token_cipher=NULL WHERE delivery_status IN ('pending','sending','failed') AND NOT EXISTS(SELECT 1 FROM app.organization_invitations i WHERE i.id=b.invitation_id AND i.token_hash=b.token_hash AND i.status='pending' AND i.expires_at>now())",
    );
    await c.query(
      "UPDATE app.invitation_outbox SET delivery_status='failed',token_cipher=NULL WHERE delivery_status='sending' AND lease_until<now() AND attempts>=5",
    );
    const r = (
      await c.query(
        "SELECT b.*,i.email,i.kind FROM app.invitation_outbox b JOIN app.organization_invitations i ON i.id=b.invitation_id WHERE b.token_cipher IS NOT NULL AND b.attempts<5 AND ((b.delivery_status='pending' AND b.next_attempt_at<=now()) OR (b.delivery_status='sending' AND b.lease_until<now())) ORDER BY b.created_at FOR UPDATE OF b SKIP LOCKED LIMIT 1",
      )
    ).rows[0];
    if (!r) return null;
    await c.query(
      "UPDATE app.invitation_outbox SET delivery_status='sending',attempts=attempts+1,lease_until=now()+interval '1 minute' WHERE id=$1",
      [r.id],
    );
    return r;
  });
  if (!row) return false;
  try {
    await o.sendMail(
      row.email,
      cipher.open(row.token_cipher, "invitation:" + row.invitation_id),
      row.kind === "platform_admin" ? "super-invitation" : "invitation",
    );
    await o.pool.query(
      "UPDATE app.invitation_outbox SET delivery_status='sent',token_cipher=NULL,lease_until=NULL WHERE id=$1 AND delivery_status='sending'",
      [row.id],
    );
  } catch {
    await o.pool.query(
      "UPDATE app.invitation_outbox SET delivery_status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,token_cipher=CASE WHEN attempts>=5 THEN NULL ELSE token_cipher END,lease_until=NULL,next_attempt_at=now()+($2::int*interval '30 seconds') WHERE id=$1 AND delivery_status='sending'",
      [row.id, 2 ** row.attempts],
    );
  }
  return true;
}
