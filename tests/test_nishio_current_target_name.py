"""Known NPC place names remain readable in the current one-line guide.

Observed text: npcs.js id=castle-guide and spots.json id=nishio-castle.
The projected coordinates below are fixtures, not new geographic claims.
"""
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAME = (ROOT / "nishio-go" / "game.js").read_text(encoding="utf-8")
PERSON = "観光ボランティアガイドさん"
PLACE = "西尾市歴史公園（西尾城跡）"
NAME = f"{PERSON}（{PLACE}）"
DISPLAY = f"{PLACE}（{PERSON}）"
NPC = {"id": "castle-guide", "name": PERSON, "spotName": PLACE,
       "lat": 34.8662, "lng": 137.0478, "spot": "nishio-castle",
       "off": [30, -20], "look": "guide"}
PROJECTED = {"lat": 34.8663, "lng": 137.0477}
GUIDE = {"kind": "npc", "id": NPC["id"], "name": NAME,
         "lat": 34.8661, "lng": 137.0479, "why": "既存の案内", "by": "人の話",
         "refer": True, "t": 123, "alts": []}


def source_function(name):
    start = GAME.index(f"function {name}(")
    return GAME[start:GAME.index("\n}\n", start) + 2]


def source_target():
    start = GAME.index("const guideTarget = () => {")
    return GAME[start:GAME.index("\n};", start) + 3]


def current_case(label, guide, expected, npc=NPC, mode="projected", reads=1):
    return {"label": label, "guide": guide, "npcs": [] if npc is None else [npc],
            "mode": mode, "reads": reads, "expected": expected, "direct": False}


def direct_case(label, guide, expected):
    return {"label": label, "guide": guide, "expected": expected, "direct": True}


CASES = [
    current_case("observed_nested_current", GUIDE, DISPLAY, reads=2),
    current_case("legacy_selected_current", {**GUIDE, "mine": True, "byId": "station-student",
                 "alts": [{"kind": "spot", "id": "previous", "name": "前の行き先"}]}, DISPLAY),
    current_case("simple_current", {**GUIDE, "name": f"{PERSON}（西尾城跡）"},
                 f"西尾城跡（{PERSON}）", npc={**NPC, "spotName": "西尾城跡"}),
    current_case("stale_saved_name", {**GUIDE, "name": "案内人（古い場所（別名））"},
                 "案内人（古い場所（別名））"),
    current_case("npc_spot_returns_n", GUIDE, PERSON, mode="npc"),
    current_case("missing_npc", GUIDE, "", npc=None),
    current_case("no_current_target", None, ""),
    current_case("ordinary_spot", {**GUIDE, "kind": "spot", "id": "f-nishio-castle", "name": PLACE}, PLACE),
    current_case("missing_place_string", GUIDE, NAME, npc={**NPC, "spotName": None}),
    current_case("nonstring_person", GUIDE, NAME, npc={**NPC, "name": 12}),
    current_case("empty_person", {**GUIDE, "name": f"（{PLACE}）"}, f"（{PLACE}）", npc={**NPC, "name": ""}),
    direct_case("unstructured_observed_nested", {"kind": "npc", "name": NAME}, NAME),
    direct_case("unstructured_multiple_groups", {"kind": "npc", "name": "ガイドさん（西尾城跡）（別館）"},
                "ガイドさん（西尾城跡）（別館）"),
    direct_case("unstructured_halfwidth", {"kind": "npc", "name": "学生 (Nishio)"}, "学生 (Nishio)"),
    direct_case("unstructured_leading_parenthesis", {"kind": "npc", "name": "（西尾城跡）"}, "（西尾城跡）"),
    direct_case("unstructured_empty_place", {"kind": "npc", "name": "ガイドさん（）"}, "ガイドさん（）"),
    direct_case("unstructured_unclosed", {"kind": "npc", "name": "ガイドさん（西尾城跡"}, "ガイドさん（西尾城跡"),
    direct_case("empty_name", {"kind": "npc", "name": ""}, ""),
    direct_case("missing_name", {"kind": "npc"}, ""),
    direct_case("null_direct", None, ""),
]

# Fixtures provide the pre-existing collaborators only. No new display-field
# name, proposed parser, or replacement guide formatter is supplied here.
HARNESS = r"""
'use strict';
const specs = __CASES__;
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function freeze(x) {
  if (x && typeof x === 'object') {
    for (const v of Object.values(x)) freeze(v);
    Object.freeze(x);
  }
  return x;
}
function run(spec) {
  const S = freeze({guide: clone(spec.guide)});
  const ns = freeze(clone(spec.npcs || []));
  const spots = freeze([{id:'f-nishio-castle', name:__PLACE__, ...__PROJECTED__}]);
  const original = JSON.stringify({S, ns, spots});
  const calls = {placeNpcs:0, npcSpot:0, save:0, wrongNpcArgument:0};
  function placeNpcs() { calls.placeNpcs++; return ns; }
  function npcSpot(n) {
    calls.npcSpot++;
    if (!ns.includes(n)) calls.wrongNpcArgument++;
    return spec.mode === 'npc' ? n : clone(__PROJECTED__);
  }
  function save() { calls.save++; throw new Error('display read attempted save'); }
  __TARGET__
  __FORMATTER__
  const rows = [];
  for (let i=0; i<(spec.reads || 1); i++) {
    const target = spec.direct ? S.guide : guideTarget();
    const beforeFormatting = JSON.stringify(target);
    const label = guideDispName(target);
    const projected = target && Object.fromEntries(
      ['kind','id','name','lat','lng','why','by','refer','mine','byId','t','alts']
        .filter(k => Object.hasOwn(target,k)).map(k => [k,target[k]]));
    const spread = target === null ? null : {...target};
    rows.push({label, projected, formatterDidNotMutate:beforeFormatting===JSON.stringify(target),
      targetJSON:JSON.stringify(target), spreadJSON:JSON.stringify(spread),
      targetKeys:target === null ? null : Object.keys(target),
      spreadKeys:spread === null ? null : Object.keys(spread)});
  }
  return {rows, calls, unchanged:original===JSON.stringify({S, ns, spots})};
}
console.log(JSON.stringify(specs.map(spec => {
  try { return {label:spec.label, ...run(spec)}; }
  catch (error) { return {label:spec.label, error:String(error.stack || error)}; }
})));
"""


class CurrentTargetName(unittest.TestCase):
    def test_current_target_uses_known_place_without_changing_stored_guide(self):
        script = (HARNESS.replace("__CASES__", json.dumps(CASES, ensure_ascii=False))
                  .replace("__PLACE__", json.dumps(PLACE, ensure_ascii=False))
                  .replace("__PROJECTED__", json.dumps(PROJECTED))
                  .replace("__TARGET__", source_target())
                  .replace("__FORMATTER__", source_function("guideDispName")))
        proc = subprocess.run(["node", "-e", script], capture_output=True, text=True, timeout=20)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        actual = json.loads(proc.stdout)
        self.assertEqual(len(actual), len(CASES))
        for spec, result in zip(CASES, actual):
            with self.subTest(case=spec["label"]):
                self.assertEqual(result["label"], spec["label"])
                self.assertNotIn("error", result, result.get("error"))
                self.assertTrue(result["unchanged"])
                guide = spec["guide"]
                reads = spec.get("reads", 1)
                is_npc = not spec["direct"] and guide is not None and guide["kind"] == "npc"
                found = is_npc and any(n["id"] == guide["id"] for n in spec["npcs"])
                self.assertEqual(result["calls"], {"placeNpcs": reads if is_npc else 0,
                    "npcSpot": reads if found else 0, "save": 0, "wrongNpcArgument": 0})
                expected_target = None if guide is None else dict(guide)
                expected_full = None if guide is None else dict(guide)
                if is_npc and not found:
                    expected_target = None
                    expected_full = None
                elif found:
                    patch = spec["npcs"][0] if spec["mode"] == "npc" else PROJECTED
                    expected_target.update({k: v for k, v in patch.items() if k in expected_target})
                    expected_full.update(patch)
                elif not spec["direct"] and guide is not None and guide["kind"] == "spot":
                    expected_target.update(PROJECTED)
                    expected_full.update(PROJECTED)
                self.assertEqual(len(result["rows"]), reads)
                for row in result["rows"]:
                    self.assertTrue(row["formatterDidNotMutate"])
                    self.assertEqual(row["projected"], expected_target)
                    self.assertEqual(json.loads(row["targetJSON"]), expected_full)
                    self.assertEqual(json.loads(row["spreadJSON"]), expected_full)
                    expected_keys = None if expected_full is None else list(expected_full)
                    self.assertEqual(row["targetKeys"], expected_keys)
                    self.assertEqual(row["spreadKeys"], expected_keys)
                    self.assertEqual(row["label"], spec["expected"])
                    if expected_target and isinstance(expected_target.get("name"), str):
                        self.assertEqual(len(row["label"]), len(expected_target["name"]))
                        self.assertEqual(sorted(row["label"]), sorted(expected_target["name"]))
                if spec["label"] in ("observed_nested_current", "legacy_selected_current"):
                    self.assertTrue(all(row["label"].startswith(PLACE) for row in result["rows"]))


if __name__ == "__main__":
    unittest.main()
