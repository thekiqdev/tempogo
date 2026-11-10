import assert from "node:assert/strict";
import test from "node:test";
import type pg from "pg";
import {
  getWiclaxStatus,
  lanAddresses,
  loadWiclaxPortPool,
} from "../../apps/api/src/wiclax-manager.js";
import { formatWiclaxPortPool, parseWiclaxPortPool } from "../../apps/api/src/wiclax-ports.js";

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

test("parseWiclaxPortPool aceita faixa e lista", () => {
  assert.deepEqual(parseWiclaxPortPool("3097-3116").slice(0, 3), [3097, 3098, 3099]);
  assert.equal(parseWiclaxPortPool("3097-3116").length, 20);
  assert.deepEqual(parseWiclaxPortPool("3097, 3100, 3098"), [3097, 3098, 3100]);
  assert.equal(formatWiclaxPortPool([3097, 3098, 3099, 3101]), "3097-3099, 3101");
});

test("status inicial de checkpoint sem bridge ativo", async () => {
  const id = "00000000-0000-4000-8000-000000000099";
  const s = await getWiclaxStatus(id);
  assert.equal(s.active, false);
  assert.equal(s.checkpoint_id, id);
  assert.equal(s.port, null);
  assert.equal(s.clients, 0);
  assert.ok(Array.isArray(s.addresses));
  assert.ok(s.pool_size >= 1);
  assert.equal(typeof s.pool_exhausted, "boolean");
});

test("loadWiclaxPortPool usa exatamente as portas cadastradas, em ordem", async () => {
  const pool = {
    query: async () => ({ rows: [{ wiclax_ports: [3052, 3050, 3050, 3051] }] }),
  } as unknown as pg.Pool;
  assert.deepEqual(await loadWiclaxPortPool(pool), [3050, 3051, 3052]);
});

test("loadWiclaxPortPool não inventa o default quando o cadastro está vazio", async () => {
  const pool = {
    query: async () => ({ rows: [{ wiclax_ports: [] }] }),
  } as unknown as pg.Pool;
  assert.deepEqual(await loadWiclaxPortPool(pool), []);
});

test("loadWiclaxPortPool falha em vez de inventar portas se a leitura quebrar", async () => {
  const pool = {
    query: async () => {
      throw new Error("permission denied for column singleton");
    },
  } as unknown as pg.Pool;
  await assert.rejects(() => loadWiclaxPortPool(pool), /Não foi possível ler o pool/);
});
