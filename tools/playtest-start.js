// 開始・傾きの 回帰。実機の センサー体感ではなく、ブラウザへ 送る 合成イベントで 確かめる。
const fs = require('fs'), path = require('path');
async function runStartChecks(browser, url, out, { shareOnly = false } = {}) {
  const checks = {}, errors = [];
  async function fresh(kind = 'normal', viewport = { width: 390, height: 780 }, suffix = '') {
    const ctx = await browser.newContext({ viewport, hasTouch: kind !== 'desktop' });
    await ctx.addInitScript(kind => {
      const legacy = kind.startsWith('legacy-');
      kind = kind.replace('legacy-', '');
      if (legacy) Object.defineProperty(navigator, 'userActivation', { value: undefined, configurable: true });
      window.__asks = 0;
      if (!window.DeviceOrientationEvent) return;
      if (kind === 'normal') DeviceOrientationEvent.requestPermission = undefined;
      if (kind === 'unsupported') window.DeviceOrientationEvent = undefined;
      else if (kind !== 'normal') DeviceOrientationEvent.requestPermission = () => {
        window.__asks++;
        if (kind.startsWith('notallowed') && window.__asks === 1) {
          const e = new DOMException('gesture needed', 'NotAllowedError');
          if (kind === 'notallowed-sync') throw e;
          return Promise.reject(e);
        }
        if (kind === 'throws') throw new Error('sensor unavailable');
        if (kind === 'rejected') return Promise.reject(new Error('denied'));
        return new Promise(resolve => setTimeout(() => resolve((kind === 'granted' || kind.startsWith('notallowed')) ? 'granted' : 'denied'), 200));
      };
    }, kind);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://**/*', r => {
      const u = r.request().url();
      if (u.startsWith('https://unpkg.com/') && process.env.LEAFLET_DIR) {
        const css = u.endsWith('.css');
        return r.fulfill({ body: fs.readFileSync(path.join(process.env.LEAFLET_DIR, css ? 'leaflet.css' : 'leaflet.js')), contentType: css ? 'text/css' : 'text/javascript' });
      }
      return r.abort();
    });
    await page.goto(url + suffix);
    await page.waitForFunction(() => window.nishioPixel && window.nishioGo && nishioGo.started && nishioPixel.roll.ready);
    return { ctx, page };
  }
  const visible = page => page.evaluate(() => ({ intro: !document.getElementById('intro').hidden, help: !document.getElementById('howto').hidden, ready: !document.getElementById('playReady').hidden, talk: !!document.querySelector('#komeTalk:not([hidden])'), asks: window.__asks }));
  const shot = (page, name) => page.screenshot({ path: path.join(out, `start-${name}.png`) });
  for (const kind of (shareOnly ? [] : ['normal', 'unsupported', 'desktop', 'granted', 'denied', 'throws', 'rejected', 'notallowed', 'notallowed-sync'])) {
    const { ctx, page } = await fresh(kind);
    try {
      await page.waitForTimeout(400);
      const before = await visible(page), permission = !['normal', 'unsupported', 'desktop'].includes(kind);
      await shot(page, kind);
      if (permission) {
        await page.click('#playReadyOk');
        await page.evaluate(() => { for (let i = 0; i < 8; i++) document.getElementById('playReadyOk').click(); });
        await page.waitForTimeout(300);
      }
      const after = await visible(page);
      if (kind.startsWith('notallowed')) {
        await page.evaluate(() => nishioPixel.meiroApi.tiltAsk(new Event('click')));
        const synthetic = await page.evaluate(() => window.__asks);
        await page.click('#pxCanvas', { position: { x: 150, y: 150 } });
        await page.waitForTimeout(300);
        const retry = await page.evaluate(() => ({ asks: window.__asks, asked: nishioPixel.meiroApi.tilt().asked }));
        checks[kind + 'Retry'] = { synthetic, ...retry, ok: synthetic === 1 && retry.asks === 2 && retry.asked };
      } else if (permission) {
        await page.click('#pxCanvas', { position: { x: 150, y: 150 } });
        const noRetry = await page.evaluate(() => ({ asks: window.__asks, retry: nishioPixel.meiroApi.tilt().retry }));
        checks[kind + 'NoRetry'] = { ...noRetry, ok: noRetry.asks === 1 && !noRetry.retry };
      }
      const fallback = ['denied', 'throws', 'rejected', 'unsupported', 'desktop'].includes(kind) ? await movementWithClear(page, false) : { ok: true };
      checks[kind + 'Controls'] = fallback;
      fs.writeFileSync(path.join(out, 'start-progress.json'), JSON.stringify(checks, null, 2));
      // 保存した 設定・進行を 読みなおしても 消さない。開始連打で ポイントも 増えない。
      const saved = await page.evaluate(() => {
        localStorage.setItem('nsg_tilt', '26');
        localStorage.setItem('nsg_start_test', 'keep');
        localStorage.setItem('nsg_state', JSON.stringify({ v: 1, points: 789, total: 789 }));
        const key = nishioGo.stateKey, data = nishioGo.state;
        data.points = 123; data.total = 456; data.welcomed = true;
        nishioGo.setGuide(data.guide); return key;
      });
      await page.reload(); await page.waitForFunction(() => window.nishioPixel && nishioGo.started);
      const revisit = await visible(page);
      if (permission) await page.click('#playReadyOk');
      const kept = await page.evaluate(() => {
        for (let i = 0; i < 10; i++) nishioGo.begin(true);
        return nishioGo.state.points === 123 && nishioGo.state.total === 456 && localStorage.getItem('nsg_tilt') === '26' && localStorage.getItem('nsg_start_test') === 'keep' && JSON.parse(localStorage.getItem('nsg_state')).points === 789;
      });
      await page.goto('about:blank'); await page.goBack(); await page.waitForFunction(() => window.nishioPixel && nishioGo.started);
      const back = await page.evaluate(key => !!localStorage.getItem(key) && nishioGo.state.points === 123 && document.getElementById('howto').hidden, saved);
      checks[kind] = { before, after, revisit, kept, back, ok: !before.intro && !before.help && !before.talk && before.ready === permission && before.asks === 0 && !after.ready && after.asks === (permission ? 1 : 0) && !revisit.help && kept && back };
    } finally { await ctx.close(); }
  }
  // UserActivation API が ない 端末でも、共有リンクの 自動openから 許可を 求めない。
  for (const link of ['1', 'daily']) for (const outcome of ['granted', 'denied', 'notallowed']) {
    const { ctx, page } = await fresh('legacy-' + outcome, { width: 390, height: 780 }, '?meiro=' + link);
    try {
      await page.waitForFunction(() => window.NISHIO_MEIRO && NISHIO_MEIRO.game && document.getElementById('meiro') && !document.getElementById('meiro').hidden);
      const automatic = await page.evaluate(() => {
        nishioPixel.meiroApi.tiltAsk();   // タイマーや 自動openからの 呼び出しと 同じ。APIへは 到達させない。
        return { calls: window.__asks, asked: nishioPixel.meiroApi.tilt().asked, legacy: navigator.userActivation === undefined };
      });
      await page.click('#meiro [data-mz="slow"]');
      await page.waitForTimeout(300);
      const first = await page.evaluate(() => ({ calls: window.__asks, asked: nishioPixel.meiroApi.tilt().asked }));
      await page.click('#meiro [data-mz="slow"]');
      await page.waitForTimeout(300);
      await page.click('#meiro [data-mz="slow"]');
      const last = await page.evaluate(() => ({ calls: window.__asks, asked: nishioPixel.meiroApi.tilt().asked }));
      await page.waitForFunction(() => NISHIO_MEIRO.game && NISHIO_MEIRO.game.board && NISHIO_MEIRO.game.cd <= 0);
      let moved = 0;
      for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
        const at = await page.evaluate(() => [NISHIO_MEIRO.game.x, NISHIO_MEIRO.game.y]);
        await page.keyboard.down(key); await page.waitForTimeout(500); await page.keyboard.up(key);
        moved = await page.evaluate(a => Math.hypot(NISHIO_MEIRO.game.x - a[0], NISHIO_MEIRO.game.y - a[1]), at);
        if (moved > 0.1) break;
      }
      checks['share-' + link + '-' + outcome] = { automatic, first, last, moved, ok: automatic.calls === 0 && !automatic.asked && automatic.legacy && first.calls === 1 && first.asked === (outcome !== 'notallowed') && last.calls === (outcome === 'notallowed' ? 2 : 1) && last.asked && moved > 0.1 };
      fs.writeFileSync(path.join(out, 'start-progress.json'), JSON.stringify(checks, null, 2));
    } finally { await ctx.close(); }
  }
  if (shareOnly) return { ...checks, errors, ok: !errors.length && Object.values(checks).every(c => c.ok) };
  const { ctx, page } = await fresh();
  try {
    checks.sensor = await page.evaluate(() => {
      const api = nishioPixel.meiroApi, tg = api.tilt(), samples = [];
      let time = 1000;
      const send = (gamma, beta = 40, ms = 16) => {
        const e = new DeviceOrientationEvent('deviceorientation', { gamma, beta });
        Object.defineProperty(e, 'timeStamp', { value: time += ms }); window.dispatchEvent(e);
      };
      for (const hz of [30, 60, 100]) {
        api.tiltReset(); send(0); send(0);
        let first = null;
        for (let i = 1; i <= Math.ceil(hz * 0.2); i++) { send(5, 40, 1000 / hz); if (first === null && tg.x > 0.4) first = i * 1000 / hz; }
        samples.push({ hz, first, force: tg.x });
        send(0.7); if (tg.x !== 0) return { ok: false, why: 'center drift', samples };
      }
      const rotations = [];
      for (const angle of [90, 180, 270, 0, -90]) {
        Object.defineProperty(screen.orientation, 'angle', { configurable: true, value: angle });
        send(0, 0); send(0, 0);
        const neutral = tg.x === 0 && tg.y === 0;
        const pair = angle === 90 ? [0, 5] : angle === 270 || angle === -90 ? [0, -5] : angle === 180 ? [-5, 0] : [5, 0];
        for (let i = 0; i < 10; i++) send(...pair);
        rotations.push({ angle, neutral, right: tg.x > 0.4, y: tg.y });
      }
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      const reset = !tg.base && tg.x === 0 && tg.y === 0;
      const e = new Event('deviceorientation'); Object.defineProperties(e, { gamma: { value: NaN }, beta: { value: null } }); window.dispatchEvent(e);
      const invalid = !tg.base;
      Object.defineProperty(screen.orientation, 'angle', { configurable: true, value: 0 });
      api.tiltReset(); send(0, 179); send(0, -179); send(0, -180);
      const seam = tg.x === 0 && tg.y === 0;
      window.dispatchEvent(new Event('blur'));
      const blur = !tg.base && tg.x === 0 && tg.y === 0;
      return { seam, blur, samples, rotations, reset, invalid, ok: samples.every(s => s.first !== null && s.first <= 67 && s.force > 0.44 && s.force <= 0.45) && rotations.every(r => r.neutral && r.right && r.y === 0) && reset && invalid && seam && blur };
    });
    checks.motion = await movementWithClear(page, true);
    const { ctx: helpCtx, page: hp } = await fresh();
    try {
    // ヘルプは 自分で 開き、とじたら 中心を 合わせなおす。読み中は 動かない。
    await hp.evaluate(() => document.getElementById('howtoOpen').click());
    const start = await hp.evaluate(() => ({ x: nishioPixel.roll.x, y: nishioPixel.roll.y }));
    await hp.keyboard.down('ArrowRight'); await hp.waitForTimeout(300); await hp.keyboard.up('ArrowRight');
    const frozen = await hp.evaluate(a => Math.hypot(nishioPixel.roll.x - a.x, nishioPixel.roll.y - a.y) < 0.01, start);
    await hp.click('#howtoOk');
    const closed = await hp.evaluate(() => document.getElementById('howto').hidden && !nishioPixel.meiroApi.tilt().base);
    checks.help = { frozen, closed, ok: frozen && closed };
    await hp.setViewportSize({ width: 667, height: 375 }); await shot(hp, 'landscape');
    const fit = await hp.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    await hp.setViewportSize({ width: 390, height: 780 }); await shot(hp, 'portrait');
    checks.layout = { fit, ok: fit };
    } finally { await helpCtx.close(); }
  } finally { await ctx.close(); }
  return { ...checks, errors, ok: !errors.length && Object.values(checks).every(c => c.ok) };
}
// 遊びの 途中の ごほうび・本の 窓を 閉じてから 測る（窓が 出た 回は 理由を 残して 取りなおす）。
async function clearOverlays(page) {
  for (let i = 0; i < 20; i++) {
    const clear = await page.evaluate(() => {
      document.querySelectorAll('.medashi:not([hidden]) .md-close, #pxInfo:not([hidden]) [data-close], [data-pick-dot]').forEach(b => b.click());
      const r = document.getElementById('reward'); if (r.classList.contains('show')) r.click();
      if (window.NISHIO_MOVIE && NISHIO_MOVIE.playing) NISHIO_MOVIE.close();
      return !nishioPixel.mapCovered(true) && !nishioPixel.sightBusy();
    });
    if (clear) return;
    await page.waitForTimeout(150);
  }
  throw new Error('measurement blocked by overlay');
}
async function movementWithClear(page, sensor) {
  const attempts = [];
  for (let i = 0; i < 3; i++) {
    await clearOverlays(page);
    const r = await checkMovement(page, sensor); attempts.push(r);
    if (!r.covered) return { ...r, attempts };
  }
  return { attempts, ok: false };
}
// 実際の rollStep を 動かす。水平な 道で 動き出し・止まり・手ぶれを 測る。
async function checkMovement(page, sensor) {
  await page.waitForFunction(() => nishioPixel.roll.x !== null && !nishioPixel.mapCovered(true));
  return page.evaluate(async sensor => {
    const P = nishioPixel, G = nishioGo, A = P.meiroApi, wait = ms => new Promise(r => setTimeout(r, ms));
    G.state.welcomed = true; G.setGuide(null); nishioKomeTalk.setOn(false); P.setHeightFn(() => 0);
    const near = P.maze.near(P.roll.x, P.roll.y), at = near ? { x: near.x, y: near.y } : P.roll;
    const send = gamma => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { gamma, beta: 40 }));
    const pos = () => ({ x: P.roll.x, y: P.roll.y });
    P.rollPut(at.x, at.y); A.tiltReset();
    const p0 = pos(); let small = null, stopped = null, noise = null, touch = null;
    if (sensor) {
      send(0); send(0);
      for (let i = 0; i < 30; i++) { send(5); await wait(33); }
      small = Math.hypot(P.roll.x - p0.x, P.roll.y - p0.y);
      send(0);
      for (let i = 0; i < 100 && P.roll.v > 0.02; i++) await wait(50);
      stopped = P.roll.v < 0.05 && A.tilt().x === 0;
      const p1 = pos();
      for (let i = 0; i < 20; i++) { send(i % 2 ? 0.7 : -0.7); await wait(33); }
      noise = Math.hypot(P.roll.x - p1.x, P.roll.y - p1.y);
    } else {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await wait(500);
      document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
      small = Math.hypot(P.roll.x - p0.x, P.roll.y - p0.y);
      P.rollPut(at.x, at.y); A.tiltReset();
      await wait(250);   // 位置を 戻した あとの カメラと 当たりの 絵を そろえる
      const cv = document.getElementById('pxCanvas');
      const busy = (x, y) => G.npcs.some(n => { const q = P.npcTile(n); return Math.abs(q.x - x) < 2 && Math.abs(q.y - y) < 2; }) || G.spots.some(s => { const q = P.toTile(s.lat, s.lng); return Math.hypot(q.x - x, q.y - y) < 3; });
      let to = null;
      for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [4, 0], [-4, 0]]) {
        const x = Math.floor(at.x) + dx, y = Math.floor(at.y) + dy;
        if (busy(x, y)) continue;
        let blocked = false;
        for (let i = 1; i <= Math.max(Math.abs(dx), Math.abs(dy)); i++) {
          const x0 = at.x + Math.sign(dx) * (i - 1), y0 = at.y + Math.sign(dy) * (i - 1);
          if (P.rollBlockedFrom(x0, y0, x0 + Math.sign(dx), y0 + Math.sign(dy))) blocked = true;
        }
        const p = P.tileToClient(x, y);
        if (!blocked && document.elementFromPoint(p.x, p.y) === cv && p.x > 40 && p.x < innerWidth - 65) { to = p; break; }
      }
      if (to) cv.dispatchEvent(new MouseEvent('click', { clientX: to.x, clientY: to.y, bubbles: true }));
      for (let i = 0; i < 30 && Math.hypot(P.roll.x - at.x, P.roll.y - at.y) < 0.3; i++) await wait(100);
      touch = Math.hypot(P.roll.x - at.x, P.roll.y - at.y);
    }
    const covered = P.mapCovered(true);
    P.setHeightFn(null); A.tiltReset();
    return { small, stopped, noise, touch, covered, blockers: [...document.querySelectorAll('#pxInfo:not([hidden]), [role=dialog]:not([hidden]), .reward.show')].map(e => e.id), ok: !covered && small > 0.15 && (sensor ? stopped && noise < 0.05 : touch > 0.3) };
  }, sensor);
}
module.exports = { runStartChecks };
if (require.main === module) (async () => {
  const out = path.resolve(process.argv[2]); fs.mkdirSync(out, { recursive: true });
  const { chromium } = require('playwright'), { startServer } = require('./bake-common');
  const server = startServer(8901), browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
  try { const r = await runStartChecks(browser, 'http://127.0.0.1:8901/nishio-go.html', out, { shareOnly: process.argv.includes('--share') }); fs.writeFileSync(path.join(out, process.argv.includes('--share') ? 'share.json' : 'start.json'), JSON.stringify(r, null, 2)); console.log(JSON.stringify(r)); process.exitCode = r.ok ? 0 : 1; }
  finally { await browser.close(); server.close(); }
})();
