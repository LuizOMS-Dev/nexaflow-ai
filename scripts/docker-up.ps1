# Sobe o NexaFlow completo no Docker Desktop
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "==> Aguardando Docker Engine..." -ForegroundColor Cyan
$ok = $false
for ($i = 1; $i -le 60; $i++) {
  docker info 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $ok = $true; break }
  Start-Sleep -Seconds 3
}
if (-not $ok) {
  Write-Host "Docker Desktop nao esta pronto. Abra o Docker Desktop e rode de novo." -ForegroundColor Red
  exit 1
}

Write-Host "==> Subindo stack (build)..." -ForegroundColor Cyan
# carrega GROQ do .env local se existir
if (Test-Path .env) {
  Get-Content .env | ForEach-Object {
    if ($_ -match '^\s*GROQ_API_KEY=(.+)$') {
      $val = $Matches[1].Trim('"').Trim("'")
      $env:GROQ_API_KEY = $val
    }
  }
}

docker compose --env-file .env.docker up -d --build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Aguardando API healthy..." -ForegroundColor Cyan
for ($i = 1; $i -le 60; $i++) {
  try {
    $h = Invoke-RestMethod -Uri "http://localhost:4000/health" -TimeoutSec 3
    if ($h.status -eq "ok") {
      Write-Host "API OK" -ForegroundColor Green
      break
    }
  } catch {}
  Start-Sleep -Seconds 3
}

Write-Host ""
Write-Host "NexaFlow no ar:" -ForegroundColor Green
Write-Host "  Web:       http://localhost:3000"
Write-Host "  API:       http://localhost:4000/health"
Write-Host "  Evolution: http://localhost:8080"
Write-Host "  Login:     use as credenciais SEED_SUPERADMIN_* configuradas no ambiente"
Write-Host ""
Write-Host "WhatsApp: abra Canais e clique Conectar WhatsApp (QR real via Evolution)."
