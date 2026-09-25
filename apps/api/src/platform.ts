import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { HttpError, transaction } from "./db.js";
import { deliverAccountMessages, registerAccounts } from "./platform-accounts.js";
import { newTotpSecret, platformCipher, verifyTotp } from "./platform-crypto.js";
import { deliverInvitations, registerOrganizations } from "./platform-management.js";
import { registerOverview } from "./platform-overview.js";
import { csrfFor, digest, equal, hashPassword, token, verifyPassword } from "./security.js";
export type PlatformOptions = {
  pool: pg.Pool;
  key: string;
  origin: string;
  secure: boolean;
  sendMail: (
    email: string,
    raw: string,
    kind:
      | "password"
      | "mfa"
      | "notice"
      | "invitation"
      | "super-invitation"
      | "user-password"
      | "email"
      | "email-notice",
  ) => Promise<void>;
};
const prefix = "/api/v1/platform",
  sessionCookie = "cc_platform_session",
  challengeCookie = "cc_platform_challenge";
const email = z.string().trim().toLowerCase().email().max(254),
  password = z.string().min(12).max(128),
  rawToken = z.string().regex(/^[a-f0-9]{64}$/),
  code = z.string().regex(/^[0-9]{6}$/);
type Identity = {
  user_id: string;
  email: string;
  auth_version: number;
  password_hash: string;
  state: string;
  recovery_pending: boolean;
};
export async function platformAudit(
  c: pg.PoolClient,
  actor: string | null,
  target: string,
  action: string,
  requestId?: string,
  reason?: string,
) {
  await c.query(
    "INSERT INTO app.platform_audit(actor_id,target_id,action,request_id,reason) VALUES($1,$2,$3,$4,$5)",
    [actor, target, action, requestId ?? null, reason ?? null],
  );
}
export function registerPlatform(app: FastifyInstance, o: PlatformOptions) {
  const cipher = platformCipher(o.key),
    cookieOptions = { path: prefix, httpOnly: true, secure: o.secure, sameSite: "strict" as const };
  const denied = () =>
    new HttpError(401, "PLATFORM_UNAUTHENTICATED", "Acesso inválido ou expirado. Entre novamente.");
  function cookie(req: FastifyRequest, name: string) {
    const raw = req.cookies[name];
    if (!raw || !rawToken.safeParse(raw).success) throw denied();
    return raw;
  }
  function csrf(req: FastifyRequest, raw: string) {
    if (!equal(String(req.headers["x-csrf-token"] ?? ""), csrfFor(raw)))
      throw new HttpError(403, "CSRF_INVALID", "Atualize a página e tente novamente.");
  }
  async function limit(req: FastifyRequest, reply: FastifyReply, key: string, max: number) {
    const r = await o.pool.query(
      "INSERT INTO app.auth_limits(key,attempts,window_start) VALUES($1,1,now()) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN app.auth_limits.window_start<now()-interval '15 minutes' THEN 1 ELSE app.auth_limits.attempts+1 END,window_start=CASE WHEN app.auth_limits.window_start<now()-interval '15 minutes' THEN now() ELSE app.auth_limits.window_start END RETURNING attempts",
      [digest("platform:" + key)],
    );
    if (r.rows[0].attempts > max) {
      reply.header("Retry-After", "900");
      req.log.warn({ action: "platform.rate_limited" }, "Limite de autenticação");
      throw new HttpError(429, "RATE_LIMITED", "Muitas tentativas. Aguarde 15 minutos.");
    }
  }
  async function identity(c: pg.PoolClient, id: string): Promise<Identity> {
    const r = await c.query(
      "SELECT u.id user_id,u.email,u.auth_version,u.password_hash,p.state,p.recovery_pending FROM app.users u JOIN app.platform_privileges p ON p.user_id=u.id WHERE u.id=$1 AND u.active AND p.state IN ('active','invited') FOR UPDATE OF u,p",
      [id],
    );
    if (!r.rows[0]) throw denied();
    return r.rows[0];
  }
  async function challenge(req: FastifyRequest, reply: FastifyReply) {
    const raw = cookie(req, challengeCookie);
    csrf(req, raw);
    const r = await o.pool.query(
      "UPDATE app.platform_challenges SET attempts=attempts+1 WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() AND attempts<5 RETURNING user_id",
      [digest(raw)],
    );
    if (!r.rows[0]) throw denied();
    await limit(req, reply, "mfa:" + r.rows[0].user_id, 20);
    return { raw, user_id: r.rows[0].user_id };
  }
  async function readChallenge(c: pg.PoolClient, raw: string, id: string, purpose?: string) {
    const u = await identity(c, id);
    const r = await c.query(
      "SELECT * FROM app.platform_challenges WHERE token_hash=$1 AND user_id=$2 AND auth_version=$3 AND used_at IS NULL AND expires_at>now() FOR UPDATE",
      [digest(raw), id, u.auth_version],
    );
    const ch = r.rows[0];
    if (!ch || (purpose && ch.purpose !== purpose)) throw denied();
    return { u, ch };
  }
  async function issueChallenge(c: pg.PoolClient, u: Identity, purpose: string) {
    const raw = token();
    await c.query(
      "UPDATE app.platform_challenges SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
      [u.user_id],
    );
    await c.query(
      "INSERT INTO app.platform_challenges(token_hash,user_id,auth_version,purpose,expires_at) VALUES($1,$2,$3,$4,now()+interval '5 minutes')",
      [digest(raw), u.user_id, u.auth_version, purpose],
    );
    return raw;
  }
  function returnChallenge(reply: FastifyReply, raw: string, purpose: string) {
    reply.setCookie(challengeCookie, raw, { ...cookieOptions, maxAge: 300 });
    reply.code(202);
    return {
      next: purpose === "enroll" ? "mfa_enroll" : "mfa_verify",
      csrf_token: csrfFor(raw),
      expires_at: new Date(Date.now() + 300000).toISOString(),
    };
  }
  async function session(req: FastifyRequest, c: pg.PoolClient, mutating = false) {
    const raw = cookie(req, sessionCookie);
    if (mutating) csrf(req, raw);
    const found = await c.query("SELECT user_id FROM app.platform_sessions WHERE token_hash=$1", [
      digest(raw),
    ]);
    if (!found.rows[0]) throw denied();
    const u = await identity(c, found.rows[0].user_id);
    if (u.state !== "active" || u.recovery_pending) throw denied();
    const r = await c.query(
      "UPDATE app.platform_sessions SET last_seen_at=now() WHERE token_hash=$1 AND auth_version=$2 AND revoked_at IS NULL AND expires_at>now() AND last_seen_at>now()-interval '15 minutes' RETURNING expires_at,reauthenticated_until",
      [digest(raw), u.auth_version],
    );
    if (!r.rows[0]) throw denied();
    return { u, raw, ...r.rows[0] };
  }
  async function issueSession(
    c: pg.PoolClient,
    u: Identity,
    challengeRaw: string,
    req: FastifyRequest,
  ) {
    const raw = token();
    await c.query("UPDATE app.platform_challenges SET used_at=now() WHERE token_hash=$1", [
      digest(challengeRaw),
    ]);
    await c.query(
      "INSERT INTO app.platform_sessions(token_hash,user_id,auth_version,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')",
      [digest(raw), u.user_id, u.auth_version],
    );
    await platformAudit(c, u.user_id, u.user_id, "platform.login", req.id);
    return raw;
  }
  function returnSession(
    reply: FastifyReply,
    raw: string,
    emailValue: string,
    recoveryCodes?: string[],
  ) {
    reply.clearCookie(challengeCookie, cookieOptions);
    reply.setCookie(sessionCookie, raw, { ...cookieOptions, maxAge: 28800 });
    return {
      user: { email: emailValue },
      csrf_token: csrfFor(raw),
      expires_at: new Date(Date.now() + 28800000).toISOString(),
      ...(recoveryCodes ? { recovery_codes: recoveryCodes } : {}),
    };
  }
  async function checkFactor(c: pg.PoolClient, u: Identity, value: string) {
    const row = (
      await c.query("SELECT * FROM app.platform_mfa WHERE user_id=$1 FOR UPDATE", [u.user_id])
    ).rows[0];
    if (!row) throw denied();
    const step = verifyTotp(
      cipher.open(row.secret_cipher, u.user_id),
      value,
      Number(row.last_step),
    );
    if (step === null)
      throw new HttpError(401, "MFA_INVALID", "Código inválido, expirado ou já utilizado.");
    await c.query("UPDATE app.platform_mfa SET last_step=$2 WHERE user_id=$1", [u.user_id, step]);
  }
  registerOrganizations(app, o, session);
  registerAccounts(app, o, session);
  registerOverview(app, o, session);
  let delivering: Promise<unknown> | undefined;
  const deliver = () => {
    if (!delivering)
      delivering = deliverInvitations(o)
        .then(() => deliverAccountMessages(o))
        .catch(() => app.log.error("Falha na fila de convites"))
        .finally(() => {
          delivering = undefined;
        });
  };
  let timer: ReturnType<typeof setInterval> | undefined;
  app.addHook("onReady", async () => {
    timer = setInterval(deliver, 10000);
    timer.unref();
  });
  app.addHook("onClose", async () => {
    clearInterval(timer);
    await delivering;
  });
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith(prefix)) return;
    reply.header("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers.origin !== o.origin)
      throw new HttpError(403, "ORIGIN_INVALID", "Origem não permitida");
  });
  app.post(prefix + "/auth/login", async (req, reply) => {
    const input = z
      .object({ email, password: z.string().min(1).max(128) })
      .strict()
      .parse(req.body);
    await limit(req, reply, "login-ip:" + req.ip, 20);
    await limit(req, reply, "login:" + req.ip + ":" + input.email, 5);
    const found = (
      await o.pool.query(
        "SELECT u.id,u.password_hash FROM app.users u JOIN app.platform_privileges p ON p.user_id=u.id WHERE u.email=$1 AND u.active AND p.state IN ('active','invited')",
        [input.email],
      )
    ).rows[0];
    if (!(await verifyPassword(input.password, found?.password_hash ?? null)) || !found)
      throw denied();
    const r = await transaction(o.pool, async (c) => {
      const u = await identity(c, found.id);
      if (u.password_hash !== found.password_hash) throw denied();
      const mfa = await c.query("SELECT user_id FROM app.platform_mfa WHERE user_id=$1", [
        u.user_id,
      ]);
      const purpose = mfa.rowCount ? "verify" : "enroll";
      if (purpose === "enroll" && u.state !== "invited") throw denied();
      return { raw: await issueChallenge(c, u, purpose), purpose };
    });
    return returnChallenge(reply, r.raw, r.purpose);
  });
  app.post(prefix + "/auth/mfa/enroll", async (req, reply) => {
    const { raw, user_id } = await challenge(req, reply);
    const secret = await transaction(o.pool, async (c) => {
      const { u, ch } = await readChallenge(c, raw, user_id, "enroll");
      if (ch.secret_cipher)
        throw new HttpError(
          409,
          "ENROLLMENT_ALREADY_SHOWN",
          "Cadastro já iniciado. Entre novamente para reiniciar.",
        );
      const secret = newTotpSecret();
      await c.query("UPDATE app.platform_challenges SET secret_cipher=$2 WHERE token_hash=$1", [
        digest(raw),
        cipher.seal(secret, u.user_id),
      ]);
      return { secret, email: u.email };
    });
    return {
      secret: secret.secret,
      otpauth_uri:
        "otpauth://totp/" +
        encodeURIComponent("TempoGo:" + secret.email) +
        "?secret=" +
        secret.secret +
        "&issuer=TempoGo&algorithm=SHA1&digits=6&period=30",
    };
  });
  app.post(prefix + "/auth/mfa/confirm", async (req, reply) => {
    const input = z.object({ code }).strict().parse(req.body);
    const { raw, user_id } = await challenge(req, reply);
    const r = await transaction(o.pool, async (c) => {
      const { u, ch } = await readChallenge(c, raw, user_id, "enroll");
      if (!ch.secret_cipher) throw denied();
      const step = verifyTotp(cipher.open(ch.secret_cipher, user_id), input.code, -1);
      if (step === null) throw new HttpError(401, "MFA_INVALID", "Código inválido ou expirado.");
      await c.query(
        "INSERT INTO app.platform_mfa(user_id,secret_cipher,last_step) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET secret_cipher=$2,last_step=$3",
        [user_id, ch.secret_cipher, step],
      );
      await c.query("DELETE FROM app.platform_recovery_codes WHERE user_id=$1", [user_id]);
      const codes = Array.from({ length: 10 }, () => token().slice(0, 32));
      for (const value of codes)
        await c.query("INSERT INTO app.platform_recovery_codes(user_id,code_hash) VALUES($1,$2)", [
          user_id,
          digest(value),
        ]);
      await c.query(
        "UPDATE app.platform_privileges SET state='active',recovery_pending=false,version=version+1 WHERE user_id=$1",
        [user_id],
      );
      await c.query(
        "UPDATE app.platform_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
        [user_id],
      );
      await c.query(
        "UPDATE app.platform_mfa_resets SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
        [user_id],
      );
      await platformAudit(c, user_id, user_id, "mfa.enrolled", req.id);
      return { raw: await issueSession(c, u, raw, req), email: u.email, codes };
    });
    void o
      .sendMail(r.email, "", "notice")
      .catch(() => req.log.error("Falha na notificação de MFA"));
    return returnSession(reply, r.raw, r.email, r.codes);
  });
  app.post(prefix + "/auth/mfa/verify", async (req, reply) => {
    const input = z.object({ code }).strict().parse(req.body);
    const { raw, user_id } = await challenge(req, reply);
    const r = await transaction(o.pool, async (c) => {
      const { u } = await readChallenge(c, raw, user_id, "verify");
      if (u.recovery_pending) throw denied();
      await checkFactor(c, u, input.code);
      if (u.state === "invited") {
        await c.query(
          "UPDATE app.platform_privileges SET state='active',version=version+1 WHERE user_id=$1",
          [u.user_id],
        );
        await platformAudit(c, u.user_id, u.user_id, "platform_privilege.activated", req.id);
      }
      return { raw: await issueSession(c, u, raw, req), email: u.email };
    });
    return returnSession(reply, r.raw, r.email);
  });
  app.post(prefix + "/auth/mfa/recovery", async (req, reply) => {
    const input = z
      .object({ recovery_code: z.string().regex(/^[a-f0-9]{32}$/) })
      .strict()
      .parse(req.body);
    const { raw, user_id } = await challenge(req, reply);
    const next = await transaction(o.pool, async (c) => {
      const { u } = await readChallenge(c, raw, user_id, "verify");
      const used = await c.query(
        "UPDATE app.platform_recovery_codes SET used_at=now() WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL RETURNING user_id",
        [user_id, digest(input.recovery_code)],
      );
      if (!used.rowCount) throw denied();
      await c.query("UPDATE app.platform_sessions SET revoked_at=now() WHERE user_id=$1", [
        user_id,
      ]);
      await c.query("UPDATE app.platform_privileges SET recovery_pending=true WHERE user_id=$1", [
        user_id,
      ]);
      await platformAudit(c, user_id, user_id, "mfa.recovered", req.id);
      return issueChallenge(c, u, "enroll");
    });
    return returnChallenge(reply, next, "enroll");
  });
  app.get(prefix + "/auth/me", async (req) =>
    transaction(o.pool, async (c) => {
      const s = await session(req, c);
      return {
        user: { id: s.u.user_id, email: s.u.email },
        csrf_token: csrfFor(s.raw),
        expires_at: s.expires_at,
        reauthenticated_until: s.reauthenticated_until,
        mfa_enabled: true,
      };
    }),
  );
  app.post(prefix + "/auth/reauthenticate", async (req, reply) => {
    const input = z
      .object({ password: z.string().min(1).max(128), code })
      .strict()
      .parse(req.body);
    await limit(req, reply, "reauth:" + req.ip, 20);
    return transaction(o.pool, async (c) => {
      const s = await session(req, c, true);
      if (!(await verifyPassword(input.password, s.u.password_hash))) throw denied();
      await checkFactor(c, s.u, input.code);
      const r = await c.query(
        "UPDATE app.platform_sessions SET reauthenticated_until=now()+interval '5 minutes' WHERE token_hash=$1 RETURNING reauthenticated_until",
        [digest(s.raw)],
      );
      return r.rows[0];
    });
  });
  app.post(prefix + "/auth/logout", async (req, reply) => {
    if (req.cookies[sessionCookie]) {
      try {
        await transaction(o.pool, async (c) => {
          const s = await session(req, c, true);
          await c.query("UPDATE app.platform_sessions SET revoked_at=now() WHERE token_hash=$1", [
            digest(s.raw),
          ]);
          await platformAudit(c, s.u.user_id, s.u.user_id, "platform.logout", req.id);
        });
      } catch (e) {
        if (!(e instanceof HttpError && e.statusCode === 401)) throw e;
      }
    }
    reply.clearCookie(sessionCookie, cookieOptions);
    reply.clearCookie(challengeCookie, cookieOptions);
    return reply.code(204).send();
  });
  app.post(prefix + "/auth/password/forgot", async (req, reply) => {
    const input = z.object({ email }).strict().parse(req.body);
    await limit(req, reply, "forgot-ip:" + req.ip, 20);
    await limit(req, reply, "forgot:" + input.email, 5);
    const raw = token();
    const found = await transaction(o.pool, async (c) => {
      const r = await c.query(
        "SELECT u.id FROM app.users u JOIN app.platform_privileges p ON p.user_id=u.id WHERE u.email=$1 AND u.active AND p.state IN ('active','invited') FOR UPDATE OF u",
        [input.email],
      );
      if (!r.rows[0]) return false;
      await c.query(
        "UPDATE app.password_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
        [r.rows[0].id],
      );
      await c.query(
        "INSERT INTO app.password_tokens(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')",
        [digest(raw), r.rows[0].id],
      );
      await platformAudit(c, r.rows[0].id, r.rows[0].id, "password.reset_requested", req.id);
      return true;
    });
    if (found)
      await o
        .sendMail(input.email, raw, "password")
        .catch(() => req.log.error("Falha no envio de recuperação"));
    reply.code(202);
    return { message: "Se o email estiver cadastrado, enviaremos as instruções de acesso." };
  });
  app.post(prefix + "/auth/password/reset", async (req, reply) => {
    const input = z.object({ token: rawToken, password }).strict().parse(req.body);
    await limit(req, reply, "reset:" + req.ip, 20);
    const hash = await hashPassword(input.password);
    await transaction(o.pool, async (c) => {
      const found = (
        await c.query("SELECT user_id FROM app.password_tokens WHERE token_hash=$1", [
          digest(input.token),
        ])
      ).rows[0];
      if (!found) throw denied();
      const u = await identity(c, found.user_id);
      const r = await c.query(
        "UPDATE app.password_tokens SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() RETURNING user_id",
        [digest(input.token)],
      );
      if (!r.rowCount) throw denied();
      await c.query("UPDATE app.users SET password_hash=$2 WHERE id=$1", [u.user_id, hash]);
      await c.query(
        "UPDATE app.password_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
        [u.user_id],
      );
      await c.query("UPDATE app.sessions SET revoked_at=now() WHERE user_id=$1", [u.user_id]);
      await c.query("UPDATE app.platform_sessions SET revoked_at=now() WHERE user_id=$1", [
        u.user_id,
      ]);
      await c.query("UPDATE app.platform_challenges SET used_at=now() WHERE user_id=$1", [
        u.user_id,
      ]);
      await platformAudit(c, u.user_id, u.user_id, "password.reset", req.id);
    });
    return reply.code(204).send();
  });
  app.post(prefix + "/auth/mfa/reset/accept", async (req, reply) => {
    const input = z
      .object({ token: rawToken, password: z.string().min(1).max(128) })
      .strict()
      .parse(req.body);
    await limit(req, reply, "mfa-reset:" + req.ip, 20);
    const raw = await transaction(o.pool, async (c) => {
      const found = (
        await c.query("SELECT user_id FROM app.platform_mfa_resets WHERE token_hash=$1", [
          digest(input.token),
        ])
      ).rows[0];
      if (!found) throw denied();
      const u = await identity(c, found.user_id);
      if (!(await verifyPassword(input.password, u.password_hash))) throw denied();
      const used = await c.query(
        "UPDATE app.platform_mfa_resets SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() AND auth_version=$2 RETURNING user_id",
        [digest(input.token), u.auth_version],
      );
      if (!used.rowCount) throw denied();
      await platformAudit(c, u.user_id, u.user_id, "mfa.reset_accepted", req.id);
      return issueChallenge(c, u, "enroll");
    });
    return returnChallenge(reply, raw, "enroll");
  });
}
