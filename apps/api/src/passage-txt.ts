export function passageTxtLine(bib: string, capturedAt: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(capturedAt);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return `${bib.padStart(24, "0")};${value("day")}/${value("month")}/${value("year")} ${value("hour")}:${value("minute")}:${value("second")}:${String(capturedAt.getUTCMilliseconds()).padStart(3, "0")}`;
}
