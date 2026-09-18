import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/**
 * Cifragem de tokens OAuth em repouso (AES-256-GCM).
 *
 * Por que existe: o refresh token do ACC dá acesso de leitura ao hub inteiro
 * do cliente por 15 dias. Guardar isso em texto puro no Postgres seria
 * inadequado para o ambiente regulado que o produto se propõe a atender —
 * um dump de banco viraria acesso ao ACC do cliente.
 *
 * A chave vem de ACC_TOKEN_KEY. Trocar a chave invalida os tokens existentes
 * (a conexão pede reautorização), o que é o comportamento correto.
 */

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.ACC_TOKEN_KEY;
  if (!raw || raw.length < 16) {
    throw new Error(
      "ACC_TOKEN_KEY ausente ou curta demais. Gere com: openssl rand -base64 32",
    );
  }
  // Deriva 32 bytes determinísticos de qualquer string suficientemente longa.
  return createHash("sha256").update(raw).digest();
}

/** Formato: base64(iv).base64(authTag).base64(ciphertext) */
export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptToken(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Token cifrado em formato inválido.");
  }
  const [ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Verifica se a cifragem está utilizável antes de iniciar um fluxo OAuth. */
export function assertCryptoConfigured(): void {
  getKey();
}
