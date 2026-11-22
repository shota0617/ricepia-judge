"""Browser regression: a finger left resting on the plate (cycle 185).

The old code turned every second finger into a pinch. A thumb resting on the plate edge
made the index finger's tap on a bad grain only knock the plate (no pick, no miss).
A second finger that lands next to a resting finger (down for 60ms or more, within 12px)
is first a tap candidate: if it lifts without moving it is one finger's tap. As soon as
either finger moves more than 12px it is the same pinch as before, measured from the
moment the second finger landed, so the one-sided pinch (rest one finger, spread the
other) zooms exactly as before. A stroke with a resting thumb stays a pinch (not changed).

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
    try { browser = await chromium.launch({executablePath:executable || undefined, timeout:20000, headless:true,
      args:['--no-sandbox','--disable-background-networking']}); }
    catch (e) { console.log(JSON.stringify({skip:'Chromium unavailable', detail:String(e)})); return; }
    const out = {};
    const fresh = async (spreadFirst) => {
      const context = await browser.newContext({viewport:{width:390,height:844}, isMobile:true, hasTouch:true, serviceWorkers:'block'});
      await context.route('**/*', async route => {
        const u = new URL(route.request().url());
        if (u.origin !== 'http://kensa.test') return route.abort('blockedbyclient');
        const file = u.pathname === '/kensa.html' ? html : path.resolve(root, '.' + decodeURIComponent(u.pathname));
        if ((file !== html && !file.startsWith(root + path.sep)) || !fs.existsSync(file) || !fs.statSync(file).isFile())
          return route.fulfill({status:404, body:''});
        return route.fulfill({status:200, contentType:types[path.extname(file)] || 'application/octet-stream', body:fs.readFileSync(file)});
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.goto('http://kensa.test/kensa.html', {waitUntil:'load', timeout:20000});
      // Fixture: the real sorting scene and real handlers. For the picking cases the grains are laid out on a grid
      // (as after a real spread) so that the bad grains are not hidden under the pile.
      await page.evaluate(s => { toMiwakeru(); grains.forEach(g => { g.el.hidden = false; }); /* 水分計の 段で 粒を 注ぐ（pourOne）かわり */ if (s) { grains.forEach((g, i) => { g.x = PW * (0.22 + 0.56 * (i % 5) / 4); g.y = PH * (0.25 + 0.5 * Math.floor(i / 5) / 3); g.r = 0; renderGrain(g); }); checkSpread(); spread = true; } }, spreadFirst);
      await sleep(700);
      const cdp = await context.newCDPSession(page);
      const tp = (type, pts) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints:pts.map(([x, y, id]) => ({x, y, id}))});
      const st = () => page.evaluate(() => ({badLeft, misses:pickMisses, zoom:Math.round(Z.s * 100) / 100, spread}));
      const plate = await page.evaluate(() => { const r = document.getElementById('plate').getBoundingClientRect(); return {cx:r.left + r.width / 2, cy:r.top + r.height / 2, w:r.width, h:r.height}; });
      // Screen point of a grain from the game's own plate coordinates (the inverse of toLocal).
      const bad = () => page.evaluate(() => { const g = grains.find(g => !g.gone && g.kind !== 'seiryu'), r = plate.getBoundingClientRect();
        return [r.left + plate.clientLeft + Z.tx + g.x * Z.s, r.top + plate.clientTop + Z.ty + g.y * Z.s]; });
      // An empty spot of the plate itself: no grain within 40px, and the point really lands on the plate (not the 🔍 button
      // in its corner, not outside its edge). With dx, the second point (x + dx, y) must be such a spot too, so that a
      // "two fingers on the plate" case really puts both fingers on the plate (cycle 185b: the old search let the second
      // finger fall outside the plate or on 🔍 in 6 of 30 runs, which is one finger's tap and rightly a miss).
      const empty = (dx = 0) => page.evaluate(([x0, y0, w, h, dx]) => {
        const r = plate.getBoundingClientRect();
        const free = (x, y) => { const e = document.elementFromPoint(x, y);
          return !!e && (e.id === 'plateInner' || e.id === 'plate') && !grainAt(toLocal(x, y)) &&
            !grains.some(g => Math.hypot(r.left + plate.clientLeft + Z.tx + g.x * Z.s - x, r.top + plate.clientTop + Z.ty + g.y * Z.s - y) < 40); };
        for (let i = 0; i < 1000; i++) { const x = x0 - w * 0.42 + Math.random() * w * 0.84, y = y0 - h * 0.42 + Math.random() * h * 0.84;
          if (free(x, y) && (!dx || free(x + dx, y))) return [x, y]; }
        return null; }, [plate.cx, plate.cy, plate.w, plate.h, dx]);
      const thumb = [plate.cx - plate.w * 0.45, plate.cy + plate.h * 0.42, 0];
      return {context, page, errors, tp, st, plate, bad, empty, thumb};
    };
    // A: thumb rests, index taps a bad grain. Two lift orders.
    for (const order of ['tapFirst', 'thumbFirst']) {
      const f = await fresh(true); const g = await f.bad(), before = await f.st();
      await f.tp('touchStart', [f.thumb]); await sleep(150);
      await f.tp('touchStart', [f.thumb, [g[0], g[1], 1]]); await sleep(70);
      if (order === 'tapFirst') { await f.tp('touchEnd', [f.thumb]); await sleep(80); await f.tp('touchEnd', []); }
      else { await f.tp('touchEnd', [[g[0], g[1], 1]]); await sleep(40); await f.tp('touchEnd', []); }
      await sleep(400); out['A_' + order] = {before, after:await f.st(), errors:f.errors}; await f.context.close();
    }
    // A-miss: thumb rests, index taps an empty spot -> the same miss as one finger
    { const f = await fresh(true); const e = await f.empty(), before = await f.st();
      await f.tp('touchStart', [f.thumb]); await sleep(150); await f.tp('touchStart', [f.thumb, [e[0], e[1], 1]]); await sleep(70);
      await f.tp('touchEnd', [f.thumb]); await sleep(80); await f.tp('touchEnd', []); await sleep(400);
      out.A_miss = {before, after:await f.st(), errors:f.errors}; await f.context.close(); }
    // A-cancel: thumb rests, index on a bad grain, then the system cancels. Nothing is picked; one finger works after.
    { const f = await fresh(true); const g = await f.bad(), before = await f.st();
      await f.tp('touchStart', [f.thumb]); await sleep(150); await f.tp('touchStart', [f.thumb, [g[0], g[1], 1]]); await sleep(70);
      await f.tp('touchCancel', []); await sleep(400); const mid = await f.st();
      const fingers = await f.page.evaluate(() => ({pts:pts.size, sortDrag:!!sortDrag, pinch:!!pinch, pend:typeof pend !== 'undefined' && !!pend}));
      await f.tp('touchStart', [[g[0], g[1], 1]]); await sleep(60); await f.tp('touchEnd', []); await sleep(400);
      out.A_cancel = {before, mid, fingers, after:await f.st(), errors:f.errors}; await f.context.close(); }
    // One-sided pinch: one finger rests 120ms, the other lands 60px away and moves out to 156px -> 156/60 = 2.6x, as before
    { const f = await fresh(true); const p = f.plate, before = await f.st();
      await f.tp('touchStart', [[p.cx - 30, p.cy, 0]]); await sleep(120);
      await f.tp('touchStart', [[p.cx - 30, p.cy, 0], [p.cx + 30, p.cy, 1]]);
      for (let i = 1; i <= 12; i++) { await sleep(25); await f.tp('touchMove', [[p.cx - 30, p.cy, 0], [p.cx + 30 + 8 * i, p.cy, 1]]); }
      await f.tp('touchEnd', [[p.cx + 126, p.cy, 1]]); await sleep(60); await f.tp('touchEnd', []); await sleep(300);
      out.oneSided = {before, after:await f.st(), errors:f.errors}; await f.context.close(); }
    // A resting finger that starts to move: the same pinch from the moment the second finger landed (60px -> 156px)
    { const f = await fresh(true); const p = f.plate, before = await f.st();
      await f.tp('touchStart', [[p.cx + 30, p.cy, 1]]); await sleep(120);
      await f.tp('touchStart', [[p.cx - 30, p.cy, 0], [p.cx + 30, p.cy, 1]]); await sleep(40);
      for (let i = 1; i <= 12; i++) { await sleep(25); await f.tp('touchMove', [[p.cx - 30, p.cy, 0], [p.cx + 30 + 8 * i, p.cy, 1]]); }
      await f.tp('touchEnd', [[p.cx - 30, p.cy, 0]]); await sleep(60); await f.tp('touchEnd', []); await sleep(300);
      out.restMoves = {before, after:await f.st(), errors:f.errors}; await f.context.close(); }
    // Pinch: two fingers land together and spread -> zoom, as before
    { const f = await fresh(true); const p = f.plate, before = await f.st();
      await f.tp('touchStart', [[p.cx - 30, p.cy, 0], [p.cx + 30, p.cy, 1]]);
      for (let i = 1; i <= 12; i++) { await sleep(25); await f.tp('touchMove', [[p.cx - 30 - 5 * i, p.cy, 0], [p.cx + 30 + 5 * i, p.cy, 1]]); }
      await f.tp('touchEnd', [[p.cx + 90, p.cy, 1]]); await sleep(60); await f.tp('touchEnd', []); await sleep(300);
      out.pinch = {before, after:await f.st(), errors:f.errors}; await f.context.close(); }
    // Three fingers: resting finger, second finger, third finger -> nothing picked, records cleared after
    { const f = await fresh(true); const g = await f.bad(), p = f.plate, before = await f.st();
      await f.tp('touchStart', [f.thumb]); await sleep(150); await f.tp('touchStart', [f.thumb, [g[0], g[1], 1]]); await sleep(40);
      await f.tp('touchStart', [f.thumb, [g[0], g[1], 1], [p.cx, p.cy - p.h * 0.4, 2]]); await sleep(60);
      await f.tp('touchEnd', [f.thumb, [p.cx, p.cy - p.h * 0.4, 2]]); await sleep(40); await f.tp('touchEnd', [f.thumb]); await sleep(40); await f.tp('touchEnd', []); await sleep(300);
      const fingers = await f.page.evaluate(() => ({pts:pts.size, sortDrag:!!sortDrag, pinch:!!pinch, pend:typeof pend !== 'undefined' && !!pend}));
      out.three = {before, after:await f.st(), fingers, errors:f.errors}; await f.context.close(); }
    // Still pinch: two fingers land together on empty spots and lift -> no pick, no miss, no zoom
    { const f = await fresh(true); const e1 = await f.empty(50), before = await f.st();
      await f.tp('touchStart', [[e1[0], e1[1], 0], [e1[0] + 50, e1[1], 1]]); await sleep(80);
      await f.tp('touchEnd', [[e1[0] + 50, e1[1], 1]]); await sleep(40); await f.tp('touchEnd', []); await sleep(300);
      out.stillPinch = {before, after:await f.st(), errors:f.errors}; await f.context.close(); }
    console.log(JSON.stringify(out));
  } finally { if (browser) await browser.close(); }
})().catch(e => { console.error(String(e.stack || e)); process.exitCode = 1; });
"""


class RestFingerTests(unittest.TestCase):
    def test_resting_finger_does_not_turn_the_other_finger_into_a_pinch(self):
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
                             cwd=root, capture_output=True, text=True, timeout=180)
        self.assertEqual(run.returncode, 0, run.stderr[-5000:])
        self.assertTrue(run.stdout.strip(), 'Browser runner returned no diagnostics')
        data = json.loads(run.stdout.strip().splitlines()[-1])
        if data.get('skip'):
            if required:
                self.fail(json.dumps(data, ensure_ascii=False))
            self.skipTest(data['skip'])
        print('rest-finger diagnostics: ' + json.dumps(data, ensure_ascii=False))
        for key, c in data.items():
            with self.subTest(case=key):
                self.assertFalse(c['errors'], json.dumps(c, ensure_ascii=False))
        for order in ('A_tapFirst', 'A_thumbFirst'):
            with self.subTest(case=order):
                c = data[order]; why = json.dumps(c, ensure_ascii=False)
                self.assertEqual(c['after']['badLeft'], c['before']['badLeft'] - 1, 'Tap with a resting thumb did not pick: ' + why)
                self.assertEqual(c['after']['zoom'], 1, why)
        with self.subTest(case='A_miss'):
            c = data['A_miss']; why = json.dumps(c, ensure_ascii=False)
            self.assertEqual(c['after']['misses'], c['before']['misses'] + 1, 'Empty tap with a resting thumb was not counted like one finger: ' + why)
            self.assertEqual(c['after']['badLeft'], c['before']['badLeft'], why)
        with self.subTest(case='A_cancel'):
            c = data['A_cancel']; why = json.dumps(c, ensure_ascii=False)
            self.assertEqual(c['mid'], c['before'], 'A cancelled touch changed the game: ' + why)
            self.assertEqual(c['fingers'], {'pts': 0, 'sortDrag': False, 'pinch': False, 'pend': False}, 'Finger records were left behind: ' + why)
            self.assertEqual(c['after']['badLeft'], c['before']['badLeft'] - 1, 'One finger did not work after a cancel: ' + why)
        for key in ('oneSided', 'restMoves'):
            with self.subTest(case=key):
                c = data[key]; why = json.dumps(c, ensure_ascii=False)
                self.assertAlmostEqual(c['after']['zoom'], 2.6, delta=2.6 * 0.05, msg='A one-sided pinch zooms differently from before: ' + why)
                self.assertEqual(c['after']['badLeft'], c['before']['badLeft'], why)
        with self.subTest(case='pinch'):
            c = data['pinch']; why = json.dumps(c, ensure_ascii=False)
            self.assertAlmostEqual(c['after']['zoom'], 3.0, delta=3.0 * 0.05, msg='A two-finger pinch zooms differently from before: ' + why)
        with self.subTest(case='three'):
            c = data['three']; why = json.dumps(c, ensure_ascii=False)
            self.assertEqual(c['after']['badLeft'], c['before']['badLeft'], 'A third finger turned the touch into a pick: ' + why)
            self.assertEqual(c['fingers'], {'pts': 0, 'sortDrag': False, 'pinch': False, 'pend': False}, 'Finger records were left behind: ' + why)
        with self.subTest(case='stillPinch'):
            c = data['stillPinch']; why = json.dumps(c, ensure_ascii=False)
            self.assertEqual(c['after'], c['before'], 'A still two-finger touch picked, missed or zoomed: ' + why)


if __name__ == '__main__':
    unittest.main()
