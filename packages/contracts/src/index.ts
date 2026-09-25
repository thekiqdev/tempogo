export type Liveness = { status: "ok" };
export type Readiness = { status: "ready" | "unavailable" };
export type ApiError = {
  error: { code: string; message: string; request_id: string; retryable: boolean };
};

export type AdminSession = {
  user: { email: string };
  organization: { id: string; name: string };
  csrf_token: string;
};
export type RaceEvent = {
  id: string;
  name: string;
  local_date: string;
  timezone: string;
  location: string;
  state: string;
  version: number;
  category_name: string;
  distance_m: number | null;
  gun_start_at: string | null;
};
export type Checkpoint = {
  id: string;
  name: string;
  kind: string;
  sequence: number;
  distance_m: number | null;
  active: boolean;
  version: number;
};
export type AuditEntry = {
  id: string;
  action: string;
  actor_id: string;
  created_at: string;
  details: Record<string, unknown>;
};

export * from "./offline.js";
