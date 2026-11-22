"""Play numbers for the inspection game (cycle 187, owner 2026-11-22).

kensa.html sends five events through the same tracker as the other games
(nishio-go/analytics.js, window.nsgTrack): play_open, play_first_touch,
play_first_reward, play_minute and play_end, each with game:'kensa' and only numbers.
The tracker only runs on the public domains and is switched off by
localStorage nsg_noanalytics='1' (a line at the bottom of the 📖 notes switches it).

1. Node with a fake clock runs the real playStats block: minute only counts visible
   time, play_end is not sent twice with the same content within 2 seconds, the switch.
2. A real browser plays with a recording nsgTrack, with the real analytics.js on a
   test domain (no outside requests), with analytics.js missing (404), and switched off.

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


def _paths():
    default_root = Path(__file__).resolve().parents[1]
    root = Path(os.environ.get('KENSA_ROOT', default_root)).resolve()
    html = Path(os.environ.get('KENSA_HTML', root / 'kensa.html')).resolve()
    if 'KENSA_ROOT' not in os.environ and 'KENSA_HTML' in os.environ:
        root = html.parent
    return root, html


NODE_HARNESS = r"""
const assert = require('node:assert/strict');
let now = 0, timers = [], seq = 0;
const performance = { now: () => now };
const setTimeout = (f, ms) => { const id = ++seq; timers.push({ id, at:now + ms, f }); return id; }, clearTimeout = id => { timers = timers.filter(t => t.id !== id); };
const advance = ms => { const end = now + ms; for (;;) { timers.sort((a, b) => a.at - b.at); const t = timers[0]; if (!t || t.at > end) break; timers.shift(); now = t.at; t.f(); } now = end; };
const docL = {}, winL = {}, elL = {};
const document = { hidden:false, documentElement:{}, addEventListener(t, f) { (docL[t] = docL[t] || []).push(f); } };
const calls = [];
const window = { addEventListener(t, f) { (winL[t] = winL[t] || []).push(f); }, nsgTrack: (n, p) => calls.push([n, p]) };
const el = id => ({ textContent:'', addEventListener(t, f) { (elL[id + ':' + t] = elL[id + ':' + t] || []).push(f); }, removeEventListener() {} });
const els = { app:el('app'), anaText:el('anaText'), anaBtn:el('anaBtn') }; const $ = id => els[id];
let store = {}; const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
const cookedReturns = []; let step = 0;
const hide = h => { document.hidden = h; (docL.visibilitychange || []).forEach(f => f()); };
const names = () => calls.map(c => c[0]);
"""

NODE_SCENARIO = r"""
assert.deepEqual(names(), ['play_open']); assert.equal(calls[0][1].game, 'kensa');
advance(30000); hide(true);                                  // 30秒 見て かくれる
assert.deepEqual(calls.at(-1), ['play_end', { game:'kensa', secs:30, bags:0, step:0, transport_type:'beacon' }]);
(winL.pagehide || []).forEach(f => f());                     // 同じ 中身を すぐ 2回 送らない
assert.equal(names().filter(n => n === 'play_end').length, 1);
advance(120000);                                             // かくれて いる 間は 数えない
assert.ok(!names().includes('play_minute'), 'かくれて いる 間に play_minute が 出た');
hide(false); advance(29900); assert.ok(!names().includes('play_minute'));
advance(200); assert.equal(names().filter(n => n === 'play_minute').length, 1);
advance(300000); assert.equal(names().filter(n => n === 'play_minute').length, 1);   // 1回 だけ
cookedReturns.push('1等'); step = 3; advance(3000); hide(true);
assert.deepEqual(calls.at(-1)[1], { game:'kensa', secs:Math.round((30000 + 30100 + 300000 + 3000) / 1000), bags:1, step:3, transport_type:'beacon' });
// 切る スイッチ（📖 の いちばん 下）
assert.match(els.anaText.textContent, /送って います/); assert.equal(els.anaBtn.textContent, '送らない');
hide(false); const n0 = calls.length;
elL['anaBtn:click'].forEach(f => f());
assert.equal(store.nsg_noanalytics, '1'); assert.match(els.anaText.textContent, /送って いません/); assert.equal(els.anaBtn.textContent, '送る');
hide(true); (winL.pagehide || []).forEach(f => f()); assert.equal(calls.length, n0, '切った あとに 送った');
elL['anaBtn:click'].forEach(f => f()); assert.equal(store.nsg_noanalytics, '0'); assert.equal(els.anaBtn.textContent, '送らない');
"""

BROWSER_JS = r"""
const fs = require('node:fs'), path = require('node:path');
const [html, root, executable] = process.argv.slice(1);
let chromium;
try { ({chromium} = require('playwright')); }
catch (e) { console.log(JSON.stringify({skip:'Playwright unavailable', detail:String(e)})); process.exit(0); }
const types = {'.html':'text/html; charset=utf-8','.webp':'image/webp','.png':'image/png','.js':'text/javascript','.css':'text/css'};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FAKE = "window.__calls = []; window.nsgTrack = (n, p) => window.__calls.push([n, JSON.parse(JSON.stringify(p))]);";
(async () => {
  let browser;
  try {
    try { browser = await chromium.launch({executablePath:executable || undefined, timeout:20000, headless:true, args:['--no-sandbox','--disable-background-networking']}); }
    catch (e) { console.log(JSON.stringify({skip:'Chromium unavailable', detail:String(e)})); return; }
    const out = {};
    const run = async (mode) => {
      const context = await browser.newContext({viewport:{width:390,height:844}, isMobile:true, hasTouch:true, serviceWorkers:'block'});
      const outside = [], errors = [];
      if (mode === 'off') await context.addInitScript(() => { try { localStorage.setItem('nsg_noanalytics', '1'); } catch (e) {} });
      await context.route('**/*', async route => {
        const u = new URL(route.request().url());
        if (u.origin !== 'http://kensa.test') { outside.push(u.hostname); return route.abort('blockedbyclient'); }
        if (u.pathname === '/nishio-go/analytics.js') {
          if (mode === 'missing') return route.fulfill({status:404, body:''});
          if (mode === 'fake' || mode === 'off') return route.fulfill({status:200, contentType:'text/javascript', body:FAKE});
        }
        const file = u.pathname === '/kensa.html' ? html : path.resolve(root, '.' + decodeURIComponent(u.pathname));
        if ((file !== html && !file.startsWith(root + path.sep)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({status:404, body:''});
        return route.fulfill({status:200, contentType:types[path.extname(file)] || 'application/octet-stream', body:fs.readFileSync(file)});
      });
      const page = await context.newPage(); page.on('pageerror', e => errors.push(String(e)));
      await page.goto('http://kensa.test/kensa.html', {waitUntil:'load', timeout:20000});
      await sleep(800);
      const cdp = await context.newCDPSession(page);
      const tap = async (x, y) => { await cdp.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x, y, id:1}]}); await sleep(60); await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]}); };
      // 1ふくろめ は 空振り 2回 で 進む（運営者の 決め）。袋を たたいて 最初の 段を 終える
      for (let k = 0; k < 12; k++) {
        if (await page.evaluate(() => step) >= 1) break;
        const b = await page.evaluate(() => { const r = document.getElementById('bagBtn').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
        await tap(b[0], b[1]); await sleep(900);
      }
      const r = { step:await page.evaluate(() => step), errors };
      if (mode === 'fake' || mode === 'off') {
        await page.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable:true, get:() => true}); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); });
        r.calls = await page.evaluate(() => window.__calls);
        r.line = await page.evaluate(() => [document.getElementById('anaText').textContent, document.getElementById('anaBtn').textContent]);
        await page.evaluate(() => document.getElementById('anaBtn').click());
        r.lineAfter = await page.evaluate(() => [document.getElementById('anaText').textContent, document.getElementById('anaBtn').textContent, localStorage.getItem('nsg_noanalytics')]);
      }
      r.outside = outside;
      await context.close();
      return r;
    };
    for (const mode of ['fake', 'real', 'missing', 'off']) out[mode] = await run(mode);
    console.log(JSON.stringify(out));
  } finally { if (browser) await browser.close(); }
})().catch(e => { console.error(String(e.stack || e)); process.exitCode = 1; });
"""


class PlayStatsTests(unittest.TestCase):
    def _node(self):
        node = shutil.which('node')
        if not node:
            if os.environ.get('KENSA_REQUIRE_BROWSER') == '1':
                self.fail('KENSA_REQUIRE_BROWSER=1 but Node is unavailable')
            self.skipTest('Node unavailable')
        return node

    def test_minute_end_and_switch_with_a_fake_clock(self):
        node = self._node()
        _, html = _paths()
        src = html.read_text(encoding='utf-8')
        self.assertTrue('(function playStats() {' in src, 'kensa.html does not send play numbers (no playStats block)')
        start = src.index('(function playStats() {')
        block = src[start:src.index('})();', start) + len('})();')]
        r = subprocess.run([node, '-e', NODE_HARNESS + block + NODE_SCENARIO], capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr[-1500:])

    def test_real_play_sends_the_five_events_only_when_allowed(self):
        required = os.environ.get('KENSA_REQUIRE_BROWSER') == '1'
        node = self._node()
        root, html = _paths()
        self.assertTrue(html.is_file(), 'Set KENSA_HTML or KENSA_ROOT to the product source')
        executable = os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium') or shutil.which('chromium-browser') or ''
        run = subprocess.run([node, '-e', BROWSER_JS, str(html), str(root), executable], cwd=root, capture_output=True, text=True, timeout=180)
        self.assertEqual(run.returncode, 0, run.stderr[-5000:])
        data = json.loads(run.stdout.strip().splitlines()[-1])
        if data.get('skip'):
            if required:
                self.fail(json.dumps(data, ensure_ascii=False))
            self.skipTest(data['skip'])
        print('play-stats diagnostics: ' + json.dumps(data, ensure_ascii=False))
        for mode, c in data.items():
            with self.subTest(mode=mode):
                why = json.dumps(c, ensure_ascii=False)
                self.assertFalse(c['errors'], why)
                self.assertGreaterEqual(c['step'], 1, 'The game no longer moves on: ' + why)
                self.assertEqual(c['outside'], [], 'Requests left the page: ' + why)
        c = data['fake']; why = json.dumps(c, ensure_ascii=False)
        self.assertEqual([n for n, _ in c['calls']], ['play_open', 'play_first_touch', 'play_first_reward', 'play_end'], why)
        for n, p in c['calls']:
            self.assertEqual(p['game'], 'kensa', why)
            self.assertLessEqual(set(p), {'game', 'secs', 'bags', 'step', 'transport_type'}, 'Something other than numbers was sent: ' + why)
        touch, reward, end = c['calls'][1][1], c['calls'][2][1], c['calls'][3][1]
        self.assertIsInstance(touch['secs'], (int, float)); self.assertLessEqual(touch['secs'], reward['secs'], why)
        self.assertEqual((end['bags'], end['step'], end['transport_type']), (0, c['step'], 'beacon'), why)
        self.assertEqual(c['line'][1], '送らない', why)
        self.assertEqual((c['lineAfter'][1], c['lineAfter'][2]), ('送る', '1'), why)
        c = data['off']; why = json.dumps(c, ensure_ascii=False)
        self.assertEqual(c['calls'], [], 'Sent while switched off: ' + why)
        self.assertEqual(c['line'][1], '送る', why)
        self.assertEqual((c['lineAfter'][1], c['lineAfter'][2]), ('送らない', '0'), why)


if __name__ == '__main__':
    unittest.main()
