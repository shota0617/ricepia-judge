// 国土地理院のベクトルタイル（建物）と空中写真が、西尾でどう取れるかを確かめる（使い終わったら消す）
const { VectorTile } = require('@mapbox/vector-tile'), Pbf = require('pbf'), jpeg = require('jpeg-js');
const LAT = 34.8608, LNG = 137.0569;   // 名鉄 西尾駅のあたり
const tileOf = (z) => { const n = 2 ** z, r = LAT * Math.PI / 180; return [Math.floor((LNG + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)]; };
(async () => {
  for (const [name, zs] of [['optimal_bvmap-v1', [14, 15, 16, 17]], ['experimental_bvmap', [14, 15, 16, 17]]]) for (const z of zs) {
    const [x, y] = tileOf(z), u = `https://cyberjapandata.gsi.go.jp/xyz/${name}/${z}/${x}/${y}.pbf`;
    const r = await fetch(u); console.log(u, r.status, r.headers.get('content-type'), r.headers.get('content-encoding'));
    if (!r.ok) continue;
    const vt = new VectorTile(new Pbf(Buffer.from(await r.arrayBuffer())));
    for (const [ln, L] of Object.entries(vt.layers)) {
      const types = {}, keys = new Set(); let ex = null;
      for (let i = 0; i < L.length; i++) { const f = L.feature(i); types[f.type] = (types[f.type] || 0) + 1; Object.keys(f.properties).forEach(k => keys.add(k)); if (!ex && f.type === 3) ex = f.properties; }
      console.log(`  ${ln}: ${L.length} extent=${L.extent} types=${JSON.stringify(types)} keys=${[...keys].join(',')} ex=${JSON.stringify(ex)}`);
    }
  }
  for (const [name, ext] of [['seamlessphoto', 'jpg'], ['ort', 'jpg']]) for (const z of [16, 17, 18]) {
    const [x, y] = tileOf(z), u = `https://cyberjapandata.gsi.go.jp/xyz/${name}/${z}/${x}/${y}.${ext}`;
    const r = await fetch(u); console.log(u, r.status, r.headers.get('content-type'), r.headers.get('access-control-allow-origin'));
    if (!r.ok) continue;
    const buf = Buffer.from(await r.arrayBuffer()), im = jpeg.decode(buf, { useTArray: true });
    const px = []; for (const [a, b] of [[64, 64], [128, 128], [192, 64], [64, 192], [200, 200]]) { const i = (b * im.width + a) * 4; px.push([im.data[i], im.data[i + 1], im.data[i + 2]]); }
    console.log(`  ${buf.length}B ${im.width}x${im.height} px=${JSON.stringify(px)}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
