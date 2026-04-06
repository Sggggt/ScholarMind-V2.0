# ScholarMind 移动端文档

`mobile/` 是 ScholarMind 的移动端客户端，基于 Expo 54、React Native 0.81 与 Expo Router。它连接仓库根目录下的 `backend/`，用于移动场景下的任务创建、进度查看、日志追踪和局域网接入。

## 当前定位

移动端当前承担的职责：

- 连接共享的 `backend/`
- 创建和查看研究任务
- 展示模块进度、日志与产物
- 支持 mDNS / Bonjour 局域网自动发现
- 输出可安装的原生 Android APK

不属于当前职责的内容：

- 不把 `mobile/server/` 当成 ScholarMind 主任务后端
- 不把 Expo Go 当成局域网发现的主要验证环境
- 不在移动端重复实现一套独立科研后端

## 环境要求

建议环境：

- Node.js 20+
- `pnpm`
- Java 17
- Android Studio
- Android SDK
- `adb`
- Android 模拟器或真机

Windows 下常见环境变量 / 示例路径：

- `JAVA_HOME=<你的 JDK 安装目录>`
- `ANDROID_SDK_ROOT=<你的 Android SDK 安装目录>`

## 安装依赖

```powershell
cd .\mobile
pnpm install
```

建议安装后先执行一次类型检查：

```powershell
pnpm exec tsc --noEmit
```

## 常用命令

```powershell
pnpm dev
pnpm dev:server
pnpm dev:metro
pnpm android
pnpm ios
pnpm check
pnpm lint
pnpm test
```

重点命令说明：

- `pnpm dev:metro`：启动 Metro
- `pnpm android`：调用 Android 包装脚本
- `node scripts/run-android.mjs --variant release --no-bundler`：输出 release APK

## 与共享后端联调

移动端连接的是仓库中的 FastAPI 后端：

- [`../backend`](../backend)

先启动后端：

```powershell
cd .\backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

联调时最常用的接口：

- `GET /api/health`
- `GET /api/connection-info`
- WebSocket：`/api/ws`

## 推荐调试流程

推荐使用 3 个终端并行工作。

### 终端 1：启动后端

```powershell
cd .\backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 终端 2：启动 Metro

```powershell
cd .\mobile
pnpm dev:metro
```

### 终端 3：安装调试包

```powershell
cd .\mobile
pnpm android -- --no-bundler
```

补充说明：

- debug 包依赖 Metro
- `--no-bundler` 用于避免重复启动第二个 Metro
- 首次冷启动时，生成 bundle 可能需要几十秒

## Release APK 打包

推荐命令：

```powershell
cd .\mobile
node scripts/run-android.mjs --variant release --no-bundler
```

也可以执行：

```powershell
pnpm android -- --variant release --no-bundler
```

如果要直接走 Gradle：

```powershell
cd .\mobile\android
.\gradlew.bat app:assembleRelease
```

当前仓库优先推荐使用：

- [`scripts/run-android.mjs`](./scripts/run-android.mjs)

APK 输出路径：

- debug APK：`android/app/build/outputs/apk/debug/app-debug.apk`
- release APK：`android/app/build/outputs/apk/release/app-release.apk`

## 安装 APK

安装 release APK：

```powershell
adb install -r .\mobile\android\app\build\outputs\apk\release\app-release.apk
```

安装 debug APK：

```powershell
adb install -r .\mobile\android\app\build\outputs\apk\debug\app-debug.apk
```

如果 `adb` 不在 PATH 中：

```powershell
%ANDROID_SDK_ROOT%\platform-tools\adb.exe install -r .\mobile\android\app\build\outputs\apk\release\app-release.apk
```

## 局域网自动发现

移动端已经支持 mDNS / Bonjour 局域网发现。

工作流程：

- 后端发布 `_scholarmind._tcp.local.`
- 移动端扫描同一局域网中的候选服务
- 扫描到服务后继续校验：
  - `GET /api/health`
  - `/api/ws`
- 校验通过后保存后端地址

注意事项：

- 真机更适合验证 mDNS
- AVD 中 mDNS 通常不稳定
- 手动地址仍然是最稳定的兜底方案

手动地址示例：

```text
http://<你的局域网 IP>:8000
```

相关代码入口：

- [`app/(tabs)/settings.tsx`](./app/(tabs)/settings.tsx)
- [`lib/discovery/`](./lib/discovery)
- [`app.config.ts`](./app.config.ts)

## Windows 构建辅助路径

Android 包装脚本会在系统临时目录下使用或创建以下辅助路径：

- `%TEMP%\scholarmind-android\project-link`
- `%TEMP%\scholarmind-android\jni-link`
- `%TEMP%\scholarmind-android\build-debug`
- `%TEMP%\scholarmind-android\build-release`

这些路径是 Windows 下 Android 构建兼容流程的一部分，尤其与 `react-native-zeroconf` 相关。它们不是新的业务源码目录，也不是项目副本。

## 常见问题

### 1. `Unable to load script`

通常表示 debug 包已启动，但 Metro 没有正常运行或端口不对。

```powershell
pnpm dev:metro
pnpm android -- --no-bundler
```

### 2. App 停在启动页或黑屏

常见原因：

- Metro 正在首次打 bundle
- 首屏资源还没有加载完成

建议处理：

- 等待 20 到 35 秒
- 在 Metro 终端按 `r`
- 必要时重开 App

### 3. `spawnSync cmd.exe ENOENT`

优先检查：

- `%SystemRoot%\System32\cmd.exe` 是否存在
- `JAVA_HOME` 是否有效
- 命令是否从正确的 PowerShell 工作目录执行

### 4. mDNS 扫描不到后端

如果手动地址能连但扫描不到，优先排查：

- 手机和电脑是否在同一 Wi-Fi
- 路由器是否屏蔽局域网多播
- 是否在 AVD 中测试

当前经验结论：

- 真机优先用于 mDNS 验证
- AVD 优先用于界面和手动地址联调

### 5. `adb.exe: no devices/emulators found`

说明当前没有可用设备。处理方式：

- 启动模拟器
- 或接入真机并开启 USB 调试
- 再执行 `adb devices`

## 关键文件

- [`package.json`](./package.json)
- [`index.js`](./index.js)
- [`scripts/run-android.mjs`](./scripts/run-android.mjs)
- [`scripts/start-metro.mjs`](./scripts/start-metro.mjs)
- [`app/(tabs)/settings.tsx`](./app/(tabs)/settings.tsx)
- [`lib/api.ts`](./lib/api.ts)
- [`lib/task-provider.tsx`](./lib/task-provider.tsx)
- [`lib/discovery/`](./lib/discovery)

## 相关文档

- 项目总览：[`../README.md`](../README.md)
- `mobile/server/` 模板说明：[`server/README.md`](./server/README.md)
- 移动端 backlog：[`todo.md`](./todo.md)
