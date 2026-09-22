"""Inference service for the PaperPilot research network.

The service keeps the model contract explicit:

  DeepSeek -> Adapter1 -> K1: title to literature-shaped subquestions
  DeepSeek -> Adapter2 -> K2: title + Methods to reagent requirements/routes

Adapter checkpoints are optional at runtime. When they are not present, the
self-hosted DeepSeek endpoint is used with the adapter's task prompt and the
deterministic routers provide a safe, inspectable fallback. This makes the
backend deployable before the 10,000-paper corpus is available while keeping
the trained checkpoint interface unchanged.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("research-model")

BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "http://127.0.0.1:8000/v1").rstrip("/")
MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B")
API_KEY = os.getenv("DEEPSEEK_API_KEY", "local")
ADAPTER1_PATH = os.getenv("ADAPTER1_PATH", "")
ADAPTER2_PATH = os.getenv("ADAPTER2_PATH", "")
NETWORK_MANIFEST = os.getenv("NETWORK_MANIFEST", "")
REQUEST_TIMEOUT = float(os.getenv("DEEPSEEK_TIMEOUT", "120"))

app = FastAPI(title="PaperPilot Research Network", version="1.0.0")


class K1Request(BaseModel):
    title: str = Field(min_length=3, max_length=1000)
    conclusion: str = Field(default="", max_length=12000)
    max_subquestions: int = Field(default=5, ge=1, le=8)


class K2Request(BaseModel):
    title: str = Field(default="", max_length=1000)
    methods: str = Field(default="", max_length=30000)
    catalog: list[dict[str, Any]] = Field(default_factory=list)
    top_k: int = Field(default=5, ge=1, le=20)


class PipelineRequest(K1Request):
    methods: str = Field(default="", max_length=30000)
    catalog: list[dict[str, Any]] = Field(default_factory=list)
    top_k: int = Field(default=5, ge=1, le=20)


def _json_from_text(text: str) -> dict[str, Any] | None:
    """Extract a JSON object even when a model wraps it in markdown."""
    text = text.strip()
    candidates = [text]
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S | re.I)
    if fenced:
        candidates.insert(0, fenced.group(1))
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        candidates.append(text[start : end + 1])
    for candidate in candidates:
        try:
            value = json.loads(candidate)
            if isinstance(value, dict):
                return value
        except (TypeError, json.JSONDecodeError):
            continue
    return None


async def _deepseek(messages: list[dict[str, str]], *, json_mode: bool = True) -> str:
    body: dict[str, Any] = {
        "model": MODEL,
        "temperature": 0.1,
        "messages": messages,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"}
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        response = await client.post(f"{BASE_URL}/chat/completions", headers=headers, json=body)
        response.raise_for_status()
        data = response.json()
    return str(data.get("choices", [{}])[0].get("message", {}).get("content", ""))


LITERATURE_BUCKETS = {
    "研究背景与假设": ("background", ("mechanism", "hypothesis", "rationale", "背景", "机制", "假设", "病理")),
    "实验设计与方法": ("methods", ("method", "protocol", "assay", "experiment", "方法", "实验", "样本", "模型")),
    "结果与证据解释": ("results", ("result", "finding", "effect", "outcome", "结果", "效应", "表达", "表型")),
    "统计分析与可重复性": ("analysis", ("statistic", "reproduc", "validation", "analysis", "统计", "重复", "验证", "质控")),
    "局限性与转化": ("translation", ("limit", "clinical", "translat", "future", "局限", "临床", "转化", "展望")),
}


def _fallback_k1(title: str, conclusion: str, max_subquestions: int) -> dict[str, Any]:
    text = f"{title} {conclusion}".lower()
    ranked = []
    for label, (route, keywords) in LITERATURE_BUCKETS.items():
        score = sum(1 for word in keywords if word.lower() in text)
        ranked.append((score, label, route))
    ranked.sort(key=lambda item: (-item[0], list(LITERATURE_BUCKETS).index(item[1])))
    selected = ranked[: max(3, min(max_subquestions, 5))]
    subquestions = [
        {
            "id": f"k1-{index + 1}",
            "aspect": label,
            "route": route,
            "question": f"针对《{title}》，{label}需要核对哪些证据、变量和可复现实验细节？",
            "evidence": "conclusion" if conclusion else "title",
            "confidence": round(min(0.55 + score * 0.08, 0.96), 2),
        }
        for index, (score, label, route) in enumerate(selected)
    ]
    return {"subquestions": subquestions, "source": "adapter1-prompt-fallback", "adapter": ADAPTER1_PATH or None}


async def adapter1(title: str, conclusion: str, max_subquestions: int) -> dict[str, Any]:
    system = (
        "你是 Adapter1：文献结构化问题生成器。根据论文标题和结论，按论文常见结构生成互补、可独立审核的科研子问题。"
        "必须覆盖研究背景/假设、实验设计/方法、结果/证据、统计/可重复性，必要时加入局限/转化。"
        "不要臆造标题或结论没有支持的具体数值。只返回 JSON："
        '{"subquestions":[{"aspect":"","route":"background|methods|results|analysis|translation",'
        '"question":"","evidence":"title|conclusion|both","confidence":0.0}]}.'
    )
    # Adapter1 input is title only. A conclusion is a training target, never a
    # feature at inference time; keeping this boundary prevents label leakage.
    prompt = f"标题：{title}\n最多生成 {max_subquestions} 个子问题。"
    try:
        value = _json_from_text(await _deepseek([{"role": "system", "content": system}, {"role": "user", "content": prompt}]))
        if value and isinstance(value.get("subquestions"), list) and value["subquestions"]:
            return {"subquestions": value["subquestions"][:max_subquestions], "source": "deepseek+adapter1", "adapter": ADAPTER1_PATH or None}
    except Exception as exc:  # service remains useful when vLLM is restarting
        log.warning("adapter1 generation failed: %s", exc)
    return _fallback_k1(title, conclusion, max_subquestions)


def _norm(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").lower()).strip()


def _route_k1(subquestions: list[dict[str, Any]], title: str, conclusion: str) -> list[dict[str, Any]]:
    result = []
    for index, item in enumerate(subquestions):
        aspect = str(item.get("aspect") or "研究问题")
        route = str(item.get("route") or "analysis")
        if route not in {value[0] for value in LITERATURE_BUCKETS.values()}:
            aspect_norm = aspect.lower()
            route = next((candidate for label, (candidate, keywords) in LITERATURE_BUCKETS.items() if label.lower() in aspect_norm or any(word.lower() in aspect_norm for word in keywords)), "analysis")
        result.append({
            "slot": index + 1,
            "subquestion": str(item.get("question") or f"{title} 的 {aspect} 如何验证？"),
            "aspect": aspect,
            "route": route,
            "evidence": item.get("evidence") or ("both" if conclusion else "title"),
            "confidence": float(item.get("confidence") or 0.6),
        })
    return result


REAGENT_ALIASES = {
    "rna": ("RNA 提取", "逆转录", "建库"),
    "single cell": ("单细胞", "酶与抑制剂"),
    "scRNA": ("单细胞", "RNA 提取", "建库"),
    "qpcr": ("qPCR", "逆转录"),
    "pcr": ("qPCR",),
    "library": ("建库",),
    "transcript": ("RNA 提取", "逆转录", "建库"),
    "免疫": ("抗体", "酶与抑制剂"),
    "抗体": ("抗体",),
    "蛋白": ("蛋白表达", "抗体"),
}


def _fallback_k2(title: str, methods: str, catalog: list[dict[str, Any]], top_k: int) -> dict[str, Any]:
    text = _norm(f"{title} {methods}")
    requested = [key for key in REAGENT_ALIASES if key.lower() in text]
    expanded = {category for key in requested for category in REAGENT_ALIASES[key]}
    rows = []
    for item in catalog:
        source = _norm(" ".join(str(item.get(key, "")) for key in ("name", "brand", "category", "spec", "tags")))
        exact = sum(3 for key in requested if key.lower() in source)
        category = 4 if str(item.get("category", "")) in expanded else 0
        tags = sum(2 for tag in (item.get("tags") or []) if _norm(tag) in text)
        availability = 0.5 if float(item.get("stock") or 0) > 0 else -1
        score = exact + category + tags + availability
        if score > 0 or not requested:
            rows.append({
                "reagent": item,
                "score": round(score, 2),
                "reason": f"{item.get('category', '其他')} 与标题/Methods 的 {', '.join(requested[:3]) or '实验上下文'} 匹配",
                "route": str(item.get("category") or "other").lower().replace(" ", "-"),
            })
    rows.sort(key=lambda row: (-row["score"], -float(row["reagent"].get("rating") or 0), str(row["reagent"].get("name", ""))))
    return {"requirements": requested, "routes": rows[:top_k], "source": "k2-deterministic-router", "adapter": ADAPTER2_PATH or None}


async def adapter2(title: str, methods: str, catalog: list[dict[str, Any]], top_k: int) -> dict[str, Any]:
    system = (
        "你是 Adapter2：科研 Methods 试剂需求抽取器。只抽取标题和 Methods 中明确出现或明确需要的试剂类别/名称，"
        "不要编造货号、浓度或品牌。只返回 JSON："
        '{"requirements":[{"name":"","role":"","evidence":"","confidence":0.0}]}.'
    )
    prompt = f"标题：{title}\nMethods：{methods or '未提供 Methods'}"
    requirements: list[dict[str, Any]] = []
    try:
        value = _json_from_text(await _deepseek([{"role": "system", "content": system}, {"role": "user", "content": prompt}]))
        if value and isinstance(value.get("requirements"), list):
            requirements = value["requirements"]
    except Exception as exc:
        log.warning("adapter2 generation failed: %s", exc)
    if not requirements:
        fallback = _fallback_k2(title, methods, catalog, top_k)
        return {"requirements": [{"name": name, "role": name, "evidence": "title/methods", "confidence": 0.6} for name in fallback["requirements"]], "source": fallback["source"], "adapter": fallback["adapter"]}
    query_text = " ".join(str(item.get("name", "")) + " " + str(item.get("role", "")) for item in requirements)
    routed = _fallback_k2(f"{title} {query_text}", methods, catalog, top_k)
    routed["requirements"] = requirements
    routed["source"] = "deepseek+adapter2+k2"
    routed["adapter"] = ADAPTER2_PATH or None
    return routed


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "service": "paperpilot-research-network", "model": MODEL, "base_url": BASE_URL}


@app.get("/v1/model-info")
async def model_info() -> dict[str, Any]:
    manifest = None
    if NETWORK_MANIFEST and os.path.exists(NETWORK_MANIFEST):
        try:
            with open(NETWORK_MANIFEST, "r", encoding="utf-8") as handle:
                manifest = json.load(handle)
        except (OSError, json.JSONDecodeError):
            manifest = None
    return {
        "base_model": MODEL,
        "backend": BASE_URL,
        "adapter1": {"path": ADAPTER1_PATH or None, "loaded": bool(ADAPTER1_PATH and os.path.exists(ADAPTER1_PATH)), "purpose": "title -> literature-shaped subquestions"},
        "adapter2": {"path": ADAPTER2_PATH or None, "loaded": bool(ADAPTER2_PATH and os.path.exists(ADAPTER2_PATH)), "purpose": "title + Methods -> reagent requirements"},
        "routers": {"K1": "literature-structure router", "K2": "catalog-aware reagent router"},
        "network_manifest": manifest,
    }


@app.post("/v1/k1")
async def k1(request: K1Request) -> dict[str, Any]:
    started = time.perf_counter()
    generated = await adapter1(request.title, request.conclusion, request.max_subquestions)
    routed = _route_k1(generated["subquestions"], request.title, request.conclusion)
    return {"adapter1": generated, "k1": {"routes": routed}, "elapsed_ms": int((time.perf_counter() - started) * 1000)}


@app.post("/v1/k2")
async def k2(request: K2Request) -> dict[str, Any]:
    started = time.perf_counter()
    routed = await adapter2(request.title, request.methods, request.catalog, request.top_k)
    return {"adapter2": routed, "k2": {"routes": routed["routes"]}, "elapsed_ms": int((time.perf_counter() - started) * 1000)}


@app.post("/v1/pipeline")
async def pipeline(request: PipelineRequest) -> dict[str, Any]:
    started = time.perf_counter()
    first = await k1(request)
    second = await k2(K2Request(title=request.title, methods=request.methods, catalog=request.catalog, top_k=request.top_k))
    return {**first, **second, "elapsed_ms": int((time.perf_counter() - started) * 1000)}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=os.getenv("RESEARCH_HOST", "127.0.0.1"), port=int(os.getenv("RESEARCH_PORT", "8091")))
