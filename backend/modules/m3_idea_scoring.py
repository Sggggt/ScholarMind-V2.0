from __future__ import annotations
"""M3: Idea生成与打分模块

基于 AI-Scientist 重构：
1. 调用 AI-Scientist 的 generate_ideas() 进行多轮反思式idea生成
2. 调用 AI-Scientist 的 check_idea_novelty() 通过 Semantic Scholar 验证新颖性
3. 选出最佳idea传递给下游

核心依赖: AI-Scientist generate_ideas.py
"""

import json
import os
import sys

from modules.base import BaseModule
from modules.ai_scientist_bridge import (
    create_client_zhipu,
    get_response_from_llm,
    extract_json_between_markers,
    search_for_papers,
)
from pipeline.tracer import Tracer
from pipeline.state import TaskStateMachine
import config

# AI-Scientist 的 prompt 模板 (直接复用)
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

    async def execute(self, context: dict, tracer: Tracer, state: TaskStateMachine) -> dict:
        workspace = context["workspace"]
        ai_scientist_dir = context.get("ai_scientist_dir", os.path.join(workspace, "ai_scientist_workspace"))
        max_ideas = context.get("config", {}).get("max_ideas", config.DEFAULT_MAX_IDEAS)
        num_reflections = context.get("config", {}).get("num_reflections", 3)

        client, model = create_client_zhipu()

        # 读取 M2 准备的模板文件
        prompt_path = os.path.join(ai_scientist_dir, "prompt.json")
        seed_path = os.path.join(ai_scientist_dir, "seed_ideas.json")
        exp_path = os.path.join(ai_scientist_dir, "experiment.py")

        with open(prompt_path, "r") as f:
            prompt = json.load(f)
        with open(seed_path, "r") as f:
            seed_ideas = json.load(f)
        with open(exp_path, "r") as f:
            code = f.read()

        # ── Step 1: 生成 Ideas (AI-Scientist generate_ideas 逻辑) ──
        tracer.step_start()
        await tracer.log(3, "generate_ideas", f"使用 AI-Scientist 多轮反思生成 {max_ideas} 个 idea")

        idea_str_archive = [json.dumps(seed) for seed in seed_ideas]
        idea_system_prompt = prompt["system"]

        for gen_idx in range(max_ideas):
            if state.is_aborted:
                break

            await tracer.log(3, "generate_ideas", f"生成第 {gen_idx + 1}/{max_ideas} 个 idea...")
            try:
                prev_ideas_string = "\n\n".join(idea_str_archive)
                msg_history = []

                # 第1轮
                text, msg_history = get_response_from_llm(
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
                    continue

                # 多轮反思
                if num_reflections > 1:
                    for j in range(num_reflections - 1):
                        text, msg_history = get_response_from_llm(
                            idea_reflection_prompt.format(
                                current_round=j + 2,
                                num_reflections=num_reflections,
                            ),
                            client=client,
                            model=model,
                            system_message=idea_system_prompt,
                            msg_history=msg_history,
                        )
                        json_output = extract_json_between_markers(text)
                        if json_output is None:
                            break
                        if "I am done" in text:
                            break

                if json_output:
                    idea_str_archive.append(json.dumps(json_output))
                    await tracer.log(3, "generate_ideas",
                                     f"  Idea {gen_idx+1}: {json_output.get('Title', 'N/A')} "
                                     f"(N={json_output.get('Novelty',0)} F={json_output.get('Feasibility',0)} "
                                     f"I={json_output.get('Interestingness',0)})")
            except Exception as e:
                await tracer.log(3, "generate_ideas", f"  生成失败: {e}", level="warn")
                continue

        # 解析所有 ideas
        all_ideas = []
        for idea_str in idea_str_archive:
            try:
                all_ideas.append(json.loads(idea_str))
            except json.JSONDecodeError:
                continue

        await tracer.log(3, "generate_ideas", f"共生成 {len(all_ideas)} 个 idea (含 {len(seed_ideas)} 个种子)")

        # ── Step 1.5: 树搜索 — 变异生成更多 idea ──
        tracer.step_start()
        await tracer.log(3, "tree_search", "树搜索: 对每个 idea 生成变异版本")

        original_count = len(all_ideas)
        mutations = []
        for idea in all_ideas[len(seed_ideas):]:  # 跳过种子
            if state.is_aborted:
                break
            try:
                new_ideas = await self._generate_mutations(
                    idea, prompt["task_description"], code, client, model
                )
                mutations.extend(new_ideas)
            except Exception as e:
                await tracer.log(3, "tree_search", f"变异失败: {e}", level="warn")

        all_ideas.extend(mutations)
        await tracer.log(3, "tree_search",
                         f"树搜索完成: {original_count} → {len(all_ideas)} 个 idea (+{len(mutations)} 变异)")

        # ── Step 2: Novelty Check (AI-Scientist check_idea_novelty 逻辑) ──
        tracer.step_start()
        await tracer.log(3, "novelty_check", "通过 Semantic Scholar 验证 idea 新颖性 (AI-Scientist)")

        max_novelty_rounds = 2  # 减少轮次避免 Semantic Scholar 限流
        # 只检查非种子的 top ideas (按评分排序)
        ideas_to_check = [i for i in all_ideas if "novel" not in i]
        ideas_to_check.sort(
            key=lambda x: x.get("Interestingness", 0) * x.get("Novelty", 0),
            reverse=True,
        )
        ideas_to_check = ideas_to_check[:5]  # 只检查前5个最好的

        for idx, idea in enumerate(ideas_to_check):
            if state.is_aborted:
                break
            if "novel" in idea:
                continue

            await tracer.log(3, "novelty_check",
                             f"检查 idea {idx+1}/{len(all_ideas)}: {idea.get('Name', idea.get('Title', ''))}")

            novel = False
            msg_history = []
            papers_str = ""

            for j in range(max_novelty_rounds):
                try:
                    text, msg_history = get_response_from_llm(
                        novelty_prompt.format(
                            current_round=j + 1,
                            num_rounds=max_novelty_rounds,
                            idea=json.dumps(idea),
                            last_query_results=papers_str,
                        ),
                        client=client,
                        model=model,
                        system_message=novelty_system_msg.format(
                            num_rounds=max_novelty_rounds,
                            task_description=prompt["task_description"],
                            code=code,
                        ),
                        msg_history=msg_history,
                    )

                    if "decision made: novel" in text.lower():
                        novel = True
                        break
                    if "decision made: not novel" in text.lower():
                        break

                    json_output = extract_json_between_markers(text)
                    if json_output is None:
                        break

                    query = json_output.get("Query", "")
                    if query:
                        papers = search_for_papers(query, result_limit=10)
                        if papers is None:
                            papers_str = "No papers found."
                        else:
                            paper_strings = []
                            for i, paper in enumerate(papers):
                                paper_strings.append(
                                    f"{i}: {paper.get('title', 'N/A')}. "
                                    f"{paper.get('venue', '')}, {paper.get('year', '')}.\n"
                                    f"Citations: {paper.get('citationCount', 0)}\n"
                                    f"Abstract: {paper.get('abstract', 'N/A')}"
                                )
                            papers_str = "\n\n".join(paper_strings)
                    else:
                        break
                except Exception as e:
                    await tracer.log(3, "novelty_check", f"  检查出错: {e}", level="warn")
                    # 搜索失败时默认标记为 novel
                    novel = True
                    break

            idea["novel"] = novel
            status = "novel" if novel else "not novel"
            await tracer.log(3, "novelty_check",
                             f"  {idea.get('Title', idea.get('Name', ''))}: {status}")

        # 如果 Semantic Scholar 限流导致所有检查失败，默认保留所有 idea
        novel_ideas = [i for i in all_ideas if i.get("novel", True)]
        if len(novel_ideas) == 0 and len(all_ideas) > 0:
            await tracer.log(3, "novelty_check",
                             "所有 idea 未通过新颖性检查(可能因API限流)，默认保留全部", level="warn")
            for idea in all_ideas:
                idea["novel"] = True
            novel_ideas = all_ideas
        await tracer.log(3, "novelty_check",
                         f"新颖性验证完成: {len(novel_ideas)}/{len(all_ideas)} 个 idea 通过")

        # ── Step 3: 排序选出最佳 idea ──
        tracer.step_start()
        await tracer.log(3, "rank_ideas", "排序并选出最佳 idea")

        # 按 AI-Scientist 的评分排序: Interestingness * Novelty * Feasibility
        for idea in novel_ideas:
            idea["composite_score"] = (
                idea.get("Interestingness", 5)
                * idea.get("Novelty", 5)
                * idea.get("Feasibility", 5)
            )

        novel_ideas.sort(key=lambda x: x.get("composite_score", 0), reverse=True)

        best_idea = novel_ideas[0] if novel_ideas else (all_ideas[0] if all_ideas else {})

        # 转换为下游模块期望的格式
        scored_ideas = []
        for idea in novel_ideas:
            scored_ideas.append({
                "title": idea.get("Title", idea.get("Name", "")),
                "Name": idea.get("Name", ""),
                "problem": idea.get("Experiment", ""),
                "method": idea.get("Experiment", ""),
                "key_innovation": idea.get("Title", ""),
                "experiment_plan": idea.get("Experiment", ""),
                "scores": {
                    "novelty": idea.get("Novelty", 5),
                    "feasibility": idea.get("Feasibility", 5),
                    "interestingness": idea.get("Interestingness", 5),
                },
                "overall_score": round(
                    (idea.get("Novelty", 5) + idea.get("Feasibility", 5) + idea.get("Interestingness", 5)) / 3, 1
                ),
                "novel": idea.get("novel", False),
                "composite_score": idea.get("composite_score", 0),
                # 保留 AI-Scientist 原始字段
                "_raw": idea,
            })

        best_idea_converted = scored_ideas[0] if scored_ideas else {}

        await tracer.log(3, "rank_ideas",
                         f"最佳 Idea: {best_idea_converted.get('title', 'N/A')} "
                         f"(score={best_idea_converted.get('overall_score', 0)})")

        # ── 保存产出 ──
        ideas_path = os.path.join(workspace, "m3_scored_ideas.json")
        all_ideas_path = os.path.join(ai_scientist_dir, "ideas.json")

        with open(ideas_path, "w", encoding="utf-8") as f:
            json.dump({
                "scored_ideas": scored_ideas,
                "best_idea_index": 0,
                "total_generated": len(all_ideas),
                "novel_count": len(novel_ideas),
            }, f, ensure_ascii=False, indent=2)

        with open(all_ideas_path, "w", encoding="utf-8") as f:
            json.dump(all_ideas, f, indent=4)

        await tracer.save_output(3, "ideas", file_path=ideas_path,
                                  metadata={
                                      "idea_count": len(scored_ideas),
                                      "novel_count": len(novel_ideas),
                                      "best_title": best_idea_converted.get("title", ""),
                                  })

        context["scored_ideas"] = scored_ideas
        context["best_idea"] = best_idea_converted
        context["best_idea_index"] = 0
        context["all_ideas_raw"] = all_ideas

        return context

    async def _generate_mutations(self, idea, task_description, code, client, model):
        """树搜索: 对一个 idea 生成 2 个变异版本"""
        mutation_prompt = f"""You have this research idea:
{json.dumps(idea, indent=2)}

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

        text, _ = get_response_from_llm(
            mutation_prompt, client, model,
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
