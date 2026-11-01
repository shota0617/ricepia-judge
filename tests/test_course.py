import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
ISLANDS = {'sakushima', 'tombolo', 'gamagori-takeshima'}


def node(body):
    js = "global.window = {}; require(%r); const C = window.NISHIO_COURSE; %s" % (str(GO / 'course.js'), body)
    r = subprocess.run(['node', '-e', js], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return json.loads(r.stdout)


@unittest.skipUnless(shutil.which('node'), 'node がない')
class CourseTests(unittest.TestCase):
    """サイクル19：モデルコース（順路ミッション・スタンプ・1枚絵）。course.js と game.js の courseCheckin"""

    @classmethod
    def setUpClass(cls):
        cls.spots = {s['id']: s for s in json.loads((GO / 'spots.json').read_text(encoding='utf-8'))['spots']}
        cls.courses = node("console.log(JSON.stringify(C.COURSES));")

    def test_courses_use_real_featured_mainland_spots(self):
        self.assertTrue(2 <= len(self.courses) <= 3)
        for c in self.courses:
            self.assertTrue(4 <= len(c['spots']) <= 6, c['id'])
            self.assertEqual(len(set(c['spots'])), len(c['spots']))
            for sid in c['spots']:
                s = self.spots[sid]
                self.assertFalse(s.get('normal'), sid)
                self.assertNotIn(s.get('area'), {'sakushima'}, sid)
                self.assertNotIn(sid, ISLANDS)
                self.assertIsNotNone(s.get('lat'))

    def test_ordered_stamps_skip_and_quit(self):
        c = self.courses[0]['spots']
        out = node("""
const id = C.COURSES[0].id, sp = C.COURSES[0].spots;
let st = C.start(null, id); const log = [C.next(st)];
let r = C.advance(st, sp[2]); log.push([r.stamped, r.st.n]);          // 順番を とばした
r = C.advance(st, sp[0]); st = r.st; log.push([r.stamped, st.n, C.next(st)]);
r = C.advance(st, sp[0]); log.push([r.stamped, r.st.n]);              // 同じ所をもう一度
for (let i = 1; i < sp.length - 1; i++) st = C.advance(st, sp[i]).st;
r = C.advance(st, sp[sp.length - 1]); log.push([r.stamped, r.completed, r.st]);
const q = C.quit(C.start(C.advance(C.start(null, id), sp[0]).st, C.COURSES[1].id)); log.push(q);
console.log(JSON.stringify(log));""")
        self.assertEqual(out[0], c[0])
        self.assertEqual(out[1], [False, 0])
        self.assertEqual(out[2], [True, 1, c[1]])
        self.assertEqual(out[3], [False, 1])
        self.assertEqual(out[4], [True, True, {'cur': None, 'n': 0, 'done': [self.courses[0]['id']]}])
        self.assertEqual(out[5], {'cur': None, 'n': 0, 'done': []})

    def test_switching_course_resets_stamps_but_keeps_done(self):
        o = node("""
let st = C.start(null, 'jokamachi'); st = C.advance(st, C.COURSES[0].spots[0]).st; st.done = ['isshiki'];
const s2 = C.start(st, 'chaen'); console.log(JSON.stringify([s2, C.start(st, 'nanika')]));""")
        self.assertEqual(o[0], {'cur': 'chaen', 'n': 0, 'done': ['isshiki']})
        self.assertEqual(o[1]['cur'], 'jokamachi')

    def test_broken_records_do_not_crash(self):
        o = node("""
const bad = [undefined, null, 5, 'x', [], { cur: 'zzz', n: 3 }, { cur: 'chaen', n: 99, done: 'a' }, { cur: 'chaen', n: -4, done: ['chaen', 'chaen', 'q', 7] }, { cur: 'chaen', n: 'NaN' }];
console.log(JSON.stringify(bad.map(b => { const s = C.clean(b); return [s, C.next(b), C.advance(b, 'jissoji').stamped, C.mosaic(b && b.done).length]; })));""")
        for s, nx, _, rows in o:
            self.assertEqual(rows, 3)
            self.assertTrue(s['cur'] is None or 0 <= s['n'] < len(next(c for c in self.courses if c['id'] == s['cur'])['spots']))
            self.assertEqual(len(s['done']), len(set(s['done'])))
        self.assertEqual(o[5][0], {'cur': None, 'n': 0, 'done': []})
        self.assertEqual(o[6][0]['n'], 3)
        self.assertEqual(o[7][0], {'cur': 'chaen', 'n': 0, 'done': ['chaen']})

    def test_distance_and_time_are_hints_from_coordinates(self):
        pos = {sid: {'lat': s['lat'], 'lng': s['lng']} for sid, s in self.spots.items()}
        o = node("const pos = %s; console.log(JSON.stringify(C.COURSES.map(c => { const m = C.measure(c, pos); return [m, C.measureText(m)]; }).concat([[C.measure(C.COURSES[0], {}), C.measureText(null)]])));" % json.dumps(pos))
        for (m, txt), c in zip(o, self.courses):
            expect = sum(node("console.log(%s)" % f"C.dist({json.dumps(pos[a])}, {json.dumps(pos[b])})") for a, b in zip(c['spots'], c['spots'][1:]))
            self.assertAlmostEqual(m['m'], expect, places=3)
            self.assertEqual(m['min'] % 5, 0)
            self.assertTrue(abs(m['min'] - m['m'] / 80) <= 2.6 or m['min'] == 5)
            self.assertIn('目安', txt)
            self.assertTrue(500 < m['m'] < 20000)
        self.assertEqual(o[-1], [None, ''])

    def test_mosaic_grows_with_each_course(self):
        o = node("console.log(JSON.stringify([[], ['jokamachi'], ['jokamachi', 'chaen'], ['jokamachi', 'chaen', 'isshiki']].map(d => C.mosaic(d))));")
        blank = lambda rows: ''.join(rows).count('⬜')
        self.assertEqual([blank(r) for r in o], [18, 12, 6, 0])
        self.assertTrue(all(len(r) == 3 for r in o))

    def test_game_checkin_hook_stamps_only_in_order(self):
        src = (GO / 'game.js').read_text(encoding='utf-8')
        fn = re.search(r"^(function courseCheckin\(.*?\n\})", src, re.M | re.S).group(1)
        first, second = self.courses[0]['spots'][:2]
        o = node("""
const S = { course: null }; const lines = [], tracks = []; const track = (k, v) => tracks.push([k, v]); const demo = true; const CO = C;
%s
S.course = C.start(null, 'jokamachi');
const skip = courseCheckin({ id: 'f-%s' }, lines);
const normal = courseCheckin({ id: 'n-%s' }, lines);
courseCheckin({ id: 'f-%s' }, lines);
console.log(JSON.stringify({ skip, normal, n: S.course.n, lines, tracks: tracks.map(t => t[0]) }));""" % (fn, second, first, first))
        self.assertEqual(o['n'], 1)
        self.assertEqual(len(o['lines']), 1)
        self.assertIn('スタンプ 1/', o['lines'][0])
        self.assertEqual(o['tracks'], ['course_stamp'])

    def test_wiring_and_forbidden_words(self):
        html = (ROOT / 'nishio-go.html').read_text(encoding='utf-8')
        self.assertLess(html.index('nishio-go/course.js'), html.index('nishio-go/game.js'))
        c = (GO / 'course.js').read_text(encoding='utf-8')
        for w in ['ぼ' + 'く', 'だ' + 'に', '20' + '%']:   # 差分に 禁止語を 書かない ため つないでおく
            self.assertNotIn(w, c)


if __name__ == '__main__':
    unittest.main()
