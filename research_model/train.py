"""Train Adapter1 or Adapter2 with LoRA on JSONL supervision.

Examples:
  python train.py --stage adapter1 --data data/adapter1.jsonl --output adapters/adapter1
  python train.py --stage adapter2 --data data/adapter2.jsonl --output adapters/adapter2

Adapter1 rows: {"title", "conclusion", "subquestions": [...]}
Adapter2 rows: {"title", "methods", "requirements": [...]}
The loss is computed on the JSON target only; prompt tokens are masked.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch
from torch.utils.data import DataLoader, Dataset, Subset
try:
    from .data_utils import paper_split, read_jsonl
    from .prompts import render_prompt, training_pair
except ImportError:
    from data_utils import paper_split, read_jsonl
    from prompts import render_prompt, training_pair


class JsonlDataset(Dataset):
    def __init__(self, path: str, stage: str, tokenizer: Any, max_length: int):
        self.rows = read_jsonl(path)
        if len(self.rows) < 2:
            raise ValueError("dataset must contain at least two JSONL rows")
        self.stage, self.tokenizer, self.max_length = stage, tokenizer, max_length
        for row in self.rows:
            training_pair(row, stage)

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, index: int) -> dict[str, list[int]]:
        row = self.rows[index]
        messages, target = training_pair(row, self.stage)
        prompt = render_prompt(self.tokenizer, messages)
        prompt_ids = self.tokenizer(prompt, add_special_tokens=False)["input_ids"]
        remaining = self.max_length - len(prompt_ids)
        if remaining < 1:
            raise ValueError(f"paper row {index + 1} prompt exceeds max_length={self.max_length}; increase it or curate the title")
        target_ids = self.tokenizer(target + (self.tokenizer.eos_token or ""), add_special_tokens=False)["input_ids"]
        if len(prompt_ids) + len(target_ids) > self.max_length:
            raise ValueError(f"paper row {index + 1} exceeds max_length={self.max_length}; increase it or curate the evidence, do not silently truncate supervision")
        ids = (prompt_ids + target_ids)[: self.max_length]
        labels = ([-100] * len(prompt_ids) + target_ids)[: self.max_length]
        return {"input_ids": ids, "labels": labels, "attention_mask": [1] * len(ids)}


@dataclass
class Collator:
    pad_id: int

    def __call__(self, rows: list[dict[str, list[int]]]) -> dict[str, torch.Tensor]:
        width = max(len(row["input_ids"]) for row in rows)
        return {
            key: torch.tensor([row[key] + ([self.pad_id] if key == "input_ids" else [0] if key == "attention_mask" else [-100]) * (width - len(row[key])) for row in rows], dtype=torch.long)
            for key in ("input_ids", "labels", "attention_mask")
        }


def main() -> None:
    from peft import LoraConfig, get_peft_model
    from transformers import AutoModelForCausalLM, AutoTokenizer, get_cosine_schedule_with_warmup
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", choices=("adapter1", "adapter2"), required=True)
    parser.add_argument("--data", required=True)
    parser.add_argument("--model", default=os.getenv("BASE_MODEL", "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B"))
    parser.add_argument("--output", required=True)
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--grad-accum", type=int, default=8)
    parser.add_argument("--max-length", type=int, default=1024)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--val-ratio", type=float, default=0.02)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    if args.epochs < 1 or args.batch_size < 1 or args.grad_accum < 1:
        parser.error("epochs, batch-size and grad-accum must be positive")
    random.seed(args.seed)
    torch.manual_seed(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.bfloat16 if device == "cuda" and torch.cuda.is_bf16_supported() else (torch.float16 if device == "cuda" else torch.float32)
    tokenizer = AutoTokenizer.from_pretrained(args.model, use_fast=True)
    tokenizer.pad_token = tokenizer.pad_token or tokenizer.eos_token
    dataset = JsonlDataset(args.data, args.stage, tokenizer, args.max_length)
    train_indices, val_indices, split = paper_split(dataset.rows, args.val_ratio, args.seed)
    train_set, val_set = Subset(dataset, train_indices), Subset(dataset, val_indices)
    # Validate token length before loading the large model.
    for index in range(len(dataset)):
        dataset[index]
    model = AutoModelForCausalLM.from_pretrained(args.model, torch_dtype=dtype, device_map="auto" if device == "cuda" else None)
    model.config.use_cache = False
    model.gradient_checkpointing_enable()
    model = get_peft_model(model, LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, target_modules=["q_proj", "k_proj", "v_proj", "o_proj"], task_type="CAUSAL_LM"))
    model.print_trainable_parameters()
    loader = DataLoader(train_set, batch_size=args.batch_size, shuffle=True, collate_fn=Collator(tokenizer.pad_token_id))
    val_loader = DataLoader(val_set, batch_size=args.batch_size, shuffle=False, collate_fn=Collator(tokenizer.pad_token_id))
    optimizer = torch.optim.AdamW((parameter for parameter in model.parameters() if parameter.requires_grad), lr=args.lr, weight_decay=0.01)
    steps = math.ceil(len(loader) / args.grad_accum) * args.epochs
    scheduler = get_cosine_schedule_with_warmup(optimizer, max(1, steps // 20), steps)
    log_rows: list[dict[str, float]] = []
    step = 0
    for epoch in range(args.epochs):
        model.train(); optimizer.zero_grad(set_to_none=True)
        for batch_index, batch in enumerate(loader):
            batch = {key: value.to(model.device) for key, value in batch.items()}
            group_start = (batch_index // args.grad_accum) * args.grad_accum
            group_size = min(args.grad_accum, len(loader) - group_start)
            loss = model(**batch).loss / group_size
            loss.backward()
            if (batch_index + 1) % args.grad_accum == 0 or batch_index + 1 == len(loader):
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                optimizer.step(); scheduler.step(); optimizer.zero_grad(set_to_none=True); step += 1
        model.eval(); losses = []
        with torch.no_grad():
            for batch in val_loader:
                batch = {key: value.to(model.device) for key, value in batch.items()}
                losses.append(float(model(**batch).loss.detach().cpu()))
        metrics = {"epoch": epoch + 1, "train_steps": step, "val_loss": sum(losses) / max(1, len(losses))}
        log_rows.append(metrics); print(json.dumps(metrics))
    output = Path(args.output); output.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(output); tokenizer.save_pretrained(output)
    manifest = {"status": "trained", "architecture": "lora_causal_lm", "stage": args.stage, "base_model": args.model, "rows": len(dataset), "split": split, "metrics": log_rows, "adapter1_input": "title_only", "loss": "causal cross entropy on conclusion and optional supplied subquestions; prompt labels masked", "limitation": "Conclusion-only supervision does not identify high-quality subquestion decomposition; reviewed subquestions and a held-out question-quality evaluation are needed."}
    (output / "training_metrics.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
