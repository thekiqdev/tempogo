import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

// Real compiled UI and IndexedDB; API responses controlled to reproduce the race without Docker.
const root = resolve("apps/web/dist");
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const file = resolve(root, "." + (pathname === "/checkpoint" ? "/index.html" : pathname));
  if (!file.startsWith(root + "/") && !file.startsWith(root + "\\")) {
    res.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.setHeader(
      "Content-Type",
      { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[extname(file)] ??
        "application/octet-stream",
    );
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true, channel: "msedge" });
try {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const session = Object.fromEntries(
    [
      "session_id",
      "credential_id",
      "organization_id",
      "event_id",
      "checkpoint_id",
      "device_id",
    ].map((k) => [k, randomUUID()]),
  );
  Object.assign(session, {
    event_name: "Corrida sintética",
    checkpoint_name: "Chegada",
    label: "Teste",
    state: "running",
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    csrf_token: "synthetic",
  });
  let releaseHistory;
  const gate = new Promise((resolve) => {
    releaseHistory = resolve;
  });
  let historyReached = false;
  const uploads = [];
  await page.route("**/api/v1/field/**", async (route) => {
    const path = new URL(route.request().url()).pathname.split("/").pop();
    let body = {};
    if (path === "me") body = session;
    else if (path === "observations") {
      if (!historyReached) {
        historyReached = true;
        await gate;
      }
      body = { items: uploads };
    } else if (path === "sync") {
      body = {
        ...route.request().postDataJSON(),
        id: randomUUID(),
        received_at: new Date().toISOString(),
        possible_duplicate: false,
      };
      uploads.push(body);
    } else if (path !== "heartbeat") throw new Error("Unexpected API request: " + path);
    await route.fulfill({ status: 200, json: body });
  });
  await page.goto("http://127.0.0.1:" + server.address().port + "/checkpoint");
  await expect.poll(() => historyReached).toBe(true);
  const input = page.getByRole("textbox", { name: "Número de peito", exact: true });
  await input.fill("00012");
  await input.press("Enter");
  const row = page.locator(".passage-list li").filter({ hasText: "00012" });
  await expect(row).toContainText("Salvo no aparelho");
  expect(uploads.length).toBe(0);
  const start = performance.now();
  releaseHistory();
  await expect(row).toContainText("Confirmado no servidor", { timeout: 5000 });
  expect(uploads.length).toBe(1);
  expect(uploads[0].bib).toBe("00012");
  expect(errors).toEqual([]);
  const result = {
    passed: true,
    api: "mocked",
    storage: "real IndexedDB",
    confirmation_ms: performance.now() - start,
    browser: browser.version(),
  };
  await mkdir("tmp/sprint-05", { recursive: true });
  await writeFile("tmp/sprint-05/sync-wakeup.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
