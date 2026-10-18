// ゲームの中で地図に出るスポットの id の一覧を書き出す：node tools/dump-spot-ids.js [出力ファイル]
// ヘッドレス Chromium でゲームを開き、遊べる範囲の外・注目スポットと同じ所・すぐ近くの重複を除いたあと（game.js の buildSpots）の id を取る。
// tools/make-landmark-gen.js が、型の絵を「地図に出る名所」だけにつけるのに使う
// 環境変数：CHROMIUM=Chromium の場所（省略時は Playwright の既定）、LEAFLET_DIR=Leaflet の dist（ネットにつながらないとき）
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { ROOT, startServer } = require('./bake-common');

const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'reference/spot-ids.json'));
const PORT = Number(process.env.PLAYTEST_PORT) || 8898;
(async () => {
  const srv = startServer(PORT);
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const page = await browser.newPage();
  if (process.env.LEAFLET_DIR) await page.route('https://unpkg.com/**', r => {
    const f = r.request().url().endsWith('.css') ? 'leaflet.css' : 'leaflet.js';
    r.fulfill({ body: fs.readFileSync(path.join(process.env.LEAFLET_DIR, f)), contentType: f.endsWith('css') ? 'text/css' : 'text/javascript' });
  });
  await page.route(/^https:\/\/(?!localhost)/, r => (r.request().url().startsWith('https://unpkg.com/') ? r.fallback() : r.fulfill({ status: 504, body: '' })));
  await page.goto(`http://localhost:${PORT}/nishio-go.html`);
  await page.waitForFunction(() => window.nishioGo && nishioGo.spots && nishioGo.spots.length > 1000, null, { timeout: 30000 });
  const ids = await page.evaluate(() => nishioGo.spots.map(s => s.id));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(ids));
  console.log(`地図に出るスポット ${ids.length}か所 → ${OUT}`);
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
