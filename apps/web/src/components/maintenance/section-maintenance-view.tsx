"use client";

import Link from "next/link";
import {
  LayoutDashboard,
  MessagesSquare,
  Users,
  Columns3,
  Wallet,
  ListTodo,
  Megaphone,
  GitBranch,
  Sparkles,
  Library,
  UsersRound,
  Radio,
  ChartColumn,
  Settings,
  Clock,
  ArrowLeft,
  Wrench,
  ShieldCheck,
} from "lucide-react";
import { TenantSection, TENANT_SECTIONS } from "@/lib/maintenance-sections";
import { cn } from "@/lib/utils";

const SECTION_ICONS: Record<TenantSection, typeof LayoutDashboard> = {
  HOME: LayoutDashboard,
  CONVERSATIONS: MessagesSquare,
  CONTACTS: Users,
  PIPELINE: Columns3,
  FINANCE: Wallet,
  TASKS: ListTodo,
  CAMPAIGNS: Megaphone,
  FLOWS: GitBranch,
  AGENTS: Sparkles,
  KNOWLEDGE: Library,
  TEAM: UsersRound,
  CHANNELS: Radio,
  REPORTS: ChartColumn,
  SETTINGS: Settings,
};

export function SectionMaintenanceView({
  section,
  title,
  message,
  estimatedEnd,
  className,
}: {
  section: TenantSection;
  title?: string;
  message?: string;
  estimatedEnd?: string | null;
  className?: string;
}) {
  const meta = TENANT_SECTIONS[section];
  const Icon = SECTION_ICONS[section] || Wrench;

  const displayTitle = title || meta?.defaultTitle || "Módulo temporariamente indisponível";
  const displayMessage =
    message ||
    meta?.defaultMessage ||
    "Estamos realizando melhorias nesta área do NexaFlow. As demais funcionalidades continuam disponíveis normalmente.";

  return (
    <div
      className={cn(
        "flex min-h-[60vh] w-full flex-col items-center justify-center p-4 sm:p-6 md:p-8 animate-in fade-in duration-300",
        className
      )}
    >
      <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-black/[0.08] bg-white/80 p-6 shadow-xl backdrop-blur-xl transition-all sm:p-8 dark:border-white/[0.08] dark:bg-zinc-950/80 dark:shadow-2xl">
        {/* Glow de fundo */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-amber-500/10 blur-3xl dark:bg-amber-500/15" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-52 w-52 rounded-full bg-brand-500/10 blur-3xl dark:bg-brand-500/15" />

        <div className="relative flex flex-col items-center text-center">
          {/* Ícone da Seção com Badge de Manutenção */}
          <div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-600 shadow-inner dark:border-amber-400/20 dark:bg-amber-500/15 dark:text-amber-400">
            <Icon className="h-9 w-9 animate-pulse" />
            <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white shadow-md">
              <Wrench className="h-3.5 w-3.5" />
            </span>
          </div>

          {/* Tag de identificação */}
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
            {meta?.label || section} em manutenção
          </div>

          {/* Título & Mensagem */}
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl dark:text-white">
            {displayTitle}
          </h2>

          <p className="mt-3 text-sm leading-relaxed text-zinc-600 sm:text-base dark:text-zinc-400">
            {displayMessage}
          </p>

          {/* Previsão de Retorno */}
          {estimatedEnd ? (
            <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs font-medium text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
              <Clock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>Previsão de retorno: <strong className="font-semibold">{estimatedEnd}</strong></span>
            </div>
          ) : null}

          {/* Garantia de Segurança */}
          <div className="mt-6 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-500">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <span>Seus dados e processos em segundo plano estão seguros e operando normalmente.</span>
          </div>

          {/* Botão de Ação */}
          <div className="mt-7 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:items-center">
            <Link
              href="/app"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-zinc-800 active:scale-[0.98] dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao Início
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
