"""農産物検査ゲーム（kensa.html）の規格値テスト。
期待値は農産物規格規程 平成13年告示第244号（水稲うるち玄米の品位）で確認した原典値。"""
import json
import re
import shutil
import subprocess
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

    def _lots(self):
        moistures = [[float(x) for x in m.split(",")]
                     for m in re.findall(r"moisture: \[([\d., ]+)\]", HTML)]
        truths = [tuple(float(x) for x in m) for m in re.findall(
            r"truth: \{ seiryu:([\d.]+), higai:([\d.]+), shini:([\d.]+), mijuku:([\d.]+), color:([\d.]+), momi:([\d.]+), mugi:([\d.]+), other:([\d.]+), ibutsu:([\d.]+) \}", HTML)]
        sorts = [tuple(int(x) for x in m) for m in re.findall(
            r"sort: \{ total:(\d+), seiryu:(\d+), higai:(\d+), shini:(\d+), mijuku:(\d+), color:(\d+), momi:(\d+) \}", HTML)]
        return moistures, truths, sorts

    def test_moisture_lot_clear_band(self):
        # 全ロットの水分: 3回測定。解釈の割れない帯域だけを使う（brief_cycle1.md §4）
        # ＝各回も平均も 15.0未満（適合が明らか）か 16.5以上（不適合が明らか）
        moistures, _, _ = self._lots()
        self.assertEqual(len(moistures), 6)  # サイクル6: ロット6件
        for vals in moistures:
            self.assertEqual(len(vals), 3)  # 水分は3回測定の平均で判定（実在の手順）
            avg = round(sum(vals) / len(vals), 1)
            for v in vals + [avg]:
                self.assertTrue(v < 15.0 or v >= 16.5, f"水分 {v} が解釈の割れる帯域にある")

    def test_moisture_meter_ui(self):
        self.assertIn('id="meterBtn"', HTML)          # 大きな測定ボタン1つ
        self.assertIn('id="band"', HTML)              # 15.0の線入り色帯
        self.assertIn("moistureAverage", HTML)        # 3回平均の関数
        self.assertEqual(HTML.count('class="slot"'), 3)  # 測定値の表示枠は3回分

    def test_sort_grains_linked_to_lot(self):
        # サイクル3/6「みわける」: 皿の粒数は各ロットの sort から生成する（合計が一致）
        _, _, sorts = self._lots()
        self.assertEqual(len(sorts), 6)
        for total, seiryu, higai, shini, mijuku, color, momi in sorts:
            self.assertEqual(seiryu + higai + shini + mijuku + color + momi, total)
            self.assertGreater(total - seiryu, 0)  # よける粒がある

    def test_sort_ui(self):
        self.assertIn('id="sortWrap"', HTML)
        self.assertIn('id="whiteTray"', HTML)   # 白い皿（実在の鑑定）
        self.assertIn('id="blackTray"', HTML)   # 黒い皿（実在の鑑定）
        self.assertIn('id="yokeTray"', HTML)    # よけた粒の受け皿
        self.assertIn("buildSortGrains", HTML)

    def test_lots_truth_and_answers(self):
        # サイクル6: 全ロットの真値（重量%）は合計100%。正解は judgeGrade で
        # 1等／2等（着色粒）／規格外（水分のみ）／3等／規格外／2等（境界）になる
        moistures, truths, _ = self._lots()
        self.assertEqual(len(truths), 6)
        for t in truths:
            self.assertAlmostEqual(sum(t), 100.0)
        keys = ("seiryu", "higai", "shini", "mijuku", "color", "momi", "mugi", "other", "ibutsu")
        cases = [(dict(zip(keys, t)), round(sum(m) / len(m), 1)) for t, m in zip(truths, moistures)]
        self.assertEqual(self._judge(cases),
                         ["1等", "2等", "規格外", "3等", "規格外", "2等"])
        self.assertIn("LOTS", HTML)
        self.assertIn("lotIndex = (lotIndex + 1) % LOTS.length", HTML)  # 次の山で次のロットへ

    def test_grade_ui(self):
        # サイクル4「きめる」: 大きな等級ボタン4つ（1等／2等／3等／規格外）と見直し導線
        self.assertIn('id="gradeWrap"', HTML)
        for grade in ("1等", "2等", "3等", "規格外"):
            self.assertIn(f'data-grade="{grade}"', HTML)
        self.assertEqual(HTML.count('class="gradeBtn"'), 4)
        self.assertIn('id="backToSort"', HTML)   # 外れても皿に戻って見直せる
        self.assertIn("judgeGrade", HTML)
        self.assertNotIn("alert(", HTML)         # 流れを止める要素は作らない

    def _judge(self, cases):
        # kensa.html の GRADE_TABLE と judgeGrade をそのまま node で実行して判定させる
        node = shutil.which("node")
        self.assertIsNotNone(node, "node が必要")
        table = re.search(r"const GRADE_TABLE = \[.*?\];", HTML, re.S).group(0)
        func = re.search(r"function judgeGrade\(truth, moisture\) \{.*?^\}", HTML, re.S | re.M).group(0)
        script = table + "\n" + func + "\n"
        script += "const cases = JSON.parse(process.argv[1]);\n"
        script += "console.log(JSON.stringify(cases.map(c => judgeGrade(c[0], c[1]))));\n"
        out = subprocess.run([node, "-e", script, json.dumps(cases)],
                             capture_output=True, text=True, timeout=30)
        self.assertEqual(out.returncode, 0, out.stderr)
        return json.loads(out.stdout)

    def test_judge_grade_boundaries(self):
        # サイクル4: 判定関数の境界値（brief_cycle1.md §3）。基準は現行ロットの真値（1等）
        base = {"seiryu": 87.5, "higai": 4.0, "shini": 3.0, "mijuku": 5.0,
                "color": 0.1, "momi": 0.2, "mugi": 0.0, "other": 0.1, "ibutsu": 0.1}

        def mod(**kw):
            t = dict(base)
            t.update(kw)
            return t

        cases = [
            (base, 14.2),                                   # 現行ロット → 1等
            (mod(seiryu=70), 14.2),                         # 整粒ちょうど70 → 1等
            (mod(seiryu=69.9), 14.2),                       # 整粒が1等を割る → 2等
            (mod(higai=11.5), 14.2),                        # 計ちょうど15.0 → 1等
            (mod(higai=11.6), 14.2),                        # 計15.1 → 2等
            (mod(color=0.2), 14.2),                         # 着色粒が1等を割る → 2等
            (mod(mijuku=30.0), 14.2),                       # 未熟粒は計に入らない → 1等のまま
            (mod(shini=20.0, higai=9.5), 14.2),             # 死米・計とも3等の限度ちょうど → 3等
            (mod(shini=20.1, higai=5.3), 14.2),             # 死米が3等を割る → 規格外
            (mod(seiryu=44.9), 14.2),                       # 整粒が3等を割る → 規格外
            (base, 15.0),                                   # 水分ちょうど表値 → 1等
            (base, 15.1),                                   # 水分が全等級の表値を超える → 規格外
        ]
        self.assertEqual(self._judge(cases),
                         ["1等", "1等", "2等", "1等", "2等", "2等",
                          "1等", "3等", "規格外", "規格外", "1等", "規格外"])

    def test_stamp_ui(self):
        # サイクル5「おす」: 等級証印＋日付印＋次の山（1ロット完結）
        self.assertIn('id="stampWrap"', HTML)
        self.assertIn('id="stampBag"', HTML)    # 袋タップでも押せる
        self.assertIn('id="stampBtn"', HTML)    # 大きなボタンでも押せる
        self.assertIn('id="stampMark"', HTML)   # 等級証印
        self.assertIn('id="stampGrade"', HTML)
        self.assertIn('id="dateMark"', HTML)    # 検査証明年月日の日付印
        self.assertIn('id="stampCount"', HTML)  # 今日おした証印の数だけ（競わない）
        self.assertIn("pressStamp", HTML)
        self.assertIn("startNextLot", HTML)     # 次の山へ戻って続けられる
        self.assertIn("つぎの山", HTML)
        self.assertNotIn("alert(", HTML)        # 流れを止める要素は作らない
        self.assertNotIn("setInterval", HTML)   # タイマー・焦らせる仕組みを入れない

    def test_stamp_date_text(self):
        # 日付印は固定日付でなく、その日の日付を YYYY.M.D で作る純粋関数
        node = shutil.which("node")
        self.assertIsNotNone(node, "node が必要")
        func = re.search(r"function stampDateText\(d\) \{.*?^\}", HTML, re.S | re.M).group(0)
        script = func + "\nconsole.log(JSON.stringify([stampDateText(new Date(2026,10,5)), stampDateText(new Date(2026,0,9))]));\n"
        out = subprocess.run([node, "-e", script], capture_output=True, text=True, timeout=30)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(json.loads(out.stdout), ["2026.11.5", "2026.1.9"])


if __name__ == "__main__":
    unittest.main()
