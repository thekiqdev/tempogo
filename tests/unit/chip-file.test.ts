import assert from "node:assert/strict";
import test from "node:test";
import {
  parseChipCsv,
  suggestChipColumns,
  validateChipRows,
} from "../../apps/web/src/chip-file.js";

test("chips: CSV com BOM, delimitador e zeros à esquerda", () => {
  const table = parseChipCsv("\uFEFFNUMERO;CHIP\r\n001;000000000109000000000001\r\n002;ABC123\r\n");
  assert.deepEqual(suggestChipColumns(table), [0, 1]);
  assert.deepEqual(validateChipRows(table, 0, 1), [
    { bib: "001", chip: "000000000109000000000001" },
    { bib: "002", chip: "ABC123" },
  ]);
  assert.equal(parseChipCsv('NUMERO,CHIP\n"003","ABC,123"').rows[0]?.[1], "ABC,123");
});
test("chips: colunas invertidas exigem escolha explícita, sem conversão numérica", () => {
  const table = parseChipCsv("NUMERO;CHIP\n000000000109000000000001;1");
  assert.deepEqual(suggestChipColumns(table), [0, 1]);
  assert.throws(() => validateChipRows(table, 0, 1), /peito/);
  assert.deepEqual(validateChipRows(table, 1, 0), [{ bib: "1", chip: "000000000109000000000001" }]);
});
test("chips: rejeita duplicados, campos vazios, fórmulas e CSV truncado", () => {
  for (const csv of [
    "NUMERO;CHIP\n1;A\n1;B",
    "NUMERO;CHIP\n1;A\n2;A",
    "NUMERO;CHIP\n1;",
    "NUMERO;CHIP\n1;=1+1",
  ])
    assert.throws(() => validateChipRows(parseChipCsv(csv), 0, 1));
  assert.throws(() => parseChipCsv('NUMERO;CHIP\n1;"ABC'), /aspas/);
});
