from __future__ import annotations
"""M1: Deep Research 文献调研模块

直接调用 GPT-Researcher 进行深度文献调研，不自己写搜索逻辑。
GPT-Researcher 会自动完成：搜索 → 抓取 → 筛选 → 综述生成。

搜索引擎配置优先级：
1. 有 TAVILY_API_KEY → 用 tavily（最佳）
2. 无任何 key → 用 duckduckgo（免费）
3. 有 SERPER_API_KEY → 用 serper

可通过环境变量 RETRIEVER 指定，如 RETRIEVER=duckduckgo
"""

import json
import os

from modules.base import BaseModule
from pipeline.tracer import Tracer
from pipeline.state import TaskStateMachine
import config


class LiteratureModule(BaseModule):
    module_id = 1
    name = "文献调研"

    async def execute(self, context: dict, tracer: Tracer, state: TaskStateMachine) -> dict:
        topic = context["topic"]
        domain = context.get("domain", "")
        workspace = context["workspace"]

        # ── Step 1: 配置 GPT-Researcher 环境变量 ──────
        tracer.step_start()
        await tracer.log(1, "configure", "配置 GPT-Researcher")

        # 设置 LLM（智谱AI 兼容 OpenAI 格式）
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

        retriever = os.environ.get("RETRIEVER", "duckduckgo")
        await tracer.log(1, "configure", f"搜索引擎: {retriever}, 模型: {config.OPENAI_MODEL}")

        # ── Step 2: 调用 GPT-Researcher 深度研究 ──────
        tracer.step_start()
        await tracer.log(1, "deep_research", "启动 GPT-Researcher 深度文献调研（这可能需要几分钟）")

        from gpt_researcher import GPTResearcher

        query = f"Comprehensive literature review on: {topic}"
        if domain:
            query += f" in the field of {domain}"
        query += ". Find and analyze as many relevant academic papers as possible. Focus on recent advances, key methods, datasets, and open problems."

        researcher = GPTResearcher(
            query=query,
            report_type="research_report",
            report_format="markdown",
            report_source="web",
            verbose=True,
        )

        # 执行研究（搜索 + 抓取 + 分析）
        research_context = await researcher.conduct_research()

        await tracer.log(1, "deep_research",
                         f"调研完成，获取了 {len(researcher.visited_urls)} 个来源",
                         output_data={"sources_count": len(researcher.visited_urls)})

        if state.is_aborted:
            return context

        # ── Step 3: 生成研究报告 ──────────────────────
        tracer.step_start()
        await tracer.log(1, "write_report", "生成文献综述报告")

        report = await researcher.write_report()

        await tracer.log(1, "write_report",
                         f"报告生成完成 ({len(report)} 字符)",
                         duration_ms=tracer.step_elapsed_ms())

        # ── Step 4: 提取来源信息 ──────────────────────
        sources = []
        for src in researcher.research_sources:
            sources.append({
                "title": src.get("title", ""),
                "url": src.get("url", ""),
                "content_preview": str(src.get("content", ""))[:300],
            })

        visited_urls = list(researcher.visited_urls) if researcher.visited_urls else []

        # ── 保存产出 ──────────────────────────────────
        review_path = os.path.join(workspace, "m1_literature_review.md")
        sources_path = os.path.join(workspace, "m1_sources.json")

        with open(review_path, "w", encoding="utf-8") as f:
            f.write(report)

        with open(sources_path, "w", encoding="utf-8") as f:
            json.dump({
                "sources": sources,
                "visited_urls": visited_urls,
                "total_sources": len(sources),
                "total_urls": len(visited_urls),
                "research_costs": researcher.get_costs(),
            }, f, ensure_ascii=False, indent=2)

        await tracer.save_output(1, "literature_review",
                                  content=report[:500],
                                  file_path=review_path)
        await tracer.save_output(1, "source_list",
                                  file_path=sources_path,
                                  metadata={"source_count": len(sources)})

        # 传递给下游模块
        context["literature_review"] = report
        context["research_sources"] = sources
        context["visited_urls"] = visited_urls
        context["selected_papers"] = sources  # 兼容下游模块

        return context
