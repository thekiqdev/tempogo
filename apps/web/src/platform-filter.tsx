import { useEffect, useRef, useState } from "react";
export function EntityFilter({
  kind,
  label,
  value,
  onChange,
}: {
  kind: "users" | "organizations";
  label: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const [q, setQ] = useState(""),
    [items, setItems] = useState<{ id: string; email?: string; name?: string }[]>([]),
    [error, setError] = useState(""),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const generation = useRef(0);
  async function search(after?: string) {
    const request = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        "/api/v1/platform/" +
          kind +
          "?" +
          new URLSearchParams({ q, limit: "25", ...(after ? { cursor: after } : {}) }),
      );
      const d = await r.json();
      if (!r.ok) throw Error(d.error?.message ?? "Falha na pesquisa");
      if (request === generation.current) {
        setItems((v) => (after ? [...v, ...d.items] : d.items));
        setCursor(d.next_cursor);
      }
    } catch (e) {
      if (request === generation.current) setError((e as Error).message);
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  return (
    <div className="crm-entity-filter">
      <label>
        Pesquisar {label}
        <input value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <button type="button" disabled={busy} onClick={() => void search()}>
        Buscar {label}
      </button>
      <label>
        {label}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Todos</option>
          {value && !items.some((i) => i.id === value) && (
            <option value={value}>Seleção atual</option>
          )}
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name ?? i.email}
            </option>
          ))}
        </select>
      </label>
      {cursor && (
        <button type="button" disabled={busy} onClick={() => void search(cursor)}>
          Mais resultados de {label}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
