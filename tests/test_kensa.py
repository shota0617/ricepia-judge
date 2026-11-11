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
        self.assertIn("if (now !== spread && now) { spread = true; spreadSound(); if (lotIndex === 0) refreshBadFaces(); updateSortHint(); }", HTML)
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
        # 動かし方を指で見せる。サイクル140（店主指示2026-11-10「お手本モーションを出す」）で、最初の袋だけの決まりは外した
        self.assertNotIn("if (lotIndex !== 0) return;", HTML)
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
        # 手本の指は、さすのに必要な押しの長さに合わせて動く（固定の46pxではない）。サイクル143で 必要な押しの1.8倍にした
        self.assertIn('poke.style.setProperty("--pokeDx", stabDx(P.rest) + "px");', HTML)
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
let onMove, measured = 0, lotIndex = 0, crankAngle = 0, step = 1; const motion = 1;
const LOT = LOTS[0], hint = {}, lcd = {textContent:'--.-'};
const elements = {lcd, slots:{children:[{animate:()=>{}}, {animate:()=>{}}, {animate:()=>{}}]}, crankArm:{style:{}},
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
        # 手本の指は、さすのに必要な押しの長さに合わせて動く（サイクル143: 必要な押しの1.8倍）
        self.assertIn('poke.style.setProperty("--pokeDx", stabDx(P.rest) + "px");', HTML)

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
        self.assertIn('if (bagTaps === 1) { stabPoke(); $("poke").style.display = ""; }', HTML)  # ぬく（サイクル140でどの袋でも。サイクル143: 指は いまの握りの所から）
        self.assertIn('if (meterTaps === 1) guideAt("circle", $("crank"));', HTML)  # はかる
        self.assertIn("function guideSense()", HTML)  # 感じる: 開始時と空振り1回目で同じ手本
        self.assertIn("if (senseTaps === 1) guideSense();", HTML)
        self.assertIn("else if (senseTaps === 1) guideSense();", HTML)
        self.assertIn('if (taps === 1) { gradeDemoSound();', HTML)  # きめる（サイクル122・差28で手本の音を追加し波括弧で囲った）
        self.assertIn('guideAt("move", document.querySelectorAll(".gradeBtn")[lotGrade(LOT)], 0, -48); /* 空振り1回目: 正解ボタンの手本の指をもう一度出す（サイクル81） */', HTML)  # きめる
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

    def test_opening_attract_moves_probe_before_touch(self):
        # 開いた瞬間の誘い（Fable設計の足すもの1・サイクル82）: 最初の袋だけ、
        # 触れる前に穀刺しが袋の口へ寄って戻る。
        # 触れたら（pointerdown／自動代替）止まる。2袋目以降では出さない。
        # サイクル143: 1回だけ（2秒）ではなく、触れるまで 手本の指と一緒に くり返す（下の test_cycle143_...）
        self.assertIn("function startProbeAttract()", HTML)
        self.assertIn("if (lotIndex !== 0 || P.done || P.inserted) return;", HTML)
        self.assertIn("startProbeAttract();", HTML)  # startLot から呼ぶ
        self.assertIn("{ duration:2000 * motion, iterations:1 }", HTML)  # 動きを減らす設定では、従来どおり1回だけ
        self.assertIn("if (probeAttract) probeAttract.pause(); /* 触れたら誘いは止まる（サイクル82）。", HTML)

    def test_cycle143_attract_repeats_with_the_finger_until_touched(self):
        # 最初の1分（見ているだけの人）: 旧版は はじめの2秒に1回 穀刺しが寄って戻るだけで、
        # そのあと60秒まで 指👆だけが 止まった握りの上を行き来していた
        # （390×664・390×844実測: 12秒で 穀刺しが寄るのは1回・指と握りのずれ 最大38.7〜47.1px）。
        # 触れるまで、指と同じ長さ・同じ間合い（1.3秒・55%でいちばん奥）で くり返す。
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        start = HTML.index("function stabDx(from) {")
        fn = HTML[start:HTML.index("function moveProbe(x) {", start)]
        script = """
const assert = require('node:assert/strict');
const motion = 1; let lotIndex = 0, made = [], cancels = 0;
const P = {rest:158, inAt:127, y:50, done:false, inserted:false};
const finger = {startTime:12.5, currentTime:400};
const probe = {animate(frames, opt) { const a = {frames, opt, startTime:null, currentTime:0, cancel() { cancels++; if (this.oncancel) this.oncancel(); }}; made.push(a); return a; }};
const poke = {getAnimations: () => [finger]};
const $ = id => ({probe, poke})[id];
let shownX = 0; const sets = [];
const getComputedStyle = () => ({transform: 'x' + shownX});
class DOMMatrixReadOnly { constructor(t) { this.m41 = +t.slice(1); } }
const setProbe = x => { sets.push(x); P.x = x; };
""" + fn + """
startProbeAttract();
const a = made[0];
assert.equal(a.opt.iterations, Infinity);               // 触れるまで くり返す（旧版は1回）
assert.equal(a.opt.duration, 1300);                     // 指（@keyframes poke 1.3s）と同じ間合い
assert.equal(a.frames[1].offset, .55);                  // 指と同じ所で いちばん奥
assert.equal(a.frames[1].transform, 'translate(' + (158 + stabDx(158)) + 'px,50px)');   // 指と同じ長さ
assert.equal(a.frames[0].easing, 'ease-in-out'); assert.equal(a.frames[1].easing, 'ease-in-out');
assert.equal(a.startTime, 12.5);                        // 指と同じ時計（指が握りを素通りしない）
assert.equal(probeAttract, a);
stopProbeAttract(); assert.equal(cancels, 1); assert.equal(probeAttract, null);   // 触れたら止まる
assert.deepEqual(sets, []);                                                       // キーボードなど（keep なし）は 元の場所へ
startProbeAttract(); shownX = 140; stopProbeAttract(true); assert.deepEqual(sets, [140]);   // 指が動かし始めた時は、見えている所に残す（とばない）
startProbeAttract(); shownX = 110; stopProbeAttract(true); assert.equal(sets[1], 128);      // ささる手前まで。さしたことにはしない
assert.equal(P.inserted, false); assert.equal(made.length, 3); made.length = 1;
lotIndex = 1; startProbeAttract(); assert.equal(made.length, 1);                  // 2袋目以降は出さない
lotIndex = 0; P.inserted = true; startProbeAttract(); assert.equal(made.length, 1);
"""
        subprocess.run([node, "-e", "const reduced = false;" + script], capture_output=True, text=True, check=True)
        # 動きを減らす設定では、くり返さない
        script_r = script[:script.index("startProbeAttract();")] + """
startProbeAttract();
assert.equal(made[0].opt.iterations, 1); assert.equal(made[0].opt.duration, 2000); assert.equal(made[0].startTime, null);
"""
        subprocess.run([node, "-e", "const reduced = true;" + script_r], capture_output=True, text=True, check=True)
        self.assertIn("@keyframes poke { 0%,100% { transform:translateX(0); } 55% { transform:translateX(var(--pokeDx, -46px)); } }", HTML)
        self.assertIn("#poke { position:absolute; z-index:4; font-size:34px; animation:poke 1.3s ease-in-out infinite;", HTML)
        # 画面の大きさが変わったら、誘いも新しい場所で やり直す。さす前の手本の指は さす向きのまま（ひきぬく向きにしない）
        lp = HTML.index("function layoutProbe() {")
        layout = HTML[lp:HTML.index("function setProbe(x)", lp)]
        script_l = """
const assert = require('node:assert/strict');
const P = {x:0, rest:0, inX:0, inAt:0, y:0, L:0, inserted:false, done:false};
const poke = {style:{setProperty(k, v) { this[k] = v; }}, dataset:{}};
const els = {sceneBag:{clientWidth:390}, bagBtn:{offsetLeft:15, offsetWidth:137, offsetTop:10, offsetHeight:160}, probe:{style:{}}, poke};
const $ = id => els[id];
let probeAttract = null, restarts = 0, pulls = 0;
const stabDx = () => -55, setProbe = x => { P.x = x; }, pullPoke = () => { pulls++; }, startProbeAttract = () => { restarts++; };
""" + layout + """
layoutProbe();                                   // 開いた時・次の袋: 誘いは まだ無い
assert.equal(poke.style['--pokeDx'], '-55px'); assert.equal(poke.dataset.arrow, '←');
assert.equal(pulls, 0); assert.equal(restarts, 0); assert.equal(P.x, P.rest);
probeAttract = {}; layoutProbe(); assert.equal(restarts, 1); assert.equal(pulls, 0);   // 誘いの途中で大きさが変わった
probeAttract = null; P.inserted = true; layoutProbe(); assert.equal(pulls, 1); assert.equal(restarts, 1);   // さした後は ひきぬく向き
P.done = true; layoutProbe(); assert.equal(pulls, 1);
"""
        subprocess.run([node, "-e", script_l], capture_output=True, text=True, check=True)
        # 触れたら その場で止め、動かし始めたら そこから続ける。動かさずに離した指（タップ）では元へ戻し、タップの数え方は変えない
        down = HTML[HTML.index('$("sceneBag").addEventListener("pointerdown",'):HTML.index('$("sceneBag").addEventListener("pointermove",')]
        self.assertIn("if (probeAttract) probeAttract.pause();", down)
        self.assertNotIn("stopProbeAttract(true)", down)
        mv = HTML[HTML.index('$("sceneBag").addEventListener("pointermove",'):HTML.index("function endBagDrag(e) {")]
        self.assertIn("if (probeAttract) { stopProbeAttract(true); P.drag.x0 = P.x; }", mv)
        end = HTML[HTML.index("function endBagDrag(e) {"):HTML.index('$("sceneBag").addEventListener("pointerup", endBagDrag);')]
        self.assertLess(end.index("stopProbeAttract();"), end.index("const still ="))
        self.assertNotIn("stopProbeAttract(true)", end)
        # 終わりのない動きは、手本の出し直しを待たせない
        self.assertIn("isFinite(a.effect.getComputedTiming().endTime)", HTML)

    def test_cycle143_codex_pull_demo_finger_stays_inside_the_scene(self):
        # Codex指摘（PR #1089）: 390×844 相当（場面の幅366・袋の左15・幅184・P.L=155）で いちばん深く（P.inX=73.88）さすと、
        # ひきぬく手本の指の左端が 往復の先で 場面内369.48px になり、34pxの指の大部分が #app に切られた。
        # 指は場面の中に収め、足りない分は出だしを軸のほうへ寄せる。
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        ps = HTML.index("function pullPoke() {")
        fn = HTML[ps:HTML.index("function stabPoke() {", ps)]
        script = """
const assert = require('node:assert/strict');
const poke = {offsetWidth:34, style:{left:'', setProperty(k, v) { this[k] = v; }}, dataset:{}};
const scene = {clientWidth:366};
const $ = id => id === 'sceneBag' ? scene : poke;
const P = {x:73.88, rest:205, L:155};
""" + fn + """
const end = () => parseFloat(poke.style.left) + parseFloat(poke.style['--pokeDx']) + 34;
pullPoke();
assert.ok(end() <= 366, '指の右はしが場面の中 ' + end());                    // 旧版: 369.48 + 34 = 403.48
const dx = parseFloat(poke.style['--pokeDx']);
assert.ok(dx * 0.6 >= (205 - 73.88) * 0.8, '0.6倍でまねても全部ぬける長さは残す ' + dx);
assert.ok(parseFloat(poke.style.left) >= 73.88 + 155 * 0.3);                 // 指の出だしは穀刺しの上
// 指が隠れている間（幅0）に呼ばれても、👆の幅（実測42px）の分を空ける
poke.offsetWidth = 0; pullPoke(); assert.ok(parseFloat(poke.style.left) + parseFloat(poke.style['--pokeDx']) + 42 <= 366);
assert.ok(parseFloat(poke.style['--pokeDx']) * 0.6 >= (205 - 73.88) * 0.8); poke.offsetWidth = 34;
// 場面に ゆとりがあれば、従来どおり握りの所から
scene.clientWidth = 420; P.x = 166; pullPoke(); assert.equal(poke.style.left, 166 + 155 * 0.72 + 'px'); assert.equal(poke.style['--pokeDx'], '55px');
// せまい場面（横向きなど）でも、場面の外へ出ない。長さは0より小さくならない
for (const w of [300, 260, 200, 120]) for (const x of [40, 73.88, 120, 166, 200]) { scene.clientWidth = w; P.x = x; pullPoke();
  assert.ok(end() <= Math.max(w, parseFloat(poke.style.left) + 34), w + ' ' + x); assert.ok(parseFloat(poke.style['--pokeDx']) >= 0); }
"""
        subprocess.run([node, "-e", script], capture_output=True, text=True, check=True)

    def test_cycle143_codex_reshown_finger_joins_the_attract_clock(self):
        # Codex指摘（PR #1089）: 誘いの途中に場面の外（見出しなど）をタップすると 指だけが隠れ、出し直した指は頭から・
        # 穀刺しは前の時計のまま動いて、ずれたまま往復した。出し直した指の時計を 誘いに合わせる。
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        start = HTML.index("function syncPokeToAttract() {")
        fn = HTML[start:HTML.index("function stopProbeAttract(keep)", start)]
        script = """
const assert = require('node:assert/strict');
const finger = {startTime:null, currentTime:0};
const poke = {getAnimations: () => [finger]};
const $ = () => poke;
let probeAttract = {startTime:120, currentTime:777, playState:'running'};
""" + fn + """
syncPokeToAttract(); assert.equal(finger.startTime, 120);                    // 動いている誘いと同じ始まり
probeAttract = {startTime:null, currentTime:300, playState:'paused'}; finger.startTime = null;
syncPokeToAttract(); assert.equal(finger.currentTime, 300); assert.equal(finger.startTime, null);
probeAttract = null; finger.currentTime = 5; syncPokeToAttract(); assert.equal(finger.currentTime, 5);   // 誘いが無ければ何もしない
"""
        subprocess.run([node, "-e", script], capture_output=True, text=True, check=True)
        self.assertIn('if (k === "stab") { stabPoke(); $("poke").style.display = ""; syncPokeToAttract(); }', HTML)

    def test_cycle143_codex_resize_while_holding_keeps_the_attract_paused(self):
        # Codex指摘（PR #1089）: 誘いの途中で指を置いたまま resize が起きると、pointerdown で止めた誘いが
        # 動いている新しい誘いに置きかわり、指を動かしていないのに穀刺しが また往復した。
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        lp = HTML.index("function layoutProbe() {")
        layout = HTML[lp:HTML.index("function setProbe(x)", lp)]
        script = """
const assert = require('node:assert/strict');
const P = {x:0, rest:0, inX:0, inAt:0, y:0, L:0, inserted:false, done:false};
const poke = {style:{setProperty() {}}, dataset:{}};
const els = {sceneBag:{clientWidth:390}, bagBtn:{offsetLeft:15, offsetWidth:137, offsetTop:10, offsetHeight:160}, probe:{style:{}}, poke};
const $ = id => els[id];
const mk = () => ({playState:'running', currentTime:0, pause() { this.playState = 'paused'; }});
let probeAttract = mk();
const stabDx = () => -55, setProbe = () => {}, pullPoke = () => {}, startProbeAttract = () => { probeAttract = mk(); };
""" + layout + """
probeAttract.pause(); probeAttract.currentTime = 640; const old = probeAttract;   // 指を置いて止めてある
layoutProbe();
assert.notEqual(probeAttract, old);                      // 新しい場所で置き直す
assert.equal(probeAttract.playState, 'paused');          // 止まったまま（旧版は running）
assert.equal(probeAttract.currentTime, 640);             // 同じ進み具合
probeAttract = mk(); probeAttract.currentTime = 300; layoutProbe(); assert.equal(probeAttract.playState, 'running');   // 指を置いていなければ、従来どおり動く
"""
        subprocess.run([node, "-e", script], capture_output=True, text=True, check=True)

    def test_cycle143_demo_finger_copied_at_60_percent_still_works(self):
        # 最初の1分（はじめの手ごたえ）: 手本の指は さすのに必要な押し＋8px ちょうどで、
        # 手本の0.5〜0.7倍（390×844 は0.8倍まで）の長さでまねる指は 1本目が ささらなかった
        # （390×664・390×844・360×640・375×548実測。粒が落ちるのは3本目・ぬけるのは4本目）。
        # さす手本は 必要な押しの1.8倍、ひきぬく手本は 入っている長さの1.4倍。0.6倍でまねても1本で ささり・ぬける。
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        start = HTML.index("function stabDx(from) {")
        fn = HTML[start:HTML.index("let probeAttract = null;", start)]
        ps = HTML.index("function pullPoke() {")
        fn += HTML[ps:HTML.index("let pullDemo = null;", ps)]
        script = """
const assert = require('node:assert/strict');
const poke = {style:{left:'', setProperty(k, v) { this[k] = v; }}, dataset:{}};
const scene = {clientWidth:366};
const $ = id => id === 'sceneBag' ? scene : poke;
const P = {x:0, rest:0, inAt:0, L:190};
""" + fn + """
// [袋の右はし+6, さした判定の所]: 390×664・390×844・360×640・375×548 の実測
for (const [rest, inAt] of [[158, 127], [205, 166], [149, 120], [126, 101]]) {
  P.rest = rest; P.inAt = inAt;
  const need = rest - inAt, demo = -stabDx(rest);
  assert.ok(demo * 0.6 >= need, 'さす: 手本の0.6倍で届く ' + rest);
  assert.ok(demo <= need * 2, '長すぎない');
  // 手本どおり（1.0倍）に さした人・ちょうど届いた人の ひきぬく手本
  for (const x of [rest - demo, inAt]) {
    P.x = x; pullPoke(); stabPoke();
    assert.equal(poke.dataset.arrow, '←'); pullPoke(); assert.equal(poke.dataset.arrow, '→');
    const pull = parseFloat(poke.style['--pokeDx']);
    assert.ok(pull * 0.6 >= (rest - x) * 0.8, 'ひきぬく: 手本の0.6倍で 全部の粒が落ちる（8割ひけば全部） ' + rest);
    assert.ok(pull >= 46);
  }
  // 途中まで押して離した人の さす手本も、0.6倍で届く
  P.x = inAt + 10; stabPoke(); assert.ok(-parseFloat(poke.style['--pokeDx']) * 0.6 >= 10);
  P.x = inAt + 1; stabPoke(); assert.equal(poke.style['--pokeDx'], '-20px');   // 短すぎる手本にはしない（旧版と同じ下限）
}
"""
        subprocess.run([node, "-e", script], capture_output=True, text=True, check=True)
        move = HTML[HTML.index("function moveProbe(x) {"):HTML.index("function pourOne(g) {")]
        self.assertIn("if (x <= P.inAt) {", move)  # さした の決まりは変えない
        self.assertIn("/ 0.78 * PLATE_GRAINS", move)  # 8割ひけば全部 も変えない

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
        self.assertIn("pierceSound();", HTML)  # 刺す音はサイクル115（差21）で固有の pierceSound へ分けた
        self.assertIn("avgSound(high);", HTML)  # 平均確定の音はサイクル114（差20）で固有の avgSound へ分けた

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

    def test_cycle103_probe_completion_has_its_own_sound(self):
        # 差分テーマ差9（類3の残り）: ぬく完了の合図だけが無音だったため、
        # 穀刺しを引き抜き終えた瞬間に固有のゆっくり上がる音を付ける。
        # この音は粒が落ちる音ではなく、ぬくが終わった合図（他の所作の完了音と同じ位置づけ）。
        self.assertIn("function probeDoneSound() {", HTML)
        self.assertIn("o.frequency.setValueAtTime(300, t);", HTML)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(480, t + 0.18);", HTML)
        # finishProbe の冒頭で probeDoneSound を使い、tick は使わない
        fin = HTML[HTML.index("function finishProbe()"):HTML.index("function autoProbe()")]
        self.assertIn("probeDoneSound();", fin)
        self.assertNotIn("tick();", fin)
        # 音量は控えめ（0.02）に留める
        self.assertIn("g.gain.setValueAtTime(0.02, t);", HTML)
        # 粒の tick 自体は従来どおり残る（粒同士の動きの音は変えない）
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)

    def test_cycle104_next_bag_arrival_has_its_own_rising_sound(self):
        # 差分テーマ差10（類3の残り）: 袋が流れる音（bagSound）がある一方、
        # 次の袋が運ばれてくる到着の窓だけが無音だったため、流れる音の対になる
        # ゆっくり上がる固有の音を付ける。最初の袋（開いた時）では鳴らさない。
        self.assertIn("function arriveSound() {", HTML)
        arrive = HTML[HTML.index("function arriveSound()"):HTML.index("function knockSound()")]
        self.assertIn("o.frequency.setValueAtTime(180, t);", arrive)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(320, t + 0.16);", arrive)
        self.assertIn('o.type = "triangle";', arrive)
        self.assertIn("o.start(t); o.stop(t + 0.18);", arrive)
        # startLot の次の袋アニメーションで arriveSound を使い、tick は使わない
        start = HTML[HTML.index("function startLot()"):HTML.index("/* 皿の粒")]
        self.assertIn("arriveSound();", start)
        self.assertIn("if (lotIndex > 0) { arriveSound();", start)
        self.assertNotIn("tick();", start)
        # 音量は控えめ（0.03）に留める
        self.assertIn("g.gain.setValueAtTime(0.03, t);", arrive)
        # 流れる音 bagSound 自体は従来どおり残る
        self.assertIn("function bagSound() {", HTML)
        # 粒の tick 自体は従来どおり残る（粒同士の動きの音は変えない）
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)

    def test_cycle105_spread_completion_has_its_own_gentle_sound(self):
        # 差分テーマ差11（類3の残り）: みわけるで「なでて広げる」が終わる瞬間（spread の成立）だけが
        # 合図なしだったため、広がった合図に穏やかに上がる固有の音を付ける。
        # 広がる前も後もなでる tick が同じに続くので、耳では完了が分からなかった（390×844実測で遷移の同期音は0件）。
        self.assertIn("function spreadSound() {", HTML)
        spread_fn = HTML[HTML.index("function spreadSound()"):HTML.index("function thump()")]
        self.assertIn("o.frequency.setValueAtTime(400, t);", spread_fn)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(620, t + 0.14);", spread_fn)
        self.assertIn('o.type = "sine";', spread_fn)
        self.assertIn("o.start(t); o.stop(t + 0.16);", spread_fn)
        # 音量は控えめ（0.02）に留める
        self.assertIn("g.gain.setValueAtTime(0.02, t);", spread_fn)
        # checkSpread の成立した瞬間だけ spreadSound を鳴らす（毎回の呼び出しでは鳴らさない）
        check = HTML[HTML.index("function checkSpread()"):HTML.index("/* なでる:")]
        self.assertIn("if (now !== spread && now) { spread = true; spreadSound();", check)
        self.assertEqual(HTML.count("spreadSound();"), 1)
        # 広げる所作そのものの音（なでる tick）は従来どおり残る
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)
        brush = HTML[HTML.index("function brush(from, to)"):HTML.index("function startSim()")]
        self.assertIn("tick();", brush)

    def test_cycle106_hint_swelling_has_its_own_gentle_sound(self):
        # 差分テーマ差12（類3の残り）: みわけるで しばらくすると わるい粒がふくらんで知らせる瞬間（armHint）だけが
        # 無音だったため、ふくらむ合図に穏やかに上がる固有の音を付ける。目を離していると膨らみに気づけなかった。
        self.assertIn("function hintSound() {", HTML)
        hint_fn = HTML[HTML.index("function hintSound()"):HTML.index("function thump()")]
        self.assertIn("o.frequency.setValueAtTime(440, t);", hint_fn)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(560, t + 0.12);", hint_fn)
        self.assertIn('o.type = "triangle";', hint_fn)
        self.assertIn("o.start(t); o.stop(t + 0.14);", hint_fn)
        # 音量はこれまでの合図の音より控えめ（0.015）に留める
        self.assertIn("g.gain.setValueAtTime(0.015, t);", hint_fn)
        # 新しくふくらむ粒がある時だけ鳴らし、すでにふくらんでいる粒には鳴らさない
        arm = HTML[HTML.index("function armHint(ms)"):HTML.index("function toMiwakeru()")]
        self.assertIn('!g.img.classList.contains("hint")', arm)
        self.assertIn("if (!fresh.length) return;", arm)
        self.assertIn("hintSound();", arm)
        self.assertEqual(HTML.count("hintSound();"), 1)
        # ひねって印が出る経路（twistSound）と なでる tick は従来どおり残る
        self.assertIn("twistSound();", HTML)
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)

    def test_cycle107_like_has_its_own_gentle_sound(self):
        # 差分テーマ差13（類3の残り）: 終了カードの「いいね」を押した合図だけが無音だったため、
        # 固有の穏やかに上がる音を付ける。他の肯定の合図（きめる=pop・おす=thump）には音があるのに、
        # 遊びの締めの肯定だけ音がなく、押せたことが耳では分からなかった。
        self.assertIn("function likeSound() {", HTML)
        like_fn = HTML[HTML.index("function likeSound()"):HTML.index("function thump()")]
        self.assertIn("o.frequency.setValueAtTime(560, t);", like_fn)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(840, t + 0.14);", like_fn)
        self.assertIn('o.type = "triangle";', like_fn)
        self.assertIn("o.start(t); o.stop(t + 0.16);", like_fn)
        # 音量は控えめ（0.02）に留める
        self.assertIn("g.gain.setValueAtTime(0.02, t);", like_fn)
        # いいねが受け付けられた時だけ1回鳴らす（すでに押した後の早期リターンでは鳴らさない）
        like = HTML[HTML.index('likeBtn.addEventListener("click"'):HTML.index('returnLink.addEventListener("click"')]
        self.assertIn("if (liked()) return;", like)
        self.assertIn("likeSound();", like)
        self.assertEqual(HTML.count("likeSound();"), 1)
        # 等級正解の pop と粒の tick は従来どおり残る
        self.assertIn('const pop = () => tone(620, 0.08, 0.05, "sine");', HTML)
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)

    def test_cycle108_idle_card_appearance_has_its_own_gentle_sound(self):
        # 差分テーマ差14（類3の残り）: 終了カードが現れる合図だけが無音だったため、
        # 固有のゆっくり上がる音を付ける。手が止まって45秒後に現れるカードは、
        # 目を離していると現れたことに気づけなかった。他の時間で出る知らせ
        # （わるい粒のふくらみ＝hintSound）には音があるのに、この締めの入口だけ音がなかった。
        self.assertIn("function idleSound() {", HTML)
        idle_fn = HTML[HTML.index("function idleSound()"):HTML.index("function thump()")]
        self.assertIn("o.frequency.setValueAtTime(360, t);", idle_fn)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(500, t + 0.24);", idle_fn)
        self.assertIn('o.type = "sine";', idle_fn)
        self.assertIn("o.start(t); o.stop(t + 0.26);", idle_fn)
        # 音量は最も控えめな部類（0.015）に留める
        self.assertIn("g.gain.setValueAtTime(0.015, t);", idle_fn)
        # カードが新しく現れる時だけ1回鳴らす（すでに現れている時には鳴らさない）
        show = HTML[HTML.index("function showIdleCard()"):HTML.index("function hideIdleCard()")]
        self.assertIn('const wasOn = idleCard.classList.contains("on");', show)
        self.assertIn("if (!wasOn) idleSound();", show)
        self.assertEqual(HTML.count("idleSound();"), 1)
        # いいねの音と粒の tick は従来どおり残る
        self.assertIn("likeSound();", HTML)
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)

    def test_cycle109_idle_card_dismissal_has_its_own_gentle_sound(self):
        # 差分テーマ差15（類3の残り）: 終了カードを自分で閉じる合図だけが無音だったため、
        # 現れる音の対になる固有のゆっくり下がる音を付ける。現れる合図（差14・idleSound）には
        # 音があるのに、カードの外を触って閉じる操作への返りだけ音がなかった（差7の寄る／戻ると同じ形）。
        self.assertIn("function idleOutSound() {", HTML)
        out_fn = HTML[HTML.index("function idleOutSound()"):HTML.index("function thump()")]
        self.assertIn("o.frequency.setValueAtTime(500, t);", out_fn)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(360, t + 0.24);", out_fn)
        self.assertIn('o.type = "sine";', out_fn)
        self.assertIn("o.start(t); o.stop(t + 0.26);", out_fn)
        # 音量は現れる音よりさらに控えめ（0.012）に留める
        self.assertIn("g.gain.setValueAtTime(0.012, t);", out_fn)
        # 自分で閉じる経路（dismissIdleCard）で、カードが出ている時だけ1回鳴らす
        dismiss = HTML[HTML.index("function dismissIdleCard()"):HTML.index("function armIdle()")]
        self.assertIn('if (!idleCard.classList.contains("on")) return;', dismiss)
        self.assertIn("hideIdleCard();", dismiss)
        self.assertIn("idleOutSound();", dismiss)
        self.assertEqual(HTML.count("idleOutSound();"), 1)
        # 画面の外側のタップとキー操作は dismiss 経路で閉じる（2か所とも）
        self.assertEqual(HTML.count('dismissIdleCard();'), 2)
        # いいねの後に自動で閉じる経路は従来どおり hideIdleCard のまま無音に留める
        self.assertIn("setTimeout(hideIdleCard, 900);", HTML)
        # 現れる音と粒の tick は従来どおり残る
        self.assertIn("idleSound();", HTML)
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)

    def test_cycle110_cooked_return_has_its_own_gentle_sound(self):
        # 差分テーマ差16（類3・類8の残り）: 前の袋のお米が炊き上がって返ってくる合図だけに
        # 固有の音がなく、チップが現れる窓にあるのは次の袋の到着音（arriveSound）だけだったため、
        # 袋が着いて落ち着いた後に固有の温かい音を1回付ける（差8・差9と同じ「窓にあるのは別の音だけ」の形）。
        self.assertIn("function cookedSound() {", HTML)
        cooked_fn = HTML[HTML.index("function cookedSound()"):HTML.index("function thump()")]
        self.assertIn("o.frequency.setValueAtTime(392, t);", cooked_fn)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(523, t + 0.28);", cooked_fn)
        self.assertIn('o.type = "sine";', cooked_fn)
        self.assertIn("o.start(t); o.stop(t + 0.3);", cooked_fn)
        # 音量は控えめ（0.016）に留める
        self.assertIn("g.gain.setValueAtTime(0.016, t);", cooked_fn)
        # 次の袋の開始（startLot）で、炊き上がりの返りがある時だけ、到着の後に遅れて1回鳴らす
        start_lot = HTML[HTML.index("function startLot()"):HTML.index("/* 皿の粒:")]
        # サイクル124（差30）で表示と音を同じコールバックに統合: 320ms後に1回鳴る点は不変
        self.assertIn("cookedSound(); }, 320 * motion)", start_lot)
        self.assertIn("arriveSound();", start_lot)
        self.assertEqual(HTML.count("cookedSound"), 2)  # 定義1＋呼び出し1（サイクル124の統合コールバック内）
        # 押印の瞬間（stampNow の updateCooked）では鳴らさない: 返りが見えるのは次の袋の開始時だけ
        stamp = HTML[HTML.index("function stampNow()"):HTML.index("function dropHanko()")]
        self.assertNotIn("cookedSound", stamp)
        # 到着音と粒の tick は従来どおり残る
        self.assertIn("function arriveSound() {", HTML)
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)

    def test_cycle111_return_link_has_its_own_gentle_sound(self):
        # 差分テーマ差17（類3の残り）: 終了カードの2つのボタンのうち「いいね」には固有の音（差13）が
        # あるのに、「サイトへ もどる」を押した合図だけが無音だったため、固有の穏やかな下がる音を1回付ける。
        self.assertIn("function returnSound() {", HTML)
        ret_fn = HTML[HTML.index("function returnSound()"):HTML.index("function thump()")]
        self.assertIn("o.frequency.setValueAtTime(440, t);", ret_fn)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(330, t + 0.2);", ret_fn)
        self.assertIn('o.type = "sine";', ret_fn)
        self.assertIn("o.start(t); o.stop(t + 0.22);", ret_fn)
        # 音量は控えめ（0.018）に留める
        self.assertIn("g.gain.setValueAtTime(0.018, t);", ret_fn)
        # 戻るリンクの click で、タップ計測（sendTap）の前に1回だけ鳴らす
        self.assertIn('returnLink.addEventListener("click", () => { returnSound(); sendTap("return"); });', HTML)
        self.assertEqual(HTML.count("returnSound"), 3)  # 定義1＋呼び出し2（サイクル113・差19で資料末尾のリンクにも同じ音を付けた）
        # いいねの音とカード出現の音は従来どおり残る
        self.assertIn("function likeSound() {", HTML)
        self.assertIn("function idleSound() {", HTML)
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)

    def test_cycle112_notes_link_has_its_own_gentle_sound(self):
        # 差分テーマ差18（類3の残り）: 開く／閉じる・現れる合図には固有の音がある（差14・差15・差17）一方、
        # 静かなきろく（類7・類8）が置かれた資料（📖→#notes）を開く操作だけが無音だったため、
        # 固有の短く下がる音を1回付ける。アンカーのスクロールは従来どおり。
        self.assertIn("function notesSound() {", HTML)
        fn = HTML[HTML.index("function notesSound()"):HTML.index("function thump()")]
        self.assertIn("o.frequency.setValueAtTime(700, t);", fn)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(540, t + 0.12);", fn)
        self.assertIn('o.type = "triangle";', fn)
        self.assertIn("o.start(t); o.stop(t + 0.14);", fn)
        # 音量は控えめ（0.016）に留める
        self.assertIn("g.gain.setValueAtTime(0.016, t);", fn)
        # 資料リンクの click で1回だけ鳴らす
        self.assertIn('$("notesLink").addEventListener("click", () => { notesSound(); });', HTML)
        self.assertEqual(HTML.count("notesSound"), 3)  # 定義1＋呼び出し2（資料リンク＋出典リンク・サイクル116で追加）
        # 既存の合図の音は従来どおり残る
        self.assertIn("function returnSound() {", HTML)
        self.assertIn("function likeSound() {", HTML)
        self.assertIn("function idleSound() {", HTML)
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)

    def test_cycle113_notes_return_link_shares_return_sound(self):
        # 差分テーマ差19（差17の再監査の残り）: サイトへ戻る合図には固有の音がある（差17・returnSound）一方、
        # 資料（#notes）の末尾にある同じ戻り先（ricepia.jp）へのリンクだけが無音だったため、
        # 同じ戻る音を1回付ける。新しい音色は作らず、同じ行き先には同じ音で揃える。
        self.assertIn('<a id="notesReturnLink" href="https://ricepia.jp/">らいすぴあ（近藤米穀店）のサイトへ</a>', HTML)
        self.assertIn('$("notesReturnLink").addEventListener("click", () => { returnSound(); });', HTML)
        self.assertEqual(HTML.count("returnSound"), 3)  # 定義1＋終了カードの呼び出し1＋資料末尾の呼び出し1
        # 既存の合図の音は従来どおり残る
        self.assertIn("function notesSound() {", HTML)
        self.assertIn("function returnSound() {", HTML)
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)

    def test_cycle114_average_completion_has_its_own_sound(self):
        # 差分テーマ差20（完了の合図の再監査）: 他の所作の完了には固有の名前の音がある
        # （ぬく=probeDoneSound・みわける=smileSound・きめる=pop・おす=thump）一方、
        # はかる完了（水分の平均確定）だけが名前のない tone(880／330Hz単音) のままだったため、
        # 固有の avgSound に分ける。通常時は穏やかに上がり、水分が高い時は警告音にせず低くゆっくり下がる。
        self.assertIn("function avgSound(high) {", HTML)
        fn = HTML[HTML.index("function avgSound(high)"):HTML.index("function thump()")]
        self.assertIn("o.frequency.setValueAtTime(784, t);", fn)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(1046, t + 0.18);", fn)
        self.assertIn("o.frequency.setValueAtTime(349, t);", fn)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(262, t + 0.26);", fn)
        self.assertIn('o.type = "sine";', fn)
        # 音量は控えめ（通常0.018／高水分0.02）に留める
        self.assertIn("g.gain.setValueAtTime(0.018, t);", fn)
        self.assertIn("g.gain.setValueAtTime(0.02, t);", fn)
        # 平均確定（showAverage）でだけ1回鳴らし、旧い匿名 tone は残さない
        avg = HTML[HTML.index("function showAverage()"):HTML.index("const Z = {")]
        self.assertIn("avgSound(high);", avg)
        self.assertNotIn("tone(high", avg)
        self.assertEqual(HTML.count("avgSound"), 2)  # 定義1＋呼び出し1
        # 1回ごとの計器のピッと他の完了音は従来どおり残る。間違いのときの無音（類4）も変えない
        self.assertIn("const meterBeep = () => tone(1240, 0.09, 0.035, \"sine\");", HTML)
        self.assertIn("function probeDoneSound() {", HTML)
        self.assertIn("function smileSound() {", HTML)
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)
        # 資料に1文だけ足す（ゲーム内文言は増やさない）
        self.assertIn("水分を3回はかって平均が決まると、専用の小さな音で知らせます", HTML)

    def test_cycle115_probe_pierce_has_its_own_sound(self):
        # 差分テーマ差21（刺さる合図の再監査）: 他の節目には固有の名前の音がある
        # （ぬく完了=probeDoneSound・袋が流れる=bagSound）一方、穀刺しが袋に刺さる瞬間だけが
        # 名前のない tone(150Hz単音・音量0.1) のままだったため、固有の pierceSound に分ける。
        self.assertIn("function pierceSound() {", HTML)
        fn = HTML[HTML.index("function pierceSound()"):HTML.index("function spreadSound()")]
        self.assertIn("o.frequency.setValueAtTime(260, t);", fn)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(170, t + 0.11);", fn)
        self.assertIn('o.type = "triangle";', fn)
        # 音量は控えめ（0.032）に留める。旧い匿名 tone の音量0.1より小さくする
        self.assertIn("g.gain.setValueAtTime(0.032, t);", fn)
        # 刺さった瞬間（moveProbe の inserted）でだけ1回鳴らし、旧い匿名 tone は残さない
        probe = HTML[HTML.index("function moveProbe(x)"):HTML.index("function pourOne(g)")]
        self.assertIn("pierceSound();", probe)
        self.assertNotIn("tone(150", probe)
        self.assertEqual(HTML.count("pierceSound"), 2)  # 定義1＋呼び出し1
        # 他の固有音と粒の tick は従来どおり残る。間違いのときの無音（類4）も変えない
        self.assertIn("function probeDoneSound() {", HTML)
        self.assertIn("function bagSound() {", HTML)
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)
        # 資料に1文だけ足す（ゲーム内文言は増やさない）
        self.assertIn("穀刺しが袋に刺さると、専用の小さな音で知らせます", HTML)

    def test_cycle116_source_links_share_notes_sound(self):
        # 差分テーマ差22（差19の再監査の残り）: 資料（#notes）内のリンクは、資料を開く（差18）・
        # サイトへ戻る（差19）には固有の音がある一方、出典（農林水産省・3件）のリンクだけが無音だったため、
        # 資料を開くときと同じ小さな音を1回付ける。新しい音色は作らず、参照を開く操作には同じ音で揃える。
        # 差19では出典リンクを「ゲームの操作ではない」として対象外にしたが、資料を開く操作（差18）も
        # 同じくゲームの操作ではなく音を付けた前例があり、対象外の判断を見直した（差4・差5と同じ形の見直し）。
        self.assertEqual(HTML.count('class="sourceLink"'), 3)  # 出典リンクは3件とも対象にする
        self.assertIn('<a class="sourceLink" href="https://www.maff.go.jp/j/seisan/syoryu/kensa/kome/k_kikaku/" target="_blank" rel="noopener">', HTML)
        self.assertIn('<a class="sourceLink" href="https://www.maff.go.jp/j/seisan/syoryu/kensa/hourei.html" target="_blank" rel="noopener">', HTML)
        self.assertIn('<a class="sourceLink" href="https://www.maff.go.jp/j/seisan/syoryu/kensa/attach/pdf/index-25.pdf" target="_blank" rel="noopener">', HTML)
        # 出典リンクの click で資料の音を1回だけ鳴らす。新しいタブで開く動き（target=_blank）は妨げない
        self.assertIn('document.querySelectorAll(".sourceLink").forEach(a => a.addEventListener("click", () => { notesSound(); }));', HTML)
        self.assertEqual(HTML.count("notesSound"), 3)  # 定義1＋資料リンクの呼び出し1＋出典リンクの呼び出し1
        # 既存の合図の音は従来どおり残る。間違いのときの無音（類4）も変えない
        self.assertIn("function notesSound() {", HTML)
        self.assertIn("function returnSound() {", HTML)
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)
        # 資料に1文だけ足す（ゲーム内文言は増やさない）
        self.assertIn("出典（農林水産省）のリンクを開くときも、資料を開くときと同じ小さな音で知らせます", HTML)

    def test_cycle117_game_return_link_has_its_own_sound(self):
        # 差分テーマ差23（差18の再監査の残り・戻る道そのものの欠け）: 資料を開く合図には固有の音がある
        # （差18）一方、資料（#notes）の末尾にはサイトへのリンクしかなく、ゲームへ戻る道そのものが
        # なかった（390×844実測で資料は1,340px、ページ内の戻りアンカーは #notes への1件だけ）ため、
        # 末尾に「ゲームへ もどる」（#app へのアンカー）を足し、資料を開く音と対になる固有の上がる音を付ける。
        self.assertIn('<a id="gameReturnLink" href="#app">🎮 ゲームへ もどる</a>', HTML)
        # リンクは資料（#notes）の中だけにあり、ゲーム画面側には足していない
        notes = HTML[HTML.index('<section id="notes">'):HTML.index("</section>")]
        self.assertIn('id="gameReturnLink"', notes)
        self.assertEqual(HTML.count('id="gameReturnLink"'), 1)
        self.assertIn("function gameReturnSound() {", HTML)
        fn = HTML[HTML.index("function gameReturnSound()"):HTML.index("function thump()")]
        self.assertIn("o.frequency.setValueAtTime(540, t);", fn)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(700, t + 0.12);", fn)
        self.assertIn('o.type = "sine";', fn)
        self.assertIn("o.start(t); o.stop(t + 0.14);", fn)
        # 音量は控えめ（0.016）に留める
        self.assertIn("g.gain.setValueAtTime(0.016, t);", fn)
        # 戻るリンクの click で1回だけ鳴らす。アンカーのスクロールは従来どおり
        self.assertIn('$("gameReturnLink").addEventListener("click", () => { gameReturnSound(); });', HTML)
        self.assertEqual(HTML.count("gameReturnSound"), 2)  # 定義1＋呼び出し1
        # 既存の合図の音と件数は従来どおり残る。間違いのときの無音（類4）も変えない
        self.assertIn("function notesSound() {", HTML)
        self.assertEqual(HTML.count("notesSound"), 3)
        self.assertEqual(HTML.count("returnSound"), 3)
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)
        # 資料に1文だけ足す（ゲーム内文言は増やさない）
        self.assertIn("資料の末尾の「ゲームへ もどる」を押すと、対になる小さな音で知らせて、ゲームの画面へ戻ります", HTML)

    def test_cycle118_like_rollback_has_its_own_paired_sound(self):
        # 差分テーマ差24（差13の再監査の残り・対の音の欠け）: いいねを押した合図には固有の上がる音がある
        # （差13）一方、送信が届かず押し直せるように戻る時だけが無音だった（390×844実測で巻き戻しの
        # 同期音0件）ため、いいねの音と対になる固有の下がる音を付ける。届いた時は鳴らさない。
        self.assertIn("function likeOutSound() {", HTML)
        fn = HTML[HTML.index("function likeOutSound()"):HTML.index("function idleSound()")]
        self.assertIn("o.frequency.setValueAtTime(840, t);", fn)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(560, t + 0.14);", fn)
        self.assertIn('o.type = "triangle";', fn)
        self.assertIn("o.start(t); o.stop(t + 0.16);", fn)
        # 音量はいいねの音と同じ控えめさ（0.02）に留める
        self.assertIn("g.gain.setValueAtTime(0.02, t);", fn)
        # 届かなかった時の巻き戻しでだけ1回鳴らす（呼び出しは失敗コールバックの中だけにあることまで固定する）
        fail = HTML[HTML.index('sendTap("like", () => {'):HTML.index('likeBtn.textContent = "👍 いいね";')]
        self.assertIn("likeOutSound();", fail)
        self.assertEqual(HTML.count("likeOutSound"), 2)  # 定義1＋呼び出し1
        # いいねの音（差13）は従来どおり。間違いのときの無音（類4）も変えない
        self.assertIn("function likeSound() {", HTML)
        self.assertEqual(HTML.count("likeSound();"), 1)
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)
        # 資料に1文だけ足す（ゲーム内文言は増やさない）
        self.assertIn("「いいね」が届かなかったときは、対になる小さな音で知らせて、押し直せるように戻ります", HTML)

    def test_cycle119_crank_demo_wiggle_uses_crank_sound(self):
        # 差分テーマ差25（差2の再監査の残り・手本の無音）: 実際にハンドルを回すと45°ごとに
        # crankSound が鳴る（差2）一方、はかるで空振りしたときの手本の揺れ（60°）だけが無音だった
        # （390×844実測で同期音0件）ため、揺れにも同じ crankSound を1回鳴らす。新しい音色は作らない。
        end = HTML[HTML.index("function endCrank(e) {"):HTML.index('$("sceneMeter").addEventListener("pointerup", endCrank);')]
        self.assertIn("crankSound();", end)
        # 鳴らすのは揺れのアニメーションの直前（揺れ1回につき1回）だけに固定する
        self.assertEqual(end.count("crankSound();"), 1)
        self.assertLess(end.index("crankSound();"), end.index('$("crankArm").animate('))
        # 本物の回転の音（差2）と計器のピッは従来どおり
        self.assertIn('const crankSound = () => tone(185, 0.03, 0.03, "square");', HTML)
        move = HTML[HTML.index("crankDrag.sum += Math.abs(d);"):HTML.index("function endCrank(e)")]
        self.assertIn("crankSound();", move)
        self.assertIn("const meterBeep = () => tone(1240, 0.09, 0.035, \"sine\");", HTML)
        # 資料に1文だけ足す（ゲーム内文言は増やさない）
        self.assertIn("はかるで空振りしたときも、ハンドルが揺れるのに合わせて、回すときと同じ小さなカチッという音で知らせます", HTML)

    def test_cycle120_probe_demo_uses_probe_demo_sound(self):
        # 差分テーマ差26（差25の再監査の残り・手本の無音）: はかるの手本の揺れには
        # crankSound が付いた（差25）一方、ぬくで空振りしたときの手本の動き
        # （1回目の小さな揺れ・2回目の半分デモ）だけが無音だった（390×844実測で同期音0件）
        # ため、手本の滑る動きに固有の probeDemoSound を1回ずつ鳴らす。
        # 刺さってはいないので、刺さった音（pierceSound）は使わない。
        end = HTML[HTML.index("function endBagDrag(e) {"):HTML.index('$("sceneBag").addEventListener("pointerup", endBagDrag);')]
        self.assertEqual(end.count("probeDemoSound();"), 2)
        self.assertNotIn("pierceSound();", end)
        # 手本の音は専用の関数で、刺さった音・完了の音とは分ける
        self.assertIn("function probeDemoSound()", HTML)
        self.assertIn("o.frequency.setValueAtTime(380, t);", HTML)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(300, t + 0.13);", HTML)
        # 本物の刺さる音（差21）と完了の音（差9）は従来どおり
        self.assertIn("pierceSound();", HTML)
        self.assertIn("probeDoneSound();", HTML)
        # 3回目の空振りで自動で刺す経路（autoProbe）では手本の音は鳴らさない
        auto = HTML[HTML.index("function autoProbe() {"):HTML.index("function endBagDrag(e) {")]
        self.assertNotIn("probeDemoSound", auto)
        # 資料に1文だけ足す（ゲーム内文言は増やさない）
        self.assertIn("ぬくで空振りしたときも、穀刺しが手本の動きをするのに合わせて、専用の小さな音で知らせます", HTML)

    def test_cycle121_hanko_demo_uses_stamp_demo_sound(self):
        # 差分テーマ差27（差26の再監査の残り・手本の無音）: ぬくと はかる の手本には
        # 音が付いた（差25・差26）一方、おすで空振りしたときの手本の動き
        # （はんこが押せる所までの半分をおろして戻る）だけが無音だった
        # （390×844実測で同期音0件）ため、手本のおろす動きに固有の stampDemoSound を鳴らす。
        # 押してはいないので、実際に押したときの音は使わない。
        end = HTML[HTML.index("function endHanko() {"):HTML.index('$("bagBig").addEventListener("pointerup", endHanko);')]
        self.assertEqual(end.count("stampDemoSound();"), 1)
        # 鳴らすのは半分デモ（空振り2回目）のアニメーションの直前だけに固定する
        # （サイクル123で朱肉側にも半分デモの animate が増えたため、はんこ側の animate を対象にする）
        self.assertLess(end.index("stampDemoSound();"), end.index('$("hanko").animate(', end.index("stampDemoSound();")))
        self.assertIn("hankoTaps === 2", end[:end.index("stampDemoSound();")])
        # 手本の音は専用の関数で、実際に押したときの音・粒の tick とは分ける
        self.assertIn("function stampDemoSound()", HTML)
        fn = HTML[HTML.index("function stampDemoSound()"):HTML.index("function spreadSound()")]
        self.assertIn("o.frequency.setValueAtTime(340, t);", fn)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(240, t + 0.13);", fn)
        self.assertIn('o.type = "sine";', fn)
        self.assertIn("g.gain.setValueAtTime(0.018, t);", fn)
        self.assertEqual(HTML.count("stampDemoSound"), 2)  # 定義1＋呼び出し1
        # 実際に押す経路（dropHanko・stampNow）では手本の音は鳴らさない
        drop = HTML[HTML.index("function dropHanko() {"):HTML.index('$("bagBig").addEventListener("pointerdown"')]
        self.assertNotIn("stampDemoSound", drop)
        # 朱肉側の空振り（1回目の手本の指）にも鳴らさない（判子は動いていない）
        ink_branch = end[:end.index("if (!hankoDrag) return;")]
        self.assertNotIn("stampDemoSound", ink_branch)
        # 既存の手本の音と粒の tick は従来どおり
        self.assertIn("function probeDemoSound()", HTML)
        self.assertIn("const tick = () => tone(1100 + Math.random() * 900, 0.03, 0.025);", HTML)
        # 資料に1文だけ足す（ゲーム内文言は増やさない）
        self.assertIn("おすで空振りしたときも、はんこが手本の動きをするのに合わせて、専用の小さな音で知らせます", HTML)

    def test_cycle122_grade_demo_uses_grade_demo_sound(self):
        # 差分テーマ差28（差27の再監査の残り・手本の無音）: ぬく・はかる・おすの手本には
        # 音が付いた一方、きめるで空振り（1回タップ）したときの手本の動き
        # （手本の指がもう一度出て、ボタンが上へ12px小さく揺れる）だけが無音だった
        # （390×844実測で同期音0件）ため、手本の上がる動きに固有の音を鳴らす。
        # この1回目は等級を選んだわけではなく間違いの判定でもないため、
        # 間違えたときの無音（類4）とは切り分ける。選んではいないので正解の音は使わない。
        up = HTML[HTML.index('btn.addEventListener("pointerup"'):HTML.index('btn.addEventListener("pointercancel"')]
        self.assertEqual(up.count("gradeDemoSound();"), 1)
        # 鳴らすのは空振り1回目（taps === 1）の分岐の中だけに固定する
        self.assertIn("taps === 1", up[:up.index("gradeDemoSound();")])
        self.assertLess(up.index("gradeDemoSound();"), up.index("btn.animate("))
        # 手本の音は専用の関数で、正解の音・粒の tick とは分ける
        self.assertIn("function gradeDemoSound()", HTML)
        fn = HTML[HTML.index("function gradeDemoSound()"):HTML.index("function spreadSound()")]
        self.assertIn("o.frequency.setValueAtTime(420, t);", fn)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(560, t + 0.13);", fn)
        self.assertIn('o.type = "sine";', fn)
        self.assertIn("g.gain.setValueAtTime(0.018, t);", fn)
        self.assertEqual(HTML.count("gradeDemoSound"), 2)  # 定義1＋呼び出し1
        # 間違えたとき（等級を選び外れたとき）は従来どおり無音のまま（類4）
        pick = HTML[HTML.index("function pickGrade(btn) {"):HTML.index('document.querySelectorAll(".gradeBtn")')]
        self.assertNotIn("gradeDemoSound", pick)
        self.assertNotIn("tone(", pick)
        # 2回目のタップや上へ引いて選ぶ経路では手本の音は鳴らさない
        move = HTML[HTML.index('btn.addEventListener("pointermove"'):HTML.index('btn.addEventListener("pointerup"')]
        self.assertNotIn("gradeDemoSound", move)
        # 資料に1文だけ足す（ゲーム内文言は増やさない）
        self.assertIn("きめるで空振りしたときも、等級のボタンが手本の動きをするのに合わせて、専用の小さな音で知らせます", HTML)

    def test_cycle123_ink_demo_uses_ink_demo_sound(self):
        # 差分テーマ差29（差28の再監査の残り・手本の欠け）: 他の所作の空振り2回目には
        # 道具の半分デモがある（ぬく=穀刺しの半分・はかる=ハンドルの揺れ・
        # おす はんこ側=半分おろす）一方、おす朱肉側の2回目だけ半分デモ自体がなく
        # 無音だった（390×844実測で同期音0件）ため、手本の指の押し下げ（24px）の
        # 半分（12px）だけ はんこが押し下がって戻る半分デモを足し、固有の inkDemoSound を鳴らす。
        # 朱肉はまだ付いていないので、実際に付くときの音（inkSound）は使わない。
        end = HTML[HTML.index("function endHanko() {"):HTML.index('$("bagBig").addEventListener("pointerup", endHanko);')]
        ink_branch = end[:end.index("if (!hankoDrag) return;")]
        self.assertEqual(ink_branch.count("inkDemoSound();"), 1)
        # 鳴らすのは朱肉側の半分デモ（空振り2回目）のアニメーションの直前だけに固定する
        self.assertIn("hankoTaps === 2", ink_branch[:ink_branch.index("inkDemoSound();")])
        self.assertIn('transform:"translateY(12px)"', ink_branch)
        self.assertLess(ink_branch.index("inkDemoSound();"), ink_branch.index('$("hanko").animate('))
        # 半分デモでは状態を進めない（朱肉は付かない・inkDone は呼ばない）
        demo = ink_branch[ink_branch.index("hankoTaps === 2"):]
        self.assertNotIn("inkDone", demo)
        # デモの間に押し直していたら、終了時に揺れ（bob）を戻さない（Codexレビュー指摘・サイクル123）
        self.assertIn("if (!inked && !inkHold && !inkDrag) bobHanko();", demo)
        # 手本の音は専用の関数で、実際に付く音・はんこ側の手本の音・粒の tick とは分ける
        self.assertIn("function inkDemoSound()", HTML)
        fn = HTML[HTML.index("function inkDemoSound()"):HTML.index("function spreadSound()")]
        self.assertIn("o.frequency.setValueAtTime(290, t);", fn)
        self.assertIn("o.frequency.exponentialRampToValueAtTime(200, t + 0.13);", fn)
        self.assertIn('o.type = "sine";', fn)
        self.assertIn("g.gain.setValueAtTime(0.018, t);", fn)
        self.assertEqual(HTML.count("inkDemoSound"), 2)  # 定義1＋呼び出し1
        # 実際に朱肉が付く経路（inkDone）では手本の音は鳴らさず、従来の inkSound のまま
        done = HTML[HTML.index("function inkDone() {"):HTML.index("function stampNow() {")]
        self.assertNotIn("inkDemoSound", done)
        self.assertIn("inkSound();", done)
        # はんこ側の半分デモ（差27）には朱肉側の手本の音は混ぜない
        self.assertEqual(end.count("stampDemoSound();"), 1)
        self.assertNotIn("inkDemoSound", end[end.index("if (!hankoDrag) return;"):])
        # 空振り1回目（手本の指のみ）には鳴らさない（サイクル121の切り分けと同じ）
        self.assertNotIn("inkDemoSound", ink_branch[:ink_branch.index("hankoTaps === 2")])
        # 資料に1文だけ足す（ゲーム内文言は増やさない）
        self.assertIn("おすの朱肉で空振りしたときも、2回目にはんこが半分だけ押し下がる手本の動きと、専用の小さな音で知らせます", HTML)

    def test_cycle124_cooked_chip_appears_with_its_sound(self):
        # 差分テーマ差30（差16の見た目側の残り）: 炊き上がりチップの音は袋が着いて
        # 落ち着いた後（320ms）にある一方、チップの見た目は場面の切り替わりと同時に
        # 完成形で現れ、出現の動きがなかった（390×844実測で出現時のアニメーション0件・
        # 音より約320ms先行）。見た目も同じ320msにそろえ、ふわりと現れる動きを付ける。
        start_lot = HTML[HTML.index("function startLot()"):HTML.index("/* 皿の粒:")]
        self.assertIn("chip.hidden = true;", start_lot)
        self.assertIn("chip.hidden = false;", start_lot)
        self.assertIn("chip.animate(", start_lot)
        # 音（cookedSound）と同じ 320ms のタイミングで、同じコールバックから現れる
        self.assertIn("}, 320 * motion); } /* 炊き上がりチップの見た目も", start_lot)
        self.assertIn("cookedSound(); }, 320 * motion)", start_lot)
        self.assertNotIn("setTimeout(cookedSound", start_lot)
        # 別の袋へ移っていたら古いチップは出さない
        self.assertIn("if (lotIndex !== chipLot || !cookedReturns.length) return;", start_lot)
        # 最初の袋（返りがない時）は従来どおり出さない: ガードは lotIndex > 0 かつ返りあり
        self.assertIn("if (lotIndex > 0 && cookedReturns.length)", start_lot)
        # 資料に1文だけ足す（ゲーム内文言は増やさない）
        self.assertIn("チップは袋が着いて落ち着いてから、専用の音と一緒にふわりと現れます", HTML)

    def test_cycle125_next_button_appears_gently(self):
        # 差分テーマ差31: 押印後に現れる「つぎの ふくろ」ボタンだけが display の
        # 切り替えで完成形が即座に出ていた（390×844実測で出現時のアニメーション0件）。
        # 他の現れるもの（終了カード=opacity .4s・場面=.22s・チップ=ふわり260ms）と
        # 同じく、ふわりと現れる動きを付ける。押印した時だけ1回、流れは止めない。
        stamp = HTML[HTML.index("function stampNow()"):HTML.index("function dropHanko()")]
        self.assertIn('nextBtn.classList.add("on");', stamp)
        self.assertIn("nextBtn.animate(", stamp)
        self.assertIn('transform:"scale(.92)"', stamp)
        self.assertIn('transform:"scale(1)"', stamp)
        self.assertIn('duration:260 * motion, easing:"ease-out"', stamp)
        # 出現は stampNow（stamped ガードで1回だけ）の中だけ。隠す側は従来どおり即時
        self.assertEqual(HTML.count("nextBtn.animate("), 1)

    def test_cycle126_zoom_button_appears_gently(self):
        # 差分テーマ差32: みわけるに入った時に現れる🔍ボタンだけが hidden の
        # 切り替えで完成形が即座に出ていた（390×844実測で出現時のアニメーション
        # 0件・opacity即1）。他の現れるもの（チップ=ふわり260ms・差30／つぎの
        # 袋ボタン=ふわり260ms・差31）と同じく、ふわりと現れる動きを付ける。
        # 隠す側（みわけ完了時）は従来どおり即時。感じる所作には触れない。
        sort_fn = HTML[HTML.index("function toMiwakeru()"):HTML.index("function checkSpread()")]
        self.assertIn("zoomBtn.hidden = false;", sort_fn)
        self.assertIn("zoomBtn.animate(", sort_fn)
        self.assertIn('transform:"scale(.7)"', sort_fn)
        self.assertIn('transform:"scale(1)"', sort_fn)
        self.assertIn('duration:260 * motion, easing:"ease-out"', sort_fn)
        self.assertEqual(HTML.count("zoomBtn.animate("), 1)

    def test_cycle127_dish_grain_appears_gently(self):
        # 差分テーマ差33: みわけるでよけた粒が小皿（#dish）に着く瞬間だけが、
        # 飛んできた粒（fly）のアニメーションの後に完成形が即座に出ていた
        # （390×844実測で出現時のアニメーション0件・opacity即1）。他の現れる
        # もの（チップ=ふわり260ms・差30／つぎの袋ボタン=差31／🔍ボタン=差32）
        # と同じく、ふわりと現れる動きを付ける。着いた時だけ1回、流れは止めない。
        tap = HTML[HTML.index("function tapGrain(g)"):HTML.index("function resetZoomForSmiles()")]
        self.assertIn('$("dish").appendChild(mini);', tap)
        self.assertIn("mini.animate(", tap)
        self.assertIn('transform:"scale(.7)"', tap)
        self.assertIn('transform:"scale(1)"', tap)
        self.assertIn('duration:260 * motion, easing:"ease-out"', tap)
        self.assertEqual(HTML.count("mini.animate("), 1)

    def test_cycle128_stamp_mark_appears_gently(self):
        # 差分テーマ差34: おすで押した証印（#mark）だけが、opacity の切り替え
        # だけで完成形が即座に出ていた（390×844実測で出現時のアニメーション
        # 0件・opacity即1）。他の現れるもの（チップ・差30／つぎの袋ボタン・
        # 差31／🔍ボタン・差32／小皿の粒・差33）と同じく、押した勢いのまま
        # 少し大きく出て落ち着く穏やかな出現にする。傾き（-8deg）は保ち、
        # 押した時だけ1回、流れは止めない。
        stamp = HTML[HTML.index("function stampNow()"):HTML.index("function dropHanko()")]
        self.assertIn('$("mark").classList.add("on");', stamp)
        self.assertIn('$("mark").animate(', stamp)
        self.assertIn('transform:"rotate(-8deg) scale(1.22)"', stamp)
        self.assertIn('transform:"rotate(-8deg) scale(1)"', stamp)
        self.assertIn('duration:200 * motion, easing:"ease-out"', stamp)
        self.assertEqual(HTML.count('$("mark").animate('), 1)

    def test_cycle129_moisture_slot_appears_gently(self):
        # 差分テーマ差35: はかるで測定値が入る枠（slots）だけが、数字が入る
        # だけで完成形が即座に出ていた（390×844実測で出現時のアニメーション
        # 0件）。他の現れるもの（チップ・差30／つぎの袋ボタン・差31／🔍ボタン・
        # 差32／小皿の粒・差33／証印・差34）と同じくふわりと現れる形にそろえる。
        # 測定した時だけ1回、流れは止めない。
        reading = HTML[HTML.index("function takeReading()"):HTML.index("function crankPointer")]
        self.assertIn("const slot = $(\"slots\").children[i];", reading)
        self.assertIn("slot.animate(", reading)
        self.assertIn('transform:"scale(.7)"', reading)
        self.assertIn('transform:"scale(1)"', reading)
        self.assertIn('duration:260 * motion, easing:"ease-out"', reading)
        self.assertEqual(HTML.count("slot.animate("), 1)

    def test_cycle130_meter_is_riceta_f_shape(self):
        # 店主指示（2026-11-08）: はかるの水分計をケット科学の米麦水分計
        # 「ライスタf」の形にする。クリーム色の横長本体・下部と右のハンドルは
        # 濃い赤茶・中央に大きな液晶・ボタンは電源（黄）・選択・平均・測定（青）。
        # 操作（ハンドルを回して測る・3回の平均）は従来どおり変えない。
        self.assertIn("background:#f2e8cf", HTML)  # クリーム色の本体
        self.assertIn("border:5px solid #6e3520", HTML)  # レバーの土台の濃い赤茶
        self.assertIn("inset 0 -14px 0 #6e3520", HTML)  # 本体下部の濃い赤茶
        self.assertIn('<div id="mkeys" aria-hidden="true">', HTML)
        self.assertIn('<span class="pw">電源</span><span>選択</span><span>平均</span><span class="ms">測定</span>', HTML)
        self.assertIn("#mkeys span.pw { background:#f0bd2a;", HTML)  # 電源は黄
        self.assertIn("#mkeys span.ms { background:#2c63a8;", HTML)  # 測定は青
        self.assertIn("ライスタf", HTML)
        # 青い旧本体には戻っていない
        self.assertNotIn("background:#2c63a8;\n    box-shadow:inset 0 -8px 0 #1d4a82", HTML)
        # 操作の核は不変: 回す判定と平均の流れ
        self.assertIn("crankTurned >= (lotIndex === 0 ? 80 : 160)", HTML)
        self.assertIn("function showAverage()", HTML)

    def test_cycle131_first_bag_grain_is_held_and_checked(self):
        # 差分テーマ差36／店主指示「精米のこだわり」: 最初の袋では、つまんだ
        # わるい粒が330msで回転しながら飛び（投げるような速さ）、
        # 手に取って確かめる丁寧さになっていなかった。最初の袋だけ一拍
        # 持ち上げて大きく見てから、回さず静かに小皿へ運ぶ。2袋目以降は不変。
        tap = HTML[HTML.index("function tapGrain(g)"):HTML.index("function resetZoomForSmiles()")]
        self.assertIn("const flyAnim = lotIndex === 0 ? fly.animate([", tap)
        self.assertIn('scale(1.45)", offset:.38', tap)
        self.assertIn('scale(1.45)", offset:.62', tap)
        self.assertIn('duration:880 * motion', tap)
        self.assertIn('duration:330 * motion', tap)  # 2袋目以降は従来どおり
        self.assertIn("flyAnim.onfinish", tap)

    def test_cycle132_rice_journey_appears_after_stamp(self):
        # 店主指示（2026-11-09「この感じでゲーム修正」・米の流れの絵）:
        # 押印した玄米が精米されて白米になり、ごはんになる流れを、水彩風の
        # 大きな絵でおすの場面にふわりと見せる。もみがら・ぬかも添える。
        # 流れは止めず、絵は操作を妨げない（pointer-events:none）。
        self.assertIn('<div id="journey" hidden aria-hidden="true">', HTML)
        journey = HTML[HTML.index('id="journey"'):HTML.index('</svg>', HTML.index('id="journey"'))]
        for word in ("玄米", "精米", "白米", "ごはん", "もみがら", "ぬか", "ぜんぶ つかう"):
            self.assertIn(word, journey)
        self.assertIn("#journey { position:absolute;", HTML)
        self.assertIn("pointer-events:none;", HTML[HTML.index("#journey {"):HTML.index("#journey svg")])
        stamp = HTML[HTML.index("function stampNow()"):HTML.index("function dropHanko()")]
        self.assertIn('const jr = $("journey"); jr.hidden = false;', stamp)
        self.assertIn("jr.animate(", stamp)
        start_lot = HTML[HTML.index("function startLot()"):HTML.index("/* 皿の粒:")]
        self.assertIn('$("journey").hidden = true;', start_lot)
        self.assertIn("精米されて白米になり、ごはんになるまでの流れを、水彩風の絵で見せます", HTML)

    def test_cycle133_rice_journey_starts_from_paddy(self):
        # 差38（店主指示2026-11-09・米の流れの絵の続き）: 押印後の流れの帯を
        # 稲からの全行程に伸ばす（稲→脱穀→もみ→もみすり→玄米→精米→白米→ごはん、
        # 副産物は稲わら・もみがら・ぬか）。開いた直後の右下に置く案は、案内の手と
        # 穀刺しに重なり窮屈だったため、締めの帯を完全版にする形に寄せた。
        journey = HTML[HTML.index('id="journey"'):HTML.index('</svg>', HTML.index('id="journey"'))]
        for word in ("稲", "脱穀", "もみ", "もみすり", "玄米", "精米", "白米", "ごはん", "稲わら", "もみがら", "ぬか", "ぜんぶ つかう"):
            self.assertIn(word, journey)
        self.assertIn('viewBox="0 0 360 92"', journey)
        self.assertIn("height:92px;", HTML[HTML.index("#journey svg"):HTML.index("#journey text")])
        self.assertIn("稲が脱穀されて もみになり、もみすりで玄米になり、精米されて白米になり、ごはんになるまでの流れを、水彩風の絵で見せます", HTML)

    def test_cycle134_average_number_on_lcd_gently_appears(self):
        # 差39: はかるで平均が決まる瞬間、液晶（#lcd）の平均数字だけが
        # innerHTML の差し替えで即座に出ていた（出現アニメーション0件）。
        # 他の現れるものと同じ260msのふわりとした出現を、平均確定時だけ付ける。
        start = HTML.index("function showAverage()")
        avg = HTML[start:HTML.index("setTimeout(toMiwakeru", start)]
        self.assertIn('$("lcd").animate([{ opacity:0, transform:"scale(.7)" }', avg)
        self.assertIn('duration:260 * motion', avg)
        # 1回ごとの測定値の表示（takeReading）は従来どおり即時で、アニメーションは付けない
        reading = HTML[HTML.index("function takeReading()"):HTML.index("function crankPointer")]
        self.assertNotIn('$("lcd").animate', reading)

    def test_cycle135_step_name_gently_appears(self):
        # 差40: 段階が変わる瞬間、頭の段階名（#stepName）だけが textContent の
        # 差し替えで即座に出ていた（出現アニメーション0件）。
        # 他の現れるものと同じ260msのふわりとした出現を、setStep の時だけ付ける。
        start = HTML.index("function setStep(i, text)")
        body = HTML[start:HTML.index("function showTop", start)]
        self.assertIn('$("stepName").animate([{ opacity:0, transform:"scale(.7)" }', body)
        self.assertIn('duration:260 * motion', body)
        # setStep 以外の場所では段階名にアニメーションを付けない（出現は段階の切り替え時だけ）
        self.assertEqual(HTML.count('$("stepName").animate'), 1)

    def test_cycle136_tap_takes_the_grain_under_the_finger(self):
        # 最初の1分: 見えているわるい粒の真ん中を押しても、となりの良い粒の「ゆるさの枠」
        # （上下12px）が重なり順で勝ち、良い粒が揺れるだけで取れなかった
        # （390×844実測・最初の袋の真ん中タップ24回中10回）。
        # 指の真下に粒そのものがあればその粒を取り、ゆるさの枠は直接当たらない時だけ使う。
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        fn = HTML[HTML.index("function grainAt(p) {"):HTML.index("const pts = new Map();")]
        script = """
const assert = require('node:assert/strict');
const GW = 36, GH = 20, Z = {s:1};
const mk = (kind, x, y, r, z) => ({kind, x, y, r, z, gone:false, el:{hidden:false}});
const bad = mk('higai', 100, 100, 0, 1), good = mk('seiryu', 100, 130, 0, 5);
let grains = [bad, good];
""" + fn + """
// わるい粒の真ん中: 良い粒（重なり順が上）のゆるさの枠にも入るが、真下にあるわるい粒を取る
assert.equal(grainAt({x:100, y:100}), bad);
assert.equal(grainAt({x:100, y:109}), bad);
// 良い粒そのものの上は良い粒
assert.equal(grainAt({x:100, y:125}), good);
// 粒そのものが重なる所は、上に見えている粒（重なり順が上）
const over = mk('seiryu', 110, 104, 0, 7); grains = [bad, over];
assert.equal(grainAt({x:104, y:102}), over);
// どの粒にも直接当たらない時は、従来どおりゆるさの枠で受ける（短い向き12px）
grains = [bad];
assert.equal(grainAt({x:100, y:121}), bad);
assert.equal(grainAt({x:100, y:123}), null);
// 取った粒・まだ落ちていない粒は当てない
bad.gone = true; assert.equal(grainAt({x:100, y:100}), null);
"""
        subprocess.run([node, "-e", script], capture_output=True, text=True, check=True)

    def test_cycle136_first_bag_faces_come_above_good_grains(self):
        # 最初の袋で顔が出たわるい粒は、良い粒（重なり順2〜21）の上に出す。
        # 山の下に隠すための重なり順（1）のままで、広げた後も顔が半分隠れていた（390×844実測）。
        self.assertIn("const FACE_Z = 100;", HTML)
        faces = HTML[HTML.index("function refreshBadFaces()"):HTML.index("let zoomAnimTimer")]
        self.assertIn("if (firstBagFace(g)) { g.z = FACE_Z; g.el.style.zIndex = FACE_Z; }", faces)
        self.assertIn("z:bad ? 1 : 2 + i", HTML)  # 山の間は従来どおり下に隠れる

    def test_cycle136_resize_alone_does_not_spread_the_pile(self):
        # resize のたびに全部の粒を起こして押し合わせていたため、開いた直後の resize だけで
        # 山がほどけ、「なでて ひろげる」の手本が出ず、広がった合図の音が ぬく の途中で鳴っていた
        # （390×844・スマホ表示の実測15回中14回）。広げる前は皿の中へ収め直すだけにする。
        start = HTML.index('window.addEventListener("resize", () => {')
        body = HTML[start:HTML.index("applyZoom();", start)]
        self.assertIn("if (spread) { grains.forEach(g => { g.awake = 1; }); startSim(); }", body)
        self.assertIn("else grains.forEach(g => {", body)
        self.assertIn("renderGrain(g);", body)
        self.assertEqual(body.count("startSim()"), 1)

    def test_cycle136_rice_journey_does_not_cover_the_stamp(self):
        # 背の低い画面（360×640実測）で、米の流れの絵（高さ104px＋下6px）が袋の下83pxと
        # 証印の下26pxにかぶさり、押したばかりの証印が欠けていた。絵の場所を先に空けておく。
        self.assertIn("#osu { display:flex; align-items:center; justify-content:center; box-sizing:border-box; padding-bottom:112px; }", HTML)
        # 横向きの低い画面は下に空きがないので、絵を袋の右へ置く
        land = HTML[HTML.index("@media (orientation:landscape) and (max-height:500px)"):HTML.index("@media (prefers-reduced-motion: reduce)")]
        self.assertIn("#osu { padding-bottom:0; padding-right:54%; }", land)
        self.assertIn("#journey { left:46%; top:calc(50% - 52px); bottom:auto; }", land)

    def test_cycle137_taps_before_spreading_are_caught(self):
        # 最初の1分: 「なでて ひろげる」だけ空振りの受け皿がなく、タップだけの人は
        # 山の粒が揺れるだけで先へ進めなかった（390×844実測: 51回タップ・57秒でも広がらず）。
        # 1回目=手本の指をもう一度／2回目=山がほどけて広がる。
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        fn = HTML[HTML.index("let spreadTaps = 0;"):HTML.index("/* トントン:")]
        script = """
const assert = require('node:assert/strict');
let step = 2, spread = false, sims = 0; const guides = [], plate = {};
const grains = [{gone:false, awake:0}, {gone:true, awake:0}, {gone:false, awake:0}];
const guideAt = (kind, el) => guides.push([kind, el]), startSim = () => { sims++; };
""" + fn + """
nudgeSpread();
assert.deepEqual(guides, [['sweep', plate]]);   // 1回目: 手本の指をもう一度
assert.equal(sims, 0);
nudgeSpread();
assert.equal(sims, 1);                           // 2回目: 山がほどける
assert.deepEqual(grains.map(g => g.awake > 0), [true, false, true]);
assert.equal(spreadTaps, 0);
spread = true; nudgeSpread(); nudgeSpread();     // 広げた後は数えない
assert.equal(sims, 1);
spread = false; step = 3; nudgeSpread(); nudgeSpread();
assert.equal(sims, 1);
"""
        subprocess.run([node, "-e", script], capture_output=True, text=True, check=True)
        end = HTML[HTML.index("function endPlatePointer(e, cancelled)"):HTML.index("/* 振る:")]
        self.assertIn('if (!spread && (!g || g.kind === "seiryu")) nudgeSpread();', end)  # わるい粒を取ったタップは数えない
        start_lot = HTML[HTML.index("function startLot()"):HTML.index("/* 皿の粒:")]
        self.assertIn("spreadTaps = 0;", start_lot)

    def test_cycle137_tap_only_measuring_does_not_start_over(self):
        # はかる: タップ3回で1回はかれた後も数え直していたため、タップだけの人は
        # 3回×3＝9〜10回・約12秒かかった（390×844実測。ほかの所作は3回・約4秒）。
        # 同じ袋の残りはタップ1回ごとにはかれる。袋が替われば数え直す。
        crank = HTML[HTML.index("function endCrank(e)"):HTML.index('$("sceneMeter").addEventListener("pointerup", endCrank);')]
        self.assertIn("if (++meterTaps >= NUDGE_LIMIT) { meterTaps = NUDGE_LIMIT - 1; takeReading(); return; }", crank)
        self.assertNotIn("{ meterTaps = 0; takeReading(); return; }", HTML)
        self.assertIn("meterTaps = 0; crankTurned = 0;", HTML[HTML.index("function startLot()"):HTML.index("/* 皿の粒:")])

    def test_cycle138_swipe_guide_stays_off_the_fresh_stamp(self):
        # 最初の1分（アニメーションの重なり）: 押した直後、袋を横へ流す手本の指が袋の真ん中（高さ50%）に出て、
        # 押したばかりの証印の輪の上を行き来していた（390×844・360×640実測: 約半分の間、最大30pxかぶる）。
        # 証印は袋の高さ53〜85%にあるので、指は上のほう（24%）に出す。
        stamp = HTML[HTML.index("function stampNow()"):HTML.index("function dropHanko()")]
        self.assertIn('guideAt("move", $("bagBig"), 90, 0, 0.24);', stamp)
        self.assertNotIn('guideAt("move", $("bagBig"), 90, 0);', HTML)
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        start = HTML.index("function guideAt(kind, el, gx, gy, at) {")
        fn = HTML[start:HTML.index("/* ぬく:", start)]
        script = """
const assert = require('node:assert/strict');
const lotIndex = 0, guideEl = {style:{setProperty(){}}, dataset:{}, className:'', offsetWidth:0}, guideOff = () => {};
var demoDown = new Set();
var guideAnchor = null;
const plate = {}, $ = () => ({style:{}}), window = {innerWidth:390};
const el = {getBoundingClientRect: () => ({left:0, top:100, width:200, height:400})};
const restRect = el => el.getBoundingClientRect(); // 上の場面の外の相手（サイクル141）
""" + fn + """
guideAt('move', el, 90, 0, 0.24); assert.equal(guideEl.style.top, '196px');   // 指定した高さ
guideAt('move', el, 90, 0);       assert.equal(guideEl.style.top, '300px');   // 省けば真ん中
guideAt('move', el, 0, -48);      assert.equal(guideEl.style.top, '428px');   // 上へ引く手本は下のふちから（従来どおり）
"""
        subprocess.run([node, "-e", script], capture_output=True, text=True, check=True)

    def test_cycle137_current_pip_gently_appears(self):
        # 差41: 段階が変わる瞬間、進み具合（#pips）の今のバーだけが className の
        # 差し替えで即座に色が切り替わっていた（出現アニメーション0件）。
        # 段階の名前（差40）と同じ260msのふわりとした出現を、今のバーにだけ付ける。
        start = HTML.index("function setStep(i, text)")
        body = HTML[start:HTML.index("function showTop", start)]
        self.assertIn('$("pips").children[i].animate([{ opacity:0, transform:"scale(.7)" }', body)
        self.assertIn('duration:260 * motion', body)
        # pips へのアニメーションは setStep の中だけ（出現は段階の切り替え時だけ・今のバーだけ）
        self.assertEqual(HTML.count('$("pips").children[i].animate'), 1)

    def test_cycle144_hint_gently_appears(self):
        # 差43: 段階が変わる瞬間、案内文（#hint）だけが textContent の差し替えで
        # 即座に出ていた（出現アニメーション0件）。段階の名前（差40）・進み具合の
        # 今のバー（差41）と同じ260msのふわりとした出現を、setStep の時だけ付ける。
        start = HTML.index("function setStep(i, text)")
        body = HTML[start:HTML.index("function showTop", start)]
        self.assertIn('hint.animate([{ opacity:0, transform:"scale(.7)" }', body)
        self.assertIn('duration:260 * motion', body)
        # textContent を入れてから動きを付ける（中身が変わった後に現れる）
        self.assertLess(body.index("hint.textContent = text;"), body.index("hint.animate("))
        # 案内文へのアニメーションは setStep の中だけ（途中の案内の差し替えは従来どおり即時）
        self.assertEqual(HTML.count("hint.animate("), 1)

    def test_cycle145_photos_gently_appear(self):
        # 差44: 実物の写真（穀刺し・一等米）は顔が出た後に読み込まれるため、場面の
        # すべり込み（.22s）が終わった後に完成形で即座に現れていた（出現アニメーション0件）。
        # 他の現れるものと同じ260msのふわりとした出現を、読み込めた時だけ1回付ける。
        start = HTML.index("function photoAppear(im)")
        body = HTML[start:HTML.index("faceImg.addEventListener", start)]
        self.assertIn('im.animate([{ opacity:0, transform:"scale(.7)" }', body)
        self.assertIn('duration:260 * motion', body)
        # 読み込み順と写真そのものは従来どおり（load で1回だけ・src を入れる前に付ける）
        self.assertIn('addEventListener("load", () => photoAppear(im), { once:true })', body)
        self.assertLess(body.index('addEventListener("load"'), body.index("im.src = im.dataset.src"))
        self.assertEqual(HTML.count("() => photoAppear(im)"), 1)
        # 写真は写真のまま（差し替え・イラスト化はしない）
        self.assertIn('data-src="kensa/kokusashi.webp"', HTML)
        self.assertIn('data-src="kensa/ittomai.webp"', HTML)

    def test_cycle146_nothing_broken_shows_while_the_script_is_still_coming(self):
        # 最初の1分（おそい回線・おそいスマホ）: スクリプトはページのいちばん後ろにあり、届くまでの間
        # （おそい3G・CPU6倍の実測で0.8〜2.1秒）は、置き場所の決まっていない手本の指👆が左はしに半分・
        # 写真の代わりの文字「穀刺しの実物の写真」・袋が描かれる前の案内文「ふくろを タップ」が見えていた。
        # 始まるまでは見せず、始まったら（startLot の後）今までどおり出す。
        self.assertIn('<main id="app" class="boot">', HTML)
        self.assertIn(".boot #poke, .boot #hint, .photo[data-src] { visibility:hidden; }", HTML)
        # boot を外すのは startLot（指の置き場所・案内文が決まる）の後・スクリプトの最後で1回だけ
        tail = HTML[HTML.rindex("armIdle();\nstartLot();"):]
        self.assertIn('startLot();\n$("app").classList.remove("boot");', tail)
        # 外すのは 2 か所だけ: 始まった時（上）と、始まるとちゅうで エラーで止まった時（Codex 指摘 PR #1100）
        self.assertEqual(HTML.count('classList.remove("boot")'), 2)
        self.assertIn('window.addEventListener("error", function(){ var a = document.getElementById("app"); if (a) a.classList.remove("boot"); });', HTML)
        self.assertNotIn('classList.add("boot")', HTML)
        # 隠すだけで、場所は取ったまま（始まった時に舞台の高さが動かない）
        css = HTML[HTML.index(".boot #poke"):HTML.index("\n", HTML.index(".boot #poke"))]
        self.assertNotIn("display", css)
        # 写真は data-src のまま（顔が先・写真は後の順は変えない）
        self.assertIn('faceImg.addEventListener("load", loadPhotos);', HTML)

    def test_cycle147_drags_outside_the_scene_are_not_misses(self):
        # 場面の外で動かした指（8pxより大きい）は空振りに数えない（場面の中と同じ線引き）。
        # 旧版は離した所を始点にしていたので、皿から120px動かす指を3回で ひとりでに ぬけた
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        start = HTML.index("let offDown = null;")
        fn = HTML[start:HTML.index("armIdle();\nstartLot();", start)]
        self.assertIn("if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) return;", fn)
        script = """
const assert = require('node:assert/strict');
let step = 0, measured = 0, crankDrag = null; const calls = [];
const P = {x:200, done:false, auto:false, drag:null}, LOT = {moisture:[1, 2, 3]};
const endBagDrag = (e) => { calls.push('bag'); P.drag = null; };
const endCrank = (e) => { calls.push('crank'); crankDrag = null; };
const on = {};
const document = {addEventListener(type, fn) { (on[type] = on[type] || []).push(fn); }};
""" + fn + """
const t = {closest(sel) { return sel === '#app' ? {} : null; }};
const go = (dx) => { on.pointerdown.forEach(f => f({pointerId:1, clientX:10, clientY:20, target:t})); on.pointerup.forEach(f => f({pointerId:1, clientX:10 + dx, clientY:20, target:t})); };
go(120); go(9); assert.deepEqual(calls, []);
go(8); assert.deepEqual(calls, ['bag']);
step = 1; go(120); assert.deepEqual(calls, ['bag']);
go(0); assert.deepEqual(calls, ['bag', 'crank']);
"""
        r = subprocess.run([node, "-e", script], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_cycle147_touches_outside_the_scene_count_as_misses(self):
        # 最初の1分（まちがった所をさわる人）: ぬく・はかるの間、上の場面の外（下の大きな皿・案内文・顔）への指は
        # 手本の指が0.3秒消えて戻るだけで、何回さわっても進まなかった（390×844・320×568実測:
        # ぬくで皿・案内文・顔を各4回=音と道具の動き0回・進み0／さした後に皿を4回=0／はかるで皿の粒・案内文を各4回=はかれた回数0）。
        # 場面の中の空振りと同じ数え方（endBagDrag・endCrank）へ そのまま渡す。3回目に ひとりでに進む。
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        start = HTML.index("let offDown = null;")
        fn = HTML[start:HTML.index("armIdle();\nstartLot();", start)]
        script = """
const assert = require('node:assert/strict');
let step = 0, measured = 0, crankDrag = null; const calls = [];
const P = {x:200, done:false, auto:false, drag:null}, LOT = {moisture:[1, 2, 3]};
const endBagDrag = (e) => { calls.push(['bag', P.drag.id, P.drag.moved, e.pointerId]); P.drag = null; };
const endCrank = (e) => { calls.push(['crank', crankDrag.id, crankDrag.moved, e.pointerId]); crankDrag = null; };
const on = {};
const document = {addEventListener(type, fn) { (on[type] = on[type] || []).push(fn); }};
""" + fn + """
const el = (hit) => ({closest(sel) { return sel.split(', ').some(x => hit.includes(x)) ? {} : null; }});
const touch = (hit, id, up) => {
  const e = {pointerId:id, clientX:10, clientY:20, target:el(hit)};
  on.pointerdown.forEach(f => f(e));
  if (up !== false) on.pointerup.forEach(f => f(e));
};
// ぬく: 皿・案内文（#app の中・場面の外）は 空振りとして endBagDrag へ。動かしていない指として渡す
touch(['#app'], 1);
assert.deepEqual(calls, [['bag', 1, false, 1]]);
// 場面の中・📖・終了カード・つぎの袋・資料（#app の外）は数えない
touch(['#app', '#sceneBag'], 2); touch(['#app', '#notesLink'], 3); touch(['#app', '#idleCard'], 4); touch(['#app', '#nextBtn'], 5); touch([], 6);
assert.equal(calls.length, 1);
// 場面の中で指が動いている間・ひとりでに ぬけている間・ぬき終わった後は 混ぜない
P.drag = {id:9}; touch(['#app'], 7); assert.equal(calls.length, 1); P.drag = null;
P.auto = true; touch(['#app'], 7); assert.equal(calls.length, 1); P.auto = false;
P.done = true; touch(['#app'], 7); assert.equal(calls.length, 1); P.done = false;
// 別の指の pointerup・とちゅうで取り消された指は数えない
touch(['#app'], 8, false); on.pointerup.forEach(f => f({pointerId:99, clientX:0, clientY:0, target:el(['#app'])}));
touch(['#app'], 8, false); on.pointercancel.forEach(f => f({pointerId:8})); on.pointerup.forEach(f => f({pointerId:8, clientX:0, clientY:0, target:el(['#app'])}));
assert.equal(calls.length, 1);
// はかる: 皿の粒・案内文は endCrank へ（タップとして）。はかり終えた後・場面の中は数えない
step = 1;
touch(['#app'], 10);
assert.deepEqual(calls[1], ['crank', 10, false, 10]);
touch(['#app', '#sceneMeter'], 11);
measured = 3; touch(['#app'], 12); measured = 0;
assert.equal(calls.length, 2);
// みわける より後は変えない
for (const s of [2, 3, 4]) { step = s; touch(['#app'], 20 + s); }
assert.equal(calls.length, 2);
"""
        subprocess.run([node, "-e", script], capture_output=True, text=True, check=True)
        # 空振りの数え方は場面の中と同じ道（別の数え方を足さない）
        self.assertNotIn("bagTaps", fn)
        self.assertNotIn("meterTaps", fn)
        # 始まりの順（サイクル146）は変えない
        self.assertIn('armIdle();\nstartLot();\n$("app").classList.remove("boot");', HTML)

    def test_cycle139_taps_after_inserting_are_caught(self):
        # 最初の1分（本物の指）: さした後の空振りは数えず手本も出なかったため、押し込んで指を離し
        # 「ひきぬく →」を見て穀刺しをタップする人・指を置くだけの人は、4回やっても何も起きなかった
        # （390×664・390×844・360×640実測: 各8/20が進まず）。
        # 1回目=手本の指をひきぬく向きに／2回目=半分ぬけて戻る／3回目=自分でぬける。
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        start = HTML.index("function pullPoke() {")
        fn = HTML[start:HTML.index("/* はかる:", start)]
        script = """
const assert = require('node:assert/strict');
const NUDGE_LIMIT = 3, motion = 1;
let step = 0, lotIndex = 0, bagTaps = 0, autos = 0, sounds = 0, cancels = 0; const anims = [];
const P = {x:100, y:50, rest:200, L:100, inserted:true, done:false};
const poke = {style:{display:'none', left:'', setProperty(k, v) { this[k] = v; }}, dataset:{}};
const probe = {animate(frames, opt) { anims.push([frames[1].transform, opt.duration]); return {cancel() { cancels++; }}; }};
const sceneBag = {clientWidth:400};
const $ = id => ({poke, probe, sceneBag})[id];
const autoProbe = () => { autos++; }, probeDemoSound = () => { sounds++; };
""" + fn + """
pullNudge();                                    // 1回目: 手本の指をひきぬく向きに出し、小さく動く
assert.equal(poke.style.display, '');
assert.equal(poke.style.left, '172px');
assert.equal(poke.style['--pokeDx'], '140px');   // 入っている長さ（200-100）の1.4倍（サイクル143。旧版は46px固定）
assert.deepEqual(anims[0], ['translate(118px,50px)', 320]);
pullNudge();                                    // 2回目: 半分ぬけて戻る。前の手本の動きは止める
assert.deepEqual(anims[1], ['translate(150px,50px)', 640]);
assert.equal(cancels, 1);
assert.equal(sounds, 2);
assert.equal(autos, 0);
pullNudge();                                    // 3回目: 自分でぬける。手本の動きは残さない
assert.equal(autos, 1);
assert.equal(cancels, 2);
assert.equal(anims.length, 2);
P.done = true; pullNudge(); assert.equal(autos, 1);   // ぬけた後は数えない
P.done = false; P.inserted = false; pullNudge(); assert.equal(autos, 1);   // さす前は従来の数え方（endBagDrag）
"""
        subprocess.run([node, "-e", script], capture_output=True, text=True, check=True)
        end = HTML[HTML.index("function endBagDrag(e) {"):HTML.index('$("sceneBag").addEventListener("pointerup", endBagDrag);')]
        self.assertIn("const still = !P.drag.moved && Math.max(P.drag.far || 0, Math.hypot(e.clientX - P.drag.cx, e.clientY - P.drag.cy)) <= 8;", end)
        # Codex指摘（PR #1074）を実際の関数で確かめる
        auto = HTML[HTML.index("function autoProbe() {"):HTML.index('$("sceneBag").addEventListener("pointerdown"')]
        script2 = """
const assert = require('node:assert/strict');
const motion = 1; let step = 0, now = 0; const q = []; const moves = [];
globalThis.performance = { now: () => now };
globalThis.requestAnimationFrame = f => { q.push(f); };
const P = {x:100, inX:100, rest:200, inserted:true, done:false, auto:false, drag:null};
const poke = {style:{display:''}};
const $ = id => ({poke})[id];
const stopProbeAttract = () => {}, moveProbe = x => { moves.push(x); P.x = x; };
""" + auto + """
autoProbe();                       // 3回目のタップ: 自分でぬける動きが始まる
now = 100; q.shift()();            // 100ms 進む
const mid = P.x;
autoProbe();                       // その間にもう一度タップ: 始めなおさない
assert.equal(q.length, 1);         // 動きは1本のまま（旧版は2本になった）
assert.equal(P.x, mid);            // さした所へ押し戻さない
P.done = true; q.shift()(); assert.equal(P.auto, false);   // 終わったら印を下ろす
// たてへ引いて離した指は、さした後の空振りに数えない
let nudges = 0; const pullNudge = () => { nudges++; }; let bagTaps = 0, lotIndex = 0; const NUDGE_LIMIT = 3;
const probeDemoSound = () => {};
""" + end + """
P.done = false; P.inserted = true;
P.drag = {id:1, cx:50, cy:50, far:100, x0:100, moved:false}; endBagDrag({pointerId:1, clientX:50, clientY:150}); assert.equal(nudges, 0);
P.drag = {id:1, cx:50, cy:50, far:0, x0:100, moved:false};   endBagDrag({pointerId:1, clientX:50, clientY:150}); assert.equal(nudges, 0);   // 離した位置だけが遠くても数えない
P.drag = {id:1, cx:50, cy:50, far:3, x0:100, moved:false};   endBagDrag({pointerId:1, clientX:52, clientY:51});  assert.equal(nudges, 1);   // 置いただけ・タップは数える
"""
        subprocess.run([node, "-e", script2], capture_output=True, text=True, check=True)
        self.assertIn("if (P.inserted && !P.done && still) { pullNudge(); return; }", end)  # ひきぬく途中で離した指は数えない
        move = HTML[HTML.index("function moveProbe(x) {"):HTML.index("function pourOne(g) {")]
        self.assertIn("bagTaps = 0;", move)  # さした時に数え直す
        down = HTML[HTML.index('$("sceneBag").addEventListener("pointerdown",'):HTML.index('$("sceneBag").addEventListener("pointermove",')]
        self.assertIn("stopPullDemo();", down)  # 指が触れたら手本の動きは止める
        lp = HTML.index("function layoutProbe() {")
        layout = HTML[lp:HTML.index("function setProbe(x)", lp)]
        self.assertIn("else if (!P.done) pullPoke();", layout)

    def test_cycle139_touches_beside_the_sense_token_are_caught(self):
        # 最初の1分（本物の指）: 🤲のふちから10〜25px外で始めた運びは、4回やっても何も起きず、
        # 代わりに下の皿が反応して粒がなでられ、案内が「わるい粒を つまむ」に戻ることがあった
        # （390×664・390×844・360×640実測: 各4回とも進まず）。
        # 🤲の当たりを24px広げ、その外の指は🤲の空振りと同じに数え、皿は🤲が出ている間は指を受けない。
        self.assertIn('#senseToken::before { content:""; position:absolute; inset:-24px; border-radius:50%; }', HTML)
        start = HTML.index('token.addEventListener("pointerup", endToken);')
        outside = HTML[start:HTML.index('token.addEventListener("pointercancel", endToken);')]
        self.assertIn('document.addEventListener("pointerup", (e) => {', outside)
        self.assertIn("if (token.hidden || senseDrag || senseHold || e.target === token || token.contains(e.target)) return;", outside)
        self.assertIn('if (!e.target.closest || !e.target.closest("#stage, #head") || e.target.closest("#notesLink")) return;', outside)  # 📖・下の説明・手が止まったカードは数えない
        self.assertIn('if (senseKind === "nigiru") senseHold = {}; else senseDrag = { x:e.clientX, y:e.clientY, moved:false };', outside)
        self.assertIn("endToken();", outside)
        down = HTML[HTML.index('plate.addEventListener("pointerdown",'):HTML.index('plate.addEventListener("pointermove",')]
        self.assertIn("if (step !== 2 || e.target === zoomBtn || !token.hidden) return;", down)

    def test_cycle140_demonstration_on_every_bag_and_comes_back(self):
        # 店主指示2026-11-10「お手本モーションを出す」: 手本は最初の袋だけ（lotIndex !== 0 なら出さない）だったため、
        # 2袋目からは はかる の「ぐるぐる まわす」などに手本が1つも出なかった（390×664実測: 3袋30所作のうち21所作）。
        # 最初の袋でも、短く回して離すと手本は二度と出なかった。
        # どの袋・どの所作でも出し、触れたら消し、離して2秒進まなければまた出す。慣れた人には4秒。出なくなることはない。
        self.assertNotIn("if (lotIndex !== 0) return;", HTML)
        self.assertIn("店主指示2026-11-10「お手本モーションを出す」", HTML)
        self.assertIn('$("poke").style.display = ""; /* どの袋でも出す（サイクル140） */', HTML)
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        start = HTML.index("const DEMO_FIRST = 800, DEMO_BACK = 300, DEMO_HOLD = 2000, DEMO_LOOK = 2000, DEMO_BACK_SLOW = 4000;")
        fn = HTML[start:HTML.index("(function demoLoop()", start)]
        script = """
const assert = require('node:assert/strict');
let T = 0; const performance = {now: () => T};
let simOn = false; const setTimeout = () => {}; // 動いているものは無い場面（サイクル142の確かめは別のテスト）
let step = 1, measured = 0, badLeft = 2, spread = false, leaving = false, stamped = false, inked = false, lotIndex = 4, everZoomed = false, isNear = false, hankoMax = 80;
const finePointer = false, LOT = {moisture:[1, 2, 3]}, P = {done:false, auto:false, inserted:false}, token = {hidden:true}, grains = [], zoomBtn = {}, Z = {s:1, tx:0, ty:0};
const plate = {getBoundingClientRect: () => ({left:0, top:0, right:300, bottom:300}), clientLeft:0, clientTop:0};
const shown = []; let on = false, scrolled = false;
const guideEl = {classList:{contains: () => on}};
const poke = {style:{display:'none'}};
const $ = id => id === 'poke' ? poke : {id};
const guideOff = () => { on = false; }, guideAt = (kind, el) => { on = true; shown.push(kind + ':' + (el.id || 'point')); };
const guideSense = () => { on = true; shown.push('sense'); }, pullPoke = () => {}, stabPoke = () => {}, syncPokeToAttract = () => {}, firstBagFace = () => false, lotGrade = () => 0;
const handlers = {};
const document = {documentElement:{classList:{contains: () => scrolled}}, addEventListener: (n, f) => { handlers[n] = f; }, querySelectorAll: () => [{id:'grade0'}], getAnimations: () => []};
const window = {addEventListener: () => {}};
var demoDown = new Set();
var guideAnchor = null;
""" + fn + """
const at = (t) => { T = t; demoTick(); };
// 5袋目の はかる（従来は手本なし）: 所作が始まって0.8秒までに出る
at(0); assert.deepEqual(shown, []);
at(600); assert.deepEqual(shown, []);
at(900); assert.deepEqual(shown, ['circle:crank']);
at(1100); assert.equal(shown.length, 1);                       // 出ている間は出し直さない
// 触れたら消える。指がのっている間は出ない
T = 1200; handlers.pointerdown({pointerId:1}); assert.equal(on, false); assert.equal(poke.style.display, 'none');
at(5000); assert.equal(shown.length, 1);
// 離して0.3秒進まなければ、また出る（サイクル142。旧版は2秒）
T = 5100; handlers.pointerup({pointerId:1});
at(5300); assert.equal(shown.length, 1);
at(5500); assert.deepEqual(shown, ['circle:crank', 'circle:crank']);
// 説明を読んでいる間（scrolled）は出さない
T = 7300; handlers.pointerdown({pointerId:1}); T = 7400; handlers.pointercancel({pointerId:1});
scrolled = true; at(9600); assert.equal(shown.length, 2);
scrolled = false; at(9800); assert.equal(shown.length, 3);
// 待ちの間（平均を出している）は "" で、前の手本を消す
measured = 3; at(10000); assert.equal(demoPhase(), ''); assert.equal(on, false);
// 所作ごとの手本
step = 2; at(10200); at(11100); assert.equal(shown[3], 'sweep:point');
spread = true; on = false; at(11300); at(12200); assert.equal(shown[4], 'pinch:point');   // 見分けがつく前は答えを指ささず、寄り方を見せる
token.hidden = false; on = false; at(12400); at(13300); assert.equal(shown[5], 'sense');
token.hidden = true; step = 3; on = false; at(13500); at(14400); assert.equal(shown[6], 'move:grade0');
step = 4; on = false; at(14600); at(15500); assert.equal(shown[7], 'move:pad');
inked = true; on = false; at(15700); at(16600); assert.equal(shown[8], 'move:hanko');
stamped = true; on = false; at(16800); at(17700); assert.equal(shown[9], 'move:bagBig');
leaving = true; at(17900); assert.equal(demoPhase(), '');
// さす・ひきぬく は穀刺しの指（#poke）
leaving = false; stamped = false; inked = false; step = 0; at(18100); at(19000); assert.equal(poke.style.display, '');
T = 19100; handlers.pointerdown({pointerId:2}); P.inserted = true; T = 19500; handlers.pointerup({pointerId:2});
at(19600); assert.equal(demoPhase(), 'pull'); assert.equal(poke.style.display, 'none');
at(20500); assert.equal(poke.style.display, '');             // 指をのせたまま始まった所作は、離して0.8秒で出る（2秒待たせない）
// 手本の出し直しなしで2回やりとげた所作は、4秒待ってから出す。出なくなることはない
P.inserted = false; P.done = true; step = 1; measured = 0; demoDone.crank = 2; on = false;
at(30000); at(30900); const n = shown.length; assert.equal(shown[n - 1], 'circle:crank');
T = 31000; handlers.pointerdown({pointerId:3}); T = 31100; handlers.pointerup({pointerId:3});
at(33200); assert.equal(shown.length, n);
at(35200); assert.equal(shown.length, n + 1);
"""
        out = subprocess.run([node, "-e", script], capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stderr[-600:])

    def test_cycle140_no_demonstration_while_a_finger_is_down(self):
        # Codex指摘（PR #1076）: 指が触れている間は、どの道から呼ばれても手本を出さない。出ていたら見回りで消す
        self.assertIn("var demoDown = new Set();", HTML)
        self.assertLess(HTML.index("var demoDown = new Set();"), HTML.index("function guideAt(kind, el, gx, gy, at) {"))
        g = HTML[HTML.index("function guideAt(kind, el, gx, gy, at) {"):]
        self.assertLess(g.index("if (demoDown && demoDown.size) return;"), g.index("guideEl.dataset.arrow"))  # 何かを置く前に戻る
        self.assertIn("if (vis && demoDown.size) { demoHide(); return; }", HTML)
        self.assertNotIn("const demoDown = new Set()", HTML)
        # 手本が指している相手が動いた・消えたら、見回りが消して出し直す（Codex指摘 PR #1076・5回目。場合ごとではなく相手の場所で見る）
        self.assertIn("guideAnchor = el.getBoundingClientRect ? { el, x:r.left, y:r.top, w:r.width } : null;", HTML)
        self.assertIn("if (Math.hypot(q.left - guideAnchor.x, q.top - guideAnchor.y) > 12 || (guideAnchor.w && !q.width)) { demoHide(); demoAt = demoHard = now + 400; return; }", HTML)
        self.assertIn('if (shown) guideAt("press", shown.el);', HTML)
        # 手本を消したら相手も捨てる・相手を見るのは #guide が出ている時だけ（Codex指摘 PR #1076・6回目: 古い相手で穀刺しの手本がちらついた）
        off = HTML[HTML.index("function guideOff() {"):HTML.index("var demoDown = new Set();")]
        self.assertIn("guideAnchor = null;", off)
        self.assertIn('if (vis && guideAnchor && guideEl.classList.contains("on")) {', HTML)
        # 粒を取ったら（キーボードでも）手本を消して、残りの粒を選び直す（Codex指摘 PR #1076・4回目）
        tg = HTML[HTML.index("function tapGrain(g) {"):]
        self.assertLess(tg.index("g.gone = true; badLeft--;"), tg.index("demoHide(); demoAt = demoHard = performance.now() + DEMO_LOOK;"))
        self.assertLess(tg.index("demoHide(); demoAt = demoHard = performance.now() + DEMO_LOOK;"), tg.index("\n}\n"))
        # 押したまま窓の外で離したマウスを「触れている」に残さない（Codex指摘 PR #1076・3回目）
        self.assertIn('document.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" && !e.buttons && demoDown.has(e.pointerId)) demoUp(e); }, { capture:true, passive:true });', HTML)
        self.assertIn('window.addEventListener("blur", () => { if (demoDown.size) { demoDown.clear(); demoUp({ pointerId:-1 }); } });', HTML)

    def test_cycle140_crank_demo_reads_as_turning(self):
        # はかるの手本は、円に沿って回る指と、その後ろを同じ速さで回る尾。動きを減らす設定では止まった指と向きの矢印。
        self.assertIn('<div id="guide" aria-hidden="true">👆</div><div id="guideTrail" aria-hidden="true"></div>', HTML)
        self.assertIn("#guide.on.circle + #guideTrail { display:block; }", HTML)
        self.assertIn("@keyframes gSpin { from { rotate:90deg; } to { rotate:450deg; } }", HTML)
        self.assertIn("12.5% { translate:24px 24px; }", HTML)  # 8点で円に近づける
        self.assertIn("html.scrolled #guideTrail { visibility:hidden; }", HTML)
        reduce = HTML[HTML.index("@media (prefers-reduced-motion: reduce)"):HTML.index("</style>")]
        self.assertIn("#guide::after, #poke::after { display:block; }", reduce)
        self.assertIn("#guideTrail { animation:none; rotate:90deg; }", reduce)
        self.assertIn('<span id="poke" aria-hidden="true" data-arrow="←">👆</span>', HTML)
        # ふたゆびの手本は皿の左下。見ている粒を指で隠さない
        self.assertIn('if (kind === "pinch" && el === plate) r = { left:r.left + r.width * 0.26, top:r.top + r.height * 0.8, width:0, height:0 };', HTML)
        # 遊びを止める時計は置かない（setInterval は使わず、0.2秒ごとの見直しだけ）
        self.assertNotIn("setInterval", HTML)
        self.assertIn("(function demoLoop() { demoTick(); setTimeout(demoLoop, 200); })();", HTML)

    def test_cycle140_taps_on_the_stamped_bag_are_caught(self):
        # 最初の1分（差42）: 押印後の「流す」だけ空振りの受け皿がなく、目の前の大きな袋への
        # タップ・40pxに届かない短いなでは何回やっても無反応だった（他の所作は全て数える）。
        # 1回目=手本の指（証印に重ねない上24%・サイクル138）＋小さく滑る／2回目=半分流れて戻る／3回目=自分で流れる。
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        start = HTML.index("let swipeDemo = null;")
        fn = HTML[start:HTML.index("function leaveBag()", start)]
        script = """
const assert = require('node:assert/strict');
const NUDGE_LIMIT = 3, motion = 1;
let step = 4, stamped = true, leaving = false, swipeTaps = 0, leaves = 0, sounds = 0, cancels = 0; const anims = [], guides = [];
const bag = {animate(frames, opt) { anims.push([frames[1].transform, opt.duration]); return {cancel() { cancels++; }}; }};
const $ = id => ({bagBig: bag})[id];
const guideAt = (...a) => { guides.push(a); }, swipeDemoSound = () => { sounds++; }, leaveBag = () => { leaves++; };
""" + fn + """
swipeNudge();                                    // 1回目: 手本の指＋小さく滑る
assert.equal(guides.length, 1);
assert.equal(guides[0][0], 'move'); assert.equal(guides[0][2], 90); assert.equal(guides[0][4], 0.24);
assert.deepEqual(anims[0], ['translateX(18px) rotate(.6deg)', 320]);
swipeNudge();                                    // 2回目: 半分流れて戻る。前の手本は止める
assert.deepEqual(anims[1], ['translateX(45px) rotate(1.5deg)', 560]);
assert.equal(cancels, 1);
assert.equal(sounds, 2);
assert.equal(leaves, 0);
swipeNudge();                                    // 3回目: 自分で流れる。手本は残さない
assert.equal(leaves, 1);
assert.equal(cancels, 2);
assert.equal(anims.length, 2);
stamped = false; swipeNudge(); assert.equal(leaves, 1);   // 押す前は数えない
stamped = true; step = 0; swipeNudge(); assert.equal(leaves, 1);   // 別の段階では数えない
"""
        subprocess.run([node, "-e", script], capture_output=True, text=True, check=True)
        end = HTML[HTML.index("function endHanko() {"):HTML.index('$("bagBig").addEventListener("pointerup", endHanko);')]
        self.assertIn("swipeNudge();", end)  # 流れなかった指は空振りとして数える（朱肉・はんこと同じ共有ハンドラ）
        self.assertIn("swipeTaps = 0;", HTML[HTML.index("function stampNow()"):HTML.index("function dropHanko()")])  # 押した時から数え直す
        self.assertIn("swipeTaps = 0;", HTML[HTML.index("function startLot()"):HTML.index("/* 皿の粒:")])  # 袋ごとに仕切り直す
        down = HTML[HTML.index('$("bagBig").addEventListener("pointerdown",'):HTML.index('$("bagBig").addEventListener("pointermove",')]
        self.assertIn("stopSwipeDemo();", down)  # 指が触れたら手本の動きは止める
        self.assertIn("function swipeDemoSound()", HTML)  # 手本には固有の小さな音。実際に流れる bagSound は使わない
        nudge = HTML[HTML.index("function swipeNudge()"):HTML.index("function leaveBag()")]
        self.assertNotIn("bagSound", nudge)

    def test_cycle141_crank_demo_turns_the_handle_with_the_finger(self):
        # サイクル141（最初の1分・店主指示2026-11-10「お手本モーションを出す」）: はかるの手本は、指だけでなくハンドルも一緒に回す。
        # 旧版は指👆が握りの通り道を回るのに握りは止まったままで（390×844実測: 連続写真12枚で握りの向き0°のまま・#crankArm の動き0件）、
        # 指が握りを素通りして見えた。直した後は、握りが指の下について回る（実測: 指と握りの離れ 最大1.7px）
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        demo = HTML[HTML.index("var crankDemo = null;"):HTML.index("function guideOff() {")]
        script = """
const assert = require('node:assert/strict');
let reduced = false, crankDrag = null, crankAngle = 30, crankTurned = 0, made = [];
const style = () => ({ animationDelay:'' });
const arm = { style:{}, animate(frames, opt) { const a = { frames, opt, currentTime:0, cancelled:false, cancel() { this.cancelled = true; } }; made.push(a); return a; } };
const guideEl = { style:style() }, trail = { style:style() };
const $ = id => id === 'crankArm' ? arm : trail;
""" + demo + """
crankDemoOff(); // 出ていない時に消しても何も起きない
assert.equal(made.length, 0);
crankDemoOn();
assert.equal(made.length, 1);
assert.equal(made[0].frames[0].transform, 'rotate(30deg)'); // 握りは今の向きから回り始める（とばない）
assert.equal(made[0].frames[1].transform, 'rotate(390deg)'); // 右回りに1周
assert.equal(made[0].opt.duration, 1500); assert.equal(made[0].opt.iterations, Infinity); // 指の1周（gCircle 1.5秒）と同じ速さ
assert.equal(guideEl.style.animationDelay, '-1250ms'); // 指は握りの今の場所（向き30°＝右から300°先）から回り始める
assert.equal(trail.style.animationDelay, '-1250ms'); // 軌跡の尾も同じだけずらす
made[0].currentTime = 1500 + 375; // 1周と1/4 回った所で指が触れた
crankDemoOff();
assert.equal(made[0].cancelled, true);
assert.equal(crankAngle, 120); // 手本で回った向きのまま止まる（元の向きへ とんで戻らない）
assert.equal(arm.style.transform, 'rotate(120deg)');
assert.equal(guideEl.style.animationDelay, ''); assert.equal(trail.style.animationDelay, ''); // ほかの所作の手本には ずらしを残さない
assert.equal(crankTurned, 0); // 手本で回った分は、はかった数に足さない
crankAngle = 90; crankDemoOn(); assert.equal(guideEl.style.animationDelay, '0ms'); crankDemoOff();
crankAngle = -99; crankDemoOn(); assert.equal(guideEl.style.animationDelay, '-712.5ms'); crankDemoOff(); // 逆回しの後の負の向きでも合う
const n = made.length;
reduced = true; crankDemoOn(); assert.equal(made.length, n); // 動きを減らす設定では回さない
reduced = false; crankDrag = { id:1 }; crankDemoOn(); assert.equal(made.length, n); // 指で回している間は回さない
"""
        subprocess.run([node, "-e", script], capture_output=True, text=True, check=True)
        # 指の動き（gCircle）は 0% が右・1.5秒で右回り、という前提を固定する
        self.assertIn("#guide.circle { animation:gCircle 1.5s linear infinite; }", HTML)
        self.assertIn("@keyframes gCircle { 0% { translate:34px 0; } 12.5% { translate:24px 24px; }", HTML)
        # 手本を消す道は guideOff の1つだけ。そこで握りも止める
        off = HTML[HTML.index("function guideOff() {"):HTML.index("var demoDown = new Set();")]
        self.assertIn("crankDemoOff();", off)
        at = HTML[HTML.index("function guideAt(kind, el, gx, gy, at) {"):HTML.index("/* ぬく: 穀刺しを指で押し込み")]
        self.assertIn('if (kind === "circle" && el === $("crank")) crankDemoOn();', at)
        self.assertLess(at.index("crankDemoOn();"), at.index('guideEl.className = "on " + kind;'))  # ずらしを決めてから動きを付ける
        # 空振り1回目は手本の指と握りが一緒に回るので、60°の揺れは重ねない（音は従来どおり1回）
        end = HTML[HTML.index("function endCrank(e) {"):HTML.index('$("sceneMeter").addEventListener("pointerup", endCrank);')]
        self.assertLess(end.index("crankSound();"), end.index("if (crankDemo) return;"))
        self.assertLess(end.index("if (crankDemo) return;"), end.index('$("crankArm").animate('))

    def test_cycle141_demo_is_placed_where_the_sliding_scene_comes_to_rest(self):
        # サイクル141（最初の1分）: 上の場面は右26pxから0.22秒かけてすべり込む。旧版は はかる に着いた時、すべり込む途中のハンドルに
        # 手本を置き、見回りが「相手が動いた」と見て消し、0.4秒後に出し直していた（390×844実測: 413ms 手本なし・360×640: 400ms）。
        # すべり込みの分を引いた「落ち着く場所」に置き、見回りも同じ場所で比べる（直した後の実測: 着いてから手本が消える回数0）
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        self.assertIn("transform:translateX(26px); pointer-events:none; transition:opacity .22s ease, transform .22s ease;", HTML)  # 前提: 場面のすべり込み
        rest = HTML[HTML.index("function restRect(el) {"):HTML.index("var guideAnchor = null;")]
        script = """
const assert = require('node:assert/strict');
class DOMMatrixReadOnly { constructor(t) { const m = /matrix\\(([^)]+)\\)/.exec(t); this.m41 = m ? +m[1].split(',')[4] : 0; } }
let sceneTransform = 'matrix(1, 0, 0, 1, 26, 0)';
const getComputedStyle = () => ({ transform:sceneTransform });
const scene = {};
const crank = { getBoundingClientRect:() => ({ left:250 + new DOMMatrixReadOnly(sceneTransform).m41, top:123, width:128, height:128 }), closest:sel => sel === '.topScene' ? scene : null };
""" + rest + """
assert.deepEqual(restRect(crank), { left:250, top:123, width:128, height:128 }); // すべり込みの始め（26px 右）でも、落ち着く場所
sceneTransform = 'matrix(1, 0, 0, 1, 11.5, 0)';
assert.equal(restRect(crank).left, 250); // 途中でも同じ場所（見回りが「動いた」と見ない）
sceneTransform = 'none';
assert.equal(restRect(crank).left, 250); // 落ち着いた後
const hanko = { getBoundingClientRect:() => ({ left:40, top:300, width:60, height:80 }), closest:() => null };
assert.deepEqual(restRect(hanko), { left:40, top:300, width:60, height:80 }); // 上の場面の外の相手は、そのまま
"""
        subprocess.run([node, "-e", script], capture_output=True, text=True, check=True)
        at = HTML[HTML.index("function guideAt(kind, el, gx, gy, at) {"):HTML.index("/* ぬく: 穀刺しを指で押し込み")]
        self.assertIn("let r = el.getBoundingClientRect ? restRect(el) :", at)  # 置く時
        tick = HTML[HTML.index("function demoTick(syncOnly) {"):HTML.index('document.addEventListener("pointerdown", (e) => {\n  demoTick(true);')]
        self.assertIn("const q = restRect(guideAnchor.el);", tick)  # 見回りで比べる時
        self.assertNotIn("guideAnchor.el.getBoundingClientRect()", tick)

    def test_cycle142_demonstration_comes_back_right_after_the_finger_lifts(self):
        # サイクル142（最初の1分・店主の実機の声2026-11-10「お手本をすぐに出す」）: 旧版は指を離してから2秒（指をのせたまま所作が変わった時は0.8秒）
        # 手本が無かった（390×844・390×664実測: 進まなかった指24とおりのうち13とおりで 2030〜2200ms。動きが続くのは長くても1146ms。
        # 手本をまねる60秒で、指は離れているのに手本が無い時間が合計13.6〜14.7秒）。
        # 離して0.3秒で出す。動きの途中には重ねず、終わってから出す。待たせる上限は旧版と同じ。つまむ と 慣れた人の4秒は変えない。
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        start = HTML.index("const DEMO_FIRST = 800,")
        fn = HTML[start:HTML.index("(function demoLoop()", start)]
        script = """
const assert = require('node:assert/strict');
let T = 0; const performance = {now: () => T};
let simOn = false; const timers = []; const setTimeout = (f, ms) => { timers.push([f, ms]); };
let step = 1, measured = 0, badLeft = 2, spread = false, leaving = false, stamped = false, inked = false, lotIndex = 0, everZoomed = false, isNear = false, hankoMax = 80;
const finePointer = false, LOT = {moisture:[1, 2, 3]}, P = {done:false, auto:false, inserted:false}, token = {hidden:true}, grains = [], zoomBtn = {}, Z = {s:1, tx:0, ty:0};
const plate = {getBoundingClientRect: () => ({left:0, top:0, right:300, bottom:300}), clientLeft:0, clientTop:0};
const shown = []; let on = false, anims = [];
const guideEl = {classList:{contains: () => on}};
const poke = {style:{display:'none'}};
const $ = id => id === 'poke' ? poke : {id};
const guideOff = () => { on = false; }, guideAt = (kind, el) => { on = true; shown.push(kind + ':' + (el.id || 'point')); };
const guideSense = () => { on = true; shown.push('sense'); }, pullPoke = () => {}, stabPoke = () => {}, syncPokeToAttract = () => {}, firstBagFace = () => false, lotGrade = () => 0;
const handlers = {};
const document = {documentElement:{classList:{contains: () => false}}, addEventListener: (n, f) => { handlers[n] = f; }, querySelectorAll: () => [{id:'grade0'}], getAnimations: () => anims};
const window = {addEventListener: () => {}};
var demoDown = new Set();
var guideAnchor = null;
const moving = (end) => ({playState:'running', effect:{getComputedTiming: () => ({endTime:end})}});
""" + fn + """
const at = (t) => { T = t; demoTick(); };
const touch = (t0, t1) => { T = t0; handlers.pointerdown({pointerId:1}); T = t1; handlers.pointerup({pointerId:1}); };
at(0); at(900); assert.deepEqual(shown, ['circle:crank']);
// 1) 回しかけて離す（動いているものは無い）: 0.3秒で戻る。旧版は2秒
touch(1000, 1300);
assert.equal(on, false);
assert.deepEqual(timers[timers.length - 1][1], 320);            // 0.2秒ごとの見回りを待たず、時間になったら見る
at(1500); assert.equal(shown.length, 1);                        // 0.2秒ではまだ
at(1620); assert.equal(shown.length, 2);                        // 0.32秒で出ている
// 2) 動きの途中（道具が半分やって見せている・粒が運ばれている）には重ねない。終わったら出す
touch(2000, 2100); anims = [moving(640)];
at(2500); at(2700); assert.equal(shown.length, 2);
anims = []; at(2760); assert.equal(shown.length, 3);
// 3) 終わりのない動き（回り続ける手本・ゆれ続ける はんこ）は「動きの途中」に数えない
touch(3000, 3100); anims = [moving(Infinity), {playState:'finished', effect:{getComputedTiming: () => ({endTime:300})}}];
at(3420); assert.equal(shown.length, 4);
// 4) 粒の押し合い・ひとりでにぬける穀刺し の間も重ねない
anims = []; touch(4000, 4100); simOn = true; at(4500); assert.equal(shown.length, 4);
simOn = false; P.auto = true; at(4700); assert.equal(shown.length, 4);
P.auto = false; at(4720); assert.equal(shown.length, 5);
// 5) 動きが続いていても、旧版と同じ2秒では出す（旧版より遅くならない）
touch(5000, 5100); anims = [moving(9000)];
at(7000); assert.equal(shown.length, 5);
at(7100); assert.equal(shown.length, 6);
// 6) 動きが見られない端末は、旧版と同じ2秒
anims = []; touch(8000, 8100); const ga = document.getAnimations; document.getAnimations = undefined;
at(9900); assert.equal(shown.length, 6);
at(10100); assert.equal(shown.length, 7);
document.getAnimations = ga;
// 7) 指をのせたまま所作が変わった時（朱肉→はんこ など）も、離して0.3秒。見回りの合間に変わって離しても同じ（旧版は0.8秒）
step = 4; on = false; at(11000); at(11900); assert.equal(shown[7], 'move:pad');
T = 12000; handlers.pointerdown({pointerId:1}); inked = true; T = 12100; handlers.pointerup({pointerId:1});   // 見回りを はさまずに離す
assert.equal(demoPhase(), 'stamp');
at(12300); assert.equal(shown.length, 8);
at(12420); assert.equal(shown[8], 'move:hanko');
//    その時も動きの途中には重ねず、上限は旧版の0.8秒
T = 13000; handlers.pointerdown({pointerId:1}); stamped = true; T = 13100; handlers.pointerup({pointerId:1}); anims = [moving(470)];
at(13500); assert.equal(shown.length, 9);
at(13900); assert.equal(shown[9], 'move:bagBig');
anims = [];
// 8) つまむ は旧版のまま（手本が わるい粒を指すので、探す間を残す）: はじめ0.8秒・離して2秒
stamped = false; inked = false; step = 2; spread = true; on = false; at(15000); at(15900); assert.equal(shown[10], 'pinch:point');
touch(16000, 16100);
at(18000); assert.equal(shown.length, 11);
at(18100); assert.equal(shown.length, 12);
// 9) 慣れた人（出し直しなしで2回やりとげた所作）の4秒も変えない
step = 1; spread = false; demoDone.crank = 2; on = false; at(20000); at(20900); assert.equal(shown[12], 'circle:crank');
touch(21000, 21100);
at(25000); assert.equal(shown.length, 13);
at(25100); assert.equal(shown.length, 14);
// 触れている間は出ない（変えていない）
T = 26000; handlers.pointerdown({pointerId:1}); at(30000); assert.equal(on, false); assert.equal(shown.length, 14);
"""
        out = subprocess.run([node, "-e", script], capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stderr[-900:])
        tg = HTML[HTML.index("function tapGrain(g) {"):]
        self.assertIn("demoHide(); demoAt = demoHard = performance.now() + DEMO_LOOK;", tg[:tg.index("\n}\n")])  # 粒を取った後も、つまむの手本は2秒のまま

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
