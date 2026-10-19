// にしおさんぽGO のインスタ投稿（フィードのカルーセル 4:5・1080×1350 を5枚と、ストーリーズ 9:16 を1枚）を、ほんとうのゲーム画面から作る
// 使い方：node tools/make-insta.js [出力フォルダ（mkt/nishio-go/insta）]
// ・ヘッドレス Chromium で「操作して遊ぶ」を進めて画面を撮り、文字をのせる。ドット絵帳の絵は dots.js の Blender の絵をそのまま並べる
// ・文はゲームにあることだけ（docs/fun-core.md・README.md）。投稿文とハッシュタグは docs/insta-post.md
// 環境変数：CHROMIUM（Chromium の場所）、LEAFLET_DIR・FONT_DIR（ネットにつながらないとき。FONT_DIR は npm の @fontsource/dotgothic16 を開いた所）、INSTA_PORT
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { startServer } = require('./bake-common');

const OUT = path.resolve(process.argv[2] || 'mkt/nishio-go/insta');
const PORT = Number(process.env.INSTA_PORT) || 8898, URL = `http://localhost:${PORT}/nishio-go.html`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = startServer(PORT);
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, timezoneId: 'Asia/Tokyo', locale: 'ja-JP' });
  await ctx.addInitScript(() => { localStorage.setItem('nsg_view', 'px'); localStorage.setItem('nsg_auto', 'false'); localStorage.setItem('nsg_world_on', '0'); localStorage.setItem('nsg_bgm', 'false'); localStorage.setItem('nsg_noanalytics', '1'); });
  // ネットにつながらないとき：地図の Leaflet とドットの文字（DotGothic16）を手もとのファイルから出す
  const offline = async c => {
    if (process.env.LEAFLET_DIR) await c.route('https://unpkg.com/**', r => {
      const f = r.request().url().endsWith('.css') ? 'leaflet.css' : 'leaflet.js';
      r.fulfill({ body: fs.readFileSync(path.join(process.env.LEAFLET_DIR, f)), contentType: f.endsWith('css') ? 'text/css' : 'text/javascript' });
    });
    if (process.env.FONT_DIR) {
      await c.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css',
        body: fs.readFileSync(path.join(process.env.FONT_DIR, '400.css'), 'utf8').replace(/url\(\.\/files\//g, 'url(https://fonts.gstatic.com/local/') }));
      await c.route('https://fonts.gstatic.com/local/**', r => r.fulfill({ body: fs.readFileSync(path.join(process.env.FONT_DIR, 'files', r.request().url().split('/').pop())), contentType: 'font/woff2' }));
    }
  };
  await offline(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('pageerror:', e.message));
  await page.route(/^https:\/\/[^/]*overpass[^/]*\//, r => r.fulfill({ status: 504, body: '' }));
  const shots = {};
  const shot = async name => { shots[name] = (await page.screenshot()).toString('base64'); console.log('  撮った:', name); };
  const G = (fn, arg) => page.evaluate(fn, arg);

  await page.goto(URL); await sleep(2500);
  // 1) 西尾城跡のあたりを歩く
  await page.click('#demoBtn'); await sleep(800);
  await G(() => { const s = nishioGo.spots.find(x => x.id === 'f-nishio-castle'); nishioGo.moveTo(s.lat - 0.0006, s.lng + 0.0006); });
  await sleep(2500);
  for (const k of ['ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowUp']) { await page.keyboard.press(k); await sleep(380); }
  await sleep(1500);
  await shot('walk');
  // 2) まちの人の話
  await G(() => { const n = nishioGo.npcs.find(x => x.id === 'castle-guide'); nishioGo.moveTo(n.lat, n.lng); let h = ''; for (let i = 0; i < 8; i++) { const r = nishioGo.talkNpc(n.id, i); if (r.html === h) break; h = r.html; } document.getElementById('pxInfoBody').innerHTML = h; document.getElementById('pxInfo').hidden = false; });
  await sleep(2500);
  await shot('talk');
  await G(() => { document.getElementById('pxInfo').hidden = true; });
  // 3) ミニゲーム「にしおジャンプ」（名所でチェックインした日にあそべる。ここでは画面を撮るために直接ひらく）
  // 画面のドット（192×144）をそのまま取り出して、あとでにじまないよう整数倍に大きくする
  const jumpAt = async (tx, name) => {
    await G(t => NISHIO_JUMP.warp(t), tx); await sleep(200);
    await G(() => NISHIO_JUMP.press('right', true)); await sleep(350);
    await G(() => NISHIO_JUMP.press('jump', true)); await sleep(240);
    await G(() => { NISHIO_JUMP.press('jump', false); NISHIO_JUMP.press('right', false); });
    shots[name] = await G(() => document.querySelector('#jump canvas').toDataURL().split(',')[1]); console.log('  撮った:', name);
  };
  await G(() => NISHIO_JUMP.open()); await sleep(600);
  await jumpAt(6, 'jump'); await jumpAt(150, 'jump2');
  await G(() => NISHIO_JUMP.close());
  // 4) ドット絵帳の絵（Blender で作った 74000枚から、題材・季節・時間・天気のちがう12枚）
  const cards = await G(async () => {
    const D = window.NISHIO_DOTS, n = D.MOTIFS.length;
    const pickIds = [[0, 0, 0, 1], [3, 0, 4, 2], [6, 2, 9, 7], [9, 0, 12, 11], [12, 4, 0, 3], [15, 1, 6, 12],
      [18, 0, 13, 6], [21, 3, 5, 18], [24, 0, 2, 9], [27, 2, 11, 4], [30, 4, 15, 13], [33, 0, 8, 22]];
    const ids = pickIds.map(([m, w, slot, c]) => D.idOf(m % n, w, slot, c));
    await D.load(ids);
    return ids.map(id => ({ url: D.canvas(id).toDataURL(), name: D.info(id).name }));
  });
  console.log('  ドット絵:', cards.map(c => c.name).join(' / '));
  await ctx.close();

  // ---------- 投稿の画像 ----------
  const logoUrl = `http://localhost:${PORT}/nishio-go/logo.svg`;
  const FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DotGothic16&display=swap">';
  const BG = 'linear-gradient(#9fd6ff,#e8f6ff 64%,#cfae4a 64%)';
  const phone = (n, h) => `<img src="data:image/png;base64,${shots[n]}" style="height:${h}px;border:10px solid #000;border-radius:28px;display:block;box-shadow:0 10px 0 rgba(0,0,0,.18)">`;
  const game = n => `<img src="data:image/png;base64,${shots[n]}" style="width:${192 * 4}px;height:${144 * 3 - 12}px;object-fit:cover;object-position:50% 70%;image-rendering:pixelated;border:8px solid #000;border-radius:16px;display:block;box-shadow:0 8px 0 rgba(0,0,0,.18)">`;
  const head = (t, top, fs = 76) => `<div style="position:absolute;left:0;right:0;top:${top}px;text-align:center;font-size:${fs}px;font-weight:bold;line-height:1.3;text-shadow:0 0 10px #fff,0 0 4px #fff">${t}</div>`;
  const pill = (t, top, fs = 38, bg = 'rgba(0,0,0,.82)') => `<div style="position:absolute;left:0;right:0;top:${top}px;text-align:center"><span style="display:inline-block;font-size:${fs}px;background:${bg};color:#fff;border-radius:14px;padding:12px 26px">${t}</span></div>`;
  const page_ = (i, total) => `<div style="position:absolute;right:28px;top:24px;font-size:30px;background:rgba(255,255,255,.85);border:3px solid #000;border-radius:12px;padding:2px 14px">${i}/${total}</div>`;
  const foot = `<div style="position:absolute;left:0;right:0;bottom:0;height:86px;background:rgba(0,0,0,.82);color:#fff;font-size:32px;line-height:86px;text-align:center">go.ricepia.jp ・ 無料・登録なし</div>`;
  const center = (inner, top) => `<div style="position:absolute;left:0;right:0;top:${top}px;display:flex;justify-content:center">${inner}</div>`;
  const T = 5;
  const slides = [
    ['01-cover', `<div style="position:absolute;left:0;right:0;top:40px;text-align:center"><img src="${logoUrl}" style="width:760px"></div>
      ${head('西尾のまちを<br>ドット絵で歩こう', 250)}${pill('本物の道・川・田んぼから作った地図', 470)}
      ${center(phone('walk', 720), 560)}${page_(1, T)}`],
    ['02-dots', `${head('集めるドット絵は<br>74000枚', 60)}${pill('季節・時間・天気で、もらえる絵が変わる', 290)}
      <div style="position:absolute;left:60px;right:60px;top:390px;display:grid;grid-template-columns:repeat(4,1fr);gap:22px">
        ${cards.map(c => `<div style="background:#fff;border:6px solid #000;border-radius:14px;padding:8px;box-shadow:0 6px 0 rgba(0,0,0,.2)"><img src="${c.url}" style="width:100%;image-rendering:pixelated;display:block"></div>`).join('')}</div>
      ${pill('西尾・一色・吉良・幡豆・佐久島の 37の題材', 1150, 34, 'rgba(31,90,37,.9)')}${foot}${page_(2, T)}`],
    ['03-jump', `${head('名所に行った日だけ<br>ミニゲーム', 60)}${pill('🎮 にしおジャンプ：コインを集めて西尾城の旗へ', 290, 34)}
      ${center(game('jump'), 400)}${center(game('jump2'), 830)}${page_(3, T)}`],
    ['04-talk', `${head('まちの人の話で<br>行き先が決まる', 60)}${pill('話を聞いて、名所でチェックイン', 290)}
      ${center(phone('talk', 860), 390)}${page_(4, T)}`],
    ['05-end', `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;text-align:center">
      <img src="${logoUrl}" style="width:820px">
      <div style="font-size:66px;font-weight:bold;background:#fff;border:6px solid #000;border-radius:20px;padding:22px 36px;line-height:1.35">西尾のまちを歩く<br>お散歩ゲーム</div>
      <div style="font-size:40px;background:rgba(0,0,0,.82);color:#fff;border-radius:14px;padding:14px 28px">無料・登録なしで、すぐ遊べる</div>
      <div style="font-size:72px;font-weight:bold;color:#1f5a25;background:#fff;border-radius:16px;padding:10px 32px">go.ricepia.jp</div>
      <div style="font-size:36px;background:rgba(0,0,0,.75);color:#fff;border-radius:12px;padding:10px 22px">プロフィールのリンクから遊べます</div>
      <div style="font-size:30px;color:#000;text-shadow:0 0 6px #fff">西尾のお米屋さん 近藤米穀店・らいすぴあ</div></div>${page_(5, T)}`],
  ];
  const make = async (name, w, h, html) => {
    const c2 = await browser.newContext({ viewport: { width: w, height: h } });
    await offline(c2);
    const p2 = await c2.newPage();
    await p2.setContent(`<html><head>${FONT}</head><body style="margin:0;width:${w}px;height:${h}px;font-family:'DotGothic16',sans-serif;background:${BG};position:relative;overflow:hidden">${html}</body></html>`, { waitUntil: 'networkidle' }).catch(() => {});
    await p2.evaluate(() => document.fonts.ready); await sleep(500);
    await p2.screenshot({ path: path.join(OUT, name + '.png') }); console.log('  ' + name + '.png');
    await c2.close();
  };
  for (const [name, html] of slides) await make(name, 1080, 1350, html);
  // ストーリーズ（9:16）：ドット絵とミニゲームを1枚に。上と下の 250px は、アプリのボタンにかからないよう文字を置かない
  await make('story-1080x1920', 1080, 1920, `<div style="position:absolute;left:0;right:0;top:250px;text-align:center"><img src="${logoUrl}" style="width:700px"></div>
    ${head('ドット絵74000枚と<br>ミニゲーム', 450, 72)}
    <div style="position:absolute;left:70px;top:680px;display:grid;grid-template-columns:repeat(2,200px);gap:18px">
      ${cards.slice(0, 6).map(c => `<div style="background:#fff;border:6px solid #000;border-radius:12px;padding:6px"><img src="${c.url}" style="width:100%;image-rendering:pixelated;display:block"></div>`).join('')}</div>
    <div style="position:absolute;right:70px;top:700px;transform:scale(.58);transform-origin:top right">${game('jump')}<div style="height:30px"></div>${game('jump2')}</div>
    ${pill('無料・登録なし ／ go.ricepia.jp', 1530, 44)}`);
  await browser.close(); srv.close();
  console.log('できました:', OUT);
})().catch(e => { console.error(e); process.exit(1); });
