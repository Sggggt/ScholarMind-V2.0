"""AI-Scientist 桥接层

让 AI-Scientist 的函数能用我们的智谱AI (OpenAI兼容API)。
提供 create_client / get_response_from_llm / extract_json_between_markers
等函数的适配版本。
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from typing import List, Dict, Union

import backoff
import openai
import requests

import config

# ── 把 AI-Scientist 加到 sys.path ──
AI_SCIENTIST_ROOT = os.path.join(
    os.path.dirname(__file__), "..", "repos", "AI-Scientist"
)
if AI_SCIENTIST_ROOT not in sys.path:
    sys.path.insert(0, AI_SCIENTIST_ROOT)


# ── LLM 客户端 (适配智谱AI / OpenAI兼容) ──

MAX_NUM_TOKENS = 4096


def create_client_zhipu():
    """创建指向智谱AI的 OpenAI 兼容客户端"""
    client = openai.OpenAI(
        api_key=config.OPENAI_API_KEY,
        base_url=config.OPENAI_BASE_URL,
    )
    return client, config.OPENAI_MODEL


@backoff.on_exception(
    backoff.expo,
    (openai.RateLimitError, openai.APITimeoutError, openai.APIConnectionError),
    max_tries=5,
)
def get_response_from_llm(
    msg,
    client,
    model,
    system_message,
    print_debug=False,
    msg_history=None,
    temperature=0.75,
):
    """AI-Scientist 兼容的 LLM 调用函数 (适配 OpenAI 兼容API)"""
    if msg_history is None:
        msg_history = []

    new_msg_history = msg_history + [{"role": "user", "content": msg}]
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_message},
            *new_msg_history,
        ],
        temperature=temperature,
        max_tokens=MAX_NUM_TOKENS,
        n=1,
    )
    content = response.choices[0].message.content
    new_msg_history = new_msg_history + [{"role": "assistant", "content": content}]

    if print_debug:
        print()
        print("*" * 20 + " LLM START " + "*" * 20)
        for j, m in enumerate(new_msg_history):
            print(f'{j}, {m["role"]}: {m["content"][:200]}...')
        print("*" * 21 + " LLM END " + "*" * 21)
        print()

    return content, new_msg_history


def get_batch_responses_from_llm(
    msg,
    client,
    model,
    system_message,
    print_debug=False,
    msg_history=None,
    temperature=0.75,
    n_responses=1,
):
    """AI-Scientist 兼容的批量 LLM 调用"""
    content, new_msg_history = [], []
    for _ in range(n_responses):
        c, hist = get_response_from_llm(
            msg, client, model, system_message,
            print_debug=print_debug,
            msg_history=msg_history,
            temperature=temperature,
        )
        content.append(c)
        new_msg_history.append(hist)
    return content, new_msg_history


def extract_json_between_markers(llm_output):
    """从 LLM 输出中提取 JSON (复用 AI-Scientist 的逻辑)"""
    json_pattern = r"```json(.*?)```"
    matches = re.findall(json_pattern, llm_output, re.DOTALL)

    if not matches:
        json_pattern = r"\{.*?\}"
        matches = re.findall(json_pattern, llm_output, re.DOTALL)

    for json_string in matches:
        json_string = json_string.strip()
        try:
            return json.loads(json_string)
        except json.JSONDecodeError:
            try:
                json_string_clean = re.sub(r"[\x00-\x1F\x7F]", "", json_string)
                return json.loads(json_string_clean)
            except json.JSONDecodeError:
                continue
    return None


# ── 论文搜索 (复用 AI-Scientist 的 Semantic Scholar 逻辑) ──

S2_API_KEY = os.getenv("S2_API_KEY", os.getenv("SEMANTIC_SCHOLAR_API_KEY", ""))
BRAVE_API_KEY = os.getenv("BRAVE_API_KEY", "")


def on_backoff(details):
    print(
        f"Backing off {details['wait']:0.1f} seconds after {details['tries']} tries "
        f"calling function {details['target'].__name__} at {time.strftime('%X')}"
    )


def search_for_papers(query, result_limit=10) -> Union[None, List[Dict]]:
    """搜索论文：优先 Brave (不限流) → 降级 Semantic Scholar"""
    if not query:
        return None

    # 优先用 Brave Search (不限流，速度快)
    if BRAVE_API_KEY:
        papers = _search_brave(query, result_limit)
        if papers:
            return papers

    # 降级到 Semantic Scholar
    return _search_semantic_scholar(query, result_limit)


def _search_brave(query, result_limit=10) -> Union[None, List[Dict]]:
    """通过 Brave Search API 搜索学术论文"""
    try:
        rsp = requests.get(
            "https://api.search.brave.com/res/v1/web/search",
            headers={
                "Accept": "application/json",
                "Accept-Encoding": "gzip",
                "X-Subscription-Token": BRAVE_API_KEY,
            },
            params={"q": f"{query} site:arxiv.org OR site:semanticscholar.org OR site:aclanthology.org", "count": result_limit},
            timeout=10,
        )
        rsp.raise_for_status()
        data = rsp.json()

        papers = []
        for item in data.get("web", {}).get("results", []):
            title = item.get("title", "")
            description = item.get("description", "")
            url = item.get("url", "")

            # 从 URL 推断年份
            year = 2024
            for y in range(2020, 2027):
                if str(y) in url or str(y) in title:
                    year = y
                    break

            papers.append({
                "title": title,
                "authors": [],
                "venue": url.split("/")[2] if "/" in url else "",
                "year": year,
                "abstract": description,
                "citationCount": 0,
                "citationStyles": {},
            })

        return papers if papers else None
    except Exception:
        return None


def _search_semantic_scholar(query, result_limit=10) -> Union[None, List[Dict]]:
    """通过 Semantic Scholar 搜索论文 (有限流风险)"""
    try:
        rsp = requests.get(
            "https://api.semanticscholar.org/graph/v1/paper/search",
            headers={"X-API-KEY": S2_API_KEY} if S2_API_KEY else {},
            params={
                "query": query,
                "limit": result_limit,
                "fields": "title,authors,venue,year,abstract,citationStyles,citationCount",
            },
            timeout=10,
        )
        if rsp.status_code == 429:
            time.sleep(3.0)
            return None
        rsp.raise_for_status()
        results = rsp.json()
        total = results.get("total", 0)
        time.sleep(1.0)
        if not total:
            return None
        return results["data"]
    except Exception:
        return None
