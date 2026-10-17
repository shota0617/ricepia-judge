// 調査（一時的）：西尾のおもな名所の写真を Wikimedia Commons（自由な利用許諾の写真）から探し、
// ドット絵を本物に近づけるための参考として小さな画像（幅640）と出典・利用許諾を reference/commons/ に保存する
const fs = require('fs'), path = require('path');
const UA = 'nishio-go-research/1.0 (https://github.com/shota0617/ricepia-judge)';
const T = [
  ['nishio-castle', ['西尾城 丑寅櫓', 'Nishio Castle', '西尾市歴史公園']],
  ['iwase-bunko', ['岩瀬文庫', 'Iwase Bunko']],
  ['konoe-tei', ['旧近衛邸 西尾', '旧近衛邸']],
  ['nishio-station', ['西尾駅 名鉄', 'Nishio Station Aichi']],
  ['isshiki-sakana', ['一色さかな広場']],
  ['ohirune-house', ['おひるねハウス 佐久島', 'Ohirune House Sakushima']],
  ['kamome-parking', ['カモメの駐車場 佐久島']],
  ['kurokabe', ['佐久島 黒壁', 'Sakushima']],
  ['kezoji', ['華蔵寺 吉良', '華蔵寺 西尾']],
  ['konrenji', ['金蓮寺 弥陀堂', 'Konrenji Amida-do']],
  ['tombolo', ['前島 東幡豆', 'トンボロ 東幡豆']],
  ['sangane-kannon', ['三ヶ根観音', '三ヶ根山']],
  ['inariyama-chaen', ['稲荷山茶園', '西尾 茶畑']],
  ['kira-yoshida', ['吉良吉田駅']],
  ['munosato', ['無の里 合掌造り 西尾']],
];
const api = async q => {
  const u = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: q, gsrnamespace: '6', gsrlimit: '6', prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '640' });
  const r = await fetch(u, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  return Object.values((j.query && j.query.pages) || {}).sort((a, b) => a.index - b.index);
};
const strip = s => String(s || '').replace(/<[^>]+>/g, '').trim().slice(0, 200);
(async () => {
  const dir = path.join(__dirname, 'commons'); fs.mkdirSync(dir, { recursive: true });
  const out = [];
  for (const [id, qs] of T) {
    const seen = new Set(), got = [];
    for (const q of qs) {
      if (got.length >= 3) break;
      let pages = [];
      try { pages = await api(q); } catch (e) { console.log(id, q, e.message); continue; }
      for (const p of pages) {
        const ii = p.imageinfo && p.imageinfo[0];
        if (!ii || seen.has(p.title) || !/jpeg|png/.test(ii.mime || '') || got.length >= 3) continue;
        seen.add(p.title);
        const m = ii.extmetadata || {}, lic = strip(m.LicenseShortName && m.LicenseShortName.value);
        if (!/CC|Public domain|PD/i.test(lic)) continue;   // 自由な利用許諾のものだけ
        const f = `${id}-${got.length + 1}.jpg`;
        try {
          const r = await fetch(ii.thumburl, { headers: { 'User-Agent': UA } });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          fs.writeFileSync(path.join(dir, f), Buffer.from(await r.arrayBuffer()));
        } catch (e) { console.log(id, 'download', e.message); continue; }
        got.push({ file: f, title: p.title, page: ii.descriptionurl, license: lic, artist: strip(m.Artist && m.Artist.value), desc: strip(m.ImageDescription && m.ImageDescription.value) });
        await new Promise(r => setTimeout(r, 300));
      }
    }
    console.log(id, got.length, got.map(g => g.title).join(' | '));
    out.push({ id, photos: got });
  }
  fs.writeFileSync(path.join(__dirname, 'commons.json'), JSON.stringify(out, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
