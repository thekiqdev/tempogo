import { useEffect, useState } from "react";
import { api } from "./api";

type WiclaxSource = {
  id: string;
  name: string;
  kind: string;
  sequence: number;
};

type WiclaxStatus = {
  active: boolean;
  event_id: string;
  port: number | null;
  host: string | null;
  addresses: string[];
  clients: number;
  reading_clients: number;
  sources: WiclaxSource[];
};

const kindLabel: Record<string, string> = {
  start: "Largada",
  intermediate: "Intermediário",
  finish: "Chegada",
};

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const canCopy = value !== "—" && value.length > 0;
  return (
    <div className="wiclax-copy">
      <span className="wiclax-copy-label">{label}</span>
      <div className="wiclax-copy-row">
        <code className="wiclax-copy-value">{value}</code>
        <button
          type="button"
          className="secondary"
          disabled={!canCopy}
          onClick={() => {
            void navigator.clipboard.writeText(value).then(
              () => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              },
              () => undefined,
            );
          }}
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

function situationLabel(status: WiclaxStatus) {
  if (status.reading_clients > 0) return "Recebendo passagens";
  if (status.clients > 0) return "Wiclax conectado — inicie a leitura";
  return "Aguardando o Wiclax conectar";
}

export function WiclaxPanel({
  eventId,
  highlightCheckpointId,
}: {
  eventId: string;
  highlightCheckpointId?: string;
}) {
  const [status, setStatus] = useState<WiclaxStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = () =>
      api<WiclaxStatus>("/events/" + eventId + "/wiclax")
        .then((s) => {
          if (!active) return;
          setStatus(s);
          setError("");
        })
        .catch((e: Error) => {
          if (active) setError(e.message);
        });
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [eventId]);

  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      setStatus(
        await api<WiclaxStatus>("/events/" + eventId + "/wiclax/connect", "POST", {
          port: 3097,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao conectar");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError("");
    try {
      setStatus(await api<WiclaxStatus>("/events/" + eventId + "/wiclax/disconnect", "POST", {}));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao desconectar");
    } finally {
      setBusy(false);
    }
  };

  const addresses = status?.addresses ?? [];
  const primary = addresses[0];
  const active = !!status?.active;
  const sources = status?.sources ?? [];
  const current = highlightCheckpointId
    ? sources.find((s) => s.id === highlightCheckpointId)
    : undefined;

  return (
    <article className={"wiclax-card" + (active ? " is-active" : "")}>
      <header className="wiclax-card-head">
        <div>
          <h4>Wiclax</h4>
          <p>
            Uma porta para o evento. No Wiclax, cada destino usa o Source igual ao nome do
            checkpoint.
          </p>
        </div>
        <p className={"wiclax-state" + (active ? " is-on" : "")} role="status">
          {active ? "Conectado" : "Desligado"}
        </p>
      </header>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {current && (
        <div className="wiclax-current-source">
          <CopyValue label="Source deste checkpoint" value={current.name} />
          <p className="field-help">
            Cadastre no Wiclax um destino com este Source. As passagens deste ponto vão para ele.
          </p>
        </div>
      )}

      {!active ? (
        <div className="wiclax-setup">
          <p className="field-help">
            Ao conectar, o TempoGo abre a ponte do evento (porta 3097). IP e porta aparecem só
            depois.
          </p>
          <div className="wiclax-actions">
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void connect()}
            >
              {busy ? "Abrindo…" : "Conectar"}
            </button>
          </div>
        </div>
      ) : (
        <div className="wiclax-live">
          <p className="wiclax-situation" role="status">
            {situationLabel(status!)}
          </p>
          <div className="wiclax-credentials">
            <CopyValue label="IP" value={primary ?? "—"} />
            <CopyValue label="Porta" value={String(status!.port)} />
          </div>
          {addresses.length > 1 && (
            <p className="field-help">Outros IPs desta máquina: {addresses.slice(1).join(", ")}</p>
          )}
          {!primary && <p className="field-help">Não foi possível detectar o IP desta máquina.</p>}
          <div className="wiclax-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void disconnect()}
            >
              {busy ? "Encerrando…" : "Desconectar"}
            </button>
          </div>
        </div>
      )}

      <div className="wiclax-sources">
        <h5>Sources no Wiclax</h5>
        {sources.length === 0 ? (
          <p className="field-help">Cadastre checkpoints ativos para listar os Sources.</p>
        ) : (
          <ul>
            {sources.map((s) => (
              <li key={s.id} className={s.id === highlightCheckpointId ? "is-current" : undefined}>
                <code>{s.name}</code>
                <span>
                  {kindLabel[s.kind] ?? s.kind} · ordem {s.sequence}
                  {s.id === highlightCheckpointId ? " · este ponto" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

export function IntegrationsAccordion({
  eventId,
  highlightCheckpointId,
  defaultOpen = false,
}: {
  eventId: string;
  highlightCheckpointId?: string;
  defaultOpen?: boolean;
}) {
  return (
    <details className="integrations-accordion" open={defaultOpen || undefined}>
      <summary>Integrações</summary>
      <WiclaxPanel eventId={eventId} highlightCheckpointId={highlightCheckpointId} />
    </details>
  );
}
