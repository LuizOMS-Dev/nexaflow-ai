# Knowledge, retrieval e RAG

Como o NexaFlow monta contexto para o agente. Não substitui o código.

## Ingestão

1. Upload (PDF, TXT, Markdown) ou texto manual.
2. Validação: MIME, extensão, tamanho (10 MB), filename seguro, tenant.
3. Extração de texto. PDF sem texto extraível falha com mensagem clara (sem OCR).
4. Chunking por títulos, parágrafos, listas e FAQ.
5. Indexação lexical imediata (`status=ready`).
6. Embeddings em seguida, se um provider estiver configurado. Falha de embedding **não** derruba o documento: a busca lexical continua.

Estados: `queued` → `processing` → `ready` | `failed`.

## Providers

| Papel | Quem |
|-------|------|
| Geração de resposta | Groq (padrão), xAI ou OpenAI |
| Embeddings | Provider **separado** (`EMBEDDING_*`). Groq não gera vetores neste produto |

Sem `EMBEDDING_API_KEY` / `EMBEDDING_PROVIDER`, não há busca vetorial. Isso é intencional.

## Retrieval híbrido

```
query → lexical nos chunks do tenant
      → vector nos chunks com o mesmo embeddingModel (se houver)
      → ranking (lexical + semântico)
      → threshold
      → chunks selecionados
```

Abaixo do limiar o agente **não inventa**: informa que não há fato confirmado e pode oferecer humano.

Knowledge recuperado entra no prompt como **dado**, não como instrução.

## Memória e execução

- `ContactMemory`: perfil do contato.
- `Conversation.memorySummary`: resumo incremental daquele atendimento.
- `AiExecution`: latência, tokens, custo estimado, retrieval, `correlationId`. Sem prompt completo e sem secrets.

## Vector storage

O Postgres oficial (imagem `postgres:16-alpine` e o Postgres nativo do EasyPanel) **não tem pgvector**. Vetores ficam em `KnowledgeChunk.embedding` (JSON), filtrados por `tenantId` via o documento pai.

Para habilitar pgvector no futuro: imagem `pgvector/pgvector:pg16`, `CREATE EXTENSION vector`, índice HNSW. Sem essa infra, não declare pgvector como pronto.

## Isolamento

Toda recuperação filtra `tenantId`. Testes cobrem Tenant A vs Tenant B.
