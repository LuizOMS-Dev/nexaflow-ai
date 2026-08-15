"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Lock,
  Shield,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

/**
 * Gate de segurança elegante para Superadministrador sem 2FA.
 * Painel centralizado estilo Linear / Stripe, transmitindo confiança e segurança.
 */
export function SuperadminMfaGate() {
  return (
    <div className="flex min-h-[min(75vh,38rem)] w-full items-center justify-center px-4 py-8 sm:py-12">
      <div className="relative w-full max-w-[560px] overflow-hidden rounded-2xl border border-black/[0.08] bg-white p-7 sm:p-10 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_16px_36px_-12px_rgba(0,0,0,0.12)] dark:border-white/[0.08] dark:bg-[#0e1017] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset,0_20px_48px_-16px_rgba(0,0,0,0.8)]">
        {/* Glow sutil no topo */}
        <div
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-48 w-80 rounded-full bg-violet-600/15 blur-3xl dark:bg-violet-500/20"
          aria-hidden
        />

        <div className="relative z-10 flex flex-col items-center text-center">
          {/* Ícone de Escudo no topo com halo violeta */}
          <div className="mb-4 flex h-13 w-13 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 ring-1 ring-violet-500/20 shadow-sm dark:bg-violet-500/15 dark:text-violet-400 dark:ring-violet-400/25">
            <Shield className="h-7 w-7" strokeWidth={1.75} />
          </div>

          {/* Badge: Ação de segurança obrigatória */}
          <div className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/20 bg-violet-500/[0.08] px-3 py-0.5 text-[11.5px] font-semibold text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/[0.12] dark:text-violet-300">
            <ShieldAlert className="h-3.5 w-3.5" strokeWidth={2} />
            <span>Ação de segurança obrigatória</span>
          </div>

          {/* Título */}
          <h1 className="mt-3.5 font-display text-xl sm:text-2xl font-bold tracking-tight text-ink dark:text-white">
            Proteja sua conta para continuar
          </h1>

          {/* Descrição */}
          <p className="mt-2 max-w-md text-xs sm:text-[13.5px] leading-relaxed text-ink-muted dark:text-zinc-400">
            A autenticação em duas etapas é obrigatória para contas de Superadministrador e protege o acesso às configurações críticas da plataforma.
          </p>

          {/* Status visual / Checklist */}
          <div className="my-6 w-full rounded-xl border border-black/[0.06] bg-black/[0.02] p-3.5 sm:p-4 text-left dark:border-white/[0.06] dark:bg-white/[0.02]">
            <ul className="space-y-2.5 text-xs sm:text-[12.5px]">
              {/* Item 1: Senha configurada */}
              <li className="flex items-center gap-2.5 text-emerald-700 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
                <span>Senha configurada</span>
              </li>

              {/* Item 2: 2FA pendente */}
              <li className="flex items-center gap-2.5 text-amber-700 dark:text-amber-400 font-medium">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                </span>
                <span>Autenticação em duas etapas pendente</span>
              </li>

              {/* Item 3: Admin protegida */}
              <li className="flex items-center gap-2.5 text-ink-muted dark:text-zinc-400">
                <Lock className="h-4 w-4 shrink-0 text-ink-faint dark:text-zinc-500" strokeWidth={1.75} />
                <span>Administração protegida até a conclusão</span>
              </li>
            </ul>
          </div>

          {/* CTA Principal */}
          <Link
            href="/app/account/security?from=admin&setup=mfa#mfa-section"
            className="btn-primary h-11 w-full text-xs sm:text-sm font-semibold bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500 shadow-md shadow-violet-500/25 flex items-center justify-center gap-2 transition-all duration-150 group"
          >
            <span>Configurar autenticação em duas etapas</span>
            <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" strokeWidth={2} />
          </Link>

          {/* Texto discreto */}
          <div className="mt-2.5 flex items-center gap-1.5 text-[11.5px] text-ink-faint dark:text-zinc-500">
            <Clock className="h-3 w-3" />
            <span>Leva menos de 2 minutos.</span>
          </div>

          {/* Link secundário */}
          <div className="mt-4 pt-3 border-t border-black/[0.05] dark:border-white/[0.06] w-full">
            <Link
              href="/app/account"
              className="text-xs font-medium text-ink-muted hover:text-ink dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
            >
              Ir para Minha Conta
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
