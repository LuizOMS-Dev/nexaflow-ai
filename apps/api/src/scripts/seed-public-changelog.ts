/**
 * Atualiza o changelog PÚBLICO (clientes) com linguagem de produto.
 * Uso: npx tsx apps/api/src/scripts/seed-public-changelog.ts
 * (ou via docker: node no container após build)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Item = { category: "NEW" | "IMPROVEMENT" | "FIX" | "SECURITY"; body: string };

async function upsertRelease(params: {
  version: string;
  title: string;
  summary: string;
  publishedAt: Date;
  items: Item[];
}) {
  const existing = await prisma.platformRelease.findUnique({
    where: { version: params.version },
    include: { items: true },
  });

  if (existing) {
    await prisma.platformReleaseItem.deleteMany({ where: { releaseId: existing.id } });
    await prisma.platformRelease.update({
      where: { id: existing.id },
      data: {
        title: params.title,
        summary: params.summary,
        status: "PUBLISHED",
        visibility: "ALL",
        publishedAt: params.publishedAt,
        items: {
          create: params.items.map((it, i) => ({
            category: it.category,
            body: it.body,
            sortOrder: i,
          })),
        },
      },
    });
    console.log(`[changelog] updated v${params.version}`);
    return;
  }

  await prisma.platformRelease.create({
    data: {
      version: params.version,
      title: params.title,
      summary: params.summary,
      status: "PUBLISHED",
      visibility: "ALL",
      publishedAt: params.publishedAt,
      items: {
        create: params.items.map((it, i) => ({
          category: it.category,
          body: it.body,
          sortOrder: i,
        })),
      },
    },
  });
  console.log(`[changelog] created v${params.version}`);
}

async function main() {
  // Release mais recente — benefícios para o cliente (jul/2026)
  await upsertRelease({
    version: "1.9.1",
    title: "NIA mais útil e atendimento humano mais claro",
    summary:
      "A assistente NIA orienta melhor, leva você à página certa e o atendimento entre IA e equipe fica mais organizado.",
    publishedAt: new Date("2026-07-17T15:00:00.000Z"),
    items: [
      {
        category: "NEW",
        body: "NIA com botões contextuais: quando ela explica onde configurar algo, você pode abrir a área correta com um clique.",
      },
      {
        category: "NEW",
        body: "Histórico de conversas da NIA, para retomar o que já foi combinado com a assistente.",
      },
      {
        category: "NEW",
        body: "Importação de configuração do agente a partir de um arquivo de texto, com prévia do que será aplicado.",
      },
      {
        category: "IMPROVEMENT",
        body: "NIA com respostas mais completas: explica, guia o passo a passo e ajuda a entender problemas da sua conta com base no estado real (WhatsApp, agentes, plano e permissões).",
      },
      {
        category: "IMPROVEMENT",
        body: "Handoff mais claro: quando a IA pede um humano, a conversa entra na fila, a equipe é avisada e quem assume passa a ser o responsável — a IA pausa corretamente.",
      },
      {
        category: "IMPROVEMENT",
        body: "Navegação e sidebar refinadas, com seletor de empresa mais simples e menu de conta integrado.",
      },
      {
        category: "FIX",
        body: "Correções no fluxo de assumir e retomar atendimentos, para evitar confusão entre IA e humano.",
      },
      {
        category: "SECURITY",
        body: "Reforçamos a proteção das contas, sessões e a separação dos dados de cada empresa.",
      },
    ],
  });

  // Release anterior — limpa texto de Superadmin e linguagem técnica
  await upsertRelease({
    version: "1.9.0",
    title: "WhatsApp, handoff e Base de Conhecimento mais confiáveis",
    summary:
      "Atendimento automático mais estável, transferência para a equipe com aviso no painel e agentes que usam melhor o conhecimento da empresa.",
    publishedAt: new Date("2026-07-15T12:00:00.000Z"),
    items: [
      {
        category: "NEW",
        body: "Página Novidades da NexaFlow, com aviso discreto quando há itens ainda não vistos.",
      },
      {
        category: "NEW",
        body: "Importar configuração do agente por arquivo (.txt ou .md), com prévia e escolha do que aplicar — sem mudar sozinho o modo ou as ferramentas.",
      },
      {
        category: "IMPROVEMENT",
        body: "Handoff para a equipe: a conversa vai para a fila, a equipe é notificada e o painel mostra quem precisa assumir.",
      },
      {
        category: "IMPROVEMENT",
        body: "Base de Conhecimento: o agente prioriza o conteúdo mais relevante para a pergunta do cliente.",
      },
      {
        category: "IMPROVEMENT",
        body: "NIA reconhece seu nome na sessão e o chat fica mais limpo e fácil de usar.",
      },
      {
        category: "IMPROVEMENT",
        body: "Equipe e papéis com visual mais claro, convites pendentes e vagas do plano mais fáceis de entender.",
      },
      {
        category: "FIX",
        body: "WhatsApp: o atendimento automático não fica silencioso para sempre após instabilidades — a equipe continua sendo avisada nos pedidos de humano.",
      },
      {
        category: "FIX",
        body: "Agentes usam melhor o conhecimento pronto e evitam respostas genéricas do tipo “não tenho essa informação” quando o conteúdo existe.",
      },
      {
        category: "SECURITY",
        body: "Importação de configuração do agente com proteção contra instruções indevidas e reforço na proteção de dados sensíveis.",
      },
    ],
  });

  // Arquiva quaisquer releases só de superadmin se existirem como ALL com conteúdo interno
  const all = await prisma.platformRelease.findMany({
    where: { visibility: "ALL", status: "PUBLISHED" },
    include: { items: true },
  });
  for (const r of all) {
    if (/superadmin|diagnóstico e saúde da plataforma/i.test(r.title + r.summary + r.items.map((i) => i.body).join(" "))) {
      // already rewritten above for 1.9.0; skip
    }
  }

  console.log("[changelog] public customer releases ready");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
