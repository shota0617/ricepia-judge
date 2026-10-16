// にしおさんぽGO：せかいちず（西尾市全体のドット絵マップ）を、実際の地図データから作って nishio-go/world.json に保存する。
// GitHub Actions（.github/workflows/bake-world.yml）で動かす。ゲームと同じ pixel.js をヘッドレスのブラウザで動かし、
// OpenStreetMap（Overpass API）と国土地理院の標高タイルから、田んぼ・茶畑・工場・公園なども入れた細かい地図を作る。
//   使い方: npm install --no-save playwright && npx playwright install chromium && node tools/bake-world.js
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { ROOT, startServer, openBakePage } = require('./bake-common');
const OUT = path.join(ROOT, 'nishio-go', 'world.json'), PORT = 8799;
const srv = startServer(PORT);

async function bakeOnce(browser) {
  const { ctx, page } = await openBakePage(browser, PORT);
  const t0 = Date.now();
  page.evaluate(() => nishioPixel.buildWorld(true));
  let last = '';
  for (;;) {
    await page.waitForTimeout(3000);
    const st = await page.evaluate(() => nishioPixel.worldState);
    if (st !== last) { console.log(`  ${Math.round((Date.now() - t0) / 1000)}s: ${st}`); last = st; }
    if (st === 'ok' || st === 'fail') break;
    if (Date.now() - t0 > 100 * 60000) throw new Error('時間切れ');
  }
  const saved = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem(nishioPixel.WORLD_KEY)); } catch (e) { return null; } });
  const C = await page.evaluate(() => nishioPixel.C);
  await ctx.close();
  if (!saved || !saved.d) throw new Error('地図ができなかった');
  if (saved.days !== 30) throw new Error('一部の地図データが取れなかった（days=' + saved.days + '）');
  return { saved, C };
}

(async () => {
  const browser = await chromium.launch();
  let res, err;
  for (let i = 1; i <= 2 && !res; i++) {
    console.log(`作成 ${i} 回目`);
    try { res = await bakeOnce(browser); } catch (e) { err = e; console.log('  失敗:', e.message); }
  }
  await browser.close(); srv.close();
  if (!res) { console.error(err); process.exit(1); }
  const { saved, C } = res, names = Object.fromEntries(Object.entries(C).map(([k, v]) => [v, k]));
  const hist = {};
  for (const ch of saved.d) { const k = names[ch.charCodeAt(0) - 48] || '?'; hist[k] = (hist[k] || 0) + 1; }
  console.log('マス', saved.w, '×', saved.h, JSON.stringify(hist));
  console.log('地名', saved.l.length, '大きな建物', saved.p.length);
  // それらしい地図になっているか（道・川・町なみ・地名がそろっているか）
  const roads = (hist.H || 0) + (hist.R || 0);
  // （西尾は町なみ T より田畑・道が多いので、町なみの量では判定しない）
  const land = saved.w * saved.h - (hist.A || 0);
  if (roads < 2000 || (hist.A || 0) < 5000 || land < 20000 || saved.l.length < 10 || saved.p.length < 10) { console.error('地図データが少なすぎるので保存しない'); process.exit(1); }
  const out = { v: 1, baked: new Date().toISOString(), src: 'OpenStreetMap contributors (ODbL) / 国土地理院 標高タイル', w: saved.w, h: saved.h, d: saved.d, p: saved.p, l: saved.l };
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('保存しました:', path.relative(ROOT, OUT), fs.statSync(OUT).size, 'bytes');
})();
