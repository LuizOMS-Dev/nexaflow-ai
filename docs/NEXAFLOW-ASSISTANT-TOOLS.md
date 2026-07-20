# Assistente NexaFlow — Tools (MVP)

## Implementado (leitura + navegação)

As “tools” da NIA são **server-side context builders** (allowlist), não execução autônoma do modelo nem mutações:

| Capacidade | Função |
|------------|--------|
| Página atual | `resolveModuleFromPath` |
| Permissões | `permissionsForRole` + filtro de nav |
| Entitlements | `getTenantLimits` / `parseFeatureFlags` |
| WhatsApp | `getTenantWhatsAppStatus` |
| Agentes | nome / modo / ativo |
| Plano | nome/slug/limites estruturados |
| **Account Diagnostic** | `buildSecureAccountDiagnostic` — conta da sessão |
| Navegação | action chips com href allowlisted |

Detalhes e segurança: `docs/NIA-ACCOUNT-TOOLS.md`.

## Navegação

Registry: `nav-registry.ts` → `ASSISTANT_NAV_REGISTRY`.

- Só hrefs da lista
- Validados de novo no parse de `ACTIONS:` da resposta
- UI só faz `router.push` em paths que começam com `/`

## Não implementar (ainda)

- Bloquear usuário, suspender empresa, alterar plano
- Excluir dados, enviar campanhas, executar automações
- Alterar agentes ou configurações críticas
- Tools CRM de agente de atendimento
- Reconectar WhatsApp ou qualquer mutação via NIA
