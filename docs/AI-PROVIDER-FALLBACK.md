# Fallback

Runtime pode definir `fallbackProvider` + `fallbackModel`.

Gateway tenta o primário; em rate limit / provider error:

- Se BYOK e fallback é **outro** provider → **não** reutiliza a chave (segurança).
- Se mesmo provider ou platform_managed → tenta fallback.

Evita execução duplicada de tools: fallback só no generate de texto do adapter; tools continuam no runtime NexaFlow após normalização.
