import type { FastifyRequest } from "fastify";
import type pg from "pg";
import { digest } from "./security.js";
// Only a live, server-validated field identity gets its own bucket.
// Login and invalid/revoked/expired cookies retain the IP-based limits.
export async function rateKey(req: FastifyRequest, pool?: pg.Pool) {
  const fallback = "ip:" + req.ip;
  if (
    !pool ||
    !req.routeOptions.url?.startsWith("/api/v1/field/") ||
    req.routeOptions.url === "/api/v1/field/login"
  )
    return fallback;
  const raw = req.cookies.cc_checkpoint;
  if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return fallback;
  const result = await pool.query<{ credential_id: string }>(
    `SELECT s.credential_id FROM app.checkpoint_sessions s JOIN app.checkpoint_credentials cr ON cr.id=s.credential_id JOIN app.organizations o ON o.id=s.organization_id
 WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND cr.revoked_at IS NULL AND cr.expires_at>clock_timestamp() AND o.active`,
    [digest(raw)],
  );
  return result.rows[0] ? "field:" + result.rows[0].credential_id : fallback;
}
