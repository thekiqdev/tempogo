import { type FormEvent, useEffect, useRef, useState } from "react";
import { useActionConfirmation } from "./platform-dialog";
import { PlatformSheet } from "./platform-sheet";

type Member = {
  id: string;
  email: string;
  active: boolean;
  user_active: boolean;
  version: number;
  user_version: number;
  must_change_password: boolean;
  is_superadmin: boolean;
};
export function OrganizationMembers({
  id,
  version,
  status,
  responsibleId,
  csrf,
  onChange,
  setup = false,
  onBack,
}: {
  setup?: boolean;
  onBack?: () => void;
  id: string;
  version: number;
  status: string;
  responsibleId: string | null;
  csrf: string;
  onChange: () => Promise<void>;
}) {
  const [items, setItems] = useState<Member[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [q, setQ] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Member | "new" | null>(setup ? "new" : null),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [mode, setMode] = useState("create"),
    [show, setShow] = useState(false);
  const [emailTarget, setEmailTarget] = useState<Member | null>(null),
    [newEmail, setNewEmail] = useState("");
  const confirmation = useActionConfirmation();
  const pending = useRef<{ signature: string; key: string } | null>(null);
  async function request<T>(path: string, body?: unknown) {
    const signature = path + JSON.stringify(body);
    if (body !== undefined && pending.current?.signature !== signature)
      pending.current = { signature, key: crypto.randomUUID() };
    const r = await fetch("/api/v1/platform" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
        ...(body === undefined ? {} : { "Idempotency-Key": pending.current!.key }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error?.message ?? "Não foi possível concluir.");
    if (body !== undefined) pending.current = null;
    return d as T;
  }
  async function load(next?: string) {
    const r = await request<{ items: Member[]; next_cursor: string | null }>(
      "/organizations/" +
        id +
        "/members?" +
        new URLSearchParams({ q, ...(next ? { cursor: next } : {}) }),
    );
    setItems((v) => (next ? [...v, ...r.items] : r.items));
    setCursor(r.next_cursor);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [id, version]);
  async function action(path: string, body: Record<string, unknown>, label: string) {
    const decision = await confirmation.confirm(label, true);
    if (decision === null) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(path, { ...body, ...("reason" in body ? { reason: decision } : {}) });
      window.dispatchEvent(new Event("platform:saved"));
      await onChange();
      await load();
      setNotice(
        path.endsWith("/email-change")
          ? "Confirmação enviada para o novo email."
          : "Alteração concluída.",
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function open(m: Member | "new") {
    setEditing(m);
    setEmail("");
    setPassword("");
    setConfirm("");
    setShow(false);
    setError("");
    setMode("create");
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if ((editing !== "new" || mode === "create") && password !== confirm) {
      setError("As senhas devem ser iguais.");
      return;
    }
    if (
      editing !== "new" &&
      (await confirmation.confirm(
        "Esta senha vale para todas as organizações da conta e encerrará suas sessões. Continuar?",
        false,
      )) === null
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (editing === "new")
        await request("/organizations/" + id + "/members", {
          email,
          mode,
          ...(mode === "create" ? { password } : {}),
          version,
          complete_setup: setup,
        });
      else if (editing)
        await request("/organizations/" + id + "/members/" + editing.id + "/password", {
          password,
          version: editing.user_version,
          confirm_global: true,
        });
      setEditing(null);
      setPassword("");
      setConfirm("");
      window.dispatchEvent(new Event("platform:saved"));
      await onChange();
      await load();
      setNotice(
        setup
          ? "Organização ativa! O responsável já pode entrar com a senha temporária."
          : "Acesso atualizado. Senhas novas devem ser trocadas no primeiro login.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function closeEditor() {
    if (
      (email || password || confirm || newEmail) &&
      (await confirmation.confirm("Descartar este preenchimento?", false)) === null
    )
      return;
    setEditing(null);
    setEmailTarget(null);
    setEmail("");
    setPassword("");
    setConfirm("");
    setNewEmail("");
    setError("");
    window.dispatchEvent(new Event("platform:saved"));
  }
  const editorTitle =
    editing === "new"
      ? setup
        ? "Etapa 2: criar o responsável"
        : "Adicionar usuário"
      : "Redefinir senha";
  const setupHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (setup) {
      setupHeading.current?.focus({ preventScroll: true });
      document.querySelector(".organization-wizard")?.scrollIntoView({ block: "start" });
    }
  }, [setup]);
  async function backToOrganization() {
    if (
      (email || password || confirm) &&
      (await confirmation.confirm(
        "Voltar aos dados e descartar o preenchimento do usuário?",
        false,
      )) === null
    )
      return;
    window.dispatchEvent(new Event("platform:saved"));
    onBack?.();
  }
  const editor = editing ? (
    <>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <form className="guided-form" data-draft="true" onSubmit={save}>
        <div className="guided-body">
          {!setup && (
            <h3>
              {editing === "new" ? "Adicionar acesso" : "Redefinir senha de " + editing.email}
            </h3>
          )}
          {editing === "new" && (
            <>
              <label>
                Tipo de acesso
                <select
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value);
                    setPassword("");
                    setConfirm("");
                  }}
                >
                  <option value="create">Criar conta com senha</option>
                  <option value="link">Vincular conta existente</option>
                </select>
              </label>
              <label>
                Email do usuário
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            </>
          )}
          {(editing !== "new" || mode === "create") && (
            <>
              <p>Use ao menos 12 caracteres. A pessoa trocará a senha no primeiro acesso.</p>
              <label>
                Senha temporária
                <input
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label>
                Confirmar senha temporária
                <input
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
              <label>
                <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />{" "}
                Mostrar senha
              </label>
            </>
          )}
          {mode === "link" && editing === "new" && <p>A senha existente será preservada.</p>}
        </div>
        <div className={setup ? "organization-form-actions" : "guided-body"}>
          <button className="primary" disabled={busy}>
            {busy
              ? "Salvando…"
              : setup && editing === "new"
                ? "Concluir e ativar organização"
                : "Salvar acesso"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void (setup ? backToOrganization() : closeEditor())}
          >
            {setup ? "Voltar aos dados da organização" : "Cancelar"}
          </button>
        </div>
      </form>
    </>
  ) : null;
  return (
    <section className="organization-members">
      {confirmation.element}
      {!setup && (
        <div className="page-title">
          <div>
            <h3>Usuários e acessos</h3>
            <p>
              {setup
                ? "Crie o responsável para concluir. A organização será ativada automaticamente."
                : "Administre os acessos desta organização."}
            </p>
          </div>
          <button
            className="primary"
            disabled={busy || status === "closed"}
            onClick={() => open("new")}
          >
            {setup ? "Continuar cadastro do responsável" : "Adicionar usuário"}
          </button>
        </div>
      )}
      {error && !editing && !emailTarget && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {emailTarget && (
        <PlatformSheet title="Alterar email" busy={busy} onClose={() => void closeEditor()}>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <form
            data-draft="true"
            onSubmit={(e) => {
              e.preventDefault();
              void action(
                "/users/" + emailTarget.id + "/email-change",
                { version: emailTarget.user_version, new_email: newEmail, reason: "" },
                "Solicitar mudança do email global desta conta? O novo email receberá uma confirmação.",
              ).then((ok) => {
                if (!ok) return;
                setEmailTarget(null);
                setNewEmail("");
              });
            }}
          >
            <h3>Alterar email de {emailTarget.email}</h3>
            <p>Esta ação depende de SMTP e altera o email usado em todas as organizações.</p>
            <label>
              Novo email de acesso
              <input
                required
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </label>
            <button disabled={busy}>Solicitar alteração de email</button>
            <button type="button" disabled={busy} onClick={() => void closeEditor()}>
              Cancelar
            </button>
          </form>
        </PlatformSheet>
      )}
      {setup ? (
        <section className="organization-setup" aria-labelledby="organization-setup-title">
          <h3 id="organization-setup-title" ref={setupHeading} tabIndex={-1}>
            Etapa 2: criar o responsável
          </h3>
          <p>
            Crie o acesso do responsável para concluir. A organização será ativada automaticamente.
          </p>
          {editor}
        </section>
      ) : (
        editing && (
          <PlatformSheet title={editorTitle} busy={busy} onClose={() => void closeEditor()}>
            {editor}
          </PlatformSheet>
        )
      )}
      {!setup && (
        <>
          <form
            className="organization-member-search"
            onSubmit={(e) => {
              e.preventDefault();
              void load().catch((e) => setError(e.message));
            }}
          >
            <label>
              Buscar usuário
              <input
                type="search"
                placeholder="Pesquisar por email"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <button disabled={busy}>Buscar</button>
          </form>
          {items.length === 0 && (
            <p>Nenhum usuário encontrado. Adicione um acesso para esta organização.</p>
          )}
          <ul className="organization-member-list">
            {items.map((m) => (
              <li key={m.id}>
                <div className="member-identity">
                  <span className="member-avatar" aria-hidden="true">
                    {m.email[0]?.toUpperCase()}
                  </span>
                  <div>
                    <h4>{m.email}</h4>
                    <span className="member-role">
                      {m.id === responsibleId ? "Responsável pela organização" : "Administrador"}
                      {m.is_superadmin ? " · Superadmin" : ""}
                    </span>
                  </div>
                </div>
                <div className="member-status">
                  <span
                    className={
                      "crm-badge " +
                      (m.user_active && m.active && status === "active" ? "active" : "suspended")
                    }
                  >
                    {!m.user_active
                      ? "Conta globalmente bloqueada"
                      : !m.active
                        ? "Acesso bloqueado nesta organização"
                        : status !== "active"
                          ? "Vínculo ativo · organização ainda indisponível"
                          : "Acesso ativo"}
                  </span>
                  {m.must_change_password && (
                    <span className="member-password-note">Troca de senha no próximo acesso</span>
                  )}
                </div>
                <div className="organization-member-actions">
                  {!m.is_superadmin && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        setEmailTarget(m);
                        setNewEmail("");
                      }}
                    >
                      Alterar email
                    </button>
                  )}
                  {!m.user_active && !m.is_superadmin && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(
                          "/users/" + m.id + "/status",
                          { version: m.user_version, active: true, reason: "" },
                          "Desbloquear a conta globalmente em todas as organizações?",
                        )
                      }
                    >
                      Desbloquear conta global
                    </button>
                  )}
                  {m.is_superadmin ? (
                    <a href={"/plataforma/super-admins/" + m.id}>Conta de superadmin</a>
                  ) : (
                    <button
                      disabled={busy || !m.user_active || status === "closed"}
                      onClick={() => open(m)}
                    >
                      Redefinir senha
                    </button>
                  )}
                  <details className="member-more">
                    <summary>Mais opções de acesso</summary>
                    <button
                      disabled={busy || status === "closed" || m.id === responsibleId}
                      onClick={() =>
                        void action(
                          "/organizations/" + id + "/members/" + m.id + "/status",
                          { version: m.version, active: !m.active, reason: "" },
                          (m.active ? "Bloquear" : "Liberar") +
                            " acesso somente nesta organização?",
                        )
                      }
                    >
                      {m.active ? "Bloquear acesso" : "Liberar acesso"}
                    </button>
                    <button
                      disabled={
                        busy ||
                        !m.active ||
                        !m.user_active ||
                        m.id === responsibleId ||
                        status === "closed"
                      }
                      onClick={() =>
                        void action(
                          "/organizations/" + id + "/responsible",
                          { version, user_id: m.id, reason: "" },
                          "Definir " + m.email + " como responsável?",
                        )
                      }
                    >
                      Definir responsável
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(
                          "/organizations/" + id + "/members/" + m.id + "/sessions/revoke",
                          { version: m.version },
                          "Encerrar as sessões nesta organização?",
                        )
                      }
                    >
                      Encerrar sessões
                    </button>
                  </details>
                </div>
              </li>
            ))}
          </ul>
          {cursor && (
            <button
              disabled={busy}
              onClick={() => void load(cursor).catch((e) => setError(e.message))}
            >
              Carregar mais usuários
            </button>
          )}
        </>
      )}
    </section>
  );
}
