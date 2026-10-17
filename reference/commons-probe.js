// 調査（一時的）：西尾と となりまちの名所の写真（2回目）を Wikimedia Commons（自由な利用許諾の写真）から探し、
// ドット絵を本物に近づけるための参考として小さな画像（幅640）と出典・利用許諾を reference/commons/ に保存する
const fs = require('fs'), path = require('path');
const UA = 'nishio-go-research/1.0 (https://github.com/shota0617/ricepia-judge)';
const T = [
  ['nishio-station', ['Meitetsu Nishio Station', 'Nishio Station Meitetsu Nishio Line', '名鉄西尾駅 駅舎']],
  ['nishio-cityhall', ['西尾市役所', 'Nishio City Hall']],
  ['shokoso', ['尚古荘 西尾', 'Shokoso Nishio']],
  ['nishio-shiryokan', ['西尾市資料館']],
  ['ibun-jinja', ['伊文神社']],
  ['wakuwaku', ['西条園 和く和く', 'あいや 西尾 抹茶']],
  ['glass-museum', ['三河工芸ガラス美術館']],
  ['michinoeki-okanoyama', ['道の駅にしお岡ノ山', '岡ノ山 西尾']],
  ['isshiki-suwa', ['一色諏訪神社', '三河一色大提灯']],
  ['isshiki-port', ['一色港 佐久島 船', '一色渡船']],
  ['benten-salon', ['弁天サロン 佐久島']],
  ['tombolo', ['前島 東幡豆', 'Higashihazu Maejima']],
  ['aichi-kodomo', ['愛知こどもの国']],
  ['munosato', ['無の里 合掌造り', '合掌造り 西尾']],
  ['tojo-jo', ['東条城 吉良', 'Tojo Castle Kira']],
  ['kezoji', ['華蔵寺 山門 吉良', 'Kezoji temple Kira']],
  ['myozenji', ['妙善寺 かぼちゃ寺', '妙善寺 西尾']],
  ['shio-no-sato', ['饗庭塩の里', '吉良 塩田']],
  ['kira-waikiki', ['吉良ワイキキビーチ', '宮崎海水浴場 吉良']],
  ['okazaki-castle', ['Okazaki Castle', '岡崎城 天守']],
  ['okazaki-kakukyu', ['カクキュー 八丁味噌', 'Hatcho Miso Kakukyu']],
  ['anjo-denpark', ['デンパーク 安城', 'Denpark Anjo']],
  ['hekinan-aquarium', ['碧南海浜水族館']],
  ['takahama-kawara-museum', ['かわら美術館 高浜', 'Takahama kawara museum']],
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
