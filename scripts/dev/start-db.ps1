# Sobe o Postgres de desenvolvimento (embutido, sem Docker). Mantém-se rodando; feche a janela para parar.
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User") + ";$env:APPDATA\npm"
Set-Location (Join-Path $PSScriptRoot "..\..")
New-Item -ItemType Directory -Force ".data\logs" | Out-Null
pnpm --filter "@app/dev-db" start 2>&1 | Tee-Object -FilePath ".data\logs\devdb.log"
