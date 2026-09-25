export function evaluateHealth({ live, ready }) {
  if (!live)
    return {
      severity: "critical",
      code: "API_UNAVAILABLE",
      action: "Preservar filas locais e verificar serviço da API",
    };
  if (!ready)
    return {
      severity: "critical",
      code: "DATABASE_UNAVAILABLE",
      action: "Preservar filas e verificar conectividade/readiness do banco",
    };
  return { severity: "ok", code: "RECOVERED", action: "Conferir sincronização e conciliação" };
}
export function evaluateErrors(total, errors) {
  return total >= 100 && errors / total > 0.01
    ? { severity: "critical", code: "INGESTION_ERRORS" }
    : { severity: "ok", code: "WITHIN_THRESHOLD" };
}
