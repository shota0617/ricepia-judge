// にしおさんぽGO：西尾めいろ（スマホを傾けて、お米を 西尾の地図の迷路の ゴールまで ころがす。キーホルダーの 玉ころがし迷路のように）
// ・盤は 本物の西尾の地図の一部（ドット絵の地図と同じ絵。pixel.js の paintRegion）。めいろの1マスは 地図の 2×2マス（約16m）。
//   道の ある マスが 床で、となりへ 通れるのは 本当の 道が さかいを またいで つながる 所だけ。その中から 穴ほりで 1本道の 迷路を えらぶ（町の 通りが そのまま 迷路になる）。
//   通路は 地図を 明るく、そのほか（家の かたまり・田畑・つながらない 床）は 盛りあがった 緑の 台、細い壁は 立った 緑の 壁（影と てかり つき）
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
const K = 2;   // めいろの1マス = 地図の K×K マス（約16m。細かいほど 本物の 道に そった 細い通路が たくさん できる）
const CD = 2.4;   // はじめの 3・2・1（秒）。「1」の あいだに いまの持ち方を「まっすぐ」に しなおす
const SLOPE = 2;   // 坂の 引っぱりの つよさ（めいろの ころがり抵抗に かつのは 5%より 急な坂：台地の ふちなど）
const ACC = 16, MAX = 7.5, CRR = 1.1, LIN = 0.55, BOUNCE = 0.38, R = 0.3;   // マス/秒²・いちばん速い速さ・ころがり抵抗・速さに比べて へる分・はね返り・お米の半径（マス）
// stage：遊べる いちばん先の面・best：名所の id ごとの ベスト {t 秒, s ★}・skip：めいろが つくれなかった 名所の id（面の ならびが 開きなおしても かわらないように のこす）
const load = () => { try { return Object.assign({ stage: 0, best: {}, skip: [] }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { stage: 0, best: {}, skip: [] }; } };
const st = load();
if (st.ver !== 3) { st.best = {}; st.skip = []; st.ver = 3; }   // めいろの 作り方を かえた（2：1本道の 迷路・3：1マスを 地図の 2×2 に 細かく）。前の 盤の ベスト・はずした名所は つかわない
// 👻 ゴースト：ベストの ときの 走り（0.1秒ごとの 位置）。記録と 同じ キーで、べつの 場所に のこす（大きいので st には 入れない）
const GKEY = 'nsg_meiro_ghost', GSTEP = 0.1;
const ghosts = (() => { try { return JSON.parse(localStorage.getItem(GKEY) || '{}') || {}; } catch (e) { return {}; } })();
function saveGhost(k, gh) {
  delete ghosts[k]; ghosts[k] = gh;
  const ks = Object.keys(ghosts); for (let i = 0; i < ks.length - 40; i++) delete ghosts[ks[i]];   // 新しい 40面ぶんまで
  try { localStorage.setItem(GKEY, JSON.stringify(ghosts)); } catch (e) { /* いっぱいなら のこさない */ }
}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* 保存できない端末 */ } note(); };
function note() {   // きろく の 札に すすみぐあい（何面まで・★の合計）
  const el = document.getElementById('meiroNote');
  if (!el || !st.stage) return;
  const stars = Object.entries(st.best).reduce((a, [k, b]) => a + (!k.startsWith('day:') && b && b.s ? b.s : 0), 0);   // ★の合計は ふつうの面だけ
  el.textContent = `${st.stage + 1}面まで あそべる・★${stars}`;
}

let api = null, ui = null, game = null, raf = 0, wantDaily = false;
const bad = new Set(st.skip || []);   // めいろが つくれなかった名所（道が すくない所）。面の いちらんから はずす（この端末に のこす）
const calm = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);   // 動きを へらす 設定の人には 盤を 傾けて見せない
const keys = { up: 0, down: 0, left: 0, right: 0 }, drag = { on: false, x0: 0, y0: 0, x: 0, y: 0 };

function goalList(all = false) {   // all：はずした名所も 入れる（きょうの めいろ は だれでも 同じ ならびから えらぶ）
  const G = root.nishioGo, spots = (G && G.spots) || [];
  const byId = new Map(spots.map(s => [s.id, s]));
  const first = GOALS.map(id => byId.get(id)).filter(s => s && (all || !bad.has(s.id)));
  const castle = byId.get('f-nishio-castle') || first[0];
  const rest = castle ? spots.filter(s => s.featured && (all || !bad.has(s.id)) && !first.includes(s) && G.dist(castle, s) < 9000).sort((a, b) => G.dist(castle, a) - G.dist(castle, b)) : [];
  return [...first, ...rest];
}
const boardSize = n => ({ tw: 17 + Math.min(3, Math.floor(n / 3)), th: 28 + Math.min(6, Math.floor(n / 3) * 2) });   // 面が進むと 盤が少し広く（スマホの 画面に 合わせて たて長）

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
  if (best && best.len < 22 + (Math.min(n, 12) * 1.5 | 0)) return null;   // 道のりが みじかすぎる（前の面より ずっと かんたん）名所は はずす
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
    cell[y * tw + x] = water >= 3 && !road ? 2 : road >= 1 || park >= 3 ? 1 : 0;   // 道が 1つでも あれば 床（どこへ 通れるかは さかいの 道で きまる）。公園・境内は 広場として 床に
    if (park >= 3 && !road) for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) { const q = (y * K + j) * W + x * K + i; if (!kind[q]) kind[q] = 1; }
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
  // 迷路に する：道が つながる さかい（er・ed）の 中から、穴ほりで 1本道の 木を えらび、のこりは 細い壁で ふさぐ。
  // 広い道・駅前の 広場が「部屋」に ならず、キーホルダーの 迷路のように 通路と 行き止まりに なる（通れるのは 本当の 道が つながる 所だけ）。
  // 面が はじめの うちは ぬけ道（ふさいだ さかいを すこし あけなおす）を 多めに して やさしく
  {
    let sd = ((tx0 * 73856093) ^ (ty0 * 19349663) ^ (tw * 83492791) ^ (th * 2654435761)) >>> 0 || 1;   // 盤ごとに きまる（だれでも 同じ めいろ）
    const rn = () => { sd ^= sd << 13; sd >>>= 0; sd ^= sd >>> 17; sd ^= sd << 5; sd >>>= 0; return sd / 4294967296; };
    const floor = i => cell[i] === 1, cand = [];   // 床どうしの 通れる さかい [a, b, 'r'|'d', i]
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const i = y * tw + x;
      if (er[i] && floor(i) && floor(i + 1)) cand.push([i, i + 1, 'r', i]);
      if (ed[i] && floor(i) && floor(i + tw)) cand.push([i, i + tw, 'd', i]);
    }
    const nb = new Map();
    for (const e of cand) { for (const [u, v] of [[e[0], e[1]], [e[1], e[0]]]) { if (!nb.has(u)) nb.set(u, []); nb.get(u).push([v, e]); } }
    for (const e of cand) (e[2] === 'r' ? er : ed)[e[3]] = 0;   // いったん ぜんぶ ふさぐ
    const seen = new Uint8Array(tw * th), tree = new Set();
    for (const s0 of nb.keys()) {   // つながりごとに 穴ほり（くねくね 長い 通路が できる）
      if (seen[s0]) continue;
      const stack = [s0]; seen[s0] = 1;
      while (stack.length) {
        const u = stack[stack.length - 1], opts = (nb.get(u) || []).filter(([v]) => !seen[v]);
        if (!opts.length) { stack.pop(); continue; }
        const [v, e] = opts[(rn() * opts.length) | 0];
        seen[v] = 1; tree.add(e); (e[2] === 'r' ? er : ed)[e[3]] = 1; stack.push(v);
      }
    }
    const braid = Math.max(0.06, 0.3 - n * 0.04);   // ぬけ道の わりあい（1面 3割 → 7面から 6%）
    for (const e of cand) if (!tree.has(e) && rn() < braid) (e[2] === 'r' ? er : ed)[e[3]] = 1;
  }
  // ゴール：名所の そば（6マス以内）の 床で、近い順に 通路が 40マス以上 つながっている 所（道の 切れはしの 小島に しない）。なければ いちばん 広く つながる 所
  const near = [];
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) if (at(x, y) === 1) { const d = Math.hypot(tx0 + x - gx, ty0 + y - gy); if (d <= 6) near.push([d, x, y]); }
  if (!near.length) return null;   // 名所の そばに 床が なければ、この置き方は やめる
  near.sort((a, c) => a[0] - c[0]);
  const B = { n, tx0, ty0, tw, th, cell, er, ed, goal: null, holes: new Set() };
  let dist = null, most = 0;
  for (const [, x, y] of near) {
    const d = bfs(B, [x, y]), k = d.reduce((a, v) => a + (v > 0), 0);
    if (k > most) { most = k; B.goal = [x, y]; dist = d; }
    if (k >= 40) break;
  }
  const goal = B.goal;
  // スタート：ゴールから 道のりが めやす（面が 進むと 長く）までで いちばん遠い 床（1本道の めいろは とても 長く なるので）
  const aim = 60 + Math.min(n, 10) * 9;
  let start = null, len = 0;
  for (let i = 0; i < dist.length; i++) if (dist[i] > len && dist[i] <= aim) { len = dist[i]; start = [i % tw, (i / tw) | 0]; }
  if (!start || len < 20) return null;
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
  // 金の米つぶ（3つまで）：ゴールへの 近道から はずれた 行き止まりの 床に。たがいに はなれた所から 先に えらぶ（寄り道すると とれる）
  // 穴を置いたあとの 歩数で えらぶ（穴で ふさがった 行き止まりには 置かない。とれない 米つぶを 出さない）
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
  return Object.assign(B, { start, len, grains });
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
#meiro .mz-btns{display:flex;gap:10px;margin:6px 0 calc(env(safe-area-inset-bottom,0px) + 10px)}
#meiro .mz-btns button,#meiro .mz-clear button{border:0;border-radius:999px;padding:10px 18px;font:inherit;font-size:15px;background:#ffe680;color:#2a2410;box-shadow:0 3px 0 #b59a2a}
#meiro .mz-btns button.sub{background:rgba(255,255,255,.2);color:#fff;box-shadow:none}
#meiro .mz-clear{position:fixed;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;background:rgba(10,30,40,.55);padding:12px;box-sizing:border-box}   /* 盤の わくの外（低い画面でも 切れない） */
#meiro .mz-clear[hidden]{display:none}
#meiro .mz-card{background:#fffdf2;color:#2a2a20;border-radius:18px;padding:18px 20px;text-align:center;width:min(86%,340px);max-height:100%;overflow-y:auto;box-sizing:border-box;box-shadow:0 8px 24px rgba(0,0,0,.4)}
#meiro .mz-card h3{margin:0 0 6px;font-size:24px;color:#d0402a}
#meiro .mz-card p{margin:6px 0;font-size:15px;line-height:1.5}
#meiro .mz-card .mz-memo{font-size:13px;color:#4a5040;background:#f1eedd;border-radius:10px;padding:8px 10px;text-align:left}
#meiro .mz-card .mz-stars{font-size:28px;letter-spacing:4px;color:#f0b020}
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
    <p class="mz-hint">📱 スマホを 傾けて、お米を 🏁 まで ころがそう（パソコンは 矢印キー・盤を なぞっても）。<br/>黒い穴と 水に おちると スタートに もどるよ</p>
    <div class="mz-btns"><button type="button" class="sub" data-mz="retry">↺ やりなおし</button><button type="button" class="sub" data-mz="hint">💡 ヒント</button><button type="button" class="sub" data-mz="list">いちらん</button></div>`;
  document.body.appendChild(el);
  ui = { el, st: el.querySelector('.mz-st'), time: el.querySelector('.mz-time'), cv: el.querySelector('canvas'), glass: el.querySelector('.mz-glass'), bezel: el.querySelector('.mz-bezel'),
    load: el.querySelector('.mz-load'), clear: el.querySelector('.mz-clear'), card: el.querySelector('.mz-card') };
  ['click', 'touchend'].forEach(ev => el.addEventListener(ev, () => { if (api) api.tiltAsk(); }, { passive: true }));   // iPhone の 傾きの 許可（リンクから すぐ ひらいた ときは、めいろを さわった ときに 聞く。2回めからは 何もしない）
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
    else if (k === 'share') { const sh = $('share'); if (sh) sh.classList.add('over-meiro'); if (game && game.result) root.nishioGo.openShare('meiro', { meiro: Object.assign({ img: ui.cv }, game.result) }); }   // シェアの 窓は めいろの 上に
    else if (k === 'map') { const id = game && game.spot.id; close(); if (id && root.nishioGo && root.nishioGo.focusSpot) { if (root.nishioGo.openTab) root.nishioGo.openTab('map'); root.nishioGo.focusSpot(id); } }   // きろく の 札から 来たときも 地図の タブへ   // ゴールの名所を 歩く地図で
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
    const sh = $('share');
    if (sh && !sh.hidden) { if (e.key === 'Escape') sh.hidden = true; return; }   // 📣 シェアの 窓が 上に あるときは、Esc で その窓だけ とじる（ゴールの カードに もどる）
    const k = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
    if (k) { keys[k] = 1; e.preventDefault(); }
    else if (e.key === 'Escape') close();
  });
  document.addEventListener('keyup', e => { const k = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key]; if (k) keys[k] = 0; });
  window.addEventListener('resize', () => { if (game && game.board && !ui.el.hidden) fit(); });
  const letGo = () => { for (const k in keys) keys[k] = 0; drag.on = false; drag.x = drag.y = 0; };   // ほかの 窓へ うつると keyup が とどかないので、おしっぱなしを とく
  window.addEventListener('blur', letGo);
  document.addEventListener('visibilitychange', () => { if (document.hidden) letGo(); });
}

function open(n, daily = false) {   // daily：☀️ きょうの めいろ を ひらく（シェアの リンク ?meiro=daily から）
  api = root.nishioPixel && root.nishioPixel.meiroApi;
  if (!api) return false;
  if (!ui) build();
  ui.el.hidden = false;
  ui.el.querySelector('[data-mz=slow]').setAttribute('aria-pressed', String(!!st.slow));
  api.pause(true);
  api.tiltAsk(); api.tiltReset();   // いまの持ち方を「まっすぐ」に
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

/* ---------- 面 ---------- */
// ☀️ きょうの めいろ：日本時間の 日づけで きまる 名所（だれでも 同じ。はじめの やさしい面は のぞく）。とけても 面は すすまない
const DAILY_LV = 6;   // 盤 15×22・穴 8つ
// えらぶのは はずした名所も 入れた ならび（goalList(true)）から。その端末で はずした名所に 左右されない
const dayMiss = new Set();   // この むずかしさでは めいろが つくれなかった名所（地図は みんな 同じなので、つぎの名所も みんな 同じに なる）
function dailyIndex() {
  const list = goalList(true), d = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  let h = 2166136261; for (const c of 'meiro:' + d) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  if (list.length <= 3) return 0;
  for (let i = 0; i < list.length - 3; i++) { const k = 3 + (h + i) % (list.length - 3); if (!dayMiss.has(list[k].id)) return k; }
  return -1;
}
// 記録は 名所ごと。きょうの めいろ は 盤の むずかしさが ちがうので 'day:' を つけて べつに のこす
const recKey = g => (g.daily ? 'day:' : '') + g.spot.id;
function startStage(n, daily = false) {
  const list = goalList(daily);
  if (!list.length) { ui.load.hidden = false; ui.load.textContent = '名所を よみこみ中…'; setTimeout(() => !ui.el.hidden && startStage(n, daily), 600); return; }
  if (n == null) { n = dailyIndex(); if (n < 0) { ui.load.hidden = false; ui.load.textContent = 'きょうの めいろが つくれなかった'; return; } }   // 名所が よめてから えらぶ
  n = Math.max(0, Math.min(n, list.length - 1));
  game = { n, daily, spot: list[n], board: null, t: 0, falls: 0, done: false };
  ui.clear.hidden = true;
  ui.load.hidden = false; ui.load.textContent = 'めいろを つくっています…';
  const bt = st.best[recKey(game)];
  ui.st.innerHTML = `${daily ? '☀️ <b>きょうの めいろ</b>' : `🌀 めいろ <b>${n + 1}</b>`}${bt ? `<small>　ベスト ${bt.t.toFixed(1)}秒 ${'★'.repeat(bt.s)}</small>` : ''}<span class="mz-goal">🏁 ${esc(game.spot.name)}</span>`;   // 1行め：面と ベスト・2行め：ゴール（長い名前は …）
  ui.time.textContent = '0.0';
  const g = game;
  waitChunks(g.spot, allOk => {
    if (game !== g) return;
    if (!allOk) { ui.load.textContent = '地図が よみこめなかった。「↺ やりなおし」で もういちど'; return; }   // 地図が そろっていないと 読めない所が 壁になり、ちがう めいろに なる（記録が まざる）。名所も はずさない
    const b = makeBoard(daily ? DAILY_LV : n, g.spot);   // きょうの めいろ は いつも 中くらいの むずかしさ
    if (!b) {   // 道が少ない所なら、その名所を はずして 同じ面を つくりなおす（つぎの名所が この面に）
      if (daily) { dayMiss.add(g.spot.id); const k = dailyIndex(); if (k >= 0) startStage(k, true); else ui.load.textContent = 'きょうの めいろが つくれなかった'; return; }   // ふつうの面の ならびは かえない
      bad.add(g.spot.id); st.skip = [...bad]; save();
      if (goalList().length > n) startStage(n); else ui.load.textContent = 'この あたりは 道が すくなくて、めいろが つくれなかった';
      return;
    }
    g.board = b;
    const gh = ghosts[recKey(g)];   // 盤が かわっていたら（地図の 作りなおし など）つかわない
    g.ghost = gh && gh.v === 3 && gh.w === b.tw && gh.s === b.start[1] * b.tw + b.start[0] && gh.e === b.goal[1] * b.tw + b.goal[0] && gh.p && gh.p.length >= 4 ? gh : null;
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
  need.forEach(([cx, cy]) => A.forgetChunk(cx, cy));   // 前に 読めなかった区画は、面を つくりなおす（やりなおし）たびに 読みなおす
  const t0 = Date.now();
  (function poll() {
    if (!ui || ui.el.hidden) return;
    need.forEach(([cx, cy]) => A.ensureChunk(cx, cy));
    const left = need.filter(([cx, cy]) => !['ok', 'out', 'fail'].includes(A.chunkState(cx, cy))).length;
    if (!left || Date.now() - t0 > 20000) done(need.every(([cx, cy]) => ['ok', 'out'].includes(A.chunkState(cx, cy))));
    else setTimeout(poll, 250);
  })();
}
function restart() {
  const b = game.board;
  clearTimeout(game.cardT);   // ゴールの カードが まだ 出ていなければ やめる
  game.x = b.start[0] + 0.5; game.y = b.start[1] + 0.5; game.vx = game.vy = 0; game.th = 0; game.sq = 0;
  game.t = 0; game.falls = 0; game.done = false; game.fall = 0; game.happy = 0; game.ouch = 0; game.go = false; game.fx = []; game.hint = null; game.hints = 0; game.got = new Set(); game.rec = [];
  game.cd = CD; game.cdReset = false;   // 3・2・1 の あいだは 動かさない
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
  game.bg = paintBoard(b, T); game.dem = api.demGen;   // 標高が あとから とどいたら 等高線を 描きなおす（tick）
}
function paintBoard(b, T) {
  const c = document.createElement('canvas'); c.width = b.tw * T; c.height = b.th * T;
  const x = c.getContext('2d');
  api.paintRegion(x, b.tx0 * K, b.ty0 * K, b.tw * K, b.th * K, T / K);
  const at = (i, j) => (i < 0 || j < 0 || i >= b.tw || j >= b.th ? 0 : b.cell[j * b.tw + i]);
  const u = Math.max(1, Math.round(T / 16)), lw = Math.max(2, Math.round(T * 0.18)), sh = Math.max(1, Math.round(T * 0.12));
  // 通路：ゴールへ つながる 床（穴は 通れるものとして。穴の 先の 行き止まりも 通路に 見せる）。そのほか（壁の かたまり・つながらない 床）は ぜんぶ「台」
  const reach = bfs(Object.assign({}, b, { holes: new Set() }), b.goal);
  const solid = (i, j) => i < 0 || j < 0 || i >= b.tw || j >= b.th || (b.cell[j * b.tw + i] === 1 ? !reach[j * b.tw + i] : !b.cell[j * b.tw + i]);
  // 1) 通路は 地図を 明るく（町が 見える）、台は 緑の プラスチックで おおう（地図は うっすら）
  for (let j = 0; j < b.th; j++) for (let i = 0; i < b.tw; i++) {
    const X = i * T, Y = j * T;
    if (!solid(i, j)) { if (at(i, j) === 1) { x.fillStyle = 'rgba(255,250,235,.38)'; x.fillRect(X, Y, T, T); } continue; }
    x.fillStyle = 'rgba(28,70,52,.86)'; x.fillRect(X, Y, T, T);
    x.fillStyle = (i + j) % 2 ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.03)'; x.fillRect(X, Y, T, T);   // ごく うすい 市松（台の 面の てざわり）
  }
  // 2) 影：台と 細い壁は 右下へ 影を おとす（光は 左上から。キーホルダーの 迷路の 立った 壁のように）
  x.fillStyle = 'rgba(0,0,0,.32)';
  for (let j = 0; j < b.th; j++) for (let i = 0; i < b.tw; i++) {
    if (solid(i, j)) continue;
    const X = i * T, Y = j * T;
    if (solid(i, j - 1)) x.fillRect(X, Y, T, sh);   // 上が 台：上の ふちに 影
    if (solid(i - 1, j)) x.fillRect(X, Y, sh, T);
    if (solid(i - 1, j - 1) && !solid(i, j - 1) && !solid(i - 1, j)) x.fillRect(X, Y, sh, sh);   // ななめ上の 台の 角
    if (!solid(i, j - 1) && !pass(b, i, j, 0, -1)) x.fillRect(X, Y + lw / 2, T, sh);   // 細い壁の 影
    if (!solid(i - 1, j) && !pass(b, i, j, -1, 0)) x.fillRect(X + lw / 2, Y, sh, T);
  }
  // 3) 台の ふち：通路に 面した 上・左の ふちは 光って 明るく、下・右の ふちは 暗い 線（盛りあがって 見える）
  for (let j = 0; j < b.th; j++) for (let i = 0; i < b.tw; i++) {
    if (!solid(i, j)) continue;
    const X = i * T, Y = j * T;
    x.fillStyle = '#0d2219';
    if (!solid(i, j + 1)) x.fillRect(X, Y + T - u, T, u);
    if (!solid(i + 1, j)) x.fillRect(X + T - u, Y, u, T);
    if (!solid(i, j - 1)) x.fillRect(X, Y, T, u);
    if (!solid(i - 1, j)) x.fillRect(X, Y, u, T);
    x.fillStyle = 'rgba(190,240,205,.55)';
    if (!solid(i, j + 1)) x.fillRect(X, Y + T - 2 * u, T, u);
    if (!solid(i + 1, j)) x.fillRect(X + T - 2 * u, Y, u, T);
  }
  // 4) 細い壁（床どうしで 道が つながっていない さかい）：台と 同じ 緑の 立った 壁。上・左の 面に てかり、まわりに 黒い ふち
  const rail = (X, Y, w, h) => {
    x.fillStyle = '#0d2219'; x.fillRect(X - u, Y - u, w + 2 * u, h + 2 * u);
    x.fillStyle = '#2f7a58'; x.fillRect(X, Y, w, h);
    x.fillStyle = 'rgba(200,255,220,.55)'; if (w > h) x.fillRect(X, Y, w, u); else x.fillRect(X, Y, u, h);
  };
  for (let j = 0; j < b.th; j++) for (let i = 0; i < b.tw; i++) {
    if (solid(i, j)) continue;
    const X = i * T, Y = j * T;
    if (!solid(i + 1, j) && !pass(b, i, j, 1, 0)) rail(X + T - lw / 2, Y - lw / 2, lw, T + lw);
    if (!solid(i, j + 1) && !pass(b, i, j, 0, 1)) rail(X - lw / 2, Y + T - lw / 2, T + lw, lw);
  }
  // 水の ふち：床から 入れる 水との さかいに、黄色と黒の しま（ここから先は 落ちる）
  const sw = Math.max(2, Math.round(T / 10));
  const stripes = (X, Y, w, h) => { for (let k = 0; k * sw < Math.max(w, h); k++) { x.fillStyle = k % 2 ? '#1a1a1a' : '#f2c200'; if (w > h) x.fillRect(X + k * sw, Y, Math.min(sw, w - k * sw), h); else x.fillRect(X, Y + k * sw, w, Math.min(sw, h - k * sw)); } };
  for (let j = 0; j < b.th; j++) for (let i = 0; i < b.tw; i++) {
    if (at(i, j) !== 1) continue;
    const X = i * T, Y = j * T;
    if (at(i, j - 1) === 2 && pass(b, i, j, 0, -1)) stripes(X, Y - sw / 2, T, sw);
    if (at(i, j + 1) === 2 && pass(b, i, j, 0, 1)) stripes(X, Y + T - sw / 2, T, sw);
    if (at(i - 1, j) === 2 && pass(b, i, j, -1, 0)) stripes(X - sw / 2, Y, sw, T);
    if (at(i + 1, j) === 2 && pass(b, i, j, 1, 0)) stripes(X + T - sw / 2, Y, sw, T);
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
  const acc = ACC * (st.slow ? 0.55 : 1);   // 🐢 ゆっくり：押す強さと いちばん速い速さを 落とす（傾きに なれていない人・小さな子）
  g.vx += ax * acc * dt; g.vy += ay * acc * dt;
  {   // 本当の高低差（国土地理院の標高。歩く地図と同じ）：下り坂へ ひとりでに 引っぱられる（めいろの マスは 地図の K マスぶん）
    const sl = api.slopeAt((b.tx0 + g.x) * K, (b.ty0 + g.y) * K);
    if (sl.known) { g.vx += sl.x / K * SLOPE * dt; g.vy += sl.y / K * SLOPE * dt; }
  }
  {   // マンホールの ふちに 近づくと、まん中へ すいこまれる（玉ころがし迷路の 穴のように）
    const ci = Math.floor(g.x), cj = Math.floor(g.y);
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      if (!b.holes.has(j * b.tw + i)) continue;
      const dx = i + 0.5 - g.x, dy = j + 0.5 - g.y, d = Math.hypot(dx, dy);
      if (d < 0.62 && d > 0.01) { const k = (0.62 - d) * 22 * dt / d; g.vx += dx * k; g.vy += dy * k; }
    }
  }
  const sp = Math.hypot(g.vx, g.vy);
  const max = MAX * (st.slow ? 0.6 : 1);
  if (sp > 0) { const k = Math.max(0, sp - (CRR + LIN * sp) * dt) / sp * (sp > max ? max / sp : 1); g.vx *= k; g.vy *= k; }
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
  if (g.go) { g.t += dt; while (g.rec.length / 2 * GSTEP <= g.t) g.rec.push(Math.round(g.x * 20), Math.round(g.y * 20)); }   // ゴーストの ための 走りの きろく（1/20マス）
  const ci = Math.floor(g.x), cj = Math.floor(g.y), idx = cj * b.tw + ci;
  const water = b.cell[idx] === 2, inHole = b.holes.has(idx) && Math.hypot(g.x - ci - 0.5, g.y - cj - 0.5) < 0.3;
  if (water || inHole) {   // おちた
    g.fall = 0.8; g.falls++; g.fallAt = [g.x, g.y]; g.fallWater = water; g.vx = g.vy = 0;
    if (water) api.splash(0.8); else api.koto(0.8, true);
    if (navigator.vibrate) try { navigator.vibrate(60); } catch (e) { /* noop */ }
    return;
  }
  for (const i of b.grains) if (!g.got.has(i) && Math.hypot(g.x - i % b.tw - 0.5, g.y - ((i / b.tw) | 0) - 0.5) < 0.45) {   // 金の米つぶを とった
    g.got.add(i); api.koto(0.9, false); setTimeout(() => api.koto(1, false), 90);
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; g.fx.push({ x: g.x, y: g.y, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3 - 1, c: k % 2 ? '#ffe066' : '#fff4b0', t: 0, life: 0.6 }); }
  }
  if (Math.hypot(g.x - b.goal[0] - 0.5, g.y - b.goal[1] - 0.5) < 0.42) win();
}
function win() {
  const g = game, b = g.board;
  g.done = true; g.happy = 99;
  const sec = Math.round(g.t * 10) / 10, par = (b.len * 0.45 + 3) * (st.slow ? 1.6 : 1);   // 目やすの時間（道のりから。ゆっくりでは 長め）
  const stars = g.falls === 0 && !g.hints && sec <= par ? 3 : sec <= par * 1.6 ? 2 : 1;   // ヒントを 見たら ★3 には しない
  const prev = st.best[recKey(g)], newBest = !prev || sec < prev.t;
  if (newBest) { g.ghost = { v: 3, s: b.start[1] * b.tw + b.start[0], e: b.goal[1] * b.tw + b.goal[0], w: b.tw, p: g.rec }; saveGhost(recKey(g), g.ghost); }   // つぎの「もういちど」から この走りと きそう
  st.best[recKey(g)] = { t: newBest ? sec : prev.t, s: Math.max(stars, prev ? prev.s : 0) };   // いちばん速い タイムと、いちばん多い ★ を べつべつに のこす
  if (!g.daily) st.stage = Math.max(st.stage, g.n + 1);   // きょうの めいろ では 面を すすめない
  save();
  if (root.nsgTrack) root.nsgTrack('meiro_clear', { stage: g.n + 1, sec, falls: g.falls, stars });
  const has = !g.daily && g.n + 1 < goalList().length;
  ui.card.innerHTML = `<h3>🏁 ゴール！</h3><p>${g.daily ? '☀️ きょうの めいろ ' : ''}${esc(g.spot.name)} に ついた${g.daily ? '<br/><small>あしたは べつの 名所だよ</small>' : ''}</p>
    <div class="mz-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
    <p>タイム ${sec.toFixed(1)}秒${newBest ? '（ベスト！）' : `（ベスト ${prev.t.toFixed(1)}秒）`}　おちた ${g.falls}回</p>
    ${b.grains.length ? `<p>🌾 金の米つぶ ${g.got.size} / ${b.grains.length}${g.got.size === b.grains.length ? '　ぜんぶ とれた！' : ''}</p>` : ''}
    ${g.spot.desc ? `<p class="mz-memo">📖 ${esc(g.spot.desc.length > 70 ? g.spot.desc.slice(0, 69) + '…' : g.spot.desc)}</p>` : ''}
    <div class="mz-row">${has ? '<button type="button" data-mz="next">つぎの めいろ ▶</button>' : ''}<button type="button" class="sub" data-mz="again">もういちど</button><button type="button" class="sub" data-mz="map">🗺 地図で見る</button>${root.nishioGo && root.nishioGo.openShare ? '<button type="button" class="sub" data-mz="share">📣 シェア</button>' : ''}</div>`;
  g.result = { name: g.spot.name, sec, stars, daily: !!g.daily, n: g.n + 1, got: g.got.size, grains: b.grains.length };   // 📣 シェア の 文と 絵に
  g.cardHtml = ui.card.innerHTML;   // いちらんを 見て もどったときに 出しなおす
  // 紙ふぶき：ゴールから ごはんつぶ・星・桜が はじける。音は コトンを 4つ 上がっていく
  const gx = b.goal[0] + 0.5, gy = b.goal[1] + 0.5, cols = ['#ffffff', '#ffe066', '#ff8fb0', '#7fd8f6', '#9be07a'];
  for (let i = 0; i < 46; i++) { const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 5; g.fx.push({ x: gx, y: gy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, c: cols[i % cols.length], t: 0, life: 0.9 + Math.random() * 0.7 }); }
  [0, 110, 220, 380].forEach((ms, i) => setTimeout(() => api.koto(0.5 + i * 0.15, i === 3), ms));
  if (navigator.vibrate) try { navigator.vibrate([30, 40, 30, 40, 80]); } catch (e) { /* noop */ }
  clearTimeout(g.cardT);
  g.cardT = setTimeout(() => { if (game === g && g.done) ui.clear.hidden = false; }, 1100);   // 紙ふぶきの あいだに やりなおしたら 出さない
}
function hint() {   // いまの マスから ゴールまでの 道すじの 先 12マスを、3秒 点で 見せる
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
function resume() {   // いちらんから もどる：とちゅうなら そのまま つづき、ゴールのあとなら 結果の カードへ
  if (!game) return;
  if (game.done && game.cardHtml) { ui.card.innerHTML = game.cardHtml; ui.clear.hidden = false; return; }
  ui.clear.hidden = true; game.last = 0;
  if (!game.board) startStage(game.n, game.daily);
}
function showList() {
  const list = goalList(), open = Math.min(st.stage, list.length - 1);
  const ds = goalList(true)[dailyIndex()], db = ds && st.best['day:' + ds.id];
  ui.card.innerHTML = `<h3 style="color:#2f5d34">🌀 めいろ の いちらん</h3>${ds ? `<div class="mz-row"><button type="button" data-mz="daily">☀️ きょうの めいろ<br/><small>${esc(ds.name)}${db ? `　${'★'.repeat(db.s)} ${db.t.toFixed(1)}秒` : ''}</small></button></div>` : ''}<div class="mz-row" style="max-height:50vh;overflow:auto">${list.slice(0, open + 1).map((s, i) => {
    const b = st.best[s.id];
    return `<button type="button" class="sub" style="background:#eef3e6;color:#2a2a20;box-shadow:none" data-mz="go:${i}">${i + 1}. ${esc(s.name)}${b ? `<br/><small>${'★'.repeat(b.s)} ${b.t.toFixed(1)}秒</small>` : ''}</button>`;
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
  if (g.cd > 0 && ui.clear.hidden) {   // 3・2・1：スマホを まっすぐ 持ってもらい、「1」で 傾きを 合わせなおす
    g.cd -= dt;
    if (!g.cdReset && g.cd < 0.9) { g.cdReset = true; api.tiltReset(); }
    if (g.cd <= 0) api.koto(0.9, false);
  } else if (!g.done && ui.clear.hidden) { g.acc = (g.acc || 0) + dt; while (g.acc >= 1 / 120) { g.acc -= 1 / 120; step(1 / 120); if (g.done) break; } }
  else if (g.done) { g.happy = 99; g.th += dt * 3; }
  for (const p of g.fx || []) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 9 * dt; p.vx *= 1 - dt * 1.5; }
  if (g.fx) g.fx = g.fx.filter(p => p.t < p.life);
  api.rumble(g.done || g.fall > 0 || !ui.clear.hidden ? 0 : Math.hypot(g.vx, g.vy) * K);   // 転がる音（歩く地図と同じ。速いほど 大きく 高く）
  if (api.demGen !== g.dem && (!g.demT || now - g.demT > 1500)) { g.demT = now; g.dem = api.demGen; g.bg = paintBoard(g.board, g.T); }
  draw(now);
  ui.time.textContent = (b0 => (b0.grains.length ? `🌾${g.got.size}/${b0.grains.length} ` : ''))(g.board) + g.t.toFixed(1);
  // 盤を 傾けて見せる：矢印キー・なぞる で 動かすと、わくごと 少し 傾く（キーホルダーを 傾けたように）。スマホの傾きでは 手の中の 本物が 傾くので 小さく
  const t = api.tilt(), kx = keys.right - keys.left + drag.x, ky = keys.down - keys.up + drag.y, sx = kx * 5 + t.x * 2, sy = ky * 5 + t.y * 2;
  g.bx = (g.bx || 0) + (sx - (g.bx || 0)) * Math.min(1, dt * 10); g.by = (g.by || 0) + (sy - (g.by || 0)) * Math.min(1, dt * 10);
  const tf = !calm && Math.abs(g.bx) + Math.abs(g.by) > 0.05 ? `perspective(900px) rotateX(${(-g.by).toFixed(2)}deg) rotateY(${g.bx.toFixed(2)}deg)` : '';
  if (ui.bezel.style.transform !== tf) ui.bezel.style.transform = tf;
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
  if (g.hint && now < g.hint.until) {   // ヒントの 道すじ（白い 点が 順に ぴかぴか）
    g.hint.path.forEach(([i, j], k) => {
      const on = Math.floor(now / 120) % 8 === k % 8, r = T * (on ? 0.16 : 0.11);
      x.fillStyle = '#1a1a1a'; x.beginPath(); x.arc((i + 0.5) * T, (j + 0.5) * T, r + Math.max(1, T / 24), 0, Math.PI * 2); x.fill();
      x.fillStyle = on ? '#fff59d' : '#ffffff'; x.beginPath(); x.arc((i + 0.5) * T, (j + 0.5) * T, r, 0, Math.PI * 2); x.fill();
    });
  }
  for (const p of g.fx || []) {   // 紙ふぶき（点の大きさの 四角。終わりに うすく）
    const q = Math.max(2, Math.round(T / 9));
    x.globalAlpha = Math.max(0, 1 - p.t / p.life); x.fillStyle = '#222'; x.fillRect(Math.round(p.x * T) - 1, Math.round(p.y * T) - 1, q + 2, q + 2);
    x.fillStyle = p.c; x.fillRect(Math.round(p.x * T), Math.round(p.y * T), q, q);
  }
  x.globalAlpha = 1;
  for (const i of b.grains) {   // 金の米つぶ（ふわふわ うく。とったら 消える）
    if (g.got.has(i)) continue;
    const cx = (i % b.tw + 0.5) * T, cy = (((i / b.tw) | 0) + 0.5) * T + Math.sin(now / 300 + i) * T * 0.05, rw = T * 0.15, rh = T * 0.22;
    x.fillStyle = 'rgba(0,0,0,.25)'; x.beginPath(); x.ellipse(cx, (((i / b.tw) | 0) + 0.5) * T + T * 0.22, rw, rw * 0.4, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#3a2a08'; x.beginPath(); x.ellipse(cx, cy, rw + Math.max(1, T / 24), rh + Math.max(1, T / 24), 0.35, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#f2c230'; x.beginPath(); x.ellipse(cx, cy, rw, rh, 0.35, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff6c0'; x.beginPath(); x.ellipse(cx - rw * 0.35, cy - rh * 0.35, rw * 0.3, rh * 0.3, 0.35, 0, Math.PI * 2); x.fill();
  }
  // お米
  const u = T * 0.031;
  const gh = g.ghost;
  if (gh && !g.done) {   // 👻 ベストの 自分（うすく。タイムが 動きだしてから いっしょに 走る。ゴールに ついたら 消える）
    const f = g.t / GSTEP, i = Math.min(Math.floor(f), gh.p.length / 2 - 1), j = Math.min(i + 1, gh.p.length / 2 - 1), k = f - Math.floor(f);
    if (f < gh.p.length / 2 + 2) {
      const hx = (gh.p[i * 2] + (gh.p[j * 2] - gh.p[i * 2]) * k) / 20, hy = (gh.p[i * 2 + 1] + (gh.p[j * 2 + 1] - gh.p[i * 2 + 1]) * k) / 20;
      x.fillStyle = 'rgba(110,190,255,.35)'; x.strokeStyle = 'rgba(60,140,230,.7)'; x.lineWidth = Math.max(1, T / 16);   // 灰色の 道でも わかるように 水色の わ
      x.beginPath(); x.arc(hx * T, hy * T, T * 0.34, 0, Math.PI * 2); x.fill(); x.stroke();
      x.globalAlpha = 0.5; nishioPixel.drawRice(x, hx * T, hy * T, (g.t * 6) % (Math.PI * 2), 0, 'smile', 0, '', u); x.globalAlpha = 1;
    }
  }   // お米の 点の大きさ（はばが マスの 6割ほど。当たりの 半径 R と 見た目を そろえる）
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
  if (g.cd > 0) {   // 3・2・1 と「スマホを まっすぐ」
    const W = b.tw * T, H = b.th * T, n = Math.ceil(g.cd / (CD / 3)), big = Math.round(T * 3.2);
    x.fillStyle = 'rgba(10,30,40,.35)'; x.fillRect(0, 0, W, H);
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    x.font = `bold ${big}px "DotGothic16", sans-serif`; x.lineWidth = Math.max(4, T / 4); x.strokeStyle = '#123247'; x.fillStyle = '#ffe680';
    x.strokeText(String(n), W / 2, H / 2); x.fillText(String(n), W / 2, H / 2);
    const msg = 'スマホを まっすぐ 持ってね';
    x.font = `bold ${Math.round(Math.min(T * 0.8, W * 0.8 / 12))}px "DotGothic16", sans-serif`; x.fillStyle = '#ffffff';   // 盤の はばに おさまる 大きさ（12字ぶん）
    x.strokeText(msg, W / 2, H / 2 + big * 0.8); x.fillText(msg, W / 2, H / 2 + big * 0.8);
  }
}
function flag(x, X, Y, T) {   // 🏁 の旗（白黒の市松）
  const u = Math.max(1, Math.round(T / 16));
  x.fillStyle = '#3a2a1a'; x.fillRect(Math.round(X), Math.round(Y - 9 * u), u, 10 * u);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(Math.round(X + u + i * u * 1.5), Math.round(Y - 9 * u + j * u * 1.5), Math.ceil(u * 1.5), Math.ceil(u * 1.5)); }
}

// はじめの画面の「🌀 傾けて めいろ」：操作して遊ぶ で始めてから めいろを開く。地図の 🌀 ボタンでも開く
document.addEventListener('DOMContentLoaded', () => {
  const b = $('meiroBtn');
  if (b) b.addEventListener('click', () => {
    const P = root.nishioPixel && root.nishioPixel.meiroApi;
    if (P) P.tiltAsk();   // iPhone の 傾きの 許可は、タップした その場でしか 聞けない（open は 少しあとなので ここで聞く）
    const d = $('demoBtn'); if (d) d.click();
    setTimeout(() => open(undefined, wantDaily), 60);
  });
  // シェアの リンク（?meiro=daily：きょうの めいろ・?meiro=1：めいろ）から 来た人
  const want = new URLSearchParams(location.search).get('meiro');
  if (want === 'daily' || want === '1') {
    wantDaily = want === 'daily';
    const intro = $('intro'), t = b && b.querySelector('.mp-t');
    if (intro && !intro.hidden && b) { if (t && wantDaily) t.textContent = '☀️ きょうの めいろ に ちょうせん'; }   // はじめての人：いちばん上の ボタンで（iPhone の 傾きの 許可は タップの その場で）
    else setTimeout(() => open(undefined, wantDaily), 400);   // もう 遊んでいる人：すぐ ひらく（傾きの 許可は 盤を さわったときに 聞く）
  }
  const m = $('pxMeiro');
  if (m) m.addEventListener('click', () => open());
  const c = $('meiroCardBtn');   // きろく の 札（あるいて遊ぶ の人も ここから）
  if (c) c.addEventListener('click', () => open());
  note();
});

root.NISHIO_MEIRO = { open, close, get state() { return st; }, get game() { return game; }, goalList, makeBoard: (n, s) => makeBoard(n, s),
  // プレイテスト用：お米を 盤の (x, y) マスへ
  warp(x, y) { if (game && game.board) { game.x = x; game.y = y; game.vx = game.vy = 0; } } };
})(window);
