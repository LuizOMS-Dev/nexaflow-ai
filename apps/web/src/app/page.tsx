import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  CircleCheckBig,
  Gauge,
  GitBranch,
  KanbanSquare,
  Library,
  LockKeyhole,
  MessageCircleMore,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Workflow,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { PublicPricing } from "@/components/marketing/public-pricing";
import { DemoRequestForm } from "@/components/marketing/demo-request-form";

export const metadata: Metadata = {
  title: "Atendimento, CRM e agentes de IA para WhatsApp",
  description:
    "Centralize conversas, contatos, vendas e agentes de IA em uma plataforma criada para pequenas e médias empresas brasileiras.",
};

const features = [
  {
    icon: MessageCircleMore,
    title: "Conversas em um só lugar",
    description:
      "Organize a fila do WhatsApp, distribua atendimentos e mantenha todo o histórico acessível à equipe.",
  },
  {
    icon: Bot,
    title: "IA com controle humano",
    description:
      "Use agentes em modo copiloto, aprovação ou automático, com limites claros e base de conhecimento da empresa.",
  },
  {
    icon: KanbanSquare,
    title: "CRM que acompanha a conversa",
    description:
      "Transforme contatos em oportunidades, mova negociações pelo funil e saiba qual é o próximo passo.",
  },
  {
    icon: Workflow,
    title: "Automações práticas",
    description:
      "Padronize tarefas repetitivas e respostas sem perder contexto nem criar uma operação difícil de manter.",
  },
  {
    icon: Library,
    title: "Conhecimento confiável",
    description:
      "Publique políticas, produtos e processos para que a IA responda com informações aprovadas, sem adivinhar.",
  },
  {
    icon: ShieldCheck,
    title: "Governança desde o início",
    description:
      "Tenants isolados, papéis de acesso, MFA, auditoria e controles para operar com mais segurança.",
  },
];

const steps = [
  {
    number: "01",
    title: "Configure sua empresa",
    description: "Defina equipe, permissões e as informações que guiam o atendimento.",
  },
  {
    number: "02",
    title: "Conecte o WhatsApp",
    description: "Centralize as conversas e comece com o modo de operação mais seguro para sua rotina.",
  },
  {
    number: "03",
    title: "Atenda e venda melhor",
    description: "Acompanhe conversas, oportunidades, tarefas e resultados no mesmo fluxo.",
  },
];

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">
      {children}
    </p>
  );
}

export default function MarketingHomePage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#070812] text-white">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.07] bg-[#070812]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <Link href="/" aria-label="NexaFlow AI — início">
            <Logo variant="full-white" size="md" withAi />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-slate-300 md:flex" aria-label="Navegação principal">
            <a className="transition-colors hover:text-white" href="#produto">Produto</a>
            <a className="transition-colors hover:text-white" href="#como-funciona">Como funciona</a>
            <a className="transition-colors hover:text-white" href="#planos">Planos</a>
            <a className="transition-colors hover:text-white" href="#seguranca">Segurança</a>
          </nav>
          <div className="flex items-center gap-2.5">
            <Link
              href="/login"
              className="hidden rounded-xl px-3.5 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white sm:inline-flex"
            >
              Entrar
            </Link>
            <a
              href="#demonstracao"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-indigo-50"
            >
              Pedir demonstração
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </header>

      <section className="relative isolate pt-28 sm:pt-32 lg:pt-36">
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
          <div className="absolute left-1/2 top-[-22rem] h-[52rem] w-[72rem] -translate-x-1/2 rounded-full bg-indigo-600/[0.16] blur-[120px]" />
          <div className="absolute right-[-12rem] top-40 h-[28rem] w-[28rem] rounded-full bg-violet-600/[0.12] blur-[110px]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)]" />
        </div>

        <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-24 sm:px-8 lg:grid-cols-[1.03fr_0.97fr] lg:px-10 lg:pb-32">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-300/[0.18] bg-indigo-400/[0.08] px-3 py-1.5 text-xs font-medium text-indigo-100">
              <Sparkles className="h-3.5 w-3.5 text-indigo-300" />
              Atendimento, CRM e IA em um só fluxo
            </div>
            <h1 className="font-display text-4xl font-semibold leading-[1.04] tracking-[-0.055em] text-white sm:text-5xl lg:text-[4.25rem]">
              Transforme conversas no WhatsApp em vendas que avançam.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
              A NexaFlow reúne atendimento, contatos, funil comercial e agentes de IA para sua equipe responder com contexto e acompanhar cada oportunidade.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="#demonstracao"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 text-sm font-semibold text-white shadow-[0_18px_45px_-18px_rgba(99,102,241,0.9)] transition hover:-translate-y-0.5 hover:brightness-110"
              >
                Conhecer a NexaFlow
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#produto"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
              >
                Ver recursos
                <ChevronRight className="h-4 w-4" />
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-400">
              {["Implantação guiada", "Acesso por função", "Suporte em português"].map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <CircleCheckBig className="h-4 w-4 text-emerald-400" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[590px] lg:mx-0">
            <div className="absolute -inset-10 -z-10 rounded-full bg-indigo-500/[0.12] blur-3xl" />
            <div className="overflow-hidden rounded-[1.75rem] border border-white/[0.1] bg-[#111321]/95 shadow-[0_40px_100px_-35px_rgba(0,0,0,0.85)]">
              <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-white">Visão integrada da operação</p>
                  <p className="mt-0.5 text-xs text-slate-400">Conversas, IA e vendas conectadas</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/[0.18] bg-emerald-400/[0.08] px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Exemplo visual
                </span>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-[0.84fr_1.16fr] sm:p-5">
                <div className="space-y-3">
                  {[
                    ["Contato 01", "Dúvida sobre o plano", "IA sugeriu resposta"],
                    ["Contato 02", "Quer falar com vendas", "Na fila comercial"],
                    ["Contato 03", "Retorno agendado", "Oportunidade criada"],
                  ].map(([name, subject, status], index) => (
                    <div key={name} className={`rounded-xl border p-3.5 ${index === 0 ? "border-indigo-400/[0.3] bg-indigo-400/[0.09]" : "border-white/[0.07] bg-white/[0.025]"}`}>
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400/[0.28] to-violet-500/[0.18] text-xs font-semibold text-indigo-100">
                          {name.split(" ").map((part) => part[0]).slice(0, 2).join("")}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-white">{name}</p>
                          <p className="mt-1 truncate text-[11px] text-slate-400">{subject}</p>
                          <p className="mt-2 text-[10px] font-medium text-indigo-300">{status}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex min-h-[344px] flex-col rounded-xl border border-white/[0.07] bg-[#0b0d17] p-4">
                  <div className="flex items-center gap-3 border-b border-white/[0.06] pb-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500/[0.18] text-indigo-200">
                      <MessageCircleMore className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-white">Contato de demonstração</p>
                      <p className="text-[11px] text-slate-500">WhatsApp · atendimento comercial</p>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col justify-center gap-3 py-5 text-xs leading-relaxed">
                    <p className="max-w-[86%] rounded-2xl rounded-bl-md bg-white/[0.07] px-3.5 py-2.5 text-slate-200">
                      Queria entender qual plano atende melhor minha equipe.
                    </p>
                    <div className="ml-auto max-w-[90%] rounded-2xl rounded-br-md bg-gradient-to-br from-indigo-500 to-violet-600 px-3.5 py-2.5 text-white shadow-lg">
                      <span className="mb-1 block text-[10px] font-semibold text-indigo-100">Lia · Agente comercial</span>
                      Posso ajudar. Vou considerar o tamanho da equipe e o volume de atendimento antes de recomendar.
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.035] px-3.5 py-3 text-[11px] text-slate-500">
                    <span>Responder com contexto...</span>
                    <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="produto" className="border-y border-white/[0.06] bg-white/[0.02] py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="max-w-2xl">
            <SectionEyebrow>Uma operação conectada</SectionEyebrow>
            <h2 className="font-display text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
              Menos ferramentas soltas. Mais contexto para atender e vender.
            </h2>
            <p className="mt-5 text-base leading-7 text-slate-400">
              Cada módulo compartilha a mesma visão do cliente, para a equipe não depender de planilhas e conversas espalhadas.
            </p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <article key={feature.title} className="group rounded-2xl border border-white/[0.08] bg-[#0d0f1b] p-6 transition hover:-translate-y-1 hover:border-indigo-400/[0.26] hover:bg-[#111422]">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-indigo-300/[0.14] bg-indigo-400/[0.08] text-indigo-300">
                  <feature.icon className="h-5 w-5" strokeWidth={1.8} />
                </span>
                <h3 className="mt-5 text-base font-semibold text-white">{feature.title}</h3>
                <p className="mt-2.5 text-sm leading-6 text-slate-400">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="como-funciona" className="py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="grid gap-14 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
            <div className="lg:sticky lg:top-28">
              <SectionEyebrow>Comece com clareza</SectionEyebrow>
              <h2 className="font-display text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
                Da configuração ao primeiro atendimento em três etapas.
              </h2>
              <p className="mt-5 text-base leading-7 text-slate-400">
                A plataforma orienta o início da operação e permite evoluir a automação no ritmo da sua equipe.
              </p>
              <a href="#demonstracao" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-indigo-300 transition hover:text-indigo-200">
                Planejar minha implantação
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            <div className="space-y-4">
              {steps.map((step) => (
                <article key={step.number} className="grid gap-5 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 sm:grid-cols-[4.5rem_1fr] sm:p-7">
                  <span className="font-display text-3xl font-semibold text-indigo-400">{step.number}</span>
                  <div>
                    <h3 className="text-lg font-semibold text-white">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{step.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="seguranca" className="border-y border-white/[0.06] bg-[#0a0c16] py-24 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-14 px-5 sm:px-8 lg:grid-cols-2 lg:items-center lg:px-10">
          <div>
            <SectionEyebrow>Segurança e governança</SectionEyebrow>
            <h2 className="font-display text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
              Controle de acesso para uma operação que cresce.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-400">
              A NexaFlow separa empresas, usuários e permissões desde a arquitetura, com recursos para acompanhar ações sensíveis.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                [LockKeyhole, "Isolamento multiempresa", "Dados vinculados ao tenant da sessão."],
                [UsersRound, "Papéis e permissões", "Acesso conforme a função de cada pessoa."],
                [ShieldCheck, "MFA e sessões", "Proteção adicional para contas administrativas."],
                [Gauge, "Auditoria operacional", "Eventos importantes registrados para consulta."],
              ].map(([Icon, title, description]) => {
                const ItemIcon = Icon as typeof LockKeyhole;
                return (
                  <div key={String(title)} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
                    <ItemIcon className="h-5 w-5 text-emerald-400" />
                    <h3 className="mt-3 text-sm font-semibold text-white">{String(title)}</h3>
                    <p className="mt-1.5 text-xs leading-5 text-slate-500">{String(description)}</p>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-[1.75rem] border border-white/[0.09] bg-gradient-to-br from-indigo-500/[0.12] via-white/[0.025] to-violet-500/[0.1] p-7 sm:p-9">
            <GitBranch className="h-7 w-7 text-indigo-300" />
            <h3 className="mt-6 font-display text-2xl font-semibold tracking-tight text-white">IA que responde dentro das regras do negócio.</h3>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              Conhecimento publicado, políticas de veracidade e modos de aprovação ajudam a manter as respostas alinhadas ao que sua empresa realmente oferece.
            </p>
            <ul className="mt-7 space-y-3 text-sm text-slate-300">
              {["Base de conhecimento por empresa", "Modos copiloto, aprovação e automático", "Handoff para atendimento humano", "Proteções contra instruções maliciosas"].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="planos" className="py-24 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-2xl text-center">
            <SectionEyebrow>Planos oficiais</SectionEyebrow>
            <h2 className="font-display text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">Escolha a estrutura certa para sua operação.</h2>
            <p className="mt-5 text-base leading-7 text-slate-400">
              Os valores e limites abaixo vêm diretamente do catálogo configurado na plataforma.
            </p>
          </div>
          <PublicPricing />
        </div>
      </section>

      <section id="demonstracao" className="relative border-t border-white/[0.06] bg-[#0a0b15] py-24 sm:py-28">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute bottom-[-18rem] left-[-10rem] h-[36rem] w-[36rem] rounded-full bg-indigo-600/[0.12] blur-[110px]" />
        </div>
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start lg:px-10">
          <div className="max-w-xl">
            <SectionEyebrow>Demonstração personalizada</SectionEyebrow>
            <h2 className="font-display text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">Veja a NexaFlow aplicada à sua rotina.</h2>
            <p className="mt-5 text-base leading-7 text-slate-400">
              Conte um pouco sobre sua operação. O pedido fica registrado no painel comercial da plataforma para a equipe dar continuidade.
            </p>
            <div className="mt-8 space-y-4">
              {["Entendimento do seu fluxo atual", "Demonstração dos módulos relevantes", "Orientação sobre plano e implantação"].map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm text-slate-300">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400/[0.1] text-emerald-400">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </div>
          <DemoRequestForm />
        </div>
      </section>

      <footer className="border-t border-white/[0.07] bg-[#070812]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-9 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
          <Logo variant="full-white" size="sm" withAi />
          <p className="text-xs text-slate-500">Atendimento, CRM e IA para empresas brasileiras.</p>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <Link className="transition hover:text-white" href="/login">Acessar plataforma</Link>
            <a className="transition hover:text-white" href="#demonstracao">Falar com vendas</a>
            <Link className="transition hover:text-white" href="/privacidade">Privacidade</Link>
            <Link className="transition hover:text-white" href="/termos">Termos</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
