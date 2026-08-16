"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Clock,
  HelpCircle,
  Lock,
  Shield,
  ShieldAlert,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Gate de segurança premium para Superadministrador sem 2FA.
 * Design Linear / Stripe: Centralizado, com ambientação de profundidade,
 * mini fluxo de segurança visual de 3 etapas, CTA dominante e ação secundária clara.
 */
export function SuperadminMfaGate() {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative flex min-h-[calc(100vh-140px)] w-full items-center justify-center px-4 py-8 sm:py-12 select-none">
      {/* ── AMBIENTAÇÃO DE FUNDO (RADIAL GLOWS DISCRETOS) ── */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
        aria-hidden
      >
        {/* Glow roxo primário centralizado atrás do card */}
        <div className="h-[420px] w-[580px] rounded-full bg-violet-600/[0.08] dark:bg-violet-600/[0.14] blur-[120px]" />
        {/* Glow secundário sutil azul/índigo para profundidade */}
        <div className="absolute h-[320px] w-[460px] translate-y-12 rounded-full bg-indigo-500/[0.05] dark:bg-indigo-500/[0.10] blur-[100px]" />
      </div>

      {/* ── CARD PRINCIPAL ── */}
      <div
        className={cn(
          "relative z-10 w-full max-w-[620px] overflow-hidden rounded-3xl p-7 sm:p-9",
          "border border-black/[0.08] bg-white/95 text-ink shadow-2xl shadow-black/10 backdrop-blur-xl",
          "dark:border-white/[0.08] dark:bg-[#11131a]/95 dark:text-zinc-100 dark:shadow-2xl dark:shadow-black/70",
          "dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
          "transition-all duration-200 ease-out",
          "animate-in fade-in-0 zoom-in-[0.99] duration-300"
        )}
      >
        {/* Leve highlight linear no topo do card */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent"
          aria-hidden
        />

        <div className="flex flex-col items-center text-center">
          {/* ── ÍCONE DE ESCUDO EM ÁREA VISUAL DEDICADA (56px) ── */}
          <div className="relative mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-500/10 text-violet-600 shadow-sm shadow-violet-500/10 dark:border-violet-400/25 dark:bg-violet-500/15 dark:text-violet-300">
            <Shield className="h-7 w-7" strokeWidth={2} />
          </div>

          {/* ── BADGE DE CONTEXTO REFINADO ── */}
          <div className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/20 bg-violet-500/[0.06] px-3 py-0.5 text-[11px] font-medium text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/[0.1] dark:text-violet-300">
            <ShieldAlert className="h-3.5 w-3.5" strokeWidth={2} />
            <span>Ação de segurança obrigatória</span>
          </div>

          {/* ── TÍTULO ── */}
          <h1 className="mt-3.5 font-display text-xl sm:text-[24px] font-bold tracking-tight text-ink dark:text-white leading-tight">
            Proteja sua conta para continuar
          </h1>

          {/* ── DESCRIÇÃO ── */}
          <p className="mt-2 max-w-lg text-[13px] sm:text-[13.5px] leading-relaxed text-ink-muted dark:text-zinc-400">
            A autenticação em duas etapas é obrigatória para contas de Superadministrador e adiciona uma camada extra de proteção às configurações críticas da plataforma.
          </p>

          {/* ── MINI FLUXO DE SEGURANÇA (3 ETAPAS) ── */}
          <div className="my-6 w-full rounded-2xl border border-black/[0.06] bg-black/[0.02] p-4 sm:p-5 text-left dark:border-white/[0.06] dark:bg-white/[0.02]">
            <div className="flex flex-col">
              {/* ETAPA 1: SENHA CONFIGURADA (CONCLUÍDO) */}
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                  </div>
                  <div className="h-5 w-px bg-black/[0.08] dark:bg-white/[0.08] my-0.5" />
                </div>
                <div className="pt-0.5 min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-tight text-ink dark:text-zinc-200">
                    Senha configurada
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-ink-muted dark:text-zinc-400">
                    Credenciais de acesso verificadas
                  </p>
                </div>
              </div>

              {/* ETAPA 2: AUTENTICAÇÃO EM DUAS ETAPAS (PENDENTE / DESTAQUE) */}
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                  </div>
                  <div className="h-5 w-px bg-black/[0.08] dark:bg-white/[0.08] my-0.5" />
                </div>
                <div className="pt-0.5 min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-tight text-ink dark:text-white">
                    Autenticação em duas etapas
                  </p>
                  <p className="mt-0.5 text-[11.5px] font-medium text-amber-600 dark:text-amber-400">
                    Configuração pendente
                  </p>
                </div>
              </div>

              {/* ETAPA 3: ACESSO ADMINISTRATIVO (PRÓXIMO ESTADO) */}
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-zinc-400 dark:bg-white/[0.06] dark:text-zinc-500">
                  <Lock className="h-3.5 w-3.5" strokeWidth={2} />
                </div>
                <div className="pt-0.5 min-w-0 flex-1">
                  <p className="text-[13px] font-medium leading-tight text-ink-muted dark:text-zinc-400">
                    Acesso administrativo
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-ink-faint dark:text-zinc-500">
                    Liberado após concluir a configuração
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── CTA PRINCIPAL (DOMINANTE) ── */}
          <Link
            href="/app/account/security?from=admin&setup=mfa#mfa-section"
            className={cn(
              "group flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5",
              "bg-violet-600 text-[13.5px] font-semibold text-white shadow-lg shadow-violet-600/20",
              "hover:bg-violet-700 hover:shadow-violet-600/30 dark:bg-violet-600 dark:hover:bg-violet-500",
              "active:scale-[0.99] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            )}
          >
            <span>Configurar autenticação em duas etapas</span>
            <ArrowRight
              className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-1"
              strokeWidth={2}
            />
          </Link>

          {/* ── MICROTEXTO ABAIXO DO CTA ── */}
          <div className="mt-3 flex items-center justify-center gap-1.5 text-[11.5px] text-ink-muted dark:text-zinc-400">
            <Clock className="h-3.5 w-3.5 shrink-0 text-ink-faint dark:text-zinc-500" />
            <span>Leva menos de 2 minutos · Use Google Authenticator, Authy ou 1Password.</span>
          </div>

          {/* ── DIVISOR E AÇÃO SECUNDÁRIA ── */}
          <div className="mt-5 w-full border-t border-black/[0.06] pt-4 dark:border-white/[0.07]">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              {/* Informação adicional com tooltip */}
              <div className="relative">
                <button
                  type="button"
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                  onFocus={() => setShowTooltip(true)}
                  onBlur={() => setShowTooltip(false)}
                  className="inline-flex items-center gap-1 text-[11.5px] text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/40 rounded-md px-1 py-0.5 cursor-help"
                >
                  <HelpCircle className="h-3.5 w-3.5 text-zinc-400" />
                  <span>Por que isso é obrigatório?</span>
                </button>

                {showTooltip ? (
                  <div
                    role="tooltip"
                    className="absolute bottom-full left-1/2 mb-2 w-64 -translate-x-1/2 rounded-xl border border-black/[0.08] bg-white p-2.5 text-[11.5px] leading-relaxed text-zinc-700 shadow-xl dark:border-white/[0.09] dark:bg-[#181a24] dark:text-zinc-200 z-30 pointer-events-none"
                  >
                    Contas de Superadministrador possuem acesso a configurações críticas da plataforma e exigem uma segunda camada de autenticação.
                  </div>
                ) : null}
              </div>

              {/* Link secundário: Ir para Minha conta */}
              <Link
                href="/app/account"
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-white transition-colors group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/40 rounded-md px-1 py-0.5"
              >
                <User className="h-3.5 w-3.5 text-zinc-400 group-hover:text-ink dark:group-hover:text-white transition-colors" />
                <span>Ir para Minha conta</span>
                <span className="transition-transform duration-150 group-hover:translate-x-0.5">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
