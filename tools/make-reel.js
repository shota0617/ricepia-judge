// にしおさんぽGO のデモプレイ動画（インスタのリール・TikTok・YouTube ショート用）を、ほんとうのゲーム画面から作る
//   node tools/make-reel.js [出力フォルダ]  → nishio-go-reel.mp4（1080×1920・9:16・約40秒・H.264／AAC。音はゲームの BGM）
// ・ヘッドレス Chromium で「🌀 傾けて めいろ」を台本どおりに進めて録画し（矢印キーは 傾けたのと 同じ）（tools/record-page.js：画面を2倍の解像度で撮りつづける）、
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

async function caption(page, text, sub = '', at = 'top') {
  await page.evaluate(([t, s, at]) => {
    let el = document.getElementById('reelCap');
    if (!el) {
      el = document.createElement('div'); el.id = 'reelCap';
      el.style.cssText = 'position:fixed;left:16px;right:40px;top:78px;z-index:5000;background:rgba(0,0,0,.84);color:#fff;border:3px solid #fff;border-radius:10px;padding:9px 10px;font:bold 19px/1.35 "DotGothic16",sans-serif;text-align:center;pointer-events:none;transition:opacity .25s';
      document.body.appendChild(el);
    }
    el.innerHTML = t ? `${t}${s ? `<div style="font-size:13px;font-weight:normal;margin-top:4px;color:#ffe27a">${s}</div>` : ''}` : '';
    el.style.top = at === 'mid' ? '60%' : '78px';   // はじめの画面は ロゴと ボタンが 上に あるので 下寄り（下の2割は リールの 説明文が 重なるので あける）
    el.style.zIndex = '99999';   // はじめの画面の 上にも
    el.style.opacity = t ? '1' : '0';
  }, [text, sub, at]);
}
async function endCard(page) {
  await page.evaluate(() => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:6000;background:linear-gradient(#9fd6ff,#e8f6ff 58%,#86b54c 58%);display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:120px;gap:16px;font-family:"DotGothic16",sans-serif;text-align:center';
    el.innerHTML = `<img src="nishio-go/logo.svg" style="width:290px;height:auto" alt="">
      <div style="font-size:23px;font-weight:bold;background:#fff;border:3px solid #000;border-radius:10px;padding:10px 14px">スマホを傾けて<br>お米を転がす 西尾の めいろ</div>
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
  const roll = async seq => { for (const [k, ms] of seq) { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); await sleep(200); } };
  const closeAll = () => G(() => {   // ごほうび・名所の 窓・ムービー・「どうだった？」を とじる
    const rw = document.getElementById('reward'); if (rw && rw.classList.contains('show')) rw.click();   // ゲームと 同じ とじかた（つぎの 窓へ すすむ）
    const pi = document.getElementById('pxInfo'); if (pi && !pi.hidden) { const c = pi.querySelector('[data-close]'); if (c) c.click(); else pi.hidden = true; }
    document.querySelectorAll('.movie button, [data-mv="close"]').forEach(b => { if (b.getClientRects().length && /とじる|閉じる|✕|×/.test(b.textContent)) b.click(); });
    const rb = document.getElementById('reactBar'); if (rb) rb.hidden = true;
  });
  // 1) はじめの画面（お米が 台地の坂を ころころ転がり下りる）
  await caption(page, 'スマホを傾けて<br>お米を転がす', 'にしおさんぽGO', 'mid'); await sleep(2800); mark('intro');
  await caption(page, '');
  await page.click('#meiroBtn'); await sleep(600);
  // 2) 西尾の地図ぜんぶが めいろ（西尾市歴史公園＝西尾城跡のあたり）
  await G(() => { const s = nishioGo.spots.find(x => x.id === 'f-nishio-castle'); nishioGo.moveTo(s.lat - 0.0007, s.lng + 0.0004); });
  await sleep(1800);
  await caption(page, '🌀 西尾の地図ぜんぶが めいろに', '本物の道・川・田んぼで できた めいろ');
  await roll([['ArrowUp', 900], ['ArrowLeft', 600], ['ArrowUp', 800], ['ArrowRight', 700], ['ArrowUp', 600]]);
  await sleep(400); mark('maze');
  // 3) 生け垣に がさっ・表情が くるくる
  await caption(page, '😆 転がると 表情が くるくる', '生け垣に 当たると がさっ。速いと「> <」');
  await roll([['ArrowLeft', 1100], ['ArrowRight', 1100], ['ArrowDown', 900]]);
  await sleep(500); mark('feel');
  // 4) まちの人の話で、次の ゴールが 決まる
  await G(() => { const n = nishioGo.npcs.find(x => x.id === 'castle-guide'); nishioGo.moveTo(n.lat, n.lng); const r = nishioGo.talkNpc(n.id, 0); document.getElementById('pxInfoBody').innerHTML = r.html; document.getElementById('pxInfo').hidden = false; });
  await caption(page, '📜 まちの人の話で、次の ゴールが 決まる', 'ゴールは 西尾の 名所'); await sleep(2600);
  await G(() => { let h = ''; for (let i = 1; i < 8; i++) { const r = nishioGo.talkNpc('castle-guide', i); if (r.html === h) break; h = r.html; } document.getElementById('pxInfoBody').innerHTML = h; });
  await sleep(2200);
  await G(() => { document.getElementById('pxInfo').hidden = true; });
  await caption(page, '🏁 ゴールを めざして ころころ', '画面の 外の ゴールは、縁の 矢印と めいろの 道のりで');
  await roll([['ArrowDown', 700], ['ArrowRight', 800], ['ArrowDown', 600]]);
  await sleep(600); mark('goal');
  // 5) 名所に 転がりこんで チェックイン → 🏁 ゴール！
  await G(() => { const s = nishioGo.spots.find(x => x.id === 'f-ricepia'); nishioGo.moveTo(s.lat, s.lng); });
  await sleep(1400);
  await caption(page, '⭐ 名所に 転がりこんで チェックイン', 'らいすぴあ も 名所の ひとつ'); await sleep(900);
  await page.click('#spinBtn').catch(() => {});
  await sleep(3200);
  for (let i = 0; i < 8; i++) { await closeAll(); await sleep(250); }   // チェックインの あとに 名所の 窓・「どうだった？」が つづけて 出るので 何回か
  await G(() => nishioPixel.maze && nishioPixel.maze.goalFx && nishioPixel.maze.goalFx('🏁 ゴール！'));
  await caption(page, '🏁 ゴール！', 'つぎの ゴールへ ころころ'); await sleep(900); await closeAll(); await sleep(1700); mark('checkin');
  // 6) お店も 本物そっくり（主人公は 店の 左上。店は 画面の 右下の 空いた所）
  await G(() => { const s = nishioGo.spots.find(x => x.id === 'f-ricepia'); nishioGo.moveTo(s.lat + 0.00022, s.lng - 0.0003); });
  await sleep(1400);
  await caption(page, '🍚 お店も 本物そっくり', 'らいすぴあ・秀幸／近藤米穀店'); await sleep(2600); mark('shop');
  // 7) せかいちず
  for (let i = 0; i < 3; i++) { await closeAll(); await sleep(300); }
  await caption(page, '');
  await G(() => nishioPixel.setWorld(true)); await sleep(700);
  await caption(page, '西尾市と となりのまちを<br>めぐろう', '岡崎・安城・碧南・高浜・幸田・蒲郡'); await sleep(3200); mark('world');
  await G(() => nishioPixel.setWorld(false));
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
