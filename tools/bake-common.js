// にしおさんぽGO の地図を前もって作るスクリプト（bake-world.js / bake-chunks.js）で共通に使うもの：
// リポジトリを配る小さなWebサーバーと、Overpass への問い合わせを Node から複数のサーバーへ送る仕組み
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
function startServer(PORT) {
  return http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(p, (e, d) => {
      if (e) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': (TYPES[path.extname(p)] || 'application/octet-stream') + '; charset=utf-8' }); res.end(d);
    });
  }).listen(PORT);
}

// Overpass への問い合わせは、ブラウザからではなく Node から送る（CORS を気にせず、いくつものサーバーを順に試せる）
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];
let nextServer = 0;
async function overpassFromNode(body) {
  let last = '';
  for (let k = 0; k < OVERPASS.length; k++) {
    const url = OVERPASS[(nextServer + k) % OVERPASS.length], t0 = Date.now();
    try {
      const res = await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'nishio-go-bake (github.com/shota0617/ricepia-judge)' }, signal: AbortSignal.timeout(240000) });
      const text = await res.text();
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = JSON.parse(text);
      if (json.remark && /error|runtime/i.test(json.remark)) throw new Error(json.remark.slice(0, 120));
      console.log(`    ${new URL(url).host}: ${(json.elements || []).length} 件 ${Math.round((Date.now() - t0) / 1000)}s`);
      nextServer = (nextServer + k) % OVERPASS.length;   // うまくいったサーバーを次も先に使う
      return text;
    } catch (e) {
      last = `${new URL(url).host}: ${e.message}`;
      console.log(`    ${last} (${Math.round((Date.now() - t0) / 1000)}s)`);
    }
  }
  throw new Error(last);
}


// ブラウザの Overpass への問い合わせを横取りして Node から送る。ゲームと同じ pixel.js を NSG_BAKE で動かすページを開く
async function openBakePage(browser, PORT) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  await ctx.route(/\/api\/interpreter/, async route => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8' };
    try { await route.fulfill({ status: 200, headers: cors, body: await overpassFromNode(route.request().postData() || '') }); }
    catch (e) { await route.fulfill({ status: 504, headers: cors, body: JSON.stringify({ error: e.message }) }); }
  });
  await ctx.addInitScript(() => { window.NSG_BAKE = true; localStorage.setItem('nsg_view', 'map'); localStorage.setItem('nsg_started', 'true'); });
  const page = await ctx.newPage();
  page.on('console', m => { const t = m.text(); if (t.startsWith('[bake]')) console.log('  ' + t.slice(0, 200)); });
  page.on('pageerror', e => console.log('  pageerror:', e.message));
  await page.goto(`http://localhost:${PORT}/nishio-go.html`);
  await page.waitForFunction(() => window.nishioPixel, null, { timeout: 60000 });
  return { ctx, page };
}

module.exports = { ROOT, startServer, overpassFromNode, openBakePage };
