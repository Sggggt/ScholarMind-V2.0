from __future__ import annotations
"""FastAPI application entrypoint."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import config
from api.routes import router
from db.database import init_db
from services.task_service import recover_running_tasks

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR_CANDIDATES = (
    BASE_DIR / "static",
    BASE_DIR.parent / "react-client" / "dist",
)


def resolve_static_dir() -> Path | None:
    for candidate in STATIC_DIR_CANDIDATES:
        if candidate.is_dir():
            return candidate
    return None


STATIC_DIR = resolve_static_dir()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    recovery = await recover_running_tasks()
    print(f"[启动] Research Agent http://{config.HOST}:{config.PORT}")
    print(f"[配置] LLM={config.LLM_PROVIDER} Model={config.OPENAI_MODEL}")
    print(
        "[recovery] "
        f"running={recovery['recovered']} paused={recovery['paused']} review={recovery['pending_review']}"
    )
    if STATIC_DIR:
        print(f"[前端] 静态页面目录: {STATIC_DIR}")
    else:
        print("[前端] 未找到静态页面目录；开发模式请访问 http://localhost:5173")

    # Start mDNS service discovery
    mdns_publisher = None
    if config.MDNS_ENABLED:
        try:
            from discovery import DeviceIdentity, MdnsServicePublisher

            identity = DeviceIdentity.load_or_create()
            mdns_publisher = MdnsServicePublisher(identity)
            mdns_publisher.configure_port(config.PORT)
            mdns_publisher.start()
            print(
                f"[mDNS] 服务发现已启用 (_scholarmind._tcp.local.) "
                f"设备ID: {identity.device_id[:8]} 名称: {identity.name}"
            )
        except Exception as e:
            print(f"[mDNS] 服务发现启动失败: {e}")

    yield

    # Stop mDNS service
    if mdns_publisher:
        try:
            mdns_publisher.stop()
            print("[mDNS] 服务发现已停止")
        except Exception as e:
            print(f"[mDNS] 停止服务时出错: {e}")

    print("[关闭] 服务停止")


app = FastAPI(
    title="AI Research Agent",
    description="Automated research pipeline service.",
    version="1.0.0",
    lifespan=lifespan,
)

def _parse_allowed_origins(origins_str: str) -> list[str]:
    """Parse ALLOWED_ORIGINS from comma-separated string or '*' wildcard."""
    if not origins_str or origins_str.strip() == "*":
        return ["*"]
    return [origin.strip() for origin in origins_str.split(",") if origin.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_allowed_origins(config.ALLOWED_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

config.WORKSPACE_DIR.mkdir(exist_ok=True)
app.mount("/files", StaticFiles(directory=str(config.WORKSPACE_DIR)), name="files")

if STATIC_DIR:
    assets_dir = STATIC_DIR / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="frontend_assets")

    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404, "API endpoint not found")

        static_file = STATIC_DIR / full_path
        if static_file.is_file():
            return FileResponse(static_file)

        return FileResponse(STATIC_DIR / "index.html")


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=config.HOST,
        port=config.PORT,
        reload=os.name != "nt",
    )
