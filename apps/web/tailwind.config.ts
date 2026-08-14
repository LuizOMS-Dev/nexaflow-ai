import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
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
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F4F5F7",
          subtle: "#EEF0F3",
          raised: "#FFFFFF",
        },
        ink: {
          DEFAULT: "#111827",
          secondary: "#4B5563",
          muted: "#6B7280",
          faint: "#9CA3AF",
        },
        line: {
          DEFAULT: "#E5E7EB",
          strong: "#D1D5DB",
          soft: "#F3F4F6",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)",
        card: "0 1px 2px rgba(16, 24, 40, 0.04)",
        panel: "0 8px 30px rgba(16, 24, 40, 0.08)",
        focus: "0 0 0 3px rgba(61, 82, 213, 0.18)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1rem",
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
    },
  },
  plugins: [],
};

export default config;
