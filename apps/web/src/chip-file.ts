export type ChipMapping = { bib: string; chip: string };
export type ChipTable = { headers: string[]; rows: string[][] };
const clean = (value: string) => value.trim().replace(/^["'](?=[A-Za-z0-9])/, "");
export function validateChipRows(
  table: ChipTable,
  bibColumn: number,
  chipColumn: number,
): ChipMapping[] {
  if (bibColumn === chipColumn) throw Error("Selecione colunas diferentes para peito e chip.");
  if (!table.rows.length || table.rows.length > 10000)
    throw Error("O arquivo deve ter entre 1 e 10.000 participantes.");
  const bibs = new Set<string>(),
    chips = new Set<string>();
  return table.rows.map((row, index) => {
    const bib = clean(row[bibColumn] ?? ""),
      chip = clean(row[chipColumn] ?? "");
    if (!/^[0-9]{1,8}$/.test(bib))
      throw Error(`Linha ${index + 2}: peito deve conter de 1 a 8 dígitos.`);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(chip))
      throw Error(`Linha ${index + 2}: chip inválido. Use letras, números, hífen ou sublinhado.`);
    if (bibs.has(bib)) throw Error(`Linha ${index + 2}: peito ${bib} repetido.`);
    if (chips.has(chip)) throw Error(`Linha ${index + 2}: chip repetido.`);
    bibs.add(bib);
    chips.add(chip);
    return { bib, chip };
  });
}
export function parseChipCsv(text: string): ChipTable {
  text = text.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/)[0] ?? "";
  const delimiter = first.includes(";") ? ";" : first.includes("\t") ? "\t" : ",";
  const result: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (!cell || quoted) quoted = !quoted;
      else cell += ch;
    } else if (ch === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) result.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (quoted) throw Error("CSV com aspas não fechadas.");
  row.push(cell);
  if (row.some((v) => v.trim())) result.push(row);
  return { headers: result.shift() ?? [], rows: result };
}
function xml(text: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw Error("XML com DTD ou entidades não é permitido.");
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw Error("XML inválido.");
  return doc;
}
export async function readChipFile(file: File): Promise<ChipTable> {
  if (file.size > 2 * 1024 * 1024) throw Error("Use um arquivo de até 2 MB.");
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "csv") return parseChipCsv(await file.text());
  if (extension === "xml") {
    const doc = xml(await file.text());
    const records = Array.from(doc.documentElement.children);
    const headers = Array.from(records[0]?.children ?? []).map((c) => c.localName);
    if (headers.length < 2)
      throw Error("XML deve conter participantes com campos de peito e chip.");
    return {
      headers,
      rows: records.map((r) =>
        headers.map(
          (h) => Array.from(r.children).find((c) => c.localName === h)?.textContent ?? "",
        ),
      ),
    };
  }
  if (extension === "xlsx") {
    const { unzipSync, strFromU8 } = await import("fflate");
    let total = 0;
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (f) => {
        if (!/^xl\/(sharedStrings\.xml|worksheets\/sheet1\.xml)$/.test(f.name)) return false;
        total += f.originalSize;
        if (total > 16 * 1024 * 1024) throw Error("Planilha descompactada muito grande.");
        return true;
      },
    });
    const strings = files["xl/sharedStrings.xml"]
      ? Array.from(xml(strFromU8(files["xl/sharedStrings.xml"])).getElementsByTagName("si")).map(
          (si) =>
            Array.from(si.getElementsByTagName("t"))
              .map((t) => t.textContent)
              .join(""),
        )
      : [];
    const sheet = files["xl/worksheets/sheet1.xml"];
    if (!sheet) throw Error("Não foi possível ler a primeira planilha do XLSX.");
    const rows = Array.from(xml(strFromU8(sheet)).getElementsByTagName("row"))
      .map((r) => {
        const row: string[] = [];
        for (const c of Array.from(r.getElementsByTagName("c"))) {
          const letters = (c.getAttribute("r") ?? "").match(/^[A-Z]+/)?.[0] ?? "";
          let col = 0;
          for (const letter of letters) col = col * 26 + letter.charCodeAt(0) - 64;
          if (col < 1 || col > 100) throw Error("Planilha com colunas fora do limite (100).");
          if (c.getElementsByTagName("f").length)
            throw Error("Use valores de texto, sem fórmulas, na planilha de chips.");
          const value = c.getElementsByTagName("v")[0]?.textContent ?? "";
          row[col - 1] =
            c.getAttribute("t") === "s"
              ? (strings[Number(value)] ?? "")
              : c.getAttribute("t") === "inlineStr"
                ? (c.textContent ?? "")
                : value;
        }
        return row;
      })
      .filter((r) => r.some((v) => v?.trim()));
    return { headers: rows.shift() ?? [], rows };
  }
  throw Error("Selecione um arquivo CSV, XML ou XLSX.");
}
export function suggestChipColumns(table: ChipTable): [number, number] {
  const names = table.headers.map((h) => h.trim().toLowerCase());
  let bib = names.findIndex((h) =>
    ["numero_peito", "numero", "número", "peito", "bib"].includes(h),
  );
  let chip = names.findIndex((h) => ["chip", "transponder", "epc"].includes(h));
  if (bib < 0) bib = 0;
  if (chip < 0 || chip === bib) chip = bib === 0 ? 1 : 0;
  return [bib, chip];
}
