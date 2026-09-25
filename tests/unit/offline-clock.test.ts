import assert from "node:assert/strict";
import test from "node:test";
import { boot, clockEvidence, grantValid, retryDelay } from "../../apps/web/src/field-clock.js";
import type { Preparation } from "../../apps/web/src/field-store.js";

test("relógios: salto, reinício e referência antiga preservam qualidade incerta", () => {
  const s = {
    offset_ms: 25,
    rtt_ms: 10,
    measured_at: new Date(100000).toISOString(),
    wall: 100000,
    mono: 100,
    boot,
  };
  assert.equal(clockEvidence(s, 101000, 1100).uncertain, false);
  assert.equal(clockEvidence(s, 120000, 1100).uncertain, true);
  assert.equal(clockEvidence({ ...s, boot: "previous-page" }, 101000, 1100).uncertain, true);
  assert.equal(clockEvidence(s, 500001, 400101).uncertain, true);
  assert.equal(clockEvidence({ ...s, rtt_ms: 1001 }, 101000, 1100).uncertain, true);
});
test("concessão expira por tempo monotônico, e relógio regressivo após reload bloqueia", () => {
  const p = {
    grant: { expires_at: new Date(120000).toISOString() },
    clock: { wall: 100000, mono: 100, offset_ms: 0, boot },
    prepared_wall: 100000,
  } as Preparation;
  assert.equal(grantValid(p, 101000, 1100), true);
  assert.equal(grantValid(p, 100000, 20101), false);
  assert.equal(grantValid({ ...p, clock: { ...p.clock, boot: "old" } }, 90000, 0), false);
  assert.equal(grantValid({ ...p, clock: { ...p.clock, boot: "old" } }, 120001, 0), false);
});
test("backoff cresce com jitter e respeita teto de 30 segundos", () => {
  assert.equal(
    retryDelay(0, () => 0.5),
    1000,
  );
  assert.equal(
    retryDelay(1, () => 0.5),
    2000,
  );
  assert.ok(retryDelay(3, () => 0) < retryDelay(3, () => 1));
  assert.ok(retryDelay(100, () => 1) <= 30000);
});
