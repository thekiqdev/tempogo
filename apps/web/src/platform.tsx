import { type FormEvent, useEffect, useState } from "react";
import { EmailChange } from "./platform-accounts";
import { InvitationAccept } from "./platform-organizations";
import { PlatformWorkspace } from "./platform-workspace";

type Result = {
  next?: string;
  csrf_token?: string;
  user?: { email: string };
  secret?: string;
  recovery_codes?: string[];
  reauthenticated_until?: string;
  error?: { message: string; code: string };
  message?: string;
};
const initialHash = new URLSearchParams(location.hash.slice(1));
const initialToken = initialHash.get("reset") ?? initialHash.get("mfa-reset") ?? "";
const initialMode = initialHash.has("reset")
  ? "reset"
  : initialHash.has("mfa-reset")
    ? "mfa-reset"
    : "login";
const invitationToken = initialHash.get("invite") ?? initialHash.get("super-invite");
const superInvitation = initialHash.has("super-invite");
const emailChangeToken = initialHash.get("email-change");
export function PlatformApp() {
  if (emailChangeToken) return <EmailChange token={emailChangeToken} />;
  return invitationToken ? (
    <InvitationAccept token={invitationToken} global={superInvitation} />
  ) : (
    <PlatformAuth />
  );
}
function PlatformAuth() {
  const [mode, setMode] = useState(initialMode),
    [csrf, setCsrf] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [code, setCode] = useState(""),
    [secret, setSecret] = useState(""),
    [codes, setCodes] = useState<string[]>([]),
    [user, setUser] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(initialMode === "login");
  async function request(path: string, body?: unknown, token = csrf): Promise<Result> {
    const res = await fetch("/api/v1/platform/auth" + path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        "X-CSRF-Token": token,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data: Result = res.status === 204 ? {} : await res.json();
    if (!res.ok) {
      if (res.status === 401 && user) {
        setUser("");
        setCsrf("");
        setMode("login");
        setCodes([]);
      }
      throw new Error(
        res.status === 404
          ? "O acesso à plataforma ainda não está habilitado neste ambiente."
          : (data.error?.message ?? "Não foi possível concluir a operação."),
      );
    }
    return data;
  }
  useEffect(() => {
    if (initialToken) history.replaceState(null, "", location.pathname);
    let active = true;
    if (initialMode === "login")
      fetch("/api/v1/platform/auth/me", { credentials: "same-origin" })
        .then(async (res) => {
          if (res.ok) {
            const d = await res.json();
            if (active) {
              setUser(d.user.email);
              setCsrf(d.csrf_token);
              setMode("home");
            }
          } else if (res.status !== 401 && active)
            setError(
              res.status === 404
                ? "O acesso à plataforma ainda não está habilitado neste ambiente."
                : "Não foi possível conferir sua sessão.",
            );
        })
        .catch(() => {
          if (active) setError("Não foi possível conectar à plataforma.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    return () => {
      active = false;
    };
  }, []);
  async function proceed(d: Result) {
    setPassword("");
    setConfirm("");
    setCode("");
    setError("");
    if (d.csrf_token) setCsrf(d.csrf_token);
    if (d.user) {
      setUser(d.user.email);
      setSecret("");
      setCodes(d.recovery_codes ?? []);
      setMode("home");
      return;
    }
    if (d.next) {
      setMode(d.next);
      setSecret("");
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "login") await proceed(await request("/login", { email, password }));
      else if (mode === "forgot") {
        const d = await request("/password/forgot", { email });
        setNotice(d.message ?? "Confira seu email.");
      } else if (mode === "reset") {
        if (password !== confirm) throw new Error("As senhas precisam ser iguais.");
        await request("/password/reset", { token: initialToken, password });
        setPassword("");
        setConfirm("");
        setMode("login");
        setNotice("Senha definida. Entre para continuar com o autenticador.");
      } else if (mode === "mfa-reset")
        await proceed(await request("/mfa/reset/accept", { token: initialToken, password }));
      else if (mode === "mfa_enroll") await proceed(await request("/mfa/confirm", { code }));
      else if (mode === "mfa_verify") await proceed(await request("/mfa/verify", { code }));
      else if (mode === "recovery")
        await proceed(await request("/mfa/recovery", { recovery_code: code.trim().toLowerCase() }));
      else if (mode === "reauth") {
        await request("/reauthenticate", { password, code });
        setPassword("");
        setCode("");
        setMode("home");
        setNotice("Identidade confirmada por cinco minutos.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na operação.");
    } finally {
      setBusy(false);
    }
  }
  async function enroll() {
    setBusy(true);
    setError("");
    try {
      const d = await request("/mfa/enroll", {});
      setSecret(d.secret ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na configuração.");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await request("/logout", {});
      setUser("");
      setCodes([]);
      setSecret("");
      setCsrf("");
      setMode("login");
      setNotice("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao sair.");
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <main className="boot">Conferindo acesso à plataforma…</main>;
  return (
    <div className={user && codes.length === 0 ? "platform-authenticated" : "platform-shell"}>
      <header hidden={!!user && codes.length === 0}>
        <a href="/">TempoGo</a>
        <span>Administração da plataforma</span>
      </header>
      <section className="platform-card" hidden={mode === "home" && codes.length === 0}>
        <p className="eyebrow">ACESSO RESTRITO · SUPER ADMIN</p>
        <h1>
          {mode === "home"
            ? "Painel da plataforma"
            : mode === "mfa_enroll"
              ? "Configure seu autenticador"
              : mode === "mfa_verify"
                ? "Verificação em duas etapas"
                : mode === "recovery"
                  ? "Recuperar autenticador"
                  : mode === "forgot"
                    ? "Recuperar senha"
                    : mode === "reset"
                      ? "Defina sua senha"
                      : mode === "mfa-reset"
                        ? "Restabelecer autenticador"
                        : mode === "reauth"
                          ? "Confirme sua identidade"
                          : "Entrar na plataforma"}
        </h1>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {mode === "home" ? (
          <>
            <p>
              Conectado como <strong>{user}</strong>
            </p>
            <p>Autenticação em dois fatores ativa.</p>
            {codes.length > 0 ? (
              <section aria-label="Códigos de recuperação">
                <h2>Guarde seus códigos de recuperação</h2>
                <p>
                  Cada código funciona uma vez. Salve-os em local seguro; não serão exibidos
                  novamente.
                </p>
                <ul className="platform-codes">
                  {codes.map((c) => (
                    <li key={c}>
                      <code>{c}</code>
                    </li>
                  ))}
                </ul>
                <button className="primary" onClick={() => setCodes([])}>
                  Guardei os códigos
                </button>
              </section>
            ) : (
              <>
                <p>Administre as organizações e acompanhe seus convites.</p>
                <button
                  onClick={() => {
                    setMode("reauth");
                    setNotice("");
                  }}
                >
                  Confirmar identidade
                </button>
              </>
            )}
            <button disabled={busy} onClick={logout}>
              Sair da plataforma
            </button>
          </>
        ) : (
          <>
            {mode === "mfa_enroll" && (
              <>
                <p>
                  Adicione uma conta no seu aplicativo autenticador e escolha inserir a chave
                  manualmente.
                </p>
                {secret ? (
                  <p className="platform-secret">
                    <span>Chave do autenticador</span>
                    <code data-testid="totp-secret">{secret}</code>
                  </p>
                ) : (
                  <button disabled={busy} onClick={enroll}>
                    Gerar chave do autenticador
                  </button>
                )}
              </>
            )}
            {mode === "recovery" && (
              <p>
                Informe um código salvo. Você precisará cadastrar um novo autenticador antes de
                acessar o painel.
              </p>
            )}
            <form onSubmit={submit}>
              {["login", "forgot"].includes(mode) && (
                <label>
                  Email
                  <input
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
              )}
              {["login", "reset", "mfa-reset", "reauth"].includes(mode) && (
                <label>
                  Senha
                  <input
                    type="password"
                    autoComplete={mode === "reset" ? "new-password" : "current-password"}
                    required
                    minLength={mode === "reset" ? 12 : 1}
                    maxLength={128}
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
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </label>
              )}
              {["mfa_enroll", "mfa_verify", "reauth", "recovery"].includes(mode) && (
                <label>
                  {mode === "recovery" ? "Código de recuperação" : "Código do autenticador"}
                  <input
                    autoComplete="one-time-code"
                    inputMode={mode === "recovery" ? "text" : "numeric"}
                    required
                    pattern={mode === "recovery" ? "[a-fA-F0-9]{32}" : "[0-9]{6}"}
                    maxLength={mode === "recovery" ? 32 : 6}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </label>
              )}
              <button className="primary" disabled={busy || (mode === "mfa_enroll" && !secret)}>
                {busy ? "Aguarde…" : mode === "forgot" ? "Enviar instruções" : "Continuar"}
              </button>
            </form>
            {mode === "login" && (
              <button
                onClick={() => {
                  setMode("forgot");
                  setError("");
                  setPassword("");
                }}
              >
                Esqueci minha senha
              </button>
            )}
            {mode === "mfa_verify" && (
              <button
                onClick={() => {
                  setMode("recovery");
                  setError("");
                  setCode("");
                }}
              >
                Usar código de recuperação
              </button>
            )}
            {mode !== "login" && (
              <button
                disabled={busy}
                onClick={() => {
                  setMode(user ? "home" : "login");
                  setSecret("");
                  setCode("");
                  setPassword("");
                  setError("");
                  setNotice("");
                }}
              >
                Voltar
              </button>
            )}
          </>
        )}
      </section>
      {user && codes.length === 0 && (
        <div hidden={mode !== "home"}>
          <PlatformWorkspace
            csrf={csrf}
            user={user}
            notice={notice}
            onReauth={() => {
              setMode("reauth");
              setError("");
              setNotice("");
            }}
            onLogout={() => void logout()}
          />
        </div>
      )}
      <p className="platform-foot" hidden={!!user}>
        O acesso dos organizadores continua no painel de eventos.
      </p>
    </div>
  );
}
