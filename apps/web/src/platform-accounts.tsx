import { type FormEvent, useEffect, useRef, useState } from "react";
import { useActionConfirmation } from "./platform-dialog";
import { EntityFilter } from "./platform-filter";

type User = {
  id: string;
  email: string;
  active: boolean;
  version: number;
  platform_state: string;
  platform_version?: number;
  mfa_enabled?: boolean;
};
type Membership = {
  organization_id: string;
  name: string;
  status: string;
  active: boolean;
  version: number;
  responsible: boolean;
};
type Invite = { id: string; email: string; status: string; version: number };
async function api<T>(path: string, csrf: string, body?: unknown, key?: string): Promise<T> {
  const r = await fetch("/api/v1/platform" + path, {
    method: body === undefined ? "GET" : "POST",
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
export function Accounts({
  csrf,
  onlySuper = false,
  routeId = "",
}: {
  csrf: string;
  onlySuper?: boolean;
  routeId?: string;
}) {
  const confirmation = useActionConfirmation();
  const [membershipCursor, setMembershipCursor] = useState<string | null>(null),
    [organizationFilter, setOrganizationFilter] = useState(
      new URLSearchParams(location.search).get("organization_id") ?? "",
    ),
    [activeFilter, setActiveFilter] = useState(
      new URLSearchParams(location.search).get("active") ?? "",
    );
  const basePage = onlySuper ? "super-admins" : "pessoas";
  function open(id: string) {
    history.pushState(
      null,
      "",
      "/plataforma/" +
        basePage +
        (id ? "/" + id : "") +
        "?" +
        new URLSearchParams({ q, active: activeFilter, organization_id: organizationFilter }),
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  const [users, setUsers] = useState<User[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [q, setQ] = useState(new URLSearchParams(location.search).get("q") ?? ""),
    [selected, setSelected] = useState<User | null>(null),
    [memberships, setMemberships] = useState<Membership[]>([]),
    [invites, setInvites] = useState<Invite[]>([]),
    [inviteCursor, setInviteCursor] = useState<string | null>(null),
    [recipient, setRecipient] = useState(""),
    [newEmail, setNewEmail] = useState(""),
    [scope, setScope] = useState("all"),
    [org, setOrg] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const key = useRef<{ signature: string; value: string } | null>(null),
    generation = useRef(0),
    listGeneration = useRef(0);
  async function write<T>(path: string, body: unknown) {
    const data = body as Record<string, unknown>;
    const labels: Record<string, string> = {
      status: path.startsWith("/organizations/")
        ? (data.active ? "Reativar" : "Bloquear") +
          " vínculo com " +
          (memberships.find((m) => m.organization_id === path.split("/")[2])?.name ??
            "a organização selecionada")
        : data.active
          ? "Reativar conta em toda a plataforma"
          : "Bloquear conta em toda a plataforma",
      revoke: path.includes("super-admins")
        ? "Revogar privilégio de super admin"
        : "Revogar sessões: " +
          ({
            all: "todos os acessos",
            platform: "painel da plataforma",
            organization: "organização selecionada",
          }[String(data.scope)] ?? String(data.scope)),
      "password-reset": "Enviar redefinição de senha",
      "email-change": "Solicitar mudança de email para " + String(data.new_email),
      "mfa-reset": "Solicitar recuperação de MFA",
      cancel: "Cancelar convite",
      resend: "Reenviar convite",
    };
    const decision = await confirmation.confirm(
      (labels[path.split("/").at(-1)!] ?? "Confirmar convite") +
        " — " +
        (selected?.email ?? recipient),
      "reason" in data,
    );
    if (decision === null) throw new Error("Ação cancelada. Nenhuma alteração enviada.");
    if ("reason" in data) body = { ...data, reason: decision };
    const signature = path + JSON.stringify(body);
    if (key.current?.signature !== signature)
      key.current = { signature, value: crypto.randomUUID() };
    const r = await api<T>(path, csrf, body, key.current.value);
    key.current = null;
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
  async function list(after?: string) {
    const request = ++listGeneration.current;
    if (!after)
      history.replaceState(
        null,
        "",
        location.pathname +
          "?" +
          new URLSearchParams({ q, active: activeFilter, organization_id: organizationFilter }),
      );
    const r = await api<{ items: User[]; next_cursor: string | null }>(
      "/users?" +
        new URLSearchParams({
          q,
          ...(onlySuper ? { platform: "true" } : {}),
          ...(organizationFilter ? { organization_id: organizationFilter } : {}),
          ...(activeFilter ? { active: activeFilter } : {}),
          ...(after ? { cursor: after } : {}),
        }),
      csrf,
    );
    if (request !== listGeneration.current) return;
    setUsers((v) => (after ? [...v, ...r.items] : r.items));
    setCursor(r.next_cursor);
  }
  async function listInvites(after?: string) {
    const r = await api<{ items: Invite[]; next_cursor: string | null }>(
      "/super-admin-invitations" + (after ? "?cursor=" + after : ""),
      csrf,
    );
    setInvites((v) => (after ? [...v, ...r.items] : r.items));
    setInviteCursor(r.next_cursor);
  }
  async function detail(id: string) {
    const request = ++generation.current;
    const r = await api<{
      user: User;
      memberships: Membership[];
      memberships_next_cursor: string | null;
    }>("/users/" + id, csrf);
    if (request !== generation.current) return;
    setSelected(r.user);
    setMemberships(r.memberships);
    setMembershipCursor(r.memberships_next_cursor);
    setNewEmail(r.user.email);
    setOrg(r.memberships[0]?.organization_id ?? "");
  }
  useEffect(() => {
    let live = true;
    const request = ++listGeneration.current;
    setLoading(true);
    Promise.all([
      api<{ items: User[]; next_cursor: string | null }>(
        "/users?" +
          new URLSearchParams({
            q,
            ...(onlySuper ? { platform: "true" } : {}),
            ...(activeFilter ? { active: activeFilter } : {}),
            ...(organizationFilter ? { organization_id: organizationFilter } : {}),
          }),
        csrf,
      ),
      onlySuper
        ? api<{ items: Invite[]; next_cursor: string | null }>("/super-admin-invitations", csrf)
        : Promise.resolve({ items: [], next_cursor: null }),
    ])
      .then(([u, i]) => {
        if (live && request === listGeneration.current) {
          setUsers(u.items);
          setCursor(u.next_cursor);
          setInvites(i.items);
          setInviteCursor(i.next_cursor);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      generation.current++;
    };
  }, [csrf]);
  useEffect(() => {
    if (routeId) void run(() => detail(routeId));
    else setSelected(null);
  }, [routeId]);
  const allowed = !busy;
  return (
    <section className="platform-accounts">
      {confirmation.element}
      <h2>{onlySuper ? "Administradores da plataforma" : "Contas e vínculos"}</h2>
      <p>
        Ações exigem confirmação recente de identidade. Bloqueio global afeta todos os vínculos;
        bloqueio de vínculo afeta somente a organização escolhida.
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
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => list());
            }}
          >
            <label>
              Pesquisar conta por email
              <input value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <label>
              Situação da conta
              <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}>
                <option value="">Todas</option>
                <option value="true">Ativas</option>
                <option value="false">Bloqueadas</option>
              </select>
            </label>
            <EntityFilter
              kind="organizations"
              label="Organização"
              value={organizationFilter}
              onChange={setOrganizationFilter}
            />
            <button disabled={busy}>Pesquisar contas</button>
          </form>
          {loading ? (
            <p role="status">Carregando contas…</p>
          ) : (
            !users.length && <p>Nenhuma conta encontrada.</p>
          )}
          <ul>
            {users.map((u) => (
              <li key={u.id}>
                <button disabled={busy} onClick={() => open(u.id)}>
                  {u.email}
                </button>{" "}
                {u.active ? "Ativa" : "Bloqueada"}
                {u.platform_state !== "none" &&
                  " · Super admin: " +
                    ({ active: "Ativo", invited: "Aguardando MFA", revoked: "Revogado" }[
                      u.platform_state
                    ] ?? u.platform_state)}
              </li>
            ))}
          </ul>
          {cursor && (
            <button disabled={busy} onClick={() => void run(() => list(cursor))}>
              Mais contas
            </button>
          )}
        </>
      )}
      {routeId && <button onClick={() => open("")}>← Voltar às contas</button>}
      {selected && (
        <section>
          <h3>{selected.email}</h3>
          <p>MFA: {selected.mfa_enabled ? "Configurado" : "Não configurado"}</p>
          <button
            disabled={!allowed}
            onClick={() =>
              void run(async () => {
                await write("/users/" + selected.id + "/status", {
                  version: selected.version,
                  active: !selected.active,
                  reason: "",
                });
                await detail(selected.id);
                await list();
                setNotice("Situação da conta atualizada.");
              })
            }
          >
            {selected.active ? "Bloquear conta em toda a plataforma" : "Reativar conta"}
          </button>
          <p>
            Se esta pessoa for responsável, transfira a responsabilidade na seção Organizações antes
            de bloquear. O último administrador não pode ser removido.
          </p>
          <h4>Vínculos organizacionais</h4>
          <ul>
            {memberships.map((m) => (
              <li key={m.organization_id}>
                {m.name} · {m.active ? "Ativo" : "Bloqueado"}
                {m.responsible && " · Responsável"}
                <button
                  disabled={!allowed || m.status === "closed"}
                  onClick={() =>
                    void run(async () => {
                      await write(
                        "/organizations/" +
                          m.organization_id +
                          "/members/" +
                          selected.id +
                          "/status",
                        { version: m.version, active: !m.active, reason: "" },
                      );
                      await detail(selected.id);
                      setNotice("Vínculo atualizado.");
                    })
                  }
                >
                  {m.active ? "Bloquear vínculo" : "Reativar vínculo"}
                </button>
              </li>
            ))}
          </ul>
          {membershipCursor && (
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const r = await api<{ items: Membership[]; next_cursor: string | null }>(
                    "/users/" + selected.id + "/memberships?cursor=" + membershipCursor,
                    csrf,
                  );
                  setMemberships((v) => [...v, ...r.items]);
                  setMembershipCursor(r.next_cursor);
                })
              }
            >
              Mais vínculos
            </button>
          )}
          <h4>Segurança da conta</h4>
          <label>
            Alcance da revogação
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="all">Todas as sessões</option>
              <option value="platform">Somente plataforma</option>
              <option value="organization">Uma organização</option>
            </select>
          </label>
          {scope === "organization" && (
            <label>
              Organização da revogação
              <select value={org} onChange={(e) => setOrg(e.target.value)}>
                {memberships.map((m) => (
                  <option key={m.organization_id} value={m.organization_id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            disabled={!allowed || (scope === "organization" && !org)}
            onClick={() =>
              void run(async () => {
                await write("/users/" + selected.id + "/sessions/revoke", {
                  scope,
                  ...(scope === "organization" ? { organization_id: org } : {}),
                  reason: "",
                });
                setNotice("Sessões revogadas.");
              })
            }
          >
            Revogar sessões
          </button>
          <button
            disabled={!allowed || !selected.active}
            onClick={() =>
              void run(async () => {
                await write("/users/" + selected.id + "/password-reset", { reason: "" });
                setNotice("Recuperação de senha na fila de email.");
              })
            }
          >
            Enviar redefinição de senha
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await write("/users/" + selected.id + "/email-change", {
                  version: selected.version,
                  new_email: newEmail,
                  reason: "",
                });
                setNotice(
                  "Confirmação enviada para o novo email. O acesso atual permanece até o aceite.",
                );
              });
            }}
          >
            <label>
              Novo email de acesso
              <input
                type="email"
                required
                data-draft="true"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </label>
            <button disabled={!allowed || !selected.active || newEmail === selected.email}>
              Solicitar alteração de email
            </button>
          </form>
          {["active", "invited"].includes(selected.platform_state) && (
            <>
              <button
                disabled={!allowed}
                onClick={() =>
                  void run(async () => {
                    await write("/super-admins/" + selected.id + "/revoke", {
                      version: selected.platform_version,
                      reason: "",
                    });
                    await detail(selected.id);
                    await list();
                    setNotice("Privilégio revogado; vínculos organizacionais preservados.");
                  })
                }
              >
                Revogar privilégio de super admin
              </button>
              {selected.platform_state === "active" && (
                <button
                  disabled={!allowed}
                  onClick={() =>
                    void run(async () => {
                      await write("/super-admins/" + selected.id + "/mfa-reset", { reason: "" });
                      setNotice("Recadastro MFA solicitado. Sessões da plataforma revogadas.");
                    })
                  }
                >
                  Solicitar recuperação de MFA
                </button>
              )}
            </>
          )}
        </section>
      )}
      {onlySuper && !routeId && (
        <>
          <h3>Convidar super admin</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await write("/super-admin-invitations", { email: recipient });
                setRecipient("");
                await listInvites();
                setNotice("Convite global na fila. O acesso depende do aceite e do MFA.");
              });
            }}
          >
            <label>
              Email do novo super admin
              <input
                type="email"
                required
                data-draft="true"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              />
            </label>
            <button disabled={busy}>Convidar super admin</button>
          </form>
          <ul>
            {invites.map((i) => (
              <li key={i.id}>
                {i.email} · {i.status}
                {["pending", "expired"].includes(i.status) && (
                  <>
                    <button
                      disabled={!allowed}
                      onClick={() =>
                        void run(async () => {
                          await write("/super-admin-invitations/" + i.id + "/resend", {
                            version: i.version,
                            reason: "",
                          });
                          await listInvites();
                        })
                      }
                    >
                      Reenviar convite global
                    </button>
                    <button
                      disabled={!allowed}
                      onClick={() =>
                        void run(async () => {
                          await write("/super-admin-invitations/" + i.id + "/cancel", {
                            version: i.version,
                            reason: "",
                          });
                          await listInvites();
                        })
                      }
                    >
                      Cancelar convite global
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {inviteCursor && (
            <button disabled={busy} onClick={() => void run(() => listInvites(inviteCursor))}>
              Mais convites globais
            </button>
          )}
        </>
      )}
    </section>
  );
}
export function EmailChange({ token }: { token: string }) {
  const [password, setPassword] = useState(""),
    [done, setDone] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    history.replaceState(null, "", location.pathname);
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/email-change/confirm", "", { token, password });
      setPassword("");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na confirmação.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="platform-shell">
      <section className="platform-card">
        <h1>Confirmar novo email</h1>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {done ? (
          <>
            <p role="status">Email atualizado. Entre novamente com o novo endereço.</p>
            <a href="/">Painel de eventos</a>
            <p>
              <a href="/plataforma">Painel da plataforma</a>
            </p>
          </>
        ) : (
          <form onSubmit={submit}>
            <p>Confirme a senha atual para concluir a alteração solicitada.</p>
            <label>
              Senha atual
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              Confirmar email
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
