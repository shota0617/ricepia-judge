# にしおサイクル119：カラスは つつかない・追いかけない（最初の 1分に 出る「🐦 カラスに 当たると 5秒 おそくなるよ」の 知らせ、つつかれて はじかれる・ぶるっと、お米へ 追ってくる 動きを なくす）
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')
PT = (ROOT / 'tools' / 'playtest.js').read_text(encoding='utf-8')


def grab_fn(name):
    i = PIXEL.index('function %s(' % name)
    return PIXEL[i:PIXEL.index('\n}\n', i) + 2]


def step(crow, rc, rr):
    # 2×5 の 一本道の 通路（x 0〜4, y 0）に カラスを 置き、お米の マス (rc, rr) へ 1歩 どう 動くかを node で
    code = ("const MZ_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];const mzType=(x,y)=>(y===0&&x>=0&&x<=4?1:0);"
            "const mzOpen=(x,y,dx,dy)=>mzType(x+dx,y+dy)===1;Math.random=()=>0;" + grab_fn('mzCrowStep') +
            "const c=%s;const out=[];for(let i=0;i<6;i++){const [dx,dy]=mzCrowStep(c,%d,%d);c.dx=dx;c.dy=dy;c.cx+=dx;c.cy+=dy;out.push([c.cx,c.cy,!!c.chase])}console.log(JSON.stringify(out))" % (json.dumps(crow), rc, rr))
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class Behaviour(unittest.TestCase):
    def test_crow_does_not_chase(self):
        # カラスは x=0 で 右へ 進んでいる。お米は x=4。追いかけるなら 4 まで 行く。追いかけない：うろうろ（ひきかえさない）なので 右へ 進む ことは あるが chase は 立たない
        out = step({'cx': 0, 'cy': 0, 'nx': 0, 'ny': 0, 't': 0, 'dx': 1, 'dy': 0, 'chase': False, 'scared': False}, 4, 0)
        self.assertTrue(all(not ch for _, _, ch in out), out)
        # カラスが 左へ 進んでいる ときも、お米が 右に いるからと ふりむかない（追いかけない）
        out = step({'cx': 2, 'cy': 0, 'nx': 2, 'ny': 2, 't': 0, 'dx': -1, 'dy': 0, 'chase': False, 'scared': False}, 4, 0)
        self.assertEqual(out[0][:2], [1, 0], out)
        self.assertTrue(all(not ch for _, _, ch in out), out)

    def test_scared_crow_still_flees(self):
        out = step({'cx': 2, 'cy': 0, 'nx': 2, 'ny': 0, 't': 0, 'dx': -1, 'dy': 0, 'chase': False, 'scared': True}, 4, 0)
        self.assertEqual(out[0][:2], [1, 0], out)   # お米（x=4）から 遠ざかる


class Static(unittest.TestCase):
    def test_no_peck_no_warning(self):
        for needle in ('function mzCrowHit(', 'MZ_CROW_PEN', 'カラスに 当たると', 'うわっ カラス', 'c.chase = true'):
            self.assertNotIn(needle, PIXEL, needle)
        tick = grab_fn('mzCrowTick')
        self.assertIn('if (scared && d < 0.6) mzCrowShoo(c, now);', tick)   # おいはらうのは そのまま
        self.assertNotIn('mzCrowHit', tick)
        self.assertNotIn('G.toast', tick)

    def test_playtest_expects_no_hit(self):
        self.assertIn('crowA.hit === 0', PT)
        self.assertNotIn('crowA.hit === 1', PT)


if __name__ == '__main__':
    unittest.main()
