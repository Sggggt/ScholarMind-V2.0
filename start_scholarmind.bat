@echo off
title ScholarMind 一键启动器
color 0A

echo ==========================================
echo    ScholarMind 智能文献管理系统启动中...
echo ==========================================

:: 1. 启动后端服务
echo [1/2] 正在启动后端 API 服务 (Python FastAPI)...
:: 假设虚拟环境目录名为 venv，如果不是请修改此处
start "ScholarMind-Backend" cmd /k "cd /d %~dp0backend && venv\Scripts\activate && python main.py"

:: 等待 3 秒确保后端启动初始化
timeout /t 3 /nobreak > nul

:: 2. 启动前端服务
echo [2/2] 正在启动前端 React 客户端 (Vite)...
:: 如果你使用的是 pnpm，请将 npm 改为 pnpm
start "ScholarMind-Frontend" cmd /k "cd /d %~dp0react-client && npm run dev"

echo.
echo ------------------------------------------
echo 服务已在独立窗口中启动：
echo - 后端窗口：正在运行 FastAPI (通常在 http://127.0.0.1:8000)
echo - 前端窗口：正在运行 Vite (通常在 http://localhost:5173)
echo.
echo 提示：请勿关闭这两个弹出的黑窗口，否则服务会停止。
echo ------------------------------------------
pause
