"""Behavior regression for a working stamp finger interrupted by another contact."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest

HTML_PATH = Path(os.environ.get("KENSA_HTML", str(Path(__file__).resolve().parents[1] / "kensa.html")))

HARNESS = r''''use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const sourcePath = process.argv.at(-1);
const html = fs.readFileSync(sourcePath, 'utf8');
function between(start, end) {
  const a=html.indexOf(start), b=html.indexOf(end,a+start.length);
  assert.ok(a>=0 && b>a, 'Real source extraction boundary missing: '+start);
  return html.slice(a,b);
}
const pointerHelpers=between('function capture(el, e) {','function startLot() {');
const hanko=between('const INK_MS = 250;','function goNext() {');
const leave=between('function leaveBag() {','/* 「つぎの ふくろ」は');
const offMiss=between('function offMiss(d) {','\ndocument.addEventListener("pointerdown",');
const cleanup=between('function dropFingers() {','/* 読みこみの とちゅうに 📖');

// Only DOM/event/timer boundaries are modeled. The tested input and completion
// functions below are the actual HTML text, not reimplementations of ownership.
const fixture=String.raw`
let clock=0, serial=0;
const timers=new Map();
function setTimeout(fn,ms=0){const id=++serial;timers.set(id,{at:clock+Math.max(0,ms),fn});return id;}
function clearTimeout(id){timers.delete(id);}
function advance(ms){const end=clock+ms;let n=0;for(;;){let choice=null;for(const [id,t] of timers)if(t.at<=end&&(!choice||t.at<choice[1].at))choice=[id,t];if(!choice)break;if(++n>1000)throw Error('Timer runaway');timers.delete(choice[0]);clock=choice[1].at;choice[1].fn();}clock=end;}
const performance={now:()=>clock};
function target(id){
  const listeners=new Map(), classes=new Set(), held=new Set(), animations=[];
  return {id,style:{},hidden:false,inert:false,textContent:'',innerHTML:'',offsetTop:132,offsetHeight:86,offsetWidth:96,
    classList:{add(...xs){xs.forEach(x=>classes.add(x));},remove(...xs){xs.forEach(x=>classes.delete(x));},contains(x){return classes.has(x);},toggle(x,on){if(on===undefined)on=!classes.has(x);on?classes.add(x):classes.delete(x);return on;}},
    addEventListener(type,fn,options){const list=listeners.get(type)||[];list.push({fn,capture:options===true||!!options?.capture});listeners.set(type,list);},
    emit(type,e,capture){for(const h of listeners.get(type)||[])if(h.capture===capture)h.fn.call(this,e);},
    setPointerCapture(id){if(this.captureFailure)throw Error("fixture capture failure");held.add(id);},releasePointerCapture(id){held.delete(id);},hasPointerCapture(id){return held.has(id);},
    closest(selector){return selector.split(',').some(s=>s.trim()==='#'+id)?this:null;},
    animate(frames,options){const anim={onfinish:null,cancelled:false,cancel(){this.cancelled=true;clearTimeout(this.timer);},playState:'running'};animations.push(anim);if(options.iterations!==Infinity)anim.timer=setTimeout(()=>{if(!anim.cancelled&&anim.onfinish)anim.onfinish.call(anim);},(options.duration||0)+(options.delay||0));return anim;},
    getAnimations(){return animations.filter(a=>!a.cancelled);},focus(){}
  };
}
const window=target('window'),document=target('document');document.hidden=false;
const els=new Map();const $=id=>{if(!els.has(id))els.set(id,target(id));return els.get(id);};
const bag=$('bagBig'),hint=$('hint'),nextBtn=$('nextBtn');
let step=4,finePointer=false,keyUser=false,motion=1,nextShownAt=0,nextAuto=false,nextPress=null,offDown=null;
let lotIndex=0;const LOT={},GRADES=['1等'],lotGrade=()=>0,cookedReturns=[];
const counts={stamps:0,inks:0,leaves:0,nextBags:0,nudges:0};
const guideOff=()=>{},guideAt=()=>{},setFace=()=>{},updateCooked=()=>{},focusIfKeys=()=>{},setStep=()=>{},layer=()=>{};
const stopSwipeDemo=()=>{},inkDemoSound=()=>{},stampDemoSound=()=>{};
const inkSound=()=>{counts.inks++;},thump=()=>{counts.stamps++;},bagSound=()=>{counts.leaves++;};
const swipeNudge=()=>{counts.nudges++;};
const goNext=()=>{counts.nextBags++;};
const bagPts=new Map(),meterPts=new Map(),pts=new Map(),P={drag:null};
let crankDrag=null,senseDrag=null,senseHold=null;
const cancelBagPointer=id=>bagPts.delete(id),cancelMeterPointer=id=>meterPts.delete(id),endPlatePointer=()=>{},endToken=()=>{};
const demoDown=new Set();
`;
const api=String.raw`
function fire(kind,id,y=100,{x=100,pointerType='touch',targetId='bagBig',buttons=kind==='pointerup'||kind==='pointercancel'?0:1}={}){
  const eventTarget=$(targetId);
  const e={type:kind,pointerId:id,clientX:x,clientY:y,pointerType,buttons,target:eventTarget,isPrimary:id===1,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}};
  document.emit(kind,e,true);bag.emit(kind,e,true);
  if(eventTarget!==bag){eventTarget.emit(kind,e,true);eventTarget.emit(kind,e,false);}
  bag.emit(kind,e,false);document.emit(kind,e,false);window.emit(kind,e,false);
  if(kind==='pointerup'||kind==='pointercancel')bag.releasePointerCapture(id);
  return e;
}
function state(){return {y:Number((($('hanko').style.transform||'').match(/translateY\((-?[\d.]+)px\)/)||[])[1]||0),stamps:counts.stamps,inks:counts.inks,leaves:counts.leaves,taps:hankoTaps,nudges:counts.nudges,mark:$('mark').classList.contains('on'),next:nextBtn.classList.contains('on'),nextAuto,inked};}
function blur(){window.emit('blur',{type:'blur'},false);}
function hide(){document.hidden=true;document.emit('visibilitychange',{type:'visibilitychange'},false);document.hidden=false;document.emit('visibilitychange',{type:'visibilitychange'},false);}
function keyboard(){bag.emit('click',{detail:0,target:bag},false);}
globalThis.harness={fire,state,advance,blur,hide,keyboard,
  hasCapture:id=>bag.hasPointerCapture(id),captureFails:value=>{bag.captureFailure=value;},captureQueryMissing:()=>{bag.hasPointerCapture=undefined;},
  loseCapture:id=>{bag.releasePointerCapture(id);fire('lostpointercapture',id);},leave:id=>fire('pointerleave',id),
  childCaptureLost:id=>fire('lostpointercapture',id,100,{targetId:'mark'}),
  cancel:()=>cancelHanko(),miss:()=>offMiss({x:100,y:100}),init(ink,scrolled){inked=ink;pageScrolled=scrolled;hankoMax=96;hankoLand=50;setHanko(0);if(ink)$('hanko').classList.add('inked');}};
`;
function world(inked=true,scrolled=false){const context=vm.createContext({});vm.runInContext(fixture+'\n'+pointerHelpers+'\n'+hanko+'\n'+leave+'\n'+offMiss+'\n'+cleanup+'\n'+api,context,{timeout:2000,filename:sourcePath+':real-hanko-handlers'});context.harness.init(inked,scrolled);return context.harness;}
const cases=[];
function check(name,fn){cases.push({name,fn});}
const down=(w,id,y,options)=>w.fire('pointerdown',id,y,options);
const move=(w,id,y,options)=>w.fire('pointermove',id,y,options);
const up=(w,id,y=100,options)=>w.fire('pointerup',id,y,options);
const cancel=(w,id,y=100,options)=>w.fire('pointercancel',id,y,options);
const stamped=w=>{assert.equal(w.state().stamps,1,'same working-finger stroke must stamp exactly once');assert.equal(w.state().mark,true);assert.equal(w.state().next,true);};
function working(w){down(w,1,100);move(w,1,110);assert.equal(w.state().y,10);}

check('single-finger control stamps once',()=>{const w=world();working(w);move(w,1,155);up(w,1,155);stamped(w);assert.equal(w.state().taps,0);});
check('moving P1 survives P2 resting down: behavioral regression',()=>{const w=world();working(w);down(w,2,300);move(w,1,155);up(w,1,155);up(w,2,300);stamped(w);assert.equal(w.state().taps,0);});
check('nonowner move cannot reposition the working stamp',()=>{const w=world();working(w);down(w,2,300);move(w,2,355);assert.equal(w.state().y,10);assert.equal(w.state().stamps,0);move(w,1,155);stamped(w);});
for(const kind of ['pointerup','pointercancel'])check('nonowner '+kind+' preserves working P1 and misses',()=>{const w=world();working(w);down(w,2,300);w.fire(kind,2,300);assert.equal(w.state().y,10);assert.equal(w.state().taps,0);move(w,1,155);stamped(w);});
check('third contact cannot steal an already moving finger',()=>{const w=world();working(w);down(w,2,300);down(w,3,350);move(w,3,410);up(w,2,300);cancel(w,3,410);assert.equal(w.state().y,10);move(w,1,155);stamped(w);});
check('owner release does not promote held P2 without a new down',()=>{const w=world();working(w);down(w,2,300);up(w,1,110);assert.equal(w.state().taps,1);move(w,2,360);up(w,2,360);assert.equal(w.state().stamps,0);assert.equal(w.state().taps,1);down(w,3,100);move(w,3,155);stamped(w);});
check('owner cancel does not promote held P2 without a new down',()=>{const w=world();working(w);down(w,2,300);cancel(w,1,110);move(w,2,360);up(w,2,360);assert.equal(w.state().stamps,0);assert.equal(w.state().taps,0);down(w,3,100);move(w,3,155);stamped(w);});
check('stationary first contact still allows a later working finger',()=>{const w=world();down(w,1,300);down(w,2,100);move(w,2,155);stamped(w);});
check('old stamp-owner up cannot cancel a newly started bag swipe',()=>{const w=world();working(w);move(w,1,155);stamped(w);down(w,2,200,{x:100});up(w,1,155);move(w,2,200,{x:145});assert.equal(w.state().leaves,1);assert.equal(w.state().nudges,0);});
check('held ignored P2 cannot become bag swipe after stamp without down',()=>{const w=world();working(w);down(w,2,300);move(w,1,155);stamped(w);move(w,2,300,{x:180});assert.equal(w.state().leaves,0);up(w,1,155);up(w,2,300,{x:180});assert.equal(w.state().nudges,0);down(w,3,200,{x:100});move(w,3,200,{x:145});assert.equal(w.state().leaves,1);});
check('18px ink threshold and same-finger continuation are unchanged',()=>{const w=world(false);down(w,1,100);move(w,1,117);assert.equal(w.state().inks,0);move(w,1,118);assert.equal(w.state().inks,1);move(w,1,173);up(w,1,173);stamped(w);assert.equal(w.state().taps,0);});
check('18px ink-to-stamp owner survives a resting P2',()=>{const w=world(false);down(w,1,100);move(w,1,118);move(w,1,128);down(w,2,300);move(w,1,173);stamped(w);assert.equal(w.state().inks,1);});
check('250ms ink hold threshold and continuation are unchanged',()=>{const w=world(false);down(w,1,100);w.advance(249);assert.equal(w.state().inks,0);w.advance(1);assert.equal(w.state().inks,1);move(w,1,155);stamped(w);});
check('250ms hold owner survives P2 after starting to lower',()=>{const w=world(false);down(w,1,100);w.advance(250);move(w,1,110);down(w,2,300);move(w,1,155);stamped(w);assert.equal(w.state().inks,1);});
check('cancelled old ink timer cannot ink a newer hold early',()=>{const w=world(false);down(w,1,100);w.advance(100);cancel(w,1);down(w,2,100);w.advance(150);assert.equal(w.state().inks,0);w.advance(99);assert.equal(w.state().inks,0);w.advance(1);assert.equal(w.state().inks,1);move(w,2,155);stamped(w);});
check('no-argument cancellation releases the working ownership',()=>{const w=world();working(w);down(w,2,300);w.cancel();assert.equal(w.state().y,0);assert.equal(w.state().taps,0);move(w,2,360);assert.equal(w.state().stamps,0);down(w,3,100);move(w,3,155);stamped(w);});
for(const method of ['blur','hide'])check(method+' uses real dropFingers and permits fresh input',()=>{const w=world();working(w);w[method]();assert.equal(w.state().y,0);assert.equal(w.state().taps,0);down(w,2,100);move(w,2,155);stamped(w);});
check('cleanup after stamping does not leave an owner-only lock',()=>{const w=world();working(w);move(w,1,155);stamped(w);w.hide();down(w,2,200,{x:100});move(w,2,200,{x:145});assert.equal(w.state().leaves,1);});
check('scrolling touch does not ink or count as a miss',()=>{const w=world(false,true);down(w,1,100);move(w,1,160);w.advance(300);up(w,1,160);assert.equal(w.state().inks,0);assert.equal(w.state().stamps,0);assert.equal(w.state().taps,0);});
for(const pointerType of ['mouse','pen'])check(pointerType+' contact can work when page is scrolled',()=>{const w=world(true,true);down(w,1,100,{pointerType,buttons:1});move(w,1,155,{pointerType,buttons:1});up(w,1,155,{pointerType,buttons:0});stamped(w);});
check('foreign page-touch release does not clear an active mouse stroke',()=>{const w=world(true,true);down(w,1,100,{pointerType:'mouse'});move(w,1,110,{pointerType:'mouse'});down(w,2,300);move(w,2,350);up(w,2,350);move(w,1,155,{pointerType:'mouse'});stamped(w);});
for(const pointerType of ['mouse','pen'])check('foreign '+pointerType+' hover cannot drive active touch',()=>{const w=world();working(w);move(w,8,170,{pointerType,buttons:0});assert.equal(w.state().stamps,0);assert.equal(w.state().y,10);move(w,1,155);stamped(w);});
check('actual offMiss keeps its no-argument endHanko path',()=>{const w=world();w.miss();assert.equal(w.state().taps,1);assert.equal(w.state().stamps,0);down(w,1,100);move(w,1,155);stamped(w);});
check('Enter retains assisted drop and automatic-stamp flag',()=>{const w=world();w.keyboard();w.advance(130);stamped(w);assert.equal(w.state().nextAuto,true);});

// Boundary controls model browser capture state; they do not decide ownership.
check('owner lost capture releases the lock for a fresh down',()=>{const w=world();working(w);assert.equal(w.hasCapture(1),true);w.loseCapture(1);assert.equal(w.state().y,0);assert.equal(w.state().taps,0);down(w,2,100);move(w,2,155);stamped(w);});
check('failed capture followed by owner leave permits fresh input',()=>{const w=world();w.captureFails(true);working(w);assert.equal(w.hasCapture(1),false);w.leave(1);assert.equal(w.state().y,0);assert.equal(w.state().taps,0);w.captureFails(false);down(w,2,100);move(w,2,155);stamped(w);});
check('owner leave with valid capture preserves the working stroke',()=>{const w=world();working(w);assert.equal(w.hasCapture(1),true);w.leave(1);assert.equal(w.state().y,10);assert.equal(w.state().taps,0);move(w,1,155);stamped(w);});
check('foreign lost capture cannot cancel the working owner',()=>{const w=world();working(w);down(w,2,300);w.loseCapture(2);assert.equal(w.state().y,10);assert.equal(w.state().taps,0);move(w,1,155);stamped(w);});
check('foreign leave cannot cancel the working owner',()=>{const w=world();working(w);down(w,2,300);w.leave(2);assert.equal(w.state().y,10);assert.equal(w.state().taps,0);move(w,1,155);stamped(w);});
check('child capture loss bubbling to a still-capturing bag does not cancel',()=>{const w=world();working(w);assert.equal(w.hasCapture(1),true);w.childCaptureLost(1);assert.equal(w.hasCapture(1),true);assert.equal(w.state().y,10);assert.equal(w.state().taps,0);move(w,1,155);stamped(w);});
check('missing capture query on owner leave recovers instead of locking',()=>{const w=world();working(w);w.captureQueryMissing();w.leave(1);assert.equal(w.state().y,0);assert.equal(w.state().taps,0);down(w,2,100);move(w,2,155);stamped(w);});
check('old stamp-owner capture loss cannot cancel a new bag swipe',()=>{const w=world();working(w);move(w,1,155);stamped(w);down(w,2,200,{x:100});w.loseCapture(1);move(w,2,200,{x:145});assert.equal(w.state().leaves,1);assert.equal(w.state().nudges,0);});

const results=[];
for(const test of cases){try{test.fn();results.push({name:test.name,status:'pass'});}catch(error){results.push({name:test.name,status:'fail',errorName:error.name,message:error.message,stack:error.stack});}}
process.stdout.write(JSON.stringify({sourcePath,caseCount:cases.length,results})+'\n');
process.exitCode=results.some(r=>r.status!=='pass')?1:0;
'''


class KensaHankoPointerOwnershipTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        node = shutil.which("node")
        if not node:
            raise unittest.SkipTest("Node is unavailable for the actual JavaScript handler check")
        run = subprocess.run([node, "-e", HARNESS, str(HTML_PATH)], capture_output=True,
                             text=True, timeout=15)
        if run.returncode not in (0, 1):
            raise RuntimeError("Handler harness process error: " + run.stderr[-3000:])
        try:
            report = json.loads(run.stdout)
        except (ValueError, TypeError) as error:
            raise RuntimeError("Handler extraction/fixture could not produce results: " + run.stderr[-3000:]) from error
        cls.results = report["results"]
        if report["caseCount"] != 36 or len(cls.results) != 36:
            raise RuntimeError("Expected all 36 fixed behavior cases; none may be omitted")
        if cls.results[0]["status"] != "pass":
            raise RuntimeError("Single-finger control did not establish a working fixture: " + str(cls.results[0]))
        unexpected = [r for r in cls.results if r["status"] == "fail" and r.get("errorName") != "AssertionError"]
        if unexpected:
            raise RuntimeError("Fixture/extraction error, not a behavioral RED: " + str(unexpected))

    def test_working_stamp_finger_keeps_its_motion_and_completion(self):
        for result in self.results:
            with self.subTest(case=result["name"]):
                self.assertEqual(result["status"], "pass", result.get("message", ""))


if __name__ == "__main__":
    unittest.main()
