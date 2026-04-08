from __future__ import annotations

import asyncio
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import config
from pipeline.state import TaskStateMachine
from runtime_config import get_aider_exe, get_aider_python, get_openai_api_key, get_openai_base_url, get_openai_model


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


def _normalize_path(path: str) -> str:
    if not path:
        return ""
    return str(Path(os.path.expandvars(path)).expanduser())


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

    async def _run_command(command: list[str]) -> tuple[int, str, str]:
        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=cwd,
            env=_build_aider_env(),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            communicate = process.communicate()
            if state:
                stdout, stderr = await state.run_interruptible(
                    asyncio.wait_for(communicate, timeout=timeout)
                )
            else:
                stdout, stderr = await asyncio.wait_for(communicate, timeout=timeout)
        except BaseException:
            if process.returncode is None:
                process.kill()
                try:
                    await process.wait()
                except Exception:
                    pass
            raise

        return (
            process.returncode or 0,
            stdout.decode("utf-8", errors="replace"),
            stderr.decode("utf-8", errors="replace"),
        )

    async def _run_once(selected_edit_format: str) -> AiderRunResult:
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

    try:
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
        if result.ok:
            return result

        if _should_retry_with_whole(edit_format, result.output):
            fallback = await _run_once("whole")
            if fallback.ok:
                fallback.detail = "ok (retried with whole edit format)"
                fallback.stdout = "\n".join(
                    part for part in [result.stdout, "\n[retry] Falling back to whole edit format.\n", fallback.stdout] if part
                )
                fallback.stderr = "\n".join(part for part in [result.stderr, fallback.stderr] if part)
            return fallback

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
