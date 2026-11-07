"""サイクル113：上のレベル表示をしまい、顔を眺める散歩にする。"""
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "nishio-go.html").read_text(encoding="utf-8")
CSS = (ROOT / "nishio-go" / "style.css").read_text(encoding="utf-8")
GAME = (ROOT / "nishio-go" / "game.js").read_text(encoding="utf-8")
HEADER = HTML.split('<header class="bar">', 1)[1].split('</header>', 1)[0]


class TestQuietHeader(unittest.TestCase):
    def test_level_button_hidden_from_start(self):
        self.assertIn('id="lvBtn" type="button" aria-label="レベルと称号" hidden>', HEADER)
        self.assertIn('[hidden]{display:none!important}', CSS)

    def test_header_update_targets_remain(self):
        self.assertIn('id="lvNum"', HEADER)
        self.assertIn('id="lvFill"', HEADER)
        self.assertIn('id="ptsNum"', HEADER)

    def test_level_still_available_in_records(self):
        self.assertIn('data-tab="log" aria-label="きろく"', HTML)
        self.assertIn("['レベル', `${lv}`, titleOf(lv)]", GAME)

    def test_shop_link_remains_visible(self):
        shop = HEADER.split('<a class="home-btn"', 1)[1].split('</a>', 1)[0]
        self.assertIn('href="https://ricepia.jp/?', shop)
        self.assertIn('data-art="bar-bowl"', shop)
        self.assertNotIn('hidden', shop)


if __name__ == "__main__":
    unittest.main()
