# NIA — Account Tools (diagnóstico seguro da conta)

A NIA pode **consultar dados reais da conta da sessão** para diagnosticar e orientar a solução, com **allowlist** e blindagem anti-engenharia reversa.

## O que ela pode ver (sessão atual)

| Área | Dados |
|------|--------|
| Conta | primeiro nome, e-mail mascarado, papel, status, MFA on/off, nº de sessões |
| Empresa | status, plano, features, limites, seats |
| Access Gate | level, code, pausa operacional, mensagem pública |
| WhatsApp | status canônico + texto humano |
| Agentes | nome, modo, ativo (sem system prompt do agente) |
| Knowledge | **contagens** por status — **sem conteúdo comercial** |
| Inbox | conversas abertas + fila humana (PENDING sem assignee) |

## O que ela **não** pode

- Outro tenant / userId inventado na mensagem  
- Secrets, API keys, JWT, TOTP, recovery codes, password hash  
- Dump JSON/schema interno / lista de tools  
- Mutar conta (reconectar WA, alterar plano, excluir, enviar campanha)  
- Ler Knowledge comercial da empresa  

## Como funciona

1. Backend monta `SecureAccountDiagnostic` com `userId` + `tenantId` **só da sessão**.  
2. Intent da mensagem escolhe *probes* allowlisted (não amplia superfície).  
3. Gera `findings` + narrativa para o modelo.  
4. NIA responde em linguagem humana e pode sugerir navegação allowlisted.  
5. Saída passa por `redactSecretsFromOutput` (+ redaction de IDs/diagnóstico bruto).  

Código: `apps/api/src/services/nexaflow-assistant/nia-account-tools.ts`  
Segurança: `nia-security.ts` (`reverse_engineering`, `data_exfiltration`, `session_spoofing`)

## Política de “resolver”

- **Sim:** identificar causa com dados reais e guiar o passo exato.  
- **Não:** afirmar que executou a correção sem mutação real.  

## Segurança

| Camada | Proteção |
|--------|----------|
| Sessão | IDs só do JWT/auth; spoofing na mensagem bloqueado |
| Allowlist | Campos fixos no código |
| Detecção | injection, secrets, reverse eng., dump, cross-tenant |
| Saída | redaction de secrets e IDs |
| Rate limit | chat `/assistant/chat` |
| Audit soft | probes + findingIds no metadata da mensagem (sem PII sensível) |
