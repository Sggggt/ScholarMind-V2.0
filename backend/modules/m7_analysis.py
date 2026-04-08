from __future__ import annotations
"""M7: 结果分析模块

基于 AI-Scientist 重构：
1. 从各 run_i/final_info.json 收集实验结果
2. 使用 LLM 分析结果 (AI-Scientist 风格)
3. 判断是否达标，生成分析报告
4. 更新 notes.txt 供 M8 论文写作使用

核心依赖: AI-Scientist 实验结果格式 (final_info.json)
"""

import json
import os
import glob

from modules.base import BaseModule
from modules.ai_scientist_bridge import (
    extract_json_between_markers,
)
from modules.llm_client import call_llm
from pipeline.tracer import Tracer
from pipeline.state import TaskStateMachine


class AnalysisModule(BaseModule):
    module_id = 7
    name = "结果分析"

    async def execute(self, context: dict, tracer: Tracer, state: TaskStateMachine) -> dict:
        project_dir = context.get("project_dir", context.get("code_dir", ""))
        best_idea = context.get("best_idea", {})
        experiment_results = context.get("experiment_results", [])
        workspace = context["workspace"]

        state.check_control()

        # ── Step 1: 收集所有 run 结果 (AI-Scientist 格式) ──
        tracer.step_start()
        await tracer.log(7, "collect_results", "收集实验结果 (final_info.json)")

        all_run_results = {}

        # 从 run_0 (baseline) 开始收集
        for run_dir in sorted(glob.glob(os.path.join(project_dir, "run_*"))):
            run_name = os.path.basename(run_dir)
            info_path = os.path.join(run_dir, "final_info.json")
            if os.path.exists(info_path):
                with open(info_path) as f:
                    data = json.load(f)
                all_run_results[run_name] = {
                    k: v["means"] if isinstance(v, dict) and "means" in v else v
                    for k, v in data.items()
                }

        # 也从 M6 的 experiment_results 收集
        for r in experiment_results:
            if r.get("status") == "success" and r.get("metrics"):
                all_run_results[r["experiment"]] = r["metrics"]

        await tracer.log(7, "collect_results",
                         f"收集到 {len(all_run_results)} 组实验结果")

        # 读取 notes.txt
        notes = ""
        notes_path = os.path.join(project_dir, "notes.txt")
        if os.path.exists(notes_path):
            with open(notes_path) as f:
                notes = f.read()

        # ── Step 2: LLM 分析结果 (AI-Scientist 风格) ──
        tracer.step_start()
        await tracer.log(7, "analyze_results", "分析实验结果")

        raw_idea = best_idea.get("_raw", best_idea)
        idea_title = raw_idea.get("Title", best_idea.get("title", ""))

        analysis_prompt = f"""You are a senior ML researcher analyzing experiment results.

Research Idea: {idea_title}
Experiment Plan: {raw_idea.get("Experiment", best_idea.get("experiment_plan", ""))}

Experiment Results (from multiple runs):
{json.dumps(all_run_results, indent=2)}

Experiment Notes:
{notes[:3000]}

Please analyze:
1. Compare baseline (run_0) with subsequent runs
2. Identify which experimental changes led to improvements
3. Determine if the results support the research hypothesis
4. Identify key findings and insights

Respond in the following format:

THOUGHT:
<Your detailed analysis>

ANALYSIS JSON:
```json
{{
    "experiment_analysis": [
        {{
            "run": "run_name",
            "description": "what this run tested",
            "key_metrics": {{}},
            "vs_baseline": "improvement/degradation/similar",
            "observation": "key observation"
        }}
    ],
    "comparison_table": {{
        "headers": ["Run", "Metric1", "Metric2"],
        "rows": [["run_0 (baseline)", "0.65", "0.55"]]
    }},
    "key_findings": [
        "Finding 1",
        "Finding 2"
    ],
    "passed": true,
    "pass_reason": "Why the experiments are considered successful or not",
    "overall_assessment": "Overall assessment (200 words)"
}}
```"""

        text, _ = await call_llm(
            analysis_prompt,
            system="You are a meticulous ML researcher.",
            temperature=0.3,
            state=state,
        )

        analysis_data = extract_json_between_markers(text) or {
            "experiment_analysis": [],
            "key_findings": ["Analysis parsing failed"],
            "passed": len(all_run_results) > 1,
            "overall_assessment": text[:500],
        }

        passed = analysis_data.get("passed", False)
        findings = analysis_data.get("key_findings", [])

        await tracer.log(7, "analyze_results",
                         f"分析完成: {'达标' if passed else '未达标'}, "
                         f"{len(findings)} 个关键发现")

        # ── Step 3: 生成 Markdown 分析报告 ──
        tracer.step_start()
        await tracer.log(7, "generate_report", "生成分析报告")

        report_prompt = f"""Based on the analysis below, generate a detailed experiment results report in Markdown.

Analysis:
{json.dumps(analysis_data, indent=2)}

Include:
1. Comparison table of all runs
2. Key findings
3. Discussion of results
4. Limitations"""

        state.check_control()
        report_md, _ = await call_llm(
            report_prompt,
            system="You are a scientific report writer.",
            temperature=0.3,
            state=state,
        )

        # ── 保存产出 ──
        analysis_path = os.path.join(workspace, "m7_analysis.json")
        report_path = os.path.join(workspace, "m7_analysis_report.md")

        with open(analysis_path, "w", encoding="utf-8") as f:
            json.dump(analysis_data, f, ensure_ascii=False, indent=2)
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(report_md)

        await tracer.save_output(7, "analysis_report", file_path=report_path,
                                  metadata={"passed": passed})

        context["analysis_passed"] = passed
        context["analysis_data"] = analysis_data
        context["analysis_report"] = report_md
        context["key_findings"] = findings
        context["all_run_results"] = all_run_results

        return context
