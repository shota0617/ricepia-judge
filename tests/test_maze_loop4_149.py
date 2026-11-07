"""第4弾サイクル149：F6 最初の1分の物差し8項目を毎サイクル同じ形で測れるように固定化（静的に確かめられる分）

項目1・2・8（開いてから転がれるまで／入力から動くまで／音）は実行して測る項目で、ソースからは静的に言えない。
台本 first_minute_probe4.py はリポジトリ外（ドライバ側）に置くため、ここでは物差しの定義文字列が
設計書にあることだけ（あれば）確かめ、設計書が無い環境（CI）ではその部分を飛ばす。
"""
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()
GAME = open(os.path.join(ROOT, "nishio-go", "game.js"), encoding="utf-8").read()
HTML = open(os.path.join(ROOT, "nishio-go.html"), encoding="utf-8").read()
DESIGN = os.path.expanduser("~/workspace/nishio_maze_loop/DESIGN_fable5.md")


def fn(src, name):
    i = src.index("function " + name + "(")
    j = src.index("\n}\n", i)
    return src[i:j + 3]


class TestFirstMinuteRuler(unittest.TestCase):
    def test_item3_first_goal_band(self):
        self.assertIn("const FIRST_MIN = 120, FIRST_MAX = 200;", GAME)
        self.assertIn("const MAZE_NEAR_MIN = 350, MAZE_NEAR = 900;", GAME)
        self.assertIn("first1 = mazeNear && store.get('nsg_mzgoals', 0) < 1", GAME)
        self.assertIn("first1 ? FIRST_MAX : mazeNear ? MAZE_NEAR", GAME)
        self.assertIn("first1 ? (tooNearOk ? 0 : FIRST_MIN) : five", GAME)

    def test_item3_physics_unchanged(self):
        self.assertRegex(PIX, r"ROLL_MAX = 4\.2\b")
        self.assertRegex(PIX, r"ROLL_ACC = 7\b")
        self.assertRegex(PIX, r"RICE_BIG = 1\.45\b")

    def test_item7_first_walk_gate(self):
        self.assertIn("const firstWalk = () => { try { return !(Number(lsGet('nsg_mzgoals', '0')) >= 3); } catch (e) { return false; } };", PIX)
        self.assertIn("window.NISHIO_OTOMO && !firstWalk() &&", fn(PIX, "nakamaStep"))
        self.assertIn("window.NISHIO_DEAI && !firstWalk() &&", fn(PIX, "deaiStep"))
        self.assertIn("if (firstWalk()) return;", fn(PIX, "otedamaStep"))
        self.assertIn("firstWalk()", fn(PIX, "critterStep"))
        for n in ("suzumeStep", "nekoStep", "gochisoStep"):   # 3種は最初の1分から出てよい
            self.assertNotIn("firstWalk", fn(PIX, n), n)

    def test_items4_5_cycle146_cuts_stay(self):
        d = fn(PIX, "drawMzNext")
        self.assertIn("mzNext.want = false; mzNext.t0 = 0; return;", d)
        self.assertNotIn("fillText", d)
        self.assertNotIn("mzNext.want = true", PIX)
        g = fn(GAME, "mazeGoal")
        for bad in ("めいろ ゴール！", "がんばったじゃん", "お疲れ様です。ここで"):
            self.assertNotIn(bad, g)
        h = fn(PIX, "mzHintTick")
        self.assertNotIn("G.toast", h)
        self.assertNotIn("道しるべ：光る 点の ほうへ", h)
        self.assertNotIn("いまの 場所を さがしているよ", GAME + HTML)
        self.assertIn("if (mz) toast(`⭐ +${total}", GAME)

    def test_item4_cycle147_pts_and_guide_stay(self):
        self.assertIn("ptsEl.hidden = !(S.points > 0)", fn(GAME, "renderHeader"))
        self.assertRegex(HTML, r'<div class="pts" hidden')
        g = fn(GAME, "renderGuide")
        self.assertNotIn("🌀${fmtM", g)
        self.assertIn("const far = fmtM(mr ? mr.m : dist(me, g));", g)

    def test_item6_no_auto_modal(self):
        # dialog は全部 hidden で始まる（開きっぱなしで始まらない）
        for m in re.finditer(r'<div [^>]*role="dialog"[^>]*>', HTML):
            self.assertIn(" hidden", m.group(0), m.group(0)[:80])
        # めいろゴールの経路に大きなカード（showReward）を戻していない
        self.assertNotIn("showReward(", fn(GAME, "mazeGoal"))
        self.assertNotIn("showReward(", fn(GAME, "checkin"))
        # 無操作カードは手で動かした人にだけ（サイクル148）
        self.assertIn("window.nsgHandMoved = true", GAME)

    def test_ruler_defined_in_design(self):
        if not os.path.exists(DESIGN):
            self.skipTest("設計書がこの環境に無い")
        d = open(DESIGN, encoding="utf-8").read()
        self.assertIn("### 最初の1分の物差し", d)
        for k in ("開いてから転がれるまで", "最初の入力から動き出すまで", "はじめてのゴール到着時刻", "60秒間の常時表示の文字",
                  "60秒間の一時表示", "60秒間のモーダル", "すずめ・ねこ・ごちそうの3種以内", "転がり音・こつん・ちりん"):
            self.assertIn(k, d, k)

    def test_forbidden_words_not_added(self):
        d = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go", "nishio-go.html", "tests"], cwd=ROOT,
                           capture_output=True, text=True, check=True).stdout
        added = [l[1:] for l in d.splitlines() if l.startswith("+") and not l.startswith("+++")]
        pat = "|".join(["ぼ" + "く", "だ" + "に", "約" + "20%"])  # 検査語そのものが差分に現れないよう分割して組み立てる
        for l in added:
            self.assertIsNone(re.search(pat, l), l)


if __name__ == "__main__":
    unittest.main()
