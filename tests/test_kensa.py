import json
import os
import re
import shutil
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = open(os.path.join(ROOT, "kensa.html"), encoding="utf-8").read()
RULES = HTML[HTML.index("/* KENSA-RULES-START */"):HTML.index("/* KENSA-RULES-END */")]


def run_rules(expr):
    node = shutil.which("node")
    if not node:
        raise unittest.SkipTest("node がないので実行の確認は飛ばす")
    out = subprocess.run([node, "-e", RULES + "\nconsole.log(JSON.stringify(" + expr + "));"],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


class GradeStandardTests(unittest.TestCase):
    """水稲うるち玄米の品位（農林水産省「玄米の検査規格」2026-11-06確認）"""

    def test_table_matches_standard(self):
        table = run_rules("GRADE_TABLE")
        self.assertEqual(table, [
            {"seiryuMin": 70, "moistureMax": 15.0, "totalMax": 15, "shiniMax": 7, "colorMax": 0.1, "ishuMax": 0.4, "ibutsuMax": 0.2},
            {"seiryuMin": 60, "moistureMax": 15.0, "totalMax": 20, "shiniMax": 10, "colorMax": 0.3, "ishuMax": 0.8, "ibutsuMax": 0.4},
            {"seiryuMin": 45, "moistureMax": 15.0, "totalMax": 30, "shiniMax": 20, "colorMax": 0.7, "ishuMax": 1.7, "ibutsuMax": 0.6},
        ])

    def test_old_breakdown_is_gone(self):
        # うるち玄米の異種穀粒は一本化された。もみ・麦の内訳はもち玄米の規格
        self.assertNotIn("momiMax", HTML)
        self.assertNotIn("mugiMax", HTML)

    def test_moisture_addition_is_one_percent(self):
        self.assertEqual(run_rules("MOISTURE_ADD"), 1.0)


class LotTests(unittest.TestCase):
    def test_lot_grades(self):
        # 0=1等 1=2等 2=3等 3=規格外
        self.assertEqual(run_rules("LOTS.map(lotGrade)"), [0, 3, 1, 2, 3, 0])

    def test_first_lot_is_quick(self):
        self.assertEqual(run_rules("(l => l.higai + l.shini + l.mijuku + l.color)(LOTS[0])"), 2)

    def test_second_lot_is_only_moisture(self):
        items = run_rules("itemGrades(lotPercents(LOTS[1]))")
        self.assertEqual(items, {"moisture": 3, "seiryu": 0, "shini": 0, "color": 0, "total": 0})

    def test_moisture_avoids_addition_band(self):
        # 15.0〜16.0%は「当分の間の加算」の読み方が絡むので使わない
        for avg in run_rules("LOTS.map(l => moistureAverage(l.moisture))"):
            self.assertFalse(15.0 < avg <= 16.0, avg)

    def test_mijuku_not_in_total(self):
        self.assertEqual(run_rules("lotPercents(LOTS[5])"),
                         {"moisture": 14.1, "seiryu": 70, "shini": 5, "color": 0, "total": 5})

    def test_boundary_values(self):
        self.assertEqual(run_rules("itemGrades({moisture:16.0, seiryu:70, shini:7, color:0.1, total:15})"),
                         {"moisture": 0, "seiryu": 0, "shini": 0, "color": 0, "total": 0})
        self.assertEqual(run_rules("itemGrades({moisture:16.1, seiryu:44, shini:21, color:0.8, total:31})"),
                         {"moisture": 3, "seiryu": 3, "shini": 3, "color": 3, "total": 3})


class FlowTests(unittest.TestCase):
    def test_steps_in_order(self):
        self.assertIn('const STEPS = ["ぬく", "はかる", "みわける", "きめる", "おす"];', HTML)

    def test_real_photos_stay_photos(self):
        self.assertRegex(HTML, r'class="photo" src="kensa/kokusashi\.webp"')
        self.assertRegex(HTML, r'class="photo" src="kensa/ittomai\.webp"')
        self.assertIn(".photo { image-rendering:auto; }", HTML)

    def test_nothing_stops_the_flow(self):
        for word in ("alert(", "confirm(", "setInterval", "showModal", "<dialog"):
            self.assertNotIn(word, HTML)

    def test_no_competition(self):
        for word in ("スコア", "ランキング", "順位", "制限時間"):
            self.assertNotIn(word, HTML)

    def test_game_fits_one_screen(self):
        self.assertIn("height:100dvh", HTML)
        self.assertRegex(HTML, r"#app \{[^}]*overflow:hidden")

    def test_swipe_in_game_does_not_scroll_page(self):
        # ● を上へ引く・はんこを下ろす指で、ページが下の説明へ流れない。📖で下へ行ったあとは指で戻れる
        self.assertIn("html:not(.scrolled) { touch-action:none; }", HTML)
        self.assertIn('classList.toggle("scrolled", window.scrollY > 0)', HTML)
        self.assertIn("html.scrolled #guide { visibility:hidden; }", HTML)  # 説明を読む間は手本の指が浮かない

    def test_zoom_button_works_right_after_a_swipe(self):
        # 速くなでた直後のタップは click にならないことがある（Chrome のフリング抑止）。粒と同じく pointerup で効かせる
        self.assertIn('zoomBtn.addEventListener("pointerup", toggleZoom);', HTML)
        self.assertIn('zoomBtn.addEventListener("click", (e) => { if (e.detail === 0) toggleZoom(); });', HTML)
        self.assertIn('nextBtn.addEventListener("pointerup", leaveBag);', HTML)
        self.assertIn('nextBtn.addEventListener("click", (e) => { if (e.detail === 0) leaveBag(); });', HTML)

    def test_long_press_shows_no_ios_sheet(self):
        # 一等米の写真・🤲・はんこを長押ししても「画像を保存」などのシートが出ない（#app から継承）
        self.assertRegex(HTML, r"#app \{[^}]*-webkit-touch-callout:none")

    def test_idle_card_keeps_measuring(self):
        self.assertIn('kind:"kensa"', HTML)
        self.assertIn('sendTap("like"', HTML)
        self.assertIn('sendTap("return")', HTML)
        self.assertIn('id="returnLink" href="https://ricepia.jp/"', HTML)

    def test_idle_card_stays_in_foot(self):
        # 皿や袋にかぶせない
        foot = HTML[HTML.index('<div id="foot">'):HTML.index("</main>")]
        self.assertIn('id="idleCard"', foot)
        self.assertIn("お疲れ様です", foot)

    def test_first_bag_shows_bad_grains_soon(self):
        self.assertIn("armHint(lotIndex === 0 ? 1200 : 6000);", HTML)

    def test_touching_good_grain_keeps_hint_timer(self):
        fn = HTML[HTML.index("function tapGrain(g) {"):HTML.index("g.gone = true; badLeft--;")]
        self.assertNotIn("armHint", fn)

    def test_motions_are_not_only_taps(self):
        # さす・まわす・なでる・ズーム・におう/かむ/にぎる・ひきあげる・朱肉・おろす・スワイプ
        for needle in ("function moveProbe(x)", "function crankPointer(e)", "function brush(from, to)", "function startPinch()",
                       'const SENSES = ["niou", "kamu", "nigiru"];', "function pickGrade(btn)", "function inkDone()", "function stampNow()", "function leaveBag()"):
            self.assertIn(needle, HTML)

    def test_bite_tells_moisture(self):
        # 水分の高い袋（2袋目）はかむ番で、やわらかい
        self.assertEqual(run_rules("LOTS[1].moisture[2] > 16.0"), True)
        self.assertIn('"niou", "kamu", "nigiru"', HTML)
        self.assertIn("むにゅ", HTML)

    def test_first_bag_guide(self):
        # 最初の袋だけ、動かし方を指で見せる
        self.assertIn("if (lotIndex !== 0) return;", HTML)
        for kind in ('"circle"', '"sweep"', '"pinch"', '"move"', '"press"'):
            self.assertIn("guideAt(" + kind, HTML)
        self.assertIn('pointer-events:none; opacity:0; transition:opacity', HTML)

    def test_flick_knock_twist(self):
        # はじく・トントン・ひねる。タップも残す
        for needle in ("function flickGrain(g, dx, dy)", "function knockPlate()", "function twistPlate(deg)", "tapGrain(g);"):
            self.assertIn(needle, HTML)
        self.assertIn("twistDone = false;", HTML)

    def test_double_tap_and_shake(self):
        self.assertIn("tapNow - lastGoodTap < 320", HTML)
        self.assertIn("Math.hypot(e.clientX - lastGoodX, e.clientY - lastGoodY) < 40", HTML)  # 離れた粒を続けて突いても寄らない
        # iPhone は許可の画面が出るので、振るは使わない
        self.assertIn('typeof DeviceMotionEvent.requestPermission === "function"', HTML)

    def test_first_bag_crank_is_short(self):
        self.assertIn("crankDrag.turned >= (lotIndex === 0 ? 170 : 350)", HTML)
        # タップだけで進めない: 代替は3回のまま
        self.assertIn("if (++bagTaps >= NUDGE_LIMIT) { autoProbe(); return; }", HTML)

    def test_crank_keeps_reading_until_next_measurement(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        reading = HTML[HTML.index("function takeReading() {"):HTML.index("function crankPointer(e) {")]
        move = HTML[HTML.index('$("sceneMeter").addEventListener("pointermove",'):HTML.index("function endCrank(e) {")]
        script = RULES + """
const assert = require('node:assert/strict');
let onMove, measured = 0, lotIndex = 0, crankAngle = 0, step = 1;
const LOT = LOTS[0], hint = {}, lcd = {textContent:'--.-'};
const elements = {lcd, slots:{children:[{}, {}, {}]}, crankArm:{style:{}},
  sceneMeter:{addEventListener:(_, fn) => { onMove = fn; }}};
const $ = id => elements[id];
const pop = () => {}, tick = () => {};
const crankPointer = e => ({a:e.angle, far:true});
let crankDrag = {id:1, last:0, turned:0, sum:0, x:0, y:0, moved:false};
""" + reading + move + """
onMove({pointerId:1, clientX:10, clientY:0, angle:90});
assert.equal(measured, 0);
assert.equal(lcd.textContent, '--.-');
onMove({pointerId:1, clientX:20, clientY:0, angle:180});
assert.equal(measured, 1);
assert.equal(lcd.textContent, LOT.moisture[0].toFixed(1));
onMove({pointerId:1, clientX:30, clientY:0, angle:-90});
assert.equal(measured, 1);
assert.equal(lcd.textContent, LOT.moisture[0].toFixed(1));
onMove({pointerId:1, clientX:40, clientY:0, angle:0});
assert.equal(measured, 2);
assert.equal(lcd.textContent, LOT.moisture[1].toFixed(1));
"""
        subprocess.run([node, "-e", script], capture_output=True, text=True, check=True)

    def test_second_finger_does_not_mix(self):
        self.assertIn("if (e.pointerId !== P.drag.id) return;", HTML)
        self.assertIn("if (e.pointerId !== crankDrag.id) return;", HTML)
        self.assertIn("if (pts.size === 1 && !sortDrag) {", HTML)

    def test_crack_only_shows_when_zoomed(self):
        self.assertIn('if (kind === "higai" && !far) px(', HTML)
        self.assertIn('if (far) return spriteCache[key] = c.toDataURL();', HTML)

    def test_motion_has_fallback(self):
        # 動かし方が分からなくても止まらない。キーボードでも進める
        self.assertIn("const NUDGE_LIMIT = 3;", HTML)
        for needle in ('if (e.detail === 0) autoProbe();', 'e.detail === 0 && step === 1', 'e.detail === 0 && step === 4', 'if (e.detail === 0) autoSense();', 'if (e.detail === 0) pickGrade(btn);'):
            self.assertIn(needle, HTML)

    def test_page_zoom_does_not_fight_pinch(self):
        self.assertRegex(HTML, r"#plate \{[^}]*touch-action:none")
        self.assertIn('addEventListener("gesturestart"', HTML)

    def test_like_closes_card_and_can_retry(self):
        self.assertIn("setTimeout(hideIdleCard, 900);", HTML)
        self.assertIn('sessionStorage.removeItem("kensaLiked")', HTML)

    def test_landscape_has_compact_layout(self):
        self.assertIn("@media (orientation:landscape) and (max-height:500px)", HTML)

    def test_assets_exist(self):
        for name in set(re.findall(r'kensa/[a-z_]+\.webp', HTML)):
            self.assertTrue(os.path.exists(os.path.join(ROOT, name)), name)


if __name__ == "__main__":
    unittest.main()
