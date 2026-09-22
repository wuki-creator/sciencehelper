"""Paper-level data validation and reproducible holdout partitions."""
from __future__ import annotations

import hashlib
import json
import random
import re
from pathlib import Path
from typing import Any


def read_jsonl(path: str) -> list[dict[str, Any]]:
    rows = []
    with Path(path).open(encoding="utf-8-sig") as handle:
        for index, line in enumerate(handle, 1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError(f"{path}:{index}: expected a JSON object")
            rows.append(value)
    if not rows:
        raise ValueError(f"{path}: no paper records")
    return rows


def paper_key(row: dict[str, Any]) -> str:
    # Group duplicate titles even when exports disagree on DOI/paper identifiers.
    title = re.sub(r"\s+", " ", str(row.get("title") or "")).strip().casefold()
    if not title:
        raise ValueError("paper title is required")
    return hashlib.sha256(title.encode("utf-8")).hexdigest()[:20]


def paper_split(rows: list[dict[str, Any]], val_ratio: float, seed: int) -> tuple[list[int], list[int], dict[str, Any]]:
    if not 0 < val_ratio < 1:
        raise ValueError("val_ratio must be strictly between zero and one")
    keys = sorted({paper_key(row) for row in rows})
    if len(keys) < 2:
        raise ValueError("at least two distinct papers are required for a held-out validation set")
    random.Random(seed).shuffle(keys)
    val_count = min(len(keys) - 1, max(1, int(len(keys) * val_ratio)))
    validation = set(keys[:val_count])
    train = [index for index, row in enumerate(rows) if paper_key(row) not in validation]
    val = [index for index, row in enumerate(rows) if paper_key(row) in validation]
    manifest = {"seed": seed, "val_ratio": val_ratio, "unit": "normalized_title_sha256", "unique_papers": len(keys), "train_rows": len(train), "validation_rows": len(val), "train_paper_ids": sorted(set(keys) - validation), "validation_paper_ids": sorted(validation)}
    return train, val, manifest
