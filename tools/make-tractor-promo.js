// トラクターのゲーム（tractor.html）の 広告用プレイ動画（横 16:9・1920×1080・約30秒・mp4）を、ほんとうのゲーム画面から作る
//   node tools/make-tractor-promo.js [出力フォルダ]
// ・ヘッドレス Chromium の WebGL（ソフトウェア描画）は 1こまに 数秒かかるので、ゲームの時計（requestAnimationFrame・performance.now）を
//   こちらで 1/FPS 秒ずつ進めて 1こまずつ 描いて撮る。録るのに時間はかかるが、動画は なめらかで、ゲームの動きは 本物と同じ速さ
// ・場面ごとに ページを開きなおし（春の朝・春の運転席・秋の夕方・代かき）、前もって 何列か 耕しておいてから 録る
// ・ゲームのボタン・案内は かくし、字幕だけをのせる。字幕は はじめの画面に 書いてあることだけ
// 環境変数：FPS（30）、PREVIEW=1（4こま/秒・画面 1/2 で 構図だけ 見る）、THREE_NM（ネットにつながらないとき three を node_modules から）、PROMO_PORT
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { startServer } = require('./bake-common');

const OUT = path.resolve(process.argv[2] || 'tractor-promo-out');
const PREVIEW = !!process.env.PREVIEW, FPS = PREVIEW ? 4 : Number(process.env.FPS) || 30;
const PORT = Number(process.env.PROMO_PORT) || 8898, TN = process.env.THREE_NM;
const VIEW = { width: 1280, height: 720 }, DPR = PREVIEW ? 0.75 : 1.5;   // 1280×720 を 1.5倍で 描いて 1920×1080
const URL = 'go.ricepia.jp/tractor.html';

// 場面：q＝ページの条件、cam＝カメラ、gap＝列の間かく（m）、rows＝前もって耕す列の数、sec＝長さ、cap＝字幕、end＝おわりのカード
const SCENES = [
  { q: 'season=haru&time=asa', cam: 'うしろから', gap: 2.0, rows: 3, sec: 6.5, cap: ['トラクターで 田んぼを耕そう', '60馬力・キャビン付き　30m×50m の田んぼ'] },
  { q: 'season=haru&time=hiru', cam: '運転席', gap: 2.0, rows: 4, sec: 6, cap: ['運転席に すわって ハンドルを にぎる', 'うしろのロータリーで 土を耕す'] },
  { q: 'season=aki&time=yu', cam: 'うしろから', gap: 2.0, rows: 3, sec: 6, cap: ['秋は 稲刈りのあとの田んぼ', '朝・昼・夕方・夜、晴れ・くもり・小雨'] },
  { q: 'season=shirokaki&time=hiru', cam: 'うしろから', gap: 3.2, rows: 2, sec: 12, cap: ['代かきは 水を張った田んぼ', '農家さんの声から作った場面が いっぱい'], end: 6 },
];

// ゲームの時計を こちらで進める（ページより先に入れる）
function clockHook() {
  const P = { on: false, vt: 0, base: 0, q: [] }; window.__promo = P;
  const raf = window.requestAnimationFrame.bind(window), now = performance.now.bind(performance);
  window.requestAnimationFrame = cb => { if (P.on) { P.q.push(cb); return 1; } return raf(t => (P.on ? P.q.push(cb) : cb(t))); };
  performance.now = () => (P.on ? P.base + P.vt : now());
  P.start = () => { P.base = now(); P.vt = 0; P.on = true; };
  P.step = ms => { P.vt += ms; const q = P.q; P.q = []; for (const cb of q) cb(P.base + P.vt); };
}

// ボタン・案内を かくし、字幕の場所を作る
function overlay() {
  const st = document.createElement('style');
  st.textContent = `body > *:not(#view):not(#vignette):not(#promoCap):not(#promoEnd) { visibility: hidden !important; }
    #promoCap { position: fixed; left: 50%; bottom: 56px; transform: translateX(-50%); z-index: 9999; text-align: center; color: #fff;
      background: rgba(0,0,0,.62); border-radius: 14px; padding: 14px 30px 12px; font-weight: bold; font-size: 40px; line-height: 1.35; white-space: nowrap; transition: opacity .4s; }
    #promoCap small { display: block; font-size: 24px; font-weight: normal; color: #ffe27a; margin-top: 4px; }
    #promoEnd { position: fixed; inset: 0; z-index: 10000; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px;
      background: rgba(20,32,18,.72); color: #fff; text-align: center; opacity: 0; transition: opacity .6s; }
    #promoEnd h2 { margin: 0; font-size: 64px; } #promoEnd .u { font-size: 44px; font-weight: bold; color: #1f5a25; background: #fff; border-radius: 12px; padding: 8px 26px; }
    #promoEnd .s { font-size: 30px; background: rgba(0,0,0,.45); border-radius: 10px; padding: 8px 20px; } #promoEnd .shop { font-size: 24px; }`;
  document.head.appendChild(st);
  const c = document.createElement('div'); c.id = 'promoCap'; c.style.opacity = 0; document.body.appendChild(c);
}

// 前もって 耕しておき、録りはじめの所に置く（tooshi.js と同じ まっすぐの たどり方）
function setup({ gap, rows, cam }) {
  const g = game, S = g.S, K = g.key, HX = 15, HZ = 25;
  const ang = a => Math.atan2(Math.sin(a), Math.cos(a));
  g.sim(3);
  const x0 = -HX + 6.5, follow = (xt, dir) => { const ex = Math.max(-1, Math.min(1, xt - S.x)), want = (dir > 0 ? 0 : Math.PI) + dir * 0.35 * ex; S.steer = Math.max(-0.3, Math.min(0.3, -1.5 * ang(want - S.yaw))); };
  for (let r = 0; r < rows; r++) {
    const xt = x0 + r * gap; Object.assign(S, { x: xt, z: -HZ + 7, yaw: 0, v: 0, steer: 0 }); g.sim(0.3);
    K.fwd = 1; if (!S.rotDown) g.toggleRotary();
    for (let k = 0; k < 2000 && S.z < HZ - 7; k++) { follow(xt, 1); g.sim(0.05); }
    K.fwd = 0; g.toggleRotary(); g.sim(1.5);
  }
  const xt = x0 + rows * gap; Object.assign(S, { x: xt, z: -HZ + 8, yaw: 0, v: 0, steer: 0 }); g.sim(0.3);
  K.fwd = 1; g.toggleRotary(); for (let k = 0; k < 60; k++) { follow(xt, 1); g.sim(0.05); }   // 下ろして 走りだしてから 録る
  while (document.getElementById('bCam').textContent.indexOf(cam) < 0) g.nextCam();
  window.__follow = () => follow(xt, 1);
}

async function scene(browser, sc, idx, dir) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DPR });
  const p = await ctx.newPage(); p.setDefaultTimeout(600000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  if (TN) {
    await p.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ path: TN + '/build/three.min.js', contentType: 'text/javascript' }));
    await p.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: TN + r.request().url().split('/three@0.128.0')[1], contentType: 'text/javascript' }));
  }
  await p.addInitScript(clockHook);
  await p.goto(`http://127.0.0.1:${PORT}/tractor.html?${sc.q}&art=none&easy=0`);
  await p.waitForFunction(() => !document.getElementById('bStart').disabled, null, { timeout: 300000, polling: 500 });
  if (await p.$('#checkBox')) await p.check('#checkBox');   // 始業点検をしてから（しないと ファンベルト・燃料などの こしょうが出る）
  await p.click('#bStart'); await p.waitForTimeout(500);
  await p.evaluate(overlay);
  await p.evaluate(setup, { gap: sc.gap, rows: sc.rows, cam: sc.cam });
  await p.evaluate(() => window.__promo.start());
  const cdp = await ctx.newCDPSession(p), step = 1000 / FPS, n = Math.round(sc.sec * FPS);
  for (let k = 0; k < 20; k++) await p.evaluate(() => { window.__follow(); window.__promo.step(50); });   // カメラが 追いつくまで（撮らない）
  fs.mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const t = i / FPS;
    await p.evaluate(([t, sec, cap, end, step, url]) => {
      window.__follow(); window.__promo.step(step);
      const c = document.getElementById('promoCap');
      const capOn = t > 0.4 && t < (end ? sec - end : sec) - 0.3;
      if (capOn && !c.innerHTML) c.innerHTML = `${cap[0]}<small>${cap[1]}</small>`;
      c.style.opacity = capOn ? 1 : 0;
      if (end && t >= sec - end && !document.getElementById('promoEnd')) {
        const e = document.createElement('div'); e.id = 'promoEnd';
        e.innerHTML = `<h2>🚜 トラクターで田んぼを耕そう</h2><div class="s">春・秋・代かき　田んぼに絵も描ける</div>
          <div class="s">スマホ・パソコンの ブラウザで すぐ遊べる</div><div class="u">${url}</div><div class="shop">西尾のお米屋さん 近藤米穀店・らいすぴあ</div>`;
        document.body.appendChild(e); requestAnimationFrame(() => {}); setTimeout(() => (e.style.opacity = 1), 0);
      }
    }, [t, sc.sec, sc.cap, sc.end || 0, step, URL]);
    if (i === 0 || (sc.end && Math.abs(t - (sc.sec - sc.end)) < 0.5 / FPS)) await p.waitForTimeout(700);   // 字幕・カードの transition を 待つ
    const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, optimizeForSpeed: false });
    fs.writeFileSync(path.join(dir, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(r.data, 'base64'));
    if (i % (FPS * 2) === 0) console.log(`  場面${idx + 1} ${i}/${n} こま（${((Date.now() - t0) / 1000 / Math.max(1, i)).toFixed(1)} 秒/こま）`);
  }
  if (errs.length) console.log('  ページのエラー:', errs.slice(0, 3).join(' / '));
  await ctx.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = startServer(PORT);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const parts = [];
  try {
    for (let i = 0; i < SCENES.length; i++) {
      const only = process.env.ONLY; if (only && !only.split(',').includes(String(i + 1))) continue;
      const dir = path.join(OUT, `frames${i + 1}`);
      console.log(`場面${i + 1}：${SCENES[i].q}（${SCENES[i].cam}）`);
      await scene(browser, SCENES[i], i, dir);
      const part = path.join(OUT, `part${i + 1}.mp4`);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.jpg'),
        '-vf', `scale=1920:1080:flags=lanczos,fps=30,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', part]);
      parts.push(part);
    }
  } finally { await browser.close(); srv.close(); }
  // 場面を 0.4 秒の クロスフェードで つなぐ
  const lens = parts.map(f => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString()));
  const X = 0.4, out = path.join(OUT, PREVIEW ? 'tractor-16x9-preview.mp4' : 'tractor-16x9.mp4');
  if (parts.length === 1) fs.copyFileSync(parts[0], out);
  else {
    let fc = '', last = '[0:v]', off = 0;
    for (let i = 1; i < parts.length; i++) { off += lens[i - 1] - X; fc += `${last}[${i}:v]xfade=transition=fade:duration=${X}:offset=${off.toFixed(3)}[v${i}];`; last = `[v${i}]`; }
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...parts.flatMap(f => ['-i', f]), '-filter_complex', fc.replace(/;$/, ''), '-map', last,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out]);
  }
  console.log('できた:', out, `${(fs.statSync(out).size / 1e6).toFixed(1)}MB`);
})().catch(e => { console.error(e); process.exit(1); });
