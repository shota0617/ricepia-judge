"""米づくり365: 最初の1分に出る飾りが、カードの日付や天気の丸に重ならない置き方になっているか(周回152)、押しただけでは案内が消えないか(周回153)、出だしのちらつきと2Dの天気(周回154)。"""
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
        self.assertIn("choose('right', v); } else { reset(); ghostBack(); }", HTML)
        pause = HTML[HTML.index("function ghostPause(){"):HTML.index("function ghostBack(){")]
        self.assertNotIn("store.set", pause)
        self.assertIn("function ghostBack(){ var on = !ghostDone && choices.length === 0 && !calmOn();", HTML)
        # 決めたとき(choose)は これまでどおり二度と出さない
        choose = HTML[HTML.index("function choose(side, vel){"):HTML.index("function choose(side, vel){") + 200]
        self.assertIn("ghostOff();", choose)

    def test_trace_row_fits_between_side_columns_on_low_screens(self):
        # 周回153: 790px以下では世話のあとを30pxにし、季節の景色・あしたの空の丸にかからない幅にする
        self.assertIn("@media (max-height:790px){#swTrace .tr{width:30px;height:30px;background-size:30px 30px}#swRich{bottom:calc(100% + 38px)}#swDelay{bottom:calc(100% + 72px)}#swRich:not(.on) + #swDelay{bottom:calc(100% + 38px)}}", HTML)
        self.assertIn("@media (min-height:701px) and (max-height:790px) and (min-width:301px) and (max-width:410px){#swSeasonScene{width:72px;height:72px}", HTML)

    def test_guide_waits_for_entering_card(self):
        # 周回154: カードが入ってくる間は、後ろの案内の影と矢印を先に見せない(暗い箱のちらつき)
        self.assertIn("#swWrap:has(#swCard.enter) #swGhost.on{animation:swGhostSlide 4.4s ease-in-out infinite,swGhostIn .24s linear both}", HTML)
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

    def test_owner_rules_kept(self):
        # 店主の指示(2026-11-08・11-09)で入れたものは そのまま
        self.assertIn("#swWhy.on{animation:swWhyIn 2s ease-out both}", HTML)
        self.assertIn('<i class="swHintSh L" aria-hidden="true"></i><i class="swHintSh R" aria-hidden="true"></i>', HTML)
        # タップでは選ばない・カードを動かさない(2026-11-09): 指を離したときの分かれ道は choose か reset だけ
        self.assertNotIn("toggleDetail(); } else { reset()", HTML)
        self.assertIn("#swVib,#swHelp,#swJudge,#swBanner,#swMonth,#swHint,#swLog,#swRewind,#swDetailBtn,#swCard.hinting #swHint{display:none!important}", HTML)


if __name__ == "__main__":
    unittest.main()
