import assert from "node:assert/strict";
import test from "node:test";
import { getWiclaxStatus, lanAddresses } from "../../apps/api/src/wiclax-manager.js";

test("lanAddresses retorna apenas IPv4 públicos da máquina ou lista vazia", () => {
  const list = lanAddresses();
  assert.ok(Array.isArray(list));
  for (const ip of list) {
    assert.match(ip, /^\d{1,3}(\.\d{1,3}){3}$/);
    assert.notEqual(ip, "127.0.0.1");
  }
});

test("status inicial de checkpoint sem bridge ativo", () => {
  const id = "00000000-0000-4000-8000-000000000099";
  const s = getWiclaxStatus(id);
  assert.equal(s.active, false);
  assert.equal(s.checkpoint_id, id);
  assert.equal(s.event_id, null);
  assert.equal(s.port, null);
  assert.equal(s.clients, 0);
  assert.ok(Array.isArray(s.addresses));
});
