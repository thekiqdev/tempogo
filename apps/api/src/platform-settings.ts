import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { z } from "zod";
import { transaction } from "./db.js";
import type { PlatformOptions } from "./platform.js";
import { failure, managementAudit, type PlatformGuard } from "./platform-management.js";
import { wiclaxPoolSnapshot } from "./wiclax-manager.js";
import { DEFAULT_WICLAX_PORTS, formatWiclaxPortPool, parseWiclaxPortPool } from "./wiclax-ports.js";

export async function platformSettings(c: pg.PoolClient) {
  const row = (
    await c.query(
      "SELECT logo_data_url,mfa_required,version,wiclax_ports FROM app.platform_settings WHERE singleton",
    )
  ).rows[0] as {
    logo_data_url: string | null;
    mfa_required: boolean;
    version: number;
    wiclax_ports: number[] | null;
  };
  const ports = row.wiclax_ports?.length
    ? [...new Set(row.wiclax_ports)].sort((a, b) => a - b)
    : [...DEFAULT_WICLAX_PORTS];
  return {
    logo_data_url: row.logo_data_url,
    mfa_required: row.mfa_required,
    version: row.version,
    wiclax_ports: ports,
    wiclax_ports_text: formatWiclaxPortPool(ports),
  };
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

const portsInput = z
  .union([z.string().max(4000), z.array(z.number().int().min(1024).max(65535)).max(500)])
  .transform((value, ctx) => {
    const ports =
      typeof value === "string"
        ? parseWiclaxPortPool(value)
        : [...new Set(value)].sort((a, b) => a - b);
    if (ports.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe ao menos uma porta Wiclax (ex.: 3097-3116).",
      });
      return z.NEVER;
    }
    if (ports.length > 500) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "No máximo 500 portas no pool." });
      return z.NEVER;
    }
    return ports;
  });

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
      const settings = await platformSettings(c);
      const pool = await wiclaxPoolSnapshot(o.pool);
      return { ...settings, wiclax_pool: pool };
    }),
  );
  app.post("/api/v1/platform/settings", { bodyLimit: 360000 }, async (req) => {
    const input = z
      .object({
        logo_data_url: logo.nullable(),
        mfa_required: z.boolean(),
        wiclax_ports: portsInput,
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
        "UPDATE app.platform_settings SET logo_data_url=$1,mfa_required=$2,wiclax_ports=$3,version=version+1 WHERE singleton",
        [input.logo_data_url, input.mfa_required, input.wiclax_ports],
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
          wiclax_ports_count: input.wiclax_ports.length,
        },
      );
      const settings = await platformSettings(c);
      return {
        ...settings,
        wiclax_pool: await wiclaxPoolSnapshot(o.pool),
        requires_login: input.mfa_required && s.mfa_authenticated === false,
      };
    });
  });
}
