"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  KeyRound,
  Shield,
  Webhook,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Bloco de código legível em light e dark — sem fundo branco estourado */
function CodeBlock({
  children,
  className,
  copyable,
}: {
  children: string;
  className?: string;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={cn("group relative", className)}>
      <pre
        className={cn(
          "overflow-x-auto rounded-xl border px-3.5 py-3 font-mono text-[12px] leading-relaxed",
          // Light: fundo cinza suave + texto escuro
          "border-black/[0.08] bg-[#0f1219] text-[#e8eaef]",
          // Dark: mesmo bloco escuro, borda sutil (nunca branco)
          "dark:border-white/[0.1] dark:bg-[#0a0c12] dark:text-[#e8eaef]"
        )}
      >
        <code className="text-inherit">{children}</code>
      </pre>
      {copyable ? (
        <button
          type="button"
          onClick={() => void copy()}
          className={cn(
            "absolute right-2 top-2 inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium transition-colors",
            "border-white/10 bg-white/10 text-gray-200 hover:bg-white/[0.15]"
          )}
          aria-label="Copiar"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> Copiado
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copiar
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code
      className={cn(
        "rounded-md border px-1.5 py-0.5 font-mono text-[11.5px]",
        "border-black/[0.08] bg-[#0f1219] text-[#e2e6ee]",
        "dark:border-white/[0.1] dark:bg-[#0a0c12] dark:text-[#e2e6ee]"
      )}
    >
      {children}
    </code>
  );
}

function Section({
  id,
  title,
  icon: Icon,
  children,
}: {
  id: string;
  title: string;
  icon?: typeof BookOpen;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8 space-y-3">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink dark:text-white">
        {Icon ? (
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/[0.12] text-brand-600 dark:text-brand-300">
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
          </span>
        ) : null}
        {title}
      </h2>
      <div className="space-y-3 text-[13.5px] leading-relaxed text-ink-muted dark:text-gray-400">
        {children}
      </div>
    </section>
  );
}

const NAV = [
  { id: "auth", label: "Autenticação" },
  { id: "base", label: "Base URL" },
  { id: "scopes", label: "Escopos" },
  { id: "endpoints", label: "Endpoints" },
  { id: "errors", label: "Erros" },
  { id: "webhooks", label: "Webhooks" },
  { id: "limits", label: "Rate limit" },
];

export default function PublicApiDocsPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-ink dark:bg-[#07080d] dark:text-gray-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:flex-row lg:gap-10 lg:py-12">
        {/* Nav lateral */}
        <aside className="shrink-0 lg:sticky lg:top-8 lg:w-48 lg:self-start">
          <Link
            href="/app/settings/api"
            className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-muted transition-colors hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar para chaves
          </Link>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint dark:text-gray-500">
            Nesta página
          </p>
          <nav className="mt-2 flex flex-row flex-wrap gap-1 lg:flex-col" aria-label="Seções">
            {NAV.map((n) => (
              <a
                key={n.id}
                href={`#${n.id}`}
                className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-ink-muted transition-colors hover:bg-black/[0.04] hover:text-ink dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-white"
              >
                {n.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Conteúdo */}
        <main className="min-w-0 flex-1 space-y-10">
          <header className="space-y-3 border-b border-black/[0.06] pb-8 dark:border-white/[0.08]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-600 dark:text-brand-300">
              Documentação · v1
            </p>
            <h1 className="font-display text-[1.65rem] font-semibold tracking-tight text-ink dark:text-white sm:text-3xl">
              API pública NexaFlow
            </h1>
            <p className="max-w-2xl text-[14px] leading-relaxed text-ink-muted dark:text-gray-400">
              Integre seus sistemas com acesso programático seguro. O tenant é sempre
              resolvido pela chave autenticada — nunca envie{" "}
              <InlineCode>tenantId</InlineCode> para autorizar acesso a dados.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href="/app/settings/api" className="btn-primary h-9 px-4 text-[13px]">
                <KeyRound className="h-3.5 w-3.5" />
                Gerenciar chaves
              </Link>
              <Link href="/app/settings/webhooks" className="btn-secondary h-9 px-3.5 text-[13px]">
                <Webhook className="h-3.5 w-3.5" />
                Webhooks
              </Link>
            </div>
          </header>

          <Section id="auth" title="Autenticação" icon={Shield}>
            <p>
              Envie a chave no header HTTP. O prefixo público é{" "}
              <InlineCode>nxf_live_</InlineCode>. O segredo completo só é mostrado uma vez,
              na criação da chave.
            </p>
            <CodeBlock copyable>{`Authorization: Bearer nxf_live_xxxxxxxxxxxxxxxx`}</CodeBlock>
            <p>
              Crie e revogue chaves em{" "}
              <Link
                href="/app/settings/api"
                className="font-medium text-brand-600 underline-offset-2 hover:underline dark:text-brand-300"
              >
                Configurações → API
              </Link>
              . Disponível conforme o plano (Empresa / Enterprise).
            </p>
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3.5 py-3 text-[12.5px] text-amber-950 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100">
              <strong className="font-semibold">Segurança:</strong> não compartilhe a chave
              em repositórios públicos, front-end ou logs. Prefira variáveis de ambiente no
              servidor.
            </div>
          </Section>

          <Section id="base" title="Base URL" icon={BookOpen}>
            <p>
              Todas as rotas públicas ficam sob <InlineCode>/api/v1</InlineCode>. No
              ambiente embutido da NexaFlow (mesmo domínio do app), o proxy usa o prefixo
              da API:
            </p>
            <CodeBlock copyable>{`# Relativo ao host da API (recomendado no servidor)
https://SEU_HOST_API/api/v1

# Via app (proxy same-origin)
https://SEU_HOST_APP/nexa-api/api/v1`}</CodeBlock>
            <p className="text-[12.5px] text-ink-faint dark:text-gray-500">
              Em desenvolvimento local típico:{" "}
              <InlineCode>http://localhost:4000/api/v1</InlineCode> ou via web{" "}
              <InlineCode>/nexa-api/api/v1</InlineCode>.
            </p>
          </Section>

          <Section id="scopes" title="Escopos">
            <p>
              Cada chave possui escopos. Sem o escopo exigido, a API responde{" "}
              <InlineCode>403</InlineCode> com código{" "}
              <InlineCode>FORBIDDEN_SCOPE</InlineCode>.
            </p>
            <div className="overflow-hidden rounded-xl border border-black/[0.07] dark:border-white/[0.09]">
              <table className="w-full text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-black/[0.06] bg-black/[0.02] dark:border-white/[0.08] dark:bg-white/[0.03]">
                    <th className="px-3 py-2.5 font-semibold text-ink dark:text-gray-200">
                      Escopo
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-ink dark:text-gray-200">
                      Uso
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                  {[
                    ["contacts:read", "Listar e ler contatos"],
                    ["contacts:write", "Criar/editar contatos"],
                    ["conversations:read", "Listar conversas"],
                    ["opportunities:read", "Listar oportunidades"],
                    ["opportunities:write", "Criar/editar oportunidades"],
                    ["tasks:read", "Listar tarefas"],
                    ["tasks:write", "Criar/editar tarefas"],
                  ].map(([scope, use]) => (
                    <tr key={scope}>
                      <td className="px-3 py-2.5">
                        <InlineCode>{scope}</InlineCode>
                      </td>
                      <td className="px-3 py-2.5 text-ink-muted dark:text-gray-400">{use}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="endpoints" title="Endpoints">
            <p>Paginação: query <InlineCode>page</InlineCode> e <InlineCode>limit</InlineCode> (máx. 100).</p>

            <div className="space-y-4">
              <Endpoint
                method="GET"
                path="/api/v1/me"
                desc="Tenant da chave e escopos ativos."
              />
              <Endpoint
                method="GET"
                path="/api/v1/contacts"
                desc="Lista contatos. Query opcional: search, page, limit."
                scope="contacts:read"
              />
              <Endpoint
                method="GET"
                path="/api/v1/contacts/:id"
                desc="Detalhe de um contato do seu tenant."
                scope="contacts:read"
              />
              <Endpoint
                method="POST"
                path="/api/v1/contacts"
                desc="Cria contato. Body: name (obrigatório), email, phone, company."
                scope="contacts:write"
                example={`curl -X POST "$BASE/api/v1/contacts" \\
  -H "Authorization: Bearer nxf_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Maria Silva","phone":"+5511999990000"}'`}
              />
              <Endpoint
                method="GET"
                path="/api/v1/conversations"
                desc="Lista conversas. Query: status (OPEN|PENDING|CLOSED|ARCHIVED)."
                scope="conversations:read"
              />
              <Endpoint
                method="GET"
                path="/api/v1/opportunities"
                desc="Lista oportunidades do funil."
                scope="opportunities:read"
              />
              <Endpoint
                method="GET"
                path="/api/v1/tasks"
                desc="Lista tarefas. Query: status."
                scope="tasks:read"
              />
            </div>
          </Section>

          <Section id="errors" title="Erros">
            <p>Respostas de erro seguem o formato:</p>
            <CodeBlock copyable>{`{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Contato não encontrado."
  }
}`}</CodeBlock>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <InlineCode>401 UNAUTHORIZED</InlineCode> — chave ausente, inválida ou
                revogada
              </li>
              <li>
                <InlineCode>403 FORBIDDEN_SCOPE</InlineCode> — escopo insuficiente
              </li>
              <li>
                <InlineCode>404 RESOURCE_NOT_FOUND</InlineCode> — recurso inexistente neste
                tenant
              </li>
              <li>
                <InlineCode>429 RATE_LIMITED</InlineCode> — limite de requisições
              </li>
            </ul>
            <p className="text-[12.5px] text-ink-faint dark:text-gray-500">
              A API não expõe stack traces, SQL ou detalhes internos em produção.
            </p>
          </Section>

          <Section id="webhooks" title="Webhooks" icon={Webhook}>
            <p>
              Configure endpoints em{" "}
              <Link
                href="/app/settings/webhooks"
                className="font-medium text-brand-600 underline-offset-2 hover:underline dark:text-brand-300"
              >
                Configurações → Webhooks
              </Link>
              . A NexaFlow envia <InlineCode>POST</InlineCode> JSON assinado.
            </p>
            <p className="font-medium text-ink dark:text-gray-200">Headers</p>
            <CodeBlock>{`X-NexaFlow-Signature: t=<unix>,v1=<hmac_sha256_hex>
X-NexaFlow-Event: contact.created
X-NexaFlow-Delivery: <delivery_id>
X-NexaFlow-Event-Id: <event_id>
X-NexaFlow-Timestamp: <unix>`}</CodeBlock>
            <p className="font-medium text-ink dark:text-gray-200">Como validar a assinatura</p>
            <CodeBlock>{`// Node.js (conceito)
const crypto = require("crypto");
const [tPart, v1Part] = signatureHeader.split(",");
const t = tPart.replace("t=", "");
const v1 = v1Part.replace("v1=", "");
const expected = crypto
  .createHmac("sha256", WEBHOOK_SECRET)
  .update(\`\${t}.\${rawBody}\`)
  .digest("hex");
// compare timing-safe expected === v1`}</CodeBlock>
            <p className="font-medium text-ink dark:text-gray-200">Payload</p>
            <CodeBlock>{`{
  "id": "evt_…",
  "type": "contact.created",
  "createdAt": "2026-07-17T12:00:00.000Z",
  "tenantId": "…",
  "data": { }
}`}</CodeBlock>
            <p>
              Responda com HTTP <InlineCode>2xx</InlineCode> em até ~8s. Falhas geram
              novas tentativas com backoff (até 4). Use o botão de teste no painel para
              validar o endpoint.
            </p>
          </Section>

          <Section id="limits" title="Rate limit">
            <p>
              Padrão: <strong className="font-semibold text-ink dark:text-gray-200">120 requisições por minuto</strong> por chave de API.
            </p>
            <p>
              Ao exceder: HTTP <InlineCode>429</InlineCode> com{" "}
              <InlineCode>RATE_LIMITED</InlineCode>. Aguarde e tente novamente.
            </p>
          </Section>

          <footer className="border-t border-black/[0.06] pt-6 dark:border-white/[0.08]">
            <p className="text-[12px] text-ink-faint dark:text-gray-500">
              Versão da API: <InlineCode>v1</InlineCode>. Mudanças incompatíveis futuras
              usarão nova versão de path. Multi-tenant: dados de outra empresa nunca são
              retornados, mesmo com IDs adivinhados.
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}

function Endpoint({
  method,
  path,
  desc,
  scope,
  example,
}: {
  method: string;
  path: string;
  desc: string;
  scope?: string;
  example?: string;
}) {
  const methodColor =
    method === "GET"
      ? "text-emerald-300"
      : method === "POST"
        ? "text-sky-300"
        : "text-amber-300";

  return (
    <div className="rounded-xl border border-black/[0.07] p-3.5 dark:border-white/[0.09]">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-md bg-[#0f1219] px-2 py-0.5 font-mono text-[11px] font-bold dark:bg-[#0a0c12]",
            methodColor
          )}
        >
          {method}
        </span>
        <code className="font-mono text-[12.5px] font-medium text-ink dark:text-gray-100">
          {path}
        </code>
        {scope ? (
          <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] font-medium text-ink-faint dark:bg-white/[0.06] dark:text-gray-400">
            {scope}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-[12.5px] text-ink-muted dark:text-gray-400">{desc}</p>
      {example ? (
        <div className="mt-2.5">
          <CodeBlock copyable>{example}</CodeBlock>
        </div>
      ) : null}
    </div>
  );
}
