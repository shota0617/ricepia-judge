"""第4弾サイクル163：差7 道しるべ終了の知らせをゴールの演出と厳密に同期する"""
import json
import os
import re
import subprocess
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIX = open(os.path.join(ROOT, "nishio-go", "pixel.js"), encoding="utf-8").read()
TOAST = "🧭 道しるべと ✕ を けしたよ（せっていで また 出せる）"


def body(name):
    m = re.search(r"^function %s\(.*?^}\n" % name, PIX, re.S | re.M)
    assert m, name
    return m.group(0)


class TestHelpToastSync(unittest.TestCase):
    def test_goal_sets_flag_only(self):
        b = body("mzHelpGoal")
        self.assertNotIn("setTimeout", b)
        self.assertIn("mzHelp.helpToast = true", b)
        self.assertIn("n === MZ_HELP_N && lsGet('nsg_mzhelp', 'auto') === 'auto'", b)
        self.assertNotIn("G.toast", b)
        self.assertNotIn("道しるべと", b)

    def test_tick_called_from_frame(self):
        self.assertIn("mzNextHoldTick();\n  mzHelpToastTick();", PIX)
        self.assertIn("helpToast: false }", PIX)

    def test_tick_structure(self):
        b = body("mzHelpToastTick")
        self.assertIn("!mzHelp.helpToast || mzBanner.t0", b)
        self.assertLess(b.index("mzHelp.helpToast = false"), b.index("G.toast("))
        self.assertEqual(b.count(TOAST), 1)
        self.assertNotIn("setTimeout", b)

    def test_tick_behaviour(self):
        js = body("mzHelpToastTick") + """
const run = (flag, t0, hasToast, helpOn) => {
  global.mzHelp = { helpToast: flag }; global.mzBanner = { t0 };
  global.mzHelpOn = () => !!helpOn;
  const calls = []; global.G = hasToast ? { toast: t => calls.push(t) } : {};
  mzHelpToastTick(); mzHelpToastTick();
  return { calls, flag: mzHelp.helpToast };
};
const seq = () => {   // 凍結中は待ち続け、バナーが終わった次の確認で1回だけ出す（サイクル163 Codex注記への対応）
  global.mzHelp = { helpToast: true }; global.mzBanner = { t0: 999 };
  global.mzHelpOn = () => false;
  const calls = []; global.G = { toast: t => calls.push(t) };
  mzHelpToastTick(); mzHelpToastTick(); mzHelpToastTick();
  const held = calls.length === 0 && mzHelp.helpToast === true;
  global.mzBanner = { t0: 0 };
  mzHelpToastTick(); mzHelpToastTick();
  return { calls, held, flag: mzHelp.helpToast };
};
console.log(JSON.stringify([run(false, 0, true, false), run(true, 123, true, false), run(true, 0, true, false), run(true, 0, false, false), run(true, 0, true, true), seq()]));
"""
        out = subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout
        a, b, c, d, e, s = json.loads(out)
        self.assertEqual(a, {"calls": [], "flag": False})
        self.assertEqual(b, {"calls": [], "flag": True})
        self.assertEqual(c, {"calls": [TOAST], "flag": False})
        self.assertEqual(d["calls"], [])
        self.assertEqual(e, {"calls": [], "flag": False})   # 待つ間に設定で出し直したら、知らせは出さない
        self.assertEqual(s, {"calls": [TOAST], "held": True, "flag": False})

    def test_unchanged(self):
        m = re.search(r"^const MZ_GOAL_FX = (\{.*?\});", PIX, re.M)
        out = subprocess.run(["node", "-e", "console.log(JSON.stringify(%s))" % m.group(1)], capture_output=True, text=True, check=True).stdout
        self.assertEqual(json.loads(out), dict(n=24, bannerSec=1.6, fadeSec=0.4, lifeMin=0.7, lifeVar=0.4, vMin=1.2, vVar=2.4, up=2.2, happyMs=1600))
        self.assertIn("MZ_HELP_N = 3", PIX)

    def test_help_api(self):
        self.assertIn("helpToast: !!mzHelp.helpToast", PIX)
        self.assertIn("mzHelp.told = false; mzHelp.helpToast = false;", PIX)

    def test_no_banned_words(self):
        added = subprocess.run(["git", "diff", "HEAD", "--", "nishio-go/pixel.js"], capture_output=True, text=True, cwd=ROOT).stdout
        lines = [l for l in added.splitlines() if l.startswith("+") and not l.startswith("+++")]
        for w in ("ぼ" + "く", "だ" + "に", "約20" + "%"):
            self.assertFalse(any(w in l for l in lines), w)


if __name__ == "__main__":
    unittest.main()
