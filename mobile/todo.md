# ScholarMind Mobile TODO

## 已完成功能

- [x] 项目初始化和主题配置（绿色品牌色 #10a37f）
- [x] 类型定义（lib/types.ts）
- [x] 演示数据（lib/mock-data.ts）
- [x] API 服务层（lib/api.ts）
- [x] 任务状态管理（lib/task-store.ts + lib/task-provider.tsx）
- [x] 根布局（app/_layout.tsx）集成 TaskProvider
- [x] Tab 导航（任务列表、新建任务、设置）
- [x] 任务列表页（app/(tabs)/index.tsx）
  - [x] 任务卡片展示（状态、进度条、模块数）
  - [x] 演示/真实模式切换
  - [x] 下拉刷新
  - [x] 空状态引导
- [x] 新建任务页（app/(tabs)/create.tsx）
  - [x] 研究主题输入
  - [x] 可选描述
  - [x] 模块流水线预览
  - [x] 提交创建
- [x] 设置页（app/(tabs)/settings.tsx）
  - [x] 后端地址配置
  - [x] 连接测试
  - [x] 演示模式切换
  - [x] 主题切换（亮色/暗色）
- [x] 任务详情页（app/task/[id]/index.tsx）
  - [x] 任务状态和进度
  - [x] 暂停/恢复/终止操作
  - [x] 快速跳转到日志和评审
  - [x] 研究流水线模块列表（可展开）
  - [x] 模块 I/O 详情展示
- [x] 日志页（app/task/[id]/logs.tsx）
  - [x] 按级别过滤（全部/INFO/WARN/ERROR）
  - [x] 模块颜色标签
  - [x] 下拉刷新
- [x] 评审结果页（app/task/[id]/review.tsx）
  - [x] NeurIPS 风格评审报告展示
  - [x] 评分维度卡片（可展开）
  - [x] 人工审阅弹窗（批准/拒绝）
- [x] 后端数据库表（research_tasks, task_logs, review_results, human_reviews）
- [x] 后端 tRPC API（任务 CRUD、日志、评审）
- [x] 数据库迁移
- [x] 应用图标生成

## 待优化

- [ ] WebSocket 实时任务进度推送（需要后端 Socket.io 支持）
- [ ] 任务搜索和过滤
- [ ] 任务结果导出（PDF/Markdown）
