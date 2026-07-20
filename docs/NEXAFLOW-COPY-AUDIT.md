# NexaFlow — Auditoria de Copy (UX Writing)

**Fonte do pedido:** `Área de Trabalho/leia/leia.txt`  
**Data:** 2026-07-16  
**Escopo:** textos visíveis no frontend (`apps/web`)

## Método

1. Varredura de strings em pages, modals, empty states, toasts, headers  
2. Critério: *“UX Writing profissional manteria isso?”*  
3. Prioridade: **remover** → reescrever → humanizar → padronizar → preservar  
4. Sem mudança de backend/API/enums internos  

## Páginas auditadas

### Superadmin
Visão geral, Empresas, Detalhe empresa, Financeiro, Planos, Usuários, Auditoria, shell  

### App
Início, Conversas, Contatos, CRM, Tarefas, Equipe, Agentes, Conhecimento, Fluxos, Campanhas, WhatsApp, Configurações, Relatórios, Minha conta, Preferências, Segurança, Sessões, Brand, Onboarding, Login  

## TEXTOS REMOVIDOS (amostra desta passagem + anteriores)

| Onde | Removido / cortado |
|------|---------------------|
| Empresas header | “Empresas clientes da plataforma.” |
| Financeiro header | “Receita das assinaturas…” |
| Planos header | “Preços e limites disponíveis…” |
| Conhecimento / WhatsApp headers | subtítulos |
| Empty agentes / fluxos / equipe / sessões | parágrafos extras |
| Inbox WhatsApp empty | dica óbvia |
| Fluxos builder | hints “Gatilho…” / “modelo inicial” |
| Uso / empresa (antes) | explicações de cotas e implementação |
| Configurações | “Gerencie…” genéricos |
| Login showcase | copy promocional longa |

## TEXTOS REESCRITOS

| Antes (resumo) | Depois |
|----------------|--------|
| Teste sandbox sem efeitos… | Sem envio a clientes. |
| Recomendamos testá-lo pelo card… | Teste antes de respostas automáticas. |
| Conta global do usuário preservada | Conta do usuário preservada. |
| Impersonação texto longo | Ações registradas; Administração bloqueada durante o acesso. |
| Import: revisamos tudo antes… | Arquivo .txt ou .md |
| Meta layout | Atendimento, CRM e IA |

## DICAS DESNECESSÁRIAS REMOVIDAS

- Empty states com “use os filtros…” / “escreva ou importe…”  
- Helpers óbvios em builders de fluxo  
- Subtítulos de página que só repetiam o título  

## TERMOS TÉCNICOS HUMANIZADOS

| Interno | UI |
|---------|-----|
| tenant (em hints) | empresa |
| PENDING_DELETION (copy) | agenda exclusão / digite o nome |
| sandbox (toast) | sem envio a clientes |
| SUPERADMIN (badge) | Superadministrador |
| ACTIVE etc. | Ativa / Suspensa / … |

## TERMOS PADRONIZADOS

- Empresa · Conversas · Finalizar atendimento · Agente · Plano · Superadministrador  
- Empty: `Nenhum X` + CTA  
- Sucesso: `Alterações salvas.` / `X criado.`  
- Erro: `Não foi possível …`  

## Contagens (estimativa consolidada)

| Métrica | Valor |
|---------|------:|
| **TOTAL DE TEXTOS AUDITADOS** | ~480 |
| **TEXTOS PRESERVADOS** | ~300 |
| **TEXTOS REMOVIDOS** | ~110 |
| **TEXTOS REESCRITOS** | ~70 |
| **DICAS REMOVIDAS** | ~35 |
| **TERMOS TÉCNICOS HUMANIZADOS** | ~15 |
| **TERMOS PADRONIZADOS** | ~15 |
| **PÁGINAS AUDITADAS** | ~30 |

## Checklist final

- [x] Textos “de IA” principais removidos/reescritos  
- [x] Dicas óbvias cortadas  
- [x] Sem explicação de implementação nos headers/empty principais  
- [x] Enums não expostos crus nas áreas tocadas  
- [x] Subtítulos redundantes removidos  
- [x] Erros/sucessos curtos  
- [x] Empty states objetivos  
- [x] Guia em `docs/NEXAFLOW-UX-WRITING-GUIDE.md`  

## Confirmação

A interface principal (Superadmin + app + login/onboarding) foi revisada no contexto das telas.  
Alguns toasts de API (`res.message`) e textos dinâmicos do backend podem ainda variar — apresentação local foi alinhada ao guia.
