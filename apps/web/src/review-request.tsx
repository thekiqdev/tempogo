import { type FormEvent, useEffect, useRef, useState } from "react";
import { request } from "./field-api";
export function ReviewRequest({ id, csrf }: { id: string; csrf: string }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [reason, setReason] = useState(""),
    [online, setOnline] = useState(navigator.onLine);
  const attempt = useRef<{ reason: string; id: string } | null>(null);
  useEffect(() => {
    const changed = () => setOnline(navigator.onLine);
    window.addEventListener("online", changed);
    window.addEventListener("offline", changed);
    return () => {
      window.removeEventListener("online", changed);
      window.removeEventListener("offline", changed);
    };
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!navigator.onLine) {
      setMessage("Sem conexão. O pedido ainda não foi enviado.");
      return;
    }
    if (attempt.current?.reason !== reason) attempt.current = { reason, id: crypto.randomUUID() };
    setBusy(true);
    try {
      await request("/observations/" + id + "/review-requests", csrf, {
        reason,
        request_id: attempt.current.id,
      });
      setOpen(false);
      setReason("");
      setMessage("Solicitação enviada ao administrador.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        className="secondary"
        disabled={!csrf || busy}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "Fechar solicitação" : "Solicitar revisão"}
      </button>
      {!online && (
        <p role="status">
          Conecte-se para enviar a solicitação. Pedidos de revisão não são enviados offline.
        </p>
      )}
      {open && (
        <form onSubmit={submit}>
          <label>
            Motivo da solicitação
            <textarea
              name="reason"
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy || !online || !csrf}>
            {busy ? "Enviando…" : "Enviar solicitação"}
          </button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
