let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch("/api/v1" + path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" ? { "X-CSRF-Token": csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !path.includes("/auth/admin/login"))
      window.dispatchEvent(new Event("session-expired"));
    throw new Error(data.error?.message ?? "Não foi possível concluir. Tente novamente.");
  }
  return data as T;
}
