const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: root, shell: true });
}

console.log("🚀 Setup NexaFlow AI\n");

const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");
if (!fs.existsSync(envPath)) {
  fs.copyFileSync(examplePath, envPath);
  console.log("✅ .env criado a partir de .env.example");
} else {
  console.log("ℹ️  .env já existe");
}

// Copia .env para packages/db (Prisma)
const dbEnv = path.join(root, "packages", "db", ".env");
fs.copyFileSync(envPath, dbEnv);
console.log("✅ packages/db/.env sincronizado");

// Copia vars públicas para web
const webEnv = path.join(root, "apps", "web", ".env.local");
const envContent = fs.readFileSync(envPath, "utf8");
const apiUrl = (envContent.match(/NEXT_PUBLIC_API_URL="?([^"\n]+)"?/) || [])[1] || "http://localhost:4000";
const appName = (envContent.match(/NEXT_PUBLIC_APP_NAME="?([^"\n]+)"?/) || [])[1] || "NexaFlow AI";
fs.writeFileSync(
  webEnv,
  `NEXT_PUBLIC_API_URL=${apiUrl}\nNEXT_PUBLIC_APP_NAME=${appName}\n`
);
console.log("✅ apps/web/.env.local criado");

run("npm install");
run("npm run db:generate");

console.log(`
────────────────────────────────────────
Próximos passos:

1) Suba o PostgreSQL (recomendado Docker):
   docker compose up -d postgres redis

2) Aplique as migrações:
   npm run db:migrate:deploy

3) Para criar o primeiro superadmin, defina no .env credenciais exclusivas e execute:
   SEED_SUPERADMIN_EMAIL=voce@empresa.com
   SEED_SUPERADMIN_PASSWORD=<senha-forte-de-16+-caracteres>
   npm run db:seed

4) Inicie API + Web:
   npm run dev

Acesse: http://localhost:3000
Não existe login ou senha padrão.
────────────────────────────────────────
`);
