import json
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
DECO = '✨🎯💦🍚🏁'


class FurusatoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = (GO / 'furusato.js').read_text()

    def test_say_is_plain(self):
        for ch in DECO:
            self.assertNotIn(ch, self.src.split('(function')[1])

    def test_hooked_into_game(self):
        px = (GO / 'pixel.js').read_text()
        self.assertIn("furusatoStep(hx, by, u, now, mood === 'sleepy');", px)
        body = px[px.index('function furusatoStep'):px.index('function furusatoStep') + 2200]
        self.assertIn('K.outside(here.city)', body)   # 西尾市の 外だけ
        self.assertIn('G.areas', body)
        self.assertIn('furusato.js', (ROOT / 'nishio-go.html').read_text())

    def test_items_match_areas(self):
        areas = {a['id'] for a in json.loads((GO / 'areas.json').read_text())['areas'] if not a.get('near')}
        yk = (GO / 'youkoso.js').read_text()
        for aid, emblem in (('nishio', 'chawan'), ('isshiki', 'unagi'), ('kira', 'inaho'), ('hazu', 'carnation')):
            self.assertIn(aid, areas)
            self.assertIn("id: '%s', area: '%s'" % (emblem, aid), yk)   # 絵は ようこそと 同じ 地区の 名物
            self.assertIn("area: '%s', id: '%s'" % (aid, emblem), self.src)

    @unittest.skipUnless(shutil.which('node'), 'node がない')
    def test_nearest_and_say(self):
        areas = json.loads((GO / 'areas.json').read_text())['areas']
        js = ("global.window = {}; require(%r); const M = window.NISHIO_FURUSATO; const A = %s;"
              "const N = A.filter(a => a.id === 'nishio'), east = M.nearest(34.872, 136.9, N), west = M.nearest(34.872, 137.3, N), sk = M.nearest(34.70, 137.0, A);"
              "console.log(JSON.stringify({ o: [M.outside('岡崎市'), M.outside('西尾市'), M.outside(''), M.outside(null)],"
              "east: [east.area, Math.cos(east.ang) > 0.9], west: Math.cos(west.ang) < -0.5, sk: sk.area, none: M.nearest(34.8, 137, []),"
              "say: M.say('岡崎市', M.pick('nishio')), pk: M.pick('sakushima') }));") % (str(GO / 'furusato.js'), json.dumps(areas))
        o = json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)
        self.assertEqual(o['o'], [True, False, False, False])
        self.assertEqual(o['east'], ['nishio', True])   # 西にいる → 東（右）をさす
        self.assertTrue(o['west'])
        self.assertIn(o['sk'], ('isshiki', 'nishio', 'kira', 'hazu'))   # 佐久島は えらばない
        self.assertIsNone(o['none'])
        self.assertEqual(o['say'], '岡崎市に 来たよ。西尾は あっちだよ。抹茶の まちだね')
        self.assertIsNone(o['pk'])


if __name__ == '__main__':
    unittest.main()
