import assert from "node:assert/strict";
import test from "node:test";
import {
  formatWiclaxClock,
  formatWiclaxPassing,
  parseWiclaxCommand,
  wiclaxTimestamp,
} from "../../apps/api/src/wiclax-protocol.js";

test("timestamp Wiclax no fuso do evento", () => {
  assert.equal(
    wiclaxTimestamp(new Date("2026-09-13T08:40:33.427Z"), "America/Sao_Paulo"),
    "13-09-2026 05:40:33.427",
  );
});

test("linha genérica com chip, origem e flag ao vivo", () => {
  assert.equal(
    formatWiclaxPassing(
      {
        tag: "01539",
        capturedAt: new Date("2011-09-22T02:41:30.620Z"),
        source: "checkpoint1",
      },
      "UTC",
    ),
    "01539;22-09-2011 02:41:30.620;checkpoint1;;;0\r",
  );
});

test("linha de rewind e campos opcionais", () => {
  assert.equal(
    formatWiclaxPassing(
      {
        tag: "ABC12",
        capturedAt: new Date("2026-11-06T15:00:00.005Z"),
        source: "Meta",
        lap: 2,
        battery: 65,
        rewind: true,
      },
      "UTC",
    ),
    "ABC12;06-11-2026 15:00:00.005;Meta;2;65;1\r",
  );
});

test("CLOCK e comandos de leitura", () => {
  assert.equal(parseWiclaxCommand("CLOCK\r").type, "clock_get");
  assert.equal(parseWiclaxCommand("STARTREAD").type, "start_read");
  assert.equal(parseWiclaxCommand("STOPREAD").type, "stop_read");
  const set = parseWiclaxCommand("CLOCK 06-11-2026 12:00:00");
  assert.equal(set.type, "clock_set");
  if (set.type === "clock_set") {
    assert.equal(set.at.toISOString(), "2026-11-06T12:00:00.000Z");
  }
  assert.equal(
    formatWiclaxClock(new Date("2026-11-06T12:00:00.000Z"), "UTC"),
    "CLOCK 06-11-2026 12:00:00\r",
  );
});

test("REWIND com intervalo", () => {
  const cmd = parseWiclaxCommand("REWIND 06-11-2026 10:00:00 06-11-2026 11:00:00.500");
  assert.equal(cmd.type, "rewind");
  if (cmd.type === "rewind") {
    assert.equal(cmd.from.toISOString(), "2026-11-06T10:00:00.000Z");
    assert.equal(cmd.to.toISOString(), "2026-11-06T11:00:00.500Z");
  }
});
