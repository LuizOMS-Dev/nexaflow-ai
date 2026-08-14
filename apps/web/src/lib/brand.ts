/**
 * NexaFlow AI — Design tokens da marca
 * Fonte única de verdade para cores, tipografia e voz.
 */

export const brand = {
  name: "NexaFlow AI",
  shortName: "NexaFlow",
  tagline: "Atendimento e vendas",
  description:
    "WhatsApp, CRM e agentes de IA para PMEs.",

  colors: {
    primary: {
      50: "#EEF2FF",
      100: "#E0E7FF",
      200: "#C7D2FE",
      300: "#A5B4FC",
      400: "#818CF8",
      500: "#6366F1",
      600: "#4F46E5",
      700: "#4338CA",
      800: "#3730A3",
      900: "#312E81",
    }, // indigo → violet (fluxo)
    accent: {
      cyan: "#22D3EE",
      cyanSoft: "#67E8F9",
      violet: "#7C3AED",
      mint: "#34D399",
      amber: "#F59E0B",
      rose: "#F43F5E",
    },
    neutral: {
      0: "#FFFFFF",
      50: "#F8FAFC",
      100: "#F1F5F9",
      200: "#E2E8F0",
      300: "#CBD5E1",
      400: "#94A3B8",
      500: "#64748B",
      600: "#475569",
      700: "#334155",
      800: "#1E293B",
      900: "#0F172A",
      950: "#020617",
    },
    semantic: {
      success: "#10B981",
      warning: "#F59E0B",
      danger: "#EF4444",
      info: "#3B82F6",
    },
  },

  gradients: {
    brand: "linear-gradient(135deg, #4F46E5 0%, #6366F1 50%, #7C3AED 100%)",
    brandSoft: "linear-gradient(135deg, #EEF2FF 0%, #EDE9FE 100%)",
    hero: "radial-gradient(circle at top right, #6366F1 0%, transparent 40%), radial-gradient(circle at bottom left, #06B6D4 0%, transparent 35%)",
    dark: "linear-gradient(160deg, #020617 0%, #0F172A 50%, #1E1B4B 100%)",
  },

  radii: {
    sm: "0.5rem",
    md: "0.75rem",
    lg: "1rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    full: "9999px",
  },

  shadows: {
    soft: "0 4px 24px -4px rgba(15, 23, 42, 0.08)",
    brand: "0 10px 30px -8px rgba(79, 70, 229, 0.35)",
  },

  fonts: {
    sans: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },

  voice: {
    tone: ["claro", "confiante", "humano", "objetivo"],
    do: [
      "Fale em português do Brasil",
      "Seja direto e útil",
      "Use linguagem de negócios acessível",
      "Priorize ação e clareza",
    ],
    dont: [
      "Não use jargão técnico desnecessário",
      "Não prometa o que a IA não pode fazer",
      "Não invente preços ou políticas",
      "Não polua a interface com excesso de informação",
    ],
  },

  assets: {
    mark: "/brand/logo-mark.svg",
    full: "/brand/logo-mark.svg",
    favicon: "/favicon.svg",
    icon192: "/icon-192.svg",
    icon512: "/icon-512.svg",
  },
} as const;

export type Brand = typeof brand;
