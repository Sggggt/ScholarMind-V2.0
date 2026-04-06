<p align="center">
  <img src="react-client/public/scholarmind-logo.png" width="128" alt="ScholarMind Logo">
</p>

<h1 align="center">ScholarMind</h1>

<p align="center">
  面向科研工作流的多端协同 AI 辅助系统
</p>

## 项目简介

ScholarMind 旨在把科研中的重复性工作串成一条可执行、可追踪、可回溯的自动化流程。当前仓库包含同一个项目的三部分实现：

- `backend/`：FastAPI 后端与 9 阶段科研流水线
- `react-client/`：桌面 Web 工作台
- `mobile/`：Expo / React Native 移动端，支持原生 Android 打包

当前运行方式是“一个后端，多个客户端”：

- 桌面端通过 REST / WebSocket 连接 `backend/`
- 移动端通过 REST / WebSocket 连接 `backend/`
- 任务状态、日志、产物、代码仓库与连接信息都由同一个后端统一管理

## 核心能力

### 1. 九阶段科研流水线

```text
研究主题
  -> M1 文献调研
  -> M2 研究空白识别
  -> M3 Idea 生成与打分
  -> M4 代码生成
  -> M5 实验设计
  -> M6 实验执行
  -> M7 结果分析
  -> M8 论文写作
  -> M9 评审打分
```

### 2. 多端共用同一后端

本项目不是“桌面端一套后端、移动端一套后端”的结构。真实链路如下：

- `react-client/` -> `backend/`
- `mobile/` -> `backend/`
- `mobile/server/` 只是模板自带的演示后端目录，不是 ScholarMind 主任务后端

### 3. 移动端局域网自动发现

移动端已支持基于 mDNS / Bonjour 的局域网发现：

- 后端发布 `_scholarmind._tcp.local.`
- 移动端在同一局域网中扫描候选服务
- 扫描成功后继续校验 `GET /api/health` 与 `/api/ws`
- 校验通过后保存后端地址

同时保留手动输入地址作为兜底方案：

```text
http://<你的局域网 IP>:8000
```

已知结论：

- 真机更适合验证 mDNS
- AVD 更适合做界面调试和手动地址联调

### 4. Aider 独立运行时

项目已将主后端环境与 Aider 环境拆分：

- 主后端环境负责 FastAPI 与科研流水线
- Aider 使用独立的 Python 3.11 虚拟环境
- 通过 `AIDER_PYTHON` 或 `AIDER_EXE` 指向该独立环境
- 默认约定路径为 `backend/.venv-aider-py311`

这样做的原因是：主后端依赖栈不适合直接内嵌现代 `aider-chat`，当前实现采用“后端子进程调用 Aider”的方式。

## 目录结构

```text
ScholarMind/
  backend/
  react-client/
  mobile/
  template/
  README.md
  分工计划.md
  研究调研_现有开源项目与系统设计.md
```

关键目录说明：

- `backend/`：后端接口、流水线模块、运行时配置、mDNS 发布
- `react-client/`：桌面端页面、状态管理与后端调用
- `mobile/`：移动端页面、局域网发现、Android 打包脚本
- `template/`：参考模板资源

## 快速开始

### 1. 启动后端

```powershell
cd .\backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

最少需要配置：

```dotenv
OPENAI_API_KEY=...
OPENAI_BASE_URL=...
OPENAI_MODEL=...
BRAVE_API_KEY=...
```

如果启用 Aider，还需要配置：

```dotenv
AIDER_PYTHON=C:\path\to\ScholarMind\backend\.venv-aider-py311\Scripts\python.exe
```

常用接口：

- `GET /api/health`
- `GET /api/connection-info`
- `GET /docs`

### 2. 启动桌面端

```powershell
cd .\react-client
npm install
npm run dev
```

### 3. 启动移动端

完整说明见 [`mobile/README.md`](./mobile/README.md)，最短路径如下：

```powershell
cd .\mobile
pnpm install
pnpm dev:metro
pnpm android -- --no-bundler
```

Release APK 打包：

```powershell
cd .\mobile
node scripts/run-android.mjs --variant release --no-bundler
```

输出路径：

- `mobile/android/app/build/outputs/apk/release/app-release.apk`

## 常用文档

- 项目总览与启动入口：[`README.md`](./README.md)
- 移动端联调、打包与局域网发现：[`mobile/README.md`](./mobile/README.md)
- `mobile/server/` 模板目录说明：[`mobile/server/README.md`](./mobile/server/README.md)
- 移动端 backlog：[`mobile/todo.md`](./mobile/todo.md)
- 历史规划文档：[`分工计划.md`](./分工计划.md)
- 调研与架构参考：[`研究调研_现有开源项目与系统设计.md`](./研究调研_现有开源项目与系统设计.md)

## 当前文档约定

- `README.md` 和 `mobile/README.md` 是当前运行方式的主要参考
- `分工计划.md` 与 `研究调研_现有开源项目与系统设计.md` 保留为历史规划与研究参考
- `mobile/server/README.md` 仅说明模板目录用途，不应作为 ScholarMind 主后端文档使用
