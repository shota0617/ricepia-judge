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

    def test_grain_distinguishability(self):
        # サイクル9: わるい粒は種類ごとに形・模様がはっきり違い、タップ範囲も大きい
        self.assertIn("width:44px; height:44px", HTML)   # 粒のタップ範囲（旧38pxから拡大）
        self.assertIn("width:17px; height:26px", HTML)   # 粒本体（旧13x21から拡大）
        for kind in ("shini", "color", "mijuku", "momi", "higai"):
            self.assertIn(f".sgrain.{kind} i", HTML)     # 種類ごとの見た目定義がある
        self.assertIn("radial-gradient", HTML)           # 着色粒: 濃い芯
        self.assertIn("repeating-linear-gradient(90deg,#d8bc7a 0 4px,#a9853e 4px 7px)", HTML)  # もみ: 太い殻の縞
        self.assertIn("#3d2a14 40% 60%", HTML)           # 被害粒: 太い割れ目
        self.assertIn("#9db56e", HTML)                   # 未熟粒: はっきりした青緑
        self.assertIn("#fdfaf0", HTML)                   # 死米: 粉状の白

    def test_machine_ui(self):
        # サイクル8: 穀粒判別器は死米・着色粒だけを見る（農水省通知 元政統第1290号）
        self.assertIn('id="machineBtn"', HTML)   # 任意の大きなボタン1つ
        self.assertIn('id="scanBar"', HTML)      # ゆっくりした光の帯だけ（入力をふさがない）
        self.assertIn("useMachine", HTML)
        self.assertIn("穀粒判別器でも鑑定できます", HTML)
        func = re.search(r"function useMachine\(\) \{.*?^\}", HTML, re.S | re.M).group(0)
        self.assertIn(".sgrain.shini", func)     # 死米は機械の対象
        self.assertIn(".sgrain.color", func)     # 着色粒は機械の対象
        self.assertNotIn("mijuku", func)         # 未熟粒は目視のまま
        self.assertNotIn("momi", func)           # もみは目視のまま
        self.assertNotIn("higai", func)          # 被害粒等の計の鑑定は目視等（同通知）
        self.assertNotIn("alert(", HTML)         # 流れを止める要素は作らない
        self.assertNotIn("setInterval", HTML)    # タイマー・焦らせる仕組みを入れない

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

    def test_cycle10_scene_blend_and_stamp_tactility(self):
        # サイクル10: 場面写真の縁を地色へ溶かす重ね（操作をふさがない）＋押印の触感
        self.assertIn("#scene::after", HTML)                 # 写真の馴染み用の重ねがある
        self.assertIn("pointer-events:none", HTML)           # 重ねは操作をふさがない
        self.assertIn("rgba(233,226,210,.55)", HTML)         # 下端がページの地色へ溶ける
        self.assertIn("@keyframes bagPress", HTML)           # 押した袋が少し沈む
        self.assertIn("@keyframes stampLand", HTML)          # 証印が静かに着地する
        self.assertIn('classList.add("pressed")', HTML)      # 押印で袋の沈み込みが発火する
        self.assertIn('classList.remove("pressed")', HTML)   # 次の山で触感もリセットされる
        self.assertNotIn("setInterval", HTML)                # タイマー・焦らせる仕組みを入れない
        self.assertNotIn("alert(", HTML)                     # 流れを止める要素は作らない

    def test_cycle11_meter_sort_tactility(self):
        # サイクル11: はかる／みわけるの触感（サイクル10の押印と同じ穏やかな流儀にそろえる）
        self.assertIn("#meterBtn:active { transform:scale(.98); }", HTML)   # はかるボタンが少し沈む
        self.assertIn("#machineBtn:active { transform:scale(.98); }", HTML)  # きかいでみるも同じ
        self.assertIn("@keyframes markLand", HTML)           # 平均の印が静かに着地する
        self.assertIn("#bandMark.on { opacity:1; animation:markLand .55s ease; }", HTML)
        self.assertIn(".sgrain:active { transform:scale(.93); }", HTML)  # 粒が押した時だけ少し沈む
        self.assertIn("@keyframes yokeIn", HTML)             # よけた粒が受け皿へ静かに落ち着く
        self.assertNotIn("setInterval", HTML)                # タイマー・焦らせる仕組みを入れない
        self.assertNotIn("alert(", HTML)                     # 流れを止める要素は作らない

    def test_cycle12_kantei_method_and_bag_print(self):
        # サイクル12: 鑑定方法（平成13年告示第333号）を原典（農水省 hourei-10）で裏取りし、
        # 鑑定は視覚・触覚・臭覚・聴覚を用いることをフッターに明記する
        self.assertIn("視覚・触覚・臭覚・聴覚", HTML)
        self.assertIn("鑑定方法・平成13年農林水産省告示第333号", HTML)
        # 袋の印刷欄は罫線だけの薄い表現で、文字は増やさず操作もふさがない
        self.assertIn('class="bagPrint"', HTML)
        self.assertIn("#stampBag .bagPrint", HTML)
        self.assertIn("pointer-events:none", HTML)
        self.assertNotIn("setInterval", HTML)                # タイマー・焦らせる仕組みを入れない
        self.assertNotIn("alert(", HTML)                     # 流れを止める要素は作らない

    def test_cycle13_band_scale_and_reduced_motion(self):
        # サイクル13: はかる色帯の両端（12／18）を数字だけで示し、動きを抑える配慮を入れる
        self.assertIn('id="bandScale"', HTML)                 # 色帯の範囲が数字で分かる
        self.assertIn("<span>12</span><span>18</span>", HTML)  # 帯は12.0〜18.0%（JSの印位置計算と一致）
        self.assertIn("#bandScale", HTML)
        self.assertIn("prefers-reduced-motion: reduce", HTML)  # 動きを減らす端末設定を尊重する
        self.assertIn("#nextBtn:active { transform:scale(.98); }", HTML)  # 次ボタンの触感をそろえる
        self.assertIn("#bagTap:active", HTML)                  # さす袋にも同じ触感
        self.assertNotIn("setInterval", HTML)                  # タイマー・焦らせる仕組みを入れない
        self.assertNotIn("alert(", HTML)                       # 流れを止める要素は作らない

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


class KeyVisualTests(unittest.TestCase):
    def test_key_visual_published(self):
        # サイクル7: キービジュアル（軸写真の可愛いキャラクター風描き起こし）を og:image に使う
        self.assertIn("https://go.ricepia.jp/kensa/kv.webp", HTML)
        kv = Path(__file__).resolve().parent.parent.joinpath("kensa", "kv.webp")
        self.assertTrue(kv.exists())
        self.assertLess(kv.stat().st_size, 300_000)
