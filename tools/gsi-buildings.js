// 国土地理院の建物（ベクトルタイル experimental_bvmap の building。基盤地図情報 1/2500 の建物の形）と、
// 空中写真（全国最新写真（シームレス））で見た屋根の色を、tools/bake-chunks.js に渡す。
//   buildingsIn({ s, w, n, e }) → [{ r: [[lat, lon], …], f: 種類（ftCode）, c: 屋根の色 }]（取れなかったら例外）
//   屋根の色 c ＝ 色の番号（1〜13：瓦5色・金属5色・陸屋根3色。nishio-go/maptiles/roofs.png の並び）＋ 形（0・1）×16
// npm install --no-save @mapbox/vector-tile@1.3.1 pbf@3.2.1 jpeg-js@0.4.4 が要る
const { VectorTile } = require('@mapbox/vector-tile'), Pbf = require('pbf'), jpeg = require('jpeg-js');
const BZ = 16, PZ = 17;   // 建物はズーム16（これより細かいタイルはない）、写真はズーム17（約1m）
const KINDS = new Set([3101, 3102, 3103, 3111]);   // 普通建物・堅ろう建物・高層建物・無壁舎
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url) {
  for (let t = 1; ; t++) {
    try {
      const r = await fetch(url);
      if (r.status === 404) return null;    // タイルがない（海など）
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (t >= 4) throw new Error(`${url}: ${e.message}`);
      await sleep(3000 * t);
    }
  }
}
const lng2x = (lng, z) => (lng + 180) / 360 * 2 ** z;
const lat2y = (lat, z) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z; };
const x2lng = (x, z) => x / 2 ** z * 360 - 180;
const y2lat = (y, z) => { const n = Math.PI - 2 * Math.PI * y / 2 ** z; return 180 / Math.PI * Math.atan(Math.sinh(n)); };

// 空中写真のタイル（ズーム PZ）。ブロックごとに作り直すので、使い終わったら捨てる
function photoCache() {
  const m = new Map();
  return (x, y) => {
    const k = x + '/' + y;
    if (!m.has(k)) m.set(k, get(`https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${PZ}/${x}/${y}.jpg`).then(b => (b ? jpeg.decode(b, { useTArray: true }) : null)).catch(() => null));
    return m.get(k);
  };
}

// 写真の色（中央値）を、屋根の色の番号に。灰色っぽいものは明るさで、色のあるものは色あいで分ける
function roofClass([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), L = (r + g + b) / 3, ch = mx - mn;
  // 空中写真は もやで少し青みがかるので、青みの弱いものは灰色とみなす
  if (ch < 28 || ch < mx * 0.2) {
    if (L > 185) return 13;      // 白い陸屋根
    if (L > 160) return 11;      // 明るい灰色の陸屋根
    if (L > 128) return 9;       // 銀色の金属屋根
    if (L > 88) return 1;        // いぶし瓦（灰色）
    return 2;                    // 黒い瓦
  }
  let h = mx === r ? ((g - b) / ch) * 60 : mx === g ? (2 + (b - r) / ch) * 60 : (4 + (r - g) / ch) * 60;
  if (h < 0) h += 360;
  if (h >= 180 && h < 270) return L > 115 ? 6 : 4;          // 青い金属屋根・青い瓦
  if (h >= 75 && h < 180) return 8;                          // 緑の金属屋根
  if (h < 22 || h >= 300) return ch > 60 ? 7 : 5;            // 赤い金属屋根・赤茶の瓦
  if (h < 75) return L > 135 ? 10 : 3;                       // 黄土色の金属屋根・茶色の瓦
  return 1;
}

const inRing = (x, y, r) => {
  let o = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) o = !o;
  }
  return o;
};

// 建物の形（写真のピクセル座標）の内側を、中心へ少し寄せた所で 7×7 点見て、色の中央値を取る（ふちの影や庭を避ける）
async function sampleRoof(ring, photo) {
  let cx = 0, cy = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) { cx += x / ring.length; cy += y / ring.length; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const R = [], G = [], B = [];
  for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
    const px = x0 + (x1 - x0) * (i + 0.5) / 7, py = y0 + (y1 - y0) * (j + 0.5) / 7;
    const sx = cx + (px - cx) * 0.6, sy = cy + (py - cy) * 0.6;
    if (!inRing(sx, sy, ring)) continue;
    const tx = Math.floor(sx / 256), ty = Math.floor(sy / 256), im = await photo(tx, ty);
    if (!im) continue;
    const ix = Math.floor(sx - tx * 256), iy = Math.floor(sy - ty * 256), k = (iy * im.width + ix) * 4;
    R.push(im.data[k]); G.push(im.data[k + 1]); B.push(im.data[k + 2]);
  }
  if (!R.length) return 0;
  const med = a => a.sort((p, q) => p - q)[a.length >> 1];
  return roofClass([med(R), med(G), med(B)]);
}

async function buildingsIn(box) {
  const tx0 = Math.floor(lng2x(box.w, BZ)), tx1 = Math.floor(lng2x(box.e, BZ)), ty0 = Math.floor(lat2y(box.n, BZ)), ty1 = Math.floor(lat2y(box.s, BZ));
  const photo = photoCache(), out = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const buf = await get(`https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/${BZ}/${tx}/${ty}.pbf`);
    if (!buf) continue;
    const L = new VectorTile(new Pbf(buf)).layers.building;
    if (!L) continue;
    for (let i = 0; i < L.length; i++) {
      const f = L.feature(i);
      if (f.type !== 3 || !KINDS.has(f.properties.ftCode)) continue;
      const rings = f.loadGeometry();
      if (!rings.length || rings[0].length < 3) continue;
      // タイルの座標（0〜extent）→ 世界の座標（ズーム BZ のタイル単位）。タイルのふちで切られた建物は、中心がこのタイルにある切れはしだけ使う
      const ring = rings[0].map(p => [tx + p.x / L.extent, ty + p.y / L.extent]);
      const mx = ring.reduce((s, p) => s + p[0], 0) / ring.length, my = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      if (mx < tx || mx >= tx + 1 || my < ty || my >= ty + 1) continue;
      if (x2lng(mx, BZ) < box.w || x2lng(mx, BZ) > box.e || y2lat(my, BZ) < box.s || y2lat(my, BZ) > box.n) continue;
      const k = 2 ** (PZ - BZ) * 256, c = await sampleRoof(ring.map(([x, y]) => [x * k, y * k]), photo);
      const geo = ((Math.round(mx * 1e5) * 73856093) ^ (Math.round(my * 1e5) * 19349663)) >>> 0 & 1;
      out.push({ r: ring.map(([x, y]) => [+y2lat(y, BZ).toFixed(7), +x2lng(x, BZ).toFixed(7)]), f: f.properties.ftCode, c: c ? c + 16 * geo : 0 });
    }
  }
  return out;
}

module.exports = { buildingsIn, roofClass };
