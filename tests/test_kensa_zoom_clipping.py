"""検査ゲーム: 縮小している皿が、外の見出しや操作を覆わない。"""
import json
import os
import shutil
import subprocess
import unittest


ROOT = os.environ.get("KENSA_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML_PATH = os.environ.get("KENSA_HTML") or os.path.join(ROOT, "kensa.html")

BROWSER_JS = r"""
const fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (error) { console.log(JSON.stringify({ skip: 'playwright がない' })); process.exit(0); }
const [htmlArg, rootArg] = process.argv.slice(1);
const htmlPath = path.resolve(htmlArg), root = path.resolve(rootArg);
const origin = 'http://localhost';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

// Read the real transformed surface and hit testing. No game state or styles change.
function sampleSurface() {
  const plate = document.getElementById('plate'), inner = document.getElementById('plateInner');
  const box = element => { const r = element.getBoundingClientRect();
    return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height }; };
  const p = box(plate), q = box(inner), style = getComputedStyle(plate);
  const matrix = new DOMMatrixReadOnly(getComputedStyle(inner).transform);
  const probes = [];
  // Use viewport points well away from the outer border and transformed corners.
  // A changed clip must not shrink this geometry-based set and vacuously pass.
  for (let y = 8; y < innerHeight - 8; y += 24) for (let x = 8; x < innerWidth - 8; x += 24) {
    if (x >= p.left - 4 && x <= p.right + 4 && y >= p.top - 4 && y <= p.bottom + 4) continue;
    if (x <= q.left + 8 || x >= q.right - 8 || y <= q.top + 8 || y >= q.bottom - 8) continue;
    const hit = document.elementFromPoint(x,y);
    probes.push({ x,y, hit:hit ? hit.id || hit.tagName : null, leaked:!!hit && (hit === inner || inner.contains(hit)) });
  }
  return { at:performance.now(), scale:matrix.a, plate:p, inner:q,
    zoomLabel:document.getElementById('zoomBtn').textContent,
    overflowX:style.overflowX, overflowY:style.overflowY, probes,
    activeTransitions:inner.getAnimations().filter(a=>a.playState==='running').length };
}

async function runContext(browser, reducedMotion) {
  const context = await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,
    deviceScaleFactor:1,reducedMotion,serviceWorkers:'block'});
  const missing=[],blocked=[],errors=[],commands=[];
  try {
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { blocked.push(url.href); return route.fulfill({status:204,body:''}); }
      const file = url.pathname === '/kensa.html' ? htmlPath : path.resolve(root,'.'+decodeURIComponent(url.pathname));
      if (file !== htmlPath && !file.startsWith(root+path.sep)) return route.abort();
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        if (url.pathname === '/favicon.ico') return route.fulfill({status:204,body:''});
        missing.push(url.pathname); return route.fulfill({status:404,body:''});
      }
      return route.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
    });
    await context.addInitScript(() => {
      window.__clipTestEvents=[];
      for (const type of ['pointerdown','pointerup','pointercancel']) document.addEventListener(type,e=>{
        __clipTestEvents.push({type,at:performance.now(),trusted:e.isTrusted,pointerType:e.pointerType,target:e.target.id||e.target.tagName});
      },{capture:true,passive:true});
    });
    const page = await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    const cdp = await context.newCDPSession(page);
    const send = async (type,point) => {
      const command={type,sentAt:Date.now(),point}; commands.push(command);
      await cdp.send('Input.dispatchTouchEvent',{type,timestamp:command.sentAt/1000,
        touchPoints:type==='touchEnd'?[]:[{...point,id:1}]});
      command.acknowledgedAt=Date.now();
    };
    async function gesture(duration,at,steps=0) {
      const start=Date.now();
      const pending=[send('touchStart',at(0))];
      for(let i=1;i<=steps;i++) pending.push(new Promise((resolve,reject)=>{
        setTimeout(()=>send('touchMove',at(i/steps)).then(resolve,reject),Math.max(0,start+duration*i/(steps+1)-Date.now()));
      }));
      pending.push(new Promise((resolve,reject)=>{
        setTimeout(()=>send('touchEnd',at(1)).then(resolve,reject),Math.max(0,start+duration-Date.now()));
      }));
      await Promise.all(pending);
    }
    const box = async id => { const r=await page.locator('#'+id).boundingBox(); if(!r)throw Error(id+' not visible'); return r; };
    const hint = text => page.waitForFunction(text=>document.getElementById('hint').textContent.includes(text),text,{timeout:15000});
    async function tapZoom() { const r=await box('zoomBtn');await gesture(80,()=>({x:r.x+r.width/2,y:r.y+r.height/2})); }
    async function settled(label) {
      await page.waitForFunction(label=>{
        const e=document.getElementById('plateInner');
        return document.getElementById('zoomBtn').textContent===label && !e.getAnimations().some(a=>a.playState==='running');
      },label,{timeout:5000});
      return page.evaluate(sampleSurface);
    }
    async function beginTrace() {
      await page.evaluate(sampleSource=>{
        const sample=(0,eval)('('+sampleSource+')');
        window.__clipTestTrace={frames:[],stop:false};
        const frame=()=>{__clipTestTrace.frames.push(sample());if(!__clipTestTrace.stop)requestAnimationFrame(frame);};
        frame();
      },sampleSurface.toString());
    }
    async function endTrace() {
      return page.evaluate(()=>{__clipTestTrace.stop=true;return __clipTestTrace.frames;});
    }
    await page.goto(origin+'/kensa.html',{waitUntil:'domcontentloaded'});
    // Enter the real sorting scene using visible probe/handle gestures only.
    await hint('さす'); await page.locator('#poke').waitFor({state:'visible'});
    let r=await box('probe'),a={x:r.x+r.width*.85,y:r.y+r.height/2};
    await gesture(400,p=>({x:a.x+(Math.max(4,a.x-145)-a.x)*p,y:a.y}),12); await hint('ひきぬく');
    r=await box('probe'); a={x:r.x+r.width*.85,y:r.y+r.height/2};
    await gesture(400,p=>({x:Math.min(840,a.x+145*p),y:a.y}),12); await hint('ぐるぐる');
    r=await box('crank');const c={x:r.x+r.width/2,y:r.y+r.height/2},radius=Math.min(r.width,r.height)*.27;
    await gesture(1500,p=>({x:c.x+radius*Math.cos(2*Math.PI*p),y:c.y+radius*Math.sin(2*Math.PI*p)}),36);
    await hint('なでて'); await page.locator('#zoomBtn').waitFor({state:'visible'});
    // The first pile's visible zoom button is sufficient; no hidden grain kind is chosen.
    const restingBefore=await page.evaluate(sampleSurface);
    await tapZoom(); const zoomed=await settled('➖');
    await beginTrace(); await tapZoom(); await settled('🔍'); await wait(100);
    const ordinary=await endTrace(),restingAfter=await page.evaluate(sampleSurface);
    const events=await page.evaluate(()=>__clipTestEvents);
    return {reducedMotion,restingBefore,zoomed,ordinary,restingAfter,commands,events,missing,blocked,errors};
  } finally { await context.close(); }
}
(async()=>{
  const executablePath=process.env.CHROMIUM||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
  const browser=await chromium.launch({executablePath,headless:true,ignoreDefaultArgs:['--mute-audio'],args:['--no-sandbox','--disable-background-networking']});
  try { console.log(JSON.stringify({normal:await runContext(browser,'no-preference'),reduced:await runContext(browser,'reduce')})); }
  finally { await browser.close(); }
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
"""


class TestKensaZoomClipping(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        node = shutil.which("node")
        if not node:
            raise unittest.SkipTest("node がないので実表示の確認は飛ばす")
        result = subprocess.run([node, "-e", BROWSER_JS, HTML_PATH, ROOT], cwd=ROOT,
                                capture_output=True, text=True, timeout=180)
        if result.returncode:
            raise AssertionError(result.stderr[-4000:])
        cls.result = json.loads(result.stdout.strip().splitlines()[-1])
        if cls.result.get("skip"):
            raise unittest.SkipTest(cls.result["skip"])
        if os.environ.get("KENSA_TRACE_OUTPUT"):
            with open(os.environ["KENSA_TRACE_OUTPUT"], "w", encoding="utf-8") as trace:
                json.dump(cls.result, trace, ensure_ascii=False, indent=2)

    def context(self, name):
        result = self.result[name]
        self.assertEqual(result["errors"], [])
        self.assertEqual(result["missing"], [])
        self.assertEqual(result["blocked"], [])
        self.assertTrue(result["events"])
        self.assertTrue(all(e["trusted"] and e["pointerType"] == "touch" for e in result["events"]))
        self.assertGreater(result["zoomed"]["scale"], 1.5)
        return result

    def unclipped_at_rest(self, state):
        self.assertAlmostEqual(state["scale"], 1, places=3)
        self.assertEqual(state["zoomLabel"], "🔍")
        self.assertEqual([state["overflowX"], state["overflowY"]], ["visible", "visible"])

    def no_surface_leak(self, frames):
        eligible = [f for f in frames if f["zoomLabel"] == "🔍" and f["scale"] > 1.05 and f["probes"]]
        self.assertGreaterEqual(len(eligible), 2, "縮小中かつ皿外に変形面があるフレームを実測する")
        leaked = [{"at": f["at"], "scale": f["scale"], "points": [p for p in f["probes"] if p["leaked"]]}
                  for f in eligible if any(p["leaked"] for p in f["probes"])]
        self.assertEqual(len(leaked), 0, "縮小中の皿が外の画面を覆った: " + json.dumps(leaked[:2], ensure_ascii=False))

    def test_zoom_out_keeps_transformed_surface_inside_plate(self):
        result = self.context("normal")
        self.unclipped_at_rest(result["restingBefore"])
        self.no_surface_leak(result["ordinary"])
        self.unclipped_at_rest(result["restingAfter"])

    def test_reduced_motion_resets_without_lingering_clip(self):
        result = self.context("reduced")
        after = [f for f in result["ordinary"] if f["zoomLabel"] == "🔍"]
        self.assertTrue(after)
        for frame in after:
            self.unclipped_at_rest(frame)
        self.unclipped_at_rest(result["restingAfter"])


if __name__ == "__main__":
    unittest.main()
