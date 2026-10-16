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
// G草原 F田んぼ T町 W森 P公園 A水 S砂浜 B建物 R道 H大きな道 L線路 D小道 X未読込 M山 K丘 E茶畑 V畑 I工場 J境内 Y墓地 N温室 U農地（作物不明）
const C = { G: 0, F: 1, T: 2, W: 3, P: 4, A: 5, S: 6, B: 7, R: 8, H: 9, L: 10, D: 11, X: 12, M: 13, K: 14, E: 15, V: 16, I: 17, J: 18, Y: 19, N: 20, U: 21 };
const UNSET = 255;
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
  fire: '🚒 消防署', post: '〒 郵便局', shop: '🛒 お店', station: '🚉 駅' };
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
  for (let i = 0; i < g.length; i++) if (g[i] === UNSET) g[i] = C.G;
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
  if (!store.set(PX_KEY + k, { t: Date.now(), d: encode(g), p: g.pois || [], days })) {
    // 保存領域がいっぱいなら古い区画から消してもう一度
    while (idx.length > 1) { store.del(PX_KEY + idx.shift()); if (store.set(PX_KEY + k, { t: Date.now(), d: encode(g), p: g.pois || [], days })) break; }
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

function ensureChunk(cx, cy) {
  const k = cx + '_' + cy;
  const c = chunks.get(k);
  if (c && !(c.state === 'fail' && Date.now() - c.t > 60000)) return;
  const b = chunkBox(cx, cy);
  if (b.n < nb[0][0] - 0.01 || b.s > nb[1][0] + 0.01 || b.e < nb[0][1] - 0.01 || b.w > nb[1][1] + 0.01) {
    chunks.set(k, { state: 'out' }); return;
  }
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
        chunks.set(k, { state: 'ok', g: pre, pois: pre.pois });
        dirty = true;
        continue;
      }
      // 2) 用意した区画がなければ、前にブラウザで作って端末に保存した区画
      const saved = store.get(PX_KEY + k);
      if (saved && saved.d && saved.d.length === CHUNK * CHUNK && Date.now() - saved.t < (saved.days || PX_DAYS) * 864e5) {
        chunks.set(k, { state: 'ok', g: dec(saved.d), pois: saved.p || [] });
        dirty = true;
        continue;
      }
      // 3) それもなければ、ブラウザで地図データと標高を取って作る
      try {
        // 地図データと標高を同時に取得（標高が取れなくても地図は作る）
        const [json, dem] = await Promise.all([overpass(chunkQuery(chunkBox(cx, cy))), demFor(cx, cy).catch(() => null)]);
        const g = rasterize(json.elements || [], cx, cy, dem && dem.h);
        chunks.set(k, { state: 'ok', g, pois: g.pois || [] });
        saveChunk(k, g, dem && !dem.partial ? PX_DAYS : 1);   // 標高が欠けた区画は1日で取り直す
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
const WB = { s: 34.68, w: 136.92, n: 34.95, e: 137.25 }, WT = 100;   // 西尾市と周り（碧南・安城・幸田・蒲郡の一部）
const WW = Math.ceil((WB.e - WB.w) * M_LNG / WT), WH = Math.ceil((WB.n - WB.s) * M_LAT / WT);
const llToW = (lat, lng) => ({ x: (lng - WB.w) * M_LNG / WT, y: (WB.n - lat) * M_LAT / WT });
const wToLL = (x, y) => ({ lat: WB.n - y * WT / M_LAT, lng: WB.w + x * WT / M_LNG });
// 名前の表の中身（川・町名）を変えたら番号を上げる。古い番号の保存分は消して、新しい地図を取り直してもらう
const WORLD_KEY = 'nsg_world6', WORLD_FILE = 'nishio-go/world.json';
for (let i = 1; i <= 5; i++) store.del('nsg_world' + i);
let world = null, worldPois = [], worldLabels = [], worldImg = null, worldState = 'none';   // none | building | ok | fail

// 引いて見るときの地図の色（ドット絵タイルの代表色。道は目立つように明るく）
const WCOL = { [C.G]: '#3f9b3c', [C.F]: '#7fb84a', [C.T]: '#d8ccaa', [C.W]: '#1f6528', [C.P]: '#55b650', [C.A]: '#2a62c9', [C.S]: '#e7cf8c',
  [C.B]: '#b4472f', [C.R]: '#f1e6c4', [C.H]: '#f6c34a', [C.L]: '#4a3a2a', [C.D]: '#c9a66b', [C.X]: '#0d1418', [C.M]: '#8d6e4f', [C.K]: '#6cc35a',
  [C.E]: '#2f7a34', [C.V]: '#9a6b3f', [C.I]: '#a3a8ab', [C.J]: '#e4dfd2', [C.Y]: '#4a9a46', [C.N]: '#dfe9ee', [C.U]: '#86b54c' };
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
  const keepSeaMt = new Set([C.A, C.M]), keepMt = new Set([C.M]);
  L.lines.slice().sort((a, b) => a[2] - b[2]).forEach(([pts, code]) => pts.forEach(line => strokeLine(g, line, code, 1, null, WW, WH, code === C.A ? keepMt : keepSeaMt)));
  for (let i = 0; i < g.length; i++) if (g[i] === UNSET) g[i] = C.G;
  return g;
}

let worldProgress = '';
async function buildWorld(force) {
  if (worldState === 'building' || worldState === 'enriching' || (worldState === 'ok' && !force)) return;
  const saved = !force && store.get(WORLD_KEY);
  if (saved && saved.w === WW && saved.h === WH && saved.d && saved.d.length === WW * WH && Date.now() - saved.t < (saved.days || PX_DAYS) * 864e5) {
    world = dec(saved.d); worldPois = saved.p || []; worldLabels = saved.l || []; makeWorldImg(); worldState = 'ok'; return;
  }
  worldState = 'building';
  if (!BAKE) {   // 用意しておいた地図（実際の地図データから作ったもの）
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
    } catch (e) { /* なければブラウザで作る */ }
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
const TILE_ART = {
  [C.G]: grassBase,
  [C.F]: (px, r) => {            // 田んぼ（苗の列と水の光）
    px('#7fb84a', 0, 0, 16, 16);
    for (let y = 1; y < 16; y += 3) for (let x = (y % 2) + 1; x < 16; x += 3) px('#5a9530', x, y, 1, 2);
    for (let i = 0; i < 4; i++) px('#a8d8ff', (r() * 15) | 0, (r() * 15) | 0, 2, 1);
    px('#6b5a3a', 0, 15, 16, 1); px('#6b5a3a', 15, 0, 1, 16);   // あぜ道
  },
  [C.U]: (px, r) => {            // 農地（作物不明）：緑の作物の列
    px('#86b54c', 0, 0, 16, 16);
    for (let y = 1; y < 16; y += 4) { px('#6a9a36', 0, y, 16, 2); for (let x = (r() * 3) | 0; x < 16; x += 4) px('#a3cc66', x, y - 1); }
    px('#7a6a46', 0, 15, 16, 1);
  },
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
    px('#5b3a1e', 7 + ox, 11, 2, 4);
    px('#1d5e26', 3 + ox, 3, 10, 8); px('#1d5e26', 4 + ox, 2, 8, 10); px('#1d5e26', 2 + ox, 5, 12, 4);
    px('#2e8a38', 5 + ox, 3, 4, 3); px('#2e8a38', 4 + ox, 5, 2, 2);
    px('#123f19', 4 + ox, 10, 8, 1);
  },
  [C.P]: (px, r) => {            // 公園・芝生
    speckle(px, r, '#4fb24b', ['#45a242', '#66c461'], 12);
    const cols = ['#ff8fb1', '#fff176', '#ffffff'];
    for (let i = 0; i < 3; i++) { const a = 1 + ((r() * 13) | 0), b = 1 + ((r() * 13) | 0); px(cols[i % 3], a, b); px('#2f8f2c', a, b + 1); }
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
  [C.R]: (px, r) => speckle(px, r, '#c4bcaa', ['#aea691', '#d6cfbf'], 10),
  [C.H]: (px, r) => { speckle(px, r, '#8e8e8a', ['#7b7b77', '#a3a39f'], 12); },
  [C.L]: (px) => { px('#8a7f72', 0, 0, 16, 16); for (let y = 1; y < 16; y += 4) px('#5a4632', 1, y, 14, 2); px('#d0d0d0', 4, 0, 1, 16); px('#d0d0d0', 11, 0, 1, 16); },
  [C.D]: (px, r) => speckle(px, r, '#c9a66b', ['#b08a50', '#dcbd88'], 12),
  [C.X]: (px, r, f) => { px('#0d1418', 0, 0, 16, 16); px('#1a252b', (f * 8) % 16, 7, 2, 2); },
};
const SHADE = ['rgba(0,0,0,.32)', 'rgba(0,0,0,.16)', '', 'rgba(255,250,220,.12)', 'rgba(255,250,220,.24)'];
const tiles = {};   // code → [variant][frame]
for (const [code, draw] of Object.entries(TILE_ART)) {
  tiles[code] = [0, 1, 2].map(v => [makeTile(draw, code * 97 + v * 31 + 7, 0), makeTile(draw, code * 97 + v * 31 + 7, 1)]);
}

// 文字で描くスプライト（16×16）
const PAL = { k: '#000000', w: '#ffffff', r: '#d23a2e', R: '#8e1c1c', g: '#a8a8a8', G: '#686868', y: '#f2c230', Y: '#b88a12',
  b: '#2b5fd9', B: '#1a3a8a', n: '#8d5524', N: '#5d3a1a', s: '#f4c58f', l: '#43a047', o: '#ff9800' };
function sprite(rows, gray) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const x = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, i) => {
    if (ch === '.' || !PAL[ch]) return;
    let col = PAL[ch];
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
const heroSprites = {};
for (const dir of ['down', 'up', 'right']) heroSprites[dir] = [sprite([...HERO_TOP, ...HERO[dir], ...LEGS_A]), sprite([...HERO_TOP, ...HERO[dir], ...LEGS_B])];
heroSprites.left = heroSprites.right.map((_, i) => sprite(mirror([...HERO_TOP, ...HERO.right, ...(i ? LEGS_B : LEGS_A)])));
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

function spotArt(s) {
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

  if (now - lastEnsure > 500) { lastEnsure = now; ensureVisible(w, h, T); snapDemoStart(); updateChests(); }

  const f = Math.floor(now / 450) % 2;
  ctx.imageSmoothingEnabled = false;
  const ox = Math.round(w / 2 - cam.x * T), oy = Math.round(h / 2 - cam.y * T);
  const tx0 = Math.floor(-ox / T), ty0 = Math.floor(-oy / T), tx1 = Math.ceil((w - ox) / T), ty1 = Math.ceil((h - oy) / T);
  for (let ty = ty0; ty < ty1; ty++) for (let tx = tx0; tx < tx1; tx++) {
    const raw = rawAt(tx, ty), code = raw & 31, sh = raw >> 5;
    const v = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
    const X = ox + tx * T, Y = oy + ty * T;
    ctx.drawImage(tiles[code][v % 3][code === C.A || code === C.X ? f : 0], X, Y, T, T);
    if (sh !== 2) { ctx.fillStyle = SHADE[sh]; ctx.fillRect(X, Y, T, T); }
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
  for (const p of visiblePois(tx0, ty0, tx1, ty1)) {
    const size = T * 2, sx = Math.round(ox + p[0] * T - size / 2), sy = Math.round(oy + p[1] * T - size * 0.7);
    ctx.drawImage(spotSprites[p[2]][0], sx, sy, size, size);
  }
  const me = G.me;
  let nearest = null, nearestD = Infinity;
  for (const s of spots) {
    const p = toTile(s.lat, s.lng);
    const size = s.shop ? Math.round(T * 2.5) : s.featured ? T * 2 : T;
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
    if (s.shop) { const t = drawShopTag(sx + size / 2, sy, dpr); shopHits.push([Math.min(t[0], sx), t[1], Math.max(t[2], sx + size), sy + size, s]); }
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

  // 主人公
  if (me || G.demo) ctx.drawImage(heroSprites[facing][f], Math.round(w / 2 - T / 2), Math.round(h / 2 - T * 0.75), T, T);

  // 画面の外にある一番近いスポットへの矢印
  if (nearest && !G.selected) {
    const p = toTile(nearest.lat, nearest.lng);
    const ex = ox + p.x * T, ey = oy + p.y * T;
    if (ex < 0 || ey < 0 || ex > w || ey > h) {
      const a = Math.atan2(ey - h / 2, ex - w / 2), m = T * 0.8;
      const ax = Math.min(w - m, Math.max(m, w / 2 + Math.cos(a) * w)), ay = Math.min(h - m, Math.max(m, h / 2 + Math.sin(a) * h));
      const px = Math.min(Math.abs((w / 2 - m) / Math.cos(a)), Math.abs((h / 2 - m) / Math.sin(a)));
      const qx = w / 2 + Math.cos(a) * px, qy = h / 2 + Math.sin(a) * px;
      ctx.save(); ctx.translate(isFinite(qx) ? qx : ax, isFinite(qy) ? qy : ay); ctx.rotate(a);
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(T * 0.45, 0); ctx.lineTo(-T * 0.3, -T * 0.35); ctx.lineTo(-T * 0.3, T * 0.35); ctx.fill();
      ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.moveTo(T * 0.32, 0); ctx.lineTo(-T * 0.2, -T * 0.24); ctx.lineTo(-T * 0.2, T * 0.24); ctx.fill();
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

// 画面に見えている区画の建物。注目スポットや同じ名前のスポットのすぐ近くの建物は出さない
let poiCache = { key: '', list: [] };
function visiblePois(tx0, ty0, tx1, ty1) {
  const key = [Math.floor(tx0 / 8), Math.floor(ty0 / 8), Math.floor(tx1 / 8), Math.floor(ty1 / 8), G.spots.length, chunks.size].join(',');
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
const AREA_LABELS = [['西尾', 34.872, 137.058, 4], ['一色', 34.802, 137.028, 3], ['吉良', 34.818, 137.078, 3], ['幡豆', 34.800, 137.138, 3], ['佐久島', 34.733, 137.040, 3]];
const SEA_LABELS = [['三河湾', 34.752, 137.105, 4]];
const wT = dpr => Math.round(WSIZES[wscale] * dpr);
function worldCamStart() {
  const me = G.me, nb2 = G.CFG.nishioBounds;
  wcamOnMe = !me;
  if (me && me.lat > nb2[0][0] && me.lat < nb2[1][0] && me.lng > nb2[0][1] && me.lng < nb2[1][1]) return llToW(me.lat, me.lng);
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
    ctx.drawImage(tiles[code][v % 3][code === C.A || code === C.X ? f : 0], ox + x * T, oy + y * T, T, T);
  }
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
  for (const [x, y, sz, s] of shopTags) {   // 「当店」の札は地名より上に。札も絵もタップできる
    const t = drawShopTag(x, y, dpr);
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
// 当店の札：赤地に白文字で「当店」。(cx, bottom) は札の下のまん中。札の外わく [左, 上, 右, 下] を返す
let shopHits = [];   // 当店の札と絵のタップ範囲 [左, 上, 右, 下, スポット]（描くたびに作り直す）
function drawShopTag(cx, bottom, dpr) {
  const fs = Math.round(11 * dpr), pad = Math.round(3 * dpr), b = Math.max(1, Math.round(dpr));
  ctx.font = `${fs}px "DotGothic16", monospace`;
  const tw = Math.ceil(ctx.measureText('当店').width), bw = tw + pad * 2, bh = fs + pad * 2;
  const x = Math.round(cx - bw / 2), y = Math.round(bottom - bh - 2 * dpr);
  ctx.fillStyle = '#000'; ctx.fillRect(x - b, y - b, bw + b * 2, bh + b * 2);
  ctx.fillStyle = '#d23a2e'; ctx.fillRect(x, y, bw, bh);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('当店', x + bw / 2, y + bh / 2 + dpr * 0.5);
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
    ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(8 * dpr, 8 * dpr, tw + 16 * dpr, fs + 12 * dpr);
    ctx.fillStyle = '#fff'; ctx.fillText(corner, 16 * dpr, 8 * dpr + (fs + 12 * dpr) / 2);
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
  // 操作して移動なら、せかいちずでも十字ボタンを出す（押すと歩く地図にもどって歩く。はじめての人はせかいちずから始まるため）
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

// デモ：十字ボタンで1マスずつ歩く（水と建物には入れない）
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
function step(dir) {
  if (!G.demo) return;
  const t = targetTile();
  const nx = Math.floor(t.x) + DIRS[dir][0], ny = Math.floor(t.y) + DIRS[dir][1];
  facing = dir;
  // 建物や水の上に立っているとき（実際の地図で、始めた場所が建物の中だったなど）は、
  // いちばん近い歩けるマスへ近づく向きにだけ動ける（出口へ向かうとき以外は、ふだんどおり通れない）
  const cx0 = Math.floor(t.x), cy0 = Math.floor(t.y);
  const escape = BLOCK.has(codeAt(cx0, cy0)) && codeAt(nx, ny) !== C.X && exitDist(nx, ny) < exitDist(cx0, cy0);
  if (BLOCK.has(codeAt(nx, ny)) && !escape) { if (navigator.vibrate) navigator.vibrate(20); return; }
  const ll = toLatLng(nx + 0.5, ny + 0.5);
  G.moveTo(ll.lat, ll.lng);
}
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

// 十字ボタン・矢印キー：せかいちずを見ているときは、歩く地図にもどってから歩く
function padStep(dir) {
  if (worldMode) setWorld(false);
  step(dir);
}
let holdTimer = null;
document.querySelectorAll('#pxPad [data-dir]').forEach(b => {
  const start = e => { e.preventDefault(); padStep(b.dataset.dir); clearInterval(holdTimer); holdTimer = setInterval(() => padStep(b.dataset.dir), 180); };
  const stop = () => { clearInterval(holdTimer); holdTimer = null; };
  b.addEventListener('pointerdown', start);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, stop));
});
document.addEventListener('keydown', e => {
  const k = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
  if (k && active && G.demo && !e.target.closest('input,textarea')) { e.preventDefault(); padStep(k); }
});

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
  let hit = null, best = Infinity;
  for (const s of G.spots) {
    const p = toTile(s.lat, s.lng);
    const sx = cv.width / 2 + (p.x - c.x) * T, sy = cv.height / 2 + (p.y - c.y) * T;
    const half = (s.shop ? T * 1.25 : s.featured ? T : T / 2) + 4 * dpr, d = Math.hypot(x - sx, y - sy);
    if (Math.abs(x - sx) <= half && Math.abs(y - sy) <= half && d < best) { hit = s; best = d; }
  }
  if (hit) { $('pxInfoBody').innerHTML = G.popupHtml(hit); $('pxInfo').hidden = false; return; }
  let bp = null;
  best = T * 1.2;
  for (const p of poiCache.list) { const d = Math.hypot(x - (cv.width / 2 + (p[0] - c.x) * T), y - (cv.height / 2 + (p[1] - c.y) * T - T * 0.2)); if (d < best) { bp = p; best = d; } }
  if (bp) { $('pxInfoBody').innerHTML = poiHtml(bp); $('pxInfo').hidden = false; }
});
$('pxInfo').addEventListener('click', e => { if (e.target === $('pxInfo') || e.target.closest('[data-close]') || e.target.closest('[data-move]')) $('pxInfo').hidden = true; });

G.onModeChange(updatePad);
// はじめての人はドット絵（ダンジョン風）のせかいちずから
let initial = 'px', worldOn = '1';
try { initial = localStorage.getItem('nsg_view') || 'px'; worldOn = localStorage.getItem('nsg_world_on') ?? '1'; } catch (e) { /* noop */ }
if (initial === 'px') { setActive(true); if (worldOn === '1') setWorld(true); }

// テスト用
window.nishioPixel = { rasterize, chunkQuery, chunkBox, unrle, overpass, toTile, toLatLng, codeAt, rawAt, C, CHUNK, chunks, setActive, demFor, get worldMode() { return worldMode; }, merc, buildWorld, setWorld, llToW, WORLD_KEY, WW, WH, get world() { return world; }, get worldPois() { return worldPois; }, get worldLabels() { return worldLabels; }, get pois() { return poiCache.list; }, BUILDING_ART, get worldState() { return worldState; }, get areaBoxes() { return areaBoxes; }, get shopHits() { return shopHits; }, get chests() { return chests; } };
})();
