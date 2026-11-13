// 最初の1分の確かめ（サイクル259〜278）：node firstmin.js [tractor.html のパス]
//  1) 知らせの文：吹き出し（speakText）・短い文（shortText）で かっこが合わなくならない（「…見ます）」のような切れ方をしない）
//  3) 畦の手前で止まった人：「横へ なぞる」見本が出て、見本どおりで向きが変わる。自動で下ろす知らせは 1 回だけ（サイクル260）
//  2) のんびりの大きな数字：スマホ縦で 1 回なぞって耕したら 0% のままにならない。田んぼアートでは地図の「でき」と同じ数、お題なしでは小数 1 けた
// three r128 は tooshi.js と同じ（THREE_NM か scripts/node_modules/three）。本物の GLTFLoader が手元にないときは、
// 代わりのローダーを入れた THREE_NM と NOSRI=1（integrity を外す）で動かす
const fs = require('fs'), http = require('http'), path = require('path');
const ROOT = path.resolve(__dirname, '../../../..'), HTML = path.resolve(process.argv[2] || path.join(ROOT, 'tractor.html')), TN = process.env.THREE_NM || path.join(__dirname, 'node_modules/three'), PORT = +(process.env.PORT || 8891);
const src = fs.readFileSync(HTML, 'utf8'); let ng = 0;
const ok = (name, cond, info) => { console.log((cond ? 'ok   ' : 'NG   ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); if (!cond) ng++; };
// ---- 0) なぞりを畦から寄せる幅（Codex 指摘 PR #1070）：幅のせまい作業機でも いちばん外の列（畦から 0.5m + 幅の半分）を なぞれる ----
{
  const m = src.match(/clampM\(\) \{ return ([^;]+); \}/), f = m && new Function('TILL_W', 'return ' + m[1]);
  const got = f ? [2.2, 1.35, 0.9, 3.4].map(w => +f(w).toFixed(3)) : null;
  ok('畦から寄せる幅：ロータリー 1.5m・プラウは外の列（1.175m）まで', !!got && got[0] === 1.5 && got[1] === 1.175 && got[2] === 0.95 && got[3] === 1.5 && /clampIn\(h\) \{ const m = this\.clampM\(\);/.test(src), got);
}
// （0b の「点列を消したら sPos も消す」は、サイクル264 で 本物のタッチで確かめる形にした＝下の 6）
// ---- 1) 知らせの文 ----
{
  const fn = new Function('DETAIL', src.slice(src.indexOf('const KEYH ='), src.indexOf('function showToast')) + '; return { speakText, shortText };')(false);
  const bal = s => { let d = 0; for (const c of s) { if (c === '（') d++; else if (c === '）' && --d < 0) return false; } return d === 0; };
  const lits = new Set(), re = /'((?:[^'\\\n]|\\.)*)'/g; let m;
  while ((m = re.exec(src))) { const s = m[1]; if (/[ぁ-ん]/.test(s) && /[（）]/.test(s) && s.length < 500 && bal(s)) lits.add(s); }
  const bad = [...lits].filter(s => !bal(fn.speakText(s)) || !bal(fn.shortText(s)));
  ok('知らせの文 ' + lits.size + ' 個：吹き出し・短い文の かっこが合う', lits.size > 50 && bad.length === 0, bad.slice(0, 3).map(s => fn.speakText(s)));
  const g = 'ギーギー いってるね。とまって 上げたら みるよ（ロータリーを上げ下げすると ギーギー鳴る。3 点リンクの 動く所の グリースが 切れているのかも。止まって 上げると 見ます）';
  ok('ギーギーの吹き出し', fn.speakText(g) === 'ギーギー いってるね。とまって 上げたら みるよ', fn.speakText(g));
  ok('かっこの中の キーの案内は残す', fn.shortText('PTO 2 速：爪が速く回り、土が細かく砕ける（エンジンは少し重い。ジャンボタニシ対策の冬の耕うんにも）（P）') === 'PTO 2 速：爪が速く回り、土が細かく砕ける（P）');
}
// ---- 2) 大きな数字（スマホ縦・はじめての人） ----
const { chromium } = require('playwright');
const srv = http.createServer((r, s) => { const u = decodeURIComponent(r.url.split('?')[0]), f = u === '/tractor.html' ? HTML : path.join(ROOT, u);
  fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } if (u === '/tractor.html' && process.env.NOSRI) d = Buffer.from(d.toString('utf8').replace(/ integrity="[^"]*"/g, ''));
    s.writeHead(200, { 'Content-Type': u.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); s.end(d); }); }).listen(PORT, async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [];
  for (const [label, qs] of [['田んぼアート（既定）', ''], ['お題なし', '?art=none']]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); p.setDefaultTimeout(180000);
    p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
    await p.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: TN + r.request().url().split('/three@0.128.0')[1], contentType: 'text/javascript' }));
    await p.goto(`http://localhost:${PORT}/tractor.html${qs}`);
    await p.waitForFunction(() => window.game && game.S && game.S.started && typeof P !== 'undefined' && P.Rotary);
    // swiftshader は遅いので、時計をにせものにして ページの frame() を 0.05 秒ずつ手で回す（絵は描かない）
    await p.evaluate(() => { const real = performance.now.bind(performance); let now = real(); performance.now = () => now; window.__sync = () => { now = real(); }; window.requestAnimationFrame = () => 0; game.renderer.render = () => {};
      window.__adv = sec => { for (let i = 0, n = Math.round(sec / 0.05); i < n; i++) { now += 50; frame(now); } }; });
    await p.waitForTimeout(2500);   // エンジンの始動（セル）は本物の時計（setTimeout）で進むので、かかるまで待つ
    await p.evaluate(() => window.__sync());   // 待っている間に 予約ずみの本物の 1 こまが回ることがある。にせものの時計を そのあとへ合わせる（時間が逆もどりしないように）
    const cdp = await ctx.newCDPSession(p), adv = s => p.evaluate(x => window.__adv(x), s), big = () => p.evaluate(() => document.getElementById('bigPct').textContent);
    await adv(2); ok(label + '：はじめは 0', /^0(\.0)?%$/.test(await big()), await big());
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 481, id: 1 }] });   // ヒントの指と同じ：前へ 1 回なぞる
    for (let i = 1; i <= 20; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 481 - 84 * i / 20, id: 1 }] }); await adv(0.05); }
    await adv(3); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await adv(0.5);
    // 大きな数字は 0.15 秒ごとに 書きかえる。こんでいる機械では 指を離す知らせが おくれて届き、まだ耕している とちゅうで 読むと、数字だけ 1 回ぶん古い（0.7% と 0.83%）。
    // 指を離す知らせを 受けとってから、耕した ます目の数が 0.5 秒 変わらなくなるまで待ち、数字が もう 1 回 書きかわってから、2 つを 同じ しゅんかんに読む（ゆるす差 0.11 は 変えない）
    await p.evaluate(() => new Promise(r => setTimeout(r, 300)));
    for (let i = 0, c = -1; i < 12; i++) { const n = await p.evaluate(() => { window.__adv(0.5); return tilledCount; }); if (n === c) break; c = n; }
    await adv(0.2);
    const r = await p.evaluate(() => ({ big: document.getElementById('bigPct').textContent, tilled: tilledCount, art: ART.on ? Math.floor(ART.score().fill * 100 + 1e-9) : null, field: tilledCount / workCount * 100 }));
    ok(label + '：1 回なぞって耕した（4 秒）', r.tilled > 100, r.tilled);
    ok(label + '：数字が 0 のままでない', !/^0(\.0)?%$/.test(r.big), r.big);
    // サイクル271 の店主指示（2026-11-11）で、大きな数字は お題が あっても「田んぼ全体の耕し率」に なった。それまでの「数字＝地図の でき」の確かめは main の tractor.html で落ちていたので、
    // 店主指示どおりの形に 書きかえた（サイクル272）：お題ありでも 田んぼ全体の割合・小数 1 けた。地図の「でき」は 別の数として 今までどおり 取れる
    if (r.art !== null) ok(label + '：数字＝田んぼ全体の耕し率（小数 1 けた）。地図の「でき」は 別に 数えている', /^\d\.\d%$/.test(r.big) && Math.abs(parseFloat(r.big) - r.field) < 0.11 && r.art >= 1, [r.big, +r.field.toFixed(2), r.art]);
    else ok(label + '：10% までは小数 1 けた（田んぼ全体）', /^\d\.\d%$/.test(r.big) && Math.abs(parseFloat(r.big) - r.field) < 0.11, [r.big, +r.field.toFixed(2)]);
    await ctx.close();
  }
  // ---- 3) 畦の手前で止まった人（サイクル260）：ヒントどおり前へ なぞるだけ → 「横へ なぞる」見本が出る → 見本どおりで向きが変わる。自動で下ろす知らせは 1 回だけ ----
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); p.setDefaultTimeout(180000);
    p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
    await p.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: TN + r.request().url().split('/three@0.128.0')[1], contentType: 'text/javascript' }));
    await p.goto(`http://localhost:${PORT}/tractor.html`);
    await p.waitForFunction(() => window.game && game.S && game.S.started && typeof P !== 'undefined' && P.Rotary);
    await p.evaluate(() => { const real = performance.now.bind(performance); let now = real(), last = ''; performance.now = () => now; window.__sync = () => { now = real(); }; window.requestAnimationFrame = () => 0; game.renderer.render = () => {}; window.__low = 0;
      window.__adv = sec => { for (let i = 0, n = Math.round(sec / 0.05); i < n; i++) { now += 50; frame(now); const e = document.getElementById('say'), t = e.classList.contains('off') ? '' : e.innerText; if (t !== last) { last = t; if (/を下げました/.test(t)) __low++; } } }; });
    await p.waitForTimeout(2500);
    await p.evaluate(() => window.__sync());
    const cdp = await ctx.newCDPSession(p), adv = s => p.evaluate(x => window.__adv(x), s);
    const stroke = async (pts, hold) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1], id: 1 }] });
      for (let i = 1; i <= 20; i++) { const f = i / 20 * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(f)), u = f - k; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pts[k][0] + (pts[k + 1][0] - pts[k][0]) * u, y: pts[k][1] + (pts[k + 1][1] - pts[k][1]) * u, id: 1 }] }); await adv(0.05); }
      await adv(hold); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await adv(1.2); };
    const st = () => p.evaluate(() => { const box = document.getElementById('hintSwipe'), vis = [...box.querySelectorAll('.hDot')].filter(e => e.style.display !== 'none'), d = vis.map(e => parseFloat(e.style.left)), dy = vis.length ? parseFloat(vis[0].style.top) : 0;
      return { z: game.S.z, x: game.S.x, yaw: game.S.yaw, el: game.S.elapsed, hint: !box.classList.contains('hidden'), dx: d.length ? d[d.length - 1] - 195 : 0, dy, low: window.__low }; });
    await adv(2);
    let s, z0 = -99, n = 0;
    for (; n < 8; n++) { await stroke([[195, 481], [195, 397]], 4.5); s = await st(); if (Math.abs(s.z - z0) < 0.05) break; z0 = s.z; }   // 前へ なぞるだけ。進まなくなるまで
    ok('前へ なぞるだけの人は 畦の手前で止まる', n < 8 && s.z > 19, [n, +s.z.toFixed(1), +s.el.toFixed(1)]);
    await stroke([[195, 481], [195, 397]], 4.5); await adv(1.5); s = await st();
    for (let i = 0; i < 12 && !(s.hint && Math.abs(s.dx) > 40); i++) { await adv(0.2); s = await st(); }   // 見本は 2.6 秒で 1 まわり。指が横へ出ている所をつかまえる
    ok('止まったままなら「横へ なぞる」見本が出る', s.hint && Math.abs(s.dx) > 40, [s.hint, Math.round(s.dx)]);
    ok('見本は ボンネットより上（画面の上半分）から始まる（サイクル261）', s.dy > 0 && s.dy < 422, Math.round(s.dy));
    const side = s.dx < 0 ? -1 : 1, yaw0 = s.yaw, x0 = s.x;
    // サイクル261: 前へ なぞった指が 少し横へずれているだけ（40px）では、畦の手前で勝手に曲がらない
    for (let i = 0; i < 2; i++) await stroke([[195, 481], [195 - side * 40, 397]], 4.5);
    s = await st();
    ok('少しずれた「前へ」の なぞりでは 曲がらない（サイクル261）', Math.abs(Math.atan2(Math.sin(s.yaw - yaw0), Math.cos(s.yaw - yaw0))) < 0.3 && Math.abs(s.x - x0) < 1, [+(s.yaw - yaw0).toFixed(2), +(s.x - x0).toFixed(1)]);
    for (let i = 0; i < 3; i++) await stroke([[195, 506], [195 + side * 58, 473], [195 + side * 156, 447]], 4.0);
    s = await st(); const dyaw = Math.abs(Math.atan2(Math.sin(s.yaw - yaw0), Math.cos(s.yaw - yaw0)));
    ok('見本どおり横へ 3 回なぞると 向きが変わる（35° 以上）', dyaw > 0.6, [+dyaw.toFixed(2), +(s.x - x0).toFixed(1)]);
    ok('自動で下ろす知らせ「…を下げました」は 1 回だけ', s.low === 1, s.low);
    await ctx.close();
  }
  // ---- 4) 田んぼの中で止まった人（サイクル262・運営者の実機の声「曲がり方がわからない」）----
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); p.setDefaultTimeout(180000);
    p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
    await p.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: TN + r.request().url().split('/three@0.128.0')[1], contentType: 'text/javascript' }));
    await p.goto(`http://localhost:${PORT}/tractor.html`);
    await p.waitForFunction(() => window.game && game.S && game.S.started && typeof P !== 'undefined' && P.Rotary);
    await p.evaluate(() => { const real = performance.now.bind(performance); let now = real(); performance.now = () => now; window.__sync = () => { now = real(); }; window.requestAnimationFrame = () => 0; game.renderer.render = () => {};
      window.__adv = sec => { for (let i = 0, n = Math.round(sec / 0.05); i < n; i++) { now += 50; frame(now); } }; });
    await p.waitForTimeout(2500); await p.evaluate(() => window.__sync());
    const cdp = await ctx.newCDPSession(p), adv = s => p.evaluate(x => window.__adv(x), s);
    const stroke = async (pts, hold) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1], id: 1 }] });
      for (let i = 1; i <= 20; i++) { const f = i / 20 * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(f)), u = f - k; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pts[k][0] + (pts[k + 1][0] - pts[k][0]) * u, y: pts[k][1] + (pts[k + 1][1] - pts[k][1]) * u, id: 1 }] }); await adv(0.05); }
      await adv(hold); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await adv(1.2); };
    const st = () => p.evaluate(() => { const box = document.getElementById('hintSwipe'), vis = [...box.querySelectorAll('.hDot')].filter(e => e.style.display !== 'none');
      return { z: game.S.z, x: game.S.x, yaw: game.S.yaw, hint: !box.classList.contains('hidden'), dots: vis.length, dy: vis.length ? parseFloat(vis[0].style.top) : 0 }; });
    const dy = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    await adv(2);                                                                    // 前へ 1 回（田んぼのまん中あたり。畦は遠い・前に耕す所も残っている）
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 481, id: 1 }] });
    for (let i = 1; i <= 20; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 481 - 84 * i / 20, id: 1 }] }); await adv(0.05); }
    await adv(2.5); const sH = await st(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await adv(0.2);
    let s0 = await st(); const vR = await p.evaluate(() => game.S.v);
    ok('前へ なぞって 置いた指の間と、離した すぐあと（まだ動いている 0.2 秒）は 見本を出さない', !sH.hint && !s0.hint && vR > 0.05, [sH.hint, s0.hint, +vR.toFixed(2)]);
    let tS = 0.2, tStop = null; for (; tS < 6 && !(s0.hint && s0.dots >= 1); tS += 0.05) { await adv(0.05); s0 = await st(); if (tStop === null && await p.evaluate(() => Math.abs(game.S.v) < 0.05)) tStop = tS; }   // 離してから止まりきるまでは 0.4〜1.3 秒（速さと作業機の上げ下げで変わる）。見本までの待ちは 止まってから数える
    ok('止まっていると なぞり方の見本が出る（止まって 0.6 秒以内。サイクル265 は 2 秒待ち → サイクル267 で 0.4 秒待ち）', s0.hint && tStop !== null && tS - tStop <= 0.6, [s0.hint, +tS.toFixed(2), tStop && +tStop.toFixed(2)]);
    await adv(1.0); s0 = await st();
    await stroke([[195, 321], [273, 317], [363, 313]], 4.0);                         // 見える地面の帯（ボンネットの上）を 横へ
    let s = await st();
    ok('見える地面を横へ なぞると 向きが変わる（20° 以上）', dy(s.yaw, s0.yaw) > 0.35, +dy(s.yaw, s0.yaw).toFixed(2));
    await p.evaluate(() => Object.assign(game.S, { x: 0, z: 17.6, yaw: 0, v: 0, steer: 0 }));   // 持ち主の場面：白線（z=14）をこえた先・畦（z=25）の手前で止まっている
    await adv(1); s = await st();
    for (let i = 0; i < 25 && !(s.hint && s.dots >= 4); i++) { await adv(0.2); s = await st(); }
    ok('前に耕す所がないまま止まっていると「横へ なぞる」見本が出る（5 秒以内）', s.hint && s.dots >= 4 && s.dy < 422, [s.hint, s.dots, Math.round(s.dy)]);
    await p.evaluate(() => Object.assign(game.S, { x: -11.2, z: 23.6, yaw: -1.69, v: 0, steer: 0 })); await adv(1); s0 = await st();   // 畦のかど（実測で動けなくなった所）
    for (let i = 0; i < 4; i++) await stroke([[195, 330], [280, 328], [360, 322]], 4.0);
    s = await st();
    ok('畦のかどからも 田んぼの側へ なぞれば ぬけられる（下がってから切る）', dy(s.yaw, s0.yaw) > 0.5 && Math.hypot(s.x - s0.x, s.z - s0.z) > 2, [+dy(s.yaw, s0.yaw).toFixed(2), +Math.hypot(s.x - s0.x, s.z - s0.z).toFixed(1)]);
    // サイクル263（Codex 指摘 1）: 畦のかどから下がっている とちゅうで はまったら（S.stuck）、そこで止まる
    await p.evaluate(() => Object.assign(game.S, { x: -11.2, z: 23.6, yaw: -1.69, v: 0, steer: 0 })); await adv(1);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 330, id: 1 }] });
    for (let i = 1; i <= 20; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195 + 165 * i / 20, y: 330 - 8 * i / 20, id: 1 }] }); await adv(0.05); }
    let bk = false; for (let i = 0; i < 40 && !bk; i++) { await adv(0.1); bk = await p.evaluate(() => TRACE.backLeft > 0 && game.S.v < -0.3); }
    await p.evaluate(() => Object.defineProperty(game.S, 'stuck', { get: () => true, set() {}, configurable: true })); await adv(1); s0 = await st(); await adv(2); s = await st();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.evaluate(() => { delete game.S.stuck; game.S.stuck = false; }); await adv(1);
    ok('下がっている とちゅうで はまったら 止まる（サイクル263）', bk && Math.hypot(s.x - s0.x, s.z - s0.z) < 0.05, [bk, +Math.hypot(s.x - s0.x, s.z - s0.z).toFixed(2)]);
    // サイクル263（Codex 指摘 3）: 運転席でない視点から なぞり始めたとき、横なぞりの見きわめの始点は 引き直した点にそろう
    await p.evaluate(() => { Object.assign(game.S, { x: 0, z: 0, yaw: 0, v: 0, steer: 0 }); game.nextCam(); }); await adv(0.5);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 560, id: 1 }] }); await adv(0.05);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 500, id: 1 }] }); await adv(0.05);
    const rb = await p.evaluate(() => ({ on: TRACE.on, g: TRACE.g0 && [Math.round(TRACE.g0[2]), Math.round(TRACE.g0[3])], pd: TRACE.pullDone, cam: camMode }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await adv(1);
    ok('ほかの視点から なぞり始めたら 見きわめの始点も引き直す（サイクル263）', rb.on && rb.cam === 0 && rb.g && rb.g[0] === 195 && rb.g[1] === 500 && !rb.pd, rb);
    await p.evaluate(() => Object.assign(game.S, { x: 0, z: 0, yaw: 0, v: 0, steer: 0 })); await adv(6); s = await st();   // もう曲がれた人が 絵の中・前に耕す所がある所で止まっている
    // ---- サイクル265（運営者の実機の声「曲がるお手本が出ない」）：少し曲がって 絵の中で止まった人（前に刈り株が少し残っている）にも、止まって 2 秒ほどで見本が出る ----
    const cueSt = () => p.evaluate(() => { const b = document.getElementById('hintSwipe'); return { vis: !b.classList.contains('hidden') && [...b.querySelectorAll('.hDot')].some(e => e.style.display !== 'none'), side: !!HINT.turn, fwd: !!HINT.demoF }; });
    await p.evaluate(() => { if ('sideOK' in HINT) HINT.sideOK = 0; Object.assign(game.S, { x: -1.9, z: 8, yaw: -0.78, v: 0, steer: 0 }); }); await adv(0.2);   // まだ曲がり方を覚えていない人として
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 380, id: 1 }] }); await adv(0.1); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });   // いちど さわって 止まった時計を 0 から
    let cu = await cueSt(), tCue = null; ok('さわった すぐあとは 見本を出さない', !cu.vis, cu);
    for (let i = 1; i <= 40 && tCue === null; i++) { await adv(0.1); cu = await cueSt(); if (cu.vis) tCue = i / 10; }
    ok('持ち主の場面：止まって 1 秒以内に「横へ なぞる」見本が出る（サイクル265 は 3 秒以内 → サイクル267）', tCue !== null && tCue <= 1 && cu.side, [tCue, cu]);
    await adv(6.2); cu = await cueSt(); if (!cu.vis) { await adv(0.5); cu = await cueSt(); }
    ok('止まったまま 6 秒で もう片方（「前へ」）の見本に入れかわる', cu.fwd && !cu.side, cu);
    await p.evaluate(() => document.getElementById('help').classList.remove('hidden')); await adv(0.2); cu = await cueSt();
    ok('操作の表を開いている間は 見本を出さない', !cu.vis, cu);
    await p.evaluate(() => document.getElementById('help').classList.add('hidden')); await adv(2); cu = await cueSt();   // サイクル267: 0.4 秒で出て 2.6 秒で 1 まわり。3 秒後は ちょうど休み（点が消えている 0.4 秒）に当たるので、なぞりの とちゅう（2 秒後）で見る
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 380, id: 1 }] }); await adv(0.1); const touched = await cueSt(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await adv(0.5);
    ok('指がふれた しゅんかんに 見本は消える', cu.vis && !touched.vis, [cu.vis, touched.vis]);
    // Codex 指摘（PR #1076）：空を押して見回している指の間も 見本は消える・置いたままでも出ない
    await adv(3); const cuB = await cueSt();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 40, y: 175, id: 1 }] }); await adv(0.2);
    const look1 = await cueSt(), lookTr = await p.evaluate(() => TRACE.on); await adv(4); const look2 = await cueSt();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await adv(0.5);
    ok('空を押して見回している間（なぞりではない指）も 見本は消えて、置いたまま 4 秒でも出ない', cuB.vis && lookTr === false && !look1.vis && !look2.vis, [cuB.vis, lookTr, look1.vis, look2.vis]);
    // 曲がり方を覚えた人（横なぞりで 30° 以上を 3 回）には、最初の1分のあとは出さない
    await p.evaluate(() => { HINT.sideOK = 3; FIRSTMIN.finish(); Object.assign(game.S, { x: -1.9, z: 8, yaw: -0.78, v: 0, steer: 0 }); }); await adv(4); cu = await cueSt();
    ok('曲がり方を覚えた人には、最初の1分のあとは 見本を出さない', !cu.vis, cu);
    // Codex 指摘（PR #1076・2 回目）：最初の1分のあと、下のボタン（canvas の外）を押している指の間も 見本は出ない
    await p.evaluate(() => { HINT.sideOK = 0; Object.assign(game.S, { x: -1.9, z: 8, yaw: -0.78, v: 0, steer: 0 }); }); await adv(3.5); const cuP = await cueSt();
    const padBtn = await p.evaluate(() => { const vis = [...document.querySelectorAll('.pad button')].filter(e => e.getBoundingClientRect().width > 0), b = vis.find(e => e.dataset.k) || vis[0]; if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, k: b.dataset.k || b.id }; });
    if (padBtn) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: padBtn.x, y: padBtn.y, id: 1 }] }); await adv(0.3);
      const pad1 = await cueSt(); await adv(4); const pad2 = await cueSt(), ids = await p.evaluate(() => touchIds.size);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await adv(0.3); const ids2 = await p.evaluate(() => touchIds.size); await adv(3); const pad3 = await cueSt();
      ok('下のボタンを押している間も 見本は消えて、押したまま 4 秒でも出ない・離すと また出る', cuP.vis && !pad1.vis && !pad2.vis && ids === 1 && ids2 === 0 && pad3.vis, [cuP.vis, pad1.vis, pad2.vis, ids, ids2, pad3.vis]);
    } else ok('下のボタンが見える（最初の1分のあと）', false, padBtn);
    await ctx.close();
  }
  // ---- 5) お題なしで 畦のかどから切り返したあと（サイクル263・Codex 指摘 2）：同じ なぞりの中で 作業機が また下りる ----
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); p.setDefaultTimeout(180000);
    p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
    await p.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: TN + r.request().url().split('/three@0.128.0')[1], contentType: 'text/javascript' }));
    await p.goto(`http://localhost:${PORT}/tractor.html?art=none`);
    await p.waitForFunction(() => window.game && game.S && game.S.started && typeof P !== 'undefined' && P.Rotary);
    await p.evaluate(() => { const real = performance.now.bind(performance); let now = real(); performance.now = () => now; window.__sync = () => { now = real(); }; window.requestAnimationFrame = () => 0; game.renderer.render = () => {};
      window.__r = { backed: false, relow: false, say: 0 }; let last = '';
      window.__adv = sec => { for (let i = 0, n = Math.round(sec / 0.05); i < n; i++) { now += 50; frame(now); if (TRACE.backLeft > 0 && game.S.v < -0.1) __r.backed = true; if (__r.backed && TRACE.on && game.S.rotDown && game.S.v > 0.1) __r.relow = true;
        const e = document.getElementById('say'), t = e.classList.contains('off') ? '' : e.innerText; if (t !== last) { last = t; if (__r.backed && /を下げました/.test(t)) __r.say++; } } }; });
    await p.waitForTimeout(2500); await p.evaluate(() => window.__sync());
    const cdp = await ctx.newCDPSession(p), adv = s => p.evaluate(x => window.__adv(x), s);
    await adv(2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 481, id: 1 }] });
    for (let i = 1; i <= 20; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 481 - 84 * i / 20, id: 1 }] }); await adv(0.05); }
    await adv(2); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await adv(1);
    await p.evaluate(() => Object.assign(game.S, { x: -11.2, z: 23.6, yaw: -1.69, v: 0, steer: 0 })); await adv(1);
    const t0 = await p.evaluate(() => tilledCount);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 330, id: 1 }] });   // 指を置いたまま 1 回の なぞりで（離して なぞり直すと そこで下りるので）
    for (let i = 1; i <= 20; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195 + 165 * i / 20, y: 330 - 8 * i / 20, id: 1 }] }); await adv(0.05); }
    await adv(25);
    const r = await p.evaluate(() => ({ ...window.__r, tilled: tilledCount, down: game.S.rotDown }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await adv(1);
    ok('お題なし：畦のかどで 下がった', r.backed, r.backed);
    ok('お題なし：下がったあと 同じ なぞりの中で 作業機が下りて 耕せる（サイクル263）', r.relow && r.tilled > t0 + 20, [r.relow, r.tilled - t0]);
    ok('お題なし：自動で下ろすとき「…を下げました」は出さない', r.say === 0, r.say);
    await ctx.close();
  }
  // ---- 6) サイクル264：本物のタッチで（お題あり・スマホ縦）。Codex の 6→12→18→24→25px・外の視点からの横なぞり・お題ありの切り返し・短い なぞり ----
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); p.setDefaultTimeout(180000);
    p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
    await p.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: TN + r.request().url().split('/three@0.128.0')[1], contentType: 'text/javascript' }));
    await p.goto(`http://localhost:${PORT}/tractor.html`);
    await p.waitForFunction(() => window.game && game.S && game.S.started && typeof P !== 'undefined' && P.Rotary);
    await p.evaluate(() => { const real = performance.now.bind(performance); let now = real(); performance.now = () => now; window.__sync = () => { now = real(); }; window.requestAnimationFrame = () => 0; game.renderer.render = () => {};
      window.__adv = sec => { for (let i = 0, n = Math.round(sec / 0.05); i < n; i++) { now += 50; frame(now); } }; });
    await p.waitForTimeout(2500); await p.evaluate(() => window.__sync());
    const cdp = await ctx.newCDPSession(p), adv = s => p.evaluate(x => window.__adv(x), s);
    const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const st = () => p.evaluate(() => ({ x: game.S.x, z: game.S.z, yaw: game.S.yaw, down: game.S.rotDown, cam: camMode, n: TRACE.pts.length, on: TRACE.on }));
    const dy = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))), mv = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const home = async () => { await p.evaluate(() => Object.assign(game.S, { x: 0, z: 0, yaw: 0, v: 0, steer: 0 })); await adv(0.6); return st(); };
    await adv(2); await T('touchStart', 195, 481); for (let i = 1; i <= 20; i++) { await T('touchMove', 195, 481 - 84 * i / 20); await adv(0.05); } await adv(2); await T('touchEnd'); await adv(1);
    // a) Codex の並び：遠くの地面で 6→12→18→24→25px 横へ動かして 指を止める。点が入って 曲がる（止まらない）
    let a0 = await home();
    await T('touchStart', 195, 321); for (const d of [6, 12, 18, 24, 25]) { await T('touchMove', 195 + d, 321); await adv(0.05); }
    const mid = await st(); await adv(3); let a1 = await st(); await T('touchEnd'); await adv(1);
    ok('6→12→18→24→25px 横へ動かして止めた指でも 線ができて 動く', mid.n >= 1 && mv(a1, a0) > 0.5, [mid.n, +mv(a1, a0).toFixed(1), +dy(a1.yaw, a0.yaw).toFixed(2)]);
    // d) サイクル264：短い横なぞり（0.4 秒なぞって 0.6 秒で離す）でも 向きが変わる
    a0 = await home();
    await T('touchStart', 175, 321); for (let i = 1; i <= 8; i++) { await T('touchMove', 175 + 150 * i / 8, 321 - i / 4); await adv(0.05); } await adv(0.6); await T('touchEnd'); await adv(1.5); a1 = await st();
    ok('短い横なぞり（1 秒で離す）でも 向きが変わる（15° 以上・サイクル264）', dy(a1.yaw, a0.yaw) > 0.26, +dy(a1.yaw, a0.yaw).toFixed(2));
    a0 = await home();
    for (let k = 0; k < 4; k++) { await T('touchStart', 175, 321); for (let i = 1; i <= 10; i++) { await T('touchMove', 175 + 150 * i / 10 + (i % 2 ? 5 : -5), 321 + (i % 3 - 1) * 5); await adv(0.05); } await T('touchEnd'); await adv(1); }
    a1 = await st();
    ok('0.5 秒の横なぞりを 4 回（すぐ離す・ゆれあり）で 向きが変わる（30° 以上・サイクル264）', dy(a1.yaw, a0.yaw) > 0.52, +dy(a1.yaw, a0.yaw).toFixed(2));
    a0 = await home();
    await T('touchStart', 195, 380); for (let i = 1; i <= 8; i++) { await T('touchMove', 195 + (i % 2 ? 4 : -4), 380 - 60 * i / 8); await adv(0.05); } await adv(0.6); await T('touchEnd'); await adv(1.5); a1 = await st();
    ok('短い「前へ」の なぞりは 今までどおり まっすぐ', dy(a1.yaw, a0.yaw) < 0.1 && mv(a1, a0) > 0.3, [+dy(a1.yaw, a0.yaw).toFixed(2), +mv(a1, a0).toFixed(1)]);
    // e) Codex 指摘（PR #1075）：横へ なぞって 指を置いたままの間、切り返さない（指は右に置いたままなのに、とちゅうで左へ もどらない）
    a0 = await home();
    await T('touchStart', 175, 321); for (let i = 1; i <= 8; i++) { await T('touchMove', 175 + 150 * i / 8, 321); await adv(0.05); }
    { const ys = []; for (let i = 0; i < 28; i++) { await adv(0.25); ys.push((await st()).yaw); }
      const sg = a => Math.atan2(Math.sin(a), Math.cos(a)), rel = ys.map(y => sg(y - a0.yaw)), dir = Math.sign(rel[rel.length - 1]) || 1; let peak = 0, back = 0;
      for (const r of rel) { const v = r * dir; peak = Math.max(peak, v); back = Math.max(back, peak - v); }
      await T('touchEnd'); await adv(1);
      ok('横へ なぞって 7 秒 置いた指の間、向きは もどらない（もどりは 6° 未満・15° 以上 曲がる）', back < 0.1 && peak > 0.26, [+peak.toFixed(2), +back.toFixed(2)]); }
    // b) 運転席でない視点から なぞり始めて 横へ（はじめから おわりまで）：運転席にもどり、線ができて 動く
    a0 = await home(); await p.evaluate(() => game.nextCam()); await adv(0.5);
    await T('touchStart', 120, 560); await adv(0.05); for (let i = 1; i <= 10; i++) { await T('touchMove', 120 + 20 * i, 560 - 6 * i); await adv(0.05); }
    const o1 = await st(); await adv(3); a1 = await st(); await T('touchEnd'); await adv(1);
    ok('ほかの視点から始めた横なぞり：運転席にもどって 線ができ、動く', o1.cam === 0 && o1.on && o1.n >= 2 && mv(a1, a0) > 0.5 && isFinite(a1.yaw), [o1.cam, o1.n, +mv(a1, a0).toFixed(1), +dy(a1.yaw, a0.yaw).toFixed(2)]);
    // c) お題ありの切り返し：畦のかどで下がったあと、前へもどると「絵の中で下げる」決まりに渡る。大きく切って消えても また渡る
    await p.evaluate(() => Object.assign(game.S, { x: -11.2, z: 23.6, yaw: -1.69, v: 0, steer: 0 })); await adv(1);
    await T('touchStart', 195, 330); for (let i = 1; i <= 20; i++) { await T('touchMove', 195 + 165 * i / 20, 330 - 8 * i / 20); await adv(0.05); }
    let c = { backed: false, armed: false };
    for (let i = 0; i < 250 && !c.armed; i++) { await adv(0.1); c = await p.evaluate(c0 => ({ backed: c0.backed || (TRACE.backLeft > 0 && game.S.v < -0.1), armed: c0.backed && TRACE.backUp && EASY.autoUp === true && !game.S.rotDown }), c); }
    ok('お題あり：畦のかどで下がったあと、作業機を下げる係（絵の中で下げる）に渡る', c.backed && c.armed, c);
    const re = await p.evaluate(() => { EASY.autoUp = false; return TRACE.backUp; }); let again = false;
    for (let i = 0; i < 150 && !again; i++) { await adv(0.1); again = await p.evaluate(() => EASY.autoUp === true || game.S.rotDown); }
    await T('touchEnd'); await adv(1); const fin = await p.evaluate(() => TRACE.backUp);
    ok('お題あり：とちゅうで消えても また渡る・なぞりを離すと 覚えは消える', re && again && !fin, [re, again, fin]);
    // （f は b・c のあとに置く：7 秒 置く なぞりを 3 回 足すと 時間が進みすぎて、あとの b・c が はじめの 1 分の条件から外れた）
    // f) Codex 指摘（PR #1075・2 回目）：横への動きが小さい なぞり（30〜60px）でも、置いた指の間に 向きが もどらない
    for (const w of [32, 45]) {   // 60px は この並びの 3 回目に置くと 時間が進みすぎて 動かなかった（はじめの 1 分を すぎた あとの 自動の修理の止まり。前の並びでは 60px も 77° 曲がって もどり 0°）。2 つに しぼり、曲がることも見る
      a0 = await home();
      await T('touchStart', 195, 321); for (let i = 1; i <= 8; i++) { await T('touchMove', 195 + w * i / 8, 321); await adv(0.05); }
      const ys = []; for (let i = 0; i < 28; i++) { await adv(0.25); ys.push((await st()).yaw); }
      const sg = a => Math.atan2(Math.sin(a), Math.cos(a)), rel = ys.map(y => sg(y - a0.yaw)), dir = Math.sign(rel[rel.length - 1]) || 1; let peak = 0, back = 0;
      for (const r of rel) { const v = r * dir; peak = Math.max(peak, v); back = Math.max(back, peak - v); }
      await T('touchEnd'); await adv(1);
      ok('横へ ' + w + 'px の小さな なぞりを 7 秒 置いた間も、向きは もどらない（15° 以上 曲がり、もどりは 6° 未満）', back < 0.1 && peak > 0.26, [+peak.toFixed(2), +back.toFixed(2)]);
    }
    await ctx.close();
  }
  // ---- 7) サイクル266：右へ曲がって止まった あと（ハンドルは右に切れたまま・目も右へ いっている）、左へ なぞると 左へ曲がる（スマホ縦・横） ----
  // 直す前：スマホ横は 左へ なぞったのに 右へ 54°、スマホ縦は 0〜11° で まっすぐ 2.6m。寄せた横なぞりの「指の横の位置」を、目がいった ぶん（glance）ずれた地面の上で見ていた
  for (const [label, vw, vh, hy] of [['スマホ縦', 390, 844, 321], ['スマホ横', 844, 390, 164]]) {
    const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); p.setDefaultTimeout(180000);
    p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
    await p.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: TN + r.request().url().split('/three@0.128.0')[1], contentType: 'text/javascript' }));
    await p.goto(`http://localhost:${PORT}/tractor.html`);
    await p.waitForFunction(() => window.game && game.S && game.S.started && typeof P !== 'undefined' && P.Rotary);
    await p.evaluate(() => { const real = performance.now.bind(performance); let now = real(); performance.now = () => now; window.__sync = () => { now = real(); }; window.requestAnimationFrame = () => 0; game.renderer.render = () => {};
      window.__adv = sec => { for (let i = 0, n = Math.round(sec / 0.05); i < n; i++) { now += 50; frame(now); } }; });
    await p.waitForTimeout(2500); await p.evaluate(() => window.__sync());
    const cdp = await ctx.newCDPSession(p), adv = s => p.evaluate(x => window.__adv(x), s);
    const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const st = () => p.evaluate(() => ({ yaw: game.S.yaw, steer: game.S.steer, el: game.S.elapsed }));
    const sg = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b)), cx = vw / 2;
    // 人の指に近い 横なぞり：0.4 秒で 150px なぞって 1.5 秒 置いて離す
    const side = async dir => { await T('touchStart', cx - dir * 40, hy); for (let i = 1; i <= 8; i++) { await T('touchMove', cx - dir * 40 + dir * 150 * i / 8, hy); await adv(0.05); } await adv(1.5); await T('touchEnd'); await adv(1); };
    await adv(2); await T('touchStart', cx, hy + 60); for (let i = 1; i <= 10; i++) { await T('touchMove', cx, hy + 60 - 6 * i); await adv(0.05); } await adv(1.5); await T('touchEnd'); await adv(1);   // はじめの「前へ」
    const s0 = await st(); await side(1); const s1 = await st(); await side(-1); const s2 = await st();
    const r = +(sg(s1.yaw, s0.yaw) * 57.3).toFixed(0), l = +(sg(s2.yaw, s1.yaw) * 57.3).toFixed(0);
    ok(label + '：右へ なぞって 右へ曲がり（25° 以上）、ハンドルは右に切れたまま止まる', r < -25 && s1.steer > 0.4, [r, +s1.steer.toFixed(2)]);
    ok(label + '：そのあと 左へ なぞると 左へ曲がる（25° 以上・はじめの 1 分のうち・サイクル266）', l > 25 && s2.el < 60, [l, +s2.el.toFixed(0)]);
    // 2 本指で広げて拡大した あと（画角が せまい）でも、同じ横なぞりで 同じように曲がる（直す前：スマホ縦 2.2 倍で 13〜15°）
    const T2 = (type, d) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: cx - d, y: hy + 40, id: 1 }, { x: cx + d, y: hy + 40, id: 2 }] });
    await T2('touchStart', 30); for (let i = 1; i <= 8; i++) { await T2('touchMove', 30 + i * 8); await adv(0.05); } await T2('touchEnd'); await adv(0.5);
    const zm = await p.evaluate(() => { Object.assign(game.S, { x: 0, z: 0, yaw: 0, v: 0, steer: 0 }); return fovZoom; }); await adv(0.6);
    const s3 = await st(); await side(1); const s4 = await st(), z = +(sg(s4.yaw, s3.yaw) * 57.3).toFixed(0);
    ok(label + '：2 本指で拡大した あと（' + zm.toFixed(1) + ' 倍）の横なぞりでも 右へ曲がる（35° 以上・サイクル266）', zm > 1.5 && z < -35 && s4.el < 60, [z, +s4.el.toFixed(0)]);
    await ctx.close();
  }
  // ---- 8) サイクル267（運営者の実機の声「曲がり方がわからない」「お手本をすぐに出す」）：止まってから見本までの待ちを 2 秒 → 0.4 秒に ----
  // 直す前（スマホ縦・本物のタッチ・最初の 60 秒）：前へ 0.4 秒＋0.6 秒 置いて 1 秒休む人は「横へ」の見本が 35.5 秒（畦で止まる）まで 0 回、タップだけの人・0.3 秒の はじきの人は 60 秒 0 回
  for (const [label, vw, vh, yF0, yF1, yS] of [['スマホ縦', 390, 844, 481, 397, 321], ['スマホ横', 844, 390, 240, 180, 164]]) {
    const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); p.setDefaultTimeout(180000);
    p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
    await p.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: TN + r.request().url().split('/three@0.128.0')[1], contentType: 'text/javascript' }));
    await p.goto(`http://localhost:${PORT}/tractor.html`);
    await p.waitForFunction(() => window.game && game.S && game.S.started && typeof P !== 'undefined' && P.Rotary);
    await p.evaluate(() => { const real = performance.now.bind(performance); let now = real(); performance.now = () => now; window.__sync = () => { now = real(); }; window.requestAnimationFrame = () => 0; game.renderer.render = () => {};
      window.__adv = sec => { for (let i = 0, n = Math.round(sec / 0.05); i < n; i++) { now += 50; frame(now); } };
      // 見本（はじめの「前へ」のヒントは別）が見えているか・どちらか・指と速さ
      window.__c = () => { const b = document.getElementById('hintSwipe'), vis = HINT.done && !b.classList.contains('hidden') && [...b.querySelectorAll('.hDot'), document.getElementById('hintFinger')].some(e => e.style.display !== 'none'); return { vis, side: !!(HINT.turn && HINT.turn.idle), fwd: !!HINT.demoF, ids: touchIds.size, v: Math.abs(game.S.v), el: game.S.elapsed }; }; });
    await p.waitForTimeout(2500); await p.evaluate(() => window.__sync());
    const cdp = await ctx.newCDPSession(p), adv = s => p.evaluate(x => window.__adv(x), s), cx = vw / 2, C = () => p.evaluate(() => window.__c());
    const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    // なぞって（0.4 秒）置いて（hold 秒）離し、見本が見えるまで待つ。指のある間・動いている間に見えた こま数と、離してから見えるまでの秒を返す
    const play = async (x0, y0, x1, y1, hold, max = 4) => { let bad = 0, c; const look = async () => { c = await C(); if (c.vis && (c.ids > 0 || c.v >= 0.05)) bad++; };
      await T('touchStart', x0, y0); for (let i = 1; i <= 8; i++) { await T('touchMove', x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8); await adv(0.05); await look(); }
      for (let i = 0; i < Math.round(hold / 0.05); i++) { await adv(0.05); await look(); } await T('touchEnd');
      let t = null, stop = null; for (let i = 1; i <= max * 20 && t === null; i++) { await adv(0.05); await look(); if (stop === null && c.v < 0.05) stop = (i - 1) / 20; if (c.vis) t = i / 20; }
      return { w: t === null || stop === null ? null : +(t - stop).toFixed(2), t, bad, side: c.side, fwd: c.fwd, el: +c.el.toFixed(0) }; };   // w＝止まりきってから見本が見えるまでの秒（離してから止まるまでは 0.4〜1.3 秒）
    await adv(2);
    let r = await play(cx, yF0, cx, yF1, 0.6);   // 人の「前へ」：0.4 秒なぞって 0.6 秒 置く
    ok(label + '：前へ なぞって離すと、止まって 0.6 秒以内に見本が出る（直す前 2.0 秒）・指のある間と動いている間は出ない', r.w !== null && r.w <= 0.6 && r.bad === 0, r);
    ok(label + '：まだ曲がったことのない人には「横へ」の見本を先に出す（直す前は「前へ」）', r.side && !r.fwd, r);
    await adv(0.5); await T('touchStart', cx + 30, yS + 40); await adv(0.1); const down = await C(); await T('touchEnd');
    let tTap = null; for (let i = 1; i <= 60 && tTap === null; i++) { await adv(0.05); if ((await C()).vis) tTap = i / 20; }
    ok(label + '：タップだけの人にも、離して 1.2 秒以内に見本が出る（直す前 2.4 秒）・ふれている間は消える', !down.vis && tTap !== null && tTap <= 1.2, [down.vis, tTap]);
    r = await play(cx, yF0, cx, yF1, 5, 4);     // サイクル116「なぞってから待つ」：置いた指で 5 秒 待つ間は出ない
    ok(label + '：なぞって 5 秒 置いた指の間（サイクル116）は 見本を出さない・離すと 止まって 0.6 秒以内に出る', r.bad === 0 && r.w !== null && r.w <= 0.6, r);
    r = await play(cx - 40, yS, cx + 110, yS, 1.0);   // 横へ
    ok(label + '：横へ なぞって離したあとも 止まって 0.6 秒以内に出る・指のある間と動いている間は出ない', r.bad === 0 && r.w !== null && r.w <= 0.6, r);
    await p.evaluate(() => { HINT.sideOK = 3; HINT.bent = false; HINT.yaw0 = null; Object.assign(game.S, { x: -3, z: -10, yaw: 0, v: 0, steer: 0 }); __adv(0.3); }); r = await play(cx, yF0, cx, yF1, 0.6);   // サイクル269: 前に耕す所がある場所に置く（前に耕す所がないときは 覚えた人でも 0.4 秒＝下の 9）   // 曲がり方を覚えた人：今までどおり 2 秒 待つ（なぞりの合間に出さない）。はじめの向きの近くで切り返していて bent が立っていない人として（Codex 指摘 PR #1090）
    ok(label + '：曲がり方を覚えた人には、前に耕す所があれば 今までどおり 止まって 2 秒で出す（1.9〜2.3 秒）・はじめの 1 分のうち', r.bad === 0 && r.w !== null && r.w >= 1.9 && r.w <= 2.3 && r.el < 60 && r.fwd, r);
    const learnt = await p.evaluate(() => ({ bent: HINT.bent, fwd: !!HINT.demoF, ahead: HINT.workAhead(1) }));
    ok(label + '：曲がり方を覚えた人は、まだ 30° 向きが変わっていなくても、前に耕す所があれば「前へ」の見本から（Codex 指摘 PR #1090）', !learnt.ahead || learnt.fwd, learnt);
    const an = await p.evaluate(() => getComputedStyle(document.getElementById('hintSwipe')).animationName);
    ok(label + '：見本は ふわっと出る（0.1 秒で消えるときに光らない）', an === 'hintIn', an);
    await ctx.close();
  }
  // ---- 9) サイクル269（はじめの 1 分で やめる人を へらす）：読みこみを待つ間の おおい・指を離したときの旋回アップ・絵の外へ出た知らせ・覚えた人が絵の外で止まったときの見本 ----
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); p.setDefaultTimeout(180000);
    p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
    await p.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: TN + r.request().url().split('/three@0.128.0')[1], contentType: 'text/javascript' }));
    let hold = true; const gate = []; await p.route('**/*.glb', r => { if (hold) gate.push(r); else r.continue(); });   // 車体と田んぼを 止めておく（おそい回線の 待ち）
    await p.goto(`http://localhost:${PORT}/tractor.html`); await p.waitForFunction(() => typeof LOAD_ST !== 'undefined'); await p.waitForTimeout(1500);
    const lw = () => p.evaluate(() => { const e = document.getElementById('loadWait'); if (!e) return null; const cs = getComputedStyle(e), f = e.querySelector('.lwF'), r = e.getBoundingClientRect(); return { started: !!(window.game && game.S && game.S.started), load: LOAD_ST, vis: cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.9, full: r.width >= innerWidth && r.height >= innerHeight, pe: cs.pointerEvents, anim: f ? getComputedStyle(f).animationName : '', text: e.innerText.replace(/\s+/g, ' ').trim(), btn: e.querySelectorAll('button, a, input').length }; });
    const w0 = await lw();
    ok('読みこみを待つ間：画面いっぱいの おおい（なぞり方の指と 1 行）が見えている・入力は ふさがない・押す物は ない（直す前は 何も置いていない景色の 大きな三角）', !!w0 && !w0.started && w0.load === 'wait' && w0.vis && w0.full && w0.pe === 'none' && w0.anim === 'lwUp' && /なぞ/.test(w0.text) && w0.text.length <= 16 && w0.btn === 0, w0);
    hold = false; for (const r of gate) await r.continue();
    // サイクル277: 始まった しゅんかん（はじめて started を 見た こま）に もう おおいは 消えている（直す前：0.3 秒の うすれが こまで すすみ、1 秒に 1.4 こまでは 2〜3 こま＝1.4〜2.1 秒 のこった）
    await p.waitForFunction(() => window.game && game.S && game.S.started, null, { polling: 'raf' }); const w1a = await lw();
    // 読む 前に 本物の 800ms と 本物の こま 3 つを 待つ（うすれや 書きかえは こまで すすむ。本物の こまが 1 秒に 1.3〜1.7 の 機械では 800ms では 1 こまも 来ない ことが あった）
    await p.waitForFunction(() => window.game && game.S && game.S.started && typeof P !== 'undefined' && P.Rotary); await p.waitForTimeout(800); await p.evaluate(() => new Promise(r => { let n = 0; const f = () => ++n >= 3 ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }));
    const w1 = await lw();
    ok('始まった しゅんかんに おおいは もう 見えない（直す前：0.3 秒の うすれの 間 のこる）', !!w1a && w1a.started && !w1a.vis, w1a);
    ok('読みこみが終わったら おおいは消えて、そのまま始まる（はじめの画面は ない）', !!w1 && w1.started && !w1.vis, w1);
    await p.evaluate(() => { const real = performance.now.bind(performance); let now = real(); performance.now = () => now; window.__sync = () => { now = real(); }; window.requestAnimationFrame = () => 0; game.renderer.render = () => {};
      window.__adv = sec => { for (let i = 0, n = Math.round(sec / 0.05); i < n; i++) { now += 50; frame(now); } };
      window.__c = () => { const b = document.getElementById('hintSwipe'), vis = HINT.done && !b.classList.contains('hidden') && [...b.querySelectorAll('.hDot'), document.getElementById('hintFinger')].some(e => e.style.display !== 'none'); const e = document.getElementById('say'); return { vis, side: !!(HINT.turn && HINT.turn.idle), fwd: !!HINT.demoF, ids: touchIds.size, v: Math.abs(game.S.v), down: game.S.rotDown, steer: Math.abs(game.S.steer), raw: document.getElementById('toast').dataset.raw || '', say: e.classList.contains('off') ? '' : e.innerText.replace(/\s+/g, ' ').trim() }; }; });
    await p.waitForTimeout(2500); await p.evaluate(() => window.__sync());
    const cdp = await ctx.newCDPSession(p), adv = s => p.evaluate(x => window.__adv(x), s), cx = 195, C = () => p.evaluate(() => window.__c());
    const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const stroke = async (x0, y0, x1, y1, hold) => { await T('touchStart', x0, y0); for (let i = 1; i <= 8; i++) { await T('touchMove', x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8); await adv(0.05); } await adv(hold); const at = await C(); await T('touchEnd'); return at; };
    // 9-1) 横へ なぞって（0.4 秒＋1 秒 置く）離す：止まるまでの間に 旋回アップで作業機が上がらない・その知らせが出ない
    await adv(2); await stroke(cx, 481, cx, 397, 0.6); await adv(1);
    const held = await stroke(cx + 20, 321, cx - 140, 315, 1.0); let upN = 0, told = false;
    for (let i = 0; i < 24; i++) { await adv(0.05); const c = await C(); if (!c.down) upN++; if (/旋回アップ/.test(c.raw + c.say)) told = true; }
    ok('横へ なぞった指を離して止まる間：作業機は下りたまま・「旋回アップ…」の知らせは出ない（直す前は 上がって 33 字の吹き出し）', held.down && held.steer > 0.45 && upN === 0 && !told, { heldDown: held.down, steer: +held.steer.toFixed(2), upN, told });
    // 9-2) 前進キーで耕しながら大きく切ったときの旋回アップは 今までどおり
    const kb = await p.evaluate(() => { const g = game; Object.assign(g.S, { x: 0, z: -8, yaw: 0, v: 0, steer: 0 }); if (!g.S.rotDown) g.toggleRotary(); __adv(1.5); g.key.fwd = 1; __adv(1); g.key.left = 1; __adv(2); const r = { down: g.S.rotDown, raw: document.getElementById('toast').dataset.raw || '', turnUp: g.S.turnUp }; g.key.left = 0; g.key.fwd = 0; __adv(1.5); return r; });
    ok('前進キーで耕しながら大きく切ると、旋回アップは 今までどおり働く', !kb.down && /旋回アップ/.test(kb.raw), kb);
    // 9-3) 絵の外へ出るときの吹き出し：どうすればよいか（曲がって もどる）が はじめの 1 文に入っている
    await p.evaluate(() => { Object.assign(game.S, { x: 0, z: 11, yaw: 0, v: 0, steer: 0 }); __adv(0.5); });
    let art = ''; await T('touchStart', cx, 481); for (let i = 1; i <= 8; i++) { await T('touchMove', cx, 481 - 84 * i / 8); await adv(0.05); }
    for (let i = 0; i < 120 && !art; i++) { await adv(0.05); const c = await C(); if (/白線/.test(c.say)) art = c.say; } await T('touchEnd');
    ok('絵の外へ出るときの吹き出しに「曲がって 絵の中へ」が入っている・24 字まで（直す前は「白線をこえるので ロータリーを上げました」だけ）', /曲がって/.test(art) && /絵の中/.test(art) && art.length <= 24, art);
    // 9-4) 曲がり方を覚えた人（sideOK 3）が 絵の外で 前へ なぞって止まった：止まって 0.6 秒以内に「横へ」の見本（直す前は 2 秒＝1 秒おきの なぞりの合間には出ない）
    const pre = await p.evaluate(() => { Object.assign(game.S, { x: 7.7, z: 1.9, yaw: 153 / 57.3, v: 0, steer: 0 }); HINT.sideOK = 3; HINT.bent = true; __adv(0.3); return { sd: +ART.sdAt(game.S.x, game.S.z).toFixed(1), ahead: HINT.workAhead(1), art: ART.on }; });
    await T('touchStart', cx, 481); for (let i = 1; i <= 8; i++) { await T('touchMove', cx, 481 - 84 * i / 8); await adv(0.05); } await adv(0.6); await T('touchEnd');
    let stop = null, t = null, side = false, bad = 0; for (let i = 1; i <= 60 && t === null; i++) { await adv(0.05); const c = await C(); if (c.vis && c.v >= 0.05) bad++; if (stop === null && c.v < 0.05) stop = (i - 1) / 20; if (c.vis) { t = i / 20; side = c.side; } }
    const ahead2 = await p.evaluate(() => HINT.workAhead(1));
    ok('曲がり方を覚えた人が 絵の外で止まった：止まって 0.6 秒以内に「横へ」の見本が出る・動いている間は出ない（直す前 2.0 秒）', pre.art && pre.sd > 0.4 && !ahead2 && t !== null && stop !== null && t - stop <= 0.6 && side && bad === 0, { pre, ahead2, stop, t, side, bad });
    await ctx.close();
  }
  {   // Codex 指摘（PR #1095）：three が 読みこめない とき、読みこみの おおいが 消えて 知らせが 出る
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }), p = await ctx.newPage();
    await p.route('https://cdn.jsdelivr.net/**', r => /three\.min\.js/.test(r.request().url()) ? r.abort() : r.fulfill({ path: TN + r.request().url().split('/three@0.128.0')[1], contentType: 'text/javascript' }));
    await p.goto(`http://localhost:${PORT}/tractor.html`).catch(() => {}); await p.waitForTimeout(1500);
    const lw = await p.evaluate(() => { const w = document.getElementById('loadWait'), t = document.getElementById('toast'); return { off: w.classList.contains('off'), toast: t ? t.textContent : '' }; });
    ok('three が 読みこめない とき、読みこみの おおいは 消えて「うまく 読みこめませんでした」と 出る', lw.off && /読みこめませんでした/.test(lw.toast), lw);
    await ctx.close();
  }
  // ---- 10) サイクル271（おそい回線・おそい スマホ）：three を待つ間も おおいが見える・読みこみの 進みぐあいの 線・読みこみ中に置いた指の なぞりを 捨てない ----
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); p.setDefaultTimeout(180000);
    p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
    const full = r => r.fulfill({ path: TN + r.request().url().split('/three@0.128.0')[1], contentType: 'text/javascript' });
    let holdJs = true, holdF = true; const gateJs = [], gateF = [];
    await p.route('https://cdn.jsdelivr.net/**', r => { if (holdJs && /three\.min\.js/.test(r.request().url())) gateJs.push(r); else full(r); });   // three.min.js を 止めておく（おそい回線）
    await p.route('**/field_tanbo*.glb', r => { if (holdF) gateF.push(r); else r.continue(); });                                                    // 田んぼ（いちばん大きい）を 止めておく
    await p.goto(`http://localhost:${PORT}/tractor.html`, { waitUntil: 'commit' }); await p.waitForTimeout(1500);
    // 10-1) three.min.js が まだ届かない間：おおいは もう見えている（直す前は body が始まらず まっ白）
    const a0 = await p.evaluate(() => { const e = document.getElementById('loadWait'); if (!e) return { el: false, three: !!window.THREE }; const cs = getComputedStyle(e), r = e.getBoundingClientRect(); return { el: true, three: !!window.THREE, vis: cs.visibility !== 'hidden' && +cs.opacity > 0.9, full: r.width >= innerWidth && r.height >= innerHeight, text: e.innerText.replace(/\s+/g, ' ').trim() }; });
    ok('three.min.js を待つ間も 読みこみの おおいが見えている（直す前は まっ白）', a0.el && !a0.three && a0.vis && a0.full && /なぞ/.test(a0.text), a0);
    holdJs = false; for (const r of gateJs) await full(r);
    await p.waitForFunction(() => typeof TRACE !== 'undefined' && typeof LOAD_ST !== 'undefined'); await p.waitForTimeout(2500);
    // 10-2) 車体と作業機は届いた・田んぼは まだ：進みぐあいの 線が 途中まで のびている。押す物は ない
    const bar = () => p.evaluate(() => { const e = document.getElementById('lwBar'); if (!e) return null; const w = document.getElementById('loadWait'); return { pct: parseFloat(e.style.width) || 0, px: e.getBoundingClientRect().width, track: e.parentElement.getBoundingClientRect().width, started: !!game.S.started, btn: w.querySelectorAll('button, a, input').length, pe: getComputedStyle(w).pointerEvents, text: w.innerText.replace(/\s+/g, ' ').trim() }; });
    const b0 = await bar();
    ok('田んぼを待つ間：進みぐあいの 線が 途中まで（15〜70%）のびている・押す物も 文字の追加も ない（直す前は 線が ない）', !!b0 && !b0.started && b0.pct > 15 && b0.pct < 70 && b0.px > 10 && b0.px < b0.track && b0.btn === 0 && b0.pe === 'none' && b0.text.length <= 16, b0);
    // 10-3) 読みこみ中に 前へ なぞって 指を置いたまま待つ：目の向きは変わらない → 始まったら その なぞりで 動きだす（直す前は 目が上を向き、なぞり直すまで 動かない）
    const cdp = await ctx.newCDPSession(p), T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await T('touchStart', 195, 481); for (let i = 1; i <= 8; i++) { await T('touchMove', 195, 481 - 84 * i / 8); await p.waitForTimeout(40); }
    const l0 = await p.evaluate(() => ({ yaw: look.yaw, pitch: look.pitch, on: TRACE.on, started: !!game.S.started }));
    ok('読みこみ中の なぞりで 目の向きは変わらない（直す前は 上へ 0.3rad）', !l0.started && l0.yaw === 0 && l0.pitch === 0 && !l0.on, l0);
    holdF = false; for (const r of gateF) await r.continue();
    await p.waitForFunction(() => window.game && game.S && game.S.started && typeof P !== 'undefined' && P.Rotary); await p.waitForTimeout(1500);
    await p.evaluate(() => { const real = performance.now.bind(performance); let now = real(); performance.now = () => now; window.__sync = () => { now = real(); }; window.requestAnimationFrame = () => 0; game.renderer.render = () => {};
      window.__adv = sec => { for (let i = 0, n = Math.round(sec / 0.05); i < n; i++) { now += 50; frame(now); } }; });
    await p.waitForTimeout(2500); await p.evaluate(() => window.__sync());
    const adv = sec => p.evaluate(x => window.__adv(x), sec), st = () => p.evaluate(() => ({ on: TRACE.on, v: +game.S.v.toFixed(2), z: +game.S.z.toFixed(2), tilled: tilledCount, yaw: look.yaw, pitch: look.pitch, bar: document.getElementById('loadWait').classList.contains('off') }));
    const z0 = (await st()).z; await adv(4); const h1 = await st();
    ok('指を置いたまま 始まったら、読みこみ中の なぞりで 動きだして 耕す（直す前は 動かない）', h1.on && h1.z - z0 > 1 && h1.tilled > 50 && h1.pitch === 0 && h1.bar, { z0, ...h1 });
    await T('touchEnd'); await adv(1.5); const h2 = await st();
    ok('指を離すと 止まる（サイクル116 のまま）', !h2.on && Math.abs(h2.v) < 0.05, h2);
    await ctx.close();
  }
  {   // 10-4) 読みこみ中に なぞって 離した指は、始まっても 何もしない（離すと止まる＝サイクル116 のまま）。そのあとの ふつうの なぞりは 今までどおり効く
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); p.setDefaultTimeout(180000);
    p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
    await p.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: TN + r.request().url().split('/three@0.128.0')[1], contentType: 'text/javascript' }));
    let hold = true; const gate = []; await p.route('**/field_tanbo*.glb', r => { if (hold) gate.push(r); else r.continue(); });
    await p.goto(`http://localhost:${PORT}/tractor.html`); await p.waitForFunction(() => typeof TRACE !== 'undefined' && typeof LOAD_ST !== 'undefined'); await p.waitForTimeout(800);
    const cdp = await ctx.newCDPSession(p), T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await T('touchStart', 195, 481); for (let i = 1; i <= 8; i++) { await T('touchMove', 195, 481 - 84 * i / 8); await p.waitForTimeout(40); } await T('touchEnd');
    hold = false; for (const r of gate) await r.continue();
    await p.waitForFunction(() => window.game && game.S && game.S.started && typeof P !== 'undefined' && P.Rotary); await p.waitForTimeout(1500);
    await p.evaluate(() => { const real = performance.now.bind(performance); let now = real(); performance.now = () => now; window.__sync = () => { now = real(); }; window.requestAnimationFrame = () => 0; game.renderer.render = () => {};
      window.__adv = sec => { for (let i = 0, n = Math.round(sec / 0.05); i < n; i++) { now += 50; frame(now); } }; });
    await p.waitForTimeout(2500); await p.evaluate(() => window.__sync());
    const adv = sec => p.evaluate(x => window.__adv(x), sec), st = () => p.evaluate(() => ({ on: TRACE.on, v: +game.S.v.toFixed(2), z: +game.S.z.toFixed(2), tilled: tilledCount, yaw: look.yaw, pitch: look.pitch }));
    const z0 = (await st()).z; await adv(3); const r1 = await st();
    ok('読みこみ中に 離した指は、始まっても 何もしない・目の向きも そのまま', !r1.on && Math.abs(r1.v) < 0.05 && Math.abs(r1.z - z0) < 0.05 && r1.yaw === 0 && r1.pitch === 0, { z0, ...r1 });
    await T('touchStart', 195, 481); for (let i = 1; i <= 8; i++) { await T('touchMove', 195, 481 - 84 * i / 8); await adv(0.05); } await adv(3); const r2 = await st(); await T('touchEnd');
    ok('そのあとの ふつうの なぞりは 今までどおり効く', r2.on && r2.z - z0 > 1 && r2.tilled > 50, r2);
    await ctx.close();
  }
  {   // Codex 指摘（PR #1100）：読みこみ中の なぞりは、タブを はなれたら 捨てる・おぼえた 指と 同じ 指の ときだけ 使う
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../../../tractor.html'), 'utf8');
    ok('読みこみ中に おぼえた なぞりは、タブを はなれたら 捨て、同じ 指が 置かれた まま の ときだけ 使う（コードの 形）',
      src.includes("addEventListener('blur', () => PRE.clear());") && src.includes("document.addEventListener('visibilitychange', () => { if (document.hidden) PRE.clear(); });") && src.includes('!viewPts.has(id)'), null);
  }
  // ---- 11) サイクル272（はじめの 1 分で やめる人を へらす）：なぞった指の あと が 画面に出る・吹き出しが 大きな数字に かぶらない ----
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); p.setDefaultTimeout(180000);
    p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
    await p.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: TN + r.request().url().split('/three@0.128.0')[1], contentType: 'text/javascript' }));
    await p.goto(`http://localhost:${PORT}/tractor.html`);
    await p.waitForFunction(() => window.game && game.S && game.S.started && typeof P !== 'undefined' && P.Rotary);
    await p.evaluate(() => { const real = performance.now.bind(performance); let now = real(); performance.now = () => now; window.__sync = () => { now = real(); }; window.requestAnimationFrame = () => 0; game.renderer.render = () => {};
      window.__adv = sec => { for (let i = 0, n = Math.round(sec / 0.05); i < n; i++) { now += 50; frame(now); } }; });
    await p.waitForTimeout(2500); await p.evaluate(() => window.__sync());
    const cdp = await ctx.newCDPSession(p), adv = sec => p.evaluate(x => window.__adv(x), sec), T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const dots = () => p.evaluate(() => { const bx = document.getElementById('traceDots'), d = bx ? [...bx.querySelectorAll('.tDot')].filter(e => e.style.display === 'block').map(e => [parseFloat(e.style.left), parseFloat(e.style.top)]) : [];
      return { box: !!bx, on: !!bx && !bx.classList.contains('off'), n: d.length, d, pe: bx ? getComputedStyle(bx).pointerEvents : '', text: bx ? bx.textContent.length : -1, z: +game.S.z.toFixed(2), v: +game.S.v.toFixed(2), trace: TRACE.on }; });
    await adv(2); const z0 = (await dots()).z;
    // 11-1) タップだけ：さわった所に 点が 1 つ出る（直す前は 何も出ない）。トラクターは 今までどおり 進まない（離すと止まる＝サイクル116）
    await T('touchStart', 235, 422); await adv(0.1); await T('touchEnd'); await adv(0.2); const t1 = await dots();
    ok('タップ：さわった所に 黄色い点が 1 つ出る・押す物でも 文字でも ない（直す前は 何も出ない）', t1.on && t1.n === 1 && Math.abs(t1.d[0][0] - 235) < 1 && Math.abs(t1.d[0][1] - 422) < 1 && t1.pe === 'none' && t1.text === 0, t1);
    await adv(1.0); const t2 = await dots();
    ok('タップのあと：点は 消える・トラクターは 進んでいない（サイクル116 のまま）', !t2.on && Math.abs(t2.z - z0) < 0.15 && Math.abs(t2.v) < 0.05, { z0, ...t2 });
    // 11-2) 見本の高さ（ボンネットの上）を 前へ なぞる：指の道すじに 点が ならぶ（直す前は 地面の線が ボンネットに かくれて 何も見えない）
    await T('touchStart', 195, 481); for (let i = 1; i <= 10; i++) { await T('touchMove', 195, 481 - 84 * i / 10); await adv(0.05); } await p.waitForTimeout(150); const s1 = await dots();   // さいごの指の動きが ページに届くのを待つ
    ok('前へ なぞる：指の道すじに 点が 4 つ以上 ならび、いちばん新しい点は 指の 16px 以内', s1.on && s1.n >= 4 && s1.n <= 24 && s1.d.every(q => Math.abs(q[0] - 195) < 1 && q[1] <= 481.5 && q[1] >= 396.5) && Math.min(...s1.d.map(q => q[1])) < 397 + 16, s1);
    // 11-3) 置いて待つ間は 点を 出したままに しない（0.6 秒で消える）。トラクターは なぞりを追って進む（サイクル116 のまま）
    await adv(1.0); const s2 = await dots();
    ok('置いて待つ間：点は 消え、トラクターは なぞりを追って進む', !s2.on && s2.trace && s2.z - z0 > 0.5, { z0, ...s2 });
    await T('touchEnd'); await adv(1.5); const s3 = await dots();
    ok('指を離すと 止まる（サイクル116 のまま）', !s3.trace && Math.abs(s3.v) < 0.05, s3);
    // 11-4) 吹き出しが 左上の 大きな数字に かぶらない（直す前は 12 字より長い吹き出しの 左はしが 数字の下に 58px 入る）。数字の大きさは 変えない
    const say = async txt => { await p.evaluate(x => toast(x, 4), txt); await adv(0.1); return p.evaluate(() => { const s = document.getElementById('say'), a = s.getBoundingClientRect(), rg = document.createRange(), bp = document.getElementById('bigPct'); rg.selectNodeContents(bp); const c = rg.getBoundingClientRect();
      return { on: !s.classList.contains('off'), text: s.innerText, sayL: Math.round(a.left), sayR: Math.round(a.right), sayT: Math.round(a.top), sayB: Math.round(a.bottom), pad: parseFloat(getComputedStyle(s).paddingLeft), numR: Math.round(c.right), numB: Math.round(c.bottom), font: getComputedStyle(bp).fontSize, shown: getComputedStyle(bp).display !== 'none' }; }); };
    for (const txt of ['🔰 白線の外は 耕しません、曲がって絵の中へ', 'カラスが近づいたら、ムクドリの群れが いっせいに飛び立った']) {
      const r = await say(txt);
      ok('スマホ縦：吹き出し「' + txt.slice(0, 8) + '…」の文字が 大きな数字（56px）に かぶらない', r.on && r.text.length > 12 && r.shown && r.font === '56px' && r.sayT < r.numB && r.sayL + r.pad >= r.numR && r.sayR - r.sayL >= 120, r);
      await adv(5);
    }
    // 11-5) 1 分を すぎたら 指の点は 出さない（はじめの 1 分だけ）。なぞりは 今までどおり効く
    await p.evaluate(() => FIRSTMIN.finish()); const z1 = (await dots()).z;
    await T('touchStart', 195, 481); for (let i = 1; i <= 10; i++) { await T('touchMove', 195, 481 - 84 * i / 10); await adv(0.05); } await p.waitForTimeout(150); const o1 = await dots(); await adv(1.5); const o2 = await dots(); await T('touchEnd');
    ok('1 分を すぎたら 指の点は 出ない・なぞりは 今までどおり効く', !o1.on && o2.trace && o2.z - z1 > 0.5, { z1, on: o1.on, z: o2.z });
    await ctx.close();
  }
  {   // 11-6) スマホ横・パソコンの幅では 吹き出しは 今までどおり 240px まで
    const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); p.setDefaultTimeout(180000);
    p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
    await p.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: TN + r.request().url().split('/three@0.128.0')[1], contentType: 'text/javascript' }));
    await p.goto(`http://localhost:${PORT}/tractor.html`);
    await p.waitForFunction(() => window.game && game.S && game.S.started && typeof P !== 'undefined' && P.Rotary);
    await p.evaluate(() => { const real = performance.now.bind(performance); let now = real(); performance.now = () => now; window.__sync = () => { now = real(); }; window.requestAnimationFrame = () => 0; game.renderer.render = () => {};
      window.__adv = sec => { for (let i = 0, n = Math.round(sec / 0.05); i < n; i++) { now += 50; frame(now); } }; });
    await p.waitForTimeout(2500); await p.evaluate(() => window.__sync()); await p.evaluate(() => window.__adv(2));
    const r = await p.evaluate(() => { toast('🔰 白線の外は 耕しません、曲がって絵の中へ', 4); window.__adv(0.1); const s = document.getElementById('say'), a = s.getBoundingClientRect(), rg = document.createRange(); rg.selectNodeContents(document.getElementById('bigPct')); const c = rg.getBoundingClientRect();
      return { on: !s.classList.contains('off'), w: Math.round(a.width), maxW: getComputedStyle(s).maxWidth, sayL: Math.round(a.left), numR: Math.round(c.right) }; });
    ok('スマホ横：吹き出しの幅は 今までどおり（240px まで）・数字に かぶらない', r.on && r.maxW === '240px' && r.w > 200 && r.sayL > r.numR, r);
    await ctx.close();
  }
  // ---- 12) サイクル273（はじめの 1 分で やめる人を へらす）：白線の外へ出たら 畦に着く前から、指を置いたままでも「横へ なぞる」見本 ----
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); p.setDefaultTimeout(180000);
    p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
    await p.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: TN + r.request().url().split('/three@0.128.0')[1], contentType: 'text/javascript' }));
    await p.goto(`http://localhost:${PORT}/tractor.html`);
    await p.waitForFunction(() => window.game && game.S && game.S.started && typeof P !== 'undefined' && P.Rotary);
    await p.evaluate(() => { const real = performance.now.bind(performance); let now = real(); performance.now = () => now; window.__sync = () => { now = real(); }; window.requestAnimationFrame = () => 0; game.renderer.render = () => {};
      window.__adv = sec => { for (let i = 0, n = Math.round(sec / 0.05); i < n; i++) { now += 50; frame(now); } }; });
    await p.waitForTimeout(2500); await p.evaluate(() => window.__sync());
    let down = false;   // 指が ふれているか（離れている指を もう一度 離さない＝直す前のコードで 確かめが とちゅうで止まらないように）
    const cdp = await ctx.newCDPSession(p), adv = sec => p.evaluate(x => window.__adv(x), sec), T = async (type, x, y) => { if (type === 'touchEnd' && !down) return; down = type !== 'touchEnd'; await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] }); };
    const st = () => p.evaluate(() => { const S = game.S, box = document.getElementById('hintSwipe'), vis = [...box.querySelectorAll('.hDot')].filter(e => e.style.display !== 'none').map(e => [parseFloat(e.style.left), parseFloat(e.style.top)]), o = ART.score();
      return { x: +S.x.toFixed(2), z: +S.z.toFixed(2), yaw: +S.yaw.toFixed(3), v: +S.v.toFixed(2), rot: S.rotDown, til: tilledCount, over: +o.over.toFixed(2), out: ART.sdAt(S.x, S.z) > 0.4, trace: TRACE.on, blk: TRACE.blockT > 0, turn: !!HINT.turn, shown: !!HINT.turn && !box.classList.contains('hidden'),
        side: !box.classList.contains('hidden') && vis.length >= 2 && Math.abs(vis[vis.length - 1][0] - vis[0][0]) > 40, dir: vis.length >= 2 ? Math.sign(vis[vis.length - 1][0] - vis[0][0]) : 0, y0: vis.length ? Math.round(vis[0][1]) : 0, pe: getComputedStyle(box).pointerEvents, say: document.getElementById('say').classList.contains('off') ? '' : document.getElementById('say').innerText }; });
    const fwdDown = async () => { await T('touchStart', 195, 481); for (let i = 1; i <= 10; i++) { await T('touchMove', 195, 481 - 84 * i / 10); await adv(0.05); } };   // 見本と同じ「前へ」を 0.5 秒で なぞって 指は置いたまま
    const set = o => p.evaluate(x => { Object.assign(game.S, { v: 0, steer: 0 }, x); }, o);
    // 12-1) 前へ なぞって 置くだけの人：白線の外へ出て 2.5 秒以内・畦に着く前に、指を置いたままでも「横へ なぞる」見本が出る（直す前は 畦で止められるまで 出ない）
    await adv(2); let s = await st(), tOut = null, tSide = null, sS = null, t = 0, moved = true;
    for (let n = 0; n < 8 && tSide === null && !s.blk; n++) {
      await fwdDown(); t += 0.5;
      for (let i = 0; i < 40 && tSide === null && !s.blk; i++) { await adv(0.1); t += 0.1; s = await st(); if (tOut === null && s.out) tOut = t; if (s.side && s.trace) { tSide = t; sS = s; } }
      if (tSide === null) { await T('touchEnd'); await adv(1); t += 1; }
    }
    ok('白線の外へ出たら、指を置いたままでも 2.5 秒以内に「横へ なぞる」見本が出る（直す前は 畦で止められるまで 出ない）', tOut !== null && tSide !== null && tSide - tOut <= 2.5 && sS.pe === 'none', [tOut && +tOut.toFixed(1), tSide && +tSide.toFixed(1), sS && sS.pe]);
    ok('見本が出るのは 畦に着く前（まだ走っている・止められていない）で、見本は 画面の上半分から', !!sS && sS.v > 0.3 && !sS.blk && sS.z < 19.5 && sS.y0 > 0 && sS.y0 < 422, sS && [sS.z, sS.v, sS.blk, sS.y0]);
    // 12-2) 見本は見せるだけ：トラクターは 今までどおり まっすぐ進む（勝手に曲がらない）
    await adv(0.5); let s2 = await st();
    ok('見本が出ても トラクターは まっすぐ進む（向きは変えない）', !!sS && Math.abs(s2.yaw - sS.yaw) < 0.05 && Math.abs(s2.yaw) < 0.1 && (s2.z > sS.z + 0.2 || s2.blk), sS && [sS.yaw, s2.yaw, sS.z, s2.z]);
    // 12-3) 指を離して止まるまでの間も 見本は とぎれない（止まって 0.4 秒で「止まった人への見本」に かわる）。離すと止まるのは 今までどおり（サイクル116）
    await T('touchEnd'); let gap = 0, seen = 0; for (let i = 0; i < 25; i++) { await adv(0.1); s = await st(); if (!s.shown) gap++; else seen++; }
    ok('指を離してから 2.5 秒：見本は 出たまま・トラクターは 止まる', gap === 0 && seen === 25 && Math.abs(s.v) < 0.05 && !s.trace, [gap, seen, s.v]);
    // 12-4) なぞりで ない指（空を押して まわりを見る）の間は 消える。その指を離すと また出る
    await set({ x: 3, z: 15.5, yaw: 0 }); await adv(0.3); await fwdDown(); for (let i = 0; i < 15 && !(s.side && s.trace); i++) { await adv(0.1); s = await st(); }
    const g0 = s; await T('touchEnd'); await adv(0.1); const g1 = await st(); await T('touchStart', 40, 175); await adv(0.15); const g2 = await st(); await adv(1.5); const g3 = await st(); await T('touchEnd'); await adv(2.5); const g4 = await st();
    ok('まわりを見る指の間は 見本を出さない・離すと また出る', g0.side && g1.shown && !g2.shown && !g3.shown && g4.shown, [g0.side, g1.shown, g2.shown, g3.shown, g4.shown]);
    // 12-5) 絵の中で なぞりはじめたら 今までどおり すぐ下ろす（作業機の下ろし方は 変えていない）
    await set({ x: -5, z: 0, yaw: 0, rotDown: false }); await adv(1.0); await T('touchStart', 195, 481); await adv(0.1); const c1 = await st(); await T('touchEnd'); await adv(1.0);
    ok('絵の中で なぞりはじめたら 今までどおり すぐ下ろす', c1.rot && !c1.out, [c1.rot, c1.out]);
    // 12-6) 🔰（かんたんアシスト）を切っている人は 白線の外でも 今までどおり なぞりはじめに下ろす
    await p.evaluate(() => { EASY.on = false; }); await set({ x: 3, z: 16.5, yaw: 0, rotDown: false }); await adv(1.0); await T('touchStart', 195, 481); await adv(0.1); const e1 = await st(); await T('touchEnd'); await adv(1.0); await p.evaluate(() => { EASY.on = true; });
    ok('🔰 を切っている人は 白線の外でも 今までどおり なぞりはじめに下ろす', e1.rot && e1.out, [e1.rot, e1.out]);
    // 12-7) 曲がり方を覚えた人（横なぞりで 30° 以上を 3 回）には、なぞっている間の見本は出さない（今までどおり）
    await p.evaluate(() => { HINT.sideOK = 3; }); await set({ x: -3, z: 15.5, yaw: 0, rotDown: false }); await adv(0.5); await fwdDown(); let any = false; for (let i = 0; i < 15; i++) { await adv(0.1); s = await st(); if (s.shown && !s.blk) any = true; } await T('touchEnd'); await adv(1.0);
    ok('曲がり方を覚えた人には、白線の外を なぞっている間の見本は出さない', !any && s.z > 16.5, [any, s.z]);
    await ctx.close();
  }
  // ---- 13) サイクル274（はじめの 1 分で やめる人を へらす）：1 こまが おそい スマホでは 3D の絵の こまかさを 自分で 下げる（LITE）。動き・文字・数字は 変えない ----
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const open = async qs => { const p = await ctx.newPage(); p.setDefaultTimeout(180000);
      p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
      await p.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: TN + r.request().url().split('/three@0.128.0')[1], contentType: 'text/javascript' }));
      await p.goto(`http://localhost:${PORT}/tractor.html${qs}`);
      await p.waitForFunction(() => window.game && game.S && game.S.started && typeof P !== 'undefined' && P.Rotary);
      // 1 こまの 長さ（ミリ秒）を 変えられる にせの時計。ms＝1 こまの 本物の ミリ秒（50＝1 秒に 20 こま・100＝10 こま）
      await p.evaluate(() => { const real = performance.now.bind(performance); let now = real(); performance.now = () => now; window.__sync = () => { now = real(); }; window.requestAnimationFrame = () => 0; game.renderer.render = () => {};
        window.__adv = (sec, ms = 50) => { for (let i = 0, n = Math.round(sec * 1000 / ms); i < n; i++) { now += ms; frame(now); } };
        window.__mix = (n, ms, every, big) => { for (let i = 0; i < n; i++) { now += i % every === every - 1 ? big : ms; frame(now); } }; });
      await p.waitForTimeout(2500); await p.evaluate(() => window.__sync());
      // ここまでの 本物の こま（swiftshader は 1 こま 1 秒ほど）で もう 下がっていたら、はじめの形に もどしてから はかる
      await p.evaluate(() => { window.__adv(2); renderer.setPixelRatio(1.5); if (typeof LITE !== 'undefined') { LITE.lv = 0; LITE.clear(); } });
      return p; };
    const p = await open('');
    const st = () => p.evaluate(() => { const cv = document.getElementById('view'), r = cv.getBoundingClientRect(), big = document.getElementById('bigPct'), hb = document.getElementById('hintSwipe'), d = hb.querySelector('.hDot');
      return { pr: renderer.getPixelRatio(), w: cv.width, css: Math.round(r.width) + 'x' + Math.round(r.height), font: getComputedStyle(big).fontSize, hint: !hb.classList.contains('hidden'), hx: d ? Math.round(parseFloat(d.style.left)) : 0, z: +game.S.z.toFixed(2), til: tilledCount }; });
    const adv = (sec, ms) => p.evaluate(([x, y]) => window.__adv(x, y), [sec, ms || 50]);
    // 13-1) 1 秒に 20 こま出る スマホ：下げない
    await adv(6, 50); let s = await st();
    ok('1 秒に 20 こま出ていれば 絵の こまかさは 下げない', s.pr === 1.5 && s.w === 585, [s.pr, s.w]);
    // 13-2) たまの 引っかかり（5 こまに 1 回 0.3 秒）と、長い 1 こま（5 秒＝ほかの アプリから もどった）：下げない
    await p.evaluate(() => { window.__mix(100, 50, 5, 300); window.__mix(1, 5000, 1, 5000); window.__mix(60, 50, 5, 300); }); s = await st();
    ok('たまの 引っかかり・長い 1 こまでは 下げない', s.pr === 1.5, s.pr);
    // 13-3) かくれている間（document.hidden）は 数えない
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); window.__adv(4, 100); }); s = await st();
    const hid = s.pr; await p.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    ok('かくれている間の おそい こまでは 下げない', hid === 1.5, hid);
    // 13-4) 1 秒に 10 こましか出ない スマホ：4 秒以内に 1 だん下げる（1.5 → 1）。画面の大きさ・数字・見本の場所は そのまま（直す前は 下がらない）
    const h0 = await st(); await adv(4, 100); s = await st();
    ok('1 秒に 10 こまの スマホ：4 秒以内に 絵の こまかさを 1 だん下げる（1.5 → 1・ぬる点は 44%）', s.pr === 1 && s.w === 390, [s.pr, s.w]);
    ok('下げても 画面の大きさ・大きな数字・見本の場所は 変わらない', s.css === '390x844' && s.font === '56px' && h0.css === s.css && s.hint === h0.hint && Math.abs(s.hx - h0.hx) <= 2, [s.css, s.font, h0.hx, s.hx]);
    // 13-5) まだ おそければ もう 1 だん（0.75）。そこで止まる。速くなっても 上げ直さない（ちらつかせない）
    await adv(4, 100); const s5 = await st(); await adv(8, 100); const s6 = await st(); await adv(6, 50); const s7 = await st();
    ok('まだ おそければ 0.75 まで。それより下げない・速くなっても 上げ直さない', s5.pr === 0.75 && s6.pr === 0.75 && s7.pr === 0.75 && s7.w === 292, [s5.pr, s6.pr, s7.pr, s7.w]);
    // 13-6) 動きは 変えない：下げたあとも 前へ なぞれば 今までどおり進んで 耕せる・離すと止まる
    const cdp = await ctx.newCDPSession(p), z0 = (await st()).z, t0 = (await st()).til;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 481, id: 1 }] });
    for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 481 - 84 * i / 10, id: 1 }] }); await adv(0.05); }
    await adv(3); const m1 = await st(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await adv(1.5); const m2 = await st(); await adv(1); const m3 = await st();
    ok('下げたあとも なぞれば進んで耕せる・離すと止まる', m1.z - z0 > 2 && m1.til > t0 + 50 && Math.abs(m3.z - m2.z) < 0.02, [+(m1.z - z0).toFixed(1), m1.til - t0, +(m3.z - m2.z).toFixed(2)]);
    await p.close();
    // 13-7) ?nolite（画面写真を くっきり とる とき）：おそくても 下げない
    const q = await open('?nolite'); await q.evaluate(() => window.__adv(6, 100)); const n = await q.evaluate(() => renderer.getPixelRatio());
    ok('?nolite では おそくても 下げない', n === 1.5, n);
    await ctx.close();
  }
  // ---- 14) サイクル274（はじめの 1 分で やめる人を へらす）：2 本目の指・見本の向き・60 秒のボタン・読みこめないとき・畦の吹き出し・ケリの巣・おおいの上の指 ----
  {
    const open14 = async (qs, pre, quiet, vp = [390, 844], wu = 'load') => { const ctx = await b.newContext({ viewport: { width: vp[0], height: vp[1] }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }), p = await ctx.newPage(); p.setDefaultTimeout(180000);
      p.on('pageerror', e => errs.push('pageerror ' + e.message)); if (!quiet) p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });   // quiet＝わざと読みこみを失敗させる場面（コンソールの エラーは 数えない）
      await p.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: TN + r.request().url().split('/three@0.128.0')[1], contentType: 'text/javascript' }));
      if (pre) await pre(p);
      await p.goto(`http://localhost:${PORT}/tractor.html${qs}`, { waitUntil: wu });   // wu＝'commit'：three が 返事を しない 場面（load が 来ない）
      return { ctx, p, cdp: await ctx.newCDPSession(p) }; };
    // にせの時計（0.05 秒ずつ）。予約ずみの 本物の こまは 先に消す（あとから回ると 時間が 逆もどりする）
    const fake14 = async p => { await p.waitForFunction(() => window.game && game.S && game.S.started && typeof P !== 'undefined' && P.Rotary);
      await p.evaluate(() => { const real = performance.now.bind(performance); let now = real(); performance.now = () => now; window.__sync = () => { now = real(); };
        const rr = window.requestAnimationFrame.bind(window), id = rr(() => {}); for (let k = id; k > id - 6; k--) cancelAnimationFrame(k);
        window.requestAnimationFrame = () => 0; game.renderer.render = () => {};
        window.__adv = sec => { if (last > now) now = last; for (let i = 0, n = Math.round(sec / 0.05); i < n; i++) { now += 50; frame(now); if (window.__each) window.__each(); } }; });
      await p.waitForTimeout(2500); await p.evaluate(() => window.__sync()); };
    const st14 = p => p.evaluate(() => { const box = document.getElementById('hintSwipe'), say = document.getElementById('say'), S = game.S;
      return { x: +S.x.toFixed(2), z: +S.z.toFixed(2), yaw: +S.yaw.toFixed(3), v: +S.v.toFixed(2), on: TRACE.on, zoom: +fovZoom.toFixed(2), ids: touchIds.size, pts: viewPts.size, drag: !!drag, fm: +FIRSTMIN.t.toFixed(1),
        hint: box.classList.contains('hidden') || !HINT.turn ? '' : (HINT.turn.out ? 'out' : HINT.turn.idle ? 'idle' : 'block'), side: HINT.turn ? HINT.turn.side : 0, say: say.classList.contains('off') ? '' : say.innerText }; });
    // ---- 14-1) 2 本目の指（本物のタッチ。touchEnd は 書いた指だけを離す・[] は ぜんぶ離す）----
    {
      const { ctx, p, cdp } = await open14(''); await fake14(p);
      const adv = s => p.evaluate(x => window.__adv(x), s), T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts }), st = () => st14(p);
      const mv = async (id, a, c, n, rest = []) => { for (let i = 1; i <= n; i++) { await T('touchMove', [...rest, { x: a[0] + (c[0] - a[0]) * i / n, y: a[1] + (c[1] - a[1]) * i / n, id }]); await adv(0.05); } };
      await adv(2);
      // (a) なぞって置いた指の ほかに、2 本目が 0.1 秒 ふれて離れる：なぞりは つづく（直す前：そこで止まり、置いた指を動かしても 0m）
      await T('touchStart', [{ x: 195, y: 481, id: 1 }]); await mv(1, [195, 481], [195, 300], 10); await adv(1); const a0 = await st();
      await T('touchStart', [{ x: 195, y: 300, id: 1 }, { x: 60, y: 700, id: 2 }]); await adv(0.1); await T('touchEnd', [{ x: 60, y: 700, id: 2 }]); await adv(3); const a1 = await st();
      await T('touchEnd', []); await adv(1.5); const a2 = await st(); await adv(1); const a3 = await st();
      ok('なぞって置いた指の ほかに 2 本目が 0.1 秒 ふれても、なぞりは つづく（3 秒で 2m 以上。直す前 0.33m）・離すと止まる', a1.on && a1.z - a0.z > 2 && !a2.on && Math.abs(a3.z - a2.z) < 0.02 && a3.ids === 0 && a3.pts === 0, [+(a1.z - a0.z).toFixed(2), a1.on, a2.on, +(a3.z - a2.z).toFixed(2), a3.ids, a3.pts]);
      // (b) 左右の親指で かわりばんこ（次の指が 0.1 秒 早く ふれる）：どの なぞりでも進む（直す前：2 回目から 0.43・0・0・0m）
      await p.evaluate(() => Object.assign(game.S, { x: 0, z: -12, yaw: 0, v: 0, steer: 0 })); await adv(0.5);
      await T('touchStart', [{ x: 120, y: 481, id: 1 }]); await mv(1, [120, 481], [120, 397], 8); await adv(1);
      let cur = { x: 120, y: 397, id: 1 }, zp = (await st()).z; const alt = [];
      for (let k = 0; k < 4; k++) { const nx = k % 2 ? 120 : 270, nid = k % 2 ? 1 : 2;
        await T('touchStart', [cur, { x: nx, y: 481, id: nid }]); await adv(0.1); await T('touchEnd', [cur]);
        await mv(nid, [nx, 481], [nx, 397], 8); await adv(1); cur = { x: nx, y: 397, id: nid }; const s = await st(); alt.push(+(s.z - zp).toFixed(2)); zp = s.z; }
      await T('touchEnd', []); await adv(1.5); const b1 = await st();
      ok('左右の親指で かわりばんこに なぞる（次の指が 0.1 秒 早く ふれる）：4 回とも 0.8m 以上 進む（直す前 0.43・0・0・0m）', alt.every(d => d > 0.8) && !b1.on && b1.zoom === 1, alt);
      // (c) 親指を画面のはしに置いたまま、人さし指で 3 回 なぞる：ついてくる・拡大しない（直す前：3 回で 0.09m・1.7 倍のまま）。親指は 2px ゆれる
      await p.evaluate(() => Object.assign(game.S, { x: 0, z: -12, yaw: 0, v: 0, steer: 0 })); await adv(0.5);
      const TH = { x: 20, y: 820, id: 7 }; await T('touchStart', [TH]); await adv(1.5); const c0 = await st();
      for (let k = 0; k < 3; k++) { await T('touchStart', [TH, { x: 195, y: 481, id: 1 }]); await mv(1, [195, 481], [195, 397], 10, [{ x: 20 + (k % 2 ? 2 : -2), y: 821, id: 7 }]); await adv(2); await T('touchEnd', [{ x: 195, y: 397, id: 1 }]); await adv(0.8); }
      const c1 = await st(); await T('touchEnd', []); await adv(1); const c2 = await st();
      ok('親指を置いたまま 人さし指で 3 回 なぞる：6m 以上 進む・画角は 1 倍のまま（直す前 0.09m・1.7 倍）', c1.z - c0.z > 6 && c1.zoom === 1 && c2.zoom === 1 && c2.ids === 0 && c2.pts === 0, [+(c1.z - c0.z).toFixed(2), c1.zoom, c2.ids, c2.pts]);
      // (d) 2 本の指を どちらも動かす：今までどおり 寄って見る（なぞらない）。次に 1 本の指で なぞると 画角は 1 倍に もどり、進む
      await p.evaluate(() => Object.assign(game.S, { x: 0, z: -12, yaw: 0, v: 0, steer: 0 })); await adv(0.5); const d0 = await st();
      await T('touchStart', [{ x: 165, y: 520, id: 1 }, { x: 225, y: 520, id: 2 }]);
      for (let i = 1; i <= 8; i++) { await T('touchMove', [{ x: 165 - i * 8, y: 520, id: 1 }, { x: 225 + i * 8, y: 520, id: 2 }]); await adv(0.05); }
      const d1 = await st(); await T('touchEnd', []); await adv(1); const d2 = await st();
      await T('touchStart', [{ x: 195, y: 481, id: 1 }]); await mv(1, [195, 481], [195, 397], 10); await adv(2); const d3 = await st(); await T('touchEnd', []); await adv(1.5);
      ok('2 本の指を どちらも動かすと 寄って見る（1.5 倍以上・なぞらない）。離しても そのまま見える', d1.zoom > 1.5 && !d1.on && d2.zoom >= d1.zoom && Math.abs(d2.z - d0.z) < 0.3, [d1.zoom, d1.on, d2.zoom, +(d2.z - d0.z).toFixed(2)]);
      ok('そのあと 1 本の指で なぞると 画角は 1 倍に もどって 進む（直す前：拡大したまま）', d3.zoom === 1 && d3.z - d2.z > 2, [d3.zoom, +(d3.z - d2.z).toFixed(2)]);
      // (e) なぞっていた指が先に離れる：止まる（サイクル116）。残った指を 30px 動かすと、その指で なぞれる。pointercancel でも 指の記録は残らない
      await T('touchStart', [{ x: 195, y: 481, id: 1 }]); await mv(1, [195, 481], [195, 397], 10); await T('touchStart', [{ x: 195, y: 397, id: 1 }, { x: 300, y: 500, id: 2 }]); await adv(0.3);
      await T('touchEnd', [{ x: 195, y: 397, id: 1 }]); await adv(1.5); const e1 = await st(); await adv(1); const e2 = await st();
      await mv(2, [300, 500], [300, 440], 6); await adv(1.5); const e3 = await st();
      await T('touchCancel', []); await adv(1.5); const e4 = await st();
      ok('なぞっていた指が離れると止まる。残った指を動かすと その指で なぞれる。pointercancel で ぜんぶ終わる', !e1.on && Math.abs(e2.z - e1.z) < 0.02 && e3.on && e3.z - e2.z > 0.5 && !e4.on && e4.ids === 0 && e4.pts === 0, [e1.on, +(e2.z - e1.z).toFixed(2), e3.on, +(e3.z - e2.z).toFixed(2), e4.on, e4.ids, e4.pts]);
      // (f) なぞって置いたまま ほかの窓へ（blur）：止まる。もどって 指を動かすと また なぞれる（直す前：離すまで 動かない）
      await T('touchStart', [{ x: 195, y: 481, id: 1 }]); await mv(1, [195, 481], [195, 397], 10); await adv(0.5);
      await p.evaluate(() => window.dispatchEvent(new Event('blur'))); await adv(1.5); const f1 = await st();
      await mv(1, [195, 397], [195, 340], 6); await adv(1.5); const f2 = await st(); await T('touchEnd', []); await adv(1.5); const f3 = await st();
      ok('置いたまま ほかの窓へ行くと止まる。もどって 指を動かすと また なぞれる・離すと終わる', !f1.on && f2.on && f2.ids === 1 && f2.z - f1.z > 0.5 && !f3.on && f3.ids === 0 && f3.pts === 0, [f1.on, f2.on, f2.ids, +(f2.z - f1.z).toFixed(2), f3.on, f3.ids, f3.pts]);
      // (g) マウス：押して なぞると進む・離すと終わる（ボタンを押していない動きでは 始まらない）
      await p.evaluate(() => Object.assign(game.S, { x: 0, z: -12, yaw: 0, v: 0, steer: 0 })); await adv(0.5); const g0 = await st();
      await p.mouse.move(195, 481); await p.mouse.move(195, 440); await adv(0.5); const g1 = await st();
      await p.mouse.down(); for (let i = 1; i <= 10; i++) { await p.mouse.move(195, 440 - i * 6); await adv(0.05); } await adv(2); const g2 = await st(); await p.mouse.up(); await adv(1.5); const g3 = await st();
      ok('マウス：押さずに動かしても始まらない・押して なぞると進む・離すと終わる', !g1.on && g1.pts === 0 && g2.on && g2.z - g0.z > 1 && !g3.on && g3.ids === 0, [g1.on, g1.pts, g2.on, +(g2.z - g0.z).toFixed(2), g3.on, g3.ids]);
      // (h) Codex 指摘：寄って見た あと 片方の指だけ離す。残った指は 見るだけの指なので、置いたままでも 見本は出ない（直す前：1 秒で 拡大した画面に 見本が出る）
      await p.evaluate(() => Object.assign(game.S, { x: 0, z: -12, yaw: 0, v: 0, steer: 0 })); await adv(1.5);
      const hv = () => p.evaluate(() => ({ hold: +HINT.holdT.toFixed(2), hint: !document.getElementById('hintSwipe').classList.contains('hidden'), idle: !!(HINT.turn && HINT.turn.idle) || HINT.demoF, zoom: +fovZoom.toFixed(2), on: TRACE.on, drag: !!drag, ids: touchIds.size, look: +look.yaw.toFixed(2) }));
      const h0 = await hv();
      await T('touchStart', [{ x: 165, y: 520, id: 1 }, { x: 225, y: 520, id: 2 }]);
      for (let i = 1; i <= 8; i++) { await T('touchMove', [{ x: 165 - i * 8, y: 520, id: 1 }, { x: 225 + i * 8, y: 520, id: 2 }]); await adv(0.05); }
      await adv(0.3); await T('touchEnd', [{ x: 289, y: 520, id: 2 }]); await adv(1.5); const h1 = await hv(); await adv(1.5); const h2 = await hv();
      await T('touchEnd', []); await adv(1.5); const h3 = await hv();
      ok('寄って見た あと 片方の指だけ離す：残った指を 3 秒 置いても 見本は出ない・拡大のまま（直す前：1 秒で 見本が出る）。ぜんぶ離すと いつもの見本', h0.hint && !h1.hint && !h2.hint && h1.hold === 0 && h2.hold === 0 && !h2.idle && h2.zoom > 1.5 && !h2.on && h2.ids === 1 && h3.hint && h3.zoom === h2.zoom, [h0.hint, h1.hint, h2.hint, h2.hold, h2.idle, h2.zoom, h2.ids, h3.hint]);
      // (i) Codex 指摘：拡大したまま、空に 1 本 置いて もう 1 本で 空を なぞる（見回す）：拡大は そのまま（直す前：1 倍に もどる）。地面を なぞったときは 1 倍に もどって進む
      const sky = await p.evaluate(() => { fovZoom = 1.15; camera.fov = baseFov / fovZoom; camera.updateProjectionMatrix(); look.yaw = look.pitch = 0; const at = (x, y) => !TRACE.ground({ clientX: x, clientY: y }) && document.elementFromPoint(x, y) === canvas; return [at(100, 150), at(280, 150)]; });   // どちらも 空の上・canvas の上
      await T('touchStart', [{ x: 100, y: 150, id: 1 }]); await adv(0.3); const i0 = await hv();
      await T('touchStart', [{ x: 100, y: 150, id: 1 }, { x: 280, y: 150, id: 2 }]); await adv(0.1);
      for (let i = 1; i <= 6; i++) { await T('touchMove', [{ x: 100, y: 150, id: 1 }, { x: 280 - i * 10, y: 150, id: 2 }]); await adv(0.05); }
      await p.evaluate(() => new Promise(r => setTimeout(r, 300))); await adv(0.3); const i1 = await hv(); await T('touchEnd', [{ x: 220, y: 150, id: 2 }]); await adv(0.3);
      const zb = (await st()).z;
      await T('touchStart', [{ x: 100, y: 150, id: 1 }, { x: 195, y: 481, id: 2 }]); await mv(2, [195, 481], [195, 397], 10, [{ x: 100, y: 150, id: 1 }]); await adv(2); const i2 = await hv(), za = (await st()).z;
      await T('touchEnd', []); await adv(1.5);
      ok('拡大したまま 空に 1 本 置いて、もう 1 本で 空を なぞる：見回すだけで 拡大は そのまま（直す前：1 倍に もどる）', sky[0] && sky[1] && i0.drag && i0.ids === 1 && i1.zoom === 1.15 && !i1.on && i1.drag && i1.ids === 2 && i1.look !== 0, [sky, i0.drag, i1.zoom, i1.on, i1.drag, i1.ids, i1.look]);
      ok('同じ形で 地面を なぞったときは 1 倍に もどって 進む', i2.zoom === 1 && i2.on && za - zb > 1, [i2.zoom, i2.on, +(za - zb).toFixed(2)]);
      // (j) Codex 指摘：速く広げる（はじめの 1 回の知らせで 2 本とも 30px 動いている。1 本目の知らせを見たとき もう 1 本は まだ はじめの場所）：寄って見る になる・走りださない（直す前：なぞり に決まって 拡大できず 走りだす）
      await p.evaluate(() => Object.assign(game.S, { x: 0, z: -12, yaw: 0, v: 0, steer: 0 })); await adv(1);
      const jv = () => p.evaluate(() => ({ two: viewTwo, zoom: +fovZoom.toFixed(2), on: TRACE.on, z: +game.S.z.toFixed(2), til: tilledCount }));
      const j0 = await jv();
      await T('touchStart', [{ x: 165, y: 520, id: 1 }, { x: 225, y: 520, id: 2 }]);
      await T('touchMove', [{ x: 135, y: 520, id: 1 }, { x: 255, y: 520, id: 2 }]); await adv(0.05);
      for (let i = 2; i <= 4; i++) { await T('touchMove', [{ x: 165 - i * 30, y: 520, id: 1 }, { x: 225 + i * 30, y: 520, id: 2 }]); await adv(0.05); }
      await p.evaluate(() => new Promise(r => setTimeout(r, 300))); await adv(0.5); const j1 = await jv(); await T('touchEnd', []); await adv(1); const j2 = await jv();
      ok('速く広げる（1 回の知らせで 2 本とも 30px）：寄って見る になり、走りださない・耕さない（直す前：なぞり に決まる）', j1.two === 'pinch' && j1.zoom > 1.5 && !j1.on && Math.abs(j2.z - j0.z) < 0.05 && j2.til === j0.til, [j1.two, j1.zoom, j1.on, +(j2.z - j0.z).toFixed(2), j2.til - j0.til]);
      // (k) 片方の指が 先に 20px 動き、2 こま あと（なぞり に決まった すぐあと）に もう片方も 20px 動く：寄って見る に直り、なぞりは やめる
      await p.evaluate(() => { fovZoom = 1; camera.fov = baseFov; camera.updateProjectionMatrix(); }); await adv(0.5); const k0 = await jv();
      await T('touchStart', [{ x: 165, y: 520, id: 1 }, { x: 225, y: 520, id: 2 }]);
      await T('touchMove', [{ x: 145, y: 520, id: 1 }, { x: 225, y: 520, id: 2 }]); await p.evaluate(() => new Promise(r => setTimeout(r, 200))); await adv(0.1); const k1 = await jv();
      await T('touchMove', [{ x: 145, y: 520, id: 1 }, { x: 245, y: 520, id: 2 }]); await p.evaluate(() => new Promise(r => setTimeout(r, 200))); await adv(0.05);
      for (let i = 1; i <= 4; i++) { await T('touchMove', [{ x: 145 - i * 15, y: 520, id: 1 }, { x: 245 + i * 15, y: 520, id: 2 }]); await adv(0.05); }
      await p.evaluate(() => new Promise(r => setTimeout(r, 300))); await adv(0.3); const k2 = await jv(); await T('touchEnd', []); await adv(1); const k3 = await jv();
      ok('片方が先に動き、2 こま あとに もう片方も動く：いちど なぞり に決まっても 寄って見る に直る・0.3m より進まない', k1.two === 'trace' && k2.two === 'pinch' && k2.zoom > 1.3 && !k2.on && Math.abs(k3.z - k0.z) < 0.3, [k1.two, k2.two, k2.zoom, k2.on, +(k3.z - k0.z).toFixed(2)]);
      // (l) 親指を置いたままの人の なぞりはじめ：人さし指が 12px 動いてから 2 こま（0.1 秒）以内に その指の なぞりになる（待ちすぎない）
      await p.evaluate(() => { fovZoom = 1; camera.fov = baseFov; camera.updateProjectionMatrix(); Object.assign(game.S, { x: 0, z: -12, yaw: 0, v: 0, steer: 0 }); }); await adv(0.5);
      await T('touchStart', [{ x: 20, y: 820, id: 7 }]); await adv(1); const t0 = await p.evaluate(() => viewTid);
      await T('touchStart', [{ x: 20, y: 820, id: 7 }, { x: 195, y: 481, id: 1 }]); await T('touchMove', [{ x: 20, y: 820, id: 7 }, { x: 195, y: 461, id: 1 }]); await p.evaluate(() => new Promise(r => setTimeout(r, 200)));
      let lf = 0; for (; lf < 10; lf++) { if (await p.evaluate(t => TRACE.on && viewTid !== null && viewTid !== t, t0)) break; await adv(0.05); }
      await mv(1, [195, 461], [195, 397], 8, [{ x: 20, y: 820, id: 7 }]); await adv(2); const l1 = await jv(); await T('touchEnd', []); await adv(1.5);
      ok('親指を置いたままの人：人さし指が 12px 動いて 2 こま以内に なぞりが始まる・そのまま進む', lf >= 1 && lf <= 2 && l1.on && l1.z > -11, [lf, l1.on, l1.z]);
      // (m)〜(q) Codex 指摘：寄って見る ときの 画角は、2 本目の指が ふれた ときの 指の間・画角から はかる（決まるまでに 動いた分を なくさない）
      const fl = () => p.evaluate(() => new Promise(r => setTimeout(r, 250))), zs = z => p.evaluate(v => { fovZoom = v; camera.fov = baseFov / v; camera.updateProjectionMatrix(); Object.assign(game.S, { x: 0, z: -12, yaw: 0, v: 0, steer: 0 }); }, z);
      const P2 = (a, c) => [{ x: a, y: 520, id: 1 }, { x: c, y: 520, id: 2 }];
      await zs(1); await adv(0.5); await T('touchStart', P2(165, 225));   // (m) ゆっくり広げる：60px → 108px ＝ 1.8 倍
      for (let i = 1; i <= 8; i++) { await T('touchMove', P2(165 - i * 3, 225 + i * 3)); await adv(0.05); } await fl(); await adv(0.2); const zm = (await jv()).zoom; await T('touchEnd', []); await adv(0.5);
      await zs(1); await adv(0.5); await T('touchStart', P2(165, 225)); await T('touchMove', P2(135, 255)); await fl(); await adv(0.2); const zn = await jv();   // (n) 1 回の知らせで 60px → 120px ＝ 2 倍（直す前 1 倍）
      await T('touchEnd', []); await adv(0.5);
      await zs(1.5); await adv(0.5); await T('touchStart', P2(145, 245)); await T('touchMove', P2(165, 225)); await fl(); await adv(0.2); const zo1 = (await jv()).zoom;   // (o) 1.5 倍から せばめて（100 → 60px）元の間に もどす：1.5 倍に もどる（直す前 2.2 倍）
      await T('touchMove', P2(145, 245)); await fl(); await adv(0.2); const zo2 = (await jv()).zoom; await T('touchEnd', []); await adv(0.5);
      await zs(1); await adv(0.5); await T('touchStart', P2(165, 225)); await T('touchMove', P2(145, 225)); await fl(); await adv(0.1); const p1 = await jv();   // (p) なぞり に決まってから 直した とき：60 → 100px ＝ 1.67 倍（直す前 1 倍）
      await T('touchMove', P2(145, 245)); await fl(); await adv(0.05); const p2 = await jv();
      await T('touchEnd', [{ x: 245, y: 520, id: 2 }]); await adv(0.3);   // (q) 片方を離して 新しい 2 本目で せばめる：今の画角（1.67 倍）から 100 → 70px ＝ 1.17 倍
      await T('touchStart', [{ x: 145, y: 520, id: 1 }, { x: 245, y: 520, id: 3 }]); await T('touchMove', [{ x: 160, y: 520, id: 1 }, { x: 230, y: 520, id: 3 }]); await fl(); await adv(0.2); const q1 = await jv();
      await T('touchEnd', []); await adv(0.5); await zs(1); await adv(0.5);
      const near = (a, c) => Math.abs(a - c) <= 0.03;
      ok('寄って見る：ゆっくり 60 → 108px で 1.8 倍・1 回の知らせで 60 → 120px でも 2 倍（直す前 1 倍）', near(zm, 1.8) && zn.two === 'pinch' && near(zn.zoom, 2) && !zn.on, [zm, zn.two, zn.zoom]);
      ok('1.5 倍から せばめて 元の間に もどすと 1.5 倍に もどる（直す前 2.2 倍）', zo1 === 1 && near(zo2, 1.5), [zo1, zo2]);
      ok('なぞり に決まってから 寄って見る に直した ときも、2 本目が ふれた ときから はかる（60 → 100px ＝ 1.67 倍。直す前 1 倍）', p1.two === 'trace' && p2.two === 'pinch' && near(p2.zoom, 1.67), [p1.two, p2.two, p2.zoom]);
      ok('片方を離して 新しい 2 本目で せばめる：今の画角から つづく（1.67 倍 × 70 ÷ 100 ＝ 1.17 倍）', q1.two === 'pinch' && near(q1.zoom, 1.17), [q1.two, q1.zoom]);
      // (表) Codex 指摘：2 本の指の 状態の表を、道すじ × はじめの画角 で ぜんぶ回す。
      //  ・「地面の なぞり」に なる道：決まった あと 画角は 1 倍・なぞりは 動いていて・線の先は 指の下の地面（1m 以内）
      //  ・「寄って見る」に なる道：画角は 2 本目が ふれた ときの画角 × 指の間の比（1〜2.2 倍）・なぞらない
      //  ・「見回す」に なる道：画角は そのまま・なぞらない
      const setZ = z => p.evaluate(v => { fovZoom = v; camera.fov = baseFov / v; camera.updateProjectionMatrix(); }, z), cl = v => Math.max(1, Math.min(2.2, v));
      const THM = { x: 20, y: 820, id: 7 }, G = (x, y, id) => ({ x, y, id });
      const rows = [
        ['なぞり', '1 本の指で なぞる', [1, 1.6], async z => { await T('touchStart', [G(195, 481, 1)]); await mv(1, [195, 481], [195, 397], 6); return [195, 397]; }],
        ['なぞり', '親指を置いたまま もう 1 本で なぞる（わたす）', [1, 1.6], async z => { await T('touchStart', [THM]); await adv(0.5); await setZ(z); await T('touchStart', [THM, G(195, 481, 1)]); await mv(1, [195, 481], [195, 397], 6, [THM]); return [195, 397]; }],
        ['なぞり', '1 本目を置き、2 本目が ふれてから、1 本目だけ 20px 動かして止める（同じ指に決まる）', [1, 1.6], async z => { await T('touchStart', [G(195, 481, 1)]); await T('touchStart', [G(195, 481, 1), G(60, 600, 2)]); await T('touchMove', [G(195, 461, 1), G(60, 600, 2)]); await fl(); await adv(0.1); return [195, 461]; }, 'trace'],
        ['なぞり', '1 本目を置き、2 本目が 0.1 秒 ふれて離れてから、1 本目を動かす', [1, 1.6], async z => { await T('touchStart', [G(195, 481, 1)]); await T('touchStart', [G(195, 481, 1), G(60, 600, 2)]); await adv(0.1); const n2 = await p.evaluate(() => viewPts.size); await T('touchEnd', [G(60, 600, 2)]); await adv(0.1); await T('touchMove', [G(195, 461, 1)]); return n2 === 2 ? [195, 461] : null; }, null],
        ['なぞり', 'なぞっていた指が離れ、残った指を動かす', [1, 1.6], async z => { await T('touchStart', [G(195, 481, 1)]); await mv(1, [195, 481], [195, 397], 6); await T('touchStart', [G(195, 397, 1), G(300, 500, 2)]); await adv(0.2); await T('touchEnd', [G(195, 397, 1)]); await adv(0.5); await setZ(z); await mv(2, [300, 500], [300, 440], 6); return [300, 440]; }],
        ['なぞり', 'ほかの窓から もどって、置いたままの指を動かす', [1, 1.6], async z => { await T('touchStart', [G(195, 481, 1)]); await mv(1, [195, 481], [195, 397], 6); await adv(0.3); await p.evaluate(() => window.dispatchEvent(new Event('blur'))); await adv(0.5); await setZ(z); await mv(1, [195, 397], [195, 340], 6); return [195, 340]; }],
        ['寄る', 'ゆっくり広げる（60 → 108px）', [1, 1.6], async z => { await T('touchStart', P2(165, 225)); for (let i = 1; i <= 8; i++) { await T('touchMove', P2(165 - i * 3, 225 + i * 3)); await adv(0.05); } return cl(z * 1.8); }],
        ['寄る', '1 回の知らせで広げる（60 → 120px）', [1, 1.6], async z => { await T('touchStart', P2(165, 225)); await T('touchMove', P2(135, 255)); return cl(z * 2); }],
        ['寄る', 'なぞり に決まってから 0.15 秒の間に もう片方も動く（60 → 100px）', [1, 1.6], async z => { await T('touchStart', P2(165, 225)); await T('touchMove', P2(145, 225)); await fl(); await adv(0.1); await T('touchMove', P2(145, 245)); return cl(z * 100 / 60); }],
        ['寄る', '寄って見て 片方を離し、新しい 2 本目で せばめる（140 → 100px）', [1, 1.6], async z => { await T('touchStart', P2(145, 245)); await T('touchMove', P2(125, 265)); await fl(); await adv(0.1); await T('touchEnd', [G(265, 520, 2)]); await adv(0.2); await T('touchStart', [G(125, 520, 1), G(265, 520, 3)]); await T('touchMove', [G(145, 520, 1), G(245, 520, 3)]); return cl(cl(z * 1.4) * 100 / 140); }],
        ['見回す', '1 本の指で 空を なぞる', [1, 1.15], async z => { await T('touchStart', [G(280, 150, 1)]); await mv(1, [280, 150], [220, 150], 3); return z; }],
        ['見回す', '空に 1 本 置いたまま、もう 1 本で 空を なぞる', [1, 1.15], async z => { await T('touchStart', [G(100, 150, 1)]); await T('touchStart', [G(100, 150, 1), G(280, 150, 2)]); await mv(2, [280, 150], [220, 150], 3, [G(100, 150, 1)]); await adv(0.15); return z; }],
        ['見回す', '地面に 親指を置いたまま、もう 1 本で 空を なぞる', [1, 1.15], async z => { await T('touchStart', [THM]); await adv(0.3); await setZ(z); await T('touchStart', [THM, G(280, 150, 2)]); await mv(2, [280, 150], [220, 150], 3, [THM]); await adv(0.15); return z; }],
        // サイクル275 きまり 6：置いただけの 1 本目（5px 動いていない）で 進んでいる ときに 2 本目が ふれる。1 本目の なぞりは やめ、ハンドルは その指を置く前（0）に もどる・画角は そのまま（直す前：決まるまで 親指の側へ 切りつづける）
        ['まつ', '置いただけの 1 本目（左へ 切っている）に 2 本目が ふれる', [1, 1.6], async z => { await T('touchStart', [G(80, 520, 1)]); await adv(0.5); const sv = await p.evaluate(() => game.S.steer); await T('touchStart', [G(80, 520, 1), G(300, 600, 2)]); return Math.abs(sv) > 0.1 ? z : null; }, 'wait'],
        // 置いただけの 1 本目に 2 本目が 0.1 秒 ふれて離れる：1 本目は また 押した所へ 進む（サイクル274 きまり 3 と同じく 押した指は 止めない）。画角 1 倍だけ（動かしていない指は 拡大を もどさない＝きまり 5）
        ['なぞり', '置いただけの 1 本目に 2 本目が 0.1 秒 ふれて離れる（1 本目は また 押した所へ）', [1], async z => { await T('touchStart', [G(195, 481, 1)]); await adv(0.3); await T('touchStart', [G(195, 481, 1), G(300, 600, 2)]); await adv(0.1); const w = await p.evaluate(() => viewTwo === 'wait' && !TRACE.on); await T('touchEnd', [G(300, 600, 2)]); return w ? [195, 481] : null; }, null],
      ];
      const badRows = { なぞり: [], 寄る: [], 見回す: [], まつ: [] }, cnt = { なぞり: 0, 寄る: 0, 見回す: 0, まつ: 0 };
      for (const [kind, name, zooms, run, now] of rows) for (const z of zooms) {   // now（5 つ目）が あれば：指を止めた道。決まった その こまで読む（走りだすと 運転席の目が ゆれて、止めた指の下の地面が ずれる）。中身は そのときの viewTwo
        await zs(z); await adv(0.5);
        const sky = kind === '見回す' ? await p.evaluate(() => [[100, 150], [280, 150], [220, 150]].every(([x, y]) => !TRACE.ground({ clientX: x, clientY: y }) && document.elementFromPoint(x, y) === canvas)) : true;
        const exp = await run(z); await fl(); if (now === undefined) await adv(0.1);
        const r = await p.evaluate(f => { const g = f ? TRACE.ground({ clientX: f[0], clientY: f[1] }) : null; return { zoom: +fovZoom.toFixed(3), on: TRACE.on, two: viewTwo, drag: !!drag, steer: +game.S.steer.toFixed(3), err: g && TRACE.fPos ? +Math.hypot(g.x - TRACE.fPos[0], g.z - TRACE.fPos[1]).toFixed(2) : null }; }, kind === 'なぞり' ? exp : null);
        const pass = kind === 'なぞり' ? r.zoom === 1 && r.on && r.err !== null && r.err < 1 && (now === undefined || r.two === now) && (await p.evaluate(() => document.elementFromPoint(60, 600) === canvas)) : kind === '寄る' ? r.two === 'pinch' && !r.on && Math.abs(r.zoom - exp) <= 0.03 : kind === 'まつ' ? exp !== null && r.two === now && !r.on && Math.abs(r.steer) < 0.01 && Math.abs(r.zoom - exp) <= 0.001 : sky && r.drag && !r.on && Math.abs(r.zoom - exp) <= 0.001;
        cnt[kind]++; if (!pass) badRows[kind].push([name, z, kind === 'なぞり' || exp === null ? null : +exp.toFixed(2), r]);
        await T('touchEnd', []); await adv(1);
      }
      await zs(1); await adv(0.3);
      ok('2 本の指の表：地面の なぞり に なる道 ' + cnt.なぞり + ' 行（6 つの道 × 画角 1 倍・1.6 倍 ＋ サイクル275 の 1 行）は、決まった あと 1 倍・線の先は 指の下', cnt.なぞり === 13 && badRows.なぞり.length === 0, badRows.なぞり);
      ok('2 本の指の表：寄って見る に なる道 ' + cnt.寄る + ' 行は、2 本目が ふれた ときの画角 × 指の間の比（1〜2.2 倍）・なぞらない', cnt.寄る === 8 && badRows.寄る.length === 0, badRows.寄る);
      ok('2 本の指の表：見回す に なる道 ' + cnt.見回す + ' 行は、画角そのまま・なぞらない', cnt.見回す === 6 && badRows.見回す.length === 0, badRows.見回す);
      ok('2 本の指の表（サイクル275）：置いただけの 1 本目で 進む 所に 2 本目が ふれる ' + cnt.まつ + ' 行は、決まる前（wait）・1 本目の なぞりは やめる・ハンドルは 置く前に もどる・画角そのまま（直す前：親指の側へ 切りつづける）', cnt.まつ === 2 && badRows.まつ.length === 0, badRows.まつ);
      await ctx.close();
    }
    // ---- 14-2) 「横へ」の見本の向き・畦の吹き出し ----
    {
      const { ctx, p, cdp } = await open14(''); await fake14(p);
      const adv = s => p.evaluate(x => window.__adv(x), s), T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts }), st = () => st14(p);
      const stroke = async (a, c, hold) => { await T('touchStart', [{ x: a[0], y: a[1], id: 1 }]); for (let i = 1; i <= 10; i++) { await T('touchMove', [{ x: a[0] + (c[0] - a[0]) * i / 10, y: a[1] + (c[1] - a[1]) * i / 10, id: 1 }]); await adv(0.05); } await adv(hold); await T('touchEnd', []); };
      await adv(2); await stroke([195, 481], [195, 397], 1); await adv(1);
      // 絵の半分（x < 0。北むきの画面では 右）を 耕したことにして、まん中より少し左（x = 1.2）・白線の外から 前へ なぞる：耕す所は 画面の左に多く、田んぼのまん中は 右
      const pre = await p.evaluate(() => { for (let i = 0; i < Math.floor(HX / CELL); i++) for (let j = 0; j < NZ; j++) tilledMask[i * NZ + j] = 1; let z = 6; while (z < 20 && !(ART.sdAt(1.2, z) > 0.6)) z += 0.5; Object.assign(game.S, { x: 1.2, z, yaw: 0, v: 0, steer: 0 }); HINT.turn = null; HINT.lastSide = 0;
        window.__seen = []; window.__each = () => { const b = document.getElementById('hintSwipe'); if (HINT.turn && !b.classList.contains('hidden')) { const k = (HINT.turn.out ? 'out' : HINT.turn.idle ? 'idle' : 'block') + HINT.turn.side, q = window.__seen; if (q[q.length - 1] !== k) q.push(k); } const e = document.getElementById('say'), t = e.classList.contains('off') ? '' : e.innerText; if (/畦/.test(t)) window.__aze = { t, r: Math.round(e.getBoundingClientRect().left + parseFloat(getComputedStyle(e).paddingLeft)), big: Math.round(document.getElementById('bigPct').getBoundingClientRect().right) }; };
        return { z, sd: +ART.sdAt(1.2, z).toFixed(2), work: HINT.workSide(0, true), mid: -game.S.x * Math.cos(0) > 0 ? -1 : 1 }; });
      await adv(1.5);   // 運転席の目が 新しい場所に落ちつくまで
      let s = await st(), z0 = -99, n = 0;
      for (; n < 8; n++) { await stroke([195, 481], [195, 397], 4); await adv(0.3); s = await st(); if (Math.abs(s.z - z0) < 0.05) break; z0 = s.z; }
      for (let i = 0; i < 4 && s.hint !== 'block'; i++) { await stroke([195, 481], [195, 397], 2); s = await st(); }
      const seen = await p.evaluate(() => window.__seen), sides = [...new Set(seen.map(k => k.replace(/[a-z]+/, '')))], aze = await p.evaluate(() => window.__aze || null);
      ok('たしかめる場面：耕す所は 画面の左に多く、田んぼのまん中は 右', pre.sd > 0.4 && pre.work === -1 && pre.mid === 1, pre);
      ok('止まっているとき・白線の外を走っているとき・畦で止まったあと の「横へ」の見本は ぜんぶ同じ向き（直す前：畦で 左 → 右に入れかわる）', seen.some(k => /^out/.test(k)) && seen.some(k => /^block/.test(k)) && sides.length === 1 && sides[0] === '-1', seen);
      ok('畦の吹き出しに「何を するか」が入る（直す前「畦の手前で止めました」だけ）・文字は 大きな数字に かぶらない', !!aze && /横へ なぞって/.test(aze.t) && aze.r >= aze.big, aze);
      // 見本と反対へ 1 回 曲がる → そのあと 見本どおりに なぞる：4 回までに 畦から はなれる向き（南むき・はじめの向きから 110° 以上）になる。畦のほうを さす見本は 出ない
      const y0 = s.yaw, opp = -(s.side || 1); await stroke([195, 340], [195 + opp * 150, 332], 1.5); await adv(1.5);
      await p.evaluate(() => { window.__bad = 0; const S = game.S, room = sd => { const dx = -sd * Math.cos(S.yaw), dz = sd * Math.sin(S.yaw), tx = Math.abs(dx) < 1e-6 ? 1e9 : ((dx > 0 ? HX : -HX) - S.x) / dx, tz = Math.abs(dz) < 1e-6 ? 1e9 : ((dz > 0 ? HZ : -HZ) - S.z) / dz; return Math.min(tx, tz); };   // その側へ ま横に 畦まで 何 m
        window.__each = () => { const b = document.getElementById('hintSwipe'); if (HINT.turn && !b.classList.contains('hidden') && room(HINT.turn.side) < 4 && room(-HINT.turn.side) >= 5) window.__bad++; }; });
      let m = 0, s2 = await st(); const sg = (a, c) => Math.abs(Math.atan2(Math.sin(a - c), Math.cos(a - c))), turned = sg(s2.yaw, y0);
      for (; m < 8 && sg(s2.yaw, y0) < 1.92; m++) { for (let i = 0; i < 20 && !s2.side; i++) { await adv(0.2); s2 = await st(); } const d = s2.side || 1; await stroke([195, 340], [195 + d * 150, 332], 1.5); await adv(1.5); s2 = await st(); }
      const bad = await p.evaluate(() => window.__bad);
      ok('見本と反対へ 1 回 曲がった人：そのあと 見本どおりで 4 回までに 畦から はなれる（直す前：5〜11 回なぞっても 57〜101° のまま）', turned > 0.5 && m <= 4 && sg(s2.yaw, y0) >= 1.92 && bad === 0, [+(turned * 57.3).toFixed(0), m, +(sg(s2.yaw, y0) * 57.3).toFixed(0), bad]);
      await ctx.close();
    }
    // ---- 14-3) 指を置いたまま止まった人にも見本・ケリの巣の「耕してしまった…」は はじめの 1 分は出さない・🌙 は 60 秒を またいでも 同じ場所 ----
    {
      const { ctx, p, cdp } = await open14(''); await fake14(p);
      const adv = s => p.evaluate(x => window.__adv(x), s), T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
      await adv(2);
      // 前へ なぞって 指を置いたまま：止まってから 1.5 秒以内に 見本が出る（直す前：指を離すまで 0 こま）。トラクターは 動かない。指を動かすと 消えて 進む。地面を押しただけ・離したあとも 見本は つづく
      await p.evaluate(() => { window.__h = { stop: null, first: null, vis: 0, t: 0 }; window.__each = () => { const h = window.__h, b = document.getElementById('hintSwipe'), vis = HINT.done && !b.classList.contains('hidden') && [...b.querySelectorAll('.hDot'), document.getElementById('hintFinger')].some(e => e.style.display !== 'none');
        h.t += 0.05; if (Math.abs(game.S.v) >= 0.05) h.stop = h.first = null; else if (h.stop === null && h.t > 1) h.stop = h.t; if (vis && touchIds.size > 0) { h.vis++; if (h.first === null) h.first = h.t; } }; });   // stop・first＝いまの「止まっている間」の はじめと、その間に 見本が はじめて見えた時刻
      const hs = () => p.evaluate(() => ({ ...window.__h, z: +game.S.z.toFixed(2), on: TRACE.on, ids: touchIds.size, turn: HINT.turn ? (HINT.turn.idle ? 'idle' : HINT.turn.out ? 'out' : 'block') : HINT.demoF ? 'fwd' : '' }));
      await T('touchStart', [{ x: 195, y: 481, id: 1 }]); for (let i = 1; i <= 10; i++) { await T('touchMove', [{ x: 195, y: 481 - 84 * i / 10, id: 1 }]); await adv(0.05); }
      await p.evaluate(() => new Promise(r => setTimeout(r, 400)));   // おくれて届く touchMove を 先に受けとる（にせの時計の外。あとから届くと そこで また走りだす）
      await adv(10); const m1 = await hs(); await adv(1); const m2 = await hs();
      ok('前へ なぞって 指を置いたまま止まった人：止まって 1.5 秒以内に 見本が出る（直す前：指を離すまで 0 こま）・トラクターは 動かない', m1.stop !== null && m1.first !== null && m1.first >= m1.stop && m1.first - m1.stop <= 1.5 && m1.ids === 1 && m1.on && Math.abs(m2.z - m1.z) < 0.02, [m1.stop && +m1.stop.toFixed(2), m1.first && +m1.first.toFixed(2), m1.vis, m1.turn, m1.ids, +(m2.z - m1.z).toFixed(2)]);
      const v0 = m2.vis; for (let i = 1; i <= 6; i++) { await T('touchMove', [{ x: 195, y: 397 - i * 10, id: 1 }]); await adv(0.05); } await adv(0.1); const v1 = (await hs()).vis; await adv(0.5); const m3 = await hs();
      await T('touchEnd', []); await adv(2);
      ok('その指を動かすと 見本は消えて、新しい なぞりで進む', m3.vis - v1 === 0 && v1 - v0 <= 3 && m3.z - m2.z > 0.2, [v0, v1, m3.vis, +(m3.z - m2.z).toFixed(2)]);
      await p.evaluate(() => { Object.assign(window.__h, { stop: null, first: null, vis: 0, t: 0 }); }); await T('touchStart', [{ x: 195, y: 700, id: 1 }]); await adv(6); const m4 = await hs(); await T('touchEnd', []); await adv(1);
      ok('ボンネットの上を 押しただけの人：止まって 1.5 秒以内に 見本が出る（直す前 0 こま）', m4.stop !== null && m4.first !== null && m4.first - m4.stop <= 1.5 && m4.vis > 10, [m4.stop && +m4.stop.toFixed(2), m4.first && +m4.first.toFixed(2), m4.vis]);
      await p.evaluate(() => { window.__each = null; });
      const nest = await p.evaluate(() => { if (!KERI.NEST || !KERI.nest) return null; const ni = Math.floor((KERI.NEST[0] + HX) / CELL), nj = Math.floor((KERI.NEST[1] + HZ) / CELL); tilledMask[ni * NZ + nj] = 1; window.__adv(0.5);
        const e = document.getElementById('say'); return { vis: KERI.nest.visible, say: e.classList.contains('off') ? '' : e.innerText, fm: FIRSTMIN.on }; });
      ok('はじめの 1 分に ケリの巣を耕しても「耕してしまった…」は出ない（巣があります の知らせも出していないため。直す前は出た）', !!nest && nest.fm && !nest.vis && !/巣/.test(nest.say), nest);
      const rc = () => p.evaluate(() => { const r = id => { const e = document.getElementById(id), q = e.getBoundingClientRect(); return { x: Math.round(q.left + q.width / 2), y: Math.round(q.top + q.height / 2), w: Math.round(q.width) }; }, a = r('bAuto'), t = r('bArt'), el = document.elementFromPoint(a.x, a.y);
        return { fm: FIRSTMIN.on, auto: a, art: t, at: el ? el.id : '', n: [...document.querySelectorAll('#bar button')].filter(e => e.getBoundingClientRect().width > 0).length }; });
      const r0 = await rc(); await adv(60); const r1 = await rc(), at0 = await p.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? el.id : ''; }, [r0.auto.x, r0.auto.y]);
      ok('🌙 は 60 秒を またいでも 同じ場所（直す前：85px 左へ ずれ、そこに 📸 完成 が来る）', r0.fm && !r1.fm && r0.at === 'bAuto' && at0 === 'bAuto' && Math.abs(r1.auto.x - r0.auto.x) <= 1 && Math.abs(r1.auto.y - r0.auto.y) <= 1 && r1.n > r0.n, [r0.auto, r1.auto, at0, r0.n, r1.n]);
      ok('📸 完成 は 🌙 から はなれた所（100px 以上）に出る', r1.art.w > 0 && Math.abs(r1.art.x - r1.auto.x) >= 100, [r1.art, r1.auto]);
      await ctx.close();
    }
    // ---- 14-4) 田んぼの絵（glb）が届かない：のんびりでも 知らせが見える・タップで 読みこみ直す ----
    {
      let n = 0; const { ctx, p } = await open14('', q => q.route('**/field_tanbo*.glb', r => { n++; r.abort(); }), true);
      await p.waitForFunction(() => typeof LOAD_ST !== 'undefined' && LOAD_ST === 'ng');
      const f = await p.evaluate(() => { const t = document.getElementById('toast'), cs = getComputedStyle(t), r = t.getBoundingClientRect(); return { calm: document.body.classList.contains('calm'), disp: cs.display, op: +cs.opacity, w: Math.round(r.width), inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, text: t.textContent, cv: getComputedStyle(document.getElementById('view')).visibility, started: !!game.S.started }; });
      ok('田んぼの絵が届かない：のんびりでも「うまく 読みこめませんでした」が 画面に見える（直す前：かくれた #toast に入り 文字 0）', f.calm && f.disp !== 'none' && f.op > 0.9 && f.w > 100 && f.inView && /読みこめませんでした/.test(f.text) && /タップ/.test(f.text) && f.cv === 'hidden' && !f.started, f);
      const n0 = n; await p.evaluate(() => { window.__old = 1; }); await p.touchscreen.tap(195, 420);
      await p.waitForFunction(() => !window.__old && typeof LOAD_ST !== 'undefined' && LOAD_ST === 'ng');
      ok('その画面を タップすると 読みこみ直す', n > n0, [n0, n]);
      await ctx.close();
    }
    // ---- 14-5) 読みこみを待つ おおいの上でも、なぞった指の あと（黄色い点）が出る ----
    {
      let go; const gate = new Promise(r => { go = r; }), { ctx, p, cdp } = await open14('', q => q.route('**/field_tanbo*.glb', async r => { await gate; r.continue(); }));
      await p.waitForFunction(() => typeof PRE !== 'undefined' && typeof TRACE !== 'undefined' && document.getElementById('lwBar'));
      const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts }), dots = () => p.evaluate(() => { const tb = document.getElementById('traceDots'); return { n: [...tb.querySelectorAll('.tDot')].filter(e => e.style.display !== 'none').length, off: tb.classList.contains('off'), started: !!game.S.started, cover: !document.getElementById('loadWait').classList.contains('off') }; });
      await T('touchStart', [{ x: 195, y: 557, id: 1 }]); for (let i = 1; i <= 8; i++) await T('touchMove', [{ x: 195, y: 557 - i * 12, id: 1 }]);
      const c1 = await dots(); await T('touchEnd', []);
      await p.waitForFunction(() => document.getElementById('traceDots').classList.contains('off'), null, { timeout: 120000 }).catch(() => {}); const c2 = await dots();
      ok('おおいの上を なぞると 黄色い点が出る（直す前 0 個）・離すと消える', c1.cover && !c1.started && c1.n >= 4 && !c1.off && c2.off && !c2.started, [c1, c2]);
      // 表の のこり 1 行（読みこみ中の なぞりを 置いたまま 始まる）：拡大していても、始まって その なぞりが 動きだしたら 1 倍に もどる（本物の時計・本物の こま）
      await T('touchStart', [{ x: 195, y: 557, id: 1 }]); for (let i = 1; i <= 8; i++) await T('touchMove', [{ x: 195, y: 557 - i * 12, id: 1 }]);
      await p.evaluate(() => { fovZoom = 1.6; camera.fov = baseFov / fovZoom; camera.updateProjectionMatrix(); }); go();
      await p.waitForFunction(() => game.S.started && TRACE.on, null, { timeout: 170000 }).catch(() => {});
      await p.waitForFunction(() => fovZoom === 1, null, { timeout: 60000 }).catch(() => {});
      const pr = await p.evaluate(() => ({ started: !!game.S.started, on: TRACE.on, zoom: +fovZoom.toFixed(2) })); await T('touchEnd', []);
      ok('2 本の指の表（のこり 1 行）：読みこみ中の なぞりを 置いたまま 始まると、拡大（1.6 倍）は 1 倍に もどって なぞりが 動く', pr.started && pr.on && pr.zoom === 1, pr);
      await ctx.close();
    }
    // ---- 15) サイクル275（はじめの 1 分で やめる人を へらす）：始まった あとの エラー・止まった 読みこみ・前の くわしい説明・置いただけの 親指 ----
    // 15-1) 音を 作れない ブラウザ（Web Audio が ない・作ると エラー）：始まった ゲームは かくれず、なぞれば 進む（直す前：田んぼが かくれ「読みこめませんでした」・なぞって 0m）
    for (const [lab, init] of [['Web Audio が ない', 'window.AudioContext = undefined; window.webkitAudioContext = undefined;'], ['Web Audio を 作ると エラー', 'window.AudioContext = function () { throw new DOMException("denied", "NotSupportedError"); }; window.webkitAudioContext = window.AudioContext;']]) {
      const { ctx, p, cdp } = await open14('', q => q.addInitScript(init)); await fake14(p);
      const adv = s => p.evaluate(x => window.__adv(x), s), T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
      const sv = () => p.evaluate(() => ({ started: !!game.S.started, loadng: document.body.classList.contains('loadng'), cv: getComputedStyle(document.getElementById('view')).visibility, err: document.getElementById('toast').classList.contains('err'), snd: document.getElementById('bSnd').textContent, z: game.S.z, til: tilledCount }));
      await adv(2); const a0 = await sv();
      await T('touchStart', [{ x: 195, y: 481, id: 1 }]); for (let i = 1; i <= 18; i++) { await T('touchMove', [{ x: 195, y: 481 - 84 * i / 18, id: 1 }]); await adv(0.05); }
      await adv(3.5); await T('touchEnd', []); await adv(1); const a1 = await sv();
      ok(lab + '：始まった ゲームは かくれない・知らせも 出ない・🔇 のまま なぞれば 進む（直す前：かくれて 0m）', a0.started && !a0.loadng && a0.cv === 'visible' && !a0.err && a0.snd === '🔇' && a1.z - a0.z > 1 && a1.til > a0.til, [a0.loadng, a0.cv, a0.err, a0.snd, +(a1.z - a0.z).toFixed(2), a1.til - a0.til]);
      await ctx.close();
    }
    // 15-1b) 読みこみ中に ほかの所（拡張・アプリの ブラウザ）の エラーが 来ても、おおいは そのまま・読みこみは つづく。この ページの スクリプトの エラーは 今までどおり 知らせる。始まった あとの エラーでは かくさない
    {
      let go; const gate = new Promise(r => { go = r; }), { ctx, p } = await open14('', q => q.route('**/field_tanbo*.glb', async r => { await gate; r.continue(); }));
      await p.waitForFunction(() => typeof PRE !== 'undefined' && document.getElementById('lwBar'));
      const sv = () => p.evaluate(() => ({ started: !!(window.game && game.S.started), cover: !document.getElementById('loadWait').classList.contains('off'), loadng: document.body.classList.contains('loadng'), cv: getComputedStyle(document.getElementById('view')).visibility }));
      await p.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { message: 'x', filename: 'chrome-extension://abc/inject.js' }))); await p.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' })));
      const e1 = await sv();
      await p.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { message: 'x', filename: location.href }))); const e2 = await sv();
      go(); await p.waitForFunction(() => window.game && game.S.started); await p.evaluate(() => { window.dispatchEvent(new ErrorEvent('error', { message: 'x', filename: location.href })); LOAD_NG(); }); const e3 = await sv();
      ok('読みこみ中の ほかの所の エラー：おおいは そのまま（直す前：おおいが消え 田んぼを かくして「読みこめませんでした」）。この ページの エラーは 知らせる・始まった あとは かくさない', !e1.started && e1.cover && !e1.loadng && !e2.started && e2.loadng && !e2.cover && e3.started && !e3.loadng && e3.cv === 'visible', [e1, e2, e3]);
      await ctx.close();
    }
    // 15-2) 読みこみが おそい・とちゅうで 止まる：線も 届いた数も ふえないと「時間が かかっています・このまま 待つか、タップで やりなおし」。three の 3 本を 読む間は 20 秒・ゲームが 読みはじめたら 8 秒。
    //       進みが もどる・始まる と 知らせは 消える。タップで 読みこみ直す（直す前：「指で なぞると 進みます」と 止まった線の まま ずっと。three が 来ない ときは 見はりが 1 つも 動かない）
    //       Codex 指摘：three.min.js が おそいだけ（12 秒で 届く）なら 知らせを 出さない（ページからは 届いた バイトが 見えないので、おそい 3G でも 届く 長さ＝20 秒 待つ）
    const DELAY = ms => q => q.route('https://cdn.jsdelivr.net/**/three.min.js', async r => { await new Promise(z => setTimeout(z, ms)); r.fulfill({ path: TN + '/build/three.min.js', contentType: 'text/javascript' }); });
    for (const [lab, pend, kind] of [['田んぼの glb が 返事を しない', q => q.route('**/field_tanbo*.glb', () => {}), 'stall8'], ['three.min.js が 返事を しない', q => q.route('https://cdn.jsdelivr.net/**/three.min.js', () => {}), 'stall20'],
      ['three.min.js が 12 秒 おくれて 届く', DELAY(12000), 'late12'], ['three.min.js が 25 秒 おくれて 届く', DELAY(25000), 'late25']]) {
      let html = 0; const { ctx, p } = await open14('', async q => { await pend(q); q.on('request', r => { if (/\/tractor\.html/.test(r.url())) html++; }); }, true, [390, 844], 'commit');
      const t0 = Date.now(), lw = () => p.evaluate(() => { const w = document.getElementById('loadWait'), t = w.querySelector('.lwT'), r = t.getBoundingClientRect(), b = w.querySelector('.lwB').getBoundingClientRect(); return { slow: w.classList.contains('slow'), text: t.textContent, cover: !w.classList.contains('off'), started: !!(window.game && game.S && game.S.started), three: !!window.THREE, gap: Math.round(b.top - r.bottom) }; }).catch(() => null);
      // 0.5 秒ごとに 見る：はじめて 知らせが 出た 秒・three が 届いた 秒・始まった 秒
      let first = null, s1 = null, three = null, st = null, slowAfterThree = false, s0 = null;
      for (let i = 0; i < 160; i++) { const s = await lw(), t = (Date.now() - t0) / 1000; if (!s) { await p.waitForTimeout(500); continue; } if (!s0 && t > 2) s0 = s;
        if (s.slow && first === null) { first = +t.toFixed(1); s1 = s; } if (s.three && three === null) three = +t.toFixed(1); if (s.started && st === null) st = +t.toFixed(1);
        if (three !== null && s.slow && t > three + 3) slowAfterThree = true;
        if ((kind === 'stall8' || kind === 'stall20') && first !== null) break; if (kind.startsWith('late') && st !== null && t > st + 2.5) break; await p.waitForTimeout(500); }   // late：見はりは 1 秒ごと。始まった あとの 1 回で 知らせを もとに もどすのを 待つ
      if (kind === 'stall8' || kind === 'stall20') {
        let mv = null; if (kind === 'stall8') { await p.evaluate(() => { document.getElementById('lwBar').style.width = '50%'; }); await p.waitForFunction(() => !document.getElementById('loadWait').classList.contains('slow'), null, { timeout: 20000 }).catch(() => {}); mv = await lw();
          await p.waitForFunction(() => document.getElementById('loadWait').classList.contains('slow'), null, { timeout: 90000 }).catch(() => {}); }
        const h0 = html; await p.touchscreen.tap(195, 420);
        for (let i = 0; i < 40 && html === h0; i++) await p.waitForTimeout(250);
        const lim = kind === 'stall8' ? [8, 18] : [20, 32];   // 見はりは 1 秒ごと（こんだ 機械では おくれる）。三 本の間は 20 秒より 前に 出ない
        ok(lab + '：はじめは いつもの 文字・' + (kind === 'stall8' ? 8 : 20) + ' 秒 ふえないと「時間が かかっています・待つか タップ」（文字は 線に かぶらない）・線が 動けば もとの 文字・タップで 読みこみ直す（直す前：ずっと 同じ 文字）',
          !!s0 && !s0.slow && /なぞると/.test(s0.text) && !!s1 && /時間が かかって/.test(s1.text) && /待つ/.test(s1.text) && /タップ/.test(s1.text) && s1.cover && !s1.started && s1.gap >= 0 && first >= lim[0] && first <= lim[1] && html > h0 && (!mv || (!mv.slow && /なぞると/.test(mv.text))), [first, s1 && s1.gap, mv && mv.slow, h0, html]);
      } else {
        const fin = await lw();
        ok(lab + '：' + (kind === 'late12' ? '知らせは 出ない' : '20 秒で 知らせ・届いたら 消える') + '・そのまま 始まる・読みこみ直さない（Codex 指摘：おそいだけの three で やりなおしを すすめない）',
          (kind === 'late12' ? first === null : first !== null && first >= 20 && three !== null && first < three + 1) && !slowAfterThree && st !== null && !!fin && !fin.slow && !fin.cover && /なぞると/.test(fin.text) && html === 1, [first, three, st, slowAfterThree, html]);
      }
      await ctx.close();
    }
    // 15-3) 前に「くわしい説明」を 入れていた人（localStorage に tractorDetail=1）：ほかの人と 同じ しずかな はじめの 1 分（直す前：計器・知らせが 出て 重なり スマホ縦 5〜6 組・320×568 で 22〜25 組）。記録は 消さない
    for (const vp of [[390, 844], [320, 568]]) {
      const { ctx, p } = await open14('', q => q.addInitScript(() => { try { localStorage.setItem('tractorDetail', '1'); localStorage.setItem('tractorPlays', '4'); } catch (e) {} }), false, vp);
      await p.waitForFunction(() => window.game && game.S && game.S.started); await p.waitForTimeout(1500);
      const r = await p.evaluate(() => { const vis = e => { const cs = getComputedStyle(e), q = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && q.width > 0 && q.height > 0; };
        const ls = [...document.querySelectorAll('#hud .chip, #bigPct, #toast, #bar button, #padB button, #padD button, #badgeCv, #badgeSt, #say')].filter(vis); let n = 0;
        for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) { const a = ls[i].getBoundingClientRect(), c = ls[j].getBoundingClientRect(); if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 2 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 2) n++; }
        return { calm: document.body.classList.contains('calm'), hud: vis(document.getElementById('hud')), pairs: n, keep: localStorage.getItem('tractorDetail'), plays: localStorage.getItem('tractorPlays') }; });
      ok('前に くわしい説明を 入れていた人（' + vp.join('×') + '）：のんびりの はじめの 1 分・計器は 出ない・重なり 0 組・記録は 消さない', r.calm && !r.hud && r.pairs === 0 && r.keep === '1' && r.plays !== null, r);
      await ctx.close();
    }
    // 15-4) 親指を 先に 置いてから、もう 1 本で まっすぐ前へ なぞる（スマホ横・縦の 左右のはし）：ほとんど 曲がらない（直す前：親指の側へ 0.38〜0.44rad＝22〜25°）
    {
      const out = [];
      for (const [vp, th] of [[[844, 390], [10, 340]], [[844, 390], [834, 340]], [[390, 844], [8, 800]], [[390, 844], null]]) {
        const { ctx, p, cdp } = await open14('', null, false, vp); await fake14(p);
        const adv = s => p.evaluate(x => window.__adv(x), s), T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts }), sv = () => p.evaluate(() => ({ x: game.S.x, z: game.S.z, yaw: game.S.yaw }));
        const [W, H] = vp, y0 = (W > H ? 0.58 : 0.57) * H, TH = th ? { x: th[0], y: th[1], id: 2 } : null, F = y => ({ x: W / 2, y, id: 1 });
        await adv(1.5); const a = await sv(); if (TH) { await T('touchStart', [TH]); await adv(0.5); }
        await T('touchStart', TH ? [TH, F(y0)] : [F(y0)]); for (let i = 1; i <= 10; i++) { await T('touchMove', TH ? [TH, F(y0 - 84 * i / 10)] : [F(y0 - 84 * i / 10)]); await adv(0.05); }
        await adv(2.5); const c = await sv(); await T('touchEnd', []); await adv(0.5);
        out.push([vp.join('x') + (th ? ' ' + th.join(',') : ' 親指なし'), +(c.yaw - a.yaw).toFixed(3), +Math.hypot(c.x - a.x, c.z - a.z).toFixed(2)]);
        await ctx.close();
      }
      ok('親指を 先に置いて もう 1 本で まっすぐ前へ：向きの ずれ 0.1rad（6°）より 小さい・3m 以上 進む（直す前 0.38〜0.44rad）', out.every(([, dy, m]) => Math.abs(dy) < 0.1 && m > 3), out);
    }
    // ---- 16) サイクル276（はじめの 1 分で やめる人を へらす）：おそい スマホでも ゲームの 時間は 本物の 時計どおり・回したあとも 置いたままの 指で なぞれる・ほかの 通信で 読みこみの 見はりが だまされない ----
    // 16-1) にせの時計で 1 こまの 間を かえる（frame(now) を now += 1000/fps で 呼ぶ。1 こまに 本物の タッチの 動きを 1 回）。前へ 84px を 1 秒で なぞって 4 秒で 離す（firstmin の 2 と 同じ 指）
    //       直す前（指の 時刻も にせの時計に そろえた 数）: 1 秒に 60・20 こま 5.29m・"0.8%"・離して 見本まで 1.6 秒・はじめの 1 分 60 秒 → 10 こま 2.70m・"0.4%"・1.8 秒・120 秒 → 5 こま 0.71m・"0.1%"・3.6 秒・240 秒
    //       （離して 見本までの 1.6 秒は ほとんど 止まるまでの 1.2 秒。止まり方は こまの 速さに よらない。おそい こまでは 見本が 1 こま ぶん おくれて 見える）
    {
      const R = {};
      // サイクル277: どの こまの 速さでも 同じ 田んぼ・同じ ゆれで はじめる（Math.random の たねを そろえる）。そろえないと、始まる 前に 回る 本物の こまの 数（機械の こみぐあい）で
      // 乱数と 状態が かわり、4 秒の 長さ（60 こまで 5.03〜5.33m）と 離した ときの 速さが ゆれ、見本までの 秒が 60 こまで 1.42〜1.67 秒と ゆれて、こまの 速さ どうしの 比べが 落ちた（通し 3 回のうち 2 回で 20 こまが 落ちた）
      // あわせて、本物の こまを はじめから 回さない（requestAnimationFrame を 止める）。始まる 前の 本物の こま（機械の こみぐあいで 数が かわる）で 乱数と 状態が ずれていた
      const seed = q => q.addInitScript(() => { window.requestAnimationFrame = () => 0; let a = 277; Math.random = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; });
      for (const fps of [60, 20, 10, 5]) {
        const { ctx, p, cdp } = await open14('', seed); await p.waitForFunction(() => window.game && game.S && game.S.started && typeof P !== 'undefined' && P.Rotary, null, { polling: 50 });   // rAF を 止めたので 時間で 見る
        await p.evaluate(() => { const real = performance.now.bind(performance); let now = real(); performance.now = () => now; window.__sync = () => { now = real(); }; const rr = window.requestAnimationFrame.bind(window), id = rr(() => {}); for (let k = id; k > id - 6; k--) cancelAnimationFrame(k);
          window.requestAnimationFrame = () => 0; game.renderer.render = () => {}; window.__now = () => now;
          window.__ly = null; addEventListener('pointermove', e => { window.__ly = e.clientY; }, true);   // サイクル277: 届いた 指の 高さ（下の Tm で 届くのを 待つ）
          Object.defineProperty(Event.prototype, 'timeStamp', { get() { return now; }, configurable: true });   // 指の 時刻も にせの時計に そろえる（本物の スマホでは こまと 指は 同じ 時計。そろえないと 指の 速さ（サイクル116）を 機械の こみぐあいで 読みちがえる）
          window.__F = (ms, n) => { let bad = 0; for (let i = 0; i < n; i++) { now += ms; frame(now); const S = game.S; if (!isFinite(S.x + S.z + S.yaw + S.v + S.steer)) bad++; } window.__bad = (window.__bad || 0) + bad; return { x: game.S.x, z: game.S.z, v: game.S.v, big: document.getElementById('bigPct').textContent, til: tilledCount, hint: HINT.demoK >= 0 && !document.getElementById('hintSwipe').classList.contains('hidden'), over: FIRSTMIN.over, ft: FIRSTMIN.t, now }; }; });
        await p.waitForTimeout(2500); await p.evaluate(() => window.__sync());
        const ms = 1000 / fps, F = n => p.evaluate(([m, k]) => window.__F(m, k), [ms, n]), T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
        // サイクル277: touchMove は CDP の 返事の あと、本物の 次の こまで 届く。届く 前に にせの こまを 進めると、指の 動きが こまに 対して ずれ、本物の こみぐあいで 数が ゆれた（20 こまの 見本まで 1.6〜1.75 秒）。
        // 動いた ときは ページに 届くのを 待ってから こまを 進める（同じ 場所の 動きは 届かない ことが あるので 待たない）
        let lastY = null; const Tm = async (x, y) => { await T('touchMove', [{ x, y, id: 1 }]); if (lastY === null || Math.abs(y - lastY) >= 0.5) await p.waitForFunction(v => window.__ly !== null && Math.abs(window.__ly - v) < 0.5, y, { timeout: 60000, polling: 20 }); lastY = y; };
        await F(2 * fps); const s0 = await p.evaluate(() => ({ x: game.S.x, z: game.S.z, ft: FIRSTMIN.t, now: window.__now() }));
        await T('touchStart', [{ x: 195, y: 481, id: 1 }]); let s;
        for (let i = 0; i < 4 * fps; i++) { await Tm(195, 481 - 84 * Math.min(1, (i + 1) / fps)); s = await F(1); }
        const d4 = Math.hypot(s.x - s0.x, s.z - s0.z), vL = Math.abs(s.v); await T('touchEnd', []); const tL = s.now;
        await p.evaluate(() => new Promise(r => setTimeout(r, 300)));   // 離した 知らせを 先に 受けとる
        await p.waitForFunction(() => !TRACE.on && touchIds.size === 0, null, { timeout: 60000, polling: 20 });   // サイクル278: 離した 知らせが 届いた のを 見てから こまを 進める
        let hint = null, tStop = null; for (let i = 0; i < 10 * fps && hint === null; i++) { s = await F(1); if (tStop === null && Math.abs(s.v) < 0.05) tStop = s.now; if (s.hint) hint = (s.now - tL) / 1000; }
        const hs = hint === null || tStop === null ? null : (tL + hint * 1000 - tStop) / 1000;   // 止まってから 見本まで（本物の 秒）
        const glide = tStop === null ? null : (tStop - tL) / 1000;   // サイクル278（Codex 指摘）: 離してから 止まるまで（本物の 秒）。すべりが おそい こまで だけ 長く なる こわれ方を 見る
        // 大きな数字は 耕した ます目が 落ちついてから 読む（firstmin の 2 と 同じ）
        let big = s.big; { let c = -1; for (let i = 0; i < 12; i++) { const q = await F(Math.max(1, Math.round(fps / 2))); if (q.til === c) { big = (await F(Math.max(1, Math.round(fps / 5)))).big; break; } c = q.til; } }
        // はじめの 1 分が おわる 本物の 秒（始まってから）
        let fm = null; for (let i = 0; i < 1200 && fm === null; i++) { const q = await F(Math.max(1, Math.round(fps / 4))); if (q.over) fm = (q.now - s0.now) / 1000 + s0.ft; }   // 0.25 秒ずつ 見る
        // タップ（0.1 秒）・はじき（0.2 秒で 40px）で 進む 長さ・畦まで 前へ 走る（畦の 手前で 止まる＝畦を こえない）
        const tap = async flick => { await p.evaluate(() => Object.assign(game.S, { x: 0, z: -6, yaw: 0, v: 0, steer: 0 })); await F(fps); const a = await F(1); await T('touchStart', [{ x: 195, y: 481, id: 1 }]);
          const n = Math.floor((flick ? 0.2 : 0.1) * fps + 1e-9); for (let i = 1; i <= n; i++) { if (flick) await Tm(195, 481 - 40 * i / n); await F(1); } await T('touchEnd', []); await p.evaluate(() => new Promise(r => setTimeout(r, 200))); const c = await F(4 * fps); return Math.hypot(c.x - a.x, c.z - a.z); };   // 0.1 秒の タップは 1 秒に 5 こまでは こまを またがない（0 こま）
        const tp = await tap(false), fl = await tap(true);
        await p.evaluate(() => Object.assign(game.S, { x: 0, z: HZ - 9, yaw: 0, v: 0, steer: 0 })); await F(fps);
        await T('touchStart', [{ x: 195, y: 481, id: 1 }]); for (let i = 0; i < fps; i++) { await Tm(195, 481 - 200 * Math.min(1, (i + 1) / fps)); await F(1); }
        let zmax = -99; for (let i = 0; i < 10; i++) { const q = await F(fps); zmax = Math.max(zmax, q.z); } await T('touchEnd', []); await F(fps);
        const hz = await p.evaluate(() => HZ), bad = await p.evaluate(() => window.__bad);
        R[fps] = { d4: +d4.toFixed(2), vL: +vL.toFixed(2), glide: glide === null ? null : +glide.toFixed(2), dec: glide ? +(vL / glide).toFixed(2) : null, big, hint: hint === null ? null : +hint.toFixed(2), hs: hs === null ? null : +hs.toFixed(2), fm: fm === null ? null : +fm.toFixed(1), tap: +tp.toFixed(2), flick: +fl.toFixed(2), ridge: +(hz - zmax).toFixed(2), bad };
        await ctx.close();
      }
      const a = R[60], near = (x, y, e) => Math.abs(x - y) <= e;
      ok('1 秒に 60 こま：4 秒で 4.5m 以上 進む・止まってから 見本まで 0.4 秒 ＋2 こま 以内・はじめの 1 分は 60±2 秒', a.d4 > 4.5 && a.hs !== null && a.hs <= 0.4 + 2 / 60 + 0.05 && near(a.fm, 60, 2), R[60]);
      // 20 こま（1 こま ちょうど 0.05 秒）は 直す前も 後も 同じ 道。指の 知らせと こまの 前後で 走りが 少し ゆれる（直す前も 5.28〜5.39m・1.65〜1.75 秒）ので、おそい こまと 同じ ものさしで 見る
      for (const f of [20, 10, 5]) ok('1 秒に ' + f + ' こま：本物の 時計どおり（4 秒で 60 こまの 9 割 以上・数字は 同じ ±0.1・止まってから 見本まで 0.4 秒 ＋2 こま 以内（サイクル277：離してから 見本までは 止まるまでの すべり（約 1.2 秒）が 開く たびに ゆれる＝60 こまで 1.42〜1.67 秒 なので、べつの ページの 60 こまとは くらべない）・はじめの 1 分は 60±2 秒。直す前 ' + ({ 20: '60 こまと 同じ', 10: '2.70m・0.4%・1.8 秒・120 秒', 5: '0.71m・0.1%・3.6 秒・240 秒' })[f] + '）',
        R[f].d4 >= 0.9 * a.d4 && near(parseFloat(R[f].big), parseFloat(a.big), 0.1) && R[f].hs !== null && R[f].hs <= 0.4 + 2 / f + 0.05 && near(R[f].fm, 60, 2), [R[f], a.hint]);
      // サイクル278（Codex 指摘）: 離してから 止まるまでの すべりも 見る（見本の 待ちは 止まってから はかる ように したので、ここが ないと「離した あとの 減速 だけ おそい こまで のろく なる」こわれ方を 見のがす）。
      // 離した ときの 速さが 開く たびに 少し ゆれる（0.64〜0.83 m/秒）ので、減り方（離した ときの 速さ ÷ 止まるまでの 秒）で くらべる。はかった数: 60・20・10・5 こまで 0.59〜0.65 m/秒²・すべり 1.0〜1.4 秒。
      // 「指が ない ときは こまを わけずに 1 回だけ 進める」に こわした コピーでは 10 こま 0.31・5 こま 0.16（すべり 2.6・5.2 秒）
      ok('離してから 止まるまで：どの こまの 速さでも 減り方が 60 こまの 8 割 以上・すべりは 2 秒 以内（Codex 指摘）', [60, 20, 10, 5].every(f => R[f].glide !== null && R[f].glide <= 2 && R[f].dec >= 0.8 * a.dec), Object.fromEntries(Object.entries(R).map(([k, v]) => [k, [v.vL, v.glide, v.dec]])));
      ok('おそい こまでも タップ・はじきで 60 こまより 進まない（+0.15m まで）・畦の 手前で 止まる（60 こまと ±0.3m）・NaN なし', [20, 10, 5].every(f => R[f].tap <= a.tap + 0.15 && R[f].flick <= a.flick + 0.15 && near(R[f].ridge, a.ridge, 0.3) && R[f].ridge > 0 && R[f].bad === 0) && a.bad === 0, Object.fromEntries(Object.entries(R).map(([k, v]) => [k, [v.tap, v.flick, v.ridge, v.bad]])));
    }
    // 16-2) なぞっている 指を 置いたまま 画面を 回す（縦 → 横）：同じ 指を 動かすと また なぞれる（直す前：120px 動かして 2 秒で 0.02m。回さなければ 2.4〜2.7m）。回した しゅんかんの 線は つづけない（とばない）
    {
      const { ctx, p, cdp } = await open14(''); await fake14(p);
      const adv = s => p.evaluate(x => window.__adv(x), s), T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts }), sv = () => p.evaluate(() => ({ z: game.S.z, v: game.S.v, on: TRACE.on, pts: viewPts.size }));
      await adv(2); await T('touchStart', [{ x: 195, y: 481, id: 1 }]); for (let i = 1; i <= 10; i++) { await T('touchMove', [{ x: 195, y: 481 - 4 * i, id: 1 }]); await adv(0.05); }
      const r0 = await sv(); await p.setViewportSize({ width: 844, height: 390 }); await p.evaluate(() => new Promise(r => setTimeout(r, 300))); await adv(1.5); const r1 = await sv();
      for (let i = 1; i <= 40; i++) { await T('touchMove', [{ x: 422, y: 300 - 3 * i, id: 1 }]); await adv(0.05); } const r2 = await sv(); await T('touchEnd', []); await adv(1); const r3 = await sv();
      ok('置いたまま 画面を 回す：回すと 止まる・同じ 指を 動かすと また なぞれて 2 秒で 1m 以上（直す前 0.02m）・離すと 終わる', r0.on && !r1.on && Math.abs(r1.v) < 0.05 && r2.on && r2.z - r1.z > 1 && !r3.on && r3.pts === 0, [r0.on, r1.on, +r1.v.toFixed(2), r2.on, +(r2.z - r1.z).toFixed(2), r3.on, r3.pts]);
      await ctx.close();
    }
    // 16-3) 車体の glb が 返事を しない ときに、ページが 5 秒ごとに ほかの 読みこみを する：それでも 8 秒ほどで 知らせ（直す前：32 秒たっても 出ない）
    {
      const { ctx, p } = await open14('', q => q.route('**/tractor_yt.glb', () => {}), true, [390, 844], 'commit');
      await p.waitForFunction(() => window.game, null, { timeout: 90000 }).catch(() => {}); const t0 = Date.now();
      await p.evaluate(() => { let i = 0; setInterval(() => fetch('/tools/tractor/README.md?x=' + (i++)).catch(() => {}), 5000); });
      let first = null; for (let i = 0; i < 80 && first === null; i++) { if (await p.evaluate(() => document.getElementById('loadWait').classList.contains('slow'))) first = (Date.now() - t0) / 1000; else await p.waitForTimeout(500); }
      const n = await p.evaluate(() => performance.getEntriesByType('resource').filter(e => /README/.test(e.name)).length);
      ok('車体が 返事を しない・ほかの 読みこみが 5 秒ごと：知らせが 20 秒 以内に 出る（直す前：32 秒 出ない）', first !== null && first <= 20 && n >= 1, [first, n]);
      await ctx.close();
    }
    // 16-4) まだ 耕して いない 間に 顔（運転する 人）を 押す：1 回めは する ことを 言う（はじめの 案内と 同じ 文「田んぼを ゆびで なぞる」）。2 回めからは 雑談。耕しはじめた あとは はじめから 雑談
    //       （直す前：雑談だけ。開いて 3 秒から 1 秒に 1 回 押すと 10 回 ぜんぶ 雑談・する ことは 0 回）
    {
      const face = [];
      for (const tillFirst of [false, true]) {
        const { ctx, p, cdp } = await open14(''); await fake14(p);
        const adv = s => p.evaluate(x => window.__adv(x), s), T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
        await adv(2);
        if (tillFirst) { await T('touchStart', [{ x: 195, y: 481, id: 1 }]); for (let i = 1; i <= 10; i++) { await T('touchMove', [{ x: 195, y: 481 - 8.4 * i, id: 1 }]); await adv(0.05); } await adv(2); await T('touchEnd', []); await adv(5); }
        const c = await p.evaluate(() => { const q = document.getElementById('badgeCv').getBoundingClientRect(); return [Math.round(q.left + q.width / 2), Math.round(q.top + q.height / 2)]; });
        const said = [];
        for (let k = 0; k < 3; k++) { await T('touchStart', [{ x: c[0], y: c[1], id: 1 }]); await T('touchEnd', []); await p.evaluate(() => new Promise(r => setTimeout(r, 200))); await adv(0.1);
          said.push(await p.evaluate(() => [document.getElementById('say').innerText.split('\n')[0], tilledCount > 0])); await adv(4); }
        face.push(said); await ctx.close();
      }
      const how = x => x[0] === '田んぼを ゆびで なぞる';
      ok('耕す前に 顔を 押すと 1 回めは「田んぼを ゆびで なぞる」・2 回めからは 雑談。耕しはじめた あとは 雑談（直す前：する ことは 0 回）', how(face[0][0]) && !face[0][0][1] && !how(face[0][1]) && face[0][1][0] !== '' && !how(face[0][2]) && face[1].every(x => x[1] && !how(x) && x[0] !== ''), face);
    }
    // 16-5・16-6) Codex 指摘（サイクル276 の PR）。にせの時計（1 こまの 間を かえる・指の 時刻も そろえる）
    {
      const open5 = async () => { const { ctx, p, cdp } = await open14(''); await p.waitForFunction(() => window.game && game.S && game.S.started && typeof P !== 'undefined' && P.Rotary);
        await p.evaluate(() => { const real = performance.now.bind(performance); let now = real(); performance.now = () => now; window.__sync = () => { now = real(); }; const rr = window.requestAnimationFrame.bind(window), id = rr(() => {}); for (let k = id; k > id - 6; k--) cancelAnimationFrame(k);
          window.requestAnimationFrame = () => 0; game.renderer.render = () => {}; Object.defineProperty(Event.prototype, 'timeStamp', { get() { return now; }, configurable: true });
          window.__F = (ms, n) => { for (let i = 0; i < n; i++) { now += ms; frame(now); } return { two: viewTwo, on: TRACE.on, zoom: +fovZoom.toFixed(2), x: game.S.x, z: game.S.z, pts: viewPts.size }; }; });
        await p.waitForTimeout(2500); await p.evaluate(() => window.__sync());
        // サイクル277: 指の 知らせ（touchMove）は 本物の 次の こまで 届く（CDP の 返事の あとに 届く：10 回のうち 10 回）。決まった 250ms では、本物の こまが 1 秒に 1.3〜1.7 の 機械で
        // 届く 前に 読んで 落ちた（ゲームの 穴では ない）。届いた ことを ページで 見てから 進める（seen：その 指の 場所が 今の 値に なるまで 待つ）
        const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
        const seen = pts => p.waitForFunction(q => q.every(o => { const v = viewPts.get(window.__pid ? window.__pid[o.id] : o.id); return v && v.x === o.x && v.y === o.y; }), pts, { timeout: 60000 });
        await p.evaluate(() => { window.__pid = {}; let n = 0; canvas.addEventListener('pointerdown', e => { window.__pid[++n] = e.pointerId; }, true); window.__pidReset = () => { window.__pid = {}; n = 0; }; });
        return { ctx, p, T, seen, fl: () => p.evaluate(() => new Promise(r => setTimeout(r, 250))) }; };
      // 16-5) 1 秒に 5 こま・60 こま：片方が 先に 20px 動いて 2 こま あと「なぞる」に 決まり、その すぐ あとに もう片方も 20px 動く → 寄って見る に 直る（直す前：5 こまでは なぞり運転が つづく）
      const r5 = {};
      for (const fps of [5, 60]) {
        const { ctx, p, T, seen } = await open5(); const F = n => p.evaluate(([m, k]) => window.__F(m, k), [1000 / fps, n]), P2 = (a, c) => [{ x: a, y: 520, id: 1 }, { x: c, y: 520, id: 2 }];
        await F(2 * fps); await T('touchStart', P2(165, 225)); await seen(P2(165, 225)); await F(1);
        await T('touchMove', P2(145, 225)); await seen(P2(145, 225)); await F(1); const d = await F(1);
        await T('touchMove', P2(145, 245)); await seen(P2(145, 245)); const a = await F(0); await T('touchEnd', []); await F(fps);
        r5[fps] = [d.two, a.two, a.on, a.zoom]; await ctx.close();
      }
      // 16-5b) 指の 知らせと こまの 順を 決めて 流す（ページの 中で PointerEvent を 出す＝届く 順が きまる）。1 秒に 5 こま・60 こま
      //   o1 決めた こま → もう片方の 動き → 次の こま：寄って見る　o2 決めた こま → 次の こま → もう片方の 動き：60 こまは 寄って見る・5 こまは 0.2 秒 すぎたので なぞりの まま（0.15 秒の きまり どおり）
      //   o3 両方の 動きが 決める 前に 届く：寄って見る　o4 決める こまの 前に 片方・決めた こまの すぐ あとに もう片方（同じ こまの 間）：寄って見る
      const ordR = {};
      { const { ctx, p } = await open5();
        for (const fps of [5, 60]) for (const o of ['o1', 'o2', 'o3', 'o4']) {
          ordR[fps + o] = await p.evaluate(([ms, o]) => { canvas.setPointerCapture = () => {}; fovZoom = 1; camera.fov = baseFov; camera.updateProjectionMatrix(); Object.assign(game.S, { x: 0, z: -12, yaw: 0, v: 0, steer: 0 }); window.__F(ms, 3);
            const E = (type, id, x, prim) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: 520, isPrimary: prim, pointerType: 'touch', buttons: type === 'pointerup' ? 0 : 1, bubbles: true }));
            E('pointerdown', 901, 165, true); E('pointerdown', 902, 225, false); window.__F(ms, 1);
            E('pointermove', 901, 145, true); if (o === 'o3') E('pointermove', 902, 245, false);
            window.__F(ms, 1); window.__F(ms, 1);   // 2 こま：ここで 決まる
            if (o === 'o1' || o === 'o4') E('pointermove', 902, 245, false);
            window.__F(ms, 1); if (o === 'o2') E('pointermove', 902, 245, false);
            const r = [viewTwo, TRACE.on, +fovZoom.toFixed(2)]; E('pointerup', 902, 245, false); E('pointerup', 901, 145, true); window.__F(ms, 3); return r; }, [1000 / fps, o]);
        }
        await ctx.close(); }
      const pin = r => r[0] === 'pinch' && !r[1] && r[2] > 1.5;
      ok('指の 知らせと こまの 順を 決めて 流す：決めた すぐ あと（o1・o4）・決める 前（o3）は 寄って見る（1 秒に 5 こまも 60 こまも）。決めた 次の こまより あと（o2）は 60 こまで 寄って見る・5 こまは 0.15 秒 すぎで なぞりの まま', ['5o1', '5o3', '5o4', '60o1', '60o2', '60o3', '60o4'].every(k => pin(ordR[k])) && ordR['5o2'][0] === 'trace', ordR);
      ok('なぞりに 決まった すぐ あとに もう片方も 動くと 寄って見る に 直る（1 秒に 5 こまでも。直す前：5 こまでは なぞり運転が つづく）', [5, 60].every(f => r5[f][0] === 'trace' && r5[f][1] === 'pinch' && !r5[f][2] && r5[f][3] > 1.5), r5);
      // 16-6) 2 本の指を 置いたまま 画面を 回す（pointercancel が 来ない）：そのまま 2 本で 広げると 寄って見る（走らない）。片方を 離してから もう 1 本を 動かすと その指で なぞれる
      //       （直す前：広げると 1 本指の なぞりに なって 0.85m 走る・片方を 離すと のこった 指は 0m）
      const r6 = {};
      for (const mode of ['spread', 'liftOne']) {
        const { ctx, p, T, fl, seen } = await open5(); const F = n => p.evaluate(([m, k]) => window.__F(m, k), [50, n]), A = (x, y) => ({ x, y, id: 1 }), B = (x, y) => ({ x, y, id: 2 });
        await F(40); await T('touchStart', [A(165, 520), B(225, 520)]); await seen([A(165, 520), B(225, 520)]); await F(2);
        await p.setViewportSize({ width: 844, height: 390 }); await fl(); const s1 = await F(10); let s2;
        if (mode === 'spread') { for (let i = 1; i <= 8; i++) { await T('touchMove', [A(392 - 10 * i, 300), B(452 + 10 * i, 300)]); await seen([A(392 - 10 * i, 300), B(452 + 10 * i, 300)]); await F(1); } await fl(); s2 = await F(20); }
        else { await T('touchEnd', [B(452, 300)]); await fl(); await F(2); for (let i = 1; i <= 40; i++) { await T('touchMove', [A(392, 330 - 3 * i)]); await seen([A(392, 330 - 3 * i)]); await F(1); } await fl(); s2 = await F(1); }
        await T('touchEnd', []); await F(20); const s3 = await F(0);
        r6[mode] = { two: s2.two, on: s2.on, zoom: s2.zoom, moved: +Math.hypot(s2.x - s1.x, s2.z - s1.z).toFixed(2), endPts: s3.pts }; await ctx.close();
      }
      ok('2 本を 置いたまま 回す：2 本で 広げると 寄って見る・走らない。片方を 離すと のこった 指で なぞれる（直す前：広げて 0.85m 走る・のこった 指は 0m）', r6.spread.two === 'pinch' && !r6.spread.on && r6.spread.zoom > 1.5 && r6.spread.moved < 0.05 && r6.liftOne.on && r6.liftOne.moved > 0.8 && r6.spread.endPts === 0 && r6.liftOne.endPts === 0, r6);
    }
    // 16-7) 復号器（Draco）の wasm が こわれて 届く（HTTP 200）：Worker の 中で 止まり、読みこみの 失敗にも ならない → 用意の 間の 40 秒で「時間が かかっています・待つか タップ」・タップで 読みこみ直す
    //       （直す前 cfb0cec5：ファイルが ぜんぶ 届くと 見はりを 止めていて、ずっと「指で なぞると 進みます」）。wasm が 404：すぐ「読みこめませんでした」（直す前：ずっと おおい）
    for (const mode of ['broken', '404']) {
      const e0 = errs.length;   // わざと こわした・404 に した wasm の エラー（Worker の 中の abort・CompileError・受けとられない ProgressEvent）は 数えない（quiet と 同じ。ほかの エラーは 数える）
      let html = 0; const { ctx, p } = await open14('', async q => { await q.route('https://cdn.jsdelivr.net/**/draco_decoder.wasm', r => mode === 'broken' ? r.fulfill({ status: 200, body: Buffer.from('this is not wasm at all'), contentType: 'application/wasm' }) : r.fulfill({ status: 404, body: '' })); q.on('request', r => { if (/\/tractor\.html/.test(r.url())) html++; }); }, true, [390, 844], 'commit');
      const t0 = Date.now(); let first = null, ng = null, st = false;
      for (let i = 0; i < 180 && first === null && ng === null; i++) { const s = await p.evaluate(() => { const w = document.getElementById('loadWait'); return w ? [w.classList.contains('slow'), document.body.classList.contains('loadng'), !!(window.game && game.S && game.S.started)] : [false, false, false]; }).catch(() => [false, false, false]);
        const t = (Date.now() - t0) / 1000; if (s[0]) first = t; if (s[1]) ng = t; st = st || s[2]; if (first === null && ng === null) await p.waitForTimeout(500); }
      if (mode === 'broken') { const h0 = html; await p.touchscreen.tap(195, 420); for (let i = 0; i < 40 && html === h0; i++) await p.waitForTimeout(250);
        ok('復号器の wasm が こわれて 届く：始まらず、40 秒ほどで「時間が かかっています・待つか タップ」（30 秒より 前には 出ない）・タップで 読みこみ直す（直す前：ずっと 出ない）', !st && first !== null && first >= 30 && first <= 75 && html > h0, [first, st, h0, html]); }
      else ok('復号器の wasm が 404：15 秒 以内に「読みこめませんでした」（直す前：ずっと おおい）', !st && ng !== null && ng <= 15, [ng, st]);
      await ctx.close();
      for (let k = errs.length - 1; k >= e0; k--) if (/CompileError|abort\(|wasm|^pageerror ProgressEvent$/.test(errs[k])) errs.splice(k, 1);   // 404 では three の DRACOLoader が 読みこみの 失敗（ProgressEvent）を 受けとらずに 落とす
    }
    // ---- 17) サイクル277（はじめの 1 分 すぎで やめる人を へらす）：修理の 間、吹き出しの 上の だんに 進みぐあいの 棒・なぞると 1 回 ゆれる・おわると 棒は 消えて「▲ でエンジンをかける」 ----
    //       直す前（にせの時計・手本どおりに 耕しつづける 人・スマホ縦）：右はしの爪 61〜67 秒・グリース 77.5〜82.5 秒。なぞり 2 回とも 動かない・画面で かわる 物は 5 つ（文だけ）・ゆれ 0 回
    {
      const { ctx, p, cdp } = await open14(''); await fake14(p);
      let clk = 0; const adv = s => { clk += s; return p.evaluate(x => window.__adv(x), s); }, T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });   // clk＝進めた ゲームの 秒
      const fx = () => p.evaluate(() => { const b = document.getElementById('fixBar'), f = document.getElementById('fixFill'), say = document.getElementById('say'), r = b ? b.getBoundingClientRect() : null, big = document.getElementById('bigPct').getBoundingClientRect();
        return { on: !!b && b.classList.contains('on') && getComputedStyle(b).display !== 'none' && !say.classList.contains('off'), fill: f ? +(f.style.transform.match(/scaleX\(([\d.]+)\)/) || [0, 0])[1] : null, n: game.FIXBAR ? game.FIXBAR.n : null, heri: game.HERI.fixing, left: game.HERI.left, fm: FIRSTMIN.on,
          x: game.S.x, z: game.S.z, til: tilledCount, big: document.getElementById('bigPct').textContent, say: say.innerText, overBig: r && r.width > 0 ? !(r.right <= big.left || r.left >= big.right || r.bottom <= big.top || r.top >= big.bottom) : false }; });
      // 右はしの爪（春・点検なし＝いつもの はじまり）が すり減った まま 15m ほど 耕す → 止まって 上げる。修理は はじめの 1 分の あとに 始まる（サイクル212 の きまり）
      await adv(2); await p.evaluate(() => { Object.assign(game.S, { x: 0, z: -14, yaw: 0, v: 0, steer: 0 }); if (!game.S.rotDown) game.toggleRotary(); game.key.fwd = 1; }); await adv(18);
      await p.evaluate(() => { game.key.fwd = 0; }); await adv(3); await p.evaluate(() => { if (game.S.rotDown) game.toggleRotary(); }); await adv(3);
      const pre = await fx();
      let t = 0, a = null; for (; t < 80 && !(a = await fx()).heri; t += 0.05) await adv(0.05);
      const c0 = clk;   // 修理が 始まった こま
      const t0 = await p.evaluate(() => FIRSTMIN.t);
      const b1 = await fx(); await adv(1); const b2 = await fx();
      // 修理の 間に なぞる：1 本の指で 2 回・2 本の指で 1 回 → ゆれは 3 回。動かない・耕さない・数字は かわらない
      const n0 = b2.n;
      for (let k = 0; k < 2; k++) { await T('touchStart', [{ x: 195, y: 481, id: 1 }]); for (let i = 1; i <= 6; i++) { await T('touchMove', [{ x: 195, y: 481 - 14 * i, id: 1 }]); await adv(0.05); } await T('touchEnd', []); await adv(0.2); }
      await T('touchStart', [{ x: 165, y: 520, id: 1 }, { x: 225, y: 520, id: 2 }]); for (let i = 1; i <= 4; i++) { await T('touchMove', [{ x: 165 - 8 * i, y: 520, id: 1 }, { x: 225 + 8 * i, y: 520, id: 2 }]); await adv(0.05); } await T('touchEnd', []); await adv(0.2);
      const b3 = await fx();
      for (let i = 0; i < 600 && (await fx()).heri; i++) await adv(0.05);
      const dur = clk - c0;
      await adv(0.5); const b4 = await fx();
      await p.evaluate(() => { game.key.fwd = 0; }); await ctx.close();
      ok('修理（右はしの爪）は はじめの 1 分の あとに 始まり、長さは 今までどおり 6 秒（±0.2）', !pre.heri && a.heri && !a.fm && Math.abs(dur - 6) <= 0.25, [pre.heri, a.heri, +t0.toFixed(1), +dur.toFixed(2)]);
      ok('修理の 間、吹き出しの 上の だんに 進みぐあいの 棒が 出て のびる（1 秒で ふえる）・大きな 数字に かぶらない（直す前：棒なし）', b1.on && b2.on && b2.fill > b1.fill + 0.1 && b2.fill < 1 && !b2.overBig, [b1.on, b1.fill, b2.fill, b2.overBig]);
      ok('修理の 間に なぞると 1 回の なぞりに 1 回 棒が ゆれる（3 回 → 3）・動かない・耕さない・数字も かわらない（直す前：何も 返らない）', b3.n - n0 === 3 && Math.hypot(b3.x - b2.x, b3.z - b2.z) < 0.05 && b3.til === b2.til && b3.big === b2.big, [b3.n - n0, +Math.hypot(b3.x - b2.x, b3.z - b2.z).toFixed(3), b3.til - b2.til, b2.big, b3.big]);
      ok('修理が おわると 棒は 消え、「▲ でエンジンをかける」が 吹き出しに 出る（今までどおり）', !b4.on && !b4.heri && /▲ でエンジンをかける/.test(b4.say), [b4.on, b4.say]);
    }
    // ---- 18) サイクル278（運営者の 実機の 声「スタート直後に音が出ない」）：音を 解く 聞き手は 鳴りだすまで 外さない ----
    //       ブラウザの きまりの まね：AudioContext は 止まった まま 作られ、resume は touchend・pointerup・click・keydown・mouseup の 中で だけ 効く（iPhone の Safari に 近い 形の まね。実機では 未確認）
    //       直す前：読みこみ中に 1 回 タップした 人は、聞き手が 音の できる 前に 外れて、なぞって 離しても 鳴らない
    {
      const snd = {};
      for (const cs of ['tapLoad', 'plain', 'mute']) {
        let go; const gate = new Promise(r => { go = r; });
        const { ctx, p, cdp } = await open14('', async q => { await q.route('**/field_tanbo*.glb', async r => { await gate; r.continue(); });
          await q.addInitScript(() => { const G = ['touchend', 'pointerup', 'click', 'keydown', 'mouseup'], A = window.AudioContext; if (!A) return; const R = A.prototype.resume;
            A.prototype.resume = function () { const e = window.event; return e && G.includes(e.type) ? R.call(this) : Promise.resolve(); };
            window.AudioContext = class extends A { constructor(...a) { super(...a); this.suspend(); } }; }); });
        const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts }), st = () => p.evaluate(() => game.audio ? game.audio.ac.state : 'none');
        await p.waitForFunction(() => typeof PRE !== 'undefined' && document.getElementById('lwBar'));
        if (cs === 'tapLoad') { await T('touchStart', [{ x: 195, y: 600, id: 1 }]); await T('touchEnd', []); await p.waitForTimeout(500); }   // 読みこみ中に 1 回 タップ
        go(); await p.waitForFunction(() => window.game && game.S && game.S.started && game.audio); await p.waitForTimeout(1500);
        if (cs === 'mute') await p.evaluate(() => game.toggleSound());   // 🔇 に した 人
        const s0 = await st();
        await T('touchStart', [{ x: 195, y: 481, id: 1 }]); for (let i = 1; i <= 10; i++) { await T('touchMove', [{ x: 195, y: 481 - 8.4 * i, id: 1 }]); await p.waitForTimeout(50); }
        await p.waitForTimeout(800); const sHold = await st();
        await T('touchEnd', []); await p.waitForFunction(() => game.audio && game.audio.ac.state === 'running', null, { timeout: 8000, polling: 100 }).catch(() => {}); const sUp = await st();   // 離した 知らせは 本物の 次の こまで 届き、resume も あとから 効く：鳴りだすのを 8 秒まで 待つ
        snd[cs] = [s0, sHold, sUp]; await ctx.close();
      }
      // 18-2) Codex 指摘：読みこみが おわってから 最初の こま（frame）までに 離した タップでも 音が 鳴りだす（直す前：前の こまの おぼえ audioWant が まだ false で 何も しない）。
      //       本物の こまを 回さない（requestAnimationFrame を 止める）ので、ずっと「最初の こまの 前」の まま
      { let go; const gate = new Promise(r => { go = r; });
        const { ctx, p, cdp } = await open14('', async q => { await q.route('**/field_tanbo*.glb', async r => { await gate; r.continue(); });
          await q.addInitScript(() => { window.requestAnimationFrame = () => 0; const G = ['touchend', 'pointerup', 'click', 'keydown', 'mouseup'], A = window.AudioContext; if (!A) return; const R = A.prototype.resume;
            A.prototype.resume = function () { const e = window.event; return e && G.includes(e.type) ? R.call(this) : Promise.resolve(); };
            window.AudioContext = class extends A { constructor(...a) { super(...a); this.suspend(); } }; }); });
        await p.waitForFunction(() => typeof PRE !== 'undefined' && document.getElementById('lwBar'), null, { polling: 100 }); go();
        await p.waitForFunction(() => window.game && game.S && game.S.started && game.audio, null, { polling: 100, timeout: 180000 });
        const f0 = await p.evaluate(() => [game.audio.ac.state, typeof last]);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 481, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await p.waitForFunction(() => game.audio.ac.state === 'running', null, { timeout: 8000, polling: 100 }).catch(() => {});
        snd.preFrame = [f0[0], await p.evaluate(() => game.audio.ac.state)]; await ctx.close(); }
      ok('始まった すぐ あと・最初の こまの 前に 離した タップでも 音が 鳴りだす（Codex 指摘。直す前：鳴らない）', snd.preFrame[0] !== 'running' && snd.preFrame[1] === 'running', snd.preFrame);
      // 18-3) Codex の はかり方：1 度 鳴った あとに 止まる 場面。操作の 表（H）を 開いて、とじる ボタンを タップ → その 操作で 鳴る。かくれて もどる（さわらない 間は 鳴らない）→ 1 回 さわれば 鳴る
      //       （直す前：1 度 鳴ると 聞き手を 外していたので、どちらも 次の 指の 操作でも 鳴らない）
      { const { ctx, p, cdp } = await open14('', q => q.addInitScript(() => { const G = ['touchend', 'pointerup', 'click', 'keydown', 'mouseup'], A = window.AudioContext; if (!A) return; const R = A.prototype.resume;
          A.prototype.resume = function () { const e = window.event; return e && G.includes(e.type) ? R.call(this) : Promise.resolve(); };
          window.AudioContext = class extends A { constructor(...a) { super(...a); this.suspend(); } };
          let hid = false; Object.defineProperty(document, 'hidden', { get: () => hid, configurable: true }); window.__hide = v => { hid = v; document.dispatchEvent(new Event('visibilitychange')); }; }));
        const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts }), st = () => p.evaluate(() => game.audio ? game.audio.ac.state : 'none');
        const run = () => p.waitForFunction(() => game.audio && game.audio.ac.state === 'running', null, { timeout: 8000, polling: 100 }).catch(() => {});
        await p.waitForFunction(() => window.game && game.S && game.S.started && game.audio); await p.waitForTimeout(1500);
        await T('touchStart', [{ x: 195, y: 481, id: 1 }]); await T('touchEnd', []); await run(); const a0 = await st();   // まず 鳴らす
        await p.keyboard.press('h'); await p.waitForTimeout(1200); const a1 = await st(), hv = await p.evaluate(() => !document.getElementById('help').classList.contains('hidden'));   // 開いた 間は 鳴らない
        await p.locator('#bHelpClose').tap(); await run(); const a2 = await st(), hc = await p.evaluate(() => document.getElementById('help').classList.contains('hidden'));   // 表は 長いので とじる ボタンは 下の ほう（見える 所まで 送って タップ）
        await p.evaluate(() => window.__hide(true)); await p.waitForTimeout(1200); const a3 = await st();
        await p.evaluate(() => window.__hide(false)); await p.waitForTimeout(1500); const a4 = await st();
        await T('touchStart', [{ x: 195, y: 481, id: 1 }]); await T('touchEnd', []); await run(); const a5 = await st();
        snd.again = { first: a0, helpOpen: [hv, a1], helpClosed: [hc, a2], hidden: a3, back: a4, tapped: a5 }; await ctx.close(); }
      ok('操作の 表を とじた その タップで 音が もどる（開いて いる 間は 鳴らない。Codex の ⑤。直す前：鳴らない）', snd.again.first === 'running' && snd.again.helpOpen[0] && snd.again.helpOpen[1] !== 'running' && snd.again.helpClosed[0] && snd.again.helpClosed[1] === 'running', snd.again);
      ok('かくれて もどった あと：さわらない 間は もどらなくても、1 回 さわれば 鳴る（かくれて いる 間は 鳴らない。Codex の ④。直す前：さわっても 鳴らない）', snd.again.hidden !== 'running' && snd.again.tapped === 'running', snd.again);
      // 18-4) Codex 指摘（2 回め）：本物の こまを 回さない（ずっと 次の こまの 前）。1 度 鳴らす → かくす → もどす → H で 操作の 表を 開く／Enter で おわりに する。
      //       さわった ときの 聞き手が 先に 音を もどしても、開いた・おわった その 操作の 中で 止まる（直す前：次の こまの syncAudio まで 鳴る）
      for (const how of ['help', 'finish', 'mute']) {
        const { ctx, p, cdp } = await open14('', q => q.addInitScript(() => { window.requestAnimationFrame = () => 0; const G = ['touchend', 'pointerup', 'click', 'keydown', 'mouseup'], A = window.AudioContext; if (!A) return; const R = A.prototype.resume;
          A.prototype.resume = function () { const e = window.event; return e && G.includes(e.type) ? R.call(this) : Promise.resolve(); };
          window.AudioContext = class extends A { constructor(...a) { super(...a); this.suspend(); } };
          let hid = false; Object.defineProperty(document, 'hidden', { get: () => hid, configurable: true }); window.__hide = v => { hid = v; document.dispatchEvent(new Event('visibilitychange')); }; }));
        const st = () => p.evaluate(() => game.audio.ac.state), wr = want => p.waitForFunction(w => game.audio.ac.state === w, want, { timeout: 8000, polling: 100 }).catch(() => {});
        await p.waitForFunction(() => window.game && game.S && game.S.started && game.audio, null, { polling: 100, timeout: 180000 });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 481, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wr('running'); const b0 = await st();
        await p.evaluate(() => window.__hide(true)); await wr('suspended'); const b1 = await st(); await p.evaluate(() => window.__hide(false));
        await p.keyboard.press(how === 'help' ? 'h' : how === 'mute' ? 'm' : 'Enter'); await p.waitForTimeout(1500);
        const b2 = await p.evaluate(() => [game.audio.ac.state, !document.getElementById('help').classList.contains('hidden'), !!game.S.done, document.getElementById('bSnd').textContent]);
        snd['key_' + how] = [b0, b1, ...b2]; await ctx.close();   // 18 の はじめの snd.mute（🔇 に して から なぞって 離す）を 上書き しない ように、別の 名前で 持つ（Codex 指摘）
      }
      ok('かくして もどし、次の こまの 前に H で 操作の 表を 開く・Enter で おわりに する・M で 🔇：その 操作の 中で 音は 止まる（Codex 指摘。直す前：表が 開いた まま・おわった まま 鳴る）', snd.key_help[0] === 'running' && snd.key_help[1] === 'suspended' && snd.key_help[2] !== 'running' && snd.key_help[3] && snd.key_finish[0] === 'running' && snd.key_finish[2] !== 'running' && snd.key_finish[4] && snd.key_mute[0] === 'running' && snd.key_mute[2] !== 'running' && snd.key_mute[5] === '🔇', [snd.key_help, snd.key_finish, snd.key_mute]);
      ok('読みこみ中に 1 回 タップした 人も、始まって なぞって 離すと 音が 鳴りだす（直す前：ずっと 鳴らない）', snd.tapLoad[2] === 'running', snd.tapLoad);
      ok('タップせずに 始まった 人は なぞって 離すと 鳴る・指を 置いた まま の 間は 鳴らない（ブラウザの きまりの まね）・🔇 に した 人は 鳴らない', snd.plain[1] !== 'running' && snd.plain[2] === 'running' && snd.mute[2] !== 'running', [snd.plain, snd.mute]);
    }
  }
  ok('エラーなし', errs.length === 0, errs.slice(0, 3));
  console.log(ng ? `NG ${ng} 件` : 'ぜんぶ ok'); await b.close(); srv.close(); process.exit(ng ? 1 : 0);
});
