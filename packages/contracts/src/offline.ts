// Canonical ordered representation shared by export/import. Hash is integrity, not authorization.
export type ClockEvidence = {
  offset_ms: number;
  rtt_ms: number;
  measured_at: string;
  uncertain: boolean;
};
export type CapturePayload = {
  client_event_id: string;
  bib: string;
  raw_captured_at: string;
  capture_session_id: string;
  grant_id?: string;
  clock?: ClockEvidence;
};
export function orderedPayload(p: CapturePayload): CapturePayload {
  return {
    client_event_id: p.client_event_id,
    bib: p.bib,
    raw_captured_at: p.raw_captured_at,
    capture_session_id: p.capture_session_id,
    ...(p.grant_id ? { grant_id: p.grant_id } : {}),
    ...(p.clock
      ? {
          clock: {
            offset_ms: p.clock.offset_ms,
            rtt_ms: p.clock.rtt_ms,
            measured_at: p.clock.measured_at,
            uncertain: p.clock.uncertain,
          },
        }
      : {}),
  };
}
