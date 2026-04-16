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

这样做的原因是：主后端依赖栈不适合直接内嵌现代 `aider-chat`，当前实现采用”后端子进程调用 Aider”的方式。

Aider 用于 M4（代码生成）和 M5（实验设计）阶段的 AI 辅助编码。

### 5. AIDE 独立运行时

AIDE（AI-Driven Experiment）是 M6（实验执行）阶段使用的智能实验框架。与 Aider 类似，它也需要一个独立的 Python 3.11 虚拟环境：

- 通过 `AIDE_PYTHON` 指向该独立环境
- 默认约定路径为 `backend/.venv-aide-py311`

AIDE 用于 M6 阶段自动执行和管理实验，当 AIDE 不可用时会自动降级到 subprocess 或 LLM 模拟模式。

### 安装 Aider 与 AIDE（本地开发）

> 如果使用 Docker 启动，Aider 和 AIDE 已在镜像中预装，跳过此步骤。

Aider 和 AIDE 各需要一个独立的 Python 3.11 虚拟环境，与主后端隔离：

```powershell
cd .\backend

# 安装 Aider（用于 M4 代码生成、M5 实验设计）
python -m venv .venv-aider-py311
.\.venv-aider-py311\Scripts\pip install --upgrade pip
.\.venv-aider-py311\Scripts\pip install aider-chat==0.86.2

# 安装 AIDE（用于 M6 实验执行）
python -m venv .venv-aide-py311
.\.venv-aide-py311\Scripts\pip install --upgrade pip
.\.venv-aide-py311\Scripts\pip install aideml==0.2.2
```

安装完成后，在 `backend/.env` 中配置路径：

```dotenv
# Aider 路径（二选一即可）
AIDER_PYTHON=C:\path\to\ScholarMind\backend\.venv-aider-py311\Scripts\python.exe
# 或者直接指向 aider 可执行文件
# AIDER_EXE=C:\path\to\ScholarMind\backend\.venv-aider-py311\Scripts\aider.exe

# AIDE 路径
AIDE_PYTHON=C:\path\to\ScholarMind\backend\.venv-aide-py311\Scripts\python.exe
```

不配置 Aider 时，M4/M5 会降级到 LLM 全量重写模式；不配置 AIDE 时，M6 会降级到 subprocess 或 LLM 模拟实验模式。

## 目录结构

```text
ScholarMind/
  backend/
  react-client/
  mobile/
  docs/
  README.md
```

关键目录说明：

- `backend/`：后端接口、流水线模块、运行时配置、mDNS 发布
- `react-client/`：桌面端页面、状态管理与后端调用
- `mobile/`：移动端页面、局域网发现、Android 打包脚本
- `docs/`：参考文档资源

## 快速开始

### Docker 启动后端与桌面端（强烈推荐）

如果你不想在宿主机配置 Python 虚拟环境和前端 Node 环境，可以直接使用 Docker：

```powershell
Copy-Item .\backend\.env.example .\backend\.env
docker compose up --build backend web
```

访问地址：

- Backend: `http://localhost:8000`
- Web: `http://localhost:5173`

如果镜像已经构建过，也可以直接启动：

```powershell
docker compose up backend web
```

### Docker 寻找自定义目录规则

`task.config.work_dir` 现在同时兼容传统虚拟环境用户和 Docker 用户：

- 原生/venv 用户：继续直接使用宿主机真实路径
- Docker 用户：后端会自动把“项目父目录下的宿主机路径”映射到容器路径

当前项目根目录是：

```text
.\ScholarMind
```

如果你的自定义目录是：

```text
.\Test_Dir
```

这类路径和项目同属于 `.\HOST_WORKDIR_ROOT`，Docker 会自动映射，不需要前端额外配置，也不需要手工修改数据库中的 `work_dir`。

只有当自定义目录不在项目父目录下，例如跑到别的盘符或完全不同的目录树时，才需要额外设置：

```powershell
$env:HOST_WORKDIR_ROOT='D:\ResearchProjects'
$env:CONTAINER_WORKDIR_ROOT='/external-workdir'
docker compose up -d backend web
```

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

如果启用 Aider / AIDE，还需要配置（详见上方"安装 Aider 与 AIDE"）：

```dotenv
AIDER_PYTHON=C:\path\to\ScholarMind\backend\.venv-aider-py311\Scripts\python.exe
AIDE_PYTHON=C:\path\to\ScholarMind\backend\.venv-aide-py311\Scripts\python.exe
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
- 后端架构与工具调用：[`docs/backend-architecture.md`](./docs/backend-architecture.md)
- 系统设计与模块详述：[`docs/Design.md`](./docs/Design.md)
- 三端通信契约与数据模型：[`docs/communication mechanism.md`](./docs/communication%20mechanism.md)
- Docker 部署说明：[`docs/docker.md`](./docs/docker.md)
- 移动端 APK 打包与 Docker 环境：[`docs/mobile-apk-docker.md`](./docs/mobile-apk-docker.md)
- RAG Agent 多模型方案：[`docs/rag-agent-multi-model.md`](./docs/rag-agent-multi-model.md)
- 产品亮点与功能概览：[`docs/product-highlights.md`](./docs/product-highlights.md)
- 移动端联调、打包与局域网发现：[`mobile/README.md`](./mobile/README.md)

## 当前文档约定

- `README.md` 和 `mobile/README.md` 是当前运行方式的主要参考
- `docs/` 下为架构设计、通信协议、部署指南等技术文档
- `mobile/server/README.md` 仅说明模板目录用途，不应作为 ScholarMind 主后端文档使用
