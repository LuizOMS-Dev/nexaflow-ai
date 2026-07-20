"use client";

import { useRouter } from "next/navigation";
import { Activity, Shield } from "lucide-react";
import { EmptyState, Spinner } from "@/components/ui";
import { SuperadminMfaGate } from "@/components/superadmin-mfa-gate";
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
 * Shell do conteúdo admin — gate MFA + workspace compacto.
 * Título da página fica em cada rota (AdminPageHeader), não aqui.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const hydrated = useAuth((s) => s.hydrated);
  const [impersonating, setImpersonating] = useState(false);

  useEffect(() => {
    setImpersonating(isClientImpersonating());
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (user?.platformRole !== "SUPERADMIN" || impersonating) {
      if (impersonating) router.replace("/app");
    }
  }, [hydrated, user, impersonating, router]);

  const mfaStatus = useQuery({
    queryKey: ["mfa-status"],
    queryFn: () =>
      api<{
        enabled: boolean;
        backupCodesRemaining: number;
        requiredForAdmin?: boolean;
        policyRequired?: boolean;
      }>("/auth/mfa/status"),
    enabled: hydrated && user?.platformRole === "SUPERADMIN" && !impersonating,
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
      <EmptyState
        icon={<Shield className="h-5 w-5" strokeWidth={1.5} />}
        title="Acesso restrito"
        description="Somente superadministradores têm acesso a esta área."
      />
    );
  }

  if (impersonating) {
    return (
      <EmptyState
        icon={<Activity className="h-5 w-5" strokeWidth={1.5} />}
        title="Impersonação ativa"
        description="Encerre o acesso à empresa para voltar à Administração."
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

  /** Bloqueia só se a API ainda exige MFA e a conta não tem 2FA */
  const mfaBlocked =
    mfaStatus.isError ||
    Boolean(mfaStatus.data?.requiredForAdmin) ||
    (mfaStatus.data?.policyRequired !== false &&
      mfaStatus.data?.requiredForAdmin === undefined &&
      mfaStatus.data?.enabled === false);
  if (mfaBlocked) {
    return <SuperadminMfaGate />;
  }

  return (
    <div className="admin-platform mx-auto w-full min-w-0 max-w-[1360px] pb-12">
      <div className="min-w-0">{children}</div>
    </div>
  );
}
