import { type FormEvent, useEffect, useRef, useState } from "react";
import { OrganizationMembers } from "./organization-members";
import { HeaderActions } from "./page-header";
import { useActionConfirmation } from "./platform-dialog";
import { AuditPanel } from "./platform-overview";

type Org = {
  id: string;
  name: string;
  status: string;
  version: number;
  contact_email: string;
  contact_phone: string;
  notes: string;
  responsible_user_id: string | null;
  responsible_email?: string;
};
type Invitation = {
  id: string;
  email: string;
  status: string;
  delivery_status: string;
  version: number;
};
type Member = {
  id: string;
  email: string;
  active: boolean;
  user_active: boolean;
};
const labels: Record<string, string> = {
  pending: "Cadastro incompleto",
  active: "Ativa",
  suspended: "Suspensa",
  closed: "Encerrada",
  accepted: "Aceito",
  cancelled: "Cancelado",
  expired: "Expirado",
  sent: "Enviado",
  sending: "Enviando",
  failed: "Falha de envio",
};
async function api<T>(
  path: string,
  csrf: string,
  body?: unknown,
  method = "POST",
  key?: string,
): Promise<T> {
  const r = await fetch("/api/v1/platform" + path, {
    method: body === undefined ? "GET" : method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf,
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message ?? "Não foi possível concluir.");
  return d;
}
export function Organizations({ csrf, routeId = "" }: { csrf: string; routeId?: string }) {
  const confirmation = useActionConfirmation();
  const params = new URLSearchParams(location.search);
  const [tab, setTab] = useState(params.get("aba") ?? "pessoas");
  function go(id: string, nextTab = "pessoas") {
    setNotice("");
    setError("");
    const search = new URLSearchParams({
      q,
      status,
      ...(id ? { aba: nextTab } : {}),
    });
    history.pushState(null, "", "/plataforma/organizacoes" + (id ? "/" + id : "") + "?" + search);
    window.dispatchEvent(new PopStateEvent("popstate"));
    if (location.pathname === "/plataforma/organizacoes" + (id ? "/" + id : "")) setTab(nextTab);
  }

  const [rows, setRows] = useState<Org[]>([]),
    [next, setNext] = useState<string | null>(null),
    [q, setQ] = useState(params.get("q") ?? ""),
    [status, setStatus] = useState(params.get("status") ?? ""),
    [selected, setSelected] = useState<Org | null>(null),
    [creating, setCreating] = useState(false),
    [invitations, setInvitations] = useState<Invitation[]>([]),
    [inviteNext, setInviteNext] = useState<string | null>(null),
    [members, setMembers] = useState<Member[]>([]),
    [running, setRunning] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [ack, setAck] = useState(false),
    [target, setTarget] = useState("suspended"),
    [inviteEmail, setInviteEmail] = useState("");
  const [pageNumber, setPageNumber] = useState(0),
    [pageSize, setPageSize] = useState(10),
    [pageCursors, setPageCursors] = useState<(string | undefined)[]>([undefined]);
  const appliedFilters = useRef({ q: params.get("q") ?? "", status: params.get("status") ?? "" });
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [phone, setPhone] = useState(""),
    [notes, setNotes] = useState("");
  const requestKey = useRef<{ signature: string; key: string } | null>(null),
    generation = useRef(0),
    listGeneration = useRef(0);
  async function write<T>(path: string, body: unknown, method = "POST") {
    const data = body as Record<string, unknown>;
    if ("reason" in data) {
      const action = path.endsWith("/transitions")
        ? "Alterar situação para " + (labels[String(data.to)] ?? data.to)
        : path.endsWith("/responsible")
          ? "Transferir responsabilidade para " +
            (members.find((m) => m.id === data.user_id)?.email ?? "o membro selecionado")
          : path.endsWith("/cancel")
            ? "Cancelar convite"
            : "Criar organização";
      const decision = await confirmation.confirm(
        action +
          " — " +
          (selected?.name ?? name) +
          (path.endsWith("/transitions") ? " (" + running + " prova(s) em andamento)" : ""),
        "reason" in data,
      );
      if (decision === null) throw Error("Ação cancelada. Nenhuma alteração enviada.");
      if ("reason" in data) body = { ...data, reason: decision };
    }

    const signature = method + path + JSON.stringify(body);
    if (requestKey.current?.signature !== signature)
      requestKey.current = { signature, key: crypto.randomUUID() };
    const r = await api<T>(path, csrf, body, method, requestKey.current.key);
    requestKey.current = null;
    window.dispatchEvent(new Event("platform:saved"));
    return r;
  }
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na operação.");
    } finally {
      setBusy(false);
    }
  }
  async function list(cursor?: string, index = 0, filters = { q, status }, size = pageSize) {
    const request = ++listGeneration.current;
    setLoading(true);
    try {
      const r = await api<{ items: Org[]; next_cursor: string | null }>(
        "/organizations?" +
          new URLSearchParams({
            q: filters.q,
            limit: String(size),
            ...(filters.status ? { status: filters.status } : {}),
            ...(cursor ? { cursor } : {}),
          }),
        csrf,
      );
      if (request !== listGeneration.current) return;
      setRows(r.items);
      setNext(r.next_cursor);
      setPageNumber(index);
      setPageSize(size);
      setPageCursors((v) => (index === 0 ? [undefined] : [...v.slice(0, index), cursor]));
      appliedFilters.current = filters;
    } finally {
      if (request === listGeneration.current) setLoading(false);
    }
  }
  async function detail(id: string) {
    const version = ++generation.current;
    const [d, i, m] = await Promise.all([
      api<{ organization: Org; usage: { running_events: number } }>("/organizations/" + id, csrf),
      api<{ items: Invitation[]; next_cursor: string | null }>(
        "/invitations?organization_id=" + id,
        csrf,
      ),
      api<{ items: Member[]; next_cursor: string | null }>(
        "/organizations/" + id + "/members",
        csrf,
      ),
    ]);
    if (version !== generation.current) return;
    setSelected(d.organization);
    setName(d.organization.name);
    setEmail(d.organization.contact_email);
    setPhone(d.organization.contact_phone);
    setNotes(d.organization.notes);
    setInvitations(i.items);
    setInviteNext(i.next_cursor);
    setMembers(m.items);
    setRunning(d.usage.running_events);
    setTarget(
      d.organization.status === "suspended"
        ? "active"
        : d.organization.status === "pending"
          ? "active"
          : "suspended",
    );
    setAck(false);

    setCreating(false);
  }
  useEffect(() => {
    let active = true;
    const request = ++listGeneration.current;
    setLoading(true);
    api<{ items: Org[]; next_cursor: string | null }>(
      "/organizations?" + new URLSearchParams({ q, limit: "10", ...(status ? { status } : {}) }),
      csrf,
    )
      .then((r) => {
        if (active && request === listGeneration.current) {
          setRows(r.items);
          setNext(r.next_cursor);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      generation.current++;
    };
  }, [csrf]);
  useEffect(() => {
    setTab(new URLSearchParams(location.search).get("aba") ?? "pessoas");
    if (routeId && routeId !== "nova") {
      setSelected(null);
      void run(() => detail(routeId));
    } else if (routeId === "nova") newOrg();
    else {
      setSelected(null);
      setCreating(false);
    }
  }, [routeId]);
  function newOrg() {
    generation.current++;
    setNotice("");
    setCreating(true);
    setSelected(null);
    setName("");
    setEmail("");
    setPhone("");
    setNotes("");
    setError("");
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      if (creating) {
        const r = await write<{ organization: Org }>("/organizations", {
          name,
          contact_email: email,
          contact_phone: phone,
          notes,
        });
        go(r.organization.id, "pessoas");
        await detail(r.organization.id);
        setNotice("");
      } else if (selected) {
        await write(
          "/organizations/" + selected.id,
          {
            version: selected.version,
            name,
            contact_email: email,
            contact_phone: phone,
            notes,
          },
          "PATCH",
        );
        await detail(selected.id);
        if (selected.status === "pending" && !selected.responsible_user_id) {
          go(selected.id, "pessoas");
          setNotice("");
        } else setNotice("Cadastro atualizado.");
      }
      await list();
    });
  }
  const wizard = creating || (selected?.status === "pending" && !selected.responsible_user_id);
  return (
    <section className={"platform-orgs" + (wizard ? " organization-wizard" : "")}>
      {confirmation.element}

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!routeId && (
        <section className="organization-directory" aria-label="Lista de organizações">
          <div className="organization-list-toolbar">
            <div>
              <h2>Organizações cadastradas</h2>
              <p>Localize um cadastro ou crie uma nova organização.</p>
            </div>
            <HeaderActions>
              <button className="primary" disabled={busy} onClick={() => go("nova")}>
                Nova organização
              </button>
            </HeaderActions>
          </div>
          <form
            className="organization-search"
            onSubmit={(e) => {
              e.preventDefault();
              history.replaceState(
                null,
                "",
                "/plataforma/organizacoes?" + new URLSearchParams({ q, status }),
              );
              void run(() => list());
            }}
          >
            <label>
              Pesquisar organização
              <input
                type="search"
                maxLength={120}
                placeholder="Digite o nome da organização"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <label>
              Situação
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Todas</option>
                {["pending", "active", "suspended", "closed"].map((v) => (
                  <option key={v} value={v}>
                    {labels[v]}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary" disabled={busy || loading}>
              Pesquisar
            </button>
            <button
              type="button"
              disabled={
                busy ||
                loading ||
                (!q && !status && !appliedFilters.current.q && !appliedFilters.current.status)
              }
              onClick={() => {
                setQ("");
                setStatus("");
                history.replaceState(null, "", "/plataforma/organizacoes");
                void run(() => list(undefined, 0, { q: "", status: "" }));
              }}
            >
              Limpar filtros
            </button>
          </form>
          {loading && <p role="status">Carregando organizações…</p>}
          <table
            className="organization-table"
            aria-label="Organizações cadastradas"
            aria-busy={loading}
          >
            <thead>
              <tr>
                <th scope="col">Organização</th>
                <th scope="col">Contato</th>
                <th scope="col">Responsável</th>
                <th scope="col">Situação</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr
                  key={o.id}
                  className="organization-clickable-row"
                  tabIndex={busy || loading ? -1 : 0}
                  aria-label={"Abrir organização " + o.name}
                  onClick={(e) => {
                    if (
                      !busy &&
                      !loading &&
                      !(e.target as HTMLElement).closest("button,a,input,select")
                    )
                      go(o.id);
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.target === e.currentTarget &&
                      !busy &&
                      !loading &&
                      (e.key === "Enter" || e.key === " ")
                    ) {
                      e.preventDefault();
                      go(o.id);
                    }
                  }}
                >
                  <td data-label="Organização">
                    <button
                      className="organization-name"
                      disabled={busy || loading}
                      onClick={() => go(o.id)}
                      title={o.name}
                    >
                      {o.name}
                    </button>
                  </td>
                  <td data-label="Contato">
                    <span className="organization-cell-text" title={o.contact_email}>
                      {o.contact_email}
                    </span>
                  </td>
                  <td data-label="Responsável">
                    <span className="organization-cell-text" title={o.responsible_email}>
                      {o.responsible_email ?? "A definir"}
                    </span>
                  </td>
                  <td data-label="Situação">
                    <span className={"crm-badge " + o.status}>{labels[o.status]}</span>
                  </td>
                  <td data-label="Ações">
                    <div className="organization-row-actions">
                      <button
                        disabled={busy || loading}
                        aria-label={"Usuários de " + o.name}
                        onClick={() => go(o.id)}
                      >
                        {o.status === "pending" ? "Continuar" : "Usuários"}
                      </button>
                      <button
                        disabled={busy || loading}
                        aria-label={"Editar " + o.name}
                        onClick={() => go(o.id, "cadastro")}
                      >
                        Editar
                      </button>
                      <button
                        disabled={busy || loading}
                        aria-label={"Configurar " + o.name}
                        onClick={() => go(o.id, "configuracoes")}
                      >
                        Configurar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !rows.length && (
            <p className="organization-empty">
              Nenhuma organização encontrada. Ajuste os filtros ou crie um novo cadastro.
            </p>
          )}
          <nav className="organization-pagination" aria-label="Paginação de organizações">
            <label>
              Por página
              <select
                aria-label="Por página"
                value={pageSize}
                disabled={busy || loading}
                onChange={(e) =>
                  void run(() => list(undefined, 0, appliedFilters.current, Number(e.target.value)))
                }
              >
                {[10, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <p role="status">
              Página {pageNumber + 1} · {rows.length} organização(ões)
            </p>
            <div>
              <button
                disabled={busy || loading || pageNumber === 0}
                onClick={() =>
                  void run(() =>
                    list(pageCursors[pageNumber - 1], pageNumber - 1, appliedFilters.current),
                  )
                }
              >
                Anterior
              </button>
              <button
                disabled={busy || loading || !next}
                onClick={() => void run(() => list(next!, pageNumber + 1, appliedFilters.current))}
              >
                Próxima
              </button>
            </div>
          </nav>
        </section>
      )}
      {routeId && (
        <button disabled={busy} onClick={() => go("")}>
          ← Voltar às organizações
        </button>
      )}
      {(creating || selected) && (
        <section className={!wizard ? "organization-detail" : undefined}>
          <div className="organization-detail-heading">
            <h3>{creating ? "Cadastrar organização" : selected?.name}</h3>
            {selected && !wizard && (
              <p className="organization-contact">
                {selected.contact_email}
                {selected.contact_phone ? " · " + selected.contact_phone : ""}
              </p>
            )}
          </div>
          {(creating || (selected?.status === "pending" && !selected.responsible_user_id)) && (
            <ol className="setup-steps" aria-label="Etapas do cadastro">
              <li aria-current={creating || tab === "cadastro" ? "step" : undefined}>
                1. Organização
              </li>
              <li aria-current={!creating && tab !== "cadastro" ? "step" : undefined}>
                2. Usuário e conclusão
              </li>
            </ol>
          )}
          {creating && <p>Informe os dados principais para continuar.</p>}
          {selected && (selected.status !== "pending" || selected.responsible_user_id) && (
            <p>
              {labels[selected.status]} · {running} prova(s) em andamento
            </p>
          )}
          {selected && (
            <details
              className="organization-navigation"
              open={selected.status !== "pending" || !!selected.responsible_user_id}
            >
              <summary hidden={selected.status !== "pending" || !!selected.responsible_user_id}>
                Outras opções da organização
              </summary>
              <nav className="crm-tabs" aria-label="Ficha da organização">
                {[
                  ["pessoas", "Usuários e acessos"],
                  ["cadastro", "Dados da organização"],
                  ["configuracoes", "Configurações"],
                  ["convites", "Convites"],
                  ["historico", "Histórico"],
                ].map(([v, n]) => (
                  <button
                    key={v}
                    aria-current={tab === v ? "page" : undefined}
                    onClick={() => {
                      setTab(v!);
                      history.replaceState(
                        null,
                        "",
                        "/plataforma/organizacoes/" +
                          selected.id +
                          "?" +
                          new URLSearchParams({ q, status, aba: v! }),
                      );
                    }}
                  >
                    {n}
                  </button>
                ))}
              </nav>
            </details>
          )}
          {selected && tab === "resumo" && (
            <div className="crm-summary">
              <h3>Informações da organização</h3>
              <p>
                {selected.contact_email} · {selected.contact_phone || "Telefone não informado"}
              </p>
              <p>{selected.notes || "Sem observações administrativas."}</p>
              <p>
                Responsável:{" "}
                {members.find((m) => m.id === selected.responsible_user_id)?.email ?? "A definir"}
              </p>
              <button
                onClick={() => {
                  setTab("cadastro");
                  const query = new URLSearchParams(location.search);
                  query.set("aba", "cadastro");
                  history.replaceState(null, "", location.pathname + "?" + query);
                }}
              >
                Editar cadastro
              </button>
              <button onClick={() => void run(() => detail(selected.id))}>
                Atualizar situação
              </button>
            </div>
          )}
          {selected && tab === "historico" && <AuditPanel organizationId={selected.id} />}
          <form
            className="organization-data-form"
            data-draft="true"
            hidden={!creating && tab !== "cadastro"}
            onSubmit={save}
          >
            <div className="organization-field-grid">
              <label>
                Nome da organização
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Email de contato
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            </div>
            <details className="organization-optional" open={!!phone || !!notes}>
              <summary>Dados adicionais (opcional)</summary>
              <label>
                Telefone
                <input maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
              <label>
                Observações administrativas
                <textarea
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </details>
            <div className="organization-form-actions">
              <button className="primary" disabled={busy || selected?.status === "closed"}>
                {busy ? "Salvando…" : creating ? "Continuar para o usuário" : "Salvar cadastro"}
              </button>
            </div>
          </form>
          {selected && (
            <>
              <div hidden={tab !== "convites"}>
                <h3>Convites</h3>
                <button disabled={busy} onClick={() => void run(() => detail(selected.id))}>
                  Atualizar situação
                </button>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await write("/invitations", {
                        kind: "organization_admin",
                        organization_id: selected.id,
                        email: inviteEmail,
                      });
                      setInviteEmail("");
                      await detail(selected.id);
                      setNotice("Convite na fila de envio.");
                    });
                  }}
                >
                  <label>
                    Email do administrador convidado
                    <input
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </label>
                  <button disabled={busy || selected.status === "closed"}>Enviar convite</button>
                </form>
                <ul>
                  {invitations.map((i) => (
                    <li key={i.id}>
                      {i.email} — {labels[i.status] ?? i.status} ·{" "}
                      {labels[i.delivery_status] ?? i.delivery_status}
                      {["pending", "expired"].includes(i.status) && (
                        <>
                          <button
                            disabled={busy || selected.status === "closed"}
                            onClick={() =>
                              void run(async () => {
                                await write("/invitations/" + i.id + "/resend", {
                                  version: i.version,
                                });
                                await detail(selected.id);
                              })
                            }
                          >
                            Reenviar
                          </button>
                          <button
                            disabled={busy || selected.status === "closed"}
                            onClick={() =>
                              void run(async () => {
                                await write("/invitations/" + i.id + "/cancel", {
                                  version: i.version,
                                  reason: "",
                                });
                                await detail(selected.id);
                              })
                            }
                          >
                            Cancelar convite
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                {inviteNext && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const r = await api<{
                          items: Invitation[];
                          next_cursor: string | null;
                        }>(
                          "/invitations?organization_id=" + selected.id + "&cursor=" + inviteNext,
                          csrf,
                        );
                        setInvitations((v) => [...v, ...r.items]);
                        setInviteNext(r.next_cursor);
                      })
                    }
                  >
                    Mais convites
                  </button>
                )}
              </div>
              <div
                hidden={
                  tab !== "pessoas" &&
                  tab !== "resumo" &&
                  tab !== "convites" &&
                  tab !== "configuracoes"
                }
              >
                {tab === "pessoas" && (
                  <OrganizationMembers
                    key={selected.id}
                    id={selected.id}
                    setup={selected.status === "pending" && !selected.responsible_user_id}
                    version={selected.version}
                    status={selected.status}
                    responsibleId={selected.responsible_user_id}
                    csrf={csrf}
                    onBack={() => go(selected.id, "cadastro")}
                    onChange={() => detail(selected.id)}
                  />
                )}
                {(tab === "resumo" || tab === "configuracoes") && selected.status !== "closed" && (
                  <section className="crm-sensitive">
                    <h3>Situação da organização</h3>
                    {selected.status === "pending" && !selected.responsible_user_id && (
                      <p>Adicione um usuário responsável acima para poder ativar a organização.</p>
                    )}
                    <label>
                      Próxima situação
                      <select value={target} onChange={(e) => setTarget(e.target.value)}>
                        {(selected.status === "pending"
                          ? ["active", "closed"]
                          : selected.status === "suspended"
                            ? ["active", "closed"]
                            : ["suspended", "closed"]
                        ).map((v) => (
                          <option key={v} value={v}>
                            {labels[v]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p>
                      Suspender ou encerrar revoga os acessos. Registros existentes são preservados.
                      Reativar exige novos acessos de checkpoint.
                    </p>
                    <label>
                      <input
                        type="checkbox"
                        checked={ack}
                        onChange={(e) => setAck(e.target.checked)}
                      />
                      Confirmo a alteração e o impacto nos acessos, inclusive nas provas em
                      andamento.
                    </label>
                    <button
                      disabled={
                        busy || !ack || (target === "active" && !selected.responsible_user_id)
                      }
                      onClick={() =>
                        void run(async () => {
                          await write("/organizations/" + selected.id + "/transitions", {
                            version: selected.version,
                            to: target,
                            reason: "",
                            acknowledge_running_events: ack,
                          });
                          await detail(selected.id);
                          await list();
                          setNotice("Situação atualizada.");
                        })
                      }
                    >
                      {target === "active"
                        ? selected.status === "pending"
                          ? "Ativar organização"
                          : "Reativar organização"
                        : target === "suspended"
                          ? "Suspender organização"
                          : "Encerrar organização"}
                    </button>
                  </section>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </section>
  );
}
export function InvitationAccept({ token, global = false }: { token: string; global?: boolean }) {
  const [info, setInfo] = useState<{
      organization_name: string;
      existing_identity: boolean;
    } | null>(null),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [done, setDone] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    history.replaceState(null, "", location.pathname);
    api<{ organization_name: string; existing_identity: boolean }>(
      (global ? "/super-admin-invitations" : "/invitations") + "/inspect",
      "",
      {
        token,
      },
    )
      .then((r) => {
        if (live) setInfo(r);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [token, global]);
  async function accept(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!info?.existing_identity && password !== confirm)
        throw new Error("As senhas precisam ser iguais.");
      const r = await api<{ organization_status: string }>(
        (global ? "/super-admin-invitations" : "/invitations") + "/accept",
        "",
        {
          token,
          password,
        },
      );
      setDone(r.organization_status);
      setPassword("");
      setConfirm("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no aceite.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="platform-shell">
      <section className="platform-card">
        <h1>{global ? "Convite de super admin" : "Convite de organizador"}</h1>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {done ? (
          <>
            <p role="status">
              Convite aceito.
              {done === "platform"
                ? " Entre na plataforma e conclua a verificação MFA para ativar o privilégio."
                : done === "suspended"
                  ? " A organização continua suspensa até a reativação pela plataforma."
                  : " Você já pode entrar no painel de eventos."}
            </p>
            <a href={global ? "/plataforma" : "/"}>
              {global ? "Continuar com MFA" : "Acessar painel de eventos"}
            </a>
          </>
        ) : info ? (
          <>
            <h2>{info.organization_name}</h2>
            <p>
              {info.existing_identity
                ? "Informe a senha atual da sua conta. Este convite não altera sua senha."
                : "Defina sua senha para ativar o acesso."}
            </p>
            <form onSubmit={accept}>
              <label>
                Senha
                <input
                  type="password"
                  autoComplete={info.existing_identity ? "current-password" : "new-password"}
                  required
                  minLength={info.existing_identity ? 1 : 12}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {!info.existing_identity && (
                <label>
                  Confirmar senha
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </label>
              )}
              <button className="primary" disabled={busy}>
                Aceitar convite
              </button>
            </form>
            <a href="/">Recuperar acesso no painel de eventos</a>
          </>
        ) : (
          !error && <p>Conferindo convite…</p>
        )}
      </section>
    </main>
  );
}
