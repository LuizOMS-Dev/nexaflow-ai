# Handoff / Fila / Assumir — certificação final

**Data:** 2026-07-17  
**Fonte:** `leia/leia.txt` — motor central IA ↔ humano  
**Veredito:** `HANDOFF_STAGING_READY` (candidato a PRODUCTION_CANDIDATE após E2E WhatsApp real + race assume live)

---

## STATUS POR ÁREA

### PRESERVADO
- Modelo `Conversation` (`OPEN` | `PENDING` | `CLOSED` | `ARCHIVED`) + `assignedToId`
- Motor único `handoffToHumanQueue` + `matchHandoffTriggers` (todos os agentes)
- Tool `request_human` / `transfer_conversation` → mesmo motor
- IA pausa em `assignedToId` e fila `PENDING` / flags `waitingHuman`
- Resume-guard (acks não reassumem IA)
- Banner global + dismiss só visual
- Badge/contagem real (waiting-human)
- WebSocket `conversation.updated` / `notification.created`
- Multi-tenant por `tenantId` em todas as queries
- Config handoff por agente (`transferRules`)
- Encerramento / reopen / CSAT existentes

### CORRIGIDO / REFINADO (esta rodada)
| Item | Antes | Depois |
|------|-------|--------|
| **Assumir atômico** | `update` simples (race) | `assumeConversationAtomic` + `updateMany` onde `assignedToId=null` |
| **Já assumido** | Sobrescrevia | 409 `ALREADY_ASSUMED` com nome |
| **Membership no assign** | Não validava | Valida membro AGENT/ADMIN/SUPERVISOR ativo |
| **Retomar IA** | Só config resume-on-return | `POST /conversations/:id/resume-ai` + botão UI |
| **Transferir humano** | PATCH frágil | `transferConversationToUser` (membership + timeline + notify) |
| **Ordem da fila** | Mais recentes primeiro | **FIFO** (`lastMessageAt asc`) |
| **CTA banner** | “Assumir chat” só navegava | **“Abrir conversa”** / “Ver atendimentos” |
| **Auto-close na fila** | PENDING podia fechar | Blockers `waiting_human` + `human_active` |
| **Resumo handoff** | Ausente | Brief das últimas mensagens (sem inventar) |
| **Primeira reply assume** | Update não-atômico | Usa `assumeConversationAtomic` |

### IMPLEMENTADO (núcleo operacional)
1. Detecção handoff (regras + tool + tom da IA)  
2. Fila PENDING + notificações in-app  
3. Assumir atômico + timeline `human_takeover`  
4. IA silenciada (WhatsApp AUTO) com humano/fila  
5. Retomar IA explícita  
6. Transferência entre humanos  
7. Dismiss banner ≠ cancela handoff  
8. Idempotência de notice (~8 min dedupe)

### PENDENTE (não PRODUCTION_READY)
| Item | Motivo |
|------|--------|
| Departamentos / equipes formais | Só destino string + roles; sem modelo Department |
| Transfer UI picker de usuários | API pronta; UI só Assumir self + Retomar IA |
| Handoff summary via LLM | Brief factual; sem resumo narrativo de LLM |
| Browser push / e-mail handoff | Fora de escopo (leia §47) |
| E2E WhatsApp real + race 2 users | Ops |
| Sandbox handoff isolado | Simula via tools; sem fila real (OK) |

---

## MAPA DE ESTADOS (equivalência leia)

| Conceito leia | NexaFlow |
|---------------|----------|
| AI_ACTIVE | `OPEN` + `assignedToId=null` + sem waiting flags |
| WAITING_HUMAN | `PENDING` + `assignedToId=null` + notice `requiresAssume` |
| HUMAN_ACTIVE | `OPEN` + `assignedToId` set |
| AI_PAUSED | HUMAN_ACTIVE ou WAITING_HUMAN (backend skip AUTO) |
| RESOLVED/CLOSED | `CLOSED` / `ARCHIVED` |

**Responsável atual (fonte de verdade):**  
`Conversation.assignedToId` (humano) **ou** IA implícita se `null` e não PENDING.

---

## API

| Método | Rota | Função |
|--------|------|--------|
| GET | `/conversations/waiting-human` | Fila Assumir (FIFO) |
| POST | `/conversations/:id/assign` | Assumir self / transferir `{userId}` / fila `{userId:null}` |
| POST | `/conversations/:id/resume-ai` | Devolver para IA |
| PATCH | `/conversations/:id` | Status / favorito / close |

Motor: `apps/api/src/services/human-handoff.ts`

---

## UI

| Superfície | Comportamento |
|------------|----------------|
| Banner | 1 → Abrir conversa; N → Ver atendimentos; X só dismiss |
| Inbox header | Assumir · Você·IA pausada · **Retomar IA** · Aguardando |
| Timeline | takeover / transfer / resume / handoff brief |
| Dashboard prioridade | Mesmos CTAs honestos |

---

## TESTES

```bash
npx vitest run apps/api/src/services/human-handoff.test.ts apps/api/src/services/whatsapp/resume-guard.test.ts
```

Cobertura unitária: triggers + resume-guard.  
Atomic assume / transfer: integração via código + rebuild; race live pendente.

---

## CLASSIFICAÇÃO

### `HANDOFF_STAGING_READY`

Critérios PRODUCTION_READY do leia **ainda abertos**: E2E WhatsApp completo, race assume com 2 browsers, transfer UI, multi-tenant handoff live formal.

**0 CRITICAL** residual no motor (pausa IA + assume atômico + fila real).  
**HIGH residual:** falta homologação operacional live.

---

## Resposta à pergunta do leia

> “QUEM ESTÁ RESPONSÁVEL POR ESTA CONVERSA AGORA?”

| Estado | Resposta |
|--------|----------|
| OPEN sem assigned | Agente de IA do tenant (modo configurado) |
| PENDING sem assigned | Ninguém — **fila humana** (IA pausada) |
| assignedToId set | Esse usuário (IA pausada) |
| CLOSED | Encerrado (histórico) |
