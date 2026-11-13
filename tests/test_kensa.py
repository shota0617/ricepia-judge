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
        # サイクル150: 出てすぐの指・ボタンが出る前から下りていた指では流さない（下の test_cycle150_next_button_...）。指を離した時に流すのは同じ
        self.assertIn('nextBtn.addEventListener("pointerup", (e) => {', HTML)
        self.assertIn("if (d.early) swipeNudge(); else leaveBag();", HTML)
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
        # サイクル152: 読みこみの 時の 見立てから 始め、さいごに 押した ものが 指か どうかで 変わる（let）
        self.assertIn('let finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;', HTML)
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
        # サイクル150: 追う指を入れかえる決まり（restingTakeover）も 本物を読みこむ
        takeover = "const meterPts = new Map(), pageFinger = () => false, inContact = (e) => e.buttons > 0 || e.pointerType !== 'mouse' && e.pointerType !== 'pen';\n" + HTML[HTML.index("function restingTakeover("):HTML.index('$("sceneBag").addEventListener("pointerdown",')]
        script = RULES + takeover + """
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
        # サイクル151 で 変えた: 動きを へらす 設定でも 押す長さの しきいは 同じ（旧版は INK_MS * motion = 37.5ms で、110ms の タップで 付いた）
        self.assertNotIn("INK_MS * motion", HTML)
        self.assertIn("inkToHanko(y); }, INK_MS);", HTML)

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
        # サイクル151 で 変えた: 動きを へらす 設定でも にぎる 長さの しきいは 同じ（旧版は NIGIRU_MS * motion = 52.5ms）
        self.assertNotIn("NIGIRU_MS * motion", HTML)
        self.assertIn("senseDone(); } }, NIGIRU_MS);", HTML)

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
        # 空振りの受け止め統一（設計・サイクル81）: どの所作も空振り1回目で
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
        # 空振りの受け止め統一（設計・サイクル84）: 2回目では道具が半分やって見せる。
        # 従来は2回目も1回目と同じ小さな揺れ（ぬく18px）か無反応（はこぶ・おろし）で、
        # 3回目の自動代替まで「半分」の段階がなかった。状態は進めない（アニメーションのみ）
        self.assertIn("if (bagTaps === 2)", HTML)  # ぬく: さす所までの半分
        self.assertIn("const halfX = P.x - (P.x - P.inAt) / 2;", HTML)
        self.assertIn("else if (senseTaps === 2)", HTML)  # はこぶ: 顔までの半分
        self.assertIn("if (senseTaps === 2) { token.classList.add(\"squeeze\");", HTML)  # にぎる: にぎる形を短く見せる
        self.assertIn("if (hankoTaps === 2)", HTML)  # おす・おろし: 押せる所までの半分
        self.assertIn('"translateY(" + hankoLand / 2 + "px)"', HTML)

    def test_opening_attract_moves_probe_before_touch(self):
        # 開いた瞬間の誘い（設計の足すもの1・サイクル82）: 最初の袋だけ、
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
        # サイクル151: 320ms は 到着の音と 分けて 聞かせる 間なので、動きを へらす 設定でも 縮めない（READ_MS.chip。旧版は 48ms で 到着音と 重なった）
        self.assertIn("cookedSound(); }, READ_MS.chip)", start_lot)
        self.assertIn("chip:320", HTML[HTML.index("const READ_MS"):HTML.index("});", HTML.index("const READ_MS"))])
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
        self.assertEqual(HTML.count("gradeDemoSound"), 3)  # 定義1＋呼び出し2（ボタンの空振り1回目／サイクル148: ボタンの外をさわった時の同じ手本 gradeNudge）
        nudge = HTML[HTML.index("function gradeNudge() {"):HTML.index('document.querySelectorAll(".gradeBtn").forEach(btn => {')]
        self.assertEqual(nudge.count("gradeDemoSound();"), 1)
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
        # サイクル151: 320ms は READ_MS.chip（動きを へらす 設定でも 同じ）
        self.assertIn("}, READ_MS.chip); } /* 炊き上がりチップの見た目も", start_lot)
        self.assertIn("cookedSound(); }, READ_MS.chip)", start_lot)
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
const firstBagFace = () => false;   // サイクル154: 顔つきの 粒の 当たりの 大きさ（ここでは 顔なし）
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

    def test_cycle149_first_bag_bad_grain_faces_gently_appear(self):
        # 差45: 最初の袋でなでて広げた時にわるい粒（2粒）に顔が出て1.5倍になる瞬間だけが、
        # src の差し替えと transform の即切り替えで完成形が即座に出ていた
        # （390×844実測: 旧版は顔が出た瞬間のアニメーション0件・わるい粒2粒とも）。
        # 他の現れるものと同じ260msのふわりとした出現を、顔が新しく出た時だけ1回付ける。
        start = HTML.index("function refreshBadFaces()")
        body = HTML[start:HTML.index("let zoomAnimTimer", start)]
        # 顔が新しく出た時だけ（すでに scale(1.5) の粒には付けない）
        self.assertIn('const faceNew = firstBagFace(g) && g.img.style.transform !== "scale(1.5)";', body)
        self.assertIn('if (faceNew && g.img.animate) g.img.animate([{ transform:"scale(1)" }, { transform:"scale(1.575)", offset:.7 }, { transform:"scale(1.5)" }], { duration:260 * motion, easing:"ease-out" });', body)
        # 最終の大きさ・顔の出し方・重なり順は従来どおり
        self.assertIn('g.img.style.transform = firstBagFace(g) ? "scale(1.5)" : "";', body)
        self.assertIn("g.img.src = grainSprite(g.kind, grainMood(g));", body)
        self.assertEqual(HTML.count("scale(1.575)"), 1)

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
        self.assertIn("if (d.far || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) return;", fn)
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
// とちゅうで大きく動かして 元の所へ戻して離した指も数えない（なぞって戻すだけで ひとりでに進まないように）
const back = () => { on.pointerdown.forEach(f => f({pointerId:1, clientX:10, clientY:20, target:t})); on.pointermove.forEach(f => f({pointerId:1, clientX:90, clientY:20})); on.pointerup.forEach(f => f({pointerId:1, clientX:10, clientY:20, target:t})); };
back(); assert.deepEqual(calls, ['bag', 'crank']);
// ほかの指の動きでは 数えない指に ならない
on.pointerdown.forEach(f => f({pointerId:1, clientX:10, clientY:20, target:t})); on.pointermove.forEach(f => f({pointerId:2, clientX:90, clientY:20})); on.pointerup.forEach(f => f({pointerId:1, clientX:10, clientY:20, target:t}));
assert.deepEqual(calls, ['bag', 'crank', 'crank']);
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
const demoDown = new Set(), token = {hidden:true}, late = []; let badLeft = 0, leaving = true;
const gradeNudge = () => { late.push('grade'); };
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
// みわける より後は ぬく・はかるの数え方へは渡さない（サイクル148: その所作の空振りへ渡す。下の test_cycle148_...）
for (const s of [2, 3, 4]) { step = s; touch(['#app'], 20 + s); }
assert.equal(calls.length, 2);
assert.deepEqual(late, ['grade']);
"""
        subprocess.run([node, "-e", script], capture_output=True, text=True, check=True)
        # 空振りの数え方は場面の中と同じ道（別の数え方を足さない）
        self.assertNotIn("bagTaps", fn)
        self.assertNotIn("meterTaps", fn)
        # 始まりの順（サイクル146）は変えない
        self.assertIn('armIdle();\nstartLot();\n$("app").classList.remove("boot");', HTML)

    def test_cycle148_touches_outside_the_target_count_as_misses_in_later_steps(self):
        # 最初の1分（まちがった所をさわる人）: みわける より後の所作では、案内文・顔・見出し・表の ● の列・ふくろの横を
        # さわっても、手本の指が0.3秒消えて戻るだけだった（390×844・320×568実測: 7つの所作 × 5か所 × 5回タップで、
        # 音か道具の動きが あったのは どちらも 35とおり中6 → 直した後 35とおり中35。案内文だけをタップする人は
        # 「なでて ひろげる」で止まって60秒 進まなかった → 証印まで 33〜34秒）。その所作の中の空振りと同じ道へ そのまま渡す。
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        start = HTML.index("let offDown = null;")
        fn = HTML[start:HTML.index("armIdle();\nstartLot();", start)]
        script = """
const assert = require('node:assert/strict');
let step = 2, measured = 0, crankDrag = null; const calls = [];
const P = {x:200, done:false, auto:false, drag:null}, LOT = {moisture:[1, 2, 3]};
const endBagDrag = () => { calls.push('bag'); }, endCrank = () => { calls.push('crank'); };
const demoDown = new Set(), token = {hidden:true};
let badLeft = 2, spread = false, senseKind = 'niou', senseDrag = null, senseHold = null;
let leaving = false, stamped = false, inked = false, inkHold = null, inkDrag = null, hankoDrag = null;
const knockPlate = () => { calls.push('knock'); }, nudgeSpread = () => { calls.push('spread'); }, knockSound = () => { calls.push('sound'); };
const mk = (gone) => ({gone, img:{offsetWidth:0, classList:{remove() {}, add(c) { calls.push('wig'); }}}});
const grains = [mk(false), mk(true)];
const endToken = () => { calls.push(['token', !!senseDrag, !!senseHold]); senseDrag = senseHold = null; };
const gradeNudge = () => { calls.push('grade'); }, swipeNudge = () => { calls.push('swipe'); }, stopBob = () => { calls.push('stopBob'); };
const endHanko = () => { calls.push(['hanko', !!inkHold, !!hankoDrag && hankoDrag.moved === false]); inkHold = hankoDrag = null; };
const on = {};
const document = {addEventListener(type, fn) { (on[type] = on[type] || []).push(fn); }};
""" + fn + """
const el = (hit) => ({closest(sel) { return sel.split(', ').some(x => hit.includes(x)) ? {} : null; }});
const touch = (hit, dx) => {
  const t = el(hit);
  on.pointerdown.forEach(f => f({pointerId:1, clientX:10, clientY:20, target:t}));
  on.pointerup.forEach(f => f({pointerId:1, clientX:10 + (dx || 0), clientY:20, target:t}));
  return calls.splice(0);
};
const out = ['#app'];
// なでて ひろげる: 皿の外（案内文・顔）は、音・のこっている粒のゆれ・広げる空振り（nudgeSpread: 2回目に山がほどける）。
// 皿をたたく動き（knockPlate: 粒が動いて1回で広がる）は使わない。皿の中は皿が受ける
assert.deepEqual(touch(out), ['sound', 'wig', 'spread']);
assert.deepEqual(touch(['#app', '#plate']), []);
// つまむ: トンの音と 粒のゆれだけ（粒は取らない・広げる空振りは数えない）。
// サイクル150: 皿をたたく動き（knockPlate）は呼ばない（呼ぶと タップのたびに 粒が 7px ずつ外へ逃げた）
spread = true; assert.deepEqual(touch(out), ['sound', 'wig']);
// 8pxより大きく動いた指・📖・終了カード・つぎの袋・資料（#app の外）は数えない
assert.deepEqual(touch(out, 9), []);
assert.deepEqual(touch(out, 8), ['sound', 'wig']);
for (const x of ['#notesLink', '#idleCard', '#nextBtn']) assert.deepEqual(touch(['#app', x]), []);
assert.deepEqual(touch([]), []);
// ほかの指が まだ画面にある間（ふたゆびのズームなど）は数えない
demoDown.add(7); assert.deepEqual(touch(out), []); demoDown.clear();
// 取り消された指は数えない
on.pointerdown.forEach(f => f({pointerId:1, clientX:10, clientY:20, target:el(out)}));
on.pointercancel.forEach(f => f({pointerId:1}));
on.pointerup.forEach(f => f({pointerId:1, clientX:10, clientY:20, target:el(out)}));
assert.deepEqual(calls, []);
// ぜんぶ取った後の待ちの間は数えない
badLeft = 0; assert.deepEqual(touch(out), []); badLeft = 2;
// はこぶ: 下の案内文は 🤲の空振りへ。顔・皿（#stage・#head）はサイクル139の道が受けるので、ここでは数えない（2回数えない）
token.hidden = false;
assert.deepEqual(touch(out), [['token', true, false]]);
assert.deepEqual(touch(['#app', '#stage']), []);
assert.deepEqual(touch(['#app', '#head']), []);
senseKind = 'nigiru'; assert.deepEqual(touch(out), [['token', false, true]]);
senseHold = {}; on.pointerdown.forEach(f => f({pointerId:1, clientX:10, clientY:20, target:el(out)})); on.pointerup.forEach(f => f({pointerId:1, clientX:10, clientY:20, target:el(out)}));
assert.deepEqual(calls, []); senseHold = null;
token.hidden = true;
// きめる: 等級のボタンの外は 手本の空振りへ。ボタンはボタンが受ける
step = 3;
assert.deepEqual(touch(out), ['grade']);
assert.deepEqual(touch(['#app', '.gradeBtn']), []);
// おす: 朱肉の前=朱肉の空振り／朱肉の後=はんこの空振り（動かしていない指として）／押した後=流す空振り。ふくろの中は ふくろが受ける
step = 4;
assert.deepEqual(touch(out), ['stopBob', ['hanko', true, false]]);
inked = true; assert.deepEqual(touch(out), ['stopBob', ['hanko', false, true]]);
assert.deepEqual(touch(['#app', '#bagBig']), []);
hankoDrag = {cy:0, moved:true}; assert.deepEqual(touch(out), []); hankoDrag = null;
stamped = true; assert.deepEqual(touch(out), ['swipe']);
leaving = true; assert.deepEqual(touch(out), []);
// ぬく・はかるの数え方へは まざらない
assert.equal(calls.includes('bag') || calls.includes('crank'), false);
"""
        r = subprocess.run([node, "-e", script], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        # 別の数え方は足さない（その所作の中の空振りと同じ道だけ）
        for name in ("spreadTaps", "hankoTaps", "swipeTaps", "senseTaps", "bagTaps", "meterTaps"):
            self.assertNotIn(name, fn)
        # 等級は ひとりでに えらばない
        self.assertNotIn("pickGrade", fn)
        # 運営者が まだ決めていない所は変えない（終了カードの45秒・手本を出し直す早さ・3回目に進む）
        self.assertIn("const IDLE_MS = 45000, pageStart = Date.now();", HTML)
        self.assertIn("const DEMO_FIRST = 800, DEMO_BACK = 300, DEMO_HOLD = 2000, DEMO_LOOK = 2000, DEMO_BACK_SLOW = 4000;", HTML)
        self.assertIn("const NUDGE_LIMIT = 3;", HTML)

    def test_cycle148_grade_nudge_shows_the_right_button_without_picking(self):
        # きめるで 等級のボタンの外（案内文「● の下を 上へ」・表の ●・顔）をさわった人には、
        # 手本の指が指している 正しい等級のボタンが小さく上がり、その列の ● が光る。等級は えらばず、場面も進めない。
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        start = HTML.index("function gradeNudge() {")
        fn = HTML[start:HTML.index('document.querySelectorAll(".gradeBtn").forEach(btn => {', start)]
        script = """
const assert = require('node:assert/strict');
const motion = 1, LOT = {}; let step = 3, sounds = 0; const guides = [], anims = [], pings = [];
const lotGrade = () => 1;
const btns = [0, 1, 2, 3].map(i => ({i, animate(frames, opt) { anims.push([i, frames[1].transform, opt.duration]); }}));
const dot = {offsetWidth:0, classList:{remove(c) { pings.push('-' + c); }, add(c) { pings.push('+' + c); }}};
const document = {querySelectorAll(sel) { assert.equal(sel, '.gradeBtn'); return btns; }};
const $ = id => ({rows:{querySelectorAll(sel) { assert.equal(sel, '.dot[data-g="1"]'); return [dot]; }}})[id];
const gradeDemoSound = () => { sounds++; };
const guideAt = (kind, el, gx, gy) => { guides.push([kind, el.i, gx, gy]); };
""" + fn + """
gradeNudge();
assert.equal(sounds, 1);
assert.deepEqual(guides, [['move', 1, 0, -48]]);
assert.deepEqual(anims, [[1, 'translateY(-12px)', 260]]);
assert.deepEqual(pings, ['-ping', '+ping']);
assert.equal(step, 3);
step = 4; gradeNudge(); assert.equal(sounds, 1);   // きめる の外では何もしない
"""
        r = subprocess.run([node, "-e", script], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertNotIn("pickGrade", fn)
        self.assertNotIn("toOsu", fn)

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
const pageFinger = () => false, pageSlid = () => false;   // サイクル150: 説明を読んでいない時（ページは上）
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
let step = 1, measured = 0, badLeft = 2, spread = false, leaving = false, stamped = false, inked = false, lotIndex = 4, everZoomed = false, pickedBare = false, isNear = false, hankoMax = 80;   // pickedBare: サイクル153（寄らずに つまめた 人）
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
let step = 1, measured = 0, badLeft = 2, spread = false, leaving = false, stamped = false, inked = false, lotIndex = 0, everZoomed = false, pickedBare = false, isNear = false, hankoMax = 80;   // pickedBare: サイクル153（寄らずに つまめた 人）
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

    def test_cycle150_hanko_can_be_lowered_on_short_screens(self):
        # サイクル150（最初の1分・横向きのスマホ）: 背の低い画面でも、はんこを なぞって押せる。
        # 旧版は 568×320 で おろせる長さ（hankoMax）12px・押したことにする長さ（hankoLand）24px（667×331 は 17px・844×340 は 19.5px・320×480 は 10.5px）。
        # はんこは hankoMax までしか下がらないので、どれだけ なぞっても押せず、空振り3回を待つだけだった（568×320 実測: 3回・2.9秒 → 直した後 1回・1.0秒）
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        layout = HTML[HTML.index("const HANKO_DROP_MIN = 40;"):HTML.index("function toOsu() {")]
        script = """
const assert = require('node:assert/strict');
let hankoMax = 0, hankoLand = 0;
// 袋の高さ H から、CSS と同じ置き方（はんこ=上から30%・背86px／証印=幅40%の円・まん中が上から69%）を作る
function world(H) {
  const W = H * 0.8, size = W * 0.4;
  const hk = { offsetHeight:86, style:{ top:'' }, get offsetTop() { return this.style.top ? parseFloat(this.style.top) : H * 0.3; } };
  return { hanko:hk, mark:{ offsetTop:H * 0.69 - size / 2, offsetHeight:size }, pad:{ style:{} } };
}
let w = null;
const $ = id => w[id];
""" + layout + """
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.01, a + ' != ' + b);
// 568×320（袋の高さ226px）: 旧版は hankoMax 12px < hankoLand 24px
const OLD226 = 226 * 0.69 - (226 * 0.3 + 86) + 10; near(OLD226, 12.14);
w = world(226); layoutStamp();
near(hankoMax, 40); // おろせる長さは 40px（なぞって押せていた 844×390 と同じ）
assert.ok(hankoLand <= hankoMax); assert.equal(hankoLand, 24); // なぞれば押せる
near(parseFloat(w.hanko.style.top), 226 * 0.3 - (40 - OLD226)); // 足りない分だけ はんこを上へ置く
near(parseFloat(w.pad.style.top), w.hanko.offsetTop + 86 + 2); // 朱肉は はんこの すぐ下のまま
layoutStamp(); near(hankoMax, 40); near(parseFloat(w.hanko.style.top), 226 * 0.3 - (40 - OLD226)); // 測り直しても、上げた分を二重に引かない
// 667×331（237px）・844×340（246px）・320×480（222px）も同じ
for (const H of [237, 246, 222, 186]) { w = world(H); layoutStamp(); near(hankoMax, 40); assert.ok(hankoLand <= hankoMax, 'H=' + H); assert.ok(w.hanko.offsetTop >= 0); }
// 高い画面（390×844・袋の高さ440px）は何も変わらない
w = world(440); layoutStamp();
assert.equal(w.hanko.style.top, ''); near(hankoMax, 440 * 0.69 - 218 + 10); near(hankoLand, 440 * 0.69 - 70.4 - 218 + 35.2);
// ごく低い画面（袋の高さ120px）: はんこは袋の上のふちまで。押したことにする長さを おろせる長さに合わせる
w = world(120); layoutStamp();
assert.equal(parseFloat(w.hanko.style.top), 0);
assert.ok(hankoMax < 24 && hankoMax > 0); assert.equal(hankoLand, Math.max(6, hankoMax));
// 低い画面から高い画面へ回した時は、上げた分を戻す
w = world(226); layoutStamp(); const hk = w.hanko; w = Object.assign(world(440), { hanko:Object.assign(world(440).hanko, { style:hk.style }) }); layoutStamp();
assert.equal(w.hanko.style.top, '');
"""
        r = subprocess.run([node, "-e", script], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr[-900:])
        # はんこは hankoMax までしか下がらない・hankoLand で押す、という前提を固定する
        move = HTML[HTML.index('$("bagBig").addEventListener("pointermove"'):]
        self.assertIn("const y = Math.max(0, Math.min(hankoMax, dy));", move)
        self.assertIn("if (y >= hankoLand) stampNow();", move)

    def test_cycle150_token_carried_past_halfway_reaches_the_face(self):
        # サイクル150（最初の1分・大きい画面と横向き）: 🤲 を 顔までの半分より先へ運んで離したら、そのまま顔へ届く。
        # 旧版は 顔に触れる所（顔までの 79〜86%。390×844 で 404px・430×932 で 462px・768×1024 で 531px）まで運ばないと元へ戻って空振りになり、
        # 手本の7割5分の長さで まねる指は どの画面でも3回とも届かなかった（3回・3.9〜4.2秒 → 直した後 1回・1.2〜2.1秒）
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        body = HTML[HTML.index("function tokenNearFace() {"):HTML.index('token.addEventListener("pointerup", endToken);')]
        self.assertIn("const SENSE_CARRY = 0.5;", body)
        script = """
const assert = require('node:assert/strict');
const NUDGE_LIMIT = 3, NIGIRU_MS = 350, motion = 1;
let pageScrolled = false; const pageFinger = (dx, dy) => pageScrolled && Math.abs(dy) >= Math.abs(dx); const slid = new Set(), pageSlid = (e) => !!e && slid.has(e.pointerId);
let senseKind = 'niou', senseDrag = null, senseHold = null, senseTaps = 0;
let off = { x:0, y:0 }, anims = [], guides = 0, guideOffs = 0, done = 0;
const handlers = {};
const token = { hidden:false, classList:{ add() {}, remove() {} }, addEventListener(t, f) { handlers[t] = f; },
  getBoundingClientRect() { return { left:167 + off.x, top:511 + off.y, width:96, height:96 }; },
  animate(frames, opt) { const a = { frames, opt }; anims.push(a); return a; } };
const face = { getBoundingClientRect() { return { left:12, top:9, width:60, height:60 }; } };
const $ = () => face, hint = {};
function placeToken(x, y) { off = { x, y }; }
function capture() {}
function guideOff() { guideOffs++; }
function guideSense() { guides++; }
function senseDone() { done++; token.hidden = true; senseDrag = null; senseHold = null; senseFly = false; }
""" + body + """
const DX = 42 - 215, DY = 39 - 559; // 🤲 のまん中（215, 559）から 顔のまん中（42, 39）まで（430×932 の実測と同じ置き方）
function drag(k, type) { // 顔までの k 倍を運んで離す
  handlers.pointerdown({ pointerId:1, clientX:215, clientY:559 });
  for (let i = 1; i <= 10; i++) handlers.pointermove({ pointerId:1, clientX:215 + DX * k * i / 10, clientY:559 + DY * k * i / 10 });
  endToken({ type:type || 'pointerup' });
}
function fresh() { senseDrag = senseHold = null; senseTaps = 0; senseFly = false; off = { x:0, y:0 }; anims = []; guides = 0; done = 0; token.hidden = false; }
// 4割で離す: 今までどおり元へ戻って、空振り1回目（手本の指）
fresh(); drag(0.4);
assert.deepEqual(off, { x:0, y:0 }); assert.equal(senseTaps, 1); assert.equal(guides, 1); assert.equal(anims.length, 0);
// 6割で離す（旧版は空振り）: 離した所から顔へ とぶ。空振りには数えない
fresh(); drag(0.6);
assert.equal(senseTaps, 0); assert.equal(guides, 0); assert.equal(senseFly, true); assert.equal(anims.length, 1);
assert.equal(anims[0].frames[0].transform, 'translate(' + DX * 0.6 + 'px,' + DY * 0.6 + 'px)'); // 指を離した所から（元の場所へ とばない）
assert.equal(anims[0].frames[1].transform, 'translate(' + DX + 'px,' + DY + 'px)'); // 顔のまん中まで
assert.equal(anims[0].opt.duration, 220);
// とんでいる間の指（🤲 に触れる・外をタップ）は数えない・動きを重ねない
handlers.pointerdown({ pointerId:2, clientX:215, clientY:559 }); assert.equal(senseDrag, null);
senseDrag = { x:10, y:10, moved:false }; endToken({ type:'pointerup' });
assert.equal(senseTaps, 0); assert.equal(guides, 0); assert.equal(anims.length, 1); assert.equal(senseDrag, null);
anims[0].onfinish(); assert.equal(done, 1); assert.equal(senseFly, false); // 着いたら いつもの「届いた」へ
// ちょうど半分でも届く・半分の少し手前は届かない
fresh(); drag(0.5); assert.equal(anims.length, 1); assert.equal(senseTaps, 0);
fresh(); drag(0.48); assert.equal(anims.length, 0); assert.equal(senseTaps, 1);
// 顔と反対へ運んだ指・動かさない指（タップ）は空振り
fresh(); drag(-0.6); assert.equal(anims.length, 0); assert.equal(senseTaps, 1);
fresh(); handlers.pointerdown({ pointerId:1, clientX:215, clientY:559 }); endToken({ type:'pointerup' }); assert.equal(anims.length, 0); assert.equal(senseTaps, 1);
// 取り消された指（pointercancel）は とばさず、元の場所へ戻す
fresh(); drag(0.7, 'pointercancel'); assert.equal(anims.length, 0); assert.deepEqual(off, { x:0, y:0 }); assert.equal(senseFly, false);
assert.equal(senseTaps, 0); assert.equal(guides, 0); // 取り消された指は 空振りにも数えない（説明を読んでいる間に ページを動かし始めた指 など）
// ページを動かす指（説明を読んでいる間の たての指）では 🤲 を運ばない。離しても（pointerup）数えない・とばさない（Codex指摘）
fresh(); pageScrolled = true; slid.add(1); handlers.pointerdown({ pointerId:1, clientX:215, clientY:559 });
for (let i = 1; i <= 10; i++) handlers.pointermove({ pointerId:1, clientX:215 + DX * 0.9 * i / 10, clientY:559 + DY * 0.9 * i / 10 });
assert.equal(done, 0); assert.deepEqual(off, { x:0, y:0 });
endToken({ type:'pointerup', pointerId:1 }); assert.equal(senseTaps, 0); assert.equal(anims.length, 0); assert.equal(senseFly, false);
pageScrolled = false; slid.clear();
// 空振り3回目に ひとりでに運ばれる動きは、元の場所から・0.36秒のまま
fresh(); drag(0.2); drag(0.2); drag(0.2);
assert.equal(anims.length, 2); // 2回目の「半分やって見せる」と、3回目の ひとりでに運ばれる動き
assert.equal(anims[1].frames[0].transform, 'none'); assert.equal(anims[1].opt.duration, 360);
assert.equal(anims[1].frames[1].transform, 'translate(' + DX + 'px,' + DY + 'px)'); assert.equal(senseFly, false);
// 顔に触れる所まで運べば、離す前に届く（従来どおり）
fresh(); handlers.pointerdown({ pointerId:1, clientX:215, clientY:559 });
for (let i = 1; i <= 10; i++) handlers.pointermove({ pointerId:1, clientX:215 + DX * 0.9 * i / 10, clientY:559 + DY * 0.9 * i / 10 });
assert.equal(done, 1); assert.equal(anims.length, 0);
"""
        r = subprocess.run([node, "-e", script], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr[-900:])
        # 着いた時・次の「はこぶ」の始まりで、とんでいる印を下ろす。取り消しは endToken へ（とばさない）
        self.assertIn("senseDrag = null; senseHold = null; senseFly = false;", HTML[HTML.index("function senseDone() {"):HTML.index("function tokenNearFace() {")])
        self.assertIn("senseTaps = 0; senseFly = false;", HTML[HTML.index("function toSense() {"):HTML.index("function guideSense() {")])
        self.assertIn('token.addEventListener("pointercancel", endToken);', HTML)


    # ---- サイクル150（最初の1分・見つけ役の表から）----

    def _node150(self, script):
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        r = subprocess.run([node, "-e", script], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr[-1200:])

    def test_cycle150_taps_outside_the_plate_do_not_push_grains_while_picking(self):
        # サイクル148 の もどり: つまむ の間、案内文・顔・見出しをタップするたびに 全部の粒が 7px ずつ外へ逃げ、止まらなかった
        # （390×844実測 3回: 30回タップで まんなかからの平均 63〜68 → 208〜220px・ふちで切れた粒 7〜13 → 直した後 67〜68px のまま・0粒）。
        # 外のタップは トンの音と 粒のゆれだけ（test_cycle148_... の 'sound', 'wig'）。皿をたたく動きも、遠くの粒は外へ押さない。
        start = HTML.index("let offDown = null;")
        fn = HTML[start:HTML.index("armIdle();\nstartLot();", start)]
        self.assertNotIn("knockPlate", fn)
        knock = HTML[HTML.index("const KNOCK_REACH = 0.3;"):HTML.index("/* ひねる:")]
        self._node150("""
const assert = require('node:assert/strict');
const PW = 358, PH = 452; let sounds = 0, sims = 0;
Math.random = () => 0.5;   // ゆれの ばらつきを 0 にして数える
const mk = (x, y) => ({x, y, r:0, gone:false, awake:0, img:{offsetWidth:0, classList:{add() {}, remove() {}}}});
const grains = []; for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2, d = 10 + i * 3; grains.push(mk(PW / 2 + Math.cos(a) * d, PH / 2 + Math.sin(a) * d)); }
const knockSound = () => { sounds++; }, startSim = () => { sims++; };
""" + knock + """
const far = g => Math.hypot(g.x - PW / 2, g.y - PH / 2), mean = () => grains.reduce((a, g) => a + far(g), 0) / grains.length;
const m0 = mean();
knockPlate();
assert.equal(sounds, 1); assert.equal(sims, 1);
assert.ok(mean() > m0 + 5);                                  // 山（まんなかの近く）は 今までどおり ほどける
for (let k = 0; k < 200; k++) knockPlate();
const reach = Math.min(PW, PH) * 0.3;
grains.forEach(g => assert.ok(far(g) < reach + 7.01, String(far(g))));   // 200回たたいても、皿の短い辺の3割＋1回ぶん より外へは出ない（旧版は 20回で ふちへ）
assert.ok(reach + 7 < PW / 2 - 36);                          // ふちより 粒1つぶん以上 内がわ
const m1 = mean(); knockPlate(); assert.ok(Math.abs(mean() - m1) < 0.01);   // 遠くの粒は その場で はねるだけ
""")

    def test_cycle150_double_tap_on_next_does_not_skip_a_bag_and_the_stamp_stays(self):
        # 「つぎの ふくろ」を すばやく2回タップすると、2回目の指が 次の袋に変わった後に上がり、来たばかりの2袋目が 何もしないまま流れた
        # （390×844実測: 人の速さの2回タップ 21回中6回 3袋目へ → 直した後 0回）。押した袋が目の前にある時だけ流す。
        # 案内文をタップして進む人は、ボタンが同じ場所に出るので 証印が 0.6〜1.0秒で消えた（3回中3回）→ 出て 0.9秒より前の指は 流す空振りへ渡す。
        fn = HTML[HTML.index("function leaveBag() {"):HTML.index('nextBtn.addEventListener("click",')]
        self.assertIn("if (leaving || step !== 4 || !stamped) return;", fn)
        self.assertIn("const NEXT_GUARD = 900;", fn)
        self._node150("""
const assert = require('node:assert/strict');
const motion = 1; let leaving = false, step = 4, stamped = true, now = 0, nudges = 0, sounds = 0, nexts = 0; const anims = [];
globalThis.performance = { now: () => now };
const on = {}; const nextBtn = { addEventListener(t, f) { on[t] = f; } };
const bagBig = { style:{ transform:'' }, animate() { const a = { cancel() {} }; anims.push(a); return a; } };
const $ = () => bagBig;
const stopSwipeDemo = () => {}, bagSound = () => { sounds++; }, swipeNudge = () => { nudges++; };
const goNext = () => { nexts++; leaving = false; step = 0; stamped = false; };   // 次の袋: ぬく から・まだ押していない
const docOn = {}; const document = { addEventListener(t, f) { docOn[t] = f; } }, window = { addEventListener() {} };   // サイクル151: タップの 連打を 見分ける capture の 聞き手
""" + fn + """
const tap = (id) => { on.pointerdown({ pointerId:id }); on.pointerup({ pointerId:id }); };
// 出てから十分たったタップ: 流れる
nextShownAt = 1000; now = 5000; tap(1);
assert.equal(anims.length, 1); assert.equal(leaving, true); assert.equal(sounds, 1);
// 流れている間の2回目のタップ: 何も足さない
tap(2); assert.equal(anims.length, 1);
// 2回目の指が 流れている間に下り、次の袋に変わった後に上がる（旧版は ここで もう一度流れた）
on.pointerdown({ pointerId:3 });
anims[0].onfinish.call(anims[0]); assert.equal(nexts, 1); assert.equal(step, 0);
on.pointerup({ pointerId:3 });
assert.equal(anims.length, 1); assert.equal(leaving, false); assert.equal(nudges, 0);
tap(4); assert.equal(anims.length, 1);                     // 次の袋の ぬく の間も、かくれたボタンでは流れない
// 押してすぐ（0.9秒より前）に下ろした指: 流さず、流す空振りへ（音と ふくろの小さな動き。何も起きないタップには しない）
// サイクル151: この 守りは はんこが ひとりでに 押された 時（3回目の タップ: nextAuto）と タップの 連打の 時だけ。ここは ひとりでに 押された 場合
step = 4; stamped = true; nextAuto = true; nextShownAt = 10000; now = 10400; tap(5);
assert.equal(anims.length, 1); assert.equal(nudges, 1);
now = 10899; tap(6); assert.equal(nudges, 2); assert.equal(anims.length, 1);
now = 10900; tap(7); assert.equal(anims.length, 2); assert.equal(nudges, 2);   // 0.9秒たてば流れる
// ボタンが出る前から下りていた指（ボタンの上へは下りていない）・ほかの指・取り消された指では流さない
anims[1].onfinish.call(anims[1]); step = 4; stamped = true; now = 20000;
on.pointerup({ pointerId:8 }); assert.equal(anims.length, 2);
on.pointerdown({ pointerId:8 }); on.pointerup({ pointerId:9 }); on.pointerup({ pointerId:8 }); assert.equal(anims.length, 2);
on.pointerdown({ pointerId:8 }); on.pointercancel({ pointerId:8 }); on.pointerup({ pointerId:8 }); assert.equal(anims.length, 2);
assert.equal(nudges, 2);
// まだ押していない袋・流れている途中は、どの道から呼ばれても流さない
stamped = false; leaveBag(); assert.equal(anims.length, 2);
stamped = true; leaving = true; leaveBag(); assert.equal(anims.length, 2);
""")
        stamp = HTML[HTML.index("function stampNow() {"):HTML.index("function dropHanko() {")]
        self.assertIn("nextShownAt = performance.now();", stamp)
        # キーボードの Enter は そのまま流す
        self.assertIn('nextBtn.addEventListener("click", (e) => { if (e.detail === 0) leaveBag(); });', HTML)

    def test_cycle150_finger_can_scroll_back_from_the_notes_over_the_stage(self):
        # 📖 の後、皿・ふくろ・水分計の上から始めた指では ページが動かず、戻れなかった（390×844実測: 下へ300pxを8本なぞって 2回中2回 とちゅうで止まる。
        # でたらめな指 234回のうち 📖 を押した17回中15回が戻れず、その間 手本なし → 直した後 2回中2回 上まで戻る）。
        # 説明を読んでいる間（html.scrolled）は、touch-action:none の相手を ぜんぶ pan-y にする
        m = re.search(r"\n  ((?:html\.scrolled [#.]\w+, )*html\.scrolled [#.]\w+) \{ touch-action:pan-y; \}", HTML)
        self.assertTrue(m)
        pan = set(x.replace("html.scrolled ", "") for x in m.group(1).split(", "))
        css = HTML[:HTML.index("</style>")]
        none = set(re.findall(r"\n\s*([#.]\w+) \{[^}]*touch-action:none", css))
        self.assertTrue({"#plate", "#sceneBag", "#sceneMeter", "#bagBig", ".gradeBtn", "#meterBtn", "#senseToken"} <= none, none)
        self.assertEqual(none - pan, set())   # ページを止める相手が ふえたら、ここにも足す
        self.assertIn("html:not(.scrolled) { touch-action:none; }", HTML)   # 遊んでいる間は 今までどおり流れない
        # 読みこみの とちゅうに 📖 を押した人（おそい 3G の実測 3回中3回 指で 1px も動かせない）: 始まった後に 印を合わせる
        tail = HTML[HTML.index('$("app").classList.remove("boot");'):HTML.index("</script>", HTML.index('$("app").classList.remove("boot");'))]
        self.assertIn("\nsyncScrolled();\n", tail)
        fn = HTML[HTML.index("let scrollLastY"):HTML.index('window.addEventListener("resize",')]
        self._node150("""
const assert = require('node:assert/strict');
(function () {
const timers = new Map(); let tid = 0;
const setTimeout = (f) => { timers.set(++tid, f); return tid; }, clearTimeout = (i) => { timers.delete(i); };
const run = () => { const fs = [...timers.values()]; timers.clear(); fs.forEach(f => f()); };
const cls = new Set(), tos = [], on = {};
const window = { scrollY:0, innerHeight:844, addEventListener(t, f) { on[t] = f; }, scrollTo(o) { tos.push(o); } };
const document = { documentElement:{ classList:{ toggle(c, v) { if (v) cls.add(c); else cls.delete(c); } } } };
const reduced = false;
""" + fn + """
const at = (y) => { window.scrollY = y; on.scroll(); };
// 読みこみの とちゅうに 📖 で下へ とんでいた: 始まった時に 印が付く（scroll の知らせは 来ない）
window.scrollY = 844; syncScrolled(); assert.equal(cls.has('scrolled'), true);
run(); assert.equal(tos.length, 0);                       // 説明を読んでいる所は 動かさない
// 指で上へ戻る。指を置いている間は 何もしない
on.touchstart({ touches:{ length:1 } }); at(500); at(300); at(120); run(); assert.equal(tos.length, 0);
// 指を離して止まった時、ゲームが半分より多く見えていたら 上まで戻す
on.touchend({ touches:{ length:0 } }); run();
assert.deepEqual(tos, [{ top:0, behavior:'smooth' }]);
at(60); at(0); run(); assert.equal(cls.has('scrolled'), false); assert.equal(tos.length, 1);   // 上に着いたら 印を外す・もう動かさない
// 下へ読み進める向き（マウスのホイールなど）は 戻さない
at(100); at(200); run(); assert.equal(tos.length, 1); assert.equal(cls.has('scrolled'), true);
// 上へ戻る向きでも、半分より下で止まったら 戻さない（説明を読んでいる）
at(844); at(500); run(); assert.equal(tos.length, 1);
at(421); run(); assert.equal(tos.length, 2);              // 半分より上なら戻す
// ふたゆびの片方だけ離した間は 待つ
at(844); on.touchstart({ touches:{ length:2 } }); at(200); on.touchend({ touches:{ length:1 } }); run(); assert.equal(tos.length, 2);
on.touchcancel({ touches:{ length:0 } }); run(); assert.equal(tos.length, 3);
})();
""")
        self.assertIn('window.addEventListener("scroll", syncScrolled, { passive:true });', HTML)

    def test_cycle150_scrolling_or_cancelled_fingers_are_not_counted(self):
        # たてに動かし始めた指は ブラウザが取り消す（pointercancel）。取り消された指は、ふくろ（朱肉・はんこ・流す）でも 🤲 でも 空振りに数えない
        # （旧版の ふくろ は タップと同じに数え、3回で ひとりでに 朱肉が付いた）
        self.assertIn('$("bagBig").addEventListener("pointercancel", cancelHanko);', HTML)
        self.assertNotIn('$("bagBig").addEventListener("pointercancel", endHanko);', HTML)
        self.assertIn('token.addEventListener("pointercancel", endToken);', HTML)
        end = HTML[HTML.index("function endToken(e) {"):HTML.index('token.addEventListener("pointerup", endToken);')]
        self.assertIn('const cancelled = !!e && (e.type === "pointercancel" || pageSlid(e));', end)
        self.assertEqual(end.count("if (cancelled) return;"), 2)   # にぎる・はこぶ の どちらも
        self.assertLess(end.index("if (cancelled) return;"), end.index("++senseTaps"))
        fn = HTML[HTML.index('$("bagBig").addEventListener("pointerdown",'):HTML.index('$("bagBig").addEventListener("click",')]
        self._node150(self._hanko_world() + fn + """
const down = (y) => on.pointerdown({ pointerId:1, clientX:100, clientY:y }), move = (y) => on.pointermove({ pointerId:1, clientX:100, clientY:y });
// 朱肉の前: 取り消された指 3回 → 数えない・付かない（旧版は 3回目に ひとりでに付いた）
for (let i = 0; i < 3; i++) { down(100); on.pointercancel({ pointerId:1 }); }
assert.equal(hankoTaps, 0); assert.equal(inked, false); assert.equal(inkHold, null); assert.equal(inkDrag, null); assert.equal(ys.at(-1), 0); assert.ok(hankoBob);
// 離した指（タップ）は 今までどおり数える
down(100); on.pointerup({ pointerId:1 }); assert.equal(hankoTaps, 1);
// 朱肉の後: 取り消しは数えない・タップは数える
inked = true; hankoTaps = 0; down(100); move(130); on.pointercancel({ pointerId:1 });
assert.equal(hankoTaps, 0); assert.equal(hankoDrag, null); assert.equal(stamps, 0); assert.equal(ys.at(-1), 0);
down(100); on.pointerup({ pointerId:1 }); assert.equal(hankoTaps, 1);
// 押した後: 取り消しは 流す空振りに数えない・ふくろは元の場所へ
stamped = true; down(100); assert.ok(bagSwipe); bag.style.transform = 'translateX(20px)'; on.pointercancel({ pointerId:1 });
assert.equal(nudges, 0); assert.equal(bagSwipe, null); assert.equal(bag.style.transform, '');
down(100); on.pointerup({ pointerId:1 }); assert.equal(nudges, 1);
// 説明を読んでいる間（ページが下にある間）の たての指: 朱肉は付かない・はんこは下りない・置いたままの時計も始めない。タップは数える
stamped = false; inked = false; hankoTaps = 0; inks = 0; pageScrolled = true;
down(100); assert.equal(inkHold.timer, undefined); move(110); move(125); move(160); assert.equal(inks, 0); on.pointercancel({ pointerId:1 });
assert.equal(inked, false); assert.equal(hankoTaps, 0);
inked = true; down(100); move(130); move(170); assert.equal(stamps, 0); on.pointercancel({ pointerId:1 }); assert.equal(hankoTaps, 0);
down(100); on.pointerup({ pointerId:1 }); assert.equal(hankoTaps, 1);
// 取り消しが来ないまま離れた ページの指（pointerup）も、空振りに数えない（Codex指摘）。capture の聞き手が 先に見る
const upPage = () => { cap.pointerup({ pointerId:1 }); on.pointerup({ pointerId:1 }); };
hankoTaps = 0; slid.add(1);
for (let i = 0; i < 3; i++) { down(100); move(140); upPage(); }
assert.equal(hankoTaps, 0); assert.equal(stamps, 0); assert.equal(drops, 0); assert.equal(hankoDrag, null);
inked = false; for (let i = 0; i < 3; i++) { down(100); move(140); upPage(); }
assert.equal(inked, false); assert.equal(hankoTaps, 0); assert.equal(inkHold, null);
stamped = true; down(100); move(140); upPage(); assert.equal(nudges, 1); assert.equal(bagSwipe, null); stamped = false; inked = true;
slid.clear(); down(100); upPage(); assert.equal(hankoTaps, 1);   // ふつうのタップは 今までどおり
// よこへ流す指は 今までどおり（たてに大きく動いた指では流さない）
stamped = true; let left = 0; leaveBag = () => { left++; };
on.pointerdown({ pointerId:1, clientX:100, clientY:100 }); on.pointermove({ pointerId:1, clientX:145, clientY:190 }); assert.equal(left, 0); on.pointercancel({ pointerId:1 });
on.pointerdown({ pointerId:1, clientX:100, clientY:100 }); on.pointermove({ pointerId:1, clientX:145, clientY:104 }); assert.equal(left, 1);
""")

    @staticmethod
    def _hanko_world():
        return """
const assert = require('node:assert/strict');
const NUDGE_LIMIT = 3, INK_MS = 250, motion = 1;
let step = 4, leaving = false, stamped = false, inked = false, hankoTaps = 0, swipeTaps = 0, hankoDrag = null, inkDrag = null, inkHold = null, bagSwipe = null, hankoBob = null, hankoMax = 96, hankoLand = 50;
const ys = []; let stamps = 0, nudges = 0, drops = 0, inks = 0;
const on = {}, cap = {}; const bag = { style:{}, addEventListener(t, f, c) { (c ? cap : on)[t] = f; } };
const hanko = { animate() { return {}; } };
const $ = id => id === 'bagBig' ? bag : hanko;
const hint = {};
const capture = () => {}, guideOff = () => {}, guideAt = () => {}, stopSwipeDemo = () => {}, inkDemoSound = () => {}, stampDemoSound = () => {}; let leaveBag = () => {};
const stopBob = () => { hankoBob = null; }, bobHanko = () => { hankoBob = {}; };
const setHanko = y => { ys.push(y); };
const inkDone = () => { inks++; inked = true; inkHold = null; inkDrag = null; ys.push(0); bobHanko(); };
const stampNow = () => { if (stamped) return; stamped = true; hankoDrag = null; stamps++; };
const swipeNudge = () => { nudges++; }, dropHanko = () => { drops++; };
let pageScrolled = false; const pageFinger = (dx, dy) => pageScrolled && Math.abs(dy) >= Math.abs(dx); const slid = new Set(), pageSlid = (e) => !!e && slid.has(e.pointerId);
"""

    def test_cycle150_one_stroke_inks_and_stamps(self):
        # はんこを 朱肉の先まで 1本の指で下ろすと、朱肉が付いた所で はんこが上へ戻り、指の残りは捨てられた
        # （390×844実測: 下へ 116px を1本で 3回中3回 押せない → 直した後 3回中3回 押せる）。朱肉が付いた所から、同じ指で はんこを下ろせる
        fn = HTML[HTML.index('$("bagBig").addEventListener("pointerdown",'):HTML.index('$("bagBig").addEventListener("click",')]
        self._node150(self._hanko_world() + fn + """
const down = (y) => on.pointerdown({ pointerId:1, clientX:100, clientY:y }), move = (y) => on.pointermove({ pointerId:1, clientX:100, clientY:y });
// 下へ 116px を1本で: 18px で朱肉が付き、そこから 押したことにする長さ（50px）で押される
down(100); for (let y = 106; y <= 216 && !stamped; y += 6) move(y);
assert.equal(inks, 1); assert.equal(stamps, 1); assert.equal(hankoTaps, 0);
on.pointerup({ pointerId:1 }); assert.equal(stamps, 1); assert.equal(hankoTaps, 0);
// ふつうの朱肉の なぞり（30px で離す）: 付く・押されない・はんこの空振りに数えない・はんこは上へ戻って ゆれる
stamped = false; inked = false; inks = 0; stamps = 0; hankoBob = null;
down(100); for (let y = 106; y <= 130; y += 6) move(y);
assert.equal(inked, true); assert.equal(stamps, 0); assert.ok(hankoDrag && hankoDrag.fromInk);
assert.ok(ys.at(-1) > 0);                                // 付いた後の指に はんこが ついて下りる
on.pointerup({ pointerId:1 });
assert.equal(hankoTaps, 0); assert.equal(ys.at(-1), 0); assert.ok(hankoBob); assert.equal(hankoDrag, null);
// 付いた後に あらためて下ろした指の空振りは、今までどおり数える
down(100); on.pointerup({ pointerId:1 }); assert.equal(hankoTaps, 1);
// 朱肉が付いた その指が 取り消されたら 押さない
stamped = false; inked = false; hankoTaps = 0;
down(100); move(120); on.pointercancel({ pointerId:1 }); assert.equal(stamps, 0); assert.equal(hankoDrag, null); assert.equal(hankoTaps, 0);
""")
        self.assertIn("if (idy >= 18) { inkDrag = null; inkDone(); }", HTML)

    def test_cycle150_resting_finger_does_not_block_the_working_finger(self):
        # ふくろを1本で押さえたまま もう1本で穀刺しを押す・水分計の本体を押さえたまま ハンドルを回す と、音も動きも 0 だった
        # （390×844実測: さす 2回中2回 ささらない・はかる 1.5周で 0回 → 直した後 2回中2回 ささる・3回はかれる）。
        # 決まり: 追う指は いつも1本。先の指が 8px より大きく動いていない間に、後の指が 8px より大きく動いたら 入れかえる。動いた後は入れかえない
        bag = HTML[HTML.index("const bagPts = new Map(), meterPts = new Map();"):HTML.index('$("bagBtn").addEventListener("click",')]
        self._node150("""
const assert = require('node:assert/strict');
const NUDGE_LIMIT = 3, motion = 1;
let step = 0, bagTaps = 0, probeAttract = null, autos = 0, nudges = 0; let moves = [];
const P = { x:205, rest:205, inAt:166, inX:74, y:50, inserted:false, done:false, drag:null, auto:false };
const on = {}; const scene = { addEventListener(t, f) { on[t] = f; } };
const poke = { style:{} }, probe = { animate() { return {}; } };
const $ = id => ({ sceneBag:scene, poke, probe })[id];
const capture = () => {}, stopPullDemo = () => {}, stopProbeAttract = () => {}, stabPoke = () => {}, probeDemoSound = () => {};
const moveProbe = x => { moves.push(x); P.x = x; if (x <= P.inAt) P.inserted = true; };
const autoProbe = () => { autos++; }, pullNudge = () => { nudges++; };
let pageScrolled = false; const pageFinger = (dx, dy) => pageScrolled && Math.abs(dy) >= Math.abs(dx); const slid = new Set(), pageSlid = (e) => !!e && slid.has(e.pointerId);
const inContact = (e) => e.buttons > 0 || e.pointerType !== 'mouse' && e.pointerType !== 'pen';   // サイクル152: 道具に さわって いる 指か（本物は kensa.html の inContact）
""" + bag + """
const ev = (id, x, y, type) => ({ pointerId:id, clientX:x, clientY:y, pointerType:type || 'touch', buttons:1 });
const fresh = () => { P.x = 205; P.inserted = false; P.drag = null; bagTaps = 0; moves = []; bagPts.clear(); };
// 押さえた指（1）＋ 押す指（2）: 2本目で ささる（旧版は 動き 0）
on.pointerdown(ev(1, 60, 120)); on.pointerdown(ev(2, 330, 100));
assert.equal(P.drag.id, 1);
for (let d = 10; d <= 50; d += 10) on.pointermove(ev(2, 330 - d, 100));
assert.equal(P.drag.id, 2); assert.equal(P.inserted, true); assert.equal(P.x, 155);   // 置いた所から数える（とちゅうの 8px を捨てない）
on.pointerup(ev(1, 60, 120)); assert.equal(P.drag.id, 2); assert.equal(nudges, 0); assert.equal(bagTaps, 0);   // 押さえていた指を離しても 何も数えない
on.pointerup(ev(2, 280, 100)); assert.equal(P.drag, null); assert.equal(nudges, 0);
// 8px までの動きでは 入れかえない。押さえた指が 8px まで ゆれていても 入れかわる
fresh(); on.pointerdown(ev(1, 60, 120)); on.pointerdown(ev(2, 330, 100));
on.pointermove(ev(1, 64, 123)); on.pointermove(ev(2, 322, 100)); assert.equal(P.drag.id, 1);
on.pointermove(ev(2, 321, 100)); assert.equal(P.drag.id, 2);
on.pointerup(ev(2, 321, 100)); on.pointerup(ev(1, 64, 123));
// Codex指摘: 先の指が 6px 動いて もう穀刺しに写った後は、入れかえない（旧版は 入れかえて 2本の動きを足した: 178 → 163 で ささった）
fresh(); P.x = 178; on.pointerdown(ev(1, 60, 120)); on.pointerdown(ev(2, 330, 100));
on.pointermove(ev(1, 54, 120)); assert.equal(P.x, 172);
on.pointermove(ev(2, 321, 100));
assert.equal(P.drag.id, 1); assert.equal(P.x, 172); assert.equal(P.inserted, false);   // どちらの指も ひとりでは とどいていない
on.pointerup(ev(2, 321, 100)); on.pointerup(ev(1, 54, 120));
// ページを動かす指（説明を読んでいる間の たての指）は、追う指に ならない
fresh(); pageScrolled = true; on.pointerdown(ev(1, 60, 120)); on.pointerdown(ev(2, 330, 100)); on.pointermove(ev(2, 327, 112));
assert.equal(P.drag.id, 1); pageScrolled = false; on.pointerup(ev(2, 327, 112)); on.pointerup(ev(1, 60, 120));
// 2本とも動かす: 先に動いた指だけを追う。進むのは1本ぶん
fresh(); on.pointerdown(ev(1, 330, 100)); on.pointerdown(ev(2, 330, 140));
on.pointermove(ev(1, 310, 100)); on.pointermove(ev(2, 300, 140)); on.pointermove(ev(1, 305, 100)); on.pointermove(ev(2, 280, 140));
assert.equal(P.drag.id, 1); assert.equal(P.x, 180); assert.equal(P.inserted, false);
on.pointerup(ev(2, 280, 140)); assert.equal(P.drag.id, 1); assert.equal(bagTaps, 0);
on.pointerup(ev(1, 305, 100)); assert.equal(bagTaps, 1);    // とどかなかった押しは 今までどおり1回
// 押さえた指＋もう1本のタップ: 追っていない指は数えない。押さえた指を離した時に1回（今までどおり）
fresh(); on.pointerdown(ev(1, 60, 120)); on.pointerdown(ev(2, 330, 100)); on.pointerup(ev(2, 331, 100));
assert.equal(bagTaps, 0); assert.equal(P.drag.id, 1);
on.pointerup(ev(1, 60, 120)); assert.equal(bagTaps, 1);
// 入れかわった指が取り消された: 追う指なし。残った指を動かせば、その指で続ける（今までどおり）
fresh(); on.pointerdown(ev(1, 60, 120)); on.pointerdown(ev(2, 330, 100)); on.pointermove(ev(2, 315, 100));
assert.equal(P.drag.id, 2); on.pointercancel(ev(2, 315, 100)); assert.equal(P.drag, null); assert.equal(bagTaps, 0);
on.pointermove(ev(1, 61, 120)); assert.equal(P.drag.id, 1); assert.equal(P.drag.moved, true);
on.pointerup(ev(1, 61, 120)); assert.equal(bagTaps, 1);
// マウス（ボタンを押していない動き）は 追わない
fresh(); on.pointermove({ pointerId:5, clientX:10, clientY:10, pointerType:'mouse', buttons:0 }); assert.equal(P.drag, null);
""")
        meter = HTML[HTML.index("function restingTakeover("):HTML.index('$("sceneBag").addEventListener("pointerdown",')] + \
            HTML[HTML.index("function crankPointer(e) {"):HTML.index('$("meterBtn").addEventListener("click",')]
        self._node150("""
const assert = require('node:assert/strict');
const NUDGE_LIMIT = 3, motion = 1, meterPts = new Map();
let step = 1, measured = 0, lotIndex = 0, crankAngle = 0, crankTurned = 0, crankDrag = null, meterTaps = 0, crankDemo = null, clicks = 0;
const LOT = { moisture:[14.1, 14.2, 14.3] };
const on = {}; const scene = { addEventListener(t, f) { on[t] = f; } };
const els = { sceneMeter:scene, crank:{ getBoundingClientRect: () => ({ left:260, top:60, width:100, height:100 }) }, crankArm:{ style:{}, animate() {} }, lcd:{} };
const $ = id => els[id];
const capture = () => {}, guideOff = () => {}, guideAt = () => {}, crankSound = () => { clicks++; };
const takeReading = () => { measured++; };
let pageScrolled = false; const pageFinger = (dx, dy) => pageScrolled && Math.abs(dy) >= Math.abs(dx); const slid = new Set(), pageSlid = (e) => !!e && slid.has(e.pointerId);
const inContact = (e) => e.buttons > 0 || e.pointerType !== 'mouse' && e.pointerType !== 'pen';   // サイクル152: 道具に さわって いる 指か（本物は kensa.html の inContact）
""" + meter + """
const ev = (id, x, y) => ({ pointerId:id, clientX:x, clientY:y, pointerType:'touch', buttons:1 });
const turn = (id, turns) => { const n = Math.round(turns * 24); for (let i = 1; i <= n; i++) { const a = -Math.PI / 2 + i / 24 * 2 * Math.PI; on.pointermove(ev(id, 310 + 33 * Math.cos(a), 110 + 33 * Math.sin(a))); } };
// 本体を押さえた指（1）＋ ハンドルを回す指（2）: 回した分だけ はかれる（旧版は 0回）
on.pointerdown(ev(1, 120, 130)); on.pointerdown(ev(2, 310, 77));
assert.equal(crankDrag.id, 1);
turn(2, 1);
assert.equal(crankDrag.id, 2); assert.equal(measured, 3);
on.pointerup(ev(1, 120, 130)); assert.equal(meterTaps, 0);     // 押さえていた指は タップに数えない
on.pointerup(ev(2, 310, 77)); assert.equal(meterTaps, 0); assert.equal(crankDrag, null);
// Codex指摘の同じ形: 先の指が ハンドルの上で 8px まで ゆれても 回さない（写さない）。入れかえた後に進むのは 後の指の分だけ
measured = 0; crankTurned = 0; crankAngle = 0; meterPts.clear();
on.pointerdown(ev(1, 310, 77)); on.pointermove(ev(1, 317, 78));
assert.equal(crankTurned, 0); assert.equal(crankAngle, 0);
on.pointerdown(ev(2, 310, 143)); for (let i = 1; i <= 4; i++) { const a = Math.PI / 2 + i / 24 * 2 * Math.PI; on.pointermove(ev(2, 310 + 33 * Math.cos(a), 110 + 33 * Math.sin(a))); }
assert.equal(crankDrag.id, 2); assert.ok(Math.abs(crankTurned - 60) < 0.01, String(crankTurned)); assert.equal(measured, 0);   // 60°ぶんだけ（先の指の ゆれ 12°は足さない）
on.pointerup(ev(1, 317, 78)); on.pointerup(ev(2, 0, 0));
// ためた分は捨てない: 1本の指の 90°の回しは、小さく きざんでも 今までどおり 1回はかれる
measured = 0; crankTurned = 0; crankAngle = 0;
on.pointerdown(ev(1, 310, 77)); for (let i = 1; i <= 18; i++) { const a = -Math.PI / 2 + i / 72 * 2 * Math.PI; on.pointermove(ev(1, 310 + 33 * Math.cos(a), 110 + 33 * Math.sin(a))); }
assert.equal(measured, 1); assert.ok(Math.abs(crankAngle - 90) < 0.01); on.pointerup(ev(1, 0, 0));
// 2本とも回す: 先に動いた指だけ。進むのは1本ぶん（1/4周 = 1回）
measured = 0; crankTurned = 0; meterPts.clear();
on.pointerdown(ev(1, 310, 77)); on.pointerdown(ev(2, 310, 143));
for (let i = 1; i <= 6; i++) { const a = -Math.PI / 2 + i / 24 * 2 * Math.PI; on.pointermove(ev(1, 310 + 33 * Math.cos(a), 110 + 33 * Math.sin(a))); on.pointermove(ev(2, 310 - 33 * Math.cos(a), 110 - 33 * Math.sin(a))); }
assert.equal(crankDrag.id, 1); assert.equal(measured, 1);
on.pointerup(ev(2, 0, 0)); on.pointerup(ev(1, 0, 0));
// 押さえた指＋もう1本のタップ: 数えない。押さえた指を離した時に1回（今までどおり）
measured = 0; crankTurned = 0; meterTaps = 0;
on.pointerdown(ev(1, 120, 130)); on.pointerdown(ev(2, 310, 77)); on.pointerup(ev(2, 310, 77)); assert.equal(meterTaps, 0);
on.pointerup(ev(1, 120, 130)); assert.equal(meterTaps, 1);
// 取り消された指は 置いた所の記録も消す
on.pointerdown(ev(1, 120, 130)); on.pointercancel(ev(1, 120, 130)); assert.equal(crankDrag, null); assert.equal(meterPts.size, 0);
// 説明を読んでいる間の たての指（ページを動かす指）では 回さない。何本なぞっても はかれない
measured = 0; crankTurned = 0; pageScrolled = true;
for (let k = 0; k < 8; k++) { on.pointerdown(ev(1, 343, 90)); for (let y = 95; y <= 130; y += 5) on.pointermove(ev(1, 343, y)); on.pointercancel(ev(1, 343, 130)); }
assert.equal(measured, 0); assert.equal(crankTurned, 0);
pageScrolled = false; on.pointerdown(ev(1, 310, 77)); turn(1, 0.3); assert.equal(measured, 1); on.pointerup(ev(1, 0, 0));
""")
        self.assertIn("if (e.pointerId !== P.drag.id) return;", HTML)
        self.assertIn("if (e.pointerId !== crankDrag.id) return;", HTML)

    def test_cycle150_probe_keeps_its_place_when_the_screen_changes(self):
        # さした後に画面を回すと、穀刺しが 前の画面の場所のまま残り、たて → よこ では 右へ引いても ぬけなかった（6本中6本 → 直した後 6本中6本 ぬける）。
        # さす とちゅうで大きさが変わると、押しかけた穀刺しが 元へ戻った（4回中4回 21〜25px → 0px → 直した後 押した割合のまま）
        lp = HTML.index("function layoutProbe() {")
        layout = HTML[lp:HTML.index("function stabDx(from) {", lp)]
        move = HTML[HTML.index("function moveProbe(x) {"):HTML.index("function pourOne(g) {")]
        self._node150("""
const assert = require('node:assert/strict');
const PLATE_GRAINS = 20; let bagTaps = 0, poured = 0, finished = 0, pulls = 0, probeAttract = null;
const P = { x:0, rest:0, inX:0, inAt:0, deep:0, y:0, L:0, inserted:false, done:false, released:0, drag:null, auto:false };
const grains = Array.from({ length:20 }, () => ({}));
const poke = { style:{ setProperty() {} }, dataset:{} }, probe = { style:{} }, scene = { clientWidth:366 };
let bagBtn = null;
const tall = () => { bagBtn = { offsetLeft:15, offsetWidth:184, offsetTop:10, offsetHeight:230, classList:{ add() {}, remove() {} } }; scene.clientWidth = 366; };
const wide = () => { bagBtn = { offsetLeft:54, offsetWidth:71, offsetTop:5, offsetHeight:89, classList:{ add() {}, remove() {} } }; scene.clientWidth = 400; };
const $ = id => ({ sceneBag:scene, bagBtn, probe, poke })[id];
const stabDx = () => -55, pullPoke = () => { pulls++; }, startProbeAttract = () => {}, pierceSound = () => {}, pourOne = () => { poured++; };
const finishProbe = () => { finished++; P.done = true; }, hint = {};
""" + layout + move + """
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.01, a + ' != ' + b);
const fresh = () => { Object.assign(P, { inserted:false, done:false, released:0, drag:null, deep:0 }); P.x = P.rest; poured = finished = 0; };
// たて（390×844）で さす → よこ（844×390）へ回す
tall(); layoutProbe(); near(P.rest, 205); near(P.x, 205);
moveProbe(160); assert.equal(P.inserted, true); near(P.deep, 160);
wide(); layoutProbe();
near(P.rest, 131);
assert.ok(P.x <= P.inAt + 1 && P.x >= P.inX, 'ふくろの中に入ったまま: ' + P.x);   // 旧版は 160 のまま（新しい元の場所 131 より右＝ふくろの外）
assert.ok(P.deep <= P.inAt && P.deep <= P.x);
assert.equal(probe.style.transform, 'translate(' + P.x + 'px,' + P.y + 'px)');       // 高さも 新しい画面の場所
assert.equal(pulls, 1);
moveProbe(P.rest);                                                                   // 右へ引けば ぬける（旧版は 1粒も落ちない）
assert.equal(poured, 20); assert.equal(finished, 1);
// いちばん深くさして 半分引いた所で回す: 引いた割合・落ちた粒は そのまま
tall(); layoutProbe(); fresh();
moveProbe(P.inX); moveProbe((P.inX + P.rest) / 2); const half = poured; assert.ok(half > 5 && half < 20);
const ratio = (P.x - P.deep) / (P.rest - P.deep);
wide(); layoutProbe();
near((P.x - P.deep) / (P.rest - P.deep), ratio); near(P.deep, P.inX);
moveProbe(P.x); assert.equal(poured, half);                                          // 回しただけでは 粒は落ちない
// さす とちゅう（6割まで押した）で大きさが変わる: 押した割合のまま・さしたことには しない
tall(); layoutProbe(); fresh();
moveProbe(P.rest - 0.6 * (P.rest - P.inAt)); assert.equal(P.inserted, false);
P.drag = { id:1, cx:300, cy:100, far:20, x0:P.rest, moved:true, dx:-23 };
wide(); layoutProbe();
near(P.x, P.rest - 0.6 * (P.rest - P.inAt)); assert.equal(P.inserted, false);        // 旧版は 元の場所（P.rest）へ戻った
near(P.drag.x0 + P.drag.dx, P.x);                                                    // 置いたままの指の 次の動きで とばない
// ほぼ さす所まで押してあっても、写しただけでは ささらない
tall(); layoutProbe(); fresh(); moveProbe(P.inAt + 0.2); wide(); layoutProbe();
assert.ok(P.x >= P.inAt + 1); assert.equal(P.inserted, false);
// 押していなければ 元の場所のまま
tall(); layoutProbe(); fresh(); wide(); layoutProbe(); near(P.x, P.rest);
""")
        lot = HTML[HTML.index("function startLot() {"):HTML.index("/* 皿の粒:")]
        self.assertLess(lot.index("P.x = P.rest;"), lot.index("layoutProbe();"))   # 次の袋は 元の場所から（前の袋の場所を写さない）

    def test_cycle150_grade_button_taps_start_over_on_each_bag(self):
        # 等級のボタンを さわった回数が 次の袋へ残り、1袋目で 規格外 を1回さわった人は、2袋目で 1回タップしただけで決まった（実測 2回中2回 → 直した後 0回）
        fn = HTML[HTML.index("const gradeResets = [];"):HTML.index("/* おす: 朱肉に", HTML.index("const gradeResets = [];"))]
        self._node150("""
const assert = require('node:assert/strict');
const motion = 1, LOT = {}; let step = 3, sounds = 0; const picks = [];
let pageScrolled = false; const pageFinger = (dx, dy) => pageScrolled && Math.abs(dy) >= Math.abs(dx); const slid = new Set(), pageSlid = (e) => !!e && slid.has(e.pointerId);
const btns = [0, 1, 2, 3].map(i => { const b = { i, ev:{}, style:{}, dataset:{ i:String(i) }, addEventListener(t, f) { b.ev[t] = f; }, animate() {} }; return b; });
const document = { querySelectorAll: () => btns };
const capture = () => {}, guideOff = () => {}, guideAt = () => {}, gradeDemoSound = () => { sounds++; }, lotGrade = () => 0;
const pickGrade = (b) => { picks.push(b.i); };
""" + fn + """
const tap = (i) => { btns[i].ev.pointerdown({ pointerId:1, clientY:500 }); btns[i].ev.pointerup({ pointerId:1 }); };
tap(3); assert.deepEqual(picks, []); assert.equal(sounds, 1);     // 1袋目: 規格外 を1回さわる（手本と音）
assert.equal(gradeResets.length, 4);
gradeResets.forEach(f => f());                                    // 次の袋の「きめる」
tap(3); assert.deepEqual(picks, []); assert.equal(sounds, 2);     // 1回目は また手本（旧版は ここで決まった）
tap(3); assert.deepEqual(picks, [3]);                             // 2回で決まる決まりは そのまま
tap(1); gradeResets.forEach(f => f()); tap(1); assert.deepEqual(picks, [3]);
// 上へ引けば その場で決まる（今までどおり）。説明を読んでいる間（ページが下にある間）の たての指では 決めない
const pull = (i) => { btns[i].ev.pointerdown({ pointerId:1, clientY:500 }); btns[i].ev.pointermove({ pointerId:1, clientY:470 }); btns[i].ev.pointercancel({ pointerId:1 }); };
pageScrolled = true; pull(2); assert.deepEqual(picks, [3]);
// 取り消しが来ないまま離れた ページの指（pointerup）も、タップに数えない（Codex指摘）
slid.add(1); tap(0); tap(0); assert.deepEqual(picks, [3]); slid.clear();
pageScrolled = false; pull(2); assert.deepEqual(picks, [3, 2]);
""")
        kimeru = HTML[HTML.index("function toKimeru() {"):HTML.index("function pickGrade(btn) {")]
        self.assertIn("gradeResets.forEach(f => f());", kimeru)

    def test_cycle150_sweeps_that_miss_the_pile_count_and_zoom_does_not_block_spreading(self):
        # 皿の中で 山に当たらなかった なで は、何回やっても 音も動きも 0 だった（390×844実測: 8回 × 3回とも 広がらない → 直した後 2回目で広がる）。
        # 広げる前に ふたゆびで寄ると、なでても 見る場所が動くだけだった（8回 × 3回とも 広がらない → 直した後 広がる）
        fn = HTML[HTML.index("const pts = new Map();"):HTML.index("/* 振る:")]
        self._node150("""
const assert = require('node:assert/strict');
let step = 2, spread = false, badLeft = 2, lastGoodTap = 0, lastGoodX = 0, lastGoodY = 0, hitPile = false; let calls = [];
const Z = { s:1, tx:0, ty:0 }, ZOOM_MAX = 3.4;
const on = {}; const plate = { clientLeft:0, clientTop:0, getBoundingClientRect: () => ({ left:0, top:0 }), addEventListener(t, f) { on[t] = f; } };
const zoomBtn = {}, token = { hidden:true };
let pageScrolled = false; const pageFinger = (dx, dy) => pageScrolled && Math.abs(dy) >= Math.abs(dx); const slid = new Set(), pageSlid = (e) => !!e && slid.has(e.pointerId);
const brush = () => { calls.push('brush'); return hitPile; };
const toLocal = (x, y) => ({ x, y }), grainAt = () => null;
const stopSmoothZoom = () => {}, capture = () => {}, guideOff = () => {}, applyZoom = () => { calls.push('pan'); }, twistPlate = () => {}, resetZoom = () => {}, zoomTo = () => {};
const tapGrain = () => {}, flickGrain = () => { calls.push('flick'); }, knockPlate = () => { calls.push('knock'); }, nudgeSpread = () => { calls.push('spread'); }, knockSound = () => { calls.push('sound'); };
const grains = [{ gone:false, img:{ offsetWidth:0, classList:{ remove() {}, add() { calls.push('wig'); } } } }, { gone:true, img:{ classList:{ remove() {}, add() { calls.push('wig'); } } } }];
""" + fn + """
const sweep = (cancelled) => {
  calls = [];
  on.pointerdown({ pointerId:1, clientX:40, clientY:40, target:plate });
  for (let x = 60; x <= 320; x += 20) on.pointermove({ pointerId:1, clientX:x, clientY:40 });
  endPlatePointer({ pointerId:1, clientX:320, clientY:40 }, !!cancelled);
  return calls.filter(c => c !== 'brush');
};
// 山に当たらなかった なで: トンの音・のこっている粒のゆれ・広げる空振り（1回目=手本／2回目=山がほどける）
assert.deepEqual(sweep(), ['sound', 'wig', 'spread']);
// 粒を押した なで・取り消された指・広げた後・ぜんぶ取った後 は数えない
hitPile = true; assert.deepEqual(sweep(), []); hitPile = false;
assert.deepEqual(sweep(true), []);
spread = true; assert.deepEqual(sweep(), []); spread = false;
badLeft = 0; assert.deepEqual(sweep(), []); badLeft = 2;
// 動かさないタップは 今までどおり（皿をたたく＋広げる空振り）
calls = []; on.pointerdown({ pointerId:1, clientX:40, clientY:40, target:plate }); endPlatePointer({ pointerId:1, clientX:41, clientY:40 }, false);
assert.deepEqual(calls, ['knock', 'spread']);
// 広げる前は、寄っていても なでれば粒を押す（見る場所は動かさない）
Z.s = 2.33; sweep(); assert.ok(calls.includes('brush')); assert.ok(!calls.includes('pan'));
assert.deepEqual(sweep(), ['sound', 'wig', 'spread']);
// 広げた後は 今までどおり、寄っている間の指は 見る場所を動かす
spread = true; sweep(); assert.ok(calls.includes('pan')); assert.ok(!calls.includes('brush'));
// 説明を読んでいる間の たての指（ページを動かす指）では なでない・見る場所も動かさない。よこの なで は 今までどおり
spread = false; Z.s = 1; pageScrolled = true; calls = [];
on.pointerdown({ pointerId:1, clientX:100, clientY:100, target:plate });
for (let y = 110; y <= 200; y += 10) on.pointermove({ pointerId:1, clientX:102, clientY:y });
endPlatePointer({ pointerId:1, clientX:102, clientY:200 }, true);
assert.deepEqual(calls, []);
// 取り消しが来ないまま離れた ページの指（pointerup）も、空振り・タップ・はじき に数えない（Codex指摘）
slid.add(1); calls = [];
on.pointerdown({ pointerId:1, clientX:100, clientY:100, target:plate });
for (let y = 110; y <= 200; y += 10) on.pointermove({ pointerId:1, clientX:102, clientY:y });
endPlatePointer({ pointerId:1, clientX:102, clientY:200 }, false);
on.pointerdown({ pointerId:1, clientX:100, clientY:100, target:plate }); on.pointermove({ pointerId:1, clientX:101, clientY:118 });
endPlatePointer({ pointerId:1, clientX:101, clientY:118 }, false);
assert.deepEqual(calls, []); slid.clear();
sweep(); assert.ok(calls.includes('brush'));
""")


    def test_cycle150_codex_page_fingers_never_drive_the_probe(self):
        # Codex指摘: 説明から戻る たての指は ふくろの場面の上からも始められるのに、穀刺しの動きには「ページを動かす指」の見分けが無く、
        # よこへ 5px より ぶれると ささった（ささる 1px 手前で (dx, dy) = (-6, 8) → ささる。取り消しでも戻らない）。
        # 状態を変える前に見分ける。取り消しが来ないまま離れた指（pointerup）も数えない。見分けは 本物の pageFinger・pageSlid で確かめる
        helpers = HTML[HTML.index("var pageScrolled = false;"):HTML.index("/* 指の動きはどれも止まらないように")]
        bag = HTML[HTML.index("const bagPts = new Map(), meterPts = new Map();"):HTML.index('$("bagBtn").addEventListener("click",')]
        self._node150("""
const assert = require('node:assert/strict');
const NUDGE_LIMIT = 3, motion = 1;
let step = 0, bagTaps = 0, probeAttract = null, autos = 0, nudges = 0;
const P = { x:167, rest:205, inAt:166, inX:74, y:50, inserted:false, done:false, drag:null, auto:false };
const doc = {}, win = {}, on = {};
const document = { addEventListener(t, f) { (doc[t] = doc[t] || []).push(f); } }, window = { addEventListener(t, f) { (win[t] = win[t] || []).push(f); } };
const scene = { addEventListener(t, f) { on[t] = f; } };
const $ = id => ({ sceneBag:scene, poke:{ style:{} }, probe:{ animate() { return {}; } } })[id];
const capture = () => {}, stopPullDemo = () => {}, stopProbeAttract = () => {}, stabPoke = () => {}, probeDemoSound = () => {};
const moveProbe = x => { P.x = x; if (x <= P.inAt) P.inserted = true; };
const autoProbe = () => { autos++; }, pullNudge = () => { nudges++; };
""" + helpers + bag + """
// 本物の順: document（capture）→ 場面 → window
const fire = (type, id, x, y) => { const e = { type, pointerId:id, clientX:x, clientY:y, pointerType:'touch', buttons:1 }; (doc[type] || []).forEach(f => f(e)); if (on[type]) on[type](e); (win[type] || []).forEach(f => f(e)); };
const fresh = () => { P.x = 167; P.inserted = false; P.drag = null; bagTaps = 0; bagPts.clear(); };
// 説明を読んでいる間: ささる 1px 手前で、たてに大きく動く指（よこへ 6px・たてへ 8px）→ 動かない・ささらない
pageScrolled = true;
fire('pointerdown', 1, 300, 100); fire('pointermove', 1, 294, 108);
assert.equal(P.x, 167); assert.equal(P.inserted, false);
fire('pointercancel', 1, 294, 108); assert.equal(P.inserted, false); assert.equal(bagTaps, 0); assert.equal(pageDowns.size, 0);
// 取り消しが来ないまま離れても（pointerup）、空振りに数えない。3回なぞっても ひとりでに ぬけない
for (let i = 0; i < 3; i++) { fire('pointerdown', 1, 300, 100); fire('pointermove', 1, 296, 130); fire('pointermove', 1, 290, 180); fire('pointerup', 1, 290, 180); }
assert.equal(P.x, 167); assert.equal(P.inserted, false); assert.equal(bagTaps, 0); assert.equal(autos, 0);
// たてに大きく動いてから 元の所へ戻して離した指も 数えない
fire('pointerdown', 1, 300, 100); fire('pointermove', 1, 300, 140); fire('pointermove', 1, 300, 101); fire('pointerup', 1, 300, 101);
assert.equal(bagTaps, 0);
// さした後: ページを動かす指では 粒は落ちない・ひきぬく空振りにも数えない
P.inserted = true; P.x = 120; fire('pointerdown', 1, 200, 100); fire('pointermove', 1, 209, 115); fire('pointerup', 1, 209, 115);
assert.equal(P.x, 120); assert.equal(nudges, 0);
// 説明を読んでいる間でも、よこの指（さす）と タップは 今までどおり
fresh(); fire('pointerdown', 1, 300, 100); fire('pointermove', 1, 292, 103); assert.equal(P.inserted, true); fire('pointerup', 1, 292, 103);
fresh(); fire('pointerdown', 1, 300, 100); fire('pointerup', 1, 301, 100); assert.equal(bagTaps, 1);
// ページが上にある時（遊んでいる間）は、たての引きも 今までどおり1回と数える（ちがう向きの引き）
pageScrolled = false; fresh();
fire('pointerdown', 1, 300, 100); fire('pointermove', 1, 294, 108); assert.equal(P.inserted, true);
fresh(); fire('pointerdown', 1, 300, 100); fire('pointermove', 1, 300, 160); fire('pointerup', 1, 300, 160); assert.equal(bagTaps, 1);
assert.equal(pageSlid(undefined), false);   // 指なしで呼ばれる道（場面の外のタップの受け皿）は そのまま
""")
        # ほかの所作も、状態を変える前・離した時に 同じ見分けを通る
        # サイクル151（Codex指摘）: 触れた 指かは その 指の できごと e で 決めるので、e も わたす
        self.assertIn("if (pageFinger(dx, dy, e)) return; /* ページを動かす指では 🤲 を運ばない */", HTML)
        self.assertIn("if (pageSlid(e)) cancelled = true;", HTML[HTML.index("function endPlatePointer(e, cancelled) {"):HTML.index("/* 振る:")])
        self.assertIn('$("bagBig").addEventListener("pointerup", (e) => { bagPage = pageSlid(e); }, true);', HTML)
        self.assertIn("if (pageSlid(e)) return; /* ページを動かした指は タップに数えない */", HTML)
        self.assertIn("if (pageSlid(e)) return; /* ページを動かした指は 🤲 の空振りに数えない */", HTML)


    # ---- サイクル151（最初の1分・見つけ役の表から）----

    def test_cycle151_mouse_and_pen_are_never_page_fingers(self):
        # サイクル150 の もどり: ホイール・キーで 少しでも 下へ 動いた 後は、たてに 動かす マウスが ぜんぶ「ページを動かす指」として 捨てられた
        # （1280×720・マウス実測: 🤲 を 50〜57回 運んでも 進まず、1袋目を 60秒で 終えられない 3回中3回 → 直した後 3回中3回 1袋目を 終える）。
        # 見分けは 触れた 指（touch）だけ。本物の pageFinger・pageSlid で 確かめる
        helpers = HTML[HTML.index("var pageScrolled = false;"):HTML.index("/* 指の動きはどれも止まらないように")]
        self._node150("""
const assert = require('node:assert/strict');
const doc = {}, win = {};
const document = { addEventListener(t, f) { (doc[t] = doc[t] || []).push(f); } }, window = { addEventListener(t, f) { (win[t] = win[t] || []).push(f); } };
""" + helpers + """
const fire = (type, id, x, y, kind) => { const e = { type, pointerId:id, clientX:x, clientY:y, pointerType:kind, buttons:1 }; (doc[type] || []).forEach(f => f(e)); return e; };
pageScrolled = true;   // ホイールで 100px 下へ
for (const kind of ['mouse', 'pen']) {
  const d = fire('pointerdown', 1, 100, 100, kind);
  assert.equal(pageFinger(0, 1, d), false, kind);           // 置いたまま待つ所作（朱肉の ぎゅっ・にぎる）も 時計を始める
  const e = fire('pointermove', 1, 102, 160, kind);
  assert.equal(pageFinger(2, 60, e), false, kind);          // 🤲 を 顔へ・等級を 上へ・はんこを 下へ 動かせる
  assert.equal(pageSlid(e), false, kind);                   // 離した時も 所作に 数える
  (win.pointerup || []).forEach(f => f(e));
}
// 触れた 指は サイクル150 のまま: 説明を読んでいる間の たての指は ページを動かす
const d2 = fire('pointerdown', 2, 100, 100, 'touch');
assert.equal(pageFinger(0, 1, d2), true);
const e2 = fire('pointermove', 2, 102, 160, 'touch');
assert.equal(pageSlid(e2), true);
assert.equal(pageFinger(30, 4, e2), false);                 // よこの 指は 今までどおり
pageScrolled = false; assert.equal(pageFinger(0, 60, e2), false);
""")
        # たての所作・置いたまま待つ所作の 見分けは どれも pageFinger を 通る（pageScrolled を じかに 見る所を 残さない）
        self.assertEqual(HTML.count("pageScrolled"), 3)   # 決める所（var）・pageFinger・syncScrolled
        self.assertIn('return !!e && e.pointerType === "touch";', HTML)
        self.assertNotIn("pageTouch", HTML)   # 最後に 押された 機械を 1つの 旗に 覚えない（Codex指摘）
        self.assertIn("if (!drag || pageFinger(0, e.clientY - drag.y, e)) return;", HTML)
        self.assertEqual(HTML.count("if (!pageFinger(0, 1, e)) h.timer = setTimeout("), 2)   # 朱肉・にぎる
        # pageFinger は どこでも その 指の できごと e と いっしょに 呼ぶ
        calls = re.findall(r"pageFinger\(((?:[^()]|\([^()]*\))*)\)", HTML[HTML.index("var pageScrolled = false;"):])
        self.assertTrue(len(calls) >= 12)
        for c in calls:
            self.assertTrue(c.endswith(", e") or c == "dx, dy, e" or c == "0, …, e", c)

    @staticmethod
    def _set_timeouts(src):
        # setTimeout( … ) を かっこの 対で 切り出し、(コールバック, 待ち) に 分ける
        out, i = [], 0
        while True:
            i = src.find("setTimeout(", i)
            if i < 0:
                return out
            j, depth, comma, quote = i + len("setTimeout("), 1, None, None
            while depth:
                c = src[j]
                if quote:
                    if c == "\\":
                        j += 1
                    elif c == quote:
                        quote = None
                elif c in "\"'`":
                    quote = c
                elif c in "([{":
                    depth += 1
                elif c in ")]}":
                    depth -= 1
                elif c == "," and depth == 1:
                    comma = j
                j += 1
            args = src[i + len("setTimeout("):j - 1]
            if comma is not None:
                k = comma - (i + len("setTimeout("))
                out.append((args[:k], args[k + 1:].strip()))
            i = j

    def test_cycle151_reduced_motion_never_shortens_reading_or_press(self):
        # 動きを へらす 設定では motion = 0.15 が 待ちにも かかり、平均の「ちょうどいい」0.14秒・「水分が 高い！」0.26秒・「きれいに なった！」0.16秒・
        # におい・かみ心地の 答え 0.17〜0.24秒・顔が 大きく なる 0.14秒 しか 見えず、朱肉 0.04秒・にぎる 0.05秒の 押しで 付いて タップと 区別が なかった
        # （390×844実測 → 直した後 ふつうと 同じ 955・1706・1056・1109ms）。
        # きまり: motion を かけて よいのは 飾りの 動きだけ。setTimeout の 待ちに motion を かけて よいのは、下の 飾りの 合図だけ
        decoration = {
            "tick": "粒が 落ちる 動き（430ms × motion）に 合わせた 音",
            'classList.add("on"); checkSound();': "等級の 表の 点が 順に つく 飾り",
            'classList.add("wig")': "粒が 順に わらう 波",
            'token.classList.remove("squeeze")': "にぎる 手本の 形を 短く 見せる 飾り（空振り2回目）",
        }
        scaled = [(cb, d) for cb, d in self._set_timeouts(HTML) if "motion" in d]
        self.assertTrue(scaled)
        for cb, d in scaled:
            self.assertTrue(any(k in cb for k in decoration), "待ちに motion が かかっている: setTimeout(" + cb.strip()[:80] + ", " + d + ")")
            for scene in ("toHakaru", "showAverage", "toMiwakeru", "toSense", "toKimeru", "senseDone", "inkDone", "resetZoomForSmiles", '"big"', "cookedSound", "goNext", "leaveBag"):
                self.assertNotIn(scene, cb, d)
        # 読む間・ほめる間は READ_MS の 表から。押す 長さの しきいも motion を かけない
        for call in ("setTimeout(toHakaru, READ_MS.zarazara);", "setTimeout(showAverage, READ_MS.lastMeasure);",
                     "setTimeout(toMiwakeru, high ? READ_MS.averageHigh : READ_MS.average);", "}, READ_MS.cleanSmile);",
                     "setTimeout(toSense, READ_MS.clean);", 'setTimeout(() => $("face").classList.remove("big"), READ_MS.faceBig);',
                     "setTimeout(toKimeru, READ_MS.senseRead);", "cookedSound(); }, READ_MS.chip)"):
            self.assertIn(call, HTML)
        self.assertIsNone(re.search(r"(READ_MS(\.\w+)?|INK_MS|NIGIRU_MS)\s*\)?\s*\*", HTML))
        self.assertIsNone(re.search(r"\*\s*\(?\s*(READ_MS|INK_MS|NIGIRU_MS)", HTML))
        # 表の 数は 動きを へらしても 変わらない（ふつうの 長さ そのもの）
        block = HTML[HTML.index("const READ_MS"):HTML.index("});", HTML.index("const READ_MS")) + 3]
        self.assertNotIn("motion", block)
        self._node150("""
const assert = require('node:assert/strict');
""" + block + """
assert.deepEqual(READ_MS, { zarazara:560, lastMeasure:240, average:950, averageHigh:1700, cleanSmile:300, clean:1050, faceBig:900, senseRead:1100, chip:320 });
assert.ok(Object.isFrozen(READ_MS));
""")

    def test_cycle151_next_guard_only_for_auto_stamps_and_tap_bursts(self):
        # サイクル150 の NEXT_GUARD（0.9秒）は、自分で はんこを 下ろした すばやい人の すなおな 1回目も 流さなかった
        # （4つの 画面の 大きさ 実測: 出て 0.35〜0.86秒の タップ 59回中27回 → 直した後 0回）。
        # 守るのは ひとりでに 押された 時（3回目の タップ・Enter）と、タップの 連打（前の タップから 0.5秒より 早い）だけ
        fn = HTML[HTML.index("function leaveBag() {"):HTML.index('nextBtn.addEventListener("click",')]
        self.assertIn("const NEXT_BURST = 500;", fn)
        self._node150("""
const assert = require('node:assert/strict');
const motion = 1; let leaving = false, step = 4, stamped = true, now = 0, nudges = 0, leaves = 0;
globalThis.performance = { now: () => now };
const on = {}; const nextBtn = { addEventListener(t, f) { on[t] = f; } };
const docOn = {}; const document = { addEventListener(t, f) { docOn[t] = f; } }, window = { addEventListener() {} };
const bagBig = { style:{ transform:'' }, animate() { leaves++; return { cancel() {} }; } };
const $ = () => bagBig;
const stopSwipeDemo = () => {}, bagSound = () => {}, swipeNudge = () => { nudges++; }, goNext = () => {};
""" + fn + """
const ev = (id, x = 200, y = 700) => ({ pointerId:id, clientX:x, clientY:y });
const press = (id, ms, onBtn) => { const e = ev(id); docOn.pointerdown(e); if (onBtn) on.pointerdown(e); now += ms; docOn.pointerup(e); if (onBtn) on.pointerup(e); };
const fresh = () => { leaving = false; stamped = true; step = 4; };
// 自分で はんこを 下ろした（nextAuto = false）後、ボタンが 出て 0.4秒の 1回目の タップ: そのまま 流れる
now = 10000; docOn.pointerdown(ev(1)); now += 260; docOn.pointermove && docOn.pointermove(ev(1)); docOn.pointerup(ev(1, 200, 760));   // 下ろす 指（動いた 指は タップに 数えない）
nextAuto = false; nextShownAt = now; now += 400; press(2, 70, true);
assert.equal(leaves, 1); assert.equal(nudges, 0);
// ひとりでに 押された（3回目の タップ）後は、ゆっくりの タップ（間 0.8秒）でも 0.9秒までは 流す空振りへ（サイクル150 の 守り）
fresh(); now = 20000; nextAuto = true; nextShownAt = now; now += 800; press(3, 70, true);
assert.equal(leaves, 1); assert.equal(nudges, 1);
now = 20000 + 950; press(4, 70, true); assert.equal(leaves, 2);
// タップの 連打: 前の タップから 0.5秒より 早い 指は、自分で 押した 後でも 流す空振りへ
fresh(); now = 30000; nextAuto = false; nextShownAt = now; press(5, 70, false); now += 200; press(6, 70, true);
assert.equal(leaves, 2); assert.equal(nudges, 2);
// 連打が とぎれた（前の タップから 0.5秒より あと）指は 流れる
now += 600; press(7, 70, true); assert.equal(leaves, 3);
""")
        stamp = HTML[HTML.index("function stampNow() {"):HTML.index("function dropHanko() {")]
        self.assertIn("nextAuto = false;", stamp)
        drop = HTML[HTML.index("function dropHanko() {"):HTML.index('$("bagBig").addEventListener("pointerdown",')]
        self.assertIn(".onfinish = () => { const was = stamped; stampNow(); if (!was && stamped) nextAuto = true; };", drop)

    def test_cycle151_face_never_stays_blank_and_broken_photos_hide(self):
        # 顔の 絵（face_dot.webp）が 読めない・来ない と、検査員の 顔は 中身の ない 丸の まま だった（6回中6回・12.5秒で 絵の 点 0）。
        # 写真が 読めないと こわれた 絵の しるしと はみ出す 説明の 字が ずっと 出ていた。
        face = HTML[HTML.index('const faceCtx = $("face").getContext("2d");'):HTML.index("/* 進行 */")]
        self._node150("""
const assert = require('node:assert/strict');
const motion = 1; let now = 0; const timers = [], frames = [];
globalThis.performance = { now: () => now };
const setTimeout = (f, ms) => { timers.push([ms, f]); return timers.length; }, clearTimeout = () => {};
const requestAnimationFrame = f => frames.push(f);
const mkCtx = () => ({ draws:[], alpha:[], set globalAlpha(v) { this.alpha.push(v); }, clearRect() { this.draws = []; }, drawImage(src) { this.draws.push(src); }, fillRect() {}, getImageData() { return { data:[1, 2, 3, 255] }; } });
const faceCanvas = { ctx:mkCtx(), getContext() { return this.ctx; }, classList:{ toggle() {} } };
const $ = id => faceCanvas;
const photo = { dataset:{ src:'kensa/kokusashi.webp' }, style:{}, on:{}, addEventListener(t, f) { this.on[t] = f; }, removeAttribute() {} };
const document = { createElement() { return { kind:'fallback', getContext() { return mkCtx(); } }; }, querySelectorAll() { return [photo]; } };
class Image { constructor() { this.on = {}; this.complete = false; this.naturalWidth = 0; globalThis.img = this; } addEventListener(t, f) { (this.on[t] = this.on[t] || []).push(f); } }
""" + face + """
const ctx = faceCanvas.ctx;
assert.equal(ctx.draws.length, 0);
// 2.5秒 たっても 来ない: かわりの 顔
timers.filter(([ms]) => ms === 2500).forEach(([, f]) => f());
assert.equal(ctx.draws.length, 1); assert.equal(ctx.draws[0].kind, 'fallback');
setFace('happy'); assert.equal(ctx.draws[0].kind, 'fallback');   // 表情も かさなる
// おくれて 本物が 来た: ぱっと 切りかえず 重ねかえる
img.complete = true; img.naturalWidth = 256; img.onload();
assert.equal(faceFade, 0); assert.deepEqual(ctx.draws.map(d => d.kind || 'real'), ['fallback', 'real']);
now = 200; frames.shift()(); assert.ok(faceFade > 0.4 && faceFade < 0.6);
now = 400; frames.shift()(); assert.equal(faceFade, 1); assert.deepEqual(ctx.draws.map(d => d.kind || 'real'), ['real']);
// 写真: 読めなければ かくす（場所は そのまま）
loadPhotos(); photo.on.error(); assert.equal(photo.style.visibility, 'hidden');
""")
        self.assertIn('faceImg.addEventListener("error", () => {\n  showFaceFallback();', face)
        self.assertIn("setTimeout(showFaceFallback, 2500);", face)


    def test_cycle151_codex_touch_is_judged_per_pointer_not_by_the_last_device(self):
        # Codex指摘: 「触れた 指か」を 最後に 押された 機械の 旗 1つで 決めていた。説明を読んでいる間に 指を ふくろに 置いたまま
        # マウスを ほかの 所で 押すと、その 指の たての 動き（18px）が「ページの 指」で なくなり 朱肉が 付いた。逆の 順では
        # マウスの ドラッグが 指として 捨てられた。どちらの 順でも、その 指の できごと e で 決める
        helpers = HTML[HTML.index("var pageScrolled = false;"):HTML.index("/* 指の動きはどれも止まらないように")]
        fn = HTML[HTML.index('$("bagBig").addEventListener("pointerdown",'):HTML.index('$("bagBig").addEventListener("click",')]
        world = self._hanko_world().replace(
            "let pageScrolled = false; const pageFinger = (dx, dy) => pageScrolled && Math.abs(dy) >= Math.abs(dx); const slid = new Set(), pageSlid = (e) => !!e && slid.has(e.pointerId);\n",
            "const doc = {}, win = {}; const document = { hidden:false, addEventListener(t, f) { (doc[t] = doc[t] || []).push(f); } }, window = { addEventListener(t, f) { (win[t] = win[t] || []).push(f); } };\n")
        self.assertNotEqual(world, self._hanko_world())
        self._node150(world + helpers + fn + """
const ev = (id, kind, x, y) => ({ pointerId:id, pointerType:kind, clientX:x, clientY:y, buttons:1 });
const send = (type, e, toBag) => { (doc[type] || []).forEach(f => f(e)); if (toBag) { if (cap[type]) cap[type](e); if (on[type]) on[type](e); } (win[type] || []).forEach(f => f(e)); };
pageScrolled = true;   // 説明を 読んでいる間
// 順1: 指を ふくろに 置く → マウスを ほかの 所で 押す → 指を 下へ 18px 以上 → 朱肉は 付かない（ページを 動かす 指）
send('pointerdown', ev(1, 'touch', 100, 100), true);
assert.equal(inkHold.timer, undefined);                 // 置いたまま待つ 時計も 始めない
send('pointerdown', ev(2, 'mouse', 300, 40), false);
for (const y of [106, 112, 120, 130]) send('pointermove', ev(1, 'touch', 100, y), true);
assert.equal(inks, 0); assert.equal(inked, false);
send('pointercancel', ev(1, 'touch', 100, 130), true); send('pointerup', ev(2, 'mouse', 300, 40), false);
assert.equal(inked, false); assert.equal(hankoTaps, 0);
// 順2: 指を ほかの 所に 置く → マウスで ふくろを 押し下げる → 朱肉が 付く（マウスは ページを 動かさない）
send('pointerdown', ev(3, 'touch', 300, 40), false);
send('pointerdown', ev(4, 'mouse', 100, 100), true);
assert.notEqual(inkHold.timer, undefined);              // マウスの 置いたまま待つ 時計は 始まる
for (const y of [106, 112, 120]) send('pointermove', ev(4, 'mouse', 100, y), true);
assert.equal(inks, 1); assert.equal(inked, true);
send('pointerup', ev(4, 'mouse', 100, 120), true); send('pointerup', ev(3, 'touch', 300, 40), false);
assert.equal(pageDowns.size, 0);
// 離した 知らせが 来ないまま 画面を 離れた 指は 残さない
send('pointerdown', ev(5, 'touch', 10, 10), false); assert.equal(pageDowns.size, 1);
(win.blur || []).forEach(f => f()); assert.equal(pageDowns.size, 0);
""")
        # 連打の 記録（つぎの ふくろ）も 指ごとで、離した 知らせが 来ない 指は 画面を 離れた 時に 消す
        nxt = HTML[HTML.index("const tapDowns = new Map();"):HTML.index('nextBtn.addEventListener("pointerdown",')]
        self.assertIn('window.addEventListener("blur", () => { tapDowns.clear(); });', nxt)
        self.assertIn("if (document.hidden) tapDowns.clear();", nxt)


    # ---- サイクル152（最初の1分・見つけ役の表から）----

    def _world152(self):
        """本物の 指の 見分け（helpers）・ふくろ・水分計 を 読みこむ。document・window の 聞き手は 集めて 自分で 呼ぶ"""
        helpers = HTML[HTML.index("var pageScrolled = false;"):HTML.index("/* 指の動きはどれも止まらないように")]
        bag = HTML[HTML.index("const bagPts = new Map(), meterPts = new Map();"):HTML.index('$("bagBtn").addEventListener("click",')]
        meter = HTML[HTML.index("function crankPointer(e) {"):HTML.index('$("meterBtn").addEventListener("click",')]
        return """
const assert = require('node:assert/strict');
const NUDGE_LIMIT = 3, motion = 1;
let step = 0, bagTaps = 0, probeAttract = null, autos = 0, nudges = 0, measured = 0, lotIndex = 0, crankAngle = 0, crankTurned = 0, crankDrag = null, meterTaps = 0, crankDemo = null;
let finePointer = true;
const LOT = { moisture:[14.1, 14.2, 14.3] };
const P = { x:205, rest:205, inAt:166, inX:74, y:50, inserted:false, done:false, drag:null, auto:false };
const doc = {}, win = {}, on = { bag:{}, meter:{} };
const document = { hidden:false, addEventListener(t, f) { (doc[t] = doc[t] || []).push(f); } }, window = { addEventListener(t, f) { (win[t] = win[t] || []).push(f); } };
const scene = k => ({ addEventListener(t, f) { on[k][t] = f; } });
const els = { sceneBag:scene('bag'), sceneMeter:scene('meter'), poke:{ style:{} }, probe:{ animate() { return {}; } },
  crank:{ getBoundingClientRect: () => ({ left:260, top:60, width:100, height:100 }) }, crankArm:{ style:{}, animate() {} }, lcd:{} };
const $ = id => els[id];
const capture = () => {}, stopPullDemo = () => {}, stopProbeAttract = () => {}, stabPoke = () => {}, probeDemoSound = () => {}, guideOff = () => {}, guideAt = () => {}, crankSound = () => {};
const moveProbe = x => { P.x = x; if (x <= P.inAt) P.inserted = true; };
const autoProbe = () => { autos++; }, pullNudge = () => { nudges++; }, takeReading = () => { measured++; };
""" + helpers + bag + meter + """
const send = (k, type, e) => { (doc[type] || []).forEach(f => f(e)); if (on[k][type]) on[k][type](e); (win[type] || []).forEach(f => f(e)); };
const ev = (id, x, y, kind, buttons) => ({ type:'', pointerId:id, clientX:x, clientY:y, pointerType:kind || 'touch', buttons:buttons === undefined ? 1 : buttons });
const crankAt = (a) => [310 + 33 * Math.cos(a), 110 + 33 * Math.sin(a)];
"""

    def test_cycle152_fingers_left_when_the_page_hides_are_dropped(self):
        # 動かして いる とちゅうで 画面が かくれ、取り消しが 来なかった 指が 場面に 残り、もどって 新しい 指で なぞっても
        # 穀刺し 0px（96px なぞって）・水分計 0回（458°）・皿は 20px で ×1.14 に 寄った（指の まねの できごとで 3回中3回 → 直した後 動く・3回・寄らない）。
        # 画面が かくれた・前面で なくなった 時は、場面ごとの 取り消しと 同じ 片づけを 1か所（dropFingers）で 行う
        hide = [l for l in HTML.split("\n") if re.match(r'(window|document)\.addEventListener\("(blur|visibilitychange)",', l)
                and "pageDowns" not in l and "tapDowns" not in l and "demoDown" not in l and "idleVisibility" not in l]   # 手が 止まった 時計（サイクル153）は 指では ない
        m = re.search(r"\nfunction dropFingers\(\) \{[\s\S]*?\n\}", HTML)
        body = (m.group(0) if m else "") + "\n" + "\n".join(hide)
        self._node150(self._world152() + """
var pts = new Map(), plateEnds = [], senseDrag = null, senseHold = null, inkHold = null, inkDrag = null, hankoDrag = null, bagSwipe = null, nextPress = null, offDown = null;
var endPlatePointer = (e, cancelled) => { plateEnds.push([e.pointerId, cancelled]); pts.delete(e.pointerId); }, endToken = () => {}, cancelHanko = () => {};
""" + body + """
const hideShow = () => { document.hidden = true; (doc.visibilitychange || []).forEach(f => f()); document.hidden = false; (doc.visibilitychange || []).forEach(f => f()); };
// さす: 動かして いた 指（11）が 残った まま かくれる → もどって 新しい 指（12）で 96px なぞる
send('bag', 'pointerdown', ev(11, 300, 100)); for (let i = 1; i <= 6; i++) send('bag', 'pointermove', ev(11, 300 - i * 6, 100));
assert.equal(P.drag.id, 11); assert.equal(P.drag.moved, true);
hideShow();
const x0 = P.x;
send('bag', 'pointerdown', ev(12, 300, 104)); for (let i = 1; i <= 16; i++) send('bag', 'pointermove', ev(12, 300 - i * 6, 104));
assert.ok(P.x < x0 - 40, 'さす: 新しい 指で 穀刺しが 動かない ' + x0 + ' -> ' + P.x);
send('bag', 'pointerup', ev(12, 204, 104));
// 水分計: 回して いた 指（21）が 残った まま かくれる → もどって 新しい 指（22）で 1まわり 余り
step = 1; let q = crankAt(0); send('meter', 'pointerdown', ev(21, q[0], q[1])); for (let i = 1; i <= 6; i++) { q = crankAt(i * 0.15); send('meter', 'pointermove', ev(21, q[0], q[1])); }
hideShow();
const m0 = measured;
q = crankAt(0); send('meter', 'pointerdown', ev(22, q[0], q[1])); for (let i = 1; i <= 40; i++) { q = crankAt(i * 0.2); send('meter', 'pointermove', ev(22, q[0], q[1])); }
assert.ok(measured - m0 >= 1, '水分計: 458° 回して はかれた 回数 ' + (measured - m0));
send('meter', 'pointerup', ev(22, q[0], q[1]));
// 皿: 置いた まま の 指は、取り消しと 同じ 関数（endPlatePointer の 取り消し）で 片づく。前面で なくなった 時（blur）も 同じ
pts.set(31, { x:100, y:100 }); hideShow(); assert.deepEqual(plateEnds, [[31, true]]);
pts.set(32, { x:100, y:100 }); (win.blur || []).forEach(f => f()); assert.deepEqual(plateEnds, [[31, true], [32, true]]);
""")
        # 場面の 取り消しも 同じ 関数を 呼ぶ（ずれない）
        self.assertIn('$("sceneBag").addEventListener("pointercancel", (e) => cancelBagPointer(e.pointerId));', HTML)
        self.assertIn('$("sceneMeter").addEventListener("pointercancel", (e) => cancelMeterPointer(e.pointerId));', HTML)
        self.assertIn("plate.addEventListener(\"pointercancel\", (e) => endPlatePointer(e, true));", HTML)
        drop = m.group(0) if m else ""
        for part in ("cancelBagPointer", "cancelMeterPointer", 'endPlatePointer({ type:"pointercancel", pointerId:id }, true)', 'endToken({ type:"pointercancel" })', "cancelHanko()"):
            self.assertIn(part, drop)

    def test_cycle152_pen_hover_does_nothing_and_pen_contact_drags(self):
        # ペンを 浮かせた まま 動かすと（buttons 0）、水分計を 1まわり なぞるだけで 3回 はかれ、穀刺しが すべり、
        # その あとの ペンの タップは タップに 数えられなかった（820×1180・ペン実測 3回中3回: 3回・149px・0 → 0回・0px・1）
        self._node150(self._world152() + """
// 水分計: 浮かせた ペンで 1まわり 余り → はからない・回さない
step = 1; let q;
for (let i = 0; i <= 40; i++) { q = crankAt(i * 0.2); send('meter', 'pointermove', ev(7, q[0], q[1], 'pen', 0)); }
assert.equal(measured, 0, '浮かせた ペンで はかれた'); assert.equal(crankTurned, 0);
// その あとの ペンの タップは タップに 数える
q = crankAt(0); send('meter', 'pointerdown', ev(7, q[0], q[1], 'pen')); send('meter', 'pointerup', ev(7, q[0], q[1], 'pen', 0));
assert.equal(meterTaps, 1, 'ホバーの 後の ペンの タップが 数えられない');
// さわって いる ペンは マウスの ドラッグと 同じに 回せる
q = crankAt(0); send('meter', 'pointerdown', ev(8, q[0], q[1], 'pen')); for (let i = 1; i <= 40; i++) { q = crankAt(i * 0.2); send('meter', 'pointermove', ev(8, q[0], q[1], 'pen', 1)); }
assert.ok(measured >= 1); send('meter', 'pointerup', ev(8, q[0], q[1], 'pen', 0));
// 穀刺し: 浮かせた ペンで 20回 動かしても すべらない
step = 0; const x0 = P.x;
for (let i = 1; i <= 20; i++) send('bag', 'pointermove', ev(9, 300 - i * 5, 100, 'pen', 0));
assert.equal(P.x, x0, '浮かせた ペンで 穀刺しが すべった'); assert.equal(P.drag, null);
// さわって いる ペンでは 押せる
send('bag', 'pointerdown', ev(10, 300, 100, 'pen')); for (let i = 1; i <= 10; i++) send('bag', 'pointermove', ev(10, 300 - i * 5, 100, 'pen', 1));
assert.ok(P.x < x0 - 30); send('bag', 'pointerup', ev(10, 250, 100, 'pen', 0));
// 指（touch）は 今までどおり
""")
        self.assertIn("if (step !== 1 || measured >= LOT.moisture.length || !inContact(e)) return;", HTML)

    def test_cycle152_scroll_keys_keep_the_game_on_screen(self):
        # ゲームの 間に ↓・PageDown・スペース・End を 押すと ページが 説明へ 動き、ゲームが 画面から 出ていった
        # （390×844 キーボード実測: 5回中5回、PageDown 738px・↓ 40px・End 1999px → 直した後 0px）
        keys = HTML[HTML.index('document.addEventListener("pointerdown", (e) => {\n  if (!e.target.closest || !e.target.closest("#idleCard")) dismissIdleCard();'):HTML.index('likeBtn.addEventListener("click",')]
        self._node150("""
const assert = require('node:assert/strict');
const cls = new Set(), doc = {};
const app = { id:'app' }, notes = { id:'notes' };
const el = (inside, tag) => ({ tagName:tag, closest(sel) { return sel.split(',').map(s => s.trim()).includes('#' + inside.id) ? inside : null; } });
const body = { tagName:'BODY', closest() { return null; } };
const document = { body, documentElement:{ classList:{ contains: c => cls.has(c) } }, addEventListener(t, f) { doc[t] = f; } };
let keyUser = false; const dismissIdleCard = () => {}, armIdle = () => {};
""" + keys + """
const press = (key, target, mods) => { let held = false; doc.keydown(Object.assign({ key, target, preventDefault() { held = true; } }, mods || {})); return held; };
for (const k of ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ']) assert.equal(press(k, body), true, k + ' で ページが 動く');
const gameBtn = el(app, 'BUTTON');
assert.equal(press('ArrowDown', gameBtn), true);                 // ゲームの ボタンに フォーカスが あっても ↓ で ページは 動かない
assert.equal(press(' ', gameBtn), false);                         // ボタンの スペース（押す）は そのまま
assert.equal(press('Enter', gameBtn), false); assert.equal(press('Tab', gameBtn), false);
assert.equal(press('End', body, { ctrlKey:true }), false);        // 組み合わせは ブラウザの まま
assert.equal(press('PageDown', el(notes, 'A')), false);           // 説明の 中は そのまま
cls.add('scrolled');                                              // 📖 で 説明を 読んで いる 間は そのまま
for (const k of ['ArrowDown', 'PageDown', ' ', 'Home']) assert.equal(press(k, body), false, k);
assert.equal(keyUser, true);
""")

    def test_cycle152_zoom_hint_follows_the_last_pointer(self):
        # タッチの 画面で マウス・ペンを 使う 人にも 2袋目から「ふたゆびで ズーム」と 出ていた（読みこみの 時の 見立てのまま・2回中2回）
        helpers = HTML[HTML.index("var pageScrolled = false;"):HTML.index("/* 指の動きはどれも止まらないように")]
        self._node150("""
const assert = require('node:assert/strict');
let finePointer = false;   // タッチが 主の 端末
const doc = {}; const document = { addEventListener(t, f) { (doc[t] = doc[t] || []).push(f); } }, window = { addEventListener() {} };
""" + helpers + """
const down = kind => (doc.pointerdown || []).forEach(f => f({ pointerId:1, clientX:0, clientY:0, pointerType:kind }));
down('mouse'); assert.equal(finePointer, true, 'マウスで 押しても ふたゆびの 案内のまま');
down('touch'); assert.equal(finePointer, false);
down('pen'); assert.equal(finePointer, true);
""")
        self.assertIn('if (finePointer) { hint.textContent = "🔍 で 寄る"; guideAt("press", zoomBtn); }', HTML)


    # ---- サイクル153（最初の1分・おそい スマホ・かくれた 画面）----

    def test_cycle153_grain_push_runs_on_time_not_frames(self):
        # 粒の 押し合いは 1コマ 1歩 だったので、なでてから「つまむ」の 案内まで 60コマ/秒 で 1.26秒 → 5コマ/秒 で 4.69秒（仮の 時計の 実測）。
        # 1歩 = 1/60秒 で、たまった 時間の ぶん 進める。60コマ/秒 では 1コマ 1歩の まま。1コマで 進むのは 0.25秒 まで
        sim = HTML[HTML.index("let simOn = false, lastBrushSound = 0;"):HTML.index("function grainAt(p)")]
        self._node150("""
const assert = require('node:assert/strict');
let now = 0, frames = [];
globalThis.performance = { now: () => now };
const requestAnimationFrame = f => frames.push(f);
const GW = 30, PW = 358, PH = 452; let spread = false, grains = [];
const renderGrain = () => {}, checkSpread = () => {}, tick = () => {};
""" + sim + """
const fresh = () => { grains = []; for (let i = 0; i < 12; i++) grains.push({ x:PW / 2 + (i % 4) * 3, y:PH / 2 + Math.floor(i / 4) * 3, r:0, gone:false, awake:0 }); };
// なでて 起こした 山が 落ちつくまでの 本当の 秒（コマの 間 ms ごと）
const settle = (ms) => { fresh(); frames = []; simOn = false; now = 0; grains[0].awake = 16; startSim(); let n = 0;
  while (frames.length && n < 5000) { now += ms; const f = frames.shift(); f(now); n++; } return n * ms; };
const t60 = settle(1000 / 60), t10 = settle(100), t5 = settle(200);
assert.ok(t10 <= t60 + 200, '10コマ/秒 で ' + t10 + 'ms（60コマ/秒 は ' + Math.round(t60) + 'ms）');
assert.ok(t5 <= t60 + 400, '5コマ/秒 で ' + t5 + 'ms（60コマ/秒 は ' + Math.round(t60) + 'ms）');
// 60コマ/秒 では 1コマ 1歩（起きている 長さが 1ずつ へる）
fresh(); frames = []; simOn = false; now = 0; grains.forEach(g => { g.x += g.y; g.y *= 3; }); grains[0].awake = 100; startSim();
for (let i = 1; i <= 30; i++) { now += 1000 / 60; frames.shift()(now); assert.equal(grains[0].awake, 100 - i); }
// 画面が かくれて 60秒 後の 1コマでも、進むのは 0.25秒（15歩）まで
now += 60000; frames.shift()(now); assert.equal(grains[0].awake, 100 - 30 - 15);
""")

    def test_cycle153_idle_clock_stops_while_the_page_is_hidden(self):
        # 手が 止まった 時の カード（45秒）は、かくれて いる 間も 数えて いた。開いて 2秒で ほかの アプリへ 行き 50秒 後に もどると、
        # 遊んで いないのに もう 出ていた（仮の 時計で 2回中2回 → 直した後 0回）。かくれて いる 間は 止め、もどったら のこりから
        idle = HTML[HTML.index("const IDLE_MS = 45000"):HTML.index("/* 遊んで いる 間の 動かす キー")]
        self._node150("""
const assert = require('node:assert/strict');
let now = 0, timers = [], seq = 0;
globalThis.performance = { now: () => now }; Date.now = () => now;
const setTimeout = (f, ms) => { const id = ++seq; timers.push({ id, at:now + ms, f }); return id; }, clearTimeout = id => { timers = timers.filter(t => t.id !== id); };
const advance = ms => { const end = now + ms; for (;;) { timers.sort((a, b) => a.at - b.at); const t = timers[0]; if (!t || t.at > end) break; timers.shift(); now = t.at; t.f(); } now = end; };
const cls = new Set(); const idleCard = { inert:true, classList:{ add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) } };
const likeBtn = { addEventListener() {} }, returnLink = { addEventListener() {} };
const $ = id => ({ idleCard, likeBtn, returnLink })[id];
const listeners = {}; const document = { hidden:false, addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); } };
const sessionStorage = { getItem() { return null; } }; const idleSound = () => {}, idleOutSound = () => {};
const vis = hidden => { document.hidden = hidden; (listeners.visibilitychange || []).forEach(f => f()); };
""" + idle + """
armIdle(); advance(2000);
vis(true); advance(50000); vis(false);
assert.equal(cls.has('on'), false, '50秒 かくれて もどったら もう カードが 出ていた');
advance(42900); assert.equal(cls.has('on'), false);
advance(200); assert.equal(cls.has('on'), true);                 // 見えて いる 間の 合計 45秒で 出る（長さは 同じ）
// もどって さわれば 今までどおり 45秒から
cls.delete('on'); armIdle(); vis(true); advance(10000); vis(false); advance(44900); assert.equal(cls.has('on'), false); advance(200); assert.equal(cls.has('on'), true);
""")


    def test_cycle153_picking_without_zoom_switches_the_hint(self):
        # 2袋目から、寄らずに わるい粒を つまめた 後も 案内が「🔍 ふたゆびで ズーム」の まま、ふたゆびの 手本も 出つづけた
        # （390×844実測: つまんだ 後 4秒 3回中3回 ズームの 案内のまま・ふたゆびの 手本 27回中14回 → 0回・0回）。
        # 寄らずに 1粒 つまめたら、今 ある「わるい粒を つまむ」へ。ふたゆびの 手本は 出さない。1袋目と、寄った 人は 今までどおり
        tap = HTML[HTML.index("function tapGrain(g) {"):HTML.index("function resetZoomForSmiles()")]
        sort = HTML[HTML.index("function updateSortHint() {"):HTML.index("function armHint(ms) {")]
        demo = HTML[HTML.index("function demoShow(k) {"):HTML.index("function demoTick(")]
        self._node150("""
const assert = require('node:assert/strict');
let step = 2, lotIndex = 1, badLeft = 2, spread = true, everZoomed = false, pickedBare = false, isNear = false, demoAt = 0, demoHard = 0, hintTimer = null, sortDrag = null, pinch = null;
const finePointer = false, motion = 1, GW = 30, GH = 18, DEMO_LOOK = 2000, Z = { s:1, tx:0, ty:0 }, READ_MS = { cleanSmile:300, clean:1050 };
const hint = { textContent:'' }, zoomBtn = { id:'zoomBtn' }, pts = new Map(), pickedKinds = { higai:0, shini:0 };
const guides = []; let guideOn = false;
const guideAt = (kind, el) => { guideOn = true; guides.push(kind); }, guideOff = () => { guideOn = false; }, armHint = () => {};
const rect = { left:0, top:0, right:300, bottom:300, width:20, height:20 };
const plate = { getBoundingClientRect: () => rect };
const anim = () => ({});
const elm = () => ({ style:{}, getBoundingClientRect: () => rect, animate: anim, appendChild() {}, remove() {} });
const $ = id => elm(); const document = { createElement: elm, body:{ appendChild() {} } };
const performance = { now: () => 0 }; const setTimeout = () => {}, clearTimeout = () => {};
const tick = () => {}, grainSprite = () => '', demoHide = () => {}, updateGrainRecord = () => {}, grainDrop = () => {}, setFace = () => {}, toSense = () => {};
const firstBagFace = () => false, guideSense = () => {}, lotGrade = () => 0, stabPoke = () => {}, pullPoke = () => {}, syncPokeToAttract = () => {}, pilePoint = () => ({});
const mk = kind => ({ kind, gone:false, r:0, el:{ getBoundingClientRect: () => rect, hidden:false, disabled:false }, img:{ classList:{ add() {}, remove() {}, contains: () => false } } });
const grains = [mk('higai'), mk('shini'), mk('seiryu')];
""" + tap + sort + demo + """
updateSortHint();
assert.equal(hint.textContent, '🔍 ふたゆびで ズーム'); assert.equal(guides.at(-1), 'pinch');   // 2袋目の はじめは 今までどおり
tapGrain(grains[0]);                                               // 寄らずに 1粒 つまむ
assert.equal(hint.textContent, 'わるい粒を つまむ', 'つまめた 後も ' + hint.textContent);
assert.equal(guideOn, false);
const before = guides.length; demoShow('pick');                    // 止まった 時の 手本: ふたゆびは 出さない
assert.ok(!guides.slice(before).includes('pinch'), 'ふたゆびの 手本が また 出た');
updateSortHint(); assert.equal(hint.textContent, 'わるい粒を つまむ');   // ほかの 所から 呼ばれても もどらない
// 1袋目は 今までどおり（寄る 案内は もともと 出さない）
lotIndex = 0; pickedBare = false; badLeft = 2; grains.forEach(g => { g.gone = false; }); updateSortHint(); assert.equal(hint.textContent, 'わるい粒を つまむ');
// 寄った 人は 今までどおり 🔍 を さす 手本
lotIndex = 1; everZoomed = true; pickedBare = false; const b2 = guides.length; demoShow('pick'); assert.deepEqual(guides.slice(b2), ['press']);
""")
        self.assertIn("pickedBare = false; stamped = false;", HTML[HTML.index("function startLot()"):HTML.index("/* 皿の粒:")])   # 袋ごとに 数え直す


    def _idle153(self, body, hidden_at_load=False):
        idle = HTML[HTML.index("const IDLE_MS = 45000"):HTML.index('returnLink.addEventListener("click",')]
        self._node150("""
const assert = require('node:assert/strict');
let now = 0, timers = [], seq = 0;
globalThis.performance = { now: () => now }; Date.now = () => now;
const setTimeout = (f, ms) => { const id = ++seq; timers.push({ id, at:now + ms, f }); return id; }, clearTimeout = id => { timers = timers.filter(t => t.id !== id); };
const advance = ms => { const end = now + ms; for (;;) { timers.sort((a, b) => a.at - b.at); const t = timers[0]; if (!t || t.at > end) break; timers.shift(); now = t.at; t.f(); } now = end; };
const cls = new Set(); const idleCard = { inert:true, classList:{ add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) } };
const likeOn = {}; const likeBtn = { addEventListener(t, f) { likeOn[t] = f; } }, returnLink = { addEventListener() {} };
const $ = id => ({ idleCard, likeBtn, returnLink })[id];
const listeners = {}; const document = { hidden:""" + ("true" if hidden_at_load else "false") + """, body:{}, documentElement:{ classList:{ contains: () => false } }, addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); } };
const store = {}; const sessionStorage = { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } };
const fetch = () => new Promise(() => {}), navigator = {};
let keyUser = false; const idleSound = () => {}, idleOutSound = () => {}, likeSound = () => {}, likeOutSound = () => {}, setFace = () => {};
const vis = hidden => { document.hidden = hidden; (listeners.visibilitychange || []).forEach(f => f()); };
const inCard = { closest: s => s === '#idleCard' ? idleCard : null }, onGame = { closest: () => null };
const down = target => (listeners.pointerdown || []).forEach(f => f({ target }));
""" + idle + body)

    def test_cycle153_codex_like_then_leave_does_not_bring_the_card_back_while_hidden(self):
        # 指摘1: 45秒の カードで「いいね」を 押し、0.9秒の うちに ほかの アプリへ 移ると、カードが まだ 出て いるので 時計を 止めず、
        # 押した 時の 次の 45秒が かくれた まま 進み、もどる 前に また カードが 出た。出て いる カードは そのまま、予約中の 時計は 止める
        self._idle153("""
armIdle(); advance(45000); assert.equal(cls.has('on'), true);
down(inCard); likeOn.click();                     // いいね（押した 指で 次の 45秒が 予約される）
advance(300); vis(true);                          // 0.9秒の うちに ほかの アプリへ
advance(1000); assert.equal(cls.has('on'), false); // 0.9秒で カードは 閉じる（今までどおり）
advance(60000); assert.equal(cls.has('on'), false, 'かくれて いる 間に また カードが 出た');
vis(false); advance(44000); assert.equal(cls.has('on'), false);
advance(1000); assert.equal(cls.has('on'), true);  // 見えて いる 間の 45秒で 出る（のこりは かくれる 前の 0.3秒を 引いた 44.7秒）
""")

    def test_cycle153_codex_page_loaded_in_the_background_waits_for_the_player(self):
        # 指摘2: 背景の タブで 開いた・読みこみ中に ほかの アプリへ 移った ページは、はじめの 予約が かくれた まま 45秒を 数え、
        # もどる 前に カードが 出ていた。かくれて いる 間は 時計を 走らせず、もどった 時に 45秒から 始める
        self._idle153("""
armIdle();                                        // はじめの 予約（かくれた まま）
advance(60000); assert.equal(cls.has('on'), false, '背景で 読みこまれた ページに もう カードが 出ていた');
vis(false); advance(44900); assert.equal(cls.has('on'), false);
advance(200); assert.equal(cls.has('on'), true);
// かくれて いる 間に 呼ばれた 予約（さわる・キー）も 走らない
cls.delete('on'); vis(true); armIdle(); advance(90000); assert.equal(cls.has('on'), false);
vis(false); advance(45100); assert.equal(cls.has('on'), true);
""", hidden_at_load=True)


    # ---- サイクル154（最初の1分・1袋目の 顔つきの わるい粒）----

    def test_cycle154_face_grain_wins_inside_its_picture(self):
        # 1袋目の 顔つきの わるい粒は 1.5倍で 見えるのに、当たりは 1倍の まま だった。絵の ふちを 押すと、となりの 良い粒の 当たりが 先に 取られて
        # 良い粒が ゆれる だけ（390×844実測: 絵の 中の 40点で 取れた 35 → 40。良い粒と 重なる 所だけの 38点で 取れた 12 → 38）
        fn = HTML[HTML.index("function grainAt(p) {"):HTML.index("const pts = new Map();")]
        rows = HTML[HTML.index("const GRAIN_ROWS = ["):HTML.index("];", HTML.index("const GRAIN_ROWS = [")) + 2]
        self._node150("""
const assert = require('node:assert/strict');
const GW = 36, GH = 20, Z = { s:1 }; let lotIndex = 0, spread = true;
const firstBagFace = g => lotIndex === 0 && spread && g.kind !== 'seiryu';
""" + rows + """
const LOT_LOOKS = [{ rows:GRAIN_ROWS }], LOT = { look:0 }; let faceScale = 1.5;
const getComputedStyle = el => ({ transform:el.face ? 'matrix(' + faceScale + ', 0, 0, ' + faceScale + ', 0, 0)' : 'none' });   // サイクル154: その しゅんかん 見えて いる 大きさ
const mk = (kind, x, y, z) => ({ kind, x, y, r:0, z, gone:false, el:{ hidden:false }, img:{ face:kind !== 'seiryu' } });
const good = mk('seiryu', 100, 100, 5), face = mk('shini', 125, 100, 100), grains = [good, face];
""" + fn + """
// 顔の 絵（1.5倍: 中心から よこ 27px）の 中で、良い粒の 当たりの 中でも ある 所
assert.equal(grainAt({ x:104, y:100 }), face, '顔つきの 粒の 絵の 中なのに 良い粒が 取られた');
assert.equal(grainAt({ x:150, y:100 }), face);                          // 絵の 先の はし
assert.equal(grainAt({ x:125, y:113 }), face);                          // 短い 向きの はし（15px）
assert.equal(grainAt({ x:90, y:100 }), good);                           // 絵の 外は 今までどおり 良い粒
// 2袋目から（顔なし）は 今までどおり 1倍の 当たり
lotIndex = 1; assert.equal(grainAt({ x:104, y:100 }), good);
""")

    def test_cycle154_face_grain_does_not_shrink_when_it_pulses(self):
        # 顔つきの 粒（1.5倍）に「ふくらんで 知らせる」動きが 付くと、動きの 1倍の 形が 上書きして 1.0〜1.25倍に ちぢんだ
        # （390×844実測: 0.2秒おき 100回中91回 1.5倍より 小さい・はば 59 → 35px）。ふくらむ・ゆれる 動きは その 粒の 大きさを 元に する
        fn = HTML[HTML.index("function refreshBadFaces() {"):HTML.index("let zoomAnimTimer")]
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        out = subprocess.run([node, "-e", """
let lotIndex = 0, spread = true, isNear = false; const FACE_Z = 100, motion = 1;
const firstBagFace = g => lotIndex === 0 && spread && g.kind !== 'seiryu', grainMood = () => 'normal', grainSprite = () => '';
const props = {}; const g = { kind:'shini', gone:false, el:{ style:{} }, img:{ src:'', style:{ transform:'', setProperty(k, v) { props[k] = v; } }, animate() {} } };
const grains = [g];
""" + fn + """
refreshBadFaces(); console.log(JSON.stringify({ face:props['--face'] || null, transform:g.img.style.transform }));
"""], capture_output=True, text=True, check=True).stdout
        st = json.loads(out)
        self.assertEqual(st["transform"], "scale(1.5)")
        face = st["face"] or "1"
        for name in ("hint", "wig"):
            kf = HTML[HTML.index("@keyframes " + name + " {"):]
            kf = kf[:kf.index("\n")]
            scales = []
            for frame in re.findall(r"\{ transform:([^;]*); \}", kf):
                frame = re.sub(r"var\(--face, 1\)", face, frame)
                m = re.findall(r"scale\(([^()]*(?:\([^()]*\))?[^()]*)\)", frame)
                expr = m[-1].replace("calc(", "(") if m else "1"
                scales.append(eval(expr, {"__builtins__": {}}))
            self.assertGreaterEqual(min(scales), 1.5, name + " の 動きで 顔つきの 粒が " + str(min(scales)) + "倍に ちぢむ")


    def _codex154_world(self, body):
        # Codex指摘 2つ（どちらも 390×844・GW 36・GH 20・回転 0°・顔つきの 粒 (125,100)）:
        # 1. 手本で 1.875倍に ふくらんだ 時、新しく 見えた 絵の ふち (94,100) を 押すと 下の 良い粒 (94,100) が 取られた（当たりが いつも 1.5倍）
        # 2. 顔の 絵の すきとおった 角 (104,113) から 見える 良い粒 (100,114) を 押すと、顔つきの 粒が 取られた（四角で はかって いた）
        fn = HTML[HTML.index("function grainAt(p) {"):HTML.index("const pts = new Map();")]
        rows = HTML[HTML.index("const GRAIN_ROWS = ["):HTML.index("];", HTML.index("const GRAIN_ROWS = [")) + 2]
        self._node150("""
const assert = require('node:assert/strict');
const GW = 36, GH = 20, Z = { s:1 }; let lotIndex = 0, spread = true, faceScale = 1.5;
const firstBagFace = g => lotIndex === 0 && spread && g.kind !== 'seiryu';
""" + rows + """
const LOT_LOOKS = [{ rows:GRAIN_ROWS }], LOT = { look:0 };
let faceMatrix = null;   // サイクル154（Codex指摘 3つめ）: 倍率 だけで ない 見た目の 行列
const getComputedStyle = el => ({ transform:el.face ? (faceMatrix || 'matrix(' + faceScale + ', 0, 0, ' + faceScale + ', 0, 0)') : 'none' });
const mk = (kind, x, y, z) => ({ kind, x, y, r:0, z, gone:false, el:{ hidden:false }, img:{ face:kind !== 'seiryu' } });
let grains;
""" + fn + """
const face = mk('shini', 125, 100, 100);
""" + body)

    def test_cycle154_codex_pulsing_face_takes_its_new_edge(self):
        self._codex154_world("""
// 1. ふくらんだ 1.875倍の 時: 新しく 見えた 絵の ふちを 押せば 顔つきの 粒
const good = mk('seiryu', 94, 100, 5); grains = [good, face];
faceScale = 1.875; assert.equal(grainAt({ x:94, y:100 }), face, 'ふくらんだ 絵の ふちで 良い粒が 取られた');
faceScale = 1.5; assert.equal(grainAt({ x:94, y:100 }), good);   // ふくらんで いない 時は、その 点は 絵の 外 → 良い粒（直しすぎない）
""")

    def test_cycle154_codex_clear_corner_of_the_face_keeps_the_good_grain(self):
        self._codex154_world("""
// 2. 絵の すきとおった 角から 見える 良い粒は 良い粒
const good = mk('seiryu', 100, 114, 5); grains = [good, face];
assert.equal(grainAt({ x:104, y:113 }), good, 'すきとおった 角を 押して 顔つきの 粒が 取られた');
assert.equal(grainAt({ x:110, y:100 }), face);                   // 絵の 中（すきとおって いない 所）は 顔つきの 粒
""")


    def test_cycle154_codex_overlapping_bad_grains_take_the_one_drawn_on_top(self):
        # Codex指摘: 1袋目で 顔つきの 粒どうしが 重なると、見えて いる 手前の 粒では なく 奥の 粒が 取れた。
        # 被害粒 (100,100)・死米 (130,100)。grains は まぜて あり 被害粒が 先、DOM では 死米が あと（手前）。(122,100) を 押す → 被害粒（直す 前） → 死米
        self._codex154_world("""
const higai = mk('higai', 100, 100, 100), shini = mk('shini', 130, 100, 100);
higai.dom = 4; shini.dom = 11;                      // 皿に 足した 順（あとが 手前）
grains = [higai, shini];                            // 配列は まぜた 順
assert.equal(grainAt({ x:122, y:100 }), shini, '手前に えがかれた 死米では なく 奥の 被害粒が 取れた');
grains = [shini, higai]; assert.equal(grainAt({ x:122, y:100 }), shini);   // 配列の 順に よらない
higai.dom = 12; assert.equal(grainAt({ x:122, y:100 }), higai);           // 被害粒が 手前なら 被害粒
// 2袋目から（顔なし・わるい粒は どれも 重なり順 1）も 同じ
lotIndex = 1; higai.z = 1; shini.z = 1; higai.dom = 4; shini.dom = 11; grains = [higai, shini];
assert.equal(grainAt({ x:116, y:100 }), shini);
""")


    def test_cycle154_codex_shaking_face_keeps_the_good_grain_in_its_clear_part(self):
        # Codex指摘 3つめ: 皿を たたいて ゆれる 間（wig の 30%: translateY(-22%) rotate(-12deg) scale(1.5)）、絵の すきとおった 所 (105,111) から
        # 見える 良い粒 (100,114) を 押すと、顔つきの 被害粒 (125,100) が 取られた（倍率 だけ もどして、ずれた 所の 透明を 調べて いた）
        self._codex154_world("""
const higai = mk('higai', 125, 100, 100), good = mk('seiryu', 100, 114, 5); grains = [good, higai];
const r = -12 * Math.PI / 180, s = 1.5;   // GH 20 の -22% = -4.4px
faceMatrix = 'matrix(' + [s * Math.cos(r), s * Math.sin(r), -s * Math.sin(r), s * Math.cos(r), 0, -4.4].join(', ') + ')';
assert.equal(grainAt({ x:105, y:111 }), good, 'ゆれる 間、すきとおった 所を 押して 顔つきの 粒が 取られた');
assert.equal(grainAt({ x:125, y:96 }), higai);                    // ゆれた 絵の まんなかは 顔つきの 粒
faceMatrix = 'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)';   // 読めない 行列は 1.5倍
assert.equal(grainAt({ x:104, y:100 }), higai);
""")


    # ---- サイクル155（最初の1分・この 先が 見える）----

    def test_cycle155_the_head_says_what_the_bag_is_for_and_which_bag(self):
        # 旧版は 開いた 画面に 目的も 袋の 数も 無く、「1ふくろを しらべて さいごに はんこ」と 分かるのは はんこまで 行った 後（約22秒）だった。
        # 開いた 時から 頭に 1行。袋が かわる たびに 何ふくろめ かも かわる
        head = HTML[HTML.index('<div id="head">'):HTML.index('<div id="stage">')]
        goal = re.search(r'<div id="goal">(.*?)</div>', head)
        self.assertIsNotNone(goal, "開いた 画面の 頭に 目的の 1行が 無い")
        text = re.sub(r"<[^>]+>", "", goal.group(1))
        for word in ("ふくろ", "はんこ"):
            self.assertIn(word, text)
        self.assertIn("1ふくろめ", re.sub(r"<[^>]+>", "", head))   # いま 何ふくろめ か（段の 名前の 行の 右）
        start = HTML.index("function startLot() {")
        head_of_start = HTML[start:HTML.index('drawBag($("bagCanvas")', start)] + "}"
        self._node150("""
const assert = require('node:assert/strict');
const LOTS = [{}, {}, {}, {}, {}, {}]; let LOT = null, lotIndex = 0;
const lotNo = { textContent:'1' }; const $ = id => id === 'lotNo' ? lotNo : null;
""" + head_of_start + """
lotIndex = 1; startLot(); assert.equal(String(lotNo.textContent), '2', '2ふくろめに なっても 1ふくろめ のまま');
lotIndex = 6; startLot(); assert.equal(String(lotNo.textContent), '7');   // 6しゅるいを くり返す 7ふくろめ
""")
        # 読める 大きさ・こさ（運営者の 声: 11px・うすい 色では 目に 入らない）。どの 画面の 決まりでも 12px 以上、たての 画面は 13px。
        # 地（--bg）との コントラスト 4.5:1 以上。何ふくろめ かは 段の 名前の 行の 右に 分け、目的の 行は 切れない 長さ
        css = HTML[HTML.index("<style>"):HTML.index("</style>")]
        sizes = [int(m) for m in re.findall(r"#(?:goal|lotTag)[^{]*\{[^}]*?font-size:(\d+)px", css)]
        self.assertTrue(sizes, "目的の 行の 字の 大きさが 決まって いない")
        self.assertGreaterEqual(min(sizes), 12, "字が 小さすぎる: " + str(sizes))
        self.assertIn(13, sizes)
        bg = re.search(r"--bg:(#[0-9a-f]{6})", css).group(1)
        def lum(h):
            f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
            r, g, b = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
        for sel in ("#goal {", "#lotTag {"):
            rule = css[css.index(sel):css.index("}", css.index(sel))]
            color = re.search(r"color:(#[0-9a-f]{6})", rule).group(1)
            hi, lo = sorted((lum(color), lum(bg)), reverse=True)
            self.assertGreaterEqual((hi + .05) / (lo + .05), 4.5, sel + " の 字が うすい")
            self.assertIn("white-space:nowrap;", rule)
        self.assertIn('<span id="lotTag"><span id="lotNo">1</span>ふくろめ</span>', head)   # 何ふくろめ か は 題字の 行の 右（Codex指摘で 段の 名前の 行から 移した）
        self.assertLessEqual(len(text), 14)   # 320px・12px でも 1行に おさまる 長さ（ブラウザ実測で 5つの 画面とも 切れ 0）


    def test_cycle155_codex_head_height_does_not_change_with_step_or_bag(self):
        # Codex指摘: 320×568 で 10ふくろめ の「みわける」へ 進むと、段の 名前が「みわけ／る」に 折り返し、頭が 74 → 106px に のびて、
        # 皿の 内がわが 261 → 240px に ちぢんだ。おぼえた 皿の 高さ（PH 261）は そのまま なので、なでた 粒が 皿の 外へ 出た。
        # 本物の ブラウザで、6つの 画面 × 5つの 段 × 袋の 番号 1・10・100 の 頭の 高さ・折り返し・皿の 高さと PH を はかる
        node = shutil.which("node")
        if not node:
            self.skipTest("node がないので実行の確認は飛ばす")
        js = r"""
const fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log(JSON.stringify({ skip: 'playwright なし' })); process.exit(0); }
const [root] = process.argv.slice(1, 2);
const TYPES = { '.html': 'text/html; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.js': 'text/javascript', '.css': 'text/css' };
(async () => {
  let b; try { b = await chromium.launch(); } catch (e) { console.log(JSON.stringify({ skip: 'chromium が 起動しない' })); return; }
  const out = [];
  for (const [w, h] of [[320, 568], [360, 640], [390, 844], [568, 320], [844, 390], [820, 1180]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true }); const p = await ctx.newPage();
    await p.route('http://kensa.test/**', r => { const f = path.join(root, decodeURIComponent(new URL(r.request().url()).pathname));
      if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
      r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) }); });
    await p.goto('http://kensa.test/kensa.html'); await p.waitForTimeout(800);
    for (const lot of ['1', '10', '100']) for (let i = 0; i < 5; i++) {
      const r = await p.evaluate(([lot, i]) => { document.getElementById('lotNo').textContent = lot; setStep(i, '');
        const s = document.getElementById('stepName'), lh = parseFloat(getComputedStyle(s).lineHeight);
        return { head: document.getElementById('head').offsetHeight, wrap: s.offsetHeight > lh * 1.5,   /* 出てくる 動き（scale）に よらない 高さ */ inner: document.getElementById('plateInner').clientHeight, PH };
      }, [lot, i]);
      out.push(Object.assign({ w, h, lot, i }, r));
    }
    await ctx.close();
  }
  await b.close(); console.log(JSON.stringify(out));
})();
"""
        r = subprocess.run([node, "-e", js, ROOT], capture_output=True, text=True, timeout=600)
        self.assertEqual(r.returncode, 0, r.stderr[-1500:])
        res = json.loads(r.stdout.strip().splitlines()[-1])
        if isinstance(res, dict) and res.get("skip"):
            self.skipTest(res["skip"])
        self.assertEqual(len(res), 6 * 15)
        for c in res:
            tag = "%dx%d %sふくろめ %d段め" % (c["w"], c["h"], c["lot"], c["i"] + 1)
            self.assertFalse(c["wrap"], tag + " で 段の 名前が 折り返した")
            self.assertLessEqual(abs(c["inner"] - c["PH"]), 1, tag + " で 皿の 高さ %d と PH %d が ずれた" % (c["inner"], c["PH"]))
        for w, h in {(c["w"], c["h"]) for c in res}:
            heads = {c["head"] for c in res if (c["w"], c["h"]) == (w, h)}
            self.assertEqual(len(heads), 1, "%dx%d で 頭の 高さが 段・袋で かわる %s" % (w, h, sorted(heads)))


if __name__ == "__main__":
    unittest.main()
