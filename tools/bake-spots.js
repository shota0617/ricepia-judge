// にしおさんぽGO のふつうのスポット（神社・お寺・公園・史跡など）を、OpenStreetMap から前もって作る：node tools/bake-spots.js
// ゲームと同じ問い合わせ（nishio-go/osm-query.js）で取り、nishio-go/osm-spots.json に保存する。
// ゲームはまずこのファイルを使うので、遊ぶたびに Overpass に問い合わせなくてよく、混んでいて取れないこともない。
const fs = require('fs'), path = require('path');
const { ROOT, overpassFromNode } = require('./bake-common');
const { buildQuery, toItems } = require('../nishio-go/osm-query.js');

(async () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'nishio-go', 'spots.json'), 'utf8')).spots || [];
  const names = [...new Set(config.flatMap(c => (c && Array.isArray(c.match) ? c.match.filter(m => typeof m === 'string' && m) : [])))];
  const q = buildQuery(names);   // ゲームの問い合わせと1文字でも違うと使われないので、同じ作り方にする
  console.log(`注目スポットの名前 ${names.length} 件で問い合わせ`);
  const items = toItems(JSON.parse(await overpassFromNode('data=' + encodeURIComponent(q))));
  if (items.length < 100) throw new Error(`スポットが少なすぎます（${items.length} 件）。取得に失敗した可能性があります`);
  const count = {};
  for (const it of items) count[it[2]] = (count[it[2]] || 0) + 1;
  console.log(`${items.length} 件`, count);
  const out = path.join(ROOT, 'nishio-go', 'osm-spots.json');
  // 中身が前と同じなら書き換えない（毎週の自動実行で、時刻だけ変わったコミットを作らないように）
  try {
    const old = JSON.parse(fs.readFileSync(out, 'utf8'));
    if (old.q === q && JSON.stringify(old.items) === JSON.stringify(items)) { console.log('変更なし'); return; }
  } catch (e) { /* まだ無い */ }
  fs.writeFileSync(out, JSON.stringify({ _説明: 'tools/bake-spots.js が OpenStreetMap から作ったスポット（© OpenStreetMap contributors, ODbL）。q はゲームの問い合わせと同じ文字列', t: Date.now(), q, items }));
  console.log(`${path.relative(ROOT, out)}: ${fs.statSync(out).size} bytes`);
})().catch(e => { console.error(e); process.exit(1); });
