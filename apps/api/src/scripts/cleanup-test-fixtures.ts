/**
 * Remove do banco de DESENVOLVIMENTO apenas tenants criados por testes automatizados.
 *
 * Critérios seguros (AND de padrões de teste — não apaga "Fm Conteúdos"):
 * - slug: tenant-a-*, tenant-b-*, nega-*, negb-*, inv-*, e2e-nia-a-*, e2e-nia-b-*
 * - OU name: "Tenant A *", "Tenant B *", "NegA *", "NegB *", "Invite Co *", "E2E NIA Tenant *"
 * - OU settings.fixture === true / settings.createdByTest === true
 *
 * Uso:
 *   npx tsx src/scripts/cleanup-test-fixtures.ts           # dry-run
 *   npx tsx src/scripts/cleanup-test-fixtures.ts --apply   # executa
 *
 * NUNCA roda se NODE_ENV=production.
 */
import { prisma } from "../lib/prisma";

const SLUG_PREFIXES = [
  "tenant-a-",
  "tenant-b-",
  "nega-",
  "negb-",
  "inv-",
  "e2e-nia-a-",
  "e2e-nia-b-",
];
const NAME_PREFIXES = [
  "Tenant A ",
  "Tenant B ",
  "NegA ",
  "NegB ",
  "Invite Co ",
  "E2E NIA Tenant ",
];

function isTestTenant(t: {
  name: string;
  slug: string;
  settings: unknown;
}): boolean {
  const settings =
    t.settings && typeof t.settings === "object"
      ? (t.settings as Record<string, unknown>)
      : {};
  if (settings.fixture === true || settings.createdByTest === true) return true;
  if (settings.environment === "test") return true;
  if (SLUG_PREFIXES.some((p) => t.slug.startsWith(p))) return true;
  if (NAME_PREFIXES.some((p) => t.name.startsWith(p))) return true;
  return false;
}

function isRealPreserved(name: string) {
  const n = name.toLowerCase().trim();
  // Empresas conhecidas reais — nunca apagar por engano
  if (n === "fm conteúdos" || n === "fm conteudos") return true;
  if (n.includes("fm conteúdo") || n.includes("fm conteudo")) return true;
  return false;
}

async function deleteTenantFixture(tenantId: string) {
  const byTenant = { tenantId };
  await prisma.$transaction([
    // Tabelas com tenantId informativo, sem FK direta para Tenant.
    prisma.webhookDelivery.deleteMany({ where: byTenant }),
    prisma.apiUsageLog.deleteMany({ where: byTenant }),
    prisma.contactScoreHistory.deleteMany({ where: byTenant }),
    prisma.recommendationDecision.deleteMany({ where: byTenant }),
    prisma.note.deleteMany({ where: byTenant }),
    prisma.agentKnowledge.deleteMany({ where: byTenant }),
    prisma.helpAssistantThread.deleteMany({ where: byTenant }),
    prisma.helpKnowledgeGap.deleteMany({ where: byTenant }),
    prisma.notification.deleteMany({ where: byTenant }),
    prisma.auditLog.deleteMany({ where: byTenant }),
    prisma.securityEvent.deleteMany({ where: byTenant }),
    prisma.authSession.deleteMany({ where: byTenant }),
    prisma.mfaChallenge.deleteMany({ where: byTenant }),
    prisma.userInvite.deleteMany({ where: byTenant }),
    prisma.payment.deleteMany({ where: byTenant }),
    prisma.subscription.deleteMany({ where: byTenant }),
    prisma.aiUsageLog.deleteMany({ where: byTenant }),
    // Relações reais são removidas pelas cascatas declaradas no schema.
    prisma.tenant.delete({ where: { id: tenantId } }),
  ]);
}

async function deleteOrphanTestUser(user: { id: string; email: string }) {
  const byUser = { userId: user.id };
  await prisma.$transaction([
    prisma.helpAssistantThread.deleteMany({ where: byUser }),
    prisma.helpKnowledgeGap.deleteMany({ where: byUser }),
    prisma.notification.deleteMany({ where: byUser }),
    prisma.auditLog.deleteMany({ where: byUser }),
    prisma.securityEvent.deleteMany({ where: byUser }),
    prisma.note.deleteMany({ where: { authorId: user.id } }),
    prisma.loginAttempt.deleteMany({ where: { email: user.email } }),
    prisma.user.delete({ where: { id: user.id } }),
  ]);
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("ABORT: cleanup-test-fixtures proibido em production.");
    process.exit(1);
  }

  const apply = process.argv.includes("--apply");
  const dbUrl = process.env.DATABASE_URL || "(resolved by prisma)";
  console.log(`[cleanup] DATABASE_URL=${dbUrl}`);
  console.log(`[cleanup] mode=${apply ? "APPLY" : "DRY-RUN"}`);

  const all = await prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      settings: true,
      createdAt: true,
      _count: { select: { members: true, contacts: true, conversations: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const preserved: typeof all = [];
  const toDelete: typeof all = [];

  for (const t of all) {
    if (isRealPreserved(t.name)) {
      preserved.push(t);
      continue;
    }
    if (isTestTenant(t)) {
      toDelete.push(t);
    } else {
      preserved.push(t);
    }
  }

  console.log("\n=== PRESERVADAS (reais / não-teste) ===");
  for (const t of preserved) {
    console.log(`  ✓ ${t.name} (${t.slug}) members=${t._count.members}`);
  }

  console.log(`\n=== FIXTURES DE TESTE (${toDelete.length}) ===`);
  for (const t of toDelete) {
    console.log(
      `  ✗ ${t.name} | slug=${t.slug} | members=${t._count.members} contacts=${t._count.contacts}`
    );
  }

  if (!apply) {
    console.log("\nDry-run. Execute com --apply para remover.");
    return;
  }

  let removedTenants = 0;
  let removedUsers = 0;

  for (const t of toDelete) {
    const memberships = await prisma.membership.findMany({
      where: { tenantId: t.id },
      select: { userId: true },
    });
    await deleteTenantFixture(t.id);
    removedTenants++;

    for (const m of memberships) {
      const left = await prisma.membership.count({ where: { userId: m.userId } });
      if (left > 0) continue;
      const user = await prisma.user.findUnique({ where: { id: m.userId } });
      if (
        user &&
        (user.email.endsWith("@test.local") ||
          user.email.endsWith("@test.nexaflow.local") ||
          /@test\./.test(user.email))
      ) {
        await deleteOrphanTestUser(user);
        removedUsers++;
      }
    }
  }

  // Usuários de teste órfãos restantes
  const orphanUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { endsWith: "@test.local" } },
        { email: { endsWith: "@test.nexaflow.local" } },
      ],
      memberships: { none: {} },
      platformRole: null,
    },
  });
  for (const u of orphanUsers) {
    await deleteOrphanTestUser(u);
    removedUsers++;
  }

  // Convites de teste
  const invites = await prisma.userInvite.deleteMany({
    where: {
      OR: [
        { email: { endsWith: "@test.local" } },
        { email: { endsWith: "@test.nexaflow.local" } },
      ],
    },
  });

  console.log("\n=== RESULTADO ===");
  console.log(`Tenants removidos: ${removedTenants}`);
  console.log(`Users removidos: ${removedUsers}`);
  console.log(`Invites removidos: ${invites.count}`);
  console.log(`Tenants preservados: ${preserved.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
