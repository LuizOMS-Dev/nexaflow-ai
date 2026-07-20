# Matriz de capacidades (AI Core)

| Capability | Significado |
|------------|-------------|
| TEXT | chat completion |
| STREAMING | stream (adapters OpenAI-compat; UI partial) |
| TOOLS | function calling no adapter |
| STRUCTURED_OUTPUT | `json_object` |
| VISION | imagens (OpenAI catalog) |
| EMBEDDINGS | vetores (OpenAI meta; retrieval produto ainda lexical) |
| PARALLEL_TOOL_CALLS | várias tools |
| REASONING | modelos reasoning (não listados dedicated) |

Consulta: `modelSupports(provider, modelId, cap)` em `catalog.ts`.

Se o fluxo exige TOOLS e o modelo não tem → `MODEL_CAPABILITY_NOT_SUPPORTED` (não executa como texto silencioso).

## Providers × capabilities (honestidade)

| Provider | Ready | Caps adapter/meta |
|----------|-------|-------------------|
| groq | yes | TEXT, STREAMING, TOOLS, STRUCTURED_OUTPUT |
| openai | yes | + VISION, EMBEDDINGS, PARALLEL_TOOL_CALLS |
| xai | yes | TEXT, STREAMING, TOOLS, STRUCTURED_OUTPUT |
| openrouter | yes | TEXT, STREAMING, TOOLS, STRUCTURED_OUTPUT |
| mistral | yes | TEXT, STREAMING, TOOLS, STRUCTURED_OUTPUT |
| anthropic | **no** | stub TEXT/STREAMING only |
| gemini | **no** | stub TEXT/STREAMING only |

## Nota produto

Retrieval de Knowledge **não** usa EMBEDDINGS ainda — score lexical (`scoreKnowledgeDoc`).  
Não declarar “vector RAG” na UI até existir pipeline de embeddings.
