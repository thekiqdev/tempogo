import type { ClockSample, Preparation } from "./field-store";
export const boot = crypto.randomUUID();
export function clockEvidence(sample: ClockSample, wall = Date.now(), mono = performance.now()) {
  const same = sample.boot === boot;
  const jump = same && Math.abs(wall - sample.wall - (mono - sample.mono)) > 1000;
  return {
    offset_ms: sample.offset_ms,
    rtt_ms: sample.rtt_ms,
    measured_at: sample.measured_at,
    uncertain:
      !same || jump || wall - sample.wall > 300000 || wall < sample.wall || sample.rtt_ms > 1000,
  };
}
export function grantValid(p: Preparation, wall = Date.now(), mono = performance.now()) {
  const expiry = Date.parse(p.grant.expires_at);
  const estimated =
    p.clock.boot === boot
      ? p.clock.wall + p.clock.offset_ms + (mono - p.clock.mono)
      : wall + p.clock.offset_ms;
  return !p.blocked && estimated < expiry && wall >= p.prepared_wall - 1000;
}
export function retryDelay(attempt: number, random = Math.random) {
  return Math.min(30000, 1000 * 2 ** Math.min(attempt, 5) * (0.8 + random() * 0.4));
}
