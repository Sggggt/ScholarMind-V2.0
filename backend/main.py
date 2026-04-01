from __future__ import annotations
"""FastAPI 入口"""

import os
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

import config
from db.database import init_db
from api.routes import router

# 前端静态文件目录
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    print(f"[启动] 科研Agent http://{config.HOST}:{config.PORT}")
    print(f"[配置] LLM={config.LLM_PROVIDER} Model={config.OPENAI_MODEL}")
    yield
    print("[关闭] 服务停止")


app = FastAPI(
    title="AI Research Agent",
    description="自动化科研Agent系统 — 9模块研究流水线",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 路由
app.include_router(router)

# 静态文件(产出物下载)
config.WORKSPACE_DIR.mkdir(exist_ok=True)
app.mount("/files", StaticFiles(directory=str(config.WORKSPACE_DIR)), name="files")

# 前端静态资源 (JS/CSS/icons)
if os.path.exists(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="frontend_assets")

    # SPA fallback: 所有非 /api 路由返回 index.html
    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        # 拦截不存在的 API 路由，防止前端误解析 HTML 为 JSON
        if full_path.startswith("api/"):
            from fastapi import HTTPException
            raise HTTPException(404, "API endpoint not found")
            
        # 如果是静态文件（favicon等），直接返回
        static_file = os.path.join(STATIC_DIR, full_path)
        if os.path.isfile(static_file):
            return FileResponse(static_file)
        # 否则返回 index.html (SPA 路由)
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))


if __name__ == "__main__":
    uvicorn.run("main:app", host=config.HOST, port=config.PORT, reload=True)
