from pathlib import Path
import unittest


PIX = (Path(__file__).resolve().parents[1] / "nishio-go" / "pixel.js").read_text(encoding="utf-8")
TOUCH = PIX[PIX.index("const riceTouch ="):PIX.index("/* ---------- 操作 ---------- */")]
MOTION = PIX[PIX.index("window.addEventListener('devicemotion'"):PIX.index("function tiltAsk(event)")]


class TestRicePlayMotion(unittest.TestCase):
    def test_small_hop_uses_existing_animation(self):
        self.assertIn("roll.happyT = Math.max(roll.happyT, 1.2)", TOUCH)
        self.assertIn("if (!calmMotion && roll.h <= 0)", TOUCH)
        self.assertIn("roll.hv = 1.8; roll.h = 0.001;", TOUCH)
        self.assertIn("dirty = true;", TOUCH)

    def test_visible_map_only(self):
        for guard in ("!document.hidden", "!worldMode", "!driving", "!meiroPause", "howtoEl.hidden", "!mapCovered()"):
            self.assertIn(guard, TOUCH)
        self.assertIn("if (!ricePlayReady()) return;", MOTION)

    def test_hit_box_uses_canvas_scale(self):
        self.assertIn("b = roll.box", TOUCH)
        self.assertIn("cv.width / r.width", TOUCH)
        self.assertIn("cv.height / r.height", TOUCH)
        self.assertIn("if (!r.width || !r.height) return false;", TOUCH)
        self.assertIn("!riceTouchNear(e)", TOUCH)

    def test_double_tap_and_drag_limits(self):
        for check in ("!e.isPrimary", "e.button !== 0", "e.pointerId !== d.id", "now - d.at > 400", "now - prev.at <= 360", "<= 28", "> 10"):
            self.assertIn(check, TOUCH)
        self.assertIn("riceTouch.tap = null; ricePlayHop();", TOUCH)
        self.assertIn("'pointercancel', riceTouchReset", TOUCH)
        self.assertIn("'visibilitychange', riceTouchReset", TOUCH)
        self.assertIn("'blur', riceTouchReset", TOUCH)

    def test_existing_input_is_not_consumed(self):
        for call in ("preventDefault(", "stopPropagation(", "setPointerCapture(", "tapWalkStop("):
            self.assertNotIn(call, TOUCH)
            self.assertNotIn(call, MOTION)
        self.assertIn("passive: true", TOUCH)
        self.assertIn("if (dragMoved) return;", PIX)
        self.assertIn("tapWalk(Math.floor(c.x + (x - cv.width / 2) / T)", PIX)

    def test_motion_permission_and_cooldown(self):
        self.assertIn("tiltNeedsPermission()", MOTION)
        self.assertIn("if (needs && !tiltIsOn) return;", MOTION)
        self.assertNotIn("requestPermission()", MOTION)
        self.assertIn("shakeAt: -Infinity", TOUCH)
        self.assertIn("now - riceTouch.shakeAt < 1500", MOTION)
        self.assertIn("riceTouch.shakeAt = now; ricePlayHop();", MOTION)

    def test_acceleration_validation_and_gravity(self):
        for axis in ("x", "y", "z"):
            self.assertIn("Number.isFinite(a." + axis + ")", MOTION)
        self.assertIn("e.accelerationIncludingGravity", MOTION)
        self.assertIn("if (!valid(a)) return;", MOTION)
        self.assertIn("a === e.acceleration ? 0 : 9.81", MOTION)
        self.assertIn("if (strength < 12) return;", MOTION)

    def test_rolling_constants_and_orientation_remain(self):
        self.assertIn("ROLL_ACC = 7, ROLL_MAX = 4.2", PIX)
        self.assertIn("window.addEventListener('deviceorientation'", PIX)
        self.assertIn("const happyFace = () => !calmMotion", PIX)


if __name__ == "__main__":
    unittest.main()
