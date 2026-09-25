import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { equal } from "./security.js";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(bytes: Buffer) {
  let bits = 0,
    value = 0,
    out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += alphabet[(value >>> bits) & 31];
    }
  }
  if (bits) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}
export function newTotpSecret() {
  return base32(randomBytes(20));
}
export function totp(secret: string, step: number) {
  let bits = 0,
    value = 0;
  const bytes: number[] = [];
  for (const char of secret) {
    const n = alphabet.indexOf(char);
    if (n < 0) throw new Error("Invalid TOTP secret");
    value = (value << 5) | n;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hash = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = hash[hash.length - 1]! & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
}
export function verifyTotp(secret: string, code: string, lastStep: number, now = Date.now()) {
  const step = Math.floor(now / 30000);
  for (const delta of [0, -1, 1]) {
    const n = step + delta;
    if (n > lastStep && equal(totp(secret, n), code)) return n;
  }
  return null;
}
export function platformCipher(keyHex: string) {
  if (!/^[a-f0-9]{64}$/i.test(keyHex))
    throw new Error("PLATFORM_MFA_KEY exige 32 bytes hexadecimais");
  const key = Buffer.from(keyHex, "hex");
  return {
    seal(value: string, userId: string) {
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from("platform-mfa:v1:" + userId));
      const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      return [
        "v1",
        iv.toString("hex"),
        cipher.getAuthTag().toString("hex"),
        data.toString("hex"),
      ].join(":");
    },
    open(value: string, userId: string) {
      const [v, iv, tag, data, extra] = value.split(":");
      if (
        v !== "v1" ||
        !iv ||
        !tag ||
        data === undefined ||
        extra !== undefined ||
        !/^[a-f0-9]{24}$/.test(iv) ||
        !/^[a-f0-9]{32}$/.test(tag) ||
        !/^(?:[a-f0-9]{2})*$/.test(data)
      )
        throw new Error("Invalid cipher");
      const cipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
      cipher.setAAD(Buffer.from("platform-mfa:v1:" + userId));
      cipher.setAuthTag(Buffer.from(tag, "hex"));
      return Buffer.concat([cipher.update(Buffer.from(data, "hex")), cipher.final()]).toString(
        "utf8",
      );
    },
  };
}
