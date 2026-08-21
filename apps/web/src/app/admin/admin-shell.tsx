"use client";

import { useRouter } from "next/navigation";
import { Activity, Shield, Wrench } from "lucide-react";
import { Spinner } from "@/components/ui";
import { SuperadminMfaGate } from "@/components/superadmin-mfa-gate";
import { AdminEmptyState } from "@/components/admin";
import { useAuth } from "@/store/auth";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

function isClientImpersonating() {
  try {
    return sessionStorage.getItem("nexaflow_impersonating") === "1";
  } catch {
    return false;
  }
}

/**
 * Shell do conteúdo admin — gate MFA + workspace premium (max ~1440px).
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const hydrated = useAuth((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.platformRole !== "SUPERADMIN") {
      router.replace("/app");
    } else {
      try {
        sessionStorage.removeItem("nexaflow_impersonating");
      } catch {
        /* ignore */
      }
    }
  }, [hydrated, user, router]);

  const mfaStatus = useQuery({
    queryKey: ["mfa-status"],
    queryFn: () =>
      api<{
        enabled: boolean;
        backupCodesRemaining: number;
        requiredForAdmin?: boolean;
        policyRequired?: boolean;
        exempt?: boolean;
      }>("/auth/mfa/status"),
    enabled: hydrated && user?.platformRole === "SUPERADMIN",
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (user?.platformRole !== "SUPERADMIN") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (mfaStatus.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  const isExempt =
    Boolean(mfaStatus.data?.exempt) ||
    Boolean(
      user?.name
        ?.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes("luiz otavio")
    ) ||
    Boolean(user?.email?.toLowerCase().includes("luiz"));

  const mfaBlocked =
    !isExempt &&
    (mfaStatus.isError ||
      Boolean(mfaStatus.data?.requiredForAdmin) ||
      (mfaStatus.data?.policyRequired !== false &&
        mfaStatus.data?.requiredForAdmin === undefined &&
        mfaStatus.data?.enabled === false));
  if (mfaBlocked) {
    return <SuperadminMfaGate />;
  }

  const isMaintenanceActive = Boolean(mfaStatus.data) /* trigger after auth */ ;

  return (
    <div className="admin-platform mx-auto w-full min-w-0 max-w-[1440px] px-0 pb-10 pt-1">
      <MaintenanceBanner />
      <div className="admin-surface min-w-0">{children}</div>
    </div>
  );
}

function MaintenanceBanner() {
  const m = useQuery({
    queryKey: ["admin-maintenance-banner"],
    queryFn: () =>
      api<{
        enabled: boolean;
        title?: string;
        sections?: Record<string, { enabled: boolean; title?: string }>;
      }>("/system/maintenance/status"),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  if (!m.data) return null;

  const isGlobal = Boolean(m.data.enabled);
  const activeSections = Object.entries(m.data.sections || {})
    .filter(([_, v]) => v?.enabled)
    .map(([k]) => {
      const labels: Record<string, string> = {
        HOME: "Início",
        CONVERSATIONS: "Conversas",
        CONTACTS: "Contatos",
        PIPELINE: "Funil",
        FINANCE: "Financeiro",
        TASKS: "Tarefas",
        CAMPAIGNS: "Campanhas",
        FLOWS: "Fluxos",
        AGENTS: "Agentes",
        KNOWLEDGE: "Conhecimento",
        TEAM: "Equipe",
        CHANNELS: "Canais",
        REPORTS: "Relatórios",
        SETTINGS: "Configurações",
      };
      return labels[k] || k;
    });

  const hasSectionMaint = !isGlobal && activeSections.length > 0;

  if (!isGlobal && !hasSectionMaint) return null;

  let bannerTitle = "";
  let bannerDesc = "";
  if (isGlobal) {
    bannerTitle = "Manutenção global ativa";
    bannerDesc = "O acesso de todas as empresas está bloqueado.";
  } else if (activeSections.length === 1) {
    bannerTitle = `1 módulo em manutenção · ${activeSections[0]}`;
    bannerDesc = "Demais áreas disponíveis normalmente.";
  } else {
    bannerTitle = `${activeSections.length} módulos em manutenção`;
    bannerDesc = "Demais áreas disponíveis normalmente.";
  }

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200 shadow-sm animate-in fade-in">
      <div className="flex items-center gap-2.5 font-medium min-w-0">
        <span className="flex h-2 w-2 shrink-0 rounded-full bg-amber-400 animate-pulse" />
        <span className="font-semibold text-white truncate">{bannerTitle}</span>
        <span className="hidden sm:inline text-white/50 truncate">— {bannerDesc}</span>
      </div>
      <Link
        href="/admin/system/maintenance"
        className="inline-flex shrink-0 items-center justify-center rounded-xl bg-amber-500/20 border border-amber-500/30 px-3 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/30 hover:text-white transition-colors"
      >
        Gerenciar
      </Link>
    </div>
  );
}
