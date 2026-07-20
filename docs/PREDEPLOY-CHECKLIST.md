# Pre-deploy checklist

## Antes de subir produção

- [ ] `NODE_ENV=production`
- [ ] Secrets gerados (JWT, COOKIE, ENCRYPTION) — não defaults Docker
- [ ] `DATABASE_URL` Postgres
- [ ] `REDIS_URL` e Redis healthy
- [ ] `CORS_ORIGIN` HTTPS
- [ ] `APP_PUBLIC_URL` HTTPS
- [ ] `SUPERADMIN_MFA_REQUIRED=1`
- [ ] `MAIL_PROVIDER=resend` + key + domínio
- [ ] Volumes montados (uploads, wa-sessions)
- [ ] API **replicas=1**
- [ ] `TRUST_PROXY=true` no EasyPanel
- [ ] Seed demo desligado
- [ ] Superadmin criado com senha forte
- [ ] MFA Superadmin ativado
- [ ] `curl /health` → 200
- [ ] `curl /health/ready` → 200
- [ ] `npm test` / typecheck no CI
- [ ] Backup agendado
- [ ] Plano de restore lido pela equipe

## Pós-deploy

- [ ] Login Superadmin + MFA
- [ ] Criar empresa teste
- [ ] Login tenant
- [ ] Conectar WhatsApp (homolog)
- [ ] Enviar/receber mensagem
- [ ] Convite e-mail (Resend)
- [ ] Reset senha e-mail
