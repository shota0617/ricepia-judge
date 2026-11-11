"""米づくり365: 最初の1分に出る飾りが、カードの日付や天気の丸に重ならない置き方になっているか(周回152)、押しただけでは案内が消えないか(周回153)、出だしのちらつきと2Dの天気(周回154)、スワイプの手本(周回155)、止まったら手本(周回158)、飛んでいる間の指・しるしのあとの手本(周回161)、おそい回線・おそいスマホ(周回164)、田んぼから はじめた スワイプ(周回165)。"""
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.environ.get("KOME365_HTML") or os.path.join(ROOT, "kome365", "index.html"), encoding="utf-8") as f:
    HTML = f.read()


def css_rule(selector):
    m = re.search(r"^" + re.escape(selector) + r"\{([^}]*)\}", HTML, re.M)
    return m.group(1) if m else ""


class TestKome365FirstMinute(unittest.TestCase):
    def test_rich_and_delay_live_inside_card_wrap(self):
        # 蓄積の植物と金の花は、カードの包み(#swWrap)の中で「世話のあと」の次に置く
        wrap = HTML[HTML.index('<div id="swWrap">'):HTML.index('<div id="swCard"')]
        self.assertIn('<div id="swTrace" aria-hidden="true"></div><div id="swRich" aria-hidden="true"></div><div id="swDelay" aria-hidden="true"></div>', wrap)
        self.assertEqual(HTML.count('id="swRich"'), 1)
        self.assertEqual(HTML.count('id="swDelay"'), 1)

    def test_rich_and_delay_are_anchored_above_card(self):
        # 画面の高さの割合(top:47%・54%)ではなく、カードの上端から数える
        rich, delay = css_rule("#swRich"), css_rule("#swDelay")
        self.assertIn("bottom:calc(100% + 48px)", rich)
        self.assertIn("bottom:calc(100% + 82px)", delay)
        self.assertNotRegex(rich, r"(^|;)top:")
        self.assertNotRegex(delay, r"(^|;)top:")
        self.assertIn("#swRich:not(.on) + #swDelay{bottom:calc(100% + 48px)}", HTML)

    def test_day_guest_stays_out_of_weather_column(self):
        # 訪問者は 今日の空・あしたの空の丸の列(右から84px)より左に置く
        self.assertIn("e.style.right = 'calc(84px + ' + v.slot + ' * max(0px, 50% - 144px) / 2)';", HTML)
        self.assertNotIn("e.style.right = (16 + v.slot * 44) + 'px';", HTML)
        self.assertIn("@media (max-height:740px){#swDayGuest{top:calc(36% - 26px)}}", HTML)

    def test_tap_does_not_kill_first_card_guide(self):
        # 周回153: 触れただけでは ◀ ▶ の案内を「見た」ことにしない。決めずに離したら出し直す
        down = HTML[HTML.index("el.card.addEventListener('pointerdown'"):HTML.index("el.card.addEventListener('pointermove'")]
        self.assertIn("ghostPause();", down)
        self.assertNotIn("ghostOff()", down)
        pause = HTML[HTML.index("function ghostPause(){"):HTML.index("function ghostBack(){")]
        self.assertNotIn("store.set", pause)
        self.assertRegex(HTML, r"function ghostBack\(\)\{ (demoMiss\+\+; demoArm\(\); )?var on = !ghostDone && choices\.length === 0 && !calmOn\(\);")
        self.assertRegex(HTML, r"choose\('right', v\); \} else \{ (if \(tapMax < 12\) tapOnly\+\+; (else tapOnly = 0; )?)?reset\(\); ghostBack\(\); \}")
        # 決めたとき(choose)は これまでどおり二度と出さない
        choose = HTML[HTML.index("function choose(side, vel){"):HTML.index("function choose(side, vel){") + 200]
        self.assertIn("ghostOff();", choose)

    def test_trace_row_fits_between_side_columns_on_low_screens(self):
        # 周回153: 790px以下では世話のあとを30pxにし、季節の景色・あしたの空の丸にかからない幅にする
        self.assertIn("@media (max-height:790px){#swTrace .tr{width:30px;height:30px;background-size:30px 30px}#swRich{bottom:calc(100% + 38px)}#swDelay{bottom:calc(100% + 72px)}#swRich:not(.on) + #swDelay{bottom:calc(100% + 38px)}}", HTML)
        self.assertIn("@media (min-height:701px) and (max-height:790px) and (min-width:301px) and (max-width:410px){#swSeasonScene{width:72px;height:72px}", HTML)

    def test_guide_waits_for_entering_card(self):
        # 周回154: カードが入ってくる間は、後ろの案内の影と矢印を先に見せない(暗い箱のちらつき)
        self.assertRegex(HTML, r"#swWrap:has\(#swCard\.enter\) #swGhost\.on\{animation:sw(GhostSlide 4\.4s|DemoGhost 5s) ease-in-out infinite,swGhostIn \.24s linear both\}")
        self.assertIn("#swWrap:has(#swCard.enter) #swGhostArrows.on{animation:swGhostArrowsSlide 4.4s ease-in-out infinite,swGhostIn .24s linear both}", HTML)
        self.assertIn("@keyframes swGhostIn{0%,60%{opacity:0}100%{opacity:1}}", HTML)
        # 押して離したあとの出し直しでは消さない: つかんだ時点で enter を外している
        down = HTML[HTML.index("el.card.addEventListener('pointerdown'"):HTML.index("el.card.addEventListener('pointermove'")]
        self.assertIn("el.card.classList.remove('enter', 'wig')", down)

    def test_2d_field_uses_todays_weather(self):
        # 周回154: 2Dの絵も3Dと同じ fview(今日の天気)で空と雨を描く
        draw = HTML[HTML.index("function drawField(){"):HTML.index("// 遠くの山と家")]
        self.assertIn("const fv = fview(f), lastRain = fv.daily.length && fv.daily[fv.daily.length - 1].rain;", draw)
        self.assertNotIn("lastRain = f.daily.length && f.daily[f.daily.length - 1].rain", draw)
        self.assertIn("window.Field3D.update(fview(f))", draw)

    def test_swipe_demo_finger(self):
        # 周回155(店主指示 2026-11-10「スワイプの仕方の手本を出す」): 指が押さえて横へ引く手本
        self.assertIn('<div id="swHand" aria-hidden="true"><i class="hdTrail hdTrailR"></i><i class="hdTrail hdTrailL"></i><i class="hdRing"></i><div class="hdMove"><i class="hdFinger"></i></div></div><div id="swGuide"', HTML)
        self.assertIn("#swHand{position:absolute;inset:0;z-index:6;display:none;pointer-events:none}", HTML)
        self.assertIn("#swWrap.demoOn #swHand{display:block}", HTML)
        # 指・うしろの影・札の光は同じ5秒の拍子。引く幅は確定距離以上(±23%)
        self.assertIn("@keyframes swDemoMove{0%,10%{transform:translateX(0)}26%,42%{transform:translateX(23%)}42.01%,60%{transform:translateX(0)}76%,92%{transform:translateX(-23%)}92.01%,100%{transform:translateX(0)}}", HTML)
        self.assertIn("@keyframes swDemoGhost{0%,10%{transform:translateX(0) rotate(0)}26%,36%{transform:translateX(23%) rotate(1.5deg)}", HTML)
        self.assertIn("#swWrap.demoOn #swEdge .eR{animation:swDemoGlowR 5s ease-in-out infinite}", HTML)
        # 手本が出ている間は ◀ ▶ を重ねない。動きを減らす設定では止まった指 + 丸い ◀ ▶
        self.assertIn("#swWrap.demoOn #swGhostArrows,#swWrap.demoOn #swGhostArrows.on{display:none}", HTML)
        self.assertIn("@media (prefers-reduced-motion: no-preference){#swWrap.demoOn #swGuide{display:none!important}}", HTML)
        self.assertIn("#swHand .hdMove,#swHand .hdFinger{animation:none}#swHand .hdFinger{opacity:1}#swHand .hdRing,#swHand .hdTrail{display:none}", HTML)

    def test_swipe_demo_lifecycle(self):
        # 出す: まだ決めていない最初の1枚、または最初の3枚で2回つづけて押しただけの人
        # 周回157(店主の声 2026-11-10「スワイプお手本が出ない」): 進んだ端末でも 更新のあと 最初の1回は出す・何枚目でも 押しただけ2回で出す
        self.assertIn("var DEMO = 'kome365_demo_seen', demoDone = store.get(DEMO) === '1';", HTML)
        self.assertIn("function demoWant(){ return !demoDone || tapOnly >= 2; }", HTML)
        self.assertIn("function ghostOff(){ tapOnly = 0; if (!demoDone) { demoDone = true; store.set(DEMO, '1'); } demoSet(false);", HTML)
        # 触れている間は止め、決めずに離したら出し直し、スワイプで決めたら片づける
        self.assertIn("function ghostPause(){ demoSet(false);", HTML)
        self.assertIn("$('swGhostArrows').classList.toggle('on', on); demoSet(demoWant()); }", HTML)
        self.assertIn("function ghostOff(){ tapOnly = 0; if (!demoDone) { demoDone = true; store.set(DEMO, '1'); } demoSet(false);", HTML)
        self.assertIn("} else { if (tapMax < 12) tapOnly++; else tapOnly = 0; reset(); ghostBack(); }", HTML)
        # 指を置く高さは大きな絵の段(日付・題・札にかけない)
        self.assertIn("hd.style.setProperty('--hy', (ic.offsetTop + 4) + 'px')", HTML)
        # カードそのものは手本では動かさない: 手本の動きは #swHand・#swGhost・札の光だけ
        self.assertNotRegex(HTML, r"#swWrap\.demoOn #swCard[^{]*\{[^}]*(transform|animation)")

    def test_swipe_demo_review_fixes(self):
        # Codex指摘(PR #1071): 押しただけが「つづいて」2回のときだけ手本を出す(間に引いたら数えなおす)
        self.assertIn("if (tapMax < 12) tapOnly++; else tapOnly = 0; reset(); ghostBack();", HTML)
        # 手本が出ている間に画面の大きさが変わったら、指の高さを測り直す
        self.assertIn("window.addEventListener('resize', function(){ if ($('swWrap').classList.contains('demoOn')) demoSet(true); });", HTML)

    def test_fast_swipe_is_taken(self):
        # 周回159(運営者の声 2026-11-10・実機 iPhone「素早くスワイプすると反応しない」)
        # カードの 上では ブラウザに 指を わたさない(ななめの 速い フリックが 縦スクロール あつかいで 取り消されない)
        m = re.search(r"^#swCard\{[^}]*\}", HTML, re.M)
        self.assertIn("touch-action:none", m.group(0))
        self.assertNotIn("touch-action:pan-y", m.group(0))
        # 0.3秒 以内の 一筆(36px 以上)は 決める。押しただけ では 決めない(36px 以上が 要る)
        # のぞいて 引き戻した 動き(いちばん 遠い 所から 8px より 多く 戻った)は 決めない(Codex 指摘 PR #1084)
        self.assertIn("quick = !cancel && durAll >= 0 && durAll <= 300 && Math.abs(dx) >= Math.max(36, (dragW || 320) * 0.1) && Math.abs(dx) >= maxAx - 8;", HTML)
        self.assertIn("maxAx = Math.max(maxAx, Math.abs(e.clientX - startX));", HTML)
        self.assertIn("if (quick) flick = true;", HTML)
        # 速い フリックは ななめ(横が 縦の 0.7倍 以上)でも 決める
        self.assertIn("Math.abs(dx) < dyGuard * (cancel ? 1.5 : flick ? 0.7 : 1)", HTML)

    def test_demo_waits_for_judge_mark(self):
        # Codex 指摘(PR #1085): ○✗ の しるしが 出て いる 間は 手本を 待つ
        # 周回161: 待ちなおしは しるしの 残りの 時間だけ(0.3秒きざみで 待ちなおすと、しるしから 0.9秒 かかる)
        self.assertIn("var markLeft = 750 - (performance.now() - markAt); if (markLeft > 0) { demoArm(markLeft); return; }", HTML)
        self.assertNotIn("if (performance.now() - markAt < 750) { demoArm(); return; }", HTML)
        self.assertIn("function demoArm(ms){ demoDisarm();", HTML)
        self.assertIn("}, ms > 0 ? ms : (demoMiss > 0 || demoOk < 3) ? DEMO_STOP_MS : DEMO_STOP_OK_MS); }", HTML)
        self.assertIn("markAt = performance.now();", HTML)

    def test_swipe_during_fly_is_kept(self):
        # 周回161: 前の カードが 飛んで いる 間(busy・約0.2秒)に 置いた 指を 捨てない。おぼえて おき、次の カードで 同じ 順に 流しなおす
        down = HTML[HTML.index("el.card.addEventListener('pointerdown'"):HTML.index("el.card.addEventListener('pointermove'")]
        self.assertIn("pend = e.button > 0 ? null : [pendCopy(e)];", down)
        self.assertNotIn("if (busy || e.button > 0", down)
        move = HTML[HTML.index("el.card.addEventListener('pointermove'"):HTML.index("function up(e){")]
        self.assertIn("if (pend && e.pointerId === pend[0].pointerId) { var pl = null;", move)
        up = HTML[HTML.index("function up(e){"):HTML.index("el.card.addEventListener('pointerup', up)")]
        self.assertIn("if (pend && e && e.pointerId === pend[0].pointerId) { pend.push(pendCopy(e)); return; }", up)
        # 流しなおすのは 次の カードが 出た あと。決める きまりは up の まま(押しただけ では 決まらない)
        self.assertIn("setTimeout(function(){ advance(side); pendFlush(); }, dur);", HTML)
        flush = HTML[HTML.index("function pendFlush(){"):HTML.index("el.card.addEventListener('pointerdown'")]
        self.assertIn("var q = pend; pend = null;", flush)
        self.assertIn("busy || startX != null", flush)
        self.assertIn("cardDown(q[0]);", flush)
        self.assertIn("else { up(q[qi]); break; }", flush)
        self.assertNotIn("choose(", flush)
        # 時刻は もとの 指の 時刻を 使う(速さ・0.3秒の 一筆の 見分けが くるわない)
        self.assertIn("timeStamp: evT(e)", HTML)

    def test_pending_swipe_review_fixes(self):
        # Codex 指摘(PR #1087): 隠れたら 捨てる・まとめられた 点も おぼえる・2本目の 指で 消さない
        self.assertIn("document.addEventListener('visibilitychange', function(){ if (document.hidden) pend = null; });", HTML)
        self.assertIn("if (!q || document.hidden || busy ||", HTML)
        self.assertIn("pl = e.getCoalescedEvents ? e.getCoalescedEvents() : null;", HTML)
        self.assertIn("if (busy) { if (e.isPrimary === false) return;", HTML)
        self.assertIn("(v > 0) === (dx > 0) && Math.abs(dx) >= maxAx - 12;", HTML)   # 速く のぞいて 引き戻した 動きは フリックと しない
        self.assertIn("if (pend) { try { el.card.setPointerCapture(e.pointerId); } catch (x) {} }", HTML)   # おぼえはじめた ときも つかまえる

    def test_demo_timer_does_not_count_hidden_tab(self):
        # Codex指摘(PR #1082): 別のタブに いる間は 手本の 待ちを 数えない。戻ったら 数え直す
        self.assertIn("if (document.hidden) { demoHeld = !!demoT; demoDisarm(); } else if (demoHeld) { demoHeld = false; demoArm(); }", HTML)

    def test_demo_shows_whenever_player_stops(self):
        # 周回158(運営者の声 2026-11-10「手本は、止まって見ているときにかならず出ていること」):
        # 何枚目でも・前に決めた人でも、決めずに止まっていたら約2秒で手本を出す(うまくできている人は6秒に延ばすだけ)
        self.assertIn("var DEMO_STOP_MS = 300, DEMO_STOP_OK_MS = 300, demoT = null, demoMiss = 0, demoOk = 0;", HTML)   # 周回160(運営者の声 2026-11-10「スワイプのお手本をすぐにだす」): 2秒・6秒 → 0.3秒
        arm = HTML[HTML.index("function demoArm(ms){"):HTML.index("window.addEventListener('resize', function(){ if ($('swWrap')")]
        self.assertIn("demoSet(true)", arm)
        self.assertIn("(demoMiss > 0 || demoOk < 3) ? DEMO_STOP_MS : DEMO_STOP_OK_MS", arm)
        # 出す条件に「何枚目まで」「まだ決めていない人だけ」を入れない
        self.assertNotIn("choices.length", arm)
        self.assertNotIn("demoDone", arm)
        # カードが出たとき(render)と、決めずに離したとき(ghostBack)に数えはじめる
        self.assertIn("demoSet(demoWant()); demoArm();   /* 周回155", HTML)
        self.assertIn("function ghostBack(){ demoMiss++; demoArm();", HTML)
        # 触れている間・スワイプで決めたときは止める
        self.assertIn("function ghostPause(){ demoSet(false); demoDisarm();", HTML)
        self.assertIn("demoSet(false); demoDisarm(); demoMiss = 0; demoOk++;", HTML)

    def test_reduced_motion_demo_shows_direction(self):
        # 周回158: 動きを減らす設定では、手本(止まった指)が出ている間 何枚目でも 丸い ◀ ▶ を一緒に出す
        self.assertIn("@media (prefers-reduced-motion: reduce){#swWrap.demoOn #swGuide{display:block!important}}", HTML)

    def test_owner_rules_kept(self):
        # 店主の指示(2026-11-08・11-09)で入れたものは そのまま
        self.assertIn("#swWhy.on{animation:swWhyIn 2s ease-out both}", HTML)
        self.assertIn('<i class="swHintSh L" aria-hidden="true"></i><i class="swHintSh R" aria-hidden="true"></i>', HTML)
        # タップでは選ばない・カードを動かさない(2026-11-09): 指を離したときの分かれ道は choose か reset だけ
        self.assertNotIn("toggleDetail(); } else { reset()", HTML)
        self.assertIn("#swVib,#swHelp,#swJudge,#swBanner,#swMonth,#swHint,#swLog,#swRewind,#swDetailBtn,#swCard.hinting #swHint{display:none!important}", HTML)

    def test_3d_files_wait_for_first_card(self):
        # 周回164(おそい回線): カードが出るまで 3D のファイル(three.js・field3d.js)を取りに行かない
        self.assertNotIn('<script src="field3d.js"></script>', HTML)
        self.assertIn('<script src="engine.js"></script>\n<script src="cards.js"></script>\n<script>', HTML)
        loader = HTML[HTML.index("window.__k3d = (function(){"):HTML.index("const K = window.Kome365")]
        self.assertIn("l.rel = 'preload'; l.as = 'script';", loader)
        self.assertIn("add('field3d.js');", loader)
        self.assertIn("if (!no3d) add('vendor/three.min.js', SRI, function(){ window.dispatchEvent(new Event('three-ready')); });", loader)
        self.assertLess(loader.index("add('field3d.js');"), loader.index("add('vendor/three.min.js'"))
        self.assertIn("sc.async = false;", loader)
        self.assertIn("sha512-dLxUelApnYxpLt6K2iomGngnHO83iUvZytA3YjDUCjT0HDOHKXnVYdf3hU4JjM8uEhxf9nD1/ey98U3t2vZ0qQ==", loader)
        # 読みこみの はじめに すぐ three.js を足す書き方は もう無い
        self.assertNotIn("sc.src = 'vendor/three.min.js'; sc.async = true;", HTML)

    def test_3d_setup_waits_for_first_swipe(self):
        # 周回164(おそいスマホ): はじめての人は 1枚目を決めた 0.9秒あと か、さわらずに 8秒で 3D のしたくを はじめる。つづきの人は すぐ
        choose = HTML[HTML.index("function choose(side, vel){"):HTML.index("function choose(side, vel){") + 260]
        self.assertIn("window.__k3d.soon(900);", choose)
        self.assertIn("if (loadSave()) { resumeSwipe(); window.__k3d.pre(); window.__k3d.go(); } else { guideFresh = true; $('bStart').click(); guideFresh = false; window.__k3d.pre(); window.__k3d.idle(8000); }", HTML)
        loader = HTML[HTML.index("window.__k3d = (function(){"):HTML.index("const K = window.Kome365")]
        # 指が画面にある間は はじめない(待つのは 12回まで)
        self.assertIn("if (down && tries++ < 12) { timer = setTimeout(tick, 400); return; } go();", loader)
        self.assertIn("if (st === 2 || timer) return;", loader)   # 速く決めつづけても 3D の開始をのばさない
        self.assertIn("if (down) idleArm(); else go();", loader)

    def test_boot_title_has_moving_dot(self):
        # 周回164: 読みこみ中の題字の下で 丸が動く(transform だけ・押す物ではない)
        self.assertIn('html.booting #sTitle h1::after{content:"";display:block;width:8px;height:8px;margin:16px auto 0;border-radius:50%;background:#6f9a3f;animation:bootDot .8s ease-in-out infinite alternate}', HTML)
        self.assertIn("@keyframes bootDot{from{transform:translateX(-20px)}to{transform:translateX(20px)}}", HTML)
        self.assertIn("@media (prefers-reduced-motion:reduce){html.booting #sTitle h1::after{animation:none}}", HTML)

    def test_swipe_from_field_reaches_card(self):
        # 周回165: カードの 上の 田んぼ(#swStage)に 置いた 指も、カードに 置いた 指と 同じ 入口(cardDown)を 通る
        i = HTML.index("el.card.addEventListener('pointerup', up); el.card.addEventListener('pointercancel', up);")
        blk = HTML[i:i + 1400]
        self.assertIn("document.addEventListener('pointerdown', function(e){", blk)
        self.assertIn("if (t.closest('#swCard') || !t.closest('#swStage')) return;", blk)
        # 顔を なでる 指・かかしを 押す 指(finger)、ボタン、「お疲れ様です」の カードは 取らない
        self.assertIn("|| !fingerReady() || finger || startX != null) return;", blk)
        self.assertIn("if (t.closest('button, a, input, select, textarea, [role=\"button\"], #swDetail, #swIdle')) return;", blk)
        self.assertIn("cardDown(e);", blk)
        # 決める きまりは 1つ(up)。田んぼ用の choose は 作らない
        self.assertNotIn("choose(", blk[:blk.index("cardDown(e);")])
        # 田んぼは 縦スクロールを 止めない(pan-y の まま)。カードは none の まま(周回159)
        self.assertIn("min-height:0;touch-action:pan-y}", css_rule("#swStage") + "}")
        self.assertIn("touch-action:none", css_rule("#swCard"))

    def test_cancel_without_place_does_not_decide(self):
        # 周回165: 場所が (0,0) の 取り消し(pointercancel)を「左へ 大きく 動いた」と 見ない。さいごに 届いた 動きの 場所で 見る
        up = HTML[HTML.index("  function up(e){"):HTML.index("el.card.addEventListener('pointerup', up);")]
        fix = "if (e && e.type === 'pointercancel' && e.clientX === 0 && e.clientY === 0 && startX != null && e.pointerId === pid) e = { type: 'pointercancel', pointerId: e.pointerId, timeStamp: e.timeStamp, clientX: samples.length ? samples[samples.length - 1][1] : startX, clientY: lastY != null ? lastY : startY };"
        self.assertIn(fix, up)
        # 指を はなした とき の 動き(sx0 を 取る 行)より 前に 直す
        self.assertLess(up.index(fix), up.index("var sx0 = startX"))
        # 取り消しは 横が 縦の 1.5倍 以上の ときだけ 決める きまりは そのまま
        self.assertIn("Math.abs(dx) < dyGuard * (cancel ? 1.5 : flick ? 0.7 : 1)", up)


if __name__ == "__main__":
    unittest.main()
