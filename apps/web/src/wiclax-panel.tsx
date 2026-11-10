import { useEffect, useState } from "react";
import { api } from "./api";

type WiclaxStatus = {
  active: boolean;
  event_id: string;
  checkpoint_id: string;
  checkpoint_name: string;
  port: number | null;
  host: string | null;
  addresses: string[];
  clients: number;
  reading_clients: number;
  source: string;
  pool_size: number;
  pool_free: number;
  pool_exhausted: boolean;
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
  if (status.reading_clients > 0) return "Recebendo passagens deste checkpoint";
  if (status.clients > 0) return "Wiclax conectado — inicie a leitura";
  return "Aguardando o Wiclax conectar nesta porta";
}

export function WiclaxPanel({ checkpointId }: { checkpointId: string }) {
  const [status, setStatus] = useState<WiclaxStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = () =>
      api<WiclaxStatus>("/checkpoints/" + checkpointId + "/wiclax")
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
  }, [checkpointId]);

  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      setStatus(
        await api<WiclaxStatus>("/checkpoints/" + checkpointId + "/wiclax/connect", "POST", {}),
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
      setStatus(
        await api<WiclaxStatus>("/checkpoints/" + checkpointId + "/wiclax/disconnect", "POST", {}),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao desconectar");
    } finally {
      setBusy(false);
    }
  };

  const addresses = status?.addresses ?? [];
  const primary = addresses[0];
  const active = !!status?.active;
  const source = status?.source || status?.checkpoint_name || "";

  return (
    <article className={"wiclax-card" + (active ? " is-active" : "")}>
      <header className="wiclax-card-head">
        <div>
          <h4>Wiclax</h4>
          <p>
            Cada checkpoint usa uma porta do pool. A porta é escolhida automaticamente. O Source
            continua sendo enviado na passagem.
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

      {source && (
        <div className="wiclax-current-source">
          <CopyValue label="Source deste checkpoint" value={source} />
          <p className="field-help">
            Opcional no Wiclax: use este Source no destino. A separação principal é pela porta.
          </p>
        </div>
      )}

      {!active ? (
        <div className="wiclax-setup">
          <p className="field-help">
            Pool: {status?.pool_free ?? "—"} livres de {status?.pool_size ?? "—"}. Ao conectar, o
            sistema reserva a próxima porta disponível.
          </p>
          {status?.pool_exhausted && (
            <p role="alert" className="error">
              Não há portas livres no pool. Peça ao Super Admin para ampliar ou limpar bloqueios.
            </p>
          )}
          <div className="wiclax-actions">
            <button
              type="button"
              className="primary"
              disabled={busy || !!status?.pool_exhausted}
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
          <p className="field-help">
            No Wiclax, crie uma aquisição My system com este IP e esta porta para este checkpoint.
          </p>
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
    </article>
  );
}

export function IntegrationsAccordion({
  checkpointId,
  defaultOpen = false,
}: {
  checkpointId: string;
  defaultOpen?: boolean;
}) {
  return (
    <details className="integrations-accordion" open={defaultOpen || undefined}>
      <summary>Integrações</summary>
      <WiclaxPanel checkpointId={checkpointId} />
    </details>
  );
}
