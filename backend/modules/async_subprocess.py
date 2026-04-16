from __future__ import annotations

import asyncio
import os
import signal
import subprocess
import threading
import time
from collections.abc import Sequence
from contextlib import suppress
from typing import Any

from pipeline.state import TaskStateMachine

_POLL_INTERVAL = 0.2


class _ThreadedSubprocessCancelled(Exception):
    """Raised internally when a threaded subprocess is cancelled."""


def _normalize_stdio(target: Any) -> Any:
    if target in (None, subprocess.STDOUT):
        return target
    if target in (asyncio.subprocess.PIPE, subprocess.PIPE):
        return subprocess.PIPE
    if target in (asyncio.subprocess.DEVNULL, subprocess.DEVNULL):
        return subprocess.DEVNULL
    return target


def _decode_output(value: bytes | None, *, text: bool) -> bytes | str | None:
    if not text or value is None:
        return value
    return value.decode("utf-8", errors="replace")


def _kill_process_tree(process: subprocess.Popen[bytes]) -> None:
    """Kill the entire process group to ensure child processes are also terminated."""
    try:
        pgid = os.getpgid(process.pid)
        if pgid > 0:
            os.killpg(pgid, signal.SIGKILL)
            return
    except (ProcessLookupError, PermissionError, OSError):
        pass
    with suppress(Exception):
        process.kill()


def _run_subprocess_sync(
    command: Sequence[str],
    *,
    cwd: str | None,
    env: dict[str, str] | None,
    stdout: Any,
    stderr: Any,
    timeout: float | None,
    text: bool,
    proc_holder: dict[str, subprocess.Popen[bytes]],
    cancel_event: threading.Event,
) -> subprocess.CompletedProcess[bytes | str | None]:
    process = subprocess.Popen(
        list(command),
        cwd=cwd,
        env=env,
        stdout=stdout,
        stderr=stderr,
        start_new_session=True,
    )
    proc_holder["proc"] = process
    deadline = None if timeout is None else time.monotonic() + timeout

    while True:
        if cancel_event.is_set():
            _kill_process_tree(process)
            with suppress(Exception):
                process.wait()
            raise _ThreadedSubprocessCancelled()

        wait_timeout = _POLL_INTERVAL
        if deadline is not None:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                _kill_process_tree(process)
                with suppress(Exception):
                    process.wait()
                raise asyncio.TimeoutError()
            wait_timeout = min(wait_timeout, remaining)

        try:
            stdout_data, stderr_data = process.communicate(timeout=wait_timeout)
            return subprocess.CompletedProcess(
                args=list(command),
                returncode=process.returncode or 0,
                stdout=_decode_output(stdout_data, text=text),
                stderr=_decode_output(stderr_data, text=text),
            )
        except subprocess.TimeoutExpired:
            continue


async def _run_subprocess_threaded(
    command: Sequence[str],
    *,
    cwd: str | None,
    env: dict[str, str] | None,
    stdout: Any,
    stderr: Any,
    timeout: float | None,
    text: bool,
    state: TaskStateMachine | None,
) -> subprocess.CompletedProcess[bytes | str | None]:
    cancel_event = threading.Event()
    proc_holder: dict[str, subprocess.Popen[bytes]] = {}

    worker = asyncio.create_task(
        asyncio.to_thread(
            _run_subprocess_sync,
            command,
            cwd=cwd,
            env=env,
            stdout=stdout,
            stderr=stderr,
            timeout=timeout,
            text=text,
            proc_holder=proc_holder,
            cancel_event=cancel_event,
        )
    )

    async def _wait_for_worker():
        return await worker

    try:
        if state:
            return await state.run_interruptible(_wait_for_worker())
        return await _wait_for_worker()
    except BaseException:
        cancel_event.set()
        process = proc_holder.get("proc")
        if process and process.poll() is None:
            _kill_process_tree(process)
        with suppress(asyncio.CancelledError, _ThreadedSubprocessCancelled, Exception):
            await asyncio.wait_for(worker, timeout=5)
        raise


async def run_subprocess(
    command: Sequence[str],
    *,
    cwd: str | None = None,
    env: dict[str, str] | None = None,
    stdout: Any = None,
    stderr: Any = None,
    timeout: float | None = None,
    text: bool = False,
    state: TaskStateMachine | None = None,
) -> subprocess.CompletedProcess[bytes | str | None]:
    normalized_stdout = _normalize_stdio(stdout)
    normalized_stderr = _normalize_stdio(stderr)

    try:
        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=cwd,
            env=env,
            stdout=normalized_stdout,
            stderr=normalized_stderr,
            start_new_session=True,
        )
    except NotImplementedError:
        return await _run_subprocess_threaded(
            command,
            cwd=cwd,
            env=env,
            stdout=normalized_stdout,
            stderr=normalized_stderr,
            timeout=timeout,
            text=text,
            state=state,
        )

    try:
        communicate = process.communicate()
        if state:
            deadline = None
            if timeout is not None:
                deadline = asyncio.get_event_loop().time() + timeout
            stdout_data, stderr_data = await state.run_interruptible(communicate, deadline=deadline)
        elif timeout is not None:
            communicate = asyncio.wait_for(communicate, timeout=timeout)
            stdout_data, stderr_data = await communicate
        else:
            stdout_data, stderr_data = await communicate
    except BaseException:
        if process.returncode is None:
            try:
                pgid = os.getpgid(process.pid)
                os.killpg(pgid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError, OSError):
                with suppress(Exception):
                    process.kill()
            with suppress(Exception):
                await process.wait()
        raise

    return subprocess.CompletedProcess(
        args=list(command),
        returncode=process.returncode or 0,
        stdout=_decode_output(stdout_data, text=text),
        stderr=_decode_output(stderr_data, text=text),
    )
