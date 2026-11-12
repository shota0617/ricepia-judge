"""表示中の手本を押したら、その指先へ歩く。矢印だけのタップは変えない。"""
import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
PIX = (ROOT / "nishio-go" / "pixel.js").read_text(encoding="utf-8")


def function(name):
    """直す前にもある関数をそのまま動かす。新しい状態の形には依存しない。"""
    start = PIX.index("function " + name + "(")
    end = PIX.index("\n", start)
    if PIX[start:end].rstrip().endswith("}"):
        return PIX[start:end] + "\n"
    return PIX[start:PIX.index("\n}\n", start) + 3]


def run_case(action):
    constants = next(line for line in PIX.splitlines() if line.startswith("const DEMO_TAP_R = "))
    code = """
let now = 5000, worldMode = false, driving = false, safeTip = true, tileShift = 0;
const performance = { now: () => now }, G = { demo: true };
const howtoEl = { hidden: true }, rp = { x: 1 }, tapS = { goal: null };
const mzRt = { path: [[0, 0], [1, 0]] }, tiltG = { asked: true };
const DEMO_SLOP_PX = 18, walks = [];
let rect = { left: 352, top: 84, right: 396, bottom: 122, width: 44, height: 38 };
const tapDemo = {
  el: { hidden: false, getBoundingClientRect: () => ({ ...rect }) },
  ph: { hidden: true }, at: 0, last: null, sp: { x: 374, y: 70 }
};
const tapDemoWalks = () => safeTip;
const tapDemoSpot = () => null, tiltBtnWanted = () => false;
const swipeTile = (x, y) => [Math.floor(x / 16) + tileShift, Math.floor(y / 16)];
const tapWalk = (x, y) => { walks.push([x, y]); return true; };
const down = (x, y) => tapDemoTouch({ type: 'pointerdown', clientX: x, clientY: y });
"""
    code += constants + "\n" + "\n".join(function(name) for name in ["tapDemoTouch", "tapDemoHide", "demoTapWalk"])
    code += "\n" + action
    result = subprocess.run(["node", "-e", code], capture_output=True, text=True, timeout=10)
    if result.returncode:
        raise AssertionError(result.stderr[:2000])
    return json.loads(result.stdout)


class VisibleHandTap(unittest.TestCase):
    def test_animated_hand_body_walks_to_the_tip(self):
        """実測: 指先(374,70)・見えた手の中央(374,103)。短い/長い押下で進む。"""
        for hold_ms in [40, 250]:
            with self.subTest(hold_ms=hold_ms):
                result = run_case(f"""
down(374, 103); now += {hold_ms};
console.log(JSON.stringify({{ accepted: demoTapWalk(374, 103), walks }}));
""")
                self.assertEqual(result, {"accepted": True, "walks": [[23, 4]]})

    def test_upward_animated_hand_uses_its_rendered_bounds(self):
        result = run_case("""
tapDemo.sp = { x: 374, y: 200 };
rect = { left: 352, top: 148, right: 396, bottom: 186, width: 44, height: 38 };
down(374, 167);
console.log(JSON.stringify({ accepted: demoTapWalk(374, 167), walks }));
""")
        self.assertEqual(result, {"accepted": True, "walks": [[23, 12]]})

    def test_reduced_motion_hand_uses_its_rendered_bounds(self):
        result = run_case("""
rect = { left: 352, top: 70, right: 396, bottom: 108, width: 44, height: 38 };
down(374, 89);
console.log(JSON.stringify({ accepted: demoTapWalk(374, 89), walks }));
""")
        self.assertEqual(result, {"accepted": True, "walks": [[23, 4]]})

    def test_outside_hand_keeps_the_arrow_tap(self):
        for press in ["down(374, 130)",
                      "tapDemoTouch({ type: 'pointerdown', clientX: 374, clientY: 103, button: 2 })"]:
            with self.subTest(press=press):
                result = run_case(f"""
{press};
console.log(JSON.stringify({{ accepted: demoTapWalk(374, 103), walks }}));
""")
                self.assertEqual(result, {"accepted": False, "walks": []})
        result = run_case("""
down(374, 130);
console.log(JSON.stringify({ accepted: demoTapWalk(374, 130), walks }));
""")
        self.assertEqual(result, {"accepted": False, "walks": []})

    def test_hidden_hand_does_not_claim_a_tap(self):
        result = run_case("""
tapDemo.el.hidden = true; tapDemo.sp = null;
down(374, 103);
console.log(JSON.stringify({ accepted: demoTapWalk(374, 103), walks }));
""")
        self.assertEqual(result, {"accepted": False, "walks": []})

    def test_expired_hand_does_not_claim_a_tap(self):
        result = run_case("""
down(374, 103); now += 1501;
console.log(JSON.stringify({ accepted: demoTapWalk(374, 103), walks }));
""")
        self.assertEqual(result, {"accepted": False, "walks": []})

    def test_keyboard_does_not_claim_the_hand_area(self):
        for earlier_press in ["", "down(374, 103);"]:
            with self.subTest(earlier_press=bool(earlier_press)):
                result = run_case(earlier_press + """
tapDemoTouch({ type: 'keydown', key: 'ArrowRight' });
console.log(JSON.stringify({ accepted: demoTapWalk(374, 103), walks }));
""")
                self.assertEqual(result, {"accepted": False, "walks": []})

    def test_press_and_release_must_both_be_on_the_hand(self):
        for press, release in [(103, 130), (130, 103)]:
            with self.subTest(press=press, release=release):
                result = run_case(f"""
down(374, {press});
console.log(JSON.stringify({{ accepted: demoTapWalk(374, {release}), walks }}));
""")
                self.assertEqual(result, {"accepted": False, "walks": []})
        result = run_case("""
down(374, 103); down(374, 130);
console.log(JSON.stringify({ accepted: demoTapWalk(374, 103), walks }));
""")
        self.assertEqual(result, {"accepted": False, "walks": []})

    def test_world_car_real_walk_and_instructions_keep_their_controls(self):
        for mode in ["worldMode = true", "driving = true", "G.demo = false", "howtoEl.hidden = false"]:
            with self.subTest(mode=mode):
                result = run_case(f"""
down(374, 103); {mode};
console.log(JSON.stringify({{ accepted: demoTapWalk(374, 103), walks }}));
""")
                self.assertEqual(result, {"accepted": False, "walks": []})

    def test_existing_tip_rules_are_preserved(self):
        for safe_tip in [True, False]:
            with self.subTest(safe_tip=safe_tip):
                result = run_case(f"""
safeTip = {str(safe_tip).lower()}; down(374, 76);
console.log(JSON.stringify({{ accepted: demoTapWalk(374, 76), walks }}));
""")
                self.assertEqual(result, {"accepted": not safe_tip, "walks": [] if safe_tip else [[23, 4]]})

    def test_a_hand_press_is_used_only_once(self):
        result = run_case("""
down(374, 103);
const first = demoTapWalk(374, 103), again = demoTapWalk(374, 103);
console.log(JSON.stringify({ first, again, walks }));
""")
        self.assertEqual(result, {"first": True, "again": False, "walks": [[23, 4]]})

    def test_a_second_finger_can_press_the_visible_hand(self):
        """置いたままの指があっても、受け取れるタップは同じ目的地へ。"""
        result = run_case("""
tapDemoTouch({ type: 'pointerdown', clientX: 374, clientY: 103, isPrimary: false });
console.log(JSON.stringify({ accepted: demoTapWalk(374, 103), walks }));
""")
        self.assertEqual(result, {"accepted": True, "walks": [[23, 4]]})

    def test_moving_the_view_while_pressed_keeps_the_visible_target_tile(self):
        result = run_case("""
down(374, 103); tileShift = 10;
console.log(JSON.stringify({ accepted: demoTapWalk(374, 103), walks }));
""")
        self.assertEqual(result, {"accepted": True, "walks": [[23, 4]]})


if __name__ == "__main__":
    unittest.main()
