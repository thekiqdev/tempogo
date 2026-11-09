import assert from "node:assert/strict";
import test from "node:test";
import { getWiclaxStatus, lanAddresses } from "../../apps/api/src/wiclax-manager.js";

test("lanAddresses retorna apenas IPv4 públicos da máquina ou lista vazia", () => {
  const list = lanAddresses({ NODE_ENV: "development" });
  assert.ok(Array.isArray(list));
  for (const ip of list) {
    assert.match(ip, /^\d{1,3}(\.\d{1,3}){3}$/);
    assert.notEqual(ip, "127.0.0.1");
  }
});

test("WICLAX_ADVERTISE_IP fica em destaque mesmo com outros endereços", () => {
  const preferred = "13.140.182.124";
  const list = lanAddresses({
    NODE_ENV: "production",
    WICLAX_ADVERTISE_IP: preferred,
  });
  assert.equal(list[0], preferred);
});

test("status inicial de evento sem bridge ativo", async () => {
  const id = "00000000-0000-4000-8000-000000000099";
  const s = await getWiclaxStatus(id);
  assert.equal(s.active, false);
  assert.equal(s.event_id, id);
  assert.equal(s.port, null);
  assert.equal(s.clients, 0);
  assert.ok(Array.isArray(s.addresses));
  assert.ok(Array.isArray(s.sources));
});
