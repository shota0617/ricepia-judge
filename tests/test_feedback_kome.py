"""米づくり365のタップ集計の受け口。"""
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(ROOT, "api", "feedback.js"), encoding="utf-8") as f:
    API = f.read()


class TestKomeTaps(unittest.TestCase):
    def test_only_tap_kind_is_stored(self):
        self.assertIn("const KOME_TAPS = { like: '👍 いいね', home: '🏠 サイトへもどる' };", API)
        fn = API[API.index("function parseKome(b) {"):API.index("const komeIssue")]
        self.assertIn("return { tap: b.tap };", fn)

    def test_origin_limited(self):
        self.assertIn(r"/^https:\/\/(www\.)?ricepia\.jp$/", API)
        self.assertIn("if (fromKome(req) && !isKome) return res.status(403)", API)

    def test_text_plain_only_for_kome(self):
        self.assertRegex(API, r"fromKome\(req\) && /\^text\\/plain")

    def test_rate_limited(self):
        self.assertIn("rateOk(ip, Date.now(), 'kome', KOME_PER_IP)", API)


if __name__ == "__main__":
    unittest.main()
