import assert from "node:assert/strict";
import test from "node:test";
import { csrfFor, digest, hashPassword, verifyPassword } from "../../apps/api/src/security.js";

test("hash de senha usa salt individual e valida sem armazenar texto puro", async () => {
  const p = "Uma-senha-longa-para-teste";
  const [a, b] = await Promise.all([hashPassword(p), hashPassword(p)]);
  assert.notEqual(a, b);
  assert.equal(a.includes(p), false);
  assert.equal(await verifyPassword(p, a), true);
  assert.equal(await verifyPassword("outra", a), false);
  assert.equal(await verifyPassword(p, null), false);
  assert.notEqual(digest("session"), csrfFor("session"));
});
