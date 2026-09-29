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
await context.addInitScript(() => {
  window.__copiedAccess = "";
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (value) => {
        window.__copiedAccess = value;
      },
    },
  });
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let race;
const points = [];
const accesses = [];
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
  else if (path === "/events/mobile-event/preparation")
    data = {
      active_checkpoints: points.length,
      missing_access: accesses.some((a) => !a.revoked_at)
        ? []
        : points.map((p) => ({ id: p.id, name: p.name })),
      ready: points.length > 0 && accesses.some((a) => !a.revoked_at),
    };
  else if (path === "/events/mobile-event/observations")
    data = {
      items: [
        {
          id: "obs-1",
          effective_bib: "00123",
          checkpoint_name: "Ponto de água",
          effective_captured_at: new Date().toISOString(),
          received_at: new Date().toISOString(),
          operator_name: "Ana Souza",
          access_label: "Celular 01",
          status: "accepted",
          version: 0,
          observation_count: 2,
          members: [
            {
              id: "obs-1",
              operator_name: "Ana Souza",
              access_label: "Celular 01",
              effective_captured_at: new Date().toISOString(),
            },
            {
              id: "obs-2",
              operator_name: "Bruno Lima",
              access_label: "Celular 02",
              effective_captured_at: new Date().toISOString(),
            },
          ],
        },
      ],
      total: 1,
      pending: 0,
      invalidated: 0,
      updated_at: new Date().toISOString(),
    };
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
  } else if (path === "/checkpoints/cp-1/access") {
    data = { items: [] };
  } else if (path === "/checkpoints/cp-0/access") {
    if (req.method() === "POST") {
      const body = req.postDataJSON();
      if (body.replace_access_id)
        accesses.find((a) => a.id === body.replace_access_id).revoked_at = new Date().toISOString();
      const access = {
        id: "access-" + accesses.length,
        code: "CODE" + accesses.length,
        access_url: "http://127.0.0.1:5173/checkpoint#access=fixture-" + accesses.length,
        label: body.label,
        operator_name: body.operator_name,
        expires_at: body.expires_at,
        revoked_at: null,
        online: true,
      };
      accesses.push(access);
      data = { ...access, password: "Generated-Test-Password" };
    } else data = { items: accesses };
  } else if (path.startsWith("/access/") && path.endsWith("/revoke")) {
    accesses.find((a) => a.id === path.split("/")[2]).revoked_at = new Date().toISOString();
    data = { revoked: true };
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
  const eventDistance = page.getByLabel("Distância (km, opcional)");
  await eventDistance.fill("abc");
  await expect(eventDistance).toHaveValue("");
  await eventDistance.fill("21.1");
  await eventDistance.pressSequentially("e+-abc");
  await expect(eventDistance).toHaveValue("21.1");
  await eventDistance.fill("21,1");
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
  const pointDistance = page.getByLabel("Distância acumulada (km)");
  await pointDistance.fill("");
  await pointDistance.fill("2km");
  await expect(pointDistance).toHaveValue("");
  await page.getByRole("button", { name: "2,5 km", exact: true }).click();
  await expect(pointDistance).toHaveValue("2,5");
  await pointDistance.pressSequentially("abc-+e");
  await expect(pointDistance).toHaveValue("2,5");
  const order = page.getByLabel("Ordem no percurso");
  await order.fill("1");
  await order.pressSequentially("e+-.,abc");
  await expect(order).toHaveValue("1");
  await capture("05-checkpoint");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByText("Descartar as alterações deste ponto?")).toBeVisible();
  await page.getByRole("button", { name: "Continuar preenchendo" }).click();
  await expect(page.getByLabel("Nome do checkpoint")).toHaveValue("Ponto de água");
  await page.getByRole("button", { name: "Salvar checkpoint", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ponto de água", exact: true })).toBeVisible();
  expect(points[0].distance_m).toBe(2500);
  await capture("06-percurso");
  await page.locator(".checkpoint").getByRole("button", { name: "Acessos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Acessos da equipe", exact: true })).toBeVisible();
  await expect(page.locator(".access-picker summary")).toContainText("Ponto de água");
  await page.getByLabel("Operador responsável (opcional)").fill("Ana Souza");
  await page.getByLabel("Identificação do aparelho").fill("Celular equipe 01");
  const future = new Date(Date.now() + 86400000);
  await page
    .getByLabel("Válido até")
    .fill(
      new Date(future.getTime() - future.getTimezoneOffset() * 60000).toISOString().slice(0, 16),
    );
  await page.getByRole("button", { name: "Gerar código e senha", exact: true }).click();
  await expect(page.getByTestId("issued-code")).toHaveText("CODE0");
  await page.getByRole("button", { name: "Copiar código", exact: true }).click();
  expect(await page.evaluate(() => window.__copiedAccess)).toBe("CODE0");
  await page.getByRole("button", { name: "Copiar link de acesso", exact: true }).click();
  expect(await page.evaluate(() => window.__copiedAccess)).toContain(
    "/checkpoint#access=fixture-0",
  );
  await page.getByRole("button", { name: "Copiar senha", exact: true }).click();
  expect(await page.evaluate(() => window.__copiedAccess)).toBe("Generated-Test-Password");
  await page.getByRole("button", { name: "Já guardei a senha" }).click();
  await page.getByRole("button", { name: "Redefinir acesso", exact: true }).click();
  await expect(page.locator(".access-list li .access-create-form")).toBeVisible();
  await expect(page.locator(".checkpoint-access-panel > .access-create-form")).toHaveCount(0);
  await expect(page.getByLabel("Identificação do aparelho")).toHaveValue("Celular equipe 01");
  await capture("acesso-redefinicao-no-card");
  await page.getByRole("button", { name: "Revogar e gerar novo acesso", exact: true }).click();
  await expect(page.locator(".access-list li").getByTestId("issued-code")).toHaveText("CODE1");
  await page.getByRole("button", { name: "Copiar código", exact: true }).click();
  expect(await page.evaluate(() => window.__copiedAccess)).toBe("CODE1");
  await capture("acesso-nova-senha-no-card");
  expect(accesses[0].revoked_at).not.toBeNull();
  await page.getByRole("button", { name: "Já guardei a senha" }).click();
  await page.getByRole("button", { name: "Revogar acesso", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar revogação", exact: true }).click();
  await expect(page.getByRole("button", { name: "Revogar acesso", exact: true })).toHaveCount(0);
  await page.getByLabel("Mostrar expirados e revogados").check();
  await expect(page.locator(".access-list")).toContainText("Ana Souza");
  await capture("08-acessos-checkpoint");
  await page.getByRole("button", { name: "← Voltar aos checkpoints", exact: true }).click();

  await page
    .locator(".admin-mobile-nav")
    .getByRole("button", { name: "Mais", exact: true })
    .click();
  await capture("07-mais");
  await expect(page.locator(".admin-desktop-tabs button").last()).toHaveText("Configuração");
  await expect(page.locator(".admin-mobile-nav button")).toHaveCount(4);
  points.push({ ...points[0], id: "cp-1", name: "Chegada", sequence: 2, distance_m: 5000 });
  race.state = "running";
  await page.reload();
  await page.locator(".event-row").click();
  await expect(page.locator(".admin-mobile-nav button")).toHaveText([
    "▦Resumo",
    "↗Percurso",
    "≡Passagens",
  ]);
  for (const width of [320, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator(".event-overview .setup-steps li")).toHaveCount(3);
    const cards = await page.locator(".event-overview .setup-steps li").evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }),
    );
    for (let i = 0; i < cards.length; i++) {
      expect(cards[i].left).toBeGreaterThanOrEqual(0);
      expect(cards[i].right).toBeLessThanOrEqual(width);
      if (i) expect(cards[i].top).toBeGreaterThanOrEqual(cards[i - 1].bottom);
    }
    await capture("resumo-responsivo-" + width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator(".admin-mobile-nav")
    .getByRole("button", { name: "Passagens", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Passagens manuais", exact: true })).toBeVisible();
  await expect(
    page.locator(".admin-mobile-nav").getByRole("button", { name: "Passagens", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await capture("09-menu-em-andamento");
  await page.getByText("Ver registros do grupo", { exact: true }).click();
  await expect(page.locator(".passage-evidence")).toContainText("Bruno Lima");
  await capture("10-passagens-consolidadas");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .locator(".admin-desktop-tabs")
    .getByRole("button", { name: "Checkpoints", exact: true })
    .click();
  await page
    .locator(".checkpoint-actions")
    .getByRole("button", { name: "Acessos", exact: true })
    .first()
    .click();
  for (const [operatorName, deviceName] of [
    ["Ana Souza", "Celular 01"],
    ["Bruno Lima", "Celular 02"],
  ]) {
    await page.getByRole("button", { name: "+ Novo acesso", exact: true }).click();
    await page.getByLabel("Operador responsável (opcional)").fill(operatorName);
    await page.getByLabel("Identificação do aparelho").fill(deviceName);
    await page
      .getByLabel("Válido até")
      .fill(
        new Date(future.getTime() - future.getTimezoneOffset() * 60000).toISOString().slice(0, 16),
      );
    await page.getByRole("button", { name: "Gerar código e senha", exact: true }).click();
    await page.getByRole("button", { name: "Já guardei a senha" }).click();
  }
  await expect(page.locator(".access-list li")).toHaveCount(2);
  await expect(page.locator(".access-list")).toContainText("Ana Souza");
  await expect(page.locator(".access-list")).toContainText("Bruno Lima");
  await capture("11-acessos-equipe-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("12-acessos-equipe-mobile");
  await expect(page.locator(".access-status-badges").first()).toContainText("Online");
  await expect(page.locator(".access-login-link input")).toHaveCount(0);
  await page.getByRole("button", { name: "◉ Ao vivo", exact: true }).click();
  await expect(page.getByRole("region", { name: "Envios ao vivo" })).toContainText("#00123");
  await expect(page.getByRole("region", { name: "Envios ao vivo" })).toContainText("Ana Souza");
  await capture("acessos-ao-vivo-mobile");
  await page.getByRole("button", { name: "◉ Ao vivo", exact: true }).click();
  await expect(page.getByRole("region", { name: "Envios ao vivo" })).toHaveCount(0);

  await page.getByLabel("Trocar checkpoint", { exact: true }).click();
  await page
    .locator(".access-picker-options")
    .getByRole("button", { name: /Chegada/ })
    .click();
  await expect(page.locator(".access-picker summary")).toContainText("Chegada");
  await expect(page.getByRole("heading", { name: "Acessos da equipe", exact: true })).toBeVisible();
  await expect(page.locator(".access-list li")).toHaveCount(0);
  await expect(page.getByLabel("Identificação do aparelho")).toHaveValue("");
  await page.getByLabel("Trocar checkpoint", { exact: true }).click();
  await page
    .locator(".access-picker-options")
    .getByRole("button", { name: /Ponto de água/ })
    .click();
  await expect(page.locator(".access-list li")).toHaveCount(2);
  await expect(page.locator(".access-list")).toContainText("Ana Souza");
  expect(errors).toEqual([]);
  console.log(
    "Mobile aprovado: 320–430 px, cadastro em etapas, preservação dos campos, confirmação de descarte, km com vírgula, navegação visível. API simulada; integração real coberta em sprint-01.",
  );
} finally {
  await browser.close();
}
