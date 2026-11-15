"""Browser regression using an explicit layout fixture, separate from natural play.

KENSA_HTML or KENSA_ROOT selects the full product HTML. Set NODE_PATH for
Playwright and optionally CHROMIUM_EXECUTABLE. KENSA_REQUIRE_BROWSER=1 makes
missing Node/Playwright/Chromium a failure instead of a skip.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest


BROWSER_JS = r"""
const fs = require('node:fs'), path = require('node:path');
const [html, root, executable] = process.argv.slice(1);
let chromium;
try { ({chromium} = require('playwright')); }
catch (e) { console.log(JSON.stringify({skip:'Playwright unavailable', detail:String(e)})); process.exit(0); }
const types = {'.html':'text/html; charset=utf-8','.webp':'image/webp','.png':'image/png','.js':'text/javascript','.css':'text/css'};
(async () => {
  let browser;
  try {
    try { browser = await chromium.launch({executablePath:executable || undefined, timeout:20000,
      headless:true, ignoreDefaultArgs:['--mute-audio'], args:['--no-sandbox','--disable-background-networking']}); }
    catch (e) { console.log(JSON.stringify({skip:'Chromium unavailable', detail:String(e)})); return; }
    const results = [];
    for (const mode of ['normal','interrupted','reduce']) {
      const context = await browser.newContext({viewport:{width:844,height:390}, isMobile:true,
        hasTouch:true, serviceWorkers:'block', reducedMotion:mode === 'reduce' ? 'reduce' : 'no-preference'});
      const blocked = [], errors = [];
      try {
        await context.route('**/*', async route => {
          const u = new URL(route.request().url());
          if (u.origin !== 'http://kensa.test') { blocked.push(u.href); return route.abort('blockedbyclient'); }
          const file = u.pathname === '/kensa.html' ? html : path.resolve(root, '.' + decodeURIComponent(u.pathname));
          if ((file !== html && !file.startsWith(root + path.sep)) || !fs.existsSync(file) || !fs.statSync(file).isFile())
            return route.fulfill({status:404, body:''});
          return route.fulfill({status:200, contentType:types[path.extname(file)] || 'application/octet-stream', body:fs.readFileSync(file)});
        });
        const page = await context.newPage();
        page.on('pageerror', e => errors.push(String(e)));
        await page.goto('http://kensa.test/kensa.html', {waitUntil:'load', timeout:20000});
        await page.evaluate(() => document.fonts.ready);
        // Deliberate fixture: real layout/functions; no input-progress or retention claim.
        await page.evaluate(() => { toMiwakeru(); spread = true; Z.s = 1; Z.tx = 0; Z.ty = 0; applyZoom(); });
        await page.waitForTimeout(600); // Let the existing scene/button entrance finish.
        await page.evaluate(() => {
          const plate = document.getElementById('plate'), inner = document.getElementById('plateInner');
          const box = e => { const r=e.getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; };
          const read = () => {
            const p=box(plate), r=box(inner), cs=getComputedStyle(plate), is=getComputedStyle(inner);
            const button=document.getElementById('zoomBtn'), buttonBox=box(button);
            const buttonHit=document.elementFromPoint(buttonBox.left+buttonBox.width/2,buttonBox.top+buttonBox.height/2);
            const coordinates = [[p.left-12,p.top+p.height/2],[p.right+12,p.top+p.height/2],
              [p.left+p.width/4,p.top-12],[p.left+p.width/2,p.top-12],[p.left+3*p.width/4,p.top-12],
              [p.left+p.width/2,p.bottom+12]];
            const probes = coordinates.filter(([x,y]) => x>0 && y>0 && x<innerWidth && y<innerHeight &&
              x>r.left+1 && x<r.right-1 && y>r.top+1 && y<r.bottom-1 &&
              (x<p.left || x>p.right || y<p.top || y>p.bottom)).map(([x,y]) => {
                const hit=document.elementFromPoint(x,y);
                return {x,y,innerHit:!!hit && (hit===inner || inner.contains(hit)),hitId:hit?.id || hit?.tagName || null};
              });
            return {now:performance.now(),logicalScale:Z.s,renderedScale:is.transform==='none'?1:new DOMMatrixReadOnly(is.transform).a,
              smooth:inner.classList.contains('smooth'),zoomed:plate.classList.contains('zoomed'),
              overflowX:cs.overflowX,overflowY:cs.overflowY,transitionDuration:is.transitionDuration,
              plate:p,button:buttonBox,buttonHit:!!buttonHit && (buttonHit===button || button.contains(buttonHit)),probes};
          };
          window.__zoomClipRegression = {read,frames:[],done:false,supportsHas:CSS.supports('selector(:has(*))')};
        });
        const initial = await page.evaluate(() => __zoomClipRegression.read());
        await page.evaluate(() => { Z.s=2; Z.tx=-PW/2; Z.ty=-PH/2; applyZoom(); });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const zoomed = await page.evaluate(() => __zoomClipRegression.read());
        const cdp = await context.newCDPSession(page);
        await page.evaluate(() => {
          const d=__zoomClipRegression, until=performance.now()+1200;
          const tick=() => { d.frames.push(d.read()); if(performance.now()<until) requestAnimationFrame(tick); else d.done=true; };
          requestAnimationFrame(tick);
        });
        const button = zoomed.button, x=button.left+button.width/2, y=button.top+button.height/2;
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
        await page.waitForTimeout(40);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        let interrupted = null;
        if (mode === 'interrupted') {
          await page.waitForFunction(() => { const f=__zoomClipRegression.read();
            return f.smooth && Math.abs(f.logicalScale-1)<0.0001 && f.renderedScale>1.05;
          }, null, {polling:'raf',timeout:1500});
          const p = await page.evaluate(() => __zoomClipRegression.read().plate);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.left+p.width/2,y:p.top+p.height/2,id:1}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]}); // No grain tap or empty-pick progression.
          interrupted = await page.evaluate(() => __zoomClipRegression.read());
        }
        await page.waitForFunction(() => __zoomClipRegression.done, null, {timeout:5000});
        results.push(await page.evaluate(({mode,initial,zoomed,interrupted,blocked,errors}) => ({mode,initial,zoomed,interrupted,
          blocked,errors,supportsHas:__zoomClipRegression.supportsHas,frames:__zoomClipRegression.frames,final:__zoomClipRegression.read()}),
          {mode,initial,zoomed,interrupted,blocked,errors}));
        await cdp.detach();
      } finally { await context.close(); }
    }
    console.log(JSON.stringify({results}));
  } finally { if(browser) await browser.close(); }
})().catch(e => { console.error(String(e.stack || e)); process.exitCode=1; });
"""


class ZoomClipRegressionTests(unittest.TestCase):
    def test_zoom_out_keeps_rendered_content_clipped(self):
        required = os.environ.get('KENSA_REQUIRE_BROWSER') == '1'
        node = shutil.which('node')
        if not node:
            if required:
                self.fail('KENSA_REQUIRE_BROWSER=1 but Node is unavailable')
            self.skipTest('Node unavailable')
        default_root = Path(__file__).resolve().parents[1]
        root = Path(os.environ.get('KENSA_ROOT', default_root)).resolve()
        html = Path(os.environ.get('KENSA_HTML', root / 'kensa.html')).resolve()
        if 'KENSA_ROOT' not in os.environ and 'KENSA_HTML' in os.environ:
            root = html.parent
        self.assertTrue(html.is_file(), 'Set KENSA_HTML or KENSA_ROOT to the product source')
        executable = os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium') or shutil.which('chromium-browser') or ''
        run = subprocess.run([node, '-e', BROWSER_JS, str(html), str(root), executable],
                             cwd=root, capture_output=True, text=True, timeout=90)
        self.assertEqual(run.returncode, 0, run.stderr[-5000:])
        self.assertTrue(run.stdout.strip(), 'Browser runner returned no diagnostics')
        data = json.loads(run.stdout.strip().splitlines()[-1])
        if data.get('skip'):
            if required:
                self.fail(json.dumps(data, ensure_ascii=False))
            self.skipTest(data['skip'])
        self.assertEqual([r['mode'] for r in data['results']], ['normal','interrupted','reduce'])
        diagnostics = {'html':str(html),'sha256':hashlib.sha256(html.read_bytes()).hexdigest(),'cases':[]}
        for result in data['results']:
            eligible = [f for f in result['frames'] if f['smooth'] and not f['zoomed'] and
                        abs(f['logicalScale']-1)<0.0001 and f['renderedScale']>1.05 and f['probes']]
            escaped = [f for f in eligible if any(p['innerHit'] for p in f['probes'])]
            diagnostics['cases'].append({'mode':result['mode'],'supportsHas':result['supportsHas'],
                'frameCount':len(result['frames']),'eligibleFrames':len(eligible),'escapedFrames':len(escaped),
                'firstEligible':eligible[0] if eligible else None,'firstEscape':escaped[0] if escaped else None,
                'initial':result['initial'],'zoomed':result['zoomed'],'interrupted':result['interrupted'],
                'final':result['final'],'blocked':result['blocked'],'errors':result['errors']})
        print('zoom-clip diagnostics: ' + json.dumps(diagnostics, ensure_ascii=False))
        for result, diagnostic in zip(data['results'], diagnostics['cases']):
            with self.subTest(mode=result['mode']):
                why = json.dumps(diagnostic, ensure_ascii=False)
                self.assertTrue(result['supportsHas'], ':has unsupported; not GREEN: ' + why)
                self.assertFalse(result['errors'], why)
                self.assertFalse(result['blocked'], why)
                initial, zoomed, final = result['initial'], result['zoomed'], result['final']
                for state in (initial, zoomed, final):
                    self.assertTrue(state['buttonHit'], 'Zoom button center is not reachable: ' + why)
                self.assertAlmostEqual(initial['renderedScale'], 1, delta=0.001, msg=why)
                self.assertEqual((initial['overflowX'],initial['overflowY']), ('visible','visible'), why)
                self.assertAlmostEqual(zoomed['renderedScale'], 2, delta=0.001, msg=why)
                self.assertTrue(zoomed['zoomed'] and zoomed['probes'], why)
                self.assertFalse(any(p['innerHit'] for p in zoomed['probes']), why)
                if result['mode'] != 'reduce':
                    self.assertGreater(diagnostic['eligibleFrames'], 0, 'No real intermediate frame captured: ' + why)
                    self.assertEqual(diagnostic['escapedFrames'], 0, 'Rendered content escaped the plate: ' + why)
                    self.assertEqual(diagnostic['firstEligible']['transitionDuration'], '0.45s', why)
                else:
                    self.assertEqual(diagnostic['eligibleFrames'], 0, why)
                    self.assertEqual(final['transitionDuration'], '0s', why)
                self.assertFalse(final['smooth'], why)
                if result['mode'] == 'interrupted':
                    stop = result['interrupted']
                    self.assertGreater(stop['logicalScale'], 1.05, 'Pointer missed the live transition: ' + why)
                    self.assertFalse(stop['smooth'], why)
                    self.assertAlmostEqual(stop['renderedScale'], stop['logicalScale'], delta=0.001, msg=why)
                    self.assertTrue(stop['probes'], 'No safe probe immediately after interruption: ' + why)
                    self.assertFalse(any(p['innerHit'] for p in stop['probes']), why)
                    self.assertTrue(final['zoomed'] and final['probes'], why)
                    self.assertFalse(any(p['innerHit'] for p in final['probes']), why)
                else:
                    self.assertAlmostEqual(final['renderedScale'], 1, delta=0.001, msg=why)
                    self.assertFalse(final['zoomed'], why)
                    self.assertEqual((final['overflowX'],final['overflowY']), ('visible','visible'), why)
                for key in ('width','height'):
                    self.assertAlmostEqual(initial['plate'][key], final['plate'][key], delta=0.75, msg=why)


if __name__ == '__main__':
    unittest.main()
