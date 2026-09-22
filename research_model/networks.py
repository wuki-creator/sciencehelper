"""Differentiable residual adapters and K1/K2 routing heads.

These modules operate on frozen DeepSeek hidden states. They are intentionally
backbone agnostic and can be unit-tested with tiny tensors before a real model
is downloaded.
"""
from __future__ import annotations

import torch
from torch import Tensor, nn
import torch.nn.functional as F


class FrozenHiddenEncoder:
    """Frozen local DeepSeek encoder. Never part of the adapter optimizer."""
    def __init__(self, model_path: str, device: str = "cpu", max_length: int = 1024, allow_download: bool = False) -> None:
        from transformers import AutoModel, AutoTokenizer
        self.tokenizer = AutoTokenizer.from_pretrained(model_path, local_files_only=not allow_download)
        if self.tokenizer.pad_token_id is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
        dtype = torch.bfloat16 if device.startswith("cuda") and torch.cuda.is_bf16_supported() else torch.float32
        self.model = AutoModel.from_pretrained(model_path, local_files_only=not allow_download, torch_dtype=dtype).to(device)
        self.model.requires_grad_(False)
        self.model.eval()
        self.device, self.max_length = device, max_length
        self.hidden_size = int(self.model.config.hidden_size)

    @torch.no_grad()
    def encode(self, texts: list[str]) -> tuple[Tensor, Tensor]:
        self.model.eval()
        tokens = self.tokenizer(texts, padding=True, truncation=True, max_length=self.max_length, return_tensors="pt")
        tokens = {key: value.to(self.device) for key, value in tokens.items()}
        hidden = self.model(**tokens).last_hidden_state.float().detach()
        return hidden, tokens["attention_mask"]

    @torch.no_grad()
    def embed(self, texts: list[str]) -> Tensor:
        hidden, mask = self.encode(texts)
        return F.normalize(masked_mean(hidden, mask), dim=-1)


def masked_mean(hidden: Tensor, mask: Tensor | None = None) -> Tensor:
    if mask is None:
        return hidden.mean(dim=1)
    weight = mask.to(hidden.dtype).unsqueeze(-1)
    return (hidden * weight).sum(dim=1) / weight.sum(dim=1).clamp_min(1)


class ResidualAdapter(nn.Module):
    def __init__(self, hidden_size: int, bottleneck: int = 256, dropout: float = 0.1) -> None:
        super().__init__()
        self.norm = nn.LayerNorm(hidden_size)
        self.down = nn.Linear(hidden_size, bottleneck)
        self.up = nn.Linear(bottleneck, hidden_size)
        self.dropout = nn.Dropout(dropout)
        nn.init.zeros_(self.up.weight)
        nn.init.zeros_(self.up.bias)

    def forward(self, hidden: Tensor) -> Tensor:
        return hidden + self.dropout(self.up(F.gelu(self.down(self.norm(hidden)))))


class K1AttentionSlots(nn.Module):
    """Pool Adapter1 states into literature section slots."""
    def __init__(self, hidden_size: int, slots: int = 5) -> None:
        super().__init__()
        self.slots = nn.Parameter(torch.randn(slots, hidden_size) * 0.02)
        self.query = nn.Linear(hidden_size, hidden_size, bias=False)
        self.key = nn.Linear(hidden_size, hidden_size, bias=False)
        self.value = nn.Linear(hidden_size, hidden_size, bias=False)
        self.norm = nn.LayerNorm(hidden_size)

    def forward(self, hidden: Tensor, mask: Tensor | None = None) -> Tensor:
        # hidden [B,T,H], output [B,S,H]
        q = self.query(self.slots).unsqueeze(0).expand(hidden.size(0), -1, -1)
        k, v = self.key(hidden), self.value(hidden)
        scores = torch.matmul(q, k.transpose(-1, -2)) / hidden.size(-1) ** 0.5
        if mask is not None:
            scores = scores.masked_fill(~mask.bool().unsqueeze(1), torch.finfo(scores.dtype).min)
        weights = scores.softmax(dim=-1)
        return self.norm(torch.matmul(weights, v) + self.slots.unsqueeze(0))


class K2ReagentRouter(nn.Module):
    """Encode Methods and score a candidate reagent catalog."""
    def __init__(self, hidden_size: int, temperature: float = 0.07) -> None:
        super().__init__()
        self.temperature = nn.Parameter(torch.tensor(temperature).log())
        self.query = nn.Linear(hidden_size, hidden_size)
        self.candidate = nn.Linear(hidden_size, hidden_size, bias=False)

    def forward(self, methods: Tensor, candidates: Tensor, mask: Tensor | None = None, source_mask: Tensor | None = None) -> Tensor:
        query = F.normalize(self.query(masked_mean(methods, source_mask)), dim=-1)
        reagent = F.normalize(self.candidate(candidates), dim=-1)
        logits = query @ reagent.transpose(-1, -2) / self.temperature.exp().clamp_min(1e-3)
        if mask is not None:
            logits = logits.masked_fill(~mask.bool(), torch.finfo(logits.dtype).min)
        return logits


class ResearchNetworks(nn.Module):
    def __init__(self, hidden_size: int, slots: int = 5, bottleneck: int = 256) -> None:
        super().__init__()
        self.adapter1 = ResidualAdapter(hidden_size, bottleneck)
        self.k1 = K1AttentionSlots(hidden_size, slots)
        self.adapter2 = ResidualAdapter(hidden_size, bottleneck)
        self.k2 = K2ReagentRouter(hidden_size)

    def forward_k1(self, title_hidden: Tensor, conclusion_embedding: Tensor | None = None, mask: Tensor | None = None, reviewed_embeddings: Tensor | None = None, reviewed_mask: Tensor | None = None) -> tuple[Tensor, Tensor]:
        slots = self.k1(self.adapter1(title_hidden), mask)
        pooled = F.normalize(slots.mean(dim=1), dim=-1)
        if conclusion_embedding is None:
            loss = pooled.new_zeros(())
        else:
            target = F.normalize(conclusion_embedding, dim=-1)
            loss = (1 - F.cosine_similarity(pooled, target, dim=-1)).mean()
            loss = loss + F.mse_loss(pooled, target)
        if reviewed_embeddings is not None:
            if reviewed_mask is None:
                raise ValueError("reviewed_mask is required with reviewed_embeddings")
            distance = 1 - F.cosine_similarity(slots, reviewed_embeddings, dim=-1)
            loss = loss + (distance * reviewed_mask).sum() / reviewed_mask.sum().clamp_min(1)
        return slots, loss

    def forward_k2(self, methods_hidden: Tensor, candidate_hidden: Tensor, labels: Tensor | None = None, mask: Tensor | None = None, source_mask: Tensor | None = None) -> tuple[Tensor, Tensor]:
        logits = self.k2(self.adapter2(methods_hidden), candidate_hidden, mask, source_mask)
        if labels is None:
            loss = logits.new_zeros(())
        else:
            if (labels.sum(dim=-1) == 0).any():
                raise ValueError("K2 training needs at least one labeled positive candidate per paper")
            loss = F.binary_cross_entropy_with_logits(logits, labels.float())
            positives = logits.masked_fill(~labels.bool(), torch.finfo(logits.dtype).min)
            # Probability mass of all positive candidates; supports multi-label papers.
            contrastive = (torch.logsumexp(logits, dim=-1) - torch.logsumexp(positives, dim=-1)).mean()
            loss = loss + 0.1 * contrastive
        return logits, loss
