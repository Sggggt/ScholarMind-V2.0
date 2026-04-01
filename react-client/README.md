# ScholarMind React 客户端

ScholarMind 的 React 前端工作台，面向桌面优先的学术研究工作流 SPA。

当前实现基于：

- React 18
- TypeScript
- Vite
- React Router
- Zustand

设计目标不是营销站，而是一个连续、可推进的研究工作系统。界面结构采用：

- 固定左侧导航 `Sidebar`
- 顶部工具栏 `TopBar`
- 中央编辑型工作画布 `Main Canvas`

## 当前状态

`react-client` 当前已经从纯页面原型推进到“真实前后端联调版”，包含：

- 登录页
- 共享 App Shell
- 16 个主路由页面骨架
- 统一 workflow stage 状态模型
- 一套可复用的编辑型 UI primitives
- REST / WebSocket 服务层
- 后端 DTO 与任务、日志、产物适配层
- 真实任务创建、切换、阶段同步与日志订阅
- 文献、缺口、想法、结果、论文、验证、代码仓库等页面的真实产物读取

当前重点已经从“搭骨架”转向“稳定联调与只读产物展示”，后续再继续做更细的交互和展示优化。

## 启动方式

在 `Project\ScholarMind\react-client` 下执行：

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

## 路由结构

认证区：

- `/login`

主应用区：

- `/workspace`
- `/workflow`
- `/history`
- `/settings`
- `/exploration`
- `/literature`
- `/extraction`
- `/trends`
- `/gaps`
- `/ideas`
- `/repository`
- `/experiment`
- `/agent-run`
- `/results`
- `/writing`
- `/validation`

## 目录结构

```text
react-client/
├─ src/
│  ├─ components/
│  │  ├─ app-shell/
│  │  │  ├─ AppLayout.tsx
│  │  │  ├─ Sidebar.tsx
│  │  │  ├─ TopBar.tsx
│  │  │  └─ WorkspaceSync.tsx
│  │  └─ ui/
│  │     ├─ AppIcon.tsx
│  │     └─ Primitives.tsx
│  ├─ data/
│  │  ├─ routeData.ts
│  │  └─ researchData.ts
│  ├─ adapters/
│  │  ├─ artifactAdapter.ts
│  │  ├─ logAdapter.ts
│  │  ├─ stageAdapter.ts
│  │  └─ taskAdapter.ts
│  ├─ services/
│  │  ├─ api.ts
│  │  └─ websocket.ts
│  ├─ pages/
│  │  ├─ LoginPage.tsx
│  │  ├─ MainChatWorkspacePage.tsx
│  │  ├─ WorkflowOverviewPage.tsx
│  │  ├─ HistoryPage.tsx
│  │  ├─ SettingsPage.tsx
│  │  ├─ DomainExplorationPage.tsx
│  │  ├─ LiteraturePage.tsx
│  │  ├─ InformationExtractionPage.tsx
│  │  ├─ TrendAnalysisPage.tsx
│  │  ├─ ResearchGapsPage.tsx
│  │  ├─ IdeaGenerationPage.tsx
│  │  ├─ RepositoryPage.tsx
│  │  ├─ ExperimentDesignPage.tsx
│  │  ├─ AgentRunPage.tsx
│  │  ├─ ResultsAnalysisPage.tsx
│  │  ├─ WritingPage.tsx
│  │  └─ ValidationPage.tsx
│  ├─ store/
│  │  └─ useWorkspaceStore.ts
│  ├─ types/
│  │  ├─ app.ts
│  │  └─ backend.ts
│  ├─ App.tsx
│  ├─ main.tsx
│  └─ styles.css
├─ index.html
├─ package.json
├─ tsconfig.json
└─ vite.config.ts
```

## 核心架构说明

### 1. 路由层

[App.tsx](./src/App.tsx) 负责：

- 登录态路由分流
- 认证区与主应用区切分
- 16 个页面挂载
- 未匹配路由兜底跳转

### 2. App Shell

[AppLayout.tsx](./src/components/app-shell/AppLayout.tsx) 负责共享工作台壳层：

- 左侧导航
- 顶部工具栏
- 中央主内容区

这是全局稳定结构，各页面只负责自身画布内容。

### 3. 状态管理

[useWorkspaceStore.ts](./src/store/useWorkspaceStore.ts) 统一管理：

- 当前 task 与当前 session
- 当前 workflow stage
- stages 状态
- chat messages
- 每个任务对应的 chat messages / logs 缓存
- literature filters / progress
- active paper / extraction section
- gaps / ideas / repository 选择态
- experiment design
- run steps / logs / progress
- writing sections
- validation claims

这一层同时承担三件事：

- 统一页面 UI 状态
- 承接后端任务事实状态
- 在任务切换时隔离不同任务的数据上下文

### 4. 数据组织

当前数据分三类：

- [routeData.ts](./src/data/routeData.ts)
  - 路由元信息
  - workflow stages 初始状态
- [researchData.ts](./src/data/researchData.ts)
  - 仍保留部分 UI 占位和降级数据
  - 在真实任务尚未生成产物时用于页面兜底
- `services/ + adapters/ + types/backend.ts`
  - 后端接口封装
  - WebSocket 订阅
  - task / stage / log / artifact 适配
  - 将后端任务流映射为桌面端页面状态

当前主链路页面已经优先读取服务端返回结果，而不是直接读取 mock。

### 5. 组件风格

[Primitives.tsx](./src/components/ui/Primitives.tsx) 提供了当前共享页面组件基底，例如：

- `EditorialPage`
- `SectionBlock`
- `SideIndex`
- `DecisionRail`
- `TimelineFlow`
- `ResearchTable`
- `ProcessStepper`
- `RunLogStream`
- `AnnotationPanel`
- `StatusBadge`

这些组件对应你的产品要求：低色彩、高留白、少卡片化、偏连续编辑画布。

## 当前已实现的交互

### Chat Workspace

- 在工作台输入研究主题后调用 `POST /api/tasks`
- 成功后追加用户消息和系统消息
- 自动设置当前任务并生成下游快捷动作
- 页面进入后自动同步当前任务状态

### Workflow

- 从真实 task modules 映射 12 个桌面端阶段
- 侧边栏、流程页和运行页共享同一套阶段状态
- 点击阶段后保持现有路由跳转

### Literature Collection

- 读取 `m1_sources.json`
- 读取 `m1_literature_review.md`
- 采集进度来自真实 M1 模块状态
- 从论文表格进入 extraction

### Information Extraction

- 基于 M1 真实产物派生提取视图
- active paper 切换
- extraction section 切换
- 概念关系展示

### Trend / Gaps / Ideas

- 趋势页基于 M1 / M2 结果派生
- 读取 `m2_gap_analysis.json`
- 读取 `m3_scored_ideas.json`
- gap 推进到 idea generation
- idea 选择后推进到 repository

### Experiment / Agent Run / Results

- 读取 `m5_experiment_plan.json`
- 运行页首屏拉取 task 和 logs
- 按任务订阅 `WS /api/ws/{task_id}`
- 读取 `m7_analysis.json`
- 结果切换与错误案例查看

### Writing / Validation

- 读取 `paper/paper.tex`
- 支持打开真实 `paper.pdf`
- 读取完整评审报告
- claim 勾选处理
- 只读展示真实写作与验证结果

## 和 stitch 模板的关系

当前代码不是直接逐页硬拷 `template/stitch` 下的 HTML，而是先抽成 React 化的可维护架构：

- 共用布局抽离
- 页面职责拆分
- 状态集中管理
- 共享组件复用

这样后续你发来更细的 stitch HTML、截图、说明时，可以逐页继续贴近视觉与交互，而不会变成难维护的静态拼接代码。

## 后续建议

下一步建议按这个顺序继续推进：

1. 将 `template/stitch` 的页面和当前 React 页面逐一对齐
2. 做更精细的版式和视觉还原
3. 继续清理仍保留的 UI mock 和降级数据
4. 规划构建产物接入 FastAPI 静态托管目录
5. 为关键页面补组件级和路由级测试

## 备注

- 当前为前端架构版，不是最终视觉精修版
- 当前主链路已接真实后端，仍保留少量 UI mock 作为降级数据
- 当前登录逻辑为前端模拟
- 当前已通过 `npm run build`
