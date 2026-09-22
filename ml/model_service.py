#!/usr/bin/env python3
"""FastAPI inference service for DeepSeek + Adapter1/2 + K1/K2.

The service remains useful before model training: K1 and K2 use deterministic
literature-structure and reagent-category routing, while ``DEEPSEEK_API_KEY``
enables the DeepSeek base model for free-form answers.  Trained LoRA artifacts
can be loaded later by setting ``ML_ARTIFACTS_DIR`` and
``ML_ENABLE_LOCAL_MODEL=true``.
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

try:
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field
except ImportError as error:  # pragma: no cover - gives a clear startup error
    raise SystemExit("缺少服务依赖，请运行: pip install -r ml/requirements.txt") from error


APP_NAME = "paperpilot-ml"
ARTIFACTS_DIR = Path(os.getenv("ML_ARTIFACTS_DIR", "ml/artifacts"))
DEEPSEEK_URL = os.getenv("DEEPSEEK_API_URL", "https://api.deepseek.com/chat/completions")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
DEEPSEEK_KEY = os.getenv("DEEPSEEK_API_KEY", "")


class RouteRequest(BaseModel):
    title: str = ""
    conclusion: str = ""
    methods: list[str] = Field(default_factory=list)
    reagents: list[str] = Field(default_factory=list)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    model: str = APP_NAME
    messages: list[ChatMessage]
    temperature: float = 0.2
    stream: bool = False


def k1_route(title: str, conclusion: str = "", methods: list[str] | None = None) -> list[dict[str, str]]:
    """Split evidence into complementary IMRaD-aligned research questions."""
    title = title.strip() or "未命名论文"
    evidence = conclusion.strip() or "原文未提供结论，请核对全文。"
    method_text = "；".join(methods or []).strip() or "原文未提供 Methods，请核对全文。"
    return [
        {"angle": "研究问题与对象", "question": f"《{title}》研究的对象、变量和核心假设是什么？", "evidence": evidence},
        {"angle": "实验设计与方法", "question": "样本、对照、实验流程和关键方法参数是什么？", "evidence": method_text},
        {"angle": "主要结果与结论", "question": "哪些主要结果支持论文的结论？证据边界在哪里？", "evidence": evidence},
        {"angle": "局限性与可重复性", "question": "哪些条件、偏倚、统计或批次信息需要进一步复核？", "evidence": method_text},
    ]


ROUTE_RULES = (
    ("RNA 提取", r"rna|转录组|提取|纯化|裂解"),
    ("逆转录", r"逆转录|cdna|first.?strand|反转录"),
    ("qPCR", r"qpcr|rt.?pcr|sybr|探针|实时荧光"),
    ("建库", r"建库|library|文库|接头|测序"),
    ("酶与抑制剂", r"酶|enzyme|dnase|rnase|抑制剂|protease"),
    ("抗体与染色", r"抗体|免疫荧光|immuno|染色|flow cytometry|流式"),
)


def k2_route(title: str, methods: list[str], reagents: list[str]) -> list[dict[str, Any]]:
    text = "；".join([title, *methods, *reagents])
    output = []
    for category, pattern in ROUTE_RULES:
        if re.search(pattern, text, re.I):
            matched = [item for item in reagents if re.search(pattern, item, re.I)]
            output.append({"category": category, "reagents": matched, "evidence": "；".join(methods)[:500]})
    if not output:
        output.append({"category": "其他", "reagents": reagents, "evidence": text[:500]})
    return output


def deepseek_chat(messages: list[dict[str, str]]) -> str | None:
    if not DEEPSEEK_KEY:
        return None
    payload = json.dumps({"model": DEEPSEEK_MODEL, "temperature": 0.2, "messages": messages}).encode()
    request = urllib.request.Request(DEEPSEEK_URL, data=payload, headers={"Content-Type": "application/json", "Authorization": f"Bearer {DEEPSEEK_KEY}"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            data = json.loads(response.read().decode("utf-8"))
        return data.get("choices", [{}])[0].get("message", {}).get("content")
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError):
        return None


class LocalAdapter:
    """Optional LoRA loader.  It is kept lazy so the API starts on CPU hosts."""

    def __init__(self) -> None:
        self.enabled = os.getenv("ML_ENABLE_LOCAL_MODEL", "false").lower() == "true"
        self.loaded: dict[str, bool] = {job: (ARTIFACTS_DIR / job).exists() for job in ("adapter1", "k1", "adapter2", "k2")}
        self.model = None
        self.tokenizer = None
        if self.enabled and any(self.loaded.values()):
            self._load()

    def _load(self) -> None:
        try:
            from transformers import AutoModelForCausalLM, AutoTokenizer
            base = os.getenv("BASE_MODEL", "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B")
            self.tokenizer = AutoTokenizer.from_pretrained(base, trust_remote_code=True)
            self.model = AutoModelForCausalLM.from_pretrained(base, trust_remote_code=True)
        except Exception as error:  # Keep service available with rule routing.
            print(f"local model disabled: {error}")
            self.model = self.tokenizer = None

    def generate(self, prompt: str, job: str) -> str | None:
        if self.model is None or self.tokenizer is None or not self.loaded.get(job):
            return None
        # Loading multiple PEFT adapters is deployment-specific; the endpoint
        # still reports artifacts and falls back deterministically until a
        # compatible adapter is activated in the target image.
        return None


adapter = LocalAdapter()
app = FastAPI(title=APP_NAME, version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("ML_CORS_ORIGINS", "*").split(","), allow_methods=["*"], allow_headers=["*"])


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {"status": "ok", "service": APP_NAME, "deepseek": bool(DEEPSEEK_KEY), "local_model": bool(adapter.model), "artifacts": adapter.loaded, "timestamp": int(time.time())}


@app.get("/v1/models")
def models() -> dict[str, Any]:
    return {"object": "list", "data": [{"id": APP_NAME, "object": "model", "owned_by": "paperpilot", "adapters": list(adapter.loaded)}]}


@app.post("/route/k1")
def route_k1(payload: RouteRequest) -> dict[str, Any]:
    return {"network": "deepseek+adapter1+k1", "subquestions": k1_route(payload.title, payload.conclusion, payload.methods)}


@app.post("/route/k2")
def route_k2(payload: RouteRequest) -> dict[str, Any]:
    return {"network": "adapter2+k2", "routes": k2_route(payload.title, payload.methods, payload.reagents)}


@app.post("/pipeline")
def pipeline(payload: RouteRequest) -> dict[str, Any]:
    k1 = k1_route(payload.title, payload.conclusion, payload.methods)
    k2 = k2_route(payload.title, payload.methods, payload.reagents)
    return {"network": "deepseek+adapter1+adapter2+k1+k2", "k1": k1, "k2": k2}


@app.post("/v1/chat/completions")
def chat(payload: ChatRequest) -> dict[str, Any]:
    messages = [message.model_dump() for message in payload.messages]
    content = deepseek_chat(messages)
    if content is None:
        user_text = next((message["content"] for message in reversed(messages) if message["role"] == "user"), "")
        content = json.dumps({"answer": "已使用本地科研路由骨架处理。", "k1_subquestions": k1_route(user_text), "k2_routes": k2_route(user_text, [], [])}, ensure_ascii=False)
    return {"id": f"chatcmpl-{int(time.time() * 1000)}", "object": "chat.completion", "created": int(time.time()), "model": payload.model, "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=os.getenv("ML_HOST", "0.0.0.0"), port=int(os.getenv("ML_PORT", "8010")))
