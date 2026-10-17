// にしおさんぽGO の広告用の動画と画像を、ほんとうのゲーム画面から作る：node tools/make-promo.js [出力フォルダ]
// ・ヘッドレス Chromium で「操作して遊ぶ」を台本どおりに進め、字幕をのせて縦長（9:16、1080×1920）の動画（webm）を録る
//   （ワークフローでは ffmpeg で mp4 にする：.github/workflows/make-promo.yml）
// ・場面ごとの静止画（9:16）と、リンク広告用の横長画像（1200×630）も作る
// ・字幕は docs/fun-core.md と ricepia.jp に書いてあることだけ。Meta・Google・LINE の広告、店頭のモニターなどに使う
// 環境変数：CHROMIUM（Chromium の場所）、LEAFLET_DIR（ネットにつながらないとき）、PROMO_PORT
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { startServer } = require('./bake-common');

const OUT = path.resolve(process.argv[2] || 'promo-out');
const PORT = Number(process.env.PROMO_PORT) || 8897, URL = `http://localhost:${PORT}/nishio-go.html`;
const VIEW = { width: 360, height: 640 };   // 9:16。動画は 1080×1920 に拡大して録る
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 字幕（画面の上に大きく）とエンドカード
async function caption(page, text, sub = '') {
  await page.evaluate(([t, s]) => {
    let el = document.getElementById('promoCap');
    if (!el) {
      el = document.createElement('div'); el.id = 'promoCap';
      el.style.cssText = 'position:fixed;left:10px;right:10px;top:64px;z-index:5000;background:rgba(0,0,0,.82);color:#fff;border:3px solid #fff;border-radius:10px;padding:10px 12px;font:bold 20px/1.4 "DotGothic16",sans-serif;text-align:center;pointer-events:none;transition:opacity .3s';
      document.body.appendChild(el);
    }
    el.innerHTML = t ? `${t}${s ? `<div style="font-size:14px;font-weight:normal;margin-top:4px;color:#ffe27a">${s}</div>` : ''}` : '';
    el.style.opacity = t ? '1' : '0';
  }, [text, sub]);
}
async function endCard(page) {
  await page.evaluate(() => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:6000;background:linear-gradient(#9fd6ff,#e8f6ff 60%,#cfae4a 60%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;font-family:"DotGothic16",sans-serif;text-align:center;padding:20px';
    el.innerHTML = `<img src="nishio-go/logo.svg" style="width:300px;height:auto" alt="">
      <div style="font-size:24px;font-weight:bold;background:#fff;border:3px solid #000;border-radius:10px;padding:12px 16px">西尾のまちを歩く<br>お散歩ゲーム</div>
      <div style="font-size:18px;background:rgba(0,0,0,.8);color:#fff;border-radius:8px;padding:8px 14px">無料・登録なしで、すぐ遊べる</div>
      <div style="font-size:30px;font-weight:bold;color:#1f5a25;background:#fff;border-radius:8px;padding:6px 14px">go.ricepia.jp</div>
      <div style="font-size:15px;background:rgba(0,0,0,.75);color:#fff;border-radius:6px;padding:6px 10px">西尾のお米屋さん 近藤米穀店・らいすぴあ</div>`;
    document.body.appendChild(el);
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = startServer(PORT);
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 3, timezoneId: 'Asia/Tokyo', locale: 'ja-JP',
    recordVideo: { dir: OUT, size: { width: 1080, height: 1920 } } });
  await ctx.addInitScript(() => { localStorage.setItem('nsg_view', 'px'); localStorage.setItem('nsg_world_on', '0'); localStorage.setItem('nsg_bgm', 'false'); localStorage.setItem('nsg_noanalytics', '1'); });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('pageerror:', e.message));
  if (process.env.LEAFLET_DIR) await page.route('https://unpkg.com/**', r => {
    const f = r.request().url().endsWith('.css') ? 'leaflet.css' : 'leaflet.js';
    r.fulfill({ body: fs.readFileSync(path.join(process.env.LEAFLET_DIR, f)), contentType: f.endsWith('css') ? 'text/css' : 'text/javascript' });
  });
  await page.route(/^https:\/\/[^/]*overpass[^/]*\//, r => r.fulfill({ status: 504, body: '' }));
  const shot = async name => { await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('  ' + name); };
  const G = (fn, arg) => page.evaluate(fn, arg);

  await page.goto(URL); await sleep(2500);
  // 1) はじめの画面
  await caption(page, '西尾のお米屋さんがつくった<br>お散歩ゲーム', 'にしおさんぽGO'); await sleep(3500);
  await shot('01-intro');
  // 2) 操作して遊ぶで、西尾城跡のあたりを歩く
  await caption(page, '');
  await page.click('#demoBtn'); await sleep(800);
  await G(() => { const s = nishioGo.spots.find(x => x.id === 'f-nishio-castle'); nishioGo.moveTo(s.lat - 0.0006, s.lng + 0.0006); });
  await sleep(2500);
  await caption(page, '西尾のまちを、ドット絵で歩こう', '十字ボタンで、家からでも西尾めぐり');
  for (const k of ['ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowUp']) { await page.keyboard.press(k); await sleep(380); }
  await sleep(1500);
  await shot('02-walk');
  // 3) 人の話で、次の行き先が決まる
  await G(() => { const n = nishioGo.npcs.find(x => x.id === 'castle-guide'); nishioGo.moveTo(n.lat, n.lng); const r = nishioGo.talkNpc(n.id, 0); document.getElementById('pxInfoBody').innerHTML = r.html; document.getElementById('pxInfo').hidden = false; });
  await caption(page, '🧭 行き先は、自分では決めない', '西尾の人の話が、次に行く所を教えてくれる'); await sleep(3500);
  await G(() => { let h = ''; for (let i = 1; i < 8; i++) { const r = nishioGo.talkNpc('castle-guide', i); if (r.html === h) break; h = r.html; } document.getElementById('pxInfoBody').innerHTML = h; });
  await sleep(3000);
  await shot('03-talk');
  await G(() => { document.getElementById('pxInfo').hidden = true; });
  // 4) 季節と天気
  await G(() => { const k = document.getElementById('koyomi'); if (k && !k.hidden) k.classList.add('open'); });
  await caption(page, '季節や天気で、まちのようすが変わる', '田んぼの色も、月ごとに'); await sleep(3500);
  await G(() => { const k = document.getElementById('koyomi'); if (k) k.classList.remove('open'); });
  // 5) 田んぼで籾を集める
  const run = await G(async () => {
    const P = nishioPixel, C = P.C, s = nishioGo.spots.find(x => x.id === 'f-ricepia'); nishioGo.moveTo(s.lat, s.lng);
    await new Promise(r => setTimeout(r, 2500));
    const q = P.toTile(s.lat, s.lng), x0 = Math.floor(q.x), y0 = Math.floor(q.y), farm = (x, y) => [C.U, C.F].includes(P.codeAt(x, y));
    for (let r = 0; r < 120; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if ([0, 1, 2, 3, 4, 5, 6, 7].every(k => farm(x0 + dx + k, y0 + dy))) return [x0 + dx, y0 + dy];
    }
    return null;
  });
  if (run) {
    await G(([x, y]) => { const ll = nishioPixel.toLatLng(x - 0.5, y + 0.5); nishioGo.moveTo(ll.lat, ll.lng, 'tap'); }, run);
    await sleep(1200);
    await caption(page, '🌾 田んぼを歩いて、籾を集める', '新米の季節は、たくさん集まる');
    for (let k = 0; k < 7; k++) { await page.keyboard.press('ArrowRight'); await sleep(420); }
    await sleep(1200);
    await shot('04-field');
  }
  // 6) 当店で選別して精米
  const mk = await G(() => { const s = nishioGo.spots.find(x => x.id === 'f-ricepia'); nishioGo.moveTo(s.lat, s.lng); const r = nishioGo.rice; r.momi = Math.max(r.momi, 12); nishioGo.openMekiki(s); return { open: !document.getElementById('mekiki').hidden, toast: document.getElementById('toast').textContent }; });
  console.log('  選別の画面:', JSON.stringify(mk));
  await caption(page, '🍚 お米屋さんの仕事も、体験', '悪い粒を見つけて取りのぞき、精米して米袋へ'); await sleep(2500);
  await page.click('[data-mk="start"]').catch(() => {});
  await sleep(600);
  for (let i = 0; i < 8; i++) { await page.click('.mk-grid .grain.kame:not(.gone), .mk-grid .grain.ao:not(.gone), .mk-grid .grain.wari:not(.gone)', { timeout: 800 }).catch(() => {}); await sleep(350); }
  await sleep(1500);
  await shot('05-mekiki');
  await G(() => { document.getElementById('mekiki').hidden = true; });
  // 7) せかいちず
  await G(() => nishioPixel.setWorld(true)); await sleep(800);
  for (let i = 0; i < 2; i++) { await page.click('#pxZoomOut').catch(() => {}); await sleep(300); }
  await caption(page, '西尾市と、となりの市町をめぐろう', '岡崎・安城・碧南・高浜・幸田・蒲郡'); await sleep(3500);
  await shot('06-world');
  // 8) エンドカード
  await caption(page, '');
  await endCard(page); await sleep(3500);
  await shot('07-end');
  const video = page.video();
  await ctx.close();
  if (video) { const p = await video.path(); fs.renameSync(p, path.join(OUT, 'nishio-go-9x16.webm')); console.log('  nishio-go-9x16.webm'); }

  // リンク広告用の横長画像（1200×630）
  const c2 = await browser.newContext({ viewport: { width: 1200, height: 630 } });
  const p2 = await c2.newPage();
  await p2.setContent(`<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DotGothic16&display=swap"></head>
    <body style="margin:0;width:1200px;height:630px;font-family:'DotGothic16',sans-serif;background:linear-gradient(#9fd6ff,#e8f6ff 62%,#cfae4a 62%);position:relative;overflow:hidden">
    <img src="http://localhost:${PORT}/nishio-go/logo.svg" style="position:absolute;left:48px;top:40px;width:544px">
    <img src="data:image/png;base64,${fs.readFileSync(path.join(OUT, '02-walk.png')).toString('base64')}" style="position:absolute;right:60px;top:30px;height:570px;border:6px solid #000;border-radius:16px">
    <div style="position:absolute;left:48px;top:170px;font-size:56px;font-weight:bold;line-height:1.35;text-shadow:0 0 8px #fff">西尾のまちを歩く<br>お散歩ゲーム</div>
    <div style="position:absolute;left:48px;top:350px;font-size:28px;background:rgba(0,0,0,.8);color:#fff;border-radius:10px;padding:10px 16px">行き先は、西尾の人の話で決まる</div>
    <div style="position:absolute;left:48px;top:430px;font-size:28px;background:rgba(0,0,0,.8);color:#fff;border-radius:10px;padding:10px 16px">無料・登録なし ／ go.ricepia.jp</div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:56px;background:rgba(0,0,0,.8);color:#fff;font-size:24px;line-height:56px;padding-left:48px">西尾のお米屋さん 近藤米穀店・らいすぴあ</div></body></html>`, { waitUntil: 'networkidle' }).catch(() => {});
  await sleep(800);
  await p2.screenshot({ path: path.join(OUT, 'link-1200x630.png') }); console.log('  link-1200x630.png');
  await c2.close();
  await browser.close(); srv.close();
  console.log('できました:', OUT);
})().catch(e => { console.error(e); process.exit(1); });
