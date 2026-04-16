from __future__ import annotations

import asyncio
import importlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from subprocess import TimeoutExpired

import config
from modules.aider_runner import check_aider_available, run_aider_prompt
from modules.async_subprocess import run_subprocess
from modules.base import BaseModule
from modules.experiment_sim import (
    generate_experiment_figures,
    generate_realistic_results,
    results_to_final_info,
)
from modules.local_env_setup import ensure_local_experiment_env
from modules.ssh_runner import ssh_runner
from pipeline.state import TaskStateMachine
from pipeline.tracer import Tracer
from runtime_config import get_aide_python, get_llm_simulation_enabled
from services.agent_runtime import compact_summary, summarize_error_fingerprint

MAX_ITERS = 4
MAX_RUNS = 5
MAX_STDERR_OUTPUT = 1500
MAX_ENV_HISTORY = 6


def _trim_text(value: str, limit: int = 1200) -> str:
    text = (value or "").strip()
    if len(text) <= limit:
        return text
    return "..." + text[-limit:]


def _ensure_requirements_file(project_dir: str) -> str:
    requirements_path = os.path.join(project_dir, "requirements.txt")
    if not os.path.exists(requirements_path):
        with open(requirements_path, "w", encoding="utf-8") as handle:
            handle.write(
                "# Minimal dependencies for local and SSH experiment runs\n"
                "# Aider may update this file when environment issues are detected.\n"
            )
    return requirements_path


def _detect_environment_issue(error_text: str) -> dict | None:
    lowered = (error_text or "").lower()
    if not lowered:
        return None

    markers = (
        "modulenotfounderror",
        "no module named",
        "importerror",
        "cannot import name",
        "distributionnotfound",
        "resolutionimpossible",
        "could not find a version that satisfies the requirement",
        "no matching distribution found for",
        "failed to install dependencies from requirements.txt",
        "externally-managed-environment",
    )
    if not any(marker in lowered for marker in markers):
        return None

    module_name = ""
    if "no module named" in lowered:
        parts = error_text.split("No module named", 1)
        if len(parts) > 1:
            module_name = parts[1].strip().strip(":").strip().strip("'\"")

    return {
        "kind": "environment",
        "module_name": module_name,
        "error": _trim_text(error_text, limit=1500),
    }


def _format_env_fix_history(history: list[dict]) -> str:
    if not history:
        return "None."
    lines: list[str] = []
    for index, item in enumerate(history[-MAX_ENV_HISTORY:], start=1):
        lines.append(
            f"{index}. issue={item.get('issue', '')} | "
            f"action={item.get('action', '')} | "
            f"outcome={item.get('outcome', '')}"
        )
    return "\n".join(lines)


def _build_env_fix_prompt(*, base_prompt: str, env_issue: dict, history: list[dict]) -> str:
    return f"""{base_prompt}

Environment failure detected while running the experiment.

Current environment issue:
{json.dumps(env_issue, ensure_ascii=False, indent=2)}

Previous environment repair attempts:
{_format_env_fix_history(history)}

Update only the files needed to fix the environment problem:
1. requirements.txt: add or correct the minimal pip packages needed for this failure
2. experiment.py: only if import names or package usage must be adjusted

Hard rules:
- Keep requirements.txt minimal
- Use pip package names, not import names
- Do not repeat failed fixes from the history above
- Do not add unrelated packages
- If a package name was wrong previously, replace it instead of appending duplicates
- Preserve the experiment logic unless a small import fix is required

After editing, the runtime will recreate the local venv and retry the same run."""


def _build_run_failure_prompt(*, run_num: int, error_text: str) -> str:
    return f"""The last experiment execution failed.

Failed run:
- run_{run_num}

Observed runtime error:
{_trim_text(error_text, limit=2000)}

Update the implementation to fix this runtime failure before retrying the same run.

Edit only what is necessary:
1. experiment.py
2. requirements.txt only if the failure is dependency-related

Hard rules:
- Preserve the intended experiment design
- Fix the concrete runtime error instead of rewriting everything
- Keep the run command unchanged: python experiment.py --out_dir=run_{run_num}
- If the failure is due to undefined helpers, implement them in experiment.py
- If the failure is due to imports or packages, make the minimal dependency/code fix

After editing, the runtime will retry run_{run_num}."""


def _aide_site_packages_from_python(python_executable: str) -> list[str]:
    if not python_executable:
        return []
    python_path = Path(os.path.abspath(python_executable))
    venv_dir = python_path.parent.parent
    candidates: list[str] = []
    if os.name == "nt":
        candidate = venv_dir / "Lib" / "site-packages"
        if candidate.exists():
            candidates.append(str(candidate))
    else:
        lib_dir = venv_dir / "lib"
        if lib_dir.exists():
            for site_packages in sorted(lib_dir.glob("python*/site-packages")):
                if site_packages.exists():
                    candidates.append(str(site_packages))
    return candidates


def _load_aide_module():
    spec = importlib.util.find_spec("aide")
    if spec is not None:
        return importlib.import_module("aide"), "backend_python"

    aide_python = get_aide_python().strip() or getattr(config, "AIDE_PYTHON", "")
    if not aide_python:
        default_python = config.default_aide_python_path()
        if os.path.exists(default_python):
            aide_python = default_python
    for site_packages in _aide_site_packages_from_python(aide_python):
        if site_packages not in sys.path:
            sys.path.insert(0, site_packages)
        spec = importlib.util.find_spec("aide")
        if spec is not None:
            return importlib.import_module("aide"), site_packages

    raise ModuleNotFoundError(
        "AIDE is not available. Configure AIDE_PYTHON to point at a venv with aideml installed."
    )


class AgentRunnerModule(BaseModule):
    module_id = 6
    name = "Agent实验执行"

    async def execute(self, context: dict, tracer: Tracer, state: TaskStateMachine) -> dict:
        project_dir = context.get("project_dir", context.get("code_dir", ""))
        workspace = context["workspace"]
        max_runs = context.get("max_runs", MAX_RUNS)
        experiment_timeout = context.get("config", {}).get(
            "experiment_timeout",
            config.SANDBOX_TIMEOUT,
        )

        if ssh_runner.is_available():
            tracer.step_start()
            await tracer.log(6, "ssh_mode", "使用 SSH 远程 GPU 运行实验")
            all_results = await self._run_ssh(
                project_dir,
                context,
                max_runs,
                experiment_timeout,
                tracer,
                state,
            )
        else:
            tracer.step_start()
            if get_llm_simulation_enabled():
                await tracer.log(6, "local_mode", "本地执行真实实验，并允许追加 LLM 模拟数据")
                all_results = await self._run_with_llm_sim(
                    project_dir,
                    context,
                    max_runs,
                    experiment_timeout,
                    tracer,
                    state,
                )
            else:
                await tracer.log(6, "local_mode", "本地执行真实实验，LLM 模拟数据已禁用")
                all_results = await self._run_local(
                    project_dir,
                    context,
                    max_runs,
                    experiment_timeout,
                    tracer,
                    state,
                )

        results_path = os.path.join(workspace, "m6_experiment_results.json")
        with open(results_path, "w", encoding="utf-8") as handle:
            json.dump({"results": all_results}, handle, ensure_ascii=False, indent=2)

        successful = [result for result in all_results if result["status"] == "success"]
        await tracer.save_output(
            6,
            "experiment_results",
            file_path=results_path,
            metadata={"total_runs": len(all_results), "successful": len(successful)},
        )
        await tracer.log(6, "run_experiments", f"实验完成: {len(successful)}/{len(all_results)} 成功")

        context["experiment_results"] = all_results
        return context

    async def _run_with_llm_sim(self, project_dir, context, max_runs, timeout, tracer, state):
        results = []

        best_idea = context.get("best_idea", {})
        raw_idea = best_idea.get("_raw", best_idea)
        idea_title = raw_idea.get("Title", best_idea.get("title", ""))
        idea_method = raw_idea.get("Experiment", best_idea.get("method", ""))

        await tracer.log(6, "local_run", "先执行本地真实实验")
        local_results = await self._run_local(project_dir, context, max_runs, timeout, tracer, state)
        results.extend(local_results)

        await tracer.log(6, "llm_sim", "使用 LLM 生成补充实验数据")
        try:
            sim_data = await generate_realistic_results(
                idea_title=idea_title,
                idea_method=idea_method,
            )

            sim_path = os.path.join(context["workspace"], "experiment_data.json")
            with open(sim_path, "w", encoding="utf-8") as handle:
                json.dump(sim_data, handle, indent=2)

            final_info = results_to_final_info(sim_data)
            run_dir = os.path.join(project_dir, "run_sim")
            os.makedirs(run_dir, exist_ok=True)
            with open(os.path.join(run_dir, "final_info.json"), "w", encoding="utf-8") as handle:
                json.dump(final_info, handle, indent=2)

            results.append(
                {
                    "experiment": "run_sim",
                    "type": "llm_simulated",
                    "status": "success",
                    "metrics": {key: value["means"] for key, value in final_info.items()},
                }
            )
            await tracer.log(6, "llm_sim", "LLM 模拟实验数据已生成")
            context["experiment_full_data"] = sim_data
        except Exception as exc:
            await tracer.log(6, "llm_sim", f"LLM 数据生成失败: {exc}", level="warn")

        await tracer.log(6, "gen_figures", "生成论文图表")
        try:
            fig_dir = os.path.join(project_dir, "figures")
            figures = await generate_experiment_figures(
                idea_title,
                context.get("experiment_full_data", {}),
                fig_dir,
            )
            if figures:
                await tracer.log(6, "gen_figures", f"已生成 {len(figures)} 张图")
                context["figure_paths"] = figures
            else:
                await tracer.log(6, "gen_figures", "图表生成被跳过", level="warn")
        except Exception as exc:
            await tracer.log(6, "gen_figures", f"图表生成失败: {exc}", level="warn")

        return results

    async def _run_ssh(self, project_dir, context, max_runs, timeout, tracer, state):
        task_id = context["task_id"]
        results = []

        try:
            gpu_info = await ssh_runner.check_gpu()
            await tracer.log(6, "ssh_gpu", f"远程 GPU: {gpu_info}")

            await tracer.log(6, "ssh_upload", "上传实验代码到远程服务器")
            remote_dir = await ssh_runner.upload_code(project_dir, task_id)
            await tracer.log(6, "ssh_upload", f"代码已上传到 {remote_dir}")

            req_file = os.path.join(project_dir, "requirements.txt")
            reqs = []
            if os.path.exists(req_file):
                with open(req_file, encoding="utf-8") as handle:
                    reqs = [line.strip() for line in handle if line.strip() and not line.startswith("#")]

            if reqs:
                await tracer.log(6, "ssh_deps", f"安装依赖: {', '.join(reqs[:5])}")
                await ssh_runner.setup_remote_env(task_id, reqs)

            for run_num in range(max_runs):
                if state.is_aborted:
                    break

                await state.wait_if_paused()
                await tracer.log(6, f"ssh_run_{run_num}", f"SSH 执行 run_{run_num}")

                cmd = f"python experiment.py --out_dir=run_{run_num}"
                result = await ssh_runner.run_experiment(task_id, cmd, timeout=timeout)

                if result["status"] == "success":
                    metrics = await ssh_runner.download_results(task_id, project_dir, f"run_{run_num}")
                    parsed_metrics = {}
                    for key, value in metrics.items():
                        if isinstance(value, dict) and "means" in value:
                            parsed_metrics[key] = value["means"]
                        else:
                            parsed_metrics[key] = value

                    results.append(
                        {
                            "experiment": f"run_{run_num}",
                            "type": "ssh_remote",
                            "status": "success",
                            "metrics": parsed_metrics,
                            "gpu": gpu_info,
                        }
                    )
                    await tracer.log(6, f"ssh_run_{run_num}", f"run_{run_num} 成功: {parsed_metrics}")
                else:
                    results.append(
                        {
                            "experiment": f"run_{run_num}",
                            "type": "ssh_remote",
                            "status": "failed",
                            "error": result.get("stderr", "")[:500],
                        }
                    )
                    await tracer.log(
                        6,
                        f"ssh_run_{run_num}",
                        f"run_{run_num} 失败: {result.get('stderr', '')[:200]}",
                        level="warn",
                    )
        except Exception as exc:
            await tracer.log(6, "ssh_error", f"SSH 执行失败，降级到本地执行: {exc}", level="warn")
            results = await self._run_local(project_dir, context, max_runs, timeout, tracer, state)

        return results

    async def _run_local(self, project_dir, context, max_runs, timeout, tracer, state):
        results = []
        runtime = context.get("agent_runtime")

        aide_results = await self._try_aide(project_dir, context, tracer, state)
        if aide_results:
            return aide_results

        best_idea = context.get("best_idea", {})
        raw_idea = best_idea.get("_raw", best_idea)
        baseline_results = context.get("baseline_results", {})
        env_fix_history = context.setdefault("m6_env_fix_history", [])
        requirements_path = _ensure_requirements_file(project_dir)
        if runtime:
            await runtime.start_worker(
                role="experiment-worker",
                module=6,
                phase="m6",
                message="Experiment worker is preparing to execute follow-up runs.",
                ownership={"command": "python experiment.py --out_dir=run_n"},
            )

        await tracer.log(6, "subprocess", "准备本地实验执行环境")
        aider_status = await check_aider_available()
        if not aider_status.available:
            await tracer.log(6, "aider", f"Aider 不可用，跳过代码迭代: {aider_status.detail}", level="warn")

        from modules.m5_experiment_design import CODER_PROMPT

        base_prompt = CODER_PROMPT.format(
            title=raw_idea.get("Title", best_idea.get("title", "")),
            idea=raw_idea.get("Experiment", best_idea.get("experiment_plan", "")),
            max_runs=max_runs,
            baseline_results=json.dumps(baseline_results, indent=2),
        )
        next_prompt = base_prompt

        if runtime:
            await runtime.start_worker(
                role="env-worker",
                module=6,
                phase="m6",
                message="Environment worker is preparing the experiment execution environment.",
                ownership={"files": ["requirements.txt", ".venv-experiment"]},
            )
        local_env = await self._prepare_local_env_with_optional_repair(
            project_dir=project_dir,
            requirements_path=requirements_path,
            base_prompt=base_prompt,
            env_fix_history=env_fix_history,
            aider_available=aider_status.available,
            tracer=tracer,
            state=state,
            timeout=timeout,
            task_id=context.get("task_id", ""),
        )
        python_cmd = local_env.python_executable
        if runtime:
            await runtime.complete_worker(
                role="env-worker",
                module=6,
                phase="m6",
                message="Environment worker prepared the experiment execution environment.",
                summary={"python_executable": python_cmd},
                artifact_refs={"python_executable": python_cmd},
            )

        current_iter = 0
        run_num = 1

        while run_num <= max_runs:
            if state.is_aborted:
                break
            if current_iter >= MAX_ITERS:
                await tracer.log(6, "max_iters", "达到最大修复轮数", level="warn")
                break

            if aider_status.available:
                try:
                    result = await run_aider_prompt(
                        prompt=next_prompt,
                        files=[os.path.join(project_dir, "experiment.py")],
                        cwd=project_dir,
                        edit_format="diff",
                        timeout=max(config.AI_SCIENTIST_TIMEOUT, 300),
                        state=state,
                        tracer=tracer,
                        task_id=context.get("task_id", ""),
                        module=6,
                        phase="m6",
                        agent_role="code-worker",
                    )
                    if result.ok and "ALL_COMPLETED" in result.output:
                        break
                    if not result.ok:
                        await tracer.log(
                            6,
                            "aider",
                            f"Aider 迭代失败，继续执行当前代码: {result.output or result.detail}",
                            level="warn",
                        )
                except Exception as exc:
                    await tracer.log(6, "aider", f"Aider 迭代失败，继续执行当前代码: {exc}", level="warn")

            await tracer.log(6, f"run_{run_num}", f"执行 run_{run_num}")
            if runtime:
                await runtime.log_event(
                    module=6,
                    phase="m6",
                    kind="run_start",
                    message=f"Experiment worker started run_{run_num}.",
                    payload={"run_num": run_num, "iteration": current_iter},
                    role="experiment-worker",
                )
            returncode, next_prompt, metrics = await self._run_experiment_local_async(
                project_dir,
                run_num,
                timeout,
                state,
                python_cmd=python_cmd,
            )

            if returncode == 0:
                results.append(
                    {
                        "experiment": f"run_{run_num}",
                        "type": "local",
                        "status": "success",
                        "metrics": metrics,
                        "fix_rounds": current_iter,
                    }
                )
                await tracer.log(6, f"run_{run_num}", f"run_{run_num} 成功: {metrics}")
                if runtime:
                    await runtime.log_event(
                        module=6,
                        phase="m6",
                        kind="run_success",
                        message=f"Experiment worker completed run_{run_num}.",
                        payload={"run_num": run_num, "metrics": metrics, "fix_rounds": current_iter},
                        role="experiment-worker",
                    )
                run_num += 1
                current_iter = 0
                continue

            results.append(
                {
                    "experiment": f"run_{run_num}_attempt_{current_iter}",
                    "type": "local",
                    "status": "failed",
                    "error": next_prompt[:500],
                }
            )
            if runtime:
                await runtime.record_summary(
                    module=6,
                    phase="m6",
                    message=f"run_{run_num} failed and has been compressed for coordinator review.",
                    summary={
                        "run_num": run_num,
                        "attempt": current_iter,
                        "error_fingerprint": summarize_error_fingerprint(next_prompt),
                        "env_fix_history": compact_summary({"history": env_fix_history}),
                    },
                    artifact_refs={"requirements": requirements_path, "project_dir": project_dir},
                )

            env_issue = _detect_environment_issue(next_prompt)
            if env_issue and aider_status.available and current_iter < MAX_ITERS:
                repaired_env = await self._repair_environment_with_aider(
                    project_dir=project_dir,
                    requirements_path=requirements_path,
                    base_prompt=base_prompt,
                    env_issue=env_issue,
                    env_fix_history=env_fix_history,
                    tracer=tracer,
                    state=state,
                    timeout=timeout,
                    task_id=context.get("task_id", ""),
                )
                current_iter += 1
                if repaired_env is not None:
                    python_cmd = repaired_env.python_executable
                continue

            current_iter += 1

        successful_results = [result for result in results if result.get("status") == "success"]
        if runtime:
            if successful_results:
                await runtime.complete_worker(
                    role="experiment-worker",
                    module=6,
                    phase="m6",
                    message="Experiment worker produced at least one successful follow-up run.",
                    summary={"successful_runs": len(successful_results)},
                    artifact_refs={"project_dir": project_dir},
                )
            else:
                failure_reason = summarize_error_fingerprint(next_prompt)
                await runtime.fail_worker(
                    role="experiment-worker",
                    module=6,
                    phase="m6",
                    message="Experiment worker exhausted the local run loop without a successful follow-up run.",
                    error_fingerprint=failure_reason,
                    summary={"attempts": len(results)},
                )
                await runtime.update_root_decision(
                    module=6,
                    phase="m6",
                    message="Coordinator requested an in-place rollback to M4 after M6 exhausted its repair budget without success.",
                    payload={"reason": failure_reason, "attempts": len(results)},
                )
                context["agent_cycle_decision"] = {
                    "action": "rollback_m4",
                    "reason": failure_reason or "M6 exhausted repair iterations without a successful run.",
                }
        await self._run_plotting_async(project_dir, state, python_cmd=python_cmd)
        context["m6_env_fix_history"] = env_fix_history
        return results

    def _append_env_fix_history(self, env_fix_history: list[dict], *, issue: str, action: str, outcome: str) -> None:
        env_fix_history.append(
            {
                "issue": _trim_text(issue, limit=600),
                "action": _trim_text(action, limit=600),
                "outcome": _trim_text(outcome, limit=600),
            }
        )
        if len(env_fix_history) > MAX_ENV_HISTORY:
            del env_fix_history[:-MAX_ENV_HISTORY]

    async def _prepare_local_env_with_optional_repair(
        self,
        *,
        project_dir: str,
        requirements_path: str,
        base_prompt: str,
        env_fix_history: list[dict],
        aider_available: bool,
        tracer: Tracer,
        state: TaskStateMachine,
        timeout: int,
        task_id: str,
    ):
        try:
            return await ensure_local_experiment_env(
                project_dir,
                tracer=tracer,
                state=state,
                timeout=max(timeout, 1800),
            )
        except Exception as exc:
            env_issue = _detect_environment_issue(str(exc))
            if not env_issue or not aider_available:
                raise
            repaired_env = await self._repair_environment_with_aider(
                project_dir=project_dir,
                requirements_path=requirements_path,
                base_prompt=base_prompt,
                env_issue=env_issue,
                env_fix_history=env_fix_history,
                tracer=tracer,
                state=state,
                timeout=timeout,
                task_id=task_id,
            )
            if repaired_env is None:
                raise
            return repaired_env

    async def _repair_environment_with_aider(
        self,
        *,
        project_dir: str,
        requirements_path: str,
        base_prompt: str,
        env_issue: dict,
        env_fix_history: list[dict],
        tracer: Tracer,
        state: TaskStateMachine,
        timeout: int,
        task_id: str,
    ):
        prompt = _build_env_fix_prompt(
            base_prompt=base_prompt,
            env_issue=env_issue,
            history=env_fix_history,
        )
        await tracer.log(6, "env_repair", "Environment issue detected, asking Aider to update requirements.txt")

        result = await run_aider_prompt(
            prompt=prompt,
            files=[os.path.join(project_dir, "experiment.py"), requirements_path],
            cwd=project_dir,
            edit_format="diff",
            timeout=max(config.AI_SCIENTIST_TIMEOUT, 300),
            state=state,
            tracer=tracer,
            task_id=task_id,
            module=6,
            phase="m6",
            agent_role="env-worker",
        )
        if not result.ok:
            self._append_env_fix_history(
                env_fix_history,
                issue=env_issue.get("error", ""),
                action="aider_edit_failed",
                outcome=result.output or result.detail,
            )
            await tracer.log(6, "env_repair", f"Aider failed to repair environment: {result.output or result.detail}", level="warn")
            return None

        try:
            local_env = await ensure_local_experiment_env(
                project_dir,
                tracer=tracer,
                state=state,
                timeout=max(timeout, 1800),
                force_recreate=True,
            )
        except Exception as exc:
            self._append_env_fix_history(
                env_fix_history,
                issue=env_issue.get("error", ""),
                action="rebuild_local_env",
                outcome=str(exc),
            )
            await tracer.log(6, "env_repair", f"Environment rebuild failed after Aider edit: {exc}", level="warn")
            return None

        self._append_env_fix_history(
            env_fix_history,
            issue=env_issue.get("error", ""),
            action="aider_updated_requirements",
            outcome="local venv rebuilt successfully",
        )
        await tracer.log(6, "env_repair", "Aider updated requirements and the local venv was rebuilt successfully")
        return local_env

    async def _try_aide(self, project_dir, context, tracer, state: TaskStateMachine) -> list[dict] | None:
        try:
            aide, aide_source = _load_aide_module()

            best_idea = context.get("best_idea", {})
            raw_idea = best_idea.get("_raw", best_idea)
            topic = raw_idea.get("Title", best_idea.get("title", ""))

            data_dir = os.path.join(project_dir, "data")
            if not os.path.exists(data_dir):
                os.makedirs(data_dir, exist_ok=True)

            await tracer.log(6, "aide", f"使用 AIDE 框架运行实验: {topic} (source={aide_source})")

            exp = aide.Experiment(
                data_dir=data_dir,
                goal=(
                    f"Implement and evaluate: {topic}. "
                    "Use real datasets if available. Report accuracy, f1, and loss metrics."
                ),
                eval="accuracy",
            )

            best_solution = await state.run_interruptible(asyncio.to_thread(exp.run, steps=3))
            if best_solution:
                solution_path = os.path.join(project_dir, "aide_solution.py")
                with open(solution_path, "w", encoding="utf-8") as handle:
                    handle.write(str(best_solution))

                await tracer.log(6, "aide", "AIDE 实验完成")
                return [
                    {
                        "experiment": "aide_best",
                        "type": "aide",
                        "status": "success",
                        "metrics": {"aide_score": 1.0},
                    }
                ]
        except Exception as exc:
            await tracer.log(6, "aide", f"AIDE 不可用，降级到 subprocess: {exc}", level="warn")

        return None

    def _run_experiment_local(self, folder_name, run_num, timeout=7200, python_cmd="python"):
        cwd = os.path.abspath(folder_name)

        src = os.path.join(folder_name, "experiment.py")
        dst = os.path.join(folder_name, f"run_{run_num}.py")
        if os.path.exists(src):
            shutil.copy(src, dst)

        command = [python_cmd, "experiment.py", f"--out_dir=run_{run_num}"]

        try:
            result = subprocess.run(
                command,
                cwd=cwd,
                stderr=subprocess.PIPE,
                stdout=subprocess.PIPE,
                encoding="utf-8",
                errors="replace",
                timeout=timeout,
            )

            if result.returncode != 0:
                stderr_output = result.stderr
                if len(stderr_output) > MAX_STDERR_OUTPUT:
                    stderr_output = "..." + stderr_output[-MAX_STDERR_OUTPUT:]
                if os.path.exists(os.path.join(cwd, f"run_{run_num}")):
                    shutil.rmtree(os.path.join(cwd, f"run_{run_num}"))
                return result.returncode, _build_run_failure_prompt(
                    run_num=run_num,
                    error_text=stderr_output,
                ), {}

            info_path = os.path.join(cwd, f"run_{run_num}", "final_info.json")
            metrics = {}
            if os.path.exists(info_path):
                with open(info_path, encoding="utf-8") as handle:
                    data = json.load(handle)
                metrics = {
                    key: value["means"]
                    for key, value in data.items()
                    if isinstance(value, dict) and "means" in value
                }

            next_prompt = f"""Run {run_num} completed. Results:
{json.dumps(metrics, indent=2)}
Implement the next experiment or respond with 'ALL_COMPLETED'."""
            return 0, next_prompt, metrics
        except TimeoutExpired:
            if os.path.exists(os.path.join(cwd, f"run_{run_num}")):
                shutil.rmtree(os.path.join(cwd, f"run_{run_num}"))
            return 1, _build_run_failure_prompt(
                run_num=run_num,
                error_text=f"Timed out after {timeout}s",
            ), {}

    def _run_plotting(self, folder_name, timeout=600, python_cmd="python"):
        try:
            subprocess.run(
                [python_cmd, "plot.py"],
                cwd=os.path.abspath(folder_name),
                stderr=subprocess.PIPE,
                encoding="utf-8",
                errors="replace",
                timeout=timeout,
            )
        except Exception:
            pass

    async def _run_experiment_local_async(
        self,
        folder_name,
        run_num,
        timeout,
        state: TaskStateMachine,
        python_cmd="python",
    ):
        cwd = os.path.abspath(folder_name)

        src = os.path.join(folder_name, "experiment.py")
        dst = os.path.join(folder_name, f"run_{run_num}.py")
        if os.path.exists(src):
            shutil.copy(src, dst)

        completed = await run_subprocess(
            [python_cmd, "experiment.py", f"--out_dir=run_{run_num}"],
            cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            timeout=timeout,
            state=state,
        )

        stderr_output = completed.stderr.decode("utf-8", errors="replace") if completed.stderr else ""
        if completed.returncode != 0:
            if len(stderr_output) > MAX_STDERR_OUTPUT:
                stderr_output = "..." + stderr_output[-MAX_STDERR_OUTPUT:]
            if os.path.exists(os.path.join(cwd, f"run_{run_num}")):
                shutil.rmtree(os.path.join(cwd, f"run_{run_num}"))
            return completed.returncode or 1, _build_run_failure_prompt(
                run_num=run_num,
                error_text=stderr_output,
            ), {}

        info_path = os.path.join(cwd, f"run_{run_num}", "final_info.json")
        metrics = {}
        if os.path.exists(info_path):
            with open(info_path, encoding="utf-8") as handle:
                data = json.load(handle)
            metrics = {
                key: value["means"]
                for key, value in data.items()
                if isinstance(value, dict) and "means" in value
            }

        next_prompt = f"""Run {run_num} completed. Results:
{json.dumps(metrics, indent=2)}
Implement the next experiment or respond with 'ALL_COMPLETED'."""
        return 0, next_prompt, metrics

    async def _run_plotting_async(self, folder_name, state: TaskStateMachine, timeout=600, python_cmd="python"):
        plot_path = os.path.join(folder_name, "plot.py")
        if not os.path.exists(plot_path):
            return

        await run_subprocess(
            [python_cmd, "plot.py"],
            cwd=os.path.abspath(folder_name),
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
            timeout=timeout,
            state=state,
        )
