// 最初の1分の確かめ（サイクル259〜270）：node firstmin.js [tractor.html のパス]
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
    const r = await p.evaluate(() => ({ big: document.getElementById('bigPct').textContent, tilled: tilledCount, art: ART.on ? Math.floor(ART.score().fill * 100 + 1e-9) : null, field: tilledCount / workCount * 100 }));
    ok(label + '：1 回なぞって耕した（4 秒）', r.tilled > 100, r.tilled);
    ok(label + '：数字が 0 のままでない', !/^0(\.0)?%$/.test(r.big), r.big);
    if (r.art !== null) ok(label + '：数字＝地図の「でき」', r.big === r.art + '%', [r.big, r.art]);
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
    await p.waitForFunction(() => window.game && game.S && game.S.started && typeof P !== 'undefined' && P.Rotary); await p.waitForTimeout(800);
    const w1 = await lw();
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
  // ---- 10) サイクル270（おそい回線・おそい スマホ）：three を待つ間も おおいが見える・読みこみの 進みぐあいの 線・読みこみ中に置いた指の なぞりを 捨てない ----
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
  ok('エラーなし', errs.length === 0, errs.slice(0, 3));
  console.log(ng ? `NG ${ng} 件` : 'ぜんぶ ok'); await b.close(); srv.close(); process.exit(ng ? 1 : 0);
});
