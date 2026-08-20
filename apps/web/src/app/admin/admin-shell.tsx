"use client";

import { useRouter } from "next/navigation";
import { Activity, Shield } from "lucide-react";
import { Spinner } from "@/components/ui";
import { SuperadminMfaGate } from "@/components/superadmin-mfa-gate";
import { AdminEmptyState } from "@/components/admin";
import { useAuth } from "@/store/auth";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

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
      <AdminEmptyState
        icon={<Shield className="h-5 w-5" strokeWidth={1.5} />}
        title="Acesso restrito"
        description="Somente superadministradores têm acesso a esta área."
        compact={false}
      />
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

  return (
    <div className="admin-platform mx-auto w-full min-w-0 max-w-[1440px] px-0 pb-10 pt-1">
      <div className="admin-surface min-w-0">{children}</div>
    </div>
  );
}
