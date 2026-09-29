import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { extname, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import pg from "pg";
import { buildApp } from "../../apps/api/src/app.ts";
import { migrate } from "../../apps/api/src/migrations.ts";
import { bootstrapPlatform } from "../../apps/api/src/platform-admin.ts";
import { newTotpSecret, platformCipher, totp } from "../../apps/api/src/platform-crypto.ts";
import { digest, hashPassword, token } from "../../apps/api/src/security.ts";

const original = process.env.TEST_DATABASE_URL;
assert.ok(original && new URL(original).pathname.endsWith("_test"));
const name = "cc_sa02_browser_" + randomUUID().replaceAll("-", "") + "_test";
const admin = new pg.Pool({ connectionString: original });
await admin.query('CREATE DATABASE "' + name + '"');
const url = new URL(original);
url.pathname = "/" + name;
const db = new pg.Pool({ connectionString: url.href });
await migrate(db, new URL("../../apps/api/migrations/", import.meta.url));
const tenant = new pg.Pool({
  connectionString: url.href,
  options: "-c role=cronocheckpoint_app",
});
const platform = new pg.Pool({
  connectionString: url.href,
  options: "-c role=cronocheckpoint_platform",
});
let apiPort = 0;
const root = resolve("apps/web/dist");
const server = createServer(async (req, res) => {
  if (req.url.startsWith("/api/")) {
    const upstream = httpRequest(
      {
        host: "127.0.0.1",
        port: apiPort,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
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
  const file = resolve(root, "." + (pathname.startsWith("/assets/") ? pathname : "/index.html"));
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
const app = buildApp(async () => {}, false, {
  pool: tenant,
  origin,
  secure: false,
  sendReset: async () => {},
  platform: {
    pool: platform,
    key: "ef".repeat(32),
    origin,
    secure: false,
    sendMail: async () => {},
  },
});
await app.listen({ port: 0, host: "127.0.0.1" });
apiPort = app.server.address().port;
const browser = await chromium.launch({ headless: true, channel: "msedge" });
try {
  const actor = (
    await db.query("INSERT INTO app.users(email) VALUES('super@organization.test') RETURNING id")
  ).rows[0].id;
  await db.query("INSERT INTO app.platform_privileges(user_id,state) VALUES($1,'active')", [actor]);
  const actorPassword = "Actor-password-browser-123";
  const actorSecret = newTotpSecret();
  await db.query("UPDATE app.users SET password_hash=$2 WHERE id=$1", [
    actor,
    await hashPassword(actorPassword),
  ]);
  await db.query("INSERT INTO app.platform_mfa(user_id,secret_cipher) VALUES($1,$2)", [
    actor,
    platformCipher("ef".repeat(32)).seal(actorSecret, actor),
  ]);
  const raw = token();
  await db.query(
    "INSERT INTO app.platform_sessions(token_hash,user_id,auth_version,expires_at,reauthenticated_until) SELECT $1,id,auth_version,now()+interval '1 hour',NULL FROM app.users WHERE id=$2",
    [digest(raw), actor],
  );
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await context.addCookies([
    {
      name: "cc_platform_session",
      value: raw,
      url: origin,
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
  await db.query(
    "INSERT INTO app.organizations(name,active,status,contact_email) SELECT 'Paginação ' || lpad(n::text,2,'0'),false,'pending','contato' || n || '@example.test' FROM generate_series(1,12) n",
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/plataforma/organizacoes");
  await expect(
    page.locator(".crm-sidebar").getByRole("link", { name: "Pessoas", exact: true }),
  ).toHaveCount(0);
  await mkdir("tmp/organization-admin", { recursive: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect(page.getByRole("button", { name: "Recolher painel lateral" })).toBeVisible();
  const directory = page.locator(".organization-directory");
  await expect(directory.locator("tbody tr")).toHaveCount(10);
  const firstPageNames = await directory.locator(".organization-name").allTextContents();
  await directory.getByRole("button", { name: "Próxima", exact: true }).click();
  await expect(directory.locator("tbody tr")).toHaveCount(2);
  await expect(directory.getByRole("button", { name: "Próxima", exact: true })).toBeDisabled();
  await directory.getByRole("button", { name: "Anterior", exact: true }).click();
  await expect(directory.locator("tbody tr")).toHaveCount(10);
  assert.deepEqual(await directory.locator(".organization-name").allTextContents(), firstPageNames);
  await page.getByLabel("Pesquisar organização", { exact: true }).fill("Paginação 12");
  await directory.getByRole("button", { name: "Pesquisar", exact: true }).click();
  await expect(directory.locator("tbody tr")).toHaveCount(1);
  await expect(directory.locator(".organization-name")).toHaveText("Paginação 12");
  await directory.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await expect(directory.locator("tbody tr")).toHaveCount(10);
  await page.getByLabel("Por página", { exact: true }).selectOption("25");
  await expect(directory.locator("tbody tr")).toHaveCount(12);
  await page.getByLabel("Por página", { exact: true }).selectOption("10");
  await expect(directory.locator("tbody tr")).toHaveCount(10);
  await directory
    .getByRole("button", { name: /^Editar / })
    .first()
    .click();
  await expect(page.getByLabel("Nome da organização", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Voltar às organizações", exact: false }).click();
  await expect(directory.locator("tbody tr")).toHaveCount(10);
  await directory.locator("tbody tr").first().locator("td").nth(1).click();
  await expect(page.getByRole("heading", { name: "Etapa 2: criar o responsável" })).toBeVisible();
  await page.getByRole("button", { name: "Voltar às organizações", exact: false }).click();
  await directory.locator("tbody tr").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Etapa 2: criar o responsável" })).toBeVisible();
  await page.getByRole("button", { name: "Voltar às organizações", exact: false }).click();
  await page.screenshot({ path: "tmp/organization-admin/shell-expanded.png" });
  await page.getByRole("button", { name: "Recolher painel lateral" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Expandir painel lateral" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  assert.equal(Math.round((await page.locator(".crm-sidebar").boundingBox()).width), 72);
  for (const name of ["Visão geral", "Super admins", "Convites", "Auditoria", "Organizações"]) {
    const link = page.locator(".crm-sidebar").getByRole("link", { name, exact: true });
    await link.focus();
    await expect(link.locator(".crm-nav-label")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name, level: 1, exact: true })).toBeVisible();
  }
  await page.screenshot({ path: "tmp/organization-admin/shell-collapsed.png" });
  await page.setViewportSize({ width: 390, height: 600 });
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.locator(".crm-sidebar nav a").first()).toBeFocused();
  await expect(page.getByRole("button", { name: "Fechar menu", exact: true })).toBeInViewport();
  for (let i = 0; i < 10; i++) await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => !!document.activeElement.closest(".crm-sidebar")), true);
  await page.screenshot({ path: "tmp/organization-admin/shell-mobile-menu.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.setViewportSize({ width: 1366, height: 600 });
  await expect(page.locator(".crm-main")).not.toHaveAttribute("inert", "");
  await page.getByRole("button", { name: "Expandir painel lateral" }).click();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole("button", { name: "Nova organização", exact: true }).click();
  await expect(page.getByLabel("Telefone", { exact: true })).not.toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(
    page.getByRole("button", { name: "Continuar para o usuário", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: "tmp/organization-admin/setup-step1-1366.png" });
  await page.getByText("Dados adicionais (opcional)", { exact: true }).click();
  await page.getByLabel("Telefone", { exact: true }).fill("11999990000");
  await page.getByLabel("Nome da organização", { exact: true }).fill("Organização Local Sem Email");
  await page.getByLabel("Email de contato", { exact: true }).fill("contact@example.test");
  await page.getByRole("button", { name: "Continuar para o usuário", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Etapa 2: criar o responsável" })).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.getByLabel("Buscar usuário")).toHaveCount(0);
  await page.getByRole("button", { name: "Voltar aos dados da organização", exact: true }).click();
  await expect(page.getByLabel("Nome da organização", { exact: true })).toHaveValue(
    "Organização Local Sem Email",
  );
  await expect(page.getByLabel("Telefone", { exact: true })).toHaveValue("11999990000");
  await page.getByRole("button", { name: "Salvar cadastro", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Etapa 2: criar o responsável" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Etapa 2: criar o responsável" })).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByLabel("Email do usuário", { exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.getByLabel("Confirmar senha temporária", { exact: true })).toBeInViewport({
    ratio: 1,
  });
  await expect(
    page.getByRole("button", { name: "Concluir e ativar organização", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await expect(page.getByLabel("Tipo de acesso", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: "tmp/organization-admin/setup-step2-1366.png" });
  await mkdir("tmp/organization-admin", { recursive: true });
  for (const width of [1280, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({
      path: `tmp/organization-admin/setup-inline-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByLabel("Email do usuário", { exact: true }).fill("owner@organization.test");
  const initial = "Temporary-Access-12345";
  await page.getByLabel("Senha temporária", { exact: true }).fill(initial);
  await page
    .getByLabel("Confirmar senha temporária", { exact: true })
    .fill("Different-password-123");
  await page.getByRole("button", { name: "Concluir e ativar organização", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("As senhas devem ser iguais");
  await expect(page.getByLabel("Email do usuário", { exact: true })).toHaveValue(
    "owner@organization.test",
  );
  await page.getByLabel("Confirmar senha temporária", { exact: true }).fill(initial);
  await page.getByRole("button", { name: "Concluir e ativar organização", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "owner@organization.test", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Ativa · 0 prova(s) em andamento", { exact: true })).toBeVisible();
  const folder = "tmp/organization-admin";
  await mkdir(folder, { recursive: true });
  for (const width of [1280, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({
      path: folder + "/organization-" + width + ".png",
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Redefinir senha", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Redefinir senha", exact: true })).toBeVisible();
  await expect(page.getByLabel("Senha temporária", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Redefinir senha", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Redefinir senha", exact: true }).click();
  assert.equal(await page.locator(".platform-sheet").evaluate((el) => el.matches(":modal")), true);
  const sheetBounds = await page.locator(".platform-sheet").boundingBox();
  assert.ok(sheetBounds.y >= 0 && sheetBounds.y < 2);
  const headerBounds = await page.locator(".platform-sheet > header").boundingBox();
  assert.ok(headerBounds.y >= 0 && headerBounds.y < 2);
  assert.ok(headerBounds.height >= 44);
  await page.evaluate(() => window.scrollTo(0, 0));

  await page.screenshot({ path: folder + "/password-mobile.png" });
  const reset = "Reset-Temporary-54321";
  await page.getByLabel("Senha temporária", { exact: true }).fill(reset);
  await page.getByLabel("Confirmar senha temporária", { exact: true }).fill(reset);
  await page.getByRole("button", { name: "Salvar senha", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar ação", exact: true }).click();
  await expect(
    page.getByText("Acesso atualizado. Senhas novas devem ser trocadas no primeiro login.", {
      exact: true,
    }),
  ).toBeVisible();
  const user = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await user.goto(origin);
  await user.getByLabel("Email", { exact: true }).fill("owner@organization.test");
  await user.getByLabel("Senha", { exact: true }).fill(reset);
  await user.getByRole("button", { name: "Entrar na organização", exact: true }).click();
  await expect(user.getByLabel("Confirmar senha", { exact: true })).toBeVisible();
  await user.getByLabel("Senha", { exact: true }).fill("Personal-New-Password-678");
  await user.getByLabel("Confirmar senha", { exact: true }).fill("Personal-New-Password-678");
  await user.getByRole("button", { name: "Salvar nova senha", exact: true }).click();
  await expect(
    user.getByText("Senha atualizada. Entre com sua nova senha.", {
      exact: true,
    }),
  ).toBeVisible();
  await user.getByLabel("Senha", { exact: true }).fill("Personal-New-Password-678");
  await user.getByRole("button", { name: "Entrar na organização", exact: true }).click();
  await expect(user.getByRole("heading", { name: "Eventos", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .locator(".crm-sidebar")
    .getByRole("link", { name: "Super admins", exact: true })
    .click();
  await page.getByRole("button", { name: "Novo superadmin", exact: true }).click();
  await page
    .getByLabel("Email do novo superadmin", { exact: true })
    .fill("direct-admin@organization.test");
  await page
    .getByLabel("Senha do novo superadmin", { exact: true })
    .fill("Direct-admin-password-123");
  await page.getByLabel("Confirmar senha", { exact: true }).fill("Direct-admin-password-123");
  await page.getByRole("button", { name: "Cadastrar superadmin", exact: true }).click();
  await expect(page.getByLabel("Sua senha atual", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Email do novo superadmin", { exact: true })).toHaveValue(
    "direct-admin@organization.test",
  );
  await page.getByLabel("Sua senha atual", { exact: true }).fill(actorPassword);
  await page
    .getByLabel("Seu código MFA", { exact: true })
    .fill(totp(actorSecret, Math.floor(Date.now() / 30000)));
  await page.getByRole("button", { name: "Confirmar e cadastrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "direct-admin@organization.test", exact: true }),
  ).toBeVisible();
  const superPage = await browser.newPage();
  await superPage.goto(origin + "/plataforma");
  await superPage.getByLabel("Email", { exact: true }).fill("direct-admin@organization.test");
  await superPage.getByLabel("Senha", { exact: true }).fill("Direct-admin-password-123");
  await superPage.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(
    superPage.getByRole("button", { name: "Gerar chave do autenticador" }),
  ).toBeVisible();
  await superPage.close();
  await page
    .locator(".crm-sidebar")
    .getByRole("link", { name: "Configurações", exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: "Exigir Authenticator dos superadmins" }),
  ).toBeChecked();
  await page.getByLabel("Logo da plataforma", { exact: true }).setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByAltText("Prévia do logo")).toBeVisible();
  await page.getByRole("switch").uncheck();
  await page.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(page.getByRole("status")).toHaveText("Configurações salvas.");
  await expect(page.locator(".crm-brand").getByAltText("Logo da plataforma")).toBeVisible();
  await page.getByRole("button", { name: "Restaurar logo TempoGo" }).click();
  await page.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(page.getByAltText("Prévia do logo")).toHaveCount(0);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({ path: folder + "/settings-" + width + ".png", fullPage: true });
  }
  const optional = await browser.newPage();
  await optional.goto(origin + "/plataforma");
  await optional.getByLabel("Email", { exact: true }).fill("direct-admin@organization.test");
  await optional.getByLabel("Senha", { exact: true }).fill("Direct-admin-password-123");
  await optional.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(optional.locator(".crm-sidebar")).toBeVisible();
  await optional.getByLabel("Conta: direct-admin@organization.test").click();
  await optional.getByRole("button", { name: "Confirmar identidade", exact: true }).click();
  await expect(optional.getByLabel("Código do autenticador", { exact: true })).toHaveCount(0);
  await optional.getByLabel("Senha", { exact: true }).fill("Direct-admin-password-123");
  await optional.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(optional.getByRole("status")).toContainText("Identidade confirmada");
  await optional
    .locator(".crm-sidebar")
    .getByRole("link", { name: "Configurações", exact: true })
    .click();
  await optional.getByRole("switch").check();
  const savedSettings = optional.waitForResponse(
    (r) => r.url().endsWith("/platform/settings") && r.request().method() === "POST",
  );
  await optional.getByRole("button", { name: "Salvar configurações" }).click();
  assert.equal((await savedSettings).status(), 200);
  assert.equal((await optional.request.get(origin + "/api/v1/platform/auth/me")).status(), 401);

  await expect(
    optional.getByRole("heading", { name: "Entrar na plataforma", exact: true }),
  ).toBeVisible();
  await optional.close();

  assert.equal((await db.query("SELECT count(*)::int n FROM app.invitation_outbox")).rows[0].n, 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: organização, usuário, ativação, reset e troca de senha sem SMTP; desktop e mobile sem overflow.",
  );
} finally {
  await browser.close();
  await app.close();
  await new Promise((resolve) => server.close(resolve));
  await Promise.all([db.end(), tenant.end(), platform.end()]);
  await admin.query('DROP DATABASE "' + name + '"');
  await admin.end();
}
