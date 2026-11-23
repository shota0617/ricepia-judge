"""Browser regression: the empty dish for sorted-out grains does not look like a button (cycle 189).

While sorting, the dish that receives the grains picked out (#dish) was a solid white rounded
box even when empty, which read as an empty button. While it is empty it now has a dashed
frame, a see-through ground and a faint dashed grain shape (no text). As soon as one grain is
in it, it looks exactly as before. Its size and place do not change.

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
      // Fixture: the real sorting scene; the grains laid out on a grid as after a real spread (bad grains not under the pile).
      await page.evaluate(() => { toMiwakeru(); grains.forEach(g => { g.el.hidden = false; });
        grains.forEach((g, i) => { g.x = PW * (0.22 + 0.56 * (i % 5) / 4); g.y = PH * (0.25 + 0.5 * Math.floor(i / 5) / 3); g.r = 0; renderGrain(g); }); checkSpread(); spread = true; });
      await sleep(900);
      const look = () => page.evaluate(() => { const d = document.getElementById('dish'), cs = getComputedStyle(d), r = d.getBoundingClientRect(), b = getComputedStyle(d, '::before');
        return { kids:d.children.length, bg:cs.backgroundColor, border:cs.borderTopStyle, borderColor:cs.borderTopColor, borderWidth:cs.borderTopWidth,
          rect:[r.left, r.top, r.width, r.height].map(Math.round), shadow:b.content !== 'none' && b.content !== 'normal' ? b.borderTopStyle : null, transition:cs.transitionDuration }; });
      const empty = await look();
      const cdp = await context.newCDPSession(page);
      const tapBad = async () => { const g = await page.evaluate(() => { const g = grains.find(g => !g.gone && g.kind !== 'seiryu'); if (!g) return null; const r = plate.getBoundingClientRect();
          return [r.left + plate.clientLeft + Z.tx + g.x * Z.s, r.top + plate.clientTop + Z.ty + g.y * Z.s]; });
        if (!g) return; await cdp.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x:g[0], y:g[1], id:1}]}); await sleep(60);
        await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]}); };
      await tapBad(); await sleep(1500);
      const one = await look();
      out.push({size:w + 'x' + h, reduced, empty, one, errors});
      await context.close();
    }
    console.log(JSON.stringify(out));
  } finally { if (browser) await browser.close(); }
})().catch(e => { console.error(String(e.stack || e)); process.exitCode = 1; });
"""

# The filled dish as before cycle 189: '#f4eee0' ground and a 3px solid '#cdbf9f' frame.
FILLED = {'bg': 'rgb(244, 238, 224)', 'border': 'solid', 'borderColor': 'rgb(205, 191, 159)', 'borderWidth': '3px'}


class DishEmptyTests(unittest.TestCase):
    def test_empty_dish_is_a_receiving_dish_not_a_button(self):
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
        print('dish-empty diagnostics: ' + json.dumps(data, ensure_ascii=False))
        for c in data:
            with self.subTest(size=c['size'], reduced=c['reduced']):
                why = json.dumps(c, ensure_ascii=False)
                e, o = c['empty'], c['one']
                self.assertFalse(c['errors'], why)
                self.assertEqual(e['kids'], 0, why)
                self.assertEqual(e['border'], 'dashed', 'The empty dish still has a solid frame like a button: ' + why)
                self.assertNotEqual(e['bg'], FILLED['bg'], 'The empty dish is still a solid white box: ' + why)
                self.assertEqual(e['shadow'], 'dashed', 'No faint grain shape in the empty dish: ' + why)
                self.assertEqual(e['borderWidth'], FILLED['borderWidth'], why)
                self.assertGreaterEqual(o['kids'], 1, 'No grain reached the dish: ' + why)
                self.assertEqual({k: o[k] for k in FILLED}, FILLED, 'The dish with a grain does not look as before: ' + why)
                self.assertIsNone(o['shadow'], why)
                self.assertEqual(e['rect'], o['rect'], 'The dish size or place changed: ' + why)
                self.assertEqual(e['transition'], o['transition'], why)


if __name__ == '__main__':
    unittest.main()
