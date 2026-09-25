import { useEffect, useState } from "react";
import { api } from "./api";

type Entry = {
  id: string;
  action: string;
  actor: string | null;
  created_at: string;
  details: Record<string, unknown>;
};
const labels: Record<string, string> = {
  "event.created": "Evento criado",
  "event.updated": "Evento atualizado",
  "event.transition": "Estado alterado",
  "checkpoint.created": "Checkpoint criado",
  "checkpoint.updated": "Checkpoint atualizado",
  "checkpoint.access_created": "Acesso emitido",
  "checkpoint.access_revoked": "Acesso revogado",
  "checkpoint.login": "Operador autenticado",
  "observation.created": "Passagem recebida",
  "observation.recovered": "Passagem recuperada",
  "observation.revised": "Passagem revisada",
  "observation.review_requested": "Revisão solicitada",
  "device.reconciled": "Aparelho conciliado",
  "event.finalization_checked": "Conferência de finalização",
  "observations.exported": "CSV exportado",
};
export function AuditPanel({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<Entry[]>([]),
    [offset, setOffset] = useState(0),
    [total, setTotal] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    api<{ items: Entry[]; total: number }>(
      "/events/" + eventId + "/audit?limit=50&offset=" + offset,
    )
      .then((r) => {
        if (live) {
          setItems(r.items);
          setTotal(r.total);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [eventId, offset]);
  return (
    <section className="panel">
      <h3>Histórico de auditoria</h3>
      {error && <p role="alert">{error}</p>}
      {items.map((a) => (
        <article className="audit" key={a.id}>
          <strong>{labels[a.action] ?? a.action}</strong>
          <p>
            {new Date(a.created_at).toLocaleString("pt-BR")} · {a.actor ?? "Operador de checkpoint"}
          </p>
          {typeof a.details.reason === "string" && <p>{a.details.reason}</p>}
          <details>
            <summary>Dados da alteração</summary>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {JSON.stringify(a.details, null, 2)}
            </pre>
          </details>
        </article>
      ))}
      <div className="section-title">
        <button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>
          Anterior
        </button>
        <span>
          {total} alterações · Página {offset / 50 + 1}
        </span>
        <button disabled={offset + 50 >= total} onClick={() => setOffset(offset + 50)}>
          Próxima
        </button>
      </div>
    </section>
  );
}
