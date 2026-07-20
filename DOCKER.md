# NexaFlow + Docker Desktop

## Pré-requisito: WSL

Se aparecer `Wsl/0x80070422`, o serviço WSL está desativado.

1. Abra **PowerShell como Administrador**
2. Rode:

```powershell
cd "C:\Users\luizo\OneDrive\Área de Trabalho\NexaFlow Ai Projeto"
powershell -ExecutionPolicy Bypass -File .\scripts\fix-wsl-docker.ps1
```

3. Se o DISM ativar recursos, **reinicie o Windows**
4. Abra o **Docker Desktop** e espere ficar verde

## Subir tudo

```powershell
cd "C:\Users\luizo\OneDrive\Área de Trabalho\NexaFlow Ai Projeto"
powershell -ExecutionPolicy Bypass -File .\scripts\docker-up.ps1
```

Ou:

```powershell
docker compose --env-file .env.docker up -d --build
```

## Serviços

| Serviço | URL |
|---------|-----|
| Web | http://localhost:3000 |
| API | http://localhost:4000/health |
| Evolution (WhatsApp gateway) | http://localhost:8080 |
| Postgres | localhost:5432 |
| Redis | localhost:6379 |

## Primeiro superadmin

Não existe credencial padrão. Antes de executar o seed manual, defina no `.env`:

```env
SEED_SUPERADMIN_EMAIL=voce@empresa.com
SEED_SUPERADMIN_PASSWORD=<senha-exclusiva-com-16-ou-mais-caracteres>
```

Depois execute `npm run db:seed`. O seed aborta se as credenciais estiverem ausentes ou fracas.

## WhatsApp real

1. Entre no painel → **Canais / WhatsApp**
2. Clique **Conectar WhatsApp**
3. Escaneie o QR no celular  
   (WhatsApp → Aparelhos conectados)

O Evolution roda **no servidor** (container). O cliente **não** configura API.

## Parar

```powershell
docker compose down
```

## Logs

```powershell
docker logs nexaflow-api -f
docker logs nexaflow-evolution -f
docker logs nexaflow-web -f
```
