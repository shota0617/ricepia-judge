// にしおさんぽGO：OpenStreetMap からスポットを取るときの問い合わせと、取れた場所の分類
// ゲーム（game.js）と、前もってスポットを作るスクリプト（tools/bake-spots.js）の両方で使う
(function (root) {
'use strict';

// 正規表現の記号は「任意の1文字」に（取得側は広め、照合は game.js で厳密に）
const reEsc = t => t.replace(/[.*+?^${}()|[\]\\"']/g, '.');

// 注目スポットの名前（spots.json の match）でも探す。名前だけで見つかったものは注目スポットにのみ使う
const buildQuery = names => `[out:json][timeout:90];
area["name"="西尾市"]["admin_level"="7"]->.a;
(
  nwr["amenity"="place_of_worship"]["name"](area.a);
  nwr["historic"]["name"](area.a);
  nwr["tourism"~"^(attraction|museum|gallery|viewpoint|artwork|zoo|aquarium|theme_park)$"]["name"](area.a);
  nwr["leisure"~"^(park|garden|nature_reserve)$"]["name"](area.a);
  nwr["amenity"~"^(library|townhall)$"]["name"](area.a);
  nwr["railway"="station"]["name"](area.a);
  nwr["natural"~"^(beach|peak|cape)$"]["name"](area.a);
  nwr["waterway"="waterfall"]["name"](area.a);
  nwr["man_made"="lighthouse"]["name"](area.a);${names.length ? `
  nwr["name"~"${names.map(m => m.startsWith('=') ? `^${reEsc(m.slice(1))}$` : reEsc(m)).join('|')}"](area.a);` : ''}
);
out center tags;`;

function catOf(t) {
  if (t.amenity === 'place_of_worship') return t.religion === 'shinto' ? 'shrine' : t.religion === 'buddhist' ? 'temple' : 'worship';
  if (t.historic === 'castle') return 'castle';
  if (t.historic) return 'historic';
  if (t.tourism === 'museum' || t.tourism === 'gallery') return 'museum';
  if (t.tourism === 'viewpoint' || t.natural === 'peak' || t.natural === 'cape') return 'view';
  if (t.tourism === 'artwork') return 'art';
  if (t.tourism || t.waterway === 'waterfall' || t.man_made === 'lighthouse') return 'sight';
  if (t.leisure === 'park' || t.leisure === 'garden' || t.leisure === 'nature_reserve') return 'park';
  if (t.amenity === 'library') return 'library';
  if (t.amenity === 'townhall') return 'townhall';
  if (t.railway === 'station') return 'station';
  if (t.natural === 'beach') return 'beach';
  return 'other';   // 名前検索でだけ見つかったもの（ふつうのスポットにはしない）
}

// Overpass の答え（JSON）から、[id, 表示名, 分類, 緯度, 経度, OSMの名前] の一覧を作る
function toItems(json) {
  const items = [];
  for (const el of json.elements || []) {
    const t = el.tags || {};
    const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
    if (!t.name || lat == null || lng == null) continue;
    const cat = catOf(t);
    let name = t.name;
    if (cat === 'station' && !name.endsWith('駅')) name += '駅';
    items.push([el.type[0] + el.id, name, cat, +lat.toFixed(6), +lng.toFixed(6), t.name]);
  }
  return items;
}

// 街並みの目印（コンビニ・スーパー・ガソリンスタンドなど）。西尾の人が見て「あそこだ」と分かるように、名前つきで地図に出す
const LANDMARK_QUERY = `[out:json][timeout:120];
area["name"="西尾市"]["admin_level"="7"]->.a;
(
  nwr["shop"~"^(convenience|supermarket|mall|department_store|doityourself|hardware|furniture|chemist|drugstore|electronics|books|clothes|car|bakery|confectionery|tea)$"]["name"](area.a);
  nwr["amenity"~"^(fuel|bank|restaurant|fast_food|cafe|pharmacy|post_office)$"]["name"](area.a);
);
out center tags;`;
function landmarkKind(t) {
  const s = t.shop || '', a = t.amenity || '';
  if (s === 'convenience') return 'konbini';
  if (/^(supermarket|mall|department_store)$/.test(s)) return 'super';
  if (/^(doityourself|hardware|furniture)$/.test(s)) return 'home';
  if (/^(chemist|drugstore)$/.test(s) || a === 'pharmacy') return 'drug';
  if (a === 'fuel') return 'fuel';
  if (a === 'bank') return 'bank';
  if (a === 'post_office') return 'post';
  if (/^(restaurant|fast_food)$/.test(a)) return 'food';
  if (a === 'cafe' || /^(bakery|confectionery|tea)$/.test(s)) return 'cafe';
  return 'store';
}
// [緯度, 経度, 種類, 名前] の一覧
function toLandmarks(json) {
  const out = [];
  for (const el of json.elements || []) {
    const t = el.tags || {};
    const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
    if (!t.name || lat == null || lng == null) continue;
    out.push([+lat.toFixed(6), +lng.toFixed(6), landmarkKind(t), String(t.name).slice(0, 30)]);
  }
  return out;
}

const api = { buildQuery, catOf, toItems, LANDMARK_QUERY, landmarkKind, toLandmarks };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.NSG_OSM = api;
})(typeof window !== 'undefined' ? window : globalThis);
