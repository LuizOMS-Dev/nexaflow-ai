import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app";
import { prisma } from "../lib/prisma";

describe("marketing routes", () => {
  let app: FastifyInstance;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const activeSlug = `qa-public-${suffix}`;
  const inactiveSlug = `qa-hidden-${suffix}`;
  const leadEmail = `qa-marketing-${suffix}@example.invalid`;
  const honeypotEmail = `qa-bot-${suffix}@example.invalid`;
  const clientIp = `2001:db8:${Math.floor(Math.random() * 0xffff).toString(16)}:${Math.floor(
    Math.random() * 0xffff
  ).toString(16)}::1`;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    await prisma.plan.createMany({
      data: [
        {
          name: "Plano QA público",
          slug: activeSlug,
          description: "Fixture temporária de teste",
          priceMonthly: 149.9,
          priceAnnual: 1499,
          maxUsers: 5,
          maxChannels: 2,
          maxContacts: 2500,
          maxAiMessages: 500,
          features: { ai: true, automations: true },
          sortOrder: -100,
          isActive: true,
        },
        {
          name: "Plano QA oculto",
          slug: inactiveSlug,
          priceMonthly: 1,
          isActive: false,
        },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    await prisma.salesLead
      .deleteMany({ where: { email: { in: [leadEmail, honeypotEmail] } } })
      .catch(() => null);
    await prisma.plan
      .deleteMany({ where: { slug: { in: [activeSlug, inactiveSlug] } } })
      .catch(() => null);
    await app.close().catch(() => null);
  });

  it("publica apenas planos ativos com preço, limites e destaques", async () => {
    const response = await app.inject({ method: "GET", url: "/public/plans" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toContain("public");

    const body = response.json() as {
      items: Array<{
        slug: string;
        priceMonthly: number;
        limits: { users: number; contacts: number };
        highlights: string[];
      }>;
    };
    const published = body.items.find((plan) => plan.slug === activeSlug);

    expect(published).toMatchObject({
      priceMonthly: 149.9,
      limits: { users: 5, contacts: 2500 },
    });
    expect(published?.highlights).toContain("Agentes de IA");
    expect(body.items.some((plan) => plan.slug === inactiveSlug)).toBe(false);
  });

  it("rejeita solicitação de demonstração inválida", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/public/demo-requests",
      headers: { "x-forwarded-for": clientIp },
      payload: { name: "A", email: "inválido", companyName: "" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("aceita honeypot sem persistir lead", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/public/demo-requests",
      headers: { "x-forwarded-for": clientIp },
      payload: {
        name: "Robô QA",
        email: honeypotEmail,
        companyName: "Fixture automatizada",
        website: "https://spam.example.invalid",
      },
    });

    expect(response.statusCode).toBe(202);
    expect(await prisma.salesLead.count({ where: { email: honeypotEmail } })).toBe(0);
  });

  it("persiste um pedido legítimo com normalização e status inicial", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/public/demo-requests",
      headers: { "x-forwarded-for": clientIp },
      payload: {
        name: "Pessoa QA",
        email: leadEmail.toUpperCase(),
        phone: "+55 11 99999-0000",
        companyName: "Empresa de teste automatizado",
        teamSize: "3-5",
        message: "Fixture temporária; remover ao encerrar o teste.",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ ok: true });

    const saved = await prisma.salesLead.findFirstOrThrow({
      where: { email: leadEmail },
    });
    expect(saved).toMatchObject({
      name: "Pessoa QA",
      companyName: "Empresa de teste automatizado",
      teamSize: "3-5",
      source: "website",
      status: "NEW",
    });
  });

  it("protege a fila administrativa sem sessão superadmin", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/admin/sales-leads",
    });

    expect(response.statusCode).toBe(401);
  });
});
