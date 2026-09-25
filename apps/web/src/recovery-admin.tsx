import { type FormEvent, useEffect, useState } from "react";
import { api } from "./api";

type Device = {
  id: string;
  label: string;
  checkpoint_name: string;
  last_seen_at: string | null;
  pending: number | null;
  sending: number | null;
  synced: number | null;
  blocked: number | null;
  stale: boolean;
};
export function RecoveryPanel({ eventId }: { eventId: string }) {
  const [devices, setDevices] = useState<Device[]>([]),
    [file, setFile] = useState<File | null>(null),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      setDevices((await api<{ items: Device[] }>("/events/" + eventId + "/devices")).items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na consulta");
    }
  }
  useEffect(() => {
    void refresh();
  }, [eventId]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    let committed = 0;
    try {
      if (!file || file.size > 10 * 1024 * 1024)
        throw new Error("Selecione um pacote JSON de até 10 MB");
      const p = JSON.parse(await file.text());
      if (
        p.version !== 1 ||
        p.event_id !== eventId ||
        !Array.isArray(p.items) ||
        p.items.length === 0 ||
        p.items.length > 10000
      )
        throw new Error("Pacote inválido ou de outro evento");
      for (let start = 0; start < p.items.length; start += 100) {
        const result = await api<{ items: unknown[] }>("/events/" + eventId + "/recovery", "POST", {
          reason,
          package: {
            version: 1,
            event_id: p.event_id,
            checkpoint_id: p.checkpoint_id,
            items: p.items.slice(start, start + 100),
          },
        });
        committed += result.items.length;
        setNotice(committed + " registro(s) recebido(s), incluindo reenvios. Revisão obrigatória.");
      }
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : "Falha na importação") +
          ". " +
          committed +
          " registro(s) já recebido(s). É seguro repetir o mesmo pacote.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <div className="section-title">
        <h2>Comunicação dos aparelhos</h2>
        <button className="secondary" onClick={refresh}>
          Atualizar aparelhos
        </button>
      </div>
      <p>
        As contagens são informadas pelo aparelho. Comunicação antiga ou ausente significa situação
        desconhecida, não fila vazia.
      </p>
      <ul className="access-list">
        {devices.map((d) => (
          <li key={d.id}>
            <div>
              <strong>
                {d.checkpoint_name} · {d.label}
              </strong>
              <p>
                {d.last_seen_at
                  ? "Última comunicação: " + new Date(d.last_seen_at).toLocaleString()
                  : "Sem comunicação registrada"}{" "}
                · {d.stale ? "Situação desconhecida" : "Comunicação recente"}
              </p>
              <small>
                Pendentes: {d.pending ?? "—"} · Enviando: {d.sending ?? "—"} · Confirmados:{" "}
                {d.synced ?? "—"} · Bloqueados: {d.blocked ?? "—"}
              </small>
            </div>
          </li>
        ))}
      </ul>
      <h2>Recuperar registros do aparelho</h2>
      <p>
        O pacote é uma evidência não verificada. Todos os registros importados exigem revisão,
        inclusive quando o acesso original foi revogado. A importação não reativa o acesso.
      </p>
      <form onSubmit={submit}>
        <label>
          Pacote de recuperação
          <input
            type="file"
            accept=".json,application/json"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label>
          Justificativa da recuperação
          <textarea
            required
            minLength={10}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Importando…" : "Importar para revisão"}
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p role="status">{notice}</p>
    </section>
  );
}
