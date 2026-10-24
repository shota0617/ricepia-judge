// にしおさんぽGO の「西尾市版（提案用デモ）」の画面写真を、ほんとうのゲーム画面から撮る：node tools/make-city-shots.js
// ・西尾市の担当者むけの 提案ページ（nishio-go/city.html）に のせる。nishio-go/shots/city-*.webp（540×1080）に書く
// ・?ed=city で開くので、上に「🏛 西尾市版（提案用デモ）」の札が写り、当店の要素は出ない
// 環境変数：CHROMIUM（Chromium の場所）、LEAFLET_DIR（ネットにつながらないとき）、CITY_PORT
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { startServer, ROOT } = require('./bake-common');

const OUT = path.join(ROOT, 'nishio-go', 'shots');
const PORT = Number(process.env.CITY_PORT) || 8899, URL = `http://localhost:${PORT}/nishio-go.html?ed=city`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = startServer(PORT);
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 360, height: 720 }, deviceScaleFactor: 1.5, timezoneId: 'Asia/Tokyo', locale: 'ja-JP' });
  await ctx.addInitScript(() => { localStorage.setItem('nsg_view', 'px'); localStorage.setItem('nsg_auto', 'false'); localStorage.setItem('nsg_world_on', '0'); localStorage.setItem('nsg_bgm', 'false'); localStorage.setItem('nsg_noanalytics', '1'); localStorage.setItem('nsg_howto', '1'); });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('pageerror:', e.message));
  if (process.env.LEAFLET_DIR) await page.route('https://unpkg.com/**', r => {
    const f = r.request().url().endsWith('.css') ? 'leaflet.css' : 'leaflet.js';
    r.fulfill({ body: fs.readFileSync(path.join(process.env.LEAFLET_DIR, f)), contentType: f.endsWith('css') ? 'text/css' : 'text/javascript' });
  });
  await page.route(/^https:\/\/[^/]*overpass[^/]*\//, r => r.fulfill({ status: 504, body: '' }));
  const G = (fn, arg) => page.evaluate(fn, arg);
  const closeAll = () => G(() => {   // ごほうび・名所の 窓・ムービー・「どうだった？」を とじる（make-promo.js と 同じ）
    const rw = document.getElementById('reward'); if (rw && rw.classList.contains('show')) rw.click();
    const pi = document.getElementById('pxInfo'); if (pi && !pi.hidden) { const c = pi.querySelector('[data-close]'); if (c) c.click(); else pi.hidden = true; }
    document.querySelectorAll('.movie button, [data-mv="close"]').forEach(b => { if (b.getClientRects().length && /とじる|閉じる|✕|×/.test(b.textContent)) b.click(); });
    const rb = document.getElementById('reactBar'); if (rb) rb.hidden = true;
  });
  // PNG で撮って、ページの canvas で WebP に（ffmpeg などが なくても 作れる）
  const shot = async name => {
    const png = (await page.screenshot()).toString('base64');
    const webp = await page.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/webp', 0.82).split(',')[1];
    }, png);
    fs.writeFileSync(path.join(OUT, `city-${name}.webp`), Buffer.from(webp, 'base64'));
    console.log(`  shots/city-${name}.webp`);
  };

  await page.goto(URL); await sleep(2500);
  if (!(await G(() => window.NSG_EDITION && NSG_EDITION.id === 'city'))) throw new Error('西尾市版で 開けませんでした');
  await page.click('#meiroBtn'); await sleep(800);
  // 1) 西尾の地図ぜんぶが めいろ（西尾城跡の そば）
  await G(() => { const s = nishioGo.spots.find(x => x.id === 'f-nishio-castle'); nishioGo.moveTo(s.lat - 0.0006, s.lng + 0.0006); });
  await sleep(2500);
  for (const [k, ms] of [['ArrowLeft', 700], ['ArrowUp', 900], ['ArrowRight', 500], ['ArrowUp', 700]]) { await closeAll(); await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); await sleep(250); }
  await sleep(400); await closeAll(); await sleep(300);
  await shot('meiro');
  // 2) 市役所の 観光担当の 職員さん（西尾市版だけの 人。合併の 話）
  await G(() => { const n = nishioGo.npcs.find(x => x.id === 'city-staff'); nishioGo.moveTo(n.lat, n.lng); const r = nishioGo.talkNpc(n.id, 1); document.getElementById('pxInfoBody').innerHTML = r.html; document.getElementById('pxInfo').hidden = false; });
  await sleep(2500);
  await shot('talk');
  await G(() => { document.getElementById('pxInfo').hidden = true; });
  // 3) 名所で チェックイン → 「🏁 ゴール！」
  await G(() => { const s = nishioGo.spots.find(x => x.id === 'f-nishio-castle'); nishioGo.moveTo(s.lat, s.lng); });
  await sleep(1500);
  await page.click('#spinBtn').catch(() => {});
  await sleep(3200);
  for (let i = 0; i < 8; i++) { await closeAll(); await sleep(250); }
  await G(() => nishioPixel.maze && nishioPixel.maze.goalFx && nishioPixel.maze.goalFx('🏁 ゴール！'));
  await sleep(800); await closeAll(); await sleep(1000);
  await shot('goal');
  // 4) せかいちず（西尾市と となりの市町）
  for (let i = 0; i < 3; i++) { await closeAll(); await sleep(300); }
  await G(() => nishioPixel.setWorld(true)); await sleep(2500);
  await shot('world');
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
