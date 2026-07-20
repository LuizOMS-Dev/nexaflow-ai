/**
 * Notificações automáticas de Novidades (releases públicas).
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma } from "../lib/prisma";
import {
  buildPlatformReleaseNotificationCopy,
  notifyPlatformReleasePublished,
  wasPlatformReleaseAlreadyNotified,
  PLATFORM_RELEASE_NOTIF_TYPE,
} from "./platform-release-notify";
import {
  adminCreateRelease,
  adminPublishRelease,
  adminArchiveRelease,
  adminUpdateRelease,
  countUnseenReleases,
} from "./platform-changelog";

const suffix = `t${Date.now().toString(36)}`;

describe("platform release notifications", () => {
  let userA: string;
  let userB: string;
  let releasePublicId: string;
  let releaseInternalId: string;

  beforeAll(async () => {
    const a = await prisma.user.create({
      data: {
        email: `rel-a-${suffix}@test.local`,
        passwordHash: "x",
        name: "User A",
        status: "ACTIVE",
        isActive: true,
      },
    });
    const b = await prisma.user.create({
      data: {
        email: `rel-b-${suffix}@test.local`,
        passwordHash: "x",
        name: "User B",
        status: "ACTIVE",
        isActive: true,
      },
    });
    userA = a.id;
    userB = b.id;

    // Membership mínima (elegível)
    const tenant = await prisma.tenant.create({
      data: {
        name: `Tenant Rel ${suffix}`,
        slug: `tenant-rel-${suffix}`,
      },
    });
    await prisma.membership.createMany({
      data: [
        { tenantId: tenant.id, userId: userA, role: "ADMIN", isActive: true },
        { tenantId: tenant.id, userId: userB, role: "AGENT", isActive: true },
      ],
    });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: { userId: { in: [userA, userB] } },
    });
    await prisma.userReleaseSeen.deleteMany({
      where: { userId: { in: [userA, userB] } },
    });
    if (releasePublicId) {
      await prisma.platformReleaseItem.deleteMany({ where: { releaseId: releasePublicId } });
      await prisma.platformRelease.deleteMany({ where: { id: releasePublicId } }).catch(() => null);
    }
    if (releaseInternalId) {
      await prisma.platformReleaseItem.deleteMany({ where: { releaseId: releaseInternalId } });
      await prisma.platformRelease.deleteMany({ where: { id: releaseInternalId } }).catch(() => null);
    }
    await prisma.membership.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: `tenant-rel-${suffix}` } } });
  });

  it("copy de notificação usa título da release e deep-link", () => {
    const c = buildPlatformReleaseNotificationCopy({
      releaseId: "rel_123",
      title: "NIA mais inteligente e melhorias nos atendimentos",
      version: "1.9.2",
    });
    expect(c.title).toMatch(/NexaFlow|novidade|atualização/i);
    expect(c.body).toMatch(/NIA mais inteligente/);
    expect(c.actionUrl).toBe("/app/whats-new?release=rel_123");
  });

  it("DRAFT: publicar fluxo — draft não notifica até publish", async () => {
    const draft = await adminCreateRelease({
      version: `9.9.${Date.now() % 1000}`,
      title: "Draft only",
      visibility: "ALL",
      items: [{ category: "NEW", body: "Item de teste cliente" }],
    });
    releasePublicId = draft.id;
    expect(draft.status).toBe("DRAFT");

    const before = await prisma.notification.count({
      where: { type: PLATFORM_RELEASE_NOTIF_TYPE, entityId: draft.id },
    });
    expect(before).toBe(0);
  });

  it("PUBLIC: publish ALL gera notificação por usuário (idempotente)", async () => {
    const published = await adminPublishRelease(releasePublicId);
    expect(published.status).toBe("PUBLISHED");

    const count = await prisma.notification.count({
      where: { type: PLATFORM_RELEASE_NOTIF_TYPE, entityId: releasePublicId },
    });
    expect(count).toBeGreaterThanOrEqual(2); // A e B no mínimo

    const forA = await prisma.notification.findFirst({
      where: {
        userId: userA,
        type: PLATFORM_RELEASE_NOTIF_TYPE,
        entityId: releasePublicId,
      },
    });
    expect(forA).toBeTruthy();
    expect(forA!.actionUrl || forA!.href).toMatch(/\/app\/whats-new\?release=/);
    expect(forA!.tenantId).toBeNull(); // uma vez por usuário, sem tenant

    // Segunda chamada de notify — idempotente
    const again = await notifyPlatformReleasePublished({
      releaseId: releasePublicId,
      version: published.version,
      title: published.title,
      summary: published.summary,
      visibility: "ALL",
      status: "PUBLISHED",
    });
    expect(again.skipped).toBe(true);
    expect(again.reason).toBe("already_notified");

    // adminPublish de novo (já PUBLISHED) não duplica
    await adminPublishRelease(releasePublicId);
    const count2 = await prisma.notification.count({
      where: { type: PLATFORM_RELEASE_NOTIF_TYPE, entityId: releasePublicId },
    });
    expect(count2).toBe(count);
  });

  it("INTERNAL: SUPERADMIN não notifica clientes", async () => {
    const internal = await adminCreateRelease({
      version: `8.8.${Date.now() % 1000}`,
      title: "Interno Superadmin",
      visibility: "SUPERADMIN",
      items: [{ category: "FIX", body: "Correção interna docker redis" }],
    });
    releaseInternalId = internal.id;
    await adminPublishRelease(internal.id);

    const count = await prisma.notification.count({
      where: { type: PLATFORM_RELEASE_NOTIF_TYPE, entityId: internal.id },
    });
    expect(count).toBe(0);
    expect(await wasPlatformReleaseAlreadyNotified(internal.id)).toBe(false);
  });

  it("EDIT após publish não cria nova notificação", async () => {
    const before = await prisma.notification.count({
      where: { type: PLATFORM_RELEASE_NOTIF_TYPE, entityId: releasePublicId },
    });
    await adminUpdateRelease({
      id: releasePublicId,
      title: "Título editado após publish",
    });
    const after = await prisma.notification.count({
      where: { type: PLATFORM_RELEASE_NOTIF_TYPE, entityId: releasePublicId },
    });
    expect(after).toBe(before);
  });

  it("MULTI-USER: estados de leitura independentes (unseen)", async () => {
    // A marca como vista via userReleaseSeen
    await prisma.userReleaseSeen.create({
      data: { userId: userA, releaseId: releasePublicId },
    });
    const unseenA = await countUnseenReleases(userA);
    const unseenB = await countUnseenReleases(userB);
    // B ainda pode ter unseen >= 1 se a release for após createdAt
    expect(unseenB).toBeGreaterThanOrEqual(unseenA);
  });

  it("ARCHIVE: não gera nova notificação", async () => {
    const before = await prisma.notification.count({
      where: { type: PLATFORM_RELEASE_NOTIF_TYPE, entityId: releasePublicId },
    });
    await adminArchiveRelease(releasePublicId);
    const after = await prisma.notification.count({
      where: { type: PLATFORM_RELEASE_NOTIF_TYPE, entityId: releasePublicId },
    });
    expect(after).toBe(before);
  });
});
