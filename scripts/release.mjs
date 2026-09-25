import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const scope = process.argv[2] ?? "sprint-05";
if (!["sprint-05", "super-admin", "super-admin-ux"].includes(scope))
  throw new Error("Escopo de candidata inválido");
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (["node_modules", "dist"].includes(entry.name)) continue;
    const p = path.join(dir, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) await walk(p);
    else files.push(p);
  }
}
for (const root of ["apps", "packages", "infra", "scripts", "tests"]) await walk(root);
files.push(
  "package.json",
  "package-lock.json",
  "tsconfig.base.json",
  "biome.json",
  ".npmrc",
  ".dockerignore",
);
const entries = [];
for (const file of files.sort())
  entries.push({
    file,
    sha256: createHash("sha256")
      .update(await readFile(file))
      .digest("hex"),
  });
const hash = createHash("sha256")
  .update(entries.map((e) => e.file + "\0" + e.sha256).join("\n"))
  .digest("hex");
const result = {
  candidate: scope + "-" + hash.slice(0, 12),
  source_sha256: hash,
  generated_at: new Date().toISOString(),
  scope: "Local candidate; VPS deployment and operational acceptance owned by user",
  files: entries,
};
await mkdir("doc/releases", { recursive: true });
await writeFile(
  "doc/releases/" + scope + "-candidate.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify({ candidate: result.candidate, files: entries.length }));
