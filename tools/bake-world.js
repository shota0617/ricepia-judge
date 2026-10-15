// にしおさんぽGO：せかいちず（西尾市全体のドット絵マップ）を、実際の地図データから作って nishio-go/world.json に保存する。
// GitHub Actions（.github/workflows/bake-world.yml）で動かす。ゲームと同じ pixel.js をヘッドレスのブラウザで動かし、
// OpenStreetMap（Overpass API）と国土地理院の標高タイルから、田んぼ・茶畑・工場・公園なども入れた細かい地図を作る。
//   使い方: npm install --no-save playwright && npx playwright install chromium && node tools/bake-world.js
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'nishio-go', 'world.json'), PORT = 8799;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': (TYPES[path.extname(p)] || 'application/octet-stream') + '; charset=utf-8' }); res.end(d);
  });
}).listen(PORT);

async function bakeOnce(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  await ctx.addInitScript(() => { window.NSG_BAKE = true; localStorage.setItem('nsg_view', 'map'); localStorage.setItem('nsg_started', 'true'); });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('  console:', m.text().slice(0, 200)); });
  page.on('pageerror', e => console.log('  pageerror:', e.message));
  await page.goto(`http://localhost:${PORT}/nishio-go.html`);
  await page.waitForFunction(() => window.nishioPixel, null, { timeout: 60000 });
  const t0 = Date.now();
  page.evaluate(() => nishioPixel.buildWorld(true));
  let last = '';
  for (;;) {
    await page.waitForTimeout(3000);
    const st = await page.evaluate(() => nishioPixel.worldState);
    if (st !== last) { console.log(`  ${Math.round((Date.now() - t0) / 1000)}s: ${st}`); last = st; }
    if (st === 'ok' || st === 'fail') break;
    if (Date.now() - t0 > 35 * 60000) throw new Error('時間切れ');
  }
  const saved = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('nsg_world5')); } catch (e) { return null; } });
  const C = await page.evaluate(() => nishioPixel.C);
  await ctx.close();
  if (!saved || !saved.d) throw new Error('地図ができなかった');
  if (saved.days !== 30) throw new Error('一部の地図データが取れなかった（days=' + saved.days + '）');
  return { saved, C };
}

(async () => {
  const browser = await chromium.launch();
  let res, err;
  for (let i = 1; i <= 3 && !res; i++) {
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
  if (roads < 2000 || (hist.T || 0) < 2000 || (hist.A || 0) < 5000 || saved.l.length < 10) { console.error('地図データが少なすぎるので保存しない'); process.exit(1); }
  const out = { v: 1, baked: new Date().toISOString(), src: 'OpenStreetMap contributors (ODbL) / 国土地理院 標高タイル', w: saved.w, h: saved.h, d: saved.d, p: saved.p, l: saved.l };
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('保存しました:', path.relative(ROOT, OUT), fs.statSync(OUT).size, 'bytes');
})();
