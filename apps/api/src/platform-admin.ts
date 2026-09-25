import type pg from "pg";
import { transaction } from "./db.js";
import { platformAudit } from "./platform.js";
import { digest, token } from "./security.js";
export async function bootstrapPlatform(pool: pg.Pool, email: string) {
  const raw = token();
  await transaction(pool, async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(730207)");
    if (
      (
        await c.query(
          "SELECT 1 FROM app.platform_bootstrap UNION ALL SELECT 1 FROM app.platform_privileges LIMIT 1",
        )
      ).rowCount
    )
      throw new Error("Bootstrap já realizado; use recuperação.");
    const user = (
      await c.query(
        "INSERT INTO app.users(email) VALUES($1) ON CONFLICT(email) DO UPDATE SET email=EXCLUDED.email RETURNING id,active",
        [email],
      )
    ).rows[0];
    if (!user.active) throw new Error("Identidade bloqueada");
    await c.query("INSERT INTO app.platform_privileges(user_id,state) VALUES($1,'invited')", [
      user.id,
    ]);
    await c.query("INSERT INTO app.platform_bootstrap(user_id) VALUES($1)", [user.id]);
    await c.query(
      "UPDATE app.password_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
      [user.id],
    );
    await c.query(
      "INSERT INTO app.password_tokens(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')",
      [digest(raw), user.id],
    );
    await platformAudit(
      c,
      null,
      user.id,
      "bootstrap.executed",
      undefined,
      "Provisionamento inicial por comando técnico",
    );
  });
  return raw;
}
export async function emergencyMfaReset(pool: pg.Pool, email: string, reason: string) {
  const raw = token();
  await transaction(pool, async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(730207)");
    const u = (
      await c.query(
        "SELECT u.id,u.auth_version FROM app.users u JOIN app.platform_privileges p ON p.user_id=u.id WHERE u.email=$1 AND u.active AND p.state='active' FOR UPDATE OF u,p",
        [email],
      )
    ).rows[0];
    if (!u) throw new Error("Conta indisponível");
    await c.query("UPDATE app.platform_privileges SET recovery_pending=true WHERE user_id=$1", [
      u.id,
    ]);
    await c.query("UPDATE app.platform_sessions SET revoked_at=now() WHERE user_id=$1", [u.id]);
    await c.query("UPDATE app.platform_challenges SET used_at=now() WHERE user_id=$1", [u.id]);
    await c.query("UPDATE app.platform_mfa_resets SET used_at=now() WHERE user_id=$1", [u.id]);
    await c.query(
      "INSERT INTO app.platform_mfa_resets(token_hash,user_id,auth_version,expires_at) VALUES($1,$2,$3,now()+interval '30 minutes')",
      [digest(raw), u.id, u.auth_version],
    );
    await platformAudit(c, null, u.id, "emergency_recovery.requested", undefined, reason);
  });
  return raw;
}
