# ScholarMind RAG / Agent / 多模型 / 搜索引擎架构详解

> 本文档深入分析 ScholarMind 后端四大核心子系统的工具调用关系与内部架构：
> - **RAG (检索增强生成)**
> - **Agent (自主编码与实验 Agent)**
> - **多模型调用 (Multi-Model Orchestration)**
> - **搜索引擎 (Search Engine Integration)**

---

## 1. RAG 架构：两级检索增强生成

ScholarMind 采用**两级 RAG** 架构，在不同阶段使用不同粒度的检索策略：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ScholarMind RAG 架构                              │
│                                                                         │
│  第一级: GPT-Researcher (粗粒度 Web RAG)         ─── M1 阶段使用       │
│  第二级: PaperQA2 (细粒度文档级 RAG)             ─── M2 阶段使用       │
│  补充级: Semantic Scholar (结构化论文元数据检索)  ─── M2/M3/M8/M9 使用  │
│  补充级: Brave/Tavily/Serper (通用Web搜索)       ─── M1 降级路径使用   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.1 第一级：GPT-Researcher (M1 阶段)

GPT-Researcher 是一个自治研究 Agent，它内部实现了完整的 Web RAG 流程：
自主规划 → 多轮搜索 → 抓取网页 → 提取内容 → 聚合 → 生成报告。

```
                    M1 LiteratureModule.execute()
                           │
                           ▼
              ┌────────────────────────┐
              │   _configure_environment()   │
              │   设置 RETRIEVER 环境变量    │
              └────────────┬───────────┘
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
     RETRIEVER=brave  RETRIEVER=tavily  RETRIEVER=duckduckgo
     (需 BRAVE_API_KEY) (需 TAVILY_API_KEY) (无需密钥)
            │              │              │
            └──────────────┼──────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   GPTResearcher        │
              │   .conduct_research()  │◄─── 内部: 多轮 Web 搜索 + 抓取
              │                        │     自动选择信息源、评估信度
              └────────────┬───────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   .write_report()      │◄─── 内部: 基于检索结果生成综述
              │                        │     输出 Markdown 格式文献综述
              └────────────┬───────────┘
                           │
                      成功? ── 否 ──┐
                           │        │
                           │        ▼
                           │  _run_fallback_research()
                           │  (降级: Semantic Scholar + LLM)
                           │        │
                           ▼        ▼
                    保存: m1_literature_review.md
                          m1_sources.json
```

**GPT-Researcher 内部 RAG 流程：**

```
  用户主题 ──► 构造搜索查询
                  │
                  ▼
          ┌───────────────┐
          │  搜索引擎选择   │◄── runtime_config: search_provider
          │  (由环境变量控制)│
          └───────┬───────┘
                  │
     ┌────────────┼────────────┐
     ▼            ▼            ▼
  Brave API   Tavily API   DuckDuckGo
     │            │            │
     └────────────┼────────────┘
                  │  返回 URL 券表
                  ▼
          ┌───────────────┐
          │  Web Scraper   │◄─── 抓取每个 URL 的页面内容
          │  (bs4/crawl4ai)│     提取正文文本
          └───────┬───────┘
                  │
                  ▼
          ┌───────────────┐
          │  内容过滤+去重  │◄─── 评估信息源可信度
          │  (内部逻辑)     │     去除重复、低质量内容
          └───────┬───────┘
                  │
                  ▼
          ┌───────────────┐
          │  LLM 聚合摘要  │◄─── 调用 OpenAI 兼容 LLM
          │                │     基于检索到的所有内容生成综述
          └───────────────┘
```

### 1.2 第二级：PaperQA2 (M2 阶段)

PaperQA2 是一个专业的**文档级 RAG 引擎**，在 M1 文献综述基础上建立精确的知识库：

```
                    M2 GapAnalysisModule.execute()
                           │
                           ▼
              ┌─────────────────────────────────┐
              │         PaperQA2 RAG 流程         │
              │                                  │
              │  ① 构建 Docs 索引                  │
              │     │                             │
              │     ├─ 读取 M1 文献综述 (Markdown) │
              │     │  写入临时文件                  │
              │     │  调用 docs.aadd() 建立索引    │
              │     │     │                        │
              │     │     ├─ 文本分块 (Chunking)    │
              │     │     ├─ Embedding 向量化       │◄── OpenAI text-embedding-3-small
              │     │     │  或智谱 embedding-3     │     或智谱 embedding-3
              │     │     └─ 存入向量索引           │
              │     │                             │
              │  ② 多轮 Grounded QA               │
              │     │                             │
              │     ├─ Q1: "主要局限性..."          │
              │     ├─ Q2: "方法及其弱点..."        │◄── 每个查询都基于文献索引
              │     ├─ Q3: "数据集和基准..."        │     检索最相关的文档片段
              │     └─ Q4: "有前景但未探索的方向..." │
              │        │                          │
              │        ▼                          │
              │     docs.aquery(query)            │
              │     │                             │
              │     ├─ 向量相似度检索               │◄── 检索最相关的 chunks
              │     ├─ 构建 context window         │
              │     ├─ LLM 生成 grounded 回答      │◄── OpenAI 兼容 LLM
              │     └─ 附带真实文献引用             │
              │                                  │
              │  ③ 基于 Grounded 答案识别空白      │
              │     call_llm_json(gap_prompt)     │◄── 输入: 文献综述 + PaperQA 回答
              │     输出: 研究空白列表              │     输出: structured JSON
              │                                  │
              └──────────────────────────────────┘
                           │
                      成功? ── 否 ──┐
                           │        │
                           │        ▼
                           │  降级: Semantic Scholar 直接搜索
                           │  (跳过 PaperQA2 索引步骤)
                           │        │
                           ▼        ▼
                    保存: m2_gap_analysis.json
                          ai_scientist_workspace/seed_ideas.json
```

**PaperQA2 配置映射：**

```python
# m2_gap_analysis.py 中的 PaperQA2 配置
Settings(
    llm=f"openai/{paperqa_llm_model}",          # 通过 runtime_config 动态解析
    summary_llm=f"openai/{paperqa_llm_model}",   # 同上
    embedding=f"openai/{paperqa_embedding_model}",# 自适应选择:
                                                  #   智谱 → "embedding-3"
                                                  #   OpenAI → "text-embedding-3-small"
    parsing=ParsingSettings(use_doc_details=False),
)
```

### 1.3 补充级：Semantic Scholar 结构化检索

在 M3/M8/M9 阶段，系统使用 Semantic Scholar API 进行精确的学术论文元数据检索：

```
              search_for_papers(query, limit)
                     │
                     ▼
           ┌─────────────────┐
           │  优先级链路选择   │
           └────────┬────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   BRAVE_API_KEY  无 BRAVE    (始终可用)
   存在?          但有其他     │
        │           │          │
        ▼           ▼          ▼
  _search_brave()  跳过    _search_semantic_scholar()
        │                     │
        │              ┌──────┼──────┐
        │              ▼      │      │
        │         S2_API_KEY  │   无 Key
        │         存在?       │      │
        │           │        │      │
        │           ▼        │      ▼
        │     带 X-API-KEY   │   匿名请求(有限流)
        │     请求头          │      │
        │           │        │      │
        └───────────┼────────┘      │
                    ▼               │
              返回论文列表           │
              [{title, authors,     │
               abstract, year,      │
               citationCount, url}] │
                                 │
                           429限流? → sleep(3s) → 返回 None
```

**使用场景映射：**

| 阶段 | 调用方式 | 目的 |
|------|---------|------|
| M1 (降级) | `search_for_papers(topic_queries)` | 候选论文收集 → LLM 生成综述 |
| M2 (降级) | `search_for_papers(limitation_queries)` | 找相关论文的 abstract 作为空白分析依据 |
| M3 | `search_for_papers(idea_title)` | 验证 idea 新颖性（检查是否有重叠论文） |
| M8 | `search_for_papers(citation_queries)` | 论文引用 grounding（找真实论文插入 BibTeX） |
| M9 | `search_for_papers(paper_title)` | 评审文献 grounding（找相关论文辅助评审） |

---

## 2. Agent 架构：多层次自主编码与实验

ScholarMind 的 Agent 系统分为三个层次：**对话 Agent**、**编码 Agent**、**实验 Agent**。

```
┌──────────────────────────────────────────────────────────────────────┐
│                     ScholarMind Agent 三层架构                        │
│                                                                      │
│  Layer 1: 对话 Agent (ConversationService)                           │
│           ── 意图识别 + 任务控制                                      │
│                                                                      │
│  Layer 2: 编码 Agent (Aider + AI-Scientist)                          │
│           ── 代码生成/修改/迭代                                        │
│                                                                      │
│  Layer 3: 实验 Agent (SSH/AIDE/LLM-Sim)                              │
│           ── 代码执行 + 结果收集 + 自动优化                            │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.1 Layer 1：对话 Agent (ConversationService)

```
用户消息 ──► POST /api/chat/sessions/{id}/messages
                    │
                    ▼
           process_user_message()
                    │
                    ▼
           ┌──────────────────┐
           │  _llm_decision() │◄─── 第一选择: LLM 意图识别
           │                  │     输入: 对话历史 + 用户消息 + 任务状态
           │  LLM 返回 JSON:  │     输出: AgentDecision
           │  {               │
           │    assistant_reply,
           │    should_create_task,
           │    control_action,     ← pause/resume/abort/null
           │    title, topic,
           │    description
           │  }               │
           └────────┬─────────┘
                    │
               LLM可用? ── 否 ──┐
                    │            │
                    │            ▼
                    │    _fallback_decision()
                    │    (基于关键词的规则匹配)
                    │    │
                    │    ├─ 检测控制指令: "暂停"/"继续"/"终止"
                    │    ├─ 检测状态查询: "进展"/"状态"
                    │    ├─ 检测任务创建: 内容>=24字 & 非疑问句
                    │    └─ 其他: 引导用户提供更多信息
                    │            │
                    ▼            ▼
              AgentDecision
                    │
         ┌──────────┼──────────┬──────────┐
         ▼          ▼          ▼          ▼
    should_create  control    状态查询   普通对话
    _task=True     _action    回复      回复引导
         │          │
         ▼          ▼
  create_task_and   pause_task/
  _start()          resume/abort
         │          │
         ▼          ▼
  启动 Pipeline     控制运行中的
  (M1-M9)           Orchestrator
```

**对话 Agent 的工具调用关系：**

```
ConversationService
    │
    ├── call_llm_json() ──────► llm_client.py ──► httpx ──► OpenAI 兼容 API
    │                                                     (意图识别)
    │
    ├── create_task_and_start() ──► TaskService ──► PipelineOrchestrator
    │
    ├── pause_task_execution() ──► TaskService ──► Orchestrator.pause()
    │
    ├── resume_task_execution() ──► TaskService ──► Orchestrator.resume()
    │
    └── abort_task_execution() ──► TaskService ──► Orchestrator.abort()
```

### 2.2 Layer 2：编码 Agent (Aider + AI-Scientist)

Aider 是核心的**编码 Agent**，它接收自然语言指令，自主修改代码文件。系统还实现了
AI-Scientist 风格的 coder_prompt 来驱动 Aider 进行实验迭代。

```
                        编码请求
                           │
                           ▼
              ┌────────────────────────┐
              │  check_aider_available() │
              │  检测 Aider 是否安装      │
              │  查找路径:               │
              │   1. AIDER_EXE 环境变量  │
              │   2. AIDER_PYTHON 环境变量│
              │   3. 默认 venv 路径       │
              └────────────┬───────────┘
                           │
                      Aider 可用? ── 否 ──► LLM 全量重写降级
                           │
                           ▼
              ┌────────────────────────┐
              │  run_aider_prompt()    │
              │                        │
              │  构建 Aider CLI 命令:   │
              │  aider \               │
              │    --model openai/xxx \ │◄── runtime_config 动态解析模型
              │    --edit-format diff \ │
              │    --message-file xxx \ │◄── prompt 写入临时文件
              │    --yes-always \       │
              │    --file experiment.py │
              │                        │
              │  设置环境变量:           │
              │   OPENAI_API_KEY       │◄── runtime_config
              │   OPENAI_BASE_URL      │◄── runtime_config
              │   AIDER_MODEL          │◄── runtime_config
              └────────────┬───────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  async_subprocess      │
              │  .run_subprocess()     │
              │                        │
              │  Aider 内部流程:        │
              │   1. 读取代码文件       │
              │   2. 构建代码上下文      │
              │   3. 调用 LLM 规划修改  │◄── Aider 自主调用 LLM
              │   4. 应用代码修改        │
              │   5. 返回结果           │
              └────────────┬───────────┘
                           │
                     edit_format=diff 失败?
                           │
                      是 ──┘
                           │
                           ▼
                    自动重试 edit_format=whole
                    (Aider 用完整文件替换而非 diff patch)
```

**Aider 在不同模块中的调用模式：**

```
┌───────────────────────────────────────────────────────────────────────┐
│                     Aider 调用模式矩阵                                 │
│                                                                       │
│  M4 代码生成:                                                         │
│  ┌────────────────────┐                                              │
│  │ edit_format=whole  │  全文件重写模式                                │
│  │ files=[experiment  │  因为是从模板创建新代码                         │
│  │         .py,       │                                              │
│  │         plot.py]   │  Prompt: 包含 idea 描述 + baseline 结果        │
│  │                    │         + 实验输出格式要求                      │
│  │ 目的: 实现 idea    │                                              │
│  └────────────────────┘                                              │
│                                                                       │
│  M5 实验设计:                                                         │
│  ┌────────────────────┐                                              │
│  │ edit_format=diff   │  差异修改模式                                 │
│  │ files=[experiment  │  在现有代码上做增量修改                         │
│  │         .py]       │                                              │
│  │                    │  Prompt: AI-Scientist coder_prompt            │
│  │ 目的: 规划并实现   │         (含实验计划 + baseline 对比)            │
│  │       多组实验     │                                              │
│  └────────────────────┘                                              │
│                                                                       │
│  M6 实验执行 (迭代):                                                  │
│  ┌────────────────────┐                                              │
│  │ edit_format=diff   │  差异修改模式                                 │
│  │ files=[experiment  │  每次运行后 Aider 根据结果修改代码             │
│  │         .py]       │                                              │
│  │                    │  Prompt: 上一轮结果 + "实现下一个实验           │
│  │ 目的: 迭代优化     │          或 ALL_COMPLETED"                    │
│  │       实验代码     │                                              │
│  └────────────────────┘                                              │
└───────────────────────────────────────────────────────────────────────┘
```

### 2.3 Layer 3：实验 Agent (M6 AgentRunnerModule)

M6 是最复杂的 Agent 层，它自主执行实验代码并收集结果：

```
                    AgentRunnerModule.execute()
                           │
                           ▼
                 ssh_runner.is_available()?
                    │              │
                   是              否
                    │              │
                    ▼              ▼
          ┌─────────────┐  ┌──────────────────┐
          │  SSH 模式    │  │  本地模式          │
          │  (远程 GPU)  │  │                  │
          └──────┬──────┘  └────────┬─────────┘
                 │                  │
                 ▼                  ▼
          ┌─────────────┐  ┌──────────────────┐
          │ SSH 执行流程 │  │ _run_with_llm_   │
          │             │  │ sim()             │
          │ ① check_gpu │  │                  │
          │ ② upload    │  │ Step 1:           │
          │    代码      │  │  _run_local()     │
          │ ③ 安装依赖   │  │  ├─ _try_aide()  │◄── AIDE 框架 (可选)
          │ ④ 循环执行   │  │  │  尝试用 AIDE  │    自主实验
          │   experiment │  │  │  框架运行实验  │
          │ ⑤ 下载结果   │  │  │               │
          │             │  │  └─ 降级到        │
          │ Fabric 库:  │  │   subprocess     │
          │ conn.run()  │  │   + Aider 迭代   │
          │ conn.put()  │  │                  │
          │ conn.get()  │  │ Step 2:           │
          └──────┬──────┘  │  generate_       │
                 │         │  realistic_      │◄── LLM 生成逼真数据
                 │         │  results()       │
                 │         │                  │
                 │         │ Step 3:           │
                 │         │  generate_       │◄── GPT Image API
                 │         │  experiment_     │    生成论文图表
                 │         │  figures()       │
                 │         └────────┬─────────┘
                 │                  │
                 └──────────┬───────┘
                            │
                            ▼
                   保存: m6_experiment_results.json
```

**本地执行的 Aider 迭代 Agent 循环 (M6 核心)：**

```
              ┌──────────────────────────────────┐
              │         Agent 迭代循环              │
              │                                    │
              │  run_num = 1, current_iter = 0    │
              │         │                          │
              │         ▼                          │
              │  ┌─────────────────┐               │
              │  │ Aider 修改代码   │◄── AI-Scientist│
              │  │ (CODER_PROMPT)  │    coder_prompt│
              │  └────────┬────────┘               │
              │           │                        │
              │           ▼                        │
              │  ┌─────────────────┐               │
              │  │ subprocess 执行 │               │
              │  │ python          │               │
              │  │ experiment.py   │               │
              │  │ --out_dir=run_N │               │
              │  └────────┬────────┘               │
              │           │                        │
              │      成功? │                        │
              │       ┌───┘                        │
              │       │                            │
              │    是 │    否                      │
              │       ▼         ▼                  │
              │  收集 metrics  current_iter++     │
              │  run_num++     继续修改代码         │
              │       │         (最多 MAX_ITERS 轮)│
              │       │                            │
              │       ▼                            │
              │  结果中有 "ALL_COMPLETED"?          │
              │       │                            │
              │    是 │    否                      │
              │       ▼         ▼                  │
              │     退出     继续下一轮 Aider      │
              │              (含上轮结果反馈)       │
              │                        │           │
              │                        └──► 回到顶部│
              │                                    │
              └──────────────────────────────────┘
```

---

## 3. 多模型调用架构

### 3.1 整体多模型路由

```
┌───────────────────────────────────────────────────────────────────────┐
│                     多模型调用路由架构                                   │
│                                                                       │
│                       runtime_config.py                               │
│                    (ContextVar 任务级配置)                              │
│                           │                                           │
│              ┌────────────┼────────────┐                              │
│              ▼            ▼            ▼                              │
│       get_openai_    get_openai_    get_search_                      │
│       api_key()      model()       provider()                        │
│              │            │            │                              │
│              └────────────┼────────────┘                              │
│                           │                                           │
│           ┌───────────────┼───────────────┐                          │
│           ▼               ▼               ▼                          │
│    ┌────────────┐  ┌────────────┐  ┌────────────┐                   │
│    │ 路径 A:    │  │ 路径 B:    │  │ 路径 C:    │                   │
│    │ llm_client │  │ ai_scientist│  │experiment  │                   │
│    │ .py        │  │ _bridge.py │  │ _sim.py    │                   │
│    │            │  │            │  │            │                   │
│    │ httpx      │  │ OpenAI SDK │  │ httpx      │                   │
│    │ (REST)     │  │ (同步/异步) │  │ (REST)     │                   │
│    └──────┬─────┘  └──────┬─────┘  └──────┬─────┘                   │
│           │               │               │                          │
│           └───────────────┼───────────────┘                          │
│                           ▼                                           │
│                   OpenAI 兼容 API 端点                                 │
│              (config.OPENAI_BASE_URL)                                  │
│                           │                                           │
│          ┌────────────────┼────────────────┐                         │
│          ▼                ▼                ▼                         │
│   ┌───────────┐   ┌───────────┐   ┌───────────┐                    │
│   │  智谱AI   │   │  OpenAI   │   │  本地 LLM  │                    │
│   │  GLM-4    │   │  GPT-4o  │   │ LM Studio │                    │
│   └───────────┘   └───────────┘   └───────────┘                    │
│                                                                       │
│   额外路由:                                                            │
│   ┌──────────────────────────────────────────┐                       │
│   │  experiment_sim.py → get_gpt_api_key()   │◄── GPT API (独立配置) │
│   │  优先使用 GPT API 生成实验数据和图表       │    可与主 LLM 不同    │
│   └──────────────────────────────────────────┘                       │
└───────────────────────────────────────────────────────────────────────┘
```

### 3.2 两条 LLM 调用链路

系统存在**两条并行的 LLM 调用链路**，分别服务不同场景：

```
链路 1: llm_client.py (统一 HTTP 客户端)
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  调用方: M1(降级), M2, M7, M8, M9, ConversationService          │
│                                                                  │
│  call_llm(prompt, system, model, temperature, max_tokens,       │
│           response_format, state)                                │
│       │                                                          │
│       ├── 构建 OpenAI Chat Completions 请求体                     │
│       │                                                          │
│       ├── httpx.AsyncClient (180s 超时)                          │
│       │       │                                                  │
│       │       └── state.run_interruptible(request) ◄── 可中断    │
│       │                                                          │
│       ├── 重试机制 (最多 6 次)                                    │
│       │       ├── HTTP 429/5xx → 指数退避 + Retry-After 头解析   │
│       │       ├── 连接错误 → 指数退避 + 随机抖动                  │
│       │       └── 每次重试前检查 state.check_control()            │
│       │                                                          │
│       └── 返回 (text, total_tokens)                              │
│                                                                  │
│  call_llm_json(prompt, ...) → response_format="json_object"     │
│       └── 同上 + JSON 解析                                       │
│                                                                  │
│  特点:                                                           │
│    ✓ 纯异步 (httpx)                                              │
│    ✓ 可被 TaskStateMachine 中断                                   │
│    ✓ 统一重试 + 退避策略                                          │
│    ✓ 所有模块共享                                                 │
└──────────────────────────────────────────────────────────────────┘

链路 2: ai_scientist_bridge.py (OpenAI SDK 兼容层)
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  调用方: M3, M4(降级), M5                                        │
│                                                                  │
│  get_response_from_llm(msg, client, model, system_message,       │
│                        msg_history, temperature)                 │
│       │                                                          │
│       ├── OpenAI SDK 同步客户端                                   │
│       ├── backoff 指数退避 (最多 3 次, 总时限 60s)                │
│       └── 支持 msg_history 多轮对话                               │
│                                                                  │
│  get_response_from_llm_async(msg, client, model, ...)            │
│       │                                                          │
│       ├── OpenAI SDK 异步客户端 (timeout=None)                    │
│       ├── 手动重试 (最多 3 次, 指数退避上限 30s)                  │
│       ├── asyncio.wait_for 超时控制                               │
│       └── 支持 msg_history 多轮对话                               │
│                                                                  │
│  extract_json_between_markers(llm_output)                        │
│       └── 从 LLM 输出提取 ```json ... ``` 块                     │
│                                                                  │
│  特点:                                                           │
│    ✓ AI-Scientist 原生接口兼容                                    │
│    ✓ 支持多轮对话 (msg_history)                                   │
│    ✓ M3 idea 生成需要维护完整对话历史                              │
│    ✓ 消息格式: system + user/assistant 交替                       │
└──────────────────────────────────────────────────────────────────┘
```

### 3.3 任务级模型切换机制

```
                    创建任务时
                        │
                        ▼
              POST /api/tasks
              body: { topic, config: {
                  runtime_settings: {
                      openai_api_key: "sk-xxx",        ← 可覆盖全局
                      openai_base_url: "https://...",   ← 可指向不同服务商
                      openai_model: "glm-4-flash",     ← 可选择不同模型
                      search_provider: "brave",         ← 可选择搜索引擎
                      ...
                  }
              }}
                        │
                        ▼
              create_task_and_start()
                        │
                        ▼
              ensure_runtime_settings(task.config)
              (合并用户配置 + 全局默认)
                        │
                        ▼
              保存到 task.config (JSON 列)
                        │
                        ▼
              PipelineOrchestrator.run()
                        │
                        ▼
              bind_runtime_settings(task.config)
              (设置 ContextVar，线程安全)
                        │
                        ▼
              ┌─────────────────────────┐
              │  在整个 pipeline 执行期间: │
              │                         │
              │  get_openai_api_key()   │──► 返回任务特定的 key
              │  get_openai_base_url()  │──► 返回任务特定的 URL
              │  get_openai_model()     │──► 返回任务特定的 model
              │  get_search_provider()  │──► 返回任务特定的搜索引擎
              │                         │
              │  所有模块透明使用任务级配置 │
              │  无需修改任何业务代码      │
              └─────────────────────────┘
                        │
                        ▼
              finally:
              reset_runtime_settings(token)
              (恢复全局默认配置)
```

### 3.4 多模型调用场景矩阵

| 调用场景 | 链路 | 模型选择逻辑 | temperature | 特殊需求 |
|---------|------|------------|-------------|---------|
| M1 降级综述生成 | 链路1 (call_llm) | runtime_config model | 0.2 | 低创造性，忠实摘要 |
| M2 空白识别 JSON | 链路1 (call_llm_json) | runtime_config model | 默认 | JSON mode |
| M2 种子 idea | 链路1 (call_llm) | runtime_config model | 0.7 | 高创造性 |
| M3 idea 生成 | 链路2 (async SDK) | runtime_config model | 默认 | 多轮对话 (msg_history) |
| M3 idea 反思 | 链路2 (async SDK) | runtime_config model | 默认 | 多轮对话 + 迭代优化 |
| M3 变异 idea | 链路2 (async SDK) | runtime_config model | 0.8 | 高创造性 |
| M4 Aider 编码 | Aider 内部 | runtime_config model | Aider 控制 | Aider 自主调用 LLM |
| M4 LLM 降级重写 | 链路1 (experiment_guard) | runtime_config model | 0.2 | 低创造性，精确代码 |
| M5 实验规划 | 链路2 (async SDK) | runtime_config model | 0.7 | 中等创造性 |
| M5 Aider 修改 | Aider 内部 | runtime_config model | Aider 控制 | diff/whole 编辑 |
| M6 实验数据模拟 | 独立 (httpx) | GPT API 优先 → runtime model | 0.3 | GPT-4o 生成逼真数据 |
| M6 图表生成 | 独立 (httpx) | GPT Image API | - | gpt-image-1 图像生成 |
| M7 结果分析 | 链路1 (call_llm) | runtime_config model | 0.3 | 低创造性，客观分析 |
| M8 大纲生成 | 链路1 (call_llm) | runtime_config model | 0.3 | 结构化输出 |
| M8 逐节撰写 | 链路1 (call_llm) | runtime_config model | 0.4 | 学术写作风格 |
| M8 引用 grounding | Semantic Scholar | - | - | 真实论文检索 |
| M8 质量审计 | 链路1 (call_llm) | runtime_config model | 0.2 | 严格审查 |
| M9 审稿人评审 | 链路1 (call_llm) | runtime_config model | 0.75 | 模拟真实审稿人 |
| M9 Meta-Review | 链路1 (call_llm) | runtime_config model | 0.5 | 综合评审 |
| 对话意图识别 | 链路1 (call_llm_json) | runtime_config model | 0.2 | JSON mode, 严格解析 |

---

## 4. 搜索引擎集成架构

### 4.1 搜索引擎全景

```
┌───────────────────────────────────────────────────────────────────────┐
│                     搜索引擎集成架构                                    │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │                 统一搜索入口层                                │     │
│  │                                                              │     │
│  │  search_for_papers(query, result_limit)                      │     │
│  │  位于: modules/ai_scientist_bridge.py                        │     │
│  │                                                              │     │
│  │  优先级链: Brave → (无结果) → Semantic Scholar               │     │
│  └──────────────────────────┬──────────────────────────────────┘     │
│                             │                                         │
│  ┌──────────────────────────┼──────────────────────────────────┐     │
│  │                          ▼                                   │     │
│  │  ┌─────────────────────────────────────────────────────┐   │     │
│  │  │          搜索引擎适配器                               │   │     │
│  │  │                                                      │   │     │
│  │  │  ┌───────────┐ ┌───────────┐ ┌───────────┐         │   │     │
│  │  │  │Brave Search│ │  Tavily   │ │  Serper   │         │   │     │
│  │  │  │(优先级 1)  │ │(优先级 2) │ │(优先级 3) │         │   │     │
│  │  │  │            │ │           │ │           │         │   │     │
│  │  │  │ Web搜索   │ │ Web搜索   │ │ Google搜索│         │   │     │
│  │  │  │ 不限流    │ │           │ │           │         │   │     │
│  │  │  └───────────┘ └───────────┘ └───────────┘         │   │     │
│  │  │                                                      │   │     │
│  │  │  ┌──────────────────────────────────────────────┐   │   │     │
│  │  │  │         Semantic Scholar (最终降级)            │   │   │     │
│  │  │  │                                               │   │   │     │
│  │  │  │  学术论文专用 API                               │   │   │     │
│  │  │  │  返回结构化元数据:                              │   │   │     │
│  │  │  │   title, authors, venue, year,                 │   │   │     │
│  │  │  │   abstract, citationCount, citationStyles      │   │   │     │
│  │  │  │                                               │   │   │     │
│  │  │  │  有限流风险 (429 → sleep 3s)                    │   │   │     │
│  │  │  └──────────────────────────────────────────────┘   │   │     │
│  │  └─────────────────────────────────────────────────────┘   │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │                GPT-Researcher 内置搜索                        │     │
│  │  (M1 主路径使用, 通过环境变量控制选择)                         │     │
│  │                                                              │     │
│  │  RETRIEVER 环境变量:                                         │     │
│  │   brave    → BRAVE_API_KEY     (外部API, Web搜索)            │     │
│  │   tavily   → TAVILY_API_KEY    (外部API, Web搜索)            │     │
│  │   serper   → SERPER_API_KEY    (外部API, Google搜索)         │     │
│  │   duckduckgo                   (免费, 无需密钥)              │     │
│  │                                                              │     │
│  │  选择逻辑 (M1 _configure_environment):                       │     │
│  │   1. runtime_config 指定的 search_provider                   │     │
│  │   2. 如有对应 API key → 设置该引擎                            │     │
│  │   3. 否则降级到 DuckDuckGo (免费)                             │     │
│  └──────────────────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────────────────┘
```

### 4.2 搜索引擎选择流程

```
M1 LiteratureModule._configure_environment()
                │
                ▼
    preferred = get_search_provider()  ◄── runtime_config
                │
    ┌───────────┼───────────┬───────────┐
    ▼           ▼           ▼           ▼
  "brave"    "tavily"    "serper"   "duckduckgo"
    │           │           │           │
    ▼           ▼           ▼           ▼
 有BRAVE     有TAVILY    有SERPER     直接设置
 API_KEY?    API_KEY?    API_KEY?     RETRIEVER
    │           │           │           │
 是→设置      是→设置      是→设置      │
 否↓          否↓          否↓         │
    │           │           │           │
    └───────────┼───────────┘           │
                │                       │
                ▼                       │
        检查是否有任何可用 Key            │
                │                       │
        ┌───────┼───────┐              │
        ▼       ▼       ▼              │
     BRAVE   TAVILY  SERPER            │
     可用?   可用?   可用?              │
        │       │       │              │
        ▼       ▼       ▼              │
        └───────┼───────┘              │
                │  无任何Key            │
                ▼                       ▼
           RETRIEVER=duckduckgo ◄──────┘
```

### 4.3 搜索结果数据流

```
search_for_papers(query, limit=10)
        │
        ▼
┌──────────────────────────────────────────┐
│  _search_brave(query, limit)              │
│                                          │
│  GET https://api.search.brave.com/       │
│      /res/v1/web/search                  │
│  Params: q="{query} site:arxiv.org OR    │
│          site:semanticscholar.org OR      │
│          site:aclanthology.org"           │
│  Headers: X-Subscription-Token           │
│                                          │
│  返回标准化格式:                           │
│  [{title, authors:[], venue, year,        │
│    abstract, citationCount:0, url}]       │
└──────────────────────┬───────────────────┘
                       │ 无结果
                       ▼
┌──────────────────────────────────────────┐
│  _search_semantic_scholar(query, limit)  │
│                                          │
│  GET https://api.semanticscholar.org/    │
│      /graph/v1/paper/search              │
│  Params: query, limit,                   │
│          fields=title,authors,venue,     │
│                  year,abstract,          │
│                  citationStyles,         │
│                  citationCount            │
│  Headers: X-API-KEY (如有)               │
│                                          │
│  限流处理:                                │
│   429 → sleep(3s) → return None          │
│   成功 → sleep(1s) → return data          │
│                                          │
│  返回标准化格式:                           │
│  [{title, authors:[{name}], venue, year,  │
│    abstract, citationCount,               │
│    citationStyles, url}]                  │
└──────────────────────────────────────────┘
```

---

## 5. 完整工具调用关系图

以下展示一个完整的研究任务从创建到完成的全部工具调用关系：

```
用户: "研究 Transformer 在长文本理解中的局限性"
                    │
                    ▼
    ┌─ ConversationService ─────────────────────────────────────────┐
    │  call_llm_json() ──► httpx ──► 智谱AI/GLM-4 ──► 意图识别     │
    │  → should_create_task=true                                     │
    │  → create_task_and_start()                                     │
    └──────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
    ┌─ M1 文献调研 ────────────────────────────────────────────────┐
    │                                                                │
    │  [主路径] GPT-Researcher                                       │
    │    ├── RETRIEVER=brave → Brave Web Search API                  │
    │    │                  → 抓取网页 → 提取内容                     │
    │    ├── 内部 LLM 调用 → OpenAI 兼容 API → 聚合摘要              │
    │    └── .write_report() → OpenAI 兼容 API → 生成综述            │
    │                                                                │
    │  [降级路径]                                                     │
    │    ├── search_for_papers() → Brave API / Semantic Scholar      │
    │    └── call_llm() → OpenAI 兼容 API → 基于检索结果生成综述     │
    │                                                                │
    │  产出: m1_literature_review.md                                 │
    └──────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
    ┌─ M2 研究空白识别 ────────────────────────────────────────────┐
    │                                                                │
    │  [主路径] PaperQA2                                             │
    │    ├── Docs.aadd(文献综述) → 文本分块 → Embedding 向量化       │
    │    │                           → OpenAI embedding-3 /          │
    │    │                              text-embedding-3-small       │
    │    ├── Docs.aquery(Q1-Q4) → 向量检索 → LLM grounded 回答      │
    │    │                        → OpenAI 兼容 API                  │
    │    └── call_llm_json(空白分析) → OpenAI 兼容 API               │
    │                                                                │
    │  [降级路径]                                                     │
    │    ├── search_for_papers() → Semantic Scholar                  │
    │    └── call_llm() → 基于搜索结果分析空白                       │
    │                                                                │
    │  call_llm() → OpenAI 兼容 API → 生成种子 idea                  │
    │                                                                │
    │  产出: m2_gap_analysis.json + seed_ideas.json                  │
    └──────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
    ┌─ M3 Idea 生成与打分 ─────────────────────────────────────────┐
    │                                                                │
    │  [循环: 每个 idea]                                             │
    │    ├── get_response_from_llm_async() → OpenAI SDK → 生成 idea  │
    │    │   (多轮对话: idea_first_prompt → 反思 → 精炼)             │
    │    └── _write_idea_snapshot() → 保存增量快照                    │
    │                                                                │
    │  [可选: 树搜索变异]                                             │
    │    └── get_response_from_llm_async() → 生成变异 idea           │
    │                                                                │
    │  [可选: 新颖性检查]                                             │
    │    └── search_for_papers() → Semantic Scholar → 验证新颖性     │
    │                                                                │
    │  暂停等待用户选择...                                            │
    │                                                                │
    │  产出: m3_scored_ideas.json                                    │
    └──────────────────────────┬─────────────────────────────────────┘
                               │ (用户选择 idea)
                               ▼
    ┌─ M4 代码生成 ────────────────────────────────────────────────┐
    │                                                                │
    │  subprocess → git init + git commit (Aider 前置要求)           │
    │                                                                │
    │  [主路径] Aider 编码 Agent                                     │
    │    └── aider --model openai/xxx --edit-format whole            │
    │        → Aider 内部自主调用 LLM → 修改 experiment.py           │
    │                                                                │
    │  [降级路径] experiment_guard.py                                │
    │    ├── rewrite_experiment_with_llm() → call_llm() → 生成代码   │
    │    └── build_fallback_experiment_code() → 本地模板生成          │
    │                                                                │
    │  subprocess → python experiment.py --out_dir=run_0 (baseline) │
    │                                                                │
    │  产出: project/{idea_name}/experiment.py                       │
    └──────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
    ┌─ M5 实验设计 ────────────────────────────────────────────────┐
    │                                                                │
    │  get_response_from_llm_async() → OpenAI SDK → 规划实验方案     │
    │                                                                │
    │  [主路径] Aider 编码 Agent                                     │
    │    └── aider --edit-format diff → 修改 experiment.py           │
    │                                                                │
    │  [降级] rewrite_experiment_with_llm() → call_llm() → 重写     │
    │                                                                │
    │  产出: m5_experiment_plan.json                                 │
    └──────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
    ┌─ M6 实验 Agent 执行 ─────────────────────────────────────────┐
    │                                                                │
    │  [模式选择]                                                    │
    │    SSH 可用?                                                   │
    │    ├── 是: Fabric → GPU服务器 → 执行实验                       │
    │    └── 否: 本地执行 + LLM 数据补充                             │
    │                                                                │
    │  [本地模式 Agent 循环]                                         │
    │    ├── Aider → 修改代码 (含上轮结果反馈)                       │
    │    ├── subprocess → python experiment.py → 收集结果            │
    │    └── 循环直到 MAX_RUNS 或 ALL_COMPLETED                      │
    │                                                                │
    │  [LLM 数据补充]                                                │
    │    ├── generate_realistic_results() → GPT API → 逼真实验数据   │
    │    └── generate_experiment_figures() → GPT Image API → 图表   │
    │                                                                │
    │  产出: m6_experiment_results.json                              │
    └──────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
    ┌─ M7 结果分析 ────────────────────────────────────────────────┐
    │                                                                │
    │  call_llm(分析结果) → OpenAI 兼容 API → 分析+达标判断          │
    │  call_llm(生成报告) → OpenAI 兼容 API → Markdown 分析报告      │
    │                                                                │
    │  未达标? → 回退到 M6 重新实验 (最多 N 次)                     │
    │                                                                │
    │  产出: m7_analysis.json + m7_analysis_report.md                │
    └──────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
    ┌─ M8 论文写作 ────────────────────────────────────────────────┐
    │                                                                │
    │  5阶段 LLM 写作 (全部通过 call_llm):                           │
    │    A. call_llm() → 大纲生成                                    │
    │    B. call_llm() × N → 逐节撰写 (每节可读前面已写内容)         │
    │    C. call_llm() → 跨节一致性检查                               │
    │    D. search_for_papers() → Semantic Scholar → 引用 grounding │
    │       call_llm() → 插入 BibTeX 引用                            │
    │    E. call_llm() × 2 → 质量审计 (去AI废话+LaTeX校验)          │
    │                                                                │
    │  subprocess → pdflatex + bibtex → 编译 PDF                    │
    │                                                                │
    │  产出: paper.tex + paper.pdf                                   │
    └──────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
    ┌─ M9 评审打分 ────────────────────────────────────────────────┐
    │                                                                │
    │  pymupdf4llm / pymupdf / pypdf → 提取论文文本                 │
    │                                                                │
    │  search_for_papers() → Semantic Scholar → 相关论文检索         │
    │  (用于文献 grounding 评审)                                     │
    │                                                                │
    │  [多审稿人并行评审]                                             │
    │  for i in range(num_reviewers):                                │
    │      call_llm(审稿人prompt) → OpenAI 兼容 API → 评审结果       │
    │      (交替使用严格/宽松 system prompt)                          │
    │                                                                │
    │  call_llm(Meta-Review) → OpenAI 兼容 API → 综合评审            │
    │                                                                │
    │  产出: m9_review_report.json + m9_review_report.md             │
    └────────────────────────────────────────────────────────────────┘
```

---

## 6. 关键设计总结

### RAG 设计哲学

| 层级 | 工具 | 粒度 | 目的 | 使用阶段 |
|------|------|------|------|---------|
| Web RAG | GPT-Researcher | 页面级 | 广泛收集相关资料，生成综述 | M1 |
| 文档 RAG | PaperQA2 | 段落级 | 精确回答基于文献的问题 | M2 |
| 论文检索 | Semantic Scholar | 元数据级 | 验证新颖性、补充引用、辅助评审 | M3/M8/M9 |
| 通用搜索 | Brave/Tavily/Serper | 页面级 | 补充 Web 信息收集 | M1 |

### Agent 设计哲学

| 层级 | Agent 类型 | 自主程度 | 工具 | 使用阶段 |
|------|-----------|---------|------|---------|
| 对话 Agent | 意图识别+控制 | 低 (单轮决策) | LLM + TaskService | 全程 |
| 编码 Agent | 代码生成/修改 | 中 (受prompt约束) | Aider + LLM | M4/M5/M6 |
| 实验 Agent | 实验+迭代优化 | 高 (自主循环) | SSH/AIDE/Aider/Subprocess | M6 |

### 多模型设计哲学

```
全局默认 (config.py)
    │
    ├── OPENAI_API_KEY / BASE_URL / MODEL  ←── 主 LLM (智谱AI/OpenAI/本地)
    ├── GPT_API_KEY / GPT_API_BASE         ←── 辅助 LLM (GPT-4o for 数据/图片)
    ├── ANTHROPIC_API_KEY / MODEL          ←── 预留 (Anthropic Claude)
    └── LOCAL_LLM_*                        ←── 预留 (本地 GGUF 模型)

任务级覆盖 (runtime_config.py + task.config)
    │
    └── ContextVar 线程安全切换
        每个 PipelineOrchestrator 可绑定不同的模型配置
        支持同一服务器同时运行使用不同模型的任务
```

### 搜索引擎设计哲学

```
选择策略:
  1. 优先使用付费 API (Brave → Tavily → Serper) — 不限流、速度快
  2. 最终降级到 Semantic Scholar — 免费、学术专用、有限流
  3. GPT-Researcher 支持 DuckDuckGo — 完全免费、无需密钥

配置方式:
  ├── 全局默认: config.SEARCH_PROVIDER
  ├── 任务覆盖: task.config.runtime_settings.search_provider
  └── 动态降级: 无 API key 时自动切换到下一个可用引擎
```
