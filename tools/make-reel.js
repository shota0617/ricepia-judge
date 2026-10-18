// にしおさんぽGO のデモプレイ動画（インスタのリール・TikTok・YouTube ショート用）を、ほんとうのゲーム画面から作る
//   node tools/make-reel.js [出力フォルダ]  → nishio-go-reel.mp4（1080×1920・9:16・約40秒・H.264／AAC。音はゲームの BGM）
// ・ヘッドレス Chromium で「操作して遊ぶ」を台本どおりに進めて録画し（tools/record-page.js：画面を2倍の解像度で撮りつづける）、
//   ffmpeg で 1080×1920 の mp4 にして bgm/field.mp3 をのせる
// ・字幕はリールの画面で隠れない所（上のほう・まん中寄せ）に出す。下の2割と右はしはリールのボタンや説明文が重なるので空ける
// ・BGM は tools/make-sound.py で作ったオリジナル曲（nishio-go/bgm/README.md）なので、宣伝にそのまま使える
// 環境変数：CHROMIUM（Chromium の場所）、LEAFLET_DIR（ネットにつながらないとき）、REEL_PORT
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { startServer, ROOT } = require('./bake-common');
const { recordPage, toMp4 } = require('./record-page');

const OUT = path.resolve(process.argv[2] || 'reel-out');
const PORT = Number(process.env.REEL_PORT) || 8898, URL = `http://localhost:${PORT}/nishio-go.html`;
const VIEW = { width: 360, height: 640 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function caption(page, text, sub = '') {
  await page.evaluate(([t, s]) => {
    let el = document.getElementById('reelCap');
    if (!el) {
      el = document.createElement('div'); el.id = 'reelCap';
      el.style.cssText = 'position:fixed;left:16px;right:40px;top:78px;z-index:5000;background:rgba(0,0,0,.84);color:#fff;border:3px solid #fff;border-radius:10px;padding:9px 10px;font:bold 19px/1.35 "DotGothic16",sans-serif;text-align:center;pointer-events:none;transition:opacity .25s';
      document.body.appendChild(el);
    }
    el.innerHTML = t ? `${t}${s ? `<div style="font-size:13px;font-weight:normal;margin-top:4px;color:#ffe27a">${s}</div>` : ''}` : '';
    el.style.opacity = t ? '1' : '0';
  }, [text, sub]);
}
async function endCard(page) {
  await page.evaluate(() => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:6000;background:linear-gradient(#9fd6ff,#e8f6ff 58%,#86b54c 58%);display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:120px;gap:16px;font-family:"DotGothic16",sans-serif;text-align:center';
    el.innerHTML = `<img src="nishio-go/logo.svg" style="width:290px;height:auto" alt="">
      <div style="font-size:23px;font-weight:bold;background:#fff;border:3px solid #000;border-radius:10px;padding:10px 14px">西尾のまちを歩く<br>ドット絵のお散歩ゲーム</div>
      <div style="font-size:17px;background:rgba(0,0,0,.8);color:#fff;border-radius:8px;padding:7px 12px">無料・登録なし／スマホでそのまま</div>
      <div style="font-size:30px;font-weight:bold;color:#1f5a25;background:#fff;border-radius:8px;padding:6px 14px">go.ricepia.jp</div>`;
    document.body.appendChild(el);
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = startServer(PORT);
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 3, timezoneId: 'Asia/Tokyo', locale: 'ja-JP' });
  await ctx.addInitScript(() => { localStorage.setItem('nsg_view', 'px'); localStorage.setItem('nsg_auto', 'false'); localStorage.setItem('nsg_world_on', '0'); localStorage.setItem('nsg_bgm', 'false'); localStorage.setItem('nsg_noanalytics', '1'); });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('pageerror:', e.message));
  if (process.env.LEAFLET_DIR) await page.route('https://unpkg.com/**', r => {
    const f = r.request().url().endsWith('.css') ? 'leaflet.css' : 'leaflet.js';
    r.fulfill({ body: fs.readFileSync(path.join(process.env.LEAFLET_DIR, f)), contentType: f.endsWith('css') ? 'text/css' : 'text/javascript' });
  });
  await page.route(/^https:\/\/[^/]*overpass[^/]*\//, r => r.fulfill({ status: 504, body: '' }));
  const G = (fn, arg) => page.evaluate(fn, arg);
  const t0 = Date.now(), mark = s => console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`);

  await page.goto(URL); await sleep(1500);
  const frames = path.join(OUT, 'reel-frames');
  fs.rmSync(frames, { recursive: true, force: true });
  const stop = await recordPage(page, frames);
  // 1) はじめの画面
  await caption(page, '西尾のまちを歩く<br>ドット絵のお散歩ゲーム', 'にしおさんぽGO'); await sleep(2800); mark('intro');
  await caption(page, '');
  await page.click('#demoBtn'); await sleep(600);
  // 2) スティックで歩く（西尾市歴史公園＝西尾城跡のあたり）
  await G(() => { const s = nishioGo.spots.find(x => x.id === 'f-nishio-castle'); nishioGo.moveTo(s.lat - 0.0007, s.lng + 0.0004); });
  await sleep(1800);
  await caption(page, '本物の西尾の道・川・田んぼを<br>ドット絵で歩く', '地図は国土地理院・OpenStreetMap などのデータから');
  for (const k of ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowUp']) { await page.keyboard.press(k); await sleep(330); }
  await sleep(900); mark('walk');
  // 3) まちの人の話で、イベント発生
  await G(() => { const n = nishioGo.npcs.find(x => x.id === 'castle-guide'); nishioGo.moveTo(n.lat, n.lng); const r = nishioGo.talkNpc(n.id, 0); document.getElementById('pxInfoBody').innerHTML = r.html; document.getElementById('pxInfo').hidden = false; });
  await caption(page, '📜 まちの人の話で、イベント発生', '次に行く所を、まちの人がすすめてくれる'); await sleep(2600);
  await G(() => { let h = ''; for (let i = 1; i < 8; i++) { const r = nishioGo.talkNpc('castle-guide', i); if (r.html === h) break; h = r.html; } document.getElementById('pxInfoBody').innerHTML = h; });
  await sleep(2200);
  await G(() => { document.getElementById('pxInfo').hidden = true; }); mark('event');
  // 4) おまかせ歩き：放っておいても主人公が行き先へ歩き、歩くだけで まちメモ が集まる
  await page.click('#pxAuto'); await sleep(400);
  await caption(page, '🧭 おまかせ歩きで<br>放っておいても進む', '歩くだけで「まちメモ」が集まる。閉じている間も るすばん');
  await sleep(3500);
  await G(() => nishioGo.autoLearn());
  await sleep(3500); mark('auto');
  await page.click('#pxAuto'); await sleep(300);
  // 5) 名所でチェックイン（まちメモつき）
  await G(() => { const s = nishioGo.spots.find(x => x.id === 'f-iwase-bunko'); nishioGo.moveTo(s.lat, s.lng); });
  await sleep(1500);
  await caption(page, '⭐ 名所でチェックイン', '西尾市岩瀬文庫・西尾城跡・佐久島…'); await sleep(900);
  await page.click('#spinBtn').catch(() => {});
  await sleep(3800); mark('checkin');
  await G(() => { document.getElementById('reward').innerHTML = ''; });
  // 6) お店も本物そっくり
  // 店が字幕と案内パネルに隠れないよう、主人公は店の左上に（店は画面の右下の空いた所）
  await G(() => { const s = nishioGo.spots.find(x => x.id === 'f-ricepia'); nishioGo.moveTo(s.lat + 0.00022, s.lng - 0.0003); });
  await sleep(1600);
  await caption(page, '🍚 お店も本物そっくり', 'らいすぴあ・秀幸／近藤米穀店'); await sleep(3000); mark('shop');
  // 7) せかいちず
  await caption(page, '');
  await G(() => nishioPixel.setWorld(true)); await sleep(700);
  for (let i = 0; i < 2; i++) { await page.click('#pxZoomOut').catch(() => {}); await sleep(300); }
  await caption(page, '西尾市と となりのまちを<br>めぐろう', '岡崎・安城・碧南・高浜・幸田・蒲郡、本店から15kmのまちも'); await sleep(3400); mark('world');
  // 8) エンドカード
  await caption(page, '');
  await endCard(page); await sleep(3500); mark('end');
  const rec = await stop();
  await browser.close(); srv.close();
  const mp4 = path.join(OUT, 'nishio-go-reel.mp4');
  toMp4(rec, mp4, { audio: path.join(ROOT, 'nishio-go', 'bgm', 'field.mp3') });
  fs.rmSync(frames, { recursive: true, force: true });
  console.log(`  ${path.relative(process.cwd(), mp4)}（${rec.duration.toFixed(1)}秒）`);
})().catch(e => { console.error(e); process.exit(1); });
