import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { transaction } from "./db.js";
import type { PlatformOptions } from "./platform.js";
import { platformCipher } from "./platform-crypto.js";
import {
  email,
  failure,
  managementAudit,
  managementService,
  type PlatformGuard,
  reason,
  uuid,
  version,
} from "./platform-management.js";
import { digest, hashPassword, token, verifyPassword } from "./security.js";
export function registerAccounts(app: FastifyInstance, o: PlatformOptions, guard: PlatformGuard) {
  const base = "/api/v1/platform",
    service = managementService(o, guard),
    cipher = platformCipher(o.key);
  const target = (r: FastifyRequest) => z.object({ id: uuid }).parse(r.params).id;
  async function user(c: pg.PoolClient, id: string, v?: number) {
    const u = (
      await c.query(
        "SELECT id,email,active,version,auth_version FROM app.users WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!u) throw failure("NOT_FOUND", "Conta não encontrada.", 404);
    if (v !== undefined && v !== u.version)
      throw failure("VERSION_CONFLICT", "Conta alterada. Atualize antes de continuar.");
    return u;
  }
  async function preservePlatform(c: pg.PoolClient, id: string) {
    const current = (
      await c.query("SELECT 1 FROM app.platform_privileges WHERE user_id=$1 AND state='active'", [
        id,
      ])
    ).rowCount;
    if (
      current &&
      !(
        await c.query(
          "SELECT 1 FROM app.platform_privileges p JOIN app.users u ON u.id=p.user_id JOIN app.platform_mfa m ON m.user_id=u.id WHERE p.state='active' AND u.active AND NOT p.recovery_pending AND p.user_id!=$1 LIMIT 1",
          [id],
        )
      ).rowCount
    )
      throw failure(
        "LAST_SUPER_ADMIN",
        "A plataforma precisa manter ao menos um super admin ativo com MFA.",
      );
  }
  async function revoke(c: pg.PoolClient, id: string, scope = "all", org?: string) {
    let count = 0;
    if (scope !== "platform")
      count +=
        (
          await c.query(
            "UPDATE app.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR organization_id=$2)",
            [id, org ?? null],
          )
        ).rowCount ?? 0;
    if (scope !== "organization") {
      count +=
        (
          await c.query(
            "UPDATE app.platform_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
            [id],
          )
        ).rowCount ?? 0;
      await c.query(
        "UPDATE app.platform_challenges SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
        [id],
      );
    }
    return count;
  }
  async function message(
    c: pg.PoolClient,
    u: string,
    recipient: string,
    kind: string,
    raw: string,
  ) {
    const id = randomUUID();
    await c.query(
      "INSERT INTO app.account_outbox(id,user_id,recipient,kind,token_cipher,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '30 minutes')",
      [id, u, recipient, kind, cipher.seal(raw, "account:" + id), raw ? digest(raw) : null],
    );
  }
  app.get(base + "/users", async (req) => {
    const q = z
      .object({
        q: z.string().max(120).default(""),
        active: z.enum(["true", "false"]).optional(),
        platform: z.enum(["true"]).optional(),
        organization_id: uuid.optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
        cursor: uuid.optional(),
      })
      .strict()
      .parse(req.query);
    return transaction(o.pool, async (c) => {
      await guard(req, c);
      const rows = (
        await c.query(
          "SELECT u.id,u.email,u.active,u.version,coalesce(p.state,'none') platform_state FROM app.users u LEFT JOIN app.platform_privileges p ON p.user_id=u.id WHERE u.email ILIKE $1 AND ($2::boolean IS NULL OR u.active=$2) AND ($3::uuid IS NULL OR u.id>$3) AND ($5::text IS NULL OR p.state IN ('active','invited')) AND ($6::uuid IS NULL OR EXISTS(SELECT 1 FROM app.memberships m WHERE m.user_id=u.id AND m.organization_id=$6)) ORDER BY u.id LIMIT $4",
          [
            "%" + q.q + "%",
            q.active ?? null,
            q.cursor ?? null,
            q.limit + 1,
            q.platform ?? null,
            q.organization_id ?? null,
          ],
        )
      ).rows;
      return {
        items: rows.slice(0, q.limit),
        next_cursor: rows.length > q.limit ? rows[q.limit - 1].id : null,
      };
    });
  });
  app.get(base + "/users/:id/memberships", async (req) => {
    const id = target(req),
      q = z
        .object({
          cursor: uuid.optional(),
          limit: z.coerce.number().int().min(1).max(100).default(25),
        })
        .strict()
        .parse(req.query);
    return transaction(o.pool, async (c) => {
      await guard(req, c);
      const rows = (
        await c.query(
          "SELECT m.organization_id,o.name,o.status,m.active,m.version,(o.responsible_user_id=m.user_id) responsible FROM app.memberships m JOIN app.organizations o ON o.id=m.organization_id WHERE m.user_id=$1 AND ($2::uuid IS NULL OR m.organization_id>$2) ORDER BY o.id LIMIT $3",
          [id, q.cursor ?? null, q.limit + 1],
        )
      ).rows;
      return {
        items: rows.slice(0, q.limit),
        next_cursor: rows.length > q.limit ? rows[q.limit - 1].organization_id : null,
      };
    });
  });
  app.get(base + "/users/:id", async (req) =>
    transaction(o.pool, async (c) => {
      await guard(req, c);
      const id = target(req);
      const u = (
        await c.query(
          "SELECT u.id,u.email,u.active,u.version,coalesce(p.state,'none') platform_state,p.version platform_version,p.recovery_pending,EXISTS(SELECT 1 FROM app.platform_mfa m WHERE m.user_id=u.id) mfa_enabled FROM app.users u LEFT JOIN app.platform_privileges p ON p.user_id=u.id WHERE u.id=$1",
          [id],
        )
      ).rows[0];
      if (!u) throw failure("NOT_FOUND", "Conta não encontrada.", 404);
      const memberships = (
        await c.query(
          "SELECT m.organization_id,o.name,o.status,m.active,m.version,(o.responsible_user_id=m.user_id) responsible FROM app.memberships m JOIN app.organizations o ON o.id=m.organization_id WHERE m.user_id=$1 ORDER BY o.id LIMIT 26",
          [id],
        )
      ).rows;
      return {
        user: u,
        memberships: memberships.slice(0, 25),
        memberships_next_cursor: memberships.length > 25 ? memberships[24].organization_id : null,
      };
    }),
  );
  app.post(base + "/users/:id/status", async (req) => {
    const id = target(req),
      input = z
        .object({
          version,
          active: z.boolean(),
          reason,
          responsible_replacements: z
            .array(z.object({ organization_id: uuid, user_id: uuid, version }))
            .max(100)
            .default([]),
        })
        .strict()
        .parse(req.body);
    return service.write(
      req,
      "user.status:" + id,
      input,
      async (c) =>
        (
          await c.query("SELECT organization_id FROM app.memberships WHERE user_id=$1", [id])
        ).rows.map((r) => r.organization_id),
      async (c, actor) => {
        await user(c, id, input.version);
        if (!input.active) {
          await preservePlatform(c, id);
          const organizations = (
            await c.query(
              "SELECT o.id,o.name,o.responsible_user_id,o.version FROM app.organizations o JOIN app.memberships m ON m.organization_id=o.id WHERE m.user_id=$1 AND o.status='active'",
              [id],
            )
          ).rows;
          for (const org of organizations) {
            if (
              !(
                await c.query(
                  "SELECT 1 FROM app.memberships m JOIN app.users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.user_id!=$2 AND m.active AND u.active LIMIT 1",
                  [org.id, id],
                )
              ).rowCount
            )
              throw failure(
                "LAST_ORGANIZATION_ADMIN",
                "A organização " + org.name + " precisa de outro administrador ativo.",
              );
            if (org.responsible_user_id === id) {
              const replacement = input.responsible_replacements.find(
                (r) => r.organization_id === org.id,
              );
              if (!replacement || replacement.version !== org.version || replacement.user_id === id)
                throw failure(
                  "RESPONSIBLE_REPLACEMENT_REQUIRED",
                  "Transfira a responsabilidade de " + org.name + " antes de bloquear.",
                );
              if (
                !(
                  await c.query(
                    "SELECT 1 FROM app.memberships m JOIN app.users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.user_id=$2 AND m.active AND u.active",
                    [org.id, replacement.user_id],
                  )
                ).rowCount
              )
                throw failure("MEMBER_REQUIRED", "Sucessor precisa ser administrador ativo.");
              await c.query(
                "UPDATE app.organizations SET responsible_user_id=$2,version=version+1 WHERE id=$1",
                [org.id, replacement.user_id],
              );
              await managementAudit(
                c,
                actor,
                org.id,
                "responsible.changed",
                replacement.user_id,
                req.id,
                { previous: id },
                input.reason,
              );
            }
          }
        }
        const u = (
          await c.query(
            "UPDATE app.users SET active=$2,version=version+1 WHERE id=$1 RETURNING id,email,active,version",
            [id, input.active],
          )
        ).rows[0];
        if (!input.active) await revoke(c, id);
        await managementAudit(
          c,
          actor,
          null,
          input.active ? "user.reactivated" : "user.blocked",
          id,
          req.id,
          {},
          input.reason,
        );
        return u;
      },
    );
  });
  app.post(base + "/organizations/:org/members/:id/status", async (req) => {
    const { org, id } = z.object({ org: uuid, id: uuid }).parse(req.params),
      input = z.object({ version, active: z.boolean(), reason }).strict().parse(req.body);
    return service.write(
      req,
      "membership.status:" + org + ":" + id,
      input,
      org,
      async (c, actor) => {
        const organization = await service.organization(c, org),
          m = (
            await c.query(
              "SELECT * FROM app.memberships WHERE organization_id=$1 AND user_id=$2 FOR UPDATE",
              [org, id],
            )
          ).rows[0];
        if (!m || m.version !== input.version)
          throw failure("VERSION_CONFLICT", "Vínculo ausente ou alterado.");
        if (!input.active) {
          if (organization.responsible_user_id === id)
            throw failure(
              "RESPONSIBLE_REPLACEMENT_REQUIRED",
              "Transfira a responsabilidade antes de remover o vínculo.",
            );
          if (
            organization.status === "active" &&
            !(
              await c.query(
                "SELECT 1 FROM app.memberships m JOIN app.users u ON u.id=m.user_id WHERE organization_id=$1 AND user_id!=$2 AND m.active AND u.active",
                [org, id],
              )
            ).rowCount
          )
            throw failure("LAST_ORGANIZATION_ADMIN", "Mantenha ao menos um administrador ativo.");
        }
        if (organization.status === "closed")
          throw failure("ORGANIZATION_CLOSED", "Organização encerrada.");
        const result = (
          await c.query(
            "UPDATE app.memberships SET active=$3,version=version+1 WHERE organization_id=$1 AND user_id=$2 RETURNING organization_id,user_id,active,version",
            [org, id, input.active],
          )
        ).rows[0];
        await revoke(c, id, "organization", org);
        await managementAudit(
          c,
          actor,
          org,
          "membership." + (input.active ? "activated" : "blocked"),
          id,
          req.id,
          {},
          input.reason,
        );
        return result;
      },
    );
  });
  app.post(base + "/users/:id/sessions/revoke", async (req) => {
    const id = target(req),
      input = z
        .object({
          scope: z.enum(["all", "platform", "organization"]),
          organization_id: uuid.optional(),
          reason,
        })
        .strict()
        .parse(req.body);
    if ((input.scope === "organization") !== Boolean(input.organization_id))
      throw failure(
        "INVALID_SCOPE",
        "Selecione a organização apenas para alcance organizacional.",
        422,
      );
    return service.write(req, "sessions.revoke:" + id, input, undefined, async (c, actor) => {
      await user(c, id);
      const count = await revoke(c, id, input.scope, input.organization_id);
      await managementAudit(
        c,
        actor,
        input.organization_id ?? null,
        "sessions.revoked",
        id,
        req.id,
        { scope: input.scope, count },
        input.reason,
      );
      return { revoked_count: count };
    });
  });
  app.post(base + "/users/:id/password-reset", async (req) => {
    const id = target(req),
      input = z.object({ reason }).strict().parse(req.body);
    return service.write(
      req,
      "password.reset_request:" + id,
      input,
      undefined,
      async (c, actor) => {
        const u = await user(c, id);
        if (!u.active) throw failure("USER_BLOCKED", "Conta bloqueada.");
        const raw = token();
        await c.query(
          "UPDATE app.password_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
          [id],
        );
        await c.query(
          "INSERT INTO app.password_tokens(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')",
          [digest(raw), id],
        );
        await message(c, id, u.email, "user-password", raw);
        await managementAudit(
          c,
          actor,
          null,
          "password.reset_requested",
          id,
          req.id,
          {},
          input.reason,
        );
        return { queued: true };
      },
    );
  });
  app.post(base + "/super-admins/:id/revoke", async (req) => {
    const id = target(req),
      input = z.object({ version, reason }).strict().parse(req.body);
    return service.write(req, "platform.revoke:" + id, input, undefined, async (c, actor) => {
      await user(c, id);
      const p = (
        await c.query("SELECT * FROM app.platform_privileges WHERE user_id=$1 FOR UPDATE", [id])
      ).rows[0];
      if (!p || p.version !== input.version || p.state === "revoked")
        throw failure("VERSION_CONFLICT", "Privilégio alterado ou revogado.");
      await preservePlatform(c, id);
      const result = (
        await c.query(
          "UPDATE app.platform_privileges SET state='revoked',version=version+1 WHERE user_id=$1 RETURNING user_id,state,version",
          [id],
        )
      ).rows[0];
      await revoke(c, id, "platform");
      await managementAudit(
        c,
        actor,
        null,
        "platform_privilege.revoked",
        id,
        req.id,
        {},
        input.reason,
      );
      return result;
    });
  });
  app.post(base + "/super-admins/:id/mfa-reset", async (req) => {
    const id = target(req),
      input = z.object({ reason }).strict().parse(req.body);
    return service.write(req, "mfa.reset_request:" + id, input, undefined, async (c, actor) => {
      if (actor === id)
        throw failure(
          "SELF_RECOVERY_NOT_ALLOWED",
          "Use seus códigos de recuperação ou o procedimento técnico.",
        );
      const u = await user(c, id);
      if (
        !u.active ||
        !(
          await c.query(
            "SELECT 1 FROM app.platform_privileges WHERE user_id=$1 AND state='active'",
            [id],
          )
        ).rowCount
      )
        throw failure("USER_UNAVAILABLE", "Super admin indisponível.");
      await c.query(
        "UPDATE app.platform_privileges SET recovery_pending=true,version=version+1 WHERE user_id=$1",
        [id],
      );
      await revoke(c, id, "platform");
      await c.query("UPDATE app.platform_mfa_resets SET used_at=now() WHERE user_id=$1", [id]);
      const raw = token();
      await c.query(
        "INSERT INTO app.platform_mfa_resets(token_hash,user_id,auth_version,expires_at) VALUES($1,$2,$3,now()+interval '30 minutes')",
        [digest(raw), id, u.auth_version],
      );
      await message(c, id, u.email, "mfa", raw);
      await managementAudit(c, actor, null, "mfa.reset_requested", id, req.id, {}, input.reason);
      return { queued: true };
    });
  });
  app.post(base + "/users/:id/email-change", async (req) => {
    const id = target(req),
      input = z.object({ version, new_email: email, reason }).strict().parse(req.body);
    return service.write(req, "email.change_request:" + id, input, undefined, async (c, actor) => {
      const u = await user(c, id, input.version);
      if (!u.active) throw failure("USER_BLOCKED", "Conta bloqueada.");
      if ((await c.query("SELECT 1 FROM app.users WHERE email=$1", [input.new_email])).rowCount)
        throw failure("EMAIL_IN_USE", "Email já utilizado.");
      await c.query(
        "UPDATE app.email_changes SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
        [id],
      );
      const raw = token();
      await c.query(
        "INSERT INTO app.email_changes(token_hash,user_id,new_email,old_email,auth_version,user_version,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '30 minutes')",
        [digest(raw), id, input.new_email, u.email, u.auth_version, u.version],
      );
      await message(c, id, input.new_email, "email", raw);
      await managementAudit(c, actor, null, "email.change_requested", id, req.id, {}, input.reason);
      return { queued: true };
    });
  });
  async function publicLimit(req: FastifyRequest) {
    const r = await o.pool.query(
      "INSERT INTO app.auth_limits(key,attempts,window_start) VALUES($1,1,now()) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN app.auth_limits.window_start<now()-interval '15 minutes' THEN 1 ELSE app.auth_limits.attempts+1 END,window_start=CASE WHEN app.auth_limits.window_start<now()-interval '15 minutes' THEN now() ELSE app.auth_limits.window_start END RETURNING attempts",
      [digest("account-public:" + req.ip)],
    );
    if (r.rows[0].attempts > 20)
      throw failure("RATE_LIMITED", "Muitas tentativas. Aguarde 15 minutos.", 429);
  }
  app.post(base + "/email-change/confirm", async (req) => {
    await publicLimit(req);
    const input = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(1).max(128) })
      .strict()
      .parse(req.body);
    return transaction(o.pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(730207)");
      const change = (
        await c.query(
          "SELECT * FROM app.email_changes WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE",
          [digest(input.token)],
        )
      ).rows[0];
      if (!change) throw failure("INVALID_TOKEN", "Link inválido ou expirado.", 410);
      const u = await user(c, change.user_id);
      const hash = (await c.query("SELECT password_hash FROM app.users WHERE id=$1", [u.id]))
        .rows[0].password_hash;
      if (
        !u.active ||
        u.auth_version !== change.auth_version ||
        u.version !== change.user_version ||
        !(await verifyPassword(input.password, hash))
      )
        throw failure("INVALID_CREDENTIALS", "Não foi possível confirmar a identidade.", 401);
      if ((await c.query("SELECT 1 FROM app.users WHERE email=$1", [change.new_email])).rowCount)
        throw failure("EMAIL_IN_USE", "Email já utilizado.");
      await c.query("UPDATE app.users SET email=$2,version=version+1 WHERE id=$1", [
        u.id,
        change.new_email,
      ]);
      await revoke(c, u.id);
      await c.query("UPDATE app.password_tokens SET used_at=now() WHERE user_id=$1", [u.id]);
      await c.query("UPDATE app.platform_mfa_resets SET used_at=now() WHERE user_id=$1", [u.id]);
      await c.query("UPDATE app.email_changes SET used_at=now() WHERE user_id=$1", [u.id]);
      await message(c, u.id, change.old_email, "email-notice", "");
      await managementAudit(c, u.id, null, "user.email_changed", u.id, req.id, {
        old_email: change.old_email,
        new_email: change.new_email,
      });
      return { confirmed: true };
    });
  });
  app.post(base + "/super-admin-invitations", async (req, reply) => {
    const input = z.object({ email }).strict().parse(req.body);
    const r = await service.write(req, "platform.invite", input, undefined, async (c, actor) => {
      await c.query(
        "UPDATE app.organization_invitations SET status='cancelled',version=version+1 WHERE kind='platform_admin' AND email=$1 AND status='pending' AND expires_at<=now()",
        [input.email],
      );
      if (
        (
          await c.query(
            "SELECT 1 FROM app.users u JOIN app.platform_privileges p ON p.user_id=u.id WHERE u.email=$1 AND p.state IN ('active','invited')",
            [input.email],
          )
        ).rowCount
      )
        throw failure(
          "PRIVILEGE_EXISTS",
          "Privilégio já existe; use recuperação ou consulte a conta.",
        );
      if (
        (
          await c.query(
            "SELECT 1 FROM app.organization_invitations WHERE kind='platform_admin' AND email=$1 AND status='pending'",
            [input.email],
          )
        ).rowCount
      )
        throw failure("INVITATION_PENDING", "Convite pendente já existe.");
      const raw = token(),
        i = (
          await c.query(
            "INSERT INTO app.organization_invitations(organization_id,email,token_hash,kind) VALUES(NULL,$1,$2,'platform_admin') RETURNING id,email,status,version",
            [input.email, digest(raw)],
          )
        ).rows[0];
      await service.queue(c, i.id, raw);
      await managementAudit(c, actor, null, "platform_privilege.invited", i.id, req.id);
      return i;
    });
    reply.code(201);
    return r;
  });
  app.get(base + "/super-admin-invitations", async (req) =>
    transaction(o.pool, async (c) => {
      await guard(req, c);
      const q = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(25),
          cursor: uuid.optional(),
        })
        .strict()
        .parse(req.query);
      const rows = (
        await c.query(
          "SELECT id,email,version,CASE WHEN status='pending' AND expires_at<=now() THEN 'expired' ELSE status END status FROM app.organization_invitations WHERE kind='platform_admin' AND ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT $2",
          [q.cursor ?? null, q.limit + 1],
        )
      ).rows;
      return {
        items: rows.slice(0, q.limit),
        next_cursor: rows.length > q.limit ? rows[q.limit - 1].id : null,
      };
    }),
  );
  for (const action of ["resend", "cancel"])
    app.post(base + "/super-admin-invitations/:id/" + action, async (req) => {
      const id = target(req),
        input = z.object({ version, reason }).strict().parse(req.body);
      return service.write(
        req,
        "platform.invitation." + action + ":" + id,
        input,
        undefined,
        async (c, actor) => {
          const i = (
            await c.query(
              "SELECT * FROM app.organization_invitations WHERE id=$1 AND kind='platform_admin' FOR UPDATE",
              [id],
            )
          ).rows[0];
          if (!i || i.status !== "pending" || i.version !== input.version)
            throw failure("INVITATION_CONFLICT", "Convite alterado ou utilizado.");
          await c.query(
            "UPDATE app.invitation_outbox SET delivery_status='cancelled',token_cipher=NULL WHERE invitation_id=$1 AND delivery_status IN ('pending','sending','failed')",
            [id],
          );
          const raw = token();
          const r =
            action === "resend"
              ? await c.query(
                  "UPDATE app.organization_invitations SET token_hash=$2,expires_at=now()+interval '24 hours',version=version+1 WHERE id=$1 RETURNING id,status,version",
                  [id, digest(raw)],
                )
              : await c.query(
                  "UPDATE app.organization_invitations SET status='cancelled',version=version+1 WHERE id=$1 RETURNING id,status,version",
                  [id],
                );
          if (action === "resend") await service.queue(c, id, raw);
          await managementAudit(
            c,
            actor,
            null,
            "platform.invitation." + action,
            id,
            req.id,
            {},
            input.reason,
          );
          return r.rows[0];
        },
      );
    });
  app.post(base + "/super-admin-invitations/inspect", async (req) => {
    await publicLimit(req);
    const input = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .parse(req.body);
    const row = (
      await o.pool.query(
        "SELECT EXISTS(SELECT 1 FROM app.users u WHERE u.email=i.email) existing_identity FROM app.organization_invitations i WHERE token_hash=$1 AND kind='platform_admin' AND status='pending' AND expires_at>now()",
        [digest(input.token)],
      )
    ).rows[0];
    if (!row) throw failure("INVALID_TOKEN", "Convite inválido, utilizado ou expirado.", 410);
    return { organization_name: "Administração da plataforma", ...row };
  });
  app.post(base + "/super-admin-invitations/accept", async (req) => {
    await publicLimit(req);
    const input = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(1).max(128) })
      .strict()
      .parse(req.body);
    return transaction(o.pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(730207)");
      const i = (
        await c.query(
          "SELECT * FROM app.organization_invitations WHERE token_hash=$1 AND kind='platform_admin' AND status='pending' AND expires_at>now() FOR UPDATE",
          [digest(input.token)],
        )
      ).rows[0];
      if (!i) throw failure("INVALID_TOKEN", "Convite inválido, utilizado ou expirado.", 410);
      let u = (
        await c.query("SELECT id,password_hash,active FROM app.users WHERE email=$1 FOR UPDATE", [
          i.email,
        ])
      ).rows[0];
      if (u) {
        if (!u.active || !(await verifyPassword(input.password, u.password_hash)))
          throw failure("INVALID_CREDENTIALS", "Use sua senha atual ou recupere sua conta.", 401);
      } else {
        if (input.password.length < 12)
          throw failure("PASSWORD_TOO_SHORT", "Use ao menos 12 caracteres.", 422);
        u = (
          await c.query("INSERT INTO app.users(email,password_hash) VALUES($1,$2) RETURNING id", [
            i.email,
            await hashPassword(input.password),
          ])
        ).rows[0];
      }
      const p = (
        await c.query("SELECT state FROM app.platform_privileges WHERE user_id=$1", [u.id])
      ).rows[0];
      if (p && p.state !== "revoked") throw failure("PRIVILEGE_EXISTS", "Privilégio já existente.");
      await c.query(
        "INSERT INTO app.platform_privileges(user_id,state) VALUES($1,'invited') ON CONFLICT(user_id) DO UPDATE SET state='invited',recovery_pending=false,version=app.platform_privileges.version+1",
        [u.id],
      );
      await c.query(
        "UPDATE app.organization_invitations SET status='accepted',accepted_by=$2,version=version+1 WHERE id=$1",
        [i.id, u.id],
      );
      await c.query(
        "UPDATE app.invitation_outbox SET token_cipher=NULL,delivery_status=CASE WHEN delivery_status='sent' THEN 'sent' ELSE 'cancelled' END WHERE invitation_id=$1",
        [i.id],
      );
      await managementAudit(c, u.id, null, "platform.invitation.accepted", i.id, req.id);
      return { next: "platform_login", organization_status: "platform" };
    });
  });
}
export async function deliverAccountMessages(o: PlatformOptions) {
  const cipher = platformCipher(o.key);
  const row = await transaction(o.pool, async (c) => {
    await c.query(
      "UPDATE app.account_outbox SET delivery_status='cancelled',token_cipher=NULL WHERE expires_at<=now() AND delivery_status IN ('pending','sending','failed')",
    );
    await c.query(
      "UPDATE app.account_outbox SET delivery_status='failed',token_cipher=NULL WHERE attempts>=5 AND delivery_status='sending' AND lease_until<now()",
    );
    const r = (
      await c.query(
        "SELECT * FROM app.account_outbox WHERE token_cipher IS NOT NULL AND attempts<5 AND ((delivery_status='pending' AND next_attempt_at<=now()) OR (delivery_status='sending' AND lease_until<now())) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
      )
    ).rows[0];
    if (!r) return null;
    await c.query(
      "UPDATE app.account_outbox SET delivery_status='sending',attempts=attempts+1,lease_until=now()+interval '1 minute' WHERE id=$1",
      [r.id],
    );
    return r;
  });
  if (!row) return;
  try {
    await o.sendMail(row.recipient, cipher.open(row.token_cipher, "account:" + row.id), row.kind);
    await o.pool.query(
      "UPDATE app.account_outbox SET delivery_status='sent',token_cipher=NULL,lease_until=NULL WHERE id=$1 AND delivery_status='sending'",
      [row.id],
    );
  } catch {
    await o.pool.query(
      "UPDATE app.account_outbox SET delivery_status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,token_cipher=CASE WHEN attempts>=5 THEN NULL ELSE token_cipher END,lease_until=NULL,next_attempt_at=now()+($2::int*interval '30 seconds') WHERE id=$1 AND delivery_status='sending'",
      [row.id, 2 ** row.attempts],
    );
  }
}
