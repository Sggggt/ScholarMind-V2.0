@echo off
setlocal

set "BACKEND_DIR=%~dp0"
set "VENV_ACTIVATE=%BACKEND_DIR%venv\Scripts\activate.bat"
set "VENV_PYTHON=%BACKEND_DIR%venv\Scripts\python.exe"

title ScholarMind Backend Logs
chcp 65001>nul
cd /d "%BACKEND_DIR%"

for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$ips = Get-NetIPConfiguration ^| Where-Object { $_.NetAdapter.Status -eq 'Up' -and $_.IPv4DefaultGateway -ne $null } ^| ForEach-Object { $_.IPv4Address.IPAddress } ^| Where-Object { $parts = $_ -split '\.'; $_.StartsWith('10.') -or $_.StartsWith('192.168.') -or ($parts.Length -ge 2 -and $parts[0] -eq '172' -and [int]$parts[1] -ge 16 -and [int]$parts[1] -le 31) } ^| Sort-Object -Unique; [string]::Join(',', $ips)"`) do set "HOST_LAN_IPS=%%I"
if defined HOST_LAN_IPS (
    echo [backend] detected LAN IPs: %HOST_LAN_IPS%
)

if exist "%VENV_PYTHON%" (
    call "%VENV_ACTIVATE%"
    echo [backend] virtualenv activated: %VENV_ACTIVATE%
    "%VENV_PYTHON%" -m main
) else (
    echo [backend] virtualenv not found, falling back to system Python
    python -m main
)
