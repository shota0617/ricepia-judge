// 調査（一時的）：OpenStreetMap の名所（神社・お寺・駅・史跡など）のうち、日本語版ウィキペディアに記事と代表画像があるものの写真を集める
// ・記事の位置がスポットから1.5km以内のものだけ（同じ名前の別の場所を取らない）。画像は Commons にある自由な利用許諾のものだけ
// ・reference/osm-photos/<スポットid>.jpg（幅640）と reference/osm-photos.json（出典）に保存する
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const UA = 'nishio-go-research/1.0 (https://github.com/shota0617/ricepia-judge)';
const CATS = new Set(['shrine', 'temple', 'station', 'castle', 'museum', 'townhall', 'library', 'worship', 'historic', 'sight', 'view', 'art']);
const items = require(path.join(ROOT, 'nishio-go/osm-spots.json')).items.filter(it => CATS.has(it[2]) && it[1]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = async u => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u, { headers: { 'User-Agent': UA } }); if (r.ok) return r.json(); } catch (e) { /* もう一度 */ } await sleep(1500); } throw new Error('fetch ' + u.slice(0, 80)); };
const dist = (a, b, c, d) => Math.hypot((a - c) * 111000, (b - d) * 91000);
const strip = s => String(s || '').replace(/<[^>]+>/g, '').trim().slice(0, 200);
const title = it => { const n = String(it[1]).replace(/（[^）]*）|\([^)]*\)/g, '').trim(); return it[2] === 'station' && !/駅$/.test(n) ? n + '駅' : n; };
(async () => {
  const dir = path.join(__dirname, 'osm-photos'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const byTitle = new Map();
  for (const it of items) { const t = title(it); if (!byTitle.has(t)) byTitle.set(t, []); byTitle.get(t).push(it); }
  const titles = [...byTitle.keys()], found = [];
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const j = await getJSON('https://ja.wikipedia.org/w/api.php?' + new URLSearchParams({ action: 'query', format: 'json', prop: 'coordinates|pageimages', piprop: 'name', colimit: 'max', redirects: '1', titles: batch.join('|') }));
    const q = j.query || {}, alias = new Map();
    for (const x of [...(q.normalized || []), ...(q.redirects || [])]) alias.set(x.to, [...(alias.get(x.from) || [x.from])]);
    for (const p of Object.values(q.pages || {})) {
      if (!p.pageimage || !p.coordinates) continue;
      const c = p.coordinates[0], froms = new Set([p.title, ...(alias.get(p.title) || [])]);
      for (const [from, list] of byTitle) {
        if (!froms.has(from)) continue;
        for (const it of list) if (dist(it[3], it[4], c.lat, c.lon) < 1500) found.push({ it, article: p.title, image: p.pageimage });
      }
    }
    await sleep(300);
  }
  console.log('記事と画像が見つかった', found.length);
  const out = [];
  for (let i = 0; i < found.length; i += 40) {
    const batch = found.slice(i, i + 40);
    const j = await getJSON('https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ action: 'query', format: 'json', prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '640', titles: [...new Set(batch.map(f => 'File:' + f.image))].join('|') }));
    const q = j.query || {}, norm = new Map((q.normalized || []).map(x => [x.to, x.from]));
    const info = new Map(Object.values(q.pages || {}).filter(p => p.imageinfo).map(p => [norm.get(p.title) || p.title, p]));
    for (const f of batch) {
      const p = info.get('File:' + f.image), ii = p && p.imageinfo[0];
      if (!ii || !/jpeg|png/.test(ii.mime || '')) continue;   // Commons にない（日本語版だけの）画像は使わない
      const m = ii.extmetadata || {}, lic = strip(m.LicenseShortName && m.LicenseShortName.value);
      if (!/CC|Public domain|PD/i.test(lic)) continue;
      const file = f.it[0] + '.jpg';
      try { const r = await fetch(ii.thumburl || ii.url, { headers: { 'User-Agent': UA } }); if (!r.ok) throw new Error('HTTP ' + r.status); fs.writeFileSync(path.join(dir, file), Buffer.from(await r.arrayBuffer())); } catch (e) { console.log(f.it[0], e.message); continue; }
      out.push({ id: f.it[0], name: f.it[1], cat: f.it[2], article: f.article, file, title: p.title, page: ii.descriptionurl, license: lic, artist: strip(m.Artist && m.Artist.value) });
      await sleep(150);
    }
  }
  console.log('写真を保存した', out.length);
  fs.writeFileSync(path.join(__dirname, 'osm-photos.json'), JSON.stringify(out, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
