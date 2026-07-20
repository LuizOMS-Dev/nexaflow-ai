"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";

/**
 * Gate global: SUPERADMIN sem autenticação em duas etapas.
 * Bloqueio de segurança da conta — não é erro de carregamento.
 */
export function SuperadminMfaGate() {
  return (
    <div className="mx-auto flex min-h-[min(50vh,28rem)] max-w-md flex-col items-center justify-center px-3 py-10 text-center sm:px-4 sm:py-16">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/[0.12] text-violet-700 ring-1 ring-violet-500/[0.15] dark:text-violet-300 sm:mb-5 sm:h-14 sm:w-14">
        <ShieldCheck className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.75} />
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-600/90 dark:text-violet-300/90">
        NexaFlow Platform
      </p>
      <h1 className="mt-2 font-display text-lg font-semibold tracking-tight text-ink dark:text-white sm:text-xl md:text-2xl">
        Ative a verificação em duas etapas
      </h1>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-muted sm:text-[14px]">
        Obrigatória para acessar a Administração.
      </p>
      <Link
        href="/app/account/security?from=admin&setup=mfa#mfa-section"
        className="btn-primary mt-6 h-10 w-full max-w-xs px-5 sm:mt-7 sm:w-auto"
      >
        Configurar autenticação em duas etapas
      </Link>
    </div>
  );
}
