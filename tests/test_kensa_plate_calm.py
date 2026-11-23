"""Browser regression: the empty plate stays quiet until grains are poured (cycle 188).

Right after opening, the inspection plate (a large pure white and pure black area) was the
loudest thing on screen while the player has to touch the bag and the probe. While no grain
is visible on the plate (the first step), the plate is shown faint (opacity only; its size,
place and hit area do not change). When the first grains are poured it comes back in 0.3s,
also with reduced motion (opacity only, same length). From sorting on it looks as before.

KENSA_HTML or KENSA_ROOT selects the product HTML. Set NODE_PATH for Playwright and
optionally CHROMIUM_EXECUTABLE. KENSA_REQUIRE_BROWSER=1 makes missing
Node/Playwright/Chromium a failure instead of a skip.
"""
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let browser;
  try {
    try { browser = await chromium.launch({executablePath:executable || undefined, timeout:20000, headless:true, args:['--no-sandbox','--disable-background-networking']}); }
    catch (e) { console.log(JSON.stringify({skip:'Chromium unavailable', detail:String(e)})); return; }
    const out = [];
    for (const [w, h, reduced] of [[390, 844, false], [844, 390, false], [390, 844, true]]) {
      const context = await browser.newContext({viewport:{width:w,height:h}, isMobile:true, hasTouch:true, serviceWorkers:'block', reducedMotion:reduced ? 'reduce' : 'no-preference'});
      const errors = [];
      await context.route('**/*', async route => {
        const u = new URL(route.request().url());
        if (u.origin !== 'http://kensa.test') return route.abort('blockedbyclient');
        const file = u.pathname === '/kensa.html' ? html : path.resolve(root, '.' + decodeURIComponent(u.pathname));
        if ((file !== html && !file.startsWith(root + path.sep)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({status:404, body:''});
        return route.fulfill({status:200, contentType:types[path.extname(file)] || 'application/octet-stream', body:fs.readFileSync(file)});
      });
      const page = await context.newPage(); page.on('pageerror', e => errors.push(String(e)));
      await page.goto('http://kensa.test/kensa.html', {waitUntil:'load', timeout:20000});
      await sleep(900);
      const cdp = await context.newCDPSession(page);
      const drag = async (x0, y0, x1, y1) => { await cdp.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x:x0, y:y0, id:1}]});
        for (let i = 1; i <= 12; i++) { await sleep(25); await cdp.send('Input.dispatchTouchEvent', {type:'touchMove', touchPoints:[{x:x0 + (x1 - x0) * i / 12, y:y0 + (y1 - y0) * i / 12, id:1}]}); }
        await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]}); };
      const look = () => page.evaluate(() => { const p = document.getElementById('plate'), r = p.getBoundingClientRect(), cs = getComputedStyle(p);
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { opacity:+cs.opacity, transition:cs.transitionDuration, rect:[r.left, r.top, r.width, r.height].map(Math.round),
          hitPlate:!!hit && (hit.id === 'plate' || hit.id === 'plateInner' || !!hit.closest('#plate')), shown:grains.filter(g => !g.el.hidden).length,
          inner:getComputedStyle(document.getElementById('plateInner')).backgroundImage, step }; });
      const open = await look();
      // ぬく: 穀刺しを さして（左へ）ひきぬく（右へ）。粒が 皿に 注がれる
      const a = await page.evaluate(() => { const r = $('sceneBag').getBoundingClientRect(); return {x:r.left + P.rest + P.L * 0.72, y:r.top + P.y, dIn:P.rest - P.inX}; });
      await drag(a.x, a.y, a.x - a.dIn - 10, a.y); await sleep(150);
      const b = await page.evaluate(() => { const r = $('sceneBag').getBoundingClientRect(); return {x:r.left + P.x + P.L * 0.5, y:r.top + P.y, d:P.rest - P.x}; });
      await drag(b.x, b.y, b.x + b.d + 20, b.y);
      await sleep(80); const pouring = await look();
      await sleep(700); const poured = await look();
      await page.evaluate(() => toMiwakeru()); await sleep(500); const sorting = await look();
      out.push({size:w + 'x' + h, reduced, open, pouring, poured, sorting, errors});
      await context.close();
    }
    console.log(JSON.stringify(out));
  } finally { if (browser) await browser.close(); }
})().catch(e => { console.error(String(e.stack || e)); process.exitCode = 1; });
"""

# The sorting plate colors as Chrome reports them for '#fbf8ef 0 50%, #1c1a16 50% 100%' (unchanged since before cycle 188).
BEFORE_INNER = 'linear-gradient(90deg, rgb(251, 248, 239) 0px, rgb(251, 248, 239) 50%, rgb(28, 26, 22) 50%, rgb(28, 26, 22) 100%)'


class PlateCalmTests(unittest.TestCase):
    def test_empty_plate_is_quiet_until_grains_are_poured(self):
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
        run = subprocess.run([node, '-e', BROWSER_JS, str(html), str(root), executable], cwd=root, capture_output=True, text=True, timeout=180)
        self.assertEqual(run.returncode, 0, run.stderr[-5000:])
        data = json.loads(run.stdout.strip().splitlines()[-1])
        if isinstance(data, dict) and data.get('skip'):
            if required:
                self.fail(json.dumps(data, ensure_ascii=False))
            self.skipTest(data['skip'])
        print('plate-calm diagnostics: ' + json.dumps(data, ensure_ascii=False))
        for c in data:
            with self.subTest(size=c['size'], reduced=c['reduced']):
                why = json.dumps(c, ensure_ascii=False)
                self.assertFalse(c['errors'], why)
                o, p, s = c['open'], c['poured'], c['sorting']
                self.assertEqual(o['shown'], 0, why)
                self.assertLessEqual(o['opacity'], 0.5, 'The empty plate is still as loud as before: ' + why)
                self.assertGreaterEqual(o['opacity'], 0.25, 'The empty plate almost disappeared: ' + why)
                self.assertTrue(o['hitPlate'], 'The plate center is not the plate any more: ' + why)
                self.assertGreater(p['shown'], 0, 'No grain was poured: ' + why)
                self.assertEqual(p['opacity'], 1, 'The plate did not come back after the grains were poured: ' + why)
                self.assertEqual(o['rect'], p['rect'], 'The plate size or place changed: ' + why)
                self.assertEqual(o['transition'], '0.3s', 'The plate should come back in 0.3s (also with reduced motion): ' + why)
                self.assertEqual(s['opacity'], 1, why)
                self.assertEqual(s['inner'], BEFORE_INNER, 'Sorting colors changed: ' + why)
                self.assertEqual(s['rect'], o['rect'], why)


if __name__ == '__main__':
    unittest.main()
