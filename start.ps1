$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$Host.UI.RawUI.WindowTitle = "TempoGo local"

if (-not (Test-Path -LiteralPath ".env")) {
  Write-Host "Arquivo .env nao encontrado. Copie .env.example para .env e configure as senhas." -ForegroundColor Red
  exit 1
}

Write-Host "Subindo PostgreSQL..." -ForegroundColor Cyan
npm.cmd run db:up
if ($LASTEXITCODE -ne 0) {
  Write-Host "Falha ao subir o banco. Confira o Docker Desktop." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "Iniciando API e frontend..." -ForegroundColor Cyan
Write-Host "Interface: http://127.0.0.1:5173" -ForegroundColor Green
Write-Host "API:       http://127.0.0.1:3001" -ForegroundColor Green
Write-Host "Ctrl+C encerra API e frontend. O banco continua no Docker." -ForegroundColor DarkGray
npm.cmd run dev
