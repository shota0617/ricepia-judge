"""米づくり365: 最初の1分に出る飾りが、カードの日付や天気の丸に重ならない置き方になっているか(周回152)。"""
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

    def test_owner_rules_kept(self):
        # 店主の指示(2026-11-08・11-09)で入れたものは そのまま
        self.assertIn("#swWhy.on{animation:swWhyIn 2s ease-out both}", HTML)
        self.assertIn('<i class="swHintSh L" aria-hidden="true"></i><i class="swHintSh R" aria-hidden="true"></i>', HTML)


if __name__ == "__main__":
    unittest.main()
