import type { Checkpoint as CP, RaceEvent as Race, AdminSession as User } from "@tempogo/contracts";
import { type FormEvent, StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { timezoneLabels } from "./admin-format";
import { api, setCsrf } from "./api";
import { AuditPanel } from "./audit-panel";
import { AccessPanel } from "./capture-admin";
import { CheckpointForm, EventForm } from "./event-forms";
import { EventOverview } from "./event-overview";
import { FieldApp } from "./field";
import { ObservationPanel, ReconciliationPanel } from "./management-panel";
import { PlatformApp } from "./platform";
import { RecoveryPanel } from "./recovery-admin";
import "./style.css";

const states: Record<string, string> = {
  draft: "Rascunho",
  ready: "Pronto",
  running: "Em andamento",
  closed: "Encerrado",
  finalized: "Finalizado",
  archived: "Arquivado",
};
const kinds: Record<string, string> = {
  start: "Largada",
  intermediate: "Intermediário",
  finish: "Chegada",
};
function ErrorMessage({ text }: { text: string }) {
  return text ? (
    <p className="error" role="alert">
      {text}
    </p>
  ) : null;
}
function Brand() {
  return (
    <span className="brand">
      Tempo<span>Go</span>
    </span>
  );
}
function Auth({ onLogin }: { onLogin: (u: User) => void }) {
  const [mode, setMode] = useState(() => (location.hash.startsWith("#reset=") ? "reset" : "login"));
  const [resetToken] = useState(
    () => new URLSearchParams(location.hash.slice(1)).get("reset") ?? "",
  );
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]),
    [org, setOrg] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (location.hash.startsWith("#reset=")) history.replaceState(null, "", location.pathname);
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "login") {
        const result = await api<User | { organizations: { id: string; name: string }[] }>(
          "/auth/admin/login",
          "POST",
          { email, password, ...(org ? { organization_id: org } : {}) },
        );
        if ("organizations" in result) {
          setOrganizations(result.organizations);
          setOrg(result.organizations[0]?.id ?? "");
        } else {
          setCsrf(result.csrf_token);
          onLogin(result);
        }
      } else if (mode === "forgot") {
        const r = await api<{ message: string }>("/auth/password/forgot", "POST", { email });
        setNotice(r.message);
      } else {
        if (password !== confirm) throw new Error("As senhas devem ser iguais.");
        const r = await api<{ message: string }>("/auth/password/reset", "POST", {
          token: resetToken,
          password,
        });
        setMode("login");
        setPassword("");
        setNotice(r.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha de acesso");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-layout">
      <aside className="login-story">
        <Brand />
        <div>
          <p className="eyebrow">CORRIDAS DE RUA</p>
          <h1>
            Uma prova.
            <br />
            Todos os pontos
            <br />
            sob seu controle.
          </h1>
          <p>Prepare o percurso, organize os checkpoints e deixe tudo pronto para a equipe.</p>
        </div>
        <span className="login-foot">TempoGo · Administração de provas</span>
      </aside>
      <main className="login-panel">
        <div className="auth-card">
          <p className="eyebrow">ACESSO DO ORGANIZADOR</p>
          <h2>
            {mode === "login"
              ? "Bem-vindo de volta"
              : mode === "forgot"
                ? "Recuperar acesso"
                : "Definir nova senha"}
          </h2>
          <p className="muted">
            {mode === "login"
              ? "Entre para preparar a sua próxima corrida."
              : mode === "forgot"
                ? "Enviaremos um link de uso único para seu email."
                : "Escolha uma senha com pelo menos 12 caracteres."}
          </p>
          <form onSubmit={submit}>
            {mode !== "reset" && (
              <label>
                Email
                <input
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            )}
            {mode !== "forgot" && (
              <label>
                Senha
                <input
                  type="password"
                  required
                  minLength={mode === "reset" ? 12 : 1}
                  maxLength={128}
                  autoComplete={mode === "reset" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            {mode === "reset" && (
              <label>
                Confirmar senha
                <input
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
            )}
            {organizations.length > 0 && mode === "login" && (
              <label>
                Organização
                <select value={org} onChange={(e) => setOrg(e.target.value)}>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <ErrorMessage text={error} />
            {notice && (
              <p className="success" role="status">
                {notice}
              </p>
            )}
            <button className="primary full" disabled={busy}>
              {busy
                ? "Aguarde…"
                : mode === "login"
                  ? "Entrar na organização"
                  : mode === "forgot"
                    ? "Enviar instruções"
                    : "Salvar nova senha"}
            </button>
          </form>
          <button
            className="text-button"
            onClick={() => {
              setMode(mode === "login" ? "forgot" : "login");
              setError("");
              setNotice("");
            }}
          >
            {mode === "login" ? "Esqueci minha senha" : "Voltar para o login"}
          </button>
        </div>
      </main>
    </div>
  );
}
function Detail({
  race,
  onReload,
  onBack,
}: {
  race: Race;
  onReload: () => Promise<void>;
  onBack: () => void;
}) {
  const [points, setPoints] = useState<CP[]>([]),
    [tab, setTab] = useState("summary"),
    [pointsLoading, setPointsLoading] = useState(true),
    [pointsError, setPointsError] = useState(""),
    [edit, setEdit] = useState(false),
    [cpEdit, setCpEdit] = useState<CP | "new" | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const choices: Record<string, string[]> = {
    draft: ["ready"],
    ready: ["running", "draft"],
    running: ["closed"],
    closed: ["running", "finalized"],
    finalized: ["closed"],
  };
  async function load() {
    const p = await api<{ items: CP[] }>("/events/" + race.id + "/checkpoints");
    setPoints(p.items);
    setPointsError("");
    setPointsLoading(false);
  }
  useEffect(() => {
    setPointsLoading(true);
    load().catch((e) => {
      setPointsError(e.message);
      setPointsLoading(false);
    });
  }, [race.id, race.version]);
  async function change(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const target = String(f.get("target_state"));
    try {
      await api("/events/" + race.id + "/transitions", "POST", {
        target_state: target,
        expected_version: race.version,
        reason: f.get("reason"),
        ...(target === "finalized" && f.get("exception_reason")
          ? { exception_reason: f.get("exception_reason") }
          : {}),
        ...(target === "running" && race.state === "ready"
          ? { gun_start_at: new Date(String(f.get("gun_start_at"))).toISOString() }
          : {}),
      });
      await onReload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function navigate(value: string) {
    setTab(value);
    setError("");
    window.scrollTo(0, 0);
  }
  if (pointsError)
    return (
      <section className="panel">
        <button className="text-button" onClick={onBack}>
          ← Todos os eventos
        </button>
        <h2>Não foi possível carregar o percurso</h2>
        <ErrorMessage text={pointsError} />
        <button
          className="primary"
          disabled={pointsLoading}
          onClick={async () => {
            setPointsLoading(true);
            try {
              await load();
            } catch (e) {
              setPointsError((e as Error).message);
            } finally {
              setPointsLoading(false);
            }
          }}
        >
          {pointsLoading ? "Carregando…" : "Tentar novamente"}
        </button>
      </section>
    );
  if (cpEdit)
    return (
      <div className="focused-editor">
        <CheckpointForm
          key={typeof cpEdit === "string" ? "new" : cpEdit.id}
          checkpoint={typeof cpEdit === "string" ? undefined : cpEdit}
          eventId={race.id}
          points={points}
          next={Math.max(0, ...points.map((p) => p.sequence)) + 1}
          onSaved={async () => {
            await onReload();
            await load();
            setCpEdit(null);
            setTab("checkpoints");
          }}
          onCancel={() => setCpEdit(null)}
        />{" "}
      </div>
    );
  if (edit)
    return (
      <div className="focused-editor">
        <EventForm
          race={race}
          onSave={async () => {
            await onReload();
            setEdit(false);
          }}
          onCancel={() => setEdit(false)}
        />
      </div>
    );
  return (
    <>
      <button className="text-button back" onClick={onBack}>
        ← Todos os eventos
      </button>
      <div className="page-title event-heading">
        <div>
          <p className="eyebrow">
            {race.category_name} ·{" "}
            {race.distance_m ? race.distance_m / 1000 + " km" : "Distância não informada"}
          </p>
          <h1>{race.name}</h1>
          <p className="muted">
            {race.local_date.split("-").reverse().join("/")} ·{" "}
            {race.location || "Local não informado"}
          </p>
        </div>
        <span className={"badge " + race.state}>{states[race.state]}</span>
      </div>
      <ErrorMessage text={error} />
      <nav className="tabs admin-desktop-tabs" aria-label="Detalhes do evento">
        {[
          ["summary", "Resumo"],
          ["checkpoints", "Checkpoints"],
          ["settings", "Configuração"],
          ["access", "Acessos"],
          ["observations", "Passagens"],
          ["recovery", "Recuperação"],
          ["audit", "Histórico"],
        ].map(([v, n]) => (
          <button
            type="button"
            key={v}
            className={tab === v ? "active" : ""}
            onClick={() => navigate(v ?? "summary")}
          >
            {n}
          </button>
        ))}
      </nav>
      {tab === "summary" && (
        <EventOverview
          race={race}
          points={points}
          loading={pointsLoading}
          onNavigate={navigate}
          onAdd={() => {
            setTab("checkpoints");
            setCpEdit("new");
          }}
        />
      )}
      {tab === "more" && (
        <section className="admin-more">
          <h2>Mais opções</h2>
          <p className="muted">Encontre as ferramentas da sua prova.</p>
          {[
            ["observations", "Passagens", "Consultar, revisar e exportar registros"],
            ["settings", "Configuração", "Dados, início e encerramento da prova"],
            ["recovery", "Recuperação", "Aparelhos e recuperação de registros"],
            ["audit", "Histórico", "Quem alterou o quê na sua prova"],
          ].map(([value, label, help]) => (
            <button key={value} onClick={() => navigate(value ?? "summary")}>
              <span>
                <strong>{label}</strong>
                <small>{help}</small>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
        </section>
      )}
      <nav className="admin-mobile-nav" aria-label="Navegação do evento">
        {[
          ["summary", "Resumo", "▦"],
          ["checkpoints", "Percurso", "↗"],
          ["access", "Equipe", "♧"],
          ["more", "Mais", "•••"],
        ].map(([value, label, icon]) => (
          <button
            key={value}
            aria-current={
              tab === value ||
              (value === "more" && ["settings", "observations", "recovery", "audit"].includes(tab))
                ? "page"
                : undefined
            }
            onClick={() => navigate(value ?? "summary")}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </button>
        ))}
      </nav>

      {tab === "checkpoints" && (
        <>
          <div className="section-title">
            <h3>
              Pontos do percurso <span className="count">{points.length}</span>
            </h3>
            {race.state === "draft" && (
              <button className="primary" onClick={() => setCpEdit("new")}>
                + Adicionar checkpoint
              </button>
            )}
          </div>
          <p className="section-intro">
            Cada checkpoint é um ponto de registro. Organize os pontos na ordem em que os corredores
            passam por eles.
          </p>
          {race.state !== "draft" && (
            <p className="next-hint">
              Percurso disponível para consulta. A edição é permitida enquanto a prova está em
              rascunho.
            </p>
          )}
          {pointsLoading ? (
            <p role="status">Carregando percurso…</p>
          ) : points.length === 0 ? (
            <div className="empty">
              <span className="empty-marker">01</span>
              <h3>Defina o primeiro ponto da prova</h3>
              <p>Adicione largada, pontos intermediários e chegada na ordem do percurso.</p>
            </div>
          ) : (
            <div className="checkpoint-list">
              {points.map((p) => (
                <article className="checkpoint" key={p.id}>
                  <span className="point-number">{String(p.sequence).padStart(2, "0")}</span>
                  <div>
                    <h3>{p.name}</h3>
                    <p>
                      {kinds[p.kind]} ·{" "}
                      {p.distance_m === null
                        ? "Distância não informada"
                        : p.distance_m / 1000 + " km"}{" "}
                      · {p.active ? "Ativo" : "Inativo"}
                    </p>
                  </div>
                  {race.state === "draft" && (
                    <button className="secondary" onClick={() => setCpEdit(p)}>
                      Editar
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
          <p className="footnote">
            Depois do percurso, configure um acesso para cada aparelho da equipe.
          </p>
          <button className="secondary full" onClick={() => navigate("access")}>
            Continuar para a equipe →
          </button>
        </>
      )}
      {tab === "access" &&
        (pointsLoading ? (
          <p role="status">Carregando equipe…</p>
        ) : points.length ? (
          <AccessPanel points={points} />
        ) : (
          <section className="empty">
            <h2>Primeiro, crie um ponto do percurso</h2>
            <p>O acesso de cada aparelho precisa estar ligado a um checkpoint.</p>
            <button
              className="primary"
              onClick={() => {
                setTab("checkpoints");
                setCpEdit("new");
              }}
            >
              + Adicionar checkpoint
            </button>
          </section>
        ))}
      {tab === "observations" && <ObservationPanel eventId={race.id} points={points} />}
      {tab === "recovery" && <RecoveryPanel eventId={race.id} />}
      {tab === "settings" && (
        <>
          {edit ? (
            <EventForm
              race={race}
              onSave={async () => {
                setEdit(false);
                await onReload();
              }}
              onCancel={() => setEdit(false)}
            />
          ) : (
            <section className="panel">
              <div className="section-title">
                <h3>Dados e operação</h3>
                {race.state === "draft" && (
                  <button className="secondary" onClick={() => setEdit(true)}>
                    Editar dados
                  </button>
                )}
              </div>
              <dl className="review-summary">
                <div>
                  <dt>Data</dt>
                  <dd>{race.local_date.split("-").reverse().join("/")}</dd>
                </div>
                <div>
                  <dt>Local</dt>
                  <dd>{race.location || "Não informado"}</dd>
                </div>
                <div>
                  <dt>Fuso horário</dt>
                  <dd>{timezoneLabels[race.timezone] ?? race.timezone}</dd>
                </div>
                <div>
                  <dt>Modalidade</dt>
                  <dd>
                    {race.category_name} ·{" "}
                    {race.distance_m == null
                      ? "Distância não informada"
                      : race.distance_m / 1000 + " km"}
                  </dd>
                </div>
              </dl>
              <p className="muted">
                Os dados e o percurso podem ser editados enquanto a prova está em rascunho.
              </p>
              {race.gun_start_at && (
                <p>
                  Largada:{" "}
                  {new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "medium",
                    timeZone: race.timezone,
                  }).format(new Date(race.gun_start_at))}
                </p>
              )}
              {(choices[race.state]?.length ?? 0) > 0 && (
                <form key={race.state} className="transition" onSubmit={change}>
                  <h3>Próxima ação da prova</h3>
                  <p className="field-help">
                    Preparar libera a conferência da operação. Iniciar habilita a coleta; encerrar
                    interrompe novos registros. Finalize após revisar e conciliar.
                  </p>
                  <label>
                    Próximo estado
                    <select aria-label="Próximo estado" name="target_state">
                      {choices[race.state]?.map((s) => (
                        <option key={s} value={s}>
                          {states[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {race.state === "ready" && (
                    <label>
                      Horário real da largada (fuso deste aparelho)
                      <input
                        type="datetime-local"
                        name="gun_start_at"
                        step="1"
                        defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
                          .toISOString()
                          .slice(0, 19)}
                      />
                    </label>
                  )}
                  <label>
                    Motivo
                    <textarea
                      name="reason"
                      required
                      minLength={3}
                      maxLength={500}
                      placeholder="Descreva a alteração para o histórico"
                    />
                  </label>
                  {race.state === "closed" && (
                    <label>
                      Exceção de conciliação (opcional; mínimo 10 caracteres)
                      <textarea
                        name="exception_reason"
                        minLength={10}
                        maxLength={500}
                        placeholder="Justifique aparelhos não conciliados apenas ao finalizar"
                      />
                    </label>
                  )}
                  <button className="primary" disabled={busy}>
                    {busy ? "Atualizando…" : "Confirmar alteração"}
                  </button>
                </form>
              )}
              <p className="footnote">
                Finalizar exige resolver revisões e conciliar aparelhos ou justificar uma exceção.
                Reabrir retorna à coleta fechada para nova conferência.
              </p>
            </section>
          )}
        </>
      )}
      {tab === "settings" && (
        <ReconciliationPanel eventId={race.id} version={race.version} state={race.state} />
      )}
      {tab === "audit" && <AuditPanel eventId={race.id} />}
    </>
  );
}
function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [events, setEvents] = useState<Race[]>([]),
    [selected, setSelected] = useState<Race | null>(null),
    [create, setCreate] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [offset, setOffset] = useState(0);
  async function refresh() {
    const r = await api<{ items: Race[] }>("/events?limit=20&offset=" + offset);
    setEvents(r.items);
  }
  useEffect(() => {
    setLoading(true);
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [offset]);
  async function open(id: string, propagate = false) {
    setError("");
    try {
      setSelected(await api<Race>("/events/" + id));
      setCreate(false);
    } catch (e) {
      setError((e as Error).message);
      if (propagate) throw e;
    }
  }
  return (
    <div className={"workspace admin-workspace" + (selected ? " has-event" : "")}>
      <aside className="sidebar">
        <Brand />
        <div className="org">
          <span>ORGANIZAÇÃO</span>
          <strong>{user.organization.name}</strong>
        </div>
        <button
          className="side-link"
          onClick={() => {
            setSelected(null);
            setCreate(false);
            refresh().catch((e) => setError(e.message));
          }}
        >
          ◉ Eventos
        </button>
        <details className="sidebar-bottom">
          <summary>Minha conta</summary>
          <span>{user.user.email}</span>
          <button
            onClick={async () => {
              try {
                await api("/auth/logout", "POST");
                onLogout();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Sair da conta ↗
          </button>
        </details>
      </aside>
      <main className="content">
        <header className="topbar">
          <span>Painel do organizador</span>
          <span>Organize sua prova</span>
        </header>
        <div className="page">
          <ErrorMessage text={error} />
          {create ? (
            <>
              <div className="page-title">
                <div>
                  <p className="eyebrow">PREPARAÇÃO DA PROVA</p>
                  <h1>Novo evento</h1>
                </div>
              </div>
              <EventForm
                onSave={async (id) => {
                  await refresh();
                  await open(id, true);
                }}
                onCancel={() => setCreate(false)}
              />
            </>
          ) : selected ? (
            <Detail
              key={selected.id}
              race={selected}
              onReload={async () => {
                await open(selected.id, true);
                await refresh();
              }}
              onBack={() => {
                setSelected(null);
                refresh().catch((e) => setError(e.message));
              }}
            />
          ) : (
            <>
              <div className="page-title">
                <div>
                  <p className="eyebrow">SUA OPERAÇÃO COMEÇA AQUI</p>
                  <h1>Eventos</h1>
                  <p className="muted">Prepare cada etapa da sua próxima corrida.</p>
                </div>
                <button className="primary" onClick={() => setCreate(true)}>
                  + Novo evento
                </button>
              </div>
              {loading ? (
                <p role="status">Carregando eventos…</p>
              ) : events.length === 0 ? (
                <section className="empty">
                  <span className="empty-marker">01</span>
                  <h2>Sua próxima prova começa aqui</h2>
                  <p>Cadastre o evento e organize os checkpoints do percurso.</p>
                  <button className="primary" onClick={() => setCreate(true)}>
                    Criar primeiro evento
                  </button>
                </section>
              ) : (
                <div className="events-list">
                  {events.map((e) => (
                    <button className="event-row" key={e.id} onClick={() => open(e.id)}>
                      <div className="date-tile">
                        <strong>{e.local_date.slice(8)}</strong>
                        <span>
                          {new Date(e.local_date + "T12:00:00")
                            .toLocaleDateString("pt-BR", { month: "short" })
                            .replace(".", "")}
                        </span>
                      </div>
                      <div className="event-info">
                        <h3>{e.name}</h3>
                        <p>
                          {e.location || "Local não informado"} ·{" "}
                          {e.distance_m ? e.distance_m / 1000 + " km" : e.category_name}
                        </p>
                      </div>
                      <span className={"badge " + e.state}>{states[e.state]}</span>
                      <span className="arrow">↗</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="pagination">
                <button
                  className="secondary"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - 20))}
                >
                  Anterior
                </button>
                <span>Página {offset / 20 + 1}</span>
                <button
                  className="secondary"
                  disabled={events.length < 20}
                  onClick={() => setOffset(offset + 20)}
                >
                  Próxima
                </button>
              </div>
              <p className="footnote">
                Cada evento pertence à sua organização. Alterações ficam registradas no histórico.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
function App() {
  const [resetting] = useState(() => location.hash.startsWith("#reset="));
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const expired = () => {
      setUser(null);
      setCsrf("");
    };
    window.addEventListener("session-expired", expired);
    if (resetting) {
      setLoading(false);
      return () => window.removeEventListener("session-expired", expired);
    }
    api<User>("/auth/me")
      .then((u) => {
        setCsrf(u.csrf_token);
        setUser(u);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  if (loading)
    return (
      <div className="boot" role="status">
        Carregando TempoGo…
      </div>
    );
  return user ? (
    <Dashboard
      user={user}
      onLogout={() => {
        setUser(null);
        setCsrf("");
      }}
    />
  ) : (
    <Auth onLogin={setUser} />
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Elemento raiz ausente");
createRoot(root).render(
  <StrictMode>
    {location.pathname.startsWith("/plataforma") ? (
      <PlatformApp />
    ) : location.pathname === "/checkpoint" ? (
      <FieldApp />
    ) : (
      <App />
    )}
  </StrictMode>,
);
