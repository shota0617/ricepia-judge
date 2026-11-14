"""Exercise actual guide/zoom functions; the fixture supplies DOM and timer surfaces only."""
import json
from pathlib import Path
import subprocess
import unittest


FIXTURE = r'''
const assert = require('node:assert/strict');
const nodes = new Map(), timers = [], armCalls = [];
function element(id, rect = {left:0,top:0,right:300,bottom:220,width:300,height:220}) {
  const listeners = new Map();
  const el = {id, className:'', textContent:'', hidden:false, dataset:{}, style:{setProperty(k,v){this[k]=v;}}, offsetWidth:40,
    clientLeft:0, clientTop:0, getBoundingClientRect:()=>({...rect}), closest:()=>null, animate:()=>({}),
    addEventListener(k,f){if(!listeners.has(k))listeners.set(k,[]);listeners.get(k).push(f);},
    fire(k,e){for(const f of listeners.get(k)||[])f(e);}};
  el.classList = {contains:k=>el.className.split(/\s+/).includes(k),
    add(...ks){el.className=[...new Set([...el.className.split(/\s+/).filter(Boolean),...ks])].join(' ');},
    remove(...ks){el.className=el.className.split(/\s+/).filter(x=>x&&!ks.includes(x)).join(' ');},
    toggle(k,force){const on=force===undefined?!this.contains(k):!!force;if(on)this.add(k);else this.remove(k);return on;}};
  nodes.set(id,el);return el;
}
const $ = id => nodes.get(id) || element(id);
const plate=element('plate'), inner=element('plateInner'), hint=element('hint'), zoomBtn=element('zoomBtn',{left:250,top:170,right:296,bottom:216,width:46,height:46});
hint.textContent='わるい粒を つまむ';zoomBtn.textContent='🔍';element('guide');element('guideTrail');
let step=2,lotIndex=1,finePointer=false,crankAngle=0,crankDrag=null,pinch=null;
let demoAt=1234,demoHard=2345,hintTimer=71,sortHintCalls=0;
const PW=300,PH=220,GW=30,GH=18,motion=1,reduced=false;
const window={innerWidth:844};const document={querySelectorAll:()=>[]};
const performance={now:()=>1000};const setTimeout=(f,ms)=>{timers.push(['set',ms]);return 72;};const clearTimeout=id=>{timers.push(['clear',id]);};
const armHint=ms=>armCalls.push(ms),zoomSound=()=>{},zoomOutSound=()=>{},grainSprite=()=>'',hintSound=()=>{},setFace=()=>{};
const stabPoke=()=>{},pullPoke=()=>{},syncPokeToAttract=()=>{},pilePoint=()=>plate,guideSense=()=>{},lotGrade=()=>0,LOT={},hankoMax=50;
function grain(id,inside=false){return {kind:'higai',gone:false,x:285,y:100,z:0,
 el:element(id,inside?{left:20,top:20,right:50,bottom:40,width:30,height:20}:{left:295,top:90,right:325,bottom:110,width:30,height:20}),
 img:element(id+'-image')};}
const grains=[grain('bad')];
'''

CASES = [
    ('touch zoom fallback says how to zoom in', "everZoomed=true;demoShow('pick');assert.equal(guideAnchor.el,zoomBtn);assert.ok(guideEl.classList.contains('on'));assert.ok(guideEl.classList.contains('press'));assert.equal(hint.textContent,'🔍 で 寄る');"),
    ('zoomed fallback says how to see the whole tray', "everZoomed=true;Z.s=2;isNear=true;zoomBtn.textContent='➖';demoShow('pick');assert.equal(guideAnchor.el,zoomBtn);assert.equal(hint.textContent,'➖ で 全体を 見る');"),
    ('fine pointer fallback follows the same text', "finePointer=true;everZoomed=true;demoShow('pick');assert.equal(guideAnchor.el,zoomBtn);assert.equal(hint.textContent,'🔍 で 寄る');"),
    ('initial fine pointer instruction remains valid', "finePointer=true;updateSortHint();assert.equal(hint.textContent,'🔍 で 寄る');demoShow('pick');assert.equal(guideAnchor.el,zoomBtn);assert.equal(hint.textContent,'🔍 で 寄る');guideOff();assert.equal(hint.textContent,'🔍 で 寄る');"),
    ('initial touch still teaches the pinch', "updateSortHint();const t=JSON.stringify(timers),a=JSON.stringify(armCalls);demoShow('pick');assert.equal(guideAnchor.el,plate);assert.ok(guideEl.classList.contains('on'));assert.ok(guideEl.classList.contains('pinch'));assert.equal(hint.textContent,'🔍 ふたゆびで ズーム');assert.equal(JSON.stringify(timers),t);assert.equal(JSON.stringify(armCalls),a);"),
    ('already picked without zoom keeps its exception', "pickedBare=true;demoShow('pick');assert.equal(guideEl.classList.contains('on'),false);assert.equal(guideAnchor,null);assert.equal(hint.textContent,'わるい粒を つまむ');"),
    ('visible hinted grain keeps the picking instruction', "everZoomed=true;grains[0]=grain('visible',true);grains[0].img.classList.add('hint');demoShow('pick');assert.equal(guideAnchor.el,grains[0].el);assert.equal(hint.textContent,'わるい粒を つまむ');"),
    ('first bag visible grain remains a grain guide', "lotIndex=0;spread=true;grains[0]=grain('visible',true);demoShow('pick');assert.equal(guideAnchor.el,grains[0].el);assert.equal(hint.textContent,'わるい粒を つまむ');"),
    ('near visible grain remains a grain guide', "everZoomed=true;isNear=true;grains[0]=grain('visible',true);demoShow('pick');assert.equal(guideAnchor.el,grains[0].el);assert.equal(hint.textContent,'わるい粒を つまむ');"),
    ('held finger prevents guide and temporary text', "everZoomed=true;demoDown.add(7);demoShow('pick');assert.equal(guideEl.classList.contains('on'),false);assert.equal(guideAnchor,null);assert.equal(hint.textContent,'わるい粒を つまむ');"),
    ('remaining finger clears old guide without a new caption', "everZoomed=true;demoShow('pick');demoDown.add(7);demoDown.add(8);demoDown.delete(7);demoShow('pick');assert.equal(guideEl.classList.contains('on'),false);assert.equal(guideAnchor,null);assert.equal(hint.textContent,'わるい粒を つまむ');"),
    ('guideOff restores its previous instruction', "everZoomed=true;demoShow('pick');assert.equal(hint.textContent,'🔍 で 寄る');guideOff();assert.equal(hint.textContent,'わるい粒を つまむ');assert.equal(guideAnchor,null);"),
    ('new stage text survives guideOff', "everZoomed=true;demoShow('pick');step=3;hint.textContent='● の下を 上へ ↑';guideOff();assert.equal(hint.textContent,'● の下を 上へ ↑');"),
    ('second guideOff cannot revive an old instruction', "everZoomed=true;demoShow('pick');guideOff();hint.textContent='次の案内';guideOff();assert.equal(hint.textContent,'次の案内');"),
    ('repeated zoom demonstration restores original text once', "everZoomed=true;demoShow('pick');demoShow('pick');assert.equal(hint.textContent,'🔍 で 寄る');guideOff();assert.equal(hint.textContent,'わるい粒を つまむ');"),
    ('grain guide replaces temporary zoom text', "everZoomed=true;demoShow('pick');grains[0]=grain('visible',true);grains[0].img.classList.add('hint');demoShow('pick');assert.equal(guideAnchor.el,grains[0].el);assert.equal(hint.textContent,'わるい粒を つまむ');"),
    ('different guide preserves newer task text', "everZoomed=true;demoShow('pick');hint.textContent='朱肉に ぎゅっと';guideAt('move',$('pad'),0,24);assert.equal(guideAnchor.el,$('pad'));assert.equal(hint.textContent,'朱肉に ぎゅっと');"),
    ('actual keyboard click keeps zoom caption in sync both ways', "everZoomed=true;demoShow('pick');zoomBtn.fire('click',{detail:0});assert.ok(Z.s>1.001);assert.equal(zoomBtn.textContent,'➖');assert.equal(hint.textContent,'➖ で 全体を 見る');zoomBtn.fire('click',{detail:0});assert.equal(Z.s,1);assert.equal(zoomBtn.textContent,'🔍');assert.equal(hint.textContent,'🔍 で 寄る');guideOff();assert.equal(hint.textContent,'わるい粒を つまむ');"),
    ('caption follows button threshold even below face threshold', "everZoomed=true;demoShow('pick');Z.s=1.002;applyZoom();assert.equal(isNear,false);assert.equal(zoomBtn.textContent,'➖');assert.equal(hint.textContent,'➖ で 全体を 見る');Z.s=1.001;applyZoom();assert.equal(zoomBtn.textContent,'🔍');assert.equal(hint.textContent,'🔍 で 寄る');"),
    ('zoom after newer instruction does not overwrite it', "everZoomed=true;demoShow('pick');hint.textContent='きれいに なった！';Z.s=2;applyZoom();assert.equal(hint.textContent,'きれいに なった！');guideOff();assert.equal(hint.textContent,'きれいに なった！');"),
    ('zoom without an owned guide does not create text', "everZoomed=true;Z.s=2;applyZoom();assert.equal(hint.textContent,'わるい粒を つまむ');assert.equal(guideEl.classList.contains('on'),false);"),
    ('demonstration leaves learning timers and grain state alone', "everZoomed=true;const old=JSON.stringify(grains.map(g=>({gone:g.gone,kind:g.kind,x:g.x,y:g.y})));demoShow('pick');assert.equal(sortHintCalls,0);assert.deepEqual(armCalls,[]);assert.deepEqual(timers,[]);assert.equal(demoAt,1234);assert.equal(demoHard,2345);assert.equal(hintTimer,71);assert.equal(JSON.stringify(grains.map(g=>({gone:g.gone,kind:g.kind,x:g.x,y:g.y}))),old);"),
]


class KensaZoomGuideTextTest(unittest.TestCase):
    def test_actual_guide_and_zoom_keep_their_instruction_consistent(self):
        html = (Path(__file__).resolve().parents[1] / 'kensa.html').read_text()
        def section(start, end):
            a = html.index(start)
            return html[a:html.index(end, a)]
        # Broad existing regions also retain any local helper declarations without naming a proposed API.
        code = '\n'.join([
            section('const guideEl = $("guide");', '/* ぬく: 穀刺し'),
            section('const Z = { s:1, tx:0, ty:0 };', '/* 滑らかな寄りの途中'),
            section('function resetZoom(smooth) {', 'function armHint(ms) {'),
            section('function toggleZoom() {', 'function tapGrain(g) {'),
            section('function demoShow(k) {', 'function demoTick('),
        ])
        code += '\nspread = true;\nconst originalSortHint = updateSortHint; updateSortHint = (...args) => { sortHintCalls++; return originalSortHint(...args); };\n'
        program = r'''
const fs=require('fs'),vm=require('vm');const input=JSON.parse(fs.readFileSync(0,'utf8'));const rows=[];
for(const [name,body] of input.cases){
  try{vm.runInNewContext('"use strict";\n'+input.fixture+'\n'+input.code+'\n'+body,{require},{timeout:2000});rows.push({name,error:null});}
  catch(e){rows.push({name,error:{name:e.name,message:e.message,stack:e.stack}});}
}
process.stdout.write(JSON.stringify(rows));
'''
        result = subprocess.run(['node', '-e', program], input=json.dumps({'fixture': FIXTURE, 'code': code, 'cases': CASES}), text=True, capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        rows = json.loads(result.stdout)
        self.assertEqual([row['name'] for row in rows], [name for name, _ in CASES])
        for row in rows:
            with self.subTest(case=row['name']):
                self.assertIsNone(row['error'], row['error'])


if __name__ == '__main__':
    unittest.main()
