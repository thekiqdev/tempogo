export class FieldError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request<T>(path: string, csrf = "", body?: unknown): Promise<T> {
  const r = await fetch("/api/v1/field" + path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
    headers: body === undefined ? {} : { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new FieldError(data.error?.message ?? "Não foi possível enviar", r.status);
  return data as T;
}
