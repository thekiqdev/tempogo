import type pg from "pg";
export async function assertRuntimeRole(pool: pg.Pool) {
  const r = (
    await pool.query<{ rolsuper: boolean; rolbypassrls: boolean; member: boolean }>(
      "SELECT rolsuper,rolbypassrls,pg_has_role(current_user,'cronocheckpoint_app','MEMBER') member FROM pg_roles WHERE rolname=current_user",
    )
  ).rows[0];
  if (!r || r.rolsuper || r.rolbypassrls || !r.member)
    throw new Error(
      "API exige usuário limitado membro de cronocheckpoint_app, sem SUPERUSER/BYPASSRLS",
    );
}

export async function assertPlatformRole(pool: pg.Pool) {
  const r = (
    await pool.query(
      "SELECT rolsuper,rolbypassrls,pg_has_role(current_user,'cronocheckpoint_platform','MEMBER') member,pg_has_role(current_user,'cronocheckpoint_app','MEMBER') tenant FROM pg_roles WHERE rolname=current_user",
    )
  ).rows[0];
  if (!r || r.rolsuper || r.rolbypassrls || !r.member || r.tenant)
    throw new Error("Plataforma exige runtime independente sem SUPERUSER/BYPASSRLS");
}
