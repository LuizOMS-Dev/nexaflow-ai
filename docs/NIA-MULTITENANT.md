# NIA — Multi-tenant

- Threads: `userId` + `tenantId` da sessão
- Troca de empresa no frontend limpa histórico local e queries
- Snapshot operacional só do tenant da sessão
- Impersonation: `IMPERSONATION=true`, sem mutações, sem preferências do cliente
