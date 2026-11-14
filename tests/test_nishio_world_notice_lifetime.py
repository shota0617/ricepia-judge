"""Returning from the world map ends only its obsolete return instruction.

Runs the production toast/queue functions and pixel map handlers with a small
DOM and deterministic clock. NISHIO_NOTICE_TEST_ROOT selects the old source
for the same-byte behavioral RED run. This does not simulate CSS rendering.
"""

import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import unittest


def production_sections(root):
    game = (root / "nishio-go/game.js").read_text(encoding="utf-8")
    pixel = (root / "nishio-go/pixel.js").read_text(encoding="utf-8")
    toast_begin = game.index("let toastTimer;")
    toast_end = game.index("\nconst CHIP =", toast_begin)
    toast_code = game[toast_begin:toast_end]
    export_begin = game.index("window.nishioGo = {")
    export_end = game.index("\n};", export_begin)
    exported = game[export_begin:export_end]
    # These production exports use shorthand properties. Read the actual
    # names, including any new toast entry point, instead of injecting one.
    # The selected names must also be real declarations in the toast block.
    # No requirement for a new API name exists: old-source cases reach their
    # visible/queued behavioral assertions using the old public API.
    without_comments = re.sub(r"//[^\n]*", "", exported)
    public_names = re.findall(r"(?:^|,)\s*(toast\w*)\s*(?=,|$)", without_comments, re.M)
    declared = set(re.findall(r"\bfunction\s+(\w+)\s*\(", toast_code))
    if not {"toast", "toastAfter", "toastHold", "toastFlush"} <= set(public_names):
        raise ValueError("production toast shorthand exports were not found")
    if len(public_names) != len(set(public_names)) or not set(public_names) <= declared:
        raise ValueError("ambiguous export extraction or toast declaration outside fixture boundary")
    public_code = "window.nishioGo = {" + ",".join(public_names) + "};\nconst G = window.nishioGo;"
    world_begin = pixel.index("function setWorld(on) {")
    world_end = pixel.index("function worldCamFitGoal() {", world_begin)
    goal_begin = pixel.index("function mzGoalWorld() {")
    goal_end = pixel.index("\n}\n", goal_begin) + 3
    return "\n".join([toast_code, public_code, pixel[world_begin:world_end], pixel[goal_begin:goal_end]])


WORLD = r"""
const assert = require('node:assert/strict');
const TARGET = '🌏 ゴールは 🏁 の 所（👣 で めいろに もどる）';
const A = 'つぎの ゴールへ', B = 'まわりを 見てね', C = '保存を 確かめてね';
const evidence = [], shown = [], hidden = [];
let now = 10000, nextTimer = 0;
const timers = new Map();
function setTimeout(fn, delay) {
  const id = ++nextTimer; timers.set(id, {at:now + delay, fn}); return id;
}
function clearTimeout(id) { timers.delete(id); }
function advance(ms) {
  const end = now + ms;
  let callbacks = 0;
  for (;;) {
    const next = [...timers].filter(([,t]) => t.at <= end)
      .sort((a,b) => a[1].at-b[1].at || a[0]-b[0])[0];
    if (!next) break;
    if (++callbacks > 1000) throw Error('clock exceeded callback bound');
    timers.delete(next[0]); now = next[1].at; next[1].fn();
  }
  now = end;
}
const Date = {now:() => now};
function element(id) {
  const classes = new Set(), listeners = new Map();
  let content='';
  const el = {id, hidden:true, innerHTML:'', title:'', style:{}, offsetWidth:100,
    addEventListener(type, fn) { const handlers=listeners.get(type)||[]; handlers.push(fn); listeners.set(type,handlers); },
    emit(type) { for (const fn of listeners.get(type)||[]) fn({type,target:el}); },
  };
  Object.defineProperty(el,'textContent',{
    get:() => content,
    set(value) {
      if (id==='toast' && classes.has('show') && value!==content) shown.push({at:now,text:value});
      content=value;
    },
  });
  el.classList = {
    contains:c => classes.has(c),
    add(...cs) { for (const c of cs) { if (id==='toast' && c==='show' && !classes.has(c)) shown.push({at:now,text:el.textContent}); classes.add(c); } },
    remove(...cs) { for (const c of cs) { if (id==='toast' && c==='show' && classes.has(c)) hidden.push({at:now,text:el.textContent}); classes.delete(c); } },
    toggle(c,on) { const yes=on===undefined ? !classes.has(c) : !!on; yes ? this.add(c) : this.remove(c); return yes; },
  };
  return el;
}
const elements = Object.fromEntries(['toast','reward','howto','coupon','share','pxWorld','pxMeiro','pxInfo'].map(id=>[id,element(id)]));
const $ = id => { if (!elements[id]) throw Error('Unexpected DOM dependency '+id); return elements[id]; };
const document = {body:element('body'),querySelector:() => null};
const window = {};
const localStorage = {setItem(){}};
const store = {get:(key,fallback) => fallback};
const demo = true;
let worldMode = false, wcam = null;
function ICO(icon,fallback,title) { return fallback; }
function firstWalk() { return true; }
function worldCamStart() { return {}; }
function worldCamFitGoal() {}
function buildWorld() {}
function updatePad() {}
function updateHarvestBtn() {}
function updateDankyuBtn() {}
"""


HELPERS = r"""
function showing(text) { return $('toast').classList.contains('show') && $('toast').textContent===text; }
function snapshot(label) {
  evidence.push({label,at:now,worldMode,show:$('toast').classList.contains('show'),text:$('toast').textContent,
    blockedQueue:[...toastQ],afterQueue:[...(toastAfter.q||[])],
    timer:toastTimer,deadline:timers.get(toastTimer)?.at??null,shown:[...shown],hidden:[...hidden]});
}
function block(on) { $('howto').hidden=!on; }
function enter() { mzGoalWorld(); assert.equal(worldMode,true); }
function leave() { setWorld(false); assert.equal(worldMode,false); }
function expectNoTarget(label) {
  snapshot(label); assert.equal(showing(TARGET),false,'obsolete world-map notice remains visible');
  assert.equal(toastQ.includes(TARGET),false,'obsolete notice remains in blocked queue');
  assert.equal((toastAfter.q||[]).includes(TARGET),false,'obsolete notice remains in delayed queue');
}
"""


def cases():
    result = []

    def add(name, body):
        result.append({"name": name, "body": body})

    add("return button ends visible world-map instruction", r"""
enter(); assert.equal(showing(TARGET),true); assert.equal($('pxWorld').hidden,false);
advance(1300); snapshot('before return'); $('pxWorld').emit('click');
assert.equal(worldMode,false); assert.equal($('pxWorld').hidden,true); expectNoTarget('after return');
advance(10000); assert.equal(shown.filter(x=>x.text===TARGET).length,1);
""")
    add("staying in world map preserves full reading time", r"""
enter(); advance(3799); snapshot('one millisecond before expiry'); assert.equal(showing(TARGET),true);
advance(1); assert.equal(showing(TARGET),false); assert.equal(worldMode,true);
""")
    add("repeated world instruction extends its own reading time", r"""
enter(); advance(1000); mzGoalWorld(); advance(3799); assert.equal(showing(TARGET),true);
advance(1); assert.equal(showing(TARGET),false);
""")
    for name, message in [
        ("new goal", "つぎの ゴールへ"),
        ("safety notice", "まわりを 見てね"),
        ("save notice", "保存を 確かめてね"),
        ("similar but different text", "🌏 ゴールは 🏁 の 所（👣 で めいろに もどる） 続き"),
    ]:
        add("return preserves " + name, "const other=" + json.dumps(message, ensure_ascii=False) + r""";
enter(); advance(500); G.toast(other); const deadline=timers.get(toastTimer).at, id=toastTimer;
advance(800); leave(); snapshot('unrelated remains');
assert.equal(showing(other),true); assert.equal(toastTimer,id); assert.equal(timers.get(id).at,deadline);
advance(deadline-now-1); assert.equal(showing(other),true); advance(1); assert.equal(showing(other),false);
""")
    add("return preserves an unrelated shortened deadline and queue order", r"""
enter(); G.toastAfter(B); G.toastAfter(C); G.toast(A);
const id=toastTimer, deadline=timers.get(id).at; assert.equal(deadline-now,2400);
advance(1300); leave(); snapshot('short deadline unchanged');
assert.equal(showing(A),true); assert.equal(toastTimer,id); assert.equal(timers.get(id).at,deadline);
advance(deadline-now-1); assert.equal(showing(A),true); advance(1); assert.equal(showing(A),false);
advance(15000); assert.deepEqual(shown.filter(x=>x.text!==TARGET).map(x=>x.text),[A,B,C]);
""")
    add("blocked obsolete notice does not return after flush", r"""
block(true); enter(); assert.deepEqual([...toastQ],[TARGET]); leave(); expectNoTarget('blocked target removed');
block(false); G.toastFlush(); advance(10000); assert.equal(shown.length,0);
""")
    add("mixed blocked queue keeps unrelated order", r"""
block(true); G.toast(A); enter(); G.toast(B); leave(); expectNoTarget('mixed blocked target removed');
assert.deepEqual([...toastQ],[A,B]); block(false); G.toastFlush(); advance(15000);
assert.deepEqual(shown.map(x=>x.text),[A,B]);
""")
    add("pending delayed callback cannot revive removed notice", r"""
setWorld(true); G.toastAfter(TARGET); advance(100); leave(); expectNoTarget('before pending callback');
advance(10000); assert.equal(shown.length,0);
""")
    add("delayed callback retains unrelated messages around removed target", r"""
setWorld(true); G.toast(A); G.toastAfter(TARGET); G.toastAfter(B); G.toastAfter(C);
const id=toastTimer, deadline=timers.get(id).at; advance(100); leave(); expectNoTarget('delayed target removed');
assert.equal(showing(A),true); assert.equal(toastTimer,id); assert.equal(timers.get(id).at,deadline);
advance(20000); assert.deepEqual(shown.map(x=>x.text),[A,B,C]);
""")
    add("young held notice cannot reappear after returning", r"""
enter(); advance(500); block(true); G.toastHold(); assert.deepEqual([...toastQ],[TARGET]);
assert.equal(showing(TARGET),false); leave(); expectNoTarget('held target removed');
block(false); G.toastFlush(); advance(10000); assert.equal(shown.filter(x=>x.text===TARGET).length,1);
""")
    add("targets in both queues are removed while another notice survives", r"""
enter(); advance(500); block(true); G.toastHold(); G.toastAfter(TARGET); G.toast(A);
assert.equal(toastQ.includes(TARGET),true); assert.equal(toastAfter.q.includes(TARGET),true);
leave(); expectNoTarget('both queues'); block(false); G.toastFlush(); advance(15000);
assert.deepEqual(shown.map(x=>x.text),[TARGET,A]);
""")
    add("expired target text does not discard another pending notice", r"""
enter(); advance(3800); assert.equal($('toast').textContent,TARGET); assert.equal(showing(TARGET),false);
G.toastAfter(A); leave(); leave(); advance(150); assert.equal(showing(A),true);
advance(3799); assert.equal(showing(A),true); advance(1); assert.equal(showing(A),false);
""")
    add("repeated return clears obsolete timer and preserves a later notice", r"""
enter(); const oldId=toastTimer, oldDeadline=timers.get(oldId).at; advance(1300); leave(); expectNoTarget('first return');
assert.equal(timers.has(oldId),false,'obsolete hide timer must be cancelled'); leave();
advance(100); G.toast(A); const deadline=timers.get(toastTimer).at; leave();
advance(oldDeadline-now); assert.equal(showing(A),true); advance(deadline-now-1); assert.equal(showing(A),true);
advance(1); assert.equal(showing(A),false);
""")
    add("re-entering world map gives the new notice its full reading time", r"""
enter(); const oldDeadline=timers.get(toastTimer).at; advance(1300); leave(); expectNoTarget('first return');
advance(100); enter(); const deadline=timers.get(toastTimer).at; assert.equal(deadline-now,3800);
advance(oldDeadline-now); assert.equal(showing(TARGET),true); advance(deadline-now-1); assert.equal(showing(TARGET),true);
advance(1); assert.equal(showing(TARGET),false); leave(); expectNoTarget('final return');
""")
    add("pending old callback cannot resurrect a re-enqueued then dismissed notice", r"""
setWorld(true); G.toastAfter(TARGET); advance(50); leave(); expectNoTarget('first queue removal');
advance(50); setWorld(true); G.toastAfter(TARGET); advance(200); assert.equal(showing(TARGET),true);
leave(); leave(); expectNoTarget('second removal'); advance(15000);
assert.equal(shown.filter(x=>x.text===TARGET).length,1); assert.equal(showing(TARGET),false);
""")
    return result


class WorldNoticeLifetimeTests(unittest.TestCase):
    def test_actual_world_return_and_toast_lifetimes(self):
        node = shutil.which("node")
        self.assertIsNotNone(node, "node is required; missing runtime is not a behavioral RED")
        root = Path(os.environ.get("NISHIO_NOTICE_TEST_ROOT", Path(__file__).resolve().parents[1]))
        payload = {"world": WORLD, "product": production_sections(root), "helpers": HELPERS, "cases": cases()}
        runner = r"""
const vm=require('node:vm'), fs=require('node:fs');
const p=JSON.parse(fs.readFileSync(0,'utf8')), rows=[];
for (const c of p.cases) {
  const context={require}; vm.createContext(context);
  try {
    vm.runInContext('"use strict";\n'+p.world+'\n'+p.product+'\n'+p.helpers,context,{timeout:1000});
    vm.runInContext('"use strict";\n'+c.body,context,{timeout:1000});
    const evidence=vm.runInContext('snapshot("finished"); evidence',context);
    rows.push({name:c.name,status:'PASS',evidence});
  } catch(e) {
    let evidence=[];
    try { evidence=vm.runInContext('snapshot("failure"); evidence',context); } catch(_) {}
    rows.push({name:c.name,status:e.name==='AssertionError'?'BEHAVIOR_FAIL':'FIXTURE_ERROR',
      errorName:e.name,error:e.message,evidence});
  }
}
process.stdout.write(JSON.stringify({count:rows.length,rows}));
process.exitCode=rows.every(r=>r.status==='PASS')?0:1;
"""
        completed = subprocess.run([node, "-e", runner], input=json.dumps(payload),
                                   capture_output=True, text=True, timeout=30)
        self.assertIn(completed.returncode, (0, 1), completed.stderr)
        self.assertTrue(completed.stdout, "fixture produced no report: " + completed.stderr)
        report = json.loads(completed.stdout)
        self.assertEqual(report["count"], len(cases()))
        self.assertEqual([r["name"] for r in report["rows"]], [c["name"] for c in cases()])
        print("WORLD_NOTICE_CASES " + json.dumps(report, ensure_ascii=False))
        for row in report["rows"]:
            with self.subTest(case=row["name"]):
                self.assertEqual(row["status"], "PASS", json.dumps(row, ensure_ascii=False))


if __name__ == "__main__":
    unittest.main()
