# にしおサイクル131：累計プレイ人数（stats.json）は はじめの 画面を 出す ときだけ 読む（開いたら すぐ 始まる 今は ほぼ 出ないのに、毎回 読みに いって 404 を 出していた）
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GAME = (ROOT / 'nishio-go' / 'game.js').read_text(encoding='utf-8')


class Stats(unittest.TestCase):
    def test_fetch_only_when_intro_shown(self):
        self.assertEqual(GAME.count("fetch('nishio-go/stats.json'"), 1)
        self.assertIn("if (!$('intro').hidden) fetch('nishio-go/stats.json', { cache: 'no-cache' })", GAME)

    def test_after_start_decision(self):
        i = GAME.index("if (!$('intro').hidden) fetch('nishio-go/stats.json'")
        self.assertLess(GAME.index("  } else $('intro').hidden = true;\n}\n"), i)   # はじめの 画面を 出すか 決めた あと
        self.assertLess(i, GAME.index('setInterval(() => { renderMarkers(); refreshNearby(); }, 10000);'))
        self.assertIn('👥 これまでに', GAME)   # 出す ときの 文は そのまま


if __name__ == '__main__':
    unittest.main()
