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
        self.assertRegex(HTML, r'class="photo" data-src="kensa/kokusashi\.webp"')
        self.assertRegex(HTML, r'class="photo" data-src="kensa/ittomai\.webp"')
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

    def test_no_focus_ring_for_finger_play(self):
        # 指で遊ぶ間は focus() を呼ばない（ブラウザが水分計や袋にフォーカスの枠を描く）。キーを使った人にだけ移す
        self.assertNotIn(".focus({ preventScroll:true })", HTML.replace("if (keyUser) el.focus({ preventScroll:true });", ""))
        self.assertIn("keyUser = true;", HTML)
        for el in ('$("meterBtn")', "token", '$("bagBig")', "nextBtn"):
            self.assertIn("focusIfKeys(" + el + ");", HTML)

    def test_long_press_shows_no_ios_sheet(self):
        # 一等米の写真・🤲・はんこを長押ししても「画像を保存」などのシートが出ない（#app から継承）
        self.assertRegex(HTML, r"#app \{[^}]*-webkit-touch-callout:none")

    def test_idle_card_keeps_measuring(self):
        self.assertIn('kind:"kensa"', HTML)
        self.assertIn('sendTap("like"', HTML)
        self.assertIn('sendTap("return")', HTML)
        self.assertIn('id="returnLink" href="https://ricepia.jp/"', HTML)

    def test_idle_card_never_falls_off_screen(self):
        # 文字を大きくしてカードが2段になっても、下端に合わせて上へ伸びる（「サイトへ もどる」が画面の外に出ない）
        self.assertRegex(HTML, r"#idleCard \{[^}]*bottom:calc\(5px \+ env\(safe-area-inset-bottom\)\)")
        self.assertNotRegex(HTML, r"#idleCard \{[^}]*top:0")

    def test_head_grows_with_large_text(self):
        # 文字150%以上でも題字「農産物検査」と段階の点が頭の枠からはみ出さない（高さは最低値）
        self.assertRegex(HTML, r"#head \{[^}]*min-height:66px")
        self.assertNotRegex(HTML, r"#head \{[^}]*[^-]height:66px")

    def test_foot_grows_with_large_text(self):
        # 文字200%の端末では案内が2行になる。下の枠は最低74pxで、必要な分だけ伸びて皿に重ならない
        self.assertRegex(HTML, r"#foot \{[^}]*min-height:calc\(74px \+ env\(safe-area-inset-bottom\)\)")
        self.assertNotRegex(HTML, r"#foot \{[^}]*[^-]height:calc\(74px")

    def test_idle_card_stays_in_foot(self):
        # 皿や袋にかぶせない
        foot = HTML[HTML.index('<div id="foot">'):HTML.index("</main>")]
        self.assertIn('id="idleCard"', foot)
        self.assertIn("お疲れ様です", foot)

    def test_first_bag_shows_bad_grains_soon(self):
        self.assertIn("armHint(lotIndex === 0 ? 1200 : 6000);", HTML)

    def test_tap_allows_a_little_finger_drift(self):
        # わるい粒のタップは、指が12pxまでずれても効く（7px では実機の指のぶれで空振りしやすい）
        self.assertIn("Math.hypot(e.clientX - sortDrag.x, e.clientY - sortDrag.y) > 12) sortDrag.moved = true;", HTML)

    def test_pc_hint_does_not_say_two_fingers(self):
        # マウスの PC では「ふたゆび」ではなく 🔍 を指す
        self.assertIn('const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;', HTML)
        self.assertIn('if (finePointer) { hint.textContent = "🔍 で 寄る"; guideAt("press", zoomBtn); }', HTML)

    def test_non_zoomer_still_gets_a_cue(self):
        # 寄らない人にも、ズーム待ちの間に6秒でわるい粒がふくらむ（遠目では割れ目の粒が良い粒と同じ絵）
        self.assertIn('else { hint.textContent = "🔍 ふたゆびで ズーム"; guideAt("pinch", plate); }', HTML)
        self.assertIn("    armHint(6000); /* 寄らない人にも", HTML)
        self.assertIn("  else armHint(6000);", HTML)

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

    def test_upward_guide_starts_from_bottom_edge(self):
        # 上へ引く手本（等級）は、ボタンの字を指で隠さないよう下のふちから始める
        self.assertIn('(kind === "move" && gy < 0 ? 0.82 : 0.5)', HTML)

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

    def test_poke_demo_moves_as_far_as_needed(self):
        # 手本の指は、さすのに必要な押しの長さだけ動く（固定の46pxではない）
        self.assertIn('poke.style.setProperty("--pokeDx", -(P.rest - P.inAt + 8) + "px");', HTML)
        self.assertIn("translateX(var(--pokeDx, -46px))", HTML)

    def test_probe_inserts_with_a_short_push(self):
        # 先が袋に少し入ったら「さした」（サイクル74で0.66→0.82にゆるめた）。引く長さは入れた深さから
        self.assertIn("P.inAt = bag.offsetLeft + bag.offsetWidth * 0.82;", HTML)
        self.assertIn("if (x <= P.inAt) {", HTML)
        self.assertIn("(x - P.deep) / (P.rest - P.deep) - 0.02", HTML)

    def test_probe_pull_releases_grains_early_and_finishes_at_eighty_percent(self):
        # 引き抜き: 引いたらすぐ（7%ほどで）粒が落ち始め、8割引けば全部落ちて終わる。
        # 以前は15%引いても0粒、最後まで引き切らないと終わらなかった
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        expr = HTML[HTML.index("const want = Math.floor"):HTML.index("/* 引いたらすぐ粒が落ち始め")]
        expr = expr.replace("const want =", "").strip().rstrip(";")
        script = (
            "const PLATE_GRAINS = 20; const P = { deep:0, rest:100 };\n"
            "const want = (frac) => { const x = frac * 100; return Math.min(" + expr + ", PLATE_GRAINS); };\n"
            "console.log(JSON.stringify([0, 0.02, 0.07, 0.1, 0.5, 0.79, 0.8, 1].map(want)));"
        )
        out = subprocess.run([node, "-e", script], capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stderr)
        got = json.loads(out.stdout.strip())
        self.assertEqual(got, [0, 0, 1, 2, 12, 19, 20, 20])

    def test_failed_tries_also_count_toward_auto(self):
        # タップだけでなく「進まなかった試し」（違う向きの引き・届かない運び・短い引き上げ・短いおろし）も3回で自動
        self.assertIn("if (P.done || P.inserted) return; /* さす前に指を離したら", HTML)
        self.assertIn("if (++senseTaps >= NUDGE_LIMIT) autoSense();", HTML)
        self.assertIn("if (++taps >= 2) { taps = 0; pickGrade(btn); }", HTML)
        self.assertIn("if (++hankoTaps >= NUDGE_LIMIT) { dropHanko(); return; }", HTML)

    def test_crank_turning_carries_over_between_strokes(self):
        # まっすぐなでるだけ（真ん中を外す）でも、角度が持ち越されていずれはかれる。袋ごと・1回はかるごとに戻す
        self.assertIn("crankTurned += Math.abs(d);", HTML)
        self.assertIn("crankTurned = 0; takeReading();", HTML)
        self.assertIn("meterTaps = 0; crankTurned = 0;", HTML)
        self.assertNotIn("turned:0", HTML)

    def test_first_bag_crank_is_short(self):
        self.assertIn("crankTurned >= (lotIndex === 0 ? 80 : 160)", HTML)
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
let crankTurned = 0, crankDrag = {id:1, last:0, sum:0, x:0, y:0, moved:false};
""" + reading + move + """
onMove({pointerId:1, clientX:10, clientY:0, angle:45});
assert.equal(measured, 0);
assert.equal(lcd.textContent, '--.-');
onMove({pointerId:1, clientX:20, clientY:0, angle:90});
assert.equal(measured, 1);
assert.equal(lcd.textContent, LOT.moisture[0].toFixed(1));
onMove({pointerId:1, clientX:30, clientY:0, angle:135});
assert.equal(measured, 1);
assert.equal(lcd.textContent, LOT.moisture[0].toFixed(1));
onMove({pointerId:1, clientX:40, clientY:0, angle:180});
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

    def test_next_button_grows_with_large_text(self):
        # 文字150%以上で「つぎの ふくろ」が2行になっても、字がボタンの枠からはみ出さない
        self.assertRegex(HTML, r"#nextBtn \{[^}]*min-height:56px")
        self.assertNotRegex(HTML, r"#nextBtn \{[^}]*[^-]height:56px")

    def test_grade_buttons_grow_with_large_text(self):
        # 文字150%以上でも等級の字がボタンの枠からはみ出さない（高さは最低値、字の分だけ伸びる）
        self.assertRegex(HTML, r"\.gradeBtn \{[^}]*min-height:clamp\(58px, 11vh, 84px\)")
        self.assertNotRegex(HTML, r"\.gradeBtn \{[^}]*[^-]height:clamp")

    def test_lcd_average_fits_small_phone(self):
        # 320px幅で2袋目の平均「16.9%」が水分計の表示枠からはみ出さない（字の大きさに幅の上限も付ける）
        self.assertIn("font:800 clamp(38px, min(11vh, 16vw), 62px)/1 ui-monospace", HTML)

    def test_grade_label_fits_small_phone(self):
        # 320px幅で「規格外」が2行に折れない
        self.assertIn("@media (max-width:340px) {\n    #rows, #gradeBtns { grid-template-columns:84px repeat(4,1fr); }\n    .gradeBtn.small { font-size:14px; }", HTML)

    def test_decide_hint_fits_small_phone(self):
        # 320px幅で1行に収まる長さ（「いちばん右の…」は「↑」だけが2行目に落ちていた）
        self.assertIn('"右の ● の下を 上へ ↑"', HTML)
        self.assertNotIn('"いちばん右の', HTML)

    def test_idle_card_buttons_do_not_wrap(self):
        # 320px幅で「サイトへ もどる」が2行に折れてはみ出さない
        self.assertRegex(HTML, r"#likeBtn,#returnLink \{[^}]*flex:1 1 auto; white-space:nowrap")

    def test_like_closes_card_and_can_retry(self):
        self.assertIn("setTimeout(hideIdleCard, 900);", HTML)
        self.assertIn('sessionStorage.removeItem("kensaLiked")', HTML)

    def test_stamp_layout_follows_rotation(self):
        # 回転しても朱肉がはんこの真下に来て、おろす距離も測り直す
        self.assertIn("if (step === 4 && !stamped) layoutStamp();", HTML)
        self.assertIn('$("pad").style.top = hkBottom + 2 + "px";', HTML)

    def test_landscape_has_compact_layout(self):
        self.assertIn("@media (orientation:landscape) and (max-height:500px)", HTML)

    def test_face_loads_before_photos(self):
        # 遅い回線でも物差しの顔が先に出る（3G相当で 4.0秒→約1秒）。写真は後回し
        self.assertIn('<link rel="preload" as="image" href="kensa/face_dot.webp" fetchpriority="high"/>', HTML)
        self.assertEqual(HTML.count('class="photo" data-src="kensa/'), 2)
        self.assertIn('faceImg.addEventListener("load", loadPhotos);', HTML)
        self.assertIn("setTimeout(loadPhotos, 2500);", HTML)

    def test_button_zoom_centers_on_remaining_bad_grains(self):
        # 🔍で寄るときは皿の真ん中ではなく残っているわるい粒のまんなかへ。
        # 皿の真ん中へ寄ると、端へ広がったわるい粒が拡大画面の外に出て見えなくなる（実測8回中2回）
        body = HTML[HTML.index("function toggleZoom()"):]
        body = body[:body.index("\n}\n")]
        self.assertIn('grains.filter(g => !g.gone && g.kind !== "seiryu")', body)
        self.assertIn("targets.reduce((a, g) => a + g.x, 0) / targets.length", body)
        self.assertIn("targets.reduce((a, g) => a + g.y, 0) / targets.length", body)
        # 離れた2粒は、両方収まる倍率まで引いて寄せる（顔が見える下限つき）
        self.assertIn("Math.max(1.6, Math.min(2.4, fit))", body)

    def test_sense_token_counts_touching_the_face(self):
        # はこぶ: トークンが顔に触れる所まで運べば届く。中心同士54px以内（旧仕様）では、
        # 顔のふちに触れる運び方（中心間78px）でも届かず戻ってしまった（390×844実測）
        body = HTML[HTML.index("function tokenNearFace()"):]
        body = body[:body.index("\n}\n")]
        self.assertIn("(t.width + f.width) / 2 + 8", body)
        self.assertNotIn("f.width * 0.9", body)

    def test_stamp_lands_when_hanko_overlaps_mark(self):
        # おす: はんこの下が証印の円に1/4入る所までおろせば押したことにする。
        # 中心+10px（390×844で約96px）まで求めると、円に触れる所までおろした
        # 自然なおろし方（約50px）では戻ってしまった（390×844実測）
        layout = HTML[HTML.index("function layoutStamp()"):]
        layout = layout[:layout.index("\n}\n")]
        self.assertIn("hankoLand = Math.max(24, mark.offsetTop - hkBottom + mark.offsetHeight * 0.25);", layout)
        # 着地の位置そのものは変えない（stampNow が hankoMax まで落として押す）
        self.assertIn("hankoMax = mark.offsetTop + mark.offsetHeight / 2 - hkBottom + 10;", layout)
        move = HTML[HTML.index('$("bagBig").addEventListener("pointermove"'):]
        self.assertIn("if (y >= hankoLand) stampNow();", move)
        self.assertNotIn("if (y >= hankoMax - 1) stampNow();", move)

    def test_ink_takes_with_a_short_press(self):
        # おす・朱肉: 短くぎゅっと（約0.25秒）押せばインクがつく。450msでは
        # 380msの押しでも付かず「はなさず ぎゅっと」で戻ってしまった（390×844実測）
        self.assertIn("const INK_MS = 250;", HTML)
        self.assertNotIn("const INK_MS = 450;", HTML)
        self.assertIn("INK_MS * motion", HTML)  # 動きを減らす設定では待ちも短くなる従来どおり

    def test_grade_pull_takes_with_a_short_pull(self):
        # きめる: 上へ引く判定は-24px。-34pxでは-30pxの自然な短い引き上げが
        # 届かず戻ってしまった（390×844実測）。手本の-48pxは目安として残す
        self.assertIn("if (dy <= -24)", HTML)
        self.assertNotIn("if (dy <= -34)", HTML)
        self.assertIn('guideAt("move", document.querySelectorAll(".gradeBtn")[worst], 0, -48);', HTML)

    def test_crank_takes_with_a_quarter_turn(self):
        # はかる: 最初の袋は1/4周ほどの短い回しで1回はかれる。170°では90°の
        # 回しは届かず、170°ちょうどの回しもうつり変わりの刻みで実測169.97°に
        # なって届かなかった。判定90°でも90°の回しは実測約86°までしか貯まら
        # ないため80°で受ける（390×844実測・サイクル72）。後の袋も160°
        self.assertIn("crankTurned >= (lotIndex === 0 ? 80 : 160)", HTML)
        self.assertNotIn("crankTurned >= (lotIndex === 0 ? 170 : 350)", HTML)

    def test_nigiru_takes_with_a_short_squeeze(self):
        # 感覚・にぎる: 短くぎゅっと（約0.35秒）にぎれば届く。600msでは
        # 500msの押しでも届かず「はなさず にぎる」で戻ってしまった（390×844実測）
        self.assertIn("const NIGIRU_MS = 350;", HTML)
        self.assertNotIn("const NIGIRU_MS = 600;", HTML)
        self.assertIn("NIGIRU_MS * motion", HTML)  # 動きを減らす設定では待ちも短くなる従来どおり

    def test_probe_inserts_with_a_short_push_of_about_forty_px(self):
        # ぬく・押し込み: 先が袋に少し入る約40pxの短い押しで「さした」になる。
        # 0.66では約69px必要で、40〜60pxの自然な短い押しでは刺さらなかった（390×844実測・サイクル74）
        # 押しの長さ = (1 - 0.82) * 袋幅184px + 6 ≒ 39px。30pxのわざとらしい短さでは届かない範囲に留める
        self.assertIn("P.inAt = bag.offsetLeft + bag.offsetWidth * 0.82;", HTML)
        self.assertNotIn("P.inAt = bag.offsetLeft + bag.offsetWidth * 0.66;", HTML)
        # 手本の指は、さすのに必要な押しの長さだけ動く（rest - inAt + 8）
        self.assertIn('poke.style.setProperty("--pokeDx", -(P.rest - P.inAt + 8) + "px");', HTML)

    def test_bad_grain_tap_tolerates_offset_across_short_axis(self):
        # みわける: 粒の短い向き（v）のタップのゆるさは12px（実効の高さ44px）。
        # 6pxでは中心から16pxずれたタップが外れ、20pxずらした実タップでも
        # わるい粒が取れなかった（390×844実測・サイクル75）。
        # 長い向き（u）はとなりの粒と取り合わないよう6pxのまま
        self.assertIn("const padU = 6 / Z.s, padV = 12 / Z.s;", HTML)
        self.assertIn("Math.abs(u) <= GW / 2 + padU && Math.abs(v) <= GH / 2 + padV", HTML)
        self.assertNotIn("const pad = 6 / Z.s;", HTML)

    def test_grain_tap_tolerates_slip_up_to_flick_boundary(self):
        # みわける: 指がずれたタップは、はじくの境目（24px）まではタップとして受ける。
        # 12pxを超えたずれはドラッグ扱いになり、13〜24pxずれたタップ（縦14・18px／横22px）が
        # どれも無反応だった（390×844実測・サイクル76）
        self.assertIn("Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 24", HTML)
        self.assertNotIn("if (!d.moved && !cancelled && step === 2) {", HTML)
        # ずれる途中のなでで押し動かされた粒も、押した瞬間の粒（startG）で拾う
        self.assertIn("if (!g && d.startG && !d.startG.gone) g = d.startG;", HTML)
        # ズーム後に残った指（見る場所を動かす用）は、離した時にタップにしない
        self.assertIn("startG:null, noTap:true", HTML)
        self.assertIn("!d.noTap", HTML)
        # はじくは従来どおり24pxを超えた速い払いだけ
        self.assertIn("performance.now() - d.t0 < 260 && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 24", HTML)

    def test_assets_exist(self):
        for name in set(re.findall(r'kensa/[a-z_]+\.webp', HTML)):
            self.assertTrue(os.path.exists(os.path.join(ROOT, name)), name)


if __name__ == "__main__":
    unittest.main()
