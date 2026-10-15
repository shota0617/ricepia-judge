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

// 多角形を塗る（偶奇規則。マルチポリゴンの部品がつながっていなくても、辺の集合で正しく塗れる）
function fillPoly(g, rings, code) {
  let minY = Infinity, maxY = -Infinity, n = 0;
  for (const r of rings) for (const p of r) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
  const ys = Math.max(0, Math.floor(minY)), ye = Math.min(CHUNK - 1, Math.ceil(maxY));
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
      const a = Math.max(0, Math.ceil(xs[i] - 0.5)), b = Math.min(CHUNK - 1, Math.floor(xs[i + 1] - 0.5));
      for (let cx = a; cx <= b; cx++) { g[cy * CHUNK + cx] = code; n++; }
    }
  }
  return n;
}

// 線を引く（w マス幅）。mask を渡すと地形ではなく mask に印を付ける
function strokeLine(g, pts, code, w, mask) {
  const r = (w - 1) / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    if (Math.max(x1, x2) < -w || Math.min(x1, x2) > CHUNK + w || Math.max(y1, y2) < -w || Math.min(y1, y2) > CHUNK + w) continue;
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 0.35));
    for (let s = 0; s <= n; s++) {
      const x = x1 + (x2 - x1) * s / n, y = y1 + (y2 - y1) * s / n;
      for (let cy = Math.floor(y - r); cy <= Math.floor(y + r); cy++) {
        if (cy < 0 || cy >= CHUNK) continue;
        for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) {
          if (cx < 0 || cx >= CHUNK) continue;
          if (mask) mask[cy * CHUNK + cx] = 1; else g[cy * CHUNK + cx] = code;
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
  const ops = [], coasts = [];
  for (const el of elements) {
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
  if (!ops.length && !coasts.length && !dem) {
    // データが何もない区画：三河湾側（南）なら海、それ以外は野原とみなす
    g.fill((toLatLng((cx + 0.5) * CHUNK, (cy + 0.5) * CHUNK).lat < 34.82 && elements.length === 0 ? C.A : C.G) | (2 << 5));
    return g;
  }
  const dh = (x, y) => dem[(y + 1) * DB + (x + 1)];
  ops.sort((a, b) => a.k.p - b.k.p);
  let seaDone = false;
  const sea = () => {
    if (seaDone) return;
    seaDone = true;
    if (coasts.length) seaFill(g, coasts);   // 海岸線がある区画は、海岸線で決める
    else if (dem) {                           // ない区画は、標高データのない所（国土地理院の「データなし」）を海に
      for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
        const i = y * CHUNK + x;
        if (g[i] === UNSET && Number.isNaN(dh(x, y))) g[i] = C.A;
      }
    }
  };
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
const merc = (lat, lng) => { const n = 256 * 2 ** DEM_Z, r = lat * Math.PI / 180; return { x: (lng + 180) / 360 * n, y: (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n }; };
function demTile(x, y) {
  const k = x + '/' + y;
  if (!demCache.has(k)) {
    demCache.set(k, (async () => {
      const res = await fetch(`https://cyberjapandata.gsi.go.jp/xyz/dem_png/${DEM_Z}/${x}/${y}.png`);
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
const PX_KEY = 'nsg_px4_', PX_IDX = 'nsg_px4_idx', PX_DAYS = 30, PX_KEEP = 60;
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
  if (!store.set(PX_KEY + k, { t: Date.now(), d: encode(g), days })) {
    // 保存領域がいっぱいなら古い区画から消してもう一度
    while (idx.length > 1) { store.del(PX_KEY + idx.shift()); if (store.set(PX_KEY + k, { t: Date.now(), d: encode(g), days })) break; }
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
  const saved = store.get(PX_KEY + k);
  if (saved && saved.d && saved.d.length === CHUNK * CHUNK && Date.now() - saved.t < (saved.days || PX_DAYS) * 864e5) {
    chunks.set(k, { state: 'ok', g: dec(saved.d) }); return;
  }
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
);
out geom qt;`;
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
      try {
        // 地図データと標高を同時に取得（標高が取れなくても地図は作る）
        const [json, dem] = await Promise.all([overpass(chunkQuery(chunkBox(cx, cy))), demFor(cx, cy).catch(() => null)]);
        const g = rasterize(json.elements || [], cx, cy, dem && dem.h);
        chunks.set(k, { state: 'ok', g });
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
    const timer = setTimeout(() => ctl.abort(), 90000);
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
  chest: ['................', '................', '................', '...kkkkkkkkkk...', '..knnnnnnnnnnk..', '..knNNNNNNNNnk..', '..knnnnnnnnnnk..', '..kkkkkyykkkkk..',
    '..knnnkyyknnnk..', '..knnnnkknnnnk..', '..knNNNNNNNNnk..', '..knnnnnnnnnnk..', '..kkkkkkkkkkkk..', '................', '................', '................'],
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
for (const [k, rows] of Object.entries(ART)) spotSprites[k] = [sprite(rows), sprite(rows, true)];

function spotArt(s) {
  const kind = s.featured ? (s.kind || 'featured') : s.cat;
  if (kind === 'castle') return 'castle';
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

  if (now - lastEnsure > 500) { lastEnsure = now; ensureVisible(w, h, T); }

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

  // スポット
  const spots = G.spots;
  const me = G.me;
  let nearest = null, nearestD = Infinity;
  for (const s of spots) {
    const p = toTile(s.lat, s.lng);
    const size = s.featured ? T * 2 : T;
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
function updatePad() { $('pxPad').hidden = !(active && G.demo); }
$('viewBtn').addEventListener('click', () => setActive(!active));
$('pxZoomIn').addEventListener('click', () => setScale(scale + 1));
$('pxZoomOut').addEventListener('click', () => setScale(scale - 1));
function setScale(v) { scale = Math.min(4, Math.max(1, v)); try { localStorage.setItem('nsg_px_scale', scale); } catch (e) { /* noop */ } }

// デモ：十字ボタンで1マスずつ歩く（水と建物には入れない）
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
function step(dir) {
  if (!G.demo) return;
  const t = targetTile();
  const nx = Math.floor(t.x) + DIRS[dir][0], ny = Math.floor(t.y) + DIRS[dir][1];
  facing = dir;
  if (BLOCK.has(codeAt(nx, ny))) { if (navigator.vibrate) navigator.vibrate(20); return; }
  const ll = toLatLng(nx + 0.5, ny + 0.5);
  G.moveTo(ll.lat, ll.lng);
}
let holdTimer = null;
document.querySelectorAll('#pxPad [data-dir]').forEach(b => {
  const start = e => { e.preventDefault(); step(b.dataset.dir); clearInterval(holdTimer); holdTimer = setInterval(() => step(b.dataset.dir), 180); };
  const stop = () => { clearInterval(holdTimer); holdTimer = null; };
  b.addEventListener('pointerdown', start);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, stop));
});
document.addEventListener('keydown', e => {
  const k = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
  if (k && active && G.demo && !e.target.closest('input,textarea')) { e.preventDefault(); step(k); }
});

// スポットをタップすると、ドラクエ風のウィンドウで説明
cv.addEventListener('click', e => {
  const r = cv.getBoundingClientRect(), dpr = cv.width / r.width;
  const T = Math.round(16 * scale * Math.min(window.devicePixelRatio || 1, 3));
  const c = camTile();
  const x = (e.clientX - r.left) * dpr, y = (e.clientY - r.top) * dpr;
  let hit = null, best = Infinity;
  for (const s of G.spots) {
    const p = toTile(s.lat, s.lng);
    const sx = cv.width / 2 + (p.x - c.x) * T, sy = cv.height / 2 + (p.y - c.y) * T;
    const half = (s.featured ? T : T / 2) + 4 * dpr, d = Math.hypot(x - sx, y - sy);
    if (Math.abs(x - sx) <= half && Math.abs(y - sy) <= half && d < best) { hit = s; best = d; }
  }
  if (hit) { $('pxInfoBody').innerHTML = G.popupHtml(hit); $('pxInfo').hidden = false; }
});
$('pxInfo').addEventListener('click', e => { if (e.target === $('pxInfo') || e.target.closest('[data-close]') || e.target.closest('[data-move]')) $('pxInfo').hidden = true; });

G.onModeChange(updatePad);
let initial = 'map';
try { initial = localStorage.getItem('nsg_view') || 'map'; } catch (e) { /* noop */ }
if (initial === 'px') setActive(true);

// テスト用
window.nishioPixel = { rasterize, toTile, toLatLng, codeAt, rawAt, C, CHUNK, chunks, setActive, demFor, merc };
})();
