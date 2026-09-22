#!/usr/bin/env python3
"""Train the two literature adapters and their K-network heads.

This is a deliberately small LoRA trainer.  It keeps the four artifacts
separate so they can be enabled independently at serving time:
``adapter1`` (title -> evidence), ``k1`` (evidence -> subquestions),
``adapter2`` (title + Methods -> reagent mentions), and ``k2`` (mentions ->
reagent categories).  Use ``--dry-run`` on a CPU-only machine to validate the
dataset and print the planned jobs without importing ML libraries.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path
from typing import Any


JOBS = ("adapter1", "k1", "adapter2", "k2")


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"{path}:{line_number} 不是有效 JSON") from error
            if isinstance(value, dict):
                rows.append(value)
    return rows


def dependencies_available() -> tuple[bool, list[str]]:
    required = ("torch", "transformers", "peft", "datasets", "accelerate")
    missing = [name for name in required if importlib.util.find_spec(name) is None]
    return not missing, missing


def prompt_for(job: str, row: dict[str, Any]) -> str:
    if job in {"adapter1", "k1"}:
        source = row.get("input", "")
        target = row.get("target", {})
        if job == "k1":
            source = {"title": source, "evidence": target.get("conclusion", "")}
            target = target.get("k1_subquestions", [])
    else:
        source = row.get("input", {})
        target = row.get("target", {})
        if job == "k2":
            source = {"title": source.get("title", ""), "methods": source.get("methods", []), "reagents": target.get("reagents", [])}
            target = target.get("k2_routes", [])
    return "任务: " + job + "\n输入: " + json.dumps(source, ensure_ascii=False) + "\n输出: " + json.dumps(target, ensure_ascii=False)


def dry_run(args: argparse.Namespace) -> int:
    data_dir = Path(args.data_dir)
    counts = {}
    for job in JOBS:
        rows = load_jsonl(data_dir / f"{job}.train.jsonl")
        counts[job] = len(rows)
    ok, missing = dependencies_available()
    summary = {"mode": "dry-run", "base_model": args.base_model, "data_dir": str(data_dir), "output_dir": str(args.output_dir), "counts": counts, "ml_dependencies_ready": ok, "missing_dependencies": missing}
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if not any(counts.values()):
        print("提示: 没有训练记录，请先运行 prepare_dataset.py。")
    return 0


def train_job(job: str, args: argparse.Namespace) -> None:
    # Imports stay local so --dry-run remains usable in a plain Python image.
    from datasets import Dataset
    from peft import LoraConfig, TaskType, get_peft_model
    from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments

    rows = load_jsonl(Path(args.data_dir) / f"{job}.train.jsonl")
    if not rows:
        raise ValueError(f"找不到 {job}.train.jsonl")
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=args.trust_remote_code)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(args.base_model, trust_remote_code=args.trust_remote_code)
    model = get_peft_model(model, LoraConfig(task_type=TaskType.CAUSAL_LM, r=args.lora_rank, lora_alpha=args.lora_alpha, lora_dropout=args.lora_dropout, target_modules=args.target_modules.split(",") if args.target_modules else None))
    dataset = Dataset.from_list([{"text": prompt_for(job, row)} for row in rows])

    def tokenize(batch: dict[str, list[str]]) -> dict[str, Any]:
        return tokenizer(batch["text"], truncation=True, max_length=args.max_length, padding="max_length")

    tokenized = dataset.map(tokenize, batched=True, remove_columns=["text"])
    output = Path(args.output_dir) / job
    output.mkdir(parents=True, exist_ok=True)
    training = TrainingArguments(output_dir=str(output), num_train_epochs=args.epochs, per_device_train_batch_size=args.batch_size, gradient_accumulation_steps=args.gradient_accumulation, learning_rate=args.learning_rate, logging_steps=max(1, args.logging_steps), save_strategy="epoch", report_to=[])
    Trainer(model=model, args=training, train_dataset=tokenized, data_collator=None).train()
    model.save_pretrained(output)
    tokenizer.save_pretrained(output)
    print(f"完成 {job}: {output}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", default="ml/data")
    parser.add_argument("--output-dir", default="ml/artifacts")
    parser.add_argument("--base-model", default=os.getenv("BASE_MODEL", "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B"))
    parser.add_argument("--jobs", nargs="+", choices=JOBS, default=list(JOBS))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--trust-remote-code", action="store_true")
    parser.add_argument("--epochs", type=float, default=2)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--gradient-accumulation", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--max-length", type=int, default=2048)
    parser.add_argument("--logging-steps", type=int, default=10)
    parser.add_argument("--lora-rank", type=int, default=16)
    parser.add_argument("--lora-alpha", type=int, default=32)
    parser.add_argument("--lora-dropout", type=float, default=0.05)
    parser.add_argument("--target-modules", default="q_proj,k_proj,v_proj,o_proj")
    args = parser.parse_args()
    if args.dry_run:
        return dry_run(args)
    ok, missing = dependencies_available()
    if not ok:
        raise SystemExit("缺少训练依赖: " + ", ".join(missing) + "。可先使用 --dry-run，或 pip install -r ml/requirements.txt")
    for job in args.jobs:
        train_job(job, args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
