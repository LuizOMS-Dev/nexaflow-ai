import { describe, expect, it } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";
import { createMultiFileAuthStore, sessionsRoot } from "./auth-store";

describe("BaileysAuthStateStore (multifile)", () => {
  it("rejeita instanceName path traversal", () => {
    expect(() => createMultiFileAuthStore("../evil")).toThrow(/inválido/);
    expect(() => createMultiFileAuthStore("a/b")).toThrow(/inválido/);
  });

  it("namespace isolado e wipe seguro", () => {
    const prev = process.env.WA_SESSIONS_DIR;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nf-wa-"));
    process.env.WA_SESSIONS_DIR = tmp;
    try {
      const store = createMultiFileAuthStore("nf-test-ns-1");
      expect(store.backend).toBe("multifile");
      expect(store.namespace).toBe("nf-test-ns-1");
      fs.mkdirSync(store.authDir, { recursive: true });
      fs.writeFileSync(path.join(store.authDir, "creds.json"), "{}");
      expect(store.hasCredentials()).toBe(true);
      store.wipe();
      expect(store.hasCredentials()).toBe(false);
      expect(sessionsRoot()).toBe(tmp);
    } finally {
      if (prev === undefined) delete process.env.WA_SESSIONS_DIR;
      else process.env.WA_SESSIONS_DIR = prev;
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });
});
