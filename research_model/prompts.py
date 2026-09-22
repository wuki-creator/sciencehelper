"""Shared task contracts for training and inference.

Adapter1 inputs contain only the title. A paper's conclusion is supervision,
never an input feature. Generating well formed questions needs reviewed
subquestion examples; a conclusion loss alone does not establish that ability.
"""
from __future__ import annotations

import json
from typing import Any

SECTION_ROUTES = ("background", "methods", "results", "analysis", "translation")
SECTION_DESCRIPTIONS = (
    "Research background, biological question, study object and hypothesis",
    "Experimental design, methods, samples, controls and measurements",
    "Results, supporting evidence and conclusions",
    "Statistical analysis, validation and reproducibility",
    "Limitations, boundary conditions and translation",
)
ADAPTER1_SYSTEM = (
    "你是论文研究证据预测器。输入只有论文标题。返回 JSON，包含 conclusion 字段；"
    "它是待核验的结论预测，不代表已读取原文。若经过科研问题标注训练，也可返回 "
    "subquestions 数组（aspect、route、question）。不要把预测表述为已确认的论文事实。"
)
ADAPTER2_SYSTEM = (
    "你是科研 Methods 试剂需求抽取器。只抽取标题和 Methods 明确支持的试剂名称、"
    "类别和用途，不编造货号、浓度或品牌。只返回 JSON："
    '{"requirements":[{"name":"","role":"","evidence":""}]}。'
)


def text_value(value: Any) -> str:
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)
    return str(value or "")


def adapter1_messages(title: str) -> list[dict[str, str]]:
    return [{"role": "system", "content": ADAPTER1_SYSTEM}, {"role": "user", "content": f"标题：{title.strip()}"}]


def adapter2_messages(title: str, methods: Any) -> list[dict[str, str]]:
    return [{"role": "system", "content": ADAPTER2_SYSTEM}, {"role": "user", "content": f"标题：{title.strip()}\nMethods：{text_value(methods)}"}]


def training_pair(row: dict[str, Any], stage: str) -> tuple[list[dict[str, str]], str]:
    title = str(row.get("title") or "").strip()
    if not title:
        raise ValueError("each paper needs a nonempty title")
    if stage == "adapter1":
        conclusion = str(row.get("conclusion") or "").strip()
        if not conclusion:
            raise ValueError("Adapter1 requires a paper conclusion as a loss target")
        target: dict[str, Any] = {"conclusion": conclusion}
        # Only consume supplied examples; no templated questions become labels.
        if row.get("subquestions"):
            if not isinstance(row["subquestions"], list):
                raise ValueError("subquestions must be a reviewed list")
            target["subquestions"] = row["subquestions"]
        return adapter1_messages(title), json.dumps(target, ensure_ascii=False)
    if stage != "adapter2":
        raise ValueError(f"unknown training stage: {stage}")
    if not text_value(row.get("methods")).strip():
        raise ValueError("Adapter2 requires Methods")
    requirements = row.get("requirements", row.get("reagents"))
    if not isinstance(requirements, list) or not requirements:
        raise ValueError("Adapter2 requires a nonempty requirements/reagents list")
    return adapter2_messages(title, row["methods"]), json.dumps({"requirements": requirements}, ensure_ascii=False)


def render_prompt(tokenizer: Any, messages: list[dict[str, str]]) -> str:
    """Use exactly this rendering in local LoRA inference as well as training."""
    if getattr(tokenizer, "chat_template", None):
        return tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    return "\n".join(f"{message['role']}: {message['content']}" for message in messages) + "\nassistant: "
