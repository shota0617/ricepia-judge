// 調査（一時的）：専用の絵がまだない注目スポットの写真を、Wikimedia Commons（自由な利用許諾の写真）から探す（4回目）
// ・spots.json と pixel.js の LANDMARK_ART から対象を決める。Commons の検索と、日本語版ウィキペディアの記事の代表画像（Commons にあるものだけ）
// ・CC／パブリックドメインのものだけ、1か所3枚まで reference/commons/ に保存し、出典を reference/commons.json に書く
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const UA = 'nishio-go-research/1.0 (https://github.com/shota0617/ricepia-judge)';
const CITY = { nishio: '西尾', hazu: '西尾', isshiki: '西尾', sakushima: '佐久島', kira: '西尾', okazaki: '岡崎', anjo: '安城', hekinan: '碧南', takahama: '高浜', kota: '幸田', gamagori: '蒲郡' };
const spots = require(path.join(ROOT, 'nishio-go/spots.json')).spots;
const art = new Set([...fs.readFileSync(path.join(ROOT, 'nishio-go/pixel.js'), 'utf8').matchAll(/'f-([a-z0-9-]+)': '\w+'/g)].map(m => m[1]));
const targets = spots.filter(s => !s.normal && !s.shop && !art.has(s.id));
const strip = s => String(s || '').replace(/<[^>]+>/g, '').trim().slice(0, 200);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJSON = async u => { const r = await fetch(u, { headers: { 'User-Agent': UA } }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
const commons = p => 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ format: 'json', ...p });
const INFO = { prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '960' };
async function searchFiles(q) {
  const j = await getJSON(commons({ action: 'query', generator: 'search', gsrsearch: q, gsrnamespace: '6', gsrlimit: '6', ...INFO }));
  return Object.values((j.query && j.query.pages) || {}).sort((a, b) => a.index - b.index);
}
async function wikiImage(title) {   // 日本語版ウィキペディアの記事の代表画像（Commons のファイルだけ）
  const j = await getJSON('https://ja.wikipedia.org/w/api.php?' + new URLSearchParams({ action: 'query', format: 'json', prop: 'pageimages', piprop: 'name', titles: title, redirects: '1' }));
  const name = Object.values((j.query && j.query.pages) || {}).map(p => p.pageimage).find(Boolean);
  if (!name) return [];
  const k = await getJSON(commons({ action: 'query', titles: 'File:' + name, ...INFO }));
  return Object.values((k.query && k.query.pages) || {}).filter(p => p.imageinfo);   // Commons にないファイル（日本語版だけの画像）は imageinfo がない
}
(async () => {
  const dir = path.join(__dirname, 'commons'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const out = [];
  for (const s of targets) {
    const base = String(s.name).replace(/（[^）]*）/g, '').replace(/^名鉄\s*/, '').trim(), city = CITY[s.area] || '';
    const tasks = [() => wikiImage(base), () => searchFiles(`${base} ${city}`), () => searchFiles(base)];
    const seen = new Set(), got = [];
    for (const t of tasks) {
      if (got.length >= 3) break;
      let pages = [];
      try { pages = await t(); } catch (e) { console.log(s.id, e.message); }
      for (const p of pages) {
        const ii = p.imageinfo && p.imageinfo[0];
        if (!ii || seen.has(p.title) || !/jpeg|png/.test(ii.mime || '') || got.length >= 3) continue;
        seen.add(p.title);
        const m = ii.extmetadata || {}, lic = strip(m.LicenseShortName && m.LicenseShortName.value);
        if (!/CC|Public domain|PD/i.test(lic)) continue;
        const f = `${s.id}-${got.length + 1}.jpg`;
        try { const r = await fetch(ii.thumburl || ii.url, { headers: { 'User-Agent': UA } }); if (!r.ok) throw new Error('HTTP ' + r.status); fs.writeFileSync(path.join(dir, f), Buffer.from(await r.arrayBuffer())); } catch (e) { console.log(s.id, 'download', e.message); continue; }
        got.push({ file: f, title: p.title, page: ii.descriptionurl, license: lic, artist: strip(m.Artist && m.Artist.value), desc: strip(m.ImageDescription && m.ImageDescription.value) });
        await sleep(250);
      }
      await sleep(250);
    }
    console.log(s.id, got.length, got.map(g => g.title).join(' | '));
    out.push({ id: s.id, name: s.name, photos: got });
  }
  fs.writeFileSync(path.join(__dirname, 'commons.json'), JSON.stringify(out, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
