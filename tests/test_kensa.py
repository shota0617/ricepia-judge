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

    def test_moisture_lot_clear_band(self):
        # サイクル2のロット水分: 3回測定。解釈の割れない帯域だけを使う（brief_cycle1.md §4）
        # ＝各回も平均も 15.0未満（適合が明らか）か 16.5以上（不適合が明らか）
        m = re.search(r"moisture: \[([\d., ]+)\]", HTML)
        self.assertIsNotNone(m)
        vals = [float(x) for x in m.group(1).split(",")]
        self.assertEqual(len(vals), 3)  # 水分は3回測定の平均で判定（実在の手順）
        avg = round(sum(vals) / len(vals), 1)
        for v in vals + [avg]:
            self.assertTrue(v < 15.0 or v >= 16.5, f"水分 {v} が解釈の割れる帯域にある")

    def test_moisture_meter_ui(self):
        self.assertIn('id="meterBtn"', HTML)          # 大きな測定ボタン1つ
        self.assertIn('id="band"', HTML)              # 15.0の線入り色帯
        self.assertIn("moistureAverage", HTML)        # 3回平均の関数
        self.assertEqual(HTML.count('class="slot"'), 3)  # 測定値の表示枠は3回分

    def _lot_sort(self):
        m = re.search(r"sort: \{ total:(\d+), seiryu:(\d+), higai:(\d+), shini:(\d+), mijuku:(\d+), color:(\d+), momi:(\d+) \}", HTML)
        self.assertIsNotNone(m)
        keys = ("total", "seiryu", "higai", "shini", "mijuku", "color", "momi")
        return dict(zip(keys, (int(x) for x in m.groups())))

    def test_sort_grains_linked_to_lot(self):
        # サイクル3「みわける」: 皿の粒数は LOT.sort の真値から生成する（合計が一致）
        s = self._lot_sort()
        self.assertEqual(s["seiryu"] + s["higai"] + s["shini"] + s["mijuku"] + s["color"] + s["momi"], s["total"])
        self.assertGreater(s["total"] - s["seiryu"], 0)  # よける粒がある

    def test_sort_ui(self):
        self.assertIn('id="sortWrap"', HTML)
        self.assertIn('id="whiteTray"', HTML)   # 白い皿（実在の鑑定）
        self.assertIn('id="blackTray"', HTML)   # 黒い皿（実在の鑑定）
        self.assertIn('id="yokeTray"', HTML)    # よけた粒の受け皿
        self.assertIn("buildSortGrains", HTML)

    def test_truth_is_grade1(self):
        # ロットの真値（重量%）は合計100%で、規格表の1等の限度をすべて満たす
        m = re.search(r"truth: \{ seiryu:([\d.]+), higai:([\d.]+), shini:([\d.]+), mijuku:([\d.]+), color:([\d.]+), momi:([\d.]+), mugi:([\d.]+), other:([\d.]+), ibutsu:([\d.]+) \}", HTML)
        self.assertIsNotNone(m)
        seiryu, higai, shini, mijuku, color, momi, mugi, other, ibutsu = (float(x) for x in m.groups())
        self.assertAlmostEqual(seiryu + higai + shini + mijuku + color + momi + mugi + other + ibutsu, 100.0)
        total = higai + shini + color + momi + mugi + other + ibutsu  # 未熟粒は「計」に入らない（brief §3）
        self.assertGreaterEqual(seiryu, 70)
        self.assertLessEqual(total, 15)
        self.assertLessEqual(shini, 7)
        self.assertLessEqual(color, 0.1)
        self.assertLessEqual(momi, 0.3)
        self.assertLessEqual(mugi, 0.1)
        self.assertLessEqual(other, 0.3)
        self.assertLessEqual(ibutsu, 0.2)


if __name__ == "__main__":
    unittest.main()
