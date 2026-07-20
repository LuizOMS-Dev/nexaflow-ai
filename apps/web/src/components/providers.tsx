"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/store/auth";
import { useRealtime } from "@/hooks/use-realtime";
import { ToastProvider } from "@/components/ui";
import { PlatformReleaseToastListener } from "@/components/platform-release-toast";

function RealtimeBridge() {
  useRealtime();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Evita tempestade de refetch (site “travando”)
            staleTime: 60_000,
            gcTime: 10 * 60_000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  );
  const hydrate = useAuth((s) => s.hydrate);

  useEffect(() => {
    const theme = localStorage.getItem("nexaflow_theme") || "light";
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, []);

  useEffect(() => {
    // A landing é totalmente pública: não provoque 401 tentando restaurar
    // uma sessão que o visitante ainda não possui. Ao navegar para login/app,
    // o mesmo provider permanece montado e hidrata a autenticação normalmente.
    if (pathname === "/") return;
    void hydrate();
  }, [hydrate, pathname]);

  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RealtimeBridge />
        <PlatformReleaseToastListener />
        {children}
      </ToastProvider>
    </QueryClientProvider>
  );
}
