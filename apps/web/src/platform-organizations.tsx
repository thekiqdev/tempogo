import { type FormEvent, useEffect, useRef, useState } from "react";
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
type Member = { id: string; email: string; active: boolean; user_active: boolean };
const labels: Record<string, string> = {
  pending: "Pendente",
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
  const [tab, setTab] = useState(params.get("aba") ?? "resumo");
  function go(id: string, nextTab = "resumo") {
    const search = new URLSearchParams({ q, status, ...(id ? { aba: nextTab } : {}) });
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
    [memberNext, setMemberNext] = useState<string | null>(null),
    [running, setRunning] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [ack, setAck] = useState(false),
    [target, setTarget] = useState("suspended"),
    [inviteEmail, setInviteEmail] = useState(""),
    [responsible, setResponsible] = useState("");
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [phone, setPhone] = useState(""),
    [notes, setNotes] = useState(""),
    [owner, setOwner] = useState("");
  const requestKey = useRef<{ signature: string; key: string } | null>(null),
    generation = useRef(0),
    listGeneration = useRef(0);
  async function write<T>(path: string, body: unknown, method = "POST") {
    const data = body as Record<string, unknown>;
    if ("reason" in data || (path === "/organizations" && method === "POST")) {
      const action = path.endsWith("/transitions")
        ? "Alterar situação para " + (labels[String(data.to)] ?? data.to)
        : path.endsWith("/responsible")
          ? "Transferir responsabilidade para " +
            (members.find((m) => m.id === data.user_id)?.email ?? "o membro selecionado")
          : path.endsWith("/cancel")
            ? "Cancelar convite"
            : "Criar organização e convidar " + String(data.responsible_email);
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
  async function list(cursor?: string) {
    const request = ++listGeneration.current;
    const r = await api<{ items: Org[]; next_cursor: string | null }>(
      "/organizations?" +
        new URLSearchParams({ q, ...(status ? { status } : {}), ...(cursor ? { cursor } : {}) }),
      csrf,
    );
    if (request !== listGeneration.current) return;
    setRows((v) => (cursor ? [...v, ...r.items] : r.items));
    setNext(r.next_cursor);
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
    setMemberNext(m.next_cursor);
    setRunning(d.usage.running_events);
    setResponsible(d.organization.responsible_user_id ?? "");
    setTarget(
      d.organization.status === "suspended"
        ? "active"
        : d.organization.status === "pending"
          ? "closed"
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
      "/organizations?" + new URLSearchParams({ q, ...(status ? { status } : {}) }),
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
    setTab(new URLSearchParams(location.search).get("aba") ?? "resumo");
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
    setCreating(true);
    setSelected(null);
    setName("");
    setEmail("");
    setPhone("");
    setOwner("");
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
          responsible_email: owner,
        });
        go(r.organization.id, "convites");
        await detail(r.organization.id);
        setNotice("Organização criada. Convite adicionado à fila de envio.");
      } else if (selected) {
        await write(
          "/organizations/" + selected.id,
          { version: selected.version, name, contact_email: email, contact_phone: phone, notes },
          "PATCH",
        );
        await detail(selected.id);
        setNotice("Cadastro atualizado.");
      }
      await list();
    });
  }
  return (
    <section className="platform-orgs">
      {confirmation.element}

      <p>
        Confirme sua identidade antes de criar ou alterar cadastros. A confirmação vale cinco
        minutos.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!routeId && (
        <>
          <form
            className="crm-filters"
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
              <input value={q} onChange={(e) => setQ(e.target.value)} />
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
            <button disabled={busy}>Pesquisar</button>
          </form>
          <button className="primary" disabled={busy} onClick={() => go("nova")}>
            Nova organização
          </button>
          <ul className="platform-org-list">
            {rows.map((o) => (
              <li key={o.id}>
                <button disabled={busy} onClick={() => go(o.id)}>
                  {o.name}
                </button>{" "}
                <span className={"crm-badge " + o.status}>{labels[o.status]}</span>
                <p>{o.contact_email}</p>
                <p className="muted">Responsável: {o.responsible_email ?? "A definir"}</p>
              </li>
            ))}
          </ul>
          {loading ? (
            <p role="status">Carregando organizações…</p>
          ) : (
            !rows.length && <p>Nenhuma organização encontrada.</p>
          )}
          {next && (
            <button disabled={busy} onClick={() => void run(() => list(next))}>
              Mais organizações
            </button>
          )}
        </>
      )}
      {routeId && <button onClick={() => go("")}>← Voltar às organizações</button>}
      {(creating || selected) && (
        <section>
          <h3>{creating ? "Cadastrar organização" : selected?.name}</h3>
          {selected && (
            <p>
              {labels[selected.status]} · {running} prova(s) em andamento
            </p>
          )}
          {selected && (
            <nav className="crm-tabs" aria-label="Ficha da organização">
              {[
                ["resumo", "Resumo"],
                ["cadastro", "Cadastro"],
                ["pessoas", "Pessoas e acessos"],
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
          <form data-draft="true" hidden={!creating && tab !== "cadastro"} onSubmit={save}>
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
            <label>
              Telefone
              <input maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            {creating && (
              <label>
                Email do primeiro responsável
                <input
                  type="email"
                  required
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                />
              </label>
            )}
            <label>
              Observações administrativas
              <textarea maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <button className="primary" disabled={busy || selected?.status === "closed"}>
              {creating ? "Criar e convidar" : "Salvar cadastro"}
            </button>
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
                        const r = await api<{ items: Invitation[]; next_cursor: string | null }>(
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
              <div hidden={tab !== "pessoas" && tab !== "resumo" && tab !== "convites"}>
                <div hidden={tab !== "pessoas"}>
                  <ul className="crm-members">
                    {members.map((m) => (
                      <li key={m.id}>
                        {m.email} · {m.active && m.user_active ? "Ativo" : "Bloqueado"}
                      </li>
                    ))}
                  </ul>
                  <label>
                    Responsável
                    <select value={responsible} onChange={(e) => setResponsible(e.target.value)}>
                      <option value="">Selecione um administrador ativo</option>
                      {members
                        .filter((m) => m.active && m.user_active)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.email}
                          </option>
                        ))}
                    </select>
                  </label>
                  {memberNext && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const r = await api<{ items: Member[]; next_cursor: string | null }>(
                            "/organizations/" + selected.id + "/members?cursor=" + memberNext,
                            csrf,
                          );
                          setMembers((v) => [...v, ...r.items]);
                          setMemberNext(r.next_cursor);
                        })
                      }
                    >
                      Mais administradores
                    </button>
                  )}
                  <button
                    disabled={busy || !responsible || selected.status === "closed"}
                    onClick={() =>
                      void run(async () => {
                        await write("/organizations/" + selected.id + "/responsible", {
                          version: selected.version,
                          user_id: responsible,
                          reason: "",
                        });
                        await detail(selected.id);
                      })
                    }
                  >
                    Alterar responsável
                  </button>
                </div>
                {tab === "resumo" && selected.status !== "closed" && (
                  <details className="crm-sensitive">
                    <summary>Alterar situação da organização</summary>
                    <label>
                      Próxima situação
                      <select value={target} onChange={(e) => setTarget(e.target.value)}>
                        {(selected.status === "pending"
                          ? ["closed"]
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
                      disabled={busy || !ack}
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
                      Confirmar situação
                    </button>
                  </details>
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
