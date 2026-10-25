// にしおさんぽGO で遊べる市町（西尾市と、となりの岡崎市・安城市・碧南市・幸田町・蒲郡市・高浜市）の境界を取り、
// 少し間引いて nishio-go/region.js に保存する。ゲームはこれで「歩く地図の区画を作るか」「いまどの市町にいるか」を決め、せかいちずに市町の境を描く。
//   node tools/bake-region.js 国土数値情報の行政区域（N03・愛知県）の GeoJSON … ふだんはこちら（.github/workflows/bake-region.yml が取ってくる）
//   node tools/bake-region.js                                              … OpenStreetMap の行政界から（GeoJSON が取れないとき）
// OpenStreetMap の西尾市と安城市の境は、米津町のあたりが数百m の粗い線で、本店（西尾市米津町）が安城市に入ってしまうため、国土数値情報を先に使う。
const fs = require('fs'), path = require('path');
const { ROOT, overpassFromNode } = require('./bake-common');

// id は areas.json の地区の id と同じ。西尾市の中の地区（一色・吉良・幡豆・佐久島）は areas.json のほうで分ける
const CITIES = [
  ['nishio-city', '西尾市'], ['okazaki', '岡崎市'], ['anjo', '安城市'], ['hekinan', '碧南市'],
  ['kota', '幸田町'], ['gamagori', '蒲郡市'], ['takahama', '高浜市'],
];
// 本店から15kmの円にかかる、7市町より外の市町。遊べる範囲は広げず、「いまどのまちにいるか」（まちメモ・町名の表示）にだけ使う
const AROUND = [
  ['kariya', '刈谷市'], ['chiryu', '知立市'], ['handa', '半田市'], ['higashiura', '東浦町'],
  ['agui', '阿久比町'], ['taketoyo', '武豊町'], ['obu', '大府市'], ['toyota', '豊田市'],
];
const ALL = CITIES.concat(AROUND);
const TOL_M = 60;   // 間引くときに許すずれ（m）。歩く地図の区画（約1km）を決めるには十分こまかい
const M_LAT = 110950, M_LNG = 111320 * Math.cos(34.86 * Math.PI / 180);

// way をつなげて輪にする。端どうしが約10m以内ならつながっているとみなす（データの細かな食い違いを許す）
function rings(ways, name) {
  const near = (p, q) => Math.hypot((p.lon - q.lon) * M_LNG, (p.lat - q.lat) * M_LAT) < 10;
  const left = ways.map(w => w.filter(Boolean)).filter(w => w.length > 1), out = [];
  while (left.length) {
    let ring = left.shift();
    for (let grew = true; grew && !(ring.length > 3 && near(ring[0], ring[ring.length - 1]));) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const w = left[i], end = ring[ring.length - 1], start = ring[0];
        if (near(w[0], end)) ring = ring.concat(w.slice(1));
        else if (near(w[w.length - 1], end)) ring = ring.concat(w.slice(0, -1).reverse());
        else if (near(w[w.length - 1], start)) ring = w.slice(0, -1).concat(ring);
        else if (near(w[0], start)) ring = w.slice(1).reverse().concat(ring);
        else continue;
        left.splice(i, 1); grew = true; break;
      }
    }
    const gap = Math.hypot((ring[0].lon - ring[ring.length - 1].lon) * M_LNG, (ring[0].lat - ring[ring.length - 1].lat) * M_LAT);
    if (ring.length >= 4 && gap < 10) out.push(ring.concat([ring[0]]));
    else console.log(`  ${name}: つながらない線（点 ${ring.length} 個、端の間 ${Math.round(gap)}m）`);
  }
  return out;
}
// ダグラス・ポイカー法で間引く（m に直して測る）
function simplify(pts, tol) {
  const xy = pts.map(p => [p.lon * M_LNG, p.lat * M_LAT]), keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [x1, y1] = xy[a], [x2, y2] = xy[b], L = Math.hypot(x2 - x1, y2 - y1) || 1;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((x2 - x1) * (y1 - xy[i][1]) - (x1 - xy[i][0]) * (y2 - y1)) / L;
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]).map(p => [+p.lat.toFixed(5), +p.lon.toFixed(5)]);
}
// 閉じた輪は始点と終点が同じなので、始点からいちばん遠い点で2つに分けて間引く。
// 小さな島（竹島など）は形が消えないように、大きさに合わせて こまかく間引く
function simplifyRing(r, maxTol = TOL_M) {
  let far = 1, best = -1;
  for (let i = 1; i < r.length - 1; i++) { const d = Math.hypot((r[i].lon - r[0].lon) * M_LNG, (r[i].lat - r[0].lat) * M_LAT); if (d > best) { best = d; far = i; } }
  const tol = Math.min(maxTol, Math.max(3, best / 8));
  return simplify(r.slice(0, far + 1), tol).concat(simplify(r.slice(far), tol).slice(1));
}
const areaKm2 = r => {   // 輪の面積（km²）
  let s = 0;
  for (let i = 0; i + 1 < r.length; i++) s += r[i][1] * M_LNG * r[i + 1][0] * M_LAT - r[i + 1][1] * M_LNG * r[i][0] * M_LAT;
  return Math.abs(s) / 2 / 1e6;
};

// 国土数値情報の行政区域（GeoJSON）：市町ごとの外側の輪（島ごとに1つ）。座標は [経度, 緯度]、輪は始点と終点が同じ
function fromKsj(file) {
  const gj = JSON.parse(fs.readFileSync(file, 'utf8')), by = new Map(ALL.map(c => [c[1], []]));
  for (const f of gj.features || []) {
    const p = f.properties || {}, g = f.geometry;
    if (p.N03_001 !== '愛知県' || !by.has(p.N03_004) || !g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) by.get(p.N03_004).push(poly[0].map(([lon, lat]) => ({ lat, lon })));
  }
  return by;
}
// OpenStreetMap の行政界（admin_level 7）：way をつなげて輪にする
async function fromOsm() {
  const q = `[out:json][timeout:180];
rel["boundary"="administrative"]["admin_level"="7"]["name"~"^(${ALL.map(c => c[1]).join('|')})$"];
out geom;`;
  const json = JSON.parse(await overpassFromNode('data=' + encodeURIComponent(q))), by = new Map();
  for (const [, name] of ALL) {
    // 愛知県のもの（同じ名前の市町はほかの県にない）
    const rel = (json.elements || []).find(e => e.type === 'relation' && e.tags && e.tags.name === name);
    if (!rel) throw new Error(`${name} の境界が見つかりません`);
    const ways = rel.members.filter(m => m.type === 'way' && m.role !== 'inner' && m.geometry && m.geometry.length > 1).map(m => m.geometry);
    console.log(`${name}: 境界の線 ${ways.length} 本（役割 ${[...new Set(rel.members.map(m => m.type + ':' + m.role))].join(' ')}）`);
    by.set(name, rings(ways, name));
  }
  return by;
}

(async () => {
  const ksj = process.argv[2], raw = ksj ? fromKsj(ksj) : await fromOsm();
  const SRC = ksj ? '国土数値情報（行政区域データ・国土交通省）を加工して作成' : 'OpenStreetMap（© OpenStreetMap contributors, ODbL）の行政界から作成';
  const shape = ([id, name], tol) => {
    // 国土数値情報は陸だけなので、名所のある小さな島（蒲郡の竹島 約0.02km² など）も残す。岩のような ごく小さな島は除く
    const rs = (raw.get(name) || []).filter(r => r.length >= 4).map(r => simplifyRing(r, tol)).filter(r => r.length >= 4 && areaKm2(r) > (ksj ? 0.005 : 0.02));
    if (!rs.length) throw new Error(`${name} の境界を輪にできません`);
    const all = rs.flat();
    const bbox = [[Math.min(...all.map(p => p[0])), Math.min(...all.map(p => p[1]))], [Math.max(...all.map(p => p[0])), Math.max(...all.map(p => p[1]))]];
    const km2 = rs.reduce((s, r) => s + areaKm2(r), 0);
    console.log(`${name}: 輪 ${rs.length} 個・点 ${all.length} 個・約 ${km2.toFixed(1)} km²・範囲 ${JSON.stringify(bbox)}`);
    return { id, name, bbox, rings: rs };
  };
  const cities = CITIES.map(c => shape(c, TOL_M));
  const around = AROUND.map(c => shape(c, TOL_M * 2));   // まわりのまちは、どこにいるか分かればよいので粗めに
  const body = `// tools/bake-region.js が ${SRC}した、遊べる市町の境界（約${TOL_M}mに間引き）と、本店から15kmの円にかかる まわりの市町の境界（around。約${TOL_M * 2}m。遊べる範囲には使わない）。手で編集しないでください。
// rings は [緯度, 経度] の輪（島などで複数あることがある）。bbox は [[南, 西], [北, 東]]
globalThis.NISHIO_REGION = ${JSON.stringify({ cities, around })};
if (typeof module !== 'undefined') module.exports = globalThis.NISHIO_REGION;
`;
  const out = path.join(ROOT, 'nishio-go', 'region.js');
  let old = '';
  try { old = fs.readFileSync(out, 'utf8'); } catch (e) { /* まだ無い */ }
  if (old === body) { console.log('nishio-go/region.js: 変更なし'); return; }
  fs.writeFileSync(out, body);
  console.log(`nishio-go/region.js: ${fs.statSync(out).size} bytes`);
})().catch(e => { console.error(e); process.exit(1); });
