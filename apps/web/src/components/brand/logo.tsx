"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

type LogoProps = {
  variant?: "mark" | "full" | "full-white";
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  withAi?: boolean;
};

const sizes = {
  sm: { mark: 28, word: "text-[13.5px]", ai: "text-[11px]", gap: "gap-2" },
  md: { mark: 34, word: "text-[16px]", ai: "text-[13px]", gap: "gap-2.5" },
  lg: { mark: 40, word: "text-[18px]", ai: "text-[15px]", gap: "gap-3" },
  xl: { mark: 48, word: "text-[22px]", ai: "text-[17px]", gap: "gap-3" },
};

type MarkProps = {
  className?: string;
  size?: number;
  /** true = versão clara para fundo escuro */
  white?: boolean;
};

/**
 * Marca NexaFlow — símbolo N em fluxo (SVG puro, elegante).
 */
export function LogoMark({ className, size = 32, white = false }: MarkProps) {
  const uid = useId().replace(/:/g, "");
  const gBg = `nf-bg-${uid}`;
  const gFlow = `nf-flow-${uid}`;
  const gShine = `nf-shine-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={gBg} x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#312E81" />
          <stop offset="0.45" stopColor="#4F46E5" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
        <linearGradient id={gFlow} x1="10" y1="16" x2="38" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="#E0E7FF" />
          <stop offset="1" stopColor="#C4B5FD" />
        </linearGradient>
        <linearGradient id={gShine} x1="24" y1="0" x2="24" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity="0.25" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* base */}
      <rect width="48" height="48" rx="13" fill={`url(#${gBg})`} />
      <path
        d="M13 1.5h22c6.5 0 11.5 4.5 12.5 10.5H0.5C1.5 6 6.5 1.5 13 1.5z"
        fill={`url(#${gShine})`}
      />
      <rect
        x="1"
        y="1"
        width="46"
        height="46"
        rx="12"
        stroke="white"
        strokeOpacity="0.12"
        strokeWidth="1"
        fill="none"
      />

      {/* N estilizado — hastes + diagonal fluida */}
      {/* haste esquerda */}
      <path
        d="M14 34.5V14.2c0-.7.55-1.2 1.2-1.2h2.1c.65 0 1.2.5 1.2 1.2V34.5c0 .65-.55 1.2-1.2 1.2h-2.1c-.65 0-1.2-.55-1.2-1.2z"
        fill="white"
        fillOpacity="0.92"
      />
      {/* haste direita */}
      <path
        d="M29.5 34.5V14.2c0-.7.55-1.2 1.2-1.2h2.1c.65 0 1.2.5 1.2 1.2V34.5c0 .65-.55 1.2-1.2 1.2h-2.1c-.65 0-1.2-.55-1.2-1.2z"
        fill="white"
        fillOpacity="0.92"
      />
      {/* diagonal / fluxo */}
      <path
        d="M16.5 15.5c4.5 0 7.5 4.2 11 8.8 1.8 2.4 3.6 4.7 5.8 6.2"
        stroke={`url(#${gFlow})`}
        strokeWidth="3.4"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M15.2 18.8c4.2 0 7 3.6 10.2 7.6 1.6 2 3.2 3.8 5.2 5"
        stroke="white"
        strokeOpacity="0.35"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />

      {/* nós de conexão (tech/AI) */}
      <circle cx="12.5" cy="22" r="1.5" fill="#A5B4FC" />
      <circle cx="12.5" cy="27" r="1.15" fill="#C4B5FD" fillOpacity="0.85" />
      <circle cx="35.5" cy="22" r="1.5" fill="#A5B4FC" />
      <circle cx="35.5" cy="27" r="1.15" fill="#C4B5FD" fillOpacity="0.85" />
      <path d="M14 22H16.2" stroke="#A5B4FC" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M14 27H15.8" stroke="#C4B5FD" strokeWidth="1.1" strokeLinecap="round" strokeOpacity="0.8" />
      <path d="M32 22H35.5" stroke="#A5B4FC" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M32.2 27H35.5" stroke="#C4B5FD" strokeWidth="1.1" strokeLinecap="round" strokeOpacity="0.8" />
    </svg>
  );
}

/**
 * Logo NexaFlow AI
 * - NexaFlow: preto (página clara) ou branco (página escura)
 * - AI: gradiente roxo elegante
 */
export function Logo({
  variant = "full",
  className,
  markClassName,
  showWordmark = true,
  size = "md",
  withAi = true,
}: LogoProps) {
  const s = sizes[size];
  const onDark = variant === "full-white";
  const uid = useId().replace(/:/g, "");
  const gAi = `nf-ai-${uid}`;

  if (variant === "mark" || !showWordmark) {
    return <LogoMark size={s.mark} white={onDark} className={cn(markClassName, className)} />;
  }

  return (
    <div
      className={cn("inline-flex items-center select-none", s.gap, className)}
      aria-label="NexaFlow AI"
    >
      <LogoMark size={s.mark} white={onDark} className={markClassName} />

      <span
        className={cn(
          "inline-flex items-baseline gap-1 font-display font-semibold tracking-[-0.035em] leading-none",
          s.word
        )}
      >
        <span className={onDark ? "text-white" : "text-ink dark:text-white"}>
          NexaFlow
        </span>
        {withAi && (
          <>
            <svg width="0" height="0" className="absolute" aria-hidden>
              <defs>
                <linearGradient id={gAi} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#818CF8" />
                  <stop offset="50%" stopColor="#7C3AED" />
                  <stop offset="100%" stopColor="#A855F7" />
                </linearGradient>
              </defs>
            </svg>
            <span
              className={cn(
                "bg-clip-text font-semibold tracking-[0.06em] opacity-95",
                s.ai
              )}
              style={{
                backgroundImage: "linear-gradient(135deg, #818CF8 0%, #7C3AED 50%, #A855F7 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              AI
            </span>
          </>
        )}
      </span>
    </div>
  );
}
