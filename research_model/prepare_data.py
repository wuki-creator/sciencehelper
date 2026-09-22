"""Prepare reviewed paper JSONL and optionally collect PubMed-indexed OA papers."""
from __future__ import annotations
import argparse, json, logging, time
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import xml.etree.ElementTree as ET
try:
    from .data import DEFAULT_EXPECTED, load_catalog, read_jsonl, validate_papers, split_deterministic, write_jsonl, sha256_files
except ImportError:
    from data import DEFAULT_EXPECTED, load_catalog, read_jsonl, validate_papers, split_deterministic, write_jsonl, sha256_files

LOG = logging.getLogger("prepare_data")
EPMC_SEARCH = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
EPMC_FULLTEXT = "https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid}/fullTextXML"
DEFAULT_QUERY = 'SRC:MED AND OPEN_ACCESS:Y AND HAS_FT:Y'

def _request(url: str, retries: int = 5) -> bytes:
    for attempt in range(retries):
        try:
            with urlopen(Request(url, headers={"User-Agent": "PaperPilot-data-collector/1.0"}), timeout=40) as response: return response.read()
        except HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == retries - 1: raise
            time.sleep(min(30, 2 ** attempt))
    raise RuntimeError("unreachable")

def _text(node: ET.Element | None) -> str:
    return " ".join("".join(node.itertext()).split()) if node is not None else ""

def parse_jats(xml: bytes, pmcid: str, pmid: str | None = None) -> dict | None:
    root = ET.fromstring(xml); title = _text(root.find(".//article-title"))
    methods_nodes = [n for n in root.findall(".//sec") if "method" in _text(n.find("title")).lower()]
    conclusion_nodes = [n for n in root.findall(".//sec") if any(x in _text(n.find("title")).lower() for x in ("conclusion", "discussion"))]
    methods, conclusion = " ".join(_text(n) for n in methods_nodes), " ".join(_text(n) for n in conclusion_nodes)
    if not title or not methods or not conclusion: return None
    doi = next((x.text for x in root.findall(".//article-id") if x.attrib.get("pub-id-type") == "doi"), "")
    return {"id": pmid or pmcid, "pmid": pmid, "pmcid": pmcid, "doi": doi or None, "title": title, "methods": methods, "conclusion": conclusion, "reagents": [], "source": {"url": f"https://europepmc.org/articles/{pmcid}", "license": _text(root.find(".//license")) or "Open access (Europe PMC)"}}

def collect_pubmed(output: str | Path, expected: int = DEFAULT_EXPECTED, query: str = DEFAULT_QUERY, page_size: int = 100) -> int:
    target = Path(output); target.parent.mkdir(parents=True, exist_ok=True); seen = set()
    if target.exists():
        for row in read_jsonl(target): seen.add(row.get("pmcid") or row.get("id"))
    cursor, fetched = "*", len(seen)
    while fetched < expected:
        data = json.loads(_request(EPMC_SEARCH + f"?query={quote(query)}&format=json&pageSize={page_size}&cursorMark={quote(cursor)}")); results = data.get("resultList", {}).get("result", [])
        if not results: break
        with target.open("a", encoding="utf-8") as out:
            for item in results:
                pmcid = item.get("pmcid")
                if not pmcid or pmcid in seen: continue
                try: record = parse_jats(_request(EPMC_FULLTEXT.format(pmcid=pmcid)), pmcid, item.get("pmid"))
                except Exception as exc: LOG.warning("skip %s: %s", pmcid, exc); continue
                if record:
                    out.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n"); out.flush(); seen.add(pmcid); fetched += 1
                    if fetched >= expected: break
                time.sleep(1 / 3)
        cursor = data.get("nextCursorMark", "")
        if not cursor: break
    return fetched

def prepare(input_path: str | Path, catalog_path: str | Path, output_dir: str | Path, expected: int, smoke: bool = False, seed: int = 42) -> dict:
    rows, catalog = read_jsonl(input_path), load_catalog(catalog_path); rows, report = validate_papers(rows, catalog)
    if not smoke and len(rows) != expected: raise ValueError(f"production dataset requires exactly {expected} unique papers; got {len(rows)} (use --smoke for checks)")
    splits = split_deterministic(rows, seed=seed); out = Path(output_dir); out.mkdir(parents=True, exist_ok=True)
    for split, split_rows in splits.items(): write_jsonl(out / f"{split}.jsonl", split_rows)
    (out / "catalog.json").write_text(json.dumps(list(catalog.values()), ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    files = [out / f"{s}.jsonl" for s in splits] + [out / "catalog.json"]
    manifest = {"schema": "research-papers-v1", "expected": expected, "smoke": smoke, "seed": seed, "counts": {k: len(v) for k, v in splits.items()}, "label_provenance": {"conclusions": "source full text; reviewed", "reagents": "Methods name/alias or evidence quote; catalog identity only"}, "duplicates": report["duplicates_collapsed"], "sha256": sha256_files(files)}
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8"); return manifest

def main() -> None:
    p = argparse.ArgumentParser(); p.add_argument("--input"); p.add_argument("--catalog"); p.add_argument("--output-dir", default="data/prepared"); p.add_argument("--expected", type=int, default=DEFAULT_EXPECTED); p.add_argument("--smoke", action="store_true"); p.add_argument("--seed", type=int, default=42); p.add_argument("--collect-pubmed", metavar="PATH"); p.add_argument("--query", default=DEFAULT_QUERY); args = p.parse_args(); logging.basicConfig(level=logging.INFO)
    if args.collect_pubmed: print(json.dumps({"collected": collect_pubmed(args.collect_pubmed, args.expected, args.query)}, ensure_ascii=False)); return
    if not args.input or not args.catalog: p.error("--input and --catalog are required unless --collect-pubmed is used")
    print(json.dumps(prepare(args.input, args.catalog, args.output_dir, args.expected, args.smoke, args.seed), ensure_ascii=False, indent=2))
if __name__ == "__main__": main()
