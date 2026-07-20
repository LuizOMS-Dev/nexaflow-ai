# Reabilita WSL e sobe Docker + stack NexaFlow (precisa rodar como Administrador)
$ErrorActionPreference = "Continue"
$log = Join-Path $PSScriptRoot "fix-wsl-docker.log"
function Log($m) {
  $line = "$(Get-Date -Format 'HH:mm:ss') $m"
  Add-Content -Path $log -Value $line
  Write-Host $line
}

"" | Set-Content $log
Log "=== Fix WSL + Docker (Admin) ==="

# 1) WSLService
Log "Configurando WSLService..."
sc.exe config WSLService start= demand | Out-String | ForEach-Object { Log $_.Trim() }
sc.exe start WSLService | Out-String | ForEach-Object { Log $_.Trim() }
Start-Sleep -Seconds 3
$svc = Get-Service WSLService -ErrorAction SilentlyContinue
Log "WSLService Status=$($svc.Status) StartType=$($svc.StartType)"

# 2) WSL status
Log "wsl --status:"
wsl --status 2>&1 | Out-String | ForEach-Object { Log $_.Trim() }

# 3) Docker Desktop
$dd = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
if (Test-Path $dd) {
  Log "Iniciando Docker Desktop..."
  Start-Process $dd
} else {
  Log "Docker Desktop.exe nao encontrado"
}

# 4) Espera engine
$ready = $false
for ($i = 1; $i -le 40; $i++) {
  docker info 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    $ready = $true
    Log "Docker engine OK (tentativa $i)"
    break
  }
  Log "Aguardando Docker engine... $i"
  Start-Sleep -Seconds 5
}

if (-not $ready) {
  Log "FALHA: Docker engine nao subiu"
  exit 1
}

# 5) Compose
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
Log "docker compose up -d em $root"
docker compose down 2>&1 | Out-String | ForEach-Object { Log $_.Trim() }
docker compose up -d 2>&1 | Out-String | ForEach-Object { Log $_.Trim() }
Start-Sleep -Seconds 5
docker compose ps 2>&1 | Out-String | ForEach-Object { Log $_.Trim() }

Log "=== CONCLUIDO ==="
exit 0
