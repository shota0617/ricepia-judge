"""第4弾サイクル202：はじめの 1分で やめる 人を へらす・おそい 回線と おそい スマホ（運営者の声 2026-11-10「最初の1分のプレイ離脱をいかに減らすか」）。
題字は スタイルシートを 待たずに 出て、下で 米つぶが 動く。地図が 動きだす 前の タップでは 曲を 読みはじめない。家の 絵は 使う マスだけ 切りだす。"""
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = (ROOT / "nishio-go.html").read_text(encoding="utf-8")
PIX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
GAME = (ROOT / "nishio-go" / "game.js").read_text(encoding="utf-8")
PLAY = (ROOT / "tools" / "playtest.js").read_text(encoding="utf-8")
DOC = (ROOT / "docs" / "meiro.md").read_text(encoding="utf-8")


class SlowStart202(unittest.TestCase):
    def test_syntax(self):
        for f in ["nishio-go/pixel.js", "nishio-go/game.js", "tools/playtest.js"]:
            self.assertEqual(subprocess.run(["node", "--check", str(ROOT / f)]).returncode, 0, f)

    def test_cover_paints_before_stylesheets(self):
        """スタイルシート 3つは 題字の スクリプトの あと（body の 中）。head には 題字の ための 小さな style だけ"""
        head, body = HTML[:HTML.index("</head>")], HTML[HTML.index("<body>"):]
        self.assertNotIn('rel="stylesheet"', head)
        self.assertIn("#bootCover{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f6f4ec;transition:opacity .3s}", head)
        self.assertIn("#bootCover.off{opacity:0;pointer-events:none}", head)
        cover = body.index("c.id = 'bootCover'")
        for href in ["https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", "https://fonts.googleapis.com/css2?family=DotGothic16&display=swap", "nishio-go/style.css"]:
            self.assertEqual(HTML.count('<link rel="stylesheet" href="%s"' % href), 1, href)
            self.assertGreater(body.index('<link rel="stylesheet" href="%s"' % href), cover, href)
            self.assertLess(body.index('<link rel="stylesheet" href="%s"' % href), body.index('<header class="bar">'), href)
        # 順番は これまでどおり（Leaflet → 字 → style.css）。Leaflet の 改ざん検知は そのまま
        self.assertLess(body.index("leaflet.css"), body.index("nishio-go/style.css"))
        self.assertIn('leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""/>', body)

    def test_cover_has_rolling_grain_not_a_button(self):
        """題字の 下の 米つぶ：transform だけで 動く・押す 物では ない（button・a・onclick なし）・動きを 減らす 設定では 止まる"""
        self.assertIn("""c.innerHTML = '<img src="nishio-go/logo.svg" alt="" width="272" height="40"/><i></i>';""", HTML)
        self.assertIn("animation:bootRoll .9s ease-in-out infinite alternate}", HTML)
        self.assertIn("@keyframes bootRoll{from{transform:translateX(-24px) rotate(-200deg)}to{transform:translateX(24px) rotate(200deg)}}", HTML)
        self.assertIn("@media (prefers-reduced-motion:reduce){#bootCover i{animation:none}}", HTML)
        boot = HTML[HTML.index("var c = document.createElement('div');"):HTML.index("})();", HTML.index("var c = document.createElement('div');"))]
        for bad in ["<button", "<a ", "onclick", "addEventListener('click'"]:
            self.assertNotIn(bad, boot)
        self.assertIn("c.setAttribute('aria-hidden', 'true');", boot)

    def test_bgm_waits_for_the_map(self):
        """地図が 動きだす 前の タップ・キーでは 曲を 鳴らさない（読みこまない）。動きだした あとの はじめの 操作で 鳴らす"""
        i = GAME.index("const mapUp = () =>")
        s = GAME[i:GAME.index("document.addEventListener('visibilitychange', apply);", i)]
        self.assertIn("const mapUp = () => !!(window.nishioPixel && window.nishioPixel.roll && window.nishioPixel.roll.ready);", s)
        self.assertIn("if (unlocked || !mapUp()) return;", s)
        self.assertIn("['pointerdown', 'keydown'].forEach(ev => document.removeEventListener(ev, unlock, true));", s)
        self.assertIn("['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, true));", s)
        self.assertNotIn("once: true", s)
        # 「音」の スイッチは これまでどおり すぐ 効く
        self.assertIn("toggle(v) { on = v === undefined ? !on : !!v; store.set('nsg_bgm', on); unlocked = true; apply(); },", GAME)

    def test_house_tiles_are_cut_on_use(self):
        """家の シート（2500マス）は 使う ときに 1マスずつ。長さ・中身の 形は 同じ"""
        self.assertIn("get(`house-${s}`, ok, img => { MT.house = sliceSheetLazy(img, 50, 50); });", PIX)
        self.assertNotIn("MT.house = sliceSheet(img, 50, 50)", PIX)
        i = PIX.index("function sliceSheetLazy(img, cols, rows) {")
        s = PIX[i:PIX.index("function applyMapTiles() {", i)]
        self.assertIn("const out = new Array(cols * rows);", s)
        self.assertIn("const pair = [c, c];", s)
        self.assertIn("Object.defineProperty(out, i, { value: pair, writable: true, configurable: true, enumerable: true });", s)
        self.assertIn("if (tiles[C.Q].length !== 2500) return tileVar(code, x, y);", PIX)
        self.assertIn("get houseCut() { return houseCut; }", PIX)

    def test_playtest_and_doc(self):
        for k in ["slowCover:", "bgmAfterMap:", "houseLazy:"]:
            self.assertIn(k, PLAY)
        self.assertIn("...(await slowStartChecks(browser, R)) };", PLAY)
        self.assertIn("- サイクル202：", DOC)

    def test_owner_rules_kept(self):
        """今日 決まった こと：スタート画面なし・最初の click で 許可・「タップ！」の 手本 は さわって いない"""
        self.assertIn("function tiltFirstTouch(", PIX)
        self.assertIn("function tapDemoTick() {", PIX)
        self.assertNotIn('id="bootCover"', HTML)
        self.assertNotIn("playReady", HTML)


if __name__ == "__main__":
    unittest.main()
