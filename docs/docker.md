# Docker 方案说明

当前仓库只对两个端做 Docker 化：

- `backend`：FastAPI 服务，负责 Python 依赖、数据库、任务执行
- `web`：Vite/React 桌面端开发容器

`mobile/` 保持宿主机原生开发，不纳入这次 Docker 方案。

## 启动方式

先准备后端环境变量：

```powershell
Copy-Item .\backend\.env.example .\backend\.env
```

然后启动后端和前端：

```powershell
docker compose up --build backend web
```

访问地址：

- Backend: `http://localhost:8000`
- Web: `http://localhost:5173`

## Aider 环境

容器内会自动创建独立的 Aider Python 环境，并通过 `AIDER_PYTHON` 指向它：

```text
/opt/.venv-aider-py311/bin/python
```

这样做的目的：

- 保持主后端依赖和 Aider 依赖隔离
- 避免 `./backend:/app` 挂载覆盖镜像内的 Aider 虚拟环境

因此：

- 原生开发仍可继续使用 `backend/.venv-aider-py311`
- Docker 模式下会强制使用容器内的 `AIDER_PYTHON`

## 自定义目录

这套方案现在支持两种用户共用同一个 `task.config.work_dir`：

- 原生/venv 用户：继续直接使用宿主机真实路径
- Docker 用户：后端会自动把项目父目录下的 Windows 路径映射到容器内路径

默认情况下，`compose.yml` 会把仓库父目录挂载到容器内的：

```text
/host-project-root
```

例如：

- 数据库里的 `work_dir`：`C:\Study\HY Competition\Project\Test_Dir`
- 容器内解析后的路径：`/host-project-root/Test_Dir`

这意味着只要你的自定义目录和仓库位于同一个父目录下，Docker 用户不需要额外配置，前端也不需要做任何特殊处理。

## 高级映射

如果 Docker 用户的自定义目录不在仓库父目录下，再使用这两个可选变量：

- `HOST_WORKDIR_ROOT`
- `CONTAINER_WORKDIR_ROOT`

示例：

```powershell
$env:HOST_WORKDIR_ROOT='D:\ResearchProjects'
$env:CONTAINER_WORKDIR_ROOT='/external-workdir'
docker compose up -d backend web
```

这种模式下，后端会把 `HOST_WORKDIR_ROOT` 下的宿主机路径翻译到 `CONTAINER_WORKDIR_ROOT`。

## 端间连接

`web` 容器通过 `VITE_PROXY_TARGET=http://backend:8000` 访问 compose 内部网络，不依赖容器内的 `127.0.0.1`。

## 当前限制

- `backend` 镜像默认不内置 `pdflatex`
- `mobile/` 继续按原生方式开发
- mDNS/Bonjour 在 Docker 网络内不稳定，因此默认关闭 `MDNS_ENABLED`
