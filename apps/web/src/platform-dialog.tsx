import { useEffect, useRef, useState } from "react";
export function useActionConfirmation() {
  const [pending, setPending] = useState<{
      title: string;
      reason: boolean;
      resolve: (value: string | null) => void;
    } | null>(null),
    [reason, setReason] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (pending) dialog.current?.showModal();
  }, [pending]);
  function finish(value: string | null) {
    dialog.current?.close();
    pending?.resolve(value);
    setPending(null);
  }
  return {
    confirm: (title: string, requiresReason: boolean) =>
      new Promise<string | null>((resolve) =>
        setPending({ title, reason: requiresReason, resolve }),
      ),
    element: pending ? (
      <dialog
        className="crm-dialog"
        ref={dialog}
        aria-labelledby="crm-action-title"
        onCancel={(e) => {
          e.preventDefault();
          finish(null);
        }}
      >
        <h2 id="crm-action-title">{pending.title}</h2>
        <p>Confira o alcance e os dados desta ação antes de confirmar.</p>
        {pending.reason && (
          <label>
            Motivo desta ação
            <textarea
              minLength={10}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </label>
        )}
        <div>
          <button onClick={() => finish(null)}>Voltar</button>
          <button
            className="primary"
            disabled={pending.reason && reason.trim().length < 10}
            onClick={() => finish(reason)}
          >
            Confirmar ação
          </button>
        </div>
      </dialog>
    ) : null,
  };
}
