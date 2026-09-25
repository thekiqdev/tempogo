import { randomBytes, randomUUID } from "node:crypto";
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
page.on("response", (r) => {
  if (r.status() >= 400 && new URL(r.url()).pathname.startsWith("/api/"))
    console.log(JSON.stringify({ status: r.status(), path: new URL(r.url()).pathname }));
});
const suffix = new Date().toISOString().replace(/[:.]/g, "-"),
  folder = "tmp/ux-sa-06/offline-suspension";
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
  await page.setViewportSize({ width: Number(process.env.E2E_MOBILE_WIDTH ?? 390), height: 844 });
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
  await expect(field.getByRole("heading", { name: "Capturar", exact: true })).toBeVisible();
  const fieldCookie = (await operator.cookies()).find((c) => c.name === "cc_checkpoint");
  expect(fieldCookie?.httpOnly).toBe(true);
  expect(fieldCookie?.sameSite).toBe("Strict");
  if (base.startsWith("https")) expect(fieldCookie?.secure).toBe(true);
  const bib = field.getByRole("textbox", { name: "Número de peito", exact: true });
  await field.getByRole("button", { name: "Usar teclado do aparelho", exact: true }).click();

  await field.getByRole("link", { name: "Aparelho", exact: true }).click();
  await field.getByRole("button", { name: "Preparar aparelho", exact: true }).click();
  await expect(
    field.locator(".device-checks dd").filter({ hasText: "Preparado para interrupções" }),
  ).toBeVisible({
    timeout: 30000,
  });
  await expect(field.getByRole("status").filter({ hasText: "Aparelho preparado" })).toBeVisible();
  await field.getByRole("link", { name: "Capturar", exact: true }).click();
  const count = Number(process.env.OFFLINE_COUNT ?? 100),
    minutes = Number(process.env.SOAK_MINUTES ?? 0);
  if (!Number.isInteger(count) || count < 100 || count > 1000 || minutes < 0 || minutes > 30)
    throw new Error("Invalid local test bounds");
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
          r.onerror = () => reject(r.error);
        }),
    );
  await operator.setOffline(true);
  const offlineStart = Date.now();
  const localFeedback = [];
  for (let i = 0; i < count; i++) {
    await bib.fill(String(i + 1).padStart(8, "0"));
    const localStarted = performance.now();
    await bib.press("Enter");
    await expect(bib).toHaveValue("");
    localFeedback.push(performance.now() - localStarted);
    if (i === 49) {
      await field.reload();
      await field.getByRole("link", { name: "Capturar", exact: true }).click();
      await field.getByRole("button", { name: "Usar teclado do aparelho", exact: true }).click();
      await expect(field.getByRole("heading", { name: "Capturar", exact: true })).toBeVisible();
    }
  }
  const before = await readQueue();
  expect(before).toHaveLength(count);
  const originals = before.map((i) => JSON.stringify(i.payload)).sort();
  expect(before.every((i) => i.status === "pending")).toBe(true);
  await field.screenshot({ path: folder + "/offline-mobile.png", fullPage: true });
  expect(await field.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await writeFile(
    folder + "/progress.json",
    JSON.stringify({
      stage: "offline-soak",
      count,
      started_at: new Date(offlineStart).toISOString(),
      minutes,
    }),
  );
  while (Date.now() - offlineStart < minutes * 60000) {
    await page.request
      .get(base + "/api/v1/auth/me", { timeout: 10000 })
      .catch(() => console.log(JSON.stringify({ stage: "admin-heartbeat-unavailable" })));
    console.log(
      JSON.stringify({
        stage: "offline-soak",
        elapsedSeconds: Math.round((Date.now() - offlineStart) / 1000),
        count,
      }),
    );
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(30000, minutes * 60000 - (Date.now() - offlineStart))),
    );
  }
  await field.reload();
  await field.getByRole("link", { name: "Capturar", exact: true }).click();
  await field.getByRole("button", { name: "Usar teclado do aparelho", exact: true }).click();
  await expect(field.getByRole("heading", { name: "Capturar", exact: true })).toBeVisible();
  // Simulate browser interruption while a previous upload was marked sending.
  await field.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("cronocheckpoint-manual", 2);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("intents", "readwrite"),
            store = tx.objectStore("intents"),
            q = store.getAll();
          q.onsuccess = () => store.put({ ...q.result[0], status: "sending" });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await field.reload();
  await field.getByRole("link", { name: "Capturar", exact: true }).click();
  await field.getByRole("button", { name: "Usar teclado do aparelho", exact: true }).click();
  await expect(field.getByRole("heading", { name: "Capturar", exact: true })).toBeVisible();
  const offlineDurationSeconds = Math.round((Date.now() - offlineStart) / 1000);
  await operator.setOffline(false);
  await expect
    .poll(
      async () => {
        const q = await readQueue();
        return q.filter((i) => i.status === "synced").length;
      },
      { timeout: 240000, intervals: [500, 1000, 2000] },
    )
    .toBe(count);
  const after = await readQueue();
  expect(after.map((i) => JSON.stringify(i.payload)).sort()).toEqual(originals);
  expect(new Set(after.map((i) => i.remote_id)).size).toBe(count);
  await field.screenshot({ path: folder + "/synced-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Recuperação", exact: true }).click();
  await page.getByRole("button", { name: "Atualizar aparelhos" }).click();
  await expect(page.locator(".access-list")).toContainText("Última comunicação");
  // Revocation while offline must be checked before any upload.
  await operator.setOffline(true);
  await bib.fill("00999999");
  await bib.press("Enter");
  await expect(bib).toHaveValue("");
  async function transition(to) {
    const headers = {
      cookie: "cc_platform_session=" + process.env.E2E_PLATFORM_SESSION,
      "x-csrf-token": process.env.E2E_PLATFORM_CSRF,
      origin: base,
      "content-type": "application/json",
      "idempotency-key": randomUUID(),
    };
    const endpoint = base + "/api/v1/platform/organizations/" + process.env.E2E_ORGANIZATION;
    const detail = await (await fetch(endpoint, { headers })).json();
    const r = await fetch(endpoint + "/transitions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        version: detail.organization.version,
        to,
        reason: "Ensaio de suspensão durante captura offline",
        acknowledge_running_events: true,
      }),
    });
    expect(r.status).toBe(200);
  }
  await transition("suspended");
  let postAfterRevoke = 0;
  field.on("request", (r) => {
    if (r.url().endsWith("/field/sync") && r.method() === "POST") postAfterRevoke++;
  });
  await operator.setOffline(false);
  await expect(field.getByRole("alert")).toContainText("Acesso expirado ou revogado", {
    timeout: 15000,
  });
  expect(postAfterRevoke).toBe(0);
  await field.getByRole("link", { name: "Aparelho", exact: true }).click();
  const downloadPromise = field.waitForEvent("download");
  await field.getByRole("button", { name: "Exportar recuperação" }).click();
  const download = await downloadPromise;
  const recoveryFile = folder + "/recovery.json";
  await download.saveAs(recoveryFile);
  const { readFile } = await import("node:fs/promises");
  const recovery = JSON.parse(await readFile(recoveryFile, "utf8"));
  expect(recovery.items).toHaveLength(1);
  expect(JSON.stringify(recovery)).not.toMatch(/password|csrf|token|cookie/i);
  await transition("active");
  await page.goto(base);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar na organização", exact: true }).click();
  await page
    .getByRole("heading", { name: "Corrida de demonstração " + suffix, exact: true })
    .click();
  await page.getByRole("button", { name: "Recuperação", exact: true }).click();
  await page.getByLabel("Pacote de recuperação").setInputFiles(recoveryFile);
  await page
    .getByLabel("Justificativa da recuperação")
    .fill("Acesso revogado durante interrupção; conferir com equipe");
  await page.getByRole("button", { name: "Importar para revisão" }).click();
  await expect(page.getByRole("status")).toContainText("1 registro(s) recebido(s)");
  await page.getByRole("button", { name: "Importar para revisão" }).click();
  await expect(page.getByRole("status")).toContainText("1 registro(s) recebido(s)");
  await page.getByRole("button", { name: "Passagens", exact: true }).click();
  await expect(page.locator(".passage-list li").filter({ hasText: "00999999" })).toHaveCount(1);
  await expect(page.locator(".passage-list li").filter({ hasText: "00999999" })).toContainText(
    "Requer revisão",
  );
  await page.screenshot({ path: folder + "/recovered-admin.png", fullPage: true });
  expect(errors).toEqual([]);
  const result = {
    passed: true,
    base,
    count,
    offlineSeconds: offlineDurationSeconds,
    requestedOfflineMinutes: minutes,
    localFeedbackP95Ms: [...localFeedback].sort((a, b) => a - b)[
      Math.floor(localFeedback.length * 0.95)
    ],
    mobileWidth: Number(process.env.E2E_MOBILE_WIDTH ?? 390),
    unchangedPayloads: true,
    uniqueRemoteIds: count,
    revokedUploadAttempts: postAfterRevoke,
    browser: await browser.version(),
    javascriptErrors: errors,
  };
  await writeFile(folder + "/result.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  await operator.close();
} catch (error) {
  await page.screenshot({ path: folder + "/failure.png", fullPage: true });
  console.log(JSON.stringify({ alerts: await page.getByRole("alert").allTextContents() }));
  throw error;
} finally {
  await browser.close();
}
