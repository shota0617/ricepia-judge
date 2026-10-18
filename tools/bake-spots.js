// にしおさんぽGO のふつうのスポット（神社・お寺・公園・史跡など）と街並みの目印（コンビニ・スーパーなど）を、OpenStreetMap から前もって作る：node tools/bake-spots.js
// ゲームと同じ問い合わせ（nishio-go/osm-query.js）で取り、nishio-go/osm-spots.json に保存する。
// ゲームはまずこのファイルを使うので、遊ぶたびに Overpass に問い合わせなくてよく、混んでいて取れないこともない。
const fs = require('fs'), path = require('path');
const { ROOT, overpassFromNode: once } = require('./bake-common');
// 遊べる範囲が広いので、混んでいて時間切れになったら少し待って取り直す（3回まで）
async function overpassFromNode(body) {
  for (let i = 1; ; i++) {
    try { return await once(body); } catch (e) { if (i >= 3) throw e; console.log(`  ${i}回目 失敗。${60 * i}秒待って取り直す`); await new Promise(r => setTimeout(r, 60000 * i)); }
  }
}
const { buildQuery, buildQueryParts, toItems, LANDMARK_PARTS, toLandmarks } = require('../nishio-go/osm-query.js');
// 1回では重すぎるので、市町の中と、本店から15kmの円を囲む長方形の中を別々に取って合わせる（同じ場所は1つに）
async function fetchParts(parts, conv, key) {
  const seen = new Set(), out = [];
  for (const q of parts) for (const x of conv(JSON.parse(await overpassFromNode('data=' + encodeURIComponent(q))))) { const k = key(x); if (!seen.has(k)) { seen.add(k); out.push(x); } }
  return out;
}

(async () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'nishio-go', 'spots.json'), 'utf8')).spots || [];
  const names = [...new Set(config.flatMap(c => (c && Array.isArray(c.match) ? c.match.filter(m => typeof m === 'string' && m) : [])))];
  const q = buildQuery(names);   // ゲームの問い合わせと1文字でも違うと使われないので、同じ作り方にする
  console.log(`注目スポットの名前 ${names.length} 件で問い合わせ`);
  const items = await fetchParts(buildQueryParts(names), toItems, it => it[0]);
  if (items.length < 100) throw new Error(`スポットが少なすぎます（${items.length} 件）。取得に失敗した可能性があります`);
  const count = {};
  for (const it of items) count[it[2]] = (count[it[2]] || 0) + 1;
  console.log(`${items.length} 件`, count);
  await writeIfChanged(path.join(ROOT, 'nishio-go', 'osm-spots.json'), { _説明: 'tools/bake-spots.js が OpenStreetMap から作ったスポット（© OpenStreetMap contributors, ODbL）。q はゲームの問い合わせと同じ文字列', q, items }, j => j.q === q && JSON.stringify(j.items) === JSON.stringify(items));
  // 街並みの目印
  const marks = await fetchParts(LANDMARK_PARTS, toLandmarks, m => m.join('|'));
  if (marks.length < 50) throw new Error(`目印が少なすぎます（${marks.length} 件）`);
  const mc = {};
  for (const m of marks) mc[m[2]] = (mc[m[2]] || 0) + 1;
  console.log(`目印 ${marks.length} 件`, mc);
  await writeIfChanged(path.join(ROOT, 'nishio-go', 'landmarks.json'), { _説明: 'tools/bake-spots.js が OpenStreetMap から作った街並みの目印（© OpenStreetMap contributors, ODbL）。[緯度, 経度, 種類, 名前]', items: marks }, j => JSON.stringify(j.items) === JSON.stringify(marks));
})().catch(e => { console.error(e); process.exit(1); });

// 中身が前と同じなら書き換えない（毎週の自動実行で、時刻だけ変わったコミットを作らないように）
async function writeIfChanged(out, data, same) {
  try { if (same(JSON.parse(fs.readFileSync(out, 'utf8')))) { console.log(`${path.relative(ROOT, out)}: 変更なし`); return; } } catch (e) { /* まだ無い */ }
  fs.writeFileSync(out, JSON.stringify({ ...data, t: Date.now() }));
  console.log(`${path.relative(ROOT, out)}: ${fs.statSync(out).size} bytes`);
}
