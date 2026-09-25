import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const base = process.env.E2E_BASE_URL ?? "https://localhost:5443";
const mail = process.env.E2E_MAIL_URL ?? "http://127.0.0.1:8026";
if (
  !["localhost", "127.0.0.1"].includes(new URL(base).hostname) ||
  !["localhost", "127.0.0.1"].includes(new URL(mail).hostname)
)
  throw new Error("E2E permitido somente nos ambientes locais sintéticos");
const email = process.env.E2E_EMAIL ?? "admin@corrida-a.test";
const password = randomBytes(24).toString("hex");
const browser = await chromium.launch({
  headless: true,
  args: base === "https://localhost:5443" ? ["--ignore-certificate-errors"] : [],
  channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge",
});
// Exceção restrita ao certificado autoassinado da homologação local; não altera o sistema.
const context = await browser.newContext({
  ignoreHTTPSErrors: base === "https://localhost:5443",
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const suffix = new Date().toISOString().replace(/[:.]/g, "-"),
  folder =
    "tmp/sprint-03-edge/" +
    (base.startsWith("https")
      ? Number(process.env.SOAK_MINUTES ?? 0) > 0
        ? "homolog-soak"
        : "homolog"
      : "dev");
await mkdir(folder, { recursive: true });
try {
  await page.goto(base);
  await expect(page.getByRole("heading", { name: "Bem-vindo de volta" })).toBeVisible();
  await page.screenshot({ path: folder + "/login.png", fullPage: true });
  await page.getByRole("button", { name: "Esqueci minha senha" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Enviar instruções" }).click();
  await expect(page.getByRole("status")).toContainText("Se o email");
  const messages = await (await fetch(mail + "/api/v1/messages")).json();
  const message = messages.messages.find((m) => m.To.some((to) => to.Address === email));
  if (!message) throw new Error("Email local de recuperação não encontrado");
  const detail = await (await fetch(mail + "/api/v1/message/" + message.ID)).json();
  const match = detail.Text.match(/#reset=([a-f0-9]{64})/);
  if (!match) throw new Error("Token ausente no email local");
  await page.goto(base + "/reset#reset=" + match[1]);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByLabel("Confirmar senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page.getByRole("heading", { name: "Bem-vindo de volta" })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar na organização" }).click();
  await expect(page.getByRole("heading", { name: "Eventos", exact: true })).toBeVisible();
  const cookie = (await context.cookies()).find((c) => c.name === "cc_session");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");
  if (base.startsWith("https")) expect(cookie?.secure).toBe(true);
  await page.getByRole("button", { name: "+ Novo evento", exact: true }).click();
  await page.getByLabel("Nome do evento").fill("Corrida de demonstração " + suffix);
  await page.getByLabel("Modalidade", { exact: true }).fill("Corrida 5 km");
  await page.getByLabel("Distância (km, opcional)").fill("5");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByLabel("Data da prova").fill("2026-10-04");
  await page.getByLabel("Local", { exact: true }).fill("Parque da Cidade");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Salvar evento", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Corrida de demonstração " + suffix, exact: true }),
  ).toBeVisible();
  for (const [name, kind, sequence, distance] of [
    ["Largada", "start", "1", "0"],
    ["CP 2,5 km", "intermediate", "2", "2500"],
    ["Chegada", "finish", "3", "5000"],
  ]) {
    await page.getByRole("button", { name: "+ Adicionar checkpoint", exact: true }).click();
    await page.getByLabel("Nome do checkpoint").fill(name);
    await page.locator('input[name="kind"][value="' + kind + '"]').check();
    await page.getByLabel("Ordem no percurso").fill(sequence);
    await page.getByLabel("Distância acumulada (km)").fill(String(Number(distance) / 1000));
    await page.getByRole("button", { name: "Salvar checkpoint", exact: true }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await page.screenshot({ path: folder + "/checkpoints.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: folder + "/checkpoints-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Configuração", exact: true }).click();
  await page.getByLabel("Próximo estado").selectOption("ready");
  await page.getByLabel("Motivo", { exact: true }).fill("Percurso revisado pela equipe");
  await page.getByRole("button", { name: "Confirmar alteração", exact: true }).click();
  await expect(page.locator(".page-title .badge")).toHaveText("Pronto");

  await page.getByLabel("Próximo estado").selectOption("running");
  await page.getByLabel("Motivo", { exact: true }).fill("Largada da demonstração manual");
  await page.getByRole("button", { name: "Confirmar alteração", exact: true }).click();
  await expect(page.locator(".page-title .badge")).toHaveText("Em andamento");
  await page.getByRole("button", { name: "Acessos", exact: true }).click();
  await page.getByLabel("Checkpoint do acesso").selectOption({ label: "Chegada" });
  await page.getByLabel("Identificação do aparelho").fill("Chegada · celular de teste");
  await page
    .getByLabel("Válido até")
    .fill(
      new Date(Date.now() + 3600000 - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16),
    );
  await page.getByRole("button", { name: "Gerar código e senha" }).click();
  const code = await page.getByTestId("issued-code").innerText();
  const secret = await page.getByTestId("issued-password").innerText();
  await page.getByRole("button", { name: "Já guardei a senha" }).click();
  await page.screenshot({ path: folder + "/access.png", fullPage: true });
  const operator = await browser.newContext({
    ignoreHTTPSErrors: base === "https://localhost:5443",
    viewport: { width: 390, height: 844 },
  });
  const field = await operator.newPage();
  field.on("pageerror", (e) => errors.push(e.message));
  await field.goto(base + "/checkpoint");
  await field.getByLabel("Código do checkpoint").fill(code);
  await field.getByLabel("Senha do checkpoint").fill(secret);
  await field.getByRole("button", { name: "Entrar no checkpoint" }).click();
  await expect(
    field.getByRole("heading", { name: "Registrar passagem", exact: true }),
  ).toBeVisible();
  const fieldCookie = (await operator.cookies()).find((c) => c.name === "cc_checkpoint");
  expect(fieldCookie?.httpOnly).toBe(true);
  expect(fieldCookie?.sameSite).toBe("Strict");
  if (base.startsWith("https")) expect(fieldCookie?.secure).toBe(true);
  const bib = field.getByRole("textbox", { name: "Número de peito", exact: true });

  await field.getByRole("button", { name: "Preparar aparelho", exact: true }).click();
  await expect(field.getByText("Preparado para interrupções", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(field.getByRole("status")).toContainText("Aparelho preparado");

  const readQueue = () =>
    field.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open("cronocheckpoint-manual", 2);
          r.onsuccess = () => {
            const db = r.result,
              tx = db.transaction("intents", "readonly"),
              q = tx.objectStore("intents").getAll();
            tx.oncomplete = () => {
              db.close();
              resolve(q.result);
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
  await operator.setOffline(true);
  await field.clock.setFixedTime(new Date(Date.now() + 600000));
  for (const value of ["00333", "00444", "00555"]) {
    await bib.fill(value);
    await bib.press("Enter");
    await expect(bib).toHaveValue("");
  }
  const original = await readQueue();
  expect(original.every((i) => i.payload.clock.uncertain)).toBe(true);
  await field.clock.setFixedTime(new Date(Date.now() + 3 * 3600000));
  await field.reload();
  await expect(
    field.getByRole("button", { name: "Registrar passagem ↵", exact: true }),
  ).toBeDisabled();
  await field.clock.setFixedTime(new Date());
  await field.reload();
  await expect(
    field.getByRole("button", { name: "Registrar passagem ↵", exact: true }),
  ).toBeEnabled();
  let dropped = false;
  await field.route("**/api/v1/field/sync", async (route) => {
    const p = route.request().postDataJSON();
    if (p.bib === "00444") {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Conflito simulado por item" } }),
      });
      return;
    }
    if (p.bib === "00333" && !dropped) {
      dropped = true;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await operator.setOffline(false);
  await expect
    .poll(
      async () => {
        const q = await readQueue();
        return q.filter((i) => i.status === "synced").length;
      },
      { timeout: 30000 },
    )
    .toBe(2);
  let queue = await readQueue();
  expect(queue.filter((i) => i.status === "blocked")).toHaveLength(1);
  expect(queue.map((i) => JSON.stringify(i.payload)).sort()).toEqual(
    original.map((i) => JSON.stringify(i.payload)).sort(),
  );
  await field.unroute("**/api/v1/field/sync");
  await field.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(field.getByRole("alert")).toContainText("Há registros pendentes");
  // Known revocation remains blocked even after an offline reload.
  await page.getByRole("button", { name: "Revogar acesso" }).click();
  await expect(page.locator(".access-list")).toContainText("Revogado");
  await field.getByRole("button", { name: "Atualizar situação da corrida e registros" }).click();
  await expect(field.getByRole("alert")).toContainText("Acesso expirado ou revogado");
  await operator.setOffline(true);
  await field.reload();
  await expect(
    field.getByRole("button", { name: "Registrar passagem ↵", exact: true }),
  ).toBeDisabled();
  queue = await readQueue();
  expect(queue).toHaveLength(3);
  await field.screenshot({ path: folder + "/blocked-viewport.png" });
  const fresh = await browser.newContext({ ignoreHTTPSErrors: true }),
    migration = await fresh.newPage();
  await migration.goto(base);
  await migration.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("cronocheckpoint-manual", 1);
        r.onupgradeneeded = () =>
          r.result.createObjectStore("intents", { keyPath: "client_event_id" });
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("intents", "readwrite");
          tx.objectStore("intents").put({
            client_event_id: "legacy-sentinel",
            session_id: "old-session",
            bib: "0001",
            raw_captured_at: "2026-09-01T10:00:00.000Z",
            status: "pending",
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await migration.goto(base + "/checkpoint");
  await expect(migration.getByRole("heading", { name: "Entre no seu checkpoint" })).toBeVisible();
  const preserved = await migration.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open("cronocheckpoint-manual", 2);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("intents", "readonly"),
            q = tx.objectStore("intents").get("legacy-sentinel");
          tx.oncomplete = () => {
            resolve({ version: db.version, row: q.result });
            db.close();
          };
        };
      }),
  );
  expect(preserved.version).toBe(2);
  expect(preserved.row.bib).toBe("0001");
  expect(preserved.row.status).toBe("pending");
  await fresh.close();
  expect(errors).toEqual([]);
  const result = {
    passed: true,
    partialResponses: true,
    lostResponse: true,
    clockJump: true,
    expiredGrant: true,
    revokedOfflineReload: true,
    migrationPreservesPending: true,
  };
  await writeFile(folder + "/result.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  await operator.close();
} finally {
  await browser.close();
}
