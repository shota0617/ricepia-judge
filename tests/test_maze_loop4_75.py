"""第4弾サイクル75：西尾めいろは数えないで始める（3・2・1と ばねの残り秒数を廃止）"""
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILE = ROOT / "nishio-go" / "meiro.js"


def raw():
    return FILE.read_text(encoding="utf-8")


def code():
    out = []
    for line in raw().splitlines():
        if line.lstrip().startswith("//"):
            continue
        out.append(re.sub(r"\s//.*$", "", line))
    return "\n".join(out)


def func(c, head):
    i = c.index(head)
    j = c.index("\n}\n", i)
    return c[i:j]


class TestMaze75(unittest.TestCase):
    def test_no_countdown(self):
        c = code()
        self.assertNotRegex(c, r"\bCD\b")
        self.assertNotIn("game.cd", c)
        self.assertNotIn("g.cd", c)
        self.assertNotIn("cdReset", c)
        self.assertNotIn("スマホを まっすぐ 持ってね", c)
        self.assertNotIn("strokeText(String(n)", c)
        self.assertNotIn("fillText(String(n)", c)

    def test_restart_tilt_reset_and_tick(self):
        c = code()
        self.assertIn("api.tiltReset", func(c, "function restart("))
        t = func(c, "function tick(")
        self.assertNotIn(".cd", t)
        self.assertIn("if (!g.done && ui.clear.hidden)", t)
        self.assertIn("step(1 / 120)", t)

    def test_hud_no_seconds(self):
        c = code()
        self.assertNotIn("Math.ceil(g.spring.left)", c)
        line = [l for l in c.splitlines() if "ui.time.textContent" in l and "ばね" in l][0]
        self.assertIn("' ばね'", line)
        self.assertNotIn("${", line.split("' ばね'")[1])

    def test_ring_no_blink_uses_fraction(self):
        c = code()
        self.assertNotIn("Math.floor(now / 160)", c)
        self.assertNotIn("g.spring.left < 2", c)
        self.assertIn("g.spring.left / SPRING_S", c)
        ring = c[c.index("const fr = "):]
        ring = ring[:ring.index("x.stroke();")]
        self.assertNotIn("Math.sin(now", ring)
        self.assertIn("fr", ring.split("rgba(")[1])

    def test_alpha_monotonic(self):
        # 実装式 alpha = 0.2 + 0.65 * fr, radius = 0.34 + 0.06 * fr（fr = left / SPRING_S）
        self.assertIn("(0.2 + 0.65 * fr)", raw())
        self.assertIn("T * (0.34 + 0.06 * fr)", raw())
        a = [0.2 + 0.65 * f / 100 for f in range(100, -1, -1)]
        self.assertTrue(all(x > y for x, y in zip(a, a[1:])))

    def test_spring_mechanics_kept(self):
        c = code()
        self.assertIn("const SPRING_S = 12", c)
        self.assertIn("g.spring.left = SPRING_S", c)
        self.assertIn("g.spring.boosts++", c)
        self.assertIn("api.boing", c)

    def test_unpacking_header(self):
        self.assertIn("Unpacking", "\n".join(raw().splitlines()[:12]))

    def test_node_check(self):
        r = subprocess.run(["node", "--check", str(FILE)], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)


if __name__ == "__main__":
    unittest.main()
