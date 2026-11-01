/* にしおさんぽGO — ドット絵（ドラクエ風）表示
 * OpenStreetMap の地図データ（道・建物・田畑・森・川・海など）を 8m 四方のマスに塗り分け、
 * 16×16 のドット絵タイルで描きます。航空写真は使いません。地図データ © OpenStreetMap contributors（ODbL）。 */
(() => {
'use strict';
const G = window.nishioGo;
if (!G) return;
const $ = id => document.getElementById(id);

/* ---------- 座標 → マス ---------- */
const TILE_M = 8;          // 1マス = 8m
const SIMPLE = () => document.body.classList.contains('simple');
const BTN_ART = { globe: 'btn-globe', feet: 'stat-feet', car: 'btn-car', walker: 'btn-walker', compass: 'btn-compass', flag: 'stat-flag', book: 'stat-book', map: 'tab-map', pixmap: 'pixmap' };   // Blender で作った 32×32 の絵（tools/blender/pixel-art.py）
const ICO = (n, emoji, alt) => (BTN_ART[n] ? `<img class="pi art" src="nishio-go/art/${BTN_ART[n]}.png" alt="${alt}" width="32" height="32"/>`
  : window.NSG_ICONS && NSG_ICONS.ART[n] ? NSG_ICONS.html(n, alt) : emoji);   // ボタンの絵（ドット絵。なければ絵文字）   // 文字を少なく（せってい の「文字を多めに出す」がオフ）
const CHUNK = 128;         // 1区画 = 128×128マス（約1km四方）ごとに地図データを取得
const ORG_LAT = 35.0, ORG_LNG = 136.9;
const M_LAT = 110950, M_LNG = 111320 * Math.cos(34.86 * Math.PI / 180);
const toTile = (lat, lng) => ({ x: (lng - ORG_LNG) * M_LNG / TILE_M, y: (ORG_LAT - lat) * M_LAT / TILE_M });
const toLatLng = (x, y) => ({ lat: ORG_LAT - y * TILE_M / M_LAT, lng: ORG_LNG + x * TILE_M / M_LNG });
const chunkBox = (cx, cy) => {
  const nw = toLatLng(cx * CHUNK, cy * CHUNK), se = toLatLng((cx + 1) * CHUNK, (cy + 1) * CHUNK);
  return { s: se.lat, w: nw.lng, n: nw.lat, e: se.lng };
};

/* ---------- 地形 ---------- */
// G草原 F田んぼ T町 W森 P公園 A水 S砂浜 B建物 R道 H大きな道 L線路 D小道 X未読込 M山 K丘 E茶畑 V畑 I工場 J境内 Y墓地 N温室 U農地（作物不明） Q住宅地
const C = { G: 0, F: 1, T: 2, W: 3, P: 4, A: 5, S: 6, B: 7, R: 8, H: 9, L: 10, D: 11, X: 12, M: 13, K: 14, E: 15, V: 16, I: 17, J: 18, Y: 19, N: 20, U: 21, Q: 22 };
const UNSET = 255;
// こよみ（season.js）：田畑の色は月で（田おこし・田植え・青田・稲刈り・刈田）、森は紅葉のころ、公園は桜のころに変わる
// 日付が変わったら seasonNow() で計算し直し、田畑・森・公園のタイルとせかいちずの色を作り直す（refreshSeason）
const KO = window.NISHIO_SEASON;
const PADDY_COLS = { green: '#86b54c', gold: '#cfae4a', flooded: '#8fbfd8', soil: '#8a6a44', stubble: '#a89a6a' };
let PADDY_TILE = 'green', KOYO = false, SAKURA = false, PADDY_COL = PADDY_COLS.green;
function seasonNow() {
  const d = new Date();
  PADDY_TILE = KO ? KO.paddy(d).tile : 'green';
  KOYO = !!KO && KO.inRange(d, [11, 1], [12, 10]); SAKURA = !!KO && KO.inRange(d, [3, 25], [4, 10]);
  PADDY_COL = PADDY_COLS[PADDY_TILE] || PADDY_COLS.green;
  return PADDY_TILE + KOYO + SAKURA;
}
let seasonKey = seasonNow();

/* ---------- 土地利用（nishio-go/landuse.json：国土数値情報「土地利用細分メッシュ」100m、国土交通省） ----------
 * OpenStreetMap に何も描かれていない所を、実際の土地利用で塗る（田んぼと市街地の場所を実際の地図に合わせる）。
 * a 田・b その他の農用地・c 森林・d 荒地・e 建物用地・f 道路・g 鉄道・h その他の用地・i 河川地及び湖沼・j 海浜・k 海水域・l ゴルフ場 */
let LU = null;
const luReady = fetch('nishio-go/landuse.json').then(r => (r.ok ? r.json() : null)).then(j => {
  if (!j || !Array.isArray(j.rows) || j.rows.length !== j.h) return;
  const g = new Uint8Array(j.w * j.h);
  j.rows.forEach((row, y) => { let x = 0; for (const part of row.split(',')) { if (!part) continue; const c = part.charCodeAt(0), n = parseInt(part.slice(1), 36); g.fill(c, y * j.w + x, y * j.w + x + n); x += n; } });
  LU = { lat0: j.lat0, lng0: j.lng0, dLat: j.dLat, dLng: j.dLng, w: j.w, h: j.h, g };
}).catch(() => { /* 土地利用なしで続ける */ });
function luAt(lat, lng) {   // その場所の土地利用（1文字）。表の外・読めていないときは ''
  if (!LU) return '';
  const y = LU.h - 1 - Math.floor((lat - LU.lat0) / LU.dLat), x = Math.floor((lng - LU.lng0) / LU.dLng);
  return x < 0 || y < 0 || x >= LU.w || y >= LU.h ? '' : String.fromCharCode(LU.g[y * LU.w + x]);
}
const BLOCK = new Set([C.A, C.B, C.M, C.X]);    // デモで歩けないマス（水・建物・山・まだ読み込んでいない所）
const HILL_M = 35, MOUNTAIN_M = 110;        // 標高（m）：これ以上の草地は丘、さらに高い所（幡豆の尾根・茶臼山・三ヶ根山）は山

function classify(t, closed) {
  if (t.building && closed) return { a: 1, c: t.building === 'greenhouse' ? C.N : C.B, p: 30 };
  if (t.natural === 'coastline') return { coast: 1 };
  if (t.highway) {
    const h = t.highway;
    if (/^(proposed|construction|platform|bus_stop|elevator|corridor)$/.test(h)) return null;
    if (t.area === 'yes' && closed) return { a: 1, c: C.T, p: 11 };
    if (/^(motorway|trunk|primary|secondary)/.test(h)) return { a: 0, c: C.H, w: 2, p: 46 };
    if (/^(tertiary|unclassified|residential|living_street|service|pedestrian|road)/.test(h)) return { a: 0, c: C.R, w: h.startsWith('tertiary') ? 2 : 1, p: 44 };
    return { a: 0, c: C.D, w: 1, p: 42 };             // 歩道・小道・農道
  }
  if (t.railway) return { a: 0, c: C.L, w: 1, p: 40 };
  if (t.waterway && t.waterway !== 'riverbank') return { a: 0, c: C.A, w: t.waterway === 'river' ? 3 : t.waterway === 'canal' ? 2 : 1, p: 22 };
  if (!closed) return null;
  if (t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.landuse === 'basin') return { a: 1, c: C.A, p: 20 };
  if (t.natural === 'beach' || t.natural === 'sand') return { a: 1, c: C.S, p: 19 };
  if (t.natural === 'wood' || t.landuse === 'forest' || t.natural === 'scrub') return { a: 1, c: C.W, p: 16 };
  if (t.natural === 'wetland') return { a: 1, c: /^(tidalflat|saltmarsh)$/.test(t.wetland || '') ? C.S : C.P, p: 19 };   // 干潟は砂浜。海の判定のあとに塗る
  const lu = t.landuse || '';
  if (/^(aquaculture|salt_pond)$/.test(lu)) return { a: 1, c: C.A, p: 20 };   // 一色の養鰻池・塩田
  if (/^(harbour|port)$/.test(lu)) return null;                               // 港は水面を覆うことがあるので塗らない
  if (lu === 'religious') return { a: 1, c: C.J, p: 13 };                     // 境内
  if (lu === 'cemetery' || t.amenity === 'grave_yard') return { a: 1, c: C.Y, p: 14 };
  if (t.amenity === 'place_of_worship') return { a: 1, c: C.J, p: 13 };          // 神社・お寺の境内
  if (t.leisure || /^(grass|recreation_ground|village_green)$/.test(lu)) return { a: 1, c: C.P, p: 14 };
  if (lu === 'greenhouse_horticulture') return { a: 1, c: C.N, p: 12 };
  const tea = /tea/.test(`${t.crop || ''} ${t.trees || ''} ${t.produce || ''}`);
  if (tea && /^(farmland|orchard|plant_nursery)$/.test(lu)) return { a: 1, c: C.E, p: 12 };   // 茶畑（西尾の抹茶）
  if (lu === 'paddy' || /rice/.test(t.crop || '')) return { a: 1, c: C.F, p: 12 };   // 田んぼは paddy か crop=rice のときだけ
  if (lu === 'farmland' && !t.crop) return { a: 1, c: C.U, p: 12 };                  // 作物の分からない農地
  if (/^(farmland|orchard|vineyard|plant_nursery|allotments)$/.test(lu)) return { a: 1, c: C.V, p: 12 };
  if (lu === 'meadow') return { a: 1, c: C.G, p: 12 };
  if (lu === 'industrial') return { a: 1, c: C.I, p: 10 };
  if (lu || t.amenity) return { a: 1, c: C.T, p: 10 };
  return null;
}

// 主要な建物（ドット絵のアイコンで描く。チェックインはできない）
const POI_LABEL = { townhall: '🏛️ 市役所・支所', hospital: '🏥 病院', school: '🏫 学校', library: '📚 図書館', police: '👮 警察・交番',
  fire: '🚒 消防署', post: '〒 郵便局', shop: '🛒 お店', station: '🚉 駅',
  konbini: '🏪 コンビニ', super: '🛒 スーパー・ショッピングセンター', home: '🔨 ホームセンター・家具', drug: '💊 ドラッグストア・薬局', fuel: '⛽ ガソリンスタンド',
  bank: '🏦 銀行', food: '🍜 飲食店', cafe: '☕ カフェ・パン・お菓子', store: '🛍️ お店' };
// 街並みの目印（tools/bake-spots.js が OpenStreetMap から作った nishio-go/landmarks.json）：[マスx, マスy, 種類, 名前]
let landmarks = [];
fetch('nishio-go/landmarks.json').then(r => (r.ok ? r.json() : null)).then(j => {
  if (!j || !Array.isArray(j.items)) return;
  landmarks = j.items.filter(m => POI_LABEL[m[2]]).map(([lat, lng, kind, name]) => { const q = toTile(lat, lng); return [+q.x.toFixed(2), +q.y.toFixed(2), kind, name, 'lm']; });
  poiCache.key = ''; dirty = true;
}).catch(() => { /* 目印なしで続行 */ });
// 町名（せかいちずの地名のうち町・字。world.json の l の 'tw'）：[マスx, マスy, 名前, 市町名（7市町と まわりの市町。どこでもなければ ''）]。歩く地図に町名の札を出し、いまいる町を左上に出す
let towns = [], townsLoad = null, townsRetry = 0;
function loadTowns() {
  if (towns.length || townsLoad || Date.now() < townsRetry) return;
  const use = l => {
    towns = (l || []).filter(x => x[4] === 'tw' && x[2]).map(x => { const ll = wToLL(x[0], x[1]), q = toTile(ll.lat, ll.lng), c = (G.placeAt || G.cityAt)(ll.lat, ll.lng); return [q.x, q.y, String(x[2]), c ? c.name : '']; });
    dirty = true;
  };
  if (worldLabels.some(x => x[4] === 'tw')) { use(worldLabels); return; }
  townsRetry = Date.now() + 60000;   // 取れなかったら1分おいて試し直す
  townsLoad = fetch(WORLD_FILE).then(r => (r.ok ? r.json() : null)).then(j => use(j && j.l)).catch(() => {}).finally(() => { townsLoad = null; });
}
// いまいる町（いちばん近い町名。約1.2km以内）と、町が変わったときの知らせ（RPG の地名の出しかた）
const here = { town: '', city: '', banner: '', bannerAt: 0, at: 0 };   // at：町名を最後に確かめた時刻（歩く地図を描いている間だけ更新される）
function toastFoot() {   // 画面の 上に 出て いる 知らせの 下の はし（キャンバスの 画素。出て いない・下に 出て いる ときは 0）
  const el = document.getElementById('toast');
  if (!el || !el.classList.contains('show')) return 0;
  const r = el.getBoundingClientRect(), c = cv.getBoundingClientRect();
  if (!c.height || r.top > c.top + c.height / 2) return 0;
  return (r.bottom - c.top) * (cv.width / c.width);
}
function updateHere() {
  const t = targetTile(), me = G.me, c = me && (G.placeAt || G.cityAt)(me.lat, me.lng), city = c ? c.name : '';
  // 同じ市町の町名だけから選ぶ（境のそばで「西尾市 金平町（蒲郡市）」のようにならないように）
  let best = null, bd = 150;
  for (const x of towns) { if (x[3] !== city) continue; const d = Math.hypot(x[0] - t.x, x[1] - t.y); if (d < bd) { bd = d; best = x; } }
  const town = best ? best[2] : '';
  if (town && here.town && town !== here.town) { here.banner = town; here.bannerAt = performance.now(); here.waited = 0; here.lastT = 0; if (G.onTownEnter) G.onTownEnter(town, city); }   // waited：前の 町名の 待ちを 引きつがない（Codex の 指摘）
  here.town = town;   // 近くに町名がない（田畑や山の中）ときは消す
  here.at = performance.now();
  here.city = city;
  if (G.setPlace) G.setPlace(city, town);   // 左上の こよみ の札に「📍町名」として出す
}
// 看板の色（お店の種類ごと。よく知られた店は、その店らしい色に）。白い字で名前を書く
const SIGN_KIND = { konbini: '#2a7d4f', super: '#c0392b', home: '#8a5a2b', drug: '#2a6fb0', fuel: '#5a5a5a', bank: '#1d4f91', post: '#d7000f', food: '#a0522d', cafe: '#7b4b2a', store: '#555',
  townhall: '#2f4f4f', hospital: '#b03030', school: '#3b6e3b', library: '#6a4c93', police: '#1f3f7a', fire: '#c0392b', shop: '#c0392b', station: '#2f4f4f' };
const SIGN_BRAND = [[/ファミリーマート|ファミマ/, '#0b8f3c'], [/セブン/, '#ef6c1a'], [/ローソン/, '#1474c4'], [/ミニストップ/, '#0b3c8c'], [/デイリーヤマザキ|ヤマザキ/, '#d7000f'],
  [/アオキ/, '#d40f1e'], [/アピタ|ピアゴ/, '#e64a19'], [/カネスエ/, '#0068b7'], [/ヤマナカ|フランテ/, '#d6002a'], [/バロー/, '#d7000f'], [/フィール/, '#2e8b57'], [/イオン|マックスバリュ/, '#b0127a'],
  [/スギ薬局/, '#0067b0'], [/スギヤマ/, '#e0457b'], [/ゲンキー/, '#e0a800'], [/ウエルシア/, '#e4007f'], [/コメリ/, '#e05a00'], [/カインズ/, '#00843d'], [/エディオン/, '#e60012'],
  [/信用金庫|信金|銀行/, '#1d4f91'], [/郵便局/, '#d7000f'], [/マクドナルド/, '#d52b1e'], [/コメダ/, '#7a4a1f'], [/スターバックス/, '#00704a'], [/すき家/, '#d7000f'], [/吉野家/, '#f08300']];
const signColor = (kind, name) => { for (const [re, c] of SIGN_BRAND) if (re.test(name)) return c; return SIGN_KIND[kind] || '#555'; };
const MAJOR_SIGN = new Set(['super', 'konbini', 'home', 'drug', 'fuel', 'bank', 'townhall', 'hospital', 'station', 'post', 'shop']);   // 重なるときは、こちらの看板を先に出す
const WORLD_POI = new Set(['townhall', 'hospital', 'library', 'fire', 'shop']);   // せかいちずに出す大きな建物
function poiKind(t) {
  const a = t.amenity;
  if (a === 'townhall') return 'townhall';
  if (a === 'hospital') return 'hospital';
  if (/^(school|kindergarten|university|college)$/.test(a || '')) return 'school';
  if (a === 'library') return 'library';
  if (a === 'police') return 'police';
  if (a === 'fire_station') return 'fire';
  if (a === 'post_office') return 'post';
  if (/^(mall|department_store|supermarket)$/.test(t.shop || '')) return 'shop';
  return null;
}
function elCenter(el) {
  if (el.lat != null) return { lat: el.lat, lon: el.lon };
  if (el.center) return el.center;
  const pts = el.geometry || (el.members || []).flatMap(m => m.geometry || []);
  if (!pts.length) return null;
  return { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lon: pts.reduce((a, p) => a + p.lon, 0) / pts.length };
}
// 同じ種類・同じ名前で近いもの（建物の輪郭と点の両方がある等）は1つに
function dedupePois(list, near) {
  const out = [];
  for (const p of list) if (!out.some(q => q[2] === p[2] && q[3] === p[3] && Math.hypot(q[0] - p[0], q[1] - p[1]) < near)) out.push(p);
  return out;
}

// 多角形を塗る（偶奇規則。マルチポリゴンの部品がつながっていなくても、辺の集合で正しく塗れる）
function fillPoly(g, rings, code, W = CHUNK, H = CHUNK) {
  let minY = Infinity, maxY = -Infinity, n = 0;
  for (const r of rings) for (const p of r) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
  const ys = Math.max(0, Math.floor(minY)), ye = Math.min(H - 1, Math.ceil(maxY));
  const xs = [];
  for (let cy = ys; cy <= ye; cy++) {
    const sy = cy + 0.5;
    xs.length = 0;
    for (const r of rings) for (let i = 0; i < r.length - 1; i++) {
      const y1 = r[i][1], y2 = r[i + 1][1];
      if ((y1 <= sy) !== (y2 <= sy)) xs.push(r[i][0] + (sy - y1) * (r[i + 1][0] - r[i][0]) / (y2 - y1));
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const a = Math.max(0, Math.ceil(xs[i] - 0.5)), b = Math.min(W - 1, Math.floor(xs[i + 1] - 0.5));
      for (let cx = a; cx <= b; cx++) { g[cy * W + cx] = code; n++; }
    }
  }
  return n;
}

// 線を引く（w マス幅）。mask を渡すと地形ではなく mask に印を付ける
function strokeLine(g, pts, code, w, mask, W = CHUNK, H = CHUNK, keep) {
  const r = (w - 1) / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    if (Math.max(x1, x2) < -w || Math.min(x1, x2) > W + w || Math.max(y1, y2) < -w || Math.min(y1, y2) > H + w) continue;
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 0.35));
    for (let s = 0; s <= n; s++) {
      const x = x1 + (x2 - x1) * s / n, y = y1 + (y2 - y1) * s / n;
      for (let cy = Math.floor(y - r); cy <= Math.floor(y + r); cy++) {
        if (cy < 0 || cy >= H) continue;
        for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) {
          if (cx < 0 || cx >= W) continue;
          const j = cy * W + cx;
          if (mask) mask[j] = 1; else if (!keep || !keep.has(g[j])) g[j] = code;
        }
      }
    }
  }
}

// 海岸線（OSMでは進行方向の右側が海）から海を決める。
// 海岸線で区切られた「まだ何もないマス」のかたまりごとに、線の左右に置いた点で投票し（右＝海に＋、左＝陸に−）、
// 海の票が多いかたまりだけを海にする（狭い入江や鋭い切れ込みで陸が丸ごと海になるのを防ぐ）。
// 海岸線そのものは海と陸の境目として使うだけ（砂浜は natural=beach で別に描く）
function seaFill(g, coasts) {
  const N = CHUNK * CHUNK, bar = new Uint8Array(N);
  for (const line of coasts) strokeLine(g, line, 0, 1, bar);
  const comp = new Int32Array(N).fill(-1), stack = [];
  const open = j => comp[j] === -1 && !bar[j] && g[j] === UNSET;
  let nc = 0;
  for (let s = 0; s < N; s++) {
    if (!open(s)) continue;
    comp[s] = nc;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop(), x = i % CHUNK;
      for (const j of [x > 0 ? i - 1 : -1, x < CHUNK - 1 ? i + 1 : -1, i - CHUNK, i + CHUNK]) {
        if (j >= 0 && j < N && open(j)) { comp[j] = nc; stack.push(j); }
      }
    }
    nc++;
  }
  const vote = new Float64Array(nc);
  for (const line of coasts) for (let i = 0; i < line.length - 1; i++) {
    const [x1, y1] = line[i], [x2, y2] = line[i + 1];
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    if (!len || Math.max(x1, x2) < -2 || Math.min(x1, x2) > CHUNK + 2 || Math.max(y1, y2) < -2 || Math.min(y1, y2) > CHUNK + 2) continue;
    const nx = -dy / len, ny = dx / len;   // 画面座標（y下向き）での右手方向
    const n = Math.max(1, Math.ceil(len));
    for (let s = 0; s < n; s++) {
      const t = (s + 0.5) / n, px = x1 + dx * t, py = y1 + dy * t;
      for (const side of [1, -1]) {
        // 線から外へ少しずつ離れ、海岸線のマスを抜けた最初のマスに投票する
        for (const d of [0.6, 1.1, 1.6, 2.1]) {
          const sx = Math.floor(px + nx * d * side), sy = Math.floor(py + ny * d * side);
          if (sx < 0 || sy < 0 || sx >= CHUNK || sy >= CHUNK) break;
          const j = sy * CHUNK + sx;
          if (bar[j]) continue;
          if (comp[j] >= 0) vote[comp[j]] += side;
          break;
        }
      }
    }
  }
  for (let i = 0; i < N; i++) if (comp[i] >= 0 && vote[comp[i]] > 0) g[i] = C.A;
}

// 標高は区画のまわり1マスを含む (CHUNK+2)² で持つ（区画の境目でも陰影が途切れないように）。
// NaN＝海（データなし）、UNK＝不明（取得失敗・異常値）
const DB = CHUNK + 2, UNK = -32768;

// OpenStreetMap に何もないマスを土地利用で塗る：田→田んぼ、その他の農用地→畑、森林→森、建物用地→家並み（道に面したマスは家、ほかは4マスに3つが家）、
// その他の用地・道路・鉄道→町の地面、ゴルフ場→芝生、海浜→砂浜、それ以外（荒地・川・海）→草地。作物の分からない農地（OSM）は、田なら田んぼ、その他の農用地なら畑
function fillLanduse(g, cx, cy, real) {
  const x0 = cx * CHUNK, y0 = cy * CHUNK, lats = [], lngs = [];
  for (let k = 0; k < CHUNK; k++) { lats.push(toLatLng(x0, y0 + k + 0.5).lat); lngs.push(toLatLng(x0 + k + 0.5, y0).lng); }
  const road = i => { const c = g[i]; return c === C.R || c === C.H; };
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const i = y * CHUNK + x, c = g[i];
    if (c !== UNSET && c !== C.U) continue;
    const u = LU ? luAt(lats[y], lngs[x]) : '';
    if (c === C.U) { if (u === 'a') g[i] = C.F; else if (u === 'b') g[i] = C.V; continue; }
    if (u === 'a') g[i] = C.F;
    else if (u === 'b') g[i] = C.V;
    else if (u === 'c') g[i] = C.W;
    else if (u === 'e') {
      const front = (x > 0 && road(i - 1)) || (x < CHUNK - 1 && road(i + 1)) || (y > 0 && road(i - CHUNK)) || (y < CHUNK - 1 && road(i + CHUNK));
      const h = (((x0 + x) * 73856093) ^ ((y0 + y) * 19349663)) >>> 0;
      g[i] = !real && (front || h % 4) ? C.Q : C.T;   // 国土地理院の建物があるときは、本当の家だけを建てる
    } else if (u === 'h' || u === 'f' || u === 'g') g[i] = C.T;
    else if (u === 'l') g[i] = C.P;
    else if (u === 'j') g[i] = C.S;
    else g[i] = C.G;
  }
  g.lu = !!LU;
}
// bld：国土地理院の建物（tools/gsi-buildings.js。区画を用意するときだけ）。あれば OpenStreetMap の建物の代わりに使い、
// 小さい建物（家）は中心のマスに家の絵、大きい建物は形どおりに屋根を塗る。g.rf に、空中写真で見た屋根の色（マスごと）を入れる
const HOUSE_M2 = 250, SHED_M2 = 30;
function rasterize(elements, cx, cy, dem, bld) {
  const g = new Uint8Array(CHUNK * CHUNK).fill(UNSET);
  const x0 = cx * CHUNK, y0 = cy * CHUNK, real = Array.isArray(bld);
  const ops = [], coasts = [], pois = [];
  for (const el of elements) {
    const kind = poiKind(el.tags || {});
    if (kind) {
      const c = elCenter(el), q = c && toTile(c.lat, c.lon);
      if (q && q.x >= x0 && q.y >= y0 && q.x < x0 + CHUNK && q.y < y0 + CHUNK) pois.push([+q.x.toFixed(2), +q.y.toFixed(2), kind, String(el.tags.name || '').slice(0, 40)]);
    }
    let rings;
    if (el.type === 'way' && el.geometry) rings = [el.geometry];
    else if (el.type === 'relation' && el.members) rings = el.members.filter(m => m.type === 'way' && m.geometry).map(m => m.geometry);
    else continue;
    if (!rings.length || !rings[0].length) continue;
    const f = rings[0][0], l = rings[0][rings[0].length - 1];
    const closed = el.type === 'relation' || (rings[0].length > 3 && f.lat === l.lat && f.lon === l.lon);
    const k = classify(el.tags || {}, closed);
    if (!k || (real && k.c === C.B)) continue;
    const pts = rings.map(r => r.map(p => { const q = toTile(p.lat, p.lon); return [q.x - x0, q.y - y0]; }));
    if (k.coast) coasts.push(...pts); else ops.push({ k, pts });
  }
  if (real) {
    g.rf = new Uint8Array(CHUNK * CHUNK);
    for (const b of bld) {
      const r = b.r.map(([lat, lon]) => { const q = toTile(lat, lon); return [q.x - x0, q.y - y0]; });
      let a = 0;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
      const m2 = Math.abs(a) / 2 * TILE_M * TILE_M;
      if (m2 < SHED_M2 || (b.f === 3111 && m2 < HOUSE_M2)) continue;   // 物置・車庫・小さな屋根だけの小屋は描かない
      if (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) r.push(r[0]);
      ops.push({ k: { a: 1, c: m2 <= HOUSE_M2 && b.f !== 3103 ? C.Q : C.B, p: 30, rc: b.c | 0 }, pts: [r] });
    }
  }
  g.pois = dedupePois(pois, 4);
  const dh = (x, y) => dem[(y + 1) * DB + (x + 1)];
  ops.sort((a, b) => a.k.p - b.k.p);
  let seaDone = false;
  const sea = () => { if (!seaDone) { seaDone = true; if (coasts.length) seaFill(g, coasts); } };   // 海は海岸線で決める
  for (const o of ops) {
    if (o.k.p >= 18) sea();
    if (o.k.a) {
      // 家（国土地理院の小さい建物）は中心のマスだけ。1マスより小さい建物も、中心のマスだけは塗る
      const center = () => {
        const r = o.pts[0], m = r.reduce((s, p) => [s[0] + p[0] / r.length, s[1] + p[1] / r.length], [0, 0]);
        const mx = Math.floor(m[0]), my = Math.floor(m[1]);
        if (mx >= 0 && my >= 0 && mx < CHUNK && my < CHUNK) { g[my * CHUNK + mx] = o.k.c; if (g.rf) g.rf[my * CHUNK + mx] = o.k.rc; }
      };
      if (o.k.c === C.Q) center();
      else if (!fillPoly(g, o.pts, o.k.c)) { if (o.k.c === C.B) center(); }
      else if (o.k.rc && g.rf) fillPoly(g.rf, o.pts, o.k.rc);
    } else for (const line of o.pts) strokeLine(g, line, o.k.c, o.k.w);
  }
  sea();
  // 海岸線が通らない区画は、まるごと陸かまるごと海。地図データが何もなく、
  // さらに標高データも大半が「データなし」（標高がなければ三河湾側の南）のときだけ海とみなす
  if (!coasts.length && g.every(v => v === UNSET)) {
    let na = 0, known = 0;
    if (dem) for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) { const h = dh(x, y); if (Number.isNaN(h)) { na++; known++; } else if (h > UNK) known++; }
    const isSea = known > CHUNK * CHUNK / 2 ? na > known * 0.9 : toLatLng((cx + 0.5) * CHUNK, (cy + 0.5) * CHUNK).lat < 34.82;
    if (isSea) g.fill(C.A);
  }
  fillLanduse(g, cx, cy, real);
  if (real) {   // 家のまわりは庭（草と植木）か、駐車場や通路（町の地面）
    const isQ = (x, y) => x >= 0 && y >= 0 && x < CHUNK && y < CHUNK && g[y * CHUNK + x] === C.Q;
    for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
      const i = y * CHUNK + x;
      if (g[i] !== C.T || ((((x0 + x) * 73856093) ^ ((y0 + y) * 19349663)) >>> 0 & 3) === 0) continue;
      if (isQ(x - 1, y) || isQ(x + 1, y) || isQ(x, y - 1) || isQ(x, y + 1) || isQ(x - 1, y - 1) || isQ(x + 1, y - 1) || isQ(x - 1, y + 1) || isQ(x + 1, y + 1)) g[i] = C.G;
    }
  }
  if (!dem) { for (let i = 0; i < g.length; i++) g[i] |= 2 << 5; return g; }
  const ok = h => Number.isFinite(h) && h > UNK;
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const i = y * CHUNK + x, h = dh(x, y), c = g[i];
    // 高い所の草地・森は丘や山に
    if (ok(h) && h >= HILL_M) {
      if (h >= MOUNTAIN_M && (c === C.G || c === C.W || c === C.P)) g[i] = C.M;
      else if (c === C.G || c === C.P) g[i] = C.K;
    }
    // 斜面の陰影（北西から光が当たる）。0暗い〜2平ら〜4明るい を上位ビットに入れる
    let sh = 2;
    const a = dh(x - 1, y - 1), b = dh(x + 1, y + 1);
    if (c !== C.A && ok(a) && ok(b)) {
      const sl = (b - a) / (2 * Math.SQRT2 * TILE_M);   // 南東へ上る斜面（北西向き）ほど明るい
      sh = sl > 0.12 ? 4 : sl > 0.04 ? 3 : sl < -0.12 ? 0 : sl < -0.04 ? 1 : 2;
    }
    g[i] |= sh << 5;
  }
  return g;
}

// 町なかの草原を住宅地に。西尾の OpenStreetMap は家がまだ一部しか描かれておらず、道が細かく通った住宅街まで草原に見える。
// まわり7×7マスに道や建物が多い草原（田畑・公園などは除く）だけを、道に面したマスは家・奥は家と庭に塗り替える。
// 区画を読み込むたびに行う（道・建物の数だけで決めるので、何度行っても同じ結果）
const TOWN_R = 3, TOWN_MIN = 13;
function townify(g) {
  const N = CHUNK, W1 = N + 1, S = new Int32Array(W1 * W1);
  for (let y = 0; y < N; y++) {
    let row = 0;
    for (let x = 0; x < N; x++) {
      const c = g[y * N + x] & 31;
      row += c === C.R || c === C.H ? 1 : c === C.B ? 2 : 0;
      S[(y + 1) * W1 + x + 1] = S[y * W1 + x + 1] + row;
    }
  }
  const road = (x, y) => { if (x < 0 || y < 0 || x >= N || y >= N) return false; const c = g[y * N + x] & 31; return c === C.R || c === C.H; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if ((g[i] & 31) !== C.G) continue;
    const x0 = Math.max(0, x - TOWN_R), y0 = Math.max(0, y - TOWN_R), x1 = Math.min(N, x + TOWN_R + 1), y1 = Math.min(N, y + TOWN_R + 1);
    const n = S[y1 * W1 + x1] - S[y0 * W1 + x1] - S[y1 * W1 + x0] + S[y0 * W1 + x0];
    if (n * 49 < TOWN_MIN * (x1 - x0) * (y1 - y0)) continue;
    const front = road(x - 1, y) || road(x + 1, y) || road(x, y - 1) || road(x, y + 1);
    const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    g[i] = (g[i] & ~31) | (front || h % 3 ? C.Q : C.T);
  }
  return g;
}

/* ---------- 標高（国土地理院 標高タイル dem_png、ズーム14＝約8m） ---------- */
const DEM_Z = 14;
const demCache = new Map();
const merc = (lat, lng, z = DEM_Z) => { const n = 256 * 2 ** z, r = lat * Math.PI / 180; return { x: (lng + 180) / 360 * n, y: (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n }; };
function demTile(x, y, z = DEM_Z) {
  const k = z + '/' + x + '/' + y;
  if (!demCache.has(k)) {
    demCache.set(k, (async () => {
      const res = await fetch(`https://cyberjapandata.gsi.go.jp/xyz/dem_png/${z}/${x}/${y}.png`);
      if (res.status === 404) return 'sea';        // タイルがない＝陸地がない（海）
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const x2 = c.getContext('2d', { willReadFrequently: true });
      x2.drawImage(bmp, 0, 0);
      const d = x2.getImageData(0, 0, 256, 256).data, h = new Float32Array(65536);
      for (let i = 0; i < 65536; i++) {
        const v = d[i * 4] * 65536 + d[i * 4 + 1] * 256 + d[i * 4 + 2];
        if (v === 8388608) { h[i] = NaN; continue; }                 // 2^23 は「データなし」
        const m = (v < 8388608 ? v : v - 16777216) * 0.01;
        h[i] = m < -100 || m > 1000 ? UNK : m;   // 指紋対策で画素が乱れたときなどの異常値は「不明」に
      }
      return h;
    })().catch(e => { demCache.delete(k); throw e; }));
  }
  return demCache.get(k);
}
// 区画（＋まわり1マス）の標高。取れなかったタイルの所は「不明」（海にはしない）。全部不明なら null
async function demFor(cx, cy) {
  const pts = [], need = new Map();
  for (let j = -1; j <= CHUNK; j++) for (let i = -1; i <= CHUNK; i++) {
    const ll = toLatLng(cx * CHUNK + i + 0.5, cy * CHUNK + j + 0.5), m = merc(ll.lat, ll.lng);
    const tx = Math.floor(m.x / 256), ty = Math.floor(m.y / 256);
    pts.push([tx + '/' + ty, Math.min(255, Math.floor(m.x - tx * 256)) + Math.min(255, Math.floor(m.y - ty * 256)) * 256]);
    need.set(tx + '/' + ty, [tx, ty]);
  }
  const got = new Map();
  await Promise.all([...need].map(async ([k, [tx, ty]]) => got.set(k, await demTile(tx, ty).catch(() => null))));
  const partial = [...got.values()].some(t => t === null);
  if ([...got.values()].every(t => t === null)) return null;
  const h = new Float32Array(DB * DB);
  pts.forEach(([k, off], i) => { const t = got.get(k); h[i] = t === 'sea' ? NaN : t ? t[off] : UNK; });
  return { h, partial };
}

// いまいる所の まわりの標高（転がる坂・等高線に使う）。タイルを読みこんだら同期で読める（読めていない所は null）
const demLive = new Map();   // タイル番号 → 標高（Float32Array）・'sea'・読みこみ中は null
let demGen = 0, heightFn = null;   // demGen：タイルが届くたびに増える（等高線を描きなおす）。heightFn：確かめるときに差しかえる標高
function demPx(X, Y) {   // ズーム14の画素の標高（m）。海は 0、読めていない・不明は null
  const tx = Math.floor(X / 256), ty = Math.floor(Y / 256), k = tx * 65536 + ty;
  if (!demLive.has(k)) {
    demLive.set(k, null);
    demTile(tx, ty).then(t => { demLive.set(k, t); demGen++; dirty = true; }, () => setTimeout(() => demLive.delete(k), 30000));   // 取れなければ 30秒後に もう一度
  }
  const t = demLive.get(k);
  if (t == null) return null;
  if (t === 'sea') return 0;
  const v = t[(Y - ty * 256) * 256 + (X - tx * 256)];
  return Number.isNaN(v) ? 0 : v <= UNK ? null : v;
}
function heightAt(x, y) {   // マスの座標 → 標高（m。となりの画素となめらかに まぜる）
  if (heightFn) return heightFn(x, y);
  const ll = toLatLng(x, y), m = merc(ll.lat, ll.lng), px = m.x - 0.5, py = m.y - 0.5, X = Math.floor(px), Y = Math.floor(py), fx = px - X, fy = py - Y;
  const a = demPx(X, Y), b = demPx(X + 1, Y), c = demPx(X, Y + 1), d = demPx(X + 1, Y + 1);
  if (a === null || b === null || c === null || d === null) return null;
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
// 坂：その場所の傾き（となりの マスとの標高の差。勾配 g：1なら 45度）と、下る向きへの加速（マス/秒²）。
// 西尾の平野は ほとんど平ら（0.1%くらい）で、碧海台地のへり（段丘の崖）や 幡豆の山・八ツ面山で急になる。ゲームでは本当より強く転がす
const SLOPE_K = 45, SLOPE_MIN = 0.015, SLOPE_MAXA = 12;   // 勾配1あたりの加速・これより ゆるい坂では止まっていられる・いちばん強い加速
function slopeAt(x, y) {
  const e = heightAt(x + 1, y), w = heightAt(x - 1, y), so = heightAt(x, y + 1), n = heightAt(x, y - 1);
  if (e === null || w === null || so === null || n === null) return { x: 0, y: 0, g: 0, known: false };
  const gx = (e - w) / (2 * TILE_M), gy = (so - n) / (2 * TILE_M), g = Math.hypot(gx, gy);
  if (g < SLOPE_MIN) return { x: 0, y: 0, g, known: true };
  const a = Math.min(SLOPE_MAXA, (g - SLOPE_MIN) * SLOPE_K);
  return { x: -gx / g * a, y: -gy / g * a, g, known: true };
}
// 等高線の段：30mまでは 2mごと、150mまでは 10mごと、それより上は 25mごと（平野の小さな高低差も、山の急な坂も 見やすく）
const contourLvl = h => (h < 30 ? Math.floor(h / 2) : h < 150 ? 15 + Math.floor((h - 30) / 10) : 27 + Math.floor((h - 150) / 25));
const contourMajor = l => (l < 15 ? l % 5 === 0 : l < 27 ? (l - 15) % 5 === 2 : (l - 27) % 2 === 0);   // 計曲線（10m・50mごと）は こく
const contour = { key: '', L: null };
const CONTOUR_COL = ['', 'rgba(92,52,18,.42)', 'rgba(92,52,18,.62)'];   // 1：ふつうの線（1点）・2：計曲線（2点）
function drawContours(tx0, ty0, tx1, ty1, ox, oy, T) {   // 等高線（半マスごとに標高の段を調べ、段が変わる さかいに 点の線）
  const S = 2, nx = (tx1 - tx0) * S, ny = (ty1 - ty0) * S, key = `${tx0},${ty0},${tx1},${ty1},${demGen},${heightFn ? 1 : 0}`;
  if (contour.key !== key) {
    const L = new Int16Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = tx0 + (i + 0.5) / S, y = ty0 + (j + 0.5) / S, c = codeAt(Math.floor(x), Math.floor(y));
      const h = c === C.A || c === C.B || c === C.X ? null : heightAt(x, y);
      L[j * nx + i] = h === null ? -1 : contourLvl(Math.max(0, h));
    }
    contour.key = key; contour.L = L;
  }
  const L = contour.L, u = Math.max(1, Math.round(T / 16)), half = T / S;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = L[j * nx + i];
    if (a < 0) continue;
    const X = Math.round(ox + (tx0 + i / S) * T), Y = Math.round(oy + (ty0 + j / S) * T);
    const r = i + 1 < nx ? L[j * nx + i + 1] : -1, d = j + 1 < ny ? L[(j + 1) * nx + i] : -1;
    if (r >= 0 && r !== a) { const k = contourMajor(Math.max(a, r)) ? 2 : 1; ctx.fillStyle = CONTOUR_COL[k]; ctx.fillRect(Math.round(X + half - u * k / 2), Y, u * k, Math.ceil(half)); }
    if (d >= 0 && d !== a) { const k = contourMajor(Math.max(a, d)) ? 2 : 1; ctx.fillStyle = CONTOUR_COL[k]; ctx.fillRect(X, Math.round(Y + half - u * k / 2), Math.ceil(half), u * k); }
  }
}

/* ---------- 地図データの取得と保存 ---------- */
const PX_KEY = 'nsg_px7_', PX_IDX = 'nsg_px7_idx', PX_DAYS = 30, PX_KEEP = 60;
const store = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* noop */ } },
};
const enc = g => String.fromCharCode(...g.map(c => 48 + c));
const dec = s => Uint8Array.from(s, ch => ch.charCodeAt(0) - 48);
const encode = g => { let s = ''; for (let i = 0; i < g.length; i += 4096) s += enc(g.subarray(i, i + 4096)); return s; };

function saveChunk(k, g, days) {
  const idx = (store.get(PX_IDX) || []).filter(x => x !== k);
  idx.push(k);
  while (idx.length > PX_KEEP) store.del(PX_KEY + idx.shift());
  if (!store.set(PX_KEY + k, { t: Date.now(), d: encode(g), p: g.pois || [], days, lu: !!g.lu })) {
    // 保存領域がいっぱいなら古い区画から消してもう一度
    while (idx.length > 1) { store.del(PX_KEY + idx.shift()); if (store.set(PX_KEY + k, { t: Date.now(), d: encode(g), p: g.pois || [], days, lu: !!g.lu })) break; }
  }
  store.set(PX_IDX, idx);
}

const chunks = new Map();   // "cx_cy" → { g, state: 'ok'|'queued'|'loading'|'fail'|'out', t }
const queue = [];
let pumping = false;
const nb = G.CFG.nishioBounds;

function chunkState(cx, cy) { const c = chunks.get(cx + '_' + cy); return c ? c.state : 'none'; }
function rawAt(tx, ty) {   // 下位5bit＝地形、上位＝陰影
  const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
  const c = chunks.get(cx + '_' + cy);
  if (!c || !c.g) return C.X | (2 << 5);
  return c.g[(ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK)];
}
const codeAt = (tx, ty) => rawAt(tx, ty) & 31;
// 線路・道・水べの絵は まわりのマスを見て決めるので、マスごとに覚えておく（nbrLook。地図のまとまりを読みこむたびに忘れる）。
// せかいちず（1マス100m）でも同じ決め方を使う：描くあいだだけ gridAt と覚えておく場所を せかいちずのものにする（drawWorld）
const nbrCache = new Map(), worldNbr = new Map();
let gridAt = codeAt, nbrCur = nbrCache;

// 区画を作るか：西尾市の範囲（佐久島を含む長方形）にかかるか、となりの市町（region.js）の境界から約300m以内にかかるもの
function chunkInPlay(cx, cy) {
  const b = chunkBox(cx, cy);
  if (!(b.n < nb[0][0] - 0.01 || b.s > nb[1][0] + 0.01 || b.e < nb[0][1] - 0.01 || b.w > nb[1][1] + 0.01)) return true;
  // 本店から半径15km（＋約300m）の円にかかる区画（区画の中で本店にいちばん近い点で調べる）
  const h = G.CFG.home, la = Math.min(Math.max(h.lat, b.s), b.n), lo = Math.min(Math.max(h.lng, b.w), b.e);
  if (Math.hypot((la - h.lat) * 111320, (lo - h.lng) * 111320 * Math.cos(h.lat * Math.PI / 180)) <= h.r + 300) return true;
  const pad = 0.003, s = b.s - pad, n = b.n + pad, w = b.w - pad, e = b.e + pad;
  for (const c of G.REGION) {
    if (n < c.bbox[0][0] || s > c.bbox[1][0] || e < c.bbox[0][1] || w > c.bbox[1][1]) continue;
    // 境界の点が区画に入っているか、区画の中の5×5の点のどれかが市町の中か
    if (c.rings.some(r => r.some(p => p[0] >= s && p[0] <= n && p[1] >= w && p[1] <= e))) return true;
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      const q = G.cityAt(s + (n - s) * i / 4, w + (e - w) * j / 4);
      if (q && q.id === c.id) return true;
    }
  }
  return false;
}

function ensureChunk(cx, cy) {
  const k = cx + '_' + cy;
  const c = chunks.get(k);
  if (c && !(c.state === 'fail' && Date.now() - c.t > 60000)) return;
  if (!chunkInPlay(cx, cy)) { chunks.set(k, { state: 'out' }); return; }
  // 用意した区画（chunks/区画.json）を先に確かめたいので、端末の保存分はここでは使わず pump() で使う
  chunks.set(k, { state: 'queued' });
  queue.push([cx, cy]);
  pump();
}

function chunkQuery(b) {
  const p = 0.0005, q = 0.03;   // 森は区画をすっぽり包むことがあるので、約3km広い範囲で取る
  const big = `(${(b.s - q).toFixed(5)},${(b.w - q).toFixed(5)},${(b.n + q).toFixed(5)},${(b.e + q).toFixed(5)})`;
  return `[out:json][timeout:90][bbox:${(b.s - p).toFixed(5)},${(b.w - p).toFixed(5)},${(b.n + p).toFixed(5)},${(b.e + p).toFixed(5)}];
(
  way["building"];
  way["highway"];
  way["railway"~"^(rail|light_rail|narrow_gauge)$"];
  way["waterway"~"^(river|canal|stream|riverbank)$"];
  way["natural"="coastline"];
  wr["natural"~"^(water|wood|beach|sand|scrub|wetland)$"];
  wr["natural"="wood"]${big};
  wr["landuse"="forest"]${big};
  wr["landuse"];
  wr["leisure"~"^(park|garden|pitch|playground|golf_course|recreation_ground|sports_centre)$"];
  wr["amenity"~"^(school|parking|university|college|hospital|kindergarten|place_of_worship|grave_yard)$"];
  nwr["amenity"~"^(townhall|hospital|school|kindergarten|university|college|library|police|fire_station|post_office)$"];
  nwr["shop"~"^(mall|department_store|supermarket)$"];
);
out geom qt;`;
}

// 用意しておいた区画（GitHub Actions の tools/bake-chunks.js が実際の地図データと標高から作った nishio-go/chunks/区画.json）
// 中身は「値の文字＋個数（36進）＋.」のくり返し（ランレングス）。なければ null（ブラウザで地図データを取る）
const unrle = s => {
  const g = new Uint8Array(CHUNK * CHUNK);
  let i = 0;
  for (const m of s.matchAll(/([\s\S])([0-9a-z]+)\./g)) { const n = parseInt(m[2], 36); if (i + n > g.length) return null; g.fill(m[1].charCodeAt(0) - 48, i, i + n); i += n; }
  return i === g.length ? g : null;
};
async function bakedChunk(cx, cy) {
  if (BAKE) return null;
  try {
    const r = await fetch(`nishio-go/chunks/${cx}_${cy}.json`);
    const j = r.ok ? await r.json() : null;
    const g = j && typeof j.d === 'string' ? unrle(j.d) : null;
    if (!g) return null;
    g.pois = Array.isArray(j.p) ? j.p : [];
    g.lu = (j.cv || 1) >= 2;   // 版2からは土地利用で塗ってある
    if (typeof j.r === 'string') g.rf = unrle(j.r);   // 版3から：屋根の色（国土地理院の建物と空中写真）
    return g;
  } catch (e) { return null; }
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      // 現在地に近い区画から
      const here = camTile();
      queue.sort((a, b) => Math.hypot(a[0] - here.x / CHUNK, a[1] - here.y / CHUNK) - Math.hypot(b[0] - here.x / CHUNK, b[1] - here.y / CHUNK));
      const [cx, cy] = queue.shift();
      const k = cx + '_' + cy;
      chunks.set(k, { state: 'loading' });
      // 1) 用意した区画（いつも最新を使う。ブラウザのHTTPキャッシュが効くので2回目からは軽い。端末には保存しない）
      const pre = await bakedChunk(cx, cy);
      if (pre) {
        // 土地利用で塗ってある区画（版2から）はそのまま。古い区画だけ、道の多い草地に家を並べる
        chunks.set(k, { state: 'ok', g: pre.lu ? pre : townify(pre), pois: pre.pois }); nbrCache.clear();
        dirty = true;
        continue;
      }
      // 2) 用意した区画がなければ、前にブラウザで作って端末に保存した区画
      const saved = store.get(PX_KEY + k);
      if (saved && saved.d && saved.d.length === CHUNK * CHUNK && Date.now() - saved.t < (saved.days || PX_DAYS) * 864e5) {
        chunks.set(k, { state: 'ok', g: saved.lu ? dec(saved.d) : townify(dec(saved.d)), pois: saved.p || [] }); nbrCache.clear();
        dirty = true;
        continue;
      }
      // 3) それもなければ、ブラウザで地図データと標高を取って作る
      try {
        // 地図データと標高を同時に取得（標高が取れなくても地図は作る）
        const [json, dem] = await Promise.all([overpass(chunkQuery(chunkBox(cx, cy))), demFor(cx, cy).catch(() => null), luReady]);
        const g = rasterize(json.elements || [], cx, cy, dem && dem.h);
        saveChunk(k, g, dem && !dem.partial ? PX_DAYS : 1);   // 標高が欠けた区画は1日で取り直す
        chunks.set(k, { state: 'ok', g: BAKE || g.lu ? g : townify(g), pois: g.pois || [] }); nbrCache.clear();
      } catch (e) {
        chunks.set(k, { state: 'fail', t: Date.now() });
      }
      dirty = true;
    }
  } finally { pumping = false; }
}

async function overpass(query) {
  let last;
  for (const url of G.CFG.overpass) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), BAKE ? 200000 : 90000);
    try {
      const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      // Overpass は時間切れなどでも HTTP 200 で、remark に error を入れて途中までのデータを返すことがある
      if (json.remark && /error|runtime/i.test(json.remark)) throw new Error(json.remark);
      return json;
    } catch (e) { last = e; } finally { clearTimeout(timer); }
  }
  throw last || new Error('取得失敗');
}

/* ---------- 西尾市全体のドット絵マップ（せかいちず）：1マス＝100m ----------
 * ふだんは GitHub Actions で実際の地図データ（OpenStreetMap・地理院の標高）から作っておいた nishio-go/world.json を読む。
 * 読めないときだけ、ブラウザで地図データを取って作る（軽い問い合わせだけ）。
 * NSG_BAKE（tools/bake-world.js）のときは、田んぼ・茶畑・工場・公園なども取って細かく作る */
const BAKE = !!window.NSG_BAKE;
const WB = { s: 34.68, w: 136.86, n: 35.05, e: 137.43 }, WT = 100;   // 西尾市と となりの市町（岡崎・安城・碧南・幸田・蒲郡・高浜。region.js の範囲を含む）と、本店から15km（西は半田・武豊まで）
const WW = Math.ceil((WB.e - WB.w) * M_LNG / WT), WH = Math.ceil((WB.n - WB.s) * M_LAT / WT);
const llToW = (lat, lng) => ({ x: (lng - WB.w) * M_LNG / WT, y: (WB.n - lat) * M_LAT / WT });

/* ---------- あしあと（歩いた道を地図に残す） ----------
 * 歩いたマス（8m）を、区画（128×128マス）ごとのビット列で覚える。ゲームの記録とは別の localStorage（記録のかぎ＋_trail。大きくなるので）。
 * 歩く地図では歩いたマスに足あと、せかいちずでは歩いたマスのある100mのマスに色をつける。数えるのは歩いた分だけ（game.js の trackWalk から trailWalk）
 * 記録は「あるいて移動」と「操作して移動」で別（版ごとにも別） */
const TRAIL = { key: '', map: new Map(), world: new Set(), dirty: 0, timer: 0 };
const TRAIL_BYTES = CHUNK * CHUNK / 8;
function trailWorldAdd(tx, ty) { const ll = toLatLng(tx + 0.5, ty + 0.5), w = llToW(ll.lat, ll.lng), wx = Math.floor(w.x), wy = Math.floor(w.y); if (wx >= 0 && wy >= 0 && wx < WW && wy < WH) TRAIL.world.add(wy * WW + wx); }
function trailLoad() {
  const key = G.stateKey + '_trail';
  if (key === TRAIL.key) return;
  trailSave();
  TRAIL.key = key; TRAIL.map = new Map(); TRAIL.world = new Set();
  const raw = store.get(key) || {};
  for (const [k, b64] of Object.entries(raw)) {
    const m = /^(-?\d+)_(-?\d+)$/.exec(k);
    if (!m || typeof b64 !== 'string') continue;
    let bin;
    try { bin = atob(b64); } catch (e) { continue; }
    if (bin.length !== TRAIL_BYTES) continue;
    const a = new Uint8Array(TRAIL_BYTES);
    for (let i = 0; i < TRAIL_BYTES; i++) a[i] = bin.charCodeAt(i);
    TRAIL.map.set(k, a);
    const cx = +m[1], cy = +m[2];
    for (let i = 0; i < TRAIL_BYTES; i++) if (a[i]) for (let j = 0; j < 8; j++) if (a[i] & (1 << j)) { const n = i * 8 + j; trailWorldAdd(cx * CHUNK + n % CHUNK, cy * CHUNK + Math.floor(n / CHUNK)); }
  }
  dirty = true;
}
function trailSave() {
  clearTimeout(TRAIL.timer); TRAIL.timer = 0;
  if (!TRAIL.key || !TRAIL.dirty) return;
  const out = {};
  for (const [k, a] of TRAIL.map) { let bin = ''; for (let i = 0; i < a.length; i += 4096) bin += String.fromCharCode.apply(null, a.subarray(i, i + 4096)); out[k] = btoa(bin); }
  if (store.set(TRAIL.key, out)) { TRAIL.dirty = 0; return; }
  // 保存領域がいっぱい：読みなおせる地図の区画のとっておきを古いものから消して、もう一度（あしあとは消えると戻せないので先にとる）
  const idx = store.get(PX_IDX) || [];
  while (idx.length) {
    store.del(PX_KEY + idx.shift());
    if (store.set(TRAIL.key, out)) { store.set(PX_IDX, idx); TRAIL.dirty = 0; return; }
  }
  store.set(PX_IDX, idx);
  if (!TRAIL.warned) { TRAIL.warned = true; G.toast('このブラウザに あしあとを 保存できませんでした。スマホの 空きや、ブラウザの 設定（プライベート モード など）を 見てみてね。'); }
}
// 記録を消す（せってい）：いまのモードのあしあとを、保存したものごと消す
function trailClear() {
  trailLoad();
  clearTimeout(TRAIL.timer); TRAIL.timer = 0; TRAIL.dirty = 0;
  TRAIL.map = new Map(); TRAIL.world = new Set();
  store.del(TRAIL.key);
  dirty = true;
}
function trailHas(tx, ty) {
  const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK), a = TRAIL.map.get(cx + '_' + cy);
  if (!a) return false;
  const n = (ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK);
  return !!(a[n >> 3] & (1 << (n & 7)));
}
function trailSet(tx, ty) {   // はじめて歩いたマスなら true
  const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK), k = cx + '_' + cy;
  let a = TRAIL.map.get(k);
  if (!a) { a = new Uint8Array(TRAIL_BYTES); TRAIL.map.set(k, a); }
  const n = (ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK);
  if (a[n >> 3] & (1 << (n & 7))) return false;
  a[n >> 3] |= 1 << (n & 7);
  trailWorldAdd(tx, ty);
  return true;
}
// 2つの位置のあいだを歩いた：あいだのマスをぜんぶ足あとにして、はじめて歩いたマスの数を返す（GPS は数十mおきなので、線でつなぐ）
// each(x, y)：あいだのマスごとに呼ぶ（あるいて移動の生きもの。true を返したら、その回はもう呼ばない）
function trailWalk(lat1, lng1, lat2, lng2, each) {
  trailLoad();
  const a = toTile(lat1, lng1), b = toTile(lat2, lng2);
  let x = Math.floor(a.x), y = Math.floor(a.y);
  const x2 = Math.floor(b.x), y2 = Math.floor(b.y), dx = Math.abs(x2 - x), dy = -Math.abs(y2 - y), sx = x < x2 ? 1 : -1, sy = y < y2 ? 1 : -1;
  if (Math.hypot(dx, dy) > 80) return 0;   // 640m より遠い1歩は数えない（ワープ・GPS の飛び。ななめも まっすぐの距離で）
  let err = dx + dy, fresh = 0, stop = !each;
  for (;;) {
    if (trailSet(x, y)) fresh++;
    if (!stop && each(x, y)) stop = true;
    if (x === x2 && y === y2) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  if (fresh) {
    TRAIL.dirty += fresh; dirty = true;
    if (TRAIL.dirty >= 40) trailSave(); else if (!TRAIL.timer) TRAIL.timer = setTimeout(trailSave, 8000);
  }
  return fresh;
}
addEventListener('pagehide', trailSave);
document.addEventListener('visibilitychange', () => { if (document.hidden) trailSave(); });
// 足あとの絵：マスごとに向きと位置を少しずらした2つの足（地面の色に合わせて、明るい地面にはこげ茶・暗い地面には白っぽく）
const TRAIL_DARK = new Set([C.H, C.A, C.W, C.M, C.L, C.B]);
function drawFoot(code, tx, ty, X, Y, T) {
  const u = T / 16, h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0, ox = (h % 5) - 2, oy = ((h >>> 3) % 5) - 2, flip = (h >>> 6) & 1;
  ctx.fillStyle = TRAIL_DARK.has(code) ? 'rgba(255,248,230,.55)' : 'rgba(70,45,25,.5)';
  for (const [fx, fy] of flip ? [[5, 4], [9, 8]] : [[9, 4], [5, 8]]) {
    ctx.fillRect(X + Math.round((fx + ox) * u), Y + Math.round((fy + oy) * u), Math.ceil(2 * u), Math.ceil(3 * u));
    ctx.fillRect(X + Math.round((fx + ox) * u), Y + Math.round((fy + oy - 1.5) * u), Math.ceil(2 * u), Math.ceil(u));   // つま先
  }
}
const wToLL = (x, y) => ({ lat: WB.n - y * WT / M_LAT, lng: WB.w + x * WT / M_LNG });
// 名前の表の中身（川・町名）を変えたら番号を上げる。古い番号の保存分は消して、新しい地図を取り直してもらう
const WORLD_KEY = 'nsg_world8', WORLD_FILE = 'nishio-go/world.json';
for (let i = 1; i <= 7; i++) store.del('nsg_world' + i);
let world = null, worldPois = [], worldLabels = [], worldImg = null, worldState = 'none';   // none | building | ok | fail

// 引いて見るときの地図の色（ドット絵タイルの代表色。道は目立つように明るく）
const WCOL = { [C.G]: '#3f9b3c', [C.F]: PADDY_COL, [C.T]: '#d8ccaa', [C.W]: '#1f6528', [C.P]: '#55b650', [C.A]: '#2a62c9', [C.S]: '#e7cf8c',
  [C.B]: '#b4472f', [C.R]: '#f1e6c4', [C.H]: '#f6c34a', [C.L]: '#4a3a2a', [C.D]: '#c9a66b', [C.X]: '#0d1418', [C.M]: '#8d6e4f', [C.K]: '#6cc35a',
  [C.E]: '#2f7a34', [C.V]: '#9a6b3f', [C.I]: '#a3a8ab', [C.J]: '#e4dfd2', [C.Y]: '#4a9a46', [C.N]: '#dfe9ee', [C.U]: PADDY_COL, [C.Q]: '#c9a27a' };
function makeWorldImg() {
  worldNbr.clear();   // せかいちずが変わったら、つながる向きの絵を決め直す
  if (!world) return;
  const c = document.createElement('canvas');
  c.width = WW; c.height = WH;
  const x = c.getContext('2d'), img = x.createImageData(WW, WH);
  const rgb = {};
  for (const [k, v] of Object.entries(WCOL)) rgb[k] = [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
  for (let i = 0; i < world.length; i++) { const [r, g, b] = rgb[world[i]] || rgb[C.X]; img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255; }
  x.putImageData(img, 0, 0);
  worldImg = c;
}

// 地図データは、軽い「名前」の問い合わせと、範囲を4×4に分けた「線と面」の問い合わせに分けて取る
// （市全体を1回で取ると、無料の Overpass サーバーでは時間切れになるため）。届いた所から順に地図に反映する
const WSPLIT = BAKE ? 8 : 4;
function worldNamesQuery() {
  return `[out:json][timeout:60][bbox:${WB.s},${WB.w},${WB.n},${WB.e}];
node["place"~"^(city|town|village|suburb|quarter|neighbourhood|hamlet)$"]["name"];
out qt;
nwr["place"="island"]["name"];
out center qt;
node["railway"="station"]["name"];
out qt;
nwr["amenity"~"^(townhall|hospital|library|fire_station)$"];
out center qt;
nwr["shop"~"^(mall|department_store)$"];
out center qt;`;
}
function worldPartQuery(s, w, n, e) {
  const rich = BAKE ? `
  wr["natural"="water"];
  wr["natural"~"^(beach|sand|wetland|scrub)$"];
  wr["landuse"~"^(farmland|paddy|orchard|vineyard|plant_nursery|greenhouse_horticulture|meadow|grass|recreation_ground|cemetery|religious|aquaculture|salt_pond|reservoir|basin)$"];
  wr["leisure"~"^(park|golf_course|pitch|sports_centre|stadium|nature_reserve)$"];
  wr["amenity"~"^(school|university|college|hospital|place_of_worship|grave_yard)$"];` : '';
  return `[out:json][timeout:${BAKE ? 180 : 90}][bbox:${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)}];
(
  way["waterway"~"^(river|canal)$"];
  wr["natural"="water"]["water"~"^(river|lake|reservoir|pond|canal)$"];
  way["railway"="rail"];
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"];
  wr["natural"="wood"];
  wr["landuse"~"^(forest|residential|commercial|retail|industrial)$"];${rich}
);
out geom qt;`;
}
// 地名の大きさ。町名（quarter / neighbourhood / hamlet）は寄ったときだけ出す
// 名前の表は [x, y, 名前, 大きさ, 種類]。種類は st=駅、tw=町名、rv=川（古いデータで種類がなければ、大きさ1は駅）
const RANK = { city: 4, town: 3, island: 3, village: 2, suburb: 2, quarter: 1, neighbourhood: 1, hamlet: 1 };
const TOWN_PLACE = new Set(['quarter', 'neighbourhood', 'hamlet']);
function parseWorldNames(elements) {
  const wp = [], wl = [];
  for (const el of elements) {
    const tg = el.tags || {}, kind = poiKind(tg), c = elCenter(el), q = c && llToW(c.lat, c.lon);
    if (!q || q.x < 0 || q.y < 0 || q.x >= WW || q.y >= WH) continue;
    if (kind && WORLD_POI.has(kind)) wp.push([+q.x.toFixed(2), +q.y.toFixed(2), kind, String(tg.name || '').slice(0, 40)]);
    else if ((RANK[tg.place] || (tg.railway === 'station' && tg.station !== 'miniature')) && tg.name) {   // 遊園地の豆汽車の駅は除く
      let name = String(tg.name).slice(0, 12);
      const st = !tg.place && tg.railway === 'station';
      if (st && !name.endsWith('駅')) name += '駅';
      wl.push([+q.x.toFixed(2), +q.y.toFixed(2), name, RANK[tg.place] || 1, st ? 'st' : TOWN_PLACE.has(tg.place) ? 'tw' : undefined]);
    }
  }
  return [dedupePois(wp, 1.5), wl.filter((l, i) => !wl.slice(0, i).some(m => m[2] === l[2] && Math.hypot(m[0] - l[0], m[1] - l[1]) < 5))];
}
function addWorldFeatures(elements, L) {
  for (const el of elements) {
    let rings;
    if (el.type === 'way' && el.geometry) rings = [el.geometry];
    else if (el.type === 'relation' && el.members) rings = el.members.filter(m => m.type === 'way' && m.geometry).map(m => m.geometry);
    else continue;
    if (!rings.length || !rings[0].length) continue;
    const t = el.tags || {}, pts = rings.map(r => r.map(p => { const q = llToW(p.lat, p.lon); return [q.x, q.y]; }));
    if (t.waterway) {
      if (t.waterway === 'river') { L.lines.push([pts, C.A, 30]); if (t.name) addRiver(L, String(t.name).slice(0, 12), pts); }
    }   // 用水路（canal）は1マス100mだと町じゅうが水に見えるので描かない（幅のある水面は natural=water で描く）
    else if (t.railway) L.lines.push([pts, C.L, 40]);
    else if (t.highway) L.lines.push(/^(motorway|trunk|primary)/.test(t.highway) ? [pts, C.H, 42] : [pts, C.R, 41]);
    else {   // 面は歩く地図と同じ分け方（田んぼ・茶畑・工場・境内・墓地・公園…）。重なりは優先度の高いものを上に
      const k = classify(t, true);
      if (k && k.a && k.c !== C.B) L.areas.push([pts, k.c, k.p]);
    }
  }
}
// 区切った問い合わせの境目にかかる川は同じ線が何度も届くので、線の形（すべての点）がまったく同じものは1回だけ数える。
// 川のリレーションと、その中の線そのものの両方が届いたときも同じ形なので重ならない
function addRiver(L, name, pts) {
  const seen = L.riverSeen || (L.riverSeen = new Set());
  const keep = pts.filter(line => {
    const k = name + '|' + line.map(p => p[0].toFixed(3) + ',' + p[1].toFixed(3)).join(';');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (keep.length) (L.rivers = L.rivers || []).push([name, keep]);
}
// 川の名前：OSM では1本の川がいくつもの線に分かれていることが多いので、同じ名前でつながっている線を1本にしてから、
// 長い川には40マス（4km）ごとに名前を置く（短い川は出さない。同じ名前どうしは30マス以上はなす）
function joinLines(lines) {
  const eq = (a, b) => Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05;
  const out = lines.map(l => l.slice());
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++) for (let j = i + 1; j < out.length && !merged; j++) {
      const a = out[i], b = out[j];
      let m = null;
      if (eq(a[a.length - 1], b[0])) m = a.concat(b.slice(1));
      else if (eq(b[b.length - 1], a[0])) m = b.concat(a.slice(1));
      else if (eq(a[a.length - 1], b[b.length - 1])) m = a.concat(b.slice(0, -1).reverse());
      else if (eq(a[0], b[0])) m = a.slice().reverse().concat(b.slice(1));
      if (m) { out[i] = m; out.splice(j, 1); merged = true; }
    }
  }
  return out;
}
function riverLabels(L) {
  const byName = new Map();
  for (const [name, pts] of L.rivers || []) { if (!byName.has(name)) byName.set(name, []); byName.get(name).push(...pts); }
  const chains = [];
  for (const [name, lines] of byName) for (const line of joinLines(lines)) {
    let len = 0;
    for (let i = 1; i < line.length; i++) len += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    if (len >= 8) chains.push([name, line, len]);
  }
  chains.sort((a, b) => b[2] - a[2]);
  const at = (line, dist) => {
    for (let i = 1; i < line.length; i++) {
      const d = Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
      if (dist <= d) { const t = d ? dist / d : 0; return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t]; }
      dist -= d;
    }
    return line[line.length - 1];
  };
  const out = [];
  for (const [name, line, len] of chains) {
    const n = Math.max(1, Math.floor(len / 40));
    for (let k = 0; k < n; k++) {
      const [x, y] = at(line, (k + 0.5) * len / n);
      if (x < 0 || y < 0 || x >= WW || y >= WH) continue;
      if (out.some(l => l[2] === name && Math.hypot(l[0] - x, l[1] - y) < 30)) continue;
      out.push([+x.toFixed(2), +y.toFixed(2), name, 2, 'rv']);
    }
  }
  return out;
}
// 標高から作った下地（海・山・丘・平地=UNSET）に、地図データの面と線を重ねる
function combineWorld(base, L) {
  const g = base.slice(), ag = new Uint8Array(g.length).fill(UNSET);
  L.areas.slice().sort((a, b) => a[2] - b[2]).forEach(([pts, code]) => fillPoly(ag, pts, code, WW, WH));
  for (let i = 0; i < g.length; i++) {
    const c = g[i], a = ag[i];
    if (a === UNSET || c === C.M) continue;   // 山はそのまま
    g[i] = a;   // 海でも地図データで田畑・町なみなどがある所は陸（埋め立て地）。丘も土地利用で塗る
  }
  // 地図データで塗られていない所（と丘）は、土地利用（100mメッシュ＝せかいちずの1マスとほぼ同じ大きさ）で塗る
  if (LU) for (let i = 0; i < g.length; i++) {
    if (g[i] !== UNSET && g[i] !== C.K) continue;
    const q = wToLL(i % WW + 0.5, Math.floor(i / WW) + 0.5), u = luAt(q.lat, q.lng);
    const c = { a: C.F, b: C.V, c: C.W, e: C.T, h: C.T, f: C.T, g: C.T, l: C.P, j: C.S, k: C.A, i: C.A }[u];
    if (c !== undefined && !(g[i] === C.K && (c === C.A || c === C.T))) g[i] = c;
  }
  const keepSeaMt = new Set([C.A, C.M]), keepMt = new Set([C.M]);
  L.lines.slice().sort((a, b) => a[2] - b[2]).forEach(([pts, code]) => pts.forEach(line => strokeLine(g, line, code, 1, null, WW, WH, code === C.A ? keepMt : keepSeaMt)));
  for (let i = 0; i < g.length; i++) if (g[i] === UNSET) g[i] = C.G;
  return g;
}

let worldProgress = '';
async function buildWorld(force) {
  if (worldState === 'building' || worldState === 'enriching' || (worldState === 'ok' && !force)) return;
  if (BAKE) await luReady;   // 作るときは土地利用の表を待つ
  worldState = 'building';
  // 1) 用意しておいた地図（実際の地図データから作ったもの）をいつも先に見る。作り直されたら（土地利用の更新など）すぐ新しい地図に。
  //    変わっていなければブラウザの HTTP キャッシュの確かめだけで軽い
  if (!BAKE) {
    try {
      const r = await fetch(WORLD_FILE, { cache: 'no-cache' });
      const b = r.ok ? await r.json() : null;
      if (b && b.w === WW && b.h === WH && typeof b.d === 'string' && b.d.length === WW * WH) {
        world = dec(b.d); worldPois = b.p || []; worldLabels = b.l || []; makeWorldImg(); worldState = 'ok';
        // 名前の表が古い形（川・町名の種類がない）なら、作り直しが届くまでの仮として1日だけ保存する
        const days = worldLabels.some(l => l[4]) ? 7 : 1;
        if (!store.set(WORLD_KEY, { t: Date.now(), w: WW, h: WH, d: b.d, p: worldPois, l: worldLabels, days })) store.del(WORLD_KEY);
        return;
      }
    } catch (e) { /* 取れなければ（オフラインなど）端末に保存した地図か、ブラウザで作る */ }
  }
  // 2) 端末に保存した地図（用意した地図が取れないときと、ブラウザで作った地図）
  const saved = !force && store.get(WORLD_KEY);
  if (saved && saved.w === WW && saved.h === WH && saved.d && saved.d.length === WW * WH && Date.now() - saved.t < (saved.days || PX_DAYS) * 864e5) {
    world = dec(saved.d); worldPois = saved.p || []; worldLabels = saved.l || []; makeWorldImg(); worldState = 'ok'; return;
  }
  try {
    const N = WW * WH, base = new Uint8Array(N).fill(UNSET);
    // 1) 標高（ズーム12＝約31m）から海・平地・丘・山。1マスに5点ずつ調べる
    const DZ = 12, PTS = [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]];
    const keys = new Array(N * 5), offs = new Int32Array(N * 5), need = new Map();
    for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) PTS.forEach(([dx, dy], s) => {
      const ll = wToLL(x + dx, y + dy), m = merc(ll.lat, ll.lng, DZ), tx = Math.floor(m.x / 256), ty = Math.floor(m.y / 256);
      const k = tx + '/' + ty, i = (y * WW + x) * 5 + s;
      keys[i] = k; offs[i] = Math.min(255, Math.floor(m.x - tx * 256)) + Math.min(255, Math.floor(m.y - ty * 256)) * 256;
      need.set(k, [tx, ty]);
    });
    const got = new Map();
    await Promise.all([...need].map(async ([k, [tx, ty]]) => got.set(k, await demTile(tx, ty, DZ).catch(() => null))));
    const partial = [...got.values()].some(t => t === null);
    for (let i = 0; i < N; i++) {
      let na = 0, sum = 0, n = 0;
      for (let s = 0; s < 5; s++) {
        const t = got.get(keys[i * 5 + s]);
        if (!t) continue;
        const v = t === 'sea' ? NaN : t[offs[i * 5 + s]];
        if (Number.isNaN(v)) na++; else if (v > UNK) { sum += v; n++; }
      }
      // この縮尺では海岸線を使えないので、標高データのない所を海とみなす（街の詳しい地図は海岸線で判定）
      if (na >= 3) base[i] = C.A;
      else if (n) { const h = sum / n; base[i] = h >= MOUNTAIN_M ? C.M : h >= HILL_M ? C.K : UNSET; }
    }
    const L = { areas: [], lines: [] };
    world = combineWorld(base, L); makeWorldImg();
    worldState = 'enriching';   // まず地形を見せて、地図データは届いた所から足していく
    // 2) 地名・駅名・大きな建物（軽い）
    let namesOk = true;
    for (let tries = BAKE ? 5 : 1, k = 1; k <= tries; k++) {
      try { [worldPois, worldLabels] = parseWorldNames((await overpass(worldNamesQuery())).elements || []); namesOk = true; break; } catch (e) {
        namesOk = false;
        if (BAKE) console.log(`[bake] names try ${k} failed: ${e.message}`);
        if (k < tries) await new Promise(r => setTimeout(r, 30000 * k));
      }
    }
    // 3) 川・道・線路・森・町なみ（4×4に分けて、自分のいる所から近い順に）
    const here = G.me ? llToW(G.me.lat, G.me.lng) : llToW(34.825, 137.07);
    const parts = [];
    for (let j = 0; j < WSPLIT; j++) for (let i = 0; i < WSPLIT; i++) parts.push([i, j]);
    parts.sort((a, b) => Math.hypot((a[0] + 0.5) * WW / WSPLIT - here.x, (a[1] + 0.5) * WH / WSPLIT - here.y) - Math.hypot((b[0] + 0.5) * WW / WSPLIT - here.x, (b[1] + 0.5) * WH / WSPLIT - here.y));
    let ok = 0, done = 0;
    for (const [i, j] of parts) {
      worldProgress = `ちずを くわしくしています… ${done}/${parts.length}`;
      const w = WB.w + (WB.e - WB.w) * i / WSPLIT, e = WB.w + (WB.e - WB.w) * (i + 1) / WSPLIT;
      const n = WB.n - (WB.n - WB.s) * j / WSPLIT, s = WB.n - (WB.n - WB.s) * (j + 1) / WSPLIT;
      // 作るとき（NSG_BAKE）は、混んでいて断られても少し待って取り直す
      for (let tries = BAKE ? 5 : 1, k = 1; k <= tries; k++) {
        const t0 = Date.now();
        try {
          const els = (await overpass(worldPartQuery(s, w, n, e))).elements || [];
          addWorldFeatures(els, L);
          ok++;
          world = combineWorld(base, L); makeWorldImg();
          if (BAKE) console.log(`[bake] part ${i},${j}: ${els.length} elements, ${Math.round((Date.now() - t0) / 1000)}s`);
          break;
        } catch (e2) {   // ふだんは、この区域は地形だけ
          if (BAKE) console.log(`[bake] part ${i},${j} try ${k} failed after ${Math.round((Date.now() - t0) / 1000)}s: ${e2.message}`);
          if (k < tries) await new Promise(r => setTimeout(r, 30000 * k));
        }
      }
      done++;
    }
    worldProgress = '';
    worldLabels = worldLabels.concat(riverLabels(L));
    worldState = 'ok';
    const days = partial || !namesOk || ok < parts.length ? 1 : PX_DAYS;   // 欠けたら1日で作り直す
    if (!store.set(WORLD_KEY, { t: Date.now(), w: WW, h: WH, d: encode(world), p: worldPois, l: worldLabels, days })) store.del(WORLD_KEY);
  } catch (e) {
    worldProgress = '';
    worldState = world ? 'ok' : 'fail';
  }
}

/* ---------- ドット絵 ---------- */
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeTile(draw, seed, frame) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const x = c.getContext('2d');
  const px = (col, a, b, w = 1, h = 1) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
  draw(px, rng(seed), frame || 0);
  return c;
}
const speckle = (px, r, base, dots, n) => { px(base, 0, 0, 16, 16); for (let i = 0; i < n; i++) px(dots[(r() * dots.length) | 0], (r() * 16) | 0, (r() * 16) | 0); };
const grassBase = (px, r) => {
  speckle(px, r, '#3f9b3c', ['#2f7f2e', '#56b552'], 10);
  for (let i = 0; i < 3; i++) { const a = (r() * 13) | 0, b = 3 + ((r() * 11) | 0); px('#2a6f29', a, b); px('#2a6f29', a + 2, b); px('#2a6f29', a + 1, b - 1); }
};
// 田畑のマス：こよみの田んぼのようす（PADDY_TILE）で描き分ける
function paddyArt(px, r) {
  if (PADDY_TILE === 'gold') {            // 稲刈りのころ：黄金色の稲穂
    px('#cfae4a', 0, 0, 16, 16);
    for (let y = 1; y < 16; y += 4) { px('#b08a2a', 0, y, 16, 2); for (let x = (r() * 3) | 0; x < 16; x += 3) px('#f2d36b', x, y - 1); }
  } else if (PADDY_TILE === 'flooded') {  // 田植えのころ：水をはった田に小さな苗
    px('#8fbfd8', 0, 0, 16, 16);
    for (let i = 0; i < 3; i++) px('#cfe9f7', (r() * 13) | 0, (r() * 15) | 0, 3, 1);
    for (let y = 2; y < 16; y += 4) for (let x = 1 + ((y / 4) % 2); x < 16; x += 4) px('#4f9a35', x, y, 1, 2);
  } else if (PADDY_TILE === 'soil') {     // 田おこしのころ：たがやした土
    px('#8a6a44', 0, 0, 16, 16);
    for (let y = 2; y < 16; y += 4) px('#6e5233', 0, y, 16, 1);
    for (let i = 0; i < 6; i++) px('#a3815a', (r() * 15) | 0, (r() * 15) | 0, 2, 1);
  } else if (PADDY_TILE === 'stubble') {  // 刈田：稲の株とわら
    px('#a89a6a', 0, 0, 16, 16);
    for (let y = 2; y < 16; y += 4) for (let x = 1 + ((y / 4) % 2) * 2; x < 16; x += 4) { px('#7d6f48', x, y, 1, 2); px('#cdbf8e', x + 1, y); }
    for (let i = 0; i < 2; i++) px('#dccc96', (r() * 12) | 0, (r() * 15) | 0, 4, 1);
  } else {                                // 青田：緑の稲の列
    px('#86b54c', 0, 0, 16, 16);
    for (let y = 1; y < 16; y += 4) { px('#6a9a36', 0, y, 16, 2); for (let x = (r() * 3) | 0; x < 16; x += 4) px('#a3cc66', x, y - 1); }
  }
  px('#7a6a46', 0, 15, 16, 1);
}
const TILE_ART = {
  [C.G]: grassBase,
  [C.F]: (px, r) => { paddyArt(px, r); px('#6b5a3a', 15, 0, 1, 16); },   // 田んぼ（あぜ道つき）
  [C.U]: (px, r) => paddyArt(px, r),   // 農地（作物不明）：西尾では多くが田んぼなので、こよみの田んぼのようすで描く
  [C.V]: (px, r) => {            // 畑
    px('#9a6b3f', 0, 0, 16, 16);
    for (let y = 2; y < 16; y += 4) { px('#7a512c', 0, y + 1, 16, 1); for (let x = (r() * 3) | 0; x < 16; x += 3) px('#6ab04c', x, y, 1, 1); }
  },
  [C.E]: (px) => {               // 茶畑（丸く刈り込んだ茶の木の列）
    px('#7a5a3a', 0, 0, 16, 16);
    for (const y of [1, 9]) { px('#2f7a34', 1, y, 14, 6); px('#2f7a34', 0, y + 1, 16, 4); px('#56a64a', 2, y, 12, 1); px('#1f5a25', 1, y + 5, 14, 1); px('#78c060', 4, y + 1, 2, 1); px('#78c060', 10, y + 1, 2, 1); }
  },
  [C.N]: (px) => {               // ビニールハウス
    px('#dfe9ee', 0, 0, 16, 16);
    for (let x = 0; x < 16; x += 4) px('#b3c4cd', x, 0, 1, 16);
    px('#ffffff', 1, 1, 14, 1); px('#8fa3ad', 0, 15, 16, 1);
  },
  [C.I]: (px, r) => { speckle(px, r, '#9aa0a3', ['#8b9194', '#a9afb2'], 10); px('#80868a', 0, 7, 16, 1); px('#80868a', 7, 0, 1, 16); },   // 工場の敷地
  [C.J]: (px, r) => speckle(px, r, '#e4dfd2', ['#c9c2b0', '#f2eee4', '#b9b19d'], 30),   // 境内の砂利
  [C.Y]: (px, r) => {            // 墓地
    speckle(px, r, '#4a9a46', ['#3d863a'], 8);
    for (const [a, b] of [[2, 3], [9, 2], [5, 9], [11, 10]]) { px('#a5a5a5', a, b, 3, 4); px('#d0d0d0', a, b, 3, 1); px('#5f5f5f', a, b + 4, 3, 1); }
  },
  [C.K]: (px, r) => {            // 丘
    grassBase(px, r);
    for (let y = 5; y <= 13; y++) { const w = Math.round(Math.sqrt(1 - ((y - 13) / 8) ** 2) * 7); px('#5fb853', 8 - w, y, w * 2, 1); }
    px('#7fd06e', 5, 7, 4, 1); px('#7fd06e', 4, 8, 2, 1);
    for (let y = 5; y <= 13; y++) { const w = Math.round(Math.sqrt(1 - ((y - 13) / 8) ** 2) * 7); px('#2a6f29', 8 - w - 1, y, 1, 1); px('#2a6f29', 8 + w, y, 1, 1); }
    px('#2a6f29', 1, 14, 14, 1);
  },
  [C.M]: (px, r) => {            // 山
    grassBase(px, r);
    for (let y = 2; y <= 14; y++) {
      const hw = Math.round((y - 2) * 7 / 12);
      px('#b08a62', 8 - hw, y, hw, 1); px('#7a5c40', 8, y, hw + 1, 1);
      px('#3a2a1a', 8 - hw - 1, y, 1, 1); px('#3a2a1a', 8 + hw + 1, y, 1, 1);
    }
    px('#3a2a1a', 7, 1, 2, 1); px('#d8c3a5', 7, 3, 1, 2); px('#3a2a1a', 1, 15, 15, 1);
  },
  [C.T]: (px, r) => speckle(px, r, '#cdbf9e', ['#b8aa88', '#ddd1b4'], 14),   // 町なかの地面
  [C.W]: (px, r) => {            // 森
    grassBase(px, r);
    const ox = ((r() * 3) | 0) - 1;
    // 紅葉のころ（11月〜12月上旬）は、木の葉の色が赤・だいだい・黄色まじりになる
    const [leaf, hi] = KOYO ? [['#c8641e', '#e08a3a'], ['#b03a24', '#d0563c'], ['#c99a1e', '#e6c040'], ['#1d5e26', '#2e8a38']][(r() * 4) | 0] : ['#1d5e26', '#2e8a38'];
    px('#5b3a1e', 7 + ox, 11, 2, 4);
    px(leaf, 3 + ox, 3, 10, 8); px(leaf, 4 + ox, 2, 8, 10); px(leaf, 2 + ox, 5, 12, 4);
    px(hi, 5 + ox, 3, 4, 3); px(hi, 4 + ox, 5, 2, 2);
    px('#123f19', 4 + ox, 10, 8, 1);
  },
  [C.P]: (px, r) => {            // 公園・芝生
    speckle(px, r, '#4fb24b', ['#45a242', '#66c461'], 12);
    const cols = ['#ff8fb1', '#fff176', '#ffffff'];
    for (let i = 0; i < 3; i++) { const a = 1 + ((r() * 13) | 0), b = 1 + ((r() * 13) | 0); px(cols[i % 3], a, b); px('#2f8f2c', a, b + 1); }
    if (SAKURA && r() < 0.6) {   // 桜のころは、公園に桜の木
      const a = 3 + ((r() * 6) | 0), b = 2 + ((r() * 4) | 0);
      px('#6b4a2e', a + 3, b + 6, 2, 4); px('#f7b6cc', a, b, 8, 6); px('#f7b6cc', a + 1, b - 1, 6, 8); px('#fde0ea', a + 2, b + 1, 3, 2); px('#e48aa8', a + 1, b + 6, 6, 1);
    }
  },
  [C.A]: (px, r, f) => {         // 水（2コマで波が動く）
    px('#2a62c9', 0, 0, 16, 16);
    for (let i = 0; i < 4; i++) {
      const a = ((r() * 12) | 0) + (f ? 2 : 0), b = 2 + i * 4 + ((r() * 2) | 0);
      px('#6fa3ff', a % 14, b, 3, 1); px('#6fa3ff', (a + 3) % 14, b - 1, 2, 1);
    }
  },
  [C.S]: (px, r) => speckle(px, r, '#e7cf8c', ['#d2b56a', '#f3e2ae'], 16),
  [C.B]: (px, r) => {            // 屋根
    const roofs = [['#b4472f', '#8c3320', '#d06a4f'], ['#5d6c8c', '#45516b', '#7b8bad'], ['#8a5a3c', '#6b432b', '#a7774f'], ['#7f8a87', '#636c69', '#a0aaa7']];
    const [m, d, h] = roofs[(r() * roofs.length) | 0];
    px(m, 0, 0, 16, 16);
    for (let y = 3; y < 16; y += 4) px(d, 0, y, 16, 1);
    for (let y = 0; y < 16; y += 4) for (let x = (y / 4 % 2) * 4; x < 16; x += 8) px(d, x, y, 1, 3);
    px(h, 0, 0, 16, 1); px('#3a2a20', 0, 15, 16, 1);
  },
  [C.R]: (px, r) => speckle(px, r, '#a9a9a4', ['#989893', '#b9b9b4'], 10),   // 道（アスファルト）
  [C.H]: (px, r) => { speckle(px, r, '#7e7e7c', ['#6e6e6c', '#8e8e8c'], 12); },   // 大きな道（白線と黄色の線は frame で描く）
  [C.Q]: (px, r) => {            // 住宅地の家（瓦屋根・壁・戸口と、庭の木）
    speckle(px, r, '#cdbf9e', ['#b8aa88', '#ddd1b4'], 8);
    const roofs = [['#4f5763', '#3c434d', '#6b7480'], ['#8c3d2a', '#6e2e1f', '#a85a44'], ['#5d6c8c', '#45516b', '#7b8bad'], ['#6b5a4a', '#524436', '#86735f'], ['#3f4a44', '#2f3833', '#5a665f'], ['#9a8f84', '#7d746a', '#b3aa9f']];
    const [m, d, h] = roofs[(r() * roofs.length) | 0], ox = (r() * 2) | 0, oy = (r() * 2) | 0;
    px('#2a2420', 1 + ox, 1 + oy, 13, 12);
    px(m, 2 + ox, 2 + oy, 11, 6); px(h, 2 + ox, 2 + oy, 11, 1); px(d, 2 + ox, 5 + oy, 11, 1);
    px('#efe6d2', 2 + ox, 8 + oy, 11, 4); px('#5c4030', 7 + ox, 9 + oy, 2, 3); px('#86b8e0', 3 + ox, 9 + oy, 2, 1); px('#86b8e0', 10 + ox, 9 + oy, 2, 1);
    if (r() < 0.6) { px('#2e8a38', 13, 12, 3, 3); px('#56b552', 13, 12, 1, 1); }
  },
  [C.L]: (px) => { px('#8a7f72', 0, 0, 16, 16); for (let y = 1; y < 16; y += 4) px('#5a4632', 1, y, 14, 2); px('#d0d0d0', 4, 0, 1, 16); px('#d0d0d0', 11, 0, 1, 16); },
  [C.D]: (px, r) => speckle(px, r, '#c9a66b', ['#b08a50', '#dcbd88'], 12),
  [C.X]: (px, r, f) => { px('#0d1418', 0, 0, 16, 16); px('#1a252b', (f * 8) % 16, 7, 2, 2); },
};
const SHADE = ['rgba(0,0,0,.32)', 'rgba(0,0,0,.16)', '', 'rgba(255,250,220,.12)', 'rgba(255,250,220,.24)'];
const tiles = {};   // code → [variant][frame]
function buildTiles(codes) {
  for (const [code, draw] of Object.entries(TILE_ART)) {
    if (codes && !codes.includes(+code)) continue;
    tiles[code] = (+code === C.Q ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1, 2]).map(v => [makeTile(draw, code * 97 + v * 31 + 7, 0), makeTile(draw, code * 97 + v * 31 + 7, 1)]);
  }
}
buildTiles();
/* ---------- Blender で描いた地図の家と木（tools/blender/maptiles.py → nishio-go/maptiles/ のシート） ----------
   家：50の立体 × 屋根の色10 × 壁の色5 ＝ 2500通りを季節ごとに（4季節で1万マス）。場所ごとにちがう家になる
   木（森のマス）：10の立体 × 葉の色3。2コマで、風で葉がゆれる。シートが読めないあいだは、上の描き方のまま
   公園・ビニールハウス・墓地・工場の敷地・丘・山：6つの立体 × 色5 ＝ 30通りずつ（misc シートの行の順）
   茶畑・畑・砂浜・境内の砂利・草地：12通りずつ（field シート）
   田んぼ：こよみの田んぼのようすごとに9通り。青田と黄金色の稲は2コマで風にゆれる。となりのマスとすきまなくつながる */
const MT = { s: -1, p: '', house: null, tree: null, misc: null, field: null, town: null, water: null, waterReq: false, sprites: null, spriteReq: false, roofs: null, roofReq: false, paddyU: null, paddyF: null };
const MISC_ROWS = [C.P, C.N, C.Y, C.I, C.K, C.M];
const FIELD_ROWS = [C.E, C.V, C.S, C.J, C.G];   // field シート：茶畑・畑・砂浜・境内の砂利・草地（12通りずつ。草地は2コマで草がゆれる）
function mapSeason() {   // 0 桜のころ・1 ふだん（緑）・2 紅葉のころ・3 冬（12月〜2月）。こよみ（season.js）の見ごろに合わせる
  if (KOYO) return 2;
  if (SAKURA) return 0;
  const m = new Date().getMonth() + 1;
  return m === 12 || m <= 2 ? 3 : 1;
}
function sliceSheet(img, cols, rows) {   // 16×16 の canvas に切り分ける（ほかのマスと同じ形）
  const out = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    c.getContext('2d').drawImage(img, x * 16, y * 16, 16, 16, 0, 0, 16, 16);
    out.push(c);
  }
  return out;
}
function applyMapTiles() {
  if (MT.house) tiles[C.Q] = MT.house;
  if (MT.tree) tiles[C.W] = MT.tree;
  if (MT.misc) MISC_ROWS.forEach((code, i) => { tiles[code] = MT.misc[i]; });
  if (MT.field) FIELD_ROWS.forEach((code, i) => { tiles[code] = MT.field[i]; });
  if (MT.water) tiles[C.A] = MT.water;
  if (MT.town) tiles[C.T] = MT.town;
  if (MT.roofs) tiles[C.B] = MT.roofs;
  if (MT.sprites) {   // 軽トラ（上・右・下・左）と、地図のたからばこ
    ['up', 'right', 'down', 'left'].forEach((d, i) => { carSprites[d] = MT.sprites[i]; });
    if (spotSprites.treasure) spotSprites.treasure[0] = MT.sprites[4];
  }
  if (MT.paddyU) { tiles[C.U] = MT.paddyU; tiles[C.F] = MT.paddyF; }
  dirty = true;
}
function loadMapTiles() {
  const get = (file, ok, fn) => {
    const img = new Image();
    img.onload = () => { if (ok()) { fn(img); applyMapTiles(); } };
    img.onerror = () => { if (ok()) setTimeout(() => { if (ok()) get(file, ok, fn); }, 15000); };   // 読めなければ、しばらくしてもう一度
    img.src = `nishio-go/maptiles/${file}.png`;
  };
  const s = mapSeason(), pt = PADDY_TILE;
  if (s !== MT.s) {
    MT.s = s;
    const ok = () => MT.s === s;
    get(`house-${s}`, ok, img => { MT.house = sliceSheet(img, 50, 50).map(c => [c, c]); });
    get(`tree-${s}`, ok, img => { const a = sliceSheet(img, 30, 2); MT.tree = a.slice(0, 30).map((c, i) => [c, a[30 + i]]); });
    get(`misc-${s}`, ok, img => { const a = sliceSheet(img, 30, MISC_ROWS.length); MT.misc = MISC_ROWS.map((_, r) => a.slice(r * 30, r * 30 + 30).map(c => [c, c])); });
    get(`town-${s}`, ok, img => {   // 町なかの地面：小物（マンホール・植木鉢・自販機・電柱・自転車）は8マスに1つくらい
      const a = sliceSheet(img, 12, 1).map(c => [c, c]), plain = a.slice(0, 2), deco = a.slice(2);
      MT.town = [...Array(35).fill(plain).flat(), ...deco];
    });
    get(`field-${s}`, ok, img => { const a = sliceSheet(img, 12, FIELD_ROWS.length * 2); MT.field = FIELD_ROWS.map((_, r) => a.slice(r * 24, r * 24 + 12).map((c, i) => [c, a[r * 24 + 12 + i]])); });
  }
  if (!MT.roofReq) {   // 建物の屋根（瓦・金属・陸屋根。季節で変わらないので1回だけ）
    MT.roofReq = true;
    get('roofs', () => true, img => { MT.roofs = sliceSheet(img, 32, 1).map(c => [c, c]); });
  }
  if (!MT.spriteReq) {   // 地図の上を動くもの（Blender の軽トラ・たからばこ）
    MT.spriteReq = true;
    get('sprites', () => true, img => { MT.sprites = sliceSheet(img, 6, 1); });
  }
  if (!MT.railReq) {   // 線路（Blender の枕木・レール・バラスト。つながる向きの絵41枚（rail.png。railIndex）。季節で変わらない）
    MT.railReq = true;
    get('rail', () => true, img => { MT.rail = sliceSheet(img, 41, 1); });
  }
  if (!MT.roadReq) {   // 道（Blender のアスファルト・縁石・側溝・白線、小道の土と草のへり。roadIndex。季節で変わらない）
    MT.roadReq = true;
    get('road', () => true, img => { const a = sliceSheet(img, 32, 3); MT.road = [0, 1, 2].map(r => a.slice(r * 32, r * 32 + 32)); });
    get('rankan', () => true, img => { MT.rankan = sliceSheet(img, 4, 1); });
    get('kawakado', () => true, img => { const a = sliceSheet(img, 4, 3); MT.kawakado = [a.slice(0, 4), a.slice(4, 8), a.slice(8, 12)]; });
    get('kado', () => true, img => { const a = sliceSheet(img, 4, 3); MT.kado = [0, 1, 2].map(r => a.slice(r * 4, r * 4 + 4)); });
    get('facade', () => true, img => { const a = sliceSheet(img, 6, 5); MT.facade = [0, 1, 2, 3, 4].map(r => a.slice(r * 6, r * 6 + 6)); });   // 建物の前の壁（drawWall）
  }
  if (!MT.shoreReq) {   // 水べ（Blender の護岸・草の土手・浜の浅瀬と波。shoreIndex。季節で変わらない）
    MT.shoreReq = true;
    get('shore', () => true, img => { const a = sliceSheet(img, 32, 3); MT.shore = [0, 1, 2].map(r => a.slice(r * 32, r * 32 + 32)); });
  }
  if (!MT.vehReq) {   // 町を走る乗り物（Blender の赤い電車の先頭・なか、漁船、乗用車5色。4方向ずつ）
    MT.vehReq = true;
    get('vehicles', () => true, img => {
      const a = sliceSheet(img, 4, 8), row = r => a.slice(r * 4, r * 4 + 4);
      MT.veh = { train: [row(0), row(1)], boat: row(2), car: [3, 4, 5, 6, 7].map(row) };
    });
  }
  if (!MT.waterReq) {   // 水（さざ波が2コマで動く）。季節で変わらないので1回だけ
    MT.waterReq = true;
    get('water', () => true, img => { const a = sliceSheet(img, 3, 2); MT.water = a.slice(0, 3).map((c, i) => [c, a[3 + i]]); });
  }
  if (pt !== MT.p) {   // 田んぼは、こよみの田んぼのようす（青田・黄金色・田植え・田おこし・刈田）ごとのシート
    MT.p = pt;
    get(`paddy-${pt}`, () => MT.p === pt, img => {
      const a = sliceSheet(img, 9, 4);
      MT.paddyU = a.slice(0, 9).map((c, i) => [c, a[9 + i]]);
      MT.paddyF = a.slice(18, 27).map((c, i) => [c, a[27 + i]]);
    });
  }
}
loadMapTiles();
/* ---------- 地図の小物（tools/blender/deco.py → nishio-go/deco/ のシート。題材130、ちがう絵で99840枚） ----------
   生きもの・道ばたの物・水辺や浜の物・西尾らしい物（茶つみ・うなぎ池の水車・大ちょうちん・赤馬・海苔ひび・カーネーション・野点 など）を、
   マスの種類に合わせて、ところどころに置く（場所ごとに決まった物・向き・色）
   季節（春・夏・秋・冬のシート）と月（ひまわりは夏、コスモスは秋 など）で、置く物が変わる。生きものは2つのポーズで少し動く */
const DECO = { img: null, s: -1, idx: null, cols: 96, m: new Date().getMonth() + 1 };   // m：いまの月（refreshSeason で1分ごとに確かめる）
const DECO_PLACE = {   // マスの種類 → 何マスに1つ置くか と、置く物（名前@月-月 は、その月だけ。名前#rain は、いま雨のときだけ）
  [C.G]: [12, ['kotori', 'karasu', 'neko', 'inu', 'choucho@4-10', 'jizo', 'hokora', 'douhyou', 'hana@3-10', 'ajisai@6-7', 'himawari@7-8', 'kosumosu@9-10',
    'kinoko@6-11', 'iwa', 'kaki@10-11', 'tako@1-1', 'sakura@3-4', 'momiji@11-12', 'tsukimi@9-9', 'kiji', 'usagi', 'tsubame@4-7', 'hotaru@6-6', 'sanpo', 'jogger',
    'mujin', 'sudebako', 'tanukiy', 'kasahito#rain', 'kitsune', 'tonbi', 'mogura', 'nanohana@3-4', 'higanbana@9-9', 'ume@2-3', 'ichou@11-11',
    'susuki@9-11', 'mushitori@7-8', 'tsukushi@3-4', 'hanami@4-4', 'semi@7-8', 'kabutomushi@7-8']],
  [C.P]: [12, ['kotori', 'karasu', 'hana@3-10', 'choucho@4-10', 'tsubame@4-7', 'kiji', 'usagi', 'tonbi']],   // 芝生のマスは公園のほか湿地・運動場・ゴルフ場も同じなので、どこにいてもおかしくない物だけ
  [C.T]: [11, ['neko', 'neko', 'inu', 'jitensha', 'jihanki', 'ueki', 'gomi', 'tanuki', 'chouchin', 'kodomo', 'sanrinsha', 'bench', 'karasu', 'kotori',
    'akauma', 'unaginobori', 'nodate', 'daichouchin@8-8', 'yatai@7-7', 'koinobori@4-5', 'kadomatsu@1-1', 'tsukimi@9-9',
    'monohoshi', 'fuusen', 'basutei', 'bonsai', 'sanpo', 'jogger', 'tsubame@4-7',
    'keicar', 'keicar', 'scooter', 'cyclist', 'cart', 'randoseru', 'onigokko', 'kasahito#rain', 'kasahito#rain', 'kasahito#rain',
    'tanabata@7-7', 'bonodori@8-8', 'xmas@12-12', 'halloween@10-10', 'yakiimo@11-2', 'kakigori@7-8', 'cone', 'takuhai', 'yukata@7-8', 'kingyo@7-8']],
  [C.A]: [28, ['kamo', 'kamo', 'fune', 'boto', 'bui', 'hasu@6-9', 'kamome', 'suisha', 'norihibi@11-3', 'kame@4-10', 'koi', 'hakuchou@12-2', 'yacht',
    'kayak@5-10', 'swanboat', 'jetski@6-9']],
  [C.S]: [9, ['kamome', 'kani', 'sunashiro@4-10', 'kasa@7-8', 'tsuri', 'boto', 'kame@4-10', 'suika@7-8', 'tetrapod', 'beachball@6-9', 'surfer', 'kaigara@4-9']],
  [C.N]: [8, ['carnation']],
  [C.W]: [14, ['kinoko@6-11', 'kotori', 'iwa', 'hokora', 'jizo', 'fukurou', 'risu', 'usagi', 'hiker', 'tanukiy', 'itachi', 'sudebako', 'kitsune',
    'semi@7-8', 'kabutomushi@7-8', 'tonbi']],
  [C.J]: [10, ['tourou', 'jizo', 'hokora', 'neko', 'komainu', 'ema', 'omikuji']],
  [C.E]: [16, ['noufu', 'kotori', 'chatsumi@4-6', 'kiji', 'hachibako']],
  [C.V]: [12, ['noufu', 'kakashi', 'karasu', 'kotori', 'choucho@4-10', 'hachibako', 'kiji', 'mujin', 'hatakehito', 'sprinkler@5-9', 'niwatori', 'ushi', 'mogura']],
};
const DECO_PADDY = {   // 田んぼは、こよみの田んぼのようすで置く物を変える
  flooded: ['sagi', 'sagi', 'kamo', 'kaeru', 'karasu', 'suimon', 'tsubame@4-7', 'taue@5-6', 'taue@5-6', 'zarigani@5-9'], green: ['sagi', 'kaeru', 'kakashi', 'noufu', 'karasu', 'choucho', 'suimon', 'tsubame@4-7'],
  gold: ['kakashi', 'kakashi', 'karasu', 'kotori', 'noufu', 'sagi', 'combine', 'inekari', 'tonbi'],
  stubble: ['hazakake', 'warazuka', 'warazuka', 'karasu', 'sagi', 'kotori', 'tonbi'],
  soil: ['sagi', 'karasu', 'noufu', 'kotori', 'suimon', 'tractor', 'tractor', 'kiji'],
};
const DECO_ANIM = new Set(['sagi', 'kotori', 'kamo', 'kamome', 'neko', 'inu', 'kaeru', 'choucho', 'karasu', 'noufu', 'kodomo', 'tsuri', 'kiji', 'tsubame', 'usagi',
  'hotaru', 'koi', 'hakuchou', 'jogger', 'sanpo', 'risu', 'fukurou', 'cyclist', 'cart', 'randoseru', 'onigokko', 'tanukiy', 'itachi', 'kasahito', 'hiker', 'hatakehito',
  'kitsune', 'tonbi', 'niwatori', 'ushi', 'zarigani', 'taue', 'inekari', 'mushitori', 'yukata']);
// 水のマスは海も川も池も同じ種類なので、置く物で場所をえらぶ：池のもの（鯉・水車・はす・白鳥のボート）は岸が2マス以内にある水だけ、
// ヨット・漁船・水上バイクは岸が1マス以内にない（細い川ではない）水だけ。沖に水車、小川にヨット、とちぐはぐにならないように
const DECO_POND = new Set(['koi', 'suisha', 'hasu', 'swanboat']), DECO_OPEN = new Set(['yacht', 'fune', 'jetski']);
const landNear = (tx, ty, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const c = codeAt(tx + dx, ty + dy); if (c !== C.A && c !== C.X) return true; } return false; };
const decoSeason = () => { const m = new Date().getMonth() + 1; return m >= 3 && m <= 5 ? 0 : m >= 6 && m <= 8 ? 1 : m >= 9 && m <= 11 ? 2 : 3; };
function loadDeco() {
  // はじめの画面のあいだは読まない（約0.5MB。見るだけで帰る人の通信を減らす）。遊び始めて はじめの画面が閉じたら読む
  const intro = document.getElementById('intro');
  if (intro && !intro.hidden) {
    if (!loadDeco.wait) {
      loadDeco.wait = new MutationObserver(() => { if (intro.hidden) { loadDeco.wait.disconnect(); loadDeco.wait = null; loadDeco(); } });
      loadDeco.wait.observe(intro, { attributes: true, attributeFilter: ['hidden'] });
    }
    return;
  }
  const s = decoSeason();
  if (s === DECO.s) return;
  DECO.s = s;
  if (!DECO.idx) fetch('nishio-go/deco/deco.json').then(r => r.json()).then(j => { DECO.idx = new Map(j.subjects.map((n, i) => [n, i])); DECO.cols = j.cols; dirty = true; }).catch(() => { DECO.s = -1; });
  const img = new Image();
  img.onload = () => { if (DECO.s === s) { DECO.img = img; decoCache.clear(); dirty = true; } };
  img.onerror = () => { if (DECO.s === s) DECO.s = -1; };   // つぎに季節を確かめるとき、もう一度
  img.src = `nishio-go/deco/deco-${s}.webp`;   // 劣化しない WebP（PNG の4割ほどの大きさ）
}
const decoLists = new Map();   // その月に置ける物の表（月が替わったら作りなおす）
function decoList(code) {
  const wx = window.NISHIO_WEATHER && window.NISHIO_WEATHER.current, rain = !!(wx && wx.kind === 'rain');
  const m = DECO.m, key = code + ':' + m + ':' + rain + ':' + (code === C.U || code === C.F ? PADDY_TILE : '');
  if (decoLists.has(key)) return decoLists.get(key);
  const place = code === C.U || code === C.F ? [14, DECO_PADDY[PADDY_TILE] || DECO_PADDY.green] : DECO_PLACE[code];
  const inMonths = (a, b) => (a <= b ? m >= a && m <= b : m >= a || m <= b);   // 11-3 のように年をまたぐ月も
  const list = !place ? null : [place[0], place[1].filter(e => {
    if (e.endsWith('#rain')) return rain;
    const [, r] = e.split('@'); if (!r) return true; const [a, b] = r.split('-').map(Number); return inMonths(a, b);
  }).map(e => e.split(/[@#]/)[0])];
  decoLists.set(key, list);
  return list;
}
// てん茶の 覆い（朝の 改善 10。運営者の声「西尾らしく」・「文字は減らして素朴なかわいさと平和さを散りばめる」）：「西尾の抹茶」は、4月ごろ 新芽が のびはじめてから
// 25日 以上、茶棚の 上に 遮光資材を 広げて 覆う 棚式の 覆い下栽培（愛知県「西尾の抹茶」栽培法の 定義）。4月15日〜5月20日ごろ、茶畑の マスに 柱と こい 灰色の 覆いの 棚。文字は なし
function kabuseOn(t = Date.now()) {
  const d = new Date(t + 9 * 3600000), md = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  return md >= 415 && md <= 520;
}
function drawKabuse(tx, ty, X, Y, T) {
  const p = Math.max(1, Math.round(T / 16));
  ctx.fillStyle = 'rgba(38,42,46,0.68)'; ctx.fillRect(X, Y, T, T);   // 覆い（下の 茶の 列が うっすら すける）
  ctx.fillStyle = 'rgba(120,128,134,0.35)';
  for (let i = 2; i < 16; i += 4) { ctx.fillRect(X + i * p, Y, p, T); ctx.fillRect(X, Y + i * p, T, p); }   // あみの 目
  const n = codeAt(tx, ty + 1) !== C.E, w = codeAt(tx - 1, ty) !== C.E, e = codeAt(tx + 1, ty) !== C.E;
  ctx.fillStyle = '#7a5a3a';
  if (n && w) ctx.fillRect(X + p, Y + 12 * p, p, 4 * p);   // 棚の はしの 柱（茶畑の 南の へりの 角）
  if (n && e) ctx.fillRect(X + 14 * p, Y + 12 * p, p, 4 * p);
  if (n) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(X, Y + 15 * p, T, p); }   // 南の へりの 影
}
// 茶畑の 白い 茶の花（運営者の声「文字は減らして素朴なかわいさと平和さを散りばめる」・夜の 改善 1）：茶の花は 秋（9〜11月）に 咲く
// （埼玉県「茶の実」・横浜市の 食育資料）。西尾の 抹茶の 茶畑の うねに、白い 5まいの 花びらと 黄色い しべを ぽつぽつ。文字は なし
const chaHanaOn = () => DECO.m >= 9 && DECO.m <= 11;
function drawChaHana(tx, ty, X, Y, T) {
  const h = Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663), u = (h ^ (h >>> 13)) >>> 0;
  if (u % 3 === 0) return;   // 3マスに 1つは 咲いて いない（ぽつぽつ）
  const p = Math.max(1, Math.round(T / 16));
  for (let i = 0, n = 1 + (u >>> 3) % 2; i < n; i++) {   // 1〜2りん。茶の木の 列（上 1〜6・下 9〜14）の 上に
    const r = u >>> (6 + i * 7), cx = 2 + r % 12, cy = (i & 1 ? 10 : 2) + (r >>> 4) % 3, x = X + cx * p, y = Y + cy * p;
    ctx.fillStyle = '#fbfaf2'; ctx.fillRect(x, y - p, p, p * 3); ctx.fillRect(x - p, y, p * 3, p);   // 花びら（十字）
    ctx.fillStyle = '#f2c94c'; ctx.fillRect(x, y, p, p);   // しべ
  }
}
function drawDeco(code, tx, ty, X, Y, T, now) {
  if (!DECO.img || !DECO.idx) return;
  const L = decoList(code);
  if (!L || !L[1].length) return;
  const h = Math.imul(tx, 2654435761) ^ Math.imul(ty, 40503) ^ 0x5bd1e995, u = (h ^ (h >>> 15)) >>> 0;
  if (u % L[0]) return;
  if (code === C.T && tiles[C.T].length === 80 && tileVar(code, tx, ty) % 80 >= 70) return;   // 町なかの地面に自販機や電柱がもう描いてあるマスには置かない
  const name = L[1][(u >>> 4) % L[1].length], si = DECO.idx.get(name);
  if (si === undefined) return;
  if (code === C.A && (DECO_POND.has(name) ? !landNear(tx, ty, 2) : DECO_OPEN.has(name) && landNear(tx, ty, 1))) return;
  let k = (u >>> 9) % 6;
  if (DECO_ANIM.has(name)) k = (k & 6) | ((Math.floor(now / 650) + (u >>> 20)) & 1);   // 生きものは2つのポーズをいったりきたり
  ctx.drawImage(decoCanvas(((si * 6 + k) * 4 + (u >>> 13) % 4) * 8 + (u >>> 16) % 8), X, Y, T, T);
}
// 小物の絵：シートから使う分だけ 16×16 の canvas に切り出してとっておく（Godot で地図を描くときも、ほかのマスと同じ5つの引数で描けるように）
const decoCache = new Map();
function decoCanvas(i) {
  let c = decoCache.get(i);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 16;
  c.getContext('2d').drawImage(DECO.img, (i % DECO.cols) * 16, Math.floor(i / DECO.cols) * 16, 16, 16, 0, 0, 16, 16);
  decoCache.set(i, c);
  return c;
}
loadDeco();
const tileFrame = (code, f, tx, ty, now) => code === C.A || code === C.X ? f
  : code === C.W ? (Math.floor(now / 700) + (tx >> 1) + (ty >> 2)) & 1   // 森は、風がわたるように少しずつずれてゆれる
  : code === C.U || code === C.F ? (Math.floor(now / 900) + ((tx + ty) >> 2)) & 1   // 田んぼの稲は、ななめに風の波がわたる
  : code === C.G ? (Math.floor(now / 800) + ((tx - ty) >> 2)) & 1 : 0;   // 草地の草も、風でそよぐ
// マスの絵のえらび方：ふつうはマスごと。畑は8×8マスのまとまりで同じ作物にする（マスごとにちがう野菜だと、つぎはぎに見えるので）
const tileVar = (code, x, y) => code === C.V ? (((x >> 3) * 73856093) ^ ((y >> 3) * 19349663)) >>> 0 : code === C.B && tiles[C.B].length === 32 ? roofVar(x, y) : ((x * 73856093) ^ (y * 19349663)) >>> 0;
// 建物の屋根：4×4マスのまとまりごとに、同じ屋根（瓦5色・金属5色・陸屋根3色のどれか）にする（ひとつの建物がつぎはぎにならないように）。
// 陸屋根のマスだけは、ところどころに室外機・給水タンク・屋上の出入り口
const blockHash = (x, y) => (Math.imul(x >> 2, 374761393) ^ Math.imul(y >> 2, 668265263) ^ 0x27d4eb2d) >>> 0;
function roofVar(x, y) {
  const b = blockHash(x, y), group = b % 13, geo = (b >>> 5) & 1;
  if (group < 5) return group * 2 + geo;
  if (group < 10) return 10 + (group - 5) * 2 + geo;
  const t = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  return 20 + (group - 10) * 4 + (t % 10 < 7 ? 0 : 1 + ((t >>> 4) % 3));
}
// 国土地理院の建物で作った区画では、空中写真で見た屋根の色（g.rf：色の番号1〜13＋形×16）で絵をえらぶ（歩く地図だけ）
const rfAt = (tx, ty) => { const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK), c = chunks.get(cx + '_' + cy); return c && c.g && c.g.rf ? c.g.rf[(ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK)] : 0; };
const HOUSE_ROOF = [0, 0, 7, 3, 2, 1, 2, 9, 8, 5, 6, 5, 5, 5];   // 色の番号 → 家の屋根の色（maptiles-sheets.py の ROOFS）
// 線路のマスの絵（rail.png の番号）。0〜15：上下左右のどの線路のマスとつながるか（1 上・2 右・4 下・8 左）
// 16〜25：45度くらいの線路で、マスが角だけで接するとき（ななめのとなりが線路で、そのあいだの2マスはどちらも線路でない）
//   16 左下から右上・17 左上から右下、18〜25 辺のまん中から反対側の角（上→右下・上→左下・右→左上・右→左下・下→右上・下→左上・左→右上・左→右下）。tools/blender/maptiles.py の RAIL_EXTRA と同じ順
// 26〜33：まん中から1つの端へ向かう部品（上・右・下・左・右上・右下・左下・左上。背景なし）、34：バラストだけ、35〜40：複線の帯のななめ（railBandSpill）
// どの1枚にもあてはまらない つながり（角が2つ以上の分かれ道など）は、端の番号の配列を返し、34 の上に部品を重ねて描く
const RAIL_PAIR = { '4,6': 16, '5,7': 17, '0,5': 18, '0,6': 19, '1,7': 20, '1,6': 21, '2,4': 22, '2,7': 23, '3,4': 24, '3,5': 25 };
// 複線・駅の構内のように線路のマスが2〜3マスの帯になっている所（2×2 がぜんぶ線路）では、上下左右のつながりで選ぶと分かれ道だらけになる。
// そこは まわり5×5の線路のマスの並ぶ向きから、横・縦・ななめ のまっすぐな線路を描く（となりのマスと平行な線路になり、複線に見える）
function railBandRaw(x, y) {
  const L = (a, b) => gridAt(a, b) === C.L;
  if (![[0, 0], [-1, 0], [0, -1], [-1, -1]].some(([a, b]) => L(x + a, y + b) && L(x + a + 1, y + b) && L(x + a, y + b + 1) && L(x + a + 1, y + b + 1))) return -1;
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (L(x + i, y + j)) { n++; sx += i; sy += j; sxx += i * i; syy += j * j; sxy += i * j; }
  const cxx = sxx / n - (sx / n) ** 2, cyy = syy / n - (sy / n) ** 2, cxy = sxy / n - (sx / n) * (sy / n);
  if (Math.abs(cxx - cyy) < 0.05 && Math.abs(cxy) < 0.05) return -1;   // 向きが決まらない（かたまり）
  const deg = ((Math.atan2(2 * cxy, cxx - cyy) / 2) * 180 / Math.PI + 180) % 180;   // 0 横・90 縦・45 右下がり・135 右上がり（画面の下が y の正）
  return deg < 22.5 || deg >= 157.5 ? 10 : deg < 67.5 ? 17 : deg < 112.5 ? 5 : 16;
}
// 帯の向きは、線の両端のマスが線路で、そのマスも同じ向きの帯か ふつうの線路のときだけ使う（帯が曲がる所で、横の線と ななめの線が切れて並ばないように）。
// 使えないマスは、ふつうの線路と同じく まわりへの部品を重ねて描く（railIndex）
const BAND_ENDS = { 10: [[-1, 0], [1, 0]], 5: [[0, -1], [0, 1]], 16: [[1, -1], [-1, 1]], 17: [[-1, -1], [1, 1]] };
function railBandIndex(x, y) {
  const d = railBandRaw(x, y);
  if (d < 0) return -1;
  return BAND_ENDS[d].every(([a, b]) => { if (gridAt(x + a, y + b) !== C.L) return false; const e = railBandRaw(x + a, y + b); return e === d || e < 0; }) ? d : -1;
}
// 帯のななめの線路は角を通るので、となりのマスの平行な線路のレールが このマスの角をかすめる。となりも同じ向きの帯なら、その分も描いた絵（35〜40）にする
function railBandSpill(x, y, band) {
  const same = (a, b) => railBandIndex(a, b) === band;
  if (band === 16) { const nw = same(x - 1, y) || same(x, y - 1), se = same(x + 1, y) || same(x, y + 1); return nw && se ? 37 : se ? 36 : nw ? 35 : 16; }
  const ne = same(x + 1, y) || same(x, y - 1), sw = same(x - 1, y) || same(x, y + 1);
  return ne && sw ? 40 : sw ? 39 : ne ? 38 : 17;
}
function nbrLook(x, y, fn) {
  const key = x * 1048576 + y;   // 数のかぎ（文字列を作るより速い。マスの番号は ±50万より小さい）
  let r = nbrCur.get(key);
  if (r === undefined) { r = fn(x, y); nbrCur.set(key, r); }
  return r;
}
const railIndex = (x, y) => nbrLook(x, y, railIndexOf);
// 道のマスに描くもの：[道の絵の列, 角の縁石（kado.png の番号）, 踏切のレール（rail.png の番号）, 橋の欄干（rankan.png の番号）]
function roadLookOf(x, y) {
  const code = gridAt(x, y), ri = roadIndex(code, x, y), rm = ri >> 1;
  const kado = ROAD_CORNERS.flatMap(([s1, s2, a, b], i) => (rm & s1) && (rm & s2) && ROAD_ROW[gridAt(x + a, y + b)] === undefined ? [i] : []);
  const rankan = code === C.D ? [] : [[0, -1], [1, 0], [0, 1], [-1, 0]].flatMap(([a, b], i) => gridAt(x + a, y + b) === C.A ? [i] : []);
  return [ri, kado, railCrossing(x, y) || [], rankan];
}
function railIndexOf(x, y) {
  const band = railBandIndex(x, y);
  if (band === 16 || band === 17) return railBandSpill(x, y, band);
  if (band >= 0) return band;
  const L = (a, b) => gridAt(a, b) === C.L, up = L(x, y - 1), rt = L(x + 1, y), dn = L(x, y + 1), lf = L(x - 1, y);
  const m = (up ? 1 : 0) | (rt ? 2 : 0) | (dn ? 4 : 0) | (lf ? 8 : 0);
  // ななめのとなりが帯のななめの線路で、その線がこのマスの角へ来ているときも、その角へつなぐ
  const toMe = (a, b) => { const d = railBandIndex(x + a, y + b); return (d === 16 && a === -b) || (d === 17 && a === b); };
  const ports = [up, rt, dn, lf, (!up && !rt && L(x + 1, y - 1)) || toMe(1, -1), (!dn && !rt && L(x + 1, y + 1)) || toMe(1, 1), (!dn && !lf && L(x - 1, y + 1)) || toMe(-1, 1), (!up && !lf && L(x - 1, y - 1)) || toMe(-1, -1)]
    .flatMap((on, i) => on ? [i] : []);
  const corners = ports.filter(i => i >= 4);
  if (!corners.length) return m;
  if (ports.length === 1) return corners[0] === 4 || corners[0] === 6 ? 16 : 17;   // 角が1つだけ：まっすぐ反対の角へ
  return RAIL_PAIR[ports.join()] || ports;
}
// 踏切：道に上書きされて線路のマスが切れている所（道が3マス以内で、両がわに同じ向きへ続く線路がある）は、道の上にレールを重ねる。
// 返すのは rail.png の「まん中から端へ」の部品2つ（26〜33）。平行に走る線路のあいだの道に はしごを描かないよう、線路がその向きへ続くことも確かめる
const RAIL_X_DIRS = [[0, 1, 26, 28], [1, 0, 27, 29], [1, -1, 30, 32], [1, 1, 31, 33]];   // [dx, dy, 端の部品（-dy がわ… 上・右・右上・右下）, 反対がわ]
function railCrossing(x, y) {
  const L = (a, b) => gridAt(a, b) === C.L, Rd = (a, b) => ROAD_ROW[gridAt(a, b)] !== undefined;
  for (const [dx, dy, pa, pb] of RAIL_X_DIRS) {
    const end = s => {   // s の向きへ道をたどり、線路に着いたら道の数を返す（着かなければ -1）
      const fx = dx * s, fy = dy * s, fwd = fx && fy ? [[fx, fy], [fx, 0], [0, fy]] : [[fx, fy], [fx - fy, fy + fx], [fx + fy, fy - fx]];   // その先へ続く向き（まっすぐ・45度まで）
      for (let k = 1; k <= 3; k++) {
        const a = x + dx * s * k, b = y + dy * s * k;
        if (L(a, b)) return fwd.some(([u, v]) => L(a + u, b + v)) ? k - 1 : -1;
        if (!Rd(a, b)) return -1;
      }
      return -1;
    };
    const f = end(-1), g = f < 0 ? -1 : end(1);
    if (g >= 0 && f + g + 1 <= 3) return [pa, pb];
  }
  return null;
}
// 道のマスの絵（road.png の 行・列）。行：0 ふつうの道・1 大きな道・2 小道。列：となりの道（どの道でも）へつながる向き（1 上・2 右・4 下・8 左）× 2 ＋ 小物
// 線路のマスは、このマスが その向きの踏切（railCrossing）のときだけ つながっているとみなす（線路と並んで走る道の ふちが消えないように）
// 小物（マンホール・補修のあと）は8マスに1つくらい、小道の水たまりは24マスに1つくらい。つながっていない辺に縁石・側溝・白線・草のへりが描いてある
const ROAD_ROW = { [C.R]: 0, [C.H]: 1, [C.D]: 2 };
// 水べのマスの絵（shore.png の 行・列）。陸と接する辺（1 上・2 右・4 下・8 左）が1つもなければ -1（ふつうの水の絵）。
// 行：砂浜と接していれば 2 浜、町なか（家・建物・町・工場・道・線路）と接していれば 0 護岸、ほか（田畑・草地・森）は 1 土手
const SHORE_TOWN = new Set([C.T, C.Q, C.B, C.I, C.R, C.H, C.L]);
function shoreIndex(x, y) {
  let m = 0, row = 1;
  [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([a, b], i) => {
    const c = gridAt(x + a, y + b);
    if (c === C.A || c === C.X) return;
    m |= 1 << i;
    if (c === C.S) row = 2; else if (row === 1 && SHORE_TOWN.has(c)) row = 0;
  });
  return m ? [row, m * 2] : null;
}
// 道の角の縁石（kado.png）：となり合う2辺がつながっていて、そのあいだのななめのマスが道でない角。[辺, 辺, ななめのマス]。右上・右下・左下・左上
const ROAD_CORNERS = [[1, 2, 1, -1], [2, 4, 1, 1], [4, 8, -1, 1], [8, 1, -1, -1]];
function roadIndex(code, x, y) {
  let xr;
  const R = (a, b, arm) => {
    const c = gridAt(a, b);
    if (c !== C.L) return ROAD_ROW[c] !== undefined;
    if (xr === undefined) xr = railCrossing(x, y);
    return !!xr && xr.includes(arm);
  };
  const m = (R(x, y - 1, 26) ? 1 : 0) | (R(x + 1, y, 27) ? 2 : 0) | (R(x, y + 1, 28) ? 4 : 0) | (R(x - 1, y, 29) ? 8 : 0);
  const h = (Math.imul(x, 668265263) ^ Math.imul(y, 374761393)) >>> 0;
  return m * 2 + ((h >>> 13) % (code === C.D ? 24 : 8) === 0 ? 1 : 0);
}
function tileVarAt(code, x, y) {
  const rc = code === C.Q || code === C.B ? rfAt(x, y) : 0, k = rc & 15, t = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  if (!k || k > 13) return tileVar(code, x, y);
  if (code === C.B) {
    if (tiles[C.B].length !== 32) return tileVar(code, x, y);
    const geo = (rc >> 4) & 1;
    return k <= 5 ? (k - 1) * 2 + geo : k <= 10 ? 10 + (k - 6) * 2 + geo : 20 + (k - 11) * 4 + (t % 10 < 7 ? 0 : 1 + ((t >>> 4) % 3));
  }
  if (tiles[C.Q].length !== 2500) return tileVar(code, x, y);
  let gi = t % 50;                                     // 家の形（形5 × 庭の小物5 × 向き2）
  if (k === 13) gi = 30 + gi % 10; else if (gi >= 30 && gi < 40) gi -= 10;   // 白い屋根は陸屋根の家、ほかは屋根のある家（明るい灰色は銀色の屋根）
  return gi * 50 + HOUSE_ROOF[k] * 5 + (t >>> 8) % 5;
}
// 建物の前の壁の形（facade.png の列）：0 窓・1 戸口と窓・2 シャッターと看板・3 ガラスの店先と日よけ・4 アパートの手すり・5 倉庫の戸。
// 4×4マスのまとまりごとに形を決める（ひとつの建物が つぎはぎにならないように）。道に面していれば お店が多め。窓の壁には ところどころ戸口
function facadeType(x, y) {
  const b = blockHash(x, y) >>> 7, onRoad = isRoad(codeAt(x, y + 1));
  const t = (onRoad ? [2, 3, 2, 0, 4] : [0, 0, 4, 5, 0])[b % 5];
  return t === 0 && ((Math.imul(x, 2654435761) ^ y) >>> 0) % 4 === 0 ? 1 : t;
}
// 建物のふち：下のマスが建物でなければ、窓のある壁（前の面）を描き、左右と上にかげをつける（建物が立って見えるように）
const WALLS = ['#e8e0d0', '#f0ece4', '#d8c8a8', '#c8ccd0', '#b8a080'];
function drawWall(tx, ty, X, Y, T) {
  const u = T / 16, below = codeAt(tx, ty + 1) !== C.B;
  if (codeAt(tx - 1, ty) !== C.B) { ctx.fillStyle = 'rgba(30,24,20,.45)'; ctx.fillRect(X, Y, Math.ceil(u), T); }
  if (codeAt(tx + 1, ty) !== C.B) { ctx.fillStyle = 'rgba(30,24,20,.3)'; ctx.fillRect(X + T - Math.ceil(u), Y, Math.ceil(u), T); }
  if (codeAt(tx, ty - 1) !== C.B) { ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(X, Y, T, Math.ceil(u)); }
  if (!below) return;
  if (MT.facade) { ctx.drawImage(MT.facade[blockHash(tx, ty) % WALLS.length][facadeType(tx, ty)], X, Y, T, T); return; }
  const wall = WALLS[blockHash(tx, ty) % WALLS.length], wy = Y + Math.round(10 * u);
  ctx.fillStyle = 'rgba(30,24,20,.55)'; ctx.fillRect(X, wy - Math.ceil(u), T, Math.ceil(u));   // のきのかげ
  ctx.fillStyle = wall; ctx.fillRect(X, wy, T, T - (wy - Y));
  ctx.fillStyle = '#5a7a9a';
  for (let wx = 2; wx < 16; wx += 5) ctx.fillRect(X + Math.round(wx * u), wy + Math.round(1.5 * u), Math.round(2 * u), Math.round(2 * u));   // 窓
  ctx.fillStyle = 'rgba(30,24,20,.6)'; ctx.fillRect(X, Y + T - Math.ceil(u), T, Math.ceil(u));   // 足もとの線
}
// 季節が変わったら（月が替わる・紅葉や桜のころに入る）、田畑・森・公園のタイルとせかいちずの色を作り直す。1分ごとに確かめる
let seasonCheckT = 0;
function refreshSeason(now) {
  if (now - seasonCheckT < 60000) return;
  seasonCheckT = now;
  const k = seasonNow();
  loadMapTiles();
  loadDeco();
  DECO.m = new Date().getMonth() + 1;   // 家と森のシートは、こよみの見ごろのほかに月でも替わる（2月→3月で冬からふだんへ）ので、ここで毎回確かめる
  if (k === seasonKey) return;
  seasonKey = k;
  WCOL[C.U] = WCOL[C.F] = PADDY_COL;
  buildTiles([C.U, C.F, C.W, C.P]);
  applyMapTiles();   // Blender の森・公園の絵を使っていれば、そのまま（季節のシートは上の loadMapTiles が読む）
  makeWorldImg();
  dirty = true;
}

// 文字で描くスプライト（16×16）
const PAL = { k: '#000000', w: '#ffffff', r: '#d23a2e', R: '#8e1c1c', g: '#a8a8a8', G: '#686868', y: '#f2c230', Y: '#b88a12',
  b: '#2b5fd9', B: '#1a3a8a', n: '#8d5524', N: '#5d3a1a', s: '#f4c58f', l: '#43a047', o: '#ff9800' };
function sprite(rows, gray, pal = PAL) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const x = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, i) => {
    if (ch === '.' || !pal[ch]) return;
    let col = pal[ch];
    if (gray) { const v = Math.round(0.3 * parseInt(col.slice(1, 3), 16) + 0.59 * parseInt(col.slice(3, 5), 16) + 0.11 * parseInt(col.slice(5, 7), 16)); col = `rgb(${v},${v},${v})`; }
    x.fillStyle = col; x.fillRect(i, y, 1, 1);
  }));
  return c;
}
const ART = {
  castle: ['................', '...r........r...', '...rr......rr...', '...k........k...', '..kgk.kkkk.kgk..', '..kgkkggggkkgk..', '..kgggGggGgggk..',
    '..kgGgggggggGk..', '..kggggkkggggk..', '..kgGgkNNkgGgk..', '..kggkNNNNkggk..', '..kgGkNNNNkGgk..', '..kggkNNNNkggk..', '..kkkkkkkkkkkk..', '................', '................'],
  torii: ['................', '................', '.kkkkkkkkkkkkkk.', '.krrrrrrrrrrrrk.', '..kkkkkkkkkkkk..', '...krk....krk...', '.kkkrkkkkkkrkkk.', '.krrrrrrrrrrrrk.',
    '.kkkrkkkkkkrkkk.', '...krk....krk...', '...krk....krk...', '...krk....krk...', '...krk....krk...', '..kkrkk..kkrkk..', '..kkkkk..kkkkk..', '................'],
  temple: ['................', '.......kk.......', '......kGGk......', '....kkGGGGkk....', '..kkGGGGGGGGkk..', '.kGGGGGGGGGGGGk.', 'kkkkkkkkkkkkkkkk', '..knnnnnnnnnnk..',
    '..knwwknnkwwnk..', '..knwwknnkwwnk..', '..knnnnnnnnnnk..', '..knnnkNNknnnk..', '..knnnkNNknnnk..', '.kkkkkkkkkkkkkk.', '.kggggggggggggk.', '.kkkkkkkkkkkkkk.'],
  town: ['................', '......kkkk......', '.....krrrrk.....', '....krrrrrrk....', '...krrrrrrrrk...', '..krrrrrrrrrrk..', '.kkkkkkkkkkkkkk.', '..kwwwwwwwwwwk..',
    '..kwbbwwwwbbwk..', '..kwbbwwwwbbwk..', '..kwwwwkkwwwwk..', '..kwwwwkNkwwwk..', '..kwwwwkNkwwwk..', '..kkkkkkkkkkkk..', '................', '................'],
  treasure: ['................', '................', '...kkkkkkkkkk...', '..kyrrrrrrrryk..', '..krrrrrrrrrrk..', '..kyrrrrrrrryk..', '..kkkkkkkkkkkk..', '..kyyyyyyyyyyk..', '..kRRRRkkRRRRk..', '..kRrrkyykrrRk..', '..kRrrrkkrrrRk..', '..kRrrrrrrrrRk..', '..kyyyyyyyyyyk..', '..kkkkkkkkkkkk..', '................', '................'],   // 道ばたのたからばこ（赤と金）
  chest: ['................', '................', '................', '...kkkkkkkkkk...', '..knnnnnnnnnnk..', '..knNNNNNNNNnk..', '..knnnnnnnnnnk..', '..kkkkkyykkkkk..',
    '..knnnkyyknnnk..', '..knnnnkknnnnk..', '..knNNNNNNNNnk..', '..knnnnnnnnnnk..', '..kkkkkkkkkkkk..', '................', '................', '................'],
};
// 主要な建物のドット絵
const BUILDING_ART = {
  townhall: ['......k.........', '......krr.......', '......krrr......', '......k.........', '...kkkkkkkkkk...', '...kggggggggk...', '.kkkkkkkkkkkkkk.', '.kwwwwwyywwwwwk.',
    '.kwbbwwyywwbbwk.', '.kwbbwwwwwwbbwk.', '.kwwwwwwwwwwwwk.', '.kwbbwwkkwwbbwk.', '.kwbbwwkkwwbbwk.', '.kwwwwwkkwwwwwk.', 'kkkkkkkkkkkkkkkk', 'kggggggggggggggk'],
  hospital: ['................', '................', '..kkkkkkkkkkkk..', '..kwwwwwwwwwwk..', '..kwwwwrrwwwwk..', '..kwwrrrrrrwwk..', '..kwwrrrrrrwwk..', '..kwwwwrrwwwwk..',
    '..kwwwwwwwwwwk..', '..kbbwbbwbbwbk..', '..kwwwwwwwwwwk..', '..kbbwbbwbbwbk..', '..kwwwwkkwwwwk..', '..kwwwwkkwwwwk..', '.kkkkkkkkkkkkkk.', '................'],
  school: ['.......kk.......', '......kwwk......', '......kwwk......', '...kkkkkkkkkk...', '..knnnnnnnnnnk..', '.knnnnnnnnnnnnk.', '.kkkkkkkkkkkkkk.', '.kwwwwwwwwwwwwk.',
    '.kwbbwbbwbbwbbk.', '.kwbbwbbwbbwbbk.', '.kwwwwwwwwwwwwk.', '.kwbbwwkkwwbbwk.', '.kwbbwwkkwwbbwk.', '.kwwwwwkkwwwwwk.', 'kkkkkkkkkkkkkkkk', 'kllllllllllllllk'],
  library: ['................', '................', '..kkkkkkkkkkkk..', '.kGGGGGGGGGGGGk.', 'kkkkkkkkkkkkkkkk', '.kwwwwwwwwwwwwk.', '.kwwrrwbbwyywwk.', '.kwwrrwbbwyywwk.',
    '.kwwrrwbbwyywwk.', '.kwwwwwwwwwwwwk.', '.kggggggggggggk.', '.kwwwwwkkwwwwwk.', '.kwwwwwkkwwwwwk.', '.kwwwwwkkwwwwwk.', 'kkkkkkkkkkkkkkkk', '................'],
  police: ['................', '.......kk.......', '.......rr.......', '....kkkkkkkk....', '...kBBBBBBBBk...', '..kBBBBBBBBBBk..', '..kkkkkkkkkkkk..', '..kwwwwwwwwwwk..',
    '..kwbbwwwwbbwk..', '..kwbbwwwwbbwk..', '..kwwwwkkwwwwk..', '..kwwwwkkwwwwk..', '..kwwwwkkwwwwk..', '.kkkkkkkkkkkkkk.', '................', '................'],
  fire: ['................', '......krrk......', '..kkkkkkkkkkkk..', '..krrrrrrrrrrk..', '..krrrrwwrrrrk..', '..kkkkkkkkkkkk..', '..kwwwwwwwwwwk..', '..kGGGGwGGGGwk..',
    '..kGggGwGggGwk..', '..kGGGGwGGGGwk..', '..kGggGwGggGwk..', '..kGGGGwGGGGwk..', '.kkkkkkkkkkkkkk.', '................', '................', '................'],
  post: ['................', '................', '..kkkkkkkkkkkk..', '..krrrrrrrrrrk..', '..kkkkkkkkkkkk..', '..kwwwwwwwwwwk..', '..kwwkkkkkkwwk..', '..kwwwwwwwwwwk..',
    '..kwwkkkkkkwwk..', '..kwwwwkkwwwwk..', '..kwwwwkkwwwwk..', '..kwwwwwwwwwwk..', '.kkkkkkkkkkkkkk.', '................', '................', '................'],
  ricestore: ['................', '.kkkkkkkkkkkkkk.', 'kNNNNNNNNNNNNNNk', 'kNnNnNnNnNnNnNNk', 'kkkkkkkkkkkkkkkk', '.kwwwwwwwwwwwwk.', '.kwwwwwkwwwwwwk.', '.kwwwkwkwkwwwwk.', '.kwwwkkkkkwwwwk.', '.kwwwwkkkwwwwwk.', '.kwwwkwkwkwwwwk.', '.kkkkkkkkkkkkkk.', '.krrrkrrrrkrrrk.', '.krrrkrrrrkrrrk.', '.ksskNNNNNNkssk.', 'kkkkkkkkkkkkkkkk'],   // 当店（米屋：のれんと「米」の看板）
  shop: ['................', '................', '..kkkkkkkkkkkk..', '..kwwwwwwwwwwk..', '..kwyyyyyyyywk..', '..kwwwwwwwwwwk..', '.krwrwrwrwrwrwk.', '.krwrwrwrwrwrwk.',
    '..kbbbbbbbbbbk..', '..kbbbbkkbbbbk..', '..kbbbbkkbbbbk..', '..kbbbbkkbbbbk..', '.kkkkkkkkkkkkkk.', '................', '................', '................'],
  konbini: ['................', '................', '.kkkkkkkkkkkkkk.', '.kwwwwwwwwwwwwk.', '.kllllllllllllk.', '.kbbbbbbbbbbbbk.', '.kkkkkkkkkkkkkk.', '.kwbbbbwwbbbbwk.',
    '.kwbbbbwwbbbbwk.', '.kwbbbbwwbbbbwk.', '.kwwwwwkkwwwwwk.', '.kwwwwwkkwwwwwk.', 'kkkkkkkkkkkkkkkk', 'gggggggggggggggg', '................', '................'],
  super: ['................', '.kkkkkkkkkkkkkk.', '.kooooooooooook.', '.kowwwwwwwwwwok.', '.kooooooooooook.', 'kkkkkkkkkkkkkkkk', '.kwwwwwwwwwwwwk.', '.kwbbbwbbwbbbwk.',
    '.kwbbbwbbwbbbwk.', '.kwwwwwwwwwwwwk.', '.kwbbwkkkkwbbwk.', '.kwbbwkkkkwbbwk.', '.kwwwwkkkkwwwwk.', 'kkkkkkkkkkkkkkkk', 'gggggggggggggggg', '................'],
  home: ['................', '................', '.......kk.......', '.....kkookk.....', '...kkoooooookk..', '.kkoooooooooookk', 'kkkkkkkkkkkkkkkk', '.knnnnnnnnnnnnk.',
    '.knwwwwwwwwwwnk.', '.knwyyyyyyyywnk.', '.knwwwwwwwwwwnk.', '.knnnnkkkknnnnk.', '.knnnnkGGknnnnk.', '.knnnnkGGknnnnk.', 'kkkkkkkkkkkkkkkk', '................'],
  drug: ['................', '................', '.kkkkkkkkkkkkkk.', '.kwwwwwllwwwwwk.', '.kwwwllllllwwwk.', '.kwwwwwllwwwwwk.', '.kkkkkkkkkkkkkk.', '.kwbbbbwwbbbbwk.',
    '.kwbbbbwwbbbbwk.', '.kwwwwwwwwwwwwk.', '.kwwwwwkkwwwwwk.', '.kwwwwwkkwwwwwk.', 'kkkkkkkkkkkkkkkk', 'gggggggggggggggg', '................', '................'],
  fuel: ['................', 'kkkkkkkkkkkkkkkk', 'krrrrrrrrrrrrrrk', 'kwwwwwwwwwwwwwwk', 'kkkkkkkkkkkkkkkk', '..k..........k..', '..k...kkkk...k..', '..k...krrk...k..',
    '..k...kwwk...k..', '..k...krrk...k..', '..k...krrk...k..', '..k...krrk...k..', '..k..kkkkkk..k..', '..k..........k..', 'gggggggggggggggg', '................'],
  bank: ['................', '.......kk.......', '.....kkggkk.....', '...kkggggggkk...', '.kkggggggggggkk.', 'kkkkkkkkkkkkkkkk', '.kwwkwwkwwkwwk..', '.kwwkwwkwwkwwk..',
    '.kwwkwwkwwkwwk..', '.kwwkwwkwwkwwk..', '.kwwkwwkwwkwwk..', '.kwwkwwkwwkwwk..', 'kkkkkkkkkkkkkkkk', 'kggggggggggggggk', 'kkkkkkkkkkkkkkkk', '................'],
  food: ['................', '................', '..kkkkkkkkkkkk..', '.knnnnnnnnnnnnk.', 'kkkkkkkkkkkkkkkk', '.krrkrrkrrkrrk..', '.krrkrrkrrkrrk..', '.kwwwwwwwwwwwwk.',
    '.kwwwwwwwwwwwwk.', '.kwbbwwkkwwbbwk.', '.kwbbwwkkwwbbwk.', '.kwwwwwkkwwwwwk.', 'kkkkkkkkkkkkkkkk', '................', '................', '................'],
  cafe: ['................', '................', '..kkkkkkkkkkkk..', '.kNNNNNNNNNNNNk.', 'kkkkkkkkkkkkkkkk', '.kwnwnwnwnwnwnk.', '.kwwwwwwwwwwwwk.', '.kwwwkkkkkwwwwk.',
    '.kwwwkwwwkkwwwk.', '.kwwwkwwwkwkwwk.', '.kwwwkwwwkkwwwk.', '.kwwwwkkkwwwwwk.', 'kkkkkkkkkkkkkkkk', '................', '................', '................'],
  station: ['................', '................', '................', '................', '.kkkkkkkkkkkkkk.', '.kGGGGGGGGGGGGk.', 'kkkkkkkkkkkkkkkk', '.kwwwwwwwwwwwwk.',
    '.kwbbwbbwbbwbbk.', '.kwwwwwkkwwwwwk.', '.kwwwwwkkwwwwwk.', 'kkkkkkkkkkkkkkkk', 'gggggggggggggggg', 'kkkkkkkkkkkkkkkk', 'nknknknknknknknk', 'kkkkkkkkkkkkkkkk'],
};
const HERO_TOP = ['................', '.....kkkkkk.....', '....kyyyyyyk....', '...kyyyyyyyyk...'];
const LEGS_A = ['....kBBkkBBk....', '....knnk.knnk...', '.....kk...kk....'];
const LEGS_B = ['....kBBkkBBk....', '...knnk..knnk...', '....kk....kk....'];
const HERO = {
  down: ['...kyykkkkyyk...', '...kyksssskyk...', '....kskssksk....', '....kskssksk....', '...kkbkkkkbkk...', '..kssbbbbbbssk..', '..kssbbyybbssk..', '...kkbbbbbbkk...', '....kbbbbbbk....'],
  up: ['...kyyyyyyyyk...', '...kyyyyyyyyk...', '....kyyyyyyk....', '....kssssssk....', '...kkbkkkkbkk...', '..kssbbbbbbssk..', '..kssbbbbbbssk..', '...kkbbbbbbkk...', '....kbbbbbbk....'],
  right: ['...kyyyykkkkk...', '...kyyyksssk....', '...kyyksskssk...', '....kksssksk....', '....kkbbbbkk....', '....kbbbbsssk...', '....kbbbbsssk...', '....kbbbbbbk....', '....kbbbbbbk....'],
};
const mirror = rows => rows.map(r => [...r].reverse().join(''));
// 西尾の人たち（npcs.js）：同じ形で（目はポケモンの歩く人と同じ 黒・横1×縦2）、髪・服・ズボンの色を変える（h 髪、c 服、p ズボン、a 小物）
const NPC_ROWS = ['................', '.....kkkkkk.....', '....khhhhhhk....', '...khhhhhhhhk...', '...khsssssshk...', '...kssksskssk...', '....kskssksk....', '.....kssssk.....',
  '....kkcccckk....', '...kccccccccak..', '..ksccccccccsk..', '..ksccccccccsk..', '...kcccccccck...', '....kppppppk....', '....kppkkppk....', '....kkk..kkk....'];
const NPC_COLORS = {
  elder:   { h: '#c8c8c8', c: '#6d5a44', p: '#4a4a4a', a: '#6d5a44' },
  granny:  { h: '#eeeeee', c: '#8e5a9e', p: '#5b3f66', a: '#8e5a9e' },
  man:     { h: '#2b2018', c: '#3f7fbf', p: '#2d3a55', a: '#3f7fbf' },
  woman:   { h: '#5a3418', c: '#e57373', p: '#6b4b3a', a: '#e57373' },
  kid:     { h: '#2b2018', c: '#ffb300', p: '#3b6fd1', a: '#ffb300' },
  student: { h: '#1d1d1d', c: '#203a63', p: '#203a63', a: '#ffffff' },
  fisher:  { h: '#ffffff', c: '#3a7bd5', p: '#2a2a2a', a: '#ffcc00' },
  staff:   { h: '#3b2a1a', c: '#2e7d32', p: '#3e3e3e', a: '#ffffff' },
  guide:   { h: '#3b2a1a', c: '#f2c230', p: '#4a4a4a', a: '#d23a2e' },
  monk:    { h: '#f4c58f', c: '#2b2b2b', p: '#2b2b2b', a: '#b88a12' },
};
// さんぽ仲間のライバル（game.js の rivalSay）：赤い服の男の子。people.png の並びに入れないよう、NPC_COLORS とは別に作る
const RIVAL_PAL = { ...PAL, h: '#2b2018', c: '#e53935', p: '#1e3a8a', a: '#e53935' };
const rivalSprites = [sprite(NPC_ROWS, false, RIVAL_PAL), sprite(NPC_ROWS.map((r, i) => i === 9 ? r.replace('a', 'c') : r), false, RIVAL_PAL)];
const rivalTile = () => { const r = G.rival; return r ? npcTile({ id: 'rival:' + r.at, lat: r.lat, lng: r.lng }) : null; };
function rivalTalk() {   // ライバルをタップする：ひとこと（先回りした所の名前で）。おまかせ歩き・タップで歩く道をふさがないよう、ぶつかっても止めない
  const r = G.rival;
  if (r) G.toast(`🏃 ${G.RIVAL}「ここで 会えたね。${r.name}、ゆっくり 見ていこまい」`);
}
// 生きもの（game.js の CRITTERS）：歩く地図の田んぼ・水べを歩いていると、ときどき出会う。16×16 の手描き
const CRITTER_ROWS = {
  sagi: ['................', '........kkk.....', '.......kwwwk....', '.......kwkwkyyy.', '.......kwwwkkk..', '........kwk.....', '........kwk.....', '.......kwwk.....', '.....kkwwwwk....', '....kwwwwwwwk...', '...kwwwwwwwwk...', '....kkwwwwwk....', '......kkkkk.....', '.......k.k......', '.......k.k......', '......kk.kk.....'],
  kaeru: ['................', '................', '................', '................', '....kkk..kkk....', '...kwkkllkkwk...', '...kllllllllk...', '..kllllllllllk..', '..kllkkkkkkllk..', '.kllllllllllllk.', '.kllGllllllGllk.', 'kllkkllllllkkllk', 'kllk.kkkkkk.kllk', '.kk..........kk.', '................', '................'],
  tonbo: ['................', '.......kk.......', '......kRRk......', '.gggg.kRRk.gggg.', 'gwwwwgkrrkgwwwwg', 'gwwwwwgrrgwwwwwg', '.ggggggrrgggggg.', 'gwwwwwgrrgwwwwwg', 'gwwwwgkrrkgwwwwg', '.gggg.krrk.gggg.', '.......rr.......', '.......rr.......', '.......rr.......', '.......rr.......', '.......kk.......', '................'],
  kamo: ['................', '................', '................', '................', '................', '..........kkk...', '.........knnnk..', '.........knknkyy', '.........knnnk..', '...kkkkkkknnk...', '..knnNnnNnnnnk..', '.knnnnnnnnnnnk..', '..kknnnnnnnkk...', 'bbbbkkkkkkkbbbbb', '.bbbbbbbbbbbbbb.', '................'],
  sakana: ['................', '................', '................', '................', '................', '................', '....kkkkkk..k...', '..kkggggggkkgk..', '.kwkggggggggggk.', '.kgggggggggkgk..', '..kkwwwwwwkk.k..', '....kkkkkk......', '................', '.b..b.....b..b..', '..bb.bb..bb.bb..', '................'],
  kani: ['................', '................', '................', '................', '................', '................', '..kk........kk..', '.krrk......krrk.', '.krrk.k..k.krrk.', '..kk.kwkkwk.kk..', '...kkrrrrrrkk...', '..krrrrrrrrrrk..', '..krrrrrrrrrrk..', '...kkkkkkkkkk...', '..k.k.k..k.k.k..', '................'],
  keri: ['................', '.....ggg........', '....ggggg.......', 'kyygrgggg.......', '....ggggg.......', '.....ggg........', '.....kkkk.......', '....wkkknnnn....', '....wwnnnnnnnn..', '....wwwnnnnnnnnk', '.....wwwwnnnnk..', '.......y.y......', '.......y.y......', '.......y.y......', '.......y.y......', '......yy.yy.....'],
  seitaka: ['................', '....kk..........', '...kwwk.........', 'kkkkwkwk........', '...kwwwk........', '....kwwk........', '....kwwwkkkk....', '...kwwwwkkkkkk..', '...kwwwwwkkkkkkk', '....kwwwwkkkkk..', '.....kkkkkkk....', '.......r.r......', '.......r.r......', '.......r.r......', '.......r.r......', '......rr.rr.....'],
  suzugamo: ['................', '................', '................', '................', '...kkk..........', '..kkkkk.........', 'ggkykkk.........', '..kkkkk.........', '...kkkkkkkkkkk..', '..kkkwwwwwgwgkk.', '..kkwwwwwwwwgkkk', '...kwwwwwwwwwkk.', '....kkkkkkkkkk..', 'bbbbbbbbbbbbbbbb', '.bbbbbbbbbbbbbb.', '................'],
  asari: ['................', '................', '................', '................', '................', '................', '................', '......kkkk......', '....kknnnnkk....', '...knnNnnNnnk...', '..knNnnNNnnNnk..', '..knnnNnnNnnnk..', '...kkkkkkkkkk...', '.ssssssssssssss.', 'ssssssssssssssss', '................'],
  medaka: ['................', '................', '................', '................', '................', '................', '................', '................', '....kkkkkkk.....', '..kkgggggggkk.k.', '.kwkgggggggggkkk', '..kkwwwwwwwkk.k.', '....kkkkkkk.....', '.b..b.....b..b..', '..bb.bb..bb.bb..', '................'],
  dojo: ['................', '................', '................', '................', '................', '................', '................', '................', '..kk............', '.knnkkk.....kk..', '.kwnnnnkk..knnk.', '..kkknnnnkknnk..', '......kknnnnk...', '........kkkk....', '.b..b.....b..b..', '..bb.bb..bb.bb..'],
  ishigame: ['................', '................', '................', '................', '................', '................', '................', '................', '......kkkkk.....', '....kkNNnNNkk...', '...kNnNnNnNnNk..', '.kkkNNnNNnNNNkk.', 'ksskkkkkkkkkk...', '.kk.kk....kk.kk.', '.b..b.....b..b..', '..bb.bb..bb.bb..'],
  akaza: ['................', '................', '................', '................', '................', '................', '................', '................', '....kkkkkkk.....', '..kkGGGGGGGkk.k.', '.kwkGGGGGGGGGkkk', 'kk.kggggggggkk.k', '.k.kkkkkkkkk....', '.b..b.....b..b..', '..bb.bb..bb.bb..', '................'],
  kamatsuka: ['................', '................', '................', '................', '................', '................', '................', '................', '...kkkkkkkk.....', '.kkssnssnssskk.k', 'kwkssssssssssskk', '.kkswwwwwwwskk.k', '...kkkkkkkk.....', '.b..b.....b..b..', '..bb.bb..bb.bb..', '................'],
  misago: ['................', '................', '................', '.......kkk......', '......kwwwk.....', '......kwkNky....', '......kwwwkk....', 'kkkNNNNkwkNNNNkk', 'kNNNNNNkwkNNNNNk', '.kNNNNNkwwkNNNk.', '..kkNNNkwwkNNkk.', '....kkkkwwkkkk..', '.......kwwk.....', '.......kkkk.....', '................', '................'],
  kochidori: ['................', '................', '................', '................', '................', '................', '.......kkk......', '......knnnk.....', '......kkwkkkk...', '....kknnnnk.....', '...knnnnnnnk....', '..knnnnwwwwwk...', '...kkwwwwwwk....', '.....kkkkk......', '......y..y......', '.ssssssssssssss.'],
  shijimi: ['................', '................', '................', '................', '................', '................', '................', '......kkkk......', '....kkNNNNkk....', '...kNNGNNGNNk...', '..kNGNNGGNNGNk..', '..kNNNGNNGNNNk..', '...kkkkkkkkkk...', '.ssssssssssssss.', 'ssssssssssssssss', '................'],
  uminina: ['................', '................', '................', '................', '.......kk.......', '......kNNk......', '......kNnk......', '.....kNnNnk.....', '.....kNnnNk.....', '....kNnNnNnk....', '....kNnnNnNk....', '...kknnNnnNkk...', '....kkkkkkkk....', '.ssssssssssssss.', 'ssssssssssssssss', '................'],
};
const critterSprites = {};
for (const [k, r] of Object.entries(CRITTER_ROWS)) critterSprites[k] = sprite(r);
// 田んぼ（となりも）・水べ（となりが水）を歩いた歩数を数え、25歩をこえたら 1/40 で出会う（1日の数は game.js が決める）。出会ったら、となりに3秒出す
const critterS = { steps: 0, show: null, where: '', told: {} };
// 田んぼや 草地の すずめ（運営者の声「西尾の素朴なかわいさを随所に散りばめて」2026-10-28）：お米の まわりの 田んぼ・畑・草地・公園に ときどき 2〜3羽 おりて ついばみ、
// お米が 転がって 近づくと「ちゅん」と とびたつ。見る だけ（ポイントは つけない・ぶつからない・道を ふさがない）
const SUZUME_MAX = 3, SUZUME_LIFE = 14000, SUZUME_NEAR = 2.2;   // いちどに 3羽まで・14秒で とびさる・お米が 2.2マスより 近くで 転がると とびたつ
const suzume = { list: [], next: 0, visit: 0 };
const SUZUME_VISIT = 18;   // お米が 18秒 じっと して いる（ねむそうな 顔の あと）と、そばに すずめが おりて くる
const SUZUME_AT = () => [C.F, C.U, C.V, C.G, C.P];   // おりる 所：田んぼ・農地・畑・草地・公園（町なかでも 公園や 草地に いる）
function suzumeSpawn(x, y, now) {   // x, y：おりる マス
  const n = Math.random() < 0.5 ? 2 : 3;
  for (let i = 0; i < n && suzume.list.length < SUZUME_MAX; i++) suzume.list.push({ x: x + 0.5 + (i - (n - 1) / 2) * 0.7 + (Math.random() - 0.5) * 0.2, y: y + 0.5 + (Math.random() - 0.5) * 0.4,   // ならんで おりる（重ならない ように）
    t0: now + i * 180, fly: 0, dir: Math.random() < 0.5 ? -1 : 1, seed: Math.random() * 1000 });
}
function drawSuzume(x, y, u, dir, pose) {   // pose：0 立つ・1 ついばむ（頭を 下げる）・2 はばたく。dir：1 右むき・-1 左むき
  const hy = pose === 1 ? 1 : 0, parts = [
    [-4, 1, 1, 2, '#6b4320'],   // しっぽ
    [-3, 1, 5, 3, '#9a6630'],   // からだ
    [-3, 3, 4, 1, '#ead9b4'],   // おなか
    [1, -1 + hy, 3, 3, '#7a4422'],   // あたま（茶色い ぼうし）
    [1, 0 + hy, 2, 2, '#ffffff'],   // 白い ほっぺ
    [1, 1 + hy, 1, 1, '#1a1a1a'],   // ほっぺの 黒い てん
    [3, 0 + hy, 1, 1, '#1a1a1a'],   // 目
    [4, 1 + hy, 1, 1, '#e0a83a'],   // くちばし
    pose === 2 ? [-2, -2, 3, 3, '#5a3818'] : [-2, 1, 3, 1, '#5a3818'],   // はね
  ];
  if (pose !== 2) parts.push([-1, 4, 1, 1, '#d08a40'], [1, 4, 1, 1, '#d08a40']);   // あし
  const px = (cx, cy, cw, ch, c) => { ctx.fillStyle = c; ctx.fillRect(dir > 0 ? x + cx * u : x - (cx + cw) * u, y + cy * u, cw * u, ch * u); };
  for (const [cx, cy, cw, ch] of parts) px(cx - 1, cy - 1, cw + 2, ch + 2, '#2b1a0c');   // こい ふち（草や 生け垣の 上でも すずめの 形が 見える ように）
  for (const [cx, cy, cw, ch, c] of parts) px(cx, cy, cw, ch, c);
}
function chunSound() {   // ちゅん：すずめが とびたつ（小さく 短く 2回）
  const a = sfxCtx();
  if (!a) return;
  try {
    const t = a.currentTime;
    for (const d of [0, 0.09]) {
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'square'; o.frequency.setValueAtTime(3200, t + d); o.frequency.exponentialRampToValueAtTime(2200, t + d + 0.05);
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.02, t + d + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.06);
      o.connect(g); g.connect(a.destination); o.start(t + d); o.stop(t + d + 0.07);
    }
  } catch (e) { /* 音が 出ない 端末 */ }
}
// 道ばたで ひるねする ねこ（運営者の声「西尾の素朴なかわいさを随所に散りばめて」2026-10-28）：家の ならぶ 町の 道ばたに ときどき 1匹、まるく なって ねて いる。
// お米が 近くを 転がると 目を さまして「にゃ」と 顔を あげ、しばらく したら また ねる。見る だけ（ポイントは つけない・ぶつからない・道を ふさがない）
const NEKO_LIFE = 40000, NEKO_NEAR = 2.4, NEKO_AWAKE = 2600;   // 40秒 いる・お米が 2.4マスより 近くを 転がると おきる・2.6秒 おきて いる
const neko = { cat: null, next: 0 };
const NEKO_COLS = [['#f2a65a', '#c97a32'], ['#f4f0e6', '#9a9a9a'], ['#555555', '#2f2f2f']];   // 茶とら・白ねこ・黒ねこ
function drawNeko(x, y, u, dir, awake, col, now) {   // まるく ねて いる（awake で 顔を あげて 耳が たつ）
  const [c1, c2] = col, parts = [
    [-3, -1, 5, 1, c1], [-4, 0, 7, 3, c1],   // からだ（まるい）
    [-4, 3, 7, 1, c2],   // おなかの かげ
    [-6, 2, 2, 1, c2], [-6, 3, 1, 1, c2],   // しっぽ
  ];
  if (awake) parts.push([2, -3, 4, 3, c1], [2, -4, 1, 1, c1], [5, -4, 1, 1, c1], [3, -2, 1, 1, '#1a1a1a'], [5, -2, 1, 1, '#1a1a1a'], [4, -1, 1, 1, '#e88a9a']);   // 顔を あげる（耳・まるい 目・はな）
  else parts.push([2, -1, 4, 3, c1], [2, -2, 1, 1, c1], [5, -2, 1, 1, c1], [3, 0, 1, 1, '#3a2a1a'], [5, 0, 1, 1, '#3a2a1a']);   // 顔を ふせて ねる（耳と とじた 目）
  const px = (cx, cy, cw, ch, c) => { ctx.fillStyle = c; ctx.fillRect(dir > 0 ? x + cx * u : x - (cx + cw) * u, y + cy * u, cw * u, ch * u); };
  for (const [cx, cy, cw, ch] of parts) px(cx - 1, cy - 1, cw + 2, ch + 2, '#2b1a0c');   // こい ふち
  for (const [cx, cy, cw, ch, c] of parts) px(cx, cy, cw, ch, c);
  if (!awake) { const k = Math.floor(now / 700) % 3; for (let i = 0; i <= k; i++) px(6 + i * 2, -4 - i * 2, 2, 1, '#ffffff'); }   // すやすや（白い てんが 1つずつ ふえる）
}
function nyaSound() {   // にゃ：ねこが おきる（小さく 1回）
  const a = sfxCtx();
  if (!a) return;
  try {
    const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(620, t); o.frequency.linearRampToValueAtTime(900, t + 0.08); o.frequency.exponentialRampToValueAtTime(520, t + 0.28);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.32);
  } catch (e) { /* 音が 出ない 端末 */ }
}
// 出かたの 調整（朝の 改善 11。運営者の声「文字は減らして素朴なかわいさと平和さを散りばめる」・まれで 小さく）：すずめ・ねこ・虫・カエル・作物・どんぐりは
// 画面に 2種類まで。2種類 いる 間は、つぎの 種類は 出ない（通しで 60秒 転がして はかると、すずめ 3羽と 赤とんぼが いっしょに いる 時間が 長く、3種類 出る ことも あった）。
// ねて いる お米に おりる すずめ（suzumeVisit）・テストの put は べつ
const AMB_MAX = 2;
const ambN = () => (suzume.list.length ? 1 : 0) + (neko.cat ? 1 : 0) + (mushi.m ? 1 : 0) + (kaeru.list.length ? 1 : 0) + (nakama.n ? 1 : 0) + (donguri.d ? 1 : 0);
function nekoStep(now, ox, oy, T, w, h, dpr) {
  if (worldMode || driving || rp.x === null) { neko.cat = null; return; }
  if (!neko.cat && now > neko.next && !mapCovered() && ambN() < AMB_MAX) {   // 20〜40秒に 1回、まわり 3〜7マスの 家の となりの 地面（画面の 中）を さがす
    neko.next = now + 20000 + Math.random() * 20000;
    for (let k = 0; k < 16; k++) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 4, x = Math.floor(rp.x + Math.cos(a) * r), y = Math.floor(rp.y + Math.sin(a) * r);
      const sx = ox + x * T, sy = oy + y * T;
      if (sx < T || sy < T * 2 || sx > w - 2 * T || sy > h - 3 * T) continue;
      const c = codeAt(x, y), q = mazeOn() && mzNear(x + 0.5, y + 0.5), home = [C.Q, C.B].some(k2 => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => codeAt(x + dx, y + dy) === k2));
      if (home && ![C.B, C.Q, C.A, C.W, C.X].includes(c) && (!mazeOn() || (q && q.d > 1.15 && q.d < 1.9))) { neko.cat = { x: x + 0.5, y: y + 0.6, t0: now, awake: 0, dir: Math.random() < 0.5 ? -1 : 1, col: NEKO_COLS[Math.floor(Math.random() * NEKO_COLS.length)] }; break; }   // 家の となり（町の ねこ）。めいろでは すずめと 同じく 道の すぐ わき
    }
  }
  const n = neko.cat;
  if (!n) return;
  if (now - n.t0 > NEKO_LIFE && now - n.awake > NEKO_AWAKE) { neko.cat = null; return; }
  const sp = Math.hypot(rp.vx || 0, rp.vy || 0), near = Math.hypot(n.x - rp.x, n.y - rp.y) < NEKO_NEAR;
  if (sp > 0.8 && near && now - n.awake > NEKO_AWAKE) { n.awake = now; n.dir = rp.x > n.x ? 1 : -1; nyaSound(); }   // お米の ほうを 見て「にゃ」
  const u = Math.max(Math.round(2 * dpr), Math.round(T / 16));
  drawNeko(Math.round(ox + n.x * T), Math.round(oy + n.y * T), u, n.dir, now - n.awake < NEKO_AWAKE, n.col, now);
  dirty = true;
}
// 季節の 小さな 虫（運営者の声「文字は減らして素朴なかわいさと平和さを散りばめる」2026-10-28）：秋（8〜10月）は 赤とんぼ、春（3〜6月）は ちょうちょが 1匹、
// お米の まわりを のんびり とぶ（ときどき 空中で とまる）。お米が 近くを 転がると すっと はなれる。文字は 出さない・ポイントは つけない・ぶつからない
const MUSHI_LIFE = 15000, MUSHI_NEAR = 1.8;
const mushi = { m: null, next: 0 };
const mushiKind = () => { const mo = new Date().getMonth() + 1; return mo >= 8 && mo <= 10 ? 'tonbo' : mo >= 3 && mo <= 6 ? 'chocho' : ''; };   // 冬と 夏の はじめは 出ない
function drawMushi(x, y, u, kind, now, dir) {
  const flap = Math.floor(now / (kind === 'tonbo' ? 70 : 170)) % 2, px = (cx, cy, cw, ch, c) => { ctx.fillStyle = c; ctx.fillRect(dir > 0 ? x + cx * u : x - (cx + cw) * u, y + cy * u, cw * u, ch * u); };
  const draw = parts => { for (const [cx, cy, cw, ch] of parts) px(cx - 1, cy - 1, cw + 2, ch + 2, '#2b1a0c'); for (const [cx, cy, cw, ch, c] of parts) px(cx, cy, cw, ch, c); };   // こい ふちを つけて 描く
  if (kind === 'tonbo') {   // 赤とんぼ：すきとおった 4枚の はね（ぱたぱた）と 赤い からだ
    const wy = flap ? -1 : 0;
    draw([[-2, -4 + wy, 2, 3, '#e6f2ff'], [2, -4 + wy, 2, 3, '#e6f2ff'], [-2, 3 - wy, 2, 3, '#e6f2ff'], [2, 3 - wy, 2, 3, '#e6f2ff']]);   // 前と うしろの はね（あいだを あけて 4枚に 見える ように）
    draw([[-8, 0, 11, 2, '#e0442c'], [3, -1, 3, 4, '#9a2a18'], [-8, 0, 1, 2, '#8a2414']]);   // ほそながい 赤い からだ・あたま・しっぽの 先
  } else {   // ちょうちょ（もんしろ）：上の はねは 大きく、下は 小さく。ひらいたり とじたり
    const o = flap ? 0 : 1;
    draw([[-4 + o, -4, 3 - o, 3, '#fbfbf2'], [1, -4, 3 - o, 3, '#fbfbf2'], [-3 + o, -1, 2 - o, 2, '#fbfbf2'], [1, -1, 2 - o, 2, '#fbfbf2'], [0, -4, 1, 5, '#3a2a1a']]);
    px(-3 + o, -3, 1, 1, '#3a3a3a'); px(2, -3, 1, 1, '#3a3a3a');   // はねの 黒い てん
  }
}
// 田んぼの あぜの カエル（運営者の声「文字は減らして素朴なかわいさと平和さを散りばめる」2026-10-29）：4〜10月、田んぼの へり（となりが 田んぼで ない マス）に
// ときどき 1〜2匹 すわって いて、ときどき のどを ふくらませる。お米が 近くを 転がると ぴょんと 田んぼへ とびこんで「ぽちゃ」。文字・ポイントは なし
const KAERU_MAX = 2, KAERU_LIFE = 20000, KAERU_NEAR = 2.0;
const kaeru = { list: [], next: 0 };
const kaeruSeason = () => { const mo = new Date().getMonth() + 1; return mo >= 4 && mo <= 10; };
function drawKaeru(x, y, u, dir, pose) {   // pose：0 すわる・1 のどを ふくらませる・2 とぶ（足を のばす）
  const parts = pose === 2
    ? [[-3, -1, 5, 3, '#5cb85c'], [1, -2, 2, 1, '#5cb85c'], [-5, 1, 2, 1, '#3f8f3f'], [-6, 2, 2, 1, '#3f8f3f']]   // とぶ：からだ・目の もりあがり・のばした 足
    : [[-3, 0, 6, 3, '#5cb85c'], [-3, -1, 2, 1, '#5cb85c'], [1, -1, 2, 1, '#5cb85c'], [-4, 2, 2, 1, '#3f8f3f'], [2, 2, 2, 1, '#3f8f3f']];   // すわる：まるい からだ・目の もりあがり・足
  const px = (cx, cy, cw, ch, c) => { ctx.fillStyle = c; ctx.fillRect(dir > 0 ? x + cx * u : x - (cx + cw) * u, y + cy * u, cw * u, ch * u); };
  for (const [cx, cy, cw, ch] of parts) px(cx - 1, cy - 1, cw + 2, ch + 2, '#1e2a14');   // こい ふち
  for (const [cx, cy, cw, ch, c] of parts) px(cx, cy, cw, ch, c);
  if (pose !== 2) { px(-3, -1, 1, 1, '#ffffff'); px(-2, -1, 1, 1, '#1a1a1a'); px(1, -1, 1, 1, '#ffffff'); px(2, -1, 1, 1, '#1a1a1a'); px(-2, 2, 4, 1, '#cfe8a0'); }   // 白目と 黒目・おなか
  if (pose === 1) { px(-1, 2, 2, 2, '#f2f7d8'); }   // のどを ぷくっと
}
function potyaSound() {   // ぽちゃ：カエルが 田んぼに とびこむ（小さく やわらかく）
  const a = sfxCtx();
  if (!a) return;
  try {
    const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(180, t + 0.12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.18);
  } catch (e) { /* 音が 出ない 端末 */ }
}
// 農作物も ころころ（運営者の声「農作物もコロコロしてる」2026-10-29。JA西三河の 農産物マップより）：お米が 畑・温室・農地の そばを 転がると、季節の 作物が 1つ
// ころんと 出て きて、しばらく お米の あとを ころころ ついて くる（止まると ぴょんと はねて 消える）。文字・ポイントは なし・ぶつからない
// 作物は 西尾・西三河の 主な もの と その 季節（愛知県・東海農政局の 資料）：いちご（西三河で 県内 出荷の 約3割・冬〜春）、
// なす（西三河の ハウスの「とげなし美茄子」・10〜6月）、大豆（西尾が 県の 主な 産地・フクユタカを 12月に かりとる）。7〜9月は 出ない
const NAKAMA_FOLLOW = 6000, NAKAMA_CD = 40000;
const nakama = { n: null, next: 0 };
const otomo = { next: 0, last: '' };   // 町の おとも（otomo.js）：60〜100秒に 1回まで。同じ おともを つづけない
const NAKAMA_MONTHS = { ichigo: [12, 1, 2, 3, 4, 5], nasu: [10, 11, 12, 1, 2, 3, 4, 5, 6], daizu: [12] };
const nakamaKinds = () => { const mo = new Date().getMonth() + 1; return Object.keys(NAKAMA_MONTHS).filter(k => NAKAMA_MONTHS[k].includes(mo)); };
const nakamaKind = () => { const a = nakamaKinds(); return a.length ? a[Math.floor(Math.random() * a.length)] : ''; };   // その 月の 作物から 1つ（なければ ''）
// ころころ 仲間（いちご・なす・大豆）と どんぐりの 絵は Blender で 焼いた シート（tools/blender/korokoro-art.py → nishio-go/art/ev/korokoro.png。32×32 が 横に 4こ）。
// 読めたら その 絵を ころがる 向きに 回して 描く（1点を 画面の 整数倍に）。読めるまでは 手描き（drawNakama・drawDonguri）。
// drawNakama は ほかの 名物（うなぎ・茶わん など）を 小さく 描く ときにも 使うので、Blender の 絵は ついて くる ころころ 仲間（nakamaStep）と どんぐり だけ
const KORO_ART = ['ichigo', 'nasu', 'daizu', 'donguri'], koroArt = { img: null };
function koroReady() { if (!koroArt.img) { koroArt.img = new Image(); koroArt.img.src = 'nishio-go/art/ev/korokoro.png'; } return koroArt.img.complete && koroArt.img.naturalWidth > 0; }
function drawKoroArt(x, y, u, kind, ang) {
  const i = KORO_ART.indexOf(kind);
  if (i < 0 || !koroReady()) return false;
  const k = Math.max(1, Math.round(u / 2)), S = 32 * k, sm = ctx.imageSmoothingEnabled;
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(koroArt.img, i * 32, 0, 32, 32, -S / 2, -S / 2, S, S);
  ctx.imageSmoothingEnabled = sm; ctx.restore();
  return true;
}
function drawNakama(x, y, u, kind, ang, noFace) {   // ang：ころがる 回り（四角の 絵を まるごと 回す）。noFace：目を 描かない（かさ）
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  const px = (cx, cy, cw, ch, c) => { ctx.fillStyle = c; ctx.fillRect(cx * u, cy * u, cw * u, ch * u); };
  const draw = parts => { for (const [cx, cy, cw, ch] of parts) px(cx - 1, cy - 1, cw + 2, ch + 2, '#2b1a0c'); for (const [cx, cy, cw, ch, c] of parts) px(cx, cy, cw, ch, c); };
  if (kind === 'ichigo') {   // いちご：赤い からだ・緑の へた・つぶつぶ
    draw([[-3, -2, 6, 3, '#e8384a'], [-2, 1, 4, 1, '#e8384a'], [-1, 2, 2, 1, '#e8384a'], [-2, -3, 4, 1, '#3f9b3c'], [-1, -4, 2, 1, '#3f9b3c']]);
    for (const [cx, cy] of [[-2, -2], [1, -2], [-2, 1], [1, 1]]) px(cx, cy, 1, 1, '#ffe08a');   // 目の となりは あける
  } else if (kind === 'nasu') {   // なす：むらさきの まるい からだ・緑の へた
    draw([[-3, -1, 6, 4, '#5a2a7a'], [-2, 3, 4, 1, '#5a2a7a'], [-2, -2, 4, 1, '#3f9b3c'], [-1, -3, 2, 1, '#3f9b3c']]);
    px(-2, 0, 1, 2, '#9a6ac0');   // てかり
  } else if (kind === 'unagi') {   // うなぎ（一色）：ほそ長い こい青ねずみの からだ・おなかは うすい 黄
    draw([[-4, -1, 8, 3, '#3d4552'], [-3, 2, 6, 1, '#d9c88a'], [2, -2, 2, 1, '#3d4552']]);
  } else if (kind === 'ebisen') {   // えびせんべい（一色）：だいだい色の まるい せんべい・えびの つぶつぶ
    draw([[-3, -2, 6, 4, '#f0a050'], [-2, -3, 4, 1, '#f0a050'], [-2, 2, 4, 1, '#f0a050']]);
    for (const [cx, cy] of [[-2, -2], [2, -2], [-2, 1], [1, 1]]) px(cx, cy, 1, 1, '#d8602c');
  } else if (kind === 'tencha') {   // てん茶の 葉（西尾）：あざやかな 緑の 葉・まん中に こい 緑の すじ
    draw([[-3, -1, 6, 3, '#4e9a3a'], [-2, -2, 4, 1, '#4e9a3a'], [-2, 2, 4, 1, '#4e9a3a'], [-1, -3, 2, 1, '#2f7a2a']]);
    px(-3, 2, 1, 1, '#2f7a2a');
  } else if (kind === 'inaho') {   // 金色の 稲穂（吉良）：こがね色の もみ
    draw([[-2, -2, 4, 4, '#e8b830'], [-3, -1, 6, 2, '#e8b830'], [-1, -3, 2, 1, '#c89a20']]);
    px(-2, -2, 1, 1, '#fff0a0'); px(1, 1, 1, 1, '#b8860b');
  } else if (kind === 'asari') {   // アサリ（海べ）：茶色い すじの ある 貝
    draw([[-3, -1, 6, 3, '#c9a77a'], [-2, -2, 4, 1, '#c9a77a'], [-2, 2, 4, 1, '#c9a77a']]);
    for (const cx of [-3, 2]) px(cx, -1, 1, 3, '#8a6a44');
  } else if (kind === 'chawan') {   // 抹茶わん（西尾）：うすい 茶色の わん・上に あわだつ 抹茶の 緑
    draw([[-3, -1, 6, 3, '#c98a5a'], [-2, 2, 4, 1, '#c98a5a'], [-2, -2, 4, 1, '#7fc04a']]);
    px(-2, 0, 1, 1, '#e8b890');
  } else if (kind === 'chochin') {   // 提灯（一色）：赤い まるい ちょうちん・上下の 黒い ふた
    draw([[-3, -2, 6, 4, '#d8302c'], [-2, -3, 4, 1, '#d8302c'], [-2, 2, 4, 1, '#d8302c'], [-2, -4, 4, 1, '#3a2a1a'], [-2, 3, 4, 1, '#3a2a1a']]);
    px(-3, 0, 6, 1, '#f0b040');
  } else if (kind === 'carnation') {   // カーネーション（幡豆）：ピンクの 花びらと 緑の くき
    draw([[-3, -2, 6, 3, '#f06a9a'], [-2, -3, 4, 1, '#f06a9a'], [-1, 1, 2, 1, '#3f9b3c'], [-1, 2, 2, 1, '#3f9b3c']]);
    px(-1, -1, 2, 1, '#ffd0e0');
  } else if (kind === 'unadon') {   // うな丼（一色）：赤い どんぶり・上に 照りの ある うなぎ
    draw([[-3, 0, 6, 3, '#b03a2a'], [-2, 3, 4, 1, '#b03a2a'], [-3, -2, 6, 2, '#6a3a1a'], [-2, -3, 4, 1, '#6a3a1a']]);
    px(-2, -2, 2, 1, '#a8642a');
  } else if (kind === 'parfait') {   // 抹茶パフェ（西尾）：ガラスの 器・抹茶の 緑と クリームの 白
    draw([[-2, 0, 4, 3, '#e8f4f0'], [-1, 3, 2, 1, '#e8f4f0'], [-3, -2, 6, 2, '#7fc04a'], [-2, -3, 4, 1, '#fff4e0']]);
    px(-2, 1, 4, 1, '#a8d878');
  } else if (kind === 'kakigori') {   // かき氷（西尾）：氷の 山に 抹茶の 緑の みつ
    draw([[-3, -1, 6, 3, '#e8f4f0'], [-2, -2, 4, 1, '#e8f4f0'], [-2, 2, 4, 1, '#9ab8c8']]);
    px(-2, -2, 4, 1, '#7fc04a'); px(-3, -1, 2, 1, '#a8d878');
  } else if (kind === 'chasoba') {   // 茶そば（西尾）：茶色い せいろ・緑の めん
    draw([[-3, 1, 6, 2, '#6a4a2a'], [-3, -1, 6, 2, '#8fbf6a'], [-2, -2, 4, 1, '#8fbf6a']]);
    px(-1, -1, 1, 1, '#4e9a3a');
  } else {   // 大豆：うす黄色の まるい つぶ
    draw([[-2, -2, 4, 4, '#e8d08a'], [-3, -1, 6, 2, '#e8d08a']]);
    px(-1, -1, 1, 1, '#fff4c8'); px(1, 1, 1, 1, '#b89a50');
  }
  if (noFace) { /* かさは 目なし */ } else if (kind !== 'daizu') { const e = kind === 'nasu' || kind === 'unagi' ? '#fff4e0' : '#1a1a1a'; px(-1, 0, 1, 1, e); px(1, 0, 1, 1, e); } else { px(-1, -1, 1, 1, '#1a1a1a'); px(1, -1, 1, 1, '#1a1a1a'); }   // にこっと した 目（なすは 色が こいので 白い 目）
  ctx.restore();
}
// お米つぶの にもつ（nimotsu.js）：着いた 名所の 名物を、転がって いる お米の あたまに のせる（絵は おともと 同じ drawNakama。
// お米が はねると いっしょに ぽよんと 動き、ねむって いる ときは 蝶と ぶつかるので 描かない）
function drawNimotsu(hx, by, u, now, sleepy) {
  const kind = window.nishioGo && window.nishioGo.nimotsu;
  if (!kind || sleepy) return;
  const bob = Math.sin(now / 420) * 0.35 * u;
  drawNakama(Math.round(hx), Math.round(by - 12.5 * u + bob), Math.max(1, Math.round(u * 0.8)), kind, 0);
}
// お米つぶの ゆめ（yume.js）：ねむって いる あいだ、いる 町の 名物を 頭の 左うえの ゆめの 吹き出しに 見る。おきると、見た ゆめを ひと言。
// 町と 月で ねむり はじめに 1つ きめる（前と 同じ ゆめは つづけない）。西尾市の 外では 見ない。ねむり はじめた ときだけ さがす
const yume = { cur: null, last: '', t0: 0, drawn: 0 };   // drawn：描いた 数（テスト用）
function yumeFind() {
  if (!window.NISHIO_YUME || !LU || rp.x === null || worldMode) return null;
  const ll = toLatLng(rp.x, rp.y);
  let near = '';
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) near += luAt(ll.lat + a * LU.dLat, ll.lng + b * LU.dLng);   // まわり100mメッシュ9つ
  return window.NISHIO_YUME.pick({ city: here.city, town: here.town, near, month: new Date().getMonth() + 1 }, yume.last);
}
function yumeStep(hx, by, u, now, sleepy) {
  if (sleepy && !yume.cur) {   // ねむり はじめ
    const y = yumeFind();
    if (!y) return;
    yume.cur = y; yume.last = y.id; yume.t0 = now;
    if (G.track) G.track('kome_yume', { id: y.id });
  } else if (!sleepy && yume.cur) {   // おきた：見た ゆめを ひと言
    const y = yume.cur; yume.cur = null;
    if (!mapCovered()) riceSay(y.say, 2600, 'happy');
    return;
  }
  if (!sleepy || !yume.cur) return;
  const k = Math.min(1, (now - yume.t0) / 700), bob = calmMotion ? 0 : Math.sin(now / 900) * 0.5 * u, q = Math.max(1, Math.round(u * 0.8));
  const cx = hx - 15 * u, cy = by - 19 * u + bob;   // 頭の 左うえ（Z は 右うえ）
  ctx.save(); ctx.globalAlpha = k;
  ctx.fillStyle = '#fffdf3'; ctx.strokeStyle = '#2a2420'; ctx.lineWidth = Math.max(1, Math.round(u * 0.5));
  const puff = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); };
  puff(hx - 8 * u, by - 12 * u, 0.9 * u); puff(hx - 10.5 * u, by - 14.5 * u, 1.4 * u);   // 頭から ゆめへ つづく 小さな まる
  for (const [dx, dy, r] of [[-3.5, 0, 4.5], [3.5, 0, 4.5], [0, -3, 5], [0, 3, 4.5]]) puff(cx + dx * u, cy + dy * u, r * u);
  for (const [dx, dy, r] of [[-3.5, 0, 4.5], [3.5, 0, 4.5], [0, -3, 5], [0, 3, 4.5]]) { ctx.beginPath(); ctx.arc(cx + dx * u, cy + dy * u, r * u - ctx.lineWidth, 0, Math.PI * 2); ctx.fill(); }   // ふちの 内がわを ぬりつぶして 1つの くもに
  ctx.restore();
  ctx.save(); ctx.globalAlpha = k;
  drawNakama(Math.round(cx), Math.round(cy), q, yume.cur.id, 0);
  ctx.restore();
  yume.drawn++; dirty = true;
}
// お米つぶの ねどこ（nedoko.js）：ねむって いる あいだ、いる 町と 月に 合った 名物が お米の 下に ならんで ねどこに なる。しき おわると お米が ひと言。おきると 消える。
// ねむり はじめに 1つ きめる（前と 同じ ものは つづけない）。西尾市の 外・ゲームボーイの4色では 出さない。お米の うしろ（下）に 描く
const nedoko = { cur: null, last: '', t0: 0, said: false, drawn: 0 };   // drawn：描いた 数（テスト用）
function nedokoStep(hx, by, u, now, sleepy) {
  const n = nedoko;
  if (!sleepy || !window.NISHIO_NEDOKO || gbOn || worldMode || driving || rp.x === null) { n.cur = null; n.said = false; return; }
  if (!n.cur) {   // ねむり はじめ
    const c = kasaFind(), d = c ? window.NISHIO_NEDOKO.pick(Object.assign(c, { month: new Date().getMonth() + 1 }), n.last) : null;
    if (!d) return;
    n.cur = d; n.last = d.id; n.t0 = now; n.said = false;
    if (G.track) G.track('kome_nedoko', { id: d.id });
  }
  const age = now - n.t0, k = Math.min(1, age / window.NISHIO_NEDOKO.SETTLE);
  if (!n.said && k >= 1 && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(n.cur.say, 2600, 'happy'); n.said = true; }
  const q = Math.max(1, Math.round(u * 0.8)), bob = calmMotion ? 0 : Math.sin(now / 900) * 0.3 * u;
  ctx.globalAlpha = k;
  [[-15, 0], [-6, 1], [6, 1], [15, 0]].forEach(([dx, dy]) => drawNakama(Math.round(hx + dx * u), Math.round(by + (10.5 + dy) * u + bob), q, n.cur.id, 0, true));   // 4つ ならべて ふとんに（目は 描かない）
  ctx.globalAlpha = 1;
  n.drawn++; dirty = true;
}
// お米つぶの ゆあみ（yuami.js）：吉良で 止まって じっと すると、お米の まわりに 湯が わいて 吉良温泉に つかる（湯けむりが のぼる）。海べなら 波と うきわで 吉良ワイキキビーチ。
// つかった とき お米が ひと言。動くか ねむりだすと 消える。西尾市の 吉良の 中だけ・ゲームボーイの4色では 出さない。お米の うしろに 描く
const yuami = { cur: null, t0: 0, still0: 0, said: false, chk: 0, drawn: 0 };   // drawn：描いた 数（テスト用）
function yuamiStep(hx, by, u, now) {
  const y = yuami, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_YUAMI || !still || gbOn || rp.x === null || roll.idle > 12 || tsutsumi.cur || tsutsumi.done) { y.cur = null; y.said = false; y.chk = 0; return; }
  if (!y.cur) {
    if (roll.idle < window.NISHIO_YUAMI.STILL || now < y.chk) return;
    y.chk = now + 2000;   // 2秒に 1回 町を しらべる
    const c = kasaFind(), d = c ? window.NISHIO_YUAMI.pick(c) : null;
    if (!d) return;
    y.cur = d; y.t0 = now; y.said = false;
    if (G.track) G.track('kome_yuami', { id: d.id });
  }
  const age = now - y.t0, k = Math.min(1, age / window.NISHIO_YUAMI.SETTLE);
  if (!y.said && k >= 1 && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(y.cur.say, 2600, 'happy'); y.said = true; }
  if (k >= 1) roll.happyT = Math.max(roll.happyT, 0.3);   // つかって いる あいだは にこにこ顔
  const q = Math.max(1, Math.round(u * 0.8)), px = (cx, cy, cw, ch, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  const t = calmMotion ? 0 : now / 1000;
  ctx.globalAlpha = k;
  if (y.cur.id === 'onsen') {   // 湯：岩の ふちに 白っぽい 湯。湯けむりが ゆらゆら のぼる
    px(-17, 5, 34, 9, '#6b5a4a'); px(-16, 6, 32, 7, '#8fd3e0'); px(-14, 7, 6, 1, '#d8f4f8'); px(5, 9, 8, 1, '#d8f4f8');
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.5 + i / 3) % 1;
      ctx.globalAlpha = k * (1 - ph) * 0.7;
      px(-10 + i * 10 + Math.sin(t * 2 + i * 2) * 1.5, -13 - ph * 12, 4, 2.5, '#ffffff');
    }
  } else {   // ビーチ：波の しま・うきわ（赤と 白）
    px(-18, 8, 36, 6, '#4aa8d8'); px(-18, 8, 36, 1, '#bfe8f6');
    const w = Math.sin(t * 2) * 1.5;
    px(-15 + w, 10, 6, 1, '#bfe8f6'); px(7 - w, 12, 6, 1, '#bfe8f6');
    px(-17, 6, 4, 4, '#e8384a'); px(13, 6, 4, 4, '#e8384a'); px(-13, 7, 26, 3, '#fff7e6'); px(-5, 7, 4, 3, '#e8384a'); px(5, 7, 4, 3, '#e8384a');
  }
  ctx.globalAlpha = 1;
  y.drawn++; dirty = true;
}
// お米つぶの ほりだし（horidashi.js）：一色・幡豆の 海べで 止まって じっと すると、お米が 砂を ほり（砂が とぶ）、干潟の 貝を ほり当てる。貝が 砂から 顔を 出し、お米が ひと言。
// 7秒ごとに つぎの 貝。動くか ねむりだすと 消える。西尾市の 中だけ・ゲームボーイの4色では 出さない・ゆあみ〈吉良〉が 出ている ときは 出さない。お米の うしろに 描く
const horidashi = { cur: null, last: '', t0: 0, chk: 0, said: false, drawn: 0 };   // drawn：描いた 数（テスト用）
function horidashiStep(hx, by, u, now) {
  const h = horidashi, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_HORIDASHI || !still || gbOn || rp.x === null || roll.idle > 12 || yuami.cur || shimatabi.cur || tombolo.cur || tsutsumi.cur || tsutsumi.done) { h.cur = null; h.said = false; h.chk = 0; return; }
  const H = window.NISHIO_HORIDASHI;
  if (!h.cur || now - h.t0 >= H.CYCLE) {
    if (!h.cur && (roll.idle < H.STILL || now < h.chk)) return;
    h.chk = now + 2000;   // 2秒に 1回 町を しらべる
    const c = kasaFind(), d = c ? H.pick(c, h.last) : null;
    if (!d) { h.cur = null; return; }
    h.cur = d; h.last = d.id; h.t0 = now; h.said = false;
    if (G.track) G.track('kome_horidashi', { id: d.id });
  }
  const age = now - h.t0, dig = Math.min(1, age / H.DIG), t = calmMotion ? 0 : now / 1000;
  const px = (cx, cy, cw, ch, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  px(-18, 11, 36, 4, '#e8cf94'); px(-16, 12, 8, 1, '#c9ad70'); px(4, 13, 10, 1, '#c9ad70');   // 干潟の 砂
  if (dig < 1) {   // ほっている：砂が ぱっぱっと とぶ
    for (let i = 0; i < 6; i++) {
      const ph = (t * 2.2 + i / 6) % 1, sd = i % 2 ? 1 : -1;
      ctx.globalAlpha = 1 - ph;
      px(sd * (10 + ph * 8) - 1, 10 - Math.sin(ph * Math.PI) * 9, 2.5, 2.5, i % 3 ? '#e8cf94' : '#c9ad70');
    }
    ctx.globalAlpha = 1;
    px(-11, 10, 5, 2, '#c9ad70'); px(7, 10, 5, 2, '#c9ad70');   // ほった あとの もりあがり
  } else {   // ほり当てた：貝が 砂から ぴょこっと 顔を 出す
    if (!h.said && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(h.cur.say, 2600, 'happy'); h.said = true; }
    roll.happyT = Math.max(roll.happyT, 0.3);   // にこにこ顔
    const up = Math.min(1, (age - H.DIG) / 400), s = Math.round(u * 1.2 * 16), bob = calmMotion ? 0 : Math.sin(t * 5) * 0.8;
    px(8, 11, 14, 3, '#e8cf94');
    ctx.drawImage(critterSprites[h.cur.id], Math.round(hx + 7 * u), Math.round(by + (-2 - bob - (1 - up) * -8) * u), s, s);
    px(7, 12, 16, 3, '#e8cf94');   // 砂から 半分 出て いる ように 手前を 砂で かくす
  }
  h.drawn++; dirty = true;
}
// お米つぶの つつみづくり（tsutsumi.js）：西尾市の 吉良の 田んぼで 止まって じっと すると、お米の うしろで 領民に まじって 土を はこび、堤が 少しずつ 高く なる。
// 「長さ180m・高さ4m」の 黄金堤が できたら、田の 稲穂が 金色に かわる。そのつど お米が ひと言。動くか ねむりだすと 消える。ひと通り おわったら 動くまで くりかえさない
// 吉良の 田んぼの 中だけ・ゲームボーイの4色では 出さない。お米の うしろに 描く（ゆあみ・ほりだしより 先に 出る）
const tsutsumi = { cur: null, t0: 0, chk: 0, n: 0, done: false, drawn: 0 };   // n：言った ひと言の 数。drawn：描いた 数（テスト用）
function tsutsumiStep(hx, by, u, now) {
  const m = tsutsumi, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_TSUTSUMI || !still || gbOn || rp.x === null || roll.idle > 12) { m.cur = null; m.n = 0; m.done = false; m.chk = 0; return; }
  const T = window.NISHIO_TSUTSUMI;
  if (!m.cur) {
    if (m.done || roll.idle < T.STILL || now < m.chk) return;
    m.chk = now + 2000;   // 2秒に 1回 場所を しらべる
    const f = kasaFind(), d = f ? T.pick(f) : null;
    if (!d) return;
    m.cur = d; m.t0 = now; m.n = 0;
    if (G.track) G.track('kome_tsutsumi', { id: d.id });
  }
  const age = now - m.t0, t = calmMotion ? 0 : now / 1000;
  const k = Math.min(1, age / T.BUILD), g = Math.max(0, Math.min(1, (age - T.BUILD) / T.GOLD));
  const px = (cx, cy, cw, ch, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  ctx.globalAlpha = Math.min(1, age / 400);
  for (let i = 0; i < 13; i++) {   // 田の 稲穂：はじめは 緑、できあがると 金色に かわり ゆらゆら
    const sw = Math.sin(t * 2 + i) * 0.8 * g, x = -26 + i * 4;
    px(x, 11, 0.8, 5, '#7fae45'); px(x + sw, 9.5, 1.6, 2.5, g > 0.5 ? '#e8b923' : '#9dc94f');
  }
  const h = 14 * k;   // 堤：土の 色の 台に 草の 帽子。上へ 少しずつ のびる
  px(-24, 15 - h, 48, h, '#8a6a43'); px(-24, 15 - h, 48, Math.min(1.5, h), g > 0.5 ? '#d9b44a' : '#6fa04a');
  if (age < T.BUILD) {   // 領民：土を かついで 堤に むかって ならぶ
    for (let i = 0; i < 3; i++) {
      const x = -22 + i * 18 + (calmMotion ? 0 : Math.sin(t * 3 + i * 2) * 1.5), y = 13 - h + Math.abs(Math.sin(t * 6 + i)) * (calmMotion ? 0 : 0.8);
      px(x, y - 5, 2, 2, '#e6c9a0'); px(x, y - 3, 2, 3, '#5b6f8a'); px(x + 2, y - 4, 2.5, 2, '#a07a4c');
    }
  }
  ctx.globalAlpha = 1;
  roll.happyT = Math.max(roll.happyT, 0.3);   // にこにこ顔
  const at = [600, T.BUILD + 200, T.BUILD + T.GOLD], say = [m.cur.say, m.cur.done, m.cur.gold];
  if (m.n < 3 && age >= at[m.n] && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(say[m.n], 2800, 'happy'); m.n++; }
  if (m.n >= 3 && age > T.BUILD + T.GOLD + T.HOLD) { m.cur = null; m.done = true; return; }   // ひと通り おわり：動くまで くりかえさない
  m.drawn++; dirty = true;
}
// お米つぶの しまたび（shimatabi.js）：西尾市の 佐久島で 止まって じっと すると、お米の うしろが 島の ひとこまに なる。アート作品の 台座・黒壁の 集落・一色港からの 高速船が 7秒ごとに かわり、かわるたび お米が ひと言。
// 動くか ねむりだすと 消える。前と 同じ 場面は つづけない・西尾市の 佐久島の 中だけ・ゲームボーイの4色では 出さない。お米の うしろに 描く（ほりだし・ゆあみより 先に 出る）
const shimatabi = { cur: null, last: '', t0: 0, chk: 0, said: false, drawn: 0 };   // drawn：描いた 数（テスト用）
function shimatabiStep(hx, by, u, now) {
  const m = shimatabi, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_SHIMATABI || !still || gbOn || rp.x === null || roll.idle > 12) { m.cur = null; m.said = false; m.chk = 0; return; }
  const S = window.NISHIO_SHIMATABI;
  if (!m.cur || now - m.t0 >= S.CYCLE) {
    if (!m.cur && (roll.idle < S.STILL || now < m.chk)) return;
    m.chk = now + 2000;   // 2秒に 1回 町を しらべる
    const c = kasaFind(), d = c ? S.pick(c, m.last) : null;
    if (!d) { m.cur = null; return; }
    m.cur = d; m.last = d.id; m.t0 = now; m.said = false;
    if (G.track) G.track('kome_shimatabi', { id: d.id });
  }
  const age = now - m.t0, t = calmMotion ? 0 : now / 1000;
  const px = (cx, cy, cw, ch, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  ctx.globalAlpha = Math.min(1, age / 500);
  if (m.cur.id === 'art') {   // 作品の 台座：石の 台に 名札。まわりに 赤い ポールと ロープ
    px(-14, 11, 28, 4, '#b8b2a4'); px(-14, 11, 28, 1, '#d8d3c6'); px(-14, 14, 28, 1, '#8c8678'); px(-4, 12.5, 8, 1.5, '#4a4a4a');
    px(-18, 8, 2, 7, '#c0392b'); px(16, 8, 2, 7, '#c0392b'); px(-16, 9, 4, 1, '#e6d3a3'); px(12, 9, 4, 1, '#e6d3a3');
  } else if (m.cur.id === 'kurokabe') {   // 黒壁：黒い 板壁に 銀ねずの 瓦の ひさし
    px(-22, -8, 44, 23, '#2b2f36'); for (let i = 0; i < 11; i++) px(-22 + i * 4, -6, 0.6, 21, '#1d2026');
    px(-24, -11, 48, 3, '#7a7f86'); px(-24, -8, 48, 1, '#5b5f66'); px(12, -2, 7, 6, '#161a1f'); px(13, -1, 5, 4, '#e0c070');
  } else {   // 高速船：海の 帯を 白い 船が ゆっくり 横ぎる
    px(-24, 12, 48, 3, '#4a8fc2'); px(-24, 12, 48, 1, '#7db5dc');
    for (let i = 0; i < 4; i++) px(-20 + i * 12 + Math.sin(t * 2 + i) * 2, 13.5, 4, 0.8, '#e8f3fb');
    const sx = calmMotion ? -6 : -22 + ((age / 7000) % 1) * 34;
    px(sx, 8, 14, 3, '#f4f4f4'); px(sx, 11, 14, 1.5, '#2f6fb0'); px(sx + 4, 5, 6, 3, '#f4f4f4'); px(sx + 5, 6, 4, 1, '#222');
  }
  ctx.globalAlpha = 1;
  roll.happyT = Math.max(roll.happyT, 0.3);   // にこにこ顔
  if (!m.said && age > 600 && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(m.cur.say, 2800, 'happy'); m.said = true; }
  m.drawn++; dirty = true;
}
// お米つぶの ちょうちんよる（chochinyoru.js）：夜に 西尾市の 一色の 町なかで 止まって じっと すると、お米の うしろに 提灯の あかりが ともる。大提灯の あかり・提灯の れつ・大提灯を 見あげる が 7秒ごとに かわり、かわるたび お米が ひと言。
// 動くか ねむりだすと 消える。前と 同じ 場面は つづけない・夜の 一色の 町なか（佐久島の 外・まわりに 海が ない 所）の 中だけ・ゲームボーイの4色では 出さない。いっしきさんぽ・めぐりの 輪に 先んじる。お米の うしろに 描く
const chochinyoru = { cur: null, last: '', t0: 0, chk: 0, said: false, drawn: 0 };   // drawn：描いた 数（テスト用）
function chochinyoruStep(hx, by, u, now) {
  const m = chochinyoru, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_CHOCHINYORU || !still || gbOn || rp.x === null || roll.idle > 12 || !nightOn || nightLevel() < 1) { m.cur = null; m.said = false; m.chk = 0; return; }
  const S = window.NISHIO_CHOCHINYORU;
  if (!m.cur || now - m.t0 >= S.CYCLE) {
    if (!m.cur && (roll.idle < S.STILL || now < m.chk)) return;
    m.chk = now + 2000;   // 2秒に 1回 町を しらべる
    const c = kasaFind(), d = c ? S.pick(Object.assign(c, { night: true }), m.last) : null;
    if (!d) { m.cur = null; return; }
    m.cur = d; m.last = d.id; m.t0 = now; m.said = false;
    if (G.track) G.track('kome_chochinyoru', { id: d.id });
  }
  const age = now - m.t0, t = calmMotion ? 0 : now / 1000, id = m.cur.id, fade = Math.min(1, age / 500);
  const px = (cx, cy, cw, ch, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  const glow = (cx, cy, r, al) => { for (let k = 3; k >= 1; k--) { ctx.globalAlpha = fade * al * (4 - k) / 3 * 0.5; px(cx - r * k / 3, cy - r * k / 3, r * 2 * k / 3, r * 2 * k / 3, '#ffb040'); } ctx.globalAlpha = fade; };
  const lantern = (cx, cy, w, h) => {   // 赤い 丸い 提灯：上下の 黒い ふた・まんなかの 金の すじ
    px(cx - w / 2, cy, w, h, '#d8302c'); px(cx - w / 2 + 1, cy - 1, w - 2, 1, '#d8302c'); px(cx - w / 2 + 1, cy + h, w - 2, 1, '#d8302c');
    px(cx - w / 4, cy - 2, w / 2, 1.5, '#3a2a1a'); px(cx - w / 4, cy + h + 0.5, w / 2, 1.5, '#3a2a1a');
    px(cx - w / 2, cy + h / 2, w, 1, '#f0b040'); px(cx - w / 2 + 1, cy + 1, 1, h - 2, '#ff7a60');
  };
  ctx.globalAlpha = fade;
  const pulse = calmMotion ? 1 : 0.85 + Math.sin(t * 3) * 0.15;
  if (id === 'tomoru') {   // 大提灯の あかり：お米の よこ上に 大きな 提灯が ぽうっと ともる
    glow(14, -12, 14 * pulse, 0.8); lantern(14, -18, 14, 14);
  } else if (id === 'narabu') {   // 提灯の れつ：ひもに 5つ ならんで ゆらゆら
    px(-22, -16, 44, 1, '#3a2a1a');
    for (let i = 0; i < 5; i++) { const sw = calmMotion ? 0 : Math.sin(t * 2 + i * 0.9) * 1.5; glow(-18 + i * 9 + sw, -10, 5 * pulse, 0.8); lantern(-18 + i * 9 + sw, -14, 6, 7); }
  } else {   // 大提灯を 見あげる：お米の 真上に 大きく どーんと
    glow(0, -28, 20 * pulse, 0.7); lantern(0, -38, 22, 22);
  }
  ctx.globalAlpha = 1;
  roll.happyT = Math.max(roll.happyT, 0.3);   // にこにこ顔
  if (!m.said && age > 600 && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(m.cur.say, 2800, 'happy'); m.said = true; }
  m.drawn++; dirty = true;
}
// お米つぶの かわべさんぽ（kawabe.js）：西尾市の 川・池・用水の そば（海べでは ない 所）で 止まって じっと すると、お米の うしろが 水べの ひとこまに なる。矢作川が 三河湾へ・メダカ・アカザと イチモンジタナゴ・ミサゴ・ニホンイシガメが 7秒ごとに かわり、かわるたび お米が ひと言。
// 動くか ねむりだすと 消える。前と 同じ 場面は つづけない・西尾市の 水べの 中だけ・ゲームボーイの4色では 出さない。ほかの 場所・町の 場面が 出て いる 間は 譲り、ちゃせきには 先んじる。お米の うしろに 描く
const kawabe = { cur: null, last: '', t0: 0, chk: 0, said: false, drawn: 0 };   // drawn：描いた 数（テスト用）
function kawabeStep(hx, by, u, now) {
  const m = kawabe, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_KAWABE || !still || gbOn || rp.x === null || roll.idle > 12 || tsutsumi.cur || chochinyoru.cur || isshiki.cur || shimatabi.cur || yuami.cur || horidashi.cur || hazusanpo.cur || tombolo.cur || jokamachi.cur || mangekyo.cur || chatsumi.cur) { m.cur = null; m.said = false; m.chk = 0; return; }
  const S = window.NISHIO_KAWABE;
  if (!m.cur || now - m.t0 >= S.CYCLE) {
    if (!m.cur && (roll.idle < S.STILL || now < m.chk)) return;
    m.chk = now + 2000;   // 2秒に 1回 場所を しらべる
    const c = kasaFind(), d = c ? S.pick(c, m.last) : null;
    if (!d) { m.cur = null; return; }
    m.cur = d; m.last = d.id; m.t0 = now; m.said = false;
    if (G.track) G.track('kome_kawabe', { id: d.id });
  }
  const age = now - m.t0, t = calmMotion ? 0 : now / 1000, id = m.cur.id, fade = Math.min(1, age / 500);
  const px = (cx, cy, cw, ch, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  const spr = (k, cx, cy, sc) => { if (critterSprites[k]) ctx.drawImage(critterSprites[k], Math.round(hx + cx * u), Math.round(by + cy * u), Math.round(u * sc * 16), Math.round(u * sc * 16)); };
  const water = (y, h) => { px(-20, y, 40, h, '#4a8fc4'); px(-20, y, 40, 1, '#8cc4e8'); for (let i = 0; i < 3; i++) { const sh = calmMotion ? 0 : Math.sin(t * 2 + i * 2) * 2; px(-14 + i * 12 + sh, y + 2, 5, 1, '#a8d4ee'); } };
  ctx.globalAlpha = fade;
  if (id === 'yahagi') {   // 矢作川が 三河湾へ：細い 川が 右へ ひろがって 海に 注ぐ
    px(-20, 4, 22, 5, '#4a8fc4'); px(-20, 4, 22, 1, '#8cc4e8'); px(-2, 2, 14, 9, '#3f84bc'); px(10, -2, 12, 17, '#2f6ea8');
    for (let i = 0; i < 3; i++) { const sh = calmMotion ? 0 : ((t * 6 + i * 8) % 24); px(-20 + sh, 6, 3, 1, '#d6ecf8'); }
    px(-20, 9, 22, 2, '#b99c5e'); px(-20, 2, 22, 2, '#7ba04a');
  } else if (id === 'medaka') {   // メダカ：水の 中を すいすい
    water(4, 12); const sw = calmMotion ? 0 : Math.sin(t * 1.6) * 6;
    spr('medaka', -10 + sw, 2, 1); spr('medaka', 6 - sw, 6, 0.8);
  } else if (id === 'uo') {   // アカザと イチモンジタナゴ：川の 底と なかほど
    water(2, 14); px(-20, 14, 40, 2, '#7a6a4a'); const sw = calmMotion ? 0 : Math.sin(t * 1.4) * 5;
    spr('akaza', -14 + sw, 2, 1); spr('sakana', 4 - sw, -2, 0.9);
  } else if (id === 'misago') {   // ミサゴ：空から 水面を 見おろす
    water(8, 8); const fly = calmMotion ? 0 : Math.sin(t * 1.2) * 8;
    spr('misago', -6 + fly, -16, 1.3);
  } else {   // ニホンイシガメ：田んぼの あぜで ひなたぼっこ
    water(8, 8); px(-12, 4, 24, 5, '#b99c5e'); px(-12, 4, 24, 1, '#7ba04a');
    for (let i = 0; i < 5; i++) px(-10 + i * 5, 1 + (i % 2), 1.5, 3, '#e0c030');   // 稲穂
    spr('ishigame', -7, -6, 1.1);
  }
  ctx.globalAlpha = 1;
  roll.happyT = Math.max(roll.happyT, 0.3);   // にこにこ顔
  if (!m.said && age > 600 && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(m.cur.say, 2800, 'happy'); m.said = true; }
  m.drawn++; dirty = true;
}
// お米つぶの いっしきさんぽ（isshiki.js）：西尾市の 一色の 町なかで 止まって じっと すると、お米の うしろが 一色の ひとこまに なる。えびせんべい焼き・うなぎ約2割・養鰻・さかな広場が 7秒ごとに かわり、かわるたび お米が ひと言。
// 動くか ねむりだすと 消える。前と 同じ 場面は つづけない・西尾市の 一色の 町なか（佐久島の 外・まわりに 海が ない 所）の 中だけ・ゲームボーイの4色では 出さない。お米の うしろに 描く
const isshiki = { cur: null, last: '', t0: 0, chk: 0, said: false, drawn: 0 };   // drawn：描いた 数（テスト用）
function isshikiStep(hx, by, u, now) {
  const m = isshiki, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_ISSHIKI || !still || gbOn || rp.x === null || roll.idle > 12 || chochinyoru.cur) { m.cur = null; m.said = false; m.chk = 0; return; }
  const S = window.NISHIO_ISSHIKI;
  if (!m.cur || now - m.t0 >= S.CYCLE) {
    if (!m.cur && (roll.idle < S.STILL || now < m.chk)) return;
    m.chk = now + 2000;   // 2秒に 1回 町を しらべる
    const c = kasaFind(), d = c ? S.pick(c, m.last) : null;
    if (!d) { m.cur = null; return; }
    m.cur = d; m.last = d.id; m.t0 = now; m.said = false;
    if (G.track) G.track('kome_isshiki', { id: d.id });
  }
  const age = now - m.t0, t = calmMotion ? 0 : now / 1000;
  const px = (cx, cy, cw, ch, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  ctx.globalAlpha = Math.min(1, age / 500);
  if (m.cur.id === 'ebisen') {   // えびせんべい焼き：鉄の 台の 上で せんべいが じゅうじゅう。けむりが ゆらゆら
    px(-16, 11, 32, 3, '#4a4a4e'); px(-16, 11, 32, 1, '#76767c'); px(-14, 14, 3, 1.5, '#2e2e32'); px(11, 14, 3, 1.5, '#2e2e32');
    for (let i = 0; i < 3; i++) { const fl = !calmMotion && Math.sin(t * 3 + i) > 0.6; drawNakama(Math.round(hx + (-9 + i * 9) * u), Math.round(by + (9 - (fl ? 2 : 0)) * u), Math.max(1, Math.round(u * 0.8)), 'ebisen', 0, true); }
    for (let i = 0; i < 3; i++) { const ph = (t * 0.8 + i / 3) % 1; ctx.globalAlpha = Math.min(1, age / 500) * 0.5 * (1 - ph); px(-10 + i * 9 + Math.sin(ph * 6 + i) * 2, 6 - ph * 8, 2, 2, '#eeeeee'); }
  } else if (m.cur.id === 'unagi2') {   // 約2割：10この まるの うち 2つが うなぎ（のこりは 色を うすく）
    for (let i = 0; i < 10; i++) {
      const gx = -18 + (i % 5) * 8, gy = 6 + Math.floor(i / 5) * 6;
      if (i < 2) drawNakama(Math.round(hx + (gx + 3) * u), Math.round(by + (gy + 2) * u), Math.max(1, Math.round(u * 0.8)), 'unagi', 0, true);
      else { ctx.globalAlpha = Math.min(1, age / 500) * 0.45; px(gx, gy, 5, 4, '#9fb0c0'); ctx.globalAlpha = Math.min(1, age / 500); }
    }
  } else if (m.cur.id === 'yoman') {   // 養鰻：池に うなぎが くねくね。たて札
    px(-20, 10, 40, 5, '#3e86a8'); px(-20, 10, 40, 1, '#8cc8de'); px(-20, 15, 40, 1, '#2b5f78');
    const w = calmMotion ? 0 : Math.sin(t * 2) * 6;
    drawNakama(Math.round(hx + (-4 + w) * u), Math.round(by + 12.5 * u), Math.max(1, Math.round(u * 0.8)), 'unagi', 0, true);
    px(14, 3, 1, 8, '#7a4a22'); px(11, 1, 7, 4, '#e6d3a3'); px(12, 2, 5, 1, '#7a4422'); px(12, 3.5, 3, 1, '#7a4422');
  } else {   // さかな広場：木の 台に 魚が ならぶ。のぼり
    px(-18, 11, 36, 4, '#a9763f'); px(-18, 11, 36, 1, '#c9955a'); px(-18, 14, 36, 1, '#7a4f26');
    for (let i = 0; i < 4; i++) { const fx = -14 + i * 8; px(fx, 8.5, 6, 2.5, i % 2 ? '#e8e8ee' : '#9fc0d8'); px(fx + 5.5, 9, 2, 1.5, i % 2 ? '#e8e8ee' : '#9fc0d8'); px(fx + 1, 9, 1, 1, '#2a2a30'); }
    px(17, -2, 1, 13, '#7a4a22'); px(18, -2, 5, 7, '#d8302c'); px(19, 0, 3, 1, '#fff7e6');
  }
  ctx.globalAlpha = 1;
  roll.happyT = Math.max(roll.happyT, 0.3);   // にこにこ顔
  if (!m.said && age > 600 && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(m.cur.say, 2800, 'happy'); m.said = true; }
  m.drawn++; dirty = true;
}
// お米つぶの はずさんぽ（hazusanpo.js）：西尾市の 幡豆の 町なか（海べでは ない 所）で 止まって じっと すると、お米の うしろが 幡豆の ひとこまに なる。三ヶ根山の 山並み・スカイライン・カーネーション・あじさいと ひまわり畑が 7秒ごとに かわり、かわるたび お米が ひと言。
// 動くか ねむりだすと 消える。前と 同じ 場面は つづけない・西尾市の 幡豆の 中だけ・ゲームボーイの4色では 出さない。海べは ほりだしが 先。お米の うしろに 描く
const hazusanpo = { cur: null, last: '', t0: 0, chk: 0, said: false, drawn: 0 };   // drawn：描いた 数（テスト用）
function hazusanpoStep(hx, by, u, now) {
  const m = hazusanpo, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_HAZUSANPO || !still || gbOn || rp.x === null || roll.idle > 12 || tombolo.cur) { m.cur = null; m.said = false; m.chk = 0; return; }
  const S = window.NISHIO_HAZUSANPO;
  if (!m.cur || now - m.t0 >= S.CYCLE) {
    if (!m.cur && (roll.idle < S.STILL || now < m.chk)) return;
    m.chk = now + 2000;   // 2秒に 1回 町を しらべる
    const c = kasaFind(), d = c ? S.pick(c, m.last) : null;
    if (!d) { m.cur = null; return; }
    m.cur = d; m.last = d.id; m.t0 = now; m.said = false;
    if (G.track) G.track('kome_hazusanpo', { id: d.id });
  }
  const age = now - m.t0, t = calmMotion ? 0 : now / 1000, id = m.cur.id;
  const px = (cx, cy, cw, ch, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  const fade = Math.min(1, age / 500);
  ctx.globalAlpha = fade;
  if (id === 'yamanami') {   // 三ヶ根山の 山並み：段々の 山が 3つ かさなる
    px(-20, 14, 40, 1, '#4a6a3a'); px(-20, 11, 14, 3, '#7aa06a'); px(-17, 8, 8, 3, '#7aa06a'); px(-15, 6, 4, 2, '#7aa06a');
    px(-6, 10, 26, 4, '#5a8a4c'); px(0, 7, 14, 3, '#5a8a4c'); px(4, 4, 6, 3, '#5a8a4c'); px(6, 2, 2, 2, '#5a8a4c');
    px(8, 11, 12, 3, '#3e6e3a'); px(11, 9, 6, 2, '#3e6e3a');
  } else if (id === 'skyline') {   // スカイライン：山を ジグザグに のぼる 道と 小さな 車
    px(-18, 14, 36, 1, '#4a6a3a'); px(-14, 10, 28, 4, '#5a8a4c'); px(-9, 6, 18, 4, '#5a8a4c'); px(-4, 2, 8, 4, '#5a8a4c');
    px(-12, 12, 24, 1, '#d8d4c8'); px(-8, 9, 16, 1, '#d8d4c8'); px(-3, 5, 8, 1, '#d8d4c8'); px(6, 9, 2, 3, '#d8d4c8'); px(-9, 6, 2, 3, '#d8d4c8');
    const ph = calmMotion ? 0.4 : (t * 0.25) % 1;
    px(-10 + ph * 20, 10.5, 3, 1.5, '#d8302c'); px(-9.5 + ph * 20, 10, 1.5, 0.8, '#fff7e6');
  } else if (id === 'carnation') {   // カーネーション：くきを のばした ピンクの 花が ならぶ
    px(-18, 14, 36, 1, '#6e5a3a');
    for (let i = 0; i < 5; i++) {
      const fx = -15 + i * 7, sw = calmMotion ? 0 : Math.sin(t * 1.5 + i) * 0.6, top = 5 + (i % 2) * 2;
      px(fx + 1, top + 2, 1, 12 - (top - 5), '#3e8a3c'); px(fx - 1 + sw, top, 5, 3, i % 2 ? '#f08ab0' : '#e85a8a'); px(fx + sw, top - 1, 3, 1, '#f8c0d4'); px(fx + 1 + sw, top + 1, 1, 1, '#fff0f4');
    }
  } else {   // あじさいと ひまわり畑：左に あじさい、右に ひまわり
    px(-18, 14, 36, 1, '#6e5a3a');
    px(-17, 8, 8, 6, '#6a86d8'); px(-15, 6, 6, 3, '#8aa0e8'); px(-19, 10, 4, 4, '#a07ad8'); px(-12, 11, 5, 3, '#a07ad8'); px(-16, 9, 1, 1, '#c8d4f8'); px(-12, 9, 1, 1, '#c8d4f8');
    for (let i = 0; i < 2; i++) {
      const fx = 4 + i * 9, sw = calmMotion ? 0 : Math.sin(t * 1.2 + i * 2) * 0.6, top = 3 + i * 2;
      px(fx + 2, top + 3, 1, 14 - top - 3, '#3e8a3c'); px(fx + sw, top, 5, 5, '#f2c230'); px(fx + 1 + sw, top + 1, 3, 3, '#6a4220'); px(fx - 1 + sw, top + 2, 1, 1, '#f2c230'); px(fx + 5 + sw, top + 2, 1, 1, '#f2c230');
    }
  }
  ctx.globalAlpha = 1;
  roll.happyT = Math.max(roll.happyT, 0.3);   // にこにこ顔
  if (!m.said && age > 600 && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(m.cur.say, 2800, 'happy'); m.said = true; }
  m.drawn++; dirty = true;
}
// お米つぶの じょうかまちさんぽ（jokamachi.js）：西尾城の あと（西尾市歴史公園・旧近衛邸・尚古荘）の そばで 止まって じっと すると、お米の うしろが 城下町の ひとこまに なる。丑寅櫓・鍮石門・西条城・6万石・旧近衛邸の 抹茶・尚古荘・祇園祭・三河の小京都が 7秒ごとに かわり、かわるたび お米が ひと言。
// 動くか ねむりだすと 消える。前と 同じ 場面は つづけない・西尾市の 西尾城の あとの そばの 中だけ・ゲームボーイの4色では 出さない。ちゃせきより 先に 出る（ちゃせきは 譲る）。お米の うしろに 描く
const jokamachi = { cur: null, last: '', t0: 0, chk: 0, said: false, drawn: 0 };   // drawn：描いた 数（テスト用）
function jokamachiStep(hx, by, u, now) {
  const m = jokamachi, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_JOKAMACHI || !still || gbOn || rp.x === null || roll.idle > 12) { m.cur = null; m.said = false; m.chk = 0; return; }
  const S = window.NISHIO_JOKAMACHI;
  if (!m.cur || now - m.t0 >= S.CYCLE) {
    if (!m.cur && (roll.idle < S.STILL || now < m.chk)) return;
    m.chk = now + 2000;   // 2秒に 1回 場所を しらべる
    const ll = toLatLng(rp.x, rp.y), d = S.pick({ city: here.city, near: S.nearKeys(G.spots, ll.lat, ll.lng) }, m.last);
    if (!d) { m.cur = null; return; }
    m.cur = d; m.last = d.id; m.t0 = now; m.said = false;
    if (G.track) G.track('kome_jokamachi', { id: d.id });
  }
  const age = now - m.t0, t = calmMotion ? 0 : now / 1000, id = m.cur.id;
  const px = (cx, cy, cw, ch, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  ctx.globalAlpha = Math.min(1, age / 500);
  if (id === 'ushitora') {   // 本丸丑寅櫓：石垣の 上に 白い 壁と かわらの 屋根
    px(-14, 11, 28, 4, '#8a8a84'); px(-14, 11, 28, 1, '#b0b0aa'); px(-10, 4, 20, 7, '#f1ede0'); px(-10, 4, 20, 1, '#d8d2c0');
    px(-13, 1, 26, 3, '#3a3c44'); px(-8, -2, 16, 3, '#3a3c44'); px(-4, 6, 3, 3, '#4a3a2a'); px(2, 6, 3, 3, '#4a3a2a');
  } else if (id === 'yuseki') {   // 鍮石門：2本の 柱に 屋根の 門
    px(-12, 4, 3, 11, '#6e4a2a'); px(9, 4, 3, 11, '#6e4a2a'); px(-15, 1, 30, 3, '#3a3c44'); px(-13, -1, 26, 2, '#4a4c54'); px(-9, 4, 18, 2, '#8a5a30');
  } else if (id === 'shijo') {   // 西条城の はじまり：石垣と 旗
    px(-16, 10, 32, 5, '#8a8a84'); px(-16, 10, 32, 1, '#b0b0aa'); for (let i = 0; i < 3; i++) px(-16 + i * 11, 12.5, 10, 1, '#6b6b66');
    px(10, -4, 1, 14, '#7a4a22'); px(11, -4, 6, 4, '#d8302c'); px(12, -3, 4, 1, '#fff7e6');
  } else if (id === 'rokuman') {   // 6万石：米俵が 6つ（下に 3つ、上に 2つ、てっぺんに 1つ）
    const bale = (x, y) => { px(x, y, 8, 5, '#c9a55a'); px(x, y, 8, 1, '#e0c27a'); px(x + 2, y, 1, 5, '#8a6a2a'); px(x + 5, y, 1, 5, '#8a6a2a'); };
    bale(-13, 10); bale(-4, 10); bale(5, 10); bale(-8.5, 5); bale(0.5, 5); bale(-4, 0);
  } else if (id === 'konoe') {   // 旧近衛邸の 抹茶：畳の 上の 茶わん
    px(-16, 12, 32, 3, '#9fb36a'); px(-16, 12, 32, 1, '#b9ca86'); px(-16, 14, 32, 1, '#6e4a2a');
    drawNakama(Math.round(hx + 14 * u), Math.round(by + 9 * u), Math.max(1, Math.round(u * 0.9)), 'chawan', 0, true);
  } else if (id === 'shokoso') {   // 尚古荘の 庭：松と 石どうろう
    px(-14, 14, 28, 1, '#5d7a3a'); px(-12, 6, 2, 8, '#6e4a2a'); px(-17, 1, 12, 4, '#2f6a3a'); px(-15, -2, 8, 3, '#2f6a3a');
    px(8, 12, 6, 2, '#8a8a84'); px(9, 8, 4, 4, '#b0b0aa'); px(8, 6, 6, 2, '#8a8a84'); px(10, 9, 2, 2, '#f2c84b');
  } else if (id === 'gion') {   // 西尾祇園祭：提灯を つるした 山車（だし）。提灯が ゆれる
    px(-14, 9, 28, 6, '#a8362c'); px(-14, 9, 28, 1, '#d8584a'); px(-12, 5, 24, 4, '#6e4a2a'); px(-15, 3, 30, 2, '#3a3c44');
    for (let i = 0; i < 5; i++) { const sw = calmMotion ? 0 : Math.sin(t * 2 + i) * 0.8; px(-11 + i * 5.5 + sw, 6, 2.5, 3, '#f0d070'); px(-10.5 + i * 5.5 + sw, 6, 1.5, 3, '#e8481c'); }
    px(-16, 13, 4, 4, '#2a2a30'); px(12, 13, 4, 4, '#2a2a30');
  } else {   // 三河の小京都：お寺の 屋根と 本堂
    px(-14, 11, 28, 4, '#8a8a84'); px(-9, 4, 18, 7, '#f1ede0'); px(-13, 0, 26, 4, '#3a3c44'); px(-9, -3, 18, 3, '#4a4c54');
    px(-2, 6, 4, 5, '#7a4a22'); px(-1, -5, 2, 2, '#d8a82c');
  }
  ctx.globalAlpha = 1;
  roll.happyT = Math.max(roll.happyT, 0.3);   // にこにこ顔
  if (!m.said && age > 600 && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(m.cur.say, 2800, 'happy'); m.said = true; }
  m.drawn++; dirty = true;
}
// お米つぶの ちゃつみ（chatsumi.js）：稲荷山茶園公園の そばで 止まって じっと すると、お米の うしろが 茶畑の ひとこまに なる。茶畑の 一望・茶摘み（4〜5月）・てん茶の 産地・川霧と 土の 場面が 7秒ごとに かわり、かわるたび お米が ひと言。
// 動くか ねむりだすと 消える。前と 同じ 場面は つづけない・西尾市の 稲荷山茶園公園の そばの 中だけ・ゲームボーイの4色では 出さない。ちゃせきより 先に 出る（ちゃせきは 譲る）。お米の うしろに 描く
const chatsumi = { cur: null, last: '', t0: 0, chk: 0, said: false, drawn: 0 };   // drawn：描いた 数（テスト用）
function chatsumiStep(hx, by, u, now) {
  const m = chatsumi, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_CHATSUMI || !still || gbOn || rp.x === null || roll.idle > 12) { m.cur = null; m.said = false; m.chk = 0; return; }
  const S = window.NISHIO_CHATSUMI;
  if (!m.cur || now - m.t0 >= S.CYCLE) {
    if (!m.cur && (roll.idle < S.STILL || now < m.chk)) return;
    m.chk = now + 2000;   // 2秒に 1回 場所を しらべる
    const ll = toLatLng(rp.x, rp.y), d = S.pick({ city: here.city, near: S.near(G.spots, ll.lat, ll.lng), month: new Date().getMonth() + 1 }, m.last);
    if (!d) { m.cur = null; return; }
    m.cur = d; m.last = d.id; m.t0 = now; m.said = false;
    if (G.track) G.track('kome_chatsumi', { id: d.id });
  }
  const age = now - m.t0, t = calmMotion ? 0 : now / 1000, id = m.cur.id;
  const px = (cx, cy, cw, ch, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  const row = (x, y, w) => { px(x, y, w, 4, '#2f7a3a'); px(x + 1, y - 1, w - 2, 1, '#4a9a4c'); px(x, y + 3, w, 1, '#1f5a2c'); };   // 茶の うね（かまぼこ形の 緑）
  ctx.globalAlpha = Math.min(1, age / 500);
  if (id === 'ichibo') {   // 茶畑の 一望：高台から 奥へ ひろがる うね
    px(-17, 14, 34, 1, '#6e5a3a'); row(-16, 10, 32); row(-13, 6, 26); row(-10, 2, 20); row(-7, -2, 14);
  } else if (id === 'tsumi') {   // 茶摘み：うねの 横に 竹かご、新芽が 光る
    row(-16, 9, 32); px(-16, 14, 32, 1, '#6e5a3a');
    px(8, 5, 8, 6, '#c9a55a'); px(8, 5, 8, 1, '#e0c27a'); px(9, 7, 6, 1, '#8a6a2a'); px(9, 9, 6, 1, '#8a6a2a');
    for (let i = 0; i < 4; i++) { const tw = calmMotion ? 1 : (Math.sin(t * 3 + i * 1.7) > 0.3 ? 1 : 0.4); px(-13 + i * 6, 7, 1.5, 2, tw >= 1 ? '#c8f06a' : '#8ac04a'); }
  } else if (id === 'tencha') {   // てん茶の 産地：てん茶の 葉の 山と ふくろ
    px(-16, 14, 32, 1, '#6e5a3a'); px(-14, 9, 28, 5, '#4a9a4c'); px(-10, 5, 20, 4, '#4a9a4c'); px(-6, 2, 12, 3, '#6ab45a'); px(-12, 9, 24, 1, '#7ac06a');
    px(11, 6, 5, 8, '#e8dcb8'); px(11, 6, 5, 1, '#c8b890'); px(12, 9, 3, 2, '#2f7a3a');
  } else {   // 川霧と 土：うねの 上を 白い もやが ながれる
    px(-16, 14, 32, 1, '#6e4a2a'); row(-16, 10, 32); row(-12, 5, 24);
    for (let i = 0; i < 3; i++) { const dx = calmMotion ? 0 : Math.sin(t * 0.8 + i * 2) * 3; ctx.globalAlpha = Math.min(1, age / 500) * 0.55; px(-15 + i * 10 + dx, 3 + i * 3.5, 14, 2.5, '#ffffff'); }
  }
  ctx.globalAlpha = 1;
  roll.happyT = Math.max(roll.happyT, 0.3);   // にこにこ顔
  if (!m.said && age > 600 && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(m.cur.say, 2800, 'happy'); m.said = true; }
  m.drawn++; dirty = true;
}
// お米つぶの トンボロさんぽ（tombolo.js）：トンボロ干潟の そばで 止まって じっと すると、お米の うしろが 干潟の ひとこまに なる。満ちた 海・潮が 引く・海の 道（トンボロ現象）・干潟の 生きものが 7秒ごとに かわり、かわるたび お米が ひと言。
// 動くか ねむりだすと 消える。前と 同じ 場面は つづけない・西尾市の トンボロ干潟の そばの 中だけ・ゲームボーイの4色では 出さない。ほりだし・はずさんぽより 先に 出る（それらは 譲る）。お米の うしろに 描く
const tombolo = { cur: null, last: '', t0: 0, chk: 0, said: false, drawn: 0 };   // drawn：描いた 数（テスト用）
function tomboloStep(hx, by, u, now) {
  const m = tombolo, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_TOMBOLO || !still || gbOn || rp.x === null || roll.idle > 12) { m.cur = null; m.said = false; m.chk = 0; return; }
  const S = window.NISHIO_TOMBOLO;
  if (!m.cur || now - m.t0 >= S.CYCLE) {
    if (!m.cur && (roll.idle < S.STILL || now < m.chk)) return;
    m.chk = now + 2000;   // 2秒に 1回 場所を しらべる
    const ll = toLatLng(rp.x, rp.y), d = S.pick({ city: here.city, near: S.near(G.spots, ll.lat, ll.lng) }, m.last);
    if (!d) { m.cur = null; return; }
    m.cur = d; m.last = d.id; m.t0 = now; m.said = false;
    if (G.track) G.track('kome_tombolo', { id: d.id });
  }
  const age = now - m.t0, t = calmMotion ? 0 : now / 1000, id = m.cur.id;
  const px = (cx, cy, cw, ch, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  const wave = (x, y, w, i) => { const dx = calmMotion ? 0 : Math.sin(t * 1.4 + i * 2) * 1.5; px(x + dx, y, w, 1, '#d8ecf8'); };   // 波の 白い すじ
  ctx.globalAlpha = Math.min(1, age / 500);
  if (id === 'mitsu') {   // 満ちた 海：一面の 海に 小さな 島の かげ
    px(-18, 6, 36, 9, '#4a8ac8'); px(-18, 6, 36, 1, '#6aa6dc'); wave(-14, 9, 6, 0); wave(2, 11, 7, 1); wave(-6, 13, 5, 2);
    px(8, 3, 9, 3, '#4a7a3a'); px(10, 1, 5, 2, '#4a7a3a'); px(8, 6, 9, 1, '#e8cf94');
  } else if (id === 'hiku') {   // 潮が 引く：海が 左右へ しりぞき、まんなかに 砂の 道が 見えはじめる
    px(-18, 6, 36, 9, '#4a8ac8'); px(-18, 6, 36, 1, '#6aa6dc');
    const open = calmMotion ? 6 : Math.min(6, 1 + age / 1200);
    px(-open, 6, open * 2, 9, '#e8cf94'); px(-open + 1, 9, open * 2 - 2, 1, '#c9ad70');
    wave(-14, 9, 6, 0); wave(8, 12, 6, 1); px(8, 3, 9, 3, '#4a7a3a'); px(10, 1, 5, 2, '#4a7a3a'); px(8, 6, 9, 1, '#e8cf94');
  } else if (id === 'michi') {   // 海の 道：島へ のびる 砂の 道、両がわは 海
    px(-18, 6, 36, 9, '#4a8ac8'); px(-18, 6, 36, 1, '#6aa6dc');
    px(-18, 9, 28, 4, '#e8cf94'); px(-18, 9, 28, 1, '#f4e2b0'); px(-12, 11, 6, 1, '#c9ad70'); px(0, 12, 6, 1, '#c9ad70');
    wave(-14, 7, 6, 0); wave(2, 7, 7, 1); wave(-8, 14, 6, 2);
    px(8, 3, 9, 3, '#4a7a3a'); px(10, 1, 5, 2, '#4a7a3a'); px(8, 6, 10, 4, '#e8cf94');
  } else {   // 干潟の 生きもの：ひろい 砂の 上に アサリと ウミニナ
    px(-18, 11, 36, 4, '#e8cf94'); px(-16, 12, 8, 1, '#c9ad70'); px(4, 13, 10, 1, '#c9ad70'); px(-18, 8, 36, 3, '#c8e0ec'); wave(-12, 9, 6, 0);
    const bob = calmMotion ? 0 : Math.sin(t * 2) * 0.6;
    for (const [sx, sy, k] of [[-14, -4, 'asari'], [2, -4, 'uminina']]) if (critterSprites[k]) ctx.drawImage(critterSprites[k], Math.round(hx + sx * u), Math.round(by + (sy + bob) * u), Math.round(u * 1.2 * 16), Math.round(u * 1.2 * 16));
  }
  ctx.globalAlpha = 1;
  roll.happyT = Math.max(roll.happyT, 0.3);   // にこにこ顔
  if (!m.said && age > 600 && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(m.cur.say, 2800, 'happy'); m.said = true; }
  m.drawn++; dirty = true;
}
// お米つぶの まんげきょう（mangekyo.js）：三河工芸ガラス美術館の そばで 止まって じっと すると、お米の うしろが ガラス工芸の ひとこまに なる。美術館・巨大な 万華鏡・万華鏡を のぞく が 7秒ごとに かわり、かわるたび お米が ひと言。
// 動くか ねむりだすと 消える。前と 同じ 場面は つづけない・西尾市の ガラス美術館の そばの 中だけ・ゲームボーイの4色では 出さない。ちゃせきより 先に 出る（ちゃせきは 譲る）。お米の うしろに 描く
const mangekyo = { cur: null, last: '', t0: 0, chk: 0, said: false, drawn: 0 };   // drawn：描いた 数（テスト用）
function mangekyoStep(hx, by, u, now) {
  const m = mangekyo, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_MANGEKYO || !still || gbOn || rp.x === null || roll.idle > 12) { m.cur = null; m.said = false; m.chk = 0; return; }
  const S = window.NISHIO_MANGEKYO;
  if (!m.cur || now - m.t0 >= S.CYCLE) {
    if (!m.cur && (roll.idle < S.STILL || now < m.chk)) return;
    m.chk = now + 2000;   // 2秒に 1回 場所を しらべる
    const ll = toLatLng(rp.x, rp.y), d = S.pick({ city: here.city, near: S.near(G.spots, ll.lat, ll.lng) }, m.last);
    if (!d) { m.cur = null; return; }
    m.cur = d; m.last = d.id; m.t0 = now; m.said = false;
    if (G.track) G.track('kome_mangekyo', { id: d.id });
  }
  const age = now - m.t0, t = calmMotion ? 0 : now / 1000, id = m.cur.id;
  const px = (cx, cy, cw, ch, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  const COL = ['#e0527a', '#f0b840', '#4aa8d8', '#6ac060', '#a068d0'];
  ctx.globalAlpha = Math.min(1, age / 500);
  if (id === 'bijutsu') {   // ガラス工芸美術館：たなに ならんだ ガラスの 器が きらり
    px(-16, 14, 32, 1, '#6b5a4a'); px(-14, 8, 28, 1, '#8a7258');
    for (let i = 0; i < 4; i++) {
      const x = -13 + i * 7, c = COL[i], sp = calmMotion || Math.sin(t * 3 + i * 1.6) > 0.5;
      px(x + 1, 3, 3, 5, c); px(x, 5, 5, 3, c); px(x + 1, 4, 1, 3, '#ffffff');
      if (sp) { px(x + 5, 2, 1, 1, '#ffffff'); px(x + 4, 1, 3, 1, '#ffffff'); }
    }
  } else if (id === 'kyodai') {   // 巨大な 万華鏡：大きな 筒の 先に、色ガラスの 模様が まわる
    px(-18, 11, 22, 4, '#7a5a3a'); px(-18, 11, 22, 1, '#a07a50'); px(-12, 4, 18, 7, '#8a8a92'); px(-12, 4, 18, 1, '#b4b4bc');
    const cx = 14, cy = 7, n = 6;
    px(cx - 6, cy - 6, 12, 12, '#1c1c2a');
    for (let i = 0; i < n; i++) {
      const a = (calmMotion ? 0 : t * 0.9) + i * Math.PI * 2 / n, r = 3.4 + (calmMotion ? 0 : Math.sin(t * 1.3 + i) * 0.8);
      px(cx + Math.cos(a) * r - 1, cy + Math.sin(a) * r - 1, 2, 2, COL[i % 5]);
    }
    px(cx - 0.5, cy - 0.5, 1, 1, '#ffffff');
  } else {   // 万華鏡を のぞく：まるい 窓の なかに 模様が 6方向へ ひろがる
    px(-20, 1, 40, 14, '#1c1c2a');
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3 + (calmMotion ? 0 : t * 0.5);
      for (let j = 1; j <= 4; j++) { const r = j * 3.2; px(Math.cos(a) * r - 1, 8 + Math.sin(a) * r * 0.9 - 1, 2, 2, COL[(k + j) % 5]); }
    }
    px(-1, 7, 2, 2, '#ffffff');
  }
  ctx.globalAlpha = 1;
  roll.happyT = Math.max(roll.happyT, 0.3);   // にこにこ顔
  if (!m.said && age > 600 && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(m.cur.say, 2800, 'happy'); m.said = true; }
  m.drawn++; dirty = true;
}
// お米つぶの ちゃせき（chasetsu.js）：西尾地区で 止まって じっと すると、お米の よこに 石臼が 出て てん茶を ひき（くるくる）、茶わんに 抹茶を 点てて（茶せんが しゃかしゃか）、お米が ひと言。
// 動くか ねむりだすと 消える。ひと席 おわったら 動くまで くりかえさない。西尾市の 西尾地区の 中だけ・ゲームボーイの4色では 出さない。お米の うしろに 描く
const chasetsu = { cur: null, t0: 0, chk: 0, said: false, done: false, drawn: 0 };   // drawn：描いた 数（テスト用）
function chasetsuStep(hx, by, u, now) {
  const c = chasetsu, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_CHASETSU || !still || gbOn || rp.x === null || roll.idle > 12 || jokamachi.cur || chatsumi.cur || mangekyo.cur || kawabe.cur) { c.cur = null; c.said = false; c.done = false; c.chk = 0; return; }
  const C = window.NISHIO_CHASETSU;
  if (!c.cur) {
    if (c.done || roll.idle < C.STILL || now < c.chk) return;
    c.chk = now + 2000;   // 2秒に 1回 町を しらべる
    const f = kasaFind(), d = f ? C.pick(f, new Date().getMonth() + 1) : null;
    if (!d) return;
    c.cur = d; c.t0 = now; c.said = false;
    if (G.track) G.track('kome_chasetsu', { id: d.id });
  }
  const age = now - c.t0, t = calmMotion ? 0 : now / 1000, ate = age >= C.MILL + C.WHISK;
  const px = (cx, cy, cw, ch, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  ctx.globalAlpha = Math.min(1, age / 400);
  if (age < C.MILL) {   // 石臼：下の 臼に 上の 臼。取っ手が くるくる まわり、緑の 粉が ふちから おちる
    px(11, 9, 14, 4, '#8a8a86'); px(12, 5, 12, 4, '#b3b3ad'); px(12, 5, 12, 1, '#d6d6d0'); px(10, 13, 16, 1, '#6b6b66');
    const a = t * 5, hxp = 18 + Math.cos(a) * 4;
    px(hxp, 4, 2, 2, '#7a4422'); px(hxp + (hxp > 18 ? -3 : 1), 3, 1, 1, '#7a4422');
    for (let i = 0; i < 3; i++) { const ph = (t * 1.5 + i / 3) % 1; ctx.globalAlpha = Math.min(1, age / 400) * (1 - ph); px(10 + i * 0.5 - ph * 2, 10 + ph * 3, 1.5, 1.5, '#6fa85a'); }
  } else {   // 茶わんに 点てる：茶せんが 左右に しゃかしゃか。できたら 抹茶の あわだつ 緑
    drawNakama(Math.round(hx + 18 * u), Math.round(by + 8 * u), Math.max(1, Math.round(u * 0.9)), 'chawan', 0, true);
    if (!ate) { const w = Math.sin(now / 55) * 2.5; px(17 + w, -2, 1, 6, '#e6d3a3'); px(16 + w, 3, 3, 1, '#e6d3a3'); px(17 + w, -3, 1, 1, '#7a4422'); }
  }
  ctx.globalAlpha = 1;
  if (age >= C.MILL) roll.happyT = Math.max(roll.happyT, 0.3);   // 点てている あいだは にこにこ顔
  if (ate && !c.said && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(c.cur.say, 2800, 'happy'); c.said = true; }
  if (ate && c.said && now - c.t0 > C.MILL + C.WHISK + 3500) { c.cur = null; c.done = true; return; }   // ひと席 おわり：動くまで くりかえさない
  c.drawn++; dirty = true;
}
// お米つぶの ごちそう（gochiso.js）：止まった お米の 目の 前に、いる 町と 月に 合った 西尾の 名物食が 出る。「いただきます」→ もぐもぐ → 「ごちそうさま」。
// 150〜240秒に 1回まで（はじめは 30秒後）・西尾市の 中だけ・前と 同じ ものは つづけない。動き出すか ねむりかけたら やめる
const GOCHISO_MS = 6500;
const gochiso = { cur: null, last: '', next: 0, t0: 0, drawn: 0 };   // drawn：描いた 数（テスト用）
function gochisoMunch(now) {   // もぐもぐ：からだが ぷるぷる ちぢむ（0〜0.05）
  const age = now - gochiso.t0;
  return !gochiso.cur || calmMotion || age < 900 || age > GOCHISO_MS - 600 ? 0 : Math.abs(Math.sin(age / 150)) * 0.05;
}
function gochisoStep(hx, by, u, now) {
  const g = gochiso;
  const still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (g.cur && !still) { g.cur = null; return; }   // 動き出した：食べかけで おしまい
  if (!g.cur) {
    if (!still || roll.idle < 1 || roll.idle > 5 || !window.NISHIO_GOCHISO || rp.x === null || mapCovered() || !howtoEl.hidden || sightBusy() || now < riceBub.until + 1500) return;
    if (!g.next) g.next = now + 30000;   // はじめは 30秒 あそんでから
    if (now < g.next) return;
    const d = window.NISHIO_GOCHISO.pick({ city: here.city, town: here.town, month: new Date().getMonth() + 1 }, g.last);
    if (!d) return;
    g.cur = d; g.last = d.id; g.t0 = now; g.next = now + 150000 + Math.random() * 90000;
    riceSay('いただきます', 1500, 'happy');
    if (G.track) G.track('kome_gochiso', { id: d.id });
  }
  const age = now - g.t0;
  if (age > GOCHISO_MS) {   // ごちそうさま：ここで おなかいっぱい（すぐ ねむらない）
    const d = g.cur; g.cur = null; roll.idle = 0;
    if (!mapCovered()) riceSay(d.say, 2400, 'happy');
    return;
  }
  if (age < GOCHISO_MS - 1500) roll.happyT = Math.max(roll.happyT, 0.3);   // 食べている あいだは にこにこ顔
  const eat = Math.max(0, Math.min(1, (age - 900) / (GOCHISO_MS - 1500))), q = Math.max(1, Math.round(u * 0.9 * (1 - 0.75 * eat)));   // だんだん へる
  ctx.globalAlpha = Math.min(1, age / 400);
  drawNakama(Math.round(hx + 17 * u), Math.round(by + 13 * u - 4 * q), q, g.cur.id, 0);
  ctx.globalAlpha = 1;
  g.drawn++; dirty = true;
}
// お米つぶの おてだま（otedama.js）：お米が ぴょんと とびはねた とき、いる 町と 月に 合った 西尾の 名物を あたまの 上に ぽーんと ほうりなげ、おちて きたら キャッチして ひと言。
// 30〜50秒に 1回まで（はじめは 10秒後）・西尾市の 中だけ・前と 同じ ものは つづけない。ほうっている あいだも お米の あたまの 上に ついてくる
const OTEDAMA_MS = 1300;
const otedama = { cur: null, last: '', next: 0, prevH: 0, t0: 0, drawn: 0 };   // drawn：描いた 数（テスト用）
function otedamaStart(now) {   // ほうる：町と 月に 合う ものを 1つ。ほうれなければ false
  if (!window.NISHIO_OTEDAMA || !LU || rp.x === null) return false;
  const ll = toLatLng(rp.x, rp.y);
  let near = '';
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) near += luAt(ll.lat + a * LU.dLat, ll.lng + b * LU.dLng);   // まわり100mメッシュ9つ
  const d = window.NISHIO_OTEDAMA.pick({ city: here.city, town: here.town, near, month: new Date().getMonth() + 1 }, otedama.last);
  if (!d) return false;
  otedama.cur = d; otedama.last = d.id; otedama.t0 = now;
  if (G.track) G.track('kome_otedama', { id: d.id });
  return true;
}
function otedamaStep(hx, by, u, now) {
  const o = otedama, up = roll.h > 0 && o.prevH <= 0;   // とびはね はじめ
  o.prevH = roll.h;
  if (worldMode || driving || rp.x === null) { o.cur = null; return; }
  if (!o.cur) {
    if (!up || mapCovered() || !howtoEl.hidden || sightBusy() || now < riceBub.until) return;
    if (!o.next) o.next = now + 10000;   // はじめは 10秒 あそんでから
    if (now < o.next || !otedamaStart(now)) return;
    o.next = now + 30000 + Math.random() * 20000;
  }
  const age = now - o.t0, s = age / OTEDAMA_MS;
  if (s >= 1) {   // キャッチ
    const d = o.cur; o.cur = null;
    if (!mapCovered()) riceSay(d.say, 1800, 'happy');
    return;
  }
  const rise = (calmMotion ? 0.5 : 4 * s * (1 - s)) * 9 * u, q = Math.max(1, Math.round(u * 0.8));   // 山なりに あがって おりる（うごきを へらす 設定では 少しだけ）
  ctx.globalAlpha = Math.min(1, age / 150);
  drawNakama(Math.round(hx), Math.round(by - 12.5 * u - rise), q, o.cur.id, calmMotion ? 0 : s * Math.PI * 4);
  ctx.globalAlpha = 1;
  o.drawn++; dirty = true;
}
// お米つぶの かさ（kasa.js）：西尾市で 雨が 降って いる あいだ（weather.js）、いる 町の 名物を おおきな かさに して あたまの 上に さす。さした とき・やんだ とき お米が ひと言。
// 町が かわって 合わなく なったら さしかえる・西尾市の 外では 出さない。2秒に 1回 まちを しらべる
const kasa = { cur: null, last: '', said: false, chk: 0, drawn: 0 };   // drawn：描いた 数（テスト用）
function kasaFind() {
  if (!window.NISHIO_KASA || !LU || rp.x === null) return null;
  const ll = toLatLng(rp.x, rp.y);
  let near = '';
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) near += luAt(ll.lat + a * LU.dLat, ll.lng + b * LU.dLng);   // まわり100mメッシュ9つ
  return { near, land: luAt(ll.lat, ll.lng), city: here.city, town: here.town };
}
function kasaStep(hx, by, u, now) {
  const k = kasa, rain = wxKind() === 'rain' && !worldMode && !driving && rp.x !== null;
  if (!rain) {   // やんだ（か、遊びかたが かわった）：たたむ
    if (k.cur && wxKind() !== 'rain' && !worldMode && !driving && k.said && !mapCovered()) riceSay(window.NISHIO_KASA.END, 1800, 'happy');
    k.cur = null; k.said = false; k.chk = 0;
    return;
  }
  if (now >= k.chk) {   // 2秒に 1回：町に 合う かさか たしかめる
    k.chk = now + 2000;
    const c = kasaFind(), mine = c ? window.NISHIO_KASA.candidates(c) : [];
    if (!mine.length) k.cur = null;
    else if (!k.cur || !mine.some(x => x.id === k.cur.id)) {
      const d = window.NISHIO_KASA.pick(c, k.last);
      k.cur = d; k.last = d.id;
      if (G.track) G.track('kome_kasa', { id: d.id });
      if (!k.said && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(d.say, 2200, 'happy'); k.said = true; }
    }
  }
  if (!k.cur) return;
  const sway = calmMotion ? 0 : Math.sin(now / 700) * 0.5 * u, q = Math.max(2, Math.round(u * 1.5));
  drawNakama(Math.round(hx + sway), Math.round(by - 12.5 * u - 6 * u), q, k.cur.id, 0, true);
  k.drawn++; dirty = true;
}
// お米つぶの かわぎり（kiri.js）：あさ（日本時間の5時〜8時前）に 西尾市の 川・池・用水の そばを 通ると、川霧が お米の まわりに たちこめる。出た とき・はれた とき お米が ひと言。
// 町が かわれば 話も かわる・西尾市の 外では 出さない・ゲームボーイの4色でも 出す（白い もやだけ）。2秒に 1回 場所を しらべる（見つけかたは kasaFind と 同じ）
const kiri = { cur: null, t0: 0, chk: 0, said: false, drawn: 0 };   // drawn：描いた 数（テスト用）
function kiriHour() {
  const q = new URLSearchParams(location.search).get('kiri');
  if (q) return +q;   // 確かめ用（?kiri=6 で 6時の あさ）
  return new Date(Date.now() + 9 * 3600000).getUTCHours();
}
function kiriStep(hx, by, u, now) {
  const k = kiri, K = window.NISHIO_KIRI, on = K && !worldMode && !driving && rp.x !== null && K.morning(kiriHour());
  if (!on) {   // 霧の 時間が おわった（か、遊びかたが かわった）：はれる
    if (k.cur && k.said && K && !worldMode && !driving && !mapCovered()) riceSay(k.cur.end, 1800, 'happy');
    k.cur = null; k.said = false; k.chk = 0;
    return;
  }
  if (now >= k.chk) {   // 2秒に 1回：川・池の そばか たしかめる
    k.chk = now + K.EVERY;
    const c = kasaFind(), d = c ? K.pick(c) : null;
    if (d && !k.cur) {
      k.cur = d; k.t0 = now; k.said = false;
      if (G.track) G.track('kome_kiri', { id: d.id });
    } else if (!d && k.cur) {   // 水べを はなれた：はれる
      if (k.said && !mapCovered()) riceSay(k.cur.end, 1800, 'happy');
      k.cur = null; k.said = false;
    } else if (d) k.cur = d;
    if (k.cur && !k.said && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(k.cur.say, 2800, 'happy'); k.said = true; }
  }
  if (!k.cur) return;
  const t = calmMotion ? 0 : now / 1000, fade = Math.min(1, (now - k.t0) / 1500);
  for (let i = 0; i < 6; i++) {   // 霧：うすい 白い もやが 横に ゆっくり ながれる
    const x = hx + (((i * 9 + t * 3) % 54) - 27) * u, y = by + (i % 3 - 1) * 5 * u + 3 * u, w = (14 + (i % 2) * 6) * u, h = 3.2 * u;
    ctx.globalAlpha = fade * 0.28;
    ctx.fillStyle = '#f2f6f8';
    ctx.fillRect(Math.round(x - w / 2), Math.round(y - h / 2), Math.round(w), Math.max(1, Math.round(h)));
  }
  ctx.globalAlpha = 1;
  k.drawn++; dirty = true;
}
// お米つぶの めぐり（meguri.js）：夜に なると、いる 町の 名物が お米の まわりを ゆっくり めぐる（お月さまの ように）。輪に なった とき・朝に なった とき お米が ひと言。
// 町が かわれば 輪も かわる・西尾市の 外では 出さない。2秒に 1回 町を しらべる（見つけかたは kasaFind と 同じ）
const meguri = { items: [], key: '', said: false, chk: 0, t0: 0, drawn: 0 };   // drawn：描いた 数（テスト用）
function meguriStep(hx, by, u, now) {
  const m = meguri, night = window.NISHIO_MEGURI && nightOn && !worldMode && !driving && rp.x !== null && nightLevel() >= 1;
  if (!night) {   // 朝に なった（か、遊びかたが かわった）：消える
    if (m.said && window.NISHIO_MEGURI && nightLevel() < 1 && !worldMode && !driving && !mapCovered()) riceSay(window.NISHIO_MEGURI.END, 1800, 'happy');
    m.items = []; m.key = ''; m.said = false; m.chk = 0;
    return;
  }
  if (now >= m.chk) {   // 2秒に 1回：町に 合う 名物を たしかめる
    m.chk = now + 2000;
    const c = kasaFind(), items = c ? window.NISHIO_MEGURI.ring(Object.assign(c, { month: new Date().getMonth() + 1 })) : [], key = items.map(x => x.id).join();
    if (key !== m.key) {
      m.items = items; m.key = key; m.t0 = now;
      if (items.length) {
        if (G.track) G.track('kome_meguri', { ids: key });
        if (!m.said && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(window.NISHIO_MEGURI.say(items), 2600, 'happy'); m.said = true; }
      }
    }
  }
  const n = m.items.length;
  if (!n || chochinyoru.cur) return;   // 夜の 一色で 提灯の あかりが 出て いる 間は 輪を 休む
  const q = Math.max(1, Math.round(u * 0.7)), spin = calmMotion ? 0 : now / 3200, fade = Math.min(1, (now - m.t0) / 800);
  const pos = m.items.map((it, i) => { const a = spin + i * Math.PI * 2 / n; return { it, x: Math.cos(a) * 19 * u, y: Math.sin(a) * 6 * u, z: Math.sin(a) }; }).sort((a, b) => a.z - b.z);   // 手前（z が 大きい）を あとから 描く
  for (const p of pos) {
    ctx.globalAlpha = fade * (p.z < 0 ? 0.55 : 1);   // 奥は うすく
    drawNakama(Math.round(hx + p.x), Math.round(by + 2 * u + p.y), p.z < 0 ? Math.max(1, q - 1) : q, p.it.id, 0);
  }
  ctx.globalAlpha = 1;
  m.drawn++; dirty = true;
}
// お米つぶの つんつん（tsun.js）：お米を タップすると、ぴょんと はねて、いる 町と 月に 合った 西尾の 名物が あたまの 上に ぽんと 飛び出し、ふわっと のぼって 消える。お米が ひと言。
// つづけて タップすると その 町の 名物が じゅんばんに 出る。西尾市の 外では 何も 出さない。0.9秒より 早い タップは 数えない
const tsun = { cur: null, last: '', t0: 0, lock: 0, drawn: 0 };   // drawn：描いた 数（テスト用）
function tsunTap(now) {   // タップが お米に 当たった：出せたら true
  if (!window.NISHIO_TSUN || !LU || rp.x === null || worldMode || driving || now < tsun.lock) return false;
  const ll = toLatLng(rp.x, rp.y);
  let near = '';
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) near += luAt(ll.lat + a * LU.dLat, ll.lng + b * LU.dLng);   // まわり100mメッシュ9つ
  const d = window.NISHIO_TSUN.next({ city: here.city, town: here.town, near, month: new Date().getMonth() + 1 }, tsun.last);
  if (!d) return false;
  tsun.cur = d; tsun.last = d.id; tsun.t0 = now; tsun.lock = now + 900;
  if (roll.h <= 0) { roll.hv = 2; roll.h = 0.001; }   // ぴょん
  roll.happyT = Math.max(roll.happyT, 1.6);
  riceSay(d.say, 2200, 'happy');
  if (G.track) G.track('kome_tsun', { id: d.id });
  return true;
}
function tsunStep(hx, by, u, now) {
  const t = tsun;
  if (!t.cur) return;
  const age = now - t.t0, s = age / window.NISHIO_TSUN.MS;
  if (worldMode || driving || s >= 1) { t.cur = null; return; }
  const rise = (calmMotion ? 0.4 : Math.sqrt(s)) * 10 * u, q = Math.max(1, Math.round(u * 0.9));   // ぽんと 出て、だんだん ゆっくり のぼる
  ctx.globalAlpha = Math.min(1, age / 120) * (s > 0.75 ? (1 - s) * 4 : 1);
  drawNakama(Math.round(hx), Math.round(by - 13 * u - rise), q, t.cur.id, calmMotion ? 0 : Math.sin(age / 140) * 0.25);
  ctx.globalAlpha = 1;
  t.drawn++; dirty = true;
}
// お米つぶの なぞなぞ（nazonazo.js）：止まって しばらく（約4.5秒）じっと して いると、お米が いる 地区に 合った 西尾の なぞなぞを 吹き出しで 出し、お米の したに 答えの 札が 2つ ならぶ。
// 札を タップすると、あたりは「そのとおり」、はずれは ほんとうの 答えを お米が おしえる。ひとめぐり するまで 同じ なぞなぞは 出さない（nsg_nazonazo）。
// 120〜210秒に 1回まで（はじめは 40秒あそんでから）・西尾市の 中だけ・動くか ねむりだす（12秒）と ひっこむ・ゲームボーイの4色では 出さない
const NAZO_KEY = 'nsg_nazonazo';
const nazo = { cur: null, flip: false, seen: null, next: 0, t0: 0, btn: null, drawn: 0 };   // btn：札の 当たり [[x0,y0,x1,y1] 左, 右]。drawn：描いた 数（テスト用）
function nazoStep(hx, by, u, now) {
  const n = nazo, N = window.NISHIO_NAZONAZO, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!N || !still || gbOn || rp.x === null || roll.idle > N.SHOW || mapCovered()) { n.cur = null; n.btn = null; return; }
  if (!n.cur) {
    if (roll.idle < N.STILL || !howtoEl.hidden || sightBusy() || now < riceBub.until || gochiso.cur || tsun.cur) return;
    if (!n.next) n.next = now + N.FIRST;   // はじめは 40秒 あそんでから
    if (now < n.next) return;
    if (!n.seen) { try { n.seen = JSON.parse(localStorage.getItem(NAZO_KEY)) || []; } catch (e) { n.seen = []; } }
    const r = N.pick({ city: here.city, town: here.town }, n.seen);
    if (!r) { n.next = now + 10000; return; }
    n.cur = r.item; n.flip = r.flip; n.t0 = now; n.seen = r.seen;
    try { localStorage.setItem(NAZO_KEY, JSON.stringify(r.seen)); } catch (e) { /* noop */ }
    riceSay(r.item.q, Math.max(3000, (N.SHOW - roll.idle) * 1000));
    if (G.track) G.track('kome_nazonazo', { id: r.item.id, step: 'ask' });
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 3), fz = Math.round(FLOAT_PX * dpr * 0.9), pad = Math.round(fz * 0.5), bh = Math.round(fz * 1.9), y = Math.round(by + 19 * u);
  const labels = n.flip ? [n.cur.b, n.cur.a] : [n.cur.a, n.cur.b];
  ctx.save();
  ctx.globalAlpha = Math.min(1, (now - n.t0) / 300);
  ctx.font = `bold ${fz}px "DotGothic16", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const bw = Math.round(Math.max(...labels.map(t => ctx.measureText(t).width)) + pad * 2), gap = Math.round(fz * 0.6);
  n.btn = [];
  labels.forEach((t, i) => {
    const x = Math.round(hx + (i ? gap / 2 : -gap / 2 - bw)), bob = calmMotion ? 0 : Math.round(Math.sin(now / 400 + i * 2) * fz * 0.08);
    n.btn.push([x, y, x + bw, y + bh]);
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y + bob, bw, bh, Math.round(bh * 0.3)) : ctx.rect(x, y + bob, bw, bh);
    ctx.fillStyle = '#fffdf3'; ctx.fill(); ctx.lineWidth = Math.max(2, Math.round(dpr * 1.5)); ctx.strokeStyle = '#2a2420'; ctx.stroke();
    ctx.fillStyle = '#2a2420'; ctx.fillText(t, x + bw / 2, y + bob + bh / 2 + 1);
  });
  ctx.restore();
  n.drawn++; dirty = true;
}
function nazoTap(x, y, now) {   // 札に 当たった：答えを うけとれたら true
  const n = nazo, N = window.NISHIO_NAZONAZO;
  if (!N || !n.cur || !n.btn) return false;
  const side = n.btn.findIndex(b => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]);
  if (side < 0) return false;
  const ok = N.judge(n.flip, side), d = n.cur;
  n.cur = null; n.btn = null; n.next = now + N.GAP[0] + Math.random() * N.GAP[1];
  roll.idle = 0;   // 答えたあとは ねむらない
  if (ok) { roll.hv = 2; roll.h = 0.001; }   // あたり：ぴょん
  riceSay(ok ? d.yes : d.no, 3600, ok ? 'happy' : '');
  if (G.track) G.track('kome_nazonazo', { id: d.id, step: ok ? 'yes' : 'no' });
  return true;
}
// お米つぶの ようこそ（youkoso.js）：転がって 西尾市の 地区（西尾・一色・吉良・幡豆・佐久島）の 境を こえると、お米の 足もとに その地区の 名物の 絵が ついた 旗が すっと 立ち、お米が ひと言。
// 約4.5秒で 消える・45秒に 1回まで・遊びはじめの 一歩目と 同じ 地区の 町名がわりでは 出ない（町名の 札は 別）・西尾市の 外では 出さない・ゲームボーイの4色では 旗を 描かない
const youkoso = { area: null, cur: null, last: '', t0: 0, next: 0, drawn: 0 };   // area：いま いる 地区（まだ 見ていない＝null、西尾市の 外＝''）。drawn：描いた 数（テスト用）
function youkosoStep(hx, by, u, now) {
  const y = youkoso, Y = window.NISHIO_YOUKOSO;
  if (!Y || worldMode || driving || rp.x === null) { y.cur = null; return; }
  const inCity = /西尾/.test(here.city || ''), a = !inCity ? '' : Y.areaOf(here.city, here.town);   // 西尾市の 外＝''。町名が ない 田畑・山の 中（null）では 前の 地区の まま
  if (a !== null && a !== y.area) {
    const was = y.area;
    y.area = a;
    if (Y.entered(was, a) && now >= y.next && !mapCovered() && howtoEl.hidden) {
      const d = Y.pick(a, new Date().getMonth() + 1, y.last);
      if (d) {
        y.cur = d; y.last = d.id; y.t0 = now; y.next = now + Y.COOL;
        riceSay(d.say, 3200, 'happy');
        if (G.track) G.track('kome_youkoso', { id: d.id, area: a });
      }
    }
  }
  if (!y.cur) return;
  const age = now - y.t0;
  if (age > Y.SHOW) { y.cur = null; return; }
  if (gbOn) return;
  const rise = Math.min(1, age / 350), fade = Math.min(1, (Y.SHOW - age) / 600), q = Math.max(1, Math.round(u)), poleX = Math.round(hx - 17 * u), foot = Math.round(by + 8 * u), top = Math.round(foot - 22 * u * rise);
  const wave = calmMotion ? 0 : Math.sin(now / 260) * u * 0.8, cw = Math.round(10 * u), ch = Math.round(8 * u);
  ctx.save(); ctx.globalAlpha = fade;
  ctx.fillStyle = '#2b1a0c'; ctx.fillRect(poleX - q, top - q, 2 * q + q, foot - top + q);   // さお（ふち）
  ctx.fillStyle = '#8a5a2b'; ctx.fillRect(poleX, top, q, foot - top);
  if (rise >= 1) {
    const fx = poleX + q, fy = top + q, fw = cw + Math.round(wave);
    ctx.fillStyle = '#2b1a0c'; ctx.fillRect(fx - q, fy - q, fw + 2 * q, ch + 2 * q);   // 旗（ふち）
    ctx.fillStyle = '#fffdf3'; ctx.fillRect(fx, fy, fw, ch);
    drawNakama(Math.round(fx + fw / 2), Math.round(fy + ch / 2), Math.max(1, Math.round(u * 0.6)), y.cur.id, 0, true);
  }
  ctx.restore();
  y.drawn++; dirty = true;
}
// お米つぶの たびのしるし（shirushi.js）：西尾市の 地区に はじめて 入ると、その 地区の 小さな 旗が お米の 右がわに ならんで ずっと のこる（5つまで）。
// 新しい 旗は ぽんと 立ち、境の 旗（ようこそ）の ひと言の あとに お米が ひと言。5つ そろうと 「ぜんぶ そろったよ」。この 端末に おぼえる（nsg_shirushi）。
// 西尾市の 中だけで 増える・ねむって いる あいだ・ゲームボーイの4色では 描かない
const shirushi = { list: null, pop: '', t0: 0, say: null, drawn: 0 };   // pop：ぽんと 立てる 旗の 地区。say：[言う 時刻, ことば]。drawn：描いた 数（テスト用）
function shirushiStep(hx, by, u, now, asleep) {
  const s = shirushi, S = window.NISHIO_SHIRUSHI, Y = window.NISHIO_YOUKOSO;
  if (!S || !Y || worldMode || driving || rp.x === null) return;
  if (!s.list) { try { s.list = S.clean(JSON.parse(localStorage.getItem(S.KEY))); } catch (e) { s.list = []; } }
  if (/西尾/.test(here.city || '')) {
    const a = Y.areaOf(here.city, here.town), r = a ? S.add(s.list, a) : null;
    if (r && r.added) {
      s.list = r.list; s.pop = a; s.t0 = now;
      try { localStorage.setItem(S.KEY, JSON.stringify(s.list)); } catch (e) { /* noop */ }
      s.say = [now + S.DELAY, S.say(s.list.length, a)];
      if (G.track) G.track('kome_shirushi', { area: a, n: s.list.length });
    }
  }
  if (s.say && now >= s.say[0] && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(s.say[1], 3000, 'happy'); s.say = null; }
  if (!s.list.length || gbOn || asleep) return;
  const q = Math.max(1, Math.round(u * 0.35)), step = Math.round(6.5 * u), x0 = Math.round(hx + 15 * u), foot = Math.round(by + 8 * u);
  S.AREAS.filter(a => s.list.includes(a.id)).forEach((a, i) => {
    const pop = a.id === s.pop ? Math.min(1, (now - s.t0) / S.POP) : 1, bounce = pop < 1 ? Math.sin(pop * Math.PI) * 5 * u : 0;
    const px = x0 + i * step, top = Math.round(foot - 11 * u * Math.min(1, pop * 2) - bounce), fw = Math.round(5 * u), fh = Math.round(4.5 * u);
    ctx.fillStyle = '#2b1a0c'; ctx.fillRect(px - q, top - q, 2 * q, foot - top + q);   // さお（ふち）
    ctx.fillStyle = '#8a5a2b'; ctx.fillRect(px - q + Math.round(q / 2), top, Math.max(1, q - 1), foot - top);
    if (pop < 0.5) return;
    const fx = px + q, fy = top + q;
    ctx.fillStyle = '#2b1a0c'; ctx.fillRect(fx - q, fy - q, fw + 2 * q, fh + 2 * q);   // 旗（ふち）
    ctx.fillStyle = a.color; ctx.fillRect(fx, fy, fw, fh);
    drawNakama(Math.round(fx + fw / 2), Math.round(fy + fh / 2), Math.max(1, Math.round(u * 0.3)), a.emblem, 0, true);
  });
  s.drawn++; dirty = true;
}
// お米つぶの ものさし（monosashi.js）：西尾市の 中を 転がった 道のり（roll.d）を 黄金堤の 長さ（180m）で はかる。お米の 左よこに 小さな 堤の めもりが 出て、転がるほど 金色に たまり、180mごとに ひと言。
// 道のりは この 端末に おぼえる（nsg_monosashi）。転がるのを やめて 4秒で 消える・ねむって いる あいだと ゲームボーイの4色では 描かない・西尾市の 外では 数えない
const monosashi = { total: null, lastD: null, last: 0, saved: 0, show: 0, pop: 0, say: null, drawn: 0 };   // total：m。lastD：前の roll.d。pop：1本 できた 時刻。drawn：描いた 数（テスト用）
function monosashiStep(hx, by, u, now, asleep) {
  const m = monosashi, M = window.NISHIO_MONOSASHI;
  if (!M || worldMode || driving || rp.x === null) { m.lastD = null; return; }
  if (m.total === null) { try { m.total = M.clean(JSON.parse(localStorage.getItem(M.KEY))); } catch (e) { m.total = 0; } }
  const dd = m.lastD === null ? 0 : roll.d - m.lastD;
  m.lastD = roll.d;
  if (dd > 0 && /西尾/.test(here.city || '')) {
    const r = M.add(m.total, dd * TILE_M);
    m.total = r.total; m.show = now + M.SHOW;
    if (r.born > 0) {
      m.pop = now; m.show = now + M.SHOW + M.POP;
      m.say = [now + 600, M.say(M.gauge(m.total).n)];
      if (G.track) G.track('kome_monosashi', { n: M.gauge(m.total).n });
    }
    if (now - m.saved > 5000 || r.born > 0) { m.saved = now; try { localStorage.setItem(M.KEY, String(Math.round(m.total * 10) / 10)); } catch (e) { /* noop */ } }
  }
  if (m.say && now >= m.say[0] && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(m.say[1], 3000, 'happy'); m.say = null; }
  if (gbOn || asleep || now > m.show || !m.total) return;
  const g = M.gauge(m.total), q = Math.max(1, Math.round(u * 0.35)), w = Math.round(13 * u), h = Math.round(4 * u), x0 = Math.round(hx - 15 * u - w), foot = Math.round(by + 8 * u);
  const lit = m.pop && now - m.pop < M.POP ? Math.sin((now - m.pop) / M.POP * Math.PI * 3) > 0 : false;   // できた ばかりは ぴかぴか
  ctx.globalAlpha = Math.min(1, (m.show - now) / 400);
  ctx.fillStyle = '#2b1a0c'; ctx.fillRect(x0 - q, foot - h - q, w + 2 * q, h + 2 * q);   // 堤の ふち
  ctx.fillStyle = '#c9b48a'; ctx.fillRect(x0, foot - h, w, h);   // 堤の 土
  ctx.fillStyle = lit ? '#fff3a0' : '#e0b030'; ctx.fillRect(x0, foot - h, Math.round(w * (m.pop && now - m.pop < M.POP ? 1 : g.frac)), h);   // 金色が 左から たまる
  ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(3.4 * u)}px "DotGothic16", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(g.n ? '堤' + g.n + '本' : '堤', x0 + w / 2, foot - h - 2 * q);
  ctx.globalAlpha = 1;
  m.drawn++; dirty = true;
}
// お米つぶの おかえり（okaeri.js）：しばらく あいだを あけて もどると、西尾市に 入った とき お米が「おかえり。3日ぶりだね」と むかえ、いる 地区の 名物が お米の よこに ぴょこんと 出て ひと言。ひと回の あそびに 1回だけ。
// 最後に あそんだ 日は この 端末に おぼえる（nsg_okaeri）。名物と 地区の 名前は ようこそ（youkoso.js）・たびのしるし（shirushi.js）を 共用。ゲームボーイの4色・ねむって いる あいだは 名物を 描かない
const okaeri = { prev: null, saved: 0, done: false, cur: null, t0: 0, drawn: 0 };   // prev：前に あそんだ 時刻（まだ 読んでいない＝null）。cur：出して いる 名物。drawn：描いた 数（テスト用）
function okaeriStep(hx, by, u, now, asleep) {
  const o = okaeri, K = window.NISHIO_OKAERI, Y = window.NISHIO_YOUKOSO, S = window.NISHIO_SHIRUSHI;
  if (!K || !Y || !S || worldMode || driving || rp.x === null) return;
  const wall = Date.now();
  if (o.prev === null) { try { o.prev = K.clean(JSON.parse(localStorage.getItem(K.KEY))); } catch (e) { o.prev = 0; } }
  if (now - o.saved > K.SAVE) { o.saved = now; try { localStorage.setItem(K.KEY, String(wall)); } catch (e) { /* noop */ } }
  if (!o.done && /西尾/.test(here.city || '')) {
    const a = Y.areaOf(here.city, here.town), n = K.days(o.prev, wall);
    if (!n) { if (a) o.done = true; }   // はじめて・同じ日は むかえない（ひと回の あそびで 1回だけ しらべる）
    else if (a && !asleep && !mapCovered() && howtoEl.hidden && now >= riceBub.until) {
      const d = Y.pick(a, new Date().getMonth() + 1, ''), ar = S.AREAS.find(x => x.id === a);
      o.done = true;
      if (d && ar) {
        o.cur = d; o.t0 = now;
        riceSay(K.say(n, ar.name, d.name), 4000, 'happy');
        if (G.track) G.track('kome_okaeri', { area: a, days: n });
      }
    }
  }
  if (!o.cur) return;
  const age = now - o.t0;
  if (age > K.SHOW) { o.cur = null; return; }
  if (gbOn || asleep) return;
  const pop = Math.min(1, age / 500), hop = calmMotion ? 0 : Math.abs(Math.sin(now / 240)) * 2.5 * u, fade = Math.min(1, (K.SHOW - age) / 600);
  ctx.globalAlpha = fade;
  drawNakama(Math.round(hx + 16 * u), Math.round(by + 4 * u - hop - Math.sin(pop * Math.PI) * 4 * u), Math.max(1, Math.round(u * 0.9)), o.cur.id, 0, false);
  ctx.globalAlpha = 1;
  o.drawn++; dirty = true;
}
// お米つぶの ふるさと（furusato.js）：転がって 西尾市の 外（となりの 市町）に 出ると、お米の よこに 西尾の 方角を さす 矢じるしが 名物を かかえて 出て、お米が「岡崎市に 来たよ。西尾は あっちだよ」と ひと言。
// 方角は いちばん 近い 地区の 中心（G.areas）。西尾市に もどるか 1分たつと 消える・出した あとは 2分は くりかえさない。ゲームボーイの4色・ねむって いる あいだは 描かない
const furusato = { out0: 0, shown0: 0, last: -1e9, cur: null, said: false, drawn: 0 };   // out0：外に 出た 時刻（0＝中）。cur：{ item, ang }。drawn：描いた 数（テスト用）
function furusatoStep(hx, by, u, now, asleep) {
  const f = furusato, K = window.NISHIO_FURUSATO;
  if (!K || worldMode || driving || rp.x === null || !K.outside(here.city)) {   // 西尾市の 中（か 遊びかたが かわった）：しまう
    f.out0 = 0; f.cur = null; f.said = false;
    return;
  }
  if (!f.out0) f.out0 = now;
  if (!f.cur && now - f.out0 >= K.WAIT && now - f.last >= K.COOL && !asleep && !mapCovered()) {
    const ll = toLatLng(rp.x, rp.y), n = K.nearest(ll.lat, ll.lng, G.areas), item = n && K.pick(n.area);
    if (item) {
      f.cur = { item, ang: n.ang }; f.shown0 = now; f.last = now; f.said = false;
      if (G.track) G.track('kome_furusato', { area: n.area });
    }
  }
  if (!f.cur) return;
  if (now - f.shown0 > K.SHOW) { f.cur = null; return; }
  if (!f.said && howtoEl.hidden && now >= riceBub.until && !asleep && !mapCovered()) { riceSay(K.say(here.city, f.cur.item), 3500, 'happy'); f.said = true; }
  if (gbOn || asleep) return;
  const ll = toLatLng(rp.x, rp.y), n = K.nearest(ll.lat, ll.lng, G.areas);
  if (n) f.cur.ang = n.ang;   // 転がると 方角も かわる
  const a = f.cur.ang, r = 17 * u, bob = calmMotion ? 0 : Math.sin(now / 320) * 1.2 * u;
  const cx = Math.round(hx + Math.cos(a) * r), cy = Math.round(by + Math.sin(a) * r * 0.8 + bob);
  const fade = Math.min(1, (now - f.shown0) / 500, (K.SHOW - (now - f.shown0)) / 800);
  ctx.globalAlpha = Math.max(0, fade);
  const q = Math.max(1, Math.round(u * 0.5)), tip = [cx + Math.cos(a) * 5 * u, cy + Math.sin(a) * 5 * u], nx = -Math.sin(a), ny = Math.cos(a);
  ctx.fillStyle = '#2b1a0c';   // 矢じるし：ふち → 金色
  for (const [grow, col] of [[q, '#2b1a0c'], [0, '#e0b030']]) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(tip[0] + Math.cos(a) * grow, tip[1] + Math.sin(a) * grow);
    ctx.lineTo(cx + nx * (3 * u + grow), cy + ny * (3 * u + grow));
    ctx.lineTo(cx - nx * (3 * u + grow), cy - ny * (3 * u + grow));
    ctx.closePath(); ctx.fill();
  }
  drawNakama(Math.round(cx - Math.cos(a) * 5 * u), Math.round(cy - Math.sin(a) * 5 * u), Math.max(1, Math.round(u * 0.9)), f.cur.item.id, 0, false);   // 名物は 矢じるしの うしろ
  ctx.globalAlpha = 1;
  f.drawn++; dirty = true;
}
// お米つぶの かげえ（kage.js）：じっと 止まって いると、足もとの 影の となりに、いる 町と 月に 合った 名物の 影が すうっと のびる。7秒ごとに つぎの 影。動くと すっと 消える。
// 影は drawNakama を 小さな 絵に 描いて 黒く ぬり、ひらたく のばして 貼る（絵は 1つずつ しまっておく）。ゲームボーイの4色・夜（めぐりの 時間）・ねむって いる間は 出さない
const kage = { cur: null, last: '', still0: 0, t0: 0, chk: 0, said: false, drawn: 0, pics: {} };   // drawn：描いた 数（テスト用）
function kagePic(id, q) {   // 名物の 黒い 影の 絵（16×16 の 点を q 倍に したもの）
  const key = id + q;
  if (kage.pics[key]) return kage.pics[key];
  const c = document.createElement('canvas'); c.width = c.height = 16 * q;
  const k = ctx, g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  ctx = g;
  try { drawNakama(8 * q, 8 * q, q, id, 0, true); } finally { ctx = k; }
  g.globalCompositeOperation = 'source-in'; g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  return (kage.pics[key] = c);
}
function kageDraw(hx, sy, shw, u, now, still) {   // sy：影の 高さ。shw：影の はば
  const k = kage;
  if (!window.NISHIO_KAGE || !still || gbOn || worldMode || driving || rp.x === null || nightLevel() >= 1 || roll.idle > 12) { k.cur = null; k.still0 = 0; k.said = false; return; }
  if (!k.still0) k.still0 = now;
  if (now - k.still0 < window.NISHIO_KAGE.STILL) return;
  if (now >= k.chk) {   // 0.5秒に 1回：町に 合う 影を たしかめる（7秒たったら つぎの 影）
    k.chk = now + 500;
    if (!k.cur || now - k.t0 >= window.NISHIO_KAGE.EACH) {
      const c = kasaFind(), d = c ? window.NISHIO_KAGE.next(Object.assign(c, { month: new Date().getMonth() + 1 }), k.last) : null;
      if (!d) { k.cur = null; return; }
      k.cur = d; k.last = d.id; k.t0 = now;
      if (G.track) G.track('kome_kage', { id: d.id });
      if (!k.said && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(d.say, 2400, 'happy'); k.said = true; }
    }
  }
  if (!k.cur) return;
  const q = Math.max(1, Math.round(u * 0.9)), age = now - k.t0, fade = Math.min(1, age / 700) * Math.min(1, (window.NISHIO_KAGE.EACH - age) / 500 + 0.0001);
  const pic = kagePic(k.cur.id, q), dw = 16 * q * 1.3, dh = 16 * q * 0.38, grow = calmMotion ? 1 : Math.min(1, 0.3 + age / 700);   // すうっと のびる
  ctx.globalAlpha = 0.26 * Math.max(0, fade);
  ctx.drawImage(pic, Math.round(hx + shw * 0.45), Math.round(sy - dh * 0.5), Math.round(dw * grow), Math.round(dh));
  ctx.globalAlpha = 1;
  k.drawn++; dirty = true;
}
function nakamaStep(now, ox, oy, T, w, h, dpr) {
  if (worldMode || driving || rp.x === null) { nakama.n = null; return; }
  const sp = Math.hypot(rp.vx || 0, rp.vy || 0);
  if (!nakama.n && now > otomo.next && sp > 1.5 && !mapCovered() && window.NISHIO_OTOMO && LU && howtoEl.hidden && !sightBusy() && now > riceBub.until + 2000) {   // 町の おとも（otomo.js）
    if (!otomo.next) otomo.next = now + 20000;   // はじめは 20秒 転がってから
    else {
      const ll = toLatLng(rp.x, rp.y);
      let near = '';
      for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) near += luAt(ll.lat + a * LU.dLat, ll.lng + b * LU.dLng);   // まわり100mメッシュ9つ
      const o = window.NISHIO_OTOMO.pick({ city: here.city, town: here.town, near, month: new Date().getMonth() + 1 }, otomo.last);
      if (!o) otomo.next = now + 8000;
      else {
        otomo.next = now + 60000 + Math.random() * 40000; otomo.last = o.id; nakama.next = now + NAKAMA_CD;
        const bx = rp.vx >= 0 ? -1.5 : 1.5;   // お米の うしろから ころんと 出て くる
        nakama.n = { kind: o.id, x: rp.x + bx, y: rp.y, t0: now, last: now, ang: 0, stop: 0 };
        riceSay(o.say, 2400, 'happy');
        if (G.track) G.track('kome_otomo', { id: o.id });
      }
    }
  }
  if (!nakama.n && now > nakama.next && sp > 1.5 && !mapCovered() && nakamaKinds().length && ambN() < AMB_MAX) {   // 畑・温室・農地の となりを 転がって いる とき
    const x = Math.floor(rp.x), y = Math.floor(rp.y), farm = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => [C.V, C.N, C.U].includes(codeAt(x + dx, y + dy)));
    if (farm) { nakama.next = now + NAKAMA_CD + Math.random() * NAKAMA_CD; nakama.n = { kind: nakamaKind(), x: x + 0.5 + farm[0], y: y + 0.5 + farm[1], t0: now, last: now, ang: 0, stop: 0 }; }
  }
  const n = nakama.n;
  if (!n) return;
  const dt = Math.min(0.1, (now - n.last) / 1000); n.last = now;
  if (n.stop) { if (now - n.stop > 700) { nakama.n = null; return; } }
  else if (now - n.t0 > NAKAMA_FOLLOW) n.stop = now;
  else {   // お米の すこし うしろへ ころころ（はなれすぎたら はやく）
    const dx = rp.x - n.x, dy = rp.y - n.y, d = Math.hypot(dx, dy), want = Math.max(0, d - 1.1), v = Math.min(6, want * 3);
    if (d > 0.01) { n.x += dx / d * v * dt; n.y += dy / d * v * dt; n.ang += (dx >= 0 ? 1 : -1) * v * dt / 0.45; }
  }
  const hop = n.stop ? Math.sin(Math.min(1, (now - n.stop) / 700) * Math.PI) * T * 0.5 : 0;
  ctx.globalAlpha = n.stop ? Math.max(0, 1 - (now - n.stop) / 700) : 1;
  { const X = Math.round(ox + n.x * T), Y = Math.round(oy + n.y * T - hop), u = Math.max(Math.round(2 * dpr), Math.round(T / 16)); if (!drawKoroArt(X, Y, u, n.kind, n.ang)) drawNakama(X, Y, u, n.kind, n.ang); }   // Blender の 絵（読めるまでは 手描き）
  ctx.globalAlpha = 1;
  dirty = true;
}
// お米つぶの であい（deai.js）：転がって いる 最中、いる 所に 合った 西尾の 生きものが お米の 前に 姿を 見せる。お米は にこにこ顔で ひと言、
// 生きものは ぴょこぴょこ して、しばらくして はねて いなくなる。80〜140秒に 1回まで（はじめは 25秒後）・前と 同じ 生きものは つづけない・西尾市の 中だけ
const DEAI_STAY = 4200, DEAI_GO = 600;
const deai = { next: 0, last: '', d: null, drawn: 0 };   // drawn：描いた 数（テスト用）
function deaiStep(now, ox, oy, T) {
  if (worldMode || driving || rp.x === null) { deai.d = null; return; }
  const sp = Math.hypot(rp.vx || 0, rp.vy || 0);
  if (!deai.d && now > deai.next && sp > 1.5 && !mapCovered() && window.NISHIO_DEAI && LU && howtoEl.hidden && !sightBusy() && !nakama.n && now > riceBub.until + 2500) {
    if (!deai.next) deai.next = now + 25000;   // はじめは 25秒 転がってから
    else {
      const ll = toLatLng(rp.x, rp.y);
      let near = '';
      for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) near += luAt(ll.lat + a * LU.dLat, ll.lng + b * LU.dLng);   // まわり100mメッシュ9つ
      const e = window.NISHIO_DEAI.pick({ city: here.city, town: here.town, land: luAt(ll.lat, ll.lng), near, month: new Date().getMonth() + 1 }, deai.last);
      if (!e) deai.next = now + 8000;
      else {
        deai.next = now + 80000 + Math.random() * 60000; deai.last = e.id;
        const m = sp || 1, fx = rp.vx / m, fy = rp.vy / m;   // お米の 進む 先の すこし 前（動いて いない ときは 右）
        deai.d = { id: e.id, x: rp.x + (sp ? fx : 1) * 2.6, y: rp.y + (sp ? fy : 0) * 2.6, t0: now };
        riceSay(e.say, 2600, 'happy');
        if (G.track) G.track('kome_deai', { id: e.id });
      }
    }
  }
  const d = deai.d;
  if (!d) return;
  const age = now - d.t0;
  if (age > DEAI_STAY + DEAI_GO) { deai.d = null; return; }
  const out = age > DEAI_STAY ? (age - DEAI_STAY) / DEAI_GO : 0;   // いなくなる：ぴょんと はねて うすく なる
  const hop = out ? Math.sin(out * Math.PI) * T * 0.7 : calmMotion ? 0 : Math.round(Math.max(0, Math.sin(age / 380)) * T * 0.12);
  ctx.globalAlpha = Math.min(1, age / 300) * (1 - out);
  ctx.drawImage(critterSprites[d.id], Math.round(ox + d.x * T - T / 2), Math.round(oy + d.y * T - T / 2 - hop), T, T);
  ctx.globalAlpha = 1;
  deai.drawn++; dirty = true;
}
// お米つぶの こぼれもの（kobore.js）：転がって いる 最中、いる 町と 月に 合った 西尾の 名物を、お米が 道に ぽろぽろ こぼす。小さく ふわっと 舞って 消える。
// 1.4〜2.6秒に 1つ・同時に 3つまで・西尾市の 中だけ（ことばは なし。おとも・にもつ・ゆめとは ちがい、転がる 動きの 跡）
const KOBORE_LIFE = 2200, KOBORE_MAX = 3;
const kobore = { list: [], next: 0, drawn: 0 };   // drawn：描いた 数（テスト用）
function koboreStep(now, ox, oy, T, dpr) {
  if (worldMode || driving || rp.x === null || !window.NISHIO_KOBORE || !LU) { kobore.list.length = 0; return; }
  const sp = Math.hypot(rp.vx || 0, rp.vy || 0);
  if (now > kobore.next && sp > 1.5 && kobore.list.length < KOBORE_MAX && !mapCovered()) {
    kobore.next = now + 1400 + Math.random() * 1200;
    const ll = toLatLng(rp.x, rp.y);
    let near = '';
    for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) near += luAt(ll.lat + a * LU.dLat, ll.lng + b * LU.dLng);   // まわり100mメッシュ9つ
    const k = window.NISHIO_KOBORE.pick({ city: here.city, town: here.town, near, month: new Date().getMonth() + 1 });
    if (k) {
      kobore.list.push({ id: k.id, x: rp.x + (Math.random() - 0.5) * 0.6, y: rp.y - 0.5, t0: now, side: Math.random() < 0.5 ? -1 : 1 });
      if (G.track) G.track('kome_kobore', { id: k.id });
    }
  }
  kobore.list = kobore.list.filter(p => now - p.t0 < KOBORE_LIFE);
  const q = Math.max(1, Math.round(Math.max(Math.round(2 * dpr), Math.round(T / 16)) * 0.5));
  for (const p of kobore.list) {
    const t = (now - p.t0) / KOBORE_LIFE, sway = calmMotion ? 0 : Math.sin(t * 5) * 0.25 * p.side;
    ctx.globalAlpha = Math.min(1, t * 6) * (1 - t * t);
    drawNakama(Math.round(ox + (p.x + sway) * T), Math.round(oy + (p.y + t * 1.1) * T), q, p.id, calmMotion ? 0 : t * 4 * p.side);
    kobore.drawn++;
  }
  ctx.globalAlpha = 1;
  if (kobore.list.length) dirty = true;
}
// 物干しの せんたくもの（夜の 改善 6。運営者の声「文字は減らして素朴なかわいさと平和さを散りばめる」）：昼（日本時間 8〜16時）、雨・雪で ない 日は、
// 家の マス（住宅地・町）に ところどころ（29マスに 1つほど）物干しが 出て、タオル・シャツ・くつしたが 風に ゆらゆら。めいろでは 道と 生け垣から はなれた 所だけ。文字は なし
const sentaku = { n: 0 };
function sentakuOn(wx = window.NISHIO_WEATHER && window.NISHIO_WEATHER.current) {
  if (wx && (wx.kind === 'rain' || wx.kind === 'snow')) return false;
  const hr = new Date(Date.now() + 9 * 3600000).getUTCHours();
  return hr >= 8 && hr < 16 && !(nightOn && nightLevel() > 0);
}
function drawSentaku(X, Y, p, now, seed) {   // (X, Y) を 左上に、16×14 点の 物干し（2本の 柱・1本の ひも・3まいの ほしもの）。p は 1点の 大きさ
  const px = (x, y, w0, h0, c) => { ctx.fillStyle = c; ctx.fillRect(X + x * p, Y + y * p, w0 * p, h0 * p); };
  px(1, 3, 1, 11, '#6b5a48'); px(14, 3, 1, 11, '#6b5a48'); px(1, 4, 14, 1, '#e8e4dc');   // 柱と ひも
  const items = [[3, ['#ffffff', '#d8dde6'], 3, 5], [7, ['#9cc8f0', '#6fa4d6'], 4, 4], [12, ['#f4b8c8', '#d890a6'], 2, 3]];   // タオル・シャツ・くつした
  items.forEach(([x, [c, sh], w0, h0], i) => {
    const sway = Math.round(Math.sin(now / 520 + i * 1.7 + seed) * 1);   // 下の はしが 風で 左右に
    px(x, 5, w0, h0 - 1, c); px(x + sway, 5 + h0 - 1, w0, 1, sh);
    if (i === 1) { px(x - 1, 5, 1, 2, c); px(x + w0, 5, 1, 2, c); }   // シャツの そで
    px(x, 4, 1, 1, '#c8a040'); px(x + w0 - 1, 4, 1, 1, '#c8a040');   // せんたくばさみ
  });
}
function sentakuStep(now, ox, oy, T, w, h, dpr) {
  sentaku.n = 0;
  if (worldMode || driving || !sentakuOn()) return;
  const tx0 = Math.floor(-ox / T), ty0 = Math.floor(-oy / T), tx1 = Math.ceil((w - ox) / T), ty1 = Math.ceil((h - oy) / T), maze = mazeOn();
  for (let ty = ty0; ty <= ty1 && sentaku.n < 3; ty++) for (let tx = tx0; tx <= tx1 && sentaku.n < 3; tx++) {   // 1画面に 3つまで（まれで 小さく。はじめは 12で、めいろでは 6つ 見えた）
    const c = codeAt(tx, ty);
    if (c !== C.Q && c !== C.T) continue;
    const hh = Math.imul(tx, 2246822519) ^ Math.imul(ty, 3266489917), u = (hh ^ (hh >>> 15)) >>> 0;
    if (u % 29) continue;
    if (rp.x !== null && Math.hypot(tx + 0.5 - rp.x, ty + 0.5 - rp.y) < 1.5) continue;   // お米の 上には かさねない
    if (maze) { const q = mzNear(tx + 0.5, ty + 0.5); if (!q || q.d < MZ_TUBE + MZ_HEDGE + 1.2) continue; }   // 道・生け垣の 上には 出さない（絵は 1マス半ほど）
    const p = Math.max(Math.round(1.5 * dpr), Math.round(T / 16));   // めいろは 地図を 小さく 描くので、マスに 合わせると 数点に なって 見えない（すずめ・虫と 同じく 画面の 細かさから）
    drawSentaku(Math.round(ox + (tx + 0.5) * T - 8 * p), Math.round(oy + (ty + 0.5) * T - 8 * p), p, now, u % 7);
    sentaku.n++;
  }
  if (sentaku.n) dirty = true;
}
// どんぐりも ころころ（夜の 改善 5。運営者の声「文字は減らして素朴なかわいさと平和さを散りばめる」）：秋（10〜11月）、お米が 森・公園の となりを
// 転がると、木から どんぐりが 1つ ころんと 落ちて、ぽんと はねて 少し ころころ 転がり、止まって しばらく すると 消える（25〜50秒に 1回）。
// 西尾の 森にも コナラ・アベマキの どんぐり（西尾市「いきものふれあいの里だより」令和6年10月号・令和8年7月号）。文字・ポイントは なし・ぶつからない
const DONGURI_LIFE = 7000, DONGURI_CD = 25000;
const donguri = { d: null, next: 0 };
const donguriSeason = () => { const mo = new Date().getMonth() + 1; return mo === 10 || mo === 11; };
function drawDonguri(x, y, u, ang) {
  if (drawKoroArt(x, y, u, 'donguri', ang)) return;   // Blender の 絵（読めるまでは 下の 手描き）
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  const px = (cx, cy, cw, ch, c) => { ctx.fillStyle = c; ctx.fillRect(cx * u, cy * u, cw * u, ch * u); };
  const parts = [[-2, -1, 4, 4, '#a8682e'], [-1, 3, 2, 1, '#a8682e'], [-3, -2, 6, 2, '#6b4a2a'], [-1, -3, 2, 1, '#6b4a2a'], [0, -4, 1, 1, '#4a321c']];   // 実・ぼうし（はかま）・へた
  for (const [cx, cy, cw, ch] of parts) px(cx - 1, cy - 1, cw + 2, ch + 2, '#2b1a0c');
  for (const [cx, cy, cw, ch, c] of parts) px(cx, cy, cw, ch, c);
  px(-2, -2, 1, 1, '#8a6440'); px(1, -2, 1, 1, '#8a6440');   // ぼうしの うろこ
  px(-1, 0, 1, 2, '#d39a5a');   // てかり
  ctx.restore();
}
const donBlocked = (x, y) => { if (rollBlocked(x, y)) return true; if (!mazeOn()) return false; const q = mzNear(x, y); return !!q && q.d > MZ_TUBE - 0.15; };   // めいろでは 生け垣（道すじの 筒の 外）も（どんぐりの 大きさ ぶん 内がわまで。Codex の 指摘）
function donguriStep(now, ox, oy, T, w, h, dpr) {
  if (worldMode || driving || rp.x === null || !donguriSeason()) { donguri.d = null; return; }
  const sp = Math.hypot(rp.vx || 0, rp.vy || 0);
  if (!donguri.d && now > donguri.next && sp > 1.2 && !mapCovered() && ambN() < AMB_MAX) {
    const x = Math.floor(rp.x), y = Math.floor(rp.y), tree = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => { const c = codeAt(x + dx, y + dy); return c === C.W || c === C.P; });
    if (tree) {
      donguri.next = now + DONGURI_CD + Math.random() * DONGURI_CD;
      const side = Math.random() < 0.5 ? -1 : 1, [tx, ty] = tree, sx = ty ? side : 0, sy = tx ? side : 0;   // 木の ほうから 道へ、少し 横へ ころがる
      // 落ちる 所は お米から 0.8マス はなれた 通れる 所（木の がわ → 横 → ななめ）。お米に かさなる・生け垣や 建物の 上 なら 落とさない（Codex の 指摘）
      const at = [[tx, ty], [sx, sy], [-sx, -sy], [tx + sx, ty + sy], [tx - sx, ty - sy]].map(([a, b]) => { const n = Math.hypot(a, b) || 1; return [rp.x + a / n * 0.8, rp.y + b / n * 0.8]; }).find(([a, b]) => !donBlocked(a, b));
      if (at) donguri.d = { x: at[0], y: at[1], vx: -tx * 0.6 + sx * 1.3, vy: -ty * 0.6 + sy * 1.3, t0: now, last: now, ang: 0 };
    }
  }
  const d = donguri.d;
  if (!d) return;
  const age = now - d.t0, dt = Math.min(0.1, (now - d.last) / 1000); d.last = now;
  if (age > DONGURI_LIFE) { donguri.d = null; return; }
  const fall = Math.max(0, 1 - age / 350);   // 0.35秒で 上から ぽとん
  if (!fall) {   // ころころ（だんだん ゆっくり。生け垣・建物の 手前で 止まる）
    const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt;
    if (donBlocked(nx, ny) || Math.hypot(nx - rp.x, ny - rp.y) < 0.7) { d.vx = d.vy = 0; } else {   // 生け垣・建物と お米の 手前で 止まる（かさならない）
      d.x = nx; d.y = ny; d.ang += Math.hypot(d.vx, d.vy) * dt / 0.18 * Math.sign(d.vx || d.vy || 1);
    }
    const k = Math.pow(0.25, dt); d.vx *= k; d.vy *= k;
    if (Math.hypot(d.vx, d.vy) < 0.25) { const r = Math.round(d.ang / (Math.PI * 2)) * Math.PI * 2; d.ang += (r - d.ang) * Math.min(1, dt * 6); }   // 止まりぎわに ころんと たてに もどる
    const ox2 = d.x - rp.x, oy2 = d.y - rp.y, od = Math.hypot(ox2, oy2);
    if (od < 0.7) {   // あとから お米が 来て かさなったら、外へ おし出して ころんと 転がす（通れる 向きを、近い 向きから 順に さがす。めいろの 角では 1方向が 生け垣）
      const a0 = od > 0.01 ? Math.atan2(oy2, ox2) : 0;
      for (const da of [0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
        const ux = Math.cos(a0 + da), uy = Math.sin(a0 + da), qx = rp.x + ux * 0.72, qy = rp.y + uy * 0.72;
        if (donBlocked(qx, qy)) continue;
        d.x = qx; d.y = qy; const v = Math.max(0.8, Math.hypot(rp.vx || 0, rp.vy || 0) * 0.5); d.vx = ux * v; d.vy = uy * v;
        break;
      }
    }
  }
  const hop = age < 350 ? fall * T * 0.9 : age < 650 ? Math.sin((age - 350) / 300 * Math.PI) * T * 0.2 : 0;   // おちて、ぽんと 1回 はねる
  ctx.globalAlpha = age > DONGURI_LIFE - 600 ? Math.max(0, (DONGURI_LIFE - age) / 600) : 1;
  drawDonguri(Math.round(ox + d.x * T), Math.round(oy + d.y * T - hop), Math.max(Math.round(2 * dpr), Math.round(T / 18)), d.ang);
  ctx.globalAlpha = 1;
  dirty = true;
}
// 水べの さざなみ（夜の 改善 3。運営者の声「文字は減らして素朴なかわいさと平和さを散りばめる」）：お米が 川・池・海（三河湾・矢作古川 など）の
// となりを 転がると、水面に 小さな 輪が ぽわん と ひろがって 消える（0.35秒に 1つまで・0.9秒で 消える）。文字・音・ポイントは なし
const HAMON_MS = 900, HAMON_GAP = 350;
const hamon = { list: [], last: 0 };
function hamonStep(now, ox, oy, T, w, h, dpr) {
  if (worldMode || driving || rp.x === null) { hamon.list.length = 0; return; }
  const sp = Math.hypot(rp.vx || 0, rp.vy || 0);
  if (sp > 1.2 && now - hamon.last > HAMON_GAP && !mapCovered()) {
    const x = Math.floor(rp.x), y = Math.floor(rp.y), wet = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => codeAt(x + dx, y + dy) === C.A);
    if (wet) { hamon.last = now; hamon.list.push({ x: rp.x + wet[0] * 0.7, y: rp.y + wet[1] * 0.7, t0: now }); if (hamon.list.length > 6) hamon.list.shift(); }
  }
  if (!hamon.list.length) return;
  const u = Math.max(Math.round(2 * dpr), Math.round(T / 16));
  hamon.list = hamon.list.filter(r => now - r.t0 < HAMON_MS);
  for (const r of hamon.list) {   // 点の 輪（四角い 点を 円に ならべる）。ひろがり ながら うすく
    const k = (now - r.t0) / HAMON_MS, R = T * (0.2 + 0.75 * k), cx = ox + r.x * T, cy = oy + r.y * T, n = Math.max(8, Math.round(R * 2 * Math.PI / (u * 1.6)));
    ctx.globalAlpha = 0.95 * Math.pow(1 - k, 0.7); ctx.fillStyle = '#ffffff';
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; ctx.fillRect(Math.round(cx + Math.cos(a) * R - u / 2), Math.round(cy + Math.sin(a) * R * 0.6 - u / 2), u, u); }   // 少し つぶした だ円（水面を ななめに 見る）
  }
  ctx.globalAlpha = 1;
  dirty = true;
}
function kaeruStep(now, ox, oy, T, w, h, dpr) {
  if (worldMode || driving || rp.x === null) { kaeru.list.length = 0; return; }
  if (!kaeru.list.length && now > kaeru.next && kaeruSeason() && !mapCovered() && ambN() < AMB_MAX) {   // 15〜30秒に 1回、まわり 3〜7マスの 田んぼの へりを さがす
    kaeru.next = now + 15000 + Math.random() * 15000;
    for (let k = 0; k < 16; k++) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 4, x = Math.floor(rp.x + Math.cos(a) * r), y = Math.floor(rp.y + Math.sin(a) * r);
      const sx = ox + x * T, sy = oy + y * T;
      if (sx < T || sy < T * 2 || sx > w - 2 * T || sy > h - 3 * T) continue;
      const paddy = (cx, cy) => PADDY_CODES.has(codeAt(cx, cy)), edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => !paddy(x + dx, y + dy));
      if (!paddy(x, y) || !edge) continue;   // 田んぼの へり（あぜ ぎわ）
      const n = Math.random() < 0.6 ? 1 : 2;
      for (let i = 0; i < n; i++) kaeru.list.push({ x: x + 0.5 + edge[0] * 0.3 + (i ? -edge[1] * 0.6 : 0), y: y + 0.5 + edge[1] * 0.3 + (i ? edge[0] * 0.6 : 0), t0: now, jump: 0, dir: edge[0] ? -edge[0] : (Math.random() < 0.5 ? -1 : 1), into: [-edge[0], -edge[1]], seed: Math.random() * 3000 });   // あぜの ほうを 向いて すわり、とぶ ときは 田んぼの なかへ
      break;
    }
  }
  if (!kaeru.list.length) return;
  const u = Math.max(Math.round(2 * dpr), Math.round(T / 16)), sp = Math.hypot(rp.vx || 0, rp.vy || 0);
  let plop = false;
  kaeru.list = kaeru.list.filter(f => {
    if (!f.jump && (now - f.t0 > KAERU_LIFE || (sp > 0.8 && Math.hypot(f.x - rp.x, f.y - rp.y) < KAERU_NEAR))) f.jump = now;
    let X = ox + f.x * T, Y = oy + f.y * T, pose = Math.floor((now + f.seed) / 1600) % 4 === 0 ? 1 : 0;
    if (f.jump) {
      const jt = (now - f.jump) / 1000;
      if (jt > 0.45) { plop = true; return false; }   // 田んぼの なかへ ぽちゃ
      X += f.into[0] * jt * T * 2.2; Y += f.into[1] * jt * T * 2.2 - Math.sin(jt / 0.45 * Math.PI) * T * 0.6; pose = 2;
    }
    drawKaeru(Math.round(X), Math.round(Y), u, f.jump && f.into[0] ? f.into[0] : f.dir, pose);
    return true;
  });
  if (plop) potyaSound();
  dirty = true;
}
function mushiStep(now, ox, oy, T, w, h, dpr) {
  if (worldMode || driving || rp.x === null) { mushi.m = null; return; }
  const kind = mushiKind();
  if (!mushi.m && kind && now > mushi.next && !mapCovered() && ambN() < AMB_MAX) {   // 25〜50秒に 1回、お米の まわり 3〜6マスに あらわれる
    mushi.next = now + 25000 + Math.random() * 25000;
    const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 3, x = rp.x + Math.cos(a) * r, y = rp.y + Math.sin(a) * r, sx = ox + x * T, sy = oy + y * T;
    if (sx > T && sy > T * 2 && sx < w - T && sy < h - 3 * T) mushi.m = { kind, x, y, vx: 0, vy: 0, t0: now, last: now, flee: 0, rest: 0, ph: Math.random() * 6 };
  }
  const m = mushi.m;
  if (!m) return;
  const dt = Math.min(0.1, (now - m.last) / 1000); m.last = now;
  const sp = Math.hypot(rp.vx || 0, rp.vy || 0), d = Math.hypot(m.x - rp.x, m.y - rp.y);
  if (!m.flee && (now - m.t0 > MUSHI_LIFE || (sp > 0.8 && d < MUSHI_NEAR))) { m.flee = now; const k = d || 1; m.vx = (m.x - rp.x) / k * 5; m.vy = (m.y - rp.y) / k * 5 - 2; }   // すっと はなれる
  if (m.flee) { if (now - m.flee > 1500) { mushi.m = null; return; } }
  else if (now < m.rest) { m.vx *= 0.8; m.vy *= 0.8; }   // 空中で ひと休み
  else {   // のんびり ふらふら（お米の まわりから はなれすぎない）
    const t = (now - m.t0) / 1000 + m.ph, tx = rp.x + Math.cos(t * 0.5) * 3.5, ty = rp.y - 1.5 + Math.sin(t * 0.7) * 2;
    m.vx += ((tx - m.x) * 0.6 - m.vx) * dt * 2; m.vy += ((ty - m.y) * 0.6 - m.vy) * dt * 2 + Math.sin(t * 6) * dt * (m.kind === 'chocho' ? 3 : 0.6);
    if (Math.random() < dt * 0.25) m.rest = now + 600 + Math.random() * 900;
  }
  m.x += m.vx * dt; m.y += m.vy * dt;
  drawMushi(Math.round(ox + m.x * T), Math.round(oy + m.y * T), Math.max(Math.round(2 * dpr), Math.round(T / 16)), m.kind, now, m.vx >= 0 ? 1 : -1);
  dirty = true;
}
function suzumeVisit(now) {   // ねむって いる お米の そばに 1〜2羽（お米の ほうを 向いて）。動き だすと いつもの ように とびたつ
  const side = Math.random() < 0.5 ? -1 : 1, n = Math.random() < 0.5 ? 1 : 2;
  suzume.list.length = 0;
  for (let i = 0; i < n; i++) suzume.list.push({ x: rp.x + side * (1.1 + i * 0.7), y: rp.y + 0.25 + i * 0.15, t0: now + i * 400, fly: 0, dir: -side, seed: Math.random() * 1000, v: true });   // v：お米が ねて いる 間は いっしょに いる
}
function suzumeStep(now, ox, oy, T, w, h, dpr) {
  if (worldMode || driving || rp.x === null) { suzume.list.length = 0; return; }
  if (!suzume.list.length && roll.kind === 'stop' && roll.idle > SUZUME_VISIT && now > suzume.visit && !mapCovered()) { suzume.visit = now + 30000; suzumeVisit(now); }   // お米が ねむって いると、そばに おりて くる（30秒に 1回まで）
  if (!suzume.list.length && now > suzume.next && !mapCovered() && ambN() < AMB_MAX) {   // 9〜18秒に 1回、まわり 3〜7マスの 田んぼ・草地など（画面の 中）を さがして おりる
    suzume.next = now + 9000 + Math.random() * 9000;
    for (let k = 0; k < 14; k++) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 4, x = Math.floor(rp.x + Math.cos(a) * r), y = Math.floor(rp.y + Math.sin(a) * r);
      const sx = ox + x * T, sy = oy + y * T;
      if (sx < T || sy < T * 2 || sx > w - 2 * T || sy > h - 3 * T) continue;   // はしや 下の 札の 近くは さける
      const q = mazeOn() && mzNear(x + 0.5, y + 0.5);
      const c = codeAt(x, y), ground = ![C.B, C.A, C.W, C.Q, C.I, C.N, C.X].includes(c);   // 建物・水・森・家・工場・温室・まだ 読めて いない 所には おりない
      if (mazeOn() ? q && q.d > 1.15 && q.d < 1.9 && ground : SUZUME_AT().includes(c)) { suzumeSpawn(x, y, now); break; }   // めいろでは 道の すぐ わき（生け垣の 外の 地面。道の 上では ごはんつぶの 印に、生け垣の 上では 葉に かさなって 見えなかった）
    }
  }
  if (!suzume.list.length) return;
  const u = Math.max(Math.round(2 * dpr), Math.round(T / 16)), sp = Math.hypot(rp.vx || 0, rp.vy || 0);   // 大きさは 画面の 細かさから（めいろは 地図を 小さく 描くので、マスに 合わせると 数点に なって 見えなかった）
  let chirp = false;
  suzume.list = suzume.list.filter(b => {
    if (now < b.t0) return true;
    const age = now - b.t0, peck = Math.floor((age + b.seed) / 450) % 3 === 0;
    if (!b.fly && ((age > SUZUME_LIFE && !(b.v && roll.kind === 'stop')) || (sp > 0.8 && Math.hypot(b.x - rp.x, b.y - rp.y) < SUZUME_NEAR))) {   // 1羽 とびたつと、みんな いっしょに（すこし ずつ おくれて）
      suzume.list.forEach((o, i) => { if (!o.fly) { o.fly = now + i * 90; o.dir = o.x < rp.x ? -1 : 1; } }); chirp = true;
    }
    let X = ox + b.x * T, Y = oy + b.y * T, pose = peck ? 1 : 0;
    if (b.fly) { const ft = Math.max(0, now - b.fly) / 1000; if (ft > 1.2) return false; X += b.dir * ft * T * 4; Y -= ft * T * 3 + ft * ft * T * 2; pose = Math.floor(ft * 12) % 2 ? 1 : 2; }   // お米から はなれる ほうへ、上へ
    drawSuzume(Math.round(X), Math.round(Y), u, b.dir, pose);
    return true;
  });
  if (chirp) chunSound();
  dirty = true;
}
const CRITTER_SURE = 100;
// のこりの数（マインスイーパーの「まわりに いくつ あるかの数字」から。数字があると 運まかせでなく 考えて開けられる）：
// 田んぼ・水べに入ったとき、いまの季節に そこで会える生きもののうち まだ手帳にない数を出す（どこに いるかは言わない）。
// 0 なら「ぜんぶ会えた」で、ほかの場所へ行く目安になる。同じ場所の知らせは 10分に1回まで。その日の出会いが おわったら出さない
// 知らせを出せた（または出すものがない）ら true。歩く地図が見えていない・窓やパネルの下・運転中なら false（次の1歩で もう一度）
// 水べが川・池・用水か、海か（国土数値情報の土地利用。まわり100mメッシュ9つに「海水域」があれば海）。土地利用が読めていないときは ''
function waterKind(lat, lng) {
  if (!LU) return '';
  const dLat = LU.dLat, dLng = LU.dLng;
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) if (luAt(lat + a * dLat, lng + b * dLng) === 'k') return 'umi';
  return 'kawa';
}
function critterCount(where) {
  const now = performance.now();
  if (!G.critterLeft || !active || worldMode || driving || mapCovered() || sightBusy()) return false;
  if (now - (critterS.told[where] || -6e5) < 6e5) return true;
  const c = G.critterLeft(where);
  if (!c || !c.all) return true;
  critterS.told[where] = now;
  const name = where === 'paddy' ? '🌾 田んぼ' : '💧 水べ';
  floatText(c.left ? `${name}：まだ会っていない生きもの ${c.left}` : `${name}：いまの季節の生きものは ぜんぶ会えた`);
  dirty = true;
  return true;
}
// 路地の行き止まり（NetHack の「通路が ぷつっと終わる所を しらべると 隠し扉が見つかる」）：道（C.R）が その マスで終わっている（大きな道・小道へも続いていない）。
// まわり8マスを ひとまわり見て、道が 1かたまり（となり合う2マスまで）だけなら 行き止まり。斜めに描いた道（strokeLine）は 角だけで つながるので、
// 上下左右だけで数えると 道のとちゅうも 行き止まりに見えてしまう（まわりが まだ読み込んでいない所なら 数えない）
const RING8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
function alleyEnd(x, y) {
  if (codeAt(x, y) !== C.R) return false;
  const on = [];
  for (const [dx, dy] of RING8) { const c = codeAt(x + dx, y + dy); if (c === C.X) return false; on.push(c === C.R || c === C.H || c === C.D); }   // 小道（C.D）へ続く所も つながっている
  const n = on.filter(Boolean).length, groups = on.filter((v, i) => v && !on[(i + 7) % 8]).length;   // ひとまわりで 道が始まる所の数＝かたまりの数
  return n >= 1 && n <= 2 && groups === 1;
}
// まだ しらべていない 行き止まりに、小さく はねる「？」（地形が「ここを しらべて」と教える）。見分けは まとまりを読みこむまで覚えておく（nbrCache）。
// その日の分（1日3回）を見つけおわったら出さない
function alleyHint(tx, ty) {
  const k = `alley:${tx},${ty}`;
  let e = nbrCache.get(k);
  if (e === undefined) { e = alleyEnd(tx, ty); nbrCache.set(k, e); }
  return e && !!G.alleyOpen && G.alleyOpen(tx, ty);
}
function drawAlleyHint(X, Y, T, now) {
  const u = Math.max(1, Math.round(T / 16)), bob = Math.round(Math.sin(now / 260) * u);
  ctx.font = `bold ${Math.round(T * 0.55)}px "DotGothic16", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000'; for (const [dx, dy] of [[-u, 0], [u, 0], [0, -u], [0, u]]) ctx.fillText('?', X + T / 2 + dx, Y + T * 0.42 + bob + dy);
  ctx.fillStyle = '#ffe066'; ctx.fillText('?', X + T / 2, Y + T * 0.42 + bob);
}
// 水べで じっと見る（ポケモンの「釣りざおで、水べで出会えるものが ふえる」）：水の となりのマスで 4秒 止まっていると、水の中の生きものに出会う。
// 1.5秒で「👀 水の中を じっと見とる…」。動くまでは1回だけ。1日2回まで（生きもの手帳の1日の数にも入る。game.js の watchWater）
// 止まっているかは、見はじめた所から 半マス（4m）以上 動いていないか・転がしているなら お米が止まっているか で見る
// （同じマスの中を ゆっくり転がっていても 数えない。GPS の小さなゆれ では やりなおさない）
const watchS = { key: '', t: 0, done: false, told: false, ax: 0, ay: 0 };
function waterWatch(tgt, dt) {
  const tx = Math.floor(tgt.x), ty = Math.floor(tgt.y), key = `${tx},${ty}`;
  if (key !== watchS.key) { Object.assign(watchS, { key, t: 0, done: false, told: false, ax: tgt.x, ay: tgt.y }); return; }
  if (Math.hypot(tgt.x - watchS.ax, tgt.y - watchS.ay) > 0.5 || (rollOn && roll.v > 0.1)) { Object.assign(watchS, { t: 0, told: false, ax: tgt.x, ay: tgt.y }); return; }
  if (watchS.done || driving || mapCovered() || sightBusy() || BLOCK.has(codeAt(tx, ty)) || !G.watchOpen || !G.watchOpen()) return;
  const wet = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => codeAt(tx + dx, ty + dy) === C.A);
  if (!wet) return;
  watchS.t += dt;
  if (!watchS.told && watchS.t > 1.5) { watchS.told = true; floatText('👀 水の中を じっと見とる…'); }
  if (watchS.t < 4) return;
  watchS.done = true;
  const m = G.watchWater();
  if (m) { critterS.show = { id: m.id, x: tx + wet[0], y: ty + wet[1], t: performance.now() }; dirty = true; }
}
function critterStep(x, y) {
  if (driving) return;
  if (alleyEnd(x, y) && G.alleyFind && !mapCovered() && !sightBusy() && G.alleyFind(x, y, toLatLng(x + 0.5, y + 0.5))) { floatText('🔍 路地の奥'); dirty = true; }
  const near = codes => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => codes.has(codeAt(x + dx, y + dy)));
  const where = near(PADDY_CODES) ? 'paddy' : !BLOCK.has(codeAt(x, y)) && near(new Set([C.A])) ? 'water' : '';
  if (where) critterS.steps++;   // 田んぼ・水べのイベントが始まる1歩も 出会いまでの歩数に数える
  if (where !== critterS.where && (!where || critterCount(where))) critterS.where = where;   // 知らせを出せなかったら、次の1歩で もう一度
  // はじめての出会いは かならず・待ちすぎない（マインスイーパーの「1手目で地雷を ふんで終わる」・ブロックくずしの「打ちだしてすぐ落とす」から。
  // はじめの1回の運の悪さで やめてしまわないように）：まだ1回も会っていなければ 25歩目で、会ったことがあっても 100歩で かならず出会う
  // （1/40 の運だけだと、10人に1人は 115歩より長く待っていた）
  if (!where || critterS.steps < 25) return;
  const sure = critterS.steps >= CRITTER_SURE || !!(G.critterFirst && G.critterFirst());
  if (!sure && Math.random() >= 1 / 40) return;
  if (sure && (mapCovered() || sightBusy())) return;   // かならずの出会いは、窓・パネルを閉じたあとの1歩へ持ちこす
  critterS.steps = 0;
  const m = G.meetCritter(where);
  if (!m) return false;
  const spot = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).find(([a, b]) => !npcAt(a, b)) || [x + 1, y];
  critterS.show = { id: m.id, x: spot[0], y: spot[1], t: performance.now() };
  dirty = true;
  return true;
}
const npcSprites = {};
for (const [k, col] of Object.entries(NPC_COLORS)) {
  const pal = { ...PAL, ...col };
  npcSprites[k] = [sprite(NPC_ROWS, false, pal), sprite(NPC_ROWS.map((r, i) => (i >= 13 ? NPC_ROWS[i] : r)).map((r, i) => i === 9 ? r.replace('a', 'c') : r), false, pal)];
}
// 人の立つマス：スポットからずらした位置が建物や水なら、近くの歩けるマスへ（地図を読み込んでから決める）
const npcTileCache = new Map();
function npcTile(n) {
  const key = `${n.id}:${n.lat}:${n.lng}`, c = npcTileCache.get(key);
  if (c && c.ok) return c;
  const p = toTile(n.lat, n.lng), x0 = Math.floor(p.x), y0 = Math.floor(p.y);
  const code = codeAt(x0, y0);
  if (code === C.X) return { x: x0, y: y0, ok: false };   // まだ地図を読み込んでいない
  let best = null;
  for (let r = 0; r <= 8 && !best; r++)
    for (let dy = -r; dy <= r && !best; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (!BLOCK.has(codeAt(x0 + dx, y0 + dy))) { best = { x: x0 + dx, y: y0 + dy, ok: true }; break; }
    }
  const t = best || { x: x0, y: y0, ok: true };
  npcTileCache.set(key, t);
  return t;
}
const npcAt = (tx, ty) => (G.npcs || []).find(n => { const t = npcTile(n); return t.x === tx && t.y === ty; });
// ゆるい めいろ：人は 道すじの わき（1マス ほど はなれた 所）に 立つので、お米の まん中（道すじから MZ_TUBE マス以内）は 人の マスに 入れない。
// めいろでは 人の まん中から MZ_NPC_HIT マス以内に 来たら こつん（通しの プレイ確認で 分かった：ゆるい めいろに してから、どの 人にも 当たれなかった）
const MZ_NPC_HIT = 1.2;
function mzNpcNear(x, y) {
  let best = null, bd = MZ_NPC_HIT;
  for (const n of G.npcs || []) { const t = npcTile(n), d = Math.hypot(x - t.x - 0.5, y - t.y - 0.5); if (d < bd) { bd = d; best = n; } }
  return best;
}
// 話しかけた人の頭の上に、ぽんと気持ちの吹き出し（はじめて会った人は「！」、2回目からは「♪」か「♥」。1.6秒）
const npcEmotes = new Map();
const EMOTE_PIX = { '!': ['..#..', '..#..', '..#..', '.....', '..#..'], '♪': ['...##', '..#.#', '..#..', '.##..', '.##..'], '♥': ['.#.#.', '#####', '#####', '.###.', '..#..'] };
function emoteAt(sx, sy, T, k, age) {   // 頭の上の吹き出し（ぽんと上がって、少しゆれる）
  const u = Math.max(1, Math.round(T / 16)), bx = sx + Math.round(T * 0.5), by = sy - Math.round(T * 0.55) - Math.round(Math.min(1, age / 150) * 3 * u) + (Math.floor(age / 300) % 2 ? u : 0);
  ctx.fillStyle = '#000'; ctx.fillRect(bx - u, by - u, 9 * u, 9 * u);
  ctx.fillStyle = '#fff'; ctx.fillRect(bx, by, 7 * u, 7 * u); ctx.fillRect(bx + u, by + 7 * u, 2 * u, 2 * u);
  ctx.fillStyle = k === '♥' ? '#e0405a' : '#222';
  EMOTE_PIX[k].forEach((row, y) => { for (let x = 0; x < 5; x++) if (row[x] === '#') ctx.fillRect(bx + (x + 1) * u, by + (y + 1) * u, u, u); });
  dirty = true;
}
// 夜のさんぽ（昔のRPGの、暗い洞窟を たいまつで照らして進む しくみ）：日本時間の19時〜5時は、歩く地図を暗くして、
// 主人公のまわり（3マスほど）と、お店・駅などの建物の明かり、当店（いちばん明るい）、たからばこ だけが見える。夕方・明け方（18時台・5時台）は半分の暗さ。
// せってい「🌙 夜は地図を暗く」でオフにできる。看板・町名は暗くしない（あとから描く）
let nightOn = true;
try { nightOn = localStorage.getItem('nsg_night') !== '0'; } catch (e) { /* 既定 */ }
const nightCv = document.createElement('canvas');
let nightForce = null;
const nightLamps = { n: 0, warm: 0 };   // いま 描いた 街灯の 数・あたたかい 明かりの 数（テスト用）
function nightLevel(t = Date.now()) {
  const q = new URLSearchParams(location.search).get('night');
  if (q) return +q;   // 確かめ用（?night=1 で夜・0.5 で夕方）
  if (nightForce !== null) return nightForce;   // テスト用（nishioPixel.nightForce）
  const hr = new Date(t + 9 * 3600000).getUTCHours();
  return hr >= 19 || hr < 5 ? 1 : hr === 18 || hr === 5 ? 0.5 : 0;
}
// 朝の ひかり（朝の 改善 9。運営者の声「文字は減らして素朴なかわいさと平和さを散りばめる」）：日本時間の 5〜8時、夜の あかり（drawNight）の あとに
// 地図の 上から ほんのり あたたかい 朝の 色（6時ごろが いちばん・8時に 消える）。見にくく ならない よう うすく（上 0.22・下 0.05）。文字は なし
let morningForce = null;
function morningLevel(t = Date.now()) {
  if (morningForce !== null) return morningForce;
  const d = new Date(t + 9 * 3600000), h = d.getUTCHours() + d.getUTCMinutes() / 60;
  return h < 5 || h >= 8 ? 0 : h < 6 ? h - 5 : 1 - (h - 6) / 2;
}
const morning = { k: 0 };
function drawMorning(w, h) {
  const k = nightOn && !worldMode && !gbOn ? morningLevel() : 0;
  morning.k = k;
  if (!k) return;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, `rgba(255,180,110,${0.22 * k})`); g.addColorStop(0.55, `rgba(255,210,150,${0.1 * k})`); g.addColorStop(1, `rgba(255,230,190,${0.05 * k})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
function drawNight(w, h, ox, oy, T, cy, pois, now) {
  const lv = nightOn && !worldMode ? nightLevel() : 0;
  if (!lv) { nightLamps.n = nightLamps.warm = 0; return; }
  if (nightCv.width !== w || nightCv.height !== h) { nightCv.width = w; nightCv.height = h; }
  const x = nightCv.getContext('2d');
  x.globalCompositeOperation = 'source-over';
  x.clearRect(0, 0, w, h);
  x.fillStyle = `rgba(8,12,36,${0.62 * lv})`; x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = 'destination-out';   // 明かりの所を くりぬく
  const light = (px, py, r, k = 1) => {
    if (px < -r || py < -r || px > w + r || py > h + r) return;
    const g = x.createRadialGradient(px, py, r * 0.25, px, py, r);
    g.addColorStop(0, `rgba(0,0,0,${k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
  };
  const flick = 1 + Math.sin(now / 180) * 0.03;   // たいまつのように、少し ゆらぐ
  if (G.me || G.demo) light(w / 2 + heroScr.x, cy + heroScr.y - T * 0.25, T * 3.4 * flick);
  for (const p of pois) light(ox + p[0] * T, oy + p[1] * T - T * 0.5, T * (p[4] === 'lm' ? 1.6 : 1.3), 0.85);   // お店・駅・建物の窓の明かり
  for (const s of G.spots || []) if (s.shop) { const p = toTile(s.lat, s.lng); light(ox + p.x * T, oy + p.y * T - T, T * 3.2); }   // 当店は いちばん明るく
  for (const c of G.liveChests()) { const p = toTile(c.lat, c.lng); light(ox + p.x * T, oy + p.y * T, T * 0.9, 0.7); }
  // 道の 街灯（夜の 改善 2。運営者の声「文字は減らして素朴なかわいさと平和さを散りばめる」）：道の マスに ところどころ（11マスに 1つほど）、
  // あたたかい 色の 光の 輪。家・お店の 窓の 明かりも ほんのり だいだい色に。文字の 知らせ（「🌙 夜のさんぽ…」）は やめて 明かりで 伝える
  const lamps = [], tx0 = Math.floor(-ox / T), ty0 = Math.floor(-oy / T), tx1 = Math.ceil((w - ox) / T), ty1 = Math.ceil((h - oy) / T);
  for (let ty = ty0; ty <= ty1 && lamps.length < 60; ty++) for (let tx = tx0; tx <= tx1 && lamps.length < 60; tx++) {
    const c = codeAt(tx, ty);
    if (c !== C.R && c !== C.H && c !== C.D) continue;
    const hh = Math.imul(tx, 83492791) ^ Math.imul(ty, 2971215073), u = (hh ^ (hh >>> 16)) >>> 0;
    if (u % 11 === 0) lamps.push([ox + (tx + 0.5) * T, oy + (ty + 0.5) * T]);
  }
  for (const [lx, ly] of lamps) light(lx, ly, T * 1.2, 0.75);
  gbPause++;
  ctx.drawImage(nightCv, 0, 0);
  if (!gbOn) {
    const warm = (px, py, r, a) => {
      if (px < -r || py < -r || px > w + r || py > h + r) return 0;
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, `rgba(255,170,70,${a * lv})`); g.addColorStop(1, 'rgba(255,170,70,0)');
      ctx.fillStyle = g; ctx.fillRect(px - r, py - r, r * 2, r * 2); return 1;
    };
    let n = 0;
    for (const p of pois) n += warm(ox + p[0] * T, oy + p[1] * T - T * 0.5, T * 1.1, 0.3);
    const u = Math.max(1, Math.round(T / 16));
    for (const [lx, ly] of lamps) { n += warm(lx, ly, T * 1.1, 0.34); ctx.fillStyle = '#ffe7a8'; ctx.fillRect(Math.round(lx - u), Math.round(ly - u), u * 2, u * 2); }   // 街灯の あかりの 粒
    nightLamps.warm = n;
  }
  nightLamps.n = lamps.length;
  gbPause--;
}
// 人の話で 次の転がり先が決まる：転がしているとき、話で 行き先が決まったら、話を とじたときに その人が お米を 行き先のほうへ ころん と押してくれる
let npcSend = null;
function openNpc(n) {
  const first = !G.npcMet(n.id);
  const r = G.talkNpc(n.id);
  if (!r) return;
  const gs = G.state.guide;
  npcSend = rollOn && G.demo && gs && gs.byId === n.id && Date.now() - (gs.t || 0) < 3000 ? { n, name: gs.name } : null;
  npcEmotes.set(n.id, { t: performance.now(), k: first ? '!' : (n.id.length + G.state.met.length) % 2 ? '♪' : '♥' });
  $('pxInfoBody').innerHTML = r.html; $('pxInfo').hidden = false;
}
// 呼びとめ（昔のドット絵RPGの「目が合ったら勝負」を、話しかけに）：まだ話していない人の まっすぐ前後左右 SIGHT マス以内に入り、
// あいだに建物・水・ほかの人がなければ、頭に「！」が出て、その人のほうから歩いてきて話しかけてくる（行き先も その人のすすめに変わる）。
// 歩いてくる間と話の間は、主人公は動けない。同じ人が呼びとめるのは、開いている間に1回だけ
const SIGHT = 4, SIGHT_WAIT = 650, SIGHT_STEP = 150;
const sight = { n: null, t: 0, from: null, to: null, len: 0, opened: false, seen: new Set() };
function sightCheck() {
  if (sightBusy() || driving || worldMode || !$('pxInfo').hidden || (!G.demo && !G.me) || document.body.classList.contains('jump-open') || medashiShown()) return false;   // ミニゲーム・田んぼのイベントの間は呼びとめない
  const t = targetTile(), hx = Math.floor(t.x), hy = Math.floor(t.y);
  for (const n of G.npcs || []) {
    if (G.npcMet(n.id) || sight.seen.has(n.id)) continue;
    const q = npcTile(n);
    if (!q.ok) continue;
    const dx = hx - q.x, dy = hy - q.y, d = Math.abs(dx) + Math.abs(dy);
    if ((dx && dy) || d < 2 || d > SIGHT) continue;   // となり（1マス）なら、ぶつかって話しかける ふつうのやり方で
    const ux = Math.sign(dx), uy = Math.sign(dy);
    let clear = true;
    for (let i = 1; i < d && clear; i++) { const x = q.x + ux * i, y = q.y + uy * i; if (BLOCK.has(codeAt(x, y)) || npcAt(x, y)) clear = false; }
    if (!clear) continue;
    sight.seen.add(n.id);
    Object.assign(sight, { n, t: performance.now(), from: { x: q.x, y: q.y }, to: { x: hx - ux, y: hy - uy }, len: d - 1, opened: false });
    facing = dx ? (dx > 0 ? 'left' : 'right') : (dy > 0 ? 'up' : 'down');   // 主人公も その人のほうを向く
    npcEmotes.set(n.id, { t: sight.t, k: '!' });
    tapWalkStop();
    G.sound.jingle('eye');
    dirty = true;
    return true;
  }
  return false;
}
// 呼びとめの途中か。せかいちずに切りかえた などで止まったままにならないよう、時間がすぎて話も閉じていれば終わりにする
function sightBusy() {
  if (sight.n && $('pxInfo').hidden && performance.now() - sight.t > SIGHT_WAIT + sight.len * SIGHT_STEP + 1500) sightEnd();
  return !!sight.n;
}
function sightEnd() { sight.n = null; G.callNpc(null); dirty = true; }   // 話が終わったら、その人は もとの場所へ
// 呼びとめた人の いまの位置（「！」のあと、主人公のとなりまで歩いてくる）。話が終わったら もとの場所へ
function sightTick(now) {
  if (!sight.n) return null;
  const k = Math.max(0, Math.min(1, (now - sight.t - SIGHT_WAIT) / (sight.len * SIGHT_STEP)));
  if (k >= 1 && !sight.opened) { sight.opened = true; G.callNpc(sight.n.id); if ($('pxInfo').hidden) { const h = targetTile(); npcGreet(sight.n, Math.floor(h.x), Math.floor(h.y)); } }   // 呼びとめも こつんと 同じく あいさつ ずみに（自分で 遊んで 分かった：呼びとめた ゴールの 人の 話を とじると、お米が 次の ゴールへ 押されて その人に 当たり、同じ 話が また 開いた）
  else if (sight.opened && $('pxInfo').hidden) { sightEnd(); return null; }
  if (k < 1) dirty = true;
  return { x: sight.from.x + (sight.to.x - sight.from.x) * k, y: sight.from.y + (sight.to.y - sight.from.y) * k, walking: k > 0 && k < 1 };
}
const heroSprites = {};
for (const dir of ['down', 'up', 'right']) heroSprites[dir] = [sprite([...HERO_TOP, ...HERO[dir], ...LEGS_A]), sprite([...HERO_TOP, ...HERO[dir], ...LEGS_B])];
heroSprites.left = heroSprites.right.map((_, i) => sprite(mirror([...HERO_TOP, ...HERO.right, ...(i ? LEGS_B : LEGS_A)])));
// 車（米袋を積んだ白い軽トラ。上から見た絵。上向きの絵を回して4方向に）
const CAR_UP = ['................', '.....kkkkkk.....', '....kywwwwyk....', '...kgwwwwwwgk...', '..GkbbbbbbbbkG..', '..GkbBBBBBBbkG..', '...kwwwwwwwwk...', '...kggggggggk...',
  '...kgssssssgk...', '..GkgsNssNsgkG..', '..GkgssssssgkG..', '...kgsNssNsgk...', '...kgssssssgk...', '...kggggggggk...', '....krggggrk....', '.....kkkkkk.....'];
const rotCW = rows => rows.map((_, y) => rows.map((__, x) => rows[15 - x][y]).join(''));
const carSprites = { up: sprite(CAR_UP) };
carSprites.right = sprite(rotCW(CAR_UP)); carSprites.down = sprite(rotCW(rotCW(CAR_UP))); carSprites.left = sprite(rotCW(rotCW(rotCW(CAR_UP))));
// ふつうの地図の現在地マーカーも、同じ勇者のドット絵（2コマで足ぶみ）にする（Blender の人の絵が読めたら、それに描きかえる）
const heroMarkerStyle = document.createElement('style');
// 主人公の「お米」（tools/blender/rice.py → nishio-go/art/rice.png）：32×32 が 横8 × たて2（1行め：右へ でんぐり返る、2行め：手前へ転がる）。歩く地図には 2マスで描く（ドットの大きさは ほかの絵と同じ）。
// 左は右の反転、上は手前の逆の順。転がった道のり（roll.d、マス）で コマを進める（1マスで ひとまわり）。止まっているときは1コマめ（こっちを見ている）
const riceSprites = { right: [], left: [], down: [], up: [], ready: false };
const roll = { d: 0, last: null, lastK: null, ang: 0, av: 0, side: 0, sq: 0, sqv: 0, sqx: false, shake: 0, dust: [], dustT: 0, kind: 'stop', wad: 0, spin: 0, sv: 0, pitch: 0, pv: 0, vert: false, h: 0, hv: 0, gnd: null, back: null, trail: [], fx: [], fxAcc: 0, fxN: 0, sendT: 0, sendA: 0, sends: 0, flat: 0, wetT: 0, jumpCd: 0, zg: null, jumps: 0, look: 0, dirt: 0, dirtCol: '150,120,80', v: 0, peak: 0, idle: 0, ouchT: 0, happyT: 0, spinT: 0, dizzyT: 0 };   // d：転がった道のり（マス）・lastK：転がり方の 道のりを 数える 前の こまの 行き先・ang：いまの回り（ラジアン）・av：回る速さ・side：寝た回数（コトン）・sq：つぶれ・shake：画面のゆれ・dust：土ぼこり
// v：いまの速さ・peak：止まるまでの いちばんの速さ・idle：止まっている時間・ouchT・happyT・dizzyT：表情（いたい・うれしい・目が回る）の のこり時間・spinT：くるくるしている時間
// kind：いまの転がり方（stop・よちよち waddle・ころころ tumble・くるくる spin・ぴょん hop）・wad：よちよちの ゆれ・spin：くるくるの回り・sv：その速さ・h：とんだ高さ（マス）・gnd：足もとの地面・back：うしろ姿の絵
(() => {
  const img = new Image();
  img.onload = () => {
    const N = img.height / 2;   // 1コマの大きさ
    const cut = (i, r, flip) => {
      const c = document.createElement('canvas'); c.width = c.height = N;
      const x = c.getContext('2d');
      if (flip) { x.translate(N, 0); x.scale(-1, 1); }
      x.drawImage(img, i * N, r * N, N, N, 0, 0, N, N);
      return c;
    };
    for (let i = 0; i < 8; i++) {
      riceSprites.right.push(cut(i, 0)); riceSprites.left.push(cut(i, 0, true));
      riceSprites.down.push(cut(i, 1)); riceSprites.up.push(cut((8 - i) % 8, 1));
    }
    roll.back = cut(0, 0);   // うしろ姿（くるくる回るときに見える）：顔（まっ黒な目と口・ピンクのほっぺ）を つぶの色でぬる
    const bx = roll.back.getContext('2d'), bd = bx.getImageData(0, 0, N, N), q = bd.data;
    for (let i = 0; i < q.length; i += 4) if (q[i + 3] && ((q[i] === 14 && q[i + 1] === 14 && q[i + 2] === 14) || (q[i] === 246 && q[i + 1] === 160 && q[i + 2] === 176))) { q[i] = 246; q[i + 1] = 245; q[i + 2] = 238; }
    bx.putImageData(bd, 0, 0);
    riceBallInit(cut(0, 0));
    riceSprites.ready = true; setHeroMarker(); dirty = true;
  };
  img.src = 'nishio-go/art/rice.png';
})();
// 丸く見せる：お米を 画面の 細かさで 回し、光を いつも左上から当てなおす（つぶを たまごの形とみて、点ごとに 面の向きを出す）。
// 回っても てかりは左上・影は右下のままなので、紙を回したようにならず、ころんと丸く見える。影は 段なしの 連続、ふちどりは回したあとに描きなおす（くわしくは drawRiceBall・docs/korokoro.md「なめらかに ころころ」）
const riceBall = { fill: null, face: null, cv: null, x: null, gx: 0, gy: 0, a: 1, b: 1, nx: 0, ny: 0, nr: 0 };
const RB = 48;   // 回した絵を描く場所の大きさ（点）
const RICE_TONE = [[178, 182, 192], [208, 211, 219], [231, 232, 234], [246, 245, 239], [252, 251, 247], [255, 255, 255]];   // 深い影・影・なか・つぶの色・明るい・てかり
// あいちのかおりの つぶ（運営者の 写真「あいちのかおりが ころころ 転がる」2026-10-29）：まっ白より すこし すきとおった 乳白色。影は 青みを へらした やわらかい 灰、
// ふちは 光が ぬけて うすく 明るい、まん中は 白く にごる。たてに 細い すじ（縦溝）が 2本 うっすら。顔・ふちどり・形は そのまま（赤ちゃんの かわいさは のこす）
const RICE_MILK = [236, 237, 236], RICE_CORE = [251, 250, 246];
function riceStreak(ex, ey) {   // 縦すじの こさ（0〜1）：つぶの 中の 位置（はば・高さを −1〜1）。はばの ±0.38 に 細く、上下の はしでは うすれる
  const a = (ex - 0.38) / 0.075, b = (ex + 0.38) / 0.075, fade = Math.max(0, 1 - ey * ey * 1.15);
  return (Math.exp(-a * a) + Math.exp(-b * b)) * fade;
}
const RICE_LIGHT = (() => { const v = [-0.5, -0.7, 0.75], n = Math.hypot(...v); return v.map(c => c / n); })();
const RICE_HALF = (() => { const v = [RICE_LIGHT[0], RICE_LIGHT[1], RICE_LIGHT[2] + 1], n = Math.hypot(...v); return v.map(c => c / n); })();
function riceBallInit(src) {
  const N = src.width, sd = src.getContext('2d').getImageData(0, 0, N, N).data;
  const fill = document.createElement('canvas'), face = document.createElement('canvas');
  fill.width = fill.height = face.width = face.height = N;
  const fx = fill.getContext('2d'), gx = face.getContext('2d'), fd = fx.createImageData(N, N), gd = gx.createImageData(N, N);
  let L = N, R = -1, T = N, B = -1;
  for (let i = 0; i < N * N; i++) {
    const r = sd[i * 4], g = sd[i * 4 + 1], b = sd[i * 4 + 2];
    if (!sd[i * 4 + 3] || (r === 26 && g === 26 && b === 26)) continue;   // まわりの線は のぞく（回したあとに描きなおす）
    fd.data.set([255, 255, 255, 255], i * 4);
    if ((r === 14 && g === 14 && b === 14) || (r === 246 && g === 160 && b === 176)) gd.data.set([r, g, b, 255], i * 4);   // 顔（目・口・ほっぺ）
    const x = i % N, y = (i - x) / N;
    L = Math.min(L, x); R = Math.max(R, x); T = Math.min(T, y); B = Math.max(B, y);
  }
  fx.putImageData(fd, 0, 0); gx.putImageData(gd, 0, 0);
  const cv = document.createElement('canvas'); cv.width = cv.height = RB;
  {   // ぼかした 形：絵の 点の 段（がたがた）ではなく、絵に 合わせた だ円から 胚芽の くぼみ（円）を けずった 形を 4倍の 細かさで 描き、
    // 絵の1点ぶん ぼかす。こさ 0.5 の 線が つぶの ふち・0.16 が ふちどりの 外がわ（絵との ちがいは 点の 段だけ。2026-10-28 に 当てはめて 確かめた）
    const pd = 3, F = 4, M = (N + 2 * pd) * F, gx = (L + R + 1) / 2, gy = (T + B + 1) / 2, A = (R - L + 1) / 2, Bv = (B - T + 1) / 2 - 0.1;
    const nx = R + 1.5, ny = T + (B - T) * 0.2 + 0.5, nr = (R - L) * 0.26 * 0.96;
    const sg0 = F, rad = Math.ceil(sg0 * 3), K = [];
    for (let q = -rad; q <= rad; q++) K.push(Math.exp(-q * q / (2 * sg0 * sg0)));
    const ks = K.reduce((x, y) => x + y, 0), a0 = new Float32Array(M * M), a1 = new Float32Array(M * M);
    for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
      const X = (x + 0.5) / F - pd, Y = (y + 0.5) / F - pd;
      a0[y * M + x] = ((X - gx) / A) ** 2 + ((Y - gy) / Bv) ** 2 < 1 && (X - nx) ** 2 + (Y - ny) ** 2 > nr * nr ? 1 : 0;
    }
    for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) { let t = 0; for (let q = -rad; q <= rad; q++) { const xx = x + q; if (xx >= 0 && xx < M) t += K[q + rad] * a0[y * M + xx]; } a1[y * M + x] = t / ks; }
    const soft = document.createElement('canvas'); soft.width = soft.height = M;
    const sg = soft.getContext('2d'), si = sg.createImageData(M, M);
    for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) { let t = 0; for (let q = -rad; q <= rad; q++) { const yy = y + q; if (yy >= 0 && yy < M) t += K[q + rad] * a1[yy * M + x]; } si.data.set([255, 255, 255, Math.round(t / ks * 255)], (y * M + x) * 4); }
    sg.putImageData(si, 0, 0);
    riceBall.soft = soft; riceBall.pad = pd;
  }
  riceBall.faces = riceFaces(face, sd, N);
  {   // よごれの しみの場所（つぶの中・顔と ふちを よけて、きまった ばらばらの10か所）
    const pts = [], fd2 = face.getContext('2d').getImageData(0, 0, N, N).data;
    let h = 2166136261;
    for (let tries = 0; tries < 400 && pts.length < 10; tries++) {
      h = Math.imul(h ^ (tries + 1), 16777619) >>> 0;
      const x = h % N, y = (h >>> 8) % N, i = y * N + x;
      if (!fd.data[i * 4 + 3] || fd2[i * 4 + 3]) continue;
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => fd.data[((y + b) * N + x + a) * 4 + 3])) continue;   // ふちの すぐ内がわは よける
      if (pts.some(p => Math.abs(p[0] - x) + Math.abs(p[1] - y) < 4)) continue;
      pts.push([x, y]);
    }
    riceBall.spots = pts;
  }
  Object.assign(riceBall, { fill, face, cv, x: cv.getContext('2d', { willReadFrequently: true }), gx: (L + R + 1) / 2, gy: (T + B + 1) / 2, a: (R - L + 1) / 2, b: (B - T + 1) / 2,
    nx: R + 1.5, ny: T + (B - T) * 0.2 + 0.5, nr: (R - L) * 0.26 });   // 胚芽の くぼみ（tools/blender/rice.py と同じ場所）
}
// 表情：ふだんの にっこり（絵のまま）のほかに、点で描いた顔。目・ほっぺ・口の場所は 絵の顔（左の目の左上）に合わせる
//   blink まばたき・happy ^^ うれしい・excited ><（速くて たのしい）・wow びっくり（とんでいる）・ouch いたい・dizzy ×× 目が回る・sleepy すやすや
const FACE_COL = { E: [14, 14, 14], P: [246, 160, 176], R: [184, 52, 64], T: [240, 124, 140], W: [255, 255, 255] };
const FACE_PARTS = {
  eyes: 'E 0,0 1,0 0,1 1,1 0,2 1,2 7,0 8,0 7,1 8,1 7,2 8,2',
  shut: 'E 0,2 1,2 7,2 8,2',
  arcUp: 'E -1,1 0,0 1,0 2,1 6,1 7,0 8,0 9,1',
  arcDown: 'E -1,1 0,2 1,2 2,1 6,1 7,2 8,2 9,1',
  gtlt: 'E 0,0 1,1 0,2 8,0 7,1 8,2',
  big: 'E 0,-1 1,-1 0,0 1,0 0,1 1,1 0,2 1,2 7,-1 8,-1 7,0 8,0 7,1 8,1 7,2 8,2',
  cross: 'E -1,0 1,0 0,1 -1,2 1,2 7,0 9,0 8,1 7,2 9,2',
  cheeks: 'P -2,3 -1,3 -2,4 -1,4 11,3 12,3 11,4 12,4',
  cheeksBig: 'P -3,3 -2,3 -1,3 -2,4 -1,4 -2,5 11,3 12,3 13,3 11,4 12,4 11,5',
  smile: 'E 1,4 2,5 3,5 4,5 5,5 6,5 7,4',
  open: 'E 1,4 2,4 3,4 4,4 5,4 6,4 7,4 1,5 7,5 2,6 6,6 3,7 4,7 5,7|R 2,5 3,5 4,5 5,5 6,5|T 3,6 4,6 5,6',
  o: 'E 3,5 4,5 2,6 5,6 3,7 4,7|R 3,6 4,6',
  wave: 'E 1,5 2,4 3,5 4,4 5,5 6,4 7,5',
  tiny: 'E 3,5 4,5',
  shine: 'W 0,0 7,0',   // 目の きらっ（赤ちゃんの ような うるうるの 目）
  shineBig: 'W 0,-1 7,-1',
};
const FACE_SET = {
  blink: 'shut cheeks smile', happy: 'arcUp cheeks open', excited: 'gtlt cheeksBig open', wow: 'big shineBig cheeks o', yawn: 'shut cheeks o',
  ouch: 'gtlt cheeks wave', dizzy: 'cross wave', sleepy: 'arcDown cheeks tiny',
};
function riceFaces(face, sd, N) {
  let ex = N, ey = N;
  for (let i = 0; i < N * N; i++) if (sd[i * 4 + 3] && sd[i * 4] === 14 && sd[i * 4 + 1] === 14 && sd[i * 4 + 2] === 14) { const x = i % N, y = (i - x) / N; if (y < ey || (y === ey && x < ex)) { ey = y; ex = x; } }   // 左の目の左上
  const out = { smile: face };
  {   // ふだんの にっこり（絵の 顔）にも 目の きらっ。左右の 目の 左上の 1点を 白く
    const c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'); g.drawImage(face, 0, 0);
    const d = g.getImageData(0, 0, N, N);
    for (const dx of [0, 7]) { const x = ex + dx, y = ey; if (x < N && y < N && d.data[(y * N + x) * 4 + 3]) d.data.set([...FACE_COL.W, 255], (y * N + x) * 4); }
    g.putImageData(d, 0, 0); out.smile = c;
  }
  for (const [k, parts] of Object.entries(FACE_SET)) {
    const c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), d = g.createImageData(N, N);
    for (const part of parts.split(' ')) for (const run of FACE_PARTS[part].split('|')) {
      const [col, ...pts] = run.split(' ');
      for (const pt of pts) { const [dx, dy] = pt.split(',').map(Number), x = ex + dx, y = ey + dy; if (x >= 0 && y >= 0 && x < N && y < N) d.data.set([...FACE_COL[col], 255], (y * N + x) * 4); }
    }
    g.putImageData(d, 0, 0); out[k] = c;
  }
  return out;
}
// いまの表情（転がり方・できごとから）
function riceMood(now) {
  if (roll.ouchT > 0) return 'ouch';
  if (roll.wetT > 0.7) return 'wow';   // 水に ぽちゃん：びっくり
  if (roll.h > 0) return 'wow';
  if (roll.dizzyT > 0) return 'dizzy';
  if (roll.v > 3.4) return 'excited';
  if (roll.happyT > 0) return 'happy';
  if (roll.kind === 'stop' && roll.idle > 6 && roll.idle < 12 && (roll.idle - 6) % 5 < 0.9) return 'yawn';   // 止まって しばらくすると ふわぁと あくび（赤ちゃんの ような かわいさ。運営者の声 2026-10-28）
  if (roll.kind === 'stop' && roll.idle > 12) return 'sleepy';
  if (roll.kind === 'stop' && now % 3700 < 140) return 'blink';
  return 'smile';
}
const riceBreath = now => Math.sin(now / 2600 * Math.PI * 2) * (roll.idle > 12 ? 0.03 : 0.018);   // 息：2.6秒で 1回。ねむって いる ときは 少し 大きく ゆっくり 見える
// ちょうちょ：ねむって いる お米の 頭に ひらひら 飛んで きて とまり、お米が おきると 飛んで いく（文字の ない 素朴な かわいさ。運営者の声 2026-10-28）。
// 絵は 7×5 の 点（k ふち・y はね・b からだ）。動きを へらす 設定の 人には 出さない。遊びの じゃまに ならない よう、お米が 動き出したら すぐ 飛んで いく
const BFLY = { open: ['kk...kk', 'kyk.kyk', 'kyybyyk', 'kyk.kyk', 'kk...kk'], shut: ['...k...', '..kyk..', '..kbk..', '..kyk..', '...k...'] }, BFLY_COL = { k: '#2a2a2a', y: '#ffe27a', b: '#5a4630' };
// 秋（季節の 小さな 虫が 赤とんぼの ころ）は 赤とんぼが 頭に とまる（棒の 先などに とまる 秋の すがた）。点（h あたま・R からだ・w はね・g はねの ふち）。とまって いる 間は はねを ひらいた まま
const TONBO = { open: ['....h....', 'gwwgRgwwg', '.ggwRwgg.', 'gwwgRgwwg', '.gg.R.gg.', '....R....'], shut: ['....h....', '..gwRwg..', '...gRg...', '..gwRwg..', '...gRg...', '....R....'] }, TONBO_COL = { h: '#5a1a14', R: '#d8402a', w: '#e4f2fb', g: '#6f8fa6' };   // 9×6。はねは 4枚（ふちを こく して 地面の 上でも 見える）
const bfly = { phase: '', t0: 0, x: 0, y: 0, drawn: 0 }, bflyCv = {};
const bflyIn = t => { const k = Math.min(1, t / 3), e = 1 - (1 - k) ** 2; return { dx: (1 - e) * 46 + Math.sin(t * 5) * 5 * (1 - e), dy: -(1 - e) * 40 + Math.cos(t * 4) * 3 * (1 - e), rest: k >= 1 }; };   // 頭からの ずれ（絵の 点）。3秒で とまる
function drawBfly(hx, by, u, now, sleepy) {
  if (calmMotion) { bfly.phase = ''; return; }
  if (sleepy && bfly.phase !== 'in' && bfly.phase !== 'rest') { bfly.phase = 'in'; bfly.t0 = now; bfly.kind = mushiKind() === 'tonbo' ? 'tonbo' : 'chocho'; }   // 飛んで くる ときに きめる（とちゅうで かわらない）
  else if (!sleepy && (bfly.phase === 'in' || bfly.phase === 'rest')) { bfly.phase = 'out'; bfly.t0 = now; }
  if (!bfly.phase) return;
  const t = (now - bfly.t0) / 1000, hx0 = hx + 2 * u, hy0 = by - 12 * u;   // 頭の てっぺん（すこし 右。足が 頭に つく 高さ）
  let x, y, flap;
  if (bfly.phase === 'out') {   // おきたら 右上へ ふわっと 飛んで いく
    if (t > 1.6) { bfly.phase = ''; return; }
    x = bfly.x + t * 30 * u + Math.sin(t * 9) * 2 * u; y = bfly.y - t * 34 * u; flap = Math.floor(now / 90) % 2;
    ctx.globalAlpha = Math.max(0, 1 - t / 1.6);
  } else {
    const q = bflyIn(t); if (q.rest) bfly.phase = 'rest';
    x = hx0 + q.dx * u; y = hy0 + q.dy * u; bfly.x = x; bfly.y = y;
    flap = q.rest ? (bfly.kind === 'tonbo' ? 1 : now % 2600 < 700 ? Math.floor(now / 350) % 2 : 1) : Math.floor(now / (bfly.kind === 'tonbo' ? 60 : 110)) % 2;   // とまって いる 間は ときどき ゆっくり はねを 動かす（とんぼは ひらいた まま）
  }
  const tb = bfly.kind === 'tonbo', SP = tb ? TONBO : BFLY, COL = tb ? TONBO_COL : BFLY_COL, pat = flap ? SP.open : SP.shut, W = pat[0].length, Hh = pat.length, q = Math.max(1, Math.round(u * 1.3));
  const key = (tb ? 't' : 'c') + (flap ? 'o' : 's') + q;
  let cv = bflyCv[key];
  if (!cv) {   // 点を 1枚の 絵に まとめて から 描く（点ごとに 小数の 位置で 描くと、点の あいだに すき間の 線が 出た）
    cv = bflyCv[key] = document.createElement('canvas'); cv.width = W * q; cv.height = Hh * q; const g = cv.getContext('2d');
    for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) { const c = pat[j][i]; if (c !== '.') { g.fillStyle = COL[c]; g.fillRect(i * q, j * q, q, q); } }
  }
  bfly.smooth = !rec && !(gbOn && !worldMode); bfly.at = [x - W / 2 * q, y - Hh * q];   // テスト用
  if (!bfly.smooth) { const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false; ctx.drawImage(cv, Math.round(x - W / 2 * q), Math.round(y - Hh * q)); ctx.imageSmoothingEnabled = sm; bfly.at = bfly.at.map(Math.round); }   // ゲームボーイの4色・Godot の 記録係は 点の まま 整数の 位置に（まぜると 4色 いがいの 色が 出る。Codex の 指摘）
  else { const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = true; ctx.drawImage(cv, x - W / 2 * q, y - Hh * q); ctx.imageSmoothingEnabled = sm; }   // 点より 細かい 位置で なめらかに 飛ぶ
  ctx.globalAlpha = 1; bfly.drawn++;
}
const riceWake = dt => (dt < 0 || dt > 600 ? 0 : 0.1 * Math.sin(Math.PI * dt / 600));   // おきた ときの のび（0.6秒・いちばん のびて 10%）
const drop = { cv: {}, n: 0, at: null };   // ぽちゃん のあとの 水の しずく（5×5 の 点。テスト用に 描いた 数・位置）
function dropSprite(q) {
  if (!drop.cv[q]) {
    const c = drop.cv[q] = document.createElement('canvas'); c.width = c.height = 5 * q; const g = c.getContext('2d'), r = (x, y, w, h) => g.fillRect((x + 1) * q, (y + 1) * q, w * q, h * q);   // (x, y) は しずくの 左上からの 点（-1 から）
    g.fillStyle = '#1a1a1a'; r(1, -1, 1, 1); r(0, 0, 3, 3); r(-1, 1, 5, 2); r(0, 3, 3, 1);
    g.fillStyle = '#8fd0f4'; r(1, 0, 1, 1); r(0, 1, 3, 2);
    g.fillStyle = '#ffffff'; r(0, 1, 1, 1);
  }
  return drop.cv[q];
}
const zzz = { cv: {}, n: 0, at: null };   // すやすやの Z（テスト用に 描いた 数・位置）
function zzzSprite(q) {
  if (!zzz.cv[q]) { const c = zzz.cv[q] = document.createElement('canvas'); c.width = c.height = 5 * q; const g = c.getContext('2d'); g.fillStyle = '#34407a'; g.fillRect(0, 0, 5 * q, q); for (let j = 1; j < 4; j++) g.fillRect((4 - j) * q, j * q, q, q); g.fillRect(0, 4 * q, 5 * q, q); }
  return zzz.cv[q];
}
const riceTall = pitch => Math.sqrt(Math.cos(pitch) ** 2 + (0.88 * (riceBall.a || 10) / (riceBall.b || 13.5) * Math.sin(pitch)) ** 2);   // たての ころころで 見える 高さ（立っているときを 1。寝ると つぶの 厚みだけ）
// お米を描く：(X, Y) まん中（画面の点）・u：絵の1点の大きさ・th：回り・sx, sy：つぶれ・spin：くるくるの回り・dst：描く先（はじめの画面のアニメーションにも使う）・gb：ゲームボーイの4色で
function drawRiceBall(X, Y, u, th, sx, sy, spin, dst = ctx, gb = gbOn && !worldMode, mood = 'smile', look = 0, dirt = 0, dirtCol = '', pitch = 0) {
  // なめらかに ころころ（運営者の声 2026-10-28「この キャラクターくらい 滑らかに」）：画面の 細かさで 描き、影は 段でなく 連続に、ふちは なめらかに、
  // 位置は 整数に 丸めない（点より 細かい ずれも 絵の 中で 描く）。ゲームボーイの4色の ときだけは これまでどおり 絵の 点の 細かさで
  const rb = riceBall, o = rb.x, H = RB / 2, cs = Math.cos(spin), sn = Math.sin(spin), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const bw = Math.sqrt(cs * cs + (0.88 * sn) ** 2), mx = cs < 0 ? -1 : 1, kx = sx * bw * mx;   // くるくる：横を向いても つぶの厚み（88%）は残る。うしろを向いたら くぼみは反対がわ
  const my = cp < 0 ? -1 : 1, ky = sy * riceTall(pitch) * my;   // たての ころころ：前に 寝ると 短く（はしから 見える）。うしろを 向くと 上下 さかさ
  const P = gb ? 1 : Math.min(u, riceLowQ ? 2 : RICE_PMAX), k0 = P / u;   // riceLowQ：うすい のこりかげの とき だけ
  const X0 = gb ? Math.round(X - H * u) : Math.floor(X - H * u - 1), Y0 = gb ? Math.round(Y - H * u) : Math.floor(Y - H * u - 1);
  const ox0 = (X - X0) * k0, oy0 = (Y - Y0) * k0, S = Math.ceil(RB * P) + 3;   // つぶの まん中（絵の 中の ピクセル）。はしの ずれは 絵の 中で
  if (rb.cv.width !== S) { rb.cv.width = rb.cv.height = S; rb.img = null; }
  if (!rb.img) rb.img = o.createImageData(S, S);
  o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, S, S); o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high';
  o.setTransform(P * kx * Math.cos(th), P * ky * Math.sin(th), -P * kx * Math.sin(th), P * ky * Math.cos(th), ox0, oy0);
  const pd = rb.pad, fn = rb.fill.width;
  o.drawImage(rb.soft, -rb.gx - pd, -rb.gy - pd, fn + 2 * pd, fn + 2 * pd);   // ぼかした 形（こさ 0.5 が つぶの ふち・0.16 が ふちどりの 外がわ）
  o.setTransform(1, 0, 0, 1, 0, 0);
  const fd = o.getImageData(0, 0, S, S).data, img = rb.img, d = img.data, c = Math.cos(th), s = Math.sin(th), A = rb.a, Bb = rb.b, Cc = rb.a * 0.88;
  const [lx0, ly0, lz0] = RICE_LIGHT, [hx, hy, hz] = RICE_HALF;
  const kk = Math.min(Math.abs(kx), Math.abs(ky)) || 1, w1 = Math.min(0.6, 0.4 / (P * kk)), w2 = Math.min(0.3, 0.24 / (P * kk));   // 1ピクセルで こさが どれだけ かわるか（ふちを 1ピクセルで ぼかす）。小さく 描く ときも 形の 外（こさ 0）は とうめいの まま（上限が ないと まわりに うすい 四角が 出た。Codex の 指摘）
  const nDirt = rb.spots ? Math.round(Math.min(1, dirt) * rb.spots.length) : 0, dc = (dirtCol || '150,120,80').split(',').map(Number);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const k = (j * S + i) * 4, f = fd[k + 3] / 255;
    if (!f) { d[k + 3] = 0; continue; }
    const ao = Math.min(1, Math.max(0, (f - 0.16) / w2 + 0.5));
    if (ao <= 0) { d[k + 3] = 0; continue; }
    const ab = Math.min(1, Math.max(0, (f - 0.5) / w1 + 0.5));
    let r = 26, g = 26, bl = 26;
    if (ab > 0) {
      const ux = (i + 0.5 - ox0) / (P * kx), uy = (j + 0.5 - oy0) / (P * ky), px = c * ux + s * uy, py = -s * ux + c * uy;   // 画面の点 → つぶの中の位置
      const ex = px / A, ey = py / Bb, ez = Math.sqrt(Math.max(0, 1 - ex * ex - ey * ey));
      let nx = ex / A, ny = ey / Bb, nz = ez / Cc;   // たまごの面の向き
      const qx = rb.gx + px - rb.nx, qy = rb.gy + py - rb.ny, qd = Math.sqrt(qx * qx + qy * qy), nb = Math.min(1, Math.max(0, rb.nr + 1.6 - qd));   // くぼみの内がわは 中へ向く（さかいは なめらかに まぜる）
      if (nb > 0) { const n0 = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx = nx / n0 * (1 - nb) - qx / (qd || 1) * 0.8 * nb; ny = ny / n0 * (1 - nb) - qy / (qd || 1) * 0.8 * nb; nz = nz / n0 * (1 - nb) + 0.6 * nb; }
      let wx = (c * nx - s * ny) * mx, wy = (s * nx + c * ny) * my;   // 面の向きを 画面の向きに
      const nn = Math.sqrt(wx * wx + wy * wy + nz * nz); wx /= nn; wy /= nn; const wz = nz / nn;
      const dif = Math.max(0, wx * lx0 + wy * ly0 + wz * lz0), s1 = Math.max(0, wx * hx + wy * hy + wz * hz), s4 = (s1 * s1) * (s1 * s1), s8 = s4 * s4, spec = s8 * s8 * s8 * s4;   // 28乗（かけ算で。Math.pow・Math.hypot は おそい）
      const v = 0.28 + 0.76 * dif, tf = Math.min(4, Math.max(0, (v - 0.34) / 0.16)), t0 = Math.min(3, Math.floor(tf)), tt = tf - t0;   // 影は 段でなく 連続に
      const T0 = RICE_TONE[t0], T1 = RICE_TONE[t0 + 1], sh = Math.min(1, Math.max(0, (spec - 0.35) / 0.35));
      let cr = T0[0] + (T1[0] - T0[0]) * tt, cg = T0[1] + (T1[1] - T0[1]) * tt, cb = T0[2] + (T1[2] - T0[2]) * tt;
      {   // あいちのかおり：ふちは すきとおって 明るく（光が ぬける）、まん中は 白く にごる、縦すじは うっすら 暗く（大きく 描く ときだけ。小さいと ざらつく）
        const rim = (1 - ez) * (1 - ez) * (1 - ez) * 0.35 * (1 - nb), core = ez * ez * 0.14 * (1 - nb), st = P >= 2.5 ? riceStreak(ex, ey) * 0.055 * (1 - nb) : 0;
        cr += (RICE_MILK[0] - cr) * rim + (RICE_CORE[0] - cr) * core; cg += (RICE_MILK[1] - cg) * rim + (RICE_CORE[1] - cg) * core; cb += (RICE_MILK[2] - cb) * rim + (RICE_CORE[2] - cb) * core;
        cr *= 1 - st; cg *= 1 - st; cb *= 1 - st * 0.9;
      }
      cr += (255 - cr) * sh; cg += (255 - cg) * sh; cb += (255 - cb) * sh;   // てかり
      for (let m = 0; m < nDirt; m++) {   // よごれの しみ（つぶと いっしょに回る。光の当たり方で こさを かえる）
        const ddx = rb.gx + px - rb.spots[m][0] - 0.5, ddy = rb.gy + py - rb.spots[m][1] - 0.5, dm = Math.sqrt(ddx * ddx + ddy * ddy), al = Math.min(1, Math.max(0, (0.72 - dm) / (w1 * 2.5) + 0.5));
        if (al > 0) { const fm = 0.55 + 0.3 * dif; cr += (dc[0] * fm - cr) * al; cg += (dc[1] * fm - cg) * al; cb += (dc[2] * fm - cb) * al; }
      }
      const al = ab + ao * (1 - ab);   // つぶの 色を ふちどりの 上に かさねる
      r = (cr * ab + 26 * ao * (1 - ab)) / al; g = (cg * ab + 26 * ao * (1 - ab)) / al; bl = (cb * ab + 26 * ao * (1 - ab)) / al;
    }
    d[k] = r; d[k + 1] = g; d[k + 2] = bl; d[k + 3] = 255 * ao;
  }
  if (gb) {   // ゲームボーイの4色（絵が毎回かわるので、ここで色をかえる。ふちは ぼかさない）
    for (let k = 0; k < d.length; k += 4) {
      if (d[k + 3] < 128) { d[k + 3] = 0; continue; }
      const L = gbLum(d[k], d[k + 1], d[k + 2]), col = GB_RGB[L < 0.16 ? 3 : L > 0.8 ? 0 : L > 0.62 ? 1 : 2];
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
    }
  }
  o.putImageData(img, 0, 0);
  rb.last = { P, S, X0, Y0, X, Y, th, lowQ: riceLowQ };   // テスト用
  gbPause++;
  const sm = dst.imageSmoothingEnabled;
  try {
    if (k0 === 1) dst.drawImage(rb.cv, X0, Y0);   // 1点＝1ピクセルで そのまま（にじまない）
    else { dst.imageSmoothingEnabled = !gb; dst.drawImage(rb.cv, X0, Y0, S / k0, S / k0); }
  } finally { gbPause--; dst.imageSmoothingEnabled = sm; }
  if (cs > 0.12 && cp > 0.12 && mood) {   // 顔は 画面の細かさで描く（点の大きさで回すと 目が くずれる）。くるくるのときは、つぶの まわりを すべって見える
    dst.save(); dst.translate(gb ? Math.round(X) : X, gb ? Math.round(Y) : Y); dst.scale(sx, sy); dst.rotate(th);
    dst.translate((sn * rb.a * 0.7 + look) * u, sp * rb.b * 0.6 * u); dst.scale(Math.max(0.25, cs), Math.max(0.25, cp));   // look：きょろきょろ（顔を 少し よこへ）。たての ころころでは 顔が 上下へ すべる
    const fc = (rb.faces && rb.faces[mood]) || rb.face;
    if (gb) dst.drawImage(fc, -rb.gx * u, -rb.gy * u, fc.width * u, fc.height * u);
    else { dst.imageSmoothingEnabled = true; dst.drawImage(riceFaceHi(fc, Math.ceil(u)), -rb.gx * u, -rb.gy * u, fc.width * u, fc.height * u); }   // 点を 大きくしてから なめらかに 回す（目の 形は そのまま、ふちだけ なめらか）
    dst.restore();
  }
}
const RICE_PMAX = 6;
let riceLowQ = false;   // うすい のこりかげは あらく 描いて のばす（重さを へらす。とても うすいので 見た目は かわらない）   // お米を 描く 細かさの 上限（絵の1点 = 6ピクセルまで）
const faceHi = new WeakMap();
function riceFaceHi(fc, q) {   // 顔の 絵を 点の まま q 倍に（なめらかに 回しても 目が ぼやけない）
  let m = faceHi.get(fc);
  if (!m) faceHi.set(fc, m = {});
  if (!m[q]) { const c = document.createElement('canvas'); c.width = fc.width * q; c.height = fc.height * q; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(fc, 0, 0, c.width, c.height); m[q] = c; }
  return m[q];
}
const riceFrame = () => riceSprites[facing][Math.floor(roll.d * 8) & 7];
// なめらかに転がる：止まっている お米の絵（にっこり）を、進んだ道のりだけ その場で回す（右・下へは時計まわり、左・上へは反時計まわり）。
// 止まると、起き上がりこぼしのように ゆらゆらして、立って こっちを見る
const RICE_R = 0.42;   // 回る半径（マス）。1マス進むと 約136度まわる
// 転がり方のバリエーション（korostyle.js。200 ＝ うごき20 × かざり10）：koro いまの転がり方（ふつうは null）・KP その うごきの数（書いていないものは ふつう）。毎こま はじめに読む
let koro = null, KP = {};
// クセになる転がり方：たて長のつぶは、寝ころぶと まん中が下がり、立つと上がる（コロン、コロンと でこぼこ転がる）。寝ころぶたびに「コトン」と小さな音。
// かべに当たると ぺたっと つぶれて ぷるんと もどり、画面が少しゆれる。速いと うしろに土ぼこり
// 足もとの地面で 転がり方が変わる：道は するする（よく転がる・コトンが はっきり）、草や田んぼは もさもさ（止まりやすい・緑の葉っぱが とぶ）、
// 砂浜は ずぶずぶ（すぐ止まる・音が こもる・砂けむり）、水を張った田んぼは ぱしゃぱしゃ（しぶき）
const GROUND = {
  road: { drag: 0.72, crr: 1, dust: '205,200,190', dv: 2.6, snd: 1, hz: 900 },   // crr：ころがり抵抗（道を1）・hz：転がる音の高さ
  dirt: { drag: 1, crr: 1.6, dust: '235,228,205', dv: 2.2, snd: 0.9, hz: 650 },
  grass: { drag: 1.35, crr: 2.6, dust: '104,178,72', dv: 1.4, snd: 0.55, bit: true, hz: 2600 },
  mud: { drag: 1.6, crr: 3.2, dust: '138,106,68', dv: 1.2, snd: 0.5, bit: true, hz: 420 },
  water: { drag: 1.7, crr: 3.5, dust: '160,205,232', dv: 0.9, snd: 0.4, bit: true, splash: true, hz: 1500 },
  sand: { drag: 1.9, crr: 4.5, dust: '231,207,140', dv: 0.9, snd: 0.3, big: true, hz: 380 },
};
// いまの天気（weather.js。気象庁）：雨の日は 地面が ぬれて すべる（はなしても 長く転がる・土ぼこりの代わりに 水しぶき）、雪の日は もっと すべる（雪が はねる・音が こもる）
const wxKind = () => { const w = window.NISHIO_WEATHER && window.NISHIO_WEATHER.current; return (w && w.kind) || ''; };
// 季節の葉：紅葉のころは 草の上で 赤・だいだい・黄色の 落ち葉が、桜のころは 花びらが はねる（ふだんは 草の色）
const LEAF_BITS = { koyo: ['200,100,30', '176,58,36', '201,154,30', '216,138,58'], sakura: ['246,168,192', '251,208,221', '255,236,242'] };
const groundBit = g => (g === GROUND.grass && (KOYO || SAKURA) ? (KOYO ? LEAF_BITS.koyo : LEAF_BITS.sakura)[(Math.random() * (KOYO ? 4 : 3)) | 0] : g.dust);
const WX_ROLL = { rain: { crr: 0.7, lin: 0.75, bit: '170,210,240', hz: 1.4 }, snow: { crr: 0.5, lin: 0.55, bit: '245,248,255', hz: 0.6 } };   // crr・lin：ころがり抵抗・速さに比べて へる分に かける数
// よごれ：砂・土の道・どろの田んぼを転がると、お米に 小さな しみ（地面の色）。草で 少しずつ・雨で だんだん・水に ぽちゃんで いっぺんに きれいになる
const DIRT_RATE = { sand: 0.22, dirt: 0.06, mud: 0.3, grass: -0.05, road: -0.01, water: -0.2 };
function groundAt(x, y) {
  const c = codeAt(Math.floor(x), Math.floor(y));
  if (c === C.R || c === C.H || c === C.L || c === C.T || c === C.Q || c === C.I) return GROUND.road;
  if (c === C.S) return GROUND.sand;
  if (c === C.F) return PADDY_TILE === 'flooded' ? GROUND.water : PADDY_TILE === 'soil' ? GROUND.mud : GROUND.grass;
  if (c === C.G || c === C.P || c === C.W || c === C.K || c === C.V || c === C.E || c === C.U || c === C.Y) return GROUND.grass;
  return GROUND.dirt;
}
// ころころコンボ（運営者の声「クセになる転がり方を研究」）：かべに 当たらずに 転がりつづけると、コトンの たびに 数が ふえ、音が ドレミソラ…と 1音ずつ 高く なる（転がるだけで メロディに。
// 当てるたびに 音が 上がっていく ゲームの 気持ちよさ）。3から お米の 右よこに「×12」（下に 小さく じぶんの ベスト）、5ごとに きらきら、10ごとに「🎵 ころころ ×20！」。当たる・止まると おしまい。じぶんの ベストを こえた その場で「🏅」。
// ポイントは つけない（同じ所を ぐるぐる しても もうからない。音と 数と ベストだけの 楽しみ）。ベストは この端末（nsg_combo_best）
const combo = { n: 0, quietT: 0, shown: 0, beat: false, beatN: 0, near: 0, best: (() => { try { return +localStorage.getItem('nsg_combo_best') || 0; } catch (e) { return 0; } })() };
const PENTA = [0, 2, 4, 7, 9];
function comboNote(n, v) {   // ドレミソラ（五音の 音階）を 下から。2オクターブ 上まで いったら そこで くり返す
  const a = sfxCtx();
  if (!a) return;
  try {
    const i = (n - 1) % 11, semi = PENTA[i % 5] + 12 * Math.floor(i / 5), t = a.currentTime, f = 523.25 * Math.pow(2, semi / 12);
    const o = a.createOscillator(), o2 = a.createOscillator(), g = a.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(f, t); o2.type = 'sine'; o2.frequency.setValueAtTime(f * 2, t);   // 木の 音に 少し 鈴の ひびき
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.045 * (0.6 + v * 0.4), t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); o2.connect(g); g.connect(a.destination); o.start(t); o2.start(t); o.stop(t + 0.2); o2.stop(t + 0.2);
  } catch (e) { /* 音が出せない端末 */ }
}
function comboStep() {
  combo.shown = performance.now();
  if (combo.n > mzRt.run.combo) mzRt.run.combo = combo.n;   // この ゴールまでの いちばん 長い コンボ
  if (!combo.beat && combo.best >= 5 && combo.n > combo.best) {   // 転がっている うちに ベストを こえた：その場で 知らせる（「あと 少しで ベスト」を 追いかける 楽しみ）
    combo.beat = true; combo.beatN = combo.n; chordSound(); floatText('🏅 ベスト こえたじゃん！');   // 数は すぐ 横の「×9」に 出て いるので 書かない（運営者の声「文字は 少なく」2026-10-29）。知らせは ゲームの 人たちと 同じ 三河弁（運営者の声「西尾らしく」）
    const now = performance.now(), cols = ['#ff9fd0', '#ffe066', '#ffffff'];
    for (let i = 0; i < 24; i++) { const t = Math.random() * Math.PI * 2, v = 2 + Math.random() * 3.5; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 3.5, c: cols[i % 3], life: 0.7 + Math.random() * 0.5 }); }
  }
  if (combo.n % 5 === 0) {   // 5ごとに きらきら。10ごとは 文字の かわりに 大きな きらきら（数は お米の よこの「×N」で 見えて いる。同じ ことを 2か所に 書かない。運営者の声「文字は 少なく」2026-10-28）
    const now = performance.now(), cols = ['#fff6c2', '#ffd23f', '#9be07a', '#7fd8f6'], big = combo.n % 10 === 0;
    if (big) combo.pop = now;   // テスト用（大きな きらきらの 時こく）
    for (let i = 0; i < (10 + Math.min(20, combo.n / 2)) * (big ? 2 : 1); i++) { const t = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3; mzFx.push({ t0: now, vx: Math.cos(t) * v * (big ? 1.4 : 1), vy: Math.sin(t) * v * (big ? 1.4 : 1) - 3, c: cols[i % 4], life: (0.6 + Math.random() * 0.4) * (big ? 1.3 : 1) }); }
  }
}
function comboEnd() {
  const n = combo.n, beat = combo.beat;
  combo.n = 0; combo.quietT = 0; combo.beat = false;
  if (n < 5) return;
  if (n > combo.best) {
    combo.best = n; combo.near = 0; try { localStorage.setItem('nsg_combo_best', String(n)); } catch (e) { /* noop */ }
    // 転がる うちに「ベスト こえたじゃん！」と 出した ×9 の まま おわった ときは、おわりの「あたらしい ベスト ×9」は 出さない（同じ 数を 2回 つづけて 出していた。自分で 遊んで 分かった）
    if (!beat || n > combo.beatN) floatText(beat ? `🏅 あたらしい ベスト ×${n}！ やったじゃん` : `🏅 ころころ ベスト ×${n}！ やったじゃん`);
  }
  else if (combo.best - n <= 2 && n > combo.near) { combo.near = n; floatText(`おしい！ あと${combo.best - n + 1}`); }   // 文字は みじかく、とても 近い（あと1〜3）ときだけ（運営者の声「文字は 少なく」：200秒で「おしい！ ベストまで あと4だったじゃん」が 5回 出た。自分で 遊んで 分かった 2026-10-29）。あと 少しで ベスト：もう 1回 やりたく なる（ベストに ならんだ ときも「あと1」）。同じ ベストには、前より 近づいた ときだけ（自分で 遊んで 分かった：めいろで 迷う 間、2分で 7回「あと4」が 出た）
  if (G.track) G.track('roll_combo', { n, best: combo.best });
}
// スピード線（運営者の声「スキルを繰り返す」3回目）：びゅんパネルで 加速しても 見た目が あまり かわらず、速さを 目で 感じにくかった。
// 1秒に 5マスより 速いと、進む 向きの うしろに 白い 線が ひゅんひゅん 流れる（速いほど 長く・こく）。点の 四角だけで 描く
const speedFx = { k: 0, at: 0, vx: 1, vy: 0 };   // k：線の こさ（速く なると すぐ こく、おそく なると 0.4秒で うすれる）
function drawSpeedLines(x, y, u, now) {
  const v = Math.hypot(rp.vx, rp.vy), dt = speedFx.at ? Math.min(0.1, (now - speedFx.at) / 1000) : 0, tgt = Math.max(0, Math.min(1, (v - 5) / 2));
  speedFx.at = now;
  speedFx.k = tgt >= speedFx.k ? tgt : Math.max(tgt, speedFx.k - dt * 2.5);
  if (v > 1) { speedFx.vx = rp.vx; speedFx.vy = rp.vy; }   // 向きは さいごに 動いていた 向き
  const k = speedFx.k;
  if (k < 0.05) return;
  const horiz = Math.abs(speedFx.vx) >= Math.abs(speedFx.vy), sg = Math.sign(horiz ? speedFx.vx : speedFx.vy) || 1, q = Math.max(1, Math.round(u)), f = Math.floor(now / 45);
  const al = 0.45 + 0.5 * k, w2 = 2 * q;   // 明るい 道でも 見えるよう、太めの 白に うすい かげ
  for (let i = 0; i < 6; i++) {
    const r1 = ((f + i * 7) * 2654435761 >>> 0) / 4294967296, r2 = ((f * 3 + i * 11) * 2246822519 >>> 0) / 4294967296;   // こまごとに かわる ばらつき
    const side = (r1 - 0.5) * 22 * u, back = (11 + r2 * 8) * u, len = Math.round((8 + r2 * 14) * u * (0.5 + k * 0.5));
    const X = horiz ? Math.round(x - sg * back - (sg > 0 ? len : 0)) : Math.round(x + side), Y = horiz ? Math.round(y + side) : Math.round(y - sg * back - (sg > 0 ? len : 0)), W = horiz ? len : w2, H = horiz ? w2 : len;
    ctx.fillStyle = `rgba(0,0,0,${(0.3 * al).toFixed(2)})`; ctx.fillRect(X + q, Y + q, W, H);
    ctx.fillStyle = `rgba(255,255,255,${al.toFixed(2)})`; ctx.fillRect(X, Y, W, H);
  }
}
function drawCombo(x, y, u, now) {   // お米の 右よこに「×12」（数が ふえるほど 大きく・色が かわる）
  if (combo.n < 3) return;
  // 字は はじめから 大きめ（11 → 16。運営者の声「大きい文字シンプルに」2026-10-27）
  const S = Math.round(Math.min(28, 16 + combo.n * 0.4) * u), pop = Math.max(0, 1 - (now - combo.shown) / 180), sz = Math.round(S * (1 + pop * 0.25));
  ctx.font = `bold ${sz}px "DotGothic16", sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, sz / 4); ctx.strokeStyle = '#1a1a1a'; ctx.fillStyle = combo.n >= 30 ? '#ff9fd0' : combo.n >= 20 ? '#7fd8f6' : combo.n >= 10 ? '#ffe066' : '#ffffff';
  const t = `×${combo.n}`;
  ctx.strokeText(t, x, y); ctx.fillText(t, x, y);
  if (combo.best >= 5) {   // その下に 小さく ベスト「🏅9」（こえたら「🏅」だけ。こえた ことは 浮かぶ 文字と 音で 分かるので 2か所に 書かない。運営者の声「文字は 少なく」2026-10-29）
    const s2 = Math.round(13 * u), y2 = y + sz * 0.5 + s2 * 0.8, t2 = combo.n > combo.best ? '🏅' : `🏅${combo.best}`;
    ctx.font = `bold ${s2}px "DotGothic16", sans-serif`; ctx.lineWidth = Math.max(2, s2 / 4); ctx.fillStyle = combo.n > combo.best ? '#ff9fd0' : '#d9e6d0';
    ctx.strokeText(t2, x, y2); ctx.fillText(t2, x, y2);
  }
}
function riceFeel(dt, speed) {
  if (combo.n) { combo.quietT = speed < 0.6 ? combo.quietT + dt : 0; if (combo.quietT > 0.7) comboEnd(); }   // 止まったら おしまい
  const g = roll.gnd = roll.last ? groundAt(roll.last.x, roll.last.y) : GROUND.dirt, wx = WX_ROLL[wxKind()];
  {   // よごれ（速く転がるほど つく）
    const key = Object.keys(GROUND).find(k => GROUND[k] === g) || 'dirt', r = DIRT_RATE[key] || 0;
    const add = r > 0 ? r * Math.min(1, speed / 4) : r;
    if (r > 0 && speed > 0.3) roll.dirtCol = g.dust;
    roll.dirt = Math.max(0, Math.min(1, roll.dirt + (r > 0 && speed <= 0.3 ? 0 : add) * dt - (wxKind() === 'rain' ? 0.08 * dt : 0)));
  }
  const ka = Math.floor((roll.ang + Math.PI / 2) / Math.PI), ks = Math.floor((roll.spin + Math.PI / 2) / Math.PI), kp = Math.floor((roll.pitch + Math.PI / 2) / Math.PI), k = ka + ',' + ks + ',' + kp;   // 寝ころんだ回数（くるくるは 横を向いた回数・たての ころころは 前に 寝た回数）
  if (k !== roll.side) {
    const n = ka + ks + kp; roll.side = k;
    if (speed > 0.6 && roll.h <= 0) {
      if (speed > 1.2 && rollOn && G.demo) { combo.n++; combo.quietT = 0; comboNote(combo.n, Math.min(1, speed / 5) * g.snd); comboStep(); }   // ころころコンボ：コトンが 1音ずつ 高く（音階に）
      else kotoSound(Math.min(1, speed / 5) * g.snd);
      roll.sq = Math.max(roll.sq, 0.06 * (KP.kotoSq || 1)); roll.sqx = false;
      const hopV = KP.hopV || HOP_V;
      if (speed > hopV && (KP.hopEvery === 1 || (n & 1))) { roll.hv = (2.2 + (speed - hopV) * 0.4) * (KP.hopPow || 1); roll.h = 0.001; roll.kind = 'hop'; }   // ぴょん：速いと、2回に1回 とびはねる（転がり方で かわる）
    }
  }
  if (roll.h > 0) {   // とんでいる：落ちてきて、ついたら ぺたっ
    roll.hv -= 22 * (KP.grav || 1) * dt; roll.h += roll.hv * dt;
    if (roll.h <= 0) {   // 強く落ちるほど ぺたっと つぶれて、画面も ゆれる
      const imp = Math.abs(roll.hv);
      roll.h = 0; roll.hv = 0; roll.sq = Math.min(0.3, 0.1 + imp * 0.03); roll.sqv = 0; roll.sqx = false;
      if (imp > 4) roll.shake = Math.min(1, (imp - 4) * 0.12);
      kotoSound(Math.min(1, 0.5 + imp / 10) * g.snd, imp > 5);
      for (let i = 0; i < 3; i++) roll.dust.push({ x: roll.last ? roll.last.x : 0, y: roll.last ? roll.last.y : 0, t: 0, s: 0.5 + Math.random() * 0.5, vx: (i - 1) * 0.9, c: groundBit(g), bit: g.bit && (KOYO || SAKURA) });
    }
  }
  if (KP.trip && speed > 2 && roll.h <= 0 && Math.random() < KP.trip * dt) { roll.hv = 1.8; roll.h = 0.001; roll.dizzyT = 0.8; kotoSound(0.6, true); }   // すってんころりん：つまずいて ころぶ
  koroTrail(dt, speed);
  roll.sqv += (-roll.sq * 260 - roll.sqv * 14) * dt; roll.sq += roll.sqv * dt;   // つぶれの ばね
  if (Math.abs(roll.sq) < 0.002 && Math.abs(roll.sqv) < 0.02) { roll.sq = 0; roll.sqv = 0; }
  roll.shake = Math.max(0, roll.shake - dt * 3);
  roll.ouchT = Math.max(0, roll.ouchT - dt); roll.happyT = Math.max(0, roll.happyT - dt); roll.dizzyT = Math.max(0, roll.dizzyT - dt);
  roll.wetT = Math.max(0, roll.wetT - dt); roll.jumpCd = Math.max(0, roll.jumpCd - dt); roll.sendT = Math.max(0, roll.sendT - dt);
  const glance = roll.kind === 'stop' && roll.idle > 2.5 && roll.idle < 12 ? [0, -1.5, 0, 1.5][Math.floor(roll.idle / 2.2) % 4] : 0;   // 止まって しばらくすると、きょろきょろ（右・左を見る）
  roll.look += (glance - roll.look) * Math.min(1, dt * 8);
  roll.dustT -= dt;
  if (speed > g.dv && roll.h <= 0 && roll.dustT <= 0) {   // 土ぼこり（地面の色。草・田んぼは葉っぱや どろ、水は しぶきが はねる）
    roll.dustT = g.big ? 0.04 : 0.06;
    roll.dust.push({ x: roll.last ? roll.last.x : 0, y: roll.last ? roll.last.y : 0, t: 0, s: (g.big ? 0.9 : 0.6) + Math.random() * 0.6, c: wx && !g.splash ? wx.bit : groundBit(g), bit: wx ? true : g.bit, vx: (Math.random() - 0.5) * 1.2 });   // 雨・雪の日は 水しぶき・雪
  }
  for (const p of roll.dust) p.t += dt;
  roll.dust = roll.dust.filter(p => p.t < 0.45);
}
let kotoCtx = null;
function boingSound(v, hi) {   // やわらかい 生け垣で はね返った：ぽよん（低い 音から 上がって、少し ふるえる）。hi：ばねの わざ（高く のびる びよーん。数は れんぱつの 何つめ か）
  try {
    if (localStorage.getItem('nsg_bgm') === 'false' || document.hidden) return;
    kotoCtx = kotoCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (kotoCtx.state === 'suspended') kotoCtx.resume();
    const t = kotoCtx.currentTime, o = kotoCtx.createOscillator(), w = kotoCtx.createOscillator(), wg = kotoCtx.createGain(), g = kotoCtx.createGain();
    const up = hi ? Math.pow(2, Math.min(6, hi - 1) * 2 / 12) : 1;   // れんぱつ：1つごとに 全音 上へ（6つで 止める）
    o.type = 'sine'; o.frequency.setValueAtTime(hi ? 240 * up : 170, t); o.frequency.exponentialRampToValueAtTime(hi ? 760 * up : 420, t + 0.16);
    w.frequency.setValueAtTime(18, t); wg.gain.setValueAtTime(25, t); w.connect(wg); wg.connect(o.frequency);   // ぷるぷる
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09 * (0.4 + v * 0.6), t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g); g.connect(kotoCtx.destination); o.start(t); w.start(t); o.stop(t + 0.26); w.stop(t + 0.26);
  } catch (e) { /* 音が出せない端末 */ }
}
function kotoSound(v, low) {   // 木の小さな「コトン」（音の設定がオフなら鳴らさない）
  try {
    if (localStorage.getItem('nsg_bgm') === 'false' || document.hidden) return;
    kotoCtx = kotoCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (kotoCtx.state === 'suspended') kotoCtx.resume();
    const t = kotoCtx.currentTime, o = kotoCtx.createOscillator(), g = kotoCtx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(low ? 170 : 620 + Math.random() * 120, t);
    o.frequency.exponentialRampToValueAtTime(low ? 90 : 330, t + 0.08);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime((low ? 0.16 : 0.05) * (0.5 + v / 2), t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + (low ? 0.16 : 0.09));
    o.connect(g); g.connect(kotoCtx.destination); o.start(t); o.stop(t + 0.2);
  } catch (e) { /* 音が出せない端末 */ }
}
// 転がり方のバリエーション（速さと向きで かわる）：
//   よちよち … ゆっくりのときは 転がらずに、左右に ゆれながら進む（起き上がりこぼしの まま）
//   ころころ … 横へは でんぐり返って転がる（いままでの転がり方）
//   くるくる … たて（上・下）へは、立ったまま こまのように回る（顔 → よこ → うしろ姿 → 顔）
//   ぴょん   … とても速いと、コトンの2回に1回 とびはねる（つくと ぺたっ）
const WADDLE_V = 1.1, HOP_V = 4.2;   // マス/秒
// 転がる音（ころころ…）：小さな ざらざらの音を ずっと流し、速さで大きく、地面で音の高さを かえる（道は かるく・草は さらさら・砂は こもる）。音の設定がオフ・画面が かくれているときは 鳴らさない
const rumble = { g: null, f: null };
function rumbleTick(v, g) {
  const ctxA = kotoCtx;
  if (!ctxA || ctxA.state !== 'running') return;   // コトンを鳴らしたあと（画面をさわったあと）から
  try {
    if (!rumble.g) {
      const buf = ctxA.createBuffer(1, ctxA.sampleRate, ctxA.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctxA.createBufferSource(); src.buffer = buf; src.loop = true;
      rumble.f = ctxA.createBiquadFilter(); rumble.f.type = 'bandpass'; rumble.f.Q.value = 1.2;
      rumble.g = ctxA.createGain(); rumble.g.gain.value = 0;
      src.connect(rumble.f); rumble.f.connect(rumble.g); rumble.g.connect(ctxA.destination); src.start();
    }
    let off = document.hidden; try { off = off || localStorage.getItem('nsg_bgm') === 'false'; } catch (e) { /* noop */ }
    const t = ctxA.currentTime, vol = off || v < 0.3 ? 0 : Math.min(1, (v - 0.3) / 5) * 0.035 * (0.5 + g.snd / 2);
    rumble.g.gain.setTargetAtTime(vol, t, 0.05);
    const wx = WX_ROLL[wxKind()];
    rumble.f.frequency.setTargetAtTime(g.hz * (wx ? wx.hz : 1) * (0.8 + Math.min(v, 6) / 15), t, 0.08);
  } catch (e) { /* 音が出せない端末 */ }
}
// 水に ぽちゃん・線路で ガタン の音（コトンと同じく Web Audio で作る。音の設定がオフなら鳴らさない）
function sfxCtx() {
  try {
    if (localStorage.getItem('nsg_bgm') === 'false' || document.hidden) return null;
    kotoCtx = kotoCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (kotoCtx.state === 'suspended') kotoCtx.resume();
    return kotoCtx;
  } catch (e) { return null; }
}
function grainSound() {   // ちりん：金の米つぶを ひろった（高い 2音）
  const a = sfxCtx();
  if (!a) return;
  try {
    const t = a.currentTime;
    for (const [f, d] of [[1320, 0], [1980, 0.07]]) {
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(f, t + d);
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.06, t + d + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.25);
      o.connect(g); g.connect(a.destination); o.start(t + d); o.stop(t + d + 0.3);
    }
  } catch (e) { /* 音が出せない端末 */ }
}
function padSound(chain = 1) {   // びゅん：下から 上へ すべる 音と、風の しゅっ、茶せんの しゃかしゃか。続けて のるほど 高く（れんさ 1つごとに 3半音。6れんさで 止める）
  const a = sfxCtx();
  if (!a) return;
  try {
    const t = a.currentTime, o = a.createOscillator(), g = a.createGain(), up = Math.pow(2, Math.min(5, chain - 1) * 3 / 12);
    o.type = 'triangle'; o.frequency.setValueAtTime(330 * up, t); o.frequency.exponentialRampToValueAtTime(1320 * up, t + 0.16);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.24);
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * 0.25), a.sampleRate), dd = buf.getChannelData(0);
    for (let i = 0; i < dd.length; i++) dd[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / dd.length);
    const n = a.createBufferSource(), f = a.createBiquadFilter(), ng = a.createGain();
    n.buffer = buf; f.type = 'bandpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.2); f.Q.value = 1.2; ng.gain.value = 0.05;
    n.connect(f); f.connect(ng); ng.connect(a.destination); n.start(t);
    for (let k = 0; k < 3; k++) {   // 抹茶びゅん（西尾らしく）：茶せんで 点てる「しゃかしゃか」。高い ざらざらを 3回、45ms おきに
      const tk = t + 0.12 + k * 0.045, wb = a.createBuffer(1, Math.floor(a.sampleRate * 0.03), a.sampleRate), wd = wb.getChannelData(0);
      for (let i = 0; i < wd.length; i++) wd[i] = (Math.random() * 2 - 1) * (1 - i / wd.length);
      const w = a.createBufferSource(), wf = a.createBiquadFilter(), wg = a.createGain();
      w.buffer = wb; wf.type = 'bandpass'; wf.frequency.value = 4800 + k * 400; wf.Q.value = 2; wg.gain.value = 0.035;
      w.connect(wf); wf.connect(wg); wg.connect(a.destination); w.start(tk);
    }
  } catch (e) { /* 音が出せない端末 */ }
}
function dotSound(i) {   // ぴっ：ごはんつぶを ひろう（列の 中で 1つずつ 高く。ドレミソラ）
  const a = sfxCtx();
  if (!a) return;
  try {
    const j = i % 10, f = 1046.5 * Math.pow(2, (PENTA[j % 5] + 12 * Math.floor(j / 5)) / 12), t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.018, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.08);
  } catch (e) { /* 音が出せない端末 */ }
}
function chordSound() {   // じゃーん：列を ぜんぶ ひろった（ドミソド を すこしずつ ずらして）
  const a = sfxCtx();
  if (!a) return;
  try {
    const t = a.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = a.createOscillator(), g = a.createGain(), d = i * 0.04;
      o.type = 'triangle'; o.frequency.setValueAtTime(f, t + d);
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.04, t + d + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.45);
      o.connect(g); g.connect(a.destination); o.start(t + d); o.stop(t + d + 0.5);
    });
  } catch (e) { /* noop */ }
}
function splashSound(v) {   // ぽちゃん：上がる「ぽ」と、しぶきの ざっ
  const a = sfxCtx();
  if (!a) return;
  try {
    const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(980, t + 0.09);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09 * (0.5 + v / 2), t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.16);
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * 0.3), a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const n = a.createBufferSource(), f = a.createBiquadFilter(), ng = a.createGain();
    n.buffer = buf; f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8; ng.gain.value = 0.07 * (0.5 + v / 2);
    n.connect(f); f.connect(ng); ng.connect(a.destination); n.start(t + 0.02);
  } catch (e) { /* noop */ }
}
function hedgeSound(v) {   // がさっ：めいろの 生け垣に 当たる（葉っぱの ざわっ と、やわらかい ぽすっ）
  const a = sfxCtx();
  if (!a) return;
  try {
    const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.08);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06 * (0.4 + v * 0.6), t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.12);
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * 0.22), a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) { const k = i / d.length; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, 2) * (k < 0.4 || (k > 0.5 && k < 0.7) ? 1 : 0.35); }   // ざわ、ざっ
    const n = a.createBufferSource(), f = a.createBiquadFilter(), ng = a.createGain();
    n.buffer = buf; f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 0.7; ng.gain.value = 0.06 * (0.4 + v * 0.6);
    n.connect(f); f.connect(ng); ng.connect(a.destination); n.start(t);
  } catch (e) { /* noop */ }
}
function clackSound(v) {   // ガタン ゴトン：線路の つぎめを 2回
  const a = sfxCtx();
  if (!a) return;
  try {
    for (const [dt, hz] of [[0, 210], [0.1, 160]]) {
      const t = a.currentTime + dt, o = a.createOscillator(), g = a.createGain();
      o.type = 'square'; o.frequency.setValueAtTime(hz, t); o.frequency.exponentialRampToValueAtTime(hz * 0.55, t + 0.06);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035 * (0.5 + v / 2), t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.08);
    }
  } catch (e) { /* noop */ }
}
// 話を とじたら、行き先への道（A*）の 少し先へ向けて 押す。お米の となりに しばらく 行き先を指す 矢印
function npcSendOff() {
  const s = npcSend; npcSend = null;
  const g = G.guide;
  if (!s || !g || rp.x === null) return;
  const p = toTile(g.lat, g.lng), sx = Math.floor(rp.x), sy = Math.floor(rp.y), gx = Math.floor(p.x), gy = Math.floor(p.y);
  const avoid = new Set((G.npcs || []).map(n => { const q = npcTile(n); return q.x + ',' + q.y; }));
  const path = sx === gx && sy === gy ? [] : planPath(sx, sy, gx, gy, BLOCK.has(codeAt(gx, gy)) ? 1 : 0, avoid);
  const aim = path.length ? path[Math.min(4, path.length - 1)] : [gx, gy];
  let dx = aim[0] + 0.5 - rp.x, dy = aim[1] + 0.5 - rp.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.2) return;
  dx /= d; dy /= d;
  rp.vx = dx * 3.4; rp.vy = dy * 3.4;   // ころん と押す
  roll.sendT = 4; roll.sends++; roll.happyT = 1.4;
  kotoSound(0.7);
  npcEmotes.set(s.n.id, { t: performance.now(), k: '♪' });   // 行き先は お米の まわりの 点の 矢印・下の 札・「つぎの ゴール」で 分かる ので、頭の 上の「→ 〇〇へ ころころ」の 文字は 出さない（運営者の声「文字は減らして」2026-10-29）
}
function drawSendArrow(hx, hcy, T, u) {   // お米の まわりに 行き先を指す 点の矢印（話で決まってから 4秒）
  if (roll.sendT <= 0 || !G.guide || !roll.last) return;
  const p = toTile(G.guide.lat, G.guide.lng), a = Math.atan2(p.y - roll.last.y, p.x - roll.last.x), r = T * 1.5, q = Math.max(1, Math.round(u * 1.6));
  const cx = hx + Math.cos(a) * r, cy = hcy + Math.sin(a) * r * 1.1;   // hcy：お米の まん中（たて長なので 上下は 少し遠く）
  ctx.save(); ctx.globalAlpha = Math.min(1, roll.sendT * 1.5); ctx.translate(Math.round(cx), Math.round(cy)); ctx.rotate(Math.round(a / (Math.PI / 4)) * (Math.PI / 4));   // 8方向（点の絵が くずれないように）
  const rows = ['...o....', '...oo...', 'ooo#oo..', 'o####oo.', 'ooo#oo..', '...oo...', '...o....'];
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
    const ch = rows[j][i]; if (ch === '.') continue;
    ctx.fillStyle = ch === 'o' ? '#1a1a1a' : '#7ee0ff';
    ctx.fillRect((i - 4) * q, (j - 3) * q, q, q);
  }
  ctx.restore();
}
// かざり：転がった あとに のこる つぶ（さくら・ほし・にじ…）。1マスに rate こ。落ちる・のぼる・その場・はねる
function koroTrail(dt, speed) {
  const tr = koro && koro.trail;
  if (tr && speed > 0.6 && roll.last) {
    roll.fxAcc += Math.min(3, speed * dt) * tr.rate * 2.2;
    while (roll.fxAcc >= 1 && roll.fx.length < 70) {
      roll.fxAcc -= 1;
      const r = Math.random, c = tr.cycle ? tr.cols[roll.fxN++ % tr.cols.length] : tr.cols[Math.floor(r() * tr.cols.length)];
      const p = { x: roll.last.x + (r() - 0.5) * 0.4, y: roll.last.y + (r() - 0.5) * 0.25, t: 0, life: tr.life * (0.8 + r() * 0.4), c, ph: r() * 6.3, z: 0, vz: 0, vx: 0 };
      if (tr.move === 'fall') { p.z = 0.6 + r() * 0.4; p.vz = -0.35 - r() * 0.2; }
      else if (tr.move === 'up') { p.z = 0.3 + r() * 0.2; p.vz = 0.5 + r() * 0.4; }
      else if (tr.move === 'stay') p.z = tr.cycle ? 0.05 : 0.1 + r() * 0.5;
      else { p.z = 0.35; p.vz = 1.4 + r() * 0.6; p.vx = (r() - 0.5) * 1.6; }
      roll.fx.push(p);
    }
    if (roll.fxAcc > 1) roll.fxAcc = 1;
  }
  for (const p of roll.fx) {
    p.t += dt; p.x += p.vx * dt;
    if (tr && tr.move === 'bounce') { p.vz -= 6 * dt; p.z += p.vz * dt; if (p.z < 0) { p.z = 0; p.vz = -p.vz * 0.4; p.vx *= 0.6; } }
    else p.z = Math.max(0, p.z + p.vz * dt);
  }
  roll.fx = tr ? roll.fx.filter(p => p.t < p.life) : [];
}
function drawKoroTrail(ox, oy, T, u) {
  const tr = koro && koro.trail;
  if (!tr || !roll.fx.length) return;
  const q = Math.max(1, Math.round(u * 1.5)), rows = tr.g, gw = rows[0].length, gh = rows.length;   // 絵の点の 1.5ばいで 描く（小さすぎて 見えないので）
  for (const p of roll.fx) {
    const a = Math.min(1, (p.life - p.t) / (p.life * 0.35));
    const sway = tr.move === 'fall' ? Math.sin(p.t * 4 + p.ph) * 0.12 : tr.move === 'up' ? Math.sin(p.t * 5 + p.ph) * 0.06 : 0;
    const X = Math.round(ox + (p.x + sway) * T - gw * q / 2), Y = Math.round(oy + p.y * T + T * 0.3 - p.z * T - gh * q / 2);
    if (tr.name === 'きらきら' && Math.floor(p.t * 10 + p.ph) % 2) continue;   // ちかちか
    ctx.globalAlpha = Math.max(0, a);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const ch = rows[j][i];
      if (ch === '.') continue;
      ctx.fillStyle = ch === '#' ? p.c : ch === 'o' ? (tr.dark || p.c) : '#ffffff';
      ctx.fillRect(X + i * q, Y + j * q, q, q);
    }
  }
  ctx.globalAlpha = 1;
}
function riceSpin(dx, dy, dt) {
  const d = Math.hypot(dx, dy), v = d / Math.max(dt, 1e-3);
  riceFeel(dt, v);
  roll.v += ((d < 3 ? v : 0) - roll.v) * Math.min(1, dt * 8);   // 表情のための速さ（ならす）
  rumbleTick(roll.v, roll.gnd || GROUND.dirt);
  if (roll.kind === 'stop') { roll.idle += dt; if (roll.peak > 2.5) roll.happyT = 1.6; roll.peak = 0; }   // 速く転がって止まったら うれしい
  else { roll.idle = 0; roll.peak = Math.max(roll.peak, roll.v); }
  if (roll.kind === 'spin') { roll.spinT += dt; if (roll.spinT > 1.2) roll.dizzyT = 1; } else roll.spinT = Math.max(0, roll.spinT - dt * 2);   // くるくるが続くと 目が回る
  const moving = d > 0.002 && d < 3 && v > 0.15, up = Math.round(roll.ang / (Math.PI * 2)) * Math.PI * 2, R2 = RICE_R * (KP.radius || 1);   // R2：回る半径（転がり方で かわる）
  let target = up;
  if (moving && v >= (KP.waddleV || WADDLE_V)) {
    const vert = roll.vert = KP.spinAlways || (roll.vert ? Math.abs(dy) > Math.abs(dx) * 0.75 : Math.abs(dy) > Math.abs(dx) * 1.35);   // ななめで よこ・たての 回りが 入れかわりつづけないように
    if (!vert) {   // ころころ
      const sg = Math.sign(dx), wt = sg * d / R2 / Math.max(dt, 1e-3);   // すべらずに転がるときの 回る速さ
      const slip = wt - roll.av;   // 回りの いきおいは すぐには かわらない：はね返ったあとは 少しのあいだ 前の向きに回りつづけて、地面で こすれて合っていく（ズザッと 土ぼこり）。とんでいる間は そのまま回る
      if (roll.h <= 0) roll.av += slip * Math.min(1, dt * 9);
      roll.ang += roll.av * dt;
      if (Math.abs(slip) > 8 && roll.h <= 0 && Math.random() < dt * 40) roll.dust.push({ x: roll.last ? roll.last.x : 0, y: roll.last ? roll.last.y : 0, t: 0, s: 0.7 + Math.random() * 0.5, vx: -Math.sign(roll.av) * 0.8, c: (roll.gnd || GROUND.dirt).dust });
      if (roll.h <= 0) roll.kind = 'tumble';
      if (KP.spinMix) roll.spin += d / R2 * 0.5;   // ねじねじ：ころころしながら ひねる
      else settleSpin(dt);
      settlePitch(dt);
      return;
    }
    if (!KP.spinAlways) {   // たてに ころころ：前（下）・うしろ（上）へ でんぐりがえし。顔が 下（上）へ まわって かくれ、せなかが 見えて、また 顔が 出る（前は こまのように 横を 向いて 回っていた）
      const wt = Math.sign(dy) * d / R2 / Math.max(dt, 1e-3), slip = wt - roll.pv;   // すべらずに 転がるときの 回る速さ（よこの ころころと 同じ）
      if (roll.h <= 0) roll.pv += slip * Math.min(1, dt * 9);   // 回りの いきおいは すぐには かわらない。とんでいる間は そのまま回る
      roll.pitch += roll.pv * dt;
      if (Math.abs(slip) > 8 && roll.h <= 0 && Math.random() < dt * 40) roll.dust.push({ x: roll.last ? roll.last.x : 0, y: roll.last ? roll.last.y : 0, t: 0, s: 0.7 + Math.random() * 0.5, vx: 0, c: (roll.gnd || GROUND.dirt).dust });
      if (roll.h <= 0) roll.kind = 'tumble';
      settleSpin(dt);
    } else {   // 転がり方「くるくる」：どの向きでも こまのように 回る（下へは右まわり・上へは左まわりに見える）
      settlePitch(dt);
      if (roll.h <= 0) roll.kind = 'spin';
      const wt = (Math.sign(dy) || Math.sign(dx)) * d / R2 * 0.9 / Math.max(dt, 1e-3);
      if (roll.h <= 0) roll.sv += (wt - roll.sv) * Math.min(1, dt * 14);   // くるくるも 回りの いきおいが残る
      roll.spin += roll.sv * dt;
    }
  } else {
    settleSpin(dt); settlePitch(dt);
    if (moving) {   // よちよち
      if (roll.h <= 0) roll.kind = 'waddle';
      roll.wad += d * 11;
      target = up + Math.sin(roll.wad) * (KP.sway || 0.3);
    } else if (roll.h <= 0 && Math.abs(roll.av) < 0.05 && Math.abs(roll.pv) < 0.05) roll.kind = 'stop';
  }
  roll.av += (target - roll.ang) * 70 * dt;   // いちばん近い「立った」向き（よちよちは ゆれる向き）へ、ばねで もどる
  roll.av *= Math.pow(0.86, dt * 60);
  roll.ang += roll.av * dt;
  if (!moving && Math.abs(up - roll.ang) < 0.002 && Math.abs(roll.av) < 0.01) { roll.ang = up; roll.av = 0; }
}
function settlePitch(dt) {   // たての ころころを やめたら、起きあがって こっちを向く（よこの ころころと 同じ ばね）
  const front = Math.round(roll.pitch / (Math.PI * 2)) * Math.PI * 2;
  roll.pv += (front - roll.pitch) * 70 * dt; roll.pv *= Math.pow(0.86, dt * 60);
  roll.pitch += roll.pv * dt;
  if (Math.abs(front - roll.pitch) < 0.002 && Math.abs(roll.pv) < 0.01) { roll.pitch = front; roll.pv = 0; }
}
function settleSpin(dt) {   // くるくるを やめたら、こっちを向いて止まる
  const front = Math.round(roll.spin / (Math.PI * 2)) * Math.PI * 2;
  roll.sv += (front - roll.spin) * 40 * dt; roll.sv *= Math.pow(0.84, dt * 60);
  roll.spin += roll.sv * dt;
  if (Math.abs(front - roll.spin) < 0.002 && Math.abs(roll.sv) < 0.01) { roll.spin = front; roll.sv = 0; }
}
function setHeroMarker() {
  const sheet = document.createElement('canvas');
  sheet.width = 64; sheet.height = 32;
  const x = sheet.getContext('2d');
  x.imageSmoothingEnabled = false;
  if (riceBall.cv) [-0.14, 0.14].forEach((th, i) => drawRiceBall(i * 32 + 16, 17.5, 1, th, 1, 1, 0, x, false));   // ふつうの地図の主人公も お米（丸く見える描き方で、左右に ゆらゆら）
  else (riceSprites.ready ? [riceSprites.right[0], riceSprites.right[1]] : heroSprites.down).forEach((c, i) => x.drawImage(c, i * 32, 0, 32, 32));
  const st = heroMarkerStyle;
  st.textContent = `.me,.me.demo{width:32px;height:32px;border:0;border-radius:0;box-shadow:none;background:url(${sheet.toDataURL()}) 0 0/64px 32px no-repeat;image-rendering:pixelated;animation:heroStep .9s steps(1) infinite;filter:drop-shadow(0 2px 1px rgba(0,0,0,.45))}
@keyframes heroStep{0%{background-position:0 0}50%{background-position:-32px 0}}
@media (prefers-reduced-motion:reduce){.me{animation:none}}`;
  document.head.appendChild(st);
}
setHeroMarker();
// 歩く地図の人（主人公と西尾の人たち）を、Blender で作った 16×16 の絵（tools/blender/people.py → nishio-go/art/people.png）に。
// 並びは NPC_COLORS の順に2コマずつ、そのあと主人公の 下・上・横 を2コマずつ（左は横を反転）。読めるまでは上の手描きの絵
(() => {
  const img = new Image();
  img.onload = () => {
    const cut = (i, flip) => {
      const c = document.createElement('canvas'); c.width = c.height = 16;
      const x = c.getContext('2d');
      if (flip) { x.translate(16, 0); x.scale(-1, 1); }
      x.drawImage(img, i * 16, 0, 16, 16, 0, 0, 16, 16);
      return c;
    };
    let i = 0;
    for (const k of Object.keys(NPC_COLORS)) { npcSprites[k] = [cut(i), cut(i + 1)]; i += 2; }
    for (const d of ['down', 'up', 'right']) { heroSprites[d] = [cut(i), cut(i + 1)]; i += 2; }
    heroSprites.left = [cut(i - 2, true), cut(i - 1, true)];
    setHeroMarker();
    dirty = true;
  };
  img.src = 'nishio-go/art/people.png';
})();
const spotSprites = {};
for (const [k, rows] of Object.entries({ ...ART, ...BUILDING_ART })) spotSprites[k] = [sprite(rows), sprite(rows, true)];
spotSprites.store = spotSprites.shop;
// 街並みの目印（お店・施設）の絵を、Blender で作った 32×32 の絵（tools/blender/poi.py → nishio-go/art/poi.png）に。読めるまでは上の手描きの絵
const POI_ORDER = ['townhall', 'hospital', 'school', 'library', 'police', 'fire', 'post', 'shop', 'konbini', 'super', 'home', 'drug', 'fuel', 'bank', 'food', 'cafe', 'station'];
(() => {
  const img = new Image();
  img.onload = () => {
    POI_ORDER.forEach((k, i) => {
      const mk = grey => {
        const c = document.createElement('canvas'); c.width = c.height = 32;
        const x = c.getContext('2d'); x.drawImage(img, i * 32, 0, 32, 32, 0, 0, 32, 32);
        if (grey) { const d = x.getImageData(0, 0, 32, 32); for (let j = 0; j < d.data.length; j += 4) { const v = (d.data[j] * 0.3 + d.data[j + 1] * 0.59 + d.data[j + 2] * 0.11) * 0.7 + 60; d.data[j] = d.data[j + 1] = d.data[j + 2] = v; } x.putImageData(d, 0, 0); }
        return c;
      };
      spotSprites[k] = [mk(false), mk(true)];
    });
    spotSprites.store = spotSprites.shop;
    dirty = true;
  };
  img.src = 'nishio-go/art/poi.png';
})();
// 名所の種類ごとの絵（公園4通り・史跡・展望・名所・アート・海岸・資料館と、注目スポットの型の 鳥居・お寺・城・町）を、
// Blender で作った 24×24 の絵（tools/blender/spots.py → nishio-go/art/spots.png）に。読めるまでは上の手描きの絵（ふつうの名所は たからばこ）
const SPOT_ORDER = ['park0', 'park1', 'park2', 'park3', 'historic', 'view', 'sight', 'art', 'beach', 'museum', 'torii', 'temple', 'castle', 'town'];
(() => {
  const img = new Image();
  img.onload = () => {
    SPOT_ORDER.forEach((k, i) => {
      const mk = grey => {   // grey：チェックインしたばかり（しばらく休み）の灰色の絵
        const c = document.createElement('canvas'); c.width = c.height = 24;
        const x = c.getContext('2d'); x.drawImage(img, i * 24, 0, 24, 24, 0, 0, 24, 24);
        if (grey) { const d = x.getImageData(0, 0, 24, 24); for (let j = 0; j < d.data.length; j += 4) { const v = (d.data[j] * 0.3 + d.data[j + 1] * 0.59 + d.data[j + 2] * 0.11) * 0.7 + 60; d.data[j] = d.data[j + 1] = d.data[j + 2] = v; } x.putImageData(d, 0, 0); }
        return c;
      };
      spotSprites[k] = [mk(false), mk(true)];
    });
    dirty = true;
  };
  img.src = 'nishio-go/art/spots.png';
})();
// 当店の2店舗は、本物の見た目に近づけた専用の絵（32×32。お店から受け取った外観の写真を見て描いたドット絵）
//   らいすぴあ・秀幸：赤と白の建物、横の壁に白いどんぶりと「米」のマーク、上に白い看板、右に赤い「米のドライブスルー」の屋根と「ドライブスルー IN」の看板
//   近藤米穀店（本店）：クリーム色の建物、壁に大きな赤い「米」、1階に「近藤米穀店」の看板とガラス戸・緑のひさし、左に「米のドライブスルー」の屋根
// 文字の並び（# のところを塗る）で小さな絵を描く
const pix = (r, rows, ox, oy, col) => rows.forEach((row, y) => [...row].forEach((ch, i) => { if (ch === '#') r(ox + i, oy + y, 1, 1, col); }));
function shopCanvas(draw, outline = false, size = 32) {   // size：絵の細かさ（32 か、名所の細かい絵は 48）
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d'), r = (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(px, py, w, h); };
  draw(r, (py, x0, x1, col) => r(x0, py, x1 - x0 + 1, 1, col));   // 2つめ：1行を x0〜x1 まで塗る
  if (outline) {   // 絵のまわりを黒くふちどる（すきとおった所のうち、上下左右に色がある所）
    const d = x.getImageData(0, 0, size, size), a = i => d.data[i * 4 + 3] > 0, edge = [];
    for (let i = 0; i < size * size; i++) {
      const px = i % size, py = (i - px) / size;
      if (!a(i) && ((px > 0 && a(i - 1)) || (px < size - 1 && a(i + 1)) || (py > 0 && a(i - size)) || (py < size - 1 && a(i + size)))) edge.push(i);
    }
    for (const i of edge) r(i % size, Math.floor(i / size), 1, 1, '#000');
  }
  const g = document.createElement('canvas');   // チェックインしたあと（しばらく）は灰色に
  g.width = g.height = size;
  const gx = g.getContext('2d'), d = x.getImageData(0, 0, size, size);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.round(0.3 * d.data[i] + 0.59 * d.data[i + 1] + 0.11 * d.data[i + 2]); d.data[i] = d.data[i + 1] = d.data[i + 2] = v; }
  gx.putImageData(d, 0, 0);
  return [c, g];
}
// 48×48 の名所の絵（写真から測った色で、日の当たる面と影の面を分けて描く）
const hiCanvas = draw => shopCanvas(draw, true, 48);
// 瓦屋根の帯：spans の行を上から塗り、上ほど明るく、2マスおきに瓦の筋、いちばん下は軒の影。軒先は1マス反り上げる
function tileRoof(r, h, y0, spans, [light, mid, dark, line]) {
  spans.forEach(([a, b], i) => {
    const last = i === spans.length - 1;
    h(y0 + i, a, b, last ? dark : i < spans.length / 3 ? light : mid);
    if (!last) { for (let x = a + 1 + (i % 2); x < b; x += 2) r(x, y0 + i, 1, 1, line); r(a + 1, y0 + i, 1, 1, light); r(b - 1, y0 + i, 1, 1, light); }   // 隅棟（屋根のかどの棟）は明るく
  });
  const [a, b] = spans[spans.length - 1];
  r(a, y0 + spans.length - 2, 1, 1, dark); r(b, y0 + spans.length - 2, 1, 1, dark);
}
spotSprites.ricepia = shopCanvas(r => {
  const K = '#000', RED = '#d7262e', W = '#ffffff', GR = '#9e9e9e';
  r(3, 8, 25, 23, K); r(4, 9, 23, 21, RED);                      // 赤い建物
  r(4, 21, 23, 2, W);                                             // 白い帯
  // 横の壁：白いどんぶりに山もりのごはん（ふちが波形）、ごはんに赤い「米」
  pix(r, ['..#.#.#..', '.#######.', '#########', '#########', '#########', '.........', '#########', '.#######.', '..#####..', '...###...'], 4, 10, W);
  pix(r, ['#.#.#', '.###.', '#####', '.###.', '#.#.#'], 6, 10, RED);
  // 正面：白い板と赤いしずく形、まん中の赤い帯
  for (const [px, py] of [[14, 10], [18, 10], [14, 23], [18, 23]]) { r(px, py, 3, py > 20 ? 7 : 10, W); r(px + 1, py + 3, 1, 2, RED); }
  // 入口のガラス戸（値段の貼り紙）
  r(21, 23, 6, 7, '#2f3438'); r(22, 24, 2, 3, '#f5f5f5'); r(25, 24, 1, 2, '#f5f5f5'); r(24, 23, 1, 7, '#cfd8dc');
  // 上の白い看板「らいすぴあ・秀幸」
  r(10, 3, 17, 6, K); r(11, 4, 15, 4, W);
  pix(r, ['#..##.#..#.#.##', '.#.#..##.#..#.#'], 11, 5, RED);   // 赤い字（らいすぴあ・秀幸）
  // 右の「米のドライブスルー」の屋根（赤に白い字）と柱
  r(20, 15, 12, 4, K); r(21, 16, 11, 2, RED);
  for (const px of [23, 25, 27, 29]) r(px, 16, 1, 2, W);
  r(30, 19, 1, 12, GR);
  // 「ドライブスルー IN」の看板（白地に青い字、赤い矢印）
  r(26, 24, 6, 6, K); r(27, 25, 4, 4, W); r(27, 25, 4, 1, '#1f5fbf'); r(27, 27, 4, 1, RED); r(27, 26, 1, 3, RED);
  // 黄色いのぼり
  r(19, 20, 1, 11, '#2e7d32'); r(18, 21, 1, 6, '#f2d230');
});
spotSprites.kondo = shopCanvas(r => {
  const K = '#000', CR = '#ebdfb6', CRD = '#cdbf93', RED = '#d0342c', GR = '#8f8f8f';
  // クリーム色の建物（左の高い所と、右の少し低い所）
  r(8, 3, 15, 28, K); r(9, 4, 13, 27, CR);
  r(21, 8, 11, 23, K); r(22, 9, 9, 22, CR); r(22, 9, 9, 1, CRD);
  // 大きな赤い「米」（筆で書いた太い字）
  pix(r, ['.....##....', '.##..##..##', '..##.##.##.', '...#.##.#..', '###########', '###########', '....####...', '...#.##.#..', '..##.##.##.', '.##..##..##', '##...##...#', '.....##....'], 10, 4, RED);
  r(12, 17, 6, 1, '#4a4a4a');                                       // 電話番号
  // 2階の窓
  r(24, 11, 5, 3, K); r(25, 12, 3, 1, '#b8d0e0');
  // 1階：「近藤米穀店」の看板とガラス戸、緑のひさし
  r(20, 19, 12, 4, K); r(21, 20, 11, 2, '#f3ead0');
  for (const px of [22, 24, 26, 28, 30]) r(px, 20, 1, 2, '#222');
  r(21, 23, 11, 8, '#9fb4c4'); for (const px of [24, 27, 30]) r(px, 23, 1, 8, '#5d6b75');
  r(13, 20, 8, 2, '#2e7d32'); r(14, 22, 6, 9, '#6d7b84');
  // 左の「米のドライブスルー」（白地に青い字の看板・赤い帯、灰色の屋根と柱）
  r(0, 9, 10, 5, K); r(1, 10, 8, 2, '#ffffff'); for (const px of [2, 4, 6]) r(px, 10, 1, 2, '#1f5fbf'); r(1, 12, 8, 1, RED);
  r(0, 14, 10, 2, GR);
  r(1, 16, 1, 15, GR); r(8, 16, 1, 15, GR);
});
// 名所の専用の絵（32×32、代表的な名所は 48×48 の hiCanvas）。Wikimedia Commons の、自由に使える写真（docs/landmark-photos.md）を見て描いたドット絵
const LANDMARK_ART = {
  'f-nishio-castle': 'nishioCastle', 'f-iwase-bunko': 'iwaseBunko', 'f-konoe-tei': 'konoeTei', 'f-konrenji': 'konrenji', 'f-kira-yoshida': 'kiraYoshida',
  'f-ohirune-house': 'ohirune', 'f-kamome-parking': 'kamome', 'f-isshiki-sakana': 'sakanaHiroba', 'f-kurokabe': 'kurokabe', 'f-inariyama-chaen': 'chaen',
  'f-nishio-station': 'nishioStation', 'f-nishio-cityhall': 'cityhall', 'f-shokoso': 'shokoso', 'f-ibun-jinja': 'ibunJinja', 'f-wakuwaku': 'wakuwaku',
  'f-glass-museum': 'glassMuseum', 'f-michinoeki-okanoyama': 'michinoeki', 'f-isshiki-suwa': 'isshikiSuwa', 'f-isshiki-port': 'isshikiPort', 'f-aichi-kodomo': 'kodomoTrain',
  'f-tojo-jo': 'tojoJo', 'f-myozenji': 'myozenji', 'f-shio-no-sato': 'shioNoSato', 'f-kira-waikiki': 'waikiki', 'f-okazaki-castle': 'okazakiCastle',
  'f-okazaki-kakukyu': 'misoBarrel', 'f-anjo-denpark': 'denpark', 'f-hekinan-aquarium': 'hekinanAquarium', 'f-takahama-kawara-museum': 'kawaraMuseum',
  'f-jissoji': 'jissoji', 'f-kumaku-jinja': 'kumakuJinja', 'f-choenji': 'choenji', 'f-yojuji': 'yojuji', 'f-kojuin': 'kojuin', 'f-isshiki-manabi': 'isshikiManabi',
  'f-sakushima-nishi': 'sakushimaPort', 'f-sakushima-higashi': 'sakushimaPort', 'f-oura-beach': 'ouraBeach', 'f-kogane-zutsumi': 'koganeZutsumi', 'f-ozaki-shiro': 'ozakiShiro',
  'f-hazu-jinja': 'hazuJinja', 'f-nishi-hazu': 'nishiHazu', 'f-higashi-hazu': 'higashiHazu', 'f-toba-shinmei': 'tobaShinmei', 'f-jofukuji': 'daibutsu', 'f-kasuya-tei': 'kasuyaTei', 'f-yatsuomote': 'yatsuomote',  'f-kozenji': 'kozenji', 'f-terazu-hachiman': 'terazuHachiman', 'f-hirabara-taki': 'hirabaraTaki', 'f-ankyuji': 'ankyuji', 'f-suunji': 'suunji',
  'f-yatsurugi': 'yatsurugi', 'f-kezoji': 'kezoji', 'f-gentokuji': 'gentokuji', 'f-shohoji-kofun': 'shohojiKofun', 'f-kira-onsen': 'kiraOnsen',
  'f-terabe-jo': 'terabeJo', 'f-kodomonokuni-st': 'kodomonokuniSt', 'f-antaiji': 'antaiji', 'f-fukusenji': 'fukusenji', 'f-genkuin': 'genkuin',
  'f-kaminagara-shinmei': 'kaminagaraShinmei', 'f-shozanji': 'shozanji', 'f-sairinji': 'sairinji', 'f-tenjiku-jinja': 'tenjikuJinja', 'f-semon-jinja': 'semonJinja',
  'f-kagakuji': 'kagakuji', 'f-ennyuji': 'ennyuji', 'f-shorakuji': 'shorakuji', 'f-okazaki-daijuji': 'okazakiDaijuji', 'f-okazaki-maruya': 'okazakiMaruya',
  'f-okazaki-iga-hachimangu': 'okazakiIgaHachimangu', 'f-okazaki-takisanji': 'okazakiTakisanji', 'f-okazaki-iwazu-tenmangu': 'okazakiIwazuTenmangu', 'f-okazaki-rokusho-jinja': 'okazakiRokushoJinja', 'f-okazaki-okudono-jinya': 'okazakiOkudonoJinya',
  'f-okazaki-higashi-park': 'okazakiHigashiPark', 'f-okazaki-honda-tei': 'okazakiHondaTei', 'f-okazaki-minami-park': 'okazakiMinamiPark', 'f-okazaki-museum': 'okazakiMuseum', 'f-okazaki-higashi-okazaki-sta': 'okazakiHigashiOkazakiSta',
  'f-okazaki-okazaki-sta': 'okazakiOkazakiSta', 'f-okazaki-shooji': 'okazakiShooji', 'f-okazaki-hozoji': 'okazakiHozoji', 'f-okazaki-fujikawa-shuku': 'okazakiFujikawaShuku', 'f-okazaki-kuragari': 'okazakiKuragari',
  'f-okazaki-hongusan': 'okazakiHongusan', 'f-anjo-jozanen': 'anjoJozanen', 'f-anjo-honshoji': 'anjoHonshoji', 'f-anjo-castle': 'anjoCastle', 'f-anjo-museum': 'anjoMuseum',
  'f-anjo-horiuchi-park': 'anjoHoriuchiPark', 'f-anjo-park': 'anjoPark', 'f-anjo-futago-kofun': 'anjoFutagoKofun', 'f-anjo-himeogawa-kofun': 'anjoHimeogawaKofun', 'f-anjo-station': 'anjoStation',
  'f-anjo-mikawa-anjo-station': 'anjoMikawaAnjoStation', 'f-anjo-minami-anjo-station': 'anjoMinamiAnjoStation', 'f-anjo-cityhall': 'anjoCityhall', 'f-hekinan-rinkai-park': 'hekinanRinkaiPark', 'f-hekinan-akashi-park': 'hekinanAkashiPark',
  'f-hekinan-shomyoji': 'hekinanShomyoji', 'f-hekinan-kaitokuji': 'hekinanKaitokuji', 'f-hekinan-kokonoe-mirin': 'hekinanKokonoeMirin', 'f-hekinan-fujii-museum': 'hekinanFujiiMuseum', 'f-hekinan-kumano': 'hekinanKumano',
  'f-hekinan-mugaen': 'hekinanMugaen', 'f-hekinan-oninji': 'hekinanOninji', 'f-hekinan-station': 'hekinanStation', 'f-hekinan-chuo-station': 'hekinanChuoStation', 'f-hekinan-cityhall': 'hekinanCityhall',
  'f-takahama-minato-station': 'takahamaMinatoStation', 'f-takahama-kasuga': 'takahamaKasuga', 'f-takahama-oyama': 'takahamaOyama', 'f-takahama-mikawa-takahama-station': 'takahamaMikawaTakahamaStation', 'f-takahama-yoshihama-station': 'takahamaYoshihamaStation',
  'f-takahama-cityhall': 'takahamaCityhall', 'f-kota-honkoji': 'kotaHonkoji', 'f-kota-kyodo-shiryokan': 'kotaKyodoShiryokan', 'f-kota-bunka-hiroba': 'kotaBunkaHiroba', 'f-kota-michinoeki': 'kotaMichinoeki',
  'f-kota-hishiike': 'kotaHishiike', 'f-kota-happiness-hill': 'kotaHappinessHill', 'f-kota-townhall': 'kotaTownhall', 'f-kota-station': 'kotaStation', 'f-kota-sangane-station': 'kotaSanganeStation',
  'f-kota-aimi-station': 'kotaAimiStation', 'f-gamagori-takeshima': 'gamagoriTakeshima', 'f-gamagori-aquarium': 'gamagoriAquarium', 'f-gamagori-station': 'gamagoriStation',  // OpenStreetMap の名所（手描き）
  n282405440: 'osmN282405440', n282405435: 'osmN282405435', n1423997078: 'osmN1423997078', n1423992783: 'osmN1423992783', n1423990918: 'osmN1423990918', n1423979758: 'osmN1423979758',
  n1423994228: 'osmN1423994228', n1423997068: 'osmN1423997068', n1423979695: 'osmN1423979695', n1424004882: 'osmN1424004882', n3999572949: 'osmN3999572949',
  n2573765930: 'osmN2573765930', n2128311596: 'osmN2128311596', n3702950015: 'osmN3702950015', n3282065243: 'osmN3282065243', n4582252211: 'osmN4582252211',
  n4582212644: 'osmN4582212644', n4582212642: 'osmN4582212642', n4582212599: 'osmN4582212599', n4681388235: 'osmN4681388235', n4682981430: 'osmN4682981430', n4686350152: 'osmN4686350152',
  n5307157026: 'osmN5307157026', n5118172505: 'osmN5118172505', n6057440275: 'osmN6057440275', n7056162176: 'osmN7056162176', n6018637699: 'osmN6018637699', n7872569890: 'osmN7872569890',
  n8093413971: 'osmN8093413971', n8093413970: 'osmN8093413970', n7774774733: 'osmN7774774733', n8095207755: 'osmN8095207755', n8100814151: 'osmN8100814151', n8093884446: 'osmN8093884446',
  n8095081208: 'osmN8095081208', n8095081199: 'osmN8095081199', n8108665373: 'osmN8108665373', n8108665362: 'osmN8108665362', n8108665360: 'osmN8108665360', n8108665358: 'osmN8108665358',
  n8094952624: 'osmN8094952624', n8093453674: 'osmN8093453674', n8093499508: 'osmN8093499508', n8093499509: 'osmN8093499509', n8093413973: 'osmN8093413973', n8094984124: 'osmN8094984124',
  n11568982800: 'osmN11568982800', w464871669: 'osmW464871669', w446529374: 'osmW446529374', w465836402: 'osmW465836402',
  w465580298: 'osmW465580298', w469886506: 'osmW469886506', w498991062: 'osmW498991062', w498047607: 'osmW498047607', w497083985: 'osmW497083985', w616219752: 'osmW616219752',
  w863301938: 'osmW863301938', r8102292: 'osmR8102292', w1055866521: 'osmW1055866521', r8620217: 'osmR8620217', w945765385: 'osmW945765385',
  r3105117: 'osmR3105117', w909281705: 'osmW909281705', w1057193114: 'osmW1057193114', n3999572942: 'osmN3999572942', n3999573157: 'osmN3999573157',
  n5088818889: 'osmN5088818889', n1423949200: 'osmN1423949200', n5146201595: 'osmN5146201595',
  n1423987791: 'osmN1423987791', n1423994163: 'osmN1423994163', n1423994160: 'osmN1423994160', n1423989568: 'osmN1423989568', n5147537990: 'osmN5147537990',
  n1424003413: 'osmN1424003413', n5096943767: 'osmN5096943767', n5406014369: 'osmN5406014369', n6225098114: 'osmN6225098114',
  n6385749931: 'osmN6385749931', n8095206125: 'osmN8095206125', n8096770911: 'osmN8096770911', n8095176795: 'osmN8095176795',
  n7814234031: 'osmN7814234031', n8095177153: 'osmN8095177153', n8095191433: 'osmN8095191433', n8108665357: 'osmN8108665357', n8100472235: 'osmN8100472235', n8100472247: 'osmN8100472247',
  n8100472245: 'osmN8100472245', n8100472240: 'osmN8100472240', n8100472239: 'osmN8100472239', n8100472246: 'osmN8100472246', n8100472263: 'osmN8100472263',
  n8100472237: 'osmN8100472237', n8100472234: 'osmN8100472234', n8095098611: 'osmN8095098611',
  n7774774734: 'osmN7774774734', n7457793269: 'osmN7457793269', n9385135483: 'osmN9385135483',
  n8241963496: 'osmN8241963496', n8237565048: 'osmN8237565048', n8241972430: 'osmN8241972430', n8241891774: 'osmN8241891774', n8241775866: 'osmN8241775866', n8241775864: 'osmN8241775864',
  n8241886323: 'osmN8241886323', n8241880205: 'osmN8241880205', w500212839: 'osmW500212839',
  w625806226: 'osmW625806226', w675609772: 'osmW675609772', w627492620: 'osmW627492620', w521638240: 'osmW521638240', w687980267: 'osmW687980267', w736671941: 'osmW736671941',
  w737526485: 'osmW737526485', w670221425: 'osmW670221425', w848881120: 'osmW848881120',
};
const ROOF = '#4a4f57', ROOF_HI = '#6c737d', WALL = '#f3f1ea', WOOD = '#5b4632';
// 2回目に足した名所（同じく Wikimedia Commons の写真を参考に。docs/landmark-photos.md）
// spans の行を上から順に塗る（[x0, x1] の並び。col は色か、行の番号から色を返す関数）
const spanRows = (h, y0, spans, col) => spans.forEach(([a, b], i) => h(y0 + i, a, b, typeof col === 'function' ? col(i) : col));
// 3回目に足した名所（同じく Wikimedia Commons の写真を参考に。docs/landmark-photos.md）
const PINE = ['.#####.', '#######', '.#####.'];
// ---- 48×48 の名所の絵（写真から測った色で描きなおしたもの。上の 32×32 の絵を置きかえる） ----
// 西尾城（本丸丑寅櫓）：銀ねずの瓦屋根が三重、壁はこげ茶の下見板と白い漆喰、二重めの屋根に千鳥破風、てっぺんにしゃちほこ。石垣の上
spotSprites.nishioCastle = hiCanvas((r, h) => {
  const ROOFC = ['#d4ccd2', '#8e898d', '#5c5759', '#76717a'], W = '#2d2d2c', WT = '#3b3430', PL = '#e6e3da', PS = '#a9a698', LAT = '#6a5a48';
  const ST = '#8a8986', SL = '#a8a7a2', SD = '#5e5d5b';
  const win = (x, y, w, hh) => { r(x, y, w, hh, LAT); for (let i = x + 1; i < x + w; i += 2) r(i, y, 1, hh, '#3e3428'); };
  for (const [x, d] of [[15, -1], [31, 1]]) { r(x, 0, 2, 4, '#4a4a4e'); r(x + (d < 0 ? -1 : 2), 0, 1, 2, '#4a4a4e'); r(x + (d < 0 ? 1 : 0), 1, 1, 2, '#8a8a90'); }   // しゃちほこ（尾を外に反らせる）
  h(3, 15, 32, '#5c5759'); h(2, 17, 30, '#7a757a');
  tileRoof(r, h, 4, [[14, 33], [13, 34], [12, 35], [11, 36], [10, 37], [9, 38], [8, 39], [7, 40]], ROOFC);
  h(12, 9, 38, PL);
  r(12, 13, 24, 6, WT); h(13, 12, 35, PS); win(15, 14, 5, 4); win(28, 14, 5, 4);
  tileRoof(r, h, 19, [[9, 38], [8, 39], [7, 40], [6, 41], [5, 42], [4, 43], [3, 44]], ROOFC);
  for (let k = 0; k < 8; k++) { const y = 15 + k; h(y, 23 - k - 1, 24 + k + 1, '#9a959a'); if (k >= 2) h(y, 23 - k + 2, 24 + k - 2, PL); }   // 千鳥破風
  h(22, 15, 32, '#5c5759'); r(23, 17, 2, 2, '#7a7570');
  h(26, 5, 42, PL);
  r(6, 27, 36, 6, W); h(27, 6, 41, PS); for (const x of [9, 17, 26, 34]) win(x, 28, 5, 4);
  tileRoof(r, h, 33, [[4, 43], [3, 44], [2, 45], [1, 46], [0, 47]], ROOFC);
  h(38, 2, 45, PL); r(4, 39, 40, 3, W); h(39, 4, 43, PS);
  for (let y = 42; y < 48; y++) { const k = (y - 42) >> 1; h(y, 4 - k, 43 + k, (y - 42) % 2 ? ST : SL); }   // 石垣
  for (const y of [44, 46]) h(y, 2, 45, SD);
  for (let x = 7; x < 44; x += 6) { r(x, 42, 1, 2, SD); r(x + 3, 44, 1, 2, SD); r(x, 46, 1, 2, SD); }
});
// 西尾市岩瀬文庫：左に赤レンガの旧書庫（瓦の寄棟屋根・白いわくの窓）、うしろに古い瓦屋根の建物、右に白いコンクリートと縦長ガラスの今の建物
spotSprites.iwaseBunko = hiCanvas((r, h) => {
  const CON = '#c4c7c6', COL = '#d8d8d5', GL = '#5e6d7a', GLH = '#8fa4b4', BR = '#6e4a3e', BRH = '#82574a', BRM = '#563a32';
  r(18, 8, 30, 34, CON); h(8, 18, 47, COL); h(9, 18, 47, '#a9acab');
  r(24, 11, 22, 16, GL); for (let x = 24; x < 46; x += 3) { r(x, 11, 1, 16, COL); r(x + 1, 11, 2, 3, GLH); } for (let x = 30; x < 44; x += 6) r(x + 1, 16, 2, 9, '#9a6a4a');   // 縦長ガラス（中にレンガ色の格子）
  r(44, 9, 4, 18, COL); for (let y = 11; y < 27; y += 3) h(y, 44, 47, '#bdbdba');
  h(27, 18, 47, '#d0d3d2'); h(28, 18, 47, '#9fa2a1');
  r(18, 29, 30, 3, '#353637'); for (let x = 19; x < 47; x += 2) r(x, 29, 1, 3, '#4a4b4c');
  r(18, 32, 30, 10, '#626664'); for (const x of [18, 26, 34, 42]) r(x, 29, 3, 13, '#bcbfbd'); for (let x = 22; x < 46; x += 8) r(x, 33, 2, 8, '#8a9296');
  tileRoof(r, h, 9, [[7, 26], [6, 27], [5, 28]], ['#6a707c', '#585e6c', '#3e434c', '#4e535e']); r(6, 12, 22, 3, '#c8c8c4');   // うしろの古い建物
  tileRoof(r, h, 13, [[6, 18], [5, 19], [4, 20], [3, 21], [2, 22]], ['#6a707c', '#4e535e', '#33373e', '#444a54']);
  h(18, 3, 21, '#8a7a70'); r(3, 19, 19, 22, BR);
  for (let y = 20; y < 41; y += 2) { h(y, 3, 21, y % 4 ? BRH : BR); for (let x = 3 + (y % 4 ? 0 : 2); x < 22; x += 4) r(x, y, 1, 1, BRM); }
  for (const [x, y] of [[5, 21], [11, 21], [17, 21], [5, 28], [11, 28], [17, 28], [5, 34], [11, 34], [17, 34]]) { r(x, y, 3, 4, '#c8c0b0'); r(x, y + 1, 3, 3, '#211f23'); r(x + 1, y + 1, 1, 3, '#3a3840'); h(y + 4, x - 1, x + 3, '#b0a898'); }
  h(41, 3, 21, '#4e3a34');
  r(0, 42, 48, 6, '#8a8a88'); spanRows(h, 42, [[0, 16], [0, 12], [0, 8], [0, 5], [0, 3], [0, 1]], '#a89a60'); for (let x = 20; x < 48; x += 5) r(x, 44, 3, 1, '#a0a09c');
});
// 旧近衛邸：銀ねずの瓦、白い妻壁に格子の換気口がある大きな破風。右手前は茶色の破風板の玄関（格子の欄間・扁額）、左は赤い毛せんの縁側。白い砂利と飛び石
spotSprites.konoeTei = hiCanvas((r, h) => {
  const RL = '#c4c8cc', RM = '#a8acb2', RD = '#61656d', WD = '#6a5541', WDD = '#26231f', PL = '#e8e6de';
  for (let k = 0; k < 12; k++) { const y = 5 + k; h(y, 21 - k - 1, 22 + k + 1, RD); h(y, 21 - k, 22 + k, RM); if (k >= 3) h(y, 21 - k + 2, 22 + k - 2, '#e8ecee'); }   // 大きな破風
  r(17, 10, 10, 3, '#3a3a3a'); for (let x = 18; x < 27; x += 2) r(x, 10, 1, 3, '#7a7a7a'); h(16, 9, 34, WD); r(20, 3, 4, 2, '#8a8e94');
  tileRoof(r, h, 15, [[6, 26], [4, 26], [2, 26], [1, 26], [0, 26]], [RL, RM, RD, '#8c9096']);
  r(2, 20, 22, 11, '#3a3530'); for (let x = 2; x < 24; x += 4) { r(x, 20, 1, 11, WD); r(x + 1, 21, 2, 3, '#8a9aa4'); } h(20, 2, 23, WDD); h(24, 2, 23, WD);   // 縁側のガラス戸（中は暗い）
  h(31, 1, 24, '#7b554b'); h(32, 1, 24, '#5e3e36'); r(2, 33, 22, 3, '#3a3530'); for (const x of [3, 12, 21]) r(x, 33, 2, 3, WD);
  for (let k = 0; k < 12; k++) { const y = 11 + k; h(y, 34 - k - 1, 35 + k + 1, RD); h(y, 34 - k, 35 + k, WD); if (k >= 3) h(y, 34 - k + 2, 35 + k - 2, PL); }   // 玄関の破風
  r(34, 15, 2, 2, WD); r(30, 19, 1, 3, WD); r(39, 19, 1, 3, WD); r(32, 9, 6, 2, '#8a8e94');
  r(31, 21, 8, 2, '#3a2a1a'); for (const x of [33, 35, 37]) r(x, 21, 1, 1, '#d8c8a0');   // 扁額
  r(24, 23, 22, 5, WDD); for (let x = 25; x < 45; x += 2) r(x, 23, 1, 5, '#8a7050');   // 格子の欄間
  r(24, 23, 2, 19, WD); r(43, 23, 2, 19, WD); r(28, 29, 13, 13, '#141412'); for (let y = 37; y < 42; y += 2) h(y, 28, 40, '#9a9a96'); r(31, 31, 7, 4, '#4a4440');
  r(45, 23, 3, 19, PL); h(41, 22, 47, '#cac2b2');
  r(0, 42, 48, 6, '#e7e5d2'); for (const [x, y, w] of [[3, 44, 5], [11, 46, 4], [18, 44, 4], [26, 46, 4]]) { r(x, y, w, 2, '#8a7a6a'); h(y, x, x + w - 1, '#a89888'); }
  pix(r, ['..######..', '.########.', '##########', '##########'], 0, 38, '#3f7a34'); h(38, 3, 6, '#5a9a44');   // 丸くかりこんだ植えこみ
});
// 金蓮寺弥陀堂（国宝）：うす茶色の檜皮ぶきの高い寄棟屋根、上に赤茶の箱棟、深い軒。灰色に風化した木の柱と細かい格子、高い床
spotSprites.konrenji = hiCanvas((r, h) => {
  const WG = '#867e7a', LT = '#353332', LG = '#5a5654';
  r(18, 4, 12, 3, '#6d5657'); h(4, 18, 29, '#8a6e6e'); h(6, 17, 30, '#4a3a3a');   // 箱棟
  for (let y = 7; y < 22; y++) {
    const k = y - 7, a = Math.round(16 - k * 0.9), b = Math.round(31 + k * 0.9);
    h(y, a, b, y < 11 ? '#ccb5a4' : y < 17 ? '#bda592' : '#ab9888');
    for (let x = a + 1 + (y % 3); x < b; x += 3) r(x, y, 1, 1, y < 11 ? '#bba494' : '#a89282');
  }
  h(22, 1, 46, '#5a4a40'); h(23, 2, 45, '#312c29'); r(1, 21, 1, 1, '#5a4a40'); r(46, 21, 1, 1, '#5a4a40');   // 反った軒先
  r(4, 24, 40, 2, '#302722'); for (let x = 5; x < 43; x += 2) r(x, 25, 1, 1, '#6a5a4c');
  r(7, 26, 34, 13, LT); for (let y = 27; y < 39; y += 2) h(y, 7, 40, LG); for (let x = 8; x < 40; x += 2) r(x, 26, 1, 13, LG);
  r(21, 27, 6, 6, '#101010'); r(23, 29, 2, 3, '#3a3020');   // 中の暗がり（阿弥陀さま）
  for (const x of [7, 14, 20, 27, 33, 40]) r(x, 26, x === 20 || x === 27 ? 1 : 2, 13, WG); h(26, 7, 41, '#9a928e'); h(32, 7, 41, '#9a928e');
  h(39, 2, 45, '#aba29e'); h(40, 2, 45, '#6a625e'); r(3, 41, 42, 4, '#1f1d1c'); for (let x = 4; x < 45; x += 6) r(x, 41, 2, 4, WG);
  h(45, 1, 46, '#d7d4bc'); h(46, 1, 46, '#b8b49e'); r(20, 47, 8, 1, '#c8c4b4');
});
// 名鉄 西尾駅：ホームに止まった名鉄の赤い電車の正面（大きな窓と行き先表示、白い線、ライト）。左にホームの屋根と黄色い点字ブロック
spotSprites.nishioStation = hiCanvas((r, h) => {
  const RD = '#c42234', RH = '#d8404e', RS = '#8e1a28';
  r(0, 0, 16, 5, '#3a3b39'); h(5, 0, 15, '#222321'); r(3, 6, 2, 26, '#5a5b59');
  r(0, 30, 10, 18, '#a2a29f'); r(6, 30, 3, 18, '#d8b860'); for (let y = 31; y < 48; y += 2) r(7, y, 1, 1, '#b89840'); h(30, 0, 9, '#c4c4c0');
  h(11, 14, 34, RS); h(12, 12, 36, RS); r(10, 13, 29, 29, RD); r(10, 13, 2, 29, RH); r(37, 13, 2, 29, RS);
  r(12, 17, 25, 15, '#1a1a1a'); r(13, 18, 23, 13, '#718689'); for (let i = 0; i < 8; i++) r(15 + i, 30 - i, 2, 1, '#a8bcc0');   // 大きな前窓（光の映りこみ）
  r(17, 18, 15, 3, '#111'); h(19, 18, 25, '#ff9a30'); h(19, 27, 30, '#5a8ae0');   // 行き先表示
  h(33, 10, 38, '#e8e8e8'); r(32, 22, 3, 1, '#d0d0d0');
  for (const x of [13, 31]) { r(x, 35, 5, 3, '#8a8e94'); r(x + 1, 36, 3, 1, '#f4f4e0'); }
  r(22, 36, 5, 2, '#e8e8e8');   // 車両番号の板
  r(12, 41, 25, 4, '#9aa0a6'); r(22, 42, 5, 3, '#333'); h(41, 12, 36, '#b8bec4');
  r(10, 45, 38, 3, '#4a3d30'); for (const x of [15, 33]) r(x, 45, 2, 3, '#9a9a9a');
});
// 西尾市役所：左は上にルーバー・下にガラスの帯が重なる棟、まん中は灰色のパネルに小窓の塔、右は空が映る青いガラスの塔。前に植えこみと街路樹
spotSprites.cityhall = hiCanvas((r, h) => {
  const GB = '#527dae', GL = '#678db4', GH = '#cadeec', MU = '#c8d0d8', PN = '#b9bbbb';
  r(0, 24, 7, 17, '#c4c4c0'); for (let y = 26; y < 40; y += 4) r(1, y, 5, 2, GB);
  r(6, 8, 17, 33, '#a8acb0'); r(6, 8, 17, 7, '#88919a'); for (let x = 7; x < 23; x += 2) r(x, 8, 1, 7, '#a2aab2');   // ルーバー
  for (const y of [15, 23, 31]) { r(7, y, 15, 7, GB); for (let x = 7; x < 22; x += 3) r(x, y, 1, 7, MU); h(y + 7, 6, 22, '#d8dce0'); h(y, 7, 21, '#8fb0d0'); }
  r(22, 6, 9, 35, PN); h(6, 22, 30, '#d8d8d6'); for (let y = 9; y < 39; y += 4) for (let x = 24; x < 30; x += 3) r(x, y, 1, 1, '#273444');
  r(31, 6, 11, 35, GL); for (let y = 6; y < 41; y += 3) h(y, 31, 41, '#9ab4cc'); for (let x = 33; x < 42; x += 3) r(x, 6, 1, 35, '#9ab4cc');
  for (let i = 0; i < 12; i++) r(31 + Math.floor(i / 2), 7 + i, 3, 1, GH);   // 空の映りこみ
  r(42, 18, 6, 23, '#c4c4c0'); for (let y = 20; y < 40; y += 4) r(43, y, 4, 2, GB);
  r(0, 40, 48, 3, '#585854'); r(0, 43, 48, 2, '#556b2f'); h(43, 0, 47, '#6a8a3a'); r(0, 45, 48, 3, '#6a6a6a');
  for (const x of [10, 36]) { r(x, 30, 1, 13, '#5a4030'); r(x - 2, 30, 5, 4, '#a07a50'); r(x - 1, 29, 3, 1, '#a07a50'); }
});
// 一色さかな広場：茶色い板張りの建物に「一色さかな広場」の看板（赤い丸のマーク）、白い大きな丸屋根、のぼり、正面の階段
spotSprites.sakanaHiroba = hiCanvas((r, h) => {
  const BN = '#7a6a6e', BL = '#6a5a5e';
  r(0, 16, 48, 2, '#b84a3a'); r(0, 18, 48, 17, '#6e5e62'); for (let x = 1; x < 48; x += 2) r(x, 18, 1, 17, BL);
  r(8, 5, 32, 17, BN); h(5, 8, 39, '#5a4c50'); for (let x = 9; x < 40; x += 2) r(x, 6, 1, 16, BL);
  r(12, 9, 4, 4, '#d6332a'); r(13, 10, 2, 2, '#ffffff'); r(13, 11, 2, 1, '#d6332a');
  pix(r, ['.#..##.#.#..#.##.##', '###.#..###.#.#.#.#', '.#..##.#.#.##.##.#', '.#..#..#.#..#.#..#'], 18, 9, '#ffffff');
  h(16, 14, 33, '#4a4448'); h(17, 10, 37, '#4a4448'); spanRows(h, 17, [[14, 33], [10, 37], [8, 39], [6, 41]], '#ece8e0'); r(6, 20, 1, 1, '#4a4448'); r(41, 20, 1, 1, '#4a4448');
  h(21, 6, 41, '#c8c0b4'); h(22, 8, 39, '#a8a098');
  r(17, 24, 14, 11, '#41403d'); for (const x of [17, 21, 26, 30]) r(x, 24, 1, 11, '#d8d8d4'); h(24, 17, 30, '#d8d8d4');
  for (const [x, c] of [[13, '#e57373'], [19, '#ffffff'], [27, '#3f7fbf'], [33, '#2b2018']]) { r(x, 31, 2, 4, c); r(x, 30, 2, 1, '#f4c58f'); }   // 店の前の人
  r(8, 21, 1, 20, '#333'); r(39, 21, 1, 20, '#333');
  r(4, 35, 40, 2, '#8a8682'); for (let y = 37; y < 41; y++) h(y, 4 - (y - 37), 43 + (y - 37), y % 2 ? '#5b5754' : '#7a7672');
  r(0, 41, 48, 7, '#cdc9c2'); for (const x of [6, 20, 34]) r(x, 44, 6, 1, '#f4f4f4');
  r(1, 20, 1, 21, '#888'); r(2, 20, 3, 13, '#d06388'); for (let y = 22; y < 32; y += 2) r(3, y, 1, 1, '#ffffff');
  r(46, 22, 1, 19, '#888'); r(43, 22, 3, 12, '#5a5ab0'); for (let y = 24; y < 33; y += 2) r(44, y, 1, 1, '#ffffff');
  pix(r, ['.####', '#####', '#####'], 43, 35, '#4a8a2a');
});
// 名鉄 吉良吉田駅：青緑の波板の寄棟屋根、白い壁に青いひさしと駅名の看板、青いごみ箱・自動販売機・赤いポスト。右に白い2階建てと観光の地図の看板
spotSprites.kiraYoshida = hiCanvas((r, h) => {
  const TL = '#9ec0ca', TM = '#7aa4b2', TD = '#4a7a8a', WW = '#ecebe6', BL = '#396d8d';
  r(28, 8, 14, 28, '#d2d0ca'); h(7, 27, 42, '#5a9aa8'); h(8, 28, 41, TD); for (const [x, y] of [[31, 12], [36, 12]]) { r(x, y, 3, 4, '#6f8fa8'); h(y, x, x + 2, '#9fb8cc'); }
  spanRows(h, 12, [[7, 29], [6, 30], [5, 31], [4, 32], [3, 33], [2, 34], [1, 35], [1, 35]], i => i < 3 ? TL : TM);
  for (let x = 2; x < 35; x += 2) r(x, 13, 1, 7, '#b8d6de'); h(20, 0, 36, TD);
  r(1, 21, 35, 14, WW); r(1, 30, 35, 5, '#d8d6d0');
  r(10, 21, 13, 3, '#f8f8f8'); r(11, 22, 1, 1, '#d23a2e'); for (let x = 13; x < 22; x += 2) r(x, 22, 1, 1, '#222'); h(23, 10, 22, BL);   // 駅名の看板
  h(24, 1, 23, BL); h(25, 1, 23, '#2a5a7a'); h(24, 25, 35, BL); h(25, 25, 35, '#2a5a7a');
  r(3, 27, 6, 5, '#6f8fa8'); r(3, 27, 6, 1, '#9fb8cc'); r(14, 27, 6, 8, '#3f4a52'); r(16, 28, 2, 6, '#5a6870');
  r(20, 27, 3, 8, '#2a5fb0'); r(21, 28, 1, 3, '#d8e4f4'); r(9, 31, 2, 4, '#3a6ac0'); r(11, 31, 2, 4, '#3a6ac0');
  r(26, 29, 2, 4, '#d23a2e'); r(26, 33, 1, 2, '#d23a2e'); r(28, 27, 6, 4, '#6f8fa8');
  r(38, 13, 1, 22, '#e8e8e8'); r(46, 13, 1, 22, '#e8e8e8'); r(39, 14, 7, 12, '#f4f0e0'); r(40, 16, 4, 7, '#e0c890'); r(39, 14, 2, 4, '#7fb0d8'); r(44, 20, 2, 5, '#7fb0d8'); r(40, 14, 4, 1, '#3f7fbf');
  r(0, 35, 48, 13, '#585758'); spanRows(h, 38, [[20, 26], [19, 27], [18, 28], [17, 29], [16, 30], [15, 31], [14, 32], [13, 33], [12, 34], [11, 35]], '#8a8a88'); h(40, 30, 47, '#c8a040');
});
// 刈宿の大仏（常福寺）：花びらの光背を背負い、手を胸の前に上げてすわる、うす金色の大きな仏さま。蓮の台、金の手すり、赤い紋の灰色の台座、手前に植えこみ
spotSprites.daibutsu = hiCanvas((r, h) => {
  const BL = '#d8b088', BM = '#b88c64', BS = '#8a6444', BD = '#5a3e28';
  for (let y = 0; y < 30; y++) for (let x = 6; x < 42; x++) { const d = Math.hypot(x - 24, y - 15); if (d >= 13 && d < 16) r(x, y, 1, 1, (Math.round(Math.atan2(y - 15, x - 24) * 8) % 2) ? '#b08850' : '#c89c64'); }   // 光背（花びらの輪）
  for (let y = 0; y < 16; y++) for (let x = 14; x < 34; x++) { const d = Math.hypot(x - 24, (y - 8) * 1.1); if (d >= 6.5 && d < 9) r(x, y, 1, 1, '#b8905a'); }   // 頭のうしろの蓮の輪
  spanRows(h, 2, [[22, 25], [21, 26], [20, 27]], BD); for (let x = 20; x < 28; x += 2) r(x, 4, 1, 1, BS);   // 螺髪
  spanRows(h, 5, [[20, 27], [19, 28], [19, 28], [19, 28], [19, 28], [20, 27], [20, 27], [21, 26]], BL); r(18, 7, 1, 4, BM); r(29, 7, 1, 4, BM);   // 顔と耳
  h(8, 20, 22, BS); h(8, 25, 27, BS); r(23, 9, 2, 2, BM); h(11, 22, 25, BS); r(22, 13, 4, 2, BM);   // 目・鼻・口・首
  spanRows(h, 15, [[17, 30], [14, 33], [13, 34], [12, 35], [12, 35], [12, 35], [12, 35], [12, 35], [12, 35], [11, 36], [11, 36], [11, 36]], i => i < 2 ? BL : BM);
  for (const [x, y] of [[14, 18], [15, 22], [33, 19], [32, 23]]) r(x, y, 1, 3, BS); r(23, 16, 2, 6, BS);   // 衣のひだ
  r(15, 15, 4, 6, BL); r(16, 14, 2, 1, BL); h(20, 15, 18, BS); r(29, 18, 4, 4, BL); h(21, 29, 32, BS);   // 胸の前に上げた手
  spanRows(h, 27, [[8, 39], [6, 41], [5, 42], [5, 42]], i => i % 2 ? BM : BL); h(30, 5, 42, BS);   // 組んだ足
  for (let x = 5; x < 43; x += 4) { r(x, 31, 4, 3, '#c09060'); r(x, 31, 1, 3, BS); h(31, x + 1, x + 2, BL); }   // 蓮の台
  h(34, 4, 43, '#a87848');
  r(4, 35, 40, 3, '#c8a060'); for (let x = 5; x < 43; x += 2) r(x, 36, 1, 1, '#8a6a3a'); for (const x of [4, 15, 32, 43]) { r(x, 33, 1, 5, '#d8b070'); r(x, 32, 1, 1, '#e8c890'); }   // 金の手すり
  r(9, 38, 30, 10, '#a8a49c'); h(38, 9, 38, '#c8c4bc'); r(9, 38, 1, 10, '#8a867e'); r(38, 38, 1, 10, '#8a867e'); r(12, 40, 8, 7, '#9a968e'); r(29, 40, 8, 7, '#9a968e');
  pix(r, ['..#..', '.###.', '#####', '.###.', '..#..'], 21, 41, '#c03a28'); r(22, 39, 1, 2, '#3a6a3a'); r(24, 39, 1, 2, '#3a6a3a');   // 台座の赤い紋
  pix(r, ['...######...', '.##########.', '############', '############', '############', '############', '############'], 0, 41, '#3f7a34'); h(41, 4, 8, '#5a9a44');
});
// 佐久島の黒壁の集落：うすい青みの黒い板壁に、銀ねずの瓦屋根の2階建て。手前に黒い板の小屋、赤いポスト、坂の道
spotSprites.kurokabe = hiCanvas((r, h) => {
  const WB = '#5d6873', WL = '#4a535e', RC = ['#c8c9ce', '#9e9fa4', '#5e5f64', '#8a8b90'];
  tileRoof(r, h, 5, [[14, 30], [12, 32], [10, 34], [8, 36], [6, 38], [5, 39]], RC);
  r(8, 11, 28, 24, WB); for (let x = 9; x < 36; x += 2) r(x, 11, 1, 24, WL); h(11, 8, 35, '#3a4048');
  r(17, 14, 6, 6, '#81796f'); r(17, 14, 6, 1, '#5a5048'); r(20, 14, 1, 6, '#5a5048'); r(27, 14, 4, 5, '#3a4048');
  tileRoof(r, h, 20, [[3, 14], [2, 15], [1, 16]], RC); r(2, 23, 14, 13, WB); for (let x = 3; x < 16; x += 2) r(x, 23, 1, 13, WL); r(5, 27, 5, 3, '#81796f');
  for (let k = 0; k < 6; k++) h(19 + k, 28 - k * 2, 29 + k * 2, k === 5 ? '#4a4b50' : '#7e7f84');   // 小屋の屋根
  r(19, 25, 20, 15, '#3b3739'); for (let x = 20; x < 39; x += 2) r(x, 25, 1, 15, '#4a4648'); r(23, 29, 8, 3, '#8a8070'); r(26, 29, 1, 3, '#3b3739');
  r(40, 29, 4, 6, '#d23a2e'); h(29, 40, 43, '#e8584a'); r(41, 31, 2, 1, '#3a1a1a'); r(41, 35, 2, 4, '#d23a2e'); r(40, 39, 4, 1, '#a8a49c');
  r(0, 40, 48, 8, '#8e8b86'); for (const [x, y] of [[4, 43], [16, 45], [30, 42], [38, 46]]) r(x, y, 5, 1, '#a8a49e');
  pix(r, ['..####', '.#####', '######', '######', '######'], 42, 36, '#3f7a34');
});
// おひるねハウス（佐久島）：白い小石の浜に置かれた、黒い焼き板の大きな箱。格子のすきまの奥から空と海が見え、はしごが2本かかる
spotSprites.ohirune = hiCanvas((r, h) => {
  const BK = '#141314', IN = '#060606', SK = '#9fabbc', SE = '#7b8c95', SA = '#d2c8bc';
  spanRows(h, 38, [[6, 41], [3, 44], [1, 46], [0, 47], [0, 47], [0, 47], [0, 47], [1, 46], [2, 45], [4, 43]], SA);
  for (const [x, y] of [[3, 42], [10, 45], [22, 46], [33, 44], [43, 42], [16, 43]]) r(x, y, 2, 1, '#b8aea0'); for (const [x, y] of [[5, 40], [40, 40], [44, 44]]) r(x, y, 2, 1, '#8a9a5a');
  r(7, 5, 34, 34, BK); for (const x of [11, 23, 35]) r(x, 38, 2, 3, BK);
  for (let x = 8; x < 40; x += 3) r(x, 6, 1, 32, '#1c1a1c');   // 焼き板の木目
  const cells = [[10, 8], [21, 8], [32, 8], [10, 19], [21, 19], [32, 19], [10, 30], [21, 30], [32, 30]];
  cells.forEach(([x, y], i) => {
    r(x, y, 8, 8, IN); h(y, x, x + 7, '#1e1c1e');   // 奥の壁（暗い）
    const row = Math.floor(i / 3);
    const ox2 = x + 1, oy2 = y + (row === 0 ? 3 : 1);   // 奥の開口（大きく、空・海・浜が見える）
    r(ox2, oy2, 6, y + 7 - oy2, row === 2 ? SE : SK); if (row === 1) r(ox2, y + 5, 6, 2, SE); if (row === 2) h(y + 6, ox2, ox2 + 5, SA);
  });
  for (const [x, y0, y1] of [[21, 9, 41], [31, 26, 41]]) { r(x, y0, 1, y1 - y0, '#2a2a2e'); r(x + 4, y0, 1, y1 - y0, '#2a2a2e'); for (let y = y0 + 2; y < y1; y += 3) r(x + 1, y, 3, 1, '#4a4a50'); }   // はしご
});
// ---- 48×48 に描き直した名所の絵（もとは 32×32。参考写真から色と比率をとりなおしたもの） ----
// カモメの駐車場（佐久島）：沖へのびる石の防波堤に、棒の上のカモメの像が2列にずらり（遠くほど小さく）
spotSprites.kamome = hiCanvas((r, h) => {
  const SE = '#6b8796', SL = '#8aa6b4', RK = '#8a847e', RL = '#aaa49e', RD = '#5e5a56';
  spanRows(h, 24, Array.from({ length: 24 }, (_, i) => [Math.max(0, 14 - i), Math.min(47, 33 + i)]), SE);
  for (const [x, y] of [[4, 40], [38, 30], [42, 44], [8, 30]]) h(y, x, x + 3, SL);
  for (let y = 18; y < 48; y++) { const k = (y - 18) / 30, a = Math.round(20 - k * 16), b = Math.round(27 + k * 16); h(y, a, b, RK); }   // 遠くから手前へ広がる防波堤
  for (let y = 20; y < 48; y += 3) { const k = (y - 18) / 30, a = Math.round(20 - k * 16), b = Math.round(27 + k * 16); for (let x = a + ((y / 3) % 2 ? 1 : 3); x < b - 1; x += Math.max(2, Math.round(3 + k * 3))) { r(x, y, Math.max(1, Math.round(1 + k * 2)), 1, RL); r(x - 1, y + 1, 1, 1, RD); } }
  for (let i = 0; i < 7; i++) {   // カモメの像（2列）
    const k = i / 6, y = Math.round(6 + i * 4.2), s = k < 0.3 ? 1 : k < 0.7 ? 2 : 3;
    for (const side of [-1, 1]) {
      const x = Math.round(23.5 + side * (2 + k * 9)) - s;
      r(x + s, y + s, 1, 2 + s * 2, '#c88a3b');
      h(y, x, x + s * 2, '#d8dce0'); h(y + 1, x, x + s * 2, '#6a727e'); r(x + s * 2 + 1, y, 1, 1, '#e8a040'); if (s > 1) h(y - 1, x + s, x + s * 2, '#e8ecf0');
    }
  }
});
// 稲荷山茶園公園：こい灰色の寄棟屋根のあずまや（灰色の柱・石段）と、まるくかりこんだ茶の木の列
spotSprites.chaen = hiCanvas((r, h) => {
  const TG = '#3f8f3a', TL = '#7fc65e', TD = '#2a5f28', SO = '#a88a62';
  tileRoof(r, h, 5, [[18, 29], [15, 32], [12, 35], [9, 38], [7, 40]], ['#5a585e', '#3e3c42', '#2c292d', '#48464c']); r(22, 3, 4, 2, '#5a585e');
  h(10, 9, 38, '#8a8c90'); for (const x of [10, 23, 37]) r(x, 11, 2, 12, '#7a7d82'); r(15, 17, 18, 2, '#8a6a4a'); r(20, 15, 8, 2, '#a07a58');   // 柱とベンチ・机
  for (let i = 0; i < 3; i++) h(21 + i, 14 - i, 33 + i, i % 2 ? '#8a8a88' : '#a8a8a4');
  for (const y of [25, 32, 39]) {
    h(y, 1, 46, TL); r(0, y + 1, 48, 3, TG); h(y + 4, 0, 47, TD); if (y < 39) h(y + 5, 0, 47, SO); if (y < 39) h(y + 6, 0, 47, SO);
    for (let x = 2 + (y % 2) * 3; x < 46; x += 6) { h(y - 1, x, x + 2, TL); r(x + 4, y + 2, 1, 1, TL); }
  }
});
// 尚古荘：銀ねずの瓦屋根、障子の白い帯とこげ茶の柱、ガラス戸の縁側。手前に斜めにのびる松の幹と庭石
spotSprites.shokoso = hiCanvas((r, h) => {
  const WD = '#473f41', SJ = '#e8e6e0';
  tileRoof(r, h, 8, [[12, 46], [10, 47], [8, 47], [6, 47], [5, 47]], ['#9aa29e', '#7a827e', '#4a504c', '#6a726e']);
  r(7, 13, 41, 3, '#3a3236'); r(7, 16, 41, 9, SJ); for (let x = 7; x < 48; x += 3) r(x, 16, 1, 9, '#c8c4bc'); h(20, 7, 47, '#c8c4bc');
  r(7, 25, 41, 7, '#262120'); for (let x = 8; x < 48; x += 4) r(x + 1, 26, 2, 3, '#7a8a90');
  for (const x of [7, 17, 27, 37, 47]) r(x, 13, 1, 20, WD);
  h(32, 4, 47, '#5a5054'); h(33, 4, 47, '#3b383c'); for (let x = 6; x < 48; x += 6) r(x, 34, 1, 4, WD);
  for (let i = 0; i < 40; i++) r(Math.round(18 + i * 0.25), 8 + i, 2, 1, i % 5 ? '#6a5a4c' : '#4a3e34');   // 松の幹
  for (const [x, y] of [[2, 1], [10, 4], [0, 8], [22, 0]]) { pix(r, PINE, x, y, '#3a5a34'); h(y, x + 2, x + 4, '#5a7a4a'); }
  r(0, 40, 48, 8, '#7a8a5a'); for (const [x, y, w] of [[2, 41, 9], [14, 43, 7], [30, 42, 10]]) { r(x, y, w, 3, '#8a8688'); h(y, x + 1, x + w - 2, '#a8a4a6'); }
  pix(r, ['.####.', '######', '######'], 0, 36, '#4a7a3a');
});
// 伊文神社：緑青の銅ぶき屋根（正面に反った唐破風）、白木の柱、しめ縄と紙垂、石段と白い砂利
spotSprites.ibunJinja = hiCanvas((r, h) => {
  const CU = '#6f9a8e', CL = '#8fb8aa', CD = '#4a6e64', WD = '#c8b89a', WS = '#8a7a64', DK = '#2b2521';
  spanRows(h, 8, [[14, 33], [11, 36], [8, 39], [6, 41], [4, 43], [3, 44], [2, 45]], i => i < 2 ? CL : CU); h(15, 1, 46, CD); r(1, 14, 1, 1, CD); r(46, 14, 1, 1, CD);
  for (let x = 6; x < 42; x += 3) r(x, 10, 1, 4, '#80aa9c');
  spanRows(h, 9, [[21, 26], [18, 29], [16, 31], [15, 32], [14, 33], [14, 33]], i => i === 0 ? CL : CU); h(14, 14, 33, CD); r(13, 13, 1, 1, CD); r(34, 13, 1, 1, CD);   // 唐破風
  r(22, 5, 4, 3, CD); r(23, 4, 2, 1, '#8a6a3a');
  r(6, 16, 36, 15, WS); r(8, 18, 32, 13, DK); for (const x of [6, 13, 20, 27, 34, 41]) r(x, 16, 2, 15, WD); h(16, 6, 42, '#d8ccb0');
  for (let x = 9; x < 40; x += 2) r(x, 19, 1, 5, '#4a3e34');
  r(9, 21, 30, 2, '#e8dcc0'); for (const x of [13, 19, 25, 31, 37]) { r(x, 23, 1, 1, '#ffffff'); r(x + 1, 24, 1, 2, '#ffffff'); }   // しめ縄と紙垂
  h(31, 4, 43, '#8a7a6a'); r(4, 32, 6, 3, WD); r(38, 32, 6, 3, WD); for (let x = 5; x < 43; x += 2) r(x, 32, 1, 3, '#a89878');
  for (let i = 0; i < 5; i++) h(35 + i, 16 - i, 31 + i, i % 2 ? '#8a8886' : '#a8a6a4');
  r(0, 40, 48, 8, '#d8d4cc'); for (const [x, y] of [[4, 43], [12, 46], [36, 44], [42, 46]]) r(x, y, 2, 1, '#b8b4ac');
});
// 抹茶ミュージアム 西条園 和く和く：大きな黒い軒の下、ベージュの壁に緑の葉のマークと「和く和く」の字、展示の窓、白い竹垣
spotSprites.wakuwaku = hiCanvas((r, h) => {
  const BE = '#c8ae8c', BD = '#a48e70';
  r(0, 4, 48, 3, '#4a4a48'); h(7, 0, 47, '#2e2e2c'); r(0, 8, 8, 36, '#3a383c'); for (let y = 10; y < 44; y += 3) h(y, 0, 7, '#4a484c');
  r(8, 8, 26, 36, BE); r(8, 8, 26, 2, BD);
  pix(r, ['..##..', '.####.', '######', '#.##.#', '..##..'], 11, 13, '#5aae2f'); pix(r, ['#.#.##.#.#.##', '.#..#..#.#.#.', '#.#.##.#.#.##'], 19, 14, '#2a2a2a');
  r(12, 23, 16, 9, '#222'); r(13, 24, 6, 7, '#c86a3a'); r(19, 24, 4, 3, '#e8c890'); r(23, 24, 4, 7, '#7a9a5a'); r(19, 27, 4, 4, '#a84a3a');   // 展示の窓
  r(34, 8, 14, 36, '#3a3a3a'); r(35, 18, 12, 2, '#222'); r(36, 20, 10, 24, '#2a3036'); r(38, 18, 8, 1, '#5aae2f');
  r(30, 28, 18, 16, '#d8d0c4'); for (let x = 31; x < 48; x += 2) r(x, 28, 1, 16, '#b8b0a4'); for (const y of [32, 39]) for (let x = 32; x < 48; x += 4) { r(x, y, 1, 1, '#111'); r(x + 1, y + 1, 1, 1, '#111'); }   // 竹垣
  r(0, 44, 48, 4, '#a49e9b'); pix(r, ['.###', '####', '####'], 26, 41, '#4a8a3a');
});
// 三河工芸ガラス美術館：灰色がかったクリーム色の箱の建物、青いたて長の窓が2つずつ、1階の白い帯とガラス張り（中に色ガラス）
spotSprites.glassMuseum = hiCanvas((r, h) => {
  const WL = '#d8d4cc', WS = '#b8b4ac';
  r(6, 4, 36, 26, WL); r(6, 4, 4, 26, WS); h(4, 6, 41, '#e8e6e0'); for (let y = 10; y < 30; y += 6) h(y, 6, 41, '#c8c4bc');
  for (const [x, y] of [[16, 8], [19, 8], [28, 7], [31, 7], [16, 18], [19, 18], [28, 18], [31, 18]]) { r(x, y, 2, 6, '#2a4a8a'); r(x, y, 1, 2, '#5a7ab8'); }
  r(3, 30, 42, 4, '#f0eee8'); h(33, 3, 44, '#c8c4bc'); r(41, 6, 1, 24, WS);
  r(5, 34, 38, 11, '#3a4248'); for (const x of [5, 11, 17, 23, 29, 35, 42]) r(x, 34, 1, 11, '#b8bcc0');
  for (const [x, y, c] of [[7, 38, '#e57373'], [13, 40, '#ffd54f'], [19, 37, '#64b5f6'], [31, 39, '#81c784'], [37, 37, '#ba68c8']]) r(x, y, 2, 3, c);
  r(24, 36, 4, 9, '#5a6670'); r(0, 45, 48, 3, '#6a6a6a'); r(44, 34, 1, 11, '#333');
});
// 道の駅にしお岡ノ山：こい灰色の切妻屋根の平屋が2つ（白っぽい破風）、丸い柱の通路、駐車場の青い区画
spotSprites.michinoeki = hiCanvas((r, h) => {
  const RC = ['#5a5e64', '#3e4248', '#24282c', '#4a4e54'];
  tileRoof(r, h, 9, [[6, 21], [4, 23], [2, 25], [1, 26], [0, 27]], RC); spanRows(h, 9, [[13, 14], [12, 15], [11, 16], [10, 17]], '#e8e4d8');
  r(1, 14, 25, 12, '#d8d0c0'); r(4, 17, 6, 9, '#2a3036'); r(14, 17, 9, 6, '#4a5866'); for (const x of [2, 12, 24]) r(x, 14, 1, 12, '#8a8070');
  tileRoof(r, h, 7, [[24, 47], [23, 47], [22, 47], [21, 47], [20, 47], [20, 47]], RC);
  r(21, 13, 27, 13, '#cfc6b4'); r(24, 16, 22, 8, '#2a3036'); for (const x of [27, 34, 41]) { r(x, 14, 2, 12, '#e8e4dc'); r(x, 14, 1, 12, '#ffffff'); }
  r(0, 26, 48, 22, '#6a6a6c'); spanRows(h, 33, [[6, 24], [5, 25], [4, 26], [3, 27], [2, 28], [1, 29]], '#3a8ad8'); for (const x of [8, 14, 20]) r(x, 34, 1, 4, '#ffffff');
  for (const x of [32, 40]) r(x, 30, 1, 12, '#f4f4f4'); h(42, 30, 47, '#c84a4a');
});
// 三河一色諏訪神社：銀ねずの瓦の重い入母屋屋根（反った軒）、彫刻のある茶色い木の社殿、高い床と手すり
spotSprites.isshikiSuwa = hiCanvas((r, h) => {
  const RC = ['#b8bcc2', '#8a8e96', '#4a4e56', '#7a7e86'], WD = '#7a5a40', WL = '#9a7a58', DK = '#3a2a20';
  spanRows(h, 2, [[18, 29], [17, 30]], '#5a5e66'); tileRoof(r, h, 4, [[15, 32], [13, 34], [11, 36], [9, 38], [7, 40], [5, 42], [3, 44], [2, 45]], RC);
  spanRows(h, 5, [[22, 25], [21, 26], [20, 27], [19, 28]], '#e8e4dc'); r(23, 6, 2, 1, '#8a6a3a');   // 破風の妻
  r(6, 12, 36, 3, '#5a4a3a'); h(12, 6, 41, '#8a7a68');
  r(7, 15, 34, 14, WD); for (const x of [7, 14, 20, 27, 33, 40]) r(x, 15, 1, 14, WL);
  for (let x = 8; x < 40; x += 2) r(x, 16, 1, 4, '#5a4632'); r(15, 21, 5, 8, DK); r(28, 21, 5, 8, DK); r(21, 21, 6, 8, '#2a1e16');
  for (let x = 8; x < 40; x += 3) r(x, 17, 2, 2, '#b89a70');   // 彫刻
  h(29, 3, 44, '#8a7a6a'); r(3, 30, 42, 2, WL); for (let x = 4; x < 44; x += 3) r(x, 32, 1, 5, WD); h(36, 2, 45, '#6a5a4a');
  r(0, 37, 48, 6, '#9a968c'); h(37, 0, 47, '#b8b4aa'); r(0, 43, 48, 5, '#c8c4b8');
  r(42, 30, 3, 9, '#9a968c'); r(41, 29, 5, 2, '#b8b4aa');   // 石灯籠
});
// 一色港：佐久島へ渡る白い高速船「さちかぜ」（青い船底と虹のマーク、黒い窓の操舵室）と、青い柱の船着き場の屋根
spotSprites.isshikiPort = hiCanvas((r, h) => {
  const WH = '#f0f2f4', WS = '#c8ccd4', BL = '#2f5fae';
  r(0, 0, 20, 3, '#2a4a8a'); r(4, 3, 2, 30, '#2a6ac0'); r(16, 3, 2, 26, '#2a6ac0');
  r(22, 4, 1, 6, '#666'); h(5, 20, 25, '#666');
  r(18, 9, 14, 6, WH); r(19, 11, 12, 2, '#222a30'); h(9, 18, 31, '#ffffff');
  r(10, 15, 30, 8, WH); r(10, 21, 30, 2, WS); for (let x = 12; x < 38; x += 4) r(x, 17, 3, 2, '#2a3440');
  spanRows(h, 23, [[2, 40], [2, 42], [3, 44], [3, 46], [4, 45], [5, 44], [6, 42], [8, 40], [10, 38]], i => i === 3 ? BL : i === 4 ? '#d23a2e' : i >= 6 ? BL : WH);
  for (const [x, c] of [[12, '#e53935'], [13, '#fb8c00'], [14, '#fdd835'], [15, '#43a047'], [16, '#1e88e5']]) r(x, 25, 1, 3, c);   // 虹のマーク
  r(0, 32, 48, 16, '#5a7a8a'); for (const [x, y] of [[3, 36], [20, 40], [34, 35], [40, 44], [10, 44]]) h(y, x, x + 3, '#8aaab8');
  r(0, 30, 10, 6, '#9a9a96'); h(30, 0, 9, '#c8c8c4'); for (let x = 0; x < 10; x += 3) r(x, 33, 2, 1, '#e8c040');
});
// 愛知こどもの国：園内を走る白い汽車（丸い顔に煙突、運転台）と、白い屋根つきの客車
spotSprites.kodomoTrain = hiCanvas((r, h) => {
  const WH = '#f4f4f2', WS = '#c8c8c4', DK = '#2a2a2a';
  r(0, 14, 24, 2, WH); h(16, 0, 23, WS); for (const x of [0, 8, 16, 23]) r(x, 16, 1, 8, WS);
  for (const [x, c] of [[2, '#ffb300'], [5, '#5a3418'], [10, '#e57373'], [13, '#2b2018'], [18, '#3f7fbf']]) { r(x, 20, 2, 2, '#f4c58f'); r(x, 22, 2, 2, c); }
  r(0, 24, 24, 8, WH); h(28, 0, 23, '#b8b8b4'); for (let x = 2; x < 23; x += 4) r(x, 25, 2, 2, '#d8d8d4');
  r(25, 11, 9, 2, WH); r(25, 13, 9, 19, WH); r(26, 15, 7, 5, '#2a3440'); r(25, 13, 1, 19, WS);   // 運転台
  r(34, 20, 11, 12, WH); r(34, 20, 11, 2, '#ffffff'); r(37, 13, 4, 7, WH); r(36, 12, 6, 2, WS);   // ボイラーと煙突
  spanRows(h, 19, [[44, 46], [43, 47], [43, 47], [43, 47], [43, 47], [43, 47], [44, 46]], WS); r(44, 21, 3, 3, DK); r(45, 22, 1, 1, '#c8c8c4');   // 丸い顔
  for (const x of [3, 15, 27, 38]) { r(x, 31, 5, 5, DK); r(x + 1, 32, 3, 3, '#8a8a8a'); r(x + 2, 33, 1, 1, DK); }
  r(0, 36, 48, 12, '#5a5a5c'); for (let x = 0; x < 48; x += 2) r(x, 40, 1, 1, '#e8c040'); h(41, 0, 47, '#e8c040');
});
// 東条城跡（吉良）：丸太の脚に筋かいを組んだ高い物見やぐら、高床の小さな門の建物、木の柵、草の丘
spotSprites.tojoJo = hiCanvas((r, h) => {
  const WD = '#5a4a3a', WL = '#7a6650', RF = '#3a3a3a';
  spanRows(h, 1, [[31, 38], [28, 41], [26, 43], [25, 44]], i => i === 3 ? '#222' : RF); r(27, 5, 16, 6, WL); for (let x = 28; x < 43; x += 2) r(x, 5, 1, 6, WD); r(29, 7, 11, 2, '#2a2018');
  h(11, 26, 43, WD); r(28, 12, 2, 26, WD); r(39, 12, 2, 26, WD); r(33, 12, 2, 26, WL);
  for (let y = 14; y < 36; y += 7) { for (let i = 0; i < 6; i++) { r(30 + i, y + i, 1, 1, WL); r(38 - i, y + i, 1, 1, WL); } h(y + 6, 28, 40, WD); }   // 筋かい
  spanRows(h, 14, [[6, 19], [4, 21], [3, 22]], i => i === 2 ? '#222' : RF); r(5, 17, 15, 5, WL); r(8, 18, 9, 3, '#2a2018'); for (const x of [5, 19]) r(x, 22, 1, 12, WD);
  for (let x = 0; x < 48; x += 2) if (x < 26 || x > 42) r(x, 26, 1, 9, WL); h(28, 0, 47, WD);
  spanRows(h, 34, [[0, 47], [0, 47], [0, 47]], '#6fa04a'); r(0, 37, 48, 11, '#5a9a3a'); for (const [x, y] of [[4, 40], [18, 43], [36, 41]]) h(y, x, x + 5, '#7fb85a');
  pix(r, ['.####.', '######', '######'], 8, 30, '#3f7a34');
});
// 妙善寺（かぼちゃ寺）：こけむした古い瓦の宝形屋根の小さなお堂（こげ茶の板壁、正面に石段）、右に瓦をのせた白い塀、松
spotSprites.myozenji = hiCanvas((r, h) => {
  const RC = ['#8a7a6a', '#6a5e54', '#3a322c', '#5a504a'], WD = '#5a3e2c';
  r(22, 1, 3, 3, '#5a4a3a');
  tileRoof(r, h, 4, [[18, 28], [15, 31], [12, 34], [9, 37], [6, 40], [4, 42], [3, 43]], RC); for (const [x, y] of [[14, 7], [24, 6], [30, 8], [20, 9]]) r(x, y, 2, 1, '#c8a050');   // こけ
  h(11, 4, 42, '#a89880'); r(8, 12, 30, 20, WD); for (const x of [8, 13, 33, 37]) r(x, 12, 1, 20, '#7a5a40');
  r(14, 13, 19, 14, '#2a1e16'); r(17, 15, 13, 8, '#4a3a2a'); r(21, 18, 5, 4, '#c8a060');   // 中のお厨子
  for (let i = 0; i < 6; i++) h(27 + i, 14 - i, 32 + i, i % 2 ? '#8a7a6a' : '#a89a8a');
  r(38, 16, 10, 18, '#e8e4dc'); tileRoof(r, h, 14, [[37, 47], [37, 47]], ['#4a4e56', '#4a4e56', '#2e3238', '#3a3e44']); for (let y = 20; y < 34; y += 4) h(y, 38, 47, '#c8c4bc');
  r(0, 33, 48, 15, '#b8b4a8'); for (const [x, y] of [[0, 2], [2, 7], [0, 13]]) { pix(r, PINE, x, y, '#3a5a34'); h(y, x + 2, x + 4, '#5a7a4a'); } r(3, 14, 2, 20, '#5a4a3c');
  for (const x of [1, 42]) { pix(r, ['.####.', '######', '######', '.####.'], x, 39, '#3e6b2e'); r(x + 2, 39, 1, 4, '#2c4f20'); r(x + 2, 38, 2, 1, '#6a4a30'); }   // かぼちゃ
});
// 吉良饗庭塩の里：砂をならした入浜式の塩田と木の樋、黒い板の塩たき小屋、柱だけのあずまや、うしろの緑の山
spotSprites.shioNoSato = hiCanvas((r, h) => {
  const SA = '#c8c2b4', SD = '#a8a294';
  r(0, 4, 48, 12, '#3f7a34'); for (const [x, y] of [[3, 5], [14, 4], [26, 6], [38, 4]]) r(x, y, 6, 2, '#5a9a44'); h(15, 0, 47, '#4a6a3a');
  tileRoof(r, h, 9, [[30, 45], [29, 46], [28, 47]], ['#6a6e74', '#4a4e54', '#2e3238', '#5a5e64']); r(29, 12, 18, 9, '#2e2a28'); for (let x = 30; x < 47; x += 2) r(x, 12, 1, 9, '#3e3a38'); r(35, 15, 4, 6, '#1a1612');
  r(3, 10, 22, 2, '#4a3a2e'); for (const x of [4, 12, 23]) r(x, 12, 1, 8, '#6a5a4a'); for (let x = 6; x < 22; x += 4) r(x, 17, 2, 2, '#a07a50');   // あずまや
  r(0, 20, 48, 28, SA); for (let y = 22; y < 48; y += 3) h(y, 0, 47, SD); h(20, 0, 47, '#8a8478');
  for (let i = 0; i < 18; i++) { r(4 + i, 26 + i, 3, 1, '#5a4a3a'); r(5 + i, 25 + i, 2, 1, '#8a7258'); }   // 木の樋
  r(30, 30, 9, 3, '#b0a890'); r(34, 36, 5, 2, '#2a6ac0');
});
// 吉良ワイキキビーチ（宮崎海水浴場）：エメラルド色の浅い海、白い砂浜、ホテルが並ぶ緑の岬
spotSprites.waikiki = hiCanvas((r, h) => {
  r(0, 8, 48, 14, '#4f8a3a'); for (const [x, y] of [[2, 9], [14, 8], [30, 10], [40, 9]]) r(x, y, 7, 2, '#6fa85a');
  r(0, 2, 10, 20, '#e8ecee'); r(0, 2, 10, 2, '#c8d0d8'); for (let y = 5; y < 21; y += 2) for (let x = 1; x < 10; x += 2) r(x, y, 1, 1, '#7a9ab8');   // 高いホテル
  for (const [x, y, w, hh] of [[12, 12, 10, 10], [24, 14, 8, 8], [34, 13, 9, 9]]) { r(x, y, w, hh, '#f4f4f0'); for (let yy = y + 2; yy < y + hh; yy += 2) for (let xx = x + 1; xx < x + w - 1; xx += 2) r(xx, yy, 1, 1, '#8aa0b8'); }
  spanRows(h, 22, [[0, 47], [0, 47], [0, 47], [0, 44], [0, 40], [0, 34], [0, 28]], '#ecdcb4');
  for (const [x, c] of [[10, '#d23a2e'], [22, '#ffb300'], [32, '#3f7fbf']]) { h(20, x - 2, x + 2, c); h(21, x - 3, x + 3, c); r(x, 22, 1, 3, '#555'); }
  spanRows(h, 25, Array.from({ length: 23 }, (_, i) => [i < 6 ? [45, 41, 35, 29, 22, 14][i] : 0, 47]), '#4ab8b0');
  for (let y = 30; y < 48; y += 4) for (let x = (y % 8) * 2; x < 48; x += 10) h(y, x, x + 3, '#8ad8d0'); spanRows(h, 26, [[44, 47], [40, 47], [34, 47]], '#f4f4f0');
});
// 岡崎城：石垣の上に建つ白い壁の天守（三重、灰色の瓦屋根に千鳥破風、金のしゃちほこ）。徳川家康の生まれた城
spotSprites.okazakiCastle = hiCanvas((r, h) => {
  const RC = ['#9aa0a8', '#6a7078', '#3a3e46', '#5a6068'], WL = '#f6f6f2', WS = '#d8d8d4', WN = '#3a3a3a', ST = '#8a8680', SL = '#a8a49e', SD = '#5e5a56';
  for (const [x, d] of [[16, -1], [30, 1]]) { r(x, 0, 2, 3, '#d8a830'); r(x + (d < 0 ? -1 : 2), 0, 1, 2, '#d8a830'); }
  tileRoof(r, h, 3, [[15, 32], [13, 34], [11, 36], [10, 37], [9, 38]], RC); spanRows(h, 1, [[23, 24], [22, 25]], RC[2]);
  r(13, 8, 22, 6, WL); r(13, 8, 3, 6, WS); for (const x of [17, 22, 27, 31]) r(x, 9, 2, 3, WN);
  tileRoof(r, h, 14, [[9, 38], [7, 40], [5, 42], [4, 43], [3, 44]], RC);
  for (let k = 0; k < 6; k++) h(10 + k, 23 - k, 24 + k, k < 2 ? RC[1] : RC[0]); for (let k = 2; k < 6; k++) h(10 + k, 25 - k, 22 + k, WL);   // 千鳥破風
  r(7, 19, 34, 7, WL); r(7, 19, 4, 7, WS); for (const x of [12, 18, 24, 30, 36]) r(x, 21, 2, 3, WN);
  tileRoof(r, h, 26, [[4, 43], [2, 45], [1, 46], [0, 47]], RC);
  r(5, 30, 38, 5, WL); for (const x of [9, 17, 25, 33]) r(x, 31, 3, 2, WN);
  for (let y = 35; y < 48; y++) { const k = (y - 35) >> 2; h(y, 4 - k, 43 + k, (y - 35) % 3 ? ST : SL); }
  for (const y of [38, 42, 46]) h(y, 2, 45, SD); for (let x = 6; x < 44; x += 5) { r(x, 35, 1, 3, SD); r(x + 2, 39, 1, 3, SD); r(x, 43, 1, 3, SD); }
});
// カクキュー 八丁味噌：うす暗い蔵の中、赤茶の台にのった大きな木の仕込み樽。上に川の石を山のように積む
spotSprites.misoBarrel = hiCanvas((r, h) => {
  const WD = '#8a6a4a', WH = '#a8845e', WS = '#6a4e34', BD = '#7a3a2a', SG = '#c8c8c4', SL = '#ecece8', SK = '#8a8a86';
  r(0, 0, 48, 45, '#3a322c'); r(0, 0, 48, 6, '#2a2420'); for (let x = 4; x < 48; x += 10) r(x, 0, 2, 40, '#4a3e34'); r(30, 2, 3, 2, '#f4f0d8'); r(36, 6, 10, 14, '#4a4038');   // うす暗い蔵の中
  const barrel = (x0, x1, y0, y1) => {
    r(x0, y0, x1 - x0 + 1, y1 - y0 + 1, WD); r(x0, y0, 3, y1 - y0 + 1, WH); r(x1 - 3, y0, 4, y1 - y0 + 1, WS);
    for (let x = x0 + 4; x < x1 - 3; x += 3) r(x, y0, 1, y1 - y0 + 1, '#7a5a3e');
    for (const y of [y0 + 2, Math.round((y0 * 2 + y1) / 3), Math.round((y0 + y1 * 2) / 3), y1 - 2]) { h(y, x0, x1, BD); h(y + 1, x0, x1, '#5a2a1e'); }
    let w = x1 - x0 - 1, y = y0 - 1;
    for (let x = x0 + 1; w > 1; y -= 2, w -= 4, x += 2) for (let sx = x; sx + 2 <= x + w; sx += 3) { r(sx, y - 1, 3, 2, SG); r(sx, y - 1, 2, 1, SL); r(sx + 2, y, 1, 1, SK); }   // 積んだ石
  };
  barrel(28, 45, 20, 38); r(27, 39, 20, 4, '#b8402e'); h(39, 27, 46, '#d0583e');
  barrel(2, 24, 16, 40); r(1, 41, 25, 4, '#b8402e'); h(41, 1, 25, '#d0583e'); r(3, 45, 3, 3, '#8a2e20'); r(20, 45, 3, 3, '#8a2e20');
  r(0, 45, 48, 3, '#8a8680');
});
// デンパーク（安城）：こい緑の屋根に白い三角の飾り窓が並ぶ建物と、黄色い波板のひさし、緑の柱、うしろの針葉樹
spotSprites.denpark = hiCanvas((r, h) => {
  const RF = '#3e5a46', RH = '#56745e', YL = '#d8c040', YD = '#b8a020';
  for (const x of [4, 14, 36, 44]) { spanRows(h, 0, [[x, x], [x - 1, x + 1], [x - 1, x + 1], [x - 2, x + 2], [x - 2, x + 2], [x - 3, x + 3], [x - 3, x + 3], [x - 3, x + 3]], '#2f5a34'); r(x, 8, 1, 3, '#5a4030'); }
  spanRows(h, 10, [[6, 41], [5, 42], [4, 43], [3, 44], [2, 45], [1, 46]], i => i < 2 ? RH : RF);
  for (const x of [12, 24, 36]) { spanRows(h, 6, [[x, x + 1], [x - 1, x + 2], [x - 2, x + 3], [x - 3, x + 4], [x - 4, x + 5]], RF); spanRows(h, 8, [[x, x + 1], [x - 1, x + 2], [x - 2, x + 3]], '#f0ece0'); r(x, 9, 2, 2, '#c84a3a'); }   // 三角の飾り窓
  r(0, 16, 48, 4, YL); for (let x = 1; x < 48; x += 2) r(x, 16, 1, 4, YD); h(20, 0, 47, '#8a7a20');
  r(2, 21, 44, 12, '#3a3630'); for (let x = 4; x < 45; x += 5) r(x, 22, 3, 8, '#5a6a72');
  for (const x of [1, 12, 24, 35, 46]) r(x, 20, 1, 14, '#3f7a3a');
  r(0, 33, 48, 2, '#9a968c'); r(0, 35, 48, 13, '#4a4a4c'); for (const x of [8, 22, 36]) r(x, 40, 8, 1, '#e8e8e4');
});
// 碧南海浜水族館：白い建物に青い帯が2本、屋上の塔に青い魚のマーク、正面の黒いパーゴラと、れんがの広場
spotSprites.hekinanAquarium = hiCanvas((r, h) => {
  const WH = '#f0f2f4', WS = '#c8d0d8', BL = '#2a5fae', BL2 = '#4a8ad0';
  r(16, 2, 14, 9, '#d0d8e0'); r(18, 3, 4, 5, BL); r(24, 3, 4, 5, BL); r(19, 4, 2, 2, WH); r(25, 4, 2, 2, WH);   // 魚のマーク
  r(10, 3, 2, 8, WS);
  r(0, 10, 34, 22, WH); r(0, 10, 34, 1, '#d8dce0'); h(14, 0, 33, BL); h(15, 0, 33, BL); h(19, 0, 33, BL2);
  r(34, 16, 14, 16, WH); spanRows(h, 12, [[36, 46], [35, 47], [34, 47], [34, 47]], '#8a96a0'); for (let x = 35; x < 47; x += 2) r(x, 13, 1, 3, '#d8dce4'); h(20, 34, 47, BL);
  r(36, 22, 10, 10, '#2a3440'); for (const x of [38, 42]) r(x, 22, 1, 10, WS);
  for (const x of [2, 9, 16, 23, 30]) r(x, 22, 1, 13, '#2a2a2e'); h(22, 0, 32, '#2a2a2e'); h(23, 0, 32, '#4a4a50');   // パーゴラ
  r(0, 32, 48, 16, '#a86a52'); for (let y = 34; y < 48; y += 3) for (let x = (y % 2) * 3; x < 48; x += 6) r(x, y, 4, 1, '#c88a6a');
  r(30, 34, 10, 4, WH); r(31, 32, 8, 2, '#3f8a34'); r(33, 28, 2, 4, '#6a6a6a');
});
// 高浜市やきものの里 かわら美術館：うすい茶色の段々の建物（赤茶の帯）と、のこぎり屋根のような三角の妻、手前の木と鬼瓦の像
spotSprites.kawaraMuseum = hiCanvas((r, h) => {
  const BN = '#c8b8a4', BS = '#a89480', ST = '#9a5a4a', TP = '#d8c8b4';
  r(8, 18, 40, 20, BN); r(16, 12, 32, 7, BN); r(26, 7, 22, 6, BS);
  for (const [x0, y] of [[16, 12], [26, 7]]) for (let x = x0 + 1; x < 45; x += 7) spanRows(h, y - 4, [[x + 2, x + 3], [x + 1, x + 4], [x, x + 5], [x, x + 5]], TP);   // 三角の妻（のこぎり屋根）
  for (const y of [15, 21, 26, 31]) h(y, 8, 47, ST); h(10, 26, 47, ST);
  for (let x = 22; x < 47; x += 4) r(x, 22, 1, 12, BS);
  r(16, 32, 28, 6, '#3a3a3e'); h(31, 14, 45, '#8a7a6a'); for (const x of [22, 30, 38]) r(x, 32, 1, 6, '#9aa0a6');
  r(0, 6, 11, 18, '#3f8a34'); r(2, 8, 5, 3, '#5aaa44'); r(6, 14, 4, 3, '#5aaa44'); r(5, 24, 2, 14, '#5a4030');   // 手前の木
  for (const x of [12, 40]) { r(x, 33, 5, 6, '#6a6a68'); r(x + 1, 31, 3, 2, '#7a7a78'); r(x + 1, 34, 1, 1, '#2a2a2a'); r(x + 3, 34, 1, 1, '#2a2a2a'); }   // 鬼瓦の像
  r(0, 38, 48, 3, '#c84a3a'); h(38, 0, 47, '#e85a4a'); r(0, 41, 48, 7, '#9a9894');
});
// 実相寺 釈迦堂：灰色がかった茶色の、こけらぶきの大きな寄棟屋根。黒っぽい板の壁、手前の木の柵、まわりの松
spotSprites.jissoji = hiCanvas((r, h) => {
  for (const [x, y] of [[0, 0], [38, 1], [3, 5], [41, 6]]) { pix(r, PINE, x, y, '#2f5a34'); h(y, x + 2, x + 4, '#4f7a4a'); }
  r(3, 9, 2, 26, '#5a4636'); r(43, 10, 2, 25, '#5a4636');
  for (let y = 8; y < 22; y++) { const k = y - 8, a = Math.round(17 - k * 1.1), b = Math.round(30 + k * 1.1); h(y, a, b, y < 12 ? '#b0a8a4' : y < 18 ? '#968c88' : '#847a76'); for (let x = a + 1 + (y % 2); x < b; x += 2) r(x, y, 1, 1, y < 12 ? '#a09894' : '#7a706c'); }
  r(18, 6, 12, 2, '#6a605c'); h(22, 0, 47, '#4a403c'); h(23, 2, 45, '#2a2420');
  r(6, 24, 36, 13, '#2a2226'); for (const x of [6, 13, 20, 27, 34, 41]) r(x, 24, 2, 13, '#4a3a32'); for (let x = 15; x < 33; x += 2) r(x, 27, 1, 8, '#3a2e28');
  h(37, 4, 43, '#7a7068'); for (let x = 2; x < 46; x += 3) r(x, 38, 1, 5, '#4a4a50'); h(39, 0, 47, '#4a4a50'); h(42, 0, 47, '#4a4a50');   // 木の柵
  r(0, 43, 48, 5, '#a8a49a');
});
// 久麻久神社：石段の上の拝殿（銀ねずの瓦、茶色い木の社殿、白い紙垂）と、両わきの石の玉垣・木
spotSprites.kumakuJinja = hiCanvas((r, h) => {
  const RC = ['#c8ccd2', '#9aa0a8', '#4a4e56', '#868c94'], WD = '#7a5a48', DK = '#3a2a24';
  for (const x of [0, 38]) { r(x, 0, 10, 16, '#3f6a34'); r(x + 2, 1, 5, 3, '#5a8a44'); }
  tileRoof(r, h, 3, [[14, 33], [12, 35], [10, 37], [8, 39], [6, 41], [5, 42]], RC); spanRows(h, 3, [[22, 25], [21, 26], [20, 27]], '#e8e4dc');
  r(9, 9, 30, 13, WD); r(16, 11, 16, 11, DK); for (const x of [9, 15, 32, 38]) r(x, 9, 1, 13, '#9a7a62'); h(12, 17, 30, '#e8dcc0'); for (const x of [19, 24, 29]) r(x, 13, 1, 2, '#ffffff');
  r(23, 9, 2, 2, '#c8a050'); h(22, 6, 41, '#8a8682'); for (let x = 7; x < 41; x += 3) r(x, 20, 1, 2, '#c84a3a');
  for (let i = 0; i < 13; i++) h(23 + i * 2, 17 - i, 30 + i, i % 2 ? '#7a7672' : '#9a9692'), h(24 + i * 2, 17 - i, 30 + i, '#5a5652');   // 石段
  for (const s of [-1, 1]) for (let i = 0; i < 12; i++) r(s < 0 ? 15 - i : 32 + i, 23 + i * 2, 1, 3, '#b8b4ac');   // 石の手すり
  r(0, 26, 6, 22, '#8a8682'); r(42, 26, 6, 22, '#8a8682'); for (let y = 28; y < 48; y += 4) { h(y, 0, 5, '#a8a49e'); h(y, 42, 47, '#a8a49e'); }
});
// 長圓寺：苔むした広い石段をのぼった先の山門（瓦屋根・こげ茶の柱）と、両わきの白い土塀、うっそうとした木
spotSprites.choenji = hiCanvas((r, h) => {
  r(0, 0, 14, 20, '#2f5a2a'); r(34, 0, 14, 20, '#2f5a2a'); for (const [x, y] of [[2, 2], [8, 8], [36, 3], [42, 10]]) r(x, y, 4, 3, '#4f7a3e');
  r(4, 11, 40, 7, '#f0ece2'); tileRoof(r, h, 9, [[3, 44], [3, 44]], ['#5a5e64', '#5a5e64', '#2e3238', '#4a4e54']); for (let y = 13; y < 18; y += 2) h(y, 4, 43, '#d8d4ca');
  tileRoof(r, h, 2, [[17, 30], [15, 32], [13, 34], [12, 35], [11, 36]], ['#7a7e86', '#4e5150', '#2a2d2c', '#5e6160']); r(23, 0, 2, 2, '#3a3d3c');
  r(14, 7, 2, 11, '#4a3628'); r(32, 7, 2, 11, '#4a3628'); r(16, 8, 16, 10, '#1a1612'); r(19, 10, 10, 8, '#3a4a2a');   // 門の奥の緑
  for (let y = 18; y < 48; y++) { const k = y - 18, a = Math.max(0, 13 - Math.round(k * 0.5)), b = Math.min(47, 34 + Math.round(k * 0.5)); const t = k % 3; h(y, a, b, t === 0 ? '#9aa07e' : t === 1 ? '#7a7d5b' : '#5a5e44'); }   // 苔むした石段
  for (let y = 20; y < 48; y += 3) for (let x = 6 + (y % 2) * 4; x < 42; x += 8) r(x, y, 3, 1, '#6a8a3a');
});
// 養寿寺：銀ねずの瓦の大屋根の本堂と、右の反った屋根の鐘つき堂、白い砂利の境内
spotSprites.yojuji = hiCanvas((r, h) => {
  const RC = ['#c8ccd2', '#9aa0a8', '#4a4e56', '#868c94'], WD = '#8a7a6a', DK = '#3a3230';
  tileRoof(r, h, 6, [[6, 24], [4, 26], [2, 28], [1, 29], [0, 30], [0, 30]], RC); spanRows(h, 4, [[13, 17], [12, 18]], RC[1]); spanRows(h, 7, [[14, 16], [13, 17]], '#e8e4dc');
  r(2, 12, 26, 15, WD); r(8, 15, 14, 12, DK); for (const x of [2, 7, 22, 27]) r(x, 12, 1, 15, '#a8988a'); for (let x = 9; x < 21; x += 2) r(x, 15, 1, 6, '#5a4e46');
  spanRows(h, 8, [[34, 41], [32, 43], [31, 44], [30, 45]], i => i === 3 ? RC[2] : RC[1]); r(30, 10, 1, 1, RC[2]); r(45, 10, 1, 1, RC[2]); r(36, 6, 4, 2, RC[0]);   // 鐘つき堂の反った屋根
  for (const x of [32, 43]) r(x, 12, 2, 14, '#6a5a4a'); r(35, 13, 6, 6, '#5a7a62'); h(18, 35, 40, '#3a5a44'); r(37, 12, 2, 1, '#333'); r(31, 22, 14, 4, '#9a968c');
  r(0, 27, 48, 21, '#c8c4bc'); for (const [x, y] of [[4, 32], [16, 38], [30, 34], [40, 42], [8, 44]]) r(x, y, 3, 1, '#a8a49c');
});
// 紅樹院（茶祖の寺）：銀ねずの瓦の大きな入母屋屋根、黒っぽい木の正面、石灯籠と、手前の茶の木
spotSprites.kojuin = hiCanvas((r, h) => {
  const RC = ['#b8bcc2', '#8a8e94', '#3a3e44', '#7a7e84'];
  tileRoof(r, h, 4, [[14, 33], [12, 35], [10, 37], [8, 39], [6, 41], [4, 43], [2, 45], [1, 46]], RC); spanRows(h, 5, [[22, 25], [21, 26], [20, 27], [19, 28]], '#e8e4dc');
  r(5, 12, 38, 14, '#5a4a40'); r(12, 15, 24, 11, '#1d1d22'); for (const x of [5, 11, 36, 42]) r(x, 12, 1, 14, '#7a6a5a'); for (let x = 13; x < 35; x += 3) r(x, 15, 1, 6, '#3a3430');
  r(40, 22, 3, 8, '#9a968c'); r(39, 21, 5, 2, '#b8b4ac');
  r(0, 26, 48, 4, '#b8b2a6');
  for (const y of [30, 37]) { h(y, 1, 46, '#7fc65e'); r(0, y + 1, 48, 3, '#3f8f3a'); h(y + 4, 0, 47, '#2a5f28'); if (y < 37) { h(y + 5, 0, 47, '#a88a62'); h(y + 6, 0, 47, '#a88a62'); } for (let x = 2 + (y % 2) * 3; x < 46; x += 6) h(y - 1, x, x + 2, '#7fc65e'); }
  r(0, 42, 48, 6, '#a88a62');
});
// 一色学びの館：茶色がかった灰色の丸い筒形の塔（左が日なた、右が日かげ）と、白い列柱の低い建物、駐車場
spotSprites.isshikiManabi = hiCanvas((r, h) => {
  for (let x = 16; x < 36; x++) { const t = (x - 16) / 19, c = t < 0.25 ? '#c8b8ac' : t < 0.6 ? '#a8968a' : t < 0.85 ? '#8a786e' : '#6a5a52'; r(x, 4, 1, 26, c); }
  h(3, 17, 34, '#d8c8bc'); h(4, 16, 35, '#7a6a60'); for (let y = 9; y < 30; y += 5) h(y, 16, 35, '#9a887c');
  r(0, 25, 48, 13, '#d8d2c8'); h(25, 0, 47, '#e8e2d8'); h(26, 0, 47, '#b8b2a8');
  for (let x = 1; x < 47; x += 5) { r(x, 27, 2, 11, '#f0ece4'); r(x + 2, 27, 3, 10, '#4a4a46'); }
  r(0, 38, 48, 10, '#7a7a78'); for (let x = 3; x < 48; x += 8) r(x, 40, 1, 6, '#f4f4f4'); r(40, 34, 8, 4, '#2a6ac0'); r(41, 35, 6, 1, '#d8e4f4');   // バス
});
// 佐久島の港：「三河湾の黒真珠 佐久島」と書いた白い縦長の看板、黒い板の小屋、砂浜と港の海
spotSprites.sakushimaPort = hiCanvas((r, h) => {
  r(0, 22, 48, 26, '#6a8a9a'); for (const [x, y] of [[3, 26], [14, 30], [6, 34]]) h(y, x, x + 4, '#8aaab8');
  spanRows(h, 30, Array.from({ length: 18 }, (_, i) => [Math.max(0, 22 - i * 2), 47]), '#c8c0a4'); for (const [x, y] of [[26, 38], [34, 44], [20, 46]]) r(x, y, 3, 1, '#a8a088');
  spanRows(h, 4, [[28, 45], [27, 46], [26, 47]], '#3a3c40'); r(28, 7, 18, 19, '#2e2a2c'); for (let x = 29; x < 46; x += 3) r(x, 7, 1, 19, '#3e3a3c'); r(30, 11, 6, 5, '#7a7a74'); r(38, 18, 5, 8, '#1a1618');
  r(19, 1, 8, 30, '#f4f4f2'); r(19, 1, 1, 30, '#c8c8c4'); r(21, 0, 4, 1, '#e8e8e4');
  for (let y = 3; y < 28; y += 2) r(22, y, 2, 1, y < 13 ? '#2a3a6a' : '#1a1a1a'); r(18, 31, 10, 2, '#8a8680');
  r(4, 25, 10, 2, '#e8e2d0'); r(5, 24, 3, 1, '#c84a3a');   // 舟
});
// 大浦海水浴場（佐久島）：草地の中の高床の木の見はらし小屋（寄棟の屋根・はしご段）と、浜へ下りる白い小道
spotSprites.ouraBeach = hiCanvas((r, h) => {
  r(0, 24, 48, 24, '#8aa86a'); for (const [x, y] of [[4, 28], [30, 30], [40, 40], [10, 42]]) h(y, x, x + 5, '#a8c48a');
  spanRows(h, 30, Array.from({ length: 18 }, (_, i) => [14 - Math.round(i * 0.6), 20 + Math.round(i * 0.7)]), '#d8d2b8');
  spanRows(h, 2, [[24, 33], [21, 36], [19, 38], [18, 39]], i => i === 3 ? '#2a2420' : '#4a3e34');
  r(20, 6, 18, 2, '#5a4a3a'); for (let x = 21; x < 38; x += 3) r(x, 8, 1, 5, '#6a5a48'); h(8, 20, 37, '#6a5a48'); r(20, 13, 18, 2, '#7a6650');
  for (const x of [21, 36]) r(x, 15, 2, 15, '#4a3e34'); r(28, 15, 2, 15, '#5a4a3a');
  for (let i = 0; i < 12; i++) r(38 + Math.floor(i / 2), 14 + i, 3, 1, '#7a6650');   // はしご段
  r(0, 16, 14, 9, '#3f7a34'); r(2, 15, 9, 2, '#5a9a44'); r(40, 18, 8, 7, '#3f7a34');
});
// 黄金堤（吉良）：草の土手の上に、こんもりした桜の並木がずっと続く。手前の道と白いさく
spotSprites.koganeZutsumi = hiCanvas((r, h) => {
  for (let i = 0; i < 6; i++) { const x = i * 8 - 1, y = 6 + (i % 2) * 2; spanRows(h, y, [[x + 2, x + 8], [x, x + 10], [x, x + 10], [x, x + 10], [x + 1, x + 9], [x + 2, x + 8]], '#4a7a3a'); r(x + 2, y + 1, 4, 2, '#6a9a54'); r(x + 5, y + 6, 1, 6, '#5a4434'); }
  spanRows(h, 16, [[0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47]], i => i < 2 ? '#7aa25a' : i < 5 ? '#6a9a4a' : '#5a8a3e');   // 土手の斜面
  r(0, 24, 48, 12, '#9a9690'); for (let x = 2; x < 48; x += 9) r(x, 29, 5, 1, '#b8b4ae');
  h(34, 0, 47, '#f4f4f2'); for (let x = 1; x < 48; x += 4) r(x, 34, 1, 5, '#f4f4f2'); h(37, 0, 47, '#e8e8e4');
  r(0, 39, 48, 9, '#6a9a4a'); r(4, 18, 6, 5, '#f0ece0'); r(5, 19, 4, 2, '#c84a3a'); r(6, 23, 1, 4, '#5a5a5a');   // 案内板
});
// 尾﨑士郎記念館（吉良）：銀ねずの瓦屋根の白い建物（黒いわく・白い柱の玄関）と、前の石の台にのった胸像、ヤシの幹
spotSprites.ozakiShiro = hiCanvas((r, h) => {
  const RC = ['#7a8088', '#4a5058', '#24282e', '#3a4048'];
  for (let k = 0; k < 12; k++) h(4 + k, 26 - k * 2, 27 + k * 2, k < 2 ? RC[2] : RC[1]); for (let k = 2; k < 12; k++) h(4 + k, 28 - k * 2, 25 + k * 2, '#f4f2ec');   // 正面の大きな破風
  r(22, 8, 6, 3, '#2a2a2a');
  tileRoof(r, h, 14, [[1, 47], [0, 47], [0, 47]], RC);
  r(2, 17, 44, 22, '#f4f2ec'); r(2, 17, 6, 22, '#d8d6d0'); for (let y = 30; y < 39; y += 3) h(y, 2, 45, '#c8ccd4');
  r(10, 20, 3, 18, '#ffffff'); r(9, 20, 1, 18, '#c8c8c4'); r(14, 21, 7, 17, '#1a1a1a'); r(30, 22, 12, 9, '#2a2a2a'); for (let x = 31; x < 42; x += 2) r(x, 22, 1, 9, '#5a5a5a');
  r(24, 31, 9, 13, '#c8c4bc'); h(31, 24, 32, '#e0dcd4'); spanRows(h, 22, [[26, 30], [25, 31], [24, 32], [24, 32], [25, 31], [23, 33], [22, 34], [22, 34], [22, 34]], '#6a5a46'); r(26, 23, 4, 3, '#8a7a62');   // 胸像
  r(40, 0, 3, 39, '#8a7a6a'); for (let y = 2; y < 39; y += 3) r(40, y, 3, 1, '#6a5a4a');   // ヤシの幹
  r(0, 39, 48, 9, '#b8b4ac'); pix(r, ['..####..', '.######.', '########'], 2, 36, '#3f7a34');
});
// 幡頭神社（吉良）：明るい灰色の大きな石の鳥居、奥へまっすぐのびる石だたみの参道、右に「幡頭神社」の石柱、松林
spotSprites.hazuJinja = hiCanvas((r, h) => {
  const ST = '#c8c4bc', SL = '#e0dcd4', SD = '#9a968e';
  r(0, 4, 10, 30, '#2f5a2a'); r(36, 4, 12, 30, '#2f5a2a'); for (const [x, y] of [[2, 6], [38, 8], [42, 18], [4, 20]]) r(x, y, 4, 3, '#4f7a3e');
  h(5, 4, 39, ST); h(4, 5, 38, SL); r(3, 3, 2, 2, ST); r(39, 3, 2, 2, ST); h(6, 6, 37, SD);   // 笠木
  h(10, 8, 35, ST); h(11, 8, 35, SD); r(19, 7, 6, 3, '#4a4a4a');   // 貫と額
  r(10, 7, 4, 28, ST); r(10, 7, 1, 28, SL); r(13, 7, 1, 28, SD); r(30, 7, 4, 28, ST); r(30, 7, 1, 28, SL); r(33, 7, 1, 28, SD);
  r(9, 34, 6, 3, SD); r(29, 34, 6, 3, SD);
  spanRows(h, 14, Array.from({ length: 34 }, (_, i) => [20 - Math.round(i * 0.45), 23 + Math.round(i * 0.45)]), '#a8a49c'); for (let y = 16; y < 48; y += 3) h(y, 20 - Math.round((y - 14) * 0.45), 23 + Math.round((y - 14) * 0.45), '#8a867e');
  r(38, 2, 6, 40, '#b8b4aa'); r(38, 2, 1, 40, '#d0ccc2'); for (let y = 6; y < 38; y += 5) r(40, y, 2, 3, '#3a3a3a');   // 社名の石柱
  r(0, 34, 18, 14, '#a88a5a'); r(28, 38, 10, 10, '#a88a5a'); r(44, 38, 4, 10, '#a88a5a');
});
// 名鉄 西幡豆駅：茶色い寄棟屋根の小さな木の駅舎（クリーム色の板壁、こげ茶のわく、出窓）、青い駅名の看板、赤いポスト
spotSprites.nishiHazu = hiCanvas((r, h) => {
  const RC = ['#8a7a6a', '#6a5a4a', '#3a2e24', '#5a4a3c'], WL = '#efe6d2', FR = '#6a3a2a';
  tileRoof(r, h, 6, [[12, 37], [9, 40], [6, 43], [4, 45], [2, 46], [1, 47]], RC);
  r(3, 12, 42, 24, WL); for (let y = 14; y < 36; y += 2) h(y, 3, 44, '#d8ceb8'); for (const x of [3, 12, 44]) r(x, 12, 1, 24, FR);
  r(26, 13, 14, 5, '#ffffff'); r(27, 14, 3, 3, '#2a8ad0'); for (let x = 31; x < 39; x += 2) r(x, 15, 1, 1, '#2a5a8a');   // 駅名の看板
  r(14, 19, 32, 2, FR); r(14, 21, 32, 13, '#e8e0cc'); for (const x of [14, 22, 31, 39, 45]) r(x, 21, 1, 13, FR); for (const x of [24, 33, 41]) r(x, 23, 6, 7, '#9ab4c4');   // 出窓
  r(15, 23, 5, 11, '#5a6a72'); r(16, 24, 3, 4, '#c8d4dc');
  r(0, 26, 6, 10, '#3f7a34'); r(1, 25, 4, 1, '#5a9a44');
  r(44, 25, 3, 6, '#d23a2e'); r(45, 31, 1, 5, '#555'); h(36, 0, 47, '#9a9a96'); r(0, 37, 48, 11, '#8a8a88');
});
// 名鉄 東幡豆駅：赤いトタン屋根の長い駅舎、白とうすいピンクの壁、駅名の看板、赤いポスト、改札口
spotSprites.higashiHazu = hiCanvas((r, h) => {
  const RD = '#c84a3a', RL = '#e06a50', RS = '#8a2e22';
  spanRows(h, 8, [[8, 40], [6, 42], [4, 44], [2, 46], [1, 47], [0, 47]], i => i < 2 ? RL : RD); for (let x = 2; x < 47; x += 2) r(x, 9, 1, 5, RS); h(14, 0, 47, RS);
  r(1, 15, 46, 20, '#f0e8e4'); r(1, 15, 46, 2, '#d8d0cc'); h(26, 1, 46, '#c88a8a');
  r(16, 10, 14, 6, '#ffffff'); r(17, 11, 3, 2, '#3f9a5a'); for (let x = 21; x < 29; x += 2) r(x, 12, 1, 2, '#2a2a2a'); h(15, 16, 29, '#3f9a5a');
  r(3, 18, 8, 7, '#7a9ab0'); r(13, 18, 6, 17, '#3a4650'); r(22, 18, 9, 7, '#7a9ab0'); r(34, 18, 9, 7, '#9ab4c4');
  r(24, 27, 4, 7, '#3fae5a'); r(25, 28, 2, 3, '#e8f4e8'); r(30, 28, 3, 5, '#d23a2e'); r(31, 33, 1, 2, '#555');
  r(0, 35, 48, 13, '#8a8a88'); for (const x of [6, 22, 38]) r(x, 40, 6, 1, '#a8a8a4');
});
// 鳥羽神明社：銀ねずの瓦の拝殿に、黒い紋の白い幕。石垣と石段、両わきに白いのぼりと木の幟立て
spotSprites.tobaShinmei = hiCanvas((r, h) => {
  const RC = ['#c8ccd2', '#9aa0a8', '#4a4e56', '#868c94'];
  r(0, 0, 48, 10, '#2f5a2a'); for (const [x, y] of [[4, 2], [16, 1], [28, 3], [40, 1]]) r(x, y, 5, 3, '#4f7a3e');
  tileRoof(r, h, 6, [[14, 33], [11, 36], [9, 38], [7, 40], [6, 41]], RC); spanRows(h, 6, [[22, 25], [21, 26]], '#e8e4dc');
  r(9, 11, 30, 11, '#7a5a40'); r(10, 13, 28, 6, '#f8f8f6'); for (let x = 10; x < 38; x += 4) r(x, 13, 1, 6, '#d8d8d4');
  for (const x of [14, 22, 30]) { r(x, 14, 4, 4, '#1a1a1a'); r(x + 1, 15, 2, 2, '#f8f8f6'); }   // 黒い紋
  r(20, 19, 8, 3, '#3a2a20');
  r(4, 22, 40, 8, '#9a968c'); for (let y = 24; y < 30; y += 2) h(y, 4, 43, '#7a766c'); for (let x = 6; x < 44; x += 5) r(x, 22, 1, 8, '#7a766c');   // 石垣
  for (let i = 0; i < 9; i++) h(22 + i, 18 - i, 29 + i, i % 2 ? '#8a8682' : '#aaa6a0');
  for (const x of [1, 44]) { r(x, 6, 3, 26, '#f8f8f6'); for (let y = 8; y < 30; y += 3) r(x + 1, y, 1, 2, '#1a1a1a'); r(x + 3, 6, 1, 36, '#6a5040'); }
  r(0, 31, 48, 17, '#b8b2a6'); for (const [x, y] of [[8, 36], [30, 40], [16, 44]]) r(x, y, 3, 1, '#9a9488');
});
// 旧糟谷邸（吉良）：こぶのある太い幹を広げる大きなイスノキと、白い立て札。左に黒い板壁の古い家
spotSprites.kasuyaTei = hiCanvas((r, h) => {
  r(0, 4, 12, 34, '#2a2522'); for (let x = 1; x < 12; x += 3) r(x, 4, 1, 34, '#3c3632'); tileRoof(r, h, 1, [[0, 13], [0, 14], [0, 15]], ['#6a6e74', '#4a4e54', '#2e3238', '#5a5e64']);
  spanRows(h, 0, [[18, 40], [14, 44], [12, 46], [11, 47], [12, 47], [13, 46], [14, 45], [16, 43], [18, 40], [21, 36], [24, 33]], '#3f6a34'); for (const [x, y] of [[16, 2], [26, 1], [36, 3], [30, 6], [20, 6], [41, 5]]) r(x, y, 5, 2, '#5a8a44');   // 大きく広がる葉
  r(25, 16, 7, 24, '#7a6a5a'); r(25, 16, 2, 24, '#9a8a78'); r(29, 22, 2, 8, '#5a4a3c');   // 幹
  for (let i = 0; i < 8; i++) { r(25 - i, 16 - i, 2, 1, '#7a6a5a'); r(31 + i, 15 - i, 2, 1, '#7a6a5a'); r(28, 12 - i, 1, 1, '#7a6a5a'); }   // 枝
  r(20, 38, 18, 3, '#4a6a3a'); for (let x = 19; x < 39; x += 3) r(x, 40, 2, 2, '#a8a49c');
  r(14, 22, 7, 6, '#f8f8f6'); spanRows(h, 20, [[16, 18], [15, 19]], '#e8e8e4'); r(17, 28, 1, 12, '#c8c8c4');   // 立て札
  r(0, 38, 48, 10, '#d8d0c0'); for (const [x, y] of [[4, 42], [40, 44], [10, 46]]) r(x, y, 3, 1, '#b8b0a0');
});
// 八ツ面山：冬木立の中の展望台（白い床の段と、うす茶色のれんがの壁、手すりのある見晴らし台）
spotSprites.yatsuomote = hiCanvas((r, h) => {
  r(14, 6, 22, 3, '#f0ece4'); h(9, 14, 35, '#a8a49c'); r(16, 10, 18, 6, '#c8a07a'); for (let x = 17; x < 34; x += 3) r(x, 10, 1, 6, '#a8805a');
  r(12, 16, 26, 3, '#f0ece4'); h(19, 12, 37, '#a8a49c'); for (let x = 13; x < 37; x += 2) r(x, 14, 1, 2, '#5a5a5a');   // 見晴らし台の手すり
  r(17, 20, 16, 10, '#c8a07a'); r(17, 20, 3, 10, '#d8b890'); for (let y = 22; y < 30; y += 2) h(y, 17, 32, '#b08a64'); r(24, 23, 3, 4, '#3a3a3a');
  r(15, 30, 20, 3, '#f0ece4'); r(19, 33, 12, 9, '#e8e4dc'); r(23, 35, 4, 7, '#4a4a4a');
  for (const [x0, d] of [[6, 1], [42, -1]]) { r(x0, 10, 2, 32, '#5a4a40'); for (let i = 0; i < 8; i++) { r(x0 + d * i, 18 - i, 1, 1, '#6a5a4c'); r(x0 + d * (i + 1), 26 - i, 1, 1, '#6a5a4c'); } }   // 冬木立
  r(0, 42, 48, 6, '#7a6a52'); for (let x = 2; x < 48; x += 5) r(x, 42, 2, 2, '#9a8a6a');
});
// ---- 48×48 の名所の絵（4回目：専用の絵がなかった注目スポット。Wikimedia Commons の写真を見て、色と比率を写真に合わせて描いたもの） ----
// 康全寺：青みのある瓦の入母屋の本堂、白い漆喰に黒い木の柱、茶色の板戸。右に大きなヒマラヤスギ、左に冬木
spotSprites.kozenji = hiCanvas((r, h) => {
  const W = '#f0efea', K = '#3a3634';
  h(4, 13, 34, '#3e4450'); r(12, 2, 2, 2, '#3e4450'); r(34, 2, 2, 2, '#3e4450');
  tileRoof(r, h, 5, [[12, 35], [11, 36], [10, 37], [9, 38], [8, 39], [7, 40], [6, 41], [5, 42], [4, 43], [3, 44], [2, 45], [1, 46]], ['#9aa6b6', '#6e7888', '#3e4450', '#59606c']);
  r(4, 17, 40, 19, W); h(17, 4, 43, K); h(22, 4, 43, K); h(35, 4, 43, K);
  for (const x of [4, 10, 16, 31, 37, 43]) r(x, 17, 1, 19, K);
  r(18, 24, 12, 11, '#8a6848'); for (let x = 20; x < 30; x += 3) r(x, 24, 1, 11, '#6a4e34'); h(24, 18, 29, '#6a4e34');
  r(7, 25, 5, 5, '#5a5048'); r(8, 24, 3, 1, '#5a5048'); r(8, 26, 3, 3, '#8a8078');   // 花頭窓
  r(5, 36, 38, 2, '#8a867c');
  spanRows(h, 3, [[38, 41], [36, 43], [35, 44], [34, 45], [33, 46], [32, 46], [32, 47], [31, 47], [31, 47], [30, 47], [30, 47], [29, 47], [29, 47], [30, 47], [30, 47], [31, 47], [31, 46], [32, 46], [33, 45], [34, 44], [35, 43], [36, 42]], '#5d6a25');   // ヒマラヤスギ
  for (let y = 4; y < 25; y++) for (let x = 30 + (y * 7) % 3; x < 47; x += 3) { const v = (x * 13 + y * 7) % 5; if (v === 0) r(x, y, 1, 1, '#8a9a3a'); else if (v === 1) r(x, y, 1, 1, '#3b4a17'); }
  r(38, 25, 2, 15, '#5a4030');
  r(3, 6, 1, 30, '#7a6a5a'); for (const [x, y] of [[1, 8], [4, 11], [0, 14], [5, 9]]) r(x, y, 1, 5, '#7a6a5a');   // 冬木
  r(0, 38, 48, 10, '#a8a090'); spanRows(h, 38, [[20, 27], [19, 28], [19, 28], [18, 29], [18, 29], [17, 30], [17, 30], [16, 31], [16, 31], [15, 32]], '#c4c0b6');
});
// 寺津八幡社：反りの大きな暗い瓦の入母屋屋根に、金の飾りの破風。手前は緑青の唐破風。しめ縄の木の拝殿と、左右の大きな石灯籠
spotSprites.terazuHachiman = hiCanvas((r, h) => {
  r(23, 1, 2, 3, '#2c2e32'); r(22, 2, 4, 1, '#c8a040');
  for (let k = 0; k < 19; k++) { const y = 4 + k, a = Math.round(23 - 1.15 * k - 1), b = Math.round(24 + 1.15 * k + 1); h(y, a, b, '#2c2e32'); if (k > 1) h(y, a + 1, Math.round(23 - 0.2 * k), '#697485'); if (k > 1) h(y, Math.round(23 - 0.2 * k) + 1, b - 1, '#4a4e56'); }
  for (let k = 4; k < 13; k++) h(4 + k, 23 - Math.round(k * 0.55), 24 + Math.round(k * 0.55), '#3a2c22');   // 破風の中の木組み
  r(22, 9, 4, 2, '#c8a040'); r(20, 13, 8, 1, '#c8a040'); r(23, 14, 2, 2, '#c8a040');
  h(22, 3, 44, '#202224'); r(2, 21, 1, 1, '#202224'); r(45, 21, 1, 1, '#202224');
  spanRows(h, 16, [[19, 28], [16, 31], [14, 33], [13, 34], [13, 34]], i => i === 4 ? '#3e6e60' : i < 2 ? '#86c0ac' : '#5f9e8a');   // 唐破風
  r(22, 17, 4, 1, '#c8a040');
  r(8, 23, 32, 14, '#56432f'); for (const x of [8, 14, 33, 39]) r(x, 23, 1, 14, '#3a2c22');
  r(15, 26, 18, 10, '#2a201a'); for (let x = 16; x < 33; x += 2) r(x, 26, 1, 10, '#4a3a2a'); r(20, 28, 8, 2, '#c8a040');
  h(24, 13, 34, '#e8dcb0'); h(25, 14, 33, '#d8c890'); for (const x of [16, 21, 26, 31]) { r(x, 26, 1, 1, '#ffffff'); r(x + 1, 27, 1, 1, '#ffffff'); }
  for (const x of [0, 40]) { r(x + 2, 19, 4, 2, '#8a8472'); r(x + 1, 21, 6, 2, '#a8a290'); r(x + 2, 23, 4, 4, '#a8a290'); r(x + 3, 24, 2, 2, '#4a443a'); r(x + 1, 27, 6, 1, '#8a8472'); r(x + 2, 28, 4, 8, '#a8a290'); r(x + 3, 30, 2, 3, '#7a7462'); r(x, 36, 8, 3, '#8a8472'); }
  r(0, 39, 48, 9, '#d9dadb'); for (let y = 41; y < 48; y += 3) h(y, 0, 47, '#c4c5c6'); spanRows(h, 39, [[16, 31], [15, 32], [14, 33]], '#e8e8e8');
});
// 平原の滝：苔むした灰色の岩壁を、ひとすじの白い滝が落ちる。下に小さな滝つぼ
spotSprites.hirabaraTaki = hiCanvas((r, h) => {
  const RK = '#7a8288', RD = '#4e555a', RL = '#9aa2a6', MS = '#7a9a5a';
  spanRows(h, 4, [[12, 34], [9, 37], [7, 39], [6, 40], [5, 41], [5, 42], [4, 42], [4, 43], [4, 43], [3, 43], [3, 44], [3, 44], [3, 44], [2, 44], [2, 45], [2, 45], [2, 45], [2, 45], [2, 45], [2, 45], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46]], RK);
  for (const [x, y, w, hh] of [[8, 8, 6, 3], [30, 6, 7, 2], [36, 14, 6, 4], [6, 20, 5, 3], [28, 22, 8, 3], [12, 30, 6, 2], [34, 32, 7, 3]]) { r(x, y, w, hh, RL); h(y + hh, x, x + w - 1, RD); }   // 岩のでこぼこ
  for (const [x, y, w, hh] of [[14, 5, 8, 2], [3, 14, 5, 4], [38, 24, 6, 4], [5, 34, 6, 3], [24, 10, 4, 2]]) r(x, y, w, hh, MS);   // 苔
  for (const [x, y] of [[20, 12], [26, 16], [10, 25], [32, 28], [16, 36]]) r(x, y, 1, 4, RD);
  r(18, 4, 3, 36, '#d8e2e6'); r(19, 4, 1, 36, '#f4f8fa'); for (let y = 8; y < 40; y += 5) r(17, y, 1, 2, '#c8d4d8');   // 滝
  spanRows(h, 40, [[8, 32], [5, 36], [5, 36], [8, 33]], '#5a7a8a'); h(40, 14, 24, '#8ab0c0'); r(17, 39, 5, 2, '#f4f8fa');
  r(34, 1, 5, 3, '#6a5a48'); spanRows(h, 0, [[33, 39]], '#8a4a3a');   // 岩の上の小さな祠
  r(0, 44, 48, 4, '#5a6a4a'); h(44, 0, 47, '#7a8a5a');
});
// 安休寺：反りのある瓦屋根の山門（灰色の木の柱、上に扁額）と、左右の白い漆喰と黒い板の塀、右に寺名の石柱
spotSprites.ankyuji = hiCanvas((r, h) => {
  const RC = ['#8a8e9a', '#60616d', '#3a3b44', '#4e4f5a'];
  for (const x0 of [0, 34]) { tileRoof(r, h, 25, [[x0 + 1, x0 + 12], [x0, x0 + 13]], ['#7a7e8a', '#60616d', '#3a3b44', '#4e4f5a']); r(x0, 27, 14, 5, '#f0eee8'); r(x0, 32, 14, 8, '#2a262e'); for (let x = x0 + 1; x < x0 + 14; x += 2) r(x, 32, 1, 8, '#3a3640'); }
  r(9, 3, 2, 2, '#3a3b44'); r(37, 3, 2, 2, '#3a3b44');
  tileRoof(r, h, 5, [[10, 37], [8, 39], [7, 40], [6, 41], [5, 42], [4, 43]], RC); r(3, 9, 1, 1, '#3a3b44'); r(44, 9, 1, 1, '#3a3b44');
  r(9, 11, 30, 3, '#4a443e'); for (let x = 10; x < 38; x += 3) r(x, 12, 2, 1, '#7a6e60');   // 組物
  r(20, 14, 8, 2, '#e8e4d8'); r(22, 14, 4, 1, '#3a3a3a');   // 扁額
  r(13, 14, 3, 27, '#7a7068'); r(32, 14, 3, 27, '#7a7068'); r(13, 14, 1, 27, '#9a9088'); h(16, 13, 34, '#5a5048');
  r(16, 17, 16, 24, '#3a3632'); spanRows(h, 26, [[18, 29], [17, 30]], '#6a6e78'); r(18, 28, 12, 6, '#5a4a3a'); r(22, 30, 4, 4, '#8a6a4a');   // 門の向こうの本堂
  r(40, 22, 3, 19, '#b0aca4'); r(40, 21, 3, 1, '#c8c4bc'); for (let y = 24; y < 38; y += 3) r(41, y, 1, 2, '#3a3a3a');
  r(0, 41, 48, 7, '#9a9a98'); r(16, 41, 16, 7, '#b8b8b4'); for (const x of [4, 36, 44]) r(x, 42, 1, 6, '#f0f0f0');
});
// 崇運寺（佐久島）：明るい灰色の瓦の大きな入母屋屋根、暗い木の本堂と縁、石灯籠と梅の木
spotSprites.suunji = hiCanvas((r, h) => {
  h(5, 15, 32, '#5d6469'); r(14, 3, 2, 2, '#5d6469'); r(32, 3, 2, 2, '#5d6469');
  tileRoof(r, h, 6, [[13, 34], [12, 35], [10, 37], [9, 38], [8, 39], [7, 40], [5, 42], [4, 43], [3, 44], [2, 45], [1, 46], [1, 46]], ['#b4bac2', '#8b919a', '#4d5459', '#7a8088']);
  for (let k = 0; k < 5; k++) h(7 + k, 22 - k, 25 + k, '#9aa0a8'); h(11, 17, 30, '#5d6469');   // 正面の破風
  r(6, 18, 36, 16, '#3a332c'); for (const x of [6, 14, 22, 25, 33, 41]) r(x, 18, 1, 16, '#6a5a48'); h(18, 6, 41, '#2a241f');
  for (const x0 of [7, 15, 26, 34]) { r(x0, 21, 6, 10, '#4a4036'); for (let x = x0; x < x0 + 6; x += 2) r(x, 21, 1, 10, '#5a4e40'); }
  r(23, 21, 2, 12, '#1f1d22'); h(33, 4, 43, '#7a6a58'); h(34, 4, 43, '#4a3e32'); for (let x = 6; x < 43; x += 6) r(x, 35, 1, 4, '#403b37');
  r(35, 27, 4, 2, '#8a857a'); r(34, 29, 6, 2, '#9a958a'); r(35, 31, 4, 2, '#5a554a'); r(36, 33, 2, 5, '#9a958a'); r(34, 38, 6, 2, '#8a857a');   // 石灯籠
  r(10, 26, 1, 14, '#5a4a40'); for (const [x, y] of [[6, 27], [12, 25], [8, 30], [14, 29]]) { r(x, y, 4, 1, '#5a4a40'); r(x + 1, y - 1, 2, 1, '#e8a0b0'); }   // 梅
  r(0, 39, 48, 9, '#8a8476'); for (let x = 2; x < 48; x += 7) r(x, 42, 4, 1, '#a09a8c');
});
// 八劔神社・神明社（佐久島）：うすい緑青の銅ぶき屋根、暗い木の拝殿と格子戸、白いのぼり、石灯籠と狛犬、石段と石垣
spotSprites.yatsurugi = hiCanvas((r, h) => {
  h(5, 15, 32, '#5a7478');
  spanRows(h, 6, [[14, 33], [12, 35], [11, 36], [9, 38], [8, 39], [6, 41], [5, 42], [3, 44], [2, 45]], i => i < 3 ? '#a8c4c8' : i < 8 ? '#88aab0' : '#5a7478');
  for (let y = 7; y < 14; y++) for (let x = 6 + ((y * 3) % 5); x < 42; x += 5) r(x, y, 1, 1, '#98b6bc');
  h(15, 2, 45, '#3a4a4c'); h(16, 4, 43, '#2a201c');
  r(7, 17, 34, 16, '#2e2824'); for (const x of [7, 15, 32, 40]) r(x, 17, 1, 16, '#4a3e34');
  r(17, 19, 14, 13, '#3a3028'); for (let x = 18; x < 31; x += 2) r(x, 19, 1, 13, '#5a4e42'); for (let y = 21; y < 32; y += 3) h(y, 17, 30, '#5a4e42');
  for (const x of [11, 35]) { r(x, 19, 2, 11, '#f4f4f0'); r(x, 20, 2, 1, '#c03030'); r(x, 23, 2, 4, '#7a4a9a'); }
  for (const x of [1, 41]) { r(x + 1, 18, 4, 2, '#8a8a84'); r(x, 20, 6, 2, '#a8a8a0'); r(x + 1, 22, 4, 3, '#a8a8a0'); r(x + 2, 23, 2, 1, '#4a4a44'); r(x, 25, 6, 1, '#8a8a84'); r(x + 1, 26, 4, 8, '#a8a8a0'); r(x, 34, 6, 2, '#8a8a84'); }
  for (const x of [13, 31]) { r(x, 29, 4, 4, '#b8b8b0'); r(x + 1, 27, 2, 2, '#b8b8b0'); }   // 狛犬
  spanRows(h, 33, [[16, 31], [15, 32], [14, 33], [13, 34]], i => i % 2 ? '#a8a8a0' : '#c8c8c0');
  r(0, 37, 48, 8, '#8a8a84'); for (const [x, y, w] of [[0, 37, 7], [8, 38, 6], [36, 37, 5], [42, 38, 6], [3, 41, 8], [34, 41, 7], [12, 41, 4]]) { r(x, y, w, 3, '#a8a8a2'); h(y, x, x + w - 1, '#c0c0ba'); }
  r(14, 37, 20, 8, '#6a6a64'); r(0, 45, 48, 3, '#5a5c5e');
});
// 華蔵寺（吉良）：横に長い本堂。明るい灰色の瓦屋根、上は白い漆喰に黒い柱のます目、下は格子の障子戸。まん中の石段と丸い植えこみ
spotSprites.kezoji = hiCanvas((r, h) => {
  r(4, 7, 2, 2, '#4a4a4c'); r(42, 7, 2, 2, '#4a4a4c'); h(9, 6, 41, '#4a4a4c');
  tileRoof(r, h, 10, [[5, 42], [4, 43], [3, 44], [2, 45], [1, 46], [0, 47], [0, 47]], ['#c4c2c4', '#a8a6a8', '#4a4a4c', '#8a888a']);
  r(2, 17, 44, 2, '#3a2a20'); for (let x = 3; x < 45; x += 2) r(x, 18, 1, 1, '#7a6a5a');
  r(2, 19, 44, 6, '#f0efea'); h(22, 2, 45, '#4a3a30'); for (let x = 2; x < 46; x += 6) r(x, 19, 1, 6, '#4a3a30');
  r(2, 25, 44, 9, '#6a5a50'); for (let x = 3; x < 46; x += 6) { r(x, 26, 5, 7, '#9a8a7a'); r(x + 2, 26, 1, 7, '#6a5a50'); h(29, x, x + 4, '#6a5a50'); }
  h(34, 1, 46, '#3a2a20'); h(35, 1, 46, '#5a4a40');
  spanRows(h, 35, [[19, 28], [18, 29], [17, 30], [16, 31], [15, 32]], i => i % 2 ? '#a8a8a4' : '#c8c8c4'); r(18, 35, 1, 5, '#e8e8e4'); r(29, 35, 1, 5, '#e8e8e4');
  for (const x of [2, 9, 34, 41]) { pix(r, ['.####.', '######', '######', '.####.'], x, 35, '#4a6a30'); h(35, x + 1, x + 3, '#6a8a44'); }
  for (const x of [13, 33]) { r(x, 25, 2, 14, '#2f5a2a'); r(x - 1, 27, 4, 2, '#3f6a32'); r(x - 1, 31, 4, 2, '#3f6a32'); }
  r(0, 40, 48, 8, '#a89a84'); h(40, 0, 47, '#b8aa94');
});
// 源徳寺（吉良）：侠客・吉良の仁吉の墓。高い石の墓碑と台石、手前に赤い屋根の小さなおおい、右に赤いわくの白い立て札
spotSprites.gentokuji = hiCanvas((r, h) => {
  r(0, 4, 18, 22, '#6a6c74'); for (let y = 6; y < 26; y += 4) h(y, 0, 17, '#7a7c84'); spanRows(h, 2, [[0, 17], [0, 18]], '#4a4c58');   // うしろの家
  r(2, 8, 4, 3, '#e8e8e8'); r(10, 8, 4, 3, '#e8e8e8');
  r(16, 3, 10, 24, '#7a7a80'); r(16, 3, 3, 24, '#9a9aa0'); h(3, 16, 25, '#aaaab0'); for (let y = 6; y < 24; y += 3) r(21, y, 2, 2, '#4a4a50');   // 墓碑と刻んだ字
  r(13, 27, 16, 4, '#9a9690'); h(27, 13, 28, '#b0aca4'); r(11, 31, 20, 5, '#8a867e'); h(31, 11, 30, '#a8a49c'); r(9, 36, 24, 5, '#7a766e');
  r(19, 32, 4, 4, '#6a5a48'); r(20, 30, 2, 2, '#e8c840'); r(18, 30, 1, 2, '#3a7a3a');   // 花立て
  for (let k = 0; k < 5; k++) h(33 + k, 7 - k, 8 + k, '#d23a2e'); r(3, 38, 10, 4, '#e8e4dc'); r(4, 38, 1, 4, '#9a9690');   // 赤い屋根のおおい
  r(32, 14, 11, 20, '#f4f4f0'); h(14, 32, 42, '#c0302a'); for (let k = 0; k < 4; k++) h(13 - k, 33 + k, 41 - k, '#c0302a'); r(32, 14, 1, 20, '#c0302a'); r(42, 14, 1, 20, '#c0302a');
  for (const [x, y] of [[37, 17], [37, 20], [37, 23], [37, 26], [35, 22], [35, 25]]) r(x, y, 1, 2, '#222');   // 「吉良仁吉之墓」
  r(36, 34, 3, 8, '#c0302a');
  r(0, 41, 48, 7, '#8a8678'); for (let x = 0; x < 10; x += 3) r(x, 36, 2, 5, '#a8a49c');
  r(26, 0, 22, 12, '#3f6a32'); r(28, 1, 8, 3, '#5a8a44'); r(40, 4, 6, 3, '#5a8a44');
});
// 正法寺古墳（吉良）：草におおわれた前方後円墳の小山と、その上の木々
spotSprites.shohojiKofun = hiCanvas((r, h) => {
  r(0, 30, 48, 18, '#9b9731'); for (const [x, y] of [[4, 34], [14, 40], [30, 36], [40, 42], [22, 44]]) r(x, y, 3, 1, '#b8b048');
  spanRows(h, 18, [[24, 40], [20, 43], [18, 45], [4, 46], [2, 47], [1, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47]], i => i < 3 ? '#7a7a2a' : i % 3 ? '#8a8a2c' : '#6a6a24');   // 前方後円墳の形の小山
  h(29, 0, 47, '#5a5a20');
  for (const [x, y, w] of [[0, 6, 10], [9, 10, 8], [36, 4, 12]]) { r(x, y, w, 8, '#3f6a2a'); r(x + 1, y, w - 3, 2, '#5a8a3a'); }
  for (const [x, y0] of [[22, 6], [30, 3], [38, 8], [16, 12]]) {   // 冬の木（細い枝がけむるように広がる）
    spanRows(h, y0, [[x - 2, x + 2], [x - 4, x + 4], [x - 5, x + 5], [x - 5, x + 5], [x - 4, x + 4], [x - 2, x + 2]], '#a89a80');
    for (let i = 0; i < 6; i++) r(x - 4 + ((i * 3) % 9), y0 + 1 + (i % 4), 1, 1, '#7a6e5a');
    r(x, y0 + 4, 1, 26 - y0, '#5a5040');
  }
  r(30, 20, 2, 10, '#36351c');
});
// 吉良温泉：緑の山すそに並ぶ白いホテルと、手前の浜と三河湾
spotSprites.kiraOnsen = hiCanvas((r, h) => {
  spanRows(h, 6, [[18, 30], [12, 36], [8, 40], [5, 44], [3, 46], [1, 47], [0, 47]], '#4f8a3a'); r(0, 13, 48, 20, '#4f8a3a'); for (const [x, y] of [[6, 10], [36, 8], [44, 16], [2, 20]]) r(x, y, 4, 2, '#6aa04a');
  r(20, 5, 20, 27, '#f2f2ee'); r(36, 5, 4, 27, '#d8d8d2'); h(5, 20, 39, '#c8c8c4'); for (let y = 8; y < 30; y += 3) for (let x = 22; x < 36; x += 3) r(x, y, 2, 1, '#6f8fa8');
  r(4, 16, 15, 16, '#ece6d8'); h(16, 4, 18, '#c4b8a4'); for (let y = 19; y < 30; y += 3) for (let x = 6; x < 18; x += 3) r(x, y, 2, 1, '#6f8fa8');
  r(41, 20, 6, 12, '#e8e8e2'); spanRows(h, 18, [[41, 46], [40, 47]], '#b84a3a'); r(43, 24, 2, 2, '#6f8fa8');
  r(0, 32, 48, 4, '#ecdcae'); h(32, 0, 47, '#d8c890');
  r(0, 36, 48, 12, '#3f8fcf'); for (const [x, y] of [[4, 39], [18, 42], [32, 38], [40, 44], [10, 45]]) h(y, x, x + 3, '#8cc0e0');
});
// 寺部城址（幡豆）：草と木にかこまれた、城跡をしめす高い石碑
spotSprites.terabeJo = hiCanvas((r, h) => {
  r(0, 4, 14, 20, '#3f6a2a'); r(1, 5, 8, 3, '#5a8a3a'); r(34, 2, 14, 22, '#3f6a2a'); r(38, 3, 8, 3, '#5a8a3a');
  r(19, 4, 10, 34, '#6a6c70'); r(26, 4, 3, 34, '#4e5054'); r(19, 4, 2, 34, '#86888c'); spanRows(h, 2, [[20, 27], [19, 28]], '#7a7c80');
  for (let y = 8; y < 32; y += 3) r(22, y, 2, 2, '#3a3c40');   // 刻んだ字
  r(16, 38, 16, 3, '#9a9c9e'); h(38, 16, 31, '#b8babc');
  spanRows(h, 34, [[6, 16], [3, 17], [1, 18], [0, 19]], '#506b3c'); spanRows(h, 34, [[32, 42], [31, 45], [30, 47], [29, 47]], '#506b3c');
  r(0, 41, 48, 7, '#506b3c'); for (const [x, y] of [[4, 43], [12, 45], [28, 43], [40, 46], [20, 46]]) r(x, y, 3, 1, '#6a8a4a');
});
// 名鉄 こどもの国駅：高架の駅。白い屋根のホームと茶色の柱、コンクリートの壁に駅名と色あざやかな看板、下に入口
spotSprites.kodomonokuniSt = hiCanvas((r, h) => {
  r(8, 5, 40, 3, '#e6e8ed'); h(8, 8, 47, '#5a5a5a'); for (const x of [10, 22, 34, 46]) r(x, 9, 1, 6, '#8a6a4a');
  r(4, 14, 44, 3, '#a8a8a0'); h(14, 4, 47, '#c4c4bc'); for (let x = 5; x < 47; x += 3) r(x, 12, 1, 2, '#c8c8c8'); h(11, 4, 47, '#c8c8c8');
  r(0, 17, 48, 21, '#8a8880'); r(0, 17, 14, 21, '#6c6d67'); for (let y = 19; y < 37; y += 4) h(y, 0, 47, '#7a7870');
  r(16, 20, 9, 3, '#f4f4f4'); for (const x of [17, 19, 21, 23]) r(x, 21, 1, 1, '#2f5fae');
  r(27, 19, 13, 5, '#ffffff'); r(28, 20, 4, 3, '#f2c230'); r(32, 20, 4, 3, '#3f9ad8'); r(36, 20, 3, 3, '#e05a5a');
  r(27, 27, 13, 11, '#e0e0dc'); r(27, 27, 13, 1, '#5a5a56'); r(32, 31, 2, 4, '#4a4a4a');   // 入口
  r(2, 30, 10, 8, '#9a9890'); r(4, 26, 3, 4, '#3f7a34'); r(3, 25, 5, 2, '#4f8a3a');
  r(0, 38, 48, 10, '#7a7a7a'); r(0, 38, 26, 4, '#a8a8a4'); for (const x of [30, 38, 46]) r(x, 44, 4, 1, '#f0f0f0'); h(41, 30, 47, '#e8e8e8');
});
// 安泰寺（家康公鎧掛けの松）：千鳥破風のある大きな瓦屋根の本堂、白い壁に黒い木組み、木の縁と階段。手前にあじさい、うしろに杉
spotSprites.antaiji = hiCanvas((r, h) => {
  for (const x of [34, 41]) { spanRows(h, 0, [[x + 2, x + 3], [x + 1, x + 4], [x + 1, x + 4], [x, x + 5], [x, x + 5], [x, x + 6], [x, x + 6], [x - 1, x + 6], [x - 1, x + 7], [x - 1, x + 7], [x - 1, x + 7], [x - 2, x + 7]], '#2f5a2a'); }
  tileRoof(r, h, 8, [[12, 36], [10, 38], [8, 40], [6, 42], [4, 44], [2, 46], [1, 47]], ['#7a8088', '#51575b', '#2e3236', '#454b50']);
  for (let k = 0; k < 9; k++) { const y = 5 + k; h(y, 24 - k - 1, 25 + k + 1, '#2e3236'); if (k > 1) h(y, 24 - k + 1, 25 + k - 1, '#c8a878'); }   // 千鳥破風
  for (let k = 3; k < 9; k++) r(24, 5 + k, 2, 1, '#6a5038'); h(13, 17, 32, '#6a5038');
  r(8, 15, 32, 16, '#f0eee8'); for (const x of [8, 16, 24, 32, 39]) r(x, 15, 1, 16, '#3a3630'); h(15, 8, 39, '#3a3630'); h(22, 8, 39, '#3a3630');
  for (const x0 of [10, 18, 26, 34]) { r(x0, 17, 5, 4, '#8a7a68'); for (let x = x0; x < x0 + 5; x += 2) r(x, 17, 1, 4, '#5a4a3a'); }
  r(10, 24, 4, 6, '#3a3630'); r(33, 24, 5, 6, '#3a3630');
  h(31, 2, 42, '#6a5038'); for (let x = 3; x < 42; x += 5) r(x, 32, 1, 6, '#5a4030'); h(33, 2, 42, '#8a6a4a');
  for (let i = 0; i < 6; i++) r(2 + i, 32 + i, 3, 1, '#8a6a4a');   // 階段
  for (const [x, y] of [[0, 39], [8, 41], [16, 40], [28, 41], [38, 39], [44, 42]]) { r(x, y, 5, 4, '#3f7a34'); r(x + 1, y, 3, 2, ['#6a7ac8', '#8a6ac8', '#5a8ad8'][x % 3]); }   // あじさい
  r(0, 44, 48, 4, '#3f7a34');
});
// 福泉寺（吉良）：反りの強い瓦屋根に鬼瓦の本堂、こげ茶の木の正面と板戸、左右に石灯籠、石畳
spotSprites.fukusenji = hiCanvas((r, h) => {
  r(10, 4, 3, 3, '#3a3a44'); r(35, 4, 3, 3, '#3a3a44'); h(6, 12, 35, '#3a3a44');
  tileRoof(r, h, 7, [[12, 35], [11, 36], [10, 37], [9, 38], [8, 39], [6, 41], [4, 43], [2, 45], [1, 46]], ['#8a8e96', '#5e626c', '#2a2a32', '#4a4e58']);
  r(1, 14, 2, 2, '#2a2a32'); r(45, 14, 2, 2, '#2a2a32'); r(14, 13, 3, 3, '#3a3a44'); r(31, 13, 3, 3, '#3a3a44');   // 鬼瓦
  r(5, 16, 38, 2, '#3a2e26'); r(7, 18, 34, 15, '#5a4a3c'); for (const x of [7, 15, 32, 40]) r(x, 18, 2, 15, '#6a5a48');
  r(18, 21, 12, 12, '#8a6848'); for (let x = 20; x < 30; x += 3) r(x, 21, 1, 12, '#6a4e34');
  r(10, 22, 4, 6, '#9aa0a4'); r(34, 22, 4, 6, '#9aa0a4'); h(33, 5, 42, '#6a5a48'); spanRows(h, 34, [[14, 33], [13, 34], [12, 35]], i => i % 2 ? '#8a8a86' : '#a8a8a4');
  r(42, 20, 6, 14, '#f0eee8'); h(20, 42, 47, '#3a3630');
  for (const x of [2, 40]) { r(x + 1, 27, 4, 2, '#d0d0c8'); r(x, 29, 6, 1, '#b0b0a8'); r(x + 1, 30, 4, 3, '#e8e8e0'); r(x + 2, 31, 2, 1, '#4a4a44'); r(x + 2, 33, 2, 5, '#d0d0c8'); r(x, 38, 6, 2, '#b0b0a8'); }
  r(0, 37, 48, 11, '#8a8a84'); spanRows(h, 37, [[18, 29], [17, 30], [17, 30], [16, 31], [16, 31], [15, 32], [15, 32], [14, 33], [14, 33], [13, 34], [13, 34]], '#b8b8b2'); for (let y = 39; y < 48; y += 2) h(y, 14, 33, '#a4a49e');
});
// 源空院：反りのある明るい灰色の瓦屋根、白い漆喰と黒い木組み、明るい木の板壁の小さなお堂。右に白い石柱
spotSprites.genkuin = hiCanvas((r, h) => {
  r(40, 6, 3, 3, '#5a5a60'); h(9, 14, 41, '#5a5a60');
  tileRoof(r, h, 10, [[13, 42], [11, 43], [9, 44], [7, 45], [5, 46], [3, 47]], ['#d0d0d0', '#b0b0b2', '#5a5a60', '#9a9a9c']);
  r(4, 16, 42, 2, '#5a4030');
  r(6, 18, 38, 8, '#f0eee8'); for (const x of [6, 16, 26, 36, 43]) r(x, 18, 1, 8, '#3a3028'); h(21, 6, 43, '#3a3028'); for (let i = 0; i < 4; i++) r(30 + i, 18 + i * 2, 1, 2, '#3a3028');
  r(6, 26, 38, 11, '#c89a60'); for (let x = 7; x < 44; x += 2) r(x, 26, 1, 11, '#b88a50');
  r(9, 27, 6, 7, '#4a5a64'); r(10, 28, 4, 2, '#8a9aa4'); r(19, 27, 8, 10, '#5a4a3a'); r(22, 28, 2, 9, '#8a7050');
  r(16, 18, 2, 19, '#4a3a2c'); r(28, 18, 2, 19, '#4a3a2c');
  r(4, 37, 42, 2, '#9a7a5a'); r(6, 39, 38, 2, '#7a6a5a');
  r(0, 22, 4, 15, '#d03a3a'); r(1, 24, 1, 8, '#f0f0f0');   // うしろの赤いのぼり
  r(40, 26, 4, 15, '#e8e8e4'); h(26, 40, 43, '#f8f8f4'); for (let y = 28; y < 38; y += 3) r(41, y, 1, 2, '#3a3a3a');
  r(0, 41, 48, 7, '#9a7a6a'); for (let x = 0; x < 48; x += 4) r(x, 43, 2, 1, '#8a6a5a'); r(30, 36, 8, 5, '#3f7a34'); r(31, 35, 6, 1, '#5a9a44');
});
// 上永良神明社の大シイ：こぶだらけの太い幹が何本にも分かれ、濃い緑の葉がこんもり。幹にしめ縄、手前に石の玉垣
spotSprites.kaminagaraShinmei = hiCanvas((r, h) => {
  const LD = '#2a3e22', LM = '#3f5a30', LL = '#5f7a40', TR = '#5a4a3a', TL = '#7a6a58', TS = '#3a2e24';
  for (const [x, y, w, hh] of [[2, 4, 16, 12], [12, 0, 24, 12], [30, 3, 17, 13], [0, 13, 14, 9], [34, 13, 14, 9], [16, 9, 18, 8]]) { r(x + 1, y, w - 2, hh, LM); r(x, y + 1, w, hh - 2, LM); }
  for (const [x, y] of [[4, 6], [15, 2], [24, 3], [33, 5], [2, 15], [38, 15], [20, 11], [9, 10]]) { r(x, y, 5, 2, LL); r(x + 1, y + 2, 3, 1, LL); }
  for (const [x, y] of [[8, 12], [28, 10], [40, 10], [14, 18], [30, 17]]) r(x, y, 4, 2, LD);
  r(15, 18, 18, 22, TR); r(15, 18, 4, 22, TL); r(28, 18, 5, 22, TS);   // 太い幹
  spanRows(h, 12, [[10, 13], [11, 14], [12, 15], [13, 16], [14, 17], [15, 18]], TR); spanRows(h, 12, [[35, 38], [34, 37], [33, 36], [32, 35], [31, 34], [30, 33]], TS);   // 左右に分かれる太い枝
  r(22, 10, 4, 8, TR); r(22, 10, 1, 8, TL);
  for (const [x, y] of [[18, 24], [25, 30], [20, 34], [27, 22]]) { r(x, y, 3, 2, TS); r(x, y - 1, 2, 1, TL); }   // こぶ
  for (let y = 19; y < 40; y++) for (let x = 16 + (y % 3); x < 33; x += 4) r(x, y, 1, 2, (x + y) % 2 ? TS : '#4a3c2e');   // 樹皮のすじ
  r(13, 22, 3, 18, TR); r(13, 22, 1, 18, TL); r(33, 25, 3, 15, TS); r(11, 30, 2, 10, TS); r(36, 31, 2, 9, TS);   // ごつごつした幹のふくらみ
  h(27, 13, 35, '#e8dcb0'); h(28, 13, 35, '#c8b888'); for (const x of [19, 29]) { r(x, 29, 1, 2, '#ffffff'); r(x + 1, 31, 1, 2, '#ffffff'); }   // しめ縄としで
  spanRows(h, 40, [[9, 38], [6, 41], [4, 43]], TS); for (const [x, y] of [[6, 41], [14, 42], [31, 42], [39, 41]]) r(x, y, 4, 1, TR);   // 張りだした根
  for (let x = 1; x < 47; x += 6) { r(x, 38, 3, 7, '#c8ccd0'); h(38, x, x + 2, '#e4e8ec'); } h(41, 0, 47, '#b0b4b8');   // 石の玉垣
  r(0, 45, 48, 3, '#9a8a6a');
});
// 勝山寺：反りの強い入母屋の大屋根を正面に見せ、下に唐破風の向拝。「節分豆まき」の白い幕、左に松、右にのぼり
spotSprites.shozanji = hiCanvas((r, h) => {
  const RL = '#8a8784', RM = '#655b59', RD = '#2e2a2a', WD = '#4a3a30', WL = '#6a5040';
  r(21, 1, 6, 3, '#4a4444'); r(22, 0, 4, 1, '#6a6464');   // 鬼瓦
  for (let y = 4; y < 19; y++) { const k = y - 4, w = Math.round(2 + k * 1.2 + k * k * 0.04); h(y, 24 - w, 23 + w, y < 9 ? RL : RM); for (let x = 25 - w + (y % 2); x < 23 + w; x += 2) r(x, y, 1, 1, '#5a5250'); }
  h(18, 1, 46, RD); r(1, 17, 1, 1, RD); r(46, 17, 1, 1, RD);
  for (let k = 0; k < 8; k++) h(6 + k, 23 - k, 24 + k, k < 2 ? RL : '#9a8f84'); for (let x = 19; x < 29; x += 2) r(x, 11, 1, 3, '#6a5a50');   // 妻の木組み
  r(5, 19, 38, 18, WD); for (const x of [5, 13, 34, 42]) r(x, 19, 2, 18, WL);
  spanRows(h, 18, [[16, 31], [13, 34], [12, 35], [12, 35]], i => i < 2 ? RM : RD); r(12, 20, 1, 2, RD); r(35, 20, 1, 2, RD);   // 唐破風
  r(14, 23, 20, 4, '#f4f2ec'); pix(r, ['#.#.##.#.#.#.##.#.', '.#.#..#.##.#..#.#.'], 15, 24, '#222');   // 節分豆まきの幕
  r(16, 28, 16, 9, '#2a2420'); for (let x = 17; x < 31; x += 3) r(x, 28, 1, 9, '#4a3a30');
  for (let y = 37; y < 42; y++) h(y, 16 - (y - 37), 31 + (y - 37), y % 2 ? '#a9a697' : '#c4c0b0');
  for (const [x, y] of [[0, 14], [2, 19], [0, 25], [3, 30]]) { pix(r, PINE, x, y, '#283a24'); h(y, x + 2, x + 4, '#3f5a34'); } r(4, 33, 2, 10, '#4a3a2a');
  r(43, 24, 1, 19, '#888'); r(40, 24, 3, 15, '#f4f2ec'); for (let y = 26; y < 38; y += 3) r(41, y, 1, 2, '#c03030');
  r(0, 42, 48, 6, '#b8b4a8');
});
// 西林寺：南極探検の白瀬矗の墓。上の丸い自然石に字が刻まれ、石の台の両わきに花立て（黄色い菊）、まわりは苔と木
spotSprites.sairinji = hiCanvas((r, h) => {
  const ST = '#9a9080', SL = '#b4aa98', SD = '#7a7060';
  pix(r, ['...#####...', '.#########.', '###########', '###########', '###########'], 0, 30, '#5a6a42'); pix(r, ['...#####...', '.#########.', '###########', '###########', '###########'], 37, 30, '#5a6a42');
  spanRows(h, 3, [[20, 26], [18, 28], [17, 29], [17, 29]], ST);
  for (let y = 7; y < 28; y++) h(y, 16 + (y > 22 ? 1 : 0), 30 - (y > 22 ? 1 : 0), ST);
  r(17, 5, 3, 22, SL); r(27, 7, 3, 20, SD); for (let y = 9; y < 26; y += 2) { r(22, y, 1, 1, '#4a4238'); r(25, y + 1, 1, 1, '#4a4238'); }   // 刻まれた字
  r(8, 28, 32, 6, '#d0c9bb'); h(28, 8, 39, '#e4ded2'); r(8, 33, 32, 1, '#a8a294');
  for (const x of [9, 34]) { r(x, 22, 5, 12, '#c4bcae'); r(x + 4, 22, 1, 12, '#9a9488'); for (const [dx, dy] of [[0, 0], [2, -1], [4, 0], [1, 1], [3, 1]]) r(x + dx, 19 + dy, 2, 2, (dx + dy) % 2 ? '#e8d050' : '#c8a838'); r(x + 2, 21, 1, 2, '#4a7a3a'); }   // 花立てと菊
  r(20, 34, 8, 5, '#b8b2a4'); h(34, 20, 27, '#d0c9bb');
  r(4, 38, 40, 5, '#78766c'); h(38, 4, 43, '#9a988c'); r(0, 43, 48, 5, '#6a6b53'); for (const [x, y] of [[3, 44], [12, 46], [30, 45], [41, 44]]) r(x, y, 3, 1, '#8a8a68');
});
// 天竹神社（棉祖祭）：青みがかった灰色の瓦の大きな屋根、木の拝殿、両わきに石灯籠とこま犬、正面の石段と石の玉垣
spotSprites.tenjikuJinja = hiCanvas((r, h) => {
  const RC = ['#c8d0d8', '#9aa4b0', '#4a5460', '#8a94a0'], WB = '#8a6a50', WD = '#6a4a34', ST = '#c8c8c8', SD = '#9a9a9a';
  h(3, 14, 33, '#5a6470'); tileRoof(r, h, 4, [[12, 35], [10, 37], [8, 39], [6, 41], [5, 42], [4, 43], [3, 44], [2, 45]], RC);
  h(12, 4, 43, '#f0eee8'); r(6, 13, 36, 2, '#7a5a40'); for (let x = 8; x < 40; x += 4) r(x, 13, 2, 2, '#a07a58');   // 白い軒裏と組物
  r(8, 15, 32, 16, WB); for (const x of [8, 15, 32, 39]) r(x, 15, 1, 16, WD);
  r(17, 17, 14, 14, WD); for (let x = 18; x < 31; x += 2) r(x, 17, 1, 14, '#8a6448'); r(23, 17, 2, 14, '#4a3424');   // 格子戸
  h(30, 6, 41, '#a8a8a8'); for (let x = 7; x < 41; x += 3) r(x, 28, 1, 3, '#d8d8d8');
  for (let y = 31; y < 37; y++) h(y, 18 - (y - 31), 29 + (y - 31), y % 2 ? SD : ST);
  for (const x of [1, 41]) { r(x + 1, 22, 4, 2, ST); r(x, 24, 6, 2, ST); r(x + 2, 26, 2, 2, '#ffe9a0'); r(x + 1, 28, 4, 2, ST); r(x + 2, 30, 2, 6, ST); r(x, 36, 6, 2, SD); }   // 石灯籠
  for (const x of [8, 35]) { r(x, 31, 4, 4, '#b8b4a8'); r(x + 1, 30, 2, 1, '#b8b4a8'); r(x, 35, 5, 2, SD); }   // こま犬
  r(0, 37, 48, 4, '#b8b7b7'); for (let x = 0; x < 48; x += 4) r(x, 37, 1, 4, '#9a9a9a'); r(0, 41, 48, 7, '#c8c0b0'); r(20, 41, 8, 7, '#a8a49a');
});
// 瀬門神社（馬駈神事）：灰色の瓦の寄棟屋根に、こげ茶の板張りの長い拝殿。まん中の戸にしめ縄、前に木の長いす、白い砂地
spotSprites.semonJinja = hiCanvas((r, h) => {
  const RC = ['#c0c4cc', '#a4a8b3', '#5a5e66', '#8a8e96'], WB = '#4a3038', WL = '#5e3e46', WD = '#36242a';
  h(5, 10, 37, '#6a6e76'); tileRoof(r, h, 6, [[9, 38], [7, 40], [6, 41], [5, 42], [4, 43], [3, 44], [2, 45], [1, 46]], RC);
  h(14, 3, 44, '#7a757d');
  r(3, 15, 42, 21, WB); for (let x = 4; x < 45; x += 2) r(x, 15, 1, 21, WL); for (const x of [3, 12, 22, 25, 35, 44]) r(x, 15, 1, 21, WD); h(24, 3, 44, WD);
  r(19, 18, 10, 18, '#2a1a20'); for (let x = 20; x < 28; x += 2) r(x, 18, 1, 18, '#4a3038');
  for (let x = 17; x <= 30; x++) r(x, 18 + Math.round(Math.sin((x - 17) / 13 * Math.PI) * 2), 1, 1, '#e8dcb0'); for (const x of [20, 24, 28]) { r(x, 21, 1, 2, '#ffffff'); r(x + 1, 22, 1, 2, '#ffffff'); }   // しめ縄
  h(36, 2, 45, '#8a8a88'); h(37, 2, 45, '#b8b8b4');
  r(17, 38, 14, 2, '#6a5040'); r(18, 40, 1, 2, '#4a3a2a'); r(29, 40, 1, 2, '#4a3a2a');   // 木の長いす
  r(0, 42, 48, 6, '#e9e7e2'); for (const [x, y] of [[5, 44], [30, 46], [40, 43]]) r(x, y, 3, 1, '#d0ccc4');
  pix(r, ['..####', '.#####', '######', '######', '######', '######'], 42, 36, '#3f6a34');
});
// 花岳寺（吉良）：うすい銀ねずの大きな寄棟の瓦屋根、白い漆喰の帯と茶色の木組み、障子の本堂。左に丸く刈った松、右にとがったヒノキ
spotSprites.kagakuji = hiCanvas((r, h) => {
  const RC = ['#e4e6ea', '#c8ccd2', '#6a6e76', '#b0b4ba'], WD = '#433838', WL = '#5a4c4a';
  h(4, 14, 33, '#9a9ea6'); tileRoof(r, h, 5, [[12, 35], [10, 37], [8, 39], [6, 41], [5, 42], [4, 43], [3, 44], [2, 45], [1, 46]], RC);
  h(14, 3, 44, '#8a8e96');
  r(4, 15, 40, 5, '#f2f0ea'); for (const x of [4, 11, 18, 29, 36, 43]) r(x, 15, 1, 5, WD); h(15, 4, 43, WD); r(20, 16, 8, 3, '#6a5040'); for (const x of [21, 23, 25]) r(x, 17, 1, 1, '#e8e0c8');   // 漆喰の帯と扁額
  r(4, 20, 40, 13, WL); for (const x of [6, 12, 31, 37]) { r(x, 21, 5, 9, '#e8e4d8'); for (let y = 23; y < 30; y += 2) h(y, x, x + 4, '#b8b0a0'); r(x + 2, 21, 1, 9, '#b8b0a0'); }   // 障子
  r(19, 21, 10, 12, '#2a2427'); r(22, 23, 4, 6, '#c8b090'); for (const x of [4, 18, 29, 43]) r(x, 20, 1, 13, WD);
  h(33, 2, 45, '#6a5a50'); r(3, 34, 42, 3, '#2a2224');
  for (let y = 34; y < 39; y++) h(y, 18 - (y - 34), 29 + (y - 34), y % 2 ? '#8a8682' : '#a8a49e');
  r(0, 39, 48, 9, '#e0d7d0'); for (const [x, y] of [[8, 42], [34, 44], [24, 46]]) r(x, y, 4, 1, '#c8bfb6');
  pix(r, ['...######...', '.##########.', '############', '############', '.##########.', '...######...'], 0, 30, '#3a5a2e'); h(30, 4, 8, '#5a7a44'); r(5, 36, 2, 4, '#4a3a2a');   // 丸い松
  for (let y = 18; y < 40; y++) { const w = Math.min(4, 1 + Math.floor((y - 18) / 4)); h(y, 43 - w, 43 + w > 47 ? 47 : 43 + w, y % 3 ? '#2f5a2a' : '#3f6a34'); }   // ヒノキ
});
// 円融寺の前の「吉良の五本松」：太い幹が大きく傾き、低い枝は地面近くまでのびる。上に平らな松の葉のかたまり。左下にお寺の瓦屋根
spotSprites.ennyuji = hiCanvas((r, h) => {
  const TR = '#7a7060', TL = '#9a9282', TS = '#4e463a', ND = '#24402a', NM = '#2f5030', NL = '#4f7a48';
  tileRoof(r, h, 34, [[0, 12], [0, 13], [0, 14], [0, 15]], ['#7a7f87', '#5a5f67', '#33373e', '#4a4f57']); r(0, 38, 14, 6, '#e8e4dc'); for (const x of [0, 6, 12]) r(x, 38, 1, 6, '#5a4632');
  for (let i = 0; i < 34; i++) { const t = i / 33, x = Math.round(22 + 14 * t - 4 * Math.sin(t * Math.PI)), y = Math.round(44 - 36 * t), w = Math.round(4 - 2 * t); r(x - w, y, w * 2 + 1, 1, TR); r(x - w, y, 1, 1, TL); r(x + w, y, 1, 1, TS); }   // 傾いた幹
  for (let i = 0; i < 22; i++) { const t = i / 21, x = Math.round(20 - 17 * t), y = Math.round(34 + 8 * t * t); r(x, y, 3, 2, i % 3 ? TR : TS); }   // 地面へのびる低い枝
  for (const [x, y, w] of [[26, 2, 16], [32, 9, 14], [20, 7, 12], [36, 16, 11], [12, 16, 12], [2, 26, 12], [24, 18, 10]]) { r(x + 1, y, w - 2, 3, NM); r(x, y + 1, w, 2, NM); h(y, x + 2, x + w - 3, NL); h(y + 3, x + 1, x + w - 2, ND); }   // 平らな葉のかたまり
  r(0, 44, 48, 4, '#beb5ae'); h(44, 0, 47, '#d0c8c0');
});
// 勝楽寺（小山田地蔵尊）：彫りものの破風が前に張りだす本堂（木の格子と白い壁）、左は木の間をのぼる石段
spotSprites.shorakuji = hiCanvas((r, h) => {
  const RC = ['#6a6a72', '#4a4a52', '#26262c', '#3a3a42'], WB = '#8a6a50', WD = '#4a3426';
  for (const [x, y, w] of [[0, 6, 10], [6, 2, 9], [2, 14, 9], [8, 10, 7]]) { r(x, y, w, 7, '#2f5a2a'); r(x + 1, y, w - 3, 2, '#4f7a3e'); }
  for (let i = 0; i < 12; i++) h(42 - i * 2, 2 + i, 9 + i, i % 2 ? '#a8a8a0' : '#c0c0b8'); for (let i = 0; i < 12; i++) h(43 - i * 2, 2 + i, 9 + i, '#7a7a72');   // 石段
  r(0, 30, 6, 14, '#3f6a34'); r(1, 29, 4, 1, '#5a8a44');
  for (let k = 0; k < 14; k++) { const y = 4 + k; h(y, 30 - k - 2, 31 + k + 2, RC[2]); h(y, 30 - k - 1, 31 + k + 1, k < 4 ? RC[0] : RC[1]); }   // 正面の破風
  r(28, 1, 6, 3, '#3a3a40'); r(29, 0, 4, 1, '#5a5a62');
  for (let k = 3; k < 13; k++) h(4 + k, 30 - k + 2, 31 + k - 2, '#7a6450'); for (let x = 25; x < 37; x += 2) r(x, 11, 1, 5, '#a08468'); h(16, 21, 40, '#5a4634');   // 妻飾り
  tileRoof(r, h, 17, [[14, 47], [13, 47], [12, 47], [11, 47]], RC);
  r(13, 21, 35, 3, '#e8e4dc'); r(13, 24, 35, 16, WB); for (const x of [13, 21, 30, 39, 47]) r(x, 21, 1, 19, WD);
  r(32, 26, 6, 11, '#3a2a20'); for (let y = 27; y < 37; y += 2) h(y, 32, 37, '#6a5040'); r(23, 26, 6, 6, '#e8e4d8'); for (let x = 24; x < 29; x += 2) r(x, 26, 1, 6, '#a89880'); r(41, 26, 5, 6, '#e8e4d8');
  h(40, 12, 47, '#6a5040'); r(12, 41, 36, 3, '#4a3a30'); r(0, 44, 48, 4, '#a8a49a');
});
// 大樹寺の山門：二重の大きな楼門。黒ずんだ木の組物、上の階にまわり縁と手すり、両わきに花頭窓のある白壁の回廊
spotSprites.okazakiDaijuji = hiCanvas((r, h) => {
  const RC = ['#8a8a8c', '#5c5b5a', '#27231f', '#4a4948'], WD = '#4a443e', WL = '#6a625a', BR = '#9a948c';
  tileRoof(r, h, 26, [[0, 12], [0, 13], [0, 14]], RC); tileRoof(r, h, 26, [[35, 47], [34, 47], [33, 47]], RC);
  for (const x0 of [0, 34]) { r(x0, 29, 14, 11, '#e8e6e0'); for (const x of [x0 + 2, x0 + 8]) { spanRows(h, 31, [[x + 1, x + 2], [x, x + 3], [x, x + 3], [x, x + 3], [x, x + 3]], '#3a3632'); for (let y = 32; y < 36; y += 2) h(y, x, x + 3, '#8a8680'); } r(x0, 36, 14, 4, '#5a524a'); }   // 回廊と花頭窓
  h(2, 9, 38, '#4a4948'); tileRoof(r, h, 3, [[8, 39], [6, 41], [5, 42], [4, 43], [3, 44]], RC); r(3, 6, 1, 1, RC[2]); r(44, 6, 1, 1, RC[2]);
  r(9, 8, 30, 3, BR); for (let x = 10; x < 38; x += 3) r(x, 8, 2, 3, WD);   // 上の組物
  r(11, 11, 26, 5, WL); r(23, 11, 2, 3, '#8a2a20'); for (let x = 12; x < 36; x += 4) r(x, 12, 3, 3, '#e8e4dc');   // 上の階
  h(16, 8, 39, BR); for (let x = 8; x < 40; x += 2) r(x, 17, 1, 1, WD); h(18, 8, 39, WD);   // まわり縁の手すり
  tileRoof(r, h, 19, [[7, 40], [5, 42], [4, 43], [3, 44]], RC);
  r(9, 23, 30, 2, BR); for (let x = 10; x < 38; x += 3) r(x, 23, 2, 2, WD);
  r(10, 25, 28, 15, WD); for (const x of [10, 17, 23, 30, 37]) r(x, 25, 2, 15, WL); r(19, 27, 10, 13, '#1a1814'); r(21, 33, 6, 7, '#8a8a7a');
  r(14, 36, 3, 4, '#c8c4bc'); r(31, 36, 3, 4, '#c8c4bc'); for (let x = 19; x < 29; x += 2) r(x, 37, 1, 3, '#d8d4cc');
  r(0, 40, 48, 3, '#c8c8c4'); h(40, 0, 47, '#e0e0dc'); r(0, 43, 48, 5, '#dbdbdc');
});
// まるや八丁味噌：白い漆喰の大きな蔵（切妻の妻に黒い丸の紋）、下は黒い焼き板と格子戸、石の土台。右に続く低い蔵
spotSprites.okazakiMaruya = hiCanvas((r, h) => {
  const WW = '#f0f0ec', WS = '#c8ccd0', BK = '#22201e', BL = '#3a3836', RC = ['#7a7f87', '#5a5f67', '#2a2e34', '#4a4f57'];
  tileRoof(r, h, 14, [[29, 47], [28, 47], [27, 47]], RC); r(28, 17, 20, 9, WS); r(28, 26, 20, 14, BK); for (let x = 29; x < 48; x += 2) r(x, 26, 1, 14, BL); r(36, 28, 6, 12, '#6a4a3a'); for (let x = 37; x < 42; x += 2) r(x, 28, 1, 12, '#4a3428');
  for (let k = 0; k < 18; k++) { const y = 3 + k; h(y, 17 - k - 1, 18 + k + 1, RC[2]); h(y, 17 - k, 18 + k, RC[k < 4 ? 0 : 1]); if (k >= 1) h(y, 17 - k + 2, 18 + k - 2, k > 12 ? WS : WW); }   // 切妻の屋根と白い妻
  r(14, 1, 8, 2, '#3a3e44');
  pix(r, ['.####.', '#....#', '#.##.#', '#.##.#', '#....#', '.####.'], 15, 9, BK);   // 黒い丸の紋
  r(1, 21, 33, 5, WW); r(1, 21, 2, 19, WS); h(25, 1, 33, '#9a9ea4');
  r(1, 26, 33, 12, BK); for (let x = 2; x < 34; x += 2) r(x, 26, 1, 12, BL); h(26, 1, 33, '#5a5450');
  r(20, 28, 9, 10, '#3a2a22'); for (let x = 21; x < 29; x += 2) r(x, 28, 1, 10, '#6a5040');   // 格子戸
  r(1, 38, 47, 3, '#8a8a84'); h(38, 1, 47, '#a8a8a2'); r(0, 41, 48, 7, '#c8c6c0'); for (const [x, y] of [[6, 44], [26, 46]]) r(x, y, 6, 1, '#b0aea8');
});
// 伊賀八幡宮の随身門：檜皮ぶきの大きな屋根、朱ぬりの柱と梁、白い壁、軒下の色あざやかな組物。前に石の反り橋と玉垣、蓮の池
spotSprites.okazakiIgaHachimangu = hiCanvas((r, h) => {
  const RC = ['#a8988a', '#7a6a5a', '#3e3026', '#6a5a4c'], RD = '#c83a2a', RL = '#e05a40', RS = '#8e2418', WW = '#f0eee8';
  h(3, 14, 33, '#4e3e32'); tileRoof(r, h, 4, [[12, 35], [10, 37], [8, 39], [6, 41], [5, 42], [4, 43], [3, 44], [2, 45]], RC);
  r(5, 12, 38, 3, '#2f6a4a'); for (let x = 6; x < 42; x += 3) { r(x, 12, 2, 2, RL); r(x, 14, 2, 1, '#e8c040'); }   // 軒下の組物
  r(8, 15, 32, 17, RD); r(8, 15, 32, 2, RS);
  for (const x0 of [10, 31]) { r(x0, 18, 7, 12, WW); r(x0 + 2, 20, 3, 6, '#3a3030'); }
  r(19, 18, 10, 14, '#2a1a14'); for (const x of [8, 18, 29, 39]) r(x, 15, 2, 17, RL); h(17, 8, 39, '#e8c040');
  r(6, 32, 36, 2, '#b8b0a8'); h(32, 6, 41, '#d0c8c0');
  spanRows(h, 34, [[16, 31], [15, 32], [14, 33], [14, 33], [13, 34]], i => i ? '#a8a098' : '#c8c0b8'); for (const x of [14, 33]) r(x, 31, 1, 3, '#9a9288');   // 石の反り橋
  for (let x = 0; x < 48; x += 4) if (x < 12 || x > 36) { r(x, 30, 2, 9, '#b8ae98'); h(30, x, x + 1, '#d0c8b4'); } h(33, 0, 11, '#a2957c'); h(33, 37, 47, '#a2957c');   // 石の玉垣
  r(0, 39, 48, 9, '#4a6a5a'); for (const [x, y] of [[2, 41], [9, 44], [36, 42], [42, 45], [20, 46], [28, 44]]) { r(x, y, 4, 2, '#4f8a3a'); r(x + 1, y, 2, 1, '#7ab05a'); } r(10, 41, 2, 2, '#f0a0b8');   // 蓮の池
});
// 瀧山寺の本堂（滝山寺）：檜皮ぶきの大きな寄棟屋根、軒下に五色の幕、風化した木の堂と縁、前に木の桶
spotSprites.okazakiTakisanji = hiCanvas((r, h) => {
  const RL = '#b08a74', RM = '#8a6a58', RD = '#2f231e', WB = '#9c8270', WD = '#6a5442';
  h(8, 18, 29, '#5a4436');
  for (let y = 9; y < 22; y++) { const k = y - 9, a = Math.round(17 - k * 1.25), b = Math.round(30 + k * 1.25); h(y, a, b, y < 13 ? RL : RM); for (let x = a + 1 + (y % 3); x < b; x += 3) r(x, y, 1, 1, '#7a5a4a'); }
  h(22, 0, 47, RD); h(23, 1, 46, '#4a3a30'); r(0, 21, 1, 1, RD); r(47, 21, 1, 1, RD);
  const CUR = ['#7a3a8a', '#f4f2ec', '#d34d35', '#e8c030', '#1d8650'];
  for (let x = 4; x < 44; x++) r(x, 24, 1, 4, CUR[Math.floor((x - 4) / 2) % 5]);   // 五色の幕
  r(4, 28, 40, 8, WB); for (const x of [4, 11, 18, 29, 36, 43]) r(x, 28, 1, 8, WD); for (let x = 5; x < 43; x += 2) r(x, 29, 1, 6, '#b49a86');
  r(20, 29, 8, 7, '#3a2a20');
  h(36, 2, 45, '#b8a490'); h(37, 2, 45, '#6a5442'); r(3, 38, 42, 2, '#3a2e26'); for (let x = 4; x < 44; x += 6) r(x, 38, 1, 2, WB);
  for (let y = 36; y < 42; y++) h(y, 20 - (y - 36), 27 + (y - 36), y % 2 ? '#c8c0b8' : '#dcd6ce');
  for (const x of [5, 38]) { r(x, 37, 5, 5, '#8a6a4a'); h(38, x, x + 4, '#4a3a2a'); h(40, x, x + 4, '#4a3a2a'); h(37, x, x + 4, '#a88a64'); }   // 木の桶
  r(0, 42, 48, 6, '#dfdad6'); for (const [x, y] of [[6, 45], [30, 44], [40, 46]]) r(x, y, 4, 1, '#c8c2bc');
});
// 岩津天満宮の拝殿：金の飾りの唐破風を正面に、朱ぬりの柱と梁、白い幕に黒い梅鉢の紋、朱の手すり。前に石の撫で牛
spotSprites.okazakiIwazuTenmangu = hiCanvas((r, h) => {
  const RC = ['#7a7480', '#5a5462', '#2a2430', '#4a4452'], RD = '#c83a2a', RL = '#e05a40', RS = '#8e2418', GD = '#d8b040';
  tileRoof(r, h, 14, [[4, 43], [2, 45], [1, 46], [0, 47]], RC);
  for (let k = 0; k < 14; k++) { const y = 2 + k; h(y, 23 - k - 2, 24 + k + 2, RC[2]); h(y, 23 - k - 1, 24 + k + 1, k < 3 ? RC[0] : RC[1]); if (k >= 4) h(y, 23 - k + 3, 24 + k - 3, RS); }   // 正面の破風
  r(22, 0, 4, 2, '#3a3440'); for (let k = 5; k < 13; k += 2) h(2 + k, 24 - 2, 25, GD); r(21, 9, 6, 4, GD); r(23, 10, 2, 2, '#4a7ad0');   // 金の飾りと額
  for (let x = 12; x <= 35; x++) r(x, 16 + Math.round(-Math.sin((x - 12) / 23 * Math.PI) * 2), 1, 2, RC[2]);   // 唐破風のアーチ
  r(4, 18, 40, 4, RD); r(4, 18, 40, 1, RL); for (let x = 5; x < 43; x += 3) r(x, 19, 2, 2, GD);
  r(4, 22, 40, 6, '#f4f2ec'); for (const x of [14, 31]) { r(x, 23, 4, 4, '#222'); r(x + 1, 24, 2, 2, '#f4f2ec'); }   // 白い幕と梅鉢の紋
  r(4, 28, 40, 8, '#3a2a24'); for (const x of [4, 13, 22, 25, 34, 43]) r(x, 18, 1, 18, RL);
  h(33, 3, 44, RD); for (let x = 3; x < 45; x += 3) r(x, 34, 1, 3, RD); h(36, 3, 44, RS);   // 朱の手すり
  r(0, 37, 48, 11, '#d8d4cc'); for (let x = 2; x < 48; x += 6) r(x, 40, 4, 1, '#c0bcb4');
  spanRows(h, 38, [[4, 13], [3, 15], [3, 16], [4, 16]], '#8a8a8e'); r(14, 36, 3, 3, '#8a8a8e'); r(15, 36, 1, 1, '#5a5a5e'); h(38, 5, 12, '#aaaaae'); r(5, 42, 3, 2, '#6a6a6e'); r(13, 42, 3, 2, '#6a6a6e'); r(2, 44, 16, 3, '#9a948a');   // 撫で牛
});
// 六所神社：檜皮ぶきの大屋根に金の飾りの唐破風、朱ぬりの柱と黒い組物、しめ縄、両わきに石灯籠
spotSprites.okazakiRokushoJinja = hiCanvas((r, h) => {
  const RL = '#c4bcbc', RM = '#a8a0a0', RD = '#4a4040', RD2 = '#c83a2a', RLL = '#e05a40', GD = '#d8b040';
  h(4, 10, 37, '#6a6060');
  for (let y = 5; y < 17; y++) { const k = y - 5, a = Math.round(9 - k * 0.7), b = Math.round(38 + k * 0.7); h(y, a, b, y < 9 ? RL : RM); for (let x = a + 1 + (y % 3); x < b; x += 3) r(x, y, 1, 1, '#948c8c'); }
  h(17, 0, 47, RD); r(0, 16, 1, 1, RD); r(47, 16, 1, 1, RD);
  for (let k = 0; k < 8; k++) { const y = 3 + k; h(y, 23 - k - 1, 24 + k + 1, RD); h(y, 23 - k, 24 + k, '#8a7a72'); } r(22, 1, 4, 2, GD); r(20, 7, 8, 3, GD); r(23, 8, 2, 1, '#222');   // 千鳥破風と金の飾り
  for (let x = 14; x <= 33; x++) r(x, 16 + Math.round(-Math.sin((x - 14) / 19 * Math.PI) * 3), 1, 2, RD);   // 唐破風
  r(3, 18, 42, 4, '#2a2424'); for (let x = 4; x < 44; x += 3) r(x, 19, 2, 2, GD);   // 黒と金の組物
  r(3, 22, 42, 14, '#3a2a26'); for (const x of [3, 12, 21, 26, 35, 44]) r(x, 22, 2, 14, RD2); for (const x of [3, 12, 21, 26, 35, 44]) r(x, 22, 1, 14, RLL);
  h(22, 3, 45, RD2); h(28, 3, 45, RD2);
  for (let x = 14; x <= 33; x++) r(x, 25 + Math.round(Math.sin((x - 14) / 19 * Math.PI) * 2), 1, 1, '#e8dcb0'); for (const x of [17, 23, 29]) { r(x, 27, 1, 2, '#ffffff'); r(x + 1, 28, 1, 2, '#ffffff'); }   // しめ縄
  h(36, 1, 46, '#8a8a88'); r(17, 36, 14, 4, '#a8a49e');
  for (const x of [1, 41]) { r(x + 1, 29, 4, 2, '#9a9690'); r(x, 31, 6, 2, '#9a9690'); r(x + 2, 33, 2, 1, '#ffe9a0'); r(x + 2, 34, 2, 6, '#9a9690'); r(x, 40, 6, 1, '#7a7670'); }
  r(0, 40, 48, 8, '#d0ccc4'); for (const [x, y] of [[8, 43], [34, 45]]) r(x, y, 5, 1, '#b8b4ac');
});
// 奥殿陣屋の入口：こげ茶の太い木の門柱と横木、右の柱に「奥殿陣屋」の茶色い看板、緑のトンネルの下の石の小道
spotSprites.okazakiOkudonoJinya = hiCanvas((r, h) => {
  const PD = '#3a3028', PL = '#5a4a3c', LD = '#3f6a2a', LM = '#5f8a3a', LL = '#8eaa5f';
  for (const [x, y, w, hh] of [[0, 0, 20, 14], [14, 0, 20, 10], [28, 0, 20, 14], [0, 10, 8, 14], [40, 10, 8, 14]]) { r(x, y, w, hh, LM); }
  for (const [x, y] of [[3, 2], [17, 1], [30, 3], [10, 8], [36, 9], [1, 15], [42, 16], [24, 5]]) { r(x, y, 5, 2, LL); r(x + 1, y + 2, 3, 1, LL); }
  for (const [x, y] of [[8, 11], [26, 8], [20, 12], [44, 6]]) r(x, y, 5, 2, LD);
  r(0, 17, 48, 14, '#2f5a26'); for (const [x, y] of [[4, 20], [14, 18], [28, 22], [40, 19], [20, 25]]) r(x, y, 6, 2, '#4a7a34');   // 奥の木々（緑のトンネル）
  spanRows(h, 30, [[18, 29], [16, 31], [14, 33], [12, 35], [10, 37], [8, 39], [6, 41], [4, 43], [2, 45], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47]], i => i % 3 ? '#b8b4ac' : '#a8a49c');
  r(0, 32, 9, 8, '#4a7a34'); r(39, 32, 9, 8, '#4a7a34'); h(32, 0, 8, LL); h(32, 39, 47, LL);
  r(2, 14, 44, 3, PD); h(14, 2, 45, PL); r(4, 19, 40, 2, PD);   // 横木
  for (const x of [8, 37]) { r(x, 14, 4, 30, PD); r(x, 14, 1, 30, PL); }
  r(41, 18, 4, 16, '#b8783a'); r(41, 18, 4, 1, '#d8985a'); for (let y = 20; y < 33; y += 3) r(42, y, 2, 2, '#2a1a10');   // 看板
  r(13, 28, 4, 3, '#e8e0c8'); r(14, 31, 1, 4, PD);   // 立て札
  r(0, 44, 48, 4, '#8a8882');
});
// 東公園（岡崎）：芦池にのびる長い木の桟橋と、先の六角のあずまや。むこう岸の木立と、水に映る影
spotSprites.okazakiHigashiPark = hiCanvas((r, h) => {
  const WA = '#6f7978', WL = '#8a9496', WD = '#556060';
  spanRows(h, 14, [[0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47]], i => i % 3 ? '#2c321f' : '#3f4a2a');
  for (const [x, w] of [[2, 6], [12, 5], [30, 7], [40, 6]]) { r(x, 11, w, 3, '#3f4a2a'); h(11, x + 1, x + w - 2, '#55643a'); }
  for (let y = 22; y < 47; y++) { const k = Math.sqrt(Math.max(0, 1 - Math.pow((y - 22) / 25, 2))); h(y, Math.round(24 - 24 * k), Math.round(23 + 24 * k), WA); }   // 楕円の池
  for (const [x, y] of [[4, 27], [20, 31], [34, 26], [10, 37], [26, 41], [36, 35], [18, 44]]) h(y, x, x + 5, WL);
  spanRows(h, 6, [[13, 14], [11, 16], [9, 18], [7, 20], [6, 21]], i => i % 2 ? '#57514c' : '#6e6862'); r(13, 4, 2, 2, '#404641');   // あずまやの屋根
  h(11, 6, 21, '#3e3a36'); for (const x of [7, 13, 20]) r(x, 12, 1, 7, '#404641'); h(16, 7, 20, '#7b818a');
  r(6, 19, 40, 2, '#7b818a'); h(19, 6, 45, '#9aa0a8'); h(17, 22, 45, '#7b818a'); for (let x = 23; x < 46; x += 4) r(x, 17, 1, 2, '#5a6068');   // 桟橋と手すり
  for (let x = 8; x < 46; x += 4) r(x, 21, 1, 5, '#404641');
  for (let x = 8; x < 46; x += 4) r(x, 27, 1, 3, WD); h(29, 8, 20, WD); spanRows(h, 30, [[9, 18], [11, 16]], WD);   // 水に映る影
  for (const [x, y] of [[36, 0], [41, 3]]) { pix(r, PINE, x, y, '#2c3a24'); h(y, x + 2, x + 4, '#44583a'); }
});
// 旧本多忠次邸（岡崎）：クリーム色の壁にレンガ色の縁どり。左は半円窓の破風、まん中は3つのアーチの玄関廊、右は丸い塔。赤茶の瓦
spotSprites.okazakiHondaTei = hiCanvas((r, h) => {
  const CW = '#e2d8b6', CS = '#c6ba96', BR = '#9a6a48', RF = '#7a4a3a', WN = '#3a3a40', WF = '#f2eee2';
  const win = (x, y, w, hh) => { r(x, y, w, hh, WN); r(x, y, w, 1, WF); r(x + (w >> 1), y, 1, hh, WF); };
  for (let k = 0; k < 7; k++) { h(6 + k, 8 - k - 1, 9 + k + 1, BR); h(6 + k, 8 - k, 9 + k, CW); }   // 左の破風
  r(1, 13, 16, 27, CW); r(13, 13, 4, 27, CS); h(13, 1, 16, BR);
  for (let a = 0; a <= 180; a += 15) { const t = a * Math.PI / 180; r(Math.round(8.5 - 5 * Math.cos(t)), Math.round(20 - 5 * Math.sin(t)), 1, 1, BR); }   // 半円の縁どり
  win(5, 16, 8, 5); h(22, 3, 14, BR); for (const x of [3, 7, 11]) win(x, 26, 3, 8);
  h(11, 16, 34, RF); h(12, 15, 35, '#5a3428'); r(16, 13, 18, 27, CW); h(13, 16, 33, BR);
  for (const x of [18, 25]) win(x, 15, 6, 5); h(22, 16, 33, BR);
  for (const cx of [19, 25, 31]) { spanRows(h, 25, [[cx - 2, cx + 1], [cx - 3, cx + 2], [cx - 3, cx + 2], [cx - 4, cx + 3]], BR); spanRows(h, 26, [[cx - 1, cx], [cx - 2, cx + 1], [cx - 3, cx + 2]], WN); r(cx - 3, 29, 6, 9, WN); r(cx - 4, 29, 1, 9, BR); r(cx + 3, 29, 1, 9, BR); r(cx - 1, 31, 2, 7, '#6a5a50'); }   // 3つのアーチ（奥にガラス戸）
  r(34, 9, 13, 31, CW); r(42, 9, 5, 31, CS); h(9, 34, 46, CS); for (let x = 34; x < 47; x += 3) r(x, 7, 2, 2, CW); h(10, 34, 46, BR); h(24, 34, 46, BR);   // 丸い塔
  for (const x of [35, 39, 43]) { win(x, 13, 3, 7); win(x, 27, 3, 8); }
  h(40, 0, 47, '#b8b0a0'); r(0, 41, 48, 7, '#8fa83a'); h(41, 0, 47, '#a8c050');
});
// 南公園（岡崎）：遊園地のピンクのコーヒーカップ。うしろに緑と白のしま模様の建物、まわりに手すり
spotSprites.okazakiMinamiPark = hiCanvas((r, h) => {
  const PK = '#f0a2c0', PD = '#c05c88', PS = '#f8d4e2', GR = '#2f4a3e';
  r(4, 8, 36, 2, '#e8e6e0'); r(4, 10, 36, 13, '#e8e6e0'); for (let x = 4; x < 40; x += 6) r(x, 10, 3, 13, GR); h(16, 4, 39, '#c8c6be');
  for (let x = 6; x < 38; x += 4) { r(x, 18, 2, 4, '#5a6a72'); } h(22, 4, 39, '#b8b0a0'); r(2, 18, 2, 12, '#d8d4c8');
  for (const [x, c] of [[42, '#e8d24a'], [45, '#5ac0a0']]) r(x, 14, 2, 2, c);
  r(0, 30, 48, 18, '#6aa8a0'); h(30, 0, 47, '#7ec0b8');
  const cup = (x, y, w, c1, c2) => { spanRows(h, y, [[x, x + w], [x, x + w], [x + 1, x + w - 1], [x + 1, x + w - 1], [x + 2, x + w - 2], [x + 3, x + w - 3]], c1); h(y, x, x + w, c2); r(x + w + 1, y + 1, 2, 3, c2); spanRows(h, y + 6, [[x - 2, x + w + 2], [x - 1, x + w + 1]], PS); };
  cup(3, 27, 9, '#5aa8d8', '#2a6a98'); cup(12, 31, 13, PK, PD); cup(29, 33, 13, PK, PD);
  for (let x = 0; x < 48; x += 6) r(x, 39, 1, 7, '#d8dcdc'); h(40, 0, 47, '#e8ecec'); h(44, 0, 47, '#c8cccc');   // 手すり
});
// 岡崎市美術博物館：段々に重なるコンクリートの壁と大きな階段、右に高いガラスの塔、左に細い柱の薄い屋根
spotSprites.okazakiMuseum = hiCanvas((r, h) => {
  const CL = '#d0cac4', CM = '#bcb4ac', CS = '#a99a92', GL = '#9baeb4', GF = '#c8d6dc';
  r(33, 3, 11, 26, GL); for (let y = 3; y < 29; y += 3) h(y, 33, 43, GF); for (let x = 33; x < 44; x += 3) r(x, 3, 1, 26, GF); r(41, 3, 3, 26, '#86989e');   // ガラスの塔
  spanRows(h, 12, [[2, 22], [1, 22]], '#707577'); for (const x of [4, 10, 16, 21]) r(x, 14, 1, 10, '#e8e8e8');   // 細い柱の屋根
  r(4, 22, 32, 6, CM); h(22, 4, 35, CL); r(8, 18, 24, 4, CL); h(18, 8, 31, '#e0dad4');
  r(0, 28, 48, 6, CS); h(28, 0, 47, CM); r(28, 24, 10, 5, CL); h(24, 28, 37, '#e0dad4');
  for (let y = 34; y < 48; y++) h(y, Math.max(0, 22 - (y - 34) * 2), 47, (y % 2) ? CM : CL);   // 大きな階段
  spanRows(h, 34, [[2, 20], [2, 17], [2, 14], [2, 11], [2, 8]], CS); h(38, 2, 10, '#8a7e76');
});
// 名鉄 東岡崎駅：灰色の駅ビル（窓の列）と、色とりどりの看板の帯、1階の店の入口と街路樹
spotSprites.okazakiHigashiOkazakiSta = hiCanvas((r, h) => {
  const GY = '#b4b4ae', GD = '#8e8e88', WN = '#4a5560';
  r(0, 8, 48, 34, GY); h(8, 0, 47, '#d4d4ce'); r(10, 4, 14, 4, '#e8e8e8'); r(11, 5, 12, 2, '#d23a2e');   // 屋上の看板
  for (const y of [11, 17]) { for (let x = 1; x < 47; x += 4) r(x, y, 3, 4, WN); h(y + 5, 0, 47, GD); }
  for (const [x, w, c] of [[0, 9, '#d23a2e'], [9, 7, '#2f74b8'], [16, 10, '#d23a2e'], [26, 6, '#3f9a5a'], [32, 9, '#2f74b8'], [41, 7, '#f2c230']]) { r(x, 24, w, 4, c); h(25, x + 1, x + w - 2, '#ffffff'); }
  h(28, 0, 47, GD); r(0, 29, 48, 10, '#3a3e44'); for (let x = 2; x < 46; x += 7) r(x, 30, 5, 8, '#6a7a88'); r(20, 31, 8, 8, '#222');
  r(0, 39, 48, 3, '#9a9a96'); r(0, 42, 48, 6, '#7a7a78'); for (const x of [8, 26]) r(x, 44, 6, 1, '#f4f4f4');
  r(34, 30, 2, 12, '#5a4030'); r(31, 26, 8, 6, '#3f7a34'); r(32, 25, 5, 1, '#5a9a44');
});
// JR 岡崎駅：銀色のパネルの駅舎と、ガラスの階段室、白い駅名の看板にオレンジの JR マーク
spotSprites.okazakiOkazakiSta = hiCanvas((r, h) => {
  const SV = '#c8ccd0', SD = '#9aa0a6', GL = '#6f8696', GH = '#b0c4d0';
  r(10, 4, 36, 30, SV); h(4, 10, 45, '#e4e6e8'); for (let y = 8; y < 34; y += 4) h(y, 10, 45, SD); r(38, 4, 8, 30, SD);
  r(30, 10, 8, 16, '#4a6070'); h(10, 30, 37, '#7a90a0');
  r(1, 16, 12, 24, GL); for (let y = 16; y < 40; y += 4) h(y, 1, 12, GH); for (let x = 1; x < 13; x += 4) r(x, 16, 1, 24, '#d8e0e6'); h(15, 0, 13, '#e4e6e8');   // ガラスの階段室
  r(8, 24, 22, 6, '#f8f8f8'); r(9, 25, 4, 4, '#f08a24'); r(10, 26, 2, 2, '#ffffff'); for (let x = 15; x < 28; x += 2) r(x, 26, 1, 2, '#222');   // 駅名の看板
  r(12, 30, 34, 10, '#3e4a54'); for (let x = 14; x < 46; x += 5) r(x, 31, 3, 9, GL);
  r(0, 40, 48, 8, '#a8a6a2'); h(40, 0, 47, '#c4c2be'); r(36, 41, 10, 4, '#4f8a3a');
});
// 松應寺（岡崎）：瓦の大屋根の本堂（正面に白い破風）、木の柱の正面、左に松
spotSprites.okazakiShooji = hiCanvas((r, h) => {
  const RC = ['#8c9096', '#62666e', '#3a3e44', '#545860'], WD = '#7a5a3c', DK = '#2e2620';
  for (let k = 0; k < 9; k++) { h(5 + k, 24 - k - 1, 25 + k + 1, '#3a3e44'); h(5 + k, 24 - k, 25 + k, '#62666e'); if (k >= 3) h(5 + k, 24 - k + 2, 25 + k - 2, '#ece8de'); }   // 正面の破風
  r(23, 3, 4, 2, '#5a5e66'); h(10, 19, 30, WD);
  tileRoof(r, h, 13, [[8, 41], [6, 43], [4, 45], [2, 47], [1, 47]], RC);
  r(5, 18, 38, 18, '#9a7a56'); for (const x of [5, 13, 21, 28, 35, 42]) r(x, 18, 1, 18, WD); h(18, 5, 42, '#6a4a30'); h(23, 5, 42, '#6a4a30');
  r(14, 24, 20, 12, DK); for (let x = 15; x < 34; x += 2) r(x, 24, 1, 12, '#5a4632'); r(22, 28, 4, 8, '#1a1410');
  h(36, 2, 45, '#a9a49a'); h(37, 4, 43, '#c4bfb4'); r(0, 38, 48, 10, '#b8b2a6'); spanRows(h, 38, [[20, 28], [19, 29], [18, 30], [17, 31], [16, 32]], '#d8d2c6');
  for (const [x, y] of [[0, 2], [3, 6], [0, 10]]) { pix(r, PINE, x, y, '#2f5a32'); h(y, x + 2, x + 4, '#4a7a48'); } r(4, 13, 1, 22, '#5a4030');
  r(40, 28, 3, 10, '#e8e4d8'); r(41, 29, 1, 7, '#333');   // 立て札
});
// 法蔵寺（岡崎）：灰色の瓦の宝形屋根に金の宝珠、こげ茶の板壁と格子戸、まわりの縁と手すり
spotSprites.okazakiHozoji = hiCanvas((r, h) => {
  const WD = '#6a4a32', WL = '#8a6a4a', DK = '#3a2a1e';
  r(23, 1, 2, 3, '#d8b040'); r(22, 3, 4, 1, '#b08a30');
  tileRoof(r, h, 4, [[21, 26], [19, 28], [17, 30], [15, 32], [13, 34], [11, 36], [9, 38], [7, 40], [5, 42], [4, 43]], ['#9aa098', '#7a8078', '#3e423e', '#6a7068']);
  h(14, 6, 41, '#2e2a26'); r(9, 15, 30, 17, WD); for (const x of [9, 16, 23, 31, 38]) r(x, 15, 1, 17, WL);
  r(18, 18, 12, 14, DK); for (let x = 19; x < 30; x += 2) r(x, 18, 1, 14, '#6a5038'); for (let y = 19; y < 32; y += 3) h(y, 18, 29, '#6a5038');
  r(10, 18, 5, 6, DK); r(33, 18, 5, 6, DK); r(25, 16, 6, 2, '#c03a2a');   // 額
  h(32, 4, 43, '#9a7a56'); h(33, 4, 43, '#5a4030'); for (let x = 5; x < 44; x += 3) r(x, 28, 1, 4, '#9a7a56'); h(28, 4, 43, '#9a7a56');   // 縁と手すり
  r(6, 34, 36, 4, '#2a2420'); for (const x of [6, 18, 29, 41]) r(x, 34, 1, 4, WL); h(38, 3, 44, '#b8b4aa'); h(39, 3, 44, '#9a968c');
  r(43, 12, 5, 26, '#f0ece2'); r(0, 8, 5, 20, '#4a7a3a'); r(1, 7, 3, 1, '#6a9a4a');
});
// 道の駅 藤川宿（岡崎）：黒い瓦の長い屋根に破風が2つ、白い壁と木の柱の軒下、手前の駐車場
spotSprites.okazakiFujikawaShuku = hiCanvas((r, h) => {
  const RC = ['#6a6e78', '#4a4e56', '#2a2c30', '#3e4248'];
  tileRoof(r, h, 14, [[2, 45], [1, 46], [0, 47], [0, 47]], RC);
  for (const cx of [12, 33]) for (let k = 0; k < 6; k++) { h(9 + k, cx - k - 1, cx + k + 1, '#2a2c30'); h(9 + k, cx - k, cx + k, '#4a4e56'); if (k >= 2) h(9 + k, cx - k + 2, cx + k - 2, '#ece8e0'); }   // 破風
  r(1, 18, 46, 12, '#ece8e0'); h(18, 1, 46, '#6a5440'); for (let x = 1; x < 47; x += 6) r(x, 18, 1, 12, '#6a5440');
  for (let x = 3; x < 45; x += 6) r(x, 21, 4, 7, '#5a6e7e'); r(20, 20, 8, 3, '#3a2a1a'); for (const x of [22, 24, 26]) r(x, 21, 1, 1, '#e8d8a8');   // 看板
  r(0, 30, 48, 18, '#5a5a5c'); for (let x = 2; x < 48; x += 7) r(x, 32, 1, 8, '#f0f0f0'); h(40, 0, 47, '#f0f0f0'); r(4, 41, 8, 5, '#3a7ac8'); r(6, 42, 4, 3, '#ffffff');
  for (const [x, c] of [[16, '#e8e8e8'], [30, '#5a6a8a'], [37, '#d8d8d0']]) { r(x, 33, 6, 4, c); r(x + 1, 32, 4, 1, c); r(x + 1, 37, 1, 1, '#222'); r(x + 4, 37, 1, 1, '#222'); }   // 車
});
// くらがり渓谷（岡崎）：深い森の中の、赤茶の屋根の山小屋と、白い石の河原と流れ
spotSprites.okazakiKuragari = hiCanvas((r, h) => {
  for (const [x, y, w, c] of [[0, 0, 14, '#2f5a2a'], [12, 2, 12, '#3f6a32'], [24, 0, 12, '#2a4a24'], [34, 3, 14, '#3f6a32']]) { r(x, y, w, 14, c); r(x + 2, y + 1, w - 5, 2, '#5a8a44'); }
  spanRows(h, 10, [[17, 31], [15, 33], [13, 35], [12, 36]], i => i % 2 ? '#6a5040' : '#7e6250'); r(30, 6, 3, 5, '#5a5a5a');
  r(14, 14, 20, 12, '#8a6a4a'); for (let x = 15; x < 34; x += 3) r(x, 14, 1, 12, '#6a4e36'); r(17, 17, 5, 4, '#2e2a26'); r(26, 17, 5, 4, '#2e2a26'); r(23, 19, 3, 7, '#3a2a1e');
  r(0, 14, 13, 14, '#3a6a30'); r(35, 14, 13, 14, '#2f5a2a');
  r(0, 26, 48, 22, '#c8c4bc'); for (const [x, y] of [[3, 29], [12, 33], [30, 30], [40, 34], [20, 40], [6, 42], [36, 43]]) { r(x, y, 4, 2, '#a8a49c'); h(y, x, x + 2, '#e0dcd4'); }
  spanRows(h, 36, [[26, 47], [22, 47], [18, 47], [16, 47], [14, 47], [12, 47]], '#6a9ab0'); for (const [x, y] of [[30, 38], [24, 40], [38, 39], [20, 41]]) h(y, x, x + 3, '#a8c8d8');
});
// 本宮山（岡崎）：「三河富士」とも呼ばれる、すそ野の広い山。森の濃い緑と、山頂のアンテナ
spotSprites.okazakiHongusan = hiCanvas((r, h) => {
  for (let y = 12; y < 44; y++) { const k = y - 12, a = Math.max(0, Math.round(20 - k * 1.6 - k * k * 0.02)), b = Math.min(47, Math.round(28 + k * 1.4 + k * k * 0.02)); h(y, a, b, y < 18 ? '#4a5a3e' : y < 28 ? '#3e5034' : '#34462c'); }   // すそ野の広い山
  spanRows(h, 10, [[22, 26], [20, 28]], '#4a5a3e');
  for (let y = 12; y < 42; y += 3) { r(22 - (y - 12) / 2 | 0, y, 2, 1, '#5e7048'); r(30 + (y - 12) / 3 | 0, y + 1, 2, 1, '#2a3a24'); }   // 尾根と谷
  r(24, 5, 1, 5, '#c8c8c8'); r(21, 7, 1, 3, '#c8c8c8'); r(23, 4, 3, 1, '#e8e8e8');   // アンテナ
  r(0, 40, 48, 8, '#7a8a5a'); for (let x = 2; x < 48; x += 6) r(x, 42, 3, 2, '#d8d0c0'); h(44, 0, 47, '#8a9a6a');
});
// 丈山苑（安城）：竹林を背にした茅葺きのあずまやと、池と庭の植えこみ
spotSprites.anjoJozanen = hiCanvas((r, h) => {
  for (let x = 0; x < 48; x += 3) { r(x, 0, 2, 22, x % 2 ? '#5a8a3a' : '#4a7a32'); r(x + 1, 0, 1, 22, '#78a850'); }   // 竹林
  spanRows(h, 9, [[24, 27], [21, 30], [19, 32], [17, 34], [15, 36], [14, 37]], i => i % 2 ? '#8a7a60' : '#9a8a6e'); h(15, 14, 37, '#5a4e3c');
  for (const x of [16, 25, 35]) r(x, 16, 1, 8, '#4a3a2a'); r(17, 21, 18, 3, '#6a5a44');
  r(0, 24, 48, 6, '#3f6a32'); for (const [x, w] of [[2, 8], [12, 6], [38, 8]]) { r(x, 22, w, 4, '#4f7a3a'); h(22, x + 1, x + w - 2, '#6a9a4a'); }
  r(0, 30, 48, 10, '#5a7a6a'); for (const [x, y] of [[4, 33], [22, 35], [36, 32]]) h(y, x, x + 5, '#7a9a8a'); r(14, 29, 5, 3, '#8a8478'); r(30, 30, 4, 2, '#8a8478');
  r(0, 40, 48, 8, '#d8d0c0'); spanRows(h, 40, [[0, 20], [0, 16], [0, 12]], '#6a9a3a');
});
// 本證寺（安城）の鼓楼：石垣の上に、黒い板壁の下の重と、白い漆喰の上の重。銀ねずの瓦屋根に千鳥破風
spotSprites.anjoHonshoji = hiCanvas((r, h) => {
  const RC = ['#c8c8cc', '#8e9096', '#4a4c52', '#74767c'], PL = '#ece8de', BK = '#2a2a2c';
  r(17, 1, 2, 3, '#5a5c62'); r(29, 1, 2, 3, '#5a5c62'); h(3, 17, 30, '#4a4c52');
  tileRoof(r, h, 4, [[15, 32], [13, 34], [11, 36], [9, 38], [8, 39]], RC);
  for (let k = 0; k < 5; k++) { h(2 + k, 23 - k - 1, 24 + k + 1, '#4a4c52'); if (k >= 2) h(2 + k, 23 - k + 1, 24 + k - 1, PL); }   // 千鳥破風
  r(13, 9, 22, 9, PL); h(9, 13, 34, '#b8b4aa'); for (const x of [13, 19, 28, 34]) r(x, 9, 1, 9, '#6a5040'); r(21, 11, 6, 4, '#4a3a2a'); for (let x = 22; x < 27; x += 2) r(x, 11, 1, 4, '#8a7050');
  tileRoof(r, h, 18, [[8, 39], [6, 41], [4, 43], [3, 44], [2, 45]], RC); h(23, 4, 43, PL);
  r(7, 24, 34, 13, BK); for (let x = 8; x < 41; x += 2) r(x, 24, 1, 13, '#3a3a3c'); r(18, 27, 12, 10, '#6a4a30'); r(23, 27, 2, 10, '#3a2a1a'); h(24, 7, 40, PL);
  for (let y = 37; y < 48; y++) { const k = (y - 37) >> 1; h(y, 5 - k, 42 + k, (y % 2) ? '#8a8680' : '#a8a49e'); } for (let x = 8; x < 42; x += 5) { r(x, 39, 1, 2, '#6a6660'); r(x + 2, 43, 1, 2, '#6a6660'); }
});
// 安祥城址（安城）：城あとの公園。お寺の屋根、大きな松、「安祥城址」の石碑と石灯籠、庭石と植えこみ
spotSprites.anjoCastle = hiCanvas((r, h) => {
  tileRoof(r, h, 8, [[6, 24], [4, 26], [3, 27], [2, 28]], ['#8c9096', '#5a5e66', '#33363c', '#4a4e56']); r(5, 12, 20, 10, '#7a5a3c'); r(10, 14, 10, 8, '#3a2a20');
  for (const [x, y] of [[26, 0], [33, 2], [28, 5], [37, 7]]) { pix(r, PINE, x, y, '#2f5a32'); h(y, x + 2, x + 4, '#4a7a48'); } r(33, 9, 2, 14, '#5a4030');
  r(31, 18, 7, 24, '#b8b4ac'); r(36, 18, 2, 24, '#9a968e'); h(18, 31, 37, '#d0ccc4'); for (let y = 21; y < 38; y += 3) r(33, y, 2, 2, '#4a4844');   // 石碑
  r(19, 30, 6, 2, '#a8a49c'); r(20, 32, 4, 3, '#c8c4bc'); r(21, 33, 2, 1, '#ffe27a'); r(20, 35, 4, 1, '#a8a49c'); r(21, 36, 2, 5, '#a8a49c'); r(19, 41, 6, 1, '#8a867e');   // 石灯籠
  for (const [x, y, w, c] of [[0, 32, 16, '#3f6a32'], [10, 36, 10, '#5a8a3a'], [38, 34, 10, '#4a7a3a'], [26, 38, 8, '#3f6a32']]) { r(x, y, w, 10 - (y - 32), c); h(y, x + 1, x + w - 2, '#6a9a4a'); }
  for (const [x, y] of [[4, 42], [14, 44], [40, 43]]) { r(x, y, 5, 3, '#8a8478'); h(y, x + 1, x + 3, '#a8a296'); }
  r(0, 46, 48, 2, '#b8a888');
});
// 安城市歴史博物館：茶色の瓦の大きな切妻と、妻いっぱいの三角のガラス窓、ベージュのタイルの壁、左に白い棟
spotSprites.anjoMuseum = hiCanvas((r, h) => {
  const BG = '#cfc8ba', BS = '#b4ac9c', RF = '#7a4a3a', GL = '#3a4a5a', GM = '#c8ccd0';
  r(0, 24, 14, 16, '#ece8e0'); h(23, 0, 13, '#a8a49a'); for (let x = 1; x < 13; x += 4) r(x, 27, 3, 5, '#5a6a78');
  for (let k = 0; k < 16; k++) { const y = 5 + k; h(y, 26 - k - 2, 27 + k + 2, RF); h(y, 26 - k, 27 + k, BG); }   // 切妻
  r(10, 21, 34, 19, BG); r(38, 21, 6, 19, BS); h(21, 8, 45, RF);
  for (let k = 0; k < 13; k++) { const y = 11 + k; h(y, 26 - k + 1, 27 + k - 1, GL); }   // 三角のガラス
  r(15, 24, 24, 16, GL); for (let x = 17; x < 39; x += 4) r(x, 11, 1, 29, GM); for (let y = 16; y < 40; y += 5) h(y, 15, 38, GM); r(26, 11, 1, 29, GM);
  r(0, 40, 48, 2, '#9a968c'); r(0, 42, 48, 6, '#c8c4bc'); for (let x = 3; x < 48; x += 8) r(x, 44, 4, 1, '#d8d4cc');
  r(42, 30, 2, 12, '#5a4030'); r(39, 24, 8, 7, '#4a7a3a'); r(40, 23, 5, 1, '#6a9a4a');
});
// 堀内公園（安城）：色とりどりのゴンドラが下がる大観覧車と、白い支柱、ふもとの木立
spotSprites.anjoHoriuchiPark = hiCanvas((r, h) => {
  const cx = 24, cy = 19, R = 17, cols = ['#d23a2e', '#2f74b8', '#f2c230', '#3f9a5a', '#e57399', '#8a5ac8'];
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) if (Math.hypot(x - cx, y - cy) < R) r(x, y, 1, 1, '#cfe6f2');   // 輪の中から見える空
  for (let a = 0; a < 360; a += 3) { const t = a * Math.PI / 180; r(Math.round(cx + R * Math.cos(t)), Math.round(cy + R * Math.sin(t)), 1, 1, '#d8dce0'); r(Math.round(cx + (R - 3) * Math.cos(t)), Math.round(cy + (R - 3) * Math.sin(t)), 1, 1, '#b8bcc0'); }
  for (let a = 0; a < 360; a += 30) { const t = a * Math.PI / 180; for (let d = 2; d < R; d += 1) r(Math.round(cx + d * Math.cos(t)), Math.round(cy + d * Math.sin(t)), 1, 1, '#c8ccd0'); }
  r(cx - 2, cy - 2, 4, 4, '#e8e8e8');
  for (let i = 0; i < 12; i++) { const t = i * 30 * Math.PI / 180, x = Math.round(cx + R * Math.cos(t)), y = Math.round(cy + R * Math.sin(t)); r(x - 1, y, 3, 3, cols[i % 6]); r(x, y + 1, 1, 1, '#ffffff'); }   // ゴンドラ
  for (let y = cy; y < 42; y++) { const k = (y - cy) * 0.45; r(Math.round(cx - 2 - k), y, 2, 1, '#e8ecee'); r(Math.round(cx + 1 + k), y, 2, 1, '#c8ccd0'); }   // 支柱
  for (const [x, w, c] of [[0, 12, '#3f6a32'], [10, 10, '#4f7a3a'], [34, 14, '#3f6a32'], [27, 9, '#4f7a3a']]) { r(x, 36, w, 8, c); h(36, x + 1, x + w - 2, '#6a9a4a'); }
  r(0, 44, 48, 4, '#6aa040');
});
// 安城公園：木立にかこまれた池と、赤い太鼓橋、小島の柵
spotSprites.anjoPark = hiCanvas((r, h) => {
  for (const [x, y, w, c] of [[0, 2, 14, '#3f6a32'], [12, 6, 10, '#5a8a3a'], [22, 0, 12, '#3f6a32'], [33, 4, 15, '#4f7a3a']]) { r(x, y, w, 18 - y, c); r(x + 2, y + 1, w - 5, 2, '#6a9a4a'); }
  r(4, 14, 2, 6, '#5a4030'); r(40, 14, 2, 6, '#5a4030');
  r(0, 20, 48, 28, '#4a5a50'); for (const [x, y] of [[4, 34], [30, 38], [16, 44], [38, 28]]) h(y, x, x + 6, '#6a7a70'); spanRows(h, 21, [[0, 47], [0, 47]], '#3a4a40');
  for (let x = 8; x <= 40; x++) { const y = Math.round(25 - 5 * Math.sin((x - 8) / 32 * Math.PI)); r(x, y, 1, 2, '#b03a2a'); r(x, y - 2, 1, 1, '#c84a3a'); } for (let x = 10; x < 40; x += 4) { const y = Math.round(25 - 5 * Math.sin((x - 8) / 32 * Math.PI)); r(x, y - 2, 1, 2, '#c84a3a'); }   // 赤い太鼓橋
  for (let x = 9; x <= 39; x += 3) { const y = Math.round(29 + 3 * Math.sin((x - 8) / 32 * Math.PI)); r(x, y, 2, 1, '#6a3a30'); }   // 水に映る橋
  spanRows(h, 36, [[18, 34], [16, 36], [16, 36], [18, 34]], '#3f6a32'); for (let x = 17; x < 36; x += 3) r(x, 35, 1, 3, '#8a6a4a'); h(36, 16, 36, '#8a6a4a');
});
// 二子古墳（安城）：前方後円墳。草におおわれた2つのふくらみと、上に生える松、手前の青い田んぼ
spotSprites.anjoFutagoKofun = hiCanvas((r, h) => {
  for (let x = 0; x < 48; x++) { const y = Math.round(30 - Math.max(9 * Math.exp(-Math.pow((x - 14) / 9, 2)), 11 * Math.exp(-Math.pow((x - 33) / 10, 2)), 2)); for (let yy = y; yy < 34; yy++) r(x, yy, 1, 1, yy < y + 2 ? '#a8c060' : yy < y + 6 ? '#8aa84a' : '#7a9a40'); }   // 2つのふくらみ
  for (const [x, y] of [[8, 13], [15, 10], [26, 10], [33, 7], [40, 11]]) { pix(r, ['.###.', '#####', '.###.'], x, y, '#2f5a2a'); r(x + 2, y + 3, 1, 5, '#5a4030'); h(y, x + 1, x + 3, '#4a7a3a'); }
  h(34, 0, 47, '#c8b888'); r(0, 35, 48, 13, '#5aa03a'); for (let y = 36; y < 48; y += 2) for (let x = (y % 4) ? 0 : 2; x < 48; x += 4) r(x, y, 2, 1, '#7ac050');
  r(43, 28, 3, 7, '#9a968c'); h(28, 43, 45, '#b8b4ac');
});
// 姫小川古墳（安城）：古墳の上の姫小川神社。木立の中の石段と、両わきの石灯籠、上の小さな社
spotSprites.anjoHimeogawaKofun = hiCanvas((r, h) => {
  for (const [x, y, w, c] of [[0, 0, 16, '#2f5a2a'], [14, 2, 8, '#4a7a3a'], [26, 0, 10, '#3f6a32'], [34, 1, 14, '#2f5a2a']]) { r(x, y, w, 22 - y, c); r(x + 2, y + 1, w - 5, 2, '#5a8a44'); }
  spanRows(h, 6, [[19, 28], [17, 30], [16, 31]], i => i % 2 ? '#5a5f66' : '#7a7f86'); r(18, 9, 12, 7, '#8a6a4a'); r(21, 10, 6, 6, '#3a2a20'); r(23, 8, 2, 1, '#e2b13a');
  for (let y = 16; y < 42; y++) { const k = Math.round((y - 16) * 0.35); h(y, 20 - k, 27 + k, (y % 2) ? '#a8a49a' : '#c8c3b8'); }   // 石段
  for (const x of [6, 37]) { r(x, 24, 6, 2, '#b8b4a8'); r(x + 1, 26, 4, 4, '#c8c4b8'); r(x + 2, 27, 2, 2, '#ffe27a'); r(x, 30, 6, 1, '#b8b4a8'); r(x + 2, 31, 2, 8, '#b8b4a8'); r(x, 39, 6, 2, '#9a968c'); }   // 石灯籠
  r(0, 22, 6, 20, '#4a5a3a'); r(42, 22, 6, 20, '#4a5a3a'); r(0, 42, 48, 6, '#c8bca8'); for (const [x, y] of [[4, 44], [38, 45]]) h(y, x, x + 4, '#b0a490');
});
// JR 安城駅：茶色のパネルと白い帯の低い駅舎、右に白い棟と「JR」の看板。前は植えこみと広い駅前広場、背の高い街灯
spotSprites.anjoStation = hiCanvas((r, h) => {
  r(2, 14, 27, 2, '#e8e4dc'); r(2, 16, 27, 16, '#91664b'); for (let x = 4; x < 29; x += 5) r(x, 16, 1, 16, '#7e5640');
  r(8, 21, 19, 6, '#444547'); for (let x = 8; x < 27; x += 3) r(x, 21, 1, 6, '#8a8a8a'); h(21, 8, 26, '#6a6c70');
  for (const x of [10, 13, 16, 19, 22]) r(x, 28, 2, 2, '#c83a3a');
  r(28, 11, 18, 23, '#e8e6e0'); h(11, 28, 45, '#f4f2ee'); r(31, 14, 3, 2, '#e8601c'); for (let x = 35; x < 44; x += 2) r(x, 14, 1, 2, '#3a3a3c');
  r(30, 19, 6, 7, '#444547'); r(31, 20, 2, 2, '#8a9aa8'); r(38, 19, 6, 7, '#5a5c60'); r(28, 29, 18, 5, '#3a3c40'); for (let x = 31; x < 46; x += 4) r(x, 29, 1, 5, '#b8bcc0');
  r(2, 32, 27, 2, '#c8c4b8');
  r(0, 34, 46, 3, '#4a6a2a'); for (let x = 2; x < 44; x += 4) r(x, 34, 1, 1, '#c83a4a');
  r(0, 37, 48, 11, '#b1a99a'); for (let x = 0; x < 48; x += 6) r(x, 37, 1, 11, '#c4bcac'); spanRows(h, 40, [[0, 3], [3, 7], [7, 11], [11, 15], [15, 19], [19, 23], [23, 27], [27, 31]], '#d8b040');
  r(16, 3, 1, 34, '#8a8e94'); r(14, 2, 5, 2, '#c8ccd0');
});
// 三河安城駅：茶色の長い屋根にとんがった白い屋根窓、まん中は赤茶の屋根のアーチの入口、白い時計塔に赤い四角すいの屋根。前に柵と花だん
spotSprites.anjoMikawaAnjoStation = hiCanvas((r, h) => {
  spanRows(h, 1, [[26, 27], [25, 28], [24, 29], [23, 30]], i => i < 2 ? '#b84a58' : '#9a3040');
  r(24, 5, 6, 12, '#ece9e6'); r(29, 5, 1, 12, '#c8c4c4'); r(25, 8, 4, 4, '#ffffff'); r(26, 9, 1, 2, '#333'); r(27, 10, 1, 1, '#333');
  tileRoof(r, h, 14, [[6, 41], [5, 42], [4, 43], [3, 44], [2, 45], [1, 46], [1, 46], [0, 47]], ['#9a7a6e', '#7a5a50', '#4a3a34', '#6a4c44']);
  for (const x of [7, 14, 36, 42]) { spanRows(h, 14, [[x + 1, x + 2], [x, x + 3], [x - 1, x + 4], [x - 1, x + 4]], '#ece8e0'); r(x, 16, 3, 2, '#4a4448'); }   // 屋根窓
  r(2, 22, 44, 12, '#d8cfc0'); for (let x = 4; x < 46; x += 4) r(x, 24, 2, 4, '#5a5458'); for (let x = 3; x < 46; x += 8) r(x, 22, 1, 12, '#c4baa8');
  spanRows(h, 16, [[23, 24], [22, 25], [21, 26], [20, 27], [19, 28], [18, 29], [17, 30], [16, 31]], i => i % 2 ? '#8a4a48' : '#a05a56');   // 入口の破風
  r(18, 24, 12, 10, '#d8cfc0'); spanRows(h, 25, [[22, 25], [20, 27], [19, 28]], '#2a2224'); r(19, 28, 10, 6, '#2a2224'); r(21, 29, 6, 5, '#5a6870');
  r(35, 25, 7, 2, '#3a8a3a'); r(36, 25, 2, 1, '#e8601c');
  r(0, 34, 48, 1, '#3a3a3e'); for (let x = 0; x < 48; x += 2) r(x, 35, 1, 3, '#3a3a3e'); h(37, 0, 47, '#3a3a3e');
  r(0, 38, 48, 3, '#4a7a34'); for (let x = 1; x < 48; x += 3) r(x, 38, 1, 1, '#e8c840');
  r(0, 41, 48, 7, '#a8a8a6'); for (let x = 4; x < 48; x += 8) r(x, 41, 1, 7, '#c4c4c2');
});
// 名鉄 南安城駅：高架の線路の下の駅。コンクリートの高架と架線柱、茶色の板張りの棟、右は白い縦じまの長い建物、入口の駅名の看板と赤いポスト
spotSprites.anjoMinamiAnjoStation = hiCanvas((r, h) => {
  for (const x of [6, 36]) { r(x, 0, 1, 10, '#7a7e84'); h(2, x - 3, x + 4, '#7a7e84'); }
  r(0, 8, 32, 6, '#a09888'); h(8, 0, 31, '#b8b0a0'); h(13, 0, 31, '#7a7266');
  r(4, 14, 22, 16, '#675040'); for (let x = 5; x < 26; x += 3) r(x, 14, 1, 16, '#5a4436');
  r(22, 11, 26, 26, '#e6e0d6'); h(11, 22, 47, '#f2ede4'); for (let x = 22; x < 48; x += 6) r(x, 12, 2, 25, '#cfc8bc'); for (let x = 25; x < 46; x += 6) r(x, 16, 2, 14, '#7a8288');
  r(2, 28, 20, 10, '#ece8e0'); r(6, 27, 10, 2, '#f8f8f8'); r(7, 27, 2, 2, '#2f5fae'); for (let x = 10; x < 16; x += 2) r(x, 28, 1, 1, '#2f5fae'); r(6, 31, 9, 7, '#3a3a3c'); r(8, 32, 5, 4, '#6a7880');
  r(17, 33, 2, 5, '#d23a2e'); h(33, 17, 18, '#e8584a');
  r(0, 38, 48, 3, '#3f6a2f'); h(38, 0, 47, '#4f7a3a'); r(0, 41, 48, 7, '#6a6a6a'); h(44, 0, 47, '#7a7a7a');
});
// 安城市役所（西庁舎）と安城公園：ベージュの庁舎に窓の帯とベランダ、うしろに給水塔、右に大きな木、前は池と木の柵
spotSprites.anjoCityhall = hiCanvas((r, h) => {
  r(30, 1, 4, 6, '#c8ccd0'); r(31, 7, 2, 4, '#a8acb0');
  r(10, 8, 11, 4, '#c8c4b8'); r(6, 12, 34, 22, '#dcd8cc'); h(12, 6, 39, '#ece8dc');
  for (const y of [15, 21, 27]) { r(7, y, 32, 3, '#5b6b7e'); for (let x = 7; x < 39; x += 4) r(x, y, 1, 3, '#c8ccd0'); h(y + 3, 6, 39, '#f0ece0'); h(y - 1, 7, 38, '#8a9aa8'); }
  pix(r, ['...#######...', '.###########.', '#############', '#############', '#############', '.###########.', '..#########..'], 31, 6, '#3f7a34'); for (const [x, y] of [[34, 7], [39, 9], [36, 11]]) r(x, y, 3, 1, '#5a9a44');
  r(36, 13, 3, 21, '#5a4030');
  r(0, 30, 48, 4, '#4f7a3a'); for (let x = 1; x < 47; x += 4) r(x, 31, 1, 5, '#837e73'); h(32, 0, 47, '#9a958a');
  r(0, 36, 48, 9, '#5a6a5a'); for (const [x, y] of [[4, 38], [16, 40], [30, 38], [40, 41], [10, 42]]) r(x, y, 5, 1, '#8a9a8a'); r(14, 37, 12, 1, '#c8c4b8');
  h(45, 0, 47, '#9a968c'); h(46, 0, 47, '#7a766c');
});
// 碧南市臨海公園：芝生の上の浅い池に、口から水を吹く青いクジラのすべり台。うしろに遊具
spotSprites.hekinanRinkaiPark = hiCanvas((r, h) => {
  r(36, 14, 1, 14, '#c83a3a'); r(45, 14, 1, 14, '#c83a3a'); spanRows(h, 11, [[39, 42], [37, 44], [36, 45]], '#8a5a3a'); h(20, 36, 45, '#c83a3a'); spanRows(h, 21, [[30, 35], [26, 31], [22, 27]], '#3a9a5a');
  r(0, 28, 48, 20, '#7a9a48'); for (const [x, y] of [[3, 44], [14, 46], [40, 44], [30, 46]]) r(x, y, 4, 1, '#8aaa58');
  spanRows(h, 30, [[10, 37], [6, 41], [4, 43], [4, 43], [5, 42], [8, 39], [12, 35]], i => i === 0 || i === 6 ? '#c8c4bc' : '#9ab8c8'); for (const [x, y] of [[8, 33], [30, 34], [20, 35]]) r(x, y, 4, 1, '#c4dce8');
  spanRows(h, 8, [[20, 25], [18, 27], [17, 28], [16, 29], [16, 29], [16, 30], [17, 30], [17, 30], [18, 30], [18, 30], [19, 30], [19, 30], [20, 30], [20, 31], [19, 32], [18, 33], [17, 34], [17, 35], [18, 35], [20, 34], [22, 33], [24, 31]], i => i < 3 ? '#6a8ac0' : '#4a6a9a');   // クジラ
  for (let y = 13; y < 28; y++) r(17 + Math.floor((y - 13) / 4), y, 2, 1, '#e8eef4');   // 白いおなか
  r(25, 13, 2, 2, '#1e212a'); r(21, 10, 3, 1, '#8aaad8');
  spanRows(h, 2, [[21, 21], [19, 23], [18, 24]], '#d8f0fc'); r(21, 5, 1, 3, '#d8f0fc');   // 吹きあげる水
  for (const [x, y] of [[14, 29], [34, 29], [12, 31], [37, 31]]) r(x, y, 2, 2, '#e8f4fc');
});
// 碧南市明石公園：白い大観覧車（赤・黄・青のゴンドラ）と、赤レンガの広場の青白しまのパラソル
spotSprites.hekinanAkashiPark = hiCanvas((r, h) => {
  const CX = 24, CY = 19;
  for (let a = 0; a < 360; a += 30) { const t = a * Math.PI / 180; for (let d = 2; d < 16; d++) r(Math.round(CX + d * Math.cos(t)), Math.round(CY + d * Math.sin(t)), 1, 1, '#e8e8ec'); }   // スポーク
  for (let y = 0; y < 40; y++) for (let x = 4; x < 45; x++) { const d = Math.hypot(x - CX, y - CY); if (d >= 15.3 && d < 16.6) r(x, y, 1, 1, '#f8f8f8'); else if (d >= 9.6 && d < 10.4) r(x, y, 1, 1, '#c8c8d0'); }
  [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].forEach((a, i) => { const t = a * Math.PI / 180; r(Math.round(CX + 17 * Math.cos(t)) - 1, Math.round(CY + 17 * Math.sin(t)) - 1, 3, 3, ['#d23a3a', '#f2c230', '#3a6ad0'][i % 3]); });   // ゴンドラ
  r(CX - 1, CY - 1, 3, 3, '#b8b8c0');
  for (let i = 0; i < 20; i++) { r(Math.round(CX - i * 0.55) - 1, CY + i, 2, 1, '#f0f0f4'); r(Math.round(CX + i * 0.55), CY + i, 2, 1, '#f0f0f4'); }   // 脚
  r(0, 39, 48, 9, '#a6715a'); for (let y = 41; y < 48; y += 3) h(y, 0, 47, '#8a5a48'); for (let x = 3; x < 48; x += 6) r(x, 39, 1, 9, '#8a5a48');
  for (const x of [2, 9, 37, 43]) { spanRows(h, 35, [[x + 1, x + 2], [x, x + 3]], '#4a8ad8'); r(x + 1, 35, 1, 2, '#ffffff'); r(x + 2, 37, 1, 3, '#888'); }
});
// 称名寺（碧南）：うすい緑青の銅ぶきの上屋根と、灰色の瓦のひさし屋根の本堂。白い壁と木の格子、正面の石段、白い砂利
spotSprites.hekinanShomyoji = hiCanvas((r, h) => {
  h(5, 15, 32, '#6a6a6c'); h(6, 15, 32, '#4a4a4c');
  spanRows(h, 7, [[14, 33], [13, 34], [12, 35], [11, 36], [10, 37], [9, 38], [8, 39], [8, 39]], i => i === 7 ? '#5a7a68' : i < 3 ? '#b8d4c0' : '#9cc0a8');
  for (let y = 7; y < 14; y++) for (let x = 15 - (y - 7) + (y % 2); x < 33 + (y - 7); x += 3) r(x, y, 1, 1, '#8ab098');   // 銅板の継ぎ目
  r(11, 15, 26, 3, '#e8e4d8'); for (const x of [11, 18, 24, 30, 36]) r(x, 15, 1, 3, '#5a4632');
  tileRoof(r, h, 18, [[6, 41], [4, 43], [2, 45], [1, 46], [0, 47], [0, 47]], ['#a8aab0', '#7a7c80', '#4a4c50', '#6a6c70']);
  r(3, 24, 41, 13, '#4a3a2e'); h(24, 3, 43, '#e8e4d8'); h(25, 3, 43, '#e8e4d8');
  for (const [a, b] of [[4, 9], [11, 16], [31, 36], [38, 43]]) { r(a, 27, b - a + 1, 5, '#3a2e26'); for (let x = a; x <= b; x += 2) r(x, 27, 1, 5, '#8a7a68'); h(29, a, b, '#8a7a68'); }
  r(18, 28, 12, 9, '#7a5a42'); for (const x of [21, 24, 27]) r(x, 28, 1, 9, '#5a4030');
  for (const x of [3, 10, 17, 30, 37, 43]) r(x, 24, 1, 13, '#6a5442');
  h(37, 2, 45, '#8a6a50'); spanRows(h, 38, [[19, 28], [18, 29], [17, 30], [16, 31]], i => i % 2 ? '#a8a49c' : '#c8c4bc');
  r(0, 42, 48, 6, '#dcdbda'); for (const [x, y] of [[4, 44], [12, 46], [36, 44], [42, 46], [26, 45]]) r(x, y, 2, 1, '#c4c2c0');
  r(1, 34, 3, 2, '#9a968c'); r(0, 36, 5, 2, '#b8b4ac'); r(1, 38, 3, 4, '#9a968c');
});
// 海徳寺（碧南・大浜）：鬼瓦をのせた大きな三角の破風と、黒っぽい瓦の大屋根の本堂。こげ茶の木の正面、石段、右に松
spotSprites.hekinanKaitokuji = hiCanvas((r, h) => {
  tileRoof(r, h, 15, [[6, 41], [4, 43], [2, 45], [1, 46], [0, 47]], ['#8a8886', '#6a6866', '#3a3836', '#5a5856']);
  for (let k = 0; k < 15; k++) { const y = 4 + k; h(y, 23 - k - 1, 24 + k + 1, '#5a5856'); h(y, 23 - k, 24 + k, '#7a7876'); if (k >= 3) h(y, 23 - k + 2, 24 + k - 2, '#6a5e54'); }   // 大きな破風
  for (const y of [11, 15]) h(y, 23 - (y - 4) + 3, 24 + (y - 4) - 3, '#8a7a68'); r(23, 9, 2, 9, '#8a7a68'); r(21, 13, 6, 2, '#a89888');   // 破風の木組み
  r(22, 1, 4, 3, '#4a4a4c'); r(21, 2, 1, 2, '#4a4a4c'); r(26, 2, 1, 2, '#4a4a4c'); r(23, 2, 2, 1, '#7a7a7c');   // 鬼瓦
  tileRoof(r, h, 20, [[3, 44], [2, 45], [1, 46], [0, 47]], ['#8a8886', '#6a6866', '#3a3836', '#5a5856']);
  r(4, 24, 40, 14, '#3a2e28'); for (const x of [4, 11, 18, 29, 36, 43]) r(x, 24, 1, 14, '#5a4638');
  for (const [a, b] of [[5, 10], [12, 17], [30, 35], [37, 42]]) { for (let x = a; x <= b; x += 2) r(x, 26, 1, 10, '#6a5444'); h(30, a, b, '#6a5444'); }
  r(19, 27, 10, 11, '#4a3c34'); for (const x of [21, 24, 27]) r(x, 27, 1, 11, '#7a6450'); r(20, 28, 8, 2, '#8a9aa4');
  spanRows(h, 38, [[15, 32], [14, 33], [13, 34], [12, 35]], i => i % 2 ? '#c9b498' : '#d8c8a8');
  r(0, 42, 48, 6, '#d8d6d0'); r(20, 42, 8, 6, '#c8c4bc');
  for (const [x, y] of [[38, 14], [40, 19], [37, 23], [41, 27]]) { pix(r, PINE, x, y, '#2f5a30'); h(y, x + 2, x + 4, '#4a7a44'); } r(42, 22, 2, 16, '#5a4030');
});
// 九重味淋：紺色の板壁に白い小窓が散らばる大きな切妻の蔵（白い破風板・てっぺんに鬼瓦）、石積みの土台
spotSprites.hekinanKokonoeMirin = hiCanvas((r, h) => {
  const NV = '#202c46', NH = '#2c3a58';
  tileRoof(r, h, 9, [[32, 46], [33, 47], [34, 47]], ['#7a7a82', '#616069', '#3a3a40', '#55545c']);
  for (let k = 0; k < 16; k++) { const y = 4 + k; h(y, 22 - Math.round(k * 1.3), 23 + Math.round(k * 1.3), '#e8e8e8'); if (k >= 1) h(y, 23 - Math.round(k * 1.3), 22 + Math.round(k * 1.3), NV); }   // 白い破風板と紺の妻壁
  r(20, 2, 5, 2, '#3a3a40'); r(21, 1, 3, 1, '#3a3a40');
  r(2, 20, 42, 17, NV); for (let x = 3; x < 44; x += 3) r(x, 20, 1, 17, NH); r(44, 12, 3, 25, '#1a2236');
  for (const [x, y] of [[12, 14], [20, 10], [30, 14], [8, 22], [17, 22], [26, 22], [36, 22], [12, 28], [31, 28], [22, 16]]) { r(x, y, 3, 3, '#f0f0f0'); r(x + 1, y, 1, 3, '#b8bcc4'); h(y + 1, x, x + 2, '#b8bcc4'); }
  for (const x of [6, 14, 22, 30, 38]) { r(x, 33, 4, 2, '#d8d8d8'); h(34, x, x + 3, '#8a8a90'); }   // 床下の換気口
  r(1, 37, 46, 6, '#6a6a70'); for (let y = 38; y < 43; y += 2) for (let x = 1 + (y % 4 ? 2 : 0); x < 47; x += 5) r(x, y, 4, 1, '#808088'); h(37, 1, 46, '#4a4a50');
  r(0, 43, 48, 5, '#b8b4ac');
});
// 碧南市藤井達吉現代美術館：黒っぽい縦板の切妻の建物に、大きなガラスの箱。右に黒い板の壁、前の階段
spotSprites.hekinanFujiiMuseum = hiCanvas((r, h) => {
  const DK = '#343e4f', DL = '#2a3242';
  spanRows(h, 9, [[20, 33], [16, 36], [12, 39], [8, 41], [4, 42], [2, 43]], '#3c485f'); h(9, 20, 33, '#4c5a72');
  r(2, 15, 40, 22, DK); for (let x = 3; x < 42; x += 2) r(x, 15, 1, 22, DL);
  r(18, 12, 18, 25, '#608197'); for (let x = 18; x < 36; x += 3) r(x, 12, 1, 25, '#4a6070'); for (let y = 12; y < 37; y += 6) h(y, 18, 35, '#4a6070'); for (let i = 0; i < 10; i++) r(20 + i, 13 + i, 2, 1, '#a8c4d4');
  r(37, 10, 9, 27, '#2e3646'); for (let x = 38; x < 46; x += 2) r(x, 10, 1, 27, '#3c4658'); r(40, 18, 2, 2, '#c84a3a'); r(40, 22, 2, 2, '#c84a3a');
  r(10, 33, 8, 4, '#a8343a');
  spanRows(h, 37, [[16, 38], [15, 39], [14, 40]], i => i % 2 ? '#9a9a96' : '#b8b8b4'); r(0, 40, 48, 8, '#6a6a6a'); for (let x = 2; x < 30; x += 4) r(x, 42, 2, 6, '#e8e8e8');
});
// 大浜熊野大神社：石の明神鳥居、左右に台座の上の狛犬、奥にしめ縄と白い幕の拝殿、白っぽい参道の砂利
spotSprites.hekinanKumano = hiCanvas((r, h) => {
  const ST = '#b8b4a6', SD = '#8a8678';
  spanRows(h, 16, [[16, 31], [14, 33], [14, 33]], '#6a6a70'); r(16, 19, 16, 8, '#6a4a32'); r(17, 20, 14, 2, '#f4f2ec'); r(21, 22, 6, 5, '#3a2a20'); h(21, 18, 29, '#e8d8a0');   // 奥の拝殿
  h(6, 6, 41, ST); h(7, 7, 40, ST); h(8, 8, 39, SD); r(5, 5, 1, 1, ST); r(42, 5, 1, 1, ST); h(12, 10, 37, ST); h(13, 10, 37, SD);   // 鳥居
  r(13, 8, 3, 28, ST); r(32, 8, 3, 28, ST); r(15, 8, 1, 28, SD); r(34, 8, 1, 28, SD); r(22, 8, 4, 4, ST);
  for (const x of [1, 38]) { r(x + 1, 22, 6, 4, '#a8a498'); r(x + 2, 20, 3, 2, '#a8a498'); r(x, 26, 9, 2, '#c8c4b8'); r(x, 28, 9, 8, '#9a968a'); for (let y = 29; y < 36; y += 2) h(y, x, x + 8, '#8a8678'); }   // 狛犬と台座
  for (const x of [8, 34]) { r(x, 20, 1, 16, '#9a9a9a'); spanRows(h, 18, [[x, x], [x - 1, x + 1]], '#9a9a9a'); }
  r(0, 36, 48, 12, '#bab7a5'); spanRows(h, 36, [[19, 28], [18, 29], [17, 30], [16, 31], [15, 32], [14, 33], [13, 34], [12, 35], [11, 36], [10, 37], [9, 38], [8, 39]], '#ccc9b8');
});
// 哲学たいけん村 無我苑：銀ねずの瓦の寄棟屋根の平屋（黒っぽい木とガラス戸）、手前に芝生と庭石、両わきに木
spotSprites.hekinanMugaen = hiCanvas((r, h) => {
  tileRoof(r, h, 14, [[16, 39], [14, 41], [12, 43], [10, 45], [9, 46], [8, 47]], ['#c8c2c8', '#ada6ac', '#5a5458', '#968e94']);
  r(11, 20, 34, 11, '#2a2a24'); for (let x = 12; x < 44; x += 4) { r(x, 21, 3, 7, '#6a7a7c'); r(x, 21, 3, 1, '#9aacae'); } h(30, 11, 44, '#5a4a38');
  pix(r, ['...######...', '.##########.', '############', '############', '############', '.##########.', '...######...'], 0, 6, '#3f7a34'); r(5, 13, 2, 18, '#5a4030'); h(7, 3, 7, '#5a9a44');
  pix(r, ['..####..', '.######.', '########', '########', '.######.'], 38, 10, '#4f8a3a'); r(41, 15, 2, 6, '#5a4030');
  r(0, 31, 48, 17, '#7a9a3d'); for (const [x, y] of [[3, 40], [12, 44], [30, 42], [40, 46], [22, 38]]) r(x, y, 4, 1, '#8aaa4d');
  r(26, 33, 22, 6, '#c8c4b8'); for (const [x, y, w] of [[18, 36, 5], [28, 35, 4], [34, 38, 6], [12, 39, 4]]) { r(x, y, w, 2, '#8a8680'); h(y, x, x + w - 1, '#a8a49e'); }   // 庭石と砂利
});
// 応仁寺（碧南）：銀ねずの瓦の大屋根の本堂、こげ茶の木の正面、左右に石灯籠と五色の幕、正面の参道
spotSprites.hekinanOninji = hiCanvas((r, h) => {
  h(5, 13, 34, '#6a686c'); tileRoof(r, h, 6, [[12, 35], [11, 36], [10, 37], [9, 38], [8, 39], [7, 40], [5, 42], [3, 44], [2, 45], [1, 46], [1, 46]], ['#b8b6ba', '#9a989c', '#4a484c', '#858388']);
  r(4, 17, 40, 15, '#3a2c26'); for (const x of [4, 12, 20, 27, 35, 43]) r(x, 17, 1, 15, '#5a4636'); h(17, 4, 43, '#5a4636');
  for (const [a, b] of [[5, 11], [36, 42]]) { for (let x = a; x <= b; x += 2) r(x, 19, 1, 9, '#6a5444'); h(23, a, b, '#6a5444'); }
  r(14, 21, 20, 9, '#e8d8b0'); for (const [x, c] of [[14, '#3a6ac0'], [18, '#e8c840'], [22, '#c83a3a'], [26, '#f4f4f4'], [30, '#e88a30']]) r(x, 21, 4, 2, c);   // 五色の幕
  r(16, 24, 16, 6, '#2a201c'); h(32, 3, 44, '#8a6a50'); r(12, 33, 24, 2, '#c8a87a');
  for (const x of [6, 38]) { r(x + 1, 28, 3, 1, '#a8a49c'); r(x, 29, 5, 2, '#a8a49c'); r(x + 1, 31, 3, 2, '#e8d8a0'); r(x, 33, 5, 1, '#a8a49c'); r(x + 1, 34, 3, 4, '#9a968e'); r(x, 38, 5, 2, '#b8b4ac'); }   // 石灯籠
  r(0, 40, 48, 8, '#c8c4bc'); spanRows(h, 40, [[19, 28], [18, 29], [17, 30], [16, 31], [15, 32], [14, 33], [13, 34], [12, 35]], '#a8a49c');
});
// 名鉄 碧南駅：灰色の高い箱に駅名の看板、手前に低くて長い黒っぽい屋根の駅舎、前の横断歩道
spotSprites.hekinanStation = hiCanvas((r, h) => {
  r(12, 6, 22, 18, '#6a7078'); h(6, 12, 33, '#8a9098'); r(14, 9, 9, 3, '#e8e8e8'); r(15, 10, 1, 1, '#2f5fae'); for (let x = 17; x < 22; x += 2) r(x, 10, 1, 1, '#333'); r(34, 10, 10, 14, '#c8ccd0');
  tileRoof(r, h, 20, [[3, 46], [2, 47], [1, 47], [0, 47]], ['#7a7b80', '#616266', '#3a3b3e', '#55565a']);
  r(2, 24, 44, 9, '#26252a'); for (let x = 4; x < 45; x += 5) r(x, 25, 3, 6, '#6a7a82'); for (const x of [2, 18, 30, 45]) r(x, 24, 1, 9, '#8a8a8e');
  r(38, 26, 2, 7, '#d23a2e'); r(44, 22, 2, 11, '#3a3a3e'); r(44, 23, 2, 6, '#5a5c60');
  r(0, 33, 48, 2, '#9a9a96'); r(0, 35, 48, 13, '#4a4a4c'); for (let x = 2; x < 46; x += 4) r(x, 39, 3, 6, '#e8e8e8');
});
// 名鉄 碧南中央駅：白い駅ビルに、サーモン色の丸いアーチの入口の屋根、2階の白いアーチ窓。前の歩道に黄色い点字ブロック
spotSprites.hekinanChuoStation = hiCanvas((r, h) => {
  r(0, 10, 48, 25, '#ecebe6'); h(10, 0, 47, '#f8f8f6'); h(11, 0, 47, '#c8c8c4');
  for (let x = 1; x < 30; x += 3) { r(x, 13, 2, 5, '#8a9aa4'); r(x, 13, 2, 1, '#ecebe6'); }   // 2階のアーチ窓
  r(18, 18, 30, 2, '#c87a72'); spanRows(h, 14, [[24, 31], [22, 33], [21, 34], [20, 35]], '#c87a72'); spanRows(h, 16, [[25, 30], [24, 31], [23, 32]], '#ecebe6');   // アーチの屋根
  r(26, 14, 8, 2, '#f8f8f8'); r(27, 14, 2, 1, '#2f5fae');
  r(2, 22, 14, 10, '#6a7a84'); for (let x = 2; x < 16; x += 3) r(x, 22, 1, 10, '#c8ccd0');
  r(22, 22, 12, 13, '#3a4650'); r(23, 23, 10, 9, '#5a6a74'); for (const x of [20, 35]) r(x, 20, 2, 15, '#f4f4f2');
  r(37, 22, 10, 10, '#6a7a84'); for (let x = 37; x < 47; x += 3) r(x, 22, 1, 10, '#c8ccd0');
  r(0, 35, 48, 13, '#d8d0c4'); for (let y = 37; y < 48; y += 3) h(y, 0, 47, '#c8c0b4'); spanRows(h, 41, [[0, 5], [5, 11], [11, 17], [17, 23], [23, 29], [29, 35]], '#d8b040');
  for (const x of [4, 12, 20]) r(x, 33, 2, 5, '#3a3a3e');
});
// 碧南市役所：銀ねずの大きな四角すいの屋根の棟と、右の高い庁舎（ガラスの階段塔）。ベージュの壁
spotSprites.hekinanCityhall = hiCanvas((r, h) => {
  r(28, 4, 14, 32, '#c8c4b8'); spanRows(h, 1, [[33, 41], [30, 42], [28, 42]], '#4a5060'); for (let y = 8; y < 34; y += 4) for (let x = 30; x < 40; x += 3) r(x, y, 2, 2, '#4a5868');
  r(39, 2, 4, 34, '#2e3947'); for (let y = 3; y < 35; y += 2) h(y, 39, 42, '#6a8aa8'); r(40, 0, 1, 2, '#6a6a70');
  r(14, 2, 2, 7, '#8a8a90'); r(13, 1, 4, 1, '#8a8a90');
  for (let k = 0; k < 14; k++) h(8 + k, 15 - Math.round(k * 1.1), 16 + Math.round(k * 1.1), k < 6 ? '#c4c0b6' : '#aeaba1'); for (let k = 2; k < 14; k += 2) h(8 + k, 15 - Math.round(k * 1.1) + 1, 16 + Math.round(k * 1.1) - 1, '#9e9b91');   // 四角すいの屋根
  h(22, 0, 31, '#7a786e'); r(1, 23, 30, 13, '#d4d0c4'); for (let x = 3; x < 30; x += 5) r(x, 26, 3, 6, '#4a5868'); r(13, 25, 6, 10, '#5a6a7a');
  r(0, 36, 48, 3, '#8a8a86'); r(0, 39, 48, 9, '#5a5a5c'); for (const x of [6, 21]) { r(x, 28, 1, 11, '#5a4030'); r(x - 2, 29, 2, 1, '#5a4030'); r(x + 1, 30, 2, 1, '#5a4030'); r(x - 3, 28, 1, 1, '#5a4030'); r(x + 3, 29, 1, 1, '#5a4030'); }   // 冬の街路樹
});
// 名鉄 高浜港駅：白い漆喰の壁に黒い瓦屋根の蔵づくりの駅舎、腰はなまこ壁（白と黒の格子）、窓の上に小さなひさし
spotSprites.takahamaMinatoStation = hiCanvas((r, h) => {
  const BR = ['#4a4c54', '#2e3036', '#16171a', '#3e4048'];
  tileRoof(r, h, 12, [[14, 44], [13, 45], [12, 46], [12, 46]], BR); tileRoof(r, h, 18, [[1, 13], [0, 14], [0, 14]], BR);
  r(12, 16, 34, 18, '#f0efea'); r(1, 21, 12, 13, '#f0efea'); h(16, 12, 45, '#d8d6d0');
  r(33, 18, 10, 3, '#ffffff'); r(34, 19, 2, 1, '#2f5fae'); for (let x = 37; x < 42; x += 2) r(x, 19, 1, 1, '#333');
  for (const [x, w] of [[4, 6], [19, 7], [30, 13]]) { h(23, x - 1, x + w, '#2e3036'); h(24, x - 1, x + w, '#4a4c54'); }   // ひさし
  r(4, 25, 5, 4, '#3a3a3e'); r(19, 25, 6, 4, '#3a3a3e'); r(30, 25, 5, 9, '#5a6670'); r(36, 25, 6, 4, '#7a8a94');
  r(1, 29, 45, 5, '#2a2a2e'); for (let y = 29; y < 34; y++) for (let x = 1 + ((y - 29) % 2); x < 46; x += 2) r(x, y, 1, 1, '#f0f0f0');   // なまこ壁
  r(30, 29, 5, 5, '#5a6670'); r(0, 34, 48, 14, '#4a4a4c'); h(34, 0, 47, '#6a6a6c');
});
// 高浜の春日神社：銀ねずの瓦の大屋根の拝殿、赤茶の木の正面と格子、しめ縄、右に台座の上の狛犬、左に赤い灯籠の柱
spotSprites.takahamaKasuga = hiCanvas((r, h) => {
  tileRoof(r, h, 4, [[18, 41], [16, 43], [14, 45], [12, 46], [10, 47], [8, 47], [6, 47], [5, 47]], ['#e2e0e4', '#c8c6ca', '#6a686c', '#a8a6aa']); h(3, 19, 40, '#8a888c');
  r(10, 12, 36, 20, '#4a2a2a'); for (const x of [10, 17, 24, 31, 38, 45]) r(x, 12, 1, 20, '#6a3a34');
  for (const [a, b] of [[11, 16], [32, 37], [39, 44]]) { for (let x = a; x <= b; x += 2) r(x, 14, 1, 12, '#7a4a3e'); for (let y = 14; y < 26; y += 3) h(y, a, b, '#7a4a3e'); }
  r(18, 16, 13, 10, '#2a1a1a'); h(14, 12, 44, '#e8d8a0'); for (const x of [16, 24, 32]) r(x, 15, 1, 3, '#ffffff');   // しめ縄と紙垂
  h(32, 9, 46, '#8a6a50'); spanRows(h, 33, [[18, 31], [17, 32], [16, 33]], i => i % 2 ? '#a8a49c' : '#c8c4bc');
  r(4, 4, 1, 34, '#c83a2a'); r(3, 3, 3, 2, '#c83a2a'); r(1, 26, 7, 8, '#d8d0b8'); r(2, 27, 5, 6, '#f4f0e0');   // 赤い灯籠の柱と掲示板
  r(38, 22, 6, 5, '#b8b4a8'); r(39, 20, 3, 2, '#b8b4a8'); r(37, 27, 8, 2, '#c8c4b8'); r(37, 29, 8, 8, '#a8a498'); h(31, 37, 44, '#8a8678');   // 狛犬
  r(0, 37, 48, 11, '#e8e6e0'); h(37, 0, 47, '#d0cec8');
});
// 大山緑地（高浜）：丸い石の台に立つ、茶色いやきもののたぬきの大きな像と、まわりの木
spotSprites.takahamaOyama = hiCanvas((r, h) => {
  const BM = '#6a4030', BL = '#8a5a40', BD = '#3e2418';
  for (const [x, y] of [[0, 6], [36, 4], [2, 20], [38, 18]]) { r(x, y, 10, 10, '#2f6a2a'); r(x + 2, y + 1, 5, 3, '#4f8a3a'); }
  pix(r, ['.##....', '####...'], 18, 2, BD); r(17, 4, 12, 9, BM); r(19, 5, 4, 3, BL); r(26, 6, 3, 2, '#2a1810'); r(28, 9, 3, 2, BM);   // 頭（右を向いて鼻をあげる）
  spanRows(h, 13, [[15, 31], [14, 32], [13, 33], [13, 33], [13, 33], [13, 33], [13, 33], [13, 33], [13, 33], [14, 32], [14, 32], [14, 32], [14, 32], [15, 31], [15, 31], [15, 31], [15, 31], [15, 31], [14, 32], [14, 32], [13, 33], [13, 33]], i => i % 5 === 1 ? BL : BM);
  for (const y of [18, 24, 30]) h(y, 15, 31, '#5a3424'); r(22, 14, 2, 20, '#5a3424'); r(12, 16, 3, 9, BM); r(32, 16, 3, 9, BM); r(13, 17, 1, 6, BL);   // 着物のしま・腕
  r(16, 35, 6, 2, BD); r(25, 35, 6, 2, BD);   // 足
  spanRows(h, 37, [[9, 38], [7, 40], [6, 41], [6, 41]], i => i ? '#4a4648' : '#6a6668'); r(0, 41, 48, 7, '#7a8a5a'); h(41, 0, 47, '#9aaa6a');
});
// 名鉄 三河高浜駅：白い曲線の駅舎に赤レンガ色の箱と屋根の塔、うしろに高いマンション
spotSprites.takahamaMikawaTakahamaStation = hiCanvas((r, h) => {
  const WH = '#ecebe8', WS = '#c8c6c2', BR = '#8a3a2e', AP = '#9a8e82', AD = '#6f6963';
  r(26, 0, 16, 26, AP); r(38, 0, 4, 26, AD); for (let y = 2; y < 26; y += 3) h(y, 26, 41, AD); for (let y = 3; y < 26; y += 3) for (let x = 28; x < 38; x += 3) r(x, y, 2, 1, '#c8c0b4');   // マンション
  r(2, 16, 42, 16, WH); h(16, 2, 43, '#f8f8f6'); r(2, 24, 42, 1, WS);
  spanRows(h, 12, [[6, 20], [4, 22], [3, 23]], WH); r(10, 9, 6, 4, BR); spanRows(h, 7, [[11, 14], [10, 15]], '#5a4a48');   // 赤い塔と屋根
  r(14, 18, 10, 4, '#3a3a40'); for (let x = 15; x < 24; x += 2) r(x, 18, 1, 4, '#7a8088'); r(4, 18, 3, 3, '#3a3a40'); for (let x = 27; x < 42; x += 4) r(x, 19, 2, 4, '#3a3a40');
  for (let i = 0; i < 10; i++) r(26 + i * 2, 24 - Math.floor(i / 1.5), 3, 1, WS);   // 外の階段
  r(8, 32, 14, 9, BR); r(10, 34, 3, 3, '#5a2a22'); r(16, 34, 3, 3, '#5a2a22'); r(24, 32, 18, 9, WS); r(30, 32, 6, 9, BR);
  r(4, 32, 2, 9, '#e0dedb'); r(42, 32, 2, 9, '#e0dedb'); r(0, 41, 48, 7, '#8a8682'); h(41, 0, 47, '#a8a49e');
});
// 名鉄 吉浜駅：かまぼこ形の屋根の白い小さな駅舎に駅名の看板、赤・白・青の自動販売機。右に「人形小路」の赤いのぼり
spotSprites.takahamaYoshihamaStation = hiCanvas((r, h) => {
  const WH = '#ecebe8';
  spanRows(h, 12, [[10, 33], [7, 36], [5, 38], [4, 39]], i => i ? '#9caeb7' : '#b8c8d0');
  r(4, 16, 36, 22, WH); h(16, 4, 39, '#d0d4d8');
  r(12, 18, 20, 3, '#ffffff'); r(13, 19, 2, 1, '#2f5fae'); for (let x = 17; x < 31; x += 2) r(x, 19, 1, 1, '#222'); h(21, 12, 31, '#3f7fbf');   // 駅名
  r(5, 24, 8, 14, '#4a4846'); r(6, 26, 6, 5, '#8a9298');
  for (const [x, c] of [[15, '#d42a2a'], [21, '#f4f4f4'], [27, '#2a4aa8']]) { r(x, 25, 5, 12, c); r(x + 1, 26, 3, 4, '#cfd8e0'); h(30, x + 1, x + 3, '#444'); }   // 自動販売機
  h(37, 4, 39, '#7a5a40'); r(33, 26, 3, 11, '#a8a8a8');
  r(43, 3, 1, 38, '#7a4a3a'); r(39, 4, 4, 14, '#c8302a'); for (let y = 6; y < 17; y += 3) r(40, y, 2, 2, '#ffffff');   // 人形小路ののぼり
  r(0, 38, 48, 10, '#8a8682'); h(38, 0, 47, '#a09a94'); for (const x of [12, 20]) r(x, 40, 1, 5, '#b8b8b8');
});
// 高浜市役所：白い建物に灰色の市松もようのパネル、黒い窓の列、屋上に白いアンテナの丸、手前に瓦屋根の玄関
spotSprites.takahamaCityhall = hiCanvas((r, h) => {
  r(4, 8, 10, 32, '#e8e8e8'); r(4, 8, 2, 32, '#f8f8f8'); r(5, 4, 3, 3, '#f4f4f4'); r(9, 3, 4, 4, '#f4f4f4'); r(9, 3, 1, 1, '#cccccc');   // 白い塔とアンテナ
  r(14, 10, 32, 26, '#d4d4d8'); for (let y = 10; y < 36; y += 4) for (let x = 14 + ((y / 4) % 2) * 4; x < 46; x += 8) r(x, y, 4, 4, '#a4a4a8');   // 市松もよう
  for (const y of [15, 24]) for (let x = 16; x < 45; x += 3) r(x, y, 2, 4, '#2a3440');
  h(10, 14, 45, '#e8e8ec');
  tileRoof(r, h, 31, [[16, 46], [14, 47], [13, 47]], ['#8a8a90', '#6a6a70', '#444448', '#5a5a60']); r(16, 34, 30, 6, '#4a4a50'); r(24, 35, 10, 5, '#2a3440');
  r(22, 37, 8, 4, '#d8d8d8'); for (let x = 23; x < 30; x += 2) r(x, 37, 1, 4, '#b0b0b0');   // 前の丸い囲い
  r(0, 40, 48, 8, '#6f6e6d'); h(40, 0, 47, '#8a8a88'); r(30, 43, 8, 1, '#c8a040');
});
// 本光寺（幸田・あじさい寺）：赤茶にぬった板の小さなお堂と、銀ねずの瓦の宝形屋根
spotSprites.kotaHonkoji = hiCanvas((r, h) => {
  r(23, 2, 2, 3, '#5a5a5e'); r(22, 5, 4, 1, '#7a7a7e');
  tileRoof(r, h, 6, [[19, 28], [17, 30], [15, 32], [13, 34], [11, 36], [9, 38], [7, 40], [5, 42], [4, 43]], ['#b8b8bc', '#9f9fa4', '#5a5a60', '#8a8a90']);
  h(15, 6, 41, '#d8d4c8'); r(9, 16, 30, 18, '#7a3a2a'); r(9, 16, 30, 2, '#5a2a20');
  for (const x of [9, 18, 29, 38]) r(x, 16, 1, 18, '#5a2a20'); r(19, 20, 10, 14, '#6a3020'); r(23, 20, 2, 14, '#4a2018');
  for (const x0 of [11, 31]) { r(x0, 20, 6, 8, '#6a3020'); for (let x = x0; x < x0 + 6; x += 2) r(x, 20, 1, 8, '#8a4a38'); }   // 格子窓
  h(34, 6, 41, '#8a7a68'); h(35, 6, 41, '#6a5a48'); for (const x of [8, 39]) r(x, 36, 2, 4, '#6a5a48');
  r(0, 40, 48, 8, '#a8a090'); h(40, 0, 47, '#c0b8a8'); pix(r, ['.####.', '######', '######'], 40, 36, '#3f7a34');
});
// 幸田町郷土資料館：赤い波板の屋根の平屋、白い壁と窓、手前の植えこみと館名の白い柱
spotSprites.kotaKyodoShiryokan = hiCanvas((r, h) => {
  spanRows(h, 14, [[6, 41], [4, 43], [3, 44], [2, 45]], i => i < 2 ? '#c06a58' : '#a85648'); for (let x = 4; x < 45; x += 2) r(x, 15, 1, 3, '#d8806c'); h(18, 2, 45, '#7a3a30');
  r(4, 19, 40, 13, '#ecebe6'); for (const x of [6, 13, 27, 35]) { r(x, 21, 6, 6, '#6f8fa8'); r(x, 21, 6, 1, '#9fb8cc'); r(x + 3, 21, 1, 6, '#ecebe6'); } r(20, 22, 5, 10, '#4a4440');
  r(0, 32, 48, 8, '#4a7a2a'); h(32, 0, 47, '#6a9a3a'); for (let x = 2; x < 48; x += 5) r(x, 33, 2, 1, '#8aba4a');
  r(37, 6, 4, 30, '#f8f8f8'); for (let y = 8; y < 34; y += 3) r(38, y, 2, 2, '#222');   // 館名の柱
  r(0, 40, 48, 8, '#6a6a68'); h(40, 0, 47, '#8a8a88');
});
// 幸田文化広場：「幸田文化広場」と彫った大きな石と、つつじの花、うしろのしだれ桜
spotSprites.kotaBunkaHiroba = hiCanvas((r, h) => {
  spanRows(h, 0, [[10, 37], [6, 41], [3, 44], [2, 45], [1, 46], [1, 46], [1, 46], [2, 45]], i => i % 3 === 1 ? '#f4c8d8' : '#e8a8c0');   // しだれ桜のこずえ
  for (let x = 2; x < 46; x += 3) r(x, 8, 2, 5 + (x % 7), (x % 2) ? '#e8a8c0' : '#f0b8cc');   // たれさがる枝の花
  r(22, 6, 3, 10, '#6a4a3a');
  spanRows(h, 15, [[5, 42], [4, 43], [3, 44], [3, 44], [3, 44], [3, 44], [3, 44], [3, 44], [3, 44], [3, 44], [3, 44], [3, 44], [4, 43], [4, 43], [5, 42]], i => i < 2 ? '#b8a090' : i > 11 ? '#8a6a5a' : '#a08878');
  for (let i = 0; i < 6; i++) { const x = 7 + i * 6; r(x, 19, 4, 1, '#4a3a30'); r(x + 1, 20, 1, 3, '#4a3a30'); r(x, 22, 4, 1, '#4a3a30'); r(x + 3, 20, 1, 2, '#5a4a40'); }   // 彫った字「幸田文化広場」
  h(25, 14, 18, '#5a4a40'); h(25, 26, 32, '#5a4a40');
  r(0, 30, 48, 18, '#3f7a34'); for (const [x, y] of [[2, 31], [9, 33], [16, 31], [23, 34], [30, 32], [37, 31], [43, 34], [5, 38], [20, 39], [35, 38], [12, 43], [28, 42], [41, 42]]) { r(x, y, 3, 2, '#d0306a'); r(x + 1, y, 1, 1, '#f070a0'); }   // つつじ
});
// 道の駅 筆柿の里・幸田：濃い灰色の大きな屋根に三角の明かり窓がふたつ、ガラスの店先と、うしろの山
spotSprites.kotaMichinoeki = hiCanvas((r, h) => {
  r(0, 4, 48, 14, '#3f6a34'); for (let x = 0; x < 48; x += 6) { r(x, 2 + (x % 4), 6, 4, '#3f6a34'); r(x + 1, 4, 3, 2, '#5a8a44'); }   // うしろの山
  tileRoof(r, h, 16, [[4, 43], [2, 45], [1, 46], [0, 47], [0, 47]], ['#7a7980', '#5e5d64', '#3a393e', '#4e4d54']);
  for (const cx of [14, 34]) for (let k = 0; k < 6; k++) { h(12 + k, cx - k - 1, cx + k + 1, '#5e5d64'); if (k > 1) h(12 + k, cx - k + 1, cx + k - 1, '#a8c0d0'); }   // 三角の明かり窓
  r(1, 21, 46, 13, '#8a7a62'); for (let x = 3; x < 46; x += 6) r(x, 23, 4, 9, '#4a5560'); for (let x = 2; x < 47; x += 6) r(x, 21, 1, 13, '#5a4a3a');
  r(18, 22, 10, 2, '#c87a30'); r(20, 22, 6, 1, '#f0e0c0');   // 看板
  r(0, 34, 48, 14, '#8a8a88'); for (let x = 4; x < 48; x += 8) r(x, 36, 1, 8, '#f4f4f4'); for (const x of [6, 26, 38]) r(x, 35, 1, 2, '#e05a20');
});
// 菱池の排水機場（幸田）：干拓地の水を川へ出す、赤い屋根の白い機械小屋と、れんがの水門・黒い鉄の柱、手前の水路
spotSprites.kotaHishiike = hiCanvas((r, h) => {
  spanRows(h, 6, [[16, 41], [15, 42], [14, 43]], i => i ? '#a84838' : '#c05a48');
  r(17, 9, 24, 13, '#e0d8c8'); r(17, 9, 24, 2, '#c8c0b0'); r(21, 12, 4, 4, '#6f8fa8'); r(31, 12, 4, 4, '#6f8fa8');
  r(9, 12, 9, 10, '#d8d4cc'); r(9, 12, 9, 1, '#b8b4ac'); r(11, 14, 3, 3, '#6f8fa8'); r(3, 8, 7, 2, '#7a7a7a'); for (const x of [4, 8]) r(x, 10, 1, 4, '#8a8a8a');   // となりの小屋と手すり
  r(0, 22, 48, 3, '#7aa898'); for (let x = 0; x < 48; x += 3) r(x, 20, 1, 3, '#5a8a7a');   // 緑の柵
  r(4, 25, 13, 12, '#7a4a3a'); for (let y = 26; y < 37; y += 2) h(y, 4, 16, '#8a5a48'); spanRows(h, 30, [[8, 12], [7, 13], [7, 13]], '#2a1e18');   // れんがの水門（アーチ）
  r(17, 25, 26, 12, '#3a3632'); for (let x = 18; x < 43; x += 3) r(x, 25, 1, 12, '#5a4a3a'); h(25, 17, 42, '#6a625a');
  r(40, 16, 3, 9, '#3a7ab8'); r(42, 14, 5, 3, '#3a7ab8');   // 青い管
  r(0, 37, 48, 11, '#4a5a50'); for (const [x, y] of [[4, 40], [18, 43], [30, 40], [40, 44]]) r(x, y, 5, 1, '#6a7a70');
  spanRows(h, 36, [[0, 4], [0, 3], [0, 2], [0, 1]], '#8a9a5a');
});
// ハッピネス・ヒル・幸田：うすいピンクの壁に、銀色のゆるい丸屋根の大きなホール。左に低い棟、前に木の列
spotSprites.kotaHappinessHill = hiCanvas((r, h) => {
  spanRows(h, 10, [[18, 30], [14, 34], [11, 37], [9, 39], [8, 40]], i => i < 2 ? '#c8d0dc' : '#a8b4c4'); r(22, 7, 4, 3, '#a8b4c4'); h(15, 8, 40, '#7a8494');
  r(9, 16, 31, 18, '#d8b4a4'); r(9, 16, 31, 2, '#c8a090'); for (const x of [10, 37]) r(x, 16, 2, 18, '#e8c8b8');
  r(16, 19, 18, 4, '#5e666c'); for (let x = 17; x < 34; x += 3) r(x, 19, 1, 4, '#9aa4ac'); r(14, 26, 22, 3, '#5e666c'); for (let x = 15; x < 36; x += 3) r(x, 26, 1, 3, '#9aa4ac');
  r(0, 22, 10, 12, '#e8c8b8'); r(0, 22, 10, 1, '#c8a090'); r(2, 25, 6, 3, '#5e666c');
  r(40, 20, 8, 14, '#e8c8b8'); r(42, 23, 4, 3, '#5e666c');
  for (let x = 0; x < 48; x += 7) { r(x, 30, 6, 5, '#4a7a34'); r(x + 1, 30, 3, 1, '#6a9a44'); r(x + 2, 35, 1, 3, '#6a4a3a'); }
  r(0, 38, 48, 10, '#7aa848'); h(38, 0, 47, '#9ac860');
});
// 幸田町役場：茶色いれんがタイルの6階建て、横長の窓の帯が重なる。屋上にアンテナ、前に旗ざおと植えこみ
spotSprites.kotaTownhall = hiCanvas((r, h) => {
  const BS = '#b8683f', BM = '#a0583a', BD = '#7b533a';
  r(12, 7, 30, 31, BM); r(12, 7, 22, 31, BS); r(34, 7, 8, 31, BD); h(7, 12, 41, '#c8784a');
  for (const y of [11, 16, 21, 26]) { r(14, y, 19, 2, '#3a3236'); r(35, y, 6, 2, '#2a2428'); }
  r(30, 4, 3, 3, '#e8e8e8'); r(31, 3, 1, 1, '#cccccc');   // アンテナ
  r(14, 31, 14, 7, '#3a3236'); r(16, 30, 10, 1, '#c8784a'); r(17, 32, 8, 6, '#5a6470');
  for (const x of [4, 7, 10]) { r(x, 18, 1, 22, '#c8c8c8'); r(x + 1, 18, 2, 2, x === 7 ? '#d23a2e' : '#3a8a3a'); }   // 旗ざお
  r(0, 38, 48, 4, '#3f7a34'); h(38, 0, 47, '#5a9a44'); r(0, 42, 48, 6, '#6a6a68'); for (let x = 4; x < 48; x += 6) r(x, 44, 3, 1, '#f4f4f4');
});
// JR 幸田駅：白い駅舎にガラスの正面と薄いひさし、赤いポスト・自動販売機、ヤシの木
spotSprites.kotaStation = hiCanvas((r, h) => {
  r(0, 14, 14, 24, '#ecebe6'); for (let y = 18; y < 34; y += 4) r(1, y, 12, 2, '#a8b8c0');   // 左の白い建物
  r(14, 16, 32, 3, '#f4f2ec'); h(18, 14, 45, '#c8c4bc'); r(15, 19, 30, 19, '#e8e6e0');
  r(17, 21, 14, 17, '#4a5560'); for (let x = 17; x < 31; x += 4) r(x, 21, 1, 17, '#dcdcd8'); r(19, 23, 2, 6, '#8fa8b8');
  r(33, 21, 8, 3, '#d87a30'); r(34, 22, 6, 1, '#f8f0e0'); r(33, 25, 10, 12, '#f4f4f4'); for (let x = 34; x < 43; x += 3) r(x, 26, 2, 5, '#8ab0d0');   // 看板・自動販売機
  r(12, 31, 3, 6, '#d23a2e'); h(31, 12, 14, '#e8584a');
  for (const [x, y] of [[4, 2], [9, 5]]) { r(x + 2, y + 4, 1, 32 - y, '#7a6a50'); pix(r, ['#..#..#', '.#.#.#.', '..###..', '.#.#.#.', '#..#..#'], x, y, '#3f7a34'); }   // ヤシの木
  r(0, 38, 48, 10, '#8a8a88'); h(38, 0, 47, '#a8a8a4');
});
// JR 三ケ根駅：線路の上をまたぐ、クリーム色の壁と赤茶の屋根の橋上駅舎、両側の白い階段
spotSprites.kotaSanganeStation = hiCanvas((r, h) => {
  spanRows(h, 10, [[10, 37], [9, 38], [8, 39]], i => i ? '#8a4a40' : '#a85a50');
  r(9, 13, 30, 9, '#ece4d4'); for (let x = 12; x < 37; x += 4) r(x, 15, 3, 3, '#6f8fa8'); r(9, 21, 30, 1, '#c8c0b0');
  r(9, 22, 30, 16, '#6a625a'); for (const x of [9, 19, 28, 37]) r(x, 22, 2, 16, '#d8d0c0');   // 駅舎の下（暗い）と柱
  spanRows(h, 22, [[0, 9], [0, 8], [0, 7], [0, 6], [0, 5], [0, 4], [0, 3], [0, 2]], '#f4f4f2'); spanRows(h, 22, [[39, 47], [40, 47], [41, 47], [42, 47], [43, 47], [44, 47], [45, 47], [46, 47]], '#f4f4f2');
  for (let i = 0; i < 16; i++) { r(Math.max(0, 9 - Math.floor(i / 2)), 22 + i, 1, 1, '#a8a8a8'); r(Math.min(47, 38 + Math.floor(i / 2)), 22 + i, 1, 1, '#a8a8a8'); }   // 白い階段と手すり
  r(13, 30, 20, 8, '#e8e0d0'); r(16, 32, 5, 6, '#4a4a50'); r(24, 32, 6, 3, '#6f8fa8');
  r(0, 38, 48, 10, '#8a8682'); h(38, 0, 47, '#a8a49e'); r(42, 30, 6, 8, '#a83a2a'); h(30, 42, 47, '#f4f4f4');   // 赤いトイレの小屋
});
// JR 相見駅：ガラスばりの明るい駅舎と、白い大きな箱の建物、前に並ぶ黒い柱
spotSprites.kotaAimiStation = hiCanvas((r, h) => {
  r(24, 12, 22, 24, '#e8ecf0'); h(12, 24, 45, '#f8f8fa'); for (let x = 26; x < 45; x += 4) r(x, 16, 2, 2, '#a8b4c4');   // 白い箱
  r(4, 10, 22, 26, '#8aa8c8'); h(10, 4, 25, '#e8ecf0'); for (let x = 5; x < 26; x += 2) r(x, 11, 1, 25, '#b8cce0'); for (let i = 0; i < 10; i++) r(5 + i, 12 + i, 2, 1, '#dce8f4');   // ガラスの棟
  r(18, 14, 8, 6, '#ffffff'); r(19, 15, 2, 2, '#d23a2e'); r(22, 16, 3, 1, '#333');   // JR の看板
  r(26, 18, 6, 18, '#6aa0c0'); r(26, 18, 6, 1, '#f8f8fa');
  for (let x = 2; x < 46; x += 4) r(x, 28, 2, 10, '#3a3a40');   // 黒い柱の列
  r(0, 38, 48, 10, '#d8d0c0'); h(38, 0, 47, '#e8e0d0'); r(0, 44, 48, 4, '#6a6a68');
});
// 竹島・八百富神社（蒲郡）：大きな木にかこまれた、緑青の銅屋根の社殿と、白いのぼり、石灯籠、敷石の参道
spotSprites.gamagoriTakeshima = hiCanvas((r, h) => {
  for (const [x, y, w] of [[0, 0, 14], [34, 0, 14], [0, 10, 10], [38, 12, 10]]) { r(x, y, w, 12, '#2f5a28'); r(x + 2, y + 2, w - 5, 3, '#4a7a38'); } r(6, 18, 3, 22, '#4a3a2a'); r(40, 20, 3, 20, '#4a3a2a');
  spanRows(h, 12, [[14, 33], [12, 35], [11, 36], [10, 37]], i => i ? '#6f8a76' : '#8aa890'); spanRows(h, 9, [[20, 27], [18, 29], [17, 30]], '#6f8a76'); h(16, 10, 37, '#3a4a3a');
  r(12, 17, 24, 13, '#4a3a2a'); r(19, 19, 10, 11, '#2a2018'); r(20, 19, 8, 1, '#c8a050'); for (const x of [12, 18, 29, 35]) r(x, 17, 1, 13, '#6a5038');
  r(15, 4, 3, 26, '#f4f4f4'); r(30, 6, 3, 24, '#f4f4f4'); for (let y = 6; y < 28; y += 3) { r(16, y, 1, 2, '#222'); r(31, y + 1, 1, 2, '#222'); }   // のぼり
  r(37, 26, 4, 2, '#9a968c'); r(38, 28, 2, 2, '#ffe27a'); r(38, 30, 2, 6, '#9a968c'); r(36, 36, 6, 2, '#9a968c');   // 石灯籠
  r(0, 30, 48, 18, '#b0a48d'); spanRows(h, 30, [[20, 27], [19, 28], [19, 28], [18, 29], [18, 29], [17, 30], [17, 30], [16, 31], [16, 31], [15, 32], [15, 32], [14, 33], [14, 33], [13, 34], [13, 34], [12, 35], [12, 35], [11, 36]], i => i % 3 ? '#cfc6b4' : '#a89c88');
});
// 竹島水族館（蒲郡）：紺色の帯に白い丸と魚のもよう、上に「竹島水族館」の看板、白い建物と木
spotSprites.gamagoriAquarium = hiCanvas((r, h) => {
  r(2, 10, 12, 8, '#d8d4cc'); r(28, 8, 10, 6, '#d8d4cc');
  for (let i = 0; i < 5; i++) { r(10 + i * 5, 11, 4, 4, '#2a3a6a'); r(11 + i * 5, 12, 2, 2, '#ffffff'); } r(40, 10, 6, 3, '#2a3a6a');   // 看板の字のかこみ
  r(0, 16, 48, 9, '#1c2b4d'); for (const [x, y] of [[3, 18], [9, 20], [15, 18], [21, 20], [27, 18], [33, 20], [39, 18], [44, 20]]) { r(x, y, 3, 3, '#e8f0f8'); r(x + 1, y + 1, 1, 1, '#6a8ab8'); }   // 白い丸（水の泡）
  h(16, 0, 47, '#3a4a7a'); r(0, 25, 48, 12, '#e8e8e8'); h(25, 0, 47, '#c8c8c8');
  r(10, 27, 22, 9, '#b8bcc4'); for (let x = 11; x < 32; x += 2) r(x, 27, 1, 9, '#ececec'); r(34, 28, 8, 8, '#3a4a5a');
  pix(r, ['..####..', '.######.', '########', '.######.', '..####..'], 36, 24, '#3f8a3a'); r(39, 29, 2, 8, '#6a4a3a'); pix(r, ['.####.', '######', '.####.'], 1, 28, '#3f8a3a'); r(3, 31, 1, 6, '#6a4a3a');
  r(0, 37, 48, 11, '#8a8682'); h(37, 0, 47, '#a8a49e');
});
// JR・名鉄 蒲郡駅：高架の長い駅（白い屋根と灰色の駅舎）と、前のロータリーに立つ白い帆の記念碑、うしろの山
spotSprites.gamagoriStation = hiCanvas((r, h) => {
  spanRows(h, 4, [[0, 10], [0, 18], [0, 26], [0, 34], [0, 47], [0, 47]], i => i % 2 ? '#4f7a4a' : '#3f6a3a');   // うしろの山
  r(0, 10, 48, 4, '#c8c4c0'); for (let x = 2; x < 48; x += 8) r(x, 8, 6, 2, '#f4f4f4');   // 駅の白い屋根
  r(0, 14, 48, 6, '#7a7880'); for (let x = 1; x < 48; x += 3) r(x, 15, 2, 3, '#a8b0bc'); h(20, 0, 47, '#5a5860');
  for (let x = 3; x < 48; x += 8) r(x, 21, 2, 4, '#9a9aa0');
  spanRows(h, 25, [[0, 47], [0, 47]], '#8a8682'); r(0, 27, 48, 21, '#9a948c');
  spanRows(h, 31, [[14, 33], [11, 36], [10, 37], [10, 37], [11, 36], [14, 33]], '#6aa04a'); h(31, 14, 33, '#e8e8e8'); h(36, 14, 33, '#e8e8e8');   // ロータリーの芝
  r(23, 8, 1, 26, '#e8e8e8'); spanRows(h, 26, [[20, 23], [18, 23], [16, 23], [14, 30]], '#f8f8f8'); r(18, 32, 12, 2, '#f8f8f8');   // 白い帆の記念碑
  for (const [x, y] of [[2, 36], [40, 34], [6, 42], [36, 42]]) { r(x, y, 5, 4, '#3f7a34'); r(x + 2, y + 4, 1, 2, '#6a4a3a'); }
});

// ---- 48×48 の名所の絵（OpenStreetMap の名所。日本語版ウィキペディアの代表画像を見て、色と比率を写真に合わせて描いたもの） ----
// 名鉄 形原駅：平らなひさしの小さな駅舎、白い駅名板、青い自動販売機、手前に植えこみ
spotSprites.osmN282405440 = hiCanvas((r, h) => {
  r(2, 10, 18, 26, '#e8e4dc'); for (let y = 14; y < 34; y += 5) r(5, y, 4, 3, '#6f8fa8'); h(10, 2, 19, '#c8c4bc');
  r(14, 16, 32, 3, '#5a5a58'); h(16, 14, 45, '#7a7a78'); r(26, 13, 14, 3, '#f4f4f4'); h(14, 28, 37, '#3a6ac0');
  r(16, 19, 28, 17, '#d8d6d0'); r(18, 21, 12, 15, '#4a5a66'); for (const x of [21, 25]) r(x, 21, 1, 15, '#c8ccd0'); r(33, 22, 9, 8, '#6f8fa8');
  r(9, 26, 4, 10, '#2a5fb0'); r(10, 27, 2, 3, '#d8e4f4'); r(4, 32, 3, 4, '#3a6ac0');
  pix(r, ['.####...', '########'], 0, 34, '#3f7a34'); r(0, 36, 48, 12, '#7a7a78'); for (let x = 2; x < 48; x += 8) r(x, 41, 5, 1, '#f4f4f4');
});
// 名鉄 三河鹿島駅：線路ぎわの低いホームと、トタン屋根の待合所、架線の柱
spotSprites.osmN282405435 = hiCanvas((r, h) => {
  r(4, 4, 2, 30, '#8a8a88'); h(6, 0, 47, '#5a5a58'); r(40, 2, 2, 32, '#8a8a88');
  r(12, 14, 30, 3, '#6a6a68'); h(13, 13, 42, '#8a8a88'); r(14, 17, 1, 11, '#5a5a58'); r(39, 17, 1, 11, '#5a5a58'); r(16, 19, 22, 9, '#c8b8a0'); r(18, 20, 8, 5, '#6f8fa8');
  r(8, 28, 40, 6, '#b8b4ac'); h(28, 8, 47, '#d8b860'); r(8, 34, 40, 2, '#8a867e');
  r(0, 37, 48, 11, '#7a6450'); for (const y of [39, 44]) h(y, 0, 47, '#a8a8a8'); for (let x = 1; x < 48; x += 3) r(x, 40, 2, 4, '#5a4a3a');
});
// 蒲郡市博物館：打ち放しコンクリートの箱形の建物が2つ、パネルの目地
spotSprites.osmN1423997078 = hiCanvas((r, h) => {
  r(2, 14, 18, 24, '#9aa0a6'); r(2, 14, 18, 3, '#b8bec4'); r(20, 6, 26, 32, '#808894'); r(20, 6, 26, 3, '#a8b0b8'); r(20, 9, 4, 29, '#9aa2aa');
  for (let x = 26; x < 46; x += 6) r(x, 9, 1, 29, '#6e7680'); for (let y = 16; y < 38; y += 8) h(y, 20, 45, '#6e7680');
  r(6, 22, 8, 4, '#3a4048'); r(26, 30, 12, 8, '#2e343c'); r(0, 38, 48, 3, '#a8a49c'); for (let y = 39; y < 43; y++) h(y, 10 + (y - 39) * 2, 22 + (y - 39) * 2, '#c8c4bc'); r(0, 43, 48, 5, '#c0bcb2');
});
// 生命の海科学館：柱で持ち上げた横長の建物、上は木の格子のような茶色い外壁、下はガラスと外階段
spotSprites.osmN1423992783 = hiCanvas((r, h) => {
  spanRows(h, 8, [[6, 41], [3, 44], [2, 45]], '#3a3a3a'); r(2, 11, 44, 14, '#7a6a5a'); for (let x = 3; x < 46; x += 2) r(x, 11, 1, 14, '#5a4c40'); for (const y of [15, 20]) h(y, 2, 45, '#8a7a68');
  r(4, 25, 40, 3, '#a8a49c'); for (const x of [6, 18, 30, 42]) r(x, 28, 2, 10, '#8a8a88');
  r(10, 29, 18, 9, '#4a5a66'); for (const x of [14, 19, 24]) r(x, 29, 1, 9, '#c8ccd0'); for (let i = 0; i < 8; i++) r(32 + i, 37 - i, 3, 1, '#d8d8d4');
  r(0, 38, 48, 3, '#b8b4ac'); r(0, 41, 48, 7, '#6a6a6a'); for (let x = 3; x < 48; x += 9) r(x, 44, 5, 1, '#e8e8e8');
});
// 海辺の文学記念館：白い板張りの洋館、紫がかった灰色の寄棟屋根、縦長の窓と玄関のポーチ
spotSprites.osmN1423990918 = hiCanvas((r, h) => {
  spanRows(h, 9, [[14, 39], [12, 41], [10, 43], [8, 45], [6, 46]], i => i < 2 ? '#7a7690' : '#5a5670'); h(14, 6, 46, '#3e3a50');
  r(8, 15, 37, 20, '#f2f0ea'); for (let y = 16; y < 35; y += 2) h(y, 8, 44, '#d8d6ce'); for (const x of [26, 31, 36, 41]) { r(x, 18, 3, 10, '#3e4a58'); r(x, 18, 3, 1, '#ffffff'); }
  spanRows(h, 16, [[11, 18], [9, 20], [8, 21]], '#5a5670'); r(9, 19, 11, 16, '#f2f0ea'); r(12, 23, 5, 12, '#7a4a30'); r(10, 19, 1, 16, '#c8c6be'); r(19, 19, 1, 16, '#c8c6be');
  r(4, 35, 44, 3, '#b8b0a0'); for (let y = 36; y < 40; y++) h(y, 9 - (y - 36), 20 + (y - 36), '#c8c4bc'); pix(r, ['.#####......', '############'], 30, 33, '#3f7a34'); r(0, 40, 48, 8, '#7fae5a');
});
// 岡崎市役所：こげ茶のタイルの棟と、白い鉄骨のトラスがあるガラスの中央部、手前に花だん
spotSprites.osmN1423979758 = hiCanvas((r, h) => {
  r(0, 8, 12, 32, '#5a4c46'); for (let y = 10; y < 38; y += 3) r(2, y, 8, 1, '#3a3e48'); r(10, 4, 4, 36, '#6d6f74');
  r(14, 6, 26, 34, '#4a5a6a'); for (let y = 8; y < 38; y += 4) h(y, 14, 39, '#8a9aa8');
  for (let i = 0; i < 12; i++) { r(15 + i, 7 + i * 2, 2, 2, '#f4f4f4'); r(37 - i, 7 + i * 2, 2, 2, '#f4f4f4'); } for (const x of [14, 26, 38]) r(x, 6, 2, 34, '#e8e8e8');
  r(40, 22, 8, 18, '#5a6a7a'); for (let x = 40; x < 48; x += 2) r(x, 24, 1, 2, '#e8e8e8'); r(43, 4, 1, 18, '#c8c8c8'); r(44, 5, 3, 2, '#d23a2e');
  r(0, 40, 48, 3, '#c8c4bc'); h(43, 0, 47, '#e05a8a'); h(44, 0, 47, '#3f7a34'); r(0, 45, 48, 3, '#a8a49c');
});
// 碧南市民図書館：木立の中の、空を映すゆるいカーブのガラスの建物と芝生
spotSprites.osmN1423994228 = hiCanvas((r, h) => {
  r(8, 12, 34, 24, '#7c9faf'); spanRows(h, 10, [[14, 36], [10, 40]], '#a8c4d0'); for (let y = 14; y < 32; y += 3) h(y, 8, 41, '#9ab8c8'); for (let x = 11; x < 42; x += 5) r(x, 12, 1, 20, '#5a7a8a');
  r(8, 32, 34, 4, '#d8d6d0'); r(18, 33, 12, 3, '#3f4a52');
  r(0, 6, 10, 26, '#3f8a34'); r(2, 8, 5, 6, '#6fba50'); r(4, 32, 2, 6, '#5a4030'); r(40, 14, 8, 20, '#3f8a34'); r(42, 16, 4, 5, '#6fba50'); r(43, 34, 2, 4, '#5a4030');
  r(0, 36, 48, 12, '#6fae4a'); spanRows(h, 40, [[14, 34], [12, 36]], '#c08a70'); r(16, 37, 10, 1, '#8a6a4a');
});
// 竹島ファンタジー館：大きな貝がらで飾った外壁と青い看板、白いアーチの屋根
spotSprites.osmN1423997068 = hiCanvas((r, h) => {
  r(4, 10, 40, 30, '#d8d4cc'); spanRows(h, 6, [[10, 37], [6, 41], [4, 43]], '#f4f4f4'); for (let x = 6; x < 44; x += 4) r(x, 8, 1, 2, '#a8b0b8');
  r(10, 12, 28, 4, '#2a5fb0'); for (let x = 12; x < 36; x += 3) r(x, 13, 2, 2, '#ffffff');
  for (const [x, y] of [[6, 18], [14, 20], [26, 18], [36, 21], [9, 28], [31, 29]]) { pix(r, ['.###.', '#####', '#####', '.###.'], x, y, '#f0ece4'); r(x + 1, y + 1, 1, 2, '#c8c0b4'); r(x + 3, y + 1, 1, 2, '#c8c0b4'); }
  r(4, 24, 40, 1, '#3a7ab8'); r(18, 28, 10, 12, '#3f4a52'); r(0, 40, 48, 8, '#a8a49c'); h(40, 0, 47, '#4a8ac8');
});
// 岡崎信用金庫資料館：赤レンガに白い石の帯と角の飾り、縦長の窓（大正の洋館）
spotSprites.osmN1423979695 = hiCanvas((r, h) => {
  const BR = '#b0503a', ST = '#e8e4dc';
  r(6, 8, 36, 32, BR); for (let y = 10; y < 40; y += 3) h(y, 6, 41, '#984232'); r(6, 6, 36, 3, ST); for (const x of [6, 16, 32, 40]) r(x, 6, 2, 34, ST);
  spanRows(h, 2, [[18, 29], [16, 31]], ST); r(20, 1, 8, 1, '#a8a49c');
  for (const x of [10, 24, 35]) for (const y of [12, 26]) { r(x, y, 3, 8, '#3e4a58'); h(y - 1, x - 1, x + 3, ST); h(y + 8, x - 1, x + 3, ST); }
  r(20, 12, 8, 14, '#f0ece4'); r(21, 30, 6, 10, '#4a3a2a'); h(29, 20, 27, ST); r(0, 40, 48, 3, '#c8c4bc'); pix(r, ['.######.', '########'], 0, 38, '#3f7a34'); r(0, 43, 48, 5, '#a8a49c');
});
// 高浜市立図書館：赤茶のタイル張りの、段のある箱形の建物と、低い植えこみ
spotSprites.osmN1424004882 = hiCanvas((r, h) => {
  r(4, 18, 20, 20, '#7a4a40'); r(18, 8, 28, 30, '#8a5a4c'); h(8, 18, 45, '#a06a5a'); h(18, 4, 23, '#9a6a5a');
  for (let y = 11; y < 38; y += 3) h(y, 18, 45, '#7a4a40'); for (let x = 20; x < 46; x += 4) r(x, 8, 1, 30, '#7a4a40');
  r(4, 26, 20, 2, '#5a3a32'); r(28, 30, 12, 8, '#3a3e48'); r(8, 30, 10, 8, '#4a5058');
  r(0, 38, 48, 3, '#b8b4ac'); pix(r, ['..####...####.', '##############'], 4, 36, '#4f8a3a'); r(0, 41, 48, 7, '#9a9894'); for (let y = 42; y < 47; y++) h(y, 30 - (y - 42) * 2, 34 + (y - 42), '#b8b4ac');
});
// JR 三河塩津駅：線路をまたぐ白い橋上駅舎と、青い屋根の階段、駅名板
spotSprites.osmN3999572949 = hiCanvas((r, h) => {
  r(24, 6, 20, 14, '#f0f0ec'); h(6, 24, 43, '#3a7ab8'); r(26, 9, 16, 4, '#6f8fa8'); r(30, 3, 10, 3, '#ffffff'); h(4, 31, 38, '#3a6ac0');
  for (let i = 0; i < 18; i++) { r(6 + i, 30 - i, 3, 1, '#e8e8e4'); r(6 + i, 29 - i, 1, 1, '#3a7ab8'); } for (let i = 0; i < 18; i += 3) r(7 + i, 31 - i, 1, 3, '#a8a8a4');
  r(24, 20, 20, 3, '#c8c8c4'); for (const x of [26, 41]) r(x, 23, 2, 14, '#d8d8d4'); r(2, 30, 18, 7, '#e8e4dc'); r(4, 32, 5, 3, '#6f8fa8');
  r(0, 37, 48, 4, '#a2a29f'); r(0, 41, 48, 7, '#5a4d40'); for (const y of [42, 45]) h(y, 0, 47, '#9a9a9a');
});
// 愛知環状鉄道 北岡崎駅：ベージュのコンクリートの駅舎、青い帯、駅名板、手前のつつじ
spotSprites.osmN2573765930 = hiCanvas((r, h) => {
  r(2, 8, 44, 6, '#d8d0c0'); r(28, 4, 14, 5, '#ffffff'); h(6, 30, 39, '#3a6ac0'); r(2, 14, 44, 3, '#c8c0b0');
  r(2, 17, 44, 16, '#e8e0d0'); r(2, 21, 44, 4, '#2a5a9a'); for (let x = 4; x < 46; x += 6) r(x, 21, 1, 4, '#d8d0c0'); for (const x of [8, 20, 32]) r(x, 17, 2, 16, '#c8c0b0');
  r(14, 26, 18, 7, '#4a5a66'); for (const x of [18, 23, 28]) r(x, 26, 1, 7, '#c8ccd0');
  pix(r, ['..#####.....######..', '####################', '####################'], 6, 32, '#3f7a34'); for (const [x, y] of [[9, 33], [14, 32], [28, 33], [33, 32], [37, 33]]) r(x, y, 3, 2, '#e05a8a');
  r(0, 35, 48, 13, '#8a8a88'); h(35, 0, 47, '#a8a49c');
});
// 五井山：海の向こうにそびえる、なだらかな山並みと、ふもとの港町
spotSprites.osmN2128311596 = hiCanvas((r, h) => {
  for (let y = 10; y < 30; y++) { const k = y - 10; h(y, Math.max(0, 22 - k * 2), Math.min(47, 26 + k * 2), y < 16 ? '#5a5e5a' : '#494b4f'); }
  for (let y = 18; y < 30; y++) h(y, 0, Math.min(18, (y - 18) * 2), '#5a5e60');
  for (const [x, y] of [[20, 14], [26, 16], [14, 22], [32, 20]]) r(x, y, 2, 1, '#6a6e6a');
  r(0, 28, 48, 4, '#e8e4dc'); for (let x = 1; x < 48; x += 4) r(x, 26, 3, 3, ['#ffffff', '#c8c4bc', '#d8d0c0'][x % 3]);
  r(0, 32, 48, 16, '#3a5a8a'); for (const [x, y] of [[4, 35], [16, 39], [30, 36], [40, 42], [10, 44]]) r(x, y, 4, 1, '#6a8ab0'); r(18, 31, 14, 2, '#a8a49c');
});
// 長瀬八幡宮：銅板ぶきの大きな入母屋屋根の拝殿、太いしめ縄、こま犬と石灯籠
spotSprites.osmN3702950015 = hiCanvas((r, h) => {
  spanRows(h, 4, [[12, 35], [10, 37], [8, 39], [6, 41], [5, 42], [3, 44], [2, 45]], i => i < 3 ? '#8a95a8' : '#728199'); h(11, 1, 46, '#4a5468'); r(1, 10, 1, 1, '#4a5468'); r(46, 10, 1, 1, '#4a5468');
  for (let k = 0; k < 4; k++) h(1 + k, 22 - k, 25 + k, k ? '#d8d4c8' : '#728199');
  r(6, 12, 36, 18, '#5a4636'); for (const x of [6, 13, 20, 27, 34, 41]) r(x, 12, 1, 18, '#38322f'); r(16, 16, 16, 14, '#2a2420');
  spanRows(h, 14, [[14, 33], [16, 31]], '#e8d8a8'); for (const x of [18, 23, 28]) r(x, 16, 1, 3, '#ffffff');
  for (const x of [2, 42]) { r(x, 24, 4, 4, '#b8b2a6'); r(x + 1, 22, 2, 2, '#b8b2a6'); r(x, 28, 4, 4, '#8a857a'); }
  r(0, 30, 48, 3, '#a8a49a'); for (let y = 33; y < 48; y++) h(y, 18 - (y - 33), 29 + (y - 33), y % 2 ? '#c8c3b8' : '#b0aa9e');
});
// 村積山：三河の富士と呼ばれる、とがった形の緑の山と、ふもとの家並み
spotSprites.osmN3282065243 = hiCanvas((r, h) => {
  for (let y = 6; y < 32; y++) { const k = y - 6; h(y, Math.max(0, 24 - Math.round(k * 1.6)), Math.min(47, 24 + Math.round(k * 1.6)), y % 4 ? '#5f7f58' : '#6f8f60'); }
  for (const [x, y] of [[20, 12], [28, 16], [14, 22], [34, 24], [24, 26]]) r(x, y, 3, 2, '#4a6a40');
  for (const [x, c] of [[4, '#e8e4dc'], [12, '#7a7a78'], [24, '#f0ece4'], [33, '#5a6068'], [41, '#e8e4dc']]) { r(x, 28, 7, 6, c); h(27, x, x + 6, '#4a4f57'); r(x + 2, 30, 2, 2, '#3e4a58'); }
  r(0, 34, 48, 14, '#6fae4a'); for (let y = 37; y < 48; y += 3) h(y, 0, 47, '#5f9e3a');
});
// 北野廃寺跡：芝生の広場に、昔のお寺の礎石が四角く並ぶ跡
spotSprites.osmN4582252211 = hiCanvas((r, h) => {
  for (let x = 0; x < 48; x += 6) { r(x, 8, 5, 8, '#3f7a34'); r(x + 1, 6, 3, 2, '#5a9a44'); } r(0, 16, 48, 32, '#7fae5a'); for (let y = 20; y < 48; y += 4) h(y, 0, 47, '#6f9e4a');
  r(6, 22, 36, 14, '#c8bfa8'); h(22, 6, 41, '#d8d0b8'); for (let y = 24; y < 35; y += 4) for (let x = 9; x < 40; x += 5) { r(x, y, 3, 2, '#a8a090'); r(x, y, 3, 1, '#d8d4c8'); }
  r(38, 38, 3, 8, '#8a7a5a'); r(36, 36, 7, 3, '#f0ece4'); for (let x = 4; x < 46; x += 4) r(x, 44, 2, 1, '#5f8e3a');
});
// 信光明寺 観音堂：反りの強い檜皮ぶきの屋根（禅宗様）、こげ茶の板壁と花頭窓、白い幕
spotSprites.osmN4582212644 = hiCanvas((r, h) => {
  for (let y = 6; y < 20; y++) { const k = y - 6; h(y, Math.max(0, 14 - k), Math.min(47, 33 + k), y < 10 ? '#a88a80' : '#957a7b'); }
  h(20, 0, 47, '#5a3e36'); r(0, 18, 2, 2, '#5a3e36'); r(46, 18, 2, 2, '#5a3e36'); r(18, 4, 12, 2, '#6a4e46'); for (let x = 2; x < 46; x += 2) r(x, 21, 1, 1, '#8a6a5a');
  r(8, 22, 32, 14, '#5a4038'); for (const x of [8, 15, 32, 39]) r(x, 22, 1, 14, '#7a6460');
  for (const x of [10, 34]) { r(x, 25, 4, 6, '#d8d4cc'); r(x + 1, 24, 2, 1, '#d8d4cc'); } r(17, 24, 14, 5, '#f4f0e8'); r(18, 29, 12, 7, '#2a2420');
  r(6, 36, 36, 3, '#c8c4bc'); h(39, 4, 43, '#a8a49c'); r(18, 40, 12, 3, '#d8d4cc'); r(0, 43, 48, 5, '#b8b2a6');
});
// 松明院：銀ねずの瓦の大きな本堂、白い壁、手前に松と砂利の参道
spotSprites.osmN4582212642 = hiCanvas((r, h) => {
  tileRoof(r, h, 8, [[14, 37], [12, 39], [10, 41], [8, 43], [6, 45], [5, 46]], ['#b8bcc4', '#959da5', '#5a6068', '#7a8088']);
  r(8, 14, 36, 12, '#f0ece4'); for (const x of [8, 16, 26, 36, 43]) r(x, 14, 1, 12, '#6a5040'); r(20, 17, 12, 9, '#3a2e26'); h(14, 8, 43, '#8a7a68');
  r(0, 12, 6, 14, '#e8e4dc'); tileRoof(r, h, 10, [[0, 6], [0, 7]], ['#b8bcc4', '#959da5', '#5a6068', '#7a8088']);
  for (const [x, y] of [[2, 22], [8, 18], [4, 26]]) { pix(r, PINE, x, y, '#2f6a3a'); h(y, x + 2, x + 4, '#4f8a4a'); } r(7, 29, 1, 8, '#6a4a30');
  r(0, 26, 48, 22, '#a8a49c'); for (let y = 30; y < 48; y += 3) h(y, 0, 47, '#9a968e'); for (let y = 30; y < 48; y++) h(y, 24 - (y - 30), 30 - (y - 30) * 0.3 | 0, '#8a8680');
});
// 龍渓院：銀ねずの瓦の大きな寄棟屋根の本堂、白い壁と格子、手前の芝生と石の参道
spotSprites.osmN4582212599 = hiCanvas((r, h) => {
  tileRoof(r, h, 6, [[12, 35], [10, 37], [8, 39], [6, 41], [4, 43], [3, 44], [2, 45], [1, 46]], ['#a8b0b8', '#8a929a', '#4a5058', '#6e767e']);
  r(4, 14, 40, 14, '#f0ece4'); for (let x = 4; x < 44; x += 5) r(x, 14, 1, 14, '#5a4636'); h(14, 4, 43, '#7a6a58');
  for (const x0 of [6, 31]) { r(x0, 17, 10, 8, '#3a2e26'); for (let x = x0 + 1; x < x0 + 10; x += 2) r(x, 17, 1, 8, '#6a5a48'); } r(18, 17, 12, 11, '#2a2420');
  r(2, 28, 44, 3, '#b8b4ac'); r(0, 31, 48, 17, '#7fae5a'); for (let y = 31; y < 48; y++) h(y, 21 - Math.round((y - 31) * 0.4), 26 + Math.round((y - 31) * 0.4), '#c8c4bc');
  r(36, 30, 2, 10, '#8a8a88'); r(35, 29, 4, 2, '#5a5a58');
});
// 山中八幡宮：朱ぬりの拝殿、銀ねずの屋根に唐破風、両わきのこま犬と石の参道
spotSprites.osmN4681388235 = hiCanvas((r, h) => {
  const VR = '#c84a2e';
  spanRows(h, 8, [[12, 35], [10, 37], [8, 39], [6, 41], [4, 43]], i => i < 2 ? '#8a8282' : '#6c615f'); h(13, 3, 44, '#3e3434');
  for (let k = 0; k < 4; k++) h(5 + k, 22 - k * 2, 25 + k * 2, '#6c615f'); h(9, 15, 32, '#e8e4dc');
  r(6, 14, 36, 14, VR); for (const x of [6, 13, 20, 27, 34, 41]) r(x, 14, 1, 14, '#8a2a1a'); r(14, 17, 20, 11, '#3e2a26'); h(18, 14, 33, '#e8d8a8'); for (const x of [18, 24, 30]) r(x, 19, 1, 2, '#ffffff');
  h(28, 4, 43, '#a83a22'); r(4, 29, 40, 2, '#8a857a');
  for (const x of [3, 41]) { r(x, 30, 4, 3, '#b8b2a6'); r(x + 1, 28, 2, 2, '#b8b2a6'); r(x - 1, 33, 6, 6, '#8a857a'); }
  r(0, 39, 48, 9, '#a89a70'); for (let y = 31; y < 48; y++) h(y, 21 - Math.round((y - 31) * 0.3), 26 + Math.round((y - 31) * 0.3), '#c8c3b8');
});
// 本宗寺：大きな銀ねずの瓦屋根の本堂、白い柱が並ぶ正面と広い石段
spotSprites.osmN4682981430 = hiCanvas((r, h) => {
  tileRoof(r, h, 8, [[12, 35], [10, 37], [8, 39], [6, 41], [4, 43], [2, 45], [1, 46]], ['#b4bcc4', '#959da5', '#4e545c', '#7a828a']);
  for (let k = 0; k < 3; k++) h(5 + k, 22 - k * 2, 25 + k * 2, k ? '#e8e4dc' : '#4e545c');
  r(5, 15, 38, 15, '#e8e0d0'); for (const x of [5, 11, 17, 23, 29, 35, 42]) r(x, 15, 2, 15, '#f4f0e8'); r(13, 18, 22, 12, '#4a3a2e'); for (let x = 14; x < 35; x += 3) r(x, 18, 1, 12, '#6a5a48'); h(15, 5, 42, '#8a7a68');
  h(30, 3, 44, '#a8a49c'); for (let y = 31; y < 38; y++) h(y, 12 - (y - 31), 35 + (y - 31), y % 2 ? '#d8d4cc' : '#b8b4ac');
  for (const [x, y] of [[0, 26], [42, 24]]) { pix(r, PINE, x, y, '#2f6a3a'); h(y, x + 2, x + 4, '#4f8a4a'); } r(0, 38, 48, 10, '#c8b890');
});
// 鴨田天満宮：銀ねずの瓦屋根の拝殿に白い幕（黒い梅の紋）、手前に石の臥牛
spotSprites.osmN4686350152 = hiCanvas((r, h) => {
  tileRoof(r, h, 4, [[14, 33], [12, 35], [10, 37], [8, 39], [7, 40]], ['#a8a8ac', '#8a8a90', '#4a4a50', '#6a6a70']);
  r(10, 9, 28, 14, '#6a5040'); r(12, 11, 24, 6, '#f4f2ec'); for (const x of [16, 23, 30]) { r(x, 12, 3, 3, '#222'); r(x + 1, 11, 1, 1, '#222'); } r(16, 17, 16, 6, '#2a2420');
  r(4, 23, 40, 2, '#a8a49c'); for (const x of [6, 39]) { r(x, 16, 3, 1, '#a8a49c'); r(x - 1, 17, 5, 2, '#a8a49c'); r(x, 19, 3, 5, '#a8a49c'); }
  r(0, 25, 48, 23, '#8a8478'); for (let y = 27; y < 48; y += 3) h(y, 0, 47, '#7a746a');
  r(7, 39, 32, 5, '#5e5a52'); h(39, 7, 38, '#6e6a62');   // 牛の台座
  spanRows(h, 31, [[14, 30], [11, 33], [9, 35], [8, 36], [8, 36], [9, 35], [10, 34]], i => i < 2 ? '#e8e4dc' : i < 5 ? '#d0ccc4' : '#b0aca4');   // 臥牛
  r(30, 27, 8, 6, '#d8d4cc'); h(27, 31, 37, '#ece8e0'); r(36, 26, 2, 2, '#c8c4bc'); r(31, 26, 2, 2, '#c8c4bc'); r(35, 29, 1, 1, '#333'); h(33, 29, 34, '#c03a2e');
});
// 名鉄の小さな駅舎（白い壁、青緑のかまぼこ屋根のふち、下は茶色のタイル、駅名の看板）を描く部品
function mtHutB2(r, h, { x0 = 4, x1 = 43, top = 14, roof = '#5f9e98', band = true, sign = [14, 33], door = [8, 15] } = {}) {
  const WW = '#e8eae8', WS = '#c8ccce';
  h(top, x0 + 5, x1 - 5, '#8cc4be'); h(top + 1, x0 + 2, x1 - 2, roof); h(top + 2, x0, x1, roof); h(top + 3, x0, x1, '#3e706c');
  r(x0 + 1, top + 4, x1 - x0 - 1, 41 - top - 3, WW); r(x1 - 6, top + 4, 5, 41 - top - 3, WS);
  if (band) { r(x0 + 1, 34, x1 - x0 - 1, 8, '#7a5a44'); for (const y of [36, 39]) h(y, x0 + 1, x1 - 1, '#5e4434'); }
  if (sign) { r(sign[0], top + 6, sign[1] - sign[0] + 1, 4, '#ffffff'); r(sign[0] + 1, top + 7, 2, 2, '#2f5fae'); for (let x = sign[0] + 4; x < sign[1] - 1; x += 2) r(x, top + 7, 1, 2, '#222'); h(top + 9, sign[0] + 4, sign[1] - 1, '#d23a2e'); }
  if (door) r(door[0], top + 11, door[1] - door[0] + 1, 41 - top - 10, '#2e3438');
  r(0, 42, 48, 6, '#8a8a88');
}
// 知立神社：緑青の銅ぶきの大きな屋根に唐破風、こげ茶の木の拝殿としめ縄、手前の石灯籠と狛犬
spotSprites.osmN5307157026 = hiCanvas((r, h) => {
  for (let y = 2; y < 16; y++) { const k = y - 2, a = 17 - k, b = 30 + k; h(y, a, b, y < 6 ? '#5e4a3c' : '#4a3a2e'); for (let x = a + 1 + (y % 2); x < b; x += 3) r(x, y, 1, 1, '#3a2c22'); r(a, y, 1, 1, '#5f8f74'); r(b, y, 1, 1, '#5f8f74'); }
  h(1, 18, 29, '#5f8f74'); h(16, 1, 46, '#5f8f74'); h(17, 2, 45, '#2e241c'); r(1, 15, 1, 1, '#5f8f74'); r(46, 15, 1, 1, '#5f8f74');   // 緑青の棟と軒先
  for (let k = 0; k < 5; k++) h(11 + k, 22 - k, 25 + k, k === 4 ? '#5f8f74' : '#5a4636');   // 唐破風
  r(6, 18, 36, 12, '#43352a'); for (const x of [6, 13, 20, 27, 34, 41]) r(x, 18, 1, 12, '#6a5440'); r(18, 20, 12, 10, '#20160e'); for (let x = 8; x < 18; x += 2) r(x, 21, 1, 6, '#6a5440');
  h(19, 8, 39, '#efe4c8'); h(20, 9, 38, '#d8c8a0'); for (const x of [14, 23, 32]) r(x, 21, 1, 2, '#ffffff');
  h(30, 3, 44, '#a8a49a'); r(0, 31, 48, 17, '#d8d4c8');
  r(8, 32, 4, 2, '#a8a49a'); r(7, 34, 6, 3, '#a8a49a'); r(9, 35, 2, 1, '#f2d27a'); r(9, 37, 2, 6, '#a8a49a'); r(7, 43, 6, 2, '#8a857a');   // 石灯籠
  for (const x of [22, 36]) { r(x, 35, 5, 5, '#c8c4bc'); r(x + 1, 33, 3, 2, '#c8c4bc'); r(x, 40, 6, 4, '#9a968c'); }   // 狛犬
});
// 恩任寺：銀ねずの瓦の大屋根の本堂、こげ茶の木の壁と縁、手前に石灯籠と松
spotSprites.osmN5118172505 = hiCanvas((r, h) => {
  tileRoof(r, h, 4, [[14, 37], [11, 40], [8, 43], [6, 45], [4, 46], [3, 47], [2, 47], [1, 47]], ['#c4ccd6', '#8e9bad', '#4a525e', '#76808e']);
  r(4, 12, 43, 18, '#2e3530'); for (let x = 5; x < 47; x += 6) r(x, 12, 1, 18, '#5a5048'); for (let x = 8; x < 46; x += 6) r(x, 15, 3, 9, '#4a4440'); h(12, 4, 46, '#6a6058');
  h(30, 2, 47, '#7a6a58'); h(31, 2, 47, '#4a3e34'); r(3, 32, 44, 6, '#3a3028'); for (let x = 4; x < 46; x += 7) r(x, 32, 2, 6, '#6a5a48');
  r(20, 26, 6, 2, '#9a968c'); r(19, 28, 8, 4, '#a8a49a'); r(21, 29, 4, 2, '#e8d08a'); r(22, 32, 2, 8, '#9a968c'); r(18, 40, 10, 3, '#8a857a');   // 石灯籠
  for (const [x, y] of [[29, 22], [33, 26], [27, 28]]) { pix(r, PINE, x, y, '#3f7a34'); h(y, x + 2, x + 4, '#6fa04a'); } r(32, 30, 1, 12, '#5a4030');
  r(0, 43, 48, 5, '#c8c3b8');
});
// 西尾口駅（高架下）：コンクリートの柱と天井の下に、名鉄の駅名の看板、階段とタイルの壁、赤い自動販売機
spotSprites.osmN6057440275 = hiCanvas((r, h) => {
  r(0, 4, 48, 6, '#c8c8c4'); h(9, 0, 47, '#9a9a96'); r(0, 10, 6, 32, '#d8d8d4'); r(42, 10, 6, 32, '#d8d8d4'); r(4, 10, 2, 32, '#b0b0ac');
  r(6, 10, 36, 32, '#a8968a'); for (let y = 12; y < 42; y += 3) h(y, 6, 41, '#94827a');
  r(12, 12, 24, 5, '#ffffff'); r(13, 13, 3, 3, '#2f5fae'); for (let x = 18; x < 34; x += 2) r(x, 13, 1, 2, '#222'); h(16, 17, 34, '#d23a2e');
  r(15, 19, 18, 23, '#6a6c70'); for (let y = 22; y < 42; y += 2) h(y, 16, 31, '#8a8c90'); r(15, 19, 18, 2, '#3a3c40');
  r(36, 26, 4, 14, '#d23a2e'); r(37, 28, 2, 4, '#f4f4f4'); r(7, 30, 6, 12, '#e8e8e4'); for (let x = 8; x < 13; x += 2) r(x, 30, 1, 12, '#b8b8b4');
  r(0, 42, 48, 6, '#9a9a96'); r(22, 42, 4, 6, '#e0c040');
});
// 六名駅：道の上をまたぐ高架の線路とホーム（柵と屋根）、太いコンクリートの柱、小さな駅名の看板
spotSprites.osmN7056162176 = hiCanvas((r, h) => {
  r(0, 10, 48, 2, '#c8ccd0'); for (let x = 1; x < 48; x += 3) r(x, 6, 1, 4, '#b8bcc0'); h(6, 0, 47, '#d0d4d8');
  r(0, 12, 48, 6, '#b8b8b2'); h(17, 0, 47, '#8a8a84');
  for (const x of [4, 20, 36]) { r(x, 18, 7, 22, '#c4c2ba'); r(x, 18, 2, 22, '#d8d6ce'); r(x + 5, 18, 2, 22, '#a8a69e'); }
  r(30, 24, 6, 3, '#ffffff'); r(31, 25, 4, 1, '#2f5fae'); r(40, 30, 4, 10, '#2a5fb0');
  r(0, 40, 48, 8, '#6a6a6a'); h(44, 0, 47, '#f4f4f4');
});
// 上地八幡宮：緑青の銅ぶきの横に長い拝殿、こげ茶の柱と格子、手前の石段と絵馬かけ
spotSprites.osmN6018637699 = hiCanvas((r, h) => {
  for (const [x, y] of [[0, 4], [38, 2]]) { r(x, y, 10, 10, '#3f7a34'); r(x + 2, y + 1, 4, 3, '#5a9a44'); }
  tileRoof(r, h, 9, [[8, 39], [6, 41], [4, 43], [3, 44], [2, 45]], ['#9ab8a8', '#6e9484', '#3e5a4e', '#5a7e6e']);
  r(5, 14, 38, 14, '#4a3a2c'); for (const x of [5, 12, 19, 28, 35, 42]) r(x, 14, 1, 14, '#7a6450'); r(19, 17, 10, 11, '#20160e'); for (let x = 7; x < 19; x += 2) r(x, 18, 1, 6, '#6a5440');
  h(15, 8, 40, '#e8dcc0'); r(31, 19, 9, 5, '#c8a870'); for (let x = 32; x < 40; x += 2) r(x, 20, 1, 3, '#f0e0b0');   // しめ縄と絵馬
  for (let y = 28; y < 40; y++) h(y, 14 - ((y - 28) >> 1), 33 + ((y - 28) >> 1), y % 2 ? '#a8a49a' : '#c8c3b8');
  r(0, 40, 48, 8, '#b8b0a0');
});
// 新安城駅：白い壁に黒い横じまの今の駅舎、銀色のとがった記念碑、赤い花だん、右の白いビル
spotSprites.osmN7872569890 = hiCanvas((r, h) => {
  r(32, 6, 12, 30, '#e8e8e4'); for (let y = 9; y < 34; y += 4) r(34, 9 + (y - 9), 8, 2, '#6f8fa8'); r(40, 4, 2, 8, '#b8bcc0');
  r(2, 18, 34, 18, '#f0f0ec'); h(18, 2, 35, '#222'); h(22, 6, 33, '#222'); h(26, 2, 20, '#222'); r(10, 14, 16, 4, '#f0f0ec'); h(14, 10, 25, '#222');
  r(4, 30, 30, 6, '#5a6470'); for (let x = 6; x < 32; x += 5) r(x, 31, 1, 5, '#9aa4ae');
  spanRows(h, 14, [[26, 27], [25, 28], [25, 28], [24, 29], [24, 29], [23, 30], [23, 30], [22, 31], [22, 31], [21, 32], [21, 32], [20, 33], [20, 33], [19, 34], [19, 34], [18, 35], [18, 35], [17, 36], [17, 36], [16, 37], [16, 37], [15, 38]], i => i % 3 ? '#a8b0b8' : '#d8dee4');   // 記念碑
  r(0, 36, 48, 12, '#7a7a78'); spanRows(h, 38, [[14, 40], [12, 42], [12, 42]], '#c83a3a'); for (let x = 13; x < 42; x += 3) r(x, 38, 1, 1, '#3f8a34');
  h(44, 0, 47, '#f4f4f4');
});
// 上横須賀駅：青緑のかまぼこ屋根の白い駅舎、下は茶色のタイル、左に暗い入口、名鉄の駅名の看板
spotSprites.osmN8093413971 = hiCanvas((r, h) => { mtHutB2(r, h, { top: 12, sign: [22, 38], door: [5, 17] }); r(33, 36, 10, 6, '#3a3a3a'); for (let x = 34; x < 43; x += 3) r(x, 37, 2, 4, '#9a9a9a'); });
// 北安城駅：青緑の屋根のふちの白い駅舎、茶色のタイル、まん中の入口、青い自動販売機
spotSprites.osmN8093413970 = hiCanvas((r, h) => { mtHutB2(r, h, { top: 14, sign: [8, 20], door: [20, 27] }); r(32, 27, 5, 15, '#2a5fb0'); r(33, 29, 3, 4, '#e8f0f8'); r(0, 16, 4, 2, '#5f9e98'); r(0, 18, 4, 24, '#c8ccce'); });
// 北野桝塚駅：石垣の土手の上のホームと屋根、白い小さな駅舎、手前の植えこみ
spotSprites.osmN7774774733 = hiCanvas((r, h) => {
  r(4, 12, 40, 2, '#7a8a96'); for (const x of [8, 24, 40]) r(x, 14, 1, 8, '#9aa0a6'); r(0, 22, 48, 3, '#b8b4ac');
  r(2, 6, 14, 16, '#e8e6e0'); tileRoof(r, h, 4, [[3, 14], [2, 15]], ['#c8ccd0', '#9aa0a6', '#5a6068', '#7a8088']); r(5, 10, 3, 3, '#6f8fa8'); r(10, 10, 3, 3, '#6f8fa8');
  r(18, 14, 12, 8, '#e8e6e0'); r(20, 16, 3, 3, '#6f8fa8');
  r(0, 25, 48, 13, '#a8a08e'); for (let y = 27; y < 38; y += 3) for (let x = (y % 2) * 3; x < 48; x += 6) r(x, y, 1, 2, '#8a826e');
  for (let x = 2; x < 46; x += 8) { r(x, 33, 7, 5, '#3f7a34'); r(x + 1, 32, 5, 1, '#5a9a44'); }
  r(0, 38, 48, 10, '#7a7a78'); r(6, 39, 9, 5, '#d8d8d4'); r(28, 39, 9, 5, '#5a6a8a');
});
// 北新川駅：灰色の切妻屋根の白い駅舎、左に大きな観光の地図の看板、赤い自動販売機
spotSprites.osmN8095207755 = hiCanvas((r, h) => {
  r(1, 10, 18, 14, '#ffffff'); r(2, 11, 16, 12, '#7fb0d8'); r(4, 13, 10, 8, '#e8dcb0'); r(6, 15, 3, 3, '#d23a2e'); r(4, 24, 1, 12, '#888'); r(15, 24, 1, 12, '#888');   // 地図の看板
  tileRoof(r, h, 18, [[24, 44], [22, 46], [21, 47]], ['#d0d4d8', '#9aa0a6', '#5a6068', '#7a8088']); r(22, 21, 25, 21, '#f0eee8'); r(40, 21, 7, 21, '#d8d6d0');
  r(26, 26, 6, 5, '#6f8fa8'); r(36, 26, 6, 16, '#3a4048'); r(30, 21, 10, 3, '#ffffff'); r(31, 22, 2, 1, '#2f5fae');
  r(17, 30, 4, 12, '#d23a2e'); r(18, 32, 2, 3, '#f4f4f4'); r(0, 42, 48, 6, '#8a8a88'); for (let x = 3; x < 48; x += 8) r(x, 45, 4, 1, '#f4f4f4');
});
// 新川町駅：大きな切妻の、うす茶色のタイルの駅舎、「碧南市新川まちかどサロン」の白い看板、赤いポスト、松
spotSprites.osmN8100814151 = hiCanvas((r, h) => {
  for (let k = 0; k < 14; k++) h(4 + k, 23 - k - 1, 24 + k + 1, '#8a5a4a'), (k > 1 && h(4 + k, 23 - k + 1, 24 + k - 1, '#c8b0a4'));
  r(8, 18, 32, 24, '#c8b0a4'); r(8, 18, 4, 24, '#b49c90'); h(17, 6, 41, '#8a5a4a');
  r(10, 17, 28, 5, '#ffffff'); for (const [x, c] of [[12, '#2f5fae'], [15, '#2f5fae'], [19, '#e05a2a'], [22, '#3f9a3a'], [25, '#e05a2a'], [29, '#2f5fae'], [33, '#2f5fae']]) r(x, 18, 2, 3, c);
  r(16, 24, 16, 18, '#3a3a40'); for (const x of [20, 24, 28]) r(x, 24, 1, 18, '#8a8a90'); r(19, 22, 10, 2, '#ffffff');
  r(8, 32, 3, 6, '#d23a2e'); r(9, 38, 1, 4, '#d23a2e'); pix(r, PINE, 0, 24, '#2f6a3a'); pix(r, PINE, 2, 28, '#2f6a3a'); r(4, 31, 1, 11, '#5a4030');
  r(40, 26, 8, 16, '#c86a3a'); h(26, 40, 47, '#8a4a2a'); r(0, 42, 48, 6, '#8a8a88');
});
// 名電山中駅：山を背に、青緑の屋根の小さなホームの待合と駅舎が2つ、手前に踏切と線路
spotSprites.osmN8093884446 = hiCanvas((r, h) => {
  spanRows(h, 4, [[10, 30], [4, 40], [0, 47], [0, 47], [0, 47]], i => i % 2 ? '#3f6a34' : '#4f7a3e');
  for (const [x0, x1] of [[2, 16], [26, 44]]) { h(12, x0 + 1, x1 - 1, '#8cc4be'); h(13, x0, x1, '#4f9e98'); h(14, x0, x1, '#3e706c'); r(x0 + 1, 15, x1 - x0 - 1, 13, '#f0f0ec'); r(x0 + 3, 18, 4, 4, '#6f8fa8'); }
  r(36, 20, 4, 8, '#d23a2e'); r(18, 10, 2, 22, '#e0c040'); for (let y = 12; y < 30; y += 4) r(18, y, 2, 2, '#222'); r(17, 10, 4, 2, '#d23a2e');
  r(0, 28, 48, 4, '#c8c4bc'); r(0, 32, 48, 10, '#6a5a48'); for (const y of [34, 38]) h(y, 0, 47, '#a8a8a8'); for (let x = 2; x < 48; x += 4) r(x, 35, 2, 1, '#4a3a2a');
  for (let x = 20; x < 40; x += 4) { r(x, 31, 2, 2, '#e0c040'); r(x + 2, 31, 2, 2, '#222'); } r(0, 42, 48, 6, '#9a9a96');
});
// 藤川駅：ポスターの貼られた高いエレベーターの塔と渡り廊下、青緑の屋根のふちの白い小さな駅舎
spotSprites.osmN8095081208 = hiCanvas((r, h) => {
  r(8, 2, 9, 34, '#d8d8d4'); r(10, 6, 5, 18, '#e8e0d8'); r(11, 8, 3, 12, '#b8a8c8'); h(2, 8, 16, '#a8a8a4');
  r(16, 10, 30, 3, '#c8ccd0'); for (let x = 17; x < 46; x += 3) r(x, 8, 1, 2, '#a8acb0'); h(8, 16, 45, '#d8dce0');
  for (let i = 0; i < 12; i++) r(2 + i, 36 - i * 2, 6, 2, '#b8bcc0');   // 階段
  mtHutB2(r, h, { x0: 20, x1: 46, top: 20, sign: [30, 42], door: [22, 27] });
});
// 美合駅：オレンジ茶色のななめの壁がある、白とベージュの今の駅舎、駅名の看板、赤いポスト
spotSprites.osmN8095081199 = hiCanvas((r, h) => {
  r(0, 8, 14, 30, '#f0f0ec'); r(2, 12, 4, 4, '#6f8fa8'); r(8, 12, 4, 4, '#6f8fa8');
  r(12, 16, 36, 22, '#ece8e0'); h(16, 12, 47, '#c8c4bc'); r(30, 18, 12, 4, '#ffffff'); r(31, 19, 2, 2, '#2f5fae'); for (let x = 34; x < 41; x += 2) r(x, 19, 1, 2, '#222');
  for (let k = 0; k < 14; k++) h(24 + k, 14 + k, 30 - Math.floor(k / 3), k % 2 ? '#c8783a' : '#d88a48');   // ななめの壁
  r(32, 26, 14, 12, '#4a5460'); for (const x of [36, 41]) r(x, 26, 1, 12, '#9aa4ae'); r(4, 28, 3, 6, '#d23a2e');
  r(0, 38, 48, 10, '#8a8a88'); for (let x = 2; x < 30; x += 6) r(x, 43, 4, 2, '#f4f4f4');
});
// 男川駅：青緑の屋根のふちの白い小さな駅舎、名鉄の看板、右にホームの屋根、オレンジのコーン
spotSprites.osmN8108665373 = hiCanvas((r, h) => {
  mtHutB2(r, h, { x0: 2, x1: 30, top: 16, band: false, sign: [10, 24], door: [4, 9] }); r(3, 34, 26, 8, '#b8a890');
  r(30, 22, 18, 2, '#5f9e98'); for (const x of [32, 40, 46]) r(x, 24, 1, 12, '#9aa0a6'); r(30, 32, 18, 4, '#c8c4bc');
  for (const x of [4, 12, 20]) { r(x + 1, 38, 1, 2, '#ff7a1a'); r(x, 40, 3, 2, '#ff7a1a'); } r(34, 26, 12, 6, '#5a8a3a');
});
// 岡崎公園前駅：こげ茶の瓦の寄棟屋根の駅舎、うしろに長いホームの屋根、白いビル
spotSprites.osmN8108665362 = hiCanvas((r, h) => {
  r(0, 4, 18, 16, '#e8e8e4'); for (let y = 6; y < 18; y += 4) h(y, 1, 16, '#9aa4ae'); r(20, 2, 26, 4, '#d8d8d4');
  r(0, 18, 48, 3, '#7a8088'); h(18, 0, 47, '#9aa0a6'); for (const x of [6, 20, 34]) r(x, 21, 1, 6, '#8a8a88'); r(0, 26, 48, 2, '#b8b4ac');
  tileRoof(r, h, 26, [[12, 39], [10, 41], [8, 43], [7, 44]], ['#8a7a70', '#5a4c46', '#3a302c', '#4a3e38']);
  r(9, 30, 34, 12, '#ece8e0'); r(14, 33, 5, 5, '#6f8fa8'); r(24, 32, 8, 10, '#3a4048'); r(36, 33, 4, 5, '#d23a2e');
  r(0, 42, 48, 6, '#8a8a88');
});
// 矢作橋駅：こげ茶の大きな切妻屋根のクリーム色の駅舎、正面の入口と窓
spotSprites.osmN8108665360 = hiCanvas((r, h) => {
  r(0, 14, 10, 28, '#d8d4cc'); r(2, 18, 6, 4, '#6f8fa8');
  for (let k = 0; k < 13; k++) h(6 + k, 24 - k, 25 + k + 8, '#6a4a3a'), h(6 + k, 23 - k, 23 - k, '#4a3428');
  for (let k = 3; k < 13; k++) h(6 + k, 26 - k, 23 + k - 2, '#f0ead8');   // 妻の壁
  r(11, 19, 34, 23, '#f0ead8'); r(11, 19, 3, 23, '#d8d2c0'); r(17, 24, 8, 6, '#6fa0a8'); r(29, 24, 10, 18, '#3a3a40'); r(28, 22, 12, 2, '#d8d2c0');
  r(42, 24, 3, 8, '#2f5fae'); r(0, 42, 48, 6, '#8a8a88'); for (let x = 30; x < 48; x += 5) r(x, 45, 3, 1, '#f4f4f4');
});
// 宇頭駅：うす緑の長いホームの屋根と柱、手すりのついたスロープ、ホームの白い柵
spotSprites.osmN8108665358 = hiCanvas((r, h) => {
  r(4, 10, 40, 2, '#a8c8b0'); r(2, 12, 44, 2, '#88a890'); h(14, 2, 45, '#5a7a62'); r(18, 6, 12, 4, '#a8c8b0'); r(20, 7, 8, 2, '#ffffff');
  for (const x of [6, 18, 30, 42]) r(x, 15, 2, 22, '#d8d8d4');
  r(2, 30, 44, 7, '#e8e8e4'); for (let x = 3; x < 46; x += 2) r(x, 30, 1, 7, '#c8c8c4');
  for (let i = 0; i < 14; i++) h(37 - Math.floor(i / 2), 28 + i, 28 + i, '#b8b8b4'); r(26, 30, 20, 1, '#9a9a96');
  r(0, 37, 48, 11, '#8a8a88'); pix(r, ['..####..', '.######.', '########'], 0, 32, '#3f7a34');
});
// 三河鳥羽駅：鳥羽の火祭りの、うずまき模様をえがいた赤い駅舎
spotSprites.osmN8094952624 = hiCanvas((r, h) => {
  r(0, 18, 12, 18, '#d8d8d4'); r(2, 22, 6, 4, '#6f8fa8'); r(0, 16, 12, 2, '#9aa0a6');
  r(12, 8, 34, 32, '#d02a2a'); h(8, 12, 45, '#e04a4a'); r(42, 8, 4, 32, '#a81e1e');
  for (const [cx, cy, rr] of [[20, 16, 4], [32, 14, 5], [26, 28, 6], [38, 30, 4], [16, 32, 3]]) for (let a = 0; a < 360; a += 20) { const t = a * Math.PI / 180, s = rr * (0.4 + a / 600); r(Math.round(cx + s * Math.cos(t)), Math.round(cy + s * Math.sin(t)), 1, 1, '#f4f0e8'); }
  r(23, 22, 7, 18, '#3a2a30'); r(24, 23, 5, 16, '#5a4a50'); r(40, 18, 4, 18, '#f0c040'); for (let y = 19; y < 36; y += 3) h(y, 40, 43, '#d0302a');
  r(0, 40, 48, 8, '#8a8a88');
});
// 碧海古井駅：青緑のかまぼこ屋根の白い駅舎、茶色のタイル、左に踏切、右に小さな白い建物
spotSprites.osmN8093453674 = hiCanvas((r, h) => {
  mtHutB2(r, h, { x0: 8, x1: 36, top: 16, sign: [12, 24], door: [26, 31] }); r(14, 29, 4, 4, '#6f8fa8'); r(20, 29, 4, 4, '#6f8fa8');
  r(37, 26, 10, 16, '#f0f0ec'); h(26, 36, 47, '#4f9e98'); r(40, 30, 4, 4, '#f0c040');
  r(2, 14, 2, 28, '#e0c040'); for (let y = 16; y < 40; y += 4) r(2, y, 2, 2, '#222'); r(0, 14, 6, 3, '#d23a2e'); r(4, 18, 4, 2, '#222');
});
// 桜町前駅：横に長い青緑のかまぼこ屋根の白い駅舎、茶色のタイルの腰壁、駅名の看板、白い柵
spotSprites.osmN8093499508 = hiCanvas((r, h) => {
  mtHutB2(r, h, { x0: 1, x1: 46, top: 12, sign: [14, 30], door: [5, 12] }); r(34, 22, 8, 4, '#6f8fa8');
  for (let x = 2; x < 46; x += 3) r(x, 38, 1, 4, '#f4f4f4'); h(38, 2, 45, '#f4f4f4'); r(20, 37, 4, 3, '#ffffff'); r(30, 37, 4, 3, '#ffffff');
});
// 米津駅：上が白、下が茶色の平らな屋根の四角い駅舎、駅名の看板、赤い自動販売機、黄色いのぼり、植えこみ
spotSprites.osmN8093499509 = hiCanvas((r, h) => {
  r(22, 6, 22, 34, '#f0eee8'); h(6, 22, 43, '#c8c6c0'); r(24, 16, 18, 24, '#8a6a5a'); for (const y of [22, 30]) h(y, 24, 41, '#6a5048'); r(28, 24, 10, 16, '#3a3a40');
  r(26, 10, 14, 4, '#ffffff'); r(27, 11, 2, 2, '#2f5fae'); for (let x = 30; x < 39; x += 2) r(x, 11, 1, 2, '#222');
  r(4, 18, 18, 22, '#e8e6e0'); h(18, 3, 22, '#9aa0a6'); r(7, 22, 4, 4, '#6f8fa8'); r(16, 28, 4, 12, '#d23a2e');
  r(12, 10, 3, 18, '#f0d020'); r(11, 10, 1, 26, '#888'); for (let y = 12; y < 26; y += 3) r(13, y, 1, 1, '#2a2a2a');
  for (let x = 0; x < 48; x += 9) { r(x, 36, 8, 6, '#3f8a34'); r(x + 1, 35, 6, 1, '#5aa044'); } r(0, 42, 48, 6, '#8a8a88');
});
// 福地駅：青緑のかまぼこ屋根の白い駅舎、茶色のタイル、左に灰色の屋根の自転車置き場
spotSprites.osmN8093413973 = hiCanvas((r, h) => {
  mtHutB2(r, h, { x0: 18, x1: 46, top: 14, sign: [30, 42], door: [21, 27] });
  r(0, 22, 20, 2, '#6a6a70'); h(21, 1, 19, '#8a8a90'); for (const x of [2, 10, 18]) r(x, 24, 1, 18, '#8a8a88');
  for (let x = 3; x < 17; x += 4) { r(x, 34, 3, 3, '#222'); r(x + 1, 32, 1, 2, '#3a7ac0'); } r(30, 22, 6, 4, '#6f8fa8');
});
// 西浦駅：黒っぽい大きな三角屋根の木の待合（ガラスの壁、木の柱）、赤いポスト、白い柵
spotSprites.osmN8094984124 = hiCanvas((r, h) => {
  for (let k = 0; k < 18; k++) { h(6 + k, 23 - k, 24 + k, k === 17 ? '#22262c' : '#3a4048'); if (k > 2 && k < 17) h(6 + k, 23 - k + 2, 23 - k + 2, '#5a6068'); }
  r(9, 24, 30, 14, '#9ab0bc'); for (const x of [9, 16, 24, 31, 38]) r(x, 24, 2, 14, '#8a6a48'); for (let k = 0; k < 6; k++) { r(14 + k, 18 + k, 1, 1, '#8a6a48'); r(33 - k, 18 + k, 1, 1, '#8a6a48'); }
  r(41, 30, 3, 6, '#d23a2e'); r(42, 36, 1, 4, '#d23a2e'); r(2, 26, 6, 10, '#e8eef4'); r(3, 27, 4, 4, '#5a8ac0'); r(4, 36, 1, 4, '#888');
  r(0, 38, 48, 3, '#c8c4bc'); for (let x = 1; x < 48; x += 4) r(x, 36, 1, 4, '#2a4a7a'); h(36, 0, 47, '#2a4a7a'); r(0, 41, 48, 7, '#5a5a5a');
});
// 勝鬘寺（岡崎）：銀ねずの大屋根に唐破風の向拝、こげ茶の本堂と縁の手すり、右に満開の桜
spotSprites.osmN11568982800 = hiCanvas((r, h) => {
  const RC = ['#c4c8d0', '#8a909a', '#4a4f58', '#6c727c'];
  tileRoof(r, h, 5, [[10, 33], [8, 35], [6, 37], [4, 39], [3, 40], [2, 41], [1, 42], [0, 43]], RC);
  spanRows(h, 12, [[14, 25], [12, 27], [11, 28]], '#6c727c'); h(14, 13, 26, '#d8d8d0');   // 唐破風
  r(3, 14, 38, 16, '#2c2a28'); for (const x of [3, 10, 17, 24, 31, 38]) r(x, 14, 2, 16, '#5a4a3a'); r(14, 17, 12, 11, '#1a1816'); for (let x = 15; x < 26; x += 2) r(x, 17, 1, 11, '#4a3e30');
  h(30, 1, 42, '#6a5a4a'); for (let x = 2; x < 42; x += 3) r(x, 31, 1, 4, '#5a4a3a'); h(31, 1, 42, '#7a6a58'); h(35, 0, 43, '#9a9488'); r(14, 35, 12, 6, '#a8a49a'); for (let y = 36; y < 41; y += 2) h(y, 14, 25, '#c8c4b8');
  for (const [x, y, w] of [[38, 12, 10], [36, 17, 12], [39, 22, 9], [37, 26, 11]]) { r(x, y, w, 5, '#f4c8d4'); r(x + 2, y + 1, w - 4, 2, '#fbe4ea'); }
  r(42, 30, 2, 12, '#5a4030'); h(41, 0, 47, '#c8bca8'); h(42, 0, 47, '#b8ae9a');
});
// 岡崎市郷土館：明治の洋館。うす紫の板張りの壁に白い縁どり、まん中にアーチの破風の玄関、銀ねずの屋根
spotSprites.osmW464871669 = hiCanvas((r, h) => {
  const WL = '#c8aebc', WD = '#a88e9c', TR = '#f4f2ee';
  tileRoof(r, h, 10, [[4, 43], [3, 44], [2, 45], [1, 46]], ['#a8acb4', '#7e8590', '#4a4f58', '#666c76']);
  r(2, 14, 44, 24, WL); for (let y = 16; y < 38; y += 2) h(y, 2, 45, WD); h(14, 2, 45, TR); h(37, 2, 45, TR);
  for (const x of [5, 11, 35, 41]) { r(x, 18, 3, 8, '#5a6878'); r(x - 1, 17, 5, 1, TR); r(x - 1, 26, 5, 1, TR); r(x, 29, 3, 6, '#5a6878'); }
  spanRows(h, 6, [[22, 25], [20, 27], [18, 29], [17, 30]], '#7e8590'); r(17, 10, 14, 1, TR); for (let x = 18; x < 30; x++) { const y = 11 + Math.round(Math.abs(x - 23.5) / 3); r(x, y, 1, 1, TR); }   // アーチの破風
  r(17, 12, 14, 26, WL); r(17, 12, 1, 26, TR); r(30, 12, 1, 26, TR); r(20, 24, 8, 14, '#3a3238'); h(23, 19, 28, TR); r(23, 14, 2, 6, '#5a6878');
  r(0, 38, 48, 4, '#9a968e'); r(15, 38, 18, 4, '#b8b4ac'); for (let x = 1; x < 48; x += 4) r(x, 42, 2, 3, '#d8442c');
  h(45, 0, 47, '#8a8a88');
});
// 蒲郡市立図書館：白とうす灰の四角い建物。上の階に縦のルーバー、1階はくらいガラス、前に松と案内板
spotSprites.osmW446529374 = hiCanvas((r, h) => {
  r(2, 12, 44, 26, '#d8dadc'); h(12, 2, 45, '#eceeee'); h(13, 2, 45, '#b8bcc0');
  r(4, 15, 40, 13, '#cbcbc4'); for (let x = 5; x < 44; x += 3) r(x, 15, 1, 13, '#e8e8e2'); for (let x = 6; x < 44; x += 6) r(x, 17, 2, 9, '#a8aca8');
  r(2, 29, 44, 2, '#eceeee'); r(4, 31, 40, 7, '#35363a'); for (const x of [10, 18, 26, 34]) r(x, 31, 1, 7, '#8a9096'); r(20, 31, 8, 7, '#5a6e7e');
  pix(r, ['.#####.', '#######', '.#####.'], 0, 22, '#2f6a3a'); pix(r, ['.#####.', '#######', '.#####.'], 2, 26, '#3f7a44'); r(4, 29, 1, 9, '#5a4030');
  r(36, 30, 9, 6, '#3a3a40'); r(37, 31, 7, 4, '#d8d8d0'); r(39, 36, 1, 3, '#555'); r(42, 36, 1, 3, '#555');
  r(0, 38, 48, 4, '#9a9a98'); h(42, 0, 47, '#7a7a78'); for (let x = 22; x < 48; x += 6) r(x, 44, 4, 1, '#e8e8e8');
});
// 稲前神社：石灯籠の並ぶ参道と石段、玉垣の奥に緑の銅ぶきの小さな社殿、まわりの森
spotSprites.osmW465836402 = hiCanvas((r, h) => {
  r(0, 2, 48, 14, '#3f6a34'); for (const [x, y] of [[4, 4], [14, 2], [32, 3], [40, 5]]) r(x, y, 6, 4, '#5a8a44');
  spanRows(h, 9, [[18, 29], [17, 30], [16, 31]], '#7fb0a0'); h(9, 18, 29, '#a8d0c4'); r(18, 12, 12, 6, '#8a6a4a'); r(21, 13, 6, 5, '#3a2a20');
  r(10, 17, 28, 3, '#d8d4c8'); for (let x = 11; x < 38; x += 2) r(x, 17, 1, 3, '#a8a49a');
  for (let y = 20; y < 32; y++) h(y, 18 - ((y - 20) >> 1), 29 + ((y - 20) >> 1), y % 2 ? '#c8c4b8' : '#9a968c');
  for (const [x, s] of [[2, 1], [40, 1], [9, 0], [34, 0]]) { const y = s ? 22 : 18; r(x + 1, y, 4, 2, '#7a756a'); r(x, y + 2, 6, 3, '#8a857a'); r(x + 2, y + 3, 2, 1, '#e8d890'); r(x + 2, y + 5, 2, 10, '#8a857a'); r(x, y + 15, 6, 2, '#6a655a'); }
  r(0, 39, 48, 9, '#9a948a'); spanRows(h, 32, [[12, 35], [10, 37], [8, 39], [6, 41], [4, 43], [2, 45], [0, 47]], '#b8b2a6');
});
// 総持尼寺（岡崎）：反りの強い瓦屋根に唐破風、白壁と木の柱の本堂、左に赤い小さな堂
spotSprites.osmW465580298 = hiCanvas((r, h) => {
  const RC = ['#a8acb4', '#6c727c', '#3a3f48', '#555b64'];
  tileRoof(r, h, 6, [[14, 37], [12, 39], [10, 41], [8, 43], [6, 45], [5, 46], [4, 47]], RC); r(4, 11, 1, 1, '#3a3f48');
  spanRows(h, 9, [[20, 31], [18, 33], [17, 34], [16, 35]], '#555b64'); h(11, 19, 32, '#e8e4dc'); r(24, 8, 4, 2, '#8a8e94');
  r(7, 13, 38, 17, '#e8e4dc'); for (const x of [7, 14, 21, 30, 37, 44]) r(x, 13, 2, 17, '#7a6450'); h(19, 7, 45, '#7a6450');
  r(21, 20, 9, 10, '#3a2e24'); for (let x = 22; x < 30; x += 2) r(x, 20, 1, 10, '#6a5440'); r(9, 21, 4, 5, '#5a4a3a'); r(39, 21, 4, 5, '#5a4a3a');
  tileRoof(r, h, 18, [[1, 6], [0, 7]], RC); r(0, 20, 7, 10, '#b8382c');
  h(30, 3, 46, '#8a857a'); r(18, 31, 14, 6, '#a8a49a'); for (let y = 32; y < 37; y += 2) h(y, 18, 31, '#c8c4b8');
  r(0, 37, 48, 6, '#b8b2a6'); h(37, 0, 47, '#9a948a');
});
// 日本福音ルーテル岡崎教会：白い壁に赤茶の瓦屋根、細い尖塔と十字架、縦長の窓
spotSprites.osmW469886506 = hiCanvas((r, h) => {
  const RT = '#a84a3a', RD = '#7a3428', WW = '#f0eeea';
  r(33, 2, 1, 10, '#555'); r(31, 4, 5, 1, '#555');
  for (let k = 0; k < 7; k++) h(11 + k, 9 - k, 44 + Math.min(k, 3), k === 6 ? RD : k % 2 ? RT : '#c25a48');
  r(4, 18, 40, 20, WW); for (const x of [8, 15, 22, 29, 36]) { r(x, 21, 4, 7, '#4a5868'); h(21, x, x + 3, '#2a3440'); r(x, 31, 4, 5, '#4a5868'); }
  r(0, 22, 6, 4, RT); r(0, 26, 5, 12, WW); r(1, 28, 3, 4, '#4a5868'); h(28, 4, 43, '#d8d4cc');
  r(40, 32, 4, 6, '#6a4a30'); pix(r, ['..###..', '.#####.', '#######'], 37, 30, '#3f7a34');
  r(0, 38, 48, 4, '#9a9a96'); h(42, 0, 47, '#7a7a78');
});
// 和志山古墳：こんもりした森の古墳の前に、石の玉垣と石の鳥居、石段
spotSprites.osmW498991062 = hiCanvas((r, h) => {
  spanRows(h, 4, [[14, 33], [10, 37], [6, 41], [3, 44], [1, 46], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47]], i => i % 4 === 1 ? '#5a7a44' : '#3f5a34');
  for (const [x, y] of [[8, 8], [20, 5], [32, 9], [14, 14], [38, 15]]) { r(x, y, 5, 3, '#6a8a50'); }
  h(14, 18, 29, '#a8a49a'); h(15, 19, 28, '#a8a49a'); r(18, 13, 1, 1, '#a8a49a'); r(29, 13, 1, 1, '#a8a49a'); r(20, 16, 2, 13, '#a8a49a'); r(26, 16, 2, 13, '#a8a49a'); h(18, 21, 27, '#9a968c');
  r(0, 23, 48, 9, '#b8b4aa'); for (let x = 0; x < 48; x += 3) { r(x, 23, 2, 9, '#c8c4ba'); r(x, 22, 2, 1, '#a8a49a'); } r(19, 23, 10, 9, '#4a5a3a');
  for (let y = 29; y < 37; y++) h(y, 18 - ((y - 29) >> 1), 29 + ((y - 29) >> 1), y % 2 ? '#c8c4b8' : '#9a968c');
  r(0, 37, 48, 11, '#7a8a5a'); spanRows(h, 37, [[14, 33], [12, 35], [10, 37], [8, 39], [6, 41]], '#a8a494');
});
// 石工団地神社（岡崎）：石の鳥居にしめ縄、両わきに石灯籠、奥に小さな社殿、白い砂利
spotSprites.osmW498047607 = hiCanvas((r, h) => {
  const ST = '#9a968e', SL = '#b8b4ac';
  tileRoof(r, h, 14, [[18, 29], [16, 31], [15, 32]], ['#9aa0a8', '#6c727c', '#3a3f48', '#555b64']); r(17, 17, 14, 8, '#6a5440'); r(20, 18, 8, 7, '#2a2018');
  h(10, 6, 41, SL); h(11, 7, 40, ST); r(6, 9, 1, 1, SL); r(41, 9, 1, 1, SL); h(15, 10, 37, ST); r(11, 12, 3, 28, SL); r(34, 12, 3, 28, SL); r(13, 12, 1, 28, ST); r(36, 12, 1, 28, ST);
  h(13, 14, 33, '#e8dcb0'); h(14, 15, 32, '#d8c890'); for (const x of [18, 23, 28]) { r(x, 15, 1, 2, '#ffffff'); r(x + 1, 16, 1, 1, '#ffffff'); }
  for (const x of [1, 41]) { r(x + 1, 20, 4, 2, '#7a756a'); r(x, 22, 6, 4, ST); r(x + 2, 23, 2, 2, '#e8d890'); r(x + 2, 26, 2, 10, ST); r(x, 36, 6, 3, '#7a756a'); }
  r(0, 39, 48, 9, '#d8ccb0'); for (const [x, y] of [[5, 42], [16, 45], [30, 43], [40, 46]]) r(x, y, 3, 1, '#c0b090');
});
// 上宮寺（岡崎）：灰色のコンクリートの大きな反った屋根が、柱に乗ってせり出す今の本堂
spotSprites.osmW497083985 = hiCanvas((r, h) => {
  const C1 = '#d8d6d8', C2 = '#a8a6aa', C3 = '#6a686c';
  for (let y = 4; y < 22; y++) { const t = (y - 4) / 18, a = Math.round(14 - t * 4), b = Math.round(30 + t * 16); h(y, a, b, y < 8 ? C1 : y < 16 ? '#c4c2c6' : C2); }
  for (let y = 6; y < 20; y++) { const a = 20 + ((y - 6) >> 1); h(y, a, Math.min(46, a + 18 - ((y - 6) >> 1)), '#4a4a50'); }   // 屋根の内がわの影
  h(22, 10, 47, C3); r(16, 22, 4, 16, C2); r(36, 22, 4, 16, C2); r(17, 22, 1, 16, C1);
  r(2, 26, 44, 12, '#bcbabe'); h(26, 2, 45, C1); r(6, 29, 8, 6, '#3e383a'); r(22, 29, 12, 9, '#3e383a'); r(40, 29, 5, 6, '#3e383a'); r(25, 23, 6, 2, '#ffffff');
  r(0, 38, 48, 3, '#8a8890'); r(0, 41, 48, 7, '#a8a49a'); for (let x = 2; x < 48; x += 4) r(x, 43, 2, 1, '#8a857a');
});
// 西心寺（岡崎）：大きな入母屋の瓦屋根、こげ茶の柱と白い漆喰の本堂、高い縁
spotSprites.osmW616219752 = hiCanvas((r, h) => {
  const RC = ['#9aa0aa', '#6b7682', '#3a3f48', '#555e68'];
  spanRows(h, 4, [[22, 25], [21, 26], [20, 27]], '#e8e4dc'); tileRoof(r, h, 4, [[16, 31], [13, 34], [10, 37], [8, 39], [6, 41], [4, 43], [2, 45], [1, 46], [0, 47]], RC); spanRows(h, 4, [[22, 25], [21, 26]], '#e8e4dc');
  r(4, 13, 40, 17, '#e8e2d6'); for (const x of [4, 11, 18, 29, 36, 43]) r(x, 13, 1, 17, '#63543f'); h(13, 4, 43, '#63543f'); h(20, 4, 43, '#63543f');
  r(19, 21, 10, 9, '#39332b'); for (let x = 20; x < 29; x += 2) r(x, 21, 1, 9, '#63543f'); r(6, 22, 4, 6, '#5a4a3a'); r(38, 22, 4, 6, '#5a4a3a');
  h(30, 2, 45, '#7a6a58'); r(2, 31, 44, 4, '#3a3028'); for (let x = 3; x < 46; x += 5) r(x, 31, 1, 4, '#63543f'); h(35, 1, 46, '#a8a49a');
  r(0, 36, 48, 12, '#b8b2a6'); r(0, 36, 5, 6, '#3f7a34'); r(43, 36, 5, 6, '#3f7a34');
});
// 随念寺（岡崎）：銀ねずの瓦屋根、黒い板壁に白い漆喰の格子の本堂、緑の植えこみ
spotSprites.osmW863301938 = hiCanvas((r, h) => {
  const RC = ['#a8acb4', '#7a808a', '#3e434c', '#5a606a'];
  tileRoof(r, h, 6, [[12, 37], [10, 39], [8, 41], [6, 43], [4, 45], [3, 46], [2, 47]], RC); spanRows(h, 4, [[30, 33], [29, 34]], '#e8e4dc');
  r(4, 13, 41, 17, '#25282f'); for (let x = 4; x < 45; x += 4) r(x, 13, 1, 17, '#e8e4dc'); h(13, 4, 44, '#e8e4dc'); h(19, 4, 44, '#e8e4dc'); h(24, 4, 44, '#e8e4dc');
  for (let x = 6; x < 44; x += 8) r(x, 20, 2, 3, '#626166');
  h(30, 3, 45, '#6a5a4a'); r(3, 31, 42, 3, '#1a1a1e'); for (let x = 4; x < 45; x += 5) r(x, 31, 1, 3, '#5a4a3a');
  r(0, 34, 48, 14, '#7aa04a'); h(34, 0, 47, '#8ab45a'); pix(r, ['.######.', '########'], 0, 32, '#3f7a34'); pix(r, ['..####', '######'], 40, 32, '#3f7a34');
  for (let y = 38; y < 48; y++) h(y, 20 - ((y - 38) >> 1), 27 + ((y - 38) >> 1), '#c8c0a8');
});
// ラグナシア（蒲郡）：赤茶のレンガの城壁と、ぎざぎざの塔、青いパラソル
spotSprites.osmR8102292 = hiCanvas((r, h) => {
  const BR = '#8c6050', BL = '#a87868', BD = '#6a4438';
  r(0, 14, 48, 22, BR); for (let x = 0; x < 48; x += 4) r(x, 12, 2, 2, BR); for (let y = 16; y < 36; y += 3) for (let x = (y % 2) * 2; x < 48; x += 5) r(x, y, 3, 1, BL);
  for (const x of [4, 30]) { r(x, 4, 12, 30, '#7a5040'); for (let i = 0; i < 12; i += 3) r(x + i, 2, 2, 2, '#7a5040'); r(x + 4, 10, 4, 6, '#3a2a24'); r(x + 4, 9, 4, 1, '#3a2a24'); r(x + 1, 6, 2, 26, '#9a6a58'); }
  r(19, 22, 8, 14, '#3a2a24'); r(20, 21, 6, 1, '#3a2a24'); h(36, 0, 47, BD);
  for (const x of [2, 18, 34]) { spanRows(h, 30, [[x + 3, x + 8], [x + 1, x + 10], [x, x + 11]], '#2a5fb0'); h(31, x + 2, x + 9, '#4a80d0'); r(x + 5, 33, 1, 7, '#e8e8e8'); }
  r(0, 40, 48, 8, '#d8c4a8'); for (const [x, y] of [[8, 43], [26, 45], [40, 42]]) r(x, y, 3, 1, '#c0a888');
});
// 明治川神社（安城）：緑青の銅ぶきの長い拝殿、こげ茶の板壁、石灯籠と石畳
spotSprites.osmW1055866521 = hiCanvas((r, h) => {
  r(0, 2, 48, 12, '#3f6a34'); r(8, 3, 10, 5, '#5a8a44'); r(30, 2, 12, 5, '#5a8a44');
  spanRows(h, 12, [[10, 37], [8, 39], [6, 41], [4, 43], [3, 44]], i => i === 0 ? '#a8c8b4' : i === 4 ? '#4a6a5c' : '#7e9e8e'); for (let x = 6; x < 42; x += 2) r(x, 13, 1, 3, '#6e8e7e');
  r(5, 17, 38, 12, '#2a2422'); for (const x of [5, 12, 19, 28, 35, 42]) r(x, 17, 1, 12, '#5a4a3a'); r(19, 19, 10, 10, '#1a1614'); h(18, 6, 41, '#e8dcb0');
  h(29, 3, 44, '#8a857a');
  for (const x of [3, 41]) { r(x + 1, 27, 3, 2, '#6a655a'); r(x, 29, 5, 3, '#8a857a'); r(x + 1, 30, 3, 1, '#e8d890'); r(x + 2, 32, 1, 8, '#8a857a'); r(x, 40, 5, 2, '#6a655a'); }
  r(0, 32, 48, 16, '#7a9a5a'); for (let y = 32; y < 48; y++) h(y, 20 - ((y - 32) >> 2), 27 + ((y - 32) >> 2), y % 3 ? '#b8b4a8' : '#9a968c');
});
// ラグーナテンボス（蒲郡）：大きな観覧車と、白と黄の帆の形の屋根、海辺の遊歩道
spotSprites.osmR8620217 = hiCanvas((r, h) => {
  for (let a = 0; a < 360; a += 5) { const t = a * Math.PI / 180; r(Math.round(13 + 11 * Math.cos(t)), Math.round(14 + 11 * Math.sin(t)), 1, 1, '#e8e8f0'); }
  for (let a = 0; a < 360; a += 30) { const t = a * Math.PI / 180; for (let k = 2; k < 11; k += 2) r(Math.round(13 + k * Math.cos(t)), Math.round(14 + k * Math.sin(t)), 1, 1, '#c8ccd8'); r(Math.round(13 + 11 * Math.cos(t)) - 1, Math.round(14 + 11 * Math.sin(t)), 3, 2, ['#e85a5a', '#f2c230', '#4a90e0', '#5ab45a'][a / 30 % 4]); }
  r(12, 14, 2, 18, '#9a9aa8'); r(9, 30, 8, 2, '#8a8a98');
  for (let k = 0; k < 16; k++) h(10 + k, 30 - k, 30 + Math.round(k * 0.6), k % 3 ? '#f4f4f0' : '#e0e0dc'); for (let k = 0; k < 10; k++) h(14 + k, 38 + k, 46, '#f2c230');
  r(18, 26, 30, 8, '#d8dcdf'); for (let x = 20; x < 46; x += 4) r(x, 28, 2, 4, '#5a7a9a');
  r(0, 34, 48, 5, '#b8a888'); for (let x = 0; x < 48; x += 3) r(x, 34, 1, 5, '#8a7a5a'); r(0, 39, 48, 9, '#4a80b0'); for (const [x, y] of [[4, 42], [20, 44], [34, 41]]) h(y, x, x + 3, '#8cc0e0');
});
// 真宮遺跡（岡崎）：木にかこまれた広場に、竪穴住居の柱あとの石と、説明の看板
spotSprites.osmW945765385 = hiCanvas((r, h) => {
  r(0, 6, 48, 12, '#4a6a3a'); for (const [x, y] of [[2, 8], [12, 6], [24, 9], [36, 7]]) { r(x, y, 8, 5, '#6a8a50'); r(x + 3, y + 5, 1, 4, '#5a4030'); }
  r(0, 18, 48, 30, '#b8907e'); for (const [x, y] of [[4, 24], [30, 22], [16, 36], [40, 40]]) r(x, y, 4, 1, '#c8a490');
  for (const [cx, cy] of [[14, 28], [32, 32]]) for (let a = 0; a < 360; a += 45) { const t = a * Math.PI / 180; r(Math.round(cx + 7 * Math.cos(t)), Math.round(cy + 4 * Math.sin(t)), 2, 2, '#7a6458'); r(Math.round(cx + 7 * Math.cos(t)), Math.round(cy + 4 * Math.sin(t)), 1, 1, '#9a8478'); }
  r(38, 18, 8, 6, '#5a4a3a'); r(39, 19, 6, 4, '#e8e2d0'); r(40, 24, 1, 4, '#5a4a3a'); r(43, 24, 1, 4, '#5a4a3a');
});
// 三河武士のやかた家康館（岡崎）：銀ねずの瓦の大きな寄棟屋根、白い壁に格子、ひくい石の基壇
spotSprites.osmR3105117 = hiCanvas((r, h) => {
  const RC = ['#b8bcc4', '#7e8088', '#3e4048', '#5e6068'];
  tileRoof(r, h, 9, [[10, 37], [8, 39], [6, 41], [4, 43], [2, 45], [1, 46], [0, 47]], RC); spanRows(h, 6, [[38, 41], [37, 43], [36, 45]], '#5e6068'); h(8, 38, 44, '#e8e4dc');
  r(3, 16, 42, 14, '#eceae4'); for (let x = 3; x < 45; x += 5) r(x, 16, 1, 14, '#47484e'); h(16, 3, 44, '#47484e'); h(22, 3, 44, '#b8b4ac');
  r(18, 23, 12, 7, '#3a3a40'); for (let x = 19; x < 30; x += 2) r(x, 23, 1, 7, '#6a6a70'); r(7, 18, 6, 3, '#8a8e94'); r(35, 18, 6, 3, '#8a8e94');
  r(1, 30, 46, 3, '#9a968c'); r(0, 33, 48, 4, '#3f6a34'); h(33, 0, 47, '#5a8a44'); r(0, 37, 48, 11, '#b8b4aa'); for (let x = 2; x < 48; x += 5) r(x, 40, 3, 1, '#d8d4ca');
});
// 糟目犬頭神社（岡崎）：石の参道の両わきに大きな石灯籠と狛犬、奥に瓦屋根の拝殿
spotSprites.osmW909281705 = hiCanvas((r, h) => {
  const ST = '#a8a49a', SD = '#8a857a';
  tileRoof(r, h, 6, [[13, 34], [11, 36], [10, 37], [9, 38]], ['#b8bcc8', '#939aab', '#4a4f5a', '#7a8090']); r(11, 10, 26, 10, '#3a3838'); r(17, 12, 14, 8, '#1e1c1c'); for (const x of [11, 18, 29, 36]) r(x, 10, 1, 10, '#6a5a4a'); h(11, 12, 35, '#e8dcb0');
  r(9, 20, 30, 2, SD);
  for (const x of [1, 39]) { r(x + 1, 10, 6, 2, SD); r(x, 12, 8, 4, ST); r(x + 2, 13, 4, 2, '#e8d890'); r(x + 2, 16, 4, 2, SD); r(x + 3, 18, 2, 12, ST); r(x + 1, 30, 6, 3, ST); r(x, 33, 8, 3, SD); }
  for (const x of [12, 32]) { r(x, 28, 4, 4, '#b8b4aa'); r(x + 1, 26, 2, 2, '#b8b4aa'); r(x - 1, 32, 6, 3, SD); }   // 狛犬
  for (const x of [14, 30]) { r(x - 1, 37, 6, 5, '#5a8a3a'); r(x, 36, 4, 1, '#d8a040'); }
  r(0, 36, 48, 12, '#a8a6a2'); for (let y = 22; y < 48; y++) h(y, 19 - ((y - 22) >> 2), 28 + ((y - 22) >> 2), y % 2 ? '#c8c6c2' : '#898e91');
});
// 不乗森神社（安城）：重い銅ぶきの屋根の拝殿、黒っぽい板壁、石灯籠、森の中
spotSprites.osmW1057193114 = hiCanvas((r, h) => {
  r(0, 0, 48, 14, '#2f4a2a'); r(6, 2, 10, 5, '#4a6a3a'); r(30, 1, 10, 5, '#4a6a3a');
  for (let k = 0; k < 9; k++) h(8 + k, 14 - k * 1.5 | 0, 33 + k * 1.5 | 0, k === 0 ? '#9aaab4' : k === 8 ? '#3a4650' : k % 3 === 1 ? '#8a9aa8' : '#6d7b88');
  for (let x = 4; x < 44; x += 3) r(x, 11, 1, 4, '#5e6c78'); spanRows(h, 5, [[20, 27], [19, 28], [18, 29]], '#6d7b88'); h(7, 20, 27, '#d8d4c8');
  r(4, 17, 40, 13, '#18171d'); for (const x of [4, 12, 20, 27, 35, 43]) r(x, 17, 1, 13, '#4a3e34'); r(19, 20, 10, 10, '#0e0e12'); h(18, 5, 42, '#d8c8a0');
  for (const x of [1, 41]) { r(x + 1, 26, 4, 2, '#6a655a'); r(x, 28, 6, 3, '#8a857a'); r(x + 2, 29, 2, 1, '#e8d890'); r(x + 2, 31, 2, 9, '#8a857a'); r(x, 40, 6, 2, '#6a655a'); }
  h(30, 3, 44, '#7a756a'); r(0, 31, 48, 17, '#8a8a7a'); for (let y = 31; y < 48; y++) h(y, 19 - ((y - 31) >> 2), 28 + ((y - 31) >> 2), '#b8b4a8');
});
// JR・名鉄 刈谷駅：駅前の高いマンションと、駅ビル・歩行者デッキ
spotSprites.osmN3999572942 = hiCanvas((r, h) => {
  r(4, 2, 14, 32, '#e8e6e2'); for (let y = 4; y < 33; y += 2) h(y, 5, 16, '#b8b8b8'); r(4, 2, 2, 32, '#f8f8f6'); r(16, 2, 2, 32, '#c8c6c2');
  r(30, 12, 12, 22, '#dcdad6'); for (let y = 14; y < 33; y += 3) h(y, 31, 40, '#a8a8a4'); r(20, 18, 8, 16, '#e8e8e4'); for (let y = 20; y < 33; y += 3) r(21, y, 6, 1, '#9a9a96');
  r(0, 30, 48, 8, '#c8ccd0'); h(30, 0, 47, '#e8ecee'); for (let x = 2; x < 48; x += 5) r(x, 32, 3, 4, '#6a7a8a'); r(14, 33, 8, 5, '#d23a2e'); r(15, 34, 6, 1, '#ffffff');
  r(0, 38, 48, 2, '#9a9a9a'); for (const x of [6, 22, 38]) r(x, 40, 2, 4, '#8a8a88'); r(0, 44, 48, 4, '#6c6a69');
});
// 名鉄 野田新町駅：白いアーチ屋根の駅舎、うしろの高いマンション、駅前のまっすぐな道
spotSprites.osmN3999573157 = hiCanvas((r, h) => {
  r(26, 0, 12, 22, '#d8d6d2'); for (let y = 2; y < 22; y += 2) h(y, 27, 36, '#a8a8a4');
  for (let x = 6; x < 42; x++) { const y = 14 + Math.round(Math.pow((x - 24) / 18, 2) * 4); r(x, y, 1, 2, '#e8ecf0'); r(x, y + 2, 1, 1, '#9aa8b8'); }
  r(8, 19, 32, 15, '#f0f2f2'); h(19, 8, 39, '#c8ccd0'); r(12, 24, 24, 10, '#5a6a7a'); for (let x = 14; x < 36; x += 4) r(x, 24, 1, 10, '#c8ccd0'); r(17, 20, 14, 3, '#ffffff'); r(18, 21, 4, 1, '#e8742c'); r(23, 21, 7, 1, '#3a5aa0');
  r(40, 22, 7, 12, '#e0e2e2'); for (let y = 24; y < 32; y += 3) r(41, y, 5, 1, '#9aa8b8'); r(0, 26, 8, 8, '#c8ccd0');
  r(0, 34, 48, 14, '#7a7c7e'); spanRows(h, 34, [[20, 27], [19, 28], [18, 29], [17, 30], [16, 31], [15, 32], [14, 33]], '#8e9092'); for (let y = 36; y < 48; y += 3) h(y, 23, 24, '#e8e8e8');
});
// 刈谷市役所：茶色の高い庁舎に、白いバルコニーの格子が重なる
spotSprites.osmN5088818889 = hiCanvas((r, h) => {
  r(10, 2, 28, 36, '#9a7058'); r(10, 2, 28, 2, '#b8b4ac'); for (let y = 6; y < 36; y += 4) { r(14, y, 20, 2, '#e8e6e0'); r(14, y + 2, 20, 2, '#5a6a7a'); } for (let x = 14; x < 34; x += 4) r(x, 6, 1, 30, '#d8d4cc');
  r(2, 14, 8, 24, '#b8a088'); for (let y = 16; y < 36; y += 4) r(3, y, 6, 2, '#5a6a7a'); r(38, 10, 8, 28, '#8a6048'); for (let y = 12; y < 36; y += 4) r(39, y, 6, 2, '#6a7a8a');
  r(16, 32, 16, 6, '#3f4a52'); r(14, 31, 20, 1, '#d8d4cc'); r(0, 38, 48, 3, '#9a9a98'); r(0, 41, 48, 7, '#7a8a5a'); for (let x = 2; x < 48; x += 6) r(x, 40, 4, 2, '#3f7a34');
});
// 半田市立博物館：レンガの大きな壁と、太い柱がならぶガラスの入口、ぬれた赤い舗装
spotSprites.osmN1423949200 = hiCanvas((r, h) => {
  const BR = '#a85e40', BS = '#7e4430';
  spanRows(h, 8, [[4, 30], [4, 34], [4, 38], [4, 42], [4, 46]], BR); r(4, 13, 43, 4, BR); h(13, 4, 46, BS);
  r(30, 8, 17, 30, BS); for (let y = 10; y < 38; y += 3) h(y, 30, 46, '#6e3a28'); for (const y of [16, 24]) r(38, y, 3, 4, '#2a2a2e');
  r(4, 17, 26, 18, '#352e24'); for (const x of [6, 12, 18, 24]) { r(x, 17, 3, 18, BR); r(x, 17, 1, 18, '#c07a58'); } r(9, 22, 3, 13, '#5a6a6a'); r(21, 22, 3, 13, '#5a6a6a');
  r(0, 35, 48, 13, '#a8604a'); for (let y = 37; y < 48; y += 3) h(y, 0, 47, '#c0786a'); r(4, 38, 26, 2, '#7a3a2a');
});
// 刈谷市郷土資料館：昭和はじめの古い校舎。ベージュの壁、縦長の窓の列、まん中に三角の破風の玄関
spotSprites.osmN5146201595 = hiCanvas((r, h) => {
  const WL = '#d0bc90', WS = '#a8946c', RF = '#5a6068';
  h(9, 1, 46, RF); h(10, 0, 47, '#3e434a'); r(1, 11, 46, 25, WL); r(1, 11, 46, 1, '#e0d0a8');
  for (const y of [13, 23]) for (let x = 3; x < 46; x += 5) { if (x > 18 && x < 28) continue; r(x, y, 3, 7, '#4a5a6a'); r(x, y, 3, 1, '#8aa0b0'); h(y + 7, x - 1, x + 3, WS); }
  for (let k = 0; k < 6; k++) h(9 + k, 23 - k, 24 + k, k ? WL : RF); h(15, 16, 31, RF); r(17, 16, 14, 20, '#c8b080'); r(19, 22, 10, 14, '#3a3028'); r(20, 21, 8, 2, '#c8b080'); r(19, 18, 10, 1, WS);
  r(36, 30, 10, 6, '#7a4a30'); r(37, 28, 8, 3, '#b89060'); r(0, 36, 48, 12, '#8a8a86'); r(0, 32, 6, 4, '#4a7a3a');
});
// 東浦町中央図書館：白い丸い建物に、青緑の屋根と屋上の丸い塔、ガラスの帯。手前に白いアーチ
spotSprites.osmN1423987791 = hiCanvas((r, h) => {
  r(19, 4, 10, 4, '#e8e8e4'); h(4, 19, 28, '#ffffff'); for (let x = 20; x < 28; x += 2) r(x, 5, 1, 2, '#9aa4ac');
  spanRows(h, 8, [[12, 35], [6, 41], [3, 44], [1, 46]], i => i < 2 ? '#8ab8b0' : '#6a9a92');
  r(1, 12, 46, 4, '#5a8aa0'); for (let x = 2; x < 46; x += 3) r(x, 12, 1, 4, '#c8d8e0'); r(1, 16, 46, 14, '#d8dce4'); for (let x = 4; x < 45; x += 5) r(x, 19, 2, 5, '#5a7088');
  for (let i = 0; i < 18; i++) { const t = i / 17 * Math.PI, x = Math.round(24 + 16 * Math.cos(t)), y = Math.round(28 - 18 * Math.sin(t)); r(x - 1, y, 3, 2, '#ffffff'); }
  r(7, 28, 3, 14, '#ffffff'); r(38, 28, 3, 14, '#ffffff'); r(0, 30, 48, 4, '#4a7a3a'); r(0, 34, 48, 14, '#8a8a88'); h(37, 0, 47, '#e8e8e8');
});
// 知立市歴史民俗資料館・図書館：灰色のタイル張りの2階建て。窓の帯と、右に格子の屋根の玄関
spotSprites.osmN1423994163 = hiCanvas((r, h) => {
  const WL = '#c8c0b2', WS = '#9a9284';
  r(2, 12, 44, 24, WL); h(12, 2, 45, '#e0d8ca'); for (let y = 14; y < 36; y += 2) h(y, 2, 45, '#bcb4a6');
  for (let x = 4; x < 34; x += 4) { r(x, 16, 3, 5, '#3a4048'); r(x, 26, 3, 5, '#3a4048'); }
  r(34, 12, 12, 24, WS); r(34, 18, 12, 2, '#d8d0c2'); for (let x = 35; x < 46; x += 2) r(x, 18, 1, 2, '#6a645a'); r(36, 22, 2, 14, WL); r(43, 22, 2, 14, WL); r(38, 24, 5, 12, '#3a4048');
  for (const x of [5, 12, 26]) { r(x + 1, 32, 1, 6, '#6a4a30'); r(x - 1, 28, 5, 5, '#4a7a3a'); }
  r(0, 36, 48, 3, '#6a8a4a'); r(0, 39, 48, 9, '#9a968e');
});
spotSprites.osmN1423994160 = spotSprites.osmN1423994163;
// 武豊町歴史民俗資料館：白い格子のタイル壁の箱を2つ重ねた建物と、大きなガラス窓の帯、駐車場
spotSprites.osmN1423989568 = hiCanvas((r, h) => {
  const TL = '#d8dce0', TS = '#b0b6bc', GL = '#3e5a7a';
  r(6, 8, 22, 28, TL); r(28, 14, 16, 22, '#c8ccd0'); r(28, 14, 16, 1, '#e8ecf0'); h(8, 6, 27, '#eef0f2');
  for (let y = 9; y < 36; y += 3) h(y, 6, 27, TS); for (let x = 9; x < 28; x += 4) r(x, 8, 1, 28, TS);
  r(7, 14, 20, 6, GL); r(7, 26, 20, 6, GL); for (let x = 9; x < 27; x += 4) { r(x, 14, 1, 6, TL); r(x, 26, 1, 6, TL); }
  r(29, 18, 6, 4, GL); r(30, 26, 12, 3, '#9aa4ac'); r(36, 29, 4, 7, '#2a4a8a');
  r(0, 36, 48, 12, '#4a4c50'); for (const x of [10, 22, 34]) r(x, 38, 1, 10, '#e8e8e8');
});
// 市原稲荷神社：赤い柱の玉垣にはさまれた石段の参道と、奥の赤い社殿、木々
spotSprites.osmN5147537990 = hiCanvas((r, h) => {
  r(0, 2, 18, 16, '#3f7a34'); r(30, 2, 18, 16, '#4f8a3a'); r(4, 4, 8, 4, '#5a9a44'); r(34, 5, 9, 4, '#6aaa4a');
  spanRows(h, 10, [[17, 30], [15, 32], [14, 33]], '#5a6068'); r(16, 13, 16, 8, '#c8382c'); r(21, 15, 6, 6, '#3a2218'); h(13, 16, 31, '#e8e4dc');
  for (let y = 21; y < 34; y++) h(y, 17 - ((y - 21) >> 1), 30 + ((y - 21) >> 1), y % 2 ? '#a8a49a' : '#c8c4b8');
  for (const x0 of [1, 37]) { for (let x = x0; x < x0 + 10; x += 3) { r(x, 24, 2, 14, '#c8382c'); r(x, 23, 2, 1, '#e85848'); } h(26, x0, x0 + 9, '#c8382c'); r(x0 + 1, 22, 3, 2, '#e8e0d0'); }
  r(0, 38, 48, 10, '#a8a49a'); for (let y = 40; y < 48; y += 2) h(y, 0, 47, '#b8b4aa');
});
// 阿久比町立図書館：低く広がる瓦の寄棟屋根に、まん中だけ一段高い屋根。夕方の明かりがともるガラスの入口
spotSprites.osmN1424003413 = hiCanvas((r, h) => {
  tileRoof(r, h, 14, [[16, 31], [14, 33], [12, 35]], ['#7a7a80', '#5a5a60', '#3a3a3e', '#4d4c4f']);
  tileRoof(r, h, 18, [[3, 44], [1, 46], [0, 47]], ['#7a7a80', '#5a5a60', '#3a3a3e', '#4d4c4f']);
  r(18, 17, 12, 2, '#f0b850'); r(2, 21, 44, 12, '#e8e4dc'); for (const x of [2, 12, 34, 45]) r(x, 21, 1, 12, '#8a8680');
  r(5, 23, 10, 7, '#f0c070'); for (let x = 6; x < 15; x += 2) r(x, 24, 1, 5, '#c08840'); r(18, 22, 12, 11, '#f8d088'); r(22, 25, 4, 8, '#5a4030'); r(36, 23, 6, 7, '#3a3a3e');
  r(0, 33, 48, 15, '#4a4a4e'); for (const x of [8, 20, 32]) r(x, 36, 6, 1, '#e8e8e8'); r(33, 32, 9, 4, '#1a1a1e'); r(34, 31, 6, 1, '#2a2a2e');
});
// 洞隣寺：銀ねずの瓦の大屋根に、朱色の柱と白い壁の本堂。左右に大きな松
spotSprites.osmN5096943767 = hiCanvas((r, h) => {
  tileRoof(r, h, 10, [[16, 31], [13, 34], [10, 37], [8, 39], [6, 41], [5, 42], [4, 43]], ['#b8bcc4', '#8a909a', '#4a4e56', '#7a8088']);
  for (let k = 0; k < 4; k++) h(7 + k, 23 - k, 24 + k, k ? '#e8e4dc' : '#4a4e56');
  r(7, 17, 34, 16, '#f0ece4'); for (const x of [7, 13, 19, 28, 34, 40]) r(x, 17, 2, 16, '#b0603a'); h(17, 7, 40, '#9a5030');
  r(21, 20, 6, 13, '#8a4a2a'); for (let x = 22; x < 27; x += 2) r(x, 20, 1, 13, '#c07a50'); for (const x of [9, 15, 30, 36]) r(x, 21, 3, 4, '#c07a50');
  h(33, 5, 42, '#a8a49a'); h(34, 7, 40, '#8a857a');
  for (const [x, y] of [[0, 6], [2, 12], [0, 18]]) { pix(r, PINE, x, y, '#2f5a2a'); h(y, x + 2, x + 4, '#4a7a3a'); } r(4, 9, 1, 30, '#5a4030');
  for (const [x, y] of [[41, 10], [38, 16]]) { pix(r, PINE, x, y, '#2f5a2a'); h(y, x + 2, x + 4, '#4a7a3a'); } r(44, 13, 1, 26, '#5a4030');
  r(0, 39, 48, 9, '#d8d0c0');
});
// 野田八幡宮：こげ茶の檜皮ぶきの大きな拝殿。黒っぽい木の社殿、石の玉垣と狛犬、石灯籠
spotSprites.osmN5406014369 = hiCanvas((r, h) => {
  spanRows(h, 6, [[14, 33], [10, 37], [6, 41], [3, 44], [1, 46]], i => i < 2 ? '#7a5040' : '#5a3a2e'); h(11, 0, 47, '#2e2020'); r(22, 3, 4, 3, '#4a3a30');
  r(3, 12, 42, 13, '#3a2826'); for (const x of [3, 10, 17, 30, 37, 44]) r(x, 12, 1, 13, '#6a4a3a'); r(18, 14, 12, 11, '#1f161c'); r(21, 14, 6, 6, '#c8b890');
  for (const x of [20, 26]) r(x, 13, 2, 8, '#e8e0d0');
  r(0, 25, 48, 4, '#a8a49a'); for (let x = 1; x < 48; x += 4) r(x, 24, 2, 5, '#c0bcb2'); r(19, 25, 10, 4, '#c8c4b8');
  for (let y = 29; y < 36; y++) h(y, 18 - (y - 29), 29 + (y - 29), y % 2 ? '#b8b4aa' : '#a8a49a');
  for (const x of [6, 39]) { r(x + 1, 30, 2, 1, '#a8a49a'); r(x, 31, 4, 2, '#a8a49a'); r(x + 1, 33, 2, 5, '#a8a49a'); }
  r(0, 36, 48, 12, '#d0c8b0');
});
// 敬専寺：青みがかった銀ねずの瓦の、反りの大きな高い屋根の本堂。こげ茶の木の柱と戸、石灯籠
spotSprites.osmN6225098114 = hiCanvas((r, h) => {
  tileRoof(r, h, 4, [[18, 29], [15, 32], [12, 35], [10, 37], [8, 39], [6, 41], [4, 43], [2, 45], [1, 46], [0, 47]], ['#6a7a9a', '#3b4d6b', '#1e2838', '#2e3e58']);
  r(0, 11, 1, 2, '#1e2838'); r(47, 11, 1, 2, '#1e2838');
  r(5, 14, 38, 18, '#4a3e38'); for (const x of [5, 12, 19, 28, 35, 42]) r(x, 14, 1, 18, '#6a5a50'); h(14, 5, 42, '#2a2420');
  r(19, 17, 10, 15, '#2e2622'); for (let x = 20; x < 29; x += 2) r(x, 17, 1, 15, '#5a4a40'); for (const x of [7, 14, 30, 37]) r(x, 18, 4, 8, '#5a4a40');
  for (const x of [8, 37]) { r(x + 1, 29, 2, 1, '#9a968c'); r(x, 30, 4, 3, '#9a968c'); r(x + 1, 33, 2, 6, '#9a968c'); r(x, 39, 4, 1, '#7a766c'); }
  r(0, 32, 48, 16, '#c0bab0'); spanRows(h, 32, [[20, 27], [19, 28], [18, 29], [17, 30], [16, 31], [15, 32], [14, 33]], '#e0dcd4');
});
// 刈谷市歴史博物館：低く長い灰色の建物と、手前の芝生の丘と木、広い園路
spotSprites.osmN6385749931 = hiCanvas((r, h) => {
  r(4, 16, 40, 12, '#8a8e92'); h(16, 4, 43, '#a8acb0'); h(15, 6, 41, '#6a6e72'); for (let x = 6; x < 43; x += 4) r(x, 20, 2, 5, '#5a5e62'); r(30, 22, 12, 6, '#4a4e52');
  spanRows(h, 24, [[0, 20], [0, 24], [0, 28], [0, 31], [0, 33], [0, 34]], '#5a8a3a'); for (const [x, y] of [[4, 18], [14, 16], [24, 20], [38, 18]]) { r(x, y, 5, 5, '#3f7a34'); r(x + 1, y, 3, 2, '#6aaa4a'); r(x + 2, y + 5, 1, 4, '#5a4030'); }
  spanRows(h, 30, [[34, 47], [30, 47], [26, 47], [22, 47], [18, 47], [14, 47], [10, 47], [6, 47]], '#b8b4ac'); r(0, 38, 48, 10, '#9a968e'); r(34, 26, 6, 4, '#5a5654'); r(35, 27, 4, 1, '#d8d0b0');
});
// 三河八橋駅：高架の白い駅舎に、うす紫の縦の柱がならぶ壁。左に駅の入口と駅名の看板
spotSprites.osmN8095206125 = hiCanvas((r, h) => {
  r(10, 8, 38, 4, '#c8ccd2'); r(10, 12, 38, 20, '#eceef2'); h(12, 10, 47, '#ffffff'); for (let x = 12; x < 48; x += 5) { r(x, 12, 2, 20, '#a0a8d0'); r(x + 2, 14, 3, 6, '#5a6a7a'); }
  r(0, 18, 12, 18, '#c8c4bc'); h(18, 0, 11, '#e0dcd4'); r(1, 21, 9, 3, '#ffffff'); r(2, 22, 2, 1, '#2f74b8'); for (const x of [5, 7]) r(x, 22, 1, 1, '#333'); r(2, 26, 7, 10, '#4a5058');
  r(10, 32, 38, 4, '#9a9a96'); for (let x = 14; x < 48; x += 8) r(x, 33, 3, 3, '#5a6068');
  r(0, 36, 48, 12, '#4a4c50'); h(40, 0, 47, '#e8e8e8'); r(20, 38, 22, 2, '#a8a8a4');
});
// 三河知立駅：明るい茶色の石張りの壁の小さな駅舎と、白い屋根の階段・スロープ
spotSprites.osmN8096770911 = hiCanvas((r, h) => {
  r(6, 6, 20, 32, '#c8a878'); h(6, 6, 25, '#e0c898'); for (let y = 8; y < 38; y += 3) for (let x = 7 + (y % 2) * 2; x < 25; x += 4) r(x, y, 2, 1, '#a88858');
  r(26, 14, 8, 24, '#9a9690'); r(10, 10, 12, 3, '#ffffff'); r(11, 11, 3, 1, '#2f74b8'); r(15, 11, 6, 1, '#333');
  r(26, 18, 22, 2, '#e8eaec'); r(28, 20, 1, 18, '#c8c8c8'); r(46, 20, 1, 18, '#c8c8c8');
  for (let i = 0; i < 12; i++) h(26 + i, 34 + i, 47, i % 2 ? '#d8d8d4' : '#c0c0bc'); r(34, 24, 13, 1, '#e8e8e8');
  r(0, 38, 48, 10, '#b8b4ac'); for (let x = 0; x < 48; x += 4) r(x, 40, 2, 1, '#d8b860');
});
// 知立駅：高架の上に大きく横に長い駅ビル。ベージュの壁に緑の縦の線、左に高架の橋脚
spotSprites.osmN8095176795 = hiCanvas((r, h) => {
  r(0, 8, 8, 4, '#b8bcc0'); r(1, 12, 5, 24, '#a8acb0'); r(0, 22, 48, 3, '#c8ccd0');
  spanRows(h, 6, [[10, 40], [10, 42], [10, 44]], '#9a9aa0'); r(10, 9, 36, 22, '#d8ccb4'); h(9, 10, 45, '#e8dcc4');
  for (let x = 13; x < 46; x += 4) { r(x, 9, 1, 22, '#4a8a5a'); r(x + 1, 11, 2, 18, '#bcae94'); }
  r(28, 26, 18, 3, '#e8eaec'); r(28, 29, 18, 7, '#5a6068'); r(30, 30, 6, 4, '#8aa0b0'); r(38, 30, 6, 4, '#8aa0b0'); r(12, 31, 14, 5, '#e8e4dc');
  r(0, 36, 48, 12, '#9a9a98'); for (let i = 0; i < 6; i++) r(4 + i * 6, 40 + (i % 2) * 3, 4, 1, '#f0f0f0');
});
// 重原駅：白い壁の小さな駅舎に、青緑のふちの丸い屋根。前に自転車置き場
spotSprites.osmN7814234031 = hiCanvas((r, h) => {
  spanRows(h, 12, [[12, 37], [9, 40], [8, 41]], '#3aa898'); h(15, 8, 41, '#2a8878'); r(9, 16, 32, 18, '#eef0f2'); r(9, 16, 32, 3, '#3aa898');
  r(18, 20, 14, 3, '#ffffff'); r(19, 21, 2, 1, '#2f74b8'); for (const x of [23, 25, 27, 29]) r(x, 21, 1, 1, '#333');
  r(12, 25, 6, 5, '#6f8fa8'); r(27, 25, 8, 9, '#3f4a52'); r(29, 26, 4, 3, '#8aa0b0'); r(9, 30, 32, 4, '#c8a888'); for (let x = 10; x < 41; x += 3) r(x, 31, 2, 1, '#a88868');
  r(0, 34, 48, 14, '#a8a49c'); for (let x = 1; x < 30; x += 4) { r(x, 37, 3, 3, '#3a3a3e'); r(x + 1, 36, 1, 1, '#6a6a6e'); r(x, 40, 1, 2, '#2a2a2e'); r(x + 2, 40, 1, 2, '#2a2a2e'); } h(44, 0, 47, '#d8b860');
});
// 名鉄の小さな駅でよく見る、青緑のかまぼこ屋根の駅舎（x0〜x1、屋根の上 y0、壁の下 y1）。brick：下の茶色い帯、sign：駅名の看板
const TEAL5 = ['#7fd0c8', '#4fb8b0', '#2f8a84'];
function tealStation5(r, h, x0, x1, y0, y1, o = {}) {
  const w = x1 - x0;
  h(y0, x0 + 3, x1 - 3, TEAL5[0]); h(y0 + 1, x0 + 1, x1 - 1, TEAL5[0]); r(x0, y0 + 2, w + 1, 2, TEAL5[1]); h(y0 + 4, x0 - 1, x1 + 1, TEAL5[2]);
  for (let x = x0 + 2; x < x1; x += 3) r(x, y0 + 1, 1, 3, '#9fe0d8');
  r(x0 + 1, y0 + 5, w - 1, y1 - y0 - 5, o.wall || '#ece6d8'); h(y0 + 5, x0 + 1, x1 - 1, '#c8c0b0');
  if (o.brick) r(x0 + 1, y1 - 5, w - 1, 5, o.brick);
  if (o.sign) { r(o.sign, y0 + 6, 12, 3, '#ffffff'); r(o.sign + 1, y0 + 7, 2, 1, '#2f74b8'); h(y0 + 7, o.sign + 4, o.sign + 10, '#333'); }
  if (o.door) r(o.door, y1 - 9, 6, 9, '#3f4a52');
}
function rails5(r, h, y) { r(0, y, 48, 48 - y, '#6a5a4a'); h(y + 1, 0, 47, '#a8a8a8'); h(y + 3, 0, 47, '#a8a8a8'); for (let x = 1; x < 48; x += 3) r(x, y + 2, 1, 1, '#8a7a6a'); }
function crossing5(r, x, y) { r(x, y, 1, 14, '#e8e8e8'); for (let i = 0; i < 6; i++) r(x - 2, y + 1 + i * 2, 5, 1, i % 2 ? '#222' : '#f2c230'); r(x - 2, y, 2, 2, '#d23a2e'); r(x + 1, y, 2, 2, '#d23a2e'); }
// 刈谷市駅：灰色のコンクリートの駅舎と横長のひさし、青い駅名の看板。うしろにマンション
spotSprites.osmN8095177153 = hiCanvas((r, h) => {
  r(4, 2, 16, 18, '#d8c8b8'); for (let y = 4; y < 19; y += 3) h(y, 5, 18, '#b8a898'); r(22, 6, 10, 14, '#e4d6c8'); for (let y = 8; y < 19; y += 3) h(y, 23, 31, '#c4b4a4');
  r(0, 18, 48, 4, '#9a9690'); h(18, 0, 47, '#b8b4ac'); h(21, 0, 47, '#6a665e'); r(0, 22, 48, 14, '#b8b2a8'); r(0, 22, 48, 3, '#a89060');
  r(22, 26, 12, 3, '#2f5fae'); r(23, 27, 6, 1, '#ffffff'); r(3, 28, 14, 8, '#f0f0ec'); r(5, 30, 4, 6, '#6f8fa8'); r(11, 30, 4, 6, '#6f8fa8'); r(36, 26, 10, 10, '#4a4e52'); r(38, 28, 3, 8, '#7a8a96');
  for (const x of [20, 34]) r(x, 22, 2, 14, '#8a867e'); r(0, 36, 48, 12, '#7a7a78'); h(37, 0, 47, '#9a9a96'); r(42, 30, 3, 6, '#d23a2e');
});
// 小垣江駅：青緑のかまぼこ屋根の駅舎、白い手すりのスロープ、黄色と黒の踏切
spotSprites.osmN8095191433 = hiCanvas((r, h) => {
  tealStation5(r, h, 18, 44, 8, 34, { sign: 22, door: 30, brick: '#c8b8a0' });
  r(20, 15, 22, 2, '#2f74b8'); spanRows(h, 30, [[2, 20], [2, 20], [2, 20], [2, 20]], '#c8c3b8'); for (let x = 3; x < 20; x += 3) r(x, 26, 1, 4, '#f4f4f4'); h(26, 2, 19, '#f4f4f4');
  crossing5(r, 8, 10); rails5(r, h, 38);
});
// 一ツ木駅：白い駅舎に青緑の丸い屋根、白いさく、架線の柱と踏切
spotSprites.osmN8108665357 = hiCanvas((r, h) => {
  r(8, 2, 1, 32, '#8a8a88'); h(4, 6, 44, '#8a8a88'); r(42, 2, 1, 32, '#8a8a88');
  tealStation5(r, h, 16, 38, 12, 34, { door: 25, sign: 20 }); r(4, 22, 12, 12, '#f4f2ec'); spanRows(h, 19, [[5, 14], [4, 15], [3, 16]], '#8a8a8a');
  crossing5(r, 41, 18); for (let x = 1; x < 47; x += 3) r(x, 33, 1, 4, '#f4f4f4'); h(33, 0, 47, '#f4f4f4'); rails5(r, h, 39);
});
// 上ゲ駅：青緑の屋根の白い小さな駅舎とホーム、黄と黒の踏切のしゃ断機
spotSprites.osmN8100472235 = hiCanvas((r, h) => {
  tealStation5(r, h, 4, 22, 10, 30, { door: 11 }); r(26, 18, 18, 3, TEAL5[1]); h(21, 26, 43, TEAL5[2]); for (const x of [27, 42]) r(x, 21, 1, 9, '#8a8a88');
  r(0, 30, 48, 5, '#b8b4ac'); h(30, 0, 47, '#f2c230'); crossing5(r, 24, 14); for (let x = 25; x < 46; x += 4) r(x, 26, 2, 1, x % 8 ? '#222' : '#f2c230');
  rails5(r, h, 37);
});
// 阿久比駅：駅前広場に立つ銀色の帆のような記念碑と、名鉄の赤い電車、駅舎
spotSprites.osmN8100472247 = hiCanvas((r, h) => {
  r(0, 22, 30, 10, '#d0342c'); for (let x = 2; x < 28; x += 4) r(x, 24, 3, 3, '#2b3440'); h(31, 0, 29, '#333');
  r(14, 14, 18, 18, '#c8c8c4'); r(16, 18, 6, 4, '#6f8fa8'); r(24, 18, 6, 4, '#6f8fa8'); h(14, 14, 31, '#a8a8a4');
  spanRows(h, 1, [[38, 38], [37, 39], [37, 40], [36, 40], [36, 41], [35, 41], [35, 41], [35, 42], [34, 42], [34, 42], [34, 42], [34, 41], [34, 41], [35, 41], [35, 40], [35, 40], [36, 40], [36, 39], [37, 39], [37, 39], [37, 38], [37, 38], [37, 38], [37, 38]], i => i % 3 ? '#c8d0d8' : '#e8eef4');
  r(36, 1, 1, 22, '#8a96a2'); r(32, 25, 12, 5, '#9a968c'); h(25, 32, 43, '#b8b4ac');
  r(0, 32, 48, 4, '#3f8a34'); h(32, 0, 47, '#5aa04a'); r(0, 36, 48, 12, '#8a8a88'); for (let x = 4; x < 48; x += 8) r(x, 41, 4, 1, '#d8d8d4');
});
// 半田口駅：青緑の屋根のホームの待合所と、黄色い点字ブロックのホーム、線路
spotSprites.osmN8100472245 = hiCanvas((r, h) => {
  r(28, 8, 14, 18, '#e8e4dc'); spanRows(h, 5, [[30, 39], [28, 41]], '#6a6a6a'); r(31, 12, 3, 4, '#6f8fa8'); r(36, 12, 3, 4, '#6f8fa8');
  r(2, 16, 26, 3, TEAL5[1]); h(15, 3, 26, TEAL5[0]); h(19, 2, 27, TEAL5[2]); for (const x of [4, 14, 25]) r(x, 20, 1, 10, '#8a8a88'); r(6, 23, 14, 5, '#5a6aa0'); r(7, 24, 12, 3, '#7a8ac0');
  r(0, 30, 48, 6, '#a8a49c'); h(30, 0, 47, '#f2c230'); for (let x = 1; x < 48; x += 3) r(x, 31, 1, 1, '#c8a830'); rails5(r, h, 38);
});
// 住吉町駅：ホームの白い駅舎とひさし、灰色のホームと線路
spotSprites.osmN8100472240 = hiCanvas((r, h) => {
  r(4, 10, 18, 20, '#f0eee8'); h(10, 4, 21, '#c8c4bc'); for (let y = 13; y < 26; y += 5) r(6, y, 14, 3, '#7a8ea0'); r(24, 14, 20, 16, '#e0dcd4'); r(26, 17, 6, 5, '#6f8fa8'); r(35, 17, 6, 5, '#6f8fa8');
  r(0, 22, 48, 2, '#8a8a88'); h(21, 0, 47, '#b8b8b4'); for (const x of [10, 30, 44]) r(x, 24, 1, 8, '#6a6a68');
  r(0, 30, 48, 6, '#a8a49c'); h(30, 0, 47, '#e8e4dc'); rails5(r, h, 38);
});
// 知多半田駅：白い大きな駅ビルと、外の階段、横長の窓
spotSprites.osmN8100472239 = hiCanvas((r, h) => {
  r(2, 12, 36, 24, '#f2f0ec'); h(12, 2, 37, '#d8d6d0'); for (let y = 16; y < 32; y += 6) { r(4, y, 32, 3, '#7a8ea0'); for (let x = 4; x < 36; x += 4) r(x, y, 1, 3, '#e8e8e4'); }
  r(30, 6, 14, 30, '#e8e6e0'); h(6, 30, 43, '#c8c6c0'); r(33, 9, 8, 4, '#2f74b8'); r(34, 10, 6, 1, '#ffffff');
  for (let i = 0; i < 10; i++) r(20 + i, 35 - i, 2, 1, '#b8b8b4'); h(25, 20, 30, '#d8d8d4');
  r(0, 36, 48, 4, '#c8c4bc'); r(0, 40, 48, 8, '#7a7a78'); for (let x = 4; x < 48; x += 8) r(x, 43, 4, 1, '#d8d8d4');
});
// 植大駅：青緑の大きな丸い屋根の駅舎、うす桃色の壁、赤い自動販売機
spotSprites.osmN8100472246 = hiCanvas((r, h) => {
  r(2, 6, 44, 3, '#8a8a88'); h(5, 2, 45, '#a8a8a4'); for (const x of [4, 44]) r(x, 9, 1, 25, '#7a7a78');
  tealStation5(r, h, 8, 44, 12, 36, { wall: '#ecdcd8', brick: '#b4aca0', sign: 30, door: 34 });
  r(9, 20, 10, 16, '#5a5a58'); for (let x = 10; x < 19; x += 2) r(x, 20, 1, 16, '#7a7a78'); r(21, 24, 4, 12, '#d23a2e'); r(22, 25, 2, 4, '#f4f4f4');
  r(0, 36, 48, 12, '#8a8a88'); h(36, 0, 47, '#a8a8a4'); for (let x = 2; x < 48; x += 9) r(x, 42, 5, 1, '#f4f4f4');
});
// 坂部駅：白い駅舎に青緑のかまぼこ屋根、灰色のブロック塀と植えこみ
spotSprites.osmN8100472263 = hiCanvas((r, h) => {
  tealStation5(r, h, 4, 36, 10, 34, { sign: 12, door: 24, wall: '#f2f0ea' }); r(6, 22, 14, 8, '#d8d4cc'); r(8, 24, 4, 4, '#6f8fa8');
  r(30, 18, 16, 3, TEAL5[1]); h(21, 30, 45, TEAL5[2]); r(32, 22, 12, 12, '#d8d6d0');
  pix(r, ['..######..', '.########.', '##########', '##########', '##########'], 18, 30, '#3f7a34'); h(30, 21, 25, '#5a9a44');
  r(0, 35, 48, 13, '#a89a8a'); for (let x = 0; x < 48; x += 4) for (let y = 37; y < 48; y += 3) r(x + (y % 2) * 2, y, 3, 1, '#968878');
});
// 成岩駅：茶色いレンガの壁に青緑のかまぼこ屋根の小さな駅舎、うしろに高いマンション
spotSprites.osmN8100472237 = hiCanvas((r, h) => {
  r(18, 0, 18, 24, '#8a8682'); for (let y = 2; y < 24; y += 3) { h(y, 18, 35, '#5a5652'); for (let x = 20; x < 35; x += 4) r(x, y + 1, 2, 1, '#c8c4bc'); }
  tealStation5(r, h, 4, 30, 16, 38, { wall: '#e8e2d8', brick: '#8a5a44', sign: 14, door: 22 }); r(5, 23, 7, 10, '#8a5a44');
  for (let x = 32; x < 47; x += 3) r(x, 30, 1, 8, '#e8e8e8'); h(30, 32, 46, '#e8e8e8'); r(0, 38, 48, 10, '#8a8a88');
});
// 知多武豊駅：横に長い平らな屋根の駅舎、青緑のひさし、灰色の事務所の建物
spotSprites.osmN8100472234 = hiCanvas((r, h) => {
  r(24, 10, 18, 12, '#b8b4ac'); h(10, 24, 41, '#d0ccc4'); r(30, 13, 8, 3, '#ffffff'); h(14, 31, 37, '#3a9a4a');
  r(0, 20, 48, 3, TEAL5[1]); h(19, 0, 47, TEAL5[0]); h(23, 0, 47, TEAL5[2]); r(2, 24, 44, 12, '#ece8e0'); for (const x of [3, 15, 30, 44]) r(x, 24, 1, 12, '#a8a49c');
  r(6, 26, 7, 6, '#6f8fa8'); r(17, 26, 10, 10, '#3f4a52'); r(32, 26, 9, 6, '#6f8fa8'); for (let x = 2; x < 46; x += 3) r(x, 33, 1, 3, '#d8d8d4');
  r(0, 36, 48, 12, '#7a7a78'); for (let x = 3; x < 48; x += 8) r(x, 42, 5, 1, '#e8e8e8');
});
// 富貴駅：灰茶色の切妻屋根の木の駅舎、白い壁と駅名の看板、うしろに赤い電車
spotSprites.osmN8095098611 = hiCanvas((r, h) => {
  r(0, 20, 14, 10, '#d0342c'); for (let x = 1; x < 13; x += 4) r(x, 22, 3, 3, '#2b3440');
  for (let k = 0; k < 10; k++) h(8 + k, 24 - k * 2, 25 + k * 2, k % 3 ? '#7a6e62' : '#968a7c'); h(18, 4, 45, '#4a4038');
  r(8, 19, 34, 17, '#f0ece2'); for (const x of [8, 20, 29, 41]) r(x, 19, 1, 17, '#7a5a40'); h(19, 8, 41, '#7a5a40');
  r(18, 20, 14, 3, '#ffffff'); r(19, 21, 2, 1, '#2f74b8'); h(21, 22, 30, '#333'); r(21, 25, 8, 11, '#3f4a52'); r(10, 25, 7, 6, '#6f8fa8'); r(32, 25, 7, 6, '#6f8fa8');
  r(0, 36, 48, 12, '#b8b2a6'); h(36, 0, 47, '#c8c2b6');
});
// 三河上郷駅：灰色の横に長い大きな駅舎（高架の駅）と、前の広場
spotSprites.osmN7774774734 = hiCanvas((r, h) => {
  r(0, 10, 48, 4, '#6a6e72'); h(10, 0, 47, '#8a8e92'); r(0, 14, 48, 20, '#a8a8a4'); h(14, 0, 47, '#b8b8b4');
  for (let x = 2; x < 46; x += 6) r(x, 17, 4, 4, '#4a5664'); r(16, 16, 12, 2, '#ffffff'); for (const x of [8, 22, 36]) r(x, 22, 2, 12, '#8a8a86');
  r(12, 26, 10, 8, '#3f4a52'); r(26, 26, 8, 8, '#3f4a52'); r(0, 34, 48, 14, '#6a6a68'); h(34, 0, 47, '#8a8a88'); pix(r, ['.#####.', '#######'], 38, 32, '#4a8a2a');
});
// 了運寺：灰色の大きな瓦屋根の本堂と、手前の松の木、白い砂利
spotSprites.osmN7457793269 = hiCanvas((r, h) => {
  tileRoof(r, h, 8, [[14, 37], [12, 39], [10, 41], [8, 43], [6, 45], [5, 46], [4, 47]], ['#9a9ea6', '#6e737c', '#3e424a', '#5e636c']);
  r(8, 15, 36, 16, '#5a4a3c'); for (const x of [8, 16, 26, 35, 43]) r(x, 15, 1, 16, '#8a7058'); r(18, 18, 14, 13, '#2e2620');
  r(0, 31, 48, 17, '#d8d4c8');
  r(10, 14, 2, 26, '#5a4030'); r(36, 12, 2, 28, '#5a4030');
  for (const [x, y] of [[2, 10], [9, 6], [12, 13], [4, 18], [14, 21], [6, 25], [30, 6], [37, 3], [33, 13], [40, 11], [31, 20], [38, 22]]) { pix(r, ['..####..', '.######.', '########', '.######.'], x, y, '#2f6a3a'); h(y, x + 2, x + 5, '#4f8a4a'); } for (const [x, y] of [[10, 36], [26, 40], [34, 35], [16, 43]]) r(x, y, 3, 1, '#b8b4a8');
});
// 東浦駅（JR）：茶色い瓦屋根のベージュの駅舎、前にピンクのつつじ
spotSprites.osmN9385135483 = hiCanvas((r, h) => {
  tileRoof(r, h, 12, [[6, 41], [4, 43], [2, 45], [1, 46]], ['#968a7a', '#746a5c', '#4a4238', '#665c50']);
  r(3, 16, 42, 16, '#e8dcc4'); for (const x of [6, 14, 32, 38]) r(x, 19, 5, 6, '#6f8fa8'); r(21, 19, 8, 13, '#3f4a52'); r(20, 16, 10, 3, '#ffffff'); h(17, 21, 28, '#3a7a5a');
  for (let x = 1; x < 46; x += 4) { r(x, 31, 4, 3, '#3f7a34'); r(x + 1, 30, 2, 2, x % 8 ? '#e85a8a' : '#f48aa8'); }
  r(0, 34, 48, 14, '#7a7a78'); spanRows(h, 38, [[34, 47], [30, 47], [27, 47]], '#e8e8e8');
});
// 東成岩駅（JR）：灰色の屋根の白い小さな駅舎と、ならんだ自転車、踏切
spotSprites.osmN8241963496 = hiCanvas((r, h) => {
  r(2, 6, 14, 18, '#e8e8e4'); for (let y = 9; y < 22; y += 4) r(4, y, 10, 2, '#7a8ea0');
  for (let k = 0; k < 6; k++) h(14 + k, 22 - k * 2, 23 + k * 2, k % 2 ? '#7a7e84' : '#9a9ea4'); h(20, 10, 35, '#5a5e64'); r(12, 21, 22, 13, '#f0eee8'); r(19, 24, 7, 10, '#3f4a52'); r(13, 23, 5, 5, '#6f8fa8'); r(28, 23, 5, 5, '#6f8fa8');
  crossing5(r, 41, 14); for (const x of [2, 7, 30, 35]) { r(x, 35, 4, 4, '#3a3a3a'); r(x + 1, 36, 2, 2, '#8a8a8a'); h(34, x, x + 3, x % 3 ? '#3a6ac0' : '#c8c8c8'); }
  r(0, 39, 48, 9, '#8a8a88'); h(39, 0, 47, '#a8a8a4');
});
// 武豊駅：駅前広場の石の記念碑（上に像）と、低い駅舎
spotSprites.osmN8237565048 = hiCanvas((r, h) => {
  r(24, 22, 22, 12, '#e8e4dc'); spanRows(h, 19, [[26, 43], [24, 45], [23, 46]], '#8a7a6a'); r(28, 25, 5, 5, '#6f8fa8'); r(36, 25, 6, 9, '#3f4a52'); r(24, 30, 22, 4, '#c8a090');
  r(9, 2, 4, 6, '#7a6e60'); r(8, 4, 6, 3, '#7a6e60'); r(10, 1, 2, 1, '#9a8e80');
  r(7, 8, 8, 18, '#b8ae9c'); h(8, 7, 14, '#c8bfae'); r(7, 8, 2, 18, '#d0c8b8'); for (let y = 11; y < 24; y += 3) r(10, y, 2, 1, '#6a6050');
  spanRows(h, 26, [[5, 16], [4, 17], [3, 18], [2, 19], [2, 19]], i => i % 2 ? '#9a9080' : '#b0a694'); for (let i = 0; i < 4; i++) h(31 + i, 6 + i, 13 - i, '#8a8070');
  r(0, 34, 48, 14, '#6a6a68'); spanRows(h, 38, [[20, 47], [24, 47], [30, 47]], '#a8a8a4'); r(18, 42, 6, 1, '#f4f4f4');
});
// JR 半田駅：灰色の瓦屋根の平屋の駅舎、正面に赤い三角の飾りのある入口、白い壁
spotSprites.osmN8241972430 = hiCanvas((r, h) => {
  tileRoof(r, h, 14, [[4, 43], [3, 44], [2, 45], [1, 46]], ['#8a8e94', '#6a6e74', '#3e4248', '#5a5e64']);
  r(2, 18, 44, 18, '#efede6'); h(18, 2, 45, '#c8c6c0');
  for (let k = 0; k < 6; k++) h(9 + k, 23 - k, 24 + k, '#c42a2a'); r(19, 11, 10, 4, '#efede6'); r(22, 12, 4, 2, '#2a2a2a');   // 赤い三角の飾り
  r(17, 15, 14, 3, '#3a3a3a'); r(18, 22, 12, 14, '#3a4650'); for (const x of [21, 24, 27]) r(x, 22, 1, 14, '#c8ccd0');
  for (const x of [4, 34]) { r(x, 22, 9, 7, '#6f8fa8'); h(22, x, x + 8, '#9fb8cc'); }
  r(5, 30, 2, 6, '#d23a2e'); r(38, 29, 4, 7, '#e8e8e8'); r(39, 30, 2, 3, '#3a6ac0');
  r(0, 36, 48, 6, '#9a9a96'); h(36, 0, 47, '#b8b8b4'); for (let x = 3; x < 48; x += 8) r(x, 39, 5, 1, '#f4f4f4');
});
// JR 乙川駅（武豊線）：灰色の小さな駅舎、右に斜めに張り出した屋根、白とオレンジの自動販売機
spotSprites.osmN8241891774 = hiCanvas((r, h) => {
  r(6, 14, 24, 22, '#5a5e64'); h(13, 5, 30, '#3a3e44'); r(9, 17, 7, 8, '#2a2e34'); r(9, 17, 7, 2, '#ffffff'); r(10, 18, 5, 1, '#d23a2e');
  spanRows(h, 10, [[28, 36], [28, 39], [28, 42], [28, 45]], '#c8ccd0'); r(30, 14, 1, 22, '#8a8e94'); r(44, 14, 1, 22, '#8a8e94'); h(14, 28, 46, '#6a6e74');
  r(18, 22, 7, 14, '#f4f4f4'); r(19, 24, 5, 4, '#c8d8e8'); r(26, 22, 7, 14, '#f4f4f4'); r(26, 30, 7, 2, '#e88a2a'); r(27, 24, 5, 4, '#c8d8e8');
  r(0, 36, 48, 7, '#a8a8a4'); h(36, 0, 47, '#c8c8c4'); r(36, 31, 6, 5, '#4a4a4a'); r(37, 32, 4, 2, '#d23a2e');
});
// JR 尾張森岡駅：線路をまたぐ跨線橋へ上る階段と、白い小さな駅舎
spotSprites.osmN8241775866 = hiCanvas((r, h) => {
  r(28, 6, 18, 12, '#e8e8e4'); h(6, 27, 46, '#8a8e94'); r(30, 9, 5, 4, '#6f8fa8'); r(38, 9, 5, 4, '#6f8fa8'); r(26, 18, 22, 3, '#c8ccd0');
  for (let i = 0; i < 14; i++) { h(38 - i * 2, 8 + i, 22 + i, i % 2 ? '#9a9a96' : '#b8b8b4'); h(39 - i * 2, 8 + i, 22 + i, '#8a8a86'); }   // 階段
  for (let i = 0; i < 14; i++) { r(7 + i, 33 - i * 2, 1, 6, '#5a5e64'); r(23 + i, 33 - i * 2, 1, 6, '#5a5e64'); }   // 手すり
  r(38, 21, 1, 20, '#5a5e64'); r(2, 26, 1, 16, '#4a4a4a'); r(0, 24, 5, 3, '#3a3a3a'); r(1, 25, 1, 1, '#e84040');
  r(0, 40, 48, 8, '#9a9a96'); r(34, 36, 10, 4, '#3a3a3a'); r(36, 34, 3, 2, '#3a3a3a'); r(41, 34, 3, 2, '#3a3a3a');
});
// JR 緒川駅：高い所にある駅で、白い箱形の駅舎と横にのびるホームの屋根
spotSprites.osmN8241775864 = hiCanvas((r, h) => {
  r(0, 10, 22, 3, '#8a8e94'); r(0, 13, 22, 4, '#c8ccd0'); for (const x of [4, 12, 20]) r(x, 17, 2, 14, '#a8a8a4');
  r(18, 8, 26, 22, '#f2f2ee'); h(8, 18, 43, '#c8ccd0'); h(9, 18, 43, '#a8acb0');
  for (let x = 21; x < 42; x += 5) r(x, 13, 3, 6, '#6f8fa8'); r(18, 23, 26, 3, '#d8dce0'); r(22, 26, 14, 8, '#3f4a52'); r(26, 24, 6, 2, '#2f6fb8');
  r(38, 26, 9, 8, '#e8e8e4'); r(0, 34, 48, 6, '#8a8a88'); h(34, 0, 47, '#a8a8a4');
  pix(r, ['..######', '.#######', '########', '########'], 40, 26, '#3f7a34');
});
// JR 石浜駅：線路の上をわたる長い跨線橋（窓のついた白い通路）と、上る階段
spotSprites.osmN8241886323 = hiCanvas((r, h) => {
  r(0, 10, 40, 7, '#f0f0ec'); h(10, 0, 39, '#a8acb0'); h(16, 0, 39, '#8a8e94'); for (let x = 2; x < 39; x += 4) r(x, 12, 3, 3, '#7fa0c0');
  for (const x of [8, 30]) r(x, 17, 2, 20, '#c8ccd0');
  for (let i = 0; i < 11; i++) { h(17 + i * 2, 38 + Math.floor(i / 2), 46, '#d8d8d4'); h(18 + i * 2, 38 + Math.floor(i / 2), 46, '#a8a8a4'); } r(37, 10, 1, 30, '#8a8e94');
  r(14, 28, 14, 9, '#e8e8e4'); h(27, 13, 28, '#6a6e74'); r(18, 31, 6, 6, '#3f4a52');
  r(0, 37, 48, 4, '#b8b8b4'); r(0, 41, 48, 7, '#5a4d40'); h(42, 0, 47, '#9a9a9a'); h(45, 0, 47, '#9a9a9a');
});
// JR 亀崎駅：明治時代からの木造駅舎。こげ茶の板壁、赤茶のトタンの寄棟屋根と、正面の小さな破風
spotSprites.osmN8241880205 = hiCanvas((r, h) => {
  for (let k = 0; k < 7; k++) h(6 + k, 24 - k, 25 + k, k ? '#7a4a3a' : '#5a3428'); r(21, 9, 8, 3, '#e8e0d0'); r(23, 10, 4, 1, '#3a3a3a');   // 正面の破風
  spanRows(h, 12, [[8, 41], [6, 43], [4, 45], [2, 47], [1, 47]], i => i % 2 ? '#7a4a3a' : '#8e5a46'); h(17, 1, 47, '#4a2a20');
  r(3, 18, 42, 18, '#3e2e26'); for (let x = 4; x < 45; x += 2) r(x, 18, 1, 18, '#4e3a30'); h(18, 3, 44, '#5a4436');
  for (const x of [6, 33]) { r(x, 22, 9, 8, '#c8d0d4'); r(x + 4, 22, 1, 8, '#3e2e26'); h(26, x, x + 8, '#3e2e26'); }
  r(19, 22, 10, 14, '#1e1612'); r(21, 24, 6, 4, '#c8d0d4');
  r(0, 36, 48, 7, '#9a9a96'); r(44, 30, 3, 6, '#3a6a3a');
});
// 夢と学びの科学体験館（刈谷）：クリーム色の壁にアーチ窓、レンガの円筒の塔と青いドーム（プラネタリウム）
spotSprites.osmW500212839 = hiCanvas((r, h) => {
  spanRows(h, 12, [[24, 35], [22, 37], [21, 38], [20, 39]], '#4a9a9a'); h(12, 26, 33, '#7acaca');
  r(2, 18, 44, 22, '#e8dcb0'); h(18, 2, 45, '#c8bc90');
  for (let x = 20; x < 44; x += 5) { r(x, 22, 3, 12, '#b8a878'); r(x, 21, 3, 1, '#b8a878'); }
  r(8, 6, 9, 34, '#a85a3a'); r(8, 6, 3, 34, '#c06a48'); for (let y = 9; y < 38; y += 3) h(y, 8, 16, '#8a4a30'); for (let y = 10; y < 34; y += 6) r(11, y, 3, 3, '#6f8fa8');
  spanRows(h, 2, [[10, 14], [9, 15], [8, 16]], '#6f9fe2'); r(10, 1, 4, 1, '#9fc0f0');
  r(22, 34, 18, 6, '#3f4a52'); r(0, 40, 48, 3, '#a8a49c'); pix(r, ['.####', '#####', '#####'], 43, 37, '#3f7a34');
});
// 半田空の科学館：横に長い低いクリーム色の建物と、うしろの少し高い棟、前の木
spotSprites.osmW625806226 = hiCanvas((r, h) => {
  r(18, 10, 22, 8, '#d8d0c0'); h(10, 18, 39, '#b8b0a0'); spanRows(h, 7, [[22, 34], [20, 36]], '#a87050');
  r(0, 16, 48, 18, '#e4dccc'); h(16, 0, 47, '#c8c0b0'); h(24, 0, 47, '#d0c8b8'); for (let x = 3; x < 46; x += 7) r(x, 26, 4, 4, '#8a9aa8');
  for (const x of [8, 24, 38]) { r(x - 4, 22, 9, 7, '#3f7a34'); r(x - 3, 21, 7, 1, '#5a9a44'); r(x, 29, 1, 5, '#5a4030'); }
  r(0, 34, 48, 14, '#8a8a88'); for (let x = 3; x < 48; x += 6) r(x, 37, 1, 10, '#f4f4f4');
});
// 新美南吉記念館：芝生におおわれた波形の屋根（地面から盛りあがるような建物）と白い壁
spotSprites.osmW675609772 = hiCanvas((r, h) => {
  for (let x = 0; x < 48; x++) { const y = Math.round(28 - 10 * Math.max(0, Math.sin((x - 6) / 40 * Math.PI)) - 3 * Math.max(0, Math.sin((x - 2) / 14 * Math.PI))); h(y, x, x, '#5a9a3a'); r(x, y + 1, 1, 34 - y, '#4a8a2e'); }
  for (let x = 14; x < 36; x++) { const t = (x - 14) / 22; r(x, Math.round(30 - 8 * Math.sin(t * Math.PI)), 1, 3, '#f4f4f0'); }
  r(14, 30, 22, 4, '#f4f4f0'); r(20, 30, 8, 4, '#3f4a52');
  r(0, 34, 48, 14, '#6aa84a'); spanRows(h, 38, [[18, 30], [16, 34], [14, 38], [12, 42]], '#b8b4a8');
  r(38, 18, 1, 16, '#6a6a6a'); r(41, 14, 1, 20, '#6a6a6a');
});
// 半田赤レンガ建物（旧カブトビール工場）：赤レンガの壁に黒い木の柱と梁、縦長の窓、右に高い塔
spotSprites.osmW627492620 = hiCanvas((r, h) => {
  r(36, 4, 10, 30, '#9a5040'); h(4, 36, 45, '#7a3a2a'); for (let y = 7; y < 32; y += 3) h(y, 36, 45, '#8a4434'); r(39, 8, 4, 5, '#3a3030');
  spanRows(h, 10, [[2, 37], [1, 37], [0, 37]], '#4a4a4e'); r(0, 13, 37, 25, '#a85a44');
  for (let y = 15; y < 38; y += 3) h(y, 0, 36, '#94503c'); for (let x = 0; x < 37; x += 6) r(x, 13, 2, 25, '#2e2a28'); h(13, 0, 36, '#2e2a28'); h(25, 0, 36, '#2e2a28');
  for (let x = 3; x < 34; x += 6) { r(x, 16, 2, 7, '#3a3a40'); r(x, 28, 2, 7, '#3a3a40'); }
  r(0, 38, 48, 10, '#c89a88'); h(38, 0, 47, '#b08070');
});
// アイシン コムセンター（刈谷）：白いパネルを並べた横長の箱と、下の黒いガラスの帯
spotSprites.osmW521638240 = hiCanvas((r, h) => {
  r(2, 10, 44, 18, '#f0f0ee'); for (let x = 2; x < 46; x += 6) r(x, 10, 1, 18, '#c8c8c6'); h(10, 2, 45, '#d8d8d6'); r(30, 13, 10, 2, '#2a3a5a'); r(28, 13, 1, 2, '#2a3a5a');
  r(2, 28, 44, 8, '#1e2228'); for (let x = 4; x < 46; x += 4) r(x, 29, 1, 6, '#3a4250'); r(40, 4, 6, 24, '#c8ccd0');
  r(0, 36, 48, 4, '#c84a3a'); r(0, 37, 48, 1, '#3f7a34'); r(0, 40, 48, 8, '#8a8a88'); r(12, 30, 1, 18, '#5a5a5a');
});
// 本刈谷神社：唐破風のある銅ぶき（緑青）の拝殿、白い石の玉垣、両わきの石灯籠
spotSprites.osmW687980267 = hiCanvas((r, h) => {
  tileRoof(r, h, 6, [[12, 35], [10, 37], [8, 39], [6, 41], [5, 42]], ['#9aa8a0', '#6a7a72', '#3e4a44', '#5a6a62']);
  for (let x = 16; x <= 31; x++) { const y = Math.round(10 - 3 * Math.sin((x - 16) / 15 * Math.PI)); r(x, y, 1, 2, '#e8e4dc'); }   // 唐破風の白いふち
  r(18, 9, 12, 3, '#d8d0c0'); r(22, 6, 4, 2, '#c8a040');
  r(8, 11, 32, 14, '#8a3a2e'); r(14, 13, 20, 12, '#5a2a20'); for (let x = 15; x < 34; x += 3) r(x, 13, 1, 12, '#a85040'); h(11, 8, 39, '#e8e0d0');
  r(4, 25, 40, 6, '#e8e4dc'); for (let x = 6; x < 43; x += 4) r(x, 25, 1, 6, '#b8b4ac'); spanRows(h, 31, [[16, 31], [15, 32], [14, 33]], '#c8c4bc');
  for (const x of [0, 43]) { r(x + 1, 14, 3, 2, '#a8a49a'); r(x, 16, 5, 3, '#a8a49a'); r(x + 1, 17, 3, 1, '#f2d27a'); r(x + 1, 19, 3, 12, '#a8a49a'); }
  r(0, 34, 48, 14, '#c8c4b8'); for (const [x, y] of [[4, 38], [16, 42], [30, 39], [40, 44]]) r(x, y, 2, 1, '#a8a49c');
});
// 尾張三社（半田）：入母屋の灰色の瓦屋根、こげ茶の木の社殿、白い石の基壇
spotSprites.osmW736671941 = hiCanvas((r, h) => {
  tileRoof(r, h, 8, [[12, 35], [9, 38], [7, 40], [5, 42], [3, 44], [2, 45]], ['#8a8e94', '#64686e', '#33363a', '#50545a']);
  for (let k = 0; k < 4; k++) h(5 + k, 23 - k, 24 + k, k ? '#d8d4cc' : '#33363a'); r(22, 3, 4, 2, '#5a5e64');
  r(5, 14, 38, 16, '#3a2a22'); for (const x of [5, 13, 23, 33, 42]) r(x, 14, 1, 16, '#6a4a36'); r(16, 17, 16, 13, '#2a1e18'); for (let x = 17; x < 32; x += 2) r(x, 17, 1, 13, '#4a3a2e');
  r(22, 15, 4, 2, '#c8a040'); h(30, 2, 45, '#d8d4c8'); r(3, 31, 42, 4, '#c8c4b8'); spanRows(h, 35, [[16, 31], [15, 32], [14, 33]], '#b8b4a8');
  r(0, 38, 48, 10, '#9a9690'); pix(r, ['..###.', '.#####', '######', '######'], 40, 22, '#3f7a34');
});
// 海潮院（半田）：大きな瓦の入母屋屋根の本堂、白い壁と木の柱、石畳
spotSprites.osmW737526485 = hiCanvas((r, h) => {
  tileRoof(r, h, 6, [[13, 34], [11, 36], [9, 38], [7, 40], [5, 42], [3, 44], [2, 45], [1, 46]], ['#a8acb4', '#7c8088', '#40444a', '#62666e']);
  for (let k = 0; k < 4; k++) h(3 + k, 23 - k, 24 + k, k ? '#e8e4dc' : '#40444a');
  r(5, 14, 38, 16, '#f0ece2'); for (const x of [5, 12, 20, 27, 35, 42]) r(x, 14, 1, 16, '#6a4a36'); h(14, 5, 42, '#6a4a36'); h(20, 5, 42, '#6a4a36');
  r(15, 21, 18, 9, '#3a2e26'); for (let x = 16; x < 33; x += 2) r(x, 21, 1, 9, '#5a4a3a');
  h(30, 3, 44, '#c8c4b8'); r(4, 31, 40, 3, '#a8a49c'); for (let y = 34; y < 48; y++) h(y, 19 - (y - 34) / 2 | 0, 28 + (y - 34) / 2 | 0, y % 2 ? '#c8c4b8' : '#b8b4a8');
  for (const x of [0, 2]) { pix(r, ['.#####.', '#######', '.#####.'], x, 26 + x * 2, '#2f6a3a'); } r(3, 30, 1, 10, '#6a4a30');
});
// 旧中埜半六邸（半田）：黒い板壁と白い漆喰の2階建ての商家、瓦屋根、手前の松
spotSprites.osmW670221425 = hiCanvas((r, h) => {
  tileRoof(r, h, 4, [[10, 37], [8, 39], [6, 41], [5, 42]], ['#7c8088', '#5a5e64', '#2e3034', '#484c52']);
  r(7, 8, 34, 12, '#2e2c2c'); r(22, 9, 14, 8, '#e8d8d4'); for (let x = 9; x < 21; x += 3) r(x, 8, 1, 12, '#3e3c3c'); r(25, 11, 8, 4, '#3a3a40'); for (let x = 26; x < 33; x += 2) r(x, 11, 1, 4, '#8a8a90');
  tileRoof(r, h, 20, [[3, 44], [2, 45], [1, 46]], ['#7c8088', '#5a5e64', '#2e3034', '#484c52']);
  r(3, 23, 42, 15, '#3a3632'); for (let x = 4; x < 44; x += 2) r(x, 23, 1, 15, '#4a4642'); r(26, 25, 14, 8, '#e8e4dc'); r(29, 26, 8, 6, '#3a3a40'); r(8, 26, 10, 12, '#6a5040');
  pix(r, ['..####..', '.######.', '########', '.######.', '..####..'], 0, 26, '#2f6a3a'); r(4, 31, 1, 9, '#5a4030');
  r(0, 38, 48, 10, '#9a9690');
});
// 成石神社（半田）：瓦の入母屋屋根の拝殿、こげ茶の木の壁、石段の両わきに狛犬と石の玉垣
spotSprites.osmW848881120 = hiCanvas((r, h) => {
  tileRoof(r, h, 6, [[12, 35], [10, 37], [8, 39], [6, 41], [5, 42], [4, 43]], ['#8a8e94', '#62666c', '#33363a', '#4e5258']);
  for (let k = 0; k < 4; k++) h(3 + k, 23 - k, 24 + k, k ? '#d8d4cc' : '#33363a');
  r(7, 12, 34, 16, '#4a362c'); for (const x of [7, 15, 23, 32, 40]) r(x, 12, 1, 16, '#6a4e3a'); r(16, 15, 16, 13, '#2e221a'); for (let x = 17; x < 32; x += 3) r(x, 15, 1, 13, '#5a4434'); r(20, 16, 8, 3, '#e8e4dc');
  for (let i = 0; i < 6; i++) h(28 + i * 2, 15 - i, 32 + i, i % 2 ? '#a8a49a' : '#c8c4bc');
  for (const x of [2, 38]) { r(x, 28, 8, 12, '#b8b4ac'); for (let y = 29; y < 40; y += 3) h(y, x, x + 7, '#9a968e'); r(x + 2, 24, 4, 4, '#8a867e'); r(x + 3, 23, 2, 1, '#8a867e'); }   // 玉垣と狛犬
  r(0, 40, 48, 8, '#b8b0a0'); for (const [x, y] of [[5, 43], [20, 45], [34, 42]]) r(x, y, 3, 1, '#9a9488');
});
/* ---------- 型でつくる名所の絵（48×48） ----------
   専用の絵がない OpenStreetMap の名所（神社・お寺・駅・史跡など）に、種類ごとの型で絵をつける。
   nishio-go/landmark-gen.js（tools/make-landmark-gen.js が作る）の NISHIO_LANDMARK_GEN = { OSMのid: [種類, 形の番号, 屋根の色, 壁の色, 差し色] }。
   色は、その場所の日本語版ウィキペディアの代表画像（Commons）から測ったもの。写真がない所は種類ごとの基本の色。絵は見えたときに作って覚えておく */
const GEN = window.NISHIO_LANDMARK_GEN || {};
const genCache = new Map();
const shade = (hex, f) => {   // f<1 で暗く、f>1 で白に近づける
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f));
  return '#' + c.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
};
const roofOf = c => [shade(c, 1.35), c, shade(c, 0.55), shade(c, 0.8)];
const STONE = '#a8a49a', PATH = '#c8c3b8';
function genTorii(r, h, x0, x1, y, col, tall = 16) {   // 鳥居：笠木（両はしが反る）・貫・柱2本
  h(y, x0, x1, col); h(y + 1, x0 + 1, x1 - 1, col); r(x0, y - 1, 1, 1, col); r(x1, y - 1, 1, 1, col); h(y + 4, x0 + 3, x1 - 3, col);
  r(x0 + 4, y + 2, 2, tall, col); r(x1 - 5, y + 2, 2, tall, col); r(x0 + 4, y + 2, 1, tall, shade(col, 1.25));
}
function genLantern(r, x, y) { r(x + 1, y, 2, 1, STONE); r(x, y + 1, 4, 2, STONE); r(x + 1, y + 2, 2, 1, '#f2d27a'); r(x + 1, y + 3, 2, 5, STONE); r(x, y + 8, 4, 1, '#8a857a'); }
function genHall(r, h, x0, x1, y0, roof, wall, opt = {}) {   // 入母屋の堂：瓦の帯・軒・柱と戸
  const w = x1 - x0, rows = opt.rows || 7, spans = [];
  for (let i = 0; i < rows; i++) { const k = Math.round((rows - 1 - i) * w / (rows * 4)); spans.push([x0 + k, x1 - k]); }
  if (opt.gable) for (let k = 0; k < 4; k++) h(y0 - 3 + k, Math.round((x0 + x1) / 2) - k, Math.round((x0 + x1) / 2) + k + 1, k ? shade(wall, 1.05) : roof[2]);
  tileRoof(r, h, y0, spans, roof);
  const by = y0 + rows, bh = opt.body || 10;
  r(x0 + 3, by, w - 5, bh, wall); h(by, x0 + 3, x1 - 3, shade(wall, 0.7));
  for (let x = x0 + 3; x <= x1 - 3; x += Math.max(4, Math.round(w / 6))) r(x, by, 1, bh, shade(wall, 0.55));
  const dx = Math.round((x0 + x1) / 2) - 4; r(dx, by + 2, 9, bh - 2, '#2e2620'); for (let x = dx + 1; x < dx + 9; x += 2) r(x, by + 2, 1, bh - 2, '#5a4a3a');
  return by + bh;
}
const GEN_DRAW = {
  shrine(r, h, v, [roof, wall, acc]) {   // 神社：拝殿としめ縄、手前に鳥居、石灯籠
    const RC = v % 3 === 1 ? roofOf('#5f9e8a') : roofOf(roof);
    if (v === 3) {   // 小さな祠
      tileRoof(r, h, 14, [[18, 29], [16, 31], [15, 32]], RC); r(18, 17, 12, 9, wall); r(21, 19, 6, 7, '#2e2620'); h(26, 15, 32, STONE);
    } else {
      const by = genHall(r, h, 3, 44, 4, RC, wall, { rows: 8, body: 12 });
      h(13, 9, 38, '#efe4c8'); h(14, 9, 38, '#d8c8a0'); for (const x of [14, 23, 32]) { r(x, 15, 1, 2, '#ffffff'); r(x + 1, 16, 1, 1, '#ffffff'); }
      h(by, 4, 43, STONE);
    }
    genTorii(r, h, 8, 39, 28, acc, 17);
    if (v % 2 === 0) { genLantern(r, 1, 36); genLantern(r, 43, 36); }
    for (let y = 40; y < 48; y++) h(y, 19 - (y - 40), 28 + (y - 40), y % 2 ? PATH : '#b8b2a6');
  },
  temple(r, h, v, [roof, wall, acc]) {   // お寺：瓦の大屋根の本堂。形の番号で鐘つき堂・山門・松をそえる
    const RC = roofOf(roof), right = v === 1 ? 33 : 45;
    const by = genHall(r, h, 2, right, 9, RC, wall, { rows: 11, body: 16, gable: v !== 3 });
    h(by, 1, right + 1, STONE); h(by + 1, 3, right - 1, '#8a857a');
    if (v === 1) { tileRoof(r, h, 12, [[36, 44], [35, 45], [34, 46]], RC); r(35, 15, 1, 15, '#5b4632'); r(45, 15, 1, 15, '#5b4632'); r(38, 17, 5, 6, '#5f7a62'); h(23, 38, 42, '#3a5a44'); }
    if (v === 2) { tileRoof(r, h, 37, [[12, 35], [10, 37], [9, 38]], RC); r(12, 40, 2, 8, '#6a4a30'); r(34, 40, 2, 8, '#6a4a30'); r(14, 41, 20, 7, '#2a2018'); }   // 手前の山門
    if (v === 3) { for (const [x, y] of [[0, 30], [4, 26], [0, 22]]) { pix(r, PINE, x, y, '#2f6a3a'); h(y, x + 2, x + 4, '#4f8a4a'); } r(3, 33, 1, 10, '#6a4a30'); }
    if (v !== 2) for (let y = 42; y < 48; y++) h(y, 20 - (y - 42), 27 + (y - 42), y % 2 ? PATH : '#b8b2a6');
  },
  station(r, h, v, [roof, wall, acc]) {   // 駅：形の番号で、木の駅舎・今の駅ビル・高架・ホームだけ
    const rail = () => { r(0, 43, 48, 5, '#5a4d40'); h(44, 0, 47, '#9a9a9a'); h(46, 0, 47, '#9a9a9a'); for (let x = 1; x < 48; x += 3) r(x, 45, 1, 1, '#7a6a5a'); };
    if (v === 0) {
      tileRoof(r, h, 14, [[10, 37], [8, 39], [6, 41], [5, 42]], roofOf(roof)); r(6, 18, 36, 17, wall);
      for (const x of [9, 30]) { r(x, 22, 7, 6, '#6f8fa8'); h(22, x, x + 6, '#9fb8cc'); } r(19, 22, 9, 13, '#3f4a52'); r(17, 18, 13, 3, '#ffffff'); h(20, 17, 29, acc);
      r(0, 35, 48, 6, '#a2a29f'); h(35, 0, 47, '#d8b860'); rail();
    } else if (v === 1) {
      r(4, 8, 40, 28, wall); h(8, 4, 43, shade(wall, 1.15)); for (let y = 12; y < 30; y += 5) { r(7, y, 34, 3, '#5d8fc4'); for (let x = 7; x < 41; x += 4) r(x, y, 1, 3, shade(wall, 1.1)); }
      r(14, 22, 20, 3, acc); r(16, 23, 16, 1, '#ffffff'); r(10, 30, 28, 6, '#3f4a52'); h(29, 6, 41, shade(wall, 0.6)); r(0, 36, 48, 5, '#a2a29f'); rail();
    } else if (v === 2) {
      r(0, 30, 48, 5, '#b8b8b4'); for (const x of [6, 22, 38]) r(x, 35, 4, 13, '#a8a8a4'); r(2, 14, 44, 3, roof); h(13, 3, 44, shade(roof, 1.3)); for (const x of [8, 24, 40]) r(x, 17, 1, 13, '#8a8a88');
      r(6, 21, 36, 9, acc); r(6, 21, 36, 2, shade(acc, 0.7)); for (let x = 9; x < 40; x += 5) r(x, 24, 3, 3, '#2b3440'); h(29, 6, 41, '#333');
    } else {
      r(2, 16, 44, 3, roof); h(15, 3, 44, shade(roof, 1.3)); for (const x of [6, 24, 41]) r(x, 19, 1, 14, '#8a8a88'); r(10, 26, 10, 4, wall); r(28, 22, 8, 10, acc); r(29, 23, 6, 4, '#f4f4f4');
      r(0, 33, 48, 8, '#a2a29f'); h(33, 0, 47, '#d8b860'); for (let y = 34; y < 41; y += 2) r(5, y, 1, 1, '#b89840'); rail();
    }
  },
  castle(r, h, v, [roof, wall, acc]) {   // 城跡：石垣と、小さな櫓か石碑
    for (let y = 28; y < 46; y++) { const k = (y - 28) >> 1; h(y, 6 - k, 41 + k, (y % 3) ? '#9b968a' : '#7a756b'); }
    for (let x = 6; x < 42; x += 6) r(x + ((x / 6) % 2) * 3, 29, 1, 16, '#6f6a61');
    if (v % 2 === 0) { tileRoof(r, h, 10, [[14, 33], [12, 35], [10, 37], [9, 38]], roofOf(roof)); r(12, 14, 24, 14, wall); r(12, 22, 24, 6, '#2d2d2c'); r(16, 16, 3, 3, '#3a3a3a'); r(29, 16, 3, 3, '#3a3a3a'); }
    else { r(20, 10, 8, 18, STONE); h(10, 20, 27, '#c8c4bc'); for (let y = 12; y < 26; y += 3) r(23, y, 2, 2, '#4a4a48'); r(16, 26, 16, 2, '#8a857a'); pix(r, PINE, 33, 12, '#2f6a3a'); r(36, 15, 1, 13, '#6a4a30'); }
  },
  public(r, h, v, [roof, wall, acc]) {   // 博物館・図書館・役所・美術館：今の建物。形の番号で、箱形・低く広い・時計塔・和風の大屋根
    if (v === 0) { r(5, 8, 38, 32, wall); h(8, 5, 42, shade(wall, 1.15)); for (let y = 12; y < 34; y += 6) { r(8, y, 32, 3, acc); for (let x = 8; x < 40; x += 5) r(x, y, 1, 3, shade(wall, 1.1)); } r(18, 34, 12, 6, '#3f4a52'); }
    else if (v === 1) { r(2, 20, 44, 20, wall); h(20, 2, 45, shade(wall, 1.2)); h(21, 2, 45, roof); for (let x = 5; x < 44; x += 6) r(x, 26, 4, 8, acc); r(17, 28, 14, 12, '#3f4a52'); r(14, 26, 20, 2, shade(wall, 0.7)); }
    else if (v === 2) { r(4, 18, 40, 22, wall); h(18, 4, 43, shade(wall, 1.15)); r(18, 4, 12, 14, wall); r(21, 7, 6, 6, '#f4f4f0'); r(23, 9, 2, 1, '#333'); r(24, 8, 1, 2, '#333'); h(4, 17, 30, roof); for (let x = 7; x < 42; x += 5) r(x, 23, 3, 4, acc); for (let x = 7; x < 42; x += 5) r(x, 30, 3, 4, acc); r(19, 33, 10, 7, '#3f4a52'); }
    else { tileRoof(r, h, 10, [[10, 37], [8, 39], [6, 41], [4, 43], [3, 44]], roofOf(roof)); r(6, 15, 36, 25, wall); for (let x = 9; x < 40; x += 6) r(x, 19, 4, 6, acc); r(18, 29, 12, 11, '#3f4a52'); }
    r(0, 40, 48, 3, '#a2a29f'); h(43, 0, 47, '#8a8a88');
  },
  historic(r, h, v, [roof, wall, acc]) {   // 史跡：形の番号で、石碑・古墳・古い門・古い家
    if (v === 0) { r(19, 8, 10, 26, STONE); h(8, 19, 28, '#c8c4bc'); r(19, 8, 2, 26, '#c0bcb2'); for (let y = 11; y < 31; y += 3) r(23, y, 2, 2, '#4a4a48'); r(14, 34, 20, 3, '#8a857a'); for (let x = 8; x < 41; x += 4) r(x, 36, 1, 6, '#6a4a30'); h(37, 8, 40, '#6a4a30'); }
    else if (v === 1) { spanRows(h, 14, [[18, 29], [14, 33], [11, 36], [8, 39], [6, 41], [4, 43], [3, 44], [2, 45], [1, 46], [0, 47], [0, 47], [0, 47]], i => i % 3 ? '#5a8a3a' : '#6fa04a'); for (const [x, y] of [[16, 12], [24, 11], [31, 13]]) { r(x, y, 4, 4, '#2f6a2a'); r(x + 1, y + 4, 1, 2, '#5a4030'); } r(21, 30, 6, 6, STONE); }
    else if (v === 2) { tileRoof(r, h, 10, [[10, 37], [8, 39], [7, 40], [6, 41]], roofOf(roof)); r(10, 14, 3, 26, '#6a4a30'); r(35, 14, 3, 26, '#6a4a30'); r(13, 16, 22, 24, '#3a2a1a'); r(13, 16, 22, 2, '#5a4030'); r(23, 16, 2, 24, '#4a3624'); for (const x of [2, 40]) r(x, 22, 6, 18, wall); h(22, 2, 7, roof); h(22, 40, 45, roof); }
    else { tileRoof(r, h, 12, [[6, 41], [4, 43], [2, 45], [1, 46]], roofOf(roof)); r(3, 16, 42, 22, wall); for (let x = 4; x < 44; x += 3) r(x, 26, 1, 12, shade(wall, 0.7)); h(26, 3, 44, shade(wall, 0.6)); r(18, 28, 10, 10, '#2e2620'); r(6, 18, 8, 5, '#c8b890'); r(34, 18, 8, 5, '#c8b890'); }
    r(0, 42, 48, 6, '#b8b2a6');
  },
  view(r, h, v, [roof, wall, acc]) {   // 見どころ：形の番号で、展望台・像・庭と池・大きな木
    if (v === 0) { r(20, 6, 8, 4, wall); h(10, 17, 30, shade(wall, 0.7)); r(21, 11, 6, 26, wall); r(22, 13, 4, 3, '#6f8fa8'); r(22, 20, 4, 3, '#6f8fa8'); r(14, 37, 20, 4, STONE); spanRows(h, 41, [[6, 41], [3, 44], [1, 46], [0, 47], [0, 47], [0, 47], [0, 47]], '#4f8a3a'); }
    else if (v === 1) { r(20, 6, 8, 7, acc); r(18, 13, 12, 14, acc); r(18, 13, 3, 14, shade(acc, 1.3)); r(20, 27, 3, 6, acc); r(25, 27, 3, 6, acc); r(14, 33, 20, 12, STONE); h(33, 14, 33, '#c8c4bc'); }
    else if (v === 2) { spanRows(h, 30, [[8, 39], [4, 43], [2, 45], [2, 45], [4, 43], [8, 39]], '#4f8fbf'); h(31, 10, 20, '#8cc0e0'); for (const [x, y] of [[2, 18], [36, 16], [20, 14]]) { pix(r, PINE, x, y, '#2f6a3a'); h(y, x + 2, x + 4, '#4f8a4a'); r(x + 3, y + 3, 1, 8, '#6a4a30'); } tileRoof(r, h, 18, [[26, 34], [25, 35]], roofOf(roof)); r(26, 20, 9, 6, wall); }
    else { r(6, 4, 36, 26, '#3f7a34'); r(10, 6, 12, 8, '#5a9a44'); r(26, 12, 12, 8, '#5a9a44'); r(21, 28, 6, 16, '#6a4a30'); r(19, 38, 10, 6, '#5a3e28'); r(12, 30, 3, 2, '#e8dcc0'); h(31, 12, 36, '#e8dcc0'); }
  },
  church(r, h, v, [roof, wall, acc]) {   // 教会：とんがり屋根の塔と十字架
    r(21, 2, 2, 7, '#e8e4dc'); r(19, 4, 6, 2, '#e8e4dc'); spanRows(h, 9, [[20, 23], [19, 24], [18, 25], [17, 26]], roof); r(17, 13, 10, 27, wall);
    for (let k = 0; k < 8; k++) h(18 + k, 26 - k, 47, k ? shade(roof, 1.1) : roof); r(27, 26, 18, 14, wall); for (const x of [30, 36, 41]) { r(x, 29, 3, 6, acc); r(x + 1, 28, 1, 1, acc); }
    r(19, 30, 6, 10, '#3a2a1a'); r(20, 18, 4, 5, acc); r(0, 40, 48, 3, '#a2a29f');
  },
};
// 種類（GEN の1つめ）→ 描く型
const GEN_KIND = { s: 'shrine', t: 'temple', e: 'station', c: 'castle', p: 'public', h: 'historic', v: 'view', w: 'church' };
const GEN_BASE = { shrine: ['#5a6068', '#8a6a4a', '#c8382c'], temple: ['#4e535e', '#eeeae0', '#7a5a3c'], station: ['#6a7480', '#e8e6e0', '#2f74b8'], castle: ['#4a4f57', '#f3f1ea', '#9b968a'],
  public: ['#7a7e84', '#d8d4cc', '#5e7f99'], historic: ['#5a6068', '#e8e2d2', '#8a6a4a'], view: ['#5a6068', '#f4f2ec', '#b08850'], church: ['#7a4a3a', '#f0ece4', '#6f8fa8'] };
function genSprite(id) {
  if (genCache.has(id)) return genCache.get(id);
  const g = GEN[id]; if (!g) return null;
  const kind = GEN_KIND[g[0]] || 'historic', base = GEN_BASE[kind], pal = [g[2] || base[0], g[3] || base[1], g[4] || base[2]];
  const sp = hiCanvas((r, h) => GEN_DRAW[kind](r, h, (g[1] | 0) % 4, pal));
  genCache.set(id, sp);
  return sp;
}
// スポットの絵（専用の絵 → 型の絵 → ふつうの絵）
// 代表的な名所の特大のドット絵（96×96。tools/blender/giant.py で作った nishio-go/art/giant/）。歩く地図で名所のまわり6×6マスに描く。
// 読めるまでは、いつもの 48×48 の絵。[ふつう, 再チェックイン待ちの灰色] の canvas にしておく（Godot の記録係は canvas を5つの引数で描く）
const GIANT_ART = { 'f-nishio-castle': 'nishio-castle', 'f-okazaki-castle': 'okazaki-castle', 'f-iwase-bunko': 'iwase-bunko', 'f-konrenji': 'konrenji',
  'f-nishio-station': 'nishio-station', 'f-jofukuji': 'daibutsu', 'f-ohirune-house': 'ohirune', 'f-kurokabe': 'kurokabe', 'f-inariyama-chaen': 'chaen' };
// 当店（らいすぴあ・秀幸）も特大の絵に：運営者が撮った写真から、店・米のドライブスルー・軽トラ・コイン精米所（tools/blender/giant-shop.py）
GIANT_ART['f-ricepia'] = 'ricepia';
GIANT_ART['f-kondo-beikoku'] = 'kondo';   // 近藤米穀店（本店）も：運営者の写真から（クリーム色の店・大きな赤い「米」・看板・緑と青の ひさし）。2つの お店は 128×128 で 細かく
// となりの市町（岡崎・安城・碧南・高浜・幸田・蒲郡）の注目スポット65か所も、1か所ずつ手で形を作った特大の絵（tools/blender/giant-neighbors.py。絵の名前は spots.json の id）
[
  'okazaki-daijuji', 'okazaki-kakukyu', 'okazaki-maruya', 'okazaki-iga-hachimangu', 'okazaki-takisanji', 'okazaki-iwazu-tenmangu',
  'okazaki-rokusho-jinja', 'okazaki-okudono-jinya', 'okazaki-higashi-park', 'okazaki-honda-tei', 'okazaki-minami-park', 'okazaki-museum',
  'okazaki-higashi-okazaki-sta', 'okazaki-okazaki-sta', 'okazaki-shooji', 'okazaki-hozoji', 'okazaki-fujikawa-shuku', 'okazaki-kuragari',
  'okazaki-hongusan', 'anjo-denpark', 'anjo-jozanen', 'anjo-honshoji', 'anjo-castle', 'anjo-museum', 'anjo-horiuchi-park', 'anjo-park',
  'anjo-futago-kofun', 'anjo-himeogawa-kofun', 'anjo-station', 'anjo-mikawa-anjo-station', 'anjo-minami-anjo-station', 'anjo-cityhall',
  'hekinan-aquarium', 'hekinan-rinkai-park', 'hekinan-akashi-park', 'hekinan-shomyoji', 'hekinan-kaitokuji', 'hekinan-kokonoe-mirin',
  'hekinan-fujii-museum', 'hekinan-kumano', 'hekinan-mugaen', 'hekinan-oninji', 'hekinan-station', 'hekinan-chuo-station', 'hekinan-cityhall',
  'takahama-kawara-museum', 'takahama-minato-station', 'takahama-kasuga', 'takahama-oyama', 'takahama-mikawa-takahama-station',
  'takahama-yoshihama-station', 'takahama-cityhall', 'kota-honkoji', 'kota-kyodo-shiryokan', 'kota-bunka-hiroba', 'kota-michinoeki', 'kota-hishiike',
  'kota-happiness-hill', 'kota-townhall', 'kota-station', 'kota-sangane-station', 'kota-aimi-station', 'gamagori-takeshima', 'gamagori-aquarium',
  'gamagori-station',
].forEach(n => { GIANT_ART['f-' + n] = n; });
// 西尾市の注目スポットも、1か所ずつ手で形を作った特大の絵に（tools/blender/giant-nishio.py。絵の名前は spots.json の id）
[
  'konoe-tei', 'shokoso', 'ibun-jinja', 'kozenji', 'kumaku-jinja', 'yatsuomote', 'wakuwaku',
  'jissoji', 'choenji', 'glass-museum', 'yojuji', 'terazu-hachiman', 'michinoeki-okanoyama', 'nishio-cityhall',
  'hirabara-taki', 'kojuin', 'isshiki-sakana', 'isshiki-port', 'isshiki-suwa', 'ankyuji', 'isshiki-manabi',
  'sakushima-nishi', 'sakushima-higashi', 'suunji', 'kamome-parking', 'oura-beach', 'yatsurugi', 'kezoji',
  'kogane-zutsumi', 'tojo-jo', 'gentokuji', 'ozaki-shiro',
  'kira-yoshida', 'shohoji-kofun', 'shio-no-sato', 'kira-onsen', 'kira-waikiki', 'hazu-jinja', 'nishi-hazu',
  'terabe-jo', 'higashi-hazu', 'myozenji', 'kodomonokuni-st', 'aichi-kodomo', 'toba-shinmei', 'antaiji',
  'fukusenji', 'genkuin', 'kasuya-tei', 'kaminagara-shinmei', 'shozanji', 'sairinji', 'tenjiku-jinja',
  'semon-jinja', 'kagakuji', 'ennyuji', 'shorakuji',
  'nishio-shiryokan', 'seiganji', 'ikimono-sato', 'atsuike-hachiman', 'koromozaki', 'benten-salon', 'tombolo',
  'sangane-kannon', 'jomyoji', 'anakobo', 'munosato', 'nakahata-hachiman', 'takakura-jinja', 'toteiyama',
  'saifukuji', 'ebisu-beach', 'terabe-beach',
].forEach(n => { GIANT_ART['f-' + n] = n; });
// のこりの注目スポット（となりの市町）も手で形を作った特大の絵に（tools/blender/giant-osm.py）。
// そこで手で作った OpenStreetMap の名所は、前の型の絵と同じ名前（<id>.png）に上書きしてあるので、下の list.json のまま描く
['hekinan-saihoji', 'hekinan-aoi-park', 'takahama-ningyo-koji'].forEach(n => { GIANT_ART['f-' + n] = n; });
// ほかの名所（約1000か所）は、型で作った特大の絵（tools/blender/giant-gen.py。nishio-go/art/giant/<id>.png、一覧は list.json）
let giantIds = null;
fetch('nishio-go/art/giant/list.json').then(r => (r.ok ? r.json() : null)).then(j => { giantIds = new Set((j && j.ids) || []); dirty = true; }).catch(() => { giantIds = new Set(); });
const giants = {};
// 特大の絵の大きさ（マス）：まわりに特大の絵のスポットがなければ6マス、近くにあれば 4.5マス・3マスに小さくする
// （同じ境内の碑と本堂のように20mほどしか離れていない所で、絵が重なって道や家並みを隠さないように）
let giantSize = null, giantSizeKey = '';
function giantTiles(s) {
  const spots = G.spots || [];
  const ver = (G.spotsVersion || 0) + ':' + spots.length + ':' + (giantIds ? giantIds.size : 0);   // スポットの一覧を入れ替えたら（同じ件数でも）数え直す
  if (!giantSize || giantSizeKey !== ver) {
    giantSizeKey = ver;
    giantSize = new Map();
    const pts = spots.filter(x => GIANT_ART[x.id] || (giantIds && giantIds.has(x.id))).map(x => { const q = toTile(x.lat, x.lng); return [x.id, q.x, q.y]; });
    const cell = new Map(), key = (x, y) => Math.floor(x / 8) + ',' + Math.floor(y / 8);
    for (const p of pts) { const k = key(p[1], p[2]); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(p); }
    for (const p of pts) {
      let d = Infinity;
      const cx = Math.floor(p[1] / 8), cy = Math.floor(p[2] / 8);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) for (const q of cell.get((cx + i) + ',' + (cy + j)) || []) if (q !== p) d = Math.min(d, Math.hypot(q[1] - p[1], q[2] - p[2]));
      giantSize.set(p[0], d >= 6 ? 6 : d >= 4.5 ? 4.5 : 3);
    }
  }
  return giantSize.get(s.id) || 6;
}
// 特大の絵（読めていなければ null）。load が false なら読みはじめない（タップの判定など、画面の外の名所にも使うとき）
// 西尾の四季ドット絵（tools/blender/giant-pr.py → nishio-go/art/pr/）がある名所は、いまの季節（mapSeason）と時間帯（日本時間）の絵にする（いつもの左前の向き）
let prIds = null;
fetch('nishio-go/art/pr/list.json').then(r => (r.ok ? r.json() : null)).then(j => { prIds = new Set(((j && j.items) || []).filter(x => x.views.includes(0)).map(x => x.id)); dirty = true; }).catch(() => { prIds = new Set(); });
const prTime = () => { const hr = new Date(Date.now() + 9 * 3600000).getUTCHours(); return hr >= 5 && hr < 10 ? 0 : hr >= 10 && hr < 16 ? 1 : hr >= 16 && hr < 19 ? 2 : 3; };
function giantOf(s, load = true) {
  if (prIds && prIds.has(s.id)) return giantImg(`../pr/${s.id}/0-${mapSeason()}-${prTime()}`, load);
  const n = GIANT_ART[s.id] || (giantIds && giantIds.has(s.id) ? s.id : null);
  return n ? giantImg(n, load) : null;
}
function giantImg(n, load = true) {   // nishio-go/art/giant/<n>.png を [ふつう, 灰色] の canvas に
  if (!giants[n]) {
    if (!load) return null;
    giants[n] = 'loading';
    const img = new Image();
    img.onload = () => {
      const mk = grey => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        if (grey) { const d = x.getImageData(0, 0, c.width, c.height); for (let i = 0; i < d.data.length; i += 4) { const v = (d.data[i] * 0.3 + d.data[i + 1] * 0.59 + d.data[i + 2] * 0.11) * 0.7 + 60; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; } x.putImageData(d, 0, 0); }
        return c; };
      giants[n] = [mk(false), mk(true)]; dirty = true;
    };
    img.onerror = () => { setTimeout(() => { delete giants[n]; }, 15000); };   // 読めなかったら15秒後に読みなおす
    img.src = `nishio-go/art/giant/${n}.png`;
  }
  return giants[n] === 'loading' ? null : giants[n];
}
// 街の主な建物（学校・病院・交番や警察署・消防署・郵便局・役所・図書館）500か所の特大の絵（tools/blender/giant-poi-list.py・giant-gen.py --poi）。
// 一覧 nishio-go/art/giant/poi.json は [id, 種類, 名前, マスx, マスy]。目印（区画データの p）と、種類と名前が同じで3マス以内のものに描く
const giantPois = new Map();   // '種類|名前' → [[id, x, y], …]
fetch('nishio-go/art/giant/poi.json').then(r => (r.ok ? r.json() : null)).then(j => {
  for (const [id, kind, name, x, y] of (j && j.items) || []) { const k = kind + '|' + name; if (!giantPois.has(k)) giantPois.set(k, []); giantPois.get(k).push([id, x, y]); }
  poiCache.key = ''; dirty = true;
}).catch(() => { /* 特大の絵なしで続ける */ });
function giantPoiOf(p) {   // その目印の特大の絵の id（なければ ''）。目印ごとに覚えておく
  if (p.g === undefined && giantPois.size) {
    const c = (giantPois.get(p[2] + '|' + p[3]) || []).find(q => Math.abs(q[1] - p[0]) < 3 && Math.abs(q[2] - p[1]) < 3);
    p.g = c ? c[0] : '';
  }
  return p.g || '';
}
const spriteOf = s => (!LANDMARK_ART[s.id] && !s.featured && GEN[s.id] && genSprite(s.id)) || spotSprites[spotArt(s)];

function spotArt(s) {
  if (s.id === 'f-ricepia') return 'ricepia';
  if (s.id === 'f-kondo-beikoku') return 'kondo';
  if (LANDMARK_ART[s.id]) return LANDMARK_ART[s.id];
  if (s.shop) return 'ricestore';
  const kind = s.featured ? (s.kind || 'featured') : s.cat;
  if (kind === 'castle') return 'castle';
  if (kind === 'townhall') return 'townhall';
  if (kind === 'station') return 'station';
  if (kind === 'library') return 'library';
  if (kind === 'shrine') return 'torii';
  if (kind === 'temple' || kind === 'worship') return 'temple';
  if (s.featured) return 'town';
  // ふつうの名所は種類ごとの絵（公園は id で4通り）。Blender の絵が読めるまでは たからばこ
  let k = SPOT_KIND[kind] || 'sight';
  if (k === 'park') {   // 毎フレーム呼ばれるので、どの公園の絵かは名所に覚えておく
    if (s.pk === undefined) { let h = 0; for (const ch of s.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; s.pk = h % 4; }
    k = 'park' + s.pk;
  }
  return spotSprites[k] ? k : 'chest';
}
const SPOT_KIND = { park: 'park', historic: 'historic', view: 'view', sight: 'sight', art: 'art', beach: 'beach', museum: 'museum' };
// 特大の絵（96×96）は6マスで描く（ドットの細かさをマスとそろえる）。となりの名所と6マスあかない所は、ふつうの絵にする（小さく縮めて描かない）
const bigOf = (s, load = true) => (giantTiles(s) >= 6 ? giantOf(s, load) : null);
// 名所の絵の大きさ：絵の細かさのまま（特大の絵は6マス・専用の絵は3マス・型の絵は1.5マス）。当店（32×32 の絵）だけは ちょうど2倍の4マスで、遠くからも見つけやすく
// 当店の特大の絵（128×128）は、地図と同じ点の細かさ（1点＝マスの 1/16）で 8×8 マス。ほかの名所の特大の絵（6マス）より大きい。
// 倍にすると 点が地図の1.5〜2倍に粗くなり（細かく作りこんだのが見えない）、12〜16 マスで画面を ほぼ おおってしまう。読めるまでの 48×48 の絵は 倍の 6 マス
const spotSize = (s, spr, T) => dotSize(spr[0], T) * (s.shop && spr[0].width <= 48 ? 2 : 1);

/* ---------- 画面 ---------- */
const view = $('pxView'), cv = $('pxCanvas'), ctx0 = cv.getContext('2d');
// 歩く地図を Godot で描くとき（せってい の試作。nishio-go/godot-field.js）は、描く命令を ctx の代わりの記録係に書いて Godot に渡す
let ctx = ctx0, rec = null;
// ドットの細かさ：ポケモン赤・緑（ゲームボーイの画面 160×144 ドット）と同じに。画面の横に約160ドット（10マス）が入る大きさを、
// 1ドット＝画面の点のちょうど整数こ にして、どのマスも人も建物も同じ大きさのドットで描く。scale は 🔍 の大きさ（2 がポケモンと同じ・1 は半分・3 は1.5倍・4 は2倍）
function fieldT(dpr) {
  const cw = cv.clientWidth || 390, ch = cv.clientHeight || 780;
  return 16 * Math.max(1, Math.round(Math.min(cw / 160, ch / 144) * dpr * curScale() / 2));
}
// 絵を描く大きさ：絵の1点が、マスの1ドットと同じ大きさになるように（16×16 の絵は1マス、24×24 は1.5マス、48×48 は3マス、96×96 は6マス）
const dotSize = (img, T) => img.width * T / 16;
// ポケモン赤・緑（ゲームボーイ）の4色：歩く地図を 白・うす・こい・黒 の4つの色（緑がかったゲームボーイの画面の色）だけで描く。
// せってい「ゲームボーイの4色」で切りかえ（はじめはオフ＝色つき）。絵は はじめて描くときに4色に直してとっておき、塗る色も4色のどれかにする
const GB_COLS = ['#e0f8d0', '#88c070', '#346856', '#081820'];
const GB_RGB = GB_COLS.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));
let gbOn = false;
try { gbOn = localStorage.getItem('nsg_gb') === '1'; } catch (e) { /* 既定 */ }
const gbLum = (r, g, b) => (0.3 * r + 0.59 * g + 0.11 * b) / 255;
const gbAbs = L => (L > 0.62 ? 0 : L > 0.42 ? 1 : L > 0.2 ? 2 : 3);   // 塗る色：明るさで4つに
const gbSpr = L => (L > 0.8 ? 0 : L > 0.55 ? 1 : L > 0.25 ? 2 : 3);    // 人・建物の絵：ポケモンの人のように 顔は白・服や髪は こい色 になるよう、暗めに分ける
const gbCache = new WeakMap();
function gbOf(src) {
  const hit = gbCache.get(src);
  if (hit) return hit;
  const w = src.width, h = src.height;
  if (!w || !h || (src.complete === false)) return src;   // まだ読めていない絵
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.drawImage(src, 0, 0);
  const d = x.getImageData(0, 0, w, h), p = d.data, cnt = new Map();
  let opaque = 0, bg = 0, most = 0;
  for (let i = 0; i < p.length; i += 4) if (p[i + 3] > 128) { const k = p[i] << 16 | p[i + 1] << 8 | p[i + 2], n = (cnt.get(k) || 0) + 1; cnt.set(k, n); opaque++; if (n > most) { most = n; bg = k; } }
  // マスの絵（すきまのない絵）は、いちばん多い色（地面）を ゲームボーイの地面の色に：たいていは白、水はうす、森はこい。ほかの色は地面より暗いか明るいかで決める
  const br = bg >> 16, bgg = bg >> 8 & 255, bb = bg & 255, bgL = gbLum(br, bgg, bb);
  const base = opaque < w * h ? -1 : bb > br + 30 && bb >= bgg ? 1 : bgL >= 0.42 ? 0 : bgL >= 0.25 ? 1 : 2;
  const memo = new Map();
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    const k = p[i] << 16 | p[i + 1] << 8 | p[i + 2];
    let sh = memo.get(k);
    if (sh === undefined) {
      const L = gbLum(p[i], p[i + 1], p[i + 2]), dl = L - bgL;
      sh = L < 0.16 ? 3 : base < 0 ? gbSpr(L) : Math.max(0, Math.min(3, base + (dl < -0.3 ? 2 : dl < -0.07 ? 1 : dl > 0.1 ? -1 : 0)));
      memo.set(k, sh);
    }
    [p[i], p[i + 1], p[i + 2]] = GB_RGB[sh];
  }
  x.putImageData(d, 0, 0);
  gbCache.set(src, c);
  return c;
}
const gbColor = (() => {   // 塗る色（'#xxxxxx'・'rgba(…)' など）→ 4色のどれか（すきとおりはそのまま）
  const memo = new Map(), sc = document.createElement('canvas').getContext('2d');
  return v => {
    let r = memo.get(v);
    if (r) return r;
    sc.fillStyle = '#000'; sc.fillStyle = v;
    const n = sc.fillStyle, m = n.match(/^#(..)(..)(..)$/), a = n.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/);
    const rgb = m ? m.slice(1).map(t => parseInt(t, 16)) : a ? a.slice(1, 4).map(Number) : null;
    if (!rgb) return v;
    const g = GB_RGB[gbAbs(gbLum(...rgb))], al = a && a[4] !== undefined ? +a[4] : 1;
    r = al < 1 ? `rgba(${g.join(',')},${al})` : GB_COLS[GB_RGB.indexOf(g)];
    memo.set(v, r);
    return r;
  };
})();
let gbPause = 0;   // 0 でないあいだは4色にしない（当店の建物と看板は、4色の画面の中で ただ1つ色のまま目立たせる）
{   // 歩く地図の canvas に描く絵と色を、4色に（せかいちずは そのまま）
  const gbField = () => gbOn && !worldMode && !gbPause;
  const draw0 = ctx0.drawImage;
  ctx0.drawImage = function (src, ...a) { return draw0.call(this, gbField() && src.width <= 512 ? gbOf(src) : src, ...a); };
  for (const prop of ['fillStyle', 'strokeStyle']) {
    const pd = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, prop);
    Object.defineProperty(ctx0, prop, { get() { return pd.get.call(this); }, set(v) { pd.set.call(this, gbField() && typeof v === 'string' ? gbColor(v) : v); } });
  }
}
let active = false, raf = 0, dirty = true, scale = 2, mzScale = 1;   // mzScale：めいろの ときの 大きさ（はじめは いちばん小さく：先の 道まで 見える）
const FLOAT_PX = 16;   // 浮かぶ 文字の 大きさ（画面の 点）
let floatPx = 0;   // いちばん 最近 描いた 浮かぶ 文字の 大きさ（テスト用。はばに 入らず 小さく した ときも わかる）
let floatShift = [0, 0];   // 浮かぶ 文字を 縁の 矢印から よけて ずらした はば [横, たて]（テスト用）
const floaters = [], floatDrawn = [];   // 浮かぶ文字 { t, at }。floatDrawn：いまの こまに 描いた 文字（プレイテストで 見る）
const FLOAT_GAP = 1250;   // つづけて 来た 浮かぶ 文字の あいだ（ミリ秒。1つ 1.2秒で 消えるので、前の 文字が 消えてから 次を）
let floatLast = -1e9;   // さいごに 浮かべた（浮かべる）文字の 時刻
let floatQEnd = 0;   // 待っていた 浮かぶ 文字を 順に 出し おわる 時刻（その 前に 来た 文字は この あとに）
// 下の案内パネルが地図に重なっている高さ（CSS px）。主人公は、パネルの上に見えている所のまん中に置く
let cover = 0, fieldCy = 0;
const tapS = { path: [], timer: null, goal: null };   // タップした所へ歩く道すじ（下の tapWalk）
function updateCover() {
  const sh = $('sheet'), cr = cv.getBoundingClientRect(), sr = sh ? sh.getBoundingClientRect() : null;
  cover = sr && sr.height ? Math.max(0, Math.min(cr.height * 0.6, cr.bottom - sr.top)) : 0;
}
if (window.ResizeObserver && $('sheet')) new ResizeObserver(updateCover).observe($('sheet'));
window.addEventListener('resize', updateCover);
// 天気（weather.js：気象庁のアメダス・予報）：雨と雪は画面に降らせ、くもりは少し暗く
// shadeOnly：くもり・雨・雪の暗さだけ描く（Godot で描くとき。雨と雪のつぶは Godot が描く）
function drawWeather(now, w, h, dpr, shadeOnly) {
  const wx = window.NISHIO_WEATHER && window.NISHIO_WEATHER.current;
  if (!wx) return;
  if (wx.kind === 'cloudy') { ctx.fillStyle = 'rgba(40,50,70,.12)'; ctx.fillRect(0, 0, w, h); return; }
  if (wx.kind !== 'rain' && wx.kind !== 'snow') return;
  ctx.fillStyle = 'rgba(30,40,60,.18)'; ctx.fillRect(0, 0, w, h);
  if (shadeOnly) return;
  const n = wx.kind === 'rain' ? 70 : 45, t = now / 1000;
  ctx.save();
  if (wx.kind === 'rain') { ctx.strokeStyle = 'rgba(200,225,255,.55)'; ctx.lineWidth = Math.max(1, dpr); ctx.beginPath(); }
  else ctx.fillStyle = 'rgba(255,255,255,.85)';
  for (let i = 0; i < n; i++) {
    const r1 = ((i * 2654435761) >>> 0) / 4294967296, r2 = ((i * 40503 + 7) % 997) / 997;
    if (wx.kind === 'rain') {
      const x = (r1 * w + t * 60 * dpr) % w, y = (r2 * h + t * 520 * dpr) % h;
      ctx.moveTo(x, y); ctx.lineTo(x - 3 * dpr, y + 10 * dpr);
    } else {
      const y = (r2 * h + t * 40 * dpr) % h, x = (r1 * w + Math.sin(t + i) * 8 * dpr) % w, sz = (1.5 + (i % 3)) * dpr;
      ctx.fillRect(x, y, sz, sz);
    }
  }
  if (wx.kind === 'rain') ctx.stroke();
  ctx.restore();
}
// 奥行き：お米の足もと（footY）が 特大の絵の地面より奥（画面の上）にあって 重なっているときは、その絵を お米の まわりだけ描きなおして かくし、
// かくれた お米は うすく すけて見せる（建物の うしろを通っても 見うしなわない）。前は いつも絵の上に描いていたので、屋根に のっているように見えた
function occludeRice(hx, by, footY, u, again) {
  const r = 17 * u, box = [hx - r, by - r, hx + r, by + r];
  let hid = false;
  for (const [img, x, y, size, gy, shop] of depthArt) {
    if (footY >= gy - u * 4 || box[2] < x || box[0] > x + size || box[3] < y || box[1] > y + size) continue;
    ctx.save(); ctx.beginPath(); ctx.rect(Math.floor(box[0]), Math.floor(box[1]), Math.ceil(2 * r) + 1, Math.ceil(2 * r) + 1); ctx.clip();
    if (shop) gbPause++;
    ctx.drawImage(img, x, y, size, size);
    if (shop) gbPause--;
    ctx.restore();
    hid = true;
  }
  if (!hid) return false;
  ctx.globalAlpha = 0.5; again(); ctx.globalAlpha = 1;
  return true;
}
// お米の 吹き出し（10/29 店主「文字を 廃止して 素朴な 可愛い キャラクターとの 対話を 軸に」。めいろの 中だけ・試作）：
// めいろの 知らせを、お米が 頭の 上の 吹き出しで みじかく しゃべる（6字 くらいまで）。新しい ひと言は 前の ひと言と 入れかわる
const riceBub = { t: '', at: 0, until: 0, log: [] };   // log：しゃべった ことば（試験用。新しい 8つ）
// 言いかたの きまり（10/29 クラウドの「お米つぶの おはなし」・かかしと そろえる）：みじかく、絵文字は 数を あらわす ときだけ（♪＝れんぱつ・💨＝れんぞく）。かざりの 絵文字は つけない
function riceSay(t, ms = 1400, mood = '') {
  const now = performance.now();
  Object.assign(riceBub, { t, at: now, until: now + ms });
  riceBub.log.push(t); if (riceBub.log.length > 8) riceBub.log.shift();
  if (mood === 'happy') roll.happyT = Math.max(roll.happyT, ms / 1000);   // にこにこ顔で しゃべる
  dirty = true;
}
function drawRiceSay(w, cy, T, now, dpr) {   // dpr：画面の 点の こまかさ（frame の 中の 値を もらう）
  if (!riceBub.t || now > riceBub.until) return;
  // 発言は performance.now()、描画は フレーム時刻。重い こまでは 発言の 方が 新しいので、出始めの 大きさを 下回らせない。
  const age = Math.max(0, now - riceBub.at), left = riceBub.until - now, k = calmMotion ? 1 : Math.min(1, 0.6 + age / 300);   // ぽんっと ふくらんで 出る
  const fz = Math.round(FLOAT_PX * dpr * k), pad = Math.round(fz * 0.45), r = Math.round(fz * 0.5), tl = Math.round(fz * 0.45);
  ctx.save(); ctx.globalAlpha = Math.min(1, left / 250);
  ctx.font = `bold ${fz}px "DotGothic16", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const bw = Math.min(w * 0.9, ctx.measureText(riceBub.t).width + pad * 2), bh = fz + pad * 1.4, x = Math.round(w / 2 - bw / 2), y = Math.round(cy - T * 1.2 - tl - bh);
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, bw, bh, r) : ctx.rect(x, y, bw, bh);
  ctx.moveTo(w / 2 - tl * 0.7, y + bh - 1); ctx.lineTo(w / 2, y + bh + tl); ctx.lineTo(w / 2 + tl * 0.7, y + bh - 1);   // しっぽ（お米を さす）
  ctx.fillStyle = '#fffdf3'; ctx.fill(); ctx.lineWidth = Math.max(2, Math.round(dpr * 1.5)); ctx.strokeStyle = '#2a2420'; ctx.stroke();
  ctx.fillStyle = '#fffdf3'; ctx.fillRect(Math.round(w / 2 - tl * 0.7) + 1, y + bh - 3, Math.round(tl * 1.4) - 2, 4);   // しっぽの つけねの 線を けす
  ctx.fillStyle = '#2a2420'; ctx.fillText(riceBub.t, w / 2, y + bh / 2 + 1);
  ctx.restore();
}
function floatText(t) {   // 「ゴール！」の あと 待っていた 文字を 順に 出している 間（floatQEnd まで）に 来た 文字は、列の 最後に（重ねない）
  // つづけて 来た 文字は 前の 文字が 消えてから 出す（字を 大きく したら、同じ 所に 2つ 重なって 読めなかった 2026-10-27）
  const now = performance.now(), at = Math.max(now, floatQEnd, floatLast + FLOAT_GAP);
  if (floatQEnd > now) floatQEnd += 1300;
  floatLast = at;
  floaters.push({ t, at });
  if (floaters.length > 4) {   // 4つ より 多い ときは 古い ものを すて、のこりの 出番を つめなおす（すてた 文字の 出番が のこると 待ちが のびつづけ、いつまでも 出ない）
    floaters.shift();
    let t0 = now;
    for (const f of floaters) { if (f.at <= now) { t0 = Math.max(t0, f.at + FLOAT_GAP); continue; } f.at = Math.max(t0, floatQEnd > now ? f.at : 0); t0 = f.at + FLOAT_GAP; }
    floatLast = t0 - FLOAT_GAP;
  }
}
/* ---------- 町を走る乗り物（Blender の絵：tools/blender/maptiles.py → nishio-go/maptiles/vehicles.png） ----------
   線路には赤い電車（4両）、道には乗用車、ひろい水の上には漁船。見えている所のまわり（画面の外）に出して、マスに沿って走らせる。
   ただの景色なので、主人公や名所とはぶつからない。進む向きは trafficTurn（これまでの向きに近い向き・まっすぐ・その先も続く道を好む）。
   行き止まりでは引き返す。動きをへらす設定（prefers-reduced-motion）のときは出さない */
const VDIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // 0 上・1 右・2 下・3 左
const openWater = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (codeAt(x + dx, y + dy) !== C.A) return false; return true; };
const isRoad = c => c === C.R || c === C.H;
// 踏切：線路のマスは道に上書きされて切れているので、線路のすぐそばの道のマスは電車も通れる（線路のマスを好む）
const railOrCrossing = (x, y) => {
  const c = codeAt(x, y);
  if (c === C.L) return true;
  if (!isRoad(c)) return false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (codeAt(x + dx, y + dy) === C.L) return true;
  return false;
};
const TRAFFIC = {   // ok：走れるマス、home：とくに好むマス、spawn：出してよいマス
  train: { ok: railOrCrossing, home: (x, y) => codeAt(x, y) === C.L, max: 1, speed: 3.2, cars: 4, spawn: (x, y) => codeAt(x, y) === C.L },
  car: { ok: (x, y) => isRoad(codeAt(x, y)), max: 6, speed: 2.2, cars: 1, spawn: () => true },
  boat: { ok: (x, y) => codeAt(x, y) === C.A, max: 3, speed: 0.8, cars: 1, spawn: openWater },
};
const calmMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
let traffic = [], trafficSpawnT = 0;
function trafficTurn(v, x, y) {   // (x, y) に着いたとき、次に進む向き（進めなければ -1）
  // これまで進んできた向きの平均（heading）に近い向きを選ぶ。ななめの線路や道（マスの階段）でも行ったり来たりしない。
  // まっすぐ・その先も続く道を少し好み、ゆらぎ（R）で ときどき曲がる。heading と逆の向きは、ほかに行けないときだけ
  const K = TRAFFIC[v.kind], ok = d => K.ok(x + VDIRS[d][0], y + VDIRS[d][1]);
  const far = d => K.ok(x + VDIRS[d][0] * 2, y + VDIRS[d][1] * 2), home = d => (K.home ? K.home(x + VDIRS[d][0], y + VDIRS[d][1]) : false);
  let hx = VDIRS[v.dir][0], hy = VDIRS[v.dir][1];
  for (const p of v.path.slice(0, 6)) { hx += VDIRS[p.d][0]; hy += VDIRS[p.d][1]; }
  const hl = Math.hypot(hx, hy) || 1, dot = d => (VDIRS[d][0] * hx + VDIRS[d][1] * hy) / hl;
  const back = (v.dir + 2) % 4, R = v.kind === 'train' ? 0.4 : 2;
  let cand = [0, 1, 2, 3].filter(d => d !== back && ok(d));
  if (!cand.length && v.kind !== 'boat') {
    // 1マスはばの線路や道がマスの角でななめにつながっている所（上下左右にはつながっていない）：角のマスを1つ通って、ななめ先へ渡る（電車と車だけ。船は陸を渡らない）。
    // まっすぐの先がふさがっていて左右ななめ前に道があるか、横のマスの前に道があるとき、そのマスへ（次のマスで道に曲がる）
    const at = (d, e) => K.ok(x + VDIRS[d][0] + VDIRS[e][0], y + VDIRS[d][1] + VDIRS[e][1]), sides = [(v.dir + 1) % 4, (v.dir + 3) % 4];
    cand = [v.dir, ...sides].filter(d => !ok(d) && (d === v.dir ? sides.some(e => at(d, e)) : at(d, v.dir)));
  }
  if (cand.some(d => dot(d) >= -0.3)) cand = cand.filter(d => dot(d) >= -0.3);
  if (!cand.length) return ok(back) ? back : -1;
  let best = -1, bs = -Infinity;
  for (const d of cand) {
    const sc = dot(d) + (d === v.dir ? 0.3 : 0) + (far(d) ? 0.4 : 0) + (home(d) ? 1 : 0) + Math.random() * R;
    if (sc > bs) { bs = sc; best = d; }
  }
  return best;
}
function spawnVehicle(kind, x, y) {
  const K = TRAFFIC[kind], ok = K.ok;
  const dirs = [0, 1, 2, 3].filter(d => ok(x + VDIRS[d][0], y + VDIRS[d][1]));
  if (!dirs.length) return;
  // path：いる場所のマスの列（先頭から）。d はそのマスへ入ってきた向き。うしろの車両は、うしろのマスにならべる
  const path = [{ x, y, d: dirs[Math.floor(Math.random() * dirs.length)] }];
  for (let i = 1; i < K.cars + 4; i++) {
    const p = path[i - 1], back = (p.d + 2) % 4;
    const nd = [back, (back + 1) % 4, (back + 3) % 4].find(d => ok(p.x + VDIRS[d][0], p.y + VDIRS[d][1]) && !path.some(q => q.x === p.x + VDIRS[d][0] && q.y === p.y + VDIRS[d][1]));
    if (nd === undefined) { path.push({ ...p }); continue; }
    path.push({ x: p.x + VDIRS[nd][0], y: p.y + VDIRS[nd][1], d: (nd + 2) % 4 });
  }
  traffic.push({ kind, path, dir: path[0].d, t: Math.random(), color: Math.floor(Math.random() * 5) });
}
function updateTraffic(dt, now, tx0, ty0, tx1, ty1) {
  if (calmMotion || !MT.veh) { traffic = []; return; }
  const M = 8;   // 画面の外のふち（このはばの中に出し、もっと外へ出たら消す）
  traffic = traffic.filter(v => {
    v.t += dt * TRAFFIC[v.kind].speed;
    while (v.t >= 1) {
      v.t -= 1;
      const h = v.path[0], x = h.x + VDIRS[v.dir][0], y = h.y + VDIRS[v.dir][1];
      v.path.unshift({ x, y, d: v.dir }); v.path.length = TRAFFIC[v.kind].cars + 4;
      v.dir = trafficTurn(v, x, y);
      if (v.dir < 0) return false;
    }
    const h = v.path[0];
    return h.x > tx0 - M - 4 && h.x < tx1 + M + 4 && h.y > ty0 - M - 4 && h.y < ty1 + M + 4;
  });
  if (now - trafficSpawnT < 400) return;
  trafficSpawnT = now;
  for (const kind of Object.keys(TRAFFIC)) {
    if (traffic.filter(v => v.kind === kind).length >= TRAFFIC[kind].max) continue;
    for (let k = 0; k < 20; k++) {   // 画面の外のふちから、乗り物が走れるマスをさがす
      const x = tx0 - M + Math.floor(Math.random() * (tx1 - tx0 + M * 2)), y = ty0 - M + Math.floor(Math.random() * (ty1 - ty0 + M * 2));
      if (x >= tx0 - 1 && x <= tx1 && y >= ty0 - 1 && y <= ty1) continue;
      if (TRAFFIC[kind].ok(x, y) && TRAFFIC[kind].spawn(x, y)) { spawnVehicle(kind, x, y); break; }
    }
  }
}
function drawTraffic(ox, oy, T, w, h) {
  for (const v of traffic) {
    const n = TRAFFIC[v.kind].cars, seg = j => (j === 0 ? v.dir : v.path[j - 1].d);
    for (let k = n - 1; k >= 0; k--) {
      const p = v.path[k], d = seg(k);
      // 絵の向きは近くの4マスで多い向き（ななめの線路や道の階段で、1マスごとに向きがぱたぱた変わらないように）
      const cnt = [0, 0, 0, 0];
      for (let j = Math.max(0, k - 1); j <= k + 2; j++) cnt[seg(j)]++;
      const face = cnt[d] >= Math.max(...cnt) ? d : cnt.indexOf(Math.max(...cnt));
      const X = Math.round(ox + (p.x + VDIRS[d][0] * v.t) * T), Y = Math.round(oy + (p.y + VDIRS[d][1] * v.t) * T);
      if (X > w || Y > h || X + T < 0 || Y + T < 0) continue;
      const spr = v.kind === 'train' ? MT.veh.train[k === 0 ? 0 : 1] : v.kind === 'car' ? MT.veh.car[v.color] : MT.veh.boat;
      ctx.drawImage(spr[face], X, Y, T, T);
    }
  }
}

let cam = null, last = null, facing = 'down', lastT = 0, lastEnsure = 0;
const camLead = { x: 0, y: 0 };   // 転がしているときに 少し先を見る分（マス）
let heroScr = { x: 0, y: 0 };   // お米の画面での位置（まん中から どれだけ ずれているか。夜の明かり・札に使う）
try { scale = Math.min(4, Math.max(1, +localStorage.getItem('nsg_px_scale') || 2)); mzScale = Math.min(4, Math.max(1, +localStorage.getItem('nsg_mz_scale') || 1)); } catch (e) { /* 既定 */ }

function targetTile() {
  const me = G.me;
  return me ? toTile(me.lat, me.lng) : toTile(G.CFG.center[0], G.CFG.center[1]);
}
function camTile() { return cam || targetTile(); }

function ensureVisible(w, h, T) {
  const c = camTile(), mx = w / T / 2 + 24, my = h / T / 2 + 24;
  for (let cy = Math.floor((c.y - my) / CHUNK); cy <= Math.floor((c.y + my) / CHUNK); cy++)
    for (let cx = Math.floor((c.x - mx) / CHUNK); cx <= Math.floor((c.x + mx) / CHUNK); cx++) ensureChunk(cx, cy);
}

// 1マスを描く（地形の絵・道のつながり・建物の壁・かざり・高さの影・足あと）。歩く地図（frame）と、めいろ（meiro.js の paintRegion）で使う
function drawTile(tx, ty, X, Y, T, f, now) {
  const raw = rawAt(tx, ty), code = raw & 31, sh = raw >> 5;
  let shoreAt = null;
  const v = tileVarAt(code, tx, ty);
  if (code === C.L && MT.rail) {   // 線路は つながる向きの絵（縦・横・ななめ・分かれ道）。1枚にない形は部品を重ねる
    const ri = railIndex(tx, ty);
    if (typeof ri === 'number') ctx.drawImage(MT.rail[ri], X, Y, T, T);
    else { ctx.drawImage(MT.rail[34], X, Y, T, T); for (const p of ri) ctx.drawImage(MT.rail[26 + p], X, Y, T, T); }
  }
  else if (MT.road && ROAD_ROW[code] !== undefined) {   // 道は つながる向きの絵（ふちに縁石・白線・草）。踏切ではレールを重ねる
    const [ri, kado, xr, rankan] = nbrLook(tx, ty, roadLookOf);
    ctx.drawImage(MT.road[ROAD_ROW[code]][ri], X, Y, T, T);
    if (MT.kado) for (const i of kado) ctx.drawImage(MT.kado[ROAD_ROW[code]][i], X, Y, T, T);   // 交差点・曲がり角の内がわの縁石
    if (MT.rail) for (const p of xr) ctx.drawImage(MT.rail[p], X, Y, T, T);
    if (MT.rankan) for (const i of rankan) ctx.drawImage(MT.rankan[i], X, Y, T, T);   // 水と接する辺に橋の欄干
  }
  else if (code === C.A && MT.shore && (shoreAt = nbrLook(tx, ty, shoreIndex))) ctx.drawImage(MT.shore[shoreAt[0]][shoreAt[1] + f], X, Y, T, T);   // 岸は 護岸・土手・浜の絵
  else ctx.drawImage(tiles[code][v % tiles[code].length][tileFrame(code, f, tx, ty, now)], X, Y, T, T);
  if (code === C.E && kabuseOn()) drawKabuse(tx, ty, X, Y, T);   // 春の てん茶の 覆い（かざり〈茶つみの 人 など〉より 先に。人は 覆いの 上に 見える）
  if (code === C.B) drawWall(tx, ty, X, Y, T);
  else drawDeco(code, tx, ty, X, Y, T, now);
  if (code === C.E && chaHanaOn()) drawChaHana(tx, ty, X, Y, T);   // 秋の 茶の花
  if (sh !== 2 && !gbOn) { ctx.fillStyle = SHADE[sh]; ctx.fillRect(X, Y, T, T); }   // 土地の高さの影（ゲームボーイの4色では つけない）
  if (TRAIL.map.size && trailHas(tx, ty)) drawFoot(code, tx, ty, X, Y, T);   // 歩いた道の足あと
  if (code === C.R && !regionPaint && alleyHint(tx, ty)) drawAlleyHint(X, Y, T, now);   // まだ しらべていない 路地の行き止まり（めいろの 盤には 描かない）
  if (code === C.H) {          // 大きな道（国道・県道）：外側に白線、2車線の真ん中に黄色の破線
    const u = Math.max(1, Math.round(T / 16)), road = c => c === C.H || c === C.R || c === C.D;
    const up = codeAt(tx, ty - 1), dn = codeAt(tx, ty + 1), lf = codeAt(tx - 1, ty), rt = codeAt(tx + 1, ty);
    ctx.fillStyle = '#f4f4f0';
    if (!MT.road) {   // 白線は road.png に描いてある（読めるまでは ここで描く）
      if (!road(up)) ctx.fillRect(X, Y + u, T, u);
      if (!road(dn)) ctx.fillRect(X, Y + T - 2 * u, T, u);
      if (!road(lf)) ctx.fillRect(X + u, Y, u, T);
      if (!road(rt)) ctx.fillRect(X + T - 2 * u, Y, u, T);
    }
    // 黄色の線は、道の縁が同じ向きに3マス以上続くところだけ（2マス幅の道の端や、ななめの道の段差に横向きの線を引かない）
    ctx.fillStyle = '#f2c230';
    if (!road(up) && dn === C.H && hEdgeRun(tx, ty, 1, 0, road) >= 3) { ctx.fillRect(X + u * 2, Y + T - u, u * 4, u); ctx.fillRect(X + u * 10, Y + T - u, u * 4, u); }
    if (!road(lf) && rt === C.H && hEdgeRun(tx, ty, 0, 1, road) >= 3) { ctx.fillRect(X + T - u, Y + u * 2, u, u * 4); ctx.fillRect(X + T - u, Y + u * 10, u, u * 4); }
  }
  if (code === C.A && !shoreAt) {          // 岸に白い波打ち際（水べの絵が読めるまで）
    const u = Math.max(1, Math.round(T / 16)), land = c => c !== C.A && c !== C.X;
    ctx.fillStyle = f ? '#e8f2ff' : '#cfe2ff';
    if (land(codeAt(tx, ty - 1))) ctx.fillRect(X, Y, T, u);
    if (land(codeAt(tx, ty + 1))) ctx.fillRect(X, Y + T - u, T, u);
    if (land(codeAt(tx - 1, ty))) ctx.fillRect(X, Y, u, T);
    if (land(codeAt(tx + 1, ty))) ctx.fillRect(X + T - u, Y, u, T);
  }
}
// めいろ（meiro.js）の盤：マス (tx0, ty0) から tw×th マスを、dst に 1マス T 点で描く（夜・天気・人は描かない）
let regionPaint = false;   // paintRegion（めいろの 盤）を 描いている あいだ
function paintRegion(dst, tx0, ty0, tw, th, T) {
  const keep = ctx, now = performance.now();
  ctx = dst; regionPaint = true;
  try {
    ctx.imageSmoothingEnabled = false;
    for (let ty = ty0; ty < ty0 + th; ty++) for (let tx = tx0; tx < tx0 + tw; tx++) drawTile(tx, ty, (tx - tx0) * T, (ty - ty0) * T, T, 0, now);
    drawWaterCorners(tx0, ty0, tx0 + tw, ty0 + th, -tx0 * T, -ty0 * T, T, 0);
    drawContours(tx0, ty0, tx0 + tw, ty0 + th, -tx0 * T, -ty0 * T, T);   // 本当の高低差の 等高線（標高が 読めていれば）
  } finally { ctx = keep; regionPaint = false; }
}
// 運営者の声「スタートを簡単に」：あそびかたは せっていから 開く。開始を 確認の 札で 止めない。
const howtoEl = $('howto');
function howtoShow() {
  const k = $('howtoKey'), pc = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (k) k.textContent = pc ? 'パソコンは 矢印キー。地図を クリックした所へも 向かう' : '傾けにくい ときは、地図を タップした所へ 向かう';
  if (G.toastHold) G.toastHold();   // いま 出ている 知らせは 下げて、とじてから（札の 見出しに 重なっていた）
  howtoEl.hidden = false; rp.vx = rp.vy = 0;
  try { localStorage.setItem('nsg_howto', '1'); } catch (e) { /* noop */ }
  setTimeout(() => { const b = $('howtoOk'); if (b && !howtoEl.hidden) b.focus(); }, 50);
}
$('howtoOk').addEventListener('click', () => { howtoEl.hidden = true; tiltReset(); dirty = true; if (G.toastFlush) G.toastFlush(); });   // いまの 持ち方を「まっすぐ」に して はじめる
$('howtoOpen').addEventListener('click', howtoShow);
let meiroPause = false;   // めいろ（meiro.js）を遊んでいるあいだは、うしろの 歩く地図を 止める（お米も 動かない）
function frame(now) {
  if (!active) return;
  raf = requestAnimationFrame(frame);
  if (meiroPause) { lastT = 0; return; }
  mzNextHoldTick();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
  if (!w || !h) return;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; dirty = true; }
  shopHits = [];
  giantHits = [];
  poiHits = [];
  depthArt.length = 0;
  refreshSeason(now);
  trailLoad();   // あしあとの記録（あるいて移動／操作して移動・版で別）
  if (rec) { rec.end(); rec = null; ctx = ctx0; }
  if (worldMode) { if (window.NSG_GODOT) NSG_GODOT.idle(); drawWorld(now, w, h, dpr); return; }
  rec = window.NSG_GODOT && NSG_GODOT.on() ? NSG_GODOT.rec : null;   // Godot で描く：ここから frame の終わりまで、描く命令を記録する
  if (rec) { ctx = rec; rec.begin(w, h); }
  const T = fieldT(dpr);
  const dt = Math.min(0.1, (now - (lastT || now)) / 1000);
  koro = window.NISHIO_KOROSTYLE ? window.NISHIO_KOROSTYLE.current() : null; KP = koro ? koro.motion.p : {};   // いまの転がり方
  lastT = now;

  // カメラ（＝主人公）を目標へなめらかに動かす。向きは移動方向から
  const tgt = targetTile();
  if (last && (Math.abs(tgt.x - last.x) > 0.05 || Math.abs(tgt.y - last.y) > 0.05)) {
    const dx = tgt.x - last.x, dy = tgt.y - last.y;
    facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }
  last = tgt;
  if (G.demo && rollOn && !driving) {   // かたむけて転がす（勢い・はね返り）。1/120秒ずつ くり返して計算する（おそい スマホ・速い画面でも 同じ転がり方に）
    if (howtoEl.hidden && performance.now() >= mzHitStop) for (let rem = dt; rem > 1e-4;) { const h = Math.min(rem, 1 / 120); rollStep(h); rem -= h; if (rp.x !== null && mazeOn()) mzMvStep(mzMv, Math.floor(rp.x / MZ_K), Math.floor(rp.y / MZ_K), performance.now()); }   // 「まよわず ゴール」の 歩数は 転がる 1/120秒ごとに（こまの 間に 2つの さかいを こえても 1つずつ）   // あそびかたを 読んでいる 間は 転がさない（地図は 描く）
    if (mazeOn()) { mzSpotUpdate(now); mzSnap(now); mzRoute(now); mzHintTick(now); mzTrailTick(); mzDeadTick(); mzGrainTick(); mzDotTick(); mzPebTick(); mzMichikusa(now); mzClock(now); mzCrowTick(now); mzSpringTick(now); mzArriveTick(now); }
  }
  waterWatch(tgt, dt);
  if (!cam || Math.hypot(tgt.x - cam.x, tgt.y - cam.y) > 40) cam = { ...tgt };
  else { const k = Math.min(1, dt * (G.demo && rollOn ? 14 : 6)); cam.x += (tgt.x - cam.x) * k; cam.y += (tgt.y - cam.y) * k; }
  const rolling = rollOn && G.demo && rp.x !== null && !driving;
  if (rolling) {   // 転がしているときは、お米の少し先を見る（進む向きが よく見えて、速さも感じられる）
    const k = Math.min(1, dt * 2.5);
    camLead.x += (Math.max(-1.1, Math.min(1.1, rp.vx * 0.2)) - camLead.x) * k; camLead.y += (Math.max(-1.1, Math.min(1.1, rp.vy * 0.2)) - camLead.y) * k;
    cam.x = rp.x + camLead.x; cam.y = rp.y + camLead.y;
  } else camLead.x = camLead.y = 0;
  const hp = rolling ? { x: rp.x, y: rp.y } : { x: cam.x, y: cam.y };   // お米のいる所（転がす：rp・ほかは 画面のまん中）
  if (roll.last) { const ddx = hp.x - roll.last.x, ddy = hp.y - roll.last.y, d = Math.hypot(ddx, ddy); if (d < 3) roll.d += d; riceSpin(ddx, ddy, dt); }
  // 転がった道のりで 転がり方を もらう：画面の まん中（cam）では なく、行き先（tgt・転がす ときは rp）の 動きで 数える。ひとっとび（名所の「ここへ」など）の あと
  //   cam が なめらかに 追いつく ぶんまで 道のりに 入って いて、しかも こまが おそいと 入る 量が へった（25マス とぶと 25マス・CPU 4倍 おそいと 16マス。転がり方が かわる 時が 端末で ずれた）
  const kp = rolling ? hp : tgt;
  if (roll.lastK) { const d = Math.hypot(kp.x - roll.lastK.x, kp.y - roll.lastK.y); if (d < 3 && window.NISHIO_KOROSTYLE) window.NISHIO_KOROSTYLE.addDist(d); }
  roll.lastK = { x: kp.x, y: kp.y };
  roll.last = hp;
  roll.trail.push({ x: hp.x, y: hp.y, th: roll.ang }); if (roll.trail.length > 8) roll.trail.shift();   // のこりかげ用

  if (now - lastEnsure > 500) { lastEnsure = now; ensureVisible(w, h, T); snapDemoStart(); updateChests(); checkCar(); sightCheck(); updateCover(); loadTowns(); updateHere(); updateHarvestBtn(); updateDankyuBtn(); updateHiryoBtn(); }

  const f = Math.floor(now / 450) % 2;
  ctx.imageSmoothingEnabled = false;
  const vh = h - Math.round(cover * dpr), cy = Math.round(vh / 2);   // 見えている所の高さと、そのまん中
  fieldCy = cy;
  const shk = roll.shake > 0 ? Math.round(Math.sin(now / 18) * roll.shake * T * 0.12) : 0;   // かべに当たったときの ゆれ
  const ox = Math.round(w / 2 - cam.x * T) + shk, oy = Math.round(cy - cam.y * T);
  const tx0 = Math.floor(-ox / T), ty0 = Math.floor(-oy / T), tx1 = Math.ceil((w - ox) / T), ty1 = Math.ceil((h - oy) / T);
  for (let ty = ty0; ty < ty1; ty++) for (let tx = tx0; tx < tx1; tx++) drawTile(tx, ty, ox + tx * T, oy + ty * T, T, f, now);

  drawWaterCorners(tx0, ty0, tx1, ty1, ox, oy, T, f);   // 角だけで接する水路をつなぐ
  if (!gbOn) drawContours(tx0, ty0, tx1, ty1, ox, oy, T);   // 本当の高低差（国土地理院の標高）の等高線
  if (mazeOn()) { drawMzFog(tx0, ty0, tx1, ty1, ox, oy, T, now); drawMzPebs(tx0, ty0, tx1, ty1, ox, oy, T); drawMzTrail(tx0, ty0, tx1, ty1, ox, oy, T); drawMaze(tx0, ty0, tx1, ty1, ox, oy, T); drawMzGates(tx0, ty0, tx1, ty1, ox, oy, T, now); drawMzPads(tx0, ty0, tx1, ty1, ox, oy, T, now); drawMzGrains(tx0, ty0, tx1, ty1, ox, oy, T, now); if (mzHelpOn()) drawMzDeadEnds(tx0, ty0, tx1, ty1, ox, oy, T); else mzHelp.dead = 0; drawMzHint(ox, oy, T, now); drawMzDots(tx0, ty0, tx1, ty1, ox, oy, T, now); drawMzCrows(ox, oy, T, now); drawMzSpring(ox, oy, T, now); drawMzCritters(tx0, ty0, tx1, ty1, ox, oy, T, now); }   // 転がす ときは 地図が めいろ（と 道しるべ）
  updateTraffic(dt, now, tx0, ty0, tx1, ty1);   // 町を走る電車・車・船
  drawTraffic(ox, oy, T, w, h);

  // 主要な建物（同じ場所にスポットがあるときはスポットを優先）
  const spots = G.spots;
  const pois = visiblePois(tx0, ty0, tx1, ty1), labelBoxes = [];
  for (const p of pois) {
    const gid = giantPoiOf(p), giant = gid ? giantImg(gid) : null;   // 街の主な建物は特大の絵（読めるまではいつもの絵）
    const img = (giant || spotSprites[p[2]] || spotSprites.shop)[0], size = dotSize(img, T), sx = Math.round(ox + p[0] * T - size / 2), sy = Math.round(oy + p[1] * T - size * (giant ? 0.72 : 0.7));
    ctx.drawImage(img, sx, sy, size, size);
    if (giant) { poiHits.push([sx, sy, size, p, giant[0]]); depthArt.push([img, sx, sy, size, sy + size * 0.72, false]); }   // タップは絵のある所（透明でない点）で決める
  }
  const me = G.me;
  let nearest = null, nearestD = Infinity;
  for (const s of spots) {
    const p = toTile(s.lat, s.lng);
    const near = ox + p.x * T > -T * 4 && ox + p.x * T < w + T * 4 && oy + p.y * T > -T * 2 && oy + p.y * T < h + T * 5;   // 画面に入るかもしれない名所だけ、特大の絵を読む
    const giant = near ? bigOf(s) : null;
    const spr = giant || spriteOf(s);
    const size = spotSize(s, spr, T);
    const sx = ox + p.x * T - size / 2, sy = oy + p.y * T - size * (giant ? 0.72 : 0.5);   // 特大の絵は、地面が名所の場所にくるように上へずらす
    const cool = G.cooldownLeft(s) > 0;
    if (me && !cool) { const d = G.dist(me, s); if (d < nearestD) { nearest = s; nearestD = d; } }
    if (sx > w || sy > h || sx + size < 0 || sy + size < 0) continue;
    if (s.shop) gbPause++;
    ctx.drawImage(spr[cool ? 1 : 0], Math.round(sx), Math.round(sy), size, size);
    if (s.shop) gbPause--;
    if (giant) { giantHits.push([sx, sy, size, s, giant[0]]); depthArt.push([spr[cool ? 1 : 0], Math.round(sx), Math.round(sy), size, sy + size * 0.72, !!s.shop]); }   // タップは、描いた順の逆（手前の絵から）に調べる
    if (s.featured && !cool && f) {   // 注目スポットはきらきら
      ctx.fillStyle = '#fff59d';
      const u = Math.min(size, 3 * T) / 16, kx = sx + size * 13 / 16, ky = sy + size / 16;   // 大きさは いつもの絵（3マス）まで。特大の絵の大きさに合わせると 1マスより大きな 十字になっていた
      ctx.fillRect(Math.round(kx), Math.round(ky), Math.ceil(u), Math.ceil(u * 3));
      ctx.fillRect(Math.round(kx - u), Math.round(ky + u), Math.ceil(u * 3), Math.ceil(u));
    }
    if (s.shop) { const t = drawShopTag(sx + size / 2, sy, dpr, s); shopHits.push([Math.min(t[0], sx), t[1], Math.max(t[2], sx + size), sy + size, s]); }
  }
  // 西尾の人たち（まだ話していない人の上には吹き出し）。呼びとめた人は、歩いてくる途中の位置に（歩く間は足を速く動かす）
  const sp = sightTick(now);
  for (const n of G.npcs || []) {
    const t = sp && sight.n === n ? sp : npcTile(n), sx = Math.round(ox + t.x * T), sy = Math.round(oy + t.y * T - T * 0.25);
    if (sx > w || sy > h || sx + T < 0 || sy + T < 0) continue;
    ctx.drawImage((npcSprites[n.look] || npcSprites.man)[sp && sp.walking && sight.n === n ? Math.floor(now / 120) % 2 : f], sx, sy, T, T);
    const em = npcEmotes.get(n.id), age = em ? performance.now() - em.t : 1e9;
    if (age < 1600) emoteAt(sx, sy, T, em.k, age);   // 気持ちの吹き出し
    else if (em) npcEmotes.delete(n.id);
    else if (!G.npcMet(n.id)) {   // 💬（白い吹き出し）
      const u = Math.max(1, Math.round(T / 16)), bx = sx + Math.round(T * 0.55), by = sy - Math.round(T * 0.45) - (f ? u : 0);
      ctx.fillStyle = '#000'; ctx.fillRect(bx - u, by - u, 9 * u, 6 * u);
      ctx.fillStyle = '#fff'; ctx.fillRect(bx, by, 7 * u, 4 * u); ctx.fillRect(bx + u, by + 4 * u, 2 * u, 2 * u);
      ctx.fillStyle = '#000'; ctx.fillRect(bx + u, by + 2 * u, u, u); ctx.fillRect(bx + 3 * u, by + 2 * u, u, u); ctx.fillRect(bx + 5 * u, by + 2 * u, u, u);
    }
  }
  // 出会った生きもの（3秒。ぴょこぴょこ動く）
  if (critterS.show) {
    const c = critterS.show, age = now - c.t;
    if (age > 3000) critterS.show = null;
    else {
      const hop = Math.floor(age / 250) % 2 ? Math.round(T / 16) : 0;
      ctx.drawImage(critterSprites[c.id], Math.round(ox + c.x * T), Math.round(oy + c.y * T) - hop, T, T);
      dirty = true;
    }
  }
  suzumeStep(now, ox, oy, T, w, h, dpr);   // 田んぼや 草地の すずめ
  nekoStep(now, ox, oy, T, w, h, dpr);   // 道ばたで ひるねする ねこ
  mushiStep(now, ox, oy, T, w, h, dpr);   // 季節の 小さな 虫（赤とんぼ・ちょうちょ）
  kaeruStep(now, ox, oy, T, w, h, dpr);   // 田んぼの あぜの カエル
  nakamaStep(now, ox, oy, T, w, h, dpr);   // 農作物も ころころ（いちご・なす・大豆）
  hamonStep(now, ox, oy, T, w, h, dpr);   // 水べの さざなみ
  sentakuStep(now, ox, oy, T, w, h, dpr);   // 物干しの せんたくもの
  donguriStep(now, ox, oy, T, w, h, dpr);   // どんぐりも ころころ
  deaiStep(now, ox, oy, T);   // 水べで 出会う 西尾の 生きもの（deai.js）
  koboreStep(now, ox, oy, T, dpr);   // 転がりながら こぼす 西尾の 名物（kobore.js）
  // 先回りしたライバル
  const rt = rivalTile();
  if (rt && rt.ok) {
    const sx = Math.round(ox + rt.x * T), sy = Math.round(oy + rt.y * T - T * 0.25);
    if (sx < w && sy < h && sx + T > 0 && sy + T > 0) ctx.drawImage(rivalSprites[f], sx, sy, T, T);
  }
  // 道ばたのたからばこ（開けたものは出さない）。ぴょんと跳ねて目立たせる
  for (const c of G.liveChests()) {
    const p = toTile(c.lat, c.lng), hop = f ? Math.round(T / 8) : 0, sh = c.at ? T * 0.9 : 0;   // スポットに置いたものは右上にずらす
    const sx = Math.round(ox + p.x * T - T / 2 + sh), sy = Math.round(oy + p.y * T - T / 2 - sh) - hop;
    if (sx > w || sy > h || sx + T < 0 || sy + T < 0) continue;
    ctx.drawImage(spotSprites.treasure[0], sx, sy, T, T);
  }
  // 目標スポットのチェックイン範囲（点線の円）
  const target = G.selected || nearest;
  if (target) {
    const p = toTile(target.lat, target.lng), r = G.reachOf(target) / TILE_M * T;
    const cxp = ox + p.x * T, cyp = oy + p.y * T, dot = Math.max(2, Math.round(T / 8));
    ctx.fillStyle = target.featured ? '#ffd54f' : '#ffffff';
    const n = Math.max(16, Math.round(2 * Math.PI * r / (dot * 1.6)));   // 点を詰めて円に見えるように
    for (let i = 0; i < n; i++) { if ((i + f) % 3 === 0) continue; const a = i / n * Math.PI * 2; ctx.fillRect(Math.round(cxp + Math.cos(a) * r), Math.round(cyp + Math.sin(a) * r), dot, dot); }
  }

  // タップした行き先の印（点滅する四角）
  if (tapS.goal && f) {
    ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = Math.max(2, Math.round(T / 8));
    ctx.strokeRect(Math.round(ox + (tapS.goal[0] + 0.15) * T), Math.round(oy + (tapS.goal[1] + 0.15) * T), Math.round(T * 0.7), Math.round(T * 0.7));
  }

  // 主人公（車に乗っているときは車）
  if (driving) ctx.drawImage(carSprites[facing], Math.round(w / 2 - T / 2), Math.round(cy - T / 2), T, T);
  else if ((me || G.demo) && riceSprites.ready) {   // お米（影をつけて、転がった道のりで回す）
    const img = riceSprites.right[0], sz = dotSize(img, T), u = sz / 32;
    let hx = ox + roll.last.x * T, hcy = oy + roll.last.y * T;   // お米の画面での位置（転がしているときは 少し まん中から ずれる）
    if (KP.wobble && roll.v > 0.5) hx += Math.sin(roll.d * 2.4) * KP.wobble * T * Math.min(1, roll.v / 2);   // くねくね
    if (KP.shake && roll.v > 0.5) { hx += Math.round((Math.random() - 0.5) * u * 1.6 * KP.shake); hcy += Math.round((Math.random() - 0.5) * u * 1.2 * KP.shake); }   // ぶるぶる
    heroScr = { x: hx - w / 2 - shk, y: hcy - cy };
    const A = 10 * u, B = 13.5 * u, th = roll.ang;   // つぶの よこ・たての半分（絵の点で）。寝ころぶほど まん中が下がる
    const low = Math.sqrt((A * Math.sin(th)) ** 2 + (B * riceTall(roll.pitch) * Math.cos(th)) ** 2), ground = hcy + T * 0.4 - sz / 2 + B, hop = roll.h * T, mid = ground - low - hop;
    for (const p of roll.dust) {   // 土ぼこり（うしろに ふわっと。地面の色。葉っぱ・しぶきは はねて落ちる）
      const a = 1 - p.t / 0.45, r = Math.max(1, Math.round(T * (p.bit ? 0.07 : 0.12) * p.s * (1 + (p.bit ? 0 : p.t * 2))));
      const up = p.bit ? (p.t * 2.2 - p.t * p.t * 9) * T : p.t * T * 0.4;
      ctx.fillStyle = `rgba(${p.c || '235,228,205'},${((p.bit ? 0.9 : 0.55) * a).toFixed(2)})`;
      ctx.fillRect(Math.round(ox + (p.x + (p.vx || 0) * p.t) * T - r), Math.round(oy + p.y * T + T * 0.3 - r - up), r * 2, r * 2);
    }
    {   // 影：つぶの いまの はば（寝ころぶと広い）に合わせた、まるい点の だ円。とぶと小さく
      const wv = Math.sqrt((A * Math.cos(th)) ** 2 + (B * Math.sin(th)) ** 2), shw = wv * 1.8 / (1 + roll.h * 3), q = Math.max(1, Math.round(u)), sy0 = Math.round(hcy + T * 0.3);
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      if (gbOn && !worldMode) {   // ゲームボーイの4色は 点の だ円の まま
        ctx.fillRect(Math.round(hx - shw * 0.36), sy0 - q, Math.round(shw * 0.72), q);
        ctx.fillRect(Math.round(hx - shw / 2), sy0, Math.round(shw), 2 * q);
        ctx.fillRect(Math.round(hx - shw * 0.36), sy0 + 2 * q, Math.round(shw * 0.72), q);
      } else { ctx.beginPath(); ctx.ellipse(hx, hcy + T * 0.3 + u, shw / 2, 2 * u, 0, 0, Math.PI * 2); ctx.fill(); }   // お米と いっしょに なめらかに（点より 細かく 動く。整数に 丸めると 影だけ カクッと 動いた）
      kageDraw(hx, hcy + T * 0.3 + u, shw, u, now, roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2);   // じっと すると 名物の 影が のびる（kage.js）
    }
    const sq = roll.sq;
    let sx = roll.sqx ? 1 - sq : 1 + sq, sy = roll.sqx ? 1 + sq * 0.6 : 1 - sq;   // ぺたっと つぶれて ぷるんと もどる
    let br = 0;   // 息の ふくらみ（札が よける お米の はんいには 入れない。はんいが こまごとに ゆれると、ぎりぎりに よけた 札が お米に かかった）
    if (roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2 && !calmMotion) { br = riceBreath(now); sy *= 1 + br; sx *= 1 - br * 0.5; }
    if ((roll.prevIdle || 0) > 12 && roll.idle < roll.prevIdle && !calmMotion) roll.wakeT = now;   // ねむって いた お米が おきた
    roll.prevIdle = roll.idle;
    { const ws = riceWake(now - (roll.wakeT || -1e9)); if (ws) { sy *= 1 + ws; sx *= 1 - ws * 0.5; } }   // おきたら「のびー」と 0.6秒 たてに のびる（赤ちゃんの ような かわいさ）   // 止まっている 間は すう すう 息を する（赤ちゃんの ような かわいさ。足もとは 地面の まま）
    { const mc = gochisoMunch(now); if (mc) { sy *= 1 - mc; sx *= 1 + mc * 0.5; } }   // 名物食を もぐもぐ（gochiso.js）
    const tr = roll.trail, t0 = tr[tr.length - 3], t1 = tr[tr.length - 1];
    if (roll.h > 0) { const st = Math.min(0.12, Math.abs(roll.hv) * 0.035); sy *= 1 + st; sx *= 1 - st * 0.5; }   // とんでいる：たてに のびる
    else if (t0 && t1 && roll.v > 2) {   // 速いと、進む向きに 少し のびる
      const st = Math.min(0.09 * (KP.stretch || 1), (roll.v - 2) * 0.025 * (KP.stretch || 1)), horiz = Math.abs(t1.x - t0.x) >= Math.abs(t1.y - t0.y);
      if (horiz) { sx *= 1 + st; sy *= 1 - st * 0.5; } else { sy *= 1 + st; sx *= 1 - st * 0.5; }
    }
    const by = sy !== 1 ? ground - low * sy - hop : mid;
    roll.by = by;   // テスト用（お米の まん中の 高さ。息で かわる）
    const mood = roll.drawn = riceMood(now);
    const sy0 = sy / (1 + br), byB = sy0 !== 1 ? ground - low * sy0 - hop : mid;
    roll.box = [hx - 13 * u, byB - 15 * u, hx + 13 * u, byB + 9 * u];   // お米の 描く はんい（町名の 札が よける。テスト用にも）
    drawKoroTrail(ox, oy, T, u);   // 転がり方の かざり（お米の うしろ）
    if (riceBall.cv && (roll.v > 3.4 || (KP.ghost && roll.v > 0.8))) {   // のこりかげ：速いと、うしろに うすい お米が2つ（ロケットは いつも）
      for (const [k, al] of [[6, 0.14], [3, 0.26]]) {
        const p = roll.trail[roll.trail.length - 1 - k];
        if (!p) continue;
        ctx.globalAlpha = al; riceLowQ = true;
        try { drawRiceBall(ox + p.x * T, by + (oy + p.y * T - hcy), u, p.th % (Math.PI * 2), sx, sy, roll.spin, ctx, gbOn && !worldMode, null, 0, 0, '', roll.pitch); }
        finally { ctx.globalAlpha = 1; riceLowQ = false; }   // とちゅうで 止まっても、本体の お米まで あらく 描かない
      }
    }
    if (rollOn && rp.x !== null) drawSpeedLines(hx, by, u, now);   // とても 速い（びゅんパネル・下り坂）：うしろに スピード線
    tsutsumiStep(hx, by, u, now);   // 吉良の 田んぼで じっと すると 黄金堤を 築く（tsutsumi.js）
    chochinyoruStep(hx, by, u, now);   // 夜の 一色の 町なかで じっと すると 提灯の あかり（大提灯・提灯の れつ。chochinyoru.js。いっしきさんぽ・めぐりに 先んじる）
    isshikiStep(hx, by, u, now);   // 一色の 町なかで じっと すると 港町の ひとこま（えびせん焼き・うなぎ・養鰻・さかな広場。isshiki.js）
    shimatabiStep(hx, by, u, now);   // 佐久島で じっと すると 島の ひとこま（アート・黒壁・高速船。shimatabi.js）
    yuamiStep(hx, by, u, now);   // 吉良で じっと すると 温泉・ビーチに つかる（yuami.js）
    horidashiStep(hx, by, u, now);   // 一色・幡豆の 海べで じっと すると 砂を ほって 貝を ほり当てる（horidashi.js）
    hazusanpoStep(hx, by, u, now);   // 幡豆の 町なかで じっと すると 山と 花の ひとこま（三ヶ根山・スカイライン・カーネーション・あじさい・ひまわり。hazusanpo.js）
    tomboloStep(hx, by, u, now);   // トンボロ干潟の そばで じっと すると 干潟の ひとこま（満ち引き・海の道・干潟の 生きもの。tombolo.js。ほりだし・はずさんぽに 先んじる）
    jokamachiStep(hx, by, u, now);   // 西尾城の あとの そばで じっと すると 城下町の ひとこま（丑寅櫓・鍮石門・祇園祭など。jokamachi.js。ちゃせきに 先んじる）
    mangekyoStep(hx, by, u, now);   // 三河工芸ガラス美術館の そばで じっと すると ガラス工芸の ひとこま（美術館・巨大万華鏡・のぞく。mangekyo.js。ちゃせきに 先んじる）
    chatsumiStep(hx, by, u, now);   // 稲荷山茶園公園の そばで じっと すると 茶畑の ひとこま（茶摘み・てん茶・川霧。chatsumi.js。ちゃせきに 先んじる）
    kawabeStep(hx, by, u, now);   // 川・池・用水の そばで じっと すると 水べの ひとこま（矢作川・メダカ・アカザ・ミサゴ・ニホンイシガメ。kawabe.js。ちゃせきに 先んじる）
    chasetsuStep(hx, by, u, now);   // 西尾地区で じっと すると 石臼で ひいて 抹茶を 点てる（chasetsu.js）
    nedokoStep(hx, by, u, now, mood === 'sleepy');   // ねむって いる あいだ、名物の ねどこを お米の 下に しく（nedoko.js）
    if (riceBall.cv) {
      drawRiceBall(hx, by, u, th % (Math.PI * 2), sx, sy, roll.spin, ctx, gbOn && !worldMode, mood, roll.look, roll.dirt, roll.dirtCol, roll.pitch);   // 光を当てなおして 丸く。表情つき・きょろきょろ
      drawSendArrow(hx, by, T, u);   // お米の まん中から
      drawCombo(hx + 15 * u, by - 4 * u, u, now);   // ころころコンボの 数（お米の 右よこ。頭の上は 浮かぶ 文字の 場所）
      if (roll.wetT > 0) {   // ぽちゃん のあと：頭の左上に 水の しずく
        const q = Math.max(1, Math.round(u)), dx0 = hx - 11 * u, dy0 = by - 12 * u + (1.4 - roll.wetT) * 3 * u, crisp = !!rec || (gbOn && !worldMode), sm = ctx.imageSmoothingEnabled;
        ctx.globalAlpha = Math.min(1, roll.wetT * 2); ctx.imageSmoothingEnabled = !crisp;   // しずくも 1枚の 絵に して 点より 細かい 位置で なめらかに すべらせる（ゲームボーイの4色・記録係は 整数の 位置）
        ctx.drawImage(dropSprite(q), crisp ? Math.round(dx0) - q : dx0 - q, crisp ? Math.round(dy0) - q : dy0 - q); drop.at = [dx0, dy0]; drop.n++;
        ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = sm;
      }
      drawNimotsu(hx, by, u, now, mood === 'sleepy');
      yumeStep(hx, by, u, now, mood === 'sleepy');   // ねむって いる あいだの ゆめ（yume.js）   // 名所で のせた 持ち物（nimotsu.js）
      gochisoStep(hx, by, u, now);   // 止まって 名物食を 食べる（gochiso.js）
      otedamaStep(hx, by, u, now);   // とびはねて 名物を ほうって キャッチ（otedama.js）
      kasaStep(hx, by, u, now);   // 雨の 日は 名物の かさを さす（kasa.js）
      kiriStep(hx, by, u, now);   // あさの 川・池の そばでは 川霧が たちこめる（kiri.js）
      meguriStep(hx, by, u, now);   // 夜は 名物が お米の まわりを めぐる（meguri.js）
      tsunStep(hx, by, u, now);   // お米を つんつんすると 名物が 飛び出す（tsun.js）
      nazoStep(hx, by, u, now);   // 止まって じっと すると 西尾の なぞなぞ（答えの 札を タップ。nazonazo.js）
      youkosoStep(hx, by, u, now);   // 地区の 境を こえると 名物の 旗が 立つ（youkoso.js）
      shirushiStep(hx, by, u, now, mood === 'sleepy');   // 入った 地区の 旗が お米の よこに のこる（shirushi.js）
      monosashiStep(hx, by, u, now, mood === 'sleepy');   // 転がった 道のりを 黄金堤の 長さ（180m）で はかる（monosashi.js）
      okaeriStep(hx, by, u, now, mood === 'sleepy');   // しばらくぶりに もどると 名物と いっしょに むかえる（okaeri.js）
      furusatoStep(hx, by, u, now, mood === 'sleepy');   // 西尾市の 外では 西尾の 方角を 名物の 矢じるしで しめす（furusato.js）
      drawBfly(hx, by, u, now, mood === 'sleepy');   // ねむって いる お米の 頭に ちょうちょが ひらひら（文字の ない 小さな かわいさ）
      if (mood === 'sleepy') {   // すやすや：頭の右上に z が ふわふわ のぼる
        const crisp = !!rec || (gbOn && !worldMode), sm = ctx.imageSmoothingEnabled;   // ゲームボーイの4色・Godot の 記録係は 点の まま 整数の 位置に
        ctx.imageSmoothingEnabled = !crisp;
        for (let k = 0; k < 2; k++) {   // 5×5 の Z を 1枚の 絵に して、点より 細かい 位置で なめらかに のぼらせる（1点ずつ カクカク のぼって いた）
          const t = ((now / 1600) + k / 2) % 1, zx = hx + 9 * u + t * 6 * u + k * 3 * u, zy = by - 14 * u - t * 10 * u, q = Math.max(1, Math.round(u * (k ? 0.8 : 1.1)));
          ctx.globalAlpha = 1 - t; ctx.drawImage(zzzSprite(q), crisp ? Math.round(zx) : zx, crisp ? Math.round(zy) : zy); zzz.at = [zx, zy];
        }
        ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = sm; zzz.n++;
      }
    } else {   // 丸く描く用意が できるまでは、絵を回す
      roll.flat++;
      const cs = Math.cos(roll.spin);
      ctx.save(); ctx.translate(Math.round(hx), Math.round(by));
      ctx.scale((cs < 0 ? -sx : sx) * Math.max(0.18, Math.abs(cs)), (Math.cos(roll.pitch) < 0 ? -sy : sy) * riceTall(roll.pitch)); ctx.rotate(th % (Math.PI * 2));
      ctx.drawImage(cs < 0 && roll.back ? roll.back : img, -Math.round(sz / 2), -Math.round(sz / 2), sz, sz);
      ctx.restore();
    }
    if (riceBall.cv && !rec) occludeRice(hx, by, hcy + T * 0.3, u, () => drawRiceBall(hx, by, u, th % (Math.PI * 2), sx, sy, roll.spin, ctx, gbOn && !worldMode, mood, roll.look, roll.dirt, roll.dirtCol, roll.pitch));
  } else if (me || G.demo) ctx.drawImage(heroSprites[facing][f], Math.round(w / 2 - T / 2), Math.round(cy - T * 0.75), T, T);

  if (!rec) drawNight(w, h, ox, oy, T, cy, pois, now);   // 夜のさんぽ：明かりのまわりだけ見える
  if (!rec) drawMorning(w, h);   // 朝の ひかり
  {   // 看板は人や建物の上に出す（主人公には重ねない）
    // 町名の札（青地に白い字。電柱の町名表示のように）・駅名標（白地に黒い字と青い線）・お店の看板（その店らしい色に白い字）
    // 重ならないように、町名 → 駅 → 大きなお店 → ほかのお店 の順に場所を取る
    const fs = Math.round(10 * dpr), pad = Math.round(3 * dpr), bw = Math.max(1, Math.round(dpr));
    labelBoxes.push([w / 2 + heroScr.x - T, cy + heroScr.y - T * 1.6, w / 2 + heroScr.x + T, cy + heroScr.y + T * 0.8]);   // 主人公のところ
    ctx.font = `${fs}px "DotGothic16", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const board = (X, Y, text, bg, fg, line) => {
      const tw = ctx.measureText(text).width, bx = Math.round(X - tw / 2 - pad), by = Math.round(Y), bwid = Math.round(tw + pad * 2), bh = fs + pad * 2;
      const box = [bx - 1, by - 1, bx + bwid + 1, by + bh + 1];
      if (box[2] < 0 || box[0] > w || box[1] > h || box[3] < 0 || labelBoxes.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) return;
      labelBoxes.push(box);
      ctx.fillStyle = '#000'; ctx.fillRect(bx - bw, by - bw, bwid + bw * 2, bh + bw * 2);
      ctx.fillStyle = bg; ctx.fillRect(bx, by, bwid, bh);
      if (line) { ctx.fillStyle = line; ctx.fillRect(bx, by + bh - Math.round(3 * dpr), bwid, Math.round(3 * dpr)); }
      ctx.fillStyle = fg; ctx.fillText(text, X, by + bh / 2 - (line ? dpr : 0));
    };
    const short = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
    const hm = (me || G.demo) && !driving ? heightAt(cam.x, cam.y) : null;   // いまいる所の標高と坂（お米の右上に小さく）
    if (hm !== null) {
      const sl = slopeAt(cam.x, cam.y), pct = Math.round(sl.g * 100);
      const arrow = pct < 2 ? '' : ' ' + '→↘↓↙←↖↑↗'[((Math.round(Math.atan2(sl.y, sl.x) / (Math.PI / 4)) % 8) + 8) % 8] + pct + '%';
      board(Math.round(w / 2 + heroScr.x + T * 1.9), Math.round(cy + heroScr.y - T * 1.5), `⛰${hm < 10 ? hm.toFixed(1) : Math.round(hm)}m${arrow}`, '#fffbe8', '#5a3a18');
    }
    // 文字を少なく（ふだん）：町名・駅名・お店の看板は出さない（当店の札はスポットの絵の上に出す。いまいる町名は こよみ の札をタップ）
    if (!SIMPLE()) for (const x of towns) {
      if (x[0] < tx0 - 4 || x[0] > tx1 + 4 || x[1] < ty0 - 2 || x[1] > ty1 + 2) continue;
      board(Math.round(ox + x[0] * T), Math.round(oy + x[1] * T), short(x[2], 10), '#1b4fa0', '#fff');
    }
    if (!SIMPLE()) for (const sp of spots) {
      if ((sp.kind || sp.cat) !== 'station') continue;
      const q = toTile(sp.lat, sp.lng);
      if (q.x < tx0 - 4 || q.x > tx1 + 4 || q.y < ty0 - 2 || q.y > ty1 + 2) continue;
      board(Math.round(ox + q.x * T), Math.round(oy + q.y * T + T * 0.7), short(sp.name.replace(/^名鉄\s*/, ''), 12), '#fff', '#111', '#1b4fa0');
    }
    if (!SIMPLE()) for (const p of pois.filter(q => MAJOR_SIGN.has(q[2])).concat(pois.filter(q => !MAJOR_SIGN.has(q[2])))) {   // 大きなお店から場所を取る
      if (!p[3]) continue;
      board(Math.round(ox + p[0] * T), Math.round(oy + p[1] * T + T * 0.35), short(p[3], 12), signColor(p[2], p[3]), '#fff');
    }
  }

  drawWeather(now, w, h, dpr, !!rec);   // Godot で描くときは、暗さだけ。雨と雪は Godot のつぶで

  // 町が変わったら、まん中に町名を大きく出す（いまいる町名は、左上の こよみ の札に出す）
  if (here.banner) {
    const age = (now - here.bannerAt) / 1000;
    if (age > 2.8) { here.banner = ''; here.waited = 0; here.lastT = 0; }
    else {
      ctx.globalAlpha = Math.min(1, age * 3, (2.8 - age) * 2);
      const mz = mazeOn() && rollOn, bs = Math.round((mz ? 14 : 18) * dpr), t = `〜 ${here.banner} 〜`;
      ctx.font = `${bs}px "DotGothic16", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // 左上の こよみ の札より下に。めいろでは お米の すぐ上（これから 転がす 所）を ふさがない よう、上の 時計・かかしの 札の 下に 小さく
      const tw = ctx.measureText(t).width, bx0 = w / 2 - tw / 2 - 14 * dpr, bx1 = w / 2 + tw / 2 + 14 * dpr;
      let by = Math.max(mz ? Math.round(13 * dpr * 5.4 + bs) : Math.round(Math.max(cy - T * 3, 48 * dpr + bs)), Math.round(toastFoot() + bs + 6 * dpr));   // 上の 知らせが 出て いれば その 下に（2行の 知らせに 町名が かくれていた。自分で 遊んで 分かった）
      // めいろの 縁の 矢印と 道のりの 札（前の こまの 場所。あとから 描くので 札に かぶる）に かかる ときは よける（Codex の 指摘）：
      // まず 横（矢印と 反対の がわ）、だめなら 矢印の 下（お米に かからなければ）。どちらも だめなら 出すのを 待つ（4秒まで）
      const A = mz && mzMap.arrow, R = mz && roll.box, hit = (y, x0, x1, r) => !!r && x0 < r[2] && x1 > r[0] && y - bs < r[3] && y + bs > r[1];
      const blocked = (y, a, b) => hit(y, a, b, A) || hit(y, a, b, R);
      let x0 = bx0, x1 = bx1, wait = false;
      here.dodged = blocked(by, x0, x1);   // dodged：テスト用
      if (here.dodged) {
        const bw = x1 - x0, m = 4 * dpr, right = !A || (A[0] + A[2]) / 2 < w / 2, xs = right ? [w - m - bw, m] : [m, w - m - bw], y2 = A ? Math.round(A[3] + bs + 4 * dpr) : 0;   // 矢印と 反対の はしから
        const nx = xs.find(x => x >= m - 0.5 && x + bw <= w - m + 0.5 && !blocked(by, x, x + bw));
        if (nx !== undefined) { x0 = nx; x1 = nx + bw; }
        else if (A && !blocked(y2, x0, x1)) by = y2;
        else if ((here.waited || 0) < 4000) wait = true;
        else { here.banner = ''; here.box = null; here.waited = 0; here.lastT = 0; ctx.globalAlpha = 1; }   // 4秒 待っても 空かなければ この 町名は 出さない（重なる 所には 描かない。Codex の 指摘）
      }
      if (here.banner) {   // 上で 出さない ことに した ときは 描かない
      const dtw = here.lastT ? now - here.lastT : 0; here.lastT = now;
      if (wait) { here.waited = (here.waited || 0) + dtw; here.bannerAt += dtw; here.box = null; ctx.globalAlpha = 1; }   // 待って いる 間は 時間を 進めない
      else {
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(Math.round(x0), by - bs, Math.round(tw + 28 * dpr), bs * 2);
      here.box = [x0, by - bs, x1, by + bs];   // テスト用
      ctx.fillStyle = '#fff'; ctx.fillText(t, (x0 + x1) / 2, by);
      ctx.globalAlpha = 1;
      }
      }
    }
  }

  // 主人公の頭の上に浮かぶ文字（ポイントなど）
  // めいろの「🏁 ゴール！」が 出ている 間は 待って、消えてから 浮かべる（ゴールの 時間・★の 行と 重なって どちらも 読めなかった。自分で 遊んで 分かった）
  //   待っている 文字が いくつか あれば、消えた あとに 来た 順に 1つずつ（1.3秒ずつ）。同じ 所に いっしょに 出すと 重なって 読めない
  //   つづく「🏁 つぎの ゴール」の 札（3秒）の 間も 待つ（自分で 遊んで 分かった：ゴールの あと 待っていた「おしい！…」が 札の「めいろで 2.0km」に 重なった）
  if (mazeOn()) drawRiceSay(w, cy, T, now, dpr);   // お米の 吹き出し（めいろの 中だけ）
  floatDrawn.length = 0;
  const floatHold = !!(mzBanner.t0 || mzNextOn());
  if (floatHold) { floaters.forEach((fl, k) => { fl.at = now + k * 1300; }); floatQEnd = floaters.length ? now + floaters.length * 1300 : 0; if (floaters.length) floatLast = now + (floaters.length - 1) * 1300; }   // 1つ 1.2秒で 消える。すこし あけて 次を（ちょうど 1.2秒だと 消える こまと 出る こまが 重なる）
  let floatWait = -1;   // よける 所が なくて 待っている 文字の 番号
  // 上に 出て いる 知らせ（DOM）の わく（キャンバスの 画素）。浮かぶ 文字は 知らせの うしろに かくれるので よける（自分で 遊んで 分かった：320×568 で 4行の「🌙 夜のさんぽ…」が「おしい！ ベストまで…」の 1行目を かくした）
  let floatToast = null;
  if (floaters.length) {
    const te = document.getElementById('toast');
    if (te && te.classList.contains('show')) { const r = te.getBoundingClientRect(), c = cv.getBoundingClientRect(), k = c.width ? cv.width / c.width : 1; if (r.width && r.height) floatToast = [(r.left - c.left) * k, (r.top - c.top) * k, (r.right - c.left) * k, (r.bottom - c.top) * k]; }
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const fl = floaters[i];
    if (floatHold) continue;
    const age = (now - fl.at) / 1000;
    if (age < 0) continue;   // 順番を 待っている
    if (age > 1.2) { floaters.splice(i, 1); continue; }
    floatDrawn.push(fl.t);
    ctx.globalAlpha = Math.min(1, (1.2 - age) * 2);
    // 大きく 太い 字で（運営者の声「プレイ画面に小さい文字が多くて…大きい文字シンプルに」2026-10-27：11点 → 16点）。画面の はばに 入らなければ 小さく
    let fz = Math.round(FLOAT_PX * dpr);
    ctx.font = `bold ${fz}px "DotGothic16", monospace`;
    const fw = ctx.measureText(fl.t).width;
    if (fw > w * 0.94) { fz = Math.max(Math.round(11 * dpr), Math.floor(fz * w * 0.94 / fw)); ctx.font = `bold ${fz}px "DotGothic16", monospace`; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, Math.round(fz / 4)); ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.fillStyle = '#ffe27a';
    floatPx = Math.max(floatPx, fz / dpr);
    const fy0 = Math.round(cy - T * 1.15 - age * T * 0.7);   // お米の 頭より 上から（右よこの コンボの 数と 重ならない）
    // めいろの 縁の 矢印と 道のりの 札（前の こまの 場所。あとから 描く）に かかる ときは よける（自分で 遊んで 分かった：「おしい！ ベストまで…」が 西の ゴールの「2.4km」に 重なった）
    // まず 横へ。1行では はばが 足りない ときは 2行に 分けて 横へ。それでも だめなら 矢印の 下（お米に かかる ときは 上。上は 時計や ボタンに かかりやすい）
    const A = mazeOn() && mzMap.arrow, m = 6 * dpr, lh = Math.round(fz * 1.1);
    const wid = ls => Math.max(...ls.map(s => ctx.measureText(s).width));
    const box = (ls, x, y) => { const bw = wid(ls); return [x - bw / 2, y - lh * (ls.length - 1) - fz, x + bw / 2, y]; };
    const hit = b => b[0] < A[2] + m && b[2] > A[0] - m && b[1] < A[3] + m && b[3] > A[1] - m;
    let ls = [fl.t], fx = w / 2, fy = fy0;
    floatShift = [0, 0];
    if (A && (fl.dodge || hit(box(ls, fx, fy)))) {   // いちど よけた 文字は 消えるまで 同じ よけ方で（浮いて 矢印を こえた とたんに 戻すと とんで 見える）
      const sps = [];
      for (let n = fl.t.indexOf(' '); n > 0; n = fl.t.indexOf(' ', n + 1)) sps.push(n);   // slice と 同じ 数え方で（絵文字つきの 文字でも 1文字 けずらない。Codex の 指摘）
      const k = sps.sort((a, b) => Math.abs(a - fl.t.length / 2) - Math.abs(b - fl.t.length / 2))[0];   // まん中に ちかい すきまで 2行に
      const tries = [[fl.t]].concat(k ? [[fl.t.slice(0, k), fl.t.slice(k + 1)]] : []);
      const sideX = l => { const bw = wid(l); return (A[0] + A[2]) / 2 < w / 2 ? Math.min(w - m - bw / 2, A[2] + m + 1 + bw / 2) : Math.max(m + bw / 2, A[0] - m - 1 - bw / 2); };   // 矢印と 反対の がわへ（画面の はしまで。+1 は 小数の 誤差で ぎりぎり かかる 判定に ならない ように）
      const top = mzClockFoot(dpr, now) + m, huds = mzHudRects(now);   // 上の 時計の 札（かかし・ばねの のこりの 札も）と ボタンにも かけない（Codex の 指摘）
      const foot = roll.box ? roll.box[1] - m : Math.round(cy - T * 1.15);   // お米の 頭より 下へは 下げない
      const under = l => top + lh * (l.length - 1) + fz;   // 浮いて いっても 時計の 札の 下で 止める（Codex の 指摘）
      const place = d => d === 'side0' || d === 'side1' ? tries[+d[4]] && { ls: tries[+d[4]], fx: sideX(tries[+d[4]]), fy: Math.max(fy0, under(tries[+d[4]])) }
        : d === 'down' ? { ls: [fl.t], fx: w / 2, fy: Math.max(fy0, A[3] + m + fz) } : d === 'up' ? { ls: [fl.t], fx: w / 2, fy: Math.max(under([fl.t]), Math.min(fy0, A[1] - m)) } : null;   // 上へ 浮いて いく ので、矢印の 下（上）で 止めて おけば つながって 見える
      const safe = (d, c) => { if (!c) return false; const b = box(c.ls, c.fx, c.fy); return !hit(b) && b[0] >= 0 && b[2] <= w && b[1] >= top && (d === 'up' ? c.fy <= A[1] - m : d !== 'down' || c.fy <= foot) && !huds.some(r => b[0] < r[2] && b[2] > r[0] && b[1] < r[3] && b[3] > r[1]); };
      let q = fl.dodge && place(fl.dodge);
      if (q && !safe(fl.dodge, q)) q = null;   // 持っている よけ方も こまごとに 確かめ、画面の はばが かわった などで かかる ときは 選びなおす（Codex の 指摘）
      if (!q) {
        fl.dodge = ['side0', 'side1', 'down', 'up'].find(d => safe(d, place(d))) || '';
        q = fl.dodge && place(fl.dodge);
      }
      if (!q) {   // よける 所が ない：重ねて 描かずに 待つ（4秒 たっても なければ 出さない）
        floatDrawn.pop(); ctx.globalAlpha = 1;
        if (!fl.w0) fl.w0 = now;
        if (now - fl.w0 > 4000) { floaters.splice(i, 1); if (floatWait > i) floatWait--; }
        else floatWait = i;
        continue;
      }
      ({ ls, fx, fy } = q);
      floatShift = [fx - w / 2, fy - fy0];
    }
    if (floatToast) {   // 知らせに かかる ときは 知らせの すぐ 下へ（お米の 頭より 下に なる・縁の 矢印に かかる ときは 知らせが 消えるまで 待つ）
      const b = box(ls, fx, fy), Q = floatToast;
      if (b[0] < Q[2] + m && b[2] > Q[0] - m && b[1] < Q[3] + m && b[3] > Q[1] - m) {
        const ny = Math.round(Q[3] + m + lh * (ls.length - 1) + fz), foot = roll.box ? roll.box[1] - m : Math.round(cy - T * 1.15);
        if (ny <= foot && !(A && hit(box(ls, fx, ny)))) { fy = Math.max(fy, ny); floatShift = [fx - w / 2, fy - fy0]; }
        else {
          floatDrawn.pop(); ctx.globalAlpha = 1;
          if (!fl.w0) fl.w0 = now;
          if (now - fl.w0 > 6000) { floaters.splice(i, 1); if (floatWait > i) floatWait--; }   // 知らせは 4秒ほどで 消える。6秒 待っても だめなら 出さない
          else floatWait = i;
          continue;
        }
      }
    }
    ls.forEach((s, n) => { const y = fy - lh * (ls.length - 1 - n); ctx.strokeText(s, fx, y); ctx.fillText(s, fx, y); });
    ctx.globalAlpha = 1;
  }
  if (floatWait >= 0) {   // 待っている 文字は 出はじめの まま、あとの 文字は その うしろへ（いっしょに 出ると 重なる）
    floaters.forEach((f, k) => { if (k >= floatWait) f.at = Math.max(f.at, now + (k - floatWait) * FLOAT_GAP); });
    floatLast = Math.max(floatLast, floaters[floaters.length - 1].at);
  }

  // 画面の外にある行き先（みちしるべ。なければ一番近いスポット）への矢印。行き先が画面の中なら、その上で ▼ がはねる
  const gt = G.guide, aim = gt || nearest;
  if (gt) {
    const p = toTile(gt.lat, gt.lng), ex = ox + p.x * T, ey = oy + p.y * T;
    if (ex >= 0 && ey >= 0 && ex <= w && ey <= vh) {
      const by = Math.round(ey - T * 1.3 - (f ? T * 0.15 : 0));
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(ex - T * 0.38, by - T * 0.3); ctx.lineTo(ex + T * 0.38, by - T * 0.3); ctx.lineTo(ex, by + T * 0.2); ctx.fill();
      ctx.fillStyle = '#7ee0ff'; ctx.beginPath(); ctx.moveTo(ex - T * 0.26, by - T * 0.22); ctx.lineTo(ex + T * 0.26, by - T * 0.22); ctx.lineTo(ex, by + T * 0.08); ctx.fill();
    }
  }
  if (mzFx.length || mzBanner.t0) drawMzFx(w, cy, Math.max(T, Math.round(16 * dpr)), now, Math.round(16 * dpr));
  if (mazeOn() && gt && (mzNext.want || mzNext.t0)) drawMzNext(w, cy, Math.round(16 * dpr), now);   // 文字は 画面の 大きさで（地図を 大きく しても 画面から はみ出さない）
  if (mazeOn() && gt) { drawMzGoal(gt, ox, oy, T, w, vh, cy, dpr, now); drawMzClock(w, dpr, now); mzToastDodge(now); }   // めいろの ゴール（🏁 と 光る わ。画面の 外なら 縁に 大きな 矢印と 道のり）
  else if (gt || (aim && !G.selected)) {   // 行き先はいつも指す（ほかのスポットの範囲にいても）
    const p = toTile(aim.lat, aim.lng);
    const ex = ox + p.x * T, ey = oy + p.y * T;
    if (ex < 0 || ey < 0 || ex > w || ey > vh) {   // 見えている所（パネルの上）の外なら、その縁に矢印
      const a = Math.atan2(ey - cy, ex - w / 2), m = T * 0.8;
      const ax = Math.min(w - m, Math.max(m, w / 2 + Math.cos(a) * w)), ay = Math.min(vh - m, Math.max(m, cy + Math.sin(a) * vh));
      const px = Math.min(Math.abs((w / 2 - m) / Math.cos(a)), Math.abs((vh / 2 - m) / Math.sin(a)));
      const qx = w / 2 + Math.cos(a) * px, qy = cy + Math.sin(a) * px;
      ctx.save(); ctx.translate(isFinite(qx) ? qx : ax, isFinite(qy) ? qy : ay); ctx.rotate(a);
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(T * 0.45, 0); ctx.lineTo(-T * 0.3, -T * 0.35); ctx.lineTo(-T * 0.3, T * 0.35); ctx.fill();
      ctx.fillStyle = gt ? '#7ee0ff' : '#ffd54f'; ctx.beginPath(); ctx.moveTo(T * 0.32, 0); ctx.lineTo(-T * 0.2, -T * 0.24); ctx.lineTo(-T * 0.2, T * 0.24); ctx.fill();
      ctx.restore();
    }
  }

  // 読み込み状況
  const c0 = camTile(), st = chunkState(Math.floor(c0.x / CHUNK), Math.floor(c0.y / CHUNK));
  const msg = st === 'out' ? 'ここは にしおしの そとだ。' : st === 'fail' ? 'ちずを よみこめなかった。\nしばらくして もういちど ためしてね。'
    : st === 'ok' ? '' : 'ちずを よみこんでいます…';
  $('pxMsg').hidden = !msg;
  if (msg) $('pxMsg').textContent = msg;
  if (rec) { rec.end(); rec = null; ctx = ctx0; }
  dirty = false;
}

// 大きな道の「縁のマス」（外側が道でなく、内側の隣も大きな道）が、(dx,dy) の向きに続く長さ（自分を含む。前後2マスまで）
function hEdgeRun(tx, ty, dx, dy, road) {
  const ox = dy, oy = dx;   // 縁の外側の向き（横に続く縁なら上、縦に続く縁なら左）
  const edge = (x, y) => codeAt(x, y) === C.H && !road(codeAt(x - ox, y - oy)) && codeAt(x + ox, y + oy) === C.H;
  let n = 1;
  for (const s of [1, -1]) for (let k = 1; k <= 2 && edge(tx + dx * k * s, ty + dy * k * s); k++) n++;
  return n;
}

// 画面に見えている区画の建物。注目スポットや同じ名前のスポットのすぐ近くの建物は出さない
let poiCache = { key: '', list: [] };
function visiblePois(tx0, ty0, tx1, ty1) {
  const key = [Math.floor(tx0 / 8), Math.floor(ty0 / 8), Math.floor(tx1 / 8), Math.floor(ty1 / 8), G.spots.length, chunks.size, landmarks.length].join(',');
  if (poiCache.key === key) return poiCache.list;
  tx0 = Math.floor(tx0 / 8) * 8; ty0 = Math.floor(ty0 / 8) * 8;   // 覚えておく間（8マスの区切りが同じ間）に見えうる所ぜんぶ
  tx1 = Math.floor(tx1 / 8) * 8 + 7; ty1 = Math.floor(ty1 / 8) * 8 + 7;
  const list = [];   // 下は3マス先まで（特大の絵は4マスで、点より2.88マス上まではみ出すので、画面の下から近づくときに急に出ないように）
  for (let cy = Math.floor((ty0 - 2) / CHUNK); cy <= Math.floor((ty1 + 3) / CHUNK); cy++)
    for (let cx = Math.floor((tx0 - 2) / CHUNK); cx <= Math.floor((tx1 + 2) / CHUNK); cx++) {
      const c = chunks.get(cx + '_' + cy);
      for (const p of (c && c.pois) || []) {
        if (p[0] < tx0 - 2 || p[0] > tx1 + 2 || p[1] < ty0 - 2 || p[1] > ty1 + 3) continue;
        const clash = G.spots.some(s => { const q = toTile(s.lat, s.lng), d = Math.hypot(q.x - p[0], q.y - p[1]); return d < (s.featured ? 4 : 2) || (d < 25 && p[3] && s.name.includes(p[3])); });
        if (!clash) list.push(p);
      }
    }
  // 街並みの目印（同じ名前の建物がもう出ていれば出さない）
  for (const p of landmarks) {
    if (p[0] < tx0 - 2 || p[0] > tx1 + 2 || p[1] < ty0 - 2 || p[1] > ty1 + 2) continue;
    if (list.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 3 && (q[3] === p[3] || q[2] === p[2] || (q[2] === 'shop' && p[2] === 'super')))) continue;
    const clash = G.spots.some(s => { const q = toTile(s.lat, s.lng), d = Math.hypot(q.x - p[0], q.y - p[1]); return d < (s.featured ? 4 : 2) || (d < 25 && s.name.includes(p[3])); });
    if (!clash) list.push(p);
  }
  poiCache = { key, list };
  return list;
}
function poiHtml(p) {
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<div class="popup"><h4>${esc(p[3] || POI_LABEL[p[2]].replace(/^\S+ /, ''))}</h4><p><span class="tag">${esc(POI_LABEL[p[2]])}</span></p><p>主要な建物です（チェックインはできません）。</p></div>`;
}

// 地区ガイド（areas.json の分析：特徴・名物・人口・豆知識と、その地区の名所のめぐり具合）
function areaHtml(a) {
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const p = G.areaProgress(a.id), num = v => (Number.isFinite(v) ? v.toLocaleString() : null);
  const facts = [num(a.population) && `人口 ${num(a.population)}人${a.populationAsOf ? `（${esc(a.populationAsOf)}）` : ''}`, num(a.areaKm2) && `面積 約${num(a.areaKm2)}km²`].filter(Boolean);
  const src = (a.sources || []).filter(u => /^https?:\/\//.test(u)).slice(0, 4);
  const srcHtml = src.length ? `<p class="src">出典：${src.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">${i + 1}</a>`).join(' ')}</p>` : '';
  if (SIMPLE()) {   // 文字を少なく（ふだん）：名物の大きな絵（Blender で作った絵）、名物の札、めぐった名所のドット絵（まだの所は灰色）。くわしい話はタップで
    const art = G.areaArt ? G.areaArt(a.id) : '', pct = p.total ? Math.round(p.done / p.total * 100) : 0;
    const thumb = s => { try { const c = spriteOf(s)[0]; return c ? c.toDataURL() : ''; } catch (e) { return ''; } };
    return `<div class="popup area-card pic"><div class="pop-head">${art ? `<img class="pop-art" src="${art}" alt="" width="64" height="64"/>` : ''}<h4>${esc(a.name)}</h4></div>
    ${a.catch ? `<p class="catch">${esc(a.catch)}</p>` : ''}
    ${(a.specialties || []).length ? `<p class="chips">${a.specialties.map(x => `<span>${esc(String(x).replace(/（.*?）/g, ''))}</span>`).join('')}</p>` : ''}
    <p class="area-prog">${ICO('flag', '', 'めぐった名所')}<span class="bar"><i style="width:${pct}%"></i></span><b>${p.done}/${p.total}</b></p>
    <ul class="area-thumbs">${p.list.map(s => { const u = thumb(s); return `<li class="${G.state.visits[s.id] ? 'got' : ''}" title="${esc(s.name)}">${u ? `<img src="${u}" alt="${esc(s.name)}" width="32" height="32"/>` : esc(s.name.slice(0, 1))}</li>`; }).join('')}</ul>
    ${a.summary || a.trivia || facts.length ? `<details><summary>${ICO('book', '', '')} くわしく</summary>${a.summary ? `<p>${esc(a.summary)}</p>` : ''}${facts.length ? `<p>${facts.join('／')}</p>` : ''}${a.trivia ? `<p>${esc(a.trivia)}</p>` : ''}</details>` : ''}
    ${srcHtml}</div>`;
  }
  return `<div class="popup area-card"><h4>${esc(a.icon || '')} ${esc(a.name)}${a.kana ? `<small>（${esc(a.kana)}）</small>` : ''}</h4>
    ${a.catch ? `<p class="catch">${esc(a.catch)}</p>` : ''}
    ${a.summary ? `<p>${esc(a.summary)}</p>` : ''}
    ${(a.specialties || []).length ? `<p><span class="tag">名物</span> ${a.specialties.map(esc).join('・')}</p>` : ''}
    ${facts.length ? `<p><span class="tag">データ</span> ${facts.join('／')}</p>` : ''}
    ${a.trivia ? `<p>💡 ${esc(a.trivia)}</p>` : ''}
    <p><span class="tag">めぐった名所</span> ${p.done}/${p.total}</p>
    <ul class="area-spots">${p.list.map(s => `<li>${G.state.visits[s.id] ? '✓' : '・'} ${esc(s.name)}</li>`).join('')}</ul>
    ${srcHtml}</div>`;
}

/* ---------- せかいちずの表示 ---------- */
let worldMode = false, wcam = null, wscale = 2, wcamOnMe = false;   // wcamOnMe：まだ現在地が分からないうちに開いた（分かったら主人公へ寄せる）
const WSIZES = [2, 3, 4, 6, 10, 16, 24];   // 1マスの大きさ（CSSピクセル）。6以下は色のブロック、10以上はドット絵タイル
// 地図データに地名がないときの予備と、海の名前
const AREA_LABELS = [['西尾', 34.872, 137.058, 4], ['一色', 34.802, 137.028, 3], ['吉良', 34.818, 137.078, 3], ['幡豆', 34.800, 137.138, 3], ['佐久島', 34.733, 137.040, 3],
  ['岡崎', 34.955, 137.165, 4], ['安城', 34.959, 137.081, 4], ['碧南', 34.885, 136.993, 4], ['幸田', 34.865, 137.166, 3], ['蒲郡', 34.826, 137.219, 4], ['高浜', 34.928, 136.989, 3]];
const SEA_LABELS = [['三河湾', 34.752, 137.105, 4]];
const wT = dpr => Math.round(WSIZES[wscale] * dpr);
function worldCamStart() {
  const me = G.me;
  wcamOnMe = !me;
  if (me && G.inPlay(me.lat, me.lng)) return llToW(me.lat, me.lng);
  return llToW(34.825, 137.07);   // 西尾市のまんなかあたり
}
// 角だけで接する水のマス（1マス幅の ななめの用水路など）は、マスを描いたあとで その角を まん中に ななめの水路を重ねてつなぐ（kawakado.png）。
// どの角も、左下のマスの右上・右下のマスの左上として1回だけ調べる。岸は、あいだの陸のマスに砂浜があれば浜（浅瀬）、町なかがあれば護岸、なければ土手
function drawWaterCorners(tx0, ty0, tx1, ty1, ox, oy, T, f) {
  if (!MT.kawakado) return;
  const A = (x, y) => gridAt(x, y) === C.A;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0 - 1; tx <= tx1; tx++) {
    if (!A(tx, ty)) continue;
    for (const [dx, col] of [[1, 0], [-1, 2]]) {   // 右上の角（左下から右上の水路）・左上の角（右下から左上の水路）
      if (!A(tx + dx, ty - 1) || A(tx + dx, ty) || A(tx, ty - 1)) continue;
      const l1 = gridAt(tx + dx, ty), l2 = gridAt(tx, ty - 1), row = l1 === C.S || l2 === C.S ? 2 : SHORE_TOWN.has(l1) || SHORE_TOWN.has(l2) ? 0 : 1;   // shoreIndex と同じ決め方
      ctx.drawImage(MT.kawakado[row][col + f], ox + tx * T + (dx > 0 ? T : 0) - T / 2, oy + ty * T - T / 2, T, T);
    }
  }
}
const worldAt = (x, y) => (world && x >= 0 && y >= 0 && x < WW && y < WH ? world[y * WW + x] : C.X);
// せかいちずの線路・道・水べ：歩く地図と同じく つながる向きの Blender の絵（読めていなければ false を返し、いつもの絵）
function drawLinked(code, x, y, X, Y, T, f) {
  if (code === C.L && MT.rail) {
    const ri = railIndex(x, y);
    if (typeof ri === 'number') ctx.drawImage(MT.rail[ri], X, Y, T, T);
    else { ctx.drawImage(MT.rail[34], X, Y, T, T); for (const p of ri) ctx.drawImage(MT.rail[26 + p], X, Y, T, T); }
    return true;
  }
  if (MT.road && ROAD_ROW[code] !== undefined) {
    const [ri, kado, xr, rankan] = nbrLook(x, y, roadLookOf);
    ctx.drawImage(MT.road[ROAD_ROW[code]][ri], X, Y, T, T);
    if (MT.kado) for (const i of kado) ctx.drawImage(MT.kado[ROAD_ROW[code]][i], X, Y, T, T);
    if (MT.rail) for (const p of xr) ctx.drawImage(MT.rail[p], X, Y, T, T);
    if (MT.rankan) for (const i of rankan) ctx.drawImage(MT.rankan[i], X, Y, T, T);
    return true;
  }
  const sh = code === C.A && MT.shore && nbrLook(x, y, shoreIndex);
  if (sh) { ctx.drawImage(MT.shore[sh[0]][sh[1] + f], X, Y, T, T); return true; }
  return false;
}
function drawWorld(now, w, h, dpr) {
  const T = wT(dpr), f = Math.floor(now / 600) % 2;
  if (!wcam || (wcamOnMe && G.me)) wcam = worldCamStart();
  wcam.x = Math.min(WW, Math.max(0, wcam.x)); wcam.y = Math.min(WH, Math.max(0, wcam.y));
  ctx.imageSmoothingEnabled = false;
  const ox = Math.round(w / 2 - wcam.x * T), oy = Math.round(h / 2 - wcam.y * T);
  const x0 = Math.floor(-ox / T), y0 = Math.floor(-oy / T), x1 = Math.ceil((w - ox) / T), y1 = Math.ceil((h - oy) / T);
  const css = WSIZES[wscale];
  if (css <= 6 && worldImg) {   // 引いて見るとき：1マス＝色のブロック
    ctx.fillStyle = WCOL[C.X]; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(worldImg, ox, oy, WW * T, WH * T);
  } else {
    gridAt = worldAt; nbrCur = worldNbr;
    try {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const inside = world && x >= 0 && y >= 0 && x < WW && y < WH;
        const code = inside ? world[y * WW + x] : C.X;   // 西尾市の範囲の外は霧（地図の端）
        const v = tileVar(code, x, y), X = ox + x * T, Y = oy + y * T;
        if (!drawLinked(code, x, y, X, Y, T, f)) ctx.drawImage(tiles[code][v % tiles[code].length][tileFrame(code, f, x, y, now)], X, Y, T, T);
      }
      drawWaterCorners(x0, y0, x1, y1, ox, oy, T, f);
    } finally { gridAt = codeAt; nbrCur = nbrCache; }
  }
  // 歩いた所（あしあとのある100mのマス）に、もも色と足あと（地図の黄色・緑・青と まぎれない色）
  // 調べるのは、歩いた所の数と画面に見えるマスの数の少ないほう（記録が何万マスにふえても、毎フレームの手間が画面の広さをこえない）
  if (TRAIL.world.size) {
    const vx0 = Math.max(0, x0), vy0 = Math.max(0, y0), vx1 = Math.min(WW - 1, x1), vy1 = Math.min(WH - 1, y1), seen = [];
    if (TRAIL.world.size <= (vx1 - vx0 + 1) * (vy1 - vy0 + 1)) {
      for (const i of TRAIL.world) { const x = i % WW, y = (i - x) / WW; if (x >= vx0 && x <= vx1 && y >= vy0 && y <= vy1) seen.push(x, y); }
    } else for (let y = vy0; y <= vy1; y++) for (let x = vx0; x <= vx1; x++) if (TRAIL.world.has(y * WW + x)) seen.push(x, y);
    ctx.fillStyle = 'rgba(255,80,150,.5)';
    for (let k = 0; k < seen.length; k += 2) ctx.fillRect(ox + seen[k] * T, oy + seen[k + 1] * T, T, T);
    if (T >= 12) for (let k = 0; k < seen.length; k += 2) drawFoot(C.H, seen[k], seen[k + 1], ox + seen[k] * T, oy + seen[k + 1] * T, T);
  }
  // 市町の境（region.js）：黒いふちどりの上に白い点線（どの地形の上でも見えるように）
  ctx.save();
  for (const c of G.REGION) for (const r of c.rings) {
    ctx.beginPath();
    r.forEach(([la, lo], i) => { const q = llToW(la, lo); ctx[i ? 'lineTo' : 'moveTo'](ox + q.x * T, oy + q.y * T); });
    ctx.setLineDash([]); ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 3.5 * dpr; ctx.stroke();
    ctx.setLineDash([5 * dpr, 4 * dpr]); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.6 * dpr; ctx.stroke();
  }
  ctx.restore();
  // 大きな建物（引いたときは出さない）
  const bs = Math.max(T * 1.4, 12 * dpr);
  for (const p of css >= 6 ? worldPois : []) {
    const X = ox + p[0] * T - bs / 2, Y = oy + p[1] * T - bs / 2;
    if (X > w || Y > h || X + bs < 0 || Y + bs < 0) continue;
    if (G.spots.some(s => s.featured && Math.hypot(llToW(s.lat, s.lng).x - p[0], llToW(s.lat, s.lng).y - p[1]) < 1)) continue;
    ctx.drawImage(spotSprites[p[2]][0], Math.round(X), Math.round(Y), bs, bs);
  }
  // 注目スポット（引いたときはお店と大きな名所だけ）
  const size = Math.max(T * 1.6, (WSIZES[wscale] <= 3 ? 12 : 15) * dpr);
  const shopTags = [];
  for (const s of G.spots.filter(worldSpotShown).sort((a, b) => !!a.shop - !!b.shop)) {   // 当店はいちばん上に
    const sz = s.shop ? Math.round(size * 1.35) : size;
    const p = llToW(s.lat, s.lng), X = ox + p.x * T - sz / 2, Y = oy + p.y * T - sz / 2;
    if (X > w || Y > h || X + sz < 0 || Y + sz < 0) continue;
    ctx.drawImage(spriteOf(s)[G.cooldownLeft(s) > 0 ? 1 : 0], Math.round(X), Math.round(Y), sz, sz);
    if (s.shop) shopTags.push([X + sz / 2, Y, sz, s]);
    if (G.state.visits[s.id]) {   // めぐった名所には金色のしるし
      const r = Math.max(3 * dpr, sz * 0.2), cx = Math.round(X + sz - r * 0.6), cy = Math.round(Y + r * 0.6);
      ctx.fillStyle = '#000'; ctx.fillRect(cx - r - dpr, cy - r - dpr, r * 2 + 2 * dpr, r * 2 + 2 * dpr);
      ctx.fillStyle = '#ffd54f'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.fillStyle = '#000'; ctx.font = `${Math.round(r * 1.8)}px "DotGothic16", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✓', cx, cy + dpr * 0.5);
    }
  }
  drawWorldLabels(ox, oy, T, w, h, dpr, css);
  // 殿堂入りの場所（昔のドット絵RPGの「城を出ると、最後の城が はじめから見えている」）：殿堂入りするまで、西尾城跡の上に 金色の札「👑 しるし ○/5」
  const ci = G.clearInfo && G.clearInfo(), castle = ci && !ci.cleared && G.spots.find(s => s.id === 'f-nishio-castle');
  if (castle) { const p = llToW(castle.lat, castle.lng); goalTag(ox + p.x * T, oy + p.y * T - size / 2, dpr, `👑 しるし ${ci.got}/${ci.need}`); }
  for (const [x, y, sz, s] of shopTags) {   // 当店の札（店名）は地名より上に。札も絵もタップできる
    const t = drawShopTag(x, y, dpr, s);
    shopHits.push([Math.min(t[0], x - sz / 2), t[1], Math.max(t[2], x + sz / 2), y + sz, s]);
  }
  // めいろの ゴール：お米からの 点線と、🏁 と 名前の 札（遠い ゴールが 町の どこか 分かる ように）
  const gl = mazeBack() && G.guide, me = G.me;
  if (gl && gl.lat != null) {
    const q = llToW(gl.lat, gl.lng), gx = ox + q.x * T, gy = oy + q.y * T, pulse = (Math.sin(now / 260) + 1) / 2;
    if (me) {
      const p = llToW(me.lat, me.lng);
      ctx.save(); ctx.setLineDash([6 * dpr, 5 * dpr]); ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(26,26,26,.8)'; ctx.lineWidth = 5 * dpr; ctx.beginPath(); ctx.moveTo(ox + p.x * T, oy + p.y * T); ctx.lineTo(gx, gy); ctx.stroke();
      ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 2.5 * dpr; ctx.stroke(); ctx.restore();
    }
    const rr = (7 + pulse * 2) * dpr;
    ctx.lineWidth = 3 * dpr; ctx.strokeStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(gx, gy, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2 * dpr; ctx.strokeStyle = '#ffd54f'; ctx.beginPath(); ctx.arc(gx, gy, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.font = `${Math.round(18 * dpr)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#fff'; ctx.fillText('🏁', gx, gy - rr);
    const tag = goalTag(gx, gy - rr - 20 * dpr, dpr, `ゴール：${gl.name || ''}`);
    mzMap.worldGoal = [Math.round(gx), Math.round(gy), tag];   // テスト用
  } else mzMap.worldGoal = null;
  worldToastDodge(mzMap.worldGoal && mzMap.worldGoal[2]);
  // 主人公
  if (me) {
    const p = llToW(me.lat, me.lng), hs = Math.max(T * 2, 18 * dpr);
    if (riceBall.cv) drawRiceBall(ox + p.x * T, oy + p.y * T - hs * 0.8 + hs * 17.5 / 32, hs / 32, f ? 0.14 : -0.14, 1, 1, 0);   // 歩く地図と同じ 丸いお米（左右に ゆらゆら）
    else ctx.drawImage(riceSprites.ready ? riceSprites.right[f] : heroSprites.down[f], Math.round(ox + p.x * T - hs / 2), Math.round(oy + p.y * T - hs * 0.8), hs, hs);
  }
  const msg = worldState === 'building' || worldState === 'none' ? 'せかいちずを つくっています…\n（はじめの1回だけ 少し時間がかかります）'
    : worldState === 'fail' ? 'せかいちずを つくれなかった。\nしばらくして もういちど ためしてね。' : '';
  $('pxMsg').hidden = !msg;
  if (msg) $('pxMsg').textContent = msg;
}
// 当店の札：お店の本物の看板と同じ色で店名を出す（らいすぴあ・秀幸＝白地に赤い字、近藤米穀店＝クリーム地に黒い字）。
// (cx, bottom) は札の下のまん中。札の外わく [左, 上, 右, 下] を返す
// 奥行き：描いた特大の絵 [絵, 左, 上, 大きさ, 地面の高さ（画面）, 当店か]。お米が その絵より奥（北）にいるときに、お米の上に描きなおす（occludeRice）
const depthArt = [];
let giantHits = [];   // 描いた特大の絵 [左, 上, 大きさ, スポット, 絵の canvas]（描くたびに作り直す）
let poiHits = [];     // 描いた街の主な建物の特大の絵 [左, 上, 大きさ, 目印, 絵の canvas]
let shopHits = [];   // 当店の札と絵のタップ範囲 [左, 上, 右, 下, スポット]（描くたびに作り直す）
const SHOP_SIGN = { 'f-ricepia': ['らいすぴあ・秀幸', '#ffffff', '#d7262e'], 'f-kondo-beikoku': ['近藤米穀店', '#f3ead0', '#111111'] };
function drawShopTag(cx, bottom, dpr, s) {
  gbPause++;
  try { return shopTag(cx, bottom, dpr, s); } finally { gbPause--; }   // 看板も本物の色のまま
}
function shopTag(cx, bottom, dpr, s) {
  const [text, bg, fg] = SHOP_SIGN[s && s.id] || ['当店', '#d23a2e', '#ffffff'];
  const fs = Math.round(11 * dpr), pad = Math.round(3 * dpr), b = Math.max(1, Math.round(dpr));
  ctx.font = `${fs}px "DotGothic16", monospace`;
  const tw = Math.ceil(ctx.measureText(text).width), bw = tw + pad * 2, bh = fs + pad * 2;
  const x = Math.round(cx - bw / 2), y = Math.round(bottom - bh - 2 * dpr);
  ctx.fillStyle = '#000'; ctx.fillRect(x - b, y - b, bw + b * 2, bh + b * 2);
  ctx.fillStyle = bg; ctx.fillRect(x, y, bw, bh);
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x + bw / 2, y + bh / 2 + dpr * 0.5);
  return [x - b, y - b, x + bw + b, y + bh + b];
}
// せかいちずの「ゴール：…」の 札に 知らせが 重なる ときは、知らせを 上⇔下の 空いて いる ほうへ（wlow で 下。自分で 遊んで 分かった：320×568 で 遠い ゴールの 札が
// 左上の はしに 出て、「🧭 水色の 線が…」の 知らせに かくれて ゴールの 名前が 読めなかった）。いまの 位置で 重ならない 間は 動かさない（上下に ゆれない）。
// 地図を 引っぱって 札が 下げた 知らせの 下に 来たら、上が 空いて いれば 上へ もどす（Codex の 指摘）。位置は 動きの とちゅうで なく、止まった 形で はかる
// めいろでも 同じ：縁の 矢印と 道のりの 札（mzMap.arrow）に 重なる ときは 下へ（自分で 遊んで 分かった：北西の ゴールで「2.0km」が 4行の 知らせに かくれた）。
// 下へ 動かすのは、下の「めいろ、どうだった？」の 札（avoid）にも 重ならない ときだけ
// 横向きの 低い 画面では 上も 下も 札に 重なる（自分で 遊んで 分かった：740×360 で 上の ゴールの 矢印と「840m」が「📅 あしたも来ると +20pt」に かくれた）。
// そのときは 札の 横へ ずらし（wside。入る ときだけ）、それも だめなら いちばん 下（下の タブの 上に 重ねる。wfloor。知らせは タップを 通すので タブは 押せる。下の 欄の ゴールの 名前は かくさない）
const wtd = { key: '' }, WT_MODES = ['wlow', 'wside', 'wfloor'];
function worldToastDodge(tag, avoid = []) {
  const el = document.getElementById('toast');
  if (!el) return;
  if (!el.classList.contains('show') || !tag) { if (WT_MODES.some(m => el.classList.contains(m))) el.classList.remove(...WT_MODES); wtd.key = ''; return; }
  const r = cv.getBoundingClientRect(), k = r.width / cv.width, T = [r.left + tag[0] * k, r.top + tag[1] * k, r.left + tag[2] * k, r.top + tag[3] * k];
  const A = avoid.map(a => a.page ? a.page : [r.left + a[0] * k, r.top + a[1] * k, r.left + a[2] * k, r.top + a[3] * k]);   // page：画面の 座標（DOM の 札）
  const cur = WT_MODES.find(m => el.classList.contains(m)) || '', key = [T, ...A].map(q => q.map(Math.round).join()).join('/') + '|' + cur + '|' + el.textContent + '|' + innerWidth + 'x' + innerHeight;
  if (key === wtd.key) return;   // 札・知らせ・画面が かわらなければ はかりなおさない
  wtd.key = key;
  const posAt = (m, x) => {   // 知らせを m（'' は 上）に した ときの 止まった 位置（transition の ない 見えない 写しで はかる）。x：wside の 知らせの まん中
    const c = el.cloneNode(true);
    ['id', 'role', 'aria-live'].forEach(a => c.removeAttribute(a)); c.classList.remove(...WT_MODES); if (m) c.classList.add(m);
    c.style.cssText = 'transition:none;visibility:hidden' + (m === 'wside' ? `;--toast-x:${x}px` : '');
    el.parentNode.appendChild(c);
    const q = c.getBoundingClientRect(); c.remove();
    return q;
  };
  const over = (q, t) => q.left < t[2] && q.right > t[0] && q.top < t[3] && q.bottom > t[1];
  const clear = q => !over(q, T) && !A.some(a => over(q, a));
  const set = (m, x) => { el.classList.remove(...WT_MODES); if (m) el.classList.add(m); if (m === 'wside') el.style.setProperty('--toast-x', x + 'px'); };
  const top = posAt(''), here = posAt(cur, parseFloat(el.style.getPropertyValue('--toast-x')) || 0), M = 62;   // M：右上の 丸い ボタンの 列に かからない（.toast の max-width と 同じ あけ方）
  if (cur && A.some(a => over(here, a))) { set(''); return; }   // 動かした あとに 下の 札が 出て 重なった：上へ もどす（札を かくさない。Codex の 指摘）
  const out = cur === 'wside' && (here.left < M - 1 || here.right > innerWidth - M + 1);   // 横に 置いた あとに 画面が せまく なった（スマホを たてに した。--toast-x は 画素なので はみ出す。Codex の 指摘）：置きなおす
  if (!over(here, T) && !out) { if (cur && cur !== 'wlow' && clear(top)) set(''); return; }   // いまの 位置で 重ならない 間は 動かさない（ゆれない）。横・いちばん下は 上が 空いたら もどす
  const low = posAt('wlow');
  if (cur !== 'wlow' && clear(low)) { set('wlow'); return; }
  if (cur === 'wlow' && clear(top)) { set(''); return; }
  const w = top.width, R = T[2] + 8 + w / 2, L = T[0] - 8 - w / 2;   // 札の 右・左（広い ほうを 先に）
  for (const x of (T[0] + T[2]) / 2 < innerWidth / 2 ? [R, L] : [L, R]) if (x - w / 2 >= M && x + w / 2 <= innerWidth - M && clear(posAt('wside', x))) { set('wside', x); return; }
  if (clear(posAt('wfloor'))) set('wfloor');
  else if (out) set('');   // どこも 空いて いなければ 上（画面の 外には 置かない）
}
let toastDodgeOff = false;   // テスト用：知らせの よけを 止める（町名の 札が 上の 知らせの 下で 縁の 矢印を よけるかを、知らせが 下へ にげずに 見る。playtest の townToast）
function mzToastDodge(now) {   // めいろ（ふつうの 地図の 描きの おわり）：縁の 矢印の 札を 知らせが かくさない
  if (toastDodgeOff) return;
  const avoid = [];
  const rb = document.getElementById('reactBar');
  if (rb && !rb.hidden) { const b = rb.getBoundingClientRect(); avoid.push({ page: [b.left, b.top, b.right, b.bottom] }); }
  worldToastDodge(mazeOn() && G.guide && !rec ? mzMap.arrow : null, avoid);
}
function goalTag(cx, bottom, dpr, text) {   // 殿堂入りの場所・めいろの ゴールの 札：こい紺に金色の字（当店の札とは ちがう色）。札の わく [左, 上, 右, 下] を返す
  const fs = Math.round(13 * dpr), pad = Math.round(3 * dpr), b = Math.max(1, Math.round(dpr)), W = ctx.canvas.width, edge = 4 * dpr;   // 字は 13点（10点では 小さかった 2026-10-27）
  ctx.font = `${fs}px "DotGothic16", monospace`;
  // 画面の はしで 切れない ように：長い 名前は「…」で つめ、札を 内がわへ ずらす（遠い ゴールの 人の 名前と 場所が 長いと、はしで 切れた）
  let t = text;
  while (t.length > 2 && ctx.measureText(t).width + pad * 2 + b * 2 > W - edge * 2) t = t.slice(0, -2) + '…';
  const tw = Math.ceil(ctx.measureText(t).width), bw = tw + pad * 2, bh = fs + pad * 2;
  const x = Math.round(Math.max(edge + b, Math.min(W - edge - b - bw, cx - bw / 2))), y = Math.round(bottom - bh - 2 * dpr);
  ctx.fillStyle = '#ffd54f'; ctx.fillRect(x - b, y - b, bw + b * 2, bh + b * 2);
  ctx.fillStyle = '#1b2a4a'; ctx.fillRect(x, y, bw, bh);
  ctx.fillStyle = '#ffd54f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x + bw / 2, y + bh / 2 + dpr * 0.5);
  return [x - b, y - b, x + bw + b, y + bh + b];
}
function worldSpotShown(s) {
  return !!s.featured;   // 注目スポット（名所）はどの縮尺でも全部出す
}
// 地名・駅名をドラクエ風の白文字に黒ふちで。大きな地名から順に、重ならないものだけ
let areaBoxes = [];   // 地区の札（タップで地区ガイド）
function drawWorldLabels(ox, oy, T, w, h, dpr, css) {
  const minRank = css <= 3 ? 3 : css <= 6 ? 2 : 1;
  const areas = G.areas || [];
  const base = worldLabels.length ? worldLabels : areas.length ? [] : AREA_LABELS.map(([n, la, lo, r]) => { const p = llToW(la, lo); return [p.x, p.y, n, r]; });
  // 地区の札：ドラクエのウィンドウ風に「名前 めぐった数/名所の数」。寄りすぎたら名所の名前を優先して出さない
  const boxes = [];
  areaBoxes = [];
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const a of css <= 10 ? areas : []) {
    const q = llToW(a.lat, a.lng), X = ox + q.x * T, Y = oy + q.y * T, pr = G.areaProgress(a.id);
    // 文字を少なく（ふだん）：地区の名前のかわりに旗の絵と「めぐった数/名所の数」（札をタップすると地区の案内）
    const flag = SIMPLE() && window.NSG_ICONS && NSG_ICONS.canvas('flag');
    const label = flag ? `${pr.done}/${pr.total}` : `${a.name} ${pr.done}/${pr.total}`, fs = Math.round(13 * dpr), ic = flag ? fs + 4 * dpr : 0;
    ctx.font = `${fs}px "DotGothic16", monospace`;
    const bw = ctx.measureText(label).width + ic + 16 * dpr, bh = fs + 12 * dpr;
    const box = [X - bw / 2, Y - bh / 2, X + bw / 2, Y + bh / 2];
    if (box[2] < 0 || box[0] > w || box[3] < 0 || box[1] > h) continue;
    if (boxes.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    boxes.push(box); areaBoxes.push([box, a]);
    ctx.fillStyle = 'rgba(0,0,0,.8)'; ctx.fillRect(box[0], box[1], bw, bh);
    ctx.strokeStyle = pr.total && pr.done === pr.total ? '#ffd54f' : '#fff'; ctx.lineWidth = Math.max(2, Math.round(2 * dpr));
    ctx.strokeRect(box[0] + dpr, box[1] + dpr, bw - 2 * dpr, bh - 2 * dpr);
    if (flag) ctx.drawImage(flag, Math.round(box[0] + 8 * dpr), Math.round(Y - fs / 2), fs, fs);
    ctx.fillStyle = '#fff'; ctx.fillText(label, X + ic / 2, Y);
  }
  const spotNames = css >= 10 ? G.spots.filter(worldSpotShown).map(s => { const p = llToW(s.lat, s.lng); return [p.x, p.y, s.name.replace(/（.*?）/g, ''), 0]; }) : [];
  const isStation = l => l[3] === 1 && (l[4] || 'st') === 'st';
  // 町名は名所の名前より後（重なったら名所を優先）。寄ったときだけ
  const towns = css >= 10 ? base.filter(l => l[4] === 'tw') : [];
  const list = base.filter(l => l[4] !== 'tw').concat(SEA_LABELS.map(([n, la, lo, r]) => { const p = llToW(la, lo); return [p.x, p.y, n, r]; }))
    .filter(l => l[3] >= minRank)
    // 同じ駅が名所（名鉄 西尾駅など）になっている所は、名所の名前だけ出す（近くの別の名所では消さない）
    .filter(l => !isStation(l) || !spotNames.some(n => n[2].endsWith('駅') && n[2].includes(l[2].replace(/駅$/, '')) && Math.hypot(n[0] - l[0], n[1] - l[1]) < 3))
    .sort((a, b) => b[3] - a[3]).concat(spotNames, towns)
    .filter(l => !SIMPLE() || (l[3] >= 3 && l[4] !== 'rv' && l[4] !== 'tw'));   // 文字を少なく（ふだん）：市町・海の大きな名前だけ
  const SIZE = { 4: 17, 3: 14, 2: 12, 1: 11, 0: 10 };
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeStyle = '#000';
  for (const l of list) {
    const [x, y, name, rank, kind] = l, st = isStation(l), tw = kind === 'tw';
    const fs = Math.round((tw ? 10 : SIZE[rank]) * dpr), X = ox + x * T, Y = oy + y * T + (st ? fs : rank === 0 ? Math.max(T * 1.1, 10 * dpr) + fs / 2 : 0);
    if (X < -100 || Y < -40 || X > w + 100 || Y > h + 40) continue;
    ctx.font = `${fs}px "DotGothic16", monospace`;
    const bw = ctx.measureText(name).width + 6 * dpr, bh = fs + 4 * dpr;
    const box = [X - bw / 2, Y - bh / 2, X + bw / 2, Y + bh / 2];
    if (boxes.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    boxes.push(box);
    if (st && css >= 10) ctx.drawImage(spotSprites.station[0], Math.round(X - T * 0.7), Math.round(Y - fs - T * 1.2), Math.round(T * 1.4), Math.round(T * 1.4));
    ctx.lineWidth = Math.max(2, Math.round((rank >= 3 ? 4 : 3) * dpr));
    ctx.fillStyle = st ? '#ffe9a8' : kind === 'rv' ? '#bfe6ff' : tw ? '#e8e8e8' : rank === 0 ? '#ffd54f' : '#fff';
    ctx.strokeText(name, X, Y); ctx.fillText(name, X, Y);
  }
  // 左上：地図データを足している途中なら進み具合、それ以外はめぐった名所の数
  const featured = G.spots.filter(worldSpotShown);
  const flag = !worldProgress && SIMPLE() && window.NSG_ICONS && NSG_ICONS.canvas('flag');   // 文字を少なく（ふだん）：「めぐった名所」は旗の絵で
  const corner = worldProgress || (featured.length ? `${flag ? '' : 'めぐった名所 '}${featured.filter(s => G.state.visits[s.id]).length}/${featured.length}` : '');
  if (corner) {
    const fs = Math.round(12 * dpr), ic = flag ? Math.round(12 * dpr) + 4 * dpr : 0;
    ctx.font = `${fs}px "DotGothic16", monospace`; ctx.textAlign = 'left';
    const tw = ctx.measureText(corner).width;
    const y0 = 44 * dpr;   // 上には こよみ の札がある
    ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(8 * dpr, y0, tw + ic + 16 * dpr, fs + 12 * dpr);
    if (flag) ctx.drawImage(flag, 16 * dpr, y0 + 6 * dpr, fs, fs);
    ctx.fillStyle = '#fff'; ctx.fillText(corner, 16 * dpr + ic, y0 + (fs + 12 * dpr) / 2);
  }
}
function setWorld(on) {
  worldMode = on;
  document.body.classList.toggle('pxw', on);
  $('pxWorld').innerHTML = on ? ICO('feet', '👣', '歩く地図') : ICO('globe', '🌏', 'せかいちず');
  $('pxWorld').title = on ? '歩く地図にもどる' : '西尾市ぜんたいの地図';
  $('pxInfo').hidden = true;
  if (on) { wcam = worldCamStart(); worldCamFitGoal(); buildWorld(); }
  try { localStorage.setItem('nsg_world_on', on ? '1' : '0'); } catch (e) { /* noop */ }
  updatePad();
  updateHarvestBtn();   // せかいちずでは frame が早く戻るので、稲刈りのボタンをここで消す
  updateDankyuBtn();
}
$('pxWorld').addEventListener('click', () => setWorld(!worldMode));
// めいろの ゴールが あるときは、お米と ゴールが 両方 入る 大きさ・まん中で 開く（遠い ゴールが 地図の どこか 分かる ように）
function worldCamFitGoal() {
  const me = G.me, g = mazeBack() && G.guide;
  if (!me || !g || g.lat == null || !G.inPlay(me.lat, me.lng)) return;
  updateCover();
  // 見えている 所（下の 案内の 札より 上）に 入れる：小さい 画面で 南の ゴールが 札に かくれた（Codex の 指摘）
  const a = llToW(me.lat, me.lng), b = llToW(g.lat, g.lng), W = cv.clientWidth || 360, H = cv.clientHeight || 600, Hv = Math.max(120, H - cover);
  let i = WSIZES.length - 1;
  while (i > 0 && (Math.abs(a.x - b.x) * WSIZES[i] > W * 0.7 || Math.abs(a.y - b.y) * WSIZES[i] > Hv * 0.55)) i--;
  wscale = i;
  wcam = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + (H - Hv) / 2 / WSIZES[i] }; wcamOnMe = false;   // 2つの まん中を、見えている 所の まん中に
}
// 📍ボタン：せかいちずでは主人公のいる所へ戻す（歩く地図はいつも主人公が真ん中）
function centerOnMe() { if (worldMode) wcam = worldCamStart(); }
// せかいちずはドラッグで動かす
let drag = null, dragMoved = false;
cv.addEventListener('pointerdown', e => { if (!worldMode) return; drag = { x: e.clientX, y: e.clientY }; dragMoved = false; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', e => {
  if (!worldMode || !drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) { dragMoved = true; wcamOnMe = false; }
  if (!dragMoved) return;
  const T = WSIZES[wscale];
  wcam.x -= dx / T; wcam.y -= dy / T; drag = { x: e.clientX, y: e.clientY };
});
cv.addEventListener('pointerup', () => { drag = null; });

/* ---------- 操作 ---------- */
function setActive(on) {
  active = on;
  if (!on && driving) setDriving(false);   // ふつうの地図では車に乗れない
  document.body.classList.toggle('px', on);
  try { localStorage.setItem('nsg_view', on ? 'px' : 'map'); } catch (e) { /* noop */ }
  updatePad();
  cancelAnimationFrame(raf);
  if (on) { lastT = 0; raf = requestAnimationFrame(frame); }
  else { if (mzNext.hold) { mzNext.hold = false; if (G.toastFlush) G.toastFlush(); } G.invalidateMap(); if (window.NSG_GODOT) NSG_GODOT.idle(); }   // ふつうの地図のあいだは Godot を休ませる
}
function updatePad() {
  // 操作して移動なら、せかいちずでもスティックを出す（動かすと歩く地図にもどって歩く。はじめての人はせかいちずから始まるため）
  $('pxPad').hidden = !(active && G.demo);
  G.sound.scene(active && worldMode ? 'world' : 'field');   // せかいちずでは別の曲
}
// せかいちずをいちばん大きくしてさらに拡大すると歩く地図へ、歩く地図をいちばん小さくしてさらに縮小するとせかいちずへ
$('pxZoomIn').addEventListener('click', () => {
  if (!worldMode) return setScale(curScale() + 1);
  if (wscale < WSIZES.length - 1) wscale++; else { setScale(1); setWorld(false); }
});
$('pxZoomOut').addEventListener('click', () => {
  if (worldMode) { wscale = Math.max(0, wscale - 1); return; }
  if (curScale() > 1) setScale(curScale() - 1); else { wscale = WSIZES.length - 1; setWorld(true); }
});
$('pxZoom').addEventListener('click', () => {   // 🔍：押すたびに大きく。いちばん大きいと、はじめの大きさ（いちばん小さい）へ
  if (worldMode) { wscale = wscale < WSIZES.length - 1 ? wscale + 1 : 0; return; }
  setScale(curScale() < 4 ? curScale() + 1 : 1);
});
{   // せってい「夜は地図を暗く」
  const t = $('nightToggle');
  if (t) { t.checked = nightOn; t.addEventListener('change', () => { nightOn = t.checked; try { localStorage.setItem('nsg_night', nightOn ? '1' : '0'); } catch (e) { /* noop */ } dirty = true; }); }
}
{   // せってい「ゲームボーイの4色」
  const t = $('gbToggle');
  if (t) { t.checked = gbOn; t.addEventListener('change', () => { gbOn = t.checked; try { localStorage.setItem('nsg_gb', gbOn ? '1' : '0'); } catch (e) { /* noop */ } dirty = true; }); }
}
function setScale(v) {   // めいろの ときと そうでない ときで、大きさを べつべつに おぼえる
  const k = Math.min(4, Math.max(1, v)), mz = mazeOn();
  if (mz) mzScale = k; else scale = k;
  try { localStorage.setItem(mz ? 'nsg_mz_scale' : 'nsg_px_scale', k); } catch (e) { /* noop */ }
}
function curScale() { return mazeOn() ? mzScale : scale; }

// デモ：スティックで1マスずつ歩く（水と建物には入れない）
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const medashiShown = () => !!document.querySelector('.medashi:not([hidden])');   // イベントの窓（古い地図 oldmap.js・雲母石 kirara.js。どれも .medashi）が開いている
function step(dir) {   // 1マス進めたら（人に話しかけたときも）true、通れなければ false
  if (!G.demo || sightBusy() || medashiShown()) return false;   // 呼びとめられている間・田んぼのイベントの間は動けない
  G.notePlayInput();
  const t = targetTile();
  const nx = Math.floor(t.x) + DIRS[dir][0], ny = Math.floor(t.y) + DIRS[dir][1];
  facing = dir;
  if (driving) {   // 車は道（ふつうの道と大きな道）だけ。人がいたら止まる
    if (!CAR_OK.has(codeAt(nx, ny)) || npcAt(nx, ny)) return false;
    const ll = toLatLng(nx + 0.5, ny + 0.5);
    G.moveTo(ll.lat, ll.lng, 'step');   // スティックの1歩
    return true;
  }
  // 建物や水の上に立っているとき（実際の地図で、始めた場所が建物の中だったなど）は、
  // いちばん近い歩けるマスへ近づく向きにだけ動ける（出口へ向かうとき以外は、ふだんどおり通れない）
  const cx0 = Math.floor(t.x), cy0 = Math.floor(t.y);
  if (mazeOn()) { if (mzBlocked(cx0 + 0.5, cy0 + 0.5, nx + 0.5, ny + 0.5)) return false; }   // めいろ：タップ歩き・おまかせ歩きも めいろの 壁だけに 当たる（通路の 中の 建物は 通れる）
  else {
    const escape = BLOCK.has(codeAt(cx0, cy0)) && codeAt(nx, ny) !== C.X && exitDist(nx, ny) < exitDist(cx0, cy0);
    if (BLOCK.has(codeAt(nx, ny)) && !escape) return false;
  }
  const who = npcAt(nx, ny);
  if (who) { if ($('pxInfo').hidden) openNpc(who); return true; }   // 人にぶつかったら話しかける（ドラクエ風）
  const ll = toLatLng(nx + 0.5, ny + 0.5);
  G.moveTo(ll.lat, ll.lng, 'step');   // スティックの1歩
  sightCheck();
  critterStep(nx, ny);
  return true;
}
// かたむけて転がす（操作して移動。はじめはオン）：ひと粒のお米が、スマホを傾けた向き（ない端末はスティック・矢印キー）へ、勢いをつけて ころころ転がる。
// ・押すのをやめても すぐには止まらない（ころがり抵抗で ゆっくりになる）。建物・水には入れず、当たると少し はね返る。人にぶつかると話しかける
// ・新しいマスに入るたびに、1歩と同じこと（呼びとめ・生きもの・チェックインの範囲など）が起きる。位置は 少し動くたびに game.js へ（moveTo の 'step'）
// ・📱 ボタンで オン・オフ（端末に覚える）。タップで歩く・車は いままでどおり
let rollOn = (() => { try {
  // 地図が めいろに なって「📱 転がす」の 切りかえを はずした：前に 切っていた人も 1回だけ 転がすに もどす（もう 切りかえられないので）
  if (!localStorage.getItem('nsg_roll_v2')) { localStorage.setItem('nsg_roll_v2', '1'); localStorage.setItem('nsg_roll', '1'); }
  return localStorage.getItem('nsg_roll') !== '0';
} catch (e) { return true; } })();
const rp = { x: null, y: null, vx: 0, vy: 0, sent: null, tile: '', bump: 0 };
const npcBump = { id: '', x: 0, y: 0, met: new Set(), gkey: '', carry: null };   // さいごに こつんと ぶつかって 話しかけた 人（はなれるまで もう 話しかけない）。met：めいろで いまの ゴールへ 向かう 間に あいさつした 人
function npcMetSync() {   // めいろの あいさつ ずみ：ゴールが かわったら わすれる・ゴールに 着いて 話した 人は 次の ゴールへ もちこす
  // ゴールが かわった すぐ あと（mzRoute は こまの おわりに 回る：前の マスで 次の ゴールが 決まった など）でも、あいさつ ずみを いまの ゴールで おぼえる
  // （前の ゴールで おぼえると、こまの おわりに ゴールが そろった あと 消えて、はなれて もどると 同じ 話が また 開いた）
  if (mazeOn()) mzRoute(performance.now());
  if (npcBump.gkey !== mzRt.gkey) { npcBump.gkey = mzRt.gkey; npcBump.met.clear(); }
  { const c = npcBump.carry; if (c && c.to) { if (c.to === mzRt.gkey) npcBump.met.add(c.id); npcBump.carry = null; } }   // ゴールに 着いて 話した 人は、次の ゴールへ 向かう 間も あいさつ ずみ（mzRoute で 決めた 次の ゴールだけ）。ゴールが かわった ことを この マスの 見はりが 見のがしても（前の ゴールと 同じ 次の ゴール）のせる
}
// 人と 話して あいさつ ずみに する（こつん・呼びとめ）：同じ 人には、いちど はなれる（3マス）まで もう 話しかけない。めいろでは いまの ゴールへ 向かう 間も
// 話で 次の ゴールが 決まった（ゴールの 人に こつんと 着いた・呼びとめられた・ゴールが ない ときに 話した）ら、着いて 話した ときと 同じく 次の ゴールへ もちこす
// （ゴールが かわると あいさつ ずみが 消えて、はなれて もどると 同じ 話が また 開いていた）
function npcGreet(n, tx, ty) {
  if (mazeOn()) npcMetSync();
  const g0 = G.state.guide;
  npcBump.id = n.id; npcBump.x = tx; npcBump.y = ty; if (mazeOn()) npcBump.met.add(n.id); openNpc(n);
  const g1 = G.state.guide;
  if (mazeOn() && g1 && g1 !== g0 && g1.byId === n.id) npcBump.carry = { id: n.id, from: mzRt.gkey };
}
const rk = { up: 0, down: 0, left: 0, right: 0 };
const tiltG = { x: 0, y: 0, on: false, base: null, n: 0, asked: false, retry: false, walkTold: false };
const TILT_DEGS = [9, 12, 16];   // 傾きの 強さ（せってい nsg_tilt）：びんかん・ふつう（はじめ）・やさしい。この 角度で いちばん強く。運営者の声「傾き感度上げる」（2026-10-31、2回目）で さらに びんかん側へ（前回 12・16・21、もと 15・20・26。旧の 値で 覚えていた 人は 同じ 段の 新しい 値へ）
tiltG.deg = (() => { try { const v = +localStorage.getItem('nsg_tilt'); let m; if (localStorage.getItem('nsg_tilt_v') === '2') m = TILT_DEGS.includes(v) ? v : 12; else { const MIG = { 15: 9, 20: 12, 26: 16, 12: 9, 16: 12, 21: 16 }; m = MIG[v] || 12; } try { localStorage.setItem('nsg_tilt', String(m)); localStorage.setItem('nsg_tilt_v', '2'); } catch (e) { /* noop */ } return m; } catch (e) { return 12; } })();   // 旧い 値（12・16 は 前の 段と 新しい 段で 重なる）ので、段の 移し替えは nsg_tilt_v=2 の 目印が あるときだけ しない
if ($('tiltSens')) { $('tiltSens').value = String(tiltG.deg); $('tiltSens').addEventListener('change', e => { const v = +e.target.value; if (!TILT_DEGS.includes(v)) return; tiltG.deg = v; try { localStorage.setItem('nsg_tilt', String(v)); localStorage.setItem('nsg_tilt_v', '2'); } catch (er) { /* noop */ } }); }
let mzHitStop = 0;   // ヒットストップ：強く 当たった 瞬間、お米を ほんの少し 止める（手ごたえ。画面と ★の 時計は 止めない）
const MZ_HIT_STOP = 5, MZ_HIT_STOP_MS = 45;   // これより 速く 当たったら（マス/秒）・止める 長さ
const ROLL_ACC = 13, ROLL_MAX = 8, ROLL_BOUNCE = 0.42, ROLL_STICK = 0.6;   // マス/秒²・いちばん速い速さ（下り坂でも これまで）・はね返り・これより おそく当たったら はねずに ぴたっと止まる
// へり方：ころがり抵抗（いつも同じだけ へる。止まる所で ぴたっと止まる）＋ 速さに比べて へる分 ＋ 空気（速いほど強い。いちばん速い速さが しぜんに決まる：道で 約6.3マス/秒）
const ROLL_CRR = 0.9, ROLL_LIN = 0.35, ROLL_AIR = 0.2;
// 運営者の声「傾けた時の反応をよく」：静かな 中心は 残し、少しの 傾きでも 抵抗を こえる。
// 最大の 力・速さ・ころがり抵抗は 変えず、中央の 手ぶれは 力を 0 に もどす。
// 運営者の声「転がりの感度を上げる」（2026-10-31）：中心の 無力は 0.08→0.05 に せばめ、小さい 傾きの 力は 0.45→0.55 に。
// あわせて ROLL_ACC（9→11）と 傾きの 角度（TILT_DEGS）も びんかん側へ。ころがり抵抗と ROLL_MAX は そのまま。
// 運営者の声「傾き感度上げる」（2026-10-31、2回目）：無力は 0.05→0.03 に せばめ、小さい 傾きの 力は 0.55→0.65 に。ROLL_ACC は 11→13、TILT_DEGS は 12・16・21→9・12・16。
function tiltCurve(degrees) {
  const v = Math.min(1, Math.abs(degrees) / tiltG.deg);
  if (v <= 0.03) return 0;
  const force = v < 0.25 ? (v - 0.03) / 0.22 * 0.65 : 0.65 + (v - 0.25) / 0.75 * 0.35;
  return Math.sign(degrees) * force;
}
const tiltDelta = (a, b) => ((a - b + 540) % 360) - 180;
window.addEventListener('deviceorientation', e => {
  if (!Number.isFinite(e.gamma) || !Number.isFinite(e.beta) || document.hidden) return;
  const ang = ((screen.orientation ? screen.orientation.angle : window.orientation) || 0) % 360;
  // 回転した あとは 古い 軸の 中心・いきおいを 持ちこさない（180度も 対応）。
  if (tiltG.angle !== ang) { tiltReset(); tiltG.angle = ang; rp.vx = rp.vy = 0; }
  tiltG.on = true;
  let lr = e.gamma, fb = e.beta;
  if (ang === 90 || ang === -270) { lr = e.beta; fb = -e.gamma; }
  else if (ang === -90 || ang === 270) { lr = -e.beta; fb = e.gamma; }
  else if (Math.abs(ang) === 180) { lr = -e.gamma; fb = -e.beta; }
  const te = e.timeStamp || performance.now();
  if (!tiltG.base) { tiltG.base = { lr, fb }; tiltG.n = 1; tiltG.t = te; return; }
  // はじめの 2回だけ 平均（8回 待って 動き出しの 傾きまで 中心に まぜていた）。
  if (tiltG.n < 2) {
    tiltG.base.lr += tiltDelta(lr, tiltG.base.lr) / 2; tiltG.base.fb += tiltDelta(fb, tiltG.base.fb) / 2;
    tiltG.n++; tiltG.t = te; return;
  }
  const x = tiltCurve(tiltDelta(lr, tiltG.base.lr)), y = tiltCurve(tiltDelta(fb, tiltG.base.fb));
  const k = 1 - Math.exp(-Math.min(0.1, Math.max(0.004, (te - tiltG.t) / 1000)) / 0.022);
  tiltG.t = te;
  tiltG.x = x === 0 ? 0 : tiltG.x + (x - tiltG.x) * k;
  tiltG.y = y === 0 ? 0 : tiltG.y + (y - tiltG.y) * k;
  if (!G.demo && rollOn && !tiltG.walkTold && Math.hypot(tiltG.x, tiltG.y) > 0.7 && active) {
    tiltG.walkTold = true;
    G.toast('🍚 あるいて移動では、歩いた所へ お米が転がるよ。傾けて遊ぶのは「操作して遊ぶ」で');
  }
});
function tiltReset() { tiltG.base = null; tiltG.n = 0; tiltG.t = 0; tiltG.x = tiltG.y = 0; }
function tiltNeedsPermission() { return !!(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function'); }
function tiltAsk(event) {   // 本当の タップで 1回だけ（はじめの画面の「あそぶ」・地図のタップ・めいろを開くボタンなど）。拒否・例外でも タップや 矢印キーで 遊べる。
  if (!event || !event.isTrusted || tiltG.asked || !tiltNeedsPermission()) return;   // userActivation が ない 端末でも、自動表示・合成クリックからは 求めない
  tiltG.asked = true; tiltG.retry = false;
  const fallback = () => G.toast('地図を タップして 遊べるよ（矢印キーでも）');
  const failed = e => { if (e && e.name === 'NotAllowedError') { tiltG.asked = false; tiltG.retry = true; } fallback(); };   // 一時的に 操作と 認められなかったときは、次の 本当の タップで 再試行。denied では 繰り返さない
  try { Promise.resolve(DeviceOrientationEvent.requestPermission()).then(r => { if (r === 'granted') tiltReset(); else fallback(); }, failed); }
  catch (e) { failed(e); }
}
// 「あそぶ」ボタン（playReady）は廃止（運営者の声 2026-10-31）。傾きの許可は、最初に地図をタップしたときに聞く（下の 地図タップの処理）
document.addEventListener('visibilitychange', () => { tiltReset(); rp.vx = rp.vy = 0; });
window.addEventListener('pageshow', () => { tiltReset(); rp.vx = rp.vy = 0; });
window.addEventListener('orientationchange', () => { tiltReset(); rp.vx = rp.vy = 0; });
if (screen.orientation) screen.orientation.addEventListener('change', () => { tiltReset(); rp.vx = rp.vy = 0; });
document.addEventListener('keyup', e => { const k = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key]; if (k) rk[k] = 0; });
window.addEventListener('blur', () => { for (const k in rk) rk[k] = 0; tiltReset(); rp.vx = rp.vy = 0; });
const rollBlocked = (x, y) => { const c = codeAt(Math.floor(x), Math.floor(y)); return BLOCK.has(c) && c !== C.X; };
/* ---------- 地図の めいろ（傾けて 転がすときの メインの 遊び） ---------- */
// 運営者の指示「転がす迷路はミニゲームではなくメインのゲームに」「歩く地図を めいろに」（2026-10-23）
// ・めいろの 1マス＝地図の 3×3マス。道が 2つ以上ある マス（公園・境内も）が 通路、ない マスは 壁の かたまり、水の マスも 通れない
// ・通路どうしは、さかいを 本当の 道が またいでいる ときだけ 通れる。そのうえで 32×32マスの 区域ごとに 穴ほりで 1本道の 木を えらび、
//   のこりは 細い壁で ふさぐ（ぬけ道 12%）。区域の さかいは 道が つながれば いつも 通れる（区域どうしは かならず つながる）
// ・壁が きくのは 操作して遊ぶ で 転がしている ときだけ（あるいて遊ぶ・車・せかいちず では きかない）。
//   地図が まだ 読めていない 区域と、壁の かたまりの 中から 出るときは 壁なし（とじこめない）。通路の 中の 建物の マスには ぶつからない
const MZ_K = 3, MZ_R = 32, MZ_BRAID = 0.12, MZ_PATH = new Set([C.R, C.H, C.D]);
const mzAreas = new Map();
function mazeBack() { try { return !!(G.demo && rollOn && !driving); } catch (e) { return false; } }   // せかいちずから 歩く地図に もどると めいろ（せかいちずに めいろの ゴールを 出す）
function mazeOn() { try { return !!(G.demo && rollOn && !driving && !worldMode); } catch (e) { return false; } }   // 読みこみの とちゅう（変数が まだ ない）なら めいろに しない
function mzArea(cx, cy) {   // めいろの マス (cx, cy) を ふくむ 区域（読めていなければ null）
  const rx = Math.floor(cx / MZ_R), ry = Math.floor(cy / MZ_R), key = rx + '_' + ry;
  let a = mzAreas.get(key);
  if (a) return a;
  const t0x = rx * MZ_R * MZ_K - MZ_K, t0y = ry * MZ_R * MZ_K - MZ_K, t1x = (rx + 1) * MZ_R * MZ_K + MZ_K, t1y = (ry + 1) * MZ_R * MZ_K + MZ_K;
  let ready = true;
  for (let gy = Math.floor(t0y / CHUNK); gy <= Math.floor((t1y - 1) / CHUNK); gy++) for (let gx = Math.floor(t0x / CHUNK); gx <= Math.floor((t1x - 1) / CHUNK); gx++) {
    const st = chunkState(gx, gy);
    if (st !== 'ok' && st !== 'out') { ready = false; ensureChunk(gx, gy); }   // 区域に いる 区画を 読みに いく（見えている 所の 読みこみだけでは 足りない ことがある）
  }
  if (!ready) return null;
  a = mzBuild(rx, ry); mzAreas.set(key, a);
  return a;
}
function mzCell(cx, cy) {   // マスの 種類 0 壁・1 通路・2 水 と、公園・境内の 広場か（その マスの 道で ない 地図の マスも 道あつかい）
  let road = 0, water = 0, park = 0;
  for (let j = 0; j < MZ_K; j++) for (let i = 0; i < MZ_K; i++) {
    const c = codeAt(cx * MZ_K + i, cy * MZ_K + j);
    if (MZ_PATH.has(c)) road++; else if (c === C.A) water++; else if (c === C.P || c === C.J) park++;
  }
  return { t: water >= 5 && road < 1 ? 2 : road >= 1 || park >= 7 ? 1 : 0, plaza: park >= 7 && road < 1 };   // 道が 1つでも あれば 通路（ななめの 道で 通路が とぎれて はなれ島に ならないように）
}
function mzLinkRaw(ca, cb, ax, ay, dx, dy) {   // となりの 通路へ、さかいを 道が またいでいるか（ca・cb は mzCell）
  if (ca.t !== 1 || cb.t !== 1) return false;
  const kind = (tx, ty, cell) => { const c = codeAt(tx, ty); return MZ_PATH.has(c) ? 1 : c === C.A ? 2 : cell.plaza ? 1 : 0; };
  for (let k = 0; k < MZ_K; k++) {
    const px = dx ? ax * MZ_K + MZ_K - 1 : ax * MZ_K + k, py = dx ? ay * MZ_K + k : ay * MZ_K + MZ_K - 1;
    const kp = kind(px, py, ca), kq = kind(px + dx, py + dy, cb);
    if ((kp === 1 || kq === 1) && kp && kq) return true;
  }
  return false;
}
function mzBuild(rx, ry) {   // 区域の マスの 種類と、穴ほりで えらんだ 通れる さかい（er：右・ed：下）
  const N = MZ_R, x0 = rx * N, y0 = ry * N, cells = [], t = new Uint8Array(N * N), er = new Uint8Array(N * N), ed = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const c = mzCell(x0 + i, y0 + j); cells.push(c); t[j * N + i] = c.t; }
  const cand = [], nb = new Map();
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    if (i + 1 < N && mzLinkRaw(cells[k], cells[k + 1], x0 + i, y0 + j, 1, 0)) cand.push([k, k + 1, er]);
    if (j + 1 < N && mzLinkRaw(cells[k], cells[k + N], x0 + i, y0 + j, 0, 1)) cand.push([k, k + N, ed]);
  }
  for (const e of cand) for (const [u, v] of [[e[0], e[1]], [e[1], e[0]]]) { if (!nb.has(u)) nb.set(u, []); nb.get(u).push([v, e]); }
  let sd = ((rx * 73856093) ^ (ry * 19349663) ^ 0x5bd1e995) >>> 0 || 1;   // 区域ごとに きまる（だれでも 同じ めいろ）
  const rn = () => { sd ^= sd << 13; sd >>>= 0; sd ^= sd >>> 17; sd ^= sd << 5; sd >>>= 0; return sd / 4294967296; };
  const seen = new Uint8Array(N * N), tree = new Set();
  for (const s0 of nb.keys()) {
    if (seen[s0]) continue;
    const stack = [s0]; seen[s0] = 1;
    while (stack.length) {
      const u = stack[stack.length - 1], opts = nb.get(u).filter(([v]) => !seen[v]);
      if (!opts.length) { stack.pop(); continue; }
      const [v, e] = opts[(rn() * opts.length) | 0];
      seen[v] = 1; tree.add(e); e[2][Math.min(e[0], e[1])] = 1; stack.push(v);
    }
  }
  for (const e of cand) if (!tree.has(e) && rn() < MZ_BRAID) e[2][Math.min(e[0], e[1])] = 1;
  // はなれ島を つなぐ：道の 絵が マスの さかいで そろわず、どこにも つながらない 通路の かたまりが できる（名所に とどかない）。
  // となりあう 通路どうしの さかいを、ちがう かたまりを つなぐ ときだけ あける（1本ずつ。迷路の 形は ほぼ そのまま）
  const par = new Int32Array(N * N).map((_, i) => i), find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  for (let k = 0; k < N * N; k++) { if (er[k] && t[k] === 1 && t[k + 1] === 1) par[find(k)] = find(k + 1); if (ed[k] && t[k] === 1 && k + N < N * N && t[k + N] === 1) par[find(k)] = find(k + N); }
  const extra = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    if (t[k] !== 1) continue;
    if (i + 1 < N && t[k + 1] === 1 && !er[k]) extra.push([k, k + 1, er]);
    if (j + 1 < N && t[k + N] === 1 && !ed[k]) extra.push([k, k + N, ed]);
  }
  for (let k = extra.length - 1; k > 0; k--) { const m = (rn() * (k + 1)) | 0; [extra[k], extra[m]] = [extra[m], extra[k]]; }
  for (const [u, v, arr] of extra) { const a = find(u), b = find(v); if (a !== b) { par[a] = b; arr[u] = 1; } }
  // ななめに かどだけ ふれあう 通路どうし（ななめの 道は 上下左右では つながらず、はなれ島に なって 名所に とどかない：長圓寺・大浜熊野大神社）は、
  // まわりの 壁の マス 1つを 通路に して つなぐ（水の マスは 使わない）
  for (let j = 0; j + 1 < N; j++) for (let i = 0; i < N; i++) for (const sx of [1, -1]) {
    const i2 = i + sx;
    if (i2 < 0 || i2 >= N) continue;
    const k = j * N + i, m = (j + 1) * N + i2;
    if (t[k] !== 1 || t[m] !== 1 || find(k) === find(m)) continue;
    for (const c of [j * N + i2, (j + 1) * N + i]) {
      if (t[c] !== 0) continue;
      t[c] = 1;
      for (const [u, v] of [[k, c], [m, c]]) { (Math.abs(u - v) === 1 ? er : ed)[Math.min(u, v)] = 1; par[find(u)] = find(v); }
      break;
    }
  }
  return { rx, ry, x0, y0, cells, t, er, ed };
}
// 名所への 参道：道の ない 区画の 中の 名所にも とどくように、名所の マスから いちばん近い 通路まで（5マスまで）を「参道」に して 入れる。
// 参道は 通路と 参道から だけ 入れる（壁の かたまりの 中を 自由に 通りぬけない）。区域が 読めてから つくる（まだなら あとで）
let mzSpotV = -1, mzSpotCells = new Set(), mzSpotTodo = [];
function mzSpotCell(cx, cy) { return mzSpotCells.has(cx + ',' + cy); }
let mzSpotT = 0;
function mzSpotUpdate(now) {
  if (now - mzSpotT < 500) return;   // 0.5秒ごと
  mzSpotT = now;
  if (G.spotsVersion !== mzSpotV) { mzSpotV = G.spotsVersion; mzSpotCells = new Set(); mzSpotTodo = (G.spots || []).map(sp => { const t = toTile(sp.lat, sp.lng); return [Math.floor(t.x / MZ_K), Math.floor(t.y / MZ_K)]; }); }
  if (!mzSpotTodo.length || rp.x === null) return;
  const rc = Math.floor(rp.x / MZ_K), rr = Math.floor(rp.y / MZ_K), later = [];
  for (const [sx, sy] of mzSpotTodo) {
    if (Math.abs(sx - rc) > 60 || Math.abs(sy - rr) > 60) { later.push([sx, sy]); continue; }   // 近くの 名所だけ（区域を 読みに いきすぎない）
    const t0 = mzType(sx, sy);
    if (t0 < 0) { later.push([sx, sy]); continue; }
    if (t0 === 1) continue;
    const from = new Map([[sx + ',' + sy, null]]), q = [[sx, sy, 0]];
    let end = null, wait = false;
    for (let h = 0; h < q.length && !end; h++) {
      const [x, y, d] = q[h];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
        if (from.has(k)) continue;
        const ty = mzType(nx, ny);
        if (ty < 0) { wait = true; continue; }
        from.set(k, x + ',' + y);
        if (ty === 1) { end = x + ',' + y; break; }
        if (d < 5) q.push([nx, ny, d + 1]);
      }
    }
    if (!end && wait) { later.push([sx, sy]); continue; }
    for (let k = end; k; k = from.get(k)) mzSpotCells.add(k);   // 名所の マス から 通路の となり まで
  }
  mzSpotTodo = later;
}
function mzType(cx, cy) { const a = mzArea(cx, cy); return a ? a.t[(cy - a.y0) * MZ_R + cx - a.x0] : -1; }   // -1：まだ 読めていない
function mzOpen(cx, cy, dx, dy) {   // (cx, cy) から となりの マスへ 転がって 行けるか
  const A = mzArea(cx, cy), B = mzArea(cx + dx, cy + dy);
  if (!A || !B) return true;
  const ia = (cy - A.y0) * MZ_R + cx - A.x0, ib = (cy + dy - B.y0) * MZ_R + cx + dx - B.x0;
  const sa = mzSpotCell(cx, cy), sb = mzSpotCell(cx + dx, cy + dy);
  if (A.t[ia] !== 1 && !sa) return B.t[ib] === 1 || sb;   // 壁の かたまりの 中（始めた 所が 建物の 中 など）からは 通路・参道へ だけ 出られる（かたまりの 中を 通りぬけない。ふつうは mzSnap で 通路へ もどす）
  if (B.t[ib] !== 1) return sb;   // 参道には 通路・参道から 入れる。ほかの 壁の かたまりには 入れない
  if (A.t[ia] !== 1) return true;   // 参道から 通路へ
  if (A === B) return (dx ? A.er : A.ed)[dx + dy > 0 ? ia : ib] === 1 || mzGate.has(mzGateKey(cx, cy, dx, dy));
  return true;   // 区域の さかい：となりあう 通路どうしは いつも 通れる（区域の 中の はなれ島も さかいで つながる）
}
// ゴールの 戸：ゴールの すぐ そば（まっすぐ 3マス以内）まで 来たのに、道のりが まっすぐの 4倍＋8マスより 長い ときは、
// 本当の 道が つながって いる 生け垣を 3か所まで あけて 近道に する（自分で 遊んで 分かった：らいすぴあの 店員さんが 生け垣の 向こう
// 70m に 見えて いるのに、道のりは 900m。2回 遊んで 2回とも そこで 1分 以上 止まった）。あけた 戸は とじない（足もとの 道すじが かわらない ように）
const mzGate = new Map(), MZ_GATE_NEAR = 3, MZ_GATE_MAX = 3;
mzGate.v = 0;
function mzGateKey(cx, cy, dx, dy) { return dx + dy < 0 ? mzGateKey(cx + dx, cy + dy, -dx, -dy) : cx + ',' + cy + (dx ? 'r' : 'd'); }
function mzGateTry(a, b, gc, gr, inReach, L) {   // 戸を あけたら true
  const man = Math.abs(a - gc) + Math.abs(b - gr);
  if (Math.max(Math.abs(a - gc), Math.abs(b - gr)) > MZ_GATE_NEAR || L - 1 < man * 4 + 8) return false;
  const R = MZ_GATE_NEAR + 2, x0 = gc - R, y0 = gr - R, W = 2 * R + 1, N = W * W;
  const road = (x, y, dx, dy) => {   // 本当の 道が さかいを またぐ 通路どうし（いまは 生け垣で とじて いても）
    if (mzType(x, y) !== 1 || mzType(x + dx, y + dy) !== 1) return false;
    const lx = dx + dy < 0 ? x + dx : x, ly = dx + dy < 0 ? y + dy : y;
    return mzLinkRaw(mzCell(lx, ly), mzCell(lx + Math.abs(dx), ly + Math.abs(dy)), lx, ly, Math.abs(dx), Math.abs(dy));
  };
  // 戸の 数の 上限を 1 から ふやしながら、上限 以内で いちばん 歩数の 少ない 道（状態＝マス×あけた 戸の 数）。歩数が まっすぐの 2倍＋4 以内なら きめる
  // （戸と 歩数を 重みに まぜて 1本 だけ えらぶと、戸が 多すぎる 道が えらばれ、上限 以内の 別の 道を 見のがした。Codex の 指摘）
  const s0 = (b - y0) * W + a - x0, G1 = MZ_GATE_MAX + 1;
  let opens = null;
  for (let lim = 1; lim <= MZ_GATE_MAX && !opens; lim++) {
    const from = new Int32Array(N * G1).fill(-2), q = [s0 * G1];
    from[s0 * G1] = -1;
    let end = -1;
    for (let h = 0; h < q.length && end < 0; h++) {   // 歩数の じゅん
      const st = q[h], u = st / G1 | 0, g = st % G1, x = u % W + x0, y = (u / W | 0) + y0;
      if (inReach(x, y)) { end = st; break; }
      for (const [dx, dy] of MZ_DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < x0 || nx >= x0 + W || ny < y0 || ny >= y0 + W) continue;
        const ng = mzOpen(x, y, dx, dy) ? g : g < lim && road(x, y, dx, dy) ? g + 1 : -1, v = ((ny - y0) * W + nx - x0) * G1 + ng;
        if (ng < 0 || from[v] !== -2) continue;
        from[v] = st; q.push(v);
      }
    }
    if (end < 0) continue;
    const ks = [];
    let steps = 0;
    for (let v = end; from[v] >= 0; v = from[v]) {
      steps++;
      const u = from[v];
      if (v % G1 === u % G1) continue;   // 戸を あけずに 通った
      const ui = u / G1 | 0, vi = v / G1 | 0, x = ui % W + x0, y = (ui / W | 0) + y0;
      ks.push(mzGateKey(x, y, vi % W + x0 - x, (vi / W | 0) + y0 - y));
    }
    if (ks.length && steps <= man * 2 + 4) opens = ks;
  }
  if (!opens) return false;
  for (const k of opens) mzGate.set(k, performance.now());
  while (mzGate.size > 24) mzGate.delete(mzGate.keys().next().value);   // ふるい 戸から（遠くに なって いる）
  mzGate.v++;
  chordSound(); floatText('🚪 生け垣の 戸が ひらいた！ ゴールは すぐ そこ');
  return true;
}
function mzBlocked(fx, fy, x, y) {   // (fx, fy) から (x, y)（地図の マス）へ 動くと 壁に 当たるか
  const a = Math.floor(fx / MZ_K), b = Math.floor(fy / MZ_K), c = Math.floor(x / MZ_K), d = Math.floor(y / MZ_K), dx = c - a, dy = d - b;
  if (!dx && !dy) return false;
  if (Math.abs(dx) + Math.abs(dy) === 1) return !mzOpen(a, b, dx, dy);
  if (Math.abs(dx) === 1 && Math.abs(dy) === 1) return !((mzOpen(a, b, dx, 0) && mzOpen(a + dx, b, 0, dy)) || (mzOpen(a, b, 0, dy) && mzOpen(a, b + dy, dx, 0)));
  return false;
}
// ゆるい めいろ（2026-10-26 店主「直角ではなく ゆるい構造に。西尾の町に合った迷路」）
// ・どこが 通れるかは これまでと 同じ（マスと、穴ほりで えらんだ さかい）。かわるのは 通路の 形：通れる さかいで つながる マスの まん中を
//   なめらかな 線で むすんだ「道すじ」に して、お米の まん中は 道すじから MZ_TUBE マス以内だけ 動ける（筒の 中を 転がる）
// ・2つに つながる マスは 2次の B スプライン（さかいの まん中から まん中へ、マスの まん中に 引かれる 線）：直角の 曲がり角は まるい カーブに、
//   階段の ような ななめの 道（すじかいの 道・川ぞいの 道）は ななめの 一本道に なる。3つ以上の 分かれ道は まっすぐの 枝と、となりあう 枝の あいだの カーブ
// ・道すじは 通路の マスの 中に おさまる（壁の マスへ はみ出さない）ので、マスで 数える しくみ（道しるべ・カラス・米つぶ・歩数）は そのまま
const MZ_TUBE = 0.45, MZ_HALF = 1.1, MZ_HEDGE = 0.5, MZ_RUB = 0.15;
const MZ_SOFT_K = 300, MZ_SOFT_C = 6, MZ_SOFT_MAX = 0.4, MZ_DENT_K = 80, MZ_DENT_C = 3.5;   // 10/28 店主「ふわふわした ぽよんぽよんする 迷路」：ねばりを へらして よく はね返る・へこみも ぷるぷる 長めに（ばねの 強さ K は かえない：やわらかく すると ふかく しずみ、となりの 通路へ ぬける）
// （もとは K 300・C 12・DENT_C 5＝はね返り 3〜4割）   // やわらかい 生け垣：ばねの 強さ（速く 当たると 約0.2〜0.3マス めりこむ）・めりこむ ときの ねばり（はね返りは 半分ほど）・のびる 限り
// MZ_DENT_K・C：へこみの 絵の ばね（運営者「当たると 伸びて 跳ね返る」を もっと 分かりやすく：これまでは 0.1秒で もどり 目に 見えなかった。0.4秒ほど のびて、2〜3回 ぷるぷる ゆれて もどる）
const mzSoft = { on: false, x: 0, y: 0, ux: 0, uy: 0, pen: 0, dent: 0, dv: 0, vin: 0, boings: 0 };   // dent：生け垣の へこみの 絵（ばねで ついていき、はなれると ぷるんと もどる）   // MZ_RUB：生け垣に こすれる ときの すべりにくさ   // お米の まん中が 動ける はば・通路の 見た目の 半分の はば（お米の 半分 0.65 を たす）・生け垣の あつさ（地図の マス）
const mzCurveC = { key: '', m: new Map() };
function mzCurves(cx, cy) {   // マスが 受けもつ 道すじ（地図の マスの 座標の 点の 列の 配列）。区域が 読めて いなければ null
  const key = mzAreas.size + ':' + mzSpotCells.size + ':' + mzSpotV + ':' + mzGate.v;   // 区域が 読めた・参道が ふえた・ゴールの 戸が ひらいた ときは つくりなおす（となりの マスへ 通れるかが かわる）
  if (mzCurveC.key !== key || mzCurveC.m.size > 20000) { mzCurveC.key = key; mzCurveC.m.clear(); }
  const k = cx + ',' + cy;
  let out = mzCurveC.m.get(k);
  if (out) return out;
  const ty = mzType(cx, cy);
  if (ty < 0) return null;
  out = [];
  if (ty === 1 || mzSpotCell(cx, cy)) {
    const px = (cx + 0.5) * MZ_K, py = (cy + 0.5) * MZ_K, h = MZ_K / 2;
    const arms = MZ_DIRS.filter(([dx, dy]) => mzOpen(cx, cy, dx, dy)).map(([dx, dy]) => [px + dx * h, py + dy * h, dx, dy]);   // 通れる さかいの まん中
    const bez = (a, b) => { const q = []; for (let i = 0; i <= 6; i++) { const t = i / 6, s = 1 - t; q.push([s * s * a[0] + 2 * s * t * px + t * t * b[0], s * s * a[1] + 2 * s * t * py + t * t * b[1]]); } return q; };
    if (!arms.length) out.push([[px - 0.01, py], [px + 0.01, py]]);   // どこにも 通れない 通路：まるい 広場
    else if (arms.length === 2) out.push(bez(arms[0], arms[1]));
    else {
      for (const a of arms) out.push([[px, py], [a[0], a[1]]]);   // 行き止まり・分かれ道：まん中から さかいへ
      if (arms.length > 2) for (let i = 0; i < arms.length; i++) for (let j = i + 1; j < arms.length; j++) if (!(arms[i][2] * arms[j][2] + arms[i][3] * arms[j][3])) out.push(bez(arms[i], arms[j]));   // 分かれ道の 角も まるく
    }
  }
  mzCurveC.m.set(k, out);
  return out;
}
function mzNear(x, y) {   // (x, y) に いちばん近い 道すじの 点（まわり 3×3 マスから）。お米の いる マスが 読めて いなければ null（壁なし）
  const a = Math.floor(x / MZ_K), b = Math.floor(y / MZ_K);
  if (!mzCurves(a, b)) return null;
  let bd = Infinity, bx = 0, by = 0;
  for (let cy = b - 1; cy <= b + 1; cy++) for (let cx = a - 1; cx <= a + 1; cx++) {
    const cs = mzCurves(cx, cy);
    if (!cs) continue;   // となりの 区域が まだ 読めて いない マスは とばす（1つでも 読めて いないと 壁が なくなって、とじた さかいを 通りぬけた）
    for (const q of cs) for (let i = 1; i < q.length; i++) {
      const x0 = q[i - 1][0], y0 = q[i - 1][1], dx = q[i][0] - x0, dy = q[i][1] - y0, l = dx * dx + dy * dy;
      const t = l ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l)) : 0, qx = x0 + dx * t, qy = y0 + dy * t, d = (x - qx) * (x - qx) + (y - qy) * (y - qy);
      if (d < bd) { bd = d; bx = qx; by = qy; }
    }
  }
  return bd < Infinity ? { d: Math.sqrt(bd), x: bx, y: by } : null;
}
const mzOnC = { key: '', m: new Map() };
function mzOn(x, y) {   // (x, y)（地図の マス）を いちばん近い 道すじの 上へ（印・足あとを 道すじに のせる）。読めて いなければ そのまま
  if (mzOnC.key !== mzCurveC.key || mzOnC.m.size > 20000) { mzOnC.key = mzCurveC.key; mzOnC.m.clear(); }
  const k = Math.round(x * 6) + ',' + Math.round(y * 6);
  let p = mzOnC.m.get(k);
  if (!p) { const q = mzNear(x, y); if (!q) return [x, y]; p = [q.x, q.y]; mzOnC.m.set(k, p); }
  return p;
}
// 道しるべ：お米の マスから 行き先（G.guide）の そばの 通路まで、めいろの 道すじ（マスの 幅さがし）。お米の マスか 行き先が かわったときだけ さがす。
// 案内の 札の 道のり（めいろで 何m）に 使い、25秒 近づけなければ 道すじの 先 8マスを 6秒 光る 点で 見せる（ふだんは 見せない：迷路を とく 楽しみを のこす）
const mzRt = { key: '', path: null, best: Infinity, bestT: 0, showUntil: 0, gkey: '', retry: 0, t0: 0, len0: 0, run: { dots: 0, pads: 0, combo: 0 } };   // run：この ゴールまでの 道で ひろった ごはんつぶ・のった びゅんパネル・いちばん 長い コンボ（ゴールの ふり返りに）   // t0・len0：いまの ゴールに なった 時刻と、そのときの めいろの 道のり（ゴールの 知らせに）
function mzRoute(now) {
  const g = G.guide;
  if (!g || rp.x === null) { mzRt.path = null; return; }
  const p = toTile(g.lat, g.lng), a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K), gc = Math.floor(p.x / MZ_K), gr = Math.floor(p.y / MZ_K);
  const rch = (g.kind === 'npc' && G.guideRadius ? G.guideRadius(g) : G.reachOf ? G.reachOf(g) : 40) || 40, near = rch * 0.8 / TILE_M;   // 着いたと みなす 近さ（チェックインの 半径・人は 話しかけられる 近さより 少し 内がわ。マス）
  const inReach = (x, y) => Math.hypot(Math.max(x * MZ_K - p.x, 0, p.x - (x + 1) * MZ_K), Math.max(y * MZ_K - p.y, 0, p.y - (y + 1) * MZ_K)) <= near;   // マスの いちばん 近い 所が その 近さに 入る
  // 名所は、そのマスの 道すじ（お米が 転がれる 筒。まん中から MZ_TUBE まで）の どこかが チェックインの 半径に 入る マスまで（マスの かどだけ 近くて 道すじは 45m 以上 はなれ、生け垣の 向こうに ゴールが 見えるのに 道すじが そこで 終わり、チェックインできなかった：実データの 名所への 道すじ 125本のうち 7本）。見つからなければ これまでの 近さで
  const tubeIn = (x, y) => { const cs = mzCurves(x, y); return !cs || cs.some(q => q.some(([qx, qy]) => Math.hypot(qx - p.x, qy - p.y) <= rch / TILE_M + MZ_TUBE)); };
  const inReachT = g.kind === 'npc' ? inReach : (x, y) => inReach(x, y) && tubeIn(x, y);
  const gkey = gc + ',' + gr + ':' + (g.id || g.name || ''), key = a + ',' + b + '>' + gkey + '#' + mzSpotV + ':' + mzSpotCells.size;   // 参道が ふえたら さがしなおす（名所の ゴールは 参道が できる まで 通れず、道のりが なし・遠回りのまま 残った）。ゴールの マスと 名前（同じ マスに 2つの ゴールが つづくと、かわった ことに 気づかず、「🏁 つぎの ゴール」も 時計の やりなおしも なかった：西尾城跡の ガイドさん → 旧近衛邸の お姉さん）
  if (gkey !== mzRt.gkey) {   // ゴールが かわった（着いて 次の 行き先に なった など）：前の ゴールも 2分 おぼえる（チェックインは 行き先が かわった あとに なる）
    if (rp.x !== null) mzMvStep(mzMv, Math.floor(rp.x / MZ_K), Math.floor(rp.y / MZ_K), now);   // 着いた こまの 移動まで 前の ゴールに 数えてから（足あとの 数えは この あと）
    if (mzRt.gid) mzRt.prev = { id: mzRt.gid, t0: mzRt.t0, len0: mzRt.len0, warp: mzRt.warp, at: now, sec: mzRt.t0 ? (now - mzRt.t0) / 1000 : 0, moves: mzMv.n, run: { ...mzRt.run } };   // moves：通った マスの 数（同じ マスを また 通っても 数える。まよわず 来られたか）
    mzMvReset(mzMv);   // 着いた ときの 時間で 止める（チェックインまでに 窓を 読む 時間を 足さない）
    mzRt.warp = false; mzRt.run = { dots: 0, pads: 0, combo: 0 };
    mzTrail.clear();   // 足あとは いまの ゴールへの ぶんだけ
    const bc = npcBump.carry; if (bc) npcBump.carry = bc.from === mzRt.gkey ? { id: bc.id, to: gkey } : null;   // ゴールの 人に 着いて 話した：あいさつ ずみは その すぐ 次の ゴールへ だけ もちこす（動く 前に 行き先を また かえたら すてる）
    mzRt.gkey = gkey; mzRt.best = Infinity; mzRt.bestT = now; mzRt.showUntil = 0; mzRt.hints = 0; mzRt.t0 = now; mzRt.clockT = now; mzRt.len0 = 0;
    mzNext.name = g.name || ''; mzNext.want = true;   // 「🏁 つぎの ゴール」を 出す（道のりが 分かってから）
  }
  mzRt.gid = g.id || g.name;
  if (key === mzRt.key && !(mzRt.retry && now > mzRt.retry)) return;
  mzRt.key = key; mzRt.retry = 0;
  let x0, y0, W, from, end = -1, unk = false, seen = 0, capHit = false;   // seen：出発点から たどれた マスの 数（小さければ 出発点が 行き止まり・島の 中）
  for (const pad of [30, 60, 120]) {   // 30マスの 外まわりで 見つからなければ 60マス・120マスまで ひろげる（長圓寺 → 平原の滝：連結の 道は 30マスの 外を 大きく まわる 286マス。衣崎海岸（一色干潟）→ 吉良饗庭塩の里 など 4〜8km：川を 大きく まわる 428〜690マスで 60マスでは 届かず 道すじが 出なかった。ひろげても 上限は 同じ）
    x0 = Math.min(a, gc) - pad; y0 = Math.min(b, gr) - pad;
    const x1 = Math.max(a, gc) + pad, y1 = Math.max(b, gr) + pad; W = x1 - x0 + 1;
    if (W * (y1 - y0 + 1) > 160000) { if (pad === 30) { mzRt.path = null; return; } break; }   // 遠すぎる（10km ほど）：さがさない
    from = new Int32Array(W * (y1 - y0 + 1)).fill(-2);
    const q = [(b - y0) * W + a - x0];
    from[q[0]] = -1;
    let capped = false, loose = -1;
    for (let h = 0; h < q.length; h++) {
      if (h >= 60000) { capped = true; break; }
      const i = q[h], x = i % W + x0, y = (i / W | 0) + y0;
      if (inReachT(x, y)) { end = i; break; }   // 行き先の チェックインの 近さに 入る マスまで
      if (loose < 0 && inReach(x, y)) loose = i;   // 道すじが 半径に 届かない マス（見つからない ときの 代わり）
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
        const j = (ny - y0) * W + nx - x0;
        if (from[j] !== -2) continue;
        if (mzType(nx, ny) < 0) { unk = true; continue; }   // まだ 読めていない 区域は 通らない（道のりが 分からない。読みに いって あとで さがしなおす）
        if (!mzOpen(x, y, dx, dy)) continue;
        from[j] = i; q.push(j);
      }
    }
    if (end < 0) end = loose;
    seen = q.length; capHit = capped;
    if (end >= 0 || capped) break;   // 見つかった・上限に 当たったら ひろげない
  }
  if (end < 0) {
    mzRt.path = null;
    if (unk) mzRt.retry = now + 1500;
    else if (!capHit && seen >= 600 && G.guideNoPath) G.guideNoPath(g);   // 出発点の まわりは 広いのに 行き先へ 届かない（はなれ島・行き止まり）：行き先を ほかの 候補に かえる（出発点が 島の 中なら かえない）
    return;
  }
  const path = [];
  for (let i = end; i >= 0; i = from[i]) path.push([i % W + x0, (i / W | 0) + y0]);
  mzRt.path = path.reverse();
  const L = mzRt.path.length;
  if (!mzRt.len0) mzRt.len0 = L;
  if (L !== mzRt.shownLen && G.renderGuide) { mzRt.shownLen = L; G.renderGuide(); }   // 案内の 札の 道のり（🌀）を すぐ かえる
  if (L < mzRt.best) { mzRt.best = L; mzRt.bestT = now; }
  if (mzRt.gated !== gkey && mzGateTry(a, b, gc, gr, inReachT, L)) { mzRt.gated = gkey; mzRt.key = ''; }   // ゴールの 戸（1つの ゴールに 1回）。道のりは 次の こまで さがしなおす
}
// ゴールに 着いたら、そのまま ゴール（自分で 遊んで 分かった：ゴールの 輪に 入っても、下の 札を タップしないと「🏁 ゴール！」に ならず、
// 時計も 動いた まま。人が ゴールの ときは 30m まで 近づかないと 話せないのに、道すじは 32m で 止まって いた）。
// 名所：めいろの ゴール（いま・2分 以内の 前の ゴール）の チェックインの 近さに 入ったら、1回だけ ひとりでに その 名所で チェックイン
// （そばに ほかの 注目スポットが あって、下の 札が そちらを さしていても）。人：話せる 近さに 入ったら 話しかける
// 窓・ごほうび（読みこみ中・出す 予約も）・あそびかた・人の 話の 間は 待つ。待って いる 間は、前の ゴールを おぼえる 2分も 止める
// （着いて すぐ 窓が 出て、2分 読んでから とじても、その ゴールで チェックインできる）
const mzArrive = { done: '', t: 0, last: 0, call: '' };
function mzArriveTick(now) {
  const gap = mzArrive.last ? now - mzArrive.last : 0;
  mzArrive.last = now;
  if (mzArrive.call && $('pxInfo').hidden && !sight.n) { G.callNpc(null); mzArrive.call = ''; }   // 話の 窓を とじたら、近くで 話せる あつかいを やめる
  if (!rollOn || !G.demo || !G.me || !G.checkinSpot) return;
  if (gap > 1000 || mapCovered() || !howtoEl.hidden || sightBusy() || (G.rewardSoon && G.rewardSoon())) { if (mzRt.prev) mzRt.prev.at += gap; return; }
  if (now - mzArrive.t < 300) return;
  mzArrive.t = now;
  const pv = mzRt.prev, cands = [[mzRt.gid, mzRt.t0], pv && now - pv.at < 120000 ? [pv.id, pv.t0] : null];
  for (const c of cands) {
    if (!c || !c[0] || !c[1]) continue;
    const key = 's:' + c[0] + ':' + c[1];
    if (mzArrive.done !== key && G.checkinSpot(c[0])) { mzArrive.done = key; return; }
  }
  const g = G.guide;
  // 人：話せる 近さ（30m）に 入ったか、めいろの 道すじの おわり（ゴールの 近さに 入る マス）に 着いたら。道すじは マスの いちばん 近い 所で 着いたと みなすので、
  // マスの まん中の お米は 30m より 少し 遠い ことが ある（遊び手が 32m で 止まった）。その ときは 呼びとめと 同じ ように 近くで 話せる あつかいに する
  if (g && g.kind === 'npc' && $('pxInfo').hidden) {
    const near = G.dist(G.me, g) <= G.guideRadius(g), end = !!(mzRt.path && mzRt.path.length <= 1 && mzRt.gid === g.id);
    const key = 'n:' + g.id + ':' + mzRt.t0, n = (G.npcs || []).find(x => x.id === g.id);
    if (n && (near || end) && mzArrive.done !== key) {
      mzArrive.done = key; if (!near) { G.callNpc(n.id); mzArrive.call = n.id; } openNpc(n);
      // こつんで 話した ときと 同じく、はなれるまで もう 話しかけない。話で ゴールが 次へ かわっても、次の ゴールへ 向かう 間は あいさつ ずみ（自分で 遊んで 分かった：とじて 2秒で 同じ 人の 窓が また 開いた）
      Object.assign(npcBump, { id: n.id, x: Math.floor(rp.x), y: Math.floor(rp.y), carry: { id: n.id, from: mzRt.gkey } });
    }
  }
}
function mzHintTick(now) {   // 25秒 行き先に 近づけていない（めいろの 道のりが へらない）ときだけ 道すじを 見せる（おたすけの ときは いつも 出ているので いらない）
  if (!mzRt.path || mzRt.path.length < 3 || now < mzRt.showUntil || mzHelpOn()) return;
  if (now - mzRt.bestT > 25000) {
    mzRt.showUntil = now + 6000; mzRt.bestT = now; mzRt.hints = (mzRt.hints || 0) + 1;
    // 知らせは ゴールごとに 1回目だけ（自分で 遊んで 分かった：迷って いる 間、25秒ごとに 同じ 知らせが 上を ふさいでいた。光る 点は 毎回 出す）。
    // 同じ ゴールで 3回目には、おたすけを すすめる（1回の あそびで 1回）
    if (mzRt.hints === 1) G.toast('💡 道しるべ：光る 点の ほうへ 進もう');
    else if (mzRt.hints === 3 && !mzHelp.offered) { mzHelp.offered = true; G.toast('🧭 まよったら、せっていで 道しるべを 出せるよ'); }
  }
}
// めいろの おたすけ（運営者の声「迷路初心者でもわかりやすく」）：ゴールへの 道しるべを いつも 出し、行き止まりの マスに ✕。
// はじめは 自動（めいろの ゴールに 3回 着くまで）。せっていの「🧭 めいろの おたすけ」で いつも オン／オフ（nsg_mzhelp：'on'・'off'・なし＝自動）
const MZ_HELP_N = 3, mzHelp = { told: false, dots: 0, dead: 0, offered: false };   // offered：まよった ときに おたすけを すすめた
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* noop */ } };
const mzGoalsDone = () => Number(lsGet('nsg_mzgoals', '0')) || 0;
function mzHelpOn() { const m = lsGet('nsg_mzhelp', 'auto'); return m === 'on' || (m !== 'off' && mzGoalsDone() < MZ_HELP_N); }
function mzHelpSync() { const t = $('mzHelpToggle'); if (t) t.checked = mzHelpOn(); }
function mzHelpGoal() {   // めいろの ゴールに 着いた：3回目で 自動の おたすけは おしまい（知らせる）
  const n = mzGoalsDone() + 1;
  lsSet('nsg_mzgoals', String(n));
  if (n === MZ_HELP_N && lsGet('nsg_mzhelp', 'auto') === 'auto') setTimeout(() => G.toast('🧭 道しるべと ✕ を けしたよ（せっていで また 出せる）'), 4500);
  mzHelpSync();
}
if ($('mzHelpToggle')) { mzHelpSync(); $('mzHelpToggle').addEventListener('change', e => { lsSet('nsg_mzhelp', e.target.checked ? 'on' : 'off'); mzHelp.told = true; dirty = true; }); }   // せっていの「🧭 めいろの おたすけ」
// めいろの カラス（運営者の指示「敵も迷路に追加」）：めいろの 通路を うろうろし、近づくと お米を 追いかけて つつきに くる。
// 当たると お米は はじき飛ばされ、時計が 5秒 すすむ（★が へる ことも）。カラスは 飛んで いき、しばらく すると 別の 所に もどる
// ・お米の まわり（めいろの 12〜22マス）に 3羽まで。お米の ほうが 速いので 逃げきれる。おたすけ中（はじめの 3回）は 1羽で ゆっくり
// ・窓・あそびかた・人の 話の 間は 止まる。せっていの「🐦 めいろの カラス」で 出さない ことも できる（nsg_mzcrow：'off'）
// ・かかし（ほかの 迷路ゲームの「とると 立場が 入れかわる」しくみ）：カラスが いると、お米の 近くの 通路に かかしが 立つ。とると 8秒、
//   カラスが こわがって にげる（青く ふるえ、おそく なる。おわりの 2秒は ちかちか）。その あいだに さわると おいはらえる（+3pt。時計は すすまない）
const mzCrow = { list: [], last: 0, hitT: 0, next: 0, told: false, hits: 0, seq: 0, shoo: 0 };
const mzScare = { cx: 0, cy: 0, on: false, t0: 0, until: 0, next: 0, told: false, got: 0 };   // on：かかしが 立っている。until：こわがる 時間の おわり
const MZ_SCARE_MS = 8000;
const MZ_CROW_PEN = 5;   // 当たったときに すすむ 時計（秒）
const mzCrowOn = () => lsGet('nsg_mzcrow', 'on') !== 'off';
const MZ_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function mzCrowSpawn(rc, rr) {
  for (let t = 0; t < 40; t++) {
    const a = Math.random() * Math.PI * 2, d = 12 + Math.random() * 10, cx = Math.round(rc + Math.cos(a) * d), cy = Math.round(rr + Math.sin(a) * d);
    if (mzType(cx, cy) !== 1 || mzCrow.list.some(c => Math.abs(c.cx - cx) + Math.abs(c.cy - cy) < 4)) continue;
    return { id: ++mzCrow.seq, cx, cy, nx: cx, ny: cy, t: 1, dx: 0, dy: 0, chase: false };
  }
  return null;
}
function mzCrowStep(c, rc, rr) {   // つぎの マス：近ければ（めいろの 道で 10マス以内）お米へ、遠ければ ひきかえさずに うろうろ
  const open = MZ_DIRS.filter(([dx, dy]) => mzOpen(c.cx, c.cy, dx, dy) && mzType(c.cx + dx, c.cy + dy) === 1);
  if (!open.length) return [0, 0];
  c.chase = false;
  if (c.scared) {   // かかしを こわがって いる：お米から いちばん 遠く なる 向きへ（行き止まりで なければ ひきかえさない）
    const fw = open.filter(([dx, dy]) => !(dx === -c.dx && dy === -c.dy)), cand = fw.length ? fw : open;
    const far = ([dx, dy]) => Math.abs(c.cx + dx - rc) + Math.abs(c.cy + dy - rr) + Math.random() * 0.5;
    return cand.reduce((a, b) => (far(b) > far(a) ? b : a));
  }
  if (Math.abs(c.cx - rc) + Math.abs(c.cy - rr) <= 8) {   // めいろの 道で お米まで（はばさがし 10マスまで）。見つかったら その 道の 1歩目へ
    const seen = new Set([c.cx + ',' + c.cy]), q = open.map(([dx, dy]) => [c.cx + dx, c.cy + dy, 1, dx, dy]);
    q.forEach(([x, y]) => seen.add(x + ',' + y));
    for (let h = 0; h < q.length; h++) {
      const [x, y, d, fx, fy] = q[h];
      if (x === rc && y === rr) { c.chase = true; return [fx, fy]; }
      if (d >= 10) continue;
      for (const [dx, dy] of MZ_DIRS) {
        const k = (x + dx) + ',' + (y + dy);
        if (seen.has(k) || !mzOpen(x, y, dx, dy) || mzType(x + dx, y + dy) !== 1) continue;
        seen.add(k); q.push([x + dx, y + dy, d + 1, fx, fy]);
      }
    }
  }
  const fw = open.filter(([dx, dy]) => !(dx === -c.dx && dy === -c.dy));
  const pick = (fw.length ? fw : open)[Math.floor(Math.random() * (fw.length ? fw : open).length)];
  return pick;
}
function mzCrowTick(now) {
  const gap = mzCrow.last ? now - mzCrow.last : 0, dt = Math.min(0.1, gap / 1000);
  mzCrow.last = now;
  if (!mzCrowOn() || rp.x === null) { mzCrow.list.length = 0; mzScare.on = false; mzScare.until = 0; return; }
  if (gap > 1000 || mapCovered() || !howtoEl.hidden || sightBusy()) { if (mzScare.until > now - gap) mzScare.until += gap; return; }   // 窓・あそびかた・人の 話の 間は 止まる（かかしの 時間も 止める。画面が かくれて こまが とんだ ときも、前の こまで 効いていれば のばす）
  const rc = Math.floor(rp.x / MZ_K), rr = Math.floor(rp.y / MZ_K), help = mzHelpOn(), max = help ? 1 : 3, spd = help ? 0.9 : 1.5;
  mzCrow.list = mzCrow.list.filter(c => Math.abs(c.cx - rc) + Math.abs(c.cy - rr) < 34);   // 遠くへ はなれた カラスは いなくなる
  if (mzCrow.list.length > max) mzCrow.list = mzCrow.list.sort((a, b) => (Math.abs(b.cx - rc) + Math.abs(b.cy - rr)) - (Math.abs(a.cx - rc) + Math.abs(a.cy - rr))).slice(0, max);   // おたすけに なったら 羽数も へらす（近い カラスから 飛んで いく）
  if (mzCrow.list.length < max && now > mzCrow.next) { const c = mzCrowSpawn(rc, rr); if (c) mzCrow.list.push(c); mzCrow.next = now + 1500; }
  mzScareTick(now, rc, rr);   // かかしを とった フレームから こわがる（同じ フレームに さわっても 当たらず おいはらう）
  const fx = rp.x / MZ_K, fy = rp.y / MZ_K, scared = now < mzScare.until;
  for (const c of mzCrow.list.slice()) {
    if (c.scared !== scared) { c.scared = scared; if (scared && (c.dx || c.dy)) { [c.cx, c.nx] = [c.nx, c.cx]; [c.cy, c.ny] = [c.ny, c.cy]; c.t = 1 - c.t; c.dx = -c.dx; c.dy = -c.dy; } }   // こわがった とたんに ふりむいて にげる
    c.t += dt * spd * (scared ? 0.7 : c.chase ? 1.15 : 1);
    while (c.t >= 1) {
      c.cx = c.nx; c.cy = c.ny;
      const [dx, dy] = mzCrowStep(c, rc, rr);
      c.dx = dx; c.dy = dy; c.nx = c.cx + dx; c.ny = c.cy + dy;
      c.t = dx || dy ? c.t - 1 : 0;
      if (!dx && !dy) break;
    }
    const x = c.cx + (c.nx - c.cx) * c.t + 0.5, y = c.cy + (c.ny - c.cy) * c.t + 0.5, d = Math.hypot(fx - x, fy - y);
    if (!mzCrow.told && d < 8) { mzCrow.told = true; G.toast(`🐦 カラスに 当たると ${MZ_CROW_PEN}秒 おそくなるよ`); }
    if (scared && d < 0.6) mzCrowShoo(c, now);
    else if (!scared && d < 0.55 && now > mzCrow.hitT) mzCrowHit(c, fx - x, fy - y, now);
  }
}
function mzScareTick(now, rc, rr) {   // かかし：カラスが いる ときだけ、お米から めいろの 6〜14マスの 通路に 1つ 立てる。とったら 45秒 たつまで 次は 立たない
  if (mzScare.on) {
    if (Math.abs(mzScare.cx - rc) + Math.abs(mzScare.cy - rr) > 34 || now - mzScare.t0 > 60000) { mzScare.on = false; mzScare.next = now + 5000; return; }   // 遠く はなれた・60秒 とられなかった（行けない 所 など）：たおして 別の 所に
    if (mzScare.cx === rc && mzScare.cy === rr) {   // とった
      mzScare.on = false; mzScare.until = now + MZ_SCARE_MS; mzScare.next = now + 45000; mzScare.got++;
      riceSay('かかし だ！', 1600, 'happy');   // お米の 吹き出し（ばねの「ばね だ！✨」と そろえる。10/29 店主「素朴な 可愛い キャラクターとの 対話を 軸に」）。のこりの 秒は 時計の 下の 札、何が おきるかは はじめての 知らせ だけ（同じ ことを 3か所で 言っていた。運営者の声「文字は 少なく」2026-10-29）
      // はじめての ときの 知らせは、浮かぶ 文字（カラスが ○秒 にげる）と 時計の 下の のこりの 札に ない ことだけ（同じ「にげる」を 3か所で 言っていた。自分で 遊んで 分かった）。
      // かかしと 青く なる ことの つながりは のこす（はじめての 人に 何で 青く なったか 分かる ように。Codex の 指摘）
      if (!mzScare.told) { mzScare.told = true; G.toast('🐦 かかしで 青く なった カラスに さわると おいはらえる（+3pt）'); }
      grainSound(); dirty = true;
    }
    return;
  }
  if (!mzCrow.list.length || now < mzScare.next || now < mzScare.until) return;
  mzScare.next = now + 3000;
  for (let t = 0; t < 30; t++) {
    const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 8, cx = Math.round(rc + Math.cos(a) * d), cy = Math.round(rr + Math.sin(a) * d);
    if (mzType(cx, cy) !== 1 || mzGrainAt(cx, cy) || mzCrow.list.some(c => Math.abs(c.cx - cx) + Math.abs(c.cy - cy) < 3)) continue;
    Object.assign(mzScare, { cx, cy, on: true, t0: now });
    return;
  }
}
// ばねの わざ（2026-10-27 店主「迷路の壁が伸びて跳ね返って加速するスキル」）：通路に ときどき ばねが 1つ 出る。とると しばらく、
// 生け垣から はなれる ときに 当たった 速さより 速く（MZ_SPRING_E 倍。いちばん速い 速さ ROLL_MAX まで）はね返る。ふだんの 生け垣は かわらない（4割ほど）
const MZ_SPRING_MS = 12000, MZ_SPRING_E = 1.3;   // わざの 長さ・はね返りの 強さ（数字は 仮。店主に 聞く）
const mzSpring = { cx: 0, cy: 0, on: false, t0: 0, until: 0, next: 0, told: false, got: 0, boosts: 0, last: 0, chain: 0, at: 0, best: 0 };   // chain：つづけて はね返った 数（1.5秒 以内）。at：さいごに はね返った 時刻
function mzSpringShot() {   // ばねショット（快感）：ばねで はね返って 1.2秒 以内に 金の米つぶ・ごはんつぶ・ゴールを とった（わざを うまく つかえた ほめ。1回 はね返るごとに 1つ）
  const now = performance.now();
  if (!mzSpring.at || now - mzSpring.at > 1200) return;
  mzSpring.at = 0; mzSpring.shots = (mzSpring.shots || 0) + 1;
  riceSay('やったぁ！', 1600, 'happy'); chordSound();   // 吹き出し（もとは「🎯 ばねショット！ うまいじゃん」）
  const cols = ['#8cf078', '#ffd84a', '#ffffff'];
  for (let i = 0; i < 18; i++) { const t = Math.random() * Math.PI * 2, v = 2 + Math.random() * 3.5; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 3, c: cols[i % 3], life: 0.6 + Math.random() * 0.5 }); }
}
function mzSpringChain(now) {   // ばねの れんぱつ（快感）：1.5秒 以内に また はね返ると 数が ふえ、ぽよんの 音が 1段ずつ 高く、2れんぱつ から 吹き出しと 大きな 緑の きらきら（1回目は 小さな きらきら だけ）
  mzSpring.chain = now - mzSpring.at < 1500 ? mzSpring.chain + 1 : 1; mzSpring.at = now; mzSpring.best = Math.max(mzSpring.best, mzSpring.chain);
  if (mzSpring.chain < 2) {   // 1回目から 小さな 緑の きらきら（夜の 改善 7：はじめての 知らせ「ばねの 間は 生け垣で 前より 速く はね返るよ…」を やめ、はね返る ところを 絵で 見せる）
    for (let i = 0; i < 5; i++) { const t = Math.random() * Math.PI * 2, v = 1 + Math.random() * 2; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 2, c: i % 2 ? '#8cf078' : '#e4ffd8', life: 0.4 + Math.random() * 0.3 }); }
    return;
  }
  riceSay('びよーん' + '♪'.repeat(Math.min(4, mzSpring.chain - 1)), 1200, 'happy');   // 吹き出し：♪ の 数が れんぱつ（もとは「びよーん Nれんぱつ！」）
  const cols = ['#8cf078', '#e4ffd8', '#ffffff'];
  for (let i = 0; i < 6 + Math.min(12, mzSpring.chain * 3); i++) { const t = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 2.5, c: cols[i % 3], life: 0.5 + Math.random() * 0.4 }); }
}   // on：ばねが 置いて ある。until：わざの おわり
function mzSpringTick(now) {   // ばね：お米から めいろの 6〜14マスの 通路に 1つ。とったら 45秒 たつまで 次は 出ない。60秒 とられなければ 別の 所に
  const gap = mzSpring.last ? now - mzSpring.last : 0;
  mzSpring.last = now;
  if (gap > 1000 || mapCovered() || !howtoEl.hidden || sightBusy()) { if (mzSpring.until > now - gap) mzSpring.until += gap; if (mzSpring.on) mzSpring.t0 += gap; return; }   // 窓・あそびかた・人の 話の 間は わざの 時間も 止める
  const rc = Math.floor(rp.x / MZ_K), rr = Math.floor(rp.y / MZ_K);
  if (mzSpring.on) {
    if (Math.abs(mzSpring.cx - rc) + Math.abs(mzSpring.cy - rr) > 34 || now - mzSpring.t0 > 60000) { mzSpring.on = false; mzSpring.next = now + 5000; return; }
    if (mzSpring.cx === rc && mzSpring.cy === rr) {   // とった
      mzSpring.on = false; mzSpring.until = now + MZ_SPRING_MS; mzSpring.next = now + 45000; mzSpring.got++;
      riceSay('ばね だ！', 1600, 'happy');   // 吹き出し（もとは「ばね！ 12秒 生け垣で びよーんと はずむ」。のこり 秒は 時計の 札に 出る）
      grainSound(); dirty = true;
    }
    return;
  }
  if (now < mzSpring.next || now < mzSpring.until) return;
  mzSpring.next = now + 3000;
  for (let t = 0; t < 30; t++) {
    const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 8, cx = Math.round(rc + Math.cos(a) * d), cy = Math.round(rr + Math.sin(a) * d);
    if (mzType(cx, cy) !== 1 || mzGrainAt(cx, cy) || (mzScare.on && mzScare.cx === cx && mzScare.cy === cy)) continue;
    Object.assign(mzSpring, { cx, cy, on: true, t0: now });
    return;
  }
}
function mzCrowShoo(c, now) {   // こわがって いる カラスに さわった：おいはらう（+3pt。6秒 たつと 別の 所に もどる）
  mzCrow.list = mzCrow.list.filter(o => o !== c);
  mzCrow.next = now + 6000; mzCrow.shoo++;
  const r = G.mzShoo ? G.mzShoo() : null;
  floatText(`🐦 おいはらった！${r ? ` +${r.pts}pt` : ''}`);
  const cols = ['#9fd0ff', '#ffffff', '#5a8fd8'];
  for (let i = 0; i < 12; i++) { const t = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 3, c: cols[i % 3], life: 0.6 + Math.random() * 0.4 }); }   // はね（青い きらきら）
  dirty = true;
}
function mzCrowHit(c, ax, ay, now) {   // つつかれた：お米を カラスと 反対へ はじき、時計を すすめ、カラスは 飛んで いく
  const L = Math.hypot(ax, ay) || 1;
  rp.vx = ax / L * 6; rp.vy = ay / L * 6;
  if (mzRt.t0) mzRt.t0 -= MZ_CROW_PEN * 1000;
  mzCrow.hitT = now + 2500; mzCrow.next = now + 6000; mzCrow.hits++;
  mzCrow.list = mzCrow.list.filter(o => o !== c);
  riceSay('うわっ カラス！', 1400);   // 吹き出し（もとは「🐦 カァ！ ＋5秒」。すすんだ 時計は 時計の 札で 見える）
  if (navigator.vibrate) navigator.vibrate(40);
  dirty = true;
}
// 生け垣の 上の 小さな 生きもの（10/28 店主「西尾らしい 素朴な かわいさ」）：通路の マスの とじた さかい（生け垣）に ときどき ちょこんと すわっていて、
// お米が 近づくと ぴょこっと とんで にげ、しばらくすると もどる。見た目だけ（当たり判定・ポイントなし）。生け垣の 種類で 生きものが かわる
const MZ_CRIT = { ike: 'kaeru', ine: 'kaeru', dote: 'kaeru', cha: 'tonbo', kuro: 'tonbo', ami: 'kani', ishi: 'kani', matsu: 'sagi' }, MZ_CRIT_N = 23, MZ_CRIT_MAX = 2;   // N：何マスに 1つ・MAX：画面に いくつまで（すずめ・ねこ・虫も いるので 2つまで）
const mzCritFled = new Map();   // マス → にげた 時刻
const mzCritHi = new Map(), MZ_CRIT_CALM = 1.2;   // あいさつした 時刻・これより おそく 近づくと にげない（マス/秒）
let mzCritHiN = 0, mzCritSaid = 0, mzCritMode = '';   // mode：'night'（うとうと）・'rain'（かえる よろこぶ）   // あいさつの 回数（試験用）
let mzCritDrawn = [];   // この こまに 描いた 生きもの（試験用）
function drawMzCritters(tx0, ty0, tx1, ty1, ox, oy, T, now) {
  const S = MZ_K * T, c0 = Math.floor(tx0 / MZ_K), r0 = Math.floor(ty0 / MZ_K), c1 = Math.ceil(tx1 / MZ_K), r1 = Math.ceil(ty1 / MZ_K);
  const bx = rp.x === null ? null : rp.x / MZ_K - 0.5, by = rp.x === null ? null : rp.y / MZ_K - 0.5;
  const cand = [];
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {   // 画面の 中の 生きものの 場所（お米に 近い じゅんに 描く。近くの 子が 数の 上限で 消えない ように）
    const h = (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) >>> 0;
    if (h % MZ_CRIT_N || mzType(cx, cy) !== 1) continue;
    const d = [[1, 0], [0, 1], [-1, 0], [0, -1]].find((_, i, D) => { const [dx, dy] = D[(i + (h >>> 8)) % 4]; return !mzOpen(cx, cy, dx, dy); });   // 生け垣は 通路の マスの とじた さかいに ある
    if (!d) continue;
    const px = cx + d[0] * 0.5, py = cy + d[1] * 0.5;   // さかいの 上（生け垣の 帯の まん中）
    cand.push({ cx, cy, px, py, dist: bx === null ? 0 : Math.hypot(bx - px, by - py) });
  }
  cand.sort((a, b) => a.dist - b.dist);
  const wx = window.NISHIO_WEATHER && window.NISHIO_WEATHER.current, rain = !!(wx && wx.kind === 'rain'), night = nightOn && !worldMode && nightLevel() >= 1;   // 夜は うとうと・雨は かえるが よろこび とんぼは かくれる
  mzCritMode = night ? 'night' : rain ? 'rain' : '';
  let n = 0;
  mzCritDrawn = [];
  for (const { cx, cy, px, py, dist } of cand) {
    if (n >= MZ_CRIT_MAX) break;
    const kind = MZ_CRIT[mzStyle(cx, cy)] || 'kaeru', img = critterSprites[kind];
    if (!img || (rain && kind === 'tonbo')) continue;   // 雨の 日の とんぼは 葉の かげで あまやどり
    const k = cx + ',' + cy, f = mzCritFled.get(k);
    const near = f === undefined && bx !== null && dist < 1.3;
    if (near && night && Math.hypot(rp.vx, rp.vy) <= MZ_CRIT_CALM) {   // 夜：ねている 子には あいさつ しない。お米が「しーっ」
      if (!mzCritHi.has(k)) { mzCritHi.set(k, -1); if (now - mzCritSaid > 4000) { mzCritSaid = now; riceSay('しーっ…', 1300); } }
    } else
    if (near && Math.hypot(rp.vx, rp.vy) > MZ_CRIT_CALM) { mzCritFled.set(k, now); continue; }   // 速く 来たら にげる
    if (near && !mzCritHi.has(k)) { mzCritHi.set(k, now); mzCritHiN++; if (now - mzCritSaid > 4000) { mzCritSaid = now; riceSay('やぁ♪', 1300, 'happy'); } }   // お米も あいさつを かえす   // そっと 来たら にげずに ぴょこっと あいさつ（はなれるまで 1回）
    else if (!near && mzCritHi.has(k) && now - mzCritHi.get(k) > 800) mzCritHi.delete(k);
    let up = 0, al = 1;
    if (f !== undefined) {
      const t = now - f;
      if (t > 25000) mzCritFled.delete(k);   // もどってきた
      if (t < 25000 && t > 500) continue;   // にげて いる
      if (t <= 500) { up = t / 500; al = 1 - up; }   // ぴょこっと とんで うすく なる
    }
    n++; mzCritDrawn.push([cx, cy, MZ_CRIT[mzStyle(cx, cy)] || 'kaeru']);
    const hi = mzCritHi.has(k) && mzCritHi.get(k) >= 0 ? (now - mzCritHi.get(k)) / 600 : 2;   // あいさつ：0.6秒で 2回 ぴょこぴょこ（夜の「しーっ」は -1）
    const bob = calmMotion || (night && f === undefined) ? 0 : rain && kind === 'kaeru' && hi >= 1 ? Math.round(Math.max(0, Math.sin(now / 160 + cx * 1.7)) * T * 0.3) : hi < 1 ? Math.round(Math.abs(Math.sin(hi * Math.PI * 2)) * T * 0.35) : Math.round(Math.max(0, Math.sin(now / 420 + cx * 1.7)) * T * 0.08);   // ときどき ちょこっと うごく
    ctx.globalAlpha = al;
    ctx.drawImage(img, Math.round(ox + (px + 0.5) * S - T / 2), Math.round(oy + (py + 0.5) * S - T / 2 - bob - up * T * 1.2), T, T);
    if (night && f === undefined) {   // うとうと：小さな z が ゆっくり のぼる
      const zt = ((now / 1800 + cx * 0.37) % 1), zx = ox + (px + 0.5) * S + T * (0.3 + zt * 0.25), zy = oy + (py + 0.5) * S - T * (0.5 + (calmMotion ? 0.2 : zt * 0.5));
      ctx.globalAlpha = al * (calmMotion ? 0.9 : Math.sin(zt * Math.PI)); ctx.font = `bold ${Math.max(8, Math.round(T * 0.45))}px "DotGothic16", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, T / 10); ctx.strokeStyle = 'rgba(20,24,48,.8)'; ctx.strokeText('z', zx, zy); ctx.fillStyle = '#e8eeff'; ctx.fillText('z', zx, zy);
    }
    ctx.globalAlpha = 1;
  }
}
function drawMzSpring(ox, oy, T, now) {   // ばね：通路に 置いて ある ばね（緑の わが ふくらむ・のびちぢみ）と、わざの 間の お米の まわりの 光の わ
  const S = MZ_K * T, q = Math.max(1, Math.round(T / 8));
  if (mzSpring.on) {
    const X = ox + (mzSpring.cx + 0.5) * S, Y = oy + (mzSpring.cy + 0.5) * S, pl = 0.55 + Math.sin(now / 220) * 0.08, r = T * 1.8 * pl, h = T * (1.1 + Math.sin(now / 140) * 0.25), bw = T * 0.9;   // h：ばねの 高さ（びよんびよん）
    ctx.fillStyle = 'rgba(140,240,120,.45)'; ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = Math.max(2, T / 6); ctx.strokeStyle = '#8cf078'; ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.stroke();
    const y0 = Math.round(Y + T * 0.7), y1 = Math.round(y0 - h);
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(Math.round(X - bw / 2) - q, y0 - q, Math.round(bw) + 2 * q, 3 * q); ctx.fillRect(Math.round(X - bw / 2) - q, y1 - 2 * q, Math.round(bw) + 2 * q, 3 * q);   // 台と 上の 板（黒い ふち）
    ctx.lineWidth = Math.max(2, q * 2); ctx.lineJoin = 'miter'; ctx.strokeStyle = '#1a1a1a'; ctx.beginPath();
    for (let i = 0; i <= 6; i++) { const x = X + (i % 2 ? bw / 2 : -bw / 2) * 0.8, y = y0 - (h * i) / 6; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); ctx.lineWidth = Math.max(1, q); ctx.strokeStyle = '#d8e0e6'; ctx.stroke();   // ぎざぎざの ばね（銀）
    ctx.fillStyle = '#5fc24a'; ctx.fillRect(Math.round(X - bw / 2), y0, Math.round(bw), q); ctx.fillRect(Math.round(X - bw / 2), y1 - q, Math.round(bw), q);
  }
  const left = mzSpring.until - now;
  if (left > 0 && rp.x !== null) {   // わざの 間：お米の まわりに 緑の わ（のこり 2秒は ちかちか）
    if (left < 2000 && Math.floor(now / 160) % 2) return;
    const X = ox + rp.x * T, Y = oy + rp.y * T, r = T * (1.15 + Math.sin(now / 120) * 0.12);
    ctx.lineWidth = Math.max(2, q * 2); ctx.strokeStyle = 'rgba(140,240,120,.85)'; ctx.beginPath(); ctx.arc(Math.round(X), Math.round(Y), r, 0, Math.PI * 2); ctx.stroke();
  }
}
function drawMzCrows(ox, oy, T, now) {   // 地図の 飾りの カラス（Blender の 絵）が はばたいて 動く。読めない あいだは 黒い 丸
  const S = MZ_K * T, sz = Math.round(T * 1.8);
  if (mzScare.on) {   // かかし（地図の 飾りと 同じ Blender の 絵）：金色の わが ふくらんだり ちぢんだり（とれる もの だと 分かる ように）
    const X = ox + (mzScare.cx + 0.5) * S, Y = oy + (mzScare.cy + 0.5) * S, ki = DECO.img && DECO.idx ? DECO.idx.get('kakashi') : undefined, pl = 0.55 + Math.sin(now / 220) * 0.08;
    ctx.fillStyle = 'rgba(255,214,80,.5)'; ctx.beginPath(); ctx.arc(X, Y, sz * pl, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = Math.max(2, T / 6); ctx.strokeStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(X, Y, sz * pl, 0, Math.PI * 2); ctx.stroke();
    if (ki !== undefined) ctx.drawImage(decoCanvas(ki * 6 * 4 * 8 + 1), Math.round(X - sz / 2), Math.round(Y - sz / 2), sz, sz);
    else { ctx.font = `${Math.round(sz * 0.8)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText('人', X, Y); }
  }
  if (!mzCrow.list.length) return;
  const si = DECO.img && DECO.idx ? DECO.idx.get('karasu') : undefined, left = mzScare.until - now, blink = left > 0 && left < 2000 && Math.floor(now / 160) % 2;
  for (const c of mzCrow.list) {
    const shake = c.scared ? Math.sin(now / 40 + c.id) * T * 0.12 : 0;
    const X = ox + (c.cx + (c.nx - c.cx) * c.t + 0.5) * S + shake, Y = oy + (c.cy + (c.ny - c.cy) * c.t + 0.5) * S, hop = Math.abs(Math.sin(now / 160 + c.id)) * T * 0.25;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(Math.round(X - sz * 0.3), Math.round(Y + sz * 0.3), Math.round(sz * 0.6), Math.max(2, Math.round(T / 6)));   // 影
    ctx.fillStyle = c.scared ? (blink ? 'rgba(255,255,255,.8)' : 'rgba(140,200,255,.8)') : c.chase ? 'rgba(255,120,100,.45)' : 'rgba(255,245,220,.45)'; ctx.beginPath(); ctx.arc(X, Y - hop, sz * 0.55, 0, Math.PI * 2); ctx.fill();
    if (c.scared) { ctx.lineWidth = Math.max(2, T / 6); ctx.strokeStyle = blink ? '#5a8fd8' : '#e8f4ff'; ctx.beginPath(); ctx.arc(X, Y - hop, sz * 0.55, 0, Math.PI * 2); ctx.stroke(); }   // こわがって いる ときは 白い ふち（夜でも 分かる）   // 明るい 丸（黒い カラスが 暗い 地図や 夜でも 見える。追いかけて くる ときは 赤み、こわがって いる ときは 青。おわりぎわは ちかちか）
    if (si !== undefined) {
      const k = (Math.floor(now / 170) + c.id) & 1;   // 2つの ポーズで はばたく
      ctx.drawImage(decoCanvas(((si * 6 + k) * 4) * 8), Math.round(X - sz / 2), Math.round(Y - sz / 2 - hop), sz, sz);
    } else {
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(Math.round(X - sz * 0.3), Math.round(Y - sz * 0.3 - hop), Math.round(sz * 0.6), Math.round(sz * 0.5));
      ctx.fillStyle = '#f2c230'; ctx.fillRect(Math.round(X + sz * 0.3), Math.round(Y - sz * 0.15 - hop), Math.round(sz * 0.18), Math.max(2, Math.round(sz * 0.12)));
    }
    if (c.chase && !c.scared) {   // 追いかけて いる ときは 頭の 上に「！」
      ctx.font = `bold ${Math.round(T * 0.8)}px "DotGothic16", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, T / 6); ctx.strokeStyle = '#1a1a1a'; ctx.fillStyle = '#ff5a4a';
      ctx.strokeText('！', X, Y - sz * 0.8 - hop); ctx.fillText('！', X, Y - sz * 0.8 - hop);
    }
  }
}
if ($('mzCrowToggle')) { $('mzCrowToggle').checked = mzCrowOn(); $('mzCrowToggle').addEventListener('change', e => { lsSet('nsg_mzcrow', e.target.checked ? 'on' : 'off'); if (!e.target.checked) mzCrow.list.length = 0; dirty = true; }); }   // せっていの「🐦 めいろの カラス」
// お米から めいろの 10マス 以内だけ（画面 いっぱいに ✕ が 25こ ほど 出て、地図が 見えにくかった。迷うのは 近くの 分かれ道）
const MZ_DEAD_R = 10;
function drawMzDeadEnds(tx0, ty0, tx1, ty1, ox, oy, T) {   // 行き止まり（入れる 向きが 1つだけの 通路）に ✕ の 札。ゴールへの 道すじの マスと、お米の いる マスには 出さない
  mzHelp.dead = 0;
  const c0 = Math.floor(tx0 / MZ_K), r0 = Math.floor(ty0 / MZ_K), c1 = Math.ceil(tx1 / MZ_K), r1 = Math.ceil(ty1 / MZ_K), S = MZ_K * T;
  const onPath = new Set((mzRt.path || []).map(([x, y]) => x + ',' + y)), ra = rp.x === null ? null : Math.floor(rp.x / MZ_K) + ',' + Math.floor(rp.y / MZ_K);
  const ax = rp.x === null ? null : Math.floor(rp.x / MZ_K), ay = rp.x === null ? null : Math.floor(rp.y / MZ_K);
  const g = G.guide, gp = g ? toTile(g.lat, g.lng) : null, gNear = g ? (((G.reachOf ? G.reachOf(g) : 40) || 40) / TILE_M) + MZ_K : 0;   // ゴールの まわり（道すじが 手前で 終わっても、ゴールの マスには 出さない）
  const r = T * 0.42, lw = Math.max(2, T / 6);
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
    if (mzType(cx, cy) !== 1 || mzSpotCell(cx, cy) || mzGrainAt(cx, cy)) continue;   // 金の 米つぶが ある 行き止まりは ひろいに 行く 寄り道（✕ で かくさない）
    const k = cx + ',' + cy;
    if (onPath.has(k) || k === ra || (ax !== null && Math.abs(cx - ax) + Math.abs(cy - ay) > MZ_DEAD_R)) continue;
    if (gp && Math.hypot((cx + 0.5) * MZ_K - gp.x, (cy + 0.5) * MZ_K - gp.y) <= gNear) continue;
    let open = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (mzOpen(cx, cy, dx, dy)) open++;
    if (open !== 1) continue;
    const X = ox + cx * S + S / 2, Y = oy + cy * S + S / 2;
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = Math.max(1, T / 10);
    ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#e0453a'; ctx.lineWidth = lw; ctx.lineCap = 'round';
    const d = r * 0.5;
    ctx.beginPath(); ctx.moveTo(X - d, Y - d); ctx.lineTo(X + d, Y + d); ctx.moveTo(X + d, Y - d); ctx.lineTo(X - d, Y + d); ctx.stroke();
    ctx.lineCap = 'butt';
    mzHelp.dead++;
  }
}
function drawMzHint(ox, oy, T, now) {
  mzHelp.dots = 0;
  if (!mzRt.path) return;
  if (now >= mzRt.showUntil && mzHelpOn()) {   // おたすけ：ゴールへの 道すじを 水色の 流れる 線で いつも（16マス先まで。金の 米つぶと まちがえない 色と 形）
    // 「🏁 つぎの ゴール」の 大きな 文字が 出ている 間も 待つ（小さい 画面で、はじめの ゴールの 名前が この 知らせの 下に かくれた。自分で 遊んで 分かった）
    if (!mzHelp.told && mzRt.path.length > 2 && !mapCovered() && !sightBusy() && !mzNext.want && !mzNext.t0) { mzHelp.told = true; G.toast('🧭 水色の 線が ゴールへの 道。✕ は 行き止まり'); }   // あそびかた・窓・人の 話が 出ている 間は 待つ（読める ように なってから 知らせる）
    const S = MZ_K * T, pts = mzRt.path.slice(0, 17).map(([cx, cy]) => [ox + cx * S + S / 2, oy + cy * S + S / 2]);
    if (pts.length < 2) return;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);   // ゆるい めいろの 道すじと 同じ 曲線（さかいの まん中を とおり、マスの まん中へ 引かれる）
    for (let i = 1; i < pts.length - 1; i++) { if (rec) ctx.lineTo(pts[i][0], pts[i][1]); else ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2); }
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    ctx.strokeStyle = 'rgba(10,30,45,.55)'; ctx.lineWidth = Math.max(4, T * 0.5); ctx.stroke();   // ふち
    ctx.setLineDash([T * 0.7, T * 0.45]); ctx.lineDashOffset = -(now / 25) % (T * 1.15);   // 先へ 流れる
    ctx.strokeStyle = '#7fe0ff'; ctx.lineWidth = Math.max(2, T * 0.3); ctx.stroke();
    ctx.restore();
    const [ex, ey] = pts[pts.length - 1], [px, py] = pts[pts.length - 2], a = Math.atan2(ey - py, ex - px), h = T * 0.6;   // 線の 先に 矢じり
    ctx.fillStyle = '#7fe0ff'; ctx.strokeStyle = 'rgba(10,30,45,.8)'; ctx.lineWidth = Math.max(1, T / 8);
    ctx.beginPath(); ctx.moveTo(ex + Math.cos(a) * h, ey + Math.sin(a) * h); ctx.lineTo(ex + Math.cos(a + 2.4) * h, ey + Math.sin(a + 2.4) * h); ctx.lineTo(ex + Math.cos(a - 2.4) * h, ey + Math.sin(a - 2.4) * h); ctx.closePath(); ctx.fill(); ctx.stroke();
    mzHelp.dots = pts.length - 1;
    return;
  }
  if (now >= mzRt.showUntil) return;
  const S = MZ_K * T, pts = mzRt.path.slice(1, 9);
  pts.forEach(([cx, cy], k) => {
    const on = Math.floor(now / 120) % 8 === k, r = T * (on ? 0.55 : 0.38), p = mzOn((cx + 0.5) * MZ_K, (cy + 0.5) * MZ_K), X = ox + p[0] * T, Y = oy + p[1] * T;   // 道すじの 上に
    ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(X, Y, r + Math.max(1, T / 6), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = on ? '#fff59d' : '#ffffff'; ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill();
  });
}
// ゴールまでの タイムと ★：運営者の声「迷路を磨く」。めいろの 道のりから 目やすの 時間（★3）を きめ、画面の 上に いまの 時間と「★★★ あと 0:23」。
// 着いたら ★の 数で ボーナス（game.js の checkin）。窓・あそびかた・画面が かくれている 間は 時計を 止める（ごほうびを 読む 時間を 数えない）
const mzPar = len0 => { const m = Math.max(0, len0 - 1) * MZ_K * TILE_M, p3 = Math.max(20, m / 12 + 10); return { p3, p2: p3 * 1.8 }; };   // ★3：1秒に 12m（曲がり角・行き止まりを ふくめて ふつうに 転がす 速さ）＋10秒。2km で 約3分。★2 は その 1.8倍
const MZ_WAY_MIN = 8;   // 「まよわず ゴール」を しらべる いちばん 短い めいろの 道のり（マス）
// 時計の 字の 大きさ（画面の 点）。運営者の声「プレイ画面に小さい文字が多くてわかりにくいので大きい文字シンプルに」（2026-10-27）：13 → 18
const MZ_CLOCK_PX = 18;
const mzStars = (sec, len0) => { const p = mzPar(len0); return sec <= p.p3 ? 3 : sec <= p.p2 ? 2 : 1; };
function mzClock(now) {
  const dt = mzRt.clockT ? Math.min(now - mzRt.clockT, Math.max(0, now - mzRt.t0)) : 0;   // いまの ゴールが 始まってからの 分だけ
  mzRt.clockT = now;
  if (mzRt.t0 && (dt > 1000 || mapCovered(true) || !howtoEl.hidden || sightBusy())) mzRt.t0 += dt;   // 止める（画面が かくれて 1こまが 長い ときも）
}
function mzClockFoot(dpr, now) {   // 上の 時計の 札（と かかし・ばねの のこりの 札）の 下はし（キャンバスの 画素。出ていなければ 0。drawMzClock と 同じ 計算）
  if (!mzRt.t0 || !mzRt.len0 || mapCovered(true) || mzBanner.t0) return 0;
  const S = Math.round(MZ_CLOCK_PX * dpr);
  return Math.round(S * 1.5 + S * 1.9 * ((mzScare.until > now ? 1 : 0) + (mzSpring.until > now ? 1 : 0)) + S * 0.85);
}
function drawMzClock(w, dpr, now) {
  if (!mzRt.t0 || !mzRt.len0 || mapCovered(true) || mzBanner.t0) return;
  const sec = (now - mzRt.t0) / 1000, p = mzPar(mzRt.len0), st = mzStars(sec, mzRt.len0), left = st === 3 ? p.p3 - sec : st === 2 ? p.p2 - sec : 0;
  const mmss = v => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
  // 時間と ★だけ（シンプルに）。「あと 何秒で ★が へる」は のこり 10秒から だけ 出す
  const S = Math.round(MZ_CLOCK_PX * dpr), stars = '★'.repeat(st) + '☆'.repeat(3 - st), pct = rp.x === null ? -1 : mzPebPct(mzAreas.get(Math.floor(rp.x / MZ_K / MZ_R) + '_' + Math.floor(rp.y / MZ_K / MZ_R))), pt = pct >= 0 ? `　🍚${pct}%` : '', t = (mzRt.warp ? `⏱ ${mmss(sec)}　★なし` : `⏱ ${mmss(sec)}　${stars}${left > 0 && left < 10 ? ` あと${Math.ceil(left)}秒` : ''}`) + pt;   // 通っている 区域の 踏破率（出せない ときは 出さない）
  ctx.font = `bold ${S}px "DotGothic16", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(t).width + S * 1.2, x = Math.round(w / 2), y = Math.round(S * 1.5);
  ctx.fillStyle = 'rgba(10,20,30,.72)'; ctx.fillRect(Math.round(x - tw / 2), Math.round(y - S * 0.85), Math.round(tw), Math.round(S * 1.7));
  ctx.fillStyle = st === 3 ? '#ffe680' : st === 2 ? '#ffffff' : '#c9d4dc';
  if (left > 0 && left < 5 && Math.floor(now / 250) % 2) ctx.fillStyle = '#ff9f80';   // ★が へる 5秒前は ちかちか
  ctx.fillText(t, x, y);
  const sl = mzScare.until - now;
  let y2 = y;
  if (sl > 0) {   // かかしの のこり（カラスが にげて いる 間）
    const t2 = `かかし あと ${Math.ceil(sl / 1000)}秒`, tw2 = ctx.measureText(t2).width + S * 1.2; y2 += S * 1.9;
    ctx.fillStyle = 'rgba(20,40,90,.78)'; ctx.fillRect(Math.round(x - tw2 / 2), Math.round(y2 - S * 0.85), Math.round(tw2), Math.round(S * 1.7));
    ctx.fillStyle = sl < 2000 && Math.floor(now / 160) % 2 ? '#ffffff' : '#9fd0ff'; ctx.fillText(t2, x, y2);
  }
  const sp = mzSpring.until - now;
  if (sp > 0) {   // ばねの わざの のこり
    const t3 = `ばね あと ${Math.ceil(sp / 1000)}秒`, tw3 = ctx.measureText(t3).width + S * 1.2; y2 += S * 1.9;
    ctx.fillStyle = 'rgba(20,70,30,.8)'; ctx.fillRect(Math.round(x - tw3 / 2), Math.round(y2 - S * 0.85), Math.round(tw3), Math.round(S * 1.7));
    ctx.fillStyle = sp < 2000 && Math.floor(now / 160) % 2 ? '#ffffff' : '#b8f5a8'; ctx.fillText(t3, x, y2);
  }
}
// 足あと：いまの ゴールへ 向かう あいだに 通った 通路の マスに、うすい お米の しるし（同じ 行き止まりに 何度も 入らない ように。迷路の 紙に えんぴつで しるしを つける かわり）
const mzGateUsed = new Set();   // 通った 近道の 戸（mzGate の キー）。この 画面の 間だけ（セーブは 増やさない＝古い セーブでも こわれない）
let mzTrailPrev = '';
const mzTrail = new Map();   // 'cx,cy' → [cx, cy]（通った 順。多すぎたら 古い ほうから すてる）
// 「まよわず ゴール」の ための 通った マスの 数（足あとの 絵とは べつ。同じ マスを また 通っても 数え、上限も ない）。
// さかいの 上で 行ったり 来たり（0.4秒 以内に 1つ前の マスへ もどる）した ぶんは 数えない。とりけすのは 直前に 数えた 1歩だけ
// （とりけした あとに また またいだら 数える。何度 またいでも、それより 前の 歩数は へらない）
// 転がる 1/120秒ごとに 数える（rollStep の あと）。それでも ななめに 2つの さかいを 同時に こえた（0,0 → 1,1）ときは、よこ → たての 2歩に わけて 数える
// （道すじの 歩数は たて・よこを べつに 数える。2歩めは ふつうに とりけせる）。とんだ（4マスより 遠く）ときは 1歩
const mzMv = { n: 0, cell: '', prev: '', t: 0, undo: false, x: 0, y: 0 };
function mzMvReset(m) { m.n = 0; m.undo = false; m.prev = ''; }   // 次の ゴール：いまの マスから 数えはじめる（前の ゴールの 最後の 1歩は とりけせない）
function mzMvStep(m, x, y, now) {
  const k = x + ',' + y;
  if (k === m.cell) return;
  if (m.cell && Math.abs(x - m.x) === 1 && Math.abs(y - m.y) === 1) mzMvStep(m, x, m.y, now);   // ななめ：まず よこの 1歩
  if (m.cell) {
    const d = Math.abs(x - m.x) + Math.abs(y - m.y);
    if (d === 1 && m.undo && k === m.prev && now - m.t < 400) { m.n = Math.max(0, m.n - 1); m.undo = false; }
    else { m.n += d <= 4 ? d : 1; m.undo = d === 1; }
  }
  m.prev = m.cell; m.cell = k; m.t = now; m.x = x; m.y = y;
}
function mzTrailTick() {
  if (rp.x === null) return;
  const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K), k = a + ',' + b;
  mzMvStep(mzMv, a, b, performance.now());
  mzGateWalk(mzTrailPrev, a, b);
  mzTrailPrev = k;
  if (mzTrail.has(k) || !(mzType(a, b) === 1 || mzSpotCell(a, b))) return;
  mzTrail.set(k, [a, b]);
  if (mzTrail.size > 3000) mzTrail.delete(mzTrail.keys().next().value);
}
// 一度通った 近道（P5）：ゴールの 戸（mzGate）の さかいを お米が またいだら「通った」。通った 戸だけ 金色に 光って のこり、まだの 戸は うすい 白い 点だけ
function mzGateWalk(prev, a, b) {
  if (!prev || !mzGate.size) return;
  const [pa, pb] = prev.split(',').map(Number), dx = a - pa, dy = b - pb;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return;
  const key = mzGateKey(pa, pb, dx, dy);
  if (mzGate.has(key)) mzGateUsed.add(key);
}
function drawMzGates(tx0, ty0, tx1, ty1, ox, oy, T, now) {
  if (!mzGate.size) return;
  const q = Math.max(2, Math.round(T / 5)), pulse = (Math.sin(now / 420) + 1) / 2;
  for (const k of mzGate.keys()) {
    const m = /^(-?\d+),(-?\d+)([rd])$/.exec(k);
    if (!m) continue;
    const cx = +m[1], cy = +m[2], dx = m[3] === 'r' ? 1 : 0, dy = 1 - dx, used = mzGateUsed.has(k);
    if (cx < tx0 / MZ_K - 2 || cx > tx1 / MZ_K + 2 || cy < ty0 / MZ_K - 2 || cy > ty1 / MZ_K + 2) continue;
    for (const f of used ? [0.25, 0.5, 0.75] : [0.5]) {
      const p = mzOn((cx + 0.5 + dx * f) * MZ_K, (cy + 0.5 + dy * f) * MZ_K), X = Math.round(ox + p[0] * T), Y = Math.round(oy + p[1] * T);
      if (used) {
        const h = q * 2 + Math.round(pulse * q);
        ctx.fillStyle = `rgba(255,214,102,${0.28 + pulse * 0.2})`; ctx.fillRect(X - h, Y - h, h * 2, h * 2);
        ctx.fillStyle = '#7a4a00'; ctx.fillRect(X - q - 1, Y - q - 1, q * 2 + 2, q * 2 + 2);
        ctx.fillStyle = '#ffe066'; ctx.fillRect(X - q, Y - q, q * 2, q * 2);
      } else { ctx.fillStyle = 'rgba(255,250,232,.7)'; ctx.fillRect(X - 1, Y - 1, 3, 3); }
    }
  }
}
function drawMzTrail(tx0, ty0, tx1, ty1, ox, oy, T) {   // マスの まん中に 米つぶ（丸。Godot の 記録係には ellipse が ないので arc だけ）、通れる となりの 足あとへ 点を 2つ（「・・」で つながって 見える）
  if (!mzTrail.size) return;
  const S = MZ_K * T, c0 = Math.floor(tx0 / MZ_K) - 1, r0 = Math.floor(ty0 / MZ_K) - 1, c1 = Math.ceil(tx1 / MZ_K), r1 = Math.ceil(ty1 / MZ_K);
  const rg = Math.max(1.5, T * 0.26), rd = Math.max(1, T * 0.16), dots = [], grains = [];
  for (const [cx, cy] of mzTrail.values()) {
    if (cx < c0 || cx > c1 || cy < r0 || cy > r1) continue;
    const at = (x, y) => { const p = mzOn(x, y); return [ox + p[0] * T, oy + p[1] * T]; };   // ゆるい めいろ：角の マスでは 道すじの カーブの 上に
    grains.push(at((cx + 0.5) * MZ_K, (cy + 0.5) * MZ_K));
    for (const [dx, dy] of [[1, 0], [0, 1]]) if (mzTrail.has((cx + dx) + ',' + (cy + dy)) && mzOpen(cx, cy, dx, dy)) for (const f of [1 / 3, 2 / 3]) dots.push(at((cx + 0.5 + dx * f) * MZ_K, (cy + 0.5 + dy * f) * MZ_K));
  }
  ctx.fillStyle = 'rgba(26,26,26,.45)';
  for (const [X, Y] of dots) { ctx.beginPath(); ctx.arc(X, Y, rd + 1, 0, Math.PI * 2); ctx.fill(); }
  for (const [X, Y] of grains) { ctx.beginPath(); ctx.arc(X, Y, rg + 1, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,250,232,.85)';
  for (const [X, Y] of dots) { ctx.beginPath(); ctx.arc(X, Y, rd, 0, Math.PI * 2); ctx.fill(); }
  for (const [X, Y] of grains) { ctx.beginPath(); ctx.arc(X, Y, rg, 0, Math.PI * 2); ctx.fill(); }
}
// 米粒ドット（パックマン。踏破の見える化）：めいろの 通路の マスの まん中に 小さくて 淡い 米つぶを 置き、お米が マスに 入ると 消える。歩いた 道が 見えて 消えていく。
// 金の 米つぶ（行き止まり・ひろうと +pt）・ごはんつぶの 列（ふれて ひろう・音）・足あと（いまの ゴール分）とは べつ。ポイント・収集・袋には 関係しない。
// 食べた マスは 区域（mzAreas）に もつ：区域が 作りなおされれば 最初から 置き直し。置かない マス：名所の 参道・金の 米つぶ・びゅんパネル・ごはんつぶの 列の ある マス
function mzPebSkip(a) {   // ドットを 置かない マス（ごはんつぶの 列の ある マス）
  if (!a.pebSkip) { a.pebSkip = new Set(); for (const L of mzLineSet(a)) for (const d of L.dots) a.pebSkip.add(Math.floor(d[0] / MZ_K) + ',' + Math.floor(d[1] / MZ_K)); }
  return a.pebSkip;
}
function mzPebOk(a, cx, cy) {   // その マスに ドットが ある（まだ 食べていない）か
  if (!a || a.t[(cy - a.y0) * MZ_R + cx - a.x0] !== 1 || (a.eaten && a.eaten.has(cx + ',' + cy)) || mzSpotCell(cx, cy) || mzGrainAt(cx, cy) || mzPadAt(cx, cy) >= 0) return false;
  return !mzPebSkip(a).has(cx + ',' + cy);
}
// エリア踏破率（テクテクライフ）：「エリア」は めいろの 区域（32×32マス）。%＝食べた ドットの マス ÷ ドットを 置ける 通路の マス。
// 金の米つぶの マスは ひろった かどうかで 置く・置かないが かわるので 分母から のぞく（食べた 数も 分母の マスだけ 数える）。
// 食べた 印は 区域（eaten）に あるので、区域が 作りなおされれば % も 0 から。100% の お祝いだけ 区域ごとに 1回（nsg_fanfare）
function mzPebStat(a) {   // { n 食べた, total 分母 }（分母 0 なら total 0）
  const key = mzSpotCells.size + ':' + mzSpotV + ':' + (a.eaten ? a.eaten.size : 0);
  if (a.pst && a.pstKey === key) return a.pst;
  const grains = mzGrainSet(a), skip = mzPebSkip(a);
  let n = 0, total = 0;
  for (let j = 0; j < MZ_R; j++) for (let i = 0; i < MZ_R; i++) {
    const k = j * MZ_R + i, cx = a.x0 + i, cy = a.y0 + j;
    if (a.t[k] !== 1 || grains.has(k) || mzSpotCell(cx, cy) || mzPadAt(cx, cy) >= 0 || skip.has(cx + ',' + cy)) continue;
    total++;
    if (a.eaten && a.eaten.has(cx + ',' + cy)) n++;
  }
  a.pstKey = key; a.pst = { n, total };
  return a.pst;
}
const mzPebPct = a => { const s = a && mzPebStat(a); return s && s.total > 0 ? Math.floor(s.n * 100 / s.total) : -1; };   // 切りすてる：100 は ぜんぶ 食べた ときだけ。出せなければ -1
function mzFanfareDone(k, set) {   // 100% の お祝いを 出した 区域の 記録（軽い 文字列の 一覧。こわれていたら 空）
  try {
    const L = JSON.parse(localStorage.getItem('nsg_fanfare') || '[]').filter(x => typeof x === 'string').slice(-400);
    if (!set) return L.includes(k);
    if (!L.includes(k)) L.push(k);
    localStorage.setItem('nsg_fanfare', JSON.stringify(L));
  } catch (e) { return !!set && false; }
  return true;
}
function mzFanfare(a) {   // 区域の ドットを ぜんぶ 食べた：小さな お祝い（区域ごとに 1回だけ。記録に あれば 出さない。ポイントは つけない）
  if (mzPebPct(a) !== 100 || a.fanfared) return;
  a.fanfared = true;
  const fk = a.rx + '_' + a.ry;
  if (mzFanfareDone(fk)) return;
  mzFanfareDone(fk, true);
  chordSound(); roll.happyT = Math.max(roll.happyT || 0, 1); riceSay('ぜんぶ 通った！', 1800, 'happy');
  const now = performance.now(), cols = ['#ffffff', '#fff6c2', '#ffe066'];
  for (let j = 0; j < 12; j++) { const t = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 2.5; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 3, c: cols[j % 3], life: 0.5 + Math.random() * 0.4 }); }
}
function mzPebTick() {   // お米の いる マスの ドットを 食べる（まいコマ）
  if (rp.x === null) return;
  const cx = Math.floor(rp.x / MZ_K), cy = Math.floor(rp.y / MZ_K), a = mzArea(cx, cy);
  if (!mzPebOk(a, cx, cy)) return;
  (a.eaten || (a.eaten = new Set())).add(cx + ',' + cy);
  dirty = true;
  mzFanfare(a);
}
// 踏破マップ＋ズーム連動フォグ（世界樹・ローグライクの 3段階フォグ）：通路の マスを「未踏／踏破済み（視界の 外）／視界の 中」で 濃淡を わける。
// 通った 印は 新しい セーブを 増やさず、米粒ドットの 食べた 印（区域の eaten）と 足あと（mzTrail）を 使う（区域が 作りなおされれば ドットと 同じく 置き直し）。
// ズーム（mzScale）：1＝全体を うすく（未踏だけ もや。視界の 制限なし）、2〜4＝近づくほど 現在地の まわりだけ 見える。ゴールの マスは どの 段階でも フォグの 外で、やわらかく 光る。ポイント・収集・道すじは 動かさない
const MZ_FOG = { 1: { sight: 0, veil: 0.2 }, 2: { sight: 9, veil: 0.3 }, 3: { sight: 6, veil: 0.4 }, 4: { sight: 4, veil: 0.46 } };   // sight：見える 半径（マス。0＝制限なし）・veil：視界の 外の 未踏の こさ
function mzFogAlpha(scale, d, visited) {   // d：お米からの 距離（マス）。{ veil 白いもやの こさ, tint 踏破の 色づけ }
  const f = MZ_FOG[Math.min(4, Math.max(1, Math.round(scale)))];
  if (!f.sight) return { veil: visited ? 0 : f.veil, tint: visited ? 0.16 : 0 };   // ズームアウト：視界の 制限は なく、未踏の 通路網を うすく
  if (d <= f.sight) return { veil: 0, tint: visited ? 0.16 : 0 };
  return { veil: visited ? f.veil * 0.4 : f.veil, tint: visited ? 0.1 : 0 };
}
// 地区ごとの色味（第3弾サイクル3 P2。テクテクライフの「歩いた所が 自分の色に なる」）：区域の まん中の 地区を 1回 きめて、歩いた 通路の 色づけを 地区の 色に。コンプ率が 高い 地区ほど はっきり（game.js の areaTint）。となりの 市町は 金色のまま
function mzZoneTint(a) {
  if (a.zone === undefined || (!a.zone && a.zoneN !== G.spots.length)) {
    a.zoneN = G.spots.length;
    a.zone = G.spots.length && G.areaZone ? G.areaZone(toLatLng((a.x0 + MZ_R / 2) * MZ_K, (a.y0 + MZ_R / 2) * MZ_K)) : '';
  }
  const rgb = a.zone && G.areaRgb ? G.areaRgb(a.zone) : null;
  if (!rgb) return { rgb: '255,214,102', k: 1 };
  return { rgb: rgb.join(','), k: 1 + 0.35 * G.areaTint(a.zone, G.areaProgress(a.zone)) };
}
function drawMzFog(tx0, ty0, tx1, ty1, ox, oy, T, now) {
  if (rec) return;
  const S = MZ_K * T, c0 = Math.floor(tx0 / MZ_K) - 1, r0 = Math.floor(ty0 / MZ_K) - 1, c1 = Math.ceil(tx1 / MZ_K), r1 = Math.ceil(ty1 / MZ_K);
  const me = rp.x === null ? null : [rp.x / MZ_K, rp.y / MZ_K], gp = mzRt.path && mzRt.path.length ? mzRt.path[mzRt.path.length - 1] : null, sc = mzScale;
  const buckets = new Map();   // 'veil,tint' → [x, y, ...]（同じ こさを まとめて 塗る）
  for (let ry = Math.floor(r0 / MZ_R); ry <= Math.floor(r1 / MZ_R); ry++) for (let rx = Math.floor(c0 / MZ_R); rx <= Math.floor(c1 / MZ_R); rx++) {
    const a = mzAreas.get(rx + '_' + ry);   // 読めている 区域だけ
    if (!a) continue;
    const zt = mzZoneTint(a);
    for (let cy = Math.max(r0, a.y0); cy <= Math.min(r1, a.y0 + MZ_R - 1); cy++) for (let cx = Math.max(c0, a.x0); cx <= Math.min(c1, a.x0 + MZ_R - 1); cx++) {
      if (a.t[(cy - a.y0) * MZ_R + cx - a.x0] !== 1 || (gp && gp[0] === cx && gp[1] === cy)) continue;   // 通路だけ。ゴールの マスは フォグの 外
      const visited = mzTrail.has(cx + ',' + cy) || !!(a.eaten && a.eaten.has(cx + ',' + cy)), d = me ? Math.hypot(cx + 0.5 - me[0], cy + 0.5 - me[1]) : 0, f = mzFogAlpha(sc, d, visited);
      if (f.veil < 0.01 && f.tint < 0.01) continue;
      const k = f.veil.toFixed(2) + ',' + Math.min(0.42, f.tint * zt.k).toFixed(2) + ',' + zt.rgb, b = buckets.get(k) || buckets.set(k, []).get(k);
      b.push(ox + cx * S, oy + cy * S);
    }
  }
  for (const [k, xs] of buckets) {
    const [veil, tint] = k.split(',').map(Number), rgb = k.split(',').slice(2).join(',');
    ctx.fillStyle = veil >= 0.01 ? `rgba(244,240,222,${veil})` : `rgba(${rgb},${tint})`;
    for (let i = 0; i < xs.length; i += 2) ctx.fillRect(Math.floor(xs[i]), Math.floor(xs[i + 1]), Math.ceil(S), Math.ceil(S));
    if (veil >= 0.01 && tint >= 0.01) { ctx.fillStyle = `rgba(${rgb},${tint})`; for (let i = 0; i < xs.length; i += 2) ctx.fillRect(Math.floor(xs[i]), Math.floor(xs[i + 1]), Math.ceil(S), Math.ceil(S)); }
  }
  if (gp) {   // ゴールの マス：フォグに かかわらず ぼんやり 光る（旗と 輪は drawMzGoal）
    const p = mzOn((gp[0] + 0.5) * MZ_K, (gp[1] + 0.5) * MZ_K), X = ox + p[0] * T, Y = oy + p[1] * T, R = S * 0.9, pulse = (Math.sin(now / 260) + 1) / 2;
    if (X > -R && Y > -R && X < ctx.canvas.width + R && Y < ctx.canvas.height + R) {
      const g = ctx.createRadialGradient(X, Y, 0, X, Y, R);
      g.addColorStop(0, `rgba(255,224,102,${0.45 + pulse * 0.2})`); g.addColorStop(1, 'rgba(255,224,102,0)');
      ctx.fillStyle = g; ctx.fillRect(X - R, Y - R, R * 2, R * 2);
    }
  }
}
function drawMzPebs(tx0, ty0, tx1, ty1, ox, oy, T) {   // 小さな 四角の 米つぶ（淡い 色。金の 米つぶより ずっと 小さい）
  const c0 = Math.floor(tx0 / MZ_K) - 1, r0 = Math.floor(ty0 / MZ_K) - 1, c1 = Math.ceil(tx1 / MZ_K), r1 = Math.ceil(ty1 / MZ_K), q = Math.max(1, Math.round(T / 8));
  for (let ry = Math.floor(r0 / MZ_R); ry <= Math.floor(r1 / MZ_R); ry++) for (let rx = Math.floor(c0 / MZ_R); rx <= Math.floor(c1 / MZ_R); rx++) {
    const a = mzAreas.get(rx + '_' + ry);   // 読めている 区域だけ（ここでは 読みに いかない）
    if (!a) continue;
    for (let cy = Math.max(r0, a.y0); cy <= Math.min(r1, a.y0 + MZ_R - 1); cy++) for (let cx = Math.max(c0, a.x0); cx <= Math.min(c1, a.x0 + MZ_R - 1); cx++) {
      if (!mzPebOk(a, cx, cy)) continue;
      const p = mzOn((cx + 0.5) * MZ_K, (cy + 0.5) * MZ_K), X = Math.round(ox + p[0] * T), Y = Math.round(oy + p[1] * T);
      ctx.fillStyle = 'rgba(26,26,26,.3)'; ctx.fillRect(X - q - 1, Y - q - 1, q * 2 + 2, q * 2 + 2);
      ctx.fillStyle = 'rgba(255,250,232,.9)'; ctx.fillRect(X - q, Y - q, q * 2, q * 2);
    }
  }
}
// 金の米つぶ：運営者の声「滞在時間を増やす」。めいろの 行き止まり（通れる さかいが 1つだけの 通路）に、区域ごとに 6つまで 金の米つぶが おちている。
// ころがって 入ると ひろえる（+2pt。きょう 10こごとに +20pt）。場所は 日本の 日づけと 区域で きまり（だれでも 同じ）、毎日 かわる。ひろった つぶは その日は 出ない（game.js の dayState().grains）。
// 行き止まりに 入るのが「はずれ」ではなく「たから さがし」に なる
const MZ_GRAIN_N = 6, MZ_GRAIN_SEC = 2;   // 区域ごとの つぶの 数・ひろうと もどる 時計（秒）
const jstDay = () => Math.floor((Date.now() + 9 * 3600e3) / 86400e3);
function mzGrainSet(a) {   // 区域の 金の米つぶ（区域の 中の マスの 番号）
  const day = jstDay();
  if (a.gDay === day) return a.grains;
  const N = MZ_R, cand = [];
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {   // 区域の はしは よける（となりの 区域との さかいは いつも 通れる）
    const k = j * N + i;
    if (a.t[k] !== 1) continue;
    if (a.er[k] + a.er[k - 1] + a.ed[k] + a.ed[k - N] === 1) cand.push(k);
  }
  let sd = ((a.rx * 2654435761) ^ (a.ry * 40503) ^ (day * 2246822519)) >>> 0 || 1;
  const rn = () => { sd ^= sd << 13; sd >>>= 0; sd ^= sd >>> 17; sd ^= sd << 5; sd >>>= 0; return sd / 4294967296; };
  for (let k = cand.length - 1; k > 0; k--) { const m = (rn() * (k + 1)) | 0; [cand[k], cand[m]] = [cand[m], cand[k]]; }
  a.gDay = day; a.grains = new Set(cand.slice(0, MZ_GRAIN_N));
  return a.grains;
}
const mzGrainKey = (cx, cy) => jstDay() + ':' + cx + ',' + cy;
function mzGrainAt(cx, cy) {   // そこに まだ ひろっていない 金の米つぶが あるか
  const a = mzArea(cx, cy);
  if (!a || !mzGrainSet(a).has((cy - a.y0) * MZ_R + cx - a.x0)) return false;
  return !(G.mzGrainHas && G.mzGrainHas(mzGrainKey(cx, cy)));
}
let mzGrainCell = '';
function mzGrainTick() {
  if (rp.x === null) return;
  const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K), k = a + ',' + b;
  if (k === mzGrainCell || !mzArea(a, b)) return;   // 区域が まだ 読めていなければ、読めてから しらべる（その マスを しらべおわった ことに しない）
  mzGrainCell = k;
  if (!mzGrainAt(a, b) || !G.mzGrain) return;
  const r = G.mzGrain(mzGrainKey(a, b));
  if (!r) return;
  grainSound(); roll.happyT = 1.2; dirty = true; mzSpringShot();
  const now0 = performance.now(), back = mzRt.t0 ? Math.min(MZ_GRAIN_SEC * 1000, now0 - mzRt.t0) : 0;   // 寄り道の ごほうび：時計を 2秒 もどす（ほかの 迷路ゲームの「時間が ふえる 宝」）
  if (back > 0) mzRt.t0 += back;
  floatText(`🌾 金の米つぶ +${r.pts}pt${back >= 1000 ? `・⏱−${Math.round(back / 1000)}秒` : ''}（きょう ${r.n}こ）`);
  const now = performance.now(), cols = ['#ffe066', '#ffd23f', '#fff6c2'];
  for (let i = 0; i < 14; i++) { const t = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 3, c: cols[i % 3], life: 0.6 + Math.random() * 0.4 }); }   // 小さな きらきら（ゴールの 紙ふぶきと 同じ しくみ）
}
// 行き止まりの 小ごほうび（パックマン・世界樹の「行き止まりにも 意味を」）：金の米つぶが ない 行き止まりに 入っても、かおりちゃんが 三河弁で ひとこと、米つぶが ぽわっと 出る。
// 行き止まり ＝ drawMzDeadEnds と 同じ（通路で、入れる 向きが 1つだけ。名所の 参道・ゴールの 手前は のぞく）。ポイント・進み具合は 動かさない（「損した」感を 消すだけ）。
// うるさく ならない ように、同じ 行き止まりは その日 1回だけ・つづけて 出すのは 6秒 あけて
const MZ_DEAD_SAY = ['行き止まりだら〜。ぐるっと もどろまい', 'ここ 静かで ええ とこじゃん', 'ちょっと 寄り道 したら ええ ことが あるんだら', '🐸 かえるが ひょっこり。ここまで 来たん？', '🐦 すずめが ちゅん。ひとやすみ していこまい', '🌾 風が ふいて 気持ちええ ねぇ', 'おっと 行き止まり！ でも 寄り道も 楽しいじゃん', '🍵 ここで 抹茶でも 飲みたい ねぇ'];
const MZ_DEAD_GAP = 6000;
const mzDeadSeen = new Set();
let mzDeadCell = '', mzDeadAt = -1e9;
function mzIsDead(cx, cy) {   // 行き止まりの マスか（区域が まだ 読めて いなければ false）
  if (mzType(cx, cy) !== 1 || mzSpotCell(cx, cy)) return false;
  let open = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (mzOpen(cx, cy, dx, dy)) open++;
  return open === 1;
}
const mzDeadLine = (cx, cy) => MZ_DEAD_SAY[((cx * 7919 + cy * 104729) >>> 0) % MZ_DEAD_SAY.length];   // 場所で きまる（同じ 行き止まりは 毎日 同じ ひとこと）
function mzDeadTick() {
  if (rp.x === null) return;
  const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K), k = a + ',' + b;
  if (k === mzDeadCell || !mzArea(a, b)) return;
  mzDeadCell = k;
  const key = jstDay() + ':' + k, now = performance.now();
  if (mzDeadSeen.has(key) || now - mzDeadAt < MZ_DEAD_GAP || mzGrainAt(a, b) || !mzIsDead(a, b)) return;
  const p = mzRt.path, last = p && p.length ? p[p.length - 1] : null;
  if (last && last[0] === a && last[1] === b) return;   // ゴールの マスは 行き止まりでも 「ゴール」の 知らせを 優先
  if (sightBusy() || mapCovered()) return;
  mzDeadSeen.add(key); mzDeadAt = now;
  riceSay(mzDeadLine(a, b), 2200, 'happy');
  const cols = ['#ffe066', '#fff6c2', '#ffffff'];
  for (let i = 0; i < 6; i++) { const t = Math.random() * Math.PI * 2, v = 1 + Math.random() * 2; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 2, c: cols[i % 3], life: 0.5 + Math.random() * 0.3 }); }   // 米つぶの ぽわっと
  dirty = true;
}
function drawMzGrains(tx0, ty0, tx1, ty1, ox, oy, T, now) {   // 金の 米つぶ（ふわふわ うかんで、ときどき きらり）
  const S = MZ_K * T, c0 = Math.floor(tx0 / MZ_K) - 1, r0 = Math.floor(ty0 / MZ_K) - 1, c1 = Math.ceil(tx1 / MZ_K), r1 = Math.ceil(ty1 / MZ_K);
  const r = Math.max(4, T * 0.55), q = Math.max(1, Math.round(T / 8));
  for (let ry = Math.floor(r0 / MZ_R); ry <= Math.floor(r1 / MZ_R); ry++) for (let rx = Math.floor(c0 / MZ_R); rx <= Math.floor(c1 / MZ_R); rx++) {
    const a = mzArea(rx * MZ_R, ry * MZ_R);
    if (!a) continue;
    for (const k of mzGrainSet(a)) {
      const cx = a.x0 + k % MZ_R, cy = a.y0 + ((k / MZ_R) | 0);
      if (cx < c0 || cx > c1 || cy < r0 || cy > r1 || (G.mzGrainHas && G.mzGrainHas(mzGrainKey(cx, cy)))) continue;
      const ph = (cx * 7 + cy * 13) % 10, bob = Math.sin(now / 300 + ph) * T * 0.12, on = mzOn((cx + 0.5) * MZ_K, (cy + 0.5) * MZ_K), X = ox + on[0] * T, Y0 = oy + on[1] * T, Y = Y0 + bob;   // ゆるい めいろの 道すじの 上に
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(Math.round(X - r * 0.7), Math.round(Y0 + r * 0.9), Math.round(r * 1.4), q * 2);   // かげ
      ctx.fillStyle = '#5a3a00'; ctx.beginPath(); ctx.arc(X, Y, r + q, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffc928'; ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff3a8'; ctx.beginPath(); ctx.arc(X - r * 0.35, Y - r * 0.35, r * 0.35, 0, Math.PI * 2); ctx.fill();   // てかり
      if ((Math.floor(now / 150) + ph) % 10 === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(X + r * 0.5), Math.round(Y - r * 1.4), q, Math.round(r * 0.9)); ctx.fillRect(Math.round(X + r * 0.5 - r * 0.4), Math.round(Y - r * 1.0), Math.round(r * 0.9), q); }   // きらり
    }
  }
}
// びゅんパネル（運営者の声「クセになるギミック」）：めいろの まっすぐな 通路の 床に 矢印の パネル。矢印の 向きに 転がって（止まって いれば その 向きに 傾けて）のると、
// びゅんと 速く おされる（ころころコンボも +1）。矢印と 逆から のっても なにも しない（通れなく ならない）。矢印の 先が まっすぐ 4マス以上 あいている 所だけ。
// 場所は 区域で きまり、毎日 同じ（おぼえて「あの びゅんで 加速して、つきあたりで くるっと 曲がる」と 近道や コンボを くふうできる）。区域ごとに 5つまで、たがいに 5マス以上 はなす
const MZ_PAD_N = 5, MZ_PAD_RUN = 4, MZ_PAD_V = 7.5, MZ_PAD_CHAIN_MS = 3500, MZ_PAD_D = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // 向き 0右 1下 2左 3上
const mzPad = { cell: '', hits: 0, fx: '', fxT: 0, chain: 0, lastT: 0, best: (() => { try { return +localStorage.getItem('nsg_pad_best') || 0; } catch (e) { return 0; } })() };   // chain：3.5秒 いないに 続けて のった 数（びゅん×2・×3…）
function mzPadSet(a) {   // 区域の びゅんパネル（区域の 中の マスの 番号 → 向き）
  if (a.pads) return a.pads;
  const N = MZ_R, op = (k, d) => (d === 0 ? a.er[k] : d === 1 ? a.ed[k] : d === 2 ? a.er[k - 1] : a.ed[k - N]) === 1, cand = [];
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {   // 区域の はしは よける
    const k = j * N + i;
    if (a.t[k] !== 1 || op(k, 0) + op(k, 1) + op(k, 2) + op(k, 3) < 2) continue;   // 行き止まり（金の米つぶの 所）には おかない
    for (let d = 0; d < 4; d++) {
      const [dx, dy] = MZ_PAD_D[d];
      let x = i, y = j, n = 0;
      while (n < MZ_PAD_RUN && x + dx >= 1 && x + dx <= N - 2 && y + dy >= 1 && y + dy <= N - 2 && op(y * N + x, d)) { x += dx; y += dy; n++; }
      if (n >= MZ_PAD_RUN) cand.push([k, d]);
    }
  }
  let sd = ((a.rx * 374761393) ^ (a.ry * 668265263) ^ 0x5bd1e995) >>> 0 || 1;
  const rn = () => { sd ^= sd << 13; sd >>>= 0; sd ^= sd >>> 17; sd ^= sd << 5; sd >>>= 0; return sd / 4294967296; };
  for (let k = cand.length - 1; k > 0; k--) { const m = (rn() * (k + 1)) | 0; [cand[k], cand[m]] = [cand[m], cand[k]]; }
  const out = new Map();
  for (const [k, d] of cand) {
    if (out.size >= MZ_PAD_N) break;
    const i = k % N, j = (k / N) | 0;
    if ([...out.keys()].some(m => Math.abs(m % N - i) + Math.abs(((m / N) | 0) - j) < 5)) continue;
    out.set(k, d);
  }
  a.pads = out;
  return out;
}
function mzPadAt(cx, cy) {   // その マスの びゅんパネルの 向き（なければ -1。区域が まだ 読めて いなければ -2）
  const a = mzArea(cx, cy);
  if (!a) return -2;
  const d = mzPadSet(a).get((cy - a.y0) * MZ_R + cx - a.x0);
  return d === undefined ? -1 : d;
}
function mzPadTick(ax, ay) {   // パネルの マスに いる 間 しらべる（rollStep から。パネルの 上で 止まって いても、矢印の 向きに 傾ければ おされる）
  const cx = Math.floor(rp.x / MZ_K), cy = Math.floor(rp.y / MZ_K), key = cx + ',' + cy;
  if (key === mzPad.cell) return;   // この パネルでは もう おされた（マスを 出るまで 1回）
  const d = mzPadAt(cx, cy);
  if (d < 0) { if (d === -1) mzPad.cell = key; return; }   // 区域が 読めて いなければ 読めてから
  const [dx, dy] = MZ_PAD_D[d], along = rp.vx * dx + rp.vy * dy, push = Math.max(-1, Math.min(1, ax)) * dx + Math.max(-1, Math.min(1, ay)) * dy;
  if (!(along > 0.3 || (along > -0.3 && push > 0.3))) return;   // 矢印の 向きに 進んでいる（止まって いれば その 向きに 傾けている）ときだけ
  const s = Math.max(along, MZ_PAD_V);
  if (dx) { rp.vx = dx * s; rp.vy *= 0.2; } else { rp.vy = dy * s; rp.vx *= 0.2; }
  const now = performance.now();
  mzPad.chain = now - mzPad.lastT < MZ_PAD_CHAIN_MS ? mzPad.chain + 1 : 1; mzPad.lastT = now;
  if (mzPad.chain > mzPad.best) { mzPad.best = mzPad.chain; try { localStorage.setItem('nsg_pad_best', String(mzPad.best)); } catch (e) { /* noop */ } }   // びゅんの れんさの ベスト（この端末。きろくに 出す）   // びゅんの れんさ：前の パネルから 3.5秒 いないなら つながる
  mzPad.cell = key; mzPad.hits++; mzRt.run.pads++; mzPad.fx = key; mzPad.fxT = now;
  if (mzPad.chain >= 2) riceSay(`びゅーん${'💨'.repeat(Math.min(3, mzPad.chain - 1))}`, 1200, 'happy');   // 吹き出し：💨 の 数が れんぞく（もとは「💨 びゅん×N！ はやいじゃん」）
  padSound(mzPad.chain); roll.happyT = Math.max(roll.happyT || 0, 0.8); dirty = true;
  try { if (!localStorage.getItem('nsg_pad_seen')) { localStorage.setItem('nsg_pad_seen', '1'); floatText('🍵 抹茶びゅん！ 矢印の 向きに のってみりん'); } } catch (e) { /* noop */ }   // はじめて のった ときだけ
  combo.n++; combo.quietT = 0; comboStep();   // ころころコンボも つづく
  for (let i = 0; i < 6; i++) roll.dust.push({ x: rp.x - dx * (0.4 + i * 0.25) + (Math.random() - 0.5) * 0.5 * Math.abs(dy), y: rp.y - dy * (0.4 + i * 0.25) + (Math.random() - 0.5) * 0.5 * Math.abs(dx), t: 0, s: 0.7 + Math.random() * 0.4, c: '190,240,255' });   // うしろに 風の すじ
}
function drawMzPads(tx0, ty0, tx1, ty1, ox, oy, T, now) {   // びゅんパネル（抹茶びゅん）：西尾の 抹茶色の 板に 白い「＞」が 矢印の 向きへ 流れる（点の 四角だけで 描く）
  const S = MZ_K * T, c0 = Math.floor(tx0 / MZ_K) - 1, r0 = Math.floor(ty0 / MZ_K) - 1, c1 = Math.ceil(tx1 / MZ_K), r1 = Math.ceil(ty1 / MZ_K);
  const b = Math.max(1, Math.round(S / 13)), P = Math.round(S * 0.36);   // 点の 大きさ・板の 半分
  for (let ry = Math.floor(r0 / MZ_R); ry <= Math.floor(r1 / MZ_R); ry++) for (let rx = Math.floor(c0 / MZ_R); rx <= Math.floor(c1 / MZ_R); rx++) {
    const a = mzArea(rx * MZ_R, ry * MZ_R);
    if (!a) continue;
    for (const [k, d] of mzPadSet(a)) {
      const cx = a.x0 + k % MZ_R, cy = a.y0 + ((k / MZ_R) | 0);
      if (cx < c0 || cx > c1 || cy < r0 || cy > r1) continue;
      const on = mzOn((cx + 0.5) * MZ_K, (cy + 0.5) * MZ_K), X = Math.round(ox + on[0] * T), Y = Math.round(oy + on[1] * T), [dx, dy] = MZ_PAD_D[d];   // 道すじの 上に
      const lit = mzPad.fx === cx + ',' + cy ? Math.max(0, 1 - (now - mzPad.fxT) / 400) : 0;
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(X - P - b, Y - P - b, 2 * P + 2 * b, 2 * P + 2 * b);
      ctx.fillStyle = lit ? '#cfe89a' : '#7da83a'; ctx.fillRect(X - P, Y - P, 2 * P, 2 * P);   // 抹茶色（運営者の声「西尾らしく」。生け垣の こい 緑より 明るい 黄みどり）
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(X - P, Y - P, 2 * P, b);   // 上の へりに てかり
      const put = (u, v) => ctx.fillRect(X + (dx ? u * dx : -v * dy) - b / 2 | 0, Y + (dy ? u * dy : v * dx) - b / 2 | 0, b, b);   // 板の 中の (u 矢印の 向き, v 横) に 点
      const ph = Math.floor(now / 160 + cx + cy) % 3;   // 「＞＞」が うしろから 前へ 順に 光る（電光の 矢印）
      for (let j = 0; j < 2; j++) {
        const u0 = (j * 3 + 0.5) * b;
        ctx.fillStyle = lit || ph === j ? '#fffbe6' : '#4c6e1d';
        for (let v = -2; v <= 2; v++) for (let w = 0; w < 2; w++) put(u0 - Math.abs(v) * b - w * b, v * b);
      }
    }
  }
}
// ごはんつぶの 列（運営者の声「癖になるギミックをさらに追加」）：めいろの まっすぐな 通路（3〜5マス）に 小さな ごはんつぶが 1マス 3つずつ 並ぶ。転がって ふれると ひろえて、
// 「ぴっ」の 音が 1つずつ 高く なる（ドレミソラ）。列を ぜんぶ ひろうと 和音と きらきら、ころころコンボ +2。つぶは 2分半で また 出る（いつでも ぱくぱく ひろえる）。
// ポイントは つけない（同じ 所で ふやせない。数と 音だけ）。きょう ひろった 数は この端末（nsg_tsubu）。場所は 区域で きまり 毎日 同じ。区域ごとに 6列、びゅんパネルの マスと 行き止まりには 置かない
const MZ_LINE_N = 6, MZ_DOT_BACK = 150000;
const mzDots = { d: jstDay(), n: (() => { try { const v = JSON.parse(localStorage.getItem('nsg_tsubu') || 'null'); return v && v.d === jstDay() ? v.n : 0; } catch (e) { return 0; } })(), lines: 0 };   // d：n を 数えている 日（ひらいた まま 日づけが かわったら 0 から）
function mzLineSet(a) {   // 区域の ごはんつぶの 列：[{ dots: [[x, y]]（地図の マス）, taken: [時刻] }]
  if (a.lines) return a.lines;
  const N = MZ_R, op = (k, d) => (d === 0 ? a.er[k] : d === 1 ? a.ed[k] : d === 2 ? a.er[k - 1] : a.ed[k - N]) === 1;
  const pads = mzPadSet(a), ok = k => { const i = k % N, j = (k / N) | 0; return i >= 1 && i <= N - 2 && j >= 1 && j <= N - 2 && a.t[k] === 1 && !pads.has(k) && op(k, 0) + op(k, 1) + op(k, 2) + op(k, 3) >= 2; }, cand = [];
  for (let k = 0; k < N * N; k++) for (const d of [0, 1]) {   // 右・下へ つづく 通路
    if (!ok(k)) continue;
    const step = d ? N : 1, run = [k];
    while (run.length < 5 && op(run[run.length - 1], d) && ok(run[run.length - 1] + step)) run.push(run[run.length - 1] + step);
    if (run.length >= 3) cand.push([run, d]);
  }
  let sd = ((a.rx * 2246822519) ^ (a.ry * 3266489917) ^ 0x27d4eb2f) >>> 0 || 1;
  const rn = () => { sd ^= sd << 13; sd >>>= 0; sd ^= sd >>> 17; sd ^= sd << 5; sd >>>= 0; return sd / 4294967296; };
  for (let k = cand.length - 1; k > 0; k--) { const m = (rn() * (k + 1)) | 0; [cand[k], cand[m]] = [cand[m], cand[k]]; }
  const used = new Set(), out = [];
  for (const [run, d] of cand) {
    if (out.length >= MZ_LINE_N) break;
    if (run.some(k => used.has(k))) continue;
    for (const k of run) for (const o of [0, 1, -1, N, -N]) used.add(k + o);   // となりあう 列を つくらない
    const dots = [];
    for (const k of run) {
      const cx = a.x0 + k % N, cy = a.y0 + ((k / N) | 0);
      for (const f of [0.5, 1.5, 2.5]) dots.push(d ? [(cx + 0.5) * MZ_K, cy * MZ_K + f] : [cx * MZ_K + f, cy * MZ_K + 1.4]);
    }
    out.push({ dots, taken: new Array(dots.length).fill(0) });
  }
  a.lines = out;
  return out;
}
function mzLinesNear(fn) {   // お米の 区域と となりの 区域の 列（読めている 区域だけ）
  const a0 = Math.floor(rp.x / MZ_K / MZ_R), b0 = Math.floor(rp.y / MZ_K / MZ_R);
  for (let ry = b0 - 1; ry <= b0 + 1; ry++) for (let rx = a0 - 1; rx <= a0 + 1; rx++) { const a = mzAreas.get(rx + '_' + ry); if (a) for (const L of mzLineSet(a)) fn(L); }   // 読めている 区域だけ（ここでは 読みに いかない）
}
// いる 所の 名物の ひと言（運営者の声「西尾らしく」）。名物の 中身は meibutsu.js の 出典（西尾市観光協会）に ある もの だけ：
// 一色町は 一色産うなぎ、吉良・幡豆の 海べは 三河湾の あさり、ほかの 西尾市は 西尾の 抹茶。西尾市の 外では 出さない
function mzMeibutsuTip() {
  const t = here.town || '', c = here.city || '';
  if (!/西尾/.test(c)) return '';   // 西尾市と わかった ときだけ（市町が わからない 所や 西尾市の 外では 出さない）
  if (/^一色町/.test(t)) return '🐟 一色は うなぎの まちだら';
  if (/^(吉良町|東幡豆町|西幡豆町|鳥羽町|寺部町)/.test(t)) return '🐚 三河湾の あさりも 名物だら';
  return '🍵 西尾は 抹茶の まちだら';
}
// お米の みちくさ（michikusa.js）：転がって いる 最中に、いる 所（田んぼ・川や池・海べ・町）と 月に 合う ひとりごとを 吹き出しで 言う。
// 名所に 着いた ときの 西尾ばなし（game.js の komeBanashi）とは ちがい、道ばたで お米が 自分で 気づく 形。45〜75秒に 1回まで・ほかの ひと言の 直後は 言わない。
// 言った ことは この 端末に おぼえて（nsg_michikusa）、同じ 所の ひとりごとを ひとめぐり するまで くりかえさない
const MICHI_KEY = 'nsg_michikusa';
const michi = { next: 0, seen: null };
function mzMichikusa(now) {
  const M = window.NISHIO_MICHIKUSA;
  if (!M || !LU || now < michi.next || now < riceBub.until + 3000 || !howtoEl.hidden || mapCovered() || sightBusy() || worldMode || driving || rp.x === null || Math.hypot(rp.vx, rp.vy) < 0.2) return;
  if (!michi.seen) { try { michi.seen = JSON.parse(localStorage.getItem(MICHI_KEY)) || []; } catch (e) { michi.seen = []; } }
  if (!michi.next) { michi.next = now + 15000; return; }   // はじめは 15秒 転がってから
  const ll = toLatLng(rp.x, rp.y);
  let near = '';
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) near += luAt(ll.lat + a * LU.dLat, ll.lng + b * LU.dLng);   // まわり100mメッシュ9つ
  const r = M.pick({ city: here.city, town: here.town, land: luAt(ll.lat, ll.lng), near, month: new Date().getMonth() + 1 }, michi.seen);
  if (!r) { michi.next = now + 5000; return; }
  michi.seen = r.seen; try { localStorage.setItem(MICHI_KEY, JSON.stringify(r.seen)); } catch (e) { /* noop */ }
  michi.next = now + 45000 + Math.random() * 30000;
  riceSay(r.item.say, 2400);
  if (G.track) G.track('kome_michikusa', { id: r.item.id });
}
function mzDotTick() {   // ふれた つぶを ひろう（まいコマ）
  const now = performance.now();
  mzLinesNear(L => {
    let got = false;
    for (let i = 0; i < L.dots.length; i++) if (L.taken[i] && now - L.taken[i] > MZ_DOT_BACK) L.taken[i] = 0;   // また 出る（先に 列ぜんぶ。1つ ひろった だけで「ぜんぶ」に ならないように）
    for (let i = 0; i < L.dots.length; i++) {
      if (L.taken[i] || Math.abs(L.dots[i][0] - rp.x) > 0.75 || Math.abs(L.dots[i][1] - rp.y) > 0.75) continue;
      L.taken[i] = now; got = true;
      const left = L.taken.filter(t => !t).length;
      dotSound(L.dots.length - left - 1); mzSpringShot();
      if (mzDots.d !== jstDay()) { mzDots.d = jstDay(); mzDots.n = 0; }
      mzDots.n++; mzRt.run.dots++;
      if (!left) {   // 列を ぜんぶ ひろった
        mzDots.lines++;
        chordSound(); combo.n += 2; combo.quietT = 0; comboStep(); roll.happyT = Math.max(roll.happyT || 0, 1);
        const tip = mzDots.lines % 3 === 1 ? mzMeibutsuTip() : '';   // 3回に 1回は、いる 所の 名物の ひと言（西尾らしく）
        riceSay('ぜんぶ ひろった！', 1500, 'happy');   // 吹き出し（もとは「🍚 ぜんぶ ひろったじゃん！（きょう Nつぶ）」）
        if (tip) floatText(`🍵 ${tip}`);   // 名物の ひと言は 知らせる 中身が あるので 文字の まま（3回に 1回）
        const cols = ['#ffffff', '#fff6c2', '#ffe066'];
        for (let j = 0; j < 12; j++) { const t = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 2.5; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 3, c: cols[j % 3], life: 0.5 + Math.random() * 0.4 }); }
      }
    }
    if (got) { dirty = true; try { localStorage.setItem('nsg_tsubu', JSON.stringify({ d: mzDots.d, n: mzDots.n })); } catch (e) { /* noop */ } }
  });
}
function drawMzDots(tx0, ty0, tx1, ty1, ox, oy, T, now) {   // ごはんつぶ：白い 小さな つぶ（黒い ふち。ふわっと ゆれる）。点の 四角だけで 描く
  const q = Math.max(1, Math.round(T / 9)), w = 3 * q, h = 4 * q;   // 道しるべの 線より 上に 描く
  mzLinesNear(L => {
    const a = L.dots[0], b = L.dots[L.dots.length - 1];
    if (b[0] < tx0 - 1 || a[0] > tx1 + 1 || b[1] < ty0 - 1 || a[1] > ty1 + 1) return;   // 画面の 外の 列は 描かない
    for (let i = 0; i < L.dots.length; i++) {
      if (L.taken[i] && now - L.taken[i] <= MZ_DOT_BACK) continue;
      const X = Math.round(ox + L.dots[i][0] * T - w / 2), Y = Math.round(oy + L.dots[i][1] * T - h / 2 + Math.sin(now / 260 + i * 0.8) * q);
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(X - q, Y, w + 2 * q, h); ctx.fillRect(X, Y - q, w, h + 2 * q);
      ctx.fillStyle = '#fffdf2'; ctx.fillRect(X, Y, w, h);
      ctx.fillStyle = '#e8dcb8'; ctx.fillRect(X + 2 * q, Y + q, q, 3 * q); ctx.fillRect(X + q, Y + 3 * q, q, q);   // かげ
      ctx.fillStyle = '#ffffff'; ctx.fillRect(X, Y, q, q);   // てかり
    }
  });
}
// 壁の かたまりの 中に いる（始めた 所・ひとっとび の 行き先が 道の ない 区画 など）：いちばん近い 通路・参道の まん中へ うつす（0.5秒ごと）
let mzSnapT = 0;
function mzSnap(now) {
  if (now - mzSnapT < 500 || rp.x === null) return;
  mzSnapT = now;
  const go = (x, y) => mzType(x, y) === 1 || mzSpotCell(x, y), a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K), t0 = mzType(a, b);
  if (t0 < 0 || go(a, b)) return;
  const seen = new Set([a + ',' + b]), q = [[a, b]];
  for (let h = 0; h < q.length && h < 900; h++) {
    const [x, y] = q[h];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k)) continue;
      seen.add(k);
      const ty = mzType(nx, ny);
      if (ty < 0) continue;
      if (go(nx, ny)) { const ll = toLatLng(nx * MZ_K + 1.5, ny * MZ_K + 1.5); mzRt.snapT = performance.now(); G.moveTo(ll.lat, ll.lng); return; }
      q.push([nx, ny]);
    }
  }
}
// めいろの ゴール（行き先 G.guide）：運営者の声「迷路のゴールがわからない」
// ・画面の 中：チェックインの 近さの 光る わ（ふくらんだり ちぢんだり）と、🏁 の 旗、「ゴール」の 文字
// ・画面の 外：縁に 大きな 矢印と、🏁 と めいろの 道のり（なければ まっすぐの きょり）の 札
// ゴールに 着いた：お米の まわりに 紙ふぶき（ごはんつぶ・星・桜の 色。盤の めいろと 同じ）
const mzFx = [], mzBanner = { t0: 0, text: '' };
const mzNext = { t0: 0, name: '', want: false };   // 新しい ゴールの 知らせ（3秒）
// 「🏁 つぎの ゴール」の 札（と 道のりを 待つ 2秒まで）が 出て いる 間は、知らせ（game.js の toast）を 待たせ、札が 消えたら 出す。
// ごほうびの 窓を とじると、待たせて いた 知らせと この 札が 同時に 出て、札の 見出し「🏁 つぎの ゴール」が 知らせに かくれて いた（自分で 遊んで 分かった。ゴールの たびに）
// 描いて いる 間（active・meiroPause で ない）だけ。絵が 止まると t0 が 進まず、ずっと 待たせて しまう（ふつうの 地図・ステージの めいろに うつった とき）
function mzNextOn() { return !!(active && !meiroPause && (mzNext.want || (mzNext.t0 && performance.now() - mzNext.t0 < 3300)) && mazeOn() && G.guide && !mapCovered() && !mzBanner.t0); }
G.toastBlock = mzNextOn;
function mzNextHoldTick() {
  const on = mzNextOn();
  if (on === !!mzNext.hold) return;
  mzNext.hold = on;
  if (on) { if (G.toastHold) G.toastHold(); }   // いま 出ている 知らせは 下げる（出た ばかりなら 札の あとに 出し直す）
  else if (G.toastFlush) G.toastFlush();
}
function mzGoalFx(text) {
  mzSpringShot();   // ばねで はね返って ゴールに 飛びこんだ
  // 紙ふぶきは 西尾らしく（運営者の声「西尾らしく」）：お米つぶ（白い たて長が くるくる）・抹茶の 葉（緑）・金の つぶ（お米屋さんの ゲーム、抹茶の まち）
  const now = performance.now(), kinds = ['rice', 'rice', 'leaf', 'rice', 'gold', 'leaf'], cols = { rice: '#fffdf3', leaf: ['#6f9f2c', '#9ccc4f'], gold: '#ffd84a' };
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 6, k = kinds[i % kinds.length];
    mzFx.push({ t0: now, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4, k, c: k === 'leaf' ? cols.leaf[i % 2] : cols[k], spin: 4 + Math.random() * 8, ph: Math.random() * 6.3, life: 1 + Math.random() * 0.8 });
  }
  mzBanner.t0 = now; mzBanner.text = text || ''; mzBanner.said = false;
  mzHelpGoal();   // 「🏁 ゴール！」の 大きな 文字（4秒。ごほうびの 窓を とじても 見える ように 長め）
}
function drawMzFx(w, cy, T, now, S) {   // 画面の まん中（お米）から はじける。重さで 落ちて うすく なる。S：文字の 大きさの もと（画面の 点）
  if (mapCovered()) { if (mzBanner.t0) mzBanner.t0 = now; for (const p of mzFx) p.t0 = now; return; }   // ごほうびの 窓などが 開いている 間は 待って、とじたら はじめる
  const ba = (now - mzBanner.t0) / 1000;
  if (mzBanner.t0 && ba < 4) {   // ゴールの ★と 時間（さいごの 0.5秒で うすく）。「ついた〜！」は お米の 吹き出し
    ctx.globalAlpha = Math.min(1, (4 - ba) / 0.5);
    const big = Math.round(S * 1.6), y = Math.max(big, cy - S * 3.2) - Math.max(0, 0.3 - ba) * S * 6;   // 画面の 上に はみ出さない
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.font = `bold ${big}px "DotGothic16", sans-serif`; ctx.lineWidth = Math.max(4, big / 5); ctx.strokeStyle = '#1a1a1a'; ctx.fillStyle = '#ffe680';
    if (!mzBanner.said) { mzBanner.said = true; riceSay('ついた〜！', 3600, 'happy'); }   // 大きな「🏁 ゴール！」の 文字は やめて、お米が 吹き出しで 言う（10/29 店主「文字を 廃止して キャラクターとの 対話」）。窓を とじてから
    if (mzBanner.text) { const sm = Math.round(big * 0.5); ctx.font = `bold ${sm}px "DotGothic16", sans-serif`; ctx.lineWidth = Math.max(3, sm / 4); ctx.fillStyle = '#ffffff'; const ty = cy + T * 1.4; ctx.strokeText(mzBanner.text, w / 2, ty); ctx.fillText(mzBanner.text, w / 2, ty); }
    ctx.globalAlpha = 1;
  } else if (mzBanner.t0) mzBanner.t0 = 0;
  for (let i = mzFx.length - 1; i >= 0; i--) {
    const p = mzFx[i], a = (now - p.t0) / 1000;
    if (a > p.life) { mzFx.splice(i, 1); continue; }
    const x = w / 2 + (p.vx * a) * T, y = cy + (p.vy * a + 4.5 * a * a) * T, q = Math.max(2, Math.round(T / 5));
    ctx.globalAlpha = Math.max(0, 1 - a / p.life);
    // お米つぶは たて長（くるくる 回って はばが かわる）、葉は よこ長、金は 四角。四角（fillRect）だけで 描く
    const f = Math.abs(Math.cos(p.ph + a * (p.spin || 0))), pw = p.k === 'rice' ? Math.max(1, Math.round(q * (0.5 + 0.7 * f))) : p.k === 'leaf' ? Math.round(q * 1.6) : q, ph = p.k === 'rice' ? Math.round(q * 1.7) : p.k === 'leaf' ? Math.max(1, Math.round(q * (0.4 + 0.6 * f))) : q;
    ctx.fillStyle = '#222'; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, pw + 2, ph + 2);
    ctx.fillStyle = p.c; ctx.fillRect(Math.round(x), Math.round(y), pw, ph);
  }
  ctx.globalAlpha = 1;
}
// 新しい ゴールが きまった：画面の 上に「🏁 つぎの ゴール」と 名所の 名前・めいろの 道のりを 3秒（運営者の声「ゴールのわかりやすさを磨く」）
// 「🏁 ゴール！」の あと・窓が 開いている 間は 待つ。道のりが 分かってから（2秒 待っても 分からなければ 名前だけ）
function drawMzNext(w, cy, U, now) {
  if (mapCovered() || mzBanner.t0) { if (mzNext.t0) mzNext.t0 = now; return; }
  if (mzNext.want) {
    if (!mzRt.path && now - mzRt.t0 < 2000) return;
    mzNext.want = false; mzNext.t0 = now;
    mzNext.dist = mzRt.path ? (mzRt.path.length - 1) * MZ_K * TILE_M : 0;
  }
  const a = (now - mzNext.t0) / 1000;
  if (a > 3) { mzNext.t0 = 0; return; }   // （ゴールまでの めいろ図は 運営者の声「ゴールまでの迷路は削除」2026-10-29 で なくした）
  const S = Math.round(MZ_CLOCK_PX * U / 16), under = mzRt.t0 && mzRt.len0 ? Math.round(S * 1.5 + S * 0.85 + U * 0.3) : 0;   // 時間と ★の 札（drawMzClock）の 下から（横向きの 低い 画面では お米が 上の ほうに いて、札と 重なって 字が 読めなかった）
  const big = Math.round(U * 1.05), y = Math.max(big, cy - U * 5.6, under + Math.round(big * 0.8) * 0.9), d = mzNext.dist, dist = !d ? '' : d < 1000 ? `めいろで ${Math.round(d / 10) * 10}m` : `めいろで ${(d / 1000).toFixed(1)}km`;   // y：画面の 上に はみ出さない
  ctx.globalAlpha = Math.min(1, a / 0.25, (3 - a) / 0.4);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const lines = [['🏁 つぎの ゴール', Math.round(big * 0.8), '#ffe680'], [mzNext.name, big, '#ffffff'], [dist, Math.round(big * 0.7), '#bfefff']].filter(l => l[0]);
  let yy = y;
  ctx.fillStyle = 'rgba(10,20,30,.62)';
  const bw = Math.min(w - U, Math.max(...lines.map(([t, sz]) => { ctx.font = `bold ${sz}px "DotGothic16", sans-serif`; return ctx.measureText(t).width; })) + U * 1.2);
  const bh = lines.reduce((s, l) => s + l[1] * 1.35, 0) + U * 0.5;
  ctx.fillRect(Math.round(w / 2 - bw / 2), Math.round(y - lines[0][1] * 0.9), Math.round(bw), Math.round(bh));
  mzNext.box = [w / 2 - bw / 2, y - lines[0][1] * 0.9, w / 2 + bw / 2, y - lines[0][1] * 0.9 + bh]; mzNext.at = now;   // 縁の 矢印の 道のりの 札が これに 重なる ときは 描かない（drawMzGoal）
  for (const [t, sz, col] of lines) {
    ctx.font = `bold ${sz}px "DotGothic16", sans-serif`; ctx.lineWidth = Math.max(3, sz / 5); ctx.strokeStyle = '#1a1a1a'; ctx.fillStyle = col;
    let tt = t; while (ctx.measureText(tt).width > w - U * 2 && tt.length > 2) tt = tt.slice(0, -2) + '…';   // 長い 名前は 「…」
    ctx.strokeText(tt, w / 2, yy); ctx.fillText(tt, w / 2, yy); yy += sz * 1.35;
  }
  ctx.globalAlpha = 1;
}
const mzHud = { t: -1e9, r: [] };
function mzHudRects(now) {   // 地図の 上に 重なる ボタン・札の 四角（キャンバスの 画素。0.5秒ごとに 測りなおす）
  if (now - mzHud.t < 500) return mzHud.r;
  mzHud.t = now;
  const c = cv.getBoundingClientRect(), k = c.width ? cv.width / c.width : 1;
  mzHud.r = ['.px-zoom', '#pxMeiro', '#koyomi'].map(q => document.querySelector(q)).filter(e => e && !e.hidden && e.getClientRects().length)
    .map(e => { const b = e.getBoundingClientRect(); return [(b.left - c.left) * k, (b.top - c.top) * k, (b.right - c.left) * k, (b.bottom - c.top) * k]; })
    .filter(r => r[2] > r[0] && r[3] > r[1]);
  return mzHud.r;
}
const MZ_TAP_K = 0.5;   // 矢印の「🗺 タップ」の 字の 大きさ（矢印の 大きさ U に かける。U は 24点 から なので 12点 より 大きい。0.36 で 9点ほどの 小さい 字 だった。運営者の声「大きい文字シンプルに」）
function drawMzGoal(gt, ox, oy, T, w, vh, cy, dpr, now) {
  const p = toTile(gt.lat, gt.lng), ex = ox + p.x * T, ey = oy + p.y * T, U = Math.min(Math.max(T, Math.round(24 * dpr)), Math.round(32 * dpr)), pulse = (Math.sin(now / 260) + 1) / 2;   // U：絵の 大きさの もと（地図を 小さく していても 見える 大きさ。大きく しても 画面の 32点まで）
  const far = mzRt.path ? (mzRt.path.length - 1) * MZ_K * TILE_M : Math.hypot(p.x - (rp.x === null ? p.x : rp.x), p.y - (rp.y === null ? p.y : rp.y)) * TILE_M;
  const dist = far < 1000 ? `${Math.round(far / 10) * 10}m` : `${(far / 1000).toFixed(1)}km`;
  mzMap.goalLab = null;
  const label = (t, x, y, size, col) => { ctx.font = `bold ${size}px "DotGothic16", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size / 4); ctx.strokeStyle = '#1a1a1a'; ctx.strokeText(t, x, y); ctx.fillStyle = col; ctx.fillText(t, x, y); };
  const flag = (x, y, s) => {   // 白黒の 市松の 旗（x, y：さおの 下）
    const q = Math.max(1, Math.round(s / 8));
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(Math.round(x) - q, Math.round(y - s * 1.1), q * 2 + 1, Math.round(s * 1.1));
    ctx.fillStyle = '#5a3a1a'; ctx.fillRect(Math.round(x), Math.round(y - s * 1.1), q, Math.round(s * 1.1));
    const fw = s * 0.9, fh = s * 0.6, cw = fw / 4, ch = fh / 3, fx = x + q, fy = y - s * 1.1;
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(Math.round(fx), Math.round(fy) - q, Math.round(fw) + q, Math.round(fh) + 2 * q);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) { ctx.fillStyle = (i + j) % 2 ? '#1a1a1a' : '#ffffff'; ctx.fillRect(Math.round(fx + i * cw), Math.round(fy + j * ch), Math.ceil(cw), Math.ceil(ch)); }
  };
  if (ex >= 0 && ey >= 0 && ex <= w && ey <= vh) {
    const r = Math.max(U * 0.8, G.reachOf(gt) / TILE_M * T) * (0.92 + pulse * 0.12);
    ctx.lineWidth = Math.max(3, U * 0.16);
    ctx.strokeStyle = 'rgba(26,26,26,.75)'; ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = Math.max(2, U * 0.1); ctx.strokeStyle = `rgba(255,213,79,${0.6 + pulse * 0.4})`; ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.stroke();
    flag(ex, ey - U * 0.3, U * 1.3);
    // 文字は 画面の はしで 切れない ように、まん中を 内がわへ ずらす（ゴールが 画面の はしに あると、名前の 頭が 切れて 読めなかった）
    const inside = (t, size) => { ctx.font = `bold ${size}px "DotGothic16", sans-serif`; const hw = ctx.measureText(t).width / 2 + Math.max(3, size / 4); return Math.max(hw, Math.min(w - hw, ex)); };
    const gs = Math.round(U * 0.62), bob = pulse * U * 0.12;
    // 旗の 上に 入らない（ゴールが 画面の 上の ほう。時計の 札の 下まで）ときは 旗の 下に（大きく した 名前が 画面の 上で 切れていた）
    const below = ey - U * 2.9 - gs * 0.6 < Math.round(MZ_CLOCK_PX * dpr * 2.35), yG = below ? ey + U * 1.55 : ey - U * 2.9 - bob, yN = below ? ey + U * 0.95 : ey - U * 2.15 - bob;
    label('ゴール', inside('ゴール', gs), yG, gs, '#ffe680');
    { let nm = gt.name || ''; const ns = Math.round(U * 0.56);   // 名前も 大きく（0.45 → 0.56。運営者の声「大きい文字シンプルに」2026-10-27）
      ctx.font = `bold ${ns}px "DotGothic16", sans-serif`; while (nm.length > 2 && ctx.measureText(nm).width > w * 0.8) nm = nm.slice(0, -2) + '…';   // 名所の 名前も（どこが ゴールか 名前で 分かる。長い 名前は「…」）
      if (nm) { const nx = inside(nm, ns), hw = ctx.measureText(nm).width / 2; label(nm, nx, yN, ns, '#ffffff'); mzMap.goalLab = { x0: nx - hw, x1: nx + hw, w, ex, nm, y: Math.round(yN), ns }; } }   // 旗の 上（goalLab：プレイテストで 見る）
    mzMap.arrow = null; mzNext.arrowDim = false;
    return;
  }
  // 上の 縁は、時計の 札（かかしの のこりの 札まで）より 下に（上に ゴールが あると、矢印と 旗が 時計の 札や 左上の 札に 重なっていた）
  const a = Math.atan2(ey - cy, ex - w / 2), m = U * 1.6, S = Math.round(MZ_CLOCK_PX * dpr), mt = Math.max(m, S * (2.35 + 1.9 * ((mzScare.until > now) + (mzSpring.until > now))) + U * 1.3);   // 矢印の 先（U×1.1 と ふくらみ）まで 札の 下
  const px = Math.min(Math.abs((w / 2 - m) / Math.cos(a)), Math.abs(Math.max(U, Math.sin(a) < 0 ? cy - mt : vh - m - cy) / Math.sin(a)));
  let qx = w / 2 + Math.cos(a) * px, qy = cy + Math.sin(a) * px;
  const k = 1 + pulse * 0.08, R = U * 1.25;
  // 右上の ボタン（せかいちず・大きさ）・🌀・左上の こよみの 札に 重なる ときは、縁に そって 上か 下へ ずらす（ボタンの 下に かくれて、タップも ボタンに とられていた）
  if (!rec) for (const r of mzHudRects(now)) {
    if (!(qx + R > r[0] && qx - R < r[2] && qy + R > r[1] && qy - R < r[3])) continue;
    const down = r[3] + R, up = r[1] - R;
    qy = down <= vh - m && (up < mt || down - qy <= qy - up) ? down : Math.max(mt, up);
  }
  mzMap.pin = [qx, qy, R, a];   // 矢印の 位置（テスト用）
  // 「🏁 つぎの ゴール」の 札（同じ こまで 先に 描く）に 矢印が かかる 間は うすく 描く（向きは 見えて、札の 字は 読める。
  //   自分で 遊んで 分かった：スマホを 横に した 740×360 で、上の ゴールの 矢印が 札の「つぎの」の 字に かぶって 読めなかった）
  const nb0 = mzNext.at === now && mzNext.box;
  mzNext.arrowDim = !!nb0 && qx + R * k > nb0[0] && qx - R * k < nb0[2] && qy + R * k > nb0[1] && qy - R * k < nb0[3];
  ctx.save(); if (mzNext.arrowDim) ctx.globalAlpha *= 0.3;
  ctx.translate(qx, qy); ctx.rotate(a); ctx.scale(k, k);   // 大きな 矢印（ゴールの ほうへ）
  // 後ろに 切れこみの ある 矢じり（自分で 遊んで 分かった：正三角形に 近い 三角だと、ななめの とき どの 角が 先か 分からず、北東の ゴールで 左向きに 見えた）
  const dart = (t, b, h, n) => { ctx.beginPath(); ctx.moveTo(U * t, 0); ctx.lineTo(-U * b, -U * h); ctx.lineTo(-U * n, 0); ctx.lineTo(-U * b, U * h); ctx.closePath(); ctx.fill(); };
  ctx.fillStyle = '#1a1a1a'; dart(1.2, 0.55, 0.8, 0.15);
  ctx.fillStyle = '#ffd54f'; dart(0.9, 0.36, 0.55, 0.02);
  ctx.restore();
  const bx = qx - Math.cos(a) * U * 1.5, by = qy - Math.sin(a) * U * 1.5;   // 矢印の 内がわに 🏁 と 道のり
  // 「🏁 つぎの ゴール」の 札（同じ こまで 先に 描く）に 重なる 間は 🏁 と 道のりを 描かない（札にも「めいろで 2.0km」が ある。
  // 自分で 遊んで 分かった：360×640 で 縁の「2.0km」と 旗が 札の 名前の 行に かぶって 読めなかった）。矢印は 残す（向きは 分かる）
  const nb = mzNext.at === now && mzNext.box, labHide = !!nb && bx - U * 1.2 < nb[2] && bx + U * 2.2 > nb[0] && by - U * 1.0 < nb[3] && by + U * 1.0 > nb[1];
  mzNext.labHide = labHide;
  if (!labHide) {
    flag(bx - U * 0.45, by + U * 0.15, U * 0.7);
    label(dist, bx + U * 0.5, by, Math.round(U * 0.62), '#ffffff');   // 道のりは 大きく
  }
  if (rec) { mzMap.arrow = null; return; }   // Godot で 描く ときは 矢印の タップを 受けない
  if (!mzMap.tapped && !labHide) label('🌏 タップ', bx, by + U * 0.8, Math.round(U * MZ_TAP_K), '#bfefff');   // 矢印を タップすると せかいちず。1回 タップしたら もう 出さない（小さい 字を へらす）
  mzMap.arrow = [Math.min(qx, bx) - U * 1.3, Math.min(qy, by) - U * 1.3, Math.max(qx, bx) + U * 1.3, Math.max(qy, by) + U * 1.3];
}
const mzMap = { arrow: null, pin: null, tapped: false };   // 縁の 矢印（ゴールまでの めいろ図は 2026-10-29 に なくした）
try { mzMap.tapped = localStorage.getItem('nsg_mz_arrow_tap') === '1'; } catch (e) { /* noop */ }
// 縁の 矢印を タップすると せかいちず（本当の 地図・地名つき）を、お米と ゴールが 両方 入る ように 開く（運営者の声「ゴールがどこなのかわからない」）。せかいちずには ゴールの 🏁 と 名前と、お米からの 点線
function mzGoalWorld() {
  setWorld(true);
  G.toast('🌏 ゴールは 🏁 の 所（👣 で めいろに もどる）');
}
// ゆるい めいろの 生け垣：道すじを 太い 線で なぞって、外がわの 帯（MZ_HEDGE）を 生け垣に、内がわ（MZ_HALF）を くりぬいて 通路に する。
// 重ねた 絵（くりぬき）を 使うので 下絵に 描いて から 貼る。下絵は 地図の 1/8 マスを 1点に した 小さな 絵（ドット絵の 地図に そろい、スマホでも 軽い）。影は 右下へ ずらした 帯
const mzLayer = { a: null, b: null, c: null, pats: null, key: '', geo: null };
function mzLayerCtx(k, w, h, q, sx, sy, m) {   // q：下絵の 1点が 画面の 何点か・(sx, sy)：下絵の 左上が 画面の どこか
  let c = mzLayer[k];
  if (!c) c = mzLayer[k] = document.createElement('canvas');
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, w, h);
  x.setTransform(1 / q, 0, 0, 1 / q, -sx / q, -sy / q); x.transform(m.a, m.b, m.c, m.d, m.e, m.f);   // 画面の 座標で 描ける ように
  x.lineCap = x.lineJoin = 'round';
  return x;
}
// 西尾らしい 生け垣（2026-10-26 店主「西尾らしさの生垣」）：マスの まわり（地図の 5×5 マス）を 見て 生け垣の 種類を かえる
// ・茶畑の そば → 丸く 刈りこんだ 茶の木（西尾の 抹茶）・川や 池の そば → 石垣・西尾城跡から 800m 以内の 町なか → 黒塀（城下町）・そのほか → いつもの 生け垣
// ・地区ごと（店主「地区ごとの生垣も」。地区は その場所に いちばん 近い 注目スポットの 地区＝dots.js の areaOf。地区の 紹介 areas.json に そろえる）：
//   一色 → 漁網の 垣（漁港・うなぎの 養殖池。水の そばも 網）・吉良 → 土手（堤防づくりの 名君）・幡豆 → 松の 垣（三ヶ根山と 国定公園の 海べ）・佐久島 → 黒塀（島の 黒壁の 集落）
// ・田んぼの そば → 稲の 垣（店主「さらに西尾らしく」。西尾は 田んぼの 町。こよみの 田んぼと そろえて 青田・水田は 緑の 稲、実りは 黄金の 穂、刈田・田おこしは はざ掛けの 稲わら）
// 生け垣に 当たって 舞う くず（[こい, うすい]）：いつもの=若葉・茶の木=茶の 葉・石垣=小石・黒塀=木くず・網=糸くず・土手=土くれ・松=松葉・田んぼ=わら
const MZ_BITS = { ike: ['168,222,104', '236,244,150'], cha: ['86,140,52', '150,196,90'], ishi: ['150,146,136', '204,200,188'], kuro: ['96,70,46', '156,116,78'], ami: ['228,220,196', '120,156,176'], dote: ['140,106,70', '190,154,108'], matsu: ['62,112,62', '124,164,84'], ine: ['214,190,110', '238,222,160'] };
const MZ_STYLES = ['ike', 'cha', 'ishi', 'kuro', 'ami', 'dote', 'matsu', 'ine'], MZ_CASTLE_R = 800 / TILE_M;
const MZ_AREA_STYLE = { isshiki: 'ami', kira: 'dote', hazu: 'matsu', sakushima: 'kuro' };
// 地区は いちばん 近い 町名（住所）で きめる：合併の あとも 住所に のこる「一色町○○」「吉良町○○」、幡豆は 東幡豆町・西幡豆町・寺部町・鳥羽町。
// （いちばん 近い 注目スポットの 地区＝dots.js の areaOf では、地区の 境の 町の 6%（南の 鵜ケ池町・善明町、東の 駒場町 など）が となりの 地区に なった。2026-10-26 しらべ）
const MZ_HAZU = /^(東幡豆町|西幡豆町|寺部町|鳥羽町|幡豆町)/;
let mzTownsN = -1, mzTownsNishio = [];
function mzArea0(cx, cy) {   // マスの 地区（西尾市の 中だけ。わからなければ ''）。null：まだ わからない（町名・名所・地区の しくみが 読めて いない）
  if (!G.cityAt) return null;
  const ll = toLatLng((cx + 0.5) * MZ_K, (cy + 0.5) * MZ_K), c = G.cityAt(ll.lat, ll.lng);
  if (!c || c.name !== '西尾市') return '';
  if (mzTownsN !== towns.length) { mzTownsN = towns.length; mzTownsNishio = towns.filter(t => t[3] === '西尾市'); }
  const px = (cx + 0.5) * MZ_K, py = (cy + 0.5) * MZ_K;
  let best = null, bd = 200 * 200;   // 1.6km 以内の 町名
  for (const t of mzTownsNishio) { const d = (t[0] - px) * (t[0] - px) + (t[1] - py) * (t[1] - py); if (d < bd) { bd = d; best = t[2]; } }
  if (best) return /^一色町佐久島/.test(best) ? 'sakushima' : /^一色町/.test(best) ? 'isshiki' : /^吉良町/.test(best) ? 'kira' : MZ_HAZU.test(best) ? 'hazu' : 'nishio';
  const D = window.NISHIO_DOTS;   // 町名が ない 所（田畑・山の 中・町名が まだ 読めて いない）は 注目スポットで
  if (!towns.length || !D || !D.areaOf || !G.spots || !G.spots.length) return null;
  return D.areaOf(ll.lat, ll.lng);
}
const mzStyleC = new Map();
let mzCastle = null;
function mzStyle(cx, cy) {
  const k = cx + ',' + cy;
  let v = mzStyleC.get(k);
  if (v) return v;
  let tea = 0, water = 0, town = 0, paddy = 0, unread = 0;
  for (let j = -1; j <= MZ_K; j++) for (let i = -1; i <= MZ_K; i++) {
    const c = codeAt(cx * MZ_K + i, cy * MZ_K + j);
    if (c === C.X) unread++; else if (c === C.E) tea++; else if (c === C.A) water++; else if (c === C.T || c === C.Q || c === C.B) town++; else if (c === C.F || c === C.U) paddy++;
  }
  if (!mzCastle) { const sp = (G.spots || []).find(p => p.id === 'f-nishio-castle'); if (sp) mzCastle = toTile(sp.lat, sp.lng); }
  const castle = mzCastle && Math.hypot((cx + 0.5) * MZ_K - mzCastle.x, (cy + 0.5) * MZ_K - mzCastle.y) < MZ_CASTLE_R;
  const area = mzArea0(cx, cy), as = area && MZ_AREA_STYLE[area];
  v = tea >= 3 ? 'cha' : water >= 4 ? (as === 'ami' ? 'ami' : 'ishi') : as || (castle && town >= 6 ? 'kuro' : paddy >= 10 ? 'ine' : 'ike');   // 田んぼ：まわり 25マス（5×5）の うち 10マス 以上
  if (!unread && mzCastle && area !== null) mzStyleC.set(k, v);   // 地図・名所・地区が わかってから おぼえる（まだなら あとで きめなおす）
  return v;
}
function mzHedgePat(x, ox, oy, T, style = 'ike') {   // 生け垣の 葉っぱの 模様（16×16 点・地図に くっついて 動く）。春は ところどころ つつじの 花
  const spring = mapSeason() === 0, key = style + (spring ? 's' : 'n') + (style === 'ine' ? PADDY_TILE : '');   // 稲の 垣は 田んぼの ようすごとに
  if (!mzLayer.pats) mzLayer.pats = {};
  if (!mzLayer.pats[key]) {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d'), px = (col, a, b, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(a, b, w, h); };
    let h = 2463534242;
    const rn = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
    if (style === 'cha') {   // 茶の木：丸く 刈りこんだ 明るい 黄緑の 株（帯は 細いので 形より 色で わかる ように）
      px('#4f9a32', 0, 0, 16, 16);
      for (let i = 0; i < 46; i++) { const r = rn(); px(r < 0.35 ? '#2e6a24' : r < 0.8 ? '#7cbf45' : '#b4e070', (rn() * 16) | 0, (rn() * 16) | 0, 1 + (rn() < 0.4), 1); }   // 影の 葉・葉・新芽
      for (let i = 0; i < 4; i++) px('#7a5a3a', (rn() * 16) | 0, (rn() * 16) | 0);   // 株の あいだの 土
    } else if (style === 'ishi') {   // 石垣：大きさの ちがう 石を 組んだ 灰色の 壁
      px('#7a7c74', 0, 0, 16, 16);   // 目地（黒塀と まちがえない ように 明るめの 灰色）
      for (const [a, b, w, hh] of [[0, 0, 6, 4], [7, 0, 9, 4], [0, 5, 4, 5], [5, 5, 6, 5], [12, 5, 4, 5], [0, 11, 8, 5], [9, 11, 7, 5]]) { px('#acaea3', a, b, w - 1, hh - 1); px('#d2d4c8', a, b, w - 1, 1); px('#909288', a + w - 2, b + 1, 1, hh - 2); }
    } else if (style === 'ami') {   // 漁網の 垣（一色）：杭に かけた 青緑の 網と、だいだいの 浮き
      px('#2d5f6e', 0, 0, 16, 16);
      for (let i = 0; i < 16; i++) { px('#8ec3cc', i, (i * 2) % 16); px('#8ec3cc', i, (31 - i * 2) % 16); px('#5f97a3', i, (i * 2 + 8) % 16); }   // 網目
      for (const [a, b] of [[3, 2], [11, 10]]) { px('#ff8a3c', a, b, 2, 2); px('#ffd0a0', a, b); }   // 浮き
    } else if (style === 'dote') {   // 土手（吉良）：土の 堤に 芝
      px('#8a6a44', 0, 0, 16, 16);
      for (let i = 0; i < 40; i++) { const r = rn(); px(r < 0.5 ? '#6aa84f' : r < 0.75 ? '#4f8a3a' : '#a5845a', (rn() * 16) | 0, (rn() * 16) | 0, 1 + (rn() < 0.5), 1); }
    } else if (style === 'matsu') {   // 松の 垣（幡豆）：こい 緑の 枝葉と 茶色の 幹
      px('#1f4a36', 0, 0, 16, 16);
      for (let i = 0; i < 36; i++) { const r = rn(); px(r < 0.5 ? '#2f6448' : r < 0.85 ? '#4a8a5e' : '#7a5236', (rn() * 16) | 0, (rn() * 16) | 0, 2, 1); }
    } else if (style === 'ine') {   // 稲の 垣：こよみの 田んぼに あわせる
      if (PADDY_TILE === 'gold') {   // 実り：黄金の 穂が 頭を たれる
        px('#a8892e', 0, 0, 16, 16);
        for (let i = 0; i < 44; i++) { const r = rn(); px(r < 0.3 ? '#8a6f22' : r < 0.8 ? '#d8b84e' : '#f0d878', (rn() * 16) | 0, (rn() * 16) | 0, 1, 1 + (rn() < 0.6)); }   // 穂の かげ・穂・てかり
      } else if (PADDY_TILE === 'stubble' || PADDY_TILE === 'soil') {   // 刈田・田おこし：はざ掛け（木の 横木に 稲わらの 束）
        px('#8a6a44', 0, 0, 16, 16);
        for (let a = 0; a < 16; a += 8) px('#5a3e26', 0, a + 1, 16, 1);   // 横木
        for (let a = 0; a < 16; a += 2) for (const b of [2, 10]) { px('#d8c27a', a, b, 1, 4); px('#b89a52', a + 1, b, 1, 4); }   // 稲わらの 束
      } else {   // 青田・水田：すじに ならんだ 緑の 稲
        px('#4f8a2e', 0, 0, 16, 16);
        for (let a = 0; a < 16; a += 3) for (let b = 0; b < 16; b++) if (rn() < 0.8) px(rn() < 0.6 ? '#7cbf45' : '#9ad25e', a, b, 1, 1);   // 株の すじ
        for (let i = 0; i < 10; i++) px('#3a6e22', (rn() * 16) | 0, (rn() * 16) | 0);
      }
    } else if (style === 'kuro') {   // 黒塀：焼き杉の 板の 黒と、ところどころ しっくいの 白い 笠
      px('#2a2724', 0, 0, 16, 16);
      for (let a = 0; a < 16; a += 4) { px('#3a3530', a, 0, 1, 16); px('#1c1a18', a + 3, 0, 1, 16); }
      for (let i = 0; i < 12; i++) px('#4a443d', (rn() * 16) | 0, (rn() * 16) | 0, 1, 2);   // 木目
      px('#8f877a', 0, 0, 16, 1); px('#5a544b', 0, 1, 16, 1);   // 笠の 瓦（白い しまに 見えない ように 暗めに）
    } else {
      px('#2f7a58', 0, 0, 16, 16);
      for (let i = 0; i < 70; i++) { const r = rn(); g.fillStyle = r < 0.4 ? '#256548' : r < 0.8 ? '#3d9168' : '#5aac7c'; g.fillRect((rn() * 16) | 0, (rn() * 16) | 0, 1 + (rn() < 0.3), 1); }   // こい葉・うすい葉・てかり
      if (spring) for (let i = 0; i < 3; i++) { const fx = (rn() * 14) | 0, fy = (rn() * 14) | 0; g.fillStyle = '#f07aa0'; g.fillRect(fx, fy, 2, 2); g.fillStyle = '#ffd0e0'; g.fillRect(fx, fy, 1, 1); }
    }
    mzLayer.pats[key] = { c, p: null };
  }
  const P = mzLayer.pats[key];
  P.p = x.createPattern(P.c, 'repeat');
  if (P.p && P.p.setTransform && window.DOMMatrix) P.p.setTransform(new DOMMatrix().translate(ox, oy).scale(T / 8));   // 模様の 1点 ＝ 地図の 1/8 マス
  return P.p;
}
function drawMaze(tx0, ty0, tx1, ty1, ox, oy, T) {
  if (rec) { drawMazeGrid(tx0, ty0, tx1, ty1, ox, oy, T); return; }   // Godot で 描く 試作：記録係は くりぬきの 絵を 送れないので、これまでの 生け垣
  const c0 = Math.floor(tx0 / MZ_K) - 1, r0 = Math.floor(ty0 / MZ_K) - 1, c1 = Math.ceil(tx1 / MZ_K), r1 = Math.ceil(ty1 / MZ_K), S = MZ_K * T;
  const m = ctx.getTransform(), live = mzSoft.dv !== 0 && mazeOn(), dk = mazeOn() && mzSoft.dent > 0.01 ? [mzSoft.dent.toFixed(2), mzSoft.x.toFixed(1), mzSoft.y.toFixed(1)].join('/') : '';   // ぷるぷる ゆれて いる 間は 毎こま 描く。おさまった へこみ（押しつけた まま）は 下絵に 入れて 使い回す
  // 下絵の 使い回し：画面の 位置・大きさ・読めた 区域・参道・生け垣の 種類・季節が 同じで、生け垣が へこんで いなければ、前の 下絵を そのまま 貼る（止まって いる 間の 重さを へらす）
  const key = [ox, oy, T, ctx.canvas.width, ctx.canvas.height, m.a, m.b, m.c, m.d, m.e, m.f, mzCurveC.key, mzStyleC.size, mapSeason(), dk].join();
  if (!live && key === mzLayer.key) { mzBlit(); return; }
  const blocks = [], net = new Path2D(), nets = {};
  let n = 0;
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
    const ty = mzType(cx, cy);
    if (ty < 0) continue;
    if (ty === 0 && !mzSpotCell(cx, cy)) blocks.push([ox + cx * S, oy + cy * S]);   // 壁の かたまりの 台（地図は 見える こさ。下絵に 描く）
    const cs = mzCurves(cx, cy);
    if (cs && cs.length) {
      const st = mzStyle(cx, cy), sn = nets[st] || (nets[st] = new Path2D());
      for (const q of cs) for (const p of [net, sn]) { p.moveTo(ox + q[0][0] * T, oy + q[0][1] * T); for (let i = 1; i < q.length; i++) p.lineTo(ox + q[i][0] * T, oy + q[i][1] * T); }
      n += cs.length;
    }
  }
  mzLayer.key = live ? '' : key; mzLayer.geo = null;
  if (!n && !blocks.length) return;
  const q = T / 8, sx = (((ox % q) + q) % q) - q, sy = (((oy % q) + q) % q) - q;   // 下絵の 点を 地図の 1/8 マスに そろえる
  const W = Math.ceil((ctx.canvas.width - sx) / q) + 1, H = Math.ceil((ctx.canvas.height - sy) / q) + 1;
  const wo = 2 * (MZ_HALF + MZ_HEDGE) * T, wi = 2 * MZ_HALF * T, u = Math.max(1, Math.round(T / 8)), o = Math.max(1, Math.round(T / 4));
  const L = mzLayerCtx('a', W, H, q, sx, sy, m);
  L.imageSmoothingEnabled = false;
  L.fillStyle = 'rgba(28,70,52,.4)'; for (const [X, Y] of blocks) L.fillRect(X, Y, S, S);   // 壁の かたまりの 台
  L.strokeStyle = '#0d2219'; L.lineWidth = wo; L.stroke(net);   // 生け垣の 外の 黒い ふち
  L.lineWidth = wo - 2 * u;
  for (const st of MZ_STYLES) if (nets[st]) { L.strokeStyle = mzHedgePat(L, ox, oy, T, st) || '#2f7a58'; L.stroke(nets[st]); }   // 葉っぱ・茶の木・石垣・黒塀（マスの まわりで 種類を かえる）
  L.strokeStyle = '#0d2219'; L.lineWidth = wi + 2 * u; L.stroke(net);   // 通路がわの 黒い ふち
  L.globalCompositeOperation = 'destination-out'; L.lineWidth = wi; L.stroke(net);   // 通路を くりぬく
  const dent = mzSoft.dent > 0.01 && mazeOn() ? [ox + (mzSoft.x + mzSoft.ux * (MZ_TUBE + mzSoft.dent)) * T, oy + (mzSoft.y + mzSoft.uy * (MZ_TUBE + mzSoft.dent)) * T, (MZ_HALF - MZ_TUBE) * T] : null;   // やわらかい 生け垣の へこみ（お米の 形に 押されて のびる）
  if (dent) {
    const a = Math.atan2(mzSoft.uy, mzSoft.ux), stretch = 1 + Math.min(2.6, mzSoft.dent * 10);   // 当たった 所を 中心に 横へ 広く のびる（膜のように。お米の 両わきで しなるのが 見える ように：お米の 真下だけだと 絵に かくれて 見えなかった）
    const glow = Math.min(1, mzSoft.dent / 0.25), gr = dent[2] + 0.35 * T;   // のびて うすく なった 所を 明るく（ぴんと はった 膜）
    L.globalCompositeOperation = 'source-atop'; L.fillStyle = `rgba(200,245,170,${(0.6 * glow).toFixed(2)})`; L.beginPath(); L.ellipse(dent[0], dent[1], gr, gr * stretch, a, 0, Math.PI * 2); L.fill();
    L.fillStyle = '#0d2219'; L.beginPath(); L.ellipse(dent[0], dent[1], dent[2] + u, (dent[2] + u) * stretch, a, 0, Math.PI * 2); L.fill();
    L.globalCompositeOperation = 'destination-out'; L.beginPath(); L.ellipse(dent[0], dent[1], dent[2], dent[2] * stretch, a, 0, Math.PI * 2); L.fill();
    dent.push(a, stretch);
  }
  const B = mzLayerCtx('b', W, H, q, sx, sy, m);
  B.translate(o, o); B.strokeStyle = '#000'; B.lineWidth = wo; B.stroke(net);
  B.globalCompositeOperation = 'destination-out'; B.lineWidth = wi; B.stroke(net);   // 影：右下へ ずらした 生け垣の 帯
  if (dent) { B.beginPath(); B.ellipse(dent[0], dent[1], dent[2], dent[2] * dent[4], dent[3], 0, Math.PI * 2); B.fill(); }
  const C = mzLayer.c || (mzLayer.c = document.createElement('canvas'));
  if (C.width !== W || C.height !== H) { C.width = W; C.height = H; }
  const X = C.getContext('2d'); X.clearRect(0, 0, W, H); X.globalAlpha = 0.32; X.drawImage(mzLayer.b, 0, 0); X.globalAlpha = 1; X.drawImage(mzLayer.a, 0, 0);   // 影（うすく）と 生け垣を 小さい 下絵の まま 1枚に（画面の 大きさで 貼るのは 1回だけ。2回 貼ると 1コマの 約16%）
  mzLayer.geo = [sx, sy, W * q, H * q];
  mzBlit();
}
function mzBlit() {   // 生け垣の 下絵を 画面へ（影と 生け垣と 台を 1枚に した もの）
  const g = mzLayer.geo;
  if (!g) return;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mzLayer.c, g[0], g[1], g[2], g[3]);
  ctx.restore();
}
function drawMazeGrid(tx0, ty0, tx1, ty1, ox, oy, T) {   // これまでの 直角の めいろの 壁：盤の めいろ（meiro.js）と 同じ 緑の 立った 壁（右下に 影・黒い ふち・上と左の 面に てかり）。壁の かたまりは 緑の 台で うっすら おおう
  const c0 = Math.floor(tx0 / MZ_K) - 1, r0 = Math.floor(ty0 / MZ_K) - 1, c1 = Math.ceil(tx1 / MZ_K), r1 = Math.ceil(ty1 / MZ_K), S = MZ_K * T;
  const lw = Math.max(2, Math.round(T / 2)), u = Math.max(1, Math.round(T / 8)), o = Math.max(1, Math.round(T / 4)), segs = [];
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
    const ty = mzType(cx, cy);
    if (ty < 0) continue;
    const X = ox + cx * S, Y = oy + cy * S, go = (x, y) => mzType(x, y) === 1 || mzSpotCell(x, y);   // 入れる マス（通路・名所への 参道）
    if (!go(cx, cy)) { if (ty === 0) { ctx.fillStyle = 'rgba(28,70,52,.4)'; ctx.fillRect(X, Y, S, S); } continue; }   // 台（地図は 見える こさ）
    if (!mzOpen(cx, cy, 1, 0)) segs.push([X + S - lw / 2, Y - lw / 2, lw, S + lw]);
    if (!mzOpen(cx, cy, 0, 1)) segs.push([X - lw / 2, Y + S - lw / 2, S + lw, lw]);
    if (!go(cx - 1, cy) && mzType(cx - 1, cy) >= 0) segs.push([X - lw / 2, Y - lw / 2, lw, S + lw]);   // 左・上は となりが 入れない マスの ときだけ（入れる マスどうしは 左・上の マスが 描く）
    if (!go(cx, cy - 1) && mzType(cx, cy - 1) >= 0) segs.push([X - lw / 2, Y - lw / 2, S + lw, lw]);
  }
  ctx.fillStyle = 'rgba(0,0,0,.32)'; for (const [X, Y, w, h] of segs) ctx.fillRect(X + o, Y + o, w, h);   // 影
  const hi = hedgeImg();
  if (hi && T % 16 === 0) { drawHedges(hi, segs, ox, oy, T, S, lw); return; }   // Blender の 生け垣（読めない あいだと、半端な 大きさの ときは 下の 平らな 壁）
  ctx.fillStyle = '#0d2219'; for (const [X, Y, w, h] of segs) ctx.fillRect(X, Y, w, h);   // 黒い ふち
  ctx.fillStyle = '#2f7a58'; for (const [X, Y, w, h] of segs) ctx.fillRect(X + u, Y + u, w - 2 * u, h - 2 * u);   // 緑の 壁
  ctx.fillStyle = 'rgba(200,255,220,.55)'; for (const [X, Y, w, h] of segs) { if (w > h) ctx.fillRect(X + u, Y + u, w - 2 * u, u); else ctx.fillRect(X + u, Y + u, u, h - 2 * u); }   // 上・左の 面の てかり
}
// めいろの 生け垣の 絵（Blender：tools/blender/hedge.py → nishio-go/art/hedge.png）
// シート：横の 帯（128×8）・横の 花の 帯・たての 帯（8×128）・たての 花の 帯・かどの 株 4つ（12×12）。帯は 8マスで くり返して つながるので、
// 地図の 位置で 帯を 切りとって 貼る（どんなに 長い 生け垣でも つなぎ目が 出ない）。春（桜の ころ）は ところどころ つつじの 花の 帯と 花の 株
const HEDGE = { img: null, req: false };
function hedgeImg() {
  if (!HEDGE.req) {
    HEDGE.req = true;
    const im = new Image();
    im.onload = () => { HEDGE.img = im; dirty = true; };
    im.onerror = () => { setTimeout(() => { HEDGE.req = false; }, 15000); };   // 読めなければ、しばらくして もう一度
    im.src = 'nishio-go/art/hedge.png';
  }
  return HEDGE.img;
}
function drawHedges(img, segs, ox, oy, T, S, lw) {
  const k = T / 16, LP = 128, spring = mapSeason() === 0, corners = new Map();
  const hash = (a, b, c) => { let h = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791); h = (h ^ (h >>> 13)) * 1274126177; return (h ^ (h >>> 16)) >>> 0; };
  for (const [X, Y, w, h] of segs) {
    const horiz = w > h, gx = Math.round((X + lw / 2 - ox) / S), gy = Math.round((Y + lw / 2 - oy) / S);   // さかいの はじまりの かど（めいろの マスの 番号）
    const flower = spring && hash(gx, gy, horiz ? 1 : 2) % 3 === 0;
    if (horiz) {
      const sy = flower ? 8 : 0;
      for (let x = X; x < X + w - 0.5;) {   // 帯を 地図の 位置で 切りとって、はしまで 来たら 帯の はじめから
        const u = ((Math.round((x - ox) / k) % LP) + LP) % LP, pw = Math.min((LP - u) * k, X + w - x);
        ctx.drawImage(img, u, sy, pw / k, 8, x, Y, pw, h);
        x += pw;
      }
    } else {
      const sx = flower ? 8 : 0;
      for (let y = Y; y < Y + h - 0.5;) {
        const v = ((Math.round((y - oy) / k) % LP) + LP) % LP, ph = Math.min((LP - v) * k, Y + h - y);
        ctx.drawImage(img, sx, 16 + v, 8, ph / k, X, y, w, ph);
        y += ph;
      }
    }
    corners.set(`${gx},${gy}`, [gx, gy]);
    corners.set(horiz ? `${gx + 1},${gy}` : `${gx},${gy + 1}`, horiz ? [gx + 1, gy] : [gx, gy + 1]);
  }
  const P = 12 * k;
  for (const [gx, gy] of corners.values()) {   // かどの 株（生け垣の つなぎ目を かくす）
    const hv = hash(gx, gy, 7), i = spring && hv % 4 === 0 ? 3 : hv % 3;
    ctx.drawImage(img, 20 + i * 14, 20, 12, 12, ox + gx * S - P / 2, oy + gy * S - P / 2, P, P);
  }
}
function mzDentStep(dt) {   // 生け垣の へこみの 絵：お米より 大きく ついていき、はなれると ぷるぷると もどる。お米が 止まって 動きの 処理が 早く おわる こまでも 回す（止まった まま へこみが のこり、毎こま 描きなおして いた。Codex の 指摘）
  if (!mazeOn()) { mzSoft.dent = mzSoft.dv = 0; return; }
  const tg = mzSoft.on ? Math.min(MZ_SOFT_MAX, mzSoft.pen * 2) : 0;
  if (mzSoft.dv === 0 && Math.abs(tg - mzSoft.dent) < 0.02) { if (!mzSoft.on) mzSoft.dent = 0; return; }   // おさまった あとは、押しつけた ままの 小さな ゆらぎ（めりこみが 0.001マスずつ かわる）を 追わない（止まって いるのに 毎こま 描きなおして いた）。はなれたら 小さな へこみも 0 へ（のこって 生け垣が もどらなかった。Codex の 指摘）
  for (let left = Math.min(dt, 0.1); left > 1e-6; left -= 1 / 60) {   // 長い こまは 1/60秒 ずつ（ばねが とびださない ように）
    const h = Math.min(left, 1 / 60);
    mzSoft.dv += (MZ_DENT_K * (tg - mzSoft.dent) - (calmMotion ? 18 : MZ_DENT_C) * mzSoft.dv) * h;   // 動きを へらす 設定の 人には ぷるぷる させない（ねばりを 強く して 1回で もどす。のびるのは 見える）
    mzSoft.dent = Math.max(calmMotion ? 0 : -0.15, Math.min(MZ_SOFT_MAX, mzSoft.dent + mzSoft.dv * h));
  }
  if (Math.abs(mzSoft.dv) < 0.02 && Math.abs(mzSoft.dent - tg) < 0.004) { mzSoft.dent = tg; mzSoft.dv = 0; }   // おさまった（止まった あとも 毎こま 描きなおさない）
}
function rollStep(dt) {
  mzDentStep(dt);
  const t = targetTile();
  const x0 = rp.x, y0 = rp.y;   // この1こま前の位置（人に ぶつかったら ここで止まる）
  if (rp.x === null || (rp.sent && Math.hypot(t.x - rp.sent.x, t.y - rp.sent.y) > 0.6)) {   // はじめ・ほかの動き（おまかせ歩き・タップ・ひとっとび）のあとは、そこから
    if (rp.x !== null && rp.sent && Math.hypot(t.x - rp.sent.x, t.y - rp.sent.y) > 6 && performance.now() - (mzRt.snapT || 0) > 800) mzRt.warp = true;   // めいろを とびこえた（名所の 窓の「ここへ」など）：この ゴールは ★なし
    Object.assign(rp, { x: t.x, y: t.y, vx: 0, vy: 0, sent: { x: t.x, y: t.y }, tile: `${Math.floor(t.x)},${Math.floor(t.y)}` });
  }
  if (sightBusy() || medashiShown() || !$('pxInfo').hidden || document.body.classList.contains('jump-open') || (mazeOn() && mapCovered(true))) { rp.vx = rp.vy = 0; return; }   // めいろでは ごほうび・きろく などの 窓が 出ている 間も 止める（時計を 止める 間に 進まない）
  if (npcSend) npcSendOff();   // 話を とじた：その人が 行き先のほうへ 押してくれる
  const ax = tiltG.x + rk.right - rk.left, ay = tiltG.y + rk.down - rk.up;   // 傾きと 矢印キー
  if (Math.hypot(ax, ay) > 0.08) G.notePlayInput();
  const sl = slopeAt(rp.x, rp.y);   // 坂：下る向きへ ひとりでに転がる（上りは おそくなる）
  const gnd = groundAt(rp.x, rp.y), wxr = WX_ROLL[wxKind()], crr = ROLL_CRR * gnd.crr * (wxr ? wxr.crr : 1);   // 雨・雪の日は すべる   // 道は するする・草や田んぼは もさもさ・砂浜は ずぶずぶ
  const up = rp.vx * sl.x + rp.vy * sl.y < 0 ? 0.6 : 1;   // 上り坂は、下りより ゆるく おそくなる（いきおいで 堤防や 坂を のぼれる）
  const acc = ROLL_ACC * (KP.accel || 1);
  // ころがり抵抗は 押す力の 4わり まで：どの 地面・転がり方・天気でも 小さな 傾きで 動きだす（「ぴたっ」で 砂浜は いくら 傾けても 動かず、草は 14度 いった。めいろで「詰まって 動かない」の もと）
  const cr = Math.min(crr * (KP.crr || 1), acc * 0.4);
  const fx = Math.max(-1, Math.min(1, ax)) * acc + sl.x * up, fy = Math.max(-1, Math.min(1, ay)) * acc + sl.y * up, fp = Math.hypot(fx, fy);   // 押す力（傾き・坂）
  let sp = Math.hypot(rp.vx, rp.vy);
  if (sp < 0.05) {   // 止まっている：押す力が ころがり抵抗より弱ければ 動かない（ゆるい坂では 止まっていられる）
    const c0 = cr;
    if (fp > c0) { rp.vx += fx / fp * (fp - c0) * dt; rp.vy += fy / fp * (fp - c0) * dt; }
    else if (!mzSoft.on) { rp.vx = rp.vy = 0; return; }   // やわらかい 生け垣に めりこんだ ままの ときは 止めない（ばねで 押しもどす）
  } else {
    rp.vx += fx * dt; rp.vy += fy * dt;
    sp = Math.hypot(rp.vx, rp.vy);
    const ns = Math.max(0, Math.min(ROLL_MAX, sp - (cr + ROLL_LIN * gnd.drag * (wxr ? wxr.lin : 1) * (KP.lin || 1) * sp + ROLL_AIR * (KP.air || 1) * sp * sp) * dt));
    rp.vx *= ns / sp; rp.vy *= ns / sp;
  }
  const mz = mazeOn(), rb = mz ? (x, y) => mzBlocked(rp.x, rp.y, x, y) : rollBlocked;   // めいろの ときは めいろの 壁だけに 当たる
  const tube = mz ? mzNear(rp.x, rp.y) : null, inTube = !!tube && tube.d <= MZ_TUBE + 0.35;   // ゆるい めいろ：道すじの 筒の 中に いる（壁の かたまりの 中から 出る とき・読めて いない 所では これまでの 当たり）
  let rub = null;   // 筒の ふちに こすれて いる 向き（外向き）
  if (mz && !inTube && !window.__noCornerAssist) {   // 曲がり角アシスト（筒の 中では いらない：カーブに そって すべる）：曲がりたい 向きに 傾けて、その 向きの 通路が 開いていれば、通路の まん中へ すっと 寄せて 入れる（生け垣の かどに ひっかからない）。
    //   寄りきる ころに、いまの 勢いの 一部を 曲がる 向きへ（止まらずに くるっと 曲がれる）。通路の まん中：横は マスの まん中、たては 上下の 当たりの ちがいで 1.4マス目
    const ix = Math.max(-1, Math.min(1, ax)), iy = Math.max(-1, Math.min(1, ay)), cx = Math.floor(rp.x / MZ_K), cy = Math.floor(rp.y / MZ_K), k = Math.min(1, dt * 12);
    const mx = (cx + 0.5) * MZ_K, my = cy * MZ_K + 1.4;
    const sp2 = rp.vx * rp.vx + rp.vy * rp.vy, toY = sp2 > 0.25 ? Math.abs(rp.vx) >= Math.abs(rp.vy) : Math.abs(iy) >= Math.abs(ix);   // 曲がる 向きは 1つだけ（いまの 進む 向きと 直角。止まって いれば 強く 傾けた ほう）。ななめに 傾けても 2つの 寄せが 打ち消しあって 動けなく ならない
    if (toY && Math.abs(iy) > 0.3 && Math.abs(iy) >= Math.abs(ix) * 0.6 && Math.abs(mx - rp.x) < 1.3 && mzOpen(cx, cy, 0, Math.sign(iy))) {
      rp.x += (mx - rp.x) * k;
      if (Math.abs(mx - rp.x) < 0.35 && Math.abs(rp.vx) > Math.abs(rp.vy)) { const t = Math.abs(rp.vx) * 0.4 * k; rp.vy += Math.sign(iy) * t; rp.vx -= Math.sign(rp.vx) * t; }
    }
    else if (!toY && Math.abs(ix) > 0.3 && Math.abs(ix) >= Math.abs(iy) * 0.6 && Math.abs(my - rp.y) < 1.3 && mzOpen(cx, cy, Math.sign(ix), 0)) {
      rp.y += (my - rp.y) * k;
      if (Math.abs(my - rp.y) < 0.35 && Math.abs(rp.vy) > Math.abs(rp.vx)) { const t = Math.abs(rp.vy) * 0.4 * k; rp.vx += Math.sign(ix) * t; rp.vy -= Math.sign(rp.vy) * t; }
    }
  }
  const R = 0.3, RS = R * 0.6;   // つぶの大きさ（マス）。かべは つぶの まん中と 両はしの3か所で調べる（建物の かどに めりこまないように）
  // めいろの 壁（緑の 生け垣。マスの さかいに 0.5マスの 厚み）は、絵の お米（はば 約1.3マス・足もとは まん中より 0.4マス下）に 合わせて 当てる（壁に 食いこんで 見えないように）。
  // 左右は 0.72・下は 0.62・上は 0.42（上の 壁は お米の うしろに 立つので、頭が 少し かさなって 見えるのが しぜん）
  const RX = mz ? 0.72 : R, RD = mz ? 0.62 : R, RU = mz ? 0.42 : R, RSX = mz ? 0.5 : RS, RSY = mz ? 0.4 : RS;
  const hit = (vin, horiz, wet) => {   // かべに当たった：おそければ ぴたっと止まる（押しつけても がたがたしない）。速ければ はね返って ぺたっ。水なら ぽちゃん（やわらかく はね返る）。生け垣なら がさっ（やわらかく はね返る）
    if (vin < ROLL_STICK) return 0;
    bumpFx(vin, horiz, wet, mz);
    return wet ? -0.25 : mz ? -(KP.bounce !== undefined ? KP.bounce * 0.7 : 0.3) : -(KP.bounce !== undefined ? KP.bounce : ROLL_BOUNCE);
  };
  const wetAt = (x, ys, xs) => (xs || [x]).some(px => (ys || []).some(py => codeAt(Math.floor(px), Math.floor(py)) === C.A));   // 当たったのは 水か
  if (inTube) {   // 筒の 中を 転がる：道すじから MZ_TUBE より 外へ 出る ぶんは 筒の ふちへ もどし、外向きの 速さだけ はね返す（なめらかな カーブに そって すべる）
    const ix = Math.max(-1, Math.min(1, ax)), iy = Math.max(-1, Math.min(1, ay)), im = Math.hypot(ix, iy);
    if (tube.d > MZ_TUBE - 0.05 && im > 0.3 && !window.__noCornerAssist) {   // 曲がり角アシスト（ゆるい めいろ版）：曲がりたい 向きに 傾けても 筒の ふちに 押しつける だけの ときは、
      //   その 向きの 通路が この マスか となりの マスに あれば、道すじに そって そちらへ 転がす（まるい 角を まわって 入れる）
      const ux = (rp.x - tube.x) / tube.d, uy = (rp.y - tube.y) / tube.d;
      if ((ix * ux + iy * uy) / im > 0.6) {
        // 縦横が 同じ力なら 縦を 先に（筒の 外の toY と そろえる）。中心の 傾きが きっちり0でも 曲がれるように。
        const dx = Math.abs(ix) > Math.abs(iy) ? Math.sign(ix) : 0, dy = dx ? 0 : Math.sign(iy), cx = Math.floor(rp.x / MZ_K), cy = Math.floor(rp.y / MZ_K);
        let aim = mzOpen(cx, cy, dx, dy) ? [(cx + 0.5 + dx * 0.5) * MZ_K, (cy + 0.5 + dy * 0.5) * MZ_K] : null;
        if (!aim) for (const [ex, ey] of MZ_DIRS) {
          if (ex * dx + ey * dy || !mzOpen(cx, cy, ex, ey) || !mzOpen(cx + ex, cy + ey, dx, dy)) continue;
          if (Math.hypot(rp.x - (cx + 0.5 + ex * 0.5) * MZ_K, rp.y - (cy + 0.5 + ey * 0.5) * MZ_K) < 1) { aim = [(cx + ex + 0.5 + dx * 0.5) * MZ_K, (cy + ey + 0.5 + dy * 0.5) * MZ_K]; break; }   // となりの マスの 曲がり角（さかいの そばに いる とき）
        }
        if (aim) {
          let tx = -uy, ty = ux;
          if (tx * (aim[0] - tube.x) + ty * (aim[1] - tube.y) < 0) { tx = -tx; ty = -ty; }
          const k = acc * Math.min(1, im) * 0.9 * dt; rp.vx += tx * k; rp.vy += ty * k;
        }
      }
    }
    let nx = rp.x + rp.vx * dt, ny = rp.y + rp.vy * dt;
    const q = mzNear(nx, ny);
    if (q && q.d > MZ_TUBE) {   // やわらかい 生け垣（店主「迷路の壁は柔らかく、当たると伸びて跳ね返る」）：筒の ふちから 先は ばね。めりこむ ほど 強く 押しもどし、ぽよんと はね返る
      const ux = (nx - q.x) / q.d, uy = (ny - q.y) / q.d, vn = rp.vx * ux + rp.vy * uy, over = q.d - MZ_TUBE, pen = Math.min(over, MZ_SOFT_MAX);
      rub = [ux, uy];
      if (!mzSoft.on && vn > MZ_HIT_STOP && !calmMotion) mzHitStop = performance.now() + MZ_HIT_STOP_MS;
      if (!mzSoft.on && vn > MZ_HIT_STOP && performance.now() - riceBub.at > 4000) riceSay('いたっ', 900);   // 強く 当たった ときだけ（4秒に 1回まで）   // 動きを へらす 設定の 人には しない
      if (!mzSoft.on && vn > 0) { hit(vn, Math.abs(ux) >= Math.abs(uy), false); mzSoft.vin = vn; mzSoft.dv = Math.max(mzSoft.dv, vn * 0.5); }   // 当たった 瞬間だけ：がさっ（音・葉っぱ・ゆれ・いたい顔・コンボ おしまい）。へこみの 絵を ぐっと 押しこむ
      mzSoft.on = true; mzSoft.x = q.x; mzSoft.y = q.y; mzSoft.ux = ux; mzSoft.uy = uy; mzSoft.pen = pen;
      const push = MZ_SOFT_K * pen * dt + (vn > 0 ? MZ_SOFT_C * vn * dt : 0);   // ばね ＋ めりこむ 向きの ときだけ ねばり（はね返りの 強さ）
      const vtx = rp.vx - vn * ux, vty = rp.vy - vn * uy, vt = Math.hypot(vtx, vty), f = vt > 0 ? Math.max(0, 1 - MZ_RUB * MZ_SOFT_K * pen * dt / vt) : 1;   // 生け垣に こすれる ぶん おそく（カーブを いつまでも すべりつづけない）
      let vn2 = vn - push;
      if (over > MZ_SOFT_MAX) { nx = q.x + ux * (MZ_TUBE + MZ_SOFT_MAX); ny = q.y + uy * (MZ_TUBE + MZ_SOFT_MAX); if (vn2 > 0) vn2 = 0; }   // それより 先へは のびない（通りぬけない）
      rp.vx = vtx * f + vn2 * ux; rp.vy = vty * f + vn2 * uy;
    } else {
      if (mzSoft.on && mzSpring.until > performance.now() && mzSoft.vin > 1.5) {   // ばねの わざ：はなれる ときに 外へ 押しだす（当たった 速さの MZ_SPRING_E 倍まで）。ぽよんと 鳴る ほどの 当たりだけ（カーブに こすれる たびに 押すと あばれる）
        const vo = -(rp.vx * mzSoft.ux + rp.vy * mzSoft.uy), want = Math.min(ROLL_MAX, mzSoft.vin * MZ_SPRING_E);
        if (vo < want) { rp.vx -= (want - vo) * mzSoft.ux; rp.vy -= (want - vo) * mzSoft.uy; mzSpring.boosts++; mzSpringChain(performance.now()); }
        const v = Math.hypot(rp.vx, rp.vy); if (v > ROLL_MAX) { rp.vx *= ROLL_MAX / v; rp.vy *= ROLL_MAX / v; }   // 横向きの 速さと あわせても いちばん速い 速さまで
      }
      if (mzSoft.on && mzSoft.vin > 2.5 && roll.h <= 0 && !calmMotion) { roll.hv = Math.min(2.6, 0.8 + mzSoft.vin * 0.25); roll.h = 0.001; }   // ぽよんぽよん：はね返る ときに お米が ちょこんと とびはねる（見た目だけ。動きを へらす 人には しない）
      if (mzSoft.on && mzSoft.vin > 1.5) { boingSound(Math.min(1, mzSoft.vin / 8), mzSpring.until > performance.now() ? mzSpring.chain || 1 : 0); mzSoft.boings++; }   // はなれた：ぽよん（はね返った ことを 音でも）
      mzSoft.on = false; mzSoft.vin = 0;
    }
    rp.x = nx; rp.y = ny;
  } else {
  const nx = rp.x + rp.vx * dt, ex = nx + Math.sign(rp.vx) * RX;
  const xa = rb(ex, rp.y - RSY), xb = rb(ex, rp.y + RSY);
  if (rp.vx && (rb(ex, rp.y) || (xa && xb))) {   // かべに ぴったり つけてから はね返す（すきまが残ると、押しつづけたときに すきまで また速くなって がたがたする）
    rp.x = rp.vx > 0 ? Math.floor(ex) - RX - 1e-3 : Math.floor(ex) + 1 + RX + 1e-3;
    const k = hit(Math.abs(rp.vx), true, wetAt(ex, [rp.y, rp.y - RSY, rp.y + RSY])); rp.vx *= k; if (k) rp.vy *= 0.85;
  }
  else {
    rp.x = nx;
    if (rp.vx && (xa || xb) && !rb(rp.x, rp.y + (xa ? RD : -RU) + (xa ? 0.05 : -0.05))) rp.y += (xa ? 1 : -1) * Math.abs(rp.vx) * dt * 0.7;   // かどに かすった：すべって よける
  }
  const ny = rp.y + rp.vy * dt, ey = ny + (rp.vy > 0 ? RD : rp.vy < 0 ? -RU : 0);
  const ya = rb(rp.x - RSX, ey), yb = rb(rp.x + RSX, ey);
  if (rp.vy && (rb(rp.x, ey) || (ya && yb))) {
    rp.y = rp.vy > 0 ? Math.floor(ey) - RD - 1e-3 : Math.floor(ey) + 1 + RU + 1e-3;
    const k = hit(Math.abs(rp.vy), false, wetAt(0, [ey], [rp.x, rp.x - RSX, rp.x + RSX])); rp.vy *= k; if (k) rp.vx *= 0.85;
  }
  else {
    rp.y = ny;
    if (rp.vy && (ya || yb) && !rb(rp.x + (ya ? RX : -RX) + (ya ? 0.05 : -0.05), rp.y)) rp.x += (ya ? 1 : -1) * Math.abs(rp.vy) * dt * 0.7;
  }
  }
  if (mz) {   // 生け垣に そって 転がる：こすれて 葉っぱが はらはら（速いほど よく落ちる）
    const spd = Math.hypot(rp.vx, rp.vy);
    hedgeScrapeT -= dt;
    if (spd > 1.4 && hedgeScrapeT <= 0 && inTube) {
      if (rub) {
        hedgeScrapeT = 0.22 / Math.min(3, spd / 1.4);
        roll.dust.push({ x: rp.x + rub[0] * 0.7, y: rp.y + rub[1] * 0.6, t: 0, s: 0.8 + Math.random() * 0.5, vx: (Math.random() - 0.5) * 0.8, c: (MZ_BITS[mzStyle(Math.floor(rp.x / MZ_K), Math.floor(rp.y / MZ_K))] || MZ_BITS.ike)[Math.random() < 0.5 ? 0 : 1], bit: true });   // こすれた くずも 生け垣の 種類で
      }
    } else if (spd > 1.4 && hedgeScrapeT <= 0) {
      const horiz = Math.abs(rp.vx) >= Math.abs(rp.vy);
      const side = horiz ? (rb(rp.x, rp.y + RD + 0.04) ? 1 : rb(rp.x, rp.y - RU - 0.04) ? -1 : 0) : (rb(rp.x + RX + 0.04, rp.y) ? 1 : rb(rp.x - RX - 0.04, rp.y) ? -1 : 0);
      if (side) {
        hedgeScrapeT = 0.22 / Math.min(3, spd / 1.4);
        roll.dust.push({ x: rp.x + (horiz ? 0 : side * RX * 0.9), y: rp.y + (horiz ? side * (side > 0 ? RD : RU) * 0.9 : 0), t: 0, s: 0.8 + Math.random() * 0.5, vx: -Math.sign(horiz ? rp.vx : 0) * 0.4 + (Math.random() - 0.5) * 0.8, c: Math.random() < 0.5 ? '168,222,104' : '236,244,150', bit: true });
      }
    }
  }
  if (mz) mzPadTick(ax, ay);   // びゅんパネル
  if (Math.abs(rp.vx) > 0.05 || Math.abs(rp.vy) > 0.05) facing = Math.abs(rp.vx) > Math.abs(rp.vy) ? (rp.vx > 0 ? 'right' : 'left') : (rp.vy > 0 ? 'down' : 'up');
  const tx = Math.floor(rp.x), ty = Math.floor(rp.y), key = `${tx},${ty}`;
  const hitNpc = who => {   // 人に こつん：前のマスの まん中へ とばずに、その場で ぽよんと止まって にっこり あいさつ
    if (x0 !== null) { rp.x = x0; rp.y = y0; }
    const hard = Math.hypot(rp.vx, rp.vy);
    rp.vx = rp.vy = 0;
    if (hard > 0.6) { roll.sq = Math.min(0.2, 0.08 + hard * 0.03); roll.sqv = 0; roll.sqx = Math.abs(rp.x - (tx + 0.5)) > Math.abs(rp.y - (ty + 0.5)); kotoSound(Math.min(1, hard / 5)); }
    roll.happyT = 1.4;
    if ($('pxInfo').hidden && npcBump.id !== who.id) npcGreet(who, tx, ty);   // 同じ 人には、いちど はなれる（3マス）まで もう 話しかけない（傾けた まま だと、とじる たびに また 話しかけて いた）
  };
  const mzHit = mazeOn() ? mzNpcNear(rp.x, rp.y) : null;   // めいろでは 人の そばに 来たかを 毎回（同じ マスの 中で 近づいて はなれる 動きでも 当たる。Codex の 指摘）
  if (key === rp.tile && mzHit && npcBump.id !== mzHit.id) { npcMetSync(); if (!npcBump.met.has(mzHit.id)) { hitNpc(mzHit); return; } }
  if (key !== rp.tile) {   // 新しいマス：人がいたら話しかけて止まる。いなければ 1歩と同じこと
    npcMetSync();
    // めいろでは、いちど こつんと あいさつした 人は すりぬける（通路の まん中に 立つ 人に 止められて 先へ 進めなかった）。
    // いまの ゴールへ 向かう 間は、はなれて また 通っても 話しかけない（自分で 遊んで 分かった：行き止まりから ひきかえすと、同じ 人の 窓が また 開いた）
    const who0 = mazeOn() ? mzHit : npcAt(tx, ty), who = who0 && !(mazeOn() && (npcBump.id === who0.id || npcBump.met.has(who0.id))) ? who0 : null;
    if (who) { hitNpc(who); return; }
    if (npcBump.id && Math.abs(tx - npcBump.x) + Math.abs(ty - npcBump.y) >= 3) npcBump.id = '';
    const [px0, py0] = rp.tile.split(',').map(Number), wasRail = codeAt(px0, py0) === C.L;
    rp.tile = key;
    sightCheck(); critterStep(tx, ty);
    const spd = Math.hypot(rp.vx, rp.vy);
    if (codeAt(tx, ty) === C.L && !wasRail && spd > 1.2 && roll.h <= 0) { roll.hv = 1.1 + spd * 0.12; roll.h = 0.001; clackSound(Math.min(1, spd / 5)); }   // 線路に のる：ガタン と小さく はねる（線路にそって転がるときは 1回だけ）
  }
  {   // 高低差で とぶ：坂の前と うしろ（1.2マス＝約10m）の 傾きを くらべる
    //   ・上り坂を いきおいよく のぼって、上が 平らになる所（堤防の上・坂の上）→ 上へ とびだす
    //   ・急に 下り坂になる所（段丘の崖の上のへり）→ 地面が 足もとから にげて とぶ
    //   ・急に 平らになる所（坂の下）→ ずしん
    const spd = Math.hypot(rp.vx, rp.vy), zg = (() => { const h = heightAt(rp.x, rp.y); return h === null ? null : h / TILE_M; })();   // 地面の高さ（マス）
    if (roll.h > 0 && zg !== null && roll.zg !== null) roll.h = Math.max(0.001, roll.h - (zg - roll.zg));   // とんでいる間に 地面が 下がれば、そのぶん 高く（長く とぶ）
    roll.zg = zg;
    if (spd > 2.2 && roll.h <= 0 && !roll.jumpCd && zg !== null) {
      const W = 1.2, ux = rp.vx / spd, uy = rp.vy / spd, hb = heightAt(rp.x - ux * W, rp.y - uy * W), hf = heightAt(rp.x + ux * W, rp.y + uy * W);
      if (hb !== null && hf !== null) {
        const gb = (zg * TILE_M - hb) / (W * TILE_M), gf = (hf - zg * TILE_M) / (W * TILE_M), bend = gb - gf;   // うしろの坂・前の坂（上りが ＋）。bend：前が どれだけ 下がって見えるか
        if (bend > 0.07) {
          roll.hv = Math.min(5.5, spd * (Math.max(0, gb) * 1.6 + bend * 1.4)); roll.h = 0.001; roll.jumpCd = 0.5; roll.jumps++;
          kotoSound(Math.min(1, spd / 5));
        } else if (bend < -0.12) { roll.sq = Math.max(roll.sq, 0.14); roll.sqv = 0; roll.sqx = false; roll.jumpCd = 0.4; kotoSound(Math.min(1, spd / 5), true); }
      }
    }
  }
  const far = Math.hypot(rp.x - rp.sent.x, rp.y - rp.sent.y), nowMs = performance.now();
  if (far > 0.45 || (far > 0.05 && nowMs - (rp.sentAt || 0) > 250)) {   // 位置を game.js へ（多すぎると重くなるので、0.45マスごとか 0.25秒ごと）
    const ll = toLatLng(rp.x, rp.y);
    rp.sent = { x: rp.x, y: rp.y }; rp.sentAt = nowMs;
    G.moveTo(ll.lat, ll.lng, 'step');
  }
}
let hedgeScrapeT = 0;
function bumpFx(hard = 1, horiz = true, wet = false, hedge = false) {
  const now = performance.now();
  if (now - rp.bump < 160) return;
  rp.bump = now;
  if (hard < 0.25) return;
  comboEnd();   // 当たったら ころころコンボは おしまい
  if (hedge) {   // めいろの 生け垣に がさっ：やわらかく 受けとめて、葉っぱが 舞う。強く 当たった ときだけ いたい顔
    roll.sq = Math.min(0.32, 0.1 + hard * 0.05); roll.sqv = 0; roll.sqx = horiz;   // ふわふわ：生け垣に もふっと うもれて 大きく つぶれる
    roll.shake = Math.min(0.4, 0.06 + hard * 0.06);
    if (hard > 3.2) roll.ouchT = 0.5;
    const sx = Math.sign(rp.vx) * (horiz ? 0.75 : 0), sy = horiz ? 0 : rp.vy > 0 ? 0.65 : -0.45;
    const bits = MZ_BITS[mzStyle(Math.floor(rp.x / MZ_K), Math.floor(rp.y / MZ_K))] || MZ_BITS.ike;   // 生け垣の 種類で くずを かえる（素朴な かわいさ）   // 当たった 生け垣の 面（はね返る まえの 向き）
    for (let i = 0; i < Math.min(9, 3 + Math.round(hard * 1.4)); i++) roll.dust.push({ x: rp.x - sx * 0.1 * (1 - i % 2) + sx, y: rp.y + sy, t: 0, s: 0.9 + Math.random() * 0.6, vx: (Math.random() - 0.5) * 2.2, c: bits[i % 3 ? 0 : 1], bit: true });   // 若葉色（壁の 緑より 明るく）
    hedgeSound(Math.min(1, hard / 4));
    if (navigator.vibrate) navigator.vibrate(Math.round(5 + hard * 2));
    return;
  }
  if (wet) {   // 水に ぽちゃん：しぶきが はねて、あせの しずく。画面は ほとんど ゆれない
    roll.sq = Math.min(0.18, 0.06 + hard * 0.03); roll.sqv = 0; roll.sqx = horiz;
    roll.wetT = 1.4; roll.shake = 0.12; roll.dirt = 0;   // 水で あらわれて きれいに
    const sx = Math.sign(rp.vx) * (horiz ? 0.35 : 0), sy = Math.sign(rp.vy) * (horiz ? 0 : 0.35);
    for (let i = 0; i < 7; i++) roll.dust.push({ x: rp.x + sx, y: rp.y + sy, t: 0, s: 0.6 + Math.random() * 0.6, vx: (Math.random() - 0.5) * 2.4, c: '150,200,240', bit: true });
    splashSound(Math.min(1, hard / 4));
    if (navigator.vibrate) navigator.vibrate(6);
    return;
  }
  roll.sq = Math.min(0.32, 0.1 + hard * 0.06); roll.sqv = 0; roll.sqx = horiz;   // ぺたっと つぶれる（当たった向きに）
  roll.ouchT = 0.7;   // いたい
  roll.shake = Math.min(1, 0.3 + hard * 0.15);
  kotoSound(Math.min(1, hard / 4), true);
  if (navigator.vibrate) navigator.vibrate(Math.round(8 + hard * 4));
}
function setRoll(on) {
  rollOn = !!on;
  try { localStorage.setItem('nsg_roll', rollOn ? '1' : '0'); } catch (e) { /* noop */ }
  rp.x = null; for (const k in rk) rk[k] = 0;
  const b = $('pxRoll');
  if (b) { b.classList.toggle('on', rollOn); b.setAttribute('aria-pressed', String(rollOn)); }
}
// 車：スティックのとなりのボタンで乗り降り。道の上（またはとなり）で乗れて、道だけを倍の速さで走る。
// 乗っている間は、歩いた距離・チェックイン・たからばこ・話しかけはお休み（降りるとできる）
const CAR_OK = new Set([C.R, C.H]);
let driving = false;
function setDriving(on, msg) {
  driving = !!on;
  const b = $('pxCar');   // 地図が めいろに なったので 車の ボタンは はずした（車では めいろの 壁が きかない）
  if (b) {
    b.innerHTML = driving ? ICO('walker', '🚶', '降りる') : ICO('car', '🚗', '車に乗る');
    b.setAttribute('aria-label', driving ? '車を降りる' : '車に乗る');
    b.title = driving ? '車を降りる' : '車に乗る（道の上で）';
    b.classList.toggle('on', driving);
  }
  G.setDriving(driving);
  if (msg) G.toast(msg);
  dirty = true;
}
function toggleCar() {
  if (!G.demo) return;
  if (worldMode) setWorld(false);
  if (driving) { setDriving(false, '🚶 車を降りました'); return; }
  const t = targetTile(), x = Math.floor(t.x), y = Math.floor(t.y);
  if (codeAt(x, y) === C.X) return;
  const road = [[0, 0], ...Object.values(DIRS)].map(([dx, dy]) => [x + dx, y + dy]).find(([a, b]) => CAR_OK.has(codeAt(a, b)) && !npcAt(a, b));
  if (!road) { G.toast('🚗 車は道（灰色の道路）の上で乗れます。道まで歩いてね'); return; }
  if (road[0] !== x || road[1] !== y) { const ll = toLatLng(road[0] + 0.5, road[1] + 0.5); G.moveTo(ll.lat, ll.lng); }
  setDriving(true, '🚗 軽トラに乗りました（道だけ走れます。もう一度押すと降ります）');
}
// 地図をタップして飛んだ先などが道でなければ、車を降りる
function checkCar() {
  if (!driving || worldMode || !G.me) return;
  const t = targetTile(), c = codeAt(Math.floor(t.x), Math.floor(t.y));
  if (c !== C.X && !CAR_OK.has(c)) setDriving(false, '🚶 道の外へ移動したので、車を降りました');
}
if ($('pxCar')) $('pxCar').addEventListener('click', toggleCar);
// 稲刈りミニゲーム（harvest.js）：田んぼのマス（またはすぐとなり）にいるときだけ、右上の列に「稲刈り」ボタンを出す（あるいて移動でも見えるよう、スティックの列には置かない）
const PADDY_CODES = new Set([C.U, C.F]);
function onPaddy() {
  if (worldMode || driving || (!G.me && !G.demo)) return false;
  const t = targetTile(), x = Math.floor(t.x), y = Math.floor(t.y);
  return [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => PADDY_CODES.has(codeAt(x + dx, y + dy)));
}
function updateHarvestBtn() { const b = $('pxHarvest'), on = onPaddy(); if (b && b.hidden === on) b.hidden = !on; }
$('pxHarvest').addEventListener('click', () => { if (window.NISHIO_HARVEST && onPaddy()) NISHIO_HARVEST.open(); });
// 段丘をのぼるミニゲーム（dankyu.js）：急な坂のマス（またはすぐとなり）にいるときだけ、右上の列に「段丘をのぼる」ボタンを出す
// 急な坂＝標高から作った陰影がいちばん明るいか暗いマス（となりのマスと約3m以上ちがう）。段丘のへりの崖だけにするため、次の所はのぞく
//  ・山・丘・海のマス。まわり9×9マスに山・丘のマスが8つ以上ある所（山の中の道や畑。道や建物は山・丘のマスに塗りかえないので）
//  ・まわり9×9マスに急な坂のマスが25以上ある所（丘の斜面は面に広がる。段丘のへりは線なので少ない）
//  標高そのものは区画に残していないので完全には見分けられない（西尾駅の北や西の台地のへりでは残り、山の中の区画では 1248→9マス、東の丘の区画では 9160→157マスに減る）
const HILLY = new Set([C.M, C.K]);
const isSteep = r => { const sh = (r >> 5) & 7; return sh === 0 || sh === 4; };
function steepAt(x, y) {
  const r = rawAt(x, y), c = r & 31;
  if (!isSteep(r) || HILLY.has(c) || c === C.A) return false;
  let hills = 0, steep = 0;
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const v = rawAt(x + dx, y + dy);
    if (HILLY.has(v & 31) && ++hills >= 8) return false;
    if (isSteep(v) && ++steep >= 25) return false;
  }
  return true;
}
function onSlope() {
  if (worldMode || driving || (!G.me && !G.demo)) return false;
  const t = targetTile(), x = Math.floor(t.x), y = Math.floor(t.y);
  return [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => steepAt(x + dx, y + dy));
}
function updateDankyuBtn() { const b = $('pxDankyu'), on = onSlope(); if (b && b.hidden === on) b.hidden = !on; }
$('pxDankyu').addEventListener('click', () => { if (window.NISHIO_DANKYU && onSlope()) NISHIO_DANKYU.open(); });
// 肥料山の草刈り（hiryoyama.js）：丘・山のマス（またはすぐとなり）にいるときだけ、右上の列に 🌿 のボタン
const HILL_CODES = new Set([C.K, C.M]);
function onHill() {
  if (worldMode || driving || (!G.me && !G.demo)) return false;
  const t = targetTile(), x = Math.floor(t.x), y = Math.floor(t.y);
  return [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => HILL_CODES.has(codeAt(x + dx, y + dy)));
}
function updateHiryoBtn() { const b = $('pxHiryo'), on = onHill(); if (b && b.hidden === on) b.hidden = !on; }
$('pxHiryo').addEventListener('click', () => { if (window.NISHIO_HIRYO && onHill()) NISHIO_HIRYO.open(); });

// いちばん近い歩けるマスまでの歩数（歩けないマスを通ってよい。未読込は通らない。遠すぎたら Infinity）
function exitDist(x, y) {
  if (!BLOCK.has(codeAt(x, y))) return 0;
  const seen = new Set([x + ',' + y]);
  let frontier = [[x, y]];
  for (let d = 1; d <= 40 && frontier.length; d++) {
    const next = [];
    for (const [px, py] of frontier) for (const [dx, dy] of Object.values(DIRS)) {
      const qx = px + dx, qy = py + dy, k = qx + ',' + qy, c = codeAt(qx, qy);
      if (seen.has(k) || c === C.X) continue;
      if (!BLOCK.has(c)) return d;
      seen.add(k); next.push([qx, qy]);
    }
    frontier = next;
  }
  return Infinity;
}
// デモで立った場所（始めた所・地図をタップして飛んだ所）が建物や水の上なら、いちばん近い歩けるマスへ移す。
// 地図が届くまでは待つ。同じマスは1回だけ調べる（遠いときは、せかいちずで陸へ移してから、もう一度細かく合わせる）
let snapKey = '', snapWorld = '';
function snapDemoStart() {
  if (!G.demo || !G.me || worldMode) return;
  const t = targetTile(), x = Math.floor(t.x), y = Math.floor(t.y), key = x + ',' + y, c = codeAt(x, y);
  if (key === snapKey || c === C.X) return;
  if (mazeOn() && mzType(Math.floor(t.x / MZ_K), Math.floor(t.y / MZ_K)) >= 0) return;   // めいろの ときは 建物の マスでも 動かさない（通路・参道の 中は 通れる。壁の かたまりの 中なら mzSnap が 通路へ もどす）。snapKey は おぼえない（転がすを 切ったら しらべなおす）
  snapKey = key;
  if (!BLOCK.has(c)) return;
  const seen = new Set([key]);
  let frontier = [[x, y]];
  for (let d = 1; d <= 40 && frontier.length; d++) {
    const next = [];
    for (const [px, py] of frontier) for (const [dx, dy] of Object.values(DIRS)) {
      const qx = px + dx, qy = py + dy, k = qx + ',' + qy, q = codeAt(qx, qy);
      if (seen.has(k) || q === C.X) continue;
      if (!BLOCK.has(q)) { const ll = toLatLng(qx + 0.5, qy + 0.5); snapKey = k; G.moveTo(ll.lat, ll.lng); return; }
      seen.add(k); next.push([qx, qy]);
    }
    frontier = next;
  }
  // 近くに歩ける所がない（海の真ん中など）：せかいちず（100mごと）でいちばん近い陸を探して、そこへ移す
  if (!world) { snapKey = ''; if (worldState === 'none') buildWorld(); return; }   // せかいちずが届いたら、もう一度
  const me = llToW(G.me.lat, G.me.lng), wx = Math.floor(me.x), wy = Math.floor(me.y);
  for (let r = 1; r < Math.max(WW, WH); r++) {
    let best = null, bd = Infinity;
    for (let j = wy - r; j <= wy + r; j++) for (let i = wx - r; i <= wx + r; i++) {
      if (Math.max(Math.abs(i - wx), Math.abs(j - wy)) !== r || i < 0 || j < 0 || i >= WW || j >= WH) continue;
      const wc = world[j * WW + i], d = Math.hypot(i - wx, j - wy);
      if (wc !== C.A && wc !== C.M && d < bd) { bd = d; best = [i, j]; }
    }
    if (best) {
      if (snapWorld === best.join(',')) return;   // 同じ所へもう飛んだ（そこでも歩ける所が見つからない）ならあきらめる
      snapWorld = best.join(',');
      const ll = wToLL(best[0] + 0.5, best[1] + 0.5); G.moveTo(ll.lat, ll.lng); return;
    }
  }
}
/* ---------- たからばこ ----------
   400m四方（50マス）の区画ごとに、日付から決まる場所に1〜2個置く（同じ日・同じモードなら、だれが見ても同じ）。
   ・操作して移動：画面の中だけの冒険なので、区画の中の道や小道に置く
   ・あるいて移動：実際にそこへ歩いていくので、道や小道（地図データでは車道や私有地の通路と見分けられない）には置かない。
     チェックインのスポットになっている名前のある公園・神社・お寺・城跡・海岸・展望地そのものに置く
     （ゲームがもともと案内している場所なので、そこより危ない所へは行かせない。絵はスポットと重ならないよう少しずらす）
   地図やスポットがまだ届いていない区画は、届いてから置く。開けたかどうかは game.js が覚える */
const CHEST_CELL = 50, PUBLIC_KINDS = new Set(['park', 'shrine', 'temple', 'castle', 'beach', 'view']);
let chests = [], chestKey = '', chestCells = new Map(), welcomeC = null;
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const seededRnd = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// (x0, y0) からまわり r マスで、ok なマスをいちばん近い順に探す。地図が届いていないマスに当たったら undefined（あとで）
function nearTile(x0, y0, r, ok) {
  for (let d = 0; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
    const c = codeAt(x0 + dx, y0 + dy);
    if (c === C.X) return undefined;
    if (ok(c, d)) return [x0 + dx, y0 + dy];
  }
  return null;
}
function chestCell(i, j, date, walking) {
  const rnd = seededRnd(hashStr(`chest:${walking ? 'walk' : 'play'}:${date}:${i}:${j}`)), out = [];
  const add = (t, k, pts) => { const ll = toLatLng(t[0] + 0.5, t[1] + 0.5); out.push({ id: `${date}:${i}:${j}:${k}`, lat: ll.lat, lng: ll.lng, pts, mode: 'play' }); };
  if (walking) {
    if (!G.spots.length) return null;   // スポットがまだ届いていない
    const x0 = i * CHEST_CELL, y0 = j * CHEST_CELL;
    const parks = G.spots.filter(s => PUBLIC_KINDS.has(s.kind || s.cat)).map(s => ({ s, t: toTile(s.lat, s.lng) }))
      .filter(p => p.t.x >= x0 && p.t.x < x0 + CHEST_CELL && p.t.y >= y0 && p.t.y < y0 + CHEST_CELL)
      .sort((a, b) => (a.s.id < b.s.id ? -1 : 1));
    for (let k = 0; k < 2 && parks.length; k++) {
      const p = parks.splice(Math.floor(rnd() * parks.length), 1)[0], pts = 10 + Math.floor(rnd() * 3) * 10;
      out.push({ id: `${date}:${i}:${j}:${k}:${p.s.id}`, lat: p.s.lat, lng: p.s.lng, pts, at: p.s.name, mode: 'walk' });
    }
    return out;
  }
  for (let k = 0; k < 2; k++) {
    const fx = rnd(), fy = rnd(), pts = 10 + Math.floor(rnd() * 3) * 10, want = k === 0 || rnd() < 0.5;
    if (!want) continue;
    const t = nearTile(Math.floor((i + fx) * CHEST_CELL), Math.floor((j + fy) * CHEST_CELL), 8, c => c === C.R || c === C.D);
    if (t === undefined) return null;
    if (t) add(t, k, pts);
  }
  return out;
}
// どの地図を見ていても（ふつうの地図・せかいちずでも）、主人公のまわりの区画を読み込んでたからばこを置く
function updateChests() {
  if (!G.me) return;
  // あるいて移動の置き場所はスポットしだいなので、スポットの一覧が入れ替わったら（読み込み直しも）置き直す
  const date = G.ymd(), key = date + (G.demo ? ':play' : ':walk:' + G.spotsVersion);
  if (key !== chestKey) { chestKey = key; chestCells = new Map(); welcomeC = null; }
  const t = targetTile(), ci = Math.floor(t.x / CHEST_CELL), cj = Math.floor(t.y / CHEST_CELL), list = [];
  for (let cy = Math.floor((cj - 1) * CHEST_CELL / CHUNK); cy <= Math.floor(((cj + 2) * CHEST_CELL - 1) / CHUNK); cy++)
    for (let cx = Math.floor((ci - 1) * CHEST_CELL / CHUNK); cx <= Math.floor(((ci + 2) * CHEST_CELL - 1) / CHUNK); cx++) ensureChunk(cx, cy);
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
    const k = i + ',' + j;
    if (!chestCells.has(k)) { const r = chestCell(i, j, date, !G.demo); if (r) chestCells.set(k, r); }
    if (chestCells.has(k)) list.push(...chestCells.get(k));
  }
  // はじめての人（操作して移動）：主人公から4〜5マス（約40m）の道に「ようこそ たからばこ」。おまかせ歩きでも寄り道する近さ（docs/retention.md）
  if (G.welcomeChest) {
    if (!welcomeC) {
      const sx = Math.floor(t.x), sy = Math.floor(t.y);
      for (const [dx, dy] of [[4, 1], [-4, 1], [1, 4], [1, -4]]) {
        const w = nearTile(sx + dx, sy + dy, 3, c => c === C.R || c === C.D);
        if (w === undefined) break;   // 地図がまだ届いていない：あとで
        if (w) { const ll = toLatLng(w[0] + 0.5, w[1] + 0.5); welcomeC = { id: `${date}:welcome`, lat: ll.lat, lng: ll.lng, pts: 30, mode: 'play' }; break; }
      }
    }
    if (welcomeC) list.push(welcomeC);
  }
  const changed = list.length !== chests.length || list.some((c, n) => c.id !== chests[n].id);
  chests = list;
  if (changed) G.refreshNearby();   // 「たからばこが近くにある」の案内とふつうの地図の印を新しく
}
setInterval(updateChests, 2000);

// スティック・矢印キー：せかいちずを見ているときは、歩く地図にもどってから歩く。通れなければ ぶるっ
function padStep(dir) {
  tapWalkStop();   // スティック・矢印キーをさわったら、タップした所へ歩くのはやめる
  if (worldMode) setWorld(false);
  const ok = step(dir);
  if (!ok && navigator.vibrate) navigator.vibrate(20);
  return ok;
}
// 画面の スティックは、地図が めいろに なったので はずした（傾き・矢印キー・地図を タップで 動かす）
document.addEventListener('keydown', e => {
  const k = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
  if (k && active && G.demo && !meiroPause && !e.target.closest('input,textarea') && !document.body.classList.contains('jump-open')) { e.preventDefault(); if (rollOn && !driving) { if (worldMode) setWorld(false); rk[k] = 1; } else padStep(k); }   // 転がす ときも、せかいちずなら 歩く地図に もどってから   // ミニゲーム（にしおジャンプ・稲刈り）のあいだは、うしろの主人公を歩かせない
});

/* ---------- タップした所へ歩く：道すじ ---------- */
const AUTO_ROADS = new Set([C.R, C.H, C.D]);   // 通りやすい道（ふつうの道・大きな道・小道）
// (sx,sy) から (gx,gy) のまわり goalR マスまでの道すじ（A*）。行けなければ、いちばん近づける所まで
function planPath(sx, sy, gx, gy, goalR, avoid) {
  const pad = mazeOn() ? 150 : 40, x0 = Math.min(sx, gx) - pad, y0 = Math.min(sy, gy) - pad, W = Math.abs(gx - sx) + pad * 2 + 1, H = Math.abs(gy - sy) + pad * 2 + 1;   // めいろは 大回りが いるので 広く さがす（50マスぶん）
  if (W * H > 700000) return [];
  const N = W * H, g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const hx = [], hf = [];   // 二分ヒープ（f の小さい順）
  const push = (i, f) => { hx.push(i); hf.push(f); let k = hx.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= hf[k]) break; [hx[p], hx[k]] = [hx[k], hx[p]]; [hf[p], hf[k]] = [hf[k], hf[p]]; k = p; } };
  const pop = () => { const top = hx[0], li = hx.pop(), lf = hf.pop(); if (hx.length) { hx[0] = li; hf[0] = lf; let k = 0; for (;;) { const a = 2 * k + 1, b = a + 1; let m = k; if (a < hx.length && hf[a] < hf[m]) m = a; if (b < hx.length && hf[b] < hf[m]) m = b; if (m === k) break; [hx[m], hx[k]] = [hx[k], hx[m]]; [hf[m], hf[k]] = [hf[k], hf[m]]; k = m; } } return top; };
  const h = (x, y) => (Math.abs(x - gx) + Math.abs(y - gy)) * 0.9, mz = mazeOn();
  const start = (sy - y0) * W + (sx - x0);
  g[start] = 0; push(start, h(sx, sy));
  let best = start, bestH = h(sx, sy), found = -1, n = 0;
  while (hx.length && n++ < 150000) {
    const i = pop();
    if (done[i]) continue;
    done[i] = 1;
    const x = i % W + x0, y = (i / W | 0) + y0;
    if (Math.hypot(x - gx, y - gy) <= goalR) { found = i; break; }
    if (h(x, y) < bestH) { bestH = h(x, y); best = i; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, lx = nx - x0, ly = ny - y0;
      if (lx < 0 || ly < 0 || lx >= W || ly >= H) continue;
      const j = ly * W + lx;
      if (done[j]) continue;
      const c = codeAt(nx, ny), isGoal = goalR === 0 && nx === gx && ny === gy;
      if (mz ? mzBlocked(x + 0.5, y + 0.5, nx + 0.5, ny + 0.5) || avoid.has(nx + ',' + ny) : !isGoal && (c !== C.X && BLOCK.has(c) || avoid.has(nx + ',' + ny))) continue;   // めいろでは めいろの 壁で 道を さがす
      const cost = c === C.X ? 4 : AUTO_ROADS.has(c) ? 1 : 1.6;
      if (g[i] + cost < g[j]) { g[j] = g[i] + cost; from[j] = i; push(j, g[j] + h(nx, ny)); }
    }
  }
  const out = [];
  for (let i = found >= 0 ? found : best; i !== start && i >= 0; i = from[i]) out.push([i % W + x0, (i / W | 0) + y0]);
  return out.reverse();
}
// スポットをタップすると、ドラクエ風のウィンドウで説明
cv.addEventListener('click', e => {
  if (!tiltG.asked || tiltG.retry) tiltAsk(e);   // 「あそぶ」ボタン廃止のため、傾きの許可は 最初の 地図タップで 1回だけ聞く。一時的な 許可失敗の あとは 次の タップで 再試行（denied では 繰り返さない）
  const r = cv.getBoundingClientRect(), dpr = cv.width / r.width;
  if (mazeOn() && !worldMode) {   // 縁の 矢印を タップで せかいちず
    const px = (e.clientX - r.left) * dpr, py = (e.clientY - r.top) * dpr, now = performance.now(), inR = q => q && px >= q[0] && px <= q[2] && py >= q[1] && py <= q[3];
    if (inR(mzMap.arrow)) { if (!mzMap.tapped) { mzMap.tapped = true; try { localStorage.setItem('nsg_mz_arrow_tap', '1'); } catch (err) { /* noop */ } } mzGoalWorld(); return; }   // 縁の 矢印を タップすると せかいちずで ゴールの 場所を 見る（ゴールまでの めいろ図は なくした。運営者の声 2026-10-29）
  }
  if (!(worldMode && dragMoved)) {   // 当店の札と絵がいちばん上に描かれているので、先に調べる
    const px = (e.clientX - r.left) * dpr, py = (e.clientY - r.top) * dpr;
    const sh = shopHits.find(([a, b, c2, d]) => px >= a && px <= c2 && py >= b && py <= d);
    if (sh) { $('pxInfoBody').innerHTML = G.popupHtml(sh[4]); $('pxInfo').hidden = false; return; }
  }
  if (worldMode) {   // せかいちず：ドラッグでなければ、近くの注目スポットの説明を出す
    if (dragMoved) return;
    const T = wT(Math.min(window.devicePixelRatio || 1, 3)), x = (e.clientX - r.left) * dpr, y = (e.clientY - r.top) * dpr;
    const ab = areaBoxes.find(([b]) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]);
    if (ab) { $('pxInfoBody').innerHTML = areaHtml(ab[1]); $('pxInfo').hidden = false; return; }
    let hit = null, best = Math.max(T * 1.2, 16 * dpr);
    for (const s of G.spots) {
      if (!worldSpotShown(s)) continue;
      const p = llToW(s.lat, s.lng), d = Math.hypot(x - (cv.width / 2 + (p.x - wcam.x) * T), y - (cv.height / 2 + (p.y - wcam.y) * T));
      if (d < best) { hit = s; best = d; }
    }
    if (hit) { $('pxInfoBody').innerHTML = G.popupHtml(hit); $('pxInfo').hidden = false; return; }
    let bp = null;
    best = Math.max(T, 12 * dpr);
    for (const p of WSIZES[wscale] >= 6 ? worldPois : []) { const d = Math.hypot(x - (cv.width / 2 + (p[0] - wcam.x) * T), y - (cv.height / 2 + (p[1] - wcam.y) * T)); if (d < best) { bp = p; best = d; } }
    if (bp) { $('pxInfoBody').innerHTML = poiHtml(bp); $('pxInfo').hidden = false; }
    return;
  }
  const T = fieldT(Math.min(window.devicePixelRatio || 1, 3));
  const c = camTile();
  const x = (e.clientX - r.left) * dpr, y = (e.clientY - r.top) * dpr;
  // 西尾の人（絵は半マス上に描いているので、その分を足して調べる）
  const ttx = Math.floor(c.x + (x - cv.width / 2) / T), tty = Math.floor(c.y + (y - fieldCy) / T + 0.25);
  if (G.demo && rp.x !== null && !driving && howtoEl.hidden && nazoTap(x, y, performance.now())) return;   // なぞなぞの 札を タップ（nazonazo.js）
  if (G.demo && rp.x !== null && !driving && howtoEl.hidden && Math.hypot(x - (cv.width / 2 + heroScr.x), y - (fieldCy + heroScr.y)) < T * 0.8 && tsunTap(performance.now())) return;   // お米を つんつん（tsun.js）
  const who = npcAt(ttx, tty) || npcAt(ttx, tty - 1);
  if (who) { openNpc(who); return; }
  const rt = rivalTile();
  if (rt && rt.x === ttx && (rt.y === tty || rt.y === tty - 1)) { rivalTalk(); return; }
  let hit = null, best = Infinity;
  // 特大の絵は、手前に描いた絵から順に、絵のある所（透明でない点）をタップしたかで決める
  for (let i = giantHits.length - 1; i >= 0 && !hit; i--) {
    const [gx, gy, gs, s, img] = giantHits[i];
    if (x < gx || y < gy || x >= gx + gs || y >= gy + gs) continue;
    const ix = Math.floor((x - gx) / gs * img.width), iy = Math.floor((y - gy) / gs * img.height);
    if (img.getContext('2d').getImageData(ix, iy, 1, 1).data[3] > 0) hit = s;
  }
  if (!hit) for (const s of G.spots) {
    if (bigOf(s, false)) continue;   // 特大の絵は上で調べた
    const p = toTile(s.lat, s.lng);
    const sx = cv.width / 2 + (p.x - c.x) * T, sy = fieldCy + (p.y - c.y) * T;
    const half = spotSize(s, spriteOf(s), T) / 2 + 4 * dpr, d = Math.hypot(x - sx, y - sy);   // 描いた大きさの半分
    if (Math.abs(x - sx) <= half && Math.abs(y - sy) <= half && d < best) { hit = s; best = d; }
  }
  if (hit) { $('pxInfoBody').innerHTML = G.popupHtml(hit); $('pxInfo').hidden = false; return; }
  let bp = null;
  for (let i = poiHits.length - 1; i >= 0 && !bp; i--) {   // 街の主な建物の特大の絵（6マス）は、絵のある所をタップしたかで
    const [gx, gy, gs, p, img] = poiHits[i];
    if (x < gx || y < gy || x >= gx + gs || y >= gy + gs) continue;
    if (img.getContext('2d').getImageData(Math.floor((x - gx) / gs * img.width), Math.floor((y - gy) / gs * img.height), 1, 1).data[3] > 0) bp = p;
  }
  best = T * 1.2;
  if (!bp) for (const p of poiCache.list) { const d = Math.hypot(x - (cv.width / 2 + (p[0] - c.x) * T), y - (fieldCy + (p[1] - c.y) * T - T * 0.2)); if (d < best) { bp = p; best = d; } }
  if (bp) { $('pxInfoBody').innerHTML = poiHtml(bp); $('pxInfo').hidden = false; return; }
  if (G.demo) tapWalk(Math.floor(c.x + (x - cv.width / 2) / T), Math.floor(c.y + (y - fieldCy) / T));   // 何もない所：そこまで歩く
});
// 操作して移動：地面をタップすると、そこまで道を探して1マスずつ歩く（車のときは道だけなので、スティックで）
//   ・スティック・矢印キーをさわる、窓が開く、着けない所になる、のどれかでやめる。歩いている間は、おまかせ歩きは休む
// 地図の上に何か開いている（ほうびの知らせ・ミニゲーム・説明の窓・きろく などのパネル・はじめの画面・ダイアログ（シェア・クーポン・ホーム画面に追加 など、role="dialog" のものぜんぶ））：
// 見ていない間に うしろで歩いて、たからばこなどが進まないように
//   soft：下に 出る 小さな「ホーム画面に追加」の 帯は のぞく（地図は 見えている。めいろの お米と 時計は 止めない）
function mapCovered(soft) {
  return $('reward').classList.contains('show') || document.body.classList.contains('jump-open')
    || !!document.querySelector(`#pxInfo:not([hidden]), .panel:not([hidden]), #intro:not([hidden]), [role="dialog"]:not([hidden])${soft ? ':not(#a2hs)' : ''}`);
}
function tapWalkStop() { clearTimeout(tapS.timer); tapS.timer = null; tapS.path = []; tapS.goal = null; }
// 地図（キャンバス）より外をさわったら（こよみの札・ボタン・タブ など、何を開くときも）やめる。勝手に出てくるもの（ほうびの知らせ・ダイアログ）は mapCovered で
document.addEventListener('pointerdown', e => { if (tapS.goal && e.target !== cv) tapWalkStop(); }, true);
function tapWalkTick() {
  tapS.timer = null;
  const nx = tapS.path.shift(), t = targetTile(), sx = Math.floor(t.x), sy = Math.floor(t.y);
  if (!nx || !G.demo || !active || worldMode || driving || mapCovered() || Math.abs(nx[0] - sx) + Math.abs(nx[1] - sy) !== 1) return tapWalkStop();
  if (!step(nx[0] > sx ? 'right' : nx[0] < sx ? 'left' : nx[1] > sy ? 'down' : 'up') || !tapS.path.length) return tapWalkStop();
  tapS.timer = setTimeout(tapWalkTick, G.autoInterval ? Math.min(180, G.autoInterval()) : 180);
}
function tapWalk(gx, gy) {
  G.notePlayInput();
  tapWalkStop();
  if (driving) { G.toast('🚗 車は スティックで うごかします'); return; }
  const t = targetTile(), sx = Math.floor(t.x), sy = Math.floor(t.y);
  if (sx === gx && sy === gy) return;
  const avoid = new Set((G.npcs || []).map(n => { const q = npcTile(n); return q.x + ',' + q.y; }));   // 人のマスは通らない（ぶつかると話しかけてしまう）
  const path = planPath(sx, sy, gx, gy, mazeOn() ? (mzType(Math.floor(gx / MZ_K), Math.floor(gy / MZ_K)) === 1 ? 0 : 2) : BLOCK.has(codeAt(gx, gy)) ? 1 : 0, avoid);   // 建物や水（めいろでは 壁の かたまり）をタップしたら、そのそばまで
  if (!path.length) { if (navigator.vibrate) navigator.vibrate(20); return; }
  tapS.path = path; tapS.goal = path[path.length - 1];
  tapWalkTick();
}
$('pxInfo').addEventListener('click', e => {
  if (e.target === $('pxInfo') || e.target.closest('[data-close]') || e.target.closest('[data-move]')) {
    $('pxInfo').hidden = true;
    if (mzArrive.call && !sight.n) { G.callNpc(null); mzArrive.call = ''; }   // めいろの ゴールで「近くで 話せる」あつかいに した 人は、窓を とじたら もどす（めいろの 更新が 止まっていても）
  }
});

G.onModeChange(updatePad);
G.onModeChange(() => { if (driving) setDriving(false); });
// はじめての人はドット絵（ダンジョン風）のせかいちずから
let initial = 'px', worldOn = '1';
try { initial = 'px'; worldOn = localStorage.getItem('nsg_world_on') ?? '1'; } catch (e) { /* noop */ }
if (initial === 'px') { setActive(true); if (worldOn === '1') setWorld(true); }

// テスト用
// めいろ（meiro.js）が使うもの：地図のマス・盤の絵・区画の読みこみ・傾き・音・うしろの地図を止める
const meiroApi = {
  C, CHUNK, codeAt, paintRegion, ensureChunk, chunkState,
  toTile, toLatLng, spriteOf: sp => spriteOf(sp)[0],
  hedgeStyleAt: (tx, ty) => mzStyle(Math.floor(tx / MZ_K), Math.floor(ty / MZ_K)), hedgePat: (x, ox, oy, tile, style) => mzHedgePat(x, ox, oy, tile, style),   // 盤の 台の ふちも 地図と 同じ 生け垣の 種類で（tile：地図の 1マスの 点の 大きさ）
  forgetChunk(cx, cy) { const k = cx + '_' + cy, c = chunks.get(k); if (c && c.state === 'fail') chunks.delete(k); },   // 読めなかった区画を わすれる（やりなおしで すぐ 読みなおす。ふだんは 60秒 待つ）
  slopeAt: (x, y) => slopeAt(x, y), get demGen() { return demGen; },   // 坂（マス/秒² の加速）と、標高が とどくたびに ふえる数（盤を 描きなおす）
  tilt: () => tiltG, tiltAsk, tiltReset, tiltNeedsPermission, koto: (v, low) => kotoSound(v, low), splash: v => splashSound(v), boing: (v, hi) => boingSound(v, hi), rumble: v => rumbleTick(v, GROUND.road),   // rumble：転がる音（速さは 地図の マス/秒）
  pause(on) { meiroPause = !!on; dirty = true; if (on && mzNext.hold) { mzNext.hold = false; if (G.toastFlush) G.toastFlush(); } },   // 止める ときは「つぎの ゴール」で 待たせた 知らせを 出す
};
window.nishioPixel = { meiroApi, maze: { on: () => mazeOn(), playing: () => active && mazeOn(), next: () => ({ want: mzNext.want, t0: mzNext.t0, on: mzNextOn(), labHide: !!mzNext.labHide, arrowDim: !!mzNext.arrowDim, box: mzNext.box || null }), goal: id => {   // id の 名所が いまの ゴール（か 2分 以内の 前の ゴール）なら、かかった 時間と めいろの 道のり
    if (!mazeOn()) return null;
    const now = performance.now(), pv = mzRt.prev, g = mzRt.gid === id ? { t0: mzRt.t0, len0: mzRt.len0, warp: mzRt.warp, moves: mzMv.n, run: { ...mzRt.run } } : pv && pv.id === id && now - pv.at < 120000 ? pv : null;
    if (!g || !g.t0) return null;
    const sec = g.sec !== undefined ? g.sec : (now - g.t0) / 1000;
    return { sec, m: Math.max(0, g.len0 - 1) * MZ_K * TILE_M, stars: g.len0 && !g.warp ? mzStars(sec, g.len0) : 0, par: g.len0 ? mzPar(g.len0).p3 : 0, way: g.len0 && !g.warp && g.len0 >= MZ_WAY_MIN ? Math.max(1, g.moves / (g.len0 - 1)) : 0, run: g.run || null, warp: !!g.warp };   // warp：とちゅうで とびこえた（★・はやさの ベストに 入れない）   // way：通った マスが ちかみちの 何倍か（1 に 近いほど まよわず 来た）
  }, goalFx: text => mzGoalFx(text), fxKinds: () => mzFx.map(p => p.k), route: () => (mazeOn() && mzRt.path ? { cells: mzRt.path.length - 1, m: (mzRt.path.length - 1) * MZ_K * TILE_M } : null), get banner() { return mzBanner.t0 ? mzBanner.text : ''; }, arrive: () => ({ done: mzArrive.done, covered: mapCovered(), howto: !howtoEl.hidden, sight: sightBusy(), soon: !!(G.rewardSoon && G.rewardSoon()), g: G.guide && { kind: G.guide.kind, id: G.guide.id, d: G.me ? Math.round(G.dist(G.me, G.guide)) : null, r: G.guideRadius(G.guide) }, t0: mzRt.t0 }), prevAge: ms => { if (mzRt.prev) mzRt.prev.at -= ms; return !!mzRt.prev; }, routePath: () => (mazeOn() && mzRt.path ? mzRt.path.map(p => [p[0], p[1]]) : null), hint: () => { mzRt.showUntil = performance.now() + 6000; }, lost: () => { mzRt.bestT -= 26000; mzRt.showUntil = 0; }, help: () => ({ on: mzHelpOn(), dots: mzHelp.dots, dead: mzHelp.dead, goals: mzGoalsDone(), told: mzHelp.told, banner: !!(mzNext.want || mzNext.t0) }), helpReset: () => { mzHelp.told = false; }, crows: () => ({ on: mzCrowOn(), hits: mzCrow.hits, shoo: mzCrow.shoo, list: mzCrow.list.map(c => ({ cx: c.cx, cy: c.cy, nx: c.nx, ny: c.ny, t: c.t, chase: c.chase, scared: !!c.scared })) }), scare: () => ({ on: mzScare.on, cx: mzScare.cx, cy: mzScare.cy, left: Math.max(0, mzScare.until - performance.now()), got: mzScare.got }), mvSim: (n0, cells, dt) => { const m = { n: 0, cell: '', prev: '', t: 0, undo: false, x: 0, y: 0 }; let t = 0; for (const c of cells) { if (c === 'R') { mzMvReset(m); continue; } mzMvStep(m, c[0], c[1], t); t += dt; if (m.n === 1 && n0) m.n = n0; } return m.n; }, scarePut: (cx, cy) => { Object.assign(mzScare, { cx, cy, on: true, until: 0, t0: performance.now() }); }, crowPut: (cx, cy) => { mzCrow.list = []; mzCrow.list.push({ id: ++mzCrow.seq, cx, cy, nx: cx, ny: cy, t: 0, dx: 0, dy: 0, chase: false }); mzCrow.hitT = 0; }, open: (cx, cy, dx, dy) => mzOpen(cx, cy, dx, dy), type: (cx, cy) => mzType(cx, cy), spot: (cx, cy) => mzSpotCell(cx, cy), trail: () => [...mzTrail.keys()], get mapArrow() { return mzMap.arrow; }, get arrowAt() { return mzMap.pin || null; }, get goalLab() { return mzMap.goalLab || null; }, get worldGoal() { return worldMode ? mzMap.worldGoal || null : null; }, hudRects: () => mzHudRects(-1e9), clock: () => (mazeOn() && mzRt.t0 && mzRt.len0 ? { sec: (performance.now() - mzRt.t0) / 1000, stars: mzStars((performance.now() - mzRt.t0) / 1000, mzRt.len0), par: mzPar(mzRt.len0).p3 } : null), padsNear: (r = 12) => { const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K), out = []; for (let y = b - r; y <= b + r; y++) for (let x = a - r; x <= a + r; x++) { const d = mzPadAt(x, y); if (d >= 0) out.push([x, y, d]); } return out; }, get padHits() { return mzPad.hits; }, get padChain() { return { n: mzPad.chain, best: mzPad.best }; }, linesNear: () => { const out = []; mzLinesNear(L => out.push({ dots: L.dots.map(d => [...d]), left: L.taken.filter(t => !t).length })); return out; }, get dots() { return { n: mzDots.d === jstDay() ? mzDots.n : 0, lines: mzDots.lines }; }, meibutsuTip: () => mzMeibutsuTip(), pebPct: () => { const a = rp.x === null ? null : mzAreas.get(Math.floor(rp.x / MZ_K / MZ_R) + '_' + Math.floor(rp.y / MZ_K / MZ_R)); return a ? { pct: mzPebPct(a), ...mzPebStat(a) } : null; }, pebsNear: (r = 12) => { const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K), out = []; for (let y = b - r; y <= b + r; y++) for (let x = a - r; x <= a + r; x++) if (mzPebOk(mzAreas.get(Math.floor(x / MZ_R) + '_' + Math.floor(y / MZ_R)), x, y)) out.push([x, y]); return out; }, grainsNear: (r = 12) => { const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K), out = []; for (let y = b - r; y <= b + r; y++) for (let x = a - r; x <= a + r; x++) if (mzType(x, y) === 1 && mzGrainAt(x, y)) out.push([x, y]); return out; }, K: MZ_K, clockS: MZ_CLOCK_PX, tapK: MZ_TAP_K, get arrowTapped() { return mzMap.tapped; }, near: (x, y) => mzNear(x, y), gates: () => [...mzGate.keys()], gatesUsed: () => [...mzGateUsed], gateWalk: (p, a, b) => mzGateWalk(p, a, b), zoneTint: (cx, cy) => { const a = mzArea(cx, cy); return a ? mzZoneTint(a) : null; }, style: (cx, cy) => mzStyle(cx, cy), soft: () => ({ ...mzSoft }), spring: () => ({ ...mzSpring, left: Math.max(0, mzSpring.until - performance.now()) }), springPut: (cx, cy) => { Object.assign(mzSpring, { cx, cy, on: true, t0: performance.now() }); }, springOn: (ms = MZ_SPRING_MS) => { mzSpring.until = performance.now() + ms; }, springBoing: () => mzSpringChain(performance.now()), area: (cx, cy) => mzArea0(cx, cy), critters: () => mzCritDrawn.slice(), critFled: () => mzCritFled.size, critHi: () => mzCritHiN, critMode: () => mzCritMode, say: () => ({ t: riceBub.t, on: performance.now() < riceBub.until, log: riceBub.log.slice() }), sayNow: (t, ms) => riceSay(t, ms, 'happy') }, townBanner: name => { here.banner = name; here.bannerAt = performance.now(); here.box = null; here.waited = 0; here.lastT = 0; }, get riceBox() { return roll.box || null; }, get townWait() { return here.waited || 0; }, set townWait(v) { here.waited = v; }, get townBox() { return here.banner && here.box || null; }, get townDodged() { return !!(here.banner && here.dodged); }, get toastDodgeOff() { return toastDodgeOff; }, set toastDodgeOff(v) { toastDodgeOff = !!v; wtd.key = ''; }, critterSprite: id => critterSprites[id], waterKind, critterStep, suzume: { get list() { return suzume.list.map(b => ({ x: b.x, y: b.y, fly: !!b.fly })); }, put: (x, y) => { suzume.list.length = 0; suzume.next = performance.now() + 6e4; suzumeSpawn(x, y, performance.now() - 1000); }, clear: () => { suzume.list.length = 0; suzume.next = performance.now() + 6e4; }, NEAR: SUZUME_NEAR, visit: () => suzumeVisit(performance.now()), VISIT: SUZUME_VISIT }, neko: { get cat() { const n = neko.cat; return n && { x: n.x, y: n.y, awake: performance.now() - n.awake < NEKO_AWAKE }; }, put: (x, y) => { neko.next = performance.now() + 6e4; neko.cat = { x: x + 0.5, y: y + 0.6, t0: performance.now(), awake: 0, dir: 1, col: NEKO_COLS[0] }; }, clear: () => { neko.cat = null; neko.next = performance.now() + 6e4; }, NEAR: NEKO_NEAR }, deai: { get d() { const d = deai.d; return d && { id: d.id, x: d.x, y: d.y }; }, put: (x, y, id) => { const now = performance.now(); deai.next = now + 6e5; deai.d = { id: id || 'medaka', x, y, t0: now }; }, clear: () => { deai.d = null; deai.next = performance.now() + 6e5; }, get drawn() { return deai.drawn; } }, nakama: { get n() { const n = nakama.n; return n && { kind: n.kind, x: n.x, y: n.y, stop: !!n.stop }; }, kind: () => nakamaKind(), kinds: () => nakamaKinds(), put: (x, y, k) => { const now = performance.now(); nakama.next = now + 6e4; nakama.n = { kind: k || nakamaKind() || 'nasu', x, y, t0: now, last: now, ang: 0, stop: 0 }; }, clear: () => { nakama.n = null; nakama.next = performance.now() + 6e4; }, FOLLOW: NAKAMA_FOLLOW }, kaeru: { get list() { return kaeru.list.map(f => ({ x: f.x, y: f.y, jump: !!f.jump })); }, season: () => kaeruSeason(), put: (x, y) => { const now = performance.now(); kaeru.next = now + 6e4; kaeru.list = [{ x: x + 0.5, y: y + 0.5, t0: now, jump: 0, dir: 1, into: [1, 0], seed: 0 }]; }, clear: () => { kaeru.list.length = 0; kaeru.next = performance.now() + 6e4; }, NEAR: KAERU_NEAR }, mushi: { get m() { const m = mushi.m; return m && { kind: m.kind, x: m.x, y: m.y, flee: !!m.flee }; }, kind: () => mushiKind(), put: (x, y, k) => { const now = performance.now(); mushi.next = now + 6e4; mushi.m = { kind: k || mushiKind() || 'tonbo', x, y, vx: 0, vy: 0, t0: now, last: now, flee: 0, rest: 0, ph: 0 }; }, clear: () => { mushi.m = null; mushi.next = performance.now() + 6e4; }, NEAR: MUSHI_NEAR }, floats: () => floaters.map(f => f.t), floatText, get floatsDrawn() { return floatDrawn.slice(); }, get floatPx() { return floatPx; }, get floatShift() { return floatShift.slice(); }, riceFace: () => { const f = riceBall.faces || {}, sm = f.smile; let shine = 0; if (sm) { const d = sm.getContext('2d').getImageData(0, 0, sm.width, sm.height).data; for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255) shine++; } return { keys: Object.keys(f), shine }; }, breathAt: now => riceBreath(now), get bfly() { return { phase: bfly.phase, drawn: bfly.drawn, calm: calmMotion, smooth: bfly.smooth, at: bfly.at, kind: bfly.kind || '', season: mushiKind() }; }, setIdle: v => { roll.idle = v; }, riceWake, get zzz() { return { n: zzz.n, at: zzz.at }; }, get drop() { return { n: drop.n, at: drop.at }; }, setWet: v => { roll.wetT = v; }, get wakeT() { return roll.wakeT || 0; }, setGb: v => { gbOn = !!v; dirty = true; }, bflyIn, riceLast: () => { const L = riceBall.last; if (!L) return null; const d = riceBall.x.getImageData(0, 0, L.S, L.S).data; let soft = 0, solid = 0, tones = new Set(); for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 0 && d[i + 3] < 255) soft++; else if (d[i + 3] === 255) { solid++; tones.add(d[i] >> 1); } } let ring = 0; for (let i = 0; i < L.S; i++) for (const [x, y] of [[i, 0], [i, L.S - 1], [0, i], [L.S - 1, i]]) ring = Math.max(ring, d[(y * L.S + x) * 4 + 3]); return { ...L, soft, solid, tones: tones.size, ring }; }, moodAt: idle => { const k = roll.kind, id = roll.idle, hv = [roll.happyT, roll.ouchT, roll.dizzyT, roll.v, roll.h, roll.wetT]; Object.assign(roll, { kind: 'stop', idle, happyT: 0, ouchT: 0, dizzyT: 0, v: 0, h: 0, wetT: 0 }); const m = riceMood(1000); roll.kind = k; roll.idle = id; [roll.happyT, roll.ouchT, roll.dizzyT, roll.v, roll.h, roll.wetT] = hv; return m; }, FLOAT_PX, floatAts: () => floaters.map(f => Math.round(f.at - performance.now())), floatsClear: () => { floaters.length = 0; floatLast = -1e9; }, get critterState() { return critterS; }, alleyEnd, get combo() { return { n: combo.n, best: combo.best, beat: combo.beat, pop: combo.pop || 0 }; }, comboBest: v => { combo.best = v; combo.near = 0; }, comboAdd: k => { combo.n += k; combo.quietT = 0; comboStep(); }, get speedK() { return speedFx.k; }, get roll() { return { on: rollOn, x: rp.x, y: rp.y, vx: rp.vx, vy: rp.vy, d: roll.d, ready: riceSprites.ready, kind: roll.kind, av: roll.av, look: roll.look, hv: roll.hv, jumps: roll.jumps, sends: roll.sends, dirt: roll.dirt, mood: riceMood(performance.now()), drawn: roll.drawn, flat: roll.flat, round: !!riceBall.cv, v: roll.v, idle: roll.idle, by: roll.by, spin: roll.spin, pitch: roll.pitch, h: roll.h, slope: rp.x === null ? null : slopeAt(rp.x, rp.y), height: rp.x === null ? null : heightAt(rp.x, rp.y), ground: Object.keys(GROUND).find(k => GROUND[k] === roll.gnd) || "" }; }, blockedAt: (x, y) => rollBlocked(x, y), rollPut: (x, y, vx = 0, vy = 0) => { const ll = toLatLng(x, y); G.moveTo(ll.lat, ll.lng, 'step'); Object.assign(rp, { x, y, vx, vy, sent: { x, y }, sentAt: performance.now(), tile: `${Math.floor(x)},${Math.floor(y)}` }); },   // テスト用：お米を その位置・速さに置く
  slopeAt: (x, y) => slopeAt(x, y),   // テスト用：その マスの かたむき
  rollBlockedFrom: (fx, fy, x, y) => (mazeOn() ? mzBlocked(fx, fy, x, y) : rollBlocked(x, y)), chaHana: () => chaHanaOn(), koroArt: () => koroReady(), ambN: () => ambN(), AMB_MAX, kabuse: { on: t => kabuseOn(t), paint: (T = 32) => { const c = document.createElement('canvas'); c.width = c.height = T; const keep = ctx; ctx = c.getContext('2d'); try { drawKabuse(0, 0, 0, 0, T); } finally { ctx = keep; } const d = c.getContext('2d').getImageData(0, 0, T, T).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 100) n++; return n; } }, morning: { get k() { return morning.k; }, level: t => morningLevel(t), force: v => { morningForce = v; dirty = true; } }, sentaku: { get n() { return sentaku.n; }, on: wx => sentakuOn(wx), paint: (T = 32) => { const c = document.createElement('canvas'); c.width = c.height = T; const keep = ctx; ctx = c.getContext('2d'); try { drawSentaku(0, 0, Math.max(1, Math.round(T / 16)), 0, 0); } finally { ctx = keep; } const d = c.getContext('2d').getImageData(0, 0, T, T).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; } }, donguri: { get d() { const d = donguri.d; return d && { x: d.x, y: d.y, v: Math.hypot(d.vx, d.vy) }; }, season: () => donguriSeason(), put: (x, y, vx = 1.4, vy = 0) => { const now = performance.now(); donguri.next = now + 6e4; donguri.d = { x, y, vx, vy, t0: now, last: now, ang: 0 }; }, clear: () => { donguri.d = null; donguri.next = performance.now() + 6e4; }, ready: () => { donguri.next = 0; }, blocked: (x, y) => donBlocked(x, y), LIFE: DONGURI_LIFE }, hamon: { get list() { return hamon.list.map(r => ({ x: r.x, y: r.y })); }, put: (x, y) => { hamon.list.push({ x, y, t0: performance.now() }); }, clear: () => { hamon.list.length = 0; }, MS: HAMON_MS }, nightForce: v => { nightForce = v; dirty = true; }, get nightLamps() { return { ...nightLamps }; }, chaHanaPaint: (tx, ty, T = 32) => { const c = document.createElement('canvas'); c.width = c.height = T; const keep = ctx; ctx = c.getContext('2d'); try { drawChaHana(tx, ty, 0, 0, T); } finally { ctx = keep; } const d = c.getContext('2d').getImageData(0, 0, T, T).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] > 240 && d[i + 2] > 230) n++; return n; }, tileAt: (x, y) => codeAt(Math.floor(x), Math.floor(y)), wet: () => roll.wetT, riceStreak, drawRice: (dst, X, Y, th, sq = 0, mood = 'smile', dirt = 0, dirtCol = '', u = 1, pitch = 0) => { if (!riceBall.cv) return false; drawRiceBall(X, Y, u, th, 1 + sq, 1 - sq, 0, dst, false, mood, 0, dirt, dirtCol, pitch); return true; }, setRoll, setHeightFn: fn => { heightFn = fn || null; }, mapCovered, sightBusy, sightCheck, sightForget: id => { sight.seen.delete(id); },
  // いまの町名が新しいか（歩く地図を描いていて、いまの位置で2秒以内に確かめた。せかいちず・ふつうの地図に切り替えたあとの古い町名は使わない）
  get hereFresh() { return active && !worldMode && !!G.me && performance.now() - here.at < 2000; }, spotSprites, spriteOf: sp => spriteOf(sp)[0], npcSprite: look => (npcSprites[look] || npcSprites.man)[0], art: { hiCanvas, shopCanvas, tileRoof, spanRows, pix, genSprite, GEN_DRAW }, get towns() { return towns; }, get here() { return here; }, npcTile, rasterize, chunkQuery, chunkBox, chunkInPlay, luReady, luAt, unrle, overpass, toTile, toLatLng, codeAt, rawAt, C, CHUNK, chunks, setActive, centerOnMe, demFor, get worldMode() { return worldMode; }, merc, buildWorld, setWorld, llToW, WORLD_KEY, WW, WH, get world() { return world; }, get worldPois() { return worldPois; }, get worldLabels() { return worldLabels; }, get pois() { return poiCache.list; }, BUILDING_ART, get worldState() { return worldState; }, get areaBoxes() { return areaBoxes; }, get shopHits() { return shopHits; }, get chests() { return chests; }, get traffic() { return traffic; }, get driving() { return driving; }, toggleCar, floatText, onPaddy, get tapGoal() { return tapS.goal; }, trailWalk, trailHas, trailClear, get trailCells() { return TRAIL.world.size; }, get trailWorld() { return [...TRAIL.world]; },
  tileToClient(tx, ty) {   // 歩く地図のマスのまん中が、画面のどこか（台本でタップするため）
    const r = cv.getBoundingClientRect(), dpr = cv.width / r.width, T = fieldT(Math.min(window.devicePixelRatio || 1, 3)), c = camTile();
    return { x: r.left + (cv.width / 2 + (tx + 0.5 - c.x) * T) / dpr, y: r.top + (fieldCy + (ty + 0.5 - c.y) * T) / dpr };
  }, ensureAround(lat, lng) { const q = toTile(lat, lng); ensureChunk(Math.floor(q.x / CHUNK), Math.floor(q.y / CHUNK)); } };
})();
