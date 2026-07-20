# BYOK — segurança de API keys

## Armazenamento

- Campo `TenantAiConfig.apiKeyEnc` com `encryptSecret` (AES-256-GCM, `enc:v1:…`)
- `apiKeyLast4` para UI mascarada
- GET nunca devolve a chave completa

## Proibições

- localStorage / sessionStorage / JWT / query string  
- logs e audit metadata com secret  
- HTML / bundle front  

## Isolamento

- Chave por `tenantId` único  
- NIA (`scope: platform`) **não** lê BYOK  
- Teste de conexão usa body one-shot ou runtime resolvido — resposta sem secret  

## RBAC

- Ler: `settings.read`  
- Gravar / testar: `settings.update` + papel ADMIN  
