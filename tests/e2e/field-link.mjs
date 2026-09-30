import { chromium, expect } from "@playwright/test";

const browser = await chromium.launch({ channel: "msedge" });
try {
  for (const mode of ["revoked", "logout", "invalid"]) {
    const valid = mode !== "invalid";
    let revoked = false;
    const context = await browser.newContext();
    const page = await context.newPage();
    let logins = 0;
    let preparations = 0;
    await page.route("**/api/v1/field/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/prepare")) preparations++;
      if (path.endsWith("/login")) {
        logins++;
        expect(route.request().postDataJSON()).toEqual({
          code: "ABCDEF12",
          operator_name: "Ana Silva",
        });
        await route.fulfill({
          status: valid ? 200 : 401,
          json: valid
            ? { csrf_token: "test" }
            : { error: { message: "Acesso expirado ou revogado" } },
        });
        return;
      }
      if (path.endsWith("/logout")) {
        revoked = true;
        await route.fulfill({ json: { ok: true } });
        return;
      }
      if (path.endsWith("/me") && revoked) {
        await route.fulfill({ status: 401, json: { error: { message: "Sessão encerrada" } } });
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
            state: "running",
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
    await page.goto("http://127.0.0.1:5173/evento/celular-01/ABCDEF12");
    await expect(page.getByLabel("Operador", { exact: true })).toBeVisible();
    expect(logins).toBe(0);
    await expect(page.getByLabel("Código de acesso", { exact: true })).toHaveCount(0);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await page.getByLabel("Operador", { exact: true }).fill("Ana Silva");
    await page.getByRole("button", { name: "Entrar no checkpoint", exact: true }).click();
    if (valid) {
      await expect(page.getByText("Chegada do link", { exact: true })).toBeVisible();
      await expect.poll(() => preparations).toBeGreaterThan(0);
      await page.locator(".keypad").getByRole("button", { name: "1", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Registrar passagem ↵", exact: true }),
      ).toBeEnabled();
      await expect(page.locator(".operator-nav a")).toHaveCount(2);
      await expect(page.getByRole("region", { name: "Aparelho e recuperação" })).toHaveCount(0);
      if (mode === "logout") {
        await page.getByRole("button", { name: "Sair do checkpoint", exact: true }).click();
      } else {
        revoked = true;
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      }
      await expect(page.getByRole("heading", { name: "Entre no seu checkpoint" })).toBeVisible();
      await expect(page.getByLabel("Código de acesso", { exact: true })).toHaveValue("");
      await expect(page.getByLabel("Operador", { exact: true })).toHaveValue("");
      await expect(page.locator(".operator-nav")).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole("heading", { name: "Entre no seu checkpoint" })).toBeVisible();
    } else
      await expect(page.getByText("Acesso expirado ou revogado", { exact: true })).toBeVisible();
    expect(logins).toBe(1);
    expect(new URL(page.url()).hash).toBe("");
    await context.close();
  }
  console.log(
    "Link curto, saída manual, sessão revogada e recarga sem restaurar sessão: aprovados.",
  );
} finally {
  await browser.close();
}
