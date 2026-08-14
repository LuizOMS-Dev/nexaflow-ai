"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, LoaderCircle } from "lucide-react";

type PublicPlan = {
  slug: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceAnnual: number | null;
  priceOnRequest: boolean;
  badge: string | null;
  limits: {
    users: number;
    channels: number;
    contacts: number;
    aiMessages: number;
  };
  highlights: string[];
};

export function PublicPricing() {
  const plansQuery = useQuery({
    queryKey: ["public-plans"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/nexa-api/public/plans", {
        signal,
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("plans_unavailable");
      return (await response.json()) as { items?: PublicPlan[] };
    },
    staleTime: 60_000,
    retry: false,
  });
  const plans = (plansQuery.data?.items || []).filter((plan) => plan.slug !== "free");

  if (plansQuery.isLoading) {
    return (
      <div className="mt-12 flex min-h-64 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.025] text-sm text-slate-400" aria-live="polite">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin text-indigo-400" />
        Carregando catálogo oficial...
      </div>
    );
  }

  if (plansQuery.isError || plans.length === 0) {
    return (
      <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-indigo-300/[0.15] bg-indigo-400/[0.07] p-7 text-center">
        <h3 className="text-lg font-semibold text-white">Planos sob medida para sua operação</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          O catálogo está temporariamente indisponível. Envie o pedido de demonstração para receber a orientação comercial correta.
        </p>
        <a href="#demonstracao" className="mt-5 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950">
          Pedir demonstração
        </a>
      </div>
    );
  }

  return (
    <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan) => {
        const featured = plan.badge === "popular" || plan.slug === "pro";
        const price = plan.priceOnRequest
          ? "Sob consulta"
          : plan.priceMonthly.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
        return (
          <article key={plan.slug} className={`relative flex flex-col rounded-2xl border p-6 ${featured ? "border-indigo-400/[0.42] bg-indigo-400/[0.09] shadow-[0_24px_70px_-32px_rgba(99,102,241,0.75)]" : "border-white/[0.08] bg-[#0d0f1b]"}`}>
            {featured ? (
              <span className="absolute -top-3 left-5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
                Mais escolhido
              </span>
            ) : null}
            <h3 className="text-base font-semibold text-white">{plan.name}</h3>
            <p className="mt-2 min-h-12 text-xs leading-5 text-slate-400">{plan.description}</p>
            <div className="mt-6">
              <span className="font-display text-2xl font-semibold tracking-tight text-white">{price}</span>
              {!plan.priceOnRequest ? <span className="ml-1 text-xs text-slate-500">/mês</span> : null}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Até {plan.limits.users.toLocaleString("pt-BR")} usuários · {plan.limits.contacts.toLocaleString("pt-BR")} contatos
            </p>
            <ul className="mt-6 flex-1 space-y-2.5 text-xs text-slate-300">
              {plan.highlights.map((highlight) => (
                <li key={highlight} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  {highlight}
                </li>
              ))}
            </ul>
            <a href="#demonstracao" className={`mt-7 inline-flex h-10 items-center justify-center rounded-xl text-sm font-semibold transition ${featured ? "bg-white text-slate-950 hover:bg-indigo-50" : "border border-white/[0.1] bg-white/[0.04] text-white hover:bg-white/[0.08]"}`}>
              Quero conhecer
            </a>
          </article>
        );
      })}
    </div>
  );
}
