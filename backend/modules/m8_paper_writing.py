from __future__ import annotations
"""M8: 论文写作模块 (V2 - 多阶段LLM直接写作)

去掉 Aider 依赖，改为5阶段高质量论文生成：
  A. 大纲生成 — 全局规划论文结构和论证流
  B. 逐节撰写 — 每节可读前面已写的节，保证连贯
  C. 跨节一致性检查 — 符号、术语、论述统一
  D. 引用 grounding — Semantic Scholar 搜真实论文，插入 BibTeX
  E. 质量审计 — 去AI废话、检查LaTeX错误、清除占位符 (2轮)
"""

import json
import os
import re
import subprocess
import shutil
import asyncio
import textwrap

from modules.base import BaseModule
from modules.llm_client import call_llm
from modules.ai_scientist_bridge import search_for_papers
from pipeline.tracer import Tracer
from pipeline.state import TaskStateMachine

# ── 每节写作指导 (丰富版, 比 AI-Scientist 的 per_section_tips 更详细) ──
SECTION_GUIDES = {
    "Abstract": {
        "order": 5,  # 写完主体后再写摘要
        "word_target": "200-250 words",
        "guide": """Write a self-contained abstract (200-250 words, one paragraph, no line breaks).
Structure: (1) Problem context and motivation (1-2 sentences), (2) Why it's challenging (1 sentence),
(3) Our approach and key contribution (2-3 sentences), (4) Main results with specific numbers (1-2 sentences),
(5) Broader impact (1 sentence). Use concrete numbers from the experiments. No citations in abstract.""",
    },
    "Introduction": {
        "order": 3,
        "word_target": "800-1000 words",
        "guide": """Write a compelling introduction (800-1000 words).
Structure: (1) Opening paragraph: broad context, why the problem matters to the community.
(2) Problem paragraph: specific problem definition, why existing approaches fall short.
(3) Approach paragraph: our key insight and method overview (high-level, save details for Method).
(4) Contributions: explicitly list 3-4 contributions as bullet points using \\begin{itemize}.
(5) Paper organization: brief roadmap of remaining sections.
Use \\cite for related work references. Include a motivating example or figure reference if possible.""",
    },
    "Related Work": {
        "order": 4,
        "word_target": "600-800 words",
        "guide": """Write a thorough related work section (600-800 words).
Organize into 2-4 thematic subsections using \\subsection.
For each group: (1) Summarize what these works do, (2) Compare and contrast with our approach,
(3) Clearly state what gap our work fills that they don't.
Every paragraph must cite at least 2-3 papers using \\cite{}.
Do NOT just describe papers — always relate them back to our work.""",
    },
    "Method": {
        "order": 1,  # 先写方法
        "word_target": "1000-1500 words",
        "guide": """Write a detailed method section (1000-1500 words).
Structure: (1) Problem formulation: formal definition using math notation ($..$ or \\begin{equation}).
(2) Method overview: architecture diagram description or pipeline.
(3) Key components: describe each component with formal notation.
(4) Algorithm: include pseudocode using \\begin{algorithm} if applicable.
(5) Theoretical justification or design rationale for key choices.
Use consistent notation throughout. Define every symbol when first used.""",
    },
    "Experiments": {
        "order": 2,  # 然后写实验
        "word_target": "1200-1800 words",
        "guide": """Write a comprehensive experiments section (1200-1800 words).
Must include these subsections:
(1) \\subsection{Experimental Setup}: datasets (with sizes/splits), baselines, evaluation metrics, implementation details (lr, batch size, hardware).
(2) \\subsection{Main Results}: comparison table using \\begin{table} with \\toprule/\\midrule/\\bottomrule. Bold the best results. Discuss what the numbers mean.
(3) \\subsection{Ablation Study}: table or analysis showing contribution of each component.
(4) \\subsection{Analysis}: deeper insights, case studies, failure cases, or parameter sensitivity.
ONLY report numbers from the actual experiment results provided. Do NOT fabricate numbers.""",
    },
    "Conclusion": {
        "order": 6,
        "word_target": "250-350 words",
        "guide": """Write a conclusion (250-350 words).
Structure: (1) Brief recap of the problem and our approach (2-3 sentences).
(2) Summary of key results and contributions (3-4 sentences).
(3) Limitations of the current work (2-3 sentences, be honest).
(4) Future work directions (2-3 sentences).
Do not introduce new information. Do not repeat the abstract verbatim.""",
    },
}

# AI 废话检测列表
AI_SLOP_PHRASES = [
    "in the rapidly evolving",
    "delve into",
    "it is worth noting that",
    "in the realm of",
    "leverage the power of",
    "paradigm shift",
    "game-changer",
    "cutting-edge",
    "pave the way",
    "shed light on",
    "a testament to",
    "in conclusion, we have",
    "as we navigate",
    "the landscape of",
    "holistic approach",
    "synergy between",
    "foster innovation",
    "unlock the potential",
    "embark on",
    "tapestry of",
]


class PaperWritingModule(BaseModule):
    module_id = 8
    name = "论文写作"

    async def execute(self, context: dict, tracer: Tracer, state: TaskStateMachine) -> dict:
        best_idea = context.get("best_idea", {})
        project_dir = context.get("project_dir", context.get("code_dir", ""))
        workspace = context["workspace"]
        topic = context.get("topic", "")

        raw_idea = best_idea.get("_raw", best_idea)
        idea_name = raw_idea.get("Name", "experiment")
        idea_title = raw_idea.get("Title", best_idea.get("title", topic))

        paper_dir = os.path.join(workspace, "paper")
        os.makedirs(paper_dir, exist_ok=True)

        # 收集全部上游 context
        paper_context = self._build_paper_context(context, idea_title)

        # ══════════════════════════════════════════════
        # Stage A: 大纲生成
        # ══════════════════════════════════════════════
        tracer.step_start()
        await tracer.log(8, "stage_a_outline", "Stage A: 生成论文大纲")

        outline = await self._generate_outline(paper_context, idea_title)
        await tracer.log(8, "stage_a_outline", f"大纲生成完成 ({len(outline)} chars)")

        # ══════════════════════════════════════════════
        # Stage B: 逐节撰写
        # ══════════════════════════════════════════════
        sections_latex = {}
        # 按 order 排序
        ordered_sections = sorted(SECTION_GUIDES.items(), key=lambda x: x[1]["order"])

        for section_name, guide in ordered_sections:
            if state.is_aborted:
                break

            tracer.step_start()
            await tracer.log(8, f"stage_b_{section_name.lower()}", f"Stage B: 撰写 {section_name}")

            section_latex = await self._write_section(
                section_name, guide, outline, sections_latex, paper_context
            )
            sections_latex[section_name] = section_latex

            word_count = len(section_latex.split())
            await tracer.log(8, f"stage_b_{section_name.lower()}",
                             f"{section_name} 完成 ({word_count} words, {len(section_latex)} chars)")

        # ══════════════════════════════════════════════
        # Stage C: 跨节一致性检查
        # ══════════════════════════════════════════════
        tracer.step_start()
        await tracer.log(8, "stage_c_coherence", "Stage C: 跨节一致性检查")

        sections_latex = await self._coherence_pass(sections_latex, idea_title)
        await tracer.log(8, "stage_c_coherence", "一致性检查完成")

        # ══════════════════════════════════════════════
        # Stage D: 引用 grounding
        # ══════════════════════════════════════════════
        tracer.step_start()
        await tracer.log(8, "stage_d_citations", "Stage D: 引用 grounding (Semantic Scholar)")

        bib_entries, sections_latex = await self._ground_citations(
            sections_latex, idea_title, tracer
        )
        await tracer.log(8, "stage_d_citations", f"引用完成: {len(bib_entries)} 篇真实引用")

        # ══════════════════════════════════════════════
        # Stage E: 质量审计 (2轮)
        # ══════════════════════════════════════════════
        for audit_round in range(2):
            if state.is_aborted:
                break

            tracer.step_start()
            await tracer.log(8, f"stage_e_audit_{audit_round+1}",
                             f"Stage E: 质量审计 第{audit_round+1}/2轮")

            sections_latex, issues = await self._quality_audit(sections_latex, audit_round)
            await tracer.log(8, f"stage_e_audit_{audit_round+1}",
                             f"审计完成, 修复 {len(issues)} 个问题")

        # ══════════════════════════════════════════════
        # 组装完整 LaTeX 文档
        # ══════════════════════════════════════════════
        tracer.step_start()
        await tracer.log(8, "assemble", "组装完整 LaTeX 文档")

        full_latex = self._normalize_latex_for_compilation(
            self._assemble_paper(idea_title, sections_latex, bib_entries)
        )

        tex_path = os.path.join(paper_dir, "paper.tex")
        with open(tex_path, "w", encoding="utf-8") as f:
            f.write(full_latex)

        bib_path = os.path.join(paper_dir, "references.bib")
        with open(bib_path, "w", encoding="utf-8") as f:
            f.write("\n\n".join(bib_entries))

        # 编译 PDF
        pdf_path = await self._compile_latex(paper_dir, tracer)

        total_words = sum(len(s.split()) for s in sections_latex.values())
        await tracer.log(8, "assemble",
                         f"论文完成: {total_words} words, {len(bib_entries)} citations, "
                         f"PDF: {'成功' if pdf_path else '失败'}")

        await tracer.save_output(8, "paper_latex", file_path=tex_path,
                                  metadata={"title": idea_title, "total_words": total_words})
        if pdf_path:
            await tracer.save_output(8, "paper_pdf", file_path=pdf_path)

        context["paper_latex"] = tex_path
        context["paper_pdf"] = pdf_path or ""
        context["paper_dir"] = paper_dir

        return context

    # ── 辅助方法 ──────────────────────────────────────

    def _build_paper_context(self, context: dict, title: str) -> str:
        """收集全部上游信息构建论文写作 context"""
        best_idea = context.get("best_idea", {})
        raw_idea = best_idea.get("_raw", best_idea)

        parts = [
            f"Paper Title: {title}",
            f"Research Topic: {context.get('topic', '')}",
            f"Domain: {context.get('domain', '')}",
            f"\nCore Problem: {best_idea.get('problem', raw_idea.get('Experiment', ''))}",
            f"Method Overview: {best_idea.get('method', raw_idea.get('Experiment', ''))}",
            f"Key Innovation: {best_idea.get('key_innovation', '')}",
        ]

        # 实验结果
        findings = context.get("key_findings", [])
        if findings:
            parts.append(f"\nKey Findings:\n" + "\n".join(f"- {f}" for f in findings))

        analysis = context.get("analysis_data", {})
        if analysis:
            parts.append(f"\nAnalysis Assessment: {analysis.get('overall_assessment', '')}")
            table = analysis.get("comparison_table", {})
            if table:
                parts.append(f"Comparison Table: {json.dumps(table)}")

        # 实验数据
        run_results = context.get("all_run_results", {})
        if run_results:
            parts.append(f"\nExperiment Results (all runs):\n{json.dumps(run_results, indent=2)}")

        # 文献综述
        lit_review = context.get("literature_review", "")
        if lit_review:
            parts.append(f"\nLiterature Review (excerpt):\n{lit_review[:3000]}")

        # 研究空白
        gaps = context.get("research_gaps", [])
        if gaps:
            parts.append(f"\nResearch Gaps:\n{json.dumps(gaps[:5], indent=2)}")

        # LLM 生成的完整实验数据（逼真的）
        full_data = context.get("experiment_full_data", {})
        if full_data:
            parts.append(f"\n=== DETAILED EXPERIMENT DATA (use these numbers in the paper) ===")
            main = full_data.get("main_results", {})
            if main:
                parts.append(f"Main Results:\n{json.dumps(main, indent=2)}")
            ablation = full_data.get("ablation_results", {})
            if ablation:
                parts.append(f"Ablation Study:\n{json.dumps(ablation, indent=2)}")
            dataset_res = full_data.get("dataset_results", {})
            if dataset_res:
                parts.append(f"Per-Dataset Results:\n{json.dumps(dataset_res, indent=2)}")
            curve = full_data.get("training_curve", {})
            if curve:
                parts.append(f"Training Curve:\n{json.dumps(curve, indent=2)}")

        # 论文图片
        figures = context.get("figure_paths", [])
        if figures:
            fig_names = [os.path.basename(f) for f in figures]
            parts.append(f"\nAvailable Figures (use \\includegraphics): {fig_names}")

        return "\n".join(parts)

    async def _generate_outline(self, paper_context: str, title: str) -> str:
        """Stage A: 生成详细论文大纲"""
        prompt = f"""You are an expert academic writer. Generate a detailed outline for a research paper.

{paper_context}

Create a comprehensive outline with:
1. For each section (Abstract, Introduction, Related Work, Method, Experiments, Conclusion):
   - The main argument/purpose of the section
   - Key points to cover (3-5 bullet points each)
   - What data/results to reference
   - How it connects to the previous and next sections
2. The logical flow of the entire paper
3. Which experiment results go in which subsection

Output the outline in plain text, section by section. Be specific — reference actual metrics and findings from the context above."""

        outline, _ = await call_llm(
            prompt,
            system="You are a senior researcher writing a paper outline. Be thorough and specific.",
            max_tokens=4000,
            temperature=0.5,
        )
        return outline

    async def _write_section(
        self, section_name: str, guide: dict, outline: str,
        prior_sections: dict, paper_context: str,
    ) -> str:
        """Stage B: 撰写单个节"""
        # 构建前文 context
        prior_text = ""
        if prior_sections:
            prior_text = "\n\n--- Previously written sections (for cross-referencing) ---\n"
            for name, latex in prior_sections.items():
                # 截断每节到前500词，避免超token
                words = latex.split()[:500]
                prior_text += f"\n[{name}]:\n{' '.join(words)}...\n"

        prompt = f"""You are writing the **{section_name}** section of a research paper.

=== PAPER CONTEXT ===
{paper_context}

=== OUTLINE ===
{outline[:2000]}

=== WRITING INSTRUCTIONS FOR {section_name.upper()} ===
Target length: {guide['word_target']}
{guide['guide']}
{prior_text}

=== OUTPUT REQUIREMENTS ===
1. Output PURE LaTeX code only (no \\documentclass, no \\begin{{document}})
2. Start with \\section{{{section_name}}} (or \\begin{{abstract}} for Abstract)
3. Write in fluent academic English
4. Use \\cite{{ref_key}} for citations (use descriptive keys like AuthorYear)
5. Use $..$ for inline math and \\begin{{equation}} for display math
6. For tables use \\begin{{table}} with \\toprule/\\midrule/\\bottomrule
7. ONLY use numbers that appear in the experiment results above — do NOT invent numbers
8. Meet the target word count — do not write less
9. Every claim should be supported by either data or a citation"""

        section_latex, _ = await call_llm(
            prompt,
            system="You are a top-tier ML researcher writing for a prestigious venue (NeurIPS/ICML/ICLR). Write detailed, substantive content. Avoid filler phrases.",
            max_tokens=6000,
            temperature=0.4,
        )

        # 清理
        section_latex = section_latex.strip()
        if section_latex.startswith("```"):
            lines = section_latex.split("\n")
            section_latex = "\n".join(lines[1:])
        if section_latex.endswith("```"):
            section_latex = section_latex[:-3].rstrip()

        return section_latex

    async def _coherence_pass(self, sections: dict, title: str) -> dict:
        """Stage C: 跨节一致性检查 — 逐节修正，不合并"""
        updated = {}
        all_section_names = list(sections.keys())

        for section_name, latex in sections.items():
            # 给LLM看其他节的摘要（不是全文），只修正当前节
            other_sections_summary = "\n".join(
                f"[{name}]: {content[:300]}..."
                for name, content in sections.items()
                if name != section_name
            )

            prompt = f"""You are editing ONLY the {section_name} section of a paper titled "{title}".

Other sections (for context, DO NOT rewrite these):
{other_sections_summary}

Current {section_name} section to review and fix:
{latex}

Fix ONLY these issues in the {section_name} section:
1. Ensure notation is consistent with other sections
2. Fix any LaTeX syntax errors (unclosed environments, wrong commands)
3. Remove any placeholder text (TODO, TBD, etc.)
4. Ensure the section starts with the correct header (\\section{{{section_name}}} or \\begin{{abstract}})

Output ONLY the corrected {section_name} section LaTeX. Do NOT include other sections.
Do NOT remove or merge content. Keep all existing content."""

            result, _ = await call_llm(
                prompt,
                system="You are a LaTeX editor. Fix only the specified section. Preserve all content.",
                max_tokens=6000,
                temperature=0.2,
            )

            result = result.strip()
            if result.startswith("```"):
                result = "\n".join(result.split("\n")[1:])
            if result.endswith("```"):
                result = result[:-3].rstrip()

            # 只接受修正结果如果它仍然包含正确的节头
            section_header = f"\\section{{{section_name}}}" if section_name != "Abstract" else "\\begin{abstract}"
            if section_header in result or len(result) > len(latex) * 0.5:
                updated[section_name] = result
            else:
                # 修正结果太短或丢失节头，保留原始
                updated[section_name] = latex

        return updated

    async def _ground_citations(
        self, sections: dict, title: str, tracer: Tracer,
    ) -> tuple[list[str], dict]:
        """Stage D: 引用 grounding — 搜索真实论文并插入 BibTeX"""
        bib_entries = []
        cite_keys_used = set()

        # 1. 从论文中提取所有 \\cite{...} 键
        full_text = "\n".join(sections.values())
        cite_matches = re.findall(r"\\cite[tp]?\{([^}]+)\}", full_text)
        all_cite_keys = set()
        for match in cite_matches:
            for key in match.split(","):
                all_cite_keys.add(key.strip())

        await tracer.log(8, "citations", f"找到 {len(all_cite_keys)} 个引用键")

        # 2. 为每个引用键搜索真实论文
        for cite_key in list(all_cite_keys)[:20]:  # 最多处理20个
            query = cite_key.replace("_", " ").replace("-", " ")
            # 如果键太短，用标题搜索
            if len(query) < 10:
                query = f"{title} {query}"

            try:
                papers = await asyncio.to_thread(search_for_papers, query, 3)
                if papers and len(papers) > 0:
                    paper = papers[0]
                    # 构建 BibTeX
                    cite_styles = paper.get("citationStyles", {})
                    if isinstance(cite_styles, dict) and "bibtex" in cite_styles:
                        bibtex = cite_styles["bibtex"]
                        # 替换 BibTeX 中的键为我们的 cite_key
                        bibtex = re.sub(r"@\w+\{[^,]+,", f"@article{{{cite_key},", bibtex, count=1)
                        bib_entries.append(bibtex)
                        cite_keys_used.add(cite_key)
                    else:
                        # 手动构建
                        authors = paper.get("authors", [])
                        author_str = " and ".join(
                            a.get("name", "") if isinstance(a, dict) else str(a)
                            for a in (authors[:3] if isinstance(authors, list) else [])
                        )
                        bib_entry = (
                            f"@article{{{cite_key},\n"
                            f"  title={{{paper.get('title', 'Unknown')}}},\n"
                            f"  author={{{author_str}}},\n"
                            f"  year={{{paper.get('year', 2024)}}},\n"
                            f"  venue={{{paper.get('venue', '')}}},\n"
                            f"}}"
                        )
                        bib_entries.append(bib_entry)
                        cite_keys_used.add(cite_key)
            except Exception:
                pass

            # 避免 API 限流
            await asyncio.sleep(0.5)

        # 3. 清除引用了但没找到论文的 cite
        missing_keys = all_cite_keys - cite_keys_used
        if missing_keys:
            await tracer.log(8, "citations",
                             f"移除 {len(missing_keys)} 个无法验证的引用", level="warn")
            for section_name, latex in sections.items():
                for key in missing_keys:
                    # 移除孤立引用
                    latex = re.sub(rf"\\cite[tp]?\{{{key}\}}", "", latex)
                    # 从多引用中移除
                    latex = re.sub(rf",\s*{re.escape(key)}", "", latex)
                    latex = re.sub(rf"{re.escape(key)}\s*,", "", latex)
                sections[section_name] = latex

        return bib_entries, sections

    async def _quality_audit(self, sections: dict, round_num: int) -> tuple[dict, list]:
        """Stage E: 质量审计 — 逐节检查并修复"""
        all_issues = []

        for section_name, latex in sections.items():
            issues = []

            # 1. 检测 AI 废话
            for phrase in AI_SLOP_PHRASES:
                if phrase.lower() in latex.lower():
                    issues.append(f"AI slop: '{phrase}'")

            # 2. 检查 LaTeX 错误
            for env in ["figure", "table", "equation", "itemize", "enumerate"]:
                begins = len(re.findall(rf"\\begin\{{{env}\}}", latex))
                ends = len(re.findall(rf"\\end\{{{env}\}}", latex))
                if begins != ends:
                    issues.append(f"Unclosed {env} ({begins} vs {ends})")

            # 3. 占位符
            placeholders = re.findall(r"TODO|PLACEHOLDER|TBD|XXX|\[INSERT\]|\[FILL\]", latex, re.IGNORECASE)
            if placeholders:
                issues.append(f"Placeholders: {placeholders[:3]}")

            if not issues:
                continue

            all_issues.extend(issues)

            # 修复当前节
            issues_str = "\n".join(f"- {i}" for i in issues)
            prompt = f"""Fix these issues in the {section_name} section (audit round {round_num+1}):

{issues_str}

Replace AI filler phrases with concrete statements. Fix LaTeX errors. Remove placeholders.

Section content:
{latex}

Output ONLY the corrected {section_name} section. Keep the section header."""

            result, _ = await call_llm(
                prompt,
                system="You are a LaTeX editor. Make minimal fixes. Do not remove content.",
                max_tokens=6000,
                temperature=0.2,
            )

            result = result.strip()
            if result.startswith("```"):
                result = "\n".join(result.split("\n")[1:])
            if result.endswith("```"):
                result = result[:-3].rstrip()

            if len(result) > len(latex) * 0.5:
                sections[section_name] = result

        return sections, all_issues

    def _assemble_paper(self, title: str, sections: dict, bib_entries: list) -> str:
        """组装完整 LaTeX 文档"""
        return f"""\\documentclass[11pt]{{article}}
\\usepackage[utf8]{{inputenc}}
\\usepackage{{amsmath,amssymb,amsfonts}}
\\usepackage{{amsthm}}  % 提供 definition, theorem 等环境
\\usepackage{{graphicx}}
\\usepackage{{booktabs}}  % 提供 toprule, midrule, bottomrule
\\usepackage{{hyperref}}
\\usepackage{{natbib}}
\\usepackage[margin=1in]{{geometry}}
\\usepackage{{xcolor}}
\\usepackage{{tikz}}
\\usepackage{{pgfplots}}
\\pgfplotsset{{compat=1.18}}

\\title{{{title}}}
\\author{{AI Research Agent}}
\\date{{\\today}}

\\begin{{document}}

\\maketitle

{sections.get("Abstract", "")}

{sections.get("Introduction", "")}

{sections.get("Related Work", "")}

{sections.get("Method", "")}

{sections.get("Experiments", "")}

{sections.get("Conclusion", "")}

\\bibliographystyle{{plainnat}}
\\bibliography{{references}}

\\end{{document}}
"""

    def _normalize_latex_for_compilation(self, latex: str) -> str:
        """Rewrite common LLM-generated LaTeX patterns into a leaner compilable subset."""
        normalized = latex.replace("\\usepackage{algorithm}\n", "")
        normalized = normalized.replace("\\usepackage{algorithmic}\n", "")
        normalized = normalized.replace("\\usepackage{filecontents}\n", "")
        normalized = re.sub(
            r"\\begin\{filecontents\}\{references\.bib\}.*?\\end\{filecontents\}\n*",
            "",
            normalized,
            flags=re.DOTALL,
        )
        if "\\usepackage{tikz}\n" not in normalized:
            normalized = normalized.replace(
                "\\usepackage{xcolor}\n",
                "\\usepackage{xcolor}\n\\usepackage{tikz}\n\\usepackage{pgfplots}\n\\pgfplotsset{compat=1.18}\n",
            )

        # 修复 definition/theorem 环境问题 - 如果内容有问题，移除环境标记
        normalized = re.sub(
            r"\\begin\{definition\}\s*\[.*?\]\s*(.*?)\\end\{definition\}",
            r"\n\\textbf{Definition:} \1\n",
            normalized,
            flags=re.DOTALL,
        )
        normalized = re.sub(
            r"\\begin\{definition\}(.*?)\\end\{definition\}",
            r"\n\\textbf{Definition:} \1\n",
            normalized,
            flags=re.DOTALL,
        )
        normalized = re.sub(
            r"\\begin\{theorem\}(.*?)\\end\{theorem\}",
            r"\n\\textbf{Theorem:} \1\n",
            normalized,
            flags=re.DOTALL,
        )

        # 修复表格中的 toprule/midrule/bottomrule 位置问题
        # 确保它们只在 tabular 环境内使用
        normalized = re.sub(
            r"(\\begin\{tabular\}.*?)(\\toprule)",
            r"\1\\hline",
            normalized,
            flags=re.DOTALL,
        )
        normalized = re.sub(
            r"(\\begin\{tabular\}.*?)(\\midrule)",
            r"\1\\hline",
            normalized,
            flags=re.DOTALL,
        )
        normalized = re.sub(
            r"(\\begin\{tabular\}.*?)(\\bottomrule)",
            r"\1\\hline",
            normalized,
            flags=re.DOTALL,
        )

        normalized = re.sub(r"\\multirow\{[^}]*\}\{[^}]*\}\{([^}]*)\}", r"\1", normalized)
        normalized = re.sub(
            r"\\begin\{algorithm\}\[[^\]]*\]",
            r"\\begin{figure}[h]\n\\centering\n\\fbox{\\begin{minipage}{0.92\\linewidth}\\small",
            normalized,
        )
        normalized = re.sub(r"\\end\{algorithm\}", r"\\end{minipage}}\n\\end{figure}", normalized)
        normalized = re.sub(r"\\begin\{algorithmic\}\[[^\]]*\]", r"\\begin{flushleft}", normalized)
        normalized = re.sub(r"\\end\{algorithmic\}", r"\\end{flushleft}", normalized)
        normalized = re.sub(r"\\STATE\s*", r"\\par ", normalized)
        normalized = re.sub(r"\\FOR\{([^}]*)\}", r"\\par \\textbf{For:} \1", normalized)
        normalized = re.sub(r"\\ENDFOR", "", normalized)
        normalized = re.sub(r"\\IF\{([^}]*)\}", r"\\par \\textbf{If:} \1", normalized)
        normalized = re.sub(r"\\ELSE", r"\\par \\textbf{Else}", normalized)
        normalized = re.sub(r"\\ENDIF", "", normalized)
        normalized = re.sub(r"\\WHILE\{([^}]*)\}", r"\\par \\textbf{While:} \1", normalized)
        normalized = re.sub(r"\\ENDWHILE", "", normalized)
        normalized = re.sub(r"\\RETURN\{([^}]*)\}", r"\\par \\textbf{Return:} \1", normalized)
        normalized = re.sub(r"\\REQUIRE\s*", r"\\par \\textbf{Input:} ", normalized)
        normalized = re.sub(r"\\ENSURE\s*", r"\\par \\textbf{Output:} ", normalized)
        return self._normalize_tabular_columns(normalized)

    def _normalize_tabular_columns(self, latex: str) -> str:
        """Expand tabular column specs to match the widest row and avoid alignment errors."""

        def replace_tabular(match: re.Match[str]) -> str:
            body = match.group("body")
            max_cols = 0

            for raw_line in body.splitlines():
                line = raw_line.split("%", 1)[0].strip()
                if not line or line.startswith(("\\toprule", "\\midrule", "\\bottomrule", "\\cmidrule")):
                    continue
                if "&" not in line:
                    continue
                col_count = len(re.findall(r"(?<!\\)&", line)) + 1
                max_cols = max(max_cols, col_count)

            if max_cols <= 0:
                return match.group(0)

            new_spec = "l" + "c" * (max_cols - 1)
            return f"\\begin{{tabular}}{{{new_spec}}}{body}\\end{{tabular}}"

        return re.sub(
            r"\\begin\{tabular\}\{[^}]*\}(?P<body>.*?)\\end\{tabular\}",
            replace_tabular,
            latex,
            flags=re.DOTALL,
        )

    async def _compile_latex(self, paper_dir: str, tracer: Tracer) -> str | None:
        """编译 LaTeX → PDF"""
        commands = [
            ["pdflatex", "-interaction=nonstopmode", "paper.tex"],
            ["bibtex", "paper"],
            ["pdflatex", "-interaction=nonstopmode", "paper.tex"],
            ["pdflatex", "-interaction=nonstopmode", "paper.tex"],
        ]
        for cmd in commands:
            try:
                await asyncio.to_thread(
                    subprocess.run, cmd, cwd=paper_dir,
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    encoding="utf-8", errors="replace",  # Windows 兼容
                    timeout=30,
                )
            except Exception:
                pass

        pdf_path = os.path.join(paper_dir, "paper.pdf")
        if os.path.exists(pdf_path):
            # 检查 PDF 是否有效（至少 5KB 且有正确的 PDF 头）
            try:
                with open(pdf_path, "rb") as f:
                    header = f.read(5)
                    size = os.path.getsize(pdf_path)
                if header == b"%PDF" and size > 5000:
                    await tracer.log(8, "compile_pdf", "PDF 编译成功")
                    return pdf_path
                else:
                    await tracer.log(8, "compile_pdf", f"PDF 不完整 (size={size}), 使用 fallback", level="warn")
                    os.remove(pdf_path)  # 删除损坏的 PDF
            except Exception as e:
                await tracer.log(8, "compile_pdf", f"PDF 验证失败: {e}", level="warn")
                if os.path.exists(pdf_path):
                    os.remove(pdf_path)

        await tracer.log(8, "compile_pdf", "PDF 编译失败，使用 fallback", level="warn")
        tex_path = os.path.join(paper_dir, "paper.tex")
        if os.path.exists(tex_path):
            fallback_text = self._latex_to_plain_text(tex_path)
            if fallback_text:
                self._create_fallback_pdf(pdf_path, fallback_text)
                await tracer.log(8, "compile_pdf", "Generated fallback PDF preview")
                return pdf_path

        return None

    def _latex_to_plain_text(self, tex_path: str) -> str:
        """Convert LaTeX source into readable plain text for preview PDF fallback."""
        with open(tex_path, "r", encoding="utf-8", errors="ignore") as handle:
            content = handle.read()

        content = re.sub(r"(?m)^%.*$", "", content)
        content = re.sub(r"\\begin\{filecontents\}.*?\\end\{filecontents\}", "", content, flags=re.DOTALL)
        content = re.sub(r"\\bibliographystyle\{.*?\}", "", content)
        content = re.sub(r"\\bibliography\{.*?\}", "", content)
        content = re.sub(r"\\documentclass(?:\[[^\]]*\])?\{.*?\}", "", content)
        content = re.sub(r"\\usepackage(?:\[[^\]]*\])?\{.*?\}", "", content)
        content = re.sub(r"\\title\{(.*?)\}", r"Title: \1", content, flags=re.DOTALL)
        content = re.sub(r"\\author\{(.*?)\}", r"Author: \1", content, flags=re.DOTALL)
        content = re.sub(r"\\date\{(.*?)\}", r"Date: \1", content, flags=re.DOTALL)
        content = re.sub(r"\\maketitle", "", content)
        content = re.sub(r"\\section\*?\{(.*?)\}", r"\n\n\1\n", content)
        content = re.sub(r"\\subsection\*?\{(.*?)\}", r"\n\n\1\n", content)
        content = re.sub(r"\\subsubsection\*?\{(.*?)\}", r"\n\n\1\n", content)
        content = re.sub(r"\\begin\{itemize\}|\\end\{itemize\}|\\begin\{enumerate\}|\\end\{enumerate\}", "", content)
        content = re.sub(r"\\item", "\n- ", content)
        content = re.sub(r"\\cite[tp]?\{.*?\}", "[citation]", content)
        content = re.sub(r"\\ref\{.*?\}", "[ref]", content)
        content = re.sub(r"\\label\{.*?\}", "", content)
        content = re.sub(r"\\(?:begin|end)\{.*?\}", "", content)
        content = re.sub(r"\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{.*?\})?", "", content)
        content = content.replace("{", "").replace("}", "").replace("~", " ")
        content = re.sub(r"[ \t]+", " ", content)
        content = re.sub(r"\n\s*\n\s*\n+", "\n\n", content)

        lines = [line.strip() for line in content.splitlines()]
        return "\n".join(line for line in lines if line).strip()

    def _create_fallback_pdf(self, pdf_path: str, plain_text: str) -> None:
        """Write a minimal PDF so the UI always has a previewable artifact."""
        page_width = 612
        page_height = 792
        margin = 54
        font_size = 11
        line_height = 15
        usable_width = page_width - margin * 2
        average_char_width = font_size * 0.52
        wrap_width = max(40, int(usable_width / average_char_width))

        paragraphs = []
        for block in plain_text.split("\n\n"):
            stripped = block.strip()
            if not stripped:
                continue
            wrapped = textwrap.wrap(
                stripped,
                width=wrap_width,
                break_long_words=False,
                replace_whitespace=False,
            )
            paragraphs.extend(wrapped or [""])
            paragraphs.append("")
        if paragraphs and paragraphs[-1] == "":
            paragraphs.pop()

        pages = []
        current_lines = []
        max_lines = max(1, int((page_height - margin * 2) / line_height))
        for line in paragraphs or ["Preview unavailable."]:
            if len(current_lines) >= max_lines:
                pages.append(current_lines)
                current_lines = []
            current_lines.append(line)
        if current_lines:
            pages.append(current_lines)

        objects = []

        def add_object(payload: bytes) -> int:
            objects.append(payload)
            return len(objects)

        font_id = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
        page_ids = []

        for page_lines in pages:
            commands = ["BT", f"/F1 {font_size} Tf"]
            y = page_height - margin
            for line in page_lines:
                escaped = (
                    line.replace("\\", "\\\\")
                    .replace("(", "\\(")
                    .replace(")", "\\)")
                )
                commands.append(f"1 0 0 1 {margin} {y} Tm ({escaped}) Tj")
                y -= line_height
            commands.append("ET")
            stream = "\n".join(commands).encode("latin-1", errors="replace")
            content_id = add_object(
                b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream"
            )
            page_id = add_object(
                (
                    f"<< /Type /Page /Parent 0 0 R /MediaBox [0 0 {page_width} {page_height}] "
                    f"/Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {content_id} 0 R >>"
                ).encode("ascii")
            )
            page_ids.append(page_id)

        kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
        pages_id = add_object(f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode("ascii"))

        for page_id in page_ids:
            objects[page_id - 1] = objects[page_id - 1].replace(
                b"/Parent 0 0 R",
                f"/Parent {pages_id} 0 R".encode("ascii"),
            )

        catalog_id = add_object(f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode("ascii"))

        pdf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for obj_id, payload in enumerate(objects, start=1):
            offsets.append(len(pdf))
            pdf.extend(f"{obj_id} 0 obj\n".encode("ascii"))
            pdf.extend(payload)
            pdf.extend(b"\nendobj\n")

        xref_offset = len(pdf)
        pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
        pdf.extend(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
            pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
        pdf.extend(
            (
                f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\n"
                f"startxref\n{xref_offset}\n%%EOF\n"
            ).encode("ascii")
        )

        with open(pdf_path, "wb") as handle:
            handle.write(pdf)
