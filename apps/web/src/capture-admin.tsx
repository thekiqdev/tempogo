import type { Checkpoint } from "@tempogo/contracts";
import { type FormEvent, useEffect, useState } from "react";
import { api } from "./api";

type Access = {
  id: string;
  code: string;
  label: string;
  expires_at: string;
  revoked_at: string | null;
  password?: string;
};
export function AccessPanel({ points }: { points: Checkpoint[] }) {
  const [point, setPoint] = useState(points[0]?.id ?? ""),
    [items, setItems] = useState<Access[]>([]),
    [issued, setIssued] = useState<Access | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    if (point)
      setItems((await api<{ items: Access[] }>("/checkpoints/" + point + "/access")).items);
  }
  useEffect(() => {
    setIssued(null);
    setItems([]);
    let active = true;
    if (point)
      api<{ items: Access[] }>("/checkpoints/" + point + "/access")
        .then((result) => {
          if (active) setItems(result.items);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [point]);
  async function issue(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setIssued(null);
    const data = new FormData(e.currentTarget);
    try {
      setIssued(
        await api<Access>("/checkpoints/" + point + "/access", "POST", {
          label: data.get("label"),
          expires_at: new Date(String(data.get("expires_at"))).toISOString(),
        }),
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível emitir acesso");
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    setError("");
    try {
      await api("/access/" + id + "/revoke", "POST", {});
      if (issued?.id === id) setIssued(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao revogar");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Acessos da equipe</h2>
      <p>
        Emita um acesso por aparelho. Compartilhe código e senha somente com o operador responsável.
      </p>
      <a href="/checkpoint" target="_blank" rel="noreferrer">
        Abrir entrada do checkpoint ↗
      </a>
      <label>
        Checkpoint do acesso
        <select disabled={busy} value={point} onChange={(e) => setPoint(e.target.value)}>
          {points.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.active ? "" : " (inativo)"}
            </option>
          ))}
        </select>
      </label>
      {point && (
        <form onSubmit={issue} className="panel">
          <label>
            Identificação do aparelho
            <input
              name="label"
              required
              minLength={2}
              maxLength={80}
              placeholder="Ex.: Chegada · celular 01"
            />
          </label>
          <label>
            Válido até
            <input name="expires_at" type="datetime-local" required />
          </label>
          <button
            className="primary"
            disabled={busy || !points.find((p) => p.id === point)?.active}
          >
            Gerar código e senha
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {issued && (
        <div className="issued-access" role="status">
          <h3>Acesso gerado</h3>
          <p>
            Guarde a senha agora. Ela não será exibida novamente depois que você sair desta tela.
          </p>
          <p>
            Código: <strong data-testid="issued-code">{issued.code}</strong>
          </p>
          <p>
            Senha: <code data-testid="issued-password">{issued.password}</code>
          </p>
          <button className="secondary" onClick={() => setIssued(null)}>
            Já guardei a senha
          </button>
        </div>
      )}
      <ul className="access-list">
        {items.map((i) => (
          <li key={i.id}>
            <div>
              <strong>
                {i.label} · {i.code}
              </strong>
              <p>
                Validade: {new Date(i.expires_at).toLocaleString()} ·{" "}
                {i.revoked_at
                  ? "Revogado"
                  : new Date(i.expires_at).getTime() < Date.now()
                    ? "Expirado"
                    : "Ativo"}
              </p>
            </div>
            {!i.revoked_at && (
              <button className="secondary" disabled={busy} onClick={() => revoke(i.id)}>
                Revogar acesso
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
