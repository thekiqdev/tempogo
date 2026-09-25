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
const email = "admin@corrida-a.test";
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
  folder = "tmp/sprint-01/" + (base.startsWith("https") ? "homolog" : "dev");
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
  await page.getByLabel("Próximo estado").selectOption("draft");
  await page.getByLabel("Motivo", { exact: true }).fill("Retorno para ajuste antes da prova");
  await page.getByRole("button", { name: "Confirmar alteração", exact: true }).click();
  await expect(page.locator(".page-title .badge")).toHaveText("Rascunho");
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  await expect(page.getByText("Retorno para ajuste antes da prova", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "← Todos os eventos", exact: true }).click();
  await page.screenshot({ path: folder + "/events.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: folder + "/mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.locator(".sidebar-bottom summary").click();
  await page.getByRole("button", { name: "Sair da conta ↗", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bem-vindo de volta" })).toBeVisible();
  expect(errors).toEqual([]);
  await writeFile(
    folder + "/result.json",
    JSON.stringify(
      {
        passed: true,
        base,
        journey: "reset-login-event-3checkpoints-transition-audit-logout",
        javascriptErrors: errors,
        mobileOverflow: false,
        secureCookie: cookie?.secure,
      },
      null,
      2,
    ),
  );
  console.log(
    "E2E aprovado: recuperação, login, evento, 3 checkpoints, transições, auditoria, logout e viewport móvel.",
  );
} catch (error) {
  await page.screenshot({ path: folder + "/failure.png", fullPage: true });
  throw error;
} finally {
  await browser.close();
}
