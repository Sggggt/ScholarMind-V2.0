# ScholarMind React Client

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

`react-client` 已完成第一版前端架构搭建，包含：

- 登录页
- 共享 App Shell
- 16 个主路由页面骨架
- 统一 workflow stage 状态模型
- 一套可复用的编辑型 UI primitives
- 基于 mock data 的跨页状态承接与交互演示

当前重点是把产品结构、页面关系、状态流和视觉基底搭起来，便于后续继续按 `template/stitch` 的页面细化还原。

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
│  │  │  └─ TopBar.tsx
│  │  └─ ui/
│  │     ├─ AppIcon.tsx
│  │     └─ Primitives.tsx
│  ├─ data/
│  │  ├─ routeData.ts
│  │  └─ researchData.ts
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
│  │  └─ app.ts
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

- 当前 session
- 当前 workflow stage
- stages 状态
- chat messages
- literature filters / progress
- active paper / extraction section
- gaps / ideas / repository 选择态
- experiment design
- run steps / logs / progress
- writing sections
- validation claims

这一层体现了“前一阶段输出成为下一阶段输入”的连续工作流逻辑。

### 4. 数据组织

当前数据分两类：

- [routeData.ts](./src/data/routeData.ts)
  - 路由元信息
  - workflow stages 初始状态
- [researchData.ts](./src/data/researchData.ts)
  - 页面 mock 数据
  - chat、paper、gaps、results、writing、validation 等演示数据

后续接 API 时，可以逐步把这里的 mock 数据替换成服务端返回结果。

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

- 消息追加
- 底部固定输入区
- 从 AI 回复中的快捷动作跳转到下游模块

### Workflow

- 阶段状态统一展示
- 进入页面时可将 `not-started` 推进为 `in-progress`
- 完成某阶段后自动推进下一阶段

### Literature Collection

- 数据源切换
- 搜索参数编辑
- 采集进度模拟
- 从论文表格进入 extraction

### Information Extraction

- active paper 切换
- extraction section 切换
- 概念关系展示

### Trend / Gaps / Ideas

- 趋势时间范围切换
- gap 切换
- gap 推进到 idea generation
- idea 选择后推进到 repository

### Experiment / Agent Run / Results

- 实验计划编辑
- 保存后推进到 agent run
- run progress/logs 流式模拟推进
- 结果切换与错误案例查看

### Writing / Validation

- section 导航
- 正文编辑
- evidence links 展示
- claim 勾选处理

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
3. 接入真实后端 API
4. 把 mock workflow 状态替换成真实任务状态
5. 为关键页面补组件级和路由级测试

## 备注

- 当前为前端架构版，不是最终视觉精修版
- 当前数据主要为 mock data
- 当前登录逻辑为前端模拟
- 当前已通过 `npm run build`
