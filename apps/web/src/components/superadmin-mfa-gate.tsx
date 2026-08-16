"use client";

import Link from "next/link";
import {
  ArrowRight,
  Check,
  Clock,
  Lock,
  Shield,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Gate de segurança do Superadministrador sem 2FA.
 * Versão simplificada e refinada: direta, sem excesso de decorações,
 * com foco na ação essencial de segurança.
 */
export function SuperadminMfaGate() {
  return (
    <div className="relative flex min-h-[calc(100vh-140px)] w-full items-center justify-center px-4 py-8 sm:py-10 select-none">
      {/* ── AMBIENTAÇÃO DE FUNDO (RADIAL GLOW ROXO MUITO SUTIL) ── */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
        aria-hidden
      >
        <div className="h-[380px] w-[520px] rounded-full bg-violet-600/[0.07] dark:bg-violet-600/[0.12] blur-[100px]" />
      </div>

      {/* ── CARD PRINCIPAL ── */}
      <div
        className={cn(
          "relative z-10 w-full max-w-[560px] overflow-hidden rounded-3xl p-6 sm:p-8",
          "border border-black/[0.08] bg-white/95 text-ink shadow-2xl shadow-black/10 backdrop-blur-xl",
          "dark:border-white/[0.08] dark:bg-[#11131a]/95 dark:text-zinc-100 dark:shadow-2xl dark:shadow-black/70",
          "dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
          "animate-in fade-in-0 duration-200"
        )}
      >
        <div className="flex flex-col items-center text-center">
          {/* ── ÍCONE DE ESCUDO (48px) ── */}
          <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-500/15 bg-violet-500/10 text-violet-600 shadow-xs dark:border-violet-400/20 dark:bg-violet-500/15 dark:text-violet-300">
            <Shield className="h-6 w-6" strokeWidth={2} />
          </div>

          {/* ── TÍTULO ── */}
          <h1 className="font-display text-xl sm:text-[22px] font-bold tracking-tight text-ink dark:text-white leading-tight">
            Proteja sua conta para continuar
          </h1>

          {/* ── DESCRIÇÃO DIRETA ── */}
          <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-ink-muted dark:text-zinc-400">
            Para acessar a Administração, ative a autenticação em duas etapas e adicione uma camada extra de segurança à sua conta.
          </p>

          {/* ── MINI FLUXO DE SEGURANÇA SIMPLIFICADO ── */}
          <div className="my-5 w-full rounded-2xl border border-black/[0.06] bg-black/[0.02] p-4 text-left dark:border-white/[0.06] dark:bg-white/[0.02]">
            <div className="flex flex-col">
              {/* ETAPA 1: SENHA CONFIGURADA */}
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink dark:text-zinc-200">
                    Senha configurada
                  </p>
                </div>
              </div>

              {/* CONECTOR VERTICAL */}
              <div className="h-3 w-px bg-black/[0.08] dark:bg-white/[0.08] ml-3 my-1" />

              {/* ETAPA 2: AUTENTICAÇÃO EM DUAS ETAPAS (PENDENTE) */}
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-ink dark:text-white leading-tight">
                    Autenticação em duas etapas
                  </p>
                  <p className="mt-0.5 text-[11.5px] font-medium text-amber-600 dark:text-amber-400">
                    Pendente
                  </p>
                </div>
              </div>

              {/* CONECTOR VERTICAL */}
              <div className="h-3 w-px bg-black/[0.08] dark:bg-white/[0.08] ml-3 my-1" />

              {/* ETAPA 3: ACESSO ADMINISTRATIVO */}
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-zinc-400 dark:bg-white/[0.06] dark:text-zinc-500">
                    <Lock className="h-3 w-3" strokeWidth={2} />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink-muted dark:text-zinc-400 leading-tight">
                    Acesso administrativo
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-ink-faint dark:text-zinc-500">
                    Liberado após ativar o 2FA
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── CTA PRINCIPAL (DOMINANTE) ── */}
          <Link
            href="/app/account/security?from=admin&setup=mfa#mfa-section"
            className={cn(
              "group flex h-11.5 sm:h-12 w-full items-center justify-center gap-2 rounded-xl px-5",
              "bg-violet-600 text-[13.5px] font-semibold text-white shadow-md shadow-violet-600/20",
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
          <div className="mt-2.5 flex items-center justify-center gap-1.5 text-[11.5px] text-ink-muted dark:text-zinc-400">
            <Clock className="h-3.5 w-3.5 shrink-0 text-ink-faint dark:text-zinc-500" />
            <span>Leva menos de 2 minutos.</span>
          </div>

          {/* ── DIVISOR E AÇÃO SECUNDÁRIA CENTRALIZADA ── */}
          <div className="mt-4.5 w-full border-t border-black/[0.06] pt-3.5 dark:border-white/[0.07]">
            <Link
              href="/app/account"
              className="inline-flex items-center justify-center gap-1.5 text-[12px] font-medium text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-white transition-colors group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/40 rounded-md px-2 py-1"
            >
              <User className="h-3.5 w-3.5 text-zinc-400 group-hover:text-ink dark:group-hover:text-white transition-colors" />
              <span>Ir para Minha conta</span>
              <span className="transition-transform duration-150 group-hover:translate-x-0.5">→</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
