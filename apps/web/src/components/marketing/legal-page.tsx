import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/logo";

export type LegalSection = {
  title: string;
  paragraphs?: string[];
  items?: string[];
};

export function LegalPage({
  eyebrow,
  title,
  description,
  sections,
}: {
  eyebrow: string;
  title: string;
  description: string;
  sections: LegalSection[];
}) {
  return (
    <main className="min-h-screen bg-[#080914] text-slate-200">
      <header className="border-b border-white/[0.08] bg-[#080914]/95">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" aria-label="Voltar para a página inicial">
            <Logo variant="full-white" size="sm" withAi />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-300">
          {eyebrow}
        </p>
        <h1 className="mt-4 font-display text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
          {title}
        </h1>
        <p className="mt-5 text-base leading-7 text-slate-400">{description}</p>
        <p className="mt-3 text-xs text-slate-500">Última atualização: 19 de julho de 2026.</p>

        <div className="mt-12 space-y-10">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="font-display text-xl font-semibold text-white">{section.title}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-sm leading-7 text-slate-300">
                  {paragraph}
                </p>
              ))}
              {section.items ? (
                <ul className="mt-4 space-y-2 pl-5 text-sm leading-7 text-slate-300">
                  {section.items.map((item) => (
                    <li key={item} className="list-disc marker:text-indigo-400">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>

        <div className="mt-14 rounded-2xl border border-indigo-400/[0.18] bg-indigo-400/[0.07] p-5 text-sm leading-6 text-slate-300">
          Para dúvidas ou solicitações relacionadas a estes documentos, use o canal comercial ou
          de suporte informado na sua proposta ou contrato. Antes da contratação, você pode usar o{" "}
          <Link href="/#demonstracao" className="font-semibold text-indigo-300 hover:text-indigo-200">
            formulário de demonstração
          </Link>
          .
        </div>
      </div>
    </main>
  );
}
