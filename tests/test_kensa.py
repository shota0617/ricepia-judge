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

    def test_first_bag_bad_grains_show_faces_after_spread(self):
        # サイクル83: 最初の袋だけ、なでて広げた時点でわるい粒2粒に顔が出て見える大きさになり、
        # 🔍やピンチで寄らなくてもつまめる（寄る操作は残すが案内しない）。2袋目以降は従来どおり寄ると顔が出る
        self.assertIn('function firstBagFace(g) { return lotIndex === 0 && spread && g.kind !== "seiryu"; }', HTML)
        self.assertIn('function grainMood(g) { return (isNear || firstBagFace(g)) ? "normal" : "far"; }', HTML)
        self.assertIn('g.img.style.transform = firstBagFace(g) ? "scale(1.5)" : "";', HTML)
        self.assertIn("if (now !== spread && now) { spread = true; if (lotIndex === 0) refreshBadFaces(); updateSortHint(); }", HTML)
        self.assertIn('if (lotIndex === 0) { guideOff(); hint.textContent = "わるい粒を つまむ"; armHint(1200);', HTML)

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
        self.assertIn("tapNow - lastGoodTap < 500", HTML)  # サイクル77で320→500msにゆるめた（ゆっくりした2回タップでも寄る）
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
const pop = () => {}, tick = () => {}, meterBeep = () => {}, crankSound = () => {};
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
        # 中心は外接矩形のまんなか（サイクル86で平均の重心から更新: 3粒以上では片側にはみ出すため）
        self.assertIn("const cx = (Math.min(...xs) + Math.max(...xs)) / 2;", body)
        self.assertIn("const cy = (Math.min(...ys) + Math.max(...ys)) / 2;", body)
        # 離れた2粒は、両方収まる倍率まで引いて寄せる（サイクル86で重心の皿中央寄せへ更新）
        self.assertIn("let s = Math.min(2.4, fit);", body)

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
        # はじくは24pxを超えた払いだけ（時間の境目はサイクル79で400msへ）
        self.assertIn("performance.now() - d.t0 < 400 && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 24", HTML)

    def test_good_grain_double_tap_takes_a_slow_double_tap(self):
        # みわける: よい粒の2回タップで寄る判定の間隔は500msまで受ける。
        # 320msでは約410ms間隔のゆっくりした2回タップが届かず、ただ揺れるだけだった
        # （390×844実測・サイクル77）。距離40pxは、となりの別の粒を続けて突いた時に
        # 寄せと誤らないためそのまま
        self.assertIn('tapNow - lastGoodTap < 500', HTML)
        self.assertNotIn('tapNow - lastGoodTap < 320', HTML)
        self.assertIn('Math.hypot(e.clientX - lastGoodX, e.clientY - lastGoodY) < 40', HTML)

    def test_flick_takes_with_a_slow_flick(self):
        # みわける: はじく判定は400msまで受ける。
        # 260msでは約300〜400msのゆっくりした払いが届かず無反応だった
        # （390×844実測・サイクル79）。ゆっくりなでて広げる払い（550ms以上）は
        # はじきとしないため、境目は400msに留める
        self.assertIn("performance.now() - d.t0 < 400", HTML)
        self.assertNotIn("performance.now() - d.t0 < 260", HTML)

    def test_bag_swipe_takes_with_a_short_swipe(self):
        # おす後: 押した袋を横へ流す判定は40pxから受ける。
        # 70pxでは30〜65pxの自然な短い横なでが全て戻ってしまった
        # （390×844実測・サイクル78）。タップのずれの境目24pxよりは大きく留める
        self.assertIn('if (dx >= 40) { bagSwipe = null; leaveBag(); }', HTML)
        self.assertNotIn('if (dx > 70) { bagSwipe = null; leaveBag(); }', HTML)

    def test_twist_takes_with_a_small_twist(self):
        # みわける: ひねる判定は20°から受ける。
        # 35°では22°・28°の自然な小さなひねりでもわるい粒の印が付かず無反応だった
        # （390×844実測・サイクル80）。ピンチで偶然回る18°以下は印を付けない
        self.assertIn("Math.abs(p.twist) >= 20", HTML)
        self.assertNotIn("Math.abs(p.twist) >= 35", HTML)

    def test_first_miss_reshows_guide_finger(self):
        # 空振りの受け止め統一（Fable設計・サイクル81）: どの所作も空振り1回目で
        # 手本の指👆がもう一度同じ動きを見せる。従来は触った瞬間に消えた指が
        # 戻らず、1回目では道具の小さな揺れしか返らなかった（390×844実測）。
        # 2回目の道具の動き・3回目（等級は2回）の自動代替は従来どおり
        self.assertIn('if (bagTaps === 1 && lotIndex === 0) $("poke").style.display = "";', HTML)  # ぬく
        self.assertIn('if (meterTaps === 1) guideAt("circle", $("crank"));', HTML)  # はかる
        self.assertIn("function guideSense()", HTML)  # 感じる: 開始時と空振り1回目で同じ手本
        self.assertIn("if (senseTaps === 1) guideSense();", HTML)
        self.assertIn("else if (senseTaps === 1) guideSense();", HTML)
        self.assertIn('if (taps === 1) guideAt("move", document.querySelectorAll(".gradeBtn")[lotGrade(LOT)], 0, -48);', HTML)  # きめる
        self.assertIn('if (hankoTaps === 1) guideAt("move", $("pad"), 0, 24);', HTML)  # おす・朱肉（サイクル87で押し下げの手本に変更）
        self.assertIn('if (hankoTaps === 1) guideAt("move", $("hanko"), 0, hankoMax);', HTML)  # おす・おろし

    def test_second_miss_tool_does_half(self):
        # 空振りの受け止め統一（Fable設計・サイクル84）: 2回目では道具が半分やって見せる。
        # 従来は2回目も1回目と同じ小さな揺れ（ぬく18px）か無反応（はこぶ・おろし）で、
        # 3回目の自動代替まで「半分」の段階がなかった。状態は進めない（アニメーションのみ）
        self.assertIn("if (bagTaps === 2)", HTML)  # ぬく: さす所までの半分
        self.assertIn("const halfX = P.x - (P.x - P.inAt) / 2;", HTML)
        self.assertIn("else if (senseTaps === 2)", HTML)  # はこぶ: 顔までの半分
        self.assertIn("if (senseTaps === 2) { token.classList.add(\"squeeze\");", HTML)  # にぎる: にぎる形を短く見せる
        self.assertIn("if (hankoTaps === 2)", HTML)  # おす・おろし: 押せる所までの半分
        self.assertIn('"translateY(" + hankoLand / 2 + "px)"', HTML)

    def test_opening_attract_moves_probe_once_before_touch(self):
        # 開いた瞬間の誘い（Fable設計の足すもの1・サイクル82）: 最初の袋だけ、
        # 触れる前に穀刺しが一度だけ約2秒かけて袋の口（P.inAt）へ寄って戻る。
        # 触れたら（pointerdown／自動代替）止まる。2袋目以降では出さない
        self.assertIn("function startProbeAttract()", HTML)
        self.assertIn("if (lotIndex !== 0 || P.done || P.inserted) return;", HTML)
        self.assertIn("startProbeAttract();", HTML)  # startLot から呼ぶ
        self.assertIn("duration:2000 * motion", HTML)
        self.assertIn("iterations:1", HTML)
        self.assertIn('"translate(" + P.inAt + "px," + P.y + "px)", offset:.5', HTML)
        self.assertIn("stopProbeAttract(); /* 触れたら誘いは止まる（サイクル82） */", HTML)

    def test_pinch_faces_show_with_a_small_pinch(self):
        # みわける: 顔が出る倍率は1.2倍から受ける。
        # 1.5倍では指を少し開く自然なピンチ（1.2倍・1.35倍）で寄っても顔が出ず、
        # 寄れていないように見えた（390×844実測・サイクル85）。
        # ごく小さなピンチ（1.1倍以下）では顔を出さない範囲に留める
        self.assertIn("const ZOOM_MAX = 3.4, FACE_AT = 1.2;", HTML)
        self.assertNotIn("FACE_AT = 1.5", HTML)
        self.assertIn("const near = Z.s >= FACE_AT;", HTML)

    def test_button_zoom_centers_bad_grains_on_plate_center(self):
        # 🔍で寄るときは、わるい粒の重心を皿の真ん中へ持ってくる。
        # 重心の位置を固定したまま寄せると、重心が端寄りのとき反対側の粒が画面の外へ出た
        # （390×844実測: 自然な広げ方6回中1回・fit 2.27でも画面外、両端の境界では2粒とも完全に外）。
        # 下限も顔が出る倍率 FACE_AT（1.2・サイクル85）にそろえ、1.6のままでは離れた2粒が収まらなかった
        body = HTML[HTML.index("function toggleZoom()"):]
        body = body[:body.index("\n}\n")]
        self.assertIn("let s = Math.min(2.4, fit);", body)
        self.assertIn("if (s < 1.04) s = FACE_AT;", body)
        self.assertIn("Z.tx = PW / 2 - cx * s; Z.ty = PH / 2 - cy * s;", body)
        self.assertIn("applyZoom(true);", body)  # サイクル92で🔍の寄りは滑らかになった
        self.assertNotIn("Math.max(1.6, Math.min(2.4, fit))", body)
        self.assertNotIn("zoomTo(Math.max(FACE_AT", body)

    def test_assets_exist(self):
        for name in set(re.findall(r'kensa/[a-z_]+\.webp', HTML)):
            self.assertTrue(os.path.exists(os.path.join(ROOT, name)), name)


    def test_cycle87_ink_press_down_drag_differs_from_nigiru_hold(self):
        # 類1の点検: 朱肉とにぎるがどちらも静止長押しで手ざわりが同じだった。
        # 朱肉の主の動きを「はんこを朱肉へ押し下げる短い下向きドラッグ」に分け、手本も押し下げで出す。
        self.assertIn("inkDrag = { y:e.clientY }", HTML)
        self.assertIn("if (idy >= 18) { inkDrag = null; inkDone(); }", HTML)  # 18px押し下げで待ち時間なく付く
        self.assertIn('guideAt("move", $("pad"), 0, 24);', HTML)  # 手本は押し下げ（move）
        self.assertNotIn('guideAt("press", $("pad"))', HTML)
        self.assertIn("const INK_MS = 250;", HTML)  # 長押しの受け皿は従来どおり残す
        self.assertIn("const NIGIRU_MS = 350;", HTML)  # にぎるは静止長押しのまま（手ざわりが分かれる）

    def test_cycle88_each_lot_has_its_own_grain_and_bag_look(self):
        # 類2: 袋ごとに整粒の形・色つやと袋の帯の色で個性を出す。最初の袋は従来どおり、固定内容は変えない。
        self.assertIn("look:0", HTML)
        for i in range(6):
            self.assertIn("look:%d" % i, HTML)
        self.assertIn("const LOT_LOOKS = [", HTML)
        self.assertEqual(HTML.count("stripe:"), 6)  # 袋ごとに帯の色が1つずつ
        for stripe in ["#2d7a4a", "#2c5f7c", "#a83c2a", "#7c3a5e", "#2a7a6e", "#7a4f28"]:
            self.assertIn('stripe:"' + stripe + '"', HTML)
        self.assertIn("const GRAIN_ROWS_SLIM = [", HTML)
        self.assertIn("const GRAIN_ROWS_ROUND = [", HTML)
        self.assertIn("rows:GRAIN_ROWS, pal:GRAIN_COLORS.seiryu", HTML)  # 最初の袋は従来の形と色
        self.assertIn('shapeLook = kind === "seiryu" || kind === "higai"', HTML)  # 被害粒も形は袋にそろえ、区別は割れ目と色だけ
        self.assertIn('palLook = kind === "seiryu" || (far && kind === "higai")', HTML)  # わるい粒の色は変えない
        self.assertIn("drawBag($(\"bagCanvas\"), LOT_LOOKS[LOT.look].stripe)", HTML)
        self.assertIn("{ moisture:[14.1, 14.3, 14.2], higai:1, shini:1, mijuku:0, color:0, look:0 }", HTML)  # 最初の袋の固定内容は不変

    def test_cycle89_each_action_has_its_own_small_sound(self):
        # 類3の点検: 測定1回・わるい粒よけ・等級正解・朱肉の4所作が同じ pop を共有していた。
        # 所作ごとに違う小さな音へ分け、押印 thump・刺す150Hz・平均880Hzは従来どおり固有のまま。
        self.assertIn('const meterBeep = () => tone(1240, 0.09, 0.035, "sine");', HTML)
        self.assertIn('const grainDrop = () => tone(340, 0.07, 0.05, "triangle");', HTML)
        self.assertIn('const inkSound = () => tone(240, 0.1, 0.055, "triangle");', HTML)
        self.assertIn("  meterBeep();", HTML)  # はかる: 測定のたび計器のピッ
        self.assertIn("  grainDrop();", HTML)  # みわける: 粒が小皿へコト
        self.assertIn("  inkSound();", HTML)  # おす: 朱肉にぎゅっと
        self.assertEqual(HTML.count("pop();"), 1)  # pop は等級正解だけに残る
        self.assertIn('tone(150, 0.1, 0.1, "sine")', HTML)  # 刺す音は不変
        self.assertIn("tone(high ? 330 : 880, 0.14, 0.05,", HTML)  # 平均確定の音は不変

    def test_cycle90_wrong_grade_loses_nothing_and_does_not_scold(self):
        # 類4の点検: 機能上は何も失わない（スコア・タイマー・進捗リセットなし）ことは全所作で確認できたが、
        # 等級の間違いだけ横揺れshake＋驚き顔wow＋首傾げで「✕・叱責」の合図になっていた。
        # 穏やかなsway＋平常の顔へ寄せ、音なし・状態不変・正解列の●の誘導だけを残す。
        self.assertNotIn(".gradeBtn.shake", HTML)
        self.assertNotIn("@keyframes shake", HTML)
        self.assertNotIn('add("shake")', HTML)
        self.assertIn(".gradeBtn.sway { animation:sway .6s ease-in-out; }", HTML)
        self.assertIn('btn.classList.add("sway")', HTML)
        self.assertNotIn('setFace("wow", 800)', HTML)  # 間違いで驚き顔にしない（水分高・やわらかいのwowは米の状態用に残る）
        seg = HTML.split("if (pick !== right) {", 1)[1].split("pop();", 1)[0]
        self.assertIn('setFace("normal")', seg)
        self.assertIn("return;", seg)  # その場で止まり、段階も進み具合も変えない
        self.assertNotIn("tone(", seg)  # 間違いに音は付けない
        self.assertNotIn("toOsu", seg)
        self.assertIn("d.classList.add(\"ping\")", seg)  # 正解の列の●を光らせる見直しの誘導は残す
        self.assertIn("等級をまちがえても、はかった水分も、よけた粒も、そのままで何も失われません", HTML)
        self.assertIn(".gradeBtn.sway { animation:none; }", HTML)  # reduced-motionでも揺らさない
        self.assertIn(".dot.ping { outline:3px solid var(--gold); outline-offset:2px; }", HTML)  # reduced-motionでは光る代わりに静かな輪郭で正解列を示す

    def test_cycle91_checks_grow_one_by_one_per_bag(self):
        # 類5: 見るところを袋ごとに1つずつ増やす。等級を下げた項目を「見た項目」に加え、一度見た項目は次の袋でも残す。
        # 最初の袋は従来どおり水分・整粒の2行だけ。各袋で新しく増える項目は最大1つで、判定に必要な項目が隠れることはない。
        self.assertIn('const seenChecks = new Set(["水分", "整粒"]);', HTML)
        self.assertIn("if (g === worst && g > 0) seenChecks.add(name);", HTML)
        self.assertIn("const rows = allRows.filter(([name]) => seenChecks.has(name));", HTML)
        self.assertNotIn('g === worst && g > 0)); /* 水分と整粒のほかは、等級を下げた項目だけ出す */', HTML)
        self.assertIn("きめるで見る項目は、袋を進めるごとに1つずつ増えていきます", HTML)
        # ロット順に「見た項目」を積み上げた行数の見通し（規則は変えない）: 2→2→3→4→5→5
        grades = run_rules("LOTS.map(lotGrade)")
        self.assertEqual(grades, [0, 3, 1, 2, 3, 0])

    def test_cycle92_zoom_glides_only_for_button_and_double_tap(self):
        # 類6: 寄って見る確認操作の磨き。🔍と2回タップの寄り・戻りだけ滑らかにし、ピンチと寄った後の指の移動は指にそのまま追随させる。
        # 従来は倍率が1msで切り替わり（transition 0s・390×844実測）、身を寄せてじっくり見る感覚がなかった。
        self.assertIn("#plateInner.smooth { transition:transform .45s cubic-bezier(.25,.8,.3,1); }", HTML)
        self.assertIn("#plateInner.smooth { transition:none; }", HTML)  # 動きを減らす設定では滑らかにしない
        self.assertIn("function applyZoom(smooth) {", HTML)
        self.assertIn('inner.classList.add("smooth")', HTML)
        self.assertIn("zoomAnimTimer = setTimeout(() => inner.classList.remove(\"smooth\"), 480);", HTML)
        self.assertIn("applyZoom(true); /* 2回タップの寄りは滑らかに（サイクル92・類6） */", HTML)
        self.assertIn("applyZoom(true); /* 🔍の寄りは滑らかに（サイクル92・類6） */", HTML)
        self.assertIn("if (Z.s > 1.001) resetZoom(true);", HTML)  # 🔍で戻る時も滑らかに
        self.assertIn("resetZoom(true);\n        else { const pz = plateXY(e.clientX, e.clientY); zoomTo(2.4, pz.x, pz.y); }", HTML)  # 2回タップで戻る時も滑らかに
        # 指の操作は smooth を付けない: ピンチ中の applyZoom() と、寄った後の移動の applyZoom() は引数なしのまま
        self.assertIn("Z.tx = mid.x - pinch.lx * Z.s; Z.ty = mid.y - pinch.ly * Z.s;\n    applyZoom();", HTML)
        self.assertIn("Z.tx += e.clientX - sortDrag.lx; Z.ty += e.clientY - sortDrag.ly;\n      applyZoom();", HTML)
        self.assertIn("🔍や2回タップで寄るときは、身を寄せるようにゆっくり近づきます", HTML)
        # 寄りの途中で指が触れたら、今見えている transform を Z に同期してから止める（Codexレビュー指摘）。
        # 同期せず smooth を外すと、Z の最終値へ表示が跳んでしまう
        self.assertIn("function stopSmoothZoom() {", HTML)
        self.assertIn("const m = new DOMMatrixReadOnly(getComputedStyle(inner).transform);", HTML)
        self.assertIn("if (m.a > 0) { Z.s = m.a; Z.tx = m.e; Z.ty = m.f; }", HTML)
        self.assertIn("stopSmoothZoom(); /* 寄りの途中で触れたら、今見えている所から指の操作を始める */", HTML)

    def test_cycle94_cooked_return_comes_back_small_on_next_bag(self):
        # 類8: 判定の返し（平和版）。押した袋のお米が、次の袋の「ぬく」の場面で小さく炊き上がって返ってくる。罰ではない返し方に限る。
        self.assertIn('<span id="cookedReturn" hidden>🍚</span>', HTML)
        self.assertIn("#cookedReturn { position:absolute; left:8px; bottom:8px;", HTML)
        self.assertIn("const cookedReturns = [];", HTML)
        self.assertIn("cookedReturns.push(GRADES[lotGrade(LOT)]); updateCooked();", HTML)
        self.assertIn('el.textContent = "🍚 " + cookedReturns[cookedReturns.length - 1] + " 炊けたよ";', HTML)
        self.assertIn('<p id="cookedRecord">まだ 炊き上がった お米は ありません。</p>', HTML)
        self.assertIn("押した袋のお米は、次の袋のときに小さく炊き上がって返ってきます", HTML)
        # 返しは #sceneBag（ぬくの場面）の中だけに出し、流れを止めない。#notes にも静かに残る
        scene_bag = HTML[HTML.index('id="sceneBag"'):HTML.index('id="sceneMeter"')]
        self.assertIn('id="cookedReturn"', scene_bag)
        notes = HTML[HTML.index('<section id="notes">'):HTML.index("</section>")]
        self.assertIn('id="cookedRecord"', notes)
        self.assertEqual(HTML.count('id="cookedReturn"'), 1)
        self.assertEqual(HTML.count('id="cookedRecord"'), 1)
        # startLot で cookedReturns を消していないこと（次の袋で見せるため）。updateCooked は呼ぶ
        start_lot = HTML[HTML.index("function startLot()"):HTML.index("/* 皿の粒:")]
        self.assertIn("updateCooked();", start_lot)
        self.assertNotIn("cookedReturns = []", start_lot)
        self.assertNotIn("cookedReturns.length = 0", start_lot)

    def test_cycle95_bag_leave_has_its_own_paper_sound(self):
        # 差分テーマ（類3の残り）: 袋を流す所作だけが粒の tick を共有していたため、紙の袋らしい低い音に分ける。
        self.assertIn("function bagSound() {", HTML)
        self.assertIn("o.frequency.setValueAtTime(360, t);", HTML)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(150, t + 0.22);", HTML)
        self.assertIn('o.type = "triangle";', HTML)
        # leaveBag は bagSound を使い、tick は使わない
        leave = HTML[HTML.index("function leaveBag()"):HTML.index("nextBtn.addEventListener")]
        self.assertIn("bagSound();", leave)
        self.assertNotIn("tick();", leave)
        # 音量は控えめ（0.045 以下）に留める
        self.assertIn("g.gain.setValueAtTime(0.045, t);", HTML)

    def test_cycle96_crank_has_its_own_mechanical_sound(self):
        # 差分テーマ差2（類3の残り）: はかるのハンドルを回す音だけが粒の tick を共有していたため、
        # 水分計の機械らしい低いカチッという固有の音に分ける。
        self.assertIn('const crankSound = () => tone(185, 0.03, 0.03, "square");', HTML)
        # ハンドルの45°ごとの音は crankSound を使い、tick は使わない
        crank = HTML[HTML.index("crankDrag.sum += Math.abs(d);"):HTML.index("function endCrank(e)")]
        self.assertIn("crankSound();", crank)
        self.assertNotIn("tick();", crank)
        # 粒の tick 自体は従来どおり残る（みわける等の粒の音は変えない）
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)

    def test_cycle97_kimeru_dots_have_their_own_check_sound(self):
        # 差分テーマ差3（類3の残り）: きめるの照合の●が付く音だけが粒の tick を共有していたため、
        # 照合の印らしい静かな固有の音に分ける。
        self.assertIn('const checkSound = () => tone(760, 0.05, 0.022, "sine");', HTML)
        # toKimeru の●の出現は checkSound を使い、tick は使わない
        kimeru = HTML[HTML.index("function toKimeru()"):HTML.index("function pickGrade(btn)")]
        self.assertIn("checkSound();", kimeru)
        self.assertNotIn("tick();", kimeru)
        # 粒の tick 自体は従来どおり残る（みわける等の粒の音は変えない）
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)

    def test_cycle98_zoom_cue_has_its_own_rising_sound(self):
        # 差分テーマ差4（類3の残り）: 寄って顔が出る瞬間の音だけが粒の tick を共有していたため、
        # 近づく感じの小さく上がる固有の音に分ける。この瞬間は粒が動く音ではなく道具操作への返り。
        self.assertIn("function zoomSound() {", HTML)
        self.assertIn("o.frequency.setValueAtTime(600, t);", HTML)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(900, t + 0.09);", HTML)
        self.assertIn('o.type = "sine";', HTML)
        # applyZoom の isNear の合図は zoomSound を使い、tick は使わない
        zoom = HTML[HTML.index("const near = Z.s >= FACE_AT;"):HTML.index("function stopSmoothZoom()")]
        self.assertIn("zoomSound();", zoom)
        self.assertNotIn("tick();", zoom)
        # 音量は控えめ（0.02）に留める
        self.assertIn("g.gain.setValueAtTime(0.02, t);", HTML)
        # 粒の tick 自体は従来どおり残る（粒同士の動きの音は変えない）
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)

    def test_cycle99_plate_knock_has_its_own_sound(self):
        # 差分テーマ差5（類3の残り）: 皿をトントンたたく音だけが粒の tick を共有していたため、
        # 皿らしい短く下がる固有の音に分ける。この音は粒同士の音ではなく手が皿をたたく返り。
        self.assertIn("function knockSound() {", HTML)
        self.assertIn("o.frequency.setValueAtTime(720, t);", HTML)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(290, t + 0.06);", HTML)
        # knockPlate は knockSound を使い、tick は使わない
        knock = HTML[HTML.index("function knockPlate()"):HTML.index("/* ひねる:")]
        self.assertIn("knockSound();", knock)
        self.assertNotIn("tick();", knock)
        # 音量は控えめ（0.04）に留める
        self.assertIn("g.gain.setValueAtTime(0.04, t);", HTML)
        # 粒の tick 自体は従来どおり残る（粒同士の動きの音は変えない）
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)

    def test_cycle100_twist_cue_has_its_own_rolling_sound(self):
        # 差分テーマ差6（類3の残り）: ひねって印が出る合図の音だけが粒の tick を共有していたため、
        # 転がるように小さく上がる固有の音に分ける。この音は粒同士の音ではなくひねる操作への返り。
        self.assertIn("function twistSound() {", HTML)
        self.assertIn("o.frequency.setValueAtTime(320, t);", HTML)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(460, t + 0.09);", HTML)
        # twistPlate の合図は twistSound を使い、tick は使わない
        twist = HTML[HTML.index("function twistPlate(deg)"):HTML.index("plate.addEventListener(\"pointerup\"")]
        self.assertIn("twistSound();", twist)
        self.assertNotIn("tick();", twist)
        # 音量は控えめ（0.03）に留める
        self.assertIn("g.gain.setValueAtTime(0.03, t);", HTML)
        # 粒の tick 自体は従来どおり残る（粒同士の動きの音は変えない）
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)

    def test_cycle101_zoom_out_cue_has_its_own_falling_sound(self):
        # 差分テーマ差7（類3・類6の残り）: 寄る合図には固有の上がる音（差4）がある一方、
        # 寄りから戻る合図だけが無音だったため、寄る音の対になる小さく下がる固有の音を付ける。
        # この音は粒同士の音ではなく、🔍・2回タップ・ピンチで戻る操作が届いた返り。
        self.assertIn("function zoomOutSound() {", HTML)
        self.assertIn("o.frequency.setValueAtTime(900, t);", HTML)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(600, t + 0.09);", HTML)
        # applyZoom の isNear が下りる合図は zoomOutSound を使い、tick は使わない。
        # 場面の切り替えでの戻し（smooth なし・pinch なし）では鳴らさない条件も固定する
        zoom = HTML[HTML.index("const near = Z.s >= FACE_AT;"):HTML.index("function stopSmoothZoom()")]
        self.assertIn("zoomOutSound();", zoom)
        self.assertIn("(smooth || pinch)", zoom)
        self.assertNotIn("tick();", zoom)
        # 音量は寄る音と同じく控えめ（0.02）に留める（zoomSound と共通の行で固定済み）
        # 粒の tick 自体は従来どおり残る（粒同士の動きの音は変えない）
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)

    def test_cycle102_sort_completion_has_its_own_smile_sound(self):
        # 差分テーマ差8（類3の残り）: みわける完了の合図だけが無音だったため、
        # 残った粒が一斉に笑顔になる瞬間に固有のゆっくり上がる音を付ける。
        # この音は粒同士の音ではなく、みわけが終わった合図（他の所作の完了音と同じ位置づけ）。
        self.assertIn("function smileSound() {", HTML)
        self.assertIn("o.frequency.setValueAtTime(500, t);", HTML)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(760, t + 0.22);", HTML)
        # resetZoomForSmiles の冒頭で smileSound を使い、tick は使わない
        smiles = HTML[HTML.index("function resetZoomForSmiles()"):HTML.index("/* におう・かむ・にぎる")]
        self.assertIn("smileSound();", smiles)
        self.assertNotIn("tick();", smiles)
        # 音量は控えめ（0.018）に留める
        self.assertIn("g.gain.setValueAtTime(0.018, t);", HTML)
        # 粒の tick 自体は従来どおり残る（粒同士の動きの音は変えない）
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)

    def test_cycle93_picked_grains_stay_in_quiet_record(self):
        # 類7: 見分けた粒が静かに記録に残る。任意で開く資料（#notes）の中だけに出し、常時表示・競争・スコアにはしない。
        # 袋を越えて残るため startLot では消さない（サイクル91の seenChecks と同じ持ち方）。
        self.assertIn('<p id="grainRecord">まだ みわけた粒は ありません。</p>', HTML)
        self.assertIn("const pickedKinds = { higai:0, shini:0, mijuku:0, color:0 };", HTML)
        self.assertIn('const KIND_NAMES = { higai:"被害粒", shini:"死米", mijuku:"未熟粒", color:"着色粒" };', HTML)
        self.assertIn("pickedKinds[g.kind]++; updateGrainRecord();", HTML)
        self.assertIn("みわけた粒の種類は、ここに静かに残ります", HTML)
        # きろくは #notes の中（＝📖で任意に開く場所）だけにあり、ゲーム画面側には出していない
        notes = HTML[HTML.index('<section id="notes">'):HTML.index("</section>")]
        self.assertIn('id="grainRecord"', notes)
        self.assertEqual(HTML.count('id="grainRecord"'), 1)
        # startLot（次の袋へのリセット）で pickedKinds を消していないこと
        start_lot = HTML[HTML.index("function startLot()"):HTML.index("/* 皿の粒:")]
        self.assertNotIn("pickedKinds", start_lot)


if __name__ == "__main__":
    unittest.main()
