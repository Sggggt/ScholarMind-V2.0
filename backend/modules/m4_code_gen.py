from __future__ import annotations
"""M4: 代码仓库生成模块

基于 AI-Scientist 重构：
1. 使用 AI-Scientist 的项目模板结构 (experiment.py + plot.py)
2. 通过 Aider (AI编码助手) 修改 experiment.py 实现研究idea
3. 初始化 git 仓库，为后续 M6 实验执行做准备

核心依赖: AI-Scientist perform_experiments.py + Aider
"""

import json
import os
import shutil
import subprocess

from modules.base import BaseModule
from modules.llm_client import call_llm
from modules.ai_scientist_bridge import (
    create_client_zhipu,
    get_response_from_llm,
    extract_json_between_markers,
)
from pipeline.tracer import Tracer
from pipeline.state import TaskStateMachine
import config


class CodeGenModule(BaseModule):
    module_id = 4
    name = "代码仓库生成"

    async def execute(self, context: dict, tracer: Tracer, state: TaskStateMachine) -> dict:
        best_idea = context.get("best_idea", {})
        topic = context["topic"]
        workspace = context["workspace"]
        ai_scientist_dir = context.get("ai_scientist_dir", os.path.join(workspace, "ai_scientist_workspace"))

        # 最佳idea (AI-Scientist 原始格式)
        raw_idea = best_idea.get("_raw", best_idea)
        idea_name = raw_idea.get("Name", "experiment")
        idea_title = raw_idea.get("Title", best_idea.get("title", topic))
        idea_experiment = raw_idea.get("Experiment", best_idea.get("experiment_plan", ""))

        # ── Step 1: 创建项目目录 (AI-Scientist 结构) ──
        tracer.step_start()
        await tracer.log(4, "setup_project", "创建 AI-Scientist 格式的项目目录")

        project_dir = os.path.join(workspace, "project", idea_name)
        os.makedirs(project_dir, exist_ok=True)

        # 复制 AI-Scientist workspace 的模板文件
        for fname in ["experiment.py", "prompt.json", "seed_ideas.json"]:
            src = os.path.join(ai_scientist_dir, fname)
            dst = os.path.join(project_dir, fname)
            if os.path.exists(src):
                shutil.copy2(src, dst)

        # 创建 plot.py 模板
        plot_py = self._generate_plot_template()
        with open(os.path.join(project_dir, "plot.py"), "w") as f:
            f.write(plot_py)

        # 创建 notes.txt
        with open(os.path.join(project_dir, "notes.txt"), "w") as f:
            f.write(f"Research: {idea_title}\n\nExperiment notes will be added here.\n")

        # 创建 LaTeX 模板目录
        latex_dir = os.path.join(project_dir, "latex")
        os.makedirs(latex_dir, exist_ok=True)
        self._create_latex_template(latex_dir, idea_title)

        await tracer.log(4, "setup_project", "项目目录创建完成")

        # ── Step 2: 运行 baseline 实验 (run_0) ──
        tracer.step_start()
        await tracer.log(4, "run_baseline", "运行 baseline 实验 (run_0)")

        run_0_dir = os.path.join(project_dir, "run_0")
        os.makedirs(run_0_dir, exist_ok=True)

        try:
            result = subprocess.run(
                ["python", "experiment.py", "--out_dir=run_0"],
                cwd=project_dir,
                capture_output=True,
                text=True,
                timeout=120,
            )
            if result.returncode == 0:
                await tracer.log(4, "run_baseline", "Baseline 运行成功")
            else:
                await tracer.log(4, "run_baseline",
                                 f"Baseline 运行失败: {result.stderr[:500]}", level="warn")
        except Exception as e:
            await tracer.log(4, "run_baseline", f"Baseline 运行异常: {e}", level="warn")

        # 读取 baseline 结果
        baseline_results = {}
        baseline_info = os.path.join(run_0_dir, "final_info.json")
        if os.path.exists(baseline_info):
            with open(baseline_info) as f:
                baseline_results = json.load(f)

        # ── Step 3: 初始化 git 仓库 (Aider 需要) ──
        tracer.step_start()
        await tracer.log(4, "init_git", "初始化 git 仓库 (Aider 依赖)")

        subprocess.run(["git", "init"], cwd=project_dir, capture_output=True)
        subprocess.run(["git", "add", "."], cwd=project_dir, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "Initial baseline"],
            cwd=project_dir, capture_output=True,
            env={**os.environ, "GIT_AUTHOR_NAME": "AI-Scientist",
                 "GIT_AUTHOR_EMAIL": "ai@scientist.local",
                 "GIT_COMMITTER_NAME": "AI-Scientist",
                 "GIT_COMMITTER_EMAIL": "ai@scientist.local"},
        )

        await tracer.log(4, "init_git", "Git 仓库初始化完成")

        # ── Step 4: 用 Aider 实现 idea (AI-Scientist perform_experiments 逻辑) ──
        tracer.step_start()
        await tracer.log(4, "implement_idea", f"使用 Aider 实现研究 idea: {idea_title}")

        success = await self._implement_with_aider(
            project_dir, raw_idea, baseline_results, tracer, state
        )

        if success:
            await tracer.log(4, "implement_idea", "Idea 代码实现完成")
        else:
            await tracer.log(4, "implement_idea",
                             "Aider 实现未完全成功，使用 LLM 直接生成代码", level="warn")
            # 降级：直接用 LLM 生成完整 experiment.py
            await self._fallback_generate(project_dir, raw_idea, tracer)

        # ── 统计生成的文件 ──
        code_files = []
        for root, dirs, files in os.walk(project_dir):
            # 跳过 .git 和 run_ 目录
            dirs[:] = [d for d in dirs if not d.startswith(".git") and not d.startswith("run_")]
            for fname in files:
                rel = os.path.relpath(os.path.join(root, fname), project_dir)
                code_files.append(rel)

        # ── 保存产出 ──
        await tracer.save_output(4, "code_repo", file_path=project_dir,
                                  metadata={
                                      "file_count": len(code_files),
                                      "idea_name": idea_name,
                                      "has_baseline": bool(baseline_results),
                                  })

        context["code_dir"] = project_dir
        context["project_dir"] = project_dir
        context["code_files"] = code_files
        context["baseline_results"] = baseline_results
        context["run_command"] = "python experiment.py --out_dir=run_1"

        return context

    async def _implement_with_aider(
        self, project_dir, idea, baseline_results, tracer, state,
    ) -> bool:
        """使用 Aider 修改 experiment.py (AI-Scientist 的方式)"""
        try:
            from aider.coders import Coder
            from aider.models import Model
            from aider.io import InputOutput

            # 配置 Aider 使用智谱AI (litellm 需要 openai/ 前缀)
            os.environ["OPENAI_API_KEY"] = config.OPENAI_API_KEY
            os.environ["OPENAI_API_BASE"] = config.OPENAI_BASE_URL

            model_name = f"openai/{config.OPENAI_MODEL}"
            model = Model(model_name)
            io = InputOutput(yes=True)

            # 多文件支持: experiment.py + plot.py
            fnames = [
                os.path.join(project_dir, "experiment.py"),
                os.path.join(project_dir, "plot.py"),
            ]
            fnames = [f for f in fnames if os.path.exists(f)]

            coder = Coder.create(
                main_model=model,
                fnames=fnames,
                io=io,
                stream=False,
                use_git=True,
                edit_format="whole",  # 用 whole 格式生成完整文件，而非 diff
            )

            # 丰富的实现 prompt (含 checklist 和格式示例)
            prompt = f"""Your goal is to implement the following research idea: {idea.get('Title', '')}.

## Experiment Plan
{idea.get('Experiment', '')}

## Baseline Results
{json.dumps(baseline_results, indent=2)}

## Requirements Checklist
1. experiment.py MUST accept --out_dir and --seed arguments via argparse
2. Results MUST be saved to <out_dir>/final_info.json
3. Result format MUST be exactly:
   ```json
   {{
     "metric_name": {{"means": 0.85, "stds": 0.02}},
     "another_metric": {{"means": 0.72, "stds": 0.03}}
   }}
   ```
4. Use numpy.random.seed(args.seed) for reproducibility
5. Include at least 3 meaningful metrics (not just random numbers)
6. Import only standard/common libraries: numpy, json, os, time, collections, etc.
7. Include proper error handling for missing directories
8. The experiment should simulate or compute something meaningful related to the idea
9. Also update plot.py to visualize the results across different runs

Write the COMPLETE experiment.py file now. Do not leave any TODO or placeholder."""

            coder_out = coder.run(prompt)
            await tracer.log(4, "aider", f"Aider 输出: {str(coder_out)[:500]}")
            return True

        except Exception as e:
            await tracer.log(4, "aider", f"Aider 调用失败: {e}", level="warn")
            return False

    async def _fallback_generate(self, project_dir, idea, tracer):
        """降级方案：直接用 async LLM 生成完整 experiment.py"""
        prompt = f"""Generate a complete Python experiment script for the following research idea.

Title: {idea.get('Title', '')}
Experiment Plan: {idea.get('Experiment', '')}

Requirements Checklist:
1. Accept --out_dir and --seed arguments via argparse
2. Save results to out_dir/final_info.json
3. Result format: {{"metric_name": {{"means": float_value, "stds": float_value}}}}
4. Use numpy.random.seed(args.seed) for reproducibility
5. Include at least 3 meaningful metrics
6. Import only standard libraries (numpy, json, os, time, collections)
7. The experiment should compute something meaningful, not just random numbers
8. Include proper os.makedirs(args.out_dir, exist_ok=True)

Output ONLY the Python code, no markdown formatting."""

        text, _ = await call_llm(
            prompt,
            system="You are an expert ML engineer. Write clean, complete, runnable Python code.",
            temperature=0.3,
            max_tokens=6000,
        )

        # 清理
        code = text.strip()
        if code.startswith("```"):
            lines = code.split("\n")
            code = "\n".join(lines[1:])
        if code.endswith("```"):
            code = code[:-3].rstrip()

        exp_path = os.path.join(project_dir, "experiment.py")
        with open(exp_path, "w") as f:
            f.write(code)

        await tracer.log(4, "fallback_gen", f"降级生成 experiment.py ({len(code)} chars)")

    def _generate_plot_template(self) -> str:
        """生成 plot.py 模板 (AI-Scientist 格式)"""
        return '''"""
Plotting script for experiment results.
AI-Scientist will modify this to generate relevant figures.
"""
import json
import os
import matplotlib.pyplot as plt
import numpy as np

# Map from run directory to display label
labels = {
    "run_0": "Baseline",
}

def load_results(run_dir):
    """Load results from a run directory."""
    info_path = os.path.join(run_dir, "final_info.json")
    if os.path.exists(info_path):
        with open(info_path) as f:
            return json.load(f)
    return None

def plot_results():
    """Generate comparison plots."""
    results = {}
    for run_dir, label in labels.items():
        data = load_results(run_dir)
        if data:
            results[label] = data

    if not results:
        print("No results to plot.")
        return

    # Bar chart of all metrics
    metrics = set()
    for data in results.values():
        metrics.update(data.keys())

    fig, axes = plt.subplots(1, len(metrics), figsize=(5 * len(metrics), 5))
    if len(metrics) == 1:
        axes = [axes]

    for ax, metric in zip(axes, sorted(metrics)):
        values = []
        errs = []
        names = []
        for label, data in results.items():
            if metric in data:
                values.append(data[metric]["means"])
                errs.append(data[metric].get("stds", 0))
                names.append(label)
        ax.bar(names, values, yerr=errs, capsize=5)
        ax.set_title(metric)
        ax.set_ylabel("Value")

    plt.tight_layout()
    plt.savefig("comparison.png", dpi=150, bbox_inches="tight")
    print("Saved comparison.png")

if __name__ == "__main__":
    plot_results()
'''

    def _create_latex_template(self, latex_dir: str, title: str):
        """创建 LaTeX 模板 (AI-Scientist 格式)"""
        template = f"""\\documentclass{{article}}
\\usepackage[utf8]{{inputenc}}
\\usepackage{{amsmath,amssymb}}
\\usepackage{{graphicx}}
\\usepackage{{booktabs}}
\\usepackage{{hyperref}}
\\usepackage{{natbib}}
\\usepackage[margin=1in]{{geometry}}

\\title{{{title}}}
\\author{{AI Research Agent}}
\\date{{\\today}}

\\begin{{document}}
\\maketitle

\\begin{{abstract}}
TODO: Abstract will be generated by AI-Scientist writeup module.
\\end{{abstract}}

\\section{{Introduction}}
TODO

\\section{{Related Work}}
TODO

\\section{{Method}}
TODO

\\section{{Experiments}}
TODO

\\section{{Conclusion}}
TODO

\\bibliographystyle{{plainnat}}
\\bibliography{{references}}

\\end{{document}}
"""
        with open(os.path.join(latex_dir, "template.tex"), "w") as f:
            f.write(template)

        with open(os.path.join(latex_dir, "references.bib"), "w") as f:
            f.write("% References will be added by AI-Scientist\n")
