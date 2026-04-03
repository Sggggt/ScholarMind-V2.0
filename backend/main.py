from __future__ import annotations
"""FastAPI application entrypoint."""

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
    print(f"[启动] Research Agent http://{config.HOST}:{config.PORT}")
    print(f"[配置] LLM={config.LLM_PROVIDER} Model={config.OPENAI_MODEL}")
    if STATIC_DIR:
        print(f"[前端] 静态页面目录: {STATIC_DIR}")
    else:
        print("[前端] 未找到静态页面目录；开发模式请访问 http://localhost:5173")
    yield
    print("[关闭] 服务停止")


app = FastAPI(
    title="AI Research Agent",
    description="Automated research pipeline service.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
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
    uvicorn.run("main:app", host=config.HOST, port=config.PORT, reload=True)
