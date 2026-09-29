import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { transaction } from "./db.js";
import type { PlatformOptions } from "./platform.js";
import { failure, managementAudit, type PlatformGuard } from "./platform-management.js";

export async function platformSettings(c: pg.PoolClient) {
  return (
    await c.query(
      "SELECT logo_data_url,mfa_required,version FROM app.platform_settings WHERE singleton",
    )
  ).rows[0] as { logo_data_url: string | null; mfa_required: boolean; version: number };
}
const logo = z
  .string()
  .max(350000)
  .refine((value) => {
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match?.[2]) return false;
    const data = Buffer.from(match[2], "base64");
    if (data.length > 256 * 1024 || data.toString("base64") !== match[2]) return false;
    return match[1] === "png"
      ? data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
      : data[0] === 255 && data[1] === 216 && data[2] === 255;
  }, "Envie um logo PNG ou JPEG de até 256 KB.");
export function registerPlatformSettings(
  app: FastifyInstance,
  o: PlatformOptions,
  guard: PlatformGuard,
) {
  app.get("/api/v1/platform/branding", async () =>
    transaction(o.pool, async (c) => ({
      logo_data_url: (await platformSettings(c)).logo_data_url,
    })),
  );
  app.get("/api/v1/platform/settings", async (req) =>
    transaction(o.pool, async (c) => {
      await guard(req, c);
      return platformSettings(c);
    }),
  );
  app.post("/api/v1/platform/settings", { bodyLimit: 360000 }, async (req) => {
    const input = z
      .object({
        logo_data_url: logo.nullable(),
        mfa_required: z.boolean(),
        version: z.number().int().nonnegative(),
      })
      .strict()
      .parse(req.body);
    return transaction(o.pool, async (c) => {
      const s = await guard(req, c, true);
      const old = (await c.query("SELECT * FROM app.platform_settings WHERE singleton FOR UPDATE"))
        .rows[0];
      if (old.version !== input.version)
        throw failure(
          "VERSION_CONFLICT",
          "As configurações foram alteradas. Recarregue a página antes de salvar.",
        );
      await c.query(
        "UPDATE app.platform_settings SET logo_data_url=$1,mfa_required=$2,version=version+1 WHERE singleton",
        [input.logo_data_url, input.mfa_required],
      );
      await managementAudit(
        c,
        s.u.user_id,
        null,
        "platform.settings.updated",
        s.u.user_id,
        req.id,
        {
          mfa_required: input.mfa_required,
          previous_mfa_required: old.mfa_required,
          logo_changed: old.logo_data_url !== input.logo_data_url,
        },
      );
      return {
        ...(await platformSettings(c)),
        requires_login: input.mfa_required && s.mfa_authenticated === false,
      };
    });
  });
}
