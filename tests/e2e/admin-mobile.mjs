import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const base = process.env.E2E_BASE_URL ?? "https://localhost:5443";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw Error("Somente ambiente local");
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge" });
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let race;
const points = [];
let eventPosts = 0;
let failPoints = true;
await page.route("**/api/v1/**", async (route) => {
  const req = route.request(),
    path = new URL(req.url()).pathname.replace("/api/v1", "");
  let data;
  if (path === "/auth/me")
    data = {
      user: { email: "mobile@example.test" },
      organization: { name: "Organização de teste mobile" },
      csrf_token: "fixture",
    };
  else if (path === "/events" && req.method() === "POST") {
    eventPosts++;
    race = { ...req.postDataJSON(), id: "mobile-event", state: "draft", version: 1 };
    data = race;
  } else if (path === "/events") data = { items: race ? [race] : [] };
  else if (path === "/events/mobile-event") data = race;
  else if (path === "/events/mobile-event/checkpoints") {
    if (req.method() === "GET" && failPoints) {
      await route.fulfill({
        status: 503,
        json: { error: { message: "Falha simulada de conexão" } },
      });
      return;
    }
    if (req.method() === "POST")
      points.push({ ...req.postDataJSON(), id: "cp-" + points.length, version: 1 });
    data = req.method() === "GET" ? { items: points } : points.at(-1);
  } else throw Error("Endpoint não previsto: " + path);
  await route.fulfill({ json: data });
});
const folder = "tmp/admin-mobile";
await mkdir(folder, { recursive: true });
async function capture(name) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: folder + "/" + name + ".png", fullPage: true });
}
try {
  await page.goto(base);
  await page.getByRole("button", { name: "+ Novo evento", exact: true }).click();
  await page.getByLabel("Nome do evento").fill("Corrida do Parque — edição especial da comunidade");
  await page.getByLabel("Distância (km, opcional)").fill("21,1");
  await capture("01-identificacao");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByLabel("Data da prova").fill("2026-10-04");
  await page.getByLabel("Local", { exact: true }).fill("Parque da Cidade");
  await capture("02-data-local");
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await expect(page.getByLabel("Distância (km, opcional)")).toHaveValue("21,1");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByLabel("Data da prova")).toHaveValue("2026-10-04");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await capture("03-conferencia");
  await page.getByRole("button", { name: "Salvar evento", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Não foi possível carregar o percurso" }),
  ).toBeVisible();
  failPoints = false;
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Comece pelo percurso" })).toBeVisible();
  expect(eventPosts).toBe(1);
  expect(race.distance_m).toBe(21100);
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const label of ["Resumo", "Percurso", "Equipe", "Mais"])
      await expect(
        page.locator(".admin-mobile-nav").getByRole("button", { name: label, exact: true }),
      ).toBeInViewport();
    await capture("04-resumo-" + width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "+ Adicionar checkpoint", exact: true }).click();
  await page.locator('input[name="kind"][value="intermediate"]').check();
  await page.getByLabel("Nome do checkpoint").fill("Ponto de água");
  await page.getByLabel("Distância acumulada (km)").fill("2,5");
  await capture("05-checkpoint");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByText("Descartar as alterações deste ponto?")).toBeVisible();
  await page.getByRole("button", { name: "Continuar preenchendo" }).click();
  await expect(page.getByLabel("Nome do checkpoint")).toHaveValue("Ponto de água");
  await page.getByRole("button", { name: "Salvar checkpoint", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ponto de água", exact: true })).toBeVisible();
  expect(points[0].distance_m).toBe(2500);
  await capture("06-percurso");
  await page
    .locator(".admin-mobile-nav")
    .getByRole("button", { name: "Mais", exact: true })
    .click();
  await capture("07-mais");
  expect(errors).toEqual([]);
  console.log(
    "Mobile aprovado: 320–430 px, cadastro em etapas, preservação dos campos, confirmação de descarte, km com vírgula, navegação visível. API simulada; integração real coberta em sprint-01.",
  );
} finally {
  await browser.close();
}
