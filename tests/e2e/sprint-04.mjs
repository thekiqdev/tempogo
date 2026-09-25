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
  folder = "tmp/sprint-04/" + (base.startsWith("https") ? "homolog" : "dev");
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
  let releaseInitialHistory;
  const historyGate = new Promise((resolve) => {
    releaseInitialHistory = resolve;
  });
  let initialHistoryReached = false;
  await field.route("**/field/observations", async (route) => {
    if (!initialHistoryReached) {
      initialHistoryReached = true;
      await historyGate;
    }
    await route.continue();
  });
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
  await expect.poll(() => initialHistoryReached).toBe(true);
  await bib.fill("00012");
  await bib.press("Enter");
  await field.getByRole("link", { name: "Registros", exact: true }).click();
  const row = field.locator(".passage-list li").filter({ hasText: "00012" });
  await expect(row).toContainText("Salvo no aparelho");
  releaseInitialHistory();
  await expect(row).toContainText("Confirmado no servidor");
  await row.locator(".record-open").click();
  await row.getByRole("button", { name: "Solicitar revisão" }).click();
  await row.getByLabel("Motivo da solicitação").fill("Número correto é 00021");
  await row.getByRole("button", { name: "Enviar solicitação" }).click();
  await expect(row).toContainText("Solicitação enviada");
  await page.getByRole("button", { name: "Passagens", exact: true }).click();
  await expect(page.locator(".passage-list")).toContainText("Requer revisão");
  await page.getByRole("button", { name: "Revisar 00012", exact: true }).click();
  await page.getByLabel("Número corrigido").fill("00021");
  await page.getByLabel("Motivo da revisão").fill("Conferido com operador da chegada");
  let lost = false;
  const drop = async (route) => {
    if (route.request().method() === "POST" && !lost) {
      lost = true;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  };
  await page.route("**/revisions", drop);
  await page.getByRole("button", { name: "Salvar revisão", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.unroute("**/revisions", drop);
  await page.getByRole("button", { name: "Salvar revisão", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Revisão da passagem 00021", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Revisão da passagem" })).toContainText("Versão 1");
  await page.screenshot({ path: folder + "/review-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: folder + "/review-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Fechar revisão" }).click();
  await page.getByLabel("Número", { exact: true }).fill("00021");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page.locator(".passage-list li")).toHaveCount(1);
  const pendingDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV filtrado" }).click();
  await (await pendingDownload).saveAs(folder + "/passagens.csv");
  await page.getByRole("button", { name: "Configuração", exact: true }).click();
  await page.getByLabel("Próximo estado").selectOption("closed");
  await page.getByLabel("Motivo", { exact: true }).fill("Equipe encerrou a coleta");
  await page.getByRole("button", { name: "Confirmar alteração" }).click();
  await expect(page.getByLabel("Próximo estado")).toHaveValue("running");
  await field.reload();
  await field.getByRole("link", { name: "Capturar", exact: true }).click();
  await field.getByRole("button", { name: "Usar teclado do aparelho", exact: true }).click();
  await expect(field.getByRole("heading", { name: "Capturar", exact: true })).toBeVisible();
  await page.reload();
  await page
    .getByRole("heading", { name: "Corrida de demonstração " + suffix, exact: true })
    .click();
  await page.getByRole("button", { name: "Configuração", exact: true }).click();
  await page
    .getByLabel("Confirmação da conferência")
    .fill("Operador confirmou fila vazia e fechamento");
  await page.getByRole("button", { name: "Confirmar conciliação", exact: true }).click();
  await expect(page.getByText("Conciliado ·", { exact: false })).toBeVisible();
  await page.getByLabel("Próximo estado").selectOption("finalized");
  await page.getByLabel("Motivo", { exact: true }).fill("Revisões e aparelhos conferidos");
  await page.getByRole("button", { name: "Confirmar alteração" }).click();
  await expect(page.getByLabel("Próximo estado")).toHaveValue("closed");
  await page.screenshot({ path: folder + "/finalized.png", fullPage: true });
  await page.getByLabel("Motivo", { exact: true }).fill("Reabrir para conferência administrativa");
  await page.getByRole("button", { name: "Confirmar alteração" }).click();
  await expect(page.getByLabel("Próximo estado")).toHaveValue("running");
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  await expect(page.getByText("Passagem revisada", { exact: true })).toBeVisible();
  await page.screenshot({ path: folder + "/audit.png", fullPage: true });
  expect(errors).toEqual([]);
  await writeFile(
    folder + "/result.json",
    JSON.stringify(
      {
        passed: true,
        base,
        journey:
          "operator-request-review-lostresponse-retry-filter-csv-reconcile-finalize-reopen-audit",
        javascriptErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, base, artifacts: folder }));
  await operator.close();
} finally {
  await browser.close();
}
