from __future__ import annotations
"""M9: ICLR/NeurIPS式评审打分模块 (V2 - 文献 grounded)

升级点：
1. 评审前搜索 Semantic Scholar，获取相关论文
2. 将真实文献 context 注入 reviewer prompt
3. 新增 "Literature Grounding" 评审维度 (1-4)
4. 保持 AI-Scientist 的 NeurIPS 评审格式

核心依赖: AI-Scientist perform_review.py + Semantic Scholar API
"""

import json
import os
import asyncio

import numpy as np

from modules.base import BaseModule
from modules.llm_client import call_llm, call_llm_json
from modules.ai_scientist_bridge import (
    create_client_zhipu,
    get_response_from_llm,
    extract_json_between_markers,
    search_for_papers,
)
from pipeline.tracer import Tracer
from pipeline.state import TaskStateMachine
import config

# ── 评审 prompt ──
reviewer_system_prompt_neg = (
    "You are an AI researcher reviewing a paper submitted to a prestigious ML venue (NeurIPS/ICML/ICLR). "
    "Be critical and cautious in your decision. "
    "If a paper is bad or you are unsure, give it bad scores and reject it."
)

reviewer_system_prompt_pos = (
    "You are an AI researcher reviewing a paper submitted to a prestigious ML venue (NeurIPS/ICML/ICLR). "
    "Be critical and cautious in your decision. "
    "If a paper is good or you are unsure, give it good scores and accept it."
)

# NeurIPS review form (V2: 加入 LiteratureGrounding 维度)
neurips_form_v2 = """
## Review Form

Respond in the following format:

THOUGHT:
<THOUGHT>

REVIEW JSON:
```json
<JSON>
```

In <THOUGHT>, first briefly discuss your intuitions and reasoning for the evaluation.
Detail your high-level arguments. Be specific to this paper, not generic.

In <JSON>, provide the review in JSON format with these fields:
- "Summary": A summary of the paper content and contributions.
- "Strengths": A list of strengths (be specific, reference sections/results).
- "Weaknesses": A list of weaknesses (be specific, suggest fixes).
- "Originality": 1-4 (low to very high).
- "Quality": 1-4.
- "Clarity": 1-4.
- "Significance": 1-4.
- "LiteratureGrounding": 1-4 (1=no real citations/baselines, 2=some but incomplete, 3=good coverage, 4=excellent comprehensive coverage).
- "Questions": Clarifying questions for the authors.
- "Limitations": Limitations and potential negative societal impacts.
- "Ethical Concerns": boolean.
- "Soundness": 1-4 (poor to excellent).
- "Presentation": 1-4.
- "Contribution": 1-4.
- "Overall": 1-10 (1=very strong reject, 5=borderline, 7=accept, 10=award quality).
- "Confidence": 1-5.
- "Decision": "Accept" or "Reject".
- "MissingReferences": List of specific papers/methods that should be cited but are missing.

This JSON will be automatically parsed, so ensure the format is precise.
"""

meta_reviewer_system_prompt = (
    "You are an Area Chair at a machine learning conference. "
    "You are in charge of meta-reviewing a paper reviewed by {reviewer_count} reviewers. "
    "Aggregate reviews into a single meta-review. Find consensus. Be fair but critical."
)


class ReviewModule(BaseModule):
    module_id = 9
    name = "评审打分"

    async def execute(self, context: dict, tracer: Tracer, state: TaskStateMachine) -> dict:
        paper_latex = context.get("paper_latex", "")
        paper_pdf = context.get("paper_pdf", "")
        best_idea = context.get("best_idea", {})
        workspace = context["workspace"]
        num_reviewers = context.get("config", {}).get("num_reviewers", 3)

        client, model = create_client_zhipu()

        # ── Step 1: 加载论文内容 ──
        tracer.step_start()
        await tracer.log(9, "load_paper", "加载论文内容")

        paper_text = ""
        if paper_pdf and os.path.exists(paper_pdf):
            paper_text = self._load_paper_text(paper_pdf)
        if len(paper_text) < 200 and paper_latex and os.path.exists(paper_latex):
            with open(paper_latex) as f:
                paper_text = f.read()
        if len(paper_text) < 100:
            paper_text = f"Title: {best_idea.get('title', '')}\nNo paper content available."

        await tracer.log(9, "load_paper", f"论文内容加载完成 ({len(paper_text)} chars)")

        # ── Step 2: 文献 grounding (V2 新增) ──
        tracer.step_start()
        await tracer.log(9, "literature_grounding", "搜索相关文献用于 grounded 评审")

        related_papers_context = await self._search_related_papers(
            paper_text, best_idea, tracer
        )

        await tracer.log(9, "literature_grounding",
                         f"找到相关文献 ({len(related_papers_context)} chars)")

        # ── Step 3: 多审稿人评审 (grounded) ──
        tracer.step_start()
        await tracer.log(9, "ensemble_review", f"开始 {num_reviewers} 人 grounded 评审")

        all_reviews = []
        prompts = [reviewer_system_prompt_neg, reviewer_system_prompt_pos]

        for i in range(num_reviewers):
            if state.is_aborted:
                break

            reviewer_prompt = prompts[i % 2]
            bias = "严格" if i % 2 == 0 else "宽松"
            await tracer.log(9, f"reviewer_{i+1}",
                             f"审稿人 {i+1}/{num_reviewers} ({bias})")

            review = self._perform_grounded_review(
                paper_text, related_papers_context, client, model, reviewer_prompt
            )
            if review:
                all_reviews.append(review)
                overall = review.get("Overall", "N/A")
                decision = review.get("Decision", "N/A")
                lit_score = review.get("LiteratureGrounding", "N/A")
                missing = review.get("MissingReferences", [])
                await tracer.log(9, f"reviewer_{i+1}",
                                 f"评分: {overall}/10, 文献: {lit_score}/4, "
                                 f"决定: {decision}, 缺失引用: {len(missing)}篇")

        # ── Step 4: Meta-Review ──
        tracer.step_start()
        await tracer.log(9, "meta_review", "Area Chair 汇总 Meta-Review")

        meta_review = self._get_meta_review(client, model, all_reviews)
        if meta_review is None and all_reviews:
            meta_review = all_reviews[0]

        # 平均分
        if meta_review and len(all_reviews) > 1:
            for score_key, limits in [
                ("Originality", (1, 4)), ("Quality", (1, 4)),
                ("Clarity", (1, 4)), ("Significance", (1, 4)),
                ("LiteratureGrounding", (1, 4)),
                ("Soundness", (1, 4)), ("Presentation", (1, 4)),
                ("Contribution", (1, 4)),
                ("Overall", (1, 10)), ("Confidence", (1, 5)),
            ]:
                scores = [r.get(score_key, 0) for r in all_reviews
                          if isinstance(r.get(score_key), (int, float))
                          and limits[0] <= r.get(score_key, 0) <= limits[1]]
                if scores:
                    meta_review[score_key] = int(round(np.mean(scores)))

        final_score = meta_review.get("Overall", 5) if meta_review else 5
        decision = meta_review.get("Decision", "Reject") if meta_review else "Reject"
        lit_grounding = meta_review.get("LiteratureGrounding", 2) if meta_review else 2

        await tracer.log(9, "meta_review",
                         f"最终评分: {final_score}/10, 文献Grounding: {lit_grounding}/4, 决定: {decision}")

        # ── Step 5: 可信度评估 ──
        credibility = self._credibility_check(context)

        # ── 保存产出 ──
        # 汇总所有 missing references
        all_missing_refs = set()
        for r in all_reviews:
            for ref in r.get("MissingReferences", []):
                all_missing_refs.add(ref)

        review_output = {
            "individual_reviews": all_reviews,
            "meta_review": meta_review,
            "credibility": credibility,
            "final_score": final_score,
            "decision": decision,
            "literature_grounding_score": lit_grounding,
            "missing_references": list(all_missing_refs),
        }

        review_path = os.path.join(workspace, "m9_review_report.json")
        with open(review_path, "w", encoding="utf-8") as f:
            json.dump(review_output, f, ensure_ascii=False, indent=2)

        report_md = self._format_review_report(review_output)
        report_path = os.path.join(workspace, "m9_review_report.md")
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(report_md)

        await tracer.save_output(9, "review_report", file_path=report_path,
                                  metadata={"final_score": final_score, "decision": decision})

        context["review_output"] = review_output
        context["final_score"] = final_score
        context["review_decision"] = decision

        return context

    # ── V2 新增: 文献搜索 ──

    async def _search_related_papers(self, paper_text, best_idea, tracer) -> str:
        """搜索相关论文用于 grounding 评审"""
        raw_idea = best_idea.get("_raw", best_idea)
        title = raw_idea.get("Title", best_idea.get("title", ""))

        # 构建搜索查询
        queries = [
            title,  # 论文标题
            raw_idea.get("Experiment", best_idea.get("method", ""))[:100],  # 方法关键词
        ]

        # 从论文中提取额外关键词
        # 找 \section{Related Work} 到下一个 \section 之间的文本
        import re
        rw_match = re.search(r"\\section\{Related Work\}(.*?)\\section\{", paper_text, re.DOTALL)
        if rw_match:
            rw_text = rw_match.group(1)
            # 提取引用键作为搜索词
            cite_keys = re.findall(r"\\cite[tp]?\{([^}]+)\}", rw_text)
            for keys in cite_keys[:3]:
                for key in keys.split(","):
                    q = key.strip().replace("_", " ").replace("-", " ")
                    if len(q) > 5:
                        queries.append(q)

        related_papers = []
        seen_titles = set()

        for query in queries[:5]:
            try:
                papers = await asyncio.to_thread(search_for_papers, query, 5)
                if papers:
                    for p in papers:
                        t = p.get("title", "")
                        if t and t not in seen_titles:
                            seen_titles.add(t)
                            related_papers.append(p)
            except Exception:
                pass
            await asyncio.sleep(1.0)  # 避免限流

        if not related_papers:
            await tracer.log(9, "literature_grounding",
                             "Semantic Scholar 无结果 (可能限流)", level="warn")
            return ""

        # 构建 context
        lines = ["=== Related Papers from Semantic Scholar (for grounded review) ===\n"]
        for i, p in enumerate(related_papers[:15]):
            authors = p.get("authors", [])
            author_str = ", ".join(
                a.get("name", "") if isinstance(a, dict) else str(a)
                for a in (authors[:3] if isinstance(authors, list) else [])
            )
            lines.append(
                f"{i+1}. {p.get('title', 'N/A')}\n"
                f"   Authors: {author_str}\n"
                f"   Venue: {p.get('venue', 'N/A')}, {p.get('year', 'N/A')}\n"
                f"   Citations: {p.get('citationCount', 0)}\n"
                f"   Abstract: {(p.get('abstract') or 'N/A')[:300]}\n"
            )

        return "\n".join(lines)

    # ── 评审核心 ──

    def _perform_grounded_review(self, paper_text, related_papers_ctx, client, model, system_prompt):
        """单个审稿人的 grounded 评审"""
        grounding_instruction = ""
        if related_papers_ctx:
            grounding_instruction = f"""

{related_papers_ctx}

IMPORTANT: Use the related papers above to:
1. Verify if the paper's claims of novelty are justified
2. Check if important baselines or comparisons are missing
3. Assess whether the related work section is comprehensive
4. List any missing references in the "MissingReferences" field
"""

        base_prompt = neurips_form_v2 + grounding_instruction + f"""

Here is the paper you are asked to review:
```
{paper_text[:8000]}
```"""

        try:
            text, _ = get_response_from_llm(
                base_prompt, client, model,
                system_message=system_prompt,
                temperature=0.75,
            )
            return extract_json_between_markers(text)
        except Exception as e:
            print(f"Review failed: {e}")
            return None

    def _get_meta_review(self, client, model, reviews):
        """Area Chair meta-review"""
        if not reviews:
            return None

        review_text = ""
        for i, r in enumerate(reviews):
            review_text += f"\nReview {i+1}/{len(reviews)}:\n```\n{json.dumps(r)}\n```\n"

        base_prompt = neurips_form_v2 + review_text

        try:
            text, _ = get_response_from_llm(
                base_prompt, client, model,
                system_message=meta_reviewer_system_prompt.format(reviewer_count=len(reviews)),
                temperature=0.5,
            )
            return extract_json_between_markers(text)
        except Exception as e:
            print(f"Meta-review failed: {e}")
            return None

    def _load_paper_text(self, pdf_path):
        """从 PDF 提取文本"""
        try:
            import pymupdf4llm
            return pymupdf4llm.to_markdown(pdf_path)
        except Exception:
            pass
        try:
            import pymupdf
            doc = pymupdf.open(pdf_path)
            return "".join(page.get_text() for page in doc)
        except Exception:
            pass
        try:
            from pypdf import PdfReader
            reader = PdfReader(pdf_path)
            return "".join(page.extract_text() for page in reader.pages)
        except Exception:
            pass
        return ""

    def _credibility_check(self, context):
        """可信度与可追溯性评估"""
        checks = {
            "has_literature_review": bool(context.get("literature_review")),
            "has_gap_analysis": bool(context.get("research_gaps")),
            "has_ideas": bool(context.get("scored_ideas")),
            "has_code": bool(context.get("project_dir")),
            "has_experiment_results": bool(context.get("experiment_results")),
            "has_analysis": bool(context.get("analysis_data")),
            "has_paper": bool(context.get("paper_latex")),
            "analysis_passed": context.get("analysis_passed", False),
        }
        score = sum(checks.values()) / len(checks) * 10
        return {
            "checks": checks,
            "credibility_score": round(score, 1),
            "traceability": "full" if all(checks.values()) else "partial",
        }

    def _format_review_report(self, review_output):
        """格式化评审报告 (Markdown)"""
        lines = ["# Review Report (V2 - Literature Grounded)\n"]

        meta = review_output.get("meta_review") or {}
        lines.append(f"## Final Score: {review_output.get('final_score', 'N/A')}/10")
        lines.append(f"## Decision: {review_output.get('decision', 'N/A')}")
        lines.append(f"## Literature Grounding: {review_output.get('literature_grounding_score', 'N/A')}/4\n")

        if meta.get("Summary"):
            lines.append(f"### Summary\n{meta['Summary']}\n")

        # Missing references
        missing = review_output.get("missing_references", [])
        if missing:
            lines.append(f"\n### Missing References ({len(missing)} papers)")
            for ref in missing:
                lines.append(f"- {ref}")

        # Individual reviews
        for i, review in enumerate(review_output.get("individual_reviews", [])):
            lines.append(f"\n## Reviewer {i+1}")
            lines.append(f"- Overall: {review.get('Overall', 'N/A')}/10")
            lines.append(f"- Soundness: {review.get('Soundness', 'N/A')}/4")
            lines.append(f"- Presentation: {review.get('Presentation', 'N/A')}/4")
            lines.append(f"- Contribution: {review.get('Contribution', 'N/A')}/4")
            lines.append(f"- **Literature Grounding: {review.get('LiteratureGrounding', 'N/A')}/4**")
            lines.append(f"- Confidence: {review.get('Confidence', 'N/A')}/5")
            lines.append(f"- Decision: {review.get('Decision', 'N/A')}")

            strengths = review.get("Strengths", [])
            if strengths:
                lines.append(f"\n**Strengths:**")
                for s in (strengths if isinstance(strengths, list) else [strengths]):
                    lines.append(f"- {s}")

            weaknesses = review.get("Weaknesses", [])
            if weaknesses:
                lines.append(f"\n**Weaknesses:**")
                for w in (weaknesses if isinstance(weaknesses, list) else [weaknesses]):
                    lines.append(f"- {w}")

            missing_refs = review.get("MissingReferences", [])
            if missing_refs:
                lines.append(f"\n**Missing References:**")
                for ref in missing_refs:
                    lines.append(f"- {ref}")

        # Credibility
        cred = review_output.get("credibility", {})
        lines.append(f"\n## Credibility Assessment")
        lines.append(f"- Score: {cred.get('credibility_score', 'N/A')}/10")
        lines.append(f"- Traceability: {cred.get('traceability', 'N/A')}")

        return "\n".join(lines)
