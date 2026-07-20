# NexaFlow AI — Arquitetura de Segurança (Auth & Multi-tenant)

Documento de referência da primeira entrega de segurança.  
**Status:** arquitetura aprovada para implementação incremental.

---

## 1. Arquitetura de autenticação escolhida

**Access token JWT de curta duração (15 min) + Refresh token rotativo em cookie HttpOnly.**

| Peça | Onde | Vida |
|------|------|------|
| Access JWT | memória do client (não localStorage) + opcional header Authorization | 15 min |
| Refresh token | Cookie `HttpOnly` + `Secure` (prod) + `SameSite=Lax` | 30 dias |
| Hash do refresh | Banco (`AuthSession.refreshTokenHash`) | até revogação |

**Por quê:**
- Atende SaaS multiempresa com revogação real de sessão.
- Evita localStorage (XSS → roubo de token de longa duração).
- Rotação de refresh mitiga replay.

Payload JWT mínimo: `sub`, `sid` (session id), `tenantId`, `role`, `platformRole`, `iat`, `exp`.  
Sem senha, permissões bulk ou segredos.

---

## 2. Fluxo de login

```
POST /auth/login { email, password }
  → normalize email
  → rate limit (IP + email)
  → find user
  → verify Argon2id (ou bcrypt legado → rehash)
  → check User.status / isActive
  → check Tenant.status (se membership)
  → create AuthSession + refresh cookie
  → sign access JWT (15m)
  → audit LOGIN_SUCCESS
  → return { user, tenant, memberships, accessToken? }  // access também só em memória no client
```

Resposta de falha sempre: `AUTH_INVALID_CREDENTIALS` / "E-mail ou senha inválidos."

---

## 3. Fluxo de refresh

```
POST /auth/refresh  (cookie nexa_refresh)
  → read cookie
  → hash e buscar sessão
  → se token antigo reutilizado → revogar família inteira
  → se válido: rotacionar refresh, renovar cookie
  → emitir novo access JWT
```

---

## 4. Fluxo de logout

```
POST /auth/logout
  → revogar sessão atual (revokedAt + reason)
  → limpar cookie refresh
  → audit LOGOUT

POST /auth/logout-all
  → revogar todas as sessões do user
```

---

## 5. Fluxo de recuperação de senha

```
POST /auth/forgot-password { email }
  → sempre 200 genérico
  → se user existe: token aleatório, hash no DB, expira 30min
  → (email async futuro)

POST /auth/reset-password { token, password }
  → validar token hash, não usado, não expirado
  → Argon2id nova senha
  → invalidar token
  → revogar todas as sessões
  → audit PASSWORD_RESET_COMPLETED
```

---

## 6. Modelo de sessões

`AuthSession`: id, userId, tenantId, refreshTokenHash, familyId, createdAt, expiresAt, lastActivityAt, ip, userAgent, deviceLabel, revokedAt, revokeReason.

Listagem: `GET /auth/sessions`  
Revogar: `DELETE /auth/sessions/:id`  
Revogar outras: `POST /auth/sessions/revoke-others`

---

## 7. Arquitetura multi-tenant

- Toda entidade de negócio tem `tenantId`.
- **tenantId da sessão** (JWT/sessão), nunca do body/query.
- Helper `assertTenantScope(request, resource.tenantId)`.
- Superadmin: impersonação explícita com sessão especial e auditoria (fase 2).

---

## 8. RBAC

Papéis: `SUPERADMIN` (plataforma) | `ADMIN` | `SUPERVISOR` | `AGENT` | `SALES` | `READONLY`.

Camada: `requirePermission("contacts.read")` mapeando role → permissions.

```
ADMIN       → * no tenant
SUPERVISOR  → conversas, contatos, CRM, equipe limitada
AGENT       → conversas, contatos read/update
SALES       → CRM + contatos
READONLY    → *.read
```

---

## 9. Tabelas de segurança

| Model | Uso |
|-------|-----|
| User (+ status) | identidade |
| AuthSession | sessões + refresh hash |
| LoginAttempt | brute force audit |
| PasswordResetToken | reset |
| SecurityEvent | eventos de segurança |
| AuditLog | já existe, estender ações |
| PlatformSetting | public_registration_enabled=false |

---

## 10. Rate limiting

- Global: 300 req/min (já existe).
- Login: 5 falhas / 15 min por IP+email; lock progressivo 1m → 5m → 15m.
- Implementação: store em memória (dev) + interface Redis-ready.
- Forgot-password: 3 / hora por IP.

---

## 11. Auditoria

Ações: LOGIN_SUCCESS/FAILED, LOGOUT, PASSWORD_*, ONBOARDING_COMPLETED, SESSION_REVOKED, PERMISSION_DENIED.

`AuditLog` imutável via API comum.

---

## 12. Onboarding

```
POST /onboarding/company  (auth + requireTenant + role ADMIN|SUPERADMIN)
  → transaction
  → update tenant + settings.onboardingCompleted
  → ensure default agent
  → audit
```

Bloqueio: se já completed, 409. Cadastro público: sempre 403.

---

## 13. Threat model inicial

| Ameaça | Mitigação |
|--------|-----------|
| Credential stuffing | rate limit + generic errors + Argon2 |
| XSS → token theft | HttpOnly refresh; access em memória |
| Session hijack | rotação refresh + family revoke |
| IDOR multi-tenant | tenantId da sessão |
| Privilege escalation | requirePermission server-side |
| Brute force reset | rate limit + token uso único |
| Upload malware logo | MIME real + whitelist + nome aleatório |

---

## 14. Riscos identificados (estado atual → alvo)

| Risco atual | Alvo |
|-------------|------|
| JWT 7d em localStorage | access 15m + refresh HttpOnly |
| bcryptjs | Argon2id (+ migrate on login) |
| Sem sessão revogável | AuthSession |
| Rate limit só global | login-specific |
| CORS origin: true | allowlist env |
| Sem headers segurança | Helmet |
| Cadastro register desligado só em código | flag + enforce |
| Tenant em query | proibido |

---

## Fases de implementação

1. **Fundação:** schema, Argon2, sessions, login/logout/refresh, cookies, rate limit login, headers, frontend credentials.
2. **Aprofundamento:** forgot/reset password, list sessions, requirePermission em rotas de negócio, upload seguro.
3. **Avançado:** MFA TOTP, impersonação, Redis rate limit, MIME logo, testes IDOR, CI.
4. **Hardening final (2026-07):** ver `docs/SECURITY-FINAL-AUDIT.md` e `docs/PRODUCTION-SECURITY-CHECKLIST.md`
   - JWT iss/aud/jti + bind de sessão
   - CSRF Origin guard
   - TOTP AES-GCM + anti-replay + challenge limits
   - Superadmin MFA obrigatório + step-up
   - Impersonação com motivo e hard cap 2h
   - Production fail-closed (`security:check`)
   - @fastify/jwt 10 / fast-jwt 6

### MFA TOTP

- `POST /auth/mfa/setup` → secret + QR
- `POST /auth/mfa/enable` → confirma código + devolve backup codes
- `POST /auth/mfa/disable` → senha + código
- Login: se MFA ativo → `{ mfaRequired, mfaToken }` → `POST /auth/mfa/verify`

### Impersonação

- `POST /admin/impersonate` (só SUPERADMIN) cria `AuthSession.isImpersonation`
- JWT: `imp`, `impBy`; RBAC usa role do membership enquanto impersona
- `POST /admin/stop-impersonation` restaura sessão do superadmin
- Rotas `/admin/*` bloqueadas durante impersonação

### Rate limit Redis

- `@fastify/rate-limit` + `ioredis` quando `NODE_ENV=production` e `REDIS_URL`
- Login rate limit também usa Redis se disponível
- Override: `RATE_LIMIT_REDIS=0|1`

### CI

- `.github/workflows/ci.yml`: `npm audit --audit-level=high`, typecheck, vitest
