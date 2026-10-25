// にしおさんぽGO：タイトルロゴの下を転がる お米のコマ（nishio-go/art/rice-logo.png）を、歩く地図と同じ「丸く見える描き方」（pixel.js の drawRice）で作る
// 32×32 が 横8 × たて2。1行め：右へ ころころ（左上からの光は そのまま、つぶだけ 1/8 回転ずつ）、2行め：1コマめ にっこり（止まって はねる）・2コマめ ふつうの笑顔
// 使い方：NODE_PATH=$(npm root -g) node tools/make-rice-logo.js （環境変数 LEAFLET_DIR は tools/playtest.js と同じ）
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { startServer } = require('./bake-common');

const PORT = 8897;
(async () => {
  const server = startServer(PORT);
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const page = await browser.newPage();
  if (process.env.LEAFLET_DIR) await page.route('https://unpkg.com/**', r => {   // ネットにつながらないとき（tools/playtest.js と同じ）
    const f = r.request().url().endsWith('.css') ? 'leaflet.css' : 'leaflet.js';
    r.fulfill({ body: fs.readFileSync(path.join(process.env.LEAFLET_DIR, f)), contentType: f.endsWith('css') ? 'text/css' : 'text/javascript' });
  });
  await page.route(/^https:\/\/(cyberjapandata\.gsi\.go\.jp|fonts\.googleapis\.com|[^/]*overpass[^/]*)\//, r => r.fulfill({ status: 504, body: '' }));   // 地図・字の読みこみは いらない
  await page.goto(`http://localhost:${PORT}/nishio-go.html`);
  await page.waitForFunction(() => window.nishioPixel && nishioPixel.roll.round, null, { timeout: 30000 });
  const url = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    const low = th => Math.sqrt((10 * Math.sin(th)) ** 2 + (13.5 * Math.cos(th)) ** 2);   // たて長のつぶ：寝ころぶと低く（game.js の introHero と同じ）。下のはしを 31 にそろえる
    for (let i = 0; i < 8; i++) nishioPixel.drawRice(x, i * 32 + 16, 31 - low(i * Math.PI / 4), i * Math.PI / 4, 0, 'smile');
    nishioPixel.drawRice(x, 16, 63 - low(0), 0, 0, 'happy');
    nishioPixel.drawRice(x, 48, 63 - low(0), 0, 0, 'smile');
    return c.toDataURL('image/png');
  });
  const out = path.join(__dirname, '..', 'nishio-go', 'art', 'rice-logo.png');
  fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', path.relative(path.join(__dirname, '..'), out));
  await browser.close(); server.close();
})();
