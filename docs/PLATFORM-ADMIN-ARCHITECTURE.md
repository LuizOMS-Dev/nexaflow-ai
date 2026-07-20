# Arquitetura — Administração da Plataforma NexaFlow

**Escopo:** central de gestão global da NexaFlow (não painel de empresa cliente).  
**Data:** 2026-07-15 (refino final: preços únicos, métricas, auditoria legível, trust proxy)

## Fonte única de planos

- DB `Plan` + seed `packages/db/src/official-plans.ts`
- Visão Geral, Financeiro e Planos consomem a **mesma** API/DB
- Preços legados 97/297/997 removidos de factory-reset, prompts de agente e showcase

---

## 1. Roles permitidas

| Role | Acesso a `/admin` e APIs `/admin/*` |
|------|-------------------------------------|
| `platformRole === SUPERADMIN` | Sim (com MFA de superadmin quando exigido) |
| Role de membership do tenant (`ADMIN`, `SUPERVISOR`, etc.) | **Não** |
| Durante impersonação (`imp` no JWT) | **Não** — deve encerrar impersonação |

Middleware central: `app.requireSuperadmin` em **todas** as rotas registradas em `adminRoutes`.

---

## 2. Rotas frontend protegidas

| Rota | Função |
|------|--------|
| `/admin` | Visão geral da plataforma |
| `/admin/companies` | Lista / criação de empresas |
| `/admin/tenants/[id]` | Detalhe da empresa |
| `/admin/users` | Usuários globais |
| `/admin/finance` | Financeiro (receita estimada) |
| `/admin/plans` | Planos e limites |
| `/admin/audit` | Auditoria |

- Item **Administração** na sidebar: só se `platformRole === SUPERADMIN` **e** sem impersonação.
- `AdminShell`: bloqueia render se não for SUPERADMIN ou se impersonação ativa.
- Banner WhatsApp de tenant: **não** é exibido em `/admin/*`.

---

## 3. APIs protegidas

Todas sob `requireSuperadmin` (hook no `adminRoutes`):

- `GET /admin/overview`
- `GET|POST /admin/tenants`, `GET|PATCH|DELETE /admin/tenants/:id`
- memberships admin
- `GET|POST|PATCH /admin/plans`
- `GET /admin/users`
- `GET /admin/logs`
- `POST /admin/impersonate` (+ step-up MFA)
- `POST /admin/stop-impersonation` (rota separada)
- `GET /admin/settings`

Cliente tenant que chamar essas rotas recebe **403**.

---

## 4. Estrutura administrativa

```
ADMINISTRAÇÃO
  Visão geral
  Empresas
  Usuários
  Financeiro
  Planos

CONTROLE
  Auditoria
```

Módulos planejados (sem UI falsa se não houver dados): IA global, Canais, Infraestrutura, Segurança avançada, Custos, Configurações da plataforma.

---

## 5. Métricas disponíveis (reais)

| Métrica | Fonte |
|---------|--------|
| Empresas (total / ACTIVE / TRIAL / SUSPENDED) | `Tenant.status` |
| Usuários | `User.count` (exclui fixtures de teste) |
| Conversas / Mensagens | contagens globais |
| Planos e empresas por plano | `Plan` + tenants |
| **MRR estimado** | Σ `priceMonthly` × tenants **ACTIVE** com plano |
| **ARR estimado** | MRR × 12 |
| Ticket médio | MRR / assinaturas pagas |
| Alertas | suspensas, trials, erros em audit |

---

## 6. Métricas indisponíveis (não inventadas)

- Lucro / margem (custos não cadastrados)
- Despesas de infra / IA / mensageria
- Churn real de billing (sem histórico de cancelamento pago)
- Inadimplência de gateway de pagamento
- Tokens de IA / latência agregada (sem telemetria)
- Gráficos temporais de receita sem série histórica

UI exibe: **“Lucro indisponível — custos da plataforma ainda não cadastrados.”**

---

## 7. Regras financeiras

| Conceito | Definição |
|----------|-----------|
| **Receita (MRR estimado)** | Soma dos preços mensais dos planos das empresas ACTIVE |
| **Custos** | Ainda não modelados |
| **Lucro** | Receita − Custos — **não exibido** sem custos |

Nunca chamar MRR/receita de “lucro”.

---

## 8. Impersonação

- Só SUPERADMIN + MFA + step-up recente.
- Durante imp: bloqueio de `/admin` (API e UI).
- Banner de impersonação no shell; fim via `stop-impersonation`.
- Auditado.

---

## 9. Separação de contextos

| Área | Contexto |
|------|----------|
| `/app/*` Configurações | Empresa (tenant) |
| `/admin/*` | Plataforma NexaFlow |
| Banner “WhatsApp desconectado” | Só tenant (`/app`), nunca admin global |

---

## 10. Evolução

1. Cadastro de custos da plataforma → lucro real  
2. Billing/assinaturas com ciclo e gateway  
3. Uso agregado IA/canais com health real  
4. Feature flags / config global  
