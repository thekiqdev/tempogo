import assert from "node:assert/strict";
import test from "node:test";
import { buildAdminPath, parseAdminPath, slugifyEventName } from "../../apps/web/src/admin-path.ts";

const id = "11111111-1111-4111-8111-111111111111";
const cp = "22222222-2222-4222-8222-222222222222";

test("slugify remove acentos e espaços", () => {
  assert.equal(slugifyEventName("Maratona São Paulo"), "maratona-sao-paulo");
});

test("parse lista e criação", () => {
  assert.deepEqual(parseAdminPath("/"), { kind: "list" });
  assert.deepEqual(parseAdminPath("/eventos"), { kind: "list" });
  assert.deepEqual(parseAdminPath("/eventos/novo"), { kind: "create" });
});

test("parse evento com slug, aba e opções", () => {
  assert.deepEqual(parseAdminPath(`/eventos/maratona/${id}/passagens`), {
    kind: "event",
    eventId: id,
    slug: "maratona",
    tab: "observations",
    editEvent: false,
    checkpointId: null,
    checkpointAction: null,
  });
  assert.deepEqual(parseAdminPath(`/eventos/${id}/configuracao/editar`), {
    kind: "event",
    eventId: id,
    slug: "evento",
    tab: "settings",
    editEvent: true,
    checkpointId: null,
    checkpointAction: null,
  });
  assert.deepEqual(parseAdminPath(`/eventos/prova/${id}/checkpoints/${cp}/acessos`), {
    kind: "event",
    eventId: id,
    slug: "prova",
    tab: "checkpoints",
    editEvent: false,
    checkpointId: cp,
    checkpointAction: "access",
  });
});

test("build monta caminho canônico", () => {
  assert.equal(buildAdminPath({ kind: "list" }), "/eventos");
  assert.equal(buildAdminPath({ kind: "create" }), "/eventos/novo");
  assert.equal(
    buildAdminPath({
      kind: "event",
      eventId: id,
      name: "Maratona São Paulo",
      tab: "checkpoints",
      checkpointId: cp,
      checkpointAction: "edit",
    }),
    `/eventos/maratona-sao-paulo/${id}/checkpoints/${cp}/editar`,
  );
});
