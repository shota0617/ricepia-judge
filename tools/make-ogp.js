// にしおさんぽGO の共有用画像（OGP・1200×630）を作る：node tools/make-ogp.js
// ゲームをヘッドレス Chromium で開いて、せかいちずと 地図の めいろ（西尾城跡。「🌀 傾けて めいろ」で 始める）を撮り、ロゴと文字を重ねて nishio-go/ogp.png にする
// 環境変数：CHROMIUM=Chromium の場所、LEAFLET_DIR=Leaflet の dist（ネットにつながらないとき）
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { ROOT, startServer } = require('./bake-common');

const PORT = 8898, URL = `http://localhost:${PORT}/nishio-go.html`, OUT = path.join(ROOT, 'nishio-go', 'ogp.png');

(async () => {
  const server = await startServer(PORT);
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { localStorage.setItem('nsg_started', 'true'); localStorage.setItem('nsg_view', 'px'); localStorage.setItem('nsg_world_on', '1'); localStorage.setItem('nsg_mode', '"demo"'); localStorage.setItem('nsg_bgm', 'false'); });
  const page = await ctx.newPage();
  if (process.env.LEAFLET_DIR) await page.route('https://unpkg.com/**', r => {
    const f = r.request().url().endsWith('.css') ? 'leaflet.css' : 'leaflet.js';
    r.fulfill({ body: fs.readFileSync(path.join(process.env.LEAFLET_DIR, f)), contentType: f.endsWith('css') ? 'text/css' : 'text/javascript' });
  });
  await page.route(/^https:\/\/(cyberjapandata\.gsi\.go\.jp|[^/]*overpass[^/]*)\//, r => r.fulfill({ status: 504, body: '' }));
  await page.goto(URL); await page.waitForTimeout(2500);
  if (await page.isVisible('#meiroBtn')) { await page.click('#meiroBtn'); await page.waitForTimeout(1500); }   // 地図の めいろ（転がす）で 始める
  // 知らせ（トースト）と下の案内は写さない
  await page.addStyleTag({ content: '.toast,.sheet,.tabs,.bar,.fab-col,.px-zoom,.px-pad,.px-attr{display:none!important}#pxView{top:0!important;bottom:0!important}' });
  // せかいちず（西尾市のまんなかを少し寄って）
  await page.evaluate(() => { const s = nishioGo.spots.find(x => x.id === 'f-nishio-castle'); nishioGo.moveTo(s.lat, s.lng); nishioPixel.setWorld(true); });
  await page.$eval('#pxZoomIn', b => b.click()).catch(() => {}); await page.waitForTimeout(1500);   // ＋ボタンが ない ときは そのまま
  const world = await page.screenshot({ type: 'png' });
  // 地図の めいろ（西尾城跡）
  await page.evaluate(() => nishioPixel.setWorld(false)); await page.waitForTimeout(2500);
  const field = await page.screenshot({ type: 'png' });
  await ctx.close();

  const logo = fs.readFileSync(path.join(ROOT, 'nishio-go', 'logo.svg'));
  const uri = (buf, type) => `data:${type};base64,${buf.toString('base64')}`;
  const card = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await card.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0}
    body{width:1200px;height:630px;overflow:hidden;font-family:"Noto Sans CJK JP","Noto Sans JP","Hiragino Sans",sans-serif;background:#2f5d3a;position:relative}
    .bg{position:absolute;inset:0;background:url(${uri(world, 'image/png')}) center/cover;filter:saturate(1.1);opacity:.55}
    .shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(20,45,28,.96) 0%,rgba(20,45,28,.9) 52%,rgba(20,45,28,.2) 100%)}
    .left{position:absolute;left:56px;top:58px;width:640px;color:#fff}
    .logo{width:600px;image-rendering:pixelated;display:block;margin-bottom:26px}
    h1{font-size:46px;line-height:1.35;font-weight:900;letter-spacing:.02em;margin-bottom:18px}
    h1 em{font-style:normal;color:#ffd54f}
    ul{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:10px;margin-bottom:26px}
    li{background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.5);border-radius:999px;padding:6px 16px;font-size:22px;font-weight:700}
    .by{font-size:22px;color:#e8efdf}
    .by b{color:#fff}
    .phone{position:absolute;right:70px;top:40px;width:282px;height:550px;border-radius:36px;background:#111;padding:12px;box-shadow:0 18px 48px rgba(0,0,0,.45);transform:rotate(4deg)}
    .phone img{width:100%;height:100%;object-fit:cover;border-radius:26px;display:block}
    .free{position:absolute;right:300px;bottom:44px;background:#d23a2e;color:#fff;font-size:24px;font-weight:900;padding:10px 20px;border-radius:14px;transform:rotate(-4deg);box-shadow:0 8px 20px rgba(0,0,0,.35)}
  </style></head><body>
    <div class="bg"></div><div class="shade"></div>
    <div class="left">
      <img class="logo" src="${uri(logo, 'image/svg+xml')}"/>
      <h1>スマホを傾けて、<br/><em>お米を転がす</em>西尾の めいろ</h1>
      <ul><li>🌀 本物の道の めいろ</li><li>🏁 ゴールは 西尾の名所</li><li>📜 人の話で 行き先</li><li>🆓 無料・登録なし</li></ul>
      <p class="by">西尾のお米屋さん <b>らいすぴあ・近藤米穀店</b> がお届け</p>
    </div>
    <div class="phone"><img src="${uri(field, 'image/png')}"/></div>
    <div class="free">無料・スマホで</div>
  </body></html>`);
  await card.waitForTimeout(500);
  await card.screenshot({ path: OUT, type: 'png' });
  await browser.close(); server.close();
  console.log(`${path.relative(ROOT, OUT)}: ${fs.statSync(OUT).size} bytes`);
})();
