# 第4弾サイクル16：歩行中に自動で出る カード・文章パネル・会話窓を全廃／かおりちゃんは いつも笑顔／開いたらすぐ始まる
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
GAME = (GO / 'game.js').read_text(encoding='utf-8')
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')
MEIRO = (GO / 'meiro.js').read_text(encoding='utf-8')
HTML = (ROOT / 'nishio-go.html').read_text(encoding='utf-8')


def body(src, head):
    """head（'function xxx(' など）から、波かっこが閉じるまで"""
    i = src.index(head)
    j = src.index('{', i)
    d = 0
    for k in range(j, len(src)):
        d += src[k] == '{'
        d -= src[k] == '}'
        if d == 0:
            return src[i:k + 1]
    raise AssertionError(head)


class Smile(unittest.TestCase):
    def test_rice_mood_always_smile(self):
        m = body(PIXEL, 'function riceMood(')
        for w in ('ouch', 'dizzy', 'wow', 'excited', 'yawn', 'sleepy'):  # c99: blink（笑顔のまま目だけ閉じる）だけは許可に変更
            self.assertNotIn("'%s'" % w, m, w)
        self.assertIn(": 'smile'", m)  # c99: 既定は笑顔のまま（まばたき時だけ 'blink'）

    def test_meiro_never_picks_painful_face(self):
        self.assertNotIn("'ouch'", MEIRO)
        self.assertNotIn("'dizzy'", MEIRO)
        self.assertIn("const mood = 'smile'", MEIRO)

    def test_intro_hero_smiles(self):
        h = body(GAME, 'function introHero(')
        self.assertIn("const mood = 'smile'", h)
        self.assertNotIn("'excited'", h)

    def test_motion_timers_kept(self):
        self.assertIn('roll.ouchT', PIXEL)
        self.assertIn('g.ouch', MEIRO)

    def test_sleep_motion_not_tied_to_face(self):
        self.assertIn('const riceAsleep = () =>', PIXEL)
        self.assertNotIn("mood === 'sleepy'", PIXEL)


class Start(unittest.TestCase):
    def test_intro_hidden_on_first_open(self):
        i = GAME.index("  // 運営者の声（2026-11-03）「開いたらすぐ始まる」")
        seg = GAME[i:i + 1200]
        self.assertIn("else $('intro').hidden = true;", seg)
        self.assertNotIn("intro_nudge", GAME)
        self.assertNotIn("nudge-tip", GAME)
        self.assertNotIn('setTimeout(() => {\n    const b = $(\'meiroBtn\')', GAME)

    def test_hero_only_in_noauto(self):
        self.assertEqual(GAME.count("addEventListener('DOMContentLoaded', introHero)"), 1)
        i = GAME.index("addEventListener('DOMContentLoaded', introHero)")
        self.assertIn('if (noAuto) {', GAME[i - 400:i])

    def test_meiro_auto_start_without_intro_visible(self):
        self.assertIn('const fresh = !(root.nishioGo && root.nishioGo.started);', MEIRO)
        self.assertIn('if (b && fresh && !noAuto) b.click();', MEIRO)
        self.assertNotIn('!intro0.hidden', MEIRO)
        self.assertIn("nsg_noauto", MEIRO)

    def test_started_saved_by_begin(self):
        b = body(GAME, 'function begin(')
        self.assertIn("store.set('nsg_started', true)", b)
        self.assertIn("store.set('nsg_first_day'", b)

    def test_intro_dom_kept(self):
        self.assertIn('id="intro"', HTML)


class Arrival(unittest.TestCase):
    def test_checkin_has_no_card(self):
        c = body(GAME, 'function checkin(')
        self.assertNotIn('showReward(', c)
        self.assertIn('toast(lvUp ?', c)
        self.assertNotIn('shopAfter(', c)

    def test_collection_kept(self):
        c = body(GAME, 'function checkin(')
        for w in ('gainPoints(total)', 'S.visits[s.id] =', 'postcardCheckin(', 'courseCheckin(', 'gainDot(', 'S.log.unshift', 'giveBag(', 'reactAsk(s)'):
            self.assertIn(w, c, w)

    def test_showreward_still_exists(self):
        self.assertIn('function showReward(', GAME)
        self.assertIn('rewardBusy', GAME)


class Meet(unittest.TestCase):
    def test_meetshow_never_shows_box(self):
        m = body(GAME, 'function meetShow(')
        self.assertNotIn('hidden = false', m)
        self.assertNotIn('meet-flash', m)
        self.assertIn('return false', m)

    def test_critter_met_records_and_toasts(self):
        c = body(GAME, 'function critterMet(')
        for w in ('S.critters', 'CRITTER_PTS', 'S.log.unshift', "track('critter_meet'", 'toast('):
            self.assertIn(w, c, w)

    def test_meetbox_not_auto_shown_elsewhere(self):
        self.assertEqual(len(re.findall(r"meetBox'\)\.hidden = false", GAME)), 0)
        self.assertNotIn("$('meetBox')", body(GAME, 'function meetShow('))


class Npc(unittest.TestCase):
    def test_touch_does_not_open_window(self):
        o = body(PIXEL, 'function openNpc(')
        i = o.index('if (!tapped)')
        self.assertLess(i, o.index("$('pxInfo').hidden = false"))
        self.assertIn('return;', o[i:i + 60])

    def test_only_tap_opens(self):
        calls = re.findall(r'openNpc\([^)]*\)', PIXEL)
        taps = [c for c in calls if 'true' in c]
        self.assertEqual(len(taps), 1)
        g = body(PIXEL, 'function npcGreet(')
        self.assertNotIn('pxInfo', g)
        self.assertNotIn('true', g.split('openNpc(')[1].split(')')[0])

    def test_record_kept(self):
        o = body(PIXEL, 'function openNpc(')
        self.assertIn('G.talkNpc(n.id)', o)

    def test_poi_window_kept(self):
        self.assertIn('poiHtml', PIXEL)
        self.assertIn('popupHtml', GAME)


class Words(unittest.TestCase):
    def test_no_banned_words_in_added_lines(self):
        diff = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'nishio-go.html'], cwd=ROOT, capture_output=True, text=True).stdout
        added = '\n'.join(l for l in diff.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for w in ('\u307c\u304f', '\u3060\u306b', '\u7d0420%'):
            self.assertNotIn(w, added)


if __name__ == '__main__':
    unittest.main()
