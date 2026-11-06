# 第4弾サイクル65：ゴールの 減速（名所の ゴールの 輪に 入ったら、傾きを はなれて すーっと 止まってから「ゴール！」）。運営者の声「転がす楽しさ」の「ゴールに 吸いこまれる 感じ」「ゴール直前の 減速と 演出」
import json
import math
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GO = ROOT / 'nishio-go'
RS_SRC = (GO / 'rollsync.js').read_text(encoding='utf-8')
PIXEL = (GO / 'pixel.js').read_text(encoding='utf-8')
GAME = (GO / 'game.js').read_text(encoding='utf-8')


def run(expr):
    code = "require(%s);const r=globalThis.nishioRollSync;console.log(JSON.stringify(%s))" % (json.dumps(str(GO / 'rollsync.js')), expr)
    out = subprocess.run(['node', '-e', code], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


class Pure(unittest.TestCase):
    def test_constants(self):
        self.assertEqual(run('[r.SETTLE_B,r.SETTLE_V,r.SETTLE_MS]'), [7, 0.6, 800])

    def test_settle_k(self):
        self.assertAlmostEqual(run('r.settleK(1/120)'), math.exp(-7 / 120), places=9)
        self.assertEqual(run('r.settleK(0)'), 1)
        for e in ['NaN', '-1', '"a"', 'undefined', 'Infinity']:
            self.assertEqual(run('r.settleK(%s)' % e), 1, e)
        self.assertAlmostEqual(run('r.settleK(5)'), math.exp(-0.7), places=9)   # 長い こまは 0.1秒 まで

    def test_settle_time(self):
        # いちばん速い 7 から 0.6 まで：1/120秒 刻みで 0.3〜0.4秒（傾き・坂は はなれている）
        n = run('(()=>{let v=7,n=0;while(v>=r.SETTLE_V&&n<1000){v*=r.settleK(1/120);n++}return n})()')
        self.assertGreaterEqual(n / 120, 0.3)
        self.assertLessEqual(n / 120, 0.4)

    def test_settle_done(self):
        self.assertTrue(run('r.settleDone(0.59,0)'))
        self.assertFalse(run('r.settleDone(0.6,0)'))
        self.assertFalse(run('r.settleDone(3,799)'))
        self.assertTrue(run('r.settleDone(3,800)'))   # 止まらなくても 0.8秒で おわり（坂で 止まらない ときの 安全弁）
        self.assertTrue(run('r.settleDone(NaN,NaN)'))
        self.assertTrue(run('r.settleDone(-0.1,0)'))


class Static(unittest.TestCase):
    def test_rollstep_settles_before_sync(self):
        i = PIXEL.index('function rollStep(')
        body = PIXEL[i:i + 9000]
        self.assertIn('if (mazeOn()) mzGoalInTick(performance.now());', body)
        self.assertIn('if (mzGoalIn.on) { fx = fy = 0;', body)   # 傾き・坂を はなれる
        self.assertIn('rp.vx *= k; rp.vy *= k;', body)
        self.assertLess(body.index('mzGoalInTick(performance.now())'), body.index('const fp = Math.hypot(fx, fy);'))
        self.assertLess(body.index('if (mzGoalIn.on) { fx = fy = 0;'), body.index('const fp = Math.hypot(fx, fy);'))

    def test_goal_in_tick(self):
        i = PIXEL.index('function mzGoalInTick(')
        body = PIXEL[i:PIXEL.index('\n}\n', i)]
        self.assertIn("g.kind !== 'npc'", body)   # 人の ゴールは これまでどおり
        self.assertIn("'g:' + mzRt.gkey", body)   # 回ごとに 1回（t0 は ずらすので 鍵に しない）
        self.assertIn('G.guideRadius', body)   # 着いたと みなす 近さ（game.js と 同じ）
        self.assertIn('mzGoalIn.tried = key', body)
        self.assertIn('mzRt.t0 += now - mzGoalIn.t0', body)   # 止まる 間は 時計から のぞく
        self.assertIn('RS.settleDone(Math.hypot(rp.vx, rp.vy), now - mzGoalIn.t0)', body)
        self.assertIn('roll.hv = 1.8', body)   # 輪に 入った：ちょこんと はねる

    def test_arrive_waits_and_game_holds(self):
        i = PIXEL.index('function mzArriveTick(')
        body = PIXEL[i:i + 2000]
        self.assertIn('if (mzGoalIn.on) return;', body)
        self.assertIn('if (mzGoalIn.on) mzGoalIn.t0 += gap;', body)   # 窓の 間は 止まる 時間も 止める
        j = GAME.index('function checkGuide(')
        gbody = GAME[j:j + 3000]
        self.assertIn('PX.maze.goalHold()', gbody)
        self.assertLess(gbody.index('if (dist(me, g) > guideRadius(g) || !fixOk()) return;'), gbody.index('PX.maze.goalHold()'))
        self.assertIn('goalHold: () => mzGoalIn.on', PIXEL)


if __name__ == '__main__':
    unittest.main()
