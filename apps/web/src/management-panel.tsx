import type { Checkpoint } from "@tempogo/contracts";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { api } from "./api";

type Observation = {
  id: string;
  bib: string;
  effective_bib: string;
  effective_captured_at: string;
  raw_captured_at: string;
  received_at: string;
  checkpoint_name: string;
  status: string;
  version: number;
  evidence_version: number;
  operator_name?: string;
  access_label?: string;
  observation_count?: number;
  members?: {
    id: string;
    operator_name: string;
    access_label: string;
    effective_captured_at: string;
    received_at: string;
    status: string;
  }[];
  disposition: string;
};
type Result = {
  items: Observation[];
  total: number;
  pending: number;
  invalidated: number;
  updated_at: string;
};
type Revision = {
  id: string;
  version: number;
  actor: string;
  reason: string;
  created_at: string;
  bib: string;
  captured_at: string;
  disposition: string;
  before_value: { bib: string; captured_at: string; disposition: string };
};
type Detail = {
  observation: Observation;
  revisions: Revision[];
  flags: { reason: string }[];
  requests: { id: string; reason: string; created_at: string }[];
};
const statusLabel: Record<string, string> = {
  accepted: "Aceita",
  pending: "Requer revisão",
  invalidated: "Invalidada",
};
const flagLabels: Record<string, string> = {
  possible_duplicate: "Possível duplicata",
  time_uncertain: "Horário incerto",
  late_upload: "Envio após fechamento",
  recovery: "Recuperação administrativa",
  outside_grant: "Fora da autorização de captura",
};
const stamp = (s: string) => new Date(s).toLocaleString("pt-BR");
const local = (s: string) =>
  new Date(Date.parse(s) - new Date(s).getTimezoneOffset() * 60000).toISOString().slice(0, 23);
export function ObservationPanel({ eventId, points }: { eventId: string; points: Checkpoint[] }) {
  const [query, setQuery] = useState("view=consolidated"),
    [offset, setOffset] = useState(0),
    [pageSize, setPageSize] = useState(20),
    [data, setData] = useState<Result | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [reviewRow, setReviewRow] = useState<string | null>(null);
  const reviewRequest = useRef(0);
  const reviewPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (detail) {
      reviewPanel.current?.focus({ preventScroll: true });
    }
  }, [detail?.observation.id]);
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const path = "/events/" + eventId + "/observations";
  async function refresh() {
    setData(await api<Result>(path + "?" + query + "&limit=" + pageSize + "&offset=" + offset));
  }
  useEffect(() => {
    let active = true;
    const load = () =>
      api<Result>(path + "?" + query + "&limit=" + pageSize + "&offset=" + offset)
        .then((r) => {
          if (active) {
            setData(r);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    void load();
    const timer = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [path, query, offset, pageSize]);
  function filter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      q = new URLSearchParams();
    for (const key of ["view", "bib", "checkpoint_id", "status", "from", "to"]) {
      const value = String(f.get(key) ?? "");
      if (value) q.set(key, ["from", "to"].includes(key) ? new Date(value).toISOString() : value);
    }
    setOffset(0);
    setData(null);
    setQuery(q.toString());
  }
  function closeReview() {
    reviewRequest.current++;
    setReviewRow(null);
    setDetail(null);
  }
  useEffect(() => {
    closeReview();
  }, [path, query, offset, pageSize]);
  async function open(id: string, rowId: string) {
    const requestId = ++reviewRequest.current;
    setReviewRow(rowId);
    setDetail(null);
    try {
      const result = await api<Detail>(path + "/" + id);
      if (requestId !== reviewRequest.current) return;
      setDetail(result);
      setError("");
    } catch (e) {
      if (requestId !== reviewRequest.current) return;
      setError((e as Error).message);
      setReviewRow(null);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!detail) return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const payload = {
      expected_version: detail.observation.version,
      expected_evidence: detail.observation.evidence_version,
      bib: String(f.get("bib")),
      captured_at: new Date(String(f.get("captured_at"))).toISOString(),
      disposition: String(f.get("disposition")),
      reason: String(f.get("reason")),
    };
    const key = JSON.stringify({ id: detail.observation.id, ...payload });
    if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
    try {
      await api(path + "/" + detail.observation.id + "/revisions", "POST", {
        ...payload,
        request_id: attempt.current.id,
      });
      await open(detail.observation.id, reviewRow ?? detail.observation.id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function download(format: "txt" | "csv" = "txt") {
    setBusy(true);
    try {
      const r = await fetch("/api/v1" + path + "." + format + "?" + query, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!r.ok) throw new Error((await r.json()).error?.message ?? "Falha na exportação");
      const url = URL.createObjectURL(await r.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = "passagens." + format;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="passages-workspace">
      <div className="section-title passages-heading">
        <div>
          <h2>Passagens manuais</h2>
          <p>Acompanhe os registros e revise quando necessário.</p>
        </div>
        <button className="secondary" onClick={() => refresh().catch((e) => setError(e.message))}>
          Atualizar passagens
        </button>
      </div>
      <details className="passages-explainer">
        <summary>Como funciona o agrupamento?</summary>
        <p>
          Para o mesmo número e checkpoint, registros em até 5 segundos são agrupados pela primeira
          captura. Os originais e a opção de revisão permanecem disponíveis.
        </p>
      </details>
      <form className="review-filters panel" onSubmit={filter}>
        <label>
          Visualização
          <select name="view" defaultValue="consolidated">
            <option value="consolidated">Passagens consolidadas</option>
            <option value="records">Todos os registros originais</option>
          </select>
        </label>
        <label>
          Número
          <input name="bib" inputMode="numeric" pattern="[0-9]{1,8}" maxLength={8} />
        </label>
        <label>
          Checkpoint
          <select name="checkpoint_id">
            <option value="">Todos</option>
            {points.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Situação
          <select name="status">
            <option value="">Todas</option>
            {Object.entries(statusLabel).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Captura desde (fuso do aparelho)
          <input name="from" type="datetime-local" step="1" />
        </label>
        <label>
          Captura até (fuso do aparelho)
          <input name="to" type="datetime-local" step="1" />
        </label>
        <button className="primary">Aplicar filtros</button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="passages-results-bar">
        <div role="status">
          {data ? (
            <>
              <strong>{data.total} passagens</strong>
              <span className="passage-status pending">{data.pending} pendentes</span>
              <span className="passage-status invalidated">{data.invalidated} invalidadas</span>
            </>
          ) : (
            "Carregando passagens…"
          )}
        </div>
        <button className="secondary" disabled={busy || !data} onClick={() => download("txt")}>
          Exportar TXT
        </button>
      </div>
      <div className="passages-export-note">
        <span>
          TXT: número com 24 posições; data e hora com milissegundos no fuso do evento. Respeita os
          filtros e a visualização selecionada.
        </span>
        <button className="text-button" disabled={busy || !data} onClick={() => download("csv")}>
          Exportar CSV detalhado
        </button>
      </div>
      <div className="passages-grid-labels" aria-hidden="true">
        <span>Número</span>
        <span>Checkpoint / origem</span>
        <span>Captura / recebimento</span>
        <span>Situação</span>
        <span>Ações</span>
      </div>
      <ul className="passage-list">
        {data?.items.map((i) => (
          <li key={i.id}>
            <strong className="passage-bib">{i.effective_bib}</strong>
            <div className="passage-origin">
              <b>{i.checkpoint_name}</b>
              <small>{i.operator_name || "Operador não informado"}</small>
              <small>{i.access_label || "Aparelho não informado"}</small>
              {(i.observation_count ?? 1) > 1 && (
                <strong className="consolidation-count">
                  {i.observation_count} registros agrupados
                </strong>
              )}
            </div>
            <div className="passage-times">
              <time dateTime={i.effective_captured_at}>{stamp(i.effective_captured_at)}</time>
              <small>Recebido: {stamp(i.received_at)}</small>
            </div>
            <span className={"passage-status " + i.status}>{statusLabel[i.status]}</span>
            <button
              className="secondary passage-review"
              aria-label={"Revisar " + i.effective_bib}
              aria-expanded={reviewRow === i.id}
              aria-controls={reviewRow === i.id ? "review-" + i.id : undefined}
              disabled={busy}
              onClick={() => (reviewRow === i.id ? closeReview() : open(i.id, i.id))}
            >
              {reviewRow === i.id ? "Fechar revisão" : "Revisar"}
            </button>
            {(i.members?.length ?? 0) > 1 && (
              <details className="passage-evidence">
                <summary>Ver registros do grupo</summary>
                {i.members!.map((m, index) => (
                  <article key={m.id}>
                    <strong>{index === 0 ? "Primeira captura" : "Registro adicional"}</strong>
                    <p>
                      {m.operator_name ? m.operator_name + " · " : ""}
                      {m.access_label}
                    </p>
                    <p>{stamp(m.effective_captured_at)}</p>
                    <button className="secondary" disabled={busy} onClick={() => open(m.id, i.id)}>
                      Revisar este registro
                    </button>
                  </article>
                ))}
              </details>
            )}
            {reviewRow === i.id && detail && (
              <section
                ref={reviewPanel}
                tabIndex={-1}
                id={"review-" + i.id}
                className="passage-inline-review"
                aria-label="Revisão da passagem"
              >
                <div className="section-title">
                  <h3>Revisão da passagem {detail.observation.effective_bib}</h3>
                  <button className="secondary" disabled={busy} onClick={closeReview}>
                    Fechar revisão
                  </button>
                </div>
                <p>
                  Origem:{" "}
                  {detail.observation.operator_name ? detail.observation.operator_name + " · " : ""}
                  {detail.observation.access_label}
                </p>
                <p className="field-help">
                  Invalidar a primeira captura faz a próxima válida assumir o grupo. Corrigir número
                  ou horário recalcula o agrupamento.
                </p>
                <p>
                  Original: {detail.observation.bib} · {stamp(detail.observation.raw_captured_at)}.
                  Vigente: {detail.observation.effective_bib} ·{" "}
                  {stamp(detail.observation.effective_captured_at)} ·{" "}
                  {statusLabel[detail.observation.status]}.
                </p>
                <p>
                  Evidências:{" "}
                  {detail.flags.map((f) => flagLabels[f.reason] ?? f.reason).join(", ") ||
                    "Nenhuma sinalização"}
                </p>
                {detail.requests.map((r) => (
                  <p key={r.id}>
                    Solicitação do operador em {stamp(r.created_at)}: {r.reason}
                  </p>
                ))}
                <form
                  key={detail.observation.id + ":" + detail.observation.version}
                  onSubmit={save}
                >
                  <label>
                    Número corrigido
                    <input
                      name="bib"
                      required
                      pattern="[0-9]{1,8}"
                      maxLength={8}
                      defaultValue={detail.observation.effective_bib}
                    />
                  </label>
                  <label>
                    Horário vigente (fuso do aparelho)
                    <input
                      name="captured_at"
                      type="datetime-local"
                      step="0.001"
                      required
                      defaultValue={local(detail.observation.effective_captured_at)}
                    />
                  </label>
                  <label>
                    Decisão
                    <select name="disposition" defaultValue={detail.observation.disposition}>
                      <option value="accepted">Aceitar passagem</option>
                      <option value="invalidated">Invalidar passagem</option>
                    </select>
                  </label>
                  <label>
                    Motivo da revisão
                    <textarea name="reason" required minLength={3} maxLength={500} />
                  </label>
                  <p>
                    Salvar confirma a análise das evidências e solicitações exibidas. O original
                    permanece no histórico.
                  </p>
                  <button className="primary" disabled={busy}>
                    Salvar revisão
                  </button>
                </form>
                <h3>Histórico de revisões</h3>
                {detail.revisions.map((r) => (
                  <article className="audit" key={r.id}>
                    <strong>
                      Versão {r.version} · {r.actor}
                    </strong>
                    <p>
                      {stamp(r.created_at)} · {r.reason}
                    </p>
                    <p>
                      Antes: {r.before_value.bib} · {stamp(r.before_value.captured_at)} ·{" "}
                      {statusLabel[r.before_value.disposition]}. Depois: {r.bib} ·{" "}
                      {stamp(r.captured_at)} · {statusLabel[r.disposition]}.
                    </p>
                  </article>
                ))}
              </section>
            )}
            {reviewRow === i.id && !detail && (
              <p id={"review-" + i.id} className="passage-inline-review" role="status">
                Carregando revisão…
              </p>
            )}
          </li>
        ))}
      </ul>
      {data?.total === 0 && (
        <p className="empty">
          Nenhuma passagem encontrada. Ajuste os filtros para tentar novamente.
        </p>
      )}
      <nav className="passages-pagination" aria-label="Paginação das passagens">
        <label>
          Por página
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setOffset(0);
              setData(null);
            }}
          >
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span>
          {data
            ? data.total
              ? `${offset + 1}–${Math.min(offset + pageSize, data.total)} de ${data.total}`
              : "0 resultados"
            : "Carregando…"}
        </span>
        <div>
          <button
            className="secondary"
            disabled={!data || offset === 0}
            onClick={() => {
              setOffset(Math.max(0, offset - pageSize));
              setData(null);
            }}
          >
            Anterior
          </button>
          <span>
            Página {Math.floor(offset / pageSize) + 1}
            {data ? " de " + Math.max(1, Math.ceil(data.total / pageSize)) : ""}
          </span>
          <button
            className="secondary"
            disabled={!data || offset + pageSize >= data.total}
            onClick={() => {
              setOffset(offset + pageSize);
              setData(null);
            }}
          >
            Próxima
          </button>
        </div>
      </nav>
      <p className="footnote">
        {data && <>Atualizado às {new Date(data.updated_at).toLocaleTimeString("pt-BR")} · </>}
        Atualização automática a cada 15 segundos. CSV em UTC; preserve o número como texto ao
        importar. Não representa resultado oficial.
      </p>
    </section>
  );
}
type Device = {
  id: string;
  label: string;
  checkpoint_name: string;
  stale: boolean;
  pending: number | null;
  sending: number | null;
  blocked: number | null;
  reconciled: boolean;
  last_seen_at: string | null;
};
export function ReconciliationPanel({
  eventId,
  version,
  state,
}: {
  eventId: string;
  version: number;
  state: string;
}) {
  const [items, setItems] = useState<Device[]>([]),
    [pending, setPending] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const r = await api<{ items: Device[]; pending_reviews: number }>(
      "/events/" + eventId + "/reconciliation",
    );
    setItems(r.items);
    setPending(r.pending_reviews);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    const t = setInterval(() => void load().catch((e) => setError(e.message)), 15000);
    return () => clearInterval(t);
  }, [eventId, version]);
  async function reconcile(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const reason = new FormData(e.currentTarget).get("reason");
    setBusy(true);
    try {
      await api("/events/" + eventId + "/reconciliation", "POST", {
        credential_id: id,
        expected_version: version,
        reason,
      });
      await load();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h3>Conciliação dos aparelhos</h3>
      <p>
        {pending} passagens aguardando revisão. Feche a coleta, confira cada aparelho e confirme que
        não há registros locais pendentes. A ausência de comunicação não significa fila vazia.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {items.map((d) => (
        <article className="audit" key={d.id}>
          <strong>
            {d.checkpoint_name} · {d.label}
          </strong>
          <p>
            {d.reconciled ? "Conciliado" : "Não conciliado"} ·{" "}
            {d.stale ? "Sem comunicação recente" : "Comunicação recente"} · Pendentes:{" "}
            {d.pending ?? "desconhecido"} · Enviando: {d.sending ?? "desconhecido"} · Bloqueados:{" "}
            {d.blocked ?? "desconhecido"}
          </p>
          {state === "closed" && !d.reconciled && (
            <form onSubmit={(e) => reconcile(e, d.id)}>
              <label>
                Confirmação da conferência
                <input
                  name="reason"
                  required
                  minLength={3}
                  maxLength={500}
                  placeholder="Operador confirmou fila vazia e encerramento"
                />
              </label>
              <button
                disabled={busy || d.stale || d.pending !== 0 || d.sending !== 0 || d.blocked !== 0}
              >
                Confirmar conciliação
              </button>
            </form>
          )}
        </article>
      ))}
    </section>
  );
}
