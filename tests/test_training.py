"""Software-only tensor/fixture tests; these are not paper-corpus training."""
from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import torch
import torch.nn.functional as F

from research_model.data_utils import paper_key, paper_split
from research_model.networks import ResearchNetworks
from research_model.prompts import render_prompt, training_pair
from research_model.train import JsonlDataset
from research_model.train_networks import batch_loss, build_catalog, label_tensor, reviewed_targets


class CharacterTokenizer:
    chat_template = None
    eos_token = "\x03"
    def __call__(self, text: str, **kwargs):
        return {"input_ids": [ord(character) for character in text]}


class FrozenFixtureEncoder:
    """Small deterministic frozen encoder used only to test the training graph."""
    def __init__(self):
        self.hidden_size, self.device = 8, "cpu"
        self.embedding = torch.nn.Embedding(256, self.hidden_size)
        self.embedding.requires_grad_(False)
        self.input_calls = []
        self.target_calls = []

    def encode(self, texts):
        self.input_calls.append(texts)
        ids = [[ord(character) % 256 for character in text] for text in texts]
        width = max(map(len, ids))
        mask = torch.tensor([[1] * len(row) + [0] * (width - len(row)) for row in ids])
        tokens = torch.tensor([row + [0] * (width - len(row)) for row in ids])
        return self.embedding(tokens).detach(), mask

    def embed(self, texts):
        self.target_calls.append(texts)
        vectors = []
        for text in texts:
            ids = torch.tensor([ord(character) % 256 for character in text])
            vectors.append(self.embedding(ids).mean(dim=0).detach())
        return F.normalize(torch.stack(vectors), dim=-1)


class TrainingTests(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(23)
        torch.set_num_threads(1)

    def test_adapter1_conclusion_is_target_only(self):
        row = {"title": "UNIT FIXTURE TITLE", "conclusion": "SECRET TARGET EVIDENCE"}
        messages, target = training_pair(row, "adapter1")
        prompt = render_prompt(CharacterTokenizer(), messages)
        self.assertNotIn(row["conclusion"], prompt)
        self.assertEqual(messages[-1]["content"], "标题：UNIT FIXTURE TITLE")
        self.assertEqual(json.loads(target)["conclusion"], row["conclusion"])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "rows.jsonl"
            path.write_text(json.dumps(row) + "\n" + json.dumps({**row, "title": "OTHER FIXTURE"}), encoding="utf-8")
            dataset = JsonlDataset(str(path), "adapter1", CharacterTokenizer(), 2000)
            encoded = dataset[0]
            boundary = encoded["labels"].index(next(value for value in encoded["labels"] if value != -100))
            prompt_text = "".join(chr(value) for value in encoded["input_ids"][:boundary])
            target_text = "".join(chr(value) for value in encoded["labels"][boundary:])
            self.assertNotIn(row["conclusion"], prompt_text)
            self.assertIn(row["conclusion"], target_text)
            self.assertTrue(all(value == -100 for value in encoded["labels"][:boundary]))

    def test_paper_level_holdout_groups_duplicate_titles(self):
        rows = [{"title": " Duplicate  Title "}, {"title": "duplicate title"}, {"title": "other fixture"}, {"title": "third fixture"}]
        train, val, split = paper_split(rows, 0.4, 7)
        self.assertEqual(paper_key(rows[0]), paper_key(rows[1]))
        self.assertEqual(0 in train, 1 in train)
        self.assertFalse({paper_key(rows[index]) for index in train} & {paper_key(rows[index]) for index in val})
        self.assertEqual(split["unique_papers"], 3)

    def test_gradients_cross_both_adapters_and_k_heads(self):
        encoder = FrozenFixtureEncoder()
        network = ResearchNetworks(8, 5, 4)
        initial = {name: tensor.detach().clone() for name, tensor in network.named_parameters()}
        a1 = [{"title": "fixture one", "conclusion": "target one"}, {"title": "fixture two", "conclusion": "target two"}]
        a2 = [{"title": "fixture one", "methods": "method one", "reagents": ["A"]}, {"title": "fixture two", "methods": "method two", "reagents": ["B"]}]
        catalog = build_catalog(a2, None)
        candidates = encoder.embed([row["text"] for row in catalog])
        optimizer = torch.optim.AdamW(network.parameters(), lr=0.01)
        # The first zero-initialized up projection gets a gradient; the second
        # step also propagates into the down projection.
        for _ in range(2):
            optimizer.zero_grad(set_to_none=True)
            loss = batch_loss("adapter1", a1, network, encoder, candidates, catalog) + batch_loss("adapter2", a2, network, encoder, candidates, catalog)
            self.assertTrue(torch.isfinite(loss))
            loss.backward()
            for name in ("adapter1.up.weight", "adapter2.up.weight", "k1.value.weight", "k1.slots", "k2.query.weight", "k2.candidate.weight"):
                grad = dict(network.named_parameters())[name].grad
                self.assertIsNotNone(grad, name)
                self.assertGreater(float(grad.abs().sum()), 0, name)
            optimizer.step()
        for name in ("adapter1.down.weight", "adapter1.up.weight", "adapter2.down.weight", "adapter2.up.weight", "k1.key.weight", "k2.query.weight"):
            self.assertFalse(torch.equal(initial[name], dict(network.named_parameters())[name]), name)
        self.assertIsNone(encoder.embedding.weight.grad)
        self.assertFalse(encoder.embedding.weight.requires_grad)
        self.assertEqual(encoder.input_calls[0], ["fixture one", "fixture two"])
        self.assertEqual(encoder.target_calls[1], ["target one", "target two"])

    def test_padding_is_excluded_from_both_networks(self):
        network = ResearchNetworks(8, 5, 4).eval()
        hidden = torch.randn(2, 3, 8)
        padded = torch.cat([hidden, torch.randn(2, 4, 8) * 100], dim=1)
        mask = torch.tensor([[1, 1, 1, 0, 0, 0, 0]] * 2)
        candidates = torch.randn(4, 8)
        slots, _ = network.forward_k1(hidden)
        padded_slots, _ = network.forward_k1(padded, mask=mask)
        scores, _ = network.forward_k2(hidden, candidates)
        padded_scores, _ = network.forward_k2(padded, candidates, source_mask=mask)
        torch.testing.assert_close(slots, padded_slots)
        torch.testing.assert_close(scores, padded_scores)

    def test_reviewed_questions_require_explicit_review_marker(self):
        encoder = FrozenFixtureEncoder()
        row = {"title": "fixture", "subquestions": [{"route": "results", "question": "review fixture"}]}
        self.assertEqual(reviewed_targets([row], encoder, 5), (None, None))
        targets, mask = reviewed_targets([{**row, "subquestions_reviewed": True}], encoder, 5)
        self.assertEqual(tuple(targets.shape), (1, 5, 8))
        self.assertEqual(mask[0].tolist(), [0, 0, 1, 0, 0])

    def test_catalog_preserves_multiple_positives_and_rejects_unknowns(self):
        rows = [{"reagents": ["A", "B"]}, {"reagents": ["B", "C"]}]
        catalog = build_catalog(rows, None)
        labels = label_tensor(rows, catalog, "cpu")
        self.assertEqual(labels.tolist(), [[1, 1, 0], [0, 1, 1]])
        with self.assertRaisesRegex(ValueError, "absent from catalog"):
            label_tensor([{"reagents": ["HELD OUT UNKNOWN"]}], catalog, "cpu")

    def test_checkpoint_roundtrip(self):
        network = ResearchNetworks(8, 5, 4).eval()
        title = torch.randn(2, 4, 8)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "software_test.pt"
            torch.save({"state_dict": network.state_dict(), "hidden_size": 8, "slots": 5, "bottleneck": 4}, path)
            checkpoint = torch.load(path, weights_only=True)
            loaded = ResearchNetworks(checkpoint["hidden_size"], checkpoint["slots"], checkpoint["bottleneck"]).eval()
            loaded.load_state_dict(checkpoint["state_dict"])
            torch.testing.assert_close(network.forward_k1(title)[0], loaded.forward_k1(title)[0])

    def test_dry_run_writes_no_trained_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "unit_fixtures.jsonl"
            rows = [{"title": f"SOFTWARE FIXTURE {index}", "conclusion": "TEST TARGET", "methods": "TEST METHOD", "reagents": ["A", "B"]} for index in range(8)]
            source.write_text("\n".join(json.dumps(row) for row in rows), encoding="utf-8")
            command = [sys.executable, "-m", "research_model.train_networks", "--adapter1-data", str(source), "--adapter2-data", str(source), "--model", "NONEXISTENT_TEST_MODEL", "--output", str(root / "output"), "--dry-run"]
            result = subprocess.run(command, capture_output=True, text=True, check=True)
            manifest = json.loads(result.stdout)
            self.assertEqual(manifest["status"], "validated_not_trained")
            self.assertEqual(manifest["metrics"], [])
            self.assertEqual(manifest["adapter1_input"], "title_only")
            self.assertFalse((root / "output").exists())


if __name__ == "__main__":
    unittest.main()
