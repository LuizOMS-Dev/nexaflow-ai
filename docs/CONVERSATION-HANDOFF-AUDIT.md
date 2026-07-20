# Auditoria — Notas internas, transferência e handoff IA→humano

**Data:** 2026-07-15  
**Escopo:** Inbox / Conversas / WhatsApp / IA (tenant)  
**Ação desta rodada:** apenas **AUDITORIA + DOCUMENTAÇÃO** (sem implementação).

---

## Resumo executivo

| Capacidade | Status | Onde |
|------------|--------|------|
| Notas internas (não vão ao WhatsApp) | **Existe e funciona** | `Message.direction = INTERNAL` + UI checkbox |
| Modelo `Note` separado | **Existe** (API + painel lateral) | `POST /conversations/:id/notes` |
| Atribuição de responsável | **Existe** | `Conversation.assignedToId` |
| Assumir atendimento | **Existe** | `POST /conversations/:id/assign` + botão Inbox |
| IA pausa quando humano assume | **Existe** | `maybeAutoReplyAi` se `assignedToId` |
| Handoff aviso ao cliente | **Existe** | `notifyHumanTakeover` (WhatsApp) |
| Continuidade da mesma conversa | **Existe** | Mesmo `conversationId` / contato |
| Transferência entre humanos (API) | **Parcial** | `PATCH assignedToId` / `assign` com `userId` |
| Transferência entre humanos (UI) | **Ausente** | Só “Assumir” (self) |
| Motivo de transferência | **Ausente** | — |
| Histórico estruturado de transferências | **Parcial** | Handoff no chat + audit genérico no PATCH; assign sem audit dedicado |
| Resumo automático no handoff | **Parcial** | `aiSummary` / “Sugerir resposta” sob demanda; não no clique Assumir |
| Devolver para IA | **Parcial** | Limpar `assignedToId` via API; sem botão UI; handoff flag no histórico bloqueia auto-reply |
| Notificação a quem recebe | **Existe** | In-app `CONVERSATION_ASSIGNED` no PATCH com outro user |
| @menções em notas | **Ausente** | Evolução futura |
| Fila / departamento | **Ausente** | Só `assignedToId` + filtro unassigned |
| Validação membership no assign | **Gap** | `userId` não validado como membro do tenant |

---

## 1. Notas internas

### Implementação principal (em uso na Inbox)

- **API:** `POST /conversations/:id/messages` com `{ content, isInternal: true }`
- **Persistência:** `Message` com `direction: INTERNAL`
- **WhatsApp:** ramo de envio só roda se `!isInternal` → **cliente não recebe**
- **UI:** checkbox “Nota interna (não envia ao cliente)” + bolha âmbar “Nota interna”
- **Autor / data:** `authorId` + `createdAt` na mensagem
- **Tenant:** conversa buscada com `tenantId` do JWT

### Modelo paralelo `Note`

- Schema: `Note { conversationId?, contactId?, authorId, content, createdAt }`
- API: `POST /conversations/:id/notes`
- GET conversa inclui `notes[]`
- UI lateral: lista se `conversation.notes?.length > 0`

**Observação:** há **dois canais** de nota (Message INTERNAL vs Note). O fluxo do dia a dia da Inbox usa **Message INTERNAL**. Não duplicar com um terceiro sistema.

### Privacidade / IA

| Canal | Nota INTERNAL |
|-------|----------------|
| WhatsApp / dispatch | Não enviada |
| Histórico da equipe | Sim |
| Auto-reply WhatsApp (`generateHumanWhatsAppReply`) | Transcrição inclui `Nota: …` **se a IA rodar** |
| Analyze / “Sugerir resposta” | Inclui `INTERNAL` no transcript |

Com humano assumido (`assignedToId` setado), auto-reply **não roda**. Risco residual: se IA voltar a responder com `assignedToId` null e notas no histórico, o modelo **vê** o texto da nota. **Recomendação futura:** filtrar `INTERNAL` do prompt de resposta ao cliente.

---

## 2. Atribuição e “Assumir”

### Schema

```
Conversation.assignedToId → User (relação AssignedAgent)
```

Um responsável principal por conversa (modelo atual).

### Assumir (humano)

| Camada | Comportamento |
|--------|----------------|
| UI | Botão **Assumir** → `POST /conversations/:id/assign` `{}` → `userId = self` |
| API assign | `assignedToId = userId`, `status = OPEN` |
| Side-effect | `notifyHumanTakeover` → mensagem OUTBOUND no WhatsApp + metadata `humanHandoff: true` |
| UI pós-assumir | Badge “Você assumiu · IA pausada” |
| Auto-assign | Primeira mensagem OUTBOUND real sem responsável também assume |

### Permissões (`permissions.ts`)

| Role | assign | reply | read |
|------|--------|-------|------|
| ADMIN | sim | sim | sim |
| SUPERVISOR | sim | sim | sim |
| AGENT | **não** `conversations.assign` | sim | sim (só suas + unassigned) |
| SALES | não assign | sim | sim |
| READONLY | não | não | sim |

**Nota:** AGENT não tem `conversations.assign`, mas ao **responder** sem responsável o backend auto-atribui. Assumir via botão exige permissão assign (ADMIN/SUPERVISOR) ou falha de permissão para AGENT.

---

## 3. IA pausa no handoff

`maybeAutoReplyAi` (WhatsApp):

1. Se `status` CLOSED/ARCHIVED → skip  
2. Se `assignedToId` → **skip** (“humano assumiu”)  
3. Se mensagem com `metadata.humanHandoff === true` no histórico → **skip**  
4. Revalida após delay de “digitando…”  
5. Se humano já mandou OUTBOUND recente → skip  

Modo do agente precisa ser `AUTO` para responder sozinho.

**Não existe enum** `ASSIGNED_TO_HUMAN` / `HUMAN_ACTIVE`. O equivalente operacional é:

- `assignedToId != null` + (opcional) `humanHandoff` no histórico  
- Status de conversa permanece `OPEN` | `PENDING` | `CLOSED` | `ARCHIVED`

**Não criar novos enums** — o modelo atual é suficiente.

---

## 4. Transferência / reatribuição

### O que existe

- **API:**  
  - `POST /conversations/:id/assign` com `{ userId }`  
  - `PATCH /conversations/:id` com `{ assignedToId }`  
- Mesma conversa, mesmo contato, mensagens preservadas  
- No **PATCH**, se outro usuário: notificação in-app `CONVERSATION_ASSIGNED`  
- Cliente pode receber novo `notifyHumanTakeover` se o assigned mudar  

### O que **não** existe (UI / produto)

- Botão **Transferir** com seletor de membro da equipe  
- Fila / departamento  
- Motivo de transferência obrigatório/opcional formal  
- Evento interno legível “Transferido de X para Y” na timeline (além de handoff ao cliente)  
- Validação: `userId` é membership ativo do **mesmo tenant**  

### Continuidade

Transferir (via API) **não** cria novo contato nem nova conversa. Histórico de mensagens permanece no mesmo `conversationId`.

---

## 5. Devolver para IA

- Tecnicamente: `assignedToId: null` via PATCH  
- Porém: presença de `humanHandoff` no histórico **continua bloqueando** auto-reply  
- Sem ação UI “Devolver para IA”  
- **Não implementar automaticamente** sem regra de produto (ex.: limpar flag handoff + confirmação explícita)

---

## 6. Resumo automático no handoff

| Mecanismo | Quando |
|-----------|--------|
| `Conversation.aiSummary` | Preenchido por `analyzeConversation` / insights |
| Painel “Sugerir resposta” | Sob demanda (resumo + reply sugerida) |
| Memory do contato | `contact.memory.summary` se existir |
| No clique **Assumir** | **Não** gera resumo automático dedicado |

Infra de IA **suporta** resumo; não está amarrada ao handoff.

---

## 7. Histórico de transferência

| Tipo | Existe? |
|------|---------|
| Mensagem ao cliente de handoff | Sim (`human_takeover`) |
| AuditLog em PATCH com mudança de status/assign | Parcial (`conversation.update` + metadata) |
| Audit em `POST .../assign` | **Não** observado |
| Timeline interna “de → para” | Não dedicada |
| Tabela TransferEvent | Não |

---

## 8. Notificação para quem recebe

- **In-app:** `createNotification` tipo `CONVERSATION_ASSIGNED` no PATCH para outro user  
- **Assign self:** não notifica a si  
- **E-mail/push:** não há infraestrutura dedicada neste fluxo  

---

## 9. Status de atendimento

```
enum ConversationStatus { OPEN, PENDING, CLOSED, ARCHIVED }
```

Filtros na Inbox usam esses estados. Handoff **não** muda para um status especial; usa atribuição.

---

## 10. Multi-tenant e RBAC

| Controle | Status |
|----------|--------|
| Rotas com `requireTenant` | Sim |
| Conversa scoped por `tenantId` | Sim |
| AGENT vê só suas + sem responsável | Sim |
| Assign só membership do tenant | **Gap** — falta assert membership |
| Cross-tenant assignment | Risco se `userId` de outro tenant for passado na API |
| READONLY não reply/assign | Sim |

---

## 11. Fluxo esperado (validado em código)

```
IA (AUTO, assignedToId null) atende no WhatsApp
    ↓
Cliente pede humano / equipe clica Assumir / responde
    ↓
assignedToId = humano
    ↓
notifyHumanTakeover (WhatsApp) + humanHandoff
    ↓
maybeAutoReplyAi → skip
    ↓
Humano vê histórico + dados do contato + aiSummary se houver
    ↓
Pode marcar “Nota interna” (não vai ao WhatsApp)
    ↓
Pode Finalizar / Reabrir / Arquivar
    ↓
Reatribuição entre humanos: API ok, UI de transferência ausente
```

---

## 12. Testes manuais recomendados (checklist)

| # | Teste | Resultado esperado (código) |
|---|--------|-----------------------------|
| 1 | Nota interna na Inbox | Mensagem INTERNAL no histórico |
| 2 | Cliente no WhatsApp | Não recebe a nota |
| 3 | Assumir | assignedToId = self; IA para; aviso no WhatsApp |
| 4 | Mensagem do cliente com humano | IA não auto-responde |
| 5 | PATCH assignedToId para colega | Mesma conversa; notificação in-app |
| 6 | Contato/conversa | Não duplicam |
| 7 | Finalizar / Reabrir | Status CLOSED/OPEN; histórico ok |
| 8 | Tenant B | Não vê conversa do tenant A |

*Esta auditoria não executou testes E2E no runtime; baseia-se em código e contratos de API.*

---

## 13. Pendências (prioridade, se for implementar depois)

1. **P0 segurança:** validar `userId` do assign no membership do tenant  
2. **P1 produto:** UI Transferir (membros do tenant + opcional motivo)  
3. **P1:** audit `conversation.assigned` / `conversation.transferred` com de/para  
4. **P2:** filtrar INTERNAL do prompt de resposta ao cliente  
5. **P2:** unificar UX Note model vs Message INTERNAL (ou documentar papéis)  
6. **P2:** “Devolver para IA” explícito com limpeza controlada de handoff  
7. **P3:** @menções; filas/departamentos; resumo auto no Assumir  

---

## 14. Decisão desta rodada

**NÃO implementar** funcionalidades novas: o núcleo (nota interna, assumir, pausa IA, continuidade, notificação de assign) **já existe e está coerente**.

Gaps são **refinos de produto/segurança**, não ausência total do sistema de atendimento.

**PRESERVAR** o fluxo atual. Implementar apenas itens P0/P1 sob pedido explícito.
