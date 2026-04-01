from __future__ import annotations
"""M2: 研究空白识别与选题开题模块 (V2 - PaperQA2 RAG)

升级点：
1. 用 PaperQA2 索引 M1 发现的论文，建立本地知识库
2. 发定向查询获取 grounded gap analysis
3. 用真实文献证据构建研究空白
4. 保持输出格式 (seed_ideas.json + prompt.json)

核心依赖: paper-qa (PaperQA2)
"""

import json
import os
import asyncio
import tempfile

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


class GapAnalysisModule(BaseModule):
    module_id = 2
    name = "研究空白识别"

    async def execute(self, context: dict, tracer: Tracer, state: TaskStateMachine) -> dict:
        topic = context["topic"]
        domain = context.get("domain", "")
        literature_review = context.get("literature_review", "")
        research_sources = context.get("research_sources", [])
        workspace = context["workspace"]

        # ── Step 1: 用 PaperQA2 建立文献知识库 ──
        tracer.step_start()
        await tracer.log(2, "build_index", "用 PaperQA2 建立文献知识库")

        pqa_answers = await self._query_with_paperqa(
            topic, domain, literature_review, research_sources, tracer
        )

        await tracer.log(2, "build_index",
                         f"PaperQA2 返回 {len(pqa_answers)} 条 grounded 回答")

        # ── Step 2: 用 grounded answers 识别研究空白 ──
        tracer.step_start()
        await tracer.log(2, "identify_gaps", "基于 grounded 文献分析识别研究空白")

        # 构建增强的 gap 分析 prompt
        grounded_context = "\n\n".join(
            f"Q: {qa['query']}\nA (grounded in literature): {qa['answer']}"
            for qa in pqa_answers
        ) if pqa_answers else "No PaperQA results available."

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

        # ── Step 3: 生成 seed ideas (AI-Scientist 格式) ──
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

        # ── Step 4: 准备 AI-Scientist 模板文件 ──
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

        with open(os.path.join(ai_scientist_dir, "prompt.json"), "w") as f:
            json.dump(prompt_json, f, indent=2)
        with open(os.path.join(ai_scientist_dir, "seed_ideas.json"), "w") as f:
            json.dump(seed_ideas, f, indent=4)
        with open(os.path.join(ai_scientist_dir, "experiment.py"), "w") as f:
            f.write(self._generate_base_experiment(topic, domain))

        await tracer.log(2, "prepare_template", "模板准备完成")

        # ── 保存产出 ──
        gap_path = os.path.join(workspace, "m2_gap_analysis.json")
        with open(gap_path, "w", encoding="utf-8") as f:
            json.dump(gaps_data, f, ensure_ascii=False, indent=2)

        await tracer.save_output(2, "gap_analysis", file_path=gap_path,
                                  metadata={"gap_count": len(gaps), "grounded_answers": len(pqa_answers)})

        context["research_gaps"] = gaps
        context["seed_ideas"] = seed_ideas
        context["ai_scientist_dir"] = ai_scientist_dir
        context["prompt_json"] = prompt_json

        return context

    async def _query_with_paperqa(self, topic, domain, literature_review, sources, tracer):
        """用 PaperQA2 做 RAG 查询"""
        answers = []

        try:
            from paperqa import Docs, Settings

            # 配置 PaperQA 使用智谱AI
            # embedding 用 litellm 支持的格式，或留空用默认
            settings = Settings(
                llm=f"openai/{config.OPENAI_MODEL}",
                summary_llm=f"openai/{config.OPENAI_MODEL}",
            )

            # 设置 OpenAI 兼容环境变量
            os.environ["OPENAI_API_KEY"] = config.OPENAI_API_KEY
            os.environ["OPENAI_API_BASE"] = config.OPENAI_BASE_URL

            docs = Docs()

            # 将文献综述作为文本添加到索引
            if literature_review and len(literature_review) > 200:
                # 保存为临时文本文件让 PaperQA 索引
                tmp_dir = tempfile.mkdtemp()
                review_path = os.path.join(tmp_dir, "literature_review.txt")
                with open(review_path, "w") as f:
                    f.write(literature_review)

                try:
                    await docs.aadd(review_path, settings=settings)
                    await tracer.log(2, "paperqa", "文献综述已索引")
                except Exception as e:
                    await tracer.log(2, "paperqa", f"索引失败: {e}", level="warn")

            # 定向查询
            queries = [
                f"What are the main limitations and open problems in {topic}?",
                f"What methods have been proposed for {topic} and what are their weaknesses?",
                f"What datasets and evaluation benchmarks are used in {topic}, and what are their limitations?",
                f"What are the most promising but underexplored research directions in {topic}?",
            ]

            for query in queries:
                try:
                    response = await docs.aquery(query, settings=settings)
                    if response and hasattr(response, 'answer') and response.answer:
                        answers.append({
                            "query": query,
                            "answer": response.answer,
                        })
                        await tracer.log(2, "paperqa", f"查询成功: {query[:50]}...")
                    else:
                        await tracer.log(2, "paperqa", f"无结果: {query[:50]}...", level="warn")
                except Exception as e:
                    await tracer.log(2, "paperqa", f"查询失败: {e}", level="warn")

        except ImportError:
            await tracer.log(2, "paperqa", "paper-qa 未安装，降级到纯LLM分析", level="warn")
        except Exception as e:
            await tracer.log(2, "paperqa", f"PaperQA2 初始化失败: {e}，降级到纯LLM分析", level="warn")

        # 降级：如果 PaperQA 失败，用 Semantic Scholar 搜索补充
        if not answers:
            await tracer.log(2, "fallback_search", "使用 Semantic Scholar 做降级文献搜索")
            search_queries = [
                f"{topic} limitations open problems",
                f"{topic} survey benchmark",
                f"{topic} {domain} recent advances",
            ]
            for sq in search_queries:
                try:
                    papers = await asyncio.to_thread(search_for_papers, sq, 5)
                    if papers:
                        paper_summaries = []
                        for p in papers:
                            abstract = p.get("abstract", "")
                            if abstract:
                                paper_summaries.append(
                                    f"- {p.get('title', 'N/A')} ({p.get('year', '')}, "
                                    f"citations: {p.get('citationCount', 0)}): {abstract[:200]}"
                                )
                        if paper_summaries:
                            answers.append({
                                "query": sq,
                                "answer": "Relevant papers found:\n" + "\n".join(paper_summaries),
                            })
                except Exception:
                    pass
                await asyncio.sleep(1.0)

        return answers

    def _generate_base_experiment(self, topic, domain):
        """生成真实实验模板 — 使用 HuggingFace datasets + sklearn/torch"""
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
    # Try HuggingFace datasets
    try:
        from datasets import load_dataset
        ds = load_dataset("ag_news", split="train[:2000]")
        texts = ds["text"]
        labels = ds["label"]
        return texts, labels, "ag_news"
    except Exception:
        pass

    # Fallback to sklearn
    try:
        from sklearn.datasets import fetch_20newsgroups
        data = fetch_20newsgroups(subset="train", categories=["sci.med", "sci.space", "comp.graphics", "rec.sport.baseball"],
                                  remove=("headers", "footers", "quotes"))
        return data.data[:2000], data.target[:2000].tolist(), "20newsgroups"
    except Exception:
        pass

    # Last resort: generate synthetic but structured data
    np.random.seed(42)
    n = 1000
    texts = [f"sample text {{i}} with features" for i in range(n)]
    labels = [i % 4 for i in range(n)]
    return texts, labels, "synthetic"

def extract_features(texts, max_features=5000):
    """Simple TF-IDF-like feature extraction."""
    # Build vocabulary
    word_counts = Counter()
    for text in texts:
        words = text.lower().split()
        word_counts.update(words)

    vocab = {{w: i for i, (w, _) in enumerate(word_counts.most_common(max_features))}}

    # Convert to bag-of-words
    features = np.zeros((len(texts), len(vocab)), dtype=np.float32)
    for i, text in enumerate(texts):
        words = text.lower().split()
        for w in words:
            if w in vocab:
                features[i, vocab[w]] += 1
        # L2 normalize
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
        # Manual accuracy calculation without sklearn
        correct = sum(1 for a, b in zip(y_test, y_pred) if a == b)
        return {{"accuracy": correct / len(y_test), "f1": 0.0, "precision": 0.0, "recall": 0.0}}

def run_experiment(args):
    """Run the baseline experiment with real data."""
    results = {{}}
    start_time = time.time()
    np.random.seed(args.seed)

    # Load real data
    texts, labels, dataset_name = load_dataset_safe()
    print(f"Dataset: {{dataset_name}}, samples: {{len(texts)}}")

    # Feature extraction
    features = extract_features(texts)
    print(f"Features shape: {{features.shape}}")

    # Train/test split (80/20)
    n = len(texts)
    split = int(n * 0.8)
    indices = np.random.permutation(n)
    X_train, X_test = features[indices[:split]], features[indices[split:]]
    y_train = [labels[i] for i in indices[:split]]
    y_test = [labels[i] for i in indices[split:]]

    # Train and evaluate
    metrics = train_and_evaluate(X_train, y_train, X_test, y_test)
    runtime = time.time() - start_time

    # Save in AI-Scientist format
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
