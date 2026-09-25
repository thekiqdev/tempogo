import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const token = () => randomBytes(32).toString("hex");
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const csrfFor = (raw: string) => digest("csrf:" + raw);
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (e, key) =>
      e ? reject(e) : resolve(key),
    ),
  );
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return "scrypt-v1$" + salt + "$" + (await derive(password, salt)).toString("hex");
}
export async function verifyPassword(password: string, hash: string | null) {
  const parts = hash?.split("$");
  const valid =
    parts?.length === 3 && parts[0] === "scrypt-v1" && /^[a-f0-9]{128}$/.test(parts[2] ?? "");
  const candidate = await derive(
    password,
    valid ? (parts?.[1] ?? "") : "00000000000000000000000000000000",
  );
  return Boolean(valid && equal(candidate.toString("hex"), parts?.[2] ?? ""));
}
