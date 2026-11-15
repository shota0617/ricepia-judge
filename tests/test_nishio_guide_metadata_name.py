"""NPC IDと元metadataの完全一致時だけ場所を先に出す。VM補助試験。"""
import json
import os
from pathlib import Path
import subprocess
import unittest

ROOT = Path(os.environ.get("R145_SOURCE_ROOT", Path(__file__).resolve().parents[1]))

SCRIPT = r"""
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = process.argv[1];
const game = fs.readFileSync(path.join(root, 'nishio-go/game.js'), 'utf8');
const npcSource = fs.readFileSync(path.join(root, 'nishio-go/npcs.js'), 'utf8');
const spotSource = JSON.parse(fs.readFileSync(path.join(root, 'nishio-go/spots.json'), 'utf8'));
function sourceFunction(name) {
  const start = game.indexOf('function ' + name + '(');
  const end = game.indexOf('\n}\n', start);
  if (start < 0 || end < start) throw new Error('Missing complete function: ' + name);
  return game.slice(start, end + 2);
}
const helper = sourceFunction('guideDispName');
const place = sourceFunction('placeNpcs');
function context(options = {}) {
  const c = vm.createContext({window: {}, spotsVersion: 1, npcsVersion: -1, npcs: [],
    spots: spotSource.spots.map(s => ({...s, id: 'f-' + s.id, name: String(s.name)}))});
  vm.runInContext(npcSource, c, {timeout: 1000});
  const npc = c.window.NISHIO_NPCS.find(n => n.id === 'castle-guide');
  const spot = c.spots.find(s => s.id === 'f-nishio-castle');
  if (!npc || !spot) throw new Error('Canonical source metadata missing');
  if (options.noMetadata) c.window.NISHIO_NPCS = [];
  if (options.emptyPerson) npc.name = '';
  if (options.emptyPlace) spot.name = '';
  vm.runInContext((options.noLookup ? '' : place + '\n') + helper, c, {timeout: 1000});
  return c;
}
const canonical = context();
const n = canonical.placeNpcs().find(n => n.id === 'castle-guide');
if (!n || n.name !== '観光ボランティアガイドさん' || n.spotName !== '西尾市歴史公園（西尾城跡）')
  throw new Error('Canonical source metadata changed');
const original = n.name + '（' + n.spotName + '）';
const g = {kind: 'npc', id: n.id, name: original, lat: n.lat, lng: n.lng};
const rows = [];
function record(name, guide, options = {}) {
  const c = context(options);
  const beforeGuide = JSON.stringify(guide);
  const beforeData = JSON.stringify([c.window.NISHIO_NPCS, c.spots]);
  const firstCache = options.noLookup ? null : c.placeNpcs();
  const result = c.guideDispName(guide);
  rows.push({name, result, original: guide && guide.name,
    guideUnchanged: JSON.stringify(guide) === beforeGuide,
    sourceDataUnchanged: JSON.stringify([c.window.NISHIO_NPCS, c.spots]) === beforeData,
    cacheSame: options.noLookup || c.placeNpcs() === firstCache,
    repeatSame: c.guideDispName(guide) === result});
}
record('canonical', {...g});
record('non-npc', {...g, kind: 'spot'});
record('missing-id', {kind: 'npc', name: original});
record('empty-id', {...g, id: ''});
record('unknown-id', {...g, id: 'not-a-known-person'});
record('different-known-id', {...g, id: 'konoe-tea'});
record('name-mismatch', {...g, name: original + ' '});
record('no-metadata', {...g}, {noMetadata: true});
record('empty-person', {...g}, {emptyPerson: true});
record('empty-place', {...g}, {emptyPlace: true});
record('lookup-absent', {...g}, {noLookup: true});
record('simple-fallback', {kind: 'npc', id: 'not-a-known-person', name: '案内人（西尾駅）'});
const boundaries = ['店員さん（本店（永吉））', 'ガイドさん（西尾城跡）（別館）',
  '学生 (Nishio)', '（西尾城跡）', 'ガイドさん（）', 'ガイドさん（西尾城跡'];
boundaries.forEach((name, i) => record('boundary-' + i, {...g, name}));
record('null', null);
record('no-name', {kind: 'npc', id: g.id});
record('empty-name', {...g, name: ''});
console.log(JSON.stringify({original, rows}));
"""


class GuideMetadataNameRegression(unittest.TestCase):
    def test_actual_helper_and_metadata_preserve_fallback_and_input(self):
        completed = subprocess.run(
            ["node", "-e", SCRIPT, str(ROOT)], text=True, capture_output=True,
            check=True, timeout=30,
        )
        data = json.loads(completed.stdout)
        original = data["original"]
        expected = {
            "canonical": "西尾市歴史公園（西尾城跡）（観光ボランティアガイドさん）",
            "non-npc": original, "missing-id": original, "empty-id": original,
            "unknown-id": original, "different-known-id": original,
            "name-mismatch": original + " ", "no-metadata": original,
            "empty-person": original, "empty-place": original,
            "lookup-absent": original, "simple-fallback": "西尾駅（案内人）",
            "boundary-0": "店員さん（本店（永吉））",
            "boundary-1": "ガイドさん（西尾城跡）（別館）",
            "boundary-2": "学生 (Nishio)", "boundary-3": "（西尾城跡）",
            "boundary-4": "ガイドさん（）", "boundary-5": "ガイドさん（西尾城跡",
            "null": "", "no-name": "", "empty-name": "",
        }
        self.assertEqual([r["name"] for r in data["rows"]], list(expected))
        for row in data["rows"]:
            with self.subTest(case=row["name"]):
                self.assertEqual(row["result"], expected[row["name"]])
                self.assertTrue(row["guideUnchanged"])
                self.assertTrue(row["sourceDataUnchanged"])
                self.assertTrue(row["cacheSame"])
                self.assertTrue(row["repeatSame"])
                if isinstance(row.get("original"), str):
                    self.assertEqual(len(row["result"]), len(row["original"]))
                    self.assertCountEqual(row["result"], row["original"])


if __name__ == "__main__":
    unittest.main()
