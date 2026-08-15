import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  getAntiFlashScript,
  getStoredThemePreference,
  resolveEffectiveTheme,
  setStoredThemePreference,
  setupSystemThemeListener,
  THEME_STORAGE_KEY,
} from "./theme";

describe("Theme Engine Suite (apps/web/src/lib/theme.ts)", () => {
  let mockMatchMediaListeners: Array<(e: { matches: boolean }) => void> = [];
  let systemPrefersDark = false;

  beforeEach(() => {
    mockMatchMediaListeners = [];
    systemPrefersDark = false;

    // Mock do localStorage
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, val: string) => {
        store[key] = String(val);
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        for (const k in store) delete store[k];
      }),
    });

    // Mock do document e documentElement
    const classListSet = new Set<string>();
    const styleObj: Record<string, string> = {};

    vi.stubGlobal("document", {
      documentElement: {
        classList: {
          add: vi.fn((cls: string) => classListSet.add(cls)),
          remove: vi.fn((cls: string) => classListSet.delete(cls)),
          contains: vi.fn((cls: string) => classListSet.has(cls)),
        },
        style: styleObj,
      },
    });

    // Mock do window.matchMedia
    vi.stubGlobal("window", {
      matchMedia: vi.fn((query: string) => {
        const matches = query.includes("prefers-color-scheme: dark") ? systemPrefersDark : false;
        return {
          matches,
          media: query,
          onchange: null,
          addEventListener: vi.fn((event: string, callback: (e: { matches: boolean }) => void) => {
            if (event === "change") mockMatchMediaListeners.push(callback);
          }),
          removeEventListener: vi.fn((event: string, callback: (e: { matches: boolean }) => void) => {
            if (event === "change") {
              mockMatchMediaListeners = mockMatchMediaListeners.filter((cb) => cb !== callback);
            }
          }),
          addListener: vi.fn((callback: (e: { matches: boolean }) => void) => {
            mockMatchMediaListeners.push(callback);
          }),
          removeListener: vi.fn((callback: (e: { matches: boolean }) => void) => {
            mockMatchMediaListeners = mockMatchMediaListeners.filter((cb) => cb !== callback);
          }),
        };
      }),
      localStorage: globalThis.localStorage,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. resolveEffectiveTheme", () => {
    it("preferência 'light' → retorna sempre 'light'", () => {
      systemPrefersDark = true;
      expect(resolveEffectiveTheme("light")).toBe("light");
      systemPrefersDark = false;
      expect(resolveEffectiveTheme("light")).toBe("light");
    });

    it("preferência 'dark' → retorna sempre 'dark'", () => {
      systemPrefersDark = false;
      expect(resolveEffectiveTheme("dark")).toBe("dark");
      systemPrefersDark = true;
      expect(resolveEffectiveTheme("dark")).toBe("dark");
    });

    it("preferência 'system' com SO claro → retorna 'light'", () => {
      systemPrefersDark = false;
      expect(resolveEffectiveTheme("system")).toBe("light");
    });

    it("preferência 'system' com SO escuro → retorna 'dark'", () => {
      systemPrefersDark = true;
      expect(resolveEffectiveTheme("system")).toBe("dark");
    });
  });

  describe("2. applyTheme e manipulação da raiz do DOM", () => {
    it("aplicar 'light' remove a classe .dark e define colorScheme como 'light'", () => {
      const eff = applyTheme("light");
      expect(eff).toBe("light");
      expect(document.documentElement.classList.remove).toHaveBeenCalledWith("dark");
      expect(document.documentElement.style.colorScheme).toBe("light");
    });

    it("aplicar 'dark' adiciona a classe .dark e define colorScheme como 'dark'", () => {
      const eff = applyTheme("dark");
      expect(eff).toBe("dark");
      expect(document.documentElement.classList.add).toHaveBeenCalledWith("dark");
      expect(document.documentElement.style.colorScheme).toBe("dark");
    });

    it("aplicar 'system' com SO escuro adiciona .dark", () => {
      systemPrefersDark = true;
      const eff = applyTheme("system");
      expect(eff).toBe("dark");
      expect(document.documentElement.classList.add).toHaveBeenCalledWith("dark");
    });

    it("aplicar com { persist: false } altera o DOM mas NÃO grava no localStorage", () => {
      applyTheme("dark", { persist: false });
      expect(document.documentElement.classList.add).toHaveBeenCalledWith("dark");
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe("3. Persistência e tolerância a falhas no Storage", () => {
    it("grava e lê 'light' corretamente", () => {
      setStoredThemePreference("light");
      expect(getStoredThemePreference()).toBe("light");
    });

    it("grava e lê 'dark' corretamente", () => {
      setStoredThemePreference("dark");
      expect(getStoredThemePreference()).toBe("dark");
    });

    it("grava 'system' removendo a chave customizada", () => {
      setStoredThemePreference("dark");
      setStoredThemePreference("system");
      expect(localStorage.removeItem).toHaveBeenCalledWith(THEME_STORAGE_KEY);
      expect(getStoredThemePreference()).toBe("system");
    });

    it("retorna fallback 'system' quando storage estiver vazio", () => {
      expect(getStoredThemePreference()).toBe("system");
    });

    it("retorna fallback 'system' para valores corrompidos ou inválidos", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "invalid_theme_value");
      expect(getStoredThemePreference()).toBe("system");
    });
  });

  describe("4. Listener Reativo do Sistema Operacional", () => {
    it("atualiza a aplicação em tempo real quando a preferência for 'system'", () => {
      setStoredThemePreference("system");
      let notifiedTheme: string | null = null;
      const cleanup = setupSystemThemeListener((theme) => {
        notifiedTheme = theme;
      });

      expect(mockMatchMediaListeners.length).toBeGreaterThan(0);

      // Simula SO mudando para escuro
      mockMatchMediaListeners.forEach((listener) => listener({ matches: true }));
      expect(document.documentElement.classList.add).toHaveBeenCalledWith("dark");
      expect(notifiedTheme).toBe("dark");

      // Simula SO mudando para claro
      mockMatchMediaListeners.forEach((listener) => listener({ matches: false }));
      expect(document.documentElement.classList.remove).toHaveBeenCalledWith("dark");
      expect(notifiedTheme).toBe("light");

      cleanup();
    });

    it("NÃO altera o DOM se a preferência do usuário for explicitamente 'light' ou 'dark'", () => {
      setStoredThemePreference("light");
      setupSystemThemeListener();

      // Limpa chamadas anteriores
      vi.clearAllMocks();

      // Simula evento do SO mudando para escuro
      mockMatchMediaListeners.forEach((listener) => listener({ matches: true }));

      // Não deve ter adicionado a classe dark pois a preferência é explicitamente 'light'
      expect(document.documentElement.classList.add).not.toHaveBeenCalled();
    });

    it("executa cleanup corretamente ao desmontar", () => {
      const cleanup = setupSystemThemeListener();
      expect(mockMatchMediaListeners.length).toBe(1);
      cleanup();
      expect(mockMatchMediaListeners.length).toBe(0);
    });
  });

  describe("5. Fluxo de Preview e Descarte", () => {
    it("simula preview imediato e restauração de baseline", () => {
      // Estado inicial salvo: light
      setStoredThemePreference("light");
      applyTheme("light", { persist: true });

      // Usuário clica em 'dark' para preview (persist: false)
      applyTheme("dark", { persist: false });
      expect(document.documentElement.classList.add).toHaveBeenCalledWith("dark");
      // Storage continua sendo 'light'
      expect(getStoredThemePreference()).toBe("light");

      // Usuário clica em 'Descartar'
      const saved = getStoredThemePreference();
      applyTheme(saved, { persist: true });
      expect(document.documentElement.classList.remove).toHaveBeenCalledWith("dark");
    });
  });

  describe("6. Script Anti-Flash", () => {
    it("gera script inline executável contendo a chave de storage", () => {
      const script = getAntiFlashScript();
      expect(script).toContain(THEME_STORAGE_KEY);
      expect(script).toContain("prefers-color-scheme:dark");
      expect(script).toContain("classList.add(\"dark\")");
      expect(script).toContain("classList.remove(\"dark\")");
    });
  });
});
