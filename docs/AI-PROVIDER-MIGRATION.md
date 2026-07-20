# Migração

1. Deploy migration `20260717070000_tenant_ai_config`
2. Empresas existentes: sem `TenantAiConfig` → usam **platform_managed** (env atual)
3. BYOK opcional em Configurações → IA
4. NIA permanece em env da plataforma
5. Agentes: override de modelo ainda no campo `agent.model` (resolve com provider do tenant)
