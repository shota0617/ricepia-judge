// 調査（一時的）：西尾と となりまちの名所の写真（3回目）を Wikimedia Commons（自由な利用許諾の写真）から探し、
// ドット絵を本物に近づけるための参考として小さな画像（幅640）と出典・利用許諾を reference/commons/ に保存する
const fs = require('fs'), path = require('path');
const UA = 'nishio-go-research/1.0 (https://github.com/shota0617/ricepia-judge)';
const T = [
  ['jissoji', ['実相寺 西尾', 'Jissoji Nishio']],
  ['kozenji', ['康全寺 西尾']],
  ['seiganji', ['盛巌寺 西尾']],
  ['kumaku-jinja', ['久麻久神社']],
  ['yatsuomote', ['八ツ面山', '八ツ面山 西尾']],
  ['choenji', ['長圓寺 西尾', '長円寺 西尾']],
  ['yojuji', ['養寿寺 西尾']],
  ['kojuin', ['紅樹院 西尾']],
  ['shokoso', ['尚古荘']],
  ['isshiki-manabi', ['一色学びの館']],
  ['koromozaki', ['衣崎 一色 干潟', '一色干潟']],
  ['sakushima-nishi', ['佐久島 西港', 'Sakushima west port']],
  ['sakushima-higashi', ['佐久島 東港']],
  ['benten-salon', ['弁天サロン', '佐久島 弁天']],
  ['oura-beach', ['大浦海水浴場 佐久島']],
  ['kogane-zutsumi', ['黄金堤 吉良']],
  ['ozaki-shiro', ['尾崎士郎記念館', '尾﨑士郎記念館']],
  ['kira-onsen', ['吉良温泉']],
  ['hazu-jinja', ['幡頭神社']],
  ['nishi-hazu', ['西幡豆駅']],
  ['higashi-hazu', ['東幡豆駅']],
  ['kodomonokuni-st', ['こどもの国駅 名鉄']],
  ['terabe-jo', ['寺部城 幡豆']],
  ['sangane-kannon', ['三ヶ根観音 山門', 'Sangane Kannon']],
  ['toba-shinmei', ['鳥羽神明社', '鳥羽の火祭り']],
  ['jofukuji', ['刈宿の大仏', '常福寺 西尾']],
  ['kasuya-tei', ['旧糟谷邸', '糟谷縫右衛門']],
  ['munosato', ['無の里 西尾', '合掌造り 愛知']],
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
