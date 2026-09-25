import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";
const mail = process.env.E2E_MAIL_URL ?? "http://127.0.0.1:8025";
if (
  !["localhost", "127.0.0.1"].includes(new URL(base).hostname) ||
  !["localhost", "127.0.0.1"].includes(new URL(mail).hostname)
)
  throw new Error("E2E permitido somente nos ambientes locais sintéticos");
const email = process.env.E2E_EMAIL ?? "admin@corrida-a.test";
const password = randomBytes(24).toString("hex");
const browser = await chromium.launch({
  headless: true,
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
  folder = "tmp/sprint-02/" + (base.startsWith("https") ? "homolog" : "dev");
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
  const finishCheckpointId = await page.getByLabel("Checkpoint do acesso").inputValue();
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
  await expect(field.getByRole("heading", { name: "Capturar", exact: true })).toBeVisible();
  const fieldCookie = (await operator.cookies()).find((c) => c.name === "cc_checkpoint");
  expect(fieldCookie?.httpOnly).toBe(true);
  expect(fieldCookie?.sameSite).toBe("Strict");
  if (base.startsWith("https")) expect(fieldCookie?.secure).toBe(true);
  const bib = field.getByRole("textbox", { name: "Número de peito", exact: true });
  await field.getByRole("button", { name: "Usar teclado do aparelho", exact: true }).click();
  await expect(
    field.getByRole("button", { name: "Registrar passagem ↵", exact: true }),
  ).toBeDisabled();
  await bib.fill("abc");
  await expect(bib).toHaveValue("");
  await expect(field.getByRole("alert")).toContainText("Use somente números");
  await field.getByRole("button", { name: "Usar teclado da tela", exact: true }).click();
  for (const digit of ["0", "0", "1", "5", "2"])
    await field.getByRole("button", { name: digit, exact: true }).click();
  await expect(bib).toHaveValue("00152");
  // Real keypad, small viewports and navigation must preserve the unsaved bib.
  for (const width of [320, 360, 390, 430]) {
    await field.setViewportSize({ width, height: 640 });
    expect(await field.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    const submit = await field
      .getByRole("button", { name: "Registrar passagem ↵", exact: true })
      .boundingBox();
    const nav = await field
      .getByRole("navigation", { name: "Navegação do operador" })
      .boundingBox();
    await field.screenshot({ path: folder + "/layout-check-" + width + ".png", fullPage: true });
    expect(submit.y + submit.height).toBeLessThanOrEqual(nav.y);
    const feedback = await field.locator(".capture-feedback").boundingBox();
    expect(feedback.y + feedback.height).toBeLessThanOrEqual(nav.y);
    await field.screenshot({ path: folder + "/keypad-" + width + ".png", fullPage: true });
  }
  await field.getByRole("link", { name: "Registros", exact: true }).click();
  await expect(field.getByRole("heading", { name: "Registros deste acesso" })).toBeVisible();
  await field.goBack();
  await expect(bib).toBeVisible();
  await expect(bib).toHaveValue("00152");
  await field.getByRole("link", { name: "Aparelho", exact: true }).click();
  await expect(field.getByRole("heading", { name: "Seu aparelho" })).toBeVisible();
  await field.screenshot({ path: folder + "/device-mobile.png", fullPage: true });
  await field.getByRole("link", { name: "Capturar", exact: true }).click();
  await expect(bib).toHaveValue("00152");
  await field.setViewportSize({ width: 390, height: 844 });
  const started = performance.now();
  await bib.press("Enter");
  await expect(field.locator(".capture-feedback")).toContainText("00152");
  const localFeedbackMs = Math.round(performance.now() - started);
  await expect(field.locator(".passage-list li").filter({ hasText: "00152" })).toContainText(
    "Confirmado no servidor",
  );
  await expect(bib).toHaveValue("");
  await field.getByRole("button", { name: "Usar teclado do aparelho", exact: true }).click();
  // A physical double click must create a single durable intent.
  await bib.fill("00777");
  await field.getByRole("button", { name: "Registrar passagem ↵", exact: true }).dblclick();
  await expect(field.locator(".passage-list li").filter({ hasText: "00777" })).toHaveCount(1);
  await expect(field.locator(".passage-list li").filter({ hasText: "00777" })).toContainText(
    "Confirmado no servidor",
  );
  // Failure before local commit preserves input and sends nothing.
  await field.evaluate(() => {
    window.savedIdbOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = () => {
      throw new DOMException("Simulated storage failure", "QuotaExceededError");
    };
  });
  await bib.fill("00888");
  await field.getByRole("button", { name: "Registrar passagem ↵", exact: true }).click();
  await expect(field.getByRole("alert")).toContainText("Não foi possível salvar no aparelho");
  await expect(bib).toHaveValue("00888");
  await field.evaluate(() => {
    indexedDB.open = window.savedIdbOpen;
  });
  await bib.fill("");
  // Drop response after server commit. Durable UUID survives reload and retry.
  let dropped = false;
  const lose = async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = true;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort("failed");
    } else await route.continue();
  };
  await field.route("**/api/v1/field/sync", lose);
  await bib.fill("00999");
  await bib.press("Enter");
  await expect(field.getByRole("status").filter({ hasText: "Envio não confirmado" })).toBeVisible();
  await expect(
    field.locator(".pending-label").filter({ hasText: "Salvo no aparelho" }),
  ).toHaveCount(1);
  await field.unroute("**/api/v1/field/sync", lose);
  await field.reload();
  await field.getByRole("link", { name: "Capturar", exact: true }).click();
  await field.getByRole("button", { name: "Usar teclado do aparelho", exact: true }).click();
  await expect(
    field.locator(".pending-label").filter({ hasText: "Salvo no aparelho" }),
  ).toHaveCount(0, { timeout: 15000 });
  await expect(field.locator(".passage-list li").filter({ hasText: "00999" })).toHaveCount(1);
  await bib.fill("123");
  await operator.setOffline(true);
  await expect(
    field.getByRole("button", { name: "Registrar passagem ↵", exact: true }),
  ).toBeDisabled();
  await operator.setOffline(false);
  await expect(
    field.getByRole("button", { name: "Registrar passagem ↵", exact: true }),
  ).toBeEnabled();
  await field.screenshot({ path: folder + "/capture-mobile.png", fullPage: true });
  expect(await field.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await field.setViewportSize({ width: 1280, height: 900 });
  await field.screenshot({ path: folder + "/capture-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Passagens", exact: true }).click();
  await expect(page.locator(".passage-list li")).toHaveCount(3);
  await expect(page.locator(".passage-list")).toContainText("00152");
  await expect(page.locator(".passage-list")).not.toContainText("00888");
  await page.screenshot({ path: folder + "/admin-passages.png", fullPage: true });
  // A delayed response for the previous point must not erase the selected point's access.
  let outdatedDone;
  const outdatedResponse = new Promise((resolve) => {
    outdatedDone = resolve;
  });
  await page.route("**/api/v1/checkpoints/*/access", async (route) => {
    if (route.request().method() === "GET" && !route.request().url().includes(finishCheckpointId)) {
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({ response });
      outdatedDone();
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Acessos", exact: true }).click();
  await page.getByLabel("Checkpoint do acesso").selectOption({ label: "Chegada" });
  await outdatedResponse;
  await page.screenshot({ path: folder + "/before-revoke.png", fullPage: true });
  await writeFile(folder + "/before-revoke.txt", await page.locator("body").innerText());
  await page.getByRole("button", { name: "Revogar acesso" }).click();
  await expect(page.locator(".access-list")).toContainText("Revogado");
  await bib.fill("123");
  await bib.press("Enter");
  await expect(field.getByRole("alert")).toContainText("Acesso expirado ou revogado");
  await expect(field.locator(".pending-label")).toHaveCount(1);
  expect(errors).toEqual([]);
  await writeFile(
    folder + "/result.json",
    JSON.stringify(
      {
        passed: true,
        base,
        localFeedbackMs,
        journey:
          "admin-issue-field-leadingzeros-doubleclick-storagefailure-lostresponse-reload-retry-revoke",
        javascriptErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, base, localFeedbackMs, artifacts: folder }));
  await operator.close();
} finally {
  await browser.close();
}
