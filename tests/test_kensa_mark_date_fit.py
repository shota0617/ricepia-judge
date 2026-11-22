"""Browser regression: the stamp mark's date stays inside the red circle (cycle 184).

The old date size was a fixed 11px. On 568x320 the circle is only 72px wide and
"2026.11.22" crossed the circle's border by 4-7px on the right. The date now
follows the circle width (container units) and stays 11px where it already fit.

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
(async () => {
  let browser;
  try {
    try { browser = await chromium.launch({executablePath:executable || undefined, timeout:20000, headless:true,
      args:['--no-sandbox','--disable-background-networking']}); }
    catch (e) { console.log(JSON.stringify({skip:'Chromium unavailable', detail:String(e)})); return; }
    const cases = []; let fallback = null;
    for (const [w, h] of [[320,568],[390,844],[568,320],[844,390],[820,1180]]) {
      const context = await browser.newContext({viewport:{width:w,height:h}, isMobile:true, hasTouch:true, serviceWorkers:'block'});
      const errors = [];
      try {
        await context.route('**/*', async route => {
          const u = new URL(route.request().url());
          if (u.origin !== 'http://kensa.test') return route.abort('blockedbyclient');
          const file = u.pathname === '/kensa.html' ? html : path.resolve(root, '.' + decodeURIComponent(u.pathname));
          if ((file !== html && !file.startsWith(root + path.sep)) || !fs.existsSync(file) || !fs.statSync(file).isFile())
            return route.fulfill({status:404, body:''});
          // ?nocq=1 serves the page as a browser without container units would read it (the cqw declaration is dropped as invalid)
          const body = file === html && u.searchParams.get('nocq') ? fs.readFileSync(file, 'utf8').split('cqw').join('zzq') : fs.readFileSync(file);
          return route.fulfill({status:200, contentType:types[path.extname(file)] || 'application/octet-stream', body});
        });
        const page = await context.newPage();
        page.on('pageerror', e => errors.push(String(e)));
        await page.goto('http://kensa.test/kensa.html', {waitUntil:'load', timeout:20000});
        await page.evaluate(() => document.fonts.ready);
        // Fixture: real layout and the real stamp functions; the date is the widest form (2 digit month and day).
        await page.evaluate(() => { toOsu(); inkDone(); stampNow(); });
        for (const phase of ['stamp', 'peek']) {
          await page.waitForTimeout(phase === 'stamp' ? 800 : 2000);
          for (const grade of ['1等', '規格外']) {
            cases.push(await page.evaluate(([w, h, phase, grade]) => {
              const m = document.getElementById('mark');
              m.innerHTML = grade + '<small>2026.12.30</small>'; m.className = (grade === '規格外' ? 'small ' : '') + 'on';
              const sm = m.querySelector('small'), keep = m.style.transform; m.style.transform = 'none';
              const r = m.getBoundingClientRect(), k = r.width / m.offsetWidth, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
              const inner = r.width / 2 - parseFloat(getComputedStyle(m).borderTopWidth) * k;
              const range = document.createRange(); range.selectNodeContents(sm); const d = range.getBoundingClientRect();
              const over = Math.max(...[[d.left,d.top],[d.right,d.top],[d.left,d.bottom],[d.right,d.bottom]].map(([x,y]) => Math.hypot(x - cx, y - cy) - inner));
              m.style.transform = keep;
              return {size:w + 'x' + h, phase, grade, circle:Math.round(r.width), font:parseFloat(getComputedStyle(sm).fontSize), over:Math.round(over * 10) / 10};
            }, [w, h, phase, grade]));
          }
        }
        if (w === 390) {
          const old = await context.newPage();
          await old.goto('http://kensa.test/kensa.html?nocq=1', {waitUntil:'load', timeout:20000});
          await old.evaluate(() => { toOsu(); inkDone(); stampNow(); });
          await old.waitForTimeout(800);
          fallback = await old.evaluate(() => { const m = document.getElementById('mark'); m.innerHTML = '1等<small>2026.12.30</small>'; m.className = 'on';
            return parseFloat(getComputedStyle(m.querySelector('small')).fontSize); });
          await old.close();
        }
        cases.forEach(c => { if (c.size === w + 'x' + h) c.errors = errors.slice(); });
      } finally { await context.close(); }
    }
    console.log(JSON.stringify({cases, fallback}));
  } finally { if (browser) await browser.close(); }
})().catch(e => { console.error(String(e.stack || e)); process.exitCode = 1; });
"""


class MarkDateFitTests(unittest.TestCase):
    def test_stamp_date_stays_inside_the_circle(self):
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
                             cwd=root, capture_output=True, text=True, timeout=120)
        self.assertEqual(run.returncode, 0, run.stderr[-5000:])
        self.assertTrue(run.stdout.strip(), 'Browser runner returned no diagnostics')
        data = json.loads(run.stdout.strip().splitlines()[-1])
        if data.get('skip'):
            if required:
                self.fail(json.dumps(data, ensure_ascii=False))
            self.skipTest(data['skip'])
        print('mark-date diagnostics: ' + json.dumps(data, ensure_ascii=False))
        self.assertEqual(len(data['cases']), 20)
        # A browser without container units must fall back to the old 11px, not inherit the big grade size
        self.assertEqual(data['fallback'], 11, 'Without container units the date is not 11px: ' + str(data['fallback']))
        for c in data['cases']:
            with self.subTest(size=c['size'], phase=c['phase'], grade=c['grade']):
                why = json.dumps(c, ensure_ascii=False)
                self.assertFalse(c['errors'], why)
                self.assertLessEqual(c['over'], 0, 'The date crosses the circle border: ' + why)
                if c['size'] != '568x320':  # circles of 84px or more already fit at 11px; keep that size there
                    self.assertEqual(c['font'], 11, 'The date shrank where it already fit: ' + why)
                else:
                    self.assertGreaterEqual(c['font'], 8, 'The date became too small to read: ' + why)


if __name__ == '__main__':
    unittest.main()
