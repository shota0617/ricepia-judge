#!/usr/bin/env node
// 自分で 遊んで つまずきを さがす 遊び手：地図の めいろを 矢印キーで 遊び、ゴール・知らせ・窓・つまった 所を 記録する
//   node selfplay.js 出力フォルダ [ゴールの 数＝3]
//   MODE=route（道すじを 追う。既定）／explore（答えを 知らない：分かれ道で ゴールの 方角へ、行き止まりで ひきかえす）
//   HINT=1（explore で、25秒 近づけないと 光る 点＝道すじの 先 8マスを 見て たどる。人と 同じ）
//   MZGOALS=5（めいろの ゴールに 着いた 回数。3 以上だと おたすけが 消えた あと）／DATE=2026-10-25T10:00:00+09:00（時刻を 固定）
//   SECS=480（遊ぶ 秒数）／PORT=8987
//   ログの STUCK は 15秒 道のりが へらなかった 所（画面を stuck-N.png に 残す）。遊び手の 動きの せいか、ゲームの せいかは 画面と probe で 見分ける
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { ROOT, playEnv } = require('./env');
const { startServer } = require(path.join(ROOT, 'tools', 'bake-common'));
const ENV = playEnv();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = path.resolve(process.argv[2] || 'selfplay-out'), GOALS = Number(process.argv[3] || 3), MODE = process.env.MODE || 'route';   // route：道すじを 追う。explore：分かれ道で ゴールの 方角へ（答えを 知らない）
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  startServer(Number(process.env.PORT || 8987));
  const browser = await chromium.launch(ENV.CHROMIUM ? { executablePath: ENV.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  await ctx.addInitScript(g => { localStorage.setItem('nsg_noanalytics', '1'); if (g) localStorage.setItem('nsg_mzgoals', g); }, process.env.MZGOALS || '');
  const page = await ctx.newPage(); if (process.env.DATE) await page.clock.setFixedTime(new Date(process.env.DATE));
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('https://unpkg.com/**', r => { const f = r.request().url().endsWith('.css') ? 'leaflet.css' : 'leaflet.js'; r.fulfill({ body: fs.readFileSync(path.join(ENV.LEAFLET_DIR, f)), contentType: f.endsWith('css') ? 'text/css' : 'text/javascript' }); });
  await page.route(/^https:\/\/[^/]*overpass[^/]*\//, r => r.fulfill({ status: 504, body: '' }));
  await page.goto(`http://localhost:${process.env.PORT || 8987}/nishio-go.html`); await sleep(1500);
  await page.click('#meiroBtn'); await sleep(2000);
  const log = [], t0 = Date.now(), T = () => Math.round((Date.now() - t0) / 100) / 10;
  const note = (k, v) => { log.push([T(), k, v]); console.log(T(), k, typeof v === 'string' ? v : JSON.stringify(v)); };
  // 窓を とじる（人が 読んで とじる 速さで：1.2秒 見てから）
  const closeWin = async () => page.evaluate(() => {
    const out = [];
    const h = document.getElementById('howto'); if (h && !h.hidden) { out.push('howto'); document.getElementById('howtoOk').click(); }
    const rw = document.getElementById('reward'); if (rw && rw.classList.contains('show')) { out.push('reward:' + rw.innerText.replace(/\s+/g, ' ').slice(0, 140)); rw.click(); }
    const pk = document.querySelectorAll('[data-pick-dot]'); if (pk.length && pk[0].getClientRects().length) { out.push('pick'); pk[0].click(); }
    const pi = document.getElementById('pxInfo'); if (pi && !pi.hidden) { out.push('pxInfo:' + pi.innerText.replace(/\s+/g, ' ').slice(0, 80)); const c = pi.querySelector('[data-close]'); if (c) c.click(); else pi.hidden = true; }
    document.querySelectorAll('.md-card').forEach(c => { if (!c.getClientRects().length) return; const b = c.querySelector('.md-close') || [...c.querySelectorAll('button')].pop(); if (b) { out.push('event:' + (c.querySelector('.md-head') || c).innerText.slice(0, 40) + ' → ' + b.textContent.trim()); b.click(); } });
    document.querySelectorAll('.movie button, [data-mv="close"]').forEach(b => { if (b.getClientRects().length && /とじる|閉じる|✕|×|スキップ/.test(b.textContent)) { out.push('movie'); b.click(); } });
    return out;
  });
  const ex = { goalKey: '', seen: null, stack: [], tgt: null, dead: 0 };
  let goals = 0, held = null, lastToast = '', lastFloat = '', stuckT = Date.now(), bestLen = Infinity, shots = 0, lastGoalName = '';
  const press = async k => { if (held === k) return; if (held) await page.keyboard.up(held); held = k; if (k) await page.keyboard.down(k); };
  while (goals < GOALS && Date.now() - t0 < Number(process.env.SECS || 600) * 1000) {
    const w = await closeWin(); if (w.length) { await press(null); for (const x of w) note('win', x); if (w.some(x => x.startsWith('reward') && /めいろ ゴール|\d+秒 [★☆]/.test(x))) { goals++; note('GOAL', goals); } await sleep(1200); continue; }
    const st = await page.evaluate(mode => {
      const M = nishioPixel.maze, r = nishioPixel.roll, K = M.K; if (r.x === null) return null;
      const a = Math.floor(r.x / K), b = Math.floor(r.y / K), fx = r.x / K - a, fy = r.y / K - b;
      const gl = nishioGo.guide, me = nishioGo.me, dir = gl && me ? [gl.lng - me.lng, me.lat - gl.lat] : null;
      const p = M.routePath(), toast = document.querySelector('.toast.show, #toast.show'), g = nishioGo.guide;
      const opens = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => M.open(a, b, dx, dy) && (M.type(a + dx, b + dy) === 1 || M.spot(a + dx, b + dy)));
      return { a, b, fx, fy, opens, end: p && p.length ? p[p.length - 1] : null, p: p ? p.slice(0, 3) : null, p9: p ? p.slice(0, 9) : null, len: p ? p.length : null, toast: toast ? toast.innerText : '', fl: nishioPixel.floats().slice(-1)[0] || '', crows: M.crows(), scare: M.scare(), clock: M.clock(), goal: g ? g.name : '', dir };
    }, MODE);
    if (!st) { await sleep(300); continue; }
    if (st.goal !== lastGoalName) { lastGoalName = st.goal; note('next-goal', `${st.goal} ${st.len}マス`); bestLen = Infinity; stuckT = Date.now(); }
    if (st.toast && st.toast !== lastToast) { lastToast = st.toast; note('toast', st.toast); if (/🏁/.test(st.toast)) { goals++; note('GOAL(npc)', goals); } }
    if (st.fl && st.fl !== lastFloat) { lastFloat = st.fl; note('float', st.fl); }
    if (st.len !== null && st.len < bestLen) { bestLen = st.len; stuckT = Date.now(); }
    if (Date.now() - stuckT > 15000) { note('STUCK', { at: [st.a, st.b], len: st.len, p: st.p, arr: await page.evaluate(() => nishioPixel.maze.arrive()) }); await page.screenshot({ path: `${OUT}/stuck-${shots++}.png` }); stuckT = Date.now(); }
    let k = null;
    // 人と 同じ ように、25秒 近づけないと 光る 点（道すじの 先 8マス）を 見て たどる（HINT=1）
    if (process.env.HINT && MODE === 'explore' && st.p9 && Date.now() - (ex.bestT || 0) > 25000 && !ex.plan) { ex.plan = st.p9.slice(1).map(c => c.join(',')); ex.bestT = Date.now(); ex.hints = (ex.hints || 0) + 1; }
    if (st.len !== null && st.len < (ex.best || Infinity)) { ex.best = st.len; ex.bestT = Date.now(); }
    if (ex.lastGoal !== st.goal) { ex.lastGoal = st.goal; ex.best = Infinity; ex.bestT = Date.now(); ex.plan = null; }
    if (ex.plan) { const key = st.a + ',' + st.b, i = ex.plan.indexOf(key); if (i >= 0) ex.plan = ex.plan.slice(i + 1); if (!ex.plan.length) { ex.plan = null; ex.stack = [key]; ex.tgt = null; } else { const [tx, ty] = ex.plan[0].split(',').map(Number); if (Math.abs(tx - st.a) + Math.abs(ty - st.b) === 1) { st.p = [[st.a, st.b], [tx, ty]]; ex.tgt = null; } else ex.plan = null; } }
    if (MODE === 'explore' && st.end && !ex.plan) {   // 答えを 知らない 遊び手：分かれ道では ゴールの 方角に 近い まだ 行っていない 道へ。行き止まりで ひきかえす
      const key = st.a + ',' + st.b;
      if (!ex.goalKey || ex.goalKey !== st.goal) { ex.goalKey = st.goal; ex.seen = new Set([key]); ex.stack = [key]; ex.tgt = null; }
      if (!ex.tgt || ex.tgt === key) {
        ex.seen.add(key); if (ex.stack[ex.stack.length - 1] !== key) ex.stack.push(key);
        const cand = st.opens.map(([dx, dy]) => [st.a + dx, st.b + dy]).filter(([x, y]) => !ex.seen.has(x + ',' + y));
        if (cand.length) { cand.sort((u, v) => Math.hypot(u[0] - st.end[0], u[1] - st.end[1]) - Math.hypot(v[0] - st.end[0], v[1] - st.end[1])); ex.tgt = cand[0][0] + ',' + cand[0][1]; }
        else { if (st.opens.length === 1) { ex.dead++; } ex.stack.pop(); ex.tgt = ex.stack[ex.stack.length - 1] || null; if (ex.tgt === key) { ex.stack.pop(); ex.tgt = ex.stack[ex.stack.length - 1] || null; } }
      }
      if (ex.tgt) { const [tx, ty] = ex.tgt.split(',').map(Number); st.p = [[st.a, st.b], [tx, ty]]; if (Math.abs(tx - st.a) + Math.abs(ty - st.b) !== 1 || !st.opens.some(([dx, dy]) => st.a + dx === tx && st.b + dy === ty)) { const i = ex.stack.lastIndexOf(ex.tgt); if (i >= 0) ex.stack.splice(i, 1); ex.tgt = null; st.p = null; } }   // となりでも 壁ごしなら すてる（もどり道の 列からも）
    }
    if (st.p && st.p.length > 1) {
      const [nx, ny] = st.p[1], dx = nx - st.a, dy = ny - st.b;
      // 曲がる 前に マスの まん中へ（はみ出すと 壁に こすれる）
      if (dx) k = Math.abs(st.fy - 0.5) > 0.25 ? (st.fy < 0.5 ? 'ArrowDown' : 'ArrowUp') : dx > 0 ? 'ArrowRight' : 'ArrowLeft';
      else if (dy) k = Math.abs(st.fx - 0.5) > 0.25 ? (st.fx < 0.5 ? 'ArrowRight' : 'ArrowLeft') : dy > 0 ? 'ArrowDown' : 'ArrowUp';
    }
    if (!k && !(st.p && st.p.length) && st.dir) k = Math.abs(st.dir[0]) > Math.abs(st.dir[1]) ? (st.dir[0] > 0 ? 'ArrowRight' : 'ArrowLeft') : (st.dir[1] > 0 ? 'ArrowDown' : 'ArrowUp');   // 道すじが まだ ない（読めていない 区域）：ゴールの 方角へ
    await press(k);
    await sleep(80);
  }
  await press(null);
  await page.screenshot({ path: `${OUT}/end.png` });
  fs.writeFileSync(`${OUT}/log.json`, JSON.stringify({ log, errs }, null, 1));
  console.log('goals', goals, 'dead', ex.dead, 'hints', ex.hints || 0, 'errs', errs.slice(0, 5));
  process.exit(0);
})();
