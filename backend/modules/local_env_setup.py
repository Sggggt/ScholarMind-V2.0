from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from modules.async_subprocess import run_subprocess
from pipeline.state import TaskStateMachine
from pipeline.tracer import Tracer

DEFAULT_VENV_NAME = ".venv-experiment"
STATE_FILENAME = ".scholarmind-local-env.json"
MAX_LOG_OUTPUT = 1000
MIN_PIP_VERSION = (24, 0)


@dataclass(slots=True)
class LocalExperimentEnv:
    python_executable: str
    venv_dir: str
    reused_existing: bool
    requirements_path: str | None


def _venv_python_path(venv_dir: Path) -> Path:
    if os.name == "nt":
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def _metadata_path(venv_dir: Path) -> Path:
    return venv_dir / STATE_FILENAME


def _requirements_fingerprint(requirements_path: Path | None) -> str:
    if not requirements_path or not requirements_path.exists():
        return ""
    return hashlib.sha256(requirements_path.read_bytes()).hexdigest()


def _expected_state(requirements_path: Path | None) -> dict[str, str]:
    return {
        "bootstrap_python": os.path.abspath(sys.executable),
        "python_version": sys.version,
        "requirements_sha256": _requirements_fingerprint(requirements_path),
    }


def _load_state(venv_dir: Path) -> dict[str, str] | None:
    path = _metadata_path(venv_dir)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _save_state(venv_dir: Path, state: dict[str, str]) -> None:
    _metadata_path(venv_dir).write_text(
        json.dumps(state, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _safe_rmtree(path: Path) -> None:
    """Remove a directory tree, tolerating concurrent deletion by other processes."""
    try:
        shutil.rmtree(path)
    except FileNotFoundError:
        # Race condition: another process removed files underneath us.
        if path.exists():
            shutil.rmtree(path, ignore_errors=True)


def _trim_output(stdout: str, stderr: str) -> str:
    combined = "\n".join(part.strip() for part in [stdout, stderr] if part and part.strip()).strip()
    if len(combined) <= MAX_LOG_OUTPUT:
        return combined
    return "..." + combined[-MAX_LOG_OUTPUT:]


def _parse_version_tuple(version_text: str) -> tuple[int, ...]:
    match = re.search(r"(\d+(?:\.\d+)*)", version_text or "")
    if not match:
        return ()
    return tuple(int(part) for part in match.group(1).split("."))


async def _get_pip_version(python_path: Path, *, cwd: str, timeout: int, state: TaskStateMachine | None) -> tuple[int, ...]:
    completed = await run_subprocess(
        [str(python_path), "-m", "pip", "--version"],
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        text=True,
        state=state,
    )
    if completed.returncode != 0:
        return ()
    stdout = completed.stdout if isinstance(completed.stdout, str) else ""
    stderr = completed.stderr if isinstance(completed.stderr, str) else ""
    return _parse_version_tuple(stdout or stderr)


def _validate_target_dir(project_dir: Path, venv_dir: Path) -> None:
    project_dir = project_dir.resolve()
    venv_dir = venv_dir.resolve()
    if venv_dir.parent != project_dir:
        raise RuntimeError(f"Refusing to manage venv outside project dir: {venv_dir}")


async def _run_checked(
    command: list[str],
    *,
    cwd: str,
    timeout: int,
    state: TaskStateMachine | None,
    tracer: Tracer | None,
    module: int,
    step: str,
    success_message: str,
    failure_message: str,
) -> None:
    completed = await run_subprocess(
        command,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        text=True,
        state=state,
    )
    stdout = completed.stdout if isinstance(completed.stdout, str) else ""
    stderr = completed.stderr if isinstance(completed.stderr, str) else ""
    details = _trim_output(stdout, stderr)
    if completed.returncode != 0:
        raise RuntimeError(f"{failure_message}: {details or f'Exit code {completed.returncode}'}")
    if tracer:
        suffix = f" {details}" if details else ""
        await tracer.log(module, step, f"{success_message}{suffix}")


async def ensure_local_experiment_env(
    project_dir: str,
    *,
    tracer: Tracer | None = None,
    state: TaskStateMachine | None = None,
    module: int = 6,
    timeout: int = 1800,
    force_recreate: bool = False,
) -> LocalExperimentEnv:
    project_path = Path(project_dir).resolve()
    requirements_path = project_path / "requirements.txt"
    venv_dir = project_path / DEFAULT_VENV_NAME
    python_path = _venv_python_path(venv_dir)
    expected_state = _expected_state(requirements_path if requirements_path.exists() else None)

    _validate_target_dir(project_path, venv_dir)

    if force_recreate and venv_dir.exists():
        _safe_rmtree(venv_dir)
        if tracer:
            await tracer.log(module, "local_env", f"Removed existing local experiment venv: {venv_dir}")

    if python_path.exists() and _load_state(venv_dir) == expected_state:
        if tracer:
            await tracer.log(module, "local_env", f"Reusing local experiment venv: {venv_dir}")
        return LocalExperimentEnv(
            python_executable=str(python_path),
            venv_dir=str(venv_dir),
            reused_existing=True,
            requirements_path=str(requirements_path) if requirements_path.exists() else None,
        )

    if tracer:
        await tracer.log(module, "local_env", f"Preparing local experiment venv: {venv_dir}")

    if venv_dir.exists() and (not python_path.exists() or _load_state(venv_dir) != expected_state):
        _safe_rmtree(venv_dir)

    await _run_checked(
        [sys.executable, "-m", "venv", str(venv_dir)],
        cwd=str(project_path),
        timeout=min(timeout, 900),
        state=state,
        tracer=tracer,
        module=module,
        step="local_env_create",
        success_message="Created local experiment venv.",
        failure_message="Failed to create local experiment venv",
    )

    pip_version = await _get_pip_version(
        python_path,
        cwd=str(project_path),
        timeout=min(timeout, 120),
        state=state,
    )
    if pip_version and pip_version >= MIN_PIP_VERSION:
        if tracer:
            await tracer.log(
                module,
                "local_env_pip",
                f"Skipping pip upgrade in local experiment venv (pip {'.'.join(map(str, pip_version))} >= {'.'.join(map(str, MIN_PIP_VERSION))}).",
            )
    else:
        await _run_checked(
            [str(python_path), "-m", "pip", "install", "--upgrade", "pip"],
            cwd=str(project_path),
            timeout=min(timeout, 1200),
            state=state,
            tracer=tracer,
            module=module,
            step="local_env_pip",
            success_message="Upgraded pip in local experiment venv.",
            failure_message="Failed to upgrade pip in local experiment venv",
        )

    if requirements_path.exists():
        if tracer:
            await tracer.log(
                module,
                "local_env_requirements",
                f"Installing experiment dependencies from {requirements_path.name}...",
            )
        await _run_checked(
            [str(python_path), "-m", "pip", "install", "-r", str(requirements_path)],
            cwd=str(project_path),
            timeout=timeout,
            state=state,
            tracer=tracer,
            module=module,
            step="local_env_requirements",
            success_message=f"Installed experiment dependencies from {requirements_path.name}.",
            failure_message=f"Failed to install dependencies from {requirements_path.name}",
        )
    elif tracer:
        await tracer.log(module, "local_env_requirements", "No requirements.txt found, skipping dependency install.")

    _save_state(venv_dir, expected_state)
    return LocalExperimentEnv(
        python_executable=str(python_path),
        venv_dir=str(venv_dir),
        reused_existing=False,
        requirements_path=str(requirements_path) if requirements_path.exists() else None,
    )
