"""第4弾サイクル192：スタートの1分（指）。なぞっても 進む・着いたしゅんかんに チェックインのボタンを出さない・タップで歩く確かめは 着くまで待つ。"""
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
GAME = (ROOT / "nishio-go" / "game.js").read_text(encoding="utf-8")
CSS = (ROOT / "nishio-go" / "style.css").read_text(encoding="utf-8")
PLAY = (ROOT / "tools" / "playtest.js").read_text(encoding="utf-8")


def block(src, head, tail):
    i = src.index(head)
    return src[i:src.index(tail, i) + len(tail)]


class Fingers192(unittest.TestCase):
    def test_syntax(self):
        for f in ["nishio-go/pixel.js", "nishio-go/game.js", "tools/playtest.js"]:
            self.assertEqual(subprocess.run(["node", "--check", str(ROOT / f)]).returncode, 0, f)

    def test_swipe_walks_to_release_point(self):
        """指を はなした 所まで 歩く。短い ずれ・2本指・せかいちず・あるいて移動・窓の 間は 何も しない"""
        src = block(PIX, "const swipeS = ", "}, { passive: true });\n// スポットをタップすると")
        stub = """
const L = {}, cv = { width: 780, style: {}, addEventListener: (t, f) => { (L[t] = L[t] || []).push(f); }, getBoundingClientRect: () => ({ left: 0, top: 52, width: 390 }) };
const document = { hidden: false, addEventListener: () => {} };   // サイクル206：置いた まま の 指を おぼえる 聞き手（ここでは 使わない）
let worldMode = false, covered = false, fieldCy = 600; const walks = [], G = { demo: true }, howtoEl = { hidden: true };
const mapCovered = () => covered, fieldT = () => 32, camTile = () => ({ x: 100, y: 200 }), tapWalk = (x, y) => walks.push([x, y]);
const tapS = { goal: null }, tapWalkStop = () => {};   // サイクル206：とりけしで 止める 歩き（ここでは 使わない）
globalThis.window = { devicePixelRatio: 2, addEventListener: () => {} }; globalThis.performance = { now: () => 1000 };
"""
        run = """
const ev = (t, o) => L[t].forEach(f => f({ pointerId: 1, isPrimary: true, button: 0, clientX: 0, clientY: 0, ...o }));
const out = {};
ev('pointerdown', { clientX: 195, clientY: 352 }); ev('pointerup', { clientX: 225, clientY: 362 }); out.swipe = walks.slice(); out.at = swipeS.at;
walks.length = 0; ev('pointerdown', { clientX: 195, clientY: 352 }); ev('pointerup', { clientX: 200, clientY: 355 }); out.tap = walks.length;
ev('pointerdown', { clientX: 195, clientY: 352 }); ev('pointerdown', { pointerId: 2, isPrimary: false, clientX: 240, clientY: 352 }); ev('pointerup', { clientX: 120, clientY: 352 }); out.pinch = walks.length;
ev('pointerdown', { clientX: 195, clientY: 352 }); ev('pointercancel', {}); ev('pointerup', { clientX: 260, clientY: 352 }); out.cancel = walks.length;
worldMode = true; ev('pointerdown', { clientX: 195, clientY: 352 }); ev('pointerup', { clientX: 260, clientY: 352 }); out.world = walks.length; worldMode = false;
G.demo = false; ev('pointerdown', { clientX: 195, clientY: 352 }); ev('pointerup', { clientX: 260, clientY: 352 }); out.walkMode = walks.length; G.demo = true;
covered = true; ev('pointerdown', { clientX: 195, clientY: 352 }); ev('pointerup', { clientX: 260, clientY: 352 }); out.covered = walks.length; covered = false;
ev('pointerdown', { clientX: 195, clientY: 352 }); ev('pointerup', { pointerId: 7, clientX: 260, clientY: 352 }); out.otherId = walks.length;
console.log(JSON.stringify(out));
"""
        r = subprocess.run(["node", "-e", stub + src.replace("\n// スポットをタップすると", "") + run], capture_output=True, text=True, timeout=30)
        self.assertEqual(r.returncode, 0, r.stderr)
        out = json.loads(r.stdout)
        # はなした 所 (225,362)：画面の 点 x=450, y=(362-52)*2=620 → マス 100+(450-390)/32=101.9、200+(620-600)/32=200.6
        self.assertEqual(out["swipe"], [[101, 200]])
        self.assertEqual(out["at"], 1000)
        for k in ["tap", "pinch", "cancel", "world", "walkMode", "covered", "otherId"]:
            self.assertEqual(out[k], 0, k)

    def test_click_after_swipe_ignored_and_touch_action(self):
        i = PIX.index("cv.addEventListener('click', e => {\n")
        self.assertTrue(PIX[i:].startswith("cv.addEventListener('click', e => {\n  if (performance.now() - swipeS.at < 400) return;"))
        self.assertRegex(CSS, r"#pxCanvas\{[^}]*touch-action:pinch-zoom\}")
        self.assertRegex(CSS, r"body\.pxw #pxCanvas\{touch-action:none")   # せかいちずは これまでどおり

    def test_no_spin_button_for_goal_just_arrived(self):
        self.assertIn("const guideArrived = { id: '', at: -Infinity }, GUIDE_AUTO_MS = 3000;", GAME)
        self.assertIn("  guideArrived.id = g.id; guideArrived.at = performance.now();\n  const pts = guideReward(g);", GAME)
        self.assertIn("const autoSoon = !!selected && mazeNow() && guideArrived.id === selected.id && performance.now() - guideArrived.at < GUIDE_AUTO_MS;", GAME)
        self.assertIn("  if (selected && !autoSoon) {\n    btn.hidden = false;", GAME)
        code = """
let now = 0, maze = true; const performance = { now: () => now }, mazeNow = () => maze, guideArrived = { id: '', at: -Infinity }, GUIDE_AUTO_MS = 3000;
const auto = selected => !!selected && mazeNow() && guideArrived.id === selected.id && performance.now() - guideArrived.at < GUIDE_AUTO_MS;
const out = [auto({ id: 'a' })];
guideArrived.id = 'a'; guideArrived.at = 100; now = 150;
out.push(auto({ id: 'a' }), auto({ id: 'b' }), auto(null));
now = 3200; out.push(auto({ id: 'a' }));
now = 150; maze = false; out.push(auto({ id: 'a' }));
console.log(JSON.stringify(out));
"""
        r = subprocess.run(["node", "-e", code], capture_output=True, text=True, timeout=30)
        self.assertEqual(json.loads(r.stdout), [False, True, False, False, False, False])

    def test_playtest_waits_and_checks(self):
        for k in ["swipeWalk", "arriveNoSpin"]:
            self.assertRegex(PLAY, r"\n  %s: '" % k)
        seg = block(PLAY, "    const tw0 = Date.now();", "R.checks.tapWalkInfo")
        self.assertIn("waitForFunction(() => !!nishioPixel.tapGoal", seg)
        self.assertIn("waitForFunction(() => !nishioPixel.tapGoal", seg)
        self.assertNotIn("waitForTimeout(2500)", seg)


if __name__ == "__main__":
    unittest.main()


class SwipeClick192(unittest.TestCase):
    def test_new_touch_clears_click_guard(self):
        """なぞった あと 新しく 指を 置いたら、その click は 捨てない（レビューの 指摘）"""
        src = (Path(__file__).resolve().parent.parent / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
        self.assertIn("cv.addEventListener('pointerdown', e => { swipeS.at = -Infinity;", src)
