"""SSH 远程 GPU 服务器执行器

通过 Fabric 连接远程 GPU 服务器执行实验代码。
支持：上传代码 → 安装依赖 → 执行训练 → 下载结果
"""

import os
import json
import asyncio
from pathlib import Path
from typing import Optional

import config
from runtime_config import (
    get_ssh_conda_env,
    get_ssh_enabled,
    get_ssh_host,
    get_ssh_key_path,
    get_ssh_password,
    get_ssh_port,
    get_ssh_user,
    get_ssh_work_dir,
)


class SSHRunner:
    """SSH 远程执行器"""

    def __init__(self):
        self.conn = None
        self.remote_work_dir = get_ssh_work_dir()

    def is_available(self) -> bool:
        """是否配置了 SSH"""
        return bool(get_ssh_host() and get_ssh_user() and get_ssh_enabled())

    def connect(self):
        """建立 SSH 连接"""
        if self.conn:
            return self.conn

        from fabric import Connection

        connect_kwargs = {}
        key_path_value = get_ssh_key_path()
        if key_path_value:
            key_path = os.path.expanduser(key_path_value)
            if os.path.exists(key_path):
                connect_kwargs["key_filename"] = key_path
        password = get_ssh_password()
        if password:
            connect_kwargs["password"] = password

        self.conn = Connection(
            host=get_ssh_host(),
            port=get_ssh_port(),
            user=get_ssh_user(),
            connect_kwargs=connect_kwargs,
        )
        return self.conn

    def disconnect(self):
        """断开连接"""
        if self.conn:
            self.conn.close()
            self.conn = None

    async def setup_remote_env(self, task_id: str, requirements: list[str] = None):
        """在远程服务器上创建工作目录并安装依赖"""
        conn = self.connect()
        remote_dir = f"{get_ssh_work_dir()}/{task_id}"

        await asyncio.to_thread(conn.run, f"mkdir -p {remote_dir}", hide=True)

        # 检查 GPU
        try:
            result = await asyncio.to_thread(conn.run, "nvidia-smi --query-gpu=name --format=csv,noheader", hide=True)
            gpu_info = result.stdout.strip()
        except Exception:
            gpu_info = "No GPU detected"

        # 安装依赖
        if requirements:
            reqs = " ".join(requirements)
            ssh_conda_env = get_ssh_conda_env()
            conda_prefix = f"conda activate {ssh_conda_env} && " if ssh_conda_env else ""
            await asyncio.to_thread(
                conn.run,
                f"{conda_prefix}pip install {reqs} 2>/dev/null",
                hide=True, warn=True,
            )

        return remote_dir, gpu_info

    async def upload_code(self, local_dir: str, task_id: str):
        """上传实验代码到远程服务器"""
        conn = self.connect()
        remote_dir = f"{get_ssh_work_dir()}/{task_id}"

        await asyncio.to_thread(conn.run, f"mkdir -p {remote_dir}", hide=True)

        # 上传所有 Python 文件和配置文件
        for root, dirs, files in os.walk(local_dir):
            # 跳过 .git, __pycache__, run_* 目录
            dirs[:] = [d for d in dirs if not d.startswith(('.git', '__pycache__', 'run_', 'latex'))]

            for fname in files:
                if fname.endswith(('.py', '.json', '.yaml', '.yml', '.txt', '.csv')):
                    local_path = os.path.join(root, fname)
                    rel_path = os.path.relpath(local_path, local_dir)
                    remote_path = f"{remote_dir}/{rel_path}"

                    # 创建远程子目录
                    remote_subdir = os.path.dirname(remote_path)
                    await asyncio.to_thread(conn.run, f"mkdir -p {remote_subdir}", hide=True)

                    await asyncio.to_thread(conn.put, local_path, remote_path)

        return remote_dir

    async def run_experiment(
        self, task_id: str, command: str, timeout: int = 3600,
    ) -> dict:
        """在远程服务器执行实验"""
        conn = self.connect()
        remote_dir = f"{get_ssh_work_dir()}/{task_id}"
        ssh_conda_env = get_ssh_conda_env()
        conda_prefix = f"conda activate {ssh_conda_env} && " if ssh_conda_env else ""

        try:
            result = await asyncio.to_thread(
                conn.run,
                f"cd {remote_dir} && {conda_prefix}{command}",
                hide=True, warn=True, timeout=timeout,
            )

            return {
                "status": "success" if result.return_code == 0 else "failed",
                "stdout": result.stdout[-3000:] if result.stdout else "",
                "stderr": result.stderr[-2000:] if result.stderr else "",
                "return_code": result.return_code,
            }

        except Exception as e:
            return {
                "status": "failed",
                "stdout": "",
                "stderr": str(e),
                "return_code": 1,
            }

    async def download_results(self, task_id: str, local_dir: str, run_name: str = "run_0"):
        """从远程服务器下载实验结果"""
        conn = self.connect()
        remote_dir = f"{get_ssh_work_dir()}/{task_id}/{run_name}"
        local_run_dir = os.path.join(local_dir, run_name)
        os.makedirs(local_run_dir, exist_ok=True)

        # 列出远程结果文件
        try:
            result = await asyncio.to_thread(
                conn.run, f"ls {remote_dir}/", hide=True, warn=True
            )
            if result.return_code != 0:
                return {}

            for fname in result.stdout.strip().split("\n"):
                fname = fname.strip()
                if fname and fname.endswith(('.json', '.npy', '.png', '.csv', '.txt', '.log')):
                    remote_path = f"{remote_dir}/{fname}"
                    local_path = os.path.join(local_run_dir, fname)
                    try:
                        await asyncio.to_thread(conn.get, remote_path, local_path)
                    except Exception:
                        pass

        except Exception:
            pass

        # 读取 final_info.json
        info_path = os.path.join(local_run_dir, "final_info.json")
        if os.path.exists(info_path):
            with open(info_path) as f:
                return json.load(f)
        return {}

    async def check_gpu(self) -> str:
        """检查远程 GPU 信息"""
        conn = self.connect()
        try:
            result = await asyncio.to_thread(
                conn.run, "nvidia-smi --query-gpu=name,memory.total --format=csv,noheader", hide=True
            )
            return result.stdout.strip()
        except Exception as e:
            return f"GPU check failed: {e}"


# 全局单例
ssh_runner = SSHRunner()
