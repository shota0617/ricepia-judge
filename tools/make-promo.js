// にしおさんぽGO の広告用の動画と画像を、ほんとうのゲーム画面から作る：node tools/make-promo.js [出力フォルダ]
// ・ヘッドレス Chromium で「操作して遊ぶ」を台本どおりに進め、字幕をのせて縦長（9:16、1080×1920）の動画（webm）を録る
//   （ワークフローでは ffmpeg で mp4 にする：.github/workflows/make-promo.yml）
// ・場面ごとの静止画（9:16）と、広告用の画像（Google・Meta・LINEヤフー広告の各サイズ）、LINE リッチメニューのマスも作る
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

  // 広告用の画像（各サイズ）と、LINE リッチメニューのマス（docs/ads-game-kit.md）
  const shotB64 = n => fs.readFileSync(path.join(OUT, n)).toString('base64');
  const logoUrl = `http://localhost:${PORT}/nishio-go/logo.svg`;
  const FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DotGothic16&display=swap">';
  const BG = 'linear-gradient(#9fd6ff,#e8f6ff 62%,#cfae4a 62%)';
  const phone = (n, h) => `<img src="data:image/png;base64,${shotB64(n)}" style="height:${h}px;border:${Math.max(4, h / 95)}px solid #000;border-radius:${h / 36}px;display:block">`;
  const pill = (t, fs) => `<div style="font-size:${fs}px;background:rgba(0,0,0,.8);color:#fff;border-radius:${fs / 2.8}px;padding:${fs / 3}px ${fs / 1.8}px;display:inline-block">${t}</div>`;
  const foot = (fs, h) => `<div style="position:absolute;left:0;right:0;bottom:0;height:${h}px;background:rgba(0,0,0,.8);color:#fff;font-size:${fs}px;line-height:${h}px;text-align:center">西尾のお米屋さん 近藤米穀店・らいすぴあ</div>`;
  function layout(w, h) {
    if (w / h > 1.4) {   // 横長：左に文、右にゲーム画面
      const ph = Math.round(h * 0.9), fs = Math.round(h / 11);
      return `<img src="${logoUrl}" style="position:absolute;left:${w * 0.04}px;top:${h * 0.06}px;width:${w * 0.45}px">
        <div style="position:absolute;left:${w * 0.04}px;top:${h * 0.27}px;font-size:${fs}px;font-weight:bold;line-height:1.35;text-shadow:0 0 8px #fff">西尾のまちを歩く<br>お散歩ゲーム</div>
        <div style="position:absolute;left:${w * 0.04}px;top:${h * 0.56}px">${pill('行き先は、西尾の人の話で決まる', Math.round(fs / 2))}</div>
        <div style="position:absolute;left:${w * 0.04}px;top:${h * 0.69}px">${pill('無料・登録なし ／ go.ricepia.jp', Math.round(fs / 2))}</div>
        <div style="position:absolute;right:${w * 0.05}px;top:${h * 0.05}px">${phone('02-walk.png', ph)}</div>${foot(Math.round(fs / 2.3), Math.round(h * 0.09))}`;
    }
    // 正方形・縦長：上から ロゴ → 見出し → 2つの札 → ゲーム画面（縦長は1台、正方形は2台）。位置は横幅から順に積む
    const fs = Math.round(w / 14), logoTop = h * 0.035, headTop = logoTop + w * 0.13, pill1 = headTop + w * 0.21, pill2 = pill1 + w * 0.075;
    const phoneTop = pill2 + w * 0.085, ph = Math.round(h * 0.9 - phoneTop);
    return `<div style="position:absolute;left:0;right:0;top:${logoTop}px;text-align:center"><img src="${logoUrl}" style="width:${w * 0.7}px"></div>
      <div style="position:absolute;left:0;right:0;top:${headTop}px;text-align:center;font-size:${fs}px;font-weight:bold;line-height:1.3;text-shadow:0 0 8px #fff">西尾のまちを歩く<br>お散歩ゲーム</div>
      <div style="position:absolute;left:0;right:0;top:${pill1}px;text-align:center">${pill('行き先は、西尾の人の話で決まる', Math.round(fs / 2.3))}</div>
      <div style="position:absolute;left:0;right:0;top:${pill2}px;text-align:center">${pill('無料・登録なし ／ go.ricepia.jp', Math.round(fs / 2.3))}</div>
      <div style="position:absolute;left:0;right:0;top:${phoneTop}px;display:flex;justify-content:center;gap:${w * 0.03}px">${phone('03-talk.png', ph)}${h / w > 1.1 ? '' : phone('04-field.png', ph)}</div>${foot(Math.round(fs / 2.4), Math.round(h * 0.075))}`;
  }
  // LINE リッチメニューの1マス（ドライブスルーの代わり）。小さくても読めるように、ロゴと大きな文字だけ
  function tile(w, h) {
    const fs = Math.round(Math.min(h / 7.5, w * 0.8 / 9.6));   // 「西尾をあるくゲーム」9文字が1行に入る大きさ
    return `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${h * 0.05}px">
      <img src="${logoUrl}" style="width:${w * 0.86}px">
      <div style="font-size:${fs}px;font-weight:bold;white-space:nowrap;background:#fff;border:${h / 120}px solid #000;border-radius:${h / 30}px;padding:${h / 60}px ${w / 30}px">西尾をあるくゲーム</div>
      <div style="font-size:${Math.round(fs * 0.8)}px;background:#1f5a25;color:#fff;border-radius:${h / 30}px;padding:${h / 80}px ${h / 22}px">▶ あそぶ（無料）</div></div>`;
  }
  const make = async (name, w, h, html) => {
    const c2 = await browser.newContext({ viewport: { width: w, height: h } });
    const p2 = await c2.newPage();
    await p2.setContent(`<html><head>${FONT}</head><body style="margin:0;width:${w}px;height:${h}px;font-family:'DotGothic16',sans-serif;background:${BG};position:relative;overflow:hidden">${html}</body></html>`, { waitUntil: 'networkidle' }).catch(() => {});
    await sleep(500);
    await p2.screenshot({ path: path.join(OUT, name) }); console.log('  ' + name);
    await c2.close();
  };
  // Google（P-MAX・ディスプレイ）・Meta・LINEヤフー広告で使う大きさ
  for (const [w, h] of [[1200, 630], [1200, 628], [1200, 1200], [1080, 1080], [960, 1200], [1080, 1350], [1080, 1920], [600, 400]]) await make(`ad-${w}x${h}.png`, w, h, layout(w, h));
  if (fs.existsSync(path.join(OUT, 'ad-1200x630.png'))) fs.copyFileSync(path.join(OUT, 'ad-1200x630.png'), path.join(OUT, 'link-1200x630.png'));
  // LINE リッチメニューのマス：大（2500×1686）の6分割・小（2500×843）の3分割は 833×843、大の4分割は 1250×843、2分割は 1250×1686
  for (const [w, h] of [[833, 843], [1250, 843], [1250, 1686]]) await make(`richmenu-tile-${w}x${h}.png`, w, h, tile(w, h));
  await browser.close(); srv.close();
  console.log('できました:', OUT);
})().catch(e => { console.error(e); process.exit(1); });
