


(() => {
'use strict';


const G = window.nishioGo;
if (!G) return;
const $ = id => document.getElementById(id);


const TILE_M = 8;
const SIMPLE = () => document.body.classList.contains('simple');
const BTN_ART = { globe: 'btn-globe', feet: 'stat-feet', car: 'btn-car', walker: 'btn-walker', compass: 'btn-compass', flag: 'stat-flag', book: 'stat-book', map: 'tab-map', pixmap: 'pixmap' };
const ICO = (n, emoji, alt) => (BTN_ART[n] ? `<img class="pi art" src="nishio-go/art/${BTN_ART[n]}.png" alt="${alt}" width="32" height="32"/>`
  : window.NSG_ICONS && NSG_ICONS.ART[n] ? NSG_ICONS.html(n, alt) : emoji);
const CHUNK = 128;
const ORG_LAT = 35.0, ORG_LNG = 136.9;
const M_LAT = 110950, M_LNG = 111320 * Math.cos(34.86 * Math.PI / 180);
const toTile = (lat, lng) => ({ x: (lng - ORG_LNG) * M_LNG / TILE_M, y: (ORG_LAT - lat) * M_LAT / TILE_M });
const toLatLng = (x, y) => ({ lat: ORG_LAT - y * TILE_M / M_LAT, lng: ORG_LNG + x * TILE_M / M_LNG });
const chunkBox = (cx, cy) => {
  const nw = toLatLng(cx * CHUNK, cy * CHUNK), se = toLatLng((cx + 1) * CHUNK, (cy + 1) * CHUNK);
  return { s: se.lat, w: nw.lng, n: nw.lat, e: se.lng };
};



const C = { G: 0, F: 1, T: 2, W: 3, P: 4, A: 5, S: 6, B: 7, R: 8, H: 9, L: 10, D: 11, X: 12, M: 13, K: 14, E: 15, V: 16, I: 17, J: 18, Y: 19, N: 20, U: 21, Q: 22 };
const UNSET = 255;


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




let LU = null;
const luReady = fetch('nishio-go/landuse.json').then(r => (r.ok ? r.json() : null)).then(j => {
  if (!j || !Array.isArray(j.rows) || j.rows.length !== j.h) return;
  const g = new Uint8Array(j.w * j.h);
  j.rows.forEach((row, y) => { let x = 0; for (const part of row.split(',')) { if (!part) continue; const c = part.charCodeAt(0), n = parseInt(part.slice(1), 36); g.fill(c, y * j.w + x, y * j.w + x + n); x += n; } });
  LU = { lat0: j.lat0, lng0: j.lng0, dLat: j.dLat, dLng: j.dLng, w: j.w, h: j.h, g };
}).catch(() => {  });
function luAt(lat, lng) {
  if (!LU) return '';
  const y = LU.h - 1 - Math.floor((lat - LU.lat0) / LU.dLat), x = Math.floor((lng - LU.lng0) / LU.dLng);
  return x < 0 || y < 0 || x >= LU.w || y >= LU.h ? '' : String.fromCharCode(LU.g[y * LU.w + x]);
}
const BLOCK = new Set([C.A, C.B, C.M, C.X]);
const HILL_M = 35, MOUNTAIN_M = 110;

function classify(t, closed) {
  if (t.building && closed) return { a: 1, c: t.building === 'greenhouse' ? C.N : C.B, p: 30 };
  if (t.natural === 'coastline') return { coast: 1 };
  if (t.highway) {
    const h = t.highway;
    if (/^(proposed|construction|platform|bus_stop|elevator|corridor)$/.test(h)) return null;
    if (t.area === 'yes' && closed) return { a: 1, c: C.T, p: 11 };
    if (/^(motorway|trunk|primary|secondary)/.test(h)) return { a: 0, c: C.H, w: 2, p: 46 };
    if (/^(tertiary|unclassified|residential|living_street|service|pedestrian|road)/.test(h)) return { a: 0, c: C.R, w: h.startsWith('tertiary') ? 2 : 1, p: 44 };
    return { a: 0, c: C.D, w: 1, p: 42 };
  }
  if (t.railway) return { a: 0, c: C.L, w: 1, p: 40 };
  if (t.waterway && t.waterway !== 'riverbank') return { a: 0, c: C.A, w: t.waterway === 'river' ? 3 : t.waterway === 'canal' ? 2 : 1, p: 22 };
  if (!closed) return null;
  if (t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.landuse === 'basin') return { a: 1, c: C.A, p: 20 };
  if (t.natural === 'beach' || t.natural === 'sand') return { a: 1, c: C.S, p: 19 };
  if (t.natural === 'wood' || t.landuse === 'forest' || t.natural === 'scrub') return { a: 1, c: C.W, p: 16 };
  if (t.natural === 'wetland') return { a: 1, c: /^(tidalflat|saltmarsh)$/.test(t.wetland || '') ? C.S : C.P, p: 19 };
  const lu = t.landuse || '';
  if (/^(aquaculture|salt_pond)$/.test(lu)) return { a: 1, c: C.A, p: 20 };
  if (/^(harbour|port)$/.test(lu)) return null;
  if (lu === 'religious') return { a: 1, c: C.J, p: 13 };
  if (lu === 'cemetery' || t.amenity === 'grave_yard') return { a: 1, c: C.Y, p: 14 };
  if (t.amenity === 'place_of_worship') return { a: 1, c: C.J, p: 13 };
  if (t.leisure || /^(grass|recreation_ground|village_green)$/.test(lu)) return { a: 1, c: C.P, p: 14 };
  if (lu === 'greenhouse_horticulture') return { a: 1, c: C.N, p: 12 };
  const tea = /tea/.test(`${t.crop || ''} ${t.trees || ''} ${t.produce || ''}`);
  if (tea && /^(farmland|orchard|plant_nursery)$/.test(lu)) return { a: 1, c: C.E, p: 12 };
  if (lu === 'paddy' || /rice/.test(t.crop || '')) return { a: 1, c: C.F, p: 12 };
  if (lu === 'farmland' && !t.crop) return { a: 1, c: C.U, p: 12 };
  if (/^(farmland|orchard|vineyard|plant_nursery|allotments)$/.test(lu)) return { a: 1, c: C.V, p: 12 };
  if (lu === 'meadow') return { a: 1, c: C.G, p: 12 };
  if (lu === 'industrial') return { a: 1, c: C.I, p: 10 };
  if (lu || t.amenity) return { a: 1, c: C.T, p: 10 };
  return null;
}


const POI_LABEL = { townhall: '🏛️ 市役所・支所', hospital: '🏥 病院', school: '🏫 学校', library: '📚 図書館', police: '👮 警察・交番',
  fire: '🚒 消防署', post: '〒 郵便局', shop: '🛒 お店', station: '🚉 駅',
  konbini: '🏪 コンビニ', super: '🛒 スーパー・ショッピングセンター', home: '🔨 ホームセンター・家具', drug: '💊 ドラッグストア・薬局', fuel: '⛽ ガソリンスタンド',
  bank: '🏦 銀行', food: '🍜 飲食店', cafe: '☕ カフェ・パン・お菓子', store: '🛍️ お店' };

let landmarks = [];

function afterLoad(fn) {
  const go = () => { if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: 3000 }); else setTimeout(fn, 1000); };
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
}
afterLoad(() => fetch('nishio-go/landmarks.json').then(r => (r.ok ? r.json() : null)).then(j => {
  if (!j || !Array.isArray(j.items)) return;
  landmarks = j.items.filter(m => POI_LABEL[m[2]]).map(([lat, lng, kind, name]) => { const q = toTile(lat, lng); return [+q.x.toFixed(2), +q.y.toFixed(2), kind, name, 'lm']; });
  poiCache.key = ''; dirty = true;
}).catch(() => {  }));

let towns = [], townsLoad = null, townsRetry = 0;
function loadTowns() {
  if (towns.length || townsLoad || Date.now() < townsRetry) return;
  const use = l => {
    towns = (l || []).filter(x => x[4] === 'tw' && x[2]).map(x => { const ll = wToLL(x[0], x[1]), q = toTile(ll.lat, ll.lng), c = (G.placeAt || G.cityAt)(ll.lat, ll.lng); return [q.x, q.y, String(x[2]), c ? c.name : '']; });
    dirty = true;
  };
  if (worldLabels.some(x => x[4] === 'tw')) { use(worldLabels); return; }
  townsRetry = Date.now() + 60000;
  townsLoad = worldJson().then(j => use(j && j.l)).catch(() => {}).finally(() => { townsLoad = null; });
}

const here = { town: '', city: '', banner: '', bannerAt: 0, at: 0 };
function toastFoot() {
  const el = document.getElementById('toast');
  if (!el || !el.classList.contains('show')) return 0;
  const r = el.getBoundingClientRect(), c = cv.getBoundingClientRect();
  if (!c.height || r.top > c.top + c.height / 2) return 0;
  return (r.bottom - c.top) * (cv.width / c.width);
}
function updateHere() {
  const t = targetTile(), me = G.me, c = me && (G.placeAt || G.cityAt)(me.lat, me.lng), city = c ? c.name : '';

  let best = null, bd = 150;
  for (const x of towns) { if (x[3] !== city) continue; const d = Math.hypot(x[0] - t.x, x[1] - t.y); if (d < bd) { bd = d; best = x; } }
  const town = best ? best[2] : '';
  if (town && here.town && town !== here.town) { here.banner = town; here.bannerAt = performance.now(); here.waited = 0; here.lastT = 0; if (G.onTownEnter) G.onTownEnter(town, city); }
  here.town = town;
  here.at = performance.now();
  here.city = city;
  if (G.setPlace) G.setPlace(city, town);
}

const SIGN_KIND = { konbini: '#2a7d4f', super: '#c0392b', home: '#8a5a2b', drug: '#2a6fb0', fuel: '#5a5a5a', bank: '#1d4f91', post: '#d7000f', food: '#a0522d', cafe: '#7b4b2a', store: '#555',
  townhall: '#2f4f4f', hospital: '#b03030', school: '#3b6e3b', library: '#6a4c93', police: '#1f3f7a', fire: '#c0392b', shop: '#c0392b', station: '#2f4f4f' };
const SIGN_BRAND = [[/ファミリーマート|ファミマ/, '#0b8f3c'], [/セブン/, '#ef6c1a'], [/ローソン/, '#1474c4'], [/ミニストップ/, '#0b3c8c'], [/デイリーヤマザキ|ヤマザキ/, '#d7000f'],
  [/アオキ/, '#d40f1e'], [/アピタ|ピアゴ/, '#e64a19'], [/カネスエ/, '#0068b7'], [/ヤマナカ|フランテ/, '#d6002a'], [/バロー/, '#d7000f'], [/フィール/, '#2e8b57'], [/イオン|マックスバリュ/, '#b0127a'],
  [/スギ薬局/, '#0067b0'], [/スギヤマ/, '#e0457b'], [/ゲンキー/, '#e0a800'], [/ウエルシア/, '#e4007f'], [/コメリ/, '#e05a00'], [/カインズ/, '#00843d'], [/エディオン/, '#e60012'],
  [/信用金庫|信金|銀行/, '#1d4f91'], [/郵便局/, '#d7000f'], [/マクドナルド/, '#d52b1e'], [/コメダ/, '#7a4a1f'], [/スターバックス/, '#00704a'], [/すき家/, '#d7000f'], [/吉野家/, '#f08300']];
const signColor = (kind, name) => { for (const [re, c] of SIGN_BRAND) if (re.test(name)) return c; return SIGN_KIND[kind] || '#555'; };
const MAJOR_SIGN = new Set(['super', 'konbini', 'home', 'drug', 'fuel', 'bank', 'townhall', 'hospital', 'station', 'post', 'shop']);
const WORLD_POI = new Set(['townhall', 'hospital', 'library', 'fire', 'shop']);
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

function dedupePois(list, near) {
  const out = [];
  for (const p of list) if (!out.some(q => q[2] === p[2] && q[3] === p[3] && Math.hypot(q[0] - p[0], q[1] - p[1]) < near)) out.push(p);
  return out;
}


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
    const nx = -dy / len, ny = dx / len;
    const n = Math.max(1, Math.ceil(len));
    for (let s = 0; s < n; s++) {
      const t = (s + 0.5) / n, px = x1 + dx * t, py = y1 + dy * t;
      for (const side of [1, -1]) {

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



const DB = CHUNK + 2, UNK = -32768;



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
      g[i] = !real && (front || h % 4) ? C.Q : C.T;
    } else if (u === 'h' || u === 'f' || u === 'g') g[i] = C.T;
    else if (u === 'l') g[i] = C.P;
    else if (u === 'j') g[i] = C.S;
    else g[i] = C.G;
  }
  g.lu = !!LU;
}


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
      if (m2 < SHED_M2 || (b.f === 3111 && m2 < HOUSE_M2)) continue;
      if (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) r.push(r[0]);
      ops.push({ k: { a: 1, c: m2 <= HOUSE_M2 && b.f !== 3103 ? C.Q : C.B, p: 30, rc: b.c | 0 }, pts: [r] });
    }
  }
  g.pois = dedupePois(pois, 4);
  const dh = (x, y) => dem[(y + 1) * DB + (x + 1)];
  ops.sort((a, b) => a.k.p - b.k.p);
  let seaDone = false;
  const sea = () => { if (!seaDone) { seaDone = true; if (coasts.length) seaFill(g, coasts); } };
  for (const o of ops) {
    if (o.k.p >= 18) sea();
    if (o.k.a) {

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


  if (!coasts.length && g.every(v => v === UNSET)) {
    let na = 0, known = 0;
    if (dem) for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) { const h = dh(x, y); if (Number.isNaN(h)) { na++; known++; } else if (h > UNK) known++; }
    const isSea = known > CHUNK * CHUNK / 2 ? na > known * 0.9 : toLatLng((cx + 0.5) * CHUNK, (cy + 0.5) * CHUNK).lat < 34.82;
    if (isSea) g.fill(C.A);
  }
  fillLanduse(g, cx, cy, real);
  if (real) {
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

    if (ok(h) && h >= HILL_M) {
      if (h >= MOUNTAIN_M && (c === C.G || c === C.W || c === C.P)) g[i] = C.M;
      else if (c === C.G || c === C.P) g[i] = C.K;
    }

    let sh = 2;
    const a = dh(x - 1, y - 1), b = dh(x + 1, y + 1);
    if (c !== C.A && ok(a) && ok(b)) {
      const sl = (b - a) / (2 * Math.SQRT2 * TILE_M);
      sh = sl > 0.12 ? 4 : sl > 0.04 ? 3 : sl < -0.12 ? 0 : sl < -0.04 ? 1 : 2;
    }
    g[i] |= sh << 5;
  }
  return g;
}




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


const DEM_Z = 14;
const demCache = new Map();
const merc = (lat, lng, z = DEM_Z) => { const n = 256 * 2 ** z, r = lat * Math.PI / 180; return { x: (lng + 180) / 360 * n, y: (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n }; };
function demTile(x, y, z = DEM_Z) {
  const k = z + '/' + x + '/' + y;
  if (!demCache.has(k)) {
    demCache.set(k, (async () => {
      const res = await fetch(`https://cyberjapandata.gsi.go.jp/xyz/dem_png/${z}/${x}/${y}.png`);
      if (res.status === 404) return 'sea';
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const x2 = c.getContext('2d', { willReadFrequently: true });
      x2.drawImage(bmp, 0, 0);
      const d = x2.getImageData(0, 0, 256, 256).data, h = new Float32Array(65536);
      for (let i = 0; i < 65536; i++) {
        const v = d[i * 4] * 65536 + d[i * 4 + 1] * 256 + d[i * 4 + 2];
        if (v === 8388608) { h[i] = NaN; continue; }
        const m = (v < 8388608 ? v : v - 16777216) * 0.01;
        h[i] = m < -100 || m > 1000 ? UNK : m;
      }
      return h;
    })().catch(e => { demCache.delete(k); throw e; }));
  }
  return demCache.get(k);
}

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


const demLive = new Map();
let demGen = 0, heightFn = null;
function demPx(X, Y) {
  const tx = Math.floor(X / 256), ty = Math.floor(Y / 256), k = tx * 65536 + ty;
  if (!demLive.has(k)) {
    demLive.set(k, null);
    demTile(tx, ty).then(t => { demLive.set(k, t); demGen++; dirty = true; }, () => setTimeout(() => demLive.delete(k), 30000));
  }
  const t = demLive.get(k);
  if (t == null) return null;
  if (t === 'sea') return 0;
  const v = t[(Y - ty * 256) * 256 + (X - tx * 256)];
  return Number.isNaN(v) ? 0 : v <= UNK ? null : v;
}
function heightAt(x, y) {
  if (heightFn) return heightFn(x, y);
  const ll = toLatLng(x, y), m = merc(ll.lat, ll.lng), px = m.x - 0.5, py = m.y - 0.5, X = Math.floor(px), Y = Math.floor(py), fx = px - X, fy = py - Y;
  const a = demPx(X, Y), b = demPx(X + 1, Y), c = demPx(X, Y + 1), d = demPx(X + 1, Y + 1);
  if (a === null || b === null || c === null || d === null) return null;
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}


const SLOPE_K = 45, SLOPE_MIN = 0.015, SLOPE_MAXA = 12;
function slopeAt(x, y) {
  const e = heightAt(x + 1, y), w = heightAt(x - 1, y), so = heightAt(x, y + 1), n = heightAt(x, y - 1);
  if (e === null || w === null || so === null || n === null) return { x: 0, y: 0, g: 0, known: false };
  const gx = (e - w) / (2 * TILE_M), gy = (so - n) / (2 * TILE_M), g = Math.hypot(gx, gy);
  if (g < SLOPE_MIN) return { x: 0, y: 0, g, known: true };
  const a = Math.min(SLOPE_MAXA, (g - SLOPE_MIN) * SLOPE_K);
  return { x: -gx / g * a, y: -gy / g * a, g, known: true };
}

const contourLvl = h => (h < 30 ? Math.floor(h / 2) : h < 150 ? 15 + Math.floor((h - 30) / 10) : 27 + Math.floor((h - 150) / 25));
const contourMajor = l => (l < 15 ? l % 5 === 0 : l < 27 ? (l - 15) % 5 === 2 : (l - 27) % 2 === 0);
const contour = { key: '', L: null };
const CONTOUR_COL = ['', 'rgba(92,52,18,.42)', 'rgba(92,52,18,.62)'];
function drawContours(tx0, ty0, tx1, ty1, ox, oy, T) {
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


const PX_KEY = 'nsg_px7_', PX_IDX = 'nsg_px7_idx', PX_DAYS = 30, PX_KEEP = 60;
const store = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {  } },
};
const enc = g => String.fromCharCode(...g.map(c => 48 + c));
const dec = s => Uint8Array.from(s, ch => ch.charCodeAt(0) - 48);
const encode = g => { let s = ''; for (let i = 0; i < g.length; i += 4096) s += enc(g.subarray(i, i + 4096)); return s; };

function saveChunk(k, g, days) {
  const idx = (store.get(PX_IDX) || []).filter(x => x !== k);
  idx.push(k);
  while (idx.length > PX_KEEP) store.del(PX_KEY + idx.shift());
  if (!store.set(PX_KEY + k, { t: Date.now(), d: encode(g), p: g.pois || [], days, lu: !!g.lu })) {

    while (idx.length > 1) { store.del(PX_KEY + idx.shift()); if (store.set(PX_KEY + k, { t: Date.now(), d: encode(g), p: g.pois || [], days, lu: !!g.lu })) break; }
  }
  store.set(PX_IDX, idx);
}

const chunks = new Map();
const queue = [];
let pumping = false;
const nb = G.CFG.nishioBounds;

function chunkState(cx, cy) { const c = chunks.get(cx + '_' + cy); return c ? c.state : 'none'; }
function rawAt(tx, ty) {
  const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
  const c = chunks.get(cx + '_' + cy);
  if (!c || !c.g) return C.X | (2 << 5);
  return c.g[(ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK)];
}
const codeAt = (tx, ty) => rawAt(tx, ty) & 31;


const nbrCache = new Map(), worldNbr = new Map();
let gridAt = codeAt, nbrCur = nbrCache;


function chunkInPlay(cx, cy) {
  const b = chunkBox(cx, cy);
  if (!(b.n < nb[0][0] - 0.01 || b.s > nb[1][0] + 0.01 || b.e < nb[0][1] - 0.01 || b.w > nb[1][1] + 0.01)) return true;

  const h = G.CFG.home, la = Math.min(Math.max(h.lat, b.s), b.n), lo = Math.min(Math.max(h.lng, b.w), b.e);
  if (Math.hypot((la - h.lat) * 111320, (lo - h.lng) * 111320 * Math.cos(h.lat * Math.PI / 180)) <= h.r + 300) return true;
  const pad = 0.003, s = b.s - pad, n = b.n + pad, w = b.w - pad, e = b.e + pad;
  for (const c of G.REGION) {
    if (n < c.bbox[0][0] || s > c.bbox[1][0] || e < c.bbox[0][1] || w > c.bbox[1][1]) continue;

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

  chunks.set(k, { state: 'queued' });
  queue.push([cx, cy]);
  bakedAhead();
  pump();
}

function chunkQuery(b) {
  const p = 0.0005, q = 0.03;
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



const unrle = s => {
  const g = new Uint8Array(CHUNK * CHUNK);
  let i = 0;
  for (const m of s.matchAll(/([\s\S])([0-9a-z]+)\./g)) { const n = parseInt(m[2], 36); if (i + n > g.length) return null; g.fill(m[1].charCodeAt(0) - 48, i, i + n); i += n; }
  return i === g.length ? g : null;
};





const BAKED_PAR = 8;
const BAKED_KEEP = 12;
const bakedPre = new Map(), bakedWait = [];
let bakedLive = 0;
function bakedNext() {
  const here = camTile(), d = e => Math.hypot(e.cx - here.x / CHUNK, e.cy - here.y / CHUNK);
  for (let i = bakedWait.length - 1; i >= 0; i--) if (bakedWait[i].on) bakedWait.splice(i, 1);
  bakedWait.sort((a, b) => d(a) - d(b));
  while (bakedLive < BAKED_PAR && bakedWait.length) bakedWait.shift().go();
}
function bakedFetch(cx, cy, now) {
  const k = cx + '_' + cy;
  if (BAKE) return Promise.resolve(null);
  let e = bakedPre.get(k);
  if (!e) {
    e = { cx, cy, on: false };
    e.p = new Promise(res => {
      e.go = () => {
        if (e.on) return;
        e.on = true; bakedLive++;
        fetch(`nishio-go/chunks/${k}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null).then(j => { bakedLive--; res(j); bakedNext(); });
      };
    });
    bakedPre.set(k, e); bakedWait.push(e);
  }
  if (now) e.go(); else bakedNext();
  return e.p;
}
function bakedAhead() {
  if (BAKE || bakedPre.size >= BAKED_KEEP) return;
  const here = camTile(), d = q => Math.hypot(q[0] - here.x / CHUNK, q[1] - here.y / CHUNK);
  for (const q of queue.slice().sort((a, b) => d(a) - d(b))) {
    if (bakedPre.size >= BAKED_KEEP) break;
    if (!bakedPre.has(q[0] + '_' + q[1])) bakedFetch(q[0], q[1]);
  }
}
async function bakedChunk(cx, cy) {
  if (BAKE) return null;
  try {
    const j = await bakedFetch(cx, cy, true);
    bakedPre.delete(cx + '_' + cy);
    bakedAhead();
    const g = j && typeof j.d === 'string' ? unrle(j.d) : null;
    if (!g) return null;
    g.pois = Array.isArray(j.p) ? j.p : [];
    g.lu = (j.cv || 1) >= 2;
    if (typeof j.r === 'string') g.rf = unrle(j.r);
    return g;
  } catch (e) { return null; }
}

const PUMP_PAR = 3;
async function loadChunk(cx, cy) {
  const k = cx + '_' + cy;
  chunks.set(k, { state: 'loading' });
  try {

  const pre = await bakedChunk(cx, cy);
  if (pre) {

    chunks.set(k, { state: 'ok', g: pre.lu ? pre : townify(pre), pois: pre.pois }); nbrCache.clear();
    dirty = true;
    return;
  }

  const saved = store.get(PX_KEY + k);
  if (saved && saved.d && saved.d.length === CHUNK * CHUNK && Date.now() - saved.t < (saved.days || PX_DAYS) * 864e5) {
    chunks.set(k, { state: 'ok', g: saved.lu ? dec(saved.d) : townify(dec(saved.d)), pois: saved.p || [] }); nbrCache.clear();
    dirty = true;
    return;
  }

  try {

    const [json, dem] = await Promise.all([overpass(chunkQuery(chunkBox(cx, cy))), demFor(cx, cy).catch(() => null), luReady]);
    const g = rasterize(json.elements || [], cx, cy, dem && dem.h);
    saveChunk(k, g, dem && !dem.partial ? PX_DAYS : 1);
    chunks.set(k, { state: 'ok', g: BAKE || g.lu ? g : townify(g), pois: g.pois || [] }); nbrCache.clear();
  } catch (e) {
    chunks.set(k, { state: 'fail', t: Date.now() });
  }
  } catch (e) {
    chunks.set(k, { state: 'fail', t: Date.now() });
  }
  dirty = true;
}





let pumpLive = 0;
async function pump() {
  if (pumping) { while (pumpLive < PUMP_PAR && queue.length) pumpWorker(); return; }
  pumping = true;
  try {
    await Promise.all(Array.from({ length: PUMP_PAR }, pumpWorker));
  } finally { pumping = false; }
  if (queue.length) pump();
}

async function pumpWorker() {
  if (pumpLive >= PUMP_PAR) return;
  pumpLive++;
  try {
    while (queue.length) {

      const here = camTile();
      queue.sort((a, b) => Math.hypot(a[0] - here.x / CHUNK, a[1] - here.y / CHUNK) - Math.hypot(b[0] - here.x / CHUNK, b[1] - here.y / CHUNK));
      const [cx, cy] = queue.shift();
      await loadChunk(cx, cy);
    }
  } finally { pumpLive--; }
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

      if (json.remark && /error|runtime/i.test(json.remark)) throw new Error(json.remark);
      return json;
    } catch (e) { last = e; } finally { clearTimeout(timer); }
  }
  throw last || new Error('取得失敗');
}





const BAKE = !!window.NSG_BAKE;
const WB = { s: 34.68, w: 136.86, n: 35.05, e: 137.43 }, WT = 100;
const WW = Math.ceil((WB.e - WB.w) * M_LNG / WT), WH = Math.ceil((WB.n - WB.s) * M_LAT / WT);
const llToW = (lat, lng) => ({ x: (lng - WB.w) * M_LNG / WT, y: (WB.n - lat) * M_LAT / WT });





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

  const idx = store.get(PX_IDX) || [];
  while (idx.length) {
    store.del(PX_KEY + idx.shift());
    if (store.set(TRAIL.key, out)) { store.set(PX_IDX, idx); TRAIL.dirty = 0; return; }
  }
  store.set(PX_IDX, idx);
  if (!TRAIL.warned) { TRAIL.warned = true; G.toast('このブラウザに あしあとを 保存できませんでした。スマホの 空きや、ブラウザの 設定（プライベート モード など）を 見てみてね。'); }
}

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
function trailSet(tx, ty) {
  const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK), k = cx + '_' + cy;
  let a = TRAIL.map.get(k);
  if (!a) { a = new Uint8Array(TRAIL_BYTES); TRAIL.map.set(k, a); }
  const n = (ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK);
  if (a[n >> 3] & (1 << (n & 7))) return false;
  a[n >> 3] |= 1 << (n & 7);
  trailWorldAdd(tx, ty);
  return true;
}


function trailWalk(lat1, lng1, lat2, lng2, each) {
  trailLoad();
  const a = toTile(lat1, lng1), b = toTile(lat2, lng2);
  let x = Math.floor(a.x), y = Math.floor(a.y);
  const x2 = Math.floor(b.x), y2 = Math.floor(b.y), dx = Math.abs(x2 - x), dy = -Math.abs(y2 - y), sx = x < x2 ? 1 : -1, sy = y < y2 ? 1 : -1;
  if (Math.hypot(dx, dy) > 80) return 0;
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

const TRAIL_DARK = new Set([C.H, C.A, C.W, C.M, C.L, C.B]);
function drawFoot(code, tx, ty, X, Y, T) {
  const u = T / 16, h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0, ox = (h % 5) - 2, oy = ((h >>> 3) % 5) - 2, flip = (h >>> 6) & 1;
  ctx.fillStyle = TRAIL_DARK.has(code) ? 'rgba(255,248,230,.55)' : 'rgba(70,45,25,.5)';
  for (const [fx, fy] of flip ? [[5, 4], [9, 8]] : [[9, 4], [5, 8]]) {
    ctx.fillRect(X + Math.round((fx + ox) * u), Y + Math.round((fy + oy) * u), Math.ceil(2 * u), Math.ceil(3 * u));
    ctx.fillRect(X + Math.round((fx + ox) * u), Y + Math.round((fy + oy - 1.5) * u), Math.ceil(2 * u), Math.ceil(u));
  }
}
const wToLL = (x, y) => ({ lat: WB.n - y * WT / M_LAT, lng: WB.w + x * WT / M_LNG });

const WORLD_KEY = 'nsg_world8', WORLD_FILE = 'nishio-go/world.json';


let worldJsonP = null;
function worldJson() {
  if (!worldJsonP) worldJsonP = fetch(WORLD_FILE, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null).finally(() => { worldJsonP = null; });
  return worldJsonP;
}
for (let i = 1; i <= 7; i++) store.del('nsg_world' + i);
let world = null, worldPois = [], worldLabels = [], worldImg = null, worldState = 'none';


const UNREAD_BG = '#c9d6c0';
const UNREAD_DOT = '#aebfa5';


const WCOL = { [C.G]: '#3f9b3c', [C.F]: PADDY_COL, [C.T]: '#d8ccaa', [C.W]: '#1f6528', [C.P]: '#55b650', [C.A]: '#2a62c9', [C.S]: '#e7cf8c',
  [C.B]: '#b4472f', [C.R]: '#f1e6c4', [C.H]: '#f6c34a', [C.L]: '#4a3a2a', [C.D]: '#c9a66b', [C.X]: UNREAD_BG, [C.M]: '#8d6e4f', [C.K]: '#6cc35a',
  [C.E]: '#2f7a34', [C.V]: '#9a6b3f', [C.I]: '#a3a8ab', [C.J]: '#e4dfd2', [C.Y]: '#4a9a46', [C.N]: '#dfe9ee', [C.U]: PADDY_COL, [C.Q]: '#c9a27a' };
function makeWorldImg() {
  worldNbr.clear();
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


const RANK = { city: 4, town: 3, island: 3, village: 2, suburb: 2, quarter: 1, neighbourhood: 1, hamlet: 1 };
const TOWN_PLACE = new Set(['quarter', 'neighbourhood', 'hamlet']);
function parseWorldNames(elements) {
  const wp = [], wl = [];
  for (const el of elements) {
    const tg = el.tags || {}, kind = poiKind(tg), c = elCenter(el), q = c && llToW(c.lat, c.lon);
    if (!q || q.x < 0 || q.y < 0 || q.x >= WW || q.y >= WH) continue;
    if (kind && WORLD_POI.has(kind)) wp.push([+q.x.toFixed(2), +q.y.toFixed(2), kind, String(tg.name || '').slice(0, 40)]);
    else if ((RANK[tg.place] || (tg.railway === 'station' && tg.station !== 'miniature')) && tg.name) {
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
    }
    else if (t.railway) L.lines.push([pts, C.L, 40]);
    else if (t.highway) L.lines.push(/^(motorway|trunk|primary)/.test(t.highway) ? [pts, C.H, 42] : [pts, C.R, 41]);
    else {
      const k = classify(t, true);
      if (k && k.a && k.c !== C.B) L.areas.push([pts, k.c, k.p]);
    }
  }
}


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

function combineWorld(base, L) {
  const g = base.slice(), ag = new Uint8Array(g.length).fill(UNSET);
  L.areas.slice().sort((a, b) => a[2] - b[2]).forEach(([pts, code]) => fillPoly(ag, pts, code, WW, WH));
  for (let i = 0; i < g.length; i++) {
    const c = g[i], a = ag[i];
    if (a === UNSET || c === C.M) continue;
    g[i] = a;
  }

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
  if (BAKE) await luReady;
  worldState = 'building';


  if (!BAKE) {
    try {
      const b = await worldJson();
      if (b && b.w === WW && b.h === WH && typeof b.d === 'string' && b.d.length === WW * WH) {
        world = dec(b.d); worldPois = b.p || []; worldLabels = b.l || []; makeWorldImg(); worldState = 'ok';

        const days = worldLabels.some(l => l[4]) ? 7 : 1;
        if (!store.set(WORLD_KEY, { t: Date.now(), w: WW, h: WH, d: b.d, p: worldPois, l: worldLabels, days })) store.del(WORLD_KEY);
        return;
      }
    } catch (e) {  }
  }

  const saved = !force && store.get(WORLD_KEY);
  if (saved && saved.w === WW && saved.h === WH && saved.d && saved.d.length === WW * WH && Date.now() - saved.t < (saved.days || PX_DAYS) * 864e5) {
    world = dec(saved.d); worldPois = saved.p || []; worldLabels = saved.l || []; makeWorldImg(); worldState = 'ok'; return;
  }
  try {
    const N = WW * WH, base = new Uint8Array(N).fill(UNSET);

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

      if (na >= 3) base[i] = C.A;
      else if (n) { const h = sum / n; base[i] = h >= MOUNTAIN_M ? C.M : h >= HILL_M ? C.K : UNSET; }
    }
    const L = { areas: [], lines: [] };
    world = combineWorld(base, L); makeWorldImg();
    worldState = 'enriching';

    let namesOk = true;
    for (let tries = BAKE ? 5 : 1, k = 1; k <= tries; k++) {
      try { [worldPois, worldLabels] = parseWorldNames((await overpass(worldNamesQuery())).elements || []); namesOk = true; break; } catch (e) {
        namesOk = false;
        if (BAKE) console.log(`[bake] names try ${k} failed: ${e.message}`);
        if (k < tries) await new Promise(r => setTimeout(r, 30000 * k));
      }
    }

    const here = G.me ? llToW(G.me.lat, G.me.lng) : llToW(34.825, 137.07);
    const parts = [];
    for (let j = 0; j < WSPLIT; j++) for (let i = 0; i < WSPLIT; i++) parts.push([i, j]);
    parts.sort((a, b) => Math.hypot((a[0] + 0.5) * WW / WSPLIT - here.x, (a[1] + 0.5) * WH / WSPLIT - here.y) - Math.hypot((b[0] + 0.5) * WW / WSPLIT - here.x, (b[1] + 0.5) * WH / WSPLIT - here.y));
    let ok = 0, done = 0;
    for (const [i, j] of parts) {
      worldProgress = `ちずを くわしくしています… ${done}/${parts.length}`;
      const w = WB.w + (WB.e - WB.w) * i / WSPLIT, e = WB.w + (WB.e - WB.w) * (i + 1) / WSPLIT;
      const n = WB.n - (WB.n - WB.s) * j / WSPLIT, s = WB.n - (WB.n - WB.s) * (j + 1) / WSPLIT;

      for (let tries = BAKE ? 5 : 1, k = 1; k <= tries; k++) {
        const t0 = Date.now();
        try {
          const els = (await overpass(worldPartQuery(s, w, n, e))).elements || [];
          addWorldFeatures(els, L);
          ok++;
          world = combineWorld(base, L); makeWorldImg();
          if (BAKE) console.log(`[bake] part ${i},${j}: ${els.length} elements, ${Math.round((Date.now() - t0) / 1000)}s`);
          break;
        } catch (e2) {
          if (BAKE) console.log(`[bake] part ${i},${j} try ${k} failed after ${Math.round((Date.now() - t0) / 1000)}s: ${e2.message}`);
          if (k < tries) await new Promise(r => setTimeout(r, 30000 * k));
        }
      }
      done++;
    }
    worldProgress = '';
    worldLabels = worldLabels.concat(riverLabels(L));
    worldState = 'ok';
    const days = partial || !namesOk || ok < parts.length ? 1 : PX_DAYS;
    if (!store.set(WORLD_KEY, { t: Date.now(), w: WW, h: WH, d: encode(world), p: worldPois, l: worldLabels, days })) store.del(WORLD_KEY);
  } catch (e) {
    worldProgress = '';
    worldState = world ? 'ok' : 'fail';
  }
}


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

function paddyArt(px, r) {
  if (PADDY_TILE === 'gold') {
    px('#cfae4a', 0, 0, 16, 16);
    for (let y = 1; y < 16; y += 4) { px('#b08a2a', 0, y, 16, 2); for (let x = (r() * 3) | 0; x < 16; x += 3) px('#f2d36b', x, y - 1); }
  } else if (PADDY_TILE === 'flooded') {
    px('#8fbfd8', 0, 0, 16, 16);
    for (let i = 0; i < 3; i++) px('#cfe9f7', (r() * 13) | 0, (r() * 15) | 0, 3, 1);
    for (let y = 2; y < 16; y += 4) for (let x = 1 + ((y / 4) % 2); x < 16; x += 4) px('#4f9a35', x, y, 1, 2);
  } else if (PADDY_TILE === 'soil') {
    px('#8a6a44', 0, 0, 16, 16);
    for (let y = 2; y < 16; y += 4) px('#6e5233', 0, y, 16, 1);
    for (let i = 0; i < 6; i++) px('#a3815a', (r() * 15) | 0, (r() * 15) | 0, 2, 1);
  } else if (PADDY_TILE === 'stubble') {
    px('#a89a6a', 0, 0, 16, 16);
    for (let y = 2; y < 16; y += 4) for (let x = 1 + ((y / 4) % 2) * 2; x < 16; x += 4) { px('#7d6f48', x, y, 1, 2); px('#cdbf8e', x + 1, y); }
    for (let i = 0; i < 2; i++) px('#dccc96', (r() * 12) | 0, (r() * 15) | 0, 4, 1);
  } else {
    px('#86b54c', 0, 0, 16, 16);
    for (let y = 1; y < 16; y += 4) { px('#6a9a36', 0, y, 16, 2); for (let x = (r() * 3) | 0; x < 16; x += 4) px('#a3cc66', x, y - 1); }
  }
  px('#7a6a46', 0, 15, 16, 1);
}
const TILE_ART = {
  [C.G]: grassBase,
  [C.F]: (px, r) => { paddyArt(px, r); px('#6b5a3a', 15, 0, 1, 16); },
  [C.U]: (px, r) => paddyArt(px, r),
  [C.V]: (px, r) => {
    px('#9a6b3f', 0, 0, 16, 16);
    for (let y = 2; y < 16; y += 4) { px('#7a512c', 0, y + 1, 16, 1); for (let x = (r() * 3) | 0; x < 16; x += 3) px('#6ab04c', x, y, 1, 1); }
  },
  [C.E]: (px) => {
    px('#7a5a3a', 0, 0, 16, 16);
    for (const y of [1, 9]) { px('#2f7a34', 1, y, 14, 6); px('#2f7a34', 0, y + 1, 16, 4); px('#56a64a', 2, y, 12, 1); px('#1f5a25', 1, y + 5, 14, 1); px('#78c060', 4, y + 1, 2, 1); px('#78c060', 10, y + 1, 2, 1); }
  },
  [C.N]: (px) => {
    px('#dfe9ee', 0, 0, 16, 16);
    for (let x = 0; x < 16; x += 4) px('#b3c4cd', x, 0, 1, 16);
    px('#ffffff', 1, 1, 14, 1); px('#8fa3ad', 0, 15, 16, 1);
  },
  [C.I]: (px, r) => { speckle(px, r, '#9aa0a3', ['#8b9194', '#a9afb2'], 10); px('#80868a', 0, 7, 16, 1); px('#80868a', 7, 0, 1, 16); },
  [C.J]: (px, r) => speckle(px, r, '#e4dfd2', ['#c9c2b0', '#f2eee4', '#b9b19d'], 30),
  [C.Y]: (px, r) => {
    speckle(px, r, '#4a9a46', ['#3d863a'], 8);
    for (const [a, b] of [[2, 3], [9, 2], [5, 9], [11, 10]]) { px('#a5a5a5', a, b, 3, 4); px('#d0d0d0', a, b, 3, 1); px('#5f5f5f', a, b + 4, 3, 1); }
  },
  [C.K]: (px, r) => {
    grassBase(px, r);
    for (let y = 5; y <= 13; y++) { const w = Math.round(Math.sqrt(1 - ((y - 13) / 8) ** 2) * 7); px('#5fb853', 8 - w, y, w * 2, 1); }
    px('#7fd06e', 5, 7, 4, 1); px('#7fd06e', 4, 8, 2, 1);
    for (let y = 5; y <= 13; y++) { const w = Math.round(Math.sqrt(1 - ((y - 13) / 8) ** 2) * 7); px('#2a6f29', 8 - w - 1, y, 1, 1); px('#2a6f29', 8 + w, y, 1, 1); }
    px('#2a6f29', 1, 14, 14, 1);
  },
  [C.M]: (px, r) => {
    grassBase(px, r);
    for (let y = 2; y <= 14; y++) {
      const hw = Math.round((y - 2) * 7 / 12);
      px('#b08a62', 8 - hw, y, hw, 1); px('#7a5c40', 8, y, hw + 1, 1);
      px('#3a2a1a', 8 - hw - 1, y, 1, 1); px('#3a2a1a', 8 + hw + 1, y, 1, 1);
    }
    px('#3a2a1a', 7, 1, 2, 1); px('#d8c3a5', 7, 3, 1, 2); px('#3a2a1a', 1, 15, 15, 1);
  },
  [C.T]: (px, r) => speckle(px, r, '#cdbf9e', ['#b8aa88', '#ddd1b4'], 14),
  [C.W]: (px, r) => {
    grassBase(px, r);
    const ox = ((r() * 3) | 0) - 1;

    const [leaf, hi] = KOYO ? [['#c8641e', '#e08a3a'], ['#b03a24', '#d0563c'], ['#c99a1e', '#e6c040'], ['#1d5e26', '#2e8a38']][(r() * 4) | 0] : ['#1d5e26', '#2e8a38'];
    px('#5b3a1e', 7 + ox, 11, 2, 4);
    px(leaf, 3 + ox, 3, 10, 8); px(leaf, 4 + ox, 2, 8, 10); px(leaf, 2 + ox, 5, 12, 4);
    px(hi, 5 + ox, 3, 4, 3); px(hi, 4 + ox, 5, 2, 2);
    px('#123f19', 4 + ox, 10, 8, 1);
  },
  [C.P]: (px, r) => {
    speckle(px, r, '#4fb24b', ['#45a242', '#66c461'], 12);
    const cols = ['#ff8fb1', '#fff176', '#ffffff'];
    for (let i = 0; i < 3; i++) { const a = 1 + ((r() * 13) | 0), b = 1 + ((r() * 13) | 0); px(cols[i % 3], a, b); px('#2f8f2c', a, b + 1); }
    if (SAKURA && r() < 0.6) {
      const a = 3 + ((r() * 6) | 0), b = 2 + ((r() * 4) | 0);
      px('#6b4a2e', a + 3, b + 6, 2, 4); px('#f7b6cc', a, b, 8, 6); px('#f7b6cc', a + 1, b - 1, 6, 8); px('#fde0ea', a + 2, b + 1, 3, 2); px('#e48aa8', a + 1, b + 6, 6, 1);
    }
  },
  [C.A]: (px, r, f) => {
    px('#2a62c9', 0, 0, 16, 16);
    for (let i = 0; i < 4; i++) {
      const a = ((r() * 12) | 0) + (f ? 2 : 0), b = 2 + i * 4 + ((r() * 2) | 0);
      px('#6fa3ff', a % 14, b, 3, 1); px('#6fa3ff', (a + 3) % 14, b - 1, 2, 1);
    }
  },
  [C.S]: (px, r) => speckle(px, r, '#e7cf8c', ['#d2b56a', '#f3e2ae'], 16),
  [C.B]: (px, r) => {
    const roofs = [['#b4472f', '#8c3320', '#d06a4f'], ['#5d6c8c', '#45516b', '#7b8bad'], ['#8a5a3c', '#6b432b', '#a7774f'], ['#7f8a87', '#636c69', '#a0aaa7']];
    const [m, d, h] = roofs[(r() * roofs.length) | 0];
    px(m, 0, 0, 16, 16);
    for (let y = 3; y < 16; y += 4) px(d, 0, y, 16, 1);
    for (let y = 0; y < 16; y += 4) for (let x = (y / 4 % 2) * 4; x < 16; x += 8) px(d, x, y, 1, 3);
    px(h, 0, 0, 16, 1); px('#3a2a20', 0, 15, 16, 1);
  },
  [C.R]: (px, r) => speckle(px, r, '#a9a9a4', ['#989893', '#b9b9b4'], 10),
  [C.H]: (px, r) => { speckle(px, r, '#7e7e7c', ['#6e6e6c', '#8e8e8c'], 12); },
  [C.Q]: (px, r) => {
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
  [C.X]: (px, r, f) => { px(UNREAD_BG, 0, 0, 16, 16); px(UNREAD_DOT, (f * 8) % 16, 7, 2, 2); },
};
const SHADE = ['rgba(0,0,0,.32)', 'rgba(0,0,0,.16)', '', 'rgba(255,250,220,.12)', 'rgba(255,250,220,.24)'];
const tiles = {};
function buildTiles(codes) {
  for (const [code, draw] of Object.entries(TILE_ART)) {
    if (codes && !codes.includes(+code)) continue;
    tiles[code] = (+code === C.Q ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1, 2]).map(v => [makeTile(draw, code * 97 + v * 31 + 7, 0), makeTile(draw, code * 97 + v * 31 + 7, 1)]);
  }
}
buildTiles();






const MT = { s: -1, p: '', house: null, tree: null, misc: null, field: null, town: null, water: null, waterReq: false, sprites: null, spriteReq: false, roofs: null, roofReq: false, paddyU: null, paddyF: null };
const MISC_ROWS = [C.P, C.N, C.Y, C.I, C.K, C.M];
const FIELD_ROWS = [C.E, C.V, C.S, C.J, C.G];
function mapSeason() {
  if (KOYO) return 2;
  if (SAKURA) return 0;
  const m = new Date().getMonth() + 1;
  return m === 12 || m <= 2 ? 3 : 1;
}
function sliceSheet(img, cols, rows) {
  const out = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    c.getContext('2d').drawImage(img, x * 16, y * 16, 16, 16, 0, 0, 16, 16);
    out.push(c);
  }
  return out;
}




let houseCut = 0;
function sliceSheetLazy(img, cols, rows) {
  const out = new Array(cols * rows);
  for (let i = 0; i < out.length; i++) {
    Object.defineProperty(out, i, {
      configurable: true, enumerable: true,
      get() {
        const c = document.createElement('canvas');
        c.width = c.height = 16;
        c.getContext('2d').drawImage(img, (i % cols) * 16, Math.floor(i / cols) * 16, 16, 16, 0, 0, 16, 16);
        const pair = [c, c];
        Object.defineProperty(out, i, { value: pair, writable: true, configurable: true, enumerable: true });
        houseCut++;
        return pair;
      },
    });
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
  if (MT.sprites) {
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
    img.onerror = () => { if (ok()) setTimeout(() => { if (ok()) get(file, ok, fn); }, 15000); };
    img.src = `nishio-go/maptiles/${file}.png`;
  };
  const s = mapSeason(), pt = PADDY_TILE;
  if (s !== MT.s) {
    MT.s = s;
    const ok = () => MT.s === s;
    get(`house-${s}`, ok, img => { MT.house = sliceSheetLazy(img, 50, 50); });
    get(`tree-${s}`, ok, img => { const a = sliceSheet(img, 30, 2); MT.tree = a.slice(0, 30).map((c, i) => [c, a[30 + i]]); });
    get(`misc-${s}`, ok, img => { const a = sliceSheet(img, 30, MISC_ROWS.length); MT.misc = MISC_ROWS.map((_, r) => a.slice(r * 30, r * 30 + 30).map(c => [c, c])); });
    get(`town-${s}`, ok, img => {
      const a = sliceSheet(img, 12, 1).map(c => [c, c]), plain = a.slice(0, 2), deco = a.slice(2);
      MT.town = [...Array(35).fill(plain).flat(), ...deco];
    });
    get(`field-${s}`, ok, img => { const a = sliceSheet(img, 12, FIELD_ROWS.length * 2); MT.field = FIELD_ROWS.map((_, r) => a.slice(r * 24, r * 24 + 12).map((c, i) => [c, a[r * 24 + 12 + i]])); });
  }
  if (!MT.roofReq) {
    MT.roofReq = true;
    get('roofs', () => true, img => { MT.roofs = sliceSheet(img, 32, 1).map(c => [c, c]); });
  }
  if (!MT.spriteReq) {
    MT.spriteReq = true;
    get('sprites', () => true, img => { MT.sprites = sliceSheet(img, 6, 1); });
  }
  if (!MT.railReq) {
    MT.railReq = true;
    get('rail', () => true, img => { MT.rail = sliceSheet(img, 41, 1); });
  }
  if (!MT.roadReq) {
    MT.roadReq = true;
    get('road', () => true, img => { const a = sliceSheet(img, 32, 3); MT.road = [0, 1, 2].map(r => a.slice(r * 32, r * 32 + 32)); });
    get('rankan', () => true, img => { MT.rankan = sliceSheet(img, 4, 1); });
    get('kawakado', () => true, img => { const a = sliceSheet(img, 4, 3); MT.kawakado = [a.slice(0, 4), a.slice(4, 8), a.slice(8, 12)]; });
    get('kado', () => true, img => { const a = sliceSheet(img, 4, 3); MT.kado = [0, 1, 2].map(r => a.slice(r * 4, r * 4 + 4)); });
    get('facade', () => true, img => { const a = sliceSheet(img, 6, 5); MT.facade = [0, 1, 2, 3, 4].map(r => a.slice(r * 6, r * 6 + 6)); });
  }
  if (!MT.shoreReq) {
    MT.shoreReq = true;
    get('shore', () => true, img => { const a = sliceSheet(img, 32, 3); MT.shore = [0, 1, 2].map(r => a.slice(r * 32, r * 32 + 32)); });
  }
  if (!MT.vehReq) {
    MT.vehReq = true;
    get('vehicles', () => true, img => {
      const a = sliceSheet(img, 4, 8), row = r => a.slice(r * 4, r * 4 + 4);
      MT.veh = { train: [row(0), row(1)], boat: row(2), car: [3, 4, 5, 6, 7].map(row) };
    });
  }
  if (!MT.waterReq) {
    MT.waterReq = true;
    get('water', () => true, img => { const a = sliceSheet(img, 3, 2); MT.water = a.slice(0, 3).map((c, i) => [c, a[3 + i]]); });
  }
  if (pt !== MT.p) {
    MT.p = pt;
    get(`paddy-${pt}`, () => MT.p === pt, img => {
      const a = sliceSheet(img, 9, 4);
      MT.paddyU = a.slice(0, 9).map((c, i) => [c, a[9 + i]]);
      MT.paddyF = a.slice(18, 27).map((c, i) => [c, a[27 + i]]);
    });
  }
}
loadMapTiles();




const DECO = { img: null, s: -1, idx: null, cols: 96, m: new Date().getMonth() + 1 };
const DECO_PLACE = {
  [C.G]: [12, ['kotori', 'karasu', 'neko', 'inu', 'choucho@4-10', 'jizo', 'hokora', 'douhyou', 'hana@3-10', 'ajisai@6-7', 'himawari@7-8', 'kosumosu@9-10',
    'kinoko@6-11', 'iwa', 'kaki@10-11', 'tako@1-1', 'sakura@3-4', 'momiji@11-12', 'tsukimi@9-9', 'kiji', 'usagi', 'tsubame@4-7', 'hotaru@6-6', 'sanpo', 'jogger',
    'mujin', 'sudebako', 'tanukiy', 'kasahito#rain', 'kitsune', 'tonbi', 'mogura', 'nanohana@3-4', 'higanbana@9-9', 'ume@2-3', 'ichou@11-11',
    'susuki@9-11', 'mushitori@7-8', 'tsukushi@3-4', 'hanami@4-4', 'semi@7-8', 'kabutomushi@7-8']],
  [C.P]: [12, ['kotori', 'karasu', 'hana@3-10', 'choucho@4-10', 'tsubame@4-7', 'kiji', 'usagi', 'tonbi']],
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
const DECO_PADDY = {
  flooded: ['sagi', 'sagi', 'kamo', 'kaeru', 'karasu', 'suimon', 'tsubame@4-7', 'taue@5-6', 'taue@5-6', 'zarigani@5-9'], green: ['sagi', 'kaeru', 'kakashi', 'noufu', 'karasu', 'choucho', 'suimon', 'tsubame@4-7'],
  gold: ['kakashi', 'kakashi', 'karasu', 'kotori', 'noufu', 'sagi', 'combine', 'inekari', 'tonbi'],
  stubble: ['hazakake', 'warazuka', 'warazuka', 'karasu', 'sagi', 'kotori', 'tonbi'],
  soil: ['sagi', 'karasu', 'noufu', 'kotori', 'suimon', 'tractor', 'tractor', 'kiji'],
};
const DECO_ANIM = new Set(['sagi', 'kotori', 'kamo', 'kamome', 'neko', 'inu', 'kaeru', 'choucho', 'karasu', 'noufu', 'kodomo', 'tsuri', 'kiji', 'tsubame', 'usagi',
  'hotaru', 'koi', 'hakuchou', 'jogger', 'sanpo', 'risu', 'fukurou', 'cyclist', 'cart', 'randoseru', 'onigokko', 'tanukiy', 'itachi', 'kasahito', 'hiker', 'hatakehito',
  'kitsune', 'tonbi', 'niwatori', 'ushi', 'zarigani', 'taue', 'inekari', 'mushitori', 'yukata']);


const DECO_POND = new Set(['koi', 'suisha', 'hasu', 'swanboat']), DECO_OPEN = new Set(['yacht', 'fune', 'jetski']);
const landNear = (tx, ty, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const c = codeAt(tx + dx, ty + dy); if (c !== C.A && c !== C.X) return true; } return false; };
const decoSeason = () => { const m = new Date().getMonth() + 1; return m >= 3 && m <= 5 ? 0 : m >= 6 && m <= 8 ? 1 : m >= 9 && m <= 11 ? 2 : 3; };
function loadDeco() {

  const intro = document.getElementById('intro');
  if (intro && !intro.hidden) {
    if (!loadDeco.wait) {
      loadDeco.wait = new MutationObserver(() => { if (intro.hidden) { loadDeco.wait.disconnect(); loadDeco.wait = null; loadDeco(); } });
      loadDeco.wait.observe(intro, { attributes: true, attributeFilter: ['hidden'] });
    }
    return;
  }
  if (!DECO.go) return;
  const s = decoSeason();
  if (s === DECO.s) return;
  DECO.s = s;
  if (!DECO.idx) fetch('nishio-go/deco/deco.json').then(r => r.json()).then(j => { DECO.idx = new Map(j.subjects.map((n, i) => [n, i])); DECO.cols = j.cols; dirty = true; }).catch(() => { DECO.s = -1; });
  const img = new Image();
  img.onload = () => { if (DECO.s === s) { DECO.img = img; decoCache.clear(); dirty = true; } };
  img.onerror = () => { if (DECO.s === s) DECO.s = -1; };
  img.src = `nishio-go/deco/deco-${s}.webp`;
}
const decoLists = new Map();
function decoList(code) {
  const wx = window.NISHIO_WEATHER && window.NISHIO_WEATHER.current, rain = !!(wx && wx.kind === 'rain');
  const m = DECO.m, key = code + ':' + m + ':' + rain + ':' + (code === C.U || code === C.F ? PADDY_TILE : '');
  if (decoLists.has(key)) return decoLists.get(key);
  const place = code === C.U || code === C.F ? [14, DECO_PADDY[PADDY_TILE] || DECO_PADDY.green] : DECO_PLACE[code];
  const inMonths = (a, b) => (a <= b ? m >= a && m <= b : m >= a || m <= b);
  const list = !place ? null : [place[0], place[1].filter(e => {
    if (e.endsWith('#rain')) return rain;
    const [, r] = e.split('@'); if (!r) return true; const [a, b] = r.split('-').map(Number); return inMonths(a, b);
  }).map(e => e.split(/[@#]/)[0])];
  decoLists.set(key, list);
  return list;
}


function kabuseOn(t = Date.now()) {
  const d = new Date(t + 9 * 3600000), md = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  return md >= 415 && md <= 520;
}
function drawKabuse(tx, ty, X, Y, T) {
  const p = Math.max(1, Math.round(T / 16));
  ctx.fillStyle = 'rgba(38,42,46,0.68)'; ctx.fillRect(X, Y, T, T);
  ctx.fillStyle = 'rgba(120,128,134,0.35)';
  for (let i = 2; i < 16; i += 4) { ctx.fillRect(X + i * p, Y, p, T); ctx.fillRect(X, Y + i * p, T, p); }
  const n = codeAt(tx, ty + 1) !== C.E, w = codeAt(tx - 1, ty) !== C.E, e = codeAt(tx + 1, ty) !== C.E;
  ctx.fillStyle = '#7a5a3a';
  if (n && w) ctx.fillRect(X + p, Y + 12 * p, p, 4 * p);
  if (n && e) ctx.fillRect(X + 14 * p, Y + 12 * p, p, 4 * p);
  if (n) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(X, Y + 15 * p, T, p); }
}


const chaHanaOn = () => DECO.m >= 9 && DECO.m <= 11;
function drawChaHana(tx, ty, X, Y, T) {
  const h = Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663), u = (h ^ (h >>> 13)) >>> 0;
  if (u % 3 === 0) return;
  const p = Math.max(1, Math.round(T / 16));
  for (let i = 0, n = 1 + (u >>> 3) % 2; i < n; i++) {
    const r = u >>> (6 + i * 7), cx = 2 + r % 12, cy = (i & 1 ? 10 : 2) + (r >>> 4) % 3, x = X + cx * p, y = Y + cy * p;
    ctx.fillStyle = '#fbfaf2'; ctx.fillRect(x, y - p, p, p * 3); ctx.fillRect(x - p, y, p * 3, p);
    ctx.fillStyle = '#f2c94c'; ctx.fillRect(x, y, p, p);
  }
}
function drawDeco(code, tx, ty, X, Y, T, now) {
  if (!DECO.img || !DECO.idx) return;
  const L = decoList(code);
  if (!L || !L[1].length) return;
  const h = Math.imul(tx, 2654435761) ^ Math.imul(ty, 40503) ^ 0x5bd1e995, u = (h ^ (h >>> 15)) >>> 0;
  if (u % L[0]) return;
  if (code === C.T && tiles[C.T].length === 80 && tileVar(code, tx, ty) % 80 >= 70) return;
  const name = L[1][(u >>> 4) % L[1].length], si = DECO.idx.get(name);
  if (si === undefined) return;
  if (code === C.A && (DECO_POND.has(name) ? !landNear(tx, ty, 2) : DECO_OPEN.has(name) && landNear(tx, ty, 1))) return;
  let k = (u >>> 9) % 6;
  if (DECO_ANIM.has(name)) k = (k & 6) | ((Math.floor(now / 650) + (u >>> 20)) & 1);
  ctx.drawImage(decoCanvas(((si * 6 + k) * 4 + (u >>> 13) % 4) * 8 + (u >>> 16) % 8), X, Y, T, T);
}

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
  : code === C.W ? (Math.floor(now / 700) + (tx >> 1) + (ty >> 2)) & 1
  : code === C.U || code === C.F ? (Math.floor(now / 900) + ((tx + ty) >> 2)) & 1
  : code === C.G ? (Math.floor(now / 800) + ((tx - ty) >> 2)) & 1 : 0;

const tileVar = (code, x, y) => code === C.V ? (((x >> 3) * 73856093) ^ ((y >> 3) * 19349663)) >>> 0 : code === C.B && tiles[C.B].length === 32 ? roofVar(x, y) : ((x * 73856093) ^ (y * 19349663)) >>> 0;


const blockHash = (x, y) => (Math.imul(x >> 2, 374761393) ^ Math.imul(y >> 2, 668265263) ^ 0x27d4eb2d) >>> 0;
function roofVar(x, y) {
  const b = blockHash(x, y), group = b % 13, geo = (b >>> 5) & 1;
  if (group < 5) return group * 2 + geo;
  if (group < 10) return 10 + (group - 5) * 2 + geo;
  const t = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  return 20 + (group - 10) * 4 + (t % 10 < 7 ? 0 : 1 + ((t >>> 4) % 3));
}

const rfAt = (tx, ty) => { const cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK), c = chunks.get(cx + '_' + cy); return c && c.g && c.g.rf ? c.g.rf[(ty - cy * CHUNK) * CHUNK + (tx - cx * CHUNK)] : 0; };
const HOUSE_ROOF = [0, 0, 7, 3, 2, 1, 2, 9, 8, 5, 6, 5, 5, 5];





const RAIL_PAIR = { '4,6': 16, '5,7': 17, '0,5': 18, '0,6': 19, '1,7': 20, '1,6': 21, '2,4': 22, '2,7': 23, '3,4': 24, '3,5': 25 };


function railBandRaw(x, y) {
  const L = (a, b) => gridAt(a, b) === C.L;
  if (![[0, 0], [-1, 0], [0, -1], [-1, -1]].some(([a, b]) => L(x + a, y + b) && L(x + a + 1, y + b) && L(x + a, y + b + 1) && L(x + a + 1, y + b + 1))) return -1;
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (L(x + i, y + j)) { n++; sx += i; sy += j; sxx += i * i; syy += j * j; sxy += i * j; }
  const cxx = sxx / n - (sx / n) ** 2, cyy = syy / n - (sy / n) ** 2, cxy = sxy / n - (sx / n) * (sy / n);
  if (Math.abs(cxx - cyy) < 0.05 && Math.abs(cxy) < 0.05) return -1;
  const deg = ((Math.atan2(2 * cxy, cxx - cyy) / 2) * 180 / Math.PI + 180) % 180;
  return deg < 22.5 || deg >= 157.5 ? 10 : deg < 67.5 ? 17 : deg < 112.5 ? 5 : 16;
}


const BAND_ENDS = { 10: [[-1, 0], [1, 0]], 5: [[0, -1], [0, 1]], 16: [[1, -1], [-1, 1]], 17: [[-1, -1], [1, 1]] };
function railBandIndex(x, y) {
  const d = railBandRaw(x, y);
  if (d < 0) return -1;
  return BAND_ENDS[d].every(([a, b]) => { if (gridAt(x + a, y + b) !== C.L) return false; const e = railBandRaw(x + a, y + b); return e === d || e < 0; }) ? d : -1;
}

function railBandSpill(x, y, band) {
  const same = (a, b) => railBandIndex(a, b) === band;
  if (band === 16) { const nw = same(x - 1, y) || same(x, y - 1), se = same(x + 1, y) || same(x, y + 1); return nw && se ? 37 : se ? 36 : nw ? 35 : 16; }
  const ne = same(x + 1, y) || same(x, y - 1), sw = same(x - 1, y) || same(x, y + 1);
  return ne && sw ? 40 : sw ? 39 : ne ? 38 : 17;
}
function nbrLook(x, y, fn) {
  const key = x * 1048576 + y;
  let r = nbrCur.get(key);
  if (r === undefined) { r = fn(x, y); nbrCur.set(key, r); }
  return r;
}
const railIndex = (x, y) => nbrLook(x, y, railIndexOf);

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

  const toMe = (a, b) => { const d = railBandIndex(x + a, y + b); return (d === 16 && a === -b) || (d === 17 && a === b); };
  const ports = [up, rt, dn, lf, (!up && !rt && L(x + 1, y - 1)) || toMe(1, -1), (!dn && !rt && L(x + 1, y + 1)) || toMe(1, 1), (!dn && !lf && L(x - 1, y + 1)) || toMe(-1, 1), (!up && !lf && L(x - 1, y - 1)) || toMe(-1, -1)]
    .flatMap((on, i) => on ? [i] : []);
  const corners = ports.filter(i => i >= 4);
  if (!corners.length) return m;
  if (ports.length === 1) return corners[0] === 4 || corners[0] === 6 ? 16 : 17;
  return RAIL_PAIR[ports.join()] || ports;
}


const RAIL_X_DIRS = [[0, 1, 26, 28], [1, 0, 27, 29], [1, -1, 30, 32], [1, 1, 31, 33]];
function railCrossing(x, y) {
  const L = (a, b) => gridAt(a, b) === C.L, Rd = (a, b) => ROAD_ROW[gridAt(a, b)] !== undefined;
  for (const [dx, dy, pa, pb] of RAIL_X_DIRS) {
    const end = s => {
      const fx = dx * s, fy = dy * s, fwd = fx && fy ? [[fx, fy], [fx, 0], [0, fy]] : [[fx, fy], [fx - fy, fy + fx], [fx + fy, fy - fx]];
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



const ROAD_ROW = { [C.R]: 0, [C.H]: 1, [C.D]: 2 };


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
  let gi = t % 50;
  if (k === 13) gi = 30 + gi % 10; else if (gi >= 30 && gi < 40) gi -= 10;
  return gi * 50 + HOUSE_ROOF[k] * 5 + (t >>> 8) % 5;
}


function facadeType(x, y) {
  const b = blockHash(x, y) >>> 7, onRoad = isRoad(codeAt(x, y + 1));
  const t = (onRoad ? [2, 3, 2, 0, 4] : [0, 0, 4, 5, 0])[b % 5];
  return t === 0 && ((Math.imul(x, 2654435761) ^ y) >>> 0) % 4 === 0 ? 1 : t;
}

const WALLS = ['#e8e0d0', '#f0ece4', '#d8c8a8', '#c8ccd0', '#b8a080'];
function drawWall(tx, ty, X, Y, T) {
  const u = T / 16, below = codeAt(tx, ty + 1) !== C.B;
  if (codeAt(tx - 1, ty) !== C.B) { ctx.fillStyle = 'rgba(30,24,20,.45)'; ctx.fillRect(X, Y, Math.ceil(u), T); }
  if (codeAt(tx + 1, ty) !== C.B) { ctx.fillStyle = 'rgba(30,24,20,.3)'; ctx.fillRect(X + T - Math.ceil(u), Y, Math.ceil(u), T); }
  if (codeAt(tx, ty - 1) !== C.B) { ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(X, Y, T, Math.ceil(u)); }
  if (!below) return;
  if (MT.facade) { ctx.drawImage(MT.facade[blockHash(tx, ty) % WALLS.length][facadeType(tx, ty)], X, Y, T, T); return; }
  const wall = WALLS[blockHash(tx, ty) % WALLS.length], wy = Y + Math.round(10 * u);
  ctx.fillStyle = 'rgba(30,24,20,.55)'; ctx.fillRect(X, wy - Math.ceil(u), T, Math.ceil(u));
  ctx.fillStyle = wall; ctx.fillRect(X, wy, T, T - (wy - Y));
  ctx.fillStyle = '#5a7a9a';
  for (let wx = 2; wx < 16; wx += 5) ctx.fillRect(X + Math.round(wx * u), wy + Math.round(1.5 * u), Math.round(2 * u), Math.round(2 * u));
  ctx.fillStyle = 'rgba(30,24,20,.6)'; ctx.fillRect(X, Y + T - Math.ceil(u), T, Math.ceil(u));
}

let seasonCheckT = 0;
function refreshSeason(now) {
  if (now - seasonCheckT < 60000) return;
  seasonCheckT = now;
  const k = seasonNow();
  loadMapTiles();
  loadDeco();
  DECO.m = new Date().getMonth() + 1;
  if (k === seasonKey) return;
  seasonKey = k;
  WCOL[C.U] = WCOL[C.F] = PADDY_COL;
  buildTiles([C.U, C.F, C.W, C.P]);
  applyMapTiles();
  makeWorldImg();
  dirty = true;
}


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
  treasure: ['................', '................', '...kkkkkkkkkk...', '..kyrrrrrrrryk..', '..krrrrrrrrrrk..', '..kyrrrrrrrryk..', '..kkkkkkkkkkkk..', '..kyyyyyyyyyyk..', '..kRRRRkkRRRRk..', '..kRrrkyykrrRk..', '..kRrrrkkrrrRk..', '..kRrrrrrrrrRk..', '..kyyyyyyyyyyk..', '..kkkkkkkkkkkk..', '................', '................'],
  chest: ['................', '................', '................', '...kkkkkkkkkk...', '..knnnnnnnnnnk..', '..knNNNNNNNNnk..', '..knnnnnnnnnnk..', '..kkkkkyykkkkk..',
    '..knnnkyyknnnk..', '..knnnnkknnnnk..', '..knNNNNNNNNnk..', '..knnnnnnnnnnk..', '..kkkkkkkkkkkk..', '................', '................', '................'],
};

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
  ricestore: ['................', '.kkkkkkkkkkkkkk.', 'kNNNNNNNNNNNNNNk', 'kNnNnNnNnNnNnNNk', 'kkkkkkkkkkkkkkkk', '.kwwwwwwwwwwwwk.', '.kwwwwwkwwwwwwk.', '.kwwwkwkwkwwwwk.', '.kwwwkkkkkwwwwk.', '.kwwwwkkkwwwwwk.', '.kwwwkwkwkwwwwk.', '.kkkkkkkkkkkkkk.', '.krrrkrrrrkrrrk.', '.krrrkrrrrkrrrk.', '.ksskNNNNNNkssk.', 'kkkkkkkkkkkkkkkk'],
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

const RIVAL_PAL = { ...PAL, h: '#2b2018', c: '#e53935', p: '#1e3a8a', a: '#e53935' };
const rivalSprites = [sprite(NPC_ROWS, false, RIVAL_PAL), sprite(NPC_ROWS.map((r, i) => i === 9 ? r.replace('a', 'c') : r), false, RIVAL_PAL)];
const rivalTile = () => { const r = G.rival; return r ? npcTile({ id: 'rival:' + r.at, lat: r.lat, lng: r.lng }) : null; };
function rivalTalk() {
  const r = G.rival;
  if (r) G.toast(`🏃 ${G.RIVAL}「ここで 会えたね。${r.name}、ゆっくり 見ていこまい」`);
}

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

const critterS = { steps: 0, show: null, where: '', told: {} };


const SUZUME_MAX = 3, SUZUME_LIFE = 14000, SUZUME_NEAR = 2.2;
const suzume = { list: [], next: 0, visit: 0, met: false };
const SUZUME_VISIT = 18;
const SUZUME_AT = () => [C.F, C.U, C.V, C.G, C.P];
function suzumeSpawn(x, y, now) {
  const n = Math.random() < 0.5 ? 2 : 3;
  for (let i = 0; i < n && suzume.list.length < SUZUME_MAX; i++) suzume.list.push({ x: x + 0.5 + (i - (n - 1) / 2) * 0.7 + (Math.random() - 0.5) * 0.2, y: y + 0.5 + (Math.random() - 0.5) * 0.4,
    t0: now + i * 180, fly: 0, dir: Math.random() < 0.5 ? -1 : 1, seed: Math.random() * 1000 });
  suzume.met = true;
}
function drawSuzume(x, y, u, dir, pose) {
  const hy = pose === 1 ? 1 : 0, parts = [
    [-4, 1, 1, 2, '#6b4320'],
    [-3, 1, 5, 3, '#9a6630'],
    [-3, 3, 4, 1, '#ead9b4'],
    [1, -1 + hy, 3, 3, '#7a4422'],
    [1, 0 + hy, 2, 2, '#ffffff'],
    [1, 1 + hy, 1, 1, '#1a1a1a'],
    [3, 0 + hy, 1, 1, '#1a1a1a'],
    [4, 1 + hy, 1, 1, '#e0a83a'],
    pose === 2 ? [-2, -2, 3, 3, '#5a3818'] : [-2, 1, 3, 1, '#5a3818'],
  ];
  if (pose !== 2) parts.push([-1, 4, 1, 1, '#d08a40'], [1, 4, 1, 1, '#d08a40']);
  const px = (cx, cy, cw, ch, c) => { ctx.fillStyle = c; ctx.fillRect(dir > 0 ? x + cx * u : x - (cx + cw) * u, y + cy * u, cw * u, ch * u); };
  for (const [cx, cy, cw, ch] of parts) px(cx - 1, cy - 1, cw + 2, ch + 2, '#2b1a0c');
  for (const [cx, cy, cw, ch, c] of parts) px(cx, cy, cw, ch, c);
}
function chunSound() {
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
  } catch (e) {  }
}


const NEKO_LIFE = 40000, NEKO_NEAR = 2.4, NEKO_AWAKE = 2600;
const neko = { cat: null, next: 0, met: false };
const NEKO_COLS = [['#f2a65a', '#c97a32'], ['#f4f0e6', '#9a9a9a'], ['#555555', '#2f2f2f']];
function drawNeko(x, y, u, dir, awake, col, now) {
  const [c1, c2] = col, parts = [
    [-3, -1, 5, 1, c1], [-4, 0, 7, 3, c1],
    [-4, 3, 7, 1, c2],
    [-6, 2, 2, 1, c2], [-6, 3, 1, 1, c2],
  ];
  if (awake) parts.push([2, -3, 4, 3, c1], [2, -4, 1, 1, c1], [5, -4, 1, 1, c1], [3, -2, 1, 1, '#1a1a1a'], [5, -2, 1, 1, '#1a1a1a'], [4, -1, 1, 1, '#e88a9a']);
  else parts.push([2, -1, 4, 3, c1], [2, -2, 1, 1, c1], [5, -2, 1, 1, c1], [3, 0, 1, 1, '#3a2a1a'], [5, 0, 1, 1, '#3a2a1a']);
  const px = (cx, cy, cw, ch, c) => { ctx.fillStyle = c; ctx.fillRect(dir > 0 ? x + cx * u : x - (cx + cw) * u, y + cy * u, cw * u, ch * u); };
  for (const [cx, cy, cw, ch] of parts) px(cx - 1, cy - 1, cw + 2, ch + 2, '#2b1a0c');
  for (const [cx, cy, cw, ch, c] of parts) px(cx, cy, cw, ch, c);
  if (!awake) { const k = Math.floor(now / 700) % 3; for (let i = 0; i <= k; i++) px(6 + i * 2, -4 - i * 2, 2, 1, '#ffffff'); }
}
function nyaSound() {
  const a = sfxCtx();
  if (!a) return;
  try {
    const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(620, t); o.frequency.linearRampToValueAtTime(900, t + 0.08); o.frequency.exponentialRampToValueAtTime(520, t + 0.28);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.32);
  } catch (e) {  }
}



const AMB_MAX = 2;
const AMB_BOOT = performance.now(), AMB_FIRST_MS = 60000;
const ambFirstRetry = (now, met) => !met && Number.isFinite(now) && now - AMB_BOOT < AMB_FIRST_MS;
const ambN = () => (suzume.list.length ? 1 : 0) + (neko.cat ? 1 : 0) + (mushi.m ? 1 : 0) + (kaeru.list.length ? 1 : 0) + (nakama.n ? 1 : 0) + (donguri.d ? 1 : 0);
function nekoStep(now, ox, oy, T, w, h, dpr) {
  if (worldMode || driving || rp.x === null) { neko.cat = null; return; }
  if (!neko.cat && now > neko.next && !mapCovered() && ambN() < AMB_MAX) {
    neko.next = now + (ambFirstRetry(now, neko.met) ? 4000 + Math.random() * 3000 : 20000 + Math.random() * 20000);
    for (let k = 0; k < 16; k++) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 4, x = Math.floor(rp.x + Math.cos(a) * r), y = Math.floor(rp.y + Math.sin(a) * r);
      const sx = ox + x * T, sy = oy + y * T;
      if (sx < T || sy < T * 2 || sx > w - 2 * T || sy > h - 3 * T) continue;
      const c = codeAt(x, y), q = mazeOn() && mzNear(x + 0.5, y + 0.5), home = [C.Q, C.B].some(k2 => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => codeAt(x + dx, y + dy) === k2));
      if (home && ![C.B, C.Q, C.A, C.W, C.X].includes(c) && (!mazeOn() || (q && q.d > 1.15 && q.d < 1.9))) { neko.cat = { x: x + 0.5, y: y + 0.6, t0: now, awake: 0, dir: Math.random() < 0.5 ? -1 : 1, col: NEKO_COLS[Math.floor(Math.random() * NEKO_COLS.length)] }; neko.met = true; break; }
    }
  }
  const n = neko.cat;
  if (!n) return;
  if (now - n.t0 > NEKO_LIFE && now - n.awake > NEKO_AWAKE) { neko.cat = null; return; }
  const sp = Math.hypot(rp.vx || 0, rp.vy || 0), near = Math.hypot(n.x - rp.x, n.y - rp.y) < NEKO_NEAR;
  if (sp > 0.8 && near && now - n.awake > NEKO_AWAKE) { n.awake = now; n.dir = rp.x > n.x ? 1 : -1; nyaSound(); }
  const u = Math.max(Math.round(2 * dpr), Math.round(T / 16));
  drawNeko(Math.round(ox + n.x * T), Math.round(oy + n.y * T), u, n.dir, now - n.awake < NEKO_AWAKE, n.col, now);
  dirty = true;
}


const MUSHI_LIFE = 15000, MUSHI_NEAR = 1.8;
const mushi = { m: null, next: 0 };
const mushiKind = () => { const mo = new Date().getMonth() + 1; return mo >= 8 && mo <= 10 ? 'tonbo' : mo >= 3 && mo <= 6 ? 'chocho' : ''; };
function drawMushi(x, y, u, kind, now, dir) {
  const flap = Math.floor(now / (kind === 'tonbo' ? 70 : 170)) % 2, px = (cx, cy, cw, ch, c) => { ctx.fillStyle = c; ctx.fillRect(dir > 0 ? x + cx * u : x - (cx + cw) * u, y + cy * u, cw * u, ch * u); };
  const draw = parts => { for (const [cx, cy, cw, ch] of parts) px(cx - 1, cy - 1, cw + 2, ch + 2, '#2b1a0c'); for (const [cx, cy, cw, ch, c] of parts) px(cx, cy, cw, ch, c); };
  if (kind === 'tonbo') {
    const wy = flap ? -1 : 0;
    draw([[-2, -4 + wy, 2, 3, '#e6f2ff'], [2, -4 + wy, 2, 3, '#e6f2ff'], [-2, 3 - wy, 2, 3, '#e6f2ff'], [2, 3 - wy, 2, 3, '#e6f2ff']]);
    draw([[-8, 0, 11, 2, '#e0442c'], [3, -1, 3, 4, '#9a2a18'], [-8, 0, 1, 2, '#8a2414']]);
  } else {
    const o = flap ? 0 : 1;
    draw([[-4 + o, -4, 3 - o, 3, '#fbfbf2'], [1, -4, 3 - o, 3, '#fbfbf2'], [-3 + o, -1, 2 - o, 2, '#fbfbf2'], [1, -1, 2 - o, 2, '#fbfbf2'], [0, -4, 1, 5, '#3a2a1a']]);
    px(-3 + o, -3, 1, 1, '#3a3a3a'); px(2, -3, 1, 1, '#3a3a3a');
  }
}


const KAERU_MAX = 2, KAERU_LIFE = 20000, KAERU_NEAR = 2.0;
const kaeru = { list: [], next: 0 };
const kaeruSeason = () => { const mo = new Date().getMonth() + 1; return mo >= 4 && mo <= 10; };
function drawKaeru(x, y, u, dir, pose) {
  const parts = pose === 2
    ? [[-3, -1, 5, 3, '#5cb85c'], [1, -2, 2, 1, '#5cb85c'], [-5, 1, 2, 1, '#3f8f3f'], [-6, 2, 2, 1, '#3f8f3f']]
    : [[-3, 0, 6, 3, '#5cb85c'], [-3, -1, 2, 1, '#5cb85c'], [1, -1, 2, 1, '#5cb85c'], [-4, 2, 2, 1, '#3f8f3f'], [2, 2, 2, 1, '#3f8f3f']];
  const px = (cx, cy, cw, ch, c) => { ctx.fillStyle = c; ctx.fillRect(dir > 0 ? x + cx * u : x - (cx + cw) * u, y + cy * u, cw * u, ch * u); };
  for (const [cx, cy, cw, ch] of parts) px(cx - 1, cy - 1, cw + 2, ch + 2, '#1e2a14');
  for (const [cx, cy, cw, ch, c] of parts) px(cx, cy, cw, ch, c);
  if (pose !== 2) { px(-3, -1, 1, 1, '#ffffff'); px(-2, -1, 1, 1, '#1a1a1a'); px(1, -1, 1, 1, '#ffffff'); px(2, -1, 1, 1, '#1a1a1a'); px(-2, 2, 4, 1, '#cfe8a0'); }
  if (pose === 1) { px(-1, 2, 2, 2, '#f2f7d8'); }
}
function potyaSound() {
  const a = sfxCtx();
  if (!a) return;
  try {
    const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(180, t + 0.12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.18);
  } catch (e) {  }
}




const NAKAMA_FOLLOW = 6000, NAKAMA_CD = 40000;
const nakama = { n: null, next: 0 };
const firstWalk = () => { try { return !(Number(lsGet('nsg_mzgoals', '0')) >= 3); } catch (e) { return false; } };
const otomo = { next: 0, last: '' };
const NAKAMA_MONTHS = { ichigo: [12, 1, 2, 3, 4, 5], nasu: [10, 11, 12, 1, 2, 3, 4, 5, 6], daizu: [12] };
const nakamaKinds = () => { const mo = new Date().getMonth() + 1; return Object.keys(NAKAMA_MONTHS).filter(k => NAKAMA_MONTHS[k].includes(mo)); };
const nakamaKind = () => { const a = nakamaKinds(); return a.length ? a[Math.floor(Math.random() * a.length)] : ''; };



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
function drawNakama(x, y, u, kind, ang, noFace) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  const px = (cx, cy, cw, ch, c) => { ctx.fillStyle = c; ctx.fillRect(cx * u, cy * u, cw * u, ch * u); };
  const draw = parts => { for (const [cx, cy, cw, ch] of parts) px(cx - 1, cy - 1, cw + 2, ch + 2, '#2b1a0c'); for (const [cx, cy, cw, ch, c] of parts) px(cx, cy, cw, ch, c); };
  if (kind === 'ichigo') {
    draw([[-3, -2, 6, 3, '#e8384a'], [-2, 1, 4, 1, '#e8384a'], [-1, 2, 2, 1, '#e8384a'], [-2, -3, 4, 1, '#3f9b3c'], [-1, -4, 2, 1, '#3f9b3c']]);
    for (const [cx, cy] of [[-2, -2], [1, -2], [-2, 1], [1, 1]]) px(cx, cy, 1, 1, '#ffe08a');
  } else if (kind === 'nasu') {
    draw([[-3, -1, 6, 4, '#5a2a7a'], [-2, 3, 4, 1, '#5a2a7a'], [-2, -2, 4, 1, '#3f9b3c'], [-1, -3, 2, 1, '#3f9b3c']]);
    px(-2, 0, 1, 2, '#9a6ac0');
  } else if (kind === 'unagi') {
    draw([[-4, -1, 8, 3, '#3d4552'], [-3, 2, 6, 1, '#d9c88a'], [2, -2, 2, 1, '#3d4552']]);
  } else if (kind === 'ebisen') {
    draw([[-3, -2, 6, 4, '#f0a050'], [-2, -3, 4, 1, '#f0a050'], [-2, 2, 4, 1, '#f0a050']]);
    for (const [cx, cy] of [[-2, -2], [2, -2], [-2, 1], [1, 1]]) px(cx, cy, 1, 1, '#d8602c');
  } else if (kind === 'tencha') {
    draw([[-3, -1, 6, 3, '#4e9a3a'], [-2, -2, 4, 1, '#4e9a3a'], [-2, 2, 4, 1, '#4e9a3a'], [-1, -3, 2, 1, '#2f7a2a']]);
    px(-3, 2, 1, 1, '#2f7a2a');
  } else if (kind === 'inaho') {
    draw([[-2, -2, 4, 4, '#e8b830'], [-3, -1, 6, 2, '#e8b830'], [-1, -3, 2, 1, '#c89a20']]);
    px(-2, -2, 1, 1, '#fff0a0'); px(1, 1, 1, 1, '#b8860b');
  } else if (kind === 'asari') {
    draw([[-3, -1, 6, 3, '#c9a77a'], [-2, -2, 4, 1, '#c9a77a'], [-2, 2, 4, 1, '#c9a77a']]);
    for (const cx of [-3, 2]) px(cx, -1, 1, 3, '#8a6a44');
  } else if (kind === 'chawan') {
    draw([[-3, -1, 6, 3, '#c98a5a'], [-2, 2, 4, 1, '#c98a5a'], [-2, -2, 4, 1, '#7fc04a']]);
    px(-2, 0, 1, 1, '#e8b890');
  } else if (kind === 'chochin') {
    draw([[-3, -2, 6, 4, '#d8302c'], [-2, -3, 4, 1, '#d8302c'], [-2, 2, 4, 1, '#d8302c'], [-2, -4, 4, 1, '#3a2a1a'], [-2, 3, 4, 1, '#3a2a1a']]);
    px(-3, 0, 6, 1, '#f0b040');
  } else if (kind === 'carnation') {
    draw([[-3, -2, 6, 3, '#f06a9a'], [-2, -3, 4, 1, '#f06a9a'], [-1, 1, 2, 1, '#3f9b3c'], [-1, 2, 2, 1, '#3f9b3c']]);
    px(-1, -1, 2, 1, '#ffd0e0');
  } else if (kind === 'unadon') {
    draw([[-3, 0, 6, 3, '#b03a2a'], [-2, 3, 4, 1, '#b03a2a'], [-3, -2, 6, 2, '#6a3a1a'], [-2, -3, 4, 1, '#6a3a1a']]);
    px(-2, -2, 2, 1, '#a8642a');
  } else if (kind === 'parfait') {
    draw([[-2, 0, 4, 3, '#e8f4f0'], [-1, 3, 2, 1, '#e8f4f0'], [-3, -2, 6, 2, '#7fc04a'], [-2, -3, 4, 1, '#fff4e0']]);
    px(-2, 1, 4, 1, '#a8d878');
  } else if (kind === 'kakigori') {
    draw([[-3, -1, 6, 3, '#e8f4f0'], [-2, -2, 4, 1, '#e8f4f0'], [-2, 2, 4, 1, '#9ab8c8']]);
    px(-2, -2, 4, 1, '#7fc04a'); px(-3, -1, 2, 1, '#a8d878');
  } else if (kind === 'chasoba') {
    draw([[-3, 1, 6, 2, '#6a4a2a'], [-3, -1, 6, 2, '#8fbf6a'], [-2, -2, 4, 1, '#8fbf6a']]);
    px(-1, -1, 1, 1, '#4e9a3a');
  } else {
    draw([[-2, -2, 4, 4, '#e8d08a'], [-3, -1, 6, 2, '#e8d08a']]);
    px(-1, -1, 1, 1, '#fff4c8'); px(1, 1, 1, 1, '#b89a50');
  }
  if (noFace) {  } else if (kind !== 'daizu') { const e = kind === 'nasu' || kind === 'unagi' ? '#fff4e0' : '#1a1a1a'; px(-1, 0, 1, 1, e); px(1, 0, 1, 1, e); } else { px(-1, -1, 1, 1, '#1a1a1a'); px(1, -1, 1, 1, '#1a1a1a'); }
  ctx.restore();
}


function drawNimotsu(hx, by, u, now, sleepy) {
  const kind = window.nishioGo && window.nishioGo.nimotsu;
  if (!kind || sleepy) return;
  const bob = Math.sin(now / 420) * 0.35 * u;
  drawNakama(Math.round(hx), Math.round(by - 12.5 * u + bob), Math.max(1, Math.round(u * 0.8)), kind, 0);
}


const yume = { cur: null, last: '', t0: 0, drawn: 0 };
function yumeFind() {
  if (!window.NISHIO_YUME || !LU || rp.x === null || worldMode) return null;
  const ll = toLatLng(rp.x, rp.y);
  let near = '';
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) near += luAt(ll.lat + a * LU.dLat, ll.lng + b * LU.dLng);
  return window.NISHIO_YUME.pick({ city: here.city, town: here.town, near, month: new Date().getMonth() + 1 }, yume.last);
}
function yumeStep(hx, by, u, now, sleepy) {
  if (sleepy && !yume.cur) {
    const y = yumeFind();
    if (!y) return;
    yume.cur = y; yume.last = y.id; yume.t0 = now;
    if (G.track) G.track('kome_yume', { id: y.id });
  } else if (!sleepy && yume.cur) {
    const y = yume.cur; yume.cur = null;
    if (!mapCovered()) riceSay(y.say, 2600, 'happy');
    return;
  }
  if (!sleepy || !yume.cur) return;
  const k = Math.min(1, (now - yume.t0) / 700), bob = calmMotion ? 0 : Math.sin(now / 900) * 0.5 * u, q = Math.max(1, Math.round(u * 0.8));
  const cx = hx - 15 * u, cy = by - 19 * u + bob;
  ctx.save(); ctx.globalAlpha = k;
  ctx.fillStyle = '#fffdf3'; ctx.strokeStyle = '#2a2420'; ctx.lineWidth = Math.max(1, Math.round(u * 0.5));
  const puff = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); };
  puff(hx - 8 * u, by - 12 * u, 0.9 * u); puff(hx - 10.5 * u, by - 14.5 * u, 1.4 * u);
  for (const [dx, dy, r] of [[-3.5, 0, 4.5], [3.5, 0, 4.5], [0, -3, 5], [0, 3, 4.5]]) puff(cx + dx * u, cy + dy * u, r * u);
  for (const [dx, dy, r] of [[-3.5, 0, 4.5], [3.5, 0, 4.5], [0, -3, 5], [0, 3, 4.5]]) { ctx.beginPath(); ctx.arc(cx + dx * u, cy + dy * u, r * u - ctx.lineWidth, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  ctx.save(); ctx.globalAlpha = k;
  drawNakama(Math.round(cx), Math.round(cy), q, yume.cur.id, 0);
  ctx.restore();
  yume.drawn++; dirty = true;
}


const nedoko = { cur: null, last: '', t0: 0, said: false, drawn: 0 };
function nedokoStep(hx, by, u, now, sleepy) {
  const n = nedoko;
  if (!sleepy || !window.NISHIO_NEDOKO || gbOn || worldMode || driving || rp.x === null) { n.cur = null; n.said = false; return; }
  if (!n.cur) {
    const c = kasaFind(), d = c ? window.NISHIO_NEDOKO.pick(Object.assign(c, { month: new Date().getMonth() + 1 }), n.last) : null;
    if (!d) return;
    n.cur = d; n.last = d.id; n.t0 = now; n.said = false;
    if (G.track) G.track('kome_nedoko', { id: d.id });
  }
  const age = now - n.t0, k = Math.min(1, age / window.NISHIO_NEDOKO.SETTLE);
  if (!n.said && k >= 1 && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(n.cur.say, 2600, 'happy'); n.said = true; }
  const q = Math.max(1, Math.round(u * 0.8)), bob = calmMotion ? 0 : Math.sin(now / 900) * 0.3 * u;
  ctx.globalAlpha = k;
  [[-15, 0], [-6, 1], [6, 1], [15, 0]].forEach(([dx, dy]) => drawNakama(Math.round(hx + dx * u), Math.round(by + (10.5 + dy) * u + bob), q, n.cur.id, 0, true));
  ctx.globalAlpha = 1;
  n.drawn++; dirty = true;
}


const yuami = { cur: null, t0: 0, still0: 0, said: false, chk: 0, drawn: 0 };
function yuamiStep(hx, by, u, now) {
  const y = yuami, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_YUAMI || !still || gbOn || rp.x === null || roll.idle > 12 || tsutsumi.cur || tsutsumi.done) { y.cur = null; y.said = false; y.chk = 0; return; }
  if (!y.cur) {
    if (roll.idle < window.NISHIO_YUAMI.STILL || now < y.chk) return;
    y.chk = now + 2000;
    const c = kasaFind(), d = c ? window.NISHIO_YUAMI.pick(c) : null;
    if (!d) return;
    y.cur = d; y.t0 = now; y.said = false;
    if (G.track) G.track('kome_yuami', { id: d.id });
  }
  const age = now - y.t0, k = Math.min(1, age / window.NISHIO_YUAMI.SETTLE);
  if (!y.said && k >= 1 && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(y.cur.say, 2600, 'happy'); y.said = true; }
  if (k >= 1) roll.happyT = Math.max(roll.happyT, 0.3);
  const q = Math.max(1, Math.round(u * 0.8)), px = (cx, cy, cw, ch, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  const t = calmMotion ? 0 : now / 1000;
  ctx.globalAlpha = k;
  if (y.cur.id === 'onsen') {
    px(-17, 5, 34, 9, '#6b5a4a'); px(-16, 6, 32, 7, '#8fd3e0'); px(-14, 7, 6, 1, '#d8f4f8'); px(5, 9, 8, 1, '#d8f4f8');
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.5 + i / 3) % 1;
      ctx.globalAlpha = k * (1 - ph) * 0.7;
      px(-10 + i * 10 + Math.sin(t * 2 + i * 2) * 1.5, -13 - ph * 12, 4, 2.5, '#ffffff');
    }
  } else {
    px(-18, 8, 36, 6, '#4aa8d8'); px(-18, 8, 36, 1, '#bfe8f6');
    const w = Math.sin(t * 2) * 1.5;
    px(-15 + w, 10, 6, 1, '#bfe8f6'); px(7 - w, 12, 6, 1, '#bfe8f6');
    px(-17, 6, 4, 4, '#e8384a'); px(13, 6, 4, 4, '#e8384a'); px(-13, 7, 26, 3, '#fff7e6'); px(-5, 7, 4, 3, '#e8384a'); px(5, 7, 4, 3, '#e8384a');
  }
  ctx.globalAlpha = 1;
  y.drawn++; dirty = true;
}


const horidashi = { cur: null, last: '', t0: 0, chk: 0, said: false, drawn: 0 };
function horidashiStep(hx, by, u, now) {
  const h = horidashi, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_HORIDASHI || !still || gbOn || rp.x === null || roll.idle > 12 || yuami.cur || shimatabi.cur || tombolo.cur || tsutsumi.cur || tsutsumi.done) { h.cur = null; h.said = false; h.chk = 0; return; }
  const H = window.NISHIO_HORIDASHI;
  if (!h.cur || now - h.t0 >= H.CYCLE) {
    if (!h.cur && (roll.idle < H.STILL || now < h.chk)) return;
    h.chk = now + 2000;
    const c = kasaFind(), d = c ? H.pick(c, h.last) : null;
    if (!d) { h.cur = null; return; }
    h.cur = d; h.last = d.id; h.t0 = now; h.said = false;
    if (G.track) G.track('kome_horidashi', { id: d.id });
  }
  const age = now - h.t0, dig = Math.min(1, age / H.DIG), t = calmMotion ? 0 : now / 1000;
  const px = (cx, cy, cw, ch, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  px(-18, 11, 36, 4, '#e8cf94'); px(-16, 12, 8, 1, '#c9ad70'); px(4, 13, 10, 1, '#c9ad70');
  if (dig < 1) {
    for (let i = 0; i < 6; i++) {
      const ph = (t * 2.2 + i / 6) % 1, sd = i % 2 ? 1 : -1;
      ctx.globalAlpha = 1 - ph;
      px(sd * (10 + ph * 8) - 1, 10 - Math.sin(ph * Math.PI) * 9, 2.5, 2.5, i % 3 ? '#e8cf94' : '#c9ad70');
    }
    ctx.globalAlpha = 1;
    px(-11, 10, 5, 2, '#c9ad70'); px(7, 10, 5, 2, '#c9ad70');
  } else {
    if (!h.said && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(h.cur.say, 2600, 'happy'); h.said = true; }
    roll.happyT = Math.max(roll.happyT, 0.3);
    const up = Math.min(1, (age - H.DIG) / 400), s = Math.round(u * 1.2 * 16), bob = calmMotion ? 0 : Math.sin(t * 5) * 0.8;
    px(8, 11, 14, 3, '#e8cf94');
    ctx.drawImage(critterSprites[h.cur.id], Math.round(hx + 7 * u), Math.round(by + (-2 - bob - (1 - up) * -8) * u), s, s);
    px(7, 12, 16, 3, '#e8cf94');
  }
  h.drawn++; dirty = true;
}



const tsutsumi = { cur: null, t0: 0, chk: 0, n: 0, done: false, drawn: 0 };
function tsutsumiStep(hx, by, u, now) {
  const m = tsutsumi, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_TSUTSUMI || !still || gbOn || rp.x === null || roll.idle > 12) { m.cur = null; m.n = 0; m.done = false; m.chk = 0; return; }
  const T = window.NISHIO_TSUTSUMI;
  if (!m.cur) {
    if (m.done || roll.idle < T.STILL || now < m.chk) return;
    m.chk = now + 2000;
    const f = kasaFind(), d = f ? T.pick(f) : null;
    if (!d) return;
    m.cur = d; m.t0 = now; m.n = 0;
    if (G.track) G.track('kome_tsutsumi', { id: d.id });
  }
  const age = now - m.t0, t = calmMotion ? 0 : now / 1000;
  const k = Math.min(1, age / T.BUILD), g = Math.max(0, Math.min(1, (age - T.BUILD) / T.GOLD));
  const px = (cx, cy, cw, ch, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  ctx.globalAlpha = Math.min(1, age / 400);
  for (let i = 0; i < 13; i++) {
    const sw = Math.sin(t * 2 + i) * 0.8 * g, x = -26 + i * 4;
    px(x, 11, 0.8, 5, '#7fae45'); px(x + sw, 9.5, 1.6, 2.5, g > 0.5 ? '#e8b923' : '#9dc94f');
  }
  const h = 14 * k;
  px(-24, 15 - h, 48, h, '#8a6a43'); px(-24, 15 - h, 48, Math.min(1.5, h), g > 0.5 ? '#d9b44a' : '#6fa04a');
  if (age < T.BUILD) {
    for (let i = 0; i < 3; i++) {
      const x = -22 + i * 18 + (calmMotion ? 0 : Math.sin(t * 3 + i * 2) * 1.5), y = 13 - h + Math.abs(Math.sin(t * 6 + i)) * (calmMotion ? 0 : 0.8);
      px(x, y - 5, 2, 2, '#e6c9a0'); px(x, y - 3, 2, 3, '#5b6f8a'); px(x + 2, y - 4, 2.5, 2, '#a07a4c');
    }
  }
  ctx.globalAlpha = 1;
  roll.happyT = Math.max(roll.happyT, 0.3);
  const at = [600, T.BUILD + 200, T.BUILD + T.GOLD], say = [m.cur.say, m.cur.done, m.cur.gold];
  if (m.n < 3 && age >= at[m.n] && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(say[m.n], 2800, 'happy'); m.n++; }
  if (m.n >= 3 && age > T.BUILD + T.GOLD + T.HOLD) { m.cur = null; m.done = true; return; }
  m.drawn++; dirty = true;
}


const shimatabi = { cur: null, last: '', t0: 0, chk: 0, said: false, drawn: 0 };
function shimatabiStep(hx, by, u, now) {
  const m = shimatabi, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_SHIMATABI || !still || gbOn || rp.x === null || roll.idle > 12) { m.cur = null; m.said = false; m.chk = 0; return; }
  const S = window.NISHIO_SHIMATABI;
  if (!m.cur || now - m.t0 >= S.CYCLE) {
    if (!m.cur && (roll.idle < S.STILL || now < m.chk)) return;
    m.chk = now + 2000;
    const c = kasaFind(), d = c ? S.pick(c, m.last) : null;
    if (!d) { m.cur = null; return; }
    m.cur = d; m.last = d.id; m.t0 = now; m.said = false;
    if (G.track) G.track('kome_shimatabi', { id: d.id });
  }
  const age = now - m.t0, t = calmMotion ? 0 : now / 1000;
  const px = (cx, cy, cw, ch, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  ctx.globalAlpha = Math.min(1, age / 500);
  if (m.cur.id === 'art') {
    px(-14, 11, 28, 4, '#b8b2a4'); px(-14, 11, 28, 1, '#d8d3c6'); px(-14, 14, 28, 1, '#8c8678'); px(-4, 12.5, 8, 1.5, '#4a4a4a');
    px(-18, 8, 2, 7, '#c0392b'); px(16, 8, 2, 7, '#c0392b'); px(-16, 9, 4, 1, '#e6d3a3'); px(12, 9, 4, 1, '#e6d3a3');
  } else if (m.cur.id === 'kurokabe') {
    px(-22, -8, 44, 23, '#2b2f36'); for (let i = 0; i < 11; i++) px(-22 + i * 4, -6, 0.6, 21, '#1d2026');
    px(-24, -11, 48, 3, '#7a7f86'); px(-24, -8, 48, 1, '#5b5f66'); px(12, -2, 7, 6, '#161a1f'); px(13, -1, 5, 4, '#e0c070');
  } else {
    px(-24, 12, 48, 3, '#4a8fc2'); px(-24, 12, 48, 1, '#7db5dc');
    for (let i = 0; i < 4; i++) px(-20 + i * 12 + Math.sin(t * 2 + i) * 2, 13.5, 4, 0.8, '#e8f3fb');
    const sx = calmMotion ? -6 : -22 + ((age / 7000) % 1) * 34;
    px(sx, 8, 14, 3, '#f4f4f4'); px(sx, 11, 14, 1.5, '#2f6fb0'); px(sx + 4, 5, 6, 3, '#f4f4f4'); px(sx + 5, 6, 4, 1, '#222');
  }
  ctx.globalAlpha = 1;
  roll.happyT = Math.max(roll.happyT, 0.3);
  if (!m.said && age > 600 && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(m.cur.say, 2800, 'happy'); m.said = true; }
  m.drawn++; dirty = true;
}


const chochinyoru = { cur: null, last: '', t0: 0, chk: 0, said: false, drawn: 0 };
function chochinyoruStep(hx, by, u, now) {
  const m = chochinyoru, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_CHOCHINYORU || !still || gbOn || rp.x === null || roll.idle > 12 || !nightOn || nightLevel() < 1) { m.cur = null; m.said = false; m.chk = 0; return; }
  const S = window.NISHIO_CHOCHINYORU;
  if (!m.cur || now - m.t0 >= S.CYCLE) {
    if (!m.cur && (roll.idle < S.STILL || now < m.chk)) return;
    m.chk = now + 2000;
    const c = kasaFind(), d = c ? S.pick(Object.assign(c, { night: true }), m.last) : null;
    if (!d) { m.cur = null; return; }
    m.cur = d; m.last = d.id; m.t0 = now; m.said = false;
    if (G.track) G.track('kome_chochinyoru', { id: d.id });
  }
  const age = now - m.t0, t = calmMotion ? 0 : now / 1000, id = m.cur.id, fade = Math.min(1, age / 500);
  const px = (cx, cy, cw, ch, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  const glow = (cx, cy, r, al) => { for (let k = 3; k >= 1; k--) { ctx.globalAlpha = fade * al * (4 - k) / 3 * 0.5; px(cx - r * k / 3, cy - r * k / 3, r * 2 * k / 3, r * 2 * k / 3, '#ffb040'); } ctx.globalAlpha = fade; };
  const lantern = (cx, cy, w, h) => {
    px(cx - w / 2, cy, w, h, '#d8302c'); px(cx - w / 2 + 1, cy - 1, w - 2, 1, '#d8302c'); px(cx - w / 2 + 1, cy + h, w - 2, 1, '#d8302c');
    px(cx - w / 4, cy - 2, w / 2, 1.5, '#3a2a1a'); px(cx - w / 4, cy + h + 0.5, w / 2, 1.5, '#3a2a1a');
    px(cx - w / 2, cy + h / 2, w, 1, '#f0b040'); px(cx - w / 2 + 1, cy + 1, 1, h - 2, '#ff7a60');
  };
  ctx.globalAlpha = fade;
  const pulse = calmMotion ? 1 : 0.85 + Math.sin(t * 3) * 0.15;
  if (id === 'tomoru') {
    glow(14, -12, 14 * pulse, 0.8); lantern(14, -18, 14, 14);
  } else if (id === 'narabu') {
    px(-22, -16, 44, 1, '#3a2a1a');
    for (let i = 0; i < 5; i++) { const sw = calmMotion ? 0 : Math.sin(t * 2 + i * 0.9) * 1.5; glow(-18 + i * 9 + sw, -10, 5 * pulse, 0.8); lantern(-18 + i * 9 + sw, -14, 6, 7); }
  } else {
    glow(0, -28, 20 * pulse, 0.7); lantern(0, -38, 22, 22);
  }
  ctx.globalAlpha = 1;
  roll.happyT = Math.max(roll.happyT, 0.3);
  if (!m.said && age > 600 && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(m.cur.say, 2800, 'happy'); m.said = true; }
  m.drawn++; dirty = true;
}


const kawabe = { cur: null, last: '', t0: 0, chk: 0, said: false, drawn: 0 };
function kawabeStep(hx, by, u, now) {
  const m = kawabe, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_KAWABE || !still || gbOn || rp.x === null || roll.idle > 12 || tsutsumi.cur || chochinyoru.cur || isshiki.cur || shimatabi.cur || yuami.cur || horidashi.cur || hazusanpo.cur || tombolo.cur || jokamachi.cur || mangekyo.cur || chatsumi.cur) { m.cur = null; m.said = false; m.chk = 0; return; }
  const S = window.NISHIO_KAWABE;
  if (!m.cur || now - m.t0 >= S.CYCLE) {
    if (!m.cur && (roll.idle < S.STILL || now < m.chk)) return;
    m.chk = now + 2000;
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
  if (id === 'yahagi') {
    px(-20, 4, 22, 5, '#4a8fc4'); px(-20, 4, 22, 1, '#8cc4e8'); px(-2, 2, 14, 9, '#3f84bc'); px(10, -2, 12, 17, '#2f6ea8');
    for (let i = 0; i < 3; i++) { const sh = calmMotion ? 0 : ((t * 6 + i * 8) % 24); px(-20 + sh, 6, 3, 1, '#d6ecf8'); }
    px(-20, 9, 22, 2, '#b99c5e'); px(-20, 2, 22, 2, '#7ba04a');
  } else if (id === 'medaka') {
    water(4, 12); const sw = calmMotion ? 0 : Math.sin(t * 1.6) * 6;
    spr('medaka', -10 + sw, 2, 1); spr('medaka', 6 - sw, 6, 0.8);
  } else if (id === 'uo') {
    water(2, 14); px(-20, 14, 40, 2, '#7a6a4a'); const sw = calmMotion ? 0 : Math.sin(t * 1.4) * 5;
    spr('akaza', -14 + sw, 2, 1); spr('sakana', 4 - sw, -2, 0.9);
  } else if (id === 'misago') {
    water(8, 8); const fly = calmMotion ? 0 : Math.sin(t * 1.2) * 8;
    spr('misago', -6 + fly, -16, 1.3);
  } else {
    water(8, 8); px(-12, 4, 24, 5, '#b99c5e'); px(-12, 4, 24, 1, '#7ba04a');
    for (let i = 0; i < 5; i++) px(-10 + i * 5, 1 + (i % 2), 1.5, 3, '#e0c030');
    spr('ishigame', -7, -6, 1.1);
  }
  ctx.globalAlpha = 1;
  roll.happyT = Math.max(roll.happyT, 0.3);
  if (!m.said && age > 600 && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(m.cur.say, 2800, 'happy'); m.said = true; }
  m.drawn++; dirty = true;
}


const isshiki = { cur: null, last: '', t0: 0, chk: 0, said: false, drawn: 0 };
function isshikiStep(hx, by, u, now) {
  const m = isshiki, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_ISSHIKI || !still || gbOn || rp.x === null || roll.idle > 12 || chochinyoru.cur) { m.cur = null; m.said = false; m.chk = 0; return; }
  const S = window.NISHIO_ISSHIKI;
  if (!m.cur || now - m.t0 >= S.CYCLE) {
    if (!m.cur && (roll.idle < S.STILL || now < m.chk)) return;
    m.chk = now + 2000;
    const c = kasaFind(), d = c ? S.pick(c, m.last) : null;
    if (!d) { m.cur = null; return; }
    m.cur = d; m.last = d.id; m.t0 = now; m.said = false;
    if (G.track) G.track('kome_isshiki', { id: d.id });
  }
  const age = now - m.t0, t = calmMotion ? 0 : now / 1000;
  const px = (cx, cy, cw, ch, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  ctx.globalAlpha = Math.min(1, age / 500);
  if (m.cur.id === 'ebisen') {
    px(-16, 11, 32, 3, '#4a4a4e'); px(-16, 11, 32, 1, '#76767c'); px(-14, 14, 3, 1.5, '#2e2e32'); px(11, 14, 3, 1.5, '#2e2e32');
    for (let i = 0; i < 3; i++) { const fl = !calmMotion && Math.sin(t * 3 + i) > 0.6; drawNakama(Math.round(hx + (-9 + i * 9) * u), Math.round(by + (9 - (fl ? 2 : 0)) * u), Math.max(1, Math.round(u * 0.8)), 'ebisen', 0, true); }
    for (let i = 0; i < 3; i++) { const ph = (t * 0.8 + i / 3) % 1; ctx.globalAlpha = Math.min(1, age / 500) * 0.5 * (1 - ph); px(-10 + i * 9 + Math.sin(ph * 6 + i) * 2, 6 - ph * 8, 2, 2, '#eeeeee'); }
  } else if (m.cur.id === 'unagi2') {
    for (let i = 0; i < 10; i++) {
      const gx = -18 + (i % 5) * 8, gy = 6 + Math.floor(i / 5) * 6;
      if (i < 2) drawNakama(Math.round(hx + (gx + 3) * u), Math.round(by + (gy + 2) * u), Math.max(1, Math.round(u * 0.8)), 'unagi', 0, true);
      else { ctx.globalAlpha = Math.min(1, age / 500) * 0.45; px(gx, gy, 5, 4, '#9fb0c0'); ctx.globalAlpha = Math.min(1, age / 500); }
    }
  } else if (m.cur.id === 'yoman') {
    px(-20, 10, 40, 5, '#3e86a8'); px(-20, 10, 40, 1, '#8cc8de'); px(-20, 15, 40, 1, '#2b5f78');
    const w = calmMotion ? 0 : Math.sin(t * 2) * 6;
    drawNakama(Math.round(hx + (-4 + w) * u), Math.round(by + 12.5 * u), Math.max(1, Math.round(u * 0.8)), 'unagi', 0, true);
    px(14, 3, 1, 8, '#7a4a22'); px(11, 1, 7, 4, '#e6d3a3'); px(12, 2, 5, 1, '#7a4422'); px(12, 3.5, 3, 1, '#7a4422');
  } else {
    px(-18, 11, 36, 4, '#a9763f'); px(-18, 11, 36, 1, '#c9955a'); px(-18, 14, 36, 1, '#7a4f26');
    for (let i = 0; i < 4; i++) { const fx = -14 + i * 8; px(fx, 8.5, 6, 2.5, i % 2 ? '#e8e8ee' : '#9fc0d8'); px(fx + 5.5, 9, 2, 1.5, i % 2 ? '#e8e8ee' : '#9fc0d8'); px(fx + 1, 9, 1, 1, '#2a2a30'); }
    px(17, -2, 1, 13, '#7a4a22'); px(18, -2, 5, 7, '#d8302c'); px(19, 0, 3, 1, '#fff7e6');
  }
  ctx.globalAlpha = 1;
  roll.happyT = Math.max(roll.happyT, 0.3);
  if (!m.said && age > 600 && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(m.cur.say, 2800, 'happy'); m.said = true; }
  m.drawn++; dirty = true;
}


const hazusanpo = { cur: null, last: '', t0: 0, chk: 0, said: false, drawn: 0 };
function hazusanpoStep(hx, by, u, now) {
  const m = hazusanpo, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_HAZUSANPO || !still || gbOn || rp.x === null || roll.idle > 12 || tombolo.cur) { m.cur = null; m.said = false; m.chk = 0; return; }
  const S = window.NISHIO_HAZUSANPO;
  if (!m.cur || now - m.t0 >= S.CYCLE) {
    if (!m.cur && (roll.idle < S.STILL || now < m.chk)) return;
    m.chk = now + 2000;
    const c = kasaFind(), d = c ? S.pick(c, m.last) : null;
    if (!d) { m.cur = null; return; }
    m.cur = d; m.last = d.id; m.t0 = now; m.said = false;
    if (G.track) G.track('kome_hazusanpo', { id: d.id });
  }
  const age = now - m.t0, t = calmMotion ? 0 : now / 1000, id = m.cur.id;
  const px = (cx, cy, cw, ch, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  const fade = Math.min(1, age / 500);
  ctx.globalAlpha = fade;
  if (id === 'yamanami') {
    px(-20, 14, 40, 1, '#4a6a3a'); px(-20, 11, 14, 3, '#7aa06a'); px(-17, 8, 8, 3, '#7aa06a'); px(-15, 6, 4, 2, '#7aa06a');
    px(-6, 10, 26, 4, '#5a8a4c'); px(0, 7, 14, 3, '#5a8a4c'); px(4, 4, 6, 3, '#5a8a4c'); px(6, 2, 2, 2, '#5a8a4c');
    px(8, 11, 12, 3, '#3e6e3a'); px(11, 9, 6, 2, '#3e6e3a');
  } else if (id === 'skyline') {
    px(-18, 14, 36, 1, '#4a6a3a'); px(-14, 10, 28, 4, '#5a8a4c'); px(-9, 6, 18, 4, '#5a8a4c'); px(-4, 2, 8, 4, '#5a8a4c');
    px(-12, 12, 24, 1, '#d8d4c8'); px(-8, 9, 16, 1, '#d8d4c8'); px(-3, 5, 8, 1, '#d8d4c8'); px(6, 9, 2, 3, '#d8d4c8'); px(-9, 6, 2, 3, '#d8d4c8');
    const ph = calmMotion ? 0.4 : (t * 0.25) % 1;
    px(-10 + ph * 20, 10.5, 3, 1.5, '#d8302c'); px(-9.5 + ph * 20, 10, 1.5, 0.8, '#fff7e6');
  } else if (id === 'carnation') {
    px(-18, 14, 36, 1, '#6e5a3a');
    for (let i = 0; i < 5; i++) {
      const fx = -15 + i * 7, sw = calmMotion ? 0 : Math.sin(t * 1.5 + i) * 0.6, top = 5 + (i % 2) * 2;
      px(fx + 1, top + 2, 1, 12 - (top - 5), '#3e8a3c'); px(fx - 1 + sw, top, 5, 3, i % 2 ? '#f08ab0' : '#e85a8a'); px(fx + sw, top - 1, 3, 1, '#f8c0d4'); px(fx + 1 + sw, top + 1, 1, 1, '#fff0f4');
    }
  } else {
    px(-18, 14, 36, 1, '#6e5a3a');
    px(-17, 8, 8, 6, '#6a86d8'); px(-15, 6, 6, 3, '#8aa0e8'); px(-19, 10, 4, 4, '#a07ad8'); px(-12, 11, 5, 3, '#a07ad8'); px(-16, 9, 1, 1, '#c8d4f8'); px(-12, 9, 1, 1, '#c8d4f8');
    for (let i = 0; i < 2; i++) {
      const fx = 4 + i * 9, sw = calmMotion ? 0 : Math.sin(t * 1.2 + i * 2) * 0.6, top = 3 + i * 2;
      px(fx + 2, top + 3, 1, 14 - top - 3, '#3e8a3c'); px(fx + sw, top, 5, 5, '#f2c230'); px(fx + 1 + sw, top + 1, 3, 3, '#6a4220'); px(fx - 1 + sw, top + 2, 1, 1, '#f2c230'); px(fx + 5 + sw, top + 2, 1, 1, '#f2c230');
    }
  }
  ctx.globalAlpha = 1;
  roll.happyT = Math.max(roll.happyT, 0.3);
  if (!m.said && age > 600 && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(m.cur.say, 2800, 'happy'); m.said = true; }
  m.drawn++; dirty = true;
}


const jokamachi = { cur: null, last: '', t0: 0, chk: 0, said: false, drawn: 0 };
function jokamachiStep(hx, by, u, now) {
  const m = jokamachi, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_JOKAMACHI || !still || gbOn || rp.x === null || roll.idle > 12) { m.cur = null; m.said = false; m.chk = 0; return; }
  const S = window.NISHIO_JOKAMACHI;
  if (!m.cur || now - m.t0 >= S.CYCLE) {
    if (!m.cur && (roll.idle < S.STILL || now < m.chk)) return;
    m.chk = now + 2000;
    const ll = toLatLng(rp.x, rp.y), d = S.pick({ city: here.city, near: S.nearKeys(G.spots, ll.lat, ll.lng) }, m.last);
    if (!d) { m.cur = null; return; }
    m.cur = d; m.last = d.id; m.t0 = now; m.said = false;
    if (G.track) G.track('kome_jokamachi', { id: d.id });
  }
  const age = now - m.t0, t = calmMotion ? 0 : now / 1000, id = m.cur.id;
  const px = (cx, cy, cw, ch, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  ctx.globalAlpha = Math.min(1, age / 500);
  if (id === 'ushitora') {
    px(-14, 11, 28, 4, '#8a8a84'); px(-14, 11, 28, 1, '#b0b0aa'); px(-10, 4, 20, 7, '#f1ede0'); px(-10, 4, 20, 1, '#d8d2c0');
    px(-13, 1, 26, 3, '#3a3c44'); px(-8, -2, 16, 3, '#3a3c44'); px(-4, 6, 3, 3, '#4a3a2a'); px(2, 6, 3, 3, '#4a3a2a');
  } else if (id === 'yuseki') {
    px(-12, 4, 3, 11, '#6e4a2a'); px(9, 4, 3, 11, '#6e4a2a'); px(-15, 1, 30, 3, '#3a3c44'); px(-13, -1, 26, 2, '#4a4c54'); px(-9, 4, 18, 2, '#8a5a30');
  } else if (id === 'shijo') {
    px(-16, 10, 32, 5, '#8a8a84'); px(-16, 10, 32, 1, '#b0b0aa'); for (let i = 0; i < 3; i++) px(-16 + i * 11, 12.5, 10, 1, '#6b6b66');
    px(10, -4, 1, 14, '#7a4a22'); px(11, -4, 6, 4, '#d8302c'); px(12, -3, 4, 1, '#fff7e6');
  } else if (id === 'rokuman') {
    const bale = (x, y) => { px(x, y, 8, 5, '#c9a55a'); px(x, y, 8, 1, '#e0c27a'); px(x + 2, y, 1, 5, '#8a6a2a'); px(x + 5, y, 1, 5, '#8a6a2a'); };
    bale(-13, 10); bale(-4, 10); bale(5, 10); bale(-8.5, 5); bale(0.5, 5); bale(-4, 0);
  } else if (id === 'konoe') {
    px(-16, 12, 32, 3, '#9fb36a'); px(-16, 12, 32, 1, '#b9ca86'); px(-16, 14, 32, 1, '#6e4a2a');
    drawNakama(Math.round(hx + 14 * u), Math.round(by + 9 * u), Math.max(1, Math.round(u * 0.9)), 'chawan', 0, true);
  } else if (id === 'shokoso') {
    px(-14, 14, 28, 1, '#5d7a3a'); px(-12, 6, 2, 8, '#6e4a2a'); px(-17, 1, 12, 4, '#2f6a3a'); px(-15, -2, 8, 3, '#2f6a3a');
    px(8, 12, 6, 2, '#8a8a84'); px(9, 8, 4, 4, '#b0b0aa'); px(8, 6, 6, 2, '#8a8a84'); px(10, 9, 2, 2, '#f2c84b');
  } else if (id === 'gion') {
    px(-14, 9, 28, 6, '#a8362c'); px(-14, 9, 28, 1, '#d8584a'); px(-12, 5, 24, 4, '#6e4a2a'); px(-15, 3, 30, 2, '#3a3c44');
    for (let i = 0; i < 5; i++) { const sw = calmMotion ? 0 : Math.sin(t * 2 + i) * 0.8; px(-11 + i * 5.5 + sw, 6, 2.5, 3, '#f0d070'); px(-10.5 + i * 5.5 + sw, 6, 1.5, 3, '#e8481c'); }
    px(-16, 13, 4, 4, '#2a2a30'); px(12, 13, 4, 4, '#2a2a30');
  } else {
    px(-14, 11, 28, 4, '#8a8a84'); px(-9, 4, 18, 7, '#f1ede0'); px(-13, 0, 26, 4, '#3a3c44'); px(-9, -3, 18, 3, '#4a4c54');
    px(-2, 6, 4, 5, '#7a4a22'); px(-1, -5, 2, 2, '#d8a82c');
  }
  ctx.globalAlpha = 1;
  roll.happyT = Math.max(roll.happyT, 0.3);
  if (!m.said && age > 600 && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(m.cur.say, 2800, 'happy'); m.said = true; }
  m.drawn++; dirty = true;
}


const chatsumi = { cur: null, last: '', t0: 0, chk: 0, said: false, drawn: 0 };
function chatsumiStep(hx, by, u, now) {
  const m = chatsumi, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_CHATSUMI || !still || gbOn || rp.x === null || roll.idle > 12) { m.cur = null; m.said = false; m.chk = 0; return; }
  const S = window.NISHIO_CHATSUMI;
  if (!m.cur || now - m.t0 >= S.CYCLE) {
    if (!m.cur && (roll.idle < S.STILL || now < m.chk)) return;
    m.chk = now + 2000;
    const ll = toLatLng(rp.x, rp.y), d = S.pick({ city: here.city, near: S.near(G.spots, ll.lat, ll.lng), month: new Date().getMonth() + 1 }, m.last);
    if (!d) { m.cur = null; return; }
    m.cur = d; m.last = d.id; m.t0 = now; m.said = false;
    if (G.track) G.track('kome_chatsumi', { id: d.id });
  }
  const age = now - m.t0, t = calmMotion ? 0 : now / 1000, id = m.cur.id;
  const px = (cx, cy, cw, ch, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  const row = (x, y, w) => { px(x, y, w, 4, '#2f7a3a'); px(x + 1, y - 1, w - 2, 1, '#4a9a4c'); px(x, y + 3, w, 1, '#1f5a2c'); };
  ctx.globalAlpha = Math.min(1, age / 500);
  if (id === 'ichibo') {
    px(-17, 14, 34, 1, '#6e5a3a'); row(-16, 10, 32); row(-13, 6, 26); row(-10, 2, 20); row(-7, -2, 14);
  } else if (id === 'tsumi') {
    row(-16, 9, 32); px(-16, 14, 32, 1, '#6e5a3a');
    px(8, 5, 8, 6, '#c9a55a'); px(8, 5, 8, 1, '#e0c27a'); px(9, 7, 6, 1, '#8a6a2a'); px(9, 9, 6, 1, '#8a6a2a');
    for (let i = 0; i < 4; i++) { const tw = calmMotion ? 1 : (Math.sin(t * 3 + i * 1.7) > 0.3 ? 1 : 0.4); px(-13 + i * 6, 7, 1.5, 2, tw >= 1 ? '#c8f06a' : '#8ac04a'); }
  } else if (id === 'tencha') {
    px(-16, 14, 32, 1, '#6e5a3a'); px(-14, 9, 28, 5, '#4a9a4c'); px(-10, 5, 20, 4, '#4a9a4c'); px(-6, 2, 12, 3, '#6ab45a'); px(-12, 9, 24, 1, '#7ac06a');
    px(11, 6, 5, 8, '#e8dcb8'); px(11, 6, 5, 1, '#c8b890'); px(12, 9, 3, 2, '#2f7a3a');
  } else {
    px(-16, 14, 32, 1, '#6e4a2a'); row(-16, 10, 32); row(-12, 5, 24);
    for (let i = 0; i < 3; i++) { const dx = calmMotion ? 0 : Math.sin(t * 0.8 + i * 2) * 3; ctx.globalAlpha = Math.min(1, age / 500) * 0.55; px(-15 + i * 10 + dx, 3 + i * 3.5, 14, 2.5, '#ffffff'); }
  }
  ctx.globalAlpha = 1;
  roll.happyT = Math.max(roll.happyT, 0.3);
  if (!m.said && age > 600 && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(m.cur.say, 2800, 'happy'); m.said = true; }
  m.drawn++; dirty = true;
}


const tombolo = { cur: null, last: '', t0: 0, chk: 0, said: false, drawn: 0 };
function tomboloStep(hx, by, u, now) {
  const m = tombolo, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_TOMBOLO || !still || gbOn || rp.x === null || roll.idle > 12) { m.cur = null; m.said = false; m.chk = 0; return; }
  const S = window.NISHIO_TOMBOLO;
  if (!m.cur || now - m.t0 >= S.CYCLE) {
    if (!m.cur && (roll.idle < S.STILL || now < m.chk)) return;
    m.chk = now + 2000;
    const ll = toLatLng(rp.x, rp.y), d = S.pick({ city: here.city, near: S.near(G.spots, ll.lat, ll.lng) }, m.last);
    if (!d) { m.cur = null; return; }
    m.cur = d; m.last = d.id; m.t0 = now; m.said = false;
    if (G.track) G.track('kome_tombolo', { id: d.id });
  }
  const age = now - m.t0, t = calmMotion ? 0 : now / 1000, id = m.cur.id;
  const px = (cx, cy, cw, ch, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  const wave = (x, y, w, i) => { const dx = calmMotion ? 0 : Math.sin(t * 1.4 + i * 2) * 1.5; px(x + dx, y, w, 1, '#d8ecf8'); };
  ctx.globalAlpha = Math.min(1, age / 500);
  if (id === 'mitsu') {
    px(-18, 6, 36, 9, '#4a8ac8'); px(-18, 6, 36, 1, '#6aa6dc'); wave(-14, 9, 6, 0); wave(2, 11, 7, 1); wave(-6, 13, 5, 2);
    px(8, 3, 9, 3, '#4a7a3a'); px(10, 1, 5, 2, '#4a7a3a'); px(8, 6, 9, 1, '#e8cf94');
  } else if (id === 'hiku') {
    px(-18, 6, 36, 9, '#4a8ac8'); px(-18, 6, 36, 1, '#6aa6dc');
    const open = calmMotion ? 6 : Math.min(6, 1 + age / 1200);
    px(-open, 6, open * 2, 9, '#e8cf94'); px(-open + 1, 9, open * 2 - 2, 1, '#c9ad70');
    wave(-14, 9, 6, 0); wave(8, 12, 6, 1); px(8, 3, 9, 3, '#4a7a3a'); px(10, 1, 5, 2, '#4a7a3a'); px(8, 6, 9, 1, '#e8cf94');
  } else if (id === 'michi') {
    px(-18, 6, 36, 9, '#4a8ac8'); px(-18, 6, 36, 1, '#6aa6dc');
    px(-18, 9, 28, 4, '#e8cf94'); px(-18, 9, 28, 1, '#f4e2b0'); px(-12, 11, 6, 1, '#c9ad70'); px(0, 12, 6, 1, '#c9ad70');
    wave(-14, 7, 6, 0); wave(2, 7, 7, 1); wave(-8, 14, 6, 2);
    px(8, 3, 9, 3, '#4a7a3a'); px(10, 1, 5, 2, '#4a7a3a'); px(8, 6, 10, 4, '#e8cf94');
  } else {
    px(-18, 11, 36, 4, '#e8cf94'); px(-16, 12, 8, 1, '#c9ad70'); px(4, 13, 10, 1, '#c9ad70'); px(-18, 8, 36, 3, '#c8e0ec'); wave(-12, 9, 6, 0);
    const bob = calmMotion ? 0 : Math.sin(t * 2) * 0.6;
    for (const [sx, sy, k] of [[-14, -4, 'asari'], [2, -4, 'uminina']]) if (critterSprites[k]) ctx.drawImage(critterSprites[k], Math.round(hx + sx * u), Math.round(by + (sy + bob) * u), Math.round(u * 1.2 * 16), Math.round(u * 1.2 * 16));
  }
  ctx.globalAlpha = 1;
  roll.happyT = Math.max(roll.happyT, 0.3);
  if (!m.said && age > 600 && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(m.cur.say, 2800, 'happy'); m.said = true; }
  m.drawn++; dirty = true;
}


const mangekyo = { cur: null, last: '', t0: 0, chk: 0, said: false, drawn: 0 };
function mangekyoStep(hx, by, u, now) {
  const m = mangekyo, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_MANGEKYO || !still || gbOn || rp.x === null || roll.idle > 12) { m.cur = null; m.said = false; m.chk = 0; return; }
  const S = window.NISHIO_MANGEKYO;
  if (!m.cur || now - m.t0 >= S.CYCLE) {
    if (!m.cur && (roll.idle < S.STILL || now < m.chk)) return;
    m.chk = now + 2000;
    const ll = toLatLng(rp.x, rp.y), d = S.pick({ city: here.city, near: S.near(G.spots, ll.lat, ll.lng) }, m.last);
    if (!d) { m.cur = null; return; }
    m.cur = d; m.last = d.id; m.t0 = now; m.said = false;
    if (G.track) G.track('kome_mangekyo', { id: d.id });
  }
  const age = now - m.t0, t = calmMotion ? 0 : now / 1000, id = m.cur.id;
  const px = (cx, cy, cw, ch, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  const COL = ['#e0527a', '#f0b840', '#4aa8d8', '#6ac060', '#a068d0'];
  ctx.globalAlpha = Math.min(1, age / 500);
  if (id === 'bijutsu') {
    px(-16, 14, 32, 1, '#6b5a4a'); px(-14, 8, 28, 1, '#8a7258');
    for (let i = 0; i < 4; i++) {
      const x = -13 + i * 7, c = COL[i], sp = calmMotion || Math.sin(t * 3 + i * 1.6) > 0.5;
      px(x + 1, 3, 3, 5, c); px(x, 5, 5, 3, c); px(x + 1, 4, 1, 3, '#ffffff');
      if (sp) { px(x + 5, 2, 1, 1, '#ffffff'); px(x + 4, 1, 3, 1, '#ffffff'); }
    }
  } else if (id === 'kyodai') {
    px(-18, 11, 22, 4, '#7a5a3a'); px(-18, 11, 22, 1, '#a07a50'); px(-12, 4, 18, 7, '#8a8a92'); px(-12, 4, 18, 1, '#b4b4bc');
    const cx = 14, cy = 7, n = 6;
    px(cx - 6, cy - 6, 12, 12, '#1c1c2a');
    for (let i = 0; i < n; i++) {
      const a = (calmMotion ? 0 : t * 0.9) + i * Math.PI * 2 / n, r = 3.4 + (calmMotion ? 0 : Math.sin(t * 1.3 + i) * 0.8);
      px(cx + Math.cos(a) * r - 1, cy + Math.sin(a) * r - 1, 2, 2, COL[i % 5]);
    }
    px(cx - 0.5, cy - 0.5, 1, 1, '#ffffff');
  } else {
    px(-20, 1, 40, 14, '#1c1c2a');
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3 + (calmMotion ? 0 : t * 0.5);
      for (let j = 1; j <= 4; j++) { const r = j * 3.2; px(Math.cos(a) * r - 1, 8 + Math.sin(a) * r * 0.9 - 1, 2, 2, COL[(k + j) % 5]); }
    }
    px(-1, 7, 2, 2, '#ffffff');
  }
  ctx.globalAlpha = 1;
  roll.happyT = Math.max(roll.happyT, 0.3);
  if (!m.said && age > 600 && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(m.cur.say, 2800, 'happy'); m.said = true; }
  m.drawn++; dirty = true;
}


const chasetsu = { cur: null, t0: 0, chk: 0, said: false, done: false, drawn: 0 };
function chasetsuStep(hx, by, u, now) {
  const c = chasetsu, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!window.NISHIO_CHASETSU || !still || gbOn || rp.x === null || roll.idle > 12 || jokamachi.cur || chatsumi.cur || mangekyo.cur || kawabe.cur) { c.cur = null; c.said = false; c.done = false; c.chk = 0; return; }
  const C = window.NISHIO_CHASETSU;
  if (!c.cur) {
    if (c.done || roll.idle < C.STILL || now < c.chk) return;
    c.chk = now + 2000;
    const f = kasaFind(), d = f ? C.pick(f, new Date().getMonth() + 1) : null;
    if (!d) return;
    c.cur = d; c.t0 = now; c.said = false;
    if (G.track) G.track('kome_chasetsu', { id: d.id });
  }
  const age = now - c.t0, t = calmMotion ? 0 : now / 1000, ate = age >= C.MILL + C.WHISK;
  const px = (cx, cy, cw, ch, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(hx + cx * u), Math.round(by + cy * u), Math.max(1, Math.round(cw * u)), Math.max(1, Math.round(ch * u))); };
  ctx.globalAlpha = Math.min(1, age / 400);
  if (age < C.MILL) {
    px(11, 9, 14, 4, '#8a8a86'); px(12, 5, 12, 4, '#b3b3ad'); px(12, 5, 12, 1, '#d6d6d0'); px(10, 13, 16, 1, '#6b6b66');
    const a = t * 5, hxp = 18 + Math.cos(a) * 4;
    px(hxp, 4, 2, 2, '#7a4422'); px(hxp + (hxp > 18 ? -3 : 1), 3, 1, 1, '#7a4422');
    for (let i = 0; i < 3; i++) { const ph = (t * 1.5 + i / 3) % 1; ctx.globalAlpha = Math.min(1, age / 400) * (1 - ph); px(10 + i * 0.5 - ph * 2, 10 + ph * 3, 1.5, 1.5, '#6fa85a'); }
  } else {
    drawNakama(Math.round(hx + 18 * u), Math.round(by + 8 * u), Math.max(1, Math.round(u * 0.9)), 'chawan', 0, true);
    if (!ate) { const w = Math.sin(now / 55) * 2.5; px(17 + w, -2, 1, 6, '#e6d3a3'); px(16 + w, 3, 3, 1, '#e6d3a3'); px(17 + w, -3, 1, 1, '#7a4422'); }
  }
  ctx.globalAlpha = 1;
  if (age >= C.MILL) roll.happyT = Math.max(roll.happyT, 0.3);
  if (ate && !c.said && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(c.cur.say, 2800, 'happy'); c.said = true; }
  if (ate && c.said && now - c.t0 > C.MILL + C.WHISK + 3500) { c.cur = null; c.done = true; return; }
  c.drawn++; dirty = true;
}


const GOCHISO_MS = 6500;
const gochiso = { cur: null, last: '', next: 0, t0: 0, drawn: 0 };
function gochisoMunch(now) {
  const age = now - gochiso.t0;
  return !gochiso.cur || calmMotion || age < 900 || age > GOCHISO_MS - 600 ? 0 : Math.abs(Math.sin(age / 150)) * 0.05;
}
function gochisoStep(hx, by, u, now) {
  const g = gochiso;
  const still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (g.cur && !still) { g.cur = null; return; }
  if (!g.cur) {
    if (!still || roll.idle < 1 || roll.idle > 5 || !window.NISHIO_GOCHISO || rp.x === null || mapCovered() || !howtoEl.hidden || sightBusy() || now < riceBub.until + 1500) return;
    if (!g.next) g.next = now + 2000;
    if (now < g.next) return;
    const d = window.NISHIO_GOCHISO.pick({ city: here.city, town: here.town, month: new Date().getMonth() + 1 }, g.last);
    if (!d) return;
    g.cur = d; g.last = d.id; g.t0 = now; g.next = now + 150000 + Math.random() * 90000;
    riceSay('いただきます', 1500, 'happy');
    if (G.track) G.track('kome_gochiso', { id: d.id });
  }
  const age = now - g.t0;
  if (age > GOCHISO_MS) {
    const d = g.cur; g.cur = null; roll.idle = 0;
    if (!mapCovered()) riceSay(d.say, 2400, 'happy');
    return;
  }
  if (age < GOCHISO_MS - 1500) roll.happyT = Math.max(roll.happyT, 0.3);
  const eat = Math.max(0, Math.min(1, (age - 900) / (GOCHISO_MS - 1500))), q = Math.max(1, Math.round(u * 0.9 * (1 - 0.75 * eat)));
  ctx.globalAlpha = Math.min(1, age / 400);
  drawNakama(Math.round(hx + 17 * u), Math.round(by + 13 * u - 4 * q), q, g.cur.id, 0);
  ctx.globalAlpha = 1;
  g.drawn++; dirty = true;
}


const OTEDAMA_MS = 1300;
const otedama = { cur: null, last: '', next: 0, prevH: 0, t0: 0, drawn: 0 };
function otedamaStart(now) {
  if (!window.NISHIO_OTEDAMA || !LU || rp.x === null) return false;
  const ll = toLatLng(rp.x, rp.y);
  let near = '';
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) near += luAt(ll.lat + a * LU.dLat, ll.lng + b * LU.dLng);
  const d = window.NISHIO_OTEDAMA.pick({ city: here.city, town: here.town, near, month: new Date().getMonth() + 1 }, otedama.last);
  if (!d) return false;
  otedama.cur = d; otedama.last = d.id; otedama.t0 = now;
  if (G.track) G.track('kome_otedama', { id: d.id });
  return true;
}
function otedamaStep(hx, by, u, now) {
  const o = otedama, up = roll.h > 0 && o.prevH <= 0;
  o.prevH = roll.h;
  if (worldMode || driving || rp.x === null) { o.cur = null; return; }
  if (!o.cur) {
    if (firstWalk()) return;
    if (!up || mapCovered() || !howtoEl.hidden || sightBusy() || now < riceBub.until) return;
    if (!o.next) o.next = now;
    if (now < o.next || !otedamaStart(now)) return;
    o.next = now + 30000 + Math.random() * 20000;
  }
  const age = now - o.t0, s = age / OTEDAMA_MS;
  if (s >= 1) {
    const d = o.cur; o.cur = null;
    if (!mapCovered()) riceSay(d.say, 1800, 'happy');
    return;
  }
  const rise = (calmMotion ? 0.5 : 4 * s * (1 - s)) * 9 * u, q = Math.max(1, Math.round(u * 0.8));
  ctx.globalAlpha = Math.min(1, age / 150);
  drawNakama(Math.round(hx), Math.round(by - 12.5 * u - rise), q, o.cur.id, calmMotion ? 0 : s * Math.PI * 4);
  ctx.globalAlpha = 1;
  o.drawn++; dirty = true;
}


const kasa = { cur: null, last: '', said: false, chk: 0, drawn: 0 };
function kasaFind() {
  if (!window.NISHIO_KASA || !LU || rp.x === null) return null;
  const ll = toLatLng(rp.x, rp.y);
  let near = '';
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) near += luAt(ll.lat + a * LU.dLat, ll.lng + b * LU.dLng);
  return { near, land: luAt(ll.lat, ll.lng), city: here.city, town: here.town };
}
function kasaStep(hx, by, u, now) {
  const k = kasa, rain = wxKind() === 'rain' && !worldMode && !driving && rp.x !== null;
  if (!rain) {
    if (k.cur && wxKind() !== 'rain' && !worldMode && !driving && k.said && !mapCovered()) riceSay(window.NISHIO_KASA.END, 1800, 'happy');
    k.cur = null; k.said = false; k.chk = 0;
    return;
  }
  if (now >= k.chk) {
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


const kiri = { cur: null, t0: 0, chk: 0, said: false, drawn: 0 };
function kiriHour() {
  const q = new URLSearchParams(location.search).get('kiri');
  if (q) return +q;
  return new Date(Date.now() + 9 * 3600000).getUTCHours();
}
function kiriStep(hx, by, u, now) {
  const k = kiri, K = window.NISHIO_KIRI, on = K && !worldMode && !driving && rp.x !== null && K.morning(kiriHour());
  if (!on) {
    if (k.cur && k.said && K && !worldMode && !driving && !mapCovered()) riceSay(k.cur.end, 1800, 'happy');
    k.cur = null; k.said = false; k.chk = 0;
    return;
  }
  if (now >= k.chk) {
    k.chk = now + K.EVERY;
    const c = kasaFind(), d = c ? K.pick(c) : null;
    if (d && !k.cur) {
      k.cur = d; k.t0 = now; k.said = false;
      if (G.track) G.track('kome_kiri', { id: d.id });
    } else if (!d && k.cur) {
      if (k.said && !mapCovered()) riceSay(k.cur.end, 1800, 'happy');
      k.cur = null; k.said = false;
    } else if (d) k.cur = d;
    if (k.cur && !k.said && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(k.cur.say, 2800, 'happy'); k.said = true; }
  }
  if (!k.cur) return;
  const t = calmMotion ? 0 : now / 1000, fade = Math.min(1, (now - k.t0) / 1500);
  for (let i = 0; i < 6; i++) {
    const x = hx + (((i * 9 + t * 3) % 54) - 27) * u, y = by + (i % 3 - 1) * 5 * u + 3 * u, w = (14 + (i % 2) * 6) * u, h = 3.2 * u;
    ctx.globalAlpha = fade * 0.28;
    ctx.fillStyle = '#f2f6f8';
    ctx.fillRect(Math.round(x - w / 2), Math.round(y - h / 2), Math.round(w), Math.max(1, Math.round(h)));
  }
  ctx.globalAlpha = 1;
  k.drawn++; dirty = true;
}


const meguri = { items: [], key: '', said: false, chk: 0, t0: 0, drawn: 0 };
function meguriStep(hx, by, u, now) {
  const m = meguri, night = window.NISHIO_MEGURI && nightOn && !worldMode && !driving && rp.x !== null && nightLevel() >= 1;
  if (!night) {
    if (m.said && window.NISHIO_MEGURI && nightLevel() < 1 && !worldMode && !driving && !mapCovered()) riceSay(window.NISHIO_MEGURI.END, 1800, 'happy');
    m.items = []; m.key = ''; m.said = false; m.chk = 0;
    return;
  }
  if (now >= m.chk) {
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
  if (!n || chochinyoru.cur) return;
  const q = Math.max(1, Math.round(u * 0.7)), spin = calmMotion ? 0 : now / 3200, fade = Math.min(1, (now - m.t0) / 800);
  const pos = m.items.map((it, i) => { const a = spin + i * Math.PI * 2 / n; return { it, x: Math.cos(a) * 19 * u, y: Math.sin(a) * 6 * u, z: Math.sin(a) }; }).sort((a, b) => a.z - b.z);
  for (const p of pos) {
    ctx.globalAlpha = fade * (p.z < 0 ? 0.55 : 1);
    drawNakama(Math.round(hx + p.x), Math.round(by + 2 * u + p.y), p.z < 0 ? Math.max(1, q - 1) : q, p.it.id, 0);
  }
  ctx.globalAlpha = 1;
  m.drawn++; dirty = true;
}


const tsun = { cur: null, last: '', t0: 0, lock: 0, drawn: 0 };
function tsunTap(now) {
  if (!window.NISHIO_TSUN || !LU || rp.x === null || worldMode || driving || now < tsun.lock) return false;
  const ll = toLatLng(rp.x, rp.y);
  let near = '';
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) near += luAt(ll.lat + a * LU.dLat, ll.lng + b * LU.dLng);
  const d = window.NISHIO_TSUN.next({ city: here.city, town: here.town, near, month: new Date().getMonth() + 1 }, tsun.last);
  if (!d) return false;
  tsun.cur = d; tsun.last = d.id; tsun.t0 = now; tsun.lock = now + 900;
  if (roll.h <= 0) { roll.hv = 2; roll.h = 0.001; }
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
  const rise = (calmMotion ? 0.4 : Math.sqrt(s)) * 10 * u, q = Math.max(1, Math.round(u * 0.9));
  ctx.globalAlpha = Math.min(1, age / 120) * (s > 0.75 ? (1 - s) * 4 : 1);
  drawNakama(Math.round(hx), Math.round(by - 13 * u - rise), q, t.cur.id, calmMotion ? 0 : Math.sin(age / 140) * 0.25);
  ctx.globalAlpha = 1;
  t.drawn++; dirty = true;
}



const NAZO_KEY = 'nsg_nazonazo';
const nazo = { cur: null, flip: false, seen: null, next: 0, t0: 0, btn: null, drawn: 0 };
function nazoStep(hx, by, u, now) {
  nazo.cur = null; nazo.btn = null; return;
  const n = nazo, N = window.NISHIO_NAZONAZO, still = !worldMode && !driving && roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2;
  if (!N || !still || gbOn || rp.x === null || roll.idle > N.SHOW || mapCovered()) { n.cur = null; n.btn = null; return; }
  if (!n.cur) {
    if (roll.idle < N.STILL || !howtoEl.hidden || sightBusy() || now < riceBub.until || gochiso.cur || tsun.cur) return;
    if (!n.next) n.next = now + N.FIRST;
    if (now < n.next) return;
    if (!n.seen) { try { n.seen = JSON.parse(localStorage.getItem(NAZO_KEY)) || []; } catch (e) { n.seen = []; } }
    const r = N.pick({ city: here.city, town: here.town }, n.seen);
    if (!r) { n.next = now + 10000; return; }
    n.cur = r.item; n.flip = r.flip; n.t0 = now; n.seen = r.seen;
    try { localStorage.setItem(NAZO_KEY, JSON.stringify(r.seen)); } catch (e) {  }
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
function nazoTap(x, y, now) {
  return false;
  const n = nazo, N = window.NISHIO_NAZONAZO;
  if (!N || !n.cur || !n.btn) return false;
  const side = n.btn.findIndex(b => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]);
  if (side < 0) return false;
  const ok = N.judge(n.flip, side), d = n.cur;
  n.cur = null; n.btn = null; n.next = now + N.GAP[0] + Math.random() * N.GAP[1];
  roll.idle = 0;
  if (ok) { roll.hv = 2; roll.h = 0.001; }
  riceSay(ok ? d.yes : d.no, 3600, ok ? 'happy' : '');
  if (G.track) G.track('kome_nazonazo', { id: d.id, step: ok ? 'yes' : 'no' });
  return true;
}


const youkoso = { area: null, cur: null, last: '', t0: 0, next: 0, drawn: 0 };
function youkosoStep(hx, by, u, now) {
  const y = youkoso, Y = window.NISHIO_YOUKOSO;
  if (!Y || worldMode || driving || rp.x === null) { y.cur = null; return; }
  const inCity = /西尾/.test(here.city || ''), a = !inCity ? '' : Y.areaOf(here.city, here.town);
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
  ctx.fillStyle = '#2b1a0c'; ctx.fillRect(poleX - q, top - q, 2 * q + q, foot - top + q);
  ctx.fillStyle = '#8a5a2b'; ctx.fillRect(poleX, top, q, foot - top);
  if (rise >= 1) {
    const fx = poleX + q, fy = top + q, fw = cw + Math.round(wave);
    ctx.fillStyle = '#2b1a0c'; ctx.fillRect(fx - q, fy - q, fw + 2 * q, ch + 2 * q);
    ctx.fillStyle = '#fffdf3'; ctx.fillRect(fx, fy, fw, ch);
    drawNakama(Math.round(fx + fw / 2), Math.round(fy + ch / 2), Math.max(1, Math.round(u * 0.6)), y.cur.id, 0, true);
  }
  ctx.restore();
  y.drawn++; dirty = true;
}



const shirushi = { list: null, pop: '', t0: 0, say: null, drawn: 0 };
function shirushiStep(hx, by, u, now, asleep) {
  const s = shirushi, S = window.NISHIO_SHIRUSHI, Y = window.NISHIO_YOUKOSO;
  if (!S || !Y || worldMode || driving || rp.x === null) return;
  if (!s.list) { try { s.list = S.clean(JSON.parse(localStorage.getItem(S.KEY))); } catch (e) { s.list = []; } }
  if (/西尾/.test(here.city || '')) {
    const a = Y.areaOf(here.city, here.town), r = a ? S.add(s.list, a) : null;
    if (r && r.added) {
      s.list = r.list; s.pop = a; s.t0 = now;
      try { localStorage.setItem(S.KEY, JSON.stringify(s.list)); } catch (e) {  }
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
    ctx.fillStyle = '#2b1a0c'; ctx.fillRect(px - q, top - q, 2 * q, foot - top + q);
    ctx.fillStyle = '#8a5a2b'; ctx.fillRect(px - q + Math.round(q / 2), top, Math.max(1, q - 1), foot - top);
    if (pop < 0.5) return;
    const fx = px + q, fy = top + q;
    ctx.fillStyle = '#2b1a0c'; ctx.fillRect(fx - q, fy - q, fw + 2 * q, fh + 2 * q);
    ctx.fillStyle = a.color; ctx.fillRect(fx, fy, fw, fh);
    drawNakama(Math.round(fx + fw / 2), Math.round(fy + fh / 2), Math.max(1, Math.round(u * 0.3)), a.emblem, 0, true);
  });
  s.drawn++; dirty = true;
}


const monosashi = { total: null, lastD: null, last: 0, saved: 0, show: 0, pop: 0, say: null, drawn: 0 };
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
    if (now - m.saved > 5000 || r.born > 0) { m.saved = now; try { localStorage.setItem(M.KEY, String(Math.round(m.total * 10) / 10)); } catch (e) {  } }
  }
  if (m.say && now >= m.say[0] && !mapCovered() && howtoEl.hidden && now >= riceBub.until) { riceSay(m.say[1], 3000, 'happy'); m.say = null; }
  if (gbOn || asleep || now > m.show || !m.total) return;
  const g = M.gauge(m.total), q = Math.max(1, Math.round(u * 0.35)), w = Math.round(13 * u), h = Math.round(4 * u), x0 = Math.round(hx - 15 * u - w), foot = Math.round(by + 8 * u);
  const lit = m.pop && now - m.pop < M.POP ? Math.sin((now - m.pop) / M.POP * Math.PI * 3) > 0 : false;
  ctx.globalAlpha = Math.min(1, (m.show - now) / 400);
  ctx.fillStyle = '#2b1a0c'; ctx.fillRect(x0 - q, foot - h - q, w + 2 * q, h + 2 * q);
  ctx.fillStyle = '#c9b48a'; ctx.fillRect(x0, foot - h, w, h);
  ctx.fillStyle = lit ? '#fff3a0' : '#e0b030'; ctx.fillRect(x0, foot - h, Math.round(w * (m.pop && now - m.pop < M.POP ? 1 : g.frac)), h);
  ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(3.4 * u)}px "DotGothic16", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(g.n ? '堤' + g.n + '本' : '堤', x0 + w / 2, foot - h - 2 * q);
  ctx.globalAlpha = 1;
  m.drawn++; dirty = true;
}


const okaeri = { prev: null, saved: 0, done: false, cur: null, t0: 0, drawn: 0 };
function okaeriStep(hx, by, u, now, asleep) {
  const o = okaeri, K = window.NISHIO_OKAERI, Y = window.NISHIO_YOUKOSO, S = window.NISHIO_SHIRUSHI;
  if (!K || !Y || !S || worldMode || driving || rp.x === null) return;
  const wall = Date.now();
  if (o.prev === null) { try { o.prev = K.clean(JSON.parse(localStorage.getItem(K.KEY))); } catch (e) { o.prev = 0; } }
  if (now - o.saved > K.SAVE) { o.saved = now; try { localStorage.setItem(K.KEY, String(wall)); } catch (e) {  } }
  if (!o.done && /西尾/.test(here.city || '')) {
    const a = Y.areaOf(here.city, here.town), n = K.days(o.prev, wall);
    if (!n) { if (a) o.done = true; }
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


const furusato = { out0: 0, shown0: 0, last: -1e9, cur: null, said: false, drawn: 0 };
function furusatoStep(hx, by, u, now, asleep) {
  const f = furusato, K = window.NISHIO_FURUSATO;
  if (!K || worldMode || driving || rp.x === null || !K.outside(here.city)) {
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
  if (n) f.cur.ang = n.ang;
  const a = f.cur.ang, r = 17 * u, bob = calmMotion ? 0 : Math.sin(now / 320) * 1.2 * u;
  const cx = Math.round(hx + Math.cos(a) * r), cy = Math.round(by + Math.sin(a) * r * 0.8 + bob);
  const fade = Math.min(1, (now - f.shown0) / 500, (K.SHOW - (now - f.shown0)) / 800);
  ctx.globalAlpha = Math.max(0, fade);
  const q = Math.max(1, Math.round(u * 0.5)), tip = [cx + Math.cos(a) * 5 * u, cy + Math.sin(a) * 5 * u], nx = -Math.sin(a), ny = Math.cos(a);
  ctx.fillStyle = '#2b1a0c';
  for (const [grow, col] of [[q, '#2b1a0c'], [0, '#e0b030']]) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(tip[0] + Math.cos(a) * grow, tip[1] + Math.sin(a) * grow);
    ctx.lineTo(cx + nx * (3 * u + grow), cy + ny * (3 * u + grow));
    ctx.lineTo(cx - nx * (3 * u + grow), cy - ny * (3 * u + grow));
    ctx.closePath(); ctx.fill();
  }
  drawNakama(Math.round(cx - Math.cos(a) * 5 * u), Math.round(cy - Math.sin(a) * 5 * u), Math.max(1, Math.round(u * 0.9)), f.cur.item.id, 0, false);
  ctx.globalAlpha = 1;
  f.drawn++; dirty = true;
}


const kage = { cur: null, last: '', still0: 0, t0: 0, chk: 0, said: false, drawn: 0, pics: {} };
function kagePic(id, q) {
  const key = id + q;
  if (kage.pics[key]) return kage.pics[key];
  const c = document.createElement('canvas'); c.width = c.height = 16 * q;
  const k = ctx, g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  ctx = g;
  try { drawNakama(8 * q, 8 * q, q, id, 0, true); } finally { ctx = k; }
  g.globalCompositeOperation = 'source-in'; g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  return (kage.pics[key] = c);
}
function kageDraw(hx, sy, shw, u, now, still) {
  const k = kage;
  if (!window.NISHIO_KAGE || !still || gbOn || worldMode || driving || rp.x === null || nightLevel() >= 1 || roll.idle > 12) { k.cur = null; k.still0 = 0; k.said = false; return; }
  if (!k.still0) k.still0 = now;
  if (now - k.still0 < window.NISHIO_KAGE.STILL) return;
  if (now >= k.chk) {
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
  const pic = kagePic(k.cur.id, q), dw = 16 * q * 1.3, dh = 16 * q * 0.38, grow = calmMotion ? 1 : Math.min(1, 0.3 + age / 700);
  ctx.globalAlpha = 0.26 * Math.max(0, fade);
  ctx.drawImage(pic, Math.round(hx + shw * 0.45), Math.round(sy - dh * 0.5), Math.round(dw * grow), Math.round(dh));
  ctx.globalAlpha = 1;
  k.drawn++; dirty = true;
}
function nakamaStep(now, ox, oy, T, w, h, dpr) {
  if (worldMode || driving || rp.x === null) { nakama.n = null; return; }
  const sp = Math.hypot(rp.vx || 0, rp.vy || 0);
  if (!nakama.n && now > otomo.next && sp > 1.5 && !mapCovered() && window.NISHIO_OTOMO && !firstWalk() && LU && howtoEl.hidden && !sightBusy() && now > riceBub.until + 2000) {
    if (!otomo.next) otomo.next = now + 6000;
    else {
      const ll = toLatLng(rp.x, rp.y);
      let near = '';
      for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) near += luAt(ll.lat + a * LU.dLat, ll.lng + b * LU.dLng);
      const o = window.NISHIO_OTOMO.pick({ city: here.city, town: here.town, near, month: new Date().getMonth() + 1 }, otomo.last);
      if (!o) otomo.next = now + 8000;
      else {
        otomo.next = now + 60000 + Math.random() * 40000; otomo.last = o.id; nakama.next = now + NAKAMA_CD;
        const bx = rp.vx >= 0 ? -1.5 : 1.5;
        nakama.n = { kind: o.id, x: rp.x + bx, y: rp.y, t0: now, last: now, ang: 0, stop: 0 };
        riceSay(o.say, 2400, 'happy');
        if (G.track) G.track('kome_otomo', { id: o.id });
      }
    }
  }
  if (!nakama.n && now > nakama.next && sp > 1.5 && !mapCovered() && nakamaKinds().length && ambN() < AMB_MAX) {
    const x = Math.floor(rp.x), y = Math.floor(rp.y), farm = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => [C.V, C.N, C.U].includes(codeAt(x + dx, y + dy)));
    if (farm) { nakama.next = now + NAKAMA_CD + Math.random() * NAKAMA_CD; nakama.n = { kind: nakamaKind(), x: x + 0.5 + farm[0], y: y + 0.5 + farm[1], t0: now, last: now, ang: 0, stop: 0 }; }
  }
  const n = nakama.n;
  if (!n) return;
  const dt = Math.min(0.1, (now - n.last) / 1000); n.last = now;
  if (n.stop) { if (now - n.stop > 700) { nakama.n = null; return; } }
  else if (now - n.t0 > NAKAMA_FOLLOW) n.stop = now;
  else {
    const dx = rp.x - n.x, dy = rp.y - n.y, d = Math.hypot(dx, dy), want = Math.max(0, d - 1.1), v = Math.min(6, want * 3);
    if (d > 0.01) { n.x += dx / d * v * dt; n.y += dy / d * v * dt; n.ang += (dx >= 0 ? 1 : -1) * v * dt / 0.45; }
  }
  const hop = n.stop ? Math.sin(Math.min(1, (now - n.stop) / 700) * Math.PI) * T * 0.5 : 0;
  ctx.globalAlpha = n.stop ? Math.max(0, 1 - (now - n.stop) / 700) : 1;
  { const X = Math.round(ox + n.x * T), Y = Math.round(oy + n.y * T - hop), u = Math.max(Math.round(2 * dpr), Math.round(T / 16)); if (!drawKoroArt(X, Y, u, n.kind, n.ang)) drawNakama(X, Y, u, n.kind, n.ang); }
  ctx.globalAlpha = 1;
  dirty = true;
}


const DEAI_STAY = 4200, DEAI_GO = 600;
const deai = { next: 0, last: '', d: null, drawn: 0 };
function deaiStep(now, ox, oy, T) {
  if (worldMode || driving || rp.x === null) { deai.d = null; return; }
  const sp = Math.hypot(rp.vx || 0, rp.vy || 0);
  if (!deai.d && now > deai.next && sp > 1.5 && !mapCovered() && window.NISHIO_DEAI && !firstWalk() && LU && howtoEl.hidden && !sightBusy() && !nakama.n && now > riceBub.until + 2500) {
    if (!deai.next) deai.next = now + 10000;
    else {
      const ll = toLatLng(rp.x, rp.y);
      let near = '';
      for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) near += luAt(ll.lat + a * LU.dLat, ll.lng + b * LU.dLng);
      const e = window.NISHIO_DEAI.pick({ city: here.city, town: here.town, land: luAt(ll.lat, ll.lng), near, month: new Date().getMonth() + 1 }, deai.last);
      if (!e) deai.next = now + 8000;
      else {
        deai.next = now + 80000 + Math.random() * 60000; deai.last = e.id;
        const m = sp || 1, fx = rp.vx / m, fy = rp.vy / m;
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
  const out = age > DEAI_STAY ? (age - DEAI_STAY) / DEAI_GO : 0;
  const hop = out ? Math.sin(out * Math.PI) * T * 0.7 : calmMotion ? 0 : Math.round(Math.max(0, Math.sin(age / 380)) * T * 0.12);
  ctx.globalAlpha = Math.min(1, age / 300) * (1 - out);
  ctx.drawImage(critterSprites[d.id], Math.round(ox + d.x * T - T / 2), Math.round(oy + d.y * T - T / 2 - hop), T, T);
  ctx.globalAlpha = 1;
  deai.drawn++; dirty = true;
}


const KOBORE_LIFE = 2200, KOBORE_MAX = 3;
const kobore = { list: [], next: 0, drawn: 0 };
function koboreStep(now, ox, oy, T, dpr) {
  if (worldMode || driving || rp.x === null || !window.NISHIO_KOBORE || !LU) { kobore.list.length = 0; return; }
  const sp = Math.hypot(rp.vx || 0, rp.vy || 0);
  if (now > kobore.next && sp > 1.5 && kobore.list.length < KOBORE_MAX && !mapCovered()) {
    kobore.next = now + 1400 + Math.random() * 1200;
    const ll = toLatLng(rp.x, rp.y);
    let near = '';
    for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) near += luAt(ll.lat + a * LU.dLat, ll.lng + b * LU.dLng);
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


const sentaku = { n: 0 };
function sentakuOn(wx = window.NISHIO_WEATHER && window.NISHIO_WEATHER.current) {
  if (wx && (wx.kind === 'rain' || wx.kind === 'snow')) return false;
  const hr = new Date(Date.now() + 9 * 3600000).getUTCHours();
  return hr >= 8 && hr < 16 && !(nightOn && nightLevel() > 0);
}
function drawSentaku(X, Y, p, now, seed) {
  const px = (x, y, w0, h0, c) => { ctx.fillStyle = c; ctx.fillRect(X + x * p, Y + y * p, w0 * p, h0 * p); };
  px(1, 3, 1, 11, '#6b5a48'); px(14, 3, 1, 11, '#6b5a48'); px(1, 4, 14, 1, '#e8e4dc');
  const items = [[3, ['#ffffff', '#d8dde6'], 3, 5], [7, ['#9cc8f0', '#6fa4d6'], 4, 4], [12, ['#f4b8c8', '#d890a6'], 2, 3]];
  items.forEach(([x, [c, sh], w0, h0], i) => {
    const sway = Math.round(Math.sin(now / 520 + i * 1.7 + seed) * 1);
    px(x, 5, w0, h0 - 1, c); px(x + sway, 5 + h0 - 1, w0, 1, sh);
    if (i === 1) { px(x - 1, 5, 1, 2, c); px(x + w0, 5, 1, 2, c); }
    px(x, 4, 1, 1, '#c8a040'); px(x + w0 - 1, 4, 1, 1, '#c8a040');
  });
}
function sentakuStep(now, ox, oy, T, w, h, dpr) {
  sentaku.n = 0;
  if (worldMode || driving || !sentakuOn()) return;
  const tx0 = Math.floor(-ox / T), ty0 = Math.floor(-oy / T), tx1 = Math.ceil((w - ox) / T), ty1 = Math.ceil((h - oy) / T), maze = mazeOn();
  for (let ty = ty0; ty <= ty1 && sentaku.n < 3; ty++) for (let tx = tx0; tx <= tx1 && sentaku.n < 3; tx++) {
    const c = codeAt(tx, ty);
    if (c !== C.Q && c !== C.T) continue;
    const hh = Math.imul(tx, 2246822519) ^ Math.imul(ty, 3266489917), u = (hh ^ (hh >>> 15)) >>> 0;
    if (u % 29) continue;
    if (rp.x !== null && Math.hypot(tx + 0.5 - rp.x, ty + 0.5 - rp.y) < 1.5) continue;
    if (maze) { const q = mzNear(tx + 0.5, ty + 0.5); if (!q || q.d < MZ_TUBE + MZ_HEDGE + 1.2) continue; }
    const p = Math.max(Math.round(1.5 * dpr), Math.round(T / 16));
    drawSentaku(Math.round(ox + (tx + 0.5) * T - 8 * p), Math.round(oy + (ty + 0.5) * T - 8 * p), p, now, u % 7);
    sentaku.n++;
  }
  if (sentaku.n) dirty = true;
}



const DONGURI_LIFE = 7000, DONGURI_CD = 25000;
const donguri = { d: null, next: 0 };
const donguriSeason = () => { const mo = new Date().getMonth() + 1; return mo === 10 || mo === 11; };
function drawDonguri(x, y, u, ang) {
  if (drawKoroArt(x, y, u, 'donguri', ang)) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  const px = (cx, cy, cw, ch, c) => { ctx.fillStyle = c; ctx.fillRect(cx * u, cy * u, cw * u, ch * u); };
  const parts = [[-2, -1, 4, 4, '#a8682e'], [-1, 3, 2, 1, '#a8682e'], [-3, -2, 6, 2, '#6b4a2a'], [-1, -3, 2, 1, '#6b4a2a'], [0, -4, 1, 1, '#4a321c']];
  for (const [cx, cy, cw, ch] of parts) px(cx - 1, cy - 1, cw + 2, ch + 2, '#2b1a0c');
  for (const [cx, cy, cw, ch, c] of parts) px(cx, cy, cw, ch, c);
  px(-2, -2, 1, 1, '#8a6440'); px(1, -2, 1, 1, '#8a6440');
  px(-1, 0, 1, 2, '#d39a5a');
  ctx.restore();
}
const donBlocked = (x, y) => { if (rollBlocked(x, y)) return true; if (!mazeOn()) return false; const q = mzNear(x, y); return !!q && q.d > MZ_TUBE - 0.15; };
function donguriStep(now, ox, oy, T, w, h, dpr) {
  if (worldMode || driving || rp.x === null || !donguriSeason()) { donguri.d = null; return; }
  const sp = Math.hypot(rp.vx || 0, rp.vy || 0);
  if (!donguri.d && now > donguri.next && sp > 1.2 && !mapCovered() && ambN() < AMB_MAX) {
    const x = Math.floor(rp.x), y = Math.floor(rp.y), tree = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => { const c = codeAt(x + dx, y + dy); return c === C.W || c === C.P; });
    if (tree) {
      donguri.next = now + DONGURI_CD + Math.random() * DONGURI_CD;
      const side = Math.random() < 0.5 ? -1 : 1, [tx, ty] = tree, sx = ty ? side : 0, sy = tx ? side : 0;

      const at = [[tx, ty], [sx, sy], [-sx, -sy], [tx + sx, ty + sy], [tx - sx, ty - sy]].map(([a, b]) => { const n = Math.hypot(a, b) || 1; return [rp.x + a / n * 0.8, rp.y + b / n * 0.8]; }).find(([a, b]) => !donBlocked(a, b));
      if (at) donguri.d = { x: at[0], y: at[1], vx: -tx * 0.6 + sx * 1.3, vy: -ty * 0.6 + sy * 1.3, t0: now, last: now, ang: 0 };
    }
  }
  const d = donguri.d;
  if (!d) return;
  const age = now - d.t0, dt = Math.min(0.1, (now - d.last) / 1000); d.last = now;
  if (age > DONGURI_LIFE) { donguri.d = null; return; }
  const fall = Math.max(0, 1 - age / 350);
  if (!fall) {
    const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt;
    if (donBlocked(nx, ny) || Math.hypot(nx - rp.x, ny - rp.y) < 0.7) { d.vx = d.vy = 0; } else {
      d.x = nx; d.y = ny; d.ang += Math.hypot(d.vx, d.vy) * dt / 0.18 * Math.sign(d.vx || d.vy || 1);
    }
    const k = Math.pow(0.25, dt); d.vx *= k; d.vy *= k;
    if (Math.hypot(d.vx, d.vy) < 0.25) { const r = Math.round(d.ang / (Math.PI * 2)) * Math.PI * 2; d.ang += (r - d.ang) * Math.min(1, dt * 6); }
    const ox2 = d.x - rp.x, oy2 = d.y - rp.y, od = Math.hypot(ox2, oy2);
    if (od < 0.7) {
      const a0 = od > 0.01 ? Math.atan2(oy2, ox2) : 0;
      for (const da of [0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
        const ux = Math.cos(a0 + da), uy = Math.sin(a0 + da), qx = rp.x + ux * 0.72, qy = rp.y + uy * 0.72;
        if (donBlocked(qx, qy)) continue;
        d.x = qx; d.y = qy; const v = Math.max(0.8, Math.hypot(rp.vx || 0, rp.vy || 0) * 0.5); d.vx = ux * v; d.vy = uy * v;
        break;
      }
    }
  }
  const hop = age < 350 ? fall * T * 0.9 : age < 650 ? Math.sin((age - 350) / 300 * Math.PI) * T * 0.2 : 0;
  ctx.globalAlpha = age > DONGURI_LIFE - 600 ? Math.max(0, (DONGURI_LIFE - age) / 600) : 1;
  drawDonguri(Math.round(ox + d.x * T), Math.round(oy + d.y * T - hop), Math.max(Math.round(2 * dpr), Math.round(T / 18)), d.ang);
  ctx.globalAlpha = 1;
  dirty = true;
}


const HAMON_MS = 900, HAMON_GAP = 350;
const hamon = { list: [], last: 0 };
const rollBloom = { list: [] };
const rollPath = { list: [] };
let rollLineT0 = 0;
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
  for (const r of hamon.list) {
    const k = (now - r.t0) / HAMON_MS, R = T * (0.2 + 0.75 * k), cx = ox + r.x * T, cy = oy + r.y * T, n = Math.max(8, Math.round(R * 2 * Math.PI / (u * 1.6)));
    ctx.globalAlpha = 0.95 * Math.pow(1 - k, 0.7); ctx.fillStyle = '#ffffff';
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; ctx.fillRect(Math.round(cx + Math.cos(a) * R - u / 2), Math.round(cy + Math.sin(a) * R * 0.6 - u / 2), u, u); }
  }
  ctx.globalAlpha = 1;
  dirty = true;
}
function kaeruStep(now, ox, oy, T, w, h, dpr) {
  if (worldMode || driving || rp.x === null) { kaeru.list.length = 0; return; }
  if (!kaeru.list.length && now > kaeru.next && kaeruSeason() && !mapCovered() && ambN() < AMB_MAX) {
    kaeru.next = now + 15000 + Math.random() * 15000;
    for (let k = 0; k < 16; k++) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 4, x = Math.floor(rp.x + Math.cos(a) * r), y = Math.floor(rp.y + Math.sin(a) * r);
      const sx = ox + x * T, sy = oy + y * T;
      if (sx < T || sy < T * 2 || sx > w - 2 * T || sy > h - 3 * T) continue;
      const paddy = (cx, cy) => PADDY_CODES.has(codeAt(cx, cy)), edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => !paddy(x + dx, y + dy));
      if (!paddy(x, y) || !edge) continue;
      const n = Math.random() < 0.6 ? 1 : 2;
      for (let i = 0; i < n; i++) kaeru.list.push({ x: x + 0.5 + edge[0] * 0.3 + (i ? -edge[1] * 0.6 : 0), y: y + 0.5 + edge[1] * 0.3 + (i ? edge[0] * 0.6 : 0), t0: now, jump: 0, dir: edge[0] ? -edge[0] : (Math.random() < 0.5 ? -1 : 1), into: [-edge[0], -edge[1]], seed: Math.random() * 3000 });
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
      if (jt > 0.45) { plop = true; return false; }
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
  if (!mushi.m && kind && now > mushi.next && !mapCovered() && ambN() < AMB_MAX) {
    mushi.next = now + 25000 + Math.random() * 25000;
    const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 3, x = rp.x + Math.cos(a) * r, y = rp.y + Math.sin(a) * r, sx = ox + x * T, sy = oy + y * T;
    if (sx > T && sy > T * 2 && sx < w - T && sy < h - 3 * T) mushi.m = { kind, x, y, vx: 0, vy: 0, t0: now, last: now, flee: 0, rest: 0, ph: Math.random() * 6 };
  }
  const m = mushi.m;
  if (!m) return;
  const dt = Math.min(0.1, (now - m.last) / 1000); m.last = now;
  const sp = Math.hypot(rp.vx || 0, rp.vy || 0), d = Math.hypot(m.x - rp.x, m.y - rp.y);
  if (!m.flee && (now - m.t0 > MUSHI_LIFE || (sp > 0.8 && d < MUSHI_NEAR))) { m.flee = now; const k = d || 1; m.vx = (m.x - rp.x) / k * 5; m.vy = (m.y - rp.y) / k * 5 - 2; }
  if (m.flee) { if (now - m.flee > 1500) { mushi.m = null; return; } }
  else if (now < m.rest) { m.vx *= 0.8; m.vy *= 0.8; }
  else {
    const t = (now - m.t0) / 1000 + m.ph, tx = rp.x + Math.cos(t * 0.5) * 3.5, ty = rp.y - 1.5 + Math.sin(t * 0.7) * 2;
    m.vx += ((tx - m.x) * 0.6 - m.vx) * dt * 2; m.vy += ((ty - m.y) * 0.6 - m.vy) * dt * 2 + Math.sin(t * 6) * dt * (m.kind === 'chocho' ? 3 : 0.6);
    if (Math.random() < dt * 0.25) m.rest = now + 600 + Math.random() * 900;
  }
  m.x += m.vx * dt; m.y += m.vy * dt;
  drawMushi(Math.round(ox + m.x * T), Math.round(oy + m.y * T), Math.max(Math.round(2 * dpr), Math.round(T / 16)), m.kind, now, m.vx >= 0 ? 1 : -1);
  dirty = true;
}
function suzumeVisit(now) {
  const side = Math.random() < 0.5 ? -1 : 1, n = Math.random() < 0.5 ? 1 : 2;
  suzume.list.length = 0;
  for (let i = 0; i < n; i++) suzume.list.push({ x: rp.x + side * (1.1 + i * 0.7), y: rp.y + 0.25 + i * 0.15, t0: now + i * 400, fly: 0, dir: -side, seed: Math.random() * 1000, v: true });
}
function suzumeStep(now, ox, oy, T, w, h, dpr) {
  if (worldMode || driving || rp.x === null) { suzume.list.length = 0; return; }
  if (!suzume.list.length && roll.kind === 'stop' && roll.idle > SUZUME_VISIT && now > suzume.visit && !mapCovered()) { suzume.visit = now + 30000; suzumeVisit(now); }
  if (!suzume.list.length && now > suzume.next && !mapCovered() && ambN() < AMB_MAX) {
    suzume.next = now + (ambFirstRetry(now, suzume.met) ? 3500 + Math.random() * 2500 : 9000 + Math.random() * 9000);
    const suzumeWasMet = suzume.met;
    for (let k = 0; k < 14; k++) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 4, x = Math.floor(rp.x + Math.cos(a) * r), y = Math.floor(rp.y + Math.sin(a) * r);
      const sx = ox + x * T, sy = oy + y * T;
      if (sx < T || sy < T * 2 || sx > w - 2 * T || sy > h - 3 * T) continue;
      const q = mazeOn() && mzNear(x + 0.5, y + 0.5);
      const c = codeAt(x, y), ground = ![C.B, C.A, C.W, C.Q, C.I, C.N, C.X].includes(c);
      if (mazeOn() ? q && q.d > 1.15 && q.d < 1.9 && ground : SUZUME_AT().includes(c)) { suzumeSpawn(x, y, now); if (!suzumeWasMet) suzume.next = now + 9000 + Math.random() * 9000; break; }
    }
  }
  if (!suzume.list.length) return;
  const u = Math.max(Math.round(2 * dpr), Math.round(T / 16)), sp = Math.hypot(rp.vx || 0, rp.vy || 0);
  let chirp = false;
  suzume.list = suzume.list.filter(b => {
    if (now < b.t0) return true;
    const age = now - b.t0, peck = Math.floor((age + b.seed) / 450) % 3 === 0;
    if (!b.fly && ((age > SUZUME_LIFE && !(b.v && roll.kind === 'stop')) || (sp > 0.8 && Math.hypot(b.x - rp.x, b.y - rp.y) < SUZUME_NEAR))) {
      suzume.list.forEach((o, i) => { if (!o.fly) { o.fly = now + i * 90; o.dir = o.x < rp.x ? -1 : 1; } }); chirp = true;
    }
    let X = ox + b.x * T, Y = oy + b.y * T, pose = peck ? 1 : 0;
    if (b.fly) { const ft = Math.max(0, now - b.fly) / 1000; if (ft > 1.2) return false; X += b.dir * ft * T * 4; Y -= ft * T * 3 + ft * ft * T * 2; pose = Math.floor(ft * 12) % 2 ? 1 : 2; }
    drawSuzume(Math.round(X), Math.round(Y), u, b.dir, pose);
    return true;
  });
  if (chirp) chunSound();
  dirty = true;
}
const CRITTER_SURE = 100, CRITTER_FIRST_STEPS = 3, CRITTER_SOON_STEPS = 5, CRITTER_SOON_MS = 60000;





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



const RING8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
function alleyEnd(x, y) {
  if (codeAt(x, y) !== C.R) return false;
  const on = [];
  for (const [dx, dy] of RING8) { const c = codeAt(x + dx, y + dy); if (c === C.X) return false; on.push(c === C.R || c === C.H || c === C.D); }
  const n = on.filter(Boolean).length, groups = on.filter((v, i) => v && !on[(i + 7) % 8]).length;
  return n >= 1 && n <= 2 && groups === 1;
}


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
  if (where) critterS.steps++;
  if (where !== critterS.where && (!where || critterCount(where))) critterS.where = where;



  if (!where || critterS.steps < CRITTER_FIRST_STEPS) return;
  const sure = critterS.steps >= CRITTER_SURE || !!(G.critterFirst && G.critterFirst());
  const soon = !critterS.metNow && critterS.steps >= CRITTER_SOON_STEPS && performance.now() < CRITTER_SOON_MS;
  const earlyOnly = critterS.steps < CRITTER_SURE && (soon || sure) && firstWalk();
  if (earlyOnly && (critterS.steps < 25 || Math.random() >= 1 / 40)) return;
  if (!sure && !soon && (critterS.steps < 25 || Math.random() >= 1 / 40)) return;
  if ((sure || soon) && (mapCovered() || sightBusy())) return;
  critterS.steps = 0;
  critterS.metNow = true;
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

const npcTileCache = new Map();
function npcTile(n) {
  const key = `${n.id}:${n.lat}:${n.lng}`, c = npcTileCache.get(key);
  if (c && c.ok) return c;
  const p = toTile(n.lat, n.lng), x0 = Math.floor(p.x), y0 = Math.floor(p.y);
  const code = codeAt(x0, y0);
  if (code === C.X) return { x: x0, y: y0, ok: false };
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


const MZ_NPC_HIT = 1.2;
function mzNpcNear(x, y) {
  let best = null, bd = MZ_NPC_HIT;
  for (const n of G.npcs || []) { const t = npcTile(n), d = Math.hypot(x - t.x - 0.5, y - t.y - 0.5); if (d < bd) { bd = d; best = n; } }
  return best;
}

const npcEmotes = new Map();
const EMOTE_PIX = { '!': ['..#..', '..#..', '..#..', '.....', '..#..'], '♪': ['...##', '..#.#', '..#..', '.##..', '.##..'], '♥': ['.#.#.', '#####', '#####', '.###.', '..#..'] };
function emoteAt(sx, sy, T, k, age) {
  const u = Math.max(1, Math.round(T / 16)), bx = sx + Math.round(T * 0.5), by = sy - Math.round(T * 0.55) - Math.round(Math.min(1, age / 150) * 3 * u) + (Math.floor(age / 300) % 2 ? u : 0);
  ctx.fillStyle = '#000'; ctx.fillRect(bx - u, by - u, 9 * u, 9 * u);
  ctx.fillStyle = '#fff'; ctx.fillRect(bx, by, 7 * u, 7 * u); ctx.fillRect(bx + u, by + 7 * u, 2 * u, 2 * u);
  ctx.fillStyle = k === '♥' ? '#e0405a' : '#222';
  EMOTE_PIX[k].forEach((row, y) => { for (let x = 0; x < 5; x++) if (row[x] === '#') ctx.fillRect(bx + (x + 1) * u, by + (y + 1) * u, u, u); });
  dirty = true;
}



let nightOn = true;
try { nightOn = localStorage.getItem('nsg_night') !== '0'; } catch (e) {  }
const nightCv = document.createElement('canvas');
let nightForce = null;
const nightLamps = { n: 0, warm: 0 };
function nightLevel(t = Date.now()) {
  const q = new URLSearchParams(location.search).get('night');
  if (q) return +q;
  if (nightForce !== null) return nightForce;
  const hr = new Date(t + 9 * 3600000).getUTCHours();
  return hr >= 19 || hr < 5 ? 1 : hr === 18 || hr === 5 ? 0.5 : 0;
}


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

const START_NIGHT_MS = 90000;
function nightStartK(ms) {
  if (!(ms > 0) || ms < 60000) return 0.3;
  return ms >= START_NIGHT_MS ? 1 : 0.3 + 0.7 * (ms - 60000) / (START_NIGHT_MS - 60000);
}
let nightK = null;
let nightBase = null;
function drawNight(w, h, ox, oy, T, cy, pois, now) {
  const lv = nightOn && !worldMode ? nightLevel() : 0;
  if (!lv) { nightLamps.n = nightLamps.warm = nightLamps.lit = nightLamps.vis = 0; return; }
  if (nightBase === null) nightBase = now;
  const sk = nightStartK(now - nightBase), lve = lv * sk;
  nightK = sk;
  if (nightCv.width !== w || nightCv.height !== h) { nightCv.width = w; nightCv.height = h; }
  const x = nightCv.getContext('2d');
  x.globalCompositeOperation = 'source-over';
  x.clearRect(0, 0, w, h);
  x.fillStyle = `rgba(8,12,36,${0.62 * lve})`; x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = 'destination-out';
  const light = (px, py, r, k = 1) => {
    if (px < -r || py < -r || px > w + r || py > h + r) return;
    const g = x.createRadialGradient(px, py, r * 0.25, px, py, r);
    g.addColorStop(0, `rgba(0,0,0,${k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
  };
  const flick = (1 + Math.sin(now / 180) * 0.03) * (1 + 0.6 * (1 - sk));
  if (G.me || G.demo) light(w / 2 + heroScr.x, cy + heroScr.y - T * 0.25, T * 3.4 * flick);
  for (const p of pois) light(ox + p[0] * T, oy + p[1] * T - T * 0.5, T * (p[4] === 'lm' ? 1.6 : 1.3), 0.85);
  for (const s of G.spots || []) if (s.shop) { const p = toTile(s.lat, s.lng); light(ox + p.x * T, oy + p.y * T - T, T * 3.2); }
  for (const c of G.liveChests()) { const p = toTile(c.lat, c.lng); light(ox + p.x * T, oy + p.y * T, T * 0.9, 0.7); }


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
      g.addColorStop(0, `rgba(255,170,70,${a * lve})`); g.addColorStop(1, 'rgba(255,170,70,0)');
      ctx.fillStyle = g; ctx.fillRect(px - r, py - r, r * 2, r * 2); return 1;
    };
    let n = 0;
    for (const p of pois) n += warm(ox + p[0] * T, oy + p[1] * T - T * 0.5, T * 1.1, 0.3);
    const u = Math.max(1, Math.round(T / 16));
    let lit = 0, vis = 0;
    for (const [lx, ly] of lamps) { const r = T * 1.1, k = warm(lx, ly, r, 0.34); n += k; lit += k; if (!(lx < -r || ly < -r || lx > w + r || ly > h + r)) vis++; ctx.fillStyle = '#ffe7a8'; ctx.fillRect(Math.round(lx - u), Math.round(ly - u), u * 2, u * 2); }
    nightLamps.warm = n; nightLamps.lit = lit; nightLamps.vis = vis;
  }
  nightLamps.n = lamps.length;
  gbPause--;
}

let npcSend = null;

function openNpc(n, tapped) {
  const first = !G.npcMet(n.id);
  const r = G.talkNpc(n.id);
  if (!r) return;
  const gs = G.state.guide;
  npcSend = rollOn && G.demo && gs && gs.byId === n.id && Date.now() - (gs.t || 0) < 3000 ? { n, name: gs.name } : null;
  npcEmotes.set(n.id, { t: performance.now(), k: first ? '!' : (n.id.length + G.state.met.length) % 2 ? '♪' : '♥' });
  if (!tapped) { npcSend = null; return; }
  $('pxInfoBody').innerHTML = r.html; $('pxInfo').hidden = false;
}



const SIGHT = 4, SIGHT_WAIT = 650, SIGHT_STEP = 150;
const sight = { n: null, t: 0, from: null, to: null, len: 0, opened: false, seen: new Set() };
function sightCheck() {
  if (sightBusy() || driving || worldMode || !$('pxInfo').hidden || (!G.demo && !G.me) || document.body.classList.contains('jump-open') || medashiShown()) return false;
  const t = targetTile(), hx = Math.floor(t.x), hy = Math.floor(t.y);
  for (const n of G.npcs || []) {
    if (G.npcMet(n.id) || sight.seen.has(n.id)) continue;
    const q = npcTile(n);
    if (!q.ok) continue;
    const dx = hx - q.x, dy = hy - q.y, d = Math.abs(dx) + Math.abs(dy);
    if ((dx && dy) || d < 2 || d > SIGHT) continue;
    const ux = Math.sign(dx), uy = Math.sign(dy);
    let clear = true;
    for (let i = 1; i < d && clear; i++) { const x = q.x + ux * i, y = q.y + uy * i; if (BLOCK.has(codeAt(x, y)) || npcAt(x, y)) clear = false; }
    if (!clear) continue;
    sight.seen.add(n.id);
    Object.assign(sight, { n, t: performance.now(), from: { x: q.x, y: q.y }, to: { x: hx - ux, y: hy - uy }, len: d - 1, opened: false });
    facing = dx ? (dx > 0 ? 'left' : 'right') : (dy > 0 ? 'up' : 'down');
    npcEmotes.set(n.id, { t: sight.t, k: '!' });
    tapWalkStop();
    G.sound.jingle('eye');
    dirty = true;
    return true;
  }
  return false;
}

function sightBusy() {
  if (sight.n && $('pxInfo').hidden && performance.now() - sight.t > SIGHT_WAIT + sight.len * SIGHT_STEP + 1500) sightEnd();
  return !!sight.n;
}
function sightEnd() { sight.n = null; G.callNpc(null); dirty = true; }

function sightTick(now) {
  if (!sight.n) return null;
  const k = Math.max(0, Math.min(1, (now - sight.t - SIGHT_WAIT) / (sight.len * SIGHT_STEP)));
  if (k >= 1 && !sight.opened) { sight.opened = true; G.callNpc(sight.n.id); if ($('pxInfo').hidden) { const h = targetTile(); npcGreet(sight.n, Math.floor(h.x), Math.floor(h.y)); } }
  else if (sight.opened && $('pxInfo').hidden) { sightEnd(); return null; }
  if (k < 1) dirty = true;
  return { x: sight.from.x + (sight.to.x - sight.from.x) * k, y: sight.from.y + (sight.to.y - sight.from.y) * k, walking: k > 0 && k < 1 };
}
const heroSprites = {};
for (const dir of ['down', 'up', 'right']) heroSprites[dir] = [sprite([...HERO_TOP, ...HERO[dir], ...LEGS_A]), sprite([...HERO_TOP, ...HERO[dir], ...LEGS_B])];
heroSprites.left = heroSprites.right.map((_, i) => sprite(mirror([...HERO_TOP, ...HERO.right, ...(i ? LEGS_B : LEGS_A)])));

const CAR_UP = ['................', '.....kkkkkk.....', '....kywwwwyk....', '...kgwwwwwwgk...', '..GkbbbbbbbbkG..', '..GkbBBBBBBbkG..', '...kwwwwwwwwk...', '...kggggggggk...',
  '...kgssssssgk...', '..GkgsNssNsgkG..', '..GkgssssssgkG..', '...kgsNssNsgk...', '...kgssssssgk...', '...kggggggggk...', '....krggggrk....', '.....kkkkkk.....'];
const rotCW = rows => rows.map((_, y) => rows.map((__, x) => rows[15 - x][y]).join(''));
const carSprites = { up: sprite(CAR_UP) };
carSprites.right = sprite(rotCW(CAR_UP)); carSprites.down = sprite(rotCW(rotCW(CAR_UP))); carSprites.left = sprite(rotCW(rotCW(rotCW(CAR_UP))));

const heroMarkerStyle = document.createElement('style');


const riceSprites = { right: [], left: [], down: [], up: [], ready: false };
const idleRoll = { last: performance.now(), on: false, key: '', skip: [], fails: [], guideKey: '' };
function idleTouch() { idleRoll.last = performance.now(); idleRoll.on = false; idleRoll.skip = []; idleRoll.fails = []; idleRoll.guideKey = ''; idleRoll.anchor = null; if (typeof mzRt !== 'undefined') mzRt.touched = true; }
document.addEventListener('pointerdown', idleTouch, true);
const roll = { d: 0, last: null, lastK: null, ang: 0, av: 0, side: 0, sq: 0, sqv: 0, sqx: false, shake: 0, dust: [], dustT: 0, kind: 'stop', wad: 0, spin: 0, sv: 0, pitch: 0, pv: 0, vert: false, h: 0, hv: 0, gnd: null, back: null, trail: [], fx: [], fxAcc: 0, fxN: 0, sendT: 0, sendA: 0, sends: 0, flat: 0, wetT: 0, jumpCd: 0, zg: null, jumps: 0, look: 0, dirt: 0, dirtCol: '150,120,80', v: 0, peak: 0, idle: 0, ouchT: 0, happyT: 0, spinT: 0, dizzyT: 0, carry: 0 };


(() => {
  const img = new Image();
  img.onload = () => {
    const N = img.height / 2;
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
    roll.back = cut(0, 0);
    const bx = roll.back.getContext('2d'), bd = bx.getImageData(0, 0, N, N), q = bd.data;
    for (let i = 0; i < q.length; i += 4) if (q[i + 3] && ((q[i] === 14 && q[i + 1] === 14 && q[i + 2] === 14) || (q[i] === 246 && q[i + 1] === 160 && q[i + 2] === 176))) { q[i] = 246; q[i + 1] = 245; q[i + 2] = 238; }
    bx.putImageData(bd, 0, 0);
    riceBallInit(cut(0, 0));
    riceSprites.ready = true; setHeroMarker(); dirty = true;
  };
  img.onerror = () => { riceSprites.failed = true; };
  img.src = 'nishio-go/art/rice.png';
})();


const riceBall = { fill: null, face: null, cv: null, x: null, gx: 0, gy: 0, a: 1, b: 1, nx: 0, ny: 0, nr: 0 };
const RB = 48;
const RICE_TONE = [[178, 182, 192], [208, 211, 219], [231, 232, 234], [246, 245, 239], [252, 251, 247], [255, 255, 255]];


const RICE_MILK = [236, 237, 236], RICE_CORE = [251, 250, 246];
function riceStreak(ex, ey) {
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
    if (!sd[i * 4 + 3] || (r === 26 && g === 26 && b === 26)) continue;
    fd.data.set([255, 255, 255, 255], i * 4);
    if ((r === 14 && g === 14 && b === 14) || (r === 246 && g === 160 && b === 176)) gd.data.set([r, g, b, 255], i * 4);
    const x = i % N, y = (i - x) / N;
    L = Math.min(L, x); R = Math.max(R, x); T = Math.min(T, y); B = Math.max(B, y);
  }
  fx.putImageData(fd, 0, 0); gx.putImageData(gd, 0, 0);
  const cv = document.createElement('canvas'); cv.width = cv.height = RB;
  {

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
  {
    const pts = [], fd2 = face.getContext('2d').getImageData(0, 0, N, N).data;
    let h = 2166136261;
    for (let tries = 0; tries < 400 && pts.length < 10; tries++) {
      h = Math.imul(h ^ (tries + 1), 16777619) >>> 0;
      const x = h % N, y = (h >>> 8) % N, i = y * N + x;
      if (!fd.data[i * 4 + 3] || fd2[i * 4 + 3]) continue;
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => fd.data[((y + b) * N + x + a) * 4 + 3])) continue;
      if (pts.some(p => Math.abs(p[0] - x) + Math.abs(p[1] - y) < 4)) continue;
      pts.push([x, y]);
    }
    riceBall.spots = pts;
  }
  Object.assign(riceBall, { fill, face, cv, x: cv.getContext('2d', { willReadFrequently: true }), gx: (L + R + 1) / 2, gy: (T + B + 1) / 2, a: (R - L + 1) / 2, b: (B - T + 1) / 2,
    nx: R + 1.5, ny: T + (B - T) * 0.2 + 0.5, nr: (R - L) * 0.26 });
}


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
  shine: 'W 0,0 7,0',
  shineBig: 'W 0,-1 7,-1',
};
const FACE_SET = {
  blink: 'shut cheeks smile', happy: 'arcUp cheeks open', excited: 'gtlt cheeksBig open', wow: 'big shineBig cheeks o', yawn: 'shut cheeks o',
  ouch: 'gtlt cheeks wave', dizzy: 'cross wave', sleepy: 'arcDown cheeks tiny',
};
let riceEyeAt = null;
function riceFaces(face, sd, N) {
  let ex = N, ey = N;
  for (let i = 0; i < N * N; i++) if (sd[i * 4 + 3] && sd[i * 4] === 14 && sd[i * 4 + 1] === 14 && sd[i * 4 + 2] === 14) { const x = i % N, y = (i - x) / N; if (y < ey || (y === ey && x < ex)) { ey = y; ex = x; } }
  riceEyeAt = (ex < N && ey < N) ? { x: ex, y: ey } : null;
  const out = { smile: face };
  {
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




const BLINK_MS = 3400, BLINK_SHUT_MS = 150;
const glanceShift = look => { const v = Math.round(Number(look) || 0); return v < -1 ? -1 : v > 1 ? 1 : v; };
const blinkOn = now => Number.isFinite(now) && now >= 0 && (now % BLINK_MS) < BLINK_SHUT_MS;
function riceMood(now) { return (!calmMotion && roll.kind === 'stop' && blinkOn(now)) ? 'blink' : happyFace() ? 'happy' : 'smile'; }

const riceAsleep = () => roll.kind === 'stop' && roll.idle > 12;
const happyFace = () => !calmMotion && roll.kind === 'stop' && roll.happyT > 0;
const asleepShut = () => !calmMotion && roll.kind === 'stop' && roll.idle > 12;
const riceBreath = now => Math.sin(now / 2600 * Math.PI * 2) * (roll.idle > 12 ? 0.03 : 0.018);


const BFLY = { open: ['kk...kk', 'kyk.kyk', 'kyybyyk', 'kyk.kyk', 'kk...kk'], shut: ['...k...', '..kyk..', '..kbk..', '..kyk..', '...k...'] }, BFLY_COL = { k: '#2a2a2a', y: '#ffe27a', b: '#5a4630' };

const TONBO = { open: ['....h....', 'gwwgRgwwg', '.ggwRwgg.', 'gwwgRgwwg', '.gg.R.gg.', '....R....'], shut: ['....h....', '..gwRwg..', '...gRg...', '..gwRwg..', '...gRg...', '....R....'] }, TONBO_COL = { h: '#5a1a14', R: '#d8402a', w: '#e4f2fb', g: '#6f8fa6' };
const bfly = { phase: '', t0: 0, x: 0, y: 0, drawn: 0 }, bflyCv = {};
const bflyIn = t => { const k = Math.min(1, t / 3), e = 1 - (1 - k) ** 2; return { dx: (1 - e) * 46 + Math.sin(t * 5) * 5 * (1 - e), dy: -(1 - e) * 40 + Math.cos(t * 4) * 3 * (1 - e), rest: k >= 1 }; };
function drawBfly(hx, by, u, now, sleepy) {
  if (calmMotion) { bfly.phase = ''; return; }
  if (sleepy && bfly.phase !== 'in' && bfly.phase !== 'rest') { bfly.phase = 'in'; bfly.t0 = now; bfly.kind = mushiKind() === 'tonbo' ? 'tonbo' : 'chocho'; }
  else if (!sleepy && (bfly.phase === 'in' || bfly.phase === 'rest')) { bfly.phase = 'out'; bfly.t0 = now; }
  if (!bfly.phase) return;
  const t = (now - bfly.t0) / 1000, hx0 = hx + 2 * u, hy0 = by - 12 * u;
  let x, y, flap;
  if (bfly.phase === 'out') {
    if (t > 1.6) { bfly.phase = ''; return; }
    x = bfly.x + t * 30 * u + Math.sin(t * 9) * 2 * u; y = bfly.y - t * 34 * u; flap = Math.floor(now / 90) % 2;
    ctx.globalAlpha = Math.max(0, 1 - t / 1.6);
  } else {
    const q = bflyIn(t); if (q.rest) bfly.phase = 'rest';
    x = hx0 + q.dx * u; y = hy0 + q.dy * u; bfly.x = x; bfly.y = y;
    flap = q.rest ? (bfly.kind === 'tonbo' ? 1 : now % 2600 < 700 ? Math.floor(now / 350) % 2 : 1) : Math.floor(now / (bfly.kind === 'tonbo' ? 60 : 110)) % 2;
  }
  const tb = bfly.kind === 'tonbo', SP = tb ? TONBO : BFLY, COL = tb ? TONBO_COL : BFLY_COL, pat = flap ? SP.open : SP.shut, W = pat[0].length, Hh = pat.length, q = Math.max(1, Math.round(u * 1.3));
  const key = (tb ? 't' : 'c') + (flap ? 'o' : 's') + q;
  let cv = bflyCv[key];
  if (!cv) {
    cv = bflyCv[key] = document.createElement('canvas'); cv.width = W * q; cv.height = Hh * q; const g = cv.getContext('2d');
    for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) { const c = pat[j][i]; if (c !== '.') { g.fillStyle = COL[c]; g.fillRect(i * q, j * q, q, q); } }
  }
  bfly.smooth = !rec && !(gbOn && !worldMode); bfly.at = [x - W / 2 * q, y - Hh * q];
  if (!bfly.smooth) { const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false; ctx.drawImage(cv, Math.round(x - W / 2 * q), Math.round(y - Hh * q)); ctx.imageSmoothingEnabled = sm; bfly.at = bfly.at.map(Math.round); }
  else { const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = true; ctx.drawImage(cv, x - W / 2 * q, y - Hh * q); ctx.imageSmoothingEnabled = sm; }
  ctx.globalAlpha = 1; bfly.drawn++;
}
const riceWake = dt => (dt < 0 || dt > 600 ? 0 : 0.1 * Math.sin(Math.PI * dt / 600));




const RICE_TAP_MS = 200, RICE_TAP_K = 0.14;
const riceTapPre = dt => (dt < 0 || dt > RICE_TAP_MS ? 0 : RICE_TAP_K * Math.sin(Math.PI * (0.25 + 0.75 * dt / RICE_TAP_MS)));
const drop = { cv: {}, n: 0, at: null };
function dropSprite(q) {
  if (!drop.cv[q]) {
    const c = drop.cv[q] = document.createElement('canvas'); c.width = c.height = 5 * q; const g = c.getContext('2d'), r = (x, y, w, h) => g.fillRect((x + 1) * q, (y + 1) * q, w * q, h * q);
    g.fillStyle = '#1a1a1a'; r(1, -1, 1, 1); r(0, 0, 3, 3); r(-1, 1, 5, 2); r(0, 3, 3, 1);
    g.fillStyle = '#8fd0f4'; r(1, 0, 1, 1); r(0, 1, 3, 2);
    g.fillStyle = '#ffffff'; r(0, 1, 1, 1);
  }
  return drop.cv[q];
}
const zzz = { cv: {}, n: 0, at: null };
function zzzSprite(q) {
  if (!zzz.cv[q]) { const c = zzz.cv[q] = document.createElement('canvas'); c.width = c.height = 5 * q; const g = c.getContext('2d'); g.fillStyle = '#34407a'; g.fillRect(0, 0, 5 * q, q); for (let j = 1; j < 4; j++) g.fillRect((4 - j) * q, j * q, q, q); g.fillRect(0, 4 * q, 5 * q, q); }
  return zzz.cv[q];
}
const riceTall = pitch => Math.sqrt(Math.cos(pitch) ** 2 + (0.88 * (riceBall.a || 10) / (riceBall.b || 13.5) * Math.sin(pitch)) ** 2);

function drawRiceBall(X, Y, u, th, sx, sy, spin, dst = ctx, gb = gbOn && !worldMode, mood = 'smile', look = 0, dirt = 0, dirtCol = '', pitch = 0) {


  const rb = riceBall, o = rb.x, H = RB / 2, cs = Math.cos(spin), sn = Math.sin(spin), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const bw = Math.sqrt(cs * cs + (0.88 * sn) ** 2), mx = cs < 0 ? -1 : 1, kx = sx * bw * mx;
  const my = cp < 0 ? -1 : 1, ky = sy * riceTall(pitch) * my;
  const P = gb ? 1 : Math.min(u, riceLowQ ? 2 : RICE_PMAX), k0 = P / u;
  const X0 = gb ? Math.round(X - H * u) : Math.floor(X - H * u - 1), Y0 = gb ? Math.round(Y - H * u) : Math.floor(Y - H * u - 1);
  const ox0 = (X - X0) * k0, oy0 = (Y - Y0) * k0, S = Math.ceil(RB * P) + 3;
  if (rb.cv.width !== S) { rb.cv.width = rb.cv.height = S; rb.img = null; }
  if (!rb.img) rb.img = o.createImageData(S, S);
  o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, S, S); o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high';
  o.setTransform(P * kx * Math.cos(th), P * ky * Math.sin(th), -P * kx * Math.sin(th), P * ky * Math.cos(th), ox0, oy0);
  const pd = rb.pad, fn = rb.fill.width;
  o.drawImage(rb.soft, -rb.gx - pd, -rb.gy - pd, fn + 2 * pd, fn + 2 * pd);
  o.setTransform(1, 0, 0, 1, 0, 0);
  const fd = o.getImageData(0, 0, S, S).data, img = rb.img, d = img.data, c = Math.cos(th), s = Math.sin(th), A = rb.a, Bb = rb.b, Cc = rb.a * 0.88;
  const [lx0, ly0, lz0] = RICE_LIGHT, [hx, hy, hz] = RICE_HALF;
  const kk = Math.min(Math.abs(kx), Math.abs(ky)) || 1, w1 = Math.min(0.6, 0.4 / (P * kk)), w2 = Math.min(0.3, 0.24 / (P * kk));
  const nDirt = rb.spots ? Math.round(Math.min(1, dirt) * rb.spots.length) : 0, dc = (dirtCol || '150,120,80').split(',').map(Number);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const k = (j * S + i) * 4, f = fd[k + 3] / 255;
    if (!f) { d[k + 3] = 0; continue; }
    const ao = Math.min(1, Math.max(0, (f - 0.16) / w2 + 0.5));
    if (ao <= 0) { d[k + 3] = 0; continue; }
    const ab = Math.min(1, Math.max(0, (f - 0.5) / w1 + 0.5));
    let r = 26, g = 26, bl = 26;
    if (ab > 0) {
      const ux = (i + 0.5 - ox0) / (P * kx), uy = (j + 0.5 - oy0) / (P * ky), px = c * ux + s * uy, py = -s * ux + c * uy;
      const ex = px / A, ey = py / Bb, ez = Math.sqrt(Math.max(0, 1 - ex * ex - ey * ey));
      let nx = ex / A, ny = ey / Bb, nz = ez / Cc;
      const qx = rb.gx + px - rb.nx, qy = rb.gy + py - rb.ny, qd = Math.sqrt(qx * qx + qy * qy), nb = Math.min(1, Math.max(0, rb.nr + 1.6 - qd));
      if (nb > 0) { const n0 = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx = nx / n0 * (1 - nb) - qx / (qd || 1) * 0.8 * nb; ny = ny / n0 * (1 - nb) - qy / (qd || 1) * 0.8 * nb; nz = nz / n0 * (1 - nb) + 0.6 * nb; }
      let wx = (c * nx - s * ny) * mx, wy = (s * nx + c * ny) * my;
      const nn = Math.sqrt(wx * wx + wy * wy + nz * nz); wx /= nn; wy /= nn; const wz = nz / nn;
      const dif = Math.max(0, wx * lx0 + wy * ly0 + wz * lz0), s1 = Math.max(0, wx * hx + wy * hy + wz * hz), s4 = (s1 * s1) * (s1 * s1), s8 = s4 * s4, spec = s8 * s8 * s8 * s4;
      const v = 0.28 + 0.76 * dif, tf = Math.min(4, Math.max(0, (v - 0.34) / 0.16)), t0 = Math.min(3, Math.floor(tf)), tt = tf - t0;
      const T0 = RICE_TONE[t0], T1 = RICE_TONE[t0 + 1], sh = Math.min(1, Math.max(0, (spec - 0.35) / 0.35));
      let cr = T0[0] + (T1[0] - T0[0]) * tt, cg = T0[1] + (T1[1] - T0[1]) * tt, cb = T0[2] + (T1[2] - T0[2]) * tt;
      {
        const rim = (1 - ez) * (1 - ez) * (1 - ez) * 0.35 * (1 - nb), core = ez * ez * 0.14 * (1 - nb), st = P >= 2.5 ? riceStreak(ex, ey) * 0.055 * (1 - nb) : 0;
        cr += (RICE_MILK[0] - cr) * rim + (RICE_CORE[0] - cr) * core; cg += (RICE_MILK[1] - cg) * rim + (RICE_CORE[1] - cg) * core; cb += (RICE_MILK[2] - cb) * rim + (RICE_CORE[2] - cb) * core;
        cr *= 1 - st; cg *= 1 - st; cb *= 1 - st * 0.9;
      }
      cr += (255 - cr) * sh; cg += (255 - cg) * sh; cb += (255 - cb) * sh;
      for (let m = 0; m < nDirt; m++) {
        const ddx = rb.gx + px - rb.spots[m][0] - 0.5, ddy = rb.gy + py - rb.spots[m][1] - 0.5, dm = Math.sqrt(ddx * ddx + ddy * ddy), al = Math.min(1, Math.max(0, (0.72 - dm) / (w1 * 2.5) + 0.5));
        if (al > 0) { const fm = 0.55 + 0.3 * dif; cr += (dc[0] * fm - cr) * al; cg += (dc[1] * fm - cg) * al; cb += (dc[2] * fm - cb) * al; }
      }
      const al = ab + ao * (1 - ab);
      r = (cr * ab + 26 * ao * (1 - ab)) / al; g = (cg * ab + 26 * ao * (1 - ab)) / al; bl = (cb * ab + 26 * ao * (1 - ab)) / al;
    }
    d[k] = r; d[k + 1] = g; d[k + 2] = bl; d[k + 3] = 255 * ao;
  }
  if (gb) {
    for (let k = 0; k < d.length; k += 4) {
      if (d[k + 3] < 128) { d[k + 3] = 0; continue; }
      const L = gbLum(d[k], d[k + 1], d[k + 2]), col = GB_RGB[L < 0.16 ? 3 : L > 0.8 ? 0 : L > 0.62 ? 1 : 2];
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
    }
  }
  o.putImageData(img, 0, 0);
  rb.last = { P, S, X0, Y0, X, Y, th, lowQ: riceLowQ };
  gbPause++;
  const sm = dst.imageSmoothingEnabled;
  try {
    if (k0 === 1) dst.drawImage(rb.cv, X0, Y0);
    else { dst.imageSmoothingEnabled = !gb; dst.drawImage(rb.cv, X0, Y0, S / k0, S / k0); }
  } finally { gbPause--; dst.imageSmoothingEnabled = sm; }
  if (cs > 0.12 && cp > 0.12 && mood) {
    dst.save(); dst.translate(gb ? Math.round(X) : X, gb ? Math.round(Y) : Y); dst.scale(sx, sy); dst.rotate(th);
    dst.translate((sn * rb.a * 0.7 + look) * u, sp * rb.b * 0.6 * u); dst.scale(Math.max(0.25, cs), Math.max(0.25, cp));
    const fc = (rb.faces && rb.faces[mood]) || rb.face;
    if (gb) dst.drawImage(fc, -rb.gx * u, -rb.gy * u, fc.width * u, fc.height * u);
    else { dst.imageSmoothingEnabled = true; dst.drawImage(riceFaceHi(fc, Math.ceil(u)), -rb.gx * u, -rb.gy * u, fc.width * u, fc.height * u); }
    dst.restore();
  }
}
const RICE_PMAX = 6;
let riceLowQ = false;
const faceHi = new WeakMap();
function riceFaceHi(fc, q) {
  let m = faceHi.get(fc);
  if (!m) faceHi.set(fc, m = {});
  if (!m[q]) { const c = document.createElement('canvas'); c.width = fc.width * q; c.height = fc.height * q; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(fc, 0, 0, c.width, c.height); m[q] = c; }
  return m[q];
}
const riceFrame = () => riceSprites[facing][window.nishioRollSync ? window.nishioRollSync.frameFor(roll.d, KP.radius || 1) : Math.floor(roll.d * 8) & 7];


const RICE_R = 0.42;

let koro = null, KP = {};




const GROUND = {
  road: { drag: 0.72, crr: 1, dust: '205,200,190', dv: 2.6, snd: 1, hz: 900 },
  dirt: { drag: 1, crr: 1.6, dust: '235,228,205', dv: 2.2, snd: 0.9, hz: 650 },
  grass: { drag: 1.35, crr: 2.6, dust: '104,178,72', dv: 1.4, snd: 0.55, bit: true, hz: 2600 },
  mud: { drag: 1.6, crr: 3.2, dust: '138,106,68', dv: 1.2, snd: 0.5, bit: true, hz: 420 },
  water: { drag: 1.7, crr: 3.5, dust: '160,205,232', dv: 0.9, snd: 0.4, bit: true, splash: true, hz: 1500 },
  sand: { drag: 1.9, crr: 4.5, dust: '231,207,140', dv: 0.9, snd: 0.3, big: true, hz: 380 },
};

const wxKind = () => { const w = window.NISHIO_WEATHER && window.NISHIO_WEATHER.current; return (w && w.kind) || ''; };

const LEAF_BITS = { koyo: ['200,100,30', '176,58,36', '201,154,30', '216,138,58'], sakura: ['246,168,192', '251,208,221', '255,236,242'] };
const groundBit = g => (g === GROUND.grass && (KOYO || SAKURA) ? (KOYO ? LEAF_BITS.koyo : LEAF_BITS.sakura)[(Math.random() * (KOYO ? 4 : 3)) | 0] : g.dust);
const WX_ROLL = { rain: { crr: 0.7, lin: 0.75, bit: '170,210,240', hz: 1.4 }, snow: { crr: 0.5, lin: 0.55, bit: '245,248,255', hz: 0.6 } };

const DIRT_RATE = { sand: 0.22, dirt: 0.06, mud: 0.3, grass: -0.05, road: -0.01, water: -0.2 };
function groundAt(x, y) {
  const c = codeAt(Math.floor(x), Math.floor(y));
  if (c === C.R || c === C.H || c === C.L || c === C.T || c === C.Q || c === C.I) return GROUND.road;
  if (c === C.S) return GROUND.sand;
  if (c === C.F) return PADDY_TILE === 'flooded' ? GROUND.water : PADDY_TILE === 'soil' ? GROUND.mud : GROUND.grass;
  if (c === C.G || c === C.P || c === C.W || c === C.K || c === C.V || c === C.E || c === C.U || c === C.Y) return GROUND.grass;
  return GROUND.dirt;
}



const combo = { n: 0, quietT: 0, shown: 0, beat: false, beatN: 0, near: 0, best: 0 };
function comboStep() {
  combo.shown = performance.now(); combo.best = combo.n;
  if (combo.n > mzRt.run.combo) mzRt.run.combo = combo.n;
}
function comboEnd() {
  const n = combo.n, beat = combo.beat;
  combo.n = 0; combo.best = 0; combo.quietT = 0; combo.beat = false;
  if (n < 5) return;
  if (G.track) G.track('roll_combo', { n, best: combo.best });
}

const speedFx = { k: 0, at: 0, vx: 1, vy: 0 };

const GROW_TH = [15, 40, 80, 140, 210, 300, 420, 570, 760, 1000, 1300, 1700, 2200, 2800, 3600, 4600, 5900, 7600, 9800, 12700, 16500, 21400, 27800, 36100, 46900, 60900, 79100, 102800, 133600, 173600, 225600, 293200, 381100];
const grow = { stage: 0, popT: 0 };
function growStageFor(d) { let s = 0; for (let i = 0; i < GROW_TH.length; i++) if (d >= GROW_TH[i]) s = i + 1; return s; }
function growStep(hx, by, u, now) {
  const st = grow.stage, pt = grow.popT ? (now - grow.popT) / 800 : 1;
  if (!st && pt >= 1) return;
  const q = Math.max(1, Math.round(u)), sway = Math.round(Math.sin(now / 420) * Math.min(1, roll.v / 2) * q), lift = pt < 1 ? Math.round(Math.sin(pt * Math.PI) * 2 * q) : 0;
  const x0 = Math.round(hx) + sway, y0 = Math.round(by - 15 * u) - lift, ga = ctx.globalAlpha;
  if (pt < 1) {
    ctx.globalAlpha = ga * (1 - pt) * 0.7; ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = q;
    ctx.beginPath(); ctx.arc(hx, by, (13 + 11 * pt) * u, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = ga;
  }
  if (!st) return;
  const sh = 2 + Math.min(st, 4);
  ctx.fillStyle = '#4c9a3a'; ctx.fillRect(x0, y0 - sh * q, q, sh * q);
  ctx.fillStyle = '#7fd05a'; ctx.fillRect(x0 + q, y0 - (sh + 1) * q, 2 * q, q); ctx.fillRect(x0 + q, y0 - sh * q, q, q);
  if (st >= 2) { ctx.fillRect(x0 - 2 * q, y0 - (sh + 1) * q, 2 * q, q); ctx.fillRect(x0 - q, y0 - sh * q, q, q); }
  if (st >= 3) { ctx.fillRect(x0 + q, y0 - 2 * q, q, q); ctx.fillRect(x0 - q, y0 - 2 * q, q, q); }
  if (st === 3) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(x0, y0 - (sh + 2) * q, q, 2 * q); }
  if (st >= 4) { ctx.fillStyle = '#ffffff'; for (const [fx, fy] of [[0, -2], [-1, -1], [1, -1], [0, 0], [-1, -2], [1, -2]]) ctx.fillRect(x0 + fx * q, y0 - (sh + 1) * q + fy * q, q, q); ctx.fillStyle = '#ffd84a'; ctx.fillRect(x0, y0 - (sh + 1) * q - q, q, q); }
  if (st >= 5) { const sx0 = x0 + 4 * q; ctx.fillStyle = '#4c9a3a'; ctx.fillRect(x0 + 2 * q, y0 - sh * q, 2 * q, q); if (st >= 6) ctx.fillRect(x0 + 4 * q, y0 - sh * q, q, q); ctx.fillStyle = '#ffffff'; if (st === 5) { for (const [fx, fy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) ctx.fillRect(sx0 + fx * q, y0 - (sh + 1) * q + fy * q, q, q); ctx.fillStyle = '#ffd84a'; ctx.fillRect(sx0, y0 - (sh + 1) * q, q, q); } else { for (const [fx, fy] of [[0, -2], [-1, -1], [1, -1], [0, 0], [-1, -2], [1, -2]]) ctx.fillRect(sx0 + fx * q, y0 - (sh + 1) * q + fy * q, q, q); ctx.fillStyle = '#ffd84a'; ctx.fillRect(sx0, y0 - (sh + 1) * q - q, q, q); } }
  if (st >= 8) { const lx0 = x0 - 4 * q; ctx.fillStyle = '#4c9a3a'; ctx.fillRect(x0 - 3 * q, y0 - sh * q, 2 * q, q); ctx.fillRect(x0 - 4 * q, y0 - sh * q, q, q); ctx.fillStyle = '#ffffff'; for (const [fx, fy] of [[0, -2], [-1, -1], [1, -1], [0, 0], [-1, -2], [1, -2]]) ctx.fillRect(lx0 + fx * q, y0 - (sh + 1) * q + fy * q, q, q); ctx.fillStyle = '#ffd84a'; ctx.fillRect(lx0, y0 - (sh + 1) * q - q, q, q); }
  if (st >= 7) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(x0 + q, y0 - (sh + 5) * q, 2 * q, 2 * q); }
  if (st >= 9) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(x0 - 3 * q, y0 - (sh + 5) * q, 2 * q, 2 * q); }
  if (st >= 10) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(x0 - q, y0 - (sh + 7) * q, 2 * q, 2 * q); }
  if (st >= 11) { const fx0 = x0, fy0 = y0 - (sh + 9) * q; ctx.fillStyle = '#ffffff'; for (const [fx, fy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) ctx.fillRect(fx0 + fx * q, fy0 + fy * q, q, q); ctx.fillStyle = '#ffd84a'; ctx.fillRect(fx0, fy0, q, q); }
  if (st >= 12) { const fx0 = x0, fy0 = y0 - (sh + 9) * q; ctx.fillStyle = '#ffffff'; for (const [fx, fy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.fillRect(fx0 + fx * q, fy0 + fy * q, q, q); }
  if (st >= 13) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(x0, y0 - (sh + 12) * q, q, 2 * q); }
  if (st >= 14) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x0 - q, y0 - (sh + 11) * q, q, q); ctx.fillRect(x0 + q, y0 - (sh + 11) * q, q, q); }
  if (st >= 15) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(x0 - q, y0 - (sh + 14) * q, 2 * q, 2 * q); }
  if (st >= 16) { const fx0 = x0, fy0 = y0 - (sh + 16) * q; ctx.fillStyle = '#ffffff'; for (const [fx, fy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) ctx.fillRect(fx0 + fx * q, fy0 + fy * q, q, q); ctx.fillStyle = '#ffd84a'; ctx.fillRect(fx0, fy0, q, q); }
  if (st >= 17) { const fx0 = x0, fy0 = y0 - (sh + 16) * q; ctx.fillStyle = '#ffffff'; for (const [fx, fy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.fillRect(fx0 + fx * q, fy0 + fy * q, q, q); }
  if (st >= 18) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(x0, y0 - (sh + 19) * q, q, 2 * q); }
  if (st >= 19) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x0 - q, y0 - (sh + 18) * q, q, q); ctx.fillRect(x0 + q, y0 - (sh + 18) * q, q, q); }
  if (st >= 20) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(x0 - q, y0 - (sh + 21) * q, 2 * q, 2 * q); }
  if (st >= 21) { const fx0 = x0, fy0 = y0 - (sh + 23) * q; ctx.fillStyle = '#ffffff'; for (const [fx, fy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) ctx.fillRect(fx0 + fx * q, fy0 + fy * q, q, q); ctx.fillStyle = '#ffd84a'; ctx.fillRect(fx0, fy0, q, q); }
  if (st >= 22) { const fx0 = x0, fy0 = y0 - (sh + 23) * q; ctx.fillStyle = '#ffffff'; for (const [fx, fy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.fillRect(fx0 + fx * q, fy0 + fy * q, q, q); }
  if (st >= 23) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(x0, y0 - (sh + 26) * q, q, 2 * q); }
  if (st >= 24) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x0 - q, y0 - (sh + 25) * q, q, q); ctx.fillRect(x0 + q, y0 - (sh + 25) * q, q, q); }
  if (st >= 25) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(x0 - q, y0 - (sh + 28) * q, 2 * q, 2 * q); }
  if (st >= 26) { const fx0 = x0, fy0 = y0 - (sh + 30) * q; ctx.fillStyle = '#ffffff'; for (const [fx, fy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) ctx.fillRect(fx0 + fx * q, fy0 + fy * q, q, q); ctx.fillStyle = '#ffd84a'; ctx.fillRect(fx0, fy0, q, q); }
  if (st >= 27) { const fx0 = x0, fy0 = y0 - (sh + 30) * q; ctx.fillStyle = '#ffffff'; for (const [fx, fy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.fillRect(fx0 + fx * q, fy0 + fy * q, q, q); }
  if (st >= 28) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(x0, y0 - (sh + 33) * q, q, 2 * q); }
  if (st >= 29) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x0 - q, y0 - (sh + 32) * q, q, q); ctx.fillRect(x0 + q, y0 - (sh + 32) * q, q, q); }
  if (st >= 30) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(x0 - q, y0 - (sh + 35) * q, 2 * q, 2 * q); }
  if (st >= 31) { const fx0 = x0, fy0 = y0 - (sh + 37) * q; ctx.fillStyle = '#ffffff'; for (const [fx, fy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) ctx.fillRect(fx0 + fx * q, fy0 + fy * q, q, q); ctx.fillStyle = '#ffd84a'; ctx.fillRect(fx0, fy0, q, q); }
  if (st >= 32) { const fx0 = x0, fy0 = y0 - (sh + 37) * q; ctx.fillStyle = '#ffffff'; for (const [fx, fy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.fillRect(fx0 + fx * q, fy0 + fy * q, q, q); }
  if (st >= 33) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(x0, y0 - (sh + 40) * q, q, 2 * q); }
}



const SQ_STEP = 1 / 60, SQ_MAX = 0.5;
function squashSpring(st, dt) {
  for (let rem = Math.min(Math.max(dt, 0), 0.5); rem > 1e-6;) {
    const h = Math.min(rem, SQ_STEP);
    st.sqv += (-st.sq * 260 - st.sqv * 14) * h; st.sq += st.sqv * h;
    rem -= h;
  }
  if (!(Math.abs(st.sq) <= SQ_MAX)) { st.sq = st.sq > 0 ? SQ_MAX : st.sq < 0 ? -SQ_MAX : 0; st.sqv = 0; }
}
function riceFeel(dt, speed) {
  { const gs = growStageFor(roll.d); if (gs > grow.stage) { grow.stage = gs; grow.popT = performance.now(); dotSound(0); } }
  if (combo.n) { combo.quietT = speed < 0.6 ? combo.quietT + dt : 0; if (combo.quietT > 0.7) comboEnd(); }
  const g = roll.gnd = roll.last ? groundAt(roll.last.x, roll.last.y) : GROUND.dirt, wx = WX_ROLL[wxKind()];
  {
    const key = Object.keys(GROUND).find(k => GROUND[k] === g) || 'dirt', r = DIRT_RATE[key] || 0;
    const add = r > 0 ? r * Math.min(1, speed / 4) : r;
    if (r > 0 && speed > 0.3) roll.dirtCol = g.dust;
    roll.dirt = Math.max(0, Math.min(1, roll.dirt + (r > 0 && speed <= 0.3 ? 0 : add) * dt - (wxKind() === 'rain' ? 0.08 * dt : 0)));
  }
  const ka = Math.floor((roll.ang + Math.PI / 2) / Math.PI), ks = Math.floor((roll.spin + Math.PI / 2) / Math.PI), kp = Math.floor((roll.pitch + Math.PI / 2) / Math.PI), k = ka + ',' + ks + ',' + kp;
  if (k !== roll.side) {
    const n = ka + ks + kp; roll.side = k;
    if (speed > 0.6 && roll.h <= 0) {
      if (speed > 1.2 && rollOn && G.demo) { combo.n++; combo.quietT = 0; comboStep(); }
      kotoSound(Math.min(1, speed / 5) * g.snd);
      roll.sq = Math.max(roll.sq, 0.06 * (KP.kotoSq || 1)); roll.sqx = false;
      const hopV = KP.hopV || HOP_V;
      if (speed > hopV && (KP.hopEvery === 1 || (n & 1))) { roll.hv = (2.2 + (speed - hopV) * 0.4) * (KP.hopPow || 1); roll.h = 0.001; roll.kind = 'hop'; }
    }
  }
  if (roll.h > 0) {
    roll.hv -= 22 * (KP.grav || 1) * dt; roll.h += roll.hv * dt;
    if (roll.h <= 0) {
      const imp = Math.abs(roll.hv);
      roll.h = 0; roll.hv = 0; roll.sq = Math.min(0.3, 0.1 + imp * 0.03); roll.sqv = 0; roll.sqx = false;
      if (imp > 4) roll.shake = Math.min(1, (imp - 4) * 0.12);
      kotoSound(Math.min(1, 0.5 + imp / 10) * g.snd, imp > 5);
      for (let i = 0; i < 3; i++) roll.dust.push({ x: roll.last ? roll.last.x : 0, y: roll.last ? roll.last.y : 0, t: 0, s: 0.5 + Math.random() * 0.5, vx: (i - 1) * 0.9, c: groundBit(g), bit: g.bit && (KOYO || SAKURA) });
    }
  }
  if (KP.trip && speed > 2 && roll.h <= 0 && Math.random() < KP.trip * dt) { roll.hv = 1.8; roll.h = 0.001; roll.dizzyT = 0.8; kotoSound(0.6, true); }
  koroTrail(dt, speed);
  squashSpring(roll, dt);
  if (Math.abs(roll.sq) < 0.002 && Math.abs(roll.sqv) < 0.02) { roll.sq = 0; roll.sqv = 0; }
  roll.shake = Math.max(0, roll.shake - dt * 3);
  roll.ouchT = Math.max(0, roll.ouchT - dt); roll.happyT = Math.max(0, roll.happyT - dt); roll.dizzyT = Math.max(0, roll.dizzyT - dt);
  roll.wetT = Math.max(0, roll.wetT - dt); roll.jumpCd = Math.max(0, roll.jumpCd - dt); roll.sendT = Math.max(0, roll.sendT - dt);
  const glance = roll.kind === 'stop' && roll.idle > 2.5 && roll.idle < 12 ? [0, -1.5, 0, 1.5][Math.floor(roll.idle / 2.2) % 4] : 0;
  roll.look += (glance - roll.look) * Math.min(1, dt * 8);
  roll.dustT -= dt;
  if (speed > g.dv && roll.h <= 0 && roll.dustT <= 0) {
    roll.dustT = g.big ? 0.04 : 0.06;
    roll.dust.push({ x: roll.last ? roll.last.x : 0, y: roll.last ? roll.last.y : 0, t: 0, s: (g.big ? 0.9 : 0.6) + Math.random() * 0.6, c: wx && !g.splash ? wx.bit : groundBit(g), bit: wx ? true : g.bit, vx: (Math.random() - 0.5) * 1.2 });
  }
  for (const p of roll.dust) p.t += dt;
  roll.dust = roll.dust.filter(p => p.t < 0.45);
}
let kotoCtx = null;
function boingSound(v, hi) {
  try {
    if (localStorage.getItem('nsg_bgm') === 'false' || document.hidden) return;
    kotoCtx = kotoCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (kotoCtx.state === 'suspended') kotoCtx.resume();
    const t = kotoCtx.currentTime, o = kotoCtx.createOscillator(), w = kotoCtx.createOscillator(), wg = kotoCtx.createGain(), g = kotoCtx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(hi ? 240 : 170, t); o.frequency.exponentialRampToValueAtTime(hi ? 760 : 420, t + 0.16);
    w.frequency.setValueAtTime(18, t); wg.gain.setValueAtTime(25, t); w.connect(wg); wg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09 * (0.4 + v * 0.6), t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g); g.connect(kotoCtx.destination); o.start(t); w.start(t); o.stop(t + 0.26); w.stop(t + 0.26);
  } catch (e) {  }
}
function kotoSound(v, low) {
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
  } catch (e) {  }
}





const WADDLE_V = 1.1, HOP_V = 4.6;

const rumble = { g: null, f: null };
function rumbleTick(v, g) {
  const ctxA = kotoCtx;
  if (!ctxA || ctxA.state !== 'running') return;
  try {
    if (!rumble.g) {
      const buf = ctxA.createBuffer(1, ctxA.sampleRate, ctxA.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctxA.createBufferSource(); src.buffer = buf; src.loop = true;
      rumble.f = ctxA.createBiquadFilter(); rumble.f.type = 'bandpass'; rumble.f.Q.value = 1.2;
      rumble.g = ctxA.createGain(); rumble.g.gain.value = 0;
      src.connect(rumble.f); rumble.f.connect(rumble.g); rumble.g.connect(ctxA.destination); src.start();
    }
    let off = document.hidden; try { off = off || localStorage.getItem('nsg_bgm') === 'false'; } catch (e) {  }
    const t = ctxA.currentTime, vol = off || v < 0.3 ? 0 : Math.min(1, (v - 0.3) / 5) * 0.035 * (0.5 + g.snd / 2);
    rumble.g.gain.setTargetAtTime(vol, t, 0.05);
    const wx = WX_ROLL[wxKind()];
    rumble.f.frequency.setTargetAtTime(g.hz * (wx ? wx.hz : 1) * (0.8 + Math.min(v, 6) / 15), t, 0.08);
  } catch (e) {  }
}

function sfxCtx() {
  try {
    if (localStorage.getItem('nsg_bgm') === 'false' || document.hidden) return null;
    kotoCtx = kotoCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (kotoCtx.state === 'suspended') kotoCtx.resume();
    return kotoCtx;
  } catch (e) { return null; }
}
{
  const unlock = () => { document.removeEventListener('pointerdown', unlock, true); document.removeEventListener('keydown', unlock, true); sfxCtx(); };
  document.addEventListener('pointerdown', unlock, true); document.addEventListener('keydown', unlock, true);
}
function grainSound() {
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
  } catch (e) {  }
}
function padSound(chain = 1) {
  const a = sfxCtx();
  if (!a) return;
  try {
    const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(330, t); o.frequency.exponentialRampToValueAtTime(1320, t + 0.16);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.24);
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * 0.25), a.sampleRate), dd = buf.getChannelData(0);
    for (let i = 0; i < dd.length; i++) dd[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / dd.length);
    const n = a.createBufferSource(), f = a.createBiquadFilter(), ng = a.createGain();
    n.buffer = buf; f.type = 'bandpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.2); f.Q.value = 1.2; ng.gain.value = 0.05;
    n.connect(f); f.connect(ng); ng.connect(a.destination); n.start(t);
    for (let k = 0; k < 3; k++) {
      const tk = t + 0.12 + k * 0.045, wb = a.createBuffer(1, Math.floor(a.sampleRate * 0.03), a.sampleRate), wd = wb.getChannelData(0);
      for (let i = 0; i < wd.length; i++) wd[i] = (Math.random() * 2 - 1) * (1 - i / wd.length);
      const w = a.createBufferSource(), wf = a.createBiquadFilter(), wg = a.createGain();
      w.buffer = wb; wf.type = 'bandpass'; wf.frequency.value = 4800 + k * 400; wf.Q.value = 2; wg.gain.value = 0.035;
      w.connect(wf); wf.connect(wg); wg.connect(a.destination); w.start(tk);
    }
  } catch (e) {  }
}
function dotSound(i) {
  const a = sfxCtx();
  if (!a) return;
  try {
    const f = 1046.5, t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.018, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.08);
  } catch (e) {  }
}
function chordSound() {
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
  } catch (e) {  }
}
function splashSound(v) {
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
  } catch (e) {  }
}
function hedgeSound(v) {
  const a = sfxCtx();
  if (!a) return;
  try {
    const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.08);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06 * (0.4 + v * 0.6), t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.12);
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * 0.22), a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) { const k = i / d.length; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, 2) * (k < 0.4 || (k > 0.5 && k < 0.7) ? 1 : 0.35); }
    const n = a.createBufferSource(), f = a.createBiquadFilter(), ng = a.createGain();
    n.buffer = buf; f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 0.7; ng.gain.value = 0.06 * (0.4 + v * 0.6);
    n.connect(f); f.connect(ng); ng.connect(a.destination); n.start(t);
  } catch (e) {  }
}
function clackSound(v) {
  const a = sfxCtx();
  if (!a) return;
  try {
    for (const [dt, hz] of [[0, 210], [0.1, 160]]) {
      const t = a.currentTime + dt, o = a.createOscillator(), g = a.createGain();
      o.type = 'square'; o.frequency.setValueAtTime(hz, t); o.frequency.exponentialRampToValueAtTime(hz * 0.55, t + 0.06);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035 * (0.5 + v / 2), t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.08);
    }
  } catch (e) {  }
}

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
  rp.vx = dx * 3.4; rp.vy = dy * 3.4;
  roll.sendT = 4; roll.sends++; roll.happyT = 1.4;
  kotoSound(0.7);
  npcEmotes.set(s.n.id, { t: performance.now(), k: '♪' });
}
function drawSendArrow(hx, hcy, T, u) {
  if (roll.sendT <= 0 || !G.guide || !roll.last) return;
  const p = toTile(G.guide.lat, G.guide.lng), a = Math.atan2(p.y - roll.last.y, p.x - roll.last.x), r = T * 1.5, q = Math.max(1, Math.round(u * 1.6));
  const cx = hx + Math.cos(a) * r, cy = hcy + Math.sin(a) * r * 1.1;
  ctx.save(); ctx.globalAlpha = Math.min(1, roll.sendT * 1.5); ctx.translate(Math.round(cx), Math.round(cy)); ctx.rotate(Math.round(a / (Math.PI / 4)) * (Math.PI / 4));
  const rows = ['...o....', '...oo...', 'ooo#oo..', 'o####oo.', 'ooo#oo..', '...oo...', '...o....'];
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
    const ch = rows[j][i]; if (ch === '.') continue;
    ctx.fillStyle = ch === 'o' ? '#1a1a1a' : '#7ee0ff';
    ctx.fillRect((i - 4) * q, (j - 3) * q, q, q);
  }
  ctx.restore();
}

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
  const q = Math.max(1, Math.round(u * 1.5)), rows = tr.g, gw = rows[0].length, gh = rows.length;
  for (const p of roll.fx) {
    const a = Math.min(1, (p.life - p.t) / (p.life * 0.35));
    const sway = tr.move === 'fall' ? Math.sin(p.t * 4 + p.ph) * 0.12 : tr.move === 'up' ? Math.sin(p.t * 5 + p.ph) * 0.06 : 0;
    const X = Math.round(ox + (p.x + sway) * T - gw * q / 2), Y = Math.round(oy + p.y * T + T * 0.3 - p.z * T - gh * q / 2);
    if (tr.name === 'きらきら' && Math.floor(p.t * 10 + p.ph) % 2) continue;
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





const FEEL_V_MAX = 6, FEEL_CARRY_MAX = 2;
function feelSpeed(st, d, dt) {
  const t = Math.max(dt, 1e-3);
  if (!(d < 3)) return Math.min(d / t, FEEL_V_MAX);
  const all = Math.min((st.carry || 0) + d, FEEL_CARRY_MAX), v = Math.min(all / t, FEEL_V_MAX), left = all - v * t;
  st.carry = left > 1e-9 ? left : 0;
  return v;
}
function riceSpin(dx, dy, dt) {
  const d = Math.hypot(dx, dy), v = feelSpeed(roll, d, dt), ft = Math.max(dt, 1e-3, d < 3 ? d / FEEL_V_MAX : 0);
  riceFeel(dt, v);
  roll.v += ((d < 3 ? v : 0) - roll.v) * Math.min(1, dt * 8);
  rumbleTick(roll.v, roll.gnd || GROUND.dirt);
  if (roll.kind === 'stop') { roll.idle += dt; if (roll.peak > 2.5) roll.happyT = 1.6; roll.peak = 0; }
  else { roll.idle = 0; roll.peak = Math.max(roll.peak, roll.v); }
  if (roll.kind === 'spin') { roll.spinT += dt; if (roll.spinT > 1.2) roll.dizzyT = 1; } else roll.spinT = Math.max(0, roll.spinT - dt * 2);
  const moving = d > 0.002 && d < 3 && v > 0.15, up = Math.round(roll.ang / (Math.PI * 2)) * Math.PI * 2, R2 = RICE_R * (KP.radius || 1);
  let target = up;
  if (!KP.spinAlways && d > 1e-9 && d < 3) {
    const sc = KP.radius || 1, RS = window.nishioRollSync;
    const adv = RS ? RS.advance(dx, dy, sc) : { dAng: dx / R2, dPitch: dy / R2, dist: d };
    roll.ang += adv.dAng; roll.pitch += adv.dPitch;
    roll.av = adv.dAng / ft; roll.pv = adv.dPitch / ft;
    if (roll.h <= 0) roll.kind = 'tumble';
    if (KP.spinMix) roll.spin += adv.dist / R2 * 0.5;
    else settleSpin(dt);
    if (Math.abs(dy) < 1e-6) settlePitch(dt);
    if (Math.abs(dx) >= 1e-6) return;
  } else if (moving) {

    settlePitch(dt);
    if (roll.h <= 0) roll.kind = 'spin';
    const wt = (Math.sign(dy) || Math.sign(dx)) * d / R2 * 0.9 / ft;
    if (roll.h <= 0) roll.sv += (wt - roll.sv) * Math.min(1, dt * 14);
    roll.spin += roll.sv * dt;
  } else {
    settleSpin(dt); settlePitch(dt);
    if (roll.h <= 0 && Math.abs(roll.av) < 0.05 && Math.abs(roll.pv) < 0.05) roll.kind = 'stop';
  }
  roll.av += (target - roll.ang) * 70 * dt;
  roll.av *= Math.pow(0.86, dt * 60);
  roll.ang += roll.av * dt;
  if (!moving && Math.abs(up - roll.ang) < 0.002 && Math.abs(roll.av) < 0.01) { roll.ang = up; roll.av = 0; }
}
function settlePitch(dt) {
  const front = Math.round(roll.pitch / (Math.PI * 2)) * Math.PI * 2;
  roll.pv += (front - roll.pitch) * 70 * dt; roll.pv *= Math.pow(0.86, dt * 60);
  roll.pitch += roll.pv * dt;
  if (Math.abs(front - roll.pitch) < 0.002 && Math.abs(roll.pv) < 0.01) { roll.pitch = front; roll.pv = 0; }
}
function settleSpin(dt) {
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
  if (riceBall.cv) [-0.14, 0.14].forEach((th, i) => drawRiceBall(i * 32 + 16, 17.5, 1, th, 1, 1, 0, x, false));
  else (riceSprites.ready ? [riceSprites.right[0], riceSprites.right[1]] : heroSprites.down).forEach((c, i) => x.drawImage(c, i * 32, 0, 32, 32));
  const st = heroMarkerStyle;
  st.textContent = `.me,.me.demo{width:32px;height:32px;border:0;border-radius:0;box-shadow:none;background:url(${sheet.toDataURL()}) 0 0/64px 32px no-repeat;image-rendering:pixelated;animation:heroStep .9s steps(1) infinite;filter:drop-shadow(0 2px 1px rgba(0,0,0,.45))}
@keyframes heroStep{0%{background-position:0 0}50%{background-position:-32px 0}}
@media (prefers-reduced-motion:reduce){.me{animation:none}}`;
  document.head.appendChild(st);
}
setHeroMarker();


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


const SPOT_ORDER = ['park0', 'park1', 'park2', 'park3', 'historic', 'view', 'sight', 'art', 'beach', 'museum', 'torii', 'temple', 'castle', 'town'];
(() => {
  const img = new Image();
  img.onload = () => {
    SPOT_ORDER.forEach((k, i) => {
      const mk = grey => {
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




const pix = (r, rows, ox, oy, col) => rows.forEach((row, y) => [...row].forEach((ch, i) => { if (ch === '#') r(ox + i, oy + y, 1, 1, col); }));


function shopCanvas(draw, outline = false, size = 32) {
  let pair = null;
  const make = () => pair || (pair = shopCanvasNow(draw, outline, size));
  return { get 0() { return make()[0]; }, set 0(v) { make()[0] = v; }, get 1() { return make()[1]; }, set 1(v) { make()[1] = v; }, length: 2, size, get made() { return !!pair; } };
}
function shopCanvasNow(draw, outline, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d'), r = (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(px, py, w, h); };
  draw(r, (py, x0, x1, col) => r(x0, py, x1 - x0 + 1, 1, col));
  if (outline) {
    const d = x.getImageData(0, 0, size, size), a = i => d.data[i * 4 + 3] > 0, edge = [];
    for (let i = 0; i < size * size; i++) {
      const px = i % size, py = (i - px) / size;
      if (!a(i) && ((px > 0 && a(i - 1)) || (px < size - 1 && a(i + 1)) || (py > 0 && a(i - size)) || (py < size - 1 && a(i + size)))) edge.push(i);
    }
    for (const i of edge) r(i % size, Math.floor(i / size), 1, 1, '#000');
  }
  const g = document.createElement('canvas');
  g.width = g.height = size;
  const gx = g.getContext('2d'), d = x.getImageData(0, 0, size, size);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.round(0.3 * d.data[i] + 0.59 * d.data[i + 1] + 0.11 * d.data[i + 2]); d.data[i] = d.data[i + 1] = d.data[i + 2] = v; }
  gx.putImageData(d, 0, 0);
  return [c, g];
}

const hiCanvas = draw => shopCanvas(draw, true, 48);

function tileRoof(r, h, y0, spans, [light, mid, dark, line]) {
  spans.forEach(([a, b], i) => {
    const last = i === spans.length - 1;
    h(y0 + i, a, b, last ? dark : i < spans.length / 3 ? light : mid);
    if (!last) { for (let x = a + 1 + (i % 2); x < b; x += 2) r(x, y0 + i, 1, 1, line); r(a + 1, y0 + i, 1, 1, light); r(b - 1, y0 + i, 1, 1, light); }
  });
  const [a, b] = spans[spans.length - 1];
  r(a, y0 + spans.length - 2, 1, 1, dark); r(b, y0 + spans.length - 2, 1, 1, dark);
}
spotSprites.ricepia = shopCanvas(r => {
  const K = '#000', RED = '#d7262e', W = '#ffffff', GR = '#9e9e9e';
  r(3, 8, 25, 23, K); r(4, 9, 23, 21, RED);
  r(4, 21, 23, 2, W);

  pix(r, ['..#.#.#..', '.#######.', '#########', '#########', '#########', '.........', '#########', '.#######.', '..#####..', '...###...'], 4, 10, W);
  pix(r, ['#.#.#', '.###.', '#####', '.###.', '#.#.#'], 6, 10, RED);

  for (const [px, py] of [[14, 10], [18, 10], [14, 23], [18, 23]]) { r(px, py, 3, py > 20 ? 7 : 10, W); r(px + 1, py + 3, 1, 2, RED); }

  r(21, 23, 6, 7, '#2f3438'); r(22, 24, 2, 3, '#f5f5f5'); r(25, 24, 1, 2, '#f5f5f5'); r(24, 23, 1, 7, '#cfd8dc');

  r(10, 3, 17, 6, K); r(11, 4, 15, 4, W);
  pix(r, ['#..##.#..#.#.##', '.#.#..##.#..#.#'], 11, 5, RED);

  r(20, 15, 12, 4, K); r(21, 16, 11, 2, RED);
  for (const px of [23, 25, 27, 29]) r(px, 16, 1, 2, W);
  r(30, 19, 1, 12, GR);

  r(26, 24, 6, 6, K); r(27, 25, 4, 4, W); r(27, 25, 4, 1, '#1f5fbf'); r(27, 27, 4, 1, RED); r(27, 26, 1, 3, RED);

  r(19, 20, 1, 11, '#2e7d32'); r(18, 21, 1, 6, '#f2d230');
});
spotSprites.kondo = shopCanvas(r => {
  const K = '#000', CR = '#ebdfb6', CRD = '#cdbf93', RED = '#d0342c', GR = '#8f8f8f';

  r(8, 3, 15, 28, K); r(9, 4, 13, 27, CR);
  r(21, 8, 11, 23, K); r(22, 9, 9, 22, CR); r(22, 9, 9, 1, CRD);

  pix(r, ['.....##....', '.##..##..##', '..##.##.##.', '...#.##.#..', '###########', '###########', '....####...', '...#.##.#..', '..##.##.##.', '.##..##..##', '##...##...#', '.....##....'], 10, 4, RED);
  r(12, 17, 6, 1, '#4a4a4a');

  r(24, 11, 5, 3, K); r(25, 12, 3, 1, '#b8d0e0');

  r(20, 19, 12, 4, K); r(21, 20, 11, 2, '#f3ead0');
  for (const px of [22, 24, 26, 28, 30]) r(px, 20, 1, 2, '#222');
  r(21, 23, 11, 8, '#9fb4c4'); for (const px of [24, 27, 30]) r(px, 23, 1, 8, '#5d6b75');
  r(13, 20, 8, 2, '#2e7d32'); r(14, 22, 6, 9, '#6d7b84');

  r(0, 9, 10, 5, K); r(1, 10, 8, 2, '#ffffff'); for (const px of [2, 4, 6]) r(px, 10, 1, 2, '#1f5fbf'); r(1, 12, 8, 1, RED);
  r(0, 14, 10, 2, GR);
  r(1, 16, 1, 15, GR); r(8, 16, 1, 15, GR);
});

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
  'f-kota-aimi-station': 'kotaAimiStation', 'f-gamagori-takeshima': 'gamagoriTakeshima', 'f-gamagori-aquarium': 'gamagoriAquarium', 'f-gamagori-station': 'gamagoriStation',
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


const spanRows = (h, y0, spans, col) => spans.forEach(([a, b], i) => h(y0 + i, a, b, typeof col === 'function' ? col(i) : col));

const PINE = ['.#####.', '#######', '.#####.'];


spotSprites.nishioCastle = hiCanvas((r, h) => {
  const ROOFC = ['#d4ccd2', '#8e898d', '#5c5759', '#76717a'], W = '#2d2d2c', WT = '#3b3430', PL = '#e6e3da', PS = '#a9a698', LAT = '#6a5a48';
  const ST = '#8a8986', SL = '#a8a7a2', SD = '#5e5d5b';
  const win = (x, y, w, hh) => { r(x, y, w, hh, LAT); for (let i = x + 1; i < x + w; i += 2) r(i, y, 1, hh, '#3e3428'); };
  for (const [x, d] of [[15, -1], [31, 1]]) { r(x, 0, 2, 4, '#4a4a4e'); r(x + (d < 0 ? -1 : 2), 0, 1, 2, '#4a4a4e'); r(x + (d < 0 ? 1 : 0), 1, 1, 2, '#8a8a90'); }
  h(3, 15, 32, '#5c5759'); h(2, 17, 30, '#7a757a');
  tileRoof(r, h, 4, [[14, 33], [13, 34], [12, 35], [11, 36], [10, 37], [9, 38], [8, 39], [7, 40]], ROOFC);
  h(12, 9, 38, PL);
  r(12, 13, 24, 6, WT); h(13, 12, 35, PS); win(15, 14, 5, 4); win(28, 14, 5, 4);
  tileRoof(r, h, 19, [[9, 38], [8, 39], [7, 40], [6, 41], [5, 42], [4, 43], [3, 44]], ROOFC);
  for (let k = 0; k < 8; k++) { const y = 15 + k; h(y, 23 - k - 1, 24 + k + 1, '#9a959a'); if (k >= 2) h(y, 23 - k + 2, 24 + k - 2, PL); }
  h(22, 15, 32, '#5c5759'); r(23, 17, 2, 2, '#7a7570');
  h(26, 5, 42, PL);
  r(6, 27, 36, 6, W); h(27, 6, 41, PS); for (const x of [9, 17, 26, 34]) win(x, 28, 5, 4);
  tileRoof(r, h, 33, [[4, 43], [3, 44], [2, 45], [1, 46], [0, 47]], ROOFC);
  h(38, 2, 45, PL); r(4, 39, 40, 3, W); h(39, 4, 43, PS);
  for (let y = 42; y < 48; y++) { const k = (y - 42) >> 1; h(y, 4 - k, 43 + k, (y - 42) % 2 ? ST : SL); }
  for (const y of [44, 46]) h(y, 2, 45, SD);
  for (let x = 7; x < 44; x += 6) { r(x, 42, 1, 2, SD); r(x + 3, 44, 1, 2, SD); r(x, 46, 1, 2, SD); }
});

spotSprites.iwaseBunko = hiCanvas((r, h) => {
  const CON = '#c4c7c6', COL = '#d8d8d5', GL = '#5e6d7a', GLH = '#8fa4b4', BR = '#6e4a3e', BRH = '#82574a', BRM = '#563a32';
  r(18, 8, 30, 34, CON); h(8, 18, 47, COL); h(9, 18, 47, '#a9acab');
  r(24, 11, 22, 16, GL); for (let x = 24; x < 46; x += 3) { r(x, 11, 1, 16, COL); r(x + 1, 11, 2, 3, GLH); } for (let x = 30; x < 44; x += 6) r(x + 1, 16, 2, 9, '#9a6a4a');
  r(44, 9, 4, 18, COL); for (let y = 11; y < 27; y += 3) h(y, 44, 47, '#bdbdba');
  h(27, 18, 47, '#d0d3d2'); h(28, 18, 47, '#9fa2a1');
  r(18, 29, 30, 3, '#353637'); for (let x = 19; x < 47; x += 2) r(x, 29, 1, 3, '#4a4b4c');
  r(18, 32, 30, 10, '#626664'); for (const x of [18, 26, 34, 42]) r(x, 29, 3, 13, '#bcbfbd'); for (let x = 22; x < 46; x += 8) r(x, 33, 2, 8, '#8a9296');
  tileRoof(r, h, 9, [[7, 26], [6, 27], [5, 28]], ['#6a707c', '#585e6c', '#3e434c', '#4e535e']); r(6, 12, 22, 3, '#c8c8c4');
  tileRoof(r, h, 13, [[6, 18], [5, 19], [4, 20], [3, 21], [2, 22]], ['#6a707c', '#4e535e', '#33373e', '#444a54']);
  h(18, 3, 21, '#8a7a70'); r(3, 19, 19, 22, BR);
  for (let y = 20; y < 41; y += 2) { h(y, 3, 21, y % 4 ? BRH : BR); for (let x = 3 + (y % 4 ? 0 : 2); x < 22; x += 4) r(x, y, 1, 1, BRM); }
  for (const [x, y] of [[5, 21], [11, 21], [17, 21], [5, 28], [11, 28], [17, 28], [5, 34], [11, 34], [17, 34]]) { r(x, y, 3, 4, '#c8c0b0'); r(x, y + 1, 3, 3, '#211f23'); r(x + 1, y + 1, 1, 3, '#3a3840'); h(y + 4, x - 1, x + 3, '#b0a898'); }
  h(41, 3, 21, '#4e3a34');
  r(0, 42, 48, 6, '#8a8a88'); spanRows(h, 42, [[0, 16], [0, 12], [0, 8], [0, 5], [0, 3], [0, 1]], '#a89a60'); for (let x = 20; x < 48; x += 5) r(x, 44, 3, 1, '#a0a09c');
});

spotSprites.konoeTei = hiCanvas((r, h) => {
  const RL = '#c4c8cc', RM = '#a8acb2', RD = '#61656d', WD = '#6a5541', WDD = '#26231f', PL = '#e8e6de';
  for (let k = 0; k < 12; k++) { const y = 5 + k; h(y, 21 - k - 1, 22 + k + 1, RD); h(y, 21 - k, 22 + k, RM); if (k >= 3) h(y, 21 - k + 2, 22 + k - 2, '#e8ecee'); }
  r(17, 10, 10, 3, '#3a3a3a'); for (let x = 18; x < 27; x += 2) r(x, 10, 1, 3, '#7a7a7a'); h(16, 9, 34, WD); r(20, 3, 4, 2, '#8a8e94');
  tileRoof(r, h, 15, [[6, 26], [4, 26], [2, 26], [1, 26], [0, 26]], [RL, RM, RD, '#8c9096']);
  r(2, 20, 22, 11, '#3a3530'); for (let x = 2; x < 24; x += 4) { r(x, 20, 1, 11, WD); r(x + 1, 21, 2, 3, '#8a9aa4'); } h(20, 2, 23, WDD); h(24, 2, 23, WD);
  h(31, 1, 24, '#7b554b'); h(32, 1, 24, '#5e3e36'); r(2, 33, 22, 3, '#3a3530'); for (const x of [3, 12, 21]) r(x, 33, 2, 3, WD);
  for (let k = 0; k < 12; k++) { const y = 11 + k; h(y, 34 - k - 1, 35 + k + 1, RD); h(y, 34 - k, 35 + k, WD); if (k >= 3) h(y, 34 - k + 2, 35 + k - 2, PL); }
  r(34, 15, 2, 2, WD); r(30, 19, 1, 3, WD); r(39, 19, 1, 3, WD); r(32, 9, 6, 2, '#8a8e94');
  r(31, 21, 8, 2, '#3a2a1a'); for (const x of [33, 35, 37]) r(x, 21, 1, 1, '#d8c8a0');
  r(24, 23, 22, 5, WDD); for (let x = 25; x < 45; x += 2) r(x, 23, 1, 5, '#8a7050');
  r(24, 23, 2, 19, WD); r(43, 23, 2, 19, WD); r(28, 29, 13, 13, '#141412'); for (let y = 37; y < 42; y += 2) h(y, 28, 40, '#9a9a96'); r(31, 31, 7, 4, '#4a4440');
  r(45, 23, 3, 19, PL); h(41, 22, 47, '#cac2b2');
  r(0, 42, 48, 6, '#e7e5d2'); for (const [x, y, w] of [[3, 44, 5], [11, 46, 4], [18, 44, 4], [26, 46, 4]]) { r(x, y, w, 2, '#8a7a6a'); h(y, x, x + w - 1, '#a89888'); }
  pix(r, ['..######..', '.########.', '##########', '##########'], 0, 38, '#3f7a34'); h(38, 3, 6, '#5a9a44');
});

spotSprites.konrenji = hiCanvas((r, h) => {
  const WG = '#867e7a', LT = '#353332', LG = '#5a5654';
  r(18, 4, 12, 3, '#6d5657'); h(4, 18, 29, '#8a6e6e'); h(6, 17, 30, '#4a3a3a');
  for (let y = 7; y < 22; y++) {
    const k = y - 7, a = Math.round(16 - k * 0.9), b = Math.round(31 + k * 0.9);
    h(y, a, b, y < 11 ? '#ccb5a4' : y < 17 ? '#bda592' : '#ab9888');
    for (let x = a + 1 + (y % 3); x < b; x += 3) r(x, y, 1, 1, y < 11 ? '#bba494' : '#a89282');
  }
  h(22, 1, 46, '#5a4a40'); h(23, 2, 45, '#312c29'); r(1, 21, 1, 1, '#5a4a40'); r(46, 21, 1, 1, '#5a4a40');
  r(4, 24, 40, 2, '#302722'); for (let x = 5; x < 43; x += 2) r(x, 25, 1, 1, '#6a5a4c');
  r(7, 26, 34, 13, LT); for (let y = 27; y < 39; y += 2) h(y, 7, 40, LG); for (let x = 8; x < 40; x += 2) r(x, 26, 1, 13, LG);
  r(21, 27, 6, 6, '#101010'); r(23, 29, 2, 3, '#3a3020');
  for (const x of [7, 14, 20, 27, 33, 40]) r(x, 26, x === 20 || x === 27 ? 1 : 2, 13, WG); h(26, 7, 41, '#9a928e'); h(32, 7, 41, '#9a928e');
  h(39, 2, 45, '#aba29e'); h(40, 2, 45, '#6a625e'); r(3, 41, 42, 4, '#1f1d1c'); for (let x = 4; x < 45; x += 6) r(x, 41, 2, 4, WG);
  h(45, 1, 46, '#d7d4bc'); h(46, 1, 46, '#b8b49e'); r(20, 47, 8, 1, '#c8c4b4');
});

spotSprites.nishioStation = hiCanvas((r, h) => {
  const RD = '#c42234', RH = '#d8404e', RS = '#8e1a28';
  r(0, 0, 16, 5, '#3a3b39'); h(5, 0, 15, '#222321'); r(3, 6, 2, 26, '#5a5b59');
  r(0, 30, 10, 18, '#a2a29f'); r(6, 30, 3, 18, '#d8b860'); for (let y = 31; y < 48; y += 2) r(7, y, 1, 1, '#b89840'); h(30, 0, 9, '#c4c4c0');
  h(11, 14, 34, RS); h(12, 12, 36, RS); r(10, 13, 29, 29, RD); r(10, 13, 2, 29, RH); r(37, 13, 2, 29, RS);
  r(12, 17, 25, 15, '#1a1a1a'); r(13, 18, 23, 13, '#718689'); for (let i = 0; i < 8; i++) r(15 + i, 30 - i, 2, 1, '#a8bcc0');
  r(17, 18, 15, 3, '#111'); h(19, 18, 25, '#ff9a30'); h(19, 27, 30, '#5a8ae0');
  h(33, 10, 38, '#e8e8e8'); r(32, 22, 3, 1, '#d0d0d0');
  for (const x of [13, 31]) { r(x, 35, 5, 3, '#8a8e94'); r(x + 1, 36, 3, 1, '#f4f4e0'); }
  r(22, 36, 5, 2, '#e8e8e8');
  r(12, 41, 25, 4, '#9aa0a6'); r(22, 42, 5, 3, '#333'); h(41, 12, 36, '#b8bec4');
  r(10, 45, 38, 3, '#4a3d30'); for (const x of [15, 33]) r(x, 45, 2, 3, '#9a9a9a');
});

spotSprites.cityhall = hiCanvas((r, h) => {
  const GB = '#527dae', GL = '#678db4', GH = '#cadeec', MU = '#c8d0d8', PN = '#b9bbbb';
  r(0, 24, 7, 17, '#c4c4c0'); for (let y = 26; y < 40; y += 4) r(1, y, 5, 2, GB);
  r(6, 8, 17, 33, '#a8acb0'); r(6, 8, 17, 7, '#88919a'); for (let x = 7; x < 23; x += 2) r(x, 8, 1, 7, '#a2aab2');
  for (const y of [15, 23, 31]) { r(7, y, 15, 7, GB); for (let x = 7; x < 22; x += 3) r(x, y, 1, 7, MU); h(y + 7, 6, 22, '#d8dce0'); h(y, 7, 21, '#8fb0d0'); }
  r(22, 6, 9, 35, PN); h(6, 22, 30, '#d8d8d6'); for (let y = 9; y < 39; y += 4) for (let x = 24; x < 30; x += 3) r(x, y, 1, 1, '#273444');
  r(31, 6, 11, 35, GL); for (let y = 6; y < 41; y += 3) h(y, 31, 41, '#9ab4cc'); for (let x = 33; x < 42; x += 3) r(x, 6, 1, 35, '#9ab4cc');
  for (let i = 0; i < 12; i++) r(31 + Math.floor(i / 2), 7 + i, 3, 1, GH);
  r(42, 18, 6, 23, '#c4c4c0'); for (let y = 20; y < 40; y += 4) r(43, y, 4, 2, GB);
  r(0, 40, 48, 3, '#585854'); r(0, 43, 48, 2, '#556b2f'); h(43, 0, 47, '#6a8a3a'); r(0, 45, 48, 3, '#6a6a6a');
  for (const x of [10, 36]) { r(x, 30, 1, 13, '#5a4030'); r(x - 2, 30, 5, 4, '#a07a50'); r(x - 1, 29, 3, 1, '#a07a50'); }
});

spotSprites.sakanaHiroba = hiCanvas((r, h) => {
  const BN = '#7a6a6e', BL = '#6a5a5e';
  r(0, 16, 48, 2, '#b84a3a'); r(0, 18, 48, 17, '#6e5e62'); for (let x = 1; x < 48; x += 2) r(x, 18, 1, 17, BL);
  r(8, 5, 32, 17, BN); h(5, 8, 39, '#5a4c50'); for (let x = 9; x < 40; x += 2) r(x, 6, 1, 16, BL);
  r(12, 9, 4, 4, '#d6332a'); r(13, 10, 2, 2, '#ffffff'); r(13, 11, 2, 1, '#d6332a');
  pix(r, ['.#..##.#.#..#.##.##', '###.#..###.#.#.#.#', '.#..##.#.#.##.##.#', '.#..#..#.#..#.#..#'], 18, 9, '#ffffff');
  h(16, 14, 33, '#4a4448'); h(17, 10, 37, '#4a4448'); spanRows(h, 17, [[14, 33], [10, 37], [8, 39], [6, 41]], '#ece8e0'); r(6, 20, 1, 1, '#4a4448'); r(41, 20, 1, 1, '#4a4448');
  h(21, 6, 41, '#c8c0b4'); h(22, 8, 39, '#a8a098');
  r(17, 24, 14, 11, '#41403d'); for (const x of [17, 21, 26, 30]) r(x, 24, 1, 11, '#d8d8d4'); h(24, 17, 30, '#d8d8d4');
  for (const [x, c] of [[13, '#e57373'], [19, '#ffffff'], [27, '#3f7fbf'], [33, '#2b2018']]) { r(x, 31, 2, 4, c); r(x, 30, 2, 1, '#f4c58f'); }
  r(8, 21, 1, 20, '#333'); r(39, 21, 1, 20, '#333');
  r(4, 35, 40, 2, '#8a8682'); for (let y = 37; y < 41; y++) h(y, 4 - (y - 37), 43 + (y - 37), y % 2 ? '#5b5754' : '#7a7672');
  r(0, 41, 48, 7, '#cdc9c2'); for (const x of [6, 20, 34]) r(x, 44, 6, 1, '#f4f4f4');
  r(1, 20, 1, 21, '#888'); r(2, 20, 3, 13, '#d06388'); for (let y = 22; y < 32; y += 2) r(3, y, 1, 1, '#ffffff');
  r(46, 22, 1, 19, '#888'); r(43, 22, 3, 12, '#5a5ab0'); for (let y = 24; y < 33; y += 2) r(44, y, 1, 1, '#ffffff');
  pix(r, ['.####', '#####', '#####'], 43, 35, '#4a8a2a');
});

spotSprites.kiraYoshida = hiCanvas((r, h) => {
  const TL = '#9ec0ca', TM = '#7aa4b2', TD = '#4a7a8a', WW = '#ecebe6', BL = '#396d8d';
  r(28, 8, 14, 28, '#d2d0ca'); h(7, 27, 42, '#5a9aa8'); h(8, 28, 41, TD); for (const [x, y] of [[31, 12], [36, 12]]) { r(x, y, 3, 4, '#6f8fa8'); h(y, x, x + 2, '#9fb8cc'); }
  spanRows(h, 12, [[7, 29], [6, 30], [5, 31], [4, 32], [3, 33], [2, 34], [1, 35], [1, 35]], i => i < 3 ? TL : TM);
  for (let x = 2; x < 35; x += 2) r(x, 13, 1, 7, '#b8d6de'); h(20, 0, 36, TD);
  r(1, 21, 35, 14, WW); r(1, 30, 35, 5, '#d8d6d0');
  r(10, 21, 13, 3, '#f8f8f8'); r(11, 22, 1, 1, '#d23a2e'); for (let x = 13; x < 22; x += 2) r(x, 22, 1, 1, '#222'); h(23, 10, 22, BL);
  h(24, 1, 23, BL); h(25, 1, 23, '#2a5a7a'); h(24, 25, 35, BL); h(25, 25, 35, '#2a5a7a');
  r(3, 27, 6, 5, '#6f8fa8'); r(3, 27, 6, 1, '#9fb8cc'); r(14, 27, 6, 8, '#3f4a52'); r(16, 28, 2, 6, '#5a6870');
  r(20, 27, 3, 8, '#2a5fb0'); r(21, 28, 1, 3, '#d8e4f4'); r(9, 31, 2, 4, '#3a6ac0'); r(11, 31, 2, 4, '#3a6ac0');
  r(26, 29, 2, 4, '#d23a2e'); r(26, 33, 1, 2, '#d23a2e'); r(28, 27, 6, 4, '#6f8fa8');
  r(38, 13, 1, 22, '#e8e8e8'); r(46, 13, 1, 22, '#e8e8e8'); r(39, 14, 7, 12, '#f4f0e0'); r(40, 16, 4, 7, '#e0c890'); r(39, 14, 2, 4, '#7fb0d8'); r(44, 20, 2, 5, '#7fb0d8'); r(40, 14, 4, 1, '#3f7fbf');
  r(0, 35, 48, 13, '#585758'); spanRows(h, 38, [[20, 26], [19, 27], [18, 28], [17, 29], [16, 30], [15, 31], [14, 32], [13, 33], [12, 34], [11, 35]], '#8a8a88'); h(40, 30, 47, '#c8a040');
});

spotSprites.daibutsu = hiCanvas((r, h) => {
  const BL = '#d8b088', BM = '#b88c64', BS = '#8a6444', BD = '#5a3e28';
  for (let y = 0; y < 30; y++) for (let x = 6; x < 42; x++) { const d = Math.hypot(x - 24, y - 15); if (d >= 13 && d < 16) r(x, y, 1, 1, (Math.round(Math.atan2(y - 15, x - 24) * 8) % 2) ? '#b08850' : '#c89c64'); }
  for (let y = 0; y < 16; y++) for (let x = 14; x < 34; x++) { const d = Math.hypot(x - 24, (y - 8) * 1.1); if (d >= 6.5 && d < 9) r(x, y, 1, 1, '#b8905a'); }
  spanRows(h, 2, [[22, 25], [21, 26], [20, 27]], BD); for (let x = 20; x < 28; x += 2) r(x, 4, 1, 1, BS);
  spanRows(h, 5, [[20, 27], [19, 28], [19, 28], [19, 28], [19, 28], [20, 27], [20, 27], [21, 26]], BL); r(18, 7, 1, 4, BM); r(29, 7, 1, 4, BM);
  h(8, 20, 22, BS); h(8, 25, 27, BS); r(23, 9, 2, 2, BM); h(11, 22, 25, BS); r(22, 13, 4, 2, BM);
  spanRows(h, 15, [[17, 30], [14, 33], [13, 34], [12, 35], [12, 35], [12, 35], [12, 35], [12, 35], [12, 35], [11, 36], [11, 36], [11, 36]], i => i < 2 ? BL : BM);
  for (const [x, y] of [[14, 18], [15, 22], [33, 19], [32, 23]]) r(x, y, 1, 3, BS); r(23, 16, 2, 6, BS);
  r(15, 15, 4, 6, BL); r(16, 14, 2, 1, BL); h(20, 15, 18, BS); r(29, 18, 4, 4, BL); h(21, 29, 32, BS);
  spanRows(h, 27, [[8, 39], [6, 41], [5, 42], [5, 42]], i => i % 2 ? BM : BL); h(30, 5, 42, BS);
  for (let x = 5; x < 43; x += 4) { r(x, 31, 4, 3, '#c09060'); r(x, 31, 1, 3, BS); h(31, x + 1, x + 2, BL); }
  h(34, 4, 43, '#a87848');
  r(4, 35, 40, 3, '#c8a060'); for (let x = 5; x < 43; x += 2) r(x, 36, 1, 1, '#8a6a3a'); for (const x of [4, 15, 32, 43]) { r(x, 33, 1, 5, '#d8b070'); r(x, 32, 1, 1, '#e8c890'); }
  r(9, 38, 30, 10, '#a8a49c'); h(38, 9, 38, '#c8c4bc'); r(9, 38, 1, 10, '#8a867e'); r(38, 38, 1, 10, '#8a867e'); r(12, 40, 8, 7, '#9a968e'); r(29, 40, 8, 7, '#9a968e');
  pix(r, ['..#..', '.###.', '#####', '.###.', '..#..'], 21, 41, '#c03a28'); r(22, 39, 1, 2, '#3a6a3a'); r(24, 39, 1, 2, '#3a6a3a');
  pix(r, ['...######...', '.##########.', '############', '############', '############', '############', '############'], 0, 41, '#3f7a34'); h(41, 4, 8, '#5a9a44');
});

spotSprites.kurokabe = hiCanvas((r, h) => {
  const WB = '#5d6873', WL = '#4a535e', RC = ['#c8c9ce', '#9e9fa4', '#5e5f64', '#8a8b90'];
  tileRoof(r, h, 5, [[14, 30], [12, 32], [10, 34], [8, 36], [6, 38], [5, 39]], RC);
  r(8, 11, 28, 24, WB); for (let x = 9; x < 36; x += 2) r(x, 11, 1, 24, WL); h(11, 8, 35, '#3a4048');
  r(17, 14, 6, 6, '#81796f'); r(17, 14, 6, 1, '#5a5048'); r(20, 14, 1, 6, '#5a5048'); r(27, 14, 4, 5, '#3a4048');
  tileRoof(r, h, 20, [[3, 14], [2, 15], [1, 16]], RC); r(2, 23, 14, 13, WB); for (let x = 3; x < 16; x += 2) r(x, 23, 1, 13, WL); r(5, 27, 5, 3, '#81796f');
  for (let k = 0; k < 6; k++) h(19 + k, 28 - k * 2, 29 + k * 2, k === 5 ? '#4a4b50' : '#7e7f84');
  r(19, 25, 20, 15, '#3b3739'); for (let x = 20; x < 39; x += 2) r(x, 25, 1, 15, '#4a4648'); r(23, 29, 8, 3, '#8a8070'); r(26, 29, 1, 3, '#3b3739');
  r(40, 29, 4, 6, '#d23a2e'); h(29, 40, 43, '#e8584a'); r(41, 31, 2, 1, '#3a1a1a'); r(41, 35, 2, 4, '#d23a2e'); r(40, 39, 4, 1, '#a8a49c');
  r(0, 40, 48, 8, '#8e8b86'); for (const [x, y] of [[4, 43], [16, 45], [30, 42], [38, 46]]) r(x, y, 5, 1, '#a8a49e');
  pix(r, ['..####', '.#####', '######', '######', '######'], 42, 36, '#3f7a34');
});

spotSprites.ohirune = hiCanvas((r, h) => {
  const BK = '#141314', IN = '#060606', SK = '#9fabbc', SE = '#7b8c95', SA = '#d2c8bc';
  spanRows(h, 38, [[6, 41], [3, 44], [1, 46], [0, 47], [0, 47], [0, 47], [0, 47], [1, 46], [2, 45], [4, 43]], SA);
  for (const [x, y] of [[3, 42], [10, 45], [22, 46], [33, 44], [43, 42], [16, 43]]) r(x, y, 2, 1, '#b8aea0'); for (const [x, y] of [[5, 40], [40, 40], [44, 44]]) r(x, y, 2, 1, '#8a9a5a');
  r(7, 5, 34, 34, BK); for (const x of [11, 23, 35]) r(x, 38, 2, 3, BK);
  for (let x = 8; x < 40; x += 3) r(x, 6, 1, 32, '#1c1a1c');
  const cells = [[10, 8], [21, 8], [32, 8], [10, 19], [21, 19], [32, 19], [10, 30], [21, 30], [32, 30]];
  cells.forEach(([x, y], i) => {
    r(x, y, 8, 8, IN); h(y, x, x + 7, '#1e1c1e');
    const row = Math.floor(i / 3);
    const ox2 = x + 1, oy2 = y + (row === 0 ? 3 : 1);
    r(ox2, oy2, 6, y + 7 - oy2, row === 2 ? SE : SK); if (row === 1) r(ox2, y + 5, 6, 2, SE); if (row === 2) h(y + 6, ox2, ox2 + 5, SA);
  });
  for (const [x, y0, y1] of [[21, 9, 41], [31, 26, 41]]) { r(x, y0, 1, y1 - y0, '#2a2a2e'); r(x + 4, y0, 1, y1 - y0, '#2a2a2e'); for (let y = y0 + 2; y < y1; y += 3) r(x + 1, y, 3, 1, '#4a4a50'); }
});


spotSprites.kamome = hiCanvas((r, h) => {
  const SE = '#6b8796', SL = '#8aa6b4', RK = '#8a847e', RL = '#aaa49e', RD = '#5e5a56';
  spanRows(h, 24, Array.from({ length: 24 }, (_, i) => [Math.max(0, 14 - i), Math.min(47, 33 + i)]), SE);
  for (const [x, y] of [[4, 40], [38, 30], [42, 44], [8, 30]]) h(y, x, x + 3, SL);
  for (let y = 18; y < 48; y++) { const k = (y - 18) / 30, a = Math.round(20 - k * 16), b = Math.round(27 + k * 16); h(y, a, b, RK); }
  for (let y = 20; y < 48; y += 3) { const k = (y - 18) / 30, a = Math.round(20 - k * 16), b = Math.round(27 + k * 16); for (let x = a + ((y / 3) % 2 ? 1 : 3); x < b - 1; x += Math.max(2, Math.round(3 + k * 3))) { r(x, y, Math.max(1, Math.round(1 + k * 2)), 1, RL); r(x - 1, y + 1, 1, 1, RD); } }
  for (let i = 0; i < 7; i++) {
    const k = i / 6, y = Math.round(6 + i * 4.2), s = k < 0.3 ? 1 : k < 0.7 ? 2 : 3;
    for (const side of [-1, 1]) {
      const x = Math.round(23.5 + side * (2 + k * 9)) - s;
      r(x + s, y + s, 1, 2 + s * 2, '#c88a3b');
      h(y, x, x + s * 2, '#d8dce0'); h(y + 1, x, x + s * 2, '#6a727e'); r(x + s * 2 + 1, y, 1, 1, '#e8a040'); if (s > 1) h(y - 1, x + s, x + s * 2, '#e8ecf0');
    }
  }
});

spotSprites.chaen = hiCanvas((r, h) => {
  const TG = '#3f8f3a', TL = '#7fc65e', TD = '#2a5f28', SO = '#a88a62';
  tileRoof(r, h, 5, [[18, 29], [15, 32], [12, 35], [9, 38], [7, 40]], ['#5a585e', '#3e3c42', '#2c292d', '#48464c']); r(22, 3, 4, 2, '#5a585e');
  h(10, 9, 38, '#8a8c90'); for (const x of [10, 23, 37]) r(x, 11, 2, 12, '#7a7d82'); r(15, 17, 18, 2, '#8a6a4a'); r(20, 15, 8, 2, '#a07a58');
  for (let i = 0; i < 3; i++) h(21 + i, 14 - i, 33 + i, i % 2 ? '#8a8a88' : '#a8a8a4');
  for (const y of [25, 32, 39]) {
    h(y, 1, 46, TL); r(0, y + 1, 48, 3, TG); h(y + 4, 0, 47, TD); if (y < 39) h(y + 5, 0, 47, SO); if (y < 39) h(y + 6, 0, 47, SO);
    for (let x = 2 + (y % 2) * 3; x < 46; x += 6) { h(y - 1, x, x + 2, TL); r(x + 4, y + 2, 1, 1, TL); }
  }
});

spotSprites.shokoso = hiCanvas((r, h) => {
  const WD = '#473f41', SJ = '#e8e6e0';
  tileRoof(r, h, 8, [[12, 46], [10, 47], [8, 47], [6, 47], [5, 47]], ['#9aa29e', '#7a827e', '#4a504c', '#6a726e']);
  r(7, 13, 41, 3, '#3a3236'); r(7, 16, 41, 9, SJ); for (let x = 7; x < 48; x += 3) r(x, 16, 1, 9, '#c8c4bc'); h(20, 7, 47, '#c8c4bc');
  r(7, 25, 41, 7, '#262120'); for (let x = 8; x < 48; x += 4) r(x + 1, 26, 2, 3, '#7a8a90');
  for (const x of [7, 17, 27, 37, 47]) r(x, 13, 1, 20, WD);
  h(32, 4, 47, '#5a5054'); h(33, 4, 47, '#3b383c'); for (let x = 6; x < 48; x += 6) r(x, 34, 1, 4, WD);
  for (let i = 0; i < 40; i++) r(Math.round(18 + i * 0.25), 8 + i, 2, 1, i % 5 ? '#6a5a4c' : '#4a3e34');
  for (const [x, y] of [[2, 1], [10, 4], [0, 8], [22, 0]]) { pix(r, PINE, x, y, '#3a5a34'); h(y, x + 2, x + 4, '#5a7a4a'); }
  r(0, 40, 48, 8, '#7a8a5a'); for (const [x, y, w] of [[2, 41, 9], [14, 43, 7], [30, 42, 10]]) { r(x, y, w, 3, '#8a8688'); h(y, x + 1, x + w - 2, '#a8a4a6'); }
  pix(r, ['.####.', '######', '######'], 0, 36, '#4a7a3a');
});

spotSprites.ibunJinja = hiCanvas((r, h) => {
  const CU = '#6f9a8e', CL = '#8fb8aa', CD = '#4a6e64', WD = '#c8b89a', WS = '#8a7a64', DK = '#2b2521';
  spanRows(h, 8, [[14, 33], [11, 36], [8, 39], [6, 41], [4, 43], [3, 44], [2, 45]], i => i < 2 ? CL : CU); h(15, 1, 46, CD); r(1, 14, 1, 1, CD); r(46, 14, 1, 1, CD);
  for (let x = 6; x < 42; x += 3) r(x, 10, 1, 4, '#80aa9c');
  spanRows(h, 9, [[21, 26], [18, 29], [16, 31], [15, 32], [14, 33], [14, 33]], i => i === 0 ? CL : CU); h(14, 14, 33, CD); r(13, 13, 1, 1, CD); r(34, 13, 1, 1, CD);
  r(22, 5, 4, 3, CD); r(23, 4, 2, 1, '#8a6a3a');
  r(6, 16, 36, 15, WS); r(8, 18, 32, 13, DK); for (const x of [6, 13, 20, 27, 34, 41]) r(x, 16, 2, 15, WD); h(16, 6, 42, '#d8ccb0');
  for (let x = 9; x < 40; x += 2) r(x, 19, 1, 5, '#4a3e34');
  r(9, 21, 30, 2, '#e8dcc0'); for (const x of [13, 19, 25, 31, 37]) { r(x, 23, 1, 1, '#ffffff'); r(x + 1, 24, 1, 2, '#ffffff'); }
  h(31, 4, 43, '#8a7a6a'); r(4, 32, 6, 3, WD); r(38, 32, 6, 3, WD); for (let x = 5; x < 43; x += 2) r(x, 32, 1, 3, '#a89878');
  for (let i = 0; i < 5; i++) h(35 + i, 16 - i, 31 + i, i % 2 ? '#8a8886' : '#a8a6a4');
  r(0, 40, 48, 8, '#d8d4cc'); for (const [x, y] of [[4, 43], [12, 46], [36, 44], [42, 46]]) r(x, y, 2, 1, '#b8b4ac');
});

spotSprites.wakuwaku = hiCanvas((r, h) => {
  const BE = '#c8ae8c', BD = '#a48e70';
  r(0, 4, 48, 3, '#4a4a48'); h(7, 0, 47, '#2e2e2c'); r(0, 8, 8, 36, '#3a383c'); for (let y = 10; y < 44; y += 3) h(y, 0, 7, '#4a484c');
  r(8, 8, 26, 36, BE); r(8, 8, 26, 2, BD);
  pix(r, ['..##..', '.####.', '######', '#.##.#', '..##..'], 11, 13, '#5aae2f'); pix(r, ['#.#.##.#.#.##', '.#..#..#.#.#.', '#.#.##.#.#.##'], 19, 14, '#2a2a2a');
  r(12, 23, 16, 9, '#222'); r(13, 24, 6, 7, '#c86a3a'); r(19, 24, 4, 3, '#e8c890'); r(23, 24, 4, 7, '#7a9a5a'); r(19, 27, 4, 4, '#a84a3a');
  r(34, 8, 14, 36, '#3a3a3a'); r(35, 18, 12, 2, '#222'); r(36, 20, 10, 24, '#2a3036'); r(38, 18, 8, 1, '#5aae2f');
  r(30, 28, 18, 16, '#d8d0c4'); for (let x = 31; x < 48; x += 2) r(x, 28, 1, 16, '#b8b0a4'); for (const y of [32, 39]) for (let x = 32; x < 48; x += 4) { r(x, y, 1, 1, '#111'); r(x + 1, y + 1, 1, 1, '#111'); }
  r(0, 44, 48, 4, '#a49e9b'); pix(r, ['.###', '####', '####'], 26, 41, '#4a8a3a');
});

spotSprites.glassMuseum = hiCanvas((r, h) => {
  const WL = '#d8d4cc', WS = '#b8b4ac';
  r(6, 4, 36, 26, WL); r(6, 4, 4, 26, WS); h(4, 6, 41, '#e8e6e0'); for (let y = 10; y < 30; y += 6) h(y, 6, 41, '#c8c4bc');
  for (const [x, y] of [[16, 8], [19, 8], [28, 7], [31, 7], [16, 18], [19, 18], [28, 18], [31, 18]]) { r(x, y, 2, 6, '#2a4a8a'); r(x, y, 1, 2, '#5a7ab8'); }
  r(3, 30, 42, 4, '#f0eee8'); h(33, 3, 44, '#c8c4bc'); r(41, 6, 1, 24, WS);
  r(5, 34, 38, 11, '#3a4248'); for (const x of [5, 11, 17, 23, 29, 35, 42]) r(x, 34, 1, 11, '#b8bcc0');
  for (const [x, y, c] of [[7, 38, '#e57373'], [13, 40, '#ffd54f'], [19, 37, '#64b5f6'], [31, 39, '#81c784'], [37, 37, '#ba68c8']]) r(x, y, 2, 3, c);
  r(24, 36, 4, 9, '#5a6670'); r(0, 45, 48, 3, '#6a6a6a'); r(44, 34, 1, 11, '#333');
});

spotSprites.michinoeki = hiCanvas((r, h) => {
  const RC = ['#5a5e64', '#3e4248', '#24282c', '#4a4e54'];
  tileRoof(r, h, 9, [[6, 21], [4, 23], [2, 25], [1, 26], [0, 27]], RC); spanRows(h, 9, [[13, 14], [12, 15], [11, 16], [10, 17]], '#e8e4d8');
  r(1, 14, 25, 12, '#d8d0c0'); r(4, 17, 6, 9, '#2a3036'); r(14, 17, 9, 6, '#4a5866'); for (const x of [2, 12, 24]) r(x, 14, 1, 12, '#8a8070');
  tileRoof(r, h, 7, [[24, 47], [23, 47], [22, 47], [21, 47], [20, 47], [20, 47]], RC);
  r(21, 13, 27, 13, '#cfc6b4'); r(24, 16, 22, 8, '#2a3036'); for (const x of [27, 34, 41]) { r(x, 14, 2, 12, '#e8e4dc'); r(x, 14, 1, 12, '#ffffff'); }
  r(0, 26, 48, 22, '#6a6a6c'); spanRows(h, 33, [[6, 24], [5, 25], [4, 26], [3, 27], [2, 28], [1, 29]], '#3a8ad8'); for (const x of [8, 14, 20]) r(x, 34, 1, 4, '#ffffff');
  for (const x of [32, 40]) r(x, 30, 1, 12, '#f4f4f4'); h(42, 30, 47, '#c84a4a');
});

spotSprites.isshikiSuwa = hiCanvas((r, h) => {
  const RC = ['#b8bcc2', '#8a8e96', '#4a4e56', '#7a7e86'], WD = '#7a5a40', WL = '#9a7a58', DK = '#3a2a20';
  spanRows(h, 2, [[18, 29], [17, 30]], '#5a5e66'); tileRoof(r, h, 4, [[15, 32], [13, 34], [11, 36], [9, 38], [7, 40], [5, 42], [3, 44], [2, 45]], RC);
  spanRows(h, 5, [[22, 25], [21, 26], [20, 27], [19, 28]], '#e8e4dc'); r(23, 6, 2, 1, '#8a6a3a');
  r(6, 12, 36, 3, '#5a4a3a'); h(12, 6, 41, '#8a7a68');
  r(7, 15, 34, 14, WD); for (const x of [7, 14, 20, 27, 33, 40]) r(x, 15, 1, 14, WL);
  for (let x = 8; x < 40; x += 2) r(x, 16, 1, 4, '#5a4632'); r(15, 21, 5, 8, DK); r(28, 21, 5, 8, DK); r(21, 21, 6, 8, '#2a1e16');
  for (let x = 8; x < 40; x += 3) r(x, 17, 2, 2, '#b89a70');
  h(29, 3, 44, '#8a7a6a'); r(3, 30, 42, 2, WL); for (let x = 4; x < 44; x += 3) r(x, 32, 1, 5, WD); h(36, 2, 45, '#6a5a4a');
  r(0, 37, 48, 6, '#9a968c'); h(37, 0, 47, '#b8b4aa'); r(0, 43, 48, 5, '#c8c4b8');
  r(42, 30, 3, 9, '#9a968c'); r(41, 29, 5, 2, '#b8b4aa');
});

spotSprites.isshikiPort = hiCanvas((r, h) => {
  const WH = '#f0f2f4', WS = '#c8ccd4', BL = '#2f5fae';
  r(0, 0, 20, 3, '#2a4a8a'); r(4, 3, 2, 30, '#2a6ac0'); r(16, 3, 2, 26, '#2a6ac0');
  r(22, 4, 1, 6, '#666'); h(5, 20, 25, '#666');
  r(18, 9, 14, 6, WH); r(19, 11, 12, 2, '#222a30'); h(9, 18, 31, '#ffffff');
  r(10, 15, 30, 8, WH); r(10, 21, 30, 2, WS); for (let x = 12; x < 38; x += 4) r(x, 17, 3, 2, '#2a3440');
  spanRows(h, 23, [[2, 40], [2, 42], [3, 44], [3, 46], [4, 45], [5, 44], [6, 42], [8, 40], [10, 38]], i => i === 3 ? BL : i === 4 ? '#d23a2e' : i >= 6 ? BL : WH);
  for (const [x, c] of [[12, '#e53935'], [13, '#fb8c00'], [14, '#fdd835'], [15, '#43a047'], [16, '#1e88e5']]) r(x, 25, 1, 3, c);
  r(0, 32, 48, 16, '#5a7a8a'); for (const [x, y] of [[3, 36], [20, 40], [34, 35], [40, 44], [10, 44]]) h(y, x, x + 3, '#8aaab8');
  r(0, 30, 10, 6, '#9a9a96'); h(30, 0, 9, '#c8c8c4'); for (let x = 0; x < 10; x += 3) r(x, 33, 2, 1, '#e8c040');
});

spotSprites.kodomoTrain = hiCanvas((r, h) => {
  const WH = '#f4f4f2', WS = '#c8c8c4', DK = '#2a2a2a';
  r(0, 14, 24, 2, WH); h(16, 0, 23, WS); for (const x of [0, 8, 16, 23]) r(x, 16, 1, 8, WS);
  for (const [x, c] of [[2, '#ffb300'], [5, '#5a3418'], [10, '#e57373'], [13, '#2b2018'], [18, '#3f7fbf']]) { r(x, 20, 2, 2, '#f4c58f'); r(x, 22, 2, 2, c); }
  r(0, 24, 24, 8, WH); h(28, 0, 23, '#b8b8b4'); for (let x = 2; x < 23; x += 4) r(x, 25, 2, 2, '#d8d8d4');
  r(25, 11, 9, 2, WH); r(25, 13, 9, 19, WH); r(26, 15, 7, 5, '#2a3440'); r(25, 13, 1, 19, WS);
  r(34, 20, 11, 12, WH); r(34, 20, 11, 2, '#ffffff'); r(37, 13, 4, 7, WH); r(36, 12, 6, 2, WS);
  spanRows(h, 19, [[44, 46], [43, 47], [43, 47], [43, 47], [43, 47], [43, 47], [44, 46]], WS); r(44, 21, 3, 3, DK); r(45, 22, 1, 1, '#c8c8c4');
  for (const x of [3, 15, 27, 38]) { r(x, 31, 5, 5, DK); r(x + 1, 32, 3, 3, '#8a8a8a'); r(x + 2, 33, 1, 1, DK); }
  r(0, 36, 48, 12, '#5a5a5c'); for (let x = 0; x < 48; x += 2) r(x, 40, 1, 1, '#e8c040'); h(41, 0, 47, '#e8c040');
});

spotSprites.tojoJo = hiCanvas((r, h) => {
  const WD = '#5a4a3a', WL = '#7a6650', RF = '#3a3a3a';
  spanRows(h, 1, [[31, 38], [28, 41], [26, 43], [25, 44]], i => i === 3 ? '#222' : RF); r(27, 5, 16, 6, WL); for (let x = 28; x < 43; x += 2) r(x, 5, 1, 6, WD); r(29, 7, 11, 2, '#2a2018');
  h(11, 26, 43, WD); r(28, 12, 2, 26, WD); r(39, 12, 2, 26, WD); r(33, 12, 2, 26, WL);
  for (let y = 14; y < 36; y += 7) { for (let i = 0; i < 6; i++) { r(30 + i, y + i, 1, 1, WL); r(38 - i, y + i, 1, 1, WL); } h(y + 6, 28, 40, WD); }
  spanRows(h, 14, [[6, 19], [4, 21], [3, 22]], i => i === 2 ? '#222' : RF); r(5, 17, 15, 5, WL); r(8, 18, 9, 3, '#2a2018'); for (const x of [5, 19]) r(x, 22, 1, 12, WD);
  for (let x = 0; x < 48; x += 2) if (x < 26 || x > 42) r(x, 26, 1, 9, WL); h(28, 0, 47, WD);
  spanRows(h, 34, [[0, 47], [0, 47], [0, 47]], '#6fa04a'); r(0, 37, 48, 11, '#5a9a3a'); for (const [x, y] of [[4, 40], [18, 43], [36, 41]]) h(y, x, x + 5, '#7fb85a');
  pix(r, ['.####.', '######', '######'], 8, 30, '#3f7a34');
});

spotSprites.myozenji = hiCanvas((r, h) => {
  const RC = ['#8a7a6a', '#6a5e54', '#3a322c', '#5a504a'], WD = '#5a3e2c';
  r(22, 1, 3, 3, '#5a4a3a');
  tileRoof(r, h, 4, [[18, 28], [15, 31], [12, 34], [9, 37], [6, 40], [4, 42], [3, 43]], RC); for (const [x, y] of [[14, 7], [24, 6], [30, 8], [20, 9]]) r(x, y, 2, 1, '#c8a050');
  h(11, 4, 42, '#a89880'); r(8, 12, 30, 20, WD); for (const x of [8, 13, 33, 37]) r(x, 12, 1, 20, '#7a5a40');
  r(14, 13, 19, 14, '#2a1e16'); r(17, 15, 13, 8, '#4a3a2a'); r(21, 18, 5, 4, '#c8a060');
  for (let i = 0; i < 6; i++) h(27 + i, 14 - i, 32 + i, i % 2 ? '#8a7a6a' : '#a89a8a');
  r(38, 16, 10, 18, '#e8e4dc'); tileRoof(r, h, 14, [[37, 47], [37, 47]], ['#4a4e56', '#4a4e56', '#2e3238', '#3a3e44']); for (let y = 20; y < 34; y += 4) h(y, 38, 47, '#c8c4bc');
  r(0, 33, 48, 15, '#b8b4a8'); for (const [x, y] of [[0, 2], [2, 7], [0, 13]]) { pix(r, PINE, x, y, '#3a5a34'); h(y, x + 2, x + 4, '#5a7a4a'); } r(3, 14, 2, 20, '#5a4a3c');
  for (const x of [1, 42]) { pix(r, ['.####.', '######', '######', '.####.'], x, 39, '#3e6b2e'); r(x + 2, 39, 1, 4, '#2c4f20'); r(x + 2, 38, 2, 1, '#6a4a30'); }
});

spotSprites.shioNoSato = hiCanvas((r, h) => {
  const SA = '#c8c2b4', SD = '#a8a294';
  r(0, 4, 48, 12, '#3f7a34'); for (const [x, y] of [[3, 5], [14, 4], [26, 6], [38, 4]]) r(x, y, 6, 2, '#5a9a44'); h(15, 0, 47, '#4a6a3a');
  tileRoof(r, h, 9, [[30, 45], [29, 46], [28, 47]], ['#6a6e74', '#4a4e54', '#2e3238', '#5a5e64']); r(29, 12, 18, 9, '#2e2a28'); for (let x = 30; x < 47; x += 2) r(x, 12, 1, 9, '#3e3a38'); r(35, 15, 4, 6, '#1a1612');
  r(3, 10, 22, 2, '#4a3a2e'); for (const x of [4, 12, 23]) r(x, 12, 1, 8, '#6a5a4a'); for (let x = 6; x < 22; x += 4) r(x, 17, 2, 2, '#a07a50');
  r(0, 20, 48, 28, SA); for (let y = 22; y < 48; y += 3) h(y, 0, 47, SD); h(20, 0, 47, '#8a8478');
  for (let i = 0; i < 18; i++) { r(4 + i, 26 + i, 3, 1, '#5a4a3a'); r(5 + i, 25 + i, 2, 1, '#8a7258'); }
  r(30, 30, 9, 3, '#b0a890'); r(34, 36, 5, 2, '#2a6ac0');
});

spotSprites.waikiki = hiCanvas((r, h) => {
  r(0, 8, 48, 14, '#4f8a3a'); for (const [x, y] of [[2, 9], [14, 8], [30, 10], [40, 9]]) r(x, y, 7, 2, '#6fa85a');
  r(0, 2, 10, 20, '#e8ecee'); r(0, 2, 10, 2, '#c8d0d8'); for (let y = 5; y < 21; y += 2) for (let x = 1; x < 10; x += 2) r(x, y, 1, 1, '#7a9ab8');
  for (const [x, y, w, hh] of [[12, 12, 10, 10], [24, 14, 8, 8], [34, 13, 9, 9]]) { r(x, y, w, hh, '#f4f4f0'); for (let yy = y + 2; yy < y + hh; yy += 2) for (let xx = x + 1; xx < x + w - 1; xx += 2) r(xx, yy, 1, 1, '#8aa0b8'); }
  spanRows(h, 22, [[0, 47], [0, 47], [0, 47], [0, 44], [0, 40], [0, 34], [0, 28]], '#ecdcb4');
  for (const [x, c] of [[10, '#d23a2e'], [22, '#ffb300'], [32, '#3f7fbf']]) { h(20, x - 2, x + 2, c); h(21, x - 3, x + 3, c); r(x, 22, 1, 3, '#555'); }
  spanRows(h, 25, Array.from({ length: 23 }, (_, i) => [i < 6 ? [45, 41, 35, 29, 22, 14][i] : 0, 47]), '#4ab8b0');
  for (let y = 30; y < 48; y += 4) for (let x = (y % 8) * 2; x < 48; x += 10) h(y, x, x + 3, '#8ad8d0'); spanRows(h, 26, [[44, 47], [40, 47], [34, 47]], '#f4f4f0');
});

spotSprites.okazakiCastle = hiCanvas((r, h) => {
  const RC = ['#9aa0a8', '#6a7078', '#3a3e46', '#5a6068'], WL = '#f6f6f2', WS = '#d8d8d4', WN = '#3a3a3a', ST = '#8a8680', SL = '#a8a49e', SD = '#5e5a56';
  for (const [x, d] of [[16, -1], [30, 1]]) { r(x, 0, 2, 3, '#d8a830'); r(x + (d < 0 ? -1 : 2), 0, 1, 2, '#d8a830'); }
  tileRoof(r, h, 3, [[15, 32], [13, 34], [11, 36], [10, 37], [9, 38]], RC); spanRows(h, 1, [[23, 24], [22, 25]], RC[2]);
  r(13, 8, 22, 6, WL); r(13, 8, 3, 6, WS); for (const x of [17, 22, 27, 31]) r(x, 9, 2, 3, WN);
  tileRoof(r, h, 14, [[9, 38], [7, 40], [5, 42], [4, 43], [3, 44]], RC);
  for (let k = 0; k < 6; k++) h(10 + k, 23 - k, 24 + k, k < 2 ? RC[1] : RC[0]); for (let k = 2; k < 6; k++) h(10 + k, 25 - k, 22 + k, WL);
  r(7, 19, 34, 7, WL); r(7, 19, 4, 7, WS); for (const x of [12, 18, 24, 30, 36]) r(x, 21, 2, 3, WN);
  tileRoof(r, h, 26, [[4, 43], [2, 45], [1, 46], [0, 47]], RC);
  r(5, 30, 38, 5, WL); for (const x of [9, 17, 25, 33]) r(x, 31, 3, 2, WN);
  for (let y = 35; y < 48; y++) { const k = (y - 35) >> 2; h(y, 4 - k, 43 + k, (y - 35) % 3 ? ST : SL); }
  for (const y of [38, 42, 46]) h(y, 2, 45, SD); for (let x = 6; x < 44; x += 5) { r(x, 35, 1, 3, SD); r(x + 2, 39, 1, 3, SD); r(x, 43, 1, 3, SD); }
});

spotSprites.misoBarrel = hiCanvas((r, h) => {
  const WD = '#8a6a4a', WH = '#a8845e', WS = '#6a4e34', BD = '#7a3a2a', SG = '#c8c8c4', SL = '#ecece8', SK = '#8a8a86';
  r(0, 0, 48, 45, '#3a322c'); r(0, 0, 48, 6, '#2a2420'); for (let x = 4; x < 48; x += 10) r(x, 0, 2, 40, '#4a3e34'); r(30, 2, 3, 2, '#f4f0d8'); r(36, 6, 10, 14, '#4a4038');
  const barrel = (x0, x1, y0, y1) => {
    r(x0, y0, x1 - x0 + 1, y1 - y0 + 1, WD); r(x0, y0, 3, y1 - y0 + 1, WH); r(x1 - 3, y0, 4, y1 - y0 + 1, WS);
    for (let x = x0 + 4; x < x1 - 3; x += 3) r(x, y0, 1, y1 - y0 + 1, '#7a5a3e');
    for (const y of [y0 + 2, Math.round((y0 * 2 + y1) / 3), Math.round((y0 + y1 * 2) / 3), y1 - 2]) { h(y, x0, x1, BD); h(y + 1, x0, x1, '#5a2a1e'); }
    let w = x1 - x0 - 1, y = y0 - 1;
    for (let x = x0 + 1; w > 1; y -= 2, w -= 4, x += 2) for (let sx = x; sx + 2 <= x + w; sx += 3) { r(sx, y - 1, 3, 2, SG); r(sx, y - 1, 2, 1, SL); r(sx + 2, y, 1, 1, SK); }
  };
  barrel(28, 45, 20, 38); r(27, 39, 20, 4, '#b8402e'); h(39, 27, 46, '#d0583e');
  barrel(2, 24, 16, 40); r(1, 41, 25, 4, '#b8402e'); h(41, 1, 25, '#d0583e'); r(3, 45, 3, 3, '#8a2e20'); r(20, 45, 3, 3, '#8a2e20');
  r(0, 45, 48, 3, '#8a8680');
});

spotSprites.denpark = hiCanvas((r, h) => {
  const RF = '#3e5a46', RH = '#56745e', YL = '#d8c040', YD = '#b8a020';
  for (const x of [4, 14, 36, 44]) { spanRows(h, 0, [[x, x], [x - 1, x + 1], [x - 1, x + 1], [x - 2, x + 2], [x - 2, x + 2], [x - 3, x + 3], [x - 3, x + 3], [x - 3, x + 3]], '#2f5a34'); r(x, 8, 1, 3, '#5a4030'); }
  spanRows(h, 10, [[6, 41], [5, 42], [4, 43], [3, 44], [2, 45], [1, 46]], i => i < 2 ? RH : RF);
  for (const x of [12, 24, 36]) { spanRows(h, 6, [[x, x + 1], [x - 1, x + 2], [x - 2, x + 3], [x - 3, x + 4], [x - 4, x + 5]], RF); spanRows(h, 8, [[x, x + 1], [x - 1, x + 2], [x - 2, x + 3]], '#f0ece0'); r(x, 9, 2, 2, '#c84a3a'); }
  r(0, 16, 48, 4, YL); for (let x = 1; x < 48; x += 2) r(x, 16, 1, 4, YD); h(20, 0, 47, '#8a7a20');
  r(2, 21, 44, 12, '#3a3630'); for (let x = 4; x < 45; x += 5) r(x, 22, 3, 8, '#5a6a72');
  for (const x of [1, 12, 24, 35, 46]) r(x, 20, 1, 14, '#3f7a3a');
  r(0, 33, 48, 2, '#9a968c'); r(0, 35, 48, 13, '#4a4a4c'); for (const x of [8, 22, 36]) r(x, 40, 8, 1, '#e8e8e4');
});

spotSprites.hekinanAquarium = hiCanvas((r, h) => {
  const WH = '#f0f2f4', WS = '#c8d0d8', BL = '#2a5fae', BL2 = '#4a8ad0';
  r(16, 2, 14, 9, '#d0d8e0'); r(18, 3, 4, 5, BL); r(24, 3, 4, 5, BL); r(19, 4, 2, 2, WH); r(25, 4, 2, 2, WH);
  r(10, 3, 2, 8, WS);
  r(0, 10, 34, 22, WH); r(0, 10, 34, 1, '#d8dce0'); h(14, 0, 33, BL); h(15, 0, 33, BL); h(19, 0, 33, BL2);
  r(34, 16, 14, 16, WH); spanRows(h, 12, [[36, 46], [35, 47], [34, 47], [34, 47]], '#8a96a0'); for (let x = 35; x < 47; x += 2) r(x, 13, 1, 3, '#d8dce4'); h(20, 34, 47, BL);
  r(36, 22, 10, 10, '#2a3440'); for (const x of [38, 42]) r(x, 22, 1, 10, WS);
  for (const x of [2, 9, 16, 23, 30]) r(x, 22, 1, 13, '#2a2a2e'); h(22, 0, 32, '#2a2a2e'); h(23, 0, 32, '#4a4a50');
  r(0, 32, 48, 16, '#a86a52'); for (let y = 34; y < 48; y += 3) for (let x = (y % 2) * 3; x < 48; x += 6) r(x, y, 4, 1, '#c88a6a');
  r(30, 34, 10, 4, WH); r(31, 32, 8, 2, '#3f8a34'); r(33, 28, 2, 4, '#6a6a6a');
});

spotSprites.kawaraMuseum = hiCanvas((r, h) => {
  const BN = '#c8b8a4', BS = '#a89480', ST = '#9a5a4a', TP = '#d8c8b4';
  r(8, 18, 40, 20, BN); r(16, 12, 32, 7, BN); r(26, 7, 22, 6, BS);
  for (const [x0, y] of [[16, 12], [26, 7]]) for (let x = x0 + 1; x < 45; x += 7) spanRows(h, y - 4, [[x + 2, x + 3], [x + 1, x + 4], [x, x + 5], [x, x + 5]], TP);
  for (const y of [15, 21, 26, 31]) h(y, 8, 47, ST); h(10, 26, 47, ST);
  for (let x = 22; x < 47; x += 4) r(x, 22, 1, 12, BS);
  r(16, 32, 28, 6, '#3a3a3e'); h(31, 14, 45, '#8a7a6a'); for (const x of [22, 30, 38]) r(x, 32, 1, 6, '#9aa0a6');
  r(0, 6, 11, 18, '#3f8a34'); r(2, 8, 5, 3, '#5aaa44'); r(6, 14, 4, 3, '#5aaa44'); r(5, 24, 2, 14, '#5a4030');
  for (const x of [12, 40]) { r(x, 33, 5, 6, '#6a6a68'); r(x + 1, 31, 3, 2, '#7a7a78'); r(x + 1, 34, 1, 1, '#2a2a2a'); r(x + 3, 34, 1, 1, '#2a2a2a'); }
  r(0, 38, 48, 3, '#c84a3a'); h(38, 0, 47, '#e85a4a'); r(0, 41, 48, 7, '#9a9894');
});

spotSprites.jissoji = hiCanvas((r, h) => {
  for (const [x, y] of [[0, 0], [38, 1], [3, 5], [41, 6]]) { pix(r, PINE, x, y, '#2f5a34'); h(y, x + 2, x + 4, '#4f7a4a'); }
  r(3, 9, 2, 26, '#5a4636'); r(43, 10, 2, 25, '#5a4636');
  for (let y = 8; y < 22; y++) { const k = y - 8, a = Math.round(17 - k * 1.1), b = Math.round(30 + k * 1.1); h(y, a, b, y < 12 ? '#b0a8a4' : y < 18 ? '#968c88' : '#847a76'); for (let x = a + 1 + (y % 2); x < b; x += 2) r(x, y, 1, 1, y < 12 ? '#a09894' : '#7a706c'); }
  r(18, 6, 12, 2, '#6a605c'); h(22, 0, 47, '#4a403c'); h(23, 2, 45, '#2a2420');
  r(6, 24, 36, 13, '#2a2226'); for (const x of [6, 13, 20, 27, 34, 41]) r(x, 24, 2, 13, '#4a3a32'); for (let x = 15; x < 33; x += 2) r(x, 27, 1, 8, '#3a2e28');
  h(37, 4, 43, '#7a7068'); for (let x = 2; x < 46; x += 3) r(x, 38, 1, 5, '#4a4a50'); h(39, 0, 47, '#4a4a50'); h(42, 0, 47, '#4a4a50');
  r(0, 43, 48, 5, '#a8a49a');
});

spotSprites.kumakuJinja = hiCanvas((r, h) => {
  const RC = ['#c8ccd2', '#9aa0a8', '#4a4e56', '#868c94'], WD = '#7a5a48', DK = '#3a2a24';
  for (const x of [0, 38]) { r(x, 0, 10, 16, '#3f6a34'); r(x + 2, 1, 5, 3, '#5a8a44'); }
  tileRoof(r, h, 3, [[14, 33], [12, 35], [10, 37], [8, 39], [6, 41], [5, 42]], RC); spanRows(h, 3, [[22, 25], [21, 26], [20, 27]], '#e8e4dc');
  r(9, 9, 30, 13, WD); r(16, 11, 16, 11, DK); for (const x of [9, 15, 32, 38]) r(x, 9, 1, 13, '#9a7a62'); h(12, 17, 30, '#e8dcc0'); for (const x of [19, 24, 29]) r(x, 13, 1, 2, '#ffffff');
  r(23, 9, 2, 2, '#c8a050'); h(22, 6, 41, '#8a8682'); for (let x = 7; x < 41; x += 3) r(x, 20, 1, 2, '#c84a3a');
  for (let i = 0; i < 13; i++) h(23 + i * 2, 17 - i, 30 + i, i % 2 ? '#7a7672' : '#9a9692'), h(24 + i * 2, 17 - i, 30 + i, '#5a5652');
  for (const s of [-1, 1]) for (let i = 0; i < 12; i++) r(s < 0 ? 15 - i : 32 + i, 23 + i * 2, 1, 3, '#b8b4ac');
  r(0, 26, 6, 22, '#8a8682'); r(42, 26, 6, 22, '#8a8682'); for (let y = 28; y < 48; y += 4) { h(y, 0, 5, '#a8a49e'); h(y, 42, 47, '#a8a49e'); }
});

spotSprites.choenji = hiCanvas((r, h) => {
  r(0, 0, 14, 20, '#2f5a2a'); r(34, 0, 14, 20, '#2f5a2a'); for (const [x, y] of [[2, 2], [8, 8], [36, 3], [42, 10]]) r(x, y, 4, 3, '#4f7a3e');
  r(4, 11, 40, 7, '#f0ece2'); tileRoof(r, h, 9, [[3, 44], [3, 44]], ['#5a5e64', '#5a5e64', '#2e3238', '#4a4e54']); for (let y = 13; y < 18; y += 2) h(y, 4, 43, '#d8d4ca');
  tileRoof(r, h, 2, [[17, 30], [15, 32], [13, 34], [12, 35], [11, 36]], ['#7a7e86', '#4e5150', '#2a2d2c', '#5e6160']); r(23, 0, 2, 2, '#3a3d3c');
  r(14, 7, 2, 11, '#4a3628'); r(32, 7, 2, 11, '#4a3628'); r(16, 8, 16, 10, '#1a1612'); r(19, 10, 10, 8, '#3a4a2a');
  for (let y = 18; y < 48; y++) { const k = y - 18, a = Math.max(0, 13 - Math.round(k * 0.5)), b = Math.min(47, 34 + Math.round(k * 0.5)); const t = k % 3; h(y, a, b, t === 0 ? '#9aa07e' : t === 1 ? '#7a7d5b' : '#5a5e44'); }
  for (let y = 20; y < 48; y += 3) for (let x = 6 + (y % 2) * 4; x < 42; x += 8) r(x, y, 3, 1, '#6a8a3a');
});

spotSprites.yojuji = hiCanvas((r, h) => {
  const RC = ['#c8ccd2', '#9aa0a8', '#4a4e56', '#868c94'], WD = '#8a7a6a', DK = '#3a3230';
  tileRoof(r, h, 6, [[6, 24], [4, 26], [2, 28], [1, 29], [0, 30], [0, 30]], RC); spanRows(h, 4, [[13, 17], [12, 18]], RC[1]); spanRows(h, 7, [[14, 16], [13, 17]], '#e8e4dc');
  r(2, 12, 26, 15, WD); r(8, 15, 14, 12, DK); for (const x of [2, 7, 22, 27]) r(x, 12, 1, 15, '#a8988a'); for (let x = 9; x < 21; x += 2) r(x, 15, 1, 6, '#5a4e46');
  spanRows(h, 8, [[34, 41], [32, 43], [31, 44], [30, 45]], i => i === 3 ? RC[2] : RC[1]); r(30, 10, 1, 1, RC[2]); r(45, 10, 1, 1, RC[2]); r(36, 6, 4, 2, RC[0]);
  for (const x of [32, 43]) r(x, 12, 2, 14, '#6a5a4a'); r(35, 13, 6, 6, '#5a7a62'); h(18, 35, 40, '#3a5a44'); r(37, 12, 2, 1, '#333'); r(31, 22, 14, 4, '#9a968c');
  r(0, 27, 48, 21, '#c8c4bc'); for (const [x, y] of [[4, 32], [16, 38], [30, 34], [40, 42], [8, 44]]) r(x, y, 3, 1, '#a8a49c');
});

spotSprites.kojuin = hiCanvas((r, h) => {
  const RC = ['#b8bcc2', '#8a8e94', '#3a3e44', '#7a7e84'];
  tileRoof(r, h, 4, [[14, 33], [12, 35], [10, 37], [8, 39], [6, 41], [4, 43], [2, 45], [1, 46]], RC); spanRows(h, 5, [[22, 25], [21, 26], [20, 27], [19, 28]], '#e8e4dc');
  r(5, 12, 38, 14, '#5a4a40'); r(12, 15, 24, 11, '#1d1d22'); for (const x of [5, 11, 36, 42]) r(x, 12, 1, 14, '#7a6a5a'); for (let x = 13; x < 35; x += 3) r(x, 15, 1, 6, '#3a3430');
  r(40, 22, 3, 8, '#9a968c'); r(39, 21, 5, 2, '#b8b4ac');
  r(0, 26, 48, 4, '#b8b2a6');
  for (const y of [30, 37]) { h(y, 1, 46, '#7fc65e'); r(0, y + 1, 48, 3, '#3f8f3a'); h(y + 4, 0, 47, '#2a5f28'); if (y < 37) { h(y + 5, 0, 47, '#a88a62'); h(y + 6, 0, 47, '#a88a62'); } for (let x = 2 + (y % 2) * 3; x < 46; x += 6) h(y - 1, x, x + 2, '#7fc65e'); }
  r(0, 42, 48, 6, '#a88a62');
});

spotSprites.isshikiManabi = hiCanvas((r, h) => {
  for (let x = 16; x < 36; x++) { const t = (x - 16) / 19, c = t < 0.25 ? '#c8b8ac' : t < 0.6 ? '#a8968a' : t < 0.85 ? '#8a786e' : '#6a5a52'; r(x, 4, 1, 26, c); }
  h(3, 17, 34, '#d8c8bc'); h(4, 16, 35, '#7a6a60'); for (let y = 9; y < 30; y += 5) h(y, 16, 35, '#9a887c');
  r(0, 25, 48, 13, '#d8d2c8'); h(25, 0, 47, '#e8e2d8'); h(26, 0, 47, '#b8b2a8');
  for (let x = 1; x < 47; x += 5) { r(x, 27, 2, 11, '#f0ece4'); r(x + 2, 27, 3, 10, '#4a4a46'); }
  r(0, 38, 48, 10, '#7a7a78'); for (let x = 3; x < 48; x += 8) r(x, 40, 1, 6, '#f4f4f4'); r(40, 34, 8, 4, '#2a6ac0'); r(41, 35, 6, 1, '#d8e4f4');
});

spotSprites.sakushimaPort = hiCanvas((r, h) => {
  r(0, 22, 48, 26, '#6a8a9a'); for (const [x, y] of [[3, 26], [14, 30], [6, 34]]) h(y, x, x + 4, '#8aaab8');
  spanRows(h, 30, Array.from({ length: 18 }, (_, i) => [Math.max(0, 22 - i * 2), 47]), '#c8c0a4'); for (const [x, y] of [[26, 38], [34, 44], [20, 46]]) r(x, y, 3, 1, '#a8a088');
  spanRows(h, 4, [[28, 45], [27, 46], [26, 47]], '#3a3c40'); r(28, 7, 18, 19, '#2e2a2c'); for (let x = 29; x < 46; x += 3) r(x, 7, 1, 19, '#3e3a3c'); r(30, 11, 6, 5, '#7a7a74'); r(38, 18, 5, 8, '#1a1618');
  r(19, 1, 8, 30, '#f4f4f2'); r(19, 1, 1, 30, '#c8c8c4'); r(21, 0, 4, 1, '#e8e8e4');
  for (let y = 3; y < 28; y += 2) r(22, y, 2, 1, y < 13 ? '#2a3a6a' : '#1a1a1a'); r(18, 31, 10, 2, '#8a8680');
  r(4, 25, 10, 2, '#e8e2d0'); r(5, 24, 3, 1, '#c84a3a');
});

spotSprites.ouraBeach = hiCanvas((r, h) => {
  r(0, 24, 48, 24, '#8aa86a'); for (const [x, y] of [[4, 28], [30, 30], [40, 40], [10, 42]]) h(y, x, x + 5, '#a8c48a');
  spanRows(h, 30, Array.from({ length: 18 }, (_, i) => [14 - Math.round(i * 0.6), 20 + Math.round(i * 0.7)]), '#d8d2b8');
  spanRows(h, 2, [[24, 33], [21, 36], [19, 38], [18, 39]], i => i === 3 ? '#2a2420' : '#4a3e34');
  r(20, 6, 18, 2, '#5a4a3a'); for (let x = 21; x < 38; x += 3) r(x, 8, 1, 5, '#6a5a48'); h(8, 20, 37, '#6a5a48'); r(20, 13, 18, 2, '#7a6650');
  for (const x of [21, 36]) r(x, 15, 2, 15, '#4a3e34'); r(28, 15, 2, 15, '#5a4a3a');
  for (let i = 0; i < 12; i++) r(38 + Math.floor(i / 2), 14 + i, 3, 1, '#7a6650');
  r(0, 16, 14, 9, '#3f7a34'); r(2, 15, 9, 2, '#5a9a44'); r(40, 18, 8, 7, '#3f7a34');
});

spotSprites.koganeZutsumi = hiCanvas((r, h) => {
  for (let i = 0; i < 6; i++) { const x = i * 8 - 1, y = 6 + (i % 2) * 2; spanRows(h, y, [[x + 2, x + 8], [x, x + 10], [x, x + 10], [x, x + 10], [x + 1, x + 9], [x + 2, x + 8]], '#4a7a3a'); r(x + 2, y + 1, 4, 2, '#6a9a54'); r(x + 5, y + 6, 1, 6, '#5a4434'); }
  spanRows(h, 16, [[0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47]], i => i < 2 ? '#7aa25a' : i < 5 ? '#6a9a4a' : '#5a8a3e');
  r(0, 24, 48, 12, '#9a9690'); for (let x = 2; x < 48; x += 9) r(x, 29, 5, 1, '#b8b4ae');
  h(34, 0, 47, '#f4f4f2'); for (let x = 1; x < 48; x += 4) r(x, 34, 1, 5, '#f4f4f2'); h(37, 0, 47, '#e8e8e4');
  r(0, 39, 48, 9, '#6a9a4a'); r(4, 18, 6, 5, '#f0ece0'); r(5, 19, 4, 2, '#c84a3a'); r(6, 23, 1, 4, '#5a5a5a');
});

spotSprites.ozakiShiro = hiCanvas((r, h) => {
  const RC = ['#7a8088', '#4a5058', '#24282e', '#3a4048'];
  for (let k = 0; k < 12; k++) h(4 + k, 26 - k * 2, 27 + k * 2, k < 2 ? RC[2] : RC[1]); for (let k = 2; k < 12; k++) h(4 + k, 28 - k * 2, 25 + k * 2, '#f4f2ec');
  r(22, 8, 6, 3, '#2a2a2a');
  tileRoof(r, h, 14, [[1, 47], [0, 47], [0, 47]], RC);
  r(2, 17, 44, 22, '#f4f2ec'); r(2, 17, 6, 22, '#d8d6d0'); for (let y = 30; y < 39; y += 3) h(y, 2, 45, '#c8ccd4');
  r(10, 20, 3, 18, '#ffffff'); r(9, 20, 1, 18, '#c8c8c4'); r(14, 21, 7, 17, '#1a1a1a'); r(30, 22, 12, 9, '#2a2a2a'); for (let x = 31; x < 42; x += 2) r(x, 22, 1, 9, '#5a5a5a');
  r(24, 31, 9, 13, '#c8c4bc'); h(31, 24, 32, '#e0dcd4'); spanRows(h, 22, [[26, 30], [25, 31], [24, 32], [24, 32], [25, 31], [23, 33], [22, 34], [22, 34], [22, 34]], '#6a5a46'); r(26, 23, 4, 3, '#8a7a62');
  r(40, 0, 3, 39, '#8a7a6a'); for (let y = 2; y < 39; y += 3) r(40, y, 3, 1, '#6a5a4a');
  r(0, 39, 48, 9, '#b8b4ac'); pix(r, ['..####..', '.######.', '########'], 2, 36, '#3f7a34');
});

spotSprites.hazuJinja = hiCanvas((r, h) => {
  const ST = '#c8c4bc', SL = '#e0dcd4', SD = '#9a968e';
  r(0, 4, 10, 30, '#2f5a2a'); r(36, 4, 12, 30, '#2f5a2a'); for (const [x, y] of [[2, 6], [38, 8], [42, 18], [4, 20]]) r(x, y, 4, 3, '#4f7a3e');
  h(5, 4, 39, ST); h(4, 5, 38, SL); r(3, 3, 2, 2, ST); r(39, 3, 2, 2, ST); h(6, 6, 37, SD);
  h(10, 8, 35, ST); h(11, 8, 35, SD); r(19, 7, 6, 3, '#4a4a4a');
  r(10, 7, 4, 28, ST); r(10, 7, 1, 28, SL); r(13, 7, 1, 28, SD); r(30, 7, 4, 28, ST); r(30, 7, 1, 28, SL); r(33, 7, 1, 28, SD);
  r(9, 34, 6, 3, SD); r(29, 34, 6, 3, SD);
  spanRows(h, 14, Array.from({ length: 34 }, (_, i) => [20 - Math.round(i * 0.45), 23 + Math.round(i * 0.45)]), '#a8a49c'); for (let y = 16; y < 48; y += 3) h(y, 20 - Math.round((y - 14) * 0.45), 23 + Math.round((y - 14) * 0.45), '#8a867e');
  r(38, 2, 6, 40, '#b8b4aa'); r(38, 2, 1, 40, '#d0ccc2'); for (let y = 6; y < 38; y += 5) r(40, y, 2, 3, '#3a3a3a');
  r(0, 34, 18, 14, '#a88a5a'); r(28, 38, 10, 10, '#a88a5a'); r(44, 38, 4, 10, '#a88a5a');
});

spotSprites.nishiHazu = hiCanvas((r, h) => {
  const RC = ['#8a7a6a', '#6a5a4a', '#3a2e24', '#5a4a3c'], WL = '#efe6d2', FR = '#6a3a2a';
  tileRoof(r, h, 6, [[12, 37], [9, 40], [6, 43], [4, 45], [2, 46], [1, 47]], RC);
  r(3, 12, 42, 24, WL); for (let y = 14; y < 36; y += 2) h(y, 3, 44, '#d8ceb8'); for (const x of [3, 12, 44]) r(x, 12, 1, 24, FR);
  r(26, 13, 14, 5, '#ffffff'); r(27, 14, 3, 3, '#2a8ad0'); for (let x = 31; x < 39; x += 2) r(x, 15, 1, 1, '#2a5a8a');
  r(14, 19, 32, 2, FR); r(14, 21, 32, 13, '#e8e0cc'); for (const x of [14, 22, 31, 39, 45]) r(x, 21, 1, 13, FR); for (const x of [24, 33, 41]) r(x, 23, 6, 7, '#9ab4c4');
  r(15, 23, 5, 11, '#5a6a72'); r(16, 24, 3, 4, '#c8d4dc');
  r(0, 26, 6, 10, '#3f7a34'); r(1, 25, 4, 1, '#5a9a44');
  r(44, 25, 3, 6, '#d23a2e'); r(45, 31, 1, 5, '#555'); h(36, 0, 47, '#9a9a96'); r(0, 37, 48, 11, '#8a8a88');
});

spotSprites.higashiHazu = hiCanvas((r, h) => {
  const RD = '#c84a3a', RL = '#e06a50', RS = '#8a2e22';
  spanRows(h, 8, [[8, 40], [6, 42], [4, 44], [2, 46], [1, 47], [0, 47]], i => i < 2 ? RL : RD); for (let x = 2; x < 47; x += 2) r(x, 9, 1, 5, RS); h(14, 0, 47, RS);
  r(1, 15, 46, 20, '#f0e8e4'); r(1, 15, 46, 2, '#d8d0cc'); h(26, 1, 46, '#c88a8a');
  r(16, 10, 14, 6, '#ffffff'); r(17, 11, 3, 2, '#3f9a5a'); for (let x = 21; x < 29; x += 2) r(x, 12, 1, 2, '#2a2a2a'); h(15, 16, 29, '#3f9a5a');
  r(3, 18, 8, 7, '#7a9ab0'); r(13, 18, 6, 17, '#3a4650'); r(22, 18, 9, 7, '#7a9ab0'); r(34, 18, 9, 7, '#9ab4c4');
  r(24, 27, 4, 7, '#3fae5a'); r(25, 28, 2, 3, '#e8f4e8'); r(30, 28, 3, 5, '#d23a2e'); r(31, 33, 1, 2, '#555');
  r(0, 35, 48, 13, '#8a8a88'); for (const x of [6, 22, 38]) r(x, 40, 6, 1, '#a8a8a4');
});

spotSprites.tobaShinmei = hiCanvas((r, h) => {
  const RC = ['#c8ccd2', '#9aa0a8', '#4a4e56', '#868c94'];
  r(0, 0, 48, 10, '#2f5a2a'); for (const [x, y] of [[4, 2], [16, 1], [28, 3], [40, 1]]) r(x, y, 5, 3, '#4f7a3e');
  tileRoof(r, h, 6, [[14, 33], [11, 36], [9, 38], [7, 40], [6, 41]], RC); spanRows(h, 6, [[22, 25], [21, 26]], '#e8e4dc');
  r(9, 11, 30, 11, '#7a5a40'); r(10, 13, 28, 6, '#f8f8f6'); for (let x = 10; x < 38; x += 4) r(x, 13, 1, 6, '#d8d8d4');
  for (const x of [14, 22, 30]) { r(x, 14, 4, 4, '#1a1a1a'); r(x + 1, 15, 2, 2, '#f8f8f6'); }
  r(20, 19, 8, 3, '#3a2a20');
  r(4, 22, 40, 8, '#9a968c'); for (let y = 24; y < 30; y += 2) h(y, 4, 43, '#7a766c'); for (let x = 6; x < 44; x += 5) r(x, 22, 1, 8, '#7a766c');
  for (let i = 0; i < 9; i++) h(22 + i, 18 - i, 29 + i, i % 2 ? '#8a8682' : '#aaa6a0');
  for (const x of [1, 44]) { r(x, 6, 3, 26, '#f8f8f6'); for (let y = 8; y < 30; y += 3) r(x + 1, y, 1, 2, '#1a1a1a'); r(x + 3, 6, 1, 36, '#6a5040'); }
  r(0, 31, 48, 17, '#b8b2a6'); for (const [x, y] of [[8, 36], [30, 40], [16, 44]]) r(x, y, 3, 1, '#9a9488');
});

spotSprites.kasuyaTei = hiCanvas((r, h) => {
  r(0, 4, 12, 34, '#2a2522'); for (let x = 1; x < 12; x += 3) r(x, 4, 1, 34, '#3c3632'); tileRoof(r, h, 1, [[0, 13], [0, 14], [0, 15]], ['#6a6e74', '#4a4e54', '#2e3238', '#5a5e64']);
  spanRows(h, 0, [[18, 40], [14, 44], [12, 46], [11, 47], [12, 47], [13, 46], [14, 45], [16, 43], [18, 40], [21, 36], [24, 33]], '#3f6a34'); for (const [x, y] of [[16, 2], [26, 1], [36, 3], [30, 6], [20, 6], [41, 5]]) r(x, y, 5, 2, '#5a8a44');
  r(25, 16, 7, 24, '#7a6a5a'); r(25, 16, 2, 24, '#9a8a78'); r(29, 22, 2, 8, '#5a4a3c');
  for (let i = 0; i < 8; i++) { r(25 - i, 16 - i, 2, 1, '#7a6a5a'); r(31 + i, 15 - i, 2, 1, '#7a6a5a'); r(28, 12 - i, 1, 1, '#7a6a5a'); }
  r(20, 38, 18, 3, '#4a6a3a'); for (let x = 19; x < 39; x += 3) r(x, 40, 2, 2, '#a8a49c');
  r(14, 22, 7, 6, '#f8f8f6'); spanRows(h, 20, [[16, 18], [15, 19]], '#e8e8e4'); r(17, 28, 1, 12, '#c8c8c4');
  r(0, 38, 48, 10, '#d8d0c0'); for (const [x, y] of [[4, 42], [40, 44], [10, 46]]) r(x, y, 3, 1, '#b8b0a0');
});

spotSprites.yatsuomote = hiCanvas((r, h) => {
  r(14, 6, 22, 3, '#f0ece4'); h(9, 14, 35, '#a8a49c'); r(16, 10, 18, 6, '#c8a07a'); for (let x = 17; x < 34; x += 3) r(x, 10, 1, 6, '#a8805a');
  r(12, 16, 26, 3, '#f0ece4'); h(19, 12, 37, '#a8a49c'); for (let x = 13; x < 37; x += 2) r(x, 14, 1, 2, '#5a5a5a');
  r(17, 20, 16, 10, '#c8a07a'); r(17, 20, 3, 10, '#d8b890'); for (let y = 22; y < 30; y += 2) h(y, 17, 32, '#b08a64'); r(24, 23, 3, 4, '#3a3a3a');
  r(15, 30, 20, 3, '#f0ece4'); r(19, 33, 12, 9, '#e8e4dc'); r(23, 35, 4, 7, '#4a4a4a');
  for (const [x0, d] of [[6, 1], [42, -1]]) { r(x0, 10, 2, 32, '#5a4a40'); for (let i = 0; i < 8; i++) { r(x0 + d * i, 18 - i, 1, 1, '#6a5a4c'); r(x0 + d * (i + 1), 26 - i, 1, 1, '#6a5a4c'); } }
  r(0, 42, 48, 6, '#7a6a52'); for (let x = 2; x < 48; x += 5) r(x, 42, 2, 2, '#9a8a6a');
});


spotSprites.kozenji = hiCanvas((r, h) => {
  const W = '#f0efea', K = '#3a3634';
  h(4, 13, 34, '#3e4450'); r(12, 2, 2, 2, '#3e4450'); r(34, 2, 2, 2, '#3e4450');
  tileRoof(r, h, 5, [[12, 35], [11, 36], [10, 37], [9, 38], [8, 39], [7, 40], [6, 41], [5, 42], [4, 43], [3, 44], [2, 45], [1, 46]], ['#9aa6b6', '#6e7888', '#3e4450', '#59606c']);
  r(4, 17, 40, 19, W); h(17, 4, 43, K); h(22, 4, 43, K); h(35, 4, 43, K);
  for (const x of [4, 10, 16, 31, 37, 43]) r(x, 17, 1, 19, K);
  r(18, 24, 12, 11, '#8a6848'); for (let x = 20; x < 30; x += 3) r(x, 24, 1, 11, '#6a4e34'); h(24, 18, 29, '#6a4e34');
  r(7, 25, 5, 5, '#5a5048'); r(8, 24, 3, 1, '#5a5048'); r(8, 26, 3, 3, '#8a8078');
  r(5, 36, 38, 2, '#8a867c');
  spanRows(h, 3, [[38, 41], [36, 43], [35, 44], [34, 45], [33, 46], [32, 46], [32, 47], [31, 47], [31, 47], [30, 47], [30, 47], [29, 47], [29, 47], [30, 47], [30, 47], [31, 47], [31, 46], [32, 46], [33, 45], [34, 44], [35, 43], [36, 42]], '#5d6a25');
  for (let y = 4; y < 25; y++) for (let x = 30 + (y * 7) % 3; x < 47; x += 3) { const v = (x * 13 + y * 7) % 5; if (v === 0) r(x, y, 1, 1, '#8a9a3a'); else if (v === 1) r(x, y, 1, 1, '#3b4a17'); }
  r(38, 25, 2, 15, '#5a4030');
  r(3, 6, 1, 30, '#7a6a5a'); for (const [x, y] of [[1, 8], [4, 11], [0, 14], [5, 9]]) r(x, y, 1, 5, '#7a6a5a');
  r(0, 38, 48, 10, '#a8a090'); spanRows(h, 38, [[20, 27], [19, 28], [19, 28], [18, 29], [18, 29], [17, 30], [17, 30], [16, 31], [16, 31], [15, 32]], '#c4c0b6');
});

spotSprites.terazuHachiman = hiCanvas((r, h) => {
  r(23, 1, 2, 3, '#2c2e32'); r(22, 2, 4, 1, '#c8a040');
  for (let k = 0; k < 19; k++) { const y = 4 + k, a = Math.round(23 - 1.15 * k - 1), b = Math.round(24 + 1.15 * k + 1); h(y, a, b, '#2c2e32'); if (k > 1) h(y, a + 1, Math.round(23 - 0.2 * k), '#697485'); if (k > 1) h(y, Math.round(23 - 0.2 * k) + 1, b - 1, '#4a4e56'); }
  for (let k = 4; k < 13; k++) h(4 + k, 23 - Math.round(k * 0.55), 24 + Math.round(k * 0.55), '#3a2c22');
  r(22, 9, 4, 2, '#c8a040'); r(20, 13, 8, 1, '#c8a040'); r(23, 14, 2, 2, '#c8a040');
  h(22, 3, 44, '#202224'); r(2, 21, 1, 1, '#202224'); r(45, 21, 1, 1, '#202224');
  spanRows(h, 16, [[19, 28], [16, 31], [14, 33], [13, 34], [13, 34]], i => i === 4 ? '#3e6e60' : i < 2 ? '#86c0ac' : '#5f9e8a');
  r(22, 17, 4, 1, '#c8a040');
  r(8, 23, 32, 14, '#56432f'); for (const x of [8, 14, 33, 39]) r(x, 23, 1, 14, '#3a2c22');
  r(15, 26, 18, 10, '#2a201a'); for (let x = 16; x < 33; x += 2) r(x, 26, 1, 10, '#4a3a2a'); r(20, 28, 8, 2, '#c8a040');
  h(24, 13, 34, '#e8dcb0'); h(25, 14, 33, '#d8c890'); for (const x of [16, 21, 26, 31]) { r(x, 26, 1, 1, '#ffffff'); r(x + 1, 27, 1, 1, '#ffffff'); }
  for (const x of [0, 40]) { r(x + 2, 19, 4, 2, '#8a8472'); r(x + 1, 21, 6, 2, '#a8a290'); r(x + 2, 23, 4, 4, '#a8a290'); r(x + 3, 24, 2, 2, '#4a443a'); r(x + 1, 27, 6, 1, '#8a8472'); r(x + 2, 28, 4, 8, '#a8a290'); r(x + 3, 30, 2, 3, '#7a7462'); r(x, 36, 8, 3, '#8a8472'); }
  r(0, 39, 48, 9, '#d9dadb'); for (let y = 41; y < 48; y += 3) h(y, 0, 47, '#c4c5c6'); spanRows(h, 39, [[16, 31], [15, 32], [14, 33]], '#e8e8e8');
});

spotSprites.hirabaraTaki = hiCanvas((r, h) => {
  const RK = '#7a8288', RD = '#4e555a', RL = '#9aa2a6', MS = '#7a9a5a';
  spanRows(h, 4, [[12, 34], [9, 37], [7, 39], [6, 40], [5, 41], [5, 42], [4, 42], [4, 43], [4, 43], [3, 43], [3, 44], [3, 44], [3, 44], [2, 44], [2, 45], [2, 45], [2, 45], [2, 45], [2, 45], [2, 45], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46], [1, 46]], RK);
  for (const [x, y, w, hh] of [[8, 8, 6, 3], [30, 6, 7, 2], [36, 14, 6, 4], [6, 20, 5, 3], [28, 22, 8, 3], [12, 30, 6, 2], [34, 32, 7, 3]]) { r(x, y, w, hh, RL); h(y + hh, x, x + w - 1, RD); }
  for (const [x, y, w, hh] of [[14, 5, 8, 2], [3, 14, 5, 4], [38, 24, 6, 4], [5, 34, 6, 3], [24, 10, 4, 2]]) r(x, y, w, hh, MS);
  for (const [x, y] of [[20, 12], [26, 16], [10, 25], [32, 28], [16, 36]]) r(x, y, 1, 4, RD);
  r(18, 4, 3, 36, '#d8e2e6'); r(19, 4, 1, 36, '#f4f8fa'); for (let y = 8; y < 40; y += 5) r(17, y, 1, 2, '#c8d4d8');
  spanRows(h, 40, [[8, 32], [5, 36], [5, 36], [8, 33]], '#5a7a8a'); h(40, 14, 24, '#8ab0c0'); r(17, 39, 5, 2, '#f4f8fa');
  r(34, 1, 5, 3, '#6a5a48'); spanRows(h, 0, [[33, 39]], '#8a4a3a');
  r(0, 44, 48, 4, '#5a6a4a'); h(44, 0, 47, '#7a8a5a');
});

spotSprites.ankyuji = hiCanvas((r, h) => {
  const RC = ['#8a8e9a', '#60616d', '#3a3b44', '#4e4f5a'];
  for (const x0 of [0, 34]) { tileRoof(r, h, 25, [[x0 + 1, x0 + 12], [x0, x0 + 13]], ['#7a7e8a', '#60616d', '#3a3b44', '#4e4f5a']); r(x0, 27, 14, 5, '#f0eee8'); r(x0, 32, 14, 8, '#2a262e'); for (let x = x0 + 1; x < x0 + 14; x += 2) r(x, 32, 1, 8, '#3a3640'); }
  r(9, 3, 2, 2, '#3a3b44'); r(37, 3, 2, 2, '#3a3b44');
  tileRoof(r, h, 5, [[10, 37], [8, 39], [7, 40], [6, 41], [5, 42], [4, 43]], RC); r(3, 9, 1, 1, '#3a3b44'); r(44, 9, 1, 1, '#3a3b44');
  r(9, 11, 30, 3, '#4a443e'); for (let x = 10; x < 38; x += 3) r(x, 12, 2, 1, '#7a6e60');
  r(20, 14, 8, 2, '#e8e4d8'); r(22, 14, 4, 1, '#3a3a3a');
  r(13, 14, 3, 27, '#7a7068'); r(32, 14, 3, 27, '#7a7068'); r(13, 14, 1, 27, '#9a9088'); h(16, 13, 34, '#5a5048');
  r(16, 17, 16, 24, '#3a3632'); spanRows(h, 26, [[18, 29], [17, 30]], '#6a6e78'); r(18, 28, 12, 6, '#5a4a3a'); r(22, 30, 4, 4, '#8a6a4a');
  r(40, 22, 3, 19, '#b0aca4'); r(40, 21, 3, 1, '#c8c4bc'); for (let y = 24; y < 38; y += 3) r(41, y, 1, 2, '#3a3a3a');
  r(0, 41, 48, 7, '#9a9a98'); r(16, 41, 16, 7, '#b8b8b4'); for (const x of [4, 36, 44]) r(x, 42, 1, 6, '#f0f0f0');
});

spotSprites.suunji = hiCanvas((r, h) => {
  h(5, 15, 32, '#5d6469'); r(14, 3, 2, 2, '#5d6469'); r(32, 3, 2, 2, '#5d6469');
  tileRoof(r, h, 6, [[13, 34], [12, 35], [10, 37], [9, 38], [8, 39], [7, 40], [5, 42], [4, 43], [3, 44], [2, 45], [1, 46], [1, 46]], ['#b4bac2', '#8b919a', '#4d5459', '#7a8088']);
  for (let k = 0; k < 5; k++) h(7 + k, 22 - k, 25 + k, '#9aa0a8'); h(11, 17, 30, '#5d6469');
  r(6, 18, 36, 16, '#3a332c'); for (const x of [6, 14, 22, 25, 33, 41]) r(x, 18, 1, 16, '#6a5a48'); h(18, 6, 41, '#2a241f');
  for (const x0 of [7, 15, 26, 34]) { r(x0, 21, 6, 10, '#4a4036'); for (let x = x0; x < x0 + 6; x += 2) r(x, 21, 1, 10, '#5a4e40'); }
  r(23, 21, 2, 12, '#1f1d22'); h(33, 4, 43, '#7a6a58'); h(34, 4, 43, '#4a3e32'); for (let x = 6; x < 43; x += 6) r(x, 35, 1, 4, '#403b37');
  r(35, 27, 4, 2, '#8a857a'); r(34, 29, 6, 2, '#9a958a'); r(35, 31, 4, 2, '#5a554a'); r(36, 33, 2, 5, '#9a958a'); r(34, 38, 6, 2, '#8a857a');
  r(10, 26, 1, 14, '#5a4a40'); for (const [x, y] of [[6, 27], [12, 25], [8, 30], [14, 29]]) { r(x, y, 4, 1, '#5a4a40'); r(x + 1, y - 1, 2, 1, '#e8a0b0'); }
  r(0, 39, 48, 9, '#8a8476'); for (let x = 2; x < 48; x += 7) r(x, 42, 4, 1, '#a09a8c');
});

spotSprites.yatsurugi = hiCanvas((r, h) => {
  h(5, 15, 32, '#5a7478');
  spanRows(h, 6, [[14, 33], [12, 35], [11, 36], [9, 38], [8, 39], [6, 41], [5, 42], [3, 44], [2, 45]], i => i < 3 ? '#a8c4c8' : i < 8 ? '#88aab0' : '#5a7478');
  for (let y = 7; y < 14; y++) for (let x = 6 + ((y * 3) % 5); x < 42; x += 5) r(x, y, 1, 1, '#98b6bc');
  h(15, 2, 45, '#3a4a4c'); h(16, 4, 43, '#2a201c');
  r(7, 17, 34, 16, '#2e2824'); for (const x of [7, 15, 32, 40]) r(x, 17, 1, 16, '#4a3e34');
  r(17, 19, 14, 13, '#3a3028'); for (let x = 18; x < 31; x += 2) r(x, 19, 1, 13, '#5a4e42'); for (let y = 21; y < 32; y += 3) h(y, 17, 30, '#5a4e42');
  for (const x of [11, 35]) { r(x, 19, 2, 11, '#f4f4f0'); r(x, 20, 2, 1, '#c03030'); r(x, 23, 2, 4, '#7a4a9a'); }
  for (const x of [1, 41]) { r(x + 1, 18, 4, 2, '#8a8a84'); r(x, 20, 6, 2, '#a8a8a0'); r(x + 1, 22, 4, 3, '#a8a8a0'); r(x + 2, 23, 2, 1, '#4a4a44'); r(x, 25, 6, 1, '#8a8a84'); r(x + 1, 26, 4, 8, '#a8a8a0'); r(x, 34, 6, 2, '#8a8a84'); }
  for (const x of [13, 31]) { r(x, 29, 4, 4, '#b8b8b0'); r(x + 1, 27, 2, 2, '#b8b8b0'); }
  spanRows(h, 33, [[16, 31], [15, 32], [14, 33], [13, 34]], i => i % 2 ? '#a8a8a0' : '#c8c8c0');
  r(0, 37, 48, 8, '#8a8a84'); for (const [x, y, w] of [[0, 37, 7], [8, 38, 6], [36, 37, 5], [42, 38, 6], [3, 41, 8], [34, 41, 7], [12, 41, 4]]) { r(x, y, w, 3, '#a8a8a2'); h(y, x, x + w - 1, '#c0c0ba'); }
  r(14, 37, 20, 8, '#6a6a64'); r(0, 45, 48, 3, '#5a5c5e');
});

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

spotSprites.gentokuji = hiCanvas((r, h) => {
  r(0, 4, 18, 22, '#6a6c74'); for (let y = 6; y < 26; y += 4) h(y, 0, 17, '#7a7c84'); spanRows(h, 2, [[0, 17], [0, 18]], '#4a4c58');
  r(2, 8, 4, 3, '#e8e8e8'); r(10, 8, 4, 3, '#e8e8e8');
  r(16, 3, 10, 24, '#7a7a80'); r(16, 3, 3, 24, '#9a9aa0'); h(3, 16, 25, '#aaaab0'); for (let y = 6; y < 24; y += 3) r(21, y, 2, 2, '#4a4a50');
  r(13, 27, 16, 4, '#9a9690'); h(27, 13, 28, '#b0aca4'); r(11, 31, 20, 5, '#8a867e'); h(31, 11, 30, '#a8a49c'); r(9, 36, 24, 5, '#7a766e');
  r(19, 32, 4, 4, '#6a5a48'); r(20, 30, 2, 2, '#e8c840'); r(18, 30, 1, 2, '#3a7a3a');
  for (let k = 0; k < 5; k++) h(33 + k, 7 - k, 8 + k, '#d23a2e'); r(3, 38, 10, 4, '#e8e4dc'); r(4, 38, 1, 4, '#9a9690');
  r(32, 14, 11, 20, '#f4f4f0'); h(14, 32, 42, '#c0302a'); for (let k = 0; k < 4; k++) h(13 - k, 33 + k, 41 - k, '#c0302a'); r(32, 14, 1, 20, '#c0302a'); r(42, 14, 1, 20, '#c0302a');
  for (const [x, y] of [[37, 17], [37, 20], [37, 23], [37, 26], [35, 22], [35, 25]]) r(x, y, 1, 2, '#222');
  r(36, 34, 3, 8, '#c0302a');
  r(0, 41, 48, 7, '#8a8678'); for (let x = 0; x < 10; x += 3) r(x, 36, 2, 5, '#a8a49c');
  r(26, 0, 22, 12, '#3f6a32'); r(28, 1, 8, 3, '#5a8a44'); r(40, 4, 6, 3, '#5a8a44');
});

spotSprites.shohojiKofun = hiCanvas((r, h) => {
  r(0, 30, 48, 18, '#9b9731'); for (const [x, y] of [[4, 34], [14, 40], [30, 36], [40, 42], [22, 44]]) r(x, y, 3, 1, '#b8b048');
  spanRows(h, 18, [[24, 40], [20, 43], [18, 45], [4, 46], [2, 47], [1, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47]], i => i < 3 ? '#7a7a2a' : i % 3 ? '#8a8a2c' : '#6a6a24');
  h(29, 0, 47, '#5a5a20');
  for (const [x, y, w] of [[0, 6, 10], [9, 10, 8], [36, 4, 12]]) { r(x, y, w, 8, '#3f6a2a'); r(x + 1, y, w - 3, 2, '#5a8a3a'); }
  for (const [x, y0] of [[22, 6], [30, 3], [38, 8], [16, 12]]) {
    spanRows(h, y0, [[x - 2, x + 2], [x - 4, x + 4], [x - 5, x + 5], [x - 5, x + 5], [x - 4, x + 4], [x - 2, x + 2]], '#a89a80');
    for (let i = 0; i < 6; i++) r(x - 4 + ((i * 3) % 9), y0 + 1 + (i % 4), 1, 1, '#7a6e5a');
    r(x, y0 + 4, 1, 26 - y0, '#5a5040');
  }
  r(30, 20, 2, 10, '#36351c');
});

spotSprites.kiraOnsen = hiCanvas((r, h) => {
  spanRows(h, 6, [[18, 30], [12, 36], [8, 40], [5, 44], [3, 46], [1, 47], [0, 47]], '#4f8a3a'); r(0, 13, 48, 20, '#4f8a3a'); for (const [x, y] of [[6, 10], [36, 8], [44, 16], [2, 20]]) r(x, y, 4, 2, '#6aa04a');
  r(20, 5, 20, 27, '#f2f2ee'); r(36, 5, 4, 27, '#d8d8d2'); h(5, 20, 39, '#c8c8c4'); for (let y = 8; y < 30; y += 3) for (let x = 22; x < 36; x += 3) r(x, y, 2, 1, '#6f8fa8');
  r(4, 16, 15, 16, '#ece6d8'); h(16, 4, 18, '#c4b8a4'); for (let y = 19; y < 30; y += 3) for (let x = 6; x < 18; x += 3) r(x, y, 2, 1, '#6f8fa8');
  r(41, 20, 6, 12, '#e8e8e2'); spanRows(h, 18, [[41, 46], [40, 47]], '#b84a3a'); r(43, 24, 2, 2, '#6f8fa8');
  r(0, 32, 48, 4, '#ecdcae'); h(32, 0, 47, '#d8c890');
  r(0, 36, 48, 12, '#3f8fcf'); for (const [x, y] of [[4, 39], [18, 42], [32, 38], [40, 44], [10, 45]]) h(y, x, x + 3, '#8cc0e0');
});

spotSprites.terabeJo = hiCanvas((r, h) => {
  r(0, 4, 14, 20, '#3f6a2a'); r(1, 5, 8, 3, '#5a8a3a'); r(34, 2, 14, 22, '#3f6a2a'); r(38, 3, 8, 3, '#5a8a3a');
  r(19, 4, 10, 34, '#6a6c70'); r(26, 4, 3, 34, '#4e5054'); r(19, 4, 2, 34, '#86888c'); spanRows(h, 2, [[20, 27], [19, 28]], '#7a7c80');
  for (let y = 8; y < 32; y += 3) r(22, y, 2, 2, '#3a3c40');
  r(16, 38, 16, 3, '#9a9c9e'); h(38, 16, 31, '#b8babc');
  spanRows(h, 34, [[6, 16], [3, 17], [1, 18], [0, 19]], '#506b3c'); spanRows(h, 34, [[32, 42], [31, 45], [30, 47], [29, 47]], '#506b3c');
  r(0, 41, 48, 7, '#506b3c'); for (const [x, y] of [[4, 43], [12, 45], [28, 43], [40, 46], [20, 46]]) r(x, y, 3, 1, '#6a8a4a');
});

spotSprites.kodomonokuniSt = hiCanvas((r, h) => {
  r(8, 5, 40, 3, '#e6e8ed'); h(8, 8, 47, '#5a5a5a'); for (const x of [10, 22, 34, 46]) r(x, 9, 1, 6, '#8a6a4a');
  r(4, 14, 44, 3, '#a8a8a0'); h(14, 4, 47, '#c4c4bc'); for (let x = 5; x < 47; x += 3) r(x, 12, 1, 2, '#c8c8c8'); h(11, 4, 47, '#c8c8c8');
  r(0, 17, 48, 21, '#8a8880'); r(0, 17, 14, 21, '#6c6d67'); for (let y = 19; y < 37; y += 4) h(y, 0, 47, '#7a7870');
  r(16, 20, 9, 3, '#f4f4f4'); for (const x of [17, 19, 21, 23]) r(x, 21, 1, 1, '#2f5fae');
  r(27, 19, 13, 5, '#ffffff'); r(28, 20, 4, 3, '#f2c230'); r(32, 20, 4, 3, '#3f9ad8'); r(36, 20, 3, 3, '#e05a5a');
  r(27, 27, 13, 11, '#e0e0dc'); r(27, 27, 13, 1, '#5a5a56'); r(32, 31, 2, 4, '#4a4a4a');
  r(2, 30, 10, 8, '#9a9890'); r(4, 26, 3, 4, '#3f7a34'); r(3, 25, 5, 2, '#4f8a3a');
  r(0, 38, 48, 10, '#7a7a7a'); r(0, 38, 26, 4, '#a8a8a4'); for (const x of [30, 38, 46]) r(x, 44, 4, 1, '#f0f0f0'); h(41, 30, 47, '#e8e8e8');
});

spotSprites.antaiji = hiCanvas((r, h) => {
  for (const x of [34, 41]) { spanRows(h, 0, [[x + 2, x + 3], [x + 1, x + 4], [x + 1, x + 4], [x, x + 5], [x, x + 5], [x, x + 6], [x, x + 6], [x - 1, x + 6], [x - 1, x + 7], [x - 1, x + 7], [x - 1, x + 7], [x - 2, x + 7]], '#2f5a2a'); }
  tileRoof(r, h, 8, [[12, 36], [10, 38], [8, 40], [6, 42], [4, 44], [2, 46], [1, 47]], ['#7a8088', '#51575b', '#2e3236', '#454b50']);
  for (let k = 0; k < 9; k++) { const y = 5 + k; h(y, 24 - k - 1, 25 + k + 1, '#2e3236'); if (k > 1) h(y, 24 - k + 1, 25 + k - 1, '#c8a878'); }
  for (let k = 3; k < 9; k++) r(24, 5 + k, 2, 1, '#6a5038'); h(13, 17, 32, '#6a5038');
  r(8, 15, 32, 16, '#f0eee8'); for (const x of [8, 16, 24, 32, 39]) r(x, 15, 1, 16, '#3a3630'); h(15, 8, 39, '#3a3630'); h(22, 8, 39, '#3a3630');
  for (const x0 of [10, 18, 26, 34]) { r(x0, 17, 5, 4, '#8a7a68'); for (let x = x0; x < x0 + 5; x += 2) r(x, 17, 1, 4, '#5a4a3a'); }
  r(10, 24, 4, 6, '#3a3630'); r(33, 24, 5, 6, '#3a3630');
  h(31, 2, 42, '#6a5038'); for (let x = 3; x < 42; x += 5) r(x, 32, 1, 6, '#5a4030'); h(33, 2, 42, '#8a6a4a');
  for (let i = 0; i < 6; i++) r(2 + i, 32 + i, 3, 1, '#8a6a4a');
  for (const [x, y] of [[0, 39], [8, 41], [16, 40], [28, 41], [38, 39], [44, 42]]) { r(x, y, 5, 4, '#3f7a34'); r(x + 1, y, 3, 2, ['#6a7ac8', '#8a6ac8', '#5a8ad8'][x % 3]); }
  r(0, 44, 48, 4, '#3f7a34');
});

spotSprites.fukusenji = hiCanvas((r, h) => {
  r(10, 4, 3, 3, '#3a3a44'); r(35, 4, 3, 3, '#3a3a44'); h(6, 12, 35, '#3a3a44');
  tileRoof(r, h, 7, [[12, 35], [11, 36], [10, 37], [9, 38], [8, 39], [6, 41], [4, 43], [2, 45], [1, 46]], ['#8a8e96', '#5e626c', '#2a2a32', '#4a4e58']);
  r(1, 14, 2, 2, '#2a2a32'); r(45, 14, 2, 2, '#2a2a32'); r(14, 13, 3, 3, '#3a3a44'); r(31, 13, 3, 3, '#3a3a44');
  r(5, 16, 38, 2, '#3a2e26'); r(7, 18, 34, 15, '#5a4a3c'); for (const x of [7, 15, 32, 40]) r(x, 18, 2, 15, '#6a5a48');
  r(18, 21, 12, 12, '#8a6848'); for (let x = 20; x < 30; x += 3) r(x, 21, 1, 12, '#6a4e34');
  r(10, 22, 4, 6, '#9aa0a4'); r(34, 22, 4, 6, '#9aa0a4'); h(33, 5, 42, '#6a5a48'); spanRows(h, 34, [[14, 33], [13, 34], [12, 35]], i => i % 2 ? '#8a8a86' : '#a8a8a4');
  r(42, 20, 6, 14, '#f0eee8'); h(20, 42, 47, '#3a3630');
  for (const x of [2, 40]) { r(x + 1, 27, 4, 2, '#d0d0c8'); r(x, 29, 6, 1, '#b0b0a8'); r(x + 1, 30, 4, 3, '#e8e8e0'); r(x + 2, 31, 2, 1, '#4a4a44'); r(x + 2, 33, 2, 5, '#d0d0c8'); r(x, 38, 6, 2, '#b0b0a8'); }
  r(0, 37, 48, 11, '#8a8a84'); spanRows(h, 37, [[18, 29], [17, 30], [17, 30], [16, 31], [16, 31], [15, 32], [15, 32], [14, 33], [14, 33], [13, 34], [13, 34]], '#b8b8b2'); for (let y = 39; y < 48; y += 2) h(y, 14, 33, '#a4a49e');
});

spotSprites.genkuin = hiCanvas((r, h) => {
  r(40, 6, 3, 3, '#5a5a60'); h(9, 14, 41, '#5a5a60');
  tileRoof(r, h, 10, [[13, 42], [11, 43], [9, 44], [7, 45], [5, 46], [3, 47]], ['#d0d0d0', '#b0b0b2', '#5a5a60', '#9a9a9c']);
  r(4, 16, 42, 2, '#5a4030');
  r(6, 18, 38, 8, '#f0eee8'); for (const x of [6, 16, 26, 36, 43]) r(x, 18, 1, 8, '#3a3028'); h(21, 6, 43, '#3a3028'); for (let i = 0; i < 4; i++) r(30 + i, 18 + i * 2, 1, 2, '#3a3028');
  r(6, 26, 38, 11, '#c89a60'); for (let x = 7; x < 44; x += 2) r(x, 26, 1, 11, '#b88a50');
  r(9, 27, 6, 7, '#4a5a64'); r(10, 28, 4, 2, '#8a9aa4'); r(19, 27, 8, 10, '#5a4a3a'); r(22, 28, 2, 9, '#8a7050');
  r(16, 18, 2, 19, '#4a3a2c'); r(28, 18, 2, 19, '#4a3a2c');
  r(4, 37, 42, 2, '#9a7a5a'); r(6, 39, 38, 2, '#7a6a5a');
  r(0, 22, 4, 15, '#d03a3a'); r(1, 24, 1, 8, '#f0f0f0');
  r(40, 26, 4, 15, '#e8e8e4'); h(26, 40, 43, '#f8f8f4'); for (let y = 28; y < 38; y += 3) r(41, y, 1, 2, '#3a3a3a');
  r(0, 41, 48, 7, '#9a7a6a'); for (let x = 0; x < 48; x += 4) r(x, 43, 2, 1, '#8a6a5a'); r(30, 36, 8, 5, '#3f7a34'); r(31, 35, 6, 1, '#5a9a44');
});

spotSprites.kaminagaraShinmei = hiCanvas((r, h) => {
  const LD = '#2a3e22', LM = '#3f5a30', LL = '#5f7a40', TR = '#5a4a3a', TL = '#7a6a58', TS = '#3a2e24';
  for (const [x, y, w, hh] of [[2, 4, 16, 12], [12, 0, 24, 12], [30, 3, 17, 13], [0, 13, 14, 9], [34, 13, 14, 9], [16, 9, 18, 8]]) { r(x + 1, y, w - 2, hh, LM); r(x, y + 1, w, hh - 2, LM); }
  for (const [x, y] of [[4, 6], [15, 2], [24, 3], [33, 5], [2, 15], [38, 15], [20, 11], [9, 10]]) { r(x, y, 5, 2, LL); r(x + 1, y + 2, 3, 1, LL); }
  for (const [x, y] of [[8, 12], [28, 10], [40, 10], [14, 18], [30, 17]]) r(x, y, 4, 2, LD);
  r(15, 18, 18, 22, TR); r(15, 18, 4, 22, TL); r(28, 18, 5, 22, TS);
  spanRows(h, 12, [[10, 13], [11, 14], [12, 15], [13, 16], [14, 17], [15, 18]], TR); spanRows(h, 12, [[35, 38], [34, 37], [33, 36], [32, 35], [31, 34], [30, 33]], TS);
  r(22, 10, 4, 8, TR); r(22, 10, 1, 8, TL);
  for (const [x, y] of [[18, 24], [25, 30], [20, 34], [27, 22]]) { r(x, y, 3, 2, TS); r(x, y - 1, 2, 1, TL); }
  for (let y = 19; y < 40; y++) for (let x = 16 + (y % 3); x < 33; x += 4) r(x, y, 1, 2, (x + y) % 2 ? TS : '#4a3c2e');
  r(13, 22, 3, 18, TR); r(13, 22, 1, 18, TL); r(33, 25, 3, 15, TS); r(11, 30, 2, 10, TS); r(36, 31, 2, 9, TS);
  h(27, 13, 35, '#e8dcb0'); h(28, 13, 35, '#c8b888'); for (const x of [19, 29]) { r(x, 29, 1, 2, '#ffffff'); r(x + 1, 31, 1, 2, '#ffffff'); }
  spanRows(h, 40, [[9, 38], [6, 41], [4, 43]], TS); for (const [x, y] of [[6, 41], [14, 42], [31, 42], [39, 41]]) r(x, y, 4, 1, TR);
  for (let x = 1; x < 47; x += 6) { r(x, 38, 3, 7, '#c8ccd0'); h(38, x, x + 2, '#e4e8ec'); } h(41, 0, 47, '#b0b4b8');
  r(0, 45, 48, 3, '#9a8a6a');
});

spotSprites.shozanji = hiCanvas((r, h) => {
  const RL = '#8a8784', RM = '#655b59', RD = '#2e2a2a', WD = '#4a3a30', WL = '#6a5040';
  r(21, 1, 6, 3, '#4a4444'); r(22, 0, 4, 1, '#6a6464');
  for (let y = 4; y < 19; y++) { const k = y - 4, w = Math.round(2 + k * 1.2 + k * k * 0.04); h(y, 24 - w, 23 + w, y < 9 ? RL : RM); for (let x = 25 - w + (y % 2); x < 23 + w; x += 2) r(x, y, 1, 1, '#5a5250'); }
  h(18, 1, 46, RD); r(1, 17, 1, 1, RD); r(46, 17, 1, 1, RD);
  for (let k = 0; k < 8; k++) h(6 + k, 23 - k, 24 + k, k < 2 ? RL : '#9a8f84'); for (let x = 19; x < 29; x += 2) r(x, 11, 1, 3, '#6a5a50');
  r(5, 19, 38, 18, WD); for (const x of [5, 13, 34, 42]) r(x, 19, 2, 18, WL);
  spanRows(h, 18, [[16, 31], [13, 34], [12, 35], [12, 35]], i => i < 2 ? RM : RD); r(12, 20, 1, 2, RD); r(35, 20, 1, 2, RD);
  r(14, 23, 20, 4, '#f4f2ec'); pix(r, ['#.#.##.#.#.#.##.#.', '.#.#..#.##.#..#.#.'], 15, 24, '#222');
  r(16, 28, 16, 9, '#2a2420'); for (let x = 17; x < 31; x += 3) r(x, 28, 1, 9, '#4a3a30');
  for (let y = 37; y < 42; y++) h(y, 16 - (y - 37), 31 + (y - 37), y % 2 ? '#a9a697' : '#c4c0b0');
  for (const [x, y] of [[0, 14], [2, 19], [0, 25], [3, 30]]) { pix(r, PINE, x, y, '#283a24'); h(y, x + 2, x + 4, '#3f5a34'); } r(4, 33, 2, 10, '#4a3a2a');
  r(43, 24, 1, 19, '#888'); r(40, 24, 3, 15, '#f4f2ec'); for (let y = 26; y < 38; y += 3) r(41, y, 1, 2, '#c03030');
  r(0, 42, 48, 6, '#b8b4a8');
});

spotSprites.sairinji = hiCanvas((r, h) => {
  const ST = '#9a9080', SL = '#b4aa98', SD = '#7a7060';
  pix(r, ['...#####...', '.#########.', '###########', '###########', '###########'], 0, 30, '#5a6a42'); pix(r, ['...#####...', '.#########.', '###########', '###########', '###########'], 37, 30, '#5a6a42');
  spanRows(h, 3, [[20, 26], [18, 28], [17, 29], [17, 29]], ST);
  for (let y = 7; y < 28; y++) h(y, 16 + (y > 22 ? 1 : 0), 30 - (y > 22 ? 1 : 0), ST);
  r(17, 5, 3, 22, SL); r(27, 7, 3, 20, SD); for (let y = 9; y < 26; y += 2) { r(22, y, 1, 1, '#4a4238'); r(25, y + 1, 1, 1, '#4a4238'); }
  r(8, 28, 32, 6, '#d0c9bb'); h(28, 8, 39, '#e4ded2'); r(8, 33, 32, 1, '#a8a294');
  for (const x of [9, 34]) { r(x, 22, 5, 12, '#c4bcae'); r(x + 4, 22, 1, 12, '#9a9488'); for (const [dx, dy] of [[0, 0], [2, -1], [4, 0], [1, 1], [3, 1]]) r(x + dx, 19 + dy, 2, 2, (dx + dy) % 2 ? '#e8d050' : '#c8a838'); r(x + 2, 21, 1, 2, '#4a7a3a'); }
  r(20, 34, 8, 5, '#b8b2a4'); h(34, 20, 27, '#d0c9bb');
  r(4, 38, 40, 5, '#78766c'); h(38, 4, 43, '#9a988c'); r(0, 43, 48, 5, '#6a6b53'); for (const [x, y] of [[3, 44], [12, 46], [30, 45], [41, 44]]) r(x, y, 3, 1, '#8a8a68');
});

spotSprites.tenjikuJinja = hiCanvas((r, h) => {
  const RC = ['#c8d0d8', '#9aa4b0', '#4a5460', '#8a94a0'], WB = '#8a6a50', WD = '#6a4a34', ST = '#c8c8c8', SD = '#9a9a9a';
  h(3, 14, 33, '#5a6470'); tileRoof(r, h, 4, [[12, 35], [10, 37], [8, 39], [6, 41], [5, 42], [4, 43], [3, 44], [2, 45]], RC);
  h(12, 4, 43, '#f0eee8'); r(6, 13, 36, 2, '#7a5a40'); for (let x = 8; x < 40; x += 4) r(x, 13, 2, 2, '#a07a58');
  r(8, 15, 32, 16, WB); for (const x of [8, 15, 32, 39]) r(x, 15, 1, 16, WD);
  r(17, 17, 14, 14, WD); for (let x = 18; x < 31; x += 2) r(x, 17, 1, 14, '#8a6448'); r(23, 17, 2, 14, '#4a3424');
  h(30, 6, 41, '#a8a8a8'); for (let x = 7; x < 41; x += 3) r(x, 28, 1, 3, '#d8d8d8');
  for (let y = 31; y < 37; y++) h(y, 18 - (y - 31), 29 + (y - 31), y % 2 ? SD : ST);
  for (const x of [1, 41]) { r(x + 1, 22, 4, 2, ST); r(x, 24, 6, 2, ST); r(x + 2, 26, 2, 2, '#ffe9a0'); r(x + 1, 28, 4, 2, ST); r(x + 2, 30, 2, 6, ST); r(x, 36, 6, 2, SD); }
  for (const x of [8, 35]) { r(x, 31, 4, 4, '#b8b4a8'); r(x + 1, 30, 2, 1, '#b8b4a8'); r(x, 35, 5, 2, SD); }
  r(0, 37, 48, 4, '#b8b7b7'); for (let x = 0; x < 48; x += 4) r(x, 37, 1, 4, '#9a9a9a'); r(0, 41, 48, 7, '#c8c0b0'); r(20, 41, 8, 7, '#a8a49a');
});

spotSprites.semonJinja = hiCanvas((r, h) => {
  const RC = ['#c0c4cc', '#a4a8b3', '#5a5e66', '#8a8e96'], WB = '#4a3038', WL = '#5e3e46', WD = '#36242a';
  h(5, 10, 37, '#6a6e76'); tileRoof(r, h, 6, [[9, 38], [7, 40], [6, 41], [5, 42], [4, 43], [3, 44], [2, 45], [1, 46]], RC);
  h(14, 3, 44, '#7a757d');
  r(3, 15, 42, 21, WB); for (let x = 4; x < 45; x += 2) r(x, 15, 1, 21, WL); for (const x of [3, 12, 22, 25, 35, 44]) r(x, 15, 1, 21, WD); h(24, 3, 44, WD);
  r(19, 18, 10, 18, '#2a1a20'); for (let x = 20; x < 28; x += 2) r(x, 18, 1, 18, '#4a3038');
  for (let x = 17; x <= 30; x++) r(x, 18 + Math.round(Math.sin((x - 17) / 13 * Math.PI) * 2), 1, 1, '#e8dcb0'); for (const x of [20, 24, 28]) { r(x, 21, 1, 2, '#ffffff'); r(x + 1, 22, 1, 2, '#ffffff'); }
  h(36, 2, 45, '#8a8a88'); h(37, 2, 45, '#b8b8b4');
  r(17, 38, 14, 2, '#6a5040'); r(18, 40, 1, 2, '#4a3a2a'); r(29, 40, 1, 2, '#4a3a2a');
  r(0, 42, 48, 6, '#e9e7e2'); for (const [x, y] of [[5, 44], [30, 46], [40, 43]]) r(x, y, 3, 1, '#d0ccc4');
  pix(r, ['..####', '.#####', '######', '######', '######', '######'], 42, 36, '#3f6a34');
});

spotSprites.kagakuji = hiCanvas((r, h) => {
  const RC = ['#e4e6ea', '#c8ccd2', '#6a6e76', '#b0b4ba'], WD = '#433838', WL = '#5a4c4a';
  h(4, 14, 33, '#9a9ea6'); tileRoof(r, h, 5, [[12, 35], [10, 37], [8, 39], [6, 41], [5, 42], [4, 43], [3, 44], [2, 45], [1, 46]], RC);
  h(14, 3, 44, '#8a8e96');
  r(4, 15, 40, 5, '#f2f0ea'); for (const x of [4, 11, 18, 29, 36, 43]) r(x, 15, 1, 5, WD); h(15, 4, 43, WD); r(20, 16, 8, 3, '#6a5040'); for (const x of [21, 23, 25]) r(x, 17, 1, 1, '#e8e0c8');
  r(4, 20, 40, 13, WL); for (const x of [6, 12, 31, 37]) { r(x, 21, 5, 9, '#e8e4d8'); for (let y = 23; y < 30; y += 2) h(y, x, x + 4, '#b8b0a0'); r(x + 2, 21, 1, 9, '#b8b0a0'); }
  r(19, 21, 10, 12, '#2a2427'); r(22, 23, 4, 6, '#c8b090'); for (const x of [4, 18, 29, 43]) r(x, 20, 1, 13, WD);
  h(33, 2, 45, '#6a5a50'); r(3, 34, 42, 3, '#2a2224');
  for (let y = 34; y < 39; y++) h(y, 18 - (y - 34), 29 + (y - 34), y % 2 ? '#8a8682' : '#a8a49e');
  r(0, 39, 48, 9, '#e0d7d0'); for (const [x, y] of [[8, 42], [34, 44], [24, 46]]) r(x, y, 4, 1, '#c8bfb6');
  pix(r, ['...######...', '.##########.', '############', '############', '.##########.', '...######...'], 0, 30, '#3a5a2e'); h(30, 4, 8, '#5a7a44'); r(5, 36, 2, 4, '#4a3a2a');
  for (let y = 18; y < 40; y++) { const w = Math.min(4, 1 + Math.floor((y - 18) / 4)); h(y, 43 - w, 43 + w > 47 ? 47 : 43 + w, y % 3 ? '#2f5a2a' : '#3f6a34'); }
});

spotSprites.ennyuji = hiCanvas((r, h) => {
  const TR = '#7a7060', TL = '#9a9282', TS = '#4e463a', ND = '#24402a', NM = '#2f5030', NL = '#4f7a48';
  tileRoof(r, h, 34, [[0, 12], [0, 13], [0, 14], [0, 15]], ['#7a7f87', '#5a5f67', '#33373e', '#4a4f57']); r(0, 38, 14, 6, '#e8e4dc'); for (const x of [0, 6, 12]) r(x, 38, 1, 6, '#5a4632');
  for (let i = 0; i < 34; i++) { const t = i / 33, x = Math.round(22 + 14 * t - 4 * Math.sin(t * Math.PI)), y = Math.round(44 - 36 * t), w = Math.round(4 - 2 * t); r(x - w, y, w * 2 + 1, 1, TR); r(x - w, y, 1, 1, TL); r(x + w, y, 1, 1, TS); }
  for (let i = 0; i < 22; i++) { const t = i / 21, x = Math.round(20 - 17 * t), y = Math.round(34 + 8 * t * t); r(x, y, 3, 2, i % 3 ? TR : TS); }
  for (const [x, y, w] of [[26, 2, 16], [32, 9, 14], [20, 7, 12], [36, 16, 11], [12, 16, 12], [2, 26, 12], [24, 18, 10]]) { r(x + 1, y, w - 2, 3, NM); r(x, y + 1, w, 2, NM); h(y, x + 2, x + w - 3, NL); h(y + 3, x + 1, x + w - 2, ND); }
  r(0, 44, 48, 4, '#beb5ae'); h(44, 0, 47, '#d0c8c0');
});

spotSprites.shorakuji = hiCanvas((r, h) => {
  const RC = ['#6a6a72', '#4a4a52', '#26262c', '#3a3a42'], WB = '#8a6a50', WD = '#4a3426';
  for (const [x, y, w] of [[0, 6, 10], [6, 2, 9], [2, 14, 9], [8, 10, 7]]) { r(x, y, w, 7, '#2f5a2a'); r(x + 1, y, w - 3, 2, '#4f7a3e'); }
  for (let i = 0; i < 12; i++) h(42 - i * 2, 2 + i, 9 + i, i % 2 ? '#a8a8a0' : '#c0c0b8'); for (let i = 0; i < 12; i++) h(43 - i * 2, 2 + i, 9 + i, '#7a7a72');
  r(0, 30, 6, 14, '#3f6a34'); r(1, 29, 4, 1, '#5a8a44');
  for (let k = 0; k < 14; k++) { const y = 4 + k; h(y, 30 - k - 2, 31 + k + 2, RC[2]); h(y, 30 - k - 1, 31 + k + 1, k < 4 ? RC[0] : RC[1]); }
  r(28, 1, 6, 3, '#3a3a40'); r(29, 0, 4, 1, '#5a5a62');
  for (let k = 3; k < 13; k++) h(4 + k, 30 - k + 2, 31 + k - 2, '#7a6450'); for (let x = 25; x < 37; x += 2) r(x, 11, 1, 5, '#a08468'); h(16, 21, 40, '#5a4634');
  tileRoof(r, h, 17, [[14, 47], [13, 47], [12, 47], [11, 47]], RC);
  r(13, 21, 35, 3, '#e8e4dc'); r(13, 24, 35, 16, WB); for (const x of [13, 21, 30, 39, 47]) r(x, 21, 1, 19, WD);
  r(32, 26, 6, 11, '#3a2a20'); for (let y = 27; y < 37; y += 2) h(y, 32, 37, '#6a5040'); r(23, 26, 6, 6, '#e8e4d8'); for (let x = 24; x < 29; x += 2) r(x, 26, 1, 6, '#a89880'); r(41, 26, 5, 6, '#e8e4d8');
  h(40, 12, 47, '#6a5040'); r(12, 41, 36, 3, '#4a3a30'); r(0, 44, 48, 4, '#a8a49a');
});

spotSprites.okazakiDaijuji = hiCanvas((r, h) => {
  const RC = ['#8a8a8c', '#5c5b5a', '#27231f', '#4a4948'], WD = '#4a443e', WL = '#6a625a', BR = '#9a948c';
  tileRoof(r, h, 26, [[0, 12], [0, 13], [0, 14]], RC); tileRoof(r, h, 26, [[35, 47], [34, 47], [33, 47]], RC);
  for (const x0 of [0, 34]) { r(x0, 29, 14, 11, '#e8e6e0'); for (const x of [x0 + 2, x0 + 8]) { spanRows(h, 31, [[x + 1, x + 2], [x, x + 3], [x, x + 3], [x, x + 3], [x, x + 3]], '#3a3632'); for (let y = 32; y < 36; y += 2) h(y, x, x + 3, '#8a8680'); } r(x0, 36, 14, 4, '#5a524a'); }
  h(2, 9, 38, '#4a4948'); tileRoof(r, h, 3, [[8, 39], [6, 41], [5, 42], [4, 43], [3, 44]], RC); r(3, 6, 1, 1, RC[2]); r(44, 6, 1, 1, RC[2]);
  r(9, 8, 30, 3, BR); for (let x = 10; x < 38; x += 3) r(x, 8, 2, 3, WD);
  r(11, 11, 26, 5, WL); r(23, 11, 2, 3, '#8a2a20'); for (let x = 12; x < 36; x += 4) r(x, 12, 3, 3, '#e8e4dc');
  h(16, 8, 39, BR); for (let x = 8; x < 40; x += 2) r(x, 17, 1, 1, WD); h(18, 8, 39, WD);
  tileRoof(r, h, 19, [[7, 40], [5, 42], [4, 43], [3, 44]], RC);
  r(9, 23, 30, 2, BR); for (let x = 10; x < 38; x += 3) r(x, 23, 2, 2, WD);
  r(10, 25, 28, 15, WD); for (const x of [10, 17, 23, 30, 37]) r(x, 25, 2, 15, WL); r(19, 27, 10, 13, '#1a1814'); r(21, 33, 6, 7, '#8a8a7a');
  r(14, 36, 3, 4, '#c8c4bc'); r(31, 36, 3, 4, '#c8c4bc'); for (let x = 19; x < 29; x += 2) r(x, 37, 1, 3, '#d8d4cc');
  r(0, 40, 48, 3, '#c8c8c4'); h(40, 0, 47, '#e0e0dc'); r(0, 43, 48, 5, '#dbdbdc');
});

spotSprites.okazakiMaruya = hiCanvas((r, h) => {
  const WW = '#f0f0ec', WS = '#c8ccd0', BK = '#22201e', BL = '#3a3836', RC = ['#7a7f87', '#5a5f67', '#2a2e34', '#4a4f57'];
  tileRoof(r, h, 14, [[29, 47], [28, 47], [27, 47]], RC); r(28, 17, 20, 9, WS); r(28, 26, 20, 14, BK); for (let x = 29; x < 48; x += 2) r(x, 26, 1, 14, BL); r(36, 28, 6, 12, '#6a4a3a'); for (let x = 37; x < 42; x += 2) r(x, 28, 1, 12, '#4a3428');
  for (let k = 0; k < 18; k++) { const y = 3 + k; h(y, 17 - k - 1, 18 + k + 1, RC[2]); h(y, 17 - k, 18 + k, RC[k < 4 ? 0 : 1]); if (k >= 1) h(y, 17 - k + 2, 18 + k - 2, k > 12 ? WS : WW); }
  r(14, 1, 8, 2, '#3a3e44');
  pix(r, ['.####.', '#....#', '#.##.#', '#.##.#', '#....#', '.####.'], 15, 9, BK);
  r(1, 21, 33, 5, WW); r(1, 21, 2, 19, WS); h(25, 1, 33, '#9a9ea4');
  r(1, 26, 33, 12, BK); for (let x = 2; x < 34; x += 2) r(x, 26, 1, 12, BL); h(26, 1, 33, '#5a5450');
  r(20, 28, 9, 10, '#3a2a22'); for (let x = 21; x < 29; x += 2) r(x, 28, 1, 10, '#6a5040');
  r(1, 38, 47, 3, '#8a8a84'); h(38, 1, 47, '#a8a8a2'); r(0, 41, 48, 7, '#c8c6c0'); for (const [x, y] of [[6, 44], [26, 46]]) r(x, y, 6, 1, '#b0aea8');
});

spotSprites.okazakiIgaHachimangu = hiCanvas((r, h) => {
  const RC = ['#a8988a', '#7a6a5a', '#3e3026', '#6a5a4c'], RD = '#c83a2a', RL = '#e05a40', RS = '#8e2418', WW = '#f0eee8';
  h(3, 14, 33, '#4e3e32'); tileRoof(r, h, 4, [[12, 35], [10, 37], [8, 39], [6, 41], [5, 42], [4, 43], [3, 44], [2, 45]], RC);
  r(5, 12, 38, 3, '#2f6a4a'); for (let x = 6; x < 42; x += 3) { r(x, 12, 2, 2, RL); r(x, 14, 2, 1, '#e8c040'); }
  r(8, 15, 32, 17, RD); r(8, 15, 32, 2, RS);
  for (const x0 of [10, 31]) { r(x0, 18, 7, 12, WW); r(x0 + 2, 20, 3, 6, '#3a3030'); }
  r(19, 18, 10, 14, '#2a1a14'); for (const x of [8, 18, 29, 39]) r(x, 15, 2, 17, RL); h(17, 8, 39, '#e8c040');
  r(6, 32, 36, 2, '#b8b0a8'); h(32, 6, 41, '#d0c8c0');
  spanRows(h, 34, [[16, 31], [15, 32], [14, 33], [14, 33], [13, 34]], i => i ? '#a8a098' : '#c8c0b8'); for (const x of [14, 33]) r(x, 31, 1, 3, '#9a9288');
  for (let x = 0; x < 48; x += 4) if (x < 12 || x > 36) { r(x, 30, 2, 9, '#b8ae98'); h(30, x, x + 1, '#d0c8b4'); } h(33, 0, 11, '#a2957c'); h(33, 37, 47, '#a2957c');
  r(0, 39, 48, 9, '#4a6a5a'); for (const [x, y] of [[2, 41], [9, 44], [36, 42], [42, 45], [20, 46], [28, 44]]) { r(x, y, 4, 2, '#4f8a3a'); r(x + 1, y, 2, 1, '#7ab05a'); } r(10, 41, 2, 2, '#f0a0b8');
});

spotSprites.okazakiTakisanji = hiCanvas((r, h) => {
  const RL = '#b08a74', RM = '#8a6a58', RD = '#2f231e', WB = '#9c8270', WD = '#6a5442';
  h(8, 18, 29, '#5a4436');
  for (let y = 9; y < 22; y++) { const k = y - 9, a = Math.round(17 - k * 1.25), b = Math.round(30 + k * 1.25); h(y, a, b, y < 13 ? RL : RM); for (let x = a + 1 + (y % 3); x < b; x += 3) r(x, y, 1, 1, '#7a5a4a'); }
  h(22, 0, 47, RD); h(23, 1, 46, '#4a3a30'); r(0, 21, 1, 1, RD); r(47, 21, 1, 1, RD);
  const CUR = ['#7a3a8a', '#f4f2ec', '#d34d35', '#e8c030', '#1d8650'];
  for (let x = 4; x < 44; x++) r(x, 24, 1, 4, CUR[Math.floor((x - 4) / 2) % 5]);
  r(4, 28, 40, 8, WB); for (const x of [4, 11, 18, 29, 36, 43]) r(x, 28, 1, 8, WD); for (let x = 5; x < 43; x += 2) r(x, 29, 1, 6, '#b49a86');
  r(20, 29, 8, 7, '#3a2a20');
  h(36, 2, 45, '#b8a490'); h(37, 2, 45, '#6a5442'); r(3, 38, 42, 2, '#3a2e26'); for (let x = 4; x < 44; x += 6) r(x, 38, 1, 2, WB);
  for (let y = 36; y < 42; y++) h(y, 20 - (y - 36), 27 + (y - 36), y % 2 ? '#c8c0b8' : '#dcd6ce');
  for (const x of [5, 38]) { r(x, 37, 5, 5, '#8a6a4a'); h(38, x, x + 4, '#4a3a2a'); h(40, x, x + 4, '#4a3a2a'); h(37, x, x + 4, '#a88a64'); }
  r(0, 42, 48, 6, '#dfdad6'); for (const [x, y] of [[6, 45], [30, 44], [40, 46]]) r(x, y, 4, 1, '#c8c2bc');
});

spotSprites.okazakiIwazuTenmangu = hiCanvas((r, h) => {
  const RC = ['#7a7480', '#5a5462', '#2a2430', '#4a4452'], RD = '#c83a2a', RL = '#e05a40', RS = '#8e2418', GD = '#d8b040';
  tileRoof(r, h, 14, [[4, 43], [2, 45], [1, 46], [0, 47]], RC);
  for (let k = 0; k < 14; k++) { const y = 2 + k; h(y, 23 - k - 2, 24 + k + 2, RC[2]); h(y, 23 - k - 1, 24 + k + 1, k < 3 ? RC[0] : RC[1]); if (k >= 4) h(y, 23 - k + 3, 24 + k - 3, RS); }
  r(22, 0, 4, 2, '#3a3440'); for (let k = 5; k < 13; k += 2) h(2 + k, 24 - 2, 25, GD); r(21, 9, 6, 4, GD); r(23, 10, 2, 2, '#4a7ad0');
  for (let x = 12; x <= 35; x++) r(x, 16 + Math.round(-Math.sin((x - 12) / 23 * Math.PI) * 2), 1, 2, RC[2]);
  r(4, 18, 40, 4, RD); r(4, 18, 40, 1, RL); for (let x = 5; x < 43; x += 3) r(x, 19, 2, 2, GD);
  r(4, 22, 40, 6, '#f4f2ec'); for (const x of [14, 31]) { r(x, 23, 4, 4, '#222'); r(x + 1, 24, 2, 2, '#f4f2ec'); }
  r(4, 28, 40, 8, '#3a2a24'); for (const x of [4, 13, 22, 25, 34, 43]) r(x, 18, 1, 18, RL);
  h(33, 3, 44, RD); for (let x = 3; x < 45; x += 3) r(x, 34, 1, 3, RD); h(36, 3, 44, RS);
  r(0, 37, 48, 11, '#d8d4cc'); for (let x = 2; x < 48; x += 6) r(x, 40, 4, 1, '#c0bcb4');
  spanRows(h, 38, [[4, 13], [3, 15], [3, 16], [4, 16]], '#8a8a8e'); r(14, 36, 3, 3, '#8a8a8e'); r(15, 36, 1, 1, '#5a5a5e'); h(38, 5, 12, '#aaaaae'); r(5, 42, 3, 2, '#6a6a6e'); r(13, 42, 3, 2, '#6a6a6e'); r(2, 44, 16, 3, '#9a948a');
});

spotSprites.okazakiRokushoJinja = hiCanvas((r, h) => {
  const RL = '#c4bcbc', RM = '#a8a0a0', RD = '#4a4040', RD2 = '#c83a2a', RLL = '#e05a40', GD = '#d8b040';
  h(4, 10, 37, '#6a6060');
  for (let y = 5; y < 17; y++) { const k = y - 5, a = Math.round(9 - k * 0.7), b = Math.round(38 + k * 0.7); h(y, a, b, y < 9 ? RL : RM); for (let x = a + 1 + (y % 3); x < b; x += 3) r(x, y, 1, 1, '#948c8c'); }
  h(17, 0, 47, RD); r(0, 16, 1, 1, RD); r(47, 16, 1, 1, RD);
  for (let k = 0; k < 8; k++) { const y = 3 + k; h(y, 23 - k - 1, 24 + k + 1, RD); h(y, 23 - k, 24 + k, '#8a7a72'); } r(22, 1, 4, 2, GD); r(20, 7, 8, 3, GD); r(23, 8, 2, 1, '#222');
  for (let x = 14; x <= 33; x++) r(x, 16 + Math.round(-Math.sin((x - 14) / 19 * Math.PI) * 3), 1, 2, RD);
  r(3, 18, 42, 4, '#2a2424'); for (let x = 4; x < 44; x += 3) r(x, 19, 2, 2, GD);
  r(3, 22, 42, 14, '#3a2a26'); for (const x of [3, 12, 21, 26, 35, 44]) r(x, 22, 2, 14, RD2); for (const x of [3, 12, 21, 26, 35, 44]) r(x, 22, 1, 14, RLL);
  h(22, 3, 45, RD2); h(28, 3, 45, RD2);
  for (let x = 14; x <= 33; x++) r(x, 25 + Math.round(Math.sin((x - 14) / 19 * Math.PI) * 2), 1, 1, '#e8dcb0'); for (const x of [17, 23, 29]) { r(x, 27, 1, 2, '#ffffff'); r(x + 1, 28, 1, 2, '#ffffff'); }
  h(36, 1, 46, '#8a8a88'); r(17, 36, 14, 4, '#a8a49e');
  for (const x of [1, 41]) { r(x + 1, 29, 4, 2, '#9a9690'); r(x, 31, 6, 2, '#9a9690'); r(x + 2, 33, 2, 1, '#ffe9a0'); r(x + 2, 34, 2, 6, '#9a9690'); r(x, 40, 6, 1, '#7a7670'); }
  r(0, 40, 48, 8, '#d0ccc4'); for (const [x, y] of [[8, 43], [34, 45]]) r(x, y, 5, 1, '#b8b4ac');
});

spotSprites.okazakiOkudonoJinya = hiCanvas((r, h) => {
  const PD = '#3a3028', PL = '#5a4a3c', LD = '#3f6a2a', LM = '#5f8a3a', LL = '#8eaa5f';
  for (const [x, y, w, hh] of [[0, 0, 20, 14], [14, 0, 20, 10], [28, 0, 20, 14], [0, 10, 8, 14], [40, 10, 8, 14]]) { r(x, y, w, hh, LM); }
  for (const [x, y] of [[3, 2], [17, 1], [30, 3], [10, 8], [36, 9], [1, 15], [42, 16], [24, 5]]) { r(x, y, 5, 2, LL); r(x + 1, y + 2, 3, 1, LL); }
  for (const [x, y] of [[8, 11], [26, 8], [20, 12], [44, 6]]) r(x, y, 5, 2, LD);
  r(0, 17, 48, 14, '#2f5a26'); for (const [x, y] of [[4, 20], [14, 18], [28, 22], [40, 19], [20, 25]]) r(x, y, 6, 2, '#4a7a34');
  spanRows(h, 30, [[18, 29], [16, 31], [14, 33], [12, 35], [10, 37], [8, 39], [6, 41], [4, 43], [2, 45], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47]], i => i % 3 ? '#b8b4ac' : '#a8a49c');
  r(0, 32, 9, 8, '#4a7a34'); r(39, 32, 9, 8, '#4a7a34'); h(32, 0, 8, LL); h(32, 39, 47, LL);
  r(2, 14, 44, 3, PD); h(14, 2, 45, PL); r(4, 19, 40, 2, PD);
  for (const x of [8, 37]) { r(x, 14, 4, 30, PD); r(x, 14, 1, 30, PL); }
  r(41, 18, 4, 16, '#b8783a'); r(41, 18, 4, 1, '#d8985a'); for (let y = 20; y < 33; y += 3) r(42, y, 2, 2, '#2a1a10');
  r(13, 28, 4, 3, '#e8e0c8'); r(14, 31, 1, 4, PD);
  r(0, 44, 48, 4, '#8a8882');
});

spotSprites.okazakiHigashiPark = hiCanvas((r, h) => {
  const WA = '#6f7978', WL = '#8a9496', WD = '#556060';
  spanRows(h, 14, [[0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47]], i => i % 3 ? '#2c321f' : '#3f4a2a');
  for (const [x, w] of [[2, 6], [12, 5], [30, 7], [40, 6]]) { r(x, 11, w, 3, '#3f4a2a'); h(11, x + 1, x + w - 2, '#55643a'); }
  for (let y = 22; y < 47; y++) { const k = Math.sqrt(Math.max(0, 1 - Math.pow((y - 22) / 25, 2))); h(y, Math.round(24 - 24 * k), Math.round(23 + 24 * k), WA); }
  for (const [x, y] of [[4, 27], [20, 31], [34, 26], [10, 37], [26, 41], [36, 35], [18, 44]]) h(y, x, x + 5, WL);
  spanRows(h, 6, [[13, 14], [11, 16], [9, 18], [7, 20], [6, 21]], i => i % 2 ? '#57514c' : '#6e6862'); r(13, 4, 2, 2, '#404641');
  h(11, 6, 21, '#3e3a36'); for (const x of [7, 13, 20]) r(x, 12, 1, 7, '#404641'); h(16, 7, 20, '#7b818a');
  r(6, 19, 40, 2, '#7b818a'); h(19, 6, 45, '#9aa0a8'); h(17, 22, 45, '#7b818a'); for (let x = 23; x < 46; x += 4) r(x, 17, 1, 2, '#5a6068');
  for (let x = 8; x < 46; x += 4) r(x, 21, 1, 5, '#404641');
  for (let x = 8; x < 46; x += 4) r(x, 27, 1, 3, WD); h(29, 8, 20, WD); spanRows(h, 30, [[9, 18], [11, 16]], WD);
  for (const [x, y] of [[36, 0], [41, 3]]) { pix(r, PINE, x, y, '#2c3a24'); h(y, x + 2, x + 4, '#44583a'); }
});

spotSprites.okazakiHondaTei = hiCanvas((r, h) => {
  const CW = '#e2d8b6', CS = '#c6ba96', BR = '#9a6a48', RF = '#7a4a3a', WN = '#3a3a40', WF = '#f2eee2';
  const win = (x, y, w, hh) => { r(x, y, w, hh, WN); r(x, y, w, 1, WF); r(x + (w >> 1), y, 1, hh, WF); };
  for (let k = 0; k < 7; k++) { h(6 + k, 8 - k - 1, 9 + k + 1, BR); h(6 + k, 8 - k, 9 + k, CW); }
  r(1, 13, 16, 27, CW); r(13, 13, 4, 27, CS); h(13, 1, 16, BR);
  for (let a = 0; a <= 180; a += 15) { const t = a * Math.PI / 180; r(Math.round(8.5 - 5 * Math.cos(t)), Math.round(20 - 5 * Math.sin(t)), 1, 1, BR); }
  win(5, 16, 8, 5); h(22, 3, 14, BR); for (const x of [3, 7, 11]) win(x, 26, 3, 8);
  h(11, 16, 34, RF); h(12, 15, 35, '#5a3428'); r(16, 13, 18, 27, CW); h(13, 16, 33, BR);
  for (const x of [18, 25]) win(x, 15, 6, 5); h(22, 16, 33, BR);
  for (const cx of [19, 25, 31]) { spanRows(h, 25, [[cx - 2, cx + 1], [cx - 3, cx + 2], [cx - 3, cx + 2], [cx - 4, cx + 3]], BR); spanRows(h, 26, [[cx - 1, cx], [cx - 2, cx + 1], [cx - 3, cx + 2]], WN); r(cx - 3, 29, 6, 9, WN); r(cx - 4, 29, 1, 9, BR); r(cx + 3, 29, 1, 9, BR); r(cx - 1, 31, 2, 7, '#6a5a50'); }
  r(34, 9, 13, 31, CW); r(42, 9, 5, 31, CS); h(9, 34, 46, CS); for (let x = 34; x < 47; x += 3) r(x, 7, 2, 2, CW); h(10, 34, 46, BR); h(24, 34, 46, BR);
  for (const x of [35, 39, 43]) { win(x, 13, 3, 7); win(x, 27, 3, 8); }
  h(40, 0, 47, '#b8b0a0'); r(0, 41, 48, 7, '#8fa83a'); h(41, 0, 47, '#a8c050');
});

spotSprites.okazakiMinamiPark = hiCanvas((r, h) => {
  const PK = '#f0a2c0', PD = '#c05c88', PS = '#f8d4e2', GR = '#2f4a3e';
  r(4, 8, 36, 2, '#e8e6e0'); r(4, 10, 36, 13, '#e8e6e0'); for (let x = 4; x < 40; x += 6) r(x, 10, 3, 13, GR); h(16, 4, 39, '#c8c6be');
  for (let x = 6; x < 38; x += 4) { r(x, 18, 2, 4, '#5a6a72'); } h(22, 4, 39, '#b8b0a0'); r(2, 18, 2, 12, '#d8d4c8');
  for (const [x, c] of [[42, '#e8d24a'], [45, '#5ac0a0']]) r(x, 14, 2, 2, c);
  r(0, 30, 48, 18, '#6aa8a0'); h(30, 0, 47, '#7ec0b8');
  const cup = (x, y, w, c1, c2) => { spanRows(h, y, [[x, x + w], [x, x + w], [x + 1, x + w - 1], [x + 1, x + w - 1], [x + 2, x + w - 2], [x + 3, x + w - 3]], c1); h(y, x, x + w, c2); r(x + w + 1, y + 1, 2, 3, c2); spanRows(h, y + 6, [[x - 2, x + w + 2], [x - 1, x + w + 1]], PS); };
  cup(3, 27, 9, '#5aa8d8', '#2a6a98'); cup(12, 31, 13, PK, PD); cup(29, 33, 13, PK, PD);
  for (let x = 0; x < 48; x += 6) r(x, 39, 1, 7, '#d8dcdc'); h(40, 0, 47, '#e8ecec'); h(44, 0, 47, '#c8cccc');
});

spotSprites.okazakiMuseum = hiCanvas((r, h) => {
  const CL = '#d0cac4', CM = '#bcb4ac', CS = '#a99a92', GL = '#9baeb4', GF = '#c8d6dc';
  r(33, 3, 11, 26, GL); for (let y = 3; y < 29; y += 3) h(y, 33, 43, GF); for (let x = 33; x < 44; x += 3) r(x, 3, 1, 26, GF); r(41, 3, 3, 26, '#86989e');
  spanRows(h, 12, [[2, 22], [1, 22]], '#707577'); for (const x of [4, 10, 16, 21]) r(x, 14, 1, 10, '#e8e8e8');
  r(4, 22, 32, 6, CM); h(22, 4, 35, CL); r(8, 18, 24, 4, CL); h(18, 8, 31, '#e0dad4');
  r(0, 28, 48, 6, CS); h(28, 0, 47, CM); r(28, 24, 10, 5, CL); h(24, 28, 37, '#e0dad4');
  for (let y = 34; y < 48; y++) h(y, Math.max(0, 22 - (y - 34) * 2), 47, (y % 2) ? CM : CL);
  spanRows(h, 34, [[2, 20], [2, 17], [2, 14], [2, 11], [2, 8]], CS); h(38, 2, 10, '#8a7e76');
});

spotSprites.okazakiHigashiOkazakiSta = hiCanvas((r, h) => {
  const GY = '#b4b4ae', GD = '#8e8e88', WN = '#4a5560';
  r(0, 8, 48, 34, GY); h(8, 0, 47, '#d4d4ce'); r(10, 4, 14, 4, '#e8e8e8'); r(11, 5, 12, 2, '#d23a2e');
  for (const y of [11, 17]) { for (let x = 1; x < 47; x += 4) r(x, y, 3, 4, WN); h(y + 5, 0, 47, GD); }
  for (const [x, w, c] of [[0, 9, '#d23a2e'], [9, 7, '#2f74b8'], [16, 10, '#d23a2e'], [26, 6, '#3f9a5a'], [32, 9, '#2f74b8'], [41, 7, '#f2c230']]) { r(x, 24, w, 4, c); h(25, x + 1, x + w - 2, '#ffffff'); }
  h(28, 0, 47, GD); r(0, 29, 48, 10, '#3a3e44'); for (let x = 2; x < 46; x += 7) r(x, 30, 5, 8, '#6a7a88'); r(20, 31, 8, 8, '#222');
  r(0, 39, 48, 3, '#9a9a96'); r(0, 42, 48, 6, '#7a7a78'); for (const x of [8, 26]) r(x, 44, 6, 1, '#f4f4f4');
  r(34, 30, 2, 12, '#5a4030'); r(31, 26, 8, 6, '#3f7a34'); r(32, 25, 5, 1, '#5a9a44');
});

spotSprites.okazakiOkazakiSta = hiCanvas((r, h) => {
  const SV = '#c8ccd0', SD = '#9aa0a6', GL = '#6f8696', GH = '#b0c4d0';
  r(10, 4, 36, 30, SV); h(4, 10, 45, '#e4e6e8'); for (let y = 8; y < 34; y += 4) h(y, 10, 45, SD); r(38, 4, 8, 30, SD);
  r(30, 10, 8, 16, '#4a6070'); h(10, 30, 37, '#7a90a0');
  r(1, 16, 12, 24, GL); for (let y = 16; y < 40; y += 4) h(y, 1, 12, GH); for (let x = 1; x < 13; x += 4) r(x, 16, 1, 24, '#d8e0e6'); h(15, 0, 13, '#e4e6e8');
  r(8, 24, 22, 6, '#f8f8f8'); r(9, 25, 4, 4, '#f08a24'); r(10, 26, 2, 2, '#ffffff'); for (let x = 15; x < 28; x += 2) r(x, 26, 1, 2, '#222');
  r(12, 30, 34, 10, '#3e4a54'); for (let x = 14; x < 46; x += 5) r(x, 31, 3, 9, GL);
  r(0, 40, 48, 8, '#a8a6a2'); h(40, 0, 47, '#c4c2be'); r(36, 41, 10, 4, '#4f8a3a');
});

spotSprites.okazakiShooji = hiCanvas((r, h) => {
  const RC = ['#8c9096', '#62666e', '#3a3e44', '#545860'], WD = '#7a5a3c', DK = '#2e2620';
  for (let k = 0; k < 9; k++) { h(5 + k, 24 - k - 1, 25 + k + 1, '#3a3e44'); h(5 + k, 24 - k, 25 + k, '#62666e'); if (k >= 3) h(5 + k, 24 - k + 2, 25 + k - 2, '#ece8de'); }
  r(23, 3, 4, 2, '#5a5e66'); h(10, 19, 30, WD);
  tileRoof(r, h, 13, [[8, 41], [6, 43], [4, 45], [2, 47], [1, 47]], RC);
  r(5, 18, 38, 18, '#9a7a56'); for (const x of [5, 13, 21, 28, 35, 42]) r(x, 18, 1, 18, WD); h(18, 5, 42, '#6a4a30'); h(23, 5, 42, '#6a4a30');
  r(14, 24, 20, 12, DK); for (let x = 15; x < 34; x += 2) r(x, 24, 1, 12, '#5a4632'); r(22, 28, 4, 8, '#1a1410');
  h(36, 2, 45, '#a9a49a'); h(37, 4, 43, '#c4bfb4'); r(0, 38, 48, 10, '#b8b2a6'); spanRows(h, 38, [[20, 28], [19, 29], [18, 30], [17, 31], [16, 32]], '#d8d2c6');
  for (const [x, y] of [[0, 2], [3, 6], [0, 10]]) { pix(r, PINE, x, y, '#2f5a32'); h(y, x + 2, x + 4, '#4a7a48'); } r(4, 13, 1, 22, '#5a4030');
  r(40, 28, 3, 10, '#e8e4d8'); r(41, 29, 1, 7, '#333');
});

spotSprites.okazakiHozoji = hiCanvas((r, h) => {
  const WD = '#6a4a32', WL = '#8a6a4a', DK = '#3a2a1e';
  r(23, 1, 2, 3, '#d8b040'); r(22, 3, 4, 1, '#b08a30');
  tileRoof(r, h, 4, [[21, 26], [19, 28], [17, 30], [15, 32], [13, 34], [11, 36], [9, 38], [7, 40], [5, 42], [4, 43]], ['#9aa098', '#7a8078', '#3e423e', '#6a7068']);
  h(14, 6, 41, '#2e2a26'); r(9, 15, 30, 17, WD); for (const x of [9, 16, 23, 31, 38]) r(x, 15, 1, 17, WL);
  r(18, 18, 12, 14, DK); for (let x = 19; x < 30; x += 2) r(x, 18, 1, 14, '#6a5038'); for (let y = 19; y < 32; y += 3) h(y, 18, 29, '#6a5038');
  r(10, 18, 5, 6, DK); r(33, 18, 5, 6, DK); r(25, 16, 6, 2, '#c03a2a');
  h(32, 4, 43, '#9a7a56'); h(33, 4, 43, '#5a4030'); for (let x = 5; x < 44; x += 3) r(x, 28, 1, 4, '#9a7a56'); h(28, 4, 43, '#9a7a56');
  r(6, 34, 36, 4, '#2a2420'); for (const x of [6, 18, 29, 41]) r(x, 34, 1, 4, WL); h(38, 3, 44, '#b8b4aa'); h(39, 3, 44, '#9a968c');
  r(43, 12, 5, 26, '#f0ece2'); r(0, 8, 5, 20, '#4a7a3a'); r(1, 7, 3, 1, '#6a9a4a');
});

spotSprites.okazakiFujikawaShuku = hiCanvas((r, h) => {
  const RC = ['#6a6e78', '#4a4e56', '#2a2c30', '#3e4248'];
  tileRoof(r, h, 14, [[2, 45], [1, 46], [0, 47], [0, 47]], RC);
  for (const cx of [12, 33]) for (let k = 0; k < 6; k++) { h(9 + k, cx - k - 1, cx + k + 1, '#2a2c30'); h(9 + k, cx - k, cx + k, '#4a4e56'); if (k >= 2) h(9 + k, cx - k + 2, cx + k - 2, '#ece8e0'); }
  r(1, 18, 46, 12, '#ece8e0'); h(18, 1, 46, '#6a5440'); for (let x = 1; x < 47; x += 6) r(x, 18, 1, 12, '#6a5440');
  for (let x = 3; x < 45; x += 6) r(x, 21, 4, 7, '#5a6e7e'); r(20, 20, 8, 3, '#3a2a1a'); for (const x of [22, 24, 26]) r(x, 21, 1, 1, '#e8d8a8');
  r(0, 30, 48, 18, '#5a5a5c'); for (let x = 2; x < 48; x += 7) r(x, 32, 1, 8, '#f0f0f0'); h(40, 0, 47, '#f0f0f0'); r(4, 41, 8, 5, '#3a7ac8'); r(6, 42, 4, 3, '#ffffff');
  for (const [x, c] of [[16, '#e8e8e8'], [30, '#5a6a8a'], [37, '#d8d8d0']]) { r(x, 33, 6, 4, c); r(x + 1, 32, 4, 1, c); r(x + 1, 37, 1, 1, '#222'); r(x + 4, 37, 1, 1, '#222'); }
});

spotSprites.okazakiKuragari = hiCanvas((r, h) => {
  for (const [x, y, w, c] of [[0, 0, 14, '#2f5a2a'], [12, 2, 12, '#3f6a32'], [24, 0, 12, '#2a4a24'], [34, 3, 14, '#3f6a32']]) { r(x, y, w, 14, c); r(x + 2, y + 1, w - 5, 2, '#5a8a44'); }
  spanRows(h, 10, [[17, 31], [15, 33], [13, 35], [12, 36]], i => i % 2 ? '#6a5040' : '#7e6250'); r(30, 6, 3, 5, '#5a5a5a');
  r(14, 14, 20, 12, '#8a6a4a'); for (let x = 15; x < 34; x += 3) r(x, 14, 1, 12, '#6a4e36'); r(17, 17, 5, 4, '#2e2a26'); r(26, 17, 5, 4, '#2e2a26'); r(23, 19, 3, 7, '#3a2a1e');
  r(0, 14, 13, 14, '#3a6a30'); r(35, 14, 13, 14, '#2f5a2a');
  r(0, 26, 48, 22, '#c8c4bc'); for (const [x, y] of [[3, 29], [12, 33], [30, 30], [40, 34], [20, 40], [6, 42], [36, 43]]) { r(x, y, 4, 2, '#a8a49c'); h(y, x, x + 2, '#e0dcd4'); }
  spanRows(h, 36, [[26, 47], [22, 47], [18, 47], [16, 47], [14, 47], [12, 47]], '#6a9ab0'); for (const [x, y] of [[30, 38], [24, 40], [38, 39], [20, 41]]) h(y, x, x + 3, '#a8c8d8');
});

spotSprites.okazakiHongusan = hiCanvas((r, h) => {
  for (let y = 12; y < 44; y++) { const k = y - 12, a = Math.max(0, Math.round(20 - k * 1.6 - k * k * 0.02)), b = Math.min(47, Math.round(28 + k * 1.4 + k * k * 0.02)); h(y, a, b, y < 18 ? '#4a5a3e' : y < 28 ? '#3e5034' : '#34462c'); }
  spanRows(h, 10, [[22, 26], [20, 28]], '#4a5a3e');
  for (let y = 12; y < 42; y += 3) { r(22 - (y - 12) / 2 | 0, y, 2, 1, '#5e7048'); r(30 + (y - 12) / 3 | 0, y + 1, 2, 1, '#2a3a24'); }
  r(24, 5, 1, 5, '#c8c8c8'); r(21, 7, 1, 3, '#c8c8c8'); r(23, 4, 3, 1, '#e8e8e8');
  r(0, 40, 48, 8, '#7a8a5a'); for (let x = 2; x < 48; x += 6) r(x, 42, 3, 2, '#d8d0c0'); h(44, 0, 47, '#8a9a6a');
});

spotSprites.anjoJozanen = hiCanvas((r, h) => {
  for (let x = 0; x < 48; x += 3) { r(x, 0, 2, 22, x % 2 ? '#5a8a3a' : '#4a7a32'); r(x + 1, 0, 1, 22, '#78a850'); }
  spanRows(h, 9, [[24, 27], [21, 30], [19, 32], [17, 34], [15, 36], [14, 37]], i => i % 2 ? '#8a7a60' : '#9a8a6e'); h(15, 14, 37, '#5a4e3c');
  for (const x of [16, 25, 35]) r(x, 16, 1, 8, '#4a3a2a'); r(17, 21, 18, 3, '#6a5a44');
  r(0, 24, 48, 6, '#3f6a32'); for (const [x, w] of [[2, 8], [12, 6], [38, 8]]) { r(x, 22, w, 4, '#4f7a3a'); h(22, x + 1, x + w - 2, '#6a9a4a'); }
  r(0, 30, 48, 10, '#5a7a6a'); for (const [x, y] of [[4, 33], [22, 35], [36, 32]]) h(y, x, x + 5, '#7a9a8a'); r(14, 29, 5, 3, '#8a8478'); r(30, 30, 4, 2, '#8a8478');
  r(0, 40, 48, 8, '#d8d0c0'); spanRows(h, 40, [[0, 20], [0, 16], [0, 12]], '#6a9a3a');
});

spotSprites.anjoHonshoji = hiCanvas((r, h) => {
  const RC = ['#c8c8cc', '#8e9096', '#4a4c52', '#74767c'], PL = '#ece8de', BK = '#2a2a2c';
  r(17, 1, 2, 3, '#5a5c62'); r(29, 1, 2, 3, '#5a5c62'); h(3, 17, 30, '#4a4c52');
  tileRoof(r, h, 4, [[15, 32], [13, 34], [11, 36], [9, 38], [8, 39]], RC);
  for (let k = 0; k < 5; k++) { h(2 + k, 23 - k - 1, 24 + k + 1, '#4a4c52'); if (k >= 2) h(2 + k, 23 - k + 1, 24 + k - 1, PL); }
  r(13, 9, 22, 9, PL); h(9, 13, 34, '#b8b4aa'); for (const x of [13, 19, 28, 34]) r(x, 9, 1, 9, '#6a5040'); r(21, 11, 6, 4, '#4a3a2a'); for (let x = 22; x < 27; x += 2) r(x, 11, 1, 4, '#8a7050');
  tileRoof(r, h, 18, [[8, 39], [6, 41], [4, 43], [3, 44], [2, 45]], RC); h(23, 4, 43, PL);
  r(7, 24, 34, 13, BK); for (let x = 8; x < 41; x += 2) r(x, 24, 1, 13, '#3a3a3c'); r(18, 27, 12, 10, '#6a4a30'); r(23, 27, 2, 10, '#3a2a1a'); h(24, 7, 40, PL);
  for (let y = 37; y < 48; y++) { const k = (y - 37) >> 1; h(y, 5 - k, 42 + k, (y % 2) ? '#8a8680' : '#a8a49e'); } for (let x = 8; x < 42; x += 5) { r(x, 39, 1, 2, '#6a6660'); r(x + 2, 43, 1, 2, '#6a6660'); }
});

spotSprites.anjoCastle = hiCanvas((r, h) => {
  tileRoof(r, h, 8, [[6, 24], [4, 26], [3, 27], [2, 28]], ['#8c9096', '#5a5e66', '#33363c', '#4a4e56']); r(5, 12, 20, 10, '#7a5a3c'); r(10, 14, 10, 8, '#3a2a20');
  for (const [x, y] of [[26, 0], [33, 2], [28, 5], [37, 7]]) { pix(r, PINE, x, y, '#2f5a32'); h(y, x + 2, x + 4, '#4a7a48'); } r(33, 9, 2, 14, '#5a4030');
  r(31, 18, 7, 24, '#b8b4ac'); r(36, 18, 2, 24, '#9a968e'); h(18, 31, 37, '#d0ccc4'); for (let y = 21; y < 38; y += 3) r(33, y, 2, 2, '#4a4844');
  r(19, 30, 6, 2, '#a8a49c'); r(20, 32, 4, 3, '#c8c4bc'); r(21, 33, 2, 1, '#ffe27a'); r(20, 35, 4, 1, '#a8a49c'); r(21, 36, 2, 5, '#a8a49c'); r(19, 41, 6, 1, '#8a867e');
  for (const [x, y, w, c] of [[0, 32, 16, '#3f6a32'], [10, 36, 10, '#5a8a3a'], [38, 34, 10, '#4a7a3a'], [26, 38, 8, '#3f6a32']]) { r(x, y, w, 10 - (y - 32), c); h(y, x + 1, x + w - 2, '#6a9a4a'); }
  for (const [x, y] of [[4, 42], [14, 44], [40, 43]]) { r(x, y, 5, 3, '#8a8478'); h(y, x + 1, x + 3, '#a8a296'); }
  r(0, 46, 48, 2, '#b8a888');
});

spotSprites.anjoMuseum = hiCanvas((r, h) => {
  const BG = '#cfc8ba', BS = '#b4ac9c', RF = '#7a4a3a', GL = '#3a4a5a', GM = '#c8ccd0';
  r(0, 24, 14, 16, '#ece8e0'); h(23, 0, 13, '#a8a49a'); for (let x = 1; x < 13; x += 4) r(x, 27, 3, 5, '#5a6a78');
  for (let k = 0; k < 16; k++) { const y = 5 + k; h(y, 26 - k - 2, 27 + k + 2, RF); h(y, 26 - k, 27 + k, BG); }
  r(10, 21, 34, 19, BG); r(38, 21, 6, 19, BS); h(21, 8, 45, RF);
  for (let k = 0; k < 13; k++) { const y = 11 + k; h(y, 26 - k + 1, 27 + k - 1, GL); }
  r(15, 24, 24, 16, GL); for (let x = 17; x < 39; x += 4) r(x, 11, 1, 29, GM); for (let y = 16; y < 40; y += 5) h(y, 15, 38, GM); r(26, 11, 1, 29, GM);
  r(0, 40, 48, 2, '#9a968c'); r(0, 42, 48, 6, '#c8c4bc'); for (let x = 3; x < 48; x += 8) r(x, 44, 4, 1, '#d8d4cc');
  r(42, 30, 2, 12, '#5a4030'); r(39, 24, 8, 7, '#4a7a3a'); r(40, 23, 5, 1, '#6a9a4a');
});

spotSprites.anjoHoriuchiPark = hiCanvas((r, h) => {
  const cx = 24, cy = 19, R = 17, cols = ['#d23a2e', '#2f74b8', '#f2c230', '#3f9a5a', '#e57399', '#8a5ac8'];
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) if (Math.hypot(x - cx, y - cy) < R) r(x, y, 1, 1, '#cfe6f2');
  for (let a = 0; a < 360; a += 3) { const t = a * Math.PI / 180; r(Math.round(cx + R * Math.cos(t)), Math.round(cy + R * Math.sin(t)), 1, 1, '#d8dce0'); r(Math.round(cx + (R - 3) * Math.cos(t)), Math.round(cy + (R - 3) * Math.sin(t)), 1, 1, '#b8bcc0'); }
  for (let a = 0; a < 360; a += 30) { const t = a * Math.PI / 180; for (let d = 2; d < R; d += 1) r(Math.round(cx + d * Math.cos(t)), Math.round(cy + d * Math.sin(t)), 1, 1, '#c8ccd0'); }
  r(cx - 2, cy - 2, 4, 4, '#e8e8e8');
  for (let i = 0; i < 12; i++) { const t = i * 30 * Math.PI / 180, x = Math.round(cx + R * Math.cos(t)), y = Math.round(cy + R * Math.sin(t)); r(x - 1, y, 3, 3, cols[i % 6]); r(x, y + 1, 1, 1, '#ffffff'); }
  for (let y = cy; y < 42; y++) { const k = (y - cy) * 0.45; r(Math.round(cx - 2 - k), y, 2, 1, '#e8ecee'); r(Math.round(cx + 1 + k), y, 2, 1, '#c8ccd0'); }
  for (const [x, w, c] of [[0, 12, '#3f6a32'], [10, 10, '#4f7a3a'], [34, 14, '#3f6a32'], [27, 9, '#4f7a3a']]) { r(x, 36, w, 8, c); h(36, x + 1, x + w - 2, '#6a9a4a'); }
  r(0, 44, 48, 4, '#6aa040');
});

spotSprites.anjoPark = hiCanvas((r, h) => {
  for (const [x, y, w, c] of [[0, 2, 14, '#3f6a32'], [12, 6, 10, '#5a8a3a'], [22, 0, 12, '#3f6a32'], [33, 4, 15, '#4f7a3a']]) { r(x, y, w, 18 - y, c); r(x + 2, y + 1, w - 5, 2, '#6a9a4a'); }
  r(4, 14, 2, 6, '#5a4030'); r(40, 14, 2, 6, '#5a4030');
  r(0, 20, 48, 28, '#4a5a50'); for (const [x, y] of [[4, 34], [30, 38], [16, 44], [38, 28]]) h(y, x, x + 6, '#6a7a70'); spanRows(h, 21, [[0, 47], [0, 47]], '#3a4a40');
  for (let x = 8; x <= 40; x++) { const y = Math.round(25 - 5 * Math.sin((x - 8) / 32 * Math.PI)); r(x, y, 1, 2, '#b03a2a'); r(x, y - 2, 1, 1, '#c84a3a'); } for (let x = 10; x < 40; x += 4) { const y = Math.round(25 - 5 * Math.sin((x - 8) / 32 * Math.PI)); r(x, y - 2, 1, 2, '#c84a3a'); }
  for (let x = 9; x <= 39; x += 3) { const y = Math.round(29 + 3 * Math.sin((x - 8) / 32 * Math.PI)); r(x, y, 2, 1, '#6a3a30'); }
  spanRows(h, 36, [[18, 34], [16, 36], [16, 36], [18, 34]], '#3f6a32'); for (let x = 17; x < 36; x += 3) r(x, 35, 1, 3, '#8a6a4a'); h(36, 16, 36, '#8a6a4a');
});

spotSprites.anjoFutagoKofun = hiCanvas((r, h) => {
  for (let x = 0; x < 48; x++) { const y = Math.round(30 - Math.max(9 * Math.exp(-Math.pow((x - 14) / 9, 2)), 11 * Math.exp(-Math.pow((x - 33) / 10, 2)), 2)); for (let yy = y; yy < 34; yy++) r(x, yy, 1, 1, yy < y + 2 ? '#a8c060' : yy < y + 6 ? '#8aa84a' : '#7a9a40'); }
  for (const [x, y] of [[8, 13], [15, 10], [26, 10], [33, 7], [40, 11]]) { pix(r, ['.###.', '#####', '.###.'], x, y, '#2f5a2a'); r(x + 2, y + 3, 1, 5, '#5a4030'); h(y, x + 1, x + 3, '#4a7a3a'); }
  h(34, 0, 47, '#c8b888'); r(0, 35, 48, 13, '#5aa03a'); for (let y = 36; y < 48; y += 2) for (let x = (y % 4) ? 0 : 2; x < 48; x += 4) r(x, y, 2, 1, '#7ac050');
  r(43, 28, 3, 7, '#9a968c'); h(28, 43, 45, '#b8b4ac');
});

spotSprites.anjoHimeogawaKofun = hiCanvas((r, h) => {
  for (const [x, y, w, c] of [[0, 0, 16, '#2f5a2a'], [14, 2, 8, '#4a7a3a'], [26, 0, 10, '#3f6a32'], [34, 1, 14, '#2f5a2a']]) { r(x, y, w, 22 - y, c); r(x + 2, y + 1, w - 5, 2, '#5a8a44'); }
  spanRows(h, 6, [[19, 28], [17, 30], [16, 31]], i => i % 2 ? '#5a5f66' : '#7a7f86'); r(18, 9, 12, 7, '#8a6a4a'); r(21, 10, 6, 6, '#3a2a20'); r(23, 8, 2, 1, '#e2b13a');
  for (let y = 16; y < 42; y++) { const k = Math.round((y - 16) * 0.35); h(y, 20 - k, 27 + k, (y % 2) ? '#a8a49a' : '#c8c3b8'); }
  for (const x of [6, 37]) { r(x, 24, 6, 2, '#b8b4a8'); r(x + 1, 26, 4, 4, '#c8c4b8'); r(x + 2, 27, 2, 2, '#ffe27a'); r(x, 30, 6, 1, '#b8b4a8'); r(x + 2, 31, 2, 8, '#b8b4a8'); r(x, 39, 6, 2, '#9a968c'); }
  r(0, 22, 6, 20, '#4a5a3a'); r(42, 22, 6, 20, '#4a5a3a'); r(0, 42, 48, 6, '#c8bca8'); for (const [x, y] of [[4, 44], [38, 45]]) h(y, x, x + 4, '#b0a490');
});

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

spotSprites.anjoMikawaAnjoStation = hiCanvas((r, h) => {
  spanRows(h, 1, [[26, 27], [25, 28], [24, 29], [23, 30]], i => i < 2 ? '#b84a58' : '#9a3040');
  r(24, 5, 6, 12, '#ece9e6'); r(29, 5, 1, 12, '#c8c4c4'); r(25, 8, 4, 4, '#ffffff'); r(26, 9, 1, 2, '#333'); r(27, 10, 1, 1, '#333');
  tileRoof(r, h, 14, [[6, 41], [5, 42], [4, 43], [3, 44], [2, 45], [1, 46], [1, 46], [0, 47]], ['#9a7a6e', '#7a5a50', '#4a3a34', '#6a4c44']);
  for (const x of [7, 14, 36, 42]) { spanRows(h, 14, [[x + 1, x + 2], [x, x + 3], [x - 1, x + 4], [x - 1, x + 4]], '#ece8e0'); r(x, 16, 3, 2, '#4a4448'); }
  r(2, 22, 44, 12, '#d8cfc0'); for (let x = 4; x < 46; x += 4) r(x, 24, 2, 4, '#5a5458'); for (let x = 3; x < 46; x += 8) r(x, 22, 1, 12, '#c4baa8');
  spanRows(h, 16, [[23, 24], [22, 25], [21, 26], [20, 27], [19, 28], [18, 29], [17, 30], [16, 31]], i => i % 2 ? '#8a4a48' : '#a05a56');
  r(18, 24, 12, 10, '#d8cfc0'); spanRows(h, 25, [[22, 25], [20, 27], [19, 28]], '#2a2224'); r(19, 28, 10, 6, '#2a2224'); r(21, 29, 6, 5, '#5a6870');
  r(35, 25, 7, 2, '#3a8a3a'); r(36, 25, 2, 1, '#e8601c');
  r(0, 34, 48, 1, '#3a3a3e'); for (let x = 0; x < 48; x += 2) r(x, 35, 1, 3, '#3a3a3e'); h(37, 0, 47, '#3a3a3e');
  r(0, 38, 48, 3, '#4a7a34'); for (let x = 1; x < 48; x += 3) r(x, 38, 1, 1, '#e8c840');
  r(0, 41, 48, 7, '#a8a8a6'); for (let x = 4; x < 48; x += 8) r(x, 41, 1, 7, '#c4c4c2');
});

spotSprites.anjoMinamiAnjoStation = hiCanvas((r, h) => {
  for (const x of [6, 36]) { r(x, 0, 1, 10, '#7a7e84'); h(2, x - 3, x + 4, '#7a7e84'); }
  r(0, 8, 32, 6, '#a09888'); h(8, 0, 31, '#b8b0a0'); h(13, 0, 31, '#7a7266');
  r(4, 14, 22, 16, '#675040'); for (let x = 5; x < 26; x += 3) r(x, 14, 1, 16, '#5a4436');
  r(22, 11, 26, 26, '#e6e0d6'); h(11, 22, 47, '#f2ede4'); for (let x = 22; x < 48; x += 6) r(x, 12, 2, 25, '#cfc8bc'); for (let x = 25; x < 46; x += 6) r(x, 16, 2, 14, '#7a8288');
  r(2, 28, 20, 10, '#ece8e0'); r(6, 27, 10, 2, '#f8f8f8'); r(7, 27, 2, 2, '#2f5fae'); for (let x = 10; x < 16; x += 2) r(x, 28, 1, 1, '#2f5fae'); r(6, 31, 9, 7, '#3a3a3c'); r(8, 32, 5, 4, '#6a7880');
  r(17, 33, 2, 5, '#d23a2e'); h(33, 17, 18, '#e8584a');
  r(0, 38, 48, 3, '#3f6a2f'); h(38, 0, 47, '#4f7a3a'); r(0, 41, 48, 7, '#6a6a6a'); h(44, 0, 47, '#7a7a7a');
});

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

spotSprites.hekinanRinkaiPark = hiCanvas((r, h) => {
  r(36, 14, 1, 14, '#c83a3a'); r(45, 14, 1, 14, '#c83a3a'); spanRows(h, 11, [[39, 42], [37, 44], [36, 45]], '#8a5a3a'); h(20, 36, 45, '#c83a3a'); spanRows(h, 21, [[30, 35], [26, 31], [22, 27]], '#3a9a5a');
  r(0, 28, 48, 20, '#7a9a48'); for (const [x, y] of [[3, 44], [14, 46], [40, 44], [30, 46]]) r(x, y, 4, 1, '#8aaa58');
  spanRows(h, 30, [[10, 37], [6, 41], [4, 43], [4, 43], [5, 42], [8, 39], [12, 35]], i => i === 0 || i === 6 ? '#c8c4bc' : '#9ab8c8'); for (const [x, y] of [[8, 33], [30, 34], [20, 35]]) r(x, y, 4, 1, '#c4dce8');
  spanRows(h, 8, [[20, 25], [18, 27], [17, 28], [16, 29], [16, 29], [16, 30], [17, 30], [17, 30], [18, 30], [18, 30], [19, 30], [19, 30], [20, 30], [20, 31], [19, 32], [18, 33], [17, 34], [17, 35], [18, 35], [20, 34], [22, 33], [24, 31]], i => i < 3 ? '#6a8ac0' : '#4a6a9a');
  for (let y = 13; y < 28; y++) r(17 + Math.floor((y - 13) / 4), y, 2, 1, '#e8eef4');
  r(25, 13, 2, 2, '#1e212a'); r(21, 10, 3, 1, '#8aaad8');
  spanRows(h, 2, [[21, 21], [19, 23], [18, 24]], '#d8f0fc'); r(21, 5, 1, 3, '#d8f0fc');
  for (const [x, y] of [[14, 29], [34, 29], [12, 31], [37, 31]]) r(x, y, 2, 2, '#e8f4fc');
});

spotSprites.hekinanAkashiPark = hiCanvas((r, h) => {
  const CX = 24, CY = 19;
  for (let a = 0; a < 360; a += 30) { const t = a * Math.PI / 180; for (let d = 2; d < 16; d++) r(Math.round(CX + d * Math.cos(t)), Math.round(CY + d * Math.sin(t)), 1, 1, '#e8e8ec'); }
  for (let y = 0; y < 40; y++) for (let x = 4; x < 45; x++) { const d = Math.hypot(x - CX, y - CY); if (d >= 15.3 && d < 16.6) r(x, y, 1, 1, '#f8f8f8'); else if (d >= 9.6 && d < 10.4) r(x, y, 1, 1, '#c8c8d0'); }
  [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].forEach((a, i) => { const t = a * Math.PI / 180; r(Math.round(CX + 17 * Math.cos(t)) - 1, Math.round(CY + 17 * Math.sin(t)) - 1, 3, 3, ['#d23a3a', '#f2c230', '#3a6ad0'][i % 3]); });
  r(CX - 1, CY - 1, 3, 3, '#b8b8c0');
  for (let i = 0; i < 20; i++) { r(Math.round(CX - i * 0.55) - 1, CY + i, 2, 1, '#f0f0f4'); r(Math.round(CX + i * 0.55), CY + i, 2, 1, '#f0f0f4'); }
  r(0, 39, 48, 9, '#a6715a'); for (let y = 41; y < 48; y += 3) h(y, 0, 47, '#8a5a48'); for (let x = 3; x < 48; x += 6) r(x, 39, 1, 9, '#8a5a48');
  for (const x of [2, 9, 37, 43]) { spanRows(h, 35, [[x + 1, x + 2], [x, x + 3]], '#4a8ad8'); r(x + 1, 35, 1, 2, '#ffffff'); r(x + 2, 37, 1, 3, '#888'); }
});

spotSprites.hekinanShomyoji = hiCanvas((r, h) => {
  h(5, 15, 32, '#6a6a6c'); h(6, 15, 32, '#4a4a4c');
  spanRows(h, 7, [[14, 33], [13, 34], [12, 35], [11, 36], [10, 37], [9, 38], [8, 39], [8, 39]], i => i === 7 ? '#5a7a68' : i < 3 ? '#b8d4c0' : '#9cc0a8');
  for (let y = 7; y < 14; y++) for (let x = 15 - (y - 7) + (y % 2); x < 33 + (y - 7); x += 3) r(x, y, 1, 1, '#8ab098');
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

spotSprites.hekinanKaitokuji = hiCanvas((r, h) => {
  tileRoof(r, h, 15, [[6, 41], [4, 43], [2, 45], [1, 46], [0, 47]], ['#8a8886', '#6a6866', '#3a3836', '#5a5856']);
  for (let k = 0; k < 15; k++) { const y = 4 + k; h(y, 23 - k - 1, 24 + k + 1, '#5a5856'); h(y, 23 - k, 24 + k, '#7a7876'); if (k >= 3) h(y, 23 - k + 2, 24 + k - 2, '#6a5e54'); }
  for (const y of [11, 15]) h(y, 23 - (y - 4) + 3, 24 + (y - 4) - 3, '#8a7a68'); r(23, 9, 2, 9, '#8a7a68'); r(21, 13, 6, 2, '#a89888');
  r(22, 1, 4, 3, '#4a4a4c'); r(21, 2, 1, 2, '#4a4a4c'); r(26, 2, 1, 2, '#4a4a4c'); r(23, 2, 2, 1, '#7a7a7c');
  tileRoof(r, h, 20, [[3, 44], [2, 45], [1, 46], [0, 47]], ['#8a8886', '#6a6866', '#3a3836', '#5a5856']);
  r(4, 24, 40, 14, '#3a2e28'); for (const x of [4, 11, 18, 29, 36, 43]) r(x, 24, 1, 14, '#5a4638');
  for (const [a, b] of [[5, 10], [12, 17], [30, 35], [37, 42]]) { for (let x = a; x <= b; x += 2) r(x, 26, 1, 10, '#6a5444'); h(30, a, b, '#6a5444'); }
  r(19, 27, 10, 11, '#4a3c34'); for (const x of [21, 24, 27]) r(x, 27, 1, 11, '#7a6450'); r(20, 28, 8, 2, '#8a9aa4');
  spanRows(h, 38, [[15, 32], [14, 33], [13, 34], [12, 35]], i => i % 2 ? '#c9b498' : '#d8c8a8');
  r(0, 42, 48, 6, '#d8d6d0'); r(20, 42, 8, 6, '#c8c4bc');
  for (const [x, y] of [[38, 14], [40, 19], [37, 23], [41, 27]]) { pix(r, PINE, x, y, '#2f5a30'); h(y, x + 2, x + 4, '#4a7a44'); } r(42, 22, 2, 16, '#5a4030');
});

spotSprites.hekinanKokonoeMirin = hiCanvas((r, h) => {
  const NV = '#202c46', NH = '#2c3a58';
  tileRoof(r, h, 9, [[32, 46], [33, 47], [34, 47]], ['#7a7a82', '#616069', '#3a3a40', '#55545c']);
  for (let k = 0; k < 16; k++) { const y = 4 + k; h(y, 22 - Math.round(k * 1.3), 23 + Math.round(k * 1.3), '#e8e8e8'); if (k >= 1) h(y, 23 - Math.round(k * 1.3), 22 + Math.round(k * 1.3), NV); }
  r(20, 2, 5, 2, '#3a3a40'); r(21, 1, 3, 1, '#3a3a40');
  r(2, 20, 42, 17, NV); for (let x = 3; x < 44; x += 3) r(x, 20, 1, 17, NH); r(44, 12, 3, 25, '#1a2236');
  for (const [x, y] of [[12, 14], [20, 10], [30, 14], [8, 22], [17, 22], [26, 22], [36, 22], [12, 28], [31, 28], [22, 16]]) { r(x, y, 3, 3, '#f0f0f0'); r(x + 1, y, 1, 3, '#b8bcc4'); h(y + 1, x, x + 2, '#b8bcc4'); }
  for (const x of [6, 14, 22, 30, 38]) { r(x, 33, 4, 2, '#d8d8d8'); h(34, x, x + 3, '#8a8a90'); }
  r(1, 37, 46, 6, '#6a6a70'); for (let y = 38; y < 43; y += 2) for (let x = 1 + (y % 4 ? 2 : 0); x < 47; x += 5) r(x, y, 4, 1, '#808088'); h(37, 1, 46, '#4a4a50');
  r(0, 43, 48, 5, '#b8b4ac');
});

spotSprites.hekinanFujiiMuseum = hiCanvas((r, h) => {
  const DK = '#343e4f', DL = '#2a3242';
  spanRows(h, 9, [[20, 33], [16, 36], [12, 39], [8, 41], [4, 42], [2, 43]], '#3c485f'); h(9, 20, 33, '#4c5a72');
  r(2, 15, 40, 22, DK); for (let x = 3; x < 42; x += 2) r(x, 15, 1, 22, DL);
  r(18, 12, 18, 25, '#608197'); for (let x = 18; x < 36; x += 3) r(x, 12, 1, 25, '#4a6070'); for (let y = 12; y < 37; y += 6) h(y, 18, 35, '#4a6070'); for (let i = 0; i < 10; i++) r(20 + i, 13 + i, 2, 1, '#a8c4d4');
  r(37, 10, 9, 27, '#2e3646'); for (let x = 38; x < 46; x += 2) r(x, 10, 1, 27, '#3c4658'); r(40, 18, 2, 2, '#c84a3a'); r(40, 22, 2, 2, '#c84a3a');
  r(10, 33, 8, 4, '#a8343a');
  spanRows(h, 37, [[16, 38], [15, 39], [14, 40]], i => i % 2 ? '#9a9a96' : '#b8b8b4'); r(0, 40, 48, 8, '#6a6a6a'); for (let x = 2; x < 30; x += 4) r(x, 42, 2, 6, '#e8e8e8');
});

spotSprites.hekinanKumano = hiCanvas((r, h) => {
  const ST = '#b8b4a6', SD = '#8a8678';
  spanRows(h, 16, [[16, 31], [14, 33], [14, 33]], '#6a6a70'); r(16, 19, 16, 8, '#6a4a32'); r(17, 20, 14, 2, '#f4f2ec'); r(21, 22, 6, 5, '#3a2a20'); h(21, 18, 29, '#e8d8a0');
  h(6, 6, 41, ST); h(7, 7, 40, ST); h(8, 8, 39, SD); r(5, 5, 1, 1, ST); r(42, 5, 1, 1, ST); h(12, 10, 37, ST); h(13, 10, 37, SD);
  r(13, 8, 3, 28, ST); r(32, 8, 3, 28, ST); r(15, 8, 1, 28, SD); r(34, 8, 1, 28, SD); r(22, 8, 4, 4, ST);
  for (const x of [1, 38]) { r(x + 1, 22, 6, 4, '#a8a498'); r(x + 2, 20, 3, 2, '#a8a498'); r(x, 26, 9, 2, '#c8c4b8'); r(x, 28, 9, 8, '#9a968a'); for (let y = 29; y < 36; y += 2) h(y, x, x + 8, '#8a8678'); }
  for (const x of [8, 34]) { r(x, 20, 1, 16, '#9a9a9a'); spanRows(h, 18, [[x, x], [x - 1, x + 1]], '#9a9a9a'); }
  r(0, 36, 48, 12, '#bab7a5'); spanRows(h, 36, [[19, 28], [18, 29], [17, 30], [16, 31], [15, 32], [14, 33], [13, 34], [12, 35], [11, 36], [10, 37], [9, 38], [8, 39]], '#ccc9b8');
});

spotSprites.hekinanMugaen = hiCanvas((r, h) => {
  tileRoof(r, h, 14, [[16, 39], [14, 41], [12, 43], [10, 45], [9, 46], [8, 47]], ['#c8c2c8', '#ada6ac', '#5a5458', '#968e94']);
  r(11, 20, 34, 11, '#2a2a24'); for (let x = 12; x < 44; x += 4) { r(x, 21, 3, 7, '#6a7a7c'); r(x, 21, 3, 1, '#9aacae'); } h(30, 11, 44, '#5a4a38');
  pix(r, ['...######...', '.##########.', '############', '############', '############', '.##########.', '...######...'], 0, 6, '#3f7a34'); r(5, 13, 2, 18, '#5a4030'); h(7, 3, 7, '#5a9a44');
  pix(r, ['..####..', '.######.', '########', '########', '.######.'], 38, 10, '#4f8a3a'); r(41, 15, 2, 6, '#5a4030');
  r(0, 31, 48, 17, '#7a9a3d'); for (const [x, y] of [[3, 40], [12, 44], [30, 42], [40, 46], [22, 38]]) r(x, y, 4, 1, '#8aaa4d');
  r(26, 33, 22, 6, '#c8c4b8'); for (const [x, y, w] of [[18, 36, 5], [28, 35, 4], [34, 38, 6], [12, 39, 4]]) { r(x, y, w, 2, '#8a8680'); h(y, x, x + w - 1, '#a8a49e'); }
});

spotSprites.hekinanOninji = hiCanvas((r, h) => {
  h(5, 13, 34, '#6a686c'); tileRoof(r, h, 6, [[12, 35], [11, 36], [10, 37], [9, 38], [8, 39], [7, 40], [5, 42], [3, 44], [2, 45], [1, 46], [1, 46]], ['#b8b6ba', '#9a989c', '#4a484c', '#858388']);
  r(4, 17, 40, 15, '#3a2c26'); for (const x of [4, 12, 20, 27, 35, 43]) r(x, 17, 1, 15, '#5a4636'); h(17, 4, 43, '#5a4636');
  for (const [a, b] of [[5, 11], [36, 42]]) { for (let x = a; x <= b; x += 2) r(x, 19, 1, 9, '#6a5444'); h(23, a, b, '#6a5444'); }
  r(14, 21, 20, 9, '#e8d8b0'); for (const [x, c] of [[14, '#3a6ac0'], [18, '#e8c840'], [22, '#c83a3a'], [26, '#f4f4f4'], [30, '#e88a30']]) r(x, 21, 4, 2, c);
  r(16, 24, 16, 6, '#2a201c'); h(32, 3, 44, '#8a6a50'); r(12, 33, 24, 2, '#c8a87a');
  for (const x of [6, 38]) { r(x + 1, 28, 3, 1, '#a8a49c'); r(x, 29, 5, 2, '#a8a49c'); r(x + 1, 31, 3, 2, '#e8d8a0'); r(x, 33, 5, 1, '#a8a49c'); r(x + 1, 34, 3, 4, '#9a968e'); r(x, 38, 5, 2, '#b8b4ac'); }
  r(0, 40, 48, 8, '#c8c4bc'); spanRows(h, 40, [[19, 28], [18, 29], [17, 30], [16, 31], [15, 32], [14, 33], [13, 34], [12, 35]], '#a8a49c');
});

spotSprites.hekinanStation = hiCanvas((r, h) => {
  r(12, 6, 22, 18, '#6a7078'); h(6, 12, 33, '#8a9098'); r(14, 9, 9, 3, '#e8e8e8'); r(15, 10, 1, 1, '#2f5fae'); for (let x = 17; x < 22; x += 2) r(x, 10, 1, 1, '#333'); r(34, 10, 10, 14, '#c8ccd0');
  tileRoof(r, h, 20, [[3, 46], [2, 47], [1, 47], [0, 47]], ['#7a7b80', '#616266', '#3a3b3e', '#55565a']);
  r(2, 24, 44, 9, '#26252a'); for (let x = 4; x < 45; x += 5) r(x, 25, 3, 6, '#6a7a82'); for (const x of [2, 18, 30, 45]) r(x, 24, 1, 9, '#8a8a8e');
  r(38, 26, 2, 7, '#d23a2e'); r(44, 22, 2, 11, '#3a3a3e'); r(44, 23, 2, 6, '#5a5c60');
  r(0, 33, 48, 2, '#9a9a96'); r(0, 35, 48, 13, '#4a4a4c'); for (let x = 2; x < 46; x += 4) r(x, 39, 3, 6, '#e8e8e8');
});

spotSprites.hekinanChuoStation = hiCanvas((r, h) => {
  r(0, 10, 48, 25, '#ecebe6'); h(10, 0, 47, '#f8f8f6'); h(11, 0, 47, '#c8c8c4');
  for (let x = 1; x < 30; x += 3) { r(x, 13, 2, 5, '#8a9aa4'); r(x, 13, 2, 1, '#ecebe6'); }
  r(18, 18, 30, 2, '#c87a72'); spanRows(h, 14, [[24, 31], [22, 33], [21, 34], [20, 35]], '#c87a72'); spanRows(h, 16, [[25, 30], [24, 31], [23, 32]], '#ecebe6');
  r(26, 14, 8, 2, '#f8f8f8'); r(27, 14, 2, 1, '#2f5fae');
  r(2, 22, 14, 10, '#6a7a84'); for (let x = 2; x < 16; x += 3) r(x, 22, 1, 10, '#c8ccd0');
  r(22, 22, 12, 13, '#3a4650'); r(23, 23, 10, 9, '#5a6a74'); for (const x of [20, 35]) r(x, 20, 2, 15, '#f4f4f2');
  r(37, 22, 10, 10, '#6a7a84'); for (let x = 37; x < 47; x += 3) r(x, 22, 1, 10, '#c8ccd0');
  r(0, 35, 48, 13, '#d8d0c4'); for (let y = 37; y < 48; y += 3) h(y, 0, 47, '#c8c0b4'); spanRows(h, 41, [[0, 5], [5, 11], [11, 17], [17, 23], [23, 29], [29, 35]], '#d8b040');
  for (const x of [4, 12, 20]) r(x, 33, 2, 5, '#3a3a3e');
});

spotSprites.hekinanCityhall = hiCanvas((r, h) => {
  r(28, 4, 14, 32, '#c8c4b8'); spanRows(h, 1, [[33, 41], [30, 42], [28, 42]], '#4a5060'); for (let y = 8; y < 34; y += 4) for (let x = 30; x < 40; x += 3) r(x, y, 2, 2, '#4a5868');
  r(39, 2, 4, 34, '#2e3947'); for (let y = 3; y < 35; y += 2) h(y, 39, 42, '#6a8aa8'); r(40, 0, 1, 2, '#6a6a70');
  r(14, 2, 2, 7, '#8a8a90'); r(13, 1, 4, 1, '#8a8a90');
  for (let k = 0; k < 14; k++) h(8 + k, 15 - Math.round(k * 1.1), 16 + Math.round(k * 1.1), k < 6 ? '#c4c0b6' : '#aeaba1'); for (let k = 2; k < 14; k += 2) h(8 + k, 15 - Math.round(k * 1.1) + 1, 16 + Math.round(k * 1.1) - 1, '#9e9b91');
  h(22, 0, 31, '#7a786e'); r(1, 23, 30, 13, '#d4d0c4'); for (let x = 3; x < 30; x += 5) r(x, 26, 3, 6, '#4a5868'); r(13, 25, 6, 10, '#5a6a7a');
  r(0, 36, 48, 3, '#8a8a86'); r(0, 39, 48, 9, '#5a5a5c'); for (const x of [6, 21]) { r(x, 28, 1, 11, '#5a4030'); r(x - 2, 29, 2, 1, '#5a4030'); r(x + 1, 30, 2, 1, '#5a4030'); r(x - 3, 28, 1, 1, '#5a4030'); r(x + 3, 29, 1, 1, '#5a4030'); }
});

spotSprites.takahamaMinatoStation = hiCanvas((r, h) => {
  const BR = ['#4a4c54', '#2e3036', '#16171a', '#3e4048'];
  tileRoof(r, h, 12, [[14, 44], [13, 45], [12, 46], [12, 46]], BR); tileRoof(r, h, 18, [[1, 13], [0, 14], [0, 14]], BR);
  r(12, 16, 34, 18, '#f0efea'); r(1, 21, 12, 13, '#f0efea'); h(16, 12, 45, '#d8d6d0');
  r(33, 18, 10, 3, '#ffffff'); r(34, 19, 2, 1, '#2f5fae'); for (let x = 37; x < 42; x += 2) r(x, 19, 1, 1, '#333');
  for (const [x, w] of [[4, 6], [19, 7], [30, 13]]) { h(23, x - 1, x + w, '#2e3036'); h(24, x - 1, x + w, '#4a4c54'); }
  r(4, 25, 5, 4, '#3a3a3e'); r(19, 25, 6, 4, '#3a3a3e'); r(30, 25, 5, 9, '#5a6670'); r(36, 25, 6, 4, '#7a8a94');
  r(1, 29, 45, 5, '#2a2a2e'); for (let y = 29; y < 34; y++) for (let x = 1 + ((y - 29) % 2); x < 46; x += 2) r(x, y, 1, 1, '#f0f0f0');
  r(30, 29, 5, 5, '#5a6670'); r(0, 34, 48, 14, '#4a4a4c'); h(34, 0, 47, '#6a6a6c');
});

spotSprites.takahamaKasuga = hiCanvas((r, h) => {
  tileRoof(r, h, 4, [[18, 41], [16, 43], [14, 45], [12, 46], [10, 47], [8, 47], [6, 47], [5, 47]], ['#e2e0e4', '#c8c6ca', '#6a686c', '#a8a6aa']); h(3, 19, 40, '#8a888c');
  r(10, 12, 36, 20, '#4a2a2a'); for (const x of [10, 17, 24, 31, 38, 45]) r(x, 12, 1, 20, '#6a3a34');
  for (const [a, b] of [[11, 16], [32, 37], [39, 44]]) { for (let x = a; x <= b; x += 2) r(x, 14, 1, 12, '#7a4a3e'); for (let y = 14; y < 26; y += 3) h(y, a, b, '#7a4a3e'); }
  r(18, 16, 13, 10, '#2a1a1a'); h(14, 12, 44, '#e8d8a0'); for (const x of [16, 24, 32]) r(x, 15, 1, 3, '#ffffff');
  h(32, 9, 46, '#8a6a50'); spanRows(h, 33, [[18, 31], [17, 32], [16, 33]], i => i % 2 ? '#a8a49c' : '#c8c4bc');
  r(4, 4, 1, 34, '#c83a2a'); r(3, 3, 3, 2, '#c83a2a'); r(1, 26, 7, 8, '#d8d0b8'); r(2, 27, 5, 6, '#f4f0e0');
  r(38, 22, 6, 5, '#b8b4a8'); r(39, 20, 3, 2, '#b8b4a8'); r(37, 27, 8, 2, '#c8c4b8'); r(37, 29, 8, 8, '#a8a498'); h(31, 37, 44, '#8a8678');
  r(0, 37, 48, 11, '#e8e6e0'); h(37, 0, 47, '#d0cec8');
});

spotSprites.takahamaOyama = hiCanvas((r, h) => {
  const BM = '#6a4030', BL = '#8a5a40', BD = '#3e2418';
  for (const [x, y] of [[0, 6], [36, 4], [2, 20], [38, 18]]) { r(x, y, 10, 10, '#2f6a2a'); r(x + 2, y + 1, 5, 3, '#4f8a3a'); }
  pix(r, ['.##....', '####...'], 18, 2, BD); r(17, 4, 12, 9, BM); r(19, 5, 4, 3, BL); r(26, 6, 3, 2, '#2a1810'); r(28, 9, 3, 2, BM);
  spanRows(h, 13, [[15, 31], [14, 32], [13, 33], [13, 33], [13, 33], [13, 33], [13, 33], [13, 33], [13, 33], [14, 32], [14, 32], [14, 32], [14, 32], [15, 31], [15, 31], [15, 31], [15, 31], [15, 31], [14, 32], [14, 32], [13, 33], [13, 33]], i => i % 5 === 1 ? BL : BM);
  for (const y of [18, 24, 30]) h(y, 15, 31, '#5a3424'); r(22, 14, 2, 20, '#5a3424'); r(12, 16, 3, 9, BM); r(32, 16, 3, 9, BM); r(13, 17, 1, 6, BL);
  r(16, 35, 6, 2, BD); r(25, 35, 6, 2, BD);
  spanRows(h, 37, [[9, 38], [7, 40], [6, 41], [6, 41]], i => i ? '#4a4648' : '#6a6668'); r(0, 41, 48, 7, '#7a8a5a'); h(41, 0, 47, '#9aaa6a');
});

spotSprites.takahamaMikawaTakahamaStation = hiCanvas((r, h) => {
  const WH = '#ecebe8', WS = '#c8c6c2', BR = '#8a3a2e', AP = '#9a8e82', AD = '#6f6963';
  r(26, 0, 16, 26, AP); r(38, 0, 4, 26, AD); for (let y = 2; y < 26; y += 3) h(y, 26, 41, AD); for (let y = 3; y < 26; y += 3) for (let x = 28; x < 38; x += 3) r(x, y, 2, 1, '#c8c0b4');
  r(2, 16, 42, 16, WH); h(16, 2, 43, '#f8f8f6'); r(2, 24, 42, 1, WS);
  spanRows(h, 12, [[6, 20], [4, 22], [3, 23]], WH); r(10, 9, 6, 4, BR); spanRows(h, 7, [[11, 14], [10, 15]], '#5a4a48');
  r(14, 18, 10, 4, '#3a3a40'); for (let x = 15; x < 24; x += 2) r(x, 18, 1, 4, '#7a8088'); r(4, 18, 3, 3, '#3a3a40'); for (let x = 27; x < 42; x += 4) r(x, 19, 2, 4, '#3a3a40');
  for (let i = 0; i < 10; i++) r(26 + i * 2, 24 - Math.floor(i / 1.5), 3, 1, WS);
  r(8, 32, 14, 9, BR); r(10, 34, 3, 3, '#5a2a22'); r(16, 34, 3, 3, '#5a2a22'); r(24, 32, 18, 9, WS); r(30, 32, 6, 9, BR);
  r(4, 32, 2, 9, '#e0dedb'); r(42, 32, 2, 9, '#e0dedb'); r(0, 41, 48, 7, '#8a8682'); h(41, 0, 47, '#a8a49e');
});

spotSprites.takahamaYoshihamaStation = hiCanvas((r, h) => {
  const WH = '#ecebe8';
  spanRows(h, 12, [[10, 33], [7, 36], [5, 38], [4, 39]], i => i ? '#9caeb7' : '#b8c8d0');
  r(4, 16, 36, 22, WH); h(16, 4, 39, '#d0d4d8');
  r(12, 18, 20, 3, '#ffffff'); r(13, 19, 2, 1, '#2f5fae'); for (let x = 17; x < 31; x += 2) r(x, 19, 1, 1, '#222'); h(21, 12, 31, '#3f7fbf');
  r(5, 24, 8, 14, '#4a4846'); r(6, 26, 6, 5, '#8a9298');
  for (const [x, c] of [[15, '#d42a2a'], [21, '#f4f4f4'], [27, '#2a4aa8']]) { r(x, 25, 5, 12, c); r(x + 1, 26, 3, 4, '#cfd8e0'); h(30, x + 1, x + 3, '#444'); }
  h(37, 4, 39, '#7a5a40'); r(33, 26, 3, 11, '#a8a8a8');
  r(43, 3, 1, 38, '#7a4a3a'); r(39, 4, 4, 14, '#c8302a'); for (let y = 6; y < 17; y += 3) r(40, y, 2, 2, '#ffffff');
  r(0, 38, 48, 10, '#8a8682'); h(38, 0, 47, '#a09a94'); for (const x of [12, 20]) r(x, 40, 1, 5, '#b8b8b8');
});

spotSprites.takahamaCityhall = hiCanvas((r, h) => {
  r(4, 8, 10, 32, '#e8e8e8'); r(4, 8, 2, 32, '#f8f8f8'); r(5, 4, 3, 3, '#f4f4f4'); r(9, 3, 4, 4, '#f4f4f4'); r(9, 3, 1, 1, '#cccccc');
  r(14, 10, 32, 26, '#d4d4d8'); for (let y = 10; y < 36; y += 4) for (let x = 14 + ((y / 4) % 2) * 4; x < 46; x += 8) r(x, y, 4, 4, '#a4a4a8');
  for (const y of [15, 24]) for (let x = 16; x < 45; x += 3) r(x, y, 2, 4, '#2a3440');
  h(10, 14, 45, '#e8e8ec');
  tileRoof(r, h, 31, [[16, 46], [14, 47], [13, 47]], ['#8a8a90', '#6a6a70', '#444448', '#5a5a60']); r(16, 34, 30, 6, '#4a4a50'); r(24, 35, 10, 5, '#2a3440');
  r(22, 37, 8, 4, '#d8d8d8'); for (let x = 23; x < 30; x += 2) r(x, 37, 1, 4, '#b0b0b0');
  r(0, 40, 48, 8, '#6f6e6d'); h(40, 0, 47, '#8a8a88'); r(30, 43, 8, 1, '#c8a040');
});

spotSprites.kotaHonkoji = hiCanvas((r, h) => {
  r(23, 2, 2, 3, '#5a5a5e'); r(22, 5, 4, 1, '#7a7a7e');
  tileRoof(r, h, 6, [[19, 28], [17, 30], [15, 32], [13, 34], [11, 36], [9, 38], [7, 40], [5, 42], [4, 43]], ['#b8b8bc', '#9f9fa4', '#5a5a60', '#8a8a90']);
  h(15, 6, 41, '#d8d4c8'); r(9, 16, 30, 18, '#7a3a2a'); r(9, 16, 30, 2, '#5a2a20');
  for (const x of [9, 18, 29, 38]) r(x, 16, 1, 18, '#5a2a20'); r(19, 20, 10, 14, '#6a3020'); r(23, 20, 2, 14, '#4a2018');
  for (const x0 of [11, 31]) { r(x0, 20, 6, 8, '#6a3020'); for (let x = x0; x < x0 + 6; x += 2) r(x, 20, 1, 8, '#8a4a38'); }
  h(34, 6, 41, '#8a7a68'); h(35, 6, 41, '#6a5a48'); for (const x of [8, 39]) r(x, 36, 2, 4, '#6a5a48');
  r(0, 40, 48, 8, '#a8a090'); h(40, 0, 47, '#c0b8a8'); pix(r, ['.####.', '######', '######'], 40, 36, '#3f7a34');
});

spotSprites.kotaKyodoShiryokan = hiCanvas((r, h) => {
  spanRows(h, 14, [[6, 41], [4, 43], [3, 44], [2, 45]], i => i < 2 ? '#c06a58' : '#a85648'); for (let x = 4; x < 45; x += 2) r(x, 15, 1, 3, '#d8806c'); h(18, 2, 45, '#7a3a30');
  r(4, 19, 40, 13, '#ecebe6'); for (const x of [6, 13, 27, 35]) { r(x, 21, 6, 6, '#6f8fa8'); r(x, 21, 6, 1, '#9fb8cc'); r(x + 3, 21, 1, 6, '#ecebe6'); } r(20, 22, 5, 10, '#4a4440');
  r(0, 32, 48, 8, '#4a7a2a'); h(32, 0, 47, '#6a9a3a'); for (let x = 2; x < 48; x += 5) r(x, 33, 2, 1, '#8aba4a');
  r(37, 6, 4, 30, '#f8f8f8'); for (let y = 8; y < 34; y += 3) r(38, y, 2, 2, '#222');
  r(0, 40, 48, 8, '#6a6a68'); h(40, 0, 47, '#8a8a88');
});

spotSprites.kotaBunkaHiroba = hiCanvas((r, h) => {
  spanRows(h, 0, [[10, 37], [6, 41], [3, 44], [2, 45], [1, 46], [1, 46], [1, 46], [2, 45]], i => i % 3 === 1 ? '#f4c8d8' : '#e8a8c0');
  for (let x = 2; x < 46; x += 3) r(x, 8, 2, 5 + (x % 7), (x % 2) ? '#e8a8c0' : '#f0b8cc');
  r(22, 6, 3, 10, '#6a4a3a');
  spanRows(h, 15, [[5, 42], [4, 43], [3, 44], [3, 44], [3, 44], [3, 44], [3, 44], [3, 44], [3, 44], [3, 44], [3, 44], [3, 44], [4, 43], [4, 43], [5, 42]], i => i < 2 ? '#b8a090' : i > 11 ? '#8a6a5a' : '#a08878');
  for (let i = 0; i < 6; i++) { const x = 7 + i * 6; r(x, 19, 4, 1, '#4a3a30'); r(x + 1, 20, 1, 3, '#4a3a30'); r(x, 22, 4, 1, '#4a3a30'); r(x + 3, 20, 1, 2, '#5a4a40'); }
  h(25, 14, 18, '#5a4a40'); h(25, 26, 32, '#5a4a40');
  r(0, 30, 48, 18, '#3f7a34'); for (const [x, y] of [[2, 31], [9, 33], [16, 31], [23, 34], [30, 32], [37, 31], [43, 34], [5, 38], [20, 39], [35, 38], [12, 43], [28, 42], [41, 42]]) { r(x, y, 3, 2, '#d0306a'); r(x + 1, y, 1, 1, '#f070a0'); }
});

spotSprites.kotaMichinoeki = hiCanvas((r, h) => {
  r(0, 4, 48, 14, '#3f6a34'); for (let x = 0; x < 48; x += 6) { r(x, 2 + (x % 4), 6, 4, '#3f6a34'); r(x + 1, 4, 3, 2, '#5a8a44'); }
  tileRoof(r, h, 16, [[4, 43], [2, 45], [1, 46], [0, 47], [0, 47]], ['#7a7980', '#5e5d64', '#3a393e', '#4e4d54']);
  for (const cx of [14, 34]) for (let k = 0; k < 6; k++) { h(12 + k, cx - k - 1, cx + k + 1, '#5e5d64'); if (k > 1) h(12 + k, cx - k + 1, cx + k - 1, '#a8c0d0'); }
  r(1, 21, 46, 13, '#8a7a62'); for (let x = 3; x < 46; x += 6) r(x, 23, 4, 9, '#4a5560'); for (let x = 2; x < 47; x += 6) r(x, 21, 1, 13, '#5a4a3a');
  r(18, 22, 10, 2, '#c87a30'); r(20, 22, 6, 1, '#f0e0c0');
  r(0, 34, 48, 14, '#8a8a88'); for (let x = 4; x < 48; x += 8) r(x, 36, 1, 8, '#f4f4f4'); for (const x of [6, 26, 38]) r(x, 35, 1, 2, '#e05a20');
});

spotSprites.kotaHishiike = hiCanvas((r, h) => {
  spanRows(h, 6, [[16, 41], [15, 42], [14, 43]], i => i ? '#a84838' : '#c05a48');
  r(17, 9, 24, 13, '#e0d8c8'); r(17, 9, 24, 2, '#c8c0b0'); r(21, 12, 4, 4, '#6f8fa8'); r(31, 12, 4, 4, '#6f8fa8');
  r(9, 12, 9, 10, '#d8d4cc'); r(9, 12, 9, 1, '#b8b4ac'); r(11, 14, 3, 3, '#6f8fa8'); r(3, 8, 7, 2, '#7a7a7a'); for (const x of [4, 8]) r(x, 10, 1, 4, '#8a8a8a');
  r(0, 22, 48, 3, '#7aa898'); for (let x = 0; x < 48; x += 3) r(x, 20, 1, 3, '#5a8a7a');
  r(4, 25, 13, 12, '#7a4a3a'); for (let y = 26; y < 37; y += 2) h(y, 4, 16, '#8a5a48'); spanRows(h, 30, [[8, 12], [7, 13], [7, 13]], '#2a1e18');
  r(17, 25, 26, 12, '#3a3632'); for (let x = 18; x < 43; x += 3) r(x, 25, 1, 12, '#5a4a3a'); h(25, 17, 42, '#6a625a');
  r(40, 16, 3, 9, '#3a7ab8'); r(42, 14, 5, 3, '#3a7ab8');
  r(0, 37, 48, 11, '#4a5a50'); for (const [x, y] of [[4, 40], [18, 43], [30, 40], [40, 44]]) r(x, y, 5, 1, '#6a7a70');
  spanRows(h, 36, [[0, 4], [0, 3], [0, 2], [0, 1]], '#8a9a5a');
});

spotSprites.kotaHappinessHill = hiCanvas((r, h) => {
  spanRows(h, 10, [[18, 30], [14, 34], [11, 37], [9, 39], [8, 40]], i => i < 2 ? '#c8d0dc' : '#a8b4c4'); r(22, 7, 4, 3, '#a8b4c4'); h(15, 8, 40, '#7a8494');
  r(9, 16, 31, 18, '#d8b4a4'); r(9, 16, 31, 2, '#c8a090'); for (const x of [10, 37]) r(x, 16, 2, 18, '#e8c8b8');
  r(16, 19, 18, 4, '#5e666c'); for (let x = 17; x < 34; x += 3) r(x, 19, 1, 4, '#9aa4ac'); r(14, 26, 22, 3, '#5e666c'); for (let x = 15; x < 36; x += 3) r(x, 26, 1, 3, '#9aa4ac');
  r(0, 22, 10, 12, '#e8c8b8'); r(0, 22, 10, 1, '#c8a090'); r(2, 25, 6, 3, '#5e666c');
  r(40, 20, 8, 14, '#e8c8b8'); r(42, 23, 4, 3, '#5e666c');
  for (let x = 0; x < 48; x += 7) { r(x, 30, 6, 5, '#4a7a34'); r(x + 1, 30, 3, 1, '#6a9a44'); r(x + 2, 35, 1, 3, '#6a4a3a'); }
  r(0, 38, 48, 10, '#7aa848'); h(38, 0, 47, '#9ac860');
});

spotSprites.kotaTownhall = hiCanvas((r, h) => {
  const BS = '#b8683f', BM = '#a0583a', BD = '#7b533a';
  r(12, 7, 30, 31, BM); r(12, 7, 22, 31, BS); r(34, 7, 8, 31, BD); h(7, 12, 41, '#c8784a');
  for (const y of [11, 16, 21, 26]) { r(14, y, 19, 2, '#3a3236'); r(35, y, 6, 2, '#2a2428'); }
  r(30, 4, 3, 3, '#e8e8e8'); r(31, 3, 1, 1, '#cccccc');
  r(14, 31, 14, 7, '#3a3236'); r(16, 30, 10, 1, '#c8784a'); r(17, 32, 8, 6, '#5a6470');
  for (const x of [4, 7, 10]) { r(x, 18, 1, 22, '#c8c8c8'); r(x + 1, 18, 2, 2, x === 7 ? '#d23a2e' : '#3a8a3a'); }
  r(0, 38, 48, 4, '#3f7a34'); h(38, 0, 47, '#5a9a44'); r(0, 42, 48, 6, '#6a6a68'); for (let x = 4; x < 48; x += 6) r(x, 44, 3, 1, '#f4f4f4');
});

spotSprites.kotaStation = hiCanvas((r, h) => {
  r(0, 14, 14, 24, '#ecebe6'); for (let y = 18; y < 34; y += 4) r(1, y, 12, 2, '#a8b8c0');
  r(14, 16, 32, 3, '#f4f2ec'); h(18, 14, 45, '#c8c4bc'); r(15, 19, 30, 19, '#e8e6e0');
  r(17, 21, 14, 17, '#4a5560'); for (let x = 17; x < 31; x += 4) r(x, 21, 1, 17, '#dcdcd8'); r(19, 23, 2, 6, '#8fa8b8');
  r(33, 21, 8, 3, '#d87a30'); r(34, 22, 6, 1, '#f8f0e0'); r(33, 25, 10, 12, '#f4f4f4'); for (let x = 34; x < 43; x += 3) r(x, 26, 2, 5, '#8ab0d0');
  r(12, 31, 3, 6, '#d23a2e'); h(31, 12, 14, '#e8584a');
  for (const [x, y] of [[4, 2], [9, 5]]) { r(x + 2, y + 4, 1, 32 - y, '#7a6a50'); pix(r, ['#..#..#', '.#.#.#.', '..###..', '.#.#.#.', '#..#..#'], x, y, '#3f7a34'); }
  r(0, 38, 48, 10, '#8a8a88'); h(38, 0, 47, '#a8a8a4');
});

spotSprites.kotaSanganeStation = hiCanvas((r, h) => {
  spanRows(h, 10, [[10, 37], [9, 38], [8, 39]], i => i ? '#8a4a40' : '#a85a50');
  r(9, 13, 30, 9, '#ece4d4'); for (let x = 12; x < 37; x += 4) r(x, 15, 3, 3, '#6f8fa8'); r(9, 21, 30, 1, '#c8c0b0');
  r(9, 22, 30, 16, '#6a625a'); for (const x of [9, 19, 28, 37]) r(x, 22, 2, 16, '#d8d0c0');
  spanRows(h, 22, [[0, 9], [0, 8], [0, 7], [0, 6], [0, 5], [0, 4], [0, 3], [0, 2]], '#f4f4f2'); spanRows(h, 22, [[39, 47], [40, 47], [41, 47], [42, 47], [43, 47], [44, 47], [45, 47], [46, 47]], '#f4f4f2');
  for (let i = 0; i < 16; i++) { r(Math.max(0, 9 - Math.floor(i / 2)), 22 + i, 1, 1, '#a8a8a8'); r(Math.min(47, 38 + Math.floor(i / 2)), 22 + i, 1, 1, '#a8a8a8'); }
  r(13, 30, 20, 8, '#e8e0d0'); r(16, 32, 5, 6, '#4a4a50'); r(24, 32, 6, 3, '#6f8fa8');
  r(0, 38, 48, 10, '#8a8682'); h(38, 0, 47, '#a8a49e'); r(42, 30, 6, 8, '#a83a2a'); h(30, 42, 47, '#f4f4f4');
});

spotSprites.kotaAimiStation = hiCanvas((r, h) => {
  r(24, 12, 22, 24, '#e8ecf0'); h(12, 24, 45, '#f8f8fa'); for (let x = 26; x < 45; x += 4) r(x, 16, 2, 2, '#a8b4c4');
  r(4, 10, 22, 26, '#8aa8c8'); h(10, 4, 25, '#e8ecf0'); for (let x = 5; x < 26; x += 2) r(x, 11, 1, 25, '#b8cce0'); for (let i = 0; i < 10; i++) r(5 + i, 12 + i, 2, 1, '#dce8f4');
  r(18, 14, 8, 6, '#ffffff'); r(19, 15, 2, 2, '#d23a2e'); r(22, 16, 3, 1, '#333');
  r(26, 18, 6, 18, '#6aa0c0'); r(26, 18, 6, 1, '#f8f8fa');
  for (let x = 2; x < 46; x += 4) r(x, 28, 2, 10, '#3a3a40');
  r(0, 38, 48, 10, '#d8d0c0'); h(38, 0, 47, '#e8e0d0'); r(0, 44, 48, 4, '#6a6a68');
});

spotSprites.gamagoriTakeshima = hiCanvas((r, h) => {
  for (const [x, y, w] of [[0, 0, 14], [34, 0, 14], [0, 10, 10], [38, 12, 10]]) { r(x, y, w, 12, '#2f5a28'); r(x + 2, y + 2, w - 5, 3, '#4a7a38'); } r(6, 18, 3, 22, '#4a3a2a'); r(40, 20, 3, 20, '#4a3a2a');
  spanRows(h, 12, [[14, 33], [12, 35], [11, 36], [10, 37]], i => i ? '#6f8a76' : '#8aa890'); spanRows(h, 9, [[20, 27], [18, 29], [17, 30]], '#6f8a76'); h(16, 10, 37, '#3a4a3a');
  r(12, 17, 24, 13, '#4a3a2a'); r(19, 19, 10, 11, '#2a2018'); r(20, 19, 8, 1, '#c8a050'); for (const x of [12, 18, 29, 35]) r(x, 17, 1, 13, '#6a5038');
  r(15, 4, 3, 26, '#f4f4f4'); r(30, 6, 3, 24, '#f4f4f4'); for (let y = 6; y < 28; y += 3) { r(16, y, 1, 2, '#222'); r(31, y + 1, 1, 2, '#222'); }
  r(37, 26, 4, 2, '#9a968c'); r(38, 28, 2, 2, '#ffe27a'); r(38, 30, 2, 6, '#9a968c'); r(36, 36, 6, 2, '#9a968c');
  r(0, 30, 48, 18, '#b0a48d'); spanRows(h, 30, [[20, 27], [19, 28], [19, 28], [18, 29], [18, 29], [17, 30], [17, 30], [16, 31], [16, 31], [15, 32], [15, 32], [14, 33], [14, 33], [13, 34], [13, 34], [12, 35], [12, 35], [11, 36]], i => i % 3 ? '#cfc6b4' : '#a89c88');
});

spotSprites.gamagoriAquarium = hiCanvas((r, h) => {
  r(2, 10, 12, 8, '#d8d4cc'); r(28, 8, 10, 6, '#d8d4cc');
  for (let i = 0; i < 5; i++) { r(10 + i * 5, 11, 4, 4, '#2a3a6a'); r(11 + i * 5, 12, 2, 2, '#ffffff'); } r(40, 10, 6, 3, '#2a3a6a');
  r(0, 16, 48, 9, '#1c2b4d'); for (const [x, y] of [[3, 18], [9, 20], [15, 18], [21, 20], [27, 18], [33, 20], [39, 18], [44, 20]]) { r(x, y, 3, 3, '#e8f0f8'); r(x + 1, y + 1, 1, 1, '#6a8ab8'); }
  h(16, 0, 47, '#3a4a7a'); r(0, 25, 48, 12, '#e8e8e8'); h(25, 0, 47, '#c8c8c8');
  r(10, 27, 22, 9, '#b8bcc4'); for (let x = 11; x < 32; x += 2) r(x, 27, 1, 9, '#ececec'); r(34, 28, 8, 8, '#3a4a5a');
  pix(r, ['..####..', '.######.', '########', '.######.', '..####..'], 36, 24, '#3f8a3a'); r(39, 29, 2, 8, '#6a4a3a'); pix(r, ['.####.', '######', '.####.'], 1, 28, '#3f8a3a'); r(3, 31, 1, 6, '#6a4a3a');
  r(0, 37, 48, 11, '#8a8682'); h(37, 0, 47, '#a8a49e');
});

spotSprites.gamagoriStation = hiCanvas((r, h) => {
  spanRows(h, 4, [[0, 10], [0, 18], [0, 26], [0, 34], [0, 47], [0, 47]], i => i % 2 ? '#4f7a4a' : '#3f6a3a');
  r(0, 10, 48, 4, '#c8c4c0'); for (let x = 2; x < 48; x += 8) r(x, 8, 6, 2, '#f4f4f4');
  r(0, 14, 48, 6, '#7a7880'); for (let x = 1; x < 48; x += 3) r(x, 15, 2, 3, '#a8b0bc'); h(20, 0, 47, '#5a5860');
  for (let x = 3; x < 48; x += 8) r(x, 21, 2, 4, '#9a9aa0');
  spanRows(h, 25, [[0, 47], [0, 47]], '#8a8682'); r(0, 27, 48, 21, '#9a948c');
  spanRows(h, 31, [[14, 33], [11, 36], [10, 37], [10, 37], [11, 36], [14, 33]], '#6aa04a'); h(31, 14, 33, '#e8e8e8'); h(36, 14, 33, '#e8e8e8');
  r(23, 8, 1, 26, '#e8e8e8'); spanRows(h, 26, [[20, 23], [18, 23], [16, 23], [14, 30]], '#f8f8f8'); r(18, 32, 12, 2, '#f8f8f8');
  for (const [x, y] of [[2, 36], [40, 34], [6, 42], [36, 42]]) { r(x, y, 5, 4, '#3f7a34'); r(x + 2, y + 4, 1, 2, '#6a4a3a'); }
});



spotSprites.osmN282405440 = hiCanvas((r, h) => {
  r(2, 10, 18, 26, '#e8e4dc'); for (let y = 14; y < 34; y += 5) r(5, y, 4, 3, '#6f8fa8'); h(10, 2, 19, '#c8c4bc');
  r(14, 16, 32, 3, '#5a5a58'); h(16, 14, 45, '#7a7a78'); r(26, 13, 14, 3, '#f4f4f4'); h(14, 28, 37, '#3a6ac0');
  r(16, 19, 28, 17, '#d8d6d0'); r(18, 21, 12, 15, '#4a5a66'); for (const x of [21, 25]) r(x, 21, 1, 15, '#c8ccd0'); r(33, 22, 9, 8, '#6f8fa8');
  r(9, 26, 4, 10, '#2a5fb0'); r(10, 27, 2, 3, '#d8e4f4'); r(4, 32, 3, 4, '#3a6ac0');
  pix(r, ['.####...', '########'], 0, 34, '#3f7a34'); r(0, 36, 48, 12, '#7a7a78'); for (let x = 2; x < 48; x += 8) r(x, 41, 5, 1, '#f4f4f4');
});

spotSprites.osmN282405435 = hiCanvas((r, h) => {
  r(4, 4, 2, 30, '#8a8a88'); h(6, 0, 47, '#5a5a58'); r(40, 2, 2, 32, '#8a8a88');
  r(12, 14, 30, 3, '#6a6a68'); h(13, 13, 42, '#8a8a88'); r(14, 17, 1, 11, '#5a5a58'); r(39, 17, 1, 11, '#5a5a58'); r(16, 19, 22, 9, '#c8b8a0'); r(18, 20, 8, 5, '#6f8fa8');
  r(8, 28, 40, 6, '#b8b4ac'); h(28, 8, 47, '#d8b860'); r(8, 34, 40, 2, '#8a867e');
  r(0, 37, 48, 11, '#7a6450'); for (const y of [39, 44]) h(y, 0, 47, '#a8a8a8'); for (let x = 1; x < 48; x += 3) r(x, 40, 2, 4, '#5a4a3a');
});

spotSprites.osmN1423997078 = hiCanvas((r, h) => {
  r(2, 14, 18, 24, '#9aa0a6'); r(2, 14, 18, 3, '#b8bec4'); r(20, 6, 26, 32, '#808894'); r(20, 6, 26, 3, '#a8b0b8'); r(20, 9, 4, 29, '#9aa2aa');
  for (let x = 26; x < 46; x += 6) r(x, 9, 1, 29, '#6e7680'); for (let y = 16; y < 38; y += 8) h(y, 20, 45, '#6e7680');
  r(6, 22, 8, 4, '#3a4048'); r(26, 30, 12, 8, '#2e343c'); r(0, 38, 48, 3, '#a8a49c'); for (let y = 39; y < 43; y++) h(y, 10 + (y - 39) * 2, 22 + (y - 39) * 2, '#c8c4bc'); r(0, 43, 48, 5, '#c0bcb2');
});

spotSprites.osmN1423992783 = hiCanvas((r, h) => {
  spanRows(h, 8, [[6, 41], [3, 44], [2, 45]], '#3a3a3a'); r(2, 11, 44, 14, '#7a6a5a'); for (let x = 3; x < 46; x += 2) r(x, 11, 1, 14, '#5a4c40'); for (const y of [15, 20]) h(y, 2, 45, '#8a7a68');
  r(4, 25, 40, 3, '#a8a49c'); for (const x of [6, 18, 30, 42]) r(x, 28, 2, 10, '#8a8a88');
  r(10, 29, 18, 9, '#4a5a66'); for (const x of [14, 19, 24]) r(x, 29, 1, 9, '#c8ccd0'); for (let i = 0; i < 8; i++) r(32 + i, 37 - i, 3, 1, '#d8d8d4');
  r(0, 38, 48, 3, '#b8b4ac'); r(0, 41, 48, 7, '#6a6a6a'); for (let x = 3; x < 48; x += 9) r(x, 44, 5, 1, '#e8e8e8');
});

spotSprites.osmN1423990918 = hiCanvas((r, h) => {
  spanRows(h, 9, [[14, 39], [12, 41], [10, 43], [8, 45], [6, 46]], i => i < 2 ? '#7a7690' : '#5a5670'); h(14, 6, 46, '#3e3a50');
  r(8, 15, 37, 20, '#f2f0ea'); for (let y = 16; y < 35; y += 2) h(y, 8, 44, '#d8d6ce'); for (const x of [26, 31, 36, 41]) { r(x, 18, 3, 10, '#3e4a58'); r(x, 18, 3, 1, '#ffffff'); }
  spanRows(h, 16, [[11, 18], [9, 20], [8, 21]], '#5a5670'); r(9, 19, 11, 16, '#f2f0ea'); r(12, 23, 5, 12, '#7a4a30'); r(10, 19, 1, 16, '#c8c6be'); r(19, 19, 1, 16, '#c8c6be');
  r(4, 35, 44, 3, '#b8b0a0'); for (let y = 36; y < 40; y++) h(y, 9 - (y - 36), 20 + (y - 36), '#c8c4bc'); pix(r, ['.#####......', '############'], 30, 33, '#3f7a34'); r(0, 40, 48, 8, '#7fae5a');
});

spotSprites.osmN1423979758 = hiCanvas((r, h) => {
  r(0, 8, 12, 32, '#5a4c46'); for (let y = 10; y < 38; y += 3) r(2, y, 8, 1, '#3a3e48'); r(10, 4, 4, 36, '#6d6f74');
  r(14, 6, 26, 34, '#4a5a6a'); for (let y = 8; y < 38; y += 4) h(y, 14, 39, '#8a9aa8');
  for (let i = 0; i < 12; i++) { r(15 + i, 7 + i * 2, 2, 2, '#f4f4f4'); r(37 - i, 7 + i * 2, 2, 2, '#f4f4f4'); } for (const x of [14, 26, 38]) r(x, 6, 2, 34, '#e8e8e8');
  r(40, 22, 8, 18, '#5a6a7a'); for (let x = 40; x < 48; x += 2) r(x, 24, 1, 2, '#e8e8e8'); r(43, 4, 1, 18, '#c8c8c8'); r(44, 5, 3, 2, '#d23a2e');
  r(0, 40, 48, 3, '#c8c4bc'); h(43, 0, 47, '#e05a8a'); h(44, 0, 47, '#3f7a34'); r(0, 45, 48, 3, '#a8a49c');
});

spotSprites.osmN1423994228 = hiCanvas((r, h) => {
  r(8, 12, 34, 24, '#7c9faf'); spanRows(h, 10, [[14, 36], [10, 40]], '#a8c4d0'); for (let y = 14; y < 32; y += 3) h(y, 8, 41, '#9ab8c8'); for (let x = 11; x < 42; x += 5) r(x, 12, 1, 20, '#5a7a8a');
  r(8, 32, 34, 4, '#d8d6d0'); r(18, 33, 12, 3, '#3f4a52');
  r(0, 6, 10, 26, '#3f8a34'); r(2, 8, 5, 6, '#6fba50'); r(4, 32, 2, 6, '#5a4030'); r(40, 14, 8, 20, '#3f8a34'); r(42, 16, 4, 5, '#6fba50'); r(43, 34, 2, 4, '#5a4030');
  r(0, 36, 48, 12, '#6fae4a'); spanRows(h, 40, [[14, 34], [12, 36]], '#c08a70'); r(16, 37, 10, 1, '#8a6a4a');
});

spotSprites.osmN1423997068 = hiCanvas((r, h) => {
  r(4, 10, 40, 30, '#d8d4cc'); spanRows(h, 6, [[10, 37], [6, 41], [4, 43]], '#f4f4f4'); for (let x = 6; x < 44; x += 4) r(x, 8, 1, 2, '#a8b0b8');
  r(10, 12, 28, 4, '#2a5fb0'); for (let x = 12; x < 36; x += 3) r(x, 13, 2, 2, '#ffffff');
  for (const [x, y] of [[6, 18], [14, 20], [26, 18], [36, 21], [9, 28], [31, 29]]) { pix(r, ['.###.', '#####', '#####', '.###.'], x, y, '#f0ece4'); r(x + 1, y + 1, 1, 2, '#c8c0b4'); r(x + 3, y + 1, 1, 2, '#c8c0b4'); }
  r(4, 24, 40, 1, '#3a7ab8'); r(18, 28, 10, 12, '#3f4a52'); r(0, 40, 48, 8, '#a8a49c'); h(40, 0, 47, '#4a8ac8');
});

spotSprites.osmN1423979695 = hiCanvas((r, h) => {
  const BR = '#b0503a', ST = '#e8e4dc';
  r(6, 8, 36, 32, BR); for (let y = 10; y < 40; y += 3) h(y, 6, 41, '#984232'); r(6, 6, 36, 3, ST); for (const x of [6, 16, 32, 40]) r(x, 6, 2, 34, ST);
  spanRows(h, 2, [[18, 29], [16, 31]], ST); r(20, 1, 8, 1, '#a8a49c');
  for (const x of [10, 24, 35]) for (const y of [12, 26]) { r(x, y, 3, 8, '#3e4a58'); h(y - 1, x - 1, x + 3, ST); h(y + 8, x - 1, x + 3, ST); }
  r(20, 12, 8, 14, '#f0ece4'); r(21, 30, 6, 10, '#4a3a2a'); h(29, 20, 27, ST); r(0, 40, 48, 3, '#c8c4bc'); pix(r, ['.######.', '########'], 0, 38, '#3f7a34'); r(0, 43, 48, 5, '#a8a49c');
});

spotSprites.osmN1424004882 = hiCanvas((r, h) => {
  r(4, 18, 20, 20, '#7a4a40'); r(18, 8, 28, 30, '#8a5a4c'); h(8, 18, 45, '#a06a5a'); h(18, 4, 23, '#9a6a5a');
  for (let y = 11; y < 38; y += 3) h(y, 18, 45, '#7a4a40'); for (let x = 20; x < 46; x += 4) r(x, 8, 1, 30, '#7a4a40');
  r(4, 26, 20, 2, '#5a3a32'); r(28, 30, 12, 8, '#3a3e48'); r(8, 30, 10, 8, '#4a5058');
  r(0, 38, 48, 3, '#b8b4ac'); pix(r, ['..####...####.', '##############'], 4, 36, '#4f8a3a'); r(0, 41, 48, 7, '#9a9894'); for (let y = 42; y < 47; y++) h(y, 30 - (y - 42) * 2, 34 + (y - 42), '#b8b4ac');
});

spotSprites.osmN3999572949 = hiCanvas((r, h) => {
  r(24, 6, 20, 14, '#f0f0ec'); h(6, 24, 43, '#3a7ab8'); r(26, 9, 16, 4, '#6f8fa8'); r(30, 3, 10, 3, '#ffffff'); h(4, 31, 38, '#3a6ac0');
  for (let i = 0; i < 18; i++) { r(6 + i, 30 - i, 3, 1, '#e8e8e4'); r(6 + i, 29 - i, 1, 1, '#3a7ab8'); } for (let i = 0; i < 18; i += 3) r(7 + i, 31 - i, 1, 3, '#a8a8a4');
  r(24, 20, 20, 3, '#c8c8c4'); for (const x of [26, 41]) r(x, 23, 2, 14, '#d8d8d4'); r(2, 30, 18, 7, '#e8e4dc'); r(4, 32, 5, 3, '#6f8fa8');
  r(0, 37, 48, 4, '#a2a29f'); r(0, 41, 48, 7, '#5a4d40'); for (const y of [42, 45]) h(y, 0, 47, '#9a9a9a');
});

spotSprites.osmN2573765930 = hiCanvas((r, h) => {
  r(2, 8, 44, 6, '#d8d0c0'); r(28, 4, 14, 5, '#ffffff'); h(6, 30, 39, '#3a6ac0'); r(2, 14, 44, 3, '#c8c0b0');
  r(2, 17, 44, 16, '#e8e0d0'); r(2, 21, 44, 4, '#2a5a9a'); for (let x = 4; x < 46; x += 6) r(x, 21, 1, 4, '#d8d0c0'); for (const x of [8, 20, 32]) r(x, 17, 2, 16, '#c8c0b0');
  r(14, 26, 18, 7, '#4a5a66'); for (const x of [18, 23, 28]) r(x, 26, 1, 7, '#c8ccd0');
  pix(r, ['..#####.....######..', '####################', '####################'], 6, 32, '#3f7a34'); for (const [x, y] of [[9, 33], [14, 32], [28, 33], [33, 32], [37, 33]]) r(x, y, 3, 2, '#e05a8a');
  r(0, 35, 48, 13, '#8a8a88'); h(35, 0, 47, '#a8a49c');
});

spotSprites.osmN2128311596 = hiCanvas((r, h) => {
  for (let y = 10; y < 30; y++) { const k = y - 10; h(y, Math.max(0, 22 - k * 2), Math.min(47, 26 + k * 2), y < 16 ? '#5a5e5a' : '#494b4f'); }
  for (let y = 18; y < 30; y++) h(y, 0, Math.min(18, (y - 18) * 2), '#5a5e60');
  for (const [x, y] of [[20, 14], [26, 16], [14, 22], [32, 20]]) r(x, y, 2, 1, '#6a6e6a');
  r(0, 28, 48, 4, '#e8e4dc'); for (let x = 1; x < 48; x += 4) r(x, 26, 3, 3, ['#ffffff', '#c8c4bc', '#d8d0c0'][x % 3]);
  r(0, 32, 48, 16, '#3a5a8a'); for (const [x, y] of [[4, 35], [16, 39], [30, 36], [40, 42], [10, 44]]) r(x, y, 4, 1, '#6a8ab0'); r(18, 31, 14, 2, '#a8a49c');
});

spotSprites.osmN3702950015 = hiCanvas((r, h) => {
  spanRows(h, 4, [[12, 35], [10, 37], [8, 39], [6, 41], [5, 42], [3, 44], [2, 45]], i => i < 3 ? '#8a95a8' : '#728199'); h(11, 1, 46, '#4a5468'); r(1, 10, 1, 1, '#4a5468'); r(46, 10, 1, 1, '#4a5468');
  for (let k = 0; k < 4; k++) h(1 + k, 22 - k, 25 + k, k ? '#d8d4c8' : '#728199');
  r(6, 12, 36, 18, '#5a4636'); for (const x of [6, 13, 20, 27, 34, 41]) r(x, 12, 1, 18, '#38322f'); r(16, 16, 16, 14, '#2a2420');
  spanRows(h, 14, [[14, 33], [16, 31]], '#e8d8a8'); for (const x of [18, 23, 28]) r(x, 16, 1, 3, '#ffffff');
  for (const x of [2, 42]) { r(x, 24, 4, 4, '#b8b2a6'); r(x + 1, 22, 2, 2, '#b8b2a6'); r(x, 28, 4, 4, '#8a857a'); }
  r(0, 30, 48, 3, '#a8a49a'); for (let y = 33; y < 48; y++) h(y, 18 - (y - 33), 29 + (y - 33), y % 2 ? '#c8c3b8' : '#b0aa9e');
});

spotSprites.osmN3282065243 = hiCanvas((r, h) => {
  for (let y = 6; y < 32; y++) { const k = y - 6; h(y, Math.max(0, 24 - Math.round(k * 1.6)), Math.min(47, 24 + Math.round(k * 1.6)), y % 4 ? '#5f7f58' : '#6f8f60'); }
  for (const [x, y] of [[20, 12], [28, 16], [14, 22], [34, 24], [24, 26]]) r(x, y, 3, 2, '#4a6a40');
  for (const [x, c] of [[4, '#e8e4dc'], [12, '#7a7a78'], [24, '#f0ece4'], [33, '#5a6068'], [41, '#e8e4dc']]) { r(x, 28, 7, 6, c); h(27, x, x + 6, '#4a4f57'); r(x + 2, 30, 2, 2, '#3e4a58'); }
  r(0, 34, 48, 14, '#6fae4a'); for (let y = 37; y < 48; y += 3) h(y, 0, 47, '#5f9e3a');
});

spotSprites.osmN4582252211 = hiCanvas((r, h) => {
  for (let x = 0; x < 48; x += 6) { r(x, 8, 5, 8, '#3f7a34'); r(x + 1, 6, 3, 2, '#5a9a44'); } r(0, 16, 48, 32, '#7fae5a'); for (let y = 20; y < 48; y += 4) h(y, 0, 47, '#6f9e4a');
  r(6, 22, 36, 14, '#c8bfa8'); h(22, 6, 41, '#d8d0b8'); for (let y = 24; y < 35; y += 4) for (let x = 9; x < 40; x += 5) { r(x, y, 3, 2, '#a8a090'); r(x, y, 3, 1, '#d8d4c8'); }
  r(38, 38, 3, 8, '#8a7a5a'); r(36, 36, 7, 3, '#f0ece4'); for (let x = 4; x < 46; x += 4) r(x, 44, 2, 1, '#5f8e3a');
});

spotSprites.osmN4582212644 = hiCanvas((r, h) => {
  for (let y = 6; y < 20; y++) { const k = y - 6; h(y, Math.max(0, 14 - k), Math.min(47, 33 + k), y < 10 ? '#a88a80' : '#957a7b'); }
  h(20, 0, 47, '#5a3e36'); r(0, 18, 2, 2, '#5a3e36'); r(46, 18, 2, 2, '#5a3e36'); r(18, 4, 12, 2, '#6a4e46'); for (let x = 2; x < 46; x += 2) r(x, 21, 1, 1, '#8a6a5a');
  r(8, 22, 32, 14, '#5a4038'); for (const x of [8, 15, 32, 39]) r(x, 22, 1, 14, '#7a6460');
  for (const x of [10, 34]) { r(x, 25, 4, 6, '#d8d4cc'); r(x + 1, 24, 2, 1, '#d8d4cc'); } r(17, 24, 14, 5, '#f4f0e8'); r(18, 29, 12, 7, '#2a2420');
  r(6, 36, 36, 3, '#c8c4bc'); h(39, 4, 43, '#a8a49c'); r(18, 40, 12, 3, '#d8d4cc'); r(0, 43, 48, 5, '#b8b2a6');
});

spotSprites.osmN4582212642 = hiCanvas((r, h) => {
  tileRoof(r, h, 8, [[14, 37], [12, 39], [10, 41], [8, 43], [6, 45], [5, 46]], ['#b8bcc4', '#959da5', '#5a6068', '#7a8088']);
  r(8, 14, 36, 12, '#f0ece4'); for (const x of [8, 16, 26, 36, 43]) r(x, 14, 1, 12, '#6a5040'); r(20, 17, 12, 9, '#3a2e26'); h(14, 8, 43, '#8a7a68');
  r(0, 12, 6, 14, '#e8e4dc'); tileRoof(r, h, 10, [[0, 6], [0, 7]], ['#b8bcc4', '#959da5', '#5a6068', '#7a8088']);
  for (const [x, y] of [[2, 22], [8, 18], [4, 26]]) { pix(r, PINE, x, y, '#2f6a3a'); h(y, x + 2, x + 4, '#4f8a4a'); } r(7, 29, 1, 8, '#6a4a30');
  r(0, 26, 48, 22, '#a8a49c'); for (let y = 30; y < 48; y += 3) h(y, 0, 47, '#9a968e'); for (let y = 30; y < 48; y++) h(y, 24 - (y - 30), 30 - (y - 30) * 0.3 | 0, '#8a8680');
});

spotSprites.osmN4582212599 = hiCanvas((r, h) => {
  tileRoof(r, h, 6, [[12, 35], [10, 37], [8, 39], [6, 41], [4, 43], [3, 44], [2, 45], [1, 46]], ['#a8b0b8', '#8a929a', '#4a5058', '#6e767e']);
  r(4, 14, 40, 14, '#f0ece4'); for (let x = 4; x < 44; x += 5) r(x, 14, 1, 14, '#5a4636'); h(14, 4, 43, '#7a6a58');
  for (const x0 of [6, 31]) { r(x0, 17, 10, 8, '#3a2e26'); for (let x = x0 + 1; x < x0 + 10; x += 2) r(x, 17, 1, 8, '#6a5a48'); } r(18, 17, 12, 11, '#2a2420');
  r(2, 28, 44, 3, '#b8b4ac'); r(0, 31, 48, 17, '#7fae5a'); for (let y = 31; y < 48; y++) h(y, 21 - Math.round((y - 31) * 0.4), 26 + Math.round((y - 31) * 0.4), '#c8c4bc');
  r(36, 30, 2, 10, '#8a8a88'); r(35, 29, 4, 2, '#5a5a58');
});

spotSprites.osmN4681388235 = hiCanvas((r, h) => {
  const VR = '#c84a2e';
  spanRows(h, 8, [[12, 35], [10, 37], [8, 39], [6, 41], [4, 43]], i => i < 2 ? '#8a8282' : '#6c615f'); h(13, 3, 44, '#3e3434');
  for (let k = 0; k < 4; k++) h(5 + k, 22 - k * 2, 25 + k * 2, '#6c615f'); h(9, 15, 32, '#e8e4dc');
  r(6, 14, 36, 14, VR); for (const x of [6, 13, 20, 27, 34, 41]) r(x, 14, 1, 14, '#8a2a1a'); r(14, 17, 20, 11, '#3e2a26'); h(18, 14, 33, '#e8d8a8'); for (const x of [18, 24, 30]) r(x, 19, 1, 2, '#ffffff');
  h(28, 4, 43, '#a83a22'); r(4, 29, 40, 2, '#8a857a');
  for (const x of [3, 41]) { r(x, 30, 4, 3, '#b8b2a6'); r(x + 1, 28, 2, 2, '#b8b2a6'); r(x - 1, 33, 6, 6, '#8a857a'); }
  r(0, 39, 48, 9, '#a89a70'); for (let y = 31; y < 48; y++) h(y, 21 - Math.round((y - 31) * 0.3), 26 + Math.round((y - 31) * 0.3), '#c8c3b8');
});

spotSprites.osmN4682981430 = hiCanvas((r, h) => {
  tileRoof(r, h, 8, [[12, 35], [10, 37], [8, 39], [6, 41], [4, 43], [2, 45], [1, 46]], ['#b4bcc4', '#959da5', '#4e545c', '#7a828a']);
  for (let k = 0; k < 3; k++) h(5 + k, 22 - k * 2, 25 + k * 2, k ? '#e8e4dc' : '#4e545c');
  r(5, 15, 38, 15, '#e8e0d0'); for (const x of [5, 11, 17, 23, 29, 35, 42]) r(x, 15, 2, 15, '#f4f0e8'); r(13, 18, 22, 12, '#4a3a2e'); for (let x = 14; x < 35; x += 3) r(x, 18, 1, 12, '#6a5a48'); h(15, 5, 42, '#8a7a68');
  h(30, 3, 44, '#a8a49c'); for (let y = 31; y < 38; y++) h(y, 12 - (y - 31), 35 + (y - 31), y % 2 ? '#d8d4cc' : '#b8b4ac');
  for (const [x, y] of [[0, 26], [42, 24]]) { pix(r, PINE, x, y, '#2f6a3a'); h(y, x + 2, x + 4, '#4f8a4a'); } r(0, 38, 48, 10, '#c8b890');
});

spotSprites.osmN4686350152 = hiCanvas((r, h) => {
  tileRoof(r, h, 4, [[14, 33], [12, 35], [10, 37], [8, 39], [7, 40]], ['#a8a8ac', '#8a8a90', '#4a4a50', '#6a6a70']);
  r(10, 9, 28, 14, '#6a5040'); r(12, 11, 24, 6, '#f4f2ec'); for (const x of [16, 23, 30]) { r(x, 12, 3, 3, '#222'); r(x + 1, 11, 1, 1, '#222'); } r(16, 17, 16, 6, '#2a2420');
  r(4, 23, 40, 2, '#a8a49c'); for (const x of [6, 39]) { r(x, 16, 3, 1, '#a8a49c'); r(x - 1, 17, 5, 2, '#a8a49c'); r(x, 19, 3, 5, '#a8a49c'); }
  r(0, 25, 48, 23, '#8a8478'); for (let y = 27; y < 48; y += 3) h(y, 0, 47, '#7a746a');
  r(7, 39, 32, 5, '#5e5a52'); h(39, 7, 38, '#6e6a62');
  spanRows(h, 31, [[14, 30], [11, 33], [9, 35], [8, 36], [8, 36], [9, 35], [10, 34]], i => i < 2 ? '#e8e4dc' : i < 5 ? '#d0ccc4' : '#b0aca4');
  r(30, 27, 8, 6, '#d8d4cc'); h(27, 31, 37, '#ece8e0'); r(36, 26, 2, 2, '#c8c4bc'); r(31, 26, 2, 2, '#c8c4bc'); r(35, 29, 1, 1, '#333'); h(33, 29, 34, '#c03a2e');
});

function mtHutB2(r, h, { x0 = 4, x1 = 43, top = 14, roof = '#5f9e98', band = true, sign = [14, 33], door = [8, 15] } = {}) {
  const WW = '#e8eae8', WS = '#c8ccce';
  h(top, x0 + 5, x1 - 5, '#8cc4be'); h(top + 1, x0 + 2, x1 - 2, roof); h(top + 2, x0, x1, roof); h(top + 3, x0, x1, '#3e706c');
  r(x0 + 1, top + 4, x1 - x0 - 1, 41 - top - 3, WW); r(x1 - 6, top + 4, 5, 41 - top - 3, WS);
  if (band) { r(x0 + 1, 34, x1 - x0 - 1, 8, '#7a5a44'); for (const y of [36, 39]) h(y, x0 + 1, x1 - 1, '#5e4434'); }
  if (sign) { r(sign[0], top + 6, sign[1] - sign[0] + 1, 4, '#ffffff'); r(sign[0] + 1, top + 7, 2, 2, '#2f5fae'); for (let x = sign[0] + 4; x < sign[1] - 1; x += 2) r(x, top + 7, 1, 2, '#222'); h(top + 9, sign[0] + 4, sign[1] - 1, '#d23a2e'); }
  if (door) r(door[0], top + 11, door[1] - door[0] + 1, 41 - top - 10, '#2e3438');
  r(0, 42, 48, 6, '#8a8a88');
}

spotSprites.osmN5307157026 = hiCanvas((r, h) => {
  for (let y = 2; y < 16; y++) { const k = y - 2, a = 17 - k, b = 30 + k; h(y, a, b, y < 6 ? '#5e4a3c' : '#4a3a2e'); for (let x = a + 1 + (y % 2); x < b; x += 3) r(x, y, 1, 1, '#3a2c22'); r(a, y, 1, 1, '#5f8f74'); r(b, y, 1, 1, '#5f8f74'); }
  h(1, 18, 29, '#5f8f74'); h(16, 1, 46, '#5f8f74'); h(17, 2, 45, '#2e241c'); r(1, 15, 1, 1, '#5f8f74'); r(46, 15, 1, 1, '#5f8f74');
  for (let k = 0; k < 5; k++) h(11 + k, 22 - k, 25 + k, k === 4 ? '#5f8f74' : '#5a4636');
  r(6, 18, 36, 12, '#43352a'); for (const x of [6, 13, 20, 27, 34, 41]) r(x, 18, 1, 12, '#6a5440'); r(18, 20, 12, 10, '#20160e'); for (let x = 8; x < 18; x += 2) r(x, 21, 1, 6, '#6a5440');
  h(19, 8, 39, '#efe4c8'); h(20, 9, 38, '#d8c8a0'); for (const x of [14, 23, 32]) r(x, 21, 1, 2, '#ffffff');
  h(30, 3, 44, '#a8a49a'); r(0, 31, 48, 17, '#d8d4c8');
  r(8, 32, 4, 2, '#a8a49a'); r(7, 34, 6, 3, '#a8a49a'); r(9, 35, 2, 1, '#f2d27a'); r(9, 37, 2, 6, '#a8a49a'); r(7, 43, 6, 2, '#8a857a');
  for (const x of [22, 36]) { r(x, 35, 5, 5, '#c8c4bc'); r(x + 1, 33, 3, 2, '#c8c4bc'); r(x, 40, 6, 4, '#9a968c'); }
});

spotSprites.osmN5118172505 = hiCanvas((r, h) => {
  tileRoof(r, h, 4, [[14, 37], [11, 40], [8, 43], [6, 45], [4, 46], [3, 47], [2, 47], [1, 47]], ['#c4ccd6', '#8e9bad', '#4a525e', '#76808e']);
  r(4, 12, 43, 18, '#2e3530'); for (let x = 5; x < 47; x += 6) r(x, 12, 1, 18, '#5a5048'); for (let x = 8; x < 46; x += 6) r(x, 15, 3, 9, '#4a4440'); h(12, 4, 46, '#6a6058');
  h(30, 2, 47, '#7a6a58'); h(31, 2, 47, '#4a3e34'); r(3, 32, 44, 6, '#3a3028'); for (let x = 4; x < 46; x += 7) r(x, 32, 2, 6, '#6a5a48');
  r(20, 26, 6, 2, '#9a968c'); r(19, 28, 8, 4, '#a8a49a'); r(21, 29, 4, 2, '#e8d08a'); r(22, 32, 2, 8, '#9a968c'); r(18, 40, 10, 3, '#8a857a');
  for (const [x, y] of [[29, 22], [33, 26], [27, 28]]) { pix(r, PINE, x, y, '#3f7a34'); h(y, x + 2, x + 4, '#6fa04a'); } r(32, 30, 1, 12, '#5a4030');
  r(0, 43, 48, 5, '#c8c3b8');
});

spotSprites.osmN6057440275 = hiCanvas((r, h) => {
  r(0, 4, 48, 6, '#c8c8c4'); h(9, 0, 47, '#9a9a96'); r(0, 10, 6, 32, '#d8d8d4'); r(42, 10, 6, 32, '#d8d8d4'); r(4, 10, 2, 32, '#b0b0ac');
  r(6, 10, 36, 32, '#a8968a'); for (let y = 12; y < 42; y += 3) h(y, 6, 41, '#94827a');
  r(12, 12, 24, 5, '#ffffff'); r(13, 13, 3, 3, '#2f5fae'); for (let x = 18; x < 34; x += 2) r(x, 13, 1, 2, '#222'); h(16, 17, 34, '#d23a2e');
  r(15, 19, 18, 23, '#6a6c70'); for (let y = 22; y < 42; y += 2) h(y, 16, 31, '#8a8c90'); r(15, 19, 18, 2, '#3a3c40');
  r(36, 26, 4, 14, '#d23a2e'); r(37, 28, 2, 4, '#f4f4f4'); r(7, 30, 6, 12, '#e8e8e4'); for (let x = 8; x < 13; x += 2) r(x, 30, 1, 12, '#b8b8b4');
  r(0, 42, 48, 6, '#9a9a96'); r(22, 42, 4, 6, '#e0c040');
});

spotSprites.osmN7056162176 = hiCanvas((r, h) => {
  r(0, 10, 48, 2, '#c8ccd0'); for (let x = 1; x < 48; x += 3) r(x, 6, 1, 4, '#b8bcc0'); h(6, 0, 47, '#d0d4d8');
  r(0, 12, 48, 6, '#b8b8b2'); h(17, 0, 47, '#8a8a84');
  for (const x of [4, 20, 36]) { r(x, 18, 7, 22, '#c4c2ba'); r(x, 18, 2, 22, '#d8d6ce'); r(x + 5, 18, 2, 22, '#a8a69e'); }
  r(30, 24, 6, 3, '#ffffff'); r(31, 25, 4, 1, '#2f5fae'); r(40, 30, 4, 10, '#2a5fb0');
  r(0, 40, 48, 8, '#6a6a6a'); h(44, 0, 47, '#f4f4f4');
});

spotSprites.osmN6018637699 = hiCanvas((r, h) => {
  for (const [x, y] of [[0, 4], [38, 2]]) { r(x, y, 10, 10, '#3f7a34'); r(x + 2, y + 1, 4, 3, '#5a9a44'); }
  tileRoof(r, h, 9, [[8, 39], [6, 41], [4, 43], [3, 44], [2, 45]], ['#9ab8a8', '#6e9484', '#3e5a4e', '#5a7e6e']);
  r(5, 14, 38, 14, '#4a3a2c'); for (const x of [5, 12, 19, 28, 35, 42]) r(x, 14, 1, 14, '#7a6450'); r(19, 17, 10, 11, '#20160e'); for (let x = 7; x < 19; x += 2) r(x, 18, 1, 6, '#6a5440');
  h(15, 8, 40, '#e8dcc0'); r(31, 19, 9, 5, '#c8a870'); for (let x = 32; x < 40; x += 2) r(x, 20, 1, 3, '#f0e0b0');
  for (let y = 28; y < 40; y++) h(y, 14 - ((y - 28) >> 1), 33 + ((y - 28) >> 1), y % 2 ? '#a8a49a' : '#c8c3b8');
  r(0, 40, 48, 8, '#b8b0a0');
});

spotSprites.osmN7872569890 = hiCanvas((r, h) => {
  r(32, 6, 12, 30, '#e8e8e4'); for (let y = 9; y < 34; y += 4) r(34, 9 + (y - 9), 8, 2, '#6f8fa8'); r(40, 4, 2, 8, '#b8bcc0');
  r(2, 18, 34, 18, '#f0f0ec'); h(18, 2, 35, '#222'); h(22, 6, 33, '#222'); h(26, 2, 20, '#222'); r(10, 14, 16, 4, '#f0f0ec'); h(14, 10, 25, '#222');
  r(4, 30, 30, 6, '#5a6470'); for (let x = 6; x < 32; x += 5) r(x, 31, 1, 5, '#9aa4ae');
  spanRows(h, 14, [[26, 27], [25, 28], [25, 28], [24, 29], [24, 29], [23, 30], [23, 30], [22, 31], [22, 31], [21, 32], [21, 32], [20, 33], [20, 33], [19, 34], [19, 34], [18, 35], [18, 35], [17, 36], [17, 36], [16, 37], [16, 37], [15, 38]], i => i % 3 ? '#a8b0b8' : '#d8dee4');
  r(0, 36, 48, 12, '#7a7a78'); spanRows(h, 38, [[14, 40], [12, 42], [12, 42]], '#c83a3a'); for (let x = 13; x < 42; x += 3) r(x, 38, 1, 1, '#3f8a34');
  h(44, 0, 47, '#f4f4f4');
});

spotSprites.osmN8093413971 = hiCanvas((r, h) => { mtHutB2(r, h, { top: 12, sign: [22, 38], door: [5, 17] }); r(33, 36, 10, 6, '#3a3a3a'); for (let x = 34; x < 43; x += 3) r(x, 37, 2, 4, '#9a9a9a'); });

spotSprites.osmN8093413970 = hiCanvas((r, h) => { mtHutB2(r, h, { top: 14, sign: [8, 20], door: [20, 27] }); r(32, 27, 5, 15, '#2a5fb0'); r(33, 29, 3, 4, '#e8f0f8'); r(0, 16, 4, 2, '#5f9e98'); r(0, 18, 4, 24, '#c8ccce'); });

spotSprites.osmN7774774733 = hiCanvas((r, h) => {
  r(4, 12, 40, 2, '#7a8a96'); for (const x of [8, 24, 40]) r(x, 14, 1, 8, '#9aa0a6'); r(0, 22, 48, 3, '#b8b4ac');
  r(2, 6, 14, 16, '#e8e6e0'); tileRoof(r, h, 4, [[3, 14], [2, 15]], ['#c8ccd0', '#9aa0a6', '#5a6068', '#7a8088']); r(5, 10, 3, 3, '#6f8fa8'); r(10, 10, 3, 3, '#6f8fa8');
  r(18, 14, 12, 8, '#e8e6e0'); r(20, 16, 3, 3, '#6f8fa8');
  r(0, 25, 48, 13, '#a8a08e'); for (let y = 27; y < 38; y += 3) for (let x = (y % 2) * 3; x < 48; x += 6) r(x, y, 1, 2, '#8a826e');
  for (let x = 2; x < 46; x += 8) { r(x, 33, 7, 5, '#3f7a34'); r(x + 1, 32, 5, 1, '#5a9a44'); }
  r(0, 38, 48, 10, '#7a7a78'); r(6, 39, 9, 5, '#d8d8d4'); r(28, 39, 9, 5, '#5a6a8a');
});

spotSprites.osmN8095207755 = hiCanvas((r, h) => {
  r(1, 10, 18, 14, '#ffffff'); r(2, 11, 16, 12, '#7fb0d8'); r(4, 13, 10, 8, '#e8dcb0'); r(6, 15, 3, 3, '#d23a2e'); r(4, 24, 1, 12, '#888'); r(15, 24, 1, 12, '#888');
  tileRoof(r, h, 18, [[24, 44], [22, 46], [21, 47]], ['#d0d4d8', '#9aa0a6', '#5a6068', '#7a8088']); r(22, 21, 25, 21, '#f0eee8'); r(40, 21, 7, 21, '#d8d6d0');
  r(26, 26, 6, 5, '#6f8fa8'); r(36, 26, 6, 16, '#3a4048'); r(30, 21, 10, 3, '#ffffff'); r(31, 22, 2, 1, '#2f5fae');
  r(17, 30, 4, 12, '#d23a2e'); r(18, 32, 2, 3, '#f4f4f4'); r(0, 42, 48, 6, '#8a8a88'); for (let x = 3; x < 48; x += 8) r(x, 45, 4, 1, '#f4f4f4');
});

spotSprites.osmN8100814151 = hiCanvas((r, h) => {
  for (let k = 0; k < 14; k++) h(4 + k, 23 - k - 1, 24 + k + 1, '#8a5a4a'), (k > 1 && h(4 + k, 23 - k + 1, 24 + k - 1, '#c8b0a4'));
  r(8, 18, 32, 24, '#c8b0a4'); r(8, 18, 4, 24, '#b49c90'); h(17, 6, 41, '#8a5a4a');
  r(10, 17, 28, 5, '#ffffff'); for (const [x, c] of [[12, '#2f5fae'], [15, '#2f5fae'], [19, '#e05a2a'], [22, '#3f9a3a'], [25, '#e05a2a'], [29, '#2f5fae'], [33, '#2f5fae']]) r(x, 18, 2, 3, c);
  r(16, 24, 16, 18, '#3a3a40'); for (const x of [20, 24, 28]) r(x, 24, 1, 18, '#8a8a90'); r(19, 22, 10, 2, '#ffffff');
  r(8, 32, 3, 6, '#d23a2e'); r(9, 38, 1, 4, '#d23a2e'); pix(r, PINE, 0, 24, '#2f6a3a'); pix(r, PINE, 2, 28, '#2f6a3a'); r(4, 31, 1, 11, '#5a4030');
  r(40, 26, 8, 16, '#c86a3a'); h(26, 40, 47, '#8a4a2a'); r(0, 42, 48, 6, '#8a8a88');
});

spotSprites.osmN8093884446 = hiCanvas((r, h) => {
  spanRows(h, 4, [[10, 30], [4, 40], [0, 47], [0, 47], [0, 47]], i => i % 2 ? '#3f6a34' : '#4f7a3e');
  for (const [x0, x1] of [[2, 16], [26, 44]]) { h(12, x0 + 1, x1 - 1, '#8cc4be'); h(13, x0, x1, '#4f9e98'); h(14, x0, x1, '#3e706c'); r(x0 + 1, 15, x1 - x0 - 1, 13, '#f0f0ec'); r(x0 + 3, 18, 4, 4, '#6f8fa8'); }
  r(36, 20, 4, 8, '#d23a2e'); r(18, 10, 2, 22, '#e0c040'); for (let y = 12; y < 30; y += 4) r(18, y, 2, 2, '#222'); r(17, 10, 4, 2, '#d23a2e');
  r(0, 28, 48, 4, '#c8c4bc'); r(0, 32, 48, 10, '#6a5a48'); for (const y of [34, 38]) h(y, 0, 47, '#a8a8a8'); for (let x = 2; x < 48; x += 4) r(x, 35, 2, 1, '#4a3a2a');
  for (let x = 20; x < 40; x += 4) { r(x, 31, 2, 2, '#e0c040'); r(x + 2, 31, 2, 2, '#222'); } r(0, 42, 48, 6, '#9a9a96');
});

spotSprites.osmN8095081208 = hiCanvas((r, h) => {
  r(8, 2, 9, 34, '#d8d8d4'); r(10, 6, 5, 18, '#e8e0d8'); r(11, 8, 3, 12, '#b8a8c8'); h(2, 8, 16, '#a8a8a4');
  r(16, 10, 30, 3, '#c8ccd0'); for (let x = 17; x < 46; x += 3) r(x, 8, 1, 2, '#a8acb0'); h(8, 16, 45, '#d8dce0');
  for (let i = 0; i < 12; i++) r(2 + i, 36 - i * 2, 6, 2, '#b8bcc0');
  mtHutB2(r, h, { x0: 20, x1: 46, top: 20, sign: [30, 42], door: [22, 27] });
});

spotSprites.osmN8095081199 = hiCanvas((r, h) => {
  r(0, 8, 14, 30, '#f0f0ec'); r(2, 12, 4, 4, '#6f8fa8'); r(8, 12, 4, 4, '#6f8fa8');
  r(12, 16, 36, 22, '#ece8e0'); h(16, 12, 47, '#c8c4bc'); r(30, 18, 12, 4, '#ffffff'); r(31, 19, 2, 2, '#2f5fae'); for (let x = 34; x < 41; x += 2) r(x, 19, 1, 2, '#222');
  for (let k = 0; k < 14; k++) h(24 + k, 14 + k, 30 - Math.floor(k / 3), k % 2 ? '#c8783a' : '#d88a48');
  r(32, 26, 14, 12, '#4a5460'); for (const x of [36, 41]) r(x, 26, 1, 12, '#9aa4ae'); r(4, 28, 3, 6, '#d23a2e');
  r(0, 38, 48, 10, '#8a8a88'); for (let x = 2; x < 30; x += 6) r(x, 43, 4, 2, '#f4f4f4');
});

spotSprites.osmN8108665373 = hiCanvas((r, h) => {
  mtHutB2(r, h, { x0: 2, x1: 30, top: 16, band: false, sign: [10, 24], door: [4, 9] }); r(3, 34, 26, 8, '#b8a890');
  r(30, 22, 18, 2, '#5f9e98'); for (const x of [32, 40, 46]) r(x, 24, 1, 12, '#9aa0a6'); r(30, 32, 18, 4, '#c8c4bc');
  for (const x of [4, 12, 20]) { r(x + 1, 38, 1, 2, '#ff7a1a'); r(x, 40, 3, 2, '#ff7a1a'); } r(34, 26, 12, 6, '#5a8a3a');
});

spotSprites.osmN8108665362 = hiCanvas((r, h) => {
  r(0, 4, 18, 16, '#e8e8e4'); for (let y = 6; y < 18; y += 4) h(y, 1, 16, '#9aa4ae'); r(20, 2, 26, 4, '#d8d8d4');
  r(0, 18, 48, 3, '#7a8088'); h(18, 0, 47, '#9aa0a6'); for (const x of [6, 20, 34]) r(x, 21, 1, 6, '#8a8a88'); r(0, 26, 48, 2, '#b8b4ac');
  tileRoof(r, h, 26, [[12, 39], [10, 41], [8, 43], [7, 44]], ['#8a7a70', '#5a4c46', '#3a302c', '#4a3e38']);
  r(9, 30, 34, 12, '#ece8e0'); r(14, 33, 5, 5, '#6f8fa8'); r(24, 32, 8, 10, '#3a4048'); r(36, 33, 4, 5, '#d23a2e');
  r(0, 42, 48, 6, '#8a8a88');
});

spotSprites.osmN8108665360 = hiCanvas((r, h) => {
  r(0, 14, 10, 28, '#d8d4cc'); r(2, 18, 6, 4, '#6f8fa8');
  for (let k = 0; k < 13; k++) h(6 + k, 24 - k, 25 + k + 8, '#6a4a3a'), h(6 + k, 23 - k, 23 - k, '#4a3428');
  for (let k = 3; k < 13; k++) h(6 + k, 26 - k, 23 + k - 2, '#f0ead8');
  r(11, 19, 34, 23, '#f0ead8'); r(11, 19, 3, 23, '#d8d2c0'); r(17, 24, 8, 6, '#6fa0a8'); r(29, 24, 10, 18, '#3a3a40'); r(28, 22, 12, 2, '#d8d2c0');
  r(42, 24, 3, 8, '#2f5fae'); r(0, 42, 48, 6, '#8a8a88'); for (let x = 30; x < 48; x += 5) r(x, 45, 3, 1, '#f4f4f4');
});

spotSprites.osmN8108665358 = hiCanvas((r, h) => {
  r(4, 10, 40, 2, '#a8c8b0'); r(2, 12, 44, 2, '#88a890'); h(14, 2, 45, '#5a7a62'); r(18, 6, 12, 4, '#a8c8b0'); r(20, 7, 8, 2, '#ffffff');
  for (const x of [6, 18, 30, 42]) r(x, 15, 2, 22, '#d8d8d4');
  r(2, 30, 44, 7, '#e8e8e4'); for (let x = 3; x < 46; x += 2) r(x, 30, 1, 7, '#c8c8c4');
  for (let i = 0; i < 14; i++) h(37 - Math.floor(i / 2), 28 + i, 28 + i, '#b8b8b4'); r(26, 30, 20, 1, '#9a9a96');
  r(0, 37, 48, 11, '#8a8a88'); pix(r, ['..####..', '.######.', '########'], 0, 32, '#3f7a34');
});

spotSprites.osmN8094952624 = hiCanvas((r, h) => {
  r(0, 18, 12, 18, '#d8d8d4'); r(2, 22, 6, 4, '#6f8fa8'); r(0, 16, 12, 2, '#9aa0a6');
  r(12, 8, 34, 32, '#d02a2a'); h(8, 12, 45, '#e04a4a'); r(42, 8, 4, 32, '#a81e1e');
  for (const [cx, cy, rr] of [[20, 16, 4], [32, 14, 5], [26, 28, 6], [38, 30, 4], [16, 32, 3]]) for (let a = 0; a < 360; a += 20) { const t = a * Math.PI / 180, s = rr * (0.4 + a / 600); r(Math.round(cx + s * Math.cos(t)), Math.round(cy + s * Math.sin(t)), 1, 1, '#f4f0e8'); }
  r(23, 22, 7, 18, '#3a2a30'); r(24, 23, 5, 16, '#5a4a50'); r(40, 18, 4, 18, '#f0c040'); for (let y = 19; y < 36; y += 3) h(y, 40, 43, '#d0302a');
  r(0, 40, 48, 8, '#8a8a88');
});

spotSprites.osmN8093453674 = hiCanvas((r, h) => {
  mtHutB2(r, h, { x0: 8, x1: 36, top: 16, sign: [12, 24], door: [26, 31] }); r(14, 29, 4, 4, '#6f8fa8'); r(20, 29, 4, 4, '#6f8fa8');
  r(37, 26, 10, 16, '#f0f0ec'); h(26, 36, 47, '#4f9e98'); r(40, 30, 4, 4, '#f0c040');
  r(2, 14, 2, 28, '#e0c040'); for (let y = 16; y < 40; y += 4) r(2, y, 2, 2, '#222'); r(0, 14, 6, 3, '#d23a2e'); r(4, 18, 4, 2, '#222');
});

spotSprites.osmN8093499508 = hiCanvas((r, h) => {
  mtHutB2(r, h, { x0: 1, x1: 46, top: 12, sign: [14, 30], door: [5, 12] }); r(34, 22, 8, 4, '#6f8fa8');
  for (let x = 2; x < 46; x += 3) r(x, 38, 1, 4, '#f4f4f4'); h(38, 2, 45, '#f4f4f4'); r(20, 37, 4, 3, '#ffffff'); r(30, 37, 4, 3, '#ffffff');
});

spotSprites.osmN8093499509 = hiCanvas((r, h) => {
  r(22, 6, 22, 34, '#f0eee8'); h(6, 22, 43, '#c8c6c0'); r(24, 16, 18, 24, '#8a6a5a'); for (const y of [22, 30]) h(y, 24, 41, '#6a5048'); r(28, 24, 10, 16, '#3a3a40');
  r(26, 10, 14, 4, '#ffffff'); r(27, 11, 2, 2, '#2f5fae'); for (let x = 30; x < 39; x += 2) r(x, 11, 1, 2, '#222');
  r(4, 18, 18, 22, '#e8e6e0'); h(18, 3, 22, '#9aa0a6'); r(7, 22, 4, 4, '#6f8fa8'); r(16, 28, 4, 12, '#d23a2e');
  r(12, 10, 3, 18, '#f0d020'); r(11, 10, 1, 26, '#888'); for (let y = 12; y < 26; y += 3) r(13, y, 1, 1, '#2a2a2a');
  for (let x = 0; x < 48; x += 9) { r(x, 36, 8, 6, '#3f8a34'); r(x + 1, 35, 6, 1, '#5aa044'); } r(0, 42, 48, 6, '#8a8a88');
});

spotSprites.osmN8093413973 = hiCanvas((r, h) => {
  mtHutB2(r, h, { x0: 18, x1: 46, top: 14, sign: [30, 42], door: [21, 27] });
  r(0, 22, 20, 2, '#6a6a70'); h(21, 1, 19, '#8a8a90'); for (const x of [2, 10, 18]) r(x, 24, 1, 18, '#8a8a88');
  for (let x = 3; x < 17; x += 4) { r(x, 34, 3, 3, '#222'); r(x + 1, 32, 1, 2, '#3a7ac0'); } r(30, 22, 6, 4, '#6f8fa8');
});

spotSprites.osmN8094984124 = hiCanvas((r, h) => {
  for (let k = 0; k < 18; k++) { h(6 + k, 23 - k, 24 + k, k === 17 ? '#22262c' : '#3a4048'); if (k > 2 && k < 17) h(6 + k, 23 - k + 2, 23 - k + 2, '#5a6068'); }
  r(9, 24, 30, 14, '#9ab0bc'); for (const x of [9, 16, 24, 31, 38]) r(x, 24, 2, 14, '#8a6a48'); for (let k = 0; k < 6; k++) { r(14 + k, 18 + k, 1, 1, '#8a6a48'); r(33 - k, 18 + k, 1, 1, '#8a6a48'); }
  r(41, 30, 3, 6, '#d23a2e'); r(42, 36, 1, 4, '#d23a2e'); r(2, 26, 6, 10, '#e8eef4'); r(3, 27, 4, 4, '#5a8ac0'); r(4, 36, 1, 4, '#888');
  r(0, 38, 48, 3, '#c8c4bc'); for (let x = 1; x < 48; x += 4) r(x, 36, 1, 4, '#2a4a7a'); h(36, 0, 47, '#2a4a7a'); r(0, 41, 48, 7, '#5a5a5a');
});

spotSprites.osmN11568982800 = hiCanvas((r, h) => {
  const RC = ['#c4c8d0', '#8a909a', '#4a4f58', '#6c727c'];
  tileRoof(r, h, 5, [[10, 33], [8, 35], [6, 37], [4, 39], [3, 40], [2, 41], [1, 42], [0, 43]], RC);
  spanRows(h, 12, [[14, 25], [12, 27], [11, 28]], '#6c727c'); h(14, 13, 26, '#d8d8d0');
  r(3, 14, 38, 16, '#2c2a28'); for (const x of [3, 10, 17, 24, 31, 38]) r(x, 14, 2, 16, '#5a4a3a'); r(14, 17, 12, 11, '#1a1816'); for (let x = 15; x < 26; x += 2) r(x, 17, 1, 11, '#4a3e30');
  h(30, 1, 42, '#6a5a4a'); for (let x = 2; x < 42; x += 3) r(x, 31, 1, 4, '#5a4a3a'); h(31, 1, 42, '#7a6a58'); h(35, 0, 43, '#9a9488'); r(14, 35, 12, 6, '#a8a49a'); for (let y = 36; y < 41; y += 2) h(y, 14, 25, '#c8c4b8');
  for (const [x, y, w] of [[38, 12, 10], [36, 17, 12], [39, 22, 9], [37, 26, 11]]) { r(x, y, w, 5, '#f4c8d4'); r(x + 2, y + 1, w - 4, 2, '#fbe4ea'); }
  r(42, 30, 2, 12, '#5a4030'); h(41, 0, 47, '#c8bca8'); h(42, 0, 47, '#b8ae9a');
});

spotSprites.osmW464871669 = hiCanvas((r, h) => {
  const WL = '#c8aebc', WD = '#a88e9c', TR = '#f4f2ee';
  tileRoof(r, h, 10, [[4, 43], [3, 44], [2, 45], [1, 46]], ['#a8acb4', '#7e8590', '#4a4f58', '#666c76']);
  r(2, 14, 44, 24, WL); for (let y = 16; y < 38; y += 2) h(y, 2, 45, WD); h(14, 2, 45, TR); h(37, 2, 45, TR);
  for (const x of [5, 11, 35, 41]) { r(x, 18, 3, 8, '#5a6878'); r(x - 1, 17, 5, 1, TR); r(x - 1, 26, 5, 1, TR); r(x, 29, 3, 6, '#5a6878'); }
  spanRows(h, 6, [[22, 25], [20, 27], [18, 29], [17, 30]], '#7e8590'); r(17, 10, 14, 1, TR); for (let x = 18; x < 30; x++) { const y = 11 + Math.round(Math.abs(x - 23.5) / 3); r(x, y, 1, 1, TR); }
  r(17, 12, 14, 26, WL); r(17, 12, 1, 26, TR); r(30, 12, 1, 26, TR); r(20, 24, 8, 14, '#3a3238'); h(23, 19, 28, TR); r(23, 14, 2, 6, '#5a6878');
  r(0, 38, 48, 4, '#9a968e'); r(15, 38, 18, 4, '#b8b4ac'); for (let x = 1; x < 48; x += 4) r(x, 42, 2, 3, '#d8442c');
  h(45, 0, 47, '#8a8a88');
});

spotSprites.osmW446529374 = hiCanvas((r, h) => {
  r(2, 12, 44, 26, '#d8dadc'); h(12, 2, 45, '#eceeee'); h(13, 2, 45, '#b8bcc0');
  r(4, 15, 40, 13, '#cbcbc4'); for (let x = 5; x < 44; x += 3) r(x, 15, 1, 13, '#e8e8e2'); for (let x = 6; x < 44; x += 6) r(x, 17, 2, 9, '#a8aca8');
  r(2, 29, 44, 2, '#eceeee'); r(4, 31, 40, 7, '#35363a'); for (const x of [10, 18, 26, 34]) r(x, 31, 1, 7, '#8a9096'); r(20, 31, 8, 7, '#5a6e7e');
  pix(r, ['.#####.', '#######', '.#####.'], 0, 22, '#2f6a3a'); pix(r, ['.#####.', '#######', '.#####.'], 2, 26, '#3f7a44'); r(4, 29, 1, 9, '#5a4030');
  r(36, 30, 9, 6, '#3a3a40'); r(37, 31, 7, 4, '#d8d8d0'); r(39, 36, 1, 3, '#555'); r(42, 36, 1, 3, '#555');
  r(0, 38, 48, 4, '#9a9a98'); h(42, 0, 47, '#7a7a78'); for (let x = 22; x < 48; x += 6) r(x, 44, 4, 1, '#e8e8e8');
});

spotSprites.osmW465836402 = hiCanvas((r, h) => {
  r(0, 2, 48, 14, '#3f6a34'); for (const [x, y] of [[4, 4], [14, 2], [32, 3], [40, 5]]) r(x, y, 6, 4, '#5a8a44');
  spanRows(h, 9, [[18, 29], [17, 30], [16, 31]], '#7fb0a0'); h(9, 18, 29, '#a8d0c4'); r(18, 12, 12, 6, '#8a6a4a'); r(21, 13, 6, 5, '#3a2a20');
  r(10, 17, 28, 3, '#d8d4c8'); for (let x = 11; x < 38; x += 2) r(x, 17, 1, 3, '#a8a49a');
  for (let y = 20; y < 32; y++) h(y, 18 - ((y - 20) >> 1), 29 + ((y - 20) >> 1), y % 2 ? '#c8c4b8' : '#9a968c');
  for (const [x, s] of [[2, 1], [40, 1], [9, 0], [34, 0]]) { const y = s ? 22 : 18; r(x + 1, y, 4, 2, '#7a756a'); r(x, y + 2, 6, 3, '#8a857a'); r(x + 2, y + 3, 2, 1, '#e8d890'); r(x + 2, y + 5, 2, 10, '#8a857a'); r(x, y + 15, 6, 2, '#6a655a'); }
  r(0, 39, 48, 9, '#9a948a'); spanRows(h, 32, [[12, 35], [10, 37], [8, 39], [6, 41], [4, 43], [2, 45], [0, 47]], '#b8b2a6');
});

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

spotSprites.osmW469886506 = hiCanvas((r, h) => {
  const RT = '#a84a3a', RD = '#7a3428', WW = '#f0eeea';
  r(33, 2, 1, 10, '#555'); r(31, 4, 5, 1, '#555');
  for (let k = 0; k < 7; k++) h(11 + k, 9 - k, 44 + Math.min(k, 3), k === 6 ? RD : k % 2 ? RT : '#c25a48');
  r(4, 18, 40, 20, WW); for (const x of [8, 15, 22, 29, 36]) { r(x, 21, 4, 7, '#4a5868'); h(21, x, x + 3, '#2a3440'); r(x, 31, 4, 5, '#4a5868'); }
  r(0, 22, 6, 4, RT); r(0, 26, 5, 12, WW); r(1, 28, 3, 4, '#4a5868'); h(28, 4, 43, '#d8d4cc');
  r(40, 32, 4, 6, '#6a4a30'); pix(r, ['..###..', '.#####.', '#######'], 37, 30, '#3f7a34');
  r(0, 38, 48, 4, '#9a9a96'); h(42, 0, 47, '#7a7a78');
});

spotSprites.osmW498991062 = hiCanvas((r, h) => {
  spanRows(h, 4, [[14, 33], [10, 37], [6, 41], [3, 44], [1, 46], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47], [0, 47]], i => i % 4 === 1 ? '#5a7a44' : '#3f5a34');
  for (const [x, y] of [[8, 8], [20, 5], [32, 9], [14, 14], [38, 15]]) { r(x, y, 5, 3, '#6a8a50'); }
  h(14, 18, 29, '#a8a49a'); h(15, 19, 28, '#a8a49a'); r(18, 13, 1, 1, '#a8a49a'); r(29, 13, 1, 1, '#a8a49a'); r(20, 16, 2, 13, '#a8a49a'); r(26, 16, 2, 13, '#a8a49a'); h(18, 21, 27, '#9a968c');
  r(0, 23, 48, 9, '#b8b4aa'); for (let x = 0; x < 48; x += 3) { r(x, 23, 2, 9, '#c8c4ba'); r(x, 22, 2, 1, '#a8a49a'); } r(19, 23, 10, 9, '#4a5a3a');
  for (let y = 29; y < 37; y++) h(y, 18 - ((y - 29) >> 1), 29 + ((y - 29) >> 1), y % 2 ? '#c8c4b8' : '#9a968c');
  r(0, 37, 48, 11, '#7a8a5a'); spanRows(h, 37, [[14, 33], [12, 35], [10, 37], [8, 39], [6, 41]], '#a8a494');
});

spotSprites.osmW498047607 = hiCanvas((r, h) => {
  const ST = '#9a968e', SL = '#b8b4ac';
  tileRoof(r, h, 14, [[18, 29], [16, 31], [15, 32]], ['#9aa0a8', '#6c727c', '#3a3f48', '#555b64']); r(17, 17, 14, 8, '#6a5440'); r(20, 18, 8, 7, '#2a2018');
  h(10, 6, 41, SL); h(11, 7, 40, ST); r(6, 9, 1, 1, SL); r(41, 9, 1, 1, SL); h(15, 10, 37, ST); r(11, 12, 3, 28, SL); r(34, 12, 3, 28, SL); r(13, 12, 1, 28, ST); r(36, 12, 1, 28, ST);
  h(13, 14, 33, '#e8dcb0'); h(14, 15, 32, '#d8c890'); for (const x of [18, 23, 28]) { r(x, 15, 1, 2, '#ffffff'); r(x + 1, 16, 1, 1, '#ffffff'); }
  for (const x of [1, 41]) { r(x + 1, 20, 4, 2, '#7a756a'); r(x, 22, 6, 4, ST); r(x + 2, 23, 2, 2, '#e8d890'); r(x + 2, 26, 2, 10, ST); r(x, 36, 6, 3, '#7a756a'); }
  r(0, 39, 48, 9, '#d8ccb0'); for (const [x, y] of [[5, 42], [16, 45], [30, 43], [40, 46]]) r(x, y, 3, 1, '#c0b090');
});

spotSprites.osmW497083985 = hiCanvas((r, h) => {
  const C1 = '#d8d6d8', C2 = '#a8a6aa', C3 = '#6a686c';
  for (let y = 4; y < 22; y++) { const t = (y - 4) / 18, a = Math.round(14 - t * 4), b = Math.round(30 + t * 16); h(y, a, b, y < 8 ? C1 : y < 16 ? '#c4c2c6' : C2); }
  for (let y = 6; y < 20; y++) { const a = 20 + ((y - 6) >> 1); h(y, a, Math.min(46, a + 18 - ((y - 6) >> 1)), '#4a4a50'); }
  h(22, 10, 47, C3); r(16, 22, 4, 16, C2); r(36, 22, 4, 16, C2); r(17, 22, 1, 16, C1);
  r(2, 26, 44, 12, '#bcbabe'); h(26, 2, 45, C1); r(6, 29, 8, 6, '#3e383a'); r(22, 29, 12, 9, '#3e383a'); r(40, 29, 5, 6, '#3e383a'); r(25, 23, 6, 2, '#ffffff');
  r(0, 38, 48, 3, '#8a8890'); r(0, 41, 48, 7, '#a8a49a'); for (let x = 2; x < 48; x += 4) r(x, 43, 2, 1, '#8a857a');
});

spotSprites.osmW616219752 = hiCanvas((r, h) => {
  const RC = ['#9aa0aa', '#6b7682', '#3a3f48', '#555e68'];
  spanRows(h, 4, [[22, 25], [21, 26], [20, 27]], '#e8e4dc'); tileRoof(r, h, 4, [[16, 31], [13, 34], [10, 37], [8, 39], [6, 41], [4, 43], [2, 45], [1, 46], [0, 47]], RC); spanRows(h, 4, [[22, 25], [21, 26]], '#e8e4dc');
  r(4, 13, 40, 17, '#e8e2d6'); for (const x of [4, 11, 18, 29, 36, 43]) r(x, 13, 1, 17, '#63543f'); h(13, 4, 43, '#63543f'); h(20, 4, 43, '#63543f');
  r(19, 21, 10, 9, '#39332b'); for (let x = 20; x < 29; x += 2) r(x, 21, 1, 9, '#63543f'); r(6, 22, 4, 6, '#5a4a3a'); r(38, 22, 4, 6, '#5a4a3a');
  h(30, 2, 45, '#7a6a58'); r(2, 31, 44, 4, '#3a3028'); for (let x = 3; x < 46; x += 5) r(x, 31, 1, 4, '#63543f'); h(35, 1, 46, '#a8a49a');
  r(0, 36, 48, 12, '#b8b2a6'); r(0, 36, 5, 6, '#3f7a34'); r(43, 36, 5, 6, '#3f7a34');
});

spotSprites.osmW863301938 = hiCanvas((r, h) => {
  const RC = ['#a8acb4', '#7a808a', '#3e434c', '#5a606a'];
  tileRoof(r, h, 6, [[12, 37], [10, 39], [8, 41], [6, 43], [4, 45], [3, 46], [2, 47]], RC); spanRows(h, 4, [[30, 33], [29, 34]], '#e8e4dc');
  r(4, 13, 41, 17, '#25282f'); for (let x = 4; x < 45; x += 4) r(x, 13, 1, 17, '#e8e4dc'); h(13, 4, 44, '#e8e4dc'); h(19, 4, 44, '#e8e4dc'); h(24, 4, 44, '#e8e4dc');
  for (let x = 6; x < 44; x += 8) r(x, 20, 2, 3, '#626166');
  h(30, 3, 45, '#6a5a4a'); r(3, 31, 42, 3, '#1a1a1e'); for (let x = 4; x < 45; x += 5) r(x, 31, 1, 3, '#5a4a3a');
  r(0, 34, 48, 14, '#7aa04a'); h(34, 0, 47, '#8ab45a'); pix(r, ['.######.', '########'], 0, 32, '#3f7a34'); pix(r, ['..####', '######'], 40, 32, '#3f7a34');
  for (let y = 38; y < 48; y++) h(y, 20 - ((y - 38) >> 1), 27 + ((y - 38) >> 1), '#c8c0a8');
});

spotSprites.osmR8102292 = hiCanvas((r, h) => {
  const BR = '#8c6050', BL = '#a87868', BD = '#6a4438';
  r(0, 14, 48, 22, BR); for (let x = 0; x < 48; x += 4) r(x, 12, 2, 2, BR); for (let y = 16; y < 36; y += 3) for (let x = (y % 2) * 2; x < 48; x += 5) r(x, y, 3, 1, BL);
  for (const x of [4, 30]) { r(x, 4, 12, 30, '#7a5040'); for (let i = 0; i < 12; i += 3) r(x + i, 2, 2, 2, '#7a5040'); r(x + 4, 10, 4, 6, '#3a2a24'); r(x + 4, 9, 4, 1, '#3a2a24'); r(x + 1, 6, 2, 26, '#9a6a58'); }
  r(19, 22, 8, 14, '#3a2a24'); r(20, 21, 6, 1, '#3a2a24'); h(36, 0, 47, BD);
  for (const x of [2, 18, 34]) { spanRows(h, 30, [[x + 3, x + 8], [x + 1, x + 10], [x, x + 11]], '#2a5fb0'); h(31, x + 2, x + 9, '#4a80d0'); r(x + 5, 33, 1, 7, '#e8e8e8'); }
  r(0, 40, 48, 8, '#d8c4a8'); for (const [x, y] of [[8, 43], [26, 45], [40, 42]]) r(x, y, 3, 1, '#c0a888');
});

spotSprites.osmW1055866521 = hiCanvas((r, h) => {
  r(0, 2, 48, 12, '#3f6a34'); r(8, 3, 10, 5, '#5a8a44'); r(30, 2, 12, 5, '#5a8a44');
  spanRows(h, 12, [[10, 37], [8, 39], [6, 41], [4, 43], [3, 44]], i => i === 0 ? '#a8c8b4' : i === 4 ? '#4a6a5c' : '#7e9e8e'); for (let x = 6; x < 42; x += 2) r(x, 13, 1, 3, '#6e8e7e');
  r(5, 17, 38, 12, '#2a2422'); for (const x of [5, 12, 19, 28, 35, 42]) r(x, 17, 1, 12, '#5a4a3a'); r(19, 19, 10, 10, '#1a1614'); h(18, 6, 41, '#e8dcb0');
  h(29, 3, 44, '#8a857a');
  for (const x of [3, 41]) { r(x + 1, 27, 3, 2, '#6a655a'); r(x, 29, 5, 3, '#8a857a'); r(x + 1, 30, 3, 1, '#e8d890'); r(x + 2, 32, 1, 8, '#8a857a'); r(x, 40, 5, 2, '#6a655a'); }
  r(0, 32, 48, 16, '#7a9a5a'); for (let y = 32; y < 48; y++) h(y, 20 - ((y - 32) >> 2), 27 + ((y - 32) >> 2), y % 3 ? '#b8b4a8' : '#9a968c');
});

spotSprites.osmR8620217 = hiCanvas((r, h) => {
  for (let a = 0; a < 360; a += 5) { const t = a * Math.PI / 180; r(Math.round(13 + 11 * Math.cos(t)), Math.round(14 + 11 * Math.sin(t)), 1, 1, '#e8e8f0'); }
  for (let a = 0; a < 360; a += 30) { const t = a * Math.PI / 180; for (let k = 2; k < 11; k += 2) r(Math.round(13 + k * Math.cos(t)), Math.round(14 + k * Math.sin(t)), 1, 1, '#c8ccd8'); r(Math.round(13 + 11 * Math.cos(t)) - 1, Math.round(14 + 11 * Math.sin(t)), 3, 2, ['#e85a5a', '#f2c230', '#4a90e0', '#5ab45a'][a / 30 % 4]); }
  r(12, 14, 2, 18, '#9a9aa8'); r(9, 30, 8, 2, '#8a8a98');
  for (let k = 0; k < 16; k++) h(10 + k, 30 - k, 30 + Math.round(k * 0.6), k % 3 ? '#f4f4f0' : '#e0e0dc'); for (let k = 0; k < 10; k++) h(14 + k, 38 + k, 46, '#f2c230');
  r(18, 26, 30, 8, '#d8dcdf'); for (let x = 20; x < 46; x += 4) r(x, 28, 2, 4, '#5a7a9a');
  r(0, 34, 48, 5, '#b8a888'); for (let x = 0; x < 48; x += 3) r(x, 34, 1, 5, '#8a7a5a'); r(0, 39, 48, 9, '#4a80b0'); for (const [x, y] of [[4, 42], [20, 44], [34, 41]]) h(y, x, x + 3, '#8cc0e0');
});

spotSprites.osmW945765385 = hiCanvas((r, h) => {
  r(0, 6, 48, 12, '#4a6a3a'); for (const [x, y] of [[2, 8], [12, 6], [24, 9], [36, 7]]) { r(x, y, 8, 5, '#6a8a50'); r(x + 3, y + 5, 1, 4, '#5a4030'); }
  r(0, 18, 48, 30, '#b8907e'); for (const [x, y] of [[4, 24], [30, 22], [16, 36], [40, 40]]) r(x, y, 4, 1, '#c8a490');
  for (const [cx, cy] of [[14, 28], [32, 32]]) for (let a = 0; a < 360; a += 45) { const t = a * Math.PI / 180; r(Math.round(cx + 7 * Math.cos(t)), Math.round(cy + 4 * Math.sin(t)), 2, 2, '#7a6458'); r(Math.round(cx + 7 * Math.cos(t)), Math.round(cy + 4 * Math.sin(t)), 1, 1, '#9a8478'); }
  r(38, 18, 8, 6, '#5a4a3a'); r(39, 19, 6, 4, '#e8e2d0'); r(40, 24, 1, 4, '#5a4a3a'); r(43, 24, 1, 4, '#5a4a3a');
});

spotSprites.osmR3105117 = hiCanvas((r, h) => {
  const RC = ['#b8bcc4', '#7e8088', '#3e4048', '#5e6068'];
  tileRoof(r, h, 9, [[10, 37], [8, 39], [6, 41], [4, 43], [2, 45], [1, 46], [0, 47]], RC); spanRows(h, 6, [[38, 41], [37, 43], [36, 45]], '#5e6068'); h(8, 38, 44, '#e8e4dc');
  r(3, 16, 42, 14, '#eceae4'); for (let x = 3; x < 45; x += 5) r(x, 16, 1, 14, '#47484e'); h(16, 3, 44, '#47484e'); h(22, 3, 44, '#b8b4ac');
  r(18, 23, 12, 7, '#3a3a40'); for (let x = 19; x < 30; x += 2) r(x, 23, 1, 7, '#6a6a70'); r(7, 18, 6, 3, '#8a8e94'); r(35, 18, 6, 3, '#8a8e94');
  r(1, 30, 46, 3, '#9a968c'); r(0, 33, 48, 4, '#3f6a34'); h(33, 0, 47, '#5a8a44'); r(0, 37, 48, 11, '#b8b4aa'); for (let x = 2; x < 48; x += 5) r(x, 40, 3, 1, '#d8d4ca');
});

spotSprites.osmW909281705 = hiCanvas((r, h) => {
  const ST = '#a8a49a', SD = '#8a857a';
  tileRoof(r, h, 6, [[13, 34], [11, 36], [10, 37], [9, 38]], ['#b8bcc8', '#939aab', '#4a4f5a', '#7a8090']); r(11, 10, 26, 10, '#3a3838'); r(17, 12, 14, 8, '#1e1c1c'); for (const x of [11, 18, 29, 36]) r(x, 10, 1, 10, '#6a5a4a'); h(11, 12, 35, '#e8dcb0');
  r(9, 20, 30, 2, SD);
  for (const x of [1, 39]) { r(x + 1, 10, 6, 2, SD); r(x, 12, 8, 4, ST); r(x + 2, 13, 4, 2, '#e8d890'); r(x + 2, 16, 4, 2, SD); r(x + 3, 18, 2, 12, ST); r(x + 1, 30, 6, 3, ST); r(x, 33, 8, 3, SD); }
  for (const x of [12, 32]) { r(x, 28, 4, 4, '#b8b4aa'); r(x + 1, 26, 2, 2, '#b8b4aa'); r(x - 1, 32, 6, 3, SD); }
  for (const x of [14, 30]) { r(x - 1, 37, 6, 5, '#5a8a3a'); r(x, 36, 4, 1, '#d8a040'); }
  r(0, 36, 48, 12, '#a8a6a2'); for (let y = 22; y < 48; y++) h(y, 19 - ((y - 22) >> 2), 28 + ((y - 22) >> 2), y % 2 ? '#c8c6c2' : '#898e91');
});

spotSprites.osmW1057193114 = hiCanvas((r, h) => {
  r(0, 0, 48, 14, '#2f4a2a'); r(6, 2, 10, 5, '#4a6a3a'); r(30, 1, 10, 5, '#4a6a3a');
  for (let k = 0; k < 9; k++) h(8 + k, 14 - k * 1.5 | 0, 33 + k * 1.5 | 0, k === 0 ? '#9aaab4' : k === 8 ? '#3a4650' : k % 3 === 1 ? '#8a9aa8' : '#6d7b88');
  for (let x = 4; x < 44; x += 3) r(x, 11, 1, 4, '#5e6c78'); spanRows(h, 5, [[20, 27], [19, 28], [18, 29]], '#6d7b88'); h(7, 20, 27, '#d8d4c8');
  r(4, 17, 40, 13, '#18171d'); for (const x of [4, 12, 20, 27, 35, 43]) r(x, 17, 1, 13, '#4a3e34'); r(19, 20, 10, 10, '#0e0e12'); h(18, 5, 42, '#d8c8a0');
  for (const x of [1, 41]) { r(x + 1, 26, 4, 2, '#6a655a'); r(x, 28, 6, 3, '#8a857a'); r(x + 2, 29, 2, 1, '#e8d890'); r(x + 2, 31, 2, 9, '#8a857a'); r(x, 40, 6, 2, '#6a655a'); }
  h(30, 3, 44, '#7a756a'); r(0, 31, 48, 17, '#8a8a7a'); for (let y = 31; y < 48; y++) h(y, 19 - ((y - 31) >> 2), 28 + ((y - 31) >> 2), '#b8b4a8');
});

spotSprites.osmN3999572942 = hiCanvas((r, h) => {
  r(4, 2, 14, 32, '#e8e6e2'); for (let y = 4; y < 33; y += 2) h(y, 5, 16, '#b8b8b8'); r(4, 2, 2, 32, '#f8f8f6'); r(16, 2, 2, 32, '#c8c6c2');
  r(30, 12, 12, 22, '#dcdad6'); for (let y = 14; y < 33; y += 3) h(y, 31, 40, '#a8a8a4'); r(20, 18, 8, 16, '#e8e8e4'); for (let y = 20; y < 33; y += 3) r(21, y, 6, 1, '#9a9a96');
  r(0, 30, 48, 8, '#c8ccd0'); h(30, 0, 47, '#e8ecee'); for (let x = 2; x < 48; x += 5) r(x, 32, 3, 4, '#6a7a8a'); r(14, 33, 8, 5, '#d23a2e'); r(15, 34, 6, 1, '#ffffff');
  r(0, 38, 48, 2, '#9a9a9a'); for (const x of [6, 22, 38]) r(x, 40, 2, 4, '#8a8a88'); r(0, 44, 48, 4, '#6c6a69');
});

spotSprites.osmN3999573157 = hiCanvas((r, h) => {
  r(26, 0, 12, 22, '#d8d6d2'); for (let y = 2; y < 22; y += 2) h(y, 27, 36, '#a8a8a4');
  for (let x = 6; x < 42; x++) { const y = 14 + Math.round(Math.pow((x - 24) / 18, 2) * 4); r(x, y, 1, 2, '#e8ecf0'); r(x, y + 2, 1, 1, '#9aa8b8'); }
  r(8, 19, 32, 15, '#f0f2f2'); h(19, 8, 39, '#c8ccd0'); r(12, 24, 24, 10, '#5a6a7a'); for (let x = 14; x < 36; x += 4) r(x, 24, 1, 10, '#c8ccd0'); r(17, 20, 14, 3, '#ffffff'); r(18, 21, 4, 1, '#e8742c'); r(23, 21, 7, 1, '#3a5aa0');
  r(40, 22, 7, 12, '#e0e2e2'); for (let y = 24; y < 32; y += 3) r(41, y, 5, 1, '#9aa8b8'); r(0, 26, 8, 8, '#c8ccd0');
  r(0, 34, 48, 14, '#7a7c7e'); spanRows(h, 34, [[20, 27], [19, 28], [18, 29], [17, 30], [16, 31], [15, 32], [14, 33]], '#8e9092'); for (let y = 36; y < 48; y += 3) h(y, 23, 24, '#e8e8e8');
});

spotSprites.osmN5088818889 = hiCanvas((r, h) => {
  r(10, 2, 28, 36, '#9a7058'); r(10, 2, 28, 2, '#b8b4ac'); for (let y = 6; y < 36; y += 4) { r(14, y, 20, 2, '#e8e6e0'); r(14, y + 2, 20, 2, '#5a6a7a'); } for (let x = 14; x < 34; x += 4) r(x, 6, 1, 30, '#d8d4cc');
  r(2, 14, 8, 24, '#b8a088'); for (let y = 16; y < 36; y += 4) r(3, y, 6, 2, '#5a6a7a'); r(38, 10, 8, 28, '#8a6048'); for (let y = 12; y < 36; y += 4) r(39, y, 6, 2, '#6a7a8a');
  r(16, 32, 16, 6, '#3f4a52'); r(14, 31, 20, 1, '#d8d4cc'); r(0, 38, 48, 3, '#9a9a98'); r(0, 41, 48, 7, '#7a8a5a'); for (let x = 2; x < 48; x += 6) r(x, 40, 4, 2, '#3f7a34');
});

spotSprites.osmN1423949200 = hiCanvas((r, h) => {
  const BR = '#a85e40', BS = '#7e4430';
  spanRows(h, 8, [[4, 30], [4, 34], [4, 38], [4, 42], [4, 46]], BR); r(4, 13, 43, 4, BR); h(13, 4, 46, BS);
  r(30, 8, 17, 30, BS); for (let y = 10; y < 38; y += 3) h(y, 30, 46, '#6e3a28'); for (const y of [16, 24]) r(38, y, 3, 4, '#2a2a2e');
  r(4, 17, 26, 18, '#352e24'); for (const x of [6, 12, 18, 24]) { r(x, 17, 3, 18, BR); r(x, 17, 1, 18, '#c07a58'); } r(9, 22, 3, 13, '#5a6a6a'); r(21, 22, 3, 13, '#5a6a6a');
  r(0, 35, 48, 13, '#a8604a'); for (let y = 37; y < 48; y += 3) h(y, 0, 47, '#c0786a'); r(4, 38, 26, 2, '#7a3a2a');
});

spotSprites.osmN5146201595 = hiCanvas((r, h) => {
  const WL = '#d0bc90', WS = '#a8946c', RF = '#5a6068';
  h(9, 1, 46, RF); h(10, 0, 47, '#3e434a'); r(1, 11, 46, 25, WL); r(1, 11, 46, 1, '#e0d0a8');
  for (const y of [13, 23]) for (let x = 3; x < 46; x += 5) { if (x > 18 && x < 28) continue; r(x, y, 3, 7, '#4a5a6a'); r(x, y, 3, 1, '#8aa0b0'); h(y + 7, x - 1, x + 3, WS); }
  for (let k = 0; k < 6; k++) h(9 + k, 23 - k, 24 + k, k ? WL : RF); h(15, 16, 31, RF); r(17, 16, 14, 20, '#c8b080'); r(19, 22, 10, 14, '#3a3028'); r(20, 21, 8, 2, '#c8b080'); r(19, 18, 10, 1, WS);
  r(36, 30, 10, 6, '#7a4a30'); r(37, 28, 8, 3, '#b89060'); r(0, 36, 48, 12, '#8a8a86'); r(0, 32, 6, 4, '#4a7a3a');
});

spotSprites.osmN1423987791 = hiCanvas((r, h) => {
  r(19, 4, 10, 4, '#e8e8e4'); h(4, 19, 28, '#ffffff'); for (let x = 20; x < 28; x += 2) r(x, 5, 1, 2, '#9aa4ac');
  spanRows(h, 8, [[12, 35], [6, 41], [3, 44], [1, 46]], i => i < 2 ? '#8ab8b0' : '#6a9a92');
  r(1, 12, 46, 4, '#5a8aa0'); for (let x = 2; x < 46; x += 3) r(x, 12, 1, 4, '#c8d8e0'); r(1, 16, 46, 14, '#d8dce4'); for (let x = 4; x < 45; x += 5) r(x, 19, 2, 5, '#5a7088');
  for (let i = 0; i < 18; i++) { const t = i / 17 * Math.PI, x = Math.round(24 + 16 * Math.cos(t)), y = Math.round(28 - 18 * Math.sin(t)); r(x - 1, y, 3, 2, '#ffffff'); }
  r(7, 28, 3, 14, '#ffffff'); r(38, 28, 3, 14, '#ffffff'); r(0, 30, 48, 4, '#4a7a3a'); r(0, 34, 48, 14, '#8a8a88'); h(37, 0, 47, '#e8e8e8');
});

spotSprites.osmN1423994163 = hiCanvas((r, h) => {
  const WL = '#c8c0b2', WS = '#9a9284';
  r(2, 12, 44, 24, WL); h(12, 2, 45, '#e0d8ca'); for (let y = 14; y < 36; y += 2) h(y, 2, 45, '#bcb4a6');
  for (let x = 4; x < 34; x += 4) { r(x, 16, 3, 5, '#3a4048'); r(x, 26, 3, 5, '#3a4048'); }
  r(34, 12, 12, 24, WS); r(34, 18, 12, 2, '#d8d0c2'); for (let x = 35; x < 46; x += 2) r(x, 18, 1, 2, '#6a645a'); r(36, 22, 2, 14, WL); r(43, 22, 2, 14, WL); r(38, 24, 5, 12, '#3a4048');
  for (const x of [5, 12, 26]) { r(x + 1, 32, 1, 6, '#6a4a30'); r(x - 1, 28, 5, 5, '#4a7a3a'); }
  r(0, 36, 48, 3, '#6a8a4a'); r(0, 39, 48, 9, '#9a968e');
});
spotSprites.osmN1423994160 = spotSprites.osmN1423994163;

spotSprites.osmN1423989568 = hiCanvas((r, h) => {
  const TL = '#d8dce0', TS = '#b0b6bc', GL = '#3e5a7a';
  r(6, 8, 22, 28, TL); r(28, 14, 16, 22, '#c8ccd0'); r(28, 14, 16, 1, '#e8ecf0'); h(8, 6, 27, '#eef0f2');
  for (let y = 9; y < 36; y += 3) h(y, 6, 27, TS); for (let x = 9; x < 28; x += 4) r(x, 8, 1, 28, TS);
  r(7, 14, 20, 6, GL); r(7, 26, 20, 6, GL); for (let x = 9; x < 27; x += 4) { r(x, 14, 1, 6, TL); r(x, 26, 1, 6, TL); }
  r(29, 18, 6, 4, GL); r(30, 26, 12, 3, '#9aa4ac'); r(36, 29, 4, 7, '#2a4a8a');
  r(0, 36, 48, 12, '#4a4c50'); for (const x of [10, 22, 34]) r(x, 38, 1, 10, '#e8e8e8');
});

spotSprites.osmN5147537990 = hiCanvas((r, h) => {
  r(0, 2, 18, 16, '#3f7a34'); r(30, 2, 18, 16, '#4f8a3a'); r(4, 4, 8, 4, '#5a9a44'); r(34, 5, 9, 4, '#6aaa4a');
  spanRows(h, 10, [[17, 30], [15, 32], [14, 33]], '#5a6068'); r(16, 13, 16, 8, '#c8382c'); r(21, 15, 6, 6, '#3a2218'); h(13, 16, 31, '#e8e4dc');
  for (let y = 21; y < 34; y++) h(y, 17 - ((y - 21) >> 1), 30 + ((y - 21) >> 1), y % 2 ? '#a8a49a' : '#c8c4b8');
  for (const x0 of [1, 37]) { for (let x = x0; x < x0 + 10; x += 3) { r(x, 24, 2, 14, '#c8382c'); r(x, 23, 2, 1, '#e85848'); } h(26, x0, x0 + 9, '#c8382c'); r(x0 + 1, 22, 3, 2, '#e8e0d0'); }
  r(0, 38, 48, 10, '#a8a49a'); for (let y = 40; y < 48; y += 2) h(y, 0, 47, '#b8b4aa');
});

spotSprites.osmN1424003413 = hiCanvas((r, h) => {
  tileRoof(r, h, 14, [[16, 31], [14, 33], [12, 35]], ['#7a7a80', '#5a5a60', '#3a3a3e', '#4d4c4f']);
  tileRoof(r, h, 18, [[3, 44], [1, 46], [0, 47]], ['#7a7a80', '#5a5a60', '#3a3a3e', '#4d4c4f']);
  r(18, 17, 12, 2, '#f0b850'); r(2, 21, 44, 12, '#e8e4dc'); for (const x of [2, 12, 34, 45]) r(x, 21, 1, 12, '#8a8680');
  r(5, 23, 10, 7, '#f0c070'); for (let x = 6; x < 15; x += 2) r(x, 24, 1, 5, '#c08840'); r(18, 22, 12, 11, '#f8d088'); r(22, 25, 4, 8, '#5a4030'); r(36, 23, 6, 7, '#3a3a3e');
  r(0, 33, 48, 15, '#4a4a4e'); for (const x of [8, 20, 32]) r(x, 36, 6, 1, '#e8e8e8'); r(33, 32, 9, 4, '#1a1a1e'); r(34, 31, 6, 1, '#2a2a2e');
});

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

spotSprites.osmN5406014369 = hiCanvas((r, h) => {
  spanRows(h, 6, [[14, 33], [10, 37], [6, 41], [3, 44], [1, 46]], i => i < 2 ? '#7a5040' : '#5a3a2e'); h(11, 0, 47, '#2e2020'); r(22, 3, 4, 3, '#4a3a30');
  r(3, 12, 42, 13, '#3a2826'); for (const x of [3, 10, 17, 30, 37, 44]) r(x, 12, 1, 13, '#6a4a3a'); r(18, 14, 12, 11, '#1f161c'); r(21, 14, 6, 6, '#c8b890');
  for (const x of [20, 26]) r(x, 13, 2, 8, '#e8e0d0');
  r(0, 25, 48, 4, '#a8a49a'); for (let x = 1; x < 48; x += 4) r(x, 24, 2, 5, '#c0bcb2'); r(19, 25, 10, 4, '#c8c4b8');
  for (let y = 29; y < 36; y++) h(y, 18 - (y - 29), 29 + (y - 29), y % 2 ? '#b8b4aa' : '#a8a49a');
  for (const x of [6, 39]) { r(x + 1, 30, 2, 1, '#a8a49a'); r(x, 31, 4, 2, '#a8a49a'); r(x + 1, 33, 2, 5, '#a8a49a'); }
  r(0, 36, 48, 12, '#d0c8b0');
});

spotSprites.osmN6225098114 = hiCanvas((r, h) => {
  tileRoof(r, h, 4, [[18, 29], [15, 32], [12, 35], [10, 37], [8, 39], [6, 41], [4, 43], [2, 45], [1, 46], [0, 47]], ['#6a7a9a', '#3b4d6b', '#1e2838', '#2e3e58']);
  r(0, 11, 1, 2, '#1e2838'); r(47, 11, 1, 2, '#1e2838');
  r(5, 14, 38, 18, '#4a3e38'); for (const x of [5, 12, 19, 28, 35, 42]) r(x, 14, 1, 18, '#6a5a50'); h(14, 5, 42, '#2a2420');
  r(19, 17, 10, 15, '#2e2622'); for (let x = 20; x < 29; x += 2) r(x, 17, 1, 15, '#5a4a40'); for (const x of [7, 14, 30, 37]) r(x, 18, 4, 8, '#5a4a40');
  for (const x of [8, 37]) { r(x + 1, 29, 2, 1, '#9a968c'); r(x, 30, 4, 3, '#9a968c'); r(x + 1, 33, 2, 6, '#9a968c'); r(x, 39, 4, 1, '#7a766c'); }
  r(0, 32, 48, 16, '#c0bab0'); spanRows(h, 32, [[20, 27], [19, 28], [18, 29], [17, 30], [16, 31], [15, 32], [14, 33]], '#e0dcd4');
});

spotSprites.osmN6385749931 = hiCanvas((r, h) => {
  r(4, 16, 40, 12, '#8a8e92'); h(16, 4, 43, '#a8acb0'); h(15, 6, 41, '#6a6e72'); for (let x = 6; x < 43; x += 4) r(x, 20, 2, 5, '#5a5e62'); r(30, 22, 12, 6, '#4a4e52');
  spanRows(h, 24, [[0, 20], [0, 24], [0, 28], [0, 31], [0, 33], [0, 34]], '#5a8a3a'); for (const [x, y] of [[4, 18], [14, 16], [24, 20], [38, 18]]) { r(x, y, 5, 5, '#3f7a34'); r(x + 1, y, 3, 2, '#6aaa4a'); r(x + 2, y + 5, 1, 4, '#5a4030'); }
  spanRows(h, 30, [[34, 47], [30, 47], [26, 47], [22, 47], [18, 47], [14, 47], [10, 47], [6, 47]], '#b8b4ac'); r(0, 38, 48, 10, '#9a968e'); r(34, 26, 6, 4, '#5a5654'); r(35, 27, 4, 1, '#d8d0b0');
});

spotSprites.osmN8095206125 = hiCanvas((r, h) => {
  r(10, 8, 38, 4, '#c8ccd2'); r(10, 12, 38, 20, '#eceef2'); h(12, 10, 47, '#ffffff'); for (let x = 12; x < 48; x += 5) { r(x, 12, 2, 20, '#a0a8d0'); r(x + 2, 14, 3, 6, '#5a6a7a'); }
  r(0, 18, 12, 18, '#c8c4bc'); h(18, 0, 11, '#e0dcd4'); r(1, 21, 9, 3, '#ffffff'); r(2, 22, 2, 1, '#2f74b8'); for (const x of [5, 7]) r(x, 22, 1, 1, '#333'); r(2, 26, 7, 10, '#4a5058');
  r(10, 32, 38, 4, '#9a9a96'); for (let x = 14; x < 48; x += 8) r(x, 33, 3, 3, '#5a6068');
  r(0, 36, 48, 12, '#4a4c50'); h(40, 0, 47, '#e8e8e8'); r(20, 38, 22, 2, '#a8a8a4');
});

spotSprites.osmN8096770911 = hiCanvas((r, h) => {
  r(6, 6, 20, 32, '#c8a878'); h(6, 6, 25, '#e0c898'); for (let y = 8; y < 38; y += 3) for (let x = 7 + (y % 2) * 2; x < 25; x += 4) r(x, y, 2, 1, '#a88858');
  r(26, 14, 8, 24, '#9a9690'); r(10, 10, 12, 3, '#ffffff'); r(11, 11, 3, 1, '#2f74b8'); r(15, 11, 6, 1, '#333');
  r(26, 18, 22, 2, '#e8eaec'); r(28, 20, 1, 18, '#c8c8c8'); r(46, 20, 1, 18, '#c8c8c8');
  for (let i = 0; i < 12; i++) h(26 + i, 34 + i, 47, i % 2 ? '#d8d8d4' : '#c0c0bc'); r(34, 24, 13, 1, '#e8e8e8');
  r(0, 38, 48, 10, '#b8b4ac'); for (let x = 0; x < 48; x += 4) r(x, 40, 2, 1, '#d8b860');
});

spotSprites.osmN8095176795 = hiCanvas((r, h) => {
  r(0, 8, 8, 4, '#b8bcc0'); r(1, 12, 5, 24, '#a8acb0'); r(0, 22, 48, 3, '#c8ccd0');
  spanRows(h, 6, [[10, 40], [10, 42], [10, 44]], '#9a9aa0'); r(10, 9, 36, 22, '#d8ccb4'); h(9, 10, 45, '#e8dcc4');
  for (let x = 13; x < 46; x += 4) { r(x, 9, 1, 22, '#4a8a5a'); r(x + 1, 11, 2, 18, '#bcae94'); }
  r(28, 26, 18, 3, '#e8eaec'); r(28, 29, 18, 7, '#5a6068'); r(30, 30, 6, 4, '#8aa0b0'); r(38, 30, 6, 4, '#8aa0b0'); r(12, 31, 14, 5, '#e8e4dc');
  r(0, 36, 48, 12, '#9a9a98'); for (let i = 0; i < 6; i++) r(4 + i * 6, 40 + (i % 2) * 3, 4, 1, '#f0f0f0');
});

spotSprites.osmN7814234031 = hiCanvas((r, h) => {
  spanRows(h, 12, [[12, 37], [9, 40], [8, 41]], '#3aa898'); h(15, 8, 41, '#2a8878'); r(9, 16, 32, 18, '#eef0f2'); r(9, 16, 32, 3, '#3aa898');
  r(18, 20, 14, 3, '#ffffff'); r(19, 21, 2, 1, '#2f74b8'); for (const x of [23, 25, 27, 29]) r(x, 21, 1, 1, '#333');
  r(12, 25, 6, 5, '#6f8fa8'); r(27, 25, 8, 9, '#3f4a52'); r(29, 26, 4, 3, '#8aa0b0'); r(9, 30, 32, 4, '#c8a888'); for (let x = 10; x < 41; x += 3) r(x, 31, 2, 1, '#a88868');
  r(0, 34, 48, 14, '#a8a49c'); for (let x = 1; x < 30; x += 4) { r(x, 37, 3, 3, '#3a3a3e'); r(x + 1, 36, 1, 1, '#6a6a6e'); r(x, 40, 1, 2, '#2a2a2e'); r(x + 2, 40, 1, 2, '#2a2a2e'); } h(44, 0, 47, '#d8b860');
});

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

spotSprites.osmN8095177153 = hiCanvas((r, h) => {
  r(4, 2, 16, 18, '#d8c8b8'); for (let y = 4; y < 19; y += 3) h(y, 5, 18, '#b8a898'); r(22, 6, 10, 14, '#e4d6c8'); for (let y = 8; y < 19; y += 3) h(y, 23, 31, '#c4b4a4');
  r(0, 18, 48, 4, '#9a9690'); h(18, 0, 47, '#b8b4ac'); h(21, 0, 47, '#6a665e'); r(0, 22, 48, 14, '#b8b2a8'); r(0, 22, 48, 3, '#a89060');
  r(22, 26, 12, 3, '#2f5fae'); r(23, 27, 6, 1, '#ffffff'); r(3, 28, 14, 8, '#f0f0ec'); r(5, 30, 4, 6, '#6f8fa8'); r(11, 30, 4, 6, '#6f8fa8'); r(36, 26, 10, 10, '#4a4e52'); r(38, 28, 3, 8, '#7a8a96');
  for (const x of [20, 34]) r(x, 22, 2, 14, '#8a867e'); r(0, 36, 48, 12, '#7a7a78'); h(37, 0, 47, '#9a9a96'); r(42, 30, 3, 6, '#d23a2e');
});

spotSprites.osmN8095191433 = hiCanvas((r, h) => {
  tealStation5(r, h, 18, 44, 8, 34, { sign: 22, door: 30, brick: '#c8b8a0' });
  r(20, 15, 22, 2, '#2f74b8'); spanRows(h, 30, [[2, 20], [2, 20], [2, 20], [2, 20]], '#c8c3b8'); for (let x = 3; x < 20; x += 3) r(x, 26, 1, 4, '#f4f4f4'); h(26, 2, 19, '#f4f4f4');
  crossing5(r, 8, 10); rails5(r, h, 38);
});

spotSprites.osmN8108665357 = hiCanvas((r, h) => {
  r(8, 2, 1, 32, '#8a8a88'); h(4, 6, 44, '#8a8a88'); r(42, 2, 1, 32, '#8a8a88');
  tealStation5(r, h, 16, 38, 12, 34, { door: 25, sign: 20 }); r(4, 22, 12, 12, '#f4f2ec'); spanRows(h, 19, [[5, 14], [4, 15], [3, 16]], '#8a8a8a');
  crossing5(r, 41, 18); for (let x = 1; x < 47; x += 3) r(x, 33, 1, 4, '#f4f4f4'); h(33, 0, 47, '#f4f4f4'); rails5(r, h, 39);
});

spotSprites.osmN8100472235 = hiCanvas((r, h) => {
  tealStation5(r, h, 4, 22, 10, 30, { door: 11 }); r(26, 18, 18, 3, TEAL5[1]); h(21, 26, 43, TEAL5[2]); for (const x of [27, 42]) r(x, 21, 1, 9, '#8a8a88');
  r(0, 30, 48, 5, '#b8b4ac'); h(30, 0, 47, '#f2c230'); crossing5(r, 24, 14); for (let x = 25; x < 46; x += 4) r(x, 26, 2, 1, x % 8 ? '#222' : '#f2c230');
  rails5(r, h, 37);
});

spotSprites.osmN8100472247 = hiCanvas((r, h) => {
  r(0, 22, 30, 10, '#d0342c'); for (let x = 2; x < 28; x += 4) r(x, 24, 3, 3, '#2b3440'); h(31, 0, 29, '#333');
  r(14, 14, 18, 18, '#c8c8c4'); r(16, 18, 6, 4, '#6f8fa8'); r(24, 18, 6, 4, '#6f8fa8'); h(14, 14, 31, '#a8a8a4');
  spanRows(h, 1, [[38, 38], [37, 39], [37, 40], [36, 40], [36, 41], [35, 41], [35, 41], [35, 42], [34, 42], [34, 42], [34, 42], [34, 41], [34, 41], [35, 41], [35, 40], [35, 40], [36, 40], [36, 39], [37, 39], [37, 39], [37, 38], [37, 38], [37, 38], [37, 38]], i => i % 3 ? '#c8d0d8' : '#e8eef4');
  r(36, 1, 1, 22, '#8a96a2'); r(32, 25, 12, 5, '#9a968c'); h(25, 32, 43, '#b8b4ac');
  r(0, 32, 48, 4, '#3f8a34'); h(32, 0, 47, '#5aa04a'); r(0, 36, 48, 12, '#8a8a88'); for (let x = 4; x < 48; x += 8) r(x, 41, 4, 1, '#d8d8d4');
});

spotSprites.osmN8100472245 = hiCanvas((r, h) => {
  r(28, 8, 14, 18, '#e8e4dc'); spanRows(h, 5, [[30, 39], [28, 41]], '#6a6a6a'); r(31, 12, 3, 4, '#6f8fa8'); r(36, 12, 3, 4, '#6f8fa8');
  r(2, 16, 26, 3, TEAL5[1]); h(15, 3, 26, TEAL5[0]); h(19, 2, 27, TEAL5[2]); for (const x of [4, 14, 25]) r(x, 20, 1, 10, '#8a8a88'); r(6, 23, 14, 5, '#5a6aa0'); r(7, 24, 12, 3, '#7a8ac0');
  r(0, 30, 48, 6, '#a8a49c'); h(30, 0, 47, '#f2c230'); for (let x = 1; x < 48; x += 3) r(x, 31, 1, 1, '#c8a830'); rails5(r, h, 38);
});

spotSprites.osmN8100472240 = hiCanvas((r, h) => {
  r(4, 10, 18, 20, '#f0eee8'); h(10, 4, 21, '#c8c4bc'); for (let y = 13; y < 26; y += 5) r(6, y, 14, 3, '#7a8ea0'); r(24, 14, 20, 16, '#e0dcd4'); r(26, 17, 6, 5, '#6f8fa8'); r(35, 17, 6, 5, '#6f8fa8');
  r(0, 22, 48, 2, '#8a8a88'); h(21, 0, 47, '#b8b8b4'); for (const x of [10, 30, 44]) r(x, 24, 1, 8, '#6a6a68');
  r(0, 30, 48, 6, '#a8a49c'); h(30, 0, 47, '#e8e4dc'); rails5(r, h, 38);
});

spotSprites.osmN8100472239 = hiCanvas((r, h) => {
  r(2, 12, 36, 24, '#f2f0ec'); h(12, 2, 37, '#d8d6d0'); for (let y = 16; y < 32; y += 6) { r(4, y, 32, 3, '#7a8ea0'); for (let x = 4; x < 36; x += 4) r(x, y, 1, 3, '#e8e8e4'); }
  r(30, 6, 14, 30, '#e8e6e0'); h(6, 30, 43, '#c8c6c0'); r(33, 9, 8, 4, '#2f74b8'); r(34, 10, 6, 1, '#ffffff');
  for (let i = 0; i < 10; i++) r(20 + i, 35 - i, 2, 1, '#b8b8b4'); h(25, 20, 30, '#d8d8d4');
  r(0, 36, 48, 4, '#c8c4bc'); r(0, 40, 48, 8, '#7a7a78'); for (let x = 4; x < 48; x += 8) r(x, 43, 4, 1, '#d8d8d4');
});

spotSprites.osmN8100472246 = hiCanvas((r, h) => {
  r(2, 6, 44, 3, '#8a8a88'); h(5, 2, 45, '#a8a8a4'); for (const x of [4, 44]) r(x, 9, 1, 25, '#7a7a78');
  tealStation5(r, h, 8, 44, 12, 36, { wall: '#ecdcd8', brick: '#b4aca0', sign: 30, door: 34 });
  r(9, 20, 10, 16, '#5a5a58'); for (let x = 10; x < 19; x += 2) r(x, 20, 1, 16, '#7a7a78'); r(21, 24, 4, 12, '#d23a2e'); r(22, 25, 2, 4, '#f4f4f4');
  r(0, 36, 48, 12, '#8a8a88'); h(36, 0, 47, '#a8a8a4'); for (let x = 2; x < 48; x += 9) r(x, 42, 5, 1, '#f4f4f4');
});

spotSprites.osmN8100472263 = hiCanvas((r, h) => {
  tealStation5(r, h, 4, 36, 10, 34, { sign: 12, door: 24, wall: '#f2f0ea' }); r(6, 22, 14, 8, '#d8d4cc'); r(8, 24, 4, 4, '#6f8fa8');
  r(30, 18, 16, 3, TEAL5[1]); h(21, 30, 45, TEAL5[2]); r(32, 22, 12, 12, '#d8d6d0');
  pix(r, ['..######..', '.########.', '##########', '##########', '##########'], 18, 30, '#3f7a34'); h(30, 21, 25, '#5a9a44');
  r(0, 35, 48, 13, '#a89a8a'); for (let x = 0; x < 48; x += 4) for (let y = 37; y < 48; y += 3) r(x + (y % 2) * 2, y, 3, 1, '#968878');
});

spotSprites.osmN8100472237 = hiCanvas((r, h) => {
  r(18, 0, 18, 24, '#8a8682'); for (let y = 2; y < 24; y += 3) { h(y, 18, 35, '#5a5652'); for (let x = 20; x < 35; x += 4) r(x, y + 1, 2, 1, '#c8c4bc'); }
  tealStation5(r, h, 4, 30, 16, 38, { wall: '#e8e2d8', brick: '#8a5a44', sign: 14, door: 22 }); r(5, 23, 7, 10, '#8a5a44');
  for (let x = 32; x < 47; x += 3) r(x, 30, 1, 8, '#e8e8e8'); h(30, 32, 46, '#e8e8e8'); r(0, 38, 48, 10, '#8a8a88');
});

spotSprites.osmN8100472234 = hiCanvas((r, h) => {
  r(24, 10, 18, 12, '#b8b4ac'); h(10, 24, 41, '#d0ccc4'); r(30, 13, 8, 3, '#ffffff'); h(14, 31, 37, '#3a9a4a');
  r(0, 20, 48, 3, TEAL5[1]); h(19, 0, 47, TEAL5[0]); h(23, 0, 47, TEAL5[2]); r(2, 24, 44, 12, '#ece8e0'); for (const x of [3, 15, 30, 44]) r(x, 24, 1, 12, '#a8a49c');
  r(6, 26, 7, 6, '#6f8fa8'); r(17, 26, 10, 10, '#3f4a52'); r(32, 26, 9, 6, '#6f8fa8'); for (let x = 2; x < 46; x += 3) r(x, 33, 1, 3, '#d8d8d4');
  r(0, 36, 48, 12, '#7a7a78'); for (let x = 3; x < 48; x += 8) r(x, 42, 5, 1, '#e8e8e8');
});

spotSprites.osmN8095098611 = hiCanvas((r, h) => {
  r(0, 20, 14, 10, '#d0342c'); for (let x = 1; x < 13; x += 4) r(x, 22, 3, 3, '#2b3440');
  for (let k = 0; k < 10; k++) h(8 + k, 24 - k * 2, 25 + k * 2, k % 3 ? '#7a6e62' : '#968a7c'); h(18, 4, 45, '#4a4038');
  r(8, 19, 34, 17, '#f0ece2'); for (const x of [8, 20, 29, 41]) r(x, 19, 1, 17, '#7a5a40'); h(19, 8, 41, '#7a5a40');
  r(18, 20, 14, 3, '#ffffff'); r(19, 21, 2, 1, '#2f74b8'); h(21, 22, 30, '#333'); r(21, 25, 8, 11, '#3f4a52'); r(10, 25, 7, 6, '#6f8fa8'); r(32, 25, 7, 6, '#6f8fa8');
  r(0, 36, 48, 12, '#b8b2a6'); h(36, 0, 47, '#c8c2b6');
});

spotSprites.osmN7774774734 = hiCanvas((r, h) => {
  r(0, 10, 48, 4, '#6a6e72'); h(10, 0, 47, '#8a8e92'); r(0, 14, 48, 20, '#a8a8a4'); h(14, 0, 47, '#b8b8b4');
  for (let x = 2; x < 46; x += 6) r(x, 17, 4, 4, '#4a5664'); r(16, 16, 12, 2, '#ffffff'); for (const x of [8, 22, 36]) r(x, 22, 2, 12, '#8a8a86');
  r(12, 26, 10, 8, '#3f4a52'); r(26, 26, 8, 8, '#3f4a52'); r(0, 34, 48, 14, '#6a6a68'); h(34, 0, 47, '#8a8a88'); pix(r, ['.#####.', '#######'], 38, 32, '#4a8a2a');
});

spotSprites.osmN7457793269 = hiCanvas((r, h) => {
  tileRoof(r, h, 8, [[14, 37], [12, 39], [10, 41], [8, 43], [6, 45], [5, 46], [4, 47]], ['#9a9ea6', '#6e737c', '#3e424a', '#5e636c']);
  r(8, 15, 36, 16, '#5a4a3c'); for (const x of [8, 16, 26, 35, 43]) r(x, 15, 1, 16, '#8a7058'); r(18, 18, 14, 13, '#2e2620');
  r(0, 31, 48, 17, '#d8d4c8');
  r(10, 14, 2, 26, '#5a4030'); r(36, 12, 2, 28, '#5a4030');
  for (const [x, y] of [[2, 10], [9, 6], [12, 13], [4, 18], [14, 21], [6, 25], [30, 6], [37, 3], [33, 13], [40, 11], [31, 20], [38, 22]]) { pix(r, ['..####..', '.######.', '########', '.######.'], x, y, '#2f6a3a'); h(y, x + 2, x + 5, '#4f8a4a'); } for (const [x, y] of [[10, 36], [26, 40], [34, 35], [16, 43]]) r(x, y, 3, 1, '#b8b4a8');
});

spotSprites.osmN9385135483 = hiCanvas((r, h) => {
  tileRoof(r, h, 12, [[6, 41], [4, 43], [2, 45], [1, 46]], ['#968a7a', '#746a5c', '#4a4238', '#665c50']);
  r(3, 16, 42, 16, '#e8dcc4'); for (const x of [6, 14, 32, 38]) r(x, 19, 5, 6, '#6f8fa8'); r(21, 19, 8, 13, '#3f4a52'); r(20, 16, 10, 3, '#ffffff'); h(17, 21, 28, '#3a7a5a');
  for (let x = 1; x < 46; x += 4) { r(x, 31, 4, 3, '#3f7a34'); r(x + 1, 30, 2, 2, x % 8 ? '#e85a8a' : '#f48aa8'); }
  r(0, 34, 48, 14, '#7a7a78'); spanRows(h, 38, [[34, 47], [30, 47], [27, 47]], '#e8e8e8');
});

spotSprites.osmN8241963496 = hiCanvas((r, h) => {
  r(2, 6, 14, 18, '#e8e8e4'); for (let y = 9; y < 22; y += 4) r(4, y, 10, 2, '#7a8ea0');
  for (let k = 0; k < 6; k++) h(14 + k, 22 - k * 2, 23 + k * 2, k % 2 ? '#7a7e84' : '#9a9ea4'); h(20, 10, 35, '#5a5e64'); r(12, 21, 22, 13, '#f0eee8'); r(19, 24, 7, 10, '#3f4a52'); r(13, 23, 5, 5, '#6f8fa8'); r(28, 23, 5, 5, '#6f8fa8');
  crossing5(r, 41, 14); for (const x of [2, 7, 30, 35]) { r(x, 35, 4, 4, '#3a3a3a'); r(x + 1, 36, 2, 2, '#8a8a8a'); h(34, x, x + 3, x % 3 ? '#3a6ac0' : '#c8c8c8'); }
  r(0, 39, 48, 9, '#8a8a88'); h(39, 0, 47, '#a8a8a4');
});

spotSprites.osmN8237565048 = hiCanvas((r, h) => {
  r(24, 22, 22, 12, '#e8e4dc'); spanRows(h, 19, [[26, 43], [24, 45], [23, 46]], '#8a7a6a'); r(28, 25, 5, 5, '#6f8fa8'); r(36, 25, 6, 9, '#3f4a52'); r(24, 30, 22, 4, '#c8a090');
  r(9, 2, 4, 6, '#7a6e60'); r(8, 4, 6, 3, '#7a6e60'); r(10, 1, 2, 1, '#9a8e80');
  r(7, 8, 8, 18, '#b8ae9c'); h(8, 7, 14, '#c8bfae'); r(7, 8, 2, 18, '#d0c8b8'); for (let y = 11; y < 24; y += 3) r(10, y, 2, 1, '#6a6050');
  spanRows(h, 26, [[5, 16], [4, 17], [3, 18], [2, 19], [2, 19]], i => i % 2 ? '#9a9080' : '#b0a694'); for (let i = 0; i < 4; i++) h(31 + i, 6 + i, 13 - i, '#8a8070');
  r(0, 34, 48, 14, '#6a6a68'); spanRows(h, 38, [[20, 47], [24, 47], [30, 47]], '#a8a8a4'); r(18, 42, 6, 1, '#f4f4f4');
});

spotSprites.osmN8241972430 = hiCanvas((r, h) => {
  tileRoof(r, h, 14, [[4, 43], [3, 44], [2, 45], [1, 46]], ['#8a8e94', '#6a6e74', '#3e4248', '#5a5e64']);
  r(2, 18, 44, 18, '#efede6'); h(18, 2, 45, '#c8c6c0');
  for (let k = 0; k < 6; k++) h(9 + k, 23 - k, 24 + k, '#c42a2a'); r(19, 11, 10, 4, '#efede6'); r(22, 12, 4, 2, '#2a2a2a');
  r(17, 15, 14, 3, '#3a3a3a'); r(18, 22, 12, 14, '#3a4650'); for (const x of [21, 24, 27]) r(x, 22, 1, 14, '#c8ccd0');
  for (const x of [4, 34]) { r(x, 22, 9, 7, '#6f8fa8'); h(22, x, x + 8, '#9fb8cc'); }
  r(5, 30, 2, 6, '#d23a2e'); r(38, 29, 4, 7, '#e8e8e8'); r(39, 30, 2, 3, '#3a6ac0');
  r(0, 36, 48, 6, '#9a9a96'); h(36, 0, 47, '#b8b8b4'); for (let x = 3; x < 48; x += 8) r(x, 39, 5, 1, '#f4f4f4');
});

spotSprites.osmN8241891774 = hiCanvas((r, h) => {
  r(6, 14, 24, 22, '#5a5e64'); h(13, 5, 30, '#3a3e44'); r(9, 17, 7, 8, '#2a2e34'); r(9, 17, 7, 2, '#ffffff'); r(10, 18, 5, 1, '#d23a2e');
  spanRows(h, 10, [[28, 36], [28, 39], [28, 42], [28, 45]], '#c8ccd0'); r(30, 14, 1, 22, '#8a8e94'); r(44, 14, 1, 22, '#8a8e94'); h(14, 28, 46, '#6a6e74');
  r(18, 22, 7, 14, '#f4f4f4'); r(19, 24, 5, 4, '#c8d8e8'); r(26, 22, 7, 14, '#f4f4f4'); r(26, 30, 7, 2, '#e88a2a'); r(27, 24, 5, 4, '#c8d8e8');
  r(0, 36, 48, 7, '#a8a8a4'); h(36, 0, 47, '#c8c8c4'); r(36, 31, 6, 5, '#4a4a4a'); r(37, 32, 4, 2, '#d23a2e');
});

spotSprites.osmN8241775866 = hiCanvas((r, h) => {
  r(28, 6, 18, 12, '#e8e8e4'); h(6, 27, 46, '#8a8e94'); r(30, 9, 5, 4, '#6f8fa8'); r(38, 9, 5, 4, '#6f8fa8'); r(26, 18, 22, 3, '#c8ccd0');
  for (let i = 0; i < 14; i++) { h(38 - i * 2, 8 + i, 22 + i, i % 2 ? '#9a9a96' : '#b8b8b4'); h(39 - i * 2, 8 + i, 22 + i, '#8a8a86'); }
  for (let i = 0; i < 14; i++) { r(7 + i, 33 - i * 2, 1, 6, '#5a5e64'); r(23 + i, 33 - i * 2, 1, 6, '#5a5e64'); }
  r(38, 21, 1, 20, '#5a5e64'); r(2, 26, 1, 16, '#4a4a4a'); r(0, 24, 5, 3, '#3a3a3a'); r(1, 25, 1, 1, '#e84040');
  r(0, 40, 48, 8, '#9a9a96'); r(34, 36, 10, 4, '#3a3a3a'); r(36, 34, 3, 2, '#3a3a3a'); r(41, 34, 3, 2, '#3a3a3a');
});

spotSprites.osmN8241775864 = hiCanvas((r, h) => {
  r(0, 10, 22, 3, '#8a8e94'); r(0, 13, 22, 4, '#c8ccd0'); for (const x of [4, 12, 20]) r(x, 17, 2, 14, '#a8a8a4');
  r(18, 8, 26, 22, '#f2f2ee'); h(8, 18, 43, '#c8ccd0'); h(9, 18, 43, '#a8acb0');
  for (let x = 21; x < 42; x += 5) r(x, 13, 3, 6, '#6f8fa8'); r(18, 23, 26, 3, '#d8dce0'); r(22, 26, 14, 8, '#3f4a52'); r(26, 24, 6, 2, '#2f6fb8');
  r(38, 26, 9, 8, '#e8e8e4'); r(0, 34, 48, 6, '#8a8a88'); h(34, 0, 47, '#a8a8a4');
  pix(r, ['..######', '.#######', '########', '########'], 40, 26, '#3f7a34');
});

spotSprites.osmN8241886323 = hiCanvas((r, h) => {
  r(0, 10, 40, 7, '#f0f0ec'); h(10, 0, 39, '#a8acb0'); h(16, 0, 39, '#8a8e94'); for (let x = 2; x < 39; x += 4) r(x, 12, 3, 3, '#7fa0c0');
  for (const x of [8, 30]) r(x, 17, 2, 20, '#c8ccd0');
  for (let i = 0; i < 11; i++) { h(17 + i * 2, 38 + Math.floor(i / 2), 46, '#d8d8d4'); h(18 + i * 2, 38 + Math.floor(i / 2), 46, '#a8a8a4'); } r(37, 10, 1, 30, '#8a8e94');
  r(14, 28, 14, 9, '#e8e8e4'); h(27, 13, 28, '#6a6e74'); r(18, 31, 6, 6, '#3f4a52');
  r(0, 37, 48, 4, '#b8b8b4'); r(0, 41, 48, 7, '#5a4d40'); h(42, 0, 47, '#9a9a9a'); h(45, 0, 47, '#9a9a9a');
});

spotSprites.osmN8241880205 = hiCanvas((r, h) => {
  for (let k = 0; k < 7; k++) h(6 + k, 24 - k, 25 + k, k ? '#7a4a3a' : '#5a3428'); r(21, 9, 8, 3, '#e8e0d0'); r(23, 10, 4, 1, '#3a3a3a');
  spanRows(h, 12, [[8, 41], [6, 43], [4, 45], [2, 47], [1, 47]], i => i % 2 ? '#7a4a3a' : '#8e5a46'); h(17, 1, 47, '#4a2a20');
  r(3, 18, 42, 18, '#3e2e26'); for (let x = 4; x < 45; x += 2) r(x, 18, 1, 18, '#4e3a30'); h(18, 3, 44, '#5a4436');
  for (const x of [6, 33]) { r(x, 22, 9, 8, '#c8d0d4'); r(x + 4, 22, 1, 8, '#3e2e26'); h(26, x, x + 8, '#3e2e26'); }
  r(19, 22, 10, 14, '#1e1612'); r(21, 24, 6, 4, '#c8d0d4');
  r(0, 36, 48, 7, '#9a9a96'); r(44, 30, 3, 6, '#3a6a3a');
});

spotSprites.osmW500212839 = hiCanvas((r, h) => {
  spanRows(h, 12, [[24, 35], [22, 37], [21, 38], [20, 39]], '#4a9a9a'); h(12, 26, 33, '#7acaca');
  r(2, 18, 44, 22, '#e8dcb0'); h(18, 2, 45, '#c8bc90');
  for (let x = 20; x < 44; x += 5) { r(x, 22, 3, 12, '#b8a878'); r(x, 21, 3, 1, '#b8a878'); }
  r(8, 6, 9, 34, '#a85a3a'); r(8, 6, 3, 34, '#c06a48'); for (let y = 9; y < 38; y += 3) h(y, 8, 16, '#8a4a30'); for (let y = 10; y < 34; y += 6) r(11, y, 3, 3, '#6f8fa8');
  spanRows(h, 2, [[10, 14], [9, 15], [8, 16]], '#6f9fe2'); r(10, 1, 4, 1, '#9fc0f0');
  r(22, 34, 18, 6, '#3f4a52'); r(0, 40, 48, 3, '#a8a49c'); pix(r, ['.####', '#####', '#####'], 43, 37, '#3f7a34');
});

spotSprites.osmW625806226 = hiCanvas((r, h) => {
  r(18, 10, 22, 8, '#d8d0c0'); h(10, 18, 39, '#b8b0a0'); spanRows(h, 7, [[22, 34], [20, 36]], '#a87050');
  r(0, 16, 48, 18, '#e4dccc'); h(16, 0, 47, '#c8c0b0'); h(24, 0, 47, '#d0c8b8'); for (let x = 3; x < 46; x += 7) r(x, 26, 4, 4, '#8a9aa8');
  for (const x of [8, 24, 38]) { r(x - 4, 22, 9, 7, '#3f7a34'); r(x - 3, 21, 7, 1, '#5a9a44'); r(x, 29, 1, 5, '#5a4030'); }
  r(0, 34, 48, 14, '#8a8a88'); for (let x = 3; x < 48; x += 6) r(x, 37, 1, 10, '#f4f4f4');
});

spotSprites.osmW675609772 = hiCanvas((r, h) => {
  for (let x = 0; x < 48; x++) { const y = Math.round(28 - 10 * Math.max(0, Math.sin((x - 6) / 40 * Math.PI)) - 3 * Math.max(0, Math.sin((x - 2) / 14 * Math.PI))); h(y, x, x, '#5a9a3a'); r(x, y + 1, 1, 34 - y, '#4a8a2e'); }
  for (let x = 14; x < 36; x++) { const t = (x - 14) / 22; r(x, Math.round(30 - 8 * Math.sin(t * Math.PI)), 1, 3, '#f4f4f0'); }
  r(14, 30, 22, 4, '#f4f4f0'); r(20, 30, 8, 4, '#3f4a52');
  r(0, 34, 48, 14, '#6aa84a'); spanRows(h, 38, [[18, 30], [16, 34], [14, 38], [12, 42]], '#b8b4a8');
  r(38, 18, 1, 16, '#6a6a6a'); r(41, 14, 1, 20, '#6a6a6a');
});

spotSprites.osmW627492620 = hiCanvas((r, h) => {
  r(36, 4, 10, 30, '#9a5040'); h(4, 36, 45, '#7a3a2a'); for (let y = 7; y < 32; y += 3) h(y, 36, 45, '#8a4434'); r(39, 8, 4, 5, '#3a3030');
  spanRows(h, 10, [[2, 37], [1, 37], [0, 37]], '#4a4a4e'); r(0, 13, 37, 25, '#a85a44');
  for (let y = 15; y < 38; y += 3) h(y, 0, 36, '#94503c'); for (let x = 0; x < 37; x += 6) r(x, 13, 2, 25, '#2e2a28'); h(13, 0, 36, '#2e2a28'); h(25, 0, 36, '#2e2a28');
  for (let x = 3; x < 34; x += 6) { r(x, 16, 2, 7, '#3a3a40'); r(x, 28, 2, 7, '#3a3a40'); }
  r(0, 38, 48, 10, '#c89a88'); h(38, 0, 47, '#b08070');
});

spotSprites.osmW521638240 = hiCanvas((r, h) => {
  r(2, 10, 44, 18, '#f0f0ee'); for (let x = 2; x < 46; x += 6) r(x, 10, 1, 18, '#c8c8c6'); h(10, 2, 45, '#d8d8d6'); r(30, 13, 10, 2, '#2a3a5a'); r(28, 13, 1, 2, '#2a3a5a');
  r(2, 28, 44, 8, '#1e2228'); for (let x = 4; x < 46; x += 4) r(x, 29, 1, 6, '#3a4250'); r(40, 4, 6, 24, '#c8ccd0');
  r(0, 36, 48, 4, '#c84a3a'); r(0, 37, 48, 1, '#3f7a34'); r(0, 40, 48, 8, '#8a8a88'); r(12, 30, 1, 18, '#5a5a5a');
});

spotSprites.osmW687980267 = hiCanvas((r, h) => {
  tileRoof(r, h, 6, [[12, 35], [10, 37], [8, 39], [6, 41], [5, 42]], ['#9aa8a0', '#6a7a72', '#3e4a44', '#5a6a62']);
  for (let x = 16; x <= 31; x++) { const y = Math.round(10 - 3 * Math.sin((x - 16) / 15 * Math.PI)); r(x, y, 1, 2, '#e8e4dc'); }
  r(18, 9, 12, 3, '#d8d0c0'); r(22, 6, 4, 2, '#c8a040');
  r(8, 11, 32, 14, '#8a3a2e'); r(14, 13, 20, 12, '#5a2a20'); for (let x = 15; x < 34; x += 3) r(x, 13, 1, 12, '#a85040'); h(11, 8, 39, '#e8e0d0');
  r(4, 25, 40, 6, '#e8e4dc'); for (let x = 6; x < 43; x += 4) r(x, 25, 1, 6, '#b8b4ac'); spanRows(h, 31, [[16, 31], [15, 32], [14, 33]], '#c8c4bc');
  for (const x of [0, 43]) { r(x + 1, 14, 3, 2, '#a8a49a'); r(x, 16, 5, 3, '#a8a49a'); r(x + 1, 17, 3, 1, '#f2d27a'); r(x + 1, 19, 3, 12, '#a8a49a'); }
  r(0, 34, 48, 14, '#c8c4b8'); for (const [x, y] of [[4, 38], [16, 42], [30, 39], [40, 44]]) r(x, y, 2, 1, '#a8a49c');
});

spotSprites.osmW736671941 = hiCanvas((r, h) => {
  tileRoof(r, h, 8, [[12, 35], [9, 38], [7, 40], [5, 42], [3, 44], [2, 45]], ['#8a8e94', '#64686e', '#33363a', '#50545a']);
  for (let k = 0; k < 4; k++) h(5 + k, 23 - k, 24 + k, k ? '#d8d4cc' : '#33363a'); r(22, 3, 4, 2, '#5a5e64');
  r(5, 14, 38, 16, '#3a2a22'); for (const x of [5, 13, 23, 33, 42]) r(x, 14, 1, 16, '#6a4a36'); r(16, 17, 16, 13, '#2a1e18'); for (let x = 17; x < 32; x += 2) r(x, 17, 1, 13, '#4a3a2e');
  r(22, 15, 4, 2, '#c8a040'); h(30, 2, 45, '#d8d4c8'); r(3, 31, 42, 4, '#c8c4b8'); spanRows(h, 35, [[16, 31], [15, 32], [14, 33]], '#b8b4a8');
  r(0, 38, 48, 10, '#9a9690'); pix(r, ['..###.', '.#####', '######', '######'], 40, 22, '#3f7a34');
});

spotSprites.osmW737526485 = hiCanvas((r, h) => {
  tileRoof(r, h, 6, [[13, 34], [11, 36], [9, 38], [7, 40], [5, 42], [3, 44], [2, 45], [1, 46]], ['#a8acb4', '#7c8088', '#40444a', '#62666e']);
  for (let k = 0; k < 4; k++) h(3 + k, 23 - k, 24 + k, k ? '#e8e4dc' : '#40444a');
  r(5, 14, 38, 16, '#f0ece2'); for (const x of [5, 12, 20, 27, 35, 42]) r(x, 14, 1, 16, '#6a4a36'); h(14, 5, 42, '#6a4a36'); h(20, 5, 42, '#6a4a36');
  r(15, 21, 18, 9, '#3a2e26'); for (let x = 16; x < 33; x += 2) r(x, 21, 1, 9, '#5a4a3a');
  h(30, 3, 44, '#c8c4b8'); r(4, 31, 40, 3, '#a8a49c'); for (let y = 34; y < 48; y++) h(y, 19 - (y - 34) / 2 | 0, 28 + (y - 34) / 2 | 0, y % 2 ? '#c8c4b8' : '#b8b4a8');
  for (const x of [0, 2]) { pix(r, ['.#####.', '#######', '.#####.'], x, 26 + x * 2, '#2f6a3a'); } r(3, 30, 1, 10, '#6a4a30');
});

spotSprites.osmW670221425 = hiCanvas((r, h) => {
  tileRoof(r, h, 4, [[10, 37], [8, 39], [6, 41], [5, 42]], ['#7c8088', '#5a5e64', '#2e3034', '#484c52']);
  r(7, 8, 34, 12, '#2e2c2c'); r(22, 9, 14, 8, '#e8d8d4'); for (let x = 9; x < 21; x += 3) r(x, 8, 1, 12, '#3e3c3c'); r(25, 11, 8, 4, '#3a3a40'); for (let x = 26; x < 33; x += 2) r(x, 11, 1, 4, '#8a8a90');
  tileRoof(r, h, 20, [[3, 44], [2, 45], [1, 46]], ['#7c8088', '#5a5e64', '#2e3034', '#484c52']);
  r(3, 23, 42, 15, '#3a3632'); for (let x = 4; x < 44; x += 2) r(x, 23, 1, 15, '#4a4642'); r(26, 25, 14, 8, '#e8e4dc'); r(29, 26, 8, 6, '#3a3a40'); r(8, 26, 10, 12, '#6a5040');
  pix(r, ['..####..', '.######.', '########', '.######.', '..####..'], 0, 26, '#2f6a3a'); r(4, 31, 1, 9, '#5a4030');
  r(0, 38, 48, 10, '#9a9690');
});

spotSprites.osmW848881120 = hiCanvas((r, h) => {
  tileRoof(r, h, 6, [[12, 35], [10, 37], [8, 39], [6, 41], [5, 42], [4, 43]], ['#8a8e94', '#62666c', '#33363a', '#4e5258']);
  for (let k = 0; k < 4; k++) h(3 + k, 23 - k, 24 + k, k ? '#d8d4cc' : '#33363a');
  r(7, 12, 34, 16, '#4a362c'); for (const x of [7, 15, 23, 32, 40]) r(x, 12, 1, 16, '#6a4e3a'); r(16, 15, 16, 13, '#2e221a'); for (let x = 17; x < 32; x += 3) r(x, 15, 1, 13, '#5a4434'); r(20, 16, 8, 3, '#e8e4dc');
  for (let i = 0; i < 6; i++) h(28 + i * 2, 15 - i, 32 + i, i % 2 ? '#a8a49a' : '#c8c4bc');
  for (const x of [2, 38]) { r(x, 28, 8, 12, '#b8b4ac'); for (let y = 29; y < 40; y += 3) h(y, x, x + 7, '#9a968e'); r(x + 2, 24, 4, 4, '#8a867e'); r(x + 3, 23, 2, 1, '#8a867e'); }
  r(0, 40, 48, 8, '#b8b0a0'); for (const [x, y] of [[5, 43], [20, 45], [34, 42]]) r(x, y, 3, 1, '#9a9488');
});




const GEN = window.NISHIO_LANDMARK_GEN || {};
const genCache = new Map();
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f));
  return '#' + c.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
};
const roofOf = c => [shade(c, 1.35), c, shade(c, 0.55), shade(c, 0.8)];
const STONE = '#a8a49a', PATH = '#c8c3b8';
function genTorii(r, h, x0, x1, y, col, tall = 16) {
  h(y, x0, x1, col); h(y + 1, x0 + 1, x1 - 1, col); r(x0, y - 1, 1, 1, col); r(x1, y - 1, 1, 1, col); h(y + 4, x0 + 3, x1 - 3, col);
  r(x0 + 4, y + 2, 2, tall, col); r(x1 - 5, y + 2, 2, tall, col); r(x0 + 4, y + 2, 1, tall, shade(col, 1.25));
}
function genLantern(r, x, y) { r(x + 1, y, 2, 1, STONE); r(x, y + 1, 4, 2, STONE); r(x + 1, y + 2, 2, 1, '#f2d27a'); r(x + 1, y + 3, 2, 5, STONE); r(x, y + 8, 4, 1, '#8a857a'); }
function genHall(r, h, x0, x1, y0, roof, wall, opt = {}) {
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
  shrine(r, h, v, [roof, wall, acc]) {
    const RC = v % 3 === 1 ? roofOf('#5f9e8a') : roofOf(roof);
    if (v === 3) {
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
  temple(r, h, v, [roof, wall, acc]) {
    const RC = roofOf(roof), right = v === 1 ? 33 : 45;
    const by = genHall(r, h, 2, right, 9, RC, wall, { rows: 11, body: 16, gable: v !== 3 });
    h(by, 1, right + 1, STONE); h(by + 1, 3, right - 1, '#8a857a');
    if (v === 1) { tileRoof(r, h, 12, [[36, 44], [35, 45], [34, 46]], RC); r(35, 15, 1, 15, '#5b4632'); r(45, 15, 1, 15, '#5b4632'); r(38, 17, 5, 6, '#5f7a62'); h(23, 38, 42, '#3a5a44'); }
    if (v === 2) { tileRoof(r, h, 37, [[12, 35], [10, 37], [9, 38]], RC); r(12, 40, 2, 8, '#6a4a30'); r(34, 40, 2, 8, '#6a4a30'); r(14, 41, 20, 7, '#2a2018'); }
    if (v === 3) { for (const [x, y] of [[0, 30], [4, 26], [0, 22]]) { pix(r, PINE, x, y, '#2f6a3a'); h(y, x + 2, x + 4, '#4f8a4a'); } r(3, 33, 1, 10, '#6a4a30'); }
    if (v !== 2) for (let y = 42; y < 48; y++) h(y, 20 - (y - 42), 27 + (y - 42), y % 2 ? PATH : '#b8b2a6');
  },
  station(r, h, v, [roof, wall, acc]) {
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
  castle(r, h, v, [roof, wall, acc]) {
    for (let y = 28; y < 46; y++) { const k = (y - 28) >> 1; h(y, 6 - k, 41 + k, (y % 3) ? '#9b968a' : '#7a756b'); }
    for (let x = 6; x < 42; x += 6) r(x + ((x / 6) % 2) * 3, 29, 1, 16, '#6f6a61');
    if (v % 2 === 0) { tileRoof(r, h, 10, [[14, 33], [12, 35], [10, 37], [9, 38]], roofOf(roof)); r(12, 14, 24, 14, wall); r(12, 22, 24, 6, '#2d2d2c'); r(16, 16, 3, 3, '#3a3a3a'); r(29, 16, 3, 3, '#3a3a3a'); }
    else { r(20, 10, 8, 18, STONE); h(10, 20, 27, '#c8c4bc'); for (let y = 12; y < 26; y += 3) r(23, y, 2, 2, '#4a4a48'); r(16, 26, 16, 2, '#8a857a'); pix(r, PINE, 33, 12, '#2f6a3a'); r(36, 15, 1, 13, '#6a4a30'); }
  },
  public(r, h, v, [roof, wall, acc]) {
    if (v === 0) { r(5, 8, 38, 32, wall); h(8, 5, 42, shade(wall, 1.15)); for (let y = 12; y < 34; y += 6) { r(8, y, 32, 3, acc); for (let x = 8; x < 40; x += 5) r(x, y, 1, 3, shade(wall, 1.1)); } r(18, 34, 12, 6, '#3f4a52'); }
    else if (v === 1) { r(2, 20, 44, 20, wall); h(20, 2, 45, shade(wall, 1.2)); h(21, 2, 45, roof); for (let x = 5; x < 44; x += 6) r(x, 26, 4, 8, acc); r(17, 28, 14, 12, '#3f4a52'); r(14, 26, 20, 2, shade(wall, 0.7)); }
    else if (v === 2) { r(4, 18, 40, 22, wall); h(18, 4, 43, shade(wall, 1.15)); r(18, 4, 12, 14, wall); r(21, 7, 6, 6, '#f4f4f0'); r(23, 9, 2, 1, '#333'); r(24, 8, 1, 2, '#333'); h(4, 17, 30, roof); for (let x = 7; x < 42; x += 5) r(x, 23, 3, 4, acc); for (let x = 7; x < 42; x += 5) r(x, 30, 3, 4, acc); r(19, 33, 10, 7, '#3f4a52'); }
    else { tileRoof(r, h, 10, [[10, 37], [8, 39], [6, 41], [4, 43], [3, 44]], roofOf(roof)); r(6, 15, 36, 25, wall); for (let x = 9; x < 40; x += 6) r(x, 19, 4, 6, acc); r(18, 29, 12, 11, '#3f4a52'); }
    r(0, 40, 48, 3, '#a2a29f'); h(43, 0, 47, '#8a8a88');
  },
  historic(r, h, v, [roof, wall, acc]) {
    if (v === 0) { r(19, 8, 10, 26, STONE); h(8, 19, 28, '#c8c4bc'); r(19, 8, 2, 26, '#c0bcb2'); for (let y = 11; y < 31; y += 3) r(23, y, 2, 2, '#4a4a48'); r(14, 34, 20, 3, '#8a857a'); for (let x = 8; x < 41; x += 4) r(x, 36, 1, 6, '#6a4a30'); h(37, 8, 40, '#6a4a30'); }
    else if (v === 1) { spanRows(h, 14, [[18, 29], [14, 33], [11, 36], [8, 39], [6, 41], [4, 43], [3, 44], [2, 45], [1, 46], [0, 47], [0, 47], [0, 47]], i => i % 3 ? '#5a8a3a' : '#6fa04a'); for (const [x, y] of [[16, 12], [24, 11], [31, 13]]) { r(x, y, 4, 4, '#2f6a2a'); r(x + 1, y + 4, 1, 2, '#5a4030'); } r(21, 30, 6, 6, STONE); }
    else if (v === 2) { tileRoof(r, h, 10, [[10, 37], [8, 39], [7, 40], [6, 41]], roofOf(roof)); r(10, 14, 3, 26, '#6a4a30'); r(35, 14, 3, 26, '#6a4a30'); r(13, 16, 22, 24, '#3a2a1a'); r(13, 16, 22, 2, '#5a4030'); r(23, 16, 2, 24, '#4a3624'); for (const x of [2, 40]) r(x, 22, 6, 18, wall); h(22, 2, 7, roof); h(22, 40, 45, roof); }
    else { tileRoof(r, h, 12, [[6, 41], [4, 43], [2, 45], [1, 46]], roofOf(roof)); r(3, 16, 42, 22, wall); for (let x = 4; x < 44; x += 3) r(x, 26, 1, 12, shade(wall, 0.7)); h(26, 3, 44, shade(wall, 0.6)); r(18, 28, 10, 10, '#2e2620'); r(6, 18, 8, 5, '#c8b890'); r(34, 18, 8, 5, '#c8b890'); }
    r(0, 42, 48, 6, '#b8b2a6');
  },
  view(r, h, v, [roof, wall, acc]) {
    if (v === 0) { r(20, 6, 8, 4, wall); h(10, 17, 30, shade(wall, 0.7)); r(21, 11, 6, 26, wall); r(22, 13, 4, 3, '#6f8fa8'); r(22, 20, 4, 3, '#6f8fa8'); r(14, 37, 20, 4, STONE); spanRows(h, 41, [[6, 41], [3, 44], [1, 46], [0, 47], [0, 47], [0, 47], [0, 47]], '#4f8a3a'); }
    else if (v === 1) { r(20, 6, 8, 7, acc); r(18, 13, 12, 14, acc); r(18, 13, 3, 14, shade(acc, 1.3)); r(20, 27, 3, 6, acc); r(25, 27, 3, 6, acc); r(14, 33, 20, 12, STONE); h(33, 14, 33, '#c8c4bc'); }
    else if (v === 2) { spanRows(h, 30, [[8, 39], [4, 43], [2, 45], [2, 45], [4, 43], [8, 39]], '#4f8fbf'); h(31, 10, 20, '#8cc0e0'); for (const [x, y] of [[2, 18], [36, 16], [20, 14]]) { pix(r, PINE, x, y, '#2f6a3a'); h(y, x + 2, x + 4, '#4f8a4a'); r(x + 3, y + 3, 1, 8, '#6a4a30'); } tileRoof(r, h, 18, [[26, 34], [25, 35]], roofOf(roof)); r(26, 20, 9, 6, wall); }
    else { r(6, 4, 36, 26, '#3f7a34'); r(10, 6, 12, 8, '#5a9a44'); r(26, 12, 12, 8, '#5a9a44'); r(21, 28, 6, 16, '#6a4a30'); r(19, 38, 10, 6, '#5a3e28'); r(12, 30, 3, 2, '#e8dcc0'); h(31, 12, 36, '#e8dcc0'); }
  },
  church(r, h, v, [roof, wall, acc]) {
    r(21, 2, 2, 7, '#e8e4dc'); r(19, 4, 6, 2, '#e8e4dc'); spanRows(h, 9, [[20, 23], [19, 24], [18, 25], [17, 26]], roof); r(17, 13, 10, 27, wall);
    for (let k = 0; k < 8; k++) h(18 + k, 26 - k, 47, k ? shade(roof, 1.1) : roof); r(27, 26, 18, 14, wall); for (const x of [30, 36, 41]) { r(x, 29, 3, 6, acc); r(x + 1, 28, 1, 1, acc); }
    r(19, 30, 6, 10, '#3a2a1a'); r(20, 18, 4, 5, acc); r(0, 40, 48, 3, '#a2a29f');
  },
};

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




const GIANT_ART = { 'f-nishio-castle': 'nishio-castle', 'f-okazaki-castle': 'okazaki-castle', 'f-iwase-bunko': 'iwase-bunko', 'f-konrenji': 'konrenji',
  'f-nishio-station': 'nishio-station', 'f-jofukuji': 'daibutsu', 'f-ohirune-house': 'ohirune', 'f-kurokabe': 'kurokabe', 'f-inariyama-chaen': 'chaen' };

GIANT_ART['f-ricepia'] = 'ricepia';
GIANT_ART['f-kondo-beikoku'] = 'kondo';

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


['hekinan-saihoji', 'hekinan-aoi-park', 'takahama-ningyo-koji'].forEach(n => { GIANT_ART['f-' + n] = n; });

let giantIds = null;
afterLoad(() => fetch('nishio-go/art/giant/list.json').then(r => (r.ok ? r.json() : null)).then(j => { giantIds = new Set((j && j.ids) || []); dirty = true; }).catch(() => { giantIds = new Set(); }));
const giants = {};

let shomaiImg = null;
function shomaiArt() {
  if (shomaiImg === null) {
    shomaiImg = 'loading';
    const img = new Image();
    img.onload = () => { shomaiImg = img; dirty = true; };
    img.onerror = () => { setTimeout(() => { shomaiImg = null; }, 15000); };
    img.src = 'nishio-go/art/shomai-cute.png';
  }
  return shomaiImg === 'loading' ? null : shomaiImg;
}


let giantSize = null, giantSizeKey = '';
function giantTiles(s) {
  const spots = G.spots || [];
  const ver = (G.spotsVersion || 0) + ':' + spots.length + ':' + (giantIds ? giantIds.size : 0);
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


let prIds = null;
afterLoad(() => fetch('nishio-go/art/pr/list.json').then(r => (r.ok ? r.json() : null)).then(j => { prIds = new Set(((j && j.items) || []).filter(x => x.views.includes(0)).map(x => x.id)); dirty = true; }).catch(() => { prIds = new Set(); }));
const prTime = () => { const hr = new Date(Date.now() + 9 * 3600000).getUTCHours(); return hr >= 5 && hr < 10 ? 0 : hr >= 10 && hr < 16 ? 1 : hr >= 16 && hr < 19 ? 2 : 3; };
function giantOf(s, load = true) {
  if (prIds && prIds.has(s.id)) return giantImg(`../pr/${s.id}/0-${mapSeason()}-${prTime()}`, load);
  const n = GIANT_ART[s.id] || (giantIds && giantIds.has(s.id) ? s.id : null);
  return n ? giantImg(n, load) : null;
}
function giantImg(n, load = true) {
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
    img.onerror = () => { setTimeout(() => { delete giants[n]; }, 15000); };
    img.src = `nishio-go/art/giant/${n}.png`;
  }
  return giants[n] === 'loading' ? null : giants[n];
}


const giantPois = new Map();
afterLoad(() => fetch('nishio-go/art/giant/poi.json').then(r => (r.ok ? r.json() : null)).then(j => {
  for (const [id, kind, name, x, y] of (j && j.items) || []) { const k = kind + '|' + name; if (!giantPois.has(k)) giantPois.set(k, []); giantPois.get(k).push([id, x, y]); }
  poiCache.key = ''; dirty = true;
}).catch(() => {  }));
function giantPoiOf(p) {
  if (p.g === undefined && giantPois.size) {
    const c = (giantPois.get(p[2] + '|' + p[3]) || []).find(q => Math.abs(q[1] - p[0]) < 3 && Math.abs(q[2] - p[1]) < 3);
    p.g = c ? c[0] : '';
  }
  return p.g || '';
}
const spriteOf = s => (!LANDMARK_ART[s.id] && !s.featured && GEN[s.id] && genSprite(s.id)) || spotSprites[spotArt(s)];
function collectedOf(s, visits) { return !!(s && s.id && visits && visits[s.id]); }
function drawCollectedMark(sx, sy, size, dpr, ring) {
  ctx.save();
  if (ring) {
    const rr = size * 0.58, rx = sx + size / 2, ry = sy + size / 2, lw = Math.max(2, Math.round(dpr * 2));
    ctx.lineWidth = lw + Math.max(2, Math.round(dpr * 2)); ctx.strokeStyle = 'rgba(26,26,26,.75)'; ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(255,213,79,.9)'; ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.stroke();
  }
  const r = Math.min(Math.max(3 * dpr, size * 0.18), 15 * dpr), cx = Math.round(sx + size - r * 0.6), cy = Math.round(sy + r * 0.6);
  ctx.fillStyle = '#000'; ctx.fillRect(cx - r - dpr, cy - r - dpr, r * 2 + 2 * dpr, r * 2 + 2 * dpr);
  ctx.fillStyle = '#ffd54f'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.fillStyle = '#000'; ctx.font = `${Math.round(r * 1.8)}px "DotGothic16", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✓', cx, cy + dpr * 0.5);
  ctx.restore();
}

function roadShapeOf(mask) {
  const m = mask & 15, n = (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
  if (n >= 4) return 'cross';
  if (n === 3) return 'tee';
  if (n === 2) return (m === 5 || m === 10) ? 'straight' : 'curve';
  if (n === 1) return 'end';
  return 'none';
}

function roadShapeCorner(mask) {
  const m = mask & 15;
  return m === 3 ? [1, -1] : m === 6 ? [1, 1] : m === 12 ? [-1, 1] : m === 9 ? [-1, -1] : null;
}

function roadShapeMissing(mask) {
  if (typeof mask !== 'number' || !Number.isInteger(mask) || mask < 0 || mask > 15) return null;
  if (roadShapeOf(mask) !== 'tee') return null;
  const m = 15 & ~mask;
  return m === 1 ? [0, -1] : m === 2 ? [1, 0] : m === 4 ? [0, 1] : m === 8 ? [-1, 0] : null;
}

function roadShapeEndDir(mask) {
  if (typeof mask !== 'number' || !Number.isInteger(mask) || mask < 0 || mask > 15) return null;
  if (roadShapeOf(mask) !== 'end') return null;
  return mask === 1 ? [0, -1] : mask === 2 ? [1, 0] : mask === 4 ? [0, 1] : mask === 8 ? [-1, 0] : null;
}

function roadShapeStraightDir(mask) {
  if (typeof mask !== 'number' || !Number.isInteger(mask) || mask < 0 || mask > 15) return null;
  if (roadShapeOf(mask) !== 'straight') return null;
  return mask === 10 ? [1, 0] : mask === 5 ? [0, 1] : null;
}

function drawRoadShape(X, Y, T, mask) {
  const shape = roadShapeOf(mask);
  if (shape === 'none') return;
  ctx.save();
  ctx.fillStyle = 'rgba(255,244,200,.45)';
  ctx.beginPath();
  if (shape === 'straight') {
    const [dx, dy] = roadShapeStraightDir(mask) || [1, 0], len = T * 0.44, th = Math.max(1, T * 0.07);
    ctx.beginPath(); ctx.rect(X, Y, T, T); ctx.clip();
    if (dx) ctx.fillRect(X + T / 2 - len / 2, Y + T / 2 - th / 2, len, th); else ctx.fillRect(X + T / 2 - th / 2, Y + T / 2 - len / 2, th, len);
  } else if (shape === 'end') {
    const [dx, dy] = roadShapeEndDir(mask) || [0, 0];
    ctx.beginPath(); ctx.rect(X, Y, T, T); ctx.clip();
    ctx.strokeStyle = 'rgba(255,244,200,.45)'; ctx.lineWidth = Math.max(1, T * 0.07);
    ctx.beginPath();
    ctx.arc(X + T / 2 + dx * T * 0.08, Y + T / 2 + dy * T * 0.08, T * 0.16, 0, Math.PI * 2);
    ctx.stroke();
  } else if (shape === 'curve') {
    const [dx, dy] = roadShapeCorner(mask);
    ctx.beginPath(); ctx.rect(X, Y, T, T); ctx.clip();
    ctx.beginPath();
    ctx.arc(X + (dx > 0 ? T : 0), Y + (dy > 0 ? T : 0), T * 0.28, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.arc(X + T / 2, Y + T / 2, T * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,90,40,.35)';
    ctx.beginPath();
    ctx.arc(X + T / 2, Y + T / 2, Math.max(1, T * 0.05), 0, Math.PI * 2);
    ctx.fill();
    const miss = shape === 'tee' ? roadShapeMissing(mask) : null;
    if (miss) {
      const [mx, my] = miss, th = Math.max(1, T * 0.07), len = T * 0.4;
      ctx.beginPath(); ctx.rect(X, Y, T, T); ctx.clip();
      ctx.fillStyle = 'rgba(255,244,200,.45)';
      const cx = X + T / 2 + mx * (T / 2 - th * 1.5), cy = Y + T / 2 + my * (T / 2 - th * 1.5);
      if (mx === 0) ctx.fillRect(cx - len / 2, cy - th / 2, len, th); else ctx.fillRect(cx - th / 2, cy - len / 2, th, len);
    }
  }
  ctx.restore();
}

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

  let k = SPOT_KIND[kind] || 'sight';
  if (k === 'park') {
    if (s.pk === undefined) { let h = 0; for (const ch of s.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; s.pk = h % 4; }
    k = 'park' + s.pk;
  }
  return spotSprites[k] ? k : 'chest';
}
const SPOT_KIND = { park: 'park', historic: 'historic', view: 'view', sight: 'sight', art: 'art', beach: 'beach', museum: 'museum' };

const bigOf = (s, load = true) => (giantTiles(s) >= 6 ? giantOf(s, load) : null);



const sprW = spr => spr.size || spr[0].width;
const spotSize = (s, spr, T) => sprW(spr) * T / 16 * (s.shop && sprW(spr) <= 48 ? 2 : 1);

const bigHero = { x: null, y: null };

const HERO_GIANT_RANGE = 18;
let heroGiantId = null;
function pickHeroGiant(list, hx, hy) {
  if (hx === null || hy === null || hx === undefined || hy === undefined) return null;
  let best = null, bd = Infinity;
  for (const s of list || []) {
    if (!(s.featured || s.shop) || !(GIANT_ART[s.id] || (giantIds && giantIds.has(s.id)))) continue;
    const q = toTile(s.lat, s.lng), d = Math.hypot(q.x - hx, q.y - hy);
    if (d <= HERO_GIANT_RANGE && d < bd) { best = s; bd = d; }
  }
  return best;
}
const bigSpotSize = (s, spr, T, giant) => {
  const base = spotSize(s, spr, T), B = window.nishioBigLandmark;
  if (!B || bigHero.x === null || mazeOn() || !B.isBig(s)) return base;

  if (giant && !B.giantScaleFor) return base;
  const p = toTile(s.lat, s.lng);
  const d = Math.hypot(p.x - bigHero.x, p.y - bigHero.y);
  return base * (giant ? B.giantScaleFor(d) : B.scaleFor(d));
};


const view = $('pxView'), cv = $('pxCanvas'), ctx0 = cv.getContext('2d');

let ctx = ctx0, rec = null;


function fieldT(dpr) {
  const cw = cv.clientWidth || 390, ch = cv.clientHeight || 780;
  return 16 * Math.max(1, Math.round(Math.min(cw / 160, ch / 144) * dpr * curScale() / 2));
}

const dotSize = (img, T) => img.width * T / 16;
const RICE_BIG = 1.45;


const GB_COLS = ['#e0f8d0', '#88c070', '#346856', '#081820'];
const GB_RGB = GB_COLS.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));
let gbOn = false;
try { gbOn = localStorage.getItem('nsg_gb') === '1'; } catch (e) {  }
const gbLum = (r, g, b) => (0.3 * r + 0.59 * g + 0.11 * b) / 255;
const gbAbs = L => (L > 0.62 ? 0 : L > 0.42 ? 1 : L > 0.2 ? 2 : 3);
const gbSpr = L => (L > 0.8 ? 0 : L > 0.55 ? 1 : L > 0.25 ? 2 : 3);
const gbCache = new WeakMap();
function gbOf(src) {
  const hit = gbCache.get(src);
  if (hit) return hit;
  const w = src.width, h = src.height;
  if (!w || !h || (src.complete === false)) return src;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.drawImage(src, 0, 0);
  const d = x.getImageData(0, 0, w, h), p = d.data, cnt = new Map();
  let opaque = 0, bg = 0, most = 0;
  for (let i = 0; i < p.length; i += 4) if (p[i + 3] > 128) { const k = p[i] << 16 | p[i + 1] << 8 | p[i + 2], n = (cnt.get(k) || 0) + 1; cnt.set(k, n); opaque++; if (n > most) { most = n; bg = k; } }

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
const gbColor = (() => {
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
let gbPause = 0;
{
  const gbField = () => gbOn && !worldMode && !gbPause;
  const draw0 = ctx0.drawImage;
  ctx0.drawImage = function (src, ...a) { return draw0.call(this, gbField() && src.width <= 512 ? gbOf(src) : src, ...a); };
  for (const prop of ['fillStyle', 'strokeStyle']) {
    const pd = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, prop);
    Object.defineProperty(ctx0, prop, { get() { return pd.get.call(this); }, set(v) { pd.set.call(this, gbField() && typeof v === 'string' ? gbColor(v) : v); } });
  }
}
let active = false, raf = 0, dirty = true, scale = 2, mzScale = 1;
const FLOAT_PX = 16;
let floatPx = 0;
let floatShift = [0, 0];
const floaters = [], floatDrawn = [];
const FLOAT_GAP = 1250;
let floatLast = -1e9;
let floatQEnd = 0;

let cover = 0, fieldCy = 0;
const tapS = { path: [], timer: null, goal: null, due: 0 };
function updateCover() {
  const sh = $('sheet'), cr = cv.getBoundingClientRect(), sr = sh ? sh.getBoundingClientRect() : null;
  cover = sr && sr.height ? Math.max(0, Math.min(cr.height * 0.6, cr.bottom - sr.top)) : 0;
}
if (window.ResizeObserver && $('sheet')) new ResizeObserver(updateCover).observe($('sheet'));
window.addEventListener('resize', updateCover);


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




const riceBub = { at: 0, until: 0 };
function riceSay(t, ms = 1400, mood = '') {
  const now = performance.now();
  Object.assign(riceBub, { at: now, until: now + ms });
  if (mood === 'happy') roll.happyT = Math.max(roll.happyT, ms / 1000);
  dirty = true;
}
function drawRiceSay() {  }
const QUIET_NUM = /[+＋]\d|\d+\s?pt|\d+(\.\d+)?\s?km|\d+\s?m[！!・。]|×\d|\d+\/\d+/;
function quietNumText(t) { return !!G.demo && !(Number(lsGet('nsg_mzgoals', '0')) >= 3) && QUIET_NUM.test(String(t)); }
function floatText(t) {
  if (quietNumText(t)) return;

  const now = performance.now(), at = Math.max(now, floatQEnd, floatLast + FLOAT_GAP);
  if (floatQEnd > now) floatQEnd += 1300;
  floatLast = at;
  floaters.push({ t, at });
  if (floaters.length > 4) {
    floaters.shift();
    let t0 = now;
    for (const f of floaters) { if (f.at <= now) { t0 = Math.max(t0, f.at + FLOAT_GAP); continue; } f.at = Math.max(t0, floatQEnd > now ? f.at : 0); t0 = f.at + FLOAT_GAP; }
    floatLast = t0 - FLOAT_GAP;
  }
}




const VDIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const openWater = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (codeAt(x + dx, y + dy) !== C.A) return false; return true; };
const isRoad = c => c === C.R || c === C.H;

const railOrCrossing = (x, y) => {
  const c = codeAt(x, y);
  if (c === C.L) return true;
  if (!isRoad(c)) return false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (codeAt(x + dx, y + dy) === C.L) return true;
  return false;
};
const TRAFFIC = {
  train: { ok: railOrCrossing, home: (x, y) => codeAt(x, y) === C.L, max: 1, speed: 3.2, cars: 4, spawn: (x, y) => codeAt(x, y) === C.L },
  car: { ok: (x, y) => isRoad(codeAt(x, y)), max: 6, speed: 2.2, cars: 1, spawn: () => true },
  boat: { ok: (x, y) => codeAt(x, y) === C.A, max: 3, speed: 0.8, cars: 1, spawn: openWater },
};
const calmMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
let traffic = [], trafficSpawnT = 0;
function trafficTurn(v, x, y) {


  const K = TRAFFIC[v.kind], ok = d => K.ok(x + VDIRS[d][0], y + VDIRS[d][1]);
  const far = d => K.ok(x + VDIRS[d][0] * 2, y + VDIRS[d][1] * 2), home = d => (K.home ? K.home(x + VDIRS[d][0], y + VDIRS[d][1]) : false);
  let hx = VDIRS[v.dir][0], hy = VDIRS[v.dir][1];
  for (const p of v.path.slice(0, 6)) { hx += VDIRS[p.d][0]; hy += VDIRS[p.d][1]; }
  const hl = Math.hypot(hx, hy) || 1, dot = d => (VDIRS[d][0] * hx + VDIRS[d][1] * hy) / hl;
  const back = (v.dir + 2) % 4, R = v.kind === 'train' ? 0.4 : 2;
  let cand = [0, 1, 2, 3].filter(d => d !== back && ok(d));
  if (!cand.length && v.kind !== 'boat') {


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
  const M = 8;
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
    for (let k = 0; k < 20; k++) {
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
const camLead = { x: 0, y: 0 };
const demoLead = { x: 0, y: 0, tx: 0, ty: 0 };
let heroScr = { x: 0, y: 0 };
try { scale = Math.min(4, Math.max(1, +localStorage.getItem('nsg_px_scale') || 2)); mzScale = Math.min(4, Math.max(1, +localStorage.getItem('nsg_mz_scale') || 1)); } catch (e) {  }

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


const LAND_CODES = new Set([C.G, C.F, C.P, C.W, C.K, C.V, C.E, C.U, C.Y, C.S]);
const landAreaCache = new Map(), LAND_CACHE_MAX = 6000;
function landAreaOf(tx, ty) {
  const key = tx + ',' + ty;
  if (landAreaCache.has(key)) return landAreaCache.get(key);
  let id = '';
  try { const gz = G['areaZone']; id = gz ? gz(toLatLng(tx + 0.5, ty + 0.5)) || '' : ''; } catch (e) { id = ''; }
  if (!id) return '';
  if (landAreaCache.size >= LAND_CACHE_MAX) landAreaCache.clear();
  landAreaCache.set(key, id);
  return id;
}

function drawLandscapeTile(L, m, tx, ty, X, Y, T) {
  const ph = L.phase(tx, ty), u = T / 8, a = 0.24 + ph * 0.03;
  const col = `rgba(${m.color},${a})`;
  ctx.save();
  ctx.beginPath(); ctx.rect(X, Y, T, T); ctx.clip();
  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, u * 0.7);
  if (m.kind === 'tea') {
    ctx.fillRect(X, Y + T * 0.24, T, T * 0.18); ctx.fillRect(X, Y + T * 0.64, T, T * 0.18);
  } else if (m.kind === 'wave') {
    const off = (tx & 1) ? T / 4 : 0;
    for (let row = 0; row < 2; row++) {
      const yy = Y + T * (0.32 + row * 0.38);
      ctx.beginPath(); ctx.arc(X + T * 0.25 + off, yy, T * 0.26, Math.PI, 0); ctx.arc(X + T * 0.75 + off, yy, T * 0.26, Math.PI, 0); ctx.stroke();
    }
  } else if (m.kind === 'shore') {
    ctx.beginPath(); ctx.moveTo(X, Y + T * 0.8); ctx.quadraticCurveTo(X + T * 0.5, Y + T * 0.3, X + T, Y + T * 0.2); ctx.stroke();
    ctx.fillRect(X + T * 0.2, Y + T * 0.25, u * 0.6, u * 0.6); ctx.fillRect(X + T * 0.65, Y + T * 0.7, u * 0.6, u * 0.6);
  } else if (m.kind === 'hill') {
    const n = 1 + (ph & 1), w = T / (n + 0.5);
    for (let i = 0; i < n; i++) { const x0 = X + i * w + w * 0.25; ctx.beginPath(); ctx.moveTo(x0, Y + T); ctx.lineTo(x0 + w / 2, Y + T * 0.36); ctx.lineTo(x0 + w, Y + T); ctx.closePath(); ctx.fill(); }
  } else if (m.kind === 'island') {
    ctx.beginPath(); ctx.arc(X + T / 2, Y + T / 2, T * 0.24, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(X + T / 2, Y + T / 2, T * 0.44, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
function drawLandscape(tx, ty, X, Y, T) {
  const L = window.nishioLandscape;
  if (!L) return;
  const area = landAreaOf(tx, ty), m = L.motifFor(area);
  if (!m) return;
  if (typeof L.spanOf !== 'function' || typeof L.shadeFor !== 'function') { drawLandscapeTile(L, m, tx, ty, X, Y, T); return; }
  const sp = L.spanOf(tx, ty);
  if (!sp) return;
  const S = (L.SPAN || 4) * T, a = L.shadeFor(tx, ty);
  ctx.save();
  try {
    ctx.beginPath(); ctx.rect(X, Y, T, T); ctx.clip();
    ctx.translate(X - sp.lx * T, Y - sp.ly * T);
    drawLandscapeSpan(m, S, T, `rgba(${m.color},${a})`);
  } finally {
    ctx.restore();
  }

  if (typeof L.borderMotif !== 'function' || typeof L.borderAlpha !== 'function' || !(L.BORDER_W > 0)) return;
  const bw = L.BORDER_W * T;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nx = tx + dx, ny = ty + dy;
    const nm = L.borderMotif(area, landAreaOf(nx, ny));
    if (!nm) continue;
    const nsp = L.spanOf(nx, ny);
    if (!nsp) continue;
    ctx.save();
    try {
      ctx.beginPath();
      ctx.rect(dx > 0 ? X + T - bw : X, dy > 0 ? Y + T - bw : Y, dx ? bw : T, dy ? bw : T);
      ctx.clip();
      ctx.translate(X + dx * T - nsp.lx * T, Y + dy * T - nsp.ly * T);
      for (const off of [-S, 0, S]) {
        ctx.save(); ctx.translate(dx ? off : 0, dy ? off : 0);
        drawLandscapeSpan(nm, S, T, `rgba(${nm.color},${L.borderAlpha(L.shadeFor(nx, ny))})`);
        ctx.restore();
      }
    } finally {
      ctx.restore();
    }
  }
}

function drawLandscapeSpan(m, S, T, col) {
  const L = window.nishioLandscape, u = T / 8;
  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, u * 0.7);
  if (m.kind === 'tea') {
    const h = S * 0.045, d = S * 0.125;
    for (const f of [0.12, 0.37, 0.62, 0.87]) {
      const y0 = S * f - h / 2;
      ctx.beginPath(); ctx.moveTo(0, y0 + d); ctx.lineTo(S, y0 - d); ctx.lineTo(S, y0 - d + h); ctx.lineTo(0, y0 + d + h); ctx.closePath(); ctx.fill();
    }
  } else if (m.kind === 'wave') {
    for (let row = 0; row < 2; row++) {
      const yy = S * (0.32 + row * 0.38), off = row ? T / 2 : 0;
      ctx.beginPath();
      for (let i = -1; i <= L.SPAN; i++) { const cx = T * (i + 0.5) + off; ctx.moveTo(cx - T * 0.5, yy); ctx.arc(cx, yy, T * 0.5, Math.PI, 0); }
      ctx.stroke();
    }
  } else if (m.kind === 'shore') {
    const w = Math.max(1, T * 0.12);
    ctx.lineWidth = w;
    for (const d of [-0.78, -0.22, 0.22, 0.78]) { ctx.beginPath(); ctx.moveTo(-S * 0.1, S * (1.1 + d)); ctx.lineTo(S * 1.1, S * (-0.1 + d)); ctx.stroke(); }
    for (const [fx, fy] of [[0.18, 0.2], [0.62, 0.12], [0.86, 0.52], [0.34, 0.74], [0.12, 0.9]]) ctx.fillRect(S * fx, S * fy, u * 0.6, u * 0.6);
  } else if (m.kind === 'hill') {
    const w = T * 2.2, hh = T * 1.6;
    for (const x0 of [-T * 0.1, S - w + T * 0.1]) { ctx.beginPath(); ctx.moveTo(x0, S); ctx.lineTo(x0 + w / 2, S - hh); ctx.lineTo(x0 + w, S); ctx.closePath(); ctx.fill(); }
  } else if (m.kind === 'island') {
    ctx.beginPath(); ctx.arc(S / 2, S / 2, T * 0.9, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(S / 2, S / 2, T * 1.7, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawTile(tx, ty, X, Y, T, f, now) {
  const raw = rawAt(tx, ty), code = raw & 31, sh = raw >> 5;
  let shoreAt = null;
  const v = tileVarAt(code, tx, ty);
  if (code === C.L && MT.rail) {
    const ri = railIndex(tx, ty);
    if (typeof ri === 'number') ctx.drawImage(MT.rail[ri], X, Y, T, T);
    else { ctx.drawImage(MT.rail[34], X, Y, T, T); for (const p of ri) ctx.drawImage(MT.rail[26 + p], X, Y, T, T); }
  }
  else if (MT.road && ROAD_ROW[code] !== undefined) {
    const [ri, kado, xr, rankan] = nbrLook(tx, ty, roadLookOf);
    ctx.drawImage(MT.road[ROAD_ROW[code]][ri], X, Y, T, T);
    if (code !== C.D) drawRoadShape(X, Y, T, ri >> 1);
    if (MT.kado) for (const i of kado) ctx.drawImage(MT.kado[ROAD_ROW[code]][i], X, Y, T, T);
    if (MT.rail) for (const p of xr) ctx.drawImage(MT.rail[p], X, Y, T, T);
    if (MT.rankan) for (const i of rankan) ctx.drawImage(MT.rankan[i], X, Y, T, T);
  }
  else if (code === C.A && MT.shore && (shoreAt = nbrLook(tx, ty, shoreIndex))) ctx.drawImage(MT.shore[shoreAt[0]][shoreAt[1] + f], X, Y, T, T);
  else ctx.drawImage(tiles[code][v % tiles[code].length][tileFrame(code, f, tx, ty, now)], X, Y, T, T);
  if (LAND_CODES.has(code)) drawLandscape(tx, ty, X, Y, T);
  if (code === C.E && kabuseOn()) drawKabuse(tx, ty, X, Y, T);
  if (code === C.B) drawWall(tx, ty, X, Y, T);
  else drawDeco(code, tx, ty, X, Y, T, now);
  if (code === C.E && chaHanaOn()) drawChaHana(tx, ty, X, Y, T);
  if (sh !== 2 && !gbOn) { ctx.fillStyle = SHADE[sh]; ctx.fillRect(X, Y, T, T); }
  if (TRAIL.map.size && trailHas(tx, ty)) drawFoot(code, tx, ty, X, Y, T);
  if (code === C.R && !regionPaint && alleyHint(tx, ty)) drawAlleyHint(X, Y, T, now);
  if (code === C.H) {
    const u = Math.max(1, Math.round(T / 16)), road = c => c === C.H || c === C.R || c === C.D;
    const up = codeAt(tx, ty - 1), dn = codeAt(tx, ty + 1), lf = codeAt(tx - 1, ty), rt = codeAt(tx + 1, ty);
    ctx.fillStyle = '#f4f4f0';
    if (!MT.road) {
      if (!road(up)) ctx.fillRect(X, Y + u, T, u);
      if (!road(dn)) ctx.fillRect(X, Y + T - 2 * u, T, u);
      if (!road(lf)) ctx.fillRect(X + u, Y, u, T);
      if (!road(rt)) ctx.fillRect(X + T - 2 * u, Y, u, T);
    }

    ctx.fillStyle = '#f2c230';
    if (!road(up) && dn === C.H && hEdgeRun(tx, ty, 1, 0, road) >= 3) { ctx.fillRect(X + u * 2, Y + T - u, u * 4, u); ctx.fillRect(X + u * 10, Y + T - u, u * 4, u); }
    if (!road(lf) && rt === C.H && hEdgeRun(tx, ty, 0, 1, road) >= 3) { ctx.fillRect(X + T - u, Y + u * 2, u, u * 4); ctx.fillRect(X + T - u, Y + u * 10, u, u * 4); }
  }
  if (code === C.A && !shoreAt) {
    const u = Math.max(1, Math.round(T / 16)), land = c => c !== C.A && c !== C.X;
    ctx.fillStyle = f ? '#e8f2ff' : '#cfe2ff';
    if (land(codeAt(tx, ty - 1))) ctx.fillRect(X, Y, T, u);
    if (land(codeAt(tx, ty + 1))) ctx.fillRect(X, Y + T - u, T, u);
    if (land(codeAt(tx - 1, ty))) ctx.fillRect(X, Y, u, T);
    if (land(codeAt(tx + 1, ty))) ctx.fillRect(X + T - u, Y, u, T);
  }
}

let regionPaint = false;
function paintRegion(dst, tx0, ty0, tw, th, T) {
  const keep = ctx, now = performance.now();
  ctx = dst; regionPaint = true;
  try {
    ctx.imageSmoothingEnabled = false;
    for (let ty = ty0; ty < ty0 + th; ty++) for (let tx = tx0; tx < tx0 + tw; tx++) drawTile(tx, ty, (tx - tx0) * T, (ty - ty0) * T, T, 0, now);
    drawWaterCorners(tx0, ty0, tx0 + tw, ty0 + th, -tx0 * T, -ty0 * T, T, 0);
    drawContours(tx0, ty0, tx0 + tw, ty0 + th, -tx0 * T, -ty0 * T, T);
  } finally { ctx = keep; regionPaint = false; }
}

const howtoEl = $('howto');
function howtoShow() {
  const k = $('howtoKey'), pc = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (k) k.textContent = pc ? 'パソコンは 矢印キー。地図を クリックした所へも 向かう' : '傾けにくい ときは、地図を タップした所へ 向かう';
  if (G.toastHold) G.toastHold();
  howtoEl.hidden = false; rp.vx = rp.vy = 0;
  try { localStorage.setItem('nsg_howto', '1'); } catch (e) {  }
  setTimeout(() => { const b = $('howtoOk'); if (b && !howtoEl.hidden) b.focus(); }, 50);
}
$('howtoOk').addEventListener('click', () => { howtoEl.hidden = true; tiltReset(); dirty = true; if (G.toastFlush) G.toastFlush(); });
$('howtoOpen').addEventListener('click', howtoShow);
let meiroPause = false;
let fpsMeter = { ema: 0, n: 0, fps: 0, slow: false }, fpsPrevT = 0;
function frame(now) {
  if (!active) return;
  raf = requestAnimationFrame(frame);
  { const RSf = window.nishioRollSync; if (RSf && RSf.fpsStep && fpsPrevT) fpsMeter = RSf.fpsStep(fpsMeter, now - fpsPrevT); fpsPrevT = now; }
  if (meiroPause) { lastT = 0; return; }
  if (tapS.timer && performance.now() >= tapS.due) { clearTimeout(tapS.timer); tapWalkTick(); }
  mzNextHoldTick();
  mzHelpToastTick();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
  if (!w || !h) return;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; dirty = true; }
  shopHits = [];
  giantHits = [];
  poiHits = [];
  depthArt.length = 0;
  collectedMarks.length = 0;
  refreshSeason(now);
  trailLoad();
  if (rec) { rec.end(); rec = null; ctx = ctx0; }
  if (worldMode) { if (window.NSG_GODOT) NSG_GODOT.idle(); drawWorld(now, w, h, dpr); return; }
  rec = window.NSG_GODOT && NSG_GODOT.on() ? NSG_GODOT.rec : null;
  if (rec) { ctx = rec; rec.begin(w, h); }
  const T = fieldT(dpr);
  const dt = Math.min(0.1, (now - (lastT || now)) / 1000);
  if (!DECO.go && riceSprites.ready) { if (!DECO.goAt) DECO.goAt = now; else if (now - DECO.goAt > 3000) { DECO.go = true; loadDeco(); } }
  koro = window.NISHIO_KOROSTYLE ? window.NISHIO_KOROSTYLE.current() : null; KP = koro ? koro.motion.p : {};
  lastT = now;


  const tgt = targetTile();
  if (last && (Math.abs(tgt.x - last.x) > 0.05 || Math.abs(tgt.y - last.y) > 0.05)) {
    const dx = tgt.x - last.x, dy = tgt.y - last.y;
    facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }
  last = tgt;
  if (G.demo && rollOn && !driving) {
    if (howtoEl.hidden && performance.now() >= mzHitStop) for (let rem = dt; rem > 1e-4;) { const h = Math.min(rem, 1 / 120); rollStep(h); rem -= h; if (rp.x !== null && mazeOn()) mzMvStep(mzMv, Math.floor(rp.x / MZ_K), Math.floor(rp.y / MZ_K), performance.now()); }
    if (mazeOn()) { mzSpotUpdate(now); mzSnap(now); mzRoute(now); mzHintTick(now); mzTrailTick(); mzDeadTick(); mzGrainTick(); mzDotTick(); mzPebTick(); mzMichikusa(now); mzClock(now); mzCrowTick(now); mzSpringTick(now); mzArriveTick(now); mzFruitTick(now); mzPieceTick(now); mzViewTick(now); mzCacheTick(now); mzQuestTick(now); mzDinoTick(now); mzChaseTick(now); mzEnergyTick(now); mzMiniTick(); mzTorchTick(now); mzBrigadeTick(now); mzPurifyTick(now); mzRescueTick(now); mzCubeTick(now); mzTileTick(); } else if (mzFruit.sx >= 0) mzFruitReset(); if (!mazeOn() && mzPiece.sx >= 0) mzPieceReset(); if (!mazeOn() && mzView.sx >= 0) mzViewReset();
  if (!mazeOn() && mzCache.sx >= 0) mzCacheReset();
  }
  if (!mazeOn() && mzPiece.sx >= 0) mzPieceReset();
  if (!mazeOn() && mzView.sx >= 0) mzViewReset();
  if (!mazeOn() && mzCache.sx >= 0) mzCacheReset();
  if (!mazeOn() && mzQuest.sx >= 0) mzQuestReset();
  if (!mazeOn() && mzChase.sx >= 0) mzChaseReset();
  if (!mazeOn() && mzEnergy.lastCx >= 0) mzEnergyReset();
  if (!mazeOn() && (mzPurify.sx >= 0 || mzPurify.count)) mzPurifyReset();
  if (!mazeOn() && (mzRescue.sx >= 0 || mzRescue.joined || mzRescue.doneAt)) mzRescueReset();
  if (!mazeOn() && (mzCube.sx >= 0 || mzCube.got)) mzCubeReset();
  if (!mazeOn() && (mzBrigade.sx >= 0 || mzBrigade.count)) mzBrigadeReset();
  if (!mazeOn() && (mzTorch.sx >= 0 || mzTorch.held)) mzTorchReset();
  if (!mazeOn() && mzTiles.size) mzTiles.clear();
  if (!mazeOn() && mzMini.seen.size) mzMini.seen.clear();
  if (!mazeOn() && mzDino.sx >= 0) mzDinoReset();
  waterWatch(tgt, dt);
  if (!cam || Math.hypot(tgt.x - cam.x, tgt.y - cam.y) > 40) cam = { ...tgt };
  else { const k = Math.min(1, dt * (G.demo && rollOn ? 14 : 6)); cam.x += (tgt.x - cam.x) * k; cam.y += (tgt.y - cam.y) * k; }
  const rolling = rollOn && G.demo && rp.x !== null && !driving;
  if (rolling) {
    const k = Math.min(1, dt * 2.5);
    camLead.x += (Math.max(-1.1, Math.min(1.1, rp.vx * 0.2)) - camLead.x) * k; camLead.y += (Math.max(-1.1, Math.min(1.1, rp.vy * 0.2)) - camLead.y) * k;



    const leadLim = (half, v) => { const m = Math.max(0, half - DEMO_LEAD_PX * dpr) / T; return Math.max(-m, Math.min(m, v)); }, leadW = w / 2, leadH = (h - cover * dpr) / 2;
    demoLead.tx = leadLim(leadW, demoLead.tx); demoLead.ty = leadLim(leadH, demoLead.ty);
    demoLead.x += (demoLead.tx - demoLead.x) * k; demoLead.y += (demoLead.ty - demoLead.y) * k;
    demoLead.x = leadLim(leadW, demoLead.x); demoLead.y = leadLim(leadH, demoLead.y);
    cam.x = rp.x + camLead.x + demoLead.x; cam.y = rp.y + camLead.y + demoLead.y;
  } else camLead.x = camLead.y = demoLead.x = demoLead.y = demoLead.tx = demoLead.ty = 0;
  const hp = rolling ? { x: rp.x, y: rp.y } : { x: cam.x, y: cam.y };
  bigHero.x = hp.x; bigHero.y = hp.y;
  if (roll.last) { const ddx = hp.x - roll.last.x, ddy = hp.y - roll.last.y, d = Math.hypot(ddx, ddy); if (d < 3) roll.d += d; riceSpin(ddx, ddy, dt); }


  const kp = rolling ? hp : tgt;
  if (roll.lastK) { const d = Math.hypot(kp.x - roll.lastK.x, kp.y - roll.lastK.y); if (d < 3 && window.NISHIO_KOROSTYLE) window.NISHIO_KOROSTYLE.addDist(d); }
  roll.lastK = { x: kp.x, y: kp.y };
  roll.last = hp;
  roll.trail.push({ x: hp.x, y: hp.y, th: roll.ang }); if (roll.trail.length > 8) roll.trail.shift();
  if (rolling && !rollLineT0) rollLineT0 = now;
  { const RT = window.nishioRollTrail; if (RT && rolling) { if (!fpsMeter.slow) { rollPath.list = RT.push(rollPath.list, hp.x, hp.y, now); rollPath.list = RT.alive(rollPath.list, now); } if (RT.bloomPush && RT.bloomAlive) { rollBloom.list = RT.bloomPush(rollBloom.list, hp.x, hp.y, now); rollBloom.list = RT.bloomAlive(rollBloom.list, now); } } }

  if (now - lastEnsure > 500) { lastEnsure = now; ensureVisible(w, h, T); snapDemoStart(); updateChests(); checkCar(); sightCheck(); updateCover(); loadTowns(); updateHere(); updateHarvestBtn(); updateDankyuBtn(); updateHiryoBtn(); }

  const f = Math.floor(now / 450) % 2;
  ctx.imageSmoothingEnabled = false;
  const vh = h - Math.round(cover * dpr), cy = Math.round(vh / 2);
  fieldCy = cy;
  const shk = roll.shake > 0 ? Math.round(Math.sin(now / 18) * roll.shake * T * 0.12) : 0;
  const ox = Math.round(w / 2 - cam.x * T) + shk, oy = Math.round(cy - cam.y * T);
  const tx0 = Math.floor(-ox / T), ty0 = Math.floor(-oy / T), tx1 = Math.ceil((w - ox) / T), ty1 = Math.ceil((h - oy) / T);
  for (let ty = ty0; ty < ty1; ty++) for (let tx = tx0; tx < tx1; tx++) drawTile(tx, ty, ox + tx * T, oy + ty * T, T, f, now);

  drawWaterCorners(tx0, ty0, tx1, ty1, ox, oy, T, f);
  if (!gbOn) drawContours(tx0, ty0, tx1, ty1, ox, oy, T);
  if (mazeOn()) { drawMzFogTint(tx0, ty0, tx1, ty1, ox, oy, T); drawMzPebs(tx0, ty0, tx1, ty1, ox, oy, T, now); drawMzTiles(tx0, ty0, tx1, ty1, ox, oy, T, now); drawMzTerritory(tx0, ty0, tx1, ty1, ox, oy, T); drawMzTrail(tx0, ty0, tx1, ty1, ox, oy, T, now); drawMaze(tx0, ty0, tx1, ty1, ox, oy, T); drawRollPath(ox, oy, T, now); drawRollBloom(ox, oy, T, now); drawRollLine(ox, oy, T, now); drawMzGates(tx0, ty0, tx1, ty1, ox, oy, T, now); drawMzHalf(ox, oy, T, now); drawMzPads(tx0, ty0, tx1, ty1, ox, oy, T, now); drawMzGrains(tx0, ty0, tx1, ty1, ox, oy, T, now); drawMzFruit(ox, oy, T, now); drawMzPiece(ox, oy, T, now); drawMzView(ox, oy, T, now); drawMzCache(ox, oy, T, now); drawMzQuest(ox, oy, T, now); drawMzDino(ox, oy, T, now); drawMzDinoSonar(ox, oy, T, now); if (mzHelpOn()) drawMzDeadEnds(tx0, ty0, tx1, ty1, ox, oy, T); else mzHelp.dead = 0; drawMzHint(ox, oy, T, now); drawMzDots(tx0, ty0, tx1, ty1, ox, oy, T, now); drawMzCrows(ox, oy, T, now); drawMzSpring(ox, oy, T, now); drawMzCritters(tx0, ty0, tx1, ty1, ox, oy, T, now); drawMzTorch(ox, oy, T, now); drawMzBrigade(ox, oy, T, now); drawMzPurify(ox, oy, T, now); drawMzRescue(ox, oy, T, now); drawMzCube(ox, oy, T, now); drawMzFogVeil(tx0, ty0, tx1, ty1, ox, oy, T, now); drawMzTorchLight(ox, oy, T, now); drawMzSightRing(ox, oy, T, now); drawMzPulse(ox, oy, T, now); drawMzCacheGlow(ox, oy, T, now); drawMzGlide(ox, oy, T, now); drawMzChase(ox, oy, T, now); drawMzEnergyRing(ox, oy, T, now); drawMzEnergyAura(ox, oy, T, now); drawMzEnergyStars(ox, oy, T, now); drawMzTorchFlame(ox, oy, T, now); drawMzBrigadeMates(ox, oy, T, now); drawMzQuestCarry(ox, oy, T, now); drawMzPurifyPetals(ox, oy, T, now); drawMzRescueMate(ox, oy, T, now); drawMzRescueRing(ox, oy, T, now); drawMzCubeBig(ox, oy, T, now); }
  if (!mazeOn()) drawRollPath(ox, oy, T, now); if (!mazeOn()) drawRollBloom(ox, oy, T, now); if (!mazeOn()) drawRollLine(ox, oy, T, now);
  updateTraffic(dt, now, tx0, ty0, tx1, ty1);
  drawTraffic(ox, oy, T, w, h);


  const spots = G.spots;
  const pois = visiblePois(tx0, ty0, tx1, ty1), labelBoxes = [];

  const SM = window.nishioShopMap, tagged = new Map();
  if (SM && !mazeOn()) {
    const mt = G.me ? toTile(G.me.lat, G.me.lng) : { x: cam.x, y: cam.y };
    const picked = SM.pickLabels(pois, { me: mt, goalName: G.guide && G.guide.name, limit: 3 });
    const levels = SM.layoutLevels ? SM.layoutLevels(picked) : [];
    picked.forEach((p, i) => tagged.set(p, levels[i] || 0));
  }
  for (const p of pois) {
    const gid = giantPoiOf(p), giant = gid ? giantImg(gid) : null;
    const img = (giant || spotSprites[p[2]] || spotSprites.shop)[0], size = dotSize(img, T), sx = Math.round(ox + p[0] * T - size / 2), sy = Math.round(oy + p[1] * T - size * (giant ? 0.72 : 0.7));
    ctx.drawImage(img, sx, sy, size, size);
    if (giant) { poiHits.push([sx, sy, size, p, giant[0]]); depthArt.push([img, sx, sy, size, sy + size * 0.72, false]); }
    if (tagged.has(p)) {
      const box = poiTag(sx + size / 2, sy - tagged.get(p) * Math.round(20 * dpr), dpr, SM.shortName ? SM.shortName(p[3]) : p[3]);
      if (box) labelBoxes.push(box);
    }
  }
  const me = G.me;
  let nearest = null, nearestD = Infinity;
  const heroGiant = mazeOn() ? null : pickHeroGiant(spots, bigHero.x, bigHero.y);
  heroGiantId = heroGiant ? heroGiant.id : null;
  for (const s of spots) {
    const p = toTile(s.lat, s.lng);
    const near = ox + p.x * T > -T * 4 && ox + p.x * T < w + T * 4 && oy + p.y * T > -T * 2 && oy + p.y * T < h + T * 5;
    const giant = near ? (s === heroGiant ? giantOf(s) : bigOf(s)) : null;
    const spr = giant || spriteOf(s);
    const size = bigSpotSize(s, spr, T, giant);
    const sx = ox + p.x * T - size / 2, sy = oy + p.y * T - size * (giant ? 0.72 : 0.5);
    const cool = G.cooldownLeft(s) > 0;
    if (me && !cool) { const d = G.dist(me, s); if (d < nearestD) { nearest = s; nearestD = d; } }
    if (sx > w || sy > h || sx + size < 0 || sy + size < 0) continue;
    if (s.shop) {
      const rr = size * 0.62, rx = sx + size / 2, ry = sy + size * 0.6, lw = Math.max(2, Math.round(dpr * 2));
      ctx.lineWidth = lw + Math.max(2, Math.round(dpr * 2)); ctx.strokeStyle = 'rgba(26,26,26,.75)'; ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(255,213,79,.9)'; ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.stroke();
    }
    if (s.shop) gbPause++;
    if (giant) drawGiantWash(sx, sy, size);
    ctx.drawImage(spr[0], Math.round(sx), Math.round(sy), size, size);
    if (s.shop) gbPause--;
    if (giant) { giantHits.push([sx, sy, size, s, giant[0]]); depthArt.push([spr[0], Math.round(sx), Math.round(sy), size, sy + size * 0.72, !!s.shop]); }
    if (collectedOf(s, G.state && G.state.visits)) { if (giant) collectedMarks.push([sx, sy, size, dpr]); else drawCollectedMark(sx, sy, size, dpr, !s.shop); }
    if (s.featured && !cool && f) {
      ctx.fillStyle = '#fff59d';
      const u = Math.min(size, 3 * T) / 16, kx = sx + size * 13 / 16, ky = sy + size / 16;
      ctx.fillRect(Math.round(kx), Math.round(ky), Math.ceil(u), Math.ceil(u * 3));
      ctx.fillRect(Math.round(kx - u), Math.round(ky + u), Math.ceil(u * 3), Math.ceil(u));
    }
    if (s.shop && window.nishioShomai) {
      const m = shomaiArt(), q = m && window.nishioShomai.place(sx, sy, size);
      if (q) {
        const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
        ctx.drawImage(m, Math.round(q.x), Math.round(q.y), Math.round(q.w), Math.round(q.h));
        ctx.imageSmoothingEnabled = sm;
        shopHits.push([q.x, q.y, q.x + q.w, q.y + q.h, s]);
      }
    }
    if (s.shop && giant) drawShopSeimai(sx, sy, size);
    if (s.shop && giant) drawRiceJourney(sx, sy, size);
    if (s.shop) { const t = drawShopTag(sx + size / 2, sy, dpr, s); shopHits.push([Math.min(t[0], sx), t[1], Math.max(t[2], sx + size), sy + size, s]); }
  }

  const sp = sightTick(now);
  for (const n of G.npcs || []) {
    const t = sp && sight.n === n ? sp : npcTile(n), sx = Math.round(ox + t.x * T), sy = Math.round(oy + t.y * T - T * 0.25);
    if (sx > w || sy > h || sx + T < 0 || sy + T < 0) continue;
    ctx.drawImage((npcSprites[n.look] || npcSprites.man)[sp && sp.walking && sight.n === n ? Math.floor(now / 120) % 2 : f], sx, sy, T, T);
    const em = npcEmotes.get(n.id), age = em ? performance.now() - em.t : 1e9;
    if (age < 1600) emoteAt(sx, sy, T, em.k, age);
    else if (em) npcEmotes.delete(n.id);
    else if (!G.npcMet(n.id)) {
      const u = Math.max(1, Math.round(T / 16)), bx = sx + Math.round(T * 0.55), by = sy - Math.round(T * 0.45) - (f ? u : 0);
      ctx.fillStyle = '#000'; ctx.fillRect(bx - u, by - u, 9 * u, 6 * u);
      ctx.fillStyle = '#fff'; ctx.fillRect(bx, by, 7 * u, 4 * u); ctx.fillRect(bx + u, by + 4 * u, 2 * u, 2 * u);
      ctx.fillStyle = '#000'; ctx.fillRect(bx + u, by + 2 * u, u, u); ctx.fillRect(bx + 3 * u, by + 2 * u, u, u); ctx.fillRect(bx + 5 * u, by + 2 * u, u, u);
    }
  }

  if (critterS.show) {
    const c = critterS.show, age = now - c.t;
    if (age > 3000) critterS.show = null;
    else {
      const hop = Math.floor(age / 250) % 2 ? Math.round(T / 16) : 0;
      ctx.drawImage(critterSprites[c.id], Math.round(ox + c.x * T), Math.round(oy + c.y * T) - hop, T, T);
      dirty = true;
    }
  }
  suzumeStep(now, ox, oy, T, w, h, dpr);
  nekoStep(now, ox, oy, T, w, h, dpr);
  mushiStep(now, ox, oy, T, w, h, dpr);
  kaeruStep(now, ox, oy, T, w, h, dpr);
  nakamaStep(now, ox, oy, T, w, h, dpr);
  hamonStep(now, ox, oy, T, w, h, dpr);
  sentakuStep(now, ox, oy, T, w, h, dpr);
  donguriStep(now, ox, oy, T, w, h, dpr);
  deaiStep(now, ox, oy, T);
  koboreStep(now, ox, oy, T, dpr);

  const rt = rivalTile();
  if (rt && rt.ok) {
    const sx = Math.round(ox + rt.x * T), sy = Math.round(oy + rt.y * T - T * 0.25);
    if (sx < w && sy < h && sx + T > 0 && sy + T > 0) ctx.drawImage(rivalSprites[f], sx, sy, T, T);
  }

  for (const c of G.liveChests()) {
    const p = toTile(c.lat, c.lng), hop = f ? Math.round(T / 8) : 0, sh = c.at ? T * 0.9 : 0;
    const sx = Math.round(ox + p.x * T - T / 2 + sh), sy = Math.round(oy + p.y * T - T / 2 - sh) - hop;
    if (sx > w || sy > h || sx + T < 0 || sy + T < 0) continue;
    ctx.drawImage(spotSprites.treasure[0], sx, sy, T, T);
  }

  const target = G.selected || nearest;
  if (target) {
    const p = toTile(target.lat, target.lng), r = G.reachOf(target) / TILE_M * T;
    const cxp = ox + p.x * T, cyp = oy + p.y * T, dot = Math.max(2, Math.round(T / 8));
    ctx.fillStyle = target.featured ? '#ffd54f' : '#ffffff';
    const n = Math.max(16, Math.round(2 * Math.PI * r / (dot * 1.6)));
    for (let i = 0; i < n; i++) { if ((i + f) % 3 === 0) continue; const a = i / n * Math.PI * 2; ctx.fillRect(Math.round(cxp + Math.cos(a) * r), Math.round(cyp + Math.sin(a) * r), dot, dot); }
  }


  if (tapS.goal && f) {
    ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = Math.max(2, Math.round(T / 8));
    ctx.strokeRect(Math.round(ox + (tapS.goal[0] + 0.15) * T), Math.round(oy + (tapS.goal[1] + 0.15) * T), Math.round(T * 0.7), Math.round(T * 0.7));
  }


  if (driving) ctx.drawImage(carSprites[facing], Math.round(w / 2 - T / 2), Math.round(cy - T / 2), T, T);
  else if ((me || G.demo) && riceSprites.ready) {
    const img = riceSprites.right[0], sz0 = dotSize(img, T), sz = sz0 * RICE_BIG, u = sz / 32;
    let hx = ox + roll.last.x * T, hcy = oy + roll.last.y * T;
    if (KP.wobble && roll.v > 0.5) hx += Math.sin(roll.d * 2.4) * KP.wobble * T * Math.min(1, roll.v / 2);
    if (KP.shake && roll.v > 0.5) { hx += Math.round((Math.random() - 0.5) * u * 1.6 * KP.shake); hcy += Math.round((Math.random() - 0.5) * u * 1.2 * KP.shake); }
    heroScr = { x: hx - w / 2 - shk, y: hcy - cy };
    const A = 10 * u, B = 13.5 * u, th = roll.ang;
    const low = Math.sqrt((A * Math.sin(th)) ** 2 + (B * riceTall(roll.pitch) * Math.cos(th)) ** 2), ground = hcy + T * 0.4 - sz0 / 2 + 13.5 * sz0 / 32, hop = roll.h * T, mid = ground - low - hop;
    for (const p of roll.dust) {
      const a = 1 - p.t / 0.45, r = Math.max(1, Math.round(T * (p.bit ? 0.07 : 0.12) * p.s * (1 + (p.bit ? 0 : p.t * 2))));
      const up = p.bit ? (p.t * 2.2 - p.t * p.t * 9) * T : p.t * T * 0.4;
      ctx.fillStyle = `rgba(${p.c || '235,228,205'},${((p.bit ? 0.9 : 0.55) * a).toFixed(2)})`;
      ctx.fillRect(Math.round(ox + (p.x + (p.vx || 0) * p.t) * T - r), Math.round(oy + p.y * T + T * 0.3 - r - up), r * 2, r * 2);
    }
    {
      const wv = Math.sqrt((A * Math.cos(th)) ** 2 + (B * Math.sin(th)) ** 2), shw = wv * 1.8 / (1 + roll.h * 3), q = Math.max(1, Math.round(u)), sy0 = Math.round(hcy + T * 0.3);
      const RSs = window.nishioRollSync, st = RSs && RSs.shadowStretch ? RSs.shadowStretch(roll.v) : 1, tl = roll.trail, tp = tl[tl.length - 1], tq = tl[tl.length - 3], rot = st > 1.02 && tp && tq && Math.hypot(tp.x - tq.x, tp.y - tq.y) > 0.01 ? Math.atan2(tp.y - tq.y, tp.x - tq.x) : 0;
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      if (gbOn && !worldMode) {
        ctx.fillRect(Math.round(hx - shw * st * 0.36), sy0 - q, Math.round(shw * st * 0.72), q);
        ctx.fillRect(Math.round(hx - shw * st / 2), sy0, Math.round(shw * st), 2 * q);
        ctx.fillRect(Math.round(hx - shw * st * 0.36), sy0 + 2 * q, Math.round(shw * st * 0.72), q);
      } else { ctx.beginPath(); ctx.ellipse(hx, hcy + T * 0.3 + u, (shw / 2) * st, (2 * u) / Math.sqrt(st), rot, 0, Math.PI * 2); ctx.fill(); }
      kageDraw(hx, hcy + T * 0.3 + u, shw, u, now, roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2);
    }
    const sq = roll.sq;
    let sx = roll.sqx ? 1 - sq : 1 + sq, sy = roll.sqx ? 1 + sq * 0.6 : 1 - sq;
    let br = 0;
    if (roll.kind === 'stop' && roll.h <= 0 && roll.v < 0.2 && !calmMotion) { br = riceBreath(now); sy *= 1 + br; sx *= 1 - br * 0.5; }
    if ((roll.prevIdle || 0) > 12 && roll.idle < roll.prevIdle && !calmMotion) roll.wakeT = now;
    roll.prevIdle = roll.idle;
    { const ws = riceWake(now - (roll.wakeT || -1e9)); if (ws) { sy *= 1 + ws; sx *= 1 - ws * 0.5; } }
    let tp = 0;
    if (!calmMotion && typeof tapRing === 'object' && tapRing.t0 && tapRing.still) { tp = riceTapPre(Math.max(0, now - tapRing.t0)); if (tp) { sy *= 1 + tp; sx *= 1 - tp * 0.5; } }
    { const mc = gochisoMunch(now); if (mc) { sy *= 1 - mc; sx *= 1 + mc * 0.5; } }
    const tr = roll.trail, t0 = tr[tr.length - 3], t1 = tr[tr.length - 1];
    if (roll.h > 0) { const st = Math.min(0.12, Math.abs(roll.hv) * 0.035); sy *= 1 + st; sx *= 1 - st * 0.5; }
    else if (t0 && t1 && roll.v > 3.5) {
      const st = Math.min(0.05 * (KP.stretch || 1), (roll.v - 3.5) * 0.025 * (KP.stretch || 1)), horiz = Math.abs(t1.x - t0.x) >= Math.abs(t1.y - t0.y);
      if (horiz) { sx *= 1 + st; sy *= 1 - st * 0.5; } else { sy *= 1 + st; sx *= 1 - st * 0.5; }
    }
    const by = sy !== 1 ? ground - low * sy - hop : mid;
    roll.by = by;
    const mood = roll.drawn = riceMood(now), asleep = riceAsleep();
    const sy0 = sy / ((1 + br) * (1 + tp)), byB = sy0 !== 1 ? ground - low * sy0 - hop : mid;
    roll.tapUp = 2 * low * (sy - sy / (1 + tp));
    roll.box = [hx - 13 * u, byB - 15 * u, hx + 13 * u, byB + 9 * u];
    drawKoroTrail(ox, oy, T, u);
    if (!fpsMeter.slow && riceBall.cv && (KP.ghost && roll.v > 0.8)) {
      for (const [k, al] of [[6, 0.14], [3, 0.26]]) {
        const p = roll.trail[roll.trail.length - 1 - k];
        if (!p) continue;
        ctx.globalAlpha = al; riceLowQ = true;
        try { drawRiceBall(ox + p.x * T, by + (oy + p.y * T - hcy), u, p.th % (Math.PI * 2), sx, sy, roll.spin, ctx, gbOn && !worldMode, null, 0, 0, '', roll.pitch); }
        finally { ctx.globalAlpha = 1; riceLowQ = false; }
      }
    }
    tsutsumiStep(hx, by, u, now);
    chochinyoruStep(hx, by, u, now);
    isshikiStep(hx, by, u, now);
    shimatabiStep(hx, by, u, now);
    yuamiStep(hx, by, u, now);
    horidashiStep(hx, by, u, now);
    hazusanpoStep(hx, by, u, now);
    tomboloStep(hx, by, u, now);
    jokamachiStep(hx, by, u, now);
    mangekyoStep(hx, by, u, now);
    chatsumiStep(hx, by, u, now);
    kawabeStep(hx, by, u, now);
    chasetsuStep(hx, by, u, now);
    nedokoStep(hx, by, u, now, asleep);
    if (riceBall.cv) {
      drawRiceBall(hx, by, u, th % (Math.PI * 2), sx, sy, roll.spin, ctx, gbOn && !worldMode, mood, roll.look, roll.dirt, roll.dirtCol, roll.pitch);
      drawSendArrow(hx, by, T, u);
      growStep(hx, by, u, now);
      if (roll.wetT > 0) {
        const q = Math.max(1, Math.round(u)), dx0 = hx - 11 * u, dy0 = by - 12 * u + (1.4 - roll.wetT) * 3 * u, crisp = !!rec || (gbOn && !worldMode), sm = ctx.imageSmoothingEnabled;
        ctx.globalAlpha = Math.min(1, roll.wetT * 2); ctx.imageSmoothingEnabled = !crisp;
        ctx.drawImage(dropSprite(q), crisp ? Math.round(dx0) - q : dx0 - q, crisp ? Math.round(dy0) - q : dy0 - q); drop.at = [dx0, dy0]; drop.n++;
        ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = sm;
      }
      drawNimotsu(hx, by, u, now, asleep);
      yumeStep(hx, by, u, now, asleep);
      gochisoStep(hx, by, u, now);
      otedamaStep(hx, by, u, now);
      kasaStep(hx, by, u, now);
      kiriStep(hx, by, u, now);
      meguriStep(hx, by, u, now);
      tsunStep(hx, by, u, now);
      nazoStep(hx, by, u, now);
      youkosoStep(hx, by, u, now);
      shirushiStep(hx, by, u, now, asleep);
      monosashiStep(hx, by, u, now, asleep);
      okaeriStep(hx, by, u, now, asleep);
      furusatoStep(hx, by, u, now, asleep);
      drawBfly(hx, by, u, now, asleep);
      if (asleep) {
        const crisp = !!rec || (gbOn && !worldMode), sm = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = !crisp;
        for (let k = 0; k < 2; k++) {
          const t = ((now / 1600) + k / 2) % 1, zx = hx + 9 * u + t * 6 * u + k * 3 * u, zy = by - 14 * u - t * 10 * u, q = Math.max(1, Math.round(u * (k ? 0.8 : 1.1)));
          ctx.globalAlpha = 1 - t; ctx.drawImage(zzzSprite(q), crisp ? Math.round(zx) : zx, crisp ? Math.round(zy) : zy); zzz.at = [zx, zy];
        }
        ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = sm; zzz.n++;
      }
    } else {
      roll.flat++;
      const cs = Math.cos(roll.spin);
      ctx.save(); ctx.translate(Math.round(hx), Math.round(by));
      ctx.scale((cs < 0 ? -sx : sx) * Math.max(0.18, Math.abs(cs)), (Math.cos(roll.pitch) < 0 ? -sy : sy) * riceTall(roll.pitch)); ctx.rotate(th % (Math.PI * 2));
      ctx.drawImage(cs < 0 && roll.back ? roll.back : img, -Math.round(sz / 2), -Math.round(sz / 2), sz, sz);
      ctx.restore();
    }
    if (riceBall.cv && !rec) occludeRice(hx, by, hcy + T * 0.3, u, () => drawRiceBall(hx, by, u, th % (Math.PI * 2), sx, sy, roll.spin, ctx, gbOn && !worldMode, mood, roll.look, roll.dirt, roll.dirtCol, roll.pitch));
  } else if (me || G.demo) ctx.drawImage(heroSprites[facing][f], Math.round(w / 2 - T / 2), Math.round(cy - T * 0.75), T, T);
  for (const [mx, my, msize, mdpr] of collectedMarks) drawCollectedMark(mx, my, msize, mdpr, false);

  if (!rec) drawNight(w, h, ox, oy, T, cy, pois, now);
  if (!rec) drawMorning(w, h);
  {


    const fs = Math.round(10 * dpr), pad = Math.round(3 * dpr), bw = Math.max(1, Math.round(dpr));
    labelBoxes.push([w / 2 + heroScr.x - T, cy + heroScr.y - T * 1.6, w / 2 + heroScr.x + T, cy + heroScr.y + T * 0.8]);
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
    const hm = (me || G.demo) && !driving ? heightAt(cam.x, cam.y) : null;
    if (hm !== null) {
      const sl = slopeAt(cam.x, cam.y), pct = Math.round(sl.g * 100);
      const arrow = pct < 2 ? '' : ' ' + '→↘↓↙←↖↑↗'[((Math.round(Math.atan2(sl.y, sl.x) / (Math.PI / 4)) % 8) + 8) % 8] + pct + '%';
      board(Math.round(w / 2 + heroScr.x + T * 1.9), Math.round(cy + heroScr.y - T * 1.5), `⛰${hm < 10 ? hm.toFixed(1) : Math.round(hm)}m${arrow}`, '#fffbe8', '#5a3a18');
    }

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
    if (!SIMPLE()) for (const p of pois.filter(q => MAJOR_SIGN.has(q[2])).concat(pois.filter(q => !MAJOR_SIGN.has(q[2])))) {
      if (!p[3]) continue;
      board(Math.round(ox + p[0] * T), Math.round(oy + p[1] * T + T * 0.35), short(p[3], 12), signColor(p[2], p[3]), '#fff');
    }
  }

  drawWeather(now, w, h, dpr, !!rec);



  if (here.banner && (now - here.bannerAt) / 1000 > 2.8) { here.banner = ''; here.box = null; here.waited = 0; here.lastT = 0; }





  if (mazeOn()) drawRiceSay(w, cy, T, now, dpr);
  floatDrawn.length = 0;
  const floatHold = !!(mzBanner.t0 || mzNextOn());
  if (floatHold) { floaters.forEach((fl, k) => { fl.at = now + k * 1300; }); floatQEnd = floaters.length ? now + floaters.length * 1300 : 0; if (floaters.length) floatLast = now + (floaters.length - 1) * 1300; }
  let floatWait = -1;

  let floatToast = null;
  if (floaters.length) {
    const te = document.getElementById('toast');
    if (te && te.classList.contains('show')) { const r = te.getBoundingClientRect(), c = cv.getBoundingClientRect(), k = c.width ? cv.width / c.width : 1; if (r.width && r.height) floatToast = [(r.left - c.left) * k, (r.top - c.top) * k, (r.right - c.left) * k, (r.bottom - c.top) * k]; }
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const fl = floaters[i];
    if (floatHold) continue;
    const age = (now - fl.at) / 1000;
    if (age < 0) continue;
    if (age > 1.2) { floaters.splice(i, 1); continue; }
    floatDrawn.push(fl.t);
    ctx.globalAlpha = Math.min(1, (1.2 - age) * 2);

    let fz = Math.round(FLOAT_PX * dpr);
    ctx.font = `bold ${fz}px "DotGothic16", monospace`;
    const fw = ctx.measureText(fl.t).width;
    if (fw > w * 0.94) { fz = Math.max(Math.round(11 * dpr), Math.floor(fz * w * 0.94 / fw)); ctx.font = `bold ${fz}px "DotGothic16", monospace`; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, Math.round(fz / 4)); ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.fillStyle = '#ffe27a';
    floatPx = Math.max(floatPx, fz / dpr);
    const fy0 = Math.round(cy - T * 1.15 - age * T * 0.7);


    const A = mazeOn() && mzMap.arrow, m = 6 * dpr, lh = Math.round(fz * 1.1);
    const wid = ls => Math.max(...ls.map(s => ctx.measureText(s).width));
    const box = (ls, x, y) => { const bw = wid(ls); return [x - bw / 2, y - lh * (ls.length - 1) - fz, x + bw / 2, y]; };
    const hit = b => b[0] < A[2] + m && b[2] > A[0] - m && b[1] < A[3] + m && b[3] > A[1] - m;
    let ls = [fl.t], fx = w / 2, fy = fy0;
    floatShift = [0, 0];
    if (A && (fl.dodge || hit(box(ls, fx, fy)))) {
      const sps = [];
      for (let n = fl.t.indexOf(' '); n > 0; n = fl.t.indexOf(' ', n + 1)) sps.push(n);
      const k = sps.sort((a, b) => Math.abs(a - fl.t.length / 2) - Math.abs(b - fl.t.length / 2))[0];
      const tries = [[fl.t]].concat(k ? [[fl.t.slice(0, k), fl.t.slice(k + 1)]] : []);
      const sideX = l => { const bw = wid(l); return (A[0] + A[2]) / 2 < w / 2 ? Math.min(w - m - bw / 2, A[2] + m + 1 + bw / 2) : Math.max(m + bw / 2, A[0] - m - 1 - bw / 2); };
      const top = mzClockFoot(dpr, now) + m, huds = mzHudRects(now);
      const foot = roll.box ? roll.box[1] - m : Math.round(cy - T * 1.15);
      const under = l => top + lh * (l.length - 1) + fz;
      const place = d => d === 'side0' || d === 'side1' ? tries[+d[4]] && { ls: tries[+d[4]], fx: sideX(tries[+d[4]]), fy: Math.max(fy0, under(tries[+d[4]])) }
        : d === 'down' ? { ls: [fl.t], fx: w / 2, fy: Math.max(fy0, A[3] + m + fz) } : d === 'up' ? { ls: [fl.t], fx: w / 2, fy: Math.max(under([fl.t]), Math.min(fy0, A[1] - m)) } : null;
      const safe = (d, c) => { if (!c) return false; const b = box(c.ls, c.fx, c.fy); return !hit(b) && b[0] >= 0 && b[2] <= w && b[1] >= top && (d === 'up' ? c.fy <= A[1] - m : d !== 'down' || c.fy <= foot) && !huds.some(r => b[0] < r[2] && b[2] > r[0] && b[1] < r[3] && b[3] > r[1]); };
      let q = fl.dodge && place(fl.dodge);
      if (q && !safe(fl.dodge, q)) q = null;
      if (!q) {
        fl.dodge = ['side0', 'side1', 'down', 'up'].find(d => safe(d, place(d))) || '';
        q = fl.dodge && place(fl.dodge);
      }
      if (!q) {
        floatDrawn.pop(); ctx.globalAlpha = 1;
        if (!fl.w0) fl.w0 = now;
        if (now - fl.w0 > 4000) { floaters.splice(i, 1); if (floatWait > i) floatWait--; }
        else floatWait = i;
        continue;
      }
      ({ ls, fx, fy } = q);
      floatShift = [fx - w / 2, fy - fy0];
    }
    if (floatToast) {
      const b = box(ls, fx, fy), Q = floatToast;
      if (b[0] < Q[2] + m && b[2] > Q[0] - m && b[1] < Q[3] + m && b[3] > Q[1] - m) {
        const ny = Math.round(Q[3] + m + lh * (ls.length - 1) + fz), foot = roll.box ? roll.box[1] - m : Math.round(cy - T * 1.15);
        if (ny <= foot && !(A && hit(box(ls, fx, ny)))) { fy = Math.max(fy, ny); floatShift = [fx - w / 2, fy - fy0]; }
        else {
          floatDrawn.pop(); ctx.globalAlpha = 1;
          if (!fl.w0) fl.w0 = now;
          if (now - fl.w0 > 6000) { floaters.splice(i, 1); if (floatWait > i) floatWait--; }
          else floatWait = i;
          continue;
        }
      }
    }
    ls.forEach((s, n) => { const y = fy - lh * (ls.length - 1 - n); ctx.strokeText(s, fx, y); ctx.fillText(s, fx, y); });
    ctx.globalAlpha = 1;
  }
  if (floatWait >= 0) {
    floaters.forEach((f, k) => { if (k >= floatWait) f.at = Math.max(f.at, now + (k - floatWait) * FLOAT_GAP); });
    floatLast = Math.max(floatLast, floaters[floaters.length - 1].at);
  }


  const gt = G.guide, aim = gt || nearest;
  if (gt) {
    const p = toTile(gt.lat, gt.lng), ex = ox + p.x * T, ey = oy + p.y * T;
    if (ex >= 0 && ey >= 0 && ex <= w && ey <= vh) {
      const by = Math.round(ey - T * 1.3 - (f ? T * 0.15 : 0));
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(ex - T * 0.38, by - T * 0.3); ctx.lineTo(ex + T * 0.38, by - T * 0.3); ctx.lineTo(ex, by + T * 0.2); ctx.fill();
      ctx.fillStyle = '#7ee0ff'; ctx.beginPath(); ctx.moveTo(ex - T * 0.26, by - T * 0.22); ctx.lineTo(ex + T * 0.26, by - T * 0.22); ctx.lineTo(ex, by + T * 0.08); ctx.fill();
    }
  }
  drawTapRing(now);
  if (mzFx.length || mzBanner.t0) drawMzFx(w, cy, Math.max(T, Math.round(16 * dpr)), now, Math.round(16 * dpr));
  if (mazeOn() && gt && (mzNext.want || mzNext.t0)) drawMzNext(w, cy, Math.round(16 * dpr), now);
  if (mazeOn() && gt) { drawMzGoal(gt, ox, oy, T, w, vh, cy, dpr, now); drawMzClock(w, dpr, now); drawMzShelf(w, dpr, now); drawMzViewPanorama(w, dpr, now); drawMzEnergyBar(w, dpr, now); drawMzCubeShelf(w, dpr, now); mzToastDodge(now); }
  else if (gt || (aim && !G.selected)) {
    const p = toTile(aim.lat, aim.lng);
    const ex = ox + p.x * T, ey = oy + p.y * T;
    if (ex < 0 || ey < 0 || ex > w || ey > vh) {
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


  const c0 = camTile(), st = chunkState(Math.floor(c0.x / CHUNK), Math.floor(c0.y / CHUNK));
  const msg = st === 'out' ? 'ここは にしおしの そとだ。' : st === 'fail' ? 'ちずを よみこめなかった。\nしばらくして もういちど ためしてね。'
    : st === 'ok' ? '' : 'ちずを よみこんでいます…';
  $('pxMsg').hidden = !msg;
  if (msg) $('pxMsg').textContent = msg;
  if (rec) { rec.end(); rec = null; ctx = ctx0; }
  dirty = false;



  if (mazeOn() && tapDemo.fresh) {
    if (!tapDemoFresh()) { if (tapDemo.el && !tapDemo.el.hidden && !tapDemo.world) tapDemoHide(); }
    else if (!tapDemo.n && mzRt.path && now - tapDemo.fastT >= DEMO_FAST_MS) { tapDemo.fastT = now; tapDemoTick(); }
  }
}


function hEdgeRun(tx, ty, dx, dy, road) {
  const ox = dy, oy = dx;
  const edge = (x, y) => codeAt(x, y) === C.H && !road(codeAt(x - ox, y - oy)) && codeAt(x + ox, y + oy) === C.H;
  let n = 1;
  for (const s of [1, -1]) for (let k = 1; k <= 2 && edge(tx + dx * k * s, ty + dy * k * s); k++) n++;
  return n;
}


let poiCache = { key: '', list: [] };
function visiblePois(tx0, ty0, tx1, ty1) {
  const key = [Math.floor(tx0 / 8), Math.floor(ty0 / 8), Math.floor(tx1 / 8), Math.floor(ty1 / 8), G.spots.length, chunks.size, landmarks.length].join(',');
  if (poiCache.key === key) return poiCache.list;
  tx0 = Math.floor(tx0 / 8) * 8; ty0 = Math.floor(ty0 / 8) * 8;
  tx1 = Math.floor(tx1 / 8) * 8 + 7; ty1 = Math.floor(ty1 / 8) * 8 + 7;
  const list = [];
  for (let cy = Math.floor((ty0 - 2) / CHUNK); cy <= Math.floor((ty1 + 3) / CHUNK); cy++)
    for (let cx = Math.floor((tx0 - 2) / CHUNK); cx <= Math.floor((tx1 + 2) / CHUNK); cx++) {
      const c = chunks.get(cx + '_' + cy);
      for (const p of (c && c.pois) || []) {
        if (p[0] < tx0 - 2 || p[0] > tx1 + 2 || p[1] < ty0 - 2 || p[1] > ty1 + 3) continue;
        const clash = G.spots.some(s => { const q = toTile(s.lat, s.lng), d = Math.hypot(q.x - p[0], q.y - p[1]); return d < (s.featured ? 4 : 2) || (d < 25 && p[3] && s.name.includes(p[3])); });
        if (!clash) list.push(p);
      }
    }

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


function areaHtml(a) {
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const p = G.areaProgress(a.id), num = v => (Number.isFinite(v) ? v.toLocaleString() : null);
  const facts = [num(a.population) && `人口 ${num(a.population)}人${a.populationAsOf ? `（${esc(a.populationAsOf)}）` : ''}`, num(a.areaKm2) && `面積 約${num(a.areaKm2)}km²`].filter(Boolean);
  const src = (a.sources || []).filter(u => /^https?:\/\//.test(u)).slice(0, 4);
  const srcHtml = src.length ? `<p class="src">出典：${src.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">${i + 1}</a>`).join(' ')}</p>` : '';
  if (SIMPLE()) {
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


let worldMode = false, wcam = null, wscale = 2, wcamOnMe = false;
const WSIZES = [2, 3, 4, 6, 10, 16, 24];

const AREA_LABELS = [['西尾', 34.872, 137.058, 4], ['一色', 34.802, 137.028, 3], ['吉良', 34.818, 137.078, 3], ['幡豆', 34.800, 137.138, 3], ['佐久島', 34.733, 137.040, 3],
  ['岡崎', 34.955, 137.165, 4], ['安城', 34.959, 137.081, 4], ['碧南', 34.885, 136.993, 4], ['幸田', 34.865, 137.166, 3], ['蒲郡', 34.826, 137.219, 4], ['高浜', 34.928, 136.989, 3]];
const SEA_LABELS = [['三河湾', 34.752, 137.105, 4]];
const wT = dpr => Math.round(WSIZES[wscale] * dpr);
function worldCamStart() {
  const me = G.me;
  wcamOnMe = !me;
  if (me && G.inPlay(me.lat, me.lng)) return llToW(me.lat, me.lng);
  return llToW(34.825, 137.07);
}


function drawRollPath(ox, oy, T, now) {
  const RT = window.nishioRollTrail;
  if (!RT || fpsMeter.slow || !rollPath.list.length) return;
  const last = rollPath.list[rollPath.list.length - 1];

  const CREAM = '255,246,220';
  const rgbAt = (x, y) => {
    try {
      if (!RT.colorFor) return CREAM;
      const id = landAreaOf(Math.floor(x), Math.floor(y));
      return (id && RT.colorFor(id)) || CREAM;
    } catch (e) { return CREAM; }
  };
  if (RT.segments) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = T * 0.20;
    let g = null, sum = 0, cnt = 0, wsum = 0, w0 = 0, rgb = CREAM, prev = null, force = true;
    const flush = () => { if (cnt && sum > 0) { ctx.lineWidth = T * 0.20 * (wsum / cnt); ctx.strokeStyle = 'rgba(' + rgb + ',' + (sum / cnt).toFixed(3) + ')'; ctx.stroke(); } };
    const rawSegs = RT.segments(rollPath.list, now);
    let segs = RT.dedupe ? RT.dedupe(rawSegs) : rawSegs;
    if (RT.dedupeSplit) segs = RT.dedupeSplit(segs);
    if (RT.dedupeNear) segs = RT.dedupeNear(segs);
    let ribbonUsed = false;
    const bases = segs.map(s => rgbAt((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2));
    const smooth = RT.smoothColors ? RT.smoothColors(bases) : null;
    if (smooth) { for (let si = 1; si < segs.length; si++) { if (segs[si].g !== segs[si - 1].g) { smooth[si - 1] = bases[si - 1]; smooth[si] = bases[si]; if (si + 1 < segs.length && segs[si + 1].g === segs[si].g) smooth[si + 1] = bases[si + 1]; } } }
    const quads = RT.ribbon ? RT.ribbon(segs) : null;
    if (quads && segs.length && quads.length === segs.length) {
      ribbonUsed = true;
      for (let si = 0; si < segs.length; si++) {
        const q = quads[si], s = segs[si];
        if (!q || !(s.a > 0)) continue;
        ctx.fillStyle = 'rgba(' + ((smooth && smooth[si]) || bases[si]) + ',' + s.a.toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(ox + q.lx1 * T, oy + q.ly1 * T); ctx.lineTo(ox + q.rx1 * T, oy + q.ry1 * T); ctx.lineTo(ox + q.rx2 * T, oy + q.ry2 * T); ctx.lineTo(ox + q.lx2 * T, oy + q.ly2 * T); ctx.closePath(); ctx.fill();
      }
    } else {
    for (let si = 0; si < segs.length; si++) {
      const s = segs[si], base = bases[si];
      let srgb = base, mixed = false;
      if (smooth) { if (smooth[si]) srgb = smooth[si]; }
      else if (prev !== null && base !== prev && RT.mixRgb) { const m = RT.mixRgb(prev, base, 0.5); if (m) { srgb = m; mixed = true; } }
      prev = base;
      const w = (typeof s.w === 'number' && isFinite(s.w) && s.w > 0) ? s.w : 1;
      if (force || mixed || s.g !== g || srgb !== rgb || Math.abs(w - w0) > 0.03) {
        flush(); ctx.beginPath(); ctx.moveTo(ox + s.x1 * T, oy + s.y1 * T); g = s.g; rgb = srgb; sum = 0; cnt = 0; wsum = 0; w0 = w; force = false;
      }
      ctx.lineTo(ox + s.x2 * T, oy + s.y2 * T); sum += Math.max(0, s.a); wsum += w; cnt++;
      if (mixed) force = true;
    }
    flush();
    }
    const a = RT.alphaFor(now - last.t);
    if (a > 0 && !ribbonUsed) { ctx.fillStyle = 'rgba(' + rgbAt(last.x, last.y) + ',' + a.toFixed(3) + ')'; ctx.beginPath(); ctx.arc(ox + last.x * T, oy + last.y * T, T * 0.10, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    return;
  }
  for (const p of rollPath.list) {
    const a = RT.alphaFor(now - p.t);
    if (a <= 0) continue;
    ctx.fillStyle = 'rgba(' + rgbAt(p.x, p.y) + ',' + a.toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(ox + p.x * T, oy + p.y * T, T * 0.10, 0, Math.PI * 2); ctx.fill();
  }
}

function drawRollBloom(ox, oy, T, now) {
  const RT = window.nishioRollTrail;
  if (!RT || !RT.bloomAlpha || !RT.bloomPetal || !rollBloom.list.length) return;
  ctx.save();
  for (const p of rollBloom.list) {
    const a = RT.bloomAlphaAt ? RT.bloomAlphaAt(p, now) : RT.bloomAlpha(now - p.t);
    if (a <= 0) continue;
    const cx = ox + p.x * T, cy = oy + p.y * T;
    ctx.fillStyle = 'rgba(' + (p.n % 2 === 0 ? '255,170,190' : '255,250,240') + ',' + a.toFixed(3) + ')';
    const st = RT.bloomStage ? RT.bloomStage(now - p.t) : { stage: 1, scale: 1 }, sc = st.scale;
    if (!fpsMeter.slow) { const f = RT.bloomPetal(p.n); for (let i = 0; i < (st.stage > 0 ? f.petals : 0); i++) {
      const ang = f.rot + i * Math.PI * 2 / f.petals;
      ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * T * 0.10 * sc, cy + Math.sin(ang) * T * 0.10 * sc, T * 0.08 * sc, 0, Math.PI * 2); ctx.fill();
    } }
    if (!fpsMeter.slow) ctx.fillStyle = 'rgba(240,200,80,' + a.toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(cx, cy, T * 0.06 * sc, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawRollLine(ox, oy, T, now) {
  const RT = window.nishioRollTrail;
  if (!RT || !RT.lineDots || fpsMeter.slow || !rollPath.list || rollPath.list.length < 2) return;
  const prog = calmMotion ? 0.4 : (rollLineT0 ? Math.min(1, Math.max(0, (now - rollLineT0) / 45000)) : 0);
  const dots = RT.lineDots(rollPath.list, calmMotion ? 1 : prog);
  if (!dots || dots.length < 2) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,214,120,' + (0.28 * prog).toFixed(3) + ')';
  ctx.lineWidth = T * 0.03;
  ctx.beginPath();
  dots.forEach((d, i) => { const X = ox + d.x * T, Y = oy + d.y * T; if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); });
  ctx.stroke();
  for (const d of dots) {
    const a = calmMotion ? Math.min(d.a, 0.55 * prog) : d.a;
    if (!(a > 0)) continue;
    ctx.fillStyle = 'rgba(255,236,170,' + a.toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(ox + d.x * T, oy + d.y * T, T * 0.05, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function drawWaterCorners(tx0, ty0, tx1, ty1, ox, oy, T, f) {
  if (!MT.kawakado) return;
  const A = (x, y) => gridAt(x, y) === C.A;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0 - 1; tx <= tx1; tx++) {
    if (!A(tx, ty)) continue;
    for (const [dx, col] of [[1, 0], [-1, 2]]) {
      if (!A(tx + dx, ty - 1) || A(tx + dx, ty) || A(tx, ty - 1)) continue;
      const l1 = gridAt(tx + dx, ty), l2 = gridAt(tx, ty - 1), row = l1 === C.S || l2 === C.S ? 2 : SHORE_TOWN.has(l1) || SHORE_TOWN.has(l2) ? 0 : 1;
      ctx.drawImage(MT.kawakado[row][col + f], ox + tx * T + (dx > 0 ? T : 0) - T / 2, oy + ty * T - T / 2, T, T);
    }
  }
}
const worldAt = (x, y) => (world && x >= 0 && y >= 0 && x < WW && y < WH ? world[y * WW + x] : C.X);

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
    if (code !== C.D) drawRoadShape(X, Y, T, ri >> 1);
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
  if (css <= 6 && worldImg) {
    ctx.fillStyle = WCOL[C.X]; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(worldImg, ox, oy, WW * T, WH * T);
  } else {
    gridAt = worldAt; nbrCur = worldNbr;
    try {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const inside = world && x >= 0 && y >= 0 && x < WW && y < WH;
        const code = inside ? world[y * WW + x] : C.X;
        const v = tileVar(code, x, y), X = ox + x * T, Y = oy + y * T;
        if (!drawLinked(code, x, y, X, Y, T, f)) ctx.drawImage(tiles[code][v % tiles[code].length][tileFrame(code, f, x, y, now)], X, Y, T, T);
      }
      drawWaterCorners(x0, y0, x1, y1, ox, oy, T, f);
    } finally { gridAt = codeAt; nbrCur = nbrCache; }
  }


  if (TRAIL.world.size) {
    const vx0 = Math.max(0, x0), vy0 = Math.max(0, y0), vx1 = Math.min(WW - 1, x1), vy1 = Math.min(WH - 1, y1), seen = [];
    if (TRAIL.world.size <= (vx1 - vx0 + 1) * (vy1 - vy0 + 1)) {
      for (const i of TRAIL.world) { const x = i % WW, y = (i - x) / WW; if (x >= vx0 && x <= vx1 && y >= vy0 && y <= vy1) seen.push(x, y); }
    } else for (let y = vy0; y <= vy1; y++) for (let x = vx0; x <= vx1; x++) if (TRAIL.world.has(y * WW + x)) seen.push(x, y);
    ctx.fillStyle = 'rgba(255,80,150,.5)';
    for (let k = 0; k < seen.length; k += 2) ctx.fillRect(ox + seen[k] * T, oy + seen[k + 1] * T, T, T);
    if (T >= 12) for (let k = 0; k < seen.length; k += 2) drawFoot(C.H, seen[k], seen[k + 1], ox + seen[k] * T, oy + seen[k + 1] * T, T);
  }

  ctx.save();
  for (const c of G.REGION) for (const r of c.rings) {
    ctx.beginPath();
    r.forEach(([la, lo], i) => { const q = llToW(la, lo); ctx[i ? 'lineTo' : 'moveTo'](ox + q.x * T, oy + q.y * T); });
    ctx.setLineDash([]); ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 3.5 * dpr; ctx.stroke();
    ctx.setLineDash([5 * dpr, 4 * dpr]); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.6 * dpr; ctx.stroke();
  }
  ctx.restore();

  const bs = Math.max(T * 1.4, 12 * dpr);
  for (const p of css >= 6 ? worldPois : []) {
    const X = ox + p[0] * T - bs / 2, Y = oy + p[1] * T - bs / 2;
    if (X > w || Y > h || X + bs < 0 || Y + bs < 0) continue;
    if (G.spots.some(s => s.featured && Math.hypot(llToW(s.lat, s.lng).x - p[0], llToW(s.lat, s.lng).y - p[1]) < 1)) continue;
    ctx.drawImage(spotSprites[p[2]][0], Math.round(X), Math.round(Y), bs, bs);
  }

  const size = Math.max(T * 1.6, (WSIZES[wscale] <= 3 ? 12 : 15) * dpr);
  const shopTags = [];
  for (const s of G.spots.filter(worldSpotShown).sort((a, b) => !!a.shop - !!b.shop)) {
    const sz = s.shop ? Math.round(size * 1.35) : size;
    const p = llToW(s.lat, s.lng), X = ox + p.x * T - sz / 2, Y = oy + p.y * T - sz / 2;
    if (X > w || Y > h || X + sz < 0 || Y + sz < 0) continue;
    ctx.drawImage(spriteOf(s)[G.cooldownLeft(s) > 0 ? 1 : 0], Math.round(X), Math.round(Y), sz, sz);
    if (s.shop) shopTags.push([X + sz / 2, Y, sz, s]);
    if (G.state.visits[s.id]) {
      const r = Math.max(3 * dpr, sz * 0.2), cx = Math.round(X + sz - r * 0.6), cy = Math.round(Y + r * 0.6);
      ctx.fillStyle = '#000'; ctx.fillRect(cx - r - dpr, cy - r - dpr, r * 2 + 2 * dpr, r * 2 + 2 * dpr);
      ctx.fillStyle = '#ffd54f'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.fillStyle = '#000'; ctx.font = `${Math.round(r * 1.8)}px "DotGothic16", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✓', cx, cy + dpr * 0.5);
    }
  }
  drawWorldLabels(ox, oy, T, w, h, dpr, css);

  const ci = G.clearInfo && G.clearInfo(), castle = ci && !ci.cleared && G.spots.find(s => s.id === 'f-nishio-castle');
  if (castle) { const p = llToW(castle.lat, castle.lng); goalTag(ox + p.x * T, oy + p.y * T - size / 2, dpr, `👑 しるし ${ci.got}/${ci.need}`); }
  for (const [x, y, sz, s] of shopTags) {
    const t = drawShopTag(x, y, dpr, s);
    shopHits.push([Math.min(t[0], x - sz / 2), t[1], Math.max(t[2], x + sz / 2), y + sz, s]);
  }
  { const pu = (Math.sin(now / 260) + 1) / 2, mk = (o, r0) => {
      const q = llToW(o.lat, o.lng), X = ox + q.x * T, Y = oy + q.y * T;
      if (X < 0 || Y < 0 || X > w || Y > h) return;
      const rr = (r0 + pu * 3) * dpr;
      ctx.lineWidth = 3 * dpr; ctx.strokeStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(X, Y, rr, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2 * dpr; ctx.strokeStyle = `rgba(255,236,150,${0.5 + pu * 0.5})`; ctx.beginPath(); ctx.arc(X, Y, rr, 0, Math.PI * 2); ctx.stroke();
    };
    if (G.glowGoal) mk(G.glowGoal, 10);
    for (const o of G.glowNear) mk(o, 7); }

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
    mzMap.worldGoal = [Math.round(gx), Math.round(gy), tag];
  } else mzMap.worldGoal = null;
  worldToastDodge(mzMap.worldGoal && mzMap.worldGoal[2]);

  if (me) {
    const p = llToW(me.lat, me.lng), hs = Math.max(T * 2, 18 * dpr);
    if (riceBall.cv) drawRiceBall(ox + p.x * T, oy + p.y * T - hs * 0.8 + hs * 17.5 / 32 - 13.5 * hs / 32 * (RICE_BIG - 1), hs * RICE_BIG / 32, f ? 0.14 : -0.14, 1, 1, 0);
    else ctx.drawImage(riceSprites.ready ? riceSprites.right[f] : heroSprites.down[f], Math.round(ox + p.x * T - hs * RICE_BIG / 2), Math.round(oy + p.y * T - hs * 0.8 - hs * (RICE_BIG - 1)), hs * RICE_BIG, hs * RICE_BIG);
  }
  const msg = worldState === 'building' || worldState === 'none' ? 'せかいちずを つくっています…\n（はじめの1回だけ 少し時間がかかります）'
    : worldState === 'fail' ? 'せかいちずを つくれなかった。\nしばらくして もういちど ためしてね。' : '';
  $('pxMsg').hidden = !msg;
  if (msg) $('pxMsg').textContent = msg;
}



const depthArt = [];
const collectedMarks = [];
let giantHits = [];
let poiHits = [];
let shopHits = [];
const SHOP_SIGN = { 'f-ricepia': ['らいすぴあ・秀幸', '#ffffff', '#d7262e'], 'f-kondo-beikoku': ['近藤米穀店', '#f3ead0', '#111111'] };

function seimaiLayout(sx, sy, size) {
  try {
    if (![sx, sy, size].every(v => typeof v === 'number' && isFinite(v)) || size <= 0) return null;
    const ground = sy + size * 0.72, w = size * 0.34, h = size * 0.30, x = sx + size * 0.03, y = ground - h;
    const grains = [[-0.16, -0.01], [-0.08, 0.02], [0, -0.02], [0.08, 0.01], [0.15, -0.01], [-0.04, 0.035], [0.05, 0.04]].map(g => ({ x: x + w * (0.66 + g[0]), y: y + h * (0.84 + g[1]), r: Math.max(1, w * 0.028) }));
    return {
      x, y, w, h, ground,
      machine: { x, y: y + h * 0.26, w: w * 0.36, h: h * 0.74, hopper: [[x + w * 0.02, y + h * 0.18, w * 0.32, h * 0.08], [x + w * 0.05, y + h * 0.1, w * 0.26, h * 0.08], [x + w * 0.08, y, w * 0.2, h * 0.1]], knob: { x: x + w * 0.27, y: y + h * 0.42, w: w * 0.05, h: h * 0.1 } },
      tray: { cx: x + w * 0.66, cy: y + h * 0.88, rx: w * 0.3, ry: h * 0.1 },
      grains,
      lens: { cx: x + w * 0.7, cy: y + h * 0.66, r: w * 0.14, hx0: x + w * 0.7 + w * 0.1, hy0: y + h * 0.66 - w * 0.1, hx1: x + w * 0.94, hy1: y + h * 0.3 },
    };
  } catch (e) { return null; }
}
function drawShopSeimai(sx, sy, size) {
  const L = seimaiLayout(sx, sy, size);
  if (!L) return;
  const R = (x, y, w, h) => ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  const m = L.machine;
  ctx.fillStyle = '#d9dee3'; R(m.x, m.y, m.w, m.h);
  ctx.fillStyle = '#f2f4f6'; R(m.x + m.w * 0.12, m.y, m.w * 0.3, m.h);
  ctx.fillStyle = '#aeb6bd'; R(m.x + m.w * 0.72, m.y, m.w * 0.28, m.h);
  m.hopper.forEach((r, i) => { ctx.fillStyle = i === 2 ? '#f2f4f6' : '#d9dee3'; R(r[0], r[1], r[2], r[3]); ctx.fillStyle = '#aeb6bd'; R(r[0] + r[2] * 0.82, r[1], r[2] * 0.18, r[3]); });
  ctx.fillStyle = '#ffd54f'; R(m.knob.x, m.knob.y, m.knob.w, m.knob.h);
  const t = L.tray;
  ctx.fillStyle = '#8d6e4a'; ctx.beginPath(); ctx.ellipse(t.cx, t.cy, t.rx, t.ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#a98a62'; ctx.beginPath(); ctx.ellipse(t.cx, t.cy - t.ry * 0.15, t.rx * 0.88, t.ry * 0.78, 0, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = '#e3e6e8';
  for (const g of L.grains) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  const l = L.lens;
  ctx.lineCap = 'round'; ctx.strokeStyle = '#4a3b2a'; ctx.lineWidth = Math.max(2, size * 0.012);
  ctx.beginPath(); ctx.moveTo(l.hx0, l.hy0); ctx.lineTo(l.hx1, l.hy1); ctx.stroke();
  ctx.fillStyle = 'rgba(180,220,255,.35)'; ctx.beginPath(); ctx.arc(l.cx, l.cy, l.r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2f2a26'; ctx.lineWidth = Math.max(2, size * 0.01); ctx.beginPath(); ctx.arc(l.cx, l.cy, l.r, 0, Math.PI * 2); ctx.stroke();
}

function riceJourneyLayout(sx, sy, size) {
  try {
    if (![sx, sy, size].every(v => typeof v === 'number' && isFinite(v)) || size <= 0) return null;
    const ground = sy + size * 0.72, x = sx + size * 0.38, w = size * 0.44, r = size * 0.034, cy = ground - size * 0.07;

    const WASH = { ine: ['rgba(255,224,130,.28)', 'rgba(200,225,120,.22)'], momi: ['rgba(255,236,170,.3)', 'rgba(255,214,120,.2)'], genmai: ['rgba(238,210,160,.3)', 'rgba(226,190,140,.2)'], hakumai: ['rgba(255,255,255,.4)', 'rgba(220,235,250,.25)'] };
    const WOB = [[1, .96, .93, .97, .91, .95, .98, .92, .96, .94, .99, .95], [.95, .99, .92, .96, .94, .90, .97, .93, 1, .95, .91, .96], [.93, .97, 1, .94, .98, .92, .95, .99, .90, .96, .94, .97]];
    const stages = ['ine', 'momi', 'genmai', 'hakumai'].map((kind, i) => {
      const cx = x + w * (0.125 + 0.25 * i), c = WASH[kind], rot = b => b.map((_, k) => b[(k + 3 * i) % 12]);
      const wash = [[0, 0, 1.55, 1.2, c[0]], [0.3, 0.15, 1.2, 1.05, c[1]], [-0.25, -0.2, 1.0, 0.85, c[0]]].map(([dx, dy, rx, ry, fill], j) => ({ cx: cx + r * dx, cy: cy + r * dy, rx: r * rx, ry: r * ry, fill, wob: rot(WOB[j]) }));
      return { kind, cx, cy, r, wash };
    });
    const arrows = [0, 1, 2].map(i => ({ x0: stages[i].cx + r * 1.2, x1: stages[i + 1].cx - r * 1.2, y: cy }));
    const pyY = ground + size * 0.065;
    const piles = [{ kind: 'wara', cx: x + w * 0.2, cy: pyY, w: size * 0.07, h: size * 0.035 }, { kind: 'momigara', cx: x + w * 0.5, cy: pyY, w: size * 0.07, h: size * 0.035 }, { kind: 'nuka', cx: x + w * 0.8, cy: pyY, w: size * 0.07, h: size * 0.035 }];
    const links = piles.map((pl, i) => ({ x: (stages[i].cx + stages[i + 1].cx) / 2, y0: cy + r * 0.4, x1: pl.cx, y1: pl.cy - pl.h * 0.6 }));
    return { x, y: cy - r * 1.6, w, h: pyY + size * 0.035 - (cy - r * 1.6), ground, stages, arrows, piles, links };
  } catch (e) { return null; }
}
function drawRiceJourney(sx, sy, size) {
  const L = riceJourneyLayout(sx, sy, size);
  if (!L) return;
  const oval = (cx, cy, rx, ry, fill, line, rot = 0) => {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); ctx.fill();
    if (line) { ctx.strokeStyle = line; ctx.lineWidth = Math.max(1, size * 0.004); ctx.stroke(); }
  };
  const U = [[1, 0], [.866, .5], [.5, .866], [0, 1], [-.5, .866], [-.866, .5], [-1, 0], [-.866, -.5], [-.5, -.866], [0, -1], [.5, -.866], [.866, -.5]];
  const blob = o => {
    const P = U.map((u, i) => [o.cx + u[0] * o.rx * o.wob[i], o.cy + u[1] * o.ry * o.wob[i]]);
    ctx.fillStyle = o.fill; ctx.beginPath();
    ctx.moveTo((P[11][0] + P[0][0]) / 2, (P[11][1] + P[0][1]) / 2);
    for (let i = 0; i < 12; i++) { const a = P[i], b = P[(i + 1) % 12]; ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
    ctx.closePath(); ctx.fill();
  };
  for (const s of L.stages) {
    for (const w of s.wash) blob(w);
    const u = s.r;
    if (s.kind === 'ine') {
      ctx.lineCap = 'round';
      for (let k = -1; k <= 1; k++) {
        ctx.strokeStyle = '#8aa83c'; ctx.lineWidth = Math.max(1, size * 0.005);
        ctx.beginPath(); ctx.moveTo(s.cx + k * u * 0.25, s.cy + u * 0.9); ctx.quadraticCurveTo(s.cx + k * u * 0.4, s.cy - u * 0.2, s.cx + k * u * 0.8, s.cy - u * 0.5); ctx.stroke();
        for (let j = 0; j < 3; j++) oval(s.cx + k * u * (0.5 + 0.1 * j) + u * 0.05, s.cy - u * (0.5 - 0.3 * j) + u * 0.2, u * 0.13, u * 0.2, j % 2 ? '#e8c14a' : '#f2d56b', '#b8942c', 0.4 * k);
      }
    } else if (s.kind === 'momi') {
      ctx.fillStyle = '#e8c96a'; ctx.beginPath(); ctx.moveTo(s.cx - u * 0.16, s.cy - u * 0.72); ctx.lineTo(s.cx, s.cy - u * 1.1); ctx.lineTo(s.cx + u * 0.16, s.cy - u * 0.72); ctx.closePath(); ctx.fill();
      oval(s.cx, s.cy, u * 0.5, u * 0.85, '#f0d68a', '#b8942c');
      ctx.strokeStyle = '#c9a54a'; ctx.lineWidth = Math.max(1, size * 0.003);
      for (const d of [-0.2, 0, 0.2]) { ctx.beginPath(); ctx.moveTo(s.cx + u * d, s.cy - u * 0.65); ctx.lineTo(s.cx + u * d, s.cy + u * 0.65); ctx.stroke(); }
    } else if (s.kind === 'genmai') {
      oval(s.cx, s.cy, u * 0.58, u * 0.78, '#e6c79a', '#a07c4a', 0.3);
      oval(s.cx - u * 0.12, s.cy - u * 0.2, u * 0.12, u * 0.25, '#f3dfbd', null, 0.3);
    } else {
      oval(s.cx + u * 0.12, s.cy + u * 0.78, u * 0.55, u * 0.14, 'rgba(120,140,160,.28)');
      oval(s.cx, s.cy, u * 0.5, u * 0.8, '#ffffff', '#c9d2d9', 0.3);
    }
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#a89a78'; ctx.lineWidth = Math.max(1, size * 0.004);
  for (const a of L.arrows) {
    const h = size * 0.012;
    ctx.beginPath(); ctx.moveTo(a.x0, a.y); ctx.lineTo(a.x1, a.y); ctx.moveTo(a.x1 - h, a.y - h); ctx.lineTo(a.x1, a.y); ctx.lineTo(a.x1 - h, a.y + h); ctx.stroke();
  }
  if (ctx.setLineDash) ctx.setLineDash([2, 3]);
  ctx.strokeStyle = '#b8ab8c';
  for (const lk of L.links) { ctx.beginPath(); ctx.moveTo(lk.x, lk.y0); ctx.lineTo(lk.x, lk.y1 - size * 0.012); ctx.lineTo(lk.x1, lk.y1 - size * 0.012); ctx.lineTo(lk.x1, lk.y1); ctx.stroke(); }
  if (ctx.setLineDash) ctx.setLineDash([]);
  for (const p of L.piles) {
    oval(p.cx, p.cy + p.h * 0.1, p.w * 0.75, p.h * 0.9, p.kind === 'nuka' ? 'rgba(226,200,150,.3)' : 'rgba(255,230,160,.3)');
    if (p.kind === 'wara') {
      ctx.fillStyle = '#e2c25a'; ctx.fillRect(Math.round(p.cx - p.w / 2), Math.round(p.cy - p.h * 0.3), Math.max(1, Math.round(p.w)), Math.max(1, Math.round(p.h * 0.7)));
      ctx.strokeStyle = '#a88a2c'; ctx.beginPath(); ctx.moveTo(p.cx - p.w * 0.1, p.cy - p.h * 0.3); ctx.lineTo(p.cx - p.w * 0.1, p.cy + p.h * 0.4); ctx.stroke();
    } else if (p.kind === 'momigara') {
      oval(p.cx - p.w * 0.2, p.cy, p.w * 0.22, p.h * 0.45, '#ecd27c', '#b8942c', -0.4);
      oval(p.cx + p.w * 0.2, p.cy + p.h * 0.1, p.w * 0.22, p.h * 0.45, '#f4e29c', '#b8942c', 0.4);
    } else {
      ctx.fillStyle = '#d8b98a'; ctx.beginPath(); ctx.moveTo(p.cx - p.w * 0.5, p.cy + p.h * 0.5); ctx.quadraticCurveTo(p.cx, p.cy - p.h * 1.1, p.cx + p.w * 0.5, p.cy + p.h * 0.5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#a98a5c'; ctx.stroke();
    }
  }
}

function giantWashLayout(sx, sy, size) {
  try {
    if (![sx, sy, size].every(v => typeof v === 'number' && isFinite(v)) || size <= 0) return null;
    const ground = sy + size * 0.72, cx = sx + size / 2, cy = ground - size * 0.01;
    const layers = [
      { cx, cy, rx: size * 0.46, ry: size * 0.13, fill: 'rgba(255,240,190,.22)', wob: [1, .96, .93, .97, .91, .95, .98, .92, .96, .94, .99, .95] },
      { cx: cx - size * 0.06, cy: cy + size * 0.015, rx: size * 0.38, ry: size * 0.105, fill: 'rgba(170,210,140,.18)', wob: [.95, .99, .92, .96, .94, .90, .97, .93, 1, .95, .91, .96] },
      { cx: cx + size * 0.07, cy: cy - size * 0.01, rx: size * 0.30, ry: size * 0.085, fill: 'rgba(170,210,240,.16)', wob: [.93, .97, 1, .94, .98, .92, .95, .99, .90, .96, .94, .97] },
    ];

    const SPOTS = [
      [[.13, -.012, .11, .032, 'rgba(255,255,255,.12)', [.96, 1, .92, .97, .94, .99, .91, .95, .98, .93, .96, .90]], [-.15, .014, .13, .036, 'rgba(215,175,80,.10)', [.94, .98, .95, 1, .91, .96, .93, .99, .92, .97, .90, .95]]],
      [[.10, .010, .10, .030, 'rgba(105,165,80,.10)', [.92, .96, 1, .94, .98, .91, .95, .97, .93, .99, .90, .96]], [-.11, -.010, .09, .026, 'rgba(255,255,255,.11)', [.98, .93, .96, .91, 1, .95, .92, .97, .94, .90, .99, .96]]],
      [[.07, -.008, .08, .024, 'rgba(255,255,255,.13)', [.95, .91, .99, .96, .93, 1, .94, .90, .97, .98, .92, .96]], [-.09, .009, .085, .025, 'rgba(90,150,200,.10)', [.97, .94, .90, .98, .95, .92, 1, .96, .91, .99, .93, .95]]],
    ];

    const haloFill = (fill, k) => fill.replace(/,\s*(\.\d+)\)$/, (m, a) => ',' + String(Math.round(parseFloat(a) * k * 1000) / 1000).replace(/^0(?=\.)/, '') + ')');

    const halo = (sp, A) => [[1.30, 1 / 6], [1.15, 1 / 3]].map(([m, k]) => ({ rx: sp.rx * m, ry: sp.ry * m, fill: haloFill(A, k) }));
    layers.forEach((l, i) => { l.spots = SPOTS[i].map(([dx, dy, rx, ry, fill, wob]) => ({ cx: l.cx + size * dx, cy: l.cy + size * dy, rx: size * rx, ry: size * ry, fill: haloFill(fill, 1 / 2), wob, A: fill })); l.spots.forEach(sp => { sp.halo = halo(sp, sp.A); delete sp.A; }); });
    return { x: cx - size * 0.46, y: cy - size * 0.13, w: size * 0.92, h: size * 0.26, ground, cx, cy, layers };
  } catch (e) { return null; }
}
function drawGiantWash(sx, sy, size) {
  const L = giantWashLayout(sx, sy, size);
  if (!L) return;
  const U = [[1, 0], [.866, .5], [.5, .866], [0, 1], [-.5, .866], [-.866, .5], [-1, 0], [-.866, -.5], [-.5, -.866], [0, -1], [.5, -.866], [.866, -.5]];
  const blob = o => {
    const P = U.map((u, i) => [o.cx + u[0] * o.rx * o.wob[i], o.cy + u[1] * o.ry * o.wob[i]]);
    ctx.fillStyle = o.fill; ctx.beginPath();
    ctx.moveTo((P[11][0] + P[0][0]) / 2, (P[11][1] + P[0][1]) / 2);
    for (let i = 0; i < 12; i++) { const a = P[i], b = P[(i + 1) % 12]; ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
    ctx.closePath(); ctx.fill();
  };
  for (const l of L.layers) { blob(l); for (const sp of l.spots) { for (const h of sp.halo) blob({ cx: sp.cx, cy: sp.cy, rx: h.rx, ry: h.ry, fill: h.fill, wob: sp.wob }); blob(sp); } }
}
function drawShopTag(cx, bottom, dpr, s) {
  gbPause++;
  try { return shopTag(cx, bottom, dpr, s); } finally { gbPause--; }
}

function poiTag(cx, bottom, dpr, name) {
  const text = String(name || '').slice(0, 14);
  if (!text) return null;
  const fs = Math.round(11 * dpr), pad = Math.round(3 * dpr), b = Math.max(1, Math.round(dpr));
  ctx.font = `${fs}px "DotGothic16", monospace`;
  const bw = Math.ceil(ctx.measureText(text).width) + pad * 2, bh = fs + pad * 2;
  const x = Math.round(cx - bw / 2), y = Math.round(bottom - bh - 2 * dpr);
  ctx.fillStyle = '#000'; ctx.fillRect(x - b, y - b, bw + b * 2, bh + b * 2);
  ctx.fillStyle = '#fff'; ctx.fillRect(x, y, bw, bh);
  ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x + bw / 2, y + bh / 2 + dpr * 0.5);
  return [x - b, y - b, x + bw + b, y + bh + b];
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







const wtd = { key: '' }, WT_MODES = ['wlow', 'wside', 'wfloor'];
function worldToastDodge(tag, avoid = []) {
  const el = document.getElementById('toast');
  if (!el) return;
  if (!el.classList.contains('show') || !tag) { if (WT_MODES.some(m => el.classList.contains(m))) el.classList.remove(...WT_MODES); wtd.key = ''; return; }
  const r = cv.getBoundingClientRect(), k = r.width / cv.width, T = [r.left + tag[0] * k, r.top + tag[1] * k, r.left + tag[2] * k, r.top + tag[3] * k];
  const A = avoid.map(a => a.page ? a.page : [r.left + a[0] * k, r.top + a[1] * k, r.left + a[2] * k, r.top + a[3] * k]);
  const cur = WT_MODES.find(m => el.classList.contains(m)) || '', key = [T, ...A].map(q => q.map(Math.round).join()).join('/') + '|' + cur + '|' + el.textContent + '|' + innerWidth + 'x' + innerHeight;
  if (key === wtd.key) return;
  wtd.key = key;
  const posAt = (m, x) => {
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
  const top = posAt(''), here = posAt(cur, parseFloat(el.style.getPropertyValue('--toast-x')) || 0), M = 62;
  if (cur && A.some(a => over(here, a))) { set(''); return; }
  const out = cur === 'wside' && (here.left < M - 1 || here.right > innerWidth - M + 1);
  if (!over(here, T) && !out) { if (cur && cur !== 'wlow' && clear(top)) set(''); return; }
  const low = posAt('wlow');
  if (cur !== 'wlow' && clear(low)) { set('wlow'); return; }
  if (cur === 'wlow' && clear(top)) { set(''); return; }
  const w = top.width, R = T[2] + 8 + w / 2, L = T[0] - 8 - w / 2;
  for (const x of (T[0] + T[2]) / 2 < innerWidth / 2 ? [R, L] : [L, R]) if (x - w / 2 >= M && x + w / 2 <= innerWidth - M && clear(posAt('wside', x))) { set('wside', x); return; }
  if (clear(posAt('wfloor'))) set('wfloor');
  else if (out) set('');
}
let toastDodgeOff = false;
function mzToastDodge(now) {
  if (toastDodgeOff) return;
  const avoid = [];
  const rb = document.getElementById('reactBar');
  if (rb && !rb.hidden) { const b = rb.getBoundingClientRect(); avoid.push({ page: [b.left, b.top, b.right, b.bottom] }); }

  worldToastDodge(mazeOn() && G.guide && !rec ? mzMap.arrow || mzMap.ring : null, avoid);
}
function goalTag(cx, bottom, dpr, text) {
  const fs = Math.round(13 * dpr), pad = Math.round(3 * dpr), b = Math.max(1, Math.round(dpr)), W = ctx.canvas.width, edge = 4 * dpr;
  ctx.font = `${fs}px "DotGothic16", monospace`;

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
  return !!s.featured;
}

let areaBoxes = [];
function drawWorldLabels(ox, oy, T, w, h, dpr, css) {
  const minRank = css <= 3 ? 3 : css <= 6 ? 2 : 1;
  const areas = G.areas || [];
  const base = worldLabels.length ? worldLabels : areas.length ? [] : AREA_LABELS.map(([n, la, lo, r]) => { const p = llToW(la, lo); return [p.x, p.y, n, r]; });

  const boxes = [];
  areaBoxes = [];
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const a of css <= 10 ? areas : []) {
    const q = llToW(a.lat, a.lng), X = ox + q.x * T, Y = oy + q.y * T, pr = G.areaProgress(a.id);

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

  const towns = css >= 10 ? base.filter(l => l[4] === 'tw') : [];
  const list = base.filter(l => l[4] !== 'tw').concat(SEA_LABELS.map(([n, la, lo, r]) => { const p = llToW(la, lo); return [p.x, p.y, n, r]; }))
    .filter(l => l[3] >= minRank)

    .filter(l => !isStation(l) || !spotNames.some(n => n[2].endsWith('駅') && n[2].includes(l[2].replace(/駅$/, '')) && Math.hypot(n[0] - l[0], n[1] - l[1]) < 3))
    .sort((a, b) => b[3] - a[3]).concat(spotNames, towns)
    .filter(l => !SIMPLE() || (l[3] >= 3 && l[4] !== 'rv' && l[4] !== 'tw'));
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

  const featured = G.spots.filter(worldSpotShown);
  const flag = !worldProgress && SIMPLE() && window.NSG_ICONS && NSG_ICONS.canvas('flag');
  const corner = worldProgress || (featured.length ? `${flag ? '' : 'めぐった名所 '}${featured.filter(s => G.state.visits[s.id]).length}/${featured.length}` : '');
  if (corner) {
    const fs = Math.round(12 * dpr), ic = flag ? Math.round(12 * dpr) + 4 * dpr : 0;
    ctx.font = `${fs}px "DotGothic16", monospace`; ctx.textAlign = 'left';
    const tw = ctx.measureText(corner).width;
    const y0 = 44 * dpr;
    ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(8 * dpr, y0, tw + ic + 16 * dpr, fs + 12 * dpr);
    if (flag) ctx.drawImage(flag, 16 * dpr, y0 + 6 * dpr, fs, fs);
    ctx.fillStyle = '#fff'; ctx.fillText(corner, 16 * dpr + ic, y0 + (fs + 12 * dpr) / 2);
  }
}
function setWorld(on) {
  worldMode = on;
  if (!on && G.toastDismiss) G.toastDismiss('🌏 ゴールは 🏁 の 所（👣 で めいろに もどる）');
  document.body.classList.toggle('pxw', on);
  $('pxWorld').innerHTML = on ? ICO('feet', '👣', '歩く地図') : ICO('globe', '🌏', 'せかいちず');
  $('pxWorld').title = on ? '歩く地図にもどる' : '西尾市ぜんたいの地図';
  $('pxWorld').setAttribute('aria-label', on ? '歩く地図にもどる' : 'せかいちず（西尾市と となりの市町）');
  $('pxInfo').hidden = true;
  if (on) { wcam = worldCamStart(); worldCamFitGoal(); buildWorld(); }
  try { localStorage.setItem('nsg_world_on', on ? '1' : '0'); } catch (e) {  }
  firstWalkBtns();
  updatePad();
  updateHarvestBtn();
  updateDankyuBtn();
}
$('pxWorld').addEventListener('click', () => setWorld(!worldMode));
function firstWalkBtns() {
  const fw = firstWalk();


  for (const id of ['pxWorld', 'pxMeiro']) { const b = $(id); if (b) b.hidden = fw && !(id === 'pxWorld' && worldMode); }
}
firstWalkBtns();

function worldCamFitGoal() {
  const me = G.me, g = mazeBack() && G.guide;
  if (!me || !g || g.lat == null || !G.inPlay(me.lat, me.lng)) return;
  updateCover();

  const a = llToW(me.lat, me.lng), b = llToW(g.lat, g.lng), W = cv.clientWidth || 360, H = cv.clientHeight || 600, Hv = Math.max(120, H - cover);
  let i = WSIZES.length - 1;
  while (i > 0 && (Math.abs(a.x - b.x) * WSIZES[i] > W * 0.7 || Math.abs(a.y - b.y) * WSIZES[i] > Hv * 0.55)) i--;
  wscale = i;
  wcam = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + (H - Hv) / 2 / WSIZES[i] }; wcamOnMe = false;
}

function centerOnMe() { if (worldMode) wcam = worldCamStart(); }

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


const riceTouch = { down: null, tap: null, shakeAt: -Infinity };
function ricePlayReady() {
  return active && !document.hidden && !worldMode && !driving && !meiroPause
    && howtoEl.hidden && !mapCovered() && !!roll.last && !!roll.box;
}
function ricePlayHop() {
  roll.happyT = Math.max(roll.happyT, 1.2);
  if (!calmMotion && roll.h <= 0) { roll.hv = 1.8; roll.h = 0.001; }
  dirty = true;
}
function riceTouchNear(e) {
  if (!ricePlayReady()) return false;
  const r = cv.getBoundingClientRect(), b = roll.box;
  if (!r.width || !r.height) return false;
  const x = (e.clientX - r.left) * cv.width / r.width, y = (e.clientY - r.top) * cv.height / r.height;
  const px = 12 * cv.width / r.width, py = 12 * cv.height / r.height;
  return x >= b[0] - px && x <= b[2] + px && y >= b[1] - py && y <= b[3] + py;
}
function riceTouchReset() { riceTouch.down = riceTouch.tap = null; }
document.addEventListener('pointerdown', e => {
  if (e.target !== cv || !e.isPrimary || e.button !== 0 || !riceTouchNear(e)) { riceTouchReset(); return; }
  riceTouch.down = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now() };
}, { capture: true, passive: true });
cv.addEventListener('pointermove', e => {
  const d = riceTouch.down;
  if (d && e.pointerId === d.id && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) riceTouchReset();
}, { passive: true });
cv.addEventListener('pointerup', e => {
  const d = riceTouch.down, prev = riceTouch.tap, now = performance.now();
  riceTouch.down = null;
  if (!d || e.pointerId !== d.id || now - d.at > 400 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || !riceTouchNear(e)) { riceTouchReset(); return; }
  if (prev && now - prev.at <= 360 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) <= 28) {
    riceTouch.tap = null; ricePlayHop();
  } else riceTouch.tap = { x: e.clientX, y: e.clientY, at: now };
}, { passive: true });
cv.addEventListener('pointercancel', riceTouchReset, { passive: true });
window.addEventListener('blur', riceTouchReset);
document.addEventListener('visibilitychange', riceTouchReset);


function setActive(on) {
  active = on;
  if (!on && driving) setDriving(false);
  document.body.classList.toggle('px', on);
  try { localStorage.setItem('nsg_view', on ? 'px' : 'map'); } catch (e) {  }
  updatePad();
  cancelAnimationFrame(raf);
  if (on) { lastT = 0; raf = requestAnimationFrame(frame); }
  else { if (mzNext.hold) { mzNext.hold = false; if (G.toastFlush) G.toastFlush(); } G.invalidateMap(); if (window.NSG_GODOT) NSG_GODOT.idle(); }
}
function updatePad() {
  firstWalkBtns();

  $('pxPad').hidden = !(active && G.demo);
  G.sound.scene(active && worldMode ? 'world' : 'field');
}

$('pxZoomIn').addEventListener('click', () => {
  if (!worldMode) return setScale(curScale() + 1);
  if (wscale < WSIZES.length - 1) wscale++; else { setScale(1); setWorld(false); }
});
$('pxZoomOut').addEventListener('click', () => {
  if (worldMode) { wscale = Math.max(0, wscale - 1); return; }
  if (curScale() > 1) setScale(curScale() - 1); else { wscale = WSIZES.length - 1; setWorld(true); }
});
{
  const t = $('nightToggle');
  if (t) { t.checked = nightOn; t.addEventListener('change', () => { nightOn = t.checked; try { localStorage.setItem('nsg_night', nightOn ? '1' : '0'); } catch (e) {  } dirty = true; }); }
}
{
  const t = $('gbToggle');
  if (t) { t.checked = gbOn; t.addEventListener('change', () => { gbOn = t.checked; try { localStorage.setItem('nsg_gb', gbOn ? '1' : '0'); } catch (e) {  } dirty = true; }); }
}
function setScale(v) {
  const k = Math.min(4, Math.max(1, v)), mz = mazeOn();
  if (mz) mzScale = k; else scale = k;
  try { localStorage.setItem(mz ? 'nsg_mz_scale' : 'nsg_px_scale', k); } catch (e) {  }
}
function curScale() { return mazeOn() ? mzScale : scale; }


const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const medashiShown = () => !!document.querySelector('.medashi:not([hidden])');
function step(dir) {
  if (!G.demo || sightBusy()) return false;
  G.notePlayInput();
  const t = targetTile();
  const nx = Math.floor(t.x) + DIRS[dir][0], ny = Math.floor(t.y) + DIRS[dir][1];
  facing = dir;
  if (driving) {
    if (!CAR_OK.has(codeAt(nx, ny)) || npcAt(nx, ny)) return false;
    const ll = toLatLng(nx + 0.5, ny + 0.5);
    G.moveTo(ll.lat, ll.lng, 'step');
    return true;
  }


  const cx0 = Math.floor(t.x), cy0 = Math.floor(t.y);
  if (mazeOn()) { if (mzBlocked(cx0 + 0.5, cy0 + 0.5, nx + 0.5, ny + 0.5)) return false; }
  else {
    const escape = BLOCK.has(codeAt(cx0, cy0)) && codeAt(nx, ny) !== C.X && exitDist(nx, ny) < exitDist(cx0, cy0);
    if (BLOCK.has(codeAt(nx, ny)) && !escape) return false;
  }
  const who = npcAt(nx, ny);
  if (who) { if ($('pxInfo').hidden) openNpc(who); return true; }
  const ll = toLatLng(nx + 0.5, ny + 0.5);
  G.moveTo(ll.lat, ll.lng, 'step');
  sightCheck();
  critterStep(nx, ny);
  return true;
}




let rollOn = (() => { try {

  if (!localStorage.getItem('nsg_roll_v2')) { localStorage.setItem('nsg_roll_v2', '1'); localStorage.setItem('nsg_roll', '1'); }
  return localStorage.getItem('nsg_roll') !== '0';
} catch (e) { return true; } })();
const rp = { x: null, y: null, vx: 0, vy: 0, sent: null, tile: '', bump: 0 };
const npcBump = { id: '', x: 0, y: 0, met: new Set(), gkey: '', carry: null };
function npcMetSync() {


  if (mazeOn()) mzRoute(performance.now());
  if (npcBump.gkey !== mzRt.gkey) { npcBump.gkey = mzRt.gkey; npcBump.met.clear(); }
  { const c = npcBump.carry; if (c && c.to) { if (c.to === mzRt.gkey) npcBump.met.add(c.id); npcBump.carry = null; } }
}



function npcGreet(n, tx, ty) {
  if (mazeOn()) npcMetSync();
  const g0 = G.state.guide;
  npcBump.id = n.id; npcBump.x = tx; npcBump.y = ty; if (mazeOn()) npcBump.met.add(n.id); openNpc(n);
  const g1 = G.state.guide;
  if (mazeOn() && g1 && g1 !== g0 && g1.byId === n.id) npcBump.carry = { id: n.id, from: mzRt.gkey };
}
const rk = { up: 0, down: 0, left: 0, right: 0 };
const tiltG = { x: 0, y: 0, on: false, base: null, n: 0, asked: false, retry: false, walkTold: false };
const TILT_DEGS = [9, 12, 16];
tiltG.deg = (() => { try { const v = +localStorage.getItem('nsg_tilt'); let m; if (localStorage.getItem('nsg_tilt_v') === '2') m = TILT_DEGS.includes(v) ? v : 12; else { const MIG = { 15: 9, 20: 12, 26: 16, 12: 9, 16: 12, 21: 16 }; m = MIG[v] || 12; } try { localStorage.setItem('nsg_tilt', String(m)); localStorage.setItem('nsg_tilt_v', '2'); } catch (e) {  } return m; } catch (e) { return 12; } })();
if ($('tiltSens')) { $('tiltSens').value = String(tiltG.deg); $('tiltSens').addEventListener('change', e => { const v = +e.target.value; if (!TILT_DEGS.includes(v)) return; tiltG.deg = v; try { localStorage.setItem('nsg_tilt', String(v)); localStorage.setItem('nsg_tilt_v', '2'); } catch (er) {  } }); }
let mzHitStop = 0;
const MZ_HIT_STOP = 5, MZ_HIT_STOP_MS = 45;
const MZ_GOAL_STOP_MS = 100;
const mzGoalStop = { at: 0, until: 0 };
const ROLL_ACC = 7, ROLL_MAX = 4.2, ROLL_BOUNCE = 0.25, ROLL_STICK = 0.6;

const ROLL_CRR = 0.9, ROLL_LIN = 0.28, ROLL_AIR = 0.12;





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

  if (tiltG.angle !== ang) { tiltReset(); tiltG.angle = ang; rp.vx = rp.vy = 0; }
  tiltG.on = true;
  let lr = e.gamma, fb = e.beta;
  if (ang === 90 || ang === -270) { lr = e.beta; fb = -e.gamma; }
  else if (ang === -90 || ang === 270) { lr = -e.beta; fb = e.gamma; }
  else if (Math.abs(ang) === 180) { lr = -e.gamma; fb = -e.beta; }
  const te = e.timeStamp || performance.now();
  if (!tiltG.base && tiltG.keep) {
    const k = tiltG.keep;
    tiltG.keep = null;
    if (k.angle === ang && Math.abs(tiltDelta(lr, k.lr)) <= TILT_KEEP_DEG && Math.abs(tiltDelta(fb, k.fb)) <= TILT_KEEP_DEG) { tiltG.base = k.base; tiltG.n = 2; tiltG.t = te; }
  }
  tiltG.lr = lr; tiltG.fb = fb;
  if (!tiltG.base) { tiltG.base = { lr, fb }; tiltG.n = 1; tiltG.t = te; return; }

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
function tiltReset() { tiltG.base = null; tiltG.n = 0; tiltG.t = 0; tiltG.x = tiltG.y = 0; tiltG.keep = null; }





const TILT_KEEP_DEG = 4;
function tiltPause() {
  const keep = tiltG.base && tiltG.n >= 2 && Number.isFinite(tiltG.lr) ? { base: tiltG.base, lr: tiltG.lr, fb: tiltG.fb, angle: tiltG.angle } : tiltG.keep;
  tiltReset();
  tiltG.keep = keep || null;
  rp.vx = rp.vy = 0;
}
function tiltNeedsPermission() { return !!(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function'); }

window.addEventListener('devicemotion', e => {
  if (!ricePlayReady()) return;
  const needs = tiltNeedsPermission() || (window.DeviceMotionEvent && typeof window.DeviceMotionEvent.requestPermission === 'function');
  const { on: tiltIsOn } = tiltG;
  if (needs && !tiltIsOn) return;
  const now = performance.now();
  if (now - riceTouch.shakeAt < 1500) return;
  const valid = a => a && Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z);
  const a = valid(e.acceleration) ? e.acceleration : e.accelerationIncludingGravity;
  if (!valid(a)) return;
  const strength = Math.abs(Math.hypot(a.x, a.y, a.z) - (a === e.acceleration ? 0 : 9.81));
  if (strength < 12) return;
  riceTouch.shakeAt = now; ricePlayHop();
}, { passive: true });







const TILT_BTN = { labelMs: 20000, okMs: 1500 };
const tiltBtn = $('pxTilt');
function tiltBtnWanted() {
  return !!tiltBtn && tiltNeedsPermission() && !tiltG.on && !tiltG.granted && navigator.maxTouchPoints > 0 && !!G.demo && rollOn;
}
function tiltBtnSync() {
  if (!tiltBtn || tiltBtn.classList.contains('ok')) return;
  const want = tiltBtnWanted();
  if (tiltBtn.hidden !== !want) tiltBtn.hidden = !want;
  if (!want) return;
  const prev = lsGet('nsg_tilt_ok', ''), quiet = (tiltG.asked && !tiltG.retry) || prev === '0', pro = !quiet && prev === '1';
  const lab = !quiet && (pro || performance.now() < TILT_BTN.labelMs);
  tiltBtn.classList.toggle('lab', lab); tiltBtn.classList.toggle('pro', pro); tiltBtn.classList.toggle('quiet', quiet);
}
function tiltBtnOk() {
  if (!tiltBtn) return;
  tiltBtn.hidden = false; tiltBtn.className = 'lab ok'; tiltBtn.querySelector('.tx').textContent = 'OK';
  setTimeout(() => { tiltBtn.classList.remove('ok'); tiltBtn.hidden = true; tiltBtn.querySelector('.tx').textContent = 'かたむけて ころがす'; tiltBtnSync(); }, TILT_BTN.okMs);
}
if (tiltBtn) tiltBtn.addEventListener('click', e => {
  if (tiltBtn.classList.contains('ok')) return;
  if (tiltG.asked && !tiltG.retry) { G.toast('地図を タップして 遊べるよ'); return; }
  tiltAsk(e);
});

const DEMO_IDLE_MS = 2000;
const DEMO_WORLD_MS = 6000;





const DEMO_TAP_MS = 900, DEMO_AHEAD = 3;




const DEMO_MOVE = 0.05;
const DEMO_SLOP = [[0, 0], [0, 1], [1, 0], [-1, 0], [0, -1]], DEMO_SLOP_PX = 18, DEMO_NEAR_PX = 40, DEMO_CELLS = [0, -1, 1, -2, 2, 3, 4], DEMO_TILES = [[1, 1], [1, 0], [0, 1], [2, 1], [1, 2], [0, 0], [2, 0], [0, 2], [2, 2]];
function tapDemoWalks(q, slop, spots) {
  if (q.x < 24 || q.x > window.innerWidth - 24) return false;
  const r = cv.getBoundingClientRect(), dpr = cv.width / r.width, a = mzMap.arrow;
  for (const [ox, oy] of DEMO_SLOP) {
    if (!slop && (ox || oy)) break;
    const px = q.x + ox * slop, py = q.y + oy * slop;
    if (document.elementFromPoint(px, py) !== cv) return false;
    const x = (px - r.left) * dpr, y = (py - r.top) * dpr;
    if (a && x >= a[0] && x <= a[2] && y >= a[1] && y <= a[3]) return false;
    if (shopHits.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)) return false;
    if (fieldHit(x, y, spots)) return false;
  }
  return true;
}





const DEMO_HAND_TAP = 20;
const DEMO_HAND = { w: 44, h: 38, move: 14, pad: 2 }, DEMO_LAB = { w: 96, h: 32, gap: 4, top: 8, below: 46 };



const DEMO_HAND1 = { w: 60, h: 56, move: 14, pad: 2 }, DEMO_LAB1 = { w: 146, h: 58, gap: 3, top: 7, below: 61 };



function demoWinAt(cx, cy) {
  const r = cv.getBoundingClientRect(), dpr = cv.width / r.width, x = (cx - r.left) * dpr, y = (cy - r.top) * dpr;
  return shopHits.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1) || !!fieldHit(x, y);
}
function demoHandClear(q, up, H, near) {
  const r = H.h + H.move + H.pad, xs = [q.x - H.w / 2 + 4, q.x, q.x + H.w / 2 - 4];
  for (let k = 0; k <= 5; k++) { const y = q.y + (up ? -1 : 1) * r * k / 5; for (const x of xs) if (!tapDemoWalks({ x, y }, 0, near)) return false; }
  return true;
}
function tapDemoLayout(q, first, rc, box, upOk) {
  const big = first === 'big', H = big ? DEMO_HAND1 : DEMO_HAND, Lb = big ? DEMO_LAB1 : DEMO_LAB, reach = H.h + H.move + H.pad;
  const fits = b => b[0] >= box[0] && b[1] >= box[1] && b[2] <= box[2] && b[3] <= box[3] && !(box[4] && b[0] < box[4][2] && b[2] > box[4][0] && b[1] < box[4][3] && b[3] > box[4][1])
    && !(box[5] || []).some(r => b[0] < r[2] && b[2] > r[0] && b[1] < r[3] && b[3] > r[1]);
  const hitsRice = b => b[0] < rc.x + 20 && b[2] > rc.x - 20 && b[1] < rc.y + 14 && b[3] > rc.y - 26;
  const pref = q.y <= rc.y - 20;
  for (const up of [pref, !pref]) {
    const hand = up ? [q.x - H.w / 2, q.y - reach, q.x + H.w / 2, q.y] : [q.x - H.w / 2, q.y, q.x + H.w / 2, q.y + reach];
    if (!fits(hand) || hitsRice(hand)) continue;
    if (upOk && !upOk(up)) continue;
    if (upOk && first && !demoHandClear(q, up, H, box.near)) continue;
    if (!first) return { up, side: '' };
    const below = [q.x - Lb.w / 2, q.y + Lb.below, q.x + Lb.w / 2, q.y + Lb.below + Lb.h + H.move + H.pad];
    if (!up && fits(below) && !hitsRice(below)) return { up, side: '' };
    const y0 = up ? q.y - Lb.top - Lb.h - H.move - H.pad : q.y + Lb.top, y1 = up ? q.y - Lb.top : q.y + Lb.top + Lb.h + H.move + H.pad;
    const right = [q.x + H.w / 2 + Lb.gap, y0, q.x + H.w / 2 + Lb.gap + Lb.w, y1], left = [q.x - H.w / 2 - Lb.gap - Lb.w, y0, q.x - H.w / 2 - Lb.gap, y1];
    for (const [side, b] of q.x >= rc.x ? [['lr', right], ['ll', left]] : [['ll', left], ['lr', right]]) if (fits(b) && !hitsRice(b)) return { up, side };
  }
  return null;
}





function tapDemoGoalSpot(slop, first, rc, box, near) {
  const gt = G.guide;
  if (!gt || !mazeOn() || rp.x === null) return null;
  {
    const gp = toTile(gt.lat, gt.lng), reachT = G.reachOf(gt) / TILE_M, c0 = [Math.floor(rp.x / MZ_K), Math.floor(rp.y / MZ_K)];
    const seen = new Map([[c0.join(), 0]]), q0 = [c0], cand = [];
    while (q0.length) {
      const [x, y] = q0.shift(), dd = seen.get(x + ',' + y);
      const gd = Math.hypot(x * MZ_K + MZ_K / 2 - gp.x, y * MZ_K + MZ_K / 2 - gp.y);
      if (dd && gd <= reachT) cand.push([x, y, gd]);
      if (dd >= 6) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (x + dx) + ',' + (y + dy); if (!seen.has(k) && mzOpen(x, y, dx, dy)) { seen.set(k, dd + 1); q0.push([x + dx, y + dy]); } }
    }
    cand.sort((a, b) => a[2] - b[2]);
    for (const [x, y] of cand) for (const [dx, dy] of DEMO_TILES) {
      const q = tileClient(x * MZ_K + dx, y * MZ_K + dy);
      if (Math.hypot(q.x - rc.x, q.y - rc.y) < DEMO_NEAR_PX) continue;
      const lay = tapDemoLayout(q, first, rc, box);
      if (lay && tapDemoWalks(q, slop, near)) return { q, up: lay.up, side: lay.side, hand: false, goal: true };
    }
  }
  return null;
}
function tapDemoSpot(path, first) {

  if (first === true) { const sp = tapDemoSpot(path, 'big'); if (sp && sp.hand) return { ...sp, big: true }; }
  const last = path.length - 1, base = Math.min(DEMO_AHEAD, last), rc = tileClient(rp.x - 0.5, rp.y - 0.5);
  const c = camTile(), near = G.spots.filter(s => (p => Math.abs(p.x - c.x) < 30 && Math.abs(p.y - c.y) < 40)(toTile(s.lat, s.lng)));
  const cr = cv.getBoundingClientRect(), sh = $('sheet') ? $('sheet').getBoundingClientRect() : null, tb = tiltBtn && !tiltBtn.hidden ? tiltBtn.getBoundingClientRect() : null;
  const box = [Math.max(0, cr.left), cr.top, Math.min(window.innerWidth, cr.right), Math.min(cr.bottom, sh && sh.height ? sh.top : cr.bottom), tb && tb.width ? [tb.left, tb.top, tb.right, tb.bottom] : null];
  box.near = near;
  if (first === 'big') box[5] = [...document.querySelectorAll('#pxView button')].filter(b => b !== tiltBtn && !b.closest('#pxInfo')).map(b => b.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0).map(r => [r.left - 4, r.top - 4, r.right + 4, r.bottom + 4]);


  for (const slop of [DEMO_SLOP_PX, 0]) {
    let plain = null;
    for (const d of DEMO_CELLS) {
      const i = base + d;
      if (i < 1 || i > last) continue;
      for (const [dx, dy] of DEMO_TILES) {
        const q = tileClient(path[i][0] * MZ_K + dx, path[i][1] * MZ_K + dy);
        if (Math.hypot(q.x - rc.x, q.y - rc.y) < DEMO_NEAR_PX) continue;
        const lay = tapDemoLayout(q, first, rc, box);
        if (!lay || !tapDemoWalks(q, slop, near)) continue;
        const hand = tapDemoLayout(q, first, rc, box, up => tapDemoWalks({ x: q.x, y: q.y + (up ? -DEMO_HAND_TAP : DEMO_HAND_TAP) }, 0, near));
        if (hand) return { q, up: hand.up, side: hand.side, hand: true };
        if (!plain) plain = { q, up: lay.up, side: lay.side, hand: false };
      }
    }
    if (!plain) plain = tapDemoGoalSpot(slop, first, rc, box, near);
    if (plain) return plain;
  }
  return null;
}




const DEMO_LEAD_PX = 34;
function demoLeadAim(path) {
  const i = Math.min(DEMO_AHEAD, path.length - 1);
  if (i < 1 || rp.x === null) return;
  const r = cv.getBoundingClientRect(), a = tileClient(0, 0), b = tileClient(1, 0), T = b.x - a.x;
  if (!(T > 0) || !r.height) return;
  const lim = (half, v) => { const m = Math.max(0, half - DEMO_LEAD_PX) / T; return Math.max(-m, Math.min(m, v)); };
  demoLead.tx = lim(r.width / 2, path[i][0] * MZ_K + MZ_K / 2 - rp.x);
  demoLead.ty = lim((r.height - cover) / 2, path[i][1] * MZ_K + MZ_K / 2 - rp.y);
}
const tapDemo = { el: null, ph: null, at: performance.now(), x: null, y: null, n: 0, side: '', up: false, walked: false, walkT: -1e9, sp: null, last: null, fresh: true, home: null, fastT: 0 };





const DEMO_FAST_MS = 50, DEMO_FRESH_V = 0.05;
function tapDemoFresh() {
  if (!tapDemo.fresh || rp.x === null) return tapDemo.fresh;
  if (!tapDemo.home) tapDemo.home = { x: rp.x, y: rp.y };
  if (Math.hypot(rp.x - tapDemo.home.x, rp.y - tapDemo.home.y) > DEMO_MOVE || Math.hypot(rp.vx, rp.vy) >= DEMO_FRESH_V) tapDemo.fresh = false;
  return tapDemo.fresh;
}
function tapDemoTouch() {
  tapDemo.fresh = false;
  tapDemo.at = performance.now();
  if (tapDemo.el && !tapDemo.el.hidden && tapDemo.sp) tapDemo.last = { ...tapDemo.sp, at: tapDemo.at };
  tapDemoHide();
}




function demoMissTap() {
  const now = performance.now();
  if (typeof tiltAsk.at === 'number' && now - tiltAsk.at < 300) { if (tapDemo.missT) { tapDemo.walked = false; tapDemo.missT = 0; } return; }
  tapDemo.walked = true; tapDemo.missT = now;
}
function tapDemoHide() { tapDemo.sp = null; if (tapDemo.el && !tapDemo.el.hidden) tapDemo.el.hidden = true; if (tapDemo.ph && !tapDemo.ph.hidden) tapDemo.ph.hidden = true; }
function tapDemoTick() {
  tiltBtnSync();
  const now = performance.now();

  const moved = rp.x === null || tapDemo.x === null ? rp.x !== tapDemo.x : Math.hypot(rp.x - tapDemo.x, rp.y - tapDemo.y) > DEMO_MOVE;
  tapDemo.x = rp.x; tapDemo.y = rp.y;
  if (moved) { tapDemo.at = now; tapDemo.walked = now - tapDemo.walkT < 700; }
  if (moved) demoLead.tx = demoLead.ty = 0;
  const path = mzRt.path;


  const first = tiltBtnWanted() && !tiltG.asked;
  const fresh = tapDemoFresh();
  const ok = active && !meiroPause && !document.hidden && rp.x !== null && mazeOn() && howtoEl.hidden && !mapCovered() && !tapS.goal && !!path && path.length > 1 && (typeof mzGoalStop === 'undefined' || now >= mzGoalStop.until) && (fresh || now - tapDemo.at >= (first ? 0 : tapDemo.walked ? DEMO_TAP_MS : DEMO_IDLE_MS));
  if (!ok && !moved) { demoLead.tx = demoLead.x; demoLead.ty = demoLead.y; }
  const mkEls = () => {
    if (tapDemo.el) return;
    const mk = (id, t) => { const e = document.createElement('div'); e.id = id; e.setAttribute('aria-hidden', 'true'); e.textContent = t; e.hidden = true; document.body.appendChild(e); return e; };
    tapDemo.el = mk('tapDemo', '👆'); tapDemo.ph = mk('tiltHint', '📱');
  };



  const wb = worldMode && !!G.demo && rollOn && !driving ? $('pxWorld') : null;
  if (wb) {
    const wok = active && !meiroPause && !document.hidden && rp.x !== null && howtoEl.hidden && !mapCovered() && !wb.hidden && now - tapDemo.at >= (firstWalk() ? DEMO_IDLE_MS : DEMO_WORLD_MS);
    const r = wok ? wb.getBoundingClientRect() : null, top = r && r.width ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
    if (!top || !wb.contains(top)) { tapDemoHide(); return; }
    mkEls();
    const el = tapDemo.el;
    el.style.left = Math.round(r.left + r.width / 2) + 'px'; el.style.top = Math.round(r.top + 2) + 'px';
    el.classList.remove('first', 'dn', 'lr', 'll'); el.classList.add('wb'); tapDemo.up = false; tapDemo.side = '';
    if (el.hidden) { el.hidden = false; tapDemo.n++; }
    if (!tapDemo.ph.hidden) tapDemo.ph.hidden = true;
    tapDemo.world = true; tapDemo.sp = null;
    return;
  }
  tapDemo.world = false;
  if (!ok) { tapDemoHide(); return; }
  mkEls();
  const sp = tapDemoSpot(path, first);
  tapDemo.sp = sp ? { x: sp.q.x, y: sp.q.y } : null;
  if (tapDemo.sp && first) { const H = sp.big ? DEMO_HAND1 : DEMO_HAND; Object.assign(tapDemo.sp, { hand: H.h + H.move + H.pad, hw: H.w, dn: !!sp.up }); }
  if (!sp) demoLeadAim(path);
  if (!sp) { if (!tapDemo.el.hidden) tapDemo.el.hidden = true; }
  else {
    const q = sp.q;
    tapDemo.el.style.left = Math.round(q.x) + 'px'; tapDemo.el.style.top = Math.round(q.y) + 'px';
    if (tapDemo.el.classList.contains('wb')) tapDemo.el.classList.remove('wb');
  if (tapDemo.el.classList.contains('first') !== first) tapDemo.el.classList.toggle('first', first);
    if (tapDemo.el.classList.contains('big') !== !!sp.big) tapDemo.el.classList.toggle('big', !!sp.big);





    if (tapDemo.up !== sp.up) { tapDemo.up = sp.up; tapDemo.el.classList.toggle('dn', sp.up); }
    if (tapDemo.side !== sp.side) { tapDemo.side = sp.side; tapDemo.el.classList.toggle('lr', sp.side === 'lr'); tapDemo.el.classList.toggle('ll', sp.side === 'll'); }
    if (tapDemo.el.hidden) { tapDemo.el.hidden = false; tapDemo.n++; }
  }
  const ph = tiltG.on;
  if (tapDemo.ph.hidden === ph) tapDemo.ph.hidden = !ph;
}
document.addEventListener('pointerdown', tapDemoTouch, { capture: true, passive: true });
window.addEventListener('keydown', tapDemoTouch, { passive: true });
setInterval(tapDemoTick, 250);
function tileClient(tx, ty) {
  const r = cv.getBoundingClientRect(), dpr = cv.width / r.width, T = fieldT(Math.min(window.devicePixelRatio || 1, 3)), c = camTile();
  return { x: r.left + (cv.width / 2 + (tx + 0.5 - c.x) * T) / dpr, y: r.top + (fieldCy + (ty + 0.5 - c.y) * T) / dpr };
}
function tiltAsk(event) {
  if (!event || !event.isTrusted || tiltG.asked || !tiltNeedsPermission()) return;
  if (event.type === 'touchend') return;
  if (tiltAsk.ev === event || performance.now() - (tiltAsk.at || -1e9) < 250) return;
  tiltAsk.ev = event; tiltAsk.at = performance.now();
  tiltG.asked = true; tiltG.retry = false;
  const fallback = () => G.toast('地図を タップして 遊べるよ');
  const denied = () => { lsSet('nsg_tilt_ok', '0'); tiltBtnSync(); fallback(); };
  const failed = e => { if (e && e.name === 'NotAllowedError') { tiltG.asked = false; tiltG.retry = true; tiltBtnSync(); fallback(); } else denied(); };
  try { Promise.resolve(DeviceOrientationEvent.requestPermission()).then(r => { if (r === 'granted') { tiltG.granted = true; lsSet('nsg_tilt_ok', '1'); tiltReset(); tiltBtnOk(); } else denied(); }, failed); }
  catch (e) { failed(e); }
}






function tiltFirstTouch(e) {



  if ((tiltG.asked && !tiltG.retry) || !tiltBtnWanted()) return;
  if (e && e.target && e.target.closest && e.target.closest('#pxTilt')) return;
  if (swipeEats(e)) return;
  if (e && e.isTrusted === false) return;
  const now = performance.now();
  if (now - (tiltFirstTouch.at || -1e9) < 700) return;
  tiltFirstTouch.at = now;
  tiltAsk(e);
}
document.addEventListener('click', tiltFirstTouch, { capture: true, passive: true });

document.addEventListener('visibilitychange', tiltPause);
window.addEventListener('pageshow', tiltPause);
window.addEventListener('orientationchange', () => { tiltReset(); rp.vx = rp.vy = 0; });
if (screen.orientation) screen.orientation.addEventListener('change', () => { tiltReset(); rp.vx = rp.vy = 0; });
document.addEventListener('keyup', e => { const k = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key]; if (k) rk[k] = 0; });
window.addEventListener('blur', () => { for (const k in rk) rk[k] = 0; tiltPause(); });
const rollBlocked = (x, y) => { const c = codeAt(Math.floor(x), Math.floor(y)); return BLOCK.has(c) && c !== C.X; };







const MZ_K = 3, MZ_R = 32, MZ_BRAID = 0.12, MZ_PATH = new Set([C.R, C.H, C.D]);
const mzAreas = new Map();
function mazeBack() { try { return !!(G.demo && rollOn && !driving); } catch (e) { return false; } }
function mazeOn() { try { return !!(G.demo && rollOn && !driving && !worldMode); } catch (e) { return false; } }
function mzArea(cx, cy) {
  const rx = Math.floor(cx / MZ_R), ry = Math.floor(cy / MZ_R), key = rx + '_' + ry;
  let a = mzAreas.get(key);
  if (a) return a;
  const t0x = rx * MZ_R * MZ_K - MZ_K, t0y = ry * MZ_R * MZ_K - MZ_K, t1x = (rx + 1) * MZ_R * MZ_K + MZ_K, t1y = (ry + 1) * MZ_R * MZ_K + MZ_K;
  let ready = true;
  for (let gy = Math.floor(t0y / CHUNK); gy <= Math.floor((t1y - 1) / CHUNK); gy++) for (let gx = Math.floor(t0x / CHUNK); gx <= Math.floor((t1x - 1) / CHUNK); gx++) {
    const st = chunkState(gx, gy);
    if (st !== 'ok' && st !== 'out') { ready = false; ensureChunk(gx, gy); }
  }
  if (!ready) return null;
  a = mzBuild(rx, ry); mzAreas.set(key, a);
  return a;
}
function mzCell(cx, cy) {
  let road = 0, water = 0, park = 0;
  for (let j = 0; j < MZ_K; j++) for (let i = 0; i < MZ_K; i++) {
    const c = codeAt(cx * MZ_K + i, cy * MZ_K + j);
    if (MZ_PATH.has(c)) road++; else if (c === C.A) water++; else if (c === C.P || c === C.J) park++;
  }
  return { t: water >= 5 && road < 1 ? 2 : road >= 1 || park >= 7 ? 1 : 0, plaza: park >= 7 && road < 1 };
}
function mzLinkRaw(ca, cb, ax, ay, dx, dy) {
  if (ca.t !== 1 || cb.t !== 1) return false;
  const kind = (tx, ty, cell) => { const c = codeAt(tx, ty); return MZ_PATH.has(c) ? 1 : c === C.A ? 2 : cell.plaza ? 1 : 0; };
  for (let k = 0; k < MZ_K; k++) {
    const px = dx ? ax * MZ_K + MZ_K - 1 : ax * MZ_K + k, py = dx ? ay * MZ_K + k : ay * MZ_K + MZ_K - 1;
    const kp = kind(px, py, ca), kq = kind(px + dx, py + dy, cb);
    if ((kp === 1 || kq === 1) && kp && kq) return true;
  }
  return false;
}
function mzBuild(rx, ry) {
  const N = MZ_R, x0 = rx * N, y0 = ry * N, cells = [], t = new Uint8Array(N * N), er = new Uint8Array(N * N), ed = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const c = mzCell(x0 + i, y0 + j); cells.push(c); t[j * N + i] = c.t; }
  const cand = [], nb = new Map();
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    if (i + 1 < N && mzLinkRaw(cells[k], cells[k + 1], x0 + i, y0 + j, 1, 0)) cand.push([k, k + 1, er]);
    if (j + 1 < N && mzLinkRaw(cells[k], cells[k + N], x0 + i, y0 + j, 0, 1)) cand.push([k, k + N, ed]);
  }
  for (const e of cand) for (const [u, v] of [[e[0], e[1]], [e[1], e[0]]]) { if (!nb.has(u)) nb.set(u, []); nb.get(u).push([v, e]); }
  let sd = ((rx * 73856093) ^ (ry * 19349663) ^ 0x5bd1e995) >>> 0 || 1;
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


let mzSpotV = -1, mzSpotCells = new Set(), mzSpotTodo = [];
function mzSpotCell(cx, cy) { return mzSpotCells.has(cx + ',' + cy); }
let mzSpotT = 0;
function mzSpotUpdate(now) {
  if (now - mzSpotT < 500) return;
  mzSpotT = now;
  if (G.spotsVersion !== mzSpotV) { mzSpotV = G.spotsVersion; mzSpotCells = new Set(); mzSpotTodo = (G.spots || []).map(sp => { const t = toTile(sp.lat, sp.lng); return [Math.floor(t.x / MZ_K), Math.floor(t.y / MZ_K)]; }); }
  if (!mzSpotTodo.length || rp.x === null) return;
  const rc = Math.floor(rp.x / MZ_K), rr = Math.floor(rp.y / MZ_K), later = [];
  for (const [sx, sy] of mzSpotTodo) {
    if (Math.abs(sx - rc) > 60 || Math.abs(sy - rr) > 60) { later.push([sx, sy]); continue; }
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
    for (let k = end; k; k = from.get(k)) mzSpotCells.add(k);
  }
  mzSpotTodo = later;
}
function mzType(cx, cy) { const a = mzArea(cx, cy); return a ? a.t[(cy - a.y0) * MZ_R + cx - a.x0] : -1; }
function mzOpen(cx, cy, dx, dy) {
  const A = mzArea(cx, cy), B = mzArea(cx + dx, cy + dy);
  if (!A || !B) return true;
  const ia = (cy - A.y0) * MZ_R + cx - A.x0, ib = (cy + dy - B.y0) * MZ_R + cx + dx - B.x0;
  const sa = mzSpotCell(cx, cy), sb = mzSpotCell(cx + dx, cy + dy);
  if (A.t[ia] !== 1 && !sa) return B.t[ib] === 1 || sb;
  if (B.t[ib] !== 1) return sb;
  if (A.t[ia] !== 1) return true;
  if (A === B) return (dx ? A.er : A.ed)[dx + dy > 0 ? ia : ib] === 1 || mzGate.has(mzGateKey(cx, cy, dx, dy));
  return true;
}



const mzGate = new Map(), MZ_GATE_NEAR = 3, MZ_GATE_MAX = 3;
mzGate.v = 0;
function mzGateKey(cx, cy, dx, dy) { return dx + dy < 0 ? mzGateKey(cx + dx, cy + dy, -dx, -dy) : cx + ',' + cy + (dx ? 'r' : 'd'); }
function mzGateTry(a, b, gc, gr, inReach, L) {
  const man = Math.abs(a - gc) + Math.abs(b - gr);
  if (Math.max(Math.abs(a - gc), Math.abs(b - gr)) > MZ_GATE_NEAR || L - 1 < man * 4 + 8) return false;
  const R = MZ_GATE_NEAR + 2, x0 = gc - R, y0 = gr - R, W = 2 * R + 1, N = W * W;
  const road = (x, y, dx, dy) => {
    if (mzType(x, y) !== 1 || mzType(x + dx, y + dy) !== 1) return false;
    const lx = dx + dy < 0 ? x + dx : x, ly = dx + dy < 0 ? y + dy : y;
    return mzLinkRaw(mzCell(lx, ly), mzCell(lx + Math.abs(dx), ly + Math.abs(dy)), lx, ly, Math.abs(dx), Math.abs(dy));
  };


  const s0 = (b - y0) * W + a - x0, G1 = MZ_GATE_MAX + 1;
  let opens = null;
  for (let lim = 1; lim <= MZ_GATE_MAX && !opens; lim++) {
    const from = new Int32Array(N * G1).fill(-2), q = [s0 * G1];
    from[s0 * G1] = -1;
    let end = -1;
    for (let h = 0; h < q.length && end < 0; h++) {
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
      if (v % G1 === u % G1) continue;
      const ui = u / G1 | 0, vi = v / G1 | 0, x = ui % W + x0, y = (ui / W | 0) + y0;
      ks.push(mzGateKey(x, y, vi % W + x0 - x, (vi / W | 0) + y0 - y));
    }
    if (ks.length && steps <= man * 2 + 4) opens = ks;
  }
  if (!opens) return false;
  for (const k of opens) mzGate.set(k, performance.now());
  while (mzGate.size > 24) mzGate.delete(mzGate.keys().next().value);
  mzGate.v++;
  chordSound(); floatText('🚪 生け垣の 戸が ひらいた！ ゴールは すぐ そこ');
  return true;
}
function mzBlocked(fx, fy, x, y) {
  const a = Math.floor(fx / MZ_K), b = Math.floor(fy / MZ_K), c = Math.floor(x / MZ_K), d = Math.floor(y / MZ_K), dx = c - a, dy = d - b;
  if (!dx && !dy) return false;
  if (Math.abs(dx) + Math.abs(dy) === 1) return !mzOpen(a, b, dx, dy);
  if (Math.abs(dx) === 1 && Math.abs(dy) === 1) return !((mzOpen(a, b, dx, 0) && mzOpen(a + dx, b, 0, dy)) || (mzOpen(a, b, 0, dy) && mzOpen(a, b + dy, dx, 0)));
  return false;
}






const MZ_TUBE = 0.45, MZ_HALF = 1.1, MZ_HEDGE = 0.5, MZ_RUB = 0.15;
const MZ_SOFT_K = 300, MZ_SOFT_C = 6, MZ_SOFT_MAX = 0.4, MZ_DENT_K = 80, MZ_DENT_C = 3.5;


const mzSoft = { on: false, x: 0, y: 0, ux: 0, uy: 0, pen: 0, dent: 0, dv: 0, vin: 0, boings: 0 };
const mzCurveC = { key: '', m: new Map() };
function mzCurves(cx, cy) {
  const key = mzAreas.size + ':' + mzSpotCells.size + ':' + mzSpotV + ':' + mzGate.v;
  if (mzCurveC.key !== key || mzCurveC.m.size > 20000) { mzCurveC.key = key; mzCurveC.m.clear(); }
  const k = cx + ',' + cy;
  let out = mzCurveC.m.get(k);
  if (out) return out;
  const ty = mzType(cx, cy);
  if (ty < 0) return null;
  out = [];
  if (ty === 1 || mzSpotCell(cx, cy)) {
    const px = (cx + 0.5) * MZ_K, py = (cy + 0.5) * MZ_K, h = MZ_K / 2;
    const arms = MZ_DIRS.filter(([dx, dy]) => mzOpen(cx, cy, dx, dy)).map(([dx, dy]) => [px + dx * h, py + dy * h, dx, dy]);
    const bez = (a, b) => { const q = []; for (let i = 0; i <= 6; i++) { const t = i / 6, s = 1 - t; q.push([s * s * a[0] + 2 * s * t * px + t * t * b[0], s * s * a[1] + 2 * s * t * py + t * t * b[1]]); } return q; };
    if (!arms.length) out.push([[px - 0.01, py], [px + 0.01, py]]);
    else if (arms.length === 2) out.push(bez(arms[0], arms[1]));
    else {
      for (const a of arms) out.push([[px, py], [a[0], a[1]]]);
      if (arms.length > 2) for (let i = 0; i < arms.length; i++) for (let j = i + 1; j < arms.length; j++) if (!(arms[i][2] * arms[j][2] + arms[i][3] * arms[j][3])) out.push(bez(arms[i], arms[j]));
    }
  }
  mzCurveC.m.set(k, out);
  return out;
}
function mzNear(x, y) {
  const a = Math.floor(x / MZ_K), b = Math.floor(y / MZ_K);
  if (!mzCurves(a, b)) return null;
  let bd = Infinity, bx = 0, by = 0;
  for (let cy = b - 1; cy <= b + 1; cy++) for (let cx = a - 1; cx <= a + 1; cx++) {
    const cs = mzCurves(cx, cy);
    if (!cs) continue;
    for (const q of cs) for (let i = 1; i < q.length; i++) {
      const x0 = q[i - 1][0], y0 = q[i - 1][1], dx = q[i][0] - x0, dy = q[i][1] - y0, l = dx * dx + dy * dy;
      const t = l ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l)) : 0, qx = x0 + dx * t, qy = y0 + dy * t, d = (x - qx) * (x - qx) + (y - qy) * (y - qy);
      if (d < bd) { bd = d; bx = qx; by = qy; }
    }
  }
  return bd < Infinity ? { d: Math.sqrt(bd), x: bx, y: by } : null;
}
const mzOnC = { key: '', m: new Map() };
function mzOn(x, y) {
  if (mzOnC.key !== mzCurveC.key || mzOnC.m.size > 20000) { mzOnC.key = mzCurveC.key; mzOnC.m.clear(); }
  const k = Math.round(x * 6) + ',' + Math.round(y * 6);
  let p = mzOnC.m.get(k);
  if (!p) { const q = mzNear(x, y); if (!q) return [x, y]; p = [q.x, q.y]; mzOnC.m.set(k, p); }
  return p;
}


const MZ_HALF_MIN = 12;
function mzHalfCell(path) {
  if (!Array.isArray(path) || path.length - 1 < MZ_HALF_MIN) return null;
  const c = path[Math.floor((path.length - 1) / 2)];
  return Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number' && isFinite(c[0]) && isFinite(c[1]) ? [c[0], c[1]] : null;
}
const mzHalf = { gkey: '', cell: null, passed: false, at: 0, dir: [1, 0], prev: null };
function mzHalfReset() { mzHalf.gkey = ''; mzHalf.cell = null; mzHalf.passed = false; mzHalf.at = 0; mzHalf.dir = [1, 0]; mzHalf.prev = null; }
function mzHalfPassed(cell, cur, prev) {
  const ok = v => Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number' && isFinite(v[0]) && isFinite(v[1]);
  if (!ok(cell) || !ok(cur)) return false;
  if (cur[0] === cell[0] && cur[1] === cell[1]) return true;
  if (ok(prev) && Math.abs(cur[0] - prev[0]) === 1 && Math.abs(cur[1] - prev[1]) === 1) return cur[0] === cell[0] && prev[1] === cell[1];
  return false;
}
function mzHalfCheck(now) {
  if (!mzHalf.cell || rp.x === null) return;
  const cur = [Math.floor(rp.x / MZ_K), Math.floor(rp.y / MZ_K)];
  if (!mzHalf.passed && mzHalfPassed(mzHalf.cell, cur, mzHalf.prev)) { mzHalf.passed = true; mzHalf.at = now; }
  mzHalf.prev = cur;
}
const mzRt = { key: '', path: null, best: Infinity, bestT: 0, showUntil: 0, gkey: '', retry: 0, t0: 0, len0: 0, run: { dots: 0, pads: 0, combo: 0 } };
const MZ_FIRST_SIMPLE = { turns: 5, branches: 4, ratio: 1.9 };
function mzPathShape(path, openAt) {
  const open = openAt || ((x, y, dx, dy) => mzType(x + dx, y + dy) >= 0 && mzOpen(x, y, dx, dy));
  let turns = 0, branches = 0, pdx = 0, pdy = 0;
  for (let i = 0; i < path.length; i++) {
    const [x, y] = path[i], nx = path[i + 1], pv = path[i - 1];
    if (nx) { const dx = nx[0] - x, dy = nx[1] - y; if (i > 0 && (dx !== pdx || dy !== pdy)) turns++; pdx = dx; pdy = dy; }
    let n = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (nx && nx[0] === x + dx && nx[1] === y + dy) continue;
      if (pv && pv[0] === x + dx && pv[1] === y + dy) continue;
      if (open(x, y, dx, dy)) n++;
    }
    if (n > 0) branches++;
  }
  return { cells: path.length, turns, branches };
}
function mzFirstSimple(shape, straightM) {
  const L = MZ_FIRST_SIMPLE, ratio = straightM > 0 ? Math.max(0, shape.cells - 1) * MZ_K * TILE_M / straightM : 1;
  return shape.turns <= L.turns && shape.branches <= L.branches && ratio <= L.ratio;
}
const mzFirstBest = tried => tried.reduce((a, b) => (b.cells < a.cells ? b : a));
function mzRoute(now) {
  const g = G.guide;
  if (!g || rp.x === null) { mzRt.path = null; return; }
  const p = toTile(g.lat, g.lng), a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K), gc = Math.floor(p.x / MZ_K), gr = Math.floor(p.y / MZ_K);
  const rch = (g.kind === 'npc' && G.guideRadius ? G.guideRadius(g) : G.reachOf ? G.reachOf(g) : 40) || 40, near = rch * 0.8 / TILE_M;
  const inReach = (x, y) => Math.hypot(Math.max(x * MZ_K - p.x, 0, p.x - (x + 1) * MZ_K), Math.max(y * MZ_K - p.y, 0, p.y - (y + 1) * MZ_K)) <= near;

  const tubeIn = (x, y) => { const cs = mzCurves(x, y); return !cs || cs.some(q => q.some(([qx, qy]) => Math.hypot(qx - p.x, qy - p.y) <= rch / TILE_M + MZ_TUBE)); };
  const inReachT = g.kind === 'npc' ? inReach : (x, y) => inReach(x, y) && tubeIn(x, y);
  const gkey = gc + ',' + gr + ':' + (g.id || g.name || ''), key = a + ',' + b + '>' + gkey + '#' + mzSpotV + ':' + mzSpotCells.size;
  if (gkey !== mzRt.gkey) {
    if (rp.x !== null) mzMvStep(mzMv, Math.floor(rp.x / MZ_K), Math.floor(rp.y / MZ_K), now);
    if (mzRt.gid) mzRt.prev = { id: mzRt.gid, t0: mzRt.t0, len0: mzRt.len0, warp: mzRt.warp, at: now, sec: mzRt.t0 ? (now - mzRt.t0) / 1000 : 0, moves: mzMv.n, run: { ...mzRt.run }, chase: !mzRt.warp && mzChaseLive(), rescue: !mzRt.warp && mzRescueLive() };
    mzMvReset(mzMv);
    mzRt.warp = false; mzRt.run = { dots: 0, pads: 0, combo: 0 }; mzPad.chain = mzPad.best = 0;
    mzFruitReset();
    mzPieceReset();
    mzViewReset();
    mzCacheReset();
    mzQuestReset();
    mzDinoReset();
    mzChaseReset();
    mzEnergyRebase();
    mzPurifyReset();
    mzRescueReset();
    mzBrigadeReset();
    mzTorchReset();
    mzMini.seen.clear();
    mzTrail.clear();
    mzCubeReset();
    mzTiles.clear();
    mzHalfReset();
    const bc = npcBump.carry; if (bc) npcBump.carry = bc.from === mzRt.gkey ? { id: bc.id, to: gkey } : null;
    mzRt.gkey = gkey; mzRt.best = Infinity; mzRt.bestT = now; mzRt.showUntil = 0; mzRt.hints = 0; mzRt.t0 = now; mzRt.clockT = now; mzRt.len0 = 0; mzRt.touched = false;
    mzNext.name = g.name || '';
  }
  mzRt.gid = g.id || g.name;
  mzHalfCheck(now);
  if (key === mzRt.key && !(mzRt.retry && now > mzRt.retry)) return;
  mzRt.key = key; mzRt.retry = 0;
  let x0, y0, W, from, end = -1, unk = false, seen = 0, capHit = false;
  for (const pad of [30, 60, 120]) {
    x0 = Math.min(a, gc) - pad; y0 = Math.min(b, gr) - pad;
    const x1 = Math.max(a, gc) + pad, y1 = Math.max(b, gr) + pad; W = x1 - x0 + 1;
    if (W * (y1 - y0 + 1) > 160000) { if (pad === 30) { mzRt.path = null; return; } break; }
    from = new Int32Array(W * (y1 - y0 + 1)).fill(-2);
    const q = [(b - y0) * W + a - x0];
    from[q[0]] = -1;
    let capped = false, loose = -1;
    for (let h = 0; h < q.length; h++) {
      if (h >= 60000) { capped = true; break; }
      const i = q[h], x = i % W + x0, y = (i / W | 0) + y0;
      if (inReachT(x, y)) { end = i; break; }
      if (loose < 0 && inReach(x, y)) loose = i;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
        const j = (ny - y0) * W + nx - x0;
        if (from[j] !== -2) continue;
        if (mzType(nx, ny) < 0) { unk = true; continue; }
        if (!mzOpen(x, y, dx, dy)) continue;
        from[j] = i; q.push(j);
      }
    }
    if (end < 0) end = loose;
    seen = q.length; capHit = capped;
    if (end >= 0 || capped) break;
  }
  if (end < 0) {
    mzRt.path = null;
    if (unk) mzRt.retry = now + 1500;
    else if (!capHit && seen >= 600 && G.guideNoPath) G.guideNoPath(g);
    return;
  }
  const path = [];
  for (let i = end; i >= 0; i = from[i]) path.push([i % W + x0, (i / W | 0) + y0]);
  mzRt.path = path.reverse();
  if (mzRt.simpleKey !== gkey) {
    mzRt.simpleKey = gkey;
    if (mzGoalsDone() < 1 && G.guideNoPath) {
      const sm = G.dist && G.me ? G.dist(G.me, g) : 0;
      const kept = !!(G.guideKept && G.guideKept());
      if (kept || mzFirstSimple(mzPathShape(mzRt.path), sm)) mzRt.firstTried = null;
      else {



        const tried = mzRt.firstTried || (mzRt.firstTried = []);
        tried.push({ g, gkey, cells: mzRt.path.length });
        if (G.guideNoPath(g, true)) return mzRoute(now);
        const best = mzFirstBest(tried);
        mzRt.firstTried = null;
        if (best.gkey !== gkey && G.setGuide) { const { t, ...bg } = best.g; mzRt.simpleKey = best.gkey; mzRt.key = ''; G.setGuide(bg); return mzRoute(now); }
      }
    }
  }
  const L = mzRt.path.length;
  if (!mzRt.len0) mzRt.len0 = L;
  if (mzHalf.gkey !== gkey) {
    mzHalf.gkey = gkey; mzHalf.cell = mzHalfCell(mzRt.path);
    if (mzHalf.cell) { const i = Math.floor((mzRt.path.length - 1) / 2), q = mzRt.path[i - 1] || mzRt.path[i], r = mzRt.path[i]; mzHalf.dir = r[0] === q[0] && r[1] === q[1] ? [1, 0] : [Math.sign(r[0] - q[0]), Math.sign(r[1] - q[1])]; mzHalf.prev = [a, b]; }
  }
  mzHalfCheck(now);
  if (L !== mzRt.shownLen && G.renderGuide) { mzRt.shownLen = L; G.renderGuide(); }
  if (L < mzRt.best) { mzRt.best = L; mzRt.bestT = now; }
  if (mzRt.gated !== gkey && mzGateTry(a, b, gc, gr, inReachT, L)) { mzRt.gated = gkey; mzRt.key = ''; if (mzHalf.gkey === gkey && !mzHalf.passed) { mzHalf.gkey = ''; mzHalf.cell = null; mzHalf.prev = null; } }
}






const mzArrive = { done: '', t: 0, last: 0, call: '' };
function mzArriveTick(now) {
  const gap = mzArrive.last ? now - mzArrive.last : 0;
  mzArrive.last = now;
  if (mzArrive.call && $('pxInfo').hidden && !sight.n) { G.callNpc(null); mzArrive.call = ''; }
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


  if (g && g.kind === 'npc' && $('pxInfo').hidden) {
    const near = G.dist(G.me, g) <= G.guideRadius(g), end = !!(mzRt.path && mzRt.path.length <= 1 && mzRt.gid === g.id);
    const key = 'n:' + g.id + ':' + mzRt.t0, n = (G.npcs || []).find(x => x.id === g.id);
    if (n && (near || end) && mzArrive.done !== key) {
      mzArrive.done = key; if (!near) { G.callNpc(n.id); mzArrive.call = n.id; } openNpc(n);

      Object.assign(npcBump, { id: n.id, x: Math.floor(rp.x), y: Math.floor(rp.y), carry: { id: n.id, from: mzRt.gkey } });
    }
  }
}
function mzHintTick(now) {
  if (!mzRt.path || mzRt.path.length < 3 || now < mzRt.showUntil || mzHelpOn()) return;
  if (!mzRt.touched) { mzRt.bestT = now; return; }
  if (now - mzRt.bestT > 25000) {
    mzRt.showUntil = now + 6000; mzRt.bestT = now; mzRt.hints = (mzRt.hints || 0) + 1;

  }
}


const MZ_HELP_N = 3, mzHelp = { told: false, dots: 0, dead: 0, offered: false, helpToast: false };
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {  } };
const mzGoalsDone = () => Number(lsGet('nsg_mzgoals', '0')) || 0;
function mzHelpOn() { const m = lsGet('nsg_mzhelp', 'auto'); return m === 'on' || (m !== 'off' && mzGoalsDone() < MZ_HELP_N); }
function mzHelpSync() { const t = $('mzHelpToggle'); if (t) t.checked = mzHelpOn(); }
function mzHelpGoal() {
  const n = mzGoalsDone() + 1;
  lsSet('nsg_mzgoals', String(n));
  firstWalkBtns();
  if (n === MZ_HELP_N && lsGet('nsg_mzhelp', 'auto') === 'auto') mzHelp.helpToast = true;
  mzHelpSync();
}
if ($('mzHelpToggle')) { mzHelpSync(); $('mzHelpToggle').addEventListener('change', e => { lsSet('nsg_mzhelp', e.target.checked ? 'on' : 'off'); mzHelp.told = true; dirty = true; }); }






const mzCrow = { list: [], last: 0, hitT: 0, next: 0, hits: 0, seq: 0, shoo: 0 };
const mzScare = { cx: 0, cy: 0, on: false, t0: 0, until: 0, next: 0, told: false, got: 0 };
const MZ_SCARE_MS = 8000;
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
function mzCrowStep(c, rc, rr) {
  const open = MZ_DIRS.filter(([dx, dy]) => mzOpen(c.cx, c.cy, dx, dy) && mzType(c.cx + dx, c.cy + dy) === 1);
  if (!open.length) return [0, 0];
  c.chase = false;
  if (c.scared) {
    const fw = open.filter(([dx, dy]) => !(dx === -c.dx && dy === -c.dy)), cand = fw.length ? fw : open;
    const far = ([dx, dy]) => Math.abs(c.cx + dx - rc) + Math.abs(c.cy + dy - rr) + Math.random() * 0.5;
    return cand.reduce((a, b) => (far(b) > far(a) ? b : a));
  }
  const fw = open.filter(([dx, dy]) => !(dx === -c.dx && dy === -c.dy));
  const pick = (fw.length ? fw : open)[Math.floor(Math.random() * (fw.length ? fw : open).length)];
  return pick;
}
function mzCrowTick(now) {
  const gap = mzCrow.last ? now - mzCrow.last : 0, dt = Math.min(0.1, gap / 1000);
  mzCrow.last = now;
  if (!mzCrowOn() || rp.x === null) { mzCrow.list.length = 0; mzScare.on = false; mzScare.until = 0; return; }
  if (cubeFirstGoal()) return;
  if (gap > 1000 || mapCovered() || !howtoEl.hidden || sightBusy()) { if (mzScare.until > now - gap) mzScare.until += gap; return; }
  const rc = Math.floor(rp.x / MZ_K), rr = Math.floor(rp.y / MZ_K), help = mzHelpOn(), max = help ? 1 : 3, spd = help ? 0.9 : 1.5;
  mzCrow.list = mzCrow.list.filter(c => Math.abs(c.cx - rc) + Math.abs(c.cy - rr) < 34);
  if (mzCrow.list.length > max) mzCrow.list = mzCrow.list.sort((a, b) => (Math.abs(b.cx - rc) + Math.abs(b.cy - rr)) - (Math.abs(a.cx - rc) + Math.abs(a.cy - rr))).slice(0, max);
  if (mzCrow.list.length < max && now > mzCrow.next) { const c = mzCrowSpawn(rc, rr); if (c) mzCrow.list.push(c); mzCrow.next = now + 1500; }
  mzScareTick(now, rc, rr);
  const fx = rp.x / MZ_K, fy = rp.y / MZ_K, scared = now < mzScare.until;
  for (const c of mzCrow.list.slice()) {
    if (c.scared !== scared) { c.scared = scared; if (scared && (c.dx || c.dy)) { [c.cx, c.nx] = [c.nx, c.cx]; [c.cy, c.ny] = [c.ny, c.cy]; c.t = 1 - c.t; c.dx = -c.dx; c.dy = -c.dy; } }
    c.t += dt * spd * (scared ? 0.7 : 1);
    while (c.t >= 1) {
      c.cx = c.nx; c.cy = c.ny;
      const [dx, dy] = mzCrowStep(c, rc, rr);
      c.dx = dx; c.dy = dy; c.nx = c.cx + dx; c.ny = c.cy + dy;
      c.t = dx || dy ? c.t - 1 : 0;
      if (!dx && !dy) break;
    }
    const x = c.cx + (c.nx - c.cx) * c.t + 0.5, y = c.cy + (c.ny - c.cy) * c.t + 0.5, d = Math.hypot(fx - x, fy - y);
    if (scared && d < 0.6) mzCrowShoo(c, now);
  }
}
function mzScareTick(now, rc, rr) {
  if (mzScare.on) {
    if (Math.abs(mzScare.cx - rc) + Math.abs(mzScare.cy - rr) > 34 || now - mzScare.t0 > 60000) { mzScare.on = false; mzScare.next = now + 5000; return; }
    if (mzScare.cx === rc && mzScare.cy === rr) {
      mzScare.on = false; mzScare.until = now + MZ_SCARE_MS; mzScare.next = now + 45000; mzScare.got++;
      riceSay('かかし だ！', 1600, 'happy');


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


const MZ_SPRING_MS = 12000, MZ_SPRING_E = 1.3;
const mzSpring = { cx: 0, cy: 0, on: false, t0: 0, until: 0, next: 0, told: false, got: 0, boosts: 0, last: 0, chain: 0, at: 0, best: 0 };
function mzSpringShot() {
  mzSpring.at = 0;
}
function mzSpringChain(now) {
  mzSpring.chain = 1; mzSpring.at = now;
  for (let i = 0; i < 5; i++) { const t = Math.random() * Math.PI * 2, v = 1 + Math.random() * 2; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 2, c: i % 2 ? '#8cf078' : '#e4ffd8', life: 0.4 + Math.random() * 0.3 }); }
}
function mzSpringTick(now) {
  const gap = mzSpring.last ? now - mzSpring.last : 0;
  mzSpring.last = now;
  if (gap > 1000 || mapCovered() || !howtoEl.hidden || sightBusy()) { if (mzSpring.until > now - gap) mzSpring.until += gap; if (mzSpring.on) mzSpring.t0 += gap; return; }
  const rc = Math.floor(rp.x / MZ_K), rr = Math.floor(rp.y / MZ_K);
  if (mzSpring.on) {
    if (Math.abs(mzSpring.cx - rc) + Math.abs(mzSpring.cy - rr) > 34 || now - mzSpring.t0 > 60000) { mzSpring.on = false; mzSpring.next = now + 5000; return; }
    if (mzSpring.cx === rc && mzSpring.cy === rr) {
      mzSpring.on = false; mzSpring.until = now + MZ_SPRING_MS; mzSpring.next = now + 45000; mzSpring.got++;
      riceSay('ばね だ！', 1600, 'happy');
      grainSound(); dirty = true;
    }
    return;
  }
  if (cubeFirstGoal()) return;
  if (now < mzSpring.next || now < mzSpring.until) return;
  mzSpring.next = now + 3000;
  for (let t = 0; t < 30; t++) {
    const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 8, cx = Math.round(rc + Math.cos(a) * d), cy = Math.round(rr + Math.sin(a) * d);
    if (mzType(cx, cy) !== 1 || mzGrainAt(cx, cy) || (mzScare.on && mzScare.cx === cx && mzScare.cy === cy)) continue;
    Object.assign(mzSpring, { cx, cy, on: true, t0: now });
    return;
  }
}
function mzCrowShoo(c, now) {
  mzCrow.list = mzCrow.list.filter(o => o !== c);
  mzCrow.next = now + 6000; mzCrow.shoo++;
  const r = G.mzShoo ? G.mzShoo() : null;
  floatText(`🐦 おいはらった！${r ? ` +${r.pts}pt` : ''}`);
  const cols = ['#9fd0ff', '#ffffff', '#5a8fd8'];
  for (let i = 0; i < 12; i++) { const t = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 3, c: cols[i % 3], life: 0.6 + Math.random() * 0.4 }); }
  dirty = true;
}


const MZ_CRIT = { ike: 'kaeru', ine: 'kaeru', dote: 'kaeru', cha: 'tonbo', kuro: 'tonbo', ami: 'kani', ishi: 'kani', matsu: 'sagi' }, MZ_CRIT_N = 23, MZ_CRIT_MAX = 2;
const mzCritFled = new Map();
const mzCritHi = new Map(), MZ_CRIT_CALM = 1.2;
let mzCritHiN = 0, mzCritSaid = 0, mzCritMode = '';
let mzCritDrawn = [];
function drawMzCritters(tx0, ty0, tx1, ty1, ox, oy, T, now) {
  const S = MZ_K * T, c0 = Math.floor(tx0 / MZ_K), r0 = Math.floor(ty0 / MZ_K), c1 = Math.ceil(tx1 / MZ_K), r1 = Math.ceil(ty1 / MZ_K);
  const bx = rp.x === null ? null : rp.x / MZ_K - 0.5, by = rp.x === null ? null : rp.y / MZ_K - 0.5;
  const cand = [];
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
    const h = (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) >>> 0;
    if (h % MZ_CRIT_N || mzType(cx, cy) !== 1) continue;
    const d = [[1, 0], [0, 1], [-1, 0], [0, -1]].find((_, i, D) => { const [dx, dy] = D[(i + (h >>> 8)) % 4]; return !mzOpen(cx, cy, dx, dy); });
    if (!d) continue;
    const px = cx + d[0] * 0.5, py = cy + d[1] * 0.5;
    cand.push({ cx, cy, px, py, dist: bx === null ? 0 : Math.hypot(bx - px, by - py) });
  }
  cand.sort((a, b) => a.dist - b.dist);
  const wx = window.NISHIO_WEATHER && window.NISHIO_WEATHER.current, rain = !!(wx && wx.kind === 'rain'), night = nightOn && !worldMode && nightLevel() >= 1;
  mzCritMode = night ? 'night' : rain ? 'rain' : '';
  let n = 0;
  mzCritDrawn = [];
  for (const { cx, cy, px, py, dist } of cand) {
    if (n >= MZ_CRIT_MAX) break;
    const kind = MZ_CRIT[mzStyle(cx, cy)] || 'kaeru', img = critterSprites[kind];
    if (!img || (rain && kind === 'tonbo')) continue;
    const k = cx + ',' + cy, f = mzCritFled.get(k);
    const near = f === undefined && bx !== null && dist < 1.3;
    if (near && night && Math.hypot(rp.vx, rp.vy) <= MZ_CRIT_CALM) {
      if (!mzCritHi.has(k)) { mzCritHi.set(k, -1); if (now - mzCritSaid > 4000) { mzCritSaid = now; riceSay('しーっ…', 1300); } }
    } else
    if (near && Math.hypot(rp.vx, rp.vy) > MZ_CRIT_CALM) { mzCritFled.set(k, now); continue; }
    if (near && !mzCritHi.has(k)) { mzCritHi.set(k, now); mzCritHiN++; if (now - mzCritSaid > 4000) { mzCritSaid = now; riceSay('やぁ♪', 1300, 'happy'); } }
    else if (!near && mzCritHi.has(k) && now - mzCritHi.get(k) > 800) mzCritHi.delete(k);
    let up = 0, al = 1;
    if (f !== undefined) {
      const t = now - f;
      if (t > 25000) mzCritFled.delete(k);
      if (t < 25000 && t > 500) continue;
      if (t <= 500) { up = t / 500; al = 1 - up; }
    }
    n++; mzCritDrawn.push([cx, cy, MZ_CRIT[mzStyle(cx, cy)] || 'kaeru']);
    const hi = mzCritHi.has(k) && mzCritHi.get(k) >= 0 ? (now - mzCritHi.get(k)) / 600 : 2;
    const bob = calmMotion || (night && f === undefined) ? 0 : rain && kind === 'kaeru' && hi >= 1 ? Math.round(Math.max(0, Math.sin(now / 160 + cx * 1.7)) * T * 0.3) : hi < 1 ? Math.round(Math.abs(Math.sin(hi * Math.PI * 2)) * T * 0.35) : Math.round(Math.max(0, Math.sin(now / 420 + cx * 1.7)) * T * 0.08);
    ctx.globalAlpha = al;
    ctx.drawImage(img, Math.round(ox + (px + 0.5) * S - T / 2), Math.round(oy + (py + 0.5) * S - T / 2 - bob - up * T * 1.2), T, T);
    if (night && f === undefined) {
      const zt = ((now / 1800 + cx * 0.37) % 1), zx = ox + (px + 0.5) * S + T * (0.3 + zt * 0.25), zy = oy + (py + 0.5) * S - T * (0.5 + (calmMotion ? 0.2 : zt * 0.5));
      ctx.globalAlpha = al * (calmMotion ? 0.9 : Math.sin(zt * Math.PI)); ctx.font = `bold ${Math.max(8, Math.round(T * 0.45))}px "DotGothic16", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, T / 10); ctx.strokeStyle = 'rgba(20,24,48,.8)'; ctx.strokeText('z', zx, zy); ctx.fillStyle = '#e8eeff'; ctx.fillText('z', zx, zy);
    }
    ctx.globalAlpha = 1;
  }
}
function drawMzSpring(ox, oy, T, now) {
  const S = MZ_K * T, q = Math.max(1, Math.round(T / 8));
  if (mzSpring.on) {
    const X = ox + (mzSpring.cx + 0.5) * S, Y = oy + (mzSpring.cy + 0.5) * S, pl = 0.55 + Math.sin(now / 220) * 0.08, r = T * 1.8 * pl, h = T * (1.1 + Math.sin(now / 140) * 0.25), bw = T * 0.9;
    ctx.fillStyle = 'rgba(140,240,120,.45)'; ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = Math.max(2, T / 6); ctx.strokeStyle = '#8cf078'; ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.stroke();
    const y0 = Math.round(Y + T * 0.7), y1 = Math.round(y0 - h);
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(Math.round(X - bw / 2) - q, y0 - q, Math.round(bw) + 2 * q, 3 * q); ctx.fillRect(Math.round(X - bw / 2) - q, y1 - 2 * q, Math.round(bw) + 2 * q, 3 * q);
    ctx.lineWidth = Math.max(2, q * 2); ctx.lineJoin = 'miter'; ctx.strokeStyle = '#1a1a1a'; ctx.beginPath();
    for (let i = 0; i <= 6; i++) { const x = X + (i % 2 ? bw / 2 : -bw / 2) * 0.8, y = y0 - (h * i) / 6; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); ctx.lineWidth = Math.max(1, q); ctx.strokeStyle = '#d8e0e6'; ctx.stroke();
    ctx.fillStyle = '#5fc24a'; ctx.fillRect(Math.round(X - bw / 2), y0, Math.round(bw), q); ctx.fillRect(Math.round(X - bw / 2), y1 - q, Math.round(bw), q);
  }
  const left = mzSpring.until - now;
  if (left > 0 && rp.x !== null) {
    if (left < 2000 && Math.floor(now / 160) % 2) return;
    const X = ox + rp.x * T, Y = oy + rp.y * T, r = T * (1.15 + Math.sin(now / 120) * 0.12);
    ctx.lineWidth = Math.max(2, q * 2); ctx.strokeStyle = 'rgba(140,240,120,.85)'; ctx.beginPath(); ctx.arc(Math.round(X), Math.round(Y), r, 0, Math.PI * 2); ctx.stroke();
  }
}
function drawMzCrows(ox, oy, T, now) {
  const S = MZ_K * T, sz = Math.round(T * 1.8);
  if (mzScare.on) {
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
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(Math.round(X - sz * 0.3), Math.round(Y + sz * 0.3), Math.round(sz * 0.6), Math.max(2, Math.round(T / 6)));
    ctx.fillStyle = c.scared ? (blink ? 'rgba(255,255,255,.8)' : 'rgba(140,200,255,.8)') : c.chase ? 'rgba(255,120,100,.45)' : 'rgba(255,245,220,.45)'; ctx.beginPath(); ctx.arc(X, Y - hop, sz * 0.55, 0, Math.PI * 2); ctx.fill();
    if (c.scared) { ctx.lineWidth = Math.max(2, T / 6); ctx.strokeStyle = blink ? '#5a8fd8' : '#e8f4ff'; ctx.beginPath(); ctx.arc(X, Y - hop, sz * 0.55, 0, Math.PI * 2); ctx.stroke(); }
    if (si !== undefined) {
      const k = (Math.floor(now / 170) + c.id) & 1;
      ctx.drawImage(decoCanvas(((si * 6 + k) * 4) * 8), Math.round(X - sz / 2), Math.round(Y - sz / 2 - hop), sz, sz);
    } else {
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(Math.round(X - sz * 0.3), Math.round(Y - sz * 0.3 - hop), Math.round(sz * 0.6), Math.round(sz * 0.5));
      ctx.fillStyle = '#f2c230'; ctx.fillRect(Math.round(X + sz * 0.3), Math.round(Y - sz * 0.15 - hop), Math.round(sz * 0.18), Math.max(2, Math.round(sz * 0.12)));
    }
    if (c.chase && !c.scared) {
      ctx.font = `bold ${Math.round(T * 0.8)}px "DotGothic16", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, T / 6); ctx.strokeStyle = '#1a1a1a'; ctx.fillStyle = '#ff5a4a';
      ctx.strokeText('！', X, Y - sz * 0.8 - hop); ctx.fillText('！', X, Y - sz * 0.8 - hop);
    }
  }
}
if ($('mzCrowToggle')) { $('mzCrowToggle').checked = mzCrowOn(); $('mzCrowToggle').addEventListener('change', e => { lsSet('nsg_mzcrow', e.target.checked ? 'on' : 'off'); if (!e.target.checked) mzCrow.list.length = 0; dirty = true; }); }

const MZ_DEAD_R = 10;
function drawMzDeadEnds(tx0, ty0, tx1, ty1, ox, oy, T) {
  mzHelp.dead = 0;
  const c0 = Math.floor(tx0 / MZ_K), r0 = Math.floor(ty0 / MZ_K), c1 = Math.ceil(tx1 / MZ_K), r1 = Math.ceil(ty1 / MZ_K), S = MZ_K * T;
  const onPath = new Set((mzRt.path || []).map(([x, y]) => x + ',' + y)), ra = rp.x === null ? null : Math.floor(rp.x / MZ_K) + ',' + Math.floor(rp.y / MZ_K);
  const ax = rp.x === null ? null : Math.floor(rp.x / MZ_K), ay = rp.x === null ? null : Math.floor(rp.y / MZ_K);
  const g = G.guide, gp = g ? toTile(g.lat, g.lng) : null, gNear = g ? (((G.reachOf ? G.reachOf(g) : 40) || 40) / TILE_M) + MZ_K : 0;
  const r = T * 0.42, lw = Math.max(2, T / 6);
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
    if (mzType(cx, cy) !== 1 || mzSpotCell(cx, cy) || mzGrainAt(cx, cy)) continue;
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
function mzRouteChevAngle(dx, dy) { return typeof dx !== 'number' || typeof dy !== 'number' || !isFinite(dx) || !isFinite(dy) || (dx === 0 && dy === 0) ? 0 : Math.atan2(dy, dx); }
function drawMzHint(ox, oy, T, now) {
  mzHelp.dots = 0;
  if (!mzRt.path) return;
  if (now >= mzRt.showUntil && mzHelpOn()) {

    const S = MZ_K * T, pts = mzRt.path.slice(0, 17).map(([cx, cy]) => [ox + cx * S + S / 2, oy + cy * S + S / 2]);
    if (pts.length < 2) return;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) { if (rec) ctx.lineTo(pts[i][0], pts[i][1]); else ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2); }
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    ctx.strokeStyle = 'rgba(10,30,45,.55)'; ctx.lineWidth = Math.max(4, T * 0.5); ctx.stroke();
    ctx.setLineDash([T * 0.7, T * 0.45]); ctx.lineDashOffset = -(now / 25) % (T * 1.15);
    ctx.strokeStyle = '#7fe0ff'; ctx.lineWidth = Math.max(2, T * 0.3); ctx.stroke();
    ctx.restore();
    const [ex, ey] = pts[pts.length - 1], [px, py] = pts[pts.length - 2], a = Math.atan2(ey - py, ex - px), h = T * 0.6;
    ctx.fillStyle = '#7fe0ff'; ctx.strokeStyle = 'rgba(10,30,45,.8)'; ctx.lineWidth = Math.max(1, T / 8);
    ctx.beginPath(); ctx.moveTo(ex + Math.cos(a) * h, ey + Math.sin(a) * h); ctx.lineTo(ex + Math.cos(a + 2.4) * h, ey + Math.sin(a + 2.4) * h); ctx.lineTo(ex + Math.cos(a - 2.4) * h, ey + Math.sin(a - 2.4) * h); ctx.closePath(); ctx.fill(); ctx.stroke();
    mzHelp.dots = pts.length - 1;
    return;
  }
  if (now >= mzRt.showUntil) return;
  const S = MZ_K * T, pts = mzRt.path.slice(1, 9);
  const P = mzRt.path, last = pts.length - 1;
  pts.forEach(([cx, cy], k) => {
    const i = k + 1, nxt = P[i + 1], dir = nxt ? [nxt[0] - cx, nxt[1] - cy] : [cx - P[i - 1][0], cy - P[i - 1][1]], ang = mzRouteChevAngle(dir[0], dir[1]);
    const on = Math.floor(now / 120) % 8 === k, end = i === P.length - 1, r = T * (end ? (on ? 0.8 : 0.7) : on ? 0.62 : 0.45), p = mzOn((cx + 0.5) * MZ_K, (cy + 0.5) * MZ_K), X = ox + p[0] * T, Y = oy + p[1] * T;
    const dart = q => { ctx.beginPath(); ctx.moveTo(q, 0); ctx.lineTo(-q * 0.8, -q * 0.9); ctx.lineTo(-q * 0.3, 0); ctx.lineTo(-q * 0.8, q * 0.9); ctx.closePath(); ctx.fill(); };
    ctx.save(); ctx.translate(X, Y); ctx.rotate(ang);
    ctx.fillStyle = '#1a1a1a'; dart(r + Math.max(1, T / 6));
    ctx.fillStyle = end ? (on ? '#ffe680' : '#ffd54f') : on ? '#ffd54f' : '#ffffff'; dart(r);
    ctx.restore();
  });
}


const MZ_CLOCK_PX = 18;
function mzClock(now) {
  const dt = mzRt.clockT ? Math.min(now - mzRt.clockT, Math.max(0, now - mzRt.t0)) : 0;
  mzRt.clockT = now;
  if (mzRt.t0 && (dt > 1000 || mapCovered(true) || !howtoEl.hidden || sightBusy())) mzRt.t0 += dt;
}
function mzClockFoot(dpr, now) {
  return 0;
}
function drawMzClock(w, dpr, now) {
  return;
}

const mzGateUsed = new Set();
let mzTrailPrev = '';
const mzTrail = new Map();





const mzMv = { n: 0, cell: '', prev: '', t: 0, undo: false, x: 0, y: 0 };
function mzMvReset(m) { m.n = 0; m.undo = false; m.prev = ''; }
function mzMvStep(m, x, y, now) {
  const k = x + ',' + y;
  if (k === m.cell) return;
  if (m.cell && Math.abs(x - m.x) === 1 && Math.abs(y - m.y) === 1) mzMvStep(m, x, m.y, now);
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

const MZ_TILE_N = 8, mzTiles = new Map();
function mzTileTick() {
  if (rp.x === null) return;
  const a = Math.floor(Math.floor(rp.x / MZ_K) / MZ_TILE_N), b = Math.floor(Math.floor(rp.y / MZ_K) / MZ_TILE_N), k = a + ',' + b;
  if (!mzTiles.has(k)) mzTiles.set(k, [a, b, performance.now()]);
}
function drawMzTiles(tx0, ty0, tx1, ty1, ox, oy, T, now) {
  if (!mzTiles.size) return;
  const S = MZ_TILE_N * MZ_K * T, g = Math.max(2, T * 0.25), r = Math.max(1.5, T * 0.12);
  ctx.save();
  for (const [a, b, t0] of mzTiles.values()) {
    const X = ox + a * S, Y = oy + b * S;
    if (X > ctx.canvas.width || Y > ctx.canvas.height || X + S < 0 || Y + S < 0) continue;
    const p = t0 ? Math.min(1, Math.max(0, (now - t0) / 450)) : 1, ins = (1 - p) * S * 0.05, X2 = X + ins, Y2 = Y + ins, S2 = S - 2 * ins;
    ctx.globalAlpha = p;
    ctx.fillStyle = 'rgba(255,244,214,.18)'; ctx.fillRect(X2, Y2, S2, S2);
    ctx.strokeStyle = 'rgba(214,176,112,.55)'; ctx.lineWidth = Math.max(1, T * 0.06); ctx.setLineDash([g, g]); ctx.strokeRect(X2 + g, Y2 + g, S2 - 2 * g, S2 - 2 * g);
    ctx.setLineDash([]); ctx.fillStyle = 'rgba(214,176,112,.7)';
    for (const [cx, cy] of [[X2 + g, Y2 + g], [X2 + S2 - g, Y2 + g], [X2 + g, Y2 + S2 - g], [X2 + S2 - g, Y2 + S2 - g]]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

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

    const p = mzOn((cx + 0.5 + dx * 0.5) * MZ_K, (cy + 0.5 + dy * 0.5) * MZ_K), X = Math.round(ox + p[0] * T), Y = Math.round(oy + p[1] * T);
    const px = dy, py = dx, gap = T * 0.42, s = Math.max(3, T * 0.2), e = Math.round(s / 2);
    const ax = X + px * gap, ay = Y + py * gap, bx = X - px * gap, by = Y - py * gap;
    if (used) {
      const h = q * 2 + Math.round(pulse * q);
      ctx.fillStyle = `rgba(255,214,102,${0.28 + pulse * 0.2})`; ctx.fillRect(X - h, Y - h, h * 2, h * 2);
    }
    ctx.save();
    ctx.lineCap = 'butt'; ctx.lineWidth = Math.max(2, T * 0.14);
    ctx.strokeStyle = used ? '#ffd24a' : `rgba(255,248,230,${0.55 + 0.3 * pulse})`;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - px * T * 0.22, ay - py * T * 0.22); ctx.moveTo(bx, by); ctx.lineTo(bx + px * T * 0.22, by + py * T * 0.22); ctx.stroke();
    for (const [qx, qy] of [[ax, ay], [bx, by]]) {
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(Math.round(qx - e - 1), Math.round(qy - e - 1), e * 2 + 2, e * 2 + 2);
      ctx.fillStyle = used ? '#ffe066' : '#fff8e6'; ctx.fillRect(Math.round(qx - e), Math.round(qy - e), e * 2, e * 2);
    }
    ctx.restore();
  }
}
function drawMzHalf(ox, oy, T, now) {
  const c = mzHalf.cell;
  if (!c) return;
  const p = mzOn((c[0] + 0.5) * MZ_K, (c[1] + 0.5) * MZ_K), X = Math.round(ox + p[0] * T), Y = Math.round(oy + p[1] * T);
  if (X < -T * 3 || Y < -T * 3 || X > cv.width + T * 3 || Y > cv.height + T * 3) return;
  const used = mzHalf.passed, dx = mzHalf.dir[0], dy = mzHalf.dir[1], px = dy === 0 && dx === 0 ? 0 : -dy, py = dy === 0 && dx === 0 ? 1 : dx;
  const gap = T * 0.42, s = Math.max(3, T * 0.2), e = Math.round(s / 2), ax = X + px * gap, ay = Y + py * gap, bx = X - px * gap, by = Y - py * gap;
  ctx.save();
  if (used && now - mzHalf.at < 800) {
    const u = (now - mzHalf.at) / 800;
    ctx.strokeStyle = `rgba(255,224,102,${0.6 * (1 - u)})`; ctx.lineWidth = Math.max(1, T * 0.08);
    ctx.beginPath(); ctx.arc(X, Y, T * (0.3 + 1.2 * u), 0, Math.PI * 2); ctx.stroke();
  }
  ctx.lineCap = 'butt'; ctx.lineWidth = Math.max(2, T * 0.14);
  ctx.strokeStyle = used ? '#ffd24a' : '#fff8e6';
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - px * T * 0.22, ay - py * T * 0.22); ctx.moveTo(bx, by); ctx.lineTo(bx + px * T * 0.22, by + py * T * 0.22); ctx.stroke();
  for (const [qx, qy] of [[ax, ay], [bx, by]]) {
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(Math.round(qx - e - 1), Math.round(qy - e - 1), e * 2 + 2, e * 2 + 2);
    ctx.fillStyle = used ? '#ffe066' : '#fff8e6'; ctx.fillRect(Math.round(qx - e), Math.round(qy - e), e * 2, e * 2);
  }
  ctx.restore();
}
function mzBloomScale(n) {
  if (typeof n !== 'number' || !(n > 0)) return 1;
  return Math.min(2.4, 1 + 0.35 * n);
}
function mzEntrancePulse(now) {
  if (typeof now !== 'number' || !isFinite(now)) return 0.8;
  return 0.55 + 0.35 * Math.sin(now / 300);
}
function mzRailTiePerp(dx, dy) { if (typeof dx !== 'number' || typeof dy !== 'number' || !isFinite(dx) || !isFinite(dy) || (dx === 0 && dy === 0)) return [1, 0]; const l = Math.hypot(dx, dy); return [-dy / l, dx / l]; }
function mzFieldArea(p, q, r) {
  if (!Array.isArray(p) || !Array.isArray(q) || !Array.isArray(r)) return 0;
  const v = [p[0], p[1], q[0], q[1], r[0], r[1]];
  if (v.some(n => typeof n !== 'number' || !isFinite(n))) return 0;
  return Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1])) / 2;
}
function mzFootprint(dx, dy, seq) {
  if (typeof dx !== 'number' || typeof dy !== 'number' || !isFinite(dx) || !isFinite(dy) || (dx === 0 && dy === 0)) return { angle: 0, side: 0 };
  const s = Number(seq); if (!isFinite(s)) return { angle: 0, side: 0 };
  return { angle: Math.atan2(dy, dx), side: Math.abs(Math.floor(s)) % 2 === 0 ? -1 : 1 };
}
function mzTerritory(steps) {
  if (typeof steps !== 'number' || !isFinite(steps)) return { r: 0, a: 0 };
  const n = Math.floor(steps);
  if (n <= 0) return { r: 0, a: 0 };
  if (n < 10) return { r: 1.15, a: 0.16 };
  if (n < 30) return { r: 1.45, a: 0.22 };
  if (n < 80) return { r: 1.75, a: 0.28 };
  return { r: 2.05, a: 0.34 };
}
function drawMzTerritory(tx0, ty0, tx1, ty1, ox, oy, T) {
  if (!mzTrail.size) return;
  const t = mzTerritory(mzTrail.size);
  if (!t.r) return;
  const m = Math.ceil(t.r), c0 = Math.floor(tx0 / MZ_K) - m, r0 = Math.floor(ty0 / MZ_K) - m, c1 = Math.ceil(tx1 / MZ_K) + m, r1 = Math.ceil(ty1 / MZ_K) + m;
  const S = MZ_K * T, R = t.r * S;
  ctx.save();
  for (const [cx, cy] of mzTrail.values()) {
    if (cx < c0 || cx > c1 || cy < r0 || cy > r1) continue;
    const p = mzOn((cx + 0.5) * MZ_K, (cy + 0.5) * MZ_K), X = ox + p[0] * T, Y = oy + p[1] * T;
    const ar = mzArea(cx, cy), rgb = ar ? mzZoneTint(ar).rgb : '255,214,102';
    const g = ctx.createRadialGradient(X, Y, 0, X, Y, R);
    g.addColorStop(0, 'rgba(' + rgb + ',' + t.a + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, R, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function drawMzTrail(tx0, ty0, tx1, ty1, ox, oy, T, now) {
  if (!mzTrail.size) return;
  const c0 = Math.floor(tx0 / MZ_K) - 1, r0 = Math.floor(ty0 / MZ_K) - 1, c1 = Math.ceil(tx1 / MZ_K), r1 = Math.ceil(ty1 / MZ_K);
  const rg = Math.max(2, T * 0.3), lw = Math.max(3, T * 0.5), grains = [], links = [], flowers = [], stations = [], stationAll = [], hubAll = [];
  const S = MZ_K * T, edges = [], entrances = [];
  let seq = 0;
  const prints = []; let pend = null;
  for (const [cx, cy] of mzTrail.values()) {
    seq++;
    const pn = mzOn((cx + 0.5) * MZ_K, (cy + 0.5) * MZ_K);
    if (pend) { prints.push([pend[0], pend[1], ox + pn[0] * T - pend[0], oy + pn[1] * T - pend[1], pend[2], pend[3], pend[4]]); pend = null; }
    if (seq % 6 === 0) pend = [ox + pn[0] * T, oy + pn[1] * T, seq / 6, cx, cy];
    if (seq % 10 === 0) { const pp = mzOn((cx + 0.5) * MZ_K, (cy + 0.5) * MZ_K), arA = mzArea(cx, cy); stationAll.push([ox + pp[0] * T, oy + pp[1] * T, arA ? mzZoneTint(arA).rgb : '220,70,60']); }
    if (seq % 30 === 0) { const ph = mzOn((cx + 0.5) * MZ_K, (cy + 0.5) * MZ_K), arH = mzArea(cx, cy); hubAll.push([ox + ph[0] * T, oy + ph[1] * T, arH ? mzZoneTint(arH).rgb : '220,70,60']); }
    if (cx < c0 || cx > c1 || cy < r0 || cy > r1) continue;
    const at = (x, y) => { const p = mzOn(x, y); return [ox + p[0] * T, oy + p[1] * T]; };
    const a = at((cx + 0.5) * MZ_K, (cy + 0.5) * MZ_K);
    grains.push(a);
    const ar = mzArea(cx, cy);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!mzTrail.has((cx + dx) + ',' + (cy + dy))) edges.push([ox + cx * S, oy + cy * S, dx, dy, ar ? mzZoneTint(ar).rgb : '255,214,102']);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (mzOpen(cx, cy, dx, dy) && !mzTrail.has((cx + dx) + ',' + (cy + dy))) entrances.push([ox + (cx + 0.5) * S + dx * S / 2, oy + (cy + 0.5) * S + dy * S / 2, dx, dy]);
    if (seq % 10 === 0) stations.push([a[0], a[1], ar ? mzZoneTint(ar).rgb : '220,70,60']);
    let nb = 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (mzTrail.has((cx + dx) + ',' + (cy + dy)) && mzOpen(cx, cy, dx, dy)) nb++;
    flowers.push([a[0] + T * 0.22, a[1] - T * 0.18, ar ? mzZoneTint(ar).rgb : '255,170,200', mzBloomScale(nb), nb >= 3]);
    for (const [dx, dy] of [[1, 0], [0, 1]]) if (mzTrail.has((cx + dx) + ',' + (cy + dy)) && mzOpen(cx, cy, dx, dy)) links.push([a, at((cx + 0.5 + dx) * MZ_K, (cy + 0.5 + dy) * MZ_K)]);
  }
  ctx.lineCap = 'butt'; ctx.lineWidth = Math.max(2, T * 0.12);
  for (const [X, Y, dx, dy, rgb] of edges) {
    ctx.strokeStyle = 'rgba(' + rgb + ',.9)'; ctx.beginPath();
    if (dx === 1) { ctx.moveTo(X + S, Y); ctx.lineTo(X + S, Y + S); } else if (dx === -1) { ctx.moveTo(X, Y); ctx.lineTo(X, Y + S); } else if (dy === 1) { ctx.moveTo(X, Y + S); ctx.lineTo(X + S, Y + S); } else { ctx.moveTo(X, Y); ctx.lineTo(X + S, Y); }
    ctx.stroke();
  }
  ctx.lineCap = 'butt'; ctx.strokeStyle = 'rgba(101,67,33,.8)'; ctx.lineWidth = Math.max(2, T * 0.14);
  const tieH = (lw + T * 0.55) / 2;
  ctx.beginPath();
  for (const [p, q] of links) { const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], u = mzRailTiePerp(q[0] - p[0], q[1] - p[1]); ctx.moveTo(m[0] - u[0] * tieH, m[1] - u[1] * tieH); ctx.lineTo(m[0] + u[0] * tieH, m[1] + u[1] * tieH); }
  ctx.stroke();
  ctx.lineCap = 'round';
  const stroke = (col, w) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); for (const [p, q] of links) { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); } ctx.stroke(); };
  const dot = (col, r) => { ctx.fillStyle = col; for (const [X, Y] of grains) { ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill(); } };
  stroke('rgba(26,26,26,.35)', lw + 2); dot('rgba(26,26,26,.35)', rg + 1);
  stroke('rgba(255,250,232,.55)', lw); dot('rgba(255,250,232,.55)', rg);
  ctx.strokeStyle = 'rgba(70,70,78,.85)'; ctx.lineWidth = Math.max(1.5, T * 0.05); ctx.beginPath();
  for (const [p, q] of links) { const u = mzRailTiePerp(q[0] - p[0], q[1] - p[1]), o = T * 0.16; for (const s of [-1, 1]) { ctx.moveTo(p[0] + u[0] * o * s, p[1] + u[1] * o * s); ctx.lineTo(q[0] + u[0] * o * s, q[1] + u[1] * o * s); } }
  ctx.stroke();
  const pr0 = Math.max(1.5, T * 0.09);
  for (const [X, Y, rgb, scale, full] of flowers) {
    const pr = pr0 * scale;
    if (full) {
      ctx.fillStyle = 'rgba(' + rgb + ',.35)';
      for (let i = 0; i < 5; i++) { const an = i * Math.PI * 2 / 5 - Math.PI / 2 + Math.PI / 5; ctx.beginPath(); ctx.arc(X + Math.cos(an) * pr * 1.4 * 1.55, Y + Math.sin(an) * pr * 1.4 * 1.55, pr * 1.55, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.fillStyle = 'rgba(' + rgb + ',.95)';
    for (let i = 0; i < 5; i++) { const an = i * Math.PI * 2 / 5 - Math.PI / 2; ctx.beginPath(); ctx.arc(X + Math.cos(an) * pr * 1.4, Y + Math.sin(an) * pr * 1.4, pr, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.arc(X, Y, pr * 0.8, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i + 1 < stationAll.length; i++) {
    const p = stationAll[i], q = stationAll[i + 1];
    ctx.strokeStyle = 'rgba(' + p[2] + ',.28)'; ctx.lineWidth = Math.max(3, T * 0.22); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(1.5, T * 0.07); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
  }
  for (let i = 0; i + 2 < stationAll.length; i += 2) {
    const p = stationAll[i], q = stationAll[i + 1], r = stationAll[i + 2];
    if (mzFieldArea(p, q, r) > T * T * 4) { ctx.fillStyle = 'rgba(' + p[2] + ',.13)'; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.lineTo(r[0], r[1]); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(' + p[2] + ',.28)'; ctx.lineWidth = Math.max(3, T * 0.22); ctx.beginPath(); ctx.moveTo(r[0], r[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(1.5, T * 0.07); ctx.beginPath(); ctx.moveTo(r[0], r[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); }
  }
  ctx.save(); ctx.fillStyle = 'rgba(40,26,16,.75)';
  for (const [X, Y, dx, dy, k, pcx, pcy] of prints) {
    if (X < ox + tx0 * T - T || X > ox + tx1 * T + T || Y < oy + ty0 * T - T || Y > oy + ty1 * T + T) continue;
    const f = mzFootprint(dx, dy, k);
    if (!f.side) continue;
    if (!(Math.hypot(dx, dy) > S * 0.9 && Math.hypot(dx, dy) < S * 1.1)) continue;
    if (!mzOpen(pcx, pcy, Math.round(dx / S), Math.round(dy / S))) continue;
    const off = f.side * T * 0.18, fx = X - Math.sin(f.angle) * off, fy = Y + Math.cos(f.angle) * off;
    ctx.beginPath(); ctx.ellipse(fx, fy, T * 0.25, T * 0.15, f.angle, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(fx + Math.cos(f.angle) * T * 0.3, fy + Math.sin(f.angle) * T * 0.3, T * 0.09, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  const sr = Math.max(4, T * 0.38);
  const hr = Math.max(10, T * 1.5, sr * 4);
  for (const [X, Y, rgb] of hubAll) {
    ctx.fillStyle = 'rgba(' + rgb + ',.14)'; ctx.beginPath(); ctx.arc(X, Y, hr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(' + rgb + ',.85)'; ctx.lineWidth = Math.max(3, T * 0.14); ctx.beginPath(); ctx.arc(X, Y, hr, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = Math.max(1.5, T * 0.06); ctx.beginPath(); ctx.arc(X, Y, hr * 0.8, 0, Math.PI * 2); ctx.stroke();
  }
  for (const [X, Y, rgb] of stations) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X, Y, sr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgb(' + rgb + ')'; ctx.lineWidth = Math.max(2, T * 0.12); ctx.beginPath(); ctx.arc(X, Y, sr, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgb(' + rgb + ')'; ctx.beginPath(); ctx.arc(X, Y, sr * 0.38, 0, Math.PI * 2); ctx.fill();
  }
  const ea = calmMotion ? 0.8 : mzEntrancePulse(now);
  ctx.fillStyle = 'rgba(255,255,255,' + ea + ')'; ctx.strokeStyle = 'rgba(26,26,26,.35)'; ctx.lineWidth = Math.max(1, T * 0.05); ctx.lineJoin = 'round';
  for (const [X, Y, dx, dy] of entrances) {
    const tip = [X + dx * T * 0.34, Y + dy * T * 0.34], base = [X - dx * T * 0.14, Y - dy * T * 0.14], perp = [dy, dx];
    ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.lineTo(base[0] + perp[0] * T * 0.24, base[1] + perp[1] * T * 0.24); ctx.lineTo(base[0] - perp[0] * T * 0.24, base[1] - perp[1] * T * 0.24); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
}



function mzPebSkip(a) {
  if (!a.pebSkip) { a.pebSkip = new Set(); for (const L of mzLineSet(a)) for (const d of L.dots) a.pebSkip.add(Math.floor(d[0] / MZ_K) + ',' + Math.floor(d[1] / MZ_K)); }
  return a.pebSkip;
}
function mzPebOk(a, cx, cy) {
  if (!a || a.t[(cy - a.y0) * MZ_R + cx - a.x0] !== 1 || (a.eaten && a.eaten.has(cx + ',' + cy)) || mzSpotCell(cx, cy) || mzGrainAt(cx, cy) || mzPadAt(cx, cy) >= 0) return false;
  return !mzPebSkip(a).has(cx + ',' + cy);
}



function mzPebStat(a) {
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
const mzPebPct = a => { const s = a && mzPebStat(a); return s && s.total > 0 ? Math.floor(s.n * 100 / s.total) : -1; };
function mzFanfareDone(k, set) {
  try {
    const L = JSON.parse(localStorage.getItem('nsg_fanfare') || '[]').filter(x => typeof x === 'string').slice(-400);
    if (!set) return L.includes(k);
    if (!L.includes(k)) L.push(k);
    localStorage.setItem('nsg_fanfare', JSON.stringify(L));
  } catch (e) { return !!set && false; }
  return true;
}
function mzFanfare(a) {
  if (mzPebPct(a) !== 100 || a.fanfared) return;
  a.fanfared = true;
  const fk = a.rx + '_' + a.ry;
  if (mzFanfareDone(fk)) return;
  mzFanfareDone(fk, true);
  chordSound(); roll.happyT = Math.max(roll.happyT || 0, 1); riceSay('ぜんぶ 通った！', 1800, 'happy');
  const now = performance.now(), cols = ['#ffffff', '#fff6c2', '#ffe066'];
  for (let j = 0; j < 12; j++) { const t = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 2.5; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 3, c: cols[j % 3], life: 0.5 + Math.random() * 0.4 }); }
}
function mzPebTick() {
  if (rp.x === null) return;
  const cx = Math.floor(rp.x / MZ_K), cy = Math.floor(rp.y / MZ_K), a = mzArea(cx, cy);
  if (!mzPebOk(a, cx, cy)) return;
  (a.eaten || (a.eaten = new Set())).add(cx + ',' + cy);
  dirty = true;
  mzFanfare(a);
}



const MZ_FOG = { 1: { sight: 0, veil: 0.2 }, 2: { sight: 9, veil: 0.3 }, 3: { sight: 6, veil: 0.4 }, 4: { sight: 4, veil: 0.46 } };
function mzFogAlpha(scale, d, visited, bonus = 0) {
  const f = MZ_FOG[Math.min(4, Math.max(1, Math.round(scale)))];
  const sight = f.sight ? f.sight + bonus : 0;
  if (!sight) return { veil: visited ? 0 : f.veil, tint: visited ? 0.34 : 0 };
  if (d <= sight) return { veil: 0, tint: visited ? 0.34 : 0 };
  return { veil: visited ? f.veil * 0.4 : f.veil, tint: visited ? 0.22 : 0 };
}

function mzZoneTint(a) {
  if (a.zone === undefined || (!a.zone && a.zoneN !== G.spots.length)) {
    a.zoneN = G.spots.length;
    a.zone = G.spots.length && G.areaZone ? G.areaZone(toLatLng((a.x0 + MZ_R / 2) * MZ_K, (a.y0 + MZ_R / 2) * MZ_K)) : '';
  }
  const rgb = a.zone && G.areaRgb ? G.areaRgb(a.zone) : null;
  if (!rgb) return { rgb: '255,214,102', k: 1 };
  return { rgb: rgb.join(','), k: 1 + 0.35 * G.areaTint(a.zone, G.areaProgress(a.zone)) };
}

function mzFogCells(tx0, ty0, tx1, ty1, ox, oy, T, want) {
  const S = MZ_K * T, c0 = Math.floor(tx0 / MZ_K) - 1, r0 = Math.floor(ty0 / MZ_K) - 1, c1 = Math.ceil(tx1 / MZ_K), r1 = Math.ceil(ty1 / MZ_K);
  const me = rp.x === null ? null : [rp.x / MZ_K, rp.y / MZ_K], gp = mzRt.path && mzRt.path.length ? mzRt.path[mzRt.path.length - 1] : null, sc = mzScale, tb = typeof mzTorchBonus === 'function' ? mzTorchBonus() : 0;
  const buckets = new Map();
  for (let ry = Math.floor(r0 / MZ_R); ry <= Math.floor(r1 / MZ_R); ry++) for (let rx = Math.floor(c0 / MZ_R); rx <= Math.floor(c1 / MZ_R); rx++) {
    const a = mzAreas.get(rx + '_' + ry);
    if (!a) continue;
    const zt = want === 'tint' ? mzZoneTint(a) : null;
    for (let cy = Math.max(r0, a.y0); cy <= Math.min(r1, a.y0 + MZ_R - 1); cy++) for (let cx = Math.max(c0, a.x0); cx <= Math.min(c1, a.x0 + MZ_R - 1); cx++) {
      if (a.t[(cy - a.y0) * MZ_R + cx - a.x0] !== 1 || (gp && gp[0] === cx && gp[1] === cy)) continue;
      const visited = mzTrail.has(cx + ',' + cy) || !!(a.eaten && a.eaten.has(cx + ',' + cy)), d = me ? Math.hypot(cx + 0.5 - me[0], cy + 0.5 - me[1]) : 0, f = mzFogAlpha(sc, d, visited, tb);
      const k = want === 'tint' ? (f.tint < 0.01 ? '' : `rgba(${zt.rgb},${Math.min(0.58, f.tint * zt.k).toFixed(2)})`) : (f.veil < 0.01 ? '' : `rgba(244,240,222,${f.veil.toFixed(2)})`);
      if (!k) continue;
      const b = buckets.get(k) || buckets.set(k, []).get(k);
      b.push(ox + cx * S, oy + cy * S);
    }
  }
  return buckets;
}
function mzFogFill(buckets, S) {
  for (const [k, xs] of buckets) {
    ctx.fillStyle = k;
    for (let i = 0; i < xs.length; i += 2) ctx.fillRect(Math.floor(xs[i]), Math.floor(xs[i + 1]), Math.ceil(S), Math.ceil(S));
  }
}
function drawMzFogTint(tx0, ty0, tx1, ty1, ox, oy, T) {
  if (rec) return;
  mzFogFill(mzFogCells(tx0, ty0, tx1, ty1, ox, oy, T, 'tint'), MZ_K * T);
}
function mzGoalBeacon(n) { return typeof n !== 'number' || !(n >= 0) || n >= 40 ? 0 : Math.min(1, Math.max(0, (40 - n) / 40)); }
function drawMzFogVeil(tx0, ty0, tx1, ty1, ox, oy, T, now) {
  if (rec) return;
  const S = MZ_K * T, gp = mzRt.path && mzRt.path.length ? mzRt.path[mzRt.path.length - 1] : null;
  if (!mzViewClear(now)) mzFogFill(mzFogCells(tx0, ty0, tx1, ty1, ox, oy, T, 'veil'), S);
  if (gp) {
    const p = mzOn((gp[0] + 0.5) * MZ_K, (gp[1] + 0.5) * MZ_K), X = ox + p[0] * T, Y = oy + p[1] * T, prox = mzGoalBeacon(mzRt.path ? mzRt.path.length - 1 : null), R = S * (0.9 + 0.6 * prox), ph = S * (1.2 + 2.8 * prox), pw = S * (0.34 + 0.3 * prox), pulse = (Math.sin(now / 260) + 1) / 2;
    if (X + R > 0 && X - R < ctx.canvas.width && Y + R > 0 && Y - ph < ctx.canvas.height) {
      const g = ctx.createRadialGradient(X, Y, 0, X, Y, R);
      g.addColorStop(0, `rgba(255,224,102,${Math.min(0.95, 0.45 + pulse * 0.2 + prox * 0.25)})`); g.addColorStop(1, 'rgba(255,224,102,0)');
      ctx.fillStyle = g; ctx.fillRect(X - R, Y - R, R * 2, R * 2);
      const pg = ctx.createLinearGradient(0, Y, 0, Y - ph);
      pg.addColorStop(0, `rgba(255,224,102,${0.28 + 0.4 * prox})`); pg.addColorStop(1, 'rgba(255,224,102,0)');
      ctx.fillStyle = pg; ctx.fillRect(X - pw / 2, Y - ph, pw, ph);
      const cg = ctx.createLinearGradient(0, Y, 0, Y - ph * 0.7);
      cg.addColorStop(0, `rgba(255,246,214,${0.25 + 0.4 * prox})`); cg.addColorStop(1, 'rgba(255,246,214,0)');
      ctx.fillStyle = cg; ctx.fillRect(X - pw / 6, Y - ph * 0.7, pw / 3, ph * 0.7);
    }
  }
}

function mzPebWave(d, now) { return d === null || d > 7 || calmMotion ? 0 : Math.max(0, Math.sin(now / 280 - d * 0.9)); }
function drawMzPebs(tx0, ty0, tx1, ty1, ox, oy, T, now) {
  const c0 = Math.floor(tx0 / MZ_K) - 1, r0 = Math.floor(ty0 / MZ_K) - 1, c1 = Math.ceil(tx1 / MZ_K), r1 = Math.ceil(ty1 / MZ_K), q = Math.max(1, Math.round(T / 8)), me = rp.x === null ? null : [rp.x / MZ_K, rp.y / MZ_K];
  for (let ry = Math.floor(r0 / MZ_R); ry <= Math.floor(r1 / MZ_R); ry++) for (let rx = Math.floor(c0 / MZ_R); rx <= Math.floor(c1 / MZ_R); rx++) {
    const a = mzAreas.get(rx + '_' + ry);
    if (!a) continue;
    for (let cy = Math.max(r0, a.y0); cy <= Math.min(r1, a.y0 + MZ_R - 1); cy++) for (let cx = Math.max(c0, a.x0); cx <= Math.min(c1, a.x0 + MZ_R - 1); cx++) {
      if (!mzPebOk(a, cx, cy)) continue;
      const p = mzOn((cx + 0.5) * MZ_K, (cy + 0.5) * MZ_K), X = Math.round(ox + p[0] * T), Y = Math.round(oy + p[1] * T);
      const w = mzPebWave(me ? Math.hypot(cx + 0.5 - me[0], cy + 0.5 - me[1]) : null, now), qq = Math.round(q * (1 + 0.9 * w));
      ctx.fillStyle = 'rgba(26,26,26,.3)'; ctx.fillRect(X - qq - 1, Y - qq - 1, qq * 2 + 2, qq * 2 + 2);
      ctx.fillStyle = w > 0.5 ? 'rgba(255,214,102,.95)' : 'rgba(255,250,232,.9)'; ctx.fillRect(X - qq, Y - qq, qq * 2, qq * 2);
    }
  }
}



const MZ_GRAIN_N = 6, MZ_GRAIN_SEC = 2;
const jstDay = () => Math.floor((Date.now() + 9 * 3600e3) / 86400e3);
function mzGrainSet(a) {
  const day = jstDay();
  if (a.gDay === day) return a.grains;
  const N = MZ_R, cand = [];
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
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
function mzGrainAt(cx, cy) {
  const a = mzArea(cx, cy);
  if (!a || !mzGrainSet(a).has((cy - a.y0) * MZ_R + cx - a.x0)) return false;
  return !(G.mzGrainHas && G.mzGrainHas(mzGrainKey(cx, cy)));
}
let mzGrainCell = '';
function mzGrainTick() {
  if (rp.x === null) return;
  const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K), k = a + ',' + b;
  if (k === mzGrainCell || !mzArea(a, b)) return;
  mzGrainCell = k;
  if (!mzGrainAt(a, b) || !G.mzGrain) return;
  const r = G.mzGrain(mzGrainKey(a, b));
  if (!r) return;
  grainSound(); roll.happyT = 1.2; dirty = true; mzSpringShot();
  const now0 = performance.now(), back = mzRt.t0 ? Math.min(MZ_GRAIN_SEC * 1000, now0 - mzRt.t0) : 0;
  if (back > 0) mzRt.t0 += back;
  floatText(`🌾 金の米つぶ +${r.pts}pt${back >= 1000 ? `・⏱−${Math.round(back / 1000)}秒` : ''}（きょう ${r.n}こ）`);
  const now = performance.now(), cols = ['#ffe066', '#ffd23f', '#fff6c2'];
  for (let i = 0; i < 14; i++) { const t = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 3, c: cols[i % 3], life: 0.6 + Math.random() * 0.4 }); }
}



const MZ_DEAD_SAY = ['行き止まりだら〜。ぐるっと もどろまい', 'ここ 静かで ええ とこじゃん', 'ちょっと 寄り道 したら ええ ことが あるんだら', '🐸 かえるが ひょっこり。ここまで 来たん？', '🐦 すずめが ちゅん。ひとやすみ していこまい', '🌾 風が ふいて 気持ちええ ねぇ', 'おっと 行き止まり！ でも 寄り道も 楽しいじゃん', '🍵 ここで 抹茶でも 飲みたい ねぇ'];
const MZ_DEAD_GAP = 6000;
const mzDeadSeen = new Set();
let mzDeadCell = '', mzDeadAt = -1e9;
function mzIsDead(cx, cy) {
  if (mzType(cx, cy) !== 1 || mzSpotCell(cx, cy)) return false;
  let open = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (mzOpen(cx, cy, dx, dy)) open++;
  return open === 1;
}
const mzDeadLine = (cx, cy) => MZ_DEAD_SAY[((cx * 7919 + cy * 104729) >>> 0) % MZ_DEAD_SAY.length];
function mzDeadTick() {
  if (rp.x === null) return;
  const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K), k = a + ',' + b;
  if (k === mzDeadCell || !mzArea(a, b)) return;
  mzDeadCell = k;
  const key = jstDay() + ':' + k, now = performance.now();
  if (mzDeadSeen.has(key) || now - mzDeadAt < MZ_DEAD_GAP || mzGrainAt(a, b) || !mzIsDead(a, b)) return;
  const p = mzRt.path, last = p && p.length ? p[p.length - 1] : null;
  if (last && last[0] === a && last[1] === b) return;
  if (sightBusy() || mapCovered()) return;
  mzDeadSeen.add(key); mzDeadAt = now;
  riceSay(mzDeadLine(a, b), 2200, 'happy');
  const cols = ['#ffe066', '#fff6c2', '#ffffff'];
  for (let i = 0; i < 6; i++) { const t = Math.random() * Math.PI * 2, v = 1 + Math.random() * 2; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 2, c: cols[i % 3], life: 0.5 + Math.random() * 0.3 }); }
  dirty = true;
}
function drawMzGrains(tx0, ty0, tx1, ty1, ox, oy, T, now) {
  const S = MZ_K * T, c0 = Math.floor(tx0 / MZ_K) - 1, r0 = Math.floor(ty0 / MZ_K) - 1, c1 = Math.ceil(tx1 / MZ_K), r1 = Math.ceil(ty1 / MZ_K);
  const r = Math.max(4, T * 0.55), q = Math.max(1, Math.round(T / 8));
  for (let ry = Math.floor(r0 / MZ_R); ry <= Math.floor(r1 / MZ_R); ry++) for (let rx = Math.floor(c0 / MZ_R); rx <= Math.floor(c1 / MZ_R); rx++) {
    const a = mzArea(rx * MZ_R, ry * MZ_R);
    if (!a) continue;
    for (const k of mzGrainSet(a)) {
      const cx = a.x0 + k % MZ_R, cy = a.y0 + ((k / MZ_R) | 0);
      if (cx < c0 || cx > c1 || cy < r0 || cy > r1 || (G.mzGrainHas && G.mzGrainHas(mzGrainKey(cx, cy)))) continue;
      const ph = (cx * 7 + cy * 13) % 10, bob = Math.sin(now / 300 + ph) * T * 0.12, on = mzOn((cx + 0.5) * MZ_K, (cy + 0.5) * MZ_K), X = ox + on[0] * T, Y0 = oy + on[1] * T, Y = Y0 + bob;
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(Math.round(X - r * 0.7), Math.round(Y0 + r * 0.9), Math.round(r * 1.4), q * 2);
      ctx.fillStyle = '#5a3a00'; ctx.beginPath(); ctx.arc(X, Y, r + q, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffc928'; ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff3a8'; ctx.beginPath(); ctx.arc(X - r * 0.35, Y - r * 0.35, r * 0.35, 0, Math.PI * 2); ctx.fill();
      if ((Math.floor(now / 150) + ph) % 10 === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(X + r * 0.5), Math.round(Y - r * 1.4), q, Math.round(r * 0.9)); ctx.fillRect(Math.round(X + r * 0.5 - r * 0.4), Math.round(Y - r * 1.0), Math.round(r * 0.9), q); }
    }
  }
}



const MZ_FRUIT = { n: 3, min: 6, reach: 18, moveMs: 1800 };
const mzFruit = { left: MZ_FRUIT.n, cx: -1, cy: -1, sx: -1, sy: -1, last: null, next: 0, dx: 0, dy: 0, mv: 0, px: -1, py: -1, mt: 0 };
function mzFruitReset() { Object.assign(mzFruit, { left: MZ_FRUIT.n, cx: -1, cy: -1, sx: -1, sy: -1, last: null, next: 0, dx: 0, dy: 0, mv: 0, px: -1, py: -1, mt: 0 }); }
function mzFruitDir(dx, dy, open) {
  const unit = d => Array.isArray(d) && d.length >= 2 && Math.abs(d[0]) + Math.abs(d[1]) === 1 && Number.isInteger(d[0]) && Number.isInteger(d[1]);
  const ok = Array.isArray(open) ? open.filter(unit) : [];
  if (!ok.length) return [0, 0];
  if (!unit([dx, dy])) return [ok[0][0], ok[0][1]];
  for (const [x, y] of [[dx, dy], [-dy, dx], [dy, -dx], [-dx, -dy]]) if (ok.some(d => d[0] === x && d[1] === y)) return [x, y];
  return [0, 0];
}
function mzFruitOk(cx, cy) {
  const a = mzArea(cx, cy);
  if (!a || a.t[(cy - a.y0) * MZ_R + cx - a.x0] !== 1 || mzSpotCell(cx, cy) || mzGrainAt(cx, cy) || mzPadAt(cx, cy) >= 0) return false;
  const p = mzRt.path, goal = p && p.length ? p[p.length - 1] : null;
  if (goal && goal[0] === cx && goal[1] === cy) return false;
  if (typeof mzPiece !== 'undefined' && mzPiece.cx === cx && mzPiece.cy === cy) return false;
  if (typeof mzView !== 'undefined' && mzView.cx === cx && mzView.cy === cy) return false;
  if (typeof mzCache !== 'undefined' && mzCache.cx === cx && mzCache.cy === cy) return false;
  if (typeof mzQuest !== 'undefined' && mzQuest.cx === cx && mzQuest.cy === cy) return false;
  if (typeof mzDino !== 'undefined' && mzDino.cx === cx && mzDino.cy === cy) return false;
  if (typeof mzBrigade !== 'undefined' && mzBrigade.cx === cx && mzBrigade.cy === cy) return false;
  if (typeof mzTorch !== 'undefined' && mzTorch.cx === cx && mzTorch.cy === cy) return false;
  if (typeof mzPurify !== 'undefined' && mzPurify.cells.some(c => c[0] === cx && c[1] === cy)) return false;
  if (typeof mzRescue !== 'undefined' && mzRescue.cx === cx && mzRescue.cy === cy) return false;
  if (typeof mzCube !== 'undefined' && mzCube.cx === cx && mzCube.cy === cy) return false;
  for (const k of mzGate.keys()) { const m = /^(-?\d+),(-?\d+)([rd])$/.exec(k); if (m && ((+m[1] === cx && +m[2] === cy) || (+m[1] + (m[3] === 'r' ? 1 : 0) === cx && +m[2] + (m[3] === 'd' ? 1 : 0) === cy))) return false; }
  if (mzLineSet(a).some(L => L.dots.some(d => Math.floor(d[0] / MZ_K) === cx && Math.floor(d[1] / MZ_K) === cy))) return false;
  return !mzCritDrawn.some(c => c[0] === cx && c[1] === cy);
}
function mzFruitPick() {
  const sx = mzFruit.sx, sy = mzFruit.sy, rx = Math.floor(rp.x / MZ_K), ry = Math.floor(rp.y / MZ_K);
  if (sx < 0) return null;
  const seen = new Map([[sx + ',' + sy, 0]]), q = [[sx, sy]], cand = [], ls = mzFruit.last;
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h], d = seen.get(x + ',' + y);
    if (d >= MZ_FRUIT.min && Math.abs(x - sx) + Math.abs(y - sy) >= MZ_FRUIT.min - 1 && Math.abs(x - rx) + Math.abs(y - ry) >= 3 && !(ls && ls[0] === x && ls[1] === y) && mzFruitOk(x, y)) cand.push([x, y]);
    if (d >= MZ_FRUIT.reach) continue;
    for (const [dx, dy] of MZ_DIRS) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || mzType(nx, ny) !== 1 || !mzOpen(x, y, dx, dy)) continue;
      seen.set(k, d + 1); q.push([nx, ny]);
    }
  }
  return cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
}
function mzFruitTick(now) {
  if (rp.x === null) return;
  const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K);
  if (mzFruit.sx < 0) { mzFruit.sx = a; mzFruit.sy = b; }
  if (mzFruit.cx < 0) {
    if (mzFruit.left <= 0 || now < mzFruit.next) return;
    mzFruit.next = now + 500;
    if (cubeFirstGoal()) return;
    const c = mzFruitPick();
    if (c) { Object.assign(mzFruit, { cx: c[0], cy: c[1], px: c[0], py: c[1], mt: 0, dx: 0, dy: 0, mv: now + MZ_FRUIT.moveMs }); dirty = true; }
    return;
  }
  if (a !== mzFruit.cx || b !== mzFruit.cy) {
    if (now < mzFruit.mv) return;
    const open = MZ_DIRS.filter(([dx, dy]) => { const nx = mzFruit.cx + dx, ny = mzFruit.cy + dy; return mzOpen(mzFruit.cx, mzFruit.cy, dx, dy) && mzType(nx, ny) === 1 && mzFruitOk(nx, ny) && !(nx === a && ny === b); });
    const d = mzFruitDir(mzFruit.dx, mzFruit.dy, open);
    mzFruit.mv = now + MZ_FRUIT.moveMs;
    if (!d[0] && !d[1]) return;
    mzFruit.px = mzFruit.cx; mzFruit.py = mzFruit.cy; mzFruit.mt = now;
    mzFruit.cx += d[0]; mzFruit.cy += d[1]; mzFruit.dx = d[0]; mzFruit.dy = d[1]; dirty = true;
    return;
  }
  const r = G.mzFruit && G.mzFruit();
  if (!r) return;
  mzFruit.left--; mzFruit.last = [a, b]; mzFruit.cx = mzFruit.cy = -1; mzFruit.next = now; mzFruit.dx = mzFruit.dy = 0; mzFruit.px = mzFruit.py = -1; mzFruit.mt = 0;
  grainSound(); roll.happyT = 1.2; dirty = true;
  floatText(`🍊 くだものゲット！ +${r.pts}pt${mzFruit.left ? `（あと ${mzFruit.left}こ）` : ''}`);
  const cols = ['#ff9a1f', '#ffc46b', '#7ccf5a'];
  for (let i = 0; i < 14; i++) { const t = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 3, c: cols[i % 3], life: 0.6 + Math.random() * 0.4 }); }
}
function drawMzFruit(ox, oy, T, now) {
  if (mzFruit.cx < 0) return;
  const r = Math.max(5, T * 0.5), q = Math.max(1, Math.round(T / 8)), sl = mzFruit.mt && mzFruit.px >= 0 ? Math.max(0, Math.min(1, (now - mzFruit.mt) / 350)) : 1, fx = sl < 1 ? mzFruit.px + (mzFruit.cx - mzFruit.px) * sl : mzFruit.cx, fy = sl < 1 ? mzFruit.py + (mzFruit.cy - mzFruit.py) * sl : mzFruit.cy, on = mzOn((fx + 0.5) * MZ_K, (fy + 0.5) * MZ_K), X = ox + on[0] * T, Y0 = oy + on[1] * T, Y = Y0 + Math.sin(now / 320) * T * 0.1;
  ctx.strokeStyle = `rgba(255,140,40,${(0.45 + 0.35 * Math.sin(now / 260)).toFixed(2)})`; ctx.lineWidth = Math.max(2, q * 2); ctx.beginPath(); ctx.arc(X, Y0, r * (1.45 + 0.12 * Math.sin(now / 260)), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(Math.round(X - r * 0.7), Math.round(Y0 + r * 0.9), Math.round(r * 1.4), q * 2);
  ctx.fillStyle = '#7a3a00'; ctx.beginPath(); ctx.arc(X, Y, r + q, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff8c1a'; ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffc46b'; ctx.beginPath(); ctx.arc(X - r * 0.35, Y - r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2f7d32'; ctx.beginPath(); ctx.ellipse(X + r * 0.45, Y - r * 1.05, r * 0.5, r * 0.26, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(Math.round(X - q), Math.round(Y - r - q * 2), q * 2, q * 3);
}



const MZ_PIECE = { n: 3, min: 5, reach: 18, pts: 5, done: 15, showMs: 3600 };
const mzPiece = { got: 0, cx: -1, cy: -1, sx: -1, sy: -1, last: null, next: 0, doneAt: 0 };
function mzPieceReset() { Object.assign(mzPiece, { got: 0, cx: -1, cy: -1, sx: -1, sy: -1, last: null, next: 0, doneAt: 0 }); }
function mzPiecePick() {
  const sx = mzPiece.sx, sy = mzPiece.sy, rx = Math.floor(rp.x / MZ_K), ry = Math.floor(rp.y / MZ_K);
  if (sx < 0) return null;
  const seen = new Map([[sx + ',' + sy, 0]]), q = [[sx, sy]], cand = [], ls = mzPiece.last;
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h], d = seen.get(x + ',' + y);
    if (d >= MZ_PIECE.min && Math.abs(x - sx) + Math.abs(y - sy) >= MZ_PIECE.min - 1 && Math.abs(x - rx) + Math.abs(y - ry) >= 3 && !(ls && ls[0] === x && ls[1] === y) && !(x === mzFruit.cx && y === mzFruit.cy) && mzFruitOk(x, y)) cand.push([x, y]);
    if (d >= MZ_PIECE.reach) continue;
    for (const [dx, dy] of MZ_DIRS) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || mzType(nx, ny) !== 1 || !mzOpen(x, y, dx, dy)) continue;
      seen.set(k, d + 1); q.push([nx, ny]);
    }
  }
  return cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
}
function mzPieceTick(now) {
  if (rp.x === null) return;
  const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K);
  if (mzPiece.sx < 0) { mzPiece.sx = a; mzPiece.sy = b; }
  if (mzPiece.cx < 0) {
    if (mzPiece.got >= MZ_PIECE.n || now < mzPiece.next) return;
    mzPiece.next = now + 500;
    if (cubeFirstGoal()) return;
    const c = mzPiecePick();
    if (c) { mzPiece.cx = c[0]; mzPiece.cy = c[1]; dirty = true; }
    return;
  }
  if (a !== mzPiece.cx || b !== mzPiece.cy) return;
  const fin = mzPiece.got + 1 >= MZ_PIECE.n, r = G.mzPiece && G.mzPiece(fin);
  if (!r) return;
  mzPiece.got++; mzPiece.last = [a, b]; mzPiece.cx = mzPiece.cy = -1; mzPiece.next = now;
  grainSound(); roll.happyT = 1.2; dirty = true;
  if (fin) mzPiece.doneAt = now;
  floatText(fin ? `🗺️ 地図完成！ +${r.pts}pt` : `🗺️ 地図ピース ゲット！ +${r.pts}pt（あと ${MZ_PIECE.n - mzPiece.got}まい）`);
  const cols = ['#ffffff', '#7fc4e8', '#9ccc4f'];
  for (let i = 0; i < (fin ? 24 : 12); i++) { const t = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 3, c: cols[i % 3], life: 0.6 + Math.random() * 0.4 }); }
}
function mzPieceJoin(kind) {
  if (kind !== 0 && kind !== 1 && kind !== 2) return null;
  return { horizon: 3, sun: [{ dx: 8, dy: 2, r: 1.6 }, { dx: 0, dy: 2, r: 1.6 }, null][kind], pathIn: [null, 6, 6][kind], pathOut: [6, 6, null][kind] };
}
function drawMzPieceArt(x, y, s, kind, on, joined) {
  const q = Math.max(1, Math.round(s / 8)), W = Math.round(s);
  if (!on) { ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x, y, W, q); ctx.fillRect(x, y + W - q, W, q); ctx.fillRect(x, y, q, W); ctx.fillRect(x + W - q, y, q, W); return; }
  const J = mzPieceJoin(kind), u = v => Math.round(v * s / 8), hz = y + u(J.horizon);
  ctx.fillStyle = '#4a3a22';
  if (joined) { ctx.fillRect(x, y - q, W, q); ctx.fillRect(x, y + W, W, q); if (kind === 0) ctx.fillRect(x - q, y - q, q, W + q * 2); if (kind === 2) ctx.fillRect(x + W, y - q, q, W + q * 2); }
  else ctx.fillRect(x - q, y - q, W + q * 2, W + q * 2);
  ctx.fillStyle = '#bfe6fa'; ctx.fillRect(x, y, W, hz - y);
  if (J.sun) {
    const cx = x + u(J.sun.dx), cy = y + u(J.sun.dy), R = J.sun.r * s / 8;
    ctx.fillStyle = '#ffd84a';
    for (let r = -Math.ceil(R); r < Math.ceil(R); r++) {
      const m = r + 0.5; if (Math.abs(m) >= R) continue;
      const hw = Math.sqrt(R * R - m * m), x0 = Math.max(x, Math.round(cx - hw)), x1 = Math.min(x + W, Math.round(cx + hw)), y0 = Math.round(cy + r), y1 = Math.min(hz, Math.round(cy + r + 1));
      if (x1 > x0 && y1 > Math.max(y, y0)) ctx.fillRect(x0, Math.max(y, y0), x1 - x0, y1 - Math.max(y, y0));
    }
  }
  ctx.fillStyle = ['#a8dcf0', '#9ccc4f', '#e8d8a8'][kind]; ctx.fillRect(x, hz, W, y + W - hz);
  ctx.fillStyle = '#6f9a5a'; ctx.fillRect(x, hz, W, Math.max(1, q >> 1));
  if (kind === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + u(1), y + u(4), u(2), q); ctx.fillRect(x + u(4), y + u(5), u(2), q); ctx.fillRect(x + u(2), y + u(7), u(2), q); }
  else if (kind === 1) { ctx.fillStyle = '#5a9a2a'; for (const r of [4, 5, 7]) ctx.fillRect(x, y + u(r) + q - Math.max(1, q >> 1), W, Math.max(1, q >> 1)); }
  else { ctx.fillStyle = '#c0583a'; ctx.fillRect(x + u(1), y + u(4), u(2), u(1)); ctx.fillRect(x + u(5), y + u(4), u(2), u(1)); ctx.fillStyle = '#5a3a1a'; ctx.fillRect(x + u(1), y + u(5), u(2), q); ctx.fillRect(x + u(5), y + u(5), u(2), q); }
  const pi = J.pathIn, po = J.pathOut;
  const xa = pi === null ? u(2) : 0, xb = po === null ? u(6) : W, ra = pi === null ? po : pi, rb = po === null ? pi : po, n = Math.max(1, Math.abs(rb - ra) + 1), seg = (xb - xa) / n;
  ctx.fillStyle = '#4aa8e0';
  for (let i = 0; i < n; i++) { const row = ra + (rb >= ra ? i : -i), x0 = x + xa + Math.round(seg * i), x1 = x + xa + Math.round(seg * (i + 1)); ctx.fillRect(x0, y + u(row), x1 - x0, Math.max(1, u(row + 1) - u(row))); }
}
function drawMzPiece(ox, oy, T, now) {
  if (mzPiece.cx < 0) return;
  const r = Math.max(5, T * 0.5), q = Math.max(1, Math.round(T / 8)), on = mzOn((mzPiece.cx + 0.5) * MZ_K, (mzPiece.cy + 0.5) * MZ_K), X = Math.round(ox + on[0] * T), Y0 = Math.round(oy + on[1] * T), Y = Math.round(Y0 + Math.sin(now / 340) * T * 0.08), h = Math.round(r * 0.9);
  ctx.strokeStyle = `rgba(110,190,235,${(0.45 + 0.3 * Math.sin(now / 280)).toFixed(2)})`; ctx.lineWidth = Math.max(2, q * 2); ctx.beginPath(); ctx.arc(X, Y0, r * (1.45 + 0.1 * Math.sin(now / 280)), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(X - h, Y0 + h + q, h * 2, q * 2);
  ctx.fillStyle = '#4a3a22'; ctx.fillRect(X - h - q, Y - h - q, h * 2 + q * 2, h * 2 + q * 2); ctx.fillRect(X + h, Y - q * 2, q * 3, q * 4);
  ctx.fillStyle = '#fffaf0'; ctx.fillRect(X - h, Y - h, h * 2, h * 2); ctx.fillRect(X + h, Y - q, q * 2, q * 2);
  if (mzPiece.got >= 0 && mzPiece.got < MZ_PIECE.n && Number.isInteger(mzPiece.got)) { drawMzPieceArt(X - h, Y - h, h * 2, mzPiece.got, true, false); return; }
  ctx.fillStyle = '#d9cdb0'; ctx.fillRect(X - q, Y - h, q, h * 2); ctx.fillRect(X - h, Y - q, h * 2, q);
  ctx.fillStyle = '#c0583a'; ctx.fillRect(X + q, Y + q, q * 2, q * 2);
}




function mzShelfHidden() { return cubeFirstGoal() && mzPiece.cx < 0 && !mzPiece.got && !mzPiece.doneAt; }
function drawMzShelf(w, dpr, now) {
  if (mzPiece.sx < 0 || mapCovered(true) || mzBanner.t0 || mzShelfHidden()) return;
  const S = Math.round(MZ_CLOCK_PX * dpr), s = Math.round(S * 0.9), gap = Math.round(s * 0.35), rows = 1 + (mzScare.until > now ? 1 : 0) + (mzSpring.until > now ? 1 : 0);
  const done = mzPiece.doneAt && now - mzPiece.doneAt < MZ_PIECE.showMs, k = done ? 1.8 : 1, ps = Math.round(s * k), tot = ps * 3 + (done ? 0 : gap * 2), x0 = Math.round(w / 2 - tot / 2), y0 = Math.round(S * 1.5 + S * 1.9 * (rows - 1) + S * 1.35);
  if (!done) { ctx.fillStyle = 'rgba(10,20,30,.55)'; ctx.fillRect(x0 - gap, y0 - gap, tot + gap * 2, ps + gap * 2); }
  else { ctx.globalAlpha = Math.min(1, (MZ_PIECE.showMs - (now - mzPiece.doneAt)) / 500); ctx.fillStyle = 'rgba(10,20,30,.55)'; ctx.fillRect(x0 - gap, y0 - gap, tot + gap * 2, ps + gap * 2); }
  for (let i = 0; i < 3; i++) drawMzPieceArt(x0 + i * (ps + (done ? 0 : gap)), y0, ps, i, i < mzPiece.got, !!done);
  ctx.globalAlpha = 1;
}





const MZ_VIEW = { min: 8, reach: 18, pts: 15, panoMs: 6000 };
const mzView = { done: false, cx: -1, cy: -1, sx: -1, sy: -1, next: 0, panoAt: 0 };
function mzViewReset() { Object.assign(mzView, { done: false, cx: -1, cy: -1, sx: -1, sy: -1, next: 0, panoAt: 0 }); }
function mzViewClear() { return mzView.done; }
function mzViewPick() {
  const sx = mzView.sx, sy = mzView.sy, rx = Math.floor(rp.x / MZ_K), ry = Math.floor(rp.y / MZ_K);
  if (sx < 0) return null;
  const seen = new Map([[sx + ',' + sy, 0]]), q = [[sx, sy]], cand = [];
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h], d = seen.get(x + ',' + y);
    if (d >= MZ_VIEW.min && Math.abs(x - sx) + Math.abs(y - sy) >= MZ_VIEW.min - 1 && Math.abs(x - rx) + Math.abs(y - ry) >= 3 && !(x === mzFruit.cx && y === mzFruit.cy) && !(x === mzPiece.cx && y === mzPiece.cy) && mzFruitOk(x, y)) cand.push([x, y]);
    if (d >= MZ_VIEW.reach) continue;
    for (const [dx, dy] of MZ_DIRS) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || mzType(nx, ny) !== 1 || !mzOpen(x, y, dx, dy)) continue;
      seen.set(k, d + 1); q.push([nx, ny]);
    }
  }
  return cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
}
function mzViewTick(now) {
  if (rp.x === null) return;
  const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K);
  if (mzView.sx < 0) { mzView.sx = a; mzView.sy = b; }
  if (mzView.cx < 0) {
    if (mzView.done || now < mzView.next) return;
    mzView.next = now + 500;
    if (cubeFirstGoal()) return;
    const c = mzViewPick();
    if (c) { mzView.cx = c[0]; mzView.cy = c[1]; dirty = true; }
    return;
  }
  if (a !== mzView.cx || b !== mzView.cy) return;
  const r = G.mzView && G.mzView();
  if (!r) return;
  mzView.done = true; mzView.cx = mzView.cy = -1; mzView.panoAt = now;
  grainSound(); roll.happyT = 1.2; dirty = true;
  floatText(`🔭 見晴らし台に ついた！ +${r.pts}pt（もやが 晴れるよ）`);
  const cols = ['#7fc4e8', '#9ccc4f', '#e8d8a8'];
  for (let i = 0; i < 18; i++) { const t = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 3, c: cols[i % 3], life: 0.6 + Math.random() * 0.4 }); }
}
function drawMzView(ox, oy, T, now) {
  if (mzView.cx < 0) return;
  const r = Math.max(5, T * 0.5), q = Math.max(1, Math.round(T / 8)), on = mzOn((mzView.cx + 0.5) * MZ_K, (mzView.cy + 0.5) * MZ_K), X = Math.round(ox + on[0] * T), Y0 = Math.round(oy + on[1] * T), Y = Math.round(Y0 + Math.sin(now / 300) * T * 0.08), h = Math.round(r * 0.9);
  ctx.strokeStyle = `rgba(80,170,235,${(0.45 + 0.3 * Math.sin(now / 270)).toFixed(2)})`; ctx.lineWidth = Math.max(2, q * 2); ctx.beginPath(); ctx.arc(X, Y0, r * (1.45 + 0.1 * Math.sin(now / 270)), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(X - h, Y0 + h + q, h * 2, q * 2);
  ctx.fillStyle = '#6b4423'; ctx.fillRect(X - h, Y - q, h * 2, q * 3);
  ctx.fillStyle = '#8a5a2a'; ctx.fillRect(X - h, Y - h, h * 2, q * 2);
  ctx.fillStyle = '#234a6e'; ctx.fillRect(X - q, Y - h - q * 3, q * 2, q * 3);
  ctx.fillStyle = '#7fc4e8'; ctx.fillRect(X + q, Y - h - q * 2, q * 2, q);
}
function mzCubeShelfH(dpr) { const S = Math.round(MZ_CLOCK_PX * dpr), s = Math.round(S * 0.9); return s + Math.round(s * 0.35) * 2; }
function mzViewShelfY(w, dpr, now) {
  const S = Math.round(MZ_CLOCK_PX * dpr), gap = Math.round(Math.round(S * 0.9) * 0.35), rows = 1 + (mzScare.until > now ? 1 : 0) + (mzSpring.until > now ? 1 : 0);
  const done = mzPiece.doneAt && now - mzPiece.doneAt < MZ_PIECE.showMs, shelfH = mzShelfHidden() ? -gap * 2 : Math.round(S * 0.9 * (done ? 1.8 : 1));
  return Math.round(S * 1.5 + S * 1.9 * (rows - 1) + S * 1.35) + shelfH + gap * 2 + (mzCube.sx >= 0 && !cubeFirstGoal() ? mzCubeShelfH(dpr) : 0);
}
function drawMzViewPanorama(w, dpr, now) {
  if (!mzView.panoAt || now - mzView.panoAt >= MZ_VIEW.panoMs || mzView.sx < 0 || mapCovered(true) || mzBanner.t0) return;
  const S = Math.round(MZ_CLOCK_PX * dpr), gap = Math.round(S * 0.35), y0 = mzViewShelfY(w, dpr, now), ph = Math.round(S * 1.6), tot = ph * 3 + gap * 2, x0 = Math.round(w / 2 - tot / 2);
  ctx.globalAlpha = Math.min(1, (MZ_VIEW.panoMs - (now - mzView.panoAt)) / 500);
  ctx.fillStyle = 'rgba(10,20,30,.55)'; ctx.fillRect(x0 - gap, y0 - gap, tot + gap * 2, ph + gap * 2);
  for (let i = 0; i < 3; i++) drawMzPieceArt(x0 + i * (ph + gap), y0, ph, i, true);
  const kx = x0 + tot - Math.round(ph * 0.25), ky = y0 + Math.round(ph * 0.7), kr = Math.max(3, Math.round(ph * 0.22));
  ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(kx, ky, kr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(kx - kr * 0.3, ky - kr * 0.2, Math.max(1, kr * 0.12), 0, Math.PI * 2); ctx.arc(kx + kr * 0.3, ky - kr * 0.2, Math.max(1, kr * 0.12), 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}


const MZ_CACHE = { min: 8, reach: 18, pts: 20, show: 3 };
const mzCache = { done: false, cx: -1, cy: -1, sx: -1, sy: -1, next: 0, dist: -1, prev: -1, warm: 0 };
let mzCacheCell = '';
function mzCacheReset() { Object.assign(mzCache, { done: false, cx: -1, cy: -1, sx: -1, sy: -1, next: 0, dist: -1, prev: -1, warm: 0 }); mzCacheCell = ''; }
function mzCachePick() {
  const sx = mzCache.sx, sy = mzCache.sy, rx = Math.floor(rp.x / MZ_K), ry = Math.floor(rp.y / MZ_K);
  if (sx < 0) return null;
  const seen = new Map([[sx + ',' + sy, 0]]), q = [[sx, sy]], cand = [];
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h], d = seen.get(x + ',' + y);
    if (d >= MZ_CACHE.min && Math.abs(x - sx) + Math.abs(y - sy) >= MZ_CACHE.min - 1 && Math.abs(x - rx) + Math.abs(y - ry) >= 3 && !(x === mzFruit.cx && y === mzFruit.cy) && !(x === mzPiece.cx && y === mzPiece.cy) && !(x === mzView.cx && y === mzView.cy) && mzFruitOk(x, y)) cand.push([x, y]);
    if (d >= MZ_CACHE.reach) continue;
    for (const [dx, dy] of MZ_DIRS) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || mzType(nx, ny) !== 1 || !mzOpen(x, y, dx, dy)) continue;
      seen.set(k, d + 1); q.push([nx, ny]);
    }
  }
  return cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
}
function mzCacheDist(a, b) {
  if (mzCache.cx < 0) return -1;
  const seen = new Map([[a + ',' + b, 0]]), q = [[a, b]];
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h], d = seen.get(x + ',' + y);
    if (x === mzCache.cx && y === mzCache.cy) return d;
    if (d >= 200) continue;
    for (const [dx, dy] of MZ_DIRS) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || mzType(nx, ny) !== 1 || !mzOpen(x, y, dx, dy)) continue;
      seen.set(k, d + 1); q.push([nx, ny]);
    }
  }
  return -1;
}
function mzCacheTick(now) {
  if (rp.x === null) return;
  const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K);
  if (mzCache.sx < 0) { mzCache.sx = a; mzCache.sy = b; }
  if (mzCache.cx < 0) {
    if (mzCache.done || now < mzCache.next) return;
    mzCache.next = now + 500;
    if (cubeFirstGoal()) return;
    const c = mzCachePick();
    if (c) { mzCache.cx = c[0]; mzCache.cy = c[1]; mzCacheCell = ''; dirty = true; }
    else return;
  }
  if (a === mzCache.cx && b === mzCache.cy) {
    const r = G.mzCache && G.mzCache();
    if (!r) return;
    mzCache.done = true; mzCache.cx = mzCache.cy = -1; mzCache.dist = -1; mzCacheCell = '';
    grainSound(); roll.happyT = 1.2; dirty = true;
    floatText(`📦 かくし宝箱 はっけん！ +${r.pts}pt`);
    const cols = ['#b48cf0', '#e6d4ff', '#ffe27a'];
    for (let i = 0; i < 16; i++) { const t = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 3, c: cols[i % 3], life: 0.6 + Math.random() * 0.4 }); }
    return;
  }
  const key = a + ',' + b;
  if (key === mzCacheCell) return;
  mzCacheCell = key;
  const d = mzCacheDist(a, b);
  mzCache.warm = mzCache.prev < 0 || d < 0 ? 0 : d < mzCache.prev ? 1 : d > mzCache.prev ? -1 : 0;
  mzCache.prev = mzCache.dist = d; dirty = true;
}
function drawMzCache(ox, oy, T, now) {
  if (mzCache.cx < 0 || mzCache.dist < 0 || mzCache.dist > MZ_CACHE.show) return;
  const r = Math.max(5, T * 0.5), q = Math.max(1, Math.round(T / 8)), on = mzOn((mzCache.cx + 0.5) * MZ_K, (mzCache.cy + 0.5) * MZ_K), X = Math.round(ox + on[0] * T), Y = Math.round(oy + on[1] * T), p = Math.sin(now / 320);
  ctx.strokeStyle = `rgba(170,120,235,${(0.4 + 0.3 * p).toFixed(2)})`; ctx.lineWidth = Math.max(2, q * 2); ctx.beginPath(); ctx.arc(X, Y, r * (1.3 + 0.15 * p), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = `rgba(190,150,245,${(0.18 + 0.1 * p).toFixed(2)})`; ctx.fillRect(X - q * 2, Y - q * 2, q * 4, q * 4);
}
function drawMzCacheHint(w, dpr, now) {
  if (mzCache.cx < 0 || mzCache.sx < 0 || mapCovered(true) || mzBanner.t0) return;
  const S = Math.round(MZ_CLOCK_PX * dpr), gap = Math.round(S * 0.35);
  let y0 = mzViewShelfY(w, dpr, now);
  if (mzView.panoAt && now - mzView.panoAt < MZ_VIEW.panoMs) y0 += Math.round(S * 1.6) + gap * 2;
  const word = mzCache.warm > 0 ? 'あつい！ ちかづいてるよ' : mzCache.warm < 0 ? 'つめたい… はなれちゃった' : 'おなじくらいだよ';
  const t = mzCache.dist < 0 ? '🔍 かくし宝箱 まだ みつからないよ' : `🔍 かくし宝箱 あと${mzCache.dist}歩くらい　${word}`;
  ctx.font = `${Math.round(13 * dpr)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let bw = Math.round(ctx.measureText(t).width) + gap * 4;
  if (bw > w - gap * 2) {
    const fs = Math.max(8, Math.floor(13 * dpr * (w - gap * 2) / bw));
    ctx.font = `${fs}px sans-serif`; bw = Math.round(ctx.measureText(t).width) + gap * 4;
  }
  const bh = Math.round(S * 1.4);
  ctx.fillStyle = 'rgba(10,20,30,.6)'; ctx.fillRect(Math.round(w / 2 - bw / 2), y0, bw, bh);
  ctx.fillStyle = mzCache.warm > 0 ? '#ffd9a0' : mzCache.warm < 0 ? '#cfeaff' : '#e6d4ff'; ctx.fillText(t, w / 2, y0 + bh / 2);
}


const MZ_QUEST = { min: 8, reach: 18, pts: 5, done: 15 };
const QUEST_TOOLS = [{ name: 'くわ', emoji: '⛏️', color: '#8b5a2b' }, { name: 'かま', emoji: '🌾', color: '#2f7d32' }, { name: 'みの', emoji: '👒', color: '#d4a017' }];
const QUEST_RING = ['139,90,43', '47,125,50', '150,100,45'];
const mzQuest = { got: 0, cx: -1, cy: -1, sx: -1, sy: -1, last: null, next: 0, doneAt: 0 };
function mzQuestReset() { Object.assign(mzQuest, { got: 0, cx: -1, cy: -1, sx: -1, sy: -1, last: null, next: 0, doneAt: 0 }); }
function mzQuestPick() {
  const sx = mzQuest.sx, sy = mzQuest.sy, rx = Math.floor(rp.x / MZ_K), ry = Math.floor(rp.y / MZ_K), ls = mzQuest.last;
  if (sx < 0) return null;
  const seen = new Map([[sx + ',' + sy, 0]]), q = [[sx, sy]], cand = [];
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h], d = seen.get(x + ',' + y);
    if (d >= MZ_QUEST.min && Math.abs(x - sx) + Math.abs(y - sy) >= MZ_QUEST.min - 1 && Math.abs(x - rx) + Math.abs(y - ry) >= 3 && !(ls && ls[0] === x && ls[1] === y) && !(x === mzFruit.cx && y === mzFruit.cy) && !(x === mzPiece.cx && y === mzPiece.cy) && !(x === mzView.cx && y === mzView.cy) && !(x === mzCache.cx && y === mzCache.cy) && mzFruitOk(x, y)) cand.push([x, y]);
    if (d >= MZ_QUEST.reach) continue;
    for (const [dx, dy] of MZ_DIRS) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || mzType(nx, ny) !== 1 || !mzOpen(x, y, dx, dy)) continue;
      seen.set(k, d + 1); q.push([nx, ny]);
    }
  }
  return cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
}
function mzQuestTick(now) {
  if (rp.x === null) return;
  const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K);
  if (mzQuest.sx < 0) { mzQuest.sx = a; mzQuest.sy = b; }
  if (mzQuest.cx < 0) {
    if (mzQuest.got >= QUEST_TOOLS.length || now < mzQuest.next) return;
    mzQuest.next = now + 500;
    if (cubeFirstGoal()) return;
    const c = mzQuestPick();
    if (c) { mzQuest.cx = c[0]; mzQuest.cy = c[1]; dirty = true; }
    return;
  }
  if (a !== mzQuest.cx || b !== mzQuest.cy) return;
  const fin = mzQuest.got === QUEST_TOOLS.length - 1, tool = QUEST_TOOLS[mzQuest.got], r = G.mzQuest && G.mzQuest(fin);
  if (!r) return;
  mzQuest.got++; mzQuest.last = [a, b]; mzQuest.cx = mzQuest.cy = -1; mzQuest.next = now;
  grainSound(); roll.happyT = 1.2; dirty = true;
  if (fin) mzQuest.doneAt = now;
  floatText(fin ? `🎉 どうぐ そろった！ +${r.pts}pt` : `${tool.emoji} ${tool.name} ゲット！ +${r.pts}pt`);
  const cols = [tool.color, '#ffffff', '#ffe27a'];
  for (let i = 0; i < (fin ? 24 : 12); i++) { const t = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 3, c: cols[i % 3], life: 0.6 + Math.random() * 0.4 }); }
}
function drawMzQuest(ox, oy, T, now) {
  if (mzQuest.cx < 0 || mzQuest.got >= QUEST_TOOLS.length) return;
  const tool = QUEST_TOOLS[mzQuest.got], r = Math.max(5, T * 0.5), q = Math.max(1, Math.round(T / 8)), on = mzOn((mzQuest.cx + 0.5) * MZ_K, (mzQuest.cy + 0.5) * MZ_K), X = Math.round(ox + on[0] * T), Y0 = Math.round(oy + on[1] * T), Y = Math.round(Y0 + Math.sin(now / 360) * T * 0.06), p = Math.sin(now / 300);
  ctx.strokeStyle = `rgba(${QUEST_RING[mzQuest.got]},${(0.55 + 0.3 * p).toFixed(2)})`; ctx.lineWidth = Math.max(2, q * 2); ctx.beginPath(); ctx.arc(X, Y0, r * (1.2 + 0.12 * p), 0, Math.PI * 2); ctx.stroke();
  ctx.font = `${Math.max(12, Math.round(T * 0.95))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = tool.color; ctx.fillText(tool.emoji, X, Y);
}
function drawMzQuestCarry(ox, oy, T, now) {
  if (!mzQuest.got || rp.x === null) return;
  const on = mzOn(rp.x, rp.y), u = Math.max(5, T * 0.5), r = Math.max(3, T * 0.3), q = Math.max(1, Math.round(T / 10)), done = mzQuest.got >= QUEST_TOOLS.length;
  const slots = [[-1.8, -1.1], [0, -1.7], [1.8, -1.1]];
  ctx.font = `${Math.max(10, Math.round(T * 0.55))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const bob = calmMotion ? 0 : Math.sin(now / 320) * q;
  for (let i = 0; i < Math.min(mzQuest.got, QUEST_TOOLS.length, slots.length); i++) {
    const X = Math.round(ox + on[0] * T + slots[i][0] * u), Y = Math.round(oy + on[1] * T + slots[i][1] * u + bob);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = done ? '#d4a017' : QUEST_TOOLS[i].color; ctx.lineWidth = Math.max(1.5, T * 0.07); ctx.stroke();
    ctx.fillStyle = QUEST_TOOLS[i].color; ctx.fillText(QUEST_TOOLS[i].emoji, X, Y);
  }
}
function drawMzQuestTag(w, dpr, now) {
  if (mzQuest.sx < 0 || mapCovered(true) || mzBanner.t0) return;
  const fin = mzQuest.doneAt && now - mzQuest.doneAt < 6000;
  if (mzQuest.got >= QUEST_TOOLS.length && !fin) return;
  const S = Math.round(MZ_CLOCK_PX * dpr), gap = Math.round(S * 0.35);
  let y0 = mzViewShelfY(w, dpr, now);
  if (mzView.panoAt && now - mzView.panoAt < MZ_VIEW.panoMs) y0 += Math.round(S * 1.6) + gap * 2;
  if (mzCache.cx >= 0 && mzCache.sx >= 0) y0 += Math.round(S * 1.4) + gap;
  const t = fin ? '🎉 どうぐ そろった！ かおりちゃんの どうぐセット 完成！' : '🧰 どうぐクエスト ' + QUEST_TOOLS.map((o, i) => `${o.name} ${i < mzQuest.got ? '✓' : i === mzQuest.got ? '◎' : '◯'}`).join(' ');
  ctx.font = `${Math.round(13 * dpr)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let bw = Math.round(ctx.measureText(t).width) + gap * 4;
  if (bw > w - gap * 2) {
    const fs = Math.max(8, Math.floor(13 * dpr * (w - gap * 2) / bw));
    ctx.font = `${fs}px sans-serif`; bw = Math.round(ctx.measureText(t).width) + gap * 4;
  }
  const bh = Math.round(S * 1.4);
  ctx.fillStyle = fin ? 'rgba(90,60,0,.75)' : 'rgba(10,20,30,.6)'; ctx.fillRect(Math.round(w / 2 - bw / 2), y0, bw, bh);
  ctx.fillStyle = fin ? '#ffe27a' : '#f0e0c8'; ctx.fillText(t, w / 2, y0 + bh / 2);
}


const MZ_DINO = { min: 10, reach: 18, pts: 20 };
const mzDino = { cx: -1, cy: -1, sx: -1, sy: -1, trail: [], ang: [], found: false, foundAt: 0, next: 0 };
function mzDinoReset() { Object.assign(mzDino, { cx: -1, cy: -1, sx: -1, sy: -1, trail: [], ang: [], found: false, foundAt: 0, next: 0 }); }
function mzDinoPick() {
  const sx = mzDino.sx, sy = mzDino.sy;
  if (sx < 0) return null;
  const seen = new Map([[sx + ',' + sy, 0]]), q = [[sx, sy]], cand = [];
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h], d = seen.get(x + ',' + y);
    if (d >= MZ_DINO.min && !(x === mzFruit.cx && y === mzFruit.cy) && !(x === mzPiece.cx && y === mzPiece.cy) && !(x === mzView.cx && y === mzView.cy) && !(x === mzCache.cx && y === mzCache.cy) && !(x === mzQuest.cx && y === mzQuest.cy) && mzFruitOk(x, y)) cand.push([x, y]);
    if (d >= MZ_DINO.reach) continue;
    for (const [dx, dy] of MZ_DIRS) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || mzType(nx, ny) !== 1 || !mzOpen(x, y, dx, dy)) continue;
      seen.set(k, d + 1); q.push([nx, ny]);
    }
  }
  return cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
}
function mzDinoPath(sx, sy, cx, cy) {
  const prev = new Map([[sx + ',' + sy, null]]), q = [[sx, sy]];
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h];
    if (x === cx && y === cy) {
      const out = [];
      for (let c = [x, y]; c; c = prev.get(c[0] + ',' + c[1])) out.push(c);
      return out.reverse();
    }
    if (prev.size > 4000) break;
    for (const [dx, dy] of MZ_DIRS) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (prev.has(k) || mzType(nx, ny) !== 1 || !mzOpen(x, y, dx, dy)) continue;
      prev.set(k, [x, y]); q.push([nx, ny]);
    }
  }
  return [];
}
function mzDinoAngle(prev, cur, next) {
  const f = cur || prev;
  if (!f || !next) return 0;
  const dx = next[0] - f[0], dy = next[1] - f[1];
  return dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
}
function mzDinoTick(now) {
  if (rp.x === null) return;
  const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K);
  if (mzDino.sx < 0) { mzDino.sx = a; mzDino.sy = b; }
  if (mzDino.found) return;
  if (mzDino.cx < 0) {
    if (now < (mzDino.next || 0)) return;
    mzDino.next = now + 500;
    if (cubeFirstGoal()) return;
    const c = mzDinoPick();
    if (!c) return;
    const path = mzDinoPath(mzDino.sx, mzDino.sy, c[0], c[1]);
    if (!path.length) return;
    mzDino.cx = c[0]; mzDino.cy = c[1];
    mzDino.trail = []; mzDino.ang = [];
    path.forEach((c, i) => { if (i > 0 && i < path.length - 1 && i % 2 === 0) { mzDino.trail.push(c); mzDino.ang.push(mzDinoAngle(null, c, path[i + 1])); } });
    dirty = true;
    return;
  }
  if (a !== mzDino.cx || b !== mzDino.cy) return;
  const r = G.mzDino && G.mzDino();
  if (!r) return;
  mzDino.found = true; mzDino.foundAt = now; mzDino.trail = []; mzDino.ang = []; mzDino.cx = mzDino.cy = -1;
  grainSound(); roll.happyT = 1.2; dirty = true;
  floatText(`🦕 きょうりゅうと であった！ +${r.pts}pt`);
  const cols = ['#3fb56b', '#ffffff', '#ffe27a'];
  for (let i = 0; i < 16; i++) { const t = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 3, c: cols[i % 3], life: 0.6 + Math.random() * 0.4 }); }
}
function drawMzDino(ox, oy, T, now) {
  if (mzDino.found || mzDino.cx < 0) return;
  const q = Math.max(1, Math.round(T / 8));
  mzDino.trail.forEach((c, i) => {
    const on = mzOn((c[0] + 0.5) * MZ_K, (c[1] + 0.5) * MZ_K), side = i % 2 ? 1 : -1, X = Math.round(ox + on[0] * T), Y = Math.round(oy + on[1] * T);
    const qs = q * (0.85 + 0.35 * (i / Math.max(1, mzDino.trail.length - 1)));
    ctx.save(); ctx.translate(X, Y); ctx.rotate((mzDino.ang[i] || 0) + Math.PI / 2);
    ctx.fillStyle = 'rgba(120,78,40,.85)';
    const sx = side * T * 0.12;
    ctx.beginPath(); ctx.ellipse(sx, qs, qs * 2, qs * 1.5, 0, 0, Math.PI * 2); ctx.fill();
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.arc(sx + k * qs * 1.6, -qs, Math.max(1, qs * 0.7), 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  });
  const r = Math.max(5, T * 0.5), on = mzOn((mzDino.cx + 0.5) * MZ_K, (mzDino.cy + 0.5) * MZ_K), X = Math.round(ox + on[0] * T), Y0 = Math.round(oy + on[1] * T), Y = Math.round(Y0 + Math.sin(now / 420) * T * 0.05), p = Math.sin(now / 320);
  ctx.strokeStyle = `rgba(63,181,107,${(0.55 + 0.3 * p).toFixed(2)})`; ctx.lineWidth = Math.max(2, q * 2); ctx.beginPath(); ctx.arc(X, Y0, r * (1.25 + 0.12 * p), 0, Math.PI * 2); ctx.stroke();
  ctx.font = `${Math.max(12, Math.round(T * 1.1))}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#3fb56b'; ctx.fillText('🦕', X, Y);
}
function mzDinoSonar(now) {
  if (typeof now !== 'number' || !isFinite(now) || now < 0) return [{ r: 0, a: 0 }, { r: 0, a: 0 }];
  return [0, 1].map(i => { const p = ((now / 2600) + i * 0.5) % 1; return { r: 1.3 + 3.2 * p, a: 0.62 * (1 - p) }; });
}
function drawMzDinoSonar(ox, oy, T, now) {
  if (mzDino.found || mzDino.cx < 0) return;
  const on = mzOn((mzDino.cx + 0.5) * MZ_K, (mzDino.cy + 0.5) * MZ_K), X = Math.round(ox + on[0] * T), Y = Math.round(oy + on[1] * T), base = Math.max(5, T * 0.5);
  ctx.save(); ctx.lineWidth = Math.max(2, T * 0.07);
  mzDinoSonar(calmMotion ? 650 : now).forEach(w => {
    if (w.a <= 0) return;
    ctx.strokeStyle = `rgba(63,181,107,${w.a.toFixed(2)})`; ctx.beginPath(); ctx.arc(X, Y, base * w.r, 0, Math.PI * 2); ctx.stroke();
  });
  ctx.restore();
}
function drawMzDinoTag(w, dpr, now) {
  if (mzDino.sx < 0 || mapCovered(true) || mzBanner.t0) return;
  const fin = mzDino.found && now - mzDino.foundAt < 6000;
  if (!fin && (mzDino.found || mzDino.cx < 0)) return;
  const S = Math.round(MZ_CLOCK_PX * dpr), gap = Math.round(S * 0.35);
  let y0 = mzViewShelfY(w, dpr, now);
  if (mzView.panoAt && now - mzView.panoAt < MZ_VIEW.panoMs) y0 += Math.round(S * 1.6) + gap * 2;
  if (mzCache.cx >= 0 && mzCache.sx >= 0) y0 += Math.round(S * 1.4) + gap;
  if (mzQuest.sx >= 0 && (mzQuest.got < QUEST_TOOLS.length || (mzQuest.doneAt && now - mzQuest.doneAt < 6000))) y0 += Math.round(S * 1.4) + gap;
  const t = fin ? '🦕 きょうりゅうと であった！ かおりちゃんも びっくり！' : '🦕 きょうりゅうの あしあとを たどろう！' + (mzDino.trail.length ? ` あしあと ${mzDino.trail.length}こ` : '');
  ctx.font = `${Math.round(13 * dpr)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let bw = Math.round(ctx.measureText(t).width) + gap * 4;
  if (bw > w - gap * 2) {
    const fs = Math.max(8, Math.floor(13 * dpr * (w - gap * 2) / bw));
    ctx.font = `${fs}px sans-serif`; bw = Math.round(ctx.measureText(t).width) + gap * 4;
  }
  const bh = Math.round(S * 1.4);
  ctx.fillStyle = fin ? 'rgba(90,60,0,.75)' : 'rgba(10,20,30,.6)'; ctx.fillRect(Math.round(w / 2 - bw / 2), y0, bw, bh);
  ctx.fillStyle = fin ? '#ffe27a' : '#e0f5e4'; ctx.fillText(t, w / 2, y0 + bh / 2);
}


const MZ_CHASE = { stepMs: 6000, pts: 0, rainMs: 4000 };
const mzChase = { sx: -1, sy: -1, cx: -1, cy: -1, fx: -1, fy: -1, moveAt: 0, next: 0, last: 0, caught: false, caughtAt: 0, rainAt: 0, paid: false, dist: -1, dkey: '' };
let mzChaseWon = 0;
function mzChaseReset() { Object.assign(mzChase, { sx: -1, sy: -1, cx: -1, cy: -1, fx: -1, fy: -1, moveAt: 0, next: 0, last: 0, caught: false, caughtAt: 0, rainAt: 0, paid: false, dist: -1, dkey: '' }); }
function mzChaseLive() { return false; }
function mzChaseWay(sx, sy, tx, ty) {
  const prev = new Map([[sx + ',' + sy, null]]), q = [[sx, sy]];
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h];
    if (x === tx && y === ty) {
      const out = [];
      for (let c = [x, y]; c; c = prev.get(c[0] + ',' + c[1])) out.push(c);
      return out.reverse();
    }
    if (prev.size > 4000) break;
    for (const [dx, dy] of MZ_DIRS) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (prev.has(k) || mzType(nx, ny) !== 1 || !mzOpen(x, y, dx, dy)) continue;
      prev.set(k, [x, y]); q.push([nx, ny]);
    }
  }
  return [];
}
const chaseFirstGoal = () => { try { return !(Number(lsGet('nsg_mzgoals', '0')) >= 3); } catch (e) { return false; } };
function mzChaseTick(now) {
  if (rp.x === null || chaseFirstGoal()) return;
  const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K);
  if (mzChase.sx < 0) { mzChase.sx = a; mzChase.sy = b; mzChase.last = now; }
  mzChase.last = now;
  if (mzChase.cx < 0) {
    if (a === mzChase.sx && b === mzChase.sy) return;
    mzChase.cx = mzChase.fx = mzChase.sx; mzChase.cy = mzChase.fy = mzChase.sy; mzChase.moveAt = now; mzChase.next = now + MZ_CHASE.stepMs; dirty = true;
    return;
  }
  if (now < mzChase.next) return;
  mzChase.next = now + MZ_CHASE.stepMs;
  const opts = MZ_DIRS.map(([dx, dy]) => [mzChase.cx + dx, mzChase.cy + dy, dx, dy]).filter(([nx, ny, dx, dy]) => mzType(nx, ny) === 1 && mzOpen(mzChase.cx, mzChase.cy, dx, dy) && Math.abs(nx - mzChase.sx) + Math.abs(ny - mzChase.sy) <= 2);
  if (!opts.length) return;
  const o = opts[Math.floor(Math.random() * opts.length)];
  mzChase.fx = mzChase.cx; mzChase.fy = mzChase.cy; mzChase.cx = o[0]; mzChase.cy = o[1]; mzChase.moveAt = now; dirty = true;
}
function mzChaseGoal(id) { return null; }
function drawMzChase(ox, oy, T, now) {
  if (mzChase.cx < 0) return;
  const q = Math.max(1, Math.round(T / 8)), k = Math.min(1, (now - mzChase.moveAt) / 600), e = k * k * (3 - 2 * k);
  const fx = mzChase.fx < 0 ? mzChase.cx : mzChase.fx, fy = mzChase.fy < 0 ? mzChase.cy : mzChase.fy;
  const on = mzOn((fx + (mzChase.cx - fx) * e + 0.5) * MZ_K, (fy + (mzChase.cy - fy) * e + 0.5) * MZ_K), X = Math.round(ox + on[0] * T), Y = Math.round(oy + on[1] * T + Math.sin(now / 500) * T * 0.04 - T * 0.15), r = Math.max(5, T * 0.5);
  const dark = '#7d8794';
  ctx.fillStyle = 'rgba(40,46,56,.28)'; ctx.beginPath(); ctx.ellipse(X, Y + r * 1.15, r * 1.1, r * 0.25, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = dark;
  for (const [dx, dy, rr] of [[-0.7, 0.1, 0.5], [0.7, 0.1, 0.5], [-0.3, -0.35, 0.6], [0.35, -0.3, 0.55], [0, 0.2, 0.6]]) { ctx.beginPath(); ctx.arc(X + dx * r, Y + dy * r, rr * r, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(205,212,222,.55)'; ctx.beginPath(); ctx.arc(X - 0.3 * r, Y - 0.5 * r, 0.3 * r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#aab4c2';
  const n = 3;
  for (let i = 0; i < n; i++) {
    const ph = ((now / 600) + i / n) % 1, dx = (i / (n - 1 || 1) - 0.5) * r * 1.6;
    ctx.beginPath(); ctx.ellipse(X + dx, Y + r * 0.7 + ph * r * 1.1, Math.max(1, q * 0.7), Math.max(2, q * 1.6), 0, 0, Math.PI * 2); ctx.fill();
  }
}


const MZ_ENERGY = { need: 36, pts: 20 };
const mzEnergy = { steps: 0, bursts: 0, burstT0: 0, lastCx: -1, lastCy: -1 };
function mzEnergyReset() { Object.assign(mzEnergy, { steps: 0, bursts: 0, burstT0: 0, lastCx: -1, lastCy: -1 }); }
function mzEnergyRebase() { mzEnergy.lastCx = -1; mzEnergy.lastCy = -1; }
function mzEnergyTick(now) {
  if (rp.x === null) return;
  const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K);
  if (mzEnergy.lastCx < 0) { mzEnergy.lastCx = a; mzEnergy.lastCy = b; return; }
  if (a === mzEnergy.lastCx && b === mzEnergy.lastCy) return;
  mzEnergy.lastCx = a; mzEnergy.lastCy = b; mzEnergy.steps++; dirty = true;
  if (mzEnergy.steps < MZ_ENERGY.need) return;
  const r = G.mzEnergy && G.mzEnergy();
  if (!r) return;
  mzEnergy.bursts++; mzEnergy.steps = 0;
  if (cubeFirstGoal()) return;
  mzEnergy.burstT0 = now;
  floatText(`⚡ さんぽエネルギー 満タン！ +${r.pts}pt`);
  grainSound(); roll.happyT = 1.2;
  const cols = ['#ffe27a', '#9ccc4f', '#ffffff'];
  for (let i = 0; i < 24; i++) { const t = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3.5; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 3, c: cols[i % 3], life: 0.6 + Math.random() * 0.4 }); }
}
function drawMzTorchLight(ox, oy, T, now) {
  if (rec || rp.x === null || rp.x === undefined || !mzTorchLit(now) || mzViewClear(now)) return;
  const f = MZ_FOG[Math.min(4, Math.max(1, Math.round(mzScale)))], sight = f.sight ? f.sight + (typeof mzTorchBonus === 'function' ? mzTorchBonus() : 0) : 0;
  if (!sight) return;
  const on = mzOn(rp.x, rp.y), X = ox + on[0] * T, Y = oy + on[1] * T, R = sight * MZ_K * T, flick = Math.sin(now / 90) + Math.sin(now / 53);
  const a = Math.max(0, 0.2 + 0.02 * flick);
  const g = ctx.createRadialGradient(X, Y, 0, X, Y, R);
  g.addColorStop(0, `rgba(255,170,60,${a})`); g.addColorStop(0.7, `rgba(255,170,60,${a * 0.55})`); g.addColorStop(1, 'rgba(255,170,60,0)');
  ctx.fillStyle = g; ctx.fillRect(X - R, Y - R, R * 2, R * 2);
}
function drawMzSightRing(ox, oy, T, now) {
  if (rec || rp.x === null || mzViewClear(now)) return;
  const f = MZ_FOG[Math.min(4, Math.max(1, Math.round(mzScale)))], sight = f.sight ? f.sight + (typeof mzTorchBonus === 'function' ? mzTorchBonus() : 0) : 0;
  if (!sight) return;
  const on = mzOn(rp.x, rp.y), X = ox + on[0] * T, Y = oy + on[1] * T, R = sight * MZ_K * T, S = MZ_K * T, lit = mzTorchLit(now), wave = lit ? (Math.sin(now / 90) + Math.sin(now / 53) + 2) / 4 : (Math.sin(now / 700) + 1) / 2, rgb = lit ? '255,170,60' : '255,246,200';
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(${rgb},${0.14 + wave * 0.08})`; ctx.lineWidth = S * 0.35;
  ctx.beginPath(); ctx.arc(X, Y, R, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = `rgba(${rgb},${0.55 + wave * 0.15})`; ctx.lineWidth = Math.max(2, Math.min(3, T * 0.12));
  ctx.beginPath(); ctx.arc(X, Y, R - S * 0.1, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
const MZ_PULSE = { baseMs: 2400, fastMs: 1000, near: 3, mid: 8, far: 18 };
function mzPulseSignal() {
  if (mzCache.cx < 0 || mzCache.done || mzCache.dist < 0) return 0;
  const d = mzCache.dist;
  return d <= MZ_PULSE.near ? 1 : d <= MZ_PULSE.mid ? 0.66 : d <= MZ_PULSE.far ? 0.33 : 0;
}







const TAP_RING_MS = 350, TAP_RING_R0 = 26, TAP_RING_R1 = 46, TAP_RING_RCALM = 32, TAP_RING_LINE = 2.75, TAP_RING_MOVE = 5;
const tapRing = { x: 0, y: 0, t0: 0, id: null, rz: false, still: false };
function tapRingStart(e) {
  if (!active || !G.demo || worldMode || !howtoEl.hidden || mapCovered(false, true)) { tapRing.t0 = 0; return; }
  if (!tapRing.rz) { tapRing.rz = true; window.addEventListener('resize', () => { tapRing.t0 = 0; }); }
  tapRing.x = e.clientX; tapRing.y = e.clientY; tapRing.id = e.pointerId; tapRing.t0 = performance.now(); dirty = true;
  tapRing.still = !tapS.goal && rp.x !== null && Math.hypot(rp.vx, rp.vy) < 0.2;
}
function drawTapRing(now) {
  if (!tapRing.t0 || rec) return;
  const a = Math.max(0, (now - tapRing.t0) / TAP_RING_MS);
  if (a >= 1 || worldMode) { tapRing.t0 = 0; return; }
  const r = cv.getBoundingClientRect(), dpr = cv.width / (r.width || 1), X = (tapRing.x - r.left) * dpr, Y = (tapRing.y - r.top) * dpr;
  const grow = 1 - (1 - a) * (1 - a), rad = (calmMotion ? TAP_RING_RCALM : TAP_RING_R0 + (TAP_RING_R1 - TAP_RING_R0) * grow) * dpr;
  const alpha = calmMotion ? 0.85 * Math.min(1, (1 - a) * 3) : 0.85 * (1 - a);
  ctx.save();
  ctx.lineWidth = Math.max(2, Math.round(dpr * TAP_RING_LINE));
  ctx.strokeStyle = `rgba(255,246,200,${alpha})`;
  ctx.beginPath(); ctx.arc(X, Y, rad, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
function drawMzPulse(ox, oy, T, now) {
  if (rec || rp.x === null || rp.x === undefined) return;
  const on = mzOn(rp.x, rp.y), X = ox + on[0] * T, Y = oy + on[1] * T, S = MZ_K * T;
  const sig = mzPulseSignal();
  const period = Math.round(MZ_PULSE.baseMs - (MZ_PULSE.baseMs - MZ_PULSE.fastMs) * sig), count = sig >= 1 ? 3 : 2;
  const r = Math.round(255 + (190 - 255) * sig), g = Math.round(246 + (150 - 246) * sig), b = Math.round(200 + (245 - 200) * sig);
  ctx.save();
  ctx.lineWidth = Math.max(2, Math.min(3, T * 0.12));
  for (let i = 0; i < count; i++) {
    const phase = ((now % period) / period + i / count) % 1;
    ctx.strokeStyle = `rgba(${r},${g},${b},${(0.55 + 0.25 * sig) * (1 - phase)})`;
    ctx.beginPath(); ctx.arc(X, Y, S * (0.3 + (2.9 + 0.9 * sig) * phase), 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
function mzCacheGlow(warm, dist) {
  const none = { a: 0, r: 0, rgb: '' };
  if (warm !== 1 && warm !== -1) return none;
  if (typeof dist !== 'number' || !isFinite(dist) || dist < 0) return none;
  return { a: dist <= 3 ? 0.85 : dist <= 8 ? 0.65 : 0.45, r: dist <= 3 ? 0.75 : dist <= 8 ? 0.95 : 1.15, rgb: warm === 1 ? '255,154,60' : '90,176,255' };
}
function drawMzCacheGlow(ox, oy, T, now) {
  if (rec || rp.x === null || rp.x === undefined) return;
  const g = mzCacheGlow(mzCache.warm, mzCache.dist);
  if (g.a === 0) return;
  const on = mzOn(rp.x, rp.y), X = ox + on[0] * T, Y = oy + on[1] * T, S = MZ_K * T;
  const pulse = calmMotion ? 1 : 0.85 + 0.15 * Math.sin(now / 240);
  ctx.save();
  ctx.fillStyle = `rgba(${g.rgb},${g.a * 0.25})`;
  ctx.beginPath(); ctx.arc(X, Y, S * g.r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = `rgba(${g.rgb},${g.a * pulse})`;
  ctx.lineWidth = Math.max(3, T * 0.18);
  ctx.beginPath(); ctx.arc(X, Y, S * g.r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = `rgba(${g.rgb},${g.a * 0.5 * pulse})`;
  ctx.lineWidth = Math.max(2, T * 0.08);
  ctx.beginPath(); ctx.arc(X, Y, S * g.r * 1.25, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
function mzGlideWind(vx, vy, now) {
  const none = { n: 0, len: 0, alpha: 0, ang: 0, phase: 0 };
  if (typeof vx !== 'number' || typeof vy !== 'number' || typeof now !== 'number' || !isFinite(vx) || !isFinite(vy) || !isFinite(now)) return none;
  const sp = Math.hypot(vx, vy);
  if (sp < 0.8) return none;
  return { n: sp < 1.6 ? 3 : sp < 2.6 ? 4 : 5, len: Math.min(2.2, 0.7 + 0.55 * sp), alpha: Math.min(0.85, 0.35 + 0.18 * sp), ang: Math.atan2(vy, vx), phase: ((now / 90) % 1 + 1) % 1 };
}
function drawMzGlide(ox, oy, T, now) {
  if (rec || rp.x === null || rp.x === undefined) return;
  const w = mzGlideWind(rp.vx, rp.vy, now);
  if (w.n === 0) return;
  const on = mzOn(rp.x, rp.y), X = ox + on[0] * T, Y = oy + on[1] * T, S = MZ_K * T;
  const bx = Math.cos(w.ang + Math.PI), by = Math.sin(w.ang + Math.PI), px = -Math.sin(w.ang), py = Math.cos(w.ang);
  const flow = calmMotion ? 0 : w.phase;
  ctx.save();
  ctx.lineWidth = Math.max(2, T * 0.14);
  ctx.lineCap = 'round';
  for (let i = 0; i < w.n; i++) {
    const side = i - (w.n - 1) / 2, off = side * S * 0.22;
    const st = S * (0.25 + 0.1 * Math.abs(side)) + flow * S * 0.3, ln = w.len * S;
    const x0 = X + px * off + bx * st, y0 = Y + py * off + by * st;
    const x1 = x0 + bx * ln, y1 = y0 + by * ln;
    const bend = (side >= 0 ? 1 : -1) * S * 0.12;
    ctx.strokeStyle = `rgba(255,255,255,${w.alpha * (1 - 0.18 * Math.abs(side))})`;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 + px * bend, (y0 + y1) / 2 + py * bend, x1, y1); ctx.stroke();
  }
  ctx.restore();
}
function mzStormRing(dist) {
  const none = { r: 0, a: 0, period: 0 };
  if (typeof dist !== 'number' || !isFinite(dist) || dist < 0 || dist > 10) return none;
  if (dist <= 2) return { r: 0.80, a: 0.85, period: 700 };
  if (dist <= 5) return { r: 1.05, a: 0.65, period: 1100 };
  return { r: 1.35, a: 0.45, period: 1600 };
}
function drawMzStormRing(ox, oy, T, now) {
  if (rec || rp.x === null || rp.x === undefined) return;
  if (!mzChaseLive() || mzChase.cx < 0) return;
  const w = mzStormRing(mzChase.dist);
  if (w.a === 0) return;
  const on = mzOn(rp.x, rp.y), X = ox + on[0] * T, Y = oy + on[1] * T, S = MZ_K * T;
  const pulse = calmMotion ? 1 : 0.85 + 0.15 * Math.sin(now / (w.period / 4));
  ctx.save();
  ctx.fillStyle = `rgba(70,80,95,${w.a * 0.22})`;
  ctx.beginPath(); ctx.arc(X, Y, S * w.r * 1.15, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = `rgba(90,102,118,${w.a * pulse})`;
  ctx.lineWidth = Math.max(3, T * 0.16);
  ctx.beginPath(); ctx.arc(X, Y, S * w.r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = `rgba(90,102,118,${w.a * 0.5 * pulse})`;
  ctx.lineWidth = Math.max(2, T * 0.08);
  ctx.beginPath(); ctx.arc(X, Y, S * w.r * 1.30, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
function drawMzEnergyRing(ox, oy, T, now) {
  if (cubeFirstGoal()) return;
  if (!mzEnergy.burstT0 || rp.x === null) return;
  const k = (now - mzEnergy.burstT0) / 1200;
  if (k < 0 || k >= 1) return;
  const on = mzOn(rp.x, rp.y), X = Math.round(ox + on[0] * T), Y = Math.round(oy + on[1] * T);
  ctx.save();
  for (let i = 0; i < 2; i++) {
    const kk = Math.min(1, k + i * 0.18) , r = T * (0.6 + 2.6 * kk);
    ctx.globalAlpha = (1 - kk) * 0.9; ctx.strokeStyle = i ? '#fff3b0' : '#ffd84a'; ctx.lineWidth = Math.max(2, T * 0.2 * (1 - kk));
    ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
function mzEnergyCharge() {
  return Math.max(0, Math.min(1, mzEnergy.steps / MZ_ENERGY.need)) || 0;
}
function drawMzEnergyAura(ox, oy, T, now) {
  if (cubeFirstGoal()) return;
  if (rec || rp.x === null || rp.x === undefined) return;
  const ratio = mzEnergyCharge();
  if (ratio <= 0) return;
  const on = mzOn(rp.x, rp.y), X = Math.round(ox + on[0] * T), Y = Math.round(oy + on[1] * T), S = MZ_K * T, R = S * (0.5 + 0.9 * ratio);
  ctx.save();
  ctx.globalAlpha = 0.08 + 0.22 * ratio; ctx.fillStyle = '#ffd84a';
  ctx.beginPath(); ctx.arc(X, Y, R, 0, Math.PI * 2); ctx.fill();
  const n = Math.round(ratio * 8), cols = ['#ffe27a', '#9ccc4f', '#ffffff'];
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < n; i++) {
    const a = now / 600 + i * Math.PI * 2 / n;
    ctx.fillStyle = cols[i % 3];
    ctx.beginPath(); ctx.arc(X + Math.cos(a) * R, Y + Math.sin(a) * R, Math.max(1.5, T * 0.09), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function mzEnergyStars(ratio) {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0.25) return { n: 0, a: 0 };
  const r = Math.min(1, ratio);
  if (r < 0.5) return { n: 4, a: 0.35 };
  if (r < 0.75) return { n: 8, a: 0.6 };
  return { n: 12, a: 0.9 };
}
function drawMzEnergyStars(ox, oy, T, now) {
  if (cubeFirstGoal()) return;
  if (rec) return;
  const w = mzEnergyStars(mzEnergyCharge());
  if (w.n === 0 || !mzTrail.size) return;
  const cells = [...mzTrail.values()].slice(-w.n).reverse(), S = MZ_K * T, R = S * 0.30;
  ctx.save();
  for (let i = 0; i < cells.length; i++) {
    const pn = mzOn((cells[i][0] + 0.5) * MZ_K, (cells[i][1] + 0.5) * MZ_K);
    if (!pn) continue;
    const X = ox + pn[0] * T, Y = oy + pn[1] * T;
    const tw = calmMotion ? 0.8 : Math.max(0.3, Math.min(1, 0.55 + 0.45 * Math.sin(now / 300 + i * 1.7)));
    ctx.fillStyle = 'rgba(255, 210, 90, ' + (w.a * tw) + ')';
    ctx.beginPath();
    ctx.moveTo(X, Y - R); ctx.lineTo(X + R * 0.28, Y - R * 0.28); ctx.lineTo(X + R, Y); ctx.lineTo(X + R * 0.28, Y + R * 0.28);
    ctx.lineTo(X, Y + R); ctx.lineTo(X - R * 0.28, Y + R * 0.28); ctx.lineTo(X - R, Y); ctx.lineTo(X - R * 0.28, Y - R * 0.28);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function drawMzEnergyBar(w, dpr, now) {
  if (cubeFirstGoal()) return;
  if (mzEnergy.lastCx < 0 || mapCovered(true) || mzBanner.t0) return;
  const S = Math.round(MZ_CLOCK_PX * dpr), gap = Math.round(S * 0.35);
  let y0 = mzViewShelfY(w, dpr, now);
  if (mzView.panoAt && now - mzView.panoAt < MZ_VIEW.panoMs) y0 += Math.round(S * 1.6) + gap * 2;
  const bw = Math.min(w - gap * 2, Math.round(S * 4)), bh = Math.round(S * 1.5), x0 = Math.round(w - gap - bw);
  ctx.fillStyle = 'rgba(30,40,30,.65)'; ctx.fillRect(x0, y0, bw, bh);
  const bx = x0 + gap, by = y0 + Math.round(bh * 0.35), bbw = bw - gap * 2, bbh = Math.round(bh * 0.3);
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(bx, by, bbw, bbh);
  const fill = Math.round(bbw * Math.min(1, mzEnergy.steps / MZ_ENERGY.need));
  if (fill > 0) {
    ctx.fillStyle = '#9fcf4a'; ctx.fillRect(bx, by, fill, bbh);
  }
}




const MZ_TORCH = { sight: 3, pts: 10, min: 6, reach: 18 };
const mzTorch = { cx: -1, cy: -1, sx: -1, sy: -1, last: null, next: 0, held: false, got: 0 };
function mzTorchReset() { Object.assign(mzTorch, { cx: -1, cy: -1, sx: -1, sy: -1, last: null, next: 0, held: false, got: 0 }); }
function mzTorchLit() { return mzTorch.held ? 1 : 0; }
function mzTorchBonus() { return mzTorch.held ? MZ_TORCH.sight : 0; }
function mzTorchPick() {
  const sx = mzTorch.sx, sy = mzTorch.sy, rx = Math.floor(rp.x / MZ_K), ry = Math.floor(rp.y / MZ_K);
  if (sx < 0) return null;
  const seen = new Map([[sx + ',' + sy, 0]]), q = [[sx, sy]], cand = [], ls = mzTorch.last;
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h], d = seen.get(x + ',' + y);
    if (d >= MZ_TORCH.min && Math.abs(x - sx) + Math.abs(y - sy) >= MZ_TORCH.min - 1 && Math.abs(x - rx) + Math.abs(y - ry) >= 3 && !(ls && ls[0] === x && ls[1] === y) && !(x === mzFruit.cx && y === mzFruit.cy) && !(x === mzPiece.cx && y === mzPiece.cy) && !(x === mzView.cx && y === mzView.cy) && !(x === mzCache.cx && y === mzCache.cy) && !(x === mzQuest.cx && y === mzQuest.cy) && !(x === mzDino.cx && y === mzDino.cy) && mzFruitOk(x, y)) cand.push([x, y]);
    if (d >= MZ_TORCH.reach) continue;
    for (const [dx, dy] of MZ_DIRS) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || mzType(nx, ny) !== 1 || !mzOpen(x, y, dx, dy)) continue;
      seen.set(k, d + 1); q.push([nx, ny]);
    }
  }
  return cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
}
function mzTorchTick(now) {
  if (rp.x === null) return;
  const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K);
  if (mzTorch.sx < 0) { mzTorch.sx = a; mzTorch.sy = b; }
  if (mzTorch.cx < 0) {
    if (mzTorch.held || now < mzTorch.next) return;
    mzTorch.next = now + 500;
    if (cubeFirstGoal()) return;
    const c = mzTorchPick();
    if (c) { mzTorch.cx = c[0]; mzTorch.cy = c[1]; dirty = true; }
    return;
  }
  if (a !== mzTorch.cx || b !== mzTorch.cy) return;
  const r = G.mzTorch && G.mzTorch();
  if (!r) return;
  mzTorch.got++; mzTorch.last = [a, b]; mzTorch.cx = mzTorch.cy = -1; mzTorch.next = now; mzTorch.held = true;
  grainSound(); roll.happyT = 1.2; dirty = true;
  floatText(`🔥 たいまつ ゲット！ +${r.pts}pt（ひろく 見えるよ）`);
  const cols = ['#ff8c1a', '#ffd84a', '#fff3b0'];
  for (let i = 0; i < 14; i++) { const t = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 3, c: cols[i % 3], life: 0.6 + Math.random() * 0.4 }); }
}
function mzTorchState() {
  const now = performance.now();
  return { at: mzTorch.cx < 0 ? null : [mzTorch.cx, mzTorch.cy], start: mzTorch.sx < 0 ? null : [mzTorch.sx, mzTorch.sy], held: mzTorch.held, got: mzTorch.got, bonus: mzTorchBonus() };
}
function mzTorchFlameScale() { return mzTorch.held ? 1 : 0; }
function mzFlamePath(X, Y, h, w, sway) {
  ctx.beginPath(); ctx.moveTo(X - w, Y); ctx.quadraticCurveTo(X - w * 1.1, Y - h * 0.55, X + sway, Y - h); ctx.quadraticCurveTo(X + w * 1.1, Y - h * 0.55, X + w, Y); ctx.closePath();
}
function drawMzTorch(ox, oy, T, now) {
  if (mzTorch.cx < 0) return;
  const r = Math.max(5, T * 0.5), q = Math.max(1, Math.round(T / 8)), on = mzOn((mzTorch.cx + 0.5) * MZ_K, (mzTorch.cy + 0.5) * MZ_K), X = ox + on[0] * T, Y = oy + on[1] * T, flick = Math.sin(now / 90) + Math.sin(now / 53);
  const g = ctx.createRadialGradient(X, Y - r * 0.4, 0, X, Y - r * 0.4, r * (2 + 0.2 * Math.sin(now / 260)));
  g.addColorStop(0, 'rgba(255,170,60,.5)'); g.addColorStop(1, 'rgba(255,170,60,0)');
  ctx.fillStyle = g; ctx.fillRect(X - r * 2.3, Y - r * 2.7, r * 4.6, r * 4.6);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(Math.round(X - r * 0.5), Math.round(Y + r * 0.85), Math.round(r), q * 2);
  ctx.fillStyle = '#4a2a0c'; ctx.fillRect(Math.round(X - q * 1.5 - q), Math.round(Y - r * 0.2 - q), q * 5, Math.round(r * 1.1) + q * 2);
  ctx.fillStyle = '#8a5a2b'; ctx.fillRect(Math.round(X - q * 1.5), Math.round(Y - r * 0.2), q * 3, Math.round(r * 1.1));
  ctx.fillStyle = '#3a3a3a'; ctx.fillRect(Math.round(X - q * 2.5), Math.round(Y - r * 0.3), q * 5, q * 2);
  ctx.fillStyle = '#e8590c'; mzFlamePath(X, Y - r * 0.2, r * (1.25 + 0.08 * flick), r * 0.5, flick * q * 0.4); ctx.fill();
  ctx.fillStyle = '#ffb02e'; mzFlamePath(X, Y - r * 0.2, r * (0.9 + 0.06 * flick), r * 0.32, flick * q * 0.3); ctx.fill();
  ctx.fillStyle = '#fff3b0'; mzFlamePath(X, Y - r * 0.2, r * 0.5, r * 0.16, 0); ctx.fill();
}
function drawMzTorchFlame(ox, oy, T, now) {
  if (!mzTorch.held || rp.x === null) return;
  const on = mzOn(rp.x, rp.y), r = Math.max(5, T * 0.5), q = Math.max(1, Math.round(T / 8)), X = Math.round(ox + on[0] * T + r * 1.15), Y = Math.round(oy + on[1] * T + r * 0.35), flick = Math.sin(now / 80) + Math.sin(now / 47);
  ctx.fillStyle = '#8a5a2b'; ctx.fillRect(X - q, Y - q, q * 2, Math.round(r * 0.7));
  const hk = mzTorchFlameScale(), wk = hk;
  ctx.fillStyle = '#e8590c'; mzFlamePath(X, Y - q, r * (0.85 + 0.06 * flick) * hk, r * 0.34 * wk, flick * q * 0.3); ctx.fill();
  ctx.fillStyle = '#ffd84a'; mzFlamePath(X, Y - q, r * 0.5 * hk, r * 0.18 * wk, 0); ctx.fill();
}



const MZ_BRIGADE = { n: 3, pts: 5, bonus: 15, min: 6, reach: 18, tagMs: 6000 };
const mzBrigade = { cx: -1, cy: -1, sx: -1, sy: -1, last: null, next: 0, count: 0, doneAt: 0, hist: [] };
function mzBrigadeReset() { Object.assign(mzBrigade, { cx: -1, cy: -1, sx: -1, sy: -1, last: null, next: 0, count: 0, doneAt: 0, hist: [] }); }
function mzBrigadePick() {
  const sx = mzBrigade.sx, sy = mzBrigade.sy, rx = Math.floor(rp.x / MZ_K), ry = Math.floor(rp.y / MZ_K);
  if (sx < 0) return null;
  const seen = new Map([[sx + ',' + sy, 0]]), q = [[sx, sy]], cand = [], ls = mzBrigade.last;
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h], d = seen.get(x + ',' + y);
    if (d >= MZ_BRIGADE.min && Math.abs(x - sx) + Math.abs(y - sy) >= MZ_BRIGADE.min - 1 && Math.abs(x - rx) + Math.abs(y - ry) >= 3 && !(ls && ls[0] === x && ls[1] === y) && !(x === mzTorch.cx && y === mzTorch.cy) && !(x === mzFruit.cx && y === mzFruit.cy) && !(x === mzPiece.cx && y === mzPiece.cy) && !(x === mzView.cx && y === mzView.cy) && !(x === mzCache.cx && y === mzCache.cy) && !(x === mzQuest.cx && y === mzQuest.cy) && !(x === mzDino.cx && y === mzDino.cy) && mzFruitOk(x, y)) cand.push([x, y]);
    if (d >= MZ_BRIGADE.reach) continue;
    for (const [dx, dy] of MZ_DIRS) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || mzType(nx, ny) !== 1 || !mzOpen(x, y, dx, dy)) continue;
      seen.set(k, d + 1); q.push([nx, ny]);
    }
  }
  return cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
}
function mzBrigadeTick(now) {
  if (rp.x === null) return;
  const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K);
  if (mzBrigade.sx < 0) { mzBrigade.sx = a; mzBrigade.sy = b; }
  const h0 = mzBrigade.hist[0]; if (!h0 || h0[0] !== a || h0[1] !== b) { mzBrigade.hist.unshift([a, b]); if (mzBrigade.hist.length > 6) mzBrigade.hist.length = 6; }
  if (mzBrigade.doneAt && now - mzBrigade.doneAt < MZ_BRIGADE.tagMs + 500) dirty = true;
  if (mzBrigade.count >= MZ_BRIGADE.n) return;
  if (mzBrigade.cx < 0) {
    if (now < mzBrigade.next) return;
    mzBrigade.next = now + 500;
    if (cubeFirstGoal()) return;
    const c = mzBrigadePick();
    if (c) { mzBrigade.cx = c[0]; mzBrigade.cy = c[1]; dirty = true; }
    return;
  }
  if (a !== mzBrigade.cx || b !== mzBrigade.cy) return;
  const fin = mzBrigade.count + 1 >= MZ_BRIGADE.n, r = G.mzBrigade && G.mzBrigade(fin);
  if (!r) return;
  mzBrigade.count++; mzBrigade.last = [a, b]; mzBrigade.cx = mzBrigade.cy = -1; mzBrigade.next = now;
  if (fin) mzBrigade.doneAt = now;
  grainSound(); roll.happyT = 1.2; dirty = true;
  floatText(fin ? `🎉 おとも旅団 完成！ +${r.pts}pt` : `おともが ふえた！ +${r.pts}pt（あと ${MZ_BRIGADE.n - mzBrigade.count}こ）`);
  const cols = ['#ff9ec0', '#ffd6e4', '#ffffff'];
  for (let i = 0; i < (fin ? 24 : 12); i++) { const t = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 3, c: cols[i % 3], life: 0.6 + Math.random() * 0.4 }); }
}
function mzBrigadeState() {
  const now = performance.now();
  return { at: mzBrigade.cx < 0 ? null : [mzBrigade.cx, mzBrigade.cy], start: mzBrigade.sx < 0 ? null : [mzBrigade.sx, mzBrigade.sy], count: mzBrigade.count, done: mzBrigade.count >= MZ_BRIGADE.n, tag: !!mzBrigade.doneAt && now - mzBrigade.doneAt < MZ_BRIGADE.tagMs, trail: mzBrigade.hist.map(c => c.slice()) };
}
function mzMateRice(X, Y, r, q) {
  ctx.fillStyle = '#ff9ec0'; ctx.fillRect(X - r - q, Y - r * 0.7 - q, (r + q) * 2, Math.round(r * 1.4) + q * 2);
  ctx.fillRect(X - r * 0.6 - q, Y - r - q, Math.round(r * 1.2) + q * 2, Math.round(r * 2) + q * 2);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(X - r, Y - r * 0.7, r * 2, Math.round(r * 1.4));
  ctx.fillRect(X - r * 0.6, Y - r, Math.round(r * 1.2), Math.round(r * 2));
  ctx.fillStyle = '#5a3a2a'; ctx.fillRect(Math.round(X - r * 0.45), Math.round(Y - r * 0.2), q, q); ctx.fillRect(Math.round(X + r * 0.45 - q), Math.round(Y - r * 0.2), q, q);
  ctx.fillStyle = '#ff9ec0'; ctx.fillRect(Math.round(X - r * 0.7), Math.round(Y + r * 0.15), q, q); ctx.fillRect(Math.round(X + r * 0.7 - q), Math.round(Y + r * 0.15), q, q);
}
function drawMzBrigade(ox, oy, T, now) {
  if (mzBrigade.cx < 0) return;
  const r = Math.max(3, Math.round(T * 0.25)), q = Math.max(1, Math.round(T / 10)), on = mzOn((mzBrigade.cx + 0.5) * MZ_K, (mzBrigade.cy + 0.5) * MZ_K), X = Math.round(ox + on[0] * T), Y = Math.round(oy + on[1] * T + Math.sin(now / 300) * q);
  const R = Math.max(5, T * 0.5) * (1.9 + 0.2 * Math.sin(now / 260)), g = ctx.createRadialGradient(X, Y, 0, X, Y, R);
  g.addColorStop(0, 'rgba(255,158,192,.55)'); g.addColorStop(1, 'rgba(255,158,192,0)');
  ctx.fillStyle = g; ctx.fillRect(X - R, Y - R, R * 2, R * 2);
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(X - r, Math.round(Y + r * 1.1), r * 2, q);
  mzMateRice(X, Y, r, q);
}
function drawMzBrigadeMates(ox, oy, T, now) {
  if (!mzBrigade.count || rp.x === null) return;
  const on = mzOn(rp.x, rp.y), u = Math.max(5, T * 0.5), r = Math.max(3, Math.round(u * 0.42)), q = Math.max(1, Math.round(T / 10));
  const slots = [[-1.35, 0.55], [0, 1.45], [1.0, 1.3]];
  for (let i = 0; i < Math.min(mzBrigade.count, slots.length); i++) {
    const bob = calmMotion ? 0 : Math.sin(now / 320 + i * 2.1) * q, c = mzBrigade.hist[i + 1];
    if (c) {
      const m = mzOn((c[0] + 0.5) * MZ_K, (c[1] + 0.5) * MZ_K);
      mzMateRice(Math.round(ox + m[0] * T), Math.round(oy + m[1] * T + bob), r, q);
    } else mzMateRice(Math.round(ox + on[0] * T + slots[i][0] * u), Math.round(oy + on[1] * T + slots[i][1] * u + bob), r, q);
  }
}
function drawMzBrigadeTag(w, dpr, now) {
  const done = mzBrigade.doneAt && now - mzBrigade.doneAt < MZ_BRIGADE.tagMs;
  if (!done && (mzBrigade.count >= MZ_BRIGADE.n || (!mzBrigade.count && mzBrigade.cx < 0))) return;
  if (mapCovered(true) || mzBanner.t0) return;
  const S = Math.round(MZ_CLOCK_PX * dpr), gap = Math.round(S * 0.35);
  let y0 = mzViewShelfY(w, dpr, now);
  if (mzView.panoAt && now - mzView.panoAt < MZ_VIEW.panoMs) y0 += Math.round(S * 1.6) + gap * 2;
  if (mzCache.cx >= 0 && mzCache.sx >= 0) y0 += Math.round(S * 1.4) + gap;
  if (mzQuest.sx >= 0 && (mzQuest.got < QUEST_TOOLS.length || (mzQuest.doneAt && now - mzQuest.doneAt < 6000))) y0 += Math.round(S * 1.4) + gap;
  if (mzDino.sx >= 0 && (mzDino.found ? now - mzDino.foundAt < 6000 : mzDino.cx >= 0)) y0 += Math.round(S * 1.4) + gap;
  if (mzEnergy.lastCx >= 0) y0 += Math.round(S * 1.7) + gap;
  const t = done ? '🎉 おとも旅団 完成！ かおりちゃんと おとも米たち！' : `🎒 おとも旅団 ${mzBrigade.count}/${MZ_BRIGADE.n}　おとも米 ${Array.from({ length: MZ_BRIGADE.n }, (_, i) => (i < mzBrigade.count ? '✓' : '◯')).join('')}`;
  ctx.font = `${Math.round(13 * dpr)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let bw = Math.round(ctx.measureText(t).width) + gap * 4;
  if (bw > w - gap * 2) {
    const fs = Math.max(8, Math.floor(13 * dpr * (w - gap * 2) / bw));
    ctx.font = `${fs}px sans-serif`; bw = Math.round(ctx.measureText(t).width) + gap * 4;
  }
  const bh = Math.round(S * 1.4);
  ctx.fillStyle = done ? 'rgba(120,90,0,.8)' : 'rgba(110,40,70,.75)'; ctx.fillRect(Math.round(w / 2 - bw / 2), y0, bw, bh);
  ctx.fillStyle = done ? '#ffe680' : '#ffd6e4'; ctx.fillText(t, w / 2, y0 + bh / 2);
}



const MZ_PURIFY = { n: 8, pts: 5, bonus: 20, min: 6, reach: 40, tagMs: 6000 };
const mzPurify = { cells: [], done: [], sx: -1, sy: -1, count: 0, next: 0, doneAt: 0 };
function mzPurifyReset() { Object.assign(mzPurify, { cells: [], done: [], sx: -1, sy: -1, count: 0, next: 0, doneAt: 0 }); }
function mzPurifyPick() {
  const sx = mzPurify.sx, sy = mzPurify.sy, rx = Math.floor(rp.x / MZ_K), ry = Math.floor(rp.y / MZ_K);
  if (sx < 0) return [];
  const seen = new Map([[sx + ',' + sy, 0]]), q = [[sx, sy]], cand = [];
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h], d = seen.get(x + ',' + y);
    if (d >= MZ_PURIFY.min && Math.abs(x - rx) + Math.abs(y - ry) >= 2 && !(x === mzFruit.cx && y === mzFruit.cy) && mzFruitOk(x, y)) cand.push([x, y]);
    if (d >= MZ_PURIFY.reach) continue;
    for (const [dx, dy] of MZ_DIRS) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || mzType(nx, ny) !== 1 || !mzOpen(x, y, dx, dy)) continue;
      seen.set(k, d + 1); q.push([nx, ny]);
    }
  }
  const out = [];
  while (cand.length && out.length < MZ_PURIFY.n) out.push(cand.splice(Math.floor(Math.random() * cand.length), 1)[0]);
  return out;
}
function mzPurifyTick(now) {
  if (rp.x === null) return;
  const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K);
  if (mzPurify.sx < 0) { mzPurify.sx = a; mzPurify.sy = b; }
  if (mzPurify.doneAt && now - mzPurify.doneAt < MZ_PURIFY.tagMs + 500) dirty = true;
  if (!mzPurify.cells.length) {
    if (now < mzPurify.next) return;
    mzPurify.next = now + 500;
    if (cubeFirstGoal()) return;
    const c = mzPurifyPick();
    if (c.length) { mzPurify.cells = c; mzPurify.done = c.map(() => false); dirty = true; }
    return;
  }
  const i = mzPurify.cells.findIndex((c, j) => !mzPurify.done[j] && c[0] === a && c[1] === b);
  if (i < 0) return;
  const total = mzPurify.cells.length, fin = mzPurify.count + 1 >= total, r = G.mzPurify && G.mzPurify(fin);
  if (!r) return;
  mzPurify.done[i] = true; mzPurify.count++;
  if (fin) mzPurify.doneAt = now;
  grainSound(); roll.happyT = 1.2; dirty = true;
  floatText(fin ? `🎉 ぜんぶ浄化！ +${r.pts}pt` : `✨ 浄化した！ +${r.pts}pt（あと ${total - mzPurify.count}こ）`);
  const cols = ['#ffd24a', '#fff2a8', '#ffffff'];
  for (let k = 0; k < (fin ? 28 : 12); k++) { const t = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 3, c: cols[k % 3], life: 0.6 + Math.random() * 0.4 }); }
}
function mzPurifyState() {
  const now = performance.now(), n = mzPurify.cells.length;
  return { cells: mzPurify.cells.map((c, i) => [c[0], c[1], mzPurify.done[i]]), count: mzPurify.count, total: n, done: n > 0 && mzPurify.count >= n, start: mzPurify.sx < 0 ? null : [mzPurify.sx, mzPurify.sy], tag: !!mzPurify.doneAt && now - mzPurify.doneAt < MZ_PURIFY.tagMs };
}
function drawMzPurify(ox, oy, T, now) {
  if (!mzPurify.cells.length) return;
  const cw = ctx.canvas.width, ch = ctx.canvas.height, q = Math.max(1, Math.round(T / 10)), u = Math.max(4, Math.round(T * 0.4));
  for (let i = 0; i < mzPurify.cells.length; i++) {
    const on = mzOn((mzPurify.cells[i][0] + 0.5) * MZ_K, (mzPurify.cells[i][1] + 0.5) * MZ_K), X = Math.round(ox + on[0] * T), Y = Math.round(oy + on[1] * T);
    if (X < -T || Y < -T || X > cw + T || Y > ch + T) continue;
    if (!mzPurify.done[i]) {
      ctx.fillStyle = '#3a1a5c'; ctx.fillRect(X - u, Y - Math.round(u * 0.6), u * 2, Math.round(u * 1.2)); ctx.fillRect(X - Math.round(u * 0.6), Y - u, Math.round(u * 1.2), u * 2);
      ctx.fillStyle = '#6a3a9c'; ctx.fillRect(X - Math.round(u * 0.7), Y - Math.round(u * 0.4), Math.round(u * 1.4), Math.round(u * 0.8)); ctx.fillRect(X - Math.round(u * 0.4), Y - Math.round(u * 0.7), Math.round(u * 0.8), Math.round(u * 1.4));
      const sw = calmMotion ? 0 : Math.floor(now / 260 + i) % 4, sp = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      ctx.fillStyle = '#c9a0ff';
      for (let k = 0; k < 4; k++) { const d = sp[(k + sw) % 4], r = (k + 1) * 0.22 * u; ctx.fillRect(Math.round(X + d[0] * r - q / 2), Math.round(Y + d[1] * r - q / 2), q, q); }
    } else {
      ctx.fillStyle = '#ffd24a';
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) ctx.fillRect(Math.round(X + dx * u * 0.55 - u * 0.3), Math.round(Y + dy * u * 0.55 - u * 0.3), Math.round(u * 0.6), Math.round(u * 0.6));
      ctx.fillStyle = '#fff2a8'; ctx.fillRect(Math.round(X - u * 0.25), Math.round(Y - u * 0.25), Math.round(u * 0.5), Math.round(u * 0.5));
      if (calmMotion || Math.floor(now / 400 + i) % 3) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(X + u, Y - u, q, q); ctx.fillRect(X - u - q, Y + Math.round(u * 0.6), q, q);
      }
    }
  }
}
function drawMzPurifyPetals(ox, oy, T, now) {
  const total = mzPurify.cells.length, n = Math.min(mzPurify.count, total);
  if (mzPurify.count <= 0 || rp.x === null || !total) return;
  const on = mzOn(rp.x, rp.y), R = T * 0.8, s = Math.max(2, Math.round(T * 0.32)), s2 = Math.max(1, Math.round(T * 0.16));
  const bob = calmMotion ? 0 : Math.sin(now / 380) * Math.max(1, Math.round(T / 10)) * 0.5;
  const cx = ox + on[0] * T, cy = oy + on[1] * T + bob;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + i * (Math.PI * 2 / total), X = Math.round(cx + Math.cos(a) * R), Y = Math.round(cy + Math.sin(a) * R);
    ctx.fillStyle = '#ffd24a'; ctx.fillRect(X - Math.round(s / 2), Y - Math.round(s / 2), s, s);
    ctx.fillStyle = '#fff2a8'; ctx.fillRect(X - Math.round(s2 / 2), Y - Math.round(s2 / 2), s2, s2);
  }
  if (mzPurify.count >= total) {
    ctx.strokeStyle = 'rgba(255,210,74,0.45)'; ctx.lineWidth = Math.max(1.5, T * 0.07);
    ctx.beginPath(); ctx.arc(cx, cy, R + s, 0, Math.PI * 2); ctx.stroke();
  }
}
function drawMzPurifyTag(w, dpr, now) {
  const n = mzPurify.cells.length;
  if (!n || mapCovered(true) || mzBanner.t0) return;
  const done = mzPurify.count >= n;
  if (done && !(mzPurify.doneAt && now - mzPurify.doneAt < MZ_PURIFY.tagMs)) return;
  const S = Math.round(MZ_CLOCK_PX * dpr), gap = Math.round(S * 0.35);
  let y0 = mzViewShelfY(w, dpr, now);
  if (mzView.panoAt && now - mzView.panoAt < MZ_VIEW.panoMs) y0 += Math.round(S * 1.6) + gap * 2;
  if (mzCache.cx >= 0 && mzCache.sx >= 0) y0 += Math.round(S * 1.4) + gap;
  if (mzQuest.sx >= 0 && (mzQuest.got < QUEST_TOOLS.length || (mzQuest.doneAt && now - mzQuest.doneAt < 6000))) y0 += Math.round(S * 1.4) + gap;
  if (mzDino.sx >= 0 && (mzDino.found ? now - mzDino.foundAt < 6000 : mzDino.cx >= 0)) y0 += Math.round(S * 1.4) + gap;
  if (mzEnergy.lastCx >= 0) y0 += Math.round(S * 1.7) + gap;
  if ((mzBrigade.doneAt && now - mzBrigade.doneAt < MZ_BRIGADE.tagMs) || !(mzBrigade.count >= MZ_BRIGADE.n || (!mzBrigade.count && mzBrigade.cx < 0))) y0 += Math.round(S * 1.4) + gap;
  const t = done ? '🎉 ぜんぶ浄化！ 金の 花が さいた' : `💜 浄化 ${mzPurify.count}/${n}`;
  ctx.font = `${Math.round(13 * dpr)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let bw = Math.round(ctx.measureText(t).width) + gap * 4;
  if (bw > w - gap * 2) {
    const fs = Math.max(8, Math.floor(13 * dpr * (w - gap * 2) / bw));
    ctx.font = `${fs}px sans-serif`; bw = Math.round(ctx.measureText(t).width) + gap * 4;
  }
  const bh = Math.round(S * 1.4);
  ctx.fillStyle = done ? 'rgba(120,90,0,.8)' : 'rgba(60,30,100,.75)'; ctx.fillRect(Math.round(w / 2 - bw / 2), y0, bw, bh);
  ctx.fillStyle = done ? '#ffe680' : '#e6d0ff'; ctx.fillText(t, w / 2, y0 + bh / 2);
}



const MZ_RESCUE = { join: 5, pts: 30, min: 10, reach: 18, tagMs: 6000 };
const mzRescue = { cx: -1, cy: -1, sx: -1, sy: -1, spawned: false, joined: false, paid: false, next: 0, doneAt: 0, hist: [], dist: -1, dkey: '' };
function mzRescueReset() { Object.assign(mzRescue, { cx: -1, cy: -1, sx: -1, sy: -1, spawned: false, joined: false, paid: false, next: 0, doneAt: 0, hist: [], dist: -1, dkey: '' }); }
function mzRescueLive() { return mzRescue.joined && !mzRescue.paid; }
function mzRescuePick() {
  const sx = mzRescue.sx, sy = mzRescue.sy, rx = Math.floor(rp.x / MZ_K), ry = Math.floor(rp.y / MZ_K);
  if (sx < 0) return null;
  const seen = new Map([[sx + ',' + sy, 0]]), q = [[sx, sy]], cand = [];
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h], d = seen.get(x + ',' + y);
    if (d >= MZ_RESCUE.min && Math.abs(x - rx) + Math.abs(y - ry) >= 3 && !(x === mzFruit.cx && y === mzFruit.cy) && mzFruitOk(x, y)) cand.push([x, y]);
    if (d >= MZ_RESCUE.reach) continue;
    for (const [dx, dy] of MZ_DIRS) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || mzType(nx, ny) !== 1 || !mzOpen(x, y, dx, dy)) continue;
      seen.set(k, d + 1); q.push([nx, ny]);
    }
  }
  return cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
}
function mzRescueDist(a, b) {
  if (mzRescue.cx < 0) return -1;
  const seen = new Map([[a + ',' + b, 0]]), q = [[a, b]];
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h], d = seen.get(x + ',' + y);
    if (x === mzRescue.cx && y === mzRescue.cy) return d;
    if (d >= 200) continue;
    for (const [dx, dy] of MZ_DIRS) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || mzType(nx, ny) !== 1 || !mzOpen(x, y, dx, dy)) continue;
      seen.set(k, d + 1); q.push([nx, ny]);
    }
  }
  return -1;
}
const rescueFirstGoal = () => { try { return !(Number(lsGet('nsg_mzgoals', '0')) >= 3); } catch (e) { return false; } };
function mzRescueTick(now) {
  if (rp.x === null) return;
  const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K);
  if (mzRescue.sx < 0) { mzRescue.sx = a; mzRescue.sy = b; }
  const h0 = mzRescue.hist[0];
  if (!h0 || h0[0] !== a || h0[1] !== b) { mzRescue.hist.unshift([a, b]); if (mzRescue.hist.length > 4) mzRescue.hist.length = 4; }
  if (mzRescue.doneAt && now - mzRescue.doneAt < MZ_RESCUE.tagMs + 500) dirty = true;
  if (mzRescue.joined) return;
  if (!mzRescue.spawned) {
    if (now < mzRescue.next) return;
    mzRescue.next = now + 500;
    if (rescueFirstGoal()) return;
    const c = mzRescuePick();
    if (c) { mzRescue.cx = c[0]; mzRescue.cy = c[1]; mzRescue.spawned = true; mzRescue.dkey = ''; dirty = true; }
    return;
  }
  const k = a + ',' + b + '/' + mzRescue.cx + ',' + mzRescue.cy;
  if (k !== mzRescue.dkey) { mzRescue.dkey = k; mzRescue.dist = mzRescueDist(a, b); dirty = true; }
  if (a !== mzRescue.cx || b !== mzRescue.cy) return;
  const r = G.mzRescueJoin && G.mzRescueJoin();
  if (!r) return;
  mzRescue.joined = true; mzRescue.cx = mzRescue.cy = -1; mzRescue.dist = -1;
  grainSound(); roll.happyT = 1.2; dirty = true;
  floatText(`お米と 合流！ +${r.pts}pt　ゴールまで いっしょに 行こう`);
  const cols = ['#7cc4ff', '#ffffff', '#cfe8ff'];
  for (let i = 0; i < 14; i++) { const t = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 3, c: cols[i % 3], life: 0.6 + Math.random() * 0.4 }); }
}
function mzRescueGoal(id) {
  if (!mazeOn()) return null;
  const pv = mzRt.prev;
  let ok = false;
  if (mzRt.gid === id) ok = !mzRt.warp && mzRescueLive();
  else if (pv && pv.id === id) ok = !!pv.rescue;
  if (!ok) return null;
  const r = G.mzRescue && G.mzRescue();
  if (!r) return null;
  if (pv && pv.id === id) pv.rescue = false;
  if (mzRt.gid === id) mzRescue.paid = true;
  const now = performance.now();
  mzRescue.doneAt = now;
  grainSound(); roll.happyT = 1.2; dirty = true;
  floatText(`🎉 救助完了！ +${r.pts}pt`);
  const cols = ['#ffd24a', '#fff2a8', '#ffffff'];
  for (let i = 0; i < 24; i++) { const t = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 3, c: cols[i % 3], life: 0.6 + Math.random() * 0.4 }); }
  return r;
}
function mzRescueState() {
  const now = performance.now();
  return { at: mzRescue.cx < 0 ? null : [mzRescue.cx, mzRescue.cy], start: mzRescue.sx < 0 ? null : [mzRescue.sx, mzRescue.sy], joined: mzRescue.joined, paid: mzRescue.paid, dist: mzRescue.dist, hist: mzRescue.hist.map(c => c.slice()), tag: !!mzRescue.doneAt && now - mzRescue.doneAt < MZ_RESCUE.tagMs };
}
function drawMzRescue(ox, oy, T, now) {
  if (mzRescue.cx < 0 || mzRescue.joined) return;
  const r = Math.max(3, Math.round(T * 0.25)), q = Math.max(1, Math.round(T / 10)), on = mzOn((mzRescue.cx + 0.5) * MZ_K, (mzRescue.cy + 0.5) * MZ_K), X = Math.round(ox + on[0] * T), Y = Math.round(oy + on[1] * T + (calmMotion ? 0 : Math.sin(now / 300) * q));
  const R = Math.max(5, T * 0.5) * (1.9 + (calmMotion ? 0 : 0.25 * Math.sin(now / 240))), g = ctx.createRadialGradient(X, Y, 0, X, Y, R);
  g.addColorStop(0, 'rgba(80,160,255,.6)'); g.addColorStop(1, 'rgba(80,160,255,0)');
  ctx.fillStyle = g; ctx.fillRect(X - R, Y - R, R * 2, R * 2);
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(X - r, Math.round(Y + r * 1.1), r * 2, q);
  mzMateRice(X, Y, r, q);
  const fs = Math.max(9, Math.round(T * 0.4)), t = '🆘 たすけて！';
  ctx.font = `${fs}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const bw = Math.round(ctx.measureText(t).width) + q * 4, bh = Math.round(fs * 1.4), bx = X - Math.round(bw / 2), by = Y - r - bh - q * 3;
  ctx.fillStyle = '#2f6fd0'; ctx.fillRect(bx - q, by - q, bw + q * 2, bh + q * 2);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#2f6fd0'; ctx.fillRect(X - q, by + bh + q, q * 2, q * 2);
  ctx.fillStyle = '#c0261f'; ctx.fillText(t, X, by + bh / 2);
}
function drawMzRescueMate(ox, oy, T, now) {
  if (!mzRescue.joined || rp.x === null) return;
  const h = mzRescue.hist[1], on = h ? mzOn((h[0] + 0.5) * MZ_K, (h[1] + 0.5) * MZ_K) : mzOn(rp.x - MZ_K, rp.y);
  const u = Math.max(5, T * 0.5), r = Math.max(3, Math.round(u * 0.42)), q = Math.max(1, Math.round(T / 10)), bob = calmMotion ? 0 : Math.sin(now / 320) * q;
  mzMateRice(Math.round(ox + on[0] * T), Math.round(oy + on[1] * T + bob), r, q);
}
function drawMzRescueRing(ox, oy, T, now) {
  if (rp.x === null) return;
  const going = mzRescue.joined && !mzRescue.paid, done = mzRescue.paid && mzRescue.doneAt && now - mzRescue.doneAt < MZ_RESCUE.tagMs;
  if (!going && !done) return;
  const h = mzRescue.hist[1], on = h ? mzOn((h[0] + 0.5) * MZ_K, (h[1] + 0.5) * MZ_K) : mzOn(rp.x - MZ_K, rp.y);
  const q = Math.max(1, Math.round(T / 10)), bob = calmMotion ? 0 : Math.sin(now / 320) * q;
  const X = Math.round(ox + on[0] * T), Y = Math.round(oy + on[1] * T + bob);
  ctx.save();
  if (going) {
    const a = calmMotion ? 0.8 : 0.65 + 0.25 * Math.sin(now / 240), R = T * 0.55;
    ctx.strokeStyle = `rgba(74,144,226,${a})`; ctx.lineWidth = Math.max(1.5, T * 0.07);
    ctx.beginPath(); ctx.arc(X, Y, R, 0, Math.PI * 2); ctx.stroke();
    const ph = Math.round(T * 0.35), pw = Math.max(1, q), top = Math.round(Y - R - ph);
    ctx.fillStyle = '#2f6fd0'; ctx.fillRect(X, top, pw, ph);
    ctx.fillStyle = '#4a90e2'; ctx.beginPath(); ctx.moveTo(X + pw, top); ctx.lineTo(X + pw + T * 0.3, top + T * 0.1); ctx.lineTo(X + pw, top + T * 0.2); ctx.closePath(); ctx.fill();
  } else {
    ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = Math.max(1.5, T * 0.07);
    ctx.beginPath(); ctx.arc(X, Y, T * 0.62, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
function drawMzRescueTag(w, dpr, now) {
  const done = mzRescue.doneAt && now - mzRescue.doneAt < MZ_RESCUE.tagMs;
  if (!done && !mzRescue.joined && mzRescue.cx < 0) return;
  if (mapCovered(true) || mzBanner.t0) return;
  const S = Math.round(MZ_CLOCK_PX * dpr), gap = Math.round(S * 0.35);
  let y0 = mzViewShelfY(w, dpr, now);
  if (mzView.panoAt && now - mzView.panoAt < MZ_VIEW.panoMs) y0 += Math.round(S * 1.6) + gap * 2;
  if (mzCache.cx >= 0 && mzCache.sx >= 0) y0 += Math.round(S * 1.4) + gap;
  if (mzQuest.sx >= 0 && (mzQuest.got < QUEST_TOOLS.length || (mzQuest.doneAt && now - mzQuest.doneAt < 6000))) y0 += Math.round(S * 1.4) + gap;
  if (mzDino.sx >= 0 && (mzDino.found ? now - mzDino.foundAt < 6000 : mzDino.cx >= 0)) y0 += Math.round(S * 1.4) + gap;
  if (mzEnergy.lastCx >= 0) y0 += Math.round(S * 1.7) + gap;
  if ((mzBrigade.doneAt && now - mzBrigade.doneAt < MZ_BRIGADE.tagMs) || !(mzBrigade.count >= MZ_BRIGADE.n || (!mzBrigade.count && mzBrigade.cx < 0))) y0 += Math.round(S * 1.4) + gap;
  if (mzPurify.cells.length && (mzPurify.count < mzPurify.cells.length || (mzPurify.doneAt && now - mzPurify.doneAt < MZ_PURIFY.tagMs))) y0 += Math.round(S * 1.4) + gap;
  const t = done ? '🎉 救助完了！ +30pt　かおりちゃん、ありがとう！' : mzRescue.joined ? '🆘 救助中　お米が ついてきてるよ　ゴールまで いっしょに！' : `🆘 救助クエスト　迷子のお米${mzRescue.dist >= 0 ? ` あと ${mzRescue.dist}歩くらい` : ''}`;
  ctx.font = `${Math.round(13 * dpr)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let bw = Math.round(ctx.measureText(t).width) + gap * 4;
  if (bw > w - gap * 2) {
    const fs = Math.max(8, Math.floor(13 * dpr * (w - gap * 2) / bw));
    ctx.font = `${fs}px sans-serif`; bw = Math.round(ctx.measureText(t).width) + gap * 4;
  }
  const bh = Math.round(S * 1.4);
  ctx.fillStyle = done ? 'rgba(120,90,0,.8)' : 'rgba(30,70,130,.75)'; ctx.fillRect(Math.round(w / 2 - bw / 2), y0, bw, bh);
  ctx.fillStyle = done ? '#ffe680' : '#d6ecff'; ctx.fillText(t, w / 2, y0 + bh / 2);
}



const MZ_CUBE = { n: 4, min: 6, reach: 18, pts: 5, done: 20, bigMs: 6000 };
const mzCube = { got: 0, cx: -1, cy: -1, sx: -1, sy: -1, last: null, next: 0, doneAt: 0 };
function mzCubeReset() { Object.assign(mzCube, { got: 0, cx: -1, cy: -1, sx: -1, sy: -1, last: null, next: 0, doneAt: 0 }); }
function mzCubePick() {
  const sx = mzCube.sx, sy = mzCube.sy, rx = Math.floor(rp.x / MZ_K), ry = Math.floor(rp.y / MZ_K);
  if (sx < 0) return null;
  const seen = new Map([[sx + ',' + sy, 0]]), q = [[sx, sy]], cand = [], ls = mzCube.last;
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h], d = seen.get(x + ',' + y);
    if (d >= MZ_CUBE.min && Math.abs(x - sx) + Math.abs(y - sy) >= MZ_CUBE.min - 1 && Math.abs(x - rx) + Math.abs(y - ry) >= 3 && !(ls && ls[0] === x && ls[1] === y) && !(x === mzFruit.cx && y === mzFruit.cy) && !(x === mzPiece.cx && y === mzPiece.cy) && mzFruitOk(x, y)) cand.push([x, y]);
    if (d >= MZ_CUBE.reach) continue;
    for (const [dx, dy] of MZ_DIRS) {
      const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (seen.has(k) || mzType(nx, ny) !== 1 || !mzOpen(x, y, dx, dy)) continue;
      seen.set(k, d + 1); q.push([nx, ny]);
    }
  }
  return cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
}
function mzCubeReveal() {
  let n = 0;
  for (const [cx, cy, col] of mzMiniMarks()) { mzMini.seen.set(cx + ',' + cy, col); n++; }
  return n;
}
const cubeFirstGoal = () => { try { return !(Number(lsGet('nsg_mzgoals', '0')) >= 3); } catch (e) { return false; } };
function mzCubeTick(now) {
  if (rp.x === null) return;
  const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K);
  if (mzCube.sx < 0) { mzCube.sx = a; mzCube.sy = b; }
  if (mzCube.doneAt && now - mzCube.doneAt < MZ_CUBE.bigMs + 500) dirty = true;
  if (mzCube.cx < 0) {
    if (mzCube.got >= MZ_CUBE.n || now < mzCube.next) return;
    mzCube.next = now + 500;
    if (cubeFirstGoal()) return;
    const c = mzCubePick();
    if (c) { mzCube.cx = c[0]; mzCube.cy = c[1]; dirty = true; }
    return;
  }
  if (a !== mzCube.cx || b !== mzCube.cy) return;
  const fin = mzCube.got + 1 >= MZ_CUBE.n, r = G.mzCube && G.mzCube(fin);
  if (!r) return;
  mzCube.got++; mzCube.last = [a, b]; mzCube.cx = mzCube.cy = -1; mzCube.next = now;
  grainSound(); roll.happyT = 1.2; dirty = true;
  if (fin) { mzCube.doneAt = now; mzCubeReveal(); }
  floatText(fin ? `🎉 キューブ完成！ +${r.pts}pt` : `🧊 金の かけら +${r.pts}pt（あと ${MZ_CUBE.n - mzCube.got}こ）`);
  const cols = ['#ffe680', '#ffc83a', '#fff6c8'];
  for (let i = 0; i < (fin ? 28 : 12); i++) { const t = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 3, c: cols[i % 3], life: 0.6 + Math.random() * 0.4 }); }
}
function mzCubePoly(X, Y, s, ang, fillTop, fillSide, stroke) {
  const k = 0.5, P = (a, h) => [X + Math.cos(a) * s * 1.414, Y + Math.sin(a) * s * 1.414 * k - h * s], poly = pts => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); };
  const sides = [];
  for (let i = 0; i < 4; i++) {
    const a0 = ang + Math.PI / 4 + i * Math.PI / 2, n = a0 + Math.PI / 4;
    if (Math.sin(n) <= 0) continue;
    sides.push({ pts: [P(a0, 1), P(a0 + Math.PI / 2, 1), P(a0 + Math.PI / 2, -1), P(a0, -1)], lit: 0.5 + 0.5 * Math.cos(n + 0.9) });
  }
  const top = [0, 1, 2, 3].map(i => P(ang + Math.PI / 4 + i * Math.PI / 2, 1));
  ctx.lineJoin = 'round';
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(1, s / 6); for (const f of sides) { poly(f.pts); ctx.stroke(); } poly(top); ctx.stroke(); return; }
  for (const f of sides) { poly(f.pts); ctx.fillStyle = f.lit > 0.66 ? '#f0b820' : f.lit > 0.33 ? '#c98f10' : '#8a5f08'; ctx.fill(); ctx.strokeStyle = '#4a3208'; ctx.lineWidth = Math.max(1, s / 8); ctx.stroke(); }
  poly(top); ctx.fillStyle = fillTop || '#fff0a0'; ctx.fill(); ctx.strokeStyle = '#4a3208'; ctx.lineWidth = Math.max(1, s / 8); ctx.stroke();
}
function drawMzCube(ox, oy, T, now) {
  if (mzCube.cx < 0) return;
  const r = Math.max(5, T * 0.5), q = Math.max(1, Math.round(T / 8)), on = mzOn((mzCube.cx + 0.5) * MZ_K, (mzCube.cy + 0.5) * MZ_K), X = Math.round(ox + on[0] * T), Y0 = Math.round(oy + on[1] * T), Y = Math.round(Y0 + (calmMotion ? 0 : Math.sin(now / 320) * T * 0.07));
  ctx.strokeStyle = `rgba(255,210,70,${(0.3 + 0.2 * Math.sin(now / 260)).toFixed(2)})`; ctx.lineWidth = Math.max(2, q * 2); ctx.beginPath(); ctx.arc(X, Y0, r * (1.45 + 0.1 * Math.sin(now / 260)), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(X - Math.round(r * 0.6), Y0 + Math.round(r * 0.75), Math.round(r * 1.2), q * 2);
  mzCubePoly(X, Y, r * 0.55, calmMotion ? 0.6 : now / 900);
}
function drawMzCubeBig(ox, oy, T, now) {
  if (!mzCube.doneAt || now - mzCube.doneAt >= MZ_CUBE.bigMs || rp.x === null) return;
  const on = mzOn(rp.x, rp.y), s = Math.max(10, T * 1.1), X = Math.round(ox + on[0] * T), Y = Math.round(oy + on[1] * T - s * 2.3 + (calmMotion ? 0 : Math.sin(now / 400) * s * 0.1));
  const fade = Math.min(1, (MZ_CUBE.bigMs - (now - mzCube.doneAt)) / 500, (now - mzCube.doneAt) / 300 + 0.2);
  ctx.save(); ctx.globalAlpha = Math.max(0, fade);
  ctx.strokeStyle = `rgba(255,220,100,${(0.5 + 0.25 * Math.sin(now / 200)).toFixed(2)})`; ctx.lineWidth = Math.max(2, s / 6); ctx.beginPath(); ctx.arc(X, Y, s * (2 + 0.12 * Math.sin(now / 200)), 0, Math.PI * 2); ctx.stroke();
  const el = now - mzCube.doneAt, ang = calmMotion ? 0.6 : el / 700, asm = calmMotion ? 1 : Math.min(1, el / 900);
  const cxp = Math.round(ox + on[0] * T), cyp = Math.round(oy + on[1] * T), R = T * 1.35;
  ctx.strokeStyle = `rgba(255,210,70,${(0.55 + 0.2 * Math.sin(now / 240)).toFixed(2)})`; ctx.lineWidth = Math.max(2, T / 10); ctx.lineJoin = 'round'; ctx.beginPath();
  for (let i = 0; i < 4; i++) { const a = ang + i * Math.PI / 2, px = cxp + Math.cos(a) * R, py = cyp + Math.sin(a) * R; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
  ctx.closePath(); ctx.stroke();
  if (asm < 1) for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, d = s * 2.2 * (1 - asm); mzCubePoly(Math.round(X + Math.cos(a) * d), Math.round(Y + Math.sin(a) * d), s * 0.38 * (1 - asm * 0.5), ang); }
  mzCubePoly(X, Y, s * (0.55 + 0.45 * asm), ang);
  ctx.restore();
}
function drawMzCubeShelf(w, dpr, now) {
  if (mzCube.sx < 0 || mapCovered(true) || mzBanner.t0 || cubeFirstGoal()) return;
  const S = Math.round(MZ_CLOCK_PX * dpr), s = Math.round(S * 0.9), gap = Math.round(s * 0.35), tot = s * MZ_CUBE.n + gap * (MZ_CUBE.n - 1), x0 = Math.round(w / 2 - tot / 2);
  const rows = 1 + (mzScare.until > now ? 1 : 0) + (mzSpring.until > now ? 1 : 0), pieceDone = mzPiece.doneAt && now - mzPiece.doneAt < MZ_PIECE.showMs, shelfH = Math.round(S * 0.9 * (pieceDone ? 1.8 : 1));
  const y0 = Math.round(S * 1.5 + S * 1.9 * (rows - 1) + S * 1.35) + shelfH + gap * 2 - gap;
  ctx.fillStyle = 'rgba(10,20,30,.55)'; ctx.fillRect(x0 - gap, y0 - gap, tot + gap * 2, s + gap * 2);
  for (let i = 0; i < MZ_CUBE.n; i++) {
    const X = x0 + i * (s + gap) + Math.round(s / 2), Y = y0 + Math.round(s / 2);
    if (i < mzCube.got) mzCubePoly(X, Y, s * 0.36, 0.6); else mzCubePoly(X, Y, s * 0.36, 0.6, null, null, 'rgba(255,255,255,.35)');
  }
}

const mzMini = { seen: new Map(), box: null };
function mzMiniMarks() {
  const out = [], gp = mzRt.path && mzRt.path.length ? mzRt.path[mzRt.path.length - 1] : null;
  if (gp) out.push([gp[0], gp[1], '#ffd84a']);
  if (mzFruit.cx >= 0) out.push([mzFruit.cx, mzFruit.cy, '#ff9a2e']);
  if (mzPiece.cx >= 0) out.push([mzPiece.cx, mzPiece.cy, '#4fc3f7']);
  if (mzView.cx >= 0 && !mzView.done) out.push([mzView.cx, mzView.cy, '#b57edc']);
  if (mzCache.cx >= 0 && !mzCache.done && mzCache.dist >= 0 && mzCache.dist <= MZ_CACHE.show) out.push([mzCache.cx, mzCache.cy, '#e0a030']);
  if (mzQuest.cx >= 0 && mzQuest.got < QUEST_TOOLS.length) out.push([mzQuest.cx, mzQuest.cy, QUEST_TOOLS[mzQuest.got].color]);
  if (mzDino.cx >= 0 && !mzDino.found) out.push([mzDino.cx, mzDino.cy, '#7cc576']);
  if (mzCube.cx >= 0) out.push([mzCube.cx, mzCube.cy, '#f5b800']);
  if (mzTorch.cx >= 0) out.push([mzTorch.cx, mzTorch.cy, '#ff7a2e']);
  if (mzBrigade.cx >= 0) out.push([mzBrigade.cx, mzBrigade.cy, '#f29ac0']);
  if (mzRescue.cx >= 0 && !mzRescue.joined) out.push([mzRescue.cx, mzRescue.cy, '#4a90e2']);
  mzPurify.cells.forEach((c, i) => { if (!mzPurify.done[i]) out.push([c[0], c[1], '#c58ae8']); });
  return out;
}
function mzMiniTick() {
  if (rp.x === null) return;
  const f = MZ_FOG[Math.min(4, Math.max(1, Math.round(mzScale)))], sight = f.sight ? f.sight + mzTorchBonus() : 9, me = [rp.x / MZ_K, rp.y / MZ_K];
  for (const [cx, cy, col] of mzMiniMarks()) if (Math.hypot(cx + 0.5 - me[0], cy + 0.5 - me[1]) <= sight) mzMini.seen.set(cx + ',' + cy, col);
  for (let i = 0; i < mzPurify.cells.length; i++) if (mzPurify.done[i]) mzMini.seen.delete(mzPurify.cells[i][0] + ',' + mzPurify.cells[i][1]);
}
function mzMiniState() {
  const gp = mzRt.path && mzRt.path.length ? mzRt.path[mzRt.path.length - 1] : null;
  return { explored: mzTrail.size, me: rp.x === null ? null : [Math.floor(rp.x / MZ_K), Math.floor(rp.y / MZ_K)], goal: !!(gp && mzMini.seen.has(gp[0] + ',' + gp[1])), marks: mzMini.seen.size, box: mzMini.box };
}



const MZ_PAD_N = 5, MZ_PAD_RUN = 4, MZ_PAD_V = 7.5, MZ_PAD_D = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const mzPad = { cell: '', hits: 0, fx: '', fxT: 0, chain: 0, best: 0 };
function mzPadSet(a) {
  if (a.pads) return a.pads;
  const N = MZ_R, op = (k, d) => (d === 0 ? a.er[k] : d === 1 ? a.ed[k] : d === 2 ? a.er[k - 1] : a.ed[k - N]) === 1, cand = [];
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    const k = j * N + i;
    if (a.t[k] !== 1 || op(k, 0) + op(k, 1) + op(k, 2) + op(k, 3) < 2) continue;
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
function mzPadAt(cx, cy) {
  const a = mzArea(cx, cy);
  if (!a) return -2;
  const d = mzPadSet(a).get((cy - a.y0) * MZ_R + cx - a.x0);
  return d === undefined ? -1 : d;
}
function mzPadTick(ax, ay) {
  const cx = Math.floor(rp.x / MZ_K), cy = Math.floor(rp.y / MZ_K), key = cx + ',' + cy;
  if (key === mzPad.cell) return;
  const d = mzPadAt(cx, cy);
  if (d < 0) { if (d === -1) mzPad.cell = key; return; }
  const [dx, dy] = MZ_PAD_D[d], along = rp.vx * dx + rp.vy * dy, push = Math.max(-1, Math.min(1, ax)) * dx + Math.max(-1, Math.min(1, ay)) * dy;
  if (!(along > 0.3 || (along > -0.3 && push > 0.3))) return;
  const s = Math.max(along, MZ_PAD_V);
  if (dx) { rp.vx = dx * s; rp.vy *= 0.2; } else { rp.vy = dy * s; rp.vx *= 0.2; }
  const now = performance.now();
  mzPad.best = ++mzPad.chain;
  mzPad.cell = key; mzPad.hits++; mzRt.run.pads++; mzPad.fx = key; mzPad.fxT = now;
  if (mzPad.chain >= 2) riceSay('びゅーん💨', 1200, 'happy');
  padSound(mzPad.chain); roll.happyT = Math.max(roll.happyT || 0, 0.8); dirty = true;
  try { if (!localStorage.getItem('nsg_pad_seen')) { localStorage.setItem('nsg_pad_seen', '1'); floatText('🍵 抹茶びゅん！ 矢印の 向きに のってみりん'); } } catch (e) {  }
  combo.n++; combo.quietT = 0; comboStep();
  for (let i = 0; i < 6; i++) roll.dust.push({ x: rp.x - dx * (0.4 + i * 0.25) + (Math.random() - 0.5) * 0.5 * Math.abs(dy), y: rp.y - dy * (0.4 + i * 0.25) + (Math.random() - 0.5) * 0.5 * Math.abs(dx), t: 0, s: 0.7 + Math.random() * 0.4, c: '190,240,255' });
}
function drawMzPads(tx0, ty0, tx1, ty1, ox, oy, T, now) {
  const S = MZ_K * T, c0 = Math.floor(tx0 / MZ_K) - 1, r0 = Math.floor(ty0 / MZ_K) - 1, c1 = Math.ceil(tx1 / MZ_K), r1 = Math.ceil(ty1 / MZ_K);
  const b = Math.max(1, Math.round(S / 13)), P = Math.round(S * 0.36);
  for (let ry = Math.floor(r0 / MZ_R); ry <= Math.floor(r1 / MZ_R); ry++) for (let rx = Math.floor(c0 / MZ_R); rx <= Math.floor(c1 / MZ_R); rx++) {
    const a = mzArea(rx * MZ_R, ry * MZ_R);
    if (!a) continue;
    for (const [k, d] of mzPadSet(a)) {
      const cx = a.x0 + k % MZ_R, cy = a.y0 + ((k / MZ_R) | 0);
      if (cx < c0 || cx > c1 || cy < r0 || cy > r1) continue;
      const on = mzOn((cx + 0.5) * MZ_K, (cy + 0.5) * MZ_K), X = Math.round(ox + on[0] * T), Y = Math.round(oy + on[1] * T), [dx, dy] = MZ_PAD_D[d];
      const lit = mzPad.fx === cx + ',' + cy ? Math.max(0, 1 - (now - mzPad.fxT) / 400) : 0;
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(X - P - b, Y - P - b, 2 * P + 2 * b, 2 * P + 2 * b);
      ctx.fillStyle = lit ? '#cfe89a' : '#7da83a'; ctx.fillRect(X - P, Y - P, 2 * P, 2 * P);
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(X - P, Y - P, 2 * P, b);
      const put = (u, v) => ctx.fillRect(X + (dx ? u * dx : -v * dy) - b / 2 | 0, Y + (dy ? u * dy : v * dx) - b / 2 | 0, b, b);
      const ph = Math.floor(now / 160 + cx + cy) % 3;
      for (let j = 0; j < 2; j++) {
        const u0 = (j * 3 + 0.5) * b;
        ctx.fillStyle = lit || ph === j ? '#fffbe6' : '#4c6e1d';
        for (let v = -2; v <= 2; v++) for (let w = 0; w < 2; w++) put(u0 - Math.abs(v) * b - w * b, v * b);
      }
    }
  }
}



const MZ_LINE_N = 6, MZ_DOT_BACK = 150000;
const mzDots = { d: jstDay(), n: (() => { try { const v = JSON.parse(localStorage.getItem('nsg_tsubu') || 'null'); return v && v.d === jstDay() ? v.n : 0; } catch (e) { return 0; } })(), lines: 0 };
function mzLineSet(a) {
  if (a.lines) return a.lines;
  const N = MZ_R, op = (k, d) => (d === 0 ? a.er[k] : d === 1 ? a.ed[k] : d === 2 ? a.er[k - 1] : a.ed[k - N]) === 1;
  const pads = mzPadSet(a), ok = k => { const i = k % N, j = (k / N) | 0; return i >= 1 && i <= N - 2 && j >= 1 && j <= N - 2 && a.t[k] === 1 && !pads.has(k) && op(k, 0) + op(k, 1) + op(k, 2) + op(k, 3) >= 2; }, cand = [];
  for (let k = 0; k < N * N; k++) for (const d of [0, 1]) {
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
    for (const k of run) for (const o of [0, 1, -1, N, -N]) used.add(k + o);
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
function mzLinesNear(fn) {
  const a0 = Math.floor(rp.x / MZ_K / MZ_R), b0 = Math.floor(rp.y / MZ_K / MZ_R);
  for (let ry = b0 - 1; ry <= b0 + 1; ry++) for (let rx = a0 - 1; rx <= a0 + 1; rx++) { const a = mzAreas.get(rx + '_' + ry); if (a) for (const L of mzLineSet(a)) fn(L); }
}


function mzMeibutsuTip() {
  const t = here.town || '', c = here.city || '';
  if (!/西尾/.test(c)) return '';
  if (/^一色町/.test(t)) return '🐟 一色は うなぎの まちだら';
  if (/^(吉良町|東幡豆町|西幡豆町|鳥羽町|寺部町)/.test(t)) return '🐚 三河湾の あさりも 名物だら';
  return '🍵 西尾は 抹茶の まちだら';
}



const MICHI_KEY = 'nsg_michikusa';
const michi = { next: 0, seen: null };
function mzMichikusa(now) {
  const M = window.NISHIO_MICHIKUSA;
  if (!M || !LU || now < michi.next || now < riceBub.until + 3000 || !howtoEl.hidden || mapCovered() || sightBusy() || worldMode || driving || rp.x === null || Math.hypot(rp.vx, rp.vy) < 0.2) return;
  if (!michi.seen) { try { michi.seen = JSON.parse(localStorage.getItem(MICHI_KEY)) || []; } catch (e) { michi.seen = []; } }
  if (!michi.next) michi.next = now;
  const ll = toLatLng(rp.x, rp.y);
  let near = '';
  for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) near += luAt(ll.lat + a * LU.dLat, ll.lng + b * LU.dLng);
  const r = M.pick({ city: here.city, town: here.town, land: luAt(ll.lat, ll.lng), near, month: new Date().getMonth() + 1 }, michi.seen);
  if (!r) { michi.next = now + 5000; return; }
  michi.seen = r.seen; try { localStorage.setItem(MICHI_KEY, JSON.stringify(r.seen)); } catch (e) {  }
  michi.next = now + 45000 + Math.random() * 30000;
  riceSay(r.item.say, 2400, 'happy');
  if (G.track) G.track('kome_michikusa', { id: r.item.id });
}
function mzDotTick() {
  const now = performance.now();
  mzLinesNear(L => {
    let got = false;
    for (let i = 0; i < L.dots.length; i++) if (L.taken[i] && now - L.taken[i] > MZ_DOT_BACK) L.taken[i] = 0;
    for (let i = 0; i < L.dots.length; i++) {
      if (L.taken[i] || Math.abs(L.dots[i][0] - rp.x) > 0.75 || Math.abs(L.dots[i][1] - rp.y) > 0.75) continue;
      L.taken[i] = now; got = true;
      const left = L.taken.filter(t => !t).length;
      dotSound(L.dots.length - left - 1); mzSpringShot();
      if (mzDots.d !== jstDay()) { mzDots.d = jstDay(); mzDots.n = 0; }
      mzDots.n++; mzRt.run.dots++;
      if (!left) {
        mzDots.lines++;
        chordSound(); combo.n += 2; combo.quietT = 0; comboStep(); roll.happyT = Math.max(roll.happyT || 0, 1);
        const tip = mzDots.lines % 3 === 1 ? mzMeibutsuTip() : '';
        riceSay('ぜんぶ ひろった！', 1500, 'happy');
        if (tip) floatText(`🍵 ${tip}`);
        const cols = ['#ffffff', '#fff6c2', '#ffe066'];
        for (let j = 0; j < 12; j++) { const t = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 2.5; mzFx.push({ t0: now, vx: Math.cos(t) * v, vy: Math.sin(t) * v - 3, c: cols[j % 3], life: 0.5 + Math.random() * 0.4 }); }
      }
    }
    if (got) { dirty = true; try { localStorage.setItem('nsg_tsubu', JSON.stringify({ d: mzDots.d, n: mzDots.n })); } catch (e) {  } }
  });
}
function drawMzDots(tx0, ty0, tx1, ty1, ox, oy, T, now) {
  const q = Math.max(1, Math.round(T / 9)), w = 3 * q, h = 4 * q;
  mzLinesNear(L => {
    const a = L.dots[0], b = L.dots[L.dots.length - 1];
    if (b[0] < tx0 - 1 || a[0] > tx1 + 1 || b[1] < ty0 - 1 || a[1] > ty1 + 1) return;
    for (let i = 0; i < L.dots.length; i++) {
      if (L.taken[i] && now - L.taken[i] <= MZ_DOT_BACK) continue;
      const X = Math.round(ox + L.dots[i][0] * T - w / 2), Y = Math.round(oy + L.dots[i][1] * T - h / 2 + Math.sin(now / 260 + i * 0.8) * q);
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(X - q, Y, w + 2 * q, h); ctx.fillRect(X, Y - q, w, h + 2 * q);
      ctx.fillStyle = '#fffdf2'; ctx.fillRect(X, Y, w, h);
      ctx.fillStyle = '#e8dcb8'; ctx.fillRect(X + 2 * q, Y + q, q, 3 * q); ctx.fillRect(X + q, Y + 3 * q, q, q);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(X, Y, q, q);
    }
  });
}

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




const mzFx = [], mzBanner = { t0: 0, text: '', gid: '' };
const mzGoalAsk = { id: '', at: 0 };

const MZ_GOAL_FX = { n: 24, bannerSec: 1.6, fadeSec: 0.4, lifeMin: 0.7, lifeVar: 0.4, vMin: 1.2, vVar: 2.4, up: 2.2, happyMs: 1600 };
const mzNext = { t0: 0, name: '', want: false };



function mzNextOn() { return !!(active && !meiroPause && (mzNext.want || (mzNext.t0 && performance.now() - mzNext.t0 < 3300)) && mazeOn() && G.guide && !mapCovered() && !mzBanner.t0); }
G.toastBlock = mzNextOn;
function mzNextHoldTick() {
  const on = mzNextOn();
  if (on === !!mzNext.hold) return;
  mzNext.hold = on;
  if (on) { if (G.toastHold) G.toastHold(); }
  else if (G.toastFlush) G.toastFlush();
}
function mzHelpToastTick() {
  if (!mzHelp.helpToast || mzBanner.t0) return;
  mzHelp.helpToast = false;
  if (G.toast && !mzHelpOn()) G.toast('🧭 道しるべと ✕ を けしたよ（せっていで また 出せる）');
}





function mzGoalHold(now) {
  if (calmMotion || mapCovered()) { mzGoalStop.at = mzGoalStop.until = 0; return 0; }
  mzHitStop = Math.max(mzHitStop, now + MZ_GOAL_STOP_MS);
  mzGoalStop.at = now; mzGoalStop.until = now + MZ_GOAL_STOP_MS;
  return MZ_GOAL_STOP_MS;
}
function mzGoalFx(text) {
  mzSpringShot();

  const now = performance.now(), fxT = now + mzGoalHold(now), kinds = ['rice', 'rice', 'leaf', 'rice', 'gold', 'leaf'], cols = { rice: '#fffdf3', leaf: ['#6f9f2c', '#9ccc4f'], gold: '#ffd84a' };
  for (let i = 0; i < MZ_GOAL_FX.n; i++) {
    const a = Math.random() * Math.PI * 2, v = MZ_GOAL_FX.vMin + Math.random() * MZ_GOAL_FX.vVar, k = kinds[i % kinds.length];
    mzFx.push({ t0: fxT, vx: Math.cos(a) * v, vy: Math.sin(a) * v - MZ_GOAL_FX.up, k, c: k === 'leaf' ? cols.leaf[i % 2] : cols[k], spin: 4 + Math.random() * 8, ph: Math.random() * 6.3, life: MZ_GOAL_FX.lifeMin + Math.random() * MZ_GOAL_FX.lifeVar });
  }
  mzBanner.t0 = fxT; mzBanner.text = text || ''; mzBanner.said = false; mzBanner.spot = null; mzBanner.demo = null;
  mzBanner.gid = mzGoalAsk.id && now - mzGoalAsk.at < 100 && (G.spots || []).some(s => s.id === mzGoalAsk.id) ? mzGoalAsk.id : ''; mzGoalAsk.id = '';
  mzHelpGoal();
}






function demoBoxAt(q, up, side, first, big) {
  const H = big ? DEMO_HAND1 : DEMO_HAND, L = big ? DEMO_LAB1 : DEMO_LAB, ring = Math.ceil(H.w * 0.6), long = H.h + H.move + H.pad;
  const r = [q.x - Math.max(H.w / 2, ring), q.y - (up ? long : ring) - H.move, q.x + Math.max(H.w / 2, ring), q.y + (up ? ring : long) + H.move];
  if (!first) return r;
  if (side === 'lr') r[2] = Math.max(r[2], q.x + H.w / 2 + L.gap + L.w);
  else if (side === 'll') r[0] = Math.min(r[0], q.x - H.w / 2 - L.gap - L.w);
  else { r[0] = Math.min(r[0], q.x - L.w / 2); r[2] = Math.max(r[2], q.x + L.w / 2); if (up) r[1] = Math.min(r[1], q.y - L.below - L.h - H.move); else r[3] = Math.max(r[3], q.y + L.below + L.h + H.move); }
  return r;
}




function mzArtDemoBox(q, up, side, big) {
  const a = demoBoxAt(q, up, side, false, big), b = demoBoxAt(q, up, side, true, big);
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}
function mzArtDemoToCv() { const c = cv.getBoundingClientRect(), k = c.width ? cv.width / c.width : 1; return b => [(b[0] - c.left) * k, (b[1] - c.top) * k, (b[2] - c.left) * k, (b[3] - c.top) * k]; }
function mzArtDemoAhead() {
  const path = mzRt.path, out = [];
  if (!path || path.length < 2 || rp.x === null || worldMode) return out;
  const toCv = mzArtDemoToCv();
  for (const first of [false, true]) { const sp = tapDemoSpot(path, first); if (sp) out.push(toCv(mzArtDemoBox(sp.q, sp.up, sp.side, !!sp.big))); }
  return out;
}
function mzArtDemoShown() {
  const el = tapDemo.el;
  if (!el || el.hidden || tapDemo.world) return null;
  const q = { x: parseFloat(el.style.left), y: parseFloat(el.style.top) };
  return isFinite(q.x) && isFinite(q.y) ? mzArtDemoToCv()(mzArtDemoBox(q, tapDemo.up, tapDemo.side, el.classList.contains('big'))) : null;
}

function mzArtFits(w, vh, gap, all, x, y, z) {
  return x >= gap && y >= gap && x + z <= w - gap && y + z <= vh - gap && all.every(r => r[2] + gap <= x || r[0] - gap >= x + z || r[3] + gap <= y || r[1] - gap >= y + z);
}
function mzArtSpot(w, vh, rb, gap, want, min, obs, lean) {
  const all = [rb, ...obs], rx = (rb[0] + rb[2]) / 2, ry = (rb[1] + rb[3]) / 2;
  const fits = (x, y, z) => mzArtFits(w, vh, gap, all, x, y, z);
  const near = (c, v) => (a, b) => Math.abs(a - c) - Math.abs(b - c);
  const above = z => {
    const y = Math.floor(rb[1] - gap - z), xs = [Math.round(rx - z / 2)];
    for (const r of obs) xs.push(Math.ceil(r[2] + gap), Math.floor(r[0] - gap - z));
    for (const x of xs.sort(near(rx - z / 2))) if (fits(x, y, z)) return [x, y, z];
    return null;
  };
  const sides = [[rb[2] + gap, w - rb[2]], [rb[0] - gap, rb[0]]].sort((a, b) => b[1] - a[1]);
  if (Math.abs(sides[0][1] - sides[1][1]) < want / 2 && typeof lean === 'number') sides.sort((a, b) => ((a[0] > rx) === (lean > rx)) - ((b[0] > rx) === (lean > rx)));
  const side = z => {
    const ys = [Math.round(ry - z / 2), Math.ceil(rb[1]), Math.floor(rb[3] - z), gap, Math.floor(vh - gap - z)];
    for (const r of obs) ys.push(Math.ceil(r[3] + gap), Math.floor(r[1] - gap - z));
    for (const [edge] of sides) {
      const right = edge > rx, x0 = right ? Math.ceil(edge) : Math.floor(edge - z), xs = [x0];
      for (const r of obs) xs.push(right ? Math.ceil(r[2] + gap) : Math.floor(r[0] - gap - z));
      for (const x of xs.filter(x => (right ? x >= x0 : x <= x0)).sort(near(x0)))
        for (const y of ys.sort(near(ry - z / 2))) if (fits(x, y, z)) return [x, y, z];
    }
    return null;
  };
  let up = null, by = null;
  for (let z = want; z >= min && !up; z = Math.floor(z * 0.95)) up = above(z);
  if (up && up[2] >= want * 0.75) return up;
  for (let z = want; z >= min && !by; z = Math.floor(z * 0.95)) by = side(z);
  return by && (!up || by[2] > up[2]) ? by : up;
}
function drawMzFx(w, cy, T, now, S) {
  if (mapCovered()) { if (mzBanner.t0) mzBanner.t0 = now; for (const p of mzFx) p.t0 = now; return; }
  const ba = (now - mzBanner.t0) / 1000;
  if (mzBanner.t0 && ba < 0) {  } else if (mzBanner.t0 && ba < MZ_GOAL_FX.bannerSec) {
    ctx.globalAlpha = Math.min(1, (MZ_GOAL_FX.bannerSec - ba) / MZ_GOAL_FX.fadeSec);
    const big = Math.round(S * 1.6), y = Math.max(big, cy - S * 3.2) - Math.max(0, 0.3 - ba) * S * 6;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.font = `bold ${big}px "DotGothic16", sans-serif`; ctx.lineWidth = Math.max(4, big / 5); ctx.strokeStyle = '#1a1a1a'; ctx.fillStyle = '#ffe680';
    if (!mzBanner.said) { mzBanner.said = true; riceSay('ついた〜！', MZ_GOAL_FX.happyMs, 'happy'); }
    if (mzBanner.text) { const sm = Math.round(big * 0.5); ctx.font = `bold ${sm}px "DotGothic16", sans-serif`; ctx.lineWidth = Math.max(3, sm / 4); ctx.fillStyle = '#ffffff'; const ty = cy + T * 1.4; ctx.strokeText(mzBanner.text, w / 2, ty); ctx.fillText(mzBanner.text, w / 2, ty); }
    const gs = mzBanner.gid && (G.spots || []).find(s => s.id === mzBanner.gid), gimg = gs && (giantOf(gs) || spriteOf(gs));



    if (gimg) {
      const gi = gimg[0], gap = Math.round(S * 0.25), rb = roll.box || [w / 2 - S, cy - S * 2, w / 2 + S, cy + S], want = Math.round(Math.min(S * 5, w * 0.8));
      const vh = cy * 2, D = mzBanner.demo && mzBanner.demo.w === w && mzBanner.demo.vh === vh ? mzBanner.demo : (mzBanner.demo = { w, vh, r: mzArtDemoAhead() });
      const demo = [mzArtDemoShown(), ...D.r].filter(Boolean), obs = [...mzHudRects(now), mzHud.g, mzMap.arrow, ...demo].filter(Boolean);

      const K = mzBanner.spot, keep = K && K.w === w && K.vh === vh && K.want === want && mzArtFits(w, vh, 1, [rb, ...obs], K.at[0], K.at[1], K.at[2]) ? K.at : null;
      const lean = demo.length ? (demo[0][0] + demo[0][2]) / 2 : mzMap.arrow ? (mzMap.arrow[0] + mzMap.arrow[2]) / 2 : undefined;
      const at = keep || mzArtSpot(w, vh, rb, gap, want, Math.round(S * 1.5), obs, lean), gz = at ? at[2] : 0;
      if (at && at !== keep) mzBanner.spot = { at, w, vh, want };
      if (gz > 0) ctx.drawImage(gi, at[0], at[1], gz, gz);
    }
    ctx.globalAlpha = 1;
  } else if (mzBanner.t0) { mzBanner.t0 = 0; mzBanner.gid = ''; mzBanner.spot = null; mzBanner.demo = null; }
  for (let i = mzFx.length - 1; i >= 0; i--) {
    const p = mzFx[i], a = (now - p.t0) / 1000;
    if (a < 0) continue;
    if (a > p.life) { mzFx.splice(i, 1); continue; }
    const x = w / 2 + (p.vx * a) * T, y = cy + (p.vy * a + 4.5 * a * a) * T, q = Math.max(2, Math.round(T / 5));
    ctx.globalAlpha = Math.max(0, 1 - a / p.life);

    const f = Math.abs(Math.cos(p.ph + a * (p.spin || 0))), pw = p.k === 'rice' ? Math.max(1, Math.round(q * (0.5 + 0.7 * f))) : p.k === 'leaf' ? Math.round(q * 1.6) : q, ph = p.k === 'rice' ? Math.round(q * 1.7) : p.k === 'leaf' ? Math.max(1, Math.round(q * (0.4 + 0.6 * f))) : q;
    ctx.fillStyle = '#222'; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, pw + 2, ph + 2);
    ctx.fillStyle = p.c; ctx.fillRect(Math.round(x), Math.round(y), pw, ph);
  }
  ctx.globalAlpha = 1;
}

function drawMzNext(w, cy, U, now) {
  mzNext.want = false; mzNext.t0 = 0; return;
}
const mzHud = { t: -1e9, r: [], g: null };
function mzHudRects(now) {
  if (now - mzHud.t < 500) return mzHud.r;
  mzHud.t = now;
  const c = cv.getBoundingClientRect(), k = c.width ? cv.width / c.width : 1;
  const box = e => { const b = e.getBoundingClientRect(); return [(b.left - c.left) * k, (b.top - c.top) * k, (b.right - c.left) * k, (b.bottom - c.top) * k]; }, shown = e => e && !e.hidden && e.getClientRects().length;
  mzHud.r = ['.px-zoom', '#pxMeiro', '#koyomi'].map(q => document.querySelector(q)).filter(shown).map(box).filter(r => r[2] > r[0] && r[3] > r[1]);
  const gd = $('guide'), gr = shown(gd) ? box(gd) : null;
  mzHud.g = gr && gr[2] > gr[0] && gr[3] > gr[1] ? gr : null;
  return mzHud.r;
}
window.addEventListener('resize', () => { mzHud.t = -1e9; });
const MZ_TAP_K = 0.5;


function mzArrowClear(qx, qy, w, cy, vh, U, m, mt, a) {
  const need = U * 3, dx = qx - w / 2, dy = qy - cy;
  if (!(Math.hypot(dx, dy) < need)) return [qx, qy];
  if (qy <= mt + 0.5 || qy >= vh - m - 0.5) {
    const s = Math.sqrt(Math.max(0, need * need - dy * dy)), dir = Math.cos(a) < 0 ? -1 : 1;
    return [Math.max(m, Math.min(w - m, w / 2 + dir * s)), qy];
  }
  const s = Math.sqrt(Math.max(0, need * need - dx * dx)), dir = Math.sin(a) < 0 ? -1 : 1;
  return [qx, Math.max(mt, Math.min(vh - m, cy + dir * s))];
}
function drawMzGoal(gt, ox, oy, T, w, vh, cy, dpr, now) {
  const p = toTile(gt.lat, gt.lng), ex = ox + p.x * T, ey = oy + p.y * T, U = Math.min(Math.max(T, Math.round(24 * dpr)), Math.round(32 * dpr)), pulse = (Math.sin(now / 260) + 1) / 2;
  const far = mzRt.path ? (mzRt.path.length - 1) * MZ_K * TILE_M : Math.hypot(p.x - (rp.x === null ? p.x : rp.x), p.y - (rp.y === null ? p.y : rp.y)) * TILE_M;
  const dist = far < 1000 ? `${Math.round(far / 10) * 10}m` : `${(far / 1000).toFixed(1)}km`;
  mzMap.goalLab = null; mzMap.ring = null;
  const label = (t, x, y, size, col) => { ctx.font = `bold ${size}px "DotGothic16", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size / 4); ctx.strokeStyle = '#1a1a1a'; ctx.strokeText(t, x, y); ctx.fillStyle = col; ctx.fillText(t, x, y); };
  const flag = (x, y, s) => {
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
    { const R = Math.max(U * 0.8, G.reachOf(gt) / TILE_M * T) * 1.04 + U * 0.16; mzMap.ring = [ex - R, Math.min(ey - R, ey - U * 0.3 - U * 1.3 * 1.1 - U * 0.2), ex + R, ey + R]; }
    const gg = G.glowGoal;
    if (gg && gg.id === gt.id) {
      ctx.lineWidth = Math.max(2, U * 0.12); ctx.strokeStyle = `rgba(255,236,150,${0.35 + pulse * 0.6})`; ctx.beginPath(); ctx.arc(ex, ey, r + U * (0.25 + pulse * 0.2), 0, Math.PI * 2); ctx.stroke();
    }

    const inside = (t, size) => { ctx.font = `bold ${size}px "DotGothic16", sans-serif`; const hw = ctx.measureText(t).width / 2 + Math.max(3, size / 4); return Math.max(hw, Math.min(w - hw, ex)); };
    const gs = Math.round(U * 0.62), bob = pulse * U * 0.12;

    const below = ey - U * 2.9 - gs * 0.6 < Math.round(MZ_CLOCK_PX * dpr * 2.35), yG = below ? ey + U * 1.55 : ey - U * 2.9 - bob, yN = below ? ey + U * 0.95 : ey - U * 2.15 - bob;
    if (false) { label('ゴール', inside('ゴール', gs), yG, gs, '#ffe680');
    let nm = gt.name || ''; const ns = Math.round(U * 0.56);
      ctx.font = `bold ${ns}px "DotGothic16", sans-serif`; while (nm.length > 2 && ctx.measureText(nm).width > w * 0.8) nm = nm.slice(0, -2) + '…';
      if (nm) { const nx = inside(nm, ns), hw = ctx.measureText(nm).width / 2; label(nm, nx, yN, ns, '#ffffff'); mzMap.goalLab = { x0: nx - hw, x1: nx + hw, w, ex, nm, y: Math.round(yN), ns }; } }
    mzMap.arrow = null; mzNext.arrowDim = false;
    return;
  }

  const a = Math.atan2(ey - cy, ex - w / 2), m = U * 1.6, S = Math.round(MZ_CLOCK_PX * dpr), mt = Math.max(m, S * (2.35 + 1.9 * ((mzScare.until > now) + (mzSpring.until > now))) + U * 1.3);
  const px = Math.min(Math.abs((w / 2 - m) / Math.cos(a)), Math.abs(Math.max(U, Math.sin(a) < 0 ? cy - mt : vh - m - cy) / Math.sin(a)));
  let qx = w / 2 + Math.cos(a) * px, qy = cy + Math.sin(a) * px;
  const k = 1 + pulse * 0.08, R = U * 1.25;

  if (!rec) for (const r of mzHudRects(now)) {
    if (!(qx + R > r[0] && qx - R < r[2] && qy + R > r[1] && qy - R < r[3])) continue;
    const down = r[3] + R, up = r[1] - R;
    qy = down <= vh - m && (up < mt || down - qy <= qy - up) ? down : Math.max(mt, up);
  }
  [qx, qy] = mzArrowClear(qx, qy, w, cy, vh, U, m, mt, a);
  mzMap.pin = [qx, qy, R, a];


  const nb0 = mzNext.at === now && mzNext.box;
  mzNext.arrowDim = !!nb0 && qx + R * k > nb0[0] && qx - R * k < nb0[2] && qy + R * k > nb0[1] && qy - R * k < nb0[3];
  ctx.save(); if (mzNext.arrowDim) ctx.globalAlpha *= 0.3;
  ctx.translate(qx, qy); ctx.rotate(a); ctx.scale(k, k);

  const dart = (t, b, h, n) => { ctx.beginPath(); ctx.moveTo(U * t, 0); ctx.lineTo(-U * b, -U * h); ctx.lineTo(-U * n, 0); ctx.lineTo(-U * b, U * h); ctx.closePath(); ctx.fill(); };
  ctx.fillStyle = '#1a1a1a'; dart(1.2, 0.55, 0.8, 0.15);
  ctx.fillStyle = '#ffd54f'; dart(0.9, 0.36, 0.55, 0.02);
  ctx.restore();
  const bx = qx - Math.cos(a) * U * 1.5, by = qy - Math.sin(a) * U * 1.5;


  const nb = mzNext.at === now && mzNext.box, labHide = !!nb && bx - U * 1.2 < nb[2] && bx + U * 2.2 > nb[0] && by - U * 1.0 < nb[3] && by + U * 1.0 > nb[1];
  mzNext.labHide = labHide;
  if (!labHide) {
    flag(bx - U * 0.45, by + U * 0.15, U * 0.7);

  }
  if (rec) { mzMap.arrow = null; return; }
  mzMap.arrow = [Math.min(qx, bx) - U * 1.3, Math.min(qy, by) - U * 1.3, Math.max(qx, bx) + U * 1.3, Math.max(qy, by) + U * 1.3];
}
const mzMap = { arrow: null, pin: null, ring: null, tapped: false };
try { mzMap.tapped = localStorage.getItem('nsg_mz_arrow_tap') === '1'; } catch (e) {  }

function mzGoalWorld() {
  setWorld(true);
  G.toast('🌏 ゴールは 🏁 の 所（👣 で めいろに もどる）');
}


const mzLayer = { a: null, b: null, c: null, pats: null, key: '', geo: null };
function mzLayerCtx(k, w, h, q, sx, sy, m) {
  let c = mzLayer[k];
  if (!c) c = mzLayer[k] = document.createElement('canvas');
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, w, h);
  x.setTransform(1 / q, 0, 0, 1 / q, -sx / q, -sy / q); x.transform(m.a, m.b, m.c, m.d, m.e, m.f);
  x.lineCap = x.lineJoin = 'round';
  return x;
}






const MZ_BITS = { ike: ['168,222,104', '236,244,150'], cha: ['86,140,52', '150,196,90'], ishi: ['150,146,136', '204,200,188'], kuro: ['96,70,46', '156,116,78'], ami: ['228,220,196', '120,156,176'], dote: ['140,106,70', '190,154,108'], matsu: ['62,112,62', '124,164,84'], ine: ['214,190,110', '238,222,160'] };
const MZ_STYLES = ['ike', 'cha', 'ishi', 'kuro', 'ami', 'dote', 'matsu', 'ine'], MZ_CASTLE_R = 800 / TILE_M;
const MZ_AREA_STYLE = { isshiki: 'ami', kira: 'dote', hazu: 'matsu', sakushima: 'kuro' };


const MZ_HAZU = /^(東幡豆町|西幡豆町|寺部町|鳥羽町|幡豆町)/;
let mzTownsN = -1, mzTownsNishio = [];
function mzArea0(cx, cy) {
  if (!G.cityAt) return null;
  const ll = toLatLng((cx + 0.5) * MZ_K, (cy + 0.5) * MZ_K), c = G.cityAt(ll.lat, ll.lng);
  if (!c || c.name !== '西尾市') return '';
  if (mzTownsN !== towns.length) { mzTownsN = towns.length; mzTownsNishio = towns.filter(t => t[3] === '西尾市'); }
  const px = (cx + 0.5) * MZ_K, py = (cy + 0.5) * MZ_K;
  let best = null, bd = 200 * 200;
  for (const t of mzTownsNishio) { const d = (t[0] - px) * (t[0] - px) + (t[1] - py) * (t[1] - py); if (d < bd) { bd = d; best = t[2]; } }
  if (best) return /^一色町佐久島/.test(best) ? 'sakushima' : /^一色町/.test(best) ? 'isshiki' : /^吉良町/.test(best) ? 'kira' : MZ_HAZU.test(best) ? 'hazu' : 'nishio';
  const D = window.NISHIO_DOTS;
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
  v = tea >= 3 ? 'cha' : water >= 4 ? (as === 'ami' ? 'ami' : 'ishi') : as || (castle && town >= 6 ? 'kuro' : paddy >= 10 ? 'ine' : 'ike');
  if (!unread && mzCastle && area !== null) mzStyleC.set(k, v);
  return v;
}

const MZ_WALL_THEMES = [['#2f7a58', '#256548', '#3d9168', '#5aac7c'], ['#2a7a7a', '#1f6262', '#36908f', '#58aeab'], ['#24566e', '#1b4560', '#306a84', '#5088a2'], ['#6a7d2c', '#55671f', '#7f943a', '#a2b858']];
function mzWallTheme() {
  const id = String(mzRt.gid || '');
  let n = 0;
  for (let i = 0; i < id.length; i++) n += id.charCodeAt(i);
  return n % 4;
}
const mzWallCols = () => MZ_WALL_THEMES[mzWallTheme()];
function mzHedgePat(x, ox, oy, T, style = 'ike') {
  const spring = mapSeason() === 0, wc = mzWallCols(), key = style + (spring ? 's' : 'n') + (style === 'ine' ? PADDY_TILE : '') + (style === 'ike' ? mzWallTheme() : '');
  if (!mzLayer.pats) mzLayer.pats = {};
  if (!mzLayer.pats[key]) {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d'), px = (col, a, b, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(a, b, w, h); };
    let h = 2463534242;
    const rn = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
    if (style === 'cha') {
      px('#4f9a32', 0, 0, 16, 16);
      for (let i = 0; i < 46; i++) { const r = rn(); px(r < 0.35 ? '#2e6a24' : r < 0.8 ? '#7cbf45' : '#b4e070', (rn() * 16) | 0, (rn() * 16) | 0, 1 + (rn() < 0.4), 1); }
      for (let i = 0; i < 4; i++) px('#7a5a3a', (rn() * 16) | 0, (rn() * 16) | 0);
    } else if (style === 'ishi') {
      px('#7a7c74', 0, 0, 16, 16);
      for (const [a, b, w, hh] of [[0, 0, 6, 4], [7, 0, 9, 4], [0, 5, 4, 5], [5, 5, 6, 5], [12, 5, 4, 5], [0, 11, 8, 5], [9, 11, 7, 5]]) { px('#acaea3', a, b, w - 1, hh - 1); px('#d2d4c8', a, b, w - 1, 1); px('#909288', a + w - 2, b + 1, 1, hh - 2); }
    } else if (style === 'ami') {
      px('#2d5f6e', 0, 0, 16, 16);
      for (let i = 0; i < 16; i++) { px('#8ec3cc', i, (i * 2) % 16); px('#8ec3cc', i, (31 - i * 2) % 16); px('#5f97a3', i, (i * 2 + 8) % 16); }
      for (const [a, b] of [[3, 2], [11, 10]]) { px('#ff8a3c', a, b, 2, 2); px('#ffd0a0', a, b); }
    } else if (style === 'dote') {
      px('#8a6a44', 0, 0, 16, 16);
      for (let i = 0; i < 40; i++) { const r = rn(); px(r < 0.5 ? '#6aa84f' : r < 0.75 ? '#4f8a3a' : '#a5845a', (rn() * 16) | 0, (rn() * 16) | 0, 1 + (rn() < 0.5), 1); }
    } else if (style === 'matsu') {
      px('#1f4a36', 0, 0, 16, 16);
      for (let i = 0; i < 36; i++) { const r = rn(); px(r < 0.5 ? '#2f6448' : r < 0.85 ? '#4a8a5e' : '#7a5236', (rn() * 16) | 0, (rn() * 16) | 0, 2, 1); }
    } else if (style === 'ine') {
      if (PADDY_TILE === 'gold') {
        px('#a8892e', 0, 0, 16, 16);
        for (let i = 0; i < 44; i++) { const r = rn(); px(r < 0.3 ? '#8a6f22' : r < 0.8 ? '#d8b84e' : '#f0d878', (rn() * 16) | 0, (rn() * 16) | 0, 1, 1 + (rn() < 0.6)); }
      } else if (PADDY_TILE === 'stubble' || PADDY_TILE === 'soil') {
        px('#8a6a44', 0, 0, 16, 16);
        for (let a = 0; a < 16; a += 8) px('#5a3e26', 0, a + 1, 16, 1);
        for (let a = 0; a < 16; a += 2) for (const b of [2, 10]) { px('#d8c27a', a, b, 1, 4); px('#b89a52', a + 1, b, 1, 4); }
      } else {
        px('#4f8a2e', 0, 0, 16, 16);
        for (let a = 0; a < 16; a += 3) for (let b = 0; b < 16; b++) if (rn() < 0.8) px(rn() < 0.6 ? '#7cbf45' : '#9ad25e', a, b, 1, 1);
        for (let i = 0; i < 10; i++) px('#3a6e22', (rn() * 16) | 0, (rn() * 16) | 0);
      }
    } else if (style === 'kuro') {
      px('#2a2724', 0, 0, 16, 16);
      for (let a = 0; a < 16; a += 4) { px('#3a3530', a, 0, 1, 16); px('#1c1a18', a + 3, 0, 1, 16); }
      for (let i = 0; i < 12; i++) px('#4a443d', (rn() * 16) | 0, (rn() * 16) | 0, 1, 2);
      px('#8f877a', 0, 0, 16, 1); px('#5a544b', 0, 1, 16, 1);
    } else {
      px(wc[0], 0, 0, 16, 16);
      for (let i = 0; i < 70; i++) { const r = rn(); g.fillStyle = r < 0.4 ? wc[1] : r < 0.8 ? wc[2] : wc[3]; g.fillRect((rn() * 16) | 0, (rn() * 16) | 0, 1 + (rn() < 0.3), 1); }
      if (spring) for (let i = 0; i < 3; i++) { const fx = (rn() * 14) | 0, fy = (rn() * 14) | 0; g.fillStyle = '#f07aa0'; g.fillRect(fx, fy, 2, 2); g.fillStyle = '#ffd0e0'; g.fillRect(fx, fy, 1, 1); }
    }
    mzLayer.pats[key] = { c, p: null };
  }
  const P = mzLayer.pats[key];
  P.p = x.createPattern(P.c, 'repeat');
  if (P.p && P.p.setTransform && window.DOMMatrix) P.p.setTransform(new DOMMatrix().translate(ox, oy).scale(T / 8));
  return P.p;
}
function drawMaze(tx0, ty0, tx1, ty1, ox, oy, T) {
  if (rec) { drawMazeGrid(tx0, ty0, tx1, ty1, ox, oy, T); return; }
  const c0 = Math.floor(tx0 / MZ_K) - 1, r0 = Math.floor(ty0 / MZ_K) - 1, c1 = Math.ceil(tx1 / MZ_K), r1 = Math.ceil(ty1 / MZ_K), S = MZ_K * T;
  const m = ctx.getTransform(), live = mzSoft.dv !== 0 && mazeOn(), dk = mazeOn() && mzSoft.dent > 0.01 ? [mzSoft.dent.toFixed(2), mzSoft.x.toFixed(1), mzSoft.y.toFixed(1)].join('/') : '';

  const key = [ox, oy, T, ctx.canvas.width, ctx.canvas.height, m.a, m.b, m.c, m.d, m.e, m.f, mzCurveC.key, mzStyleC.size, mapSeason(), dk, mzWallTheme()].join();
  if (!live && key === mzLayer.key) { mzBlit(); return; }
  const blocks = [], net = new Path2D(), nets = {};
  let n = 0;
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
    const ty = mzType(cx, cy);
    if (ty < 0) continue;
    if (ty === 0 && !mzSpotCell(cx, cy)) blocks.push([ox + cx * S, oy + cy * S]);
    const cs = mzCurves(cx, cy);
    if (cs && cs.length) {
      const st = mzStyle(cx, cy), sn = nets[st] || (nets[st] = new Path2D());
      for (const q of cs) for (const p of [net, sn]) { p.moveTo(ox + q[0][0] * T, oy + q[0][1] * T); for (let i = 1; i < q.length; i++) p.lineTo(ox + q[i][0] * T, oy + q[i][1] * T); }
      n += cs.length;
    }
  }
  mzLayer.key = live ? '' : key; mzLayer.geo = null;
  if (!n && !blocks.length) return;
  const q = T / 8, sx = (((ox % q) + q) % q) - q, sy = (((oy % q) + q) % q) - q;
  const W = Math.ceil((ctx.canvas.width - sx) / q) + 1, H = Math.ceil((ctx.canvas.height - sy) / q) + 1;
  const wo = 2 * (MZ_HALF + MZ_HEDGE) * T, wi = 2 * MZ_HALF * T, u = Math.max(1, Math.round(T / 8)), o = Math.max(1, Math.round(T / 4));
  const L = mzLayerCtx('a', W, H, q, sx, sy, m);
  L.imageSmoothingEnabled = false;
  L.fillStyle = 'rgba(28,70,52,.4)'; for (const [X, Y] of blocks) L.fillRect(X, Y, S, S);
  L.strokeStyle = '#0d2219'; L.lineWidth = wo; L.stroke(net);
  L.lineWidth = wo - 2 * u;
  for (const st of MZ_STYLES) if (nets[st]) { L.strokeStyle = mzHedgePat(L, ox, oy, T, st) || mzWallCols()[0]; L.stroke(nets[st]); }
  L.strokeStyle = '#0d2219'; L.lineWidth = wi + 2 * u; L.stroke(net);
  L.globalCompositeOperation = 'destination-out'; L.lineWidth = wi; L.stroke(net);
  const dent = mzSoft.dent > 0.01 && mazeOn() ? [ox + (mzSoft.x + mzSoft.ux * (MZ_TUBE + mzSoft.dent)) * T, oy + (mzSoft.y + mzSoft.uy * (MZ_TUBE + mzSoft.dent)) * T, (MZ_HALF - MZ_TUBE) * T] : null;
  if (dent) {
    const a = Math.atan2(mzSoft.uy, mzSoft.ux), stretch = 1 + Math.min(2.6, mzSoft.dent * 10);
    const glow = Math.min(1, mzSoft.dent / 0.25), gr = dent[2] + 0.35 * T;
    L.globalCompositeOperation = 'source-atop'; L.fillStyle = `rgba(200,245,170,${(0.6 * glow).toFixed(2)})`; L.beginPath(); L.ellipse(dent[0], dent[1], gr, gr * stretch, a, 0, Math.PI * 2); L.fill();
    L.fillStyle = '#0d2219'; L.beginPath(); L.ellipse(dent[0], dent[1], dent[2] + u, (dent[2] + u) * stretch, a, 0, Math.PI * 2); L.fill();
    L.globalCompositeOperation = 'destination-out'; L.beginPath(); L.ellipse(dent[0], dent[1], dent[2], dent[2] * stretch, a, 0, Math.PI * 2); L.fill();
    dent.push(a, stretch);
  }
  const B = mzLayerCtx('b', W, H, q, sx, sy, m);
  B.translate(o, o); B.strokeStyle = '#000'; B.lineWidth = wo; B.stroke(net);
  B.globalCompositeOperation = 'destination-out'; B.lineWidth = wi; B.stroke(net);
  if (dent) { B.beginPath(); B.ellipse(dent[0], dent[1], dent[2], dent[2] * dent[4], dent[3], 0, Math.PI * 2); B.fill(); }
  const C = mzLayer.c || (mzLayer.c = document.createElement('canvas'));
  if (C.width !== W || C.height !== H) { C.width = W; C.height = H; }
  const X = C.getContext('2d'); X.clearRect(0, 0, W, H); X.globalAlpha = 0.32; X.drawImage(mzLayer.b, 0, 0); X.globalAlpha = 1; X.drawImage(mzLayer.a, 0, 0);
  mzLayer.geo = [sx, sy, W * q, H * q];
  mzBlit();
}
function mzBlit() {
  const g = mzLayer.geo;
  if (!g) return;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mzLayer.c, g[0], g[1], g[2], g[3]);
  ctx.restore();
}
function drawMazeGrid(tx0, ty0, tx1, ty1, ox, oy, T) {
  const c0 = Math.floor(tx0 / MZ_K) - 1, r0 = Math.floor(ty0 / MZ_K) - 1, c1 = Math.ceil(tx1 / MZ_K), r1 = Math.ceil(ty1 / MZ_K), S = MZ_K * T;
  const lw = Math.max(2, Math.round(T / 2)), u = Math.max(1, Math.round(T / 8)), o = Math.max(1, Math.round(T / 4)), segs = [];
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
    const ty = mzType(cx, cy);
    if (ty < 0) continue;
    const X = ox + cx * S, Y = oy + cy * S, go = (x, y) => mzType(x, y) === 1 || mzSpotCell(x, y);
    if (!go(cx, cy)) { if (ty === 0) { ctx.fillStyle = 'rgba(28,70,52,.4)'; ctx.fillRect(X, Y, S, S); } continue; }
    if (!mzOpen(cx, cy, 1, 0)) segs.push([X + S - lw / 2, Y - lw / 2, lw, S + lw]);
    if (!mzOpen(cx, cy, 0, 1)) segs.push([X - lw / 2, Y + S - lw / 2, S + lw, lw]);
    if (!go(cx - 1, cy) && mzType(cx - 1, cy) >= 0) segs.push([X - lw / 2, Y - lw / 2, lw, S + lw]);
    if (!go(cx, cy - 1) && mzType(cx, cy - 1) >= 0) segs.push([X - lw / 2, Y - lw / 2, S + lw, lw]);
  }
  ctx.fillStyle = 'rgba(0,0,0,.32)'; for (const [X, Y, w, h] of segs) ctx.fillRect(X + o, Y + o, w, h);
  const hi = hedgeImg();
  if (hi && T % 16 === 0) { drawHedges(hi, segs, ox, oy, T, S, lw); return; }
  ctx.fillStyle = '#0d2219'; for (const [X, Y, w, h] of segs) ctx.fillRect(X, Y, w, h);
  ctx.fillStyle = mzWallCols()[0]; for (const [X, Y, w, h] of segs) ctx.fillRect(X + u, Y + u, w - 2 * u, h - 2 * u);
  ctx.fillStyle = 'rgba(200,255,220,.55)'; for (const [X, Y, w, h] of segs) { if (w > h) ctx.fillRect(X + u, Y + u, w - 2 * u, u); else ctx.fillRect(X + u, Y + u, u, h - 2 * u); }
}



const HEDGE = { img: null, req: false };
function hedgeImg() {
  if (!HEDGE.req) {
    HEDGE.req = true;
    const im = new Image();
    im.onload = () => { HEDGE.img = im; dirty = true; };
    im.onerror = () => { setTimeout(() => { HEDGE.req = false; }, 15000); };
    im.src = 'nishio-go/art/hedge.png';
  }
  return HEDGE.img;
}
function drawHedges(img, segs, ox, oy, T, S, lw) {
  const k = T / 16, LP = 128, spring = mapSeason() === 0, corners = new Map();
  const hash = (a, b, c) => { let h = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791); h = (h ^ (h >>> 13)) * 1274126177; return (h ^ (h >>> 16)) >>> 0; };
  for (const [X, Y, w, h] of segs) {
    const horiz = w > h, gx = Math.round((X + lw / 2 - ox) / S), gy = Math.round((Y + lw / 2 - oy) / S);
    const flower = spring && hash(gx, gy, horiz ? 1 : 2) % 3 === 0;
    if (horiz) {
      const sy = flower ? 8 : 0;
      for (let x = X; x < X + w - 0.5;) {
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
  for (const [gx, gy] of corners.values()) {
    const hv = hash(gx, gy, 7), i = spring && hv % 4 === 0 ? 3 : hv % 3;
    ctx.drawImage(img, 20 + i * 14, 20, 12, 12, ox + gx * S - P / 2, oy + gy * S - P / 2, P, P);
  }
}
function mzDentStep(dt) {
  if (!mazeOn()) { mzSoft.dent = mzSoft.dv = 0; return; }
  const tg = mzSoft.on ? Math.min(MZ_SOFT_MAX, mzSoft.pen * 2) : 0;
  if (mzSoft.dv === 0 && Math.abs(tg - mzSoft.dent) < 0.02) { if (!mzSoft.on) mzSoft.dent = 0; return; }
  for (let left = Math.min(dt, 0.1); left > 1e-6; left -= 1 / 60) {
    const h = Math.min(left, 1 / 60);
    mzSoft.dv += (MZ_DENT_K * (tg - mzSoft.dent) - (calmMotion ? 18 : MZ_DENT_C) * mzSoft.dv) * h;
    mzSoft.dent = Math.max(calmMotion ? 0 : -0.15, Math.min(MZ_SOFT_MAX, mzSoft.dent + mzSoft.dv * h));
  }
  if (Math.abs(mzSoft.dv) < 0.02 && Math.abs(mzSoft.dent - tg) < 0.004) { mzSoft.dent = tg; mzSoft.dv = 0; }
}
const rollArea = { key: '', id: '', at: 0 };
function rollAreaAt(x, y) {
  const key = Math.floor(x) + ',' + Math.floor(y), now = performance.now();
  if (key === rollArea.key && (rollArea.id || now - rollArea.at < 2000)) return rollArea.id;
  let id = '';
  try { const gz = G['areaZone']; id = gz ? gz(toLatLng(Math.floor(x) + 0.5, Math.floor(y) + 0.5)) || '' : ''; } catch (e) { id = ''; }
  rollArea.key = key; rollArea.id = id; rollArea.at = now;
  return id;
}
function idleRollForce() {
  const gd = G['guide'], RS = window.nishioRollSync;
  if (!RS || !RS.idleDue || mazeOn() || worldMode || driving || tapS.path.length || mapCovered(false, true)) { idleRoll.on = false; return null; }
  const now = performance.now();
  if (!RS.idleDue((now - idleRoll.last) / 1000, false)) { idleRoll.on = false; return null; }
  const fw = firstWalk();
  let tg = null, gobj = null;
  if (gd) {
    const p = toTile(gd.lat, gd.lng);
    if (Number.isFinite(p.x) && Number.isFinite(p.y)) gobj = { x: p.x, y: p.y, key: 'g:' + (gd.id || gd.name || '') };
  }
  const idleSkipAdd = k => { idleRoll.key = k; if (typeof k === 'string' && k.indexOf('g:') === 0) idleRoll.guideKey = k; if (idleRoll.skip.indexOf(k) < 0) { idleRoll.skip.push(k); if (idleRoll.skip.length > 24) idleRoll.skip.shift(); } };
  const failedAll = () => (RS.idleExclude ? RS.idleExclude(idleRoll.skip, idleRoll.fails) : idleRoll.skip.concat(idleRoll.fails.filter(k => idleRoll.skip.indexOf(k) < 0)));
  const gEff = (gobj && (idleRoll.guideKey === gobj.key || idleRoll.fails.indexOf(gobj.key) >= 0)) ? null : gobj;
  let restarted = false;
  for (let hop = 0; hop < 8; hop++) {
    if (!tg && fw) {
      const ex = failedAll();
      tg = (gEff && ex.indexOf(gEff.key) < 0) ? Object.assign({ guide: true }, gEff) : null;
      if (!tg) { idleRoll.on = false; return null; }
    }
    if (!tg) {
      const list = (G['spots'] || []).map(s => { const p = toTile(s.lat, s.lng); return { x: p.x, y: p.y, key: 's:' + (s.id || s.name) }; });
      const ex = failedAll();
      if (RS.nextIdleTarget) tg = RS.nextIdleTarget(rp.x, rp.y, gEff, list, ex);
      else if (gEff && ex.indexOf(gEff.key) < 0) tg = Object.assign({ guide: true }, gEff);
      else tg = RS.idleTarget(rp.x, rp.y, list, ex);
    }
    if (!tg) {
      if (!fw && !restarted && idleRoll.skip.length) { restarted = true; idleRoll.skip = []; continue; }
      idleRoll.on = false; return null;
    }
    const guide = tg.guide === true;
    const f = RS.idleForce(rp.x, rp.y, tg.x, tg.y, rp.vx, rp.vy);
    if (f.arrived) {
      idleSkipAdd(tg.key);
      tg = null; continue;
    }
    if (!idleRoll.anchor || idleRoll.anchor.key !== tg.key) idleRoll.anchor = { key: tg.key, x: rp.x, y: rp.y, t: now };
    else if (now - idleRoll.anchor.t > 4000) {
      if (Math.hypot(rp.x - idleRoll.anchor.x, rp.y - idleRoll.anchor.y) < 0.5) {
        idleSkipAdd(tg.key);
        idleRoll.fails = RS.idleNoteFail ? RS.idleNoteFail(idleRoll.fails, tg.key) : (idleRoll.fails.indexOf(tg.key) >= 0 ? idleRoll.fails : idleRoll.fails.concat(tg.key));
        idleRoll.anchor = null; tg = null; continue;
      }
      idleRoll.anchor = { key: tg.key, x: rp.x, y: rp.y, t: now };
    }
    idleRoll.key = tg.key;
    idleRoll.on = true;
    return f;
  }
  idleRoll.on = false; return null;
}









const TAP_TILT_OVER = 0.75;
function tapWalkTilt() {
  if (!tapS.goal) return 1;
  if (Math.hypot(tiltG.x, tiltG.y) < TAP_TILT_OVER) return 0;
  tapWalkStop();
  return 1;
}
function rollStep(dt) {
  mzDentStep(dt);
  const t = targetTile();
  const x0 = rp.x, y0 = rp.y;
  if (rp.x === null || (rp.sent && Math.hypot(t.x - rp.sent.x, t.y - rp.sent.y) > 0.6)) {
    if (rp.x !== null && rp.sent && Math.hypot(t.x - rp.sent.x, t.y - rp.sent.y) > 6 && performance.now() - (mzRt.snapT || 0) > 800) mzRt.warp = true;
    Object.assign(rp, { x: t.x, y: t.y, vx: 0, vy: 0, sent: { x: t.x, y: t.y }, tile: `${Math.floor(t.x)},${Math.floor(t.y)}` });
  }
  if (sightBusy() || document.body.classList.contains('jump-open') || (mazeOn() && mapCovered(true, true))) { rp.vx = rp.vy = 0; return; }
  if (npcSend) npcSendOff();
  const tk = tapWalkTilt();
  const ax = tiltG.x * tk + rk.right - rk.left, ay = tiltG.y * tk + rk.down - rk.up;
  if (Math.hypot(ax, ay) > 0.08) G.notePlayInput();
  if (Math.hypot(ax, ay) > 0.08) idleTouch();
  const sl = slopeAt(rp.x, rp.y);
  const gnd = groundAt(rp.x, rp.y), wxr = WX_ROLL[wxKind()], RS0 = window.nishioRollSync, feel = RS0 && RS0.groundFeel ? RS0.groundFeel(rollAreaAt(rp.x, rp.y)) : { crr: 1, lin: 1 }, crr = ROLL_CRR * gnd.crr * (wxr ? wxr.crr : 1) * feel.crr;
  const up = rp.vx * sl.x + rp.vy * sl.y < 0 ? 0.6 : 1;
  const acc = ROLL_ACC * (KP.accel || 1);

  const cr = Math.min(crr * (KP.crr || 1), acc * 0.4);
  let fx = Math.max(-1, Math.min(1, ax)) * acc + sl.x * up, fy = Math.max(-1, Math.min(1, ay)) * acc + sl.y * up;
  const idl = idleRollForce(dt);
  if (idl) { fx += idl.fx; fy += idl.fy; }
  const fp = Math.hypot(fx, fy);
  let sp = Math.hypot(rp.vx, rp.vy);
  if (sp < (window.nishioRollSync && window.nishioRollSync.STOP_V || 0.05)) {
    const c0 = cr;
    if (fp > c0) { rp.vx += fx / fp * (fp - c0) * dt; rp.vy += fy / fp * (fp - c0) * dt; }
    else if (!mzSoft.on) { rp.vx = rp.vy = 0; return; }
  } else {
    const pvx = rp.vx, pvy = rp.vy;
    rp.vx += fx * dt; rp.vy += fy * dt;
    sp = Math.hypot(rp.vx, rp.vy);
    const RSg = window.nishioRollSync, linK = ROLL_LIN * gnd.drag * (wxr ? wxr.lin : 1) * feel.lin * (KP.lin || 1), airK = ROLL_AIR * (KP.air || 1);
    const ns = Math.max(0, Math.min(ROLL_MAX, RSg && RSg.glideSpeed ? RSg.glideSpeed(sp, dt, cr, linK, airK) : sp - (cr + linK * sp + airK * sp * sp) * dt));
    if (sp > 0) { rp.vx *= ns / sp; rp.vy *= ns / sp; }
    const RS = window.nishioRollSync;
    if (RS && RS.limitTurn) { const lt = RS.limitTurn(rp.vx, rp.vy, pvx, pvy, RS.TURN_PER_SEC * dt); rp.vx = lt.vx; rp.vy = lt.vy; }
  }
  const mz = mazeOn(), rb = mz ? (x, y) => mzBlocked(rp.x, rp.y, x, y) : rollBlocked;
  const tube = mz ? mzNear(rp.x, rp.y) : null, inTube = !!tube && tube.d <= MZ_TUBE + 0.35;
  let rub = null;
  if (mz && !inTube && !window.__noCornerAssist) {

    const ix = Math.max(-1, Math.min(1, ax)), iy = Math.max(-1, Math.min(1, ay)), cx = Math.floor(rp.x / MZ_K), cy = Math.floor(rp.y / MZ_K), k = Math.min(1, dt * 12);
    const mx = (cx + 0.5) * MZ_K, my = cy * MZ_K + 1.4;
    const sp2 = rp.vx * rp.vx + rp.vy * rp.vy, toY = sp2 > 0.25 ? Math.abs(rp.vx) >= Math.abs(rp.vy) : Math.abs(iy) >= Math.abs(ix);
    if (toY && Math.abs(iy) > 0.3 && Math.abs(iy) >= Math.abs(ix) * 0.6 && Math.abs(mx - rp.x) < 1.3 && mzOpen(cx, cy, 0, Math.sign(iy))) {
      rp.x += (mx - rp.x) * k;
      if (Math.abs(mx - rp.x) < 0.35 && Math.abs(rp.vx) > Math.abs(rp.vy)) { const t = Math.abs(rp.vx) * 0.4 * k; rp.vy += Math.sign(iy) * t; rp.vx -= Math.sign(rp.vx) * t; }
    }
    else if (!toY && Math.abs(ix) > 0.3 && Math.abs(ix) >= Math.abs(iy) * 0.6 && Math.abs(my - rp.y) < 1.3 && mzOpen(cx, cy, Math.sign(ix), 0)) {
      rp.y += (my - rp.y) * k;
      if (Math.abs(my - rp.y) < 0.35 && Math.abs(rp.vy) > Math.abs(rp.vx)) { const t = Math.abs(rp.vy) * 0.4 * k; rp.vx += Math.sign(ix) * t; rp.vy -= Math.sign(rp.vy) * t; }
    }
  }
  const R = 0.3, RS = R * 0.6;


  const RX = mz ? 0.72 : R, RD = mz ? 0.62 : R, RU = mz ? 0.42 : R, RSX = mz ? 0.5 : RS, RSY = mz ? 0.4 : RS;
  const hit = (vin, horiz, wet) => {
    if (vin < ROLL_STICK) return 0;
    bumpFx(vin, horiz, wet, mz);
    return wet ? -0.25 : mz ? -(KP.bounce !== undefined ? KP.bounce * 0.7 : 0.3) : -(KP.bounce !== undefined ? KP.bounce : ROLL_BOUNCE);
  };
  const wetAt = (x, ys, xs) => (xs || [x]).some(px => (ys || []).some(py => codeAt(Math.floor(px), Math.floor(py)) === C.A));
  if (inTube) {
    const ix = Math.max(-1, Math.min(1, ax)), iy = Math.max(-1, Math.min(1, ay)), im = Math.hypot(ix, iy);
    if (tube.d > MZ_TUBE - 0.05 && im > 0.3 && !window.__noCornerAssist) {

      const ux = (rp.x - tube.x) / tube.d, uy = (rp.y - tube.y) / tube.d;
      if ((ix * ux + iy * uy) / im > 0.6) {

        const dx = Math.abs(ix) > Math.abs(iy) ? Math.sign(ix) : 0, dy = dx ? 0 : Math.sign(iy), cx = Math.floor(rp.x / MZ_K), cy = Math.floor(rp.y / MZ_K);
        let aim = mzOpen(cx, cy, dx, dy) ? [(cx + 0.5 + dx * 0.5) * MZ_K, (cy + 0.5 + dy * 0.5) * MZ_K] : null;
        if (!aim) for (const [ex, ey] of MZ_DIRS) {
          if (ex * dx + ey * dy || !mzOpen(cx, cy, ex, ey) || !mzOpen(cx + ex, cy + ey, dx, dy)) continue;
          if (Math.hypot(rp.x - (cx + 0.5 + ex * 0.5) * MZ_K, rp.y - (cy + 0.5 + ey * 0.5) * MZ_K) < 1) { aim = [(cx + ex + 0.5 + dx * 0.5) * MZ_K, (cy + ey + 0.5 + dy * 0.5) * MZ_K]; break; }
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
    if (q && q.d > MZ_TUBE) {
      const ux = (nx - q.x) / q.d, uy = (ny - q.y) / q.d, vn = rp.vx * ux + rp.vy * uy, over = q.d - MZ_TUBE, pen = Math.min(over, MZ_SOFT_MAX);
      rub = [ux, uy];
      if (!mzSoft.on && vn > MZ_HIT_STOP && !calmMotion) mzHitStop = performance.now() + MZ_HIT_STOP_MS;
      if (!mzSoft.on && vn > MZ_HIT_STOP && performance.now() - riceBub.at > 4000) riceSay('いたっ', 900);
      if (!mzSoft.on && vn > 0) { hit(vn, Math.abs(ux) >= Math.abs(uy), false); mzSoft.vin = vn; mzSoft.dv = Math.max(mzSoft.dv, vn * 0.5); }
      mzSoft.on = true; mzSoft.x = q.x; mzSoft.y = q.y; mzSoft.ux = ux; mzSoft.uy = uy; mzSoft.pen = pen;
      const push = MZ_SOFT_K * pen * dt + (vn > 0 ? MZ_SOFT_C * vn * dt : 0);
      const vtx = rp.vx - vn * ux, vty = rp.vy - vn * uy, vt = Math.hypot(vtx, vty), f = vt > 0 ? Math.max(0, 1 - MZ_RUB * MZ_SOFT_K * pen * dt / vt) : 1;
      let vn2 = vn - push;
      if (over > MZ_SOFT_MAX) { nx = q.x + ux * (MZ_TUBE + MZ_SOFT_MAX); ny = q.y + uy * (MZ_TUBE + MZ_SOFT_MAX); if (vn2 > 0) vn2 = 0; }
      rp.vx = vtx * f + vn2 * ux; rp.vy = vty * f + vn2 * uy;
    } else {
      if (mzSoft.on && mzSpring.until > performance.now() && mzSoft.vin > 1.5) {
        const vo = -(rp.vx * mzSoft.ux + rp.vy * mzSoft.uy), want = Math.min(ROLL_MAX, mzSoft.vin * MZ_SPRING_E);
        if (vo < want) { rp.vx -= (want - vo) * mzSoft.ux; rp.vy -= (want - vo) * mzSoft.uy; mzSpring.boosts++; mzSpringChain(performance.now()); }
        const v = Math.hypot(rp.vx, rp.vy); if (v > ROLL_MAX) { rp.vx *= ROLL_MAX / v; rp.vy *= ROLL_MAX / v; }
      }
      if (mzSoft.on && mzSoft.vin > 2.5 && roll.h <= 0 && !calmMotion) { roll.hv = Math.min(2.6, 0.8 + mzSoft.vin * 0.25); roll.h = 0.001; }
      if (mzSoft.on && mzSoft.vin > 1.5) { boingSound(Math.min(1, mzSoft.vin / 8), mzSpring.until > performance.now() ? 1 : 0); mzSoft.boings++; }
      mzSoft.on = false; mzSoft.vin = 0;
    }
    rp.x = nx; rp.y = ny;
  } else {
  const nx = rp.x + rp.vx * dt, ex = nx + Math.sign(rp.vx) * RX;
  const xa = rb(ex, rp.y - RSY), xb = rb(ex, rp.y + RSY);
  if (rp.vx && (rb(ex, rp.y) || (xa && xb))) {
    rp.x = rp.vx > 0 ? Math.floor(ex) - RX - 1e-3 : Math.floor(ex) + 1 + RX + 1e-3;
    const k = hit(Math.abs(rp.vx), true, wetAt(ex, [rp.y, rp.y - RSY, rp.y + RSY])); rp.vx *= k; if (k) rp.vy *= 0.85;
  }
  else {
    rp.x = nx;
    if (rp.vx && (xa || xb) && !rb(rp.x, rp.y + (xa ? RD : -RU) + (xa ? 0.05 : -0.05))) rp.y += (xa ? 1 : -1) * Math.abs(rp.vx) * dt * 0.7;
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
  if (mz) {
    const spd = Math.hypot(rp.vx, rp.vy);
    hedgeScrapeT -= dt;
    if (spd > 1.4 && hedgeScrapeT <= 0 && inTube) {
      if (rub) {
        hedgeScrapeT = 0.22 / Math.min(3, spd / 1.4);
        roll.dust.push({ x: rp.x + rub[0] * 0.7, y: rp.y + rub[1] * 0.6, t: 0, s: 0.8 + Math.random() * 0.5, vx: (Math.random() - 0.5) * 0.8, c: (MZ_BITS[mzStyle(Math.floor(rp.x / MZ_K), Math.floor(rp.y / MZ_K))] || MZ_BITS.ike)[Math.random() < 0.5 ? 0 : 1], bit: true });
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
  if (mz) mzPadTick(ax, ay);
  if (Math.abs(rp.vx) > 0.05 || Math.abs(rp.vy) > 0.05) facing = Math.abs(rp.vx) > Math.abs(rp.vy) ? (rp.vx > 0 ? 'right' : 'left') : (rp.vy > 0 ? 'down' : 'up');
  const tx = Math.floor(rp.x), ty = Math.floor(rp.y), key = `${tx},${ty}`;
  const hitNpc = who => {
    if (x0 !== null) { rp.x = x0; rp.y = y0; }
    const hard = Math.hypot(rp.vx, rp.vy);
    rp.vx = rp.vy = 0;
    if (hard > 0.6) { roll.sq = Math.min(0.2, 0.08 + hard * 0.03); roll.sqv = 0; roll.sqx = Math.abs(rp.x - (tx + 0.5)) > Math.abs(rp.y - (ty + 0.5)); kotoSound(Math.min(1, hard / 5)); }
    roll.happyT = 1.4;
    if ($('pxInfo').hidden && npcBump.id !== who.id) npcGreet(who, tx, ty);
  };
  const mzHit = mazeOn() ? mzNpcNear(rp.x, rp.y) : null;
  if (key === rp.tile && mzHit && npcBump.id !== mzHit.id) { npcMetSync(); if (!npcBump.met.has(mzHit.id)) { hitNpc(mzHit); return; } }
  if (key !== rp.tile) {
    npcMetSync();


    const who0 = mazeOn() ? mzHit : npcAt(tx, ty), who = who0 && !(mazeOn() && (npcBump.id === who0.id || npcBump.met.has(who0.id))) ? who0 : null;
    if (who) { hitNpc(who); return; }
    if (npcBump.id && Math.abs(tx - npcBump.x) + Math.abs(ty - npcBump.y) >= 3) npcBump.id = '';
    const [px0, py0] = rp.tile.split(',').map(Number), wasRail = codeAt(px0, py0) === C.L;
    rp.tile = key;
    sightCheck(); critterStep(tx, ty);
    const spd = Math.hypot(rp.vx, rp.vy);
    if (codeAt(tx, ty) === C.L && !wasRail && spd > 1.2 && roll.h <= 0) { roll.hv = 1.1 + spd * 0.12; roll.h = 0.001; clackSound(Math.min(1, spd / 5)); }
  }
  {



    const spd = Math.hypot(rp.vx, rp.vy), zg = (() => { const h = heightAt(rp.x, rp.y); return h === null ? null : h / TILE_M; })();
    if (roll.h > 0 && zg !== null && roll.zg !== null) roll.h = Math.max(0.001, roll.h - (zg - roll.zg));
    roll.zg = zg;
    if (spd > 2.2 && roll.h <= 0 && !roll.jumpCd && zg !== null) {
      const W = 1.2, ux = rp.vx / spd, uy = rp.vy / spd, hb = heightAt(rp.x - ux * W, rp.y - uy * W), hf = heightAt(rp.x + ux * W, rp.y + uy * W);
      if (hb !== null && hf !== null) {
        const gb = (zg * TILE_M - hb) / (W * TILE_M), gf = (hf - zg * TILE_M) / (W * TILE_M), bend = gb - gf;
        if (bend > 0.07) {
          roll.hv = Math.min(5.5, spd * (Math.max(0, gb) * 1.6 + bend * 1.4)); roll.h = 0.001; roll.jumpCd = 0.5; roll.jumps++;
          kotoSound(Math.min(1, spd / 5));
        } else if (bend < -0.12) { roll.sq = Math.max(roll.sq, 0.14); roll.sqv = 0; roll.sqx = false; roll.jumpCd = 0.4; kotoSound(Math.min(1, spd / 5), true); }
      }
    }
  }
  const far = Math.hypot(rp.x - rp.sent.x, rp.y - rp.sent.y), nowMs = performance.now();
  if (far > 0.45 || (far > 0.05 && nowMs - (rp.sentAt || 0) > 250)) {
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
  comboEnd();
  if (hedge) {
    roll.sq = Math.min(0.32, 0.1 + hard * 0.05); roll.sqv = 0; roll.sqx = horiz;
    roll.shake = Math.min(0.4, 0.06 + hard * 0.06);
    if (hard > 3.2) roll.ouchT = 0.5;
    const sx = Math.sign(rp.vx) * (horiz ? 0.75 : 0), sy = horiz ? 0 : rp.vy > 0 ? 0.65 : -0.45;
    const bits = MZ_BITS[mzStyle(Math.floor(rp.x / MZ_K), Math.floor(rp.y / MZ_K))] || MZ_BITS.ike;
    for (let i = 0; i < Math.min(9, 3 + Math.round(hard * 1.4)); i++) roll.dust.push({ x: rp.x - sx * 0.1 * (1 - i % 2) + sx, y: rp.y + sy, t: 0, s: 0.9 + Math.random() * 0.6, vx: (Math.random() - 0.5) * 2.2, c: bits[i % 3 ? 0 : 1], bit: true });
    hedgeSound(Math.min(1, hard / 4));
    if (navigator.vibrate) navigator.vibrate(Math.round(5 + hard * 2));
    return;
  }
  if (wet) {
    roll.sq = Math.min(0.18, 0.06 + hard * 0.03); roll.sqv = 0; roll.sqx = horiz;
    roll.wetT = 1.4; roll.shake = 0.12; roll.dirt = 0;
    const sx = Math.sign(rp.vx) * (horiz ? 0.35 : 0), sy = Math.sign(rp.vy) * (horiz ? 0 : 0.35);
    for (let i = 0; i < 7; i++) roll.dust.push({ x: rp.x + sx, y: rp.y + sy, t: 0, s: 0.6 + Math.random() * 0.6, vx: (Math.random() - 0.5) * 2.4, c: '150,200,240', bit: true });
    splashSound(Math.min(1, hard / 4));
    if (navigator.vibrate) navigator.vibrate(6);
    return;
  }
  roll.sq = Math.min(0.32, 0.1 + hard * 0.06); roll.sqv = 0; roll.sqx = horiz;
  roll.ouchT = 0.7;
  roll.shake = Math.min(1, 0.3 + hard * 0.15);
  kotoSound(Math.min(1, hard / 4), true);
  if (navigator.vibrate) navigator.vibrate(Math.round(8 + hard * 4));
}
function setRoll(on) {
  rollOn = !!on;
  try { localStorage.setItem('nsg_roll', rollOn ? '1' : '0'); } catch (e) {  }
  rp.x = null; for (const k in rk) rk[k] = 0;
  const b = $('pxRoll');
  if (b) { b.classList.toggle('on', rollOn); b.setAttribute('aria-pressed', String(rollOn)); }
}


const CAR_OK = new Set([C.R, C.H]);
let driving = false;
function setDriving(on, msg) {
  driving = !!on;
  const b = $('pxCar');
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

function checkCar() {
  if (!driving || worldMode || !G.me) return;
  const t = targetTile(), c = codeAt(Math.floor(t.x), Math.floor(t.y));
  if (c !== C.X && !CAR_OK.has(c)) setDriving(false, '🚶 道の外へ移動したので、車を降りました');
}
if ($('pxCar')) $('pxCar').addEventListener('click', toggleCar);

const PADDY_CODES = new Set([C.U, C.F]);
function onPaddy() {
  if (worldMode || driving || (!G.me && !G.demo)) return false;
  const t = targetTile(), x = Math.floor(t.x), y = Math.floor(t.y);
  return [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => PADDY_CODES.has(codeAt(x + dx, y + dy)));
}
function updateHarvestBtn() { const b = $('pxHarvest'), on = onPaddy(); if (b && b.hidden === on) b.hidden = !on; }
$('pxHarvest').addEventListener('click', () => { if (window.NISHIO_HARVEST && onPaddy()) NISHIO_HARVEST.open(); });





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

const HILL_CODES = new Set([C.K, C.M]);
function onHill() {
  if (worldMode || driving || (!G.me && !G.demo)) return false;
  const t = targetTile(), x = Math.floor(t.x), y = Math.floor(t.y);
  return [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => HILL_CODES.has(codeAt(x + dx, y + dy)));
}
function updateHiryoBtn() { const b = $('pxHiryo'), on = onHill(); if (b && b.hidden === on) b.hidden = !on; }
$('pxHiryo').addEventListener('click', () => { if (window.NISHIO_HIRYO && onHill()) NISHIO_HIRYO.open(); });


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


let snapKey = '', snapWorld = '';
function snapDemoStart() {
  if (!G.demo || !G.me || worldMode) return;
  const t = targetTile(), x = Math.floor(t.x), y = Math.floor(t.y), key = x + ',' + y, c = codeAt(x, y);
  if (key === snapKey || c === C.X) return;
  if (mazeOn() && mzType(Math.floor(t.x / MZ_K), Math.floor(t.y / MZ_K)) >= 0) return;
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

  if (!world) { snapKey = ''; if (worldState === 'none') buildWorld(); return; }
  const me = llToW(G.me.lat, G.me.lng), wx = Math.floor(me.x), wy = Math.floor(me.y);
  for (let r = 1; r < Math.max(WW, WH); r++) {
    let best = null, bd = Infinity;
    for (let j = wy - r; j <= wy + r; j++) for (let i = wx - r; i <= wx + r; i++) {
      if (Math.max(Math.abs(i - wx), Math.abs(j - wy)) !== r || i < 0 || j < 0 || i >= WW || j >= WH) continue;
      const wc = world[j * WW + i], d = Math.hypot(i - wx, j - wy);
      if (wc !== C.A && wc !== C.M && d < bd) { bd = d; best = [i, j]; }
    }
    if (best) {
      if (snapWorld === best.join(',')) return;
      snapWorld = best.join(',');
      const ll = wToLL(best[0] + 0.5, best[1] + 0.5); G.moveTo(ll.lat, ll.lng); return;
    }
  }
}







const CHEST_CELL = 50, PUBLIC_KINDS = new Set(['park', 'shrine', 'temple', 'castle', 'beach', 'view']);
let chests = [], chestKey = '', chestCells = new Map(), welcomeC = null;
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const seededRnd = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

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
    if (!G.spots.length) return null;
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

function updateChests() {
  if (!G.me) return;

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

  if (G.welcomeChest) {
    if (!welcomeC) {
      const sx = Math.floor(t.x), sy = Math.floor(t.y);
      for (const [dx, dy] of [[4, 1], [-4, 1], [1, 4], [1, -4]]) {
        const w = nearTile(sx + dx, sy + dy, 3, c => c === C.R || c === C.D);
        if (w === undefined) break;
        if (w) { const ll = toLatLng(w[0] + 0.5, w[1] + 0.5); welcomeC = { id: `${date}:welcome`, lat: ll.lat, lng: ll.lng, pts: 30, mode: 'play' }; break; }
      }
    }
    if (welcomeC) list.push(welcomeC);
  }
  const changed = list.length !== chests.length || list.some((c, n) => c.id !== chests[n].id);
  chests = list;
  if (changed) G.refreshNearby();
}
setInterval(updateChests, 2000);


function padStep(dir) {
  tapWalkStop();
  if (worldMode) setWorld(false);
  const ok = step(dir);
  if (!ok && navigator.vibrate) navigator.vibrate(20);
  return ok;
}

document.addEventListener('keydown', e => {
  const k = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
  if (k && active && G.demo && !meiroPause && !e.target.closest('input,textarea') && !document.body.classList.contains('jump-open')) { e.preventDefault(); if (rollOn && !driving) { if (worldMode) setWorld(false); rk[k] = 1; } else padStep(k); }
});


const AUTO_ROADS = new Set([C.R, C.H, C.D]);

function planPath(sx, sy, gx, gy, goalR, avoid) {
  const pad = mazeOn() ? 150 : 40, x0 = Math.min(sx, gx) - pad, y0 = Math.min(sy, gy) - pad, W = Math.abs(gx - sx) + pad * 2 + 1, H = Math.abs(gy - sy) + pad * 2 + 1;
  if (W * H > 700000) return [];
  const N = W * H, g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const hx = [], hf = [];
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
      if (mz ? mzBlocked(x + 0.5, y + 0.5, nx + 0.5, ny + 0.5) || avoid.has(nx + ',' + ny) : !isGoal && (c !== C.X && BLOCK.has(c) || avoid.has(nx + ',' + ny))) continue;
      const cost = c === C.X ? 4 : AUTO_ROADS.has(c) ? 1 : 1.6;
      if (g[i] + cost < g[j]) { g[j] = g[i] + cost; from[j] = i; push(j, g[j] + h(nx, ny)); }
    }
  }
  const out = [];
  for (let i = found >= 0 ? found : best; i !== start && i >= 0; i = from[i]) out.push([i % W + x0, (i / W | 0) + y0]);
  return out.reverse();
}


function fieldHit(x, y, spots = G.spots) {
  const r = cv.getBoundingClientRect(), dpr = cv.width / r.width, T = fieldT(Math.min(window.devicePixelRatio || 1, 3)), c = camTile();
  const ttx = Math.floor(c.x + (x - cv.width / 2) / T), tty = Math.floor(c.y + (y - fieldCy) / T + 0.25);
  const who = npcAt(ttx, tty) || npcAt(ttx, tty - 1);
  if (who) return { npc: who };
  const rt = rivalTile();
  if (rt && rt.x === ttx && (rt.y === tty || rt.y === tty - 1)) return { rival: true };
  let hit = null, best = Infinity;

  for (let i = giantHits.length - 1; i >= 0 && !hit; i--) {
    const [gx, gy, gs, s, img] = giantHits[i];
    if (x < gx || y < gy || x >= gx + gs || y >= gy + gs) continue;
    const ix = Math.floor((x - gx) / gs * img.width), iy = Math.floor((y - gy) / gs * img.height);
    if (img.getContext('2d').getImageData(ix, iy, 1, 1).data[3] > 0) hit = s;
  }
  if (!hit) for (const s of spots) {
    if (bigOf(s, false)) continue;
    const p = toTile(s.lat, s.lng);
    const sx = cv.width / 2 + (p.x - c.x) * T, sy = fieldCy + (p.y - c.y) * T;
    const half = bigSpotSize(s, spriteOf(s), T, null) / 2 + 4 * dpr, d = Math.hypot(x - sx, y - sy);
    if (Math.abs(x - sx) <= half && Math.abs(y - sy) <= half && d < best) { hit = s; best = d; }
  }
  if (hit) return { spot: hit };
  let bp = null;
  for (let i = poiHits.length - 1; i >= 0 && !bp; i--) {
    const [gx, gy, gs, p, img] = poiHits[i];
    if (x < gx || y < gy || x >= gx + gs || y >= gy + gs) continue;
    if (img.getContext('2d').getImageData(Math.floor((x - gx) / gs * img.width), Math.floor((y - gy) / gs * img.height), 1, 1).data[3] > 0) bp = p;
  }
  best = T * 1.2;
  if (!bp) for (const p of poiCache.list) { const d = Math.hypot(x - (cv.width / 2 + (p[0] - c.x) * T), y - (fieldCy + (p[1] - c.y) * T - T * 0.2)); if (d < best) { bp = p; best = d; } }
  return bp ? { poi: bp } : null;
}



const swipeS = { down: null, at: -Infinity, timer: null };
const SWIPE_MIN = 12;








const REST_MS = 300, REST_PX = 10;







const REST_EAT_MS = 700;
const restS = { pts: new Map(), timer: null, eatAt: -Infinity };
function restOthers(id) {
  const now = performance.now();
  for (const [k, p] of restS.pts) if (k !== id && (p.far > REST_PX || now - p.t < REST_MS)) return false;
  return true;
}
function restSync() {
  const now = performance.now();
  let rest = false, soon = Infinity;
  for (const p of restS.pts.values()) {
    if (p.far > REST_PX) continue;
    if (now - p.t >= REST_MS) rest = true; else soon = Math.min(soon, p.t + REST_MS - now);
  }
  const v = rest ? 'none' : '';
  if (cv.style.touchAction !== v) cv.style.touchAction = v;
  clearTimeout(restS.timer);
  restS.timer = soon < Infinity ? setTimeout(restSync, soon + 5) : null;
}
function swipeBegin(e, second) {
  clearTimeout(swipeS.timer);
  if (typeof tapRingStart === 'function') tapRingStart(e);
  swipeS.down = { id: e.pointerId, x: e.clientX, y: e.clientY, ax: e.clientX, ay: e.clientY, ex: e.clientX, ey: e.clientY, hx: 0, hy: 0, wx: 0, wy: 0, key: '', goal: null, second };
}
function swipeCancel() {
  const d = swipeS.down;
  clearTimeout(swipeS.timer);
  swipeS.down = null;
  if (typeof tapRing === 'object') tapRing.t0 = 0;
  if (d && d.second && d.goal && tapS.goal === d.goal) tapWalkStop();
}
function swipeEats(e) {
  return !!e && e.isTrusted !== false && performance.now() - restS.eatAt < REST_EAT_MS;
}
function restLift(e, cancelled) {
  const p = restS.pts.get(e.pointerId);
  if (!p) return;
  if (!cancelled) p.far = Math.max(p.far, Math.hypot(e.clientX - p.x, e.clientY - p.y));
  restS.pts.delete(e.pointerId);
  if (p.multi && !cancelled) restS.eatAt = performance.now();
  const d = swipeS.down;
  if (d && d.second && d.id !== e.pointerId && (cancelled || p.far > REST_PX)) swipeCancel();
  restSync();
}
function swipeReset() { swipeCancel(); restS.pts.clear(); restS.eatAt = -Infinity; restSync(); }



function fingerDown(e) {
  restS.eatAt = -Infinity;
  const map = e.target === cv, touch = e.pointerType === 'touch';
  if (touch) {
    if (e.isPrimary) restS.pts.clear();
    restS.pts.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), far: 0, multi: false, map });
    if (restS.pts.size > 1) for (const p of restS.pts.values()) p.multi = true;
  }
  const second = map && touch && !e.isPrimary && restS.pts.size === 2 && restOthers(e.pointerId);
  if (map && !worldMode && (e.isPrimary || second) && e.button === 0) swipeBegin(e, second);
  else if (map || touch) swipeCancel();
  if (touch) restSync();
}
document.addEventListener('pointerdown', fingerDown, { capture: true, passive: true });
document.addEventListener('pointermove', e => {
  const p = restS.pts.get(e.pointerId);
  if (!p || p.far > REST_PX) return;
  p.far = Math.max(p.far, Math.hypot(e.clientX - p.x, e.clientY - p.y));
  if (p.far <= REST_PX) return;
  restSync();
  const d = swipeS.down;
  if (d && d.second && d.id !== e.pointerId) swipeCancel();
}, { capture: true, passive: true });
document.addEventListener('pointerup', e => restLift(e, false), { capture: true, passive: true });
document.addEventListener('pointercancel', e => restLift(e, true), { capture: true, passive: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) swipeReset(); });
window.addEventListener('blur', swipeReset);
cv.addEventListener('pointerdown', e => { swipeS.at = -Infinity; }, { passive: true });
cv.addEventListener('pointercancel', () => swipeCancel(), { passive: true });
cv.addEventListener('pointerleave', e => { const d = swipeS.down; if (!d || e.pointerId === d.id) clearTimeout(swipeS.timer); }, { passive: true });
function swipeAt(cx, cy) {
  const r = cv.getBoundingClientRect(), dpr = cv.width / r.width, T = fieldT(Math.min(window.devicePixelRatio || 1, 3)), c = camTile();
  const x = (cx - r.left) * dpr, y = (cy - r.top) * dpr;
  return { x: c.x + (x - cv.width / 2) / T, y: c.y + (y - fieldCy) / T, k: dpr / T };
}
function swipeTile(cx, cy) {
  const p = swipeAt(cx, cy);
  return [Math.floor(p.x), Math.floor(p.y)];
}












const SWIPE_HOLD_MS = 300, SWIPE_HOLD_PX = 5;
const SWIPE_ON_PX = 24;
const swipeOn = (d, x, y) => !d.key || Math.hypot(x - d.hx, y - d.hy) >= SWIPE_ON_PX;
function swipeWalk(d, cx, cy) {
  const a = swipeAt(cx, cy), w = d.key ? { x: d.wx + (cx - d.hx) * a.k, y: d.wy + (cy - d.hy) * a.k } : a;
  const q = [Math.floor(w.x), Math.floor(w.y)], key = q[0] + ',' + q[1];
  if (key === d.key) return false;
  if (!tapWalk(q[0], q[1])) return false;
  d.key = key; d.hx = cx; d.hy = cy; d.wx = w.x; d.wy = w.y; d.goal = tapS.goal;
  return true;
}
function swipeHold() {
  const d = swipeS.down;
  if (!d || !swipeOn(d, d.ex, d.ey) || worldMode || !G.demo || driving || !howtoEl.hidden || mapCovered(false, true)) return;
  if (Math.hypot(d.ex - d.x, d.ey - d.y) < SWIPE_MIN) return;
  const r = cv.getBoundingClientRect();
  if (d.ex < r.left || d.ex > r.right || d.ey < r.top || d.ey > r.bottom) return;
  swipeWalk(d, d.ex, d.ey);
}
cv.addEventListener('pointermove', e => {
  const d = swipeS.down;
  if (!d || e.pointerId !== d.id) return;
  if (e.pointerType === 'mouse' && !e.buttons) { swipeCancel(); return; }
  d.ex = e.clientX; d.ey = e.clientY;
  if (typeof tapRing === 'object' && tapRing.t0 && tapRing.id === e.pointerId && Math.hypot(d.ex - d.x, d.ey - d.y) >= TAP_RING_MOVE) tapRing.t0 = 0;
  if (!swipeOn(d, d.ex, d.ey)) { clearTimeout(swipeS.timer); return; }
  if (Math.hypot(d.ex - d.ax, d.ey - d.ay) <= SWIPE_HOLD_PX) return;
  d.ax = d.ex; d.ay = d.ey;
  clearTimeout(swipeS.timer); swipeS.timer = setTimeout(swipeHold, SWIPE_HOLD_MS);
}, { passive: true });
cv.addEventListener('pointerup', e => {
  const d = swipeS.down;
  if (!d || e.pointerId !== d.id) return;
  clearTimeout(swipeS.timer);
  swipeS.down = null;
  if (worldMode || !G.demo || !howtoEl.hidden || mapCovered(false, true)) return;
  if (!d.key && Math.hypot(e.clientX - d.x, e.clientY - d.y) < SWIPE_MIN) {
    if (d.second) { cv.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY })); swipeS.at = performance.now(); }
    return;
  }
  swipeS.at = performance.now();
  if (d.key && Math.hypot(e.clientX - d.x, e.clientY - d.y) < SWIPE_MIN) return;
  if (!swipeOn(d, e.clientX, e.clientY)) return;
  swipeWalk(d, e.clientX, e.clientY);
}, { passive: true });

cv.addEventListener('click', e => {
  if (performance.now() - swipeS.at < 400) return;
  if (swipeEats(e)) return;

  const r = cv.getBoundingClientRect(), dpr = cv.width / r.width;
  if (mazeOn() && !worldMode && demoTapWalk(e.clientX, e.clientY)) return;
  if (mazeOn() && !worldMode) {
    const px = (e.clientX - r.left) * dpr, py = (e.clientY - r.top) * dpr, now = performance.now(), inR = q => q && px >= q[0] && px <= q[2] && py >= q[1] && py <= q[3];




    const pin = mzMap.pin, careful = firstWalk() || !!tapS.goal, gq = careful && mzGoalOnCanvas(r, dpr);


    const dPin = pin ? Math.hypot(px - pin[0], py - pin[1]) : Infinity, onPin = !!pin && dPin <= pin[2] && !(gq && Math.hypot(px - gq[0], py - gq[1]) <= dPin + pin[2] / 2);
    if (!careful || onPin) {
      if (inR(mzMap.arrow) && !arrowYields(px, py)) { if (!mzMap.tapped) { mzMap.tapped = true; try { localStorage.setItem('nsg_mz_arrow_tap', '1'); } catch (err) {  } } mzGoalWorld(); return; }
    }
  }
  if (!(worldMode && dragMoved)) {
    const px = (e.clientX - r.left) * dpr, py = (e.clientY - r.top) * dpr;
    const sh = shopHits.find(([a, b, c2, d]) => px >= a && px <= c2 && py >= b && py <= d);
    if (sh) { $('pxInfoBody').innerHTML = G.popupHtml(sh[4]); $('pxInfo').hidden = false; return; }
  }
  if (worldMode) {
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
  if (G.demo && rp.x !== null && !driving && howtoEl.hidden && nazoTap(x, y, performance.now())) return;
  if (G.demo && rp.x !== null && !driving && howtoEl.hidden && Math.hypot(x - (cv.width / 2 + heroScr.x), y - (fieldCy + heroScr.y)) < T * 0.8 && tsunTap(performance.now())) { demoMissTap(); return; }
  const h = fieldHit(x, y);
  if (h) {
    if (h.npc) openNpc(h.npc, true);
    else if (h.rival) rivalTalk();
    else { $('pxInfoBody').innerHTML = h.spot ? G.popupHtml(h.spot) : poiHtml(h.poi); $('pxInfo').hidden = false; }
    return;
  }


  if (!$('pxInfo').hidden && pxInfoReadOnly()) $('pxInfo').click();
  if (G.demo) tapWalk(Math.floor(c.x + (x - cv.width / 2) / T), Math.floor(c.y + (y - fieldCy) / T));
});
function mzGoalOnCanvas(r, dpr) {
  const p = mzRt.path, e = p && p[p.length - 1];
  if (!e) return null;
  const q = tileClient(e[0] * MZ_K + 1, e[1] * MZ_K + 1), x = (q.x - r.left) * dpr, y = (q.y - r.top) * dpr;
  return x >= 0 && x <= cv.width && y >= 0 && y <= cv.height ? [x, y] : null;
}



function arrowYields(px, py) {
  const pin = mzMap.pin, path = mzRt.path;
  if (!pin || !path || path.length < 2 || !G.demo || driving) return false;
  if (Math.hypot(px - pin[0], py - pin[1]) <= pin[2]) return false;
  const T = fieldT(Math.min(window.devicePixelRatio || 1, 3)), c = camTile();
  const cx = Math.floor(Math.floor(c.x + (px - cv.width / 2) / T) / MZ_K), cy = Math.floor(Math.floor(c.y + (py - fieldCy) / T) / MZ_K);
  return path.some((q, i) => i > 0 && q[0] === cx && q[1] === cy);
}





const DEMO_TAP_R = 24, DEMO_TAP_KEEP = 1500;
function demoTapWalk(cx, cy) {
  if (worldMode || !G.demo || driving || !howtoEl.hidden || rp.x === null) return false;
  let l = tapDemo.last && performance.now() - tapDemo.last.at <= DEMO_TAP_KEEP ? tapDemo.last : null;
  if (!l && !tapS.goal && mzRt.path && mzRt.path.length > 1) {
    const sp = tapDemoSpot(mzRt.path, tiltBtnWanted() && !tiltG.asked);
    if (sp) l = { x: sp.q.x, y: sp.q.y };
    if (sp && tiltBtnWanted() && !tiltG.asked) { const H = sp.big ? DEMO_HAND1 : DEMO_HAND; Object.assign(l, { hand: H.h + H.move + H.pad, hw: H.w, dn: !!sp.up }); }
  }




  const onHand = !!(l && l.hand) && (!tiltG.asked || (tiltAsk.at || -1e9) >= tapDemo.at)
    && Math.abs(cx - l.x) <= l.hw / 2 && (cy - l.y) * (l.dn ? -1 : 1) >= 0 && (cy - l.y) * (l.dn ? -1 : 1) <= l.hand && Math.hypot(cx - l.x, cy - l.y) > DEMO_SLOP_PX && !demoWinAt(cx, cy);
  if (!l || (!onHand && Math.hypot(cx - l.x, cy - l.y) > DEMO_TAP_R)) return false;
  if (!onHand && tapDemoWalks(l, DEMO_SLOP_PX)) return false;
  tapDemo.last = null;
  const q = swipeTile(l.x, l.y);
  return tapWalk(q[0], q[1]);
}






function mapCovered(soft, free) {
  return document.body.classList.contains('jump-open')
    || !!document.querySelector(`${free ? '' : '#pxInfo:not([hidden]), '}.panel:not([hidden]), #intro:not([hidden]), [role="dialog"]:not([hidden])${soft ? ':not(#a2hs)' : ''}`);
}
function tapWalkStop() { clearTimeout(tapS.timer); tapS.timer = null; tapS.path = []; tapS.goal = null; }

document.addEventListener('pointerdown', e => { if (tapS.goal && e.target !== cv) tapWalkStop(); }, true);





const TAP_STEP_MS = 180, TAP_STEP_MIN = 60;
function tapWalkTick() {
  tapS.timer = null;
  tapDemo.walkT = performance.now();
  const hs = typeof mzHitStop === 'number' && typeof mzGoalStop === 'object' && mzGoalStop.until === mzHitStop ? mzHitStop - tapDemo.walkT : 0;
  if (hs > 0 && tapS.path.length) { tapS.due = mzHitStop; tapS.timer = setTimeout(tapWalkTick, hs); return; }
  const nx = tapS.path.shift(), t = targetTile(), sx = Math.floor(t.x), sy = Math.floor(t.y);
  if (!nx || !G.demo || !active || worldMode || driving || mapCovered(false, true) || Math.abs(nx[0] - sx) + Math.abs(nx[1] - sy) !== 1) return tapWalkStop();
  if (!step(nx[0] > sx ? 'right' : nx[0] < sx ? 'left' : nx[1] > sy ? 'down' : 'up') || !tapS.path.length) return tapWalkStop();
  const now = performance.now(), gap = G.autoInterval ? Math.min(TAP_STEP_MS, G.autoInterval()) : TAP_STEP_MS;
  tapS.due = Math.max((tapS.due || now) + gap, now + Math.min(gap, TAP_STEP_MIN));
  tapS.timer = setTimeout(tapWalkTick, tapS.due - now);
}
function tapWalk(gx, gy) {
  G.notePlayInput();
  idleTouch();
  tapWalkStop();
  if (driving) { G.toast('🚗 車は スティックで うごかします'); return false; }
  const t = targetTile(), sx = Math.floor(t.x), sy = Math.floor(t.y);
  if (sx === gx && sy === gy) { if (typeof demoMissTap === 'function') demoMissTap(); return false; }
  const avoid = new Set((G.npcs || []).map(n => { const q = npcTile(n); return q.x + ',' + q.y; }));
  const path = planPath(sx, sy, gx, gy, mazeOn() ? (mzType(Math.floor(gx / MZ_K), Math.floor(gy / MZ_K)) === 1 ? 0 : 2) : BLOCK.has(codeAt(gx, gy)) ? 1 : 0, avoid);
  if (!path.length) { if (navigator.vibrate) navigator.vibrate(20); if (typeof demoMissTap === 'function') demoMissTap(); return false; }
  tapS.path = path; tapS.goal = path[path.length - 1]; tapS.due = performance.now();
  if (Math.hypot(tiltG.x, tiltG.y) < TAP_TILT_OVER) {
    rp.vx = rp.vy = 0;



    if (mzSoft.on) {
      const q = mzNear(rp.x, rp.y);
      if (q && q.d > MZ_TUBE) { const k = MZ_TUBE / q.d; rp.x = q.x + (rp.x - q.x) * k; rp.y = q.y + (rp.y - q.y) * k; }
    }
    mzSoft.on = false; mzSoft.vin = 0; mzSoft.pen = 0;
  }
  tapWalkTick();
  return true;
}






const pxInfoTap = { x: 0, y: 0, t: -1e9 };
const PXINFO_GAP = 24;
const pxInfoShift = { on: false, x: 0, y: 0, w: 0 };
function pxInfoPlace(why) {
  const el = $('pxInfo'), dq = el && el.querySelector('.dq');
  if (!el || !dq) return;
  if (el.hidden) { dq.style.marginTop = ''; pxInfoShift.on = false; return; }
  if (why !== 'resize' && performance.now() - pxInfoTap.t <= 800) Object.assign(pxInfoShift, { on: true, x: pxInfoTap.x, y: pxInfoTap.y, w: innerWidth });
  else if (why === 'resize' && pxInfoShift.on && innerWidth !== pxInfoShift.w) pxInfoShift.on = false;
  dq.style.marginTop = '';
  if (!pxInfoShift.on) return;
  const x = pxInfoShift.x, y = pxInfoShift.y, gap = PXINFO_GAP, d = dq.getBoundingClientRect();
  const near = [...dq.querySelectorAll('button, a')].some(b => { const q = b.getBoundingClientRect();
    return q.width > 0 && q.top < d.bottom && q.bottom > d.top && q.left < x + gap && q.right > x - gap && q.top < y + gap && q.bottom > y - gap; });
  if (!near) return;
  const sh = $('sheet'), sr = sh && sh.getBoundingClientRect(), r = el.getBoundingClientRect(), vv = window.visualViewport;
  const bottom = Math.min(r.bottom, innerHeight, sr && sr.height > 0 ? sr.top : Infinity, vv ? vv.offsetTop + vv.height : Infinity) - 8;
  const down = Math.min(y + gap - d.top, bottom - d.bottom);
  if (down > 0) dq.style.marginTop = Math.round(down) + 'px';
}
const pxInfoResize = { raf: 0 };
function pxInfoReplace() {
  if (pxInfoResize.raf || !$('pxInfo') || $('pxInfo').hidden) return;
  pxInfoResize.raf = requestAnimationFrame(() => { pxInfoResize.raf = 0; pxInfoPlace('resize'); });
}




const pxInfoEdit = { t: -1e9 };
document.addEventListener('pointerdown', e => { const a = document.activeElement; if (e.target === cv && a && $('pxInfo').contains(a) && a.matches('input, textarea, select, [contenteditable]')) pxInfoEdit.t = performance.now(); }, true);
function pxInfoReadOnly() {
  const b = $('pxInfoBody');
  if (!b || npcSend) return false;
  if (b.querySelector('.pick-first, [data-pick-dot]')) return false;
  if (performance.now() - pxInfoEdit.t < 1500) return false;
  return ![...$('pxInfo').querySelectorAll('input, textarea')].some(f => (f.type === 'checkbox' || f.type === 'radio') ? f.checked !== f.defaultChecked : f.type !== 'hidden' && f.value !== '');
}
document.addEventListener('click', e => { if (e.target === cv) { pxInfoTap.x = e.clientX; pxInfoTap.y = e.clientY; pxInfoTap.t = performance.now(); } }, true);
if (window.MutationObserver && $('pxInfo')) new MutationObserver(() => pxInfoPlace()).observe($('pxInfo'), { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });
window.addEventListener('resize', pxInfoReplace);
if (window.visualViewport) visualViewport.addEventListener('resize', pxInfoReplace);
if (window.ResizeObserver) { const ro = new ResizeObserver(pxInfoReplace); if ($('sheet')) ro.observe($('sheet')); if ($('pxInfo')) ro.observe($('pxInfo')); }
$('pxInfo').addEventListener('click', e => {
  if (e.target === $('pxInfo') || e.target.closest('[data-close]') || e.target.closest('[data-move]')) {
    $('pxInfo').hidden = true;
    if (mzArrive.call && !sight.n) { G.callNpc(null); mzArrive.call = ''; }
  }
});

G.onModeChange(updatePad);
G.onModeChange(() => { if (driving) setDriving(false); });

let initial = 'px', worldOn = '1';
try { initial = 'px'; worldOn = localStorage.getItem('nsg_world_on') ?? '1'; } catch (e) {  }

let backPlayer = false;
try { backPlayer = !!store.get('nsg_started') && store.get('nsg_mode') === 'demo'; } catch (e) {  }
if (initial === 'px') { setActive(true); if (worldOn === '1' && !backPlayer) setWorld(true); }



const meiroApi = {
  C, CHUNK, codeAt, paintRegion, ensureChunk, chunkState,
  toTile, toLatLng, spriteOf: sp => spriteOf(sp)[0],
  hedgeStyleAt: (tx, ty) => mzStyle(Math.floor(tx / MZ_K), Math.floor(ty / MZ_K)), hedgePat: (x, ox, oy, tile, style) => mzHedgePat(x, ox, oy, tile, style),
  forgetChunk(cx, cy) { const k = cx + '_' + cy, c = chunks.get(k); if (c && c.state === 'fail') chunks.delete(k); },
  slopeAt: (x, y) => slopeAt(x, y), get demGen() { return demGen; },
  tilt: () => tiltG, tiltAsk, tiltReset, tiltNeedsPermission, koto: (v, low) => kotoSound(v, low), splash: v => splashSound(v), boing: (v, hi) => boingSound(v, hi), rumble: v => rumbleTick(v, GROUND.road),
  pause(on) { meiroPause = !!on; dirty = true; if (on && mzNext.hold) { mzNext.hold = false; if (G.toastFlush) G.toastFlush(); } },
};
window.nishioPixel = { get houseCut() { return houseCut; }, giantWashLayout, drawGiantWash, seimaiLayout, drawShopSeimai, riceJourneyLayout, drawRiceJourney, blinkOn, BLINK_MS, BLINK_SHUT_MS, get riceEye() { return riceEyeAt; }, grow: { stage: () => grow.stage, stageFor: growStageFor, TH: GROW_TH, popAt: () => grow.popT }, firstRoute: { shape: mzPathShape, simple: mzFirstSimple, LIM: MZ_FIRST_SIMPLE }, firstBest: mzFirstBest, get goalArrowRect() { return mzMap.arrow ? mzMap.arrow.slice(0, 4) : null; }, get goalArrowPin() { return mzMap.arrow && mzMap.pin ? mzMap.pin.slice(0, 3) : null; }, feel: { speed: feelSpeed, spring: squashSpring, V_MAX: FEEL_V_MAX, SQ_MAX }, fix206: { tapTiltOver: TAP_TILT_OVER, demoMove: DEMO_MOVE, demoTapR: DEMO_TAP_R, restMs: REST_MS, restPx: REST_PX, swipeOnPx: SWIPE_ON_PX, tiltKeepDeg: TILT_KEEP_DEG }, collected: { has: collectedOf }, roadShape: { of: roadShapeOf, corner: roadShapeCorner, missing: roadShapeMissing, end: roadShapeEndDir, straight: roadShapeStraightDir }, glanceShift, asleepShut, happyFace, meiroApi, heroGiant: () => heroGiantId, pickHeroGiant, HERO_GIANT_RANGE, maze: { half: () => ({ cell: mzHalf.cell ? [...mzHalf.cell] : null, passed: !!mzHalf.passed }), halfCell: mzHalfCell, halfPassed: mzHalfPassed, HALF_MIN: MZ_HALF_MIN, goalFxSpec: () => ({ ...MZ_GOAL_FX }), wallTheme: () => mzWallTheme(), on: () => mazeOn(), playing: () => active && mazeOn(), next: () => ({ want: mzNext.want, t0: mzNext.t0, on: mzNextOn(), labHide: !!mzNext.labHide, arrowDim: !!mzNext.arrowDim, box: mzNext.box || null }), goal: id => {
    mzGoalAsk.id = '';
    if (!mazeOn()) return null;
    const now = performance.now(), pv = mzRt.prev, g = mzRt.gid === id ? { t0: mzRt.t0, len0: mzRt.len0, warp: mzRt.warp, moves: mzMv.n, run: { ...mzRt.run } } : pv && pv.id === id && now - pv.at < 120000 ? pv : null;
    if (!g || !g.t0) return null;
    mzGoalAsk.id = id; mzGoalAsk.at = now;
    const sec = g.sec !== undefined ? g.sec : (now - g.t0) / 1000;
    return { sec, m: Math.max(0, g.len0 - 1) * MZ_K * TILE_M, run: g.run || null, warp: !!g.warp };
  }, goalFx: text => mzGoalFx(text), fxKinds: () => mzFx.map(p => p.k), route: () => (mazeOn() && mzRt.path ? { cells: mzRt.path.length - 1, m: (mzRt.path.length - 1) * MZ_K * TILE_M } : null), get banner() { return mzBanner.t0 ? mzBanner.text : ''; }, bannerArt: () => mzBanner.gid || '', arrive: () => ({ done: mzArrive.done, covered: mapCovered(), howto: !howtoEl.hidden, sight: sightBusy(), soon: !!(G.rewardSoon && G.rewardSoon()), g: G.guide && { kind: G.guide.kind, id: G.guide.id, d: G.me ? Math.round(G.dist(G.me, G.guide)) : null, r: G.guideRadius(G.guide) }, t0: mzRt.t0 }), prevAge: ms => { if (mzRt.prev) mzRt.prev.at -= ms; return !!mzRt.prev; }, routePath: () => (mazeOn() && mzRt.path ? mzRt.path.map(p => [p[0], p[1]]) : null), hint: () => { mzRt.showUntil = performance.now() + 6000; }, lost: () => { mzRt.bestT -= 26000; mzRt.showUntil = 0; }, help: () => ({ on: mzHelpOn(), dots: mzHelp.dots, dead: mzHelp.dead, goals: mzGoalsDone(), told: mzHelp.told, helpToast: !!mzHelp.helpToast, banner: !!(mzNext.want || mzNext.t0) }), helpReset: () => { mzHelp.told = false; mzHelp.helpToast = false; }, crows: () => ({ on: mzCrowOn(), hits: mzCrow.hits, shoo: mzCrow.shoo, list: mzCrow.list.map(c => ({ cx: c.cx, cy: c.cy, nx: c.nx, ny: c.ny, t: c.t, chase: c.chase, scared: !!c.scared })) }), scare: () => ({ on: mzScare.on, cx: mzScare.cx, cy: mzScare.cy, left: Math.max(0, mzScare.until - performance.now()), got: mzScare.got }), mvSim: (n0, cells, dt) => { const m = { n: 0, cell: '', prev: '', t: 0, undo: false, x: 0, y: 0 }; let t = 0; for (const c of cells) { if (c === 'R') { mzMvReset(m); continue; } mzMvStep(m, c[0], c[1], t); t += dt; if (m.n === 1 && n0) m.n = n0; } return m.n; }, scarePut: (cx, cy) => { Object.assign(mzScare, { cx, cy, on: true, until: 0, t0: performance.now() }); }, crowPut: (cx, cy) => { mzCrow.list = []; mzCrow.list.push({ id: ++mzCrow.seq, cx, cy, nx: cx, ny: cy, t: 0, dx: 0, dy: 0, chase: false }); mzCrow.hitT = 0; }, open: (cx, cy, dx, dy) => mzOpen(cx, cy, dx, dy), type: (cx, cy) => mzType(cx, cy), spot: (cx, cy) => mzSpotCell(cx, cy), trail: () => [...mzTrail.keys()], mini: () => mzMiniState(), tiles: () => ({ n: mzTiles.size, size: MZ_TILE_N, list: [...mzTiles.values()].map(t => [t[0], t[1]]) }), miniPut: (cx, cy) => { mzMini.seen.set(cx + ',' + cy, '#ffd84a'); }, get mapArrow() { return mzMap.arrow; }, get arrowAt() { return mzMap.pin || null; }, get goalLab() { return mzMap.goalLab || null; }, get worldGoal() { return worldMode ? mzMap.worldGoal || null : null; }, hudRects: () => mzHudRects(-1e9), clock: () => (mazeOn() && mzRt.t0 && mzRt.len0 ? { sec: (performance.now() - mzRt.t0) / 1000 } : null), padsNear: (r = 12) => { const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K), out = []; for (let y = b - r; y <= b + r; y++) for (let x = a - r; x <= a + r; x++) { const d = mzPadAt(x, y); if (d >= 0) out.push([x, y, d]); } return out; }, get padHits() { return mzPad.hits; }, get padChain() { return { n: mzPad.chain, best: mzPad.best }; }, linesNear: () => { const out = []; mzLinesNear(L => out.push({ dots: L.dots.map(d => [...d]), left: L.taken.filter(t => !t).length })); return out; }, get dots() { return { n: mzDots.d === jstDay() ? mzDots.n : 0, lines: mzDots.lines }; }, meibutsuTip: () => mzMeibutsuTip(), pebPct: () => { const a = rp.x === null ? null : mzAreas.get(Math.floor(rp.x / MZ_K / MZ_R) + '_' + Math.floor(rp.y / MZ_K / MZ_R)); return a ? { pct: mzPebPct(a), ...mzPebStat(a) } : null; }, pebsNear: (r = 12) => { const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K), out = []; for (let y = b - r; y <= b + r; y++) for (let x = a - r; x <= a + r; x++) if (mzPebOk(mzAreas.get(Math.floor(x / MZ_R) + '_' + Math.floor(y / MZ_R)), x, y)) out.push([x, y]); return out; }, grainsNear: (r = 12) => { const a = Math.floor(rp.x / MZ_K), b = Math.floor(rp.y / MZ_K), out = []; for (let y = b - r; y <= b + r; y++) for (let x = a - r; x <= a + r; x++) if (mzType(x, y) === 1 && mzGrainAt(x, y)) out.push([x, y]); return out; }, K: MZ_K, clockS: MZ_CLOCK_PX, tapK: MZ_TAP_K, get arrowTapped() { return mzMap.tapped; }, near: (x, y) => mzNear(x, y), gates: () => [...mzGate.keys()], gatesUsed: () => [...mzGateUsed], gateWalk: (p, a, b) => mzGateWalk(p, a, b), zoneTint: (cx, cy) => { const a = mzArea(cx, cy); return a ? mzZoneTint(a) : null; }, style: (cx, cy) => mzStyle(cx, cy), soft: () => ({ ...mzSoft }), chase: () => ({ at: mzChase.cx < 0 ? null : [mzChase.cx, mzChase.cy], start: mzChase.sx < 0 ? null : [mzChase.sx, mzChase.sy], caught: mzChase.caught, dist: mzChase.dist, won: mzChaseWon }), chaseGoal: id => mzChaseGoal(id), torch: () => mzTorchState(), brigade: () => mzBrigadeState(), purify: () => mzPurifyState(), rescue: () => mzRescueState(), cube: () => ({ got: mzCube.got, at: mzCube.cx < 0 ? null : [mzCube.cx, mzCube.cy], start: mzCube.sx < 0 ? null : [mzCube.sx, mzCube.sy], done: !!mzCube.doneAt, big: !!mzCube.doneAt && performance.now() - mzCube.doneAt < MZ_CUBE.bigMs }), cubeReveal: () => mzCubeReveal(), rescueGoal: id => mzRescueGoal(id), energyCharge: () => mzEnergyCharge(), torchFlame: () => mzTorchFlameScale(), torchLit: () => mzTorchLit(), energy: () => ({ steps: mzEnergy.steps, need: MZ_ENERGY.need, bursts: mzEnergy.bursts, burstT0: mzEnergy.burstT0, lastCx: mzEnergy.lastCx, lastCy: mzEnergy.lastCy }), fruit: () => ({ left: mzFruit.left, at: mzFruit.cx < 0 ? null : [mzFruit.cx, mzFruit.cy], start: mzFruit.sx < 0 ? null : [mzFruit.sx, mzFruit.sy] }), piece: () => ({ got: mzPiece.got, at: mzPiece.cx < 0 ? null : [mzPiece.cx, mzPiece.cy], start: mzPiece.sx < 0 ? null : [mzPiece.sx, mzPiece.sy], done: !!mzPiece.doneAt }), view: () => ({ done: mzView.done, at: mzView.cx < 0 ? null : [mzView.cx, mzView.cy], start: mzView.sx < 0 ? null : [mzView.sx, mzView.sy], clear: mzViewClear(performance.now()) }), spring: () => ({ ...mzSpring, left: Math.max(0, mzSpring.until - performance.now()) }), springPut: (cx, cy) => { Object.assign(mzSpring, { cx, cy, on: true, t0: performance.now() }); }, springOn: (ms = MZ_SPRING_MS) => { mzSpring.until = performance.now() + ms; }, springBoing: () => mzSpringChain(performance.now()), area: (cx, cy) => mzArea0(cx, cy), critters: () => mzCritDrawn.slice(), critFled: () => mzCritFled.size, critHi: () => mzCritHiN, critMode: () => mzCritMode, say: () => ({ t: '', on: false, log: [] }), sayNow: (t, ms) => riceSay(t, ms, 'happy') }, townBanner: name => { here.banner = name; here.bannerAt = performance.now(); here.box = null; here.waited = 0; here.lastT = 0; }, get riceBox() { return roll.box || null; }, get townWait() { return here.waited || 0; }, set townWait(v) { here.waited = v; }, get townBox() { return here.banner && here.box || null; }, get townDodged() { return !!(here.banner && here.dodged); }, get toastDodgeOff() { return toastDodgeOff; }, set toastDodgeOff(v) { toastDodgeOff = !!v; wtd.key = ''; }, critterSprite: id => critterSprites[id], waterKind, critterStep, suzume: { get list() { return suzume.list.map(b => ({ x: b.x, y: b.y, fly: !!b.fly })); }, put: (x, y) => { suzume.list.length = 0; suzume.next = performance.now() + 6e4; suzumeSpawn(x, y, performance.now() - 1000); }, clear: () => { suzume.list.length = 0; suzume.next = performance.now() + 6e4; }, NEAR: SUZUME_NEAR, visit: () => suzumeVisit(performance.now()), VISIT: SUZUME_VISIT }, neko: { get cat() { const n = neko.cat; return n && { x: n.x, y: n.y, awake: performance.now() - n.awake < NEKO_AWAKE }; }, put: (x, y) => { neko.next = performance.now() + 6e4; neko.cat = { x: x + 0.5, y: y + 0.6, t0: performance.now(), awake: 0, dir: 1, col: NEKO_COLS[0] }; }, clear: () => { neko.cat = null; neko.next = performance.now() + 6e4; }, NEAR: NEKO_NEAR }, deai: { get d() { const d = deai.d; return d && { id: d.id, x: d.x, y: d.y }; }, put: (x, y, id) => { const now = performance.now(); deai.next = now + 6e5; deai.d = { id: id || 'medaka', x, y, t0: now }; }, clear: () => { deai.d = null; deai.next = performance.now() + 6e5; }, get drawn() { return deai.drawn; } }, nakama: { get n() { const n = nakama.n; return n && { kind: n.kind, x: n.x, y: n.y, stop: !!n.stop }; }, kind: () => nakamaKind(), kinds: () => nakamaKinds(), put: (x, y, k) => { const now = performance.now(); nakama.next = now + 6e4; nakama.n = { kind: k || nakamaKind() || 'nasu', x, y, t0: now, last: now, ang: 0, stop: 0 }; }, clear: () => { nakama.n = null; nakama.next = performance.now() + 6e4; }, FOLLOW: NAKAMA_FOLLOW }, kaeru: { get list() { return kaeru.list.map(f => ({ x: f.x, y: f.y, jump: !!f.jump })); }, season: () => kaeruSeason(), put: (x, y) => { const now = performance.now(); kaeru.next = now + 6e4; kaeru.list = [{ x: x + 0.5, y: y + 0.5, t0: now, jump: 0, dir: 1, into: [1, 0], seed: 0 }]; }, clear: () => { kaeru.list.length = 0; kaeru.next = performance.now() + 6e4; }, NEAR: KAERU_NEAR }, mushi: { get m() { const m = mushi.m; return m && { kind: m.kind, x: m.x, y: m.y, flee: !!m.flee }; }, kind: () => mushiKind(), put: (x, y, k) => { const now = performance.now(); mushi.next = now + 6e4; mushi.m = { kind: k || mushiKind() || 'tonbo', x, y, vx: 0, vy: 0, t0: now, last: now, flee: 0, rest: 0, ph: 0 }; }, clear: () => { mushi.m = null; mushi.next = performance.now() + 6e4; }, NEAR: MUSHI_NEAR }, floats: () => floaters.map(f => f.t), floatText, get floatsDrawn() { return floatDrawn.slice(); }, get floatPx() { return floatPx; }, get floatShift() { return floatShift.slice(); }, riceFace: () => { const f = riceBall.faces || {}, sm = f.smile; let shine = 0; if (sm) { const d = sm.getContext('2d').getImageData(0, 0, sm.width, sm.height).data; for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255) shine++; } return { keys: Object.keys(f), shine }; }, breathAt: now => riceBreath(now), get bfly() { return { phase: bfly.phase, drawn: bfly.drawn, calm: calmMotion, smooth: bfly.smooth, at: bfly.at, kind: bfly.kind || '', season: mushiKind() }; }, setIdle: v => { roll.idle = v; }, riceWake, get zzz() { return { n: zzz.n, at: zzz.at }; }, get drop() { return { n: drop.n, at: drop.at }; }, setWet: v => { roll.wetT = v; }, get wakeT() { return roll.wakeT || 0; }, setGb: v => { gbOn = !!v; dirty = true; }, bflyIn, riceLast: () => { const L = riceBall.last; if (!L) return null; const d = riceBall.x.getImageData(0, 0, L.S, L.S).data; let soft = 0, solid = 0, tones = new Set(); for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 0 && d[i + 3] < 255) soft++; else if (d[i + 3] === 255) { solid++; tones.add(d[i] >> 1); } } let ring = 0; for (let i = 0; i < L.S; i++) for (const [x, y] of [[i, 0], [i, L.S - 1], [0, i], [L.S - 1, i]]) ring = Math.max(ring, d[(y * L.S + x) * 4 + 3]); return { ...L, soft, solid, tones: tones.size, ring }; }, moodAt: idle => { const k = roll.kind, id = roll.idle, hv = [roll.happyT, roll.ouchT, roll.dizzyT, roll.v, roll.h, roll.wetT]; Object.assign(roll, { kind: 'stop', idle, happyT: 0, ouchT: 0, dizzyT: 0, v: 0, h: 0, wetT: 0 }); const m = riceMood(1000); roll.kind = k; roll.idle = id; [roll.happyT, roll.ouchT, roll.dizzyT, roll.v, roll.h, roll.wetT] = hv; return m; }, FLOAT_PX, floatAts: () => floaters.map(f => Math.round(f.at - performance.now())), floatsClear: () => { floaters.length = 0; floatLast = -1e9; }, get critterState() { return critterS; }, alleyEnd, get combo() { return { n: combo.n, best: combo.best, beat: combo.beat, pop: combo.pop || 0 }; }, comboBest: v => { combo.best = v; combo.near = 0; }, comboAdd: k => { combo.n += k; combo.quietT = 0; comboStep(); }, get speedK() { return speedFx.k; }, get roll() { return { on: rollOn, x: rp.x, y: rp.y, vx: rp.vx, vy: rp.vy, d: roll.d, ready: riceSprites.ready, up: riceSprites.ready || !!riceSprites.failed, kind: roll.kind, av: roll.av, look: roll.look, hv: roll.hv, jumps: roll.jumps, sends: roll.sends, dirt: roll.dirt, mood: riceMood(performance.now()), drawn: roll.drawn, flat: roll.flat, round: !!riceBall.cv, v: roll.v, idle: roll.idle, by: roll.by, spin: roll.spin, pitch: roll.pitch, h: roll.h, sq: roll.sq, slope: rp.x === null ? null : slopeAt(rp.x, rp.y), height: rp.x === null ? null : heightAt(rp.x, rp.y), ground: Object.keys(GROUND).find(k => GROUND[k] === roll.gnd) || "" }; }, blockedAt: (x, y) => rollBlocked(x, y), rollPut: (x, y, vx = 0, vy = 0) => { const ll = toLatLng(x, y); G.moveTo(ll.lat, ll.lng, 'step'); Object.assign(rp, { x, y, vx, vy, sent: { x, y }, sentAt: performance.now(), tile: `${Math.floor(x)},${Math.floor(y)}` }); },
  slopeAt: (x, y) => slopeAt(x, y),
  idleRoll: () => ({ on: idleRoll.on, key: idleRoll.key, sec: (performance.now() - idleRoll.last) / 1000 }),
  bloom: () => rollBloom.list.map(p => ({ x: p.x, y: p.y, t: p.t, n: p.n, fo: p.fo == null ? null : p.fo })), rollBlockedFrom: (fx, fy, x, y) => (mazeOn() ? mzBlocked(fx, fy, x, y) : rollBlocked(x, y)), chaHana: () => chaHanaOn(), koroArt: () => koroReady(), ambN: () => ambN(), AMB_MAX, ambFirstRetry, AMB_FIRST_MS, kabuse: { on: t => kabuseOn(t), paint: (T = 32) => { const c = document.createElement('canvas'); c.width = c.height = T; const keep = ctx; ctx = c.getContext('2d'); try { drawKabuse(0, 0, 0, 0, T); } finally { ctx = keep; } const d = c.getContext('2d').getImageData(0, 0, T, T).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 100) n++; return n; } }, morning: { get k() { return morning.k; }, level: t => morningLevel(t), force: v => { morningForce = v; dirty = true; } }, sentaku: { get n() { return sentaku.n; }, on: wx => sentakuOn(wx), paint: (T = 32) => { const c = document.createElement('canvas'); c.width = c.height = T; const keep = ctx; ctx = c.getContext('2d'); try { drawSentaku(0, 0, Math.max(1, Math.round(T / 16)), 0, 0); } finally { ctx = keep; } const d = c.getContext('2d').getImageData(0, 0, T, T).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; } }, donguri: { get d() { const d = donguri.d; return d && { x: d.x, y: d.y, v: Math.hypot(d.vx, d.vy) }; }, season: () => donguriSeason(), put: (x, y, vx = 1.4, vy = 0) => { const now = performance.now(); donguri.next = now + 6e4; donguri.d = { x, y, vx, vy, t0: now, last: now, ang: 0 }; }, clear: () => { donguri.d = null; donguri.next = performance.now() + 6e4; }, ready: () => { donguri.next = 0; }, blocked: (x, y) => donBlocked(x, y), LIFE: DONGURI_LIFE }, hamon: { get list() { return hamon.list.map(r => ({ x: r.x, y: r.y })); }, put: (x, y) => { hamon.list.push({ x, y, t0: performance.now() }); }, clear: () => { hamon.list.length = 0; }, MS: HAMON_MS }, nightForce: v => { nightForce = v; dirty = true; }, get nightLamps() { return { ...nightLamps }; }, chaHanaPaint: (tx, ty, T = 32) => { const c = document.createElement('canvas'); c.width = c.height = T; const keep = ctx; ctx = c.getContext('2d'); try { drawChaHana(tx, ty, 0, 0, T); } finally { ctx = keep; } const d = c.getContext('2d').getImageData(0, 0, T, T).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] > 240 && d[i + 2] > 230) n++; return n; }, tileAt: (x, y) => codeAt(Math.floor(x), Math.floor(y)), wet: () => roll.wetT, riceStreak, drawRice: (dst, X, Y, th, sq = 0, mood = 'smile', dirt = 0, dirtCol = '', u = 1, pitch = 0) => { if (!riceBall.cv) return false; drawRiceBall(X, Y, u, th, 1 + sq, 1 - sq, 0, dst, false, mood, 0, dirt, dirtCol, pitch); return true; }, setRoll, setHeightFn: fn => { heightFn = fn || null; }, mapCovered, sightBusy, sightCheck, sightForget: id => { sight.seen.delete(id); },
  UNREAD_BG, UNREAD_DOT,
  nightStartK, get nightK() { return nightK !== null ? nightK : nightStartK(performance.now()); },

  get hereFresh() { return active && !worldMode && !!G.me && performance.now() - here.at < 2000; }, spotSprites, spriteOf: sp => spriteOf(sp)[0], npcSprite: look => (npcSprites[look] || npcSprites.man)[0], art: { hiCanvas, shopCanvas, tileRoof, spanRows, pix, genSprite, GEN_DRAW }, get towns() { return towns; }, get here() { return here; }, npcTile, rasterize, chunkQuery, chunkBox, chunkInPlay, luReady, luAt, unrle, overpass, toTile, toLatLng, codeAt, rawAt, C, CHUNK, chunks, setActive, centerOnMe, demFor, get worldMode() { return worldMode; }, merc, buildWorld, setWorld, llToW, WORLD_KEY, WW, WH, get world() { return world; }, get worldPois() { return worldPois; }, get worldLabels() { return worldLabels; }, get pois() { return poiCache.list; }, BUILDING_ART, get worldState() { return worldState; }, get areaBoxes() { return areaBoxes; }, get shopHits() { return shopHits; }, get chests() { return chests; }, get traffic() { return traffic; }, get driving() { return driving; }, toggleCar, floatText, onPaddy, get tapGoal() { return tapS.goal; }, swipeHoldCfg: { ms: SWIPE_HOLD_MS, px: SWIPE_HOLD_PX, min: SWIPE_MIN }, tapStepCfg: { ms: TAP_STEP_MS, min: TAP_STEP_MIN }, trailWalk, trailHas, trailClear, get trailCells() { return TRAIL.world.size; }, get trailWorld() { return [...TRAIL.world]; },
  demoHitAt: (cx, cy) => demoWinAt(cx, cy),
  tileToClient: tileClient, get tapDemo() { return { on: !!tapDemo.el && !tapDemo.el.hidden, world: !!tapDemo.world, worldMs: DEMO_WORLD_MS, n: tapDemo.n, first: !!tapDemo.el && tapDemo.el.classList.contains('first'), side: tapDemo.side, up: tapDemo.up, walked: tapDemo.walked, tapMs: DEMO_TAP_MS, missT: tapDemo.missT || 0, ahead: DEMO_AHEAD, walks: (q, slop = 0) => tapDemoWalks(q, slop), spot: (first = false) => (mzRt.path && mzRt.path.length > 1 ? tapDemoSpot(mzRt.path, first) : null), phone: !!tapDemo.ph && !tapDemo.ph.hidden, idleMs: DEMO_IDLE_MS, fresh: !!tapDemo.fresh, wait: [!active && 'active', rp.x === null && 'rice', !mazeOn() && 'maze', !howtoEl.hidden && 'howto', mapCovered() && 'covered', !!tapS.goal && 'walking', !(mzRt.path && mzRt.path.length > 1) && 'route'].filter(Boolean) }; }, tiltBtnCfg: TILT_BTN, ensureAround(lat, lng) { const q = toTile(lat, lng); ensureChunk(Math.floor(q.x / CHUNK), Math.floor(q.y / CHUNK)); } };
window.nishioPixel.routeOf = () => (mazeOn() && mzRt.path ? mzRt.gid || '' : '');
window.nishioPixel.riceTapUp = () => roll.tapUp || 0;
{ const rollGet = Object.getOwnPropertyDescriptor(window.nishioPixel, 'roll').get; Object.defineProperty(window.nishioPixel, 'roll', { configurable: true, enumerable: true, get() { const r = rollGet(), ra = rp.x === null ? '' : rollAreaAt(rp.x, rp.y), RSg = window.nishioRollSync; return { ...r, area: ra, feel: RSg && RSg.groundFeel ? RSg.groundFeel(ra) : { crr: 1, lin: 1 }, fps: fpsMeter.fps, shadow: RSg && RSg.shadowStretch ? RSg.shadowStretch(r.v) : 1 }; } }); }
})();
