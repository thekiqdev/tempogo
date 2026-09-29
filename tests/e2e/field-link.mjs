import { chromium, expect } from "@playwright/test";

const browser = await chromium.launch({ channel: "msedge" });
try {
  for (const valid of [true, false]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    let logins = 0;
    await page.route("**/api/v1/field/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/login")) {
        logins++;
        expect(route.request().postDataJSON()).toEqual({ access_token: "test-link-token" });
        await route.fulfill({
          status: valid ? 200 : 401,
          json: valid
            ? { csrf_token: "test" }
            : { error: { message: "Acesso expirado ou revogado" } },
        });
        return;
      }
      if (path.endsWith("/me")) {
        await route.fulfill({
          json: {
            session_id: "session-test",
            credential_id: "credential-test",
            organization_id: "org",
            event_id: "event",
            checkpoint_id: "cp",
            device_id: "device",
            event_name: "Prova do link",
            checkpoint_name: "Chegada do link",
            label: "Celular do link",
            state: "ready",
            expires_at: new Date(Date.now() + 3600000).toISOString(),
            csrf_token: "test",
          },
        });
        return;
      }
      await route.fulfill({
        json: {
          items: [],
          server_time: new Date().toISOString(),
          grant: {
            id: "g",
            window_id: "w",
            issued_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 3600000).toISOString(),
          },
        },
      });
    });
    await page.goto("http://127.0.0.1:5173/checkpoint#access=test-link-token");
    if (valid) await expect(page.getByText("Chegada do link", { exact: true })).toBeVisible();
    else await expect(page.getByText("Acesso expirado ou revogado", { exact: true })).toBeVisible();
    expect(logins).toBe(1);
    expect(new URL(page.url()).hash).toBe("");
    await context.close();
  }
  console.log("Link automático: sucesso, erro, token removido da URL e chamada única aprovados.");
} finally {
  await browser.close();
}
