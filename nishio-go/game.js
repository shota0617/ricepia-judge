/* にしおさんぽGO — 西尾市を歩いてスポットを巡るポイントラリー
 * 外部ライブラリ：Leaflet のみ。データはすべて localStorage（キー接頭辞 nsg_）。 */
(() => {
'use strict';

// 版（edition.js）：shops が false の版（西尾市版・提案用デモ）では、当店・特典・キャンペーンを出さない
const ED = window.NSG_EDITION || { id: 'shop', shops: true };
const CFG = {
  center: [34.8625, 137.0570],            // 名鉄西尾駅〜西尾城跡のあたり
  nishioBounds: [[34.69, 136.96], [34.93, 137.21]], // 西尾市（佐久島を含む）のおおよその範囲
  home: window.NSG_OSM.HOME,   // 近藤米穀店（本店）から半径15kmも遊べる範囲（刈谷・知立・半田・東浦・阿久比・武豊など、市町の外も。osm-query.js）
  reach: 40,                // チェックインできる距離（m）
  reachApprox: 120,         // 位置が概算の注目スポットは広めに
  accSlack: 25,             // GPS誤差として上乗せする最大値（m）
  maxAccuracy: 80,          // これより精度が悪いとチェックイン不可（m）
  cooldownMin: 60,          // 同じスポットに再チェックインできるまで（分）
  pts: { normal: 10, featured: 30, first: 30, firstFeatured: 100, daily: 20, streakStep: 5, streakMax: 6, questAll: 50 },
  walkUnitM: 100,           // 100m 歩くごとに
  walkUnitPts: 1,           //   1pt
  walkDailyCap: 100,        // 歩数ポイントは1日100ptまで
  walkMaxAcc: 35,           // 歩数計測に使うGPS精度の上限（m）
  walkMaxSpeed: 4.5,        // m/s（約16km/h：ジョギングまで）
  walkMaxGapSec: 180,       // 位置の更新がこれ以上途切れたら、その間の移動は数えない
  vehicleSpeed: 8.5,        // m/s（約30km/h：これを超えたら乗り物とみなす）
  vehicleLockMs: 120000,    // 乗り物判定後、チェックインを止める時間
  matchRadius: 1000,        // 注目スポットの名前をOSMから探す範囲（m）：座標が概算のとき
  matchRadiusExact: 300,    //   座標が確かなとき
  osmCacheDays: 7,
  overpass: ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'],
};

// 遊べる市町（西尾市と となりの市町）の境界は region.js（tools/bake-region.js が OpenStreetMap から作る）
const REGION = (window.NISHIO_REGION && Array.isArray(window.NISHIO_REGION.cities)) ? window.NISHIO_REGION.cities : [];
// 点が輪の中か（偶奇規則）
function inRing(lat, lng, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][0] > lat) !== (r[j][0] > lat) && lng < (r[j][1] - r[i][1]) * (lat - r[i][0]) / (r[j][0] - r[i][0]) + r[i][1]) inside = !inside;
  }
  return inside;
}
// いまいる市町（region.js の city）。どこにも入らなければ null
function cityAt(lat, lng) {
  for (const c of REGION) {
    if (lat < c.bbox[0][0] || lat > c.bbox[1][0] || lng < c.bbox[0][1] || lng > c.bbox[1][1]) continue;
    if (c.rings.some(r => inRing(lat, lng, r))) return c;
  }
  return null;
}
// いまいる市町の表示用：境のすぐ外（海辺・橋の上など。約300m以内）は、となりあう市町にする
const PAD_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function cityNear(lat, lng) {
  const c = cityAt(lat, lng);
  if (c) return c;
  for (const [a, b] of PAD_DIRS) { const n = cityAt(lat + a * 0.003, lng + b * 0.003); if (n) return n; }
  return null;
}
// 本店から15kmの円にかかる、7市町より外の市町の境界（region.js の around。遊べる範囲には使わず、いまどのまちにいるかだけ）
const AROUND = (window.NISHIO_REGION && Array.isArray(window.NISHIO_REGION.around)) ? window.NISHIO_REGION.around : [];
function aroundAt(lat, lng) {
  for (const c of AROUND) {
    if (lat < c.bbox[0][0] || lat > c.bbox[1][0] || lng < c.bbox[0][1] || lng > c.bbox[1][1]) continue;
    if (c.rings.some(r => inRing(lat, lng, r))) return c;
  }
  return null;
}
// 表示用の市町：まず境界の中にぴったり入る市町（7市町、まわりの市町の順）。どこにも入らない海辺・橋の上などだけ、境のすぐ外（約300m）の7市町にする
const placeAt = (lat, lng) => cityAt(lat, lng) || aroundAt(lat, lng) || cityNear(lat, lng);
// 本店からの距離（m）。半径 CFG.home.r の円も遊べる範囲
const M_PER_LNG = 111320 * Math.cos(CFG.home.lat * Math.PI / 180);
const homeDist = (lat, lng) => Math.hypot((lat - CFG.home.lat) * 111320, (lng - CFG.home.lng) * M_PER_LNG);
const HOME_BOX = [[CFG.home.lat - CFG.home.r / 111320, CFG.home.lng - CFG.home.r / M_PER_LNG], [CFG.home.lat + CFG.home.r / 111320, CFG.home.lng + CFG.home.r / M_PER_LNG]];
// 遊べる範囲のおおよその長方形（西尾市の範囲、となりの市町の範囲、本店から15kmの円をあわせたもの）
const playBounds = REGION.reduce((b, c) => [[Math.min(b[0][0], c.bbox[0][0]), Math.min(b[0][1], c.bbox[0][1])], [Math.max(b[1][0], c.bbox[1][0]), Math.max(b[1][1], c.bbox[1][1])]],
  [[Math.min(CFG.nishioBounds[0][0], HOME_BOX[0][0]), Math.min(CFG.nishioBounds[0][1], HOME_BOX[0][1])], [Math.max(CFG.nishioBounds[1][0], HOME_BOX[1][0]), Math.max(CFG.nishioBounds[1][1], HOME_BOX[1][1])]]);
// となりの市町の地区 id（areas.json・spots.json の area）
const NEAR_AREAS = new Set(['okazaki', 'anjo', 'hekinan', 'kota', 'gamagori', 'takahama']);
// 境界は約60mに間引いてあるので、境のすぐ外（約300m以内）も遊べる範囲にする（境の上にある名所が外にならないように。区画の判定と同じ幅）
const PLAY_PAD = 0.003;
const inPlay = (lat, lng) => (lat > CFG.nishioBounds[0][0] && lat < CFG.nishioBounds[1][0] && lng > CFG.nishioBounds[0][1] && lng < CFG.nishioBounds[1][1])
  || homeDist(lat, lng) <= CFG.home.r + 300
  || [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([a, b]) => !!cityAt(lat + a * PLAY_PAD, lng + b * PLAY_PAD));

// OpenStreetMap への問い合わせと分類は osm-query.js（tools/bake-spots.js と共通）
const { buildQuery, buildQueryParts, toItems } = window.NSG_OSM;

const CATS = {
  featured: { i: '⭐', n: '注目スポット' },
  shrine:   { i: '⛩️', n: '神社' },
  temple:   { i: '🪷', n: 'お寺' },
  worship:  { i: '🙏', n: '祈りの場' },
  castle:   { i: '🏯', n: '城跡' },
  historic: { i: '📜', n: '史跡' },
  museum:   { i: '🏛️', n: '博物館・資料館' },
  view:     { i: '🌄', n: '展望スポット' },
  art:      { i: '🗿', n: 'アート' },
  sight:    { i: '📸', n: '名所' },
  park:     { i: '🌳', n: '公園' },
  library:  { i: '📚', n: '図書館' },
  station:  { i: '🚉', n: '駅' },
  townhall: { i: '🏛️', n: '市役所・支所' },
  beach:    { i: '🏖️', n: '海岸' },
};

const TITLES = [
  [1, 'さんぽビギナー'], [3, 'まちあるき見習い'], [5, '西尾っ子ウォーカー'], [8, '抹茶ロード探検家'],
  [12, '六万石の旅人'], [16, '西尾・一色・吉良・幡豆めぐり名人'], [20, 'にしおマイスター'], [30, '西尾城主'],
];

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtM = m => m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1) + 'km' : Math.round(m) + 'm';
const pad2 = n => String(n).padStart(2, '0');
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); };
const fmtTime = t => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

function dist(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* ---------- 保存 ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* noop */ } },
};
// アクセス解析（analytics.js）。現在地の座標は送らない
const track = (name, params) => { if (window.nsgTrack) nsgTrack(name, params); };
const OSM_KEY = 'nsg_osm_v1';

function freshState() {
  return { v: 1, points: 0, total: 0, checkins: 0, walked: 0, walkCarry: 0, walkDay: { date: '', pts: 0 },
    visits: {}, log: [], streak: { last: '', days: 0, max: 0 }, badges: [], coupons: [], day: null, facts: [], met: [],
    guide: null, guides: 0, guideDone: [], idle: { last: 0, lv: {} }, dots: [] };
}
let demo = store.get('nsg_mode', 'real') === 'demo';
// 記録は版ごとに分ける（西尾市版は nsg_state_city など。お店の版で行った当店の記録や、当店への行き先を持ちこまない）
const stateKey = () => (demo ? 'nsg_state_demo' : 'nsg_state') + (ED.shops ? '' : '_' + ED.id);
function loadState() {
  const s = store.get(stateKey(), null);
  return s && s.v === 1 ? Object.assign(freshState(), s) : freshState();
}
let S = loadState();
const session = { start: Date.now(), on: false, gained: 0, rewards: 0 };   // 1回に遊んだ間のこと（離脱を減らす：session_end）
const modeListeners = [];   // あるいて移動／操作して移動の切り替えを知らせる先（pixel.js）
const save = () => { if (!store.set(stateKey(), S)) toast('記録を保存できませんでした（ブラウザの保存領域を確認してください）'); };

/* ---------- 地図 ---------- */
if (!window.L) {
  $('status').textContent = '地図を読み込めませんでした。通信環境を確認して再読み込みしてください。';
  $('intro').hidden = true;
  return;
}
const map = L.map('map', { zoomControl: false, minZoom: 11, maxZoom: 19,
  maxBounds: L.latLngBounds([playBounds[0][0] - 0.15, playBounds[0][1] - 0.15], [playBounds[1][0] + 0.15, playBounds[1][1] + 0.15]), maxBoundsViscosity: 0.8 })
  .setView(CFG.center, 15);
L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
  minZoom: 5, maxNativeZoom: 18, maxZoom: 19,
  attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a> | スポット © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
}).addTo(map);
L.control.zoom({ position: 'topright' }).addTo(map);

let follow = true;
map.on('dragstart', () => { follow = false; });

/* ---------- スポット ---------- */
let spots = [], spotsVersion = 0;   // spotsVersion：スポットの一覧を入れ替えるたびに1つ増やす（たからばこの置き直しに使う）
let spotMeta = { osm: 0, osmAt: 0, osmOk: false, featured: 0 };
const markers = new Map();

async function fetchOverpass(query) {
  let lastErr;
  for (const url of CFG.overpass) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 45000);
    try {
      const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (json.remark && /error|runtime/i.test(json.remark)) throw new Error(json.remark);   // 時間切れでも200で返ることがある
      const items = toItems(json);
      if (!items.length) throw new Error('0件');
      return items;
    } catch (e) { lastErr = e; } finally { clearTimeout(timer); }
  }
  throw lastErr || new Error('取得失敗');
}

function matchesOf(c) { return Array.isArray(c.match) ? c.match.filter(m => typeof m === 'string' && m) : []; }

function nameMatches(osmName, m) {
  return m.startsWith('=') ? osmName === m.slice(1) : osmName.includes(m);
}

function buildSpots(config, osmItems) {
  // 遊べる範囲の中だけ（OpenStreetMap には本店から15kmの円を囲む長方形で問い合わせるので、円の外の角のものを除く）
  const osm = osmItems.filter(it => inPlay(it[3], it[4])).map(([id, name, cat, lat, lng, raw]) => ({ id, name, raw: raw || name, cat, lat, lng }));
  // spots.json の normal: true は、ふつうのスポットとして足す（OpenStreetMap にない社寺を Wikidata から足したもの）
  for (const c of config) if (c && c.normal && c.id && c.name && Number.isFinite(c.lat) && Number.isFinite(c.lng))
    osm.push({ id: 'n-' + c.id, name: String(c.name), raw: String(c.name), cat: CATS[c.cat] ? c.cat : 'sight', lat: c.lat, lng: c.lng });
  const used = new Set();
  const num = (v, max) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : undefined; };
  const featured = [];
  for (const c of config) {
    if (!c || !c.id || !c.name || c.normal || (c.shop && !ED.shops)) continue;
    const hasPos = Number.isFinite(c.lat) && Number.isFinite(c.lng);
    const s = { id: 'f-' + c.id, name: String(c.name), cat: 'featured', kind: CATS[c.cat] ? c.cat : 'featured',
      icon: c.icon || '⭐', lat: c.lat, lng: c.lng, featured: true, approx: hasPos && !!c.approx,
      points: num(c.points, 500), reach: num(c.reach, 300), desc: c.desc ? String(c.desc) : '',
      area: typeof c.area === 'string' ? c.area : null,
      shop: !!c.shop, url: typeof c.url === 'string' && /^https:\/\//.test(c.url) ? c.url : '',
      // 協賛スポット（地元のお店など）：名前・ひとこと・サイト（https のみ）
      sponsor: c.sponsor && typeof c.sponsor.name === 'string' ? { name: String(c.sponsor.name), text: c.sponsor.text ? String(c.sponsor.text) : '', url: typeof c.sponsor.url === 'string' && /^https:\/\//.test(c.sponsor.url) ? c.sponsor.url : '' } : null };
    const match = matchesOf(c);
    const cands = match.length ? osm.filter(o => !used.has(o.id) && match.some(m => nameMatches(o.raw, m))) : [];
    let best = null;
    if (hasPos) {
      // 近くで名前が一致するものがあれば、その位置に補正する（確かな座標は300m、概算の座標は1km以内だけ）
      let bestD = c.approx ? CFG.matchRadius : CFG.matchRadiusExact;
      for (const o of cands) { const d = dist(s, o); if (d < bestD) { best = o; bestD = d; } }
    } else if (cands.length && cands.every(o => dist(o, cands[0]) < 500)) {
      best = cands[0];   // 座標なし：名前が一致する場所が1か所に絞れたときだけ使う（同名が離れて複数あれば出さない）
    }
    if (best) {
      s.lat = best.lat; s.lng = best.lng; s.approx = false;
      if (s.kind === 'featured' && best.cat !== 'other') s.kind = best.cat;
      cands.filter(o => dist(o, best) < 500).forEach(o => used.add(o.id));
    } else if (!hasPos) {
      continue;          // 位置が分からないスポットは地図に出さない
    }
    featured.push(s);
  }
  // 注目スポットのすぐ近く（同じ場所の重複）や、同名で近いものは除く
  const kept = [];
  const grid = new Map();
  const cell = p => `${Math.floor(p.lat / 0.0025)}:${Math.floor(p.lng / 0.0025)}`; // 経度0.0025°≒228m（200m以上）
  const neighbors = p => {
    const [a, b] = cell(p).split(':').map(Number), out = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push(...(grid.get(`${a + i}:${b + j}`) || []));
    return out;
  };
  const add = p => { kept.push(p); const k = cell(p); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); };
  featured.forEach(add);
  for (const o of osm) {
    if (used.has(o.id) || o.cat === 'other') continue;
    const clash = neighbors(o).some(k => {
      const d = dist(k, o);
      return d < 20 || (k.featured && d < 30) || (k.name === o.name && d < 200);
    });
    if (!clash) add(o);
  }
  return kept;
}

/* ---------- 地区（西尾・一色・吉良・幡豆・佐久島）：areas.json ---------- */
let areas = [];
async function loadAreas() {
  try {
    const res = await fetch('nishio-go/areas.json', { cache: 'no-cache' });
    const json = res.ok ? await res.json() : null;
    if (json && Array.isArray(json.areas)) areas = json.areas.filter(a => a && a.id && a.name && Number.isFinite(a.lat) && Number.isFinite(a.lng));
  } catch (e) { /* 地区ガイドなしで続行 */ }
  if (spotMeta.loaded) renderLog();
}
// 地区ごとの注目スポット数と、めぐった数
function areaProgress(id) {
  const list = spots.filter(s => s.featured && s.area === id);
  return { list, total: list.length, done: list.filter(s => S.visits[s.id]).length };
}

// 前もって作ったスポット（nishio-go/osm-spots.json）。無い・壊れているときは null
async function loadBaked() {
  try {
    const res = await fetch('nishio-go/osm-spots.json', { cache: 'no-cache' });
    const j = res.ok ? await res.json() : null;
    return j && Array.isArray(j.items) && j.items.length ? j : null;
  } catch (e) { return null; }
}

let spotsLoading = null;
function loadSpots(force) {
  if (!spotsLoading) {
    spotsLoading = doLoadSpots(force)
      .catch(() => toast('スポットの読み込みに失敗しました。もう一度お試しください。'))
      .finally(() => { spotsLoading = null; refreshNearby(); });
    refreshNearby();
  }
  return spotsLoading;
}
async function doLoadSpots(force) {
  let config = [];
  try {
    const res = await fetch('nishio-go/spots.json', { cache: 'no-cache' });
    const json = res.ok ? await res.json() : null;
    if (json && Array.isArray(json.spots)) config = json.spots;
  } catch (e) { /* 注目スポットなしで続行 */ }

  // 取得を待つ間も、位置が確かな注目スポット（概算でないもの）は先に見せる
  if (!spots.length) { spots = buildSpots(config.filter(c => c && !c.approx), []); spotsVersion++; renderMarkers(); refreshNearby(); }

  let ok = false;
  const names = [...new Set(config.flatMap(c => (c ? matchesOf(c) : [])))], query = buildQuery(names);   // query はキャッシュの見分けに使う
  const stored = store.get(OSM_KEY, null);
  const cached = stored && stored.q === query ? stored : null;   // 注目スポットの名前が変わったら取り直す
  let items = null, baked = null;
  if (!force && cached && Date.now() - cached.t < CFG.osmCacheDays * 864e5) {
    items = cached.items; spotMeta.osmAt = cached.t; spotMeta.osmOk = true; ok = true;
  } else if (!force && (baked = await loadBaked()) && baked.q === query) {
    // 前もって作ったスポット（osm-spots.json：GitHub Actions が毎週作り直す）。問い合わせが同じならそのまま使う
    items = baked.items; spotMeta.osmAt = baked.t; spotMeta.osmOk = true; ok = true;
  } else {
    try {
      // 1回で全部は重くて時間切れになりやすいので、市町の中と本店から15kmの長方形の中に分けて取り、同じ場所は1つにする（tools/bake-spots.js と同じ）
      const seen = new Set();
      items = [];
      for (const q of buildQueryParts(names)) for (const it of await fetchOverpass(q)) if (!seen.has(it[0])) { seen.add(it[0]); items.push(it); }
      spotMeta.osmAt = Date.now(); spotMeta.osmOk = true; ok = true;
      if (!store.set(OSM_KEY, { t: spotMeta.osmAt, q: query, items })) store.del(OSM_KEY);
    } catch (e) {
      const old = cached || stored || baked || (await loadBaked());   // 取得できなければ古いキャッシュや前もって作ったスポットでも使う
      if (old) { items = old.items; spotMeta.osmAt = old.t; spotMeta.osmOk = true; }
      else if (!force) toast('スポット情報（OpenStreetMap）を取得できませんでした。注目スポットだけで遊べます。');
    }
  }
  spots = buildSpots(config, items || []);
  spotsVersion++;
  spotMeta.osm = (items || []).length;
  spotMeta.featured = spots.filter(s => s.featured).length;
  spotMeta.loaded = true;
  markers.forEach(m => m.remove());
  markers.clear();
  renderMarkers();
  npcMarkers.forEach(m => m.remove()); npcMarkers.clear();
  renderNpcMarkers();
  refreshNearby();
  renderSpotInfo();
  return ok;
}

const iconOf = s => s.featured ? s.icon : (CATS[s.cat] || CATS.sight).i;
const reachOf = s => s.reach || (s.featured && s.approx ? CFG.reachApprox : CFG.reach);
const cooldownLeft = s => { const v = S.visits[s.id]; return v ? Math.max(0, v.last + CFG.cooldownMin * 60000 - Date.now()) : 0; };
const ptsOf = s => s.featured ? (s.points || CFG.pts.featured) : CFG.pts.normal;
function inReach(s) {
  if (!me) return false;
  return dist(me, s) <= reachOf(s) + Math.min(me.acc || 0, CFG.accSlack);
}

function spotState(s) {
  const cls = ['spot'];
  if (s.featured) cls.push('feat');
  if (s.shop) cls.push('shop', s.id === 'f-ricepia' ? 'shop-ricepia' : 'shop-kondo');   // 札は本物の看板と同じ色の店名（style.css）
  if (cooldownLeft(s) > 0) cls.push('cool');
  else if (inReach(s)) cls.push('near');
  if (S.visits[s.id]) cls.push('visited');
  return cls.join(' ');
}

function makeIcon(s, cls) {
  const size = s.shop ? 50 : s.featured ? 42 : 34;
  const sign = s.shop ? ` data-sign="${esc(s.id === 'f-ricepia' ? 'らいすぴあ・秀幸' : '近藤米穀店')}"` : '';
  return L.divIcon({ className: '', html: `<div class="${cls}"${sign}>${iconOf(s)}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

function popupHtml(s) {
  const c = s.featured ? null : (CATS[s.cat] || CATS.sight);
  const v = S.visits[s.id];
  const left = cooldownLeft(s);
  const d = me ? fmtM(dist(me, s)) : '—';
  return `<div class="popup"><h4>${esc(s.name)}</h4>
    <p>${s.shop ? `<span class="tag shop">🍚 当店（${esc(s.name)}）</span>` : s.featured ? '<span class="tag gold">⭐ 注目スポット</span>' : `<span class="tag">${c.i} ${c.n}</span>`}
    <span class="tag">${ptsOf(s)}pt</span></p>
    ${s.desc ? `<p>${esc(s.desc)}</p>` : ''}
    ${s.sponsor ? `<p class="sponsor"><span class="tag">🤝 協賛</span> <b>${esc(s.sponsor.name)}</b>${s.sponsor.text ? `：${esc(s.sponsor.text)}` : ''}${s.sponsor.url ? `<br><a class="btn mini" href="${esc(utmUrl(s.sponsor.url, 'sponsor'))}" target="_blank" rel="noopener" data-sponsor="${esc(s.id)}">${esc(s.sponsor.name)}のサイト</a>` : ''}</p>` : ''}
    ${spotEvents(s).map(x => `<p class="ev">📅 ${esc(x.when)}　${esc(x.e.name)}</p>`).join('')}
    ${spotMeibutsu(s).map(m => `<p class="mb">${m.icon} <b>${esc(m.name)}</b>：${esc(m.note)}</p>`).join('')}
    <p>現在地から ${d}${s.approx ? '（位置は概算・広めに判定）' : ''}</p>
    <p>${v ? `訪問 ${v.n}回・最後 ${fmtTime(v.last)}` : 'まだ行ったことがありません'}</p>
    ${left ? `<p>再チェックインまで あと${Math.ceil(left / 60000)}分</p>` : ''}
    ${s.shop ? `<p class="shop-links">${s.url ? `<a class="btn mini" href="${esc(s.url)}" target="_blank" rel="noopener">お店のサイト</a>` : ''}
      <a class="btn mini" href="https://www.google.com/maps/dir/?api=1&amp;destination=${s.lat},${s.lng}" target="_blank" rel="noopener">道案内（Googleマップ）</a></p>` : ''}
    ${demo ? `<button type="button" class="btn mini" data-move="${esc(s.id)}">ここへ移動（操作モード）</button>` : ''}</div>`;
}

function renderMarkers() {
  const b = map.getBounds().pad(0.25);
  const zoomOk = map.getZoom() >= 14;
  for (const s of spots) {
    const show = b.contains([s.lat, s.lng]) && (zoomOk || s.featured);
    let m = markers.get(s.id);
    if (show) {
      const cls = spotState(s);
      if (!m) {
        m = L.marker([s.lat, s.lng], { icon: makeIcon(s, cls), zIndexOffset: s.featured ? 500 : 0, keyboard: false })
          .bindPopup(() => popupHtml(s), { closeButton: true, autoPanPaddingBottomRight: [10, 140] })
          .addTo(map);
        m._cls = cls;
        markers.set(s.id, m);
      } else if (m._cls !== cls) {
        m.setIcon(makeIcon(s, cls)); m._cls = cls;
      }
    } else if (m) {
      m.remove(); markers.delete(s.id);
    }
  }
}
map.on('moveend zoomend', () => { renderMarkers(); renderNpcMarkers(); });
map.on('zoomend', () => refreshNearby());

/* ---------- 西尾の人たち（npcs.js：話しかけられる町の人） ----------
   注目スポットのそばに立つ。近くで話しかけると、その土地の話（出典のある事実）をしてくれる。はじめて話すと +10pt */
const NPC_LOOK = { elder: '👴', granny: '👵', man: '👨', woman: '👩', kid: '🧒', student: '🧑‍🎓', fisher: '🎣', staff: '🧑‍🌾', guide: '🧑‍🏫', monk: '🧑‍🦲' };
const NPC_TALK_M = { play: 30, walk: 60 };   // 話しかけられる距離（m）
let npcs = [], npcsVersion = -1;
function placeNpcs() {
  if (npcsVersion === spotsVersion) return npcs;
  npcsVersion = spotsVersion;
  npcs = [];
  for (const n of window.NISHIO_NPCS || []) {
    const s = spots.find(x => x.id === 'f-' + n.spot);
    if (!s) continue;   // そのスポットが地図に出ていなければ、その人も出さない
    const [e, nn] = Array.isArray(n.off) ? n.off : [20, 20];
    npcs.push({ ...n, spotName: s.name, lat: s.lat + nn / 111320, lng: s.lng + e / (111320 * Math.cos(s.lat * Math.PI / 180)) });
  }
  return npcs;
}
const npcMet = id => (S.met || []).includes(id);
// area があるのは となりの市町の人（バッジを「西尾の人」と分ける）
const NPC_NISHIO = (window.NISHIO_NPCS || []).filter(n => !n.area), NPC_NEAR = (window.NISHIO_NPCS || []).filter(n => n.area);
// 話す中身：その人のことばと、その場所で今月・来月にある行事の話
function npcPages(n) {
  const pages = n.lines.slice(), now = new Date();
  if (KO) {
    pages[0] = KO.daypart(now).greet + pages[0];   // 時間帯のあいさつ
    const h = KO.seasonSpots(now).find(x => x.spot === n.spot);
    if (h) pages.push(`いまは${h.text}だに。ちょうどええ時に来たねえ。`);
    if (KO.doyoUshi(now) && MEIBUTSU.some(m => m.id === 'unagi' && m.spots.includes(n.spot))) pages.push('きょうは土用の丑の日。うなぎを食べる人が多い日だもんで、一色のうなぎも大いそがしだに。');
  }
  const wx = weatherNow();   // 天気のひとこと
  if (wx) pages.push(wx.raining ? (wx.kind === 'snow' ? '雪がふっとるねえ。すべらんように気をつけりんよ。' : '雨の中、よう来たねえ。ぬれんように気をつけりんよ。')
    : wx.temp !== null && wx.temp >= 30 ? 'きょうは暑いねえ。水分をとって、休み休み歩きりんよ。'
    : wx.temp !== null && wx.temp <= 5 ? 'きょうは冷えるねえ。あったかくして歩きりんよ。'
    : wx.kind === 'sunny' ? 'ええ天気だねえ。歩くのにちょうどええわ。' : 'くもっとるけど、歩くにはちょうどええね。');
  const ev = spotEvents({ id: 'f-' + n.spot });
  if (ev.length) pages.push(`そうそう、${ev.map(x => `${x.when}に「${x.e.name}」`).join('、')}があるもんで、よかったら来てみりん。`);
  if (S.guide && S.guide.byId === n.id) pages.push(`🧭 ${S.guide.why}`);   // この人がすすめた次の行き先
  return pages;
}
// 人の立つ所。ドット絵の地図では、決めた位置が建物や水のとき近くの歩けるマスへずらして描くので、そのマスの中心にする
function npcSpot(n) {
  const P = window.nishioPixel;
  if (!P || !document.body.classList.contains('px')) return n;
  const t = P.npcTile(n);
  return t.ok ? P.toLatLng(t.x + 0.5, t.y + 0.5) : n;
}
// 話しかける（近くにいれば話す。はじめてなら +10pt）。戻り値：{ html, near }
function talkNpc(id, page = 0) {
  const n = placeNpcs().find(x => x.id === id);
  if (!n) return null;
  const d = me ? dist(me, npcSpot(n)) : Infinity, lim = demo ? NPC_TALK_M.play : NPC_TALK_M.walk;
  const head = `<div class="popup npc"><h4>${NPC_LOOK[n.look] || '🙂'} ${esc(n.name)}</h4><p class="npc-at">${esc(n.spotName)}のそば</p>`;
  if (driving) return { near: false, html: `${head}<p class="npc-say">（車に乗ったままでは話せない。車を降りて話しかけてみよう）</p></div>` };
  if (d > lim) {
    return { near: false, html: `${head}<p class="npc-say">（遠くて声が届かない。近づいて話しかけてみよう${Number.isFinite(d) ? `：あと${fmtM(d - lim)}` : ''}）</p>
      ${demo ? `<button type="button" class="btn mini" data-move-npc="${esc(n.id)}">近くへ移動（操作モード）</button>` : ''}</div>` };
  }
  const say = [];   // 知らせ（はじめて話した・イベント達成・イベント）はまとめて1つに
  if (page === 0 && !npcMet(n.id)) {
    S.met = [...(S.met || []), n.id];
    S.log.unshift({ type: 'npc', t: Date.now(), pts: 10, name: `${n.name}と話した`, icon: NPC_LOOK[n.look] || '💬' });
    const lvUp = gainPoints(10);
    save();
    sound.jingle(lvUp ? 'levelup' : 'checkin');
    say.push(`💬 はじめて話した：${n.name} +10pt${lvUp ? `　🎉 Lv${lvUp}` : ''}`);
    track('npc_talk', { npc: n.id, mode: demo ? 'play' : 'walk' });
    setTimeout(checkBadges, 800);
  }
  // 話しかけると、この人の話で次の行き先が決まる（同じ人と話し続けている間は変えない）
  // GPS の精度が悪いあいだは、話はできても行き先は変えない（精度が上がってから話しかければ、着いたことになる）
  if (page === 0 && fixOk() && !(S.guide && S.guide.byId === n.id)) {
    if (S.guide && S.guide.kind === 'npc' && S.guide.id === n.id) {   // すすめられた人に会えた
      const pts = guideReward(S.guide);
      say.push(`🎉 ${S.guide.byId ? 'イベント達成：' : ''}${n.name}に会えた${pts ? ` +${pts}pt` : ''}`);
    }
    // 人の話で行き先が決まったら、イベント（みちしるべが案内し、おまかせ歩きならそこへ向かう）
    const g = decideGuide(n);
    if (g) { setGuide({ ...g, byId: n.id }); track('guide_set', { by: n.id, kind: g.kind }); say.push(`📜 イベント発生：${g.name}へ行ってみて`); }
    else if (S.guide && S.guide.kind === 'npc' && S.guide.id === n.id) setGuide(null);   // 着いた行き先は、次がなくても消す（話しかけ直しでくり返し着かないように）
  }
  if (say.length) toast(say.join('　'));
  const pages = npcPages(n), i = Math.min(page, pages.length - 1);
  return { near: true, html: `${head}<p class="npc-say">「${esc(pages[i])}」</p>
    ${i < pages.length - 1 ? `<button type="button" class="btn mini npc-next" data-npc="${esc(n.id)}" data-page="${i + 1}">▼ つぎへ（${i + 1}/${pages.length}）</button>` : `<p class="npc-end">（${pages.length}/${pages.length}）</p>`}</div>` };
}
// ふつうの地図：人を絵文字で出す（寄ったときだけ）
const npcMarkers = new Map();
function renderNpcMarkers() {
  const show = map.getZoom() >= 15, b = map.getBounds().pad(0.2), keep = new Set();
  if (show) for (const n of placeNpcs()) {
    if (!b.contains([n.lat, n.lng])) continue;
    keep.add(n.id);
    const cls = 'npc-mk' + (npcMet(n.id) ? ' met' : '');
    let m = npcMarkers.get(n.id);
    if (!m) {
      m = L.marker([n.lat, n.lng], { icon: L.divIcon({ className: '', html: `<div class="${cls}">${NPC_LOOK[n.look] || '🙂'}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }), zIndexOffset: 400, keyboard: false })
        .bindPopup(() => talkNpc(n.id).html, { autoPanPaddingBottomRight: [10, 140] }).addTo(map);
      m._cls = cls; npcMarkers.set(n.id, m);
    } else if (m._cls !== cls) {
      m.setIcon(L.divIcon({ className: '', html: `<div class="${cls}">${NPC_LOOK[n.look] || '🙂'}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] })); m._cls = cls;
    }
  }
  for (const [id, m] of npcMarkers) if (!keep.has(id)) { m.remove(); npcMarkers.delete(id); }
}
// 「つぎへ」「近くへ移動」（ふつうの地図のポップアップ・ドット絵のウィンドウの両方）
document.addEventListener('click', e => {
  const nx = e.target.closest('[data-npc]');
  if (nx) {
    const r = talkNpc(nx.dataset.npc, Number(nx.dataset.page) || 0);
    const box = nx.closest('.leaflet-popup-content, #pxInfoBody');
    if (r && box) box.innerHTML = r.html;
    e.stopPropagation();
    return;
  }
  const mv = e.target.closest('[data-move-npc]');
  const n = mv && demo && placeNpcs().find(x => x.id === mv.dataset.moveNpc);
  if (n) { const p = npcSpot(n); map.closePopup(); follow = false; onFix(p.lat - 12 / 111320, p.lng, 5, Date.now()); }
});

/* ---------- 現在地 ---------- */
let me = null;          // {lat,lng,acc,t}
let meMarker = null, accCircle = null, spotRing = null;
let lastWalk = null, vehicleUntil = 0, watchId = null, gpsError = '';
let driving = false;   // 操作して移動で、ドット絵の地図の車（軽トラ）に乗っている（pixel.js が切り替える）

function placeMe() {
  if (!me) return;
  const ll = [me.lat, me.lng];
  if (!meMarker) {
    if (follow) map.setView(ll, Math.max(map.getZoom(), 17), { animate: false });
    meMarker = L.marker(ll, { icon: L.divIcon({ className: 'me-wrap', html: '<div class="me"></div>', iconSize: [32, 32], iconAnchor: [16, 24] }),
      zIndexOffset: 1000, interactive: false, keyboard: false }).addTo(map);
    accCircle = L.circle(ll, { radius: me.acc || 0, color: '#2a6fdb', weight: 0, fillOpacity: 0.08, interactive: false }).addTo(map);
  }
  meMarker.setLatLng(ll);
  meMarker.getElement()?.firstElementChild?.classList.toggle('demo', demo);
  accCircle.setLatLng(ll).setRadius(demo ? 0 : me.acc || 0);
  if (follow) map.panTo(ll, { animate: true });
}

function onFix(lat, lng, acc, t) {
  const p = { lat, lng, acc, t };
  me = p;
  gpsError = '';
  placeMe();
  if (!$('panel-settings').hidden) renderGpsInfo();
  trackWalk(p);
  renderMarkers();
  refreshNearby();
  tryChest();
  welcomeWalk();
}

function startGps() {
  if (!('geolocation' in navigator)) { gpsError = 'この端末・ブラウザは位置情報に対応していません。'; refreshNearby(); return; }
  stopGps();
  setStatus('位置情報を取得しています…（屋外の方が早く取れます）');
  watchId = navigator.geolocation.watchPosition(
    pos => { if (!demo) onFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.timestamp || Date.now()); },
    err => {
      if (!gpsError) track('geo_error', { code: err.code });
      gpsError = err.code === 1
        ? '位置情報の利用が許可されていません。ブラウザの設定で「位置情報」を許可してから再読み込みしてください（「🎮 操作して移動」なら位置情報なしで遊べます）。'
        : err.code === 3 ? '位置情報の取得に時間がかかっています…' : '位置情報を取得できませんでした。電波の良い屋外でお試しください。';
      refreshNearby();
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
}
function stopGps() { if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; } }

/* ---------- 歩いた距離 ---------- */
function trackWalk(p) {
  if (demo) {
    // 操作して移動：タップで移動した距離のうち 500m 以内の移動だけを歩いた扱いにする（車で走った分は数えない）
    if (lastWalk && !driving) { const d = dist(lastWalk, p); if (d <= 500) addWalk(d); }
    lastWalk = p;
    return;
  }
  if (p.acc > CFG.walkMaxAcc) return;
  if (!lastWalk) { lastWalk = p; return; }
  const d = dist(lastWalk, p), dt = (p.t - lastWalk.t) / 1000;
  if (dt <= 0 || d < Math.max(8, p.acc * 0.5)) return; // GPSのゆらぎは無視
  const v = d / dt;
  lastWalk = p;
  if (dt > CFG.walkMaxGapSec) return;                   // 画面を閉じていた間の移動は数えない
  if (v > CFG.vehicleSpeed) { vehicleUntil = Date.now() + CFG.vehicleLockMs; return; }
  if (v > CFG.walkMaxSpeed || Date.now() < vehicleUntil) return;
  addWalk(d);
}

function addWalk(d) {
  dayState().walked += d;
  S.walked += d;
  S.walkCarry += d;
  const today = ymd();
  if (S.walkDay.date !== today) S.walkDay = { date: today, pts: 0 };
  let gained = 0;
  while (S.walkCarry >= CFG.walkUnitM) {
    S.walkCarry -= CFG.walkUnitM;
    if (S.walkDay.pts < CFG.walkDailyCap) { S.walkDay.pts += CFG.walkUnitPts; gained += CFG.walkUnitPts; }
  }
  if (gained) {
    const top = S.log[0];
    if (top && top.type === 'walk' && top.date === today) { top.pts += gained; top.t = Date.now(); }
    else S.log.unshift({ type: 'walk', date: today, t: Date.now(), pts: gained, name: '歩いた距離' });
    gainPoints(gained);
  }
  save();
  updateQuests();
  checkBadges();
}

/* ---------- ポイント ---------- */
const needFor = lv => 25 * (lv - 1) * lv;     // Lv2:50 Lv5:500 Lv10:2250 Lv20:9500 Lv30:21750
const levelOf = total => { let lv = 1; while (total >= needFor(lv + 1)) lv++; return lv; };
const titleOf = lv => TITLES.filter(([l]) => lv >= l).pop()[1];

function gainPoints(n) {
  const before = levelOf(S.total);
  S.points += n; S.total += n;
  session.gained += n;   // 1回に遊んだ間にふえたポイント（session_end）
  S.log = S.log.slice(0, 200);
  renderHeader();
  return levelOf(S.total) > before ? levelOf(S.total) : 0;
}

let selected = null;   // シートに表示中のチェックイン候補

// 当店にチェックインしたときの一言（ricepia.jp の内容から）
/* ---------- キャンペーン（nishio-go/campaigns.json：お店の企画や広告と連動） ----------
   active: true のものだけ本番で出す（false はサンプルとして「操作して遊ぶ」でだけ出す。とくてんと同じ）。
   期間（from〜to）のあいだ、きろくの上に出し、bonus.shopCheckin があれば当店でのチェックインに1日1回ボーナス */
let campaigns = [];
async function loadCampaigns() {
  try {
    const res = await fetch('nishio-go/campaigns.json', { cache: 'no-cache' });
    const j = res.ok ? await res.json() : null;
    if (j && Array.isArray(j.campaigns)) campaigns = j.campaigns.filter(c => c && c.id && c.title && /^\d{4}-\d\d-\d\d$/.test(c.from) && /^\d{4}-\d\d-\d\d$/.test(c.to))
      .map(c => ({ id: String(c.id), title: String(c.title), text: c.text ? String(c.text) : '', icon: c.icon ? String(c.icon) : '📣', from: c.from, to: c.to, active: c.active === true,
        url: typeof c.url === 'string' && /^https:\/\//.test(c.url) ? c.url : '', shopBonus: Number(c.bonus && c.bonus.shopCheckin) > 0 ? Math.round(Number(c.bonus.shopCheckin)) : 0 }));
  } catch (e) { /* キャンペーンなしで続ける */ }
  renderCampaigns();
}
const liveCampaigns = () => { const d = ymd(); return campaigns.filter(c => (c.active || demo) && c.from <= d && d <= c.to); };
// 広告・シェアから来た人を数えられるように、当店などへのリンクに UTM を付ける
function utmUrl(u, campaign) {
  try { const x = new URL(u); if (!x.searchParams.has('utm_source')) { x.searchParams.set('utm_source', 'nishio-go'); x.searchParams.set('utm_medium', 'game'); x.searchParams.set('utm_campaign', campaign); } return x.toString(); } catch (e) { return u; }
}
function renderCampaigns() {
  const el = $('campaignBox');
  if (!el) return;
  const list = liveCampaigns();
  el.hidden = !list.length;
  el.innerHTML = list.map(c => `<div class="camp"><b>${esc(c.icon)} ${esc(c.title)}${c.active ? '' : '（サンプル）'}</b><small>${esc(c.from.slice(5).replace('-', '/'))}〜${esc(c.to.slice(5).replace('-', '/'))}</small>
    ${c.text ? `<p>${esc(c.text)}</p>` : ''}${c.shopBonus ? `<p>🍚 期間中、当店でチェックインすると +${c.shopBonus}pt（1日1回）</p>` : ''}
    ${c.url ? `<a class="btn mini" href="${esc(utmUrl(c.url, 'campaign_' + c.id))}" target="_blank" rel="noopener" data-camp="${esc(c.id)}">くわしく見る</a>` : ''}</div>`).join('');
}

const SHOP_NOTE = '西尾のお米屋さん（明治25年創業）。車に乗ったままお米を受け取れるドライブスルーや、24時間つかえるコイン精米所もあります。くわしくは ricepia.jp で。';
function checkin() {
  const s = selected;
  if (!s || !me) return;
  if (driving) { toast('🚗 車を降りてからチェックインしてね（スティックのとなりの🚶ボタン）'); return; }
  const now = Date.now();
  if (!demo && now < vehicleUntil) { toast('乗り物での移動中はチェックインできません。降りて歩いてからどうぞ。'); return; }
  if (!demo && me.acc > CFG.maxAccuracy) { toast(`GPSの精度が低いようです（誤差 約${Math.round(me.acc)}m）。少し待ってからもう一度。`); return; }
  if (!inReach(s)) { toast('もう少し近づいてください'); refreshNearby(); return; }
  if (cooldownLeft(s) > 0) { toast(`このスポットは あと${Math.ceil(cooldownLeft(s) / 60000)}分 でまたチェックインできます`); return; }

  const v = S.visits[s.id];
  const lines = [];
  let total = 0;
  const base = ptsOf(s);
  total += base; lines.push(`${iconOf(s)} スポット +${base}`);
  if (!v) {
    const b = s.featured ? CFG.pts.firstFeatured : CFG.pts.first;
    total += b; lines.push(`🆕 はじめての訪問 +${b}`);
  }
  const today = ymd();
  if (S.streak.last !== today) {
    S.streak.days = S.streak.last === yesterday() ? S.streak.days + 1 : 1;
    S.streak.last = today;
    S.streak.max = Math.max(S.streak.max || 0, S.streak.days);
    const b = CFG.pts.daily + Math.min(S.streak.days - 1, CFG.pts.streakMax) * CFG.pts.streakStep;
    total += b; lines.push(`📅 今日のはじめて（${S.streak.days}日連続） +${b}`);
  }
  // キャンペーン中は、当店でのチェックインに1日1回ボーナス
  if (s.shop) for (const c of liveCampaigns()) {
    const key = c.id + ':' + today;
    if (!c.shopBonus || (S.campDone || []).includes(key)) continue;
    S.campDone = [key, ...(S.campDone || [])].slice(0, 60);
    total += c.shopBonus; lines.push(`${c.icon} ${c.title}${c.active ? '' : '（サンプル）'} +${c.shopBonus}`);
    track('campaign_bonus', { campaign: c.id, mode: demo ? 'play' : 'walk' });
  }
  S.visits[s.id] = { n: (v ? v.n : 0) + 1, first: v ? v.first : now, last: now, name: s.name, cat: s.kind || s.cat, icon: iconOf(s), featured: !!s.featured };
  const day = dayState();   // 今日のクエストの数え上げ
  day.checkins++;
  if (!day.spots.includes(s.id)) day.spots.push(s.id);
  if (['shrine', 'temple', 'worship'].includes(s.kind || s.cat)) day.shrine++;
  // 「はじめてのスポット」：まだ行っていない所がもう無い人は、どのスポットでも達成にする
  if (!v || spots.every(x => x.id === s.id || S.visits[x.id])) day.fresh++;
  if (s.featured && s.area && !day.areas.includes(s.area)) day.areas.push(s.area);
  if (s.shop) day.shop = 1;
  S.checkins++;
  track('checkin', { spot: s.name, featured: !!s.featured, first: !v, mode: demo ? 'play' : 'walk' });
  if (s.shop) track('shop_checkin', { spot: s.name, mode: demo ? 'play' : 'walk' });
  S.log.unshift({ type: 'spot', t: now, pts: total, name: s.name, icon: iconOf(s), id: s.id });
  // その場所の話（まだ知らないまちメモがあれば。ないときは ほかの話）
  const fk = s.shop ? '' : learnFact('c:' + s.id + ':' + S.checkins);
  const dot = s.shop ? null : gainDot(s.lat, s.lng, 'c:' + s.id, s.area);
  const lvUp = gainPoints(total);
  save();

  const btn = $('spinBtn');
  btn.classList.remove('go'); void btn.offsetWidth; btn.classList.add('go');
  showReward(total, s.name, s.shop ? [...lines, '🍚 当店に来てくれてありがとう！'] : [...lines, ...(fk ? ['📖 まちメモ +1'] : []), ...dotLines(dot)], lvUp, s.shop ? SHOP_NOTE : fk ? factPool().get(fk) : '', dot);
  map.closePopup();
  renderMarkers();
  refreshNearby();
  updateQuests(1200);   // チェックインの知らせのあとにクエスト達成を知らせる
  setTimeout(checkBadges, 2700);
}

/* ---------- 西尾の名物（meibutsu.js：観光協会と市の資料から） ---------- */
const MEIBUTSU = window.NISHIO_MEIBUTSU || [];
// こよみ（season.js：季節・二十四節気・田んぼのようす・見ごろ・時間帯・土用の丑の日）
const KO = window.NISHIO_SEASON || null;
// 天気（weather.js：気象庁のアメダスと きょうの予報）。取れないときは null
const WX = window.NISHIO_WEATHER || null;
const weatherNow = () => (WX && WX.current) || null;
if (WX) WX.onChange(() => { renderKoyomi.key = null; renderKoyomi(); if (me) refreshNearby(); });   // 行き先の決め直しは checkGuide → weatherGuide
// area があるのは となりの市町の名物（バッジを「西尾の名物」と分ける）
const MB_NISHIO = MEIBUTSU.filter(m => !m.area), MB_NEAR = MEIBUTSU.filter(m => m.area && m.spots.length);
const spotMeibutsu = s => MEIBUTSU.filter(m => m.spots.some(id => 'f-' + id === s.id));

/* ---------- 西尾のおまつり・行事（events.js：西尾市観光協会と西尾市公式ウェブサイトから） ---------- */
const EVENTS = (window.NISHIO_EVENTS && NISHIO_EVENTS.list) || [];
const ISLAND_SPOTS = new Set(['sakushima-nishi', 'sakushima-higashi', 'benten-salon', 'suunji', 'ohirune-house', 'kamome-parking', 'oura-beach', 'yatsurugi', 'kurokabe']);
const WEEK = '日月火水木金土';
// 日付が決まっている年はその日付、ほかの年は「10月第3日曜日」のような文で案内する
const evDate = (e, d = new Date()) => e.date && Number(e.date.slice(0, 4)) === d.getFullYear() ? e.date : '';
function evWhen(e, d = new Date()) {
  const x = evDate(e, d);
  if (!x) return e.when;
  const t = new Date(x + 'T00:00:00');
  return `${t.getMonth() + 1}月${t.getDate()}日（${WEEK[t.getDay()]}）`;
}
// その月の行事（日付が決まっていて、もう終わったものは出さない）
function monthEvents(d = new Date()) {
  const m = d.getMonth() + 1, today = ymd();
  return EVENTS.filter(e => { const x = evDate(e, d); return x ? Number(x.slice(5, 7)) === m && x >= today : e.months.includes(m); })
    .sort((a, b) => (evDate(a, d) || '9') < (evDate(b, d) || '9') ? -1 : (evDate(a, d) || '9') > (evDate(b, d) || '9') ? 1 : 0);
}
function upcomingEvents() {
  const now = new Date(), next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const a = monthEvents(now), ids = new Set(a.map(e => e.id));
  return [...a.map(e => ({ e, when: evWhen(e, now), next: false })), ...monthEvents(next).filter(e => !ids.has(e.id)).map(e => ({ e, when: evWhen(e, next), next: true }))];
}
const evSpotId = e => e.spot ? 'f-' + e.spot : '';   // events.js の spot は spots.json の id（読み込んだスポットの id は頭に「f-」が付く）
const spotEvents = s => upcomingEvents().filter(x => evSpotId(x.e) === s.id);

/* ---------- 今日のおさんぽクエスト ----------
   毎日3つのお題（日付で決まるので、だれでも同じ日は同じお題）。ぜんぶ達成でボーナス。ときどき「当店に寄る」も出る */
// お題は日付だけで決める（読み込み中のデータに左右されない）。その日の地区は船のいらない本土の4地区から（佐久島は渡船が要るので出さない）
const QUEST_AREAS = [{ id: 'nishio', name: '西尾', icon: '🍵' }, { id: 'isshiki', name: '一色', icon: '🐟' }, { id: 'kira', name: '吉良', icon: '♨️' }, { id: 'hazu', name: '幡豆', icon: '⛰️' }];
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const seeded = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
function dayState() {
  if (!S.day || S.day.date !== ymd()) S.day = { date: ymd(), walked: 0, checkins: 0, spots: [], shrine: 0, fresh: 0, areas: [], shop: 0, chests: [], done: [], bonus: false };
  if (!S.day.spots) S.day.spots = [];
  return S.day;
}
function todaysQuests() {
  const date = ymd(), rnd = seeded(hashStr('quest:' + date));
  const area = QUEST_AREAS[Math.floor(rnd() * QUEST_AREAS.length)];
  const pool = [
    { id: 'spots2', icon: '📍', text: 'ちがうスポットを2か所めぐる', goal: 2, pts: 40, val: d => d.spots.length },
    { id: 'shrine', icon: '⛩️', text: '神社かお寺にチェックインする', goal: 1, pts: 40, val: d => d.shrine },
    { id: 'walk500', icon: '👣', text: '500m歩く', goal: 500, pts: 30, val: d => Math.floor(d.walked), unit: 'm' },
    { id: 'chest2', icon: '🎁', text: 'たからばこを2つ開ける', goal: 2, pts: 30, val: d => d.chests.length },
    { id: 'fresh', icon: '🆕', text: 'はじめてのスポットに行く', goal: 1, pts: 40, val: d => d.fresh },
  ];
  pool.push({ id: 'area', icon: area.icon, text: `${area.name}の注目スポットに行く`, goal: 1, pts: 60, val: d => d.areas.includes(area.id) ? 1 : 0 });
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const qs = pool.slice(0, 3);
  if (ED.shops && rnd() < 0.35) qs[2] = { id: 'shop', icon: '🌾', text: '当店（近藤米穀店・らいすぴあ）に寄る', goal: 1, pts: 80, val: d => d.shop };
  // ときどき「今月の行事の会場に行く」（会場がスポットになっていて、船のいらない所だけ）
  const evs = monthEvents(new Date(date + 'T12:00:00')).filter(e => e.spot && !e.area && !ISLAND_SPOTS.has(e.spot)), er = seeded(hashStr('event:' + date));
  if (evs.length && qs[2].id !== 'shop' && er() < 0.4) {
    const e = evs[Math.floor(er() * evs.length)];
    qs[2] = { id: 'event', icon: '📅', text: `今月の「${e.name}」の会場に行く`, sub: e.place, goal: 1, pts: 60, val: d => d.spots.includes(evSpotId(e)) ? 1 : 0 };
  }
  return qs;
}
// 達成の判定と記録はすぐに行う（モードを切り替えても、達成したモードの記録に入る）。知らせだけ delay ミリ秒あとに出す
function updateQuests(delay = 0) {
  const d = dayState(), qs = todaysQuests(), done = [];
  let gained = 0;
  for (const q of qs) if (!d.done.includes(q.id) && q.val(d) >= q.goal) {
    d.done.push(q.id); gained += q.pts; done.push(q.text);
    track('quest_complete', { quest: q.id });
    S.log.unshift({ type: 'quest', t: Date.now(), pts: q.pts, name: `クエスト「${q.text}」`, icon: '📜' });
  }
  if (!d.bonus && qs.every(q => d.done.includes(q.id))) {
    d.bonus = true; gained += CFG.pts.questAll;
    track('quest_all', {});
    S.log.unshift({ type: 'quest', t: Date.now(), pts: CFG.pts.questAll, name: '今日のクエストをぜんぶ達成', icon: '🏆' });
  }
  if (!gained) return;
  const lvUp = gainPoints(gained), all = d.bonus && done.length;
  save();
  refreshNearby();
  setTimeout(() => {
    sound.jingle(lvUp ? 'levelup' : 'checkin');
    toast(`📜 クエスト達成！${done.map(t => `「${t}」`).join('')}${all ? '　🏆 今日のクエストぜんぶ達成！' : ''} +${gained}pt${lvUp ? `　🎉 Lv${lvUp}` : ''}`);
  }, delay);
}

/* ---------- たからばこ ----------
   置き場所は pixel.js が決める（日付と400m四方の区画から。あるいて移動では公園・神社・お寺などのそばだけ）。近づくと開いて、ポイントと まちメモ */
// 本店から15kmの円に入る、7市町より外のまち（machi.js：刈谷・知立・半田・東浦・阿久比・武豊）
const MACHI = window.NISHIO_MACHI || [];
// いまいるのが7市町の外なら、そのまち（市町の境界で決める）。7市町の中や、まちメモのない市町なら null
// 境界（region.js の around）がまだないときだけ、いちばん近い役所（8km以内）で代わりにする
function machiAt(p) {
  if (!p || cityAt(p.lat, p.lng)) return null;
  if (AROUND.length) { const a = aroundAt(p.lat, p.lng); return (a && MACHI.find(t => t.city === a.name)) || null; }
  let best = null, bd = 8000;
  for (const t of MACHI) { const d = dist(p, { lat: t.center[0], lng: t.center[1] }); if (d < bd) { bd = d; best = t; } }
  return best;
}
function factPool() {   // まちメモ：地区の豆知識・紹介文、注目スポットの説明、行事、名物、まわりのまち（どれも出典つきのデータから）
  const m = new Map();
  for (const a of areas) {
    if (a.trivia) m.set(`a:${a.id}:t`, `${a.name}：${a.trivia}`);
    if (a.summary) m.set(`a:${a.id}:s`, `${a.name}：${a.summary}`);
  }
  for (const s of spots) if (s.featured && s.desc) m.set(`s:${s.id}`, `${s.name}：${s.desc}`);
  for (const e of EVENTS) if (e.desc) m.set(`e:${e.id}`, `${e.name}（${e.when}・${e.place}）：${e.desc}`);
  for (const x of MEIBUTSU) x.facts.forEach((f, i) => m.set(`m:${x.id}:${i}`, `${x.icon} ${x.name}：${f}`));
  for (const t of MACHI) t.facts.forEach((f, i) => m.set(`t:${t.id}:${i}`, `${t.icon} ${t.city}：${f}`));
  return m;
}
// 出すまちメモ：まだ持っていないものから、①7市町の外なら そのまちの話 ②そのスポットの話・そこでの行事 ③同じ地区の話 ④ほか の順に選ぶ
function pickFact(c) {
  const pool = factPool(), keys = [...pool.keys()], fresh = keys.filter(k => !S.facts.includes(k));
  const list = fresh.length ? fresh : keys;
  if (!list.length) return '';
  let near = null, nd = Infinity;
  for (const s of spots) { const d = dist(c, s); if ((c.at ? s.name === c.at : true) && d < nd) { near = s; nd = d; } }
  const area = near && near.area, inArea = id => { const s = spots.find(x => x.id === id); return s && s.area === area; };
  const machi = machiAt(c);
  const tiers = [
    k => machi && k.startsWith(`t:${machi.id}:`),
    k => near && (k === `s:${near.id}` || EVENTS.some(e => k === `e:${e.id}` && evSpotId(e) === near.id) || spotMeibutsu(near).some(x => k.startsWith(`m:${x.id}:`))),
    k => area && (k.startsWith(`a:${area}:`) || (k.startsWith('s:') && inArea(k.slice(2))) || EVENTS.some(e => k === `e:${e.id}` && e.spot && inArea(evSpotId(e)))),
    () => true,
  ];
  for (const t of tiers) { const g = list.filter(t); if (g.length) return g[hashStr(c.id) % g.length]; }
  return '';
}
const knownFacts = () => { const pool = factPool(); return S.facts.filter(k => pool.has(k)).length; };
// いまのモード・今日のたからばこで、まだ開けていないもの（モードを切り替えた直後や日付が変わった直後に、
// 前のモード・前の日のたからばこを開けたり出したりしない）
function liveChests() {
  const list = (window.nishioPixel && nishioPixel.chests) || [], d = dayState(), mode = demo ? 'play' : 'walk';
  return list.filter(c => c.mode === mode && c.id.startsWith(d.date + ':') && !d.chests.includes(c.id));
}
// ふつうの地図にも、まだ開けていないたからばこを 🎁 で出す
const chestMarkers = new Map();
function syncChestMarkers() {
  const keep = new Set();
  for (const c of liveChests()) {
    keep.add(c.id);
    const m = chestMarkers.get(c.id);
    if (m) m.setLatLng([c.lat, c.lng]);   // 置き直されたら印も動かす
    else chestMarkers.set(c.id, L.marker([c.lat, c.lng], { icon: L.divIcon({ className: '', html: '<div class="chest-mk">🎁</div>', iconSize: [30, 30], iconAnchor: c.at ? [-6, 34] : [15, 15] }), keyboard: false, interactive: false, zIndexOffset: 600 }).addTo(map));
  }
  for (const [id, m] of chestMarkers) if (!keep.has(id)) { m.remove(); chestMarkers.delete(id); }
}
function nearestChest() {
  let best = null;
  if (me) for (const c of liveChests()) { const d = dist(me, c); if (!best || d < best.d) best = { c, d }; }
  return best;
}
function tryChest() {
  if (driving) return;   // 車に乗っている間は開けない（降りると開く）
  // あるいて移動では、チェックインと同じく GPS の誤差が大きいときと乗り物で移動中は開けない
  if (!demo && (!me || me.acc > CFG.maxAccuracy || Date.now() < vehicleUntil)) return;
  const n = nearestChest();
  if (!n || n.d > (demo ? 18 : 30)) return;
  const c = n.c, d = dayState(), welcome = c.id.endsWith(':welcome');
  d.chests.push(c.id);
  if (welcome) S.welcomed = true;
  const pick = pickFact(c);
  track('chest_open', { mode: demo ? 'play' : 'walk' });
  if (pick && !S.facts.includes(pick)) S.facts.push(pick);
  const dot = gainDot(c.lat, c.lng, 'chest:' + c.id);
  S.log.unshift({ type: 'chest', t: Date.now(), pts: c.pts, name: 'たからばこ', icon: '🎁' });
  const lvUp = gainPoints(c.pts);
  save();
  showReward(c.pts, welcome ? 'ようこそ！ はじめての たからばこ' : 'たからばこを見つけた！', [`🎁 たからばこ +${c.pts}`, ...dotLines(dot), ...(welcome ? ['🧭 つぎは、下の案内の行き先へ行ってみよう'] : [])], lvUp, pick ? factPool().get(pick) : '', dot);
  updateQuests(1500);
  refreshNearby();
}

/* ---------- みちしるべ（このゲームの面白さの核：docs/fun-core.md） ----------
   「人生は自分で決めるものではなく、まわりの環境や人の話を聞いて進んでいくもの」。
   次に行く所は、話を聞いた人と、まわりの環境（季節・天気・今月の行事・まだ会っていない人・まだ行っていない名所）が決める。
   ・西尾の人と話すと、その人が次の行き先をすすめてくれる（話の最後のページ）。その人の頼みが「イベント」
   ・行き先に着く（人なら話しかける）と、そこの環境やその人の話で、また次が決まる
   ・ほかの人の話を聞けば、行き先はその人のすすめに変わる
   ・少しだけ自分でも選べる：みちしるべの札をひらくと、ほかの候補（2つまで）に変えられる。選ばなければ、すすめのとおりに進む
   報酬はきびしめ：すすめられた所に着いたら +5pt（1日5回まで）。人と話す +10pt は、はじめての人だけ */
const GUIDE_PTS = 5, GUIDE_DAILY = 5, GUIDE_RANGE = { walk: 2000, play: 3000 };
const WEEKDAY = d => '日月火水木金土'[d.getDay()];
const firstClause = t => String(t || '').split(/[。、]/)[0];
// 着いたとみなす距離（checkGuide と decideGuide で同じものを使う）：人は話しかけられる距離、名所はチェックインできる距離
function guideRadius(g) {
  if (g.kind === 'npc') return NPC_TALK_M[demo ? 'play' : 'walk'];
  const s = spots.find(x => x.id === g.id);
  return (s ? reachOf(s) : 40) + Math.min((me && me.acc) || 0, CFG.accSlack);
}
const GUIDE_RECENT = 8;
const GUIDE_FAR = 12000;   // 行き先からこれより遠くへ移ったら（m）、決め直す（人のすすめは10kmまでなので、それより少し遠く）
// その場にいると認めてよい位置か（チェックイン・たからばこと同じ条件）。車（軽トラ）に乗っているあいだはだめ（降りれば着いたことになる）。
// あるいて移動では GPS の精度が悪いときと乗り物で移動中もだめ
const fixOk = () => !!me && !driving && (demo || (me.acc <= CFG.maxAccuracy && Date.now() >= vehicleUntil));   // 最近着いた行き先（この数だけ覚えて、続けてすすめない）
// 次の行き先を決める。from：話した人（なければ環境が決める）。戻り値：{ kind, id, name, lat, lng, why, by, alts }（alts：ほかの候補。札から選べる）
function decideGuide(from) {
  if (!me) return null;
  const now = new Date(), range = GUIDE_RANGE[demo ? 'play' : 'walk'];
  const recent = new Set(S.guideDone || []);
  // 着いたとみなす距離の外（1.5倍より遠く）で、遠すぎず、最近着いた所でもない
  const okFor = (kind, id) => x => { const d = dist(me, x); return d > Math.max(60, guideRadius({ kind, id }) * 1.5) && d <= range && !recent.has(id); };
  const far = x => okFor('spot', x.id)(x);
  const by = from ? `${from.name}の話` : 'まわりのようす';
  const say = (a, b) => from ? a : b;   // 人のことば（三河弁）／環境の知らせ
  const cands = [];
  // ①' この人が知っている人（人から人へ）。まだ話していない人だけ。遠くても10kmまで（佐久島へは船で）
  if (from && Array.isArray(from.refer)) {
    const all = placeNpcs();
    const ref = from.refer.map(([id, words]) => ({ n: all.find(x => x.id === id), words }))
      .find(x => x.n && !npcMet(x.n.id) && !recent.has(x.n.id) && dist(me, x.n) > guideRadius({ kind: 'npc' }) * 1.5 && dist(me, x.n) <= 10000);
    if (ref) cands.push({ kind: 'npc', id: ref.n.id, name: `${ref.n.name}（${ref.n.spotName}）`, lat: ref.n.lat, lng: ref.n.lng, why: ref.words, refer: true });
  }
  // ②'' 雨がふっている（天気）→ 屋根のある所（博物館・資料館・美術館・水族館・図書館）。いちばん先に
  const wxNow = weatherNow();
  if (wxNow && wxNow.raining) {
    const roof = spots.filter(s => s.featured && !s.shop && (s.kind === 'museum' || s.kind === 'library') && far(s) && !ISLAND_SPOTS.has(s.id.slice(2))).sort((a, b) => dist(me, a) - dist(me, b))[0];
    if (roof) cands.push({ kind: 'spot', id: roof.id, name: roof.name, lat: roof.lat, lng: roof.lng, weather: true, by: from ? undefined : `天気（${wxNow.icon}${wxNow.name}）`,
      why: say(`${wxNow.kind === 'snow' ? '雪' : '雨'}がふっとるもんで、屋根のある${roof.name}で雨宿りしてきりん。`, `${wxNow.icon} ${wxNow.kind === 'snow' ? '雪' : '雨'}がふってきた。屋根のある${roof.name}へ行こう。`) });
  }
  // ②' 季節の見ごろ（こよみ）：いまの時期に見ごろの所。行事と交互に先にする
  const seasonC = (() => {
    if (!KO) return null;
    const se = KO.season(now), sk = KO.sekki(now);
    const wet = !!(weatherNow() && weatherNow().raining);   // 雨の日は海辺の見ごろ（海水浴）は出さない
    const hs = KO.seasonSpots(now).map(h => ({ h, s: spots.find(x => x.id === 'f-' + h.spot) })).filter(x => x.s && far(x.s) && !ISLAND_SPOTS.has(x.h.spot) && !(wet && (x.h.id === 'umi' || x.s.kind === 'beach'))).sort((a, b) => dist(me, a.s) - dist(me, b.s));
    if (!hs.length) return null;
    const { h, s } = hs[0];
    return { kind: 'spot', id: s.id, name: s.name, lat: s.lat, lng: s.lng, season: true, by: from ? undefined : `季節（${se.icon}${se.name}・${sk.name}のころ）`,
      why: say(`いまは${h.text}だもんで、${s.name}へ行ってみりん。`, `${h.icon} いまは${h.text}。${s.name}へ行ってみよう。`) };
  })();
  if (seasonC && (S.guides || 0) % 2 === 0) cands.push(seasonC);
  // ② 今月・来月の行事の会場
  for (const { e, when } of upcomingEvents()) {
    const s = e.spot && spots.find(x => x.id === evSpotId(e));
    if (s && far(s) && !ISLAND_SPOTS.has(e.spot)) { cands.push({ kind: 'spot', id: s.id, name: s.name, lat: s.lat, lng: s.lng, why: say(`${when}に${s.name}で「${e.name}」があるもんで、いっぺん見に行ってみりん。`, `${when}に${s.name}で「${e.name}」があるらしい。行ってみよう。`) }); break; }
  }
  if (seasonC && (S.guides || 0) % 2 === 1) cands.push(seasonC);
  // ③ まだ話していない人（人の話から、次の人へ）
  const people = placeNpcs().filter(n => !npcMet(n.id) && (!from || n.id !== from.id) && okFor('npc', n.id)(n)).sort((a, b) => dist(me, a) - dist(me, b));
  const pickN = people[(S.guides || 0) % Math.min(3, people.length || 1)];
  if (pickN) {
    const s = spots.find(x => x.id === 'f-' + pickN.spot), about = firstClause(s && s.desc);
    cands.push({ kind: 'npc', id: pickN.id, name: `${pickN.name}（${pickN.spotName}）`, lat: pickN.lat, lng: pickN.lng,
      why: say(`${pickN.spotName}のそばに${pickN.name}がおるで、話を聞いてみりん。${about ? `（${about}）` : ''}`, `${pickN.spotName}のほうに人がいる。話を聞いてみよう。`) });
  }
  // ⑤ まだ行っていない注目スポット
  const sp = spots.filter(s => s.featured && !s.shop && !S.visits[s.id] && far(s) && !ISLAND_SPOTS.has(s.id.slice(2))).sort((a, b) => dist(me, a) - dist(me, b))[0];
  if (sp) cands.push({ kind: 'spot', id: sp.id, name: sp.name, lat: sp.lat, lng: sp.lng, why: say(`${sp.name}へは、もう行ったかん？${firstClause(sp.desc)}。`, `${sp.name}が近いらしい。行ってみよう。`) });
  // ⑥ まだ行っていない ふつうの名所（神社・お寺・史跡・公園・駅など。近い3つから順に）。注目スポットが遠い所（半田・刈谷など）でも行き先があるように
  // 公園（ちびっこ広場なども多い）より、神社・お寺・史跡・駅などを先に
  const ordAll = spots.filter(s => !s.featured && !s.shop && !S.visits[s.id] && far(s)).sort((a, b) => dist(me, a) - dist(me, b));
  const ord = (ordAll.some(s => s.cat !== 'park') ? ordAll.filter(s => s.cat !== 'park') : ordAll).slice(0, 3);
  const os = ord[(S.guides || 0) % (ord.length || 1)];
  if (os) {
    const cat = (CATS[os.cat] || {}).n || '名所';
    cands.push({ kind: 'spot', id: os.id, name: os.name, lat: os.lat, lng: os.lng, why: say(`この先に${cat}の「${os.name}」があるで、寄ってみりん。`, `${cat}の「${os.name}」が近くにあるらしい。寄ってみよう。`) });
  }
  if (!cands.length) return null;
  // 話した人が知っている人、雨なら屋根のある所を先に。それ以外は、話を聞くたびに「名所・人」を順に
  let c = cands.find(x => x.refer) || cands.find(x => x.weather);
  if (!c) { const order = [['spot', 'npc'], ['npc', 'spot']][(S.guides || 0) % 2]; for (const k of order) if ((c = cands.find(x => x.kind === k))) break; }
  c = c || cands[0];
  // ほかの候補（行き先がちがうものを2つまで）。札をひらくと選べる
  const alts = cands.filter(x => x.id !== c.id).filter((x, i, a) => a.findIndex(y => y.id === x.id) === i).slice(0, 2)
    .map(x => ({ kind: x.kind, id: x.id, name: x.name, lat: x.lat, lng: x.lng, why: x.why, by: x.by || by, refer: x.refer, weather: x.weather }));
  return { ...c, by: c.by || by, alts };
}
function setGuide(g) {
  S.guide = g ? { ...g, t: Date.now() } : null;
  if (g) S.guides = (S.guides || 0) + 1;
  save();
}
const guideTarget = () => {
  const g = S.guide;
  if (!g) return null;
  if (g.kind === 'npc') { const n = placeNpcs().find(x => x.id === g.id); return n ? { ...g, ...npcSpot(n) } : null; }
  // 名所は、いま読み込んでいるスポットの位置で（スポットを読み直すと、OpenStreetMap で位置が補正されることがある）
  const s = spots.find(x => x.id === g.id);
  return s ? { ...g, lat: s.lat, lng: s.lng } : g;
};
// 行き先に着いたときの記録とごほうび（1日5回まで）。戻り値：もらったポイント
function guideReward(g) {
  S.guideDone = [g.id, ...(S.guideDone || []).filter(x => x !== g.id)].slice(0, GUIDE_RECENT);
  const day = dayState();
  day.guide = day.guide || 0;
  const pts = day.guide < GUIDE_DAILY ? GUIDE_PTS : 0;
  if (pts) { day.guide++; gainPoints(pts); S.log.unshift({ type: 'guide', t: Date.now(), pts, name: `すすめられた所に着いた：${g.name}`, icon: '🧭' }); }
  track('guide_arrive', { kind: g.kind, by: g.by, mode: demo ? 'play' : 'walk' });
  return pts;
}
// 行き先に着いたか（人のときは、話しかけたときに着いたことになり、その人の話で次が決まる）
// 天気と行き先が合わなくなったら、まわりのようす（環境）で決めた行き先だけ決め直す（人のすすめ・自分で選んだ行き先はそのまま）
//   雨になった → 屋根のある所が見つかれば、そこへ。雨が止んだ → 雨宿りの案内をやめて、ふだんの行き先へ
//   天気が届いたとき・スポットが読み込み直されたとき・200mほど動いたとき（屋根のある所がすすめる範囲に入る）など、状況が変わったときだけ調べる
function weatherGuide() {
  const g = S.guide, w = weatherNow(), wet = !!(w && w.raining);
  if (!w) return;   // 天気がまだ届いていない（取れない）ときは、雨宿りの案内も消さない
  if (!g || g.refer || g.mine || /の話$/.test(g.by || '') || !!g.weather === wet) return;
  if (!fixOk()) return;   // GPS の精度が悪い位置や乗り物で移動中の位置からは決めない（ほかの決め直しと同じ）
  const key = `${demo}:${wet}:${spotsVersion}:${g.id}:${Math.round(me.lat * 550)}:${Math.round(me.lng * 450)}`;
  if (weatherGuide.key === key) return;
  weatherGuide.key = key;
  const next = decideGuide(null);
  if (wet && !(next && next.weather)) return;   // 屋根のある所がまだ見つからない（スポットの読み込み前など）
  S.guide = next ? { ...next, t: Date.now() } : null; save();
}
function checkGuide() {
  if (!me) return;
  // いまの行き先に着いたときは、天気で決め直す前に着いたことにする（ごほうびを先に）
  const g0 = guideTarget();
  if (!(g0 && g0.kind !== 'npc' && dist(me, g0) <= guideRadius(g0) && fixOk())) weatherGuide();
  const g = guideTarget();
  if (!g) {   // 行き先がないときは、まわりのようすで決める（決まらなければ少し待ってから、もう一度）
    // 決めるのは、その場にいると認めてよい位置のときだけ（GPS の精度が悪い位置や乗り物で移動中の位置から決めない）
    if (spots.length && !S.guide && fixOk() && Date.now() - (checkGuide.t || 0) > 5000) { checkGuide.t = Date.now(); setGuide(decideGuide(null)); }
    return;
  }
  // 遠くへ移った（となりの市町へ行ったなど）ときは、いまいる所のようすで決め直す
  // （人のすすめは10kmまで出すので12km、それ以外は すすめる範囲の2倍まで）
  const farLimit = g.refer ? GUIDE_FAR : GUIDE_RANGE[demo ? 'play' : 'walk'] * 2;
  if (dist(me, g) > farLimit && fixOk()) { setGuide(decideGuide(null)); return; }
  if (g.kind === 'npc') return;
  if (dist(me, g) > guideRadius(g) || !fixOk()) return;
  const pts = guideReward(g);
  const next = decideGuide(null);
  setGuide(next);
  toast(`${g.byId ? '🎉 イベント達成：' : '🧭 '}${g.name}に着いた${pts ? ` +${pts}pt` : ''}${next ? `　→ ${next.why}` : ''}`);
}
// タップで話の全文と、ほかの行き先（2つまで）。ほかの行き先を押すと、そこへ変える
$('guide').addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-alt]');
  if (b) { e.stopPropagation(); pickAlt(+b.dataset.alt); return; }
  $('guide').classList.toggle('open');
});
function pickAlt(i) {
  const g = S.guide, a = g && g.alts && g.alts[i];
  if (!a) return;
  // refer（人のすすめ：遠くても12kmまで決め直さない）・weather（雨宿り）も持ちこす。戻したときに すぐ決め直されないように
  const keep = ({ kind, id, name, lat, lng, why, by, byId, refer, weather }) => ({ kind, id, name, lat, lng, why, by, byId, refer, weather });
  S.guide = { ...keep(a), mine: true, alts: [keep(g), ...g.alts.filter((_, k) => k !== i).map(keep)], t: Date.now() };   // 前の行き先も候補に残す（戻せる）
  save();
  $('guide').classList.remove('open');
  renderGuide();
  toast(`🧭 行き先を「${a.name}」にした`);
  track('guide_pick', { kind: a.kind, mode: demo ? 'play' : 'walk' });
}
function renderGuide() {
  const el = $('guide');
  const g = guideTarget();
  if (!g || !me) { el.hidden = true; return; }
  el.hidden = false;
  // 2行に収める（1行目：行き先と方角・距離、2行目：だれの話か。長い話は「…」。タップで全文）
  const alts = (S.guide && S.guide.alts) || [];
  el.innerHTML = `<b>${g.byId ? '📜' : '🧭'} ${esc(g.name)}<span>　${bearing(me, g)}へ ${fmtM(dist(me, g))}</span></b><small>${esc(g.mine ? '自分で選んだ行き先' : g.by)}「${esc(g.why)}」</small>`
    + (alts.length ? `<span class="alts"><em>ほかの行き先：</em>${alts.map((a, i) => `<button type="button" class="btn mini" data-alt="${i}">↪ ${esc(a.name)}${me ? `（${fmtM(dist(me, a))}）` : ''}</button>`).join('')}</span>` : '');
  el.title = `${g.by}「${g.why}」`;
}
const DIR8 = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
function bearing(a, b) {
  const y = Math.sin((b.lng - a.lng) * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180);
  const x = Math.cos(a.lat * Math.PI / 180) * Math.sin(b.lat * Math.PI / 180) - Math.sin(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.cos((b.lng - a.lng) * Math.PI / 180);
  return DIR8[Math.round(((Math.atan2(y, x) * 180 / Math.PI + 360) % 360) / 45) % 8];
}

/* ---------- 近くのスポット ---------- */
// こよみの札（地図の左上）。タップで、節気・田んぼ・見ごろのくわしい話
// いまいる市町と町名（ドット絵の地図が決めて知らせる：pixel.js の updateHere）。こよみの札に出す
let place = { city: '', town: '' };
function setPlace(city, town) {
  if (place.city === city && place.town === town) return;
  place = { city, town };
  renderKoyomi();
}
// こよみの札：ふだんは「10/18（日）🍁☀️ 📍錦城町」の1行だけ。タップで、節気・田んぼ・見ごろ・天気・いまいる市町のくわしい話
function renderKoyomi() {
  const el = $('koyomi');
  if (!el || !KO) return;
  const now = new Date(), px = document.body.classList.contains('px');
  const pc = px ? place : { city: ((me && placeAt(me.lat, me.lng)) || {}).name || '', town: '' };
  const key = ymd() + ':' + now.getHours() + ':' + pc.city + ':' + pc.town;
  if (WX) {   // 天気は10分ごとに取り直す（weather.js）。予報の地域（東部・西部）をまたいだら、1分を待たずにすぐ
    const at = me || { lat: CFG.center[0], lng: CFG.center[1] }, east = WX.isEast(at.lat, at.lng);
    if (Date.now() - (renderKoyomi.wt || 0) > 60000 || east !== renderKoyomi.we) { renderKoyomi.wt = Date.now(); renderKoyomi.we = east; WX.refresh(at.lat, at.lng); }
  }
  if (renderKoyomi.key === key) return;
  renderKoyomi.key = key;
  const sk = KO.sekki(now), p = KO.paddy(now), hs = KO.seasonSpots(now), wx = weatherNow();
  const wxShort = wx ? `　${wx.icon}${wx.name}${wx.temp !== null ? ` ${Math.round(wx.temp)}℃` : ''}` : '';
  const wxLong = wx ? `<br>${wx.icon} いま${wx.raining ? '雨がふっています' : '雨はふっていません'}${wx.rainAt ? `（${esc(wx.rainAt)}）` : ''}${wx.temp !== null ? `・気温 ${wx.temp}℃（${esc(wx.tempAt)}）` : ''}・${esc(wx.at)}の観測<br>きょうの予報（${esc(wx.forecastArea)}）：${esc(wx.forecast)}<br><small>天気の出典：気象庁（アメダス・天気予報）</small>` : '';
  const se = KO.season(now), where = pc.town || pc.city;
  el.innerHTML = `<b>${now.getMonth() + 1}/${now.getDate()}（${WEEKDAY(now)}）${se.icon}${wx ? wx.icon : ''}${where ? `　📍${esc(where)}` : ''}</b>`
    + `<span class="more">${esc(KO.line(now))}${wxShort}${pc.city ? `<br>📍 ${esc(pc.city)}${pc.town ? ' ' + esc(pc.town) : ''}` : ''}<br>${esc(sk.name)}：${esc(sk.desc)}<br>${p.icon} ${esc(p.desc)}`
    + (hs.length ? `<br>見ごろ：${hs.map(h => `${h.icon}${esc(h.name)}`).filter((v, i, a) => a.indexOf(v) === i).join('・')}` : '')
    + (KO.doyoUshi(now) ? '<br>🐟 きょうは土用の丑の日' : '') + wxLong + '</span>';
  el.hidden = false;
}
$('koyomi') && $('koyomi').addEventListener('click', () => $('koyomi').classList.toggle('open'));

function refreshNearby() {
  renderKoyomi();
  // その日はじめて遊んだ端末を1回だけ数える（累計・毎日のプレイ人数：tools/ga4-stats.js）
  if (me && store.get('nsg_started', false) && store.get('nsg_play_day', '') !== ymd()) { store.set('nsg_play_day', ymd()); track('play_day', { mode: demo ? 'play' : 'walk', day_n: dayN() }); }
  const btn = $('spinBtn');
  syncChestMarkers();   // 位置がまだないときも、前のモードのたからばこの印は消す
  if (!me) {
    btn.hidden = true;
    $('guide').hidden = true;
    showRing(null);
    showGuide(null);
    // 位置情報が使えないときは、その場で「操作して遊ぶ」に切り替えられるボタンを出す（ここで閉じられてしまわないように）
    setStatus(gpsError ? esc(gpsError) + (demo ? '' : RESCUE_BTN('geo')) : (demo ? '地図をタップすると、その場所へ移動します。' : '位置情報を待っています…'), true);
    return;
  }
  checkGuide();   // 着いたら先に次の行き先へ進めてから、線・矢印・カードを描く（古い行き先を指さないように）
  let best = null, nearest = null, nearestD = Infinity;
  for (const s of spots) {
    const d = dist(me, s);
    if (d < nearestD && cooldownLeft(s) === 0) { nearest = s; nearestD = d; }
    if (cooldownLeft(s) === 0 && inReach(s)) {
      if (!best || (s.featured && !best.s.featured) || (s.featured === best.s.featured && d < best.d)) best = { s, d };
    }
  }
  selected = best ? best.s : null;
  showRing(selected || nearest);
  showGuide(guideTarget() || (selected ? null : nearest));   // 行き先（みちしるべ）はいつも指す。ほかのスポットの範囲にいるときに消すのは「いちばん近いスポット」だけ
  if (selected) {
    btn.hidden = false;
    btn.classList.toggle('feat', !!selected.featured);
    $('spinIco').textContent = iconOf(selected);
    $('spinName').textContent = selected.name;
    const lock = demo ? 0 : vehicleUntil - Date.now();
    const why = driving ? '🚗 車を降りるとチェックインできます'
      : lock > 0 ? `🚗 乗り物判定中：あと約${Math.ceil(lock / 1000)}秒で押せます`
      : !demo && me.acc > CFG.maxAccuracy ? '📡 GPSの精度が上がるのを待っています…' : '';
    btn.disabled = !!why;
    $('spinSub').textContent = why || `タップして +${ptsOf(selected)}pt${S.visits[selected.id] ? '' : '（初訪問ボーナスあり）'}`;
  } else {
    btn.hidden = true;
  }

  renderGuide();
  // 画面をすっきりさせるため、案内パネルは1〜2行だけ：気をつけること（車・範囲外・GPS など）があればそれを、なければ まちメモ とクエストの数
  const msgs = [];
  if (driving) msgs.push('🚗 軽トラで移動中（チェックインは降りてから）');
  if (demo && !document.body.classList.contains('px')) msgs.push('🎮 地図をタップして移動');
  else if (!inPlay(me.lat, me.lng)) {
    msgs.push('📍 遊べる範囲（西尾市と となりの市町、本店から15km）の外です' + (demo ? '' : RESCUE_BTN('range')));
    if (!demo && !refreshNearby.outTracked) { refreshNearby.outTracked = true; track('out_of_range', {}); }
  }
  if (!demo && Date.now() < vehicleUntil) msgs.push('🚗 乗り物で移動中と判定しました（しばらくチェックインできません）');
  if (!demo && me.acc > CFG.maxAccuracy) msgs.push(`📡 GPSの誤差が大きめです（約${Math.round(me.acc)}m）`);
  if (!selected && !guideTarget()) {
    if (nearest) msgs.push(`いちばん近いスポット：<b>${esc(nearest.name)}</b>（${fmtM(nearestD)}）`);
    else if (spotsLoading && !spots.length) msgs.push('スポットを読み込んでいます…');
    else if (!spots.length) msgs.push('スポットがありません。「せってい」から再読み込みしてください。');
  }
  if (!msgs.length) {
    const qd = todaysQuests().filter(q => dayState().done.includes(q.id)).length;
    msgs.push(`📖 まちメモ <b>${knownFacts()}</b>　📜 クエスト <b>${qd}</b>/3`);
  }
  setStatus(msgs.slice(0, 2).join('<br/>'), true);
}

// 目標スポットのまわりに、チェックインできる範囲を点線で表示
function showRing(s) {
  if (!s) { if (spotRing) { spotRing.remove(); spotRing = null; } return; }
  const color = s.featured ? '#e3a42b' : '#2a6fdb';
  if (!spotRing) spotRing = L.circle([s.lat, s.lng], { weight: 2, opacity: 0.7, dashArray: '6 6', fillOpacity: 0.08, interactive: false }).addTo(map);
  spotRing.setLatLng([s.lat, s.lng]).setRadius(reachOf(s)).setStyle({ color, fillColor: color });
}

// 現在地からいちばん近いスポットへ点線を引く（方向の目安）
let guideLine = null;
function showGuide(s) {
  if (!s || !me) { if (guideLine) { guideLine.remove(); guideLine = null; } return; }
  const pts = [[me.lat, me.lng], [s.lat, s.lng]];
  if (!guideLine) guideLine = L.polyline(pts, { color: '#5d6b60', weight: 2, opacity: 0.6, dashArray: '2 6', interactive: false }).addTo(map);
  else guideLine.setLatLngs(pts);
}

/* ---------- バッジ ---------- */
function countVisits(fn) { return Object.values(S.visits).filter(fn).length; }
function badgeDefs() {
  const uniq = Object.keys(S.visits).length;
  // 「注目スポット制覇」は西尾市の中だけ（となりの市町は、市町ごとの制覇バッジ）
  const nearIds = new Set(spots.filter(s => s.featured && NEAR_AREAS.has(s.area)).map(s => s.id));
  const featTotal = spotMeta.featured - nearIds.size;
  const km = Math.floor(S.walked / 100) / 10;
  return [
    { id: 'first', i: '👟', n: 'はじめの一歩', d: 'はじめてチェックイン', cur: S.checkins, goal: 1 },
    { id: 'spot10', i: '🗺️', n: 'まちあるき', d: '10か所をめぐる', cur: uniq, goal: 10 },
    { id: 'spot30', i: '🧭', n: '西尾たんけん隊', d: '30か所をめぐる', cur: uniq, goal: 30 },
    { id: 'spot100', i: '🏆', n: '西尾はかせ', d: '100か所をめぐる', cur: uniq, goal: 100 },
    { id: 'shrine', i: '⛩️', n: '神社めぐり', d: '神社を5か所', cur: countVisits(v => v.cat === 'shrine'), goal: 5 },
    { id: 'temple', i: '🪷', n: 'お寺めぐり', d: 'お寺を5か所', cur: countVisits(v => v.cat === 'temple'), goal: 5 },
    { id: 'park', i: '🌳', n: '公園めぐり', d: '公園を5か所', cur: countVisits(v => v.cat === 'park'), goal: 5 },
    { id: 'castle', i: '🏯', n: '西尾城へ', d: '西尾城跡を訪ねる', cur: S.visits['f-nishio-castle'] ? 1 : 0, goal: 1 },
    { id: 'featall', i: '⭐', n: '注目スポット制覇', d: `注目スポット${featTotal}か所すべて`, cur: Object.entries(S.visits).filter(([id, v]) => v.featured && !nearIds.has(id)).length, goal: Math.max(featTotal, 1), ready: spotMeta.loaded && featTotal > 0 },
    ...areas.map(a => {
      const p = areaProgress(a.id);
      return { id: 'area-' + a.id, i: a.icon || '🗾', n: `${a.name}制覇`, d: `${a.name}の注目スポット${p.total}か所すべて`, cur: p.done, goal: Math.max(p.total, 1), ready: spotMeta.loaded && p.total > 0 };
    }),
    { id: 'walk5', i: '🚶', n: '5kmウォーカー', d: '合計5km歩く', cur: km, goal: 5 },
    { id: 'walk42', i: '🏃', n: 'フルマラソン', d: '合計42.195km歩く', cur: km, goal: 42.195 },
    { id: 'streak7', i: '📅', n: '1週間つづけた', d: '7日連続でチェックイン', cur: S.streak.max || 0, goal: 7 },
    { id: 'meibutsu', i: '🍵', n: '西尾の名物めぐり', d: `${MB_NISHIO.map(m => m.name).join('・')}にゆかりの場所をそれぞれ訪ねる`, cur: MB_NISHIO.filter(m => m.spots.some(id => S.visits['f-' + id])).length, goal: Math.max(MB_NISHIO.length, 1) },
    { id: 'meibutsu2', i: '🧭', n: 'となりまちの名物めぐり', d: `${MB_NEAR.map(m => m.name).join('・')}にゆかりの場所をそれぞれ訪ねる`, cur: MB_NEAR.filter(m => m.spots.some(id => S.visits['f-' + id])).length, goal: Math.max(MB_NEAR.length, 1), ready: MB_NEAR.length > 0 },
    { id: 'memo10', i: '📖', n: 'まちのものしり', d: 'まちメモを10こ集める', cur: knownFacts(), goal: 10 },
    { id: 'memo50', i: '📚', n: 'まち博士', d: 'まちメモを50こ集める', cur: knownFacts(), goal: 50 },
    { id: 'npc5', i: '💬', n: 'ご近所さん', d: '西尾の人5人と話す', cur: NPC_NISHIO.filter(n => npcMet(n.id)).length, goal: 5 },
    { id: 'npcall', i: '🤝', n: '西尾の顔なじみ', d: `西尾の人${NPC_NISHIO.length}人みんなと話す`, cur: NPC_NISHIO.filter(n => npcMet(n.id)).length, goal: Math.max(NPC_NISHIO.length, 1) },
    { id: 'npcnear', i: '🧭', n: 'となりまちの顔なじみ', d: `となりの市町の人${NPC_NEAR.length}人みんなと話す`, cur: NPC_NEAR.filter(n => npcMet(n.id)).length, goal: Math.max(NPC_NEAR.length, 1), ready: NPC_NEAR.length > 0 },
  ];
}
function checkBadges() {
  const got = new Set(S.badges);
  const fresh = badgeDefs().filter(b => b.ready !== false && b.cur >= b.goal && !got.has(b.id));
  if (!fresh.length) return;
  fresh.forEach(b => S.badges.push(b.id));
  save();
  toast(`🏅 バッジ獲得：${fresh.map(b => b.i + ' ' + b.n).join('、')}`);
}

/* ---------- 放置（操作して移動だけ）：おまかせ強化・おかえり・歩きながら まちメモ ----------
   遊び方は3つ。どれにも出番があるように、集まる速さに差をつけている（3分ずつ遊ばせて確かめた目安）
   ・自分で操作：いちばんたくさん集まる。たからばこ（ドット絵とまちメモが出る）を自由に探せるのは、自分で動かしたときだけ
   ・おまかせ歩き：見ているだけで、行き先へ歩いてチェックインし、人の話を読む。集まるのは自分で操作したときの半分くらい。たからばこは、すぐ近くのものだけ寄り道して開ける
   ・るすばん：アプリを閉じていた間も、主人公が西尾やとなりのまちをさんぽして ポイント・まちメモ・ドット絵 を集めてくる（10分から。上限はふつう4時間）。
     ポイントはレベルが上がるほど多い（1時間に 60＋レベル×6）。遊んでいる間ほどは集まらないが、閉じていてもゼロにはならない
   ・ポイントで「おまかせ強化」：おまかせ歩きを速く／るすばん中に集まるポイントを多く／るすばんの上限を長く。自分で操作して集めたポイントで、放置を強くする目標になる値段にしてある
   ・おまかせ歩きで約150マス進むごとに、まだ知らない まちメモ を1つ（いまいる市町の話から）。チェックインしたところの話も */
const IDLE = { minMin: 10, baseH: 4, napH: 2, ptPerHour: lv => 60 + 6 * lv, maxFacts: 3, dotMin: 120, maxDots: 2,
  ups: [
    { id: 'spd', icon: '👟', name: 'はやあし', desc: 'おまかせ歩きが速くなる', cost: [300, 1000, 3000] },
    { id: 'bag', icon: '🎒', name: 'おおきなリュック', desc: 'るすばん中に集まるポイントが1.5倍・2倍・2.5倍', cost: [400, 1200, 3600] },
    { id: 'nap', icon: '🏠', name: 'るすばん上手', desc: 'るすばんで集まる時間が2時間ずつのびて、まちメモとドット絵も1つずつ多く持ち帰る', cost: [500, 1500, 4500] },
  ] };
const idleOf = () => { if (!S.idle || typeof S.idle !== 'object') S.idle = { last: 0, lv: {} }; if (!S.idle.lv) S.idle.lv = {}; return S.idle; };
const upLv = id => Math.min(3, idleOf().lv[id] || 0);
const idleCapH = () => IDLE.baseH + IDLE.napH * upLv('nap');
const autoInterval = () => [230, 190, 160, 135][upLv('spd')];
// まだ知らないまちメモを1つ覚える（いまいる所の近くの話から）。覚えたものの鍵を返す。ぜんぶ知っていたら ''
function learnFact(id) {
  const c = me || { lat: CFG.center[0], lng: CFG.center[1] };
  const k = pickFact({ id, lat: c.lat, lng: c.lng });
  if (!k || S.facts.includes(k)) return '';
  S.facts.push(k);
  return k;
}
// おかえり：閉じていた間（または「あるいて移動」にしていた間）のるすばんの分を渡す
function idleCheck(tries = 0) {
  if (!demo) return;
  if ((!spots.length || !areas.length) && tries < 20) { clearTimeout(idleCheck.t); idleCheck.t = setTimeout(() => idleCheck(tries + 1), 1500); return; }
  const i = idleOf(), now = Date.now(), last = i.last;
  i.last = now;
  if (!last || now - last < IDLE.minMin * 60000) { save(); return; }
  const min = Math.min((now - last) / 60000, idleCapH() * 60), mul = 1 + 0.5 * upLv('bag');
  const pts = Math.max(1, Math.floor(min / 60 * IDLE.ptPerHour(levelOf(S.total)) * mul));
  const learned = [];
  for (let n = Math.min(IDLE.maxFacts + upLv('nap'), Math.max(1, Math.floor(min / 60))), k = 0; k < n; k++) {
    const f = learnFact(`idle:${now}:${k}`);
    if (!f) break;
    learned.push(f);
  }
  // ドット絵：2時間に1枚（西尾市のスポットのどこかで見つけてくる）
  const dots = [], home = spots.filter(x => { const c = cityAt(x.lat, x.lng); return c && c.name === '西尾市'; });
  for (let n = Math.min(IDLE.maxDots + upLv('nap'), Math.floor(min / IDLE.dotMin)), k = 0; k < n && home.length; k++) {
    const sp = home[Math.floor(Math.random() * home.length)], d = gainDot(sp.lat, sp.lng, `idle:${now}:${k}`, sp.area);
    if (d) dots.push(d);
  }
  S.log.unshift({ type: 'idle', t: now, pts, name: 'るすばんのさんぽ', icon: '🏠' });
  const lvUp = gainPoints(pts);
  save();
  track('idle_return', { minutes: Math.round(min) });
  const h = Math.floor(min / 60), m = Math.round(min % 60), capped = (now - last) / 60000 >= idleCapH() * 60;
  const lines = [`⏱️ るすばん ${h ? h + '時間' : ''}${m}分${capped ? `（上限${idleCapH()}時間）` : ''}`, `🏠 さんぽのポイント +${pts}`];
  if (learned.length) lines.push(`📖 まちメモ +${learned.length}（きろくで読めます）`);
  for (const d of dots) lines.push(...dotLines(d));
  showReward(pts, 'おかえりなさい！ るすばん中に まちをさんぽしてきました', lines, lvUp, learned.length ? factPool().get(learned[0]) : '', dots[0]);
  renderLog();
  refreshNearby();
}
function idleMark() { if (demo) { idleOf().last = Date.now(); save(); } }
// おまかせ歩きで進んだとき（pixel.js から約150マスごと）：まちメモを1つ
function autoLearn() {
  if (!demo) return;
  const k = learnFact(`walk:${S.facts.length}:${me ? Math.round(me.lat * 1e4) + ':' + Math.round(me.lng * 1e4) : ''}`);
  if (!k) return;
  save();
  const t = factPool().get(k) || '';
  toast(`📖 まちメモ：${t.length > 72 ? t.slice(0, 71) + '…' : t}`);
  if (window.nishioPixel && nishioPixel.floatText) nishioPixel.floatText('📖+1');
  track('idle_fact', { mode: 'play' });
}
function buyUp(id) {
  const u = IDLE.ups.find(x => x.id === id), lv = upLv(id);
  if (!demo || !u || lv >= u.cost.length) return;
  const cost = u.cost[lv];
  if (S.points < cost) { toast(`ポイントが足りません（あと${cost - S.points}pt）`); return; }
  S.points -= cost;
  idleOf().lv[id] = lv + 1;
  S.log.unshift({ type: 'up', t: Date.now(), pts: -cost, name: `${u.name} Lv${lv + 1}`, icon: u.icon });
  save(); renderHeader(); renderLog();
  toast(`${u.icon} ${u.name}が Lv${lv + 1} になりました`);
  track('idle_upgrade', { id, lv: lv + 1 });
}
function renderUps() {
  $('upBox').hidden = !demo;
  if (!demo) return;
  const lv = levelOf(S.total), perH = Math.floor(IDLE.ptPerHour(lv) * (1 + 0.5 * upLv('bag')));
  $('upNote').textContent = `🎮 自分で操作：いちばんたくさん集まり、たからばこ（ドット絵）を自由に探せます。🧭 おまかせ歩き：見ているだけで行き先へ（集まるのは半分くらい。たからばこは すぐ近くのものだけ）。🏠 るすばん：閉じている間も 1時間に約${perH}pt（最大${idleCapH()}時間）と、まちメモ・ドット絵を持ち帰ります。`;
  $('upList').innerHTML = IDLE.ups.map(u => {
    const lv = upLv(u.id), max = lv >= u.cost.length, cost = u.cost[lv];
    return `<li><span class="ico">${u.icon}</span><span class="main"><b>${esc(u.name)} <small>Lv${lv}/${u.cost.length}</small></b><small>${esc(u.desc)}</small></span>`
      + (max ? '<span class="num">MAX</span>' : `<button type="button" class="btn mini" data-up="${u.id}"${S.points < cost ? ' disabled' : ''}>${cost}pt</button>`) + '</li>';
  }).join('');
}

/* ---------- 画面 ---------- */
function setStatus(html, isHtml) { const el = $('status'); if (isHtml) el.innerHTML = html; else el.textContent = html; }

function renderHeader() {
  const lv = levelOf(S.total);
  const lo = needFor(lv), hi = needFor(lv + 1);
  $('lvNum').textContent = lv;
  $('lvFill').style.width = Math.min(100, ((S.total - lo) / (hi - lo)) * 100) + '%';
  $('ptsNum').textContent = S.points.toLocaleString();
  document.querySelectorAll('.mode-sw [data-mode]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.mode === 'demo') === demo)));
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3800);
}

function showReward(total, name, lines, lvUp, fact, dot) {
  sound.jingle(lvUp ? 'levelup' : 'checkin');
  const el = $('reward'), D = window.NISHIO_DOTS;
  el.innerHTML = `<div class="rw${fact || dot ? ' long' : ''}"><div class="big">+${total}pt</div><div class="nm">${esc(name)}</div>
    ${dot && D ? `<img class="dot-card" src="${D.dataUrl(dot.id)}" alt="${esc(D.info(dot.id).name)}" width="144" height="144"/>` : ''}
    <ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
    ${fact ? `<p class="fact">💡 ${esc(fact)}</p>` : ''}
    ${lvUp ? `<div class="lvup">🎉 レベルアップ！<br/><span>Lv${lvUp}「${esc(titleOf(lvUp))}」</span></div>` : ''}</div>`;
  if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
  el.classList.add('show');
  clearTimeout(showReward.t); showReward.t = setTimeout(hideReward, fact || dot ? 7000 : 2700);
  afterReward();
}
// ごほうびの画面は、どこかをタップすると消える（タップは下の地図やボタンには届かない）
function hideReward() { clearTimeout(showReward.t); const el = $('reward'); el.innerHTML = ''; el.classList.remove('show'); }
$('reward').addEventListener('click', hideReward);

/* ---------- 西尾ドット絵帳（dots.js：西尾ならではのドット絵 70000枚） ----------
   西尾市の中で、たからばこを開けたり、スポットにチェックインしたりすると1枚もらえる。どの絵かは場所（地区・土地利用）と季節・時間帯・天気・日にちで決まる */
function gainDot(lat, lng, seed, area) {
  const D = window.NISHIO_DOTS;
  if (!D || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const id = D.pick(lat, lng, seed, new Date(), area);
  if (id == null) return null;
  if (!Array.isArray(S.dots)) S.dots = [];
  const fresh = !S.dots.includes(id);
  if (fresh) S.dots.push(id);
  track('dot_get', { motif: D.info(id).motif, fresh, mode: demo ? 'play' : 'walk' });
  return { id, fresh };
}
function dotLines(dot) {
  const D = window.NISHIO_DOTS;
  if (!dot || !D) return [];
  const f = D.info(dot.id);
  return [`🖼 西尾ドット絵 No.${f.no}「${f.name}」${dot.fresh ? '' : '（もう持っている絵）'}`];
}
let dotSel = null;   // 絵帳で開いている題材（null は、さいきんもらった絵）
function renderDots() {
  const D = window.NISHIO_DOTS, grid = $('dotGrid');
  if (!D || !grid) return;
  // 目標は「題材 n/35」と「題材×天気 n/175」。70000枚ぜんぶは目標にしない（置き方のちがいは、見つけるたびの楽しみ）
  const have = (S.dots || []).filter(id => id >= 0 && id < D.COUNT), by = new Map(), wx = new Map();
  for (const id of have) { const f = D.info(id); by.set(f.m, (by.get(f.m) || 0) + 1); if (!wx.has(f.m)) wx.set(f.m, new Set()); wx.get(f.m).add(f.w); }
  const nWx = [...wx.values()].reduce((a, x) => a + x.size, 0), WX_ICON = ['☀️', '☁️', '☔', '🌫️', '🌈'];
  $('dotCount').textContent = `題材 ${by.size}/${D.MOTIFS.length}・題材×天気 ${nWx}/${D.MOTIFS.length * 5}・絵 ${have.length.toLocaleString()}枚`;
  $('dotMotifs').innerHTML = D.MOTIFS.map((m, i) => `<li class="${dotSel === i ? 'on' : ''}${by.has(i) ? '' : ' none'}"><button type="button" data-dotm="${i}"><span>${by.has(i) ? m.icon : '？'}</span><b>${esc(m.name)}</b><small>${WX_ICON.map((c, w) => `<i class="${wx.has(i) && wx.get(i).has(w) ? 'on' : ''}">${c}</i>`).join('')} ${by.get(i) || 0}枚</small></button></li>`).join('');
  const list = dotSel == null ? have.slice(-24).reverse() : have.filter(id => D.motifOf(id) === dotSel).sort((a, b) => a - b);
  $('dotNote').textContent = dotSel == null ? 'さいきんもらった絵（題材を押すと、その題材の絵を番号順に見られます）' : `${D.MOTIFS[dotSel].icon} ${D.MOTIFS[dotSel].name}（もう一度押すと、さいきんもらった絵にもどります）`;
  grid.innerHTML = list.length ? list.map(id => { const f = D.info(id); return `<figure><img src="${D.dataUrl(id)}" alt="${esc(f.name)}" width="96" height="96" loading="lazy"/><figcaption>No.${f.no}<br/>${dotSel == null ? esc(f.title) + '<br/>' : ''}${esc(f.label)}</figcaption></figure>`; }).join('')
    : `<p class="empty">${dotSel == null ? 'まだありません。西尾市の中で、たからばこを開けたり、スポットにチェックインしたりしてみよう' : 'この題材の絵は、まだありません'}</p>`;
}
$('dotMotifs').addEventListener('click', e => {
  const b = e.target.closest('[data-dotm]');
  if (!b) return;
  const i = Number(b.dataset.dotm);
  dotSel = dotSel === i ? null : i;
  renderDots();
});

function renderLog() {
  renderTomorrow();
  renderCampaigns();
  renderUps();
  const day = dayState(), qs = todaysQuests();
  $('questList').innerHTML = qs.map(q => {
    const done = day.done.includes(q.id), v = Math.min(q.goal, q.val(day));
    return `<li class="${done ? 'done' : ''}"><span class="ico">${done ? '✅' : q.icon}</span><span class="main"><b>${esc(q.text)}</b>
      <small>${done ? '達成！' : `${q.unit === 'm' ? fmtM(v) + ' / ' + fmtM(q.goal) : v + ' / ' + q.goal}`}${q.sub ? `・${esc(q.sub)}` : ''}</small></span><span class="num">+${q.pts}</span></li>`;
  }).join('') + `<li class="${day.bonus ? 'done' : ''}"><span class="ico">${day.bonus ? '🏆' : '🎯'}</span><span class="main"><b>3つぜんぶ達成</b><small>${day.bonus ? '達成！あしたも新しいクエストが出ます' : 'あしたは別のクエストになります'}</small></span><span class="num">+${CFG.pts.questAll}</span></li>`;
  const ev = upcomingEvents();
  $('eventList').innerHTML = ev.length ? ev.map(({ e, when, next }) => {
    const s = e.spot && spots.find(x => x.id === evSpotId(e));
    return `<li class="${next ? 'next' : ''}"><span class="ico">${next ? '🗓️' : '📅'}</span><span class="main"><b>${esc(e.name)}</b>
      <small>${esc(when)}・${esc(e.place)}</small></span>${s && demo ? `<button type="button" class="btn mini" data-move="${esc(s.id)}">行く</button>` : s && S.visits[s.id] ? '<span class="num">✓</span>' : ''}</li>`;
  }).join('') : '<li class="empty">今月と来月の行事はありません</li>';
  const facts = factPool();
  $('factCount').textContent = `${S.facts.filter(k => facts.has(k)).length}/${facts.size}`;
  renderDots();
  $('factList').innerHTML = S.facts.filter(k => facts.has(k)).slice().reverse().map(k => `<li><span class="ico">💡</span><span class="main"><small>${esc(facts.get(k))}</small></span></li>`).join('')
    || '<li class="empty">たからばこを開けたり、チェックインしたり、おまかせ歩きで歩いたりすると、まちメモが集まります</li>';
  const lv = levelOf(S.total);
  $('stats').innerHTML = [
    ['使えるポイント', S.points.toLocaleString(), 'pt'], ['レベル', `${lv}`, titleOf(lv)],
    ['まちメモ', knownFacts(), 'こ'], ['話した人', (S.met || []).length, '人'],
    ['めぐったスポット', Object.keys(S.visits).length, 'か所'], ['チェックイン', S.checkins, '回'],
    ['歩いた距離', fmtM(S.walked), ''], ['連続日数', S.streak.last === ymd() || S.streak.last === yesterday() ? S.streak.days : 0, '日'],
    ['最長連続', S.streak.max || 0, '日'], ['これまでの合計', S.total.toLocaleString(), 'pt'],
  ].map(([k, v, u]) => `<div class="stat"><small>${k}</small><b>${esc(v)}<small>${esc(u)}</small></b></div>`).join('');

  const visits = Object.entries(S.visits).sort((a, b) => b[1].last - a[1].last);
  $('visitedList').innerHTML = visits.length ? visits.map(([id, v]) =>
    `<li data-spot="${esc(id)}"><span class="ico">${esc(v.icon || '📍')}</span><span class="main"><b>${esc(v.name)}</b>
      <small>${v.n}回・最後 ${fmtTime(v.last)}</small></span>${v.featured ? '<span class="num">⭐</span>' : ''}</li>`).join('')
    : '<li class="empty">まだありません。地図のスポットへ歩いてみよう！</li>';

  $('areaList').innerHTML = areas.length ? areas.map(a => {
    const p = areaProgress(a.id), pct = p.total ? Math.round(p.done / p.total * 100) : 0;
    return `<li class="area-row"><span class="ico">${esc(a.icon || '🗾')}</span><span class="main"><b>${esc(a.name)}</b>
      <small>${esc(a.catch || '')}</small><span class="bar"><i style="width:${pct}%"></i></span></span><span class="num">${p.done}/${p.total}</span></li>`;
  }).join('') : '<li class="empty">地区の情報を読み込めませんでした</li>';

  $('logList').innerHTML = S.log.length ? S.log.slice(0, 50).map(l =>
    `<li><span class="ico">${l.type === 'walk' ? '👣' : l.type === 'use' ? '🎁' : esc(l.icon || '📍')}</span><span class="main"><b>${esc(l.name)}</b>
      <small>${l.type === 'walk' ? l.date.replace(/^\d+-0?(\d+)-0?(\d+)$/, '$1/$2') : fmtTime(l.t)}</small></span><span class="num${l.pts < 0 ? ' minus' : ''}">${l.pts > 0 ? '+' : ''}${l.pts}</span></li>`).join('')
    : '<li class="empty">まだありません</li>';
}

function renderBadges() {
  const got = new Set(S.badges);
  $('badgeGrid').innerHTML = badgeDefs().map(b => {
    const done = got.has(b.id) || (b.ready !== false && b.cur >= b.goal);
    const pct = Math.min(100, (b.cur / b.goal) * 100);
    return `<div class="badge ${done ? 'got' : 'locked'}"><div class="bi">${b.i}</div><b>${esc(b.n)}</b><small>${esc(b.d)}</small>
      ${done ? '<small>獲得済み</small>' : `<div class="bp"><i style="width:${pct}%"></i></div><small>${Math.min(b.cur, b.goal)}/${b.goal}</small>`}</div>`;
  }).join('');
  const lv = levelOf(S.total);
  $('titleList').innerHTML = TITLES.map(([l, t]) =>
    `<li class="${titleOf(lv) === t ? 'now' : ''}"><span class="ico">${lv >= l ? '🎖️' : '🔒'}</span><span class="main"><b>${esc(t)}</b>
      <small>Lv${l}（累計 ${needFor(l).toLocaleString()}pt）</small></span>${titleOf(lv) === t ? '<span class="num">いまここ</span>' : ''}</li>`).join('');
}

function featRange() {
  const p = spots.filter(s => s.featured).map(ptsOf);
  if (!p.length) return `${CFG.pts.featured}pt`;
  const lo = Math.min(...p), hi = Math.max(...p);
  return lo === hi ? `${lo}pt` : `${lo}〜${hi}pt`;
}

function renderSpotInfo() {
  const n = spots.length;
  $('spotInfo').textContent = spotsLoading ? '読み込んでいます…' : spotMeta.osmOk
    ? `${n.toLocaleString()}か所（注目${spotMeta.featured}）・地図データ取得 ${fmtTime(spotMeta.osmAt)}`
    : `${n}か所（注目スポットのみ。OpenStreetMapを取得できませんでした）`;
  $('rules').innerHTML = [
    `スポットまで約${CFG.reach}m以内に近づくと「チェックイン」できます（お店など一部のスポットは範囲が広め。地図の点線の円が範囲です）`,
    `ふつうのスポット ${CFG.pts.normal}pt／⭐注目スポット ${featRange()}`,
    `はじめての訪問 +${CFG.pts.first}pt（注目スポットは +${CFG.pts.firstFeatured}pt）`,
    `その日はじめてのチェックイン +${CFG.pts.daily}pt、連続日数ごとに +${CFG.pts.streakStep}pt（最大 +${CFG.pts.streakStep * CFG.pts.streakMax}pt）`,
    `同じスポットは${CFG.cooldownMin}分ごとにチェックインできます`,
    `${CFG.walkUnitM}m 歩くごとに ${CFG.walkUnitPts}pt（1日 ${CFG.walkDailyCap}ptまで）。数えるのは、このページを開いて画面がついている間に歩いた距離だけです（画面を消す・ほかのアプリを開くと止まります）`,
    '乗り物での移動（時速約30km以上）中は、チェックインと歩数ポイントが止まります',
  ].map(t => `<li>${esc(t)}</li>`).join('');
}

/* ---------- 特典（ポイント交換） ---------- */
let rewardCfg = { shop: '', validMin: 30, rewards: [] };
async function loadRewards() {
  try {
    const res = await fetch('nishio-go/rewards.json', { cache: 'no-cache' });
    const j = res.ok ? await res.json() : null;
    if (j && Array.isArray(j.rewards)) {
      rewardCfg = {
        shop: String(j.shop || ''),
        validMin: Number(j.validMin) > 0 ? Number(j.validMin) : 30,
        rewards: j.rewards.filter(r => r && r.id && r.name && Number(r.cost) > 0)
          .map(r => ({ id: String(r.id), name: String(r.name), cost: Math.round(Number(r.cost)), desc: r.desc ? String(r.desc) : '',
            perDay: Number(r.perDay) > 0 ? Math.floor(Number(r.perDay)) : 0, active: r.active === true })),
      };
    }
  } catch (e) { /* 特典なしで続行 */ }
  updateRewardsTab();
}
// あるいて移動では active の特典だけ。操作して移動では無効の特典も「サンプル」として試せる
const visibleRewards = () => rewardCfg.rewards.filter(r => r.active || demo);
function updateRewardsTab() {
  const has = visibleRewards().length > 0;
  $('rewardsTab').hidden = !has;
  if (!has && !$('panel-rewards').hidden) openTab('map');
}
const couponState = c => c.used ? 'used' : Date.now() > c.t + c.validMin * 60000 ? 'expired' : 'valid';
const usedToday = rid => S.coupons.filter(c => c.rid === rid && ymd(new Date(c.t)) === ymd()).length;

function renderRewards() {
  $('walletPts').textContent = S.points.toLocaleString();
  $('rewardNote').textContent = demo
    ? '操作して移動：サンプルの特典で交換の流れを試せます（このクーポンはお店では使えません。お店のとくてんは「あるいて移動」で）。'
    : `交換すると、その場でクーポン画面が出ます（有効${rewardCfg.validMin}分）。お店で店員さんに見せる直前に交換してください。`;
  $('rewardList').innerHTML = visibleRewards().map(r => {
    const limit = r.perDay && usedToday(r.id) >= r.perDay;
    const short = S.points < r.cost;
    const why = limit ? '今日はもう交換しました' : short ? `あと${(r.cost - S.points).toLocaleString()}pt` : '';
    return `<li><span class="ico">🎁</span><span class="main"><b>${esc(r.name)}${r.active ? '' : ' <em class="sample">サンプル</em>'}</b>
      <small>${r.cost.toLocaleString()}pt${r.perDay ? `・1日${r.perDay}回まで` : ''}${r.desc ? '・' + esc(r.desc) : ''}</small></span>
      <button type="button" class="btn" data-redeem="${esc(r.id)}" ${why ? 'disabled' : ''}>${why ? esc(why) : '交換'}</button></li>`;
  }).join('') || '<li class="empty">いま交換できる特典はありません</li>';
  const list = S.coupons.slice().sort((a, b) => b.t - a.t).slice(0, 20);
  $('couponList').innerHTML = list.length ? list.map(c => {
    const st = couponState(c);
    const label = st === 'used' ? `使用済み ${fmtTime(c.used)}` : st === 'expired' ? '期限切れ' : `有効 あと${Math.ceil((c.t + c.validMin * 60000 - Date.now()) / 60000)}分`;
    return `<li data-coupon="${esc(c.id)}" class="${st === 'valid' ? 'now' : ''}"><span class="ico">🎫</span><span class="main"><b>${esc(c.name)}</b>
      <small>${fmtTime(c.t)} 交換・${label}</small></span>${st === 'valid' ? '<span class="num">見せる</span>' : ''}</li>`;
  }).join('') : '<li class="empty">まだありません</li>';
}

function redeem(rid) {
  const r = visibleRewards().find(x => x.id === rid);
  if (!r) return;
  if (S.points < r.cost) { toast('ポイントが足りません'); return; }
  if (r.perDay && usedToday(r.id) >= r.perDay) { toast('この特典は今日はもう交換しました'); return; }
  if (!confirm(`「${r.name}」と ${r.cost}pt を交換しますか？\n\n交換するとクーポン画面が出ます（有効${rewardCfg.validMin}分）。お店で店員さんに見せる直前に押してください。交換したポイントは戻せません。`)) return;
  const rnd = new Uint32Array(2);
  (window.crypto || {}).getRandomValues ? crypto.getRandomValues(rnd) : (rnd[0] = Math.random() * 4e9, rnd[1] = Math.random() * 4e9);
  const c = { id: rnd[0].toString(36) + rnd[1].toString(36), rid: r.id, name: r.name, cost: r.cost, t: Date.now(),
    validMin: rewardCfg.validMin, code: String(rnd[0] % 10000).padStart(4, '0'), used: 0, demo, sample: !r.active };
  S.points -= r.cost;
  S.coupons.push(c);
  S.coupons = S.coupons.slice(-50);
  S.log.unshift({ type: 'use', t: c.t, pts: -r.cost, name: `${r.name} と交換` });
  save();
  renderHeader();
  renderRewards();
  showCoupon(c.id);
}

let couponTimer = null, couponId = null;
function showCoupon(id) {
  couponId = id;
  $('coupon').hidden = false;
  tickCoupon();
  clearInterval(couponTimer);
  couponTimer = setInterval(tickCoupon, 1000);
}
function tickCoupon() {
  const c = S.coupons.find(x => x.id === couponId);
  if (!c) { closeCoupon(); return; }
  const st = couponState(c);
  const d = new Date();
  $('cpShop').textContent = c.demo ? '操作モード（お店では使えません）' : rewardCfg.shop;
  $('cpName').textContent = c.name;
  $('cpCode').textContent = `No. ${c.code}`;
  $('cpClock').textContent = `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  const left = c.t + c.validMin * 60000 - Date.now();
  $('cpState').textContent = st === 'used' ? `使用済み（${fmtTime(c.used)}）` : st === 'expired' ? '有効期限が切れています'
    : `有効 あと${Math.floor(left / 60000)}分${pad2(Math.floor(left / 1000) % 60)}秒（${fmtTime(c.t)} 交換）`;
  $('coupon').dataset.state = st;
  $('cpStaff').hidden = st !== 'valid';
}
function closeCoupon() {
  clearInterval(couponTimer); couponTimer = null; couponId = null;
  $('coupon').hidden = true;
  if (!$('panel-rewards').hidden) renderRewards();
}
$('cpUse').addEventListener('click', () => {
  const c = S.coupons.find(x => x.id === couponId);
  if (!c || couponState(c) !== 'valid') return;
  c.used = Date.now();
  save();
  tickCoupon();
});
$('cpClose').addEventListener('click', closeCoupon);
$('rewardList').addEventListener('click', e => { const b = e.target.closest('[data-redeem]'); if (b && !b.disabled) redeem(b.dataset.redeem); });
$('couponList').addEventListener('click', e => {
  const li = e.target.closest('li[data-coupon]');
  if (li) showCoupon(li.dataset.coupon);
});

/* いまのGPS（お店などのスポットを登録するときに、その場で座標を取れるように） */
function renderGpsInfo() {
  $('gpsInfo').textContent = !me ? (gpsError || 'まだ位置が取れていません')
    : `${me.lat.toFixed(6)}, ${me.lng.toFixed(6)}（${demo ? '操作して移動した位置' : `誤差 約${Math.round(me.acc)}m`}）`;
  $('copyGps').disabled = !me;
}
$('copyGps').addEventListener('click', async () => {
  if (!me) return;
  const t = `${me.lat.toFixed(6)}, ${me.lng.toFixed(6)}`;
  try { await navigator.clipboard.writeText(t); toast(`座標をコピーしました：${t}`); }
  catch (e) { prompt('この座標をコピーしてください', t); }
});

/* タブ */
function openTab(tab) {
  hideReward();   // ほかのタブを開いたら、ポイントの知らせは消す
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  ['log', 'rewards', 'settings'].forEach(t => { $('panel-' + t).hidden = t !== tab; });
  if (tab === 'rewards') renderRewards();
  if (tab === 'log') { renderLog(); renderBadges(); }   // バッジは きろく の下に
  if (tab === 'settings') { renderSpotInfo(); renderGpsInfo(); $('pxToggle').checked = document.body.classList.contains('px'); }
  if (tab === 'map') setTimeout(() => map.invalidateSize(), 0);
}
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => openTab(b.dataset.tab)));
$('lvBtn').addEventListener('click', () => { openTab('log'); $('badgeHead').scrollIntoView(); });
$('pxToggle').addEventListener('change', e => { if (window.nishioPixel) nishioPixel.setActive(e.target.checked); });

$('visitedList').addEventListener('click', e => {
  const li = e.target.closest('li[data-spot]');
  const s = li && spots.find(x => x.id === li.dataset.spot);
  if (!s) return;
  follow = false;
  openTab('map');
  map.setView([s.lat, s.lng], 17);
  setTimeout(() => markers.get(s.id)?.openPopup(), 300);
});

$('spinBtn').addEventListener('click', checkin);
$('locateBtn').addEventListener('click', () => {
  follow = true;
  if (document.body.classList.contains('px') && window.nishioPixel) nishioPixel.centerOnMe();   // ドット絵の地図（せかいちず）でも主人公へ
  if (me) map.setView([me.lat, me.lng], Math.max(map.getZoom(), 16));
  else toast(demo ? '地図をタップして移動してください' : '位置情報を取得中です…');
});

/* モード切替 */
function setMode(isDemo) {
  // 歩いていた場所から操作を始める（まだ位置がなければ地図のまん中）。遊べる範囲の外にいたときは、西尾のまん中から（範囲の外は歩く地図が作られず、歩けない）
  const inside = p => p && inPlay(p.lat, p.lng);
  const here = !demo && inside(me) ? me : null;
  if (demo && !isDemo) idleMark();   // 操作して移動をやめるときは、ここから るすばん
  demo = isDemo;
  store.set('nsg_mode', demo ? 'demo' : 'real');
  S = loadState();
  me = null; lastWalk = null; driving = false;   // 乗り物判定（vehicleUntil）はモードを切り替えても保持する
  if (meMarker) { meMarker.remove(); accCircle.remove(); meMarker = accCircle = null; }
  if (demo) {
    stopGps();
    const mc = map.getCenter(), c = here || (inside(mc) ? mc : { lat: CFG.center[0], lng: CFG.center[1] });
    onFix(c.lat, c.lng, 5, Date.now());
  } else {
    startGps();
  }
  renderHeader();
  updateRewardsTab();
  modeListeners.forEach(fn => fn(demo));
  markers.forEach(m => m.remove()); markers.clear();
  renderMarkers();
  refreshNearby();
  idleCheck();
}
map.on('click', e => {
  if (!demo) return;
  follow = false;
  onFix(e.latlng.lat, e.latlng.lng, 5, Date.now());
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-move]');
  const s = b && demo && spots.find(x => x.id === b.dataset.move);
  if (!s) return;
  map.closePopup();
  follow = false;
  onFix(s.lat, s.lng, 5, Date.now());
  if ($('panel-log') && !$('panel-log').hidden) openTab('map');   // きろくの「行く」から来たときは地図へ
});
function switchMode(isDemo) {
  if (isDemo === demo) return;
  sessionEnd();   // 1回に遊んだ時間・ポイントは、モードごとに分けて送る
  setMode(isDemo);
  if (store.get('nsg_started', false)) sessionStart();
  track('mode_switch', { mode: demo ? 'play' : 'walk' });
  toast(demo ? `🎮 操作して移動にしました（${document.body.classList.contains('px') ? 'スティックで歩きます' : '地図をタップした所へ移動します'}。記録は別です）`
    : '🚶 あるいて移動にしました（位置情報を使います）');
}
document.querySelectorAll('.mode-sw [data-mode]').forEach(b => b.addEventListener('click', () => switchMode(b.dataset.mode === 'demo')));

$('reloadSpots').addEventListener('click', async e => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const ok = await loadSpots(true);
    toast(ok ? `スポットを更新しました（${spots.length}か所）` : 'スポット情報を取得できませんでした。通信環境を確認して、時間をおいてお試しください。');
  }
  finally { btn.disabled = false; }
});
$('resetBtn').addEventListener('click', () => {
  if (!confirm(`「${demo ? '操作して移動' : 'あるいて移動'}」のポイントと記録をすべて削除します。よろしいですか？`)) return;
  S = freshState(); save(); renderHeader(); renderLog(); renderMarkers(); refreshNearby(); closeCoupon();
  toast('記録を削除しました');
});

/* ---------- 音楽（BGM と効果音） ----------
   nishio-go/bgm/ に mp3 を置くと流れる（無い曲は鳴らさないだけ）。field：ふだん（歩く地図・ふつうの地図）、
   world：せかいちず（無ければ field）、checkin：チェックイン、levelup：レベルアップ。
   ブラウザは最初のタップまで音を出せないので、最初のタップ（はじめの画面のボタンなど）で流し始める */
const sound = (() => {
  const SRC = { field: 'nishio-go/bgm/field.mp3', world: 'nishio-go/bgm/world.mp3', checkin: 'nishio-go/bgm/checkin.mp3', levelup: 'nishio-go/bgm/levelup.mp3' };
  const VOL = 0.28, SFX_VOL = 0.35, LOOP = new Set(['field', 'world']), els = {}, missing = new Set();   // 音量：BGM 0.28（ひかえめ）、効果音 0.35
  let on = store.get('nsg_bgm', true), unlocked = false, scene = 'field', cur = null, ducking = 0;   // ducking：鳴っている効果音の数
  const el = k => {
    if (!els[k]) {
      const a = new Audio(); a.preload = 'none'; a.loop = LOOP.has(k); a.volume = LOOP.has(k) ? VOL : SFX_VOL; a.src = SRC[k];
      a.addEventListener('error', () => { missing.add(k); if (LOOP.has(k)) apply(); });
      els[k] = a;
    }
    return els[k];
  };
  const pick = () => (scene === 'world' && !missing.has('world') ? 'world' : missing.has('field') ? null : 'field');
  function apply() {
    const live = on && unlocked && !document.hidden, k = live ? pick() : null;
    for (const [n, a] of Object.entries(els)) {
      if (LOOP.has(n) ? n !== k : !live) a.pause();   // 消したとき・画面を離れたときは効果音も止める
    }
    if (!live) ducking = 0;
    cur = k;
    if (k) { const a = el(k); a.volume = ducking ? VOL * 0.25 : VOL; if (a.paused) a.play().catch(() => {}); }
    $('bgmToggle').checked = on;
  }
  const unlock = () => { if (unlocked) return; unlocked = true; apply(); };
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { once: true, capture: true }));
  document.addEventListener('visibilitychange', apply);
  return {
    apply,
    scene(s) { if (s !== scene) { scene = s; apply(); } },
    toggle(v) { on = v === undefined ? !on : !!v; store.set('nsg_bgm', on); unlocked = true; apply(); },
    jingle(k) {   // 効果音のあいだは BGM を小さく（途中で曲が切り替わっても小さいまま）
      if (!on || !unlocked || document.hidden || missing.has(k)) return;
      const a = el(k);
      if (!a.paused) { a.currentTime = 0; return; }   // 同じ効果音が鳴っている最中なら頭から鳴らし直すだけ
      const done = () => { a.onended = a.onerror = a.onpause = null; ducking = Math.max(0, ducking - 1); apply(); };
      ducking++; apply();
      a.onended = a.onerror = a.onpause = done;
      a.currentTime = 0; a.play().catch(done);
    },
  };
})();
$('bgmToggle').addEventListener('change', e => sound.toggle(e.target.checked));
// アクセス解析（analytics.js）のオン・オフ。切り替えは次に開いたときから
$('anaToggle').checked = !store.get('nsg_noanalytics', false);
$('anaToggle').addEventListener('change', e => { try { localStorage.setItem('nsg_noanalytics', e.target.checked ? '0' : '1'); } catch (err) { /* noop */ } toast(e.target.checked ? '📊 アクセス解析をオンにしました（次に開いたときから）' : '📊 アクセス解析をオフにしました（次に開いたときから送りません）'); });
sound.apply();

/* 下の案内パネルの高さ（チェックインのボタンが出ると高くなる）を CSS に知らせ、スティックや丸ボタンが隠れないようにする */
if (window.ResizeObserver) new ResizeObserver(() => document.documentElement.style.setProperty('--sheet-h', $('sheet').offsetHeight + 'px')).observe($('sheet'));

/* ---------- 離脱を減らす（docs/retention.md） ----------
   ・はじめの1分でごほうび：操作して遊ぶは、すぐ近くに「ようこそ たからばこ」（pixel.js が置く）。あるいて遊ぶは、遊べる範囲で位置が取れたら「ようこそ」
   ・行きづまらない：位置情報が使えない・遊べる範囲の外なら、その場で「操作して遊ぶ」に切り替えるボタン
   ・あしたも来たくなる：あしたのおたのしみ（連続日数のボーナス・新しいクエスト・るすばん）を、きろくと1日1回の知らせで
   ・また開きやすく：ごほうびを2回もらったら「ホーム画面に追加」をすすめる（7日に1回まで。追加ずみ・アプリとして開いているときは出さない）
   ・はかる：はじめてのごほうびまでの秒数、はじめて遊んだ日から何日目か、1回に遊んだ時間（session_end） */
function RESCUE_BTN(why) { return `<br/><button type="button" class="btn mini" data-rescue="${why}">🎮 操作して遊ぶ に切り替える（家からでも遊べます）</button>`; }
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-rescue]');
  if (!b) return;
  track('rescue_switch', { why: b.dataset.rescue });
  switchMode(true);
  if (window.nishioPixel && !document.body.classList.contains('px')) nishioPixel.setActive(true);
  if (welcomeDue() && window.nishioPixel && nishioPixel.worldMode) nishioPixel.setWorld(false);   // はじめてなら、ようこそ たからばこ の見える歩く地図で
});
function welcomeDue() { return demo && !S.welcomed && S.total < 200; }   // まだ ようこそ たからばこ を開けていない、はじめのうちの人
function welcomeWalk() {
  if (demo || S.welcomed || S.total >= 200 || !me || !inPlay(me.lat, me.lng) || !fixOk()) return;
  S.welcomed = true;
  const pts = 30, dot = gainDot(me.lat, me.lng, 'welcome:' + ymd());
  S.log.unshift({ type: 'welcome', t: Date.now(), pts, name: 'ようこそ', icon: '🎉' });
  const lvUp = gainPoints(pts);
  save();
  const g = guideTarget();
  showReward(pts, 'ようこそ にしおさんぽGOへ！', ['🎉 はじめてボーナス +30', ...dotLines(dot), g ? `🧭 つぎは「${g.name}」（${fmtM(dist(me, g))}）へ。着くとポイント` : '⭐ 近くの名所に着くとチェックインでポイント'], lvUp, '', dot);
  renderLog();
}
function dayN() { const f = store.get('nsg_first_day', ''); return /^\d{4}-\d\d-\d\d$/.test(f) ? Math.max(0, Math.round((new Date(ymd()) - new Date(f)) / 86400000)) : -1; }   // -1：はじめて遊んだ日がわからない（この計測より前から遊んでいる人）
function afterReward() {
  session.rewards++;
  if (!store.get('nsg_first_reward', false)) {
    store.set('nsg_first_reward', true);
    const t0 = store.get('nsg_begin_t', 0);
    if (t0) track('first_reward', { secs: Math.round((Date.now() - t0) / 1000), mode: demo ? 'play' : 'walk' });   // はじめた時刻がわからない人（前から遊んでいる人）は数えない
  }
  // 1日1回：その日2回目のごほうびのあと、ごほうびの画面が消えてから「あしたのおたのしみ」。そのあと ホーム画面に追加のおすすめ
  if (session.rewards < 2) return;
  afterRewardClosed(() => {
    if (store.get('nsg_tmr_day', '') !== ymd()) { store.set('nsg_tmr_day', ymd()); toast(`📅 ${tomorrowItems()[0]}（きろくの「あしたのおたのしみ」）`); }
    setTimeout(a2hsOffer, 4200);
  });
}
// ごほうびの画面が消えてから（重ならないように）。続けてごほうびが出たら、そのぶん待つ
function afterRewardClosed(fn) {
  clearTimeout(afterRewardClosed.t);
  const wait = () => { afterRewardClosed.t = setTimeout(() => ($('reward').classList.contains('show') ? wait() : fn()), 1000); };
  wait();
}
function tomorrowItems() {
  const bonus = d => CFG.pts.daily + Math.min(d - 1, CFG.pts.streakMax) * CFG.pts.streakStep;
  const done = S.streak.last === ymd(), d = done ? S.streak.days + 1 : S.streak.last === yesterday() ? S.streak.days + 1 : 1;
  const out = [done ? `名所にチェックインすると 連続${d}日目のボーナス +${bonus(d)}pt` : `きょう名所にチェックインすると 連続${d}日目のボーナス +${bonus(d)}pt。あしたも続けると +${bonus(d + 1)}pt`, '新しい「今日のクエスト」3つ（達成でポイント）', '新しい たからばこ（日によって置き場所が変わる）'];
  if (demo) out.push('閉じている間も るすばん でさんぽ（おかえりのポイントとドット絵）');
  return out;
}
function renderTomorrow() {
  const el = $('tomorrowBox');
  if (!el) return;
  el.hidden = !store.get('nsg_started', false);
  el.innerHTML = `<b>📅 あしたのおたのしみ</b><ul>${tomorrowItems().map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
}
// ホーム画面に追加（Android の Chrome などは追加の画面を出せる。iPhone の Safari は手順を出す）
let a2hsEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); a2hsEvt = e; });
window.addEventListener('appinstalled', () => { track('a2hs_installed', {}); store.set('nsg_a2hs_done', true); $('a2hs').hidden = true; });
function standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function a2hsOffer() {
  if (standalone() || store.get('nsg_a2hs_done', false) || Date.now() - store.get('nsg_a2hs_t', 0) < 7 * 86400000) return;
  if (!a2hsEvt && !isIOS()) return;   // 追加の画面を出せず、手順も案内できない端末では出さない
  store.set('nsg_a2hs_t', Date.now());
  $('a2hsText').textContent = a2hsEvt ? '📲 ホーム画面に追加すると、あしたもワンタップで遊べます'
    : '📲 ホーム画面に追加すると、あしたもワンタップで遊べます。Safari の下の 共有ボタン（□↑）→「ホーム画面に追加」';
  $('a2hsAdd').hidden = !a2hsEvt;
  $('a2hs').hidden = false;
  track('a2hs_shown', { how: a2hsEvt ? 'prompt' : 'ios' });
}
$('a2hsAdd').addEventListener('click', async () => {
  $('a2hs').hidden = true;
  if (!a2hsEvt) return;
  a2hsEvt.prompt();
  const r = await a2hsEvt.userChoice.catch(() => null);
  track('a2hs_click', { outcome: (r && r.outcome) || 'unknown' });
  a2hsEvt = null;
});
$('a2hsNo').addEventListener('click', () => { $('a2hs').hidden = true; track('a2hs_later', {}); });
if (/[?&]src=a2hs\b/.test(location.search)) track('a2hs_open', {});
// 1回に遊んだ時間と、その間にふえたポイント（画面を離れたときに送る）
function sessionEnd() {
  if (!store.get('nsg_started', false) || !session.on) return;
  const secs = Math.round((Date.now() - session.start) / 1000);
  if (secs >= 5) track('session_end', { secs, pts: session.gained, rewards: session.rewards, day_n: dayN(), mode: demo ? 'play' : 'walk', transport_type: 'beacon' });
  session.on = false;
}
function sessionStart() { Object.assign(session, { start: Date.now(), on: true, gained: 0, rewards: 0 }); }
document.addEventListener('visibilitychange', () => { if (document.hidden) sessionEnd(); else sessionStart(); });
window.addEventListener('pagehide', sessionEnd);

/* はじめに */
function begin(isDemo) {
  if (!store.get('nsg_started', false)) store.set('nsg_begin_t', Date.now());
  if (!store.get('nsg_first_day', '')) store.set('nsg_first_day', ymd());
  store.set('nsg_started', true);
  sessionStart();
  track('game_start', { mode: isDemo ? 'play' : 'walk' });
  $('intro').hidden = true;
  // 操作して遊ぶは、スティックで歩けるドット絵の地図で始める（ふつうの地図にしていた人も）
  if (isDemo && !document.body.classList.contains('px') && window.nishioPixel) nishioPixel.setActive(true);
  setMode(isDemo);
  // はじめての人は、せかいちずではなく歩く地図から（すぐ近くの ようこそ たからばこ と主人公が見えて、おまかせ歩きも動く）
  if (isDemo && welcomeDue() && window.nishioPixel && nishioPixel.worldMode) nishioPixel.setWorld(false);
  if (isDemo) toast(document.body.classList.contains('px')
    ? (welcomeDue() ? '🎁 すぐ近くに たからばこ！ 左下のスティック（矢印キー）で近づくと開きます' : '🎮 左下のスティック（矢印キー）で歩きます')
    : '🎮 地図をタップするとその場所へ移動します');
}
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('[data-sponsor],[data-camp]');
  if (a) track(a.dataset.sponsor ? 'sponsor_link' : 'campaign_link', { id: a.dataset.sponsor || a.dataset.camp });
});
$('startBtn').addEventListener('click', () => begin(false));
$('demoBtn').addEventListener('click', () => begin(true));

/* 起動 */
renderHeader();
loadSpots(false);
loadAreas();
if (ED.shops) { loadRewards(); loadCampaigns(); }
// 累計プレイ人数（nishio-go/stats.json：Google アナリティクスから毎日数える）。100人をこえたら、はじめの画面に出す
fetch('nishio-go/stats.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).then(j => {
  if (!j || !(j.players >= 100) || !$('playerCount')) return;
  $('playerCount').textContent = `👥 これまでに ${Math.floor(j.players / 10) * 10}人以上が遊んでいます（${j.updated.slice(5).replace('-', '/')}時点）`;
  $('playerCount').hidden = false;
}).catch(() => { /* なしで続ける */ });
if (store.get('nsg_started', false)) {
  // この計測より前から遊んでいる人：はじめて遊んだ日・はじめてのごほうびは「わからない」にしておく（数字にまぜない）
  if (!store.get('nsg_first_day', '')) store.set('nsg_first_day', 'unknown');
  if (!store.get('nsg_begin_t', 0)) store.set('nsg_first_reward', true);
  $('intro').hidden = true; setMode(demo); sessionStart();
}
else track('intro_view', {});   // はじめての人は、遊びかたを選んだとき（begin）から1回に遊んだ時間を数える
setInterval(() => { renderMarkers(); refreshNearby(); }, 10000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderMarkers(); refreshNearby(); idleCheck(); } else idleMark(); });
window.addEventListener('pagehide', idleMark);
// 開いている間は るすばん にならない。端末がスリープしていたなどで しばらくタイマーが止まっていたときは、先に おかえり を渡す
setInterval(() => { if (!document.hidden && demo) { if (Date.now() - idleOf().last < 5 * 60000) idleMark(); else idleCheck(); } }, 60000);
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-up]'); if (b) buyUp(b.dataset.up); });

// ドット絵表示（pixel.js）とテストから使う窓口
window.nishioGo = {
  sound,
  get state() { return S; }, get spotsVersion() { return spotsVersion; }, get spots() { return spots; }, get me() { return me; }, get demo() { return demo; },
  get areas() { return areas; }, areaProgress,
  get selected() { return selected; }, CFG, REGION, playBounds, cityAt, cityNear, placeAt, setPlace, inPlay,
  // share.js（シェア・広告からの来訪）から使う
  begin, track, utmUrl,
  playMode() {   // 広告のリンク（?play=1）：もう始めている人も「操作して遊ぶ」に切り替える（はじめて遊んだ数には入れない）
    if (!document.body.classList.contains('px') && window.nishioPixel) nishioPixel.setActive(true);
    if (!demo) setMode(true);
  }, get campaigns() { return campaigns; }, liveCampaigns, renderCampaigns,
  stats() {
    const lv = levelOf(S.total);
    return { lv, title: titleOf(lv), points: S.points, total: S.total, places: Object.values(S.visits).filter(v => v.featured).length, spots: Object.keys(S.visits).length,
      met: (S.met || []).length, memos: knownFacts(), badges: (S.badges || []).length, demo };
  },
  focusSpot(id) {   // 広告やQRのリンク（?spot=）で、そのスポットを見せる
    const s = spots.find(x => x.id === 'f-' + id || x.id === id);
    if (!s) return false;
    if (demo) { follow = false; onFix(s.lat, s.lng, 5, Date.now()); if (window.nishioPixel) nishioPixel.centerOnMe(); }   // せかいちずを開いていれば、カメラもそこへ
    else { follow = false; map.setView([s.lat, s.lng], 17); }
    toast(`📍 ${s.name}${me && !demo ? `（ここから ${fmtM(dist(me, s))}）` : ''}`);
    return true;
  },
  dist, cooldownLeft, inReach, reachOf, guideRadius, checkin, popupHtml, toast, ymd, refreshNearby, get npcs() { return placeNpcs(); }, talkNpc, npcMet, chestOpened: id => dayState().chests.includes(id), liveChests, get welcomeChest() { return welcomeDue(); },
  moveTo(lat, lng) { if (!demo) return; follow = false; onFix(lat, lng, 5, Date.now()); },
  get driving() { return driving; },
  get guide() { return guideTarget(); }, decideGuide, setGuide,
  autoInterval, autoLearn, idleCheck, buyUp, IDLE,
  setDriving(on) { driving = !!on && demo; if (!driving) tryChest(); refreshNearby(); },
  invalidateMap() { setTimeout(() => { map.invalidateSize(); if (me) map.setView([me.lat, me.lng]); }, 0); },
  onModeChange(fn) { modeListeners.push(fn); },
};
})();
