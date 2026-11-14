"""第4弾サイクル212：「動きを へらす」設定の 人の 読みこみ中（おそい 回線で 約 6秒）、題字の 下の 米つぶが 止まった まま で、止まった 絵に 見えた。
その 設定 だけ、米つぶの 明るさを ゆっくり かえる（場所・大きさは 動かさない）。ふつうの 設定の 見た目・動きは かえない。
ブラウザでの 見た目（computed style）は 通しの slowCoverCalm で 見る。ここでは 題字の CSS を 読んで、直す 前の ファイルで 落ちる 形に する。"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = (ROOT / "nishio-go.html").read_text(encoding="utf-8")
PLAY = (ROOT / "tools" / "playtest.js").read_text(encoding="utf-8")
DOC = (ROOT / "docs" / "meiro.md").read_text(encoding="utf-8")


def boot_css():
    i = HTML.index("<style>/* 読みこみ中の 題字")
    return HTML[i:HTML.index("</style>", i)]


def reduce_blocks(css):
    """@media (prefers-reduced-motion:reduce){ … } の 中身（かっこを 数えて 取りだす）"""
    out, k = [], 0
    while True:
        i = css.find("@media (prefers-reduced-motion:reduce){", k)
        if i < 0:
            return out
        j, d = i + len("@media (prefers-reduced-motion:reduce){"), 1
        while d:
            d += {"{": 1, "}": -1}.get(css[j], 0)
            j += 1
        out.append(css[i + len("@media (prefers-reduced-motion:reduce){"):j - 1])
        k = j


def keyframes(css, name):
    m = re.search(r"@keyframes %s\{(.*?\})\}" % re.escape(name), css)
    return m.group(1) if m else None


class CalmCover212(unittest.TestCase):
    def test_reduced_motion_glow(self):
        """「動きを へらす」の 中に、米つぶ（またはその かさね）の 明るさを ゆっくり かえる アニメが ある（1.2秒 以上・opacity だけ・動かさない）"""
        css = boot_css()
        found = None
        for b in reduce_blocks(css):
            for m in re.finditer(r"#bootCover i(?:::after|::before)?\{([^}]*)\}", b):
                a = re.search(r"animation:(\w+) ([\d.]+)s", m.group(1))
                if a and a.group(1) != "none":
                    found = (a.group(1), float(a.group(2)))
        self.assertIsNotNone(found, "動きを へらす 設定で 米つぶが 止まった まま")
        name, dur = found
        self.assertGreaterEqual(dur, 1.2)
        k = keyframes(css, name)
        self.assertIsNotNone(k)
        self.assertIn("opacity", k)
        for w in ("transform", "translate", "rotate", "scale", "left", "top", "width", "height", "margin"):
            self.assertNotIn(w, k, "場所・大きさが 動く: %s" % w)
        ops = [float(x) for x in re.findall(r"opacity:([\d.]+)", k)]
        self.assertGreaterEqual(max(ops) - min(ops), 0.3)
        self.assertLessEqual(max(ops), 0.7, "米つぶを ぜんぶ かくして 点めつに 見える")

    def test_normal_unchanged(self):
        """ふつうの 設定：転がる 米つぶ（サイクル202）は そのまま。かさね（::after）は 動きを へらす 設定の 中 だけ"""
        css = boot_css()
        self.assertIn("#bootCover i{display:block;width:11px;height:14px;margin-top:18px;border-radius:50%;background:#fffdf5;border:2px solid #6b5a3a;animation:bootRoll .9s ease-in-out infinite alternate}", css)
        self.assertIn("@keyframes bootRoll{from{transform:translateX(-24px) rotate(-200deg)}to{transform:translateX(24px) rotate(200deg)}}", css)
        self.assertIn("@media (prefers-reduced-motion:reduce){#bootCover i{animation:none}}", css)
        outside = css
        for b in reduce_blocks(css):
            outside = outside.replace(b, "")
        self.assertNotIn("#bootCover i::after", outside)
        self.assertNotIn("#bootCover i{position", outside)

    def test_rules_kept(self):
        """題字が 消える 時・12秒の「時間が かかっています」・始まりの 画面なし は かえない"""
        self.assertIn("setTimeout(function () { c.classList.add('off'); setTimeout(function () { c.remove(); }, 350); }, 50);", HTML)
        self.assertIn("}, 12000);", HTML)
        self.assertIn("b.onclick = function () { location.reload(); };", HTML)

    def test_playtest_and_doc(self):
        self.assertIn("  slowCoverCalm: '", PLAY)
        self.assertIn("...(await cycle212Checks(browser, R))", PLAY)
        self.assertIn("サイクル212", DOC)


if __name__ == "__main__":
    unittest.main()
