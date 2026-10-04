# Sobe a API em modo desenvolvimento (recarrega ao salvar). Requer o Postgres de dev rodando.
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User") + ";$env:APPDATA\npm"
Set-Location (Join-Path $PSScriptRoot "..\..")
New-Item -ItemType Directory -Force ".data\logs" | Out-Null
pnpm dev:api 2>&1 | Tee-Object -FilePath ".data\logs\api.log"
