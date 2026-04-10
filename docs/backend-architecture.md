# ScholarMind 后端工具调用架构图

> 本文档详细描述 ScholarMind 后端的完整工具调用架构，包括模块流水线、服务层、外部工具集成和数据流向。

---

## 1. 系统顶层架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                          客户端 (Client)                             │
│                Desktop (Next.js) / Mobile (Expo)                    │
└──────────┬──────────────────────┬──────────────────────┬───────────┘
           │ HTTP REST            │ WebSocket            │ File Serve
           ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     FastAPI 主应用 (main.py)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  ┌───────────┐  │
│  │  REST Routes  │  │  WebSocket   │  │  mDNS     │  │  Static   │  │
│  │  (api/routes) │  │  (api/ws)    │  │ Discovery │  │  Files    │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────┘  └───────────┘  │
└─────────┼─────────────────┼─────────────────────────────────────────┘
          │                 │
          ▼                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        服务层 (Services)                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │  TaskService     │  │ ConversationSvc  │  │ ConnectionSvc    │   │
│  │  (任务生命周期)   │  │ (对话控制)        │  │ (网络发现)        │   │
│  └────────┬─────────┘  └──────────────────┘  └──────────────────┘   │
└───────────┼─────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    流水线层 (Pipeline)                                │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │  Orchestrator    │  │  StateMachine    │  │  Tracer          │   │
│  │  (编排 M1-M9)    │  │  (状态控制)       │  │  (日志+WS推送)   │   │
│  └────────┬─────────┘  └──────────────────┘  └──────────────────┘   │
└───────────┼─────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     模块层 (Modules M1-M9)                           │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐  │
│  │ M1 │ │ M2 │ │ M3 │ │ M4 │ │ M5 │ │ M6 │ │ M7 │ │ M8 │ │ M9 │  │
│  │文献│ │空白│ │构思│ │代码│ │实验│ │实验│ │结果│ │论文│ │评审│  │
│  │调研│ │分析│ │打分│ │生成│ │设计│ │执行│ │分析│ │写作│ │打分│  │
│  └─┬──┘ └─┬──┘ └─┬──┘ └─┬──┘ └─┬──┘ └─┬──┘ └─┬──┘ └─┬──┘ └─┬──┘  │
└────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┼──────┘
     │      │      │      │      │      │      │      │      │
     ▼      ▼      ▼      ▼      ▼      ▼      ▼      ▼      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     工具调用层 (Tool Calls)                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │LLM API  │ │Web搜索  │ │PaperQA2 │ │Aider    │ │Subprocess│     │
│  │(统一)   │ │(多引擎) │ │(文献QA) │ │(AI编码) │ │(代码执行)│     │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │SSH远程  │ │Git操作  │ │LaTeX编译│ │PDF解析  │ │SQLite DB│      │
│  │(GPU)    │ │(版本控) │ │(论文)   │ │(文本提取)│ │(持久化) │      │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. 模块流水线执行流程

```
                    ┌──────────┐
                    │  创建任务  │
                    │  (API)    │
                    └────┬─────┘
                         │
                         ▼
              ┌──────────────────────┐
              │    M1: 文献调研        │
              │  ┌────────────────┐   │
              │  │ GPT-Researcher │   │    工具: GPT-Researcher, Brave/Tavily/Serper
              │  │ (深度调研)      │   │    降级: Semantic Scholar + LLM 摘要
              │  └────────────────┘   │
              │  产出: 文献综述.md     │
              │        来源列表.json   │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │    M2: 研究空白识别    │
              │  ┌────────────────┐   │
              │  │  PaperQA2      │   │    工具: PaperQA2 (文献索引+问答)
              │  │  (文献知识库)   │   │          LLM (空白识别)
              │  └────────────────┘   │    降级: Semantic Scholar 搜索
              │  产出: 空白分析.json   │
              │        种子idea.json  │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │    M3: Idea生成与打分  │◄────── 增量模式：可循环生成更多idea
              │  ┌────────────────┐   │
              │  │  AI-Scientist  │   │    工具: LLM (idea生成+反思)
              │  │  (idea生成)     │   │          Semantic Scholar (新颖性检查)
              │  │  + 树搜索变异   │   │          LLM (变异idea)
              │  └────────────────┘   │
              │  产出: scored_ideas   │
              │        ideas.json    │
              └──────────┬───────────┘
                         │
                   ◄──── 暂停等待用户选择 Idea ────►
                   (API: select-idea / continue-ideas)
                         │
                         ▼
              ┌──────────────────────┐
              │    M4: 代码仓库生成    │
              │  ┌────────────────┐   │
              │  │  Aider / LLM   │   │    工具: Aider (AI编码助手) ★
              │  │  (实验代码)     │   │          LLM (全量重写降级)
              │  │  + Git初始化    │   │          subprocess (baseline运行)
              │  │  + baseline运行 │   │          experiment_guard (静态校验)
              │  └────────────────┘   │
              │  产出: project/ 目录   │
              │        experiment.py  │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │    M5: 实验设计        │
              │  ┌────────────────┐   │
              │  │  AI-Scientist  │   │    工具: LLM (实验方案规划)
              │  │  coder_prompt  │   │          Aider (代码修改) ★
              │  │  + Aider实现   │   │          LLM (全量重写降级)
              │  └────────────────┘   │
              │  产出: experiment_plan│
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │    M6: Agent实验执行   │
              │  ┌────────────────────┐   │
              │  │ SSH远程 │ AIDE │本地│   │    工具: SSH (远程GPU) ★
              │  │ GPU执行 │框架  │进程│   │          AIDE (智能实验框架)
              │  └────────────────────┘   │          subprocess (本地执行)
              │  + LLM模拟实验数据         │          LLM (模拟实验数据)
              │  + 论文图表生成            │          matplotlib (绘图)
              │  产出: experiment_results │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │    M7: 结果分析        │
              │  ┌────────────────┐   │
              │  │  LLM 分析      │   │    工具: LLM (结果分析)
              │  │  (达标判断)     │   │          文件系统 (读取 final_info.json)
              │  └────────────────┘   │
              │  产出: analysis.json   │
              │   analysis_report.md  │
              └──────────┬───────────┘
                         │
                    ┌────┴────┐
                    │ 达标？   │
                    └────┬────┘
                   否 │      │ 是
          ┌──────────┘      └──────────┐
          ▼                              ▼
   回退到 M6                     ┌──────────────────┐
   重新实验                      │    M8: 论文写作    │
   (最多重试N次)                 │  ┌──────────────┐ │
                                │  │ 5阶段LLM写作  │ │   工具: LLM (多轮写作)
                                │  │ A.大纲生成    │ │         Semantic Scholar (引用)
                                │  │ B.逐节撰写    │ │         pdflatex+bibtex (编译)
                                │  │ C.一致性检查  │ │
                                │  │ D.引用ground  │ │
                                │  │ E.质量审计    │ │
                                │  └──────────────┘ │
                                │  产出: paper.tex   │
                                │        paper.pdf   │
                                └────────┬─────────┘
                                         │
                                         ▼
                                ┌──────────────────┐
                                │    M9: 评审打分    │
                                │  ┌──────────────┐ │
                                │  │ 多审稿人评审  │ │   工具: LLM (模拟审稿人)
                                │  │ (严格+宽松)   │ │         Semantic Scholar (文献)
                                │  │ + Meta-Review │ │         PDF解析 (论文文本)
                                │  │ + 可信度评估  │ │
                                │  └──────────────┘ │
                                │  产出: review_report│
                                └────────┬─────────┘
                                         │
                                         ▼
                                    ┌──────────┐
                                    │  完成 ✓   │
                                    └──────────┘
```

---

## 3. 工具调用详细清单

### 3.1 LLM 统一调用架构

```
                         模块调用方
                    ┌────────┬────────┐
                    │ call_llm│call_llm│
                    │ (通用)  │_json   │
                    └───┬────┴───┬────┘
                        │        │
                        ▼        ▼
              ┌─────────────────────────┐
              │   llm_client.py         │
              │  (httpx 异步HTTP)        │
              │  - 自动重试 (6次)        │
              │  - 指数退避 + 抖动       │
              │  - 暂停/中止感知         │
              │  - JSON mode 支持        │
              └───────────┬─────────────┘
                          │
                    ┌─────┴──────┐
                    │ OpenAI 兼容 │
                    │   API 端点  │
                    └─────┬──────┘
                          │
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
    ┌────────────┐ ┌────────────┐ ┌────────────┐
    │  智谱AI    │ │  OpenAI    │ │ 本地 LLM   │
    │ (GLM-4)   │ │ (GPT-4o)  │ │ (LM Studio)│
    └────────────┘ └────────────┘ └────────────┘

  ┌─────────────────────────────────────────────────┐
  │  ai_scientist_bridge.py (AI-Scientist 兼容层)    │
  │  - create_client_zhipu()      同步客户端          │
  │  - create_async_client_zhipu() 异步客户端         │
  │  - get_response_from_llm()    同步调用 (backoff)  │
  │  - get_response_from_llm_async() 异步调用 (重试)  │
  │  - extract_json_between_markers() JSON提取        │
  └─────────────────────────────────────────────────┘
```

**调用者矩阵：**

| 调用方式 | 使用模块 | 客户端 |
|---------|---------|--------|
| `call_llm()` | M1(降级), M2, M7, M8, M9, ConversationService | httpx (统一封装) |
| `call_llm_json()` | M2, ConversationService | httpx (统一封装) |
| `get_response_from_llm()` | M4(降级) | OpenAI SDK (同步) |
| `get_response_from_llm_async()` | M3, M5 | OpenAI SDK (异步) |

### 3.2 Web 搜索引擎

```
                    搜索请求
                       │
                       ▼
              ┌─────────────────┐
              │ search_for_papers│
              │ (ai_scientist_   │
              │  bridge.py)      │
              └────────┬────────┘
                       │
            ┌──────────┼──────────┐
            ▼          ▼          ▼
     ┌──────────┐ ┌─────────┐ ┌──────────┐
     │Brave API │ │Tavily   │ │Serper    │
     │(优先)    │ │         │ │          │
     └──────────┘ └─────────┘ └──────────┘
            │          │          │
            └──────────┼──────────┘
                       ▼
              ┌──────────────────┐
              │Semantic Scholar  │
              │(最终降级)        │
              └──────────────────┘
```

**使用场景：**
- M1: 降级路径文献检索
- M2: 降级路径空白分析
- M3: 新颖性检查 (Semantic Scholar)
- M8: 引用 grounding (Semantic Scholar)
- M9: 文献 grounding 评审 (Semantic Scholar)

### 3.3 Aider (AI 编码助手)

```
                    代码修改请求
                       │
                       ▼
              ┌─────────────────┐
              │  aider_runner.py │
              │  - check_aider_  │
              │    available()   │
              │  - run_aider_    │
              │    prompt()      │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  aider CLI      │
              │  (subprocess)   │
              │  - edit_format: │
              │    "whole"/"diff"│
              │  - 需要 git 仓库 │
              └─────────────────┘
```

**使用场景：**
- M4: 实现 research idea (edit_format="whole")
- M5: 实现实验代码修改 (edit_format="diff")
- M6: 迭代实验 (edit_format="diff")

### 3.4 PaperQA2 (文献问答引擎)

```
              ┌─────────────────┐
              │  PaperQA2       │
              │  (paper-qa)     │
              │                 │
              │  1. Docs() 建立  │
              │     文献索引     │
              │  2. aquery()    │
              │     基于文献回答 │
              └────────┬────────┘
                       │
                       ▼
              LLM + Embedding 模型
              (OpenAI 兼容 API)
```

**使用场景：**
- M2: 基于文献的 grounded 空白分析

### 3.5 代码执行引擎

```
              ┌───────────────────────────────┐
              │        代码执行引擎            │
              │                               │
              │  ┌───────────┐  ┌───────────┐ │
              │  │ SSH 远程  │  │ 本地执行   │ │
              │  │ (Fabric)  │  │ (subproc) │ │
              │  │           │  │           │ │
              │  │ ssh_runner│  │ async_    │ │
              │  │ .py       │  │ subprocess│ │
              │  │           │  │ .py       │ │
              │  └─────┬─────┘  └─────┬─────┘ │
              │        │              │       │
              │        ▼              ▼       │
              │   GPU服务器     本地Python    │
              └───────────────────────────────┘
```

**使用场景：**
- M4: 运行 baseline 实验 (run_0)
- M6: 执行实验 (run_1...run_N)
- M6: 运行 plot.py 生成图表
- M8: LaTeX 编译 (pdflatex + bibtex)

### 3.6 实验数据模拟

```
              ┌─────────────────────────┐
              │  experiment_sim.py      │
              │                         │
              │  generate_realistic_    │
              │  results() ──► LLM 生成 │
              │                 逼真数据 │
              │                         │
              │  generate_experiment_   │
              │  figures() ──► GPT 图像 │
              │                 API 绘图 │
              │                         │
              │  results_to_final_info() │
              │  转换为 AI-Scientist 格式 │
              └─────────────────────────┘
```

---

## 4. API 端点与工具调用映射

### 4.1 任务管理 API

```
POST   /api/tasks                         → create_task_and_start()     → PipelineOrchestrator.run()
GET    /api/tasks                         → SQLite 查询
GET    /api/tasks/{id}                    → SQLite 查询
POST   /api/tasks/{id}/pause              → pause_task_execution()      → StateMachine.pause()
POST   /api/tasks/{id}/resume             → resume_task_execution()     → StateMachine.resume()
POST   /api/tasks/{id}/abort              → abort_task_execution()      → StateMachine.abort()
POST   /api/tasks/{id}/restart            → restart_task_execution()    → 重建 Orchestrator
DELETE /api/tasks/{id}                    → delete_task_with_dependencies()
POST   /api/tasks/{id}/reset-module       → restart from specific module
```

### 4.2 Idea 管理 API (增量式)

```
GET    /api/tasks/{id}/ideas              → 读取 m3_scored_ideas.json
POST   /api/tasks/{id}/select-idea        → 中止当前 → restart from M4
POST   /api/tasks/{id}/continue-ideas     → restart from M3 (追加模式)
```

### 4.3 对话 API

```
GET    /api/chat/sessions                 → SQLite 查询
POST   /api/chat/sessions                 → create_chat_session()
POST   /api/chat/sessions/{id}/messages   → process_user_message()
                                            → _llm_decision() (LLM 意图识别)
                                            → create_task_and_start() 或控制操作
POST   /api/chat/sessions/{id}/bind-task  → 绑定任务到会话
DELETE /api/chat/sessions/{id}            → 删除会话
```

### 4.4 审阅 API

```
POST   /api/tasks/{id}/review             → orchestrator.submit_review() / recover_review_execution()
GET    /api/tasks/{id}/review-result      → 读取 m9_review_report.json
GET    /api/tasks/{id}/review-report      → 读取完整评审报告
```

### 4.5 文件与产物 API

```
GET    /api/files/{id}/{path}             → FileResponse (PDF内联显示)
GET    /api/tasks/{id}/artifacts          → 遍历 workspace 目录
GET    /api/tasks/{id}/artifact-content   → 读取文本/JSON产物
GET    /api/tasks/{id}/repo/tree          → 代码仓库目录树
GET    /api/tasks/{id}/repo/file          → 读取代码文件
GET    /api/tasks/{id}/output             → 输出链接 (PDF/代码/图表)
POST   /api/tasks/{id}/recompile-pdf      → pdflatex + bibtex 编译
GET    /api/tasks/{id}/pdf-status         → PDF 文件状态检查
```

### 4.6 WebSocket API

```
WS     /api/ws                            → 全局进度推送 (心跳检测)
WS     /api/ws/{task_id}                  → 任务级进度推送
                                            推送类型: progress / error / result / need_review / completed
```

---

## 5. 数据模型关系

```
┌────────────────┐       ┌────────────────┐
│     Task       │       │  ChatSession   │
│────────────────│       │────────────────│
│ id (PK)        │◄──┐   │ id (PK)        │
│ title          │   │   │ title          │
│ topic          │   │   │ summary        │
│ domain         │   └───│ task_id (FK)   │
│ status         │       │ created_at     │
│ current_module │       └───────┬────────┘
│ current_step   │               │
│ progress       │               │ 1:N
│ retry_count    │               ▼
│ config (JSON)  │       ┌────────────────┐
└───────┬────────┘       │  ChatMessage   │
        │                │────────────────│
        │ 1:N            │ id (PK)        │
        ├─────────────►  │ session_id(FK) │
        │                │ role           │
        │                │ kind           │
        │                │ content        │
        │                │ metadata (JSON)│
        │                └────────────────┘
        │
        │ 1:N    ┌────────────────┐
        ├───────►│   TraceLog     │
        │        │────────────────│
        │        │ id (PK)        │
        │        │ task_id (FK)   │
        │        │ module (1-9)   │
        │        │ module_name    │
        │        │ step           │
        │        │ level          │
        │        │ message        │
        │        │ token_usage    │
        │        │ duration_ms    │
        │        └────────────────┘
        │
        │ 1:N    ┌────────────────┐
        └───────►│  TaskOutput    │
                 │────────────────│
                 │ id (PK)        │
                 │ task_id (FK)   │
                 │ module (1-9)   │
                 │ output_type    │
                 │ file_path      │
                 │ content        │
                 │ metadata (JSON)│
                 └────────────────┘
```

---

## 6. 状态机流转

```
                  create_task_and_start()
                         │
                         ▼
                    ┌─────────┐
          ┌────────│ running  │────────┐
          │        └────┬─────┘        │
          │             │              │
     pause()      M7不达标重试    正常完成
          │        (M6→M7循环)         │
          ▼             │              ▼
    ┌─────────┐         │        ┌──────────┐
    │ paused  │         │        │completed │
    └────┬────┘         │        └──────────┘
         │              │
    resume()            │
         │              │
         ▼              ▼
    ┌─────────┐   ┌──────────┐
    │ running │   │  failed  │
    └─────────┘   └──────────┘
         │
    abort()
         │
         ▼
   ┌──────────┐
   │ aborted  │
   └──────────┘

  特殊: M3完成后自动暂停 (paused) 等待用户选择Idea
  特殊: M8论文完成后可进入 review 状态等待人工审阅
```

---

## 7. 文件系统产物结构

```
workspace/{task_id}/
├── _checkpoint.json              ← 断点续传信息
├── m1_literature_review.md       ← M1: 文献综述
├── m1_sources.json               ← M1: 来源列表
├── m2_gap_analysis.json          ← M2: 空白分析结果
├── m3_scored_ideas.json          ← M3: 打分后的idea列表
├── m4_code_gen_info.json         ← M4: 代码生成信息
├── m5_experiment_plan.json       ← M5: 实验计划
├── m6_experiment_results.json    ← M6: 实验结果
├── m7_analysis.json              ← M7: 分析数据
├── m7_analysis_report.md         ← M7: 分析报告
├── m9_review_report.json         ← M9: 评审报告
├── m9_review_report.md           ← M9: 评审Markdown
├── idea_selection.json           ← Idea选择记录
├── experiment_data.json          ← LLM模拟的实验数据
├── ai_scientist_workspace/       ← AI-Scientist 工作区
│   ├── prompt.json
│   ├── seed_ideas.json
│   ├── ideas.json
│   └── experiment.py
├── project/{idea_name}/          ← 代码仓库
│   ├── experiment.py             ← 核心实验代码
│   ├── plot.py                   ← 绘图脚本
│   ├── notes.txt                 ← AI-Scientist 笔记
│   ├── run_0/                    ← Baseline 结果
│   │   └── final_info.json
│   ├── run_1/                    ← 实验1 结果
│   │   └── final_info.json
│   ├── run_sim/                  ← LLM模拟结果
│   │   └── final_info.json
│   ├── figures/                  ← 生成的图表
│   └── latex/                    ← LaTeX 模板
└── paper/                        ← 论文输出
    ├── paper.tex                 ← LaTeX 源文件
    ├── paper.pdf                 ← 编译后的PDF
    ├── references.bib            ← BibTeX 引用
    └── figures/                  ← 论文图表
```

---

## 8. 各模块工具调用汇总表

| 模块 | 核心工具 | 降级工具 | 外部 API | 关键产出 |
|------|---------|---------|---------|---------|
| **M1 文献调研** | GPT-Researcher | Semantic Scholar + LLM | Brave/Tavily/Serper/DuckDuckGo | 文献综述.md |
| **M2 空白分析** | PaperQA2 | Semantic Scholar 搜索 | OpenAI 兼容 LLM | 空白分析.json + 种子idea |
| **M3 Idea打分** | LLM (AI-Scientist格式) | - | OpenAI 兼容 LLM, Semantic Scholar | scored_ideas.json |
| **M4 代码生成** | Aider + Git | LLM全量重写 | OpenAI 兼容 LLM | project/ 目录 |
| **M5 实验设计** | Aider | LLM全量重写 | OpenAI 兼容 LLM | experiment_plan.json |
| **M6 实验执行** | SSH/Fabric | AIDE → subprocess → LLM模拟 | OpenAI 兼容 LLM, GPT Image | experiment_results.json |
| **M7 结果分析** | LLM | - | OpenAI 兼容 LLM | analysis.json + report.md |
| **M8 论文写作** | LLM (5阶段) | - | OpenAI 兼容 LLM, Semantic Scholar, pdflatex | paper.tex + paper.pdf |
| **M9 评审打分** | LLM (多审稿人) | - | OpenAI 兼容 LLM, Semantic Scholar, PDF解析 | review_report.json |

---

## 9. 关键架构模式

### 9.1 统一 LLM 调用

所有 LLM 调用统一走 `llm_client.py` (httpx) 或 `ai_scientist_bridge.py` (OpenAI SDK)，通过 `runtime_config.py` 在任务级别切换模型/端点/密钥，无需修改业务代码。

### 9.2 渐进降级策略

每个模块都有主路径和降级路径：
- M1: GPT-Researcher → Semantic Scholar + LLM
- M2: PaperQA2 → Semantic Scholar 搜索 → 纯LLM
- M4/M5: Aider → LLM 全量重写 → 最小模板
- M6: SSH GPU → AIDE → subprocess → LLM 模拟

### 9.3 可中断执行

通过 `TaskStateMachine` 实现即时暂停/终止：
- `check_control()`: 同步检查点，抛出异常
- `run_interruptible()`: 包装长时间操作，支持轮询中断
- `wait_if_paused()`: 暂停时阻塞，恢复后继续

### 9.4 增量式 Idea 管理

M3 支持增量生成 idea，每生成一个就保存快照，用户可随时选择推进到 M4，无需等待所有 idea 生成完毕。

### 9.5 上下文累积传递

Orchestrator 在每个模块之间传递累积的 `context` 字典，包含所有上游模块的产出，通过 `_restore_context()` 支持从任意模块恢复执行。

### 9.6 实时进度推送

Tracer 双写：持久化到 SQLite (TraceLog) + 实时推送到 WebSocket 客户端，前端/移动端实时展示进度。

---

## 10. 配置与运行时

```
┌──────────────────────────────────────────────────┐
│  config.py (全局配置)                              │
│  - HOST, PORT, WORKSPACE_DIR                     │
│  - OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL │
│  - SSH_HOST, SSH_USER, SSH_WORK_DIR              │
│  - 各种超时配置                                    │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│  runtime_config.py (任务级配置覆盖)                 │
│  - bind_runtime_settings(task.config)             │
│  - 每个任务可覆盖: API key, model, search provider │
│  - 线程安全的配置上下文管理                         │
└──────────────────────────────────────────────────┘
```
