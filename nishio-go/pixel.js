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
const here = { town: '', city: '', banner: '', bannerAt: 0 };
function updateHere() {
  const t = targetTile(), me = G.me, c = me && (G.placeAt || G.cityAt)(me.lat, me.lng), city = c ? c.name : '';
  // 同じ市町の町名だけから選ぶ（境のそばで「西尾市 金平町（蒲郡市）」のようにならないように）
  let best = null, bd = 150;
  for (const x of towns) { if (x[3] !== city) continue; const d = Math.hypot(x[0] - t.x, x[1] - t.y); if (d < bd) { bd = d; best = x; } }
  const town = best ? best[2] : '';
  if (town && here.town && town !== here.town) { here.banner = town; here.bannerAt = performance.now(); if (G.onTownEnter) G.onTownEnter(town, city); }
  here.town = town;   // 近くに町名がない（田畑や山の中）ときは消す
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
function fillLanduse(g, cx, cy) {
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
      g[i] = front || h % 4 ? C.Q : C.T;
    } else if (u === 'h' || u === 'f' || u === 'g') g[i] = C.T;
    else if (u === 'l') g[i] = C.P;
    else if (u === 'j') g[i] = C.S;
    else g[i] = C.G;
  }
  g.lu = !!LU;
}
function rasterize(elements, cx, cy, dem) {
  const g = new Uint8Array(CHUNK * CHUNK).fill(UNSET);
  const x0 = cx * CHUNK, y0 = cy * CHUNK;
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
    if (!k) continue;
    const pts = rings.map(r => r.map(p => { const q = toTile(p.lat, p.lon); return [q.x - x0, q.y - y0]; }));
    if (k.coast) coasts.push(...pts); else ops.push({ k, pts });
  }
  g.pois = dedupePois(pois, 4);
  const dh = (x, y) => dem[(y + 1) * DB + (x + 1)];
  ops.sort((a, b) => a.k.p - b.k.p);
  let seaDone = false;
  const sea = () => { if (!seaDone) { seaDone = true; if (coasts.length) seaFill(g, coasts); } };   // 海は海岸線で決める
  for (const o of ops) {
    if (o.k.p >= 18) sea();
    if (o.k.a) {
      // 1マスより小さい建物も、中心のマスだけは塗る
      if (!fillPoly(g, o.pts, o.k.c) && o.k.c === C.B) {
        const r = o.pts[0], m = r.reduce((s, p) => [s[0] + p[0] / r.length, s[1] + p[1] / r.length], [0, 0]);
        const mx = Math.floor(m[0]), my = Math.floor(m[1]);
        if (mx >= 0 && my >= 0 && mx < CHUNK && my < CHUNK) g[my * CHUNK + mx] = C.B;
      }
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
  fillLanduse(g, cx, cy);
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
        chunks.set(k, { state: 'ok', g: pre.lu ? pre : townify(pre), pois: pre.pois });
        dirty = true;
        continue;
      }
      // 2) 用意した区画がなければ、前にブラウザで作って端末に保存した区画
      const saved = store.get(PX_KEY + k);
      if (saved && saved.d && saved.d.length === CHUNK * CHUNK && Date.now() - saved.t < (saved.days || PX_DAYS) * 864e5) {
        chunks.set(k, { state: 'ok', g: saved.lu ? dec(saved.d) : townify(dec(saved.d)), pois: saved.p || [] });
        dirty = true;
        continue;
      }
      // 3) それもなければ、ブラウザで地図データと標高を取って作る
      try {
        // 地図データと標高を同時に取得（標高が取れなくても地図は作る）
        const [json, dem] = await Promise.all([overpass(chunkQuery(chunkBox(cx, cy))), demFor(cx, cy).catch(() => null), luReady]);
        const g = rasterize(json.elements || [], cx, cy, dem && dem.h);
        saveChunk(k, g, dem && !dem.partial ? PX_DAYS : 1);   // 標高が欠けた区画は1日で取り直す
        chunks.set(k, { state: 'ok', g: BAKE || g.lu ? g : townify(g), pois: g.pois || [] });
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
// 季節が変わったら（月が替わる・紅葉や桜のころに入る）、田畑・森・公園のタイルとせかいちずの色を作り直す。1分ごとに確かめる
let seasonCheckT = 0;
function refreshSeason(now) {
  if (now - seasonCheckT < 60000) return;
  seasonCheckT = now;
  const k = seasonNow();
  if (k === seasonKey) return;
  seasonKey = k;
  WCOL[C.U] = WCOL[C.F] = PADDY_COL;
  buildTiles([C.U, C.F, C.W, C.P]);
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
  down: ['...kyykkkkyyk...', '...kyksssskyk...', '....kskssksk....', '....kssssssk....', '...kkbkkkkbkk...', '..kssbbbbbbssk..', '..kssbbyybbssk..', '...kkbbbbbbkk...', '....kbbbbbbk....'],
  up: ['...kyyyyyyyyk...', '...kyyyyyyyyk...', '....kyyyyyyk....', '....kssssssk....', '...kkbkkkkbkk...', '..kssbbbbbbssk..', '..kssbbbbbbssk..', '...kkbbbbbbkk...', '....kbbbbbbk....'],
  right: ['...kyyyykkkkk...', '...kyyyksssk....', '...kyyksskssk...', '....kksssssk....', '....kkbbbbkk....', '....kbbbbsssk...', '....kbbbbsssk...', '....kbbbbbbk....', '....kbbbbbbk....'],
};
const mirror = rows => rows.map(r => [...r].reverse().join(''));
// 西尾の人たち（npcs.js）：同じ形で、髪・服・ズボンの色を変える（h 髪、c 服、p ズボン、a 小物）
const NPC_ROWS = ['................', '.....kkkkkk.....', '....khhhhhhk....', '...khhhhhhhhk...', '...khsssssshk...', '...kskssssksk...', '....kssssssk....', '.....kssssk.....',
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
function openNpc(n) {
  const r = G.talkNpc(n.id);
  if (!r) return;
  $('pxInfoBody').innerHTML = r.html; $('pxInfo').hidden = false;
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
// ふつうの地図の現在地マーカーも、同じ勇者のドット絵（2コマで足ぶみ）にする
(() => {
  const sheet = document.createElement('canvas');
  sheet.width = 64; sheet.height = 32;
  const x = sheet.getContext('2d');
  x.imageSmoothingEnabled = false;
  heroSprites.down.forEach((c, i) => x.drawImage(c, i * 32, 0, 32, 32));
  const st = document.createElement('style');
  st.textContent = `.me,.me.demo{width:32px;height:32px;border:0;border-radius:0;box-shadow:none;background:url(${sheet.toDataURL()}) 0 0/64px 32px no-repeat;image-rendering:pixelated;animation:heroStep .9s steps(1) infinite;filter:drop-shadow(0 2px 1px rgba(0,0,0,.45))}
@keyframes heroStep{0%{background-position:0 0}50%{background-position:-32px 0}}
@media (prefers-reduced-motion:reduce){.me{animation:none}}`;
  document.head.appendChild(st);
})();
const spotSprites = {};
for (const [k, rows] of Object.entries({ ...ART, ...BUILDING_ART })) spotSprites[k] = [sprite(rows), sprite(rows, true)];
spotSprites.store = spotSprites.shop;
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
  'f-hazu-jinja': 'hazuJinja', 'f-nishi-hazu': 'nishiHazu', 'f-higashi-hazu': 'higashiHazu', 'f-toba-shinmei': 'tobaShinmei', 'f-jofukuji': 'daibutsu', 'f-kasuya-tei': 'kasuyaTei', 'f-yatsuomote': 'yatsuomote',
};
const ROOF = '#4a4f57', ROOF_HI = '#6c737d', WALL = '#f3f1ea', WOOD = '#5b4632';
// カモメの駐車場（佐久島のアート）：石の防波堤に、カモメの木像がずらりと並ぶ
spotSprites.kamome = shopCanvas((r, h) => {
  const SG = '#9d968b', SL = '#c2bbaf', SD = '#6f685e', BW = '#eef1f3', BG = '#8f99a3', PO = '#e0902a';
  [[2, 29], [1, 30], [0, 31], [0, 31], [0, 31], [0, 31], [0, 31], [1, 31], [1, 30], [2, 29], [3, 28]].forEach(([a, b], i) => h(17 + i, a, b, SG));
  for (let y = 18; y < 27; y += 3) for (let x = (y % 2) * 3; x < 31; x += 6) { r(x, y, 1, 2, SD); r(x + 1, y, 3, 1, SL); }
  for (let i = 0; i < 5; i++) {   // 横向きのカモメ（右が頭）と、立てた棒
    const x = 1 + i * 6, y = 11 + (i % 2);
    r(x + 2, y + 3, 1, 3, PO);
    pix(r, ['...##', '#####', '.###.'], x, y, BW); pix(r, ['.....', '.##..'], x, y, BG); r(x, y + 1, 1, 1, '#333'); r(x + 4, y, 1, 1, '#333'); r(x + 5, y + 1, 1, 1, PO);
  }
}, true);
// 稲荷山茶園公園：まるくかりこんだ茶の木の列と、あずまや
spotSprites.chaen = shopCanvas((r, h) => {
  const TG = '#3f8f3a', TL = '#7fc65e', TD = '#2a5f28', SO = '#b08a5a';
  r(15, 4, 2, 1, '#6a5444'); [[13, 18], [11, 20], [9, 22], [7, 24]].forEach(([a, b], i) => h(5 + i, a, b, i ? '#4a3a2e' : '#6a5444'));
  r(9, 9, 1, 7, WOOD); r(22, 9, 1, 7, WOOD); h(13, 11, 20, '#8a6a4a');
  for (const y of [15, 20, 25]) {
    h(y, 1, 30, TL); r(0, y + 1, 32, 2, TG); h(y + 3, 0, 31, TD); if (y < 25) h(y + 4, 0, 31, SO);
    for (let x = 2 + (y % 2) * 2; x < 30; x += 5) { h(y - 1, x, x + 1, TL); r(x + 3, y + 1, 1, 1, TL); }   // 新芽のでこぼこ
  }
}, true);
// 2回目に足した名所（同じく Wikimedia Commons の写真を参考に。docs/landmark-photos.md）
// spans の行を上から順に塗る（[x0, x1] の並び。col は色か、行の番号から色を返す関数）
const spanRows = (h, y0, spans, col) => spans.forEach(([a, b], i) => h(y0 + i, a, b, typeof col === 'function' ? col(i) : col));
// 尚古荘：松の庭と、縁側に障子の座敷
spotSprites.shokoso = shopCanvas((r, h) => {
  const SJ = '#f2eee2', SG = '#bfb6a0', PN = '#2f6a3a', PL = '#4f8a4a';
  spanRows(h, 7, [[6, 29], [5, 30], [4, 31], [3, 31], [2, 31]], i => i ? ROOF : ROOF_HI);
  r(4, 12, 27, 10, SJ); for (let x = 4; x < 31; x += 3) r(x, 12, 1, 10, SG); h(16, 4, 30, SG);
  for (const x of [4, 13, 22, 30]) r(x, 12, 1, 11, '#6a4a30');
  h(22, 3, 31, '#8a6a4a'); h(23, 3, 31, '#6a4a30');
  r(14, 25, 18, 7, '#5fa0c0'); h(25, 14, 31, '#8cc0dd'); r(20, 28, 3, 1, '#8cc0dd');   // 池
  for (const [x, y, w] of [[9, 24, 4], [3, 26, 6], [10, 28, 4]]) { r(x, y, w, 2, '#a9a49a'); h(y, x, x + w - 1, '#c8c3b8'); }
  r(5, 6, 1, 18, '#6a4a30'); r(6, 4, 1, 4, '#6a4a30');   // 松
  for (const [x, y] of [[0, 1], [3, 5], [0, 9], [3, 13]]) { pix(r, ['.#####.', '#######', '.#####.'], x, y, PN); h(y, x + 2, x + 4, PL); }   // 枝ごとに丸く刈りこんだ葉
}, true);
// 伊文神社：緑青の銅ぶき屋根の拝殿と、しめ縄・石灯籠
spotSprites.ibunJinja = shopCanvas((r, h) => {
  const CU = '#5f9e8a', CH = '#86c0ac', CD = '#3e6e60', PI = '#c8a46a', IN = '#3a2a20', ST = '#a9a49a';
  spanRows(h, 5, [[10, 21], [8, 23], [6, 25], [4, 27], [2, 29], [1, 30]], i => i === 0 ? CD : i === 2 ? CH : CU);
  h(11, 0, 31, CD); r(0, 10, 1, 1, CD); r(31, 10, 1, 1, CD);
  spanRows(h, 7, [[15, 16], [13, 18], [12, 19], [11, 20]], CU); h(10, 13, 18, CD); r(15, 8, 2, 1, '#e2b13a');   // 正面の破風
  r(5, 12, 22, 11, IN); for (const x of [5, 10, 21, 26]) r(x, 12, 1, 11, PI);
  for (let x = 12; x < 20; x += 2) r(x, 16, 1, 7, '#5a4430');
  r(7, 13, 18, 2, '#f0e6c8'); for (const x of [10, 15, 20]) { r(x, 15, 1, 1, '#ffffff'); r(x + 1, 16, 1, 1, '#ffffff'); }
  h(23, 4, 27, '#8a6a4a'); spanRows(h, 24, [[11, 20], [10, 21], [9, 22], [8, 23]], i => i % 2 ? ST : '#c8c3b8');
  for (const x of [0, 28]) { r(x + 1, 18, 2, 1, ST); r(x, 19, 4, 2, ST); r(x + 1, 20, 2, 1, '#ffe27a'); r(x + 1, 21, 2, 6, ST); r(x, 27, 4, 1, ST); }
}, true);
// 抹茶ミュージアム 西条園 和く和く：ベージュの壁に緑のマーク、竹垣
spotSprites.wakuwaku = shopCanvas((r, h) => {
  const BE = '#d8c9a8', GR = '#3f9a3a';
  r(1, 5, 30, 3, '#3a3a3a'); r(2, 8, 27, 20, BE);
  r(5, 10, 4, 4, GR); r(6, 11, 2, 2, '#ffffff'); pix(r, ['#.#.##.#.#.##', '.#..#..#.#.#.'], 11, 11, GR);
  r(5, 17, 9, 6, '#3b3020'); r(6, 18, 3, 2, '#e8a050'); r(10, 18, 3, 3, '#8fc05a');
  r(15, 17, 6, 11, '#2b3440'); r(17, 17, 1, 11, '#5a6470');
  r(21, 18, 11, 10, '#c8b88a'); for (let x = 22; x < 32; x += 2) r(x, 18, 1, 10, '#9a8a5e'); h(21, 21, 31, '#222'); h(25, 21, 31, '#222');   // 竹垣
  r(0, 24, 5, 4, '#3f8a34'); r(1, 23, 3, 1, '#6fba50');
}, true);
// 三河工芸ガラス美術館：白い箱の建物に青いたて長の窓、1階のガラスに色ガラス
spotSprites.glassMuseum = shopCanvas((r, h) => {
  r(4, 3, 24, 25, '#d6d4ce'); h(3, 4, 27, '#eceae4');
  for (const x of [11, 13, 18, 20]) r(x, 7, 1, 7, '#3b5f9e');
  h(17, 3, 28, '#bdbab3'); h(18, 3, 28, '#9e9b94');
  r(6, 19, 20, 9, '#4c5c6a'); for (const x of [10, 15, 20]) r(x, 19, 1, 9, '#cfd4d8');
  for (const [x, y, c] of [[7, 21, '#e57373'], [12, 22, '#ffd54f'], [17, 21, '#64b5f6'], [22, 22, '#81c784'], [8, 24, '#ba68c8'], [23, 25, '#ffb74d']]) r(x, y, 2, 2, c);
}, true);
// 道の駅にしお岡ノ山：瓦屋根の平屋が2つと、青い道の駅の看板、駐車場
spotSprites.michinoeki = shopCanvas((r, h) => {
  const WL = '#e8e2d2';
  spanRows(h, 9, [[4, 13], [2, 15], [1, 16], [0, 17]], i => i ? ROOF : ROOF_HI); spanRows(h, 7, [[8, 9], [7, 10]], ROOF);
  r(1, 13, 16, 10, WL); for (const x of [1, 6, 11, 16]) r(x, 13, 1, 10, WOOD); r(7, 16, 4, 7, '#3f5566');
  spanRows(h, 12, [[19, 28], [17, 30], [16, 31], [15, 31]], i => i ? ROOF : ROOF_HI);
  r(16, 16, 15, 7, WL); for (const x of [16, 23, 30]) r(x, 16, 1, 7, WOOD); r(18, 18, 4, 3, '#6f8fa8'); r(25, 18, 4, 3, '#6f8fa8');
  r(2, 15, 4, 5, '#2a5fb0'); r(3, 16, 2, 1, '#ffffff'); r(3, 18, 2, 1, '#ffffff'); r(3, 20, 1, 4, '#888');   // 道の駅の看板
  r(0, 24, 32, 6, '#8a8a88'); for (let x = 3; x < 32; x += 6) r(x, 25, 1, 4, '#f4f4f4');
}, true);
// 三河一色諏訪神社：瓦の大きな拝殿と、石の鳥居
spotSprites.isshikiSuwa = shopCanvas((r, h) => {
  const ST = '#9a968c', SH = '#c2beb4';
  spanRows(h, 3, [[11, 20], [9, 22], [7, 24], [5, 26], [3, 28], [2, 29], [1, 30]], i => i === 0 || i === 3 ? ROOF_HI : ROOF);
  spanRows(h, 5, [[15, 16], [14, 17], [13, 18], [12, 19]], '#ece5d4'); h(9, 12, 19, WOOD);
  h(10, 0, 31, '#2e3238'); r(3, 11, 26, 13, '#8a6a4a'); r(11, 13, 10, 10, '#3a2a20'); for (const x of [3, 10, 21, 28]) r(x, 11, 1, 13, '#6a4a30');
  h(24, 2, 29, ST);
  h(13, 3, 28, ST); h(14, 4, 27, SH); r(3, 12, 1, 1, ST); r(28, 12, 1, 1, ST); h(17, 7, 24, ST);   // 鳥居
  r(8, 15, 2, 15, ST); r(22, 15, 2, 15, ST); r(15, 15, 2, 2, '#3a3a3a');
  h(30, 6, 25, '#b8b2a6'); h(31, 6, 25, '#9a948a');
}, true);
// 一色港：佐久島へ渡る白い高速船（青と赤の線）
spotSprites.isshikiPort = shopCanvas((r, h) => {
  const WH = '#f4f6f8', SE = '#4f8fbf';
  r(14, 3, 1, 6, '#555'); h(4, 12, 16, '#555');
  r(9, 8, 11, 3, WH); r(10, 9, 8, 1, '#2b3440');
  r(5, 11, 18, 5, WH); for (let x = 7; x < 21; x += 3) r(x, 12, 2, 2, '#2b3440');
  spanRows(h, 16, [[1, 27], [1, 29], [1, 30], [2, 31], [2, 30], [3, 29], [3, 28], [4, 27], [5, 26]], i => i === 3 ? '#2f5fae' : i === 5 ? '#d23a2e' : i >= 7 ? '#2f5fae' : WH);
  r(0, 25, 32, 7, SE); for (const [x, y] of [[2, 27], [12, 29], [22, 27], [27, 30], [7, 30]]) r(x, y, 3, 1, '#8cc0e0');
}, true);
// 愛知こどもの国：園内を走る白い汽車（ロードトレイン）
spotSprites.kodomoTrain = shopCanvas((r, h) => {
  const WH = '#f4f4f4', RD = '#d23a2e', BK = '#222', WN = '#2b3440';
  h(9, 0, 16, RD); h(10, 0, 16, RD); for (const x of [0, 8, 16]) r(x, 11, 1, 6, '#888');
  for (const [x, c] of [[2, '#ffb300'], [5, '#5a3418'], [10, '#e57373'], [13, '#2b2018']]) r(x, 14, 2, 2, c);
  r(0, 16, 17, 6, WH); h(19, 0, 16, RD);
  r(18, 8, 6, 2, '#b33a2e'); r(18, 10, 6, 12, WH); r(19, 11, 4, 3, WN);
  r(24, 14, 6, 8, WH); h(17, 24, 29, RD); r(26, 8, 3, 6, BK); r(25, 7, 5, 1, BK); r(30, 18, 2, 4, BK); r(28, 15, 1, 1, '#ffe27a');
  for (const x of [2, 11, 20, 26]) { r(x, 21, 4, 4, BK); r(x + 1, 22, 2, 2, '#9a9a9a'); }
  r(0, 26, 32, 4, '#7a7a7a'); h(27, 0, 31, '#f2c230');
}, true);
// 東条城跡（吉良）：木の物見やぐらと門、まわりの木の柵
spotSprites.tojoJo = shopCanvas((r, h) => {
  const WD = '#6a4a30', WL = '#8a6a4a', DK = '#3a3a3a';
  spanRows(h, 1, [[23, 25], [21, 27], [19, 29], [18, 30]], DK); r(19, 5, 11, 5, WL); r(22, 6, 5, 2, '#2a2018');
  r(20, 10, 2, 19, WD); r(27, 10, 2, 19, WD); for (let y = 12; y < 28; y += 5) { h(y, 22, 26, WD); r(23 + (y % 2), y + 1, 2, 1, WD); }
  spanRows(h, 13, [[3, 13], [1, 15], [0, 16]], DK); r(2, 16, 2, 11, WD); r(13, 16, 2, 11, WD); r(4, 17, 9, 10, '#5a3e28'); r(8, 17, 1, 10, '#3a2818');
  for (let x = 0; x < 32; x += 2) if (x < 1 || x > 16) r(x, 21, 1, 7, WL); h(23, 17, 31, WD);
  r(0, 28, 32, 3, '#5a9a3a'); h(28, 0, 31, '#7fbf5f');
}, true);
// 妙善寺（かぼちゃ寺）：瓦屋根の小さなお堂と、かぼちゃ
spotSprites.myozenji = shopCanvas((r, h) => {
  r(15, 2, 2, 2, '#b88a12');
  spanRows(h, 4, [[13, 18], [11, 20], [9, 22], [7, 24], [5, 26], [4, 27]], i => i === 5 ? '#2e3238' : i % 2 ? ROOF : ROOF_HI);
  r(8, 10, 16, 12, '#7a5a3c'); r(12, 12, 8, 10, '#3e3024'); for (let x = 13; x < 20; x += 2) r(x, 12, 1, 10, '#6a5640');
  spanRows(h, 22, [[10, 21], [9, 22], [8, 23], [7, 24]], i => i % 2 ? '#a9a49a' : '#c8c3b8');
  for (const x of [0, 25]) {
    pix(r, ['.####.', '######', '######', '######', '.####.'], x, 25, '#3e6b2e'); r(x + 2, 25, 1, 5, '#2c4f20'); r(x + 4, 26, 1, 3, '#5a8a40'); r(x + 2, 24, 2, 1, '#6a4a30');
  }
}, true);
// 吉良饗庭塩の里：砂をならした塩田と、塩をたく小屋
spotSprites.shioNoSato = shopCanvas((r, h) => {
  const SA = '#d9cfb3', SD = '#c4b896';
  spanRows(h, 7, [[20, 23], [18, 25], [16, 27], [15, 28]], '#4a3a2e'); r(16, 11, 12, 7, '#3a2c20'); for (let x = 18; x < 28; x += 3) r(x, 11, 1, 7, '#55402e'); r(20, 13, 3, 5, '#1e1610');
  h(10, 1, 11, '#6a4a30'); h(11, 0, 12, '#6a4a30'); r(1, 12, 1, 6, WOOD); r(11, 12, 1, 6, WOOD);
  r(0, 18, 32, 13, SA); h(18, 0, 31, '#8a7a5a'); for (let y = 20; y < 31; y += 2) h(y, 1, 30, SD);
  r(4, 24, 5, 2, '#7fb8d8'); r(23, 26, 1, 4, '#8a6a4a'); h(29, 21, 25, '#8a6a4a');
}, true);
// 吉良ワイキキビーチ（宮崎海水浴場）：砂浜と海、うしろの山とホテル
spotSprites.waikiki = shopCanvas((r, h) => {
  r(17, 3, 13, 12, '#f2f2ee'); for (let y = 5; y < 14; y += 3) for (let x = 19; x < 29; x += 3) r(x, y, 2, 1, '#6f8fa8');
  spanRows(h, 8, [[0, 16], [0, 17], [0, 18], [0, 31], [0, 31], [0, 31], [0, 31]], i => i % 2 ? '#3f7a34' : '#4f8a3a');
  spanRows(h, 15, [[0, 31], [0, 31], [0, 31], [2, 31], [5, 31], [8, 31], [11, 31], [14, 31], [17, 31], [20, 31]], '#ecdcae');
  spanRows(h, 18, [[0, 1], [0, 4], [0, 7], [0, 10], [0, 13], [0, 16], [0, 19], [0, 31], [0, 31], [0, 31], [0, 31], [0, 31], [0, 31], [0, 31]], '#3f8fcf');
  for (const [x, y] of [[2, 24], [10, 28], [20, 29], [5, 30], [26, 31]]) h(y, x, x + 2, '#8cc0e0');
  for (const [x, c] of [[14, '#d23a2e'], [23, '#ffb300']]) { h(13, x - 2, x + 2, c); h(14, x - 3, x + 3, c); r(x, 15, 1, 4, '#555'); }
}, true);
// 岡崎城：白い壁の天守と石垣（徳川家康の生まれた城）
spotSprites.okazakiCastle = shopCanvas((r, h) => {
  const RF = '#5a606a', RH = '#7c838d', WL = '#f6f6f2', WN = '#3a3a3a', ST = '#9b968a', SD = '#6f6a61', GD = '#e2b13a';
  for (let y = 24; y < 32; y++) h(y, 5 - ((y - 24) >> 1), 26 + ((y - 24) >> 1), ST);
  h(27, 4, 27, SD); h(30, 2, 29, SD); for (const x of [10, 16, 22]) r(x, 25, 1, 2, SD);
  r(6, 19, 20, 5, WL); for (const x of [9, 13, 18, 22]) r(x, 20, 2, 2, WN);
  h(15, 8, 23, RH); h(16, 6, 25, RF); h(17, 4, 27, RF); h(18, 3, 28, RF); r(3, 17, 1, 1, RF); r(28, 17, 1, 1, RF);
  spanRows(h, 13, [[15, 16], [14, 17]], RF); r(14, 15, 4, 1, WL);
  r(9, 10, 14, 5, WL); for (const x of [11, 15, 19]) r(x, 11, 2, 2, WN);
  h(8, 10, 21, RH); h(9, 8, 23, RF); r(7, 8, 1, 1, RF); r(24, 8, 1, 1, RF);
  r(12, 5, 8, 3, WL); r(14, 6, 1, 1, WN); r(17, 6, 1, 1, WN);
  h(2, 12, 19, RH); h(3, 11, 20, RF); h(4, 10, 21, RF); r(10, 3, 1, 1, RF); r(21, 3, 1, 1, RF);
  r(12, 0, 1, 2, GD); r(19, 0, 1, 2, GD);
}, true);
// カクキュー 八丁味噌：石を山のように積んだ、大きな木の仕込み樽
spotSprites.misoBarrel = shopCanvas((r, h) => {
  const WD = '#9a6a3a', WH = '#b5824e', BD = '#4a3020', SG = '#a8a49c', SL = '#d0ccc4', SK = '#6f6a61';
  const barrel = (x0, x1, y0, y1) => {
    r(x0, y0, x1 - x0 + 1, y1 - y0 + 1, WD); r(x0 - 1, y0 + 2, 1, y1 - y0 - 3, WD); r(x1 + 1, y0 + 2, 1, y1 - y0 - 3, WD);
    for (let x = x0 + 2; x < x1; x += 3) r(x, y0, 1, y1 - y0 + 1, WH);
    for (const y of [y0 + 1, Math.round((y0 + y1) / 2), y1 - 1]) h(y, x0 - 1, x1 + 1, BD);
    let w = x1 - x0 - 1, y = y0 - 1;   // 石の山
    for (let x = x0 + 1; w > 0; y -= 2, w -= 4, x += 2) for (let sx = x; sx + 1 <= x + w; sx += 3) { r(sx, y - 1, 3, 2, SG); r(sx, y - 1, 2, 1, SL); r(sx + 2, y, 1, 1, SK); }
  };
  barrel(2, 15, 14, 29); barrel(17, 29, 17, 30);
}, true);
// デンパーク（安城）：とんがった屋根の窓が並ぶ建物と、黄色いひさし、花だん
spotSprites.denpark = shopCanvas((r, h) => {
  const RF = '#4a5a4a', RH = '#5e705e';
  spanRows(h, 9, [[3, 28], [2, 29], [1, 30], [0, 31], [0, 31], [0, 31], [0, 31]], i => i % 3 ? RF : RH);
  for (const x of [5, 15, 25]) { spanRows(h, 5, [[x, x + 1], [x - 1, x + 2], [x - 2, x + 3], [x - 2, x + 3], [x - 2, x + 3]], RF); r(x - 1, 8, 4, 3, '#f4f0e4'); r(x, 9, 2, 2, '#6f8fa8'); }
  r(0, 16, 32, 2, '#e8c840'); h(18, 0, 31, '#c8a830');
  r(1, 19, 30, 7, '#f4f0e4'); for (let x = 3; x < 30; x += 5) r(x, 20, 3, 5, '#4c5c6a'); for (const x of [0, 10, 21, 31]) r(x, 18, 1, 9, '#7a5a3c');
  r(0, 27, 32, 2, '#3f8a34'); for (let x = 1; x < 32; x += 3) r(x, 27, 1, 1, x % 2 ? '#d23a2e' : '#ffd54f');
}, true);
// 碧南海浜水族館：白い建物に青い帯、塔の上に青い丸いマーク
spotSprites.hekinanAquarium = shopCanvas((r, h) => {
  const WH = '#f4f6f8', BL = '#2f74b8', CY = '#4fb3d9';
  r(2, 2, 9, 10, WH); r(4, 3, 5, 5, BL); r(5, 4, 3, 3, '#ffffff'); r(6, 5, 1, 1, BL);
  r(0, 10, 32, 17, WH); h(10, 0, 31, '#d8dde2'); r(0, 14, 32, 2, BL); h(16, 0, 31, CY);
  for (let x = 2; x < 13; x += 4) r(x, 19, 3, 3, '#6f8fa8');
  r(14, 18, 12, 9, '#2b3440'); h(17, 13, 26, '#333'); for (const x of [17, 22]) r(x, 18, 1, 9, '#5a6470');
  r(27, 6, 1, 12, '#888'); r(28, 6, 3, 2, BL);
  r(0, 26, 12, 2, '#d23a2e'); r(0, 25, 12, 1, '#4f9a3a');
}, true);
// 高浜市やきものの里 かわら美術館：段々の茶色い建物と、入口の鬼瓦
spotSprites.kawaraMuseum = shopCanvas((r, h) => {
  const BN = '#8a7a6c', BD = '#6e5f52', TL = '#a0604a', TP = '#b58a7a';
  r(1, 12, 30, 16, BN); r(8, 7, 23, 6, BN); r(16, 3, 15, 5, BN);
  for (const [x0, y] of [[1, 12], [8, 7], [16, 3]]) for (let x = x0; x < 31; x += 4) spanRows(h, y - 2, [[x + 1, x + 2], [x, x + 3]], TP);
  for (const y of [9, 15, 19]) h(y, 1, 30, TL); h(5, 16, 30, TL);
  for (let x = 20; x < 31; x += 3) r(x, 13, 1, 6, BD);
  r(5, 21, 12, 7, '#3a3a40'); h(20, 4, 17, BD);
  for (const x of [1, 18]) { r(x, 22, 4, 5, '#7a7a78'); r(x + 1, 21, 2, 1, '#7a7a78'); r(x + 1, 23, 1, 1, '#2a2a2a'); r(x + 2, 23, 1, 1, '#2a2a2a'); r(x, 27, 4, 1, '#5a5a58'); }   // 鬼瓦
}, true);
// 3回目に足した名所（同じく Wikimedia Commons の写真を参考に。docs/landmark-photos.md）
const PINE = ['.#####.', '#######', '.#####.'];
// 実相寺 釈迦堂：こけらぶきの寄棟の大屋根と、黒っぽい板の壁。まわりの松
spotSprites.jissoji = shopCanvas((r, h) => {
  const RB = '#7a6a58', RH = '#958470';
  for (const [x, y] of [[0, 0], [24, 1], [2, 4]]) { pix(r, PINE, x, y, '#2f6a3a'); h(y, x + 2, x + 4, '#4f8a4a'); }
  spanRows(h, 5, [[12, 19], [10, 21], [8, 23], [6, 25], [4, 27], [2, 29], [1, 30]], i => i % 3 === 1 ? RH : RB); h(12, 0, 31, '#4a3e30');
  r(5, 13, 22, 11, '#4a3626'); for (const x of [5, 10, 21, 26]) r(x, 13, 1, 11, '#6a4e36');
  r(12, 15, 8, 9, '#2e2218'); for (let x = 13; x < 20; x += 2) r(x, 15, 1, 9, '#5a4430');
  h(24, 3, 28, '#8a7a68'); for (let x = 1; x < 31; x += 3) r(x, 25, 1, 3, '#6a5040'); h(26, 0, 31, '#6a5040');
  h(29, 2, 29, '#a9a49a'); h(30, 1, 30, '#c2bdb1');
}, true);
// 久麻久神社：石段の上の拝殿（瓦屋根と木の社殿）
spotSprites.kumakuJinja = shopCanvas((r, h) => {
  spanRows(h, 3, [[10, 21], [8, 23], [6, 25], [4, 27], [3, 28]], i => i % 2 ? ROOF : ROOF_HI); h(8, 2, 29, '#2e3238');
  r(5, 9, 22, 8, '#8a6a4a'); r(12, 10, 8, 7, '#3a2a20'); for (const x of [5, 11, 20, 26]) r(x, 9, 1, 8, '#6a4a30'); r(15, 9, 2, 1, '#e2b13a');
  h(17, 2, 29, '#c8c3b8'); for (let x = 3; x < 30; x += 2) r(x, 15, 1, 2, '#9a7650');
  spanRows(h, 18, [[11, 20], [11, 20], [10, 21], [10, 21], [9, 22], [9, 22], [8, 23], [8, 23], [7, 24], [7, 24], [6, 25], [6, 25], [5, 26], [5, 26]], i => i % 2 ? '#8a857a' : '#b8b2a6');
  for (const [x, y] of [[9, 18], [22, 18]]) r(x, y, 1, 14, '#c8c3b8');
}, true);
// 長圓寺：苔むした広い石段の上の山門と、白い土塀
spotSprites.choenji = shopCanvas((r, h) => {
  for (const x of [0, 26]) { r(x, 2, 6, 12, '#2f6a3a'); r(x + 1, 3, 3, 2, '#4f8a4a'); }
  r(4, 9, 24, 5, '#f0ece2'); h(8, 3, 28, ROOF);
  spanRows(h, 3, [[12, 19], [10, 21], [9, 22], [8, 23]], i => i % 2 ? ROOF : ROOF_HI); h(7, 8, 23, '#2e3238');
  r(10, 8, 2, 6, WOOD); r(20, 8, 2, 6, WOOD); r(12, 9, 8, 5, '#2a2018');
  for (let y = 14; y < 32; y++) { const a = Math.max(0, 9 - (y - 14)), b = Math.min(31, 22 + (y - 14)); h(y, a, b, (y % 3) === 2 ? '#7a756b' : (y % 3) ? '#a9a49a' : '#6a8a4a'); }
}, true);
// 養寿寺：瓦屋根の本堂と、右の鐘つき堂
spotSprites.yojuji = shopCanvas((r, h) => {
  spanRows(h, 6, [[6, 15], [4, 17], [2, 19], [1, 20], [0, 21]], i => i % 2 ? ROOF : ROOF_HI); h(11, 0, 21, '#2e3238');
  r(2, 12, 18, 12, '#7a5a3c'); r(7, 14, 8, 10, '#3e3024'); for (const x of [2, 6, 15, 19]) r(x, 12, 1, 12, '#9a7650');
  spanRows(h, 4, [[24, 27], [22, 29], [21, 30]], i => i % 2 ? ROOF : ROOF_HI); spanRows(h, 2, [[25, 26]], '#b88a12');
  r(22, 7, 1, 17, WOOD); r(29, 7, 1, 17, WOOD); r(24, 9, 4, 5, '#4f7a5a'); h(14, 24, 27, '#3a5a44'); r(25, 8, 2, 1, '#333');
  h(24, 0, 31, '#a9a49a'); h(25, 0, 31, '#c2bdb1');
}, true);
// 紅樹院（茶祖の寺）：瓦の大屋根の本堂と、手前の茶の木
spotSprites.kojuin = shopCanvas((r, h) => {
  spanRows(h, 3, [[11, 20], [9, 22], [7, 24], [5, 26], [3, 28], [1, 30], [0, 31]], i => i % 2 ? ROOF : ROOF_HI); h(10, 0, 31, '#2e3238');
  r(4, 11, 24, 10, '#7a5a3c'); r(10, 13, 12, 8, '#3e3024'); for (const x of [4, 9, 22, 27]) r(x, 11, 1, 10, '#9a7650');
  h(21, 2, 29, '#a9a49a');
  for (const y of [23, 27]) { h(y, 1, 30, '#7fc65e'); r(0, y + 1, 32, 2, '#3f8f3a'); h(y + 3, 0, 31, '#2a5f28'); }
}, true);
// 一色学びの館：丸い筒形の塔と、列柱のある低い建物
spotSprites.isshikiManabi = shopCanvas((r, h) => {
  r(13, 2, 14, 19, '#b49a88'); r(13, 2, 3, 19, '#c8b2a0'); r(23, 2, 4, 19, '#9a806e'); h(2, 13, 26, '#d8c4b2'); h(3, 13, 26, '#8a705e');
  r(0, 17, 32, 9, '#d8cfc4'); h(17, 0, 31, '#e8e0d6'); h(18, 0, 31, '#b8afa4');
  for (let x = 1; x < 31; x += 4) { r(x, 19, 1, 7, '#e8e0d6'); r(x + 1, 19, 3, 6, '#5a5550'); }
  r(0, 26, 32, 4, '#8a8a88'); for (let x = 2; x < 32; x += 6) r(x, 27, 1, 3, '#f4f4f4');
}, true);
// 佐久島の港：「三河湾の黒真珠 佐久島」の白い看板と、黒い板の小屋、船着き場
spotSprites.sakushimaPort = shopCanvas((r, h) => {
  r(0, 22, 32, 10, '#4f8fbf'); for (const [x, y] of [[3, 25], [12, 28], [24, 26], [18, 30]]) h(y, x, x + 2, '#8cc0e0');
  r(0, 18, 20, 4, '#b8b2a6'); h(18, 0, 19, '#d0cbc0'); r(1, 22, 2, 3, '#8a857a'); r(16, 22, 2, 3, '#8a857a');
  r(20, 6, 11, 13, '#2a2522'); for (let x = 22; x < 31; x += 3) r(x, 6, 1, 13, '#3c3632'); spanRows(h, 4, [[21, 30], [20, 31]], '#3c4148'); r(23, 10, 4, 3, '#8a8a80');
  r(12, 1, 6, 17, '#f4f4f4'); r(13, 2, 4, 15, '#ffffff'); for (let y = 3; y < 16; y += 2) r(14, y, 2, 1, y < 9 ? '#2f5fae' : '#222'); r(14, 18, 2, 0, '#555');
  r(9, 20, 6, 2, '#e8e2d0');   // 舟
}, true);
// 大浦海水浴場（佐久島）：草地の中の、高い木の見はらし小屋
spotSprites.ouraBeach = shopCanvas((r, h) => {
  r(0, 18, 32, 14, '#6fae4a'); spanRows(h, 22, [[10, 14], [9, 15], [9, 16], [8, 16], [8, 17], [7, 17], [7, 18], [6, 18], [6, 19], [5, 19]], '#d9cfb3');
  spanRows(h, 2, [[16, 25], [14, 27], [13, 28]], '#4a3a2e'); r(15, 5, 1, 17, WOOD); r(26, 5, 1, 17, WOOD);
  r(14, 11, 14, 2, '#8a6a4a'); for (let x = 15; x < 27; x += 2) r(x, 8, 1, 3, '#8a6a4a'); h(8, 14, 27, '#8a6a4a');
  for (let i = 0; i < 9; i++) r(27 + Math.floor(i / 3), 13 + i, 2, 1, '#8a6a4a');
  r(0, 14, 9, 5, '#3f7a34'); r(1, 13, 6, 1, '#5a9a44');
}, true);
// 黄金堤（吉良）：木の並ぶ土手と、まわりの黄金色の田んぼ
spotSprites.koganeZutsumi = shopCanvas((r, h) => {
  for (let x = 1; x < 31; x += 7) { r(x, 4, 6, 6, '#3f8a34'); r(x + 1, 4, 3, 2, '#6fba50'); r(x + 2, 10, 2, 3, '#6a4a30'); }
  spanRows(h, 12, [[3, 28], [2, 29], [1, 30], [0, 31], [0, 31]], i => i ? '#6fae4a' : '#c8b88a');
  r(0, 17, 32, 15, '#e0b83a'); for (let y = 18; y < 32; y += 3) for (let x = (y % 2) * 2; x < 32; x += 4) r(x, y, 2, 1, '#c89a20');
  h(24, 0, 31, '#8a7a4a');
}, true);
// 尾﨑士郎記念館（吉良）：瓦屋根の白い建物と、前の胸像
spotSprites.ozakiShiro = shopCanvas((r, h) => {
  spanRows(h, 5, [[6, 25], [4, 27], [2, 29], [1, 30]], i => i % 2 ? ROOF : ROOF_HI); h(9, 0, 31, '#2e3238');
  r(2, 10, 28, 15, '#f4f2ec'); for (const x of [2, 12, 29]) r(x, 10, 1, 15, '#3a3a3a'); h(10, 2, 29, '#3a3a3a');
  r(5, 13, 5, 6, '#3a3a3a'); r(6, 14, 3, 4, '#c8d8e0'); r(15, 13, 11, 12, '#3a3a3a'); r(16, 14, 9, 11, '#5a6470');
  r(5, 22, 6, 7, '#9a968c'); r(6, 19, 4, 3, '#6a5a40'); r(7, 17, 2, 2, '#6a5a40');   // 胸像
  h(25, 0, 31, '#a9a49a');
}, true);
// 幡頭神社（吉良）：大きな石の鳥居と、奥の拝殿、社名の石柱
spotSprites.hazuJinja = shopCanvas((r, h) => {
  const ST = '#b8b2a6', SD = '#8a857a';
  spanRows(h, 7, [[11, 20], [10, 21], [9, 22]], ROOF); r(10, 10, 12, 6, '#8a6a4a'); r(13, 11, 6, 5, '#3a2a20');
  h(4, 2, 27, ST); h(5, 3, 26, SD); r(2, 3, 1, 1, ST); r(27, 3, 1, 1, ST); h(8, 5, 24, ST);
  r(6, 6, 2, 22, ST); r(21, 6, 2, 22, ST); r(14, 6, 2, 2, SD);
  spanRows(h, 16, [[13, 18], [12, 19], [12, 19], [11, 20], [11, 20], [10, 21], [10, 21], [9, 22], [9, 22], [8, 23], [8, 23], [7, 24], [7, 24], [6, 25], [6, 25], [5, 26]], i => i % 2 ? '#c8c3b8' : '#a9a49a');
  r(27, 6, 3, 24, '#9a968c'); for (let y = 8; y < 26; y += 3) r(28, y, 1, 2, '#3a3a3a');
}, true);
// 名鉄 西幡豆駅：木の小さな駅舎（クリーム色の壁、茶色のわく、青い駅名の看板）と赤いポスト
spotSprites.nishiHazu = shopCanvas((r, h) => {
  spanRows(h, 6, [[10, 21], [7, 24], [4, 27], [2, 29], [1, 30]], i => i % 2 ? '#6a5a4a' : '#7a6a5a');
  r(3, 11, 26, 15, '#efe6d2'); for (const x of [3, 11, 20, 28]) r(x, 11, 1, 15, '#7a4a2a'); h(11, 3, 28, '#7a4a2a'); h(18, 3, 28, '#7a4a2a');
  r(13, 12, 6, 3, '#3f7fbf'); r(14, 13, 4, 1, '#ffffff');
  r(5, 19, 5, 5, '#6f8fa8'); r(12, 19, 7, 7, '#3f5566'); r(22, 19, 5, 5, '#6f8fa8');
  r(29, 20, 2, 6, '#d23a2e'); h(26, 1, 30, '#9a9a96');
}, true);
// 名鉄 東幡豆駅：赤いトタン屋根の駅舎と、白い壁、駅名の看板、赤いポスト
spotSprites.higashiHazu = shopCanvas((r, h) => {
  spanRows(h, 7, [[6, 25], [4, 27], [2, 29], [1, 30], [0, 31]], i => i % 2 ? '#c0392b' : '#d8503f');
  for (let x = 2; x < 31; x += 2) r(x, 8, 1, 3, '#a83020');
  r(2, 12, 28, 14, '#f4f2ec'); h(12, 2, 29, '#c8c3b8');
  r(10, 13, 10, 3, '#ffffff'); h(15, 10, 19, '#3f9a5a'); r(11, 13, 7, 1, '#3f7fbf');
  r(4, 17, 5, 5, '#6f8fa8'); r(12, 17, 6, 9, '#3f5566'); r(21, 17, 5, 5, '#6f8fa8');
  r(27, 19, 2, 7, '#d23a2e'); h(26, 0, 31, '#9a9a96');
}, true);
// 鳥羽神明社：拝殿と、2月の「鳥羽の火祭り」で燃やす大きなたいまつ（すずみ）
spotSprites.tobaShinmei = shopCanvas((r, h) => {
  spanRows(h, 8, [[4, 17], [2, 19], [1, 20], [0, 21]], i => i % 2 ? ROOF : ROOF_HI); h(12, 0, 21, '#2e3238');
  r(1, 13, 20, 11, '#8a6a4a'); r(2, 14, 18, 4, '#f4f2ec'); for (const x of [5, 10, 15]) { r(x, 15, 2, 2, '#222'); } r(6, 18, 10, 6, '#3a2a20');
  h(24, 0, 21, '#a9a49a');
  r(23, 9, 6, 19, '#b8a060'); for (let y = 11; y < 27; y += 4) h(y, 23, 28, '#6a5a30'); r(25, 28, 2, 3, '#6a4a30');   // すずみ
  spanRows(h, 1, [[25, 26], [24, 27], [23, 28], [22, 29], [23, 28], [23, 28], [22, 29], [23, 28]], i => i < 2 ? '#ffe27a' : i < 5 ? '#ffb300' : '#e65100');
}, true);
// 旧糟谷邸（吉良）：黒い板壁に瓦屋根の古い家と、大きなイスノキ
spotSprites.kasuyaTei = shopCanvas((r, h) => {
  spanRows(h, 9, [[1, 16], [0, 17], [0, 18]], i => i % 2 ? ROOF : ROOF_HI); r(0, 12, 17, 15, '#2a2522'); for (let x = 2; x < 17; x += 3) r(x, 12, 1, 15, '#3c3632'); r(5, 19, 6, 8, '#5a4a3a');
  r(17, 1, 15, 12, '#3f7a34'); r(19, 2, 6, 3, '#5a9a44'); r(26, 6, 5, 3, '#5a9a44');
  r(22, 12, 4, 17, '#6a4a30'); r(21, 16, 2, 4, '#6a4a30'); r(25, 9, 2, 6, '#5a3e28'); r(23, 14, 1, 10, '#4a3420');
  h(29, 18, 31, '#8a7a5a'); h(27, 0, 17, '#a9a49a');
}, true);
// 八ツ面山：緑の山と、てっぺんの白い展望台
spotSprites.yatsuomote = shopCanvas((r, h) => {
  r(13, 2, 6, 3, '#e8e8e4'); h(5, 11, 20, '#c8c8c4'); r(14, 6, 4, 9, '#f4f4f0'); r(15, 7, 2, 2, '#6f8fa8'); r(15, 11, 2, 2, '#6f8fa8');
  spanRows(h, 13, [[10, 21], [8, 23], [6, 25], [4, 27], [3, 28], [2, 29], [1, 30], [0, 31], [0, 31], [0, 31], [0, 31], [0, 31], [0, 31], [0, 31], [0, 31], [0, 31], [0, 31], [0, 31], [0, 31]], i => i % 4 === 1 ? '#5a9a44' : '#3f7a34');
  for (const [x, y] of [[4, 20], [12, 18], [22, 21], [8, 26], [18, 25], [27, 27]]) { r(x, y, 3, 2, '#2f6a2a'); r(x, y, 2, 1, '#6fba50'); }
}, true);
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
  return s.featured ? 'town' : 'chest';
}

/* ---------- 画面 ---------- */
const view = $('pxView'), cv = $('pxCanvas'), ctx = cv.getContext('2d');
let active = false, raf = 0, dirty = true, scale = 2;
const floaters = [];   // 浮かぶ文字 { t, at }
// 下の案内パネルが地図に重なっている高さ（CSS px）。主人公は、パネルの上に見えている所のまん中に置く
let cover = 0, fieldCy = 0;
function updateCover() {
  const sh = $('sheet'), cr = cv.getBoundingClientRect(), sr = sh ? sh.getBoundingClientRect() : null;
  cover = sr && sr.height ? Math.max(0, Math.min(cr.height * 0.6, cr.bottom - sr.top)) : 0;
}
if (window.ResizeObserver && $('sheet')) new ResizeObserver(updateCover).observe($('sheet'));
window.addEventListener('resize', updateCover);
// 天気（weather.js：気象庁のアメダス・予報）：雨と雪は画面に降らせ、くもりは少し暗く
function drawWeather(now, w, h, dpr) {
  const wx = window.NISHIO_WEATHER && window.NISHIO_WEATHER.current;
  if (!wx) return;
  if (wx.kind === 'cloudy') { ctx.fillStyle = 'rgba(40,50,70,.12)'; ctx.fillRect(0, 0, w, h); return; }
  if (wx.kind !== 'rain' && wx.kind !== 'snow') return;
  ctx.fillStyle = 'rgba(30,40,60,.18)'; ctx.fillRect(0, 0, w, h);
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
function floatText(t) { floaters.push({ t, at: performance.now() }); if (floaters.length > 4) floaters.shift(); }
let cam = null, last = null, facing = 'down', lastT = 0, lastEnsure = 0;
try { scale = Math.min(4, Math.max(1, +localStorage.getItem('nsg_px_scale') || 2)); } catch (e) { /* 既定 */ }

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

function frame(now) {
  if (!active) return;
  raf = requestAnimationFrame(frame);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
  if (!w || !h) return;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; dirty = true; }
  shopHits = [];
  refreshSeason(now);
  if (worldMode) { drawWorld(now, w, h, dpr); return; }
  const T = Math.round(16 * scale * dpr);
  const dt = Math.min(0.1, (now - (lastT || now)) / 1000);
  lastT = now;

  // カメラ（＝主人公）を目標へなめらかに動かす。向きは移動方向から
  const tgt = targetTile();
  if (last && (Math.abs(tgt.x - last.x) > 0.05 || Math.abs(tgt.y - last.y) > 0.05)) {
    const dx = tgt.x - last.x, dy = tgt.y - last.y;
    facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }
  last = tgt;
  if (!cam || Math.hypot(tgt.x - cam.x, tgt.y - cam.y) > 40) cam = { ...tgt };
  else { const k = Math.min(1, dt * 6); cam.x += (tgt.x - cam.x) * k; cam.y += (tgt.y - cam.y) * k; }

  if (now - lastEnsure > 500) { lastEnsure = now; ensureVisible(w, h, T); snapDemoStart(); updateChests(); checkCar(); updateCover(); loadTowns(); updateHere(); }

  const f = Math.floor(now / 450) % 2;
  ctx.imageSmoothingEnabled = false;
  const vh = h - Math.round(cover * dpr), cy = Math.round(vh / 2);   // 見えている所の高さと、そのまん中
  fieldCy = cy;
  const ox = Math.round(w / 2 - cam.x * T), oy = Math.round(cy - cam.y * T);
  const tx0 = Math.floor(-ox / T), ty0 = Math.floor(-oy / T), tx1 = Math.ceil((w - ox) / T), ty1 = Math.ceil((h - oy) / T);
  for (let ty = ty0; ty < ty1; ty++) for (let tx = tx0; tx < tx1; tx++) {
    const raw = rawAt(tx, ty), code = raw & 31, sh = raw >> 5;
    const v = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
    const X = ox + tx * T, Y = oy + ty * T;
    ctx.drawImage(tiles[code][v % tiles[code].length][code === C.A || code === C.X ? f : 0], X, Y, T, T);
    if (sh !== 2) { ctx.fillStyle = SHADE[sh]; ctx.fillRect(X, Y, T, T); }
    if (code === C.H) {          // 大きな道（国道・県道）：外側に白線、2車線の真ん中に黄色の破線
      const u = Math.max(1, Math.round(T / 16)), road = c => c === C.H || c === C.R || c === C.D;
      const up = codeAt(tx, ty - 1), dn = codeAt(tx, ty + 1), lf = codeAt(tx - 1, ty), rt = codeAt(tx + 1, ty);
      ctx.fillStyle = '#f4f4f0';
      if (!road(up)) ctx.fillRect(X, Y + u, T, u);
      if (!road(dn)) ctx.fillRect(X, Y + T - 2 * u, T, u);
      if (!road(lf)) ctx.fillRect(X + u, Y, u, T);
      if (!road(rt)) ctx.fillRect(X + T - 2 * u, Y, u, T);
      // 黄色の線は、道の縁が同じ向きに3マス以上続くところだけ（2マス幅の道の端や、ななめの道の段差に横向きの線を引かない）
      ctx.fillStyle = '#f2c230';
      if (!road(up) && dn === C.H && hEdgeRun(tx, ty, 1, 0, road) >= 3) { ctx.fillRect(X + u * 2, Y + T - u, u * 4, u); ctx.fillRect(X + u * 10, Y + T - u, u * 4, u); }
      if (!road(lf) && rt === C.H && hEdgeRun(tx, ty, 0, 1, road) >= 3) { ctx.fillRect(X + T - u, Y + u * 2, u, u * 4); ctx.fillRect(X + T - u, Y + u * 10, u, u * 4); }
    }
    if (code === C.A) {          // 岸に白い波打ち際
      const u = Math.max(1, Math.round(T / 16)), land = c => c !== C.A && c !== C.X;
      ctx.fillStyle = f ? '#e8f2ff' : '#cfe2ff';
      if (land(codeAt(tx, ty - 1))) ctx.fillRect(X, Y, T, u);
      if (land(codeAt(tx, ty + 1))) ctx.fillRect(X, Y + T - u, T, u);
      if (land(codeAt(tx - 1, ty))) ctx.fillRect(X, Y, u, T);
      if (land(codeAt(tx + 1, ty))) ctx.fillRect(X + T - u, Y, u, T);
    }
  }

  // 主要な建物（同じ場所にスポットがあるときはスポットを優先）
  const spots = G.spots;
  const pois = visiblePois(tx0, ty0, tx1, ty1), labelBoxes = [];
  for (const p of pois) {
    const size = p[4] === 'lm' ? Math.round(T * 1.5) : T * 2, sx = Math.round(ox + p[0] * T - size / 2), sy = Math.round(oy + p[1] * T - size * 0.7);
    ctx.drawImage((spotSprites[p[2]] || spotSprites.shop)[0], sx, sy, size, size);
  }
  const me = G.me;
  let nearest = null, nearestD = Infinity;
  for (const s of spots) {
    const p = toTile(s.lat, s.lng);
    const size = s.shop ? Math.round(T * 3.5) : LANDMARK_ART[s.id] ? T * 3 : s.featured ? T * 2 : T;   // 当店と専用の絵がある名所は、本物の建物に合わせて大きめに
    const sx = ox + p.x * T - size / 2, sy = oy + p.y * T - size / 2;
    const cool = G.cooldownLeft(s) > 0;
    if (me && !cool) { const d = G.dist(me, s); if (d < nearestD) { nearest = s; nearestD = d; } }
    if (sx > w || sy > h || sx + size < 0 || sy + size < 0) continue;
    ctx.drawImage(spotSprites[spotArt(s)][cool ? 1 : 0], Math.round(sx), Math.round(sy), size, size);
    if (s.featured && !cool && f) {   // 注目スポットはきらきら
      ctx.fillStyle = '#fff59d';
      const u = size / 16;
      ctx.fillRect(Math.round(sx + 13 * u), Math.round(sy + 1 * u), Math.ceil(u), Math.ceil(u * 3));
      ctx.fillRect(Math.round(sx + 12 * u), Math.round(sy + 2 * u), Math.ceil(u * 3), Math.ceil(u));
    }
    if (s.shop) { const t = drawShopTag(sx + size / 2, sy, dpr, s); shopHits.push([Math.min(t[0], sx), t[1], Math.max(t[2], sx + size), sy + size, s]); }
  }
  // 西尾の人たち（まだ話していない人の上には吹き出し）
  for (const n of G.npcs || []) {
    const t = npcTile(n), sx = Math.round(ox + t.x * T), sy = Math.round(oy + t.y * T - T * 0.25);
    if (sx > w || sy > h || sx + T < 0 || sy + T < 0) continue;
    ctx.drawImage((npcSprites[n.look] || npcSprites.man)[f], sx, sy, T, T);
    if (!G.npcMet(n.id)) {   // 💬（白い吹き出し）
      const u = Math.max(1, Math.round(T / 16)), bx = sx + Math.round(T * 0.55), by = sy - Math.round(T * 0.45) - (f ? u : 0);
      ctx.fillStyle = '#000'; ctx.fillRect(bx - u, by - u, 9 * u, 6 * u);
      ctx.fillStyle = '#fff'; ctx.fillRect(bx, by, 7 * u, 4 * u); ctx.fillRect(bx + u, by + 4 * u, 2 * u, 2 * u);
      ctx.fillStyle = '#000'; ctx.fillRect(bx + u, by + 2 * u, u, u); ctx.fillRect(bx + 3 * u, by + 2 * u, u, u); ctx.fillRect(bx + 5 * u, by + 2 * u, u, u);
    }
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

  // 主人公（車に乗っているときは車）
  if (driving) ctx.drawImage(carSprites[facing], Math.round(w / 2 - T / 2), Math.round(cy - T / 2), T, T);
  else if (me || G.demo) ctx.drawImage(heroSprites[facing][f], Math.round(w / 2 - T / 2), Math.round(cy - T * 0.75), T, T);

  {   // 看板は人や建物の上に出す（主人公には重ねない）
    // 町名の札（青地に白い字。電柱の町名表示のように）・駅名標（白地に黒い字と青い線）・お店の看板（その店らしい色に白い字）
    // 重ならないように、町名 → 駅 → 大きなお店 → ほかのお店 の順に場所を取る
    const fs = Math.round(10 * dpr), pad = Math.round(3 * dpr), bw = Math.max(1, Math.round(dpr));
    labelBoxes.push([w / 2 - T, cy - T * 1.6, w / 2 + T, cy + T * 0.8]);   // 主人公のところ
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
    for (const x of towns) {
      if (x[0] < tx0 - 4 || x[0] > tx1 + 4 || x[1] < ty0 - 2 || x[1] > ty1 + 2) continue;
      board(Math.round(ox + x[0] * T), Math.round(oy + x[1] * T), short(x[2], 10), '#1b4fa0', '#fff');
    }
    for (const sp of spots) {
      if ((sp.kind || sp.cat) !== 'station') continue;
      const q = toTile(sp.lat, sp.lng);
      if (q.x < tx0 - 4 || q.x > tx1 + 4 || q.y < ty0 - 2 || q.y > ty1 + 2) continue;
      board(Math.round(ox + q.x * T), Math.round(oy + q.y * T + T * 0.7), short(sp.name.replace(/^名鉄\s*/, ''), 12), '#fff', '#111', '#1b4fa0');
    }
    for (const p of pois.filter(q => MAJOR_SIGN.has(q[2])).concat(pois.filter(q => !MAJOR_SIGN.has(q[2])))) {   // 大きなお店から場所を取る
      if (!p[3]) continue;
      board(Math.round(ox + p[0] * T), Math.round(oy + p[1] * T + T * 0.35), short(p[3], 12), signColor(p[2], p[3]), '#fff');
    }
  }

  drawWeather(now, w, h, dpr);

  // 町が変わったら、まん中に町名を大きく出す（いまいる町名は、左上の こよみ の札に出す）
  if (here.banner) {
    const age = (now - here.bannerAt) / 1000;
    if (age > 2.8) here.banner = '';
    else {
      ctx.globalAlpha = Math.min(1, age * 3, (2.8 - age) * 2);
      const bs = Math.round(18 * dpr), t = `〜 ${here.banner} 〜`;
      ctx.font = `${bs}px "DotGothic16", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(t).width, by = Math.round(Math.max(cy - T * 3, 48 * dpr + bs));   // 左上の こよみ の札より下に
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(Math.round(w / 2 - tw / 2 - 14 * dpr), by - bs, Math.round(tw + 28 * dpr), bs * 2);
      ctx.fillStyle = '#fff'; ctx.fillText(t, w / 2, by);
      ctx.globalAlpha = 1;
    }
  }

  // 主人公の頭の上に浮かぶ文字（ポイントなど）
  for (let i = floaters.length - 1; i >= 0; i--) {
    const fl = floaters[i], age = (now - fl.at) / 1000;
    if (age > 1.2) { floaters.splice(i, 1); continue; }
    ctx.globalAlpha = Math.min(1, (1.2 - age) * 2);
    ctx.font = `${Math.round(11 * dpr)}px "DotGothic16", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineWidth = Math.max(2, Math.round(2 * dpr)); ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.fillStyle = '#ffe27a';
    const fy = Math.round(cy - T * 0.85 - age * T * 0.8);
    ctx.strokeText(fl.t, w / 2, fy); ctx.fillText(fl.t, w / 2, fy);
    ctx.globalAlpha = 1;
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
  if (gt || (aim && !G.selected)) {   // 行き先はいつも指す（ほかのスポットの範囲にいても）
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
  const list = [];
  for (let cy = Math.floor((ty0 - 2) / CHUNK); cy <= Math.floor((ty1 + 2) / CHUNK); cy++)
    for (let cx = Math.floor((tx0 - 2) / CHUNK); cx <= Math.floor((tx1 + 2) / CHUNK); cx++) {
      const c = chunks.get(cx + '_' + cy);
      for (const p of (c && c.pois) || []) {
        if (p[0] < tx0 - 2 || p[0] > tx1 + 2 || p[1] < ty0 - 2 || p[1] > ty1 + 2) continue;
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
  return `<div class="popup area-card"><h4>${esc(a.icon || '')} ${esc(a.name)}${a.kana ? `<small>（${esc(a.kana)}）</small>` : ''}</h4>
    ${a.catch ? `<p class="catch">${esc(a.catch)}</p>` : ''}
    ${a.summary ? `<p>${esc(a.summary)}</p>` : ''}
    ${(a.specialties || []).length ? `<p><span class="tag">名物</span> ${a.specialties.map(esc).join('・')}</p>` : ''}
    ${facts.length ? `<p><span class="tag">データ</span> ${facts.join('／')}</p>` : ''}
    ${a.trivia ? `<p>💡 ${esc(a.trivia)}</p>` : ''}
    <p><span class="tag">めぐった名所</span> ${p.done}/${p.total}</p>
    <ul class="area-spots">${p.list.map(s => `<li>${G.state.visits[s.id] ? '✓' : '・'} ${esc(s.name)}</li>`).join('')}</ul>
    ${src.length ? `<p class="src">出典：${src.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">${i + 1}</a>`).join(' ')}</p>` : ''}</div>`;
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
  } else for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const inside = world && x >= 0 && y >= 0 && x < WW && y < WH;
    const code = inside ? world[y * WW + x] : C.X;   // 西尾市の範囲の外は霧（地図の端）
    const v = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    ctx.drawImage(tiles[code][v % tiles[code].length][code === C.A || code === C.X ? f : 0], ox + x * T, oy + y * T, T, T);
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
    ctx.drawImage(spotSprites[spotArt(s)][G.cooldownLeft(s) > 0 ? 1 : 0], Math.round(X), Math.round(Y), sz, sz);
    if (s.shop) shopTags.push([X + sz / 2, Y, sz, s]);
    if (G.state.visits[s.id]) {   // めぐった名所には金色のしるし
      const r = Math.max(3 * dpr, sz * 0.2), cx = Math.round(X + sz - r * 0.6), cy = Math.round(Y + r * 0.6);
      ctx.fillStyle = '#000'; ctx.fillRect(cx - r - dpr, cy - r - dpr, r * 2 + 2 * dpr, r * 2 + 2 * dpr);
      ctx.fillStyle = '#ffd54f'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.fillStyle = '#000'; ctx.font = `${Math.round(r * 1.8)}px "DotGothic16", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✓', cx, cy + dpr * 0.5);
    }
  }
  drawWorldLabels(ox, oy, T, w, h, dpr, css);
  for (const [x, y, sz, s] of shopTags) {   // 当店の札（店名）は地名より上に。札も絵もタップできる
    const t = drawShopTag(x, y, dpr, s);
    shopHits.push([Math.min(t[0], x - sz / 2), t[1], Math.max(t[2], x + sz / 2), y + sz, s]);
  }
  // 主人公
  const me = G.me;
  if (me) {
    const p = llToW(me.lat, me.lng), hs = Math.max(T * 2, 18 * dpr);
    ctx.drawImage(heroSprites.down[f], Math.round(ox + p.x * T - hs / 2), Math.round(oy + p.y * T - hs * 0.8), hs, hs);
  }
  const msg = worldState === 'building' || worldState === 'none' ? 'せかいちずを つくっています…\n（はじめの1回だけ 少し時間がかかります）'
    : worldState === 'fail' ? 'せかいちずを つくれなかった。\nしばらくして もういちど ためしてね。' : '';
  $('pxMsg').hidden = !msg;
  if (msg) $('pxMsg').textContent = msg;
}
// 当店の札：お店の本物の看板と同じ色で店名を出す（らいすぴあ・秀幸＝白地に赤い字、近藤米穀店＝クリーム地に黒い字）。
// (cx, bottom) は札の下のまん中。札の外わく [左, 上, 右, 下] を返す
let shopHits = [];   // 当店の札と絵のタップ範囲 [左, 上, 右, 下, スポット]（描くたびに作り直す）
const SHOP_SIGN = { 'f-ricepia': ['らいすぴあ・秀幸', '#ffffff', '#d7262e'], 'f-kondo-beikoku': ['近藤米穀店', '#f3ead0', '#111111'] };
function drawShopTag(cx, bottom, dpr, s) {
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
    const label = `${a.name} ${pr.done}/${pr.total}`, fs = Math.round(13 * dpr);
    ctx.font = `${fs}px "DotGothic16", monospace`;
    const bw = ctx.measureText(label).width + 16 * dpr, bh = fs + 12 * dpr;
    const box = [X - bw / 2, Y - bh / 2, X + bw / 2, Y + bh / 2];
    if (box[2] < 0 || box[0] > w || box[3] < 0 || box[1] > h) continue;
    if (boxes.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    boxes.push(box); areaBoxes.push([box, a]);
    ctx.fillStyle = 'rgba(0,0,0,.8)'; ctx.fillRect(box[0], box[1], bw, bh);
    ctx.strokeStyle = pr.total && pr.done === pr.total ? '#ffd54f' : '#fff'; ctx.lineWidth = Math.max(2, Math.round(2 * dpr));
    ctx.strokeRect(box[0] + dpr, box[1] + dpr, bw - 2 * dpr, bh - 2 * dpr);
    ctx.fillStyle = '#fff'; ctx.fillText(label, X, Y);
  }
  const spotNames = css >= 10 ? G.spots.filter(worldSpotShown).map(s => { const p = llToW(s.lat, s.lng); return [p.x, p.y, s.name.replace(/（.*?）/g, ''), 0]; }) : [];
  const isStation = l => l[3] === 1 && (l[4] || 'st') === 'st';
  // 町名は名所の名前より後（重なったら名所を優先）。寄ったときだけ
  const towns = css >= 10 ? base.filter(l => l[4] === 'tw') : [];
  const list = base.filter(l => l[4] !== 'tw').concat(SEA_LABELS.map(([n, la, lo, r]) => { const p = llToW(la, lo); return [p.x, p.y, n, r]; }))
    .filter(l => l[3] >= minRank)
    // 同じ駅が名所（名鉄 西尾駅など）になっている所は、名所の名前だけ出す（近くの別の名所では消さない）
    .filter(l => !isStation(l) || !spotNames.some(n => n[2].endsWith('駅') && n[2].includes(l[2].replace(/駅$/, '')) && Math.hypot(n[0] - l[0], n[1] - l[1]) < 3))
    .sort((a, b) => b[3] - a[3]).concat(spotNames, towns);
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
  const corner = worldProgress || (featured.length ? `めぐった名所 ${featured.filter(s => G.state.visits[s.id]).length}/${featured.length}` : '');
  if (corner) {
    const fs = Math.round(12 * dpr);
    ctx.font = `${fs}px "DotGothic16", monospace`; ctx.textAlign = 'left';
    const tw = ctx.measureText(corner).width;
    const y0 = 44 * dpr;   // 上には こよみ の札がある
    ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(8 * dpr, y0, tw + 16 * dpr, fs + 12 * dpr);
    ctx.fillStyle = '#fff'; ctx.fillText(corner, 16 * dpr, y0 + (fs + 12 * dpr) / 2);
  }
}
function setWorld(on) {
  worldMode = on;
  document.body.classList.toggle('pxw', on);
  $('pxWorld').textContent = on ? '👣' : '🌏';
  $('pxWorld').title = on ? '歩く地図にもどる' : '西尾市ぜんたいの地図';
  $('pxInfo').hidden = true;
  if (on) { wcam = worldCamStart(); buildWorld(); }
  try { localStorage.setItem('nsg_world_on', on ? '1' : '0'); } catch (e) { /* noop */ }
  updatePad();
}
$('pxWorld').addEventListener('click', () => setWorld(!worldMode));
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
  $('viewBtn').textContent = on ? '🗺️' : '👾';
  $('viewBtn').title = on ? 'ふつうの地図にする' : 'ドット絵の地図にする';
  updatePad();
  cancelAnimationFrame(raf);
  if (on) { lastT = 0; raf = requestAnimationFrame(frame); }
  else G.invalidateMap();
}
function updatePad() {
  // 操作して移動なら、せかいちずでもスティックを出す（動かすと歩く地図にもどって歩く。はじめての人はせかいちずから始まるため）
  $('pxPad').hidden = !(active && G.demo);
  G.sound.scene(active && worldMode ? 'world' : 'field');   // せかいちずでは別の曲
}
$('viewBtn').addEventListener('click', () => setActive(!active));
// せかいちずをいちばん大きくしてさらに拡大すると歩く地図へ、歩く地図をいちばん小さくしてさらに縮小するとせかいちずへ
$('pxZoomIn').addEventListener('click', () => {
  if (!worldMode) return setScale(scale + 1);
  if (wscale < WSIZES.length - 1) wscale++; else { setScale(1); setWorld(false); }
});
$('pxZoomOut').addEventListener('click', () => {
  if (worldMode) { wscale = Math.max(0, wscale - 1); return; }
  if (scale > 1) setScale(scale - 1); else { wscale = WSIZES.length - 1; setWorld(true); }
});
function setScale(v) { scale = Math.min(4, Math.max(1, v)); try { localStorage.setItem('nsg_px_scale', scale); } catch (e) { /* noop */ } }

// デモ：スティックで1マスずつ歩く（水と建物には入れない）
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
function step(dir) {   // 1マス進めたら（人に話しかけたときも）true、通れなければ false
  if (!G.demo) return false;
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
  const escape = BLOCK.has(codeAt(cx0, cy0)) && codeAt(nx, ny) !== C.X && exitDist(nx, ny) < exitDist(cx0, cy0);
  if (BLOCK.has(codeAt(nx, ny)) && !escape) return false;
  const who = npcAt(nx, ny);
  if (who) { if ($('pxInfo').hidden) openNpc(who); return true; }   // 人にぶつかったら話しかける（ドラクエ風）
  const ll = toLatLng(nx + 0.5, ny + 0.5);
  G.moveTo(ll.lat, ll.lng, 'step');   // スティックの1歩
  return true;
}
// 車：スティックのとなりのボタンで乗り降り。道の上（またはとなり）で乗れて、道だけを倍の速さで走る。
// 乗っている間は、歩いた距離・チェックイン・たからばこ・話しかけはお休み（降りるとできる）
const CAR_OK = new Set([C.R, C.H]);
let driving = false;
function setDriving(on, msg) {
  driving = !!on;
  const b = $('pxCar');
  b.textContent = driving ? '🚶' : '🚗';
  b.setAttribute('aria-label', driving ? '車を降りる' : '車に乗る');
  b.title = driving ? '車を降りる' : '車に乗る（道の上で）';
  b.classList.toggle('on', driving);
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
$('pxCar').addEventListener('click', toggleCar);

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
let chests = [], chestKey = '', chestCells = new Map();
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
  if (key !== chestKey) { chestKey = key; chestCells = new Map(); }
  const t = targetTile(), ci = Math.floor(t.x / CHEST_CELL), cj = Math.floor(t.y / CHEST_CELL), list = [];
  for (let cy = Math.floor((cj - 1) * CHEST_CELL / CHUNK); cy <= Math.floor(((cj + 2) * CHEST_CELL - 1) / CHUNK); cy++)
    for (let cx = Math.floor((ci - 1) * CHEST_CELL / CHUNK); cx <= Math.floor(((ci + 2) * CHEST_CELL - 1) / CHUNK); cx++) ensureChunk(cx, cy);
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
    const k = i + ',' + j;
    if (!chestCells.has(k)) { const r = chestCell(i, j, date, !G.demo); if (r) chestCells.set(k, r); }
    if (chestCells.has(k)) list.push(...chestCells.get(k));
  }
  const changed = list.length !== chests.length || list.some((c, n) => c.id !== chests[n].id);
  chests = list;
  if (changed) G.refreshNearby();   // 「たからばこが近くにある」の案内とふつうの地図の印を新しく
}
setInterval(updateChests, 2000);

// スティック・矢印キー：せかいちずを見ているときは、歩く地図にもどってから歩く。通れなければ ぶるっ
function padStep(dir) {
  if (worldMode) setWorld(false);
  const ok = step(dir);
  if (!ok && navigator.vibrate) navigator.vibrate(20);
  return ok;
}
// スティック：さわったまま動かすと、倒した向きへ歩きつづける。
//   ・まん中の少しは遊び（動かない）。大きく倒すと速く歩く（車はもっと速い）
//   ・ななめに倒すと、2つの向きを交互に1マスずつ（片方が通れなければ、もう片方へ）
const stick = { id: null, x: 0, y: 0, dirs: [], turn: 0, timer: null, key: '' };
const STICK_DEAD = 0.28, STICK_FAST = 0.75, STICK_DIAG = Math.tan(Math.PI / 8);
function stickDirs(x, y) {   // x, y は -1〜1（半径で割った値）
  const ax = Math.abs(x), ay = Math.abs(y);
  if (Math.hypot(x, y) < STICK_DEAD) return [];
  const h = x < 0 ? 'left' : 'right', v = y < 0 ? 'up' : 'down';
  if (Math.min(ax, ay) > Math.max(ax, ay) * STICK_DIAG) return ay >= ax ? [v, h] : [h, v];
  return [ax > ay ? h : v];
}
function stickTick() {
  stick.timer = null;
  if (!stick.dirs.length) return;
  const n = stick.dirs.length, first = stick.dirs[stick.turn % n];
  if (!padStep(first) && n > 1) padStep(stick.dirs[(stick.turn + 1) % n]);
  stick.turn++;
  const fast = Math.hypot(stick.x, stick.y) >= STICK_FAST;
  stick.timer = setTimeout(stickTick, driving ? (fast ? 70 : 120) : (fast ? 130 : 230));
}
function stickMove(e) {
  const r = $('pxStick').getBoundingClientRect(), R = r.width / 2 - 8;
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const d = Math.hypot(dx, dy);
  if (d > R) { dx *= R / d; dy *= R / d; }
  stick.x = dx / R; stick.y = dy / R;
  $('pxKnob').style.transform = `translate(${dx}px,${dy}px)`;
  const dirs = stickDirs(stick.x, stick.y), key = dirs.join(',');
  for (const k of ['up', 'down', 'left', 'right']) $('pxStick').querySelector('.' + k[0]).classList.toggle('lit', dirs.includes(k));
  if (key === stick.key) return;
  if (dirs.length) autoPause();   // 自分で動かしたら、おまかせ歩きは少し休む
  stick.key = key; stick.dirs = dirs; stick.turn = 0;
  clearTimeout(stick.timer); stick.timer = null;
  if (dirs.length) stickTick();   // 向きが変わったらすぐ1歩
}
function stickEnd(e) {
  if (e && stick.id !== e.pointerId) return;
  stick.id = null; stick.dirs = []; stick.key = ''; stick.x = stick.y = 0;
  clearTimeout(stick.timer); stick.timer = null;
  $('pxStick').classList.remove('on');
  $('pxKnob').style.transform = '';
  $('pxStick').querySelectorAll('i').forEach(i => i.classList.remove('lit'));
}
$('pxStick').addEventListener('pointerdown', e => {
  e.preventDefault();
  stick.id = e.pointerId;
  try { $('pxStick').setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
  $('pxStick').classList.add('on');
  stickMove(e);
});
$('pxStick').addEventListener('pointermove', e => { if (stick.id === e.pointerId) stickMove(e); });
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => $('pxStick').addEventListener(ev, stickEnd));
window.addEventListener('blur', () => stickEnd());
document.addEventListener('keydown', e => {
  const k = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
  if (k && active && G.demo && !e.target.closest('input,textarea')) { e.preventDefault(); autoPause(); padStep(k); }
});

/* ---------- おまかせ歩き（操作して移動） ----------
   みちしるべの行き先まで、道を探して自動で歩く（ほぼ放っておいてもゲームが進む）。
   ・人が行き先なら、その人まで歩いて話しかけ、話を読み進める（その人の話で次のイベントが決まる）
   ・名所が行き先なら、着いたところでチェックインする（とちゅうの まだ行っていない所も）
   ・道（ふつうの道・大きな道・小道）を通りやすく、水・建物・山は通らない。まだ読み込んでいない所は通れるとみなし、近づいたら探し直す
   ・スティック・矢印キーをさわると8秒休む。🧭ボタンでオン・オフ（端末に覚える。はじめはオン）。車に乗っていたら降りて歩く */
let auto = (() => { try { return localStorage.getItem('nsg_auto') !== 'false'; } catch (e) { return true; } })();
const autoS = { path: [], goal: '', steps: 0, stuck: 0, pauseUntil: 0, read: 0, walked: 0 };
const AUTO_ROADS = new Set([C.R, C.H, C.D]);
function setAuto(on, quiet) {
  auto = !!on;
  try { localStorage.setItem('nsg_auto', String(auto)); } catch (e) { /* noop */ }
  const b = $('pxAuto');
  b.classList.toggle('on', auto); b.setAttribute('aria-pressed', String(auto));
  autoS.path = []; autoS.read = 0;
  if (!quiet) G.toast(auto ? '🧭 おまかせ歩き：オン（行き先へ自動で歩きます。スティックをさわると少し休みます）' : '🧭 おまかせ歩き：オフ');
}
function autoPause() { autoS.pauseUntil = Date.now() + 8000; autoS.path = []; }
// (sx,sy) から (gx,gy) のまわり goalR マスまでの道すじ（A*）。行けなければ、いちばん近づける所まで
function planPath(sx, sy, gx, gy, goalR, avoid) {
  const pad = 40, x0 = Math.min(sx, gx) - pad, y0 = Math.min(sy, gy) - pad, W = Math.abs(gx - sx) + pad * 2 + 1, H = Math.abs(gy - sy) + pad * 2 + 1;
  if (W * H > 700000) return [];
  const N = W * H, g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const hx = [], hf = [];   // 二分ヒープ（f の小さい順）
  const push = (i, f) => { hx.push(i); hf.push(f); let k = hx.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= hf[k]) break; [hx[p], hx[k]] = [hx[k], hx[p]]; [hf[p], hf[k]] = [hf[k], hf[p]]; k = p; } };
  const pop = () => { const top = hx[0], li = hx.pop(), lf = hf.pop(); if (hx.length) { hx[0] = li; hf[0] = lf; let k = 0; for (;;) { const a = 2 * k + 1, b = a + 1; let m = k; if (a < hx.length && hf[a] < hf[m]) m = a; if (b < hx.length && hf[b] < hf[m]) m = b; if (m === k) break; [hx[m], hx[k]] = [hx[k], hx[m]]; [hf[m], hf[k]] = [hf[k], hf[m]]; k = m; } } return top; };
  const h = (x, y) => (Math.abs(x - gx) + Math.abs(y - gy)) * 0.9;
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
      if (!isGoal && (c !== C.X && BLOCK.has(c) || avoid.has(nx + ',' + ny))) continue;
      const cost = c === C.X ? 4 : AUTO_ROADS.has(c) ? 1 : 1.6;
      if (g[i] + cost < g[j]) { g[j] = g[i] + cost; from[j] = i; push(j, g[j] + h(nx, ny)); }
    }
  }
  const out = [];
  for (let i = found >= 0 ? found : best; i !== start && i >= 0; i = from[i]) out.push([i % W + x0, (i / W | 0) + y0]);
  return out.reverse();
}
function autoRead() {   // 人の話のウィンドウ：読む時間をおいて「つぎへ」、最後まで読んだら閉じる（スポットやお店の説明は、自分で閉じるまで待つ）
  const body = $('pxInfoBody'), now = Date.now();
  if (!body.querySelector('.npc-next, .npc-end')) { autoS.read = 0; return; }
  if (!autoS.read) { autoS.read = now + Math.min(6000, 1800 + body.textContent.length * 40); return; }
  if (now < autoS.read) return;
  autoS.read = 0;
  const next = body.querySelector('.npc-next');
  if (next) next.click(); else $('pxInfo').hidden = true;
}
function autoTick() {
  setTimeout(autoTick, G.autoInterval ? G.autoInterval() : 230);   // おまかせ強化「はやあし」で速くなる
  if (!auto || !active || worldMode || !G.demo || !G.me || Date.now() < autoS.pauseUntil) return;   // せかいちずでは歩く地図の区画を読まないので休む
  if (!$('pxInfo').hidden) { autoRead(); return; }
  autoS.read = 0;
  if (driving) { setDriving(false, '🚶 おまかせ歩きなので、車を降りて歩きます'); return; }
  const g = G.guide;
  // 着いた名所（行き先か、まだ行っていない所）でチェックイン
  const sel = G.selected;
  if (sel && G.inReach(sel) && G.cooldownLeft(sel) <= 0 && (!G.state.visits[sel.id] || (g && g.id === sel.id))) { G.checkin(); autoS.pauseUntil = Date.now() + 2500; return; }
  if (!g) return;   // 行き先が決まるのを待つ（まわりのようすで決まる）
  const t = targetTile(), sx = Math.floor(t.x), sy = Math.floor(t.y);
  let gx, gy, goalR;
  if (g.kind === 'npc') {   // 人：その人のマスへ歩いていくと話しかける
    const nn = (G.npcs || []).find(x => x.id === g.id);
    if (!nn) return;
    const q = npcTile(nn); gx = q.x; gy = q.y; goalR = 0;
  } else {
    const q = toTile(g.lat, g.lng); gx = Math.floor(q.x); gy = Math.floor(q.y);
    goalR = Math.max(1, Math.floor(G.guideRadius(g) / TILE_M * 0.6));
  }
  const key = `${g.id}:${gx}:${gy}`;
  if (key !== autoS.goal || !autoS.path.length || autoS.steps >= 40) {
    // ほかの人のマスは通らない（ぶつかると話しかけてしまう）
    const avoid = new Set((G.npcs || []).filter(x => x.id !== g.id).map(x => { const q = npcTile(x); return q.x + ',' + q.y; }));
    autoS.goal = key; autoS.steps = 0; autoS.path = planPath(sx, sy, gx, gy, goalR, avoid);
    if (!autoS.path.length && Math.hypot(sx - gx, sy - gy) > goalR) {
      // 近づけない（まわりが通れない所ばかり）：しばらく待っても動けなければ、別の行き先にしてもらう
      if (++autoS.stuck > 25) { autoS.stuck = 0; G.setGuide(null); }
      return;
    }
  }
  const nx = autoS.path.shift();
  if (!nx) return;
  if (Math.abs(nx[0] - sx) + Math.abs(nx[1] - sy) !== 1) { autoS.path = []; return; }   // 道すじからずれた（タップで移動など）：探し直す
  const dir = nx[0] > sx ? 'right' : nx[0] < sx ? 'left' : nx[1] > sy ? 'down' : 'up';
  autoS.steps++;
  if (step(dir)) {
    autoS.stuck = 0;
    if (++autoS.walked % 150 === 0 && G.autoLearn) G.autoLearn();   // 歩いているだけで西尾のことが分かる
  } else autoS.path = [];   // 通れなかった（読み込んだら建物だった など）：探し直す
}
$('pxAuto').addEventListener('click', () => setAuto(!auto));
setAuto(auto, true);
setTimeout(autoTick, 1500);

// スポットをタップすると、ドラクエ風のウィンドウで説明
cv.addEventListener('click', e => {
  const r = cv.getBoundingClientRect(), dpr = cv.width / r.width;
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
  const T = Math.round(16 * scale * Math.min(window.devicePixelRatio || 1, 3));
  const c = camTile();
  const x = (e.clientX - r.left) * dpr, y = (e.clientY - r.top) * dpr;
  // 西尾の人（絵は半マス上に描いているので、その分を足して調べる）
  const ttx = Math.floor(c.x + (x - cv.width / 2) / T), tty = Math.floor(c.y + (y - fieldCy) / T + 0.25);
  const who = npcAt(ttx, tty) || npcAt(ttx, tty - 1);
  if (who) { openNpc(who); return; }
  let hit = null, best = Infinity;
  for (const s of G.spots) {
    const p = toTile(s.lat, s.lng);
    const sx = cv.width / 2 + (p.x - c.x) * T, sy = fieldCy + (p.y - c.y) * T;
    const half = (s.shop ? T * 1.25 : LANDMARK_ART[s.id] ? T * 1.5 : s.featured ? T : T / 2) + 4 * dpr, d = Math.hypot(x - sx, y - sy);   // 専用の絵の名所は 3T 四方に描くので、その半分
    if (Math.abs(x - sx) <= half && Math.abs(y - sy) <= half && d < best) { hit = s; best = d; }
  }
  if (hit) { $('pxInfoBody').innerHTML = G.popupHtml(hit); $('pxInfo').hidden = false; return; }
  let bp = null;
  best = T * 1.2;
  for (const p of poiCache.list) { const d = Math.hypot(x - (cv.width / 2 + (p[0] - c.x) * T), y - (fieldCy + (p[1] - c.y) * T - T * 0.2)); if (d < best) { bp = p; best = d; } }
  if (bp) { $('pxInfoBody').innerHTML = poiHtml(bp); $('pxInfo').hidden = false; }
});
$('pxInfo').addEventListener('click', e => { if (e.target === $('pxInfo') || e.target.closest('[data-close]') || e.target.closest('[data-move]')) $('pxInfo').hidden = true; });

G.onModeChange(updatePad);
G.onModeChange(() => { if (driving) setDriving(false); });
// はじめての人はドット絵（ダンジョン風）のせかいちずから
let initial = 'px', worldOn = '1';
try { initial = localStorage.getItem('nsg_view') || 'px'; worldOn = localStorage.getItem('nsg_world_on') ?? '1'; } catch (e) { /* noop */ }
if (initial === 'px') { setActive(true); if (worldOn === '1') setWorld(true); }

// テスト用
window.nishioPixel = { spotSprites, get towns() { return towns; }, get here() { return here; }, npcTile, rasterize, chunkQuery, chunkBox, chunkInPlay, luReady, luAt, unrle, overpass, toTile, toLatLng, codeAt, rawAt, C, CHUNK, chunks, setActive, centerOnMe, demFor, get worldMode() { return worldMode; }, merc, buildWorld, setWorld, llToW, WORLD_KEY, WW, WH, get world() { return world; }, get worldPois() { return worldPois; }, get worldLabels() { return worldLabels; }, get pois() { return poiCache.list; }, BUILDING_ART, get worldState() { return worldState; }, get areaBoxes() { return areaBoxes; }, get shopHits() { return shopHits; }, get chests() { return chests; }, get driving() { return driving; }, toggleCar, floatText, ensureAround(lat, lng) { const q = toTile(lat, lng); ensureChunk(Math.floor(q.x / CHUNK), Math.floor(q.y / CHUNK)); } };
})();
