"""第4弾サイクル198：はじめの 1分で やめそうな 所（運営者の声 2026-11-10「最初の1分のプレイ離脱をいかに減らすか」）。
手本の 指を タップして 進む 人：3マス先を 指す・歩いた あとは 0.9秒で 次の 手本・窓が 開く 所は 指さない。「タップ！」の 札は お米に かぶせない。"""
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
CSS = (ROOT / "nishio-go" / "style.css").read_text(encoding="utf-8")
PLAY = (ROOT / "tools" / "playtest.js").read_text(encoding="utf-8")
DOC = (ROOT / "docs" / "meiro.md").read_text(encoding="utf-8")


def fn_src(name):
    i = PIX.index("function %s(" % name)
    return PIX[i:PIX.index("\n}\n", i) + 3]


class FirstMinute198(unittest.TestCase):
    def test_syntax(self):
        for f in ["nishio-go/pixel.js", "tools/playtest.js"]:
            self.assertEqual(subprocess.run(["node", "--check", str(ROOT / f)]).returncode, 0, f)

    def test_demo_points_three_cells_ahead_and_returns_quickly_after_a_tap_walk(self):
        self.assertIn("const DEMO_TAP_MS = 900, DEMO_AHEAD = 3;", PIX)
        self.assertIn("const DEMO_IDLE_MS = 2000;", PIX)   # 転がした あと・何も して いない ときは これまでどおり
        t = fn_src("tapDemoTick")
        self.assertIn("tapDemo.walked = now - tapDemo.walkT < 700;", t)
        self.assertIn("tapDemo.walkT = performance.now();", fn_src("tapWalkTick"))
        self.assertIn("now - tapDemo.at >= (first ? 0 : tapDemo.walked ? DEMO_TAP_MS : DEMO_IDLE_MS)", t)
        self.assertIn("const q = tapDemoSpot(path);", t)

    def test_demo_never_points_where_a_tap_opens_a_window(self):
        w = fn_src("tapDemoWalks")
        self.assertIn("for (const [ox, oy] of DEMO_SLOP)", w)   # 指の ずれ（まわり 12px）も
        self.assertIn("document.elementFromPoint(px, py) !== cv", w)   # 地図に とどく（ボタン・下の 欄の 上で ない）
        self.assertIn("mzMap.arrow", w)
        self.assertIn("shopHits.some(", w)
        self.assertIn("if (fieldHit(x, y, spots)) return false;", w)
        s = fn_src("tapDemoSpot")
        self.assertIn("for (const slop of [DEMO_SLOP_PX, 0]) for (const d of DEMO_CELLS)", s)   # まず 指が ずれても 歩ける 所
        self.assertIn("if (i < 1 || i > last) continue;", s)   # いま いる マスは 指さない
        self.assertIn("if (Math.hypot(q.x - rc.x, q.y - rc.y) >= DEMO_NEAR_PX && tapDemoWalks(q, slop, near)) return q;", s)
        self.assertIn("near = G.spots.filter(", s)   # 重く しない：画面の 近くの 名所だけ   # お米の すぐ そばは 指さない

    def test_click_and_demo_share_one_hit_test(self):
        """タップが 何に 当たるか（fieldHit）は、地図の click と 手本で 同じ。タップで 開く もの・歩く ことは かえて いない"""
        h = fn_src("fieldHit")
        for want in ["if (who) return { npc: who };", "return { rival: true };", "if (hit) return { spot: hit };", "return bp ? { poi: bp } : null;"]:
            self.assertIn(want, h)
        self.assertNotIn("pxInfo", h)   # 調べる だけ（窓は 開かない）
        self.assertNotIn("tapWalk", h)
        i = PIX.index("cv.addEventListener('click', e => {\n  if (performance.now() - swipeS.at < 400) return;")
        c = PIX[i:PIX.index("\n});\n", i)]
        self.assertIn("const h = fieldHit(x, y);", c)
        self.assertIn("if (h.npc) openNpc(h.npc, true);", c)
        self.assertIn("else if (h.rival) rivalTalk();", c)
        self.assertIn("h.spot ? G.popupHtml(h.spot) : poiHtml(h.poi)", c)
        self.assertIn("if (G.demo) tapWalk(", c)
        self.assertEqual(PIX.count("getImageData(ix, iy, 1, 1)"), 1)   # 同じ 調べ方を 2か所に 書かない

    def test_tap_label_moves_beside_the_finger(self):
        t = fn_src("tapDemoTick")
        self.assertIn("up = q.y <= rc.y - 20;", t)
        self.assertIn("tapDemo.el.classList.toggle('dn', up);", t)   # 行き先が 上：指を さかさに（手が お米に のらない）
        self.assertIn("const side = !first || (!up && q.y + 96 <= shTop) ? ''", t)
        self.assertIn("#tapDemo.dn{margin-top:-38px;transform:scaleY(-1);transform-origin:50% 50%;animation-name:tapDemoPressDn}", CSS)
        self.assertIn("#tapDemo.dn.first.lr::after,#tapDemo.dn.first.ll::after{transform:scaleY(-1)}", CSS)   # 札の 字は さかさに しない
        self.assertIn("#pxTilt.pro .ic{animation:none}#tapDemo.dn{animation:none}", CSS)
        self.assertIn("tapDemo.el.classList.toggle('lr', side === 'lr'); tapDemo.el.classList.toggle('ll', side === 'll');", t)
        self.assertIn('#tapDemo.first::after{content:"タップ！"', CSS)   # 札 そのものは そのまま（運営者の声 2026-11-10）
        self.assertIn("#tapDemo.first.lr::after{left:100%;top:8px;transform:none;margin-left:4px}", CSS)
        self.assertIn("#tapDemo.first.ll::after{left:auto;right:100%;top:8px;transform:none;margin-right:4px}", CSS)

    def test_operator_decisions_kept(self):
        """今日 決まった こと：最初の タップ（click）で すぐ 許可を 聞く・前に ことわった 人にも・touchend では 聞かない・同じ タップで 2回 聞かない・聞くまでは すぐ 手本"""
        f = fn_src("tiltFirstTouch")
        self.assertIn("if ((tiltG.asked && !tiltG.retry) || !tiltBtnWanted()) return;", f)
        self.assertIn("document.addEventListener('click', tiltFirstTouch, { capture: true, passive: true });", PIX)
        self.assertNotIn("document.addEventListener('touchend', tiltFirstTouch", PIX)
        a = fn_src("tiltAsk")
        self.assertIn("if (event.type === 'touchend') return;", a)
        self.assertIn("if (tiltAsk.ev === event || performance.now() - (tiltAsk.at || -1e9) < 250) return;", a)
        self.assertIn("const first = tiltBtnWanted() && !tiltG.asked;", fn_src("tapDemoTick"))

    def test_start_script_does_not_press_the_ok_badge(self):
        start = (ROOT / "tools" / "playtest-start.js").read_text(encoding="utf-8")
        self.assertIn("if (!b.btn || /\\bok\\b/.test(b.cls)) return false;", start)

    def test_playtest_and_doc(self):
        for k in ["tapDemoLabel", "tapDemoFollow", "tapDemoQuick"]:
            self.assertIn("  %s: '" % k, PLAY)
            self.assertIn("`%s`" % k, DOC)
        self.assertIn("...(await tapDemoChecks(browser, R))", PLAY)
        self.assertIn("- サイクル198：", DOC)


if __name__ == "__main__":
    unittest.main()
