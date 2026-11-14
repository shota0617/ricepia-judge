"""第4弾サイクル213：小さな 傾き（4度）で お米が やわらかい 生け垣に 押しつけられた まま 道しるべを タップすると、歩いて いる 間に 生け垣の ばねが お米を 押しもどす。
はかった（通しの 確かめ tapWalkTilt。歩きの 確かめ だけを 回して サイクル211 の 前・今の main とも 12回に 1回 落ちる。1こまずつの 記録：坂 0・傾きの 力 0・
パネル なし で、止まって いた お米が ななめに 速さ 1.3マス/秒 まで。別の 回は 3.6〜4.1マス/秒 で 道から 出て 歩きが 取り消された）。
わけ：歩いて いる 間は 小さな 傾きを 入れない（サイクル206）ので 押す 力は 0。でも 歩きだす 前に めりこんで いた しるし（mzSoft.on）が のこって いて、
止まって いる お米を 止めた まま に する 所（rollStep）を 通りぬけ、ばねが 効いた。
直し：歩きだす とき、小さな 傾きなら めりこみを ほどく（速さ 0 と 同じ 所）。強い 傾き（歩きを やめて 傾きに まかせる）は これまでどおり。
テストは 本物の tapWalk を にせの 道具で 動かす（直す 前の ファイルでは ふるまいで 落ちる）。"""
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
DOC = (ROOT / "docs" / "meiro.md").read_text(encoding="utf-8")


def fn(name):
    m = re.search(r"function %s\(" % re.escape(name), PIX)
    if not m:
        raise AssertionError("no function " + name)
    return PIX[m.start():PIX.index("\n}\n", m.start()) + 2]


def node(code):
    r = subprocess.run(["node", "-e", code], capture_output=True, text=True, timeout=30)
    if r.returncode:
        raise AssertionError(r.stderr[-1500:])
    return json.loads(r.stdout)


STUB = """
const TAP_TILT_OVER = %s;
const G = { notePlayInput() {}, npcs: [], toast() {} }, idleTouch = () => {}, tapWalkStop = () => {}, driving = false;
const targetTile = () => ({ x: 10.5, y: 10.5 }), npcTile = n => n, mazeOn = () => true, mzType = () => 1, MZ_K = 3, BLOCK = new Set(), codeAt = () => 0;
const planPath = (sx, sy, gx, gy) => [[sx, sy + 1], [gx, gy]];
const tapS = { path: [], timer: null, goal: null, due: 0 }, tiltG = { x: 0, y: __TY__ }, rp = { x: 10.5, y: 10.5, vx: 0.4, vy: 1.2 };
const mzSoft = { on: true, x: 0, y: 0, ux: 0, uy: 1, pen: 0.2, dent: 0.3, dv: 0, vin: 2.0, boings: 0 };
let ticks = 0; const tapWalkTick = () => { ticks++; };
"""


def run(tilt):
    over = re.search(r"const TAP_TILT_OVER = ([\d.]+);", PIX).group(1)
    return node(STUB.replace("__TY__", str(tilt)) % over + fn("tapWalk") + """
const ok = tapWalk(10, 13);
console.log(JSON.stringify({ ok, ticks, v: [rp.vx, rp.vy], soft: mzSoft.on, vin: mzSoft.vin, pen: mzSoft.pen, goal: tapS.goal }));""")


class WalkLeavesHedge213(unittest.TestCase):
    def test_small_tilt_walk_releases_soft_hedge(self):
        """4度（力 0.69）で 生け垣に めりこんだ まま 歩きだす：速さ 0・めりこみ なし（ばねが 歩きの 間に 押しもどさない）"""
        o = run(0.69)
        self.assertTrue(o["ok"] and o["ticks"] == 1 and o["goal"] == [10, 13], o)
        self.assertEqual(o["v"], [0, 0], o)
        self.assertFalse(o["soft"], "歩きだした のに 生け垣に めりこんだ しるしが のこって いる（ばねが 歩きの 間に お米を 押す）: %r" % o)
        self.assertEqual((o["vin"], o["pen"]), (0, 0), o)

    def test_strong_tilt_keeps_everything(self):
        """強い 傾き（力 0.9）：これまでどおり（歩きは 次の こまで やめて 傾きに まかせる。いきおいも めりこみも そのまま）"""
        o = run(0.9)
        self.assertEqual(o["v"], [0.4, 1.2], o)
        self.assertTrue(o["soft"], o)
        self.assertEqual((o["vin"], o["pen"]), (2.0, 0.2), o)

    def test_rest_branch_and_rules_kept(self):
        """止まって いる お米を 止める 所（めりこんで いなければ 速さ 0 で おわる）と、傾きの きまりは そのまま"""
        self.assertIn("else if (!mzSoft.on) { rp.vx = rp.vy = 0; return; }", PIX)
        self.assertIn("const TAP_TILT_OVER = 0.75;", PIX)
        self.assertIn("document.addEventListener('click', tiltFirstTouch, { capture: true, passive: true });", PIX)

    def test_doc(self):
        self.assertIn("サイクル213", DOC)


if __name__ == "__main__":
    unittest.main()
