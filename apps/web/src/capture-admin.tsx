import type { Checkpoint } from "@tempogo/contracts";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { HeaderActions } from "./page-header";

type Access = {
  id: string;
  code: string;
  label: string;
  operator_name?: string;
  last_seen_at?: string | null;
  pending?: number | null;
  sending?: number | null;
  blocked?: number | null;
  stale?: boolean;
  active_sessions?: number;
  expires_at: string;
  revoked_at: string | null;
  online?: boolean;
  password?: string;
  access_url?: string | null;
};
function CopyButton({ value, label }: { value: string; label: string }) {
  const [status, setStatus] = useState("");
  useEffect(() => {
    setStatus("");
  }, [value]);
  return (
    <span className="access-copy">
      <button
        type="button"
        className="secondary"
        aria-label={label}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setStatus("Copiado!");
          } catch {
            setStatus("Não foi possível copiar. Selecione e copie o texto.");
          }
        }}
      >
        Copiar
      </button>
      <small role="status">{status}</small>
    </span>
  );
}
function AccessLink({ url, label = "Copiar link de acesso" }: { url: string; label?: string }) {
  return (
    <div className="access-login-link">
      <strong>Link de acesso automático</strong>
      <CopyButton value={url} label={label} />
    </div>
  );
}
type LivePassage = {
  id: string;
  effective_bib: string;
  received_at: string;
  operator_name?: string;
  access_label?: string;
  status: string;
};
function LiveAccess({ eventId, checkpointId }: { eventId: string; checkpointId: string }) {
  const [items, setItems] = useState<LivePassage[]>([]);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState("");
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const result = await api<{ items: LivePassage[] }>(
          "/events/" +
            eventId +
            "/observations?view=records&checkpoint_id=" +
            encodeURIComponent(checkpointId) +
            "&limit=20",
        );
        if (active) {
          setItems(result.items);
          setError("");
          setUpdated(new Date().toLocaleTimeString("pt-BR"));
        }
      } catch {
        if (active) setError("Atualização interrompida. Tentando reconectar…");
      } finally {
        if (active) timer = setTimeout(load, 3000);
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [eventId, checkpointId]);
  return (
    <section className="access-live" aria-label="Envios ao vivo">
      <div>
        <h3>Envios ao vivo</h3>
        <small>
          {error || (updated ? "Atualizado às " + updated + " · a cada 3 segundos" : "Conectando…")}
        </small>
      </div>
      <p>Últimos 20 registros recebidos neste checkpoint.</p>
      {!items.length && (
        <p role="status">{updated ? "Aguardando a primeira passagem." : "Carregando registros…"}</p>
      )}
      <ul>
        {items.map((i) => (
          <li key={i.id}>
            <strong>#{i.effective_bib}</strong>
            <span>
              {i.operator_name || "Operador não informado"}
              <small>{i.access_label || "Aparelho não informado"}</small>
            </span>
            <span>
              <time dateTime={i.received_at}>
                {new Date(i.received_at).toLocaleTimeString("pt-BR")}
              </time>
              <small>
                {i.status === "pending"
                  ? "Requer revisão"
                  : i.status === "invalidated"
                    ? "Invalidado"
                    : "Recebido"}
              </small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
export function AccessPanel({
  eventId,
  points,
  initialPoint,
  onBack,
}: {
  eventId: string;
  points: Checkpoint[];
  initialPoint?: string;
  onBack?: () => void;
}) {
  const [point, setPoint] = useState(initialPoint ?? points[0]?.id ?? ""),
    [items, setItems] = useState<Access[]>([]),
    [issued, setIssued] = useState<Access | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false),
    [loading, setLoading] = useState(true),
    [showHistory, setShowHistory] = useState(false),
    [operator, setOperator] = useState("");
  const [label, setLabel] = useState(""),
    [expiry, setExpiry] = useState(""),
    [replacing, setReplacing] = useState<Access | null>(null),
    [revoking, setRevoking] = useState<Access | null>(null);
  const [live, setLive] = useState(false);
  const [issuedAnchor, setIssuedAnchor] = useState<string | null>(null);
  const header = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function close(event: PointerEvent) {
      if (picker.current && !picker.current.contains(event.target as Node))
        picker.current.open = false;
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && picker.current?.open) {
        picker.current.open = false;
        picker.current.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const selected = points.find((p) => p.id === point);
  useEffect(() => {
    header.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    header.current?.querySelector("summary")?.focus({ preventScroll: true });
  }, [point]);
  const form = useRef<HTMLFormElement>(null);
  const locked = useRef(false);
  const revokeNotice = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (revoking) {
      revokeNotice.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      revokeNotice.current?.querySelector("button")?.focus({ preventScroll: true });
    }
  }, [revoking]);
  function resetForm() {
    setReplacing(null);
    setCreating(false);
    setOperator("");
    setLabel("");
    setExpiry("");
  }
  function prepareReplacement(access: Access) {
    setCreating(false);
    setOperator(access.operator_name ?? "");
    setReplacing(access);
    setLabel(access.label);
    setIssued(null);
    setError("");
    setRevoking(null);
    const date = new Date(access.expires_at);
    setExpiry(
      date.getTime() > Date.now()
        ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
        : "",
    );
  }
  async function refresh() {
    if (point)
      setItems((await api<{ items: Access[] }>("/checkpoints/" + point + "/access")).items);
  }
  useEffect(() => {
    if (creating || replacing) {
      if (!replacing) form.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      form.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    }
  }, [creating, replacing]);
  useEffect(() => {
    setIssued(null);
    setIssuedAnchor(null);
    resetForm();
    setRevoking(null);
    setError("");
    setItems([]);
    setLoading(true);
    setShowHistory(false);
    let active = true;
    const load = () =>
      api<{ items: Access[] }>("/checkpoints/" + point + "/access")
        .then((result) => {
          if (active) {
            setItems(result.items);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    if (point) void load();
    else setLoading(false);
    const timer = setInterval(() => {
      if (point && !locked.current) void load();
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [point]);
  async function issue(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setIssued(null);
    const data = new FormData(e.currentTarget);
    try {
      const generated = await api<Access>("/checkpoints/" + point + "/access", "POST", {
        label: data.get("label"),
        operator_name: operator,
        ...(replacing ? { replace_access_id: replacing.id } : {}),
        expires_at: new Date(String(data.get("expires_at"))).toISOString(),
      });
      setIssued(generated);
      setIssuedAnchor(replacing?.id ?? null);
      resetForm();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível emitir acesso");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await api("/access/" + id + "/revoke", "POST", {});
      if (issued?.id === id) setIssued(null);
      if (replacing?.id === id) resetForm();
      setRevoking(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao revogar");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const accessForm = (
    <form ref={form} onSubmit={issue} className="panel access-create-form">
      <h3>{replacing ? "Redefinir acesso" : "Novo aparelho na equipe"}</h3>
      <p className="muted access-form-intro">
        Informe quem vai registrar as passagens e até quando poderá acessar.
      </p>
      {replacing && (
        <p className="next-hint">
          Ao confirmar, o código e o link anteriores de <strong>{replacing.label}</strong> serão
          revogados. Sincronize registros pendentes no aparelho antes de continuar. Um novo código e
          link serão gerados.
        </p>
      )}
      <label>
        Operador responsável (opcional)
        <input
          value={operator}
          onChange={(e) => setOperator(e.target.value)}
          disabled={busy}
          maxLength={120}
          placeholder="Ex.: Ana Souza"
          autoComplete="off"
        />
      </label>
      <label>
        Identificação do aparelho
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={busy}
          name="label"
          required
          minLength={2}
          maxLength={80}
          placeholder="Ex.: Celular 01 · faixa esquerda"
        />
      </label>
      <label>
        Válido até
        <input
          name="expires_at"
          type="datetime-local"
          required
          value={expiry}
          disabled={busy}
          onChange={(e) => setExpiry(e.target.value)}
        />
      </label>
      {replacing && error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy || !points.find((p) => p.id === point)?.active}>
        {busy ? "Salvando…" : replacing ? "Revogar e gerar novo acesso" : "Gerar acesso"}
      </button>
      {(creating || replacing) && (
        <button type="button" className="secondary" disabled={busy} onClick={resetForm}>
          {replacing ? "Cancelar redefinição" : "Cancelar cadastro"}
        </button>
      )}
    </form>
  );
  const issuedDetails = issued ? (
    <div className="issued-access" role="status">
      <h3>Acesso gerado</h3>
      <p>Compartilhe o código ou o link. O operador informará o próprio nome para entrar.</p>
      <p>
        Código: <strong data-testid="issued-code">{issued!.code}</strong>
        <CopyButton value={issued!.code} label="Copiar código" />
      </p>
      {issued.access_url && <AccessLink url={issued.access_url} />}
      <button className="secondary" onClick={() => setIssued(null)}>
        Concluir
      </button>
    </div>
  ) : null;
  return (
    <section className="checkpoint-access-panel">
      {onBack && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            if (
              (issued || label || expiry || operator) &&
              !window.confirm("Voltar? Guarde o código gerado; dados não salvos serão descartados.")
            )
              return;
            onBack();
          }}
        >
          ← Voltar aos checkpoints
        </button>
      )}
      <div className="access-checkpoint-header" ref={header}>
        <details className="access-picker" ref={picker}>
          <summary aria-label="Trocar checkpoint">
            <span className="point-number">{String(selected?.sequence ?? 0).padStart(2, "0")}</span>
            <span className="access-picker-title">
              <small>CHECKPOINT SELECIONADO</small>
              <strong>{selected?.name}</strong>
              <span>
                {selected?.distance_m == null
                  ? "Distância não informada"
                  : selected.distance_m / 1000 + " km"}{" "}
                · {selected?.active ? "Ativo" : "Inativo"}
              </span>
            </span>
            <span className="access-picker-hint">
              Trocar <span aria-hidden="true">⌄</span>
            </span>
          </summary>
          <div className="access-picker-options" aria-label="Checkpoints disponíveis">
            <p>Selecione um ponto do percurso</p>
            {points.map((p) => (
              <button
                type="button"
                key={p.id}
                disabled={busy}
                aria-pressed={point === p.id}
                onClick={() => {
                  if (
                    p.id !== point &&
                    (issued || label || expiry || operator) &&
                    !window.confirm(
                      "Trocar de checkpoint? Guarde o código e confira os dados não salvos antes de continuar.",
                    )
                  )
                    return;
                  setPoint(p.id);
                  if (picker.current) picker.current.open = false;
                  picker.current?.querySelector("summary")?.focus();
                }}
              >
                <span className="point-number">{String(p.sequence).padStart(2, "0")}</span>
                <span>
                  <strong>{p.name}</strong>
                  <small>
                    {p.distance_m == null ? "Distância não informada" : p.distance_m / 1000 + " km"}{" "}
                    · {p.active ? "Ativo" : "Inativo"}
                  </small>
                </span>
                <span className="access-picker-check" aria-hidden="true">
                  {point === p.id ? "✓" : ""}
                </span>
              </button>
            ))}
          </div>
        </details>
      </div>
      <div className="access-toolbar">
        <div>
          <h2>Acessos da equipe</h2>
          <p>
            {items.filter((i) => !i.revoked_at && Date.parse(i.expires_at) > Date.now()).length}{" "}
            ativos ·{" "}
            {
              items.filter(
                (i) => i.online && !i.revoked_at && Date.parse(i.expires_at) > Date.now(),
              ).length
            }{" "}
            online <span className="access-count-divider">/</span> {items.length} cadastrados
          </p>
        </div>
        <HeaderActions>
          <button className="secondary" aria-expanded={live} onClick={() => setLive(!live)}>
            ◉ Ao vivo
          </button>
          <button
            className="primary"
            disabled={busy || !points.find((p) => p.id === point)?.active}
            onClick={() => {
              resetForm();
              setCreating(true);
              setIssued(null);
              setIssuedAnchor(null);
            }}
          >
            + Novo acesso
          </button>
        </HeaderActions>
      </div>
      {live && <LiveAccess key={point} eventId={eventId} checkpointId={point} />}
      <div className="access-help">
        <p>
          Um acesso por aparelho. Identifique o operador para acompanhar os registros da equipe.
        </p>
        <a href="/checkpoint" target="_blank" rel="noreferrer">
          Abrir tela do operador ↗
        </a>
      </div>
      {!points.find((p) => p.id === point)?.active && (
        <p className="next-hint">Checkpoint inativo. Ative-o para criar acessos.</p>
      )}
      {point && !loading && !replacing && (creating || (!items.length && !issued)) && accessForm}
      {error && !replacing && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {issued && !issuedAnchor && issuedDetails}
      <div className="access-list-heading">
        <h3>Acessos cadastrados</h3>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={showHistory}
            onChange={(e) => setShowHistory(e.target.checked)}
          />{" "}
          Mostrar expirados e revogados
        </label>
      </div>
      {loading && <p role="status">Carregando acessos…</p>}
      {!loading && !items.length && (
        <p className="empty">
          Este checkpoint ainda não tem acessos. Cadastre o primeiro aparelho acima.
        </p>
      )}

      {!loading &&
        items.length > 0 &&
        !showHistory &&
        !items.some((i) => !i.revoked_at && Date.parse(i.expires_at) > Date.now()) && (
          <p className="empty">
            Nenhum acesso ativo. Crie um novo acesso ou consulte os expirados e revogados.
          </p>
        )}
      {revoking && (
        <div ref={revokeNotice} className="discard-confirm" role="alert">
          <p>
            Revogar o acesso de <strong>{revoking.label}</strong>? O aparelho perderá o acesso.
            Sincronize os registros pendentes antes de confirmar.
          </p>
          <button disabled={busy} className="secondary" onClick={() => void revoke(revoking.id)}>
            Confirmar revogação
          </button>
          <button disabled={busy} className="text-button" onClick={() => setRevoking(null)}>
            Cancelar
          </button>
        </div>
      )}
      <ul className="access-list">
        {items
          .filter((i) => !(issued && issuedAnchor && i.id === issued.id))
          .map((i) =>
            issued && issuedAnchor === i.id ? { ...issued, slotId: i.id } : { ...i, slotId: i.id },
          )
          .filter((i) => showHistory || (!i.revoked_at && Date.parse(i.expires_at) > Date.now()))
          .map((i) => (
            <li
              key={i.slotId}
              className={
                replacing?.id === i.id || (issuedAnchor === i.slotId && issued)
                  ? "access-card-expanded"
                  : ""
              }
            >
              <div className="access-card-body">
                <div className="access-card-identity">
                  <span className="access-device-icon" aria-hidden="true">
                    ▣
                  </span>
                  <strong>{i.label}</strong>
                  <div className="access-status-badges">
                    <span
                      className={
                        "badge " +
                        (!i.revoked_at && Date.parse(i.expires_at) > Date.now() ? "active" : "")
                      }
                    >
                      {i.revoked_at
                        ? "Revogado"
                        : Date.parse(i.expires_at) <= Date.now()
                          ? "Expirado"
                          : "Ativo"}
                    </span>
                    <span
                      className={
                        "badge access-presence-badge " +
                        (i.online && !i.revoked_at && Date.parse(i.expires_at) > Date.now()
                          ? "is-online"
                          : "")
                      }
                    >
                      {i.online && !i.revoked_at && Date.parse(i.expires_at) > Date.now()
                        ? "● Online"
                        : "○ Offline"}
                    </span>
                  </div>
                </div>
                <p className="access-operator">
                  {i.operator_name || "Operador não informado"} · Captura manual
                </p>
                <div className="access-card-facts">
                  <p>
                    <small>Código de acesso</small>
                    <b>{i.code}</b>
                    <CopyButton value={i.code} label={"Copiar código de " + i.label} />
                  </p>
                  <p>
                    <small>Válido até</small>
                    <strong>
                      {new Date(i.expires_at).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </strong>
                  </p>
                </div>
                {i.access_url && (
                  <AccessLink url={i.access_url} label={"Copiar link de acesso de " + i.label} />
                )}
                <div className="access-device-status">
                  <small>
                    Último contato:{" "}
                    {i.last_seen_at
                      ? new Date(i.last_seen_at).toLocaleString("pt-BR")
                      : "Ainda não recebido"}
                  </small>
                  <small>
                    {i.pending == null
                      ? "Fila ainda não informada"
                      : `${i.pending} pendentes · ${i.sending ?? 0} enviando · ${i.blocked ?? 0} bloqueados`}
                    {i.stale && i.last_seen_at ? " (última informação recebida)" : ""}
                  </small>
                  {(i.active_sessions ?? 0) > 1 && (
                    <small className="error">
                      Este código tem mais de uma sessão válida. Use um acesso por aparelho para não
                      misturar o acompanhamento.
                    </small>
                  )}
                </div>
              </div>
              {replacing?.id === i.id && accessForm}
              {issued && issuedAnchor === i.slotId && issuedDetails}
              {!i.revoked_at &&
                replacing?.id !== i.id &&
                !(issued && issuedAnchor === i.slotId) && (
                  <div className="access-actions">
                    <button
                      className="secondary"
                      disabled={busy || !points.find((p) => p.id === point)?.active}
                      onClick={() => prepareReplacement(i)}
                    >
                      Redefinir acesso
                    </button>
                    <button
                      className="secondary access-revoke"
                      disabled={busy}
                      onClick={() => setRevoking(i)}
                    >
                      Revogar acesso
                    </button>
                  </div>
                )}
            </li>
          ))}
      </ul>
    </section>
  );
}
