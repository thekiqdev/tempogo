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

export function WiclaxPanel({ eventId }: { eventId: string }) {
  const [status, setStatus] = useState<WiclaxStatus | null>(null);
  const [port, setPort] = useState("3097");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = () =>
      api<WiclaxStatus>("/events/" + eventId + "/wiclax")
        .then((s) => {
          if (!active) return;
          setStatus(s);
          if (s.port) setPort(String(s.port));
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
      const parsed = Number(port);
      const s = await api<WiclaxStatus>("/events/" + eventId + "/wiclax/connect", "POST", {
        port: Number.isFinite(parsed) ? parsed : 3097,
      });
      setStatus(s);
      if (s.port) setPort(String(s.port));
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

  return (
    <article className={"wiclax-card" + (active ? " is-active" : "")}>
      <header className="wiclax-card-head">
        <div>
          <h4>Wiclax</h4>
          <p>
            {active
              ? "Uma porta para o evento. No Wiclax, use o Source igual ao nome de cada checkpoint."
              : "Abra uma conexão deste evento. Os checkpoints são diferenciados pelo Source."}
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

      {!active ? (
        <div className="wiclax-setup">
          <label className="wiclax-port-field">
            <span>Porta</span>
            <input
              inputMode="numeric"
              value={port}
              aria-describedby="wiclax-port-help"
              onChange={(e) => setPort(e.target.value.replace(/\D/g, "").slice(0, 5))}
              disabled={busy}
            />
          </label>
          <p className="field-help" id="wiclax-port-help">
            Use a mesma porta no Wiclax. Em produção, publique esta porta TCP na VPS.
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
              <li key={s.id}>
                <code>{s.name}</code>
                <span>
                  {kindLabel[s.kind] ?? s.kind} · ordem {s.sequence}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

export function IntegrationsAccordion({ eventId }: { eventId: string }) {
  return (
    <details className="integrations-accordion">
      <summary>Integrações</summary>
      <WiclaxPanel eventId={eventId} />
    </details>
  );
}
