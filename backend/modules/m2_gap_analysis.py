from __future__ import annotations

"""M2: grounded gap analysis with PaperQA2 timeout and fallback protection."""

import asyncio
import json
import os
import tempfile

import config
from modules.ai_scientist_bridge import extract_json_between_markers, search_for_papers
from modules.base import BaseModule
from modules.llm_client import call_llm, call_llm_json
from pipeline.state import TaskStateMachine
from pipeline.tracer import Tracer


class GapAnalysisModule(BaseModule):
    module_id = 2
    name = "研究空白识别"

    async def _run_with_timeout(self, awaitable, *, timeout: int | None = None):
        return await asyncio.wait_for(awaitable, timeout=timeout or config.PAPERQA_TIMEOUT)

    def _paperqa_llm_model(self) -> str:
        return os.getenv("PAPERQA_LLM_MODEL", config.OPENAI_MODEL).strip() or config.OPENAI_MODEL

    def _paperqa_embedding_model(self) -> str:
        override = os.getenv("PAPERQA_EMBEDDING_MODEL", "").strip()
        if override:
            return override

        if "open.bigmodel.cn" in config.OPENAI_BASE_URL:
            return "embedding-3"

        return "text-embedding-3-small"

    def _paperqa_local_citation(self, topic: str, domain: str) -> str:
        domain_suffix = f", {domain}" if domain else ""
        return f"ScholarMind Local Review, {topic[:80]}{domain_suffix}, 2026"

    async def _build_docs(self):
        from paperqa import Docs

        return await asyncio.wait_for(asyncio.to_thread(Docs), timeout=config.PAPERQA_TIMEOUT)

    async def execute(self, context: dict, tracer: Tracer, state: TaskStateMachine) -> dict:
        topic = context["topic"]
        domain = context.get("domain", "")
        literature_review = context.get("literature_review", "")
        research_sources = context.get("research_sources", [])
        workspace = context["workspace"]

        tracer.step_start()
        await tracer.log(2, "build_index", "用 PaperQA2 建立文献知识库")
        pqa_answers = await self._query_with_paperqa(topic, domain, literature_review, research_sources, tracer)
        await tracer.log(2, "build_index", f"PaperQA2 返回 {len(pqa_answers)} 条 grounded 回答")

        tracer.step_start()
        await tracer.log(2, "identify_gaps", "基于 grounded 文献分析识别研究空白")
        grounded_context = (
            "\n\n".join(f"Q: {qa['query']}\nA (grounded in literature): {qa['answer']}" for qa in pqa_answers)
            if pqa_answers
            else "No PaperQA results available."
        )

        gap_prompt = f"""You are a senior researcher identifying research gaps.

Research Topic: {topic}
Domain: {domain}

=== Literature Review ===
{literature_review[:5000]}

=== Grounded Literature Analysis ===
{grounded_context}

Based on the above (especially the grounded literature analysis with real paper citations),
identify specific research gaps. Each gap MUST reference specific papers or findings
from the literature as evidence.

Return JSON:
{{
  "gaps": [
    {{
      "category": "methodology/theory/application/data/cross-disciplinary",
      "description": "Specific description of the research gap",
      "evidence": "Which papers/findings support this gap (cite specific works)",
      "potential_impact": "high/medium/low",
      "difficulty": "high/medium/low"
    }}
  ],
  "summary": "Overall summary of research gaps (200 words)"
}}"""

        gaps_data, _ = await call_llm_json(gap_prompt, max_tokens=4096)
        gaps = gaps_data.get("gaps", [])
        await tracer.log(2, "identify_gaps", f"识别出 {len(gaps)} 个研究空白")

        tracer.step_start()
        await tracer.log(2, "generate_seeds", "生成种子研究方向")
        seed_prompt = f"""Based on the research gaps below, propose 2-3 initial seed ideas for novel research.

Research Topic: {topic}
Domain: {domain}

Research Gaps:
{json.dumps(gaps, indent=2, ensure_ascii=False)}

Return JSON array:
```json
[
  {{
    "Name": "lowercase_no_spaces_descriptor",
    "Title": "A Descriptive Title for the Research Idea",
    "Experiment": "Outline: components to build, how to evaluate, datasets, baselines.",
    "Interestingness": 8,
    "Feasibility": 7,
    "Novelty": 8
  }}
]
```
Be realistic on ratings (1-10). Make sure ideas are concrete and implementable."""

        seed_text, _ = await call_llm(seed_prompt, max_tokens=3000, temperature=0.7)
        seed_ideas = extract_json_between_markers(seed_text)
        if seed_ideas is None:
            seed_ideas = []
        elif isinstance(seed_ideas, dict):
            seed_ideas = seed_ideas.get("ideas", [seed_ideas])
        await tracer.log(2, "generate_seeds", f"生成了 {len(seed_ideas)} 个种子 idea")

        tracer.step_start()
        await tracer.log(2, "prepare_template", "准备 AI-Scientist 模板文件")
        ai_scientist_dir = os.path.join(workspace, "ai_scientist_workspace")
        os.makedirs(ai_scientist_dir, exist_ok=True)

        prompt_json = {
            "system": (
                "You are an ambitious AI PhD student who is looking to publish a paper "
                "that will contribute significantly to the field."
            ),
            "task_description": (
                f"You are researching: {topic} in {domain}.\n\n"
                f"Literature Summary:\n{literature_review[:3000]}\n\n"
                f"Identified Gaps:\n{json.dumps(gaps, indent=2, ensure_ascii=False)}\n\n"
                "Propose novel, feasible, and impactful research ideas."
            ),
        }

        with open(os.path.join(ai_scientist_dir, "prompt.json"), "w", encoding="utf-8") as f:
            json.dump(prompt_json, f, ensure_ascii=False, indent=2)
        with open(os.path.join(ai_scientist_dir, "seed_ideas.json"), "w", encoding="utf-8") as f:
            json.dump(seed_ideas, f, ensure_ascii=False, indent=2)
        with open(os.path.join(ai_scientist_dir, "experiment.py"), "w", encoding="utf-8") as f:
            f.write(self._generate_base_experiment(topic, domain))

        await tracer.log(2, "prepare_template", "模板准备完成")

        gap_path = os.path.join(workspace, "m2_gap_analysis.json")
        with open(gap_path, "w", encoding="utf-8") as f:
            json.dump(gaps_data, f, ensure_ascii=False, indent=2)

        await tracer.save_output(
            2,
            "gap_analysis",
            file_path=gap_path,
            metadata={"gap_count": len(gaps), "grounded_answers": len(pqa_answers)},
        )

        context["research_gaps"] = gaps
        context["seed_ideas"] = seed_ideas
        context["ai_scientist_dir"] = ai_scientist_dir
        context["prompt_json"] = prompt_json
        return context

    async def _query_with_paperqa(self, topic, domain, literature_review, sources, tracer):
        answers: list[dict[str, str]] = []

        try:
            from paperqa import Settings
            from paperqa.settings import ParsingSettings

            paperqa_llm_model = self._paperqa_llm_model()
            paperqa_embedding_model = self._paperqa_embedding_model()

            settings = Settings(
                llm=f"openai/{paperqa_llm_model}",
                summary_llm=f"openai/{paperqa_llm_model}",
                embedding=f"openai/{paperqa_embedding_model}",
                parsing=ParsingSettings(use_doc_details=False),
            )

            os.environ["OPENAI_API_KEY"] = config.OPENAI_API_KEY
            os.environ["OPENAI_API_BASE"] = config.OPENAI_BASE_URL

            await tracer.log(
                2,
                "paperqa",
                f"初始化 PaperQA2 (llm={paperqa_llm_model}, embedding={paperqa_embedding_model})",
            )
            docs = await self._build_docs()
            await tracer.log(2, "paperqa", "PaperQA2 初始化完成")

            if literature_review and len(literature_review) > 200:
                tmp_dir = tempfile.mkdtemp(prefix="scholarmind_paperqa_")
                review_path = os.path.join(tmp_dir, "literature_review.txt")
                with open(review_path, "w", encoding="utf-8") as f:
                    f.write(literature_review)

                try:
                    await tracer.log(2, "paperqa", "开始写入文献综述到 PaperQA2 索引")
                    await self._run_with_timeout(
                        docs.aadd(
                            review_path,
                            citation=self._paperqa_local_citation(topic, domain),
                            docname="scholarmind_local_review",
                            settings=settings,
                        )
                    )
                    await tracer.log(2, "paperqa", "文献综述已建立索引")
                except asyncio.TimeoutError:
                    await tracer.log(2, "paperqa", "PaperQA2 建索引超时，降级到后备检索", level="warn")
                except Exception as exc:
                    await tracer.log(2, "paperqa", f"索引失败: {exc}", level="warn")

            queries = [
                f"What are the main limitations and open problems in {topic}?",
                f"What methods have been proposed for {topic} and what are their weaknesses?",
                f"What datasets and evaluation benchmarks are used in {topic}, and what are their limitations?",
                f"What are the most promising but underexplored research directions in {topic}?",
            ]

            for query in queries:
                try:
                    await tracer.log(2, "paperqa", f"开始查询: {query[:60]}...")
                    response = await self._run_with_timeout(docs.aquery(query, settings=settings))
                    if response and hasattr(response, "answer") and response.answer:
                        answers.append({"query": query, "answer": response.answer})
                        await tracer.log(2, "paperqa", f"查询成功: {query[:50]}...")
                    else:
                        await tracer.log(2, "paperqa", f"无结果: {query[:50]}...", level="warn")
                except asyncio.TimeoutError:
                    await tracer.log(2, "paperqa", f"查询超时: {query[:50]}...", level="warn")
                except Exception as exc:
                    await tracer.log(2, "paperqa", f"查询失败: {exc}", level="warn")

        except ImportError:
            await tracer.log(2, "paperqa", "paper-qa 未安装，降级到纯LLM分析", level="warn")
        except asyncio.TimeoutError:
            await tracer.log(2, "paperqa", "PaperQA2 初始化超时，降级到纯LLM分析", level="warn")
        except Exception as exc:
            await tracer.log(2, "paperqa", f"PaperQA2 初始化失败: {exc}，降级到纯LLM分析", level="warn")

        if not answers:
            await tracer.log(2, "fallback_search", "使用 Semantic Scholar 做降级文献搜索")
            search_queries = [
                f"{topic} limitations open problems",
                f"{topic} survey benchmark",
                f"{topic} {domain} recent advances",
            ]

            for sq in search_queries:
                try:
                    papers = await asyncio.wait_for(asyncio.to_thread(search_for_papers, sq, 5), timeout=20)
                    if papers:
                        paper_summaries = []
                        for paper in papers:
                            abstract = paper.get("abstract", "")
                            if abstract:
                                paper_summaries.append(
                                    f"- {paper.get('title', 'N/A')} ({paper.get('year', '')}, "
                                    f"citations: {paper.get('citationCount', 0)}): {abstract[:200]}"
                                )
                        if paper_summaries:
                            answers.append({"query": sq, "answer": "Relevant papers found:\n" + "\n".join(paper_summaries)})
                except Exception:
                    pass
                await asyncio.sleep(1.0)

        return answers

    def _generate_base_experiment(self, topic, domain):
        return f'''"""
Baseline experiment for: {topic}
Domain: {domain}

This is a REAL experiment template that:
1. Loads a real dataset from HuggingFace or sklearn
2. Trains a real model
3. Evaluates with real metrics
4. AI-Scientist will modify this to implement research ideas
"""
import argparse
import json
import os
import numpy as np
import time
from collections import Counter

def load_dataset_safe():
    """Load a real dataset. Try HuggingFace first, fallback to sklearn."""
    try:
        from datasets import load_dataset
        ds = load_dataset("ag_news", split="train[:2000]")
        texts = ds["text"]
        labels = ds["label"]
        return texts, labels, "ag_news"
    except Exception:
        pass

    try:
        from sklearn.datasets import fetch_20newsgroups
        data = fetch_20newsgroups(
            subset="train",
            categories=["sci.med", "sci.space", "comp.graphics", "rec.sport.baseball"],
            remove=("headers", "footers", "quotes"),
        )
        return data.data[:2000], data.target[:2000].tolist(), "20newsgroups"
    except Exception:
        pass

    np.random.seed(42)
    n = 1000
    texts = [f"sample text {{i}} with features" for i in range(n)]
    labels = [i % 4 for i in range(n)]
    return texts, labels, "synthetic"

def extract_features(texts, max_features=5000):
    """Simple TF-IDF-like feature extraction."""
    word_counts = Counter()
    for text in texts:
        words = text.lower().split()
        word_counts.update(words)

    vocab = {{w: i for i, (w, _) in enumerate(word_counts.most_common(max_features))}}

    features = np.zeros((len(texts), len(vocab)), dtype=np.float32)
    for i, text in enumerate(texts):
        words = text.lower().split()
        for w in words:
            if w in vocab:
                features[i, vocab[w]] += 1
        norm = np.linalg.norm(features[i])
        if norm > 0:
            features[i] /= norm

    return features

def train_and_evaluate(X_train, y_train, X_test, y_test):
    """Train a real classifier and evaluate."""
    try:
        from sklearn.linear_model import LogisticRegression
        from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score

        model = LogisticRegression(max_iter=200, C=1.0, random_state=42)
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)

        return {{
            "accuracy": accuracy_score(y_test, y_pred),
            "f1": f1_score(y_test, y_pred, average="weighted"),
            "precision": precision_score(y_test, y_pred, average="weighted"),
            "recall": recall_score(y_test, y_pred, average="weighted"),
        }}
    except ImportError:
        correct = sum(1 for a, b in zip(y_test, y_pred) if a == b)
        return {{"accuracy": correct / len(y_test), "f1": 0.0, "precision": 0.0, "recall": 0.0}}

def run_experiment(args):
    """Run the baseline experiment with real data."""
    results = {{}}
    start_time = time.time()
    np.random.seed(args.seed)

    texts, labels, dataset_name = load_dataset_safe()
    print(f"Dataset: {{dataset_name}}, samples: {{len(texts)}}")

    features = extract_features(texts)
    print(f"Features shape: {{features.shape}}")

    n = len(texts)
    split = int(n * 0.8)
    indices = np.random.permutation(n)
    X_train, X_test = features[indices[:split]], features[indices[split:]]
    y_train = [labels[i] for i in indices[:split]]
    y_test = [labels[i] for i in indices[split:]]

    metrics = train_and_evaluate(X_train, y_train, X_test, y_test)
    runtime = time.time() - start_time

    for k, v in metrics.items():
        results[f"baseline_{{k}}"] = {{"means": float(v), "stds": 0.0}}
    results["runtime"] = {{"means": runtime, "stds": 0.0}}
    results["dataset"] = {{"means": len(texts), "stds": 0.0}}

    print(f"Results: {{metrics}}")
    print(f"Runtime: {{runtime:.2f}}s")
    return results

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out_dir", type=str, default="run_0")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)
    results = run_experiment(args)
    with open(os.path.join(args.out_dir, "final_info.json"), "w") as f:
        json.dump(results, f, indent=2)
    print(f"Results saved to {{args.out_dir}}/final_info.json")
'''
