"""Behavioral regression for the pointer that is carrying the sense token.

The production handlers, completion, outside-up and page cleanup code are read
from kensa.html. Only DOM geometry, event delivery and the clock are simulated.
KENSA_TEST_HTML can select the unchanged baseline for a same-byte RED run.
"""

import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest


def production_sections(html):
    def section(start, stop, inclusive=False):
        begin = html.index(start)
        end = html.index(stop, begin)
        return html[begin:end + (len(stop) if inclusive else 0)]

    return "\n".join([
        section("const READ_MS = Object.freeze({", "\nconst STEPS ="),
        section("function capture(el, e) {", "function startLot() {"),
        section("const SENSES =", "function toKimeru() {"),
        section("let offDown = null;", "\narmIdle();"),
        section(
            "function dropFingers() {",
            'document.addEventListener("visibilitychange", () => { if (document.hidden) dropFingers(); });',
            inclusive=True,
        ),
    ])


WORLD = r"""
const assert = require('node:assert/strict');
const caseEvidence = [];
let now = 0, timerId = 0, timers = new Map(), animations = [], captures = new Map();
let captureAttempts = [], captureFailure = false, guideCalls = [], guideOffs = 0;
let faceCalls = [], kimeruCalls = 0, lotIndex = 0, wet = false, finePointer = false;
let motion = CASE_MOTION, keyFocuses = 0;
function setTimeout(fn, delay) {
  const id = ++timerId; timers.set(id, { at:now + delay, fn }); return id;
}
function clearTimeout(id) { timers.delete(id); }
function advance(ms) {
  const until = now + ms;
  for (;;) {
    const next = [...timers].filter(([,t]) => t.at <= until)
      .sort((a,b) => a[1].at - b[1].at || a[0] - b[0])[0];
    if (!next) break;
    timers.delete(next[0]); now = next[1].at; next[1].fn();
  }
  now = until;
}
function eventTarget(id, parent=null) {
  const el = { id, parentElement:parent, hidden:false, style:{}, textContent:'',
    className:'', handlers:{}, children:[],
    addEventListener(type, fn, options) {
      (this.handlers[type] ||= []).push({ fn, capture:options === true || !!options?.capture });
    },
    contains(node) { for (let n=node; n; n=n.parentElement) if (n===this) return true; return false; },
    closest(selectors) {
      for (let n=this; n; n=n.parentElement) {
        if (selectors.split(',').some(s => {
          s=s.trim(); return s[0]==='#' ? n.id===s.slice(1) : s[0]==='.' && n.classList.contains(s.slice(1));
        })) return n;
      }
      return null;
    },
    appendChild(child) { child.parentElement=this; this.children.push(child); },
    setPointerCapture(id) { captureAttempts.push(id); if (captureFailure) throw Error('capture unavailable'); captures.set(id,this); },
    hasPointerCapture(id) { return captures.get(id)===this; },
    releasePointerCapture(id) { captures.delete(id); },
    focus() { keyFocuses++; },
    animate(frames,opt) { const a={ frames,opt,onfinish:null }; animations.push(a); return a; },
  };
  el.classList = {
    contains(c) { return el.className.split(/\s+/).includes(c); },
    add(...cs) { el.className=[...new Set([...el.className.split(/\s+/).filter(Boolean),...cs])].join(' '); },
    remove(...cs) { el.className=el.className.split(/\s+/).filter(c=>c && !cs.includes(c)).join(' '); },
    toggle(c,on) { const yes=on===undefined ? !this.contains(c) : on; yes ? this.add(c) : this.remove(c); return yes; },
  };
  return el;
}
const app=eventTarget('app'), stage=eventTarget('stage',app), head=eventTarget('head',app);
const elements = { senseToken:eventTarget('senseToken',stage), face:eventTarget('face',head),
  hint:eventTarget('hint',app), notesLink:eventTarget('notesLink',head) };
const $ = id => { if (!elements[id]) throw Error('Unexpected DOM dependency '+id); return elements[id]; };
const hint=elements.hint, document=eventTarget('document'), window=eventTarget('window');
document.hidden=false; document.createElement=tag=>eventTarget(tag);
const START={x:195,y:509.09375}, FACE={x:42,y:44.71875};
const DX=FACE.x-START.x, DY=FACE.y-START.y;
function offset() {
  const value=elements.senseToken.style.transform || '';
  const m=/^translate\(([-+\d.e]+)px,\s*([-+\d.e]+)px\)$/.exec(value);
  if (!m && value) throw Error('Unexpected token transform '+value);
  return m ? {x:Number(m[1]),y:Number(m[2])} : {x:0,y:0};
}
elements.senseToken.getBoundingClientRect=()=>{
  const o=offset(); return {left:START.x-48+o.x,top:START.y-48+o.y,width:96,height:96};
};
elements.face.getBoundingClientRect=()=>({left:12,top:14.71875,width:60,height:60});
function guideAt(mode,el,dx,dy) { guideCalls.push({mode,id:el.id,dx,dy}); }
function guideOff() { guideOffs++; }
function resetZoom() {}
function focusIfKeys() {}
function grainSprite() { return 'local-grain-fixture'; }
const LOT={moisture:[14.2]};
function lotPercents() { return {}; }
function itemGrades() { return {moisture:wet ? 3 : 1}; }
function setFace(mood,ms) { faceCalls.push({mood,ms}); }
function tone() {}
function tick() {}
function toKimeru() { kimeruCalls++; }
let step=2, badLeft=0, spread=true, leaving=false, stamped=false, inked=false;
let inkHold=null, inkDrag=null, hankoDrag=null, bagSwipe=null, nextPress=null, crankDrag=null;
let measured=0; const P={done:false,auto:false,drag:null,x:0};
const bagPts=new Map(), meterPts=new Map(), pts=new Map(), demoDown=new Map();
const grains=[];
function unexpected(name) { throw Error('Unexpected unrelated game path '+name); }
const cancelBagPointer=()=>unexpected('bag'), cancelMeterPointer=()=>unexpected('meter');
const endPlatePointer=()=>unexpected('plate'), cancelHanko=()=>unexpected('hanko');
const endBagDrag=()=>unexpected('bag end'), endCrank=()=>unexpected('crank end');
const knockSound=()=>unexpected('knock'), nudgeSpread=()=>unexpected('spread');
const gradeNudge=()=>unexpected('grade'), stopBob=()=>unexpected('bob'), endHanko=()=>unexpected('stamp');
const swipeNudge=()=>unexpected('bag swipe');
"""


HELPERS = r"""
function emit(el,type,e,capture=null) {
  for (const listener of el.handlers[type] || []) {
    if (capture===null || listener.capture===capture) listener.fn(e);
  }
}
function input(type,id,x=START.x,y=START.y,extra={}) {
  let target=extra.target || token;
  if (['pointermove','pointerup','pointercancel'].includes(type) && captures.has(id)) target=captures.get(id);
  const e={type,pointerId:id,clientX:x,clientY:y,pointerType:'touch',buttons:1,...extra,target};
  if (type==='lostpointercapture') captures.delete(id);
  if (type==='pointerleave' || type==='lostpointercapture') {
    if (target===token || token.contains(target)) emit(token,type,e);
    return e;
  }
  emit(document,type,e,true);
  if (target===token || token.contains(target)) emit(token,type,e);
  emit(document,type,e,false);
  emit(window,type,e);
  if (type==='pointerup' || type==='pointercancel') captures.delete(id);
  return e;
}
function begin(kind='niou') {
  lotIndex={niou:0,kamu:1,nigiru:2}[kind]; toSense();
  guideCalls=[]; guideOffs=0;
}
function near(actual,expected,label) { assert.ok(Math.abs(actual-expected)<1e-7,`${label}: ${actual} != ${expected}`); }
function position(x,y=0) { const p=offset(); near(p.x,x,'token x'); near(p.y,y,'token y'); }
function record(label) {
  caseEvidence.push({label,at:now,offset:offset(),active:!!senseDrag,hold:!!senseHold,
    taps:senseTaps,fly:senseFly,hidden:token.hidden,animations:animations.length,
    guides:guideCalls.length,pagePointers:pageDowns.size});
}
function down(id=1,x=START.x,y=START.y,extra={}) { return input('pointerdown',id,x,y,extra); }
function move(id,dx,dy=0,extra={}) { return input('pointermove',id,START.x+dx,START.y+dy,extra); }
function moving(kind='niou',id=1,extra={}) { begin(kind); down(id,START.x,START.y,extra); move(id,24,0,extra); position(24); }
function release(id=1,dx=0,dy=0,type='pointerup',extra={}) { return input(type,id,START.x+dx,START.y+dy,extra); }
function activeAt(x,y=0) { position(x,y); assert.ok(senseDrag,'owner was lost'); assert.equal(senseTaps,0); assert.equal(animations.length,0); assert.equal(token.hidden,false); }
function carry(fraction,id=1) { down(id); move(id,DX*fraction,DY*fraction); }
function animationOffset(value) {
  const m=/^translate\(([-+\d.e]+)px,\s*([-+\d.e]+)px\)$/.exec(value);
  assert.ok(m,'numeric carry animation expected'); return {x:Number(m[1]),y:Number(m[2])};
}
"""


def cases():
    result = []

    def add(name, body, motion=1):
        result.append({"name": name, "body": body, "motion": motion})

    add("diagnostic diagonal carry keeps both coordinates after a stationary second finger", """
begin(); down(1); move(1,-24,-24); position(-24,-24);
down(2,START.x-54,START.y-54); record('diagnostic stationary second finger'); activeAt(-24,-24);
move(1,-48,-48); record('diagnostic owner continuation'); activeAt(-48,-48);
release(2,-54,-54); activeAt(-48,-48);
release(1,-48,-48,'pointercancel'); position(0); assert.equal(senseDrag,null); assert.equal(senseTaps,0);
""")
    for kind in ("niou", "kamu"):
        add(f"{kind}: stationary second finger cannot shift moving origin", f"""
moving('{kind}'); down(2,START.x+54,START.y); record('second down'); activeAt(24);
move(1,48); record('owner continuation'); activeAt(48);
release(2,54); activeAt(48); release(1,48); position(0);
assert.equal(senseTaps,1); assert.equal(guideCalls.length,1);
""")
        for foreign_type in ("touch", "mouse", "pen"):
            add(f"{kind}: foreign {foreign_type} movement and hover", f"""
moving('{kind}'); down(2,START.x+54,START.y,{{pointerType:'{foreign_type}'}});
move(2,84,0,{{pointerType:'{foreign_type}',buttons:1}}); record('foreign contact move'); activeAt(24);
move(2,96,0,{{pointerType:'{foreign_type}',buttons:0}}); activeAt(24);
move(1,48); activeAt(48);
""")
        for finish in ("pointerup", "pointercancel", "lostpointercapture"):
            add(f"{kind}: foreign {finish} keeps the carry", f"""
moving('{kind}'); down(2,START.x+54,START.y);
release(2,54,0,'{finish}'); record('foreign end'); activeAt(24);
move(1,48); activeAt(48);
""")
        for prefix, old_end in ((0,"pointerup"),(3,"pointercancel"),(6,"lostpointercapture")):
            add(f"{kind}: handoff after {prefix}px ignores old {old_end}", f"""
begin('{kind}'); down(1); move(1,{prefix}); position({prefix});
down(2,START.x+{prefix}+30,START.y); position({prefix});
release(1,{prefix},0,'{old_end}'); record('old owner ends after handoff'); activeAt({prefix});
move(2,{prefix}+54); record('new owner moves'); activeAt(24);
release(2,{prefix}+54); position(0); assert.equal(senseTaps,1);
""")
    for order in ((2,3),(3,2)):
        add(f"three fingers end in order {order}", f"""
moving(); down(2,START.x+54,START.y); down(3,START.x+60,START.y);
move(2,90); move(3,110); activeAt(24);
release({order[0]},60); activeAt(24); release({order[1]},60,0,'pointercancel'); activeAt(24);
move(1,48); activeAt(48);
""")
    add("pointer id zero is an owner", """
moving('niou',0); down(2,START.x+54,START.y); release(2,54); move(0,48); activeAt(48);
release(0,48,0,'pointercancel'); position(0); assert.equal(senseDrag,null); assert.equal(senseTaps,0);
""")
    add("crossing six pixels and returning does not reopen handoff", """
begin(); down(1); move(1,7); move(1,0); position(0);
down(2,START.x+30,START.y); move(1,24); record('owner returns and moves'); activeAt(24);
""")
    add("same id may restart its origin", """
moving(); down(1,START.x+54,START.y); move(1,72); activeAt(18);
""")
    add("owner first release and captured foreign release count once", """
moving(); down(2,START.x+54,START.y); release(1,24); assert.equal(senseTaps,1);
release(2,54,0,'pointerup',{target:elements.face}); record('late captured foreign up');
assert.equal(senseTaps,1); assert.equal(guideCalls.length,1);
assert.equal(senseDrag,null); assert.equal(pageDowns.size,0);
""")
    add("token descendant down and captured up count once", """
begin('kamu'); assert.equal(token.children.length,1);
down(1,START.x,START.y,{target:token.children[0]}); release(1);
assert.equal(senseTaps,1); assert.equal(guideCalls.length,1);
""")
    for finish in ("pointercancel", "lostpointercapture"):
        add(f"owner {finish} cancels without a miss", f"""
moving(); release(1,24,0,'{finish}'); record('owner cancellation');
position(0); assert.equal(senseDrag,null); assert.equal(senseTaps,0); assert.equal(animations.length,0);
down(4); move(4,30); activeAt(30);
""")
    add("leaving token bounds while captured continues carrying", """
moving(); release(1,24,0,'pointerleave'); move(1,48); activeAt(48);
""")
    add("capture exception preserves single pointer behavior", """
begin(); captureFailure=true; down(1); move(1,24); activeAt(24);
release(1,24,0,'pointercancel'); position(0); assert.equal(senseTaps,0); assert.equal(senseDrag,null);
""")
    for fraction in (0.4, 0.48, 0.5, 0.6):
        reaches = fraction >= 0.5
        add(f"carry fraction {fraction} keeps existing halfway boundary", f"""
begin(); carry({fraction}); release(1,DX*{fraction},DY*{fraction}); record('fraction release');
assert.equal(senseTaps,{0 if reaches else 1}); assert.equal(animations.length,{1 if reaches else 0});
""" + (f"""
assert.equal(senseFly,true); const a=animations[0]; assert.equal(a.opt.duration,220);
const from=animationOffset(a.frames[0].transform), to=animationOffset(a.frames[1].transform);
near(from.x,DX*{fraction},'carry start x'); near(from.y,DY*{fraction},'carry start y');
near(to.x,DX,'carry end x'); near(to.y,DY,'carry end y');
a.onfinish(); assert.equal(token.hidden,true); assert.equal(senseDrag,null); assert.equal(senseFly,false);
assert.equal(hint.textContent,'くんくん… いい におい'); advance(1099); assert.equal(kimeruCalls,0);
advance(1); assert.equal(kimeruCalls,1);
""" if reaches else "position(0); assert.equal(senseFly,false); assert.equal(guideCalls.length,1);"))
    add("arrival completes before release and next sense starts cleanly", """
begin(); carry(0.9); record('contact before release'); assert.equal(token.hidden,true);
assert.equal(senseDrag,null); assert.equal(senseHold,null); assert.equal(senseFly,false);
assert.equal(animations.length,0); release(1,DX*.9,DY*.9); assert.equal(senseTaps,0);
lotIndex=1; toSense(); assert.equal(token.hidden,false); assert.equal(senseTaps,0); position(0);
down(7); move(7,24); activeAt(24);
""")
    add("cancelled seventy percent does not fly or count", """
begin(); carry(.7); release(1,DX*.7,DY*.7,'pointercancel'); position(0);
assert.equal(senseTaps,0); assert.equal(animations.length,0); assert.equal(senseFly,false);
""")
    add("wrong direction and tap retain first second third miss sequence", """
begin(); carry(-.6); release(1,-DX*.6,-DY*.6); assert.equal(senseTaps,1); position(0);
down(2); release(2); assert.equal(senseTaps,2); assert.equal(animations.length,1);
assert.equal(animations[0].opt.duration,560); assert.equal(token.hidden,false);
down(3); release(3); assert.equal(senseTaps,3); assert.equal(animations.length,2);
assert.equal(animations[1].frames[0].transform,'none'); assert.equal(animations[1].opt.duration,360);
animations[1].onfinish(); assert.equal(token.hidden,true);
""")
    add("flying token ignores extra input and idless legacy miss", """
begin(); carry(.6); release(1,DX*.6,DY*.6); down(2); assert.equal(senseDrag,null);
senseDrag={x:10,y:10,moved:false}; endToken({type:'pointerup'});
assert.equal(senseDrag,null); assert.equal(senseTaps,0); assert.equal(animations.length,1);
""")
    for mode in ("no-event", "idless-up", "idless-cancel"):
        invocation = {"no-event":"endToken()", "idless-up":"endToken({type:'pointerup'})", "idless-cancel":"endToken({type:'pointercancel'})"}[mode]
        add(f"legacy {mode} can end an owned carry", f"""
moving(); {invocation}; record('idless end'); position(0); assert.equal(senseDrag,null);
assert.equal(senseTaps,{0 if mode=='idless-cancel' else 1}); assert.equal(animations.length,0);
""")
    for target in ("face", "hint"):
        add(f"real outside document up via {target} counts exactly once", f"""
begin(); input('pointerdown',8,40,40,{{target:elements.{target}}});
input('pointerup',8,40,40,{{target:elements.{target}}});
record('outside miss'); assert.equal(senseTaps,1); assert.equal(guideCalls.length,1); assert.equal(senseDrag,null);
""")
    add("outside miss while carrying or another demo finger is ignored", """
moving(); input('pointerdown',2,40,40,{target:elements.face}); input('pointerup',2,40,40,{target:elements.face}); activeAt(24);
offMiss({x:40,y:40}); activeAt(24); release(1,24,0,'pointercancel');
demoDown.set(9,{}); offMiss({x:40,y:40}); assert.equal(senseTaps,0);
demoDown.clear(); offMiss({x:40,y:40}); assert.equal(senseTaps,1);
""")
    add("page scrolling cancels actual touch without a miss", """
begin(); pageScrolled=true; down(1); move(1,0,80); position(0);
release(1,0,80); assert.equal(senseTaps,0); assert.equal(senseDrag,null); assert.equal(animations.length,0);
""")
    for boundary in ("direct", "blur", "hidden"):
        call = {"direct":"dropFingers()", "blur":"emit(window,'blur',{})", "hidden":"document.hidden=true; emit(document,'visibilitychange',{}); document.hidden=false"}[boundary]
        add(f"real {boundary} cleanup cancels carry and permits next contact", f"""
moving(); down(2,START.x+54,START.y); nextPress={{}}; offDown={{id:99}};
{call}; record('page cleanup'); position(0); assert.equal(senseDrag,null); assert.equal(senseHold,null);
assert.equal(senseTaps,0); assert.equal(animations.length,0); assert.equal(nextPress,null); assert.equal(offDown,null);
down(7); move(7,36); activeAt(36);
""")
    for motion in (1, 0.15):
        add(f"nigiru reaches result at350ms with motion {motion}", """
begin('nigiru'); down(1); advance(349); assert.equal(token.hidden,false); assert.ok(senseHold);
advance(1); record('hold deadline'); assert.equal(token.hidden,true); assert.equal(senseHold,null);
assert.equal(senseDrag,null); assert.equal(hint.textContent,'さらさら…'); assert.equal(senseTaps,0);
advance(1099); assert.equal(kimeruCalls,0); advance(1); assert.equal(kimeruCalls,1);
""", motion)
    add("nigiru replaced hold invalidates the old350ms timer", """
begin('nigiru'); down(1); advance(100); down(2); advance(250);
assert.equal(token.hidden,false); assert.ok(senseHold); advance(99); assert.equal(token.hidden,false);
advance(1); assert.equal(token.hidden,true); assert.equal(faceCalls.length,1);
""")
    add("nigiru short taps retain guidance and third-tap result", """
begin('nigiru'); down(1); advance(40); release(1); assert.equal(senseTaps,1); assert.equal(guideCalls.length,1);
advance(400); assert.equal(token.hidden,false);
down(2); advance(40); release(2); assert.equal(senseTaps,2); assert.equal(token.classList.contains('squeeze'),true);
advance(300); assert.equal(token.classList.contains('squeeze'),false); assert.equal(token.hidden,false);
down(3); advance(40); release(3); assert.equal(token.hidden,true); assert.equal(senseTaps,3);
""")
    add("real dropFingers invalidates nigiru timer without a miss", """
begin('nigiru'); down(1); advance(100); emit(window,'blur',{}); assert.equal(senseHold,null);
assert.equal(token.classList.contains('squeeze'),false); advance(400);
assert.equal(token.hidden,false); assert.equal(senseTaps,0); assert.equal(faceCalls.length,0);
""")
    add("keyboard detail-zero activation retains automatic carry", """
begin(); emit(token,'click',{detail:1}); assert.equal(animations.length,0);
emit(token,'click',{detail:0}); assert.equal(animations.length,1); assert.equal(animations[0].opt.duration,360);
animations[0].onfinish(); assert.equal(token.hidden,true); assert.equal(senseTaps,0);
""")
    return result


class SenseDragOwnerTests(unittest.TestCase):
    def test_actual_handlers_keep_carry_owner_and_existing_boundaries(self):
        node = shutil.which("node")
        self.assertIsNotNone(node, "node is required; an unavailable runtime is not a behavioral RED")
        target = Path(os.environ.get("KENSA_TEST_HTML", Path(__file__).resolve().parents[1] / "kensa.html"))
        html = target.read_text(encoding="utf-8")
        product = production_sections(html)
        payload = {"world": WORLD, "product": product, "helpers": HELPERS, "cases": cases()}
        runner = r"""
const vm = require('node:vm'), fs = require('node:fs');
const p = JSON.parse(fs.readFileSync(0,'utf8')), rows=[];
for (const c of p.cases) {
  const context = {require, CASE_MOTION:c.motion};
  vm.createContext(context);
  try {
    vm.runInContext('"use strict";\n'+p.world+'\n'+p.product+'\n'+p.helpers,context,{timeout:1000});
    vm.runInContext('"use strict";\n'+c.body,context,{timeout:1000});
    const evidence=vm.runInContext('record("finished"); caseEvidence',context);
    rows.push({name:c.name,status:'PASS',evidence});
  } catch(e) {
    let evidence=[];
    try { evidence=vm.runInContext('caseEvidence',context); } catch(_) {}
    rows.push({name:c.name,status:e.name==='AssertionError'?'BEHAVIOR_FAIL':'FIXTURE_ERROR',
      errorName:e.name,error:e.message,evidence});
  }
}
process.stdout.write(JSON.stringify({count:rows.length,rows}));
process.exitCode=rows.every(r=>r.status==='PASS')?0:1;
"""
        completed = subprocess.run(
            [node, "-e", runner], input=json.dumps(payload), capture_output=True, text=True, timeout=30,
        )
        self.assertIn(completed.returncode, (0, 1), completed.stderr)
        self.assertTrue(completed.stdout, "fixture produced no report: " + completed.stderr)
        report = json.loads(completed.stdout)
        self.assertEqual(report["count"], len(cases()))
        self.assertEqual([r["name"] for r in report["rows"]], [c["name"] for c in cases()])
        print("SENSE_OWNER_CASES " + json.dumps(report, ensure_ascii=False))
        for row in report["rows"]:
            with self.subTest(case=row["name"]):
                self.assertEqual(row["status"], "PASS", json.dumps(row, ensure_ascii=False))


if __name__ == "__main__":
    unittest.main()
