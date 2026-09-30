import type pg from "pg";
import { z } from "zod";
import { audit, HttpError } from "./db.js";

export const chipMappings = z
  .array(
    z
      .object({
        bib: z.string().regex(/^[0-9]{1,8}$/),
        chip: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9_-]{1,128}$/),
      })
      .strict(),
  )
  .max(10000)
  .superRefine((rows, ctx) => {
    const bibs = new Set<string>(),
      chips = new Set<string>();
    for (const [index, row] of rows.entries()) {
      if (bibs.has(row.bib) || chips.has(row.chip))
        ctx.addIssue({
          code: "custom",
          path: [index],
          message: "Peito ou chip repetido no arquivo",
        });
      bibs.add(row.bib);
      chips.add(row.chip);
    }
  });

// Caller holds the event lock; the entire import shares its transaction.
export async function importChips(
  c: pg.PoolClient,
  org: string,
  event: string,
  rows: z.infer<typeof chipMappings>,
  user: string,
  request: string,
) {
  if (!rows.length) return;
  const conflicts = await c.query(
    `SELECT m.bib,m.chip FROM app.event_chips m
    JOIN jsonb_to_recordset($3::jsonb) AS incoming(bib text,chip text) ON incoming.chip=m.chip AND incoming.bib<>m.bib
    WHERE m.organization_id=$1 AND m.event_id=$2 AND NOT(m.bib=ANY($4::text[])) LIMIT 1`,
    [org, event, JSON.stringify(rows), rows.map((r) => r.bib)],
  );
  if (conflicts.rowCount)
    throw new HttpError(
      409,
      "CHIP_CONFLICT",
      "Chip já vinculado ao peito " + conflicts.rows[0].bib + ". Confira o arquivo.",
    );
  const before = (
    await c.query(
      "SELECT bib,chip FROM app.event_chips WHERE organization_id=$1 AND event_id=$2 AND bib=ANY($3::text[])",
      [org, event, rows.map((r) => r.bib)],
    )
  ).rows;
  await c.query(
    "DELETE FROM app.event_chips WHERE organization_id=$1 AND event_id=$2 AND bib=ANY($3::text[])",
    [org, event, rows.map((r) => r.bib)],
  );
  await c.query(
    `INSERT INTO app.event_chips(organization_id,event_id,bib,chip) SELECT $1,$2,bib,chip FROM jsonb_to_recordset($3::jsonb) AS x(bib text,chip text)`,
    [org, event, JSON.stringify(rows)],
  );
  await audit(
    c,
    org,
    user,
    "event.chips_imported",
    event,
    { count: rows.length, before, after: rows },
    request,
  );
}
