# `mobile/server/` 模板目录说明

## 这是什么

`mobile/server/` 是移动端模板自带的服务端目录，包含一套独立的示例后端能力，例如：

- 数据库访问封装
- tRPC 路由
- 存储辅助方法
- 模板运行时基础设施

它保留在仓库中，主要用于参考模板原始结构，或在后续需要扩展模板能力时作为备用入口。

## 这不是什么

这个目录不是 ScholarMind 当前正式使用的科研任务后端。

当前项目的真实后端链路是：

- 主后端：[`../../backend`](../../backend)
- 桌面端：[`../../react-client`](../../react-client)
- 移动端：[`..`](..)

如果你要排查以下问题，请优先阅读主项目文档，而不是这里：

- 任务创建、暂停、恢复、终止
- 九阶段科研流水线执行
- mDNS / Bonjour 局域网发现
- Aider 集成与实验运行
- 移动端与后端的实际联调
- Android APK 打包后的连接行为

对应文档入口：

- 项目总览：[`../../README.md`](../../README.md)
- 移动端文档：[`../README.md`](../README.md)

## 当前目录包含什么

```text
mobile/server/
  _core/        模板运行时基础设施
  db.ts         数据库查询辅助
  routers.ts    tRPC 路由定义
  storage.ts    存储辅助方法
  README.md     当前说明文档
```

这些文件更适合在以下场景下阅读：

- 你想了解模板原本如何组织后端目录
- 你想复用模板内的数据库、tRPC 或存储能力
- 你准备把移动端模板单独拆出去做实验项目

## 与 ScholarMind 主链路的关系

ScholarMind 当前的正式网络链路是：

```text
backend/ 发布 HTTP / WebSocket / mDNS
  -> react-client/ 连接 backend/
  -> mobile/ 连接 backend/
```

局域网发现链路也是围绕 `backend/` 设计的：

- `backend/` 发布 `_scholarmind._tcp.local.`
- `mobile/` 在同一 Wi-Fi 下扫描候选服务
- 移动端校验 `GET /api/health` 与 `/api/ws`
- 校验通过后保存后端地址

`mobile/server/` 不参与这条正式链路。

## 如果你确实要查看模板服务端

建议按下面的顺序：

1. 看 [`routers.ts`](./routers.ts)，确认模板开放了哪些接口。
2. 看 [`db.ts`](./db.ts)，了解模板的数据访问方式。
3. 看 [`storage.ts`](./storage.ts)，了解模板文件存储能力。
4. 再按需进入 `_core/`，不要默认把其中内容当成 ScholarMind 的主业务实现。

## 文档约定

- 这里的说明只负责解释模板目录用途
- ScholarMind 当前可运行行为，以根目录 [`../../README.md`](../../README.md) 为准
- 移动端接入、打包、局域网发现，以 [`../README.md`](../README.md) 为准
