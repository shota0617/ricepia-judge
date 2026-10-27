// にしおさんぽGO の広告用の動画と画像を、ほんとうのゲーム画面から作る：node tools/make-promo.js [出力フォルダ]
// ・ヘッドレス Chromium で「操作して遊ぶ」を台本どおりに進め、字幕をのせて縦長（9:16、1080×1920）の動画（mp4。音はゲームの BGM）を録る
//   （tools/record-page.js：画面を2倍の解像度で撮りつづけて ffmpeg でつなぐ。ffmpeg が要る）
// ・場面ごとの静止画（9:16）と、広告用の画像（Google・Meta・LINEヤフー広告の各サイズ）、LINE リッチメニューのマスも作る
// ・字幕は docs/fun-core.md と ricepia.jp に書いてあることだけ。Meta・Google・LINE の広告、店頭のモニターなどに使う
// 環境変数：CHROMIUM（Chromium の場所）、LEAFLET_DIR（ネットにつながらないとき）、PROMO_PORT
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { startServer, ROOT } = require('./bake-common');
const { recordPage, toMp4 } = require('./record-page');

const OUT = path.resolve(process.argv[2] || 'promo-out');
const PORT = Number(process.env.PROMO_PORT) || 8897, URL = `http://localhost:${PORT}/nishio-go.html`;
const VIEW = { width: 360, height: 640 };   // 9:16。動画は 1080×1920 に拡大して録る
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 字幕（画面の上に大きく）とエンドカード
async function caption(page, text, sub = '', at = 'top') {
  await page.evaluate(([t, s, at]) => {
    let el = document.getElementById('promoCap');
    if (!el) {
      el = document.createElement('div'); el.id = 'promoCap';
      el.style.cssText = 'position:fixed;left:10px;right:10px;top:64px;z-index:5000;background:rgba(0,0,0,.82);color:#fff;border:3px solid #fff;border-radius:10px;padding:10px 12px;font:bold 20px/1.4 "DotGothic16",sans-serif;text-align:center;pointer-events:none;transition:opacity .3s';
      document.body.appendChild(el);
    }
    el.innerHTML = t ? `${t}${s ? `<div style="font-size:14px;font-weight:normal;margin-top:4px;color:#ffe27a">${s}</div>` : ''}` : '';
    el.style.top = at === 'bottom' ? 'auto' : '64px'; el.style.bottom = at === 'bottom' ? '24px' : 'auto';   // はじめの画面は ロゴと ボタンが 上に あるので 下に
    el.style.zIndex = '99999';   // はじめの画面の 上にも
    el.style.opacity = t ? '1' : '0';
  }, [text, sub, at]);
}
async function endCard(page) {
  await page.evaluate(() => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:6000;background:linear-gradient(#9fd6ff,#e8f6ff 60%,#cfae4a 60%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;font-family:"DotGothic16",sans-serif;text-align:center;padding:20px';
    el.innerHTML = `<img src="nishio-go/logo.svg" style="width:300px;height:auto" alt="">
      <div style="font-size:24px;font-weight:bold;background:#fff;border:3px solid #000;border-radius:10px;padding:12px 16px">スマホを傾けると<br>お米が ころころ 西尾の めいろ</div>
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
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 3, timezoneId: 'Asia/Tokyo', locale: 'ja-JP' });
  await ctx.addInitScript(() => { localStorage.setItem('nsg_view', 'px'); localStorage.setItem('nsg_auto', 'false'); localStorage.setItem('nsg_world_on', '0'); localStorage.setItem('nsg_bgm', 'false'); localStorage.setItem('nsg_howto', '1'); localStorage.setItem('nsg_noanalytics', '1');
    setInterval(() => { if (window.NISHIO_MOVIE && NISHIO_MOVIE.playing) NISHIO_MOVIE.close(); }, 150);   // 名所の ドット絵ムービーは すぐ とじる（撮る まぎわに 流れはじめて めいろの 画面を ふさいだ 2026-10-27）
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('pageerror:', e.message));
  if (process.env.LEAFLET_DIR) await page.route('https://unpkg.com/**', r => {
    const f = r.request().url().endsWith('.css') ? 'leaflet.css' : 'leaflet.js';
    r.fulfill({ body: fs.readFileSync(path.join(process.env.LEAFLET_DIR, f)), contentType: f.endsWith('css') ? 'text/css' : 'text/javascript' });
  });
  await page.route(/^https:\/\/[^/]*overpass[^/]*\//, r => r.fulfill({ status: 504, body: '' }));
  // 静止画は 録るのを 休んで いる あいだに 撮る（録りながら 撮ると、画面が 2×2 に ならんで 写る ことがある）
  let recorder = null;
  const shot = async name => { if (recorder) await recorder.pause(); await page.screenshot({ path: path.join(OUT, name + '.png') }); if (recorder) recorder.resume(); console.log('  ' + name); };
  const closeAll = () => G(() => {   // ごほうび・名所の 窓・ムービー・「どうだった？」を とじる
    const rw = document.getElementById('reward'); if (rw && rw.classList.contains('show')) rw.click();   // ゲームと 同じ とじかた（つぎの 窓へ すすむ）
    const pi = document.getElementById('pxInfo'); if (pi && !pi.hidden) { const c = pi.querySelector('[data-close]'); if (c) c.click(); else pi.hidden = true; }
    document.querySelectorAll('.movie button, [data-mv="close"]').forEach(b => { if (b.getClientRects().length && /とじる|閉じる|✕|×/.test(b.textContent)) b.click(); });
    const rb = document.getElementById('reactBar'); if (rb) rb.hidden = true;
  });
  const G = (fn, arg) => page.evaluate(fn, arg);

  await page.goto(URL); await sleep(2500);
  const frames = path.join(OUT, 'promo-frames');
  fs.rmSync(frames, { recursive: true, force: true });
  const stop = recorder = await recordPage(page, frames);
  // 1) はじめの画面（お米が 台地の坂を ころころ転がり下りる アニメーション）
  await caption(page, 'スマホを傾けると<br>お米が ころころ', '西尾のお米屋さんがつくったゲーム', 'bottom'); await sleep(3500);
  await shot('01-intro');
  // 2) 「🌀 傾けて めいろ」：西尾の地図ぜんぶが、本物の道で できた めいろ（西尾城跡のあたり）。矢印キーは 傾けたのと 同じ
  await caption(page, '');
  await page.click('#meiroBtn'); await sleep(800);
  await G(() => { const s = nishioGo.spots.find(x => x.id === 'f-nishio-castle'); nishioGo.moveTo(s.lat - 0.0006, s.lng + 0.0006); });
  await sleep(2500);
  await caption(page, '🌀 西尾の地図ぜんぶが めいろに', '本物の道で できた めいろを、傾けて ころころ');
  const roll = await G(() => !!(window.nishioPixel && nishioPixel.roll && nishioPixel.roll.on));
  // 転がす まえと 撮る まえに、まちの人の 呼びとめ（会話の 窓）を とじる（窓が 開いている 間は お米が 止まる・画面を ふさぐ）
  for (const [k, ms] of [['ArrowLeft', 700], ['ArrowUp', 900], ['ArrowRight', 500], ['ArrowUp', 700], ['ArrowLeft', 800]]) { await closeAll(); await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); await sleep(250); }
  if (!roll) console.log('  （転がす が オフ のまま でした）');
  await sleep(400); await closeAll(); await sleep(300);
  await shot('02-maze');
  // 3) 人の話で、次の ゴール（行き先の 名所）が 決まる
  await G(() => { const n = nishioGo.npcs.find(x => x.id === 'castle-guide'); nishioGo.moveTo(n.lat, n.lng); const r = nishioGo.talkNpc(n.id, 0); document.getElementById('pxInfoBody').innerHTML = r.html; document.getElementById('pxInfo').hidden = false; });
  await caption(page, '📜 まちの人の話で、次の ゴールが 決まる', '話の さいごに、行き先の 名所を すすめてくれる'); await sleep(3500);
  await G(() => { let h = ''; for (let i = 1; i < 8; i++) { const r = nishioGo.talkNpc('castle-guide', i); if (r.html === h) break; h = r.html; } document.getElementById('pxInfoBody').innerHTML = h; });
  await sleep(3000);
  await shot('03-talk');
  await G(() => { document.getElementById('pxInfo').hidden = true; });
  // 4) ゴールは 西尾の 名所（地図に 🏁。画面の 外なら 縁に 矢印と めいろの 道のり）
  await caption(page, '🏁 ゴールは 西尾の 名所', '西尾城跡・岩瀬文庫・佐久島…らいすぴあ も'); await sleep(1200);
  for (const [k, ms] of [['ArrowDown', 600], ['ArrowRight', 700], ['ArrowDown', 500]]) { await closeAll(); await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); await sleep(200); }
  await sleep(1200); await closeAll(); await sleep(300);
  await shot('04-goal');
  // 5) 名所に 転がりこんで チェックイン → 「🏁 ゴール！」と 紙ふぶき
  await G(() => { const s = nishioGo.spots.find(x => x.id === 'f-ricepia'); nishioGo.moveTo(s.lat, s.lng); });
  await sleep(1500);
  await caption(page, '⭐ 名所に 転がりこんで チェックイン', 'まちメモ・たからばこ・ドット絵が あつまる'); await sleep(800);
  await page.click('#spinBtn').catch(() => {});
  await sleep(3200);
  for (let i = 0; i < 8; i++) { await closeAll(); await sleep(250); }   // チェックインの あとに 名所の 窓・「どうだった？」が つづけて 出るので 何回か
  await G(() => nishioPixel.maze && nishioPixel.maze.goalFx && nishioPixel.maze.goalFx('🏁 ゴール！'));
  await sleep(800); await closeAll(); await sleep(1000);
  await shot('05-checkin');
  // 6) せかいちず
  for (let i = 0; i < 3; i++) { await closeAll(); await sleep(300); }
  await G(() => nishioPixel.setWorld(true)); await sleep(800);
  await caption(page, '西尾市と、となりの市町をめぐろう', '岡崎・安城・碧南・高浜・幸田・蒲郡'); await sleep(3500);
  await shot('06-world');
  await G(() => nishioPixel.setWorld(false));
  // 8) エンドカード
  await caption(page, '');
  await endCard(page); await sleep(3500);
  await shot('07-end');
  const rec = await stop();
  await ctx.close();
  toMp4(rec, path.join(OUT, 'nishio-go-9x16.mp4'), { audio: path.join(ROOT, 'nishio-go', 'bgm', 'field.mp3') });
  fs.rmSync(frames, { recursive: true, force: true });
  console.log(`  nishio-go-9x16.mp4（${rec.duration.toFixed(1)}秒）`);

  // 広告用の画像（各サイズ）と、LINE リッチメニューのマス（docs/ads-game-kit.md）
  const shotB64 = n => fs.readFileSync(path.join(OUT, n)).toString('base64');
  const logoUrl = `http://localhost:${PORT}/nishio-go/logo.svg`;
  const FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DotGothic16&family=M+PLUS+Rounded+1c:wght@800&display=swap">';
  const BG = 'linear-gradient(#9fd6ff,#e8f6ff 62%,#cfae4a 62%)';
  const phone = (n, h) => `<img src="data:image/png;base64,${shotB64(n)}" style="height:${h}px;border:${Math.max(4, h / 95)}px solid #000;border-radius:${h / 36}px;display:block">`;
  const pill = (t, fs) => `<div style="font-size:${fs}px;background:rgba(0,0,0,.8);color:#fff;border-radius:${fs / 2.8}px;padding:${fs / 3}px ${fs / 1.8}px;display:inline-block">${t}</div>`;
  const foot = (fs, h) => `<div style="position:absolute;left:0;right:0;bottom:0;height:${h}px;background:rgba(0,0,0,.8);color:#fff;font-size:${fs}px;line-height:${h}px;text-align:center">西尾のお米屋さん 近藤米穀店・らいすぴあ</div>`;
  function layout(w, h) {
    if (w / h > 1.4) {   // 横長：左に文、右にゲーム画面
      const ph = Math.round(h * 0.9), fs = Math.round(h / 11);
      return `<img src="${logoUrl}" style="position:absolute;left:${w * 0.04}px;top:${h * 0.06}px;width:${w * 0.45}px">
        <div style="position:absolute;left:${w * 0.04}px;top:${h * 0.27}px;font-size:${fs}px;font-weight:bold;line-height:1.35;text-shadow:0 0 8px #fff">傾けると お米が ころころ<br>西尾の めいろ</div>
        <div style="position:absolute;left:${w * 0.04}px;top:${h * 0.56}px">${pill('本物の道で できた めいろを、名所へ', Math.round(fs / 2))}</div>
        <div style="position:absolute;left:${w * 0.04}px;top:${h * 0.69}px">${pill('無料・登録なし ／ go.ricepia.jp', Math.round(fs / 2))}</div>
        <div style="position:absolute;right:${w * 0.05}px;top:${h * 0.05}px">${phone('02-maze.png', ph)}</div>${foot(Math.round(fs / 2.3), Math.round(h * 0.09))}`;
    }
    // 正方形・縦長：上から ロゴ → 見出し → 2つの札 → ゲーム画面（縦長は1台、正方形は2台）。位置は横幅から順に積む
    const fs = Math.round(w / 14), logoTop = h * 0.035, headTop = logoTop + w * 0.13, pill1 = headTop + w * 0.21, pill2 = pill1 + w * 0.075;
    const phoneTop = pill2 + w * 0.085, ph = Math.round(h * 0.9 - phoneTop);
    return `<div style="position:absolute;left:0;right:0;top:${logoTop}px;text-align:center"><img src="${logoUrl}" style="width:${w * 0.7}px"></div>
      <div style="position:absolute;left:0;right:0;top:${headTop}px;text-align:center;font-size:${fs}px;font-weight:bold;line-height:1.3;text-shadow:0 0 8px #fff">傾けると お米が ころころ<br>西尾の めいろ</div>
      <div style="position:absolute;left:0;right:0;top:${pill1}px;text-align:center">${pill('本物の道で できた めいろを、名所へ', Math.round(fs / 2.3))}</div>
      <div style="position:absolute;left:0;right:0;top:${pill2}px;text-align:center">${pill('無料・登録なし ／ go.ricepia.jp', Math.round(fs / 2.3))}</div>
      <div style="position:absolute;left:0;right:0;top:${phoneTop}px;display:flex;justify-content:center;gap:${w * 0.03}px">${phone('02-maze.png', ph)}${h / w > 1.1 ? '' : phone('04-goal.png', ph)}</div>${foot(Math.round(fs / 2.4), Math.round(h * 0.075))}`;
  }
  // LINE リッチメニューの1マス（ドライブスルーの代わり）。小さくても読めるように、ロゴと大きな文字だけ
  function tile(w, h) {
    const fs = Math.round(Math.min(h / 7.5, w * 0.8 / 9.6));   // 「傾けて 西尾めいろ」9文字が1行に入る大きさ
    return `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${h * 0.05}px">
      <img src="${logoUrl}" style="width:${w * 0.86}px">
      <div style="font-size:${fs}px;font-weight:bold;white-space:nowrap;background:#fff;border:${h / 120}px solid #000;border-radius:${h / 30}px;padding:${h / 60}px ${w / 30}px">傾けて 西尾めいろ</div>
      <div style="font-size:${Math.round(fs * 0.8)}px;background:#1f5a25;color:#fff;border-radius:${h / 30}px;padding:${h / 80}px ${h / 22}px">▶ あそぶ（無料）</div></div>`;
  }
  function richMenu() {
    const R = 42, K = '#1d1412';   // 角丸と、文字・絵の色（いまのメニューと同じ黒に近い茶）
    const tileBox = (x0, y0, x1, y1, bg, inner) => `<div style="position:absolute;left:${x0}px;top:${y0}px;width:${x1 - x0}px;height:${y1 - y0}px;border-radius:${R}px;background:${bg};display:flex;flex-direction:column;align-items:center;justify-content:center;color:${K};font-family:'M PLUS Rounded 1c','Zen Maru Gothic',sans-serif;font-weight:800;text-align:center;line-height:1.15">${inner}</div>`;
    const big = (t, fs) => `<div style="font-size:${fs}px;letter-spacing:-2px">${t}</div>`;
    const sub = (t, fs) => `<div style="font-size:${fs}px;margin-top:14px">${t}</div>`;
    const svg = (w, h, body) => `<svg width="${w}" height="${h}" viewBox="0 0 100 100" style="margin-bottom:22px">${body}</svg>`;
    const clipboard = svg(170, 200, `<rect x="18" y="16" width="64" height="80" rx="9" fill="${K}"/><rect x="27" y="27" width="46" height="60" rx="3" fill="#c7b9f8"/><rect x="36" y="6" width="28" height="18" rx="6" fill="${K}"/><circle cx="50" cy="13" r="4" fill="#c7b9f8"/><rect x="34" y="42" width="32" height="6" fill="${K}"/><rect x="34" y="56" width="32" height="6" fill="${K}"/><rect x="34" y="70" width="32" height="6" fill="${K}"/>`);
    const pin = svg(170, 200, `<path d="M50 4C30 4 16 19 16 38c0 26 34 58 34 58s34-32 34-58C84 19 70 4 50 4z" fill="${K}"/><circle cx="50" cy="38" r="20" fill="#fda170"/><path d="M50 26v13l9 6" stroke="${K}" stroke-width="6" fill="none" stroke-linecap="round"/>`);
    const card = svg(200, 160, `<rect x="6" y="16" width="88" height="66" rx="9" fill="${K}"/><rect x="14" y="24" width="72" height="50" rx="3" fill="#c8f06f"/><rect x="14" y="30" width="72" height="9" fill="${K}"/><circle cx="28" cy="58" r="5" fill="${K}"/><circle cx="43" cy="58" r="5" fill="${K}"/><circle cx="58" cy="58" r="5" fill="${K}"/><circle cx="73" cy="58" r="5" fill="${K}"/>`);
    const rice = `<svg width="430" height="330" viewBox="0 0 130 100" style="margin-bottom:30px">
      <path d="M14 56h62c0 15-13 26-31 26S14 71 14 56z" fill="${K}"/><rect x="28" y="86" width="34" height="6" rx="3" fill="${K}"/><rect x="40" y="80" width="10" height="8" fill="${K}"/>
      <path d="M28 46c-4-5 4-9 0-15M42 46c-4-5 4-9 0-15M56 46c-4-5 4-9 0-15" stroke="${K}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M78 14c22 10 34 34 32 70" stroke="#a8561a" stroke-width="4" fill="none" stroke-linecap="round"/>
      ${[[80, 18, -40], [88, 16, -10], [86, 27, -50], [95, 24, -20], [93, 36, -55], [102, 34, -25], [99, 46, -60], [107, 46, -30], [104, 58, -65], [111, 58, -35]].map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="3.6" ry="6.2" transform="rotate(${r} ${x} ${y})" fill="#d8962c"/>`).join('')}</svg>`;
    // 左上の ゲームの マスは、2段の タイトルロゴ（tools/make-logo.py --stack）を 大きく
    // 位置（2500×1686）：左 35〜806・中 844〜1654・右 1694〜2463、上 21〜815・下 846〜1650（中のマスは上下つなぎ）
    return `<div style="position:absolute;inset:0;background:#fff"></div>
      ${tileBox(35, 21, 806, 815, '#7ddaf9', `<img src="${logoUrl.replace('logo.svg', 'logo-stack.svg')}" style="width:640px;margin-bottom:26px">${big('お米ころころ', 100)}${sub('傾けて 西尾めいろ・無料', 56)}`)}
      ${tileBox(35, 846, 806, 1650, '#fda170', `${pin}${big('店舗・営業時間', 104)}${sub('地図・定休日', 92)}`)}
      ${tileBox(844, 21, 1654, 1650, '#fed82c', `${rice}${big('新米 販売中', 150)}${sub('入荷速報', 110)}${sub('産地レポート', 110)}`)}
      ${tileBox(1694, 21, 2463, 815, '#c7b9f8', `${clipboard}${big('価格表PDF', 118)}${sub('全銘柄・税込', 86)}`)}
      ${tileBox(1694, 846, 2463, 1650, '#c8f06f', `${card}${big('常連さま', 126)}${big('ポイント', 126)}${sub('残高を見る', 86)}`)}`;
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
  // いまのリッチメニュー（らいすぴあぶろぐ・2026年10月のスクリーンショットから、マスの位置・角丸・色を測ったもの）を描き直し、
  // 左上の「ドライブスルー」を「お米ころころ（にしおさんぽGO）」に替える。ほかの4マスの位置は同じなので、いまのタップ範囲のまま使える
  await make('richmenu-2500x1686.png', 2500, 1686, richMenu());
  await browser.close(); srv.close();
  console.log('できました:', OUT);
})().catch(e => { console.error(e); process.exit(1); });
