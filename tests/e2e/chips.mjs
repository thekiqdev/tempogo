import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { strToU8, zipSync } from "fflate";

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
let race = null,
  saved = [],
  imported = [];
await page.route("**/api/v1/**", async (route) => {
  const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
  let data;
  if (path === "/auth/me")
    data = {
      user: { email: "test@example.test" },
      organization: { name: "Organização" },
      csrf_token: "test",
    };
  else if (path === "/events" && route.request().method() === "POST") {
    const body = route.request().postDataJSON();
    saved = body.chip_mappings;
    race = { ...body, id: "event", version: 1, state: "draft" };
    data = race;
  } else if (path === "/events") data = { items: race ? [race] : [] };
  else if (path === "/events/event") data = race;
  else if (path === "/events/event/chips") {
    if (route.request().method() === "POST") {
      imported = route.request().postDataJSON().rows;
      data = { imported: imported.length };
    } else data = { total: saved.length + imported.length, items: [...saved, ...imported] };
  } else if (path.endsWith("/preparation"))
    data = { active_checkpoints: 0, missing_access: [], ready: false };
  else if (path.endsWith("/reconciliation"))
    data = { items: [], pending_reviews: 0, unreconciled_devices: 0 };
  else data = { items: [] };
  await route.fulfill({ json: data });
});
const csv = {
  name: "chips.csv",
  mimeType: "text/csv",
  buffer: Buffer.from("NUMERO;CHIP\r\n001;000000000109000000000001\r\n002;ABC002"),
};
try {
  await page.goto("http://127.0.0.1:5173");
  await page.getByRole("button", { name: "+ Novo evento", exact: true }).click();
  await page.getByLabel("Nome do evento").fill("Prova com voltas");
  await page.getByLabel("Número de voltas", { exact: true }).fill("3");
  await page.getByLabel("Intervalo mínimo entre voltas (minutos)", { exact: true }).fill("2,5");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByLabel("Data da prova").fill("2026-10-10");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByLabel("Arquivo de chips").setInputFiles(csv);
  await expect(page.getByRole("status")).toContainText("2 vínculos válidos");
  await mkdir("tmp/chips", { recursive: true });
  await page.screenshot({ path: "tmp/chips/import-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByText("2 vínculos para importar", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("2 vínculos válidos");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Salvar evento", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Comece pelo percurso" })).toBeVisible();
  expect(saved).toEqual([
    { bib: "001", chip: "000000000109000000000001" },
    { bib: "002", chip: "ABC002" },
  ]);
  expect(race.laps).toBe(3);
  expect(race.min_lap_seconds).toBe(150);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .locator(".admin-desktop-tabs")
    .getByRole("button", { name: "Configuração", exact: true })
    .click();
  await page.getByLabel("Arquivo de chips").setInputFiles({
    name: "chips.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(
      "<participantes><participante><NUMERO>003</NUMERO><CHIP>000ABC003</CHIP></participante></participantes>",
    ),
  });
  await page.getByRole("button", { name: "Confirmar importação", exact: true }).click();
  await expect(page.getByText("1 vínculos importados.", { exact: true })).toBeVisible();
  expect(imported).toEqual([{ bib: "003", chip: "000ABC003" }]);
  const sheet =
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row><c r="A1" t="inlineStr"><is><t>NUMERO</t></is></c><c r="B1" t="inlineStr"><is><t>CHIP</t></is></c></row><row><c r="A2" t="inlineStr"><is><t>004</t></is></c><c r="B2" t="inlineStr"><is><t>000000000109000000000004</t></is></c></row></sheetData></worksheet>';
  await page.getByLabel("Arquivo de chips").setInputFiles({
    name: "chips.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(zipSync({ "xl/worksheets/sheet1.xml": strToU8(sheet) })),
  });
  await expect(page.getByRole("status")).toContainText("1 vínculos válidos");
  await expect(page.locator(".chip-import tbody")).toContainText("000000000109000000000004");
  await page.getByLabel("Arquivo de chips").setInputFiles({
    name: "invalid.xml",
    mimeType: "application/xml",
    buffer: Buffer.from('<!DOCTYPE a [<!ENTITY x SYSTEM "file:///secret">]><a>&x;</a>'),
  });
  await expect(page.getByRole("alert")).toContainText("DTD");
  await expect(
    page.getByRole("button", { name: "Confirmar importação", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Arquivo de chips").setInputFiles({
    name: "invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("NUMERO;CHIP\n1;ABC\n2;ABC"),
  });
  await expect(page.getByRole("alert")).toContainText("chip repetido");
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  console.log(
    "PASS: quatro etapas, voltas, CSV/XML/XLSX, zeros preservados, importação posterior e arquivos inválidos.",
  );
} finally {
  await browser.close();
}
