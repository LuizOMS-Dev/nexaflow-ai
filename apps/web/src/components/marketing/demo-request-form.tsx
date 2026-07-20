"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";

type FormState = "idle" | "submitting" | "success" | "error";

const inputClass =
  "mt-2 h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-400/[0.55] focus:bg-white/[0.06] focus:ring-4 focus:ring-indigo-500/[0.1]";

export function DemoRequestForm() {
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    setState("submitting");
    setError("");

    try {
      const response = await fetch("/nexa-api/public/demo-requests", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(data.message || "Não foi possível enviar o pedido.");
      form.reset();
      setState("success");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível enviar o pedido.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="flex min-h-[430px] flex-col items-center justify-center rounded-[1.5rem] border border-emerald-400/[0.2] bg-emerald-400/[0.07] p-8 text-center" role="status">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/[0.12] text-emerald-400">
          <CheckCircle2 className="h-7 w-7" />
        </span>
        <h3 className="mt-5 text-xl font-semibold text-white">Pedido recebido</h3>
        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-300">
          Seus dados foram registrados com segurança. A equipe comercial poderá acompanhar o pedido pelo painel NexaFlow.
        </p>
        <button type="button" className="mt-6 text-sm font-semibold text-emerald-300 hover:text-emerald-200" onClick={() => setState("idle")}>
          Enviar outro pedido
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-[1.5rem] border border-white/[0.09] bg-[#11131f] p-6 shadow-[0_30px_90px_-45px_rgba(0,0,0,0.9)] sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-300">
          Seu nome
          <input className={inputClass} name="name" autoComplete="name" placeholder="Nome e sobrenome" minLength={2} maxLength={80} required />
        </label>
        <label className="text-xs font-medium text-slate-300">
          E-mail profissional
          <input className={inputClass} name="email" type="email" autoComplete="email" placeholder="voce@empresa.com" maxLength={160} required />
        </label>
        <label className="text-xs font-medium text-slate-300">
          Empresa
          <input className={inputClass} name="companyName" autoComplete="organization" placeholder="Nome da empresa" minLength={2} maxLength={120} required />
        </label>
        <label className="text-xs font-medium text-slate-300">
          WhatsApp ou telefone
          <input className={inputClass} name="phone" type="tel" autoComplete="tel" placeholder="(11) 99999-9999" maxLength={30} />
        </label>
        <label className="text-xs font-medium text-slate-300 sm:col-span-2">
          Tamanho da equipe
          <select className={`${inputClass} appearance-none`} name="teamSize" defaultValue="">
            <option value="" className="bg-slate-950">Selecione (opcional)</option>
            <option value="1-2" className="bg-slate-950">1 a 2 pessoas</option>
            <option value="3-5" className="bg-slate-950">3 a 5 pessoas</option>
            <option value="6-15" className="bg-slate-950">6 a 15 pessoas</option>
            <option value="16-50" className="bg-slate-950">16 a 50 pessoas</option>
            <option value="51+" className="bg-slate-950">Mais de 50 pessoas</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-300 sm:col-span-2">
          O que você quer melhorar?
          <textarea className="mt-2 min-h-28 w-full resize-y rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-400/[0.55] focus:bg-white/[0.06] focus:ring-4 focus:ring-indigo-500/[0.1]" name="message" placeholder="Conte brevemente como funciona seu atendimento hoje." maxLength={1000} />
        </label>
      </div>
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {error ? (
        <p className="mt-4 rounded-xl border border-red-400/[0.18] bg-red-400/[0.08] px-3.5 py-3 text-sm text-red-200" role="alert">{error}</p>
      ) : null}
      <button type="submit" disabled={state === "submitting"} className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-sm font-semibold text-white shadow-[0_16px_40px_-18px_rgba(99,102,241,0.9)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">
        {state === "submitting" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        {state === "submitting" ? "Enviando pedido..." : "Solicitar demonstração"}
      </button>
      <p className="mt-4 text-center text-[11px] leading-5 text-slate-500">
        Usaremos estes dados para responder ao seu pedido comercial, conforme o{" "}
        <Link href="/privacidade" className="text-slate-400 underline decoration-slate-600 underline-offset-2 hover:text-slate-300">
          aviso de privacidade
        </Link>
        .
      </p>
    </form>
  );
}
