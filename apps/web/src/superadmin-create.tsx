import { type FormEvent, useRef, useState } from "react";
import { useActionConfirmation } from "./platform-dialog";
import { PlatformSheet } from "./platform-sheet";

export function SuperadminCreate({
  csrf,
  onClose,
  onCreated,
}: {
  csrf: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reauth, setReauth] = useState(false),
    [actorPassword, setActorPassword] = useState(""),
    [code, setCode] = useState("");
  const confirmation = useActionConfirmation();
  const command = useRef<{ signature: string; key: string } | null>(null);
  async function close() {
    if (
      (email || password || confirm) &&
      (await confirmation.confirm("Descartar cadastro do superadmin?", false)) === null
    )
      return;
    window.dispatchEvent(new Event("platform:saved"));
    onClose();
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password !== confirm) {
      setError("As senhas devem ser iguais.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (reauth) {
        const r = await fetch("/api/v1/platform/auth/reauthenticate", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
          body: JSON.stringify({ password: actorPassword, code }),
        });
        const d = await r.json();
        if (!r.ok) throw Error(d.error?.message ?? "Não foi possível confirmar sua identidade.");
        setReauth(false);
        setActorPassword("");
        setCode("");
      }
      const body = JSON.stringify({ email, password });
      if (command.current?.signature !== body)
        command.current = { signature: body, key: crypto.randomUUID() };
      const r = await fetch("/api/v1/platform/super-admins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
          "Idempotency-Key": command.current.key,
        },
        body,
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.error?.code === "REAUTH_REQUIRED") {
          setReauth(true);
          return;
        }
        throw Error(d.error?.message ?? "Não foi possível cadastrar.");
      }
      setPassword("");
      setConfirm("");
      command.current = null;
      window.dispatchEvent(new Event("platform:saved"));
      onCreated(d.user.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {confirmation.element}
      <PlatformSheet title="Cadastrar superadmin" busy={busy} onClose={() => void close()}>
        <p>
          Cadastre o acesso com email e senha. Não será enviado convite. No primeiro acesso, o
          titular configura o MFA.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <form data-draft="true" onSubmit={save}>
          <label>
            Email do novo superadmin
            <input
              required
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Senha do novo superadmin
            <input
              required
              minLength={12}
              maxLength={128}
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            Confirmar senha
            <input
              required
              minLength={12}
              maxLength={128}
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <label>
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />{" "}
            Mostrar senha
          </label>
          {reauth && (
            <fieldset>
              <legend>Confirme seu acesso para conceder poderes de superadmin</legend>
              <p>O cadastro preenchido será preservado.</p>
              <label>
                Sua senha atual
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={actorPassword}
                  onChange={(e) => setActorPassword(e.target.value)}
                />
              </label>
              <label>
                Seu código MFA
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
            </fieldset>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Salvando…" : reauth ? "Confirmar e cadastrar" : "Cadastrar superadmin"}
          </button>
          <button type="button" disabled={busy} onClick={() => void close()}>
            Cancelar
          </button>
        </form>
      </PlatformSheet>
    </>
  );
}
