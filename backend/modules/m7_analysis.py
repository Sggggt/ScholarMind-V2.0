from __future__ import annotations

"""M7: result analysis module."""

import glob
import json
import os

from modules.ai_scientist_bridge import extract_json_between_markers
from modules.base import BaseModule
from modules.llm_client import call_llm
from pipeline.state import TaskStateMachine
from pipeline.tracer import Tracer


def _load_run_metrics(project_dir: str) -> dict[str, dict]:
    results: dict[str, dict] = {}
    for run_dir in sorted(glob.glob(os.path.join(project_dir, "run_*"))):
        run_name = os.path.basename(run_dir)
        info_path = os.path.join(run_dir, "final_info.json")
        if not os.path.exists(info_path):
            continue
        with open(info_path, encoding="utf-8") as handle:
            data = json.load(handle)
        results[run_name] = {
            key: value["means"] if isinstance(value, dict) and "means" in value else value
            for key, value in data.items()
        }
    return results


def _build_no_followup_analysis(has_baseline: bool) -> tuple[dict, str]:
    analysis_data = {
        "experiment_analysis": [],
        "comparison_table": {
            "headers": ["Run", "Status"],
            "rows": [["run_0 (baseline)", "available"]] if has_baseline else [],
        },
        "key_findings": [
            "Only baseline results are available.",
            "No successful follow-up experiment runs were produced by M6.",
            "Comparative analysis is blocked until experiment execution succeeds.",
        ],
        "passed": False,
        "pass_reason": "No successful follow-up experiments completed, so the hypothesis cannot be evaluated beyond the baseline.",
        "overall_assessment": "M7 skipped comparative analysis because only baseline results were available.",
    }
    report_md = "\n".join(
        [
            "# Experiment Analysis",
            "",
            "## Status",
            "",
            "Only baseline results were found. No successful follow-up experiment runs completed.",
            "",
            "## Findings",
            "",
            "- Baseline `run_0` is available for reference." if has_baseline else "- Baseline `run_0` is unavailable.",
            "- M6 produced no successful non-baseline runs.",
            "- Fix the runtime failure in `experiment.py` before comparing results.",
        ]
    )
    return analysis_data, report_md


class AnalysisModule(BaseModule):
    module_id = 7
    name = "结果分析"

    async def execute(self, context: dict, tracer: Tracer, state: TaskStateMachine) -> dict:
        project_dir = context.get("project_dir", context.get("code_dir", ""))
        best_idea = context.get("best_idea", {})
        experiment_results = context.get("experiment_results", [])
        workspace = context["workspace"]

        state.check_control()

        tracer.step_start()
        await tracer.log(7, "collect_results", "收集实验结果 (final_info.json)")

        all_run_results = _load_run_metrics(project_dir)
        successful_followup_results: dict[str, dict] = {}
        for result in experiment_results:
            run_name = str(result.get("experiment", "")).strip()
            if result.get("status") != "success" or not result.get("metrics") or run_name == "run_0":
                continue
            successful_followup_results[run_name] = result["metrics"]
            all_run_results[run_name] = result["metrics"]

        has_baseline = "run_0" in all_run_results
        await tracer.log(
            7,
            "collect_results",
            f"Collected baseline={1 if has_baseline else 0}, successful_followup_runs={len(successful_followup_results)}",
        )

        notes = ""
        notes_path = os.path.join(project_dir, "notes.txt")
        if os.path.exists(notes_path):
            with open(notes_path, encoding="utf-8") as handle:
                notes = handle.read()

        tracer.step_start()
        await tracer.log(7, "analyze_results", "分析实验结果")

        raw_idea = best_idea.get("_raw", best_idea)
        idea_title = raw_idea.get("Title", best_idea.get("title", ""))

        if not successful_followup_results:
            analysis_data, report_md = _build_no_followup_analysis(has_baseline)
        else:
            analysis_prompt = f"""You are a senior ML researcher analyzing experiment results.

Research Idea: {idea_title}
Experiment Plan: {raw_idea.get("Experiment", best_idea.get("experiment_plan", ""))}

Experiment Results (baseline plus successful follow-up runs only):
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
                "passed": len(successful_followup_results) > 0,
                "overall_assessment": text[:500],
            }

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

        passed = bool(analysis_data.get("passed", False))
        findings = analysis_data.get("key_findings", [])
        await tracer.log(
            7,
            "analyze_results",
            f"分析完成: {'达标' if passed else '未达标'}, {len(findings)} 个关键发现",
        )

        analysis_path = os.path.join(workspace, "m7_analysis.json")
        report_path = os.path.join(workspace, "m7_analysis_report.md")
        with open(analysis_path, "w", encoding="utf-8") as handle:
            json.dump(analysis_data, handle, ensure_ascii=False, indent=2)
        with open(report_path, "w", encoding="utf-8") as handle:
            handle.write(report_md)

        await tracer.save_output(7, "analysis_report", file_path=report_path, metadata={"passed": passed})

        context["analysis_passed"] = passed
        context["analysis_data"] = analysis_data
        context["analysis_report"] = report_md
        context["key_findings"] = findings
        context["all_run_results"] = all_run_results
        return context
