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
        self.assertIn("kensa/scene_dot.webp", HTML)  # サイクル27: 場面絵はドット絵（写真は資料の sceneRefPhoto）
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

    def test_cycle14_focus_and_scene_warmth(self):
        # サイクル14: 焦点の輪（キーボードで今どこか分かる）＋場面の温かみをKVに寄せる
        self.assertIn(":focus-visible", HTML)                       # 焦点が見える配慮がある
        self.assertIn("button:focus-visible, #stampBag:focus-visible", HTML)
        self.assertIn("outline:3px solid var(--gold)", HTML)        # 穏やかな金の輪（警告色でない）
        self.assertIn("#bagTap:focus-visible", HTML)                # 写真上の袋も焦点が分かる
        self.assertIn(".sgrain:focus-visible", HTML)                # 粒もキーボードで分かる
        self.assertIn('id="stampBag" role="button" tabindex="0"', HTML)  # 袋がキーボードで操作できる
        self.assertIn('addEventListener("keydown"', HTML)           # Enter／Space で押印できる
        self.assertIn("rgba(184,137,58,.22)", HTML)                 # KVの金に寄せた場面の細い内枠
        self.assertIn("rgba(233,226,210,.16)", HTML)                # 場面の上端の溶かしを少し温かく
        self.assertNotIn("setInterval", HTML)                       # タイマー・焦らせる仕組みを入れない
        self.assertNotIn("alert(", HTML)                            # 流れを止める要素は作らない

    def test_cycle15_reference_box(self):
        # サイクル15: 資料置き場（brief §4・§6 の約束）。任意で開く details で、最初は閉じている
        self.assertIn('<details id="refBox">', HTML)                 # open 属性なし＝閉じた状態で始まる
        self.assertIn("資料（規格表）", HTML)
        # 規格表の数値が GRADE_TABLE（原典値）と一致する
        for row in ("70%", "60%", "45%", "15.0%", "15%", "20%", "30%",
                    "7%", "10%", "0.1%", "0.3%", "0.7%", "0.5%", "1.0%", "0.2%", "0.4%", "0.6%"):
            self.assertIn("<td>%s</td>" % row, HTML)
        self.assertIn("16.0%", HTML)                                 # 水分附則（当分の間 +1.0%）の説明がある
        self.assertIn("標準品と見比べて", HTML)                       # 形質は標準品比較（brief §3）
        self.assertIn("https://www.maff.go.jp/j/kokuji_tuti/kokuji/k0001439.html", HTML)  # 原典への出典リンク
        self.assertNotIn("setInterval", HTML)                        # タイマー・焦らせる仕組みを入れない
        self.assertNotIn("alert(", HTML)                             # 流れを止める要素は作らない

    def test_cycle16_focus_handoff(self):
        # サイクル16: 焦点の受け渡し。段階が進むと前の操作が隠れたり無効になって焦点が消えるため、
        # 次の所作の主な操作へ静かに渡す（流れを止める要素・タイマーは入れない）
        self.assertIn('document.getElementById("meterBtn").focus()', HTML)   # さす→はかる
        self.assertIn('querySelector("#whiteTray .sgrain")', HTML)           # はかる→みわける（最初の粒）
        self.assertIn('document.querySelector(".gradeBtn").focus()', HTML)   # みわける→きめる
        self.assertIn('document.getElementById("stampBtn").focus()', HTML)   # きめる→おす
        self.assertIn("bagTap.focus()", HTML)                                # 次の山→最初の袋
        self.assertGreaterEqual(HTML.count("nextBtn.focus()"), 3)            # 平均確定・等級確定・押印で次ボタンへ
        self.assertIn(".sgrain:not(.away)", HTML)                            # 皿へ戻ったら残っている粒へ
        self.assertNotIn("setInterval", HTML)                                # タイマー・焦らせる仕組みを入れない
        self.assertNotIn("alert(", HTML)                                     # 流れを止める要素は作らない

    def test_cycle17_live_announcements(self):
        # サイクル17: 読み上げの静かな案内。主要な結果だけを aria-live="polite" で穏やかに伝える。
        # 段階チップ（所作の切り替わり）・水分の平均・押した証印の数の3か所だけにし、
        # みわけの途中経過（タップごとの%）は読み上げない（うるさくしない）。
        self.assertIn('<div id="stepChip" aria-live="polite">', HTML)        # 段階の切り替わり
        self.assertIn('<p id="avg" aria-live="polite">', HTML)               # 水分の平均が確定したとき
        self.assertIn('<p id="stampCount" aria-live="polite">', HTML)        # 証印を押した数
        self.assertIn('<p id="gradeMsg" aria-live="polite">', HTML)          # 等級の結果（既存・維持）
        self.assertNotIn('id="sortPct" aria-live', HTML)                     # 途中経過は読み上げない
        self.assertNotIn('aria-live="assertive"', HTML)                      # 強い割り込み読み上げはしない
        self.assertNotIn("setInterval", HTML)                                # タイマー・焦らせる仕組みを入れない
        self.assertNotIn("alert(", HTML)                                     # 流れを止める要素は作らない

    def test_cycle18_zoom_and_touch(self):
        # サイクル18: 拡大とタップの配慮。viewport の拡大制限を外し（見たい人が大きく見られる）、
        # 操作要素だけ touch-action: manipulation で二度押し拡大による反応の遅れをなくす。
        # ピンチ拡大は妨げない・タイマー／モーダルは入れない。
        self.assertIn('content="width=device-width, initial-scale=1.0, viewport-fit=cover"', HTML)
        self.assertNotIn("maximum-scale", HTML)                      # 拡大の上限を付けない
        self.assertNotIn("user-scalable=no", HTML)                   # 拡大そのものを禁止しない
        self.assertIn("touch-action:manipulation", HTML)             # 操作要素のタップ反応をすぐ返す
        self.assertIn("button, #stampBag, .sgrain, #bagTap { touch-action:manipulation; }", HTML)
        self.assertNotIn("setInterval", HTML)                        # タイマー・焦らせる仕組みを入れない
        self.assertNotIn("alert(", HTML)                             # 流れを止める要素は作らない

    def test_cycle19_grain_kind_labels(self):
        # サイクル19: 粒の読み上げラベルは「よい／わるい」という答えでなく、規程の用語（種類）そのままにする。
        # 見た目の区別（サイクル9）と同じ情報を読み上げでも伝え、種類を見て決める遊びは残す。
        self.assertIn("GRAIN_LABELS", HTML)
        # キーとラベルの対応そのものを固定する（入れ替えたら落ちる・Codexレビュー指摘）
        m = re.search(r"const GRAIN_LABELS = \{([^}]*)\};", HTML)
        pairs = {(k or ""): v for k, v in re.findall(r'(?:""|(\w+)):\s*"([^"]+)"', m.group(1))}
        self.assertEqual(pairs, {"": "整粒", "higai": "被害粒", "shini": "死米",
                                 "mijuku": "未熟粒", "color": "着色粒", "momi": "もみ"})
        self.assertIn('GRAIN_LABELS[kind || ""] || "整粒"', HTML)  # 未知の種類でも "undefined" にならない
        self.assertNotIn('"わるい粒"', HTML)                      # 答えそのもののラベルは付けない
        self.assertNotIn('"よい粒"', HTML)
        self.assertNotIn("setInterval", HTML)                     # タイマー・焦らせる仕組みを入れない
        self.assertNotIn("alert(", HTML)                          # 流れを止める要素は作らない

    def test_cycle20_refbox_focus_and_touch(self):
        # サイクル20: 資料の見出し（summary）と出典リンク（a）は button でないため、
        # サイクル14の焦点の輪が届かなかった。同じ穏やかな金の輪をこの2つにも付け、
        # 見出しのタップ反応も操作要素とそろえる（サイクル18）。表示・進行は変えない。
        self.assertIn("#refBox summary:focus-visible, #refBox a:focus-visible", HTML)
        self.assertIn("#refBox summary { touch-action:manipulation; }", HTML)
        self.assertNotIn("setInterval", HTML)                     # タイマー・焦らせる仕組みを入れない
        self.assertNotIn("alert(", HTML)                          # 流れを止める要素は作らない

    def test_cycle21_kokusashi_photo_and_shape(self):
        # サイクル21: ユーザー指示「参考資料ではなくゲームに入れて」。実物の穀刺しの写真そのものを
        # 「さす」の場面で見せ（次の所作ではしまう＝道具は常時1つだけ）、絵の穀刺しも実物の形に寄せる
        # （長い金属の二重管・先端のギザギザ・柄近くの細長い窓・金属の口金・木の持ち手）。
        self.assertIn('id="kokuPhoto"', HTML)
        self.assertIn('src="kensa/kokusashi.webp"', HTML)
        photo = Path(__file__).resolve().parent.parent.joinpath("kensa", "kokusashi.webp")
        self.assertTrue(photo.exists())
        self.assertLess(photo.stat().st_size, 300_000)
        self.assertIn('document.getElementById("kokuPhoto").classList.add("off")', HTML)     # はかるへ進むとしまう
        self.assertIn('document.getElementById("kokuPhoto").classList.remove("off")', HTML)  # 次の山で戻す
        self.assertIn('fill="#ccd1d4"', HTML)  # サイクル37で単色化（旧 probeMetal グラデーションは廃止）                      # 絵の穀刺しは金属の管のSVG
        self.assertIn('fill="#c68a3a"', HTML)  # サイクル37で単色化                       # 木の持ち手
        self.assertNotIn("🗡️", HTML)                                # 旧来の絵文字の穀刺しは使わない
        self.assertNotIn("setInterval", HTML)                       # タイマー・焦らせる仕組みを入れない
        self.assertNotIn("alert(", HTML)                            # 流れを止める要素は作らない

    def test_cycle22_koku_photo_compact(self):
        # サイクル22: 実物写真カードを小さく馴染ませ、最初の画面で鑑定皿まで見えるようにする。
        # 写真は切り抜かず3:4のまま・「さす」の間だけの表示切り替え（サイクル21）は維持する。
        self.assertIn("width:min(168px,46%)", HTML)                    # 旧 min(240px,68%) から縮小
        self.assertNotIn("width:min(240px,68%)", HTML)
        self.assertIn("aspect-ratio:3/4", HTML)                        # 全体を見せる縦横比は不変
        self.assertIn("@keyframes kokuIn", HTML)                       # 出る時は静かに現れるだけ
        self.assertIn("animation:kokuIn .55s ease", HTML)
        self.assertIn("rgba(184,137,58,.35)", HTML)                    # 場面と同じ金の細枠でつなぐ
        self.assertIn("prefers-reduced-motion: reduce", HTML)          # 動きを減らす設定ではほぼ止まる（既存）
        self.assertNotIn("setInterval", HTML)                          # タイマー・焦らせる仕組みを入れない
        self.assertNotIn("alert(", HTML)                               # 流れを止める要素は作らない

    def test_cycle23_kokusashi_motion(self):
        # サイクル23: ユーザー提供の実演動画（約8.8秒）が手本の穀刺しモーション。
        # 近づける→斜めに刺し込む（42%で最深）→ひと呼吸（58%まで同じ位置）→ゆっくり抜く（86%）の
        # 一連を2.4秒の穏やかなアニメーションで再現し、抜いた後にだけ溝の米粒が現れる。
        self.assertIn("animation:probeIn 2.4s ease forwards", HTML)
        self.assertIn("42%{opacity:1; transform:translate(22px,5px) rotate(10deg);}", HTML)   # 刺し込み最深（サイクル37で手元に重ねる小さな動きへ変更）
        self.assertIn("58%{opacity:1; transform:translate(22px,5px) rotate(10deg);}", HTML)   # ひと呼吸（同位置）
        self.assertIn("86%{opacity:1; transform:translate(6px,1px) rotate(10deg);}", HTML)    # ゆっくり抜く
        self.assertIn('class="probeGrains"', HTML)                       # 溝に並ぶ米粒（SVG内）
        self.assertGreaterEqual(HTML.count("<ellipse"), 10)              # 一列に並ぶ粒
        self.assertIn("@keyframes grainsShow", HTML)
        self.assertIn("0%,60%{opacity:0;}", HTML)                        # 刺している間・静止中は粒を見せない（Codexレビュー反映）
        self.assertIn("animation:grainsShow 2.4s ease forwards", HTML)
        self.assertIn("(1.55 + Math.random() * 0.4) * motionScale", HTML)  # 粒は抜く動きが始まってから皿へ落ちる
        self.assertIn("2050 * motionScale", HTML)                        # シールは抜き終わってから
        self.assertIn("2400 * motionScale", HTML)                        # 完了表示はモーションの終わりに合わせる
        self.assertIn('matchMedia("(prefers-reduced-motion: reduce)")', HTML)  # 動きを減らす設定では待ち時間も縮める
        self.assertNotIn("animation:probeIn 1.1s", HTML)                 # 旧来の短い動きは使わない
        self.assertNotIn("setInterval", HTML)                            # タイマー・焦らせる仕組みを入れない
        self.assertNotIn("alert(", HTML)                                 # 流れを止める要素は作らない

    def test_cycle24_ittomai_photo_sample(self):
        # サイクル24: 一等米の実物写真（2026-11-05提供）を穀刺し写真と同じ流儀で実物そのものを見せる。
        # 「みわける」の見本（sortWrap内＝その段階だけ表示）と資料置き場の2か所で同じ写真を使う。
        self.assertIn('id="ittoPhoto"', HTML)
        self.assertIn('id="ittoRefPhoto"', HTML)
        self.assertGreaterEqual(HTML.count('src="kensa/ittomai.webp"'), 2)
        photo = Path(__file__).resolve().parent.parent.joinpath("kensa", "ittomai.webp")
        self.assertTrue(photo.exists())
        self.assertLess(photo.stat().st_size, 300_000)
        self.assertIn("aspect-ratio:3/4", HTML)                        # 全体を見せる縦横比（穀刺し写真と共通）
        self.assertIn("一等米（ほんもの）", HTML)
        self.assertIn("一等米の写真は実物です", HTML)                    # フッターで実物であることを明記
        self.assertNotIn("setInterval", HTML)                          # タイマー・焦らせる仕組みを入れない
        self.assertNotIn("alert(", HTML)                               # 流れを止める要素は作らない

    def test_cycle25_sampling_reference(self):
        # サイクル25: 資料置き場に試料の採取（標準抽出方法・平成13年告示第443号）を追加。
        # 数値は brief_cycle1.md §1 で原典（成分検査実施マニュアル hourei-233）確認済みのものだけを使う。
        self.assertIn('id="sampleTable"', HTML)
        self.assertIn("標準抽出方法・平成13年農林水産省告示第443号", HTML)
        self.assertIn("約40g", HTML)
        self.assertIn("合計1kgが目安", HTML)
        self.assertIn("無作為に選びます", HTML)
        self.assertIn("hourei-233.pdf", HTML)
        # 抽出個数表の代表値（荷口→抜く袋）: 2〜15=全部／201〜1,000=32／35,001以上=200
        self.assertIn("<td>2〜15</td><td>全部</td>", HTML)
        self.assertIn("<td>201〜1,000</td><td>32</td>", HTML)
        self.assertIn("<td>35,001以上</td><td>200</td>", HTML)
        self.assertNotIn("setInterval", HTML)                          # タイマー・焦らせる仕組みを入れない
        self.assertNotIn("alert(", HTML)                               # 流れを止める要素は作らない

    def test_cycle26_result_label(self):
        # サイクル26（ユーザー指示 2026-11-05 13:08）: 検査結果を実物の穀粒判定器RN-700の印字ラベルの様式で表示。
        # 項目名・割合%・粒数が行ごとに並び、上部に測定日付・測定粒種・ロット番号、末尾に合計粒数。
        self.assertIn('id="resultLabel"', HTML)
        self.assertIn("穀粒判定器 RN-700", HTML)
        self.assertIn("測定粒種：うるち玄米", HTML)
        self.assertIn('id="labelRows"', HTML)
        self.assertIn('id="labelTotal"', HTML)
        self.assertIn("renderResultLabel()", HTML)  # 「きめる」へ進む時に出す（流れを止めるモーダルにはしない）
        # 行はゲームで実際に数える粒の分類だけ（整粒等／被害粒／死米／未熟粒／着色粒／もみ）。
        # 砕粒・胴割粒は被害粒にまとめ、その他・異物等は粒として数えていないため行を作らない
        m = re.search(r"const LABEL_ROWS = \[(.*?)\];", HTML, re.S)
        self.assertIsNotNone(m)
        pairs = re.findall(r'\["([^"]+)", "(\w+)"\]', m.group(1))
        self.assertEqual(pairs, [("整粒等", "seiryu"), ("被害粒", "higai"), ("死米", "shini"),
                                 ("未熟粒", "mijuku"), ("着色粒", "color"), ("もみ", "momi")])
        self.assertNotIn("630", HTML)  # 実物の合計630粒を真似て水増ししない
        self.assertNotIn("setInterval", HTML)  # タイマー・焦らせる仕組みを入れない
        self.assertNotIn("alert(", HTML)       # 流れを止める要素は作らない

    def test_cycle26_result_label_rows_values(self):
        # 結果ラベルの割合は皿の50粒の実数から作る（純粋関数を node で実行して全ロット固定）
        node = shutil.which("node")
        self.assertIsNotNone(node, "node が必要")
        rows_def = re.search(r"const LABEL_ROWS = \[.*?\];", HTML, re.S).group(0)
        func = re.search(r"function resultLabelRows\(sort\) \{.*?^\}", HTML, re.S | re.M).group(0)
        lots_func = re.search(r"const LOTS = \[.*?\n\];", HTML, re.S).group(0)
        script = (lots_func + "\n" + rows_def + "\n" + func +
                  "\nconsole.log(JSON.stringify(LOTS.map(l => resultLabelRows(l.sort))));\n")
        out = subprocess.run([node, "-e", script], capture_output=True, text=True, timeout=30)
        self.assertEqual(out.returncode, 0, out.stderr)
        all_rows = json.loads(out.stdout)
        self.assertEqual(len(all_rows), 6)
        for rows in all_rows:
            self.assertEqual(sum(r["count"] for r in rows), 50)          # 合計は皿の50粒
            self.assertAlmostEqual(sum(r["pct"] for r in rows), 100.0)   # 割合の合計は100%
        # ロット1: 整粒等40粒=80.0%／着色粒1粒=2.0%
        self.assertEqual(all_rows[0][0], {"name": "整粒等", "count": 40, "pct": 80.0})
        self.assertEqual(all_rows[0][4], {"name": "着色粒", "count": 1, "pct": 2.0})

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


class Cycle27DotSceneTests(unittest.TestCase):
    def test_cycle27_dot_scene_and_photo_in_ref(self):
        # サイクル27（ドット絵化1点目・検査風景）: 場面絵はドット絵 scene_dot.webp、
        # 写真そのものは資料置き場の sceneRefPhoto に残し、KV（kv.webp）も同じドット絵に差し替える
        root = Path(__file__).resolve().parent.parent
        dot = root.joinpath("kensa", "scene_dot.webp")
        self.assertTrue(dot.exists())
        self.assertLess(dot.stat().st_size, 300_000)
        self.assertIn('src="kensa/scene_dot.webp"', HTML)
        self.assertIn('id="sceneRefPhoto"', HTML)
        ref = HTML.split('id="refBox"', 1)[1]
        self.assertIn('id="sceneRefPhoto"', ref)  # 写真は資料の中だけ（場面との重複を避ける）
        self.assertIn("kensa/scene.webp", ref)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle28DotKokusashiTests(unittest.TestCase):
    def test_cycle28_dot_kokusashi_beside_photo(self):
        # サイクル28（ドット絵化2点目・穀刺し）: ドット絵版 kokusashi_dot.webp を
        # 実物写真（サイクル21・kokuPhoto）のとなりに並べ、写真そのものの表示は維持する。
        # 2枚とも「さす」の間だけ見せ、はかるへ進むと一緒にしまい、次の山で一緒に戻す
        root = Path(__file__).resolve().parent.parent
        dot = root.joinpath("kensa", "kokusashi_dot.webp")
        self.assertTrue(dot.exists())
        self.assertLess(dot.stat().st_size, 300_000)
        self.assertIn('id="kokuDot"', HTML)
        self.assertIn('src="kensa/kokusashi_dot.webp"', HTML)
        self.assertIn("穀刺し（ドット絵）", HTML)
        # 写真そのものは維持（勝手に外さない）
        self.assertIn('id="kokuPhoto"', HTML)
        self.assertIn('src="kensa/kokusashi.webp"', HTML)
        self.assertIn("穀刺し（ほんもの）", HTML)
        # 横並び（高さは写真カードのまま＝鑑定皿の1画面収まりを崩さない）
        self.assertIn('id="kokuPair"', HTML)
        self.assertIn("#kokuPair { display:flex;", HTML)
        # 表示の切り替えは写真と連動
        self.assertIn('getElementById("kokuDot").classList.add("off")', HTML)
        self.assertIn('getElementById("kokuDot").classList.remove("off")', HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle29DotIttomaiTests(unittest.TestCase):
    def test_cycle29_dot_ittomai_beside_photo(self):
        # サイクル29（ドット絵化3点目・一等米）: ドット絵版 ittomai_dot.webp を
        # 実物写真（サイクル24・ittoPhoto）のとなりに並べ、写真そのものの表示は維持する。
        # 「みわける」では sortWrap の表示に連動し（JS追加なし）、資料置き場にも同じドット絵を置く。
        # これで実物写真3点（検査風景・穀刺し・一等米）のドット絵化が揃う
        root = Path(__file__).resolve().parent.parent
        dot = root.joinpath("kensa", "ittomai_dot.webp")
        self.assertTrue(dot.exists())
        self.assertLess(dot.stat().st_size, 300_000)
        self.assertIn('id="ittoDot"', HTML)
        self.assertIn('id="ittoDotRef"', HTML)
        self.assertGreaterEqual(HTML.count('src="kensa/ittomai_dot.webp"'), 2)
        self.assertIn("一等米（ドット絵）", HTML)
        # 写真そのものは維持（勝手に外さない）
        self.assertIn('id="ittoPhoto"', HTML)
        self.assertIn('id="ittoRefPhoto"', HTML)
        self.assertGreaterEqual(HTML.count('src="kensa/ittomai.webp"'), 2)
        self.assertIn("一等米（ほんもの）", HTML)
        # 横並び（高さは写真カードのまま＝皿の収まりを崩さない）
        self.assertIn('id="ittoPair"', HTML)
        self.assertIn("#ittoPair { display:flex;", HTML)
        self.assertIn("#ittoDot { width:min(144px,40%);", HTML)  # サイクル35で写真と同幅に更新
        # 資料のドット絵は refBox の中だけ（写真の下）
        ref = HTML.split('id="refBox"', 1)[1]
        self.assertIn('id="ittoDotRef"', ref)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle31DotMeterStampTests(unittest.TestCase):
    def test_cycle31_dot_meter_stamp_and_cute_pals(self):
        # サイクル31（ドット絵化の続き・水分計と証印・袋まわり＋可愛いドット絵の追加）:
        # 水分計・きめる・袋・証印にも粒と皿（サイクル30）と同じ点の質感を足し、
        # 水滴（#dropPal）と米粒（#grainPal）の手描きドット絵の小物を添える。
        # 色・形・配置・遊び・手順・数値は変えない
        # サイクル39で点の質感と小物は外した（素のまま）ため、ここでは残る土台だけを確認する
        self.assertIn("#meterWrap { display:none; margin-top:12px; background:var(--paper);", HTML)
        self.assertEqual(HTML.count('shape-rendering="crispEdges"'), 1)  # 穀刺しSVGのみ（サイクル39で小物2つを外した）
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle30DotGrainsPlatesTests(unittest.TestCase):
    def test_cycle30_dot_grains_and_plates(self):
        # サイクル30（ドット絵化の続き・粒と皿）: 粒はなめらかな楕円をやめて
        # 角を段々に落とした clip-path の輪郭にし、皿は14px間隔のドット質感を足す。
        # 種類ごとの見分け（サイクル9）・遊び・手順・数値は変えない
        self.assertIn(".grain, .sgrain i { clip-path:polygon(32% 0, 68% 0", HTML)
        # 皿の点の質感はサイクル39で外した（素のまま）
        # サイクル9の種類ごとの見分けは維持
        self.assertIn(".sgrain.shini i {", HTML)
        self.assertIn(".sgrain.color i {", HTML)
        self.assertIn(".sgrain.momi i {", HTML)
        self.assertIn(".sgrain.higai i {", HTML)
        self.assertIn("粒は、場面のドット絵に合わせて角ばった輪郭にしました", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle33InspectorFaceTests(unittest.TestCase):
    def test_cycle33_inspector_face_in_later_phases(self):
        # サイクル33（実プレイレビュー「顔を基準に」）: 場面絵のドット絵から切り出した
        # 検査員の顔（face_dot.webp・穏やかな微笑みは場面絵そのまま）を、はかる／みわける／
        # きめる／おすの各道具の上に72pxの丸い顔として添える。さす（最初の画面）は
        # 鑑定皿が1画面に収まる形を崩さないため対象外。遊び・手順・数値は変えない
        root = Path(__file__).resolve().parent.parent
        face = root.joinpath("kensa", "face_dot.webp")
        self.assertTrue(face.exists())
        self.assertLess(face.stat().st_size, 300_000)
        self.assertEqual(HTML.count('src="kensa/face_dot.webp"'), 4)
        self.assertEqual(HTML.count('class="inspectorFace"'), 4)
        self.assertIn(".inspectorFace { width:72px; height:72px; border-radius:50%;", HTML)
        self.assertIn("穏やかに微笑む検査員の顔のドット絵", HTML)
        # 各道具の中にある（はかる・みわける・きめる・おす）
        for wrap in ('id="meterWrap"', 'id="sortWrap"', 'id="gradeWrap"', 'id="stampWrap"'):
            self.assertIn("inspectorFace", HTML.split(wrap, 1)[1][:1200])
        # 最初の画面（stepChip から trayWrap まで）には置かない＝皿の1画面収まりを崩さない
        first_screen = HTML.split('id="stepChip"', 1)[1].split('id="trayWrap"', 1)[0]
        self.assertNotIn("inspectorFace", first_screen)
        self.assertIn("検査員の顔は、はかる以降の各場面にも大きく添えました", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle32PlayReviewTextTests(unittest.TestCase):
    def test_cycle32_no_prototype_short_footer_stamp_hint(self):
        # サイクル32（実プレイレビュー・文字最小限）: 試作表示を外し、
        # 長文フッターは1行にして全文を資料（#footNotes）へ移し、
        # 押印後は袋の「ふくろを タップ」を消して次の山で戻す
        self.assertNotIn("試作", HTML)
        self.assertIn("<footer>🌾 農産物検査の仕事が題材です。くわしくは下の資料へ 📖</footer>", HTML)
        self.assertIn('id="footNotes"', HTML)
        ref = HTML.split('id="refBox"', 1)[1]
        self.assertIn('id="footNotes"', ref)
        self.assertIn("農産物検査の仕事が題材です。試料の採取は穀刺しで1袋 約40g", ref)
        self.assertIn("#stampBag.stamped .bagHint { display:none; }", HTML)
        self.assertIn('bag.classList.add("stamped")', HTML)
        self.assertIn('classList.remove("stamped")', HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle34FirstScreenTests(unittest.TestCase):
    def test_cycle34_hint_above_smaller_named_tray(self):
        # サイクル34（実プレイレビュー）: 最初の画面で案内「ふくろを タップ」が
        # 画面の下端で切れ、鑑定皿が約4割を占め何の皿か分かりにくかった。
        # 案内（#count）を皿の上へ移し、皿を小さくし、「かんてい皿」と名前を付ける。
        # 遊び・手順・数値は変えない
        # 案内は段階チップと皿の間にある（皿より前）
        seg = HTML.split('id="stepChip"', 1)[1].split('id="trayWrap"', 1)[0]
        self.assertIn('id="count"', seg)
        self.assertIn("ふくろを タップ", seg)
        # 皿は小さく（粒エリア104px・余白も圧縮）名前付き
        self.assertIn("#tray { position:relative; height:104px; }", HTML)
        self.assertIn("padding:10px 14px 14px", HTML)
        self.assertIn('<div id="trayLabel">かんてい皿</div>', HTML)
        self.assertIn("#trayLabel {", HTML)
        self.assertIn("最初の画面では、案内を鑑定皿の上に移し", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle35PairAlignmentTests(unittest.TestCase):
    def test_cycle35_photo_dot_pairs_same_size_and_direction(self):
        # サイクル35（実プレイレビュー）: 写真とドット絵ペアの大きさと向きが不揃い。
        # 両ペアとも写真とドット絵を同じ幅にし、並びは stretch で高さをそろえる。
        # 穀刺しのドット絵は写真と同じ斜め向きの画像（差し替え済みファイル）にし、
        # 実物写真そのものの表示は維持する。遊び・手順・数値は変えない
        self.assertIn("#kokuPair { display:flex; gap:10px; justify-content:center; align-items:stretch;", HTML)
        self.assertIn("#kokuPhoto { width:min(168px,46%);", HTML)
        self.assertIn("#kokuDot { width:min(168px,46%);", HTML)
        self.assertIn("#ittoPair { display:flex; gap:10px; justify-content:center; align-items:stretch;", HTML)
        self.assertIn("#ittoDot { width:min(144px,40%);", HTML)
        self.assertIn("#ittoPair .ittoPhoto { margin:0; }", HTML)
        self.assertIn(".ittoPhoto { width:min(144px,40%);", HTML)
        # 実物写真は両ペアとも維持
        self.assertIn('src="kensa/kokusashi.webp"', HTML)
        self.assertIn('src="kensa/kokusashi_dot.webp"', HTML)
        self.assertIn('src="kensa/ittomai.webp"', HTML)
        self.assertIn('src="kensa/ittomai_dot.webp"', HTML)
        root = Path(__file__).resolve().parent.parent
        dot = root.joinpath("kensa", "kokusashi_dot.webp")
        self.assertTrue(dot.exists())
        self.assertLess(dot.stat().st_size, 300_000)
        # 向きをそろえた版のハッシュ（縦向きの旧版 b2e8ae… とは異なる）
        import hashlib
        self.assertEqual(hashlib.md5(dot.read_bytes()).hexdigest(),
                         "97e5e3b07ebf742f40037acb9f03a354")
        self.assertIn("写真とドット絵のペアは、大きさをそろえ", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle36IdleCardTests(unittest.TestCase):
    def test_cycle36_idle_card_with_like_and_return_counting(self):
        # サイクル36（ユーザー指示 2026-11-05 17:54）: 手が止まったところで小さなカードを出し、
        # サイトへ戻る導線といいねボタンを置く。いいね／もどるのタップは /api/feedback（kind:kensa）で数える。
        # 全画面モーダルにはしない（カードの外をさわれば消えて遊びに戻れる）
        self.assertIn('id="idleCard"', HTML)
        self.assertIn('id="likeBtn"', HTML)
        self.assertIn("👍 いいね", HTML)
        self.assertIn('id="returnLink" href="https://ricepia.jp/"', HTML)
        self.assertIn("const IDLE_MS = 45000;", HTML)
        self.assertIn("setTimeout(showIdleCard, IDLE_MS)", HTML)
        self.assertIn("idleCard.inert = false", HTML)  # 表示時だけフォーカス対象にする
        self.assertIn("function hideIdleCard()", HTML)
        self.assertIn('sendTap("like")', HTML)
        self.assertIn('sendTap("return")', HTML)
        self.assertIn('kind: "kensa"', HTML)
        self.assertIn("navigator.sendBeacon", HTML)
        self.assertIn('sessionStorage.getItem("kensaLiked")', HTML)  # いいねは1人1回まで（競わせない）
        self.assertIn("#idleCard { position:fixed;", HTML)
        self.assertNotIn("alert(", HTML)
        root = Path(__file__).resolve().parent.parent
        api = root.joinpath("api", "feedback.js").read_text(encoding="utf-8")
        self.assertIn("function parseKensa(b)", api)
        self.assertIn("kensa-taps", api)
        self.assertIn("KENSA_TAPS", api)


class Cycle37ProbePlainTests(unittest.TestCase):
    def test_cycle37_probe_aligned_flat_and_plain(self):
        # サイクル37（実プレイレビュー「さすモーションの二重見え」＋ユーザー指示 2026-11-05 18:28「素のまま」）:
        # 大きな穀刺しが場面絵の穀刺しと二重に見えたため、場面絵の検査員の手元に重なる
        # 小さな位置・動きにし、色はグラデーションをやめて単色（素）にした。
        # 左右を反転して持ち手が手元（左）・先端が袋（右）を向くようにし、場面絵の穀刺しを覆う
        self.assertIn("#probe { position:absolute; z-index:3; left:29%; top:56%; width:80px;", HTML)
        self.assertIn("transform:rotate(10deg); opacity:0; pointer-events:none; }", HTML)
        self.assertNotIn("drop-shadow", HTML)  # 光沢・影の加工をやめる
        self.assertIn('shape-rendering="crispEdges"', HTML)
        self.assertIn('transform="translate(220 0) scale(-1 1)"', HTML)
        probe_svg = HTML.split('id="probe"', 1)[1].split("</svg>", 1)[0]
        self.assertNotIn("linearGradient", probe_svg)
        self.assertNotIn("url(#probeMetal)", probe_svg)
        self.assertIn('fill="#ccd1d4"', probe_svg)   # 金属は単色
        self.assertIn('fill="#c68a3a"', probe_svg)   # 木の持ち手も単色
        # 動きは2.4秒の穏やかなまま（サイクル23）、移動量だけ小さく
        self.assertIn("animation:probeIn 2.4s ease forwards", HTML)
        self.assertIn("42%{opacity:1; transform:translate(22px,5px) rotate(10deg);}", HTML)
        self.assertIn("「さす」の穀刺しは、場面絵の検査員の手元に重ねて小さく動かし", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle38LabelGuideTests(unittest.TestCase):
    def test_cycle38_label_guide_weight_limits_separated(self):
        # サイクル38（実プレイレビュー残件「結果ラベルへの限度併記」＋「素のまま」）:
        # ラベルの%は皿50粒の粒数、判定の真値は重さ%で別物。行ごとに限度を付けると
        # 直接比べる誤解を招くため、ラベルの下に区切って「重さのめやす」としてだけ置く。
        # 値は GRADE_TABLE（告示第244号）そのもの。装飾は足さず文字だけ
        self.assertIn('id="labelGuide"', HTML)
        guide = HTML.split('id="labelGuide"', 1)[1].split("</div>", 1)[0]
        self.assertIn("等級のめやす（重さ）", guide)
        self.assertIn("ラベルは粒数", guide)
        # 1等・2等・3等の限度が GRADE_TABLE と一致すること（整粒・死米・着色・もみ）
        self.assertIn("1等 整粒70↑ 死米7↓ 着色0.1↓ もみ0.3↓", guide)
        self.assertIn("2等 整粒60↑ 死米10↓ 着色0.3↓ もみ0.5↓", guide)
        self.assertIn("3等 整粒45↑ 死米20↓ 着色0.7↓ もみ1.0↓", guide)
        # ガイドはラベルの中（合計の下）にある＝「きめる」の流れの中だけ
        label = HTML.split('id="resultLabel"', 1)[1].split('id="gradeRecap"', 1)[0]
        self.assertIn('id="labelGuide"', label)
        self.assertLess(label.index('id="labelTotal"'), label.index('id="labelGuide"'))
        # 行レンダリング自体は変えていない（限度を行に混ぜない）
        self.assertIn("function resultLabelRows(sort)", HTML)
        self.assertIn("結果ラベルの下には、等級のめやす（重さ）を区切って併記しました", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle39PlainTests(unittest.TestCase):
    def test_cycle39_plain_no_dot_texture_no_pals(self):
        # サイクル39（素のまま・ユーザー指示 2026-11-05 18:28）: サイクル30・31で足した
        # 点の質感（UI面の radial-gradient ドット）と水滴・米粒の飾りを外す。
        # 着色粒の芯（見分け・サイクル9）の radial-gradient は残す。遊び・手順・数値は変えない
        self.assertNotIn('id="dropPal"', HTML)
        self.assertNotIn('id="grainPal"', HTML)
        self.assertNotIn("dotPal", HTML)
        # UI面のドット質感の具体値が残っていないこと
        self.assertNotIn("1.5px, transparent 1.7px); background-size:14px 14px", HTML)
        self.assertNotIn("background-size:7px 7px", HTML)
        # 土台の単色・グラデーションは残る
        self.assertIn("background:linear-gradient(90deg,#b7d3a8", HTML)
        self.assertIn("background:linear-gradient(180deg,#efe3c2,#e2d0a4)", HTML)
        self.assertIn(".grain, .sgrain i { clip-path:polygon(32% 0", HTML)
        self.assertIn("水分計や皿、袋などの道具まわりは、点の質感や小さな飾りを外して素のままにしました", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)
