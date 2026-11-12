// 横向きで 見えた 手を 押すと、矢印の 窓では なく 指先へ 歩く（最初の 1分）。
const fs = require('fs'), path = require('path');

async function runVisibleHandCheck(browser, url, out) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const errors = [];
  try {
    const local = new URL(url).origin;
    await ctx.route('**/*', r => {
      const u = new URL(r.request().url());
      if (u.origin === local) return r.continue();
      if (u.href.startsWith('https://unpkg.com/leaflet@1.9.4/dist/')) {
        const file = path.join(process.env.LEAFLET_DIR || path.join(__dirname, '../node_modules/leaflet/dist'), u.pathname.split('/dist/')[1]);
        if (fs.existsSync(file)) return r.fulfill({ path: file });
      }
      return r.fulfill({ status: 204, body: '' });
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-11-12T22:00:00+09:00'));
    await page.goto(url);
    await page.waitForFunction(() => window.nishioPixel && nishioPixel.maze.route(), null, { timeout: 15000 });
    // 実際の 手本を 3回 押して 来た 場所。道すじ・手の 配置・アニメーションは ゲームが 決める。
    await page.evaluate(() => nishioPixel.rollPut(1807.5, 1902.5));
    await page.waitForFunction(() => {
      const P = nishioPixel, e = document.getElementById('tapDemo'), sp = P.tapDemo.spot();
      const r = e && e.getBoundingClientRect();
      return e && !e.hidden && !P.worldMode && !P.mapCovered(true) && sp && Math.abs(sp.q.x - 374) < 1 && Math.abs(sp.q.y - 70) < 1
        && r.left <= 374 && r.right >= 374 && r.top <= 103 && r.bottom >= 103;   // 計算上の 指先だけでなく、実際に 見えた 手も 待つ
    }, null, { timeout: 15000 });
    const before = await page.evaluate(() => {
      const r = document.getElementById('tapDemo').getBoundingClientRect(), P = nishioPixel;
      return { x: P.roll.x, y: P.roll.y, inside: 374 >= r.left && 374 <= r.right && 103 >= r.top && 103 <= r.bottom, tip: P.tapDemo.spot().q };
    });
    if (out) await page.screenshot({ path: path.join(out, 'visible-hand-before.png') });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 374, y: 103, id: 1 }] });
    await page.waitForTimeout(40);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(p => nishioPixel.worldMode || Math.hypot(nishioPixel.roll.x - p.x, nishioPixel.roll.y - p.y) > 0.1, before, { timeout: 5000 });
    const after = await page.evaluate(() => ({ world: nishioPixel.worldMode, x: nishioPixel.roll.x, y: nishioPixel.roll.y, covered: nishioPixel.mapCovered(true) }));
    if (out) await page.screenshot({ path: path.join(out, 'visible-hand-after.png') });
    const walked = before.inside && !after.world && !after.covered && Math.hypot(after.x - before.x, after.y - before.y) > 0.1;
    if (!walked) return { before, after, errors, ok: false };
    // この 再現位置では、手から 外れた 矢印の 絵は これまでどおり せかいちずを 開く。
    await page.waitForFunction(() => !nishioPixel.tapGoal, null, { timeout: 10000 });
    await page.evaluate(() => nishioPixel.rollPut(1807.5, 1902.5));
    await page.waitForFunction(() => {
      const e = document.getElementById('tapDemo'), s = nishioPixel.tapDemo.spot();
      const r = e && e.getBoundingClientRect();
      return e && !e.hidden && s && Math.abs(s.q.x - 374) < 1 && Math.abs(s.q.y - 70) < 1
        && r.left <= 374 && r.right >= 374 && r.top <= 103 && r.bottom >= 103;
    }, null, { timeout: 15000 });
    const outsideHand = await page.evaluate(() => document.getElementById('tapDemo').getBoundingClientRect().left > 345);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 345, y: 125, id: 1 }] });
    await page.waitForTimeout(40);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const arrowStillWorks = await page.waitForFunction(() => nishioPixel.worldMode, null, { timeout: 5000 }).then(() => true, () => false);
    return { before, after, outsideHand, arrowStillWorks, errors, ok: walked && outsideHand && arrowStillWorks && errors.length === 0 };
  } catch (e) {
    return { ok: false, errors, crashed: String(e.message || e).split('\n')[0] };
  } finally { await ctx.close(); }
}

module.exports = { runVisibleHandCheck };
