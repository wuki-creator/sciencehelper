import sys, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))
from data import model_example, split_deterministic, validate_catalog, validate_papers

class DataValidationTests(unittest.TestCase):
    def setUp(self):
        self.catalog = validate_catalog([{"id":"r1", "name":"RNeasy kit", "category":"RNA", "aliases":["RNeasy"]}])
        self.row = {"id":"p1", "title":"RNA study", "conclusion":"RNA increased", "methods":"RNA was extracted with RNeasy kit.", "reagents":[{"id":"r1"}], "subquestions":[{"section":"results", "question":"Did RNA increase?", "evidence":"RNA increased"}]}

    def test_adapter_inputs_do_not_leak_labels(self):
        inputs, target = model_example(self.row | {"reagent_targets":[{"id":"r1"}]}, "adapter1")
        self.assertEqual(inputs, {"title":"RNA study"}); self.assertEqual(target["conclusion"], "RNA increased")
        inputs, target = model_example(self.row | {"reagent_targets":[{"id":"r1"}]}, "adapter2")
        self.assertEqual(inputs, {"title":"RNA study", "methods":"RNA was extracted with RNeasy kit."}); self.assertEqual(target, {"reagent_ids":["r1"]})

    def test_reagent_must_be_methods_backed(self):
        bad = dict(self.row, methods="No product is named here.")
        with self.assertRaises(ValueError): validate_papers([bad], self.catalog)

    def test_unknown_reagent_rejected(self):
        with self.assertRaises(ValueError): validate_papers([dict(self.row, reagents=[{"id":"missing"}])], self.catalog)

    def test_duplicate_and_split_determinism(self):
        rows, report = validate_papers([self.row, dict(self.row, id="p2")], self.catalog)
        self.assertEqual(len(rows), 1); self.assertEqual(len(report["duplicates_collapsed"]), 1)
        a = split_deterministic(rows, seed=7); b = split_deterministic(rows, seed=7)
        self.assertEqual({k:[x["id"] for x in v] for k,v in a.items()}, {k:[x["id"] for x in v] for k,v in b.items()})

if __name__ == "__main__": unittest.main()
