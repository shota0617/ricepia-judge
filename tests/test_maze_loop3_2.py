"""第3弾サイクル2：かおりちゃんの顔PNG（3表情）を おはなし窓に 組みこむ 回帰テスト"""
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return f.read()


class KaoriFaceTest(unittest.TestCase):
    def test_images_exist_and_small(self):
        for k in ('normal', 'smile', 'surprised'):
            p = os.path.join(ROOT, 'nishio-go/art/kaori/face-%s.png' % k)
            self.assertTrue(os.path.exists(p), p)
            self.assertLessEqual(os.path.getsize(p), 100 * 1024)

    def test_mood_mapping(self):
        js = read('nishio-go/kometalk.js')
        self.assertIn("happy: 'smile'", js)
        self.assertIn("excited: 'surprised'", js)
        self.assertIn("normal: 'normal'", js)
        for k in ('normal', 'smile', 'surprised'):
            self.assertIn("'%s'" % k, js)
        self.assertIn('art/kaori/face-', js)

    def test_fallbacks_kept(self):
        js = read('nishio-go/kometalk.js')
        self.assertIn('drawRice', js)
        self.assertIn('🍚', js)
        self.assertIn('onerror', js)
        self.assertIn('drawImage', js)

    def test_css_auto_only_for_kome_talk(self):
        css = read('nishio-go/style.css')
        m = re.search(r'\.kome-talk canvas\{[^}]*\}', css)
        self.assertIn('image-rendering:auto', m.group(0))
        self.assertEqual(len(re.findall(r'\.kome-talk canvas\{', css)), 1)

    def test_node_check(self):
        subprocess.run(['node', '--check', os.path.join(ROOT, 'nishio-go/kometalk.js')], check=True)

    def test_principles_in_diff(self):
        d = subprocess.run(['git', 'diff', 'origin/main', '--', 'nishio-go', 'nishio-go.html'],
                           cwd=ROOT, capture_output=True, text=True, check=True).stdout
        added = '\n'.join(l for l in d.splitlines() if l.startswith('+') and not l.startswith('+++'))
        for bad in ('ぼく', 'だに', '約20%'):
            self.assertNotIn(bad, added)


if __name__ == '__main__':
    unittest.main()
