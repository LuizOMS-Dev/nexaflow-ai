"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, MessageCircle } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/** Ritmo legível: digitar → mensagem → pausa → hold longo antes de reiniciar */
const TYPING_MS = 1100;
const AFTER_MSG_MS = 1800;
const HOLD_MS = 6500;
const FADE_MS = 1000;

type ChatLine = {
  side: "in" | "out";
  agent?: boolean;
  content: ReactNode;
};

const CHAT_LINES: ChatLine[] = [
  { side: "in", content: "Oi! Nossa equipe precisa organizar melhor os atendimentos." },
  {
    side: "out",
    agent: true,
    content: (
      <>
        <span className="mb-0.5 block text-[9.5px] font-semibold tracking-wide text-indigo-100/75">
          Lia · Assistente comercial
        </span>
        Olá! Posso ajudar a centralizar as conversas, registrar os contatos e acompanhar as
        oportunidades no funil. Como sua equipe trabalha hoje?
      </>
    ),
  },
  { side: "in", content: "Hoje cada pessoa acompanha de um jeito." },
  {
    side: "out",
    agent: true,
    content:
      "Entendi. Com uma fila compartilhada e responsáveis definidos, a equipe mantém o histórico no mesmo lugar e sabe qual é o próximo passo.",
  },
];

const DEFAULT_BULLETS = [
  "WhatsApp conectado",
  "Atendimento com IA",
  "Clientes e vendas juntos",
];

const PILLARS = [
  { label: "WhatsApp", hint: "Conecte o número" },
  { label: "Conversas", hint: "Fila de atendimento" },
  { label: "CRM", hint: "Funil de vendas" },
  { label: "Agentes de IA", hint: "Respostas assistidas" },
] as const;

type Props = {
  headline?: string;
  subhead?: string;
  bullets?: string[];
  variant?: "login" | "onboarding";
  className?: string;
};

const ONBOARDING_BULLETS = [
  "Identidade da sua empresa",
  "Dados da conta separados",
  "Conecte o WhatsApp e comece",
];

/**
 * Painel premium NexaFlow.
 * login = comercial com demo de chat
 * onboarding = calmo, institucional, sem chat
 */
export function AuthShowcase({
  headline,
  subhead,
  bullets,
  variant = "login",
  className,
}: Props) {
  const isOnboarding = variant === "onboarding";
  const panelRef = useRef<HTMLElement>(null);

  // Spotlight + parallax: interpolação suave das coords do mouse (CSS vars)
  useInteractiveBackground(panelRef);

  const title =
    headline ||
    (isOnboarding
      ? "Configure sua empresa"
      : "Atendimento e vendas em um só lugar");
  const support =
    subhead ||
    (isOnboarding
      ? "Alguns passos para deixar a conta pronta."
      : "Conversas, contatos e IA na mesma plataforma.");
  const items = bullets || (isOnboarding ? ONBOARDING_BULLETS : DEFAULT_BULLETS);

  return (
    <aside
      ref={panelRef}
      className={cn(
        "nf-auth-panel relative hidden min-h-screen overflow-hidden lg:flex lg:flex-col lg:justify-between",
        "bg-[#06060f] px-10 py-10 xl:px-14 xl:py-12",
        className
      )}
    >
      <BrandArt quieter={isOnboarding} />

      <div className="relative z-10">
        <div className="nf-anim-up flex items-center gap-3">
          <Logo variant="full-white" size="lg" withAi />
        </div>

        <h1 className="nf-anim-up nf-delay-1 mt-10 max-w-[22rem] font-display text-[1.85rem] font-semibold leading-[1.18] tracking-[-0.035em] text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.45)] xl:text-[2.05rem]">
          {title}
        </h1>
        <p className="nf-anim-up nf-delay-2 mt-4 max-w-[21rem] text-[14px] leading-relaxed text-white/[0.65] drop-shadow-[0_1px_12px_rgba(0,0,0,0.45)]">
          {support}
        </p>

        <ul className="nf-anim-up nf-delay-3 mt-7 space-y-2.5">
          {items.map((b) => (
            <li
              key={b}
              className="flex items-start gap-2.5 text-[13px] text-white/[0.88] drop-shadow-[0_1px_8px_rgba(0,0,0,0.4)]"
            >
              <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-emerald-400/[0.15] text-emerald-300 ring-1 ring-emerald-400/25">
                <Check className="h-2.5 w-2.5" strokeWidth={2.75} />
              </span>
              {b}
            </li>
          ))}
        </ul>
      </div>

      {!isOnboarding && (
        <div className="nf-anim-up nf-delay-4 relative z-10 mt-8">
          <div className="nf-auth-float relative overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.06] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7),0_0_0_1px_rgba(129,140,248,0.08)]">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"
              aria-hidden
            />
            <div className="relative flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400/25 to-emerald-600/10 text-[11px] font-semibold text-emerald-200 ring-1 ring-emerald-400/30">
                  CD
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#0c0d18] bg-emerald-400" />
                </span>
                <div>
                  <p className="text-[13px] font-medium tracking-tight text-white/95">Contato de demonstração</p>
                  <p className="flex items-center gap-1 text-[11px] text-white/40">
                    <MessageCircle className="h-3 w-3" strokeWidth={2} />
                    WhatsApp
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/[0.12] px-2.5 py-1 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-400/20">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                Exemplo
              </span>
            </div>
            <ChatLoop />
          </div>

          {/* cards discretos — não competem com o chat */}
          <div className="mt-3 grid grid-cols-2 gap-1.5 xl:grid-cols-4">
            {PILLARS.map((p, i) => (
              <div
                key={p.label}
                className={cn(
                  "nf-auth-pillar group cursor-default rounded-lg border border-white/[0.06] bg-white/[0.04] px-2 py-2 text-left",
                  `nf-auth-pillar-${i + 1}`
                )}
              >
                <p className="text-[11px] font-medium tracking-tight text-white/[0.72] transition-colors duration-300 group-hover:text-white/90">
                  {p.label}
                </p>
                <p className="mt-0.5 text-[9.5px] leading-snug text-white/30 transition-colors duration-300 group-hover:text-white/[0.45]">
                  {p.hint}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

/**
 * Mouse no painel esquerdo — versão leve:
 * - 1 spotlight (sem parallax multi-camada)
 * - rect em cache (sem getBoundingClientRect a cada pixel)
 * - rAF único com lerp mais curto
 * Respeita prefers-reduced-motion.
 */
function useInteractiveBackground(panelRef: { current: HTMLElement | null }) {
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      el.style.setProperty("--mx", "50%");
      el.style.setProperty("--my", "42%");
      return;
    }

    let targetX = 0.5;
    let targetY = 0.42;
    let curX = 0.5;
    let curY = 0.42;
    let raf = 0;
    let rect = el.getBoundingClientRect();

    // Lerp mais alto = menos frames até estabilizar (menos “lento”)
    const LERP = 0.14;

    const apply = () => {
      // 2 props só — evita repaint de várias camadas parallax
      el.style.setProperty("--mx", `${(curX * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${(curY * 100).toFixed(1)}%`);
    };

    const tick = () => {
      curX += (targetX - curX) * LERP;
      curY += (targetY - curY) * LERP;
      apply();

      const still =
        Math.abs(targetX - curX) < 0.002 && Math.abs(targetY - curY) < 0.002;
      if (!still) {
        raf = requestAnimationFrame(tick);
      } else {
        curX = targetX;
        curY = targetY;
        apply();
        raf = 0;
      }
    };

    const onMove = (e: MouseEvent) => {
      if (rect.width <= 0 || rect.height <= 0) return;
      targetX = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      targetY = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onResize = () => {
      rect = el.getBoundingClientRect();
    };

    apply();
    el.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", onResize);
    };
  }, [panelRef]);
}

/**
 * Fundo premium leve: imagem estática + 2 glows + 1 spotlight.
 * Sem Ken Burns, sem sparkles animados, sem parallax em 3 eixos.
 */
function BrandArt({ quieter = false }: { quieter?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[#06060f]" />

      <div className="nf-auth-bg-stage absolute inset-0">
        <div
          className="nf-auth-bg-image absolute inset-0 bg-cover bg-no-repeat"
          style={{
            backgroundImage: "url(/brand/login-bg-art.png)",
            backgroundPosition: quieter ? "48% 38%" : "52% 42%",
          }}
        />
      </div>

      {/* glows com pulso leve de opacidade */}
      <div className="nf-auth-glow absolute -left-20 top-[-6%] h-[320px] w-[320px] rounded-full bg-indigo-500/[0.18] blur-[60px]" />
      <div className="nf-auth-glow nf-auth-glow-b absolute -right-12 bottom-[-4%] h-[280px] w-[280px] rounded-full bg-violet-600/[0.14] blur-[56px]" />

      <div className={cn("nf-auth-bg-overlay absolute inset-0", quieter && "opacity-95")} />

      {/* um único spotlight no mouse */}
      <div className="nf-auth-spotlight absolute inset-0" />

      <div className="absolute inset-y-0 right-0 w-[38%] bg-gradient-to-l from-[#06060f] via-[#06060f]/[0.65] to-transparent" />
      <div className="absolute inset-y-0 right-0 w-[14%] bg-gradient-to-l from-[#06060f] to-transparent" />

      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#06060f]/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[#06060f]/[0.85] to-transparent" />
    </div>
  );
}

function ChatLoop() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [typing, setTyping] = useState<{ side: "in" | "out" } | null>({ side: "in" });
  const [phase, setPhase] = useState<"play" | "fade">("play");
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    setVisibleCount(0);
    setTyping({ side: CHAT_LINES[0].side });
    setPhase("play");

    const timers: number[] = [];
    let t = 0;

    CHAT_LINES.forEach((line, i) => {
      timers.push(
        window.setTimeout(() => {
          setTyping({ side: line.side });
        }, t)
      );
      t += TYPING_MS;

      timers.push(
        window.setTimeout(() => {
          setTyping(null);
          setVisibleCount(i + 1);
        }, t)
      );
      t += AFTER_MSG_MS;
    });

    t += HOLD_MS - AFTER_MSG_MS;

    timers.push(
      window.setTimeout(() => {
        setTyping(null);
        setPhase("fade");
      }, t)
    );
    t += FADE_MS;

    timers.push(
      window.setTimeout(() => {
        setCycle((c) => c + 1);
      }, t)
    );

    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [cycle]);

  return (
    <div
      className={cn(
        "min-h-[188px] px-4 py-3.5 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
        phase === "fade" ? "translate-y-1 scale-[0.985] opacity-0" : "translate-y-0 scale-100 opacity-100"
      )}
    >
      <div className="space-y-2.5">
        {CHAT_LINES.slice(0, visibleCount).map((line, i) => (
          <Bubble key={`${cycle}-${i}`} side={line.side} agent={line.agent}>
            {line.content}
          </Bubble>
        ))}
        {typing && phase === "play" && (
          <TypingDots side={typing.side} agent={typing.side === "out"} />
        )}
      </div>
    </div>
  );
}

function TypingDots({ side, agent }: { side: "in" | "out"; agent?: boolean }) {
  return (
    <div className={cn("nf-auth-typing flex", side === "out" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "flex items-center gap-1 rounded-2xl px-3 py-2",
          side === "in" && "rounded-bl-md bg-white/[0.07] ring-1 ring-white/[0.06]",
          side === "out" &&
            (agent
              ? "rounded-br-md bg-gradient-to-br from-indigo-500/[0.85] to-violet-600/[0.85] shadow-[0_0_20px_rgba(99,102,241,0.25)]"
              : "rounded-br-md bg-indigo-500/80")
        )}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "nf-auth-dot h-1.5 w-1.5 rounded-full",
              i === 1 && "nf-auth-dot-2",
              i === 2 && "nf-auth-dot-3",
              agent ? "bg-white/75" : "bg-white/[0.45]"
            )}
          />
        ))}
      </div>
    </div>
  );
}

function Bubble({
  children,
  side,
  agent,
}: {
  children: ReactNode;
  side: "in" | "out";
  agent?: boolean;
}) {
  return (
    <div className={cn("nf-auth-msg-live flex", side === "out" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[92%] px-3.5 py-2 text-[12.5px] leading-relaxed",
          side === "in" &&
            "rounded-2xl rounded-bl-md bg-white/[0.08] text-white/[0.88] ring-1 ring-white/[0.06]",
          side === "out" &&
            (agent
              ? "rounded-2xl rounded-br-md bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-[0_8px_24px_-10px_rgba(99,102,241,0.75)]"
              : "rounded-2xl rounded-br-md bg-indigo-500/90 text-white")
        )}
      >
        {children}
      </div>
    </div>
  );
}
