// にしおさんぽGO：西尾めいろ（スマホを傾けて、お米を 西尾の地図の迷路の ゴールまで ころがす。キーホルダーの 玉ころがし迷路のように）
// ・盤は 本物の西尾の地図の一部（ドット絵の地図と同じ絵。pixel.js の paintRegion）。めいろの1マスは 地図の 3×3マス（約24m）。
//   まん中のマスを 道が 通っている所（道が6つ以上の 広い道・広場、公園・境内も）が 通路、そのほか（家の かたまり・田畑など）は 壁。町の 通りが そのまま 迷路になる
// ・川や池（水のマス）と、面が進むと ふえる マンホールの 穴は「落とし穴」：おちると スタートに もどる
// ・ゴールは 西尾の名所（1面 西尾駅 → 2面 西尾城跡 → らいすぴあ …）。スタートは ゴールから 道を たどって いちばん遠い所
// ・傾き（pixel.js の傾きを そのまま使う）・矢印キー・盤を なぞる で 転がす。ベストタイムは この端末（localStorage nsg_meiro）
// ・pixel.js より後に読む（nishioPixel.meiroApi を使う）
(function (root) {
'use strict';
const $ = id => document.getElementById(id);
const KEY = 'nsg_meiro';
// 面のゴール（名所の id）。この順に。あとは 西尾の注目スポットを 西尾城跡から近い順に
const GOALS = ['f-nishio-station', 'f-nishio-castle', 'f-ricepia', 'f-iwase-bunko', 'f-kondo-beikoku', 'f-konrenji', 'f-jofukuji', 'f-kurokabe', 'f-inariyama-chaen'];
const K = 3;   // めいろの1マス = 地図の K×K マス
const ACC = 16, MAX = 7.5, CRR = 1.1, LIN = 0.55, BOUNCE = 0.38, R = 0.3;   // マス/秒²・いちばん速い速さ・ころがり抵抗・速さに比べて へる分・はね返り・お米の半径（マス）
const load = () => { try { return Object.assign({ stage: 0, best: {} }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { stage: 0, best: {} }; } };
const st = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* 保存できない端末 */ } };

let api = null, ui = null, game = null, raf = 0;
const bad = new Set();   // めいろが つくれなかった名所（道が すくない所）。面の いちらんから はずす（この端末で 開いている あいだ）
const keys = { up: 0, down: 0, left: 0, right: 0 }, drag = { on: false, x0: 0, y0: 0, x: 0, y: 0 };

function goalList() {
  const G = root.nishioGo, spots = (G && G.spots) || [];
  const byId = new Map(spots.map(s => [s.id, s]));
  const first = GOALS.map(id => byId.get(id)).filter(s => s && !bad.has(s.id));
  const castle = byId.get('f-nishio-castle') || first[0];
  const rest = castle ? spots.filter(s => s.featured && !bad.has(s.id) && !first.includes(s) && G.dist(castle, s) < 9000).sort((a, b) => G.dist(castle, a) - G.dist(castle, b)) : [];
  return [...first, ...rest];
}
const boardSize = n => ({ tw: 13 + Math.min(4, Math.floor(n / 3)) * 1, th: 19 + Math.min(6, Math.floor(n / 3)) * 1.5 | 0 });   // 面が進むと 盤が少し広く

/* ---------- 盤を作る ---------- */
function makeBoard(n, spot) {
  const A = api, C = A.C, PATH = new Set([C.R, C.H, C.D]);
  const { tw, th } = boardSize(n);
  const g = A.toTile(spot.lat, spot.lng), gx = Math.floor(g.x / K), gy = Math.floor(g.y / K);   // めいろの マス
  // ゴールを 盤の 上・下・左・右 寄りに置いて、いちばん長い道のりが とれる置き方にする
  // 9とおりの置き方（ゴールが 上・まん中・下 × 左・まん中・右 寄り）から、いちばん長い道のりが とれるものを えらぶ
  let best = null;
  for (const fy of [0.2, 0.8, 0.5]) for (const fx of [0.5, 0.25, 0.75]) {
    const tx0 = gx - Math.floor(tw * fx), ty0 = gy - Math.floor(th * fy);
    const b = layout(n, tx0, ty0, tw, th, gx, gy, PATH);
    if (b && (!best || b.len > best.len)) best = b;
  }
  if (best) best.spot = spot;
  return best;
}
function layout(n, tx0, ty0, tw, th, gx, gy, PATH) {
  // cell：0 壁の かたまり（道が ない）・1 床（道がある）・2 水（落とし穴）。tx0・ty0 は めいろの マス
  // er・ed：右・下の となりへ 通れるか（1 通れる）。床どうしでも、さかいを 道が またいでいなければ 細い壁（キーホルダーの 迷路の 線）
  const A = api, C = A.C, cell = new Uint8Array(tw * th), er = new Uint8Array(tw * th), ed = new Uint8Array(tw * th);
  const W = tw * K, H = th * K, kind = new Uint8Array(W * H);   // 地図のマス：0 そのほか・1 道・2 水
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = A.codeAt(tx0 * K + x, ty0 * K + y); kind[y * W + x] = PATH.has(c) ? 1 : c === C.A ? 2 : 0; }
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    let road = 0, water = 0, park = 0;
    for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) {
      const v = kind[(y * K + j) * W + x * K + i];
      if (v === 1) road++; else if (v === 2) water++;
      else { const c = A.codeAt((tx0 + x) * K + i, (ty0 + y) * K + j); if (c === C.P || c === C.J) park++; }
    }
    cell[y * tw + x] = water >= 5 && road < 2 ? 2 : road >= 2 || park >= 7 ? 1 : 0;   // 公園・境内は 広場として 床に
    if (park >= 7 && road < 2) for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) { const q = (y * K + j) * W + x * K + i; if (!kind[q]) kind[q] = 1; }
  }
  // さかいを またいで となりあう 地図のマスが（床どうしは 道と道・床と水は 道と水）あれば 通れる
  const link = (x, y, dx, dy) => {
    const a = cell[y * tw + x], b = cell[(y + dy) * tw + x + dx];
    if (!a || !b) return 0;
    if (a === 2 && b === 2) return 1;
    for (let k = 0; k < K; k++) {
      const p = dx ? (y * K + k) * W + x * K + K - 1 : (y * K + K - 1) * W + x * K + k, q = dx ? p + 1 : p + W;
      if ((kind[p] === 1 || kind[q] === 1) && kind[p] && kind[q]) return 1;
    }
    return 0;
  };
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    if (x + 1 < tw) er[y * tw + x] = link(x, y, 1, 0);
    if (y + 1 < th) ed[y * tw + x] = link(x, y, 0, 1);
  }
  const at = (x, y) => (x < 0 || y < 0 || x >= tw || y >= th ? 0 : cell[y * tw + x]);
  // ゴール：名所に いちばん近い 床
  let goal = null, gd = 1e9;
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) if (at(x, y) === 1) { const d = Math.hypot(tx0 + x - gx, ty0 + y - gy); if (d < gd) { gd = d; goal = [x, y]; } }
  if (!goal || gd > 4) return null;   // 名所の そばに 床が なければ、この置き方は やめる
  const B = { n, tx0, ty0, tw, th, cell, er, ed, goal, holes: new Set() };
  const dist = bfs(B, goal);
  // スタート：ゴールから いちばん遠い 床
  let start = null, len = 0;
  for (let i = 0; i < dist.length; i++) if (dist[i] > len) { len = dist[i]; start = [i % tw, (i / tw) | 0]; }
  if (!start || len < 10) return null;
  // マンホールの穴：面が進むと ふえる。ゴール・スタートの そばと、穴があると たどりつけなくなる所には 置かない
  const want = Math.min(8, Math.max(0, n - 1) * 2), cand = [];
  for (let i = 0; i < dist.length; i++) if (dist[i] > 2 && dist[i] < len - 2) cand.push(i);
  let seed = (n + 1) * 2654435761 >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let k = 0; k < cand.length * 3 && B.holes.size < want; k++) {
    const i = cand[(rnd() * cand.length) | 0];
    if (B.holes.has(i) || [...B.holes].some(j => Math.abs(j % tw - i % tw) + Math.abs(((j / tw) | 0) - ((i / tw) | 0)) < 3)) continue;
    B.holes.add(i);
    if (bfs(B, goal)[start[1] * tw + start[0]] <= 0) B.holes.delete(i);   // 道が ふさがったら やめる
  }
  return Object.assign(B, { start, len });
}
const pass = (b, x, y, dx, dy) => {   // (x, y) から となりへ 通れるか
  if (dx === 1) return x + 1 < b.tw && b.er[y * b.tw + x] === 1;
  if (dx === -1) return x > 0 && b.er[y * b.tw + x - 1] === 1;
  if (dy === 1) return y + 1 < b.th && b.ed[y * b.tw + x] === 1;
  return y > 0 && b.ed[(y - 1) * b.tw + x] === 1;
};
function bfs(b, from) {   // 床を 通れる さかいで たどった 歩数（たどれない所は 0。はじめのマスは 1。水・穴は 通らない）
  const { tw, th, cell, holes } = b, d = new Int32Array(tw * th), q = [from[1] * tw + from[0]];
  d[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % tw, y = (i / tw) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = (y + dy) * tw + x + dx;
      if (!pass(b, x, y, dx, dy) || d[j] || cell[j] !== 1 || holes.has(j)) continue;
      d[j] = d[i] + 1; q.push(j);
    }
  }
  return d;
}

/* ---------- 画面 ---------- */
const CSS = `#meiro{position:fixed;inset:0;z-index:3500;background:radial-gradient(circle at 50% 30%,#2f6f8f,#123247);display:flex;flex-direction:column;align-items:center;color:#fff;font-family:"DotGothic16","Hiragino Sans",sans-serif;user-select:none;-webkit-user-select:none;overflow-y:auto;overscroll-behavior:contain}   /* 横向きなど 低い画面では 下のボタンまで スクロールできる */
#meiro[hidden]{display:none}
#meiro .mz-top{width:min(100%,520px);box-sizing:border-box;padding:calc(env(safe-area-inset-top,0px) + 10px) 14px 6px;display:flex;align-items:center;gap:8px}
#meiro .mz-st{font-size:15px;line-height:1.3;flex:1}
#meiro .mz-st b{font-size:18px;color:#ffe680}
#meiro .mz-st small{font-size:12px;opacity:.85}
#meiro .mz-time{font-size:20px;font-variant-numeric:tabular-nums;min-width:4.5em;text-align:right}
#meiro .mz-x{border:0;background:rgba(255,255,255,.18);color:#fff;border-radius:10px;padding:6px 10px;font:inherit;font-size:14px}
#meiro .mz-bezel{position:relative;margin:4px auto 0;padding:14px;border-radius:30px;background:linear-gradient(145deg,#7fd8f6,#2fa6dc 45%,#1a7fb6);box-shadow:0 10px 24px rgba(0,0,0,.45),inset 0 3px 0 rgba(255,255,255,.55),inset 0 -4px 0 rgba(0,0,0,.25)}
#meiro .mz-glass{position:relative;border-radius:18px;overflow:hidden;box-shadow:inset 0 0 0 3px #c9d4da,inset 0 0 18px rgba(0,0,0,.35);background:#ddd}
#meiro canvas{display:block;image-rendering:pixelated;touch-action:none}   /* 盤を なぞる あいだは 画面を動かさない */
#meiro .mz-glass::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:18px;background:linear-gradient(155deg,rgba(255,255,255,.32),rgba(255,255,255,0) 32%,rgba(255,255,255,0) 70%,rgba(255,255,255,.12));box-shadow:inset 0 0 0 3px rgba(255,255,255,.35)}
#meiro .mz-hint{font-size:13px;opacity:.9;margin:10px 14px 4px;text-align:center;line-height:1.5}
#meiro .mz-btns{display:flex;gap:10px;margin:6px 0 calc(env(safe-area-inset-bottom,0px) + 10px)}
#meiro .mz-btns button,#meiro .mz-clear button{border:0;border-radius:999px;padding:10px 18px;font:inherit;font-size:15px;background:#ffe680;color:#2a2410;box-shadow:0 3px 0 #b59a2a}
#meiro .mz-btns button.sub{background:rgba(255,255,255,.2);color:#fff;box-shadow:none}
#meiro .mz-clear{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(10,30,40,.55)}
#meiro .mz-clear[hidden]{display:none}
#meiro .mz-card{background:#fffdf2;color:#2a2a20;border-radius:18px;padding:18px 20px;text-align:center;width:min(86%,340px);box-shadow:0 8px 24px rgba(0,0,0,.4)}
#meiro .mz-card h3{margin:0 0 6px;font-size:24px;color:#d0402a}
#meiro .mz-card p{margin:6px 0;font-size:15px;line-height:1.5}
#meiro .mz-card .mz-stars{font-size:28px;letter-spacing:4px;color:#f0b020}
#meiro .mz-card .mz-row{display:flex;gap:8px;justify-content:center;margin-top:12px;flex-wrap:wrap}
#meiro .mz-load{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:15px;color:#fff;background:rgba(0,0,0,.35)}
#meiro .mz-load[hidden]{display:none}`;

function build() {
  const css = document.createElement('style'); css.textContent = CSS; document.head.appendChild(css);
  const el = document.createElement('div');
  el.id = 'meiro'; el.hidden = true;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '西尾めいろ');
  el.innerHTML = `<div class="mz-top"><div class="mz-st"></div><div class="mz-time">0.0</div><button type="button" class="mz-x" data-mz="close" aria-label="めいろを とじる">✕</button></div>
    <div class="mz-bezel"><div class="mz-glass"><canvas aria-label="迷路の盤"></canvas><div class="mz-load">めいろを つくっています…</div>
      <div class="mz-clear" hidden><div class="mz-card"></div></div></div></div>
    <p class="mz-hint">📱 スマホを 傾けて、お米を 🏁 まで ころがそう（パソコンは 矢印キー・盤を なぞっても）。<br/>黒い穴と 水に おちると スタートに もどるよ</p>
    <div class="mz-btns"><button type="button" class="sub" data-mz="retry">↺ やりなおし</button><button type="button" class="sub" data-mz="list">めいろ の いちらん</button></div>`;
  document.body.appendChild(el);
  ui = { el, st: el.querySelector('.mz-st'), time: el.querySelector('.mz-time'), cv: el.querySelector('canvas'), glass: el.querySelector('.mz-glass'),
    load: el.querySelector('.mz-load'), clear: el.querySelector('.mz-clear'), card: el.querySelector('.mz-card') };
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-mz]');
    if (!b) return;
    const k = b.dataset.mz;
    if (k === 'close') close();
    else if (k === 'retry') { if (game && game.board) restart(); }
    else if (k === 'next') startStage(game.n + 1);
    else if (k === 'again') startStage(game.n);
    else if (k === 'list') showList();
    else if (k.startsWith('go:')) startStage(+k.slice(3));
  });
  // 盤を なぞる：さわった所から 指を動かした向きへ 傾けたのと同じ
  ui.cv.addEventListener('pointerdown', e => { drag.on = true; drag.x0 = e.clientX; drag.y0 = e.clientY; drag.x = drag.y = 0; ui.cv.setPointerCapture(e.pointerId); });
  ui.cv.addEventListener('pointermove', e => { if (!drag.on) return; const k = v => Math.max(-1, Math.min(1, v / 70)); drag.x = k(e.clientX - drag.x0); drag.y = k(e.clientY - drag.y0); });
  const up = () => { drag.on = false; drag.x = drag.y = 0; };
  ui.cv.addEventListener('pointerup', up); ui.cv.addEventListener('pointercancel', up);
  document.addEventListener('keydown', e => {
    if (!ui || ui.el.hidden) return;
    const k = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
    if (k) { keys[k] = 1; e.preventDefault(); }
    else if (e.key === 'Escape') close();
  });
  document.addEventListener('keyup', e => { const k = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key]; if (k) keys[k] = 0; });
  window.addEventListener('resize', () => { if (game && game.board && !ui.el.hidden) fit(); });
}

function open(n) {
  api = root.nishioPixel && root.nishioPixel.meiroApi;
  if (!api) return false;
  if (!ui) build();
  ui.el.hidden = false;
  api.pause(true);
  api.tiltAsk(); api.tiltReset();   // いまの持ち方を「まっすぐ」に
  startStage(typeof n === 'number' ? n : Math.min(st.stage, goalList().length - 1));
  if (root.nsgTrack) root.nsgTrack('meiro_open', { stage: (game && game.n + 1) || 0 });
  return true;
}
function close() {
  if (!ui) return;
  ui.el.hidden = true;
  cancelAnimationFrame(raf); raf = 0;
  if (api) api.pause(false);
}

/* ---------- 面 ---------- */
function startStage(n) {
  const list = goalList();
  if (!list.length) { ui.load.hidden = false; ui.load.textContent = '名所を よみこみ中…'; setTimeout(() => !ui.el.hidden && startStage(n), 600); return; }
  n = Math.max(0, Math.min(n, list.length - 1));
  game = { n, spot: list[n], board: null, t: 0, falls: 0, done: false };
  ui.clear.hidden = true;
  ui.load.hidden = false; ui.load.textContent = 'めいろを つくっています…';
  const bt = st.best[n];
  ui.st.innerHTML = `🌀 めいろ <b>${n + 1}</b>　🏁 ${esc(game.spot.name)}${bt ? `<br/><small>ベスト ${bt.t.toFixed(1)}秒 ${'★'.repeat(bt.s)}</small>` : ''}`;
  ui.time.textContent = '0.0';
  const g = game;
  waitChunks(g.spot, () => {
    if (game !== g) return;
    const b = makeBoard(n, g.spot);
    if (!b) {   // 道が少ない所なら、その名所を はずして 同じ面を つくりなおす（つぎの名所が この面に）
      bad.add(g.spot.id);
      if (goalList().length > n) startStage(n); else ui.load.textContent = 'この あたりは 道が すくなくて、めいろが つくれなかった';
      return;
    }
    g.board = b;
    ui.load.hidden = true;
    fit();
    restart();
    cancelAnimationFrame(raf); g.last = 0; raf = requestAnimationFrame(tick);
  });
}
function waitChunks(spot, done) {
  const A = api, t = A.toTile(spot.lat, spot.lng), need = [], r = 32 * K;   // いちばん広い盤が 入る はんい
  for (let cy = Math.floor((t.y - r) / A.CHUNK); cy <= Math.floor((t.y + r) / A.CHUNK); cy++)
    for (let cx = Math.floor((t.x - r) / A.CHUNK); cx <= Math.floor((t.x + r) / A.CHUNK); cx++) need.push([cx, cy]);
  const t0 = Date.now();
  (function poll() {
    if (!ui || ui.el.hidden) return;
    need.forEach(([cx, cy]) => A.ensureChunk(cx, cy));
    const left = need.filter(([cx, cy]) => !['ok', 'out', 'fail'].includes(A.chunkState(cx, cy))).length;
    if (!left || Date.now() - t0 > 20000) done();
    else setTimeout(poll, 250);
  })();
}
function restart() {
  const b = game.board;
  game.x = b.start[0] + 0.5; game.y = b.start[1] + 0.5; game.vx = game.vy = 0; game.th = 0; game.sq = 0;
  game.t = 0; game.falls = 0; game.done = false; game.fall = 0; game.happy = 0; game.ouch = 0; game.go = false; game.fx = [];
  ui.clear.hidden = true;
}

/* ---------- 盤の絵 ---------- */
function fit() {
  const b = game.board, dpr = Math.min(root.devicePixelRatio || 1, 3);
  const maxW = Math.min(innerWidth, 520) - 28 - 28, maxH = innerHeight - 190;   // わく と 上下の文字のぶん
  const css = Math.max(6, Math.floor(Math.min(maxW / b.tw, Math.max(120, maxH) / b.th)));   // 1マスの大きさ（画面の点）。横向きの 低い画面でも 盤ぜんたいが 入るように 小さくできる
  const T = Math.max(K, Math.round(css * dpr / K) * K);   // 地図の1マス（T/K 点）が きっちり 入るように
  game.T = T; game.dpr = dpr;
  ui.cv.width = b.tw * T; ui.cv.height = b.th * T;
  ui.cv.style.width = b.tw * T / dpr + 'px'; ui.cv.style.height = b.th * T / dpr + 'px';
  game.bg = paintBoard(b, T);
}
function paintBoard(b, T) {
  const c = document.createElement('canvas'); c.width = b.tw * T; c.height = b.th * T;
  const x = c.getContext('2d');
  api.paintRegion(x, b.tx0 * K, b.ty0 * K, b.tw * K, b.th * K, T / K);
  const at = (i, j) => (i < 0 || j < 0 || i >= b.tw || j >= b.th ? 0 : b.cell[j * b.tw + i]);
  const u = Math.max(1, Math.round(T / 16)), lw = Math.max(2, Math.round(T / 8));
  for (let j = 0; j < b.th; j++) for (let i = 0; i < b.tw; i++) {
    const X = i * T, Y = j * T;
    if (at(i, j)) { x.fillStyle = 'rgba(255,250,235,.22)'; x.fillRect(X, Y, T, T); }   // 床：少し明るく
    else { x.fillStyle = 'rgba(16,28,22,.66)'; x.fillRect(X, Y, T, T); }   // 壁の かたまり：暗く
  }
  // かべの線：通れない さかい（床と 壁の かたまり、道が つながっていない 床どうし）に 黒い太い線（キーホルダーの 迷路の 線のように）。
  // 上と左の かべの下には 明るい ふちで、少し 立体に
  for (let j = 0; j < b.th; j++) for (let i = 0; i < b.tw; i++) {
    if (!at(i, j)) continue;
    const X = i * T, Y = j * T, up = pass(b, i, j, 0, -1), lf = pass(b, i, j, -1, 0);
    x.fillStyle = 'rgba(255,255,255,.4)';
    if (!up) x.fillRect(X, Y + lw / 2, T, u);
    if (!lf) x.fillRect(X + lw / 2, Y, u, T);
    x.fillStyle = '#141414';
    if (!up) x.fillRect(X - lw / 2, Y - lw / 2, T + lw, lw);
    if (!pass(b, i, j, 0, 1)) x.fillRect(X - lw / 2, Y + T - lw / 2, T + lw, lw);
    if (!lf) x.fillRect(X - lw / 2, Y - lw / 2, lw, T + lw);
    if (!pass(b, i, j, 1, 0)) x.fillRect(X + T - lw / 2, Y - lw / 2, lw, T + lw);
  }
  for (const i of b.holes) hole(x, (i % b.tw + 0.5) * T, (((i / b.tw) | 0) + 0.5) * T, T);
  // スタート
  const sx = (b.start[0] + 0.5) * T, sy = (b.start[1] + 0.5) * T;
  x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 2 * u; x.setLineDash([3 * u, 2 * u]);
  x.beginPath(); x.arc(sx, sy, T * 0.42, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
  return c;
}
function hole(x, cx, cy, T) {   // マンホールの穴：灰色の ふちと まっ暗な 中
  x.fillStyle = '#5a5a5a'; x.beginPath(); x.arc(cx, cy, T * 0.4, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#0c0c0c'; x.beginPath(); x.arc(cx, cy, T * 0.32, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(cx - T * 0.3, cy + T * 0.26, T * 0.6, Math.max(1, T / 16));
}

/* ---------- うごき ---------- */
const WALL = 0.07;   // 細い壁の 半分の あつさ（マス）
function blocked(b, px, py) {   // お米（半径 R）が 壁に かかるか（壁の かたまり・盤の外・通れない さかいの 細い壁）
  const hitRect = (x0, y0, x1, y1) => { const nx = Math.max(x0, Math.min(px, x1)), ny = Math.max(y0, Math.min(py, y1)); return (px - nx) ** 2 + (py - ny) ** 2 < R * R; };
  const solid = (i, j) => i < 0 || j < 0 || i >= b.tw || j >= b.th || b.cell[j * b.tw + i] === 0;
  for (let j = Math.floor(py - R) - 1; j <= Math.floor(py + R); j++) for (let i = Math.floor(px - R) - 1; i <= Math.floor(px + R); i++) {
    if (solid(i, j)) { if (hitRect(i, j, i + 1, j + 1)) return true; continue; }
    if (!solid(i + 1, j) && !pass(b, i, j, 1, 0) && hitRect(i + 1 - WALL, j, i + 1 + WALL, j + 1)) return true;
    if (!solid(i, j + 1) && !pass(b, i, j, 0, 1) && hitRect(i, j + 1 - WALL, i + 1, j + 1 + WALL)) return true;
  }
  return false;
}
function input() {
  const t = api.tilt();
  let ax = t.x + keys.right - keys.left + drag.x, ay = t.y + keys.down - keys.up + drag.y;
  const m = Math.hypot(ax, ay); if (m > 1) { ax /= m; ay /= m; }
  return [ax, ay];
}
function step(dt) {
  const g = game, b = g.board;
  if (g.fall > 0) {   // おちている：小さくなって、スタートへ
    g.fall -= dt;
    if (g.fall <= 0) { g.x = b.start[0] + 0.5; g.y = b.start[1] + 0.5; g.vx = g.vy = 0; g.ouch = 1; }
    return;
  }
  const [ax, ay] = input();
  g.vx += ax * ACC * dt; g.vy += ay * ACC * dt;
  const sp = Math.hypot(g.vx, g.vy);
  if (sp > 0) { const k = Math.max(0, sp - (CRR + LIN * sp) * dt) / sp * (sp > MAX ? MAX / sp : 1); g.vx *= k; g.vy *= k; }
  for (const axis of ['x', 'y']) {   // たて・よこ 別々に動かして、壁に当たったら そこで止めて はね返す（角を すべるように）
    const v = axis === 'x' ? g.vx : g.vy;
    if (!v) continue;
    const nx = axis === 'x' ? g.x + v * dt : g.x, ny = axis === 'y' ? g.y + v * dt : g.y;
    if (!blocked(b, nx, ny)) { g.x = nx; g.y = ny; continue; }
    let lo = 0, hi = 1;   // どこまで動けるか（半分ずつ しらべる）
    for (let k = 0; k < 8; k++) { const m = (lo + hi) / 2; if (blocked(b, axis === 'x' ? g.x + v * dt * m : g.x, axis === 'y' ? g.y + v * dt * m : g.y)) hi = m; else lo = m; }
    if (axis === 'x') g.x += v * dt * lo; else g.y += v * dt * lo;
    const hit = Math.abs(v);
    if (hit > 1.2) { api.koto(Math.min(1, hit / 6), hit > 4); g.sq = Math.min(0.25, hit * 0.04); if (hit > 4) g.ouch = 0.6; }
    if (axis === 'x') g.vx = hit > 0.6 ? -v * BOUNCE : 0; else g.vy = hit > 0.6 ? -v * BOUNCE : 0;
  }
  g.th += (g.vx >= 0 ? 1 : -1) * Math.hypot(g.vx, g.vy) * dt / 0.32;   // 転がった道のりで 回す
  g.sq = Math.max(0, g.sq - dt * 1.5); g.ouch = Math.max(0, g.ouch - dt); g.happy = Math.max(0, g.happy - dt);
  if (!g.go && Math.hypot(g.vx, g.vy) > 0.3) g.go = true;   // タイムは お米が 動きだしてから（盤を 見て 考える あいだは 数えない）
  if (g.go) g.t += dt;
  const ci = Math.floor(g.x), cj = Math.floor(g.y), idx = cj * b.tw + ci;
  const water = b.cell[idx] === 2, inHole = b.holes.has(idx) && Math.hypot(g.x - ci - 0.5, g.y - cj - 0.5) < 0.3;
  if (water || inHole) {   // おちた
    g.fall = 0.8; g.falls++; g.fallAt = [g.x, g.y]; g.fallWater = water; g.vx = g.vy = 0;
    if (water) api.splash(0.8); else api.koto(0.8, true);
    if (navigator.vibrate) try { navigator.vibrate(60); } catch (e) { /* noop */ }
    return;
  }
  if (Math.hypot(g.x - b.goal[0] - 0.5, g.y - b.goal[1] - 0.5) < 0.42) win();
}
function win() {
  const g = game, b = g.board;
  g.done = true; g.happy = 99;
  const sec = Math.round(g.t * 10) / 10, par = b.len * 0.45 + 3;   // 目やすの時間（道のりから）
  const stars = g.falls === 0 && sec <= par ? 3 : sec <= par * 1.6 ? 2 : 1;
  const prev = st.best[g.n], newBest = !prev || sec < prev.t;
  if (newBest) st.best[g.n] = { t: sec, s: Math.max(stars, prev ? prev.s : 0) };
  st.stage = Math.max(st.stage, g.n + 1);
  save();
  if (root.nsgTrack) root.nsgTrack('meiro_clear', { stage: g.n + 1, sec, falls: g.falls, stars });
  const has = g.n + 1 < goalList().length;
  ui.card.innerHTML = `<h3>🏁 ゴール！</h3><p>${esc(g.spot.name)} に ついた</p>
    <div class="mz-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
    <p>タイム ${sec.toFixed(1)}秒${newBest ? '（ベスト！）' : `（ベスト ${prev.t.toFixed(1)}秒）`}　おちた ${g.falls}回</p>
    <div class="mz-row">${has ? '<button type="button" data-mz="next">つぎの めいろ ▶</button>' : ''}<button type="button" class="sub" data-mz="again">もういちど</button></div>`;
  // 紙ふぶき：ゴールから ごはんつぶ・星・桜が はじける。音は コトンを 4つ 上がっていく
  const gx = b.goal[0] + 0.5, gy = b.goal[1] + 0.5, cols = ['#ffffff', '#ffe066', '#ff8fb0', '#7fd8f6', '#9be07a'];
  for (let i = 0; i < 46; i++) { const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 5; g.fx.push({ x: gx, y: gy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, c: cols[i % cols.length], t: 0, life: 0.9 + Math.random() * 0.7 }); }
  [0, 110, 220, 380].forEach((ms, i) => setTimeout(() => api.koto(0.5 + i * 0.15, i === 3), ms));
  if (navigator.vibrate) try { navigator.vibrate([30, 40, 30, 40, 80]); } catch (e) { /* noop */ }
  setTimeout(() => { if (game === g) ui.clear.hidden = false; }, 1100);
}
function showList() {
  const list = goalList(), open = Math.min(st.stage, list.length - 1);
  ui.card.innerHTML = `<h3 style="color:#2f5d34">🌀 めいろ の いちらん</h3><div class="mz-row" style="max-height:50vh;overflow:auto">${list.slice(0, open + 1).map((s, i) => {
    const b = st.best[i];
    return `<button type="button" class="sub" style="background:#eef3e6;color:#2a2a20;box-shadow:none" data-mz="go:${i}">${i + 1}. ${esc(s.name)}${b ? `<br/><small>${'★'.repeat(b.s)} ${b.t.toFixed(1)}秒</small>` : ''}</button>`;
  }).join('')}</div><div class="mz-row"><button type="button" data-mz="again">もどる</button></div>`;
  ui.clear.hidden = false;
  if (game) game.paused = true;
}
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function tick(now) {
  if (!ui || ui.el.hidden || !game || !game.board) return;
  raf = requestAnimationFrame(tick);
  const g = game, dt = Math.min(0.05, g.last ? (now - g.last) / 1000 : 0);
  g.last = now;
  if (!g.done && ui.clear.hidden) { g.acc = (g.acc || 0) + dt; while (g.acc >= 1 / 120) { g.acc -= 1 / 120; step(1 / 120); if (g.done) break; } }
  else if (g.done) { g.happy = 99; g.th += dt * 3; }
  for (const p of g.fx || []) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 9 * dt; p.vx *= 1 - dt * 1.5; }
  if (g.fx) g.fx = g.fx.filter(p => p.t < p.life);
  draw(now);
  ui.time.textContent = g.t.toFixed(1);
}
function draw(now) {
  const g = game, b = g.board, T = g.T, x = ui.cv.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(g.bg, 0, 0);
  // ゴール：名所の絵と、ぴこぴこ光る わ と 旗
  const gx = (b.goal[0] + 0.5) * T, gy = (b.goal[1] + 0.5) * T, pulse = (Math.sin(now / 220) + 1) / 2;
  x.strokeStyle = `rgba(255,230,80,${0.5 + pulse * 0.5})`; x.lineWidth = Math.max(2, T / 10);
  x.beginPath(); x.arc(gx, gy, T * (0.42 + pulse * 0.12), 0, Math.PI * 2); x.stroke();
  const spr = api.spriteOf(g.spot);
  if (spr) { const s = T * 1.5; x.drawImage(spr, Math.round(gx - s / 2), Math.round(gy - s * 0.95), s, s); }
  flag(x, gx + T * 0.18, gy - T * 0.1, T);
  for (const p of g.fx || []) {   // 紙ふぶき（点の大きさの 四角。終わりに うすく）
    const q = Math.max(2, Math.round(T / 9));
    x.globalAlpha = Math.max(0, 1 - p.t / p.life); x.fillStyle = '#222'; x.fillRect(Math.round(p.x * T) - 1, Math.round(p.y * T) - 1, q + 2, q + 2);
    x.fillStyle = p.c; x.fillRect(Math.round(p.x * T), Math.round(p.y * T), q, q);
  }
  x.globalAlpha = 1;
  // お米
  const u = T * 0.028;
  if (g.fall > 0) {   // おちていく：くるくる 小さく
    const k = g.fall / 0.8, [fx, fy] = g.fallAt;
    if (g.fallWater) { x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = Math.max(1, T / 14); x.beginPath(); x.arc(fx * T, fy * T, T * (0.5 - k * 0.3), 0, Math.PI * 2); x.stroke(); }
    if (k > 0.3) nishioPixel.drawRice(x, fx * T, fy * T, g.th + (1 - k) * 8, 0, 'dizzy', 0, '', u * (k - 0.3) / 0.7);
    return;
  }
  const X = g.x * T, Y = g.y * T;
  x.fillStyle = 'rgba(0,0,0,.28)'; x.beginPath(); x.ellipse(X, Y + T * 0.3, T * 0.26, T * 0.09, 0, 0, Math.PI * 2); x.fill();
  const mood = g.happy > 0 ? 'happy' : g.ouch > 0 ? 'ouch' : Math.hypot(g.vx, g.vy) > 4 ? 'excited' : 'smile';
  nishioPixel.drawRice(x, X, Y, g.th % (Math.PI * 2), g.sq, mood, 0, '', u);
}
function flag(x, X, Y, T) {   // 🏁 の旗（白黒の市松）
  const u = Math.max(1, Math.round(T / 16));
  x.fillStyle = '#3a2a1a'; x.fillRect(Math.round(X), Math.round(Y - 9 * u), u, 10 * u);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(Math.round(X + u + i * u * 1.5), Math.round(Y - 9 * u + j * u * 1.5), Math.ceil(u * 1.5), Math.ceil(u * 1.5)); }
}

// はじめの画面の「🌀 傾けて めいろ」：操作して遊ぶ で始めてから めいろを開く。地図の 🌀 ボタンでも開く
document.addEventListener('DOMContentLoaded', () => {
  const b = $('meiroBtn');
  if (b) b.addEventListener('click', () => { const d = $('demoBtn'); if (d) d.click(); setTimeout(() => open(), 60); });
  const m = $('pxMeiro');
  if (m) m.addEventListener('click', () => open());
});

root.NISHIO_MEIRO = { open, close, get state() { return st; }, get game() { return game; }, goalList, makeBoard: (n, s) => makeBoard(n, s),
  // プレイテスト用：お米を 盤の (x, y) マスへ
  warp(x, y) { if (game && game.board) { game.x = x; game.y = y; game.vx = game.vy = 0; } } };
})(window);
