# ScholarMind Mobile

移动端客户端，基于 Expo Router + React Native。

当前版本已经按 `M1-3接入实施计划.md` 接入 ScholarMind 真实后端生态，职责聚焦在：

- 手机端创建研究任务
- 手机端查看 `M1 -> M2 -> M3` 进度
- 手机端查看 `M1` 文献综述、`M2` 研究空白、`M3` 候选 Idea
- 手机端在 `M3` 结束后继续生成 Idea 或选择一个 Idea 推进到 `M4`
- 与桌面端共享同一套 FastAPI 后端、任务状态、日志和产物

## 范围说明

本目录当前只接入后端真实支持的 `M1-M3` 闭环。

不在本阶段范围内的内容：

- 不把 `mobile/server/` 当作主任务后端
- 不在手机端重做桌面端完整工作台
- 不在手机端暴露“任意模块启动”之类后端并不支持的假能力
- 不修改原来的后端与桌面端逻辑

## 技术栈

- Expo 54
- React Native 0.81
- Expo Router
- TypeScript
- NativeWind

## 目录说明

```text
mobile/
├─ app/                 Expo Router 页面
│  ├─ (tabs)/           任务列表 / 新建 / 设置
│  └─ task/[id]/        任务详情 / 日志 / Idea 选择
├─ lib/
│  ├─ api.ts            FastAPI REST 客户端
│  ├─ websocket.ts      任务级 WebSocket 同步
│  ├─ task-provider.tsx 移动端任务状态与同步入口
│  ├─ task-store.ts     Context + reducer
│  ├─ task-helpers.ts   产物解析与页面派生数据
│  └─ types.ts          移动端共享类型
├─ tests/               Vitest 测试
└─ server/              模板自带后端，当前不作为 ScholarMind 主链路
```

## 真实接入方式

移动端不直接和桌面端通信，而是和 ScholarMind FastAPI 通信。

```text
Mobile App -> REST / WebSocket -> FastAPI Backend -> DB / Workspace / Pipeline
Desktop App -> REST / WebSocket -> FastAPI Backend -> DB / Workspace / Pipeline
```

已接入的后端接口主要包括：

- `POST /api/tasks`
- `GET /api/tasks`
- `GET /api/tasks/{id}`
- `POST /api/tasks/{id}/pause`
- `POST /api/tasks/{id}/resume`
- `POST /api/tasks/{id}/abort`
- `GET /api/tasks/{id}/logs`
- `GET /api/tasks/{id}/artifact-content`
- `GET /api/tasks/{id}/ideas`
- `POST /api/tasks/{id}/continue-ideas`
- `POST /api/tasks/{id}/select-idea`
- `GET /ws/{task_id}`

同步策略采用：

- 首次进入详情页先拉 REST 快照
- 再建立 `ws/{task_id}` 连接
- 收到 WS 消息后延迟刷新任务详情
- 断线后回退为 5 秒轮询

## 已完成页面

- `app/(tabs)/index.tsx`
  任务列表
- `app/(tabs)/create.tsx`
  新建任务，只保留真实支持字段
- `app/(tabs)/settings.tsx`
  后端地址配置、REST/WS 连通性测试
- `app/task/[id]/index.tsx`
  任务详情，展示 M1/M2/M3 实际摘要
- `app/task/[id]/logs.tsx`
  实时日志
- `app/task/[id]/ideas.tsx`
  M3 Idea 决策页

## 开发运行

先进入本目录：

```bash
cd mobile
```

安装依赖：

```bash
pnpm install
```

常用命令：

```bash
pnpm dev        # 同时启动模板 server 和 Expo dev server
pnpm android    # Android 调试
pnpm ios        # iOS 调试
pnpm check      # TypeScript 检查
pnpm test       # 单元测试
```

## 当前推荐联调方式

当前 ScholarMind 主链路使用仓库根目录下的真实后端 `backend/`。

所以联调时建议：

1. 在仓库根目录启动真实 FastAPI 后端
2. 在手机端设置页填写后端地址，例如：
   `http://192.168.1.100:8000`
3. 点击“测试连接”，确认 REST 和 WebSocket 都可用
4. 再启动 Expo 客户端进行真机或模拟器调试

说明：

- `pnpm dev` 会启动模板自带的 `mobile/server/`，它不是 ScholarMind 当前的主任务后端
- 当前接入 ScholarMind 真实任务链路时，移动端应连接仓库根目录的 `backend/`

如果只想启动 Expo 前端而不启动模板 server，可直接运行：

```bash
pnpm exec expo start
```

## 设置页填写什么地址

局域网联调：

```text
http://<电脑内网IP>:8000
```

例如：

```text
http://192.168.1.100:8000
```

如果使用内网穿透：

```text
https://your-public-domain-or-tunnel
```

移动端会自动把：

- `http://` 推导成 `ws://`
- `https://` 推导成 `wss://`

## 设计说明

本轮 UI 重设计参考了 `template/stitch_mobile` 的样板方向，但没有直接照搬模板页面。

当前视觉特征包括：

- 衬线标题 + mono 辅助标签
- 暖棕主色与纸张感背景
- 更强调状态、节奏和阅读感的任务卡片
- 更适合 M1-M3 轻控制场景的页面层级

## 测试

已验证命令：

```bash
pnpm check
pnpm test
```

## 后续建议

后续如果继续扩展移动端，建议顺序：

1. 先保持当前 FastAPI 契约不分叉
2. 再补通知、异常态和更多联调诊断
3. 最后评估是否需要扩展到 `M4+` 的轻量查看能力
