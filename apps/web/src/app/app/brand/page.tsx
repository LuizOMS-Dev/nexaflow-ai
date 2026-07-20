"use client";

import { brand } from "@/lib/brand";
import { Logo, LogoMark } from "@/components/brand/logo";
import { PageHeader } from "@/components/ui";

export default function BrandPage() {
  const primaries = Object.entries(brand.colors.primary).slice(0, 6);

  return (
    <div>
      <PageHeader
        title="Identidade"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-6">
          <p className="section-title mb-4">Fundo claro (NexaFlow preto)</p>
          <div className="flex flex-wrap items-center gap-8 rounded-2xl border border-black/[0.05] bg-white p-10">
            <Logo size="xl" />
            <Logo size="lg" />
            <Logo size="md" />
          </div>
        </section>

        <section className="card p-6">
          <p className="section-title mb-4">Fundo escuro (NexaFlow branco)</p>
          <div className="flex flex-wrap items-center gap-8 rounded-2xl bg-[#07080d] p-10">
            <Logo variant="full-white" size="xl" />
            <Logo variant="full-white" size="lg" />
            <Logo variant="full-white" size="md" />
          </div>
        </section>

        <section className="card p-6">
          <p className="section-title mb-4">Ícone</p>
          <div className="flex flex-wrap items-end gap-6 rounded-2xl bg-[#F8F9FB] p-8 dark:bg-white/[0.03]">
            <LogoMark size={72} />
            <LogoMark size={48} />
            <LogoMark size={36} />
            <LogoMark size={28} />
          </div>
        </section>

        <section className="card p-6">
          <p className="section-title mb-4">Cores</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {primaries.map(([k, v]) => (
              <div key={k} className="overflow-hidden rounded-xl border border-black/[0.05]">
                <div className="h-12" style={{ background: v }} />
                <div className="px-1.5 py-1">
                  <p className="text-2xs font-medium">{k}</p>
                  <p className="font-mono text-[10px] text-ink-faint">{v}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-ink-muted">{brand.tagline}</p>
        </section>
      </div>
    </div>
  );
}
