"""Dataset schema, validation and deterministic splitting for research adapters.

The module deliberately keeps evidence text separate from model inputs.  Adapter1
receives only ``title``; Adapter2 receives ``title`` and ``methods``.  Conclusions,
subquestions and reagent targets are supervision labels and are never concatenated
into an input field by this preparation code.
"""
from __future__ import annotations

import hashlib, json, re, unicodedata
from pathlib import Path
from typing import Any, Iterable

DEFAULT_EXPECTED = 10_000
SPLITS = ("train", "validation", "test")
SECTIONS = ("background", "methods", "results", "analysis", "translation")
SCHEMA_VERSION = "research-papers-v1"
_WS = re.compile(r"\s+")

def normalize_text(value: Any) -> str:
    return _WS.sub(" ", unicodedata.normalize("NFKC", str(value or ""))).strip().casefold()

def normalize_title(value: Any) -> str:
    return re.sub(r"[^\w]+", " ", normalize_text(value), flags=re.UNICODE).strip()

def normalize_doi(value: Any) -> str:
    value = re.sub(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", "", normalize_text(value))
    return value.strip(" .")

def read_jsonl(path: str | Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line_no, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip(): continue
        try: row = json.loads(line)
        except json.JSONDecodeError as exc: raise ValueError(f"{path}:{line_no}: invalid JSON: {exc}") from exc
        if not isinstance(row, dict): raise ValueError(f"{path}:{line_no}: row must be an object")
        rows.append(row)
    if not rows: raise ValueError(f"no JSONL rows in {path}")
    return rows

def write_jsonl(path: str | Path, rows: Iterable[dict[str, Any]]) -> None:
    target = Path(path); target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("".join(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in rows), encoding="utf-8")

def _required(row: dict[str, Any], key: str, i: int) -> str:
    value = row.get(key)
    if not isinstance(value, str) or not value.strip(): raise ValueError(f"row {i}: {key} must be non-blank")
    return value.strip()

def validate_catalog(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    if not rows: raise ValueError("catalog must not be empty")
    out: dict[str, dict[str, Any]] = {}; aliases: dict[str, str] = {}
    for i, row in enumerate(rows, 1):
        ident = _required(row, "id", i); name = _required(row, "name", i)
        if normalize_text(ident) in {normalize_text(x) for x in out}: raise ValueError(f"catalog row {i}: duplicate id {ident!r}")
        _required(row, "category", i)
        row = dict(row)
        if not isinstance(row.get("aliases", []), list): raise ValueError(f"catalog row {i}: aliases must be a list")
        row["aliases"] = list(row.get("aliases", []))
        if not all(isinstance(a, str) and a.strip() for a in row["aliases"]): raise ValueError(f"catalog row {i}: aliases must be non-blank strings")
        out[ident] = row
        for alias in [name, *row["aliases"]]:
            key = normalize_text(alias)
            if key and key in aliases and aliases[key] != ident: raise ValueError(f"catalog rows conflict on alias {alias!r}")
            aliases[key] = ident
    return out

def load_catalog(path: str | Path) -> dict[str, dict[str, Any]]:
    """Accept a JSON array, {reagents: [...]}, or JSONL; IDs are not product SKUs."""
    p = Path(path)
    if p.suffix.lower() == ".jsonl": return validate_catalog(read_jsonl(p))
    value = json.loads(p.read_text(encoding="utf-8"))
    if isinstance(value, dict): value = value.get("reagents", value.get("catalog"))
    if not isinstance(value, list): raise ValueError("catalog JSON must be an array or object containing reagents")
    return validate_catalog(value)

def _paper_group(row: dict[str, Any]) -> str:
    return "doi:" + normalize_doi(row.get("doi")) if normalize_doi(row.get("doi")) else "title:" + normalize_title(row.get("title"))

def _identity_keys(row: dict[str, Any]) -> set[str]:
    keys = {"id:" + normalize_text(row["id"]), "title:" + normalize_title(row["title"]), "conclusion:" + normalize_text(row["conclusion"])}
    if normalize_doi(row.get("doi")): keys.add("doi:" + normalize_doi(row["doi"]))
    return keys

def validate_papers(rows: list[dict[str, Any]], catalog: dict[str, dict[str, Any]] | None = None, *, collapse_duplicates: bool = True) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not rows: raise ValueError("no papers")
    seen: dict[str, dict[str, Any]] = {}; kept: list[dict[str, Any]] = []; duplicates = []
    for i, original in enumerate(rows, 1):
        row = dict(original); _required(row, "id", i); _required(row, "title", i); _required(row, "conclusion", i); _required(row, "methods", i)
        if not normalize_title(row["title"]): raise ValueError(f"row {i}: title has no letters or digits")
        if normalize_text(row["title"]) == normalize_text(row["conclusion"]): raise ValueError(f"row {i}: conclusion duplicates the title")
        questions = row.get("subquestions", [])
        if not isinstance(questions, list): raise ValueError(f"row {i}: subquestions must be a list")
        for question in questions:
            if not isinstance(question, dict) or question.get("section") not in SECTIONS: raise ValueError(f"row {i}: invalid subquestion section")
            _required(question, "question", i); _required(question, "evidence", i)
            if normalize_text(question["evidence"]) not in normalize_text(row["conclusion"] + " " + row["methods"]): raise ValueError(f"row {i}: subquestion evidence must quote conclusion or methods")
        if "source" in row and not isinstance(row["source"], dict): raise ValueError(f"row {i}: source must be an object")
        keys = _identity_keys(row)
        overlap = keys.intersection(seen)
        if overlap:
            duplicate = seen[sorted(overlap)[0]]
            # Different papers with identical conclusions are unsafe as held-out
            # labels; reject instead of silently deleting a potentially real paper.
            shared_identity = overlap - {k for k in overlap if k.startswith("conclusion:")}
            if not shared_identity: raise ValueError(f"row {i}: identical conclusion appears under a different paper identity")
            if normalize_text(duplicate["conclusion"]) != normalize_text(row["conclusion"]) or normalize_text(duplicate["methods"]) != normalize_text(row["methods"]) or duplicate.get("reagents", []) != row.get("reagents", []) or duplicate.get("subquestions", []) != row.get("subquestions", []):
                raise ValueError(f"row {i}: conflicting duplicate paper {duplicate['id']!r}")
            duplicates.append({"row": i, "id": row["id"], "duplicate_of": duplicate["id"], "keys": sorted(k for k in overlap if not k.startswith("conclusion:"))})
            if not collapse_duplicates: raise ValueError(f"duplicate paper at row {i}")
            for key in keys: seen[key] = duplicate
            continue
        if catalog is not None: _validate_reagents(row, catalog, i)
        row["group_id"] = _paper_group(row)
        for key in keys: seen[key] = row
        kept.append(row)
    return kept, {"input_rows": len(rows), "kept_rows": len(kept), "duplicates_collapsed": duplicates}

def _validate_reagents(row: dict[str, Any], catalog: dict[str, dict[str, Any]], i: int) -> None:
    anns = row.get("reagents")
    if not isinstance(anns, list): raise ValueError(f"row {i}: reagents must be a list")
    methods = normalize_text(row["methods"]); unlinked: list[str] = []
    alias_map = {normalize_text(v["name"]): k for k, v in catalog.items()}
    alias_map.update({normalize_text(a): k for k, v in catalog.items() for a in v.get("aliases", [])})
    targets = []
    for j, ann in enumerate(anns, 1):
        if isinstance(ann, str): ann = {"id": ann}
        if not isinstance(ann, dict): raise ValueError(f"row {i} reagent {j}: must be stable ID string or object")
        rid = ann.get("id"); name = ann.get("name")
        if rid and rid not in catalog: raise ValueError(f"row {i} reagent {j}: unknown catalog id {rid!r}")
        if not rid and (not isinstance(name, str) or not name.strip()): raise ValueError(f"row {i} reagent {j}: id or name required")
        c = catalog.get(rid) if rid else None
        names = [c["name"], *c.get("aliases", [])] if c else [name]
        evidence = normalize_text(ann.get("evidence"))
        matched = any(contains_mention(methods, n) for n in names)
        if not matched and not (evidence and evidence in methods):
            raise ValueError(f"row {i} reagent {j}: label is not backed by Methods name/alias or evidence quote")
        if not rid:
            unlinked.append({"name": name, "evidence": ann.get("evidence", ""), "reason": "no_catalog_id"}); continue
        if any(t["id"] == rid for t in targets): raise ValueError(f"row {i}: duplicate reagent id {rid!r}")
        targets.append({"id": rid, "name": c["name"], "evidence": ann.get("evidence", ""), "provenance": "methods_name_or_alias" if matched else "methods_evidence_quote"})
    for alias, rid in alias_map.items():
        if alias and contains_mention(methods, alias) and not any(t.get("id") == rid for t in targets): unlinked.append({"name": alias, "candidate_id": rid, "reason": "not_annotated"})
    row["reagent_targets"] = targets; row["unlinked_mentions"] = unlinked

def contains_mention(text: str, mention: str) -> bool:
    """Whole words prevent short labels such as PBS matching within longer words."""
    mention = normalize_text(mention)
    return bool(mention and re.search(r"(?<!\w)" + re.escape(mention) + r"(?!\w)", normalize_text(text)))

def split_deterministic(rows: list[dict[str, Any]], ratios=(0.9, 0.05, 0.05), seed: int = 42) -> dict[str, list[dict[str, Any]]]:
    if len(ratios) != 3 or any(r <= 0 or r >= 1 for r in ratios) or abs(sum(ratios) - 1) > 1e-8: raise ValueError("three positive split ratios must sum to 1")
    buckets = {s: [] for s in SPLITS}
    for row in rows:
        digest = hashlib.sha256(f"{seed}|{row.get('group_id', _paper_group(row))}".encode()).hexdigest(); x = int(digest[:16], 16) / 16**16
        split = "train" if x < ratios[0] else "validation" if x < ratios[0] + ratios[1] else "test"
        buckets[split].append(row)
    assert_no_split_leakage(buckets)
    for bucket in buckets.values(): bucket.sort(key=lambda x: x["id"])
    return buckets

def assert_no_split_leakage(splits: dict[str, list[dict[str, Any]]]) -> None:
    seen: dict[str, str] = {}
    for split, rows in splits.items():
        for row in rows:
            for key in _identity_keys(row):
                if key in seen and seen[key] != split: raise ValueError(f"{key.split(':', 1)[0]} leakage across {seen[key]} and {split}")
                seen[key] = split

def model_example(row: dict[str, Any], stage: str) -> tuple[dict[str, str], dict[str, Any]]:
    """Return strictly whitelisted inputs and separate targets; never label inputs."""
    if stage == "adapter1":
        target = {"conclusion": row["conclusion"]}
        if row.get("subquestions"): target["subquestions"] = row["subquestions"]
        return {"title": row["title"]}, target
    if stage == "adapter2":
        return {"title": row["title"], "methods": row["methods"]}, {"reagent_ids": [r["id"] for r in row["reagent_targets"]]}
    raise ValueError("stage must be adapter1 or adapter2")

def sha256_files(paths: Iterable[str | Path]) -> str:
    h = hashlib.sha256()
    for p in paths: h.update(Path(p).read_bytes())
    return h.hexdigest()
