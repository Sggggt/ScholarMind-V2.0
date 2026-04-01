<p align="center">
  <img src="frontend/public/favicon.svg" width="80" height="80" alt="ScholarMind Logo">
</p>

<h1 align="center">ScholarMind</h1>

<p align="center">
  <b>AI-Powered Automated Scientific Research Pipeline</b><br>
  从文献调研到论文写作，一键完成全流程科研自动化
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.12+-blue?logo=python" alt="Python">
  <img src="https://img.shields.io/badge/React-18-61dafb?logo=react" alt="React">
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi" alt="FastAPI">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
</p>

---

## ScholarMind 是什么？

ScholarMind 是一个端到端的 AI 科研自动化系统。输入一个研究主题，系统会串联 9 个模块的完整研究流程，最终输出带引用的学术论文、实验结果与评审报告。

**核心流程：**

```
研究主题 → M1 文献调研 → M2 研究空白识别 → M3 Idea 生成与打分
         → M4 代码生成 → M5 实验设计 → M6 实验执行
         → M7 结果分析 → M8 论文写作 → M9 评审打分 → 论文 PDF
```

### 9 大模块

| 模块 | 功能 | 核心技术 |
|------|------|---------|
| **M1** 文献调研 | 自动搜索和综述相关论文 | [GPT-Researcher](https://github.com/assafelovic/gpt-researcher) + Brave Search |
| **M2** 研究空白识别 | 分析文献空白，生成研究方向 | [PaperQA2](https://github.com/Future-House/paper-qa) RAG + Semantic Scholar |
| **M3** Idea 生成 | 多轮反思 + 树搜索生成创新 idea | [AI-Scientist](https://github.com/SakanaAI/AI-Scientist) + Novelty Check |
| **M4** 代码生成 | 自动生成实验代码仓库 | [Aider](https://github.com/Aider-AI/aider) AI Pair Programming |
| **M5** 实验设计 | 设计实验方案和超参搜索空间 | LLM + AI-Scientist coder prompt |
| **M6** 实验执行 | 自动运行实验，出错自动修复 | Subprocess + Aider Auto-fix |
| **M7** 结果分析 | 分析实验指标，判断是否达标 | LLM Analysis + final_info.json |
| **M8** 论文写作 | 5 阶段高质量论文生成 | 大纲 → 逐节撰写 → 一致性检查 → 引用 Grounding → 质量审计 |
| **M9** 评审打分 | NeurIPS 风格多审稿人评审 | Literature-Grounded Review + Meta-Review |

---

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/yibol9768-alt/ScholarMind.git
cd ScholarMind
```

### 2. 配置后端

```bash
cd backend

# 创建 Python 虚拟环境 (需要 Python 3.12+)
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install fastapi uvicorn[standard] sqlalchemy aiosqlite httpx pydantic
pip install openai backoff requests
pip install gpt-researcher aider-chat paper-qa sentence-transformers
pip install pymupdf pymupdf4llm pypdf numpy

# 克隆所需的开源仓库
mkdir -p repos
git clone https://github.com/SakanaAI/AI-Scientist.git repos/AI-Scientist
git clone https://github.com/assafelovic/gpt-researcher.git repos/gpt-researcher
pip install -e repos/gpt-researcher
```

### 3. 配置 API 密钥

```bash
# 复制配置模板
cp .env.example .env

# 编辑 .env 文件，填入你的 API 密钥
nano .env  # 或用任何编辑器打开
```

`.env` 配置说明：

```bash
# ══════════════════════════════════════════
# LLM 配置 (必填，选择以下任一方案)
# ══════════════════════════════════════════

# 方案 A: OpenAI
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-xxxxxxxxxxxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o

# 方案 B: 智谱 AI (国内推荐)
# LLM_PROVIDER=openai
# OPENAI_API_KEY=your-zhipu-api-key
# OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
# OPENAI_MODEL=glm-4-plus

# 方案 C: DeepSeek
# LLM_PROVIDER=openai
# OPENAI_API_KEY=your-deepseek-key
# OPENAI_BASE_URL=https://api.deepseek.com
# OPENAI_MODEL=deepseek-chat

# 方案 D: 任意 OpenAI 兼容 API (Ollama, vLLM, etc.)
# OPENAI_API_KEY=not-needed
# OPENAI_BASE_URL=http://localhost:11434/v1
# OPENAI_MODEL=llama3

# ══════════════════════════════════════════
# 搜索 API (至少配一个，用于 M1 文献搜索)
# ══════════════════════════════════════════

# Brave Search (推荐，免费额度多)
# 申请: https://brave.com/search/api/
BRAVE_API_KEY=

# 或 Tavily Search
# 申请: https://tavily.com/
TAVILY_API_KEY=

# 或 Serper (Google Search)
# 申请: https://serper.dev/
SERPER_API_KEY=

# 如果都不配，M1 会用 DuckDuckGo (免费但较慢)

# ══════════════════════════════════════════
# 学术搜索 (可选，提升 M2/M3/M9 质量)
# ══════════════════════════════════════════

# Semantic Scholar API Key (可选，无 key 也能用但有限流)
# 申请: https://www.semanticscholar.org/product/api
SEMANTIC_SCHOLAR_API_KEY=

# ══════════════════════════════════════════
# 服务配置
# ══════════════════════════════════════════
HOST=0.0.0.0
PORT=8000
SANDBOX_ENABLED=false
SANDBOX_TIMEOUT=600
```

### 4. 启动后端

```bash
# 确保在 backend 目录下，且已激活 venv
python -m uvicorn main:app --host 0.0.0.0 --port 8000

# 启动后访问 http://localhost:8000 即可使用
# 后端提供 API，开发时前端可单独运行在 react-client
```

### 5. (可选) 前端开发模式

如果你要修改桌面端前端代码：

```bash
cd react-client
npm install
npm run dev
# 开发服务器: http://localhost:5173 (自动代理到后端 8000)
```

---

## 项目结构

```text
ScholarMind/
├── backend/                    # FastAPI 后端
│   ├── main.py                 # 入口 (API + 静态资源托管)
│   ├── config.py               # 配置管理
│   ├── .env                    # API 密钥配置 (不提交到 git)
│   ├── api/
│   │   ├── routes.py           # REST API 路由
│   │   ├── schemas.py          # 请求/响应模型
│   │   └── ws.py               # WebSocket 管理
│   ├── modules/                # 9 大研究模块
│   │   ├── base.py             # 模块基类
│   │   ├── llm_client.py       # 统一 LLM 调用
│   │   ├── ai_scientist_bridge.py  # AI-Scientist 适配层
│   │   ├── m1_literature.py    # M1: GPT-Researcher 文献调研
│   │   ├── m2_gap_analysis.py  # M2: PaperQA2 研究空白
│   │   ├── m3_idea_scoring.py  # M3: 树搜索 Idea 生成
│   │   ├── m4_code_gen.py      # M4: Aider 代码生成
│   │   ├── m5_experiment_design.py
│   │   ├── m6_agent_runner.py  # M6: 自动实验执行
│   │   ├── m7_analysis.py      # M7: 结果分析
│   │   ├── m8_paper_writing.py # M8: 5 阶段论文写作
│   │   └── m9_review.py        # M9: 文献 Grounded 评审
│   ├── pipeline/
│   │   ├── orchestrator.py     # 流水线编排器
│   │   ├── tracer.py           # 全程追踪日志
│   │   └── state.py            # 状态机 (暂停 / 终止 / 审阅)
│   ├── db/
│   │   ├── database.py         # SQLite async 数据库
│   │   └── models.py           # ORM 模型
│   └── repos/                  # 依赖的开源仓库 (需手动克隆)
│       ├── AI-Scientist/
│       └── gpt-researcher/
│
├── react-client/               # 桌面端 React 工作台前端
│   ├── src/
│   │   ├── pages/              # 工作台与各研究阶段页面
│   │   ├── components/         # App Shell 与 UI 组件
│   │   ├── store/              # Zustand 状态管理
│   │   ├── services/           # REST / WebSocket 服务层
│   │   ├── adapters/           # 后端任务与产物适配层
│   │   └── types/              # 前后端类型定义
│   └── package.json
│
├── frontend/                   # 旧前端实现 (保留作参考)
│   └── ...
│
└── build.sh                    # macOS .app 打包脚本
```

---

## 技术栈

| 层 | 技术 |
|---|------|
| **Frontend** | React 18 + TypeScript + TailwindCSS + Zustand + xterm.js |
| **Backend** | FastAPI + SQLAlchemy + WebSocket + asyncio |
| **LLM** | OpenAI 兼容 API (GPT-4o / 智谱 / DeepSeek / Ollama) |
| **Research** | GPT-Researcher + AI-Scientist + PaperQA2 + Aider |
| **Search** | Brave / Tavily / Serper / DuckDuckGo + Semantic Scholar |
| **Database** | SQLite (aiosqlite) |

---

## API 接口

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/tasks` | 创建研究任务 |
| `GET` | `/api/tasks` | 获取任务列表 |
| `GET` | `/api/tasks/{id}` | 获取任务详情 |
| `POST` | `/api/tasks/{id}/pause` | 暂停任务 |
| `POST` | `/api/tasks/{id}/resume` | 恢复任务 |
| `POST` | `/api/tasks/{id}/abort` | 终止任务 |
| `DELETE` | `/api/tasks/{id}` | 删除任务 |
| `GET` | `/api/tasks/{id}/logs` | 获取追踪日志 |
| `GET` | `/api/tasks/{id}/output` | 获取产出物 |
| `GET` | `/api/tasks/{id}/review-result` | 获取评审结果 |
| `GET` | `/api/tasks/{id}/artifacts` | 获取任务产物清单 |
| `GET` | `/api/tasks/{id}/artifact-content?path=...` | 读取文本 / JSON 产物 |
| `GET` | `/api/tasks/{id}/repo/tree` | 获取代码仓库目录树 |
| `GET` | `/api/tasks/{id}/repo/file?path=...` | 读取代码文件内容 |
| `GET` | `/api/tasks/{id}/review-report` | 获取完整评审报告 |
| `POST` | `/api/tasks/{id}/review` | 提交人工审阅 |
| `WS` | `/api/ws` | WebSocket 实时推送 |
| `WS` | `/api/ws/{id}` | 单任务实时推送 |

---

## 主要特性

- **全流程自动化**：输入主题后，自动完成从文献到论文的 9 个阶段
- **实时进度追踪**：通过 WebSocket 推送任务状态与运行日志
- **桌面端工作台**：`react-client` 已接入真实后端任务、日志和阶段状态
- **只读产物浏览**：支持浏览文献、Gap、Idea、实验计划、结果、论文与评审报告
- **代码仓库查看**：可在前端直接查看实验仓库目录与文件内容
- **多 LLM 支持**：兼容 OpenAI / 智谱 / DeepSeek / Ollama 等
- **人工审阅节点**：M3 / M7 支持人工介入确认
- **暂停 / 终止控制**：支持对运行中的任务进行暂停、恢复和终止

---

## 常见问题

### 常见问题

**Q: 启动报错 `ModuleNotFoundError`**
```bash
# 确保安装了所有依赖
pip install -r requirements.txt
pip install openai backoff gpt-researcher aider-chat
```

**Q: M1 文献调研没有搜索结果**
```bash
# 检查 .env 中是否配置了搜索 API
# 至少需要 BRAVE_API_KEY 或 TAVILY_API_KEY 之一
# 不配置则使用 DuckDuckGo (免费但可能较慢)
```

**Q: Semantic Scholar 返回 429 (限流)**
```bash
# 申请免费 API Key: https://www.semanticscholar.org/product/api
# 在 .env 中配置 SEMANTIC_SCHOLAR_API_KEY
# 无 key 也能用，但每分钟请求数有限
```

**Q: Aider 报错 `LLM Provider NOT provided`**
```bash
# Aider 使用 litellm，需要 openai/ 前缀
# 系统已自动处理，但如果模型名不被识别，检查 OPENAI_MODEL 配置
```

**Q: `react-client` 页面拿不到数据或 WebSocket 不通**
```bash
# 确认后端运行在 http://127.0.0.1:8000
# 再在 react-client 下执行 npm run dev
# Vite 会代理 /api 和 /files，并转发 WebSocket
```

**Q: PDF 编译失败**
```bash
# 需要安装 LaTeX (用于 M8 论文编译)
# macOS: brew install --cask mactex
# Ubuntu: sudo apt install texlive-full
# 不装也不影响论文 LaTeX 源文件生成
```

**Q: Windows 上如何运行？**
```bash
# 1. 安装 Python 3.12+
# 2. 用 PowerShell:
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

---

## 开源协议

MIT License

---

<p align="center">
  Built with AI-Scientist, GPT-Researcher, PaperQA2, and Aider
</p>
