/**
 * Configuração de provedor de IA do tenant (BYOK).
 * NIA NÃO usa estas credenciais.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { encryptSecret } from "../services/security/crypto";
import { audit } from "../services/audit";
import {
  listImplementedProviders,
  listAllProviders,
  modelsForProvider,
  maskApiKey,
  PROVIDER_META,
  type AiProviderId,
  resolveAiRuntime,
  getAdapter,
} from "../services/ai-core";
import { decryptSecret } from "../services/security/crypto";
import { looksLikeProviderKey } from "../services/ai-core/credentials";
import { env } from "../lib/env";

const providerEnum = z.enum([
  "openai",
  "anthropic",
  "gemini",
  "groq",
  "openrouter",
  "xai",
  "mistral",
]);

export async function tenantAiRoutes(app: FastifyInstance) {
  app.get(
    "/settings/ai-provider",
    { preHandler: [app.requireTenant, app.requirePermission("settings.read")] },
    async (request) => {
      const tenantId = request.user.tenantId!;
      const row = await prisma.tenantAiConfig.findUnique({ where: { tenantId } }).catch(() => null);
      const platform = await resolveAiRuntime({ scope: "platform" });
      const providers = listAllProviders().map((p) => ({
        id: p.id,
        name: p.name,
        productionReady: p.productionReady,
        openaiCompatible: p.openaiCompatible,
        models: modelsForProvider(p.id, false).map((m) => ({
          id: m.modelId,
          name: m.displayName,
          enabled: m.enabled && m.productionReady,
          capabilities: m.capabilities,
        })),
      }));

      return {
        providers,
        implemented: listImplementedProviders().map((p) => p.id),
        platformManagedAvailable: Boolean(platform?.apiKey),
        platformProvider: platform?.provider || null,
        platformModel: platform?.model || null,
        config: row
          ? {
              provider: row.provider,
              model: row.model,
              credentialMode: row.credentialMode,
              hasApiKey: Boolean(row.apiKeyEnc),
              apiKeyMasked: row.apiKeyLast4
                ? `••••••••••••${row.apiKeyLast4}`
                : row.apiKeyEnc
                  ? "••••••••"
                  : null,
              baseUrl: row.baseUrl,
              fallbackProvider: row.fallbackProvider,
              fallbackModel: row.fallbackModel,
              enabled: row.enabled,
              lastTestedAt: row.lastTestedAt,
              lastTestOk: row.lastTestOk,
            }
          : {
              provider: platform?.provider || "groq",
              model: platform?.model || "llama-3.1-8b-instant",
              credentialMode: "platform_managed",
              hasApiKey: false,
              apiKeyMasked: null,
              baseUrl: null,
              fallbackProvider: null,
              fallbackModel: null,
              enabled: true,
              lastTestedAt: null,
              lastTestOk: null,
            },
      };
    }
  );

  app.put(
    "/settings/ai-provider",
    { preHandler: [app.requireTenant, app.requirePermission("settings.update")] },
    async (request) => {
      if (request.user.role !== "ADMIN" && request.user.platformRole !== "SUPERADMIN") {
        throw new AppError("Sem permissão", 403);
      }
      const tenantId = request.user.tenantId!;
      const body = z
        .object({
          provider: providerEnum,
          model: z.string().min(1).max(120),
          credentialMode: z.enum(["platform_managed", "byok"]),
          apiKey: z.string().min(8).max(500).optional().nullable(),
          clearApiKey: z.boolean().optional(),
          baseUrl: z.string().url().max(300).optional().nullable(),
          fallbackProvider: providerEnum.optional().nullable(),
          fallbackModel: z.string().max(120).optional().nullable(),
          enabled: z.boolean().optional(),
        })
        .parse(request.body);

      const meta = PROVIDER_META[body.provider as AiProviderId];
      if (!meta?.productionReady && body.credentialMode === "byok") {
        throw new AppError(
          `O provedor ${meta?.name || body.provider} ainda não está homologado para uso com chave própria.`,
          400,
          "PROVIDER_NOT_READY"
        );
      }

      const existing = await prisma.tenantAiConfig.findUnique({ where: { tenantId } });
      let apiKeyEnc = existing?.apiKeyEnc ?? null;
      let apiKeyLast4 = existing?.apiKeyLast4 ?? null;

      if (body.clearApiKey) {
        apiKeyEnc = null;
        apiKeyLast4 = null;
      }
      if (body.apiKey?.trim()) {
        const plain = body.apiKey.trim();
        apiKeyEnc = encryptSecret(plain);
        apiKeyLast4 = plain.slice(-4);
      }

      if (body.credentialMode === "byok" && !apiKeyEnc) {
        throw new AppError("Informe a API Key para o modo chave própria.", 400, "API_KEY_REQUIRED");
      }

      const data = {
        provider: body.provider,
        model: body.model,
        credentialMode: body.credentialMode,
        apiKeyEnc: body.credentialMode === "byok" ? apiKeyEnc : null,
        apiKeyLast4: body.credentialMode === "byok" ? apiKeyLast4 : null,
        baseUrl: body.baseUrl || null,
        fallbackProvider: body.fallbackProvider || null,
        fallbackModel: body.fallbackModel || null,
        enabled: body.enabled !== false,
      };

      const row = existing
        ? await prisma.tenantAiConfig.update({ where: { tenantId }, data })
        : await prisma.tenantAiConfig.create({ data: { tenantId, ...data } });

      // Propaga modelo padrão aos agentes:
      // - que ainda usavam o modelo antigo da empresa, ou
      // - cujo model não existe no catálogo do provedor novo
      try {
        const allowed = new Set(
          modelsForProvider(body.provider as AiProviderId, false).map((m) => m.modelId)
        );
        const prevModel = existing?.model || null;
        const agents = await prisma.aiAgent.findMany({
          where: { tenantId },
          select: { id: true, model: true },
        });
        const toUpdate = agents.filter((a) => {
          const m = (a.model || "").trim();
          if (!m) return true;
          if (prevModel && m === prevModel && prevModel !== body.model) return true;
          if (!allowed.has(m)) return true;
          return false;
        });
        if (toUpdate.length) {
          await prisma.aiAgent.updateMany({
            where: { id: { in: toUpdate.map((a) => a.id) }, tenantId },
            data: { model: body.model },
          });
        }
      } catch {
        /* best-effort */
      }

      await audit({
        tenantId,
        userId: request.user.sub,
        action: "tenant_ai.config_updated",
        entity: "TenantAiConfig",
        entityId: row.id,
        metadata: {
          provider: row.provider,
          model: row.model,
          credentialMode: row.credentialMode,
          hasKey: Boolean(row.apiKeyEnc),
        },
      });

      return {
        ok: true,
        config: {
          provider: row.provider,
          model: row.model,
          credentialMode: row.credentialMode,
          hasApiKey: Boolean(row.apiKeyEnc),
          apiKeyMasked: row.apiKeyLast4 ? `••••••••••••${row.apiKeyLast4}` : null,
        },
      };
    }
  );

  app.post(
    "/settings/ai-provider/test",
    { preHandler: [app.requireTenant, app.requirePermission("settings.update")] },
    async (request) => {
      const tenantId = request.user.tenantId!;
      const body = z
        .object({
          provider: providerEnum.optional(),
          model: z.string().optional(),
          credentialMode: z.enum(["platform_managed", "byok"]).optional(),
          apiKey: z.string().max(500).optional().nullable(),
          baseUrl: z.string().url().optional().nullable().or(z.literal("")),
        })
        .parse(request.body || {});

      const saved = await prisma.tenantAiConfig.findUnique({ where: { tenantId } }).catch(() => null);
      const mode =
        body.credentialMode ||
        (saved?.credentialMode as "platform_managed" | "byok" | undefined) ||
        "platform_managed";
      const provider = (body.provider || saved?.provider || env.aiProvider || "groq") as AiProviderId;
      // Modelo da UI (não salvo ainda) > modelo salvo > env — NUNCA o “primeiro do catálogo”
      const model =
        (body.model || "").trim() ||
        (saved?.model || "").trim() ||
        env.aiModel ||
        modelsForProvider(provider, false)[0]?.modelId ||
        "";
      const baseUrl = (body.baseUrl || saved?.baseUrl || undefined) || undefined;

      if (!PROVIDER_META[provider]?.productionReady) {
        return {
          ok: false,
          message: `O provedor ${PROVIDER_META[provider]?.name || provider} ainda não está homologado.`,
          provider,
          model,
          credentialMode: mode,
        };
      }

      let apiKey = "";
      let testedSource: "body" | "saved_byok" | "platform" | "none" = "none";

      if (mode === "byok") {
        // 1) chave digitada agora (prioridade)
        if (body.apiKey?.trim()) {
          apiKey = body.apiKey.trim();
          testedSource = "body";
        } else if (saved?.apiKeyEnc && saved.credentialMode === "byok") {
          // 2) chave já salva do tenant — NUNCA cair na chave da plataforma
          try {
            apiKey = decryptSecret(saved.apiKeyEnc).plain;
            testedSource = "saved_byok";
          } catch {
            apiKey = "";
          }
        }

        if (!apiKey) {
          return {
            ok: false,
            message:
              "Modo chave própria: informe a API Key para testar. Sem chave, a conexão não pode ser validada.",
            provider,
            model,
            credentialMode: mode,
            testedSource: "none",
          };
        }

        const format = looksLikeProviderKey(provider, apiKey);
        if (!format.ok) {
          return {
            ok: false,
            message: format.message || "API Key inválida.",
            provider,
            model,
            credentialMode: mode,
            testedSource,
          };
        }

        const adapter = getAdapter(provider);
        const health = await adapter.healthCheck(apiKey, baseUrl || undefined, model || undefined);

        await prisma.tenantAiConfig
          .updateMany({
            where: { tenantId },
            data: {
              lastTestedAt: new Date(),
              lastTestOk: health.ok,
              // se o teste veio com modelo da UI e config existe, alinha o modelo salvo no teste OK
              ...(health.ok && model && body.model ? { model } : {}),
            },
          })
          .catch(() => null);

        return {
          ok: health.ok,
          message: health.ok
            ? `${health.message} (chave da empresa)`
            : health.message,
          latencyMs: health.latencyMs,
          provider,
          model: health.modelTried || model,
          credentialMode: mode,
          testedSource,
        };
      }

      // platform_managed: testa chave da NexaFlow + modelo selecionado na UI
      if (!env.aiApiKey?.trim() || !env.aiProvider) {
        return {
          ok: false,
          message:
            "Modo gerenciado pela NexaFlow: a plataforma ainda não tem provedor/chave configurados no servidor.",
          provider: env.aiProvider || provider,
          model,
          credentialMode: "platform_managed",
          testedSource: "none",
        };
      }

      const platformProvider = (body.provider || env.aiProvider) as AiProviderId;
      const platformModel =
        (body.model || "").trim() ||
        (saved?.model || "").trim() ||
        env.aiModel ||
        modelsForProvider(platformProvider, false)[0]?.modelId ||
        "";
      const adapter = getAdapter(platformProvider);
      const health = await adapter.healthCheck(
        env.aiApiKey,
        env.aiBaseUrl || undefined,
        platformModel || undefined
      );
      testedSource = "platform";

      await prisma.tenantAiConfig
        .updateMany({
          where: { tenantId },
          data: {
            lastTestedAt: new Date(),
            lastTestOk: health.ok,
            ...(health.ok && platformModel && body.model ? { model: platformModel } : {}),
          },
        })
        .catch(() => null);

      return {
        ok: health.ok,
        message: health.ok
          ? `${health.message} (gerenciado pela NexaFlow)`
          : health.message,
        latencyMs: health.latencyMs,
        provider: platformProvider,
        model: health.modelTried || platformModel,
        credentialMode: "platform_managed",
        testedSource,
      };
    }
  );
}

void maskApiKey;
