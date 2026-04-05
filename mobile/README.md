# ScholarMind Mobile

移动端客户端，基于 Expo Router + React Native。

## 当前状态

本移动端已完成 **M1-M3 闭环** 接入 ScholarMind 后端生态。

### 支持的功能

- ✅ 手机端创建研究任务
- ✅ 手机端查看 `M1 → M2 → M3` 进度
- ✅ 手机端查看 `M1` 文献综述、`M2` 研究空白、`M3` 候选 Idea
- ✅ 手机端在 `M3` 结束后继续生成 Idea 或选择一个 Idea 推进到 `M4`
- ✅ 与桌面端共享同一套 FastAPI 后端、任务状态、日志和产物
- ✅ 实时进度追踪 (WebSocket)
- ✅ 任务控制 (暂停/恢复/终止)

### 不在当前范围

- ❌ 不把 `mobile/server/` 当作主任务后端
- ❌ 不在手机端重做桌面端完整工作台
- ❌ 不在手机端暴露"任意模块启动"之类后端并不支持的假能力
- ❌ 不修改原来的后端与桌面端逻辑

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Expo 54 + React Native 0.81 |
| 路由 | Expo Router (文件系统路由) |
| 语言 | TypeScript |
| 样式 | NativeWind (Tailwind for RN) |
| 状态 | React Context + hooks |
| 存储 | AsyncStorage |

---

## 目录说明

```
mobile/
├── app/                            # Expo Router 页面
│   ├── (tabs)/                      # 主页面 (底部导航)
│   │   ├── _layout.tsx              # Tab 布局
│   │   ├── index.tsx                # 任务列表
│   │   ├── create.tsx               # 新建任务
│   │   └── settings.tsx             # 后端地址配置
│   └── task/[id]/                   # 任务详情
│       ├── _layout.tsx              # 详情页布局
│       ├── index.tsx                # 任务进度 (M1-M3)
│       ├── logs.tsx                 # 实时日志
│       └── ideas.tsx                # Idea 决策页
│
├── lib/                             # 核心逻辑
│   ├── api.ts                       # FastAPI REST 客户端
│   ├── websocket.ts                 # WebSocket 客户端
│   ├── task-provider.tsx            # 任务状态 Context
│   ├── task-store.ts                # Context + reducer
│   ├── task-helpers.ts              # 产物解析
│   ├── types.ts                     # 移动端共享类型
│   └── _core/                       # 核心封装
│       ├── api.ts
│       ├── auth.ts
│       └── manus-runtime.ts
│
├── components/                      # UI 组件
│   └── ArtifactDisplay.tsx          # 产物展示组件
│
├── tests/                           # 测试
│   └── api.test.ts
│
└── server/                          # 模板自带后端 (非 ScholarMind 主链路)
```

---

## 真实接入方式

移动端不直接和桌面端通信，而是和 ScholarMind FastAPI 通信。

```text
Mobile App -> REST / WebSocket -> FastAPI Backend -> DB / Workspace / Pipeline
Desktop App -> REST / WebSocket -> FastAPI Backend -> DB / Workspace / Pipeline
```

### 已接入的后端接口

**任务管理**:
- `POST /api/tasks` - 创建任务
- `GET /api/tasks` - 任务列表
- `GET /api/tasks/{id}` - 任务详情
- `POST /api/tasks/{id}/pause` - 暂停
- `POST /api/tasks/{id}/resume` - 恢复
- `POST /api/tasks/{id}/abort` - 终止
- `DELETE /api/tasks/{id}` - 删除

**任务数据**:
- `GET /api/tasks/{id}/logs` - 日志
- `GET /api/tasks/{id}/artifact-content` - 产物内容
- `GET /api/tasks/{id}/ideas` - Idea 列表
- `POST /api/tasks/{id}/continue-ideas` - 继续生成
- `POST /api/tasks/{id}/select-idea` - 选择 Idea

**WebSocket**:
- `ws://host/api/ws/{task_id}?client_type=mobile` - 任务级订阅

### 同步策略

1. 首次进入详情页先拉 REST 快照
2. 再建立 `ws/{task_id}` 连接
3. 收到 WS 消息后延迟刷新任务详情
4. 断线后回退为 5 秒轮询

---

## 已完成页面

| 页面 | 路径 | 功能 |
|------|------|------|
| 任务列表 | `/(tabs)/index.tsx` | 显示所有任务 |
| 新建任务 | `/(tabs)/create.tsx` | 创建新任务 |
| 设置页 | `/(tabs)/settings.tsx` | 后端地址、连接测试 |
| 任务详情 | `/task/[id]/index.tsx` | M1/M2/M3 进度展示 |
| 实时日志 | `/task/[id]/logs.tsx` | 日志流 |
| Idea 决策 | `/task/[id]/ideas.tsx` | 选择或继续生成 |

---

## 开发运行

### 安装依赖

```bash
cd mobile
pnpm install
```

### 常用命令

```bash
pnpm dev        # 同时启动模板 server 和 Expo dev server
pnpm android    # Android 调试
pnpm ios        # iOS 调试
pnpm check      # TypeScript 检查
pnpm test       # 单元测试
```

### 仅启动 Expo 前端

```bash
pnpm exec expo start
```

---

## 联调配置

### 1. 启动后端

在仓库根目录启动真实 FastAPI 后端:

```bash
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. 配置移动端后端地址

在手机端设置页填写后端地址:

**局域网联调**:
```
http://<电脑内网IP>:8000
例如: http://192.168.1.100:8000
```

**公网联调** (使用内网穿透):
```
https://your-public-domain-or-tunnel
```

移动端会自动把:
- `http://` 推导成 `ws://`
- `https://` 推导成 `wss://`

### 3. 测试连接

点击设置页"测试连接"按钮，确认 REST 和 WebSocket 都可用。

### 4. 启动 Expo

```bash
pnpm dev
# 或
pnpm exec expo start
```

然后用 Expo Go 扫码即可。

---

## 设计说明

本轮 UI 重设计参考了 `template/stitch_mobile` 的样板方向，但没有直接照搬模板页面。

当前视觉特征:

- 衬线标题 + mono 辅助标签
- 暖棕主色与纸张感背景
- 更强调状态、节奏和阅读感的任务卡片
- 更适合 M1-M3 轻控制场景的页面层级

---

## 测试

已验证命令:

```bash
pnpm check
pnpm test
```

---

## 后续建议

如果继续扩展移动端，建议顺序:

1. 先保持当前 FastAPI 契约不分叉
2. 补通知、异常态和更多联调诊断
3. 评估是否需要扩展到 `M4+` 的轻量查看能力

---

最后更新: 2026年4月
