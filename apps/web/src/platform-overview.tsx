import { useEffect, useState } from "react";
import { EntityFilter } from "./platform-filter";

type Overview = {
  organizations: { status: string; count: number }[];
  users: number;
  active_users: number;
  pending_invitations: number;
  failed_invitation_deliveries: number;
  failed_account_deliveries: number;
  as_of: string;
};
type Metric = {
  id: string;
  name: string;
  status: string;
  events: number;
  running_events: number;
  checkpoints: number;
  observations: number;
};
type Entry = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  organization_name: string | null;
  action: string;
  created_at: string;
  reason: string | null;
  request_id: string;
  resource_id: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
};
type Page<T> = { items: T[]; next_cursor: string | null; from?: string; to?: string };
const actionLabels: Record<string, string> = {
  "organization.created": "Organização criada",
  "organization.updated": "Cadastro atualizado",
  "organization.active": "Organização reativada",
  "organization.suspended": "Organização suspensa",
  "organization.closed": "Organização encerrada",
  "organization.responsible_changed": "Responsável alterado",
  "management.denied": "Ação administrativa recusada",
  "platform_privilege.activated": "Super admin ativado",
  "platform_privilege.revoked": "Privilégio revogado",
  "user.blocked": "Conta bloqueada",
  "user.reactivated": "Conta reativada",
  "user.email_changed": "Email alterado",
};
const states: Record<string, string> = {
  pending: "Pendentes",
  active: "Ativas",
  suspended: "Suspensas",
  closed: "Encerradas",
};
async function read<T>(path: string): Promise<T> {
  const r = await fetch("/api/v1/platform" + path, { credentials: "same-origin" });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message ?? "Não foi possível consultar.");
  return d;
}
export function OverviewPanel() {
  const [overview, setOverview] = useState<Overview | null>(null),
    [metrics, setMetrics] = useState<Metric[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [q, setQ] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  async function load(after?: string) {
    setBusy(true);
    setError("");
    try {
      const [o, m] = await Promise.all([
        read<Overview>("/overview"),
        read<Page<Metric>>(
          "/organization-metrics?" +
            new URLSearchParams({ q, ...(after ? { cursor: after } : {}) }),
        ),
      ]);
      setOverview(o);
      setMetrics((v) => (after ? [...v, ...m.items] : m.items));
      setCursor(m.next_cursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="platform-overview" id="visao-geral">
      <h2>Resumo da plataforma</h2>
      <p className="crm-quick-links">
        <a href="/plataforma/organizacoes">Gerenciar organizações →</a>{" "}
        <a href="/plataforma/convites">Consultar convites →</a>
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {overview && (
        <>
          <p>Atualizado em {new Date(overview.as_of).toLocaleString("pt-BR")}</p>
          <ul className="platform-totals">
            {Object.entries(states).map(([s, label]) => (
              <li key={s}>
                <a href={"/plataforma/organizacoes?status=" + s}>
                  {label}:{" "}
                  <strong>{overview.organizations.find((o) => o.status === s)?.count ?? 0}</strong>
                </a>
              </li>
            ))}
            <li>
              <a href="/plataforma/pessoas">
                Contas: <strong>{overview.users}</strong> ({overview.active_users} ativas)
              </a>
            </li>
            <li>
              <a href="/plataforma/convites?status=pending">
                Convites pendentes: <strong>{overview.pending_invitations}</strong>
              </a>
            </li>
            <li>
              Falhas históricas de email:{" "}
              <strong>
                {overview.failed_invitation_deliveries + overview.failed_account_deliveries}
              </strong>
            </li>
          </ul>
        </>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          Organização nos indicadores
          <input value={q} maxLength={120} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button disabled={busy}>Atualizar indicadores</button>
      </form>
      <p>
        Contagens por organização, incluindo provas em andamento. Registros individuais permanecem
        no painel do organizador.
      </p>
      {!busy && !metrics.length && <p>Nenhuma organização encontrada.</p>}
      <ul className="platform-metrics">
        {metrics.map((m) => (
          <li key={m.id}>
            <h3>
              <a href={"/plataforma/organizacoes/" + m.id}>{m.name}</a>
            </h3>
            <p>{states[m.status] ?? m.status}</p>
            <p>
              {m.events} eventos · {m.running_events} em andamento · {m.checkpoints} checkpoints ·{" "}
              {m.observations} registros
            </p>
          </li>
        ))}
      </ul>
      {cursor && (
        <button disabled={busy} onClick={() => void load(cursor)}>
          Mais indicadores
        </button>
      )}
      <RecentActivity />
    </section>
  );
}
export function AuditPanel({ organizationId = "" }: { organizationId?: string }) {
  const [entries, setEntries] = useState<Entry[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [actor, setActor] = useState(""),
    [org, setOrg] = useState(organizationId),
    [action, setAction] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState("");
  async function load(after?: string) {
    setBusy(true);
    setError("");
    try {
      let params: URLSearchParams;
      if (after) {
        params = new URLSearchParams(query);
        params.set("cursor", after);
      } else {
        params = new URLSearchParams();
        if (actor) params.set("actor_id", actor);
        if (org) params.set("organization_id", org);
        if (action) params.set("action", action);
        if (from) params.set("from", new Date(from).toISOString());
        if (to) params.set("to", new Date(to).toISOString());
      }
      const r = await read<Page<Entry>>("/audit?" + params);
      if (r.from) params.set("from", r.from);
      if (r.to) params.set("to", r.to);
      params.delete("cursor");
      setQuery(params.toString());
      setEntries((v) => (after ? [...v, ...r.items] : r.items));
      setCursor(r.next_cursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="platform-audit" id="auditoria">
      <h2>Auditoria administrativa</h2>
      <p>
        Consulta somente leitura. Padrão: últimos 30 dias; intervalo máximo de 93 dias. Datas dos
        filtros no horário deste aparelho.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <EntityFilter kind="users" label="Pessoa" value={actor} onChange={setActor} />
        {!organizationId && (
          <EntityFilter kind="organizations" label="Organização" value={org} onChange={setOrg} />
        )}
        <label>
          Ação
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Todas as ações</option>
            {Object.entries(actionLabels).map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Código de ação (opcional)
          <input value={action} maxLength={120} onChange={(e) => setAction(e.target.value)} />
        </label>
        <div className="crm-period-shortcuts" aria-label="Preencher período">
          {[7, 30, 90].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => {
                const end = new Date();
                const start = new Date(end.getTime() - days * 86400000);
                const local = (date: Date) =>
                  new Date(date.getTime() - date.getTimezoneOffset() * 60000)
                    .toISOString()
                    .slice(0, 16);
                setFrom(local(start));
                setTo(local(end));
              }}
            >
              Últimos {days} dias
            </button>
          ))}
        </div>
        <label>
          Início do período
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Fim do período
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button disabled={busy}>Consultar auditoria</button>
      </form>
      {!busy && !entries.length && <p>Nenhuma ação encontrada neste período.</p>}
      <ol>
        {entries.map((e) => (
          <li key={e.id}>
            <strong>{actionLabels[e.action] ?? e.action}</strong>
            <p>
              {new Date(e.created_at).toLocaleString("pt-BR")} ·{" "}
              {e.actor_email ?? e.actor_id ?? "Sistema ou fluxo público"}
              {e.organization_name ? " · " + e.organization_name : ""}
            </p>
            {e.reason && <p>Motivo: {e.reason}</p>}
            <details>
              <summary>Detalhes técnicos</summary>
              <p>Ação: {e.action}</p>
              <p>
                Ator: {e.actor_id ?? "—"}
                <br />
                Recurso: {e.resource_id ?? e.target_id ?? "—"}
                <br />
                Requisição: {e.request_id ?? "—"}
              </p>
              <pre>{JSON.stringify(e.details, null, 2)}</pre>
            </details>
          </li>
        ))}
      </ol>
      {cursor && (
        <button disabled={busy} onClick={() => void load(cursor)}>
          Mais ações
        </button>
      )}
    </section>
  );
}

function RecentActivity() {
  const [rows, setRows] = useState<Entry[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    read<Page<Entry>>("/audit?limit=5")
      .then((r) => {
        if (live) setRows(r.items);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="crm-activity">
      <h2>Atividade recente</h2>
      {loading ? (
        <p>Carregando atividade…</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : rows.length ? (
        <ul>
          {rows.map((r) => (
            <li key={r.id}>
              <strong>{actionLabels[r.action] ?? r.action}</strong>
              <p>
                {r.actor_email ?? "Sistema"} · {new Date(r.created_at).toLocaleString("pt-BR")}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p>Nenhuma atividade nos últimos 30 dias.</p>
      )}
      <a href="/plataforma/auditoria">Abrir histórico completo →</a>
    </section>
  );
}
