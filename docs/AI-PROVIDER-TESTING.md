# Testes multi-provider

```bash
cd apps/api
npx vitest run src/services/ai-core/
```

Cobertura unitária: catalog, adapters registry, resolveModelForProvider, maskApiKey, stub health.

Integração real: `POST /settings/ai-provider/test` com chave válida.

E2E: WhatsApp AUTO com BYOK tenant; NIA com platform key.
