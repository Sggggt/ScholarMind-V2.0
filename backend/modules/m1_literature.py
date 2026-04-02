from __future__ import annotations

"""M1 literature review module.

Prefer GPT-Researcher when available. If that dependency is missing in the
local environment, fall back to Semantic Scholar / Brave search plus an LLM
summary so the pipeline can still produce real downstream artifacts.
"""

import asyncio
import json
import os
import re

import config
from modules.ai_scientist_bridge import search_for_papers
from modules.base import BaseModule
from modules.llm_client import call_llm
from pipeline.state import TaskStateMachine
from pipeline.tracer import Tracer


GOAL_HINT_KEYWORDS = (
    "goal",
    "focus",
    "constraint",
    "deliverable",
    "output",
    "objective",
    "benchmark",
    "evaluation",
    "survey",
    "gap",
    "experiment",
    "研究目标",
    "关注",
    "约束",
    "输出",
    "实验",
    "缺口",
    "评估",
)


def _normalize_query_text(text: str, limit: int = 160) -> str:
    normalized = " ".join((text or "").split()).strip()
    if len(normalized) <= limit:
        return normalized

    clipped = normalized[:limit].rsplit(" ", 1)[0].strip()
    return clipped or normalized[:limit].strip()


def _compact_query_candidates(raw: str, topic: str) -> list[str]:
    normalized_topic = _normalize_query_text(topic, limit=200).lower()
    candidates: list[str] = []

    for part in re.split(r"[\n|;；。]+", raw or ""):
        cleaned = re.sub(r"^[\s\-*•\d\.\)\(]+", "", part).strip()
        cleaned = re.sub(r"^[^:：]{0,12}[：:]\s*", "", cleaned).strip()
        cleaned = _normalize_query_text(cleaned, limit=120)
        if not cleaned:
            continue

        lowered = cleaned.lower()
        if normalized_topic and lowered.startswith(normalized_topic):
            cleaned = _normalize_query_text(cleaned[len(topic.strip()):].strip(" ,:：;-|"), limit=120)
            lowered = cleaned.lower()
            if not cleaned:
                continue

        if lowered == normalized_topic or cleaned in candidates:
            continue

        candidates.append(cleaned)

    return candidates


def _build_query_context(topic: str, domain: str) -> dict[str, str]:
    topic_hint = _normalize_query_text(topic, limit=180)
    domain_hint = ""
    goal_hint = ""

    for candidate in _compact_query_candidates(domain, topic_hint):
        lowered = candidate.lower()
        if any(keyword in lowered for keyword in GOAL_HINT_KEYWORDS):
            if not goal_hint:
                goal_hint = candidate
            continue

        if not domain_hint:
            domain_hint = candidate

    return {
        "topic": topic_hint,
        "domain": domain_hint,
        "goal": goal_hint,
    }


def _compose_research_query(topic: str, domain: str) -> str:
    query_context = _build_query_context(topic, domain)
    query = f"Comprehensive literature review on: {query_context['topic']}"

    if query_context["domain"]:
        query += f" in {query_context['domain']}"

    if query_context["goal"]:
        query += f". Special focus: {query_context['goal']}"

    query += (
        ". Find and analyze relevant academic papers. Focus on recent advances, "
        "key methods, datasets, evaluation setups, and open problems."
    )
    return query


class LiteratureModule(BaseModule):
    module_id = 1
    name = "文献调研"

    async def execute(self, context: dict, tracer: Tracer, state: TaskStateMachine) -> dict:
        topic = context["topic"]
        domain = context.get("domain", "")
        workspace = context["workspace"]

        tracer.step_start()
        await tracer.log(1, "configure", "配置 GPT-Researcher")
        self._configure_environment()

        retriever = os.environ.get("RETRIEVER", "duckduckgo")
        await tracer.log(1, "configure", f"搜索引擎: {retriever}, 模型: {config.OPENAI_MODEL}")

        try:
            report, sources, visited_urls, costs = await self._run_gpt_researcher(
                topic, domain, tracer, state
            )
        except ModuleNotFoundError as exc:
            await tracer.log(
                1,
                "fallback",
                f"GPT-Researcher 不可用，切换本地降级检索: {exc}",
                level="warn",
            )
            report, sources, visited_urls, costs = await self._run_fallback_research(
                topic, domain, tracer, state
            )
        except Exception as exc:
            await tracer.log(
                1,
                "fallback",
                f"GPT-Researcher 运行失败，切换本地降级检索: {exc}",
                level="warn",
            )
            report, sources, visited_urls, costs = await self._run_fallback_research(
                topic, domain, tracer, state
            )

        if state.is_aborted:
            return context

        review_path = os.path.join(workspace, "m1_literature_review.md")
        sources_path = os.path.join(workspace, "m1_sources.json")

        with open(review_path, "w", encoding="utf-8") as file:
            file.write(report)

        with open(sources_path, "w", encoding="utf-8") as file:
            json.dump(
                {
                    "sources": sources,
                    "visited_urls": visited_urls,
                    "total_sources": len(sources),
                    "total_urls": len(visited_urls),
                    "research_costs": costs,
                },
                file,
                ensure_ascii=False,
                indent=2,
            )

        await tracer.save_output(
            1,
            "literature_review",
            content=report[:500],
            file_path=review_path,
        )
        await tracer.save_output(
            1,
            "source_list",
            file_path=sources_path,
            metadata={"source_count": len(sources)},
        )

        context["literature_review"] = report
        context["research_sources"] = sources
        context["visited_urls"] = visited_urls
        context["selected_papers"] = sources

        return context

    def _configure_environment(self) -> None:
        os.environ["OPENAI_API_KEY"] = config.OPENAI_API_KEY
        os.environ["OPENAI_BASE_URL"] = config.OPENAI_BASE_URL
        os.environ["FAST_LLM"] = f"openai:{config.OPENAI_MODEL}"
        os.environ["SMART_LLM"] = f"openai:{config.OPENAI_MODEL}"
        os.environ["STRATEGIC_LLM"] = f"openai:{config.OPENAI_MODEL}"

        preferred_retriever = getattr(config, "SEARCH_PROVIDER", "brave").strip().lower()
        brave_key = os.getenv("BRAVE_API_KEY", getattr(config, "BRAVE_API_KEY", ""))

        if preferred_retriever == "brave" and brave_key:
            os.environ["BRAVE_API_KEY"] = brave_key
            os.environ["RETRIEVER"] = "brave"
        elif preferred_retriever == "tavily" and config.TAVILY_API_KEY:
            os.environ["TAVILY_API_KEY"] = config.TAVILY_API_KEY
            os.environ["RETRIEVER"] = "tavily"
        elif preferred_retriever == "serper" and config.SERPER_API_KEY:
            os.environ["SERPER_API_KEY"] = config.SERPER_API_KEY
            os.environ["RETRIEVER"] = "serper"
        elif preferred_retriever == "duckduckgo":
            os.environ["RETRIEVER"] = "duckduckgo"
        elif brave_key:
            os.environ["BRAVE_API_KEY"] = brave_key
            os.environ["RETRIEVER"] = "brave"
        elif config.TAVILY_API_KEY:
            os.environ["TAVILY_API_KEY"] = config.TAVILY_API_KEY
            os.environ["RETRIEVER"] = "tavily"
        elif config.SERPER_API_KEY:
            os.environ["SERPER_API_KEY"] = config.SERPER_API_KEY
            os.environ["RETRIEVER"] = "serper"
        else:
            os.environ["RETRIEVER"] = "duckduckgo"

    async def _run_gpt_researcher(
        self,
        topic: str,
        domain: str,
        tracer: Tracer,
        state: TaskStateMachine,
    ) -> tuple[str, list[dict], list[str], dict]:
        tracer.step_start()
        await tracer.log(1, "deep_research", "启动 GPT-Researcher 深度文献调研")

        from gpt_researcher import GPTResearcher

        query = _compose_research_query(topic, domain)

        researcher = GPTResearcher(
            query=query,
            report_type="research_report",
            report_format="markdown",
            report_source="web",
            verbose=True,
        )

        await researcher.conduct_research()

        await tracer.log(
            1,
            "deep_research",
            f"调研完成，获取了 {len(researcher.visited_urls)} 个来源",
            output_data={"sources_count": len(researcher.visited_urls)},
        )

        if state.is_aborted:
            return "", [], [], {}

        tracer.step_start()
        await tracer.log(1, "write_report", "生成文献综述报告")
        report = await researcher.write_report()
        await tracer.log(
            1,
            "write_report",
            f"报告生成完成 ({len(report)} 字符)",
            duration_ms=tracer.step_elapsed_ms(),
        )

        sources = [
            {
                "title": source.get("title", ""),
                "url": source.get("url", ""),
                "content_preview": str(source.get("content", ""))[:300],
            }
            for source in researcher.research_sources
        ]
        visited_urls = list(researcher.visited_urls) if researcher.visited_urls else []
        return report, sources, visited_urls, researcher.get_costs()

    async def _run_fallback_research(
        self,
        topic: str,
        domain: str,
        tracer: Tracer,
        state: TaskStateMachine,
    ) -> tuple[str, list[dict], list[str], dict]:
        tracer.step_start()
        await tracer.log(1, "fallback_search", "使用本地检索降级生成文献综述")

        query_context = _build_query_context(topic, domain)
        queries = [
            query_context["topic"],
            f"{query_context['topic']} survey",
            f"{query_context['topic']} recent advances",
            f"{query_context['topic']} open problems",
        ]
        if query_context["domain"]:
            queries.append(f"{query_context['topic']} {query_context['domain']}")
        if query_context["goal"]:
            queries.append(f"{query_context['topic']} {query_context['goal']}")

        deduped: list[dict] = []
        seen_titles: set[str] = set()

        for query in queries:
            papers = await asyncio.to_thread(search_for_papers, query, 6)
            for paper in papers or []:
                title = (paper.get("title") or "").strip()
                key = title.lower()
                if not title or key in seen_titles:
                    continue
                seen_titles.add(key)
                deduped.append(paper)
            if len(deduped) >= 15 or state.is_aborted:
                break
            await asyncio.sleep(0.5)

        await tracer.log(
            1,
            "fallback_search",
            f"降级检索完成，整理了 {len(deduped)} 篇候选论文",
            output_data={"sources_count": len(deduped)},
        )

        sources: list[dict] = []
        visited_urls: list[str] = []
        evidence_blocks: list[str] = []

        for index, paper in enumerate(deduped[:15], start=1):
            authors_raw = paper.get("authors", [])
            authors = ", ".join(
                author.get("name", "") if isinstance(author, dict) else str(author)
                for author in authors_raw[:6]
            )
            venue = paper.get("venue", "")
            year = paper.get("year", "")
            abstract = (paper.get("abstract", "") or "").strip()
            url = paper.get("url", "") or ""
            if url:
                visited_urls.append(url)

            sources.append(
                {
                    "title": paper.get("title", ""),
                    "url": url,
                    "authors": authors,
                    "venue": venue,
                    "year": year,
                    "citation_count": paper.get("citationCount", 0),
                    "content_preview": abstract[:300],
                }
            )

            evidence_blocks.append(
                "\n".join(
                    [
                        f"[{index}] Title: {paper.get('title', '')}",
                        f"Authors: {authors or 'N/A'}",
                        f"Venue/Year: {venue or 'N/A'} / {year or 'N/A'}",
                        f"Citations: {paper.get('citationCount', 0)}",
                        f"Abstract: {abstract or 'N/A'}",
                    ]
                )
            )

        report = ""
        if sources and not state.is_aborted:
            tracer.step_start()
            await tracer.log(1, "write_report", "基于检索到的论文生成综述")
            prompt = f"""Write a concise academic literature review in markdown.

Research topic: {topic}
Research domain: {query_context["domain"] or 'N/A'}
Research focus: {query_context["goal"] or 'N/A'}

Use only the evidence below. If evidence is weak, say so explicitly.

Required sections:
1. Research scope
2. Key methods and representative papers
3. Common datasets / evaluation practice
4. Open problems and limitations
5. Source appendix with numbered references

Evidence:
{chr(10).join(evidence_blocks)}
"""
            try:
                report, _ = await call_llm(
                    prompt,
                    system=(
                        "You are a rigorous research assistant. Summarize the literature "
                        "faithfully and avoid fabricating citations."
                    ),
                    temperature=0.2,
                    max_tokens=3200,
                )
                await tracer.log(
                    1,
                    "write_report",
                    f"降级综述生成完成 ({len(report)} 字符)",
                    duration_ms=tracer.step_elapsed_ms(),
                )
            except Exception as exc:
                await tracer.log(
                    1,
                    "write_report",
                    f"LLM 综述生成失败，使用模板综述: {exc}",
                    level="warn",
                )

        if not report:
            report = self._build_fallback_markdown(
                topic,
                query_context["domain"] or query_context["goal"] or domain,
                sources,
            )

        return report, sources, visited_urls, {"mode": "fallback_local_search"}

    def _build_fallback_markdown(self, topic: str, domain: str, sources: list[dict]) -> str:
        lines = [
            f"# Literature Review: {topic}",
            "",
            f"- Domain: {domain or 'N/A'}",
            f"- Retrieved papers: {len(sources)}",
            "",
            "## Scope",
            f"This fallback review was generated from locally available search results for `{topic}`.",
            "",
            "## Representative Papers",
        ]

        if not sources:
            lines.extend(
                [
                    "No papers were retrieved from the available search providers.",
                    "",
                    "## Limitations",
                    "The runtime environment could not access GPT-Researcher or enough search results.",
                ]
            )
            return "\n".join(lines)

        for source in sources:
            lines.append(
                "- "
                f"{source.get('title', 'Untitled')} "
                f"({source.get('year') or 'N/A'}, {source.get('venue') or 'unknown venue'})"
            )
            preview = source.get("content_preview", "")
            if preview:
                lines.append(f"  Abstract preview: {preview}")

        lines.extend(
            [
                "",
                "## Limitations",
                "This review used the local fallback path because GPT-Researcher was unavailable in the runtime environment.",
            ]
        )
        return "\n".join(lines)
