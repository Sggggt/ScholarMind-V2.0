# ScholarMind 移动端待办

这份文档只跟踪移动端 backlog，不负责定义后端架构、联调链路或打包规范。当前运行方式请优先阅读：

- [`../README.md`](../README.md)
- [`README.md`](./README.md)

## 已完成

- [x] 任务列表、创建流程、设置页与任务详情流
- [x] 对接共享 `backend/`
- [x] 基于 REST API 的任务操作
- [x] 基于 WebSocket 的任务进度同步
- [x] 任务产物展示与任务日志查看
- [x] 设置页中的局域网扫描入口
- [x] 手动输入后端地址兜底
- [x] 通过 `scripts/run-android.mjs` 执行原生 Android 打包
- [x] 输出 `android/app/build/outputs/apk/release/` 下的 release APK

## 下一步值得继续做

- [ ] 在真实局域网和真机环境中补充 mDNS 验证，而不仅是 AVD
- [ ] 当扫描成功但健康检查或 WebSocket 校验失败时，给出更清晰的诊断信息
- [ ] 增加任务搜索与筛选能力
- [ ] 为 Markdown / PDF 产物补充快捷导出入口
- [ ] 在应用内补充常见 Android 调试失败的排障说明
- [ ] 在重大界面改动后建立 release 冒烟检查清单
