










(function (root) {
'use strict';
const $ = id => document.getElementById(id);
const KEY = 'nsg_meiro';

const GOALS = ['f-nishio-station', 'f-nishio-castle', 'f-ricepia', 'f-iwase-bunko', 'f-kondo-beikoku', 'f-konrenji', 'f-jofukuji', 'f-kurokabe', 'f-inariyama-chaen'];
const K = 2;
const SLOPE = 2;
const ACC = 16, MAX = 7.5, CRR = 1.1, LIN = 0.55, BOUNCE = 0.38, R = 0.3;

const load = () => { try { return Object.assign({ stage: 0, best: {}, skip: [] }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { stage: 0, best: {}, skip: [] }; } };
const st = load();
if (st.ver !== 3) { st.best = {}; st.skip = []; st.ver = 3; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {  } note(); };
function note() {
  const el = document.getElementById('meiroNote');
  if (!el || !st.stage) return;
  el.textContent = `${st.stage + 1}面まで あそべる`;
}

let api = null, ui = null, game = null, raf = 0, wantDaily = false, wantOpen = false;
const bad = new Set(st.skip || []);
const HIT_STOP = 5, HIT_STOP_S = 0.045;
const calm = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
const keys = { up: 0, down: 0, left: 0, right: 0 }, drag = { on: false, x0: 0, y0: 0, x: 0, y: 0 };

function goalList(all = false) {
  const G = root.nishioGo, spots = (G && G.spots) || [];
  const byId = new Map(spots.map(s => [s.id, s]));
  const first = GOALS.map(id => byId.get(id)).filter(s => s && (all || !bad.has(s.id)));
  const castle = byId.get('f-nishio-castle') || first[0];
  const rest = castle ? spots.filter(s => s.featured && (all || !bad.has(s.id)) && !first.includes(s) && G.dist(castle, s) < 9000).sort((a, b) => G.dist(castle, a) - G.dist(castle, b)) : [];
  return [...first, ...rest];
}
const boardSize = n => ({ tw: 17 + Math.min(3, Math.floor(n / 3)), th: 28 + Math.min(6, Math.floor(n / 3) * 2) });


function makeBoard(n, spot) {
  const A = api, C = A.C, PATH = new Set([C.R, C.H, C.D]);
  const { tw, th } = boardSize(n);
  const g = A.toTile(spot.lat, spot.lng), gx = Math.floor(g.x / K), gy = Math.floor(g.y / K);


  let best = null;
  for (const fy of [0.2, 0.8, 0.5]) for (const fx of [0.5, 0.25, 0.75]) {
    const tx0 = gx - Math.floor(tw * fx), ty0 = gy - Math.floor(th * fy);
    const b = layout(n, tx0, ty0, tw, th, gx, gy, PATH);
    if (b && (!best || b.len > best.len)) best = b;
  }
  if (best && best.len < 22 + (Math.min(n, 12) * 1.5 | 0)) return null;
  if (best) best.spot = spot;
  return best;
}
function layout(n, tx0, ty0, tw, th, gx, gy, PATH) {


  const A = api, C = A.C, cell = new Uint8Array(tw * th), er = new Uint8Array(tw * th), ed = new Uint8Array(tw * th);
  const W = tw * K, H = th * K, kind = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = A.codeAt(tx0 * K + x, ty0 * K + y); kind[y * W + x] = PATH.has(c) ? 1 : c === C.A ? 2 : 0; }
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    let road = 0, water = 0, park = 0;
    for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) {
      const v = kind[(y * K + j) * W + x * K + i];
      if (v === 1) road++; else if (v === 2) water++;
      else { const c = A.codeAt((tx0 + x) * K + i, (ty0 + y) * K + j); if (c === C.P || c === C.J) park++; }
    }
    cell[y * tw + x] = water >= 3 && !road ? 2 : road >= 1 || park >= 3 ? 1 : 0;
    if (park >= 3 && !road) for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) { const q = (y * K + j) * W + x * K + i; if (!kind[q]) kind[q] = 1; }
  }

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



  {
    let sd = ((tx0 * 73856093) ^ (ty0 * 19349663) ^ (tw * 83492791) ^ (th * 2654435761)) >>> 0 || 1;
    const rn = () => { sd ^= sd << 13; sd >>>= 0; sd ^= sd >>> 17; sd ^= sd << 5; sd >>>= 0; return sd / 4294967296; };
    const floor = i => cell[i] === 1, cand = [];
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const i = y * tw + x;
      if (er[i] && floor(i) && floor(i + 1)) cand.push([i, i + 1, 'r', i]);
      if (ed[i] && floor(i) && floor(i + tw)) cand.push([i, i + tw, 'd', i]);
    }
    const nb = new Map();
    for (const e of cand) { for (const [u, v] of [[e[0], e[1]], [e[1], e[0]]]) { if (!nb.has(u)) nb.set(u, []); nb.get(u).push([v, e]); } }
    for (const e of cand) (e[2] === 'r' ? er : ed)[e[3]] = 0;
    const seen = new Uint8Array(tw * th), tree = new Set();
    for (const s0 of nb.keys()) {
      if (seen[s0]) continue;
      const stack = [s0]; seen[s0] = 1;
      while (stack.length) {
        const u = stack[stack.length - 1], opts = (nb.get(u) || []).filter(([v]) => !seen[v]);
        if (!opts.length) { stack.pop(); continue; }
        const [v, e] = opts[(rn() * opts.length) | 0];
        seen[v] = 1; tree.add(e); (e[2] === 'r' ? er : ed)[e[3]] = 1; stack.push(v);
      }
    }
    const braid = Math.max(0.06, 0.3 - n * 0.04);
    for (const e of cand) if (!tree.has(e) && rn() < braid) (e[2] === 'r' ? er : ed)[e[3]] = 1;
  }

  const near = [];
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) if (at(x, y) === 1) { const d = Math.hypot(tx0 + x - gx, ty0 + y - gy); if (d <= 6) near.push([d, x, y]); }
  if (!near.length) return null;
  near.sort((a, c) => a[0] - c[0]);
  const B = { n, tx0, ty0, tw, th, cell, er, ed, goal: null, holes: new Set() };
  let dist = null, most = 0;
  for (const [, x, y] of near) {
    const d = bfs(B, [x, y]), k = d.reduce((a, v) => a + (v > 0), 0);
    if (k > most) { most = k; B.goal = [x, y]; dist = d; }
    if (k >= 40) break;
  }
  const goal = B.goal;

  const aim = 60 + Math.min(n, 10) * 9;
  let start = null, len = 0;
  for (let i = 0; i < dist.length; i++) if (dist[i] > len && dist[i] <= aim) { len = dist[i]; start = [i % tw, (i / tw) | 0]; }
  if (!start || len < 20) return null;

  const want = Math.min(8, Math.max(0, n - 1) * 2), cand = [];
  for (let i = 0; i < dist.length; i++) if (dist[i] > 2 && dist[i] < len - 2) cand.push(i);
  let seed = (n + 1) * 2654435761 >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let k = 0; k < cand.length * 3 && B.holes.size < want; k++) {
    const i = cand[(rnd() * cand.length) | 0];
    if (B.holes.has(i) || [...B.holes].some(j => Math.abs(j % tw - i % tw) + Math.abs(((j / tw) | 0) - ((i / tw) | 0)) < 3)) continue;
    B.holes.add(i);
    if (bfs(B, goal)[start[1] * tw + start[0]] <= 0) B.holes.delete(i);
  }


  const toG = bfs(B, goal), fromS = bfs(B, start), L = toG[start[1] * tw + start[0]], onPath = new Set();
  for (let i = 0; i < toG.length; i++) if (toG[i] && fromS[i] && toG[i] + fromS[i] - 1 === L) onPath.add(i);
  const ends = [];
  for (let i = 0; i < toG.length; i++) {
    if (!toG[i] || !fromS[i] || onPath.has(i) || B.holes.has(i)) continue;
    const x = i % tw, y = (i / tw) | 0, ways = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => pass(B, x, y, dx, dy) && cell[(y + dy) * tw + x + dx] === 1).length;
    if (ways === 1) ends.push(i);
  }
  const grains = [];
  while (grains.length < 3 && ends.length) {
    let bi = 0, bd = -1;
    ends.forEach((i, k) => { const d = grains.length ? Math.min(...grains.map(j => Math.abs(j % tw - i % tw) + Math.abs(((j / tw) | 0) - ((i / tw) | 0)))) : toG[i]; if (d > bd) { bd = d; bi = k; } });
    grains.push(ends.splice(bi, 1)[0]);
  }
  const komono = [];
  while (komono.length < 2 && ends.length) {
    let bi = 0, bd = -1;
    ends.forEach((i, k) => { const d = Math.min(1e9, ...grains.concat(komono).map(j => Math.abs(j % tw - i % tw) + Math.abs(((j / tw) | 0) - ((i / tw) | 0)))); if (d > bd) { bd = d; bi = k; } });
    komono.push(ends.splice(bi, 1)[0]);
  }
  let spring = -1, sd = 1e9;
  for (const i of onPath) { const d = Math.abs(fromS[i] - 1 - Math.round(L * 0.3)); if (d < sd && !B.holes.has(i) && i !== start[1] * tw + start[0] && !grains.includes(i)) { sd = d; spring = i; } }
  return Object.assign(B, { start, len, grains, spring, komono });
}
const pass = (b, x, y, dx, dy) => {
  if (dx === 1) return x + 1 < b.tw && b.er[y * b.tw + x] === 1;
  if (dx === -1) return x > 0 && b.er[y * b.tw + x - 1] === 1;
  if (dy === 1) return y + 1 < b.th && b.ed[y * b.tw + x] === 1;
  return y > 0 && b.ed[(y - 1) * b.tw + x] === 1;
};
function bfs(b, from) {
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





const TUBE = 0.12, HALF = TUBE + R;
const SPRING_S = 12, SPRING_E = 1.3;
const SOFT_K = 2400, SOFT_C = 14, SOFT_MAX = 0.12;

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function tubes(b) {
  if (b.tube) return b.tube;
  const { tw, th, cell } = b, reach = bfs(Object.assign({}, b, { holes: new Set() }), b.goal), out = new Array(tw * th);
  const ok = i => (cell[i] === 1 ? reach[i] > 0 : cell[i] === 2);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const i = y * tw + x;
    if (!ok(i)) continue;
    const arms = DIRS.filter(([dx, dy]) => { const j = (y + dy) * tw + x + dx; return pass(b, x, y, dx, dy) && ok(j) && (cell[i] === 1 || cell[j] === 1); }).map(([dx, dy]) => [x + 0.5 + dx * 0.5, y + 0.5 + dy * 0.5, dx, dy]);
    if (cell[i] === 2 && !arms.length) continue;
    const px = x + 0.5, py = y + 0.5, own = [];
    const bez = (a, c) => { const q = []; for (let k = 0; k <= 6; k++) { const t = k / 6, u = 1 - t; q.push([u * u * a[0] + 2 * u * t * px + t * t * c[0], u * u * a[1] + 2 * u * t * py + t * t * c[1]]); } return q; };
    if (!arms.length) own.push([[px - 0.01, py], [px + 0.01, py]]);
    else if (arms.length === 2) own.push(bez(arms[0], arms[1]));
    else {
      for (const a of arms) own.push([[px, py], [a[0], a[1]]]);
      if (arms.length > 2) for (let m = 0; m < arms.length; m++) for (let k = m + 1; k < arms.length; k++) if (!(arms[m][2] * arms[k][2] + arms[m][3] * arms[k][3])) own.push(bez(arms[m], arms[k]));
    }
    out[i] = own;
  }
  return (b.tube = out);
}
function near(b, x, y) {
  const T = tubes(b), a = Math.floor(x), c = Math.floor(y);
  let bd = Infinity, bx = 0, by = 0;
  for (let j = c - 1; j <= c + 1; j++) for (let i = a - 1; i <= a + 1; i++) {
    if (i < 0 || j < 0 || i >= b.tw || j >= b.th || !T[j * b.tw + i]) continue;
    for (const q of T[j * b.tw + i]) for (let k = 1; k < q.length; k++) {
      const x0 = q[k - 1][0], y0 = q[k - 1][1], dx = q[k][0] - x0, dy = q[k][1] - y0, l = dx * dx + dy * dy;
      const t = l ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l)) : 0, qx = x0 + dx * t, qy = y0 + dy * t, d = (x - qx) * (x - qx) + (y - qy) * (y - qy);
      if (d < bd) { bd = d; bx = qx; by = qy; }
    }
  }
  return bd < Infinity ? { d: Math.sqrt(bd), x: bx, y: by } : null;
}

function onPath(b, i, j) {
  const k = j * b.tw + i, c = b.onp || (b.onp = new Map());
  let p = c.get(k);
  if (!p) { const q = near(b, i + 0.5, j + 0.5); p = q ? [q.x, q.y] : [i + 0.5, j + 0.5]; c.set(k, p); }
  return p;
}


const CSS = `.share.over-meiro{z-index:3600}
#meiro{position:fixed;inset:0;z-index:3500;background:radial-gradient(circle at 50% 30%,#2f6f8f,#123247);display:flex;flex-direction:column;align-items:center;color:#fff;font-family:"DotGothic16","Hiragino Sans",sans-serif;user-select:none;-webkit-user-select:none;overflow-y:auto;overscroll-behavior:contain}   /* 横向きなど 低い画面では 下のボタンまで スクロールできる */
#meiro[hidden]{display:none}
#meiro .mz-top{width:min(100%,520px);box-sizing:border-box;padding:calc(env(safe-area-inset-top,0px) + 10px) 14px 6px;display:flex;align-items:center;gap:8px}
#meiro .mz-st{font-size:15px;line-height:1.3;flex:1;min-width:0}
#meiro .mz-goal{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px}
#meiro .mz-st b{font-size:18px;color:#ffe680}
#meiro .mz-st small{font-size:12px;opacity:.85}
#meiro .mz-time{font-size:20px;font-variant-numeric:tabular-nums;min-width:4.5em;text-align:right}
#meiro .mz-x{border:0;background:rgba(255,255,255,.18);color:#fff;border-radius:10px;padding:6px 10px;font:inherit;font-size:14px}
#meiro .mz-slow[aria-pressed=true]{background:#ffe680;color:#2a2410}
#meiro .mz-bezel{position:relative;margin:4px auto 0;padding:14px;border-radius:30px;background:linear-gradient(145deg,#7fd8f6,#2fa6dc 45%,#1a7fb6);box-shadow:0 10px 24px rgba(0,0,0,.45),inset 0 3px 0 rgba(255,255,255,.55),inset 0 -4px 0 rgba(0,0,0,.25)}
#meiro .mz-glass{position:relative;border-radius:18px;overflow:hidden;box-shadow:inset 0 0 0 3px #c9d4da,inset 0 0 18px rgba(0,0,0,.35);background:#ddd}
#meiro canvas{display:block;image-rendering:pixelated;touch-action:none}   /* 盤を なぞる あいだは 画面を動かさない */
#meiro .mz-glass::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:18px;background:linear-gradient(155deg,rgba(255,255,255,.32),rgba(255,255,255,0) 32%,rgba(255,255,255,0) 70%,rgba(255,255,255,.12));box-shadow:inset 0 0 0 3px rgba(255,255,255,.35)}
#meiro .mz-hint{font-size:13px;opacity:.9;margin:10px 14px 4px;text-align:center;line-height:1.5}
#meiro .mz-btns{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;max-width:100%;box-sizing:border-box;padding:0 8px;margin:6px 0 calc(env(safe-area-inset-bottom,0px) + 10px)}
@media (max-width:360px){#meiro .mz-btns{gap:6px}#meiro .mz-btns button{padding:9px 12px;font-size:14px}}   /* せまい スマホ（320 幅）でも 3つの ボタンが 画面に おさまる */
@media (orientation:landscape) and (max-height:540px){   /* 横向きの 低い画面：盤を 左、ヒントと ボタンを 右に ならべて、スクロールせずに 盤が 大きく 見える */
#meiro{display:grid;grid-template-columns:auto minmax(150px,240px);grid-template-rows:auto 1fr auto;grid-template-areas:"top top" "bezel hint" "bezel btns";justify-content:center;align-content:start;column-gap:16px;padding:0 max(8px,env(safe-area-inset-right,0px)) 0 max(8px,env(safe-area-inset-left,0px))}
#meiro .mz-top{grid-area:top;width:min(100%,760px);justify-self:center;padding-top:calc(env(safe-area-inset-top,0px) + 6px)}
#meiro .mz-bezel{grid-area:bezel;margin:0 0 calc(env(safe-area-inset-bottom,0px) + 8px);padding:10px;border-radius:24px}
#meiro .mz-hint{grid-area:hint;align-self:end;text-align:left;margin:0 0 8px;font-size:12px}
#meiro .mz-btns{grid-area:btns;flex-direction:column;align-items:stretch;justify-content:flex-start;gap:8px;padding:0;margin:0 0 calc(env(safe-area-inset-bottom,0px) + 8px)}
}
#meiro .mz-btns button,#meiro .mz-clear button{border:0;border-radius:999px;padding:10px 18px;font:inherit;font-size:15px;background:#ffe680;color:#2a2410;box-shadow:0 3px 0 #b59a2a}
#meiro .mz-btns button.sub{background:rgba(255,255,255,.2);color:#fff;box-shadow:none}
#meiro .mz-clear{position:fixed;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;background:rgba(10,30,40,.55);padding:12px;box-sizing:border-box}   /* 盤の わくの外（低い画面でも 切れない） */
#meiro .mz-clear[hidden]{display:none}
#meiro .mz-card{background:#fffdf2;color:#2a2a20;border-radius:18px;padding:18px 20px;text-align:center;width:min(86%,340px);max-height:100%;overflow-y:auto;box-sizing:border-box;box-shadow:0 8px 24px rgba(0,0,0,.4)}
#meiro .mz-card h3{margin:0 0 6px;font-size:24px;color:#d0402a}
#meiro .mz-card p{margin:6px 0;font-size:15px;line-height:1.5}
#meiro .mz-card .mz-memo{font-size:13px;color:#4a5040;background:#f1eedd;border-radius:10px;padding:8px 10px;text-align:left}
#meiro .mz-card .mz-row{display:flex;gap:8px;justify-content:center;margin-top:12px;flex-wrap:wrap}
#meiro .mz-load{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:15px;color:#fff;background:rgba(0,0,0,.35)}
#meiro .mz-load[hidden]{display:none}`;

function build() {
  const css = document.createElement('style'); css.textContent = CSS; document.head.appendChild(css);
  const el = document.createElement('div');
  el.id = 'meiro'; el.hidden = true;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '西尾めいろ');
  el.innerHTML = `<div class="mz-top"><div class="mz-st"></div><div class="mz-time">0.0</div><button type="button" class="mz-x mz-slow" data-mz="slow" aria-pressed="false" aria-label="ゆっくり転がる" title="ゆっくり">🐢</button><button type="button" class="mz-x" data-mz="close" aria-label="めいろを とじる">✕</button></div>
    <div class="mz-bezel"><div class="mz-glass"><canvas aria-label="迷路の盤"></canvas><div class="mz-load">めいろを つくっています…</div></div></div>
    <div class="mz-clear" hidden><div class="mz-card"></div></div>
    <p class="mz-hint">📱 スマホを 傾けて、お米と 🏁 まで 進もう（パソコンは 矢印キー・盤を なぞっても）。<br/>黒い穴と 水に おちると スタートに もどるよ</p>
    <div class="mz-btns"><button type="button" class="sub" data-mz="retry">↺ やりなおし</button><button type="button" class="sub" data-mz="hint">💡 ヒント</button><button type="button" class="sub" data-mz="list">いちらん</button></div>`;
  document.body.appendChild(el);
  ui = { el, st: el.querySelector('.mz-st'), time: el.querySelector('.mz-time'), cv: el.querySelector('canvas'), glass: el.querySelector('.mz-glass'), bezel: el.querySelector('.mz-bezel'),
    load: el.querySelector('.mz-load'), clear: el.querySelector('.mz-clear'), card: el.querySelector('.mz-card') };
  ['click', 'touchend'].forEach(ev => el.addEventListener(ev, e => { if (api) api.tiltAsk(e); }, { passive: true }));
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-mz]');
    if (!b) return;
    const k = b.dataset.mz;
    if (k === 'close') close();
    else if (k === 'retry') { if (game && game.board) restart(); else if (game) startStage(game.n, game.daily); }
    else if (k === 'next') startStage(game.n + 1);
    else if (k === 'again') startStage(game.n, game.daily);
    else if (k === 'daily') { const d = dailyIndex(); if (d >= 0) startStage(d, true); }
    else if (k === 'resume') resume();
    else if (k === 'hint') hint();
    else if (k === 'slow') { st.slow = !st.slow; save(); b.setAttribute('aria-pressed', String(!!st.slow)); }
    else if (k === 'share') { const sh = $('share'); if (sh) sh.classList.add('over-meiro'); if (game && game.result) root.nishioGo.openShare('meiro', { meiro: Object.assign({ img: ui.cv }, game.result) }); }
    else if (k === 'map') { const id = game && game.spot.id; close(); if (id && root.nishioGo && root.nishioGo.focusSpot) { if (root.nishioGo.openTab) root.nishioGo.openTab('map'); root.nishioGo.focusSpot(id); } }
    else if (k === 'list') showList();
    else if (k.startsWith('go:')) startStage(+k.slice(3));
  });

  ui.cv.addEventListener('pointerdown', e => { drag.on = true; drag.x0 = e.clientX; drag.y0 = e.clientY; drag.x = drag.y = 0; ui.cv.setPointerCapture(e.pointerId); });
  ui.cv.addEventListener('pointermove', e => { if (!drag.on) return; const k = v => Math.max(-1, Math.min(1, v / 70)); drag.x = k(e.clientX - drag.x0); drag.y = k(e.clientY - drag.y0); });
  const up = () => { drag.on = false; drag.x = drag.y = 0; };
  ui.cv.addEventListener('pointerup', up); ui.cv.addEventListener('pointercancel', up);
  document.addEventListener('keydown', e => {
    if (!ui || ui.el.hidden) return;
    const sh = $('share');
    if (sh && !sh.hidden) { if (e.key === 'Escape') sh.hidden = true; return; }
    const k = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
    if (k) { keys[k] = 1; e.preventDefault(); }
    else if (e.key === 'Escape') close();
  });
  document.addEventListener('keyup', e => { const k = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key]; if (k) keys[k] = 0; });
  window.addEventListener('resize', () => { if (game && game.board && !ui.el.hidden) fit(); });
  const letGo = () => { for (const k in keys) keys[k] = 0; drag.on = false; drag.x = drag.y = 0; };
  window.addEventListener('blur', letGo);
  document.addEventListener('visibilitychange', () => { if (document.hidden) letGo(); });
}

function open(n, daily = false) {
  api = root.nishioPixel && root.nishioPixel.meiroApi;
  if (!api) return false;
  if (!ui) build();
  ui.el.hidden = false;
  ui.el.querySelector('[data-mz=slow]').setAttribute('aria-pressed', String(!!st.slow));
  api.pause(true);
  api.tiltReset();
  startStage(daily ? null : typeof n === 'number' ? n : Math.min(st.stage, goalList().length - 1), daily);
  if (root.nsgTrack) root.nsgTrack('meiro_open', { stage: (game && game.n + 1) || 0 });
  return true;
}
function close() {
  if (!ui) return;
  ui.el.hidden = true;
  const sh = $('share'); if (sh) sh.classList.remove('over-meiro');
  cancelAnimationFrame(raf); raf = 0;
  if (api) { api.rumble(0); api.pause(false); }
}



const DAILY_LV = 6;

const dayMiss = new Set();
function dailyIndex() {
  const list = goalList(true), d = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  let h = 2166136261; for (const c of 'meiro:' + d) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  if (list.length <= 3) return 0;
  for (let i = 0; i < list.length - 3; i++) { const k = 3 + (h + i) % (list.length - 3); if (!dayMiss.has(list[k].id)) return k; }
  return -1;
}

const recKey = g => (g.daily ? 'day:' : '') + g.spot.id;
function startStage(n, daily = false) {
  const list = goalList(daily);
  if (!list.length) { ui.load.hidden = false; ui.load.textContent = '名所を よみこみ中…'; setTimeout(() => !ui.el.hidden && startStage(n, daily), 600); return; }
  if (n == null) { n = dailyIndex(); if (n < 0) { ui.load.hidden = false; ui.load.textContent = 'きょうの めいろが つくれなかった'; return; } }
  n = Math.max(0, Math.min(n, list.length - 1));
  game = { n, daily, spot: list[n], board: null, t: 0, falls: 0, done: false };
  ui.clear.hidden = true;
  ui.load.hidden = false; ui.load.textContent = 'めいろを つくっています…';
  ui.st.innerHTML = `${daily ? '☀️ <b>きょうの めいろ</b>' : `🌀 めいろ <b>${n + 1}</b>`}<span class="mz-goal">🏁 ${esc(game.spot.name)}</span>`;
  ui.time.textContent = '';
  const g = game;
  waitChunks(g.spot, allOk => {
    if (game !== g) return;
    if (!allOk) { ui.load.textContent = '地図が よみこめなかった。「↺ やりなおし」で もういちど'; return; }
    const b = makeBoard(daily ? DAILY_LV : n, g.spot);
    if (!b) {
      if (daily) { dayMiss.add(g.spot.id); const k = dailyIndex(); if (k >= 0) startStage(k, true); else ui.load.textContent = 'きょうの めいろが つくれなかった'; return; }
      bad.add(g.spot.id); st.skip = [...bad]; save();
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
  const A = api, t = A.toTile(spot.lat, spot.lng), need = [], r = 32 * K;
  for (let cy = Math.floor((t.y - r) / A.CHUNK); cy <= Math.floor((t.y + r) / A.CHUNK); cy++)
    for (let cx = Math.floor((t.x - r) / A.CHUNK); cx <= Math.floor((t.x + r) / A.CHUNK); cx++) need.push([cx, cy]);
  need.forEach(([cx, cy]) => A.forgetChunk(cx, cy));
  const t0 = Date.now();
  (function poll() {
    if (!ui || ui.el.hidden) return;
    need.forEach(([cx, cy]) => A.ensureChunk(cx, cy));
    const left = need.filter(([cx, cy]) => !['ok', 'out', 'fail'].includes(A.chunkState(cx, cy))).length;
    if (!left || Date.now() - t0 > 20000) done(need.every(([cx, cy]) => ['ok', 'out'].includes(A.chunkState(cx, cy))));
    else setTimeout(poll, 250);
  })();
}
function springShot(g) {
  const sp = g.spring;
  if (sp) sp.at = 0;
}
function restart() {
  const b = game.board;
  clearTimeout(game.cardT);
  game.x = b.start[0] + 0.5; game.y = b.start[1] + 0.5; game.vx = game.vy = 0; game.th = 0; game.sq = 0;
  game.t = 0; game.falls = 0; game.done = false; game.fall = 0; game.stop = 0; game.hop = 0; game.hopT = 0; game.crit = boardCritters(b); game.happy = 0; game.ouch = 0; game.go = false; game.fx = []; game.soft = { on: false, x: 0, y: 0, ux: 0, uy: 0, pen: 0, vin: 0, dent: 0, dv: 0, boings: 0 }; game.hint = null; game.hints = 0; game.got = new Set(); game.spring = { got: false, left: 0, boosts: 0, chain: 0, at: 0 };
  if (api && api.tiltReset) api.tiltReset();
  ui.clear.hidden = true;
}


function fit() {
  const b = game.board, dpr = Math.min(root.devicePixelRatio || 1, 3);
  const side = root.matchMedia && root.matchMedia('(orientation:landscape) and (max-height:540px)').matches;
  const oh = q => { const e = ui.el.querySelector(q); if (!e) return 0; const s = getComputedStyle(e); return e.getBoundingClientRect().height + parseFloat(s.marginTop) + parseFloat(s.marginBottom); };
  const used = oh('.mz-top') + oh('.mz-hint') + oh('.mz-btns') + 28 + 4 + 4;
  const maxW = side ? innerWidth - 240 - 16 - 16 - 20 - 8 : Math.min(innerWidth, 520) - 28 - 28, maxH = side ? innerHeight - 64 - 20 - 10 : innerHeight - Math.max(190, used);
  const css = Math.max(6, Math.floor(Math.min(maxW / b.tw, Math.max(120, maxH) / b.th)));
  const T = Math.max(K, Math.round(css * dpr / K) * K);
  game.T = T; game.dpr = dpr;
  ui.cv.width = b.tw * T; ui.cv.height = b.th * T;
  ui.cv.style.width = b.tw * T / dpr + 'px'; ui.cv.style.height = b.th * T / dpr + 'px';
  game.bg = paintBoard(b, T); game.dem = api.demGen;
}
function paintBoard(b, T) {
  const c = document.createElement('canvas'); c.width = b.tw * T; c.height = b.th * T;
  const x = c.getContext('2d'), W = c.width, H = c.height;
  api.paintRegion(x, b.tx0 * K, b.ty0 * K, b.tw * K, b.th * K, T / K);
  const net = new Path2D();
  for (const own of tubes(b)) if (own) for (const q of own) { net.moveTo(q[0][0] * T, q[0][1] * T); for (let k = 1; k < q.length; k++) net.lineTo(q[k][0] * T, q[k][1] * T); }
  const u = Math.max(1, Math.round(T / 16)), sh = Math.max(1, Math.round(T * 0.12)), wi = 2 * HALF * T;
  const layer = () => { const l = document.createElement('canvas'); l.width = W; l.height = H; const y = l.getContext('2d'); y.lineCap = y.lineJoin = 'round'; return [l, y]; };
  x.lineCap = x.lineJoin = 'round';
  x.strokeStyle = 'rgba(255,250,235,.38)'; x.lineWidth = wi; x.stroke(net);
  const m = document.createElement('canvas'); m.width = W; m.height = H; m.getContext('2d').drawImage(c, 0, 0); c.map = m;
  const [L, l] = layer();
  l.fillStyle = 'rgba(28,70,52,.86)'; l.fillRect(0, 0, W, H);
  l.strokeStyle = 'rgba(190,240,205,.35)'; l.lineWidth = wi + 6 * u; l.stroke(net);
  if (api.hedgeStyleAt && api.hedgePat) {
    const T2 = tubes(b), nets = {};
    for (let k = 0; k < T2.length; k++) {
      if (!T2[k]) continue;
      const i = k % b.tw, j = (k / b.tw) | 0, st = api.hedgeStyleAt((b.tx0 + i) * K + K / 2, (b.ty0 + j) * K + K / 2), p = nets[st] || (nets[st] = new Path2D());
      for (const q of T2[k]) { p.moveTo(q[0][0] * T, q[0][1] * T); for (let n = 1; n < q.length; n++) p.lineTo(q[n][0] * T, q[n][1] * T); }
    }
    l.lineWidth = wi + 2 * Math.max(2 * u, Math.round(T * 0.12));
    for (const st in nets) { const pat = api.hedgePat(l, 0, 0, T / K, st); if (pat) { l.strokeStyle = pat; l.stroke(nets[st]); } }
  }
  l.strokeStyle = '#0d2219'; l.lineWidth = wi + 2 * u; l.stroke(net);
  l.globalCompositeOperation = 'destination-out'; l.lineWidth = wi; l.stroke(net);
  const [S, z] = layer();
  z.fillStyle = '#000'; z.fillRect(0, 0, W, H);
  z.globalCompositeOperation = 'destination-out'; z.translate(sh, sh); z.lineWidth = wi; z.stroke(net);
  x.globalAlpha = 0.32; x.drawImage(S, 0, 0); x.globalAlpha = 1;
  x.drawImage(L, 0, 0);

  const at = (i, j) => (i < 0 || j < 0 || i >= b.tw || j >= b.th ? 0 : b.cell[j * b.tw + i]), T2 = tubes(b);
  const sw = Math.max(2, Math.round(T / 10)), half = HALF * T;
  const stripes = (X, Y, w, h) => { for (let k = 0; k * sw < Math.max(w, h); k++) { x.fillStyle = k % 2 ? '#1a1a1a' : '#f2c200'; if (w > h) x.fillRect(X + k * sw, Y, Math.min(sw, w - k * sw), h); else x.fillRect(X, Y + k * sw, w, Math.min(sw, h - k * sw)); } };
  for (let j = 0; j < b.th; j++) for (let i = 0; i < b.tw; i++) {
    if (at(i, j) !== 1 || !T2[j * b.tw + i]) continue;
    const X = (i + 0.5) * T, Y = (j + 0.5) * T;
    for (const [dx, dy] of DIRS) if (at(i + dx, j + dy) === 2 && pass(b, i, j, dx, dy)) {
      if (dx) stripes(X + dx * T / 2 - sw / 2, Y - half, sw, 2 * half); else stripes(X - half, Y + dy * T / 2 - sw / 2, 2 * half, sw);
    }
  }
  for (const i of b.holes) { const p = onPath(b, i % b.tw, (i / b.tw) | 0); hole(x, p[0] * T, p[1] * T, T); }
  (b.komono || []).forEach((i, n) => {
    const ci = i % b.tw, cj = (i / b.tw) | 0, op = DIRS.find(([dx, dy]) => pass(b, ci, cj, dx, dy) && at(ci + dx, cj + dy) === 1) || [0, 1];
    komonoDraw(x, KOMONO[(ci + cj + n) % 2], (ci + 0.5 - op[0] * 0.12) * T, (cj + 0.5 - op[1] * 0.12) * T, T * 0.5);
  });

  const sx = (b.start[0] + 0.5) * T, sy = (b.start[1] + 0.5) * T;
  x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 2 * u; x.setLineDash([3 * u, 2 * u]);
  x.beginPath(); x.arc(sx, sy, T * 0.42, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
  return c;
}

const KOMONO = [
  ['....kkkk....', '...kggggk...', '..kggggggk..', '..kgkggkgk..', '..kggggggk..', '...kggggk...', '..krrrrrrk..', '.kgrrrrrrgk.', '.kggrrrrggk.', '.kggggggggk.', '.kggggggggk.', '..kkkkkkkk..'],
  ['....kkkk....', '...kwwwwk...', '...kkkkkk...', '..kbbbbbbk..', '.kbbBbbbbbk.', '.kbBbbbbbbk.', 'kbbbbbbbbbbk', 'kbbbbbbbbbbk', '.kbbbbbbbbk.', '.kbbbbbbbbk.', '..kbbbbbbk..', '...kkkkkk...'],
];
const KOMONO_C = { k: '#2a2420', g: '#aaa69b', w: '#f2ead8', r: '#c8423a', b: '#7a4a2a', B: '#b07c52' };
function komonoDraw(x, rows, cx, cy, size) {
  const p = size / 12, x0 = Math.round(cx - size / 2), y0 = Math.round(cy - size / 2);
  rows.forEach((row, j) => { for (let i = 0; i < 12; i++) { const c = KOMONO_C[row[i]]; if (c) { x.fillStyle = c; x.fillRect(x0 + Math.floor(i * p), y0 + Math.floor(j * p), Math.ceil(p), Math.ceil(p)); } } });
}
function hole(x, cx, cy, T) {
  x.fillStyle = '#5a5a5a'; x.beginPath(); x.arc(cx, cy, T * 0.4, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#0c0c0c'; x.beginPath(); x.arc(cx, cy, T * 0.32, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(cx - T * 0.3, cy + T * 0.26, T * 0.6, Math.max(1, T / 16));
}


const WALL = 0.09;
function blocked(b, px, py) {
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
  if (g.fall > 0) {
    g.fall -= dt;
    if (g.fall <= 0) { g.x = b.start[0] + 0.5; g.y = b.start[1] + 0.5; g.vx = g.vy = 0; g.ouch = 1; }
    return;
  }
  if (g.stop > 0) { g.stop -= dt; if (g.go) g.t += dt; return; }
  const [ax, ay] = input();
  const acc = ACC * (st.slow ? 0.55 : 1);
  g.vx += ax * acc * dt; g.vy += ay * acc * dt;
  {
    const sl = api.slopeAt((b.tx0 + g.x) * K, (b.ty0 + g.y) * K);
    if (sl.known) { g.vx += sl.x / K * SLOPE * dt; g.vy += sl.y / K * SLOPE * dt; }
  }
  {
    const ci = Math.floor(g.x), cj = Math.floor(g.y);
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      if (!b.holes.has(j * b.tw + i)) continue;
      const p = onPath(b, i, j), dx = p[0] - g.x, dy = p[1] - g.y, d = Math.hypot(dx, dy);
      if (d < 0.62 && d > 0.01) { const k = (0.62 - d) * 22 * dt / d; g.vx += dx * k; g.vy += dy * k; }
    }
  }
  const sp = Math.hypot(g.vx, g.vy);
  const max = MAX * (st.slow ? 0.6 : 1);
  if (sp > 0) { const k = Math.max(0, sp - (CRR + LIN * sp) * dt) / sp * (sp > max ? max / sp : 1); g.vx *= k; g.vy *= k; }
  const tb = near(b, g.x, g.y);
  if (tb && tb.d <= TUBE + 0.25) {
    const ix = ax, iy = ay, im = Math.hypot(ix, iy);
    if (tb.d > TUBE - 0.03 && im > 0.3) {
      const ux = (g.x - tb.x) / tb.d, uy = (g.y - tb.y) / tb.d;
      if ((ix * ux + iy * uy) / im > 0.6) {
        const dx = Math.abs(ix) >= Math.abs(iy) ? Math.sign(ix) : 0, dy = dx ? 0 : Math.sign(iy), cx = Math.floor(g.x), cy = Math.floor(g.y);
        let aim = pass(b, cx, cy, dx, dy) ? [cx + 0.5 + dx * 0.5, cy + 0.5 + dy * 0.5] : null;
        if (!aim) for (const [ex, ey] of DIRS) if (!(ex * dx + ey * dy) && pass(b, cx, cy, ex, ey) && pass(b, cx + ex, cy + ey, dx, dy) && Math.hypot(g.x - cx - 0.5 - ex * 0.5, g.y - cy - 0.5 - ey * 0.5) < 0.55) { aim = [cx + ex + 0.5 + dx * 0.5, cy + ey + 0.5 + dy * 0.5]; break; }
        if (aim) { let tx = -uy, ty = ux; if (tx * (aim[0] - tb.x) + ty * (aim[1] - tb.y) < 0) { tx = -tx; ty = -ty; } const k = acc * Math.min(1, im) * 0.9 * dt; g.vx += tx * k; g.vy += ty * k; }
      }
    }
    let nx = g.x + g.vx * dt, ny = g.y + g.vy * dt;
    const q = near(b, nx, ny), sf = g.soft;
    if (q && q.d > TUBE) {
      const ux = (nx - q.x) / q.d, uy = (ny - q.y) / q.d, hit = g.vx * ux + g.vy * uy, over = q.d - TUBE, pen = Math.min(over, SOFT_MAX);
      if (!sf.on && hit > 1.2) { api.koto(Math.min(1, hit / 6), hit > 4); g.sq = Math.min(0.32, hit * 0.06); if (hit > 4) g.ouch = 0.6; }
      if (!sf.on && hit > 2.5 && !calm && navigator.vibrate && localStorage.getItem('nsg_bgm') !== 'false') try { navigator.vibrate(Math.min(12, Math.round(3 + hit * 1.2))); } catch (e) {  }
      if (!sf.on && hit > HIT_STOP && !calm) g.stop = HIT_STOP_S;
      if (!sf.on) { sf.vin = Math.max(0, hit); sf.dv = Math.max(sf.dv, sf.vin / 6); }
      Object.assign(sf, { on: true, x: q.x, y: q.y, ux, uy, pen });
      let vn = hit - SOFT_K * pen * dt - (hit > 0 ? SOFT_C * hit * dt : 0);
      if (over > SOFT_MAX) { nx = q.x + ux * (TUBE + SOFT_MAX); ny = q.y + uy * (TUBE + SOFT_MAX); if (vn > 0) vn = 0; }
      g.vx += (vn - hit) * ux; g.vy += (vn - hit) * uy;
    } else {
      if (sf.on && g.spring.left > 0 && sf.vin > 1.5) {
        const vo = -(g.vx * sf.ux + g.vy * sf.uy), want = Math.min(MAX, sf.vin * SPRING_E);
        if (vo < want) {
          g.vx -= (want - vo) * sf.ux; g.vy -= (want - vo) * sf.uy; g.spring.boosts++;
          const now = performance.now(), sp = g.spring; sp.chain = 1; sp.at = now;
        }
        const v = Math.hypot(g.vx, g.vy); if (v > MAX) { g.vx *= MAX / v; g.vy *= MAX / v; }
      }
      if (sf.on && sf.vin > 2.5 && !calm) g.hop = Math.max(g.hop || 0, Math.min(0.35, 0.1 + sf.vin * 0.035));
      if (sf.on && sf.vin > 1.5) { if (api.boing) api.boing(Math.min(1, sf.vin / 8), g.spring.left > 0 ? g.spring.chain || 1 : 0); sf.boings++; }
      sf.on = false;
    }
    { const tg = sf.on ? Math.min(SOFT_MAX, sf.pen * 2) : 0; sf.dv += (80 * (tg - sf.dent) - (calm ? 18 : 5) * sf.dv) * dt; sf.dent = Math.max(calm ? 0 : -0.05, Math.min(SOFT_MAX, sf.dent + sf.dv * dt));
      if (Math.abs(sf.dv) < 0.01 && Math.abs(sf.dent - tg) < 0.002) { sf.dent = tg; sf.dv = 0; } }
    g.x = nx; g.y = ny;
  } else for (const axis of ['x', 'y']) {
    const v = axis === 'x' ? g.vx : g.vy;
    if (!v) continue;
    const nx = axis === 'x' ? g.x + v * dt : g.x, ny = axis === 'y' ? g.y + v * dt : g.y;
    if (!blocked(b, nx, ny)) { g.x = nx; g.y = ny; continue; }
    let lo = 0, hi = 1;
    for (let k = 0; k < 8; k++) { const m = (lo + hi) / 2; if (blocked(b, axis === 'x' ? g.x + v * dt * m : g.x, axis === 'y' ? g.y + v * dt * m : g.y)) hi = m; else lo = m; }
    if (axis === 'x') g.x += v * dt * lo; else g.y += v * dt * lo;
    const hit = Math.abs(v);
    if (hit > 1.2) { api.koto(Math.min(1, hit / 6), hit > 4); g.sq = Math.min(0.25, hit * 0.04); if (hit > 4) g.ouch = 0.6; }
    if (axis === 'x') g.vx = hit > 0.6 ? -v * BOUNCE : 0; else g.vy = hit > 0.6 ? -v * BOUNCE : 0;
  }
  g.th += (g.vx >= 0 ? 1 : -1) * Math.hypot(g.vx, g.vy) * dt / 0.32;
  if (g.hop > 0) { g.hopT = (g.hopT || 0) + dt; if (g.hopT > 0.32) { g.hop = 0; g.hopT = 0; } }
  g.sq = Math.max(0, g.sq - dt * 1.5); g.ouch = Math.max(0, g.ouch - dt); g.happy = Math.max(0, g.happy - dt);
  if (!g.go && Math.hypot(g.vx, g.vy) > 0.3) g.go = true;
  if (g.go) g.t += dt;
  const ci = Math.floor(g.x), cj = Math.floor(g.y), idx = cj * b.tw + ci;
  const water = b.cell[idx] === 2, inHole = b.holes.has(idx) && (p => Math.hypot(g.x - p[0], g.y - p[1]) < 0.3)(onPath(b, ci, cj));
  if (water || inHole) {
    g.fall = 0.8; g.falls++; g.fallAt = [g.x, g.y]; g.fallWater = water; g.vx = g.vy = 0;
    if (water) api.splash(0.8); else api.koto(0.8, true);
    if (navigator.vibrate) try { navigator.vibrate(60); } catch (e) {  }
    return;
  }
  for (const i of b.grains) if (!g.got.has(i) && Math.hypot(g.x - i % b.tw - 0.5, g.y - ((i / b.tw) | 0) - 0.5) < 0.45) {
    g.got.add(i); api.koto(0.9, false); setTimeout(() => api.koto(1, false), 90); springShot(g);
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; g.fx.push({ x: g.x, y: g.y, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3 - 1, c: k % 2 ? '#ffe066' : '#fff4b0', t: 0, life: 0.6 }); }
  }
  if (g.spring.left > 0) g.spring.left = Math.max(0, g.spring.left - dt);
  if (b.spring >= 0 && !g.spring.got && Math.hypot(g.x - b.spring % b.tw - 0.5, g.y - ((b.spring / b.tw) | 0) - 0.5) < 0.45) {
    g.spring.got = true; g.spring.left = SPRING_S; api.koto(0.9, false); setTimeout(() => api.koto(1, false), 90);
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; g.fx.push({ x: g.x, y: g.y, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3 - 1, c: k % 2 ? '#8cf078' : '#e4ffd8', t: 0, life: 0.6 }); }
  }
  if (Math.hypot(g.x - b.goal[0] - 0.5, g.y - b.goal[1] - 0.5) < 0.42) { springShot(g); win(); }
}
function win() {
  const g = game, b = g.board;
  g.done = true; g.happy = 99;
  st.best[recKey(g)] = { c: 1 };
  if (!g.daily) st.stage = Math.max(st.stage, g.n + 1);
  save();
  if (root.nsgTrack) root.nsgTrack('meiro_clear', { stage: g.n + 1, falls: g.falls });
  const has = !g.daily && g.n + 1 < goalList().length;
  ui.card.innerHTML = `<h3>🏁 ゴール！</h3><p>${g.daily ? '☀️ きょうの めいろ ' : ''}${esc(g.spot.name)} に ついた${g.daily ? '<br/><small>あしたは べつの 名所だよ</small>' : ''}</p>
    ${b.grains.length ? `<p>🌾 金の米つぶ ${g.got.size} / ${b.grains.length}${g.got.size === b.grains.length ? '　ぜんぶ とれた！' : ''}</p>` : ''}
    ${g.spot.desc ? `<p class="mz-memo">📖 ${esc(g.spot.desc.length > 70 ? g.spot.desc.slice(0, 69) + '…' : g.spot.desc)}</p>` : ''}
    <div class="mz-row">${has ? '<button type="button" data-mz="next">つぎの めいろ ▶</button>' : ''}<button type="button" class="sub" data-mz="again">もういちど</button><button type="button" class="sub" data-mz="map">🗺 地図で見る</button>${root.nishioGo && root.nishioGo.openShare ? '<button type="button" class="sub" data-mz="share">📣 シェア</button>' : ''}</div>`;
  g.result = { name: g.spot.name, daily: !!g.daily, n: g.n + 1, got: g.got.size, grains: b.grains.length };
  g.cardHtml = ui.card.innerHTML;

  const gx = b.goal[0] + 0.5, gy = b.goal[1] + 0.5, cols = ['#ffffff', '#ffe066', '#ff8fb0', '#7fd8f6', '#9be07a'];
  for (let i = 0; i < 46; i++) { const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 5; g.fx.push({ x: gx, y: gy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, c: cols[i % cols.length], t: 0, life: 0.9 + Math.random() * 0.7 }); }
  [0, 110, 220, 380].forEach((ms, i) => setTimeout(() => api.koto(0.5 + i * 0.15, i === 3), ms));
  if (navigator.vibrate) try { navigator.vibrate([30, 40, 30, 40, 80]); } catch (e) {  }
  clearTimeout(g.cardT);
  g.cardT = setTimeout(() => { if (game === g && g.done) ui.clear.hidden = false; }, 1100);
}
function hint() {
  const g = game;
  if (!g || !g.board || g.done || g.fall > 0) return;
  const b = g.board, d = bfs(b, b.goal), path = [];
  let x = Math.floor(g.x), y = Math.floor(g.y);
  for (let k = 0; k < 12 && d[y * b.tw + x] > 1; k++) {
    let nx = -1, ny = -1, best = d[y * b.tw + x];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v = pass(b, x, y, dx, dy) ? d[(y + dy) * b.tw + x + dx] : 0; if (v && v < best) { best = v; nx = x + dx; ny = y + dy; } }
    if (nx < 0) break;
    x = nx; y = ny; path.push([x, y]);
  }
  g.hint = { path, until: performance.now() + 3000 }; g.hints++;
}
function resume() {
  if (!game) return;
  if (game.done && game.cardHtml) { ui.card.innerHTML = game.cardHtml; ui.clear.hidden = false; return; }
  ui.clear.hidden = true; game.last = 0;
  if (!game.board) startStage(game.n, game.daily);
}
function showList() {
  const list = goalList(), open = Math.min(st.stage, list.length - 1);
  const ds = goalList(true)[dailyIndex()];
  ui.card.innerHTML = `<h3 style="color:#2f5d34">🌀 めいろ の いちらん</h3>${ds ? `<div class="mz-row"><button type="button" data-mz="daily">☀️ きょうの めいろ<br/><small>${esc(ds.name)}</small></button></div>` : ''}<div class="mz-row" style="max-height:50vh;overflow:auto">${list.slice(0, open + 1).map((s, i) => {
    return `<button type="button" class="sub" style="background:#eef3e6;color:#2a2a20;box-shadow:none" data-mz="go:${i}">${i + 1}. ${esc(s.name)}</button>`;
  }).join('')}</div><div class="mz-row"><button type="button" data-mz="resume">もどる</button></div>`;
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
  api.rumble(g.done || g.fall > 0 || !ui.clear.hidden ? 0 : Math.hypot(g.vx, g.vy) * K);
  if (api.demGen !== g.dem && (!g.demT || now - g.demT > 1500)) { g.demT = now; g.dem = api.demGen; g.bg = paintBoard(g.board, g.T); }
  draw(now);
  ui.time.textContent = (b0 => (b0.grains.length ? `🌾${g.got.size}/${b0.grains.length} ` : ''))(g.board) + (g.spring && g.spring.left > 0 ? ' ばね' : '');

  const t = api.tilt(), kx = keys.right - keys.left + drag.x, ky = keys.down - keys.up + drag.y, sx = kx * 5 + t.x * 2, sy = ky * 5 + t.y * 2;
  g.bx = (g.bx || 0) + (sx - (g.bx || 0)) * Math.min(1, dt * 10); g.by = (g.by || 0) + (sy - (g.by || 0)) * Math.min(1, dt * 10);
  const tf = !calm && Math.abs(g.bx) + Math.abs(g.by) > 0.05 ? `perspective(900px) rotateX(${(-g.by).toFixed(2)}deg) rotateY(${g.bx.toFixed(2)}deg)` : '';
  if (ui.bezel.style.transform !== tf) ui.bezel.style.transform = tf;
}

const CRIT = { ike: 'kaeru', ine: 'kaeru', dote: 'kaeru', cha: 'tonbo', kuro: 'tonbo', ami: 'kani', ishi: 'kani', matsu: 'sagi' };
function boardCritters(b) {
  const own = tubes(b), cand = [], used = new Set([b.start[1] * b.tw + b.start[0], b.goal[1] * b.tw + b.goal[0], b.spring, ...(b.grains || []), ...(b.komono || [])]);
  for (let k = 0; k < b.tw * b.th; k++) {
    const i = k % b.tw, j = (k / b.tw) | 0, h = (Math.imul(i + b.tx0, 73856093) ^ Math.imul(j + b.ty0, 19349663)) >>> 0;
    if (b.cell[k] !== 1 || !own[k] || used.has(k) || b.holes.has(k)) continue;
    const d = DIRS.find((_, n) => { const [dx, dy] = DIRS[(n + (h >>> 8)) % 4]; return !pass(b, i, j, dx, dy); });
    if (d) cand.push({ i, j, h, d });
  }
  if (!cand.length) return [];
  cand.sort((a, c) => a.h - c.h);
  const pick = [cand[0]], far = cand.reduce((m, c) => (Math.hypot(c.i - pick[0].i, c.j - pick[0].j) > Math.hypot(m.i - pick[0].i, m.j - pick[0].j) ? c : m), cand[0]);
  if (far !== cand[0] && Math.abs(far.i - pick[0].i) + Math.abs(far.j - pick[0].j) >= 6) pick.push(far);
  return pick.map(({ i, j, d }) => {
    const st = api.hedgeStyleAt ? api.hedgeStyleAt((b.tx0 + i) * K + K / 2, (b.ty0 + j) * K + K / 2) : 'ike';
    return { i, j, px: i + 0.5 + d[0] * 0.5, py: j + 0.5 + d[1] * 0.5, kind: CRIT[st] || 'kaeru', fled: 0, hi: 0 };
  });
}
function drawCritters(x, g, T, now) {
  const sp = Math.hypot(g.vx, g.vy), P = root.nishioPixel;
  for (const c of g.crit || []) {
    const img = P && P.critterSprite && P.critterSprite(c.kind);
    if (!img) continue;
    const d = Math.hypot(g.x - c.px, g.y - c.py);
    if (!c.fled && d < 0.75) { if (sp > 1.2) c.fled = now; else if (!c.hi) c.hi = now; }
    else if (c.hi && d > 1.2) c.hi = 0;
    let up = 0, al = 1;
    if (c.fled) { const t = now - c.fled; if (t > 20000) c.fled = 0; else if (t > 500) continue; else { up = t / 500; al = 1 - up; } }
    const hi = c.hi ? (now - c.hi) / 600 : 2, s = T * 0.8;
    const bob = calm ? 0 : hi < 1 ? Math.abs(Math.sin(hi * Math.PI * 2)) * T * 0.3 : Math.max(0, Math.sin(now / 420 + c.i)) * T * 0.06;
    x.globalAlpha = al; x.drawImage(img, Math.round(c.px * T - s / 2), Math.round(c.py * T - s / 2 - bob - up * T), Math.round(s), Math.round(s)); x.globalAlpha = 1;
  }
}
function draw(now) {
  const g = game, b = g.board, T = g.T, x = ui.cv.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(g.bg, 0, 0);
  const sf = g.soft;
  if (sf && sf.dent > 0.004 && g.bg.map) {
    const a = Math.atan2(sf.uy, sf.ux), cx = (sf.x + sf.ux * (TUBE + sf.dent)) * T, cy = (sf.y + sf.uy * (TUBE + sf.dent)) * T, rn = R * T, rt = rn * (1 + Math.min(2.6, sf.dent * 30)), u = Math.max(1, Math.round(T / 16));
    const glow = Math.min(1, sf.dent / 0.083), gr = rn + 0.12 * T;
    x.save(); x.translate(cx, cy); x.rotate(a); x.beginPath(); x.rect((R - sf.dent) * T, -gr * 4, gr * 2, gr * 8); x.clip();
    x.fillStyle = `rgba(200,245,170,${(0.6 * glow).toFixed(2)})`; x.beginPath(); x.ellipse(0, 0, gr, gr * (rt / rn), 0, 0, Math.PI * 2); x.fill(); x.restore();
    x.save(); x.beginPath(); x.ellipse(cx, cy, rn, rt, a, 0, Math.PI * 2); x.clip(); x.drawImage(g.bg.map, 0, 0); x.restore();
    x.strokeStyle = '#0d2219'; x.lineWidth = u; x.beginPath(); x.ellipse(cx, cy, rn, rt, a, -Math.PI / 2, Math.PI / 2); x.stroke();
  }

  const gx = (b.goal[0] + 0.5) * T, gy = (b.goal[1] + 0.5) * T, pulse = (Math.sin(now / 220) + 1) / 2;
  x.strokeStyle = `rgba(255,230,80,${0.5 + pulse * 0.5})`; x.lineWidth = Math.max(2, T / 10);
  x.beginPath(); x.arc(gx, gy, T * (0.42 + pulse * 0.12), 0, Math.PI * 2); x.stroke();
  const spr = api.spriteOf(g.spot);
  if (spr) { const s = T * 1.5; x.drawImage(spr, Math.round(gx - s / 2), Math.round(gy - s * 0.95), s, s); }
  flag(x, gx + T * 0.18, gy - T * 0.1, T);
  if (g.hint && now < g.hint.until) {
    g.hint.path.forEach(([i0, j0], k) => {
      const [i, j] = onPath(b, i0, j0).map(v => v - 0.5);
      const on = Math.floor(now / 120) % 8 === k % 8, r = T * (on ? 0.16 : 0.11);
      x.fillStyle = '#1a1a1a'; x.beginPath(); x.arc((i + 0.5) * T, (j + 0.5) * T, r + Math.max(1, T / 24), 0, Math.PI * 2); x.fill();
      x.fillStyle = on ? '#fff59d' : '#ffffff'; x.beginPath(); x.arc((i + 0.5) * T, (j + 0.5) * T, r, 0, Math.PI * 2); x.fill();
    });
  }
  for (const p of g.fx || []) {
    const q = Math.max(2, Math.round(T / 9));
    x.globalAlpha = Math.max(0, 1 - p.t / p.life); x.fillStyle = '#222'; x.fillRect(Math.round(p.x * T) - 1, Math.round(p.y * T) - 1, q + 2, q + 2);
    x.fillStyle = p.c; x.fillRect(Math.round(p.x * T), Math.round(p.y * T), q, q);
  }
  x.globalAlpha = 1;
  for (const i of b.grains) {
    if (g.got.has(i)) continue;
    const cx = (i % b.tw + 0.5) * T, cy = (((i / b.tw) | 0) + 0.5) * T + Math.sin(now / 300 + i) * T * 0.05, rw = T * 0.15, rh = T * 0.22;
    x.fillStyle = 'rgba(0,0,0,.25)'; x.beginPath(); x.ellipse(cx, (((i / b.tw) | 0) + 0.5) * T + T * 0.22, rw, rw * 0.4, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#3a2a08'; x.beginPath(); x.ellipse(cx, cy, rw + Math.max(1, T / 24), rh + Math.max(1, T / 24), 0.35, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#f2c230'; x.beginPath(); x.ellipse(cx, cy, rw, rh, 0.35, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff6c0'; x.beginPath(); x.ellipse(cx - rw * 0.35, cy - rh * 0.35, rw * 0.3, rh * 0.3, 0.35, 0, Math.PI * 2); x.fill();
  }
  if (b.spring >= 0 && g.spring && !g.spring.got) {
    const cx = (b.spring % b.tw + 0.5) * T, cy = (((b.spring / b.tw) | 0) + 0.5) * T, q = Math.max(1, Math.round(T / 20)), h = T * (0.5 + Math.sin(now / 140) * 0.1), bw = T * 0.44, y0 = cy + T * 0.3;
    x.fillStyle = 'rgba(140,240,120,.45)'; x.beginPath(); x.arc(cx, cy, T * (0.5 + Math.sin(now / 220) * 0.04), 0, Math.PI * 2); x.fill(); x.lineWidth = Math.max(2, q * 2); x.strokeStyle = '#8cf078'; x.stroke();
    x.fillStyle = '#1a1a1a'; x.fillRect(Math.round(cx - bw / 2) - q, Math.round(y0) - q, Math.round(bw) + 2 * q, 3 * q); x.fillRect(Math.round(cx - bw / 2) - q, Math.round(y0 - h) - 2 * q, Math.round(bw) + 2 * q, 3 * q);
    x.lineWidth = Math.max(2, q * 2); x.lineJoin = 'miter'; x.strokeStyle = '#1a1a1a'; x.beginPath();
    for (let i = 0; i <= 6; i++) { const px = cx + (i % 2 ? bw / 2 : -bw / 2) * 0.8, py = y0 - (h * i) / 6; i ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.stroke(); x.lineWidth = Math.max(1, q); x.strokeStyle = '#d8e0e6'; x.stroke();
  }
  if (g.spring && g.spring.left > 0) {
    const fr = Math.max(0, Math.min(1, g.spring.left / SPRING_S));
    x.lineWidth = Math.max(2, T / 12); x.strokeStyle = `rgba(140,240,120,${(0.2 + 0.65 * fr).toFixed(3)})`; x.beginPath(); x.arc(g.x * T, g.y * T, T * (0.34 + 0.06 * fr), 0, Math.PI * 2); x.stroke();
  }

  const u = T * 0.031;

  if (g.fall > 0) {
    const k = g.fall / 0.8, [fx, fy] = g.fallAt;
    if (g.fallWater) { x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = Math.max(1, T / 14); x.beginPath(); x.arc(fx * T, fy * T, T * (0.5 - k * 0.3), 0, Math.PI * 2); x.stroke(); }
    if (k > 0.3) nishioPixel.drawRice(x, fx * T, fy * T, g.th + (1 - k) * 8, 0, 'smile', 0, '', u * (k - 0.3) / 0.7);
    return;
  }
  drawCritters(x, g, T, now);
  const hp = g.hop > 0 ? Math.sin(Math.min(1, (g.hopT || 0) / 0.32) * Math.PI) * g.hop : 0;
  const X = g.x * T, Y = (g.y - hp) * T;
  x.fillStyle = `rgba(0,0,0,${(0.28 - hp * 0.3).toFixed(3)})`; x.beginPath(); x.ellipse(X, g.y * T + T * 0.3, T * 0.26 * (1 - hp * 0.6), T * 0.09 * (1 - hp * 0.6), 0, 0, Math.PI * 2); x.fill();
  const mood = 'smile';
  nishioPixel.drawRice(x, X, Y, g.th % (Math.PI * 2), g.sq, mood, 0, '', u);
}
function flag(x, X, Y, T) {
  const u = Math.max(1, Math.round(T / 16));
  x.fillStyle = '#3a2a1a'; x.fillRect(Math.round(X), Math.round(Y - 9 * u), u, 10 * u);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(Math.round(X + u + i * u * 1.5), Math.round(Y - 9 * u + j * u * 1.5), Math.ceil(u * 1.5), Math.ceil(u * 1.5)); }
}


document.addEventListener('DOMContentLoaded', () => {
  const b = $('meiroBtn');
  if (b) b.addEventListener('click', e => {
    const P = root.nishioPixel && root.nishioPixel.meiroApi;
    if (P) P.tiltAsk(e);
    if (root.nishioPixel && root.nishioPixel.setRoll) root.nishioPixel.setRoll(true);
    const d = $('demoBtn'); if (d) d.click();
    if (wantOpen) setTimeout(() => open(undefined, wantDaily), 60);
  });

  const want = new URLSearchParams(location.search).get('meiro');
  if (want === 'daily' || want === '1') {
    wantDaily = want === 'daily'; wantOpen = true;
    const intro = $('intro'), t = b && b.querySelector('.mp-t');
    if (intro && !intro.hidden && b) { if (t && wantDaily) t.textContent = '☀️ きょうの めいろ に ちょうせん'; }
    else if (root.nishioGo && root.nishioGo.started) setTimeout(() => open(undefined, wantDaily), 400);
  }


  let noAuto = false; try { noAuto = localStorage.getItem('nsg_noauto') === '1'; } catch (e) {  }
  const fresh = !(root.nishioGo && root.nishioGo.started);
  if (b && fresh && !noAuto) b.click();

  const m = $('pxMeiro');
  if (m) m.addEventListener('click', e => { root.nishioPixel.meiroApi.tiltAsk(e); open(); });
  const c = $('meiroCardBtn');
  if (c) c.addEventListener('click', e => { root.nishioPixel.meiroApi.tiltAsk(e); open(); });
  note();
});

root.NISHIO_MEIRO = { open, close, get state() { return st; }, get game() { return game; }, goalList, makeBoard: (n, s) => makeBoard(n, s),

  warp(x, y) { if (game && game.board) { game.x = x; game.y = y; game.vx = game.vy = 0; } } };
})(window);
