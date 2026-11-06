# にしおサイクル121：はじめての ゴールまでは 夕立雲を 出さない（最初の 1分、はじめての 人の 足もとに 灰色の 雨雲が 来ない）
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')


def grab_fn(name):
    i = PIXEL.index('function %s(' % name)
    return PIXEL[i:PIXEL.index('\n}\n', i) + 2]


def run(goals, moves):
    # 2×6 の 一本道（x 0〜5, y 0）。お米が スタート (0,0) から となりの マスへ 動いた あと、雲（cx, cy）が 出るか
    code = ("const MZ_K = 3, MZ_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]], MZ_CHASE = { stepMs: 6000, pts: 0, rainMs: 4000 };let dirty = false;"
            "const mzType=(x,y)=>(y===0&&x>=0&&x<=5?1:0);const mzOpen=(x,y,dx,dy)=>mzType(x+dx,y+dy)===1;const lsGet=(k,d)=>(k==='nsg_mzgoals'?'%d':d);"
            "const rp={x:1.5,y:1.5};const mzChase={ sx: -1, sy: -1, cx: -1, cy: -1, fx: -1, fy: -1, moveAt: 0, next: 0, last: 0, caught: false, caughtAt: 0, rainAt: 0, paid: false, dist: -1, dkey: '' };"
            + PIXEL[PIXEL.index('const chaseFirstGoal = '):PIXEL.index('function mzChaseTick(')] + grab_fn('mzChaseTick') +
            "let now=1000;mzChaseTick(now);for(const x of %s){rp.x=x*MZ_K+1.5;now+=500;mzChaseTick(now)}console.log(JSON.stringify({cx:mzChase.cx,cy:mzChase.cy,sx:mzChase.sx}))") % (goals, json.dumps(moves))
    return json.loads(subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout)


class Cloud(unittest.TestCase):
    def test_no_cloud_before_first_goal(self):
        r = run(0, [1, 2, 3])
        self.assertEqual((r['cx'], r['cy'], r['sx']), (-1, -1, -1))   # スタートも おぼえない

    def test_cloud_after_first_goal(self):
        r = run(1, [1, 2])
        self.assertEqual((r['cx'], r['cy'], r['sx']), (0, 0, 0))   # スタートの マスに 浮かぶ（これまでどおり）

    def test_source(self):
        i = PIXEL.index('function mzChaseTick(')
        self.assertIn('if (rp.x === null || chaseFirstGoal()) return;', PIXEL[i:i + 400])
        self.assertIn("lsGet('nsg_mzgoals', '0')", PIXEL[PIXEL.index('const chaseFirstGoal = '):i])


if __name__ == '__main__':
    unittest.main()
