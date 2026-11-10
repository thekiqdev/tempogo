/** Interpreta "3097-3116", "3097,3098" ou lista mista em portas únicas ordenadas. */
export function parseWiclaxPortPool(raw: string): number[] {
  const out = new Set<number>();
  for (const part of raw
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean)) {
    const range = /^(\d{2,5})\s*-\s*(\d{2,5})$/.exec(part);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
      const from = Math.min(a, b);
      const to = Math.max(a, b);
      if (from < 1024 || to > 65535 || to - from > 500) continue;
      for (let p = from; p <= to; p++) out.add(p);
      continue;
    }
    const n = Number(part);
    if (Number.isInteger(n) && n >= 1024 && n <= 65535) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

export function formatWiclaxPortPool(ports: number[]): string {
  if (ports.length === 0) return "";
  const sorted = [...ports].sort((a, b) => a - b);
  const chunks: string[] = [];
  let start = sorted[0]!;
  let prev = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i]!;
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    chunks.push(start === prev ? String(start) : `${start}-${prev}`);
    start = prev = n;
  }
  chunks.push(start === prev ? String(start) : `${start}-${prev}`);
  return chunks.join(", ");
}

export const DEFAULT_WICLAX_PORTS = parseWiclaxPortPool("3097-3116");
