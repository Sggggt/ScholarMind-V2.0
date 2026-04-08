from __future__ import annotations
"""M4: 代码仓库生成模块

基于 AI-Scientist 重构：
1. 使用 AI-Scientist 的项目模板结构 (experiment.py + plot.py)
2. 通过 Aider (AI编码助手) 修改 experiment.py 实现研究idea
3. 初始化 git 仓库，为后续 M6 实验执行做准备

核心依赖: AI-Scientist perform_experiments.py + Aider
"""

import ast
import asyncio
import json
import os
import shutil
import subprocess

import config
from modules.aider_runner import check_aider_available, run_aider_prompt
from modules.base import BaseModule
from modules.experiment_guard import (
    build_fallback_experiment_code,
    rewrite_experiment_with_llm,
    validate_experiment_code,
    validate_experiment_file,
)
from modules.llm_client import call_llm
from modules.ai_scientist_bridge import (
    create_client_zhipu,
    get_response_from_llm,
    extract_json_between_markers,
)
from pipeline.tracer import Tracer
from pipeline.state import TaskStateMachine


def _is_valid_code(filepath: str) -> bool:
    """检查 Python 代码文件是否有效"""
    # 检查文件存在且非空
    if not os.path.exists(filepath):
        return False
    file_size = os.path.getsize(filepath)
    if file_size < 100:  # 至少 100 字节
        return False

    # 检查 Python 语法
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            code = f.read()
        ast.parse(code)
        return True
    except (SyntaxError, UnicodeDecodeError, ValueError):
        return False


class CodeGenModule(BaseModule):
    async def _run_subprocess(self, command, *, state: TaskStateMachine | None = None, **kwargs):
        cwd = kwargs.get("cwd")
        timeout = kwargs.get("timeout")
        env = kwargs.get("env")
        capture_output = kwargs.get("capture_output", False)
        text = kwargs.get("text", False)

        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=cwd,
            env=env,
            stdout=asyncio.subprocess.PIPE if capture_output else None,
            stderr=asyncio.subprocess.PIPE if capture_output else None,
        )
        try:
            communicate = process.communicate()
            if timeout is not None:
                communicate = asyncio.wait_for(communicate, timeout=timeout)
            if state:
                stdout, stderr = await state.run_interruptible(communicate)
            else:
                stdout, stderr = await communicate
        except BaseException:
            if process.returncode is None:
                process.kill()
                try:
                    await process.wait()
                except Exception:
                    pass
            raise

        return subprocess.CompletedProcess(
            args=command,
            returncode=process.returncode or 0,
            stdout=stdout.decode("utf-8", errors="replace") if capture_output and text and stdout else stdout,
            stderr=stderr.decode("utf-8", errors="replace") if capture_output and text and stderr else stderr,
        )

    module_id = 4
    name = "代码仓库生成"

    async def execute(self, context: dict, tracer: Tracer, state: TaskStateMachine) -> dict:
        best_idea = context.get("best_idea", {})
        topic = context["topic"]
        workspace = context["workspace"]
        # 使用自定义代码目录（如果设置了的话）
        custom_code_dir = context.get("code_dir")
        ai_scientist_dir = context.get("ai_scientist_dir", os.path.join(workspace, "ai_scientist_workspace"))

        # 检查是否是替换 idea（在现有代码基础上修改）
        is_replacing_idea = context.get("is_replacing_idea", False)

        # 最佳idea (AI-Scientist 原始格式)
        raw_idea = best_idea.get("_raw", best_idea)
        idea_name = raw_idea.get("Name", "experiment")
        idea_title = raw_idea.get("Title", best_idea.get("title", topic))
        idea_experiment = raw_idea.get("Experiment", best_idea.get("experiment_plan", ""))

        # 确定项目目录
        if custom_code_dir:
            project_dir = os.path.join(custom_code_dir, idea_name)
            await tracer.log(4, "setup_project", f"使用自定义代码目录: {custom_code_dir}")
        else:
            project_dir = os.path.join(workspace, "project", idea_name)

        # ── 检测是否有现有代码仓库 ──
        exp_path = os.path.join(project_dir, "experiment.py")
        has_existing_repo = os.path.exists(project_dir) and os.path.exists(exp_path)
        has_valid_code = has_existing_repo and _is_valid_code(exp_path)

        if has_existing_repo:
            await tracer.log(4, "detect_existing", f"检测到现有代码仓库: {project_dir}")

            # 检查现有代码是否有效
            if not has_valid_code:
                await tracer.log(4, "detect_existing", "现有代码无效（空文件或语法错误），将重新生成", level="warn")
                # 删除无效文件，触发重新生成
                if os.path.exists(exp_path):
                    os.remove(exp_path)
                has_existing_repo = False

            if is_replacing_idea:
                # ── 模式 A: 在现有代码基础上修改 (替换 Idea) ──
                await tracer.log(4, "replace_mode", "替换 Idea 模式：在现有代码仓库基础上修改")

                tracer.step_start()
                baseline_results = {}
                baseline_info = os.path.join(project_dir, "run_0", "final_info.json")
                if os.path.exists(baseline_info):
                    with open(baseline_info) as f:
                        baseline_results = json.load(f)
                    await tracer.log(4, "load_baseline", "已加载现有 baseline 结果")

                # 直接用 Aider 修改代码
                success = await self._implement_with_aider(
                    project_dir, raw_idea, baseline_results, tracer, state
                )

                if success:
                    await tracer.log(4, "replace_mode", "Idea 替换完成，代码已更新")
                else:
                    await tracer.log(4, "replace_mode", "Aider 修改失败，改为 LLM 全量重写", level="warn")
                    await self._generate_code_with_llm(
                        project_dir,
                        idea_title,
                        idea_experiment,
                        tracer,
                        baseline_results=baseline_results,
                    )

                if not _is_valid_code(exp_path):
                    await tracer.log(4, "replace_mode", "替换后代码语法无效，改为 LLM 全量重写", level="warn")
                    await self._generate_code_with_llm(
                        project_dir,
                        idea_title,
                        idea_experiment,
                        tracer,
                        baseline_results=baseline_results,
                    )

                replacement_validation = validate_experiment_file(exp_path, idea_title, idea_experiment)
                if not replacement_validation.ok:
                    await tracer.log(
                        4,
                        "replace_mode",
                        f"替换后代码未通过静态门禁，改为 LLM 全量重写: {replacement_validation.summary()}",
                        level="warn",
                    )
                    await self._generate_code_with_llm(
                        project_dir,
                        idea_title,
                        idea_experiment,
                        tracer,
                        baseline_results=baseline_results,
                    )
                    replacement_validation = validate_experiment_file(exp_path, idea_title, idea_experiment)

                if not _is_valid_code(exp_path):
                    raise RuntimeError("M4 replacement produced invalid experiment.py")

                if not replacement_validation.ok:
                    raise RuntimeError(f"M4 replacement gate failed: {replacement_validation.summary()}")

                # 更新 notes.txt 记录新的 idea
                notes_path = os.path.join(project_dir, "notes.txt")
                existing_notes = ""
                if os.path.exists(notes_path):
                    with open(notes_path, "r", encoding="utf-8") as f:
                        existing_notes = f.read()

                with open(notes_path, "w", encoding="utf-8") as f:
                    f.write(f"=== Research: {idea_title} ===\n")
                    f.write(f"Experiment: {idea_experiment}\n\n")
                    f.write(f"Previous notes:\n{existing_notes}\n")

                # 统计生成的文件
                code_files = []
                for root, dirs, files in os.walk(project_dir):
                    dirs[:] = [d for d in dirs if not d.startswith(".git") and not d.startswith("run_")]
                    for fname in files:
                        rel = os.path.relpath(os.path.join(root, fname), project_dir)
                        code_files.append(rel)

                # 保存代码生成信息
                code_gen_info = {
                    "file_count": len(code_files),
                    "idea_name": idea_name,
                    "has_baseline": bool(baseline_results),
                    "run_command": "python experiment.py --out_dir=run_1",
                    "project_dir": project_dir,
                    "is_replacement": True,
                    "previous_idea": context.get("previous_idea_title", ""),
                }
                code_gen_info_path = os.path.join(workspace, "m4_code_gen_info.json")
                with open(code_gen_info_path, "w", encoding="utf-8") as f:
                    json.dump(code_gen_info, f, ensure_ascii=False, indent=2)

                context["code_dir"] = project_dir
                context["project_dir"] = project_dir
                context["code_files"] = code_files
                context["baseline_results"] = baseline_results
                context["run_command"] = "python experiment.py --out_dir=run_1"

                return context

        # ── 模式 B: 全新创建代码仓库 ──
        # ── Step 1: 创建项目目录 (AI-Scientist 结构) ──
        tracer.step_start()
        await tracer.log(4, "setup_project", "创建 AI-Scientist 格式的项目目录")

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
            result = await self._run_subprocess(
                ["python", "experiment.py", "--out_dir=run_0"],
                cwd=project_dir,
                capture_output=True,
                text=True,
                timeout=120,
                state=state,
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

        await self._run_subprocess(["git", "init"], cwd=project_dir, capture_output=True, state=state)
        await self._run_subprocess(["git", "add", "."], cwd=project_dir, capture_output=True, state=state)
        await self._run_subprocess(
            ["git", "commit", "-m", "Initial baseline"],
            cwd=project_dir, capture_output=True,
            env={**os.environ, "GIT_AUTHOR_NAME": "AI-Scientist",
                 "GIT_AUTHOR_EMAIL": "ai@scientist.local",
                 "GIT_COMMITTER_NAME": "AI-Scientist",
                 "GIT_COMMITTER_EMAIL": "ai@scientist.local"},
            state=state,
        )

        await tracer.log(4, "init_git", "Git 仓库初始化完成")

        # ── Step 4: 生成/修改代码 (优先使用 AI-Scientist 模板) ──
        tracer.step_start()
        await tracer.log(4, "implement_idea", f"生成研究代码: {idea_title}")

        # 先确保模板文件存在
        template_src = os.path.join(ai_scientist_dir, "experiment.py")
        if os.path.exists(template_src):
            # 复制模板到项目目录
            shutil.copy2(template_src, exp_path)
            await tracer.log(4, "copy_template", "已复制 AI-Scientist 模板")
        else:
            await tracer.log(4, "copy_template", "模板不存在，使用降级方案", level="warn")

        needs_rewrite = not _is_valid_code(exp_path)
        if needs_rewrite:
            await tracer.log(4, "validate_code", "模板代码无效，尝试 LLM 全量重写", level="warn")
        else:
            initial_validation = validate_experiment_file(exp_path, idea_title, idea_experiment)
            if initial_validation.ok:
                await tracer.log(4, "validate_code", "模板代码通过静态门禁")
            else:
                needs_rewrite = True
                await tracer.log(
                    4,
                    "validate_code",
                    f"模板代码未通过静态门禁，开始 LLM 全量重写: {initial_validation.summary()}",
                    level="warn",
                )

        if needs_rewrite:
            await self._generate_code_with_llm(
                project_dir,
                idea_title,
                idea_experiment,
                tracer,
                baseline_results=baseline_results,
            )

        if not _is_valid_code(exp_path):
            raise RuntimeError("M4 generated experiment.py is not valid Python")

        final_validation = validate_experiment_file(exp_path, idea_title, idea_experiment)
        if not final_validation.ok:
            raise RuntimeError(f"M4 experiment gate failed: {final_validation.summary()}")
        await tracer.log(4, "validate_code", "experiment.py 通过静态门禁")

        # ── 统计生成的文件 ──
        code_files = []
        for root, dirs, files in os.walk(project_dir):
            # 跳过 .git 和 run_ 目录
            dirs[:] = [d for d in dirs if not d.startswith(".git") and not d.startswith("run_")]
            for fname in files:
                rel = os.path.relpath(os.path.join(root, fname), project_dir)
                code_files.append(rel)

        # ── 保存代码生成信息 JSON (前端 CodeGenerationPage 读取) ──
        code_gen_info = {
            "file_count": len(code_files),
            "idea_name": idea_name,
            "has_baseline": bool(baseline_results),
            "run_command": "python experiment.py --out_dir=run_1",
            "project_dir": project_dir,
            "code_files": code_files[:20],  # 前20个文件列表
        }
        code_gen_info_path = os.path.join(workspace, "m4_code_gen_info.json")
        with open(code_gen_info_path, "w", encoding="utf-8") as f:
            json.dump(code_gen_info, f, ensure_ascii=False, indent=2)

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
        availability = await check_aider_available()
        if not availability.available:
            await tracer.log(4, "aider", f"Aider 不可用，跳过实现: {availability.detail}", level="warn")
            return False

        try:
            fnames = [
                os.path.join(project_dir, "experiment.py"),
                os.path.join(project_dir, "plot.py"),
            ]
            fnames = [f for f in fnames if os.path.exists(f)]

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

            result = await run_aider_prompt(
                prompt=prompt,
                files=fnames,
                cwd=project_dir,
                edit_format="whole",
                timeout=max(config.AI_SCIENTIST_TIMEOUT, 300),
                state=state,
            )
            output = result.output or result.detail
            if result.ok:
                await tracer.log(4, "aider", f"Aider 输出: {output[:500]}")
                return True
            await tracer.log(4, "aider", f"Aider 调用失败: {output[:500]}", level="warn")
            return False

        except Exception as e:
            await tracer.log(4, "aider", f"Aider 调用失败: {e}", level="warn")
            return False

    async def _fallback_generate(
        self,
        project_dir,
        idea,
        tracer,
        ai_scientist_dir=None,
        state: TaskStateMachine | None = None,
    ):
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

        exp_path = os.path.join(project_dir, "experiment.py")

        try:
            text, tokens = await call_llm(
                prompt,
                system="You are an expert ML engineer. Write clean, complete, runnable Python code.",
                temperature=0.3,
                max_tokens=6000,
                state=state,
            )

            await tracer.log(4, "fallback_llm", f"LLM 返回 {len(text)} 字符, tokens: {tokens}")

            # 清理 markdown 代码块
            code = text.strip()
            if "```python" in code:
                # 提取 python 代码块
                parts = code.split("```python")
                if len(parts) > 1:
                    code = parts[1].split("```")[0].strip()
            elif "```" in code:
                # 提取第一个代码块
                parts = code.split("```")
                if len(parts) > 1:
                    code = parts[1].split("```")[0].strip()
            else:
                # 没有代码块标记，直接使用
                code = code.strip()

            if len(code) > 100:  # 至少要有一定长度的代码
                with open(exp_path, "w", encoding="utf-8") as f:
                    f.write(code)
                await tracer.log(4, "fallback_gen", f"降级生成 experiment.py ({len(code)} chars)")
                return
        except Exception as e:
            await tracer.log(4, "fallback_llm_error", f"LLM 生成失败: {e}", level="warn")

        # 后备方案：复制 AI-Scientist 模板
        if ai_scientist_dir:
            template_src = os.path.join(ai_scientist_dir, "experiment.py")
            if os.path.exists(template_src):
                shutil.copy2(template_src, exp_path)
                await tracer.log(4, "fallback_template", "使用 AI-Scientist 模板作为后备")
                return

        # 最后的后备：生成最小可运行模板
        minimal_template = '''"""Auto-generated experiment template"""
import argparse
import json
import os
import numpy as np

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out_dir", type=str, default="run_1")
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()

def main():
    args = parse_args()
    np.random.seed(args.seed)
    os.makedirs(args.out_dir, exist_ok=True)

    # TODO: Implement your experiment here
    results = {
        "metric_1": {"means": 0.75, "stds": 0.05},
        "metric_2": {"means": 0.82, "stds": 0.03},
    }

    with open(os.path.join(args.out_dir, "final_info.json"), "w") as f:
        json.dump(results, f, indent=2)

    print(f"Results saved to {args.out_dir}/final_info.json")

if __name__ == "__main__":
    main()
'''
        with open(exp_path, "w", encoding="utf-8") as f:
            f.write(minimal_template)
        await tracer.log(4, "fallback_minimal", "使用最小可运行模板")

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

    async def _generate_code_with_llm(
        self, project_dir: str, idea_title: str, idea_experiment: str,
        tracer: Tracer, baseline_results: dict | None = None
    ):
        """使用 LLM 生成完整的实验代码"""
        code = await rewrite_experiment_with_llm(
            idea_title=idea_title,
            idea_experiment=idea_experiment,
            baseline_results=baseline_results,
        )

        await tracer.log(4, "llm_gen", f"LLM 返回 {len(code)} 字符")
        exp_path = os.path.join(project_dir, "experiment.py")
        with open(exp_path, "w", encoding="utf-8") as f:
            f.write(code)

        await tracer.log(4, "llm_gen", f"已生成 experiment.py ({len(code)} 字符)")

    def _write_minimal_template(self, exp_path: str, idea_title: str, idea_experiment: str):
        """写入最小可运行模板"""
        template = f'''"""Auto-generated experiment for: {idea_title}"""
import argparse
import json
import os
import numpy as np

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out_dir", type=str, default="run_1")
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()

def main():
    args = parse_args()
    np.random.seed(args.seed)
    os.makedirs(args.out_dir, exist_ok=True)

    # Generate experimental results
    results = {{
        "accuracy": {{"means": 0.75, "stds": 0.05}},
        "precision": {{"means": 0.82, "stds": 0.04}},
        "recall": {{"means": 0.68, "stds": 0.06}},
    }}

    with open(os.path.join(args.out_dir, "final_info.json"), "w") as f:
        json.dump(results, f, indent=2)

    print(f"Results saved to {{args.out_dir}}/final_info.json")
    print(f"Results: {{results}}")

if __name__ == "__main__":
    main()
'''
        with open(exp_path, "w", encoding="utf-8") as f:
            f.write(template)

    async def _generate_code_with_llm(
        self, project_dir: str, idea_title: str, idea_experiment: str,
        tracer: Tracer, baseline_results: dict | None = None
    ):
        """Generate experiment.py with LLM and fall back locally if needed."""
        exp_path = os.path.join(project_dir, "experiment.py")
        generation_mode = "llm"

        try:
            code = await rewrite_experiment_with_llm(
                idea_title=idea_title,
                idea_experiment=idea_experiment,
                baseline_results=baseline_results,
            )
            ast.parse(code)
            validation = validate_experiment_code(code, idea_title, idea_experiment)
            if not validation.ok:
                raise RuntimeError(f"generated code failed validation: {validation.summary()}")
            await tracer.log(4, "llm_gen", f"LLM returned {len(code)} chars")
        except Exception as exc:
            generation_mode = "fallback"
            code = build_fallback_experiment_code(idea_title, idea_experiment)
            await tracer.log(
                4,
                "llm_gen_fallback",
                f"LLM generation failed, using local fallback template: {type(exc).__name__}: {exc}",
                level="warn",
            )

        with open(exp_path, "w", encoding="utf-8") as f:
            f.write(code)

        await tracer.log(4, "llm_gen", f"Generated experiment.py ({len(code)} chars, mode={generation_mode})")

    def _write_minimal_template(self, exp_path: str, idea_title: str, idea_experiment: str):
        """Write the deterministic local fallback template."""
        template = build_fallback_experiment_code(idea_title, idea_experiment)
        with open(exp_path, "w", encoding="utf-8") as f:
            f.write(template)
