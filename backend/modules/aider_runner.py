from __future__ import annotations

import asyncio
import os
import shutil
import signal
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import config
from modules.async_subprocess import run_subprocess
from pipeline.state import TaskStateMachine
from runtime_config import get_aider_exe, get_aider_python, get_openai_api_key, get_openai_base_url, get_openai_model
from services.agent_runtime import AgentRuntime


@dataclass(slots=True)
class AiderAvailability:
    available: bool
    command: list[str]
    detail: str
    version: str = ""


@dataclass(slots=True)
class AiderRunResult:
    ok: bool
    returncode: int
    stdout: str
    stderr: str
    detail: str
    command: list[str]

    @property
    def output(self) -> str:
        parts = [self.stdout.strip(), self.stderr.strip()]
        return "\n".join(part for part in parts if part).strip()


def _looks_like_aider_failure(output: str) -> bool:
    lowered = (output or "").lower()
    markers = (
        "litellm.badrequesterror",
        "authenticationerror",
        "rate limit",
        "apiconnectionerror",
        "contextwindow",
        "provider not provided",
        "invalid api key",
        "traceback",
    )
    return any(marker in lowered for marker in markers)


def _should_retry_with_whole(edit_format: str, output: str) -> bool:
    if edit_format != "diff":
        return False
    lowered = (output or "").lower()
    markers = (
        "did not conform to the edit format",
        "searchreplacenoexactmatch",
        "search/replace block failed",
        "search block failed to exactly match",
    )
    return any(marker in lowered for marker in markers)


_availability_cache: dict[tuple[str, ...], AiderAvailability] = {}
_repo_locks: dict[str, asyncio.Lock] = {}

_AIDER_TAGS_CACHE_DIR = ".aider.tags.cache.v4"


def _clean_aider_tags_cache(repo_dir: str) -> bool:
    """Remove the Aider tags cache from the volume-mounted repo to avoid 9P I/O stalls."""
    cache_path = os.path.join(repo_dir, _AIDER_TAGS_CACHE_DIR)
    if not os.path.isdir(cache_path):
        return False
    try:
        shutil.rmtree(cache_path)
        return True
    except OSError:
        return False


@dataclass(slots=True)
class RepoGitHealth:
    lock_path: str
    cleaned_stale_lock: bool
    active_git_process: bool
    status_output: str
    diff_output: str
    changed_files: bool


def _normalize_path(path: str) -> str:
    if not path:
        return ""
    return str(Path(os.path.expandvars(path)).expanduser())


def _repo_lock(cwd: str) -> asyncio.Lock:
    normalized = os.path.abspath(cwd)
    lock = _repo_locks.get(normalized)
    if lock is None:
        lock = asyncio.Lock()
        _repo_locks[normalized] = lock
    return lock


def _run_git_command(cwd: str, args: list[str]) -> tuple[int, str]:
    try:
        completed = subprocess.run(
            ["git", *args],
            cwd=cwd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=20,
        )
        output = "\n".join(part for part in [completed.stdout, completed.stderr] if part).strip()
        return completed.returncode, output
    except Exception as exc:
        return -1, str(exc)


def _detect_active_git_process(repo_path: str) -> bool:
    try:
        completed = subprocess.run(
            ["ps", "-eo", "pid,args"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
        )
    except Exception:
        return False

    repo_path = os.path.abspath(repo_path)
    git_dir = os.path.join(repo_path, ".git")
    for line in (completed.stdout or "").splitlines():
        lowered = line.lower()
        if " git" not in f" {lowered}":
            continue
        if repo_path.lower() in lowered or git_dir.lower() in lowered:
            return True
    return False


def _reap_zombie_git_processes(repo_path: str) -> int:
    """Kill and reap zombie git processes related to the repo."""
    try:
        completed = subprocess.run(
            ["ps", "-eo", "pid,ppid,stat,args"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
        )
    except Exception:
        return 0

    repo_path = os.path.abspath(repo_path)
    git_dir = os.path.join(repo_path, ".git")
    reaped = 0
    for line in (completed.stdout or "").splitlines():
        parts = line.split(None, 3)
        if len(parts) < 4:
            continue
        pid_str, _ppid_str, stat, args = parts
        if "Z" not in stat:
            continue
        lowered = args.lower()
        if "git" not in lowered:
            continue
        if repo_path.lower() in lowered or git_dir.lower() in lowered:
            try:
                os.kill(int(pid_str), signal.SIGKILL)
                reaped += 1
            except (ProcessLookupError, PermissionError, OSError):
                pass
    return reaped


async def _emit_repo_event(
    *,
    tracer,
    task_id: str,
    module: int,
    phase: str,
    agent_role: str,
    message: str,
    payload: dict[str, str | bool],
) -> None:
    if tracer is not None and module:
        await tracer.log(module, "aider_git", message)
    if task_id:
        runtime = AgentRuntime(task_id)
        await runtime.log_event(
            module=module or 4,
            phase=phase or f"m{module or 4}",
            kind="git_preflight",
            message=message,
            payload=payload,
            role=agent_role or "code-worker",
        )


async def _preflight_repo_git(
    *,
    cwd: str,
    tracer,
    task_id: str,
    module: int,
    phase: str,
    agent_role: str,
) -> RepoGitHealth:
    # Reap any zombie git processes from previous runs before doing anything.
    reaped = _reap_zombie_git_processes(cwd)
    if reaped:
        await _emit_repo_event(
            tracer=tracer,
            task_id=task_id,
            module=module,
            phase=phase,
            agent_role=agent_role,
            message=f"Git preflight reaped {reaped} zombie git process(es)",
            payload={"reaped_zombies": reaped},
        )

    # Remove stale Aider tags cache to avoid 9P volume I/O stalls.
    if _clean_aider_tags_cache(cwd):
        if tracer:
            await tracer.log(module, "aider_cache", "Removed stale Aider tags cache before run")

    lock_path = os.path.join(cwd, ".git", "index.lock")
    cleaned_stale_lock = False
    active_git_process = False
    if os.path.exists(lock_path):
        active_git_process = _detect_active_git_process(cwd)
        if not active_git_process:
            try:
                os.remove(lock_path)
                cleaned_stale_lock = True
            except OSError:
                pass
        await _emit_repo_event(
            tracer=tracer,
            task_id=task_id,
            module=module,
            phase=phase,
            agent_role=agent_role,
            message=(
                f"Git preflight detected {'active' if active_git_process else 'stale'} index.lock"
                + (" and removed it" if cleaned_stale_lock else "")
            ),
            payload={
                "lock_path": lock_path,
                "active_git_process": active_git_process,
                "cleaned_stale_lock": cleaned_stale_lock,
            },
        )

    status_code, status_output = _run_git_command(cwd, ["status", "--short"])
    diff_code, diff_output = _run_git_command(cwd, ["diff", "--", "experiment.py", "requirements.txt"])
    changed_files = bool((status_output or "").strip() or (diff_output or "").strip())
    return RepoGitHealth(
        lock_path=lock_path,
        cleaned_stale_lock=cleaned_stale_lock,
        active_git_process=active_git_process,
        status_output="" if status_code == 0 else status_output,
        diff_output="" if diff_code == 0 else diff_output if diff_output else "",
        changed_files=changed_files,
    )


async def _postcheck_repo_git(
    *,
    cwd: str,
    tracer,
    task_id: str,
    module: int,
    phase: str,
    agent_role: str,
) -> RepoGitHealth:
    status_code, status_output = _run_git_command(cwd, ["status", "--short"])
    diff_code, diff_output = _run_git_command(cwd, ["diff", "--", "experiment.py", "requirements.txt"])
    changed_files = bool((status_output or "").strip() or (diff_output or "").strip())
    health = RepoGitHealth(
        lock_path=os.path.join(cwd, ".git", "index.lock"),
        cleaned_stale_lock=False,
        active_git_process=_detect_active_git_process(cwd),
        status_output=status_output if status_code == 0 else status_output,
        diff_output=diff_output if diff_code == 0 else diff_output,
        changed_files=changed_files,
    )
    await _emit_repo_event(
        tracer=tracer,
        task_id=task_id,
        module=module,
        phase=phase,
        agent_role=agent_role,
        message="Git post-check completed after Aider run",
        payload={
            "changed_files": changed_files,
            "status_output": bool(status_output.strip()),
            "diff_output": bool(diff_output.strip()),
        },
    )
    return health


def _configured_aider_command() -> tuple[list[str], str] | None:
    aider_exe = _normalize_path(get_aider_exe())
    if aider_exe:
        return [aider_exe], f"AIDER_EXE={aider_exe}"

    aider_python = _normalize_path(get_aider_python())
    if aider_python:
        return [aider_python, "-m", "aider"], f"AIDER_PYTHON={aider_python}"

    default_python = config.default_aider_python_path()
    if os.path.exists(default_python):
        return [default_python, "-m", "aider"], f"default aider env: {default_python}"

    return None


def _build_aider_env() -> dict[str, str]:
    api_key = get_openai_api_key().strip()
    api_base = get_openai_base_url().strip()
    model = get_openai_model().strip()

    env = os.environ.copy()
    env["PYTHONUTF8"] = "1"
    if api_key:
        env["OPENAI_API_KEY"] = api_key
        env["AIDER_OPENAI_API_KEY"] = api_key
    if api_base:
        env["OPENAI_API_BASE"] = api_base
        env["OPENAI_BASE_URL"] = api_base
        env["AIDER_OPENAI_API_BASE"] = api_base
    if model:
        env["AIDER_MODEL"] = model
    return env


def _resolve_aider_model() -> str:
    model = get_openai_model().strip()
    if not model:
        return ""
    if "/" in model:
        return model
    return f"openai/{model}"


async def check_aider_available(force: bool = False, timeout: int = 15) -> AiderAvailability:
    resolved = _configured_aider_command()
    if resolved is None:
        default_python = config.default_aider_python_path()
        return AiderAvailability(
            available=False,
            command=[],
            detail=(
                "未配置 AIDER_PYTHON/AIDER_EXE，且默认环境不存在: "
                f"{default_python}"
            ),
        )

    command, source = resolved
    cache_key = tuple(command)
    if not force and cache_key in _availability_cache:
        return _availability_cache[cache_key]

    executable = command[0]
    if not os.path.exists(executable):
        return AiderAvailability(
            available=False,
            command=command,
            detail=f"{source} 指向的文件不存在",
        )

    env = _build_aider_env()
    try:
        completed = await asyncio.to_thread(
            subprocess.run,
            [*command, "--version"],
            cwd=str(config.BASE_DIR),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            env=env,
        )
    except Exception as exc:
        return AiderAvailability(
            available=False,
            command=command,
            detail=f"{source} 检查失败: {exc}",
        )

    version_output = (completed.stdout or completed.stderr or "").strip()
    result = AiderAvailability(
        available=completed.returncode == 0,
        command=command,
        detail=source if completed.returncode == 0 else f"{source} 版本检查失败: {version_output}",
        version=version_output,
    )
    if result.available:
        _availability_cache[cache_key] = result
    else:
        _availability_cache.pop(cache_key, None)
    return result


async def run_aider_prompt(
    *,
    prompt: str,
    files: list[str],
    cwd: str,
    edit_format: str = "diff",
    timeout: int = 600,
    read_only_files: list[str] | None = None,
    state: TaskStateMachine | None = None,
    tracer=None,
    task_id: str = "",
    module: int = 0,
    phase: str = "",
    agent_role: str = "code-worker",
) -> AiderRunResult:
    availability = await check_aider_available()
    if not availability.available:
        return AiderRunResult(
            ok=False,
            returncode=-1,
            stdout="",
            stderr="",
            detail=availability.detail,
            command=availability.command,
        )

    editable_files = [os.path.abspath(path) for path in files if path]
    readonly = [os.path.abspath(path) for path in (read_only_files or []) if path]
    prompt_file_path = ""
    _local_cache_dir = ""

    async def _run_command(command: list[str]) -> tuple[int, str, str]:
        env = _build_aider_env()
        if _local_cache_dir:
            env["AIDER_HOME"] = _local_cache_dir
        completed = await run_subprocess(
            command,
            cwd=cwd,
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            timeout=timeout,
            text=True,
            state=state,
        )
        return (
            completed.returncode,
            completed.stdout or "",
            completed.stderr or "",
        )

    async def _run_once(selected_edit_format: str) -> AiderRunResult:
        # Redirect Aider home/cache to a local tmpfs path inside the container
        # to avoid 9P volume I/O stalls on .aider.tags.cache.v4.
        nonlocal _local_cache_dir
        if not _local_cache_dir:
            _local_cache_dir = os.path.join(tempfile.gettempdir(), f"aider-home-{os.getpid()}")
            os.makedirs(_local_cache_dir, exist_ok=True)

        command = [
            *availability.command,
            "--model",
            _resolve_aider_model(),
            "--edit-format",
            selected_edit_format,
            "--message-file",
            prompt_file_path,
            "--yes-always",
            "--no-analytics",
            "--no-check-update",
            "--no-fancy-input",
            "--no-suggest-shell-commands",
            "--no-auto-test",
            "--encoding",
            "utf-8",
        ]

        for path in editable_files:
            command.extend(["--file", path])
        for path in readonly:
            command.extend(["--read", path])

        returncode, stdout, stderr = await _run_command(command)
        combined_output = "\n".join(part for part in [stdout, stderr] if part)
        ok = returncode == 0 and not _looks_like_aider_failure(combined_output)
        return AiderRunResult(
            ok=ok,
            returncode=returncode,
            stdout=stdout,
            stderr=stderr,
            detail="ok" if ok else "aider failed or reported an upstream LLM error",
            command=command,
        )

    lock = _repo_lock(cwd)
    async with lock:
        try:
            await _preflight_repo_git(
                cwd=cwd,
                tracer=tracer,
                task_id=task_id,
                module=module,
                phase=phase,
                agent_role=agent_role,
            )

            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                suffix=".aider.prompt.txt",
                delete=False,
                dir=cwd,
            ) as handle:
                handle.write(prompt)
                prompt_file_path = handle.name

            result = await _run_once(edit_format)
            if not result.ok and _should_retry_with_whole(edit_format, result.output):
                fallback = await _run_once("whole")
                if fallback.ok:
                    fallback.detail = "ok (retried with whole edit format)"
                    fallback.stdout = "\n".join(
                        part for part in [result.stdout, "\n[retry] Falling back to whole edit format.\n", fallback.stdout] if part
                    )
                    fallback.stderr = "\n".join(part for part in [result.stderr, fallback.stderr] if part)
                result = fallback

            health = await _postcheck_repo_git(
                cwd=cwd,
                tracer=tracer,
                task_id=task_id,
                module=module,
                phase=phase,
                agent_role=agent_role,
            )
            if not result.ok and health.changed_files:
                result.ok = True
                result.detail = "aider changed tracked files even though git commit/reporting failed"
                result.stderr = "\n".join(part for part in [result.stderr, health.status_output, health.diff_output] if part)
            return result
        except Exception as exc:
            return AiderRunResult(
                ok=False,
                returncode=-1,
                stdout="",
                stderr="",
                detail=str(exc),
                command=availability.command,
            )
        finally:
            if prompt_file_path:
                try:
                    os.remove(prompt_file_path)
                except OSError:
                    pass
