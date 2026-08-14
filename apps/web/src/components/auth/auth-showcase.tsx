"use client";

import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

type Props = {
  headline?: string;
  subhead?: string;
  variant?: "login" | "onboarding";
  className?: string;
};

/**
 * Painel esquerdo — identidade NexaFlow (composição premium reconstruída).
 * Sem mockup de 4 cards, sem cursor-follow, sem landing genérica.
 */
export function AuthShowcase({
  headline,
  subhead,
  variant = "login",
  className,
}: Props) {
  const isOnboarding = variant === "onboarding";

  const title =
    headline ||
    (isOnboarding
      ? "Configure sua empresa"
      : "Atendimento, vendas e IA\nem um só lugar.");
  const support =
    subhead ||
    (isOnboarding
      ? "Alguns passos para deixar a conta pronta."
      : "Centralize conversas, clientes e automações.");

  return (
    <aside
      className={cn(
        "nf-auth-panel relative hidden min-h-screen overflow-hidden lg:flex lg:flex-col",
        className
      )}
      aria-hidden={false}
    >
      <BrandAtmosphere quieter={isOnboarding} />

      {/* Marca — canto superior esquerdo */}
      <div className="relative z-10 shrink-0 px-10 pt-10 xl:px-14 xl:pt-12">
        <div className="nf-anim-up">
          <Logo variant="full-white" size="md" withAi />
        </div>
      </div>

      {/* Bloco institucional + vislumbre do produto — centro vertical */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-center px-10 pb-16 xl:px-14">
        <div className="w-full max-w-[28rem]">
          <h1 className="nf-anim-up nf-delay-1 font-display text-[2.05rem] font-semibold leading-[1.12] tracking-[-0.04em] text-white xl:text-[2.35rem] whitespace-pre-line">
            {title}
          </h1>
          <p className="nf-anim-up nf-delay-2 mt-4 max-w-[22rem] text-[15px] font-normal leading-relaxed text-white/55">
            {support}
          </p>

          {!isOnboarding ? (
            <div className="nf-anim-up nf-delay-3 mt-12">
              <ProductGlimpse />
            </div>
          ) : null}
        </div>
      </div>

      {/* Soft blend into form column — sem linha rígida */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-[5] w-24 bg-gradient-to-l from-[#07060f] via-[#07060f]/40 to-transparent xl:w-32"
        aria-hidden
      />
    </aside>
  );
}

/**
 * Vislumbre abstrato da plataforma: painéis translúcidos, nós e fluxos.
 * Sem labels de produto, sem dados fictícios, sem dashboard mock.
 */
function ProductGlimpse() {
  return (
    <div className="relative w-full max-w-[22rem]" aria-hidden>
      {/* ambient wash behind composition */}
      <div className="pointer-events-none absolute -left-6 -top-8 h-40 w-40 rounded-full bg-violet-500/[0.14] blur-[48px]" />
      <div className="pointer-events-none absolute -bottom-4 right-0 h-28 w-28 rounded-full bg-indigo-500/[0.1] blur-[36px]" />

      <svg
        viewBox="0 0 360 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative h-auto w-full"
      >
        <defs>
          <linearGradient id="nf-g-panel" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.09" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0.03" />
          </linearGradient>
          <linearGradient id="nf-g-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#818CF8" stopOpacity="0" />
            <stop offset="45%" stopColor="#A78BFA" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="nf-g-bar" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#6366F1" stopOpacity="0.12" />
          </linearGradient>
          <filter id="nf-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.4" />
          </filter>
        </defs>

        {/* connection arcs */}
        <path
          d="M78 92 C 120 40, 200 40, 248 78"
          stroke="url(#nf-g-line)"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <path
          d="M92 128 C 150 168, 210 160, 268 118"
          stroke="url(#nf-g-line)"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.7"
        />

        {/* left stack — conversation stream (abstract) */}
        <g>
          <rect
            x="24"
            y="48"
            width="108"
            height="112"
            rx="14"
            fill="url(#nf-g-panel)"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="1"
          />
          <rect x="38" y="66" width="52" height="6" rx="3" fill="rgba(255,255,255,0.14)" />
          <rect x="38" y="84" width="80" height="5" rx="2.5" fill="rgba(255,255,255,0.08)" />
          <rect x="38" y="96" width="68" height="5" rx="2.5" fill="rgba(255,255,255,0.06)" />
          <rect x="38" y="114" width="44" height="22" rx="8" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.08)" />
          <rect x="70" y="128" width="48" height="22" rx="8" fill="rgba(109,94,245,0.22)" stroke="rgba(167,139,250,0.25)" />
        </g>

        {/* center node — AI hub */}
        <g>
          <circle cx="180" cy="100" r="28" fill="rgba(109,94,245,0.12)" stroke="rgba(167,139,250,0.28)" strokeWidth="1" />
          <circle cx="180" cy="100" r="16" fill="rgba(109,94,245,0.22)" stroke="rgba(199,180,254,0.35)" strokeWidth="1" />
          <circle cx="180" cy="100" r="5" fill="rgba(255,255,255,0.85)" />
          {/* orbit dots */}
          <circle cx="180" cy="68" r="2.5" fill="rgba(167,139,250,0.7)" />
          <circle cx="208" cy="112" r="2" fill="rgba(129,140,248,0.65)" />
          <circle cx="156" cy="118" r="2" fill="rgba(167,139,250,0.5)" />
        </g>

        {/* right stack — ops / funnel abstract */}
        <g>
          <rect
            x="228"
            y="42"
            width="112"
            height="56"
            rx="12"
            fill="url(#nf-g-panel)"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="1"
          />
          <rect x="242" y="58" width="36" height="5" rx="2.5" fill="rgba(255,255,255,0.14)" />
          <rect x="242" y="72" width="72" height="8" rx="4" fill="url(#nf-g-bar)" />

          <rect
            x="236"
            y="112"
            width="104"
            height="48"
            rx="12"
            fill="url(#nf-g-panel)"
            stroke="rgba(255,255,255,0.09)"
            strokeWidth="1"
          />
          <rect x="250" y="128" width="28" height="5" rx="2.5" fill="rgba(255,255,255,0.12)" />
          <rect x="250" y="140" width="48" height="5" rx="2.5" fill="rgba(255,255,255,0.07)" />
          <circle cx="318" cy="136" r="4" fill="rgba(52,211,153,0.55)" />
        </g>

        {/* floating micro nodes */}
        <circle cx="48" cy="36" r="3" fill="rgba(129,140,248,0.45)" />
        <circle cx="320" cy="32" r="2.5" fill="rgba(167,139,250,0.4)" />
        <circle cx="200" cy="172" r="2" fill="rgba(255,255,255,0.2)" />
      </svg>
    </div>
  );
}

/** Fundo atmosférico profundo — sem partículas, sem neon gamer */
function BrandAtmosphere({ quieter = false }: { quieter?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* base */}
      <div className="absolute inset-0 bg-[#07060f]" />

      {/* optional brand art — very subdued */}
      <div
        className={cn(
          "absolute inset-0 bg-cover bg-center opacity-[0.28]",
          quieter && "opacity-[0.18]"
        )}
        style={{
          backgroundImage: "url(/brand/login-bg-art.png)",
          backgroundPosition: "45% 40%",
        }}
      />

      {/* deep atmospheric glows */}
      <div className="absolute -left-[12%] top-[8%] h-[52vh] w-[52vh] max-w-[520px] rounded-full bg-violet-600/[0.16] blur-[100px]" />
      <div className="absolute left-[18%] top-[28%] h-[36vh] w-[36vh] rounded-full bg-indigo-600/[0.12] blur-[90px]" />
      <div className="absolute -bottom-[8%] left-[30%] h-[40vh] w-[50vh] rounded-full bg-blue-950/40 blur-[80px]" />

      {/* abstract curve shapes — extremely discreet */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.14]"
        viewBox="0 0 800 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <path
          d="M-40 220 C 180 80, 320 340, 520 200 C 680 90, 760 260, 860 180"
          stroke="rgba(167,139,250,0.55)"
          strokeWidth="1.2"
        />
        <path
          d="M-20 520 C 200 420, 340 640, 560 500 C 700 410, 780 580, 900 480"
          stroke="rgba(129,140,248,0.4)"
          strokeWidth="1"
        />
        <ellipse
          cx="200"
          cy="360"
          rx="160"
          ry="220"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1"
        />
      </svg>

      {/* tech grid — nearly imperceptible */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.55) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.55) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 40% 45%, black 10%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 60% at 40% 45%, black 10%, transparent 75%)",
        }}
      />

      {/* vignette + depth */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_85%_70%_at_35%_40%,transparent_0%,rgba(7,6,15,0.55)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#07060f]/90 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[#07060f] to-transparent" />
    </div>
  );
}
