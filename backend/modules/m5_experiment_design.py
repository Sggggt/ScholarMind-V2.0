from __future__ import annotations
"""M5: 实验设计模块

基于 AI-Scientist 重构：
使用 AI-Scientist perform_experiments.py 的 coder_prompt 逻辑，
通过 Aider 让 LLM 规划实验方案并修改 experiment.py。

核心依赖: AI-Scientist perform_experiments.py
"""

import asyncio
import json
import os
import shutil

from modules.base import BaseModule
from modules.ai_scientist_bridge import (
    create_async_client_zhipu,
    get_response_from_llm_async,
    extract_json_between_markers,
)
from pipeline.tracer import Tracer
from pipeline.state import TaskStateMachine
import config


def _aider_available() -> bool:
    """检查 Aider 是否可用"""
    # 先检查 OpenAI 版本兼容性 - Aider 需要 openai < 1.0
    try:
        import openai
        # 如果是新版 OpenAI SDK (>=1.0)，api_base 属性不存在，Aider 不可用
        if not hasattr(openai, 'api_base'):
            return False
    except ImportError:
        pass
    # 尝试导入 Aider
    try:
        import importlib
        importlib.import_module('aider.coders')
        importlib.import_module('aider.models')
        importlib.import_module('aider.io')
        return True
    except (ImportError, AttributeError):
        return False

# AI-Scientist 的实验 prompt (共享常量，M6 也会引用)
CODER_PROMPT = """Your goal is to implement the following idea: {title}.
The proposed experiment is as follows: {idea}.
You are given a total of up to {max_runs} runs to complete the necessary experiments. You do not need to use all {max_runs}.

First, plan the list of experiments you would like to run. For example, if you are sweeping over a specific hyperparameter, plan each value you would like to test for each run.

Note that we already provide the vanilla baseline results, so you do not need to re-run it.

For reference, the baseline results are as follows:

{baseline_results}

After you complete each change, we will run the command `python experiment.py --out_dir=run_i' where i is the run number and evaluate the results.
YOUR PROPOSED CHANGE MUST USE THIS COMMAND FORMAT, DO NOT ADD ADDITIONAL COMMAND LINE ARGS.
You can then implement the next thing on your list."""


class ExperimentDesignModule(BaseModule):
    module_id = 5
    name = "实验设计"

    MAX_RUNS = 5

    async def execute(self, context: dict, tracer: Tracer, state: TaskStateMachine) -> dict:
        best_idea = context.get("best_idea", {})
        project_dir = context.get("project_dir", context.get("code_dir", ""))
        baseline_results = context.get("baseline_results", {})
        workspace = context["workspace"]

        raw_idea = best_idea.get("_raw", best_idea)
        idea_title = raw_idea.get("Title", best_idea.get("title", ""))
        idea_experiment = raw_idea.get("Experiment", best_idea.get("experiment_plan", ""))

        # ── Step 1: 用 LLM 设计实验方案 (AI-Scientist 风格) ──
        tracer.step_start()
        await tracer.log(5, "design_experiments", "设计实验方案 (AI-Scientist coder_prompt)")

        client, model = create_async_client_zhipu()

        prompt = CODER_PROMPT.format(
            title=idea_title,
            idea=idea_experiment,
            max_runs=self.MAX_RUNS,
            baseline_results=json.dumps(baseline_results, indent=2),
        )

        text, _ = await get_response_from_llm_async(
            prompt + "\n\nPlease output your experiment plan as a JSON with the following format:\n"
            '```json\n{"experiments": [{"run_num": 1, "description": "...", '
            '"changes": "what to modify in experiment.py", "expected_outcome": "..."}], '
            '"total_runs_planned": 3}\n```',
            client, model,
            system_message="You are an ambitious AI PhD student planning experiments.",
            temperature=0.7,
        )

        plan_data = extract_json_between_markers(text) or {"experiments": [], "total_runs_planned": 1}
        experiments = plan_data.get("experiments", [])

        await tracer.log(5, "design_experiments",
                         f"设计了 {len(experiments)} 个实验 (最多 {self.MAX_RUNS} runs)")

        # ── Step 2: 用 Aider 实现实验修改 ──
        tracer.step_start()
        await tracer.log(5, "implement_experiments", "使用 Aider 实现实验代码修改")

        if not _aider_available():
            await tracer.log(5, "implement_experiments",
                             "Aider 未安装，跳过 Aider 实现，实验将使用当前代码", level="warn")
        else:
            try:
                from aider.coders import Coder
                from aider.models import Model
                from aider.io import InputOutput

                os.environ["OPENAI_API_KEY"] = config.OPENAI_API_KEY
                os.environ["OPENAI_API_BASE"] = config.OPENAI_BASE_URL

                aider_model = Model(f"openai/{config.OPENAI_MODEL}")
                io = InputOutput(yes=True)
                fnames = [os.path.join(project_dir, "experiment.py")]

                coder = Coder.create(
                    main_model=aider_model,
                    fnames=fnames,
                    io=io,
                    stream=False,
                    use_git=True,
                    edit_format="diff",
                )

                # 发送完整实验计划给 Aider (使用 asyncio.to_thread 包装同步调用)
                full_prompt = CODER_PROMPT.format(
                    title=idea_title,
                    idea=idea_experiment,
                    max_runs=self.MAX_RUNS,
                    baseline_results=json.dumps(baseline_results, indent=2),
                )
                coder_out = await asyncio.to_thread(coder.run, full_prompt)
                await tracer.log(5, "implement_experiments", "Aider 完成实验代码修改")

            except Exception as e:
                await tracer.log(5, "implement_experiments",
                                 f"Aider 失败，实验将使用当前代码: {e}", level="warn")

        # ── 保存产出 ──
        plan_path = os.path.join(workspace, "m5_experiment_plan.json")
        with open(plan_path, "w", encoding="utf-8") as f:
            json.dump(plan_data, f, ensure_ascii=False, indent=2)

        # 复制当前 experiment.py 作为备份
        exp_src = os.path.join(project_dir, "experiment.py")
        if os.path.exists(exp_src):
            shutil.copy2(exp_src, os.path.join(project_dir, "experiment_planned.py"))

        await tracer.save_output(5, "experiment_plan", file_path=plan_path,
                                  metadata={"experiment_count": len(experiments)})

        context["experiment_plan"] = plan_data
        context["experiments"] = experiments
        context["max_runs"] = self.MAX_RUNS

        return context
