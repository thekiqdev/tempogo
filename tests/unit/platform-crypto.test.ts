import assert from "node:assert/strict";
import test from "node:test";
import { base32, platformCipher, totp, verifyTotp } from "../../apps/api/src/platform-crypto.js";

test("SA02: TOTP RFC 6238 SHA1, janela e replay", () => {
  const secret = base32(Buffer.from("12345678901234567890"));
  for (const [time, expected] of [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ] as const)
    assert.equal(totp(secret, Math.floor(time / 30)), expected);
  assert.equal(verifyTotp(secret, "287082", -1, 59000), 1);
  assert.equal(verifyTotp(secret, "287082", 1, 59000), null);
  assert.equal(verifyTotp(secret, "287082", -1, 150000), null);
});
test("SA02: cifra MFA detecta adulteração, outra identidade e chave inválida", () => {
  const c = platformCipher("ab".repeat(32)),
    s = c.seal("SECRET", "user-a");
  assert.equal(c.open(s, "user-a"), "SECRET");
  assert.throws(() => c.open(s, "user-b"));
  assert.throws(() => c.open(s.slice(0, -2) + (s.endsWith("ff") ? "00" : "ff"), "user-a"));
  assert.throws(() => platformCipher("bad"));
});

test("SA04: cifra permite aviso vazio autenticado e rejeita formato inválido", () => {
  const c = platformCipher("ab".repeat(32));
  const sealed = c.seal("", "notice");
  assert.equal(c.open(sealed, "notice"), "");
  assert.throws(() => c.open(sealed, "other"));
  assert.throws(() => c.open(sealed + ":extra", "notice"));
  assert.throws(() => c.open(sealed + "zz", "notice"));
});
