"""Train frozen-DeepSeek -> residual Adapter1/K1 and Adapter2/K2.

Adapter1 features are TITLE ONLY; conclusion embeddings are detached targets.
K1 learns attention slots against conclusion reconstruction/cosine loss and,
when supplied, reviewed section-specific subquestion embeddings. Conclusion
supervision alone cannot identify good questions or establish section accuracy.
Adapter2 reads title + Methods; K2 optimizes multi-label BCE and contrastive
positive candidate mass. Reagent annotations must be exhaustive for BCE.

No synthetic scientific examples are created. --dry-run validates real input
and a paper-level holdout without loading the model or writing a checkpoint.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import torch
from torch import Tensor

try:
    from .data_utils import paper_key, paper_split, read_jsonl
    from .networks import FrozenHiddenEncoder, ResearchNetworks
    from .prompts import SECTION_ROUTES, text_value, training_pair
except ImportError:
    from data_utils import paper_key, paper_split, read_jsonl
    from networks import FrozenHiddenEncoder, ResearchNetworks
    from prompts import SECTION_ROUTES, text_value, training_pair


def normal(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().casefold()


def reagent_name(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("reagent_id") or value.get("id") or value.get("sku") or value.get("name") or "").strip()
    return str(value).strip()


def reagent_labels(row: dict[str, Any]) -> list[str]:
    values = row.get("requirements", row.get("reagents", []))
    if not isinstance(values, list):
        raise ValueError("reagents/requirements must be a list of names or annotated objects")
    labels = [reagent_name(value) for value in values]
    if not labels or any(not value for value in labels):
        raise ValueError("each routing paper needs nonempty reagent labels")
    return list(dict.fromkeys(labels))


def build_catalog(train_rows: list[dict[str, Any]], path: str | None) -> list[dict[str, str]]:
    if path:
        candidate_path = Path(path)
        raw = json.loads(candidate_path.read_text(encoding="utf-8-sig")) if candidate_path.suffix == ".json" else read_jsonl(path)
        if not isinstance(raw, list):
            raise ValueError("catalog must be a JSON array or JSONL objects")
    else:
        names = sorted({label for row in train_rows for label in reagent_labels(row)}, key=normal)
        raw = [{"id": name, "name": name} for name in names]
    catalog = []
    seen = set()
    for value in raw:
        if isinstance(value, str):
            value = {"id": value, "name": value}
        key = reagent_name(value)
        if not key or normal(key) in seen:
            raise ValueError("catalog IDs must be present and unique")
        seen.add(normal(key))
        name = str(value.get("name") or key)
        text = " ".join(text_value(value.get(field)) for field in ("name", "brand", "category", "role", "tags")).strip() or name
        catalog.append({"id": key, "name": name, "text": text})
    if train_rows and len(catalog) < 2:
        raise ValueError("K2 requires at least two candidate reagents, including negatives")
    return catalog


def catalog_index(catalog: list[dict[str, str]]) -> dict[str, int]:
    index: dict[str, int] = {}
    for position, entry in enumerate(catalog):
        for key in (entry["id"], entry["name"]):
            alias = normal(key)
            if alias in index and index[alias] != position:
                raise ValueError(f"ambiguous reagent alias: {key}; use unique catalog IDs")
            index[alias] = position
    return index


def label_tensor(rows: list[dict[str, Any]], catalog: list[dict[str, str]], device: str) -> Tensor:
    lookup = catalog_index(catalog)
    target = torch.zeros(len(rows), len(catalog), device=device)
    for row_index, row in enumerate(rows):
        for name in reagent_labels(row):
            if normal(name) not in lookup:
                raise ValueError(f"reagent absent from catalog: {name}")
            target[row_index, lookup[normal(name)]] = 1
    return target


def reviewed_targets(rows: list[dict[str, Any]], encoder: FrozenHiddenEncoder, slots: int) -> tuple[Tensor | None, Tensor | None]:
    values, locations = [], []
    for index, row in enumerate(rows):
        # Explicitly reviewed labels only; generated examples must not be passed here.
        if not row.get("subquestions_reviewed", False):
            continue
        used = set()
        for item in row.get("subquestions", []):
            if not isinstance(item, dict) or not item.get("question"):
                continue
            route = item.get("route") or item.get("section")
            if route not in SECTION_ROUTES:
                raise ValueError("reviewed subquestions need a canonical literature route")
            slot = SECTION_ROUTES.index(route)
            if slot >= slots or slot in used:
                continue
            used.add(slot)
            locations.append((index, slot))
            values.append(str(item["question"]))
    if not values:
        return None, None
    embeddings = encoder.embed(values)
    targets = embeddings.new_zeros((len(rows), slots, encoder.hidden_size))
    mask = embeddings.new_zeros((len(rows), slots))
    for index, (row, slot) in enumerate(locations):
        targets[row, slot] = embeddings[index]
        mask[row, slot] = 1
    return targets, mask


def batch_loss(stage: str, rows: list[dict[str, Any]], network: ResearchNetworks, encoder: FrozenHiddenEncoder, candidates: Tensor, catalog: list[dict[str, str]]) -> Tensor:
    if stage == "adapter1":
        # Deliberate title-only boundary: no conclusion, methods or reagent labels.
        hidden, mask = encoder.encode([str(row["title"]) for row in rows])
        conclusions = encoder.embed([str(row["conclusion"]) for row in rows])
        targets, reviewed_mask = reviewed_targets(rows, encoder, network.k1.slots.size(0))
        _, loss = network.forward_k1(hidden, conclusions, mask, targets, reviewed_mask)
        return loss
    texts = [f"Title: {row['title']}\nMethods: {text_value(row['methods'])}" for row in rows]
    hidden, mask = encoder.encode(texts)
    labels = label_tensor(rows, catalog, encoder.device)
    _, loss = network.forward_k2(hidden, candidates, labels, source_mask=mask)
    return loss


def chunks(rows: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
    return [rows[index:index + size] for index in range(0, len(rows), size)]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adapter1-data")
    parser.add_argument("--adapter2-data")
    parser.add_argument("--catalog", help="optional fixed JSON/JSONL reagent catalog, independent of validation labels")
    parser.add_argument("--model", required=True, help="local DeepSeek model directory")
    parser.add_argument("--output", required=True)
    parser.add_argument("--allow-download", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--max-length", type=int, default=1024)
    parser.add_argument("--bottleneck", type=int, default=256)
    parser.add_argument("--slots", type=int, default=5, choices=range(1, 6))
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--val-ratio", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    args = parser.parse_args()
    if args.epochs < 1 or args.batch_size < 1 or args.max_length < 8 or args.bottleneck < 1 or args.lr <= 0:
        parser.error("epochs, batch-size, bottleneck and lr must be positive; max-length must be at least 8")
    sources = {"adapter1": args.adapter1_data, "adapter2": args.adapter2_data}
    stages = {stage: read_jsonl(path) for stage, path in sources.items() if path}
    if not stages:
        parser.error("provide --adapter1-data and/or --adapter2-data containing real paper annotations")
    all_rows = []
    for stage, rows in stages.items():
        for row in rows:
            training_pair(row, stage)
            if stage == "adapter2":
                reagent_labels(row)
        all_rows.extend(rows)
    _, _, split = paper_split(all_rows, args.val_ratio, args.seed)
    training_keys = set(split["train_paper_ids"])
    train = {stage: [row for row in rows if paper_key(row) in training_keys] for stage, rows in stages.items()}
    validation = {stage: [row for row in rows if paper_key(row) not in training_keys] for stage, rows in stages.items()}
    for stage in stages:
        if not train[stage] or not validation[stage]:
            raise ValueError(f"{stage}: global paper split must leave both train and validation examples; add papers or adjust split")
    catalog = build_catalog(train.get("adapter2", []), args.catalog) if "adapter2" in stages else []
    unknown_validation = []
    if catalog:
        lookup = catalog_index(catalog)
        # Validate all training labels, never silently omit unmatched positives.
        label_tensor(train["adapter2"], catalog, "cpu")
        retained = []
        for row in validation["adapter2"]:
            absent = [label for label in reagent_labels(row) if normal(label) not in lookup]
            if absent:
                unknown_validation.append({"paper": paper_key(row), "unknown_labels": absent})
            else:
                retained.append(row)
        validation["adapter2"] = retained
        if not retained:
            raise ValueError("no validation routing papers are fully covered by the catalog; supply an independent catalog")
    manifest: dict[str, Any] = {
        "status": "validated_not_trained", "format_version": 1,
        "architecture": "frozen_deepseek_residual_adapters_attention_k1_candidate_k2",
        "base_model": args.model, "created_at": datetime.now(timezone.utc).isoformat(),
        "source_sha256": {stage: hashlib.sha256(Path(path).read_bytes()).hexdigest() for stage, path in sources.items() if path},
        "split": split, "counts": {stage: {"input": len(stages[stage]), "train": len(train[stage]), "validation": len(validation[stage]), "reviewed_subquestion_rows": sum(bool(row.get("subquestions_reviewed")) for row in stages[stage])} for stage in stages},
        "uncovered_validation_reagents": unknown_validation,
        "catalog_size": len(catalog), "adapter1_input": "title_only", "adapter2_input": "title_and_methods",
        "target_embedding": "frozen encoder masked mean, L2 normalized",
        "losses": {"k1": "cosine + normalized reconstruction MSE + optional reviewed section target cosine", "k2": "multi-label BCE + 0.1 * positive-mass contrastive"},
        "limitation": "Conclusion-only supervision does not identify good subquestions or prove literature-section correctness. Reviewed section-specific questions and a human evaluation are required. K2 BCE assumes complete positive labels; catalog-missing validation papers are excluded and counted.",
        "config": {key: getattr(args, key) for key in ("epochs", "batch_size", "max_length", "bottleneck", "slots", "lr", "seed")},
        "metrics": [],
    }
    if args.dry_run:
        print(json.dumps(manifest, ensure_ascii=False, indent=2))
        return
    output = Path(args.output)
    if (output / "manifest.json").exists():
        raise ValueError("output already contains a manifest; use a new run directory")
    random.seed(args.seed)
    torch.manual_seed(args.seed)
    encoder = FrozenHiddenEncoder(args.model, args.device, args.max_length, args.allow_download)
    network = ResearchNetworks(encoder.hidden_size, args.slots, args.bottleneck).to(args.device)
    candidates = torch.cat([encoder.embed([item["text"] for item in batch]) for batch in chunks(catalog, args.batch_size)], dim=0) if catalog else torch.empty(0, encoder.hidden_size, device=args.device)
    optimizer = torch.optim.AdamW(network.parameters(), lr=args.lr, weight_decay=0.01)
    output.mkdir(parents=True, exist_ok=True)
    manifest["hidden_size"] = encoder.hidden_size
    best_loss = math.inf
    for epoch in range(args.epochs):
        network.train()
        tasks = [(stage, batch) for stage, rows in train.items() for batch in chunks(rows, args.batch_size)]
        random.shuffle(tasks)
        train_totals = {stage: [0.0, 0] for stage in stages}
        for stage, batch in tasks:
            optimizer.zero_grad(set_to_none=True)
            loss = batch_loss(stage, batch, network, encoder, candidates, catalog)
            if not torch.isfinite(loss):
                raise RuntimeError("nonfinite training loss; no completed checkpoint will be published")
            loss.backward()
            torch.nn.utils.clip_grad_norm_(network.parameters(), 1.0)
            optimizer.step()
            train_totals[stage][0] += float(loss.detach()) * len(batch)
            train_totals[stage][1] += len(batch)
        network.eval()
        val_losses = {}
        with torch.no_grad():
            for stage, rows in validation.items():
                total = sum(float(batch_loss(stage, batch, network, encoder, candidates, catalog)) * len(batch) for batch in chunks(rows, args.batch_size))
                val_losses[stage] = total / len(rows)
        score = sum(val_losses.values()) / len(val_losses)
        if not math.isfinite(score):
            raise RuntimeError("nonfinite validation loss")
        metrics = {"epoch": epoch + 1, "train_loss": {stage: total / count for stage, (total, count) in train_totals.items()}, "validation_loss": val_losses, "validation_mean": score}
        manifest["metrics"].append(metrics)
        if score < best_loss:
            best_loss = score
            manifest["selected_epoch"] = epoch + 1
            torch.save({"format_version": 1, "hidden_size": encoder.hidden_size, "slots": args.slots, "bottleneck": args.bottleneck, "state_dict": {key: value.detach().cpu() for key, value in network.state_dict().items()}}, output / "networks.pt")
        print(json.dumps(metrics))
    manifest["status"] = "trained"
    manifest["trained_components"] = [name for stage in stages for name in (("adapter1", "k1") if stage == "adapter1" else ("adapter2", "k2"))]
    manifest["selected_validation_loss"] = best_loss
    manifest["checkpoint_sha256"] = hashlib.sha256((output / "networks.pt").read_bytes()).hexdigest()
    (output / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    # The manifest is the final commit marker: incomplete runs are not deployable.
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
