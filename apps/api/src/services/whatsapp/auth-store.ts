/**
 * BaileysAuthStateStore — namespace isolado por instanceName.
 *
 * Implementação atual: useMultiFileAuthState em disco (PRESERVADO).
 * Interface preparada para migração futura a SQL sem apagar sessões existentes.
 *
 * Nunca logar conteúdo de creds/keys.
 */
import path from "path";
import fs from "fs";

export type AuthStoreBackend = "multifile" | "database"; // database = futuro

/** Diretório raiz de sessões Baileys (compartilhado com o manager). */
export function sessionsRoot() {
  // Preferir WA_SESSIONS_DIR (volume Docker / EasyPanel)
  const fromEnv = process.env.WA_SESSIONS_DIR;
  if (fromEnv) {
    fs.mkdirSync(fromEnv, { recursive: true });
    return fromEnv;
  }
  const root = path.resolve(process.cwd(), "data", "wa-sessions");
  const dir =
    process.cwd().includes("apps\\api") || process.cwd().includes("apps/api")
      ? path.resolve(process.cwd(), "../../data/wa-sessions")
      : root;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export interface BaileysAuthStateStore {
  backend: AuthStoreBackend;
  namespace: string;
  authDir: string;
  /** Baileys auth state + saveCreds */
  open(): Promise<{
    state: unknown;
    saveCreds: () => Promise<void>;
  }>;
  /** Existe creds.json (sessão potencialmente restaurável) */
  hasCredentials(): boolean;
  /** Remove namespace (só logout real / BAD_SESSION) */
  wipe(): void;
}

/**
 * Store multifile — produção atual.
 * Migração SQL: ler estes arquivos, importar, só então trocar backend.
 */
export function createMultiFileAuthStore(instanceName: string): BaileysAuthStateStore {
  if (!instanceName || instanceName.includes("..") || instanceName.includes("/") || instanceName.includes("\\")) {
    throw new Error("instanceName inválido para auth store");
  }

  const authDir = path.join(sessionsRoot(), instanceName);

  return {
    backend: "multifile",
    namespace: instanceName,
    authDir,

    async open() {
      fs.mkdirSync(authDir, { recursive: true });
      const baileys = await import("@whiskeysockets/baileys");
      const useMultiFileAuthState = (baileys as any).useMultiFileAuthState;
      if (!useMultiFileAuthState) {
        throw new Error("useMultiFileAuthState indisponível nesta versão do Baileys");
      }
      const { state, saveCreds } = await useMultiFileAuthState(authDir);

      const safeSave = async () => {
        try {
          await saveCreds();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // não logar stack de keys — só mensagem
          console.error(`[auth-store] CRITICAL saveCreds failed ns=${instanceName}: ${msg}`);
          throw err;
        }
      };

      return { state, saveCreds: safeSave };
    },

    hasCredentials() {
      try {
        return fs.existsSync(path.join(authDir, "creds.json"));
      } catch {
        return false;
      }
    },

    wipe() {
      try {
        if (fs.existsSync(authDir)) {
          fs.rmSync(authDir, { recursive: true, force: true });
        }
      } catch (err) {
        console.error(
          `[auth-store] wipe failed ns=${instanceName}:`,
          err instanceof Error ? err.message : err
        );
      }
    },
  };
}

/** Lista namespaces com creds no disco (restore / diagnóstico). */
export function listAuthNamespaces(): string[] {
  const root = sessionsRoot();
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((name) => {
        try {
          return fs.existsSync(path.join(root, name, "creds.json"));
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}
