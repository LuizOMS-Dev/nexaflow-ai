import argon2 from "argon2";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";

const WEAK = new Set([
  "123456",
  "12345678",
  "123456789",
  "password",
  "senha",
  "senha123",
  "admin123",
  "qwerty",
  "abc123",
  "nexaflow",
  "nexaflow123",
  "password1",
  "111111",
  "000000",
]);

const ARGON_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // ~19 MiB
  timeCost: 2,
  parallelism: 1,
};

export function validatePasswordPolicy(password: string): string | null {
  if (typeof password !== "string") return "Senha inválida.";
  if (password.length < 10) return "A senha deve ter pelo menos 10 caracteres.";
  if (password.length > 128) return "A senha é longa demais.";
  if (WEAK.has(password.toLowerCase())) return "Essa senha é muito fraca. Escolha outra.";
  // senhas só numéricas curtas
  if (/^\d+$/.test(password) && password.length < 12) {
    return "Evite senhas só com números. Use uma frase ou combinação mais longa.";
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON_OPTS);
}

export type VerifyResult = {
  ok: boolean;
  /** true se hash legado (bcrypt) — rehash com Argon2 no login */
  needsRehash: boolean;
};

export async function verifyPassword(hash: string, password: string): Promise<VerifyResult> {
  if (!hash || !password) return { ok: false, needsRehash: false };

  // Argon2
  if (hash.startsWith("$argon2")) {
    try {
      const ok = await argon2.verify(hash, password);
      return { ok, needsRehash: false };
    } catch {
      return { ok: false, needsRehash: false };
    }
  }

  // bcrypt legado
  if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
    const ok = await bcrypt.compare(password, hash);
    return { ok, needsRehash: ok };
  }

  return { ok: false, needsRehash: false };
}

/** Hash de tokens opacos (refresh, reset) — SHA-256 é ok para alta entropia aleatória */
export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
