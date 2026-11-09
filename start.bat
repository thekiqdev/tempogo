@echo off
cd /d "%~dp0"

if not exist ".env" (
  echo Arquivo .env nao encontrado. Copie .env.example para .env e configure as senhas.
  pause
  exit /b 1
)

start "TempoGo local" powershell.exe -NoExit -ExecutionPolicy Bypass -NoProfile -File "%~dp0start.ps1"
