# WhatsApp — Homologação final do fluxo integrado

**Data:** 2026-07-15  
**Escopo:** validar, testar, corrigir bugs reais, documentar — **sem** reescrever o núcleo.

## Classificação final

```
READY_FOR_SINGLE_INSTANCE_PRODUCTION_HOMOLOGATION
```

**Condições atendidas no código e nos testes automatizados**, com ressalvas abaixo.

| Critério | Status |
|----------|--------|
| Volume persistente em Docker (`wa_sessions`) | Confirmado no compose |
| Volume persistente em dev local Windows | **Não** fixado via `WA_SESSIONS_DIR` no `.env` (usa path relativo ao cwd) |
| Restore on boot no código | Implementado |
| Logout sem loop no código | Implementado |
| Idempotência de envio | Corrigida nesta fase + testes unitários |
| Multi-réplica | **NÃO** pronta |
| Testes E2E com celular real (QR, mídia, logout no aparelho) | **Não executados neste ambiente** |

Não classificar como “100% pronto para produção multi-tenant enterprise”.

Arquitetura atual: **SINGLE_INSTANCE_READY** (Docker com volume `wa_sessions`).  
**Não** é `MULTI_INSTANCE_READY`.

---

## 1. Testes executados (reexecução real)

Comando:

```bash
cd apps/api
NODE_ENV=test VITEST=true DATABASE_URL_TEST=file:C:/nexaflow-data/test.db npx vitest run
```

| Resultado | Valor |
|-----------|-------|
| Test files | **13 passed** |
| Tests | **62 passed** |
| WhatsApp suite | **20** (connection-status, disconnect-classify, message-dispatch, auth-store) |
| API health (dev) | `status=ok` em `:4000` |

---

## 2. Fluxos validados

### Por código + testes (comprovado)

| Fluxo | Evidência | Resultado |
|-------|-----------|-----------|
| Status real ≠ canal no banco | `connection-status.test.ts` | **OK** |
| Logout / restartRequired / timeout | `disconnect-classify.test.ts` | **OK** |
| Opt-in campanha / reply / idempotência dispatch | `message-dispatch.test.ts` | **OK** |
| Auth store namespace + wipe | `auth-store.test.ts` | **OK** |
| Ingest idempotente por `externalId` | `ingestInboundMessage` | **OK** (código) |
| fromMe ignorado (loop guard) | baileys-manager + webhooks | **OK** (código) |
| Nota interna não envia WA | `isInternal` em conversations | **OK** (código) |
| Dispatch central em reply/IA/avisos | conversations + whatsapp/index | **OK** (código) |
| Restore on boot | `restore-sessions.ts` + `index.ts` | **OK** (código; skip em `NODE_ENV=test`) |
| UI sucesso CONNECTED | integrations + `WhatsAppConnectSuccess` | **OK** (código) |
| Banner some quando CONNECTED | whatsapp-status-banner exit | **OK** (código) |
| Fonte única status | GET `/whatsapp/status` + dashboard | **OK** (código) |

### Por ambiente real (celular / QR / rede) — **não executado aqui**

| Fluxo | Resultado |
|-------|-----------|
| QR lido + CONNECTED live | **NÃO EXECUTADO** (requer dispositivo) |
| Mensagem real inbound/outbound | **NÃO EXECUTADO** |
| Mídia (imagem/áudio/doc) | **NÃO EXECUTADO** (suporte parcial no código: caption/placeholder) |
| Restart API com sessão live + nova mensagem | **NÃO EXECUTADO** |
| Queda de rede real | **NÃO EXECUTADO** |
| Logout real no aparelho | **NÃO EXECUTADO** |
| Circuit breaker sob falha real | **NÃO EXECUTADO** (lógica presente) |
| Campanha E2E com opt-out | **NÃO EXECUTADO** (gate no dispatch) |
| IA SUGGEST / APPROVE / AUTO E2E | **NÃO EXECUTADO** (modos e guards no código) |
| Automação completa + debugger E2E | **NÃO EXECUTADO** |
| CRM a partir da conversa E2E | **NÃO EXECUTADO** |

---

## 3. Problemas encontrados

| # | Problema | Severidade | Fase |
|---|----------|------------|------|
| 1 | `idempotencyKey` de reply usava `Date.now()` — **anulava** idempotência | **Alta** | 16 |
| 2 | `ai-auto` idempotencyKey também usava `Date.now()` | **Média** | 8 / 16 |
| 3 | Dev local sem `WA_SESSIONS_DIR` fixo — sessão depende do cwd | **Alta (prod local)** | 19 |
| 4 | Compose Docker com Evolution default; `.env` local com Baileys — paths diferentes | Documentação | 19 |
| 5 | Mídia: ingest trata imagem/áudio como texto placeholder; envio de mídia completo não auditado | Residual | 5 |
| 6 | Delivery/read receipts (DELIVERED/READ) não mapeados de forma completa no produto | Residual | 4 |

---

## 4. Problemas corrigidos nesta homologação

| Correção | Arquivo | Classificação |
|----------|---------|---------------|
| Idempotência estável em reply (hash do conteúdo + conv + user; opcional client key) | `routes/conversations.ts` | **CORRIGIDO** |
| Idempotência estável em auto-reply IA | `services/whatsapp/index.ts` | **CORRIGIDO** |

Nenhuma reescrita de Baileys, reconexão, auth store ou status service.

---

## 5. Itens preservados

- Baileys 7.0.0-rc13 + connection manager  
- `useMultiFileAuthState` / `BaileysAuthStateStore` multifile  
- Circuit breaker + backoff + classificação disconnect  
- `getTenantWhatsAppStatus` / banner / dashboard KPIs  
- Dispatch + rate limit + opt-in campanha  
- Restore on boot  
- Animação de sucesso CONNECTED (fase UX anterior)  
- Notas internas, handoff, AUTO skip se humano assumiu  

---

## 6–8. Restart / logout / reconexão

| Cenário | Validação |
|---------|-----------|
| **Restart** | Código: `restoreBaileysSessionsOnBoot` + volume Docker `wa_sessions`. **Não** rodado restart live neste relatório. |
| **Logout real** | Código: `LOGGED_OUT`, wipe auth, alerta dedupe, sem reconnect loop. **Não** simulado no aparelho. |
| **Reconexão transitória** | Código: `shouldReconnect` + backoff + **não** apaga creds. **Não** simulada queda de rede real. |

---

## 9–13. Mensagens / mídia / IA / automações / CRM

| Área | Achado |
|------|--------|
| **Mensagens** | Ingest + dedupe `externalId`; reply via dispatch; WS `message.created`. |
| **Mídia** | Recebe placeholder de tipo; pipeline de mídia rica **não homologado**. |
| **IA** | AUTO com guards (fromMe, assignedToId, handoff, mode). SUGGEST/APPROVE dependem da UI/inbox — **não E2E**. |
| **Automações** | `AutomationRun` + debugger UI existentes; **não E2E** nesta fase. |
| **CRM** | Funil/kanban independentes; sem acoplamento indevido no ingest — **não E2E** conversa→oportunidade. |

---

## 14. Idempotência

| Camada | Comportamento |
|--------|----------------|
| Inbound | `externalId` único por conversa |
| Dispatch | cache TTL 15 min por key |
| Reply humano | **CORRIGIDO** (sem `Date.now`) |
| AI AUTO | **CORRIGIDO** (hash da resposta) |
| Teste unitário | 1 envio em 2 chamadas com mesma key — **passou** |

---

## 15. Status do volume persistente

### Docker Compose (confirmado)

```yaml
# apps/api service
volumes:
  - wa_sessions:/app/data/wa-sessions

volumes:
  wa_sessions:
```

- **Caminho no container:** `/app/data/wa-sessions`  
- **Volume nomeado:** `wa_sessions`  
- **Env em compose:** `WA_GATEWAY_PROVIDER: evolution` (sessões Evolution em outro volume; Baileys no path acima se provider=baileys)

### Dev Windows local (ambiente auditado)

- `.env`: `WA_GATEWAY_PROVIDER=baileys`  
- **Sem** `WA_SESSIONS_DIR`  
- Path efetivo: `sessionsRoot()` → `../../data/wa-sessions` a partir de `apps/api` **ou** `data/wa-sessions` do cwd  
- **Risco:** se a API for iniciada com cwd diferente, as sessões podem “sumir” e forçar novo QR  

**Classificação volume local:**  
- Docker com `wa_sessions`: **adequado para single-instance**  
- Dev ad-hoc sem path fixo: **BLOQUEADOR se tratado como produção**

### Backup recomendado

- Snapshot do volume `wa_sessions` (ou pasta multifile)  
- **Nunca** versionar `creds.json` / keys no git  
- Restaurar volume antes de subir a API após migrate de host  

### Permissões

- Processo da API precisa de **leitura/escrita** no diretório de sessões  
- Não expor o diretório via HTTP/static  

---

## 16. Riscos residuais

1. **Single-instance only** — sem lock distribuído / auth centralizado  
2. **Idempotência dispatch em memória** — perde cache no restart da API (retry após restart pode reenviar)  
3. **Mídia** incompleta  
4. **Receipts** DELIVERED/READ limitados  
5. **Homologação com dispositivo real** ainda obrigatória antes de go-live comercial  
6. **Compose default Evolution** vs **dev Baileys** — alinhar provider no deploy  

---

## 17. Classificação por item (PRESERVADO / CORRIGIDO / IMPLEMENTADO)

| Item | Classificação |
|------|----------------|
| Núcleo conexão / reconexão / circuit breaker | **PRESERVADO** |
| Status real + dashboard/saúde/banner | **PRESERVADO** |
| Restore / auth multifile / alertas | **PRESERVADO** |
| Testes automatizados 62 | **PRESERVADO** (reexecutados) |
| Idempotência reply + AI AUTO | **CORRIGIDO** |
| Documento de homologação | **IMPLEMENTADO** |

---

## Checklist de go-live single-instance (humano)

Antes de produção:

- [ ] Confirmar volume `wa_sessions` montado e com backup  
- [ ] Confirmar `WA_GATEWAY_PROVIDER` do ambiente (baileys vs evolution)  
- [ ] Teste real: conectar QR → mensagem in → reply out  
- [ ] Teste real: restart API → continua CONNECTED sem QR  
- [ ] Teste real: logout no celular → LOGGED_OUT + 1 notificação  
- [ ] Teste real: AUTO não loopa; nota interna não sai no WA  

---

## Conclusão

O **núcleo técnico WhatsApp está homologado em nível de código e testes unitários/integrados de segurança**, com **um bug crítico de idempotência corrigido** nesta fase.

A classificação honesta é:

**READY_FOR_SINGLE_INSTANCE_PRODUCTION_HOMOLOGATION**

— pronta para **homologação operacional single-instance** com volume persistente e checklist humano de dispositivo real.  

**Não** está pronta para multi-réplica nem para afirmação de “100% E2E validado com WhatsApp real” neste relatório.
