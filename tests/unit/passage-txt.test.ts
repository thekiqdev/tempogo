import assert from "node:assert/strict";
import test from "node:test";
import { passageTxtLine } from "../../apps/api/src/passage-txt.js";

test("TXT preserva milissegundos e usa fuso do evento com identificador de 24 posições", () => {
  assert.equal(
    passageTxtLine("012212", new Date("2026-09-13T08:40:33.427Z"), "America/Sao_Paulo"),
    "000000000000000000012212;13/09/2026 05:40:33:427",
  );
  assert.equal(
    passageTxtLine("00012", new Date("2026-09-13T01:00:00.007Z"), "America/Sao_Paulo"),
    "000000000000000000000012;12/09/2026 22:00:00:007",
  );
});

test("TXT preserva identificadores de chip alfanuméricos", () => {
  assert.equal(
    passageTxtLine("3A2A392A37313734", new Date("2026-09-13T08:40:33.427Z"), "America/Sao_Paulo"),
    "3A2A392A37313734;13/09/2026 05:40:33:427",
  );
});
