import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { audit, HttpError, transaction } from "./db.js";
import type { SendReset } from "./mail.js";
import { platformAudit } from "./platform.js";
import { csrfFor, digest, equal, hashPassword, token, verifyPassword } from "./security.js";

export type Principal = {
  user_id: string;
  organization_id: string;
  email: string;
  organization_name: string;
  token_hash: string;
};
export type AuthOptions = {
  pool: pg.Pool;
  origin: string;
  secure: boolean;
  sendReset: SendReset;
  metricsToken?: string;
  platform?: import("./platform.js").PlatformOptions;
};
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z.string().min(12).max(128);
const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
    organization_id: z.string().uuid().optional(),
  })
  .strict();
const cookieName = "cc_session";
export function authService(options: AuthOptions) {
  const { pool } = options;
  async function authenticate(req: FastifyRequest): Promise<Principal> {
    const raw = req.cookies[cookieName];
    if (!raw || !/^[a-f0-9]{64}$/.test(raw))
      throw new HttpError(401, "UNAUTHENTICATED", "Entre para continuar");
    const result = await pool.query<Principal>(
      `UPDATE app.sessions s SET last_seen_at=now()
   FROM app.users u,app.organizations o,app.memberships m
   WHERE s.token_hash=$1 AND s.user_id=u.id AND s.organization_id=o.id
   AND m.user_id=u.id AND m.organization_id=o.id AND m.active AND u.active AND o.active
   AND s.revoked_at IS NULL AND s.expires_at>now() AND s.last_seen_at>now()-interval '30 minutes'
   RETURNING s.user_id,s.organization_id,s.token_hash,u.email,o.name AS organization_name`,
      [digest(raw)],
    );
    const principal = result.rows[0];
    if (!principal)
      throw new HttpError(401, "SESSION_EXPIRED", "Sua sessão expirou. Entre novamente");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !equal(String(req.headers["x-csrf-token"] ?? ""), csrfFor(raw))
    )
      throw new HttpError(403, "CSRF_INVALID", "Atualize a página e tente novamente");
    return principal;
  }
  async function limit(key: string, max: number) {
    const result = await pool.query<{ attempts: number }>(
      `INSERT INTO app.auth_limits(key,attempts,window_start) VALUES($1,1,now())
   ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN app.auth_limits.window_start<now()-interval '15 minutes' THEN 1 ELSE app.auth_limits.attempts+1 END,
   window_start=CASE WHEN app.auth_limits.window_start<now()-interval '15 minutes' THEN now() ELSE app.auth_limits.window_start END RETURNING attempts`,
      [digest(key)],
    );
    if ((result.rows[0]?.attempts ?? 99) > max)
      throw new HttpError(429, "RATE_LIMITED", "Muitas tentativas. Aguarde 15 minutos");
  }
  async function issueReset(email: string, requestId?: string) {
    const raw = token();
    const found = await transaction(pool, async (c) => {
      const u = (
        await c.query<{ id: string }>(
          "SELECT id FROM app.users WHERE email=$1 AND active FOR UPDATE",
          [email],
        )
      ).rows[0];
      if (!u) return false;
      await c.query(
        "UPDATE app.password_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
        [u.id],
      );
      await c.query(
        "INSERT INTO app.password_tokens(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')",
        [digest(raw), u.id],
      );
      const orgs = await c.query<{ organization_id: string }>(
        "SELECT organization_id FROM app.memberships WHERE user_id=$1",
        [u.id],
      );
      for (const row of orgs.rows) {
        await c.query("SELECT set_config('app.organization_id',$1,true)", [row.organization_id]);
        await audit(c, row.organization_id, u.id, "password.reset_requested", u.id, {}, requestId);
      }
      return true;
    });
    if (found) await options.sendReset(email, raw);
  }
  function register(app: FastifyInstance) {
    app.addHook("onRequest", async (req, reply) => {
      if (req.url.startsWith("/api/v1/auth")) reply.header("Cache-Control", "no-store");
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers.origin !== options.origin)
        throw new HttpError(403, "ORIGIN_INVALID", "Origem não permitida");
    });
    app.post("/api/v1/auth/admin/login", async (req, reply) => {
      const input = loginSchema.parse(req.body);
      await limit("login:" + req.ip + ":" + input.email, 5);
      const row = (
        await pool.query<{ id: string; password_hash: string | null }>(
          "SELECT id,password_hash FROM app.users WHERE email=$1 AND active",
          [input.email],
        )
      ).rows[0];
      if (!(await verifyPassword(input.password, row?.password_hash ?? null)) || !row)
        throw new HttpError(401, "INVALID_CREDENTIALS", "Email ou senha inválidos");
      const raw = token();
      const orgs = await pool.query<{ id: string; name: string }>(
        "SELECT o.id,o.name FROM app.organizations o JOIN app.memberships m ON m.organization_id=o.id WHERE m.user_id=$1 AND m.active AND o.active ORDER BY o.name",
        [row.id],
      );
      if (orgs.rows.length > 1 && !input.organization_id) return { organizations: orgs.rows };
      const org =
        orgs.rows.find((o) => o.id === input.organization_id) ??
        (!input.organization_id ? orgs.rows[0] : undefined);
      if (!org) throw new HttpError(401, "INVALID_CREDENTIALS", "Email ou senha inválidos");
      await transaction(
        pool,
        async (c) => {
          // Serializa login/reset no usuário, evitando criar sessão após reset com hash antigo.
          const current = (
            await c.query<{ password_hash: string }>(
              "SELECT password_hash FROM app.users WHERE id=$1 AND active FOR UPDATE",
              [row.id],
            )
          ).rows[0];
          if (current?.password_hash !== row.password_hash)
            throw new HttpError(401, "INVALID_CREDENTIALS", "Entre novamente");
          await c.query(
            "INSERT INTO app.sessions(token_hash,user_id,organization_id,expires_at) VALUES($1,$2,$3,now()+interval '12 hours')",
            [digest(raw), row.id, org.id],
          );
          await c.query("DELETE FROM app.auth_limits WHERE key=$1", [
            digest("login:" + req.ip + ":" + input.email),
          ]);
          await audit(c, org.id, row.id, "auth.login", row.id, {}, req.id);
        },
        org.id,
      );
      reply.setCookie(cookieName, raw, {
        httpOnly: true,
        secure: options.secure,
        sameSite: "strict",
        path: "/",
        maxAge: 43200,
      });
      return { user: { email: input.email }, organization: org, csrf_token: csrfFor(raw) };
    });
    app.get("/api/v1/auth/me", async (req) => {
      const p = await authenticate(req);
      return {
        user: { email: p.email },
        organization: { id: p.organization_id, name: p.organization_name },
        csrf_token: csrfFor(req.cookies[cookieName] ?? ""),
      };
    });
    app.post("/api/v1/auth/logout", async (req, reply) => {
      const p = await authenticate(req);
      await transaction(
        pool,
        async (c) => {
          await c.query("UPDATE app.sessions SET revoked_at=now() WHERE token_hash=$1", [
            p.token_hash,
          ]);
          await audit(c, p.organization_id, p.user_id, "auth.logout", p.user_id, {}, req.id);
        },
        p.organization_id,
      );
      reply.clearCookie(cookieName, {
        path: "/",
        httpOnly: true,
        sameSite: "strict",
        secure: options.secure,
      });
      return { ok: true };
    });
    app.post("/api/v1/auth/password/forgot", async (req) => {
      const input = z.object({ email: emailSchema }).strict().parse(req.body);
      await limit("forgot:" + req.ip, 20);
      await limit("forgot-email:" + digest(input.email), 5);
      try {
        await issueReset(input.email, req.id);
      } catch {
        req.log.error("Falha no processamento de recuperação de senha");
      }
      return { message: "Se o email estiver cadastrado, enviaremos as instruções de acesso." };
    });
    app.post("/api/v1/auth/password/reset", async (req) => {
      const input = z
        .object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: passwordSchema })
        .strict()
        .parse(req.body);
      await limit("reset:" + req.ip, 20);
      const hash = await hashPassword(input.password);
      await transaction(pool, async (c) => {
        const candidate = (
          await c.query<{ user_id: string }>(
            "SELECT user_id FROM app.password_tokens WHERE token_hash=$1",
            [digest(input.token)],
          )
        ).rows[0];
        if (!candidate) throw new HttpError(400, "INVALID_TOKEN", "Link inválido ou expirado");
        await c.query("SELECT id FROM app.users WHERE id=$1 FOR UPDATE", [candidate.user_id]);
        const valid = await c.query(
          "UPDATE app.password_tokens SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() RETURNING user_id",
          [digest(input.token)],
        );
        if (!valid.rowCount) throw new HttpError(400, "INVALID_TOKEN", "Link inválido ou expirado");
        await c.query("UPDATE app.users SET password_hash=$1 WHERE id=$2 AND active", [
          hash,
          candidate.user_id,
        ]);
        await c.query(
          "UPDATE app.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
          [candidate.user_id],
        );
        await c.query(
          "UPDATE app.password_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
          [candidate.user_id],
        );
        await platformAudit(c, null, candidate.user_id, "password.reset", req.id);
        for (const o of (
          await c.query<{ organization_id: string }>(
            "SELECT organization_id FROM app.memberships WHERE user_id=$1",
            [candidate.user_id],
          )
        ).rows) {
          await c.query("SELECT set_config('app.organization_id',$1,true)", [o.organization_id]);
          await audit(
            c,
            o.organization_id,
            candidate.user_id,
            "password.reset",
            candidate.user_id,
            {},
            req.id,
          );
        }
      });
      return { message: "Senha definida. Entre com seu email e sua nova senha." };
    });
  }
  return { authenticate, register, issueReset };
}
