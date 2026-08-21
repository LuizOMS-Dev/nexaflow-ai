"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wrench, ShieldCheck, Clock, Lock, ArrowRight, RefreshCw } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export type MaintenanceScreenProps = {
  title?: string;
  message?: string;
  estimatedEnd?: string | null;
  onSuperadminLogin?: () => void;
  onClearMaintenance?: () => void;
  showAdminLink?: boolean;
};

export function MaintenanceScreen({
  title = "Estamos em manutenção",
  message = "Estamos realizando melhorias no NexaFlow para oferecer uma experiência ainda melhor. Voltaremos em breve.",
  estimatedEnd,
  onSuperadminLogin,
  onClearMaintenance,
  showAdminLink = true,
}: MaintenanceScreenProps) {
  const [checking, setChecking] = useState(false);
  const [liveEstimatedEnd, setLiveEstimatedEnd] = useState<string | null | undefined>(estimatedEnd);
  const [liveTitle, setLiveTitle] = useState(title);
  const [liveMessage, setLiveMessage] = useState(message);

  // Auto-polling para verificar quando a manutenção acabar
  useEffect(() => {
    let unmounted = false;

    const checkStatus = async () => {
      try {
        const res = await api<{
          enabled: boolean;
          title: string;
          message: string;
          estimatedEnd?: string | null;
        }>("/system/maintenance/status");

        if (unmounted) return;

        if (!res.enabled) {
          if (onClearMaintenance) {
            onClearMaintenance();
          } else {
            window.location.reload();
          }
        } else {
          if (res.title) setLiveTitle(res.title);
          if (res.message) setLiveMessage(res.message);
          setLiveEstimatedEnd(res.estimatedEnd);
        }
      } catch {
        /* ignore network error during polling */
      }
    };

    const interval = setInterval(checkStatus, 15_000);
    return () => {
      unmounted = true;
      clearInterval(interval);
    };
  }, [onClearMaintenance]);

  const handleManualCheck = async () => {
    setChecking(true);
    try {
      const res = await api<{
        enabled: boolean;
        title: string;
        message: string;
        estimatedEnd?: string | null;
      }>("/system/maintenance/status");

      if (!res.enabled) {
        if (onClearMaintenance) {
          onClearMaintenance();
        } else {
          window.location.reload();
        }
      } else {
        if (res.title) setLiveTitle(res.title);
        if (res.message) setLiveMessage(res.message);
        setLiveEstimatedEnd(res.estimatedEnd);
      }
    } finally {
      setTimeout(() => setChecking(false), 500);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-[#F8F9FA] px-4 py-8 text-zinc-900 transition-colors dark:bg-[#0B0C10] dark:text-zinc-100 sm:px-6 lg:px-8">
      {/* Header com Logo */}
      <header className="flex w-full max-w-4xl items-center justify-between">
        <Logo size="md" />
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            Manutenção Programada
          </span>
        </div>
      </header>

      {/* Conteúdo Central */}
      <main className="my-auto flex w-full max-w-lg flex-col items-center text-center">
        {/* Ícone com animação sutil */}
        <div className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-sky-500/20 bg-sky-500/10 shadow-lg shadow-sky-500/5 dark:border-sky-400/20 dark:bg-sky-400/10">
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-tr from-sky-500/20 to-indigo-500/20 blur-sm" />
          <Wrench className="relative h-9 w-9 text-sky-600 dark:text-sky-400 animate-bounce duration-1000" />
        </div>

        {/* Título Principal */}
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          {liveTitle}
        </h1>

        {/* Mensagem Explicativa */}
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 sm:text-base">
          {liveMessage}
        </p>

        {/* Previsão de Retorno (se informada) */}
        {liveEstimatedEnd ? (
          <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-4 py-2 text-xs font-semibold text-zinc-800 shadow-sm dark:border-white/[0.08] dark:bg-zinc-900 dark:text-zinc-200">
            <Clock className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            <span>Previsão de retorno: {liveEstimatedEnd}</span>
          </div>
        ) : null}

        {/* Card de Garantia de Segurança */}
        <div className="mt-8 flex w-full items-start gap-3 rounded-2xl border border-black/[0.06] bg-black/[0.02] p-4 text-left dark:border-white/[0.06] dark:bg-white/[0.02]">
          <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          <div className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            <p className="font-medium text-zinc-900 dark:text-zinc-200">Seus dados estão 100% seguros</p>
            <p className="mt-0.5">
              O acesso à plataforma será restabelecido automaticamente assim que a atualização for concluída.
            </p>
          </div>
        </div>

        {/* Botão de checagem manual */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleManualCheck}
            disabled={checking}
            className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-4 py-2 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin text-sky-500")} />
            {checking ? "Verificando…" : "Verificar status agora"}
          </button>
        </div>
      </main>

      {/* Footer com link de Superadmin */}
      <footer className="mt-8 flex w-full max-w-4xl flex-col items-center justify-between gap-3 border-t border-black/[0.06] pt-6 text-xs text-zinc-500 dark:border-white/[0.06] dark:text-zinc-500 sm:flex-row">
        <p>© {new Date().getFullYear()} NexaFlow. Todos os direitos reservados.</p>
        {showAdminLink && (
          <div>
            {onSuperadminLogin ? (
              <button
                type="button"
                onClick={onSuperadminLogin}
                className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-sky-600 dark:text-zinc-400 dark:hover:text-sky-400 transition-colors"
              >
                <Lock className="h-3 w-3" />
                Acesso Superadmin
                <ArrowRight className="h-3 w-3" />
              </button>
            ) : (
              <Link
                href="/login?admin=1"
                className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-sky-600 dark:text-zinc-400 dark:hover:text-sky-400 transition-colors"
              >
                <Lock className="h-3 w-3" />
                Acesso Superadmin
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}
