# Importação inteligente em lote — Base de Conhecimento

**Data:** 2026-07-15  
**Escopo:** importar um arquivo texto, separar assuntos, revisar e publicar na base da **empresa**.

## PRESERVADO

| Item | Detalhe |
|------|---------|
| `KnowledgeDoc` / `KnowledgeChunk` | Schema e CRUD existentes |
| Base **por tenant** | `tenantId` da sessão; IA carrega docs `published` da empresa |
| Chunks simples | Split por parágrafos (`\n\n`), sem embeddings obrigatórios |
| RBAC | `ai.manage` + ADMIN/SUPERVISOR para escrita |
| UI manual | Escrever título/categoria/conteúdo |
| Uso pelos agentes | Todos os agentes ativos da empresa consultam a mesma base |

## IMPLEMENTADO

| Item | Detalhe |
|------|---------|
| Análise de arquivo | `POST /knowledge/import/analyze` |
| Confirmação | `POST /knowledge/import/confirm` |
| Modelo de arquivo | `GET /knowledge/import/sample` |
| Parser estruturado | Headings `#` / `##` / `###` |
| Parser heurístico | Blocos por linhas em branco |
| Refino opcional com IA | Melhora títulos/categorias **sem inventar fatos** |
| Revisão obrigatória | Nada é publicado sem confirmar |
| Duplicidade | Aviso + Manter / Criar novo / Substituir |
| Conflitos de horário | Aviso no item |
| Secrets | Bloqueio de trechos com API keys/tokens/senhas |
| UI wizard | Conhecimento → Importar arquivo |
| Metadados de origem | `sourceType=import`, `sourceUrl=filename`, chunk `metadata` |

## NÃO IMPLEMENTADO (de propósito)

| Item | Motivo |
|------|--------|
| PDF / DOCX | Sem parser confiável no stack atual |
| “Mesclar” conteúdos | Risco de corromper texto; não seguro |
| Vínculo físico agente↔doc | Arquitetura atual é **base da empresa** (todos os agentes) |
| Vector DB / embeddings reais | Pipeline atual é chunk simples; não recriamos RAG paralelo |
| Porcentagem de progresso inventada | Só estados reais: enviando/analisando/revisão/pronto |

---

## Formatos suportados de verdade

| Formato | Status |
|---------|--------|
| `.txt` | **Sim** |
| `.md` / `.markdown` | **Sim** |
| `.pdf` / `.docx` | **Não** |

Limite prático: ~400 KB no browser; ~120k caracteres na análise.

---

## Como a IA (e o parser) separam os conhecimentos

1. **Estruturado (prioridade):** se o arquivo tem títulos Markdown (`# HORÁRIOS`, `## PAGAMENTOS`…), cada seção vira um conhecimento.
2. **Heurístico:** blocos separados por linha em branco; primeira linha pode virar título.
3. **IA (opcional):** se houver provedor configurado (Groq/etc.), refina **títulos e categorias** a partir do texto já extraído.  
   **Regra:** não inventa preços, horários, produtos ou políticas.

---

## Fluxo

```
Arquivo .txt/.md
  → Upload (cliente lê o texto)
  → POST /knowledge/import/analyze
  → Pré-visualização (checklist + editar/remover)
  → Usuário escolhe itens e resolve duplicatas
  → POST /knowledge/import/confirm
  → KnowledgeDoc + KnowledgeChunk (tenant da sessão)
  → status published → agentes usam na próxima resposta
```

**Nada é publicado silenciosamente.**

---

## Revisão

Na tela de revisão o usuário pode:

- marcar/desmarcar itens  
- editar título, categoria e conteúdo  
- remover da importação  
- em duplicata: **Manter existente** | **Criar novo** | **Substituir**

---

## Vínculo com agentes

- Conhecimento pertence à **empresa** (`tenantId`).
- Todos os agentes ativos da empresa leem docs `status=published`.
- A UI permite indicar “Todos os agentes” ou listar agentes (metadado em chunks: `agentIds` / `general`).
- **Não** há tabela de vínculo agente–doc e **não** filtramos por agente na IA ainda (evita sistema paralelo).

---

## Duplicidades e conflitos

| Caso | Comportamento |
|------|----------------|
| Título/conteúdo parecido com doc existente | Aviso + escolha do usuário |
| Horários conflitantes no arquivo | Aviso no item; usuário revisa |
| Secrets (api_key, sk-, gsk_, private key…) | Item **bloqueado** |

---

## Multi-tenant e RBAC

- `tenantId` **somente** de `request.user.tenantId` (sessão).
- Analyze/confirm: `requireTenant` + `ai.manage` + papel ADMIN/SUPERVISOR (ou SUPERADMIN em impersonação).
- Agentes enviados em `agentIds` são validados: devem existir no mesmo `tenantId`.

---

## Origem e auditoria

- `sourceType`: `import`
- `sourceUrl`: nome do arquivo
- Chunk metadata: `origin`, `filename`, `importedAt`, `importedBy`
- Audit log: `knowledge.import`

---

## Endpoints

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/knowledge/import/sample` | Modelo Markdown |
| POST | `/knowledge/import/analyze` | `{ text, filename, useAi? }` → rascunhos |
| POST | `/knowledge/import/confirm` | `{ filename, items[], agentIds?, general? }` → cria/atualiza |

CRUD existente:

- `GET/POST /knowledge`
- `PATCH/DELETE /knowledge/:id`

---

## Erros tratados

Arquivo vazio, formato inválido, arquivo grande, falha de análise, item sensível, agente de outro tenant, sem permissão, lista vazia na confirmação.

---

## Exemplo de arquivo

Ver modelo baixável na UI (**Baixar modelo**) ou `IMPORT_SAMPLE_MD` em `apps/api/src/services/knowledge-import.ts`.
