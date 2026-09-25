import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { transaction } from "./db.js";
import type { PlatformOptions } from "./platform.js";
import { type PlatformGuard, setOrganization, uuid } from "./platform-management.js";

export function registerOverview(app: FastifyInstance, o: PlatformOptions, guard: PlatformGuard) {
  const base = "/api/v1/platform";
  app.get(base + "/directory/invitations", async (req) => {
    const q = z
      .object({
        q: z.string().max(120).default(""),
        kind: z.enum(["organization_admin", "platform_admin"]).optional(),
        organization_id: uuid.optional(),
        status: z.enum(["pending", "accepted", "cancelled", "expired"]).optional(),
        cursor: uuid.optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
      })
      .strict()
      .parse(req.query);
    return transaction(o.pool, async (c) => {
      await guard(req, c);
      await c.query("SET LOCAL statement_timeout='5s'");
      const rows = (
        await c.query(
          "SELECT i.id,i.email,i.kind,i.organization_id,o.name organization_name,i.version,CASE WHEN i.status='pending' AND i.expires_at<=now() THEN 'expired' ELSE i.status END status,i.expires_at,COALESCE(b.delivery_status,'pending') delivery_status FROM app.organization_invitations i LEFT JOIN app.organizations o ON o.id=i.organization_id LEFT JOIN LATERAL (SELECT delivery_status FROM app.invitation_outbox WHERE invitation_id=i.id ORDER BY created_at DESC,id DESC LIMIT 1) b ON true WHERE i.email ILIKE $1 AND ($2::text IS NULL OR i.kind=$2) AND ($3::text IS NULL OR CASE WHEN i.status='pending' AND i.expires_at<=now() THEN 'expired' ELSE i.status END=$3) AND ($4::uuid IS NULL OR i.id>$4) AND ($6::uuid IS NULL OR i.organization_id=$6) ORDER BY i.id LIMIT $5",
          [
            "%" + q.q + "%",
            q.kind ?? null,
            q.status ?? null,
            q.cursor ?? null,
            q.limit + 1,
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
  app.get(base + "/overview", async (req) =>
    transaction(o.pool, async (c) => {
      await guard(req, c);
      await c.query("SET LOCAL statement_timeout='5s'");
      const organizations = (
        await c.query(
          "SELECT status,count(*)::int count FROM app.organizations GROUP BY status ORDER BY status",
        )
      ).rows;
      const totals = (
        await c.query(
          "SELECT (SELECT count(*)::int FROM app.users) users,(SELECT count(*)::int FROM app.users WHERE active) active_users,(SELECT count(*)::int FROM app.organization_invitations WHERE status='pending' AND expires_at>now()) pending_invitations,(SELECT count(*)::int FROM app.invitation_outbox WHERE delivery_status='failed') failed_invitation_deliveries,(SELECT count(*)::int FROM app.account_outbox WHERE delivery_status='failed') failed_account_deliveries",
        )
      ).rows[0];
      return { organizations, ...totals, as_of: new Date().toISOString() };
    }),
  );
  app.get(base + "/organization-metrics", async (req) => {
    const q = z
      .object({
        cursor: uuid.optional(),
        limit: z.coerce.number().int().min(1).max(25).default(10),
        q: z.string().max(120).default(""),
      })
      .strict()
      .parse(req.query);
    return transaction(o.pool, async (c) => {
      await guard(req, c);
      await c.query("SET LOCAL statement_timeout='3s'");
      const rows = (
        await c.query(
          "SELECT id,name,status FROM app.organizations WHERE ($1::uuid IS NULL OR id>$1) AND name ILIKE '%'||$2||'%' ORDER BY id LIMIT $3",
          [q.cursor ?? null, q.q, q.limit + 1],
        )
      ).rows;
      const items = [];
      for (const org of rows.slice(0, q.limit)) {
        await setOrganization(c, org.id);
        const counts = (
          await c.query(
            "SELECT (SELECT count(*)::int FROM app.events WHERE organization_id=$1) events,(SELECT count(*)::int FROM app.events WHERE organization_id=$1 AND state='running') running_events,(SELECT count(*)::int FROM app.checkpoints WHERE organization_id=$1) checkpoints,(SELECT count(*)::int FROM app.observations WHERE organization_id=$1) observations",
            [org.id],
          )
        ).rows[0];
        items.push({ ...org, ...counts });
      }
      return { items, next_cursor: rows.length > q.limit ? items.at(-1)?.id : null };
    });
  });
  app.get(base + "/audit", async (req) => {
    const q = z
      .object({
        actor_id: uuid.optional(),
        organization_id: uuid.optional(),
        action: z.string().max(120).optional(),
        from: z.string().datetime({ offset: true }).optional(),
        to: z.string().datetime({ offset: true }).optional(),
        cursor: z.string().max(400).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
      })
      .strict()
      .parse(req.query);
    const to = q.to ?? new Date().toISOString(),
      from = q.from ?? new Date(new Date(to).getTime() - 30 * 86400000).toISOString();
    z.number()
      .min(0)
      .max(93 * 86400000)
      .parse(new Date(to).getTime() - new Date(from).getTime());
    let cursor: { at: string; id: string } | undefined;
    if (q.cursor) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(Buffer.from(q.cursor, "base64url").toString());
      } catch {
        parsed = null;
      }
      cursor = z
        .object({ at: z.string().datetime({ offset: true }), id: uuid })
        .strict()
        .parse(parsed);
    }
    return transaction(o.pool, async (c) => {
      await guard(req, c);
      await c.query("SET LOCAL statement_timeout='5s'");
      const rows = (
        await c.query(
          `SELECT a.id,a.actor_id,u.email actor_email,a.target_id,a.organization_id,o.name organization_name,a.resource_id,a.action,a.reason,a.request_id,a.details,a.created_at,to_char(a.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') cursor_at FROM app.platform_audit a LEFT JOIN app.users u ON u.id=a.actor_id LEFT JOIN app.organizations o ON o.id=a.organization_id WHERE a.created_at BETWEEN $1::timestamptz AND $2::timestamptz AND ($3::uuid IS NULL OR a.actor_id=$3) AND ($4::uuid IS NULL OR a.organization_id=$4) AND ($5::text IS NULL OR a.action=$5) AND ($6::timestamptz IS NULL OR (a.created_at,a.id)<($6::timestamptz,$7::uuid)) ORDER BY a.created_at DESC,a.id DESC LIMIT $8`,
          [
            from,
            to,
            q.actor_id ?? null,
            q.organization_id ?? null,
            q.action ?? null,
            cursor?.at ?? null,
            cursor?.id ?? null,
            q.limit + 1,
          ],
        )
      ).rows;
      const items = rows.slice(0, q.limit),
        last = items.at(-1);
      return {
        items: items.map(({ cursor_at, ...r }) => r),
        from,
        to,
        next_cursor:
          rows.length > q.limit && last
            ? Buffer.from(JSON.stringify({ at: last.cursor_at, id: last.id })).toString("base64url")
            : null,
      };
    });
  });
}
