"""実製品listenersの所有者判定fixture。DOM/音はstubで、実入力・描画の証拠ではない。"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest

HTML = Path(os.environ.get("KENSA_HTML", Path(__file__).resolve().parents[1] / "kensa.html"))

JS = r"""
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const html = fs.readFileSync(process.argv[1], 'utf8');
function section(from, to) {
  const a = html.indexOf(from), b = html.indexOf(to, a + from.length);
  assert(a >= 0 && b > a && html.indexOf(from, a + from.length) < 0, 'source boundary: ' + from);
  return html.slice(a, b);
}
function fn(name) {
  const from = 'function ' + name + '(';
  const a = html.indexOf(from), b = html.indexOf('\n}', a);
  assert(a >= 0 && b > a && html.indexOf(from, a + from.length) < 0, 'source function: ' + name);
  return html.slice(a, b + 2);
}
const listeners = section('const gradeResets = [];', '/* おす: 朱肉に');
const lifecycle = html.split('\n').filter(s =>
  s === 'window.addEventListener("blur", dropFingers);' ||
  s === 'document.addEventListener("visibilitychange", () => { if (document.hidden) dropFingers(); });').join('\n');
assert.equal(lifecycle.split('\n').length, 2, 'actual lifecycle listeners required');
const product = ['touchPointer', 'pageFinger', 'pickGrade', 'dropFingers'].map(fn).join('\n') + '\n' + listeners + '\n' + lifecycle;
function world() {
  const classes = () => { const values = new Set(); return {
    add: k => values.add(k), remove: k => values.delete(k), contains: k => values.has(k) }; };
  const buttons = Array.from({length:4}, (_, i) => ({
    dataset:{i:String(i)}, style:{transform:''}, classList:classes(), offsetWidth:60, handlers:{},
    addEventListener(t, f) { (this.handlers[t] ||= []).push(f); }, animate() {} }));
  const dots = [{classList:classes(), offsetWidth:10}];
  const events = {win:{}, doc:{}};
  const c = { step:3, LOT:{}, motion:1, pageScrolled:false, commits:0, faces:[], demoSounds:0,
    lotGrade:() => 0, capture:() => {}, guideOff:() => {}, guideAt:() => {}, pop:() => {},
    gradeDemoSound:() => { c.demoSounds++; }, setFace:(s) => { c.faces.push(s); },
    toOsu:() => { c.commits++; c.step = 4; }, pageSlid:e => !!e.pageSlid,
    $:id => { assert.equal(id, 'rows'); return {querySelectorAll:() => dots}; },
    document:{hidden:false, querySelectorAll:s => { assert.equal(s, '.gradeBtn'); return buttons; },
      addEventListener:(t, f) => { (events.doc[t] ||= []).push(f); }},
    addEventListener:(t, f) => { (events.win[t] ||= []).push(f); },
    bagPts:new Map(), meterPts:new Map(), pts:new Map(), P:{drag:null}, crankDrag:null,
    senseDrag:null, senseHold:null, inkHold:null, inkDrag:null, hankoDrag:null, bagSwipe:null,
    nextPress:null, offDown:null, cancelBagPointer:() => {}, cancelMeterPointer:() => {},
    endPlatePointer:() => {}, endToken:() => {}, cancelHanko:() => {} };
  c.window = c;
  vm.createContext(c); vm.runInContext(product, c, {filename:'actual-kensa-grade-listeners.js'});
  return {c, buttons, dots,
    send(type, id, y, button=0, extra={}) {
      const e = {type, pointerId:id, clientX:100, clientY:y, pointerType:'touch',
        buttons:type === 'pointerup' || type === 'pointercancel' ? 0 : 1, detail:1, ...extra};
      for (const f of buttons[button].handlers[type] || []) f(e);
    },
    tap(id, button=0) { this.send('pointerdown', id, 100, button); this.send('pointerup', id, 100, button); },
    life(kind) {
      if (kind === 'blur') for (const f of events.win.blur || []) f();
      else { c.document.hidden = true; for (const f of events.doc.visibilitychange || []) f();
        c.document.hidden = false; for (const f of events.doc.visibilitychange || []) f(); }
    },
    resetBag() { vm.runInContext('gradeResets.forEach(f => f())', c); }
  };
}
const results = [];
function scenario(name, run) {
  const w = world(), checkpoints = [];
  const check = (label, commits, stage=3) => checkpoints.push({label,
    actual:{commits:w.c.commits, stage:w.c.step}, expected:{commits, stage}});
  run(w, check); results.push({name, checkpoints});
}
scenario('two_pointers_no_borrowed_origin', (w, check) => {
  w.send('pointerdown', 1, 100); w.send('pointerdown', 2, 130);
  w.send('pointermove', 1, 99); check('A moved only 1px; B is owner', 0);
  w.send('pointermove', 2, 106); check('owner B deliberately pulls 24px', 1, 4);
});
scenario('foreign_up_does_not_end_owner', (w, check) => {
  w.send('pointerdown', 1, 100); w.send('pointerdown', 2, 130); w.send('pointerup', 1, 100);
  w.send('pointermove', 2, 106); check('B can finish after A releases', 1, 4);
});
scenario('foreign_cancel_does_not_end_owner', (w, check) => {
  w.send('pointerdown', 1, 100); w.send('pointerdown', 2, 130); w.send('pointercancel', 1, 100);
  w.send('pointermove', 2, 106); check('B can finish after A is cancelled', 1, 4);
});
scenario('three_pointers_last_down_owns', (w, check) => {
  w.send('pointerdown', 1, 100); w.send('pointerdown', 2, 130); w.send('pointerdown', 3, 160);
  w.send('pointermove', 1, 101); w.send('pointermove', 2, 131); check('A and B do not commit C origin', 0);
  w.send('pointermove', 3, 136); check('C deliberately pulls 24px', 1, 4);
});
scenario('owner_released_first_no_implicit_handoff', (w, check) => {
  w.send('pointerdown', 1, 100); w.send('pointerdown', 2, 130); w.send('pointerup', 2, 130);
  w.send('pointermove', 1, 76); w.send('pointerup', 1, 76); check('only B release counts once', 0);
  w.tap(3); check('fresh tap is the second tap', 1, 4);
});
scenario('foreign_released_first_does_not_add_tap', (w, check) => {
  w.send('pointerdown', 1, 100); w.send('pointerdown', 2, 130);
  w.send('pointerup', 1, 100); w.send('pointerup', 2, 130); check('only owner release counts', 0);
  w.tap(3); check('next deliberate tap commits', 1, 4);
});
scenario('owner_cancel_keeps_prior_tap', (w, check) => {
  w.tap(1); check('first tap is only a demo', 0);
  w.send('pointerdown', 2, 100); w.send('pointercancel', 2, 100);
  w.send('pointermove', 2, 76); check('cancelled owner cannot drag', 0);
  w.tap(3); check('cancel did not erase earlier valid tap', 1, 4);
});
scenario('single_pointer_direction_and_boundary', (w, check) => {
  w.send('pointerdown', 1, 100); w.send('pointermove', 1, 124); check('down 24px is not up', 0);
  w.send('pointermove', 1, 77); check('up 23px is insufficient', 0);
  w.send('pointermove', 1, 76); check('up 24px commits', 1, 4);
});
scenario('keyboard_click_detail_zero_only', (w, check) => {
  w.send('click', 1, 100, 0, {detail:1}); check('ordinary compatibility click ignored', 0);
  w.send('click', 1, 100, 0, {detail:0}); check('keyboard activation commits', 1, 4);
});
scenario('wrong_grade_then_correct_grade', (w, check) => {
  w.send('pointerdown', 1, 100, 1); w.send('pointermove', 1, 76, 1); check('wrong choice keeps stage', 0);
  assert(w.buttons[1].classList.contains('sway') && w.dots[0].classList.contains('ping'));
  w.send('pointerdown', 2, 100); w.send('pointermove', 2, 76); check('correct retry commits', 1, 4);
});
scenario('scroll_cancel_is_not_a_tap', (w, check) => {
  w.c.pageScrolled = true; w.send('pointerdown', 1, 100); w.send('pointermove', 1, 76);
  w.send('pointerup', 1, 76, 0, {pageSlid:true}); check('page gesture ignored', 0);
  w.c.pageScrolled = false; w.tap(2); check('first actual tap still does not commit', 0);
  w.tap(3); check('second actual tap commits', 1, 4);
});
scenario('foreign_hover_pen_cannot_borrow_touch_origin', (w, check) => {
  w.send('pointerdown', 1, 100); w.send('pointermove', 9, 50, 0, {pointerType:'pen', buttons:0});
  check('unrelated hover pen cannot commit', 0);
  w.send('pointermove', 1, 76); check('touch owner remains usable', 1, 4);
});
for (const kind of ['blur', 'visibility']) scenario(kind + '_preserves_completed_first_tap', (w, check) => {
  w.tap(1); w.life(kind); check('completed first tap is not a choice', 0);
  w.tap(2); check('lifecycle did not erase tap count', 1, 4);
});
scenario('next_bag_starts_tap_count_over', (w, check) => {
  w.tap(1); w.resetBag(); w.tap(2); check('new bag first tap is only a demo', 0);
  w.tap(3); check('new bag second tap commits', 1, 4);
});
console.log(JSON.stringify(results));
"""


class TestKensaGradePointerOwner(unittest.TestCase):
    def test_actual_grade_listeners_keep_pointer_ownership(self):
        node = shutil.which("node")
        self.assertIsNotNone(node, "Node is required; unavailable runtime is not a pass")
        result = subprocess.run([node, "-e", JS, str(HTML)], capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        cases = json.loads(result.stdout)
        self.assertEqual(len(cases), 15)
        self.assertEqual(len({case["name"] for case in cases}), 15)
        print("grade owner fixture: " + json.dumps(cases, ensure_ascii=False))
        for case in cases:
            self.assertGreater(len(case["checkpoints"]), 0, case["name"])
            for checkpoint in case["checkpoints"]:
                with self.subTest(case=case["name"], checkpoint=checkpoint["label"]):
                    self.assertEqual(checkpoint["actual"], checkpoint["expected"])


if __name__ == "__main__":
    unittest.main()
