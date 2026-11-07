"""第4弾サイクル148：眺める人の扱い2件（はじめてのさんぽは今のゴールだけへ／無操作カードは手で動かした人にだけ）"""
import json
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
GM = (ROOT / "nishio-go" / "game.js").read_text(encoding="utf-8")
IC = ROOT / "nishio-go" / "idlecard.js"


class TestLoop148(unittest.TestCase):
    def body(self):
        i = PX.index("function idleRollForce()")
        return PX[i:PX.index("function rollStep(", i)]

    def test_first_walk_goal_only(self):
        b = self.body()
        self.assertIn("const fw = firstWalk();", b)
        self.assertIn("if (!tg && fw) {", b)
        self.assertIn("Object.assign({ guide: true }, gEff)", b)
        self.assertIn("if (!fw && !restarted && idleRoll.skip.length)", b)
        self.assertIn("RS.nextIdleTarget(rp.x, rp.y, gEff, list, ex)", b)
        self.assertIn("RS.idleTarget(rp.x, rp.y, list, ex)", b)

    def test_hand_moved_signal(self):
        self.assertIn("window.nsgHandMoved = true", GM)
        js = IC.read_text(encoding="utf-8")
        self.assertIn("s.moved === true", js)
        self.assertIn("moved: window.nsgHandMoved === true", js)

    @unittest.skipUnless(shutil.which("node"), "node が無い")
    def test_should_show_moved(self):
        code = ("global.window={};global.document={readyState:'complete',addEventListener(){},getElementById(){return null},"
                "querySelectorAll(){return []},hidden:false};global.setInterval=()=>0;"
                "require(process.argv[1]);const f=window.NISHIO_IDLE_CARD.shouldShow;"
                "const b={idleSec:45,moved:true,started:true,visible:true,covered:false,shown:false};"
                "console.log(JSON.stringify([f(b),f({...b,moved:false}),f({...b,moved:undefined})]))")
        out = subprocess.run(["node", "-e", code, str(IC)], capture_output=True, text=True, check=True).stdout
        self.assertEqual(json.loads(out), [True, False, False])


if __name__ == "__main__":
    unittest.main()
