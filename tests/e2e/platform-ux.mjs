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
import { totp } from "../../apps/api/src/platform-crypto.ts";

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
  await expect(
    page.getByRole("heading", { name: "Painel da plataforma", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".platform-codes li")).toHaveCount(10);
  await page.getByRole("button", { name: "Guardei os códigos" }).click();
  await mkdir("tmp/ux-sa-02", { recursive: true });
  await page.screenshot({ path: "tmp/ux-sa-02/panel-desktop.png", fullPage: true });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true, level: 1 }),
  ).toBeVisible();
  await page
    .locator(".crm-sidebar")
    .getByRole("link", { name: "Organizações", exact: true })
    .click();
  await expect(page).toHaveURL(/plataforma\/organizacoes$/);
  await expect(page.locator(".platform-orgs")).toBeVisible();
  await expect(page.locator(".platform-audit")).toHaveCount(0);
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true, level: 1 }).first(),
  ).toBeVisible();
  for (const status of [401, 403, 409, 429]) {
    await page.route("**/api/v1/platform/organizations?*", (route) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Falha controlada " + status } }),
      }),
    );
    await page.goto(origin + "/plataforma/organizacoes");
    await expect(page.getByRole("alert")).toContainText("Falha controlada " + status);
    await page.unroute("**/api/v1/platform/organizations?*");
  }
  await page.route("**/api/v1/platform/organizations?*", (route) => route.abort());
  await page.goto(origin + "/plataforma/organizacoes");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.unroute("**/api/v1/platform/organizations?*");
  await page.goto(origin + "/plataforma");
  await expect(page.getByRole("heading", { name: "Visão geral", level: 1 })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: "tmp/ux-sa-02/panel-mobile.png", fullPage: true });
  await page.locator(".crm-account summary").click();
  await page.getByRole("button", { name: "Sair da plataforma" }).click();
  await expect(page.getByRole("heading", { name: "Entrar na plataforma" })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Verificação em duas etapas" })).toBeVisible();
  await page
    .getByLabel("Código do autenticador", { exact: true })
    .fill(totp(secret, Math.floor(Date.now() / 30000) + 1));
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true, level: 1 }),
  ).toBeVisible();
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    realPostgres: true,
    realBrowser: browser.version(),
    bootstrapResetEnrollmentLoginLogout: true,
    viewport360: true,
    readErrors: [401, 403, 409, 429, "network"],
    historyNavigation: true,
    errors,
  };
  await writeFile("tmp/ux-sa-02/browser.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  await app.close();
  await new Promise((resolve) => server.close(resolve));
  await Promise.all([db.end(), tenant.end(), platform.end()]);
  await admin.query('DROP DATABASE "' + name + '"');
  await admin.end();
}
