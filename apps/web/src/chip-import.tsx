import { useEffect, useState } from "react";
import { api } from "./api";
import {
  type ChipMapping,
  type ChipTable,
  readChipFile,
  suggestChipColumns,
  validateChipRows,
} from "./chip-file";

export function ChipFilePicker({
  onChange,
  disabled = false,
}: {
  onChange: (rows: ChipMapping[] | null, valid: boolean) => void;
  disabled?: boolean;
}) {
  const [table, setTable] = useState<ChipTable | null>(null),
    [columns, setColumns] = useState<[number, number]>([0, 1]),
    [fileName, setFileName] = useState(""),
    [error, setError] = useState(""),
    [reading, setReading] = useState(false);
  let preview: ChipMapping[] = [];
  if (table) {
    try {
      preview = validateChipRows(table, ...columns);
    } catch {
      /* Error is displayed on change. */
    }
  }
  function apply(t: ChipTable, cols: [number, number]) {
    setTable(t);
    setColumns(cols);
    try {
      const rows = validateChipRows(t, ...cols);
      setError("");
      onChange(rows, true);
    } catch (e) {
      setError((e as Error).message);
      onChange(null, false);
    }
  }
  return (
    <fieldset className="chip-import" disabled={disabled || reading}>
      <legend>Importar números de chips</legend>
      <p>
        CSV, XML ou XLSX (primeira planilha), até 2 MB e 10.000 participantes. Confira qual coluna
        contém o peito e qual contém o chip. Os zeros à esquerda são preservados.
      </p>
      <label>
        Arquivo de chips
        <input
          type="file"
          accept=".csv,.xml,.xlsx"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setReading(true);
            setFileName(file.name);
            setTable(null);
            setError("");
            onChange(null, false);
            try {
              const result = await readChipFile(file);
              apply(result, suggestChipColumns(result));
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setReading(false);
            }
            e.target.value = "";
          }}
        />
      </label>
      {reading && <p role="status">Lendo arquivo…</p>}
      {fileName && (
        <p>
          {fileName}{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setTable(null);
              setFileName("");
              setError("");
              onChange(null, true);
            }}
          >
            Remover arquivo
          </button>
        </p>
      )}
      {table && (
        <div className="chip-columns">
          {["Coluna do número de peito", "Coluna do chip"].map((label, i) => (
            <label key={label}>
              {label}
              <select
                value={columns[i]}
                onChange={(e) => {
                  const next: [number, number] = [...columns];
                  next[i] = Number(e.target.value);
                  apply(table, next);
                }}
              >
                {table.headers.map((h, j) => (
                  <option key={j} value={j}>
                    {h || `Coluna ${j + 1}`}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!!preview.length && (
        <>
          <p role="status">{preview.length} vínculos válidos. Prévia dos primeiros 10:</p>
          <div className="chip-preview">
            <table>
              <thead>
                <tr>
                  <th>Número de peito</th>
                  <th>Chip</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 10).map((r) => (
                  <tr key={r.bib}>
                    <td>{r.bib}</td>
                    <td>{r.chip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="field-help">
        Modelo CSV: NUMERO;CHIP. NUMERO é o número de peito; CHIP é o identificador do chip. XML:
        participantes com campos numero e chip.
      </p>
    </fieldset>
  );
}
export function EventChipSettings({ eventId, locked }: { eventId: string; locked: boolean }) {
  const [data, setData] = useState<{ total: number; items: ChipMapping[] } | null>(null),
    [rows, setRows] = useState<ChipMapping[] | null>(null),
    [valid, setValid] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [key, setKey] = useState(0);
  const path = "/events/" + eventId + "/chips";
  async function load() {
    setData(await api(path));
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [path]);
  return (
    <section className="panel event-chip-settings">
      <h3>Números de chips</h3>
      <p>
        {data ? `${data.total} peitos vinculados a chips.` : "Carregando vínculos…"} A importação
        atualiza os peitos enviados e mantém os demais. Passagens anteriores também passam a exibir
        o chip vinculado.
      </p>
      {locked ? (
        <p>Reabra o evento para importar chips.</p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!rows || !valid || busy) return;
            setBusy(true);
            setError("");
            setNotice("");
            try {
              await api(path, "POST", { rows });
              setNotice(`${rows.length} vínculos importados.`);
              setRows(null);
              setKey((k) => k + 1);
              await load();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <ChipFilePicker
            key={key}
            disabled={busy}
            onChange={(r, v) => {
              setRows(r);
              setValid(v);
              setNotice("");
            }}
          />
          <button className="primary" disabled={busy || !valid || !rows?.length}>
            {busy ? "Importando…" : "Confirmar importação"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!!data?.items.length && (
        <details>
          <summary>Ver amostra dos vínculos cadastrados</summary>
          <div className="chip-preview">
            <table>
              <thead>
                <tr>
                  <th>Peito</th>
                  <th>Chip</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.bib}>
                    <td>{r.bib}</td>
                    <td>{r.chip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
