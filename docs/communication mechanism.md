# ScholarMind 自动化科研系统 - 三端分工计划

> 说明：
> 这是一份历史规划文档。
> 当前运行行为与最新接入方式，请以以下文档为准：
> - `README.md`
> - `mobile/README.md`
> 这份计划未完全覆盖的后续实现包括：
> - 移动端基于 mDNS / Bonjour 的局域网自动发现
> - `mobile/scripts/run-android.mjs` 原生 Android 打包流程
> - 从主后端 Python 环境拆出的独立 Aider 运行时

## 项目总览

```
ScholarMind/
├── backend/           ← 后端服务（FastAPI）
├── react-client/      ← 桌面端（React Web）
├── mobile/            ← 移动端（Expo / React Native）
└── docs/              ← 共享文档（规划阶段设想）
```

三端通过 REST API + WebSocket 通信，接口契约由后端定义，桌面端和移动端遵循。

---

## 一、通信契约（三端共识）

### 1.1 后端地址配置

```
后端默认地址: http://localhost:8000
API 基础路径: /api
WebSocket 路径: /ws (全局), /ws/{task_id} (任务级)
静态文件: /files/{task_id}/...
```

### 1.2 核心 REST API

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 健康检查 |
| `GET` | `/api/connection-info` | 获取连接信息（含局域网地址） |
| `POST` | `/api/tasks` | 创建研究任务 |
| `GET` | `/api/tasks` | 任务列表 |
| `GET` | `/api/tasks/{id}` | 任务详情 |
| `POST` | `/api/tasks/{id}/pause` | 暂停任务 |
| `POST` | `/api/tasks/{id}/resume` | 恢复任务 |
| `POST` | `/api/tasks/{id}/abort` | 终止任务 |
| `POST` | `/api/tasks/{id}/restart` | 重启任务 |
| `DELETE` | `/api/tasks/{id}` | 删除任务 |
| `GET` | `/api/tasks/{id}/logs` | 追溯日志 |
| `GET` | `/api/tasks/{id}/output` | 产出物(论文PDF/代码/数据) |
| `GET` | `/api/tasks/{id}/artifacts` | 产物列表 |
| `GET` | `/api/tasks/{id}/artifact-content` | 读取产物内容 |
| `GET` | `/api/tasks/{id}/repo/tree` | 代码目录树 |
| `GET` | `/api/tasks/{id}/repo/file` | 读取代码文件 |
| `POST` | `/api/tasks/{id}/recompile-pdf` | 重新编译论文PDF |
| `GET` | `/api/tasks/{id}/ideas` | 获取候选Idea列表 |
| `POST` | `/api/tasks/{id}/continue-ideas` | 继续生成更多Idea |
| `POST` | `/api/tasks/{id}/select-idea` | 选择Idea推进到M4 |
| `POST` | `/api/tasks/{id}/review` | 人工审阅反馈 |
| `GET` | `/api/tasks/{id}/review-result` | 获取评审结果 |

### 1.3 聊天会话 API

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/chat/sessions` | 会话列表 |
| `POST` | `/api/chat/sessions` | 创建会话 |
| `GET` | `/api/chat/sessions/{id}` | 会话详情 |
| `DELETE` | `/api/chat/sessions/{id}` | 删除会话 |
| `POST` | `/api/chat/sessions/{id}/messages` | 发送消息 |
| `POST` | `/api/chat/sessions/{id}/bind-task` | 绑定任务 |

### 1.4 WebSocket 消息类型

**客户端参数**:
- `client_type=desktop` (桌面端)
- `client_type=mobile` (移动端)

**服务端推送消息**:

```typescript
// 进度更新
{ type: "progress", task_id: string, module: "M1", step: string, percent: number, message: string }

// 模块结果
{ type: "result", task_id: string, module: "M1", data: {...} }

// 需要人工审阅
{ type: "need_review", task_id: string, module: "M3", content: {...} }

// 错误
{ type: "error", task_id: string, module: "M1", error: string }

// 任务完成
{ type: "completed", task_id: string, output_url: string }

// 心跳 ping (需回复 pong)
{ type: "ping", timestamp: number }

// ── v2 新增：多代理运行时消息 ──

// 代理树状态（整体结构更新）
{ type: "agent_tree", task_id: string,
  active_cycle: string,          // 当前代理周期标识
  root_agent: {                  // 根代理（coordinator）
    role: string, status: string, module: number, phase: string
  },
  child_agents: Array<{          // 子代理列表
    role: string, status: string, module: number, phase: string
  }>
}

// 代理事件（单条事件推送）
{ type: "agent_event", task_id: string,
  module: number, phase: string, kind: string,
  message: string, payload: object, role: string
}

// 代理摘要（周期级摘要）
{ type: "agent_summary", task_id: string,
  cycle: string, summary: string, metrics: object
}
```

### 1.5 数据模型（共享类型）

```typescript
// 任务状态
type TaskStatus = 'pending' | 'running' | 'paused' | 'review' | 'completed' | 'failed' | 'aborted'

// 模块状态
type ModuleStatus = 'waiting' | 'running' | 'completed' | 'failed' | 'skipped'

// 任务响应
interface TaskResponse {
  id: string;
  title: string;
  topic: string;
  description: string;
  status: TaskStatus;
  current_module?: string | null;
  modules: ModuleProgress[];  // 9个模块的进度
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  output_url?: string | null;
  // ── v2 新增：多代理状态字段 ──
  active_cycle?: string | null;
  root_agent?: {
    role: string; status: string; module: number; phase: string;
  } | null;
  child_agents?: Array<{
    role: string; status: string; module: number; phase: string;
  }> | null;
  recent_summary?: string | null;
}

// 模块进度
interface ModuleProgress {
  module_id: string;  // "M1" ~ "M9"
  status: ModuleStatus;
  percent: number;
  step: string;
  message: string;
  started_at?: string | null;
  finished_at?: string | null;
}
```

### 1.6 运行时配置 API（v2 新增）

运行时动态配置允许在前端实时修改 API Key、模型、SSH 参数等，无需重启后端。

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/runtime-settings` | 获取当前运行时配置 |
| `PUT` | `/api/runtime-settings` | 更新运行时配置 |

**RuntimeSettings 字段**:
```typescript
interface RuntimeSettings {
  openai_api_key?: string;
  openai_base_url?: string;
  openai_model?: string;
  ssh_host?: string;
  ssh_user?: string;
  ssh_work_dir?: string;
  brave_api_key?: string;
  aider_python?: string;
  aider_exe?: string;
  // ... 其他运行时可调参数
}
```

### 1.7 数据库扩展（v2 新增）

Task 表新增字段：
- `active_cycle`：当前代理周期标识
- `root_agent`：根代理状态（JSON）
- `child_agents`：子代理列表（JSON）
- `recent_summary`：最近代理摘要

新增 Agent 相关表：
- `agent_runs`：代理运行记录
- `agent_tasks`：代理任务分配
- `agent_events`：代理事件日志

支持多代理树结构（coordinator → worker 层级）。

---

## 二、后端服务 (backend/)

### 2.1 职责

1. FastAPI 服务搭建，定义所有 API 接口
2. 9模块研究流水线核心引擎
3. WebSocket 实时推送
4. 任务状态机与回退逻辑
5. 全程追溯日志系统
6. 数据库(任务/日志/产出物持久化)
7. 运行时配置管理（LLM/搜索服务）

### 2.2 目录结构

```
backend/
├── main.py                         # FastAPI入口 + CORS + 静态文件托管
├── config.py                       # 全局配置 (环境变量、API keys)
├── requirements.txt
│
├── api/
│   ├── routes.py                   # REST 路由 (40+ 端点)
│   ├── ws.py                       # WebSocket 连接管理 (心跳、重连)
│   └── schemas.py                  # Pydantic 请求/响应模型
│
├── pipeline/
│   ├── orchestrator.py             # 流水线编排 (M1→M9 顺序执行)
│   ├── state.py                    # 状态机 (pending→running→review→completed)
│   └── tracer.py                   # 日志追踪 (每步输入/输出/耗时/token)
│
├── modules/
│   ├── base.py                     # 模块基类 (统一接口)
│   ├── llm_client.py               # LLM 客户端 (多服务商兼容)
│   ├── m1_literature.py            # M1: 文献调研
│   ├── m2_gap_analysis.py          # M2: 研究空白识别
│   ├── m3_idea_scoring.py          # M3: Idea 生成与打分
│   ├── m4_code_gen.py              # M4: 代码生成
│   ├── m5_experiment_design.py     # M5: 实验设计
│   ├── m6_agent_runner.py          # M6: Agent 实验执行
│   ├── m7_analysis.py              # M7: 结果分析 + 回退判断
│   ├── m8_paper_writing.py         # M8: 论文写作
│   ├── m9_review.py                # M9: 评审打分
│   └── ssh_runner.py               # SSH 远程执行 (可选)
│
├── services/
│   ├── task_service.py             # 任务 CRUD + 执行控制
│   ├── conversation_service.py     # 聊天会话服务
│   └── connection_service.py       # 连接信息 (局域网/公网地址)
│
├── db/
│   ├── database.py                 # SQLite + aiosqlite 连接
│   └── models.py                   # ORM 模型 (Task, TraceLog, ChatSession, ChatMessage)
│
└── workspace/                      # 任务工作区 (运行时生成)
    └── {task_id}/
        ├── m1_literature_review.md
        ├── m2_gap_analysis.json
        ├── m3_scored_ideas.json
        ├── project_*/               # 实验代码
        ├── paper/                   # 论文 (LaTeX + PDF)
        └── m9_review_report.json
```

### 2.3 核心技术

- **框架**: FastAPI 0.115
- **数据库**: SQLite + aiosqlite (异步)
- **LLM**: OpenAI 兼容 API (支持智谱、DeepSeek、本地模型)
- **搜索**: Brave/Tavily/Serper + DuckDuckGo 降级
- **学术**: Semantic Scholar API
- **模板**: AI-Scientist (实验代码)、GPT-Researcher (文献搜索)

### 2.4 9 模块流水线

```
M1:文献调研 → M2:研究空白 → M3:Idea生成 → M4:代码生成 → M5:实验设计
                                              ↓
M9:评审打分 ← M8:论文写作 ← M7:结果分析 ← M6:Agent实验
                                              ↑
                                         回退 (不达标时)
```

---

## 三、桌面端 (react-client/)

### 3.1 职责

1. React Web 应用（桌面浏览器为主）
2. 完整功能工作台界面
3. 实时日志终端
4. 论文/代码/结果预览与编辑
5. 研究流程可视化面板

### 3.2 目录结构

```
react-client/
├── package.json
├── vite.config.ts
│
├── src/
│   ├── main.tsx                      # 入口
│   │
│   ├── pages/                        # 18+ 功能页面
│   │   ├── DashboardPage.tsx         # 总览面板 (任务列表 + 状态)
│   │   ├── TaskCreatePage.tsx        # 创建研究任务
│   │   ├── TaskDetailPage.tsx        # 任务详情 (9模块进度)
│   │   ├── PipelinePage.tsx          # 流水线可视化
│   │   ├── LogViewerPage.tsx         # 全程日志
│   │   ├── PaperPreviewPage.tsx      # 论文预览
│   │   ├── CodeEditorPage.tsx        # 代码查看
│   │   ├── ReviewResultPage.tsx      # 评审结果
│   │   ├── SettingsPage.tsx          # 运行时配置
│   │   └── ...
│   │
│   ├── components/
│   │   ├── app-shell/                # 应用框架
│   │   │   ├── TopBar.tsx
│   │   │   ├── SideNav.tsx
│   │   │   └── StatusBar.tsx
│   │   ├── task/                     # 任务相关组件
│   │   ├── module-progress/          # 模块进度组件
│   │   └── ...
│   │
│   ├── services/
│   │   ├── api.ts                    # REST API 客户端
│   │   ├── websocket.ts              # WebSocket 客户端
│   │   └── preferences.ts            # 本地偏好设置
│   │
│   ├── store/
│   │   └── useWorkspaceStore.ts      # Zustand 全局状态
│   │
│   ├── types/
│   │   └── backend.ts                # 后端类型定义
│   │
│   └── styles.css
│
└── index.html
```

### 3.3 核心技术

- **框架**: React 18 + TypeScript + Vite
- **状态**: Zustand
- **路由**: React Router 6
- **UI**: 自定义组件 + Tailwind CSS (计划)
- **通信**: Fetch API + WebSocket API

---

## 四、移动端 (mobile/)

### 4.1 职责

1. React Native 跨平台 App (iOS + Android)
2. 远程控制后端 (创建/暂停/终止任务)
3. 实时进度追踪
4. 中间结果审阅 (M3 Idea 决策)
5. 论文/结果轻量预览

### 4.2 目录结构

```
mobile/
├── package.json
├── app.json                         # Expo 配置
│
├── app/                             # Expo Router 页面
│   ├── (tabs)/
│   │   ├── _layout.tsx              # Tab 布局
│   │   ├── index.tsx                # 任务列表
│   │   ├── create.tsx               # 新建任务
│   │   └── settings.tsx             # 后端地址配置
│   ├── task/
│   │   └── [id]/
│   │       ├── _layout.tsx          # 任务详情布局
│   │       ├── index.tsx            # 任务详情 (M1-M3 进度)
│   │       ├── logs.tsx             # 实时日志
│   │       └── ideas.tsx            # Idea 决策页
│   └── _layout.tsx                  # 根布局
│
├── lib/
│   ├── api.ts                       # FastAPI REST 客户端
│   ├── websocket.ts                 # WebSocket 客户端
│   ├── task-provider.tsx            # 任务状态 Context
│   ├── task-store.ts                # Context + reducer
│   ├── task-helpers.ts              # 产物解析
│   ├── types.ts                     # 类型定义
│   ├── _core/
│   │   ├── api.ts                   # 核心 API 封装
│   │   ├── auth.ts                  # 认证 (预留)
│   │   └── manus-runtime.ts         # 运行时集成
│   └── artifact-*.ts                # 产物适配器
│
├── components/
│   ├── ArtifactDisplay.tsx          # 产物展示
│   └── ...
│
├── tests/
│   └── api.test.ts                  # API 测试
│
└── server/                          # 模板自带后端 (非 ScholarMind 主链路)
```

### 4.3 核心技术

- **框架**: Expo 54 + React Native 0.81
- **路由**: Expo Router (文件系统路由)
- **状态**: React Context + hooks
- **样式**: NativeWind (Tailwind for RN)
- **存储**: AsyncStorage

### 4.4 当前接入范围

移动端当前接入后端真实支持的 **M1-M3 闭环**:

- ✅ 手机端创建研究任务
- ✅ 手机端查看 M1/M2/M3 进度
- ✅ 手机端查看文献综述、研究空白、候选 Idea
- ✅ 手机端在 M3 结束后继续生成 Idea 或选择 Idea 推进到 M4
- ✅ 与桌面端共享同一 FastAPI 后端

不在当前范围:
- ❌ mobile/server/ 不是主任务后端
- ❌ 不重做桌面端完整工作台
- ❌ 不暴露后端不支持的假能力

---

## 五、三端协作时序

```
阶段1: 后端先行 (B1-B2)
  后端: 搭骨架 + 任务 CRUD API + 第一个模块
  桌面端: 等待
  移动端: 等待

阶段2: 前端启动 (B3-B5 并行 D1-D3 并行 M1-M3)
  后端: 继续开发 M2-M6 模块
  桌面端: 初始化 + 对接 API + Dashboard
  移动端: 初始化 + 对接 API + 任务列表

阶段3: 三端联调 (B6-B9 并行 D4-D8 并行 M4-M8)
  后端: 完成全流程 + WebSocket
  桌面端: 完成所有页面
  移动端: 完成所有页面

阶段4: 集成测试
  联合测试: 手机创建任务 → 后端执行 → 手机/桌面实时查看 → 产出论文
```

---

## 六、当前状态

| 端 | 状态 | 下一步 |
|----|------|--------|
| 后端 | ✅ 核心完成 | 优化错误处理、补充单元测试 |
| 桌面端 | ✅ 核心完成 | UI 优化、性能提升 |
| 移动端 | ✅ M1-M3 接入 | 继续接入 M4+ 查看能力 |

---

## 七、依赖关系

```
后端 (无依赖，最先启动)
    │
    ├──► 桌面端 (依赖后端 API 定义)
    │
    └──► 移动端 (依赖后端 API 定义)
```

**关键约束**: 后端 `api/schemas.py` 定义后需同步给前端 `types/backend.ts` 和移动端 `lib/types.ts`，保持三端类型一致。

---

## 八、开发启动

### 后端启动

```bash
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 桌面端启动

```bash
cd react-client
npm install
npm run dev      # 开发模式: http://localhost:5173
npm run build    # 生产构建
```

### 移动端启动

```bash
cd mobile
pnpm install
pnpm dev         # 启动 Expo 开发服务器
pnpm android     # Android 调试
pnpm ios         # iOS 调试
```

---

## 九、局域网发现契约

为降低移动端首次接入成本，项目统一采用“mDNS 自动发现 + 手动地址兜底”的双通道方案。

### 9.1 后端职责

- 启动时发布 `_scholarmind._tcp.local.`
- TXT 记录包含设备标识、服务名称、协议、API 路径、WebSocket 路径和健康检查路径
- `/api/connection-info` 返回局域网地址与公网地址，供桌面端和移动端统一消费

### 9.2 移动端职责

- 仅在原生构建下启用 `react-native-zeroconf`
- 设置页允许用户发起扫描
- 扫描到服务后，先验证 `/api/health` 和 `/api/ws`
- 校验通过后保存为默认后端
- 始终保留“手动地址”兜底

### 9.3 桌面端职责

- 当前不做 mDNS 扫描
- 继续消费 `/api/connection-info`，展示局域网 / 公网推荐地址

### 9.4 联调结论

- 真机优先用于验证 mDNS
- AVD 优先用于验证 UI、调试逻辑和手动地址连接

---

最后更新: 2026年4月
