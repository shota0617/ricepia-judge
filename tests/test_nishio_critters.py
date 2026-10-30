from pathlib import Path
import re
import unittest

GO = Path(__file__).resolve().parents[1] / 'nishio-go'
NEW_IDS = ['medaka', 'dojo', 'ishigame', 'akaza', 'kamatsuka', 'misago', 'kochidori', 'shijimi']
DECO = '✨🎯💦🍚🏁'


class CritterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        game = (GO / 'game.js').read_text()
        block = game[game.index('const CRITTERS = ['):game.index('const CRITTER_DAILY')]
        cls.block = block
        cls.entries = {m.group(1): m.group(0) for m in re.finditer(r"\{ id: '(\w+)'.*?(?=\n  \{ id: |\n\];)", block, re.S)}
        cls.pixel = (GO / 'pixel.js').read_text()

    def test_new_critters_present_with_where(self):
        for i in NEW_IDS:
            self.assertIn(i, self.entries)
            self.assertRegex(self.entries[i], r"where: '(paddy|water|kawa|higata)'")

    def test_notes_have_source(self):
        for i, e in self.entries.items():
            if 'note:' in e:
                self.assertIn('src:', e, i)

    def test_no_decorative_emoji(self):
        for ch in DECO:
            self.assertNotIn(ch, self.block)

    def test_every_critter_has_16x16_sprite(self):
        rows = self.pixel[self.pixel.index('const CRITTER_ROWS'):self.pixel.index('const critterSprites')]
        for i in self.entries:
            m = re.search(r"^  %s: \[(.*)\],?$" % i, rows, re.M)
            self.assertIsNotNone(m, i)
            r = re.findall(r"'([^']*)'", m.group(1))
            self.assertEqual(len(r), 16, i)
            self.assertTrue(all(len(x) == 16 for x in r), i)

    def test_water_kind_exported_and_used(self):
        self.assertIn('waterKind, critterStep', self.pixel)
        self.assertIn('waterKind(me.lat, me.lng)', (GO / 'game.js').read_text())

    def test_where_names_cover_all(self):
        game = (GO / 'game.js').read_text()
        names = game[game.index('const WHERE_NAME'):].split('\n')[0]
        for w in set(re.findall(r"where: '(\w+)'", self.block)):
            self.assertIn(w, names)


if __name__ == '__main__':
    unittest.main()
