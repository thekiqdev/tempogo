export function kilometersToMeters(value: string, allowZero = false): number | null {
  const text = value.trim().replace(",", ".");
  if (!text) return null;
  if (!/^\d+(\.\d{1,3})?$/.test(text))
    throw new Error("Informe a distância em km, com até 3 casas decimais. Ex.: 2,5.");
  const [whole = "0", decimal = ""] = text.split(".");
  const meters = Number(whole) * 1000 + Number(decimal.padEnd(3, "0"));
  if (!Number.isSafeInteger(meters) || meters > 1000000 || meters < (allowZero ? 0 : 1))
    throw new Error(
      allowZero
        ? "Use uma distância entre 0 e 1.000 km."
        : "Use uma distância entre 0,001 e 1.000 km.",
    );
  return meters;
}
export const timezoneLabels: Record<string, string> = {
  "America/Sao_Paulo": "Brasília · São Paulo",
  "America/Manaus": "Manaus",
  "America/Rio_Branco": "Rio Branco",
  "America/Noronha": "Fernando de Noronha",
};
