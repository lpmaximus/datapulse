import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Hash de senha com scrypt.
 *
 * Por que scrypt e não bcrypt/argon2: vem no Node, sem dependência nativa para
 * compilar. Em serverless isso evita binários por plataforma e falhas de build.
 * scrypt é memory-hard, adequado para senha.
 *
 * Formato: scrypt$N$r$p$saltBase64$hashBase64 — os parâmetros ficam no próprio
 * hash, então dá para endurecer o custo no futuro sem invalidar senhas antigas.
 */

const PARAMS = { N: 16384, r: 8, p: 1 };
const KEYLEN = 64;
// scrypt precisa de memória ~ 128 * N * r; damos folga para não estourar.
const MAXMEM = 64 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEYLEN, { ...PARAMS, maxmem: MAXMEM });

  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * Confere a senha. Devolve false em vez de lançar quando o hash está corrompido
 * — assim uma linha ruim no banco vira "senha inválida", não erro 500 que
 * revelaria a existência do usuário.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;

    const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
    const N = Number(nRaw);
    const r = Number(rRaw);
    const p = Number(pRaw);
    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

    const expected = Buffer.from(hashB64, "base64");
    const derived = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
      N,
      r,
      p,
      maxmem: MAXMEM,
    });

    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Senha inicial legível para entregar ao usuário no cadastro. */
export function generateTemporaryPassword(): string {
  // Sem caracteres ambíguos (O/0, l/1) para reduzir erro de digitação.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
