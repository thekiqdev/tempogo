import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PlatformOptions } from "./platform.js";
import {
  email,
  failure,
  managementAudit,
  managementService,
  type PlatformGuard,
  uuid,
  version,
} from "./platform-management.js";
import { hashPassword } from "./security.js";

export function registerOrganizationMembers(
  app: FastifyInstance,
  o: PlatformOptions,
  guard: PlatformGuard,
) {
  const service = managementService(o, guard);
  const base = "/api/v1/platform/organizations/:org/members";
  app.post(base, async (req) => {
    const { org } = z.object({ org: uuid }).parse(req.params);
    const input = z
      .object({
        email,
        mode: z.enum(["create", "link"]),
        password: z.string().min(12).max(128).optional(),
        responsible: z.boolean().default(false),
        complete_setup: z.boolean().default(false),
        version,
      })
      .strict()
      .parse(req.body);
    if (input.mode === "create" && !input.password)
      throw failure("PASSWORD_REQUIRED", "Informe uma senha inicial.", 422);
    if (input.mode === "link" && input.password)
      throw failure("INVALID_INPUT", "Vincular uma conta não altera sua senha.", 422);
    return service.write(req, "organization.member.create:" + org, input, org, async (c, actor) => {
      const organization = await service.organization(c, org, input.version);
      if (organization.status === "closed")
        throw failure("ORGANIZATION_CLOSED", "Organização encerrada.");
      let u = (
        await c.query("SELECT id,active FROM app.users WHERE email=$1 FOR UPDATE", [input.email])
      ).rows[0];
      if (input.mode === "create" && u)
        throw failure("USER_EXISTS", "Email já cadastrado. Selecione vincular conta existente.");
      if (input.mode === "link" && !u)
        throw failure("USER_NOT_FOUND", "Conta não encontrada. Selecione criar conta.", 404);
      if (!u)
        u = (
          await c.query(
            "INSERT INTO app.users(email,password_hash,must_change_password) VALUES($1,$2,true) RETURNING id,active",
            [input.email, await hashPassword(input.password!)],
          )
        ).rows[0];
      if (!u.active) throw failure("USER_BLOCKED", "Conta globalmente bloqueada.");
      if (
        (
          await c.query("SELECT 1 FROM app.memberships WHERE organization_id=$1 AND user_id=$2", [
            org,
            u.id,
          ])
        ).rowCount
      )
        throw failure("MEMBER_EXISTS", "Usuário já vinculado. Use liberar acesso.");
      await c.query(
        "INSERT INTO app.memberships(organization_id,user_id,role,active) VALUES($1,$2,'admin',true)",
        [org, u.id],
      );
      if (input.responsible || !organization.responsible_user_id)
        await c.query(
          "UPDATE app.organizations SET responsible_user_id=$2,version=version+1 WHERE id=$1",
          [org, u.id],
        );
      else await c.query("UPDATE app.organizations SET version=version+1 WHERE id=$1", [org]);
      if (input.complete_setup && organization.status === "pending") {
        await c.query(
          "UPDATE app.organizations SET responsible_user_id=$2,status='active',active=true WHERE id=$1",
          [org, u.id],
        );
        await c.query(
          "UPDATE app.organization_invitations SET status='cancelled',version=version+1 WHERE organization_id=$1 AND initial_responsible AND status='pending'",
          [org],
        );
        await managementAudit(c, actor, org, "organization.transitioned", org, req.id, {
          from: "pending",
          to: "active",
          source: "guided_setup",
        });
      }
      await c.query(
        "UPDATE app.organization_invitations SET status='cancelled',version=version+1 WHERE organization_id=$1 AND email=$2 AND status='pending'",
        [org, input.email],
      );
      await c.query(
        "UPDATE app.invitation_outbox SET delivery_status='cancelled',token_cipher=NULL WHERE invitation_id IN (SELECT id FROM app.organization_invitations WHERE organization_id=$1 AND status='cancelled') AND delivery_status IN ('pending','sending','failed')",
        [org],
      );
      await managementAudit(c, actor, org, "member.added", u.id, req.id, { mode: input.mode });
      return { id: u.id };
    });
  });
  app.post(base + "/:id/password", async (req) => {
    const { org, id } = z.object({ org: uuid, id: uuid }).parse(req.params);
    const input = z
      .object({ password: z.string().min(12).max(128), version, confirm_global: z.literal(true) })
      .strict()
      .parse(req.body);
    return service.write(
      req,
      "organization.member.password:" + org + ":" + id,
      input,
      org,
      async (c, actor) => {
        const organization = await service.organization(c, org);
        if (organization.status === "closed")
          throw failure("ORGANIZATION_CLOSED", "Organização encerrada.");
        const u = (
          await c.query(
            "SELECT u.* FROM app.users u JOIN app.memberships m ON m.user_id=u.id WHERE m.organization_id=$1 AND u.id=$2 FOR UPDATE OF u",
            [org, id],
          )
        ).rows[0];
        if (!u) throw failure("NOT_FOUND", "Usuário não pertence à organização.", 404);
        if (u.version !== input.version)
          throw failure("VERSION_CONFLICT", "Conta alterada. Atualize a lista.");
        if (!u.active) throw failure("USER_BLOCKED", "Conta globalmente bloqueada.");
        if (
          (
            await c.query(
              "SELECT 1 FROM app.platform_privileges WHERE user_id=$1 AND state IN ('active','invited')",
              [id],
            )
          ).rowCount
        )
          throw failure("PLATFORM_ACCOUNT", "Gerencie a senha desta conta na área Super admins.");
        await c.query(
          "UPDATE app.users SET password_hash=$2,must_change_password=true,version=version+1 WHERE id=$1",
          [id, await hashPassword(input.password)],
        );
        await c.query(
          "UPDATE app.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
          [id],
        );
        await c.query(
          "UPDATE app.platform_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
          [id],
        );
        await c.query(
          "UPDATE app.platform_challenges SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
          [id],
        );
        await c.query(
          "UPDATE app.password_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
          [id],
        );
        await managementAudit(c, actor, org, "password.admin_changed", id, req.id, {
          scope: "all_organizations",
          must_change_password: true,
        });
        return { changed: true };
      },
    );
  });
  app.post(base + "/:id/sessions/revoke", async (req) => {
    const { org, id } = z.object({ org: uuid, id: uuid }).parse(req.params);
    const input = z.object({ version }).strict().parse(req.body);
    return service.write(
      req,
      "organization.member.sessions:" + org + ":" + id,
      input,
      org,
      async (c, actor) => {
        const m = (
          await c.query(
            "SELECT version FROM app.memberships WHERE organization_id=$1 AND user_id=$2 FOR UPDATE",
            [org, id],
          )
        ).rows[0];
        if (!m || m.version !== input.version)
          throw failure("VERSION_CONFLICT", "Vínculo ausente ou alterado.");
        const r = await c.query(
          "UPDATE app.sessions SET revoked_at=now() WHERE organization_id=$1 AND user_id=$2 AND revoked_at IS NULL",
          [org, id],
        );
        await managementAudit(c, actor, org, "sessions.revoked", id, req.id, {
          scope: "organization",
        });
        return { revoked_count: r.rowCount };
      },
    );
  });
}
