import type { CapturePayload } from "@tempogo/contracts";
export type Intent = {
  client_event_id: string;
  bib: string;
  raw_captured_at: string;
  session_id: string;
  credential_id?: string;
  payload?: CapturePayload;
  status: "pending" | "sending" | "synced" | "confirmed" | "blocked";
  message?: string;
  remote_id?: string;
  needs_review?: boolean;
};
export type FieldSession = {
  previous_session_ids?: string[];
  session_id: string;
  credential_id: string;
  organization_id: string;
  event_id: string;
  checkpoint_id: string;
  device_id: string;
  event_name: string;
  checkpoint_name: string;
  label: string;
  state: string;
  expires_at: string;
  csrf_token: string;
};
export type ClockSample = {
  offset_ms: number;
  rtt_ms: number;
  measured_at: string;
  wall: number;
  mono: number;
  boot: string;
};
export type Preparation = {
  blocked?: boolean;
  session: Omit<FieldSession, "csrf_token">;
  grant: { id: string; issued_at: string; expires_at: string; window_id: string };
  clock: ClockSample;
  prepared_wall: number;
};
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Legacy storage identity: TempoGo must retain existing offline queues.
    const r = indexedDB.open("cronocheckpoint-manual", 2);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains("intents"))
        r.result.createObjectStore("intents", { keyPath: "client_event_id" });
      if (!r.result.objectStoreNames.contains("meta")) r.result.createObjectStore("meta");
    };
    r.onsuccess = () => {
      r.result.onversionchange = () => r.result.close();
      resolve(r.result);
    };
    r.onerror = () => reject(r.error);
    r.onblocked = () =>
      reject(new Error("Feche outras abas antigas antes de preparar este aparelho"));
  });
}
async function write(store: string, value: unknown, key?: string) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, "readwrite", { durability: "strict" }),
        s = tx.objectStore(store);
      if (key) s.put(value, key);
      else s.put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export const saveIntent = (intent: Intent) => write("intents", intent);
export const savePreparation = (p: Preparation | null) => write("meta", p, "active");
export async function readPreparation(): Promise<Preparation | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("meta", "readonly"),
        r = tx.objectStore("meta").get("active");
      tx.oncomplete = () => resolve(r.result ?? null);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function readIntents(
  session: string,
  credential?: string,
  previousSessions: string[] = [],
): Promise<Intent[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("intents", "readonly"),
        r = tx.objectStore("intents").getAll();
      tx.oncomplete = () =>
        resolve(
          (r.result as Intent[])
            .filter(
              (i) =>
                i.session_id === session ||
                (credential && i.credential_id === credential) ||
                previousSessions.includes(i.session_id),
            )
            .sort((a, b) => a.raw_captured_at.localeCompare(b.raw_captured_at)),
        );
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export const payloadFor = (i: Intent): CapturePayload =>
  i.payload ?? {
    client_event_id: i.client_event_id,
    bib: i.bib,
    raw_captured_at: i.raw_captured_at,
    capture_session_id: i.session_id,
  };
