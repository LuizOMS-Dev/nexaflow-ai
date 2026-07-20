# NexaFlow AI Core — arquitetura multi-provider

```
NEXAFLOW (Agentes, Knowledge, Tools, NIA, …)
        ↓
   AI CORE (generateForScope / generateText)
        ↓
   PROVIDER GATEWAY
        ↓
   ADAPTER (OpenAI-compatible | stub)
        ↓
   OpenAI | Groq | xAI | OpenRouter | Mistral | …
```

## Princípios

1. **Nenhum fluxo de agente/tenant** chama SDK de provider diretamente — usa `generateForScope` / AI Core (`analyzeConversation`, `chatWithAgent`, WA, NIA, import).
2. **NIA = platform** — nunca usa BYOK do tenant.
3. **Tenant** pode usar `platform_managed` (env NexaFlow) ou **BYOK** (chave criptografada).
4. **Capability matrix** — não fingir tools/structured se o modelo não suporta.
5. **Keys** — AES-GCM (`enc:v1:`), nunca retornadas em plaintext no GET.
6. **getPlatformAiClient** — residual legado para checagem de config; **não** usar em novos fluxos.

## Pacote

`apps/api/src/services/ai-core/`

- `types.ts` — mensagens e runtime canônicos  
- `catalog.ts` — providers + modelos + capabilities  
- `openai-compatible-adapter.ts` — Groq, OpenAI, xAI, OpenRouter, Mistral  
- `stub-adapter.ts` — Anthropic/Gemini nativos (não homologados)  
- `gateway.ts` — generate + fallback  
- `resolve-config.ts` — platform vs tenant  

## Configuração tenant

- Tabela `TenantAiConfig`
- API: `GET/PUT /settings/ai-provider`, `POST /settings/ai-provider/test`
- UI: **Configurações → IA → Fornecedor de IA**

## Classificação atual

**AI_MULTI_PROVIDER_STAGING_READY**

Homologados (OpenAI-compatible): Groq, OpenAI, xAI, OpenRouter, Mistral.  
Stubs: Anthropic nativo, Gemini nativo (use OpenRouter se precisar Claude).  
Migration de todos os callers legados ainda em andamento (`analyzeConversation` etc.).
