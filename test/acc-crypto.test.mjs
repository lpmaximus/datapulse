import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ACC_TOKEN_KEY = "chave-de-teste-suficientemente-longa-123456";

const { encryptToken, decryptToken, assertCryptoConfigured } = await import(
  "../lib/acc/crypto.ts"
);
const {
  isAccessTokenExpired,
  isRefreshTokenExpired,
  daysUntilReauth,
} = await import("../lib/acc/auth.ts");

test("token cifrado volta idêntico ao original", () => {
  const original = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.exemplo-de-token";
  assert.equal(decryptToken(encryptToken(original)), original);
});

test("cifragem é não-determinística (IV novo a cada chamada)", () => {
  const a = encryptToken("mesmo-token");
  const b = encryptToken("mesmo-token");
  assert.notEqual(a, b, "IV repetido quebraria a segurança do GCM");
  assert.equal(decryptToken(a), decryptToken(b));
});

test("payload adulterado é rejeitado pelo auth tag", () => {
  const enc = encryptToken("token-secreto");
  const [iv, tag, data] = enc.split(".");
  const corrupted = [iv, tag, Buffer.from("outro-conteudo").toString("base64")].join(".");
  assert.throws(() => decryptToken(corrupted));
});

test("formato inválido é rejeitado com mensagem clara", () => {
  assert.throws(() => decryptToken("nao-e-um-payload"), /formato inválido/i);
});

test("chave ausente falha explicitamente em vez de cifrar fraco", async () => {
  const saved = process.env.ACC_TOKEN_KEY;
  process.env.ACC_TOKEN_KEY = "";
  assert.throws(() => assertCryptoConfigured(), /ACC_TOKEN_KEY/);
  process.env.ACC_TOKEN_KEY = saved;
});

test("access token é renovado antes de expirar, não depois", () => {
  const now = new Date("2026-08-18T12:00:00Z");
  const inTwoMinutes = new Date(now.getTime() + 2 * 60_000);
  const inTenMinutes = new Date(now.getTime() + 10 * 60_000);

  assert.equal(isAccessTokenExpired(inTwoMinutes, now), true, "margem de segurança");
  assert.equal(isAccessTokenExpired(inTenMinutes, now), false);
});

test("refresh token expirado é detectado", () => {
  const now = new Date("2026-08-18T12:00:00Z");
  assert.equal(isRefreshTokenExpired(new Date(now.getTime() - 1000), now), true);
  assert.equal(isRefreshTokenExpired(new Date(now.getTime() + 1000), now), false);
});

test("dias até reautorização", () => {
  const now = new Date("2026-08-18T12:00:00Z");
  assert.equal(daysUntilReauth(new Date(now.getTime() + 15 * 86_400_000), now), 15);
  assert.equal(daysUntilReauth(new Date(now.getTime() - 86_400_000), now), -1);
});
