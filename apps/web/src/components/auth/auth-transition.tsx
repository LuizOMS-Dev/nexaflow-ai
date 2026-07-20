"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

export type AuthTransitionMode =
  | "login-first"
  | "login-return"
  | "onboarding-done"
  | "impersonation";

type Props = {
  mode: AuthTransitionMode;
  /** Nome da pessoa (preferir nome real; evita Admin/Administrador) */
  personName?: string;
  companyName?: string;
  companyLogo?: string | null;
  /** confirm | prepare = overlay; exit = saída para dashboard */
  stage: "confirm" | "prepare" | "exit";
  className?: string;
};

const GENERIC_NAMES = new Set([
  "admin",
  "administrador",
  "administrator",
  "usuário",
  "usuario",
  "user",
  "superadmin",
  "super admin",
]);

function displayFirstName(name?: string) {
  const n = (name || "").trim();
  if (!n) return "";
  const first = n.split(/\s+/)[0];
  if (GENERIC_NAMES.has(first.toLowerCase()) || GENERIC_NAMES.has(n.toLowerCase())) {
    return "";
  }
  // Capitaliza de forma simples
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function displayCompany(name?: string) {
  const n = (name || "").trim();
  if (!n) return "";
  if (n.toLowerCase() === "minha empresa") return "";
  return n;
}

/**
 * Overlay de transição premium (login / onboarding → painel).
 * Curto, clean, dark — sem spinner, sem confete, sem arte pesada.
 */
export function AuthTransition({
  mode,
  personName,
  companyName,
  companyLogo,
  stage,
  className,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [statusIdx, setStatusIdx] = useState(0);
  const [readyFlash, setReadyFlash] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const first = displayFirstName(personName);
  const company = displayCompany(companyName);

  const statusSteps = useMemo(() => {
    if (mode === "impersonation") {
      return [
        "Validando acesso administrativo...",
        company
          ? `Preparando o ambiente da ${company}...`
          : "Preparando o ambiente com acesso administrativo...",
        "Abrindo o painel...",
      ];
    }
    if (mode === "login-first") {
      return [
        "Validando sua sessão...",
        company
          ? `Preparando o ambiente da ${company}...`
          : "Vamos preparar seu ambiente...",
        "Abrindo o onboarding...",
      ];
    }
    if (mode === "onboarding-done") {
      return [
        company ? `${company} está pronta.` : "Ambiente configurado.",
        "Abrindo seu painel...",
      ];
    }
    // login-return
    return [
      "Validando sua sessão...",
      company
        ? `Preparando o ambiente da ${company}...`
        : "Preparando seu ambiente...",
      "Abrindo seu painel...",
    ];
  }, [mode, company]);

  // Rotaciona mensagens por crossfade (sem typewriter)
  useEffect(() => {
    if (stage === "exit") {
      setReadyFlash(true);
      return;
    }
    setReadyFlash(false);
    setStatusIdx(0);
    if (statusSteps.length <= 1) return;
    const timers: number[] = [];
    const stepMs = 420;
    for (let i = 1; i < statusSteps.length; i++) {
      timers.push(
        window.setTimeout(() => setStatusIdx(i), stepMs * i)
      );
    }
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [stage, statusSteps]);

  const title =
    mode === "impersonation"
      ? company
        ? `Acessando ${company}`
        : "Acesso administrativo"
      : mode === "login-first"
        ? first
          ? `Bem-vindo à NexaFlow AI, ${first}.`
          : "Bem-vindo à NexaFlow AI."
        : mode === "onboarding-done"
          ? "Tudo pronto."
          : first
            ? `Bem-vindo de volta, ${first}.`
            : "Bem-vindo de volta.";

  const statusText = readyFlash
    ? "Tudo pronto."
    : statusSteps[Math.min(statusIdx, statusSteps.length - 1)];

  return (
    <div
      className={cn(
        "nf-auth-transition fixed inset-0 flex items-center justify-center overflow-hidden",
        visible && "nf-auth-transition-on",
        stage === "exit" && "nf-auth-transition-exit",
        mode === "login-first" && stage === "exit" && "nf-auth-transition-exit-slow",
        className
      )}
      style={{ zIndex: "var(--z-auth, 90)" }}
      role="status"
      aria-live="polite"
      aria-busy={stage !== "exit"}
    >
      {/* Base opaca + glow sutil (sem imagem pesada) */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 bg-[#06060f]" />
        <div
          className={cn(
            "absolute inset-0 nf-auth-tr-mesh",
            stage === "exit" && "nf-auth-transition-layer-out"
          )}
        />
        <div
          className={cn(
            "nf-auth-tr-core-glow absolute left-1/2 top-[42%] h-[min(520px,70vw)] w-[min(520px,70vw)] -translate-x-1/2 -translate-y-1/2 rounded-full",
            stage === "exit" && "nf-auth-transition-layer-out"
          )}
        />
        <div
          className={cn(
            "nf-auth-tr-glow-soft absolute left-1/2 top-[38%] h-[280px] w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/[0.12] blur-[90px]",
            stage === "exit" && "nf-auth-transition-layer-out"
          )}
        />
        <div
          className={cn(
            "nf-auth-tr-glow-soft-b absolute bottom-[18%] right-[22%] h-[200px] w-[200px] rounded-full bg-violet-600/[0.1] blur-[80px]",
            stage === "exit" && "nf-auth-transition-layer-out"
          )}
        />
      </div>

      <div
        className={cn(
          "nf-auth-transition-content relative z-10 flex max-w-[20rem] flex-col items-center px-6 text-center sm:max-w-sm",
          stage === "exit" && "nf-auth-transition-content-out"
        )}
      >
        {mode === "onboarding-done" ? (
          <div className="nf-auth-transition-check relative mb-7 flex h-[80px] w-[80px] items-center justify-center">
            <span className="nf-auth-transition-ring absolute inset-0 rounded-full border border-indigo-400/25" />
            <div className="relative flex h-[64px] w-[64px] items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 shadow-[0_12px_36px_-14px_rgba(99,102,241,0.55)]">
              <Check className="h-7 w-7 text-white" strokeWidth={2.4} />
            </div>
          </div>
        ) : (
          <div className="nf-auth-transition-logo relative mb-8">
            <div className="nf-auth-tr-logo-glow absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/25 blur-2xl" />
            <div className="relative">
              <Logo variant="full-white" size="lg" withAi />
            </div>
          </div>
        )}

        {mode === "onboarding-done" && (companyLogo || company) && (
          <div className="nf-auth-transition-company mb-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 backdrop-blur-sm">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white/[0.06] ring-1 ring-white/10">
              {companyLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={companyLogo} alt="" className="h-full w-full object-contain p-1" />
              ) : (
                <span className="text-[11px] font-bold text-white/70">
                  {(company || "NE").slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="text-left">
              <p className="text-[13px] font-semibold text-white/90">{company || "Sua empresa"}</p>
              <p className="text-[11px] text-white/[0.35]">Ambiente preparado com NexaFlow AI</p>
            </div>
          </div>
        )}

        <h2 className="nf-auth-transition-title font-display text-[1.45rem] font-semibold tracking-[-0.03em] text-white sm:text-[1.65rem]">
          {title}
        </h2>

        <div className="nf-auth-transition-sub relative mt-3 min-h-[2.75rem] w-full">
          <p
            key={readyFlash ? "ready" : statusIdx}
            className="nf-auth-tr-status absolute inset-x-0 text-[14px] leading-relaxed text-white/[0.48]"
          >
            {statusText}
          </p>
        </div>

        {/* Barra refinada */}
        <div className="nf-auth-tr-progress mt-9 w-40 sm:w-44">
          <div className="relative h-[2px] overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className={cn(
                "nf-auth-transition-bar absolute inset-y-0 left-0 rounded-full",
                stage === "exit" && "nf-auth-transition-bar-done"
              )}
            />
            <div
              className={cn(
                "nf-auth-tr-bar-tip absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full",
                stage === "exit" && "nf-auth-tr-bar-tip-done"
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function markAppEntrance(kind: "return" | "first-skip" | "onboarding") {
  try {
    sessionStorage.setItem("nexaflow_app_enter", kind);
  } catch {
    /* ignore */
  }
}

export function consumeAppEntrance(): "return" | "first-skip" | "onboarding" | null {
  try {
    const v = sessionStorage.getItem("nexaflow_app_enter");
    if (v) sessionStorage.removeItem("nexaflow_app_enter");
    if (v === "return" || v === "first-skip" || v === "onboarding") return v;
  } catch {
    /* ignore */
  }
  return null;
}
