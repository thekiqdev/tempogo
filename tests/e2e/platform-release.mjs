import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { extname, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import pg from "pg";
import { buildApp } from "../../apps/api/src/app.ts";
import { migrate } from "../../apps/api/src/migrations.ts";
import { bootstrapPlatform } from "../../apps/api/src/platform-admin.ts";
import { totp } from "../../apps/api/src/platform-crypto.ts";
import { platformMailSender } from "../../apps/api/src/platform-mail.ts";
import { csrfFor } from "../../apps/api/src/security.ts";

const original = process.env.TEST_DATABASE_URL;
assert.ok(original && new URL(original).pathname.endsWith("_test"));
const name = "cc_sa02_browser_" + randomUUID().replaceAll("-", "") + "_test";
const admin = new pg.Pool({ connectionString: original });
await admin.query('CREATE DATABASE "' + name + '"');
const url = new URL(original);
url.pathname = "/" + name;
const db = new pg.Pool({ connectionString: url.href });
await migrate(db, new URL("../../apps/api/migrations/", import.meta.url));
const tenant = new pg.Pool({ connectionString: url.href, options: "-c role=cronocheckpoint_app" });
const platform = new pg.Pool({
  connectionString: url.href,
  options: "-c role=cronocheckpoint_platform",
});
let apiPort = 0;
const root = resolve("apps/web/dist");
const server = createServer(async (req, res) => {
  if (req.url.startsWith("/api/")) {
    const upstream = httpRequest(
      { host: "127.0.0.1", port: apiPort, path: req.url, method: req.method, headers: req.headers },
      (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      },
    );
    upstream.on("error", () => res.writeHead(502).end());
    req.pipe(upstream);
    return;
  }
  const pathname = new URL(req.url, "http://localhost").pathname;
  const file = resolve(
    root,
    "." + (pathname.startsWith("/assets/") || pathname === "/sw.js" ? pathname : "/index.html"),
  );
  if (!file.startsWith(root + "/") && !file.startsWith(root + "\\")) {
    res.writeHead(404).end();
    return;
  }
  try {
    const data = await readFile(file);
    res.setHeader(
      "Content-Type",
      { ".js": "text/javascript", ".css": "text/css", ".html": "text/html" }[extname(file)] ??
        "application/octet-stream",
    );
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
const delivered = [];
const sendLocal = platformMailSender({ SMTP_HOST: "127.0.0.1", SMTP_PORT: "1025" }, origin);
const app = buildApp(async () => {}, false, {
  pool: tenant,
  origin,
  secure: false,
  sendReset: async (email, raw) => sendLocal(email, raw, "user-password"),
  platform: {
    pool: platform,
    key: "ef".repeat(32),
    origin,
    secure: false,
    sendMail: async (email, raw, kind) => {
      await sendLocal(email, raw, kind);
      delivered.push({ email, raw, kind });
    },
  },
});
await app.listen({ port: 0, host: "127.0.0.1" });
apiPort = app.server.address().port;
const browser = await chromium.launch({ headless: true, channel: "msedge" });
try {
  const email = "super@browser.test",
    password = "Browser-SA02-password-123";
  const raw = await bootstrapPlatform(db, email);
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/plataforma#reset=" + raw);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByLabel("Confirmar senha").fill(password);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Entrar na plataforma" })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Configure seu autenticador" })).toBeVisible();
  await page.getByRole("button", { name: "Gerar chave do autenticador" }).click();
  const secret = await page.getByTestId("totp-secret").innerText();
  await page
    .getByLabel("Código do autenticador", { exact: true })
    .fill(totp(secret, Math.floor(Date.now() / 30000)));
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Painel da plataforma" })).toBeVisible();
  await expect(page.locator(".platform-codes li")).toHaveCount(10);
  await page.getByRole("button", { name: "Guardei os códigos" }).click();
  await page.locator(".crm-account summary").click();
  await page.getByRole("button", { name: "Confirmar identidade", exact: true }).click();
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page
    .getByLabel("Código do autenticador", { exact: true })
    .fill(totp(secret, Math.floor(Date.now() / 30000) + 1));
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Visão geral", level: 1 })).toBeVisible();
  await page
    .locator(".crm-sidebar")
    .getByRole("link", { name: "Organizações", exact: true })
    .click();
  await page.getByRole("button", { name: "Nova organização", exact: true }).click();
  await page.getByLabel("Nome da organização", { exact: true }).fill("Organização E2E SA03");
  await page.getByLabel("Email de contato", { exact: true }).fill("owner@browser.test");
  await page
    .getByLabel("Email do primeiro responsável", { exact: true })
    .fill("owner@browser.test");
  await page.getByRole("button", { name: "Criar e convidar", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar ação", exact: true }).click();
  await expect(page.locator(".platform-orgs").getByRole("status")).toContainText(
    "Organização criada",
  );
  await expect
    .poll(() => delivered.filter((m) => m.kind === "invitation").length, { timeout: 20000 })
    .toBe(1);
  const ownerPage = await browser.newPage();
  await ownerPage.goto(
    origin + "/plataforma#invite=" + delivered.find((m) => m.kind === "invitation").raw,
  );
  await expect(ownerPage.getByRole("heading", { name: "Organização E2E SA03" })).toBeVisible();
  await ownerPage.getByLabel("Senha", { exact: true }).fill("Owner-browser-password-123");
  await ownerPage.getByLabel("Confirmar senha", { exact: true }).fill("Owner-browser-password-123");
  await ownerPage.getByRole("button", { name: "Aceitar convite", exact: true }).click();
  await expect(ownerPage.getByRole("status")).toContainText("Convite aceito");
  await page.getByRole("button", { name: "Atualizar situação", exact: true }).click();
  await expect(page.getByText("Ativa · 0 prova(s) em andamento", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resumo", exact: true }).click();
  await page.getByText("Alterar situação da organização", { exact: true }).click();

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirmar situação", exact: true }).click();
  await page.getByLabel("Motivo desta ação").fill("Alteração administrativa sintética da situação");
  await page.getByRole("button", { name: "Confirmar ação", exact: true }).click();
  await expect(page.getByText("Suspensa · 0 prova(s) em andamento", { exact: true })).toBeVisible();

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirmar situação", exact: true }).click();
  await page.getByLabel("Motivo desta ação").fill("Alteração administrativa sintética da situação");
  await page.getByRole("button", { name: "Confirmar ação", exact: true }).click();
  await expect(page.getByText("Ativa · 0 prova(s) em andamento", { exact: true })).toBeVisible();
  await page.locator(".crm-sidebar").getByRole("link", { name: "Pessoas", exact: true }).click();
  const accounts = page.locator(".platform-accounts");
  await accounts.getByLabel("Pesquisar conta por email").fill("owner@browser.test");
  await accounts.getByRole("button", { name: "Pesquisar contas", exact: true }).click();
  await accounts.getByRole("button", { name: "owner@browser.test", exact: true }).click();

  await accounts.getByLabel("Novo email de acesso").fill("updated@browser.test");
  await accounts.getByRole("button", { name: "Solicitar alteração de email", exact: true }).click();
  await page.getByLabel("Motivo desta ação").fill("Atualização cadastral de teste");
  await page.getByRole("button", { name: "Confirmar ação", exact: true }).click();
  await expect(accounts.getByRole("status")).toContainText("Confirmação enviada");
  await expect.poll(() => delivered.some((m) => m.kind === "email"), { timeout: 25000 }).toBe(true);
  await ownerPage.goto("about:blank");
  await ownerPage.goto(
    origin + "/plataforma#email-change=" + delivered.find((m) => m.kind === "email").raw,
  );
  await ownerPage.getByLabel("Senha atual").fill("Owner-browser-password-123");
  await ownerPage.getByRole("button", { name: "Confirmar email", exact: true }).click();
  await expect(ownerPage.getByRole("status")).toContainText("Email atualizado");
  await page
    .locator(".crm-sidebar")
    .getByRole("link", { name: "Super admins", exact: true })
    .click();
  await accounts.getByLabel("Email do novo super admin").fill("second@browser.test");
  await accounts.getByRole("button", { name: "Convidar super admin", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar ação", exact: true }).click();
  await expect
    .poll(() => delivered.some((m) => m.kind === "super-invitation"), { timeout: 25000 })
    .toBe(true);
  await ownerPage.goto("about:blank");
  await ownerPage.goto(
    origin + "/plataforma#super-invite=" + delivered.find((m) => m.kind === "super-invitation").raw,
  );
  await ownerPage.getByLabel("Senha", { exact: true }).fill("Second-browser-password-123");
  await ownerPage
    .getByLabel("Confirmar senha", { exact: true })
    .fill("Second-browser-password-123");
  await ownerPage.getByRole("button", { name: "Aceitar convite", exact: true }).click();
  await expect(ownerPage.getByRole("status")).toContainText("MFA");
  await ownerPage.goto(origin + "/plataforma");
  await ownerPage.getByLabel("Email", { exact: true }).fill("second@browser.test");
  await ownerPage.getByLabel("Senha", { exact: true }).fill("Second-browser-password-123");
  await ownerPage.getByRole("button", { name: "Continuar", exact: true }).click();
  await ownerPage.getByRole("button", { name: "Gerar chave do autenticador" }).click();
  const secondSecret = await ownerPage.getByTestId("totp-secret").innerText();
  await ownerPage
    .getByLabel("Código do autenticador", { exact: true })
    .fill(totp(secondSecret, Math.floor(Date.now() / 30000)));
  await ownerPage.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(ownerPage.getByRole("heading", { name: "Painel da plataforma" })).toBeVisible();
  await ownerPage.close();
  await page
    .locator(".crm-sidebar")
    .getByRole("link", { name: "Visão geral", exact: true })
    .click();
  await page.getByRole("button", { name: "Atualizar indicadores", exact: true }).click();
  await expect(page.locator(".platform-overview")).toContainText("Organização E2E SA03");
  await page.locator(".crm-sidebar").getByRole("link", { name: "Auditoria", exact: true }).click();
  await page.getByLabel("Código de ação (opcional)").fill("organization.created");
  await page.getByRole("button", { name: "Consultar auditoria", exact: true }).click();
  await expect(page.locator(".platform-audit ol")).toContainText("Organização criada");
  await page.locator(".platform-audit summary").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".platform-audit")).toContainText("Requisição:");
  await page
    .locator(".crm-sidebar")
    .getByRole("link", { name: "Organizações", exact: true })
    .click();
  await page.getByRole("button", { name: "Nova organização", exact: true }).click();
  await page.getByLabel("Nome da organização", { exact: true }).fill("Segunda organização SA06");
  await page.getByLabel("Email de contato", { exact: true }).fill("owner-two@browser.test");
  await page
    .getByLabel("Email do primeiro responsável", { exact: true })
    .fill("owner-two@browser.test");
  await page.getByRole("button", { name: "Criar e convidar", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar ação", exact: true }).click();
  await expect
    .poll(() => delivered.some((m) => m.email === "owner-two@browser.test"), { timeout: 25000 })
    .toBe(true);
  const secondOwner = await browser.newPage();
  await secondOwner.goto(
    origin +
      "/plataforma#invite=" +
      delivered.find((m) => m.email === "owner-two@browser.test").raw,
  );
  await secondOwner.getByLabel("Senha", { exact: true }).fill("Second-owner-SA06-password");
  await secondOwner
    .getByLabel("Confirmar senha", { exact: true })
    .fill("Second-owner-SA06-password");
  await secondOwner.getByRole("button", { name: "Aceitar convite", exact: true }).click();
  await expect(secondOwner.getByRole("status")).toContainText("Convite aceito");
  await secondOwner.close();
  const mailbox = await (await fetch("http://127.0.0.1:8025/api/v1/messages")).json();
  for (const address of [
    "owner@browser.test",
    "owner-two@browser.test",
    "second@browser.test",
    "updated@browser.test",
  ])
    assert.ok(mailbox.messages.some((m) => m.To.some((t) => t.Address === address)));
  await mkdir("tmp/ux-sa-06/browser", { recursive: true });
  await page.screenshot({ path: "tmp/ux-sa-06/browser/panel-desktop.png", fullPage: true });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Organizações", level: 1 })).toBeVisible();
  await expect(page.locator(".platform-orgs")).toContainText("Segunda organização SA06");
  await page.getByRole("button", { name: "Cadastro", exact: true }).click();
  await page.getByLabel("Nome da organização", { exact: true }).fill("Rascunho não salvo");
  await page
    .locator(".crm-sidebar")
    .getByRole("link", { name: "Visão geral", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Descartar alterações");
  await page.getByRole("dialog").getByRole("button", { name: "Voltar", exact: true }).click();
  await expect(page.getByLabel("Nome da organização", { exact: true })).toHaveValue(
    "Rascunho não salvo",
  );
  await page
    .locator(".crm-sidebar")
    .getByRole("link", { name: "Visão geral", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirmar ação", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Visão geral", level: 1 })).toBeVisible();
  await page.locator(".crm-sidebar").getByRole("link", { name: "Convites", exact: true }).click();
  await page.getByLabel("Email do convite").fill("owner-two@browser.test");
  await page.getByRole("button", { name: "Pesquisar convites", exact: true }).click();
  await expect(page.locator(".crm-directory")).toContainText("owner-two@browser.test");
  await page.screenshot({ path: "tmp/ux-sa-06/browser/invitations-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.locator(".crm-sidebar nav a").first()).toBeFocused();
  for (let i = 0; i < 10; i++) await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => !!document.activeElement.closest(".crm-sidebar")), true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeFocused();

  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: "tmp/ux-sa-06/browser/panel-mobile.png", fullPage: true });
  for (const width of [390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({
      path: "tmp/ux-sa-06/browser/invitations-" + width + ".png",
      fullPage: true,
    });
  }
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: "tmp/ux-sa-06/browser/invitations-zoom2.png", fullPage: true });
  await page.evaluate(() => {
    document.documentElement.style.zoom = "";
  });
  const sessionCookie = (await page.context().cookies()).find(
    (c) => c.name === "cc_platform_session",
  ).value;
  const organization = (
    await db.query(
      "SELECT m.organization_id FROM app.memberships m JOIN app.users u ON u.id=m.user_id WHERE u.email='updated@browser.test'",
    )
  ).rows[0].organization_id;
  // All synthetic browser contexts share one local IP. Respect the production
  // request window before starting the separate organizer/field regression.
  console.log("Aguardando renovação da janela HTTP antes do ensaio offline (61s).");
  await new Promise((resolve) => setTimeout(resolve, 61000));
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["tests/e2e/platform-offline.mjs"], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        E2E_BASE_URL: origin,
        E2E_MAIL_URL: "http://127.0.0.1:8025",
        E2E_EMAIL: "updated@browser.test",
        E2E_PLATFORM_SESSION: sessionCookie,
        E2E_PLATFORM_CSRF: csrfFor(sessionCookie),
        E2E_ORGANIZATION: organization,
      },
    });
    child.stdout.on("data", (b) => process.stdout.write(b));
    child.stderr.on("data", (b) => process.stderr.write(b));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(Error("Offline suspension failed")),
    );
  });
  await page.locator(".crm-account summary").click();
  await page.getByRole("button", { name: "Sair da plataforma" }).click();
  await expect(page.getByRole("heading", { name: "Entrar na plataforma" })).toBeVisible();
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    localSMTP: true,
    offlineSuspensionRecovery: true,
    twoOrganizationsTwoSuperAdmins: true,
    realPostgres: true,
    realBrowser: browser.version(),
    organizationInvitationActivationSuspensionReactivation: true,
    viewport360: true,
    viewportWidths: [360, 390, 768, 1280, 1440],
    cssZoom200: true,
    mobileKeyboardFocus: true,
    unsavedDraftProtection: true,
    invitationDirectory: true,
    errors,
  };
  await writeFile("tmp/ux-sa-06/browser/browser.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  await app.close();
  await new Promise((resolve) => server.close(resolve));
  await Promise.all([db.end(), tenant.end(), platform.end()]);
  await admin.query('DROP DATABASE "' + name + '"');
  await admin.end();
}
