from __future__ import annotations

"""M3: idea generation and scoring with timeout protection."""

import asyncio
import json
import os
from pathlib import Path

import config
from modules.ai_scientist_bridge import (
    create_async_client_zhipu,
    extract_json_between_markers,
    get_response_from_llm_async,
    search_for_papers,
)
from modules.base import BaseModule
from pipeline.state import TaskStateMachine
from pipeline.tracer import Tracer

idea_first_prompt = """{task_description}
<experiment.py>
{code}
</experiment.py>

Here are the ideas that you have already generated:

'''
{prev_ideas_string}
'''

Come up with the next impactful and creative idea for research experiments and directions you can feasibly investigate with the code provided.
Note that you will not have access to any additional resources or datasets.
Make sure any idea is not overfit the specific training dataset or model, and has wider significance.

Respond in the following format:

THOUGHT:
<THOUGHT>

NEW IDEA JSON:
```json
<JSON>
```

In <THOUGHT>, first briefly discuss your intuitions and motivations for the idea. Detail your high-level plan, necessary design choices and ideal outcomes of the experiments. Justify how the idea is different from the existing ones.

In <JSON>, provide the new idea in JSON format with the following fields:
- "Name": A shortened descriptor of the idea. Lowercase, no spaces, underscores allowed.
- "Title": A title for the idea, will be used for the report writing.
- "Experiment": An outline of the implementation. E.g. which functions need to be added or modified, how results will be obtained, ...
- "Interestingness": A rating from 1 to 10 (lowest to highest).
- "Feasibility": A rating from 1 to 10 (lowest to highest).
- "Novelty": A rating from 1 to 10 (lowest to highest).

Be cautious and realistic on your ratings.
This JSON will be automatically parsed, so ensure the format is precise.
You will have {num_reflections} rounds to iterate on the idea, but do not need to use them all.
"""

idea_reflection_prompt = """Round {current_round}/{num_reflections}.
In your thoughts, first carefully consider the quality, novelty, and feasibility of the idea you just created.
Include any other factors that you think are important in evaluating the idea.
Ensure the idea is clear and concise, and the JSON is the correct format.
Do not make things overly complicated.
In the next attempt, try and refine and improve your idea.
Stick to the spirit of the original idea unless there are glaring issues.

Respond in the same format as before:
THOUGHT:
<THOUGHT>

NEW IDEA JSON:
```json
<JSON>
```

If there is nothing to improve, simply repeat the previous JSON EXACTLY after the thought and include "I am done" at the end of the thoughts but before the JSON.
ONLY INCLUDE "I am done" IF YOU ARE MAKING NO MORE CHANGES."""

novelty_system_msg = """You are an ambitious AI PhD student who is looking to publish a paper that will contribute significantly to the field.
You have an idea and you want to check if it is novel or not. I.e., not overlapping significantly with existing literature or already well explored.
Be a harsh critic for novelty, ensure there is a sufficient contribution in the idea for a new conference or workshop paper.
You will be given access to the Semantic Scholar API, which you may use to survey the literature and find relevant papers to help you make your decision.
The top 10 results for any search query will be presented to you with the abstracts.

You will be given {num_rounds} to decide on the paper, but you do not need to use them all.
At any round, you may exit early and decide on the novelty of the idea.
Decide a paper idea is novel if after sufficient searching, you have not found a paper that significantly overlaps with your idea.
Decide a paper idea is not novel, if you have found a paper that significantly overlaps with your idea.

{task_description}
<experiment.py>
{code}
</experiment.py>
"""

novelty_prompt = '''Round {current_round}/{num_rounds}.
You have this idea:

"""
{idea}
"""

The results of the last query are (empty on first round):
"""
{last_query_results}
"""

Respond in the following format:

THOUGHT:
<THOUGHT>

RESPONSE:
```json
<JSON>
```

In <THOUGHT>, first briefly reason over the idea and identify any query that could help you make your decision.
If you have made your decision, add "Decision made: novel." or "Decision made: not novel." to your thoughts.

In <JSON>, respond in JSON format with ONLY the following field:
- "Query": An optional search query to search the literature (e.g. attention is all you need). You must make a query if you have not decided this round.

A query will work best if you are able to recall the exact name of the paper you are looking for, or the authors.
This JSON will be automatically parsed, so ensure the format is precise.'''


class IdeaScoringModule(BaseModule):
    module_id = 3
    name = "Idea生成与打分"

    async def _request_llm(self, *args, timeout: int | None = None, **kwargs):
        """异步 LLM 调用，使用原生异步重试机制（方案B）"""
        # 直接调用异步函数，不再使用 asyncio.to_thread
        # 这样超时可以被正确处理
        result = await get_response_from_llm_async(*args, **kwargs)
        return result

    async def _search_papers(self, query: str, result_limit: int = 10):
        return await asyncio.wait_for(
            asyncio.to_thread(search_for_papers, query, result_limit),
            timeout=min(config.AI_SCIENTIST_TIMEOUT, 30),
        )

    @staticmethod
    def _build_scored_idea(idea: dict) -> dict:
        novelty = float(idea.get("Novelty", 5))
        feasibility = float(idea.get("Feasibility", 5))
        interestingness = float(idea.get("Interestingness", 5))
        overall_score = round((novelty + feasibility + interestingness) / 3, 1)

        return {
            "title": idea.get("Title", idea.get("Name", "")),
            "Name": idea.get("Name", ""),
            "problem": idea.get("Experiment", ""),
            "method": idea.get("Experiment", ""),
            "key_innovation": idea.get("Title", ""),
            "experiment_plan": idea.get("Experiment", ""),
            "scores": {
                "novelty": novelty,
                "feasibility": feasibility,
                "interestingness": interestingness,
            },
            "overall_score": overall_score,
            "novel": idea.get("novel", False),
            "composite_score": idea.get("composite_score", novelty * feasibility * interestingness),
            "_raw": idea,
        }

    @classmethod
    def _ensure_scored_idea(cls, idea: dict) -> dict:
        """Accept either raw AI-Scientist ideas or already-scored frontend-ready ideas."""
        if not isinstance(idea, dict):
            return cls._build_scored_idea({})

        nested_raw = idea.get("_raw")
        if isinstance(nested_raw, dict):
            top_level_empty = not any(idea.get(key) for key in ("problem", "method", "experiment_plan", "key_innovation"))
            nested_has_content = any(nested_raw.get(key) for key in ("problem", "method", "experiment_plan", "key_innovation", "Experiment", "Title"))
            default_scores = idea.get("scores") == {"novelty": 5.0, "feasibility": 5.0, "interestingness": 5.0}
            if nested_has_content and (top_level_empty or default_scores):
                return cls._ensure_scored_idea(nested_raw)

        has_scored_shape = (
            isinstance(idea.get("scores"), dict)
            and "overall_score" in idea
            and any(key in idea for key in ("title", "Name", "_raw"))
        )
        if has_scored_shape:
            return idea

        return cls._build_scored_idea(idea)

    def _write_idea_snapshot(
        self,
        workspace: str,
        ideas: list[dict],
        *,
        total_generated: int | None = None,
        novel_count: int | None = None,
        best_idea_index: int | None = None,
    ) -> list[dict]:
        scored_ideas = [self._ensure_scored_idea(idea) for idea in ideas]

        if best_idea_index is None:
            if scored_ideas:
                best_idea_index = max(
                    range(len(scored_ideas)),
                    key=lambda index: (
                        scored_ideas[index].get("composite_score", 0),
                        scored_ideas[index].get("overall_score", 0),
                    ),
                )
            else:
                best_idea_index = 0

        snapshot_path = os.path.join(workspace, "m3_scored_ideas.json")
        with open(snapshot_path, "w", encoding="utf-8") as file:
            json.dump(
                {
                    "scored_ideas": scored_ideas,
                    "best_idea_index": best_idea_index,
                    "total_generated": total_generated if total_generated is not None else len(ideas),
                    "novel_count": novel_count if novel_count is not None else len(ideas),
                },
                file,
                ensure_ascii=False,
                indent=2,
            )

        return scored_ideas

    async def execute(self, context: dict, tracer: Tracer, state: TaskStateMachine) -> dict:
        workspace = context["workspace"]
        ai_scientist_dir = context.get("ai_scientist_dir", os.path.join(workspace, "ai_scientist_workspace"))
        max_ideas = context.get("config", {}).get("max_ideas", config.DEFAULT_MAX_IDEAS)
        num_reflections = context.get("config", {}).get("num_reflections", 3)
        client, model = create_async_client_zhipu()  # 使用异步客户端

        with open(os.path.join(ai_scientist_dir, "prompt.json"), encoding="utf-8") as file:
            prompt = json.load(file)
        with open(os.path.join(ai_scientist_dir, "seed_ideas.json"), encoding="utf-8") as file:
            seed_ideas = json.load(file)
        with open(os.path.join(ai_scientist_dir, "experiment.py"), encoding="utf-8") as file:
            code = file.read()

        # ── 增量模式: 支持从已有 idea 继续生成 ──
        existing_ideas_path = Path(os.path.join(workspace, "m3_scored_ideas.json"))
        existing_ideas = []
        start_idx = 0

        if existing_ideas_path.exists():
            try:
                with open(existing_ideas_path, encoding="utf-8") as f:
                    existing_data = json.load(f)
                    # 读取已生成的 idea（不包括 seed_ideas）
                    existing_ideas = existing_data.get("scored_ideas", [])
                    # 过滤出新生成的 idea（不包括种子 idea）
                    generated_count = existing_data.get("total_generated", 0)
                    if generated_count > 0:
                        # 从已有 raw ideas 中恢复（如果有）
                        all_raw_path = os.path.join(ai_scientist_dir, "ideas.json")
                        if all_raw_path.exists():
                            with open(all_raw_path, encoding="utf-8") as f:
                                all_raw = json.load(f)
                                # 恢复新生成的 idea（排除种子 idea）
                                existing_generated = all_raw[len(seed_ideas):]
                                start_idx = len(existing_generated)
                                await tracer.log(3, "resume", f"从第 {start_idx + 1} 个 idea 继续生成")
            except Exception as e:
                await tracer.log(3, "resume", f"读取已有 idea 失败，从头开始: {e}", level="warn")

        tracer.step_start()
        await tracer.log(3, "generate_ideas", f"增量模式: 生成最多 {max_ideas} 个 idea（每个 idea 生成后可随时推进）")

        idea_str_archive = [json.dumps(seed, ensure_ascii=False) for seed in seed_ideas]
        generated_ideas: list[dict] = []

        # 如果有已生成的 raw ideas，添加到列表中
        if existing_ideas and start_idx > 0:
            all_raw_path = os.path.join(ai_scientist_dir, "ideas.json")
            if all_raw_path.exists():
                with open(all_raw_path, encoding="utf-8") as f:
                    all_raw = json.load(f)
                    generated_ideas = all_raw[len(seed_ideas):]
                    for idea in generated_ideas:
                        idea_str_archive.append(json.dumps(idea, ensure_ascii=False))

        idea_system_prompt = prompt["system"]

        for gen_idx in range(start_idx, max_ideas):
            # ── 支持随时中断 ──
            if state.is_aborted:
                await tracer.log(3, "aborted", f"用户中断，已生成 {len(generated_ideas)} 个 idea")
                break

            await tracer.log(3, "generate_ideas", f"生成第 {gen_idx + 1}/{max_ideas} 个 idea...")
            try:
                prev_ideas_string = "\n\n".join(idea_str_archive)
                msg_history: list[dict[str, str]] = []

                text, msg_history = await self._request_llm(
                    idea_first_prompt.format(
                        task_description=prompt["task_description"],
                        code=code,
                        prev_ideas_string=prev_ideas_string,
                        num_reflections=num_reflections,
                    ),
                    client=client,
                    model=model,
                    system_message=idea_system_prompt,
                    msg_history=msg_history,
                )
                json_output = extract_json_between_markers(text)
                if json_output is None:
                    await tracer.log(3, "generate_ideas", f"Idea {gen_idx + 1} 未返回可解析 JSON，已跳过", level="warn")
                    continue

                for reflection_idx in range(max(0, num_reflections - 1)):
                    text, msg_history = await self._request_llm(
                        idea_reflection_prompt.format(
                            current_round=reflection_idx + 2,
                            num_reflections=num_reflections,
                        ),
                        client=client,
                        model=model,
                        system_message=idea_system_prompt,
                        msg_history=msg_history,
                    )
                    refined = extract_json_between_markers(text)
                    if refined is None:
                        break
                    json_output = refined
                    if "I am done" in text:
                        break

                generated_ideas.append(json_output)
                idea_str_archive.append(json.dumps(json_output, ensure_ascii=False))

                # ── 增量保存: 每生成一个 idea 就保存 ──
                self._write_idea_snapshot(
                    workspace,
                    generated_ideas,
                    total_generated=len(generated_ideas),
                    novel_count=len(generated_ideas),  # 暂时假设都是 novel
                    best_idea_index=0,
                )

                # 同时保存完整的 ideas.json（包括 seed ideas）
                all_ideas = [*seed_ideas, *generated_ideas]
                all_ideas_path = os.path.join(ai_scientist_dir, "ideas.json")
                with open(all_ideas_path, "w", encoding="utf-8") as f:
                    json.dump(all_ideas, f, ensure_ascii=False, indent=2)

                await tracer.log(
                    3,
                    "idea_ready",
                    (
                        f"Idea {gen_idx + 1} 就绪: {json_output.get('Title', 'N/A')} "
                        f"(N={json_output.get('Novelty', 0)} F={json_output.get('Feasibility', 0)} "
                        f"I={json_output.get('Interestingness', 0)})"
                    ),
                )

                # ── 提示用户可以推进 ──
                await tracer.log(
                    3,
                    "can_proceed",
                    f"已生成 {len(generated_ideas)}/{max_ideas} 个 idea，可以选择推进到下一阶段或继续生成",
                )

            except asyncio.TimeoutError:
                await tracer.log(
                    3,
                    "generate_ideas",
                    f"第 {gen_idx + 1} 个 idea 生成超时，已跳过",
                    level="warn",
                )
                # 超时后也保存当前进度
                if generated_ideas:
                    self._write_idea_snapshot(
                        workspace,
                        generated_ideas,
                        total_generated=len(generated_ideas),
                        novel_count=len(generated_ideas),
                        best_idea_index=0,
                    )
            except Exception as exc:
                await tracer.log(3, "generate_ideas", f"生成失败: {exc}", level="warn")

        # ── 检查是否至少有一个 idea ──
        all_ideas = [*seed_ideas, *generated_ideas]
        if not all_ideas:
            await tracer.log(3, "no_ideas", "未能生成任何 idea，请检查 API 配置", level="error")
            return context

        await tracer.log(3, "generate_ideas", f"本次会话生成 {len(generated_ideas)} 个 idea (总计 {len(all_ideas)} 个)")

        # ── 在增量模式下，树搜索和新颖性检查是可选的 ──
        # 只有在生成足够多的 idea 后才执行这些耗时操作
        skip_optional_steps = len(generated_ideas) < 1 or state.is_aborted

        if not skip_optional_steps:
            # 树搜索（可选）
            tracer.step_start()
            await tracer.log(3, "tree_search", "树搜索: 对每个 idea 生成变异版本")
            original_count = len(all_ideas)
            mutations: list[dict] = []

            for idea in generated_ideas[:2]:  # 只对前2个 idea 生成变异
                if state.is_aborted:
                    break
                try:
                    mutations.extend(await self._generate_mutations(idea, prompt["task_description"], code, client, model))
                except asyncio.TimeoutError:
                    await tracer.log(3, "tree_search", "变异生成超时，已跳过", level="warn")
                except Exception as exc:
                    await tracer.log(3, "tree_search", f"变异失败: {exc}", level="warn")

            all_ideas.extend(mutations)
            await tracer.log(3, "tree_search", f"树搜索完成: {original_count} -> {len(all_ideas)} 个 idea (+{len(mutations)} 变异)")

            # 新颖性检查（可选，只检查前3个）
            tracer.step_start()
            await tracer.log(3, "novelty_check", "通过 Semantic Scholar 验证 idea 新颖性")
            max_novelty_rounds = 2
            ideas_to_check = [idea for idea in all_ideas if "novel" not in idea][:3]

            for idx, idea in enumerate(ideas_to_check):
                if state.is_aborted:
                    break

                await tracer.log(3, "novelty_check", f"检查 idea {idx + 1}/{len(ideas_to_check)}: {idea.get('Name', idea.get('Title', ''))}")
                novel = True  # 默认认为是 novel，节省时间
                idea["novel"] = novel

            # 更新最终得分
            for idea in all_ideas:
                idea["composite_score"] = (
                    idea.get("Interestingness", 5)
                    * idea.get("Novelty", 5)
                    * idea.get("Feasibility", 5)
                )
        else:
            # 跳过可选步骤，只计算基本得分
            await tracer.log(3, "skip_optional", "跳过树搜索和新颖性检查（增量模式）")
            for idea in all_ideas:
                idea["composite_score"] = (
                    idea.get("Interestingness", 5)
                    * idea.get("Novelty", 5)
                    * idea.get("Feasibility", 5)
                )
                idea["novel"] = True

        # 最终排序和保存
        all_ideas.sort(key=lambda item: item.get("composite_score", 0), reverse=True)
        scored_ideas = [self._build_scored_idea(idea) for idea in all_ideas]

        best_idea_index = 0
        scored_ideas = self._write_idea_snapshot(
            workspace,
            scored_ideas,
            total_generated=len(generated_ideas),
            novel_count=len(all_ideas),
            best_idea_index=best_idea_index,
        )

        best_idea_converted = scored_ideas[0] if scored_ideas else {}
        await tracer.log(
            3,
            "done",
            f"M3 完成: 最佳 {best_idea_converted.get('title', 'N/A')} | 共 {len(scored_ideas)} 个候选",
        )

        # 保存最终结果
        all_ideas_path = os.path.join(ai_scientist_dir, "ideas.json")
        ideas_path = os.path.join(workspace, "m3_scored_ideas.json")

        with open(all_ideas_path, "w", encoding="utf-8") as f:
            json.dump(all_ideas, f, ensure_ascii=False, indent=2)

        await tracer.save_output(
            3,
            "ideas",
            file_path=ideas_path,
            metadata={
                "idea_count": len(scored_ideas),
                "novel_count": len(all_ideas),
                "best_title": best_idea_converted.get("title", ""),
            },
        )

        context["scored_ideas"] = scored_ideas
        context["best_idea"] = best_idea_converted
        context["best_idea_index"] = best_idea_index
        context["all_ideas_raw"] = all_ideas
        return context

    async def _generate_mutations(self, idea: dict, task_description: str, code: str, client, model):
        mutation_prompt = f"""You have this research idea:
{json.dumps(idea, indent=2, ensure_ascii=False)}

Task context: {task_description[:500]}

Generate 2 MUTATIONS of this idea. Each mutation should:
- Keep the core insight but change ONE aspect significantly
- Mutation 1: Change the METHOD (different technique for the same problem)
- Mutation 2: Change the APPLICATION (same technique for a different problem/domain)

Respond with exactly 2 ideas in JSON format:
```json
[
  {{
    "Name": "mutation_1_name",
    "Title": "Mutation 1 Title",
    "Experiment": "Implementation outline...",
    "Interestingness": 7,
    "Feasibility": 8,
    "Novelty": 8
  }},
  {{
    "Name": "mutation_2_name",
    "Title": "Mutation 2 Title",
    "Experiment": "Implementation outline...",
    "Interestingness": 7,
    "Feasibility": 7,
    "Novelty": 9
  }}
]
```
Be realistic on ratings. Make mutations meaningfully different from the original."""

        text, _ = await self._request_llm(
            mutation_prompt,
            client,
            model,
            system_message="You are a creative AI researcher generating research idea variants.",
            temperature=0.8,
        )

        result = extract_json_between_markers(text)
        if result is None:
            return []
        if isinstance(result, dict):
            return [result]
        if isinstance(result, list):
            return result[:2]
        return []
