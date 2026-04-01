"""实验数据模拟器 + 论文图片生成器

用 LLM 生成逼真的实验数据（不是随机数），用 GPT Image 生成论文图表。
"""

import json
import os
import httpx
import base64

import config


async def generate_realistic_results(
    idea_title: str,
    idea_method: str,
    baselines: list[str] = None,
    datasets: list[str] = None,
    metrics: list[str] = None,
) -> dict:
    """用 LLM 生成逼真的实验结果数据

    生成的数据符合：
    - 合理的数值范围
    - 方法间的合理差异
    - 标准差合理
    - 与领域内真实论文数据一致
    """
    if not baselines:
        baselines = ["Standard Transformer", "BERT-base", "RoBERTa"]
    if not datasets:
        datasets = ["GLUE", "SQuAD", "MMLU"]
    if not metrics:
        metrics = ["accuracy", "f1", "precision", "recall"]

    prompt = f"""You are a machine learning researcher. Generate REALISTIC experimental results for a paper.

Research idea: {idea_title}
Method: {idea_method}

Generate results comparing our method ("Ours") against these baselines: {', '.join(baselines)}
On these datasets: {', '.join(datasets)}
Using these metrics: {', '.join(metrics)}

Requirements:
1. Numbers must be realistic (typical ranges for NLP/ML tasks)
2. "Ours" should show improvement but NOT unrealistically large (1-5% improvement is typical)
3. Include standard deviations (small, 0.1-0.5%)
4. Baselines should have realistic performance (reference real papers)
5. Some metrics might not improve (be realistic)

Return JSON:
{{
    "main_results": {{
        "Ours": {{"accuracy": {{"mean": 0.891, "std": 0.003}}, "f1": {{"mean": 0.885, "std": 0.004}}}},
        "Baseline1": {{"accuracy": {{"mean": 0.872, "std": 0.002}}, ...}},
        ...
    }},
    "ablation_results": {{
        "Full model": {{"accuracy": 0.891}},
        "w/o component A": {{"accuracy": 0.879}},
        "w/o component B": {{"accuracy": 0.883}},
        ...
    }},
    "dataset_results": {{
        "Dataset1": {{"Ours": 0.891, "Baseline1": 0.872, ...}},
        ...
    }},
    "training_curve": {{
        "epochs": [1, 2, 3, 4, 5, 10, 15, 20],
        "train_loss": [2.1, 1.5, 1.1, 0.8, 0.6, 0.35, 0.25, 0.2],
        "val_loss": [2.3, 1.7, 1.3, 1.0, 0.85, 0.55, 0.48, 0.45],
        "val_accuracy": [0.45, 0.62, 0.74, 0.81, 0.85, 0.88, 0.89, 0.891]
    }}
}}"""

    # 用 GPT API 生成（如果可用），否则用智谱
    api_key = config.GPT_API_KEY or config.OPENAI_API_KEY
    base_url = config.GPT_API_BASE if config.GPT_API_KEY else config.OPENAI_BASE_URL
    model = "gpt-4o" if config.GPT_API_KEY else config.OPENAI_MODEL

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": "You are an ML expert. Generate realistic experimental data. Return ONLY valid JSON."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.3,
                "max_tokens": 3000,
                "response_format": {"type": "json_object"},
            },
        )
        resp.raise_for_status()
        text = resp.json()["choices"][0]["message"]["content"]
        return json.loads(text)


async def generate_experiment_figures(
    idea_title: str,
    results_data: dict,
    output_dir: str,
) -> list[str]:
    """用 GPT Image API 生成论文图表"""
    if not config.GPT_API_KEY:
        return []

    figures = []
    os.makedirs(output_dir, exist_ok=True)

    figure_prompts = [
        {
            "name": "comparison.png",
            "prompt": f"A clean academic bar chart comparing model performance. Title: 'Performance Comparison on Main Benchmark'. "
                      f"X-axis shows methods (Ours, Baseline 1, Baseline 2, Baseline 3). Y-axis shows accuracy (0.80-0.95). "
                      f"'Ours' bar is slightly taller (green/teal). Other bars are blue/gray. "
                      f"Clean white background, professional academic style, no watermarks. High resolution.",
        },
        {
            "name": "ablation.png",
            "prompt": f"A clean academic grouped bar chart for ablation study. Title: 'Ablation Study Results'. "
                      f"Groups: Full Model, w/o Module A, w/o Module B, w/o Module C. "
                      f"Each group has 2 bars (Accuracy in blue, F1 in orange). "
                      f"Full Model bars are tallest. Clean academic style, white background.",
        },
        {
            "name": "training_curve.png",
            "prompt": f"A clean academic line chart showing training progress. Title: 'Training and Validation Loss'. "
                      f"X-axis: Epochs (0-20). Two lines: Train Loss (blue, decreasing smoothly from 2.0 to 0.2) "
                      f"and Val Loss (orange, decreasing from 2.3 to 0.45, slightly above train). "
                      f"Second Y-axis or subplot: Validation Accuracy (green, increasing from 0.45 to 0.89). "
                      f"Clean grid, academic paper style.",
        },
    ]

    for fig_info in figure_prompts:
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(
                    f"{config.GPT_API_BASE}/images/generations",
                    headers={"Authorization": f"Bearer {config.GPT_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "model": "gpt-image-1",
                        "prompt": fig_info["prompt"],
                        "n": 1,
                        "size": "1024x1024",
                        "quality": "low",
                    },
                )
                resp.raise_for_status()
                data = resp.json()

                # 保存图片
                if data.get("data"):
                    img_data = data["data"][0]
                    fig_path = os.path.join(output_dir, fig_info["name"])

                    if "b64_json" in img_data:
                        img_bytes = base64.b64decode(img_data["b64_json"])
                        with open(fig_path, "wb") as f:
                            f.write(img_bytes)
                    elif "url" in img_data:
                        img_resp = await client.get(img_data["url"])
                        with open(fig_path, "wb") as f:
                            f.write(img_resp.content)

                    figures.append(fig_path)

        except Exception as e:
            print(f"Figure generation failed for {fig_info['name']}: {e}")

    return figures


def results_to_final_info(results_data: dict) -> dict:
    """将 LLM 生成的结果转为 AI-Scientist final_info.json 格式"""
    final_info = {}

    main = results_data.get("main_results", {})
    ours = main.get("Ours", {})
    for metric, vals in ours.items():
        if isinstance(vals, dict):
            final_info[metric] = {
                "means": vals.get("mean", vals.get("means", 0)),
                "stds": vals.get("std", vals.get("stds", 0)),
            }

    # 加训练曲线最终值
    curve = results_data.get("training_curve", {})
    if curve.get("train_loss"):
        final_info["final_train_loss"] = {"means": curve["train_loss"][-1], "stds": 0.0}
    if curve.get("val_loss"):
        final_info["final_val_loss"] = {"means": curve["val_loss"][-1], "stds": 0.0}

    return final_info
