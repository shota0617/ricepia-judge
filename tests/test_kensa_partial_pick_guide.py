"""実関数の案内先を調べる草稿。ブラウザで遊んだ証拠にはしない。"""
import json
import os
from pathlib import Path
import subprocess
import unittest


ROOT = Path(os.environ.get("KENSA_SOURCE_ROOT", Path(__file__).resolve().parents[1]))
# kind, dom, x, y, r, and the observed element bbox (left, top, right, bottom).
# These are selected candidates from the synchronous before snapshots, not invented positions.
FIXTURES = {
    "01": ["mijuku", 1, 335.082277520926, 83.89477766458795, 1,
           697.0007934570312, 53.8516845703125, 806.0314331054688, 115.7274169921875],
    "02": ["shini", 0, 234.22930596774916, 197.22468462861946, 30,
           488.0447998046875, 258.4685974121094, 611.5755615234375, 364.4301452636719],
    "03": ["mijuku", 1, 243.28133971878424, 65.30044532613162, -10,
           509.5251770019531, 8.679656982421875, 626.3032836914062, 86.52212524414062],
    "04": ["mijuku", 1, 232.51529762609667, 203.86660824848835, -41,
           485.9460754394531, 266.66473388671875, 606.8182373046875, 382.80169677734375],
    "06": ["shini", 0, 228.82837275806742, 210.09184141237546, -49.38405303106478,
           481.0823669433594, 276.6632385253906, 596.9342041015625, 397.7041320800781],
    "08": ["shini", 0, 346.6277442662664, 98.26331934220173, -7.215425331561672,
           717.2666625976562, 76.98179626464844, 831.9474487304688, 150.0714874267578],
    "09": ["shini", 0, 231.81631474607502, 73.02178776426443, -45,
           485.58721923828125, 3.6466064453125, 604.3811645507812, 122.4405517578125],
}

CASES = [
    ("observed01", "01", "", "target"),
    ("observed02", "02", "", "target"),
    ("outside03", "03", "", "zoom"),
    ("conservative04", "04", "", "zoom"),
    ("clipped06", "06", "", "zoom"),
    ("clipped08", "08", "", "zoom"),
    ("clipped09", "09", "", "zoom"),
    ("whole_priority", "01", "whole", "whole"),
    ("unrecognized", "01", "unrecognized", "zoom"),
    ("gone", "01", "gone", "zoom"),
    ("hidden", "01", "hidden", "zoom"),
    ("content_edge", "02", "content_edge", "zoom"),
    ("viewport_edge", "02", "viewport_edge", "zoom"),
    ("zoom_control", "02", "zoom_control", "zoom"),
    ("other_control", "02", "other_control", "zoom"),
    ("other_grain", "02", "other_grain", "zoom"),
    ("face_corner_grain", "02", "face_corner_grain", "zoom"),
    ("smooth", "02", "smooth", "zoom"),
    ("simulation", "02", "simulation", "zoom"),
    ("model_dom_center_miss", "02", "model_dom_center_miss", "zoom"),
    ("normal_hint_pulse_keeps_zoom", "02", "normal_hint_pulse", "zoom"),
    ("face_hint_clipped", "02", "face_hint_clipped", "zoom"),
    ("far_hint_whole", "01", "far_hint_whole", "whole"),
    ("far_hint_partial", "01", "far_hint_partial", "zoom"),
]

HARNESS = r"""
const fs = require('fs'), vm = require('vm');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const setup = `
const box = (left,top,right,bottom) => ({left,top,right,bottom,x:left,y:top,width:right-left,height:bottom-top});
const tokens = (...names) => { const values=new Set(names); return {contains:n=>values.has(n),add:n=>values.add(n),remove:n=>values.delete(n),values}; };
function element(tagName,id,parentElement,rect) {
  return {tagName,id,parentElement,hidden:false,disabled:false,style:{},classList:tokens(),
    getBoundingClientRect(){return this.rect;},getClientRects(){return this.hidden?[]:[this.rect];},rect,
    getAnimations(){return [];},contains(node){for(let n=node;n;n=n.parentElement)if(n===this)return true;return false;},
    closest(){for(let n=this;n;n=n.parentElement)if(['BUTTON','INPUT','SELECT','TEXTAREA','A'].includes(n.tagName))return n;return null;}};
}
let innerWidth=844,innerHeight=390,lotIndex=1,spread=true,isNear=true,everZoomed=true,pickedBare=false,simOn=false;
let step=2,badLeft=1,pinch=null,sortDrag=null;
const pts=new Map(),demoDown=new Set(),finePointer=false,reduced=false,LOT={look:1},P={auto:false};
const GW=54,GH=30,PW=470,PH=282,Z={s:2,tx:-234.8828125,ty:-141};
const plate=element('DIV','plate',null,box(312.234375,54,790,344));
Object.assign(plate,{clientLeft:4,clientTop:4,clientWidth:470,clientHeight:282});
const inner=element('DIV','plateInner',plate,box(81.351375,-83,1021.351375,481));
Object.assign(inner,{clientWidth:470,clientHeight:282});
inner.style.transform='matrix(2, 0, 0, 2, -234.883, -141)';
const zoomBtn=element('BUTTON','zoomBtn',plate,box(732,286,778,332));
const otherControl=element('BUTTON','otherControl',plate,box(500,290,600,330));
const outside=element('DIV','outside',null,box(0,0,844,390));
const token={hidden:true},guideEl={classList:tokens()},guides=[];
let guideAnchor=null,overrideHit=null;
const guideAt=(kind,el)=>{guides.push({kind,el});guideAnchor={el};};
const window={get innerWidth(){return innerWidth;},get innerHeight(){return innerHeight;}};
const document={documentElement:{clientWidth:844,clientHeight:390,classList:tokens()},visibilityState:'visible',
  getAnimations:()=>[],getElementById:id=>({plate,plateInner:inner,zoomBtn,guide:guideEl}[id]),
  elementFromPoint(x,y){if(x<0||y<0||x>=innerWidth||y>=innerHeight)return null;if(overrideHit)return overrideHit;
    return x>=316.234375&&x<=786.234375&&y>=58&&y<=340?inner:outside;}};
const getComputedStyle=el=>({display:el.hidden?'none':'block',visibility:'visible',opacity:'1',transform:'none',transformOrigin:'0px 0px',...el.style});
class DOMMatrixReadOnly {
  constructor(value){const m=value&&value!=='none'?value.match(/^matrix\\(([^)]+)\\)$/):null;
    const n=m?m[1].split(',').map(Number):[1,0,0,1,0,0];[this.a,this.b,this.c,this.d,this.e,this.f]=n;this.is2D=true;}
}
function makeGrain(row) {
  const [kind,dom,x,y,r,l,t,rr,b]=row,el=element('BUTTON','grain'+dom,inner,box(l,t,rr,b));
  el.classList.add('grain'); const img=element('IMG','img'+dom,el,el.rect);
  for(const node of [el,img])Object.assign(node,{clientWidth:54,clientHeight:30,offsetWidth:54,offsetHeight:30});
  el.style.transformOrigin=img.style.transformOrigin='27px 15px';
  img.complete=true;img.naturalWidth=18;img.naturalHeight=10;
  return {kind,dom,x,y,r,z:1,awake:0,gone:false,el,img};
}
const target=makeGrain(FIXTURE),grains=[target];let whole=null;
const center=g=>{const b=g.el.rect;return {x:(b.left+b.right)/2,y:(b.top+b.bottom)/2};};
function moveCenter(g,x,y,moveModel=true){const p=center(g),dx=x-p.x,dy=y-p.y,b=g.el.rect;
  g.el.rect=box(b.left+dx,b.top+dy,b.right+dx,b.bottom+dy);g.img.rect=g.el.rect;
  if(moveModel){g.x+=dx/Z.s;g.y+=dy/Z.s;}}
if(CASE==='whole'||CASE==='far_hint_whole') {
  whole=makeGrain(['shini',8,(550-316.234375-Z.tx)/Z.s,(180-58-Z.ty)/Z.s,0,496,150,604,210]);grains.push(whole);
}
if(CASE==='unrecognized'||CASE==='far_hint_whole'||CASE==='far_hint_partial')isNear=false;
if(CASE==='far_hint_whole')whole.img.classList.add('hint');
if(CASE==='far_hint_partial')target.img.classList.add('hint');
if(CASE==='gone')target.gone=true;
if(CASE==='hidden')target.el.hidden=true;
if(CASE==='content_edge')moveCenter(target,center(target).x,340);
if(CASE==='viewport_edge')innerWidth=center(target).x;
if(CASE==='zoom_control'){moveCenter(target,755,309);overrideHit=zoomBtn;}
if(CASE==='other_control')overrideHit=otherControl;
if(CASE==='other_grain'){const other=makeGrain(['seiryu',20,target.x,target.y,target.r,...FIXTURE.slice(5)]);other.z=9;grains.push(other);}
if(CASE==='face_corner_grain'){
  // The foreground grain covers a face-region corner, while its body and tap padding miss the target center.
  const p=center(target),other=makeGrain(['seiryu',20,target.x+32,target.y+10,0,p.x+10,p.y-10,p.x+118,p.y+50]);
  other.z=9;grains.push(other);
}
if(CASE==='smooth')inner.classList.add('smooth');
if(CASE==='simulation'){simOn=true;target.awake=1;}
if(CASE==='model_dom_center_miss'){
  inner.style.transform='matrix(2, 0, 0, 2, -134.883, -141)';
  inner.rect=box(181.351375,-83,1121.351375,481);
  moveCenter(target,center(target).x+100,center(target).y,false);
}
if(CASE==='normal_hint_pulse'){target.img.classList.add('hint');target.img.style.transform='matrix(1.25, 0, 0, 1.25, 0, 0)';}
if(CASE==='face_hint_clipped'){lotIndex=0;target.z=100;target.img.classList.add('hint');target.img.style.transform='matrix(1.875, 0, 0, 1.875, 0, 0)';}
const state=()=>JSON.stringify({Z,lotIndex,spread,isNear,everZoomed,pickedBare,simOn,step,badLeft,
  grains:grains.map(g=>({kind:g.kind,dom:g.dom,x:g.x,y:g.y,r:g.r,z:g.z,awake:g.awake,gone:g.gone,hidden:g.el.hidden,
    imgTransform:g.img.style.transform,hints:[...g.img.classList.values]}))});
`;
const exercise = `
const before=state(),point=center(target),pointHit=grainAt(toLocal(point.x,point.y));
demoShow('pick');
const chosen=guides.at(-1);
({actual:chosen?.el===target.el?'target':whole&&chosen?.el===whole.el?'whole':chosen?.el===zoomBtn?'zoom':'other',
  kind:chosen?.kind,count:guides.length,stateUnchanged:state()===before,centerHitTarget:pointHit===target});
`;
const results=input.cases.map(([name,fixture,change,expected])=>{
  try{return {name,expected,...vm.runInNewContext(setup+input.functions+exercise,{FIXTURE:input.fixtures[fixture],CASE:change},{timeout:3000})};}
  catch(error){return {name,expected,error:String(error.stack||error)};}
});
process.stdout.write(JSON.stringify(results));
"""


class PartialPickGuide(unittest.TestCase):
    def test_observed_partial_faces_and_safe_exclusions(self):
        html = (ROOT / "kensa.html").read_text(encoding="utf-8")
        # Existing source sections, without assuming the name of any added helper.
        # A new selection helper can live in the demonstration section alongside demoShow.
        sections = [
            ("const GRAIN_ROWS = [", "const spriteCache = {}"),
            ("function toLocal(cx, cy) {", "/* 指の手本:"),
            ("const FACE_Z = 100;", "function refreshBadFaces()"),
            ("function grainAt(p) {", "const pts = new Map();"),
            ("const DEMO_FIRST = 800,", "function demoTick("),
        ]
        functions = []
        for start, end in sections:
            at = html.index(start)
            functions.append(html[at:html.index(end, at)])
        payload = {"functions": "\n".join(functions), "fixtures": FIXTURES, "cases": CASES}
        run = subprocess.run(["node", "-e", HARNESS], input=json.dumps(payload),
                             text=True, capture_output=True, timeout=20)
        self.assertEqual(run.returncode, 0, run.stderr[-2000:])
        rows = json.loads(run.stdout)
        self.assertEqual([row["name"] for row in rows], [case[0] for case in CASES])
        for row in rows:
            with self.subTest(case=row["name"]):
                self.assertNotIn("error", row, row.get("error"))
                self.assertTrue(row["stateUnchanged"], "Guide selection changed game state")
                self.assertEqual(row["count"], 1)
                self.assertEqual(row["kind"], "press")
                self.assertEqual(row["actual"], row["expected"],
                                 "Guide chose the wrong existing element: " + json.dumps(row))
                if row["name"] in ("observed01", "observed02", "face_corner_grain"):
                    self.assertTrue(row["centerHitTarget"], "Fixture center must hit its real grain")
                if row["name"] == "model_dom_center_miss":
                    self.assertFalse(row["centerHitTarget"], "Mismatch fixture must miss the real grain")


if __name__ == "__main__":
    unittest.main()
