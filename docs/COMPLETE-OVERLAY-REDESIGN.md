# Redesign completo de overlays — NexaFlow AI

**Atualizado:** 2026-07-16  
**Prompt mestre:** `C:\Users\luizo\OneDrive\Área de Trabalho\leia\leia.txt`  
**Inventário:** `docs/COMPLETE-OVERLAY-INVENTORY.md`

## Entrega final (métricas)

| Métrica | Valor |
|---------|------:|
| **TOTAL DE OVERLAYS ENCONTRADOS** | **50** |
| **TOTAL DE MODAIS** | **46** |
| **TOTAL DE DRAWERS** | **0** (sheet mobile) |
| **TOTAL DE WIZARDS** | **3** |
| **TOTAL DE CONFIRMAÇÕES** | **8** |
| **TOTAL DE DANGER DIALOGS** | **8** |
| **TOTAL DE SANDBOXES** | **1** |
| **TOTAL DE BUILDERS** | **1** |
| **TOTAL RECONSTRUÍDO** | **35+** (composição contextual) |
| **TOTAL REVISADO / PRESERVADO** | **50** inventariados |
| **TOTAL COMPILADO / DEPLOY** | Build Next + Docker no-cache |

---

## O que foi feito nesta execução (leia.txt)

### Design System
- `DateInput` primitivo (skin modal, color-scheme light/dark)
- CSS `.nf-date-input` em `globals.css`
- Footer sólido dark já consolidado (`#12151c !important`)

### Superadmin — composição individual
| Nome | Página | Antes | Depois | Mobile |
|------|--------|-------|--------|--------|
| Registrar pagamento | companies + tenant | CRUD | EntitySummary + Pagamento + DateInput + ref. mês pt-BR | sheet |
| Nova empresa | companies | grid misto | Empresa / Admin / Plano | sheet |
| Alterar plano | companies | só select | Plano atual + novo + **Impacto limites** (usuários/agentes/contatos) + alerta de overage | sheet |
| Alterar vencimento | companies | select solto | Atual/próximo + novo dia | sheet |
| Lifecycle (block/suspend/cancel) | companies | genérico | EntitySummary + ConsequenceBanner + motivo | sheet |
| Excluir empresa | companies + tenant | copy técnico | digite nome + impacto | sheet |
| Editar informações | tenant | bloco | Info / Contato / Localização | sheet |
| Editar plano catálogo | plans | flat | Info / Preço / Limites / Exibição | sheet |
| Detalhe auditoria | audit | JSON aberto | EntitySummary + detalhes técnicos em `<details>` | sheet |

### App — composição individual
| Nome | Página | Depois |
|------|--------|--------|
| Novo contato | contacts | Identificação + Comercial |
| Nova tarefa | tasks | Tarefa + **Prazo/Responsável** + Prioridade |
| Nova campanha | campaigns | Campanha + Mensagem |
| Nova oportunidade | crm | Contato resumo + Oportunidade + Funil |
| Convidar membro | team | Identidade + Papel (chips) |
| Criar/Editar agente | ai | Identidade + Comportamento/Instruções + Operação |
| Conhecimento write/edit | knowledge | Classificação + Conteúdo |
| Finalizar atendimento | inbox | Seção Encerramento, copy curta |
| MFA setup / desativar / senha | security | FormSection + FormField |
| Novo fluxo | automations | BUILDER: Quando → Então → Identificação |

### Preservados (identidade própria)
| Nome | Motivo |
|------|--------|
| Testar agente | SANDBOX chat |
| Import conhecimento | WIZARD multi-step |
| Wizard agente | WIZARD |
| WhatsApp QR | CONNECTION FLOW página |
| Onboarding | WIZARD página |

---

## Checklist global (leia)

| Critério | Status |
|----------|--------|
| Revisado individualmente no inventário | ✓ |
| Composição (contexto + seções) nos forms críticos | ✓ |
| Textos revisados (sem copy de implementação) | ✓ |
| Campos agrupados | ✓ |
| Select / MoneyInput / DateInput DS | ✓ |
| Sem spinner number nativo | ✓ (NumberInput) |
| Footer sólido dark (nunca branco) | ✓ |
| Scroll body / footer sticky | ✓ |
| Mobile sheet | ✓ |
| Performance (open condicional, initialFocus panel) | ✓ |
| Comparativo limites Alterar plano | ✓ (dados reais do catálogo) |

---

## Pendências conscientes

1. **DrawerShell lateral desktop** — não necessário; sheet mobile cobre o requisito de responsividade.
2. **QA visual manual** no browser após Ctrl+F5 (cada overlay open/scroll/footer).
3. **Campos CRM** “próxima ação / responsável” — API de oportunidade não expõe esses campos; UI não inventa.

---

## Como validar

1. Hard refresh **Ctrl+F5** em http://localhost:3000  
2. Superadmin → Empresas → Registrar pagamento / Alterar plano (impacto)  
3. App → Tarefas (prazo + responsável) / Inbox / Agentes / Conhecimento  
4. Dark mode → footer do modal **não branco**
