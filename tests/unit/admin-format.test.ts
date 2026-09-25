import assert from "node:assert/strict";
import test from "node:test";
import { kilometersToMeters } from "../../apps/web/src/admin-format.js";

test("distância em km preserva metros inteiros, vírgula e ausência de valor", () => {
  assert.equal(kilometersToMeters(""), null);
  assert.equal(kilometersToMeters(" 2,5 "), 2500);
  assert.equal(kilometersToMeters("42.195"), 42195);
  assert.equal(kilometersToMeters("0,001"), 1);
  assert.equal(kilometersToMeters("1000"), 1000000);
  assert.equal(kilometersToMeters("0", true), 0);
  for (const input of ["0", "-1", "1e3", "2,5,3", "0.0001", "1000.001", "Infinity", "abc"])
    assert.throws(() => kilometersToMeters(input));
});
