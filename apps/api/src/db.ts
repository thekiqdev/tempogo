import type pg from "pg";
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function transaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
  organizationId?: string,
) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    if (organizationId) {
      await c.query("SELECT pg_advisory_xact_lock_shared(hashtextextended($1,7303))", [
        organizationId,
      ]);
      const org = await c.query("SELECT active FROM app.organizations WHERE id=$1", [
        organizationId,
      ]);
      if (!org.rows[0]?.active)
        throw new HttpError(
          401,
          "ORGANIZATION_UNAVAILABLE",
          "Organização indisponível. Registros locais preservados.",
        );
      await c.query("SELECT set_config('app.organization_id',$1,true)", [organizationId]);
    }
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function audit(
  c: pg.PoolClient,
  org: string,
  actor: string | null,
  action: string,
  resource: string | null,
  details: unknown = {},
  requestId?: string,
) {
  await c.query(
    "INSERT INTO app.audit_events(organization_id,actor_id,action,resource_id,details,request_id) VALUES($1,$2,$3,$4,$5,$6)",
    [org, actor, action, resource, JSON.stringify(details), requestId ?? null],
  );
}
