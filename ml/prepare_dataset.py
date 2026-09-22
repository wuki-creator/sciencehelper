#!/usr/bin/env python3
"""Normalize paper metadata and create training records for both adapters.

The input can be JSONL or CSV.  The following columns are recognized (aliases
are accepted): ``title``, ``conclusion``, ``methods`` and ``reagents``.  Lists
may be JSON encoded or separated with ``;``/newlines.

The generated files are intentionally plain JSONL so they can be consumed by
the Hugging Face trainer or inspected with standard command line tools:

* ``normalized.jsonl`` keeps all source fields;
* ``adapter1.jsonl`` trains title -> conclusion/structured literature answer;
* ``adapter2.jsonl`` trains title + Methods -> reagent routing labels.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import re
from pathlib import Path
from typing import Any, Iterable


FIELD_ALIASES = {
    "title": ("title", "paper_title", "article_title", "论文标题", "标题"),
    "conclusion": ("conclusion", "conclusions", "result", "results", "结论", "研究结论"),
    "methods": ("methods", "method", "methodology", "实验方法", "方法", "Methods"),
    "reagents": ("reagents", "reagent", "materials", "试剂", "试剂耗材"),
    "id": ("id", "pmid", "doi", "paper_id", "文章编号"),
}


def _key(value: Any) -> str:
    return re.sub(r"[^a-z0-9\u4e00-\u9fff]", "", str(value or "").lower())


def _value(row: dict[str, Any], field: str) -> Any:
    aliases = {_key(alias) for alias in FIELD_ALIASES[field]}
    for key, value in row.items():
        if _key(key) in aliases:
            return value
    return ""


def parse_list(value: Any) -> list[str]:
    """Parse a JSON array or a human-entered delimiter separated value."""
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    text = str(value).strip()
    if not text:
        return []
    try:
        decoded = json.loads(text)
        if isinstance(decoded, list):
            return [str(item).strip() for item in decoded if str(item).strip()]
        if isinstance(decoded, str):
            text = decoded
    except (TypeError, json.JSONDecodeError):
        pass
    return [item.strip() for item in re.split(r"[;；\n\r|]+", text) if item.strip()]


def read_rows(path: Path) -> Iterable[dict[str, Any]]:
    suffix = path.suffix.lower()
    if suffix in {".jsonl", ".ndjson"}:
        with path.open("r", encoding="utf-8-sig") as handle:
            for line_number, line in enumerate(handle, 1):
                if not line.strip():
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError as error:
                    raise ValueError(f"{path}:{line_number} 不是有效 JSON: {error}") from error
                if not isinstance(row, dict):
                    raise ValueError(f"{path}:{line_number} 必须是 JSON 对象")
                yield row
        return
    if suffix == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            yield from csv.DictReader(handle)
        return
    raise ValueError(f"不支持的输入格式 {path.suffix}，请使用 .jsonl 或 .csv")


def normalize(row: dict[str, Any], index: int) -> dict[str, Any]:
    title = str(_value(row, "title") or "").strip()
    conclusion = str(_value(row, "conclusion") or "").strip()
    methods = parse_list(_value(row, "methods"))
    reagents = parse_list(_value(row, "reagents"))
    return {
        "id": str(_value(row, "id") or f"paper-{index:06d}").strip(),
        "title": title,
        "conclusion": conclusion,
        "methods": methods,
        "reagents": reagents,
    }


def literature_axes(title: str, conclusion: str, methods: list[str]) -> list[dict[str, str]]:
    """Create transparent K1 supervision when the source has no task labels.

    These axes mirror the common IMRaD reading order.  They are scaffolding
    labels, not fabricated scientific claims; evidence is always the supplied
    conclusion or Methods text.
    """
    evidence = conclusion or "原文未提供结论，请在全文中核对。"
    method_evidence = "；".join(methods) or "原文未提供 Methods，请在全文中核对。"
    return [
        {"angle": "研究问题与对象", "question": f"这篇论文（{title or '未命名论文'}）试图解决什么研究问题？", "evidence": evidence},
        {"angle": "实验设计与方法", "question": "研究采用了哪些实验设计、样本和关键方法？", "evidence": method_evidence},
        {"angle": "主要结果与结论", "question": "主要结果支持了什么结论？", "evidence": evidence},
        {"angle": "局限性与可重复性", "question": "哪些边界条件、对照或参数需要复核？", "evidence": method_evidence},
    ]


def reagent_routes(methods: list[str], reagents: list[str]) -> list[dict[str, str]]:
    text = "；".join(methods + reagents)
    routes: list[dict[str, str]] = []
    categories = (
        ("RNA 提取", r"rna|转录组|提取|纯化"),
        ("逆转录", r"逆转录|cdna|first.?strand"),
        ("qPCR", r"qpcr|rt.?pcr|sybr|探针"),
        ("建库", r"建库|library|文库|接头"),
        ("酶与抑制剂", r"酶|enzyme|dnase|rnase|抑制剂"),
    )
    for name, pattern in categories:
        if re.search(pattern, text, re.I):
            matched = [item for item in reagents if re.search(pattern, item, re.I)]
            routes.append({"category": name, "evidence": "；".join(matched) or text[:300]})
    if not routes:
        routes.append({"category": "其他", "evidence": text[:300]})
    return routes


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> int:
    count = 0
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
            count += 1
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="JSONL/CSV 论文数据")
    parser.add_argument("--output-dir", default=Path("ml/data"), type=Path)
    parser.add_argument("--seed", default=42, type=int)
    parser.add_argument("--dev-ratio", default=0.1, type=float)
    args = parser.parse_args()
    if not 0 <= args.dev_ratio < 1:
        parser.error("--dev-ratio 必须在 [0, 1) 范围")

    records = [normalize(row, index) for index, row in enumerate(read_rows(args.input), 1)]
    records = [row for row in records if row["title"]]
    if not records:
        raise SystemExit("没有找到包含 title 的记录")
    random.Random(args.seed).shuffle(records)
    dev_size = int(len(records) * args.dev_ratio) if len(records) > 1 else 0
    dev = records[:dev_size]
    train = records[dev_size:]
    args.output_dir.mkdir(parents=True, exist_ok=True)

    def adapter1(rows: Iterable[dict[str, Any]]) -> Iterable[dict[str, Any]]:
        for row in rows:
            yield {
                "id": row["id"],
                "input": row["title"],
                "target": {"conclusion": row["conclusion"], "k1_subquestions": literature_axes(row["title"], row["conclusion"], row["methods"])},
            }

    def adapter2(rows: Iterable[dict[str, Any]]) -> Iterable[dict[str, Any]]:
        for row in rows:
            yield {
                "id": row["id"],
                "input": {"title": row["title"], "methods": row["methods"]},
                "target": {"reagents": row["reagents"], "k2_routes": reagent_routes(row["methods"], row["reagents"])},
            }

    counts = {
        "normalized_train": write_jsonl(args.output_dir / "normalized.train.jsonl", train),
        "normalized_dev": write_jsonl(args.output_dir / "normalized.dev.jsonl", dev),
        "adapter1_train": write_jsonl(args.output_dir / "adapter1.train.jsonl", adapter1(train)),
        "adapter1_dev": write_jsonl(args.output_dir / "adapter1.dev.jsonl", adapter1(dev)),
        "adapter2_train": write_jsonl(args.output_dir / "adapter2.train.jsonl", adapter2(train)),
        "adapter2_dev": write_jsonl(args.output_dir / "adapter2.dev.jsonl", adapter2(dev)),
    }
    manifest = {"source": str(args.input), "records": len(records), "train": len(train), "dev": len(dev), "fields": list(FIELD_ALIASES), "counts": counts}
    (args.output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
