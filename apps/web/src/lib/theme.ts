export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "nexaflow_theme";

/**
 * Retorna o tema efetivo ("light" | "dark") baseado na preferência e no SO.
 */
export function resolveEffectiveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "dark") return "dark";
  if (pref === "light") return "light";
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

/**
 * Lê a preferência salva no localStorage.
 */
export function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const val = localStorage.getItem(THEME_STORAGE_KEY);
    if (val === "dark" || val === "light" || val === "system") {
      return val;
    }
  } catch {
    /* ignore */
  }
  return "system";
}

/**
 * Aplica o tema diretamente no elemento raiz (document.documentElement)
 * e opcionalmente persiste no localStorage.
 */
export function applyTheme(
  pref: ThemePreference,
  options?: { persist?: boolean }
): "light" | "dark" {
  const effective = resolveEffectiveTheme(pref);
  if (typeof document !== "undefined") {
    if (effective === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.style.colorScheme = "dark";
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "light";
    }
  }

  if (options?.persist !== false && typeof window !== "undefined") {
    try {
      if (pref === "system") {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, pref);
      }
    } catch {
      /* ignore */
    }
  }

  return effective;
}

/**
 * Configura listener para mudanças no tema do SO quando a preferência for "system".
 */
export function setupSystemThemeListener(onThemeChange?: (effective: "light" | "dark") => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  const listener = (e: MediaQueryListEvent) => {
    const currentPref = getStoredThemePreference();
    if (currentPref === "system") {
      const isDark = e.matches;
      if (isDark) {
        document.documentElement.classList.add("dark");
        document.documentElement.style.colorScheme = "dark";
      } else {
        document.documentElement.classList.remove("dark");
        document.documentElement.style.colorScheme = "light";
      }
      onThemeChange?.(isDark ? "dark" : "light");
    }
  };

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  } else if ("addListener" in mediaQuery) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mediaQuery as any).addListener(listener);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return () => (mediaQuery as any).removeListener(listener);
  }

  return () => {};
}
