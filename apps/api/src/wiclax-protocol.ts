export type WiclaxPassing = {
  tag: string;
  capturedAt: Date;
  source: string;
  lap?: number | null;
  battery?: number | null;
  rewind?: boolean;
};

export type WiclaxCommand =
  | { type: "clock_get" }
  | { type: "clock_set"; at: Date }
  | { type: "start_read" }
  | { type: "stop_read" }
  | { type: "rewind"; from: Date; to: Date }
  | { type: "unknown"; raw: string };

function pad(n: number, size: number) {
  return String(n).padStart(size, "0");
}

/** Wall-clock parts in the event timezone for Wiclax generic lines. */
export function wiclaxTimestamp(at: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return `${value("day")}-${value("month")}-${value("year")} ${value("hour")}:${value("minute")}:${value("second")}.${pad(at.getUTCMilliseconds(), 3)}`;
}

export function formatWiclaxPassing(p: WiclaxPassing, timezone: string): string {
  const tag = p.tag.trim();
  if (!tag) throw new Error("Identificador da passagem obrigatório");
  const source = (p.source ?? "").replaceAll(";", " ");
  const lap = p.lap == null || Number.isNaN(p.lap) ? "" : String(p.lap);
  const battery = p.battery == null || Number.isNaN(p.battery) ? "" : String(p.battery);
  const rewind = p.rewind ? "1" : "0";
  return `${tag};${wiclaxTimestamp(p.capturedAt, timezone)};${source};${lap};${battery};${rewind}\r`;
}

export function formatWiclaxClock(at: Date, timezone: string): string {
  const stamp = wiclaxTimestamp(at, timezone).replace(/\.\d{3}$/, "");
  return `CLOCK ${stamp}\r`;
}

function parseWiclaxDateTime(raw: string): Date | null {
  const m = raw
    .trim()
    .match(/^(\d{2})-(\d{2})-(\d{4})[ T](\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?$/);
  if (!m) return null;
  const ms = (m[7] ?? "0").padEnd(3, "0").slice(0, 3);
  const iso = `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}.${ms}Z`;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** Parse one command line (without requiring the trailing CR). */
export function parseWiclaxCommand(line: string): WiclaxCommand {
  const raw = line.replace(/\r?\n$/, "").trim();
  if (!raw) return { type: "unknown", raw };
  const upper = raw.toUpperCase();
  if (upper === "CLOCK") return { type: "clock_get" };
  if (upper.startsWith("CLOCK ")) {
    const at = parseWiclaxDateTime(raw.slice(6));
    if (!at) return { type: "unknown", raw };
    return { type: "clock_set", at };
  }
  if (upper === "STARTREAD") return { type: "start_read" };
  if (upper === "STOPREAD") return { type: "stop_read" };
  if (upper.startsWith("REWIND ")) {
    const body = raw.slice(7).trim();
    const parts = body.match(
      /^(\d{2}-\d{2}-\d{4}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,3})?)\s+(\d{2}-\d{2}-\d{4}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,3})?)$/,
    );
    if (!parts?.[1] || !parts[2]) return { type: "unknown", raw };
    const from = parseWiclaxDateTime(parts[1]);
    const to = parseWiclaxDateTime(parts[2]);
    if (!from || !to) return { type: "unknown", raw };
    return { type: "rewind", from, to };
  }
  return { type: "unknown", raw };
}
