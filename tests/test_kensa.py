"""農産物検査ゲーム（kensa.html）の規格値テスト。
期待値は農産物規格規程 平成13年告示第244号（水稲うるち玄米の品位）で確認した原典値。"""
import re
import unittest
from pathlib import Path

HTML = Path(__file__).resolve().parent.parent.joinpath("kensa.html").read_text(encoding="utf-8")
GRADES = ("1等", "2等", "3等")


def _vals(key):
    out = []
    for grade in GRADES:
        m = re.search(r'\{ grade:"%s"[^}]*%s:([\d.]+)' % (grade, key), HTML)
        out.append(float(m.group(1)))
    return out


class KensaTests(unittest.TestCase):
    def test_grade_table_order(self):
        rows = re.findall(r'\{ grade:"(\d等)"[^}]*\}', HTML)
        self.assertEqual(rows, ["1等", "2等", "3等"])

    def test_grade_table_values(self):
        # 整粒（最低）70/60/45、水分（最高・表値）15.0、計（最高）15/20/30
        self.assertEqual(_vals("seiryuMin"), [70, 60, 45])
        self.assertEqual(_vals("moistureMax"), [15.0, 15.0, 15.0])
        self.assertEqual(_vals("totalMax"), [15, 20, 30])
        # 死米 7/10/20、着色粒 0.1/0.3/0.7、もみ 0.3/0.5/1.0、麦 0.1/0.3/0.7、その他 0.3/0.5/1.0、異物 0.2/0.4/0.6
        self.assertEqual(_vals("shiniMax"), [7, 10, 20])
        self.assertEqual(_vals("colorMax"), [0.1, 0.3, 0.7])
        self.assertEqual(_vals("momiMax"), [0.3, 0.5, 1.0])
        self.assertEqual(_vals("mugiMax"), [0.1, 0.3, 0.7])
        self.assertEqual(_vals("otherMax"), [0.3, 0.5, 1.0])
        self.assertEqual(_vals("ibutsuMax"), [0.2, 0.4, 0.6])

    def test_scene_and_no_timer(self):
        self.assertIn("kensa/scene.webp", HTML)
        self.assertNotIn("setInterval", HTML)  # タイマー・焦らせる仕組みを入れない


if __name__ == "__main__":
    unittest.main()
