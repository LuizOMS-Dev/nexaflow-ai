"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";

/** Cadastro público desativado — contas são criadas após a compra. */
export default function RegisterPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login");
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface-muted px-4 text-center">
      <Spinner />
      <p className="text-sm text-ink-muted">Cadastro público indisponível. Redirecionando…</p>
    </div>
  );
}
