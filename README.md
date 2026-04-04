<p align="center">
  <img src="react-client/public/favicon.ico" width="80" height="80" alt="ScholarMind Logo">
</p>

<h1 align="center">ScholarMind V2.0</h1>

<p align="center">
  <b>AI 驱动的自动化科研系统</b><br>
  从文献调研到论文写作，一键完成全流程科研自动化
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.12+-blue?logo=python" alt="Python">
  <img src="https://img.shields.io/badge/React-18-61dafb?logo=react" alt="React">
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi" alt="FastAPI">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
</p>

---

## 一、系统简介

ScholarMind 是一个端到端的 AI 科研自动化系统。用户只需输入研究主题，系统会自动串联 9 个模块的完整研究流程：

```
研究主题 → M1 文献调研 → M2 研究空白 → M3 Idea 生成
         → M4 代码生成 → M5 实验设计 → M6 实验执行
         → M7 结果分析 → M8 论文写作 → M9 评审打分 → 论文 PDF
```

### 核心特性

- **全流程自动化**: 9 个模块无缝串联，从主题到论文全自动
- **多 LLM 支持**: 兼容智谱 AI、DeepSeek、OpenAI、本地模型
- **实时进度追踪**: 数据库持久化日志，支持任务恢复
- **智能回退机制**: M7 结果不达标时自动回退 M6 重新实验
- **高质量论文**: 5 阶段精细化写作，自动编译 LaTeX 为 PDF
- **专业评审**: NeurIPS 风格多审稿人模拟评审

---

## 二、系统架构

### 2.1 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        React 前端工作台                            │
│  • 18 个功能页面  • Zustand 状态管理  • REST API 客户端          │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP/WebSocket
┌────────────────────────────▼────────────────────────────────────┐
│                        FastAPI 后端服务                            │
│  • REST API  • 任务调度  • 日志追踪  • 状态管理                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      9 模块研究流水线                               │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐        │
│  │ M1  │→│ M2  │→│ M3  │→│ M4  │→│ M5  │→│ M6  │→│ M7  │        │
│  │文献 │ │空白 │ │Idea │ │代码 │ │实验 │ │Agent│ │结果 │        │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └──┬──┘        │
│                                                  ↗   │             │
│                                        回退 ┘   ▼             │
│                                              ┌─────┐              │
│                         ┌─────┐              │ M8  │              │
│                         │ M9  │←─────────────│论文 │              │
│                         │评审 │              │写作 │              │
│                         └─────┘              └─────┘              │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      基础设施与外部服务                             │
│  • LLM 客户端  • 搜索 API  • 学术搜索  • AI-Scientist  • LaTeX    │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 模块说明

| 模块 | 功能 | 输出产物 |
|------|------|----------|
| **M1 文献调研** | 自动搜索和综述相关论文 | `m1_sources.json`, `m1_literature_review.md` |
| **M2 研究空白** | 分析文献空白，生成研究方向 | `m2_gap_analysis.json` |
| **M3 Idea 生成** | 树搜索生成创新 idea，三维打分 | `m3_scored_ideas.json` |
| **M4 代码生成** | 自动生成实验代码仓库 | `experiment.py`, `m4_code_gen_info.json` |
| **M5 实验设计** | 设计实验方案和超参搜索空间 | `m5_experiment_plan.json` |
| **M6 实验执行** | 自动运行实验，出错自动修复 | `m6_experiment_results.json` |
| **M7 结果分析** | 分析实验指标，判断是否达标 | `m7_analysis.json` |
| **M8 论文写作** | 5 阶段高质量论文生成 | `paper.tex`, `paper.pdf` |
| **M9 评审打分** | NeurIPS 风格多审稿人评审 | `m9_review_report.json` |

---

## 三、快速开始

### 3.1 克隆仓库

```bash
git clone https://github.com/Sggggt/ScholarMind-V2.0.git
cd ScholarMind
```

### 3.2 后端配置

```bash
cd backend

# 创建虚拟环境
python -m venv venv

# 激活虚拟环境
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 克隆依赖的开源仓库
mkdir repos
git clone https://github.com/SakanaAI/AI-Scientist.git repos/AI-Scientist
git clone https://github.com/assafelovic/gpt-researcher.git repos/gpt-researcher
pip install -e repos/gpt-researcher
```

### 3.3 配置 API 密钥

```bash
# 复制配置模板
cp .env.example .env

# 编辑 .env 文件
```

`.env` 配置示例：

```bash
# LLM 配置 (选择以下任一方案)

# 方案 A: 智谱 AI (国内推荐)
LLM_PROVIDER=openai_compatible
OPENAI_API_KEY=your-zhipu-api-key
OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
OPENAI_MODEL=glm-4-flash

# 方案 B: DeepSeek
LLM_PROVIDER=openai_compatible
OPENAI_API_KEY=your-deepseek-key
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-chat

# 方案 C: OpenAI
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-xxxxx
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o

# 方案 D: 本地模型 (Ollama 等)
LLM_PROVIDER=openai_compatible
OPENAI_API_KEY=not-needed
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_MODEL=llama3

# 搜索 API (至少配一个)
BRAVE_API_KEY=your-brave-key      # 推荐，免费额度多
TAVILY_API_KEY=your-tavily-key
SERPER_API_KEY=your-serper-key

# 学术搜索 (可选)
SEMANTIC_SCHOLAR_API_KEY=your-ss-key

# 服务配置
HOST=0.0.0.0
PORT=8000
```

### 3.4 启动服务

```bash
# 启动后端 (在 backend 目录下)
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 启动前端 (开发模式，在 react-client 目录下)
npm run dev

# 构建前端 (生产模式)
npm run build
```

访问地址：
- 后端 API: http://localhost:8000
- 前端开发: http://localhost:5173
- 生产前端: http://localhost:8000 (自动托管)

---

## 四、项目结构

```
ScholarMind/
├── backend/                          # 后端服务
│   ├── main.py                        # FastAPI 入口
│   ├── config.py                      # 全局配置
│   ├── runtime_config.py              # 运行时配置
│   ├── api/
│   │   ├── routes.py                  # REST API 路由
│   │   ├── schemas.py                 # 数据模型
│   │   └── ws.py                      # WebSocket 管理
│   ├── modules/                       # 9 大研究模块
│   │   ├── base.py                    # 模块基类
│   │   ├── llm_client.py              # LLM 客户端
│   │   ├── ai_scientist_bridge.py     # AI-Scientist 适配
│   │   ├── experiment_guard.py        # 实验代码验证
│   │   ├── experiment_sim.py          # 实验结果模拟
│   │   ├── m1_literature.py           # M1: 文献调研
│   │   ├── m2_gap_analysis.py         # M2: 研究空白
│   │   ├── m3_idea_scoring.py         # M3: Idea 打分
│   │   ├── m4_code_gen.py             # M4: 代码生成
│   │   ├── m5_experiment_design.py    # M5: 实验设计
│   │   ├── m6_agent_runner.py         # M6: 实验执行
│   │   ├── m7_analysis.py             # M7: 结果分析
│   │   ├── m8_paper_writing.py        # M8: 论文写作
│   │   ├── m9_review.py               # M9: 评审打分
│   │   └── ssh_runner.py              # SSH 远程执行
│   ├── pipeline/
│   │   ├── orchestrator.py           # 流水线编排器
│   │   ├── tracer.py                  # 日志追踪器
│   │   └── state.py                   # 状态机
│   ├── services/
│   │   ├── task_service.py            # 任务服务
│   │   └── conversation_service.py    # 会话服务
│   ├── db/
│   │   ├── database.py                 # 数据库连接
│   │   └── models.py                  # ORM 模型
│   └── repos/                         # 依赖的开源仓库
│       ├── AI-Scientist/               # AI-Scientist 项目
│       └── gpt-researcher/             # GPT-Researcher 项目
│
├── react-client/                       # React 前端
│   ├── src/
│   │   ├── pages/                      # 18 个页面
│   │   ├── components/                 # UI 组件
│   │   ├── services/                   # API 服务
│   │   ├── adapters/                   # 数据适配器
│   │   ├── store/                      # 状态管理
│   │   └── types/                      # 类型定义
│   └── package.json
│
├── template/                           # 设计模板
│   └── stitch/scholarmind_ivory/       # Ivory 设计系统
│
├── docs/                               # 文档
│   ├── 分工计划.md
│   └── 研究调研_现有开源项目与系统设计.md
│
└── README.md                            # 本文件
```

---

## 五、技术栈

| 层级 | 技术选型 |
|------|----------|
| **前端框架** | React 18 + TypeScript + Vite |
| **状态管理** | Zustand |
| **路由** | React Router 6 |
| **后端框架** | FastAPI 0.115 |
| **数据库** | SQLite + aiosqlite |
| **LLM 客户端** | OpenAI 兼容 API |
| **文献搜索** | GPT-Researcher + Brave/Semantic Scholar |
| **论文生成** | AI-Scientist + LaTeX |
| **代码模板** | AI-Scientist experiment.py |

---

## 六、API 接口

### 6.1 任务管理

| 方法 | 端点 | 说明 |
|------|------|------|
| `POST` | `/api/chat/completions` | 创建研究任务 |
| `GET` | `/api/tasks` | 获取任务列表 |
| `GET` | `/api/tasks/{id}` | 获取任务详情 |
| `POST` | `/api/tasks/{id}/pause` | 暂停任务 (计划中) |
| `POST` | `/api/tasks/{id}/resume` | 恢复任务 (计划中) |
| `POST` | `/api/tasks/{id}/abort` | 终止任务 (计划中) |
| `DELETE` | `/api/tasks/{id}` | 删除任务 |

### 6.2 任务数据

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/tasks/{id}/status` | 获取任务状态 |
| `GET` | `/api/tasks/{id}/logs` | 获取追踪日志 |
| `GET` | `/api/tasks/{id}/output` | 获取产出物列表 |
| `GET` | `/api/tasks/{id}/artifact-content` | 读取产物内容 |
| `GET` | `/api/tasks/{id}/repo/tree` | 获取代码仓库目录 |
| `GET` | `/api/tasks/{id}/repo/file` | 读取代码文件 |
| `POST` | `/api/tasks/{id}/recompile-pdf` | 重新编译论文 PDF |

---

## 七、常见问题

### Q1: 启动报错 `ModuleNotFoundError`

```bash
# 确保安装了所有依赖
pip install -r requirements.txt
```

### Q2: M1 文献调研没有搜索结果

- 检查 `.env` 中是否配置了搜索 API
- 至少需要 `BRAVE_API_KEY` 或 `TAVILY_API_KEY` 之一
- 不配置则使用 DuckDuckGo (免费但较慢)

### Q3: Semantic Scholar 返回 429

- 申请免费 API Key: https://www.semanticscholar.org/product/api
- 在 `.env` 中配置 `SEMANTIC_SCHOLAR_API_KEY`
- 无 key 也能用，但每分钟请求数有限

### Q4: PDF 编译失败

- 需要安装 LaTeX
- Windows: 安装 MiKTeX
- 不装也不影响论文 LaTeX 源文件生成

### Q5: Windows 上如何运行

```bash
# 1. 安装 Python 3.12+
# 2. 用 PowerShell:
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

---

## 八、开源协议

MIT License

---

<p align="center">
  Built with ❤️ using AI-Scientist, GPT-Researcher, and PaperQA2
</p>
