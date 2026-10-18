// 調査用：Mapillary（だれでも使える CC BY-SA 4.0 の路上写真）から、名所とお店を道から見た写真を探し、
// ドット絵を本物に近づける参考として reference/mapillary/ に小さな画像と撮った人などを保存する
// ・対象：当店の2店舗と、西尾市内の注目スポットのうち、まだ専用の絵がないもの（spots.json と pixel.js の LANDMARK_ART から決める）
// ・スポットから 8〜90m の所で、カメラがスポットのほうを向いて撮った写真（向きのずれ40度まで）を、近くて新しい順に2枚まで
// 環境変数 MAPILLARY_TOKEN（Mapillary の Client Token。GitHub のシークレットに入れる）
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'reference'), TOKEN = process.env.MAPILLARY_TOKEN;
if (!TOKEN) { console.log('MAPILLARY_TOKEN がないので、何もしません'); process.exit(0); }
const AREAS = new Set(['nishio', 'isshiki', 'kira', 'hazu', 'sakushima', '']);
const spots = require(path.join(ROOT, 'nishio-go/spots.json')).spots;
const art = new Set([...fs.readFileSync(path.join(ROOT, 'nishio-go/pixel.js'), 'utf8').matchAll(/'f-([a-z0-9-]+)': '\w+'/g)].map(m => m[1]));
const targets = spots.filter(s => !s.normal && Number.isFinite(s.lat) && Number.isFinite(s.lng) && (s.shop || (!art.has(s.id) && AREAS.has(s.area || ''))));
const rad = d => d * Math.PI / 180;
const distM = (a, b) => { const x = rad(b[0] - a[0]) * Math.cos(rad((a[1] + b[1]) / 2)), y = rad(b[1] - a[1]); return Math.hypot(x, y) * 6371000; };   // [lng, lat]
const bearing = (a, b) => { const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1])), x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0])); return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const dir = path.join(OUT, 'mapillary');
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });   // 前に動かしたときの写真は消す（mapillary.json にない写真を残さない）
  const out = [];
  for (const s of targets) {
    const p = [s.lng, s.lat], d = 0.0009;   // 約90m四方
    const u = 'https://graph.mapillary.com/images?' + new URLSearchParams({ bbox: [s.lng - d, s.lat - d, s.lng + d, s.lat + d].join(','), limit: '200',
      fields: 'id,captured_at,compass_angle,computed_compass_angle,geometry,computed_geometry,is_pano,thumb_1024_url,creator,sequence' });
    let imgs = [];
    try { const r = await fetch(u, { headers: { Authorization: 'OAuth ' + TOKEN } }); if (!r.ok) throw new Error('HTTP ' + r.status); imgs = (await r.json()).data || []; } catch (e) { console.log(s.id, e.message); await sleep(500); continue; }
    const cands = [];
    for (const im of imgs) {
      const g = (im.computed_geometry || im.geometry || {}).coordinates, ang = im.computed_compass_angle ?? im.compass_angle;
      if (!g || im.is_pano || !Number.isFinite(ang) || !im.thumb_1024_url) continue;
      const dm = distM(g, p); if (dm < 8 || dm > 90) continue;
      const diff = Math.abs(((ang - bearing(g, p)) % 360 + 540) % 360 - 180); if (diff > 40) continue;
      const age = (Date.now() - im.captured_at) / (365 * 864e5);
      cands.push({ im, dm, diff, score: dm + diff * 0.8 + age * 4 });
    }
    cands.sort((a, b) => a.score - b.score);
    const got = [], seqs = new Set();
    for (const c of cands) {
      if (got.length >= 2) break;
      if (seqs.has(c.im.sequence) && cands.some(o => !seqs.has(o.im.sequence) && o.score < c.score + 30)) continue;   // できれば別の日・別の道から
      const f = `${s.id}-${got.length + 1}.jpg`;
      try { const r = await fetch(c.im.thumb_1024_url); if (!r.ok) throw new Error('HTTP ' + r.status); fs.writeFileSync(path.join(dir, f), Buffer.from(await r.arrayBuffer())); } catch (e) { console.log(s.id, 'download', e.message); continue; }
      seqs.add(c.im.sequence);
      got.push({ file: f, image: c.im.id, page: `https://www.mapillary.com/app/?pKey=${c.im.id}`, creator: (c.im.creator && c.im.creator.username) || '', captured: new Date(c.im.captured_at).toISOString().slice(0, 10), distM: Math.round(c.dm), offDeg: Math.round(c.diff) });
      await sleep(200);
    }
    console.log(s.id, imgs.length, '→', got.length);
    out.push({ id: s.id, name: s.name, photos: got });
    await sleep(300);
  }
  fs.writeFileSync(path.join(OUT, 'mapillary.json'), JSON.stringify(out, null, 1));
})().catch(e => { console.error(e.message); process.exit(1); });
