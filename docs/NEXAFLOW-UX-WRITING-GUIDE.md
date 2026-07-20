# NexaFlow — Guia de UX Writing

Tom e regras de linguagem da interface (painel operacional e Superadmin).

## Tom

| Sim | Não |
|-----|-----|
| Direto, natural, profissional | Robótico / “escrito por IA” |
| Objetivo e curto | Parágrafos explicativos |
| Humano e seguro | Promocional ou hype |
| Claro no contexto da tela | Documentação embutida |

**Regra de ouro:** o usuário precisa ler isso para usar a NexaFlow?  
Se **não** → **remover**. Nem sempre substituir.

## Princípios

1. Menos texto, mais clareza  
2. Não explicar o óbvio  
3. Sem marketing no painel  
4. Informação no momento da ação  
5. Uma ideia por frase  

## Vocabulário oficial

| Preferir | Evitar na UI |
|----------|----------------|
| Empresa | Tenant, workspace, organização (salvo nome legal) |
| Atendimento / Conversas | Ticket, sessão |
| Finalizar atendimento | Encerrar chat, fechar ticket |
| Agente / Agente de IA | Bot genérico em excesso |
| Contato | Lead (exceto funil/CRM) |
| Plano | Catálogo (exceto edição admin de lista) |
| Superadministrador | SUPERADMIN cru |

## Por elemento

| Elemento | Regra |
|----------|--------|
| Título | Nome da área. Sem slogan. |
| Subtítulo | Só se agregar valor; senão omitir. |
| Label | Nome do campo. |
| Helper | Só regra não óbvia. |
| Placeholder | Exemplo opcional (`Ex.: Maria`). Não repetir label. |
| Empty state | `Nenhum X` + CTA se útil. Sem parágrafo. |
| Erro | O que falhou + o que fazer. |
| Sucesso | Curto: `Alterações salvas.` |
| Botão | Verbo + objeto: `Criar empresa`. |
| Confirmação | Direta + impacto real. |
| Tooltip | Só se não for óbvio. |
| Banner | Só estado importante + ação. |

## Status (apresentação)

| Interno | UI |
|---------|-----|
| ACTIVE | Ativa |
| TRIAL | Trial |
| SUSPENDED | Suspensa |
| BLOCKED | Bloqueada |
| CANCELLED | Cancelada |
| PENDING_DELETION | Exclusão agendada |
| OVERDUE / PAST_DUE | Pagamento em atraso |
| IN_GOOD_STANDING | Pagamento em dia |
| SUPERADMIN | Superadministrador |
| AGENT | Atendente |
| READONLY | Somente leitura |

Não alterar valores de API — só labels.

## Frases a evitar (salvo exceção)

- “Esta área permite…” / “Aqui você pode…” / “Use esta seção…”
- “Potencialize / Transforme / Otimize…”
- “De forma simples e eficiente…”
- Explicações de implementação (tenant, RAG, Redis, cotas vs faturamento)

## Checklist rápido

- [ ] Parece escrito por humano de produto?  
- [ ] Dá para remover sem perder clareza?  
- [ ] Termo consistente?  
- [ ] Zero enum/código cru?  
- [ ] Zero promo no painel?  
