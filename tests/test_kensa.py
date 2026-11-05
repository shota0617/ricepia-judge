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
        self.assertIn('document.getElementById("meterBtn").focus({ preventScroll: true })', HTML)   # さす→はかる（サイクル60: チップ先頭表示の後にスクロールなしで渡す）
        self.assertIn('querySelector("#whiteTray .sgrain")', HTML)           # はかる→みわける（最初の粒）
        self.assertIn('document.querySelector(".gradeBtn").focus({ preventScroll: true });', HTML)   # みわける→きめる（サイクル52: ラベルが見切れないようスクロールなし）
        self.assertIn('document.getElementById("stampBtn").focus()', HTML)   # きめる→おす
        self.assertIn("bagTap.focus({ preventScroll: true })", HTML)         # 次の山→最初の袋（サイクル54: 場面の先頭が見切れないようスクロールなし）
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
        self.assertIn("#ittoDot { width:min(120px,34%);", HTML)  # サイクル35で写真と同幅にし、サイクル56でペア同寸のまま少し小さく更新
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
        # サイクル33（実プレイレビュー「顔を基準に」）: 検査員の顔（face_dot.webp）を、
        # はかる／みわける／きめる／おすの各道具の上に丸い顔として添える。さす（最初の画面）は
        # 鑑定皿が1画面に収まる形を崩さないため対象外。遊び・手順・数値は変えない。
        # 大きさはサイクル44で 88px へ更新（正面の顔・表情の読み取りやすさ）
        root = Path(__file__).resolve().parent.parent
        face = root.joinpath("kensa", "face_dot.webp")
        self.assertTrue(face.exists())
        self.assertLess(face.stat().st_size, 300_000)
        self.assertEqual(HTML.count('src="kensa/face_dot.webp"'), 4)
        self.assertEqual(HTML.count('class="inspectorFace"'), 4)
        self.assertIn(".inspectorFace { width:88px; height:88px; border-radius:50%;", HTML)
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
        self.assertIn("#ittoDot { width:min(120px,34%);", HTML)
        self.assertIn("#ittoPair .ittoPhoto { margin:0; }", HTML)
        self.assertIn(".ittoPhoto { width:min(120px,34%);", HTML)
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


class Cycle40LazyRefPhotosTests(unittest.TestCase):
    def test_cycle40_ref_photos_lazy_first_screen_light(self):
        # サイクル40: 資料置き場の写真3枚だけ loading=lazy にし、最初の画面を軽くする。
        # （サイクル41で「みわける」の見本2枚も lazy 化したため、全体数はそちらで固定し、ここでは資料内の3件を固定する）
        # 遊び・手順・数値は変えない
        ref = HTML[HTML.index('id="refBox"'):]
        self.assertEqual(ref.count('loading="lazy"'), 3)
        self.assertIn('<img loading="lazy" src="kensa/scene.webp"', ref)
        self.assertIn('<img loading="lazy" src="kensa/ittomai.webp"', ref)
        self.assertIn('<img loading="lazy" src="kensa/ittomai_dot.webp"', ref)
        # 最初の画面で使う絵は lazy でないこと（場面絵はサイクル41で fetchpriority=high を付与）
        self.assertIn('<img src="kensa/scene_dot.webp" fetchpriority="high"', HTML)
        self.assertIn('<img src="kensa/kokusashi.webp"', HTML)
        self.assertIn('<img src="kensa/kokusashi_dot.webp"', HTML)
        self.assertIn("資料の写真は、資料を開く時だけ読み込むようにして、最初の画面を軽くしました", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle41StartFirstMinuteTests(unittest.TestCase):
    def test_cycle41_scene_preload_and_sort_samples_lazy(self):
        # サイクル41（恒常ルール「スタートの1分が決め手」2026-11-05 20:17）:
        # 軸の場面絵を preload + fetchpriority=high で最優先にし、「みわける」の見本2枚は
        # その場面で読むよう loading=lazy にして、最初の画面の取得を場面＋穀刺しだけに絞る。
        # 遊び・手順・数値は変えない
        self.assertIn('<link rel="preload" as="image" href="kensa/scene_dot.webp" fetchpriority="high"/>', HTML)
        self.assertIn('<img src="kensa/scene_dot.webp" fetchpriority="high"', HTML)
        sort = HTML[HTML.index('id="sortWrap"'):HTML.index('id="gradeWrap"')]
        # みわける見本2件＋この場面の顔1件（サイクル42で顔も lazy 化）
        self.assertEqual(sort.count('loading="lazy"'), 3)
        self.assertIn('<img loading="lazy" src="kensa/ittomai.webp"', sort)
        self.assertIn('<img loading="lazy" src="kensa/ittomai_dot.webp"', sort)
        # lazy は資料3件＋みわける2件の計5件（サイクル42で顔4件が加わり全体数はそちらで固定）。
        # さすの穀刺しペアは最初の画面で使うため lazy にしない
        self.assertEqual(HTML.count('loading="lazy"'), 9)
        self.assertIn('<img src="kensa/kokusashi.webp"', HTML)
        self.assertIn('<img src="kensa/kokusashi_dot.webp"', HTML)
        self.assertIn("場面の絵は最初に読み込み、「みわける」の見本はその場面で読み込むようにして、スタートを軽くしました", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle42StartFirstMinuteFaceLazyTests(unittest.TestCase):
    def test_cycle42_inspector_face_lazy(self):
        # サイクル42（恒常ルール「スタートの1分が決め手」の続き）:
        # 検査員の顔（face_dot.webp）は はかる以降の4場面でしか使わないため、
        # loading=lazy でその場面で読むようにし、最初の画面の取得を場面絵＋穀刺しペアだけに絞る。
        # 顔の表示（丸・穏やかな微笑み。大きさはサイクル44で 88px へ）と遊び・手順・数値は変えない
        self.assertEqual(HTML.count('<img loading="lazy" class="inspectorFace" src="kensa/face_dot.webp"'), 4)
        self.assertEqual(HTML.count('src="kensa/face_dot.webp"'), 4)
        self.assertIn(".inspectorFace { width:88px; height:88px; border-radius:50%;", HTML)
        # lazy は資料3件＋みわける見本2件＋顔4件の計9件。最初の画面で使う絵は lazy にしない
        self.assertEqual(HTML.count('loading="lazy"'), 9)
        self.assertIn('<img src="kensa/scene_dot.webp" fetchpriority="high"', HTML)
        self.assertIn('<img src="kensa/kokusashi.webp"', HTML)
        self.assertIn('<img src="kensa/kokusashi_dot.webp"', HTML)
        self.assertIn("検査員の顔も、はかる以降の場面で読み込むようにして、スタートをさらに軽くしました", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)

    def test_cycle43_probe_instant_and_prefetch_next_images(self):
        # サイクル43（恒常ルール「スタートの1分が決め手」・継続指示で最初の1分のみ）:
        # ①最初のタップで穀刺しが最初のフレームから見える（probeIn 0% が opacity:1・手前から滑り込む）。
        #   2.4秒の穏やかな速さと抜く順序（サイクル23）は変えない
        self.assertIn("0%{opacity:1; transform:translate(-8px,-3px) rotate(10deg);}", HTML)
        self.assertIn("animation:probeIn 2.4s ease forwards", HTML)
        # ②「さす」の間に次の場面の絵（顔・一等米の見本2枚）を先読みし、場面が変わる時の待ちをなくす（1回だけ）
        self.assertIn("let nextImagesWarmed = false;", HTML)
        self.assertIn('["kensa/face_dot.webp", "kensa/ittomai.webp", "kensa/ittomai_dot.webp"]', HTML)
        self.assertIn("const im = new Image(); im.src = src;", HTML)
        self.assertIn("最初のタップでは穀刺しがすぐ見えるようにし、「さす」の間に次の場面の絵を先読みして、スタートの1分の待ちを減らしました", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle44FrontFaceFirstMinuteTests(unittest.TestCase):
    def test_cycle44_front_facing_calm_face_larger(self):
        # サイクル44（継続指示「『良い』と言うまで最初の1分だけ」・実プレイレビュー
        # 2026-11-05 21:50 で顔が不合格）: 旧 face_dot.webp は場面絵からの横顔〜後ろ向きの
        # 切り抜きで車が映り込み表情が読めなかった。正面を向いた穏やかな表情のドット絵
        # （背景は無地・両目と微笑みが小さい表示でも読める）に作り直し、88px に大きくした。
        # 新しい顔のファイル自体（256x256・旧ファイルより小さい＝先読みも軽い）を固定する
        root = Path(__file__).resolve().parent.parent
        face = root.joinpath("kensa", "face_dot.webp")
        self.assertTrue(face.exists())
        self.assertLess(face.stat().st_size, 20_000)
        data = face.read_bytes()
        # WebP (RIFF/WEBP) で 256x256 であること（VP8/VP8L/VP8X の寸法は PIL で確認する代わりに
        # ファイルの差し替えそのものを md5 で固定しない＝絵の差し替えに弱くしないため、
        # ここでは形式と小ささだけを固定し、正面・表情は Playwright の目視で担保する）
        self.assertEqual(data[:4], b"RIFF")
        self.assertEqual(data[8:12], b"WEBP")
        self.assertIn(".inspectorFace { width:88px; height:88px; border-radius:50%;", HTML)
        self.assertNotIn("width:72px; height:72px", HTML)
        self.assertEqual(HTML.count('class="inspectorFace"'), 4)
        self.assertIn("検査員の顔は、正面を向いた穏やかな表情のドット絵に作り直し、少し大きくして、最初の1分でも表情が読めるようにしました", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle45BagTapWholePileTests(unittest.TestCase):
    def test_cycle45_bagtap_covers_whole_pile(self):
        # サイクル45（継続指示「『良い』と言うまで最初の1分だけ」・実プレイレビュー
        # 2026-11-05 21:50 改善候補2）: 旧 #bagTap は山の中央だけ（34/34/32/34%＝場面の約11%）で
        # 山の端のタップが反応しなかった。場面絵の米袋の山全体へ広げる（22/20/64/66%＝
        # 左22%〜右86%・上20%〜下86%）。検査員とフォークリフトは含めない・遊びは変えない
        self.assertIn("#bagTap { position:absolute; z-index:2; left:22%; top:20%; width:64%; height:66%;", HTML)
        self.assertNotIn("left:34%; top:34%; width:32%; height:34%", HTML)
        # 面積が場面の4割を超える（旧約11% → 新約42%）ことを数値でも固定する
        m = re.search(r"#bagTap \{[^}]*width:(\d+)%; height:(\d+)%", HTML)
        self.assertIsNotNone(m)
        self.assertGreater(int(m.group(1)) * int(m.group(2)), 4000)
        self.assertIn("最初のタップは、米袋の山全体で受けられるようにしました", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle46MeterNextSlotTests(unittest.TestCase):
    def test_cycle46_meter_next_slot_and_button_count(self):
        # サイクル46（継続指示「『良い』と言うまで最初の1分だけ」・はかる3回の手応え）:
        # 従来は大きなボタンが3回とも同じ表示で、数字が入る枠も示されず、タップごとの
        # 変化は上部の案内文だけだった。次に数字が入る枠へ金の内枠（点滅なし）を付け、
        # タップのたびに移し、ボタン自体にも残り回数を出す。完了・リセットも固定する
        self.assertIn(".slot.next { box-shadow:inset 0 0 0 3px var(--gold); }", HTML)
        self.assertIn('slots[0].classList.add("next")', HTML)  # はかるを開いた時点で最初の枠を示す
        self.assertIn('slots[measured].classList.remove("next")', HTML)
        self.assertIn('slots[measured].classList.add("next")', HTML)
        self.assertIn('meterBtn.textContent = "💧 はかる ・ あと " + (LOT.moisture.length - measured) + "回"', HTML)
        self.assertIn('meterBtn.textContent = "💧 はかる ✓"', HTML)
        self.assertIn('s.classList.remove("next")', HTML)  # 次の山で印も戻る
        self.assertIn('meterBtn.textContent = "💧 はかる";', HTML)  # ボタンの表示も戻る
        self.assertIn("次に数字が入る枠に金の内枠を付け", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle47SortProgressAboveTraysTests(unittest.TestCase):
    def test_cycle47_sort_progress_above_trays_and_pop(self):
        # サイクル47（継続指示「『良い』と言うまで最初の1分だけ」・みわける最初のタップの手応え）:
        # 実測では到着時に進み具合（#sortPct）が画面外（top 1108px／画面844px）で、
        # 最初のタップの変化が見えなかった。#sortPct を皿の上へ移し（要素は1つだけ）、
        # よけた数が増えた時だけ大きな数字が一度静かに動く（開始・リセット時は動かさない）
        self.assertEqual(HTML.count('id="sortPct"'), 1)
        self.assertLess(HTML.index('id="sortPct"'), HTML.index('id="whiteTray"'))
        self.assertIn("#sortPct b.pop { animation:sortPop .45s ease; }", HTML)
        self.assertIn("@keyframes sortPop { 0%{ transform:scale(1.22); } 100%{ transform:scale(1); } }", HTML)
        self.assertIn('if (sortFound > 0) { pctB.classList.remove("pop"); void pctB.offsetWidth; pctB.classList.add("pop"); }', HTML)
        self.assertIn("進み具合の大きな数字を皿の上に置き", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle48GoodGrainNodTests(unittest.TestCase):
    def test_cycle48_good_grain_nod_feedback(self):
        # サイクル48（継続指示「『良い』と言うまで最初の1分だけ」・みわけるでよい粒の手応え）:
        # よい粒は従来 :active の間だけ揺れ、指を離すと無反応に見えた。クリックで .nod を
        # 付け直し（外す→リフロー→付ける）、揺れを最後まで見せる。数・判定は変えない
        self.assertIn(".sgrain.good.nod i { animation:wiggle .5s ease; }", HTML)
        self.assertIn('b.classList.remove("nod"); void b.offsetWidth; b.classList.add("nod");', HTML)
        self.assertIn("よい粒をタップした時も指を離した後まで小さな揺れが見えるようにして", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle50MachineInstantResponseTests(unittest.TestCase):
    def test_cycle50_machine_first_grain_moves_soon(self):
        # サイクル50（継続指示「『良い』と言うまで最初の1分だけ」・きかいでみるの初動）:
        # 従来は最初の粒が動くまで350msあり、光の帯も165msまで見えなかった。
        # 帯は6%（約66ms）で見え、最初の粒は90msから動き始め、間隔140msの穏やかさは保つ
        self.assertIn("90 + i * 140", HTML)
        self.assertNotIn("350 + i * 140", HTML)
        self.assertIn("6%{ opacity:1; }", HTML)
        self.assertIn("押した直後から光の帯が見え、最初の粒がすぐ動き始める", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle51WrongGradeTriedMarkTests(unittest.TestCase):
    def test_cycle51_wrong_grade_tried_mark(self):
        # サイクル51（継続指示「『良い』と言うまで最初の1分だけ」・等級を選んだ直後の反応）:
        # 外れた等級は従来ボタンに何も残らず、案内も.6秒かけて薄く出るだけだった。
        # 選んだボタンに金の静かな印（tried）を即時付け、案内は.35秒で出し、次の山で印を外す
        self.assertIn(".gradeBtn.tried { border-color:var(--gold); background:#f6efdc; }", HTML)
        self.assertIn('btn.classList.add("tried");', HTML)
        self.assertIn('b.classList.remove("tried");', HTML)
        self.assertIn("#gradeMsg.on { opacity:1; transition:opacity .35s ease; }", HTML)
        self.assertIn("等級を選ぶと、選んだボタンに静かに印が付き、案内もすぐ出る", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle49SasInstantHintTests(unittest.TestCase):
    def test_cycle49_sas_tap_hint_changes_immediately(self):
        # サイクル49（継続指示「『良い』と言うまで最初の1分だけ」・さすのタップ直後の案内）:
        # 実測ではタップ後300msでも案内が「ふくろを タップ」のままで、2.4秒の動きの間は
        # 済んだはずの指示が残っていた。タップ直後に「穀刺しで ぬいている」へ切り替え、
        # 完了時の「とれた試料 約40g」への上書きは従来どおりにする
        self.assertIn('count.textContent = "穀刺しで ぬいている";', HTML)
        self.assertLess(HTML.index('count.textContent = "穀刺しで ぬいている";'),
                        HTML.index('count.innerHTML = "とれた試料 <b>約40g</b>";'))
        self.assertIn("タップした瞬間に案内が「穀刺しで ぬいている」へ変わり", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle53StampCountPopTests(unittest.TestCase):
    def test_cycle53_stamp_count_pop_on_press(self):
        # サイクル53（継続指示「『良い』と言うまで最初の1分だけ」・おすの押印直後の反応）:
        # 従来は証印の数がテキストで変わるだけで動きがなく、袋を見ていると変化に気づきにくかった。
        # みわけの進み具合（サイクル47）と同じく、押すたび大きな数字が一度だけ静かに動くようにする
        self.assertIn("#stampCount b { font-size:34px; display:inline-block; }", HTML)
        self.assertIn("#stampCount b.pop { animation:stampPop .45s ease; }", HTML)
        self.assertIn("@keyframes stampPop { 0%{ transform:scale(1.22); } 100%{ transform:scale(1); } }", HTML)
        self.assertIn('stampCountB.classList.add("pop")', HTML)
        self.assertIn("証印を押すたびに数の大きな数字が一度だけ静かに動き", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle52ResultLabelInstantTests(unittest.TestCase):
    def test_cycle52_result_label_readable_immediately_and_not_scrolled_off(self):
        # サイクル52（継続指示「『良い』と言うまで最初の1分だけ」・きめるへ進んだ直後の結果ラベルの出方）:
        # 実測では到着120msでラベルの opacity が約0.32（kokuIn .55秒で薄く出る途中）で、
        # 等級ボタンへの焦点移動で画面が飛びラベル上部が top -163px と見切れていた。
        # ラベルは等級を考える手がかりそのものなので、動きなしで即時に読めるようにし、
        # 焦点は preventScroll で渡してラベルの上部が見切れないようにする
        import re
        m = re.search(r"#resultLabel \{[^}]*\}", HTML)
        self.assertIsNotNone(m)
        self.assertNotIn("animation", m.group(0))
        self.assertNotIn("animation:kokuIn .55s ease; }", HTML.split("#resultLabel")[1].split("}")[0] if "#resultLabel" in HTML else "")
        self.assertIn('document.querySelector(".gradeBtn").focus({ preventScroll: true });', HTML)
        self.assertIn("結果ラベルを薄く出る動きなしに開いた瞬間から読めるようにし", HTML)
        # スクロール先はサイクル58で resultLabel から stepChip へ変更（優先順位の設計・Cycle58テストで固定）
        self.assertIn("ラベルの先頭が見える位置へ画面を移して", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle54NextLotSceneTopTests(unittest.TestCase):
    def test_cycle54_next_lot_shows_scene_from_top(self):
        # サイクル54（継続指示「『良い』と言うまで最初の1分だけ」・つぎの山へ進んだ直後の見え方）:
        # 実測では従来 bagTap への焦点移動だけが画面を動かし、袋の位置（場面の20%下）に
        # 合わせるため場面の上部が約49px見切れたまま次のロットが始まった。
        # 場面の先頭が見える位置へ移してから、焦点は preventScroll で渡す
        self.assertIn('scene.scrollIntoView({ block: "start" });', HTML)
        self.assertIn('bagTap.focus({ preventScroll: true });', HTML)
        self.assertLess(HTML.index('scene.scrollIntoView({ block: "start" });'),
                        HTML.index('bagTap.focus({ preventScroll: true });'))
        self.assertIn("つぎの山では、場面の先頭が見える位置へ画面を移して", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle55SortBothTraysVisibleTests(unittest.TestCase):
    def test_cycle55_sort_shows_both_trays_from_top(self):
        # サイクル55（継続指示「『良い』と言うまで最初の1分だけ」・みわけるへ進んだ直後の見え方）:
        # 実測（390×844）では到着時に黒い皿が bottom 1006px と画面下端から約162pxはみ出し、
        # わるい粒の多く（ロット1では10粒中7粒）がある黒皿が最初に見えなかった。
        # 皿の先頭が見える位置へ画面を移してから、焦点は preventScroll で渡す（サイクル52・54と同じ流儀）
        self.assertIn('document.getElementById("sortWrap").scrollIntoView({ block: "start" });', HTML)
        self.assertIn('firstGrain.focus({ preventScroll: true })', HTML)
        self.assertLess(HTML.index('document.getElementById("sortWrap").scrollIntoView({ block: "start" });'),
                        HTML.index('firstGrain.focus({ preventScroll: true })'))
        self.assertIn("みわけるでは、入った時に皿の先頭が見える位置へ画面を移して", HTML)
        self.assertIn("白い皿と黒い皿の両方が一度に見えるようにして", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle56SortArrivalShowsYokeTests(unittest.TestCase):
    def test_cycle56_sort_arrival_shows_yoke_tray(self):
        # サイクル56（継続指示「『良い』と言うまで最初の1分だけ」・みわける到着時の見え方の残り）:
        # サイクル55で両皿は1画面に入ったが、実測（390×844）では受け皿（#yokeWrap）が
        # top 820／bottom 893px と下端の外にあり、よけた粒の行き先が見えなかった。
        # 見本ペアは写真とドット絵の同寸（サイクル35）を保ったまま少し小さくし、
        # 白い皿は粒の段数に余りのある分だけ低くして、受け皿まで到着時の1画面に収める。
        # 資料置き場の見本（.ittoPhoto.ref）は従来の大きさのまま
        self.assertIn(".ittoPhoto { width:min(120px,34%);", HTML)
        self.assertIn("#ittoDot { width:min(120px,34%);", HTML)
        self.assertIn(".ittoPhoto.ref { width:min(200px,60%);", HTML)
        self.assertIn("#whiteTray { min-height:170px; }", HTML)
        self.assertIn(".plate {", HTML)
        self.assertIn("min-height:200px", HTML)  # 黒い皿（5段）・全体の既定は従来のまま
        self.assertIn("みわけるでは、見本を少し小さくし、白い皿も余りの分だけ低くして", HTML)
        self.assertIn("よけた粒の受け皿まで到着時の1画面に収まるようにしました", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle57HakaruDoneNextButtonVisibleTests(unittest.TestCase):
    def test_cycle57_hakaru_done_next_button_fully_visible(self):
        # サイクル57（継続指示「『良い』と言うまで最初の1分だけ」・はかる完了時の見え方）:
        # 実測（390×844）では完了時に次ボタンが top 797／bottom 845px と画面下端（844px）を
        # 1pxはみ出して見切れた。ボタン全体が見える位置へ画面を移し（サイクル52・54・55と
        # 同じ流儀）、下端の余白は scroll-margin-bottom で残し、焦点は preventScroll で渡す
        self.assertIn("scroll-margin-bottom:16px;", HTML)
        self.assertIn('nextBtn.scrollIntoView({ block: "nearest" });', HTML)
        meter_done = HTML.index('phase = "hakaru-done";')
        scroll_pos = HTML.index('nextBtn.scrollIntoView({ block: "nearest" });')
        focus_pos = HTML.index('nextBtn.focus({ preventScroll: true });', meter_done)
        self.assertLess(meter_done, scroll_pos)
        self.assertLess(scroll_pos, focus_pos)
        self.assertIn("はかるが終わると、次へ進むボタンが画面の下端で見切れないよう", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle58KimeruArrivalChipVisibleTests(unittest.TestCase):
    def test_cycle58_kimeru_arrival_shows_chip_and_hint_first(self):
        # サイクル58（継続指示「『良い』と言うまで最初の1分だけ」・きめる到着時の優先順位）:
        # 実測（390×844）ではサイクル52のラベル先頭合わせだと段階チップ top -200px・
        # 案内 -147px と画面外で、今どの段階かと「等級を えらぶ」が到着時に読めなかった。
        # チップ＋案内＋ラベル544px＋ボタンは合計が画面を超え全部は同時に入らないため、
        # 優先順位を ①チップと案内 ②ラベルの先頭から読む順 ③ボタンはラベルを読んだ後の
        # 短いスクロール先と決め、移す先をチップにする。焦点は preventScroll のまま
        self.assertIn('document.getElementById("stepChip").scrollIntoView({ block: "start" });', HTML)
        self.assertNotIn('document.getElementById("resultLabel").scrollIntoView', HTML)
        kimeru = HTML.index('phase = "kimeru";')
        scroll_pos = HTML.index('document.getElementById("stepChip").scrollIntoView', kimeru)
        focus_pos = HTML.index('document.querySelector(".gradeBtn").focus({ preventScroll: true });', kimeru)
        self.assertLess(scroll_pos, focus_pos)
        self.assertIn("きめるでは、入った時に段階の案内が見える位置へ画面を移し", HTML)
        self.assertIn("案内と結果ラベルを先頭から読んでから等級を選ぶ優先順にしました", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)

    def test_cycle59_back_to_sort_shows_sort_from_top(self):
        # サイクル59（継続指示「『良い』と言うまで最初の1分だけ」・皿へ戻る時の見え方）:
        # 実測（390×844）では「皿をみる」で戻ると sortWrap の先頭が top -267px と見切れ、
        # 顔と一等米の見本が見えず、前進時（サイクル55・56）と違う見え方になっていた。
        # 戻る時も前進時と同じく sortWrap の先頭へ画面を移し、焦点は preventScroll で渡す
        back = HTML.index('backToSort.addEventListener')
        scroll_pos = HTML.index('document.getElementById("sortWrap").scrollIntoView({ block: "start" });', back)
        focus_pos = HTML.index('remain.focus({ preventScroll: true })', back)
        self.assertLess(scroll_pos, focus_pos)
        self.assertIn('document.getElementById("machineBtn").focus({ preventScroll: true })', HTML[back:])
        self.assertNotIn('if (remain) remain.focus();', HTML)
        self.assertIn("きめるで外れて皿へ戻る時も、入った時と同じく皿の先頭が見える位置へ画面を移し", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)

    def test_cycle60_hakaru_arrival_shows_chip_first(self):
        # サイクル60（継続指示「『良い』と言うまで最初の1分だけ」・はかる到着時の見え方）:
        # 実測（375×667）では焦点任せだと到着時に段階チップが top -39px と画面外で、
        # 今どの段階かが見えなかった（390×844では top 132px で見え、画面の高さに依存した）。
        # きめる（サイクル58）と同じくチップが見える位置へ画面を移してから、焦点は
        # preventScroll で水分計ボタンへ渡す（移す先はチップ・動きは付けない）
        hakaru = HTML.index('phase = "hakaru";')
        scroll_pos = HTML.index('document.getElementById("stepChip").scrollIntoView({ block: "start" });', hakaru)
        focus_pos = HTML.index('document.getElementById("meterBtn").focus({ preventScroll: true });', hakaru)
        self.assertLess(scroll_pos, focus_pos)
        self.assertNotIn('document.getElementById("meterBtn").focus();', HTML)
        self.assertIn("はかるでは、入った時に段階の案内が見える位置へ画面を移し", HTML)
        self.assertIn("小さい画面でも案内と水分計が一度に見えるようにしました", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle61SortCompactSmallScreenTests(unittest.TestCase):
    def test_cycle61_sort_compact_on_short_screens(self):
        # サイクル61（継続指示「『良い』と言うまで最初の1分だけ」・みわける到着時の小さい画面）:
        # 実測（375×667）では到着時に黒い皿の下端759px・受け皿769–842pxが画面外で、
        # よけた粒も画面外（803px）に着地した。390×844では受け皿の下端842pxで収まるため、
        # 大きい画面は変えず、高さ780px以下の画面だけ「みわける」の中身を詰める。
        # 顔は56px（正面の表情が読める大きさ）、見本は写真とドット絵の同寸を保ち、
        # 皿の min-height は粒の並びの下端（白162px・黒192px）より下げない
        self.assertIn("@media (max-height:780px)", HTML)
        media = HTML.index("@media (max-height:780px)")
        block = HTML[media:HTML.index("#sortPct { margin:8px 2px 4px;", media)]
        self.assertIn("#sortWrap .inspectorFace { width:56px; height:56px; margin-bottom:4px; }", block)
        self.assertIn("#ittoPair .ittoPhoto, #ittoPair #ittoDot { width:min(68px,34%); }", block)
        self.assertIn("#sortWrap #whiteTray { min-height:162px; }", block)
        self.assertIn("#sortWrap #blackTray { min-height:194px; }", block)
        self.assertIn("#sortWrap #yokeWrap { margin-top:4px; padding:5px 12px; min-height:54px; }", block)
        # 大きい画面の従来値は不変
        self.assertIn(".ittoPhoto { width:min(120px,34%);", HTML)
        self.assertIn("#whiteTray { min-height:170px; }", HTML)
        self.assertIn("みわけるでは、小さい画面（高さが低い画面）だけ顔と見本と皿を詰めて", HTML)
        self.assertIn("黒い皿と受け皿まで到着時の1画面に収まるようにしました", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)


class Cycle62GradeCompactSmallScreenTests(unittest.TestCase):
    def test_cycle62_grade_compact_on_short_screens(self):
        # サイクル62（継続指示「『良い』と言うまで最初の1分だけ」・きめる到着時の小さい画面）:
        # 実測（375×667）では到着時に結果ラベルの下端746pxが画面外で、等級を考える
        # 肝心な行・合計・めやすが見えなかった。390×844ではラベルが収まるため、
        # 大きい画面は変えず、高さ780px以下の画面だけ「きめる」の中身を詰める。
        # 顔は56px（正面の表情が読める大きさ）、ラベルの割合の数字は22pxまで
        self.assertIn("@media (max-height:780px)", HTML)
        media = HTML.index("@media (max-height:780px)")
        block = HTML[media:HTML.index("#sortPct { margin:8px 2px 4px;", media)]
        self.assertIn("#gradeWrap .inspectorFace { width:56px; height:56px; margin-bottom:4px; }", block)
        self.assertIn("#gradeWrap #resultLabel { padding:8px 12px 6px; margin-bottom:8px; }", block)
        self.assertIn("#gradeWrap .labelRow .lp { font-size:22px; }", block)
        self.assertIn("#gradeWrap .gradeBtn { padding:14px 6px; font-size:28px; }", block)
        # 大きい画面の従来値は不変
        self.assertIn("#resultLabel { background:#fff; border-radius:4px; padding:12px 14px 10px;", HTML)
        self.assertIn(".labelRow .lp { font-size:28px;", HTML)
        self.assertIn("きめるでは、小さい画面（高さが低い画面）だけ顔と結果ラベルを詰めて", HTML)
        self.assertIn("結果ラベル全体が到着時の1画面に収まるようにしました", HTML)
        self.assertNotIn("setInterval", HTML)
        self.assertNotIn("alert(", HTML)
