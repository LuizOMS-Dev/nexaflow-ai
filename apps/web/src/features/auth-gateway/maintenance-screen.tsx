"use client";

import { Logo } from "@/components/brand/logo";

export function MaintenanceScreen({ message }: { message?: string | null }) {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#07080c] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-[-10%] h-[42rem] w-[42rem] rounded-full bg-indigo-600/20 blur-[140px]" />
        <div className="absolute bottom-[-20%] right-[-10%] h-[36rem] w-[36rem] rounded-full bg-violet-700/15 blur-[130px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(7,8,12,0.2),rgba(7,8,12,0.92))]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-lg flex-col items-center justify-center px-6 text-center">
        <Logo variant="full-white" size="lg" withAi />
        <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.28em] text-indigo-300/80">
          Acesso temporariamente pausado
        </p>
        <h1 className="mt-3 text-[2rem] font-semibold tracking-tight text-white sm:text-[2.35rem]">
          Estamos em manutenção
        </h1>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/55">
          {message ||
            "O acesso à plataforma está sendo atualizado. Seus dados continuam seguros. Volte em alguns minutos."}
        </p>
        <div className="mt-10 h-px w-24 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        <p className="mt-6 text-[12px] text-white/35">NexaFlow · operação da plataforma</p>
      </div>
    </div>
  );
}
