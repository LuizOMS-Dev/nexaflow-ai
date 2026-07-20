import { createCipheriv, createDecipheriv, randomBytes, createHash, scryptSync } from "crypto";
import { env } from "../../lib/env";

const ALGO = "aes-256-gcm";
const PREFIX = "enc:v1:";

/**
 * Deriva chave AES-256 a partir de ENCRYPTION_KEY (ou fallback controlado em dev).
 * Em produção, ENCRYPTION_KEY é obrigatório (validado no bootstrap).
 */
export function getEncryptionKey(version = 1): Buffer {
  const material = env.encryptionKey || env.jwtSecret;
  // scrypt com salt versionado (não secreto público — key material vem do env)
  return scryptSync(material, `nexaflow-enc-v${version}`, 32);
}

/** Criptografa texto sensível (ex.: TOTP secret). Formato: enc:v1:iv:tag:ciphertext (base64url) */
export function encryptSecret(plain: string, keyVersion = 1): string {
  const key = getEncryptionKey(keyVersion);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX.slice(0, -1), // enc:v1
    iv.toString("base64url"),
    tag.toString("base64url"),
    enc.toString("base64url"),
  ].join(":");
}

/** Descriptografa; aceita plaintext legado (migração) e retorna flag needsReencrypt */
export function decryptSecret(stored: string): { plain: string; needsReencrypt: boolean } {
  if (!stored) return { plain: "", needsReencrypt: false };
  if (!stored.startsWith("enc:v")) {
    // legado em texto puro — migrar no próximo write
    return { plain: stored, needsReencrypt: true };
  }
  const parts = stored.split(":");
  // enc : v1 : iv : tag : ciphertext
  if (parts.length !== 5 || parts[0] !== "enc") {
    throw new Error("CIPHERTEXT_INVALID");
  }
  const version = Number(parts[1].replace("v", "")) || 1;
  const iv = Buffer.from(parts[2], "base64url");
  const tag = Buffer.from(parts[3], "base64url");
  const data = Buffer.from(parts[4], "base64url");
  const key = getEncryptionKey(version);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  return { plain, needsReencrypt: version !== 1 };
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Valida entropia mínima de segredos de produção */
export function hasMinSecretEntropy(secret: string, minBytes = 24): boolean {
  if (!secret || secret.length < minBytes) return false;
  const weak = [
    "change-me",
    "dev-secret",
    "secret",
    "password",
    "nexaflow",
    "123456",
  ];
  const lower = secret.toLowerCase();
  if (weak.some((w) => lower.includes(w))) return false;
  return true;
}
