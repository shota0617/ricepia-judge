// 最初の1分の確かめ（サイクル259）：node firstmin.js [tractor.html のパス]
//  1) 知らせの文：吹き出し（speakText）・短い文（shortText）で かっこが合わなくならない（「…見ます）」のような切れ方をしない）
//  2) のんびりの大きな数字：スマホ縦で 1 回なぞって耕したら 0% のままにならない。田んぼアートでは地図の「でき」と同じ数、お題なしでは小数 1 けた
// three r128 は tooshi.js と同じ（THREE_NM か scripts/node_modules/three）。本物の GLTFLoader が手元にないときは、
// 代わりのローダーを入れた THREE_NM と NOSRI=1（integrity を外す）で動かす
const fs = require('fs'), http = require('http'), path = require('path');
const ROOT = path.resolve(__dirname, '../../../..'), HTML = path.resolve(process.argv[2] || path.join(ROOT, 'tractor.html')), TN = process.env.THREE_NM || path.join(__dirname, 'node_modules/three'), PORT = +(process.env.PORT || 8891);
const src = fs.readFileSync(HTML, 'utf8'); let ng = 0;
const ok = (name, cond, info) => { console.log((cond ? 'ok   ' : 'NG   ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); if (!cond) ng++; };
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
    await p.evaluate(() => { let now = performance.now(); performance.now = () => now; window.requestAnimationFrame = () => 0; game.renderer.render = () => {};
      window.__adv = sec => { for (let i = 0, n = Math.round(sec / 0.05); i < n; i++) { now += 50; frame(now); } }; });
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
  ok('エラーなし', errs.length === 0, errs.slice(0, 3));
  console.log(ng ? `NG ${ng} 件` : 'ぜんぶ ok'); await b.close(); srv.close(); process.exit(ng ? 1 : 0);
});
