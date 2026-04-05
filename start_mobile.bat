@echo off
setlocal

set "ROOT_DIR=%~dp0"
set "MOBILE_DIR=%ROOT_DIR%mobile"

echo ========================================
echo ScholarMind - Mobile Client Launcher
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if mobile directory exists
if not exist "%MOBILE_DIR%" (
    echo [ERROR] Mobile directory not found: %MOBILE_DIR%
    pause
    exit /b 1
)

cd /d "%MOBILE_DIR%"

REM Check if node_modules exists
if not exist "node_modules" (
    echo [INFO] node_modules not found, installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
)

echo [INFO] Starting Expo development server...
echo.
echo ========================================
echo Mobile client starting...
echo.
echo To connect your mobile device:
echo 1. Install Expo Go app on your phone
echo 2. Scan the QR code that will appear
echo 3. Or enter the URL manually in Expo Go
echo.
echo For network connection setup, visit:
echo http://localhost:8000/api/connection-info
echo ========================================
echo.

REM Start Expo in a new window
start "ScholarMind Mobile" cmd /k "title ScholarMind Mobile && chcp 65001>nul && cd /d ""%MOBILE_DIR%"" && npm start"

echo.
echo Mobile server started in a new window.
echo Press any key to exit this launcher...
pause >nul
