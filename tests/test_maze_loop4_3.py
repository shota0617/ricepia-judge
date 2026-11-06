"""第4弾サイクル3：ゲーム内の文字削減（simple 既定で長い説明を出さない）。"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = (ROOT / "nishio-go.html").read_text(encoding="utf-8")
CSS = (ROOT / "nishio-go/style.css").read_text(encoding="utf-8")


class ShortText(unittest.TestCase):
    def test_short_phrases_present(self):
        for t in ("🧪 試作版</p>", "押すと すぐ 地図が 出ます</p>", "⚠️ 立ち止まって 遊んでね",
                  "傾けにくいときは タップ", "黄色い▼が ゴールの むき", "水色の線が 道しるべ",
                  "当たると 時計が 5秒 すすむ", "歩きスマホはしない", "私有地・立入禁止には入らない",
                  "神社・お寺では静かに", "運転中は操作しない", "夜や悪天候・海や川では無理しない",
                  "現在地は送らない。記録はこのスマホだけ。", "<b>声で ゲームが そだつ。</b>名所や 意見を 送ってね",
                  "個人情報は 書かないで。受付番号で お知らせする", "まだない。最初の声を 送ってね",
                  "西尾の おまつり・行事", "まちの人は 架空の人物です", "🌏 せかいちず", "🌀 めいろ", '土地利用・境界：「国土数値情報」', "地図のサービスに伝わる", "いまいる場所の近く（約100m）を送る"):
            self.assertIn(t, HTML)

    def test_old_long_text_gone(self):
        for t in ("歩きながら画面を見ないでください", "このゲームは、あそぶ人の声でそだちます",
                  "名所（注目スポット）でチェックインすると、その日あそべます",
                  "予告なく変わることがあります", "絵は全部で74000枚", "みんなでつくる にしおさんぽGO",
                  "あなたの個人情報は書かないでください"):
            self.assertNotIn(t, HTML)

    def test_css_rules(self):
        for r in (".simple .intro-more{display:none}",
                  ".simple .intro .by,.simple .intro .beta-note{display:none}",
                  ".simple .jump-card small{display:none}"):
            self.assertIn(r, CSS)
        self.assertNotIn(".howto-list small{display:none}", CSS)   # Codex指摘：代替操作（タップ）の案内は既定でも出す

    def test_functions_kept(self):
        for i in ("howtoOpen", "textToggle", "anaToggle", "fbForm", "fbText", "codeBox", "codeLoad",
                  "jumpBtn", "meiroCardBtn", "courseBtn", "koroName", "creditOp"):
            self.assertIn(f'id="{i}"', HTML)
        self.assertIn("nishio-go/privacy.html", HTML)
        self.assertIn("https://www.openstreetmap.org/copyright", HTML)

    def test_diff_has_no_banned_words(self):
        out = subprocess.run(["git", "diff", "origin/main", "--", "nishio-go", "nishio-go.html"],
                             cwd=ROOT, check=True, capture_output=True, text=True).stdout
        added = "\n".join(l for l in out.splitlines() if l.startswith("+") and not l.startswith("+++"))
        for w in ("ぼく", "だに", "約20%"):
            self.assertNotIn(w, added)


if __name__ == "__main__":
    unittest.main()
