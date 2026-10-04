# Sobe o app (Expo) na web, para ver no navegador em http://localhost:8081
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User") + ";$env:APPDATA\npm"
$env:EXPO_NO_TELEMETRY = "1"
Set-Location (Join-Path $PSScriptRoot "..\..\apps\mobile")
New-Item -ItemType Directory -Force "..\..\.data\logs" | Out-Null
npx expo start --web --port 8081 2>&1 | Tee-Object -FilePath "..\..\.data\logs\mobile-web.log"
