import { useEffect, useRef, useState } from "react";
import { useActionConfirmation } from "./platform-dialog";
import { EntityFilter } from "./platform-filter";

type Invitation = {
  id: string;
  email: string;
  kind: string;
  organization_id: string | null;
  organization_name: string | null;
  status: string;
  delivery_status: string;
  version: number;
  expires_at: string;
};
const labels: Record<string, string> = {
  pending: "Pendente",
  expired: "Expirado",
  accepted: "Aceito",
  cancelled: "Cancelado",
  failed: "Falha de envio",
  sending: "Enviando",
  sent: "Enviado",
};
export function InvitationDirectory({ csrf }: { csrf: string }) {
  const [rows, setRows] = useState<Invitation[]>([]),
    [q, setQ] = useState(new URLSearchParams(location.search).get("q") ?? ""),
    [kind, setKind] = useState(new URLSearchParams(location.search).get("kind") ?? ""),
    [status, setStatus] = useState(new URLSearchParams(location.search).get("status") ?? ""),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const confirmation = useActionConfirmation();
  const [organization, setOrganization] = useState(
    new URLSearchParams(location.search).get("organization_id") ?? "",
  );
  const key = useRef<{ signature: string; id: string } | null>(null);
  async function load(after?: string) {
    if (!after)
      history.replaceState(
        null,
        "",
        location.pathname +
          "?" +
          new URLSearchParams({ q, kind, status, organization_id: organization }),
      );
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        "/api/v1/platform/directory/invitations?" +
          new URLSearchParams({
            q,
            ...(kind ? { kind } : {}),
            ...(organization ? { organization_id: organization } : {}),
            ...(status ? { status } : {}),
            ...(after ? { cursor: after } : {}),
          }),
      );
      const d = await r.json();
      if (!r.ok) throw Error(d.error?.message ?? "Falha na consulta");
      setRows((v) => (after ? [...v, ...d.items] : d.items));
      setCursor(d.next_cursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function action(i: Invitation, action: string) {
    const reason = await confirmation.confirm(
      (action === "cancel" ? "Cancelar" : "Reenviar") + " convite de " + i.email,
      true,
    );
    if (reason === null) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body = { version: i.version, reason };
      const path =
        "/api/v1/platform/" +
        (i.kind === "platform_admin" ? "super-admin-invitations" : "invitations") +
        "/" +
        i.id +
        "/" +
        action;
      const signature = path + JSON.stringify(body);
      if (key.current?.signature !== signature)
        key.current = { signature, id: crypto.randomUUID() };
      const r = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
          "Idempotency-Key": key.current.id,
        },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error?.message ?? "Não foi possível concluir");
      key.current = null;
      setNotice(
        action === "cancel"
          ? "Convite cancelado."
          : "Novo convite colocado na fila. O link anterior foi invalidado.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="crm-invitations">
      {confirmation.element}
      <p>
        Gerencie convites de organizações e da plataforma. Situação do convite e entrega do email
        são exibidas separadamente.
      </p>
      <p>Para convidar, abra a ficha da organização ou a área Super admins.</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <form
        className="crm-filters"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          Email do convite
          <input value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label>
          Tipo de convite
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Todos</option>
            <option value="organization_admin">Organização</option>
            <option value="platform_admin">Super admin</option>
          </select>
        </label>
        <label>
          Situação do convite
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todas</option>
            {["pending", "expired", "accepted", "cancelled"].map((v) => (
              <option key={v} value={v}>
                {labels[v]}
              </option>
            ))}
          </select>
        </label>
        <EntityFilter
          kind="organizations"
          label="Organização"
          value={organization}
          onChange={setOrganization}
        />
        <button disabled={busy}>Pesquisar convites</button>
      </form>
      {busy && <p role="status">Atualizando convites…</p>}
      {!busy && !rows.length && <p>Nenhum convite encontrado.</p>}
      <ul className="crm-directory">
        {rows.map((i) => (
          <li key={i.id}>
            <div>
              <strong>{i.email}</strong>
              <p>{i.organization_name ?? "Administração da plataforma"}</p>
              <p>
                {labels[i.status]} · Email: {labels[i.delivery_status] ?? i.delivery_status}
              </p>
              <small>Validade: {new Date(i.expires_at).toLocaleString("pt-BR")}</small>
            </div>
            {["pending", "expired"].includes(i.status) && (
              <div>
                <button disabled={busy} onClick={() => void action(i, "resend")}>
                  Reenviar convite
                </button>
                <button disabled={busy} onClick={() => void action(i, "cancel")}>
                  Cancelar convite
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {cursor && (
        <button disabled={busy} onClick={() => void load(cursor)}>
          Mais convites
        </button>
      )}
    </section>
  );
}
