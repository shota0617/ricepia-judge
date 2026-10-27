// にしおさんぽGO の はじめの画面に のせる 画面写真を、ほんとうのゲーム画面から撮る：node tools/make-shots.js [出力フォルダ]
// ・nishio-go.html の「プレイ画面」（#intro の .intro-shots）と ricepia.jp の ゲームの 紹介に のせる。既定は nishio-go/shots/*.webp（540×1080）に書く
// ・「🌀 傾けて めいろ」で はじめて 遊ぶ 人と 同じ 順に すすむ（あそびかた → はじめの1枚 → めいろ）。画面の スティックや 📱/🚗 の 切りかえは もう ないので 写らない
// ・撮るもの：reward（はじめの1枚の ごほうび）・meiro（地図の めいろ：生け垣・お米・足あと・金の米つぶ）・roll（🗺 ゴールまでの めいろ図）・world（せかいちず）・badges（バッジ）
//   meiro-board.webp（🌀 ステージの めいろ）は ここでは 撮らない
// 環境変数：CHROMIUM（Chromium の場所）、LEAFLET_DIR（ネットにつながらないとき）、SHOTS_PORT、SHOTS（撮る 名前を カンマで。例 meiro,roll）、SHOTS_TIME（画面の 時刻。既定は きょうの 正午）
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { startServer, ROOT } = require('./bake-common');

const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'nishio-go', 'shots'));
const PORT = Number(process.env.SHOTS_PORT) || 8898, URL = `http://localhost:${PORT}/nishio-go.html`;
const ONLY = process.env.SHOTS ? new Set(process.env.SHOTS.split(',')) : null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = startServer(PORT);
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 360, height: 720 }, deviceScaleFactor: 1.5, timezoneId: 'Asia/Tokyo', locale: 'ja-JP' });
  await ctx.addInitScript(() => { localStorage.setItem('nsg_bgm', 'false'); localStorage.setItem('nsg_noanalytics', '1'); });
  // ゲームは 本当の 時刻で 空の 明るさが かわる。夜に 撮っても 昼の 画面に なるよう、きょうの 正午（日本時間）に 固定（make-ogp.js と 同じ。SHOTS_TIME で かえられる）
  const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  await ctx.clock.setFixedTime(new Date(process.env.SHOTS_TIME || `${day}T12:00:00+09:00`));
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('pageerror:', e.message));
  if (process.env.LEAFLET_DIR) await page.route('https://unpkg.com/**', r => {
    const f = r.request().url().endsWith('.css') ? 'leaflet.css' : 'leaflet.js';
    r.fulfill({ body: fs.readFileSync(path.join(process.env.LEAFLET_DIR, f)), contentType: f.endsWith('css') ? 'text/css' : 'text/javascript' });
  });
  await page.route(/^https:\/\/(cyberjapandata\.gsi\.go\.jp|fonts\.googleapis\.com|fonts\.gstatic\.com|www\.jma\.go\.jp|[^/]*overpass[^/]*)\//, r => r.fulfill({ status: 504, body: '' }));
  const G = (fn, arg) => page.evaluate(fn, arg);
  const closeAll = () => G(() => {   // ごほうび・名所の 窓・ムービー・「どうだった？」を とじる（make-promo.js と 同じ）
    const rw = document.getElementById('reward'); if (rw && rw.classList.contains('show')) rw.click();
    const pi = document.getElementById('pxInfo'); if (pi && !pi.hidden) { const c = pi.querySelector('[data-close]'); if (c) c.click(); else pi.hidden = true; }
    document.querySelectorAll('.movie button, [data-mv="close"]').forEach(b => { if (b.getClientRects().length && /とじる|閉じる|✕|×/.test(b.textContent)) b.click(); });
    const rb = document.getElementById('reactBar'); if (rb) rb.hidden = true;
    document.querySelectorAll('.medashi:not([hidden]) .md-close').forEach(b => b.click());   // イベントの 窓（田んぼ・古い地図・本のできごと）は「あとで」
  });
  const noToast = () => G(() => document.querySelectorAll('.toast').forEach(t => t.classList.remove('show')));
  // 画面の スティック・📱/🚗 の 切りかえ（はずした ボタン）が 写って いないか
  const noOldControls = () => G(() => ['pxStick', 'pxKnob', 'pxRoll', 'pxCar', 'viewBtn', 'pxToggle', 'godotToggle'].filter(id => document.getElementById(id)));   // プレイテストの controlsGone と 同じ
  // PNG で撮って、ページの canvas で WebP に（ffmpeg などが なくても 作れる）
  const shot = async name => {
    if (ONLY && !ONLY.has(name)) return;
    const old = await noOldControls();
    if (old.length) throw new Error(`${name}：はずした ボタンが 写って います（${old.join(', ')}）`);
    const png = (await page.screenshot()).toString('base64');
    const webp = await page.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/webp', 0.82).split(',')[1];
    }, png);
    fs.writeFileSync(path.join(OUT, `${name}.webp`), Buffer.from(webp, 'base64'));
    console.log(`  ${path.relative(process.cwd(), path.join(OUT, name + '.webp'))}`);
  };

  await page.goto(URL); await sleep(2500);
  // 1) 「🌀 傾けて めいろ」→ あそびかた → はじめの1枚を えらぶ → ごほうび
  await page.click('#meiroBtn');
  await page.waitForSelector('#howto:not([hidden])', { timeout: 15000 });
  await sleep(500); await page.click('#howtoOk');
  await page.waitForSelector('#pxInfo [data-pick-dot]', { timeout: 15000 });
  await sleep(800);
  await page.locator('#pxInfo [data-pick-dot]').last().click();
  await page.waitForSelector('#reward.show', { timeout: 10000 });
  await sleep(1500); await noToast();
  await shot('reward');
  for (let i = 0; i < 6; i++) { await closeAll(); await sleep(400); }
  await noToast();

  // 2) 地図の めいろ：近くの 行き止まりに 金の米つぶ。そこへ 向かって 転がして、足あとを つける
  const near = await G(() => {
    const M = nishioPixel.maze, r = nishioPixel.roll, K = M.K, cx = Math.floor(r.x / K), cy = Math.floor(r.y / K);
    return M.grainsNear(20).map(([x, y]) => ({ x, y, d: Math.abs(x - cx) + Math.abs(y - cy) })).sort((a, b) => a.d - b.d)[0] || null;
  });
  if (!near) throw new Error('近くに 金の米つぶが ありません');
  // つぶの 行き止まりの 手前まで、めいろの 通路を たどって 転がす（めいろの 通れる さかいで 道すじを さがし、矢印キーで 1マスずつ）
  const route = await G(([gx, gy]) => {
    const M = nishioPixel.maze, r = nishioPixel.roll, K = M.K, sx = Math.floor(r.x / K), sy = Math.floor(r.y / K);
    const prev = new Map([[sx + ',' + sy, null]]), q = [[sx, sy]];
    while (q.length && prev.size < 20000) {
      const [x, y] = q.shift();
      if (x === gx && y === gy) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
        if (prev.has(k) || M.type(nx, ny) !== 1 || !M.open(x, y, dx, dy)) continue;
        prev.set(k, [x, y]); q.push([nx, ny]);
      }
    }
    const out = []; let c = prev.has(gx + ',' + gy) ? [gx, gy] : null;
    while (c) { out.unshift(c); c = prev.get(c[0] + ',' + c[1]); }
    return out;
  }, [near.x, near.y]);
  if (route.length < 2) throw new Error('金の米つぶまでの 道が 見つかりません');
  console.log(`  金の米つぶまで ${route.length} マス`);
  // 矢印キーで 道すじの つぎの マスへ 向けて 転がす（いきおいで 行きすぎたり 止まったら、その マスに 置きなおす）
  const cell = () => G(() => { const r = nishioPixel.roll, K = nishioPixel.maze.K; return [Math.floor(r.x / K), Math.floor(r.y / K)]; });
  const KEY = { '1,0': 'ArrowRight', '-1,0': 'ArrowLeft', '0,1': 'ArrowDown', '0,-1': 'ArrowUp' };
  const stopAt = Math.max(1, route.length - 2);   // つぶは ひろわずに、手前で 止める（写真に つぶを のこす）
  for (let i = 1; i < stopAt; i++) {
    const [px, py] = route[i - 1], [x, y] = route[i], key = KEY[`${x - px},${y - py}`];
    await page.keyboard.down(key);
    for (let t = 0; t < 20; t++) { await sleep(40); const [cx, cy] = await cell(); if (cx === x && cy === y) break; }
    await page.keyboard.up(key);
    const [cx, cy] = await cell();
    if (cx !== x || cy !== y) await G(([x, y]) => { const K = nishioPixel.maze.K; nishioPixel.rollPut(x * K + K / 2, y * K + K / 2); }, [x, y]);
  }
  await sleep(1200); for (let i = 0; i < 3; i++) { await closeAll(); await sleep(300); }
  await G(() => nishioPixel.maze.map(0));   // ゴールまでの めいろ図（つぎの ゴールの 知らせの あとに 出る）は つぎの 写真で
  await sleep(2500); await noToast();   // 町の 名前の 札が 消えるまで
  await shot('meiro');

  // 3) 🗺 ゴールまでの めいろ図
  await closeAll(); await G(() => nishioPixel.maze.map(10000));
  await page.waitForFunction(() => nishioPixel.maze.mapShown, null, { timeout: 8000 });
  await sleep(600); await noToast();
  await shot('roll');
  await G(() => nishioPixel.maze.map(0));

  // 4) せかいちず（西尾と まわりの まち）
  await G(() => nishioPixel.setWorld(true)); await sleep(2500); await closeAll(); await noToast();
  await shot('world');
  await G(() => nishioPixel.setWorld(false)); await sleep(800);

  // 5) バッジ（きろく）
  await closeAll(); await page.click('[data-tab="log"]'); await sleep(800);
  await G(() => document.getElementById('badgeHead').scrollIntoView({ block: 'start' })); await sleep(600); await noToast();
  await shot('badges');
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
