# Frontend Final Inventory — NexaFlow AI

Última atualização: 2026-07-16  
Escopo: UI/UX/layout/textos (sem mudança de API/schema/RBAC/billing).

Status: `PENDENTE` · `EM REVISÃO` · `CORRIGIDA` · `TESTADA` · `APROVADA`

---

## Design System (global)

| Item | Status | Notas |
|------|--------|--------|
| EmptyState | CORRIGIDA | Sem borda pontilhada; tipografia compacta |
| Modal footer | APROVADA | Dark, solid |
| Select (portal) | APROVADA | Sem clipping |
| PageHeader / AdminPageHeader | APROVADA | — |
| AttentionPanel | APROVADA | — |
| Toasts | APROVADA | — |

---

## Auth / público

| Nome | Rota | Contexto | Status |
|------|------|----------|--------|
| Landing | `/` | Público | APROVADA |
| Login | `/login` | Público | APROVADA |
| Register | `/register` | Público | APROVADA |
| Erro app | `error.tsx` | Global | APROVADA |
| Erro global | `global-error.tsx` | Global | APROVADA |

---

## Tenant / Empresa

| Nome | Rota | Desktop | Tablet | Mobile | Loading | Empty | Error | Modais | Status |
|------|------|---------|--------|--------|---------|-------|-------|--------|--------|
| Início | `/app` | OK | OK | OK | Spinner | Pendências vazias | Humano | — | APROVADA |
| Conversas | `/app/inbox` | OK | OK | OK | OK | QuietEmpty / filtros | — | Finalizar | APROVADA |
| Contatos | `/app/contacts` | OK | OK | tabela scroll | OK | busca vs zero | — | Novo / Import / Score | CORRIGIDA |
| Funil | `/app/crm` | OK | OK | horizontal | OK | — | — | Oportunidade | APROVADA |
| Tarefas | `/app/tasks` | OK | OK | OK | OK | filtro vazio | — | Nova tarefa | CORRIGIDA |
| Campanhas | `/app/campaigns` | OK | OK | OK | OK | OK | — | Nova | CORRIGIDA |
| Fluxos | `/app/automations` | OK | OK | OK | skeleton | OK | — | Builder | APROVADA |
| Agentes | `/app/ai` | OK | OK | OK | OK | OK | — | Wizard / Sandbox | APROVADA |
| Conhecimento | `/app/knowledge` | OK | OK | OK | OK | OK | humano | Add / Edit / View | APROVADA |
| Equipe | `/app/team` | OK | OK | tabela | OK | OK | — | Convidar | APROVADA |
| Canais (WhatsApp) | `/app/integrations` | OK | OK | OK | OK | compacto | banner | QR / disconnect | CORRIGIDA |
| Relatórios | `/app/reports` | OK | OK | OK | OK | curto | OK | — | CORRIGIDA |
| Configurações | `/app/settings` | OK | OK | chips | OK | — | — | dirty tab | CORRIGIDA |
| Onboarding | `/app/onboarding` | OK | OK | OK | — | — | — | — | APROVADA |
| Brand (legado) | `/app/brand` | — | — | — | — | — | — | — | EM REVISÃO |

### Minha Conta

| Nome | Rota | Status |
|------|------|--------|
| Perfil | `/app/account` | APROVADA |
| Preferências | `/app/account/preferences` | APROVADA |
| Segurança / MFA | `/app/account/security` | APROVADA |
| Sessões | `/app/account/sessions` | APROVADA |
| Empresas | `/app/account/companies` | APROVADA |

---

## Superadmin

| Nome | Rota | Status | Notas |
|------|------|--------|--------|
| Visão geral | `/admin` | CORRIGIDA | KPIs reais; erro humano |
| Empresas | `/admin/companies` | CORRIGIDA | lista premium; erro humano |
| Detalhe empresa | `/admin/tenants/[id]` | APROVADA | abas overview/billing/team/uso/ops/audit |
| Usuários | `/admin/users` | CORRIGIDA | abas empresa vs plataforma |
| Financeiro | `/admin/finance` | CORRIGIDA | MRR/ARR; sem lucro fake |
| Planos | `/admin/plans` | APROVADA | Enterprise sob consulta |
| Auditoria | `/admin/audit` | CORRIGIDA | labels humanas |

---

## Correções desta rodada (leia.txt)

1. **EmptyState global** — minimalista, sem dashed box  
2. **Tarefas** — filtros Pendentes / Hoje / Atrasadas / Concluídas / Todas  
3. **Contatos** — empty distingue busca vs lista zero  
4. **Campanhas** — canal traduzido (WhatsApp)  
5. **Relatórios** — insights curtos; empty curto; hints sem “Snapshot atual”  
6. **Configurações** — descriptions excessivas removidas  
7. **Canais** — empty compacto sem tutorial em 3 passos  
8. **Admin erros** — sem stack/mensagem técnica no empty  
9. **Conversas** (sessões anteriores) — empty states, origem IA/humano, status select  

---

## O que NÃO foi alterado (regra absoluta)

- APIs, Prisma, RBAC, multi-tenant, MFA, auth  
- WhatsApp protocol / Evolution  
- Regras de IA, billing, planos, entitlements  

---

## Homologação recomendada (manual)

- [ ] 1920 / 1366 / 390 em Início, Conversas, Empresas, Configurações  
- [ ] Zoom 125% em 1366  
- [ ] Ctrl+F5 após deploy Docker web  
- [ ] MFA gate superadmin (se `SUPERADMIN_MFA_REQUIRED=1`)  

---

## Critério de “APROVADA”

Tela sem: copy de IA, enum cru visível, empty card pontilhado, erro técnico, header com descrição óbvia, CTA/banner de dica.
