import Link from "next/link";
import { ArrowLeft, LogIn } from "lucide-react";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080914] px-5 text-center text-white">
      <div className="max-w-lg">
        <div className="flex justify-center">
          <Logo variant="full-white" size="sm" withAi />
        </div>
        <p className="mt-10 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">
          Erro 404
        </p>
        <h1 className="mt-4 font-display text-4xl font-semibold tracking-[-0.04em]">
          Esta página não foi encontrada.
        </h1>
        <p className="mt-4 text-sm leading-7 text-slate-400">
          O endereço pode ter mudado ou não estar disponível para a sua conta.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Página inicial
          </Link>
          <Link
            href="/login"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/[0.12] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.06]"
          >
            <LogIn className="h-4 w-4" />
            Acessar plataforma
          </Link>
        </div>
      </div>
    </main>
  );
}
