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
  trailUnit: 50,            // はじめて歩いた道（あしあと）が50マス（約400m）ふえるごとに
  trailPts: 5,              //   5pt
  trailDailyCap: 50,        // はじめての道のポイントは1日50ptまで（約4km）
  walkMaxAcc: 35,           // 歩数計測に使うGPS精度の上限（m）
  walkMaxSpeed: 4.5,        // m/s（約16km/h：ジョギングまで）
  walkMaxGapSec: 180,       // 位置の更新がこれ以上途切れたら、その間の移動は数えない
  vehicleSpeed: 8.5,        // m/s（約30km/h：これを超えたら乗り物とみなす）
  vehicleLockMs: 120000,    // 乗り物判定のあと、歩いた距離を数えない時間（チェックイン・たからばこは乗り物でもできる）
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
// 文字を少なく（ふだん）：文字のかわりにドット絵（icons.js）。せってい の「文字を多めに出す」で切り替え
const simple = () => document.body.classList.contains('simple');
const PI = (n, alt = '') => (window.NSG_ICONS ? NSG_ICONS.html(n, alt) : '');
const ART32 = (n, alt = '') => `<img class="pi art" src="nishio-go/art/${n}.png" alt="${esc(alt)}" width="32" height="32"/>`;   // Blender で作った 32×32 の絵（tools/blender/pixel-art.py）
const ICON_ART = { bag: 'omiyage', chest: 'stat-chest', card: 'card', book: 'stat-book', fire: 'stat-fire', home: 'home', star: 'stat-star', bowl: 'bar-bowl', scroll: 'quest', flag: 'stat-flag',
  coin: 'stat-coin', pin: 'stat-pin', feet: 'stat-feet', medal: 'stat-medal', calendar: 'calendar', talk: 'talk', clock: 'clock',
  car: 'btn-car', walker: 'btn-walker', gift: 'tab-gift', new: 'new', jump: 'ricebag' };   // 32×32 の絵があるアイコン
const PIA = (ic, alt = '') => ICON_ART[ic] ? ART32(ICON_ART[ic], alt) : PI(ic, alt);   // 札（chips）など、32px で出せるところ用
const OSM_KEY = 'nsg_osm_v1';

function freshState() {
  return { v: 1, points: 0, total: 0, checkins: 0, walked: 0, walkCarry: 0, walkDay: { date: '', pts: 0 },
    visits: {}, log: [], streak: { last: '', days: 0, max: 0 }, badges: [], coupons: [], day: null, facts: [], met: [],
    guide: null, guides: 0, guideDone: [], idle: { last: 0, lv: {} }, dots: [], kira: [], bags: [] };
}
let demo = store.get('nsg_mode', 'real') === 'demo';
// 記録は版ごとに分ける（西尾市版は nsg_state_city など。お店の版で行った当店の記録や、当店への行き先を持ちこまない）
const stateKey = () => (demo ? 'nsg_state_demo' : 'nsg_state') + (ED.shops ? '' : '_' + ED.id);
function loadState() {
  const s = store.get(stateKey(), null);
  return s && s.v === 1 ? Object.assign(freshState(), s) : freshState();
}
let S = loadState();
let stepMove = false;   // いまの移動が、歩く地図の1歩か（pixel.js の moveTo(…, 'step')）
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
      hours: c.hours && /^\d{1,2}:\d\d$/.test(c.hours.open) && /^\d{1,2}:\d\d$/.test(c.hours.close) ? { open: c.hours.open, close: c.hours.close, closed: (c.hours.closed || []).filter(w => w >= 0 && w <= 6) } : null,
      tel: typeof c.tel === 'string' && /^[\d-]+$/.test(c.tel) ? c.tel : '',
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
// その位置の地区：いちばん近い注目スポットの地区（ふつうのスポットには area がない）
function areaNear(p) {
  let best = null, bd = Infinity;
  for (const x of spots) if (x.featured && x.area) { const d = dist(p, x); if (d < bd) { bd = d; best = x; } }
  return best ? best.area : '';
}
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
// 文字を少なく（ふだん）：スポットの種類も Blender の 32×32 の絵で（注目スポットは星）
const catArt = s => ART32(s.featured ? 'stat-star' : 'cat-' + (CATS[s.cat] && s.cat !== 'featured' ? s.cat : 'sight'), s.featured ? '注目スポット' : (CATS[s.cat] || CATS.sight).n);
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
  return L.divIcon({ className: '', html: `<div class="${cls}"${sign}>${simple() && !s.shop && !s.featured ? catArt(s) : iconOf(s)}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

// 当店の「お店のなか」の絵（運営者が撮った写真から Blender で作った お米の売り場。tools/blender/giant-shop.py）
const shopInside = s => s.id === 'f-ricepia' ? '<figure class="shop-pic"><img src="nishio-go/art/giant/ricepia-uriba.png" alt="らいすぴあのお米の売り場（ドット絵）" width="192" height="192" loading="lazy"/><figcaption>お店のなか：銘柄ごとの お米がならぶ売り場</figcaption></figure>' : '';
// 名所の窓の「📽️ ムービー」：その名所のムービーを見たことがあるか、いま その名所にいるとき
function movieBtn(s, pic) {
  const m = movieOf(s);
  if (!m || s.shop || !((S.movies || []).includes(m.id) || inReach(s))) return '';
  return `<button type="button" class="btn mini" data-movie="${esc(m.id)}" aria-label="ドット絵ムービー「${esc(m.title)}」">📽️ ${pic ? 'ムービー' : esc(m.title)}</button>`;
}
function popupHtml(s) {
  const c = s.featured ? null : (CATS[s.cat] || CATS.sight);
  const v = S.visits[s.id];
  const left = cooldownLeft(s);
  const d = me ? fmtM(dist(me, s)) : '—';
  if (simple()) return popupPic(s, c, v, left, d);
  return `<div class="popup"><h4>${esc(s.name)}</h4>
    <p>${s.shop ? `<span class="tag shop">🍚 当店（${esc(s.name)}）</span>` : s.featured ? '<span class="tag gold">⭐ 注目スポット</span>' : `<span class="tag">${c.i} ${c.n}</span>`}
    <span class="tag">${ptsOf(s)}pt</span></p>
    ${s.desc ? `<p>${esc(s.desc)}</p>` : ''}
    ${s.sponsor ? `<p class="sponsor"><span class="tag">🤝 協賛</span> <b>${esc(s.sponsor.name)}</b>${s.sponsor.text ? `：${esc(s.sponsor.text)}` : ''}${s.sponsor.url ? `<br><a class="btn mini" href="${esc(utmUrl(s.sponsor.url, 'sponsor'))}" target="_blank" rel="noopener" data-sponsor="${esc(s.id)}">${esc(s.sponsor.name)}のサイト</a>` : ''}</p>` : ''}
    ${spotEvents(s).map(x => `<p class="ev">📅 ${esc(x.when)}　${esc(x.e.name)}</p>`).join('')}
    ${spotMeibutsu(s).map(m => `<p class="mb">${m.icon} <b>${esc(m.name)}</b>：${esc(m.note)}</p>`).join('')}
    ${reactLine(s)}
    <p>現在地から ${d}${s.approx ? '（位置は概算・広めに判定）' : ''}</p>
    <p>${v ? `訪問 ${v.n}回・最後 ${fmtTime(v.last)}` : 'まだ行ったことがありません'}</p>
    ${left ? `<p>再チェックインまで あと${Math.ceil(left / 60000)}分</p>` : ''}
    ${shopInside(s)}
    ${s.shop ? shopInfoHtml(s) : ''}
    ${s.shop ? `<p class="shop-links">${s.url ? `<a class="btn mini" href="${esc(s.url)}" target="_blank" rel="noopener">お店のサイト</a>` : ''}
      <a class="btn mini" href="https://www.google.com/maps/dir/?api=1&amp;destination=${s.lat},${s.lng}" target="_blank" rel="noopener">道案内（Googleマップ）</a></p>` : ''}
    ${jumpHere(s) ? '<button type="button" class="btn mini" data-jump-open>🎮 ミニゲーム「にしおジャンプ」</button>' : ''}
    ${canSearch(s) ? `<button type="button" class="btn mini" data-search="${esc(s.id)}">🔍 しらべる（${esc(S.heard[s.id].by)}の手がかり）</button>` : ''}
    ${movieBtn(s, false)}
    ${demo ? `<button type="button" class="btn mini" data-move="${esc(s.id)}">ここへ移動（操作モード）</button>` : ''}
    <button type="button" class="btn mini" data-share-spot="${esc(s.id)}">📣 この名所をシェア</button>
    <button type="button" class="btn mini voice-btn" data-voice-spot="${esc(s.id)}">📮 この名所のことを教える</button></div>`;
}

// 文字を少なく（ふだん）：名所の大きなドット絵と、絵の札（種類・ポイント・きょり・行った回数）。説明の文・行事はそのまま、名物は名前（タップで説明）
function popupPic(s, c, v, left, d) {
  const th = spotThumb(s).replace('class="gthumb"', 'class="pop-art"').replace(/width="28" height="28"/, 'width="64" height="64"');
  return `<div class="popup pic"><div class="pop-head">${th}<h4>${esc(s.name)}</h4></div>
    <p class="chips">${s.shop ? `<span>${PIA('bowl', '当店')}</span>` : s.featured ? `<span>${PIA('star', '注目スポット')}</span>` : `<span title="${esc(c.n)}">${catArt(s)}</span>`}<span>${PIA('coin', 'ポイント')}${ptsOf(s)}</span>
      <span${s.approx ? ' title="位置は概算・広めに判定"' : ''}>${PIA('pin', s.approx ? '現在地から（位置は概算・広めに判定）' : '現在地から')}${s.approx ? '≈' : ''}${d}</span><span>${v ? `${PIA('flag', '行った回数')}×${v.n}` : PI('new', 'まだ行ったことがない')}</span>${left ? `<span>${PIA('clock', '再チェックインまで')}${Math.ceil(left / 60000)}分</span>` : ''}</p>
    ${s.desc ? `<p>${esc(s.desc)}</p>` : ''}
    ${reactLine(s)}
    ${s.sponsor ? `<p class="sponsor"><span class="tag">🤝 協賛</span> <b>${esc(s.sponsor.name)}</b>${s.sponsor.text ? `：${esc(s.sponsor.text)}` : ''}${s.sponsor.url ? `<br><a class="btn mini" href="${esc(utmUrl(s.sponsor.url, 'sponsor'))}" target="_blank" rel="noopener" data-sponsor="${esc(s.id)}">${esc(s.sponsor.name)}のサイト</a>` : ''}</p>` : ''}
    ${spotEvents(s).map(x => `<p class="ev">${PIA('calendar', '行事')} ${esc(x.when)}　${esc(x.e.name)}</p>`).join('')}
    ${spotMeibutsu(s).map(m => `<details class="mb"><summary>${m.icon} <b>${esc(m.name)}</b></summary>${esc(m.note)}</details>`).join('')}
    ${shopInside(s)}
    ${s.shop ? shopInfoHtml(s) : ''}
    ${s.shop ? `<p class="shop-links">${s.url ? `<a class="btn mini" href="${esc(s.url)}" target="_blank" rel="noopener">お店のサイト</a>` : ''}
      <a class="btn mini" href="https://www.google.com/maps/dir/?api=1&amp;destination=${s.lat},${s.lng}" target="_blank" rel="noopener">道案内（Googleマップ）</a></p>` : ''}
    ${jumpHere(s) ? `<button type="button" class="btn mini" data-jump-open>${PIA('jump', '')} ミニゲーム</button>` : ''}
    ${canSearch(s) ? `<button type="button" class="btn mini" data-search="${esc(s.id)}" aria-label="しらべる（${esc(S.heard[s.id].by)}の手がかり）">🔍 しらべる</button>` : ''}
    ${movieBtn(s, true)}
    ${demo ? `<button type="button" class="btn mini" data-move="${esc(s.id)}">${PIA('feet', '')} ここへ</button>` : ''}
    <button type="button" class="btn mini" data-share-spot="${esc(s.id)}" aria-label="この名所をシェア">📣 シェア</button>
    <button type="button" class="btn mini voice-btn" data-voice-spot="${esc(s.id)}" aria-label="この名所のことを教える">${PIA('talk', '')} 教える</button></div>`;
}

function renderMarkers() {
  const b = map.getBounds().pad(0.25);
  const zoomOk = map.getZoom() >= 14;
  for (const s of spots) {
    const show = b.contains([s.lat, s.lng]) && (zoomOk || s.featured);
    let m = markers.get(s.id);
    if (show) {
      const cls = spotState(s), key = cls + (simple() ? ' simple' : '');   // 「文字を多めに出す」を切りかえたら、印の絵も描きなおす
      if (!m) {
        m = L.marker([s.lat, s.lng], { icon: makeIcon(s, cls), zIndexOffset: s.featured ? 500 : 0, keyboard: false })
          .bindPopup(() => popupHtml(s), { closeButton: true, autoPanPaddingBottomRight: [10, 140] })
          .addTo(map);
        m._cls = key;
        markers.set(s.id, m);
      } else if (m._cls !== key) {
        m.setIcon(makeIcon(s, cls)); m._cls = key;
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
// npcJust：いまの会話で起きたこと（しるしを渡した など）の、その人のことば。話のページに入れる（ふだんの表示では、知らせは絵だけになるので）。次に話しかけたら消す
const npcJust = new Map();
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
  if (npcJust.has(n.id)) pages.splice(1, 0, npcJust.get(n.id));   // あいさつのページの次に
  if (S.guide && S.guide.byId === n.id) pages.push(`🧭 ${S.guide.why}`);   // この人がすすめた次の行き先
  const hid = Object.keys(S.heard || {}).filter(id => S.heard[id].byId === n.id && !S.heard[id].found).sort((a, b) => S.heard[b].t - S.heard[a].t)[0];   // いちばん新しく すすめた名所
  const hs = hid && spots.find(x => x.id === hid);
  if (hs) pages.push(`🔍 ${hintSay(n, hs.name)}`);   // この人がくれた、しらべるの手がかり（まだ しらべていないあいだ）
  if (S.parcel && S.parcel.from === n.id) pages.push(`📦 ${S.parcel.toName}に、その${S.parcel.item}を よろしくね。`);   // あずけた おとどけもの（届けるまで）
  if (n.id === SEAL_BY.nishio) pages.push(guideRecord());   // 西尾城跡のガイドさんは、会うたびに ここまでの記録と「あと いくつ」を教えてくれる
  else { const sp = sealPage(n); if (sp) pages.push(sp); }   // ほかの地区の しるしをくれる人は、その地区の「あと いくつ」
  return pages;
}
// しるしをくれる人（西尾城跡のガイドさん のほか）：まだ しるしを わたしていない人は、その地区を「あと何か所」めぐれば わたすかを話す。
// クリア後の となりの市町のしるしは、殿堂入りのあとだけ
function sealPage(n) {
  const id = Object.keys(SEAL_BY).find(k => SEAL_BY[k] === n.id), a = id && areas.find(x => x.id === id);
  if (!a || (S.seals || []).includes(id) || (SEAL_POST.has(id) && !S.cleared)) return '';
  const p = areaProgress(id), goal = sealGoal(id), left = Math.max(0, goal - p.done);
  if (!p.total || !left) return '';
  return `🔖 ${a.name}の注目スポットを あと${left}か所 めぐったら、${a.name}のしるしを わたすでね（いま ${Math.min(p.done, goal)}/${goal}）。`;
}
// ガイドさんの記録（昔のドット絵RPGの、城の王様に話すと「次のレベルまで あと○」と記録してくれる しくみ）：
// 次のレベルまでの ポイントと、しるしの数・いちばん近い しるしまでの あと何か所。戻ってくるたびに「あと少し」が分かる
function guideRecord() {
  const lv = levelOf(S.total), need = needFor(lv + 1) - S.total;
  const ids = S.cleared ? SEAL_POST : SEAL_MAIN, own = (S.seals || []), got = [...ids].filter(id => own.includes(id)).length;
  const near = [...ids].filter(id => !own.includes(id)).map(id => ({ id, a: areas.find(x => x.id === id), p: areaProgress(id), goal: sealGoal(id) }))
    .filter(x => x.a && x.p.total > 0).map(x => ({ ...x, left: Math.max(0, x.goal - x.p.done) })).sort((a, b) => a.left - b.left)[0];
  const seal = got >= [...ids].length ? (S.cleared ? 'となりの市町のしるしも ぜんぶ そろったね。' : '5つのしるしが そろっとるよ。わしに話しかけてくれりゃあ 殿堂入りだに。')
    : `しるしは ${got}/${[...ids].length}。${near ? (near.left ? `いちばん近いのは ${near.a.name}のしるしで、あと${near.left}か所めぐると もらえるよ。` : `${near.a.name}のしるしは もう もらえるで、${sealBy(near.id) ? sealBy(near.id).name : '地区の人'}に会いに行きりん。`) : ''}`;
  const day = dayState(), h = day.h100, left = [h && h.done ? '' : store.get('nsg_first_day', '') === ymd() ? '' : '100歩たんけん', (day.alleys || 0) < ALLEY.daily ? `路地の行き止まり あと${ALLEY.daily - (day.alleys || 0)}か所` : '', (day.watch || 0) < WATCH_DAILY ? '水べで じっと見る' : ''].filter(Boolean);
  return `📒 記録しといたよ。つぎの レベル${lv + 1}まで あと${need}pt。${seal}${left.length ? `きょうは まだ ${left.join('・')}が のこっとるに。` : 'きょうの お楽しみは ぜんぶ すんだね。'}`;   // 毎日の しくみの のこり
}
// 人の立つ所。ドット絵の地図では、決めた位置が建物や水のとき近くの歩けるマスへずらして描くので、そのマスの中心にする
function npcSpot(n) {
  const P = window.nishioPixel;
  if (!P || !document.body.classList.contains('px')) return n;
  const t = P.npcTile(n);
  return t.ok ? P.toLatLng(t.x + 0.5, t.y + 0.5) : n;
}
// 人の顔：Blender で作った胸から上の絵（tools/blender/pixel-art.py）。ない見た目はドット絵の地図と同じ絵、読み込めないときは絵文字
const faceCache = {}, NPC_ART = new Set(['elder', 'granny', 'man', 'woman', 'kid', 'student', 'fisher', 'staff', 'guide', 'monk']);
function npcFace(n) {
  if (NPC_ART.has(n.look)) return `<img class="npc-face art" src="nishio-go/art/npc-${n.look}.png" alt="" width="48" height="48"/>`;
  const P = window.nishioPixel;
  if (!(n.look in faceCache) && P && P.npcSprite) { try { faceCache[n.look] = P.npcSprite(n.look).toDataURL(); } catch (e) { faceCache[n.look] = ''; } }
  return faceCache[n.look] ? `<img class="npc-face" src="${faceCache[n.look]}" alt="" width="48" height="48"/>` : `<span class="npc-face">${NPC_LOOK[n.look] || '🙂'}</span>`;
}
// 話しかける（近くにいれば話す。はじめてなら +10pt）。戻り値：{ html, near }
// calledBy：歩く地図で呼びとめて、そばまで歩いてきた人（pixel.js の呼びとめ）。その人とは、もとの場所から遠くても話せる
let calledBy = null;
function talkNpc(id, page = 0) {
  const n = placeNpcs().find(x => x.id === id);
  if (!n) return null;
  const d = calledBy === id ? 0 : me ? dist(me, npcSpot(n)) : Infinity, lim = demo ? NPC_TALK_M.play : NPC_TALK_M.walk;
  const pic = simple();   // 文字を少なく（ふだん）：顔のドット絵と名札、遠いときは絵ときょり
  const head = pic ? `<div class="popup npc pic"><div class="npc-head">${npcFace(n)}<h4 class="plate">${esc(n.name)}</h4></div>`
    : `<div class="popup npc"><h4>${NPC_LOOK[n.look] || '🙂'} ${esc(n.name)}</h4><p class="npc-at">${esc(n.spotName)}のそば</p>`;
  if (driving) return { near: false, html: pic ? `${head}<p class="npc-say chips"><span>${PIA('car', '車に乗ったままでは話せない')}</span><span>→</span><span>${PIA('walker', '車を降りて話しかけよう')}</span></p></div>`
    : `${head}<p class="npc-say">（車に乗ったままでは話せない。車を降りて話しかけてみよう）</p></div>` };
  if (d > lim) {
    if (pic) return { near: false, html: `${head}<p class="npc-say chips"><span>${PIA('talk', '遠くて声が届かない。近づいて話しかけよう')}</span>${Number.isFinite(d) ? `<span>${PIA('feet', 'あと')}${fmtM(d - lim)}</span>` : ''}</p>
      ${demo ? `<button type="button" class="btn mini" data-move-npc="${esc(n.id)}">${PIA('feet', '')} 近くへ</button>` : ''}</div>` };
    return { near: false, html: `${head}<p class="npc-say">（遠くて声が届かない。近づいて話しかけてみよう${Number.isFinite(d) ? `：あと${fmtM(d - lim)}` : ''}）</p>
      ${demo ? `<button type="button" class="btn mini" data-move-npc="${esc(n.id)}">近くへ移動（操作モード）</button>` : ''}</div>` };
  }
  const say = [];   // 知らせ（はじめて話した・イベント達成・イベント）はまとめて1つに
  // 文字を少なく（ふだん）：ポイントは合わせて1つ、あずかった荷物・手がかりは 📦🔍 の印だけ（1行か2行に）
  const brief = { icons: '', marks: '', next: '', t0: S.total, lv0: levelOf(S.total) };
  if (page === 0 && !npcMet(n.id)) {
    S.met = [...(S.met || []), n.id];
    S.log.unshift({ type: 'npc', t: Date.now(), pts: 10, name: `${n.name}と話した`, icon: NPC_LOOK[n.look] || '💬' });
    const lvUp = gainPoints(10);
    save();
    sound.jingle(lvUp ? 'levelup' : 'checkin');
    brief.icons += '💬'; say.push(`💬 はじめて話した：${n.name} +10pt${lvUp ? `　🎉 Lv${lvUp}` : ''}`);
    track('npc_talk', { npc: n.id, mode: demo ? 'play' : 'walk' });
    setTimeout(checkBadges, 800);
  }
  // 話しかけると、この人の話で次の行き先が決まる（同じ人と話し続けている間は変えない）
  // GPS の精度が悪いあいだは、話はできても行き先は変えない（精度が上がってから話しかければ、着いたことになる）
  if (page === 0 && S.parcel && S.parcel.to === n.id) { brief.icons += '📦'; say.push(deliverParcel(n)); }   // あずかった おとどけものを届けた
  if (page === 0) npcJust.delete(n.id);
  const seal = page === 0 ? sealGive(n) : '';   // 地区のしるし（その地区を5か所めぐってから、この人と話した）
  if (seal) { brief.icons += '🔖'; say.push(seal); const w = seal.match(/「(.*)」/); if (w) npcJust.set(n.id, `🔖 ${w[1]}`); }
  if (page === 0 && clearGive(n)) { brief.icons += '🏯'; say.push('🏯 西尾さんぽ 殿堂入り！'); }   // 5つのしるしを そろえて、この人と話した（クリア）
  if (page === 0 && fixOk() && !(S.guide && S.guide.byId === n.id)) {
    const arrived = S.guide && S.guide.kind === 'npc' && S.guide.id === n.id ? S.guide : null;
    if (arrived) {   // すすめられた人に会えた
      const pts = guideReward(S.guide);
      brief.icons += '🎉';
      say.push(`🎉 ${S.guide.byId ? 'イベント達成：' : ''}${n.name}に会えた${pts ? ` +${pts}pt` : ''}`);
      const ml = [], mb = mazeGoal(n.id, n.name, ml);   // 地図の めいろの ゴールが この人だった：名所と 同じ ように 時間・★と 紙ふぶき
      if (ml.length) { if (mb) gainPoints(mb); brief.icons += '🏁'; say.unshift(...ml); }
    }
    // 人の話で行き先が決まったら、イベント（みちしるべが案内し、おまかせ歩きならそこへ向かう）
    // 地図の めいろで ゴールへ 向かう とちゅうに、ゴールでない 人と 話しても、ゴールは かえない（自分で 遊んで 分かった：通りすがりに こつんと
    // 話すと ゴールが 別の 人に かわり、時計も 0 から やりなおしに なっていた）。ゴールに 着いてから 話せば、その人の 話で 次が 決まる
    const mzKeep = !arrived && guideTarget() && mazeNow();
    const g = mzKeep ? null : decideGuide(n);
    if (g) {
      setGuide({ ...g, byId: n.id }); track('guide_set', { by: n.id, kind: g.kind }); say.push(`📜 イベント発生：${g.name}へ行ってみて`); brief.next = g.name;
      const hid = heardOf(g, n), hs = hid && spots.find(x => x.id === hid);
      if (hs) { brief.marks += '🔍'; say.push(`🔍 「${hintSay(n, hs.name)}」`); }
      const pc = g.kind === 'npc' && giveParcel(n, g.id);
      if (pc) { brief.marks += '📦'; say.push(`📦 「${pc.toName}に、この${pc.item}を届けてくれん？」`); }
    }
    else if (arrived) setGuide(null);   // 着いた行き先は、次がなくても消す（話しかけ直しでくり返し着かないように）
    if (arrived) rivalSay({ ...arrived, name: n.spotName }, g);
  }
  if (say.length && simple()) {
    const got = S.total - brief.t0, lv = levelOf(S.total) > brief.lv0 ? levelOf(S.total) : 0;
    toast([brief.icons && `${brief.icons}${got ? ` +${got}pt` : ''}${lv ? ` Lv${lv}` : ''}`, brief.next && `📜 → ${brief.next}${brief.marks ? ` ${brief.marks}` : ''}`].filter(Boolean).join('　'));
  } else if (say.length) toast(say.join('　'));
  const pages = npcPages(n), i = Math.min(page, pages.length - 1);
  if (pic) {
    const dots = `<span class="pg">${pages.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</span>`;
    return { near: true, html: `${head}<p class="npc-say">「${esc(pages[i])}」</p>
    ${i < pages.length - 1 ? `<button type="button" class="btn mini npc-next" data-npc="${esc(n.id)}" data-page="${i + 1}" aria-label="つぎへ（${i + 1}/${pages.length}）">${dots} ▼</button>` : `<p class="npc-end">${dots}<span class="vh">（${pages.length}/${pages.length}）おわり</span></p>`}</div>` };
  }
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
let lastWalk = null, vehicleUntil = 0, watchId = null, gpsError = '', gpsSlow = false;
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
  gpsError = ''; gpsSlow = false;
  waitDone();
  placeMe();
  if (!$('panel-settings').hidden) renderGpsInfo();
  trackWalk(p);
  renderMarkers();
  refreshNearby();
  tryChest();
  welcomeWalk();
  farNotice();
}
// 遠いほど めずらしい（昔のドット絵RPGの「城から遠いほど 強い敵・よい宝」）：西尾城跡のあたり（CFG.center）から 4km で 1.5倍・8km で 2倍
// （一色・吉良・幡豆・佐久島まで足をのばすと 出やすい）。キラの時間とは かけあわせる
const KIRA_FAR = [[8000, 2], [4000, 1.5]];
const kiraFar = () => { if (!me) return 1; const d = dist(me, { lat: CFG.center[0], lng: CFG.center[1] }); return (KIRA_FAR.find(([m]) => d >= m) || [0, 1])[1]; };
// 遠いほど めずらしい：西尾城跡から 4km・8km の さかいを こえたら、その日 1回ずつ知らせる（ここから先は キラが出やすい）
function farNotice() {
  if (!me || !store.get('nsg_started', false) || (!demo && me.acc > CFG.maxAccuracy)) return;
  const far = kiraFar(), day = dayState();
  if (far <= (day.farTold || 1)) return;
  day.farTold = far; save();
  const km = (KIRA_FAR.find(([, f]) => f === far) || [0])[0] / 1000;
  toastAfter(`✨ 西尾城跡から ${km}km こえた！ ここから先は キラの絵が ${far}倍 出やすい`);
  track('kira_far', { far });
}

// 位置を待つ間の まちメモ（ブロックくずしの「読みこみを待つ間も遊べて、できたら『READY』と小さく知らせる。遊んでいる手は止めない」から）：
// あるいて移動で 位置が届くまで（時間がかかっているときも）、下のパネルに 知っている まちメモの おさらいを 7秒ごとに出す（3つより少なければ 地区の豆知識も）。
// 位置が届いたら、4秒以上 待たせたときだけ「📍 いまの場所が わかった」と知らせる（はじめから すぐ届いたときは出さない）
const waitS = { i: -1, timer: null, since: 0 };
function waitLine() {
  if (demo || me || (gpsError && !gpsSlow)) { if (waitS.timer) { clearInterval(waitS.timer); waitS.timer = null; } return ''; }   // 位置情報が使えないときは、待っても届かない
  if (!waitS.since) waitS.since = Date.now();
  if (!waitS.timer) waitS.timer = setInterval(() => { if (me || demo) { clearInterval(waitS.timer); waitS.timer = null; return; } waitS.i++; refreshNearby(); }, 7000);
  const pool = factPool(), known = (S.facts || []).filter(k => pool.has(k)), keys = known.length >= 3 ? known : [...known, ...[...pool.keys()].filter(k => /^a:.*:t$/.test(k))];
  if (!keys.length) return '';
  if (waitS.i < 0) waitS.i = Math.floor(Math.random() * keys.length);
  const k = keys[waitS.i % keys.length], t = pool.get(k);
  return `<small class="wait-fact">${known.includes(k) ? '📖 まちメモの おさらい' : '📖 まめちしき'}：${esc(t.length > 80 ? t.slice(0, 79) + '…' : t)}</small>`;
}
function waitDone() {
  if (waitS.timer) { clearInterval(waitS.timer); waitS.timer = null; }
  if (waitS.since && !demo && Date.now() - waitS.since >= 4000) toastAfter('📍 いまの場所が わかった！ さんぽを はじめよう');
  waitS.since = 0;
}

function startGps() {
  if (!('geolocation' in navigator)) { gpsError = 'この端末・ブラウザは位置情報に対応していません。'; refreshNearby(); return; }
  stopGps();
  setStatus('位置情報を取得しています…（屋外の方が早く取れます）');
  watchId = navigator.geolocation.watchPosition(
    pos => { if (!demo) onFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.timestamp || Date.now()); },
    err => {
      if (!gpsError) track('geo_error', { code: err.code });
      gpsSlow = err.code === 3;   // 時間切れは、そのまま待てば届くことがある（待つ間の まちメモは続ける）
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
    // おみやげ袋は、歩く地図の1歩（スティック・タップした所へ歩く・おまかせ歩き）だけ進む。ふつうの地図のタップは瞬間移動なので進めない
    if (lastWalk && !driving) {
      const d = dist(lastWalk, p);
      if (d <= 500) addWalk(d, stepMove && d <= 20);
      if (stepMove && d <= 20) addTrail(lastWalk, p);   // 足あとも、歩く地図の1歩だけ（タップの瞬間移動は残さない）
    }
    lastWalk = p;
    return;
  }
  if (p.acc > CFG.walkMaxAcc) return;
  if (!lastWalk) { lastWalk = p; return; }
  const d = dist(lastWalk, p), dt = (p.t - lastWalk.t) / 1000;
  if (dt <= 0 || d < Math.max(8, p.acc * 0.5)) return; // GPSのゆらぎは無視
  const v = d / dt, prev = lastWalk;
  lastWalk = p;
  if (dt > CFG.walkMaxGapSec) return;                   // 画面を閉じていた間の移動は数えない
  if (v > CFG.vehicleSpeed) { vehicleUntil = Date.now() + CFG.vehicleLockMs; return; }
  if (v > CFG.walkMaxSpeed || Date.now() < vehicleUntil) return;
  addWalk(d);
  addTrail(prev, p, true);   // あるいて移動では、通った田んぼ・水べのマスで生きものにも出会う（操作して移動は pixel.js の1歩ごと）
}

// あしあと（Dig Dug の掘ったトンネルのように、歩いた道が地図に残る）：はじめて歩いたマス（8m）が50ふえるごとに +5pt（1日50ptまで）。
// 同じ道ばかりより、知らない道を歩くほど得になる。マスの記録は pixel.js（trailWalk）
function addTrail(a, b, critters) {
  const P = window.nishioPixel;
  if (!P || !P.trailWalk) return;
  const n = P.trailWalk(a.lat, a.lng, b.lat, b.lng, critters && P.critterStep ? (x, y) => P.critterStep(x, y) : null);
  hundred(dist(a, b), n);   // きょうの100歩たんけん（動いた距離を ためて 8m ごとに1歩）
  if (!n) return;
  const day = dayState();
  day.trail = (day.trail || 0) + n;
  trailMiles((S.trail || 0) + n);
  S.trail = (S.trail || 0) + n;
  S.trailCarry = (S.trailCarry || 0) + n;
  let gained = 0;
  while (S.trailCarry >= CFG.trailUnit) {
    S.trailCarry -= CFG.trailUnit;
    if ((day.trailPts || 0) < CFG.trailDailyCap) { day.trailPts = (day.trailPts || 0) + CFG.trailPts; gained += CFG.trailPts; }
  }
  if (gained) {
    const top = S.log[0], today = ymd();
    if (top && top.type === 'trail' && top.date === today) { top.pts += gained; top.t = Date.now(); }
    else S.log.unshift({ type: 'trail', date: today, t: Date.now(), pts: gained, name: 'はじめて歩いた道' });
    gainPoints(gained);
    if (P.floatText) P.floatText('👣+' + gained);
  }
  save();
}

// きょうの100歩たんけん（ポケモンの「歩数の決まった場所で、めずらしいものを探す」）：その日 はじめて歩きだしたら始まり、100歩（1歩＝1マス 8m）のうちに
// はじめての道を 何マス歩けるか。25歩ごとに数を出し、おわったら そのマスの数だけ pt（30まで）と、自己ベストなら お祝い。1日1回（記録は モードごと）
const H100 = { steps: 100, cap: 30, win: 5 };   // win：さんぽ仲間（ライバル）より多いと
function hundred(meters, fresh) {   // meters：この1回で動いた距離。転がすと 1マスより小さい動きが何度も来るので、ためてから歩数にする
  if (driving || store.get('nsg_first_day', '') === ymd()) return;   // 遊びはじめた日は しない（はじめの日は ようこそ・はじめの1枚・週の知らせで いっぱいなので、次の日から）
  const day = dayState();
  let h = day.h100;
  if (h && h.done) return;
  if (!h) { h = day.h100 = { steps: 0, fresh: 0, m: 0, rival: h100Rival(ymd()) }; toastAfter(`👣 きょうの100歩たんけん！ 100歩のうちに、はじめての道を いくつ歩けるかな（🏃 ${RIVAL}は きょう ${h.rival}マス${S.h100best ? `・自己ベスト ${S.h100best}マス` : ''}）`); }   // さんぽ仲間も毎日たんけんする（日で決まる 20〜60マス）
  const rest = H100.steps * TRAIL_M - (h.m || 0), part = meters > rest ? Math.max(0, rest) / meters : 1;   // 100歩（800m）を またぐ1回は、800m までの分だけ
  h.m = (h.m || 0) + meters;
  const take = Math.min(Math.floor(h.m / TRAIL_M) - h.steps, H100.steps - h.steps), before = h.steps;
  h.fresh += Math.min(Math.round(fresh * part), H100.steps - h.fresh);   // はじめての道は、たんけんの間に ふえたマス（100まで。またぐ1回は 距離の わりあいで）
  if (take <= 0) return;
  h.steps += take;
  const P = window.nishioPixel;
  if (Math.floor(h.steps / 25) > Math.floor(before / 25) && h.steps < H100.steps) { if (P && P.floatText) P.floatText(`👣 ${h.steps}/100（はじめての道 ${h.fresh}）`); save(); }
  if (h.steps < H100.steps) return;
  h.done = true;
  const win = !!h.rival && h.fresh > h.rival, pts = Math.min(H100.cap, h.fresh) + (win ? H100.win : 0), best = h.fresh > (S.h100best || 0);   // さんぽ仲間に勝つと +5
  if (best) S.h100best = h.fresh;
  weekStat().h100 = (weekStat().h100 || 0) + 1;   // 先週のさんぽ に「100歩たんけん ○回」
  if (pts) { gainPoints(pts); S.log.unshift({ type: 'h100', t: Date.now(), pts, icon: '👣', name: `100歩たんけん：はじめての道 ${h.fresh}マス` }); }
  save(); badgesSoon();   // たんけん名人
  toastAfter(`🏁 100歩たんけん おわり！ はじめての道 ${h.fresh}マス${pts ? ` +${pts}pt` : ''}${best && h.fresh ? '　🎉 自己ベスト！' : S.h100best ? `（自己ベスト ${S.h100best}マス）` : ''}`);
  if (h.rival) toastAfter(win ? `🏃 ${RIVAL}「まけた！ ${h.fresh}マスは すごいじゃん。おれは ${h.rival}マスだったよ」` : `🏃 ${RIVAL}「おれは ${h.rival}マスだったよ。あしたは 知らん道を ねらってみりん」`);
  track('h100', { fresh: h.fresh, best, win, mode: demo ? 'play' : 'walk' });
}

// 歩いた道の節目（2048 の「倍々で大きくなる数字」から）：これまでに歩いた道が 500m・1km・2km・4km… と倍ごとの節目に届くたびに、お祝いと
// ポイント（30・60・90…）。節目は だんだん遠くなるので、ずっと先まで 次の目当てがある。はじめて この しくみに会った人は、もう越えた節目は配らず そこから数える
const trailMile = k => 500 * 2 ** k;
function trailMileNext() {   // つぎの節目の番号。はじめてのときは、いま歩いた道までの節目を すんだものにする（さかのぼって配らない）
  if (S.trailMile == null) { S.trailMile = 0; while ((S.trail || 0) * TRAIL_M >= trailMile(S.trailMile)) S.trailMile++; }
  return S.trailMile;
}
function trailMiles(after) {   // 歩いた道が after マスになる前に呼ぶ（S.trail は まだ前の値）
  trailMileNext();
  while (after * TRAIL_M >= trailMile(S.trailMile)) {
    const k = S.trailMile++, pts = 30 * (k + 1), m = trailMile(k);
    S.log.unshift({ type: 'trailmile', t: Date.now(), pts, icon: '👣', name: `歩いた道 ${fmtM(m)} の節目` });
    gainPoints(pts);
    const q = toastAfter.q || [];   // まだ出ていない前の節目の知らせは、新しい節目に まとめる（おくれて「1.0km に！」と出ないように。ポイントと記録は そのまま）
    for (let i = q.length - 1; i >= 0; i--) if (q[i].startsWith('👣 これまでに歩いた道が')) q.splice(i, 1);   // 待っている処理が 同じ列を見ているので、その場で取りのぞく
    toastAfter(`👣 これまでに歩いた道が ${fmtM(m)} に！ +${pts}pt（つぎの節目は ${fmtM(trailMile(k + 1))}）`);
    track('trail_mile', { m });
  }
}

function addWalk(d, bag = true) {
  dayState().walked += d;
  walkBest();
  weekStat().m += d;
  S.walked += d;
  S.walkCarry += d;
  if (bag) walkBags(d);   // おみやげ袋は、歩いた距離のポイントの1日の上限に届いても進む
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

// 自己ベスト（いちばん歩いた日）：ほかの日の記録（300m以上）をこえたら、その日1回だけ知らせる
function walkBest() {
  const day = dayState(), b = S.best || { m: 0, date: '' };
  if (day.walked <= b.m) return;
  if (b.date !== day.date && b.m >= 300 && !day.bestToast) {
    day.bestToast = true;
    toastAfter(`👟 自己ベスト！ きょうは ${fmtM(day.walked)}（これまでは ${fmtM(b.m)}）`);   // 同じ1歩で出るクエスト達成の知らせに上書きされないように
    track('walk_best', { m: Math.round(day.walked) });
  }
  S.best = { m: day.walked, date: day.date };
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

// ミニゲーム「にしおジャンプ」（runner.js）：名所（注目スポット。当店はのぞく）でチェックインした日にあそべる
const featuredToday = () => dayState().spots.some(id => { const x = spots.find(z => z.id === id); return x && x.featured && !x.shop; });
const jumpHere = s => !!(s && s.featured && !s.shop && dayState().spots.includes(s.id));
function openJump() {
  if (!featuredToday()) { toast('名所（注目スポット）でチェックインすると、その日ミニゲームであそべます'); return; }
  if (window.NISHIO_JUMP) NISHIO_JUMP.open();
}
// ごほうび：1日1回、コイン1まい1pt＋クリア10pt（30ptまで）。きょうはもうもらっていれば null
function jumpReward(coins, cleared) {
  if (S.jumpDay === ymd() || !featuredToday()) return null;
  const pts = Math.min(30, Math.max(0, coins | 0) + (cleared ? 10 : 0));
  if (!pts) return 0;
  S.jumpDay = ymd();
  gainPoints(pts);
  S.log.unshift({ type: 'jump', t: Date.now(), pts, name: `ミニゲーム「にしおジャンプ」${cleared ? 'クリア' : ''}（コイン${coins | 0}まい）`, icon: '🎮' });
  save();
  renderLog();   // きろく の数字と「最近のポイント」をすぐ新しく
  return pts;
}

// 稲刈りミニゲーム（harvest.js）のごほうび：成功したとき1日1回、10pt＋星1つ5pt（名人は25pt）。きょうはもうもらっていれば null
function harvestReward(stars, level) {
  if (S.harvestDay === ymd()) return null;
  const pts = 10 + 5 * Math.max(1, Math.min(3, stars | 0));
  S.harvestDay = ymd();
  gainPoints(pts);
  S.log.unshift({ type: 'harvest', t: Date.now(), pts, name: `ミニゲーム「コンバインで稲刈り」${'★'.repeat(Math.max(1, Math.min(3, stars | 0)))}（${(level | 0) + 1}枚目の田んぼ）`, icon: '🌾' });
  save();
  renderLog();
  return pts;
}

// 肥料山の草刈り（hiryoyama.js）のごほうび：★がついたとき1日1回、10pt＋星1つ5pt。きょうはもうもらっていれば null
function hiryoReward(stars) {
  if (S.hiryoDay === ymd()) return null;
  const st = Math.max(1, Math.min(3, stars | 0)), pts = 10 + 5 * st;
  S.hiryoDay = ymd();
  gainPoints(pts);
  S.log.unshift({ type: 'hiryo', t: Date.now(), pts, name: `ミニゲーム「肥料山の草刈り」${'★'.repeat(st)}`, icon: '🌿' });
  save();
  renderLog();
  return pts;
}

// 段丘をのぼるミニゲーム（dankyu.js）のごほうび：のぼりきったとき1日1回、10pt＋星1つ5pt。きょうはもうもらっていれば null
function dankyuReward(stars, level) {
  if (S.dankyuDay === ymd()) return null;
  const st = Math.max(1, Math.min(3, stars | 0)), pts = 10 + 5 * st;
  S.dankyuDay = ymd();
  gainPoints(pts);
  S.log.unshift({ type: 'dankyu', t: Date.now(), pts, name: `ミニゲーム「段丘をのぼる」${'★'.repeat(st)}（${(level | 0) + 1}つ目の段丘）`, icon: '⛰️' });
  save();
  renderLog();
  return pts;
}

// 田んぼのイベント「芽出しの見きわめ」（medashi.js）：1日1回。えらんだ種もみで ポイント（OK 20・ギリギリOK 10・伸び過ぎ 0）と、
// そのわけの 米づくりの まちメモ（kome.js。OK・ギリギリOK は「いちばんよい芽出し」、伸び過ぎは「伸びすぎるわけ」）
// 芽出し（催芽）は 苗づくりの はじめ。こよみ（season.js）の 田おこし・田植えの ころ（4〜6月）だけ 出す（冬に 種もみの 芽出しは しない。自分で 遊んで 分かった：12月に 出ていた）
const medashiSeason = () => { const p = window.NISHIO_SEASON && NISHIO_SEASON.paddy(new Date()); return !p || p.id === 'taokoshi' || p.id === 'taue'; };
const medashiDue = () => S.medashiDay !== ymd() && KOME.length > 0 && medashiSeason();
function medashiReward(choice, pts) {
  if (!medashiDue()) return { pts: 0, fresh: false };
  S.medashiDay = ymd();
  const k = `k:tanemomi:${choice === 'nobisugi' ? 2 : 0}`, fresh = !S.facts.includes(k);
  if (fresh) S.facts.push(k);
  pts = Math.max(0, Math.min(20, pts | 0));
  if (pts) gainPoints(pts);
  S.log.unshift({ type: 'medashi', t: Date.now(), pts, name: `イベント「芽出しの見きわめ」${choice === 'ok' ? '正解' : ''}`, icon: '🌱' });
  save();
  renderLog();
  track('medashi_pick', { choice, mode: demo ? 'play' : 'walk' });
  return { pts, fresh };
}

// 水べのイベント「虫の名前あて」（mushi.js）：1日1回。3問のうち当たった数で ポイント（0・6・12・20）と、
// 西尾の自然の本にのっている虫の まちメモ（shizen.js の mushi。まだのものから1つ）
const MUSHI_PTS = [0, 6, 12, 20];
const mushiDue = () => S.mushiDay !== ymd() && SHIZEN.some(x => x.id === 'mushi');
function mushiReward(right) {
  if (!mushiDue()) return { pts: 0, fresh: false };
  S.mushiDay = ymd();
  right = Math.max(0, Math.min(3, right | 0));
  const g = SHIZEN.find(x => x.id === 'mushi'), k = g.facts.map((f, i) => `z:mushi:${i}`).find(x => !S.facts.includes(x)), fresh = !!k;
  if (fresh) S.facts.push(k);
  const pts = MUSHI_PTS[right];
  if (pts) gainPoints(pts);
  S.log.unshift({ type: 'mushi', t: Date.now(), pts, name: `イベント「虫の名前あて」${right}/3`, icon: '🪲' });
  save();
  renderLog();
  track('mushi_done', { right, mode: demo ? 'play' : 'walk' });
  return { pts, fresh };
}

// イベント「古い地図が出てきた」（oldmap.js）：明治39年ごろの村を、はじめて見つけたら +15pt。ぜんぶ見つけるとバッジ
const OLDMAP_PTS = 15;
const oldmapHas = id => (S.oldmap || []).includes(id);
function oldmapFound(id, total) {
  if (!Array.isArray(S.oldmap)) S.oldmap = [];
  if (S.oldmap.includes(id)) return null;
  S.oldmap.push(id);
  S.oldmapTotal = total;
  gainPoints(OLDMAP_PTS);
  S.log.unshift({ type: 'oldmap', t: Date.now(), pts: OLDMAP_PTS, name: `古い地図：明治の村 ${S.oldmap.length}/${total}`, icon: '📜' });
  save();
  renderLog();
  badgesSoon();
  track('oldmap_found', { village: id, n: S.oldmap.length });
  return { n: S.oldmap.length, pts: OLDMAP_PTS, all: S.oldmap.length >= total };
}

// イベント「本のできごと」（bookev.js）：できごとごとに1回。正解 +20pt・ちがっても +5pt、そのできごとの まちメモ。ぜんぶ見るとバッジ
const bookEvHas = id => (S.bookEv || []).includes(id);
function bookEvDone(id, ok, facts, total) {
  if (!Array.isArray(S.bookEv)) S.bookEv = [];
  if (S.bookEv.includes(id)) return null;
  S.bookEv.push(id);
  const pts = ok ? 20 : 5;
  for (const k of facts || []) if (!S.facts.includes(k)) S.facts.push(k);
  gainPoints(pts);
  S.log.unshift({ type: 'bookev', t: Date.now(), pts, name: `本のできごと ${S.bookEv.length}/${total}${ok ? '（正解）' : ''}`, icon: '📖' });
  save();
  renderLog();
  badgesSoon();
  track('bookev_done', { ev: id, ok, n: S.bookEv.length });
  return { pts, n: S.bookEv.length, all: S.bookEv.length >= total };
}

// イベント「雲母石を探せ」（kirara.js）：場所ごとに1回。石の中から雲母石を見つけると +15pt（1回目で見つけたら +20pt）と、その場所の まちメモ。
// ぜんぶの場所で見つけると、もう +30pt
const kiraraHas = id => (S.kirara || []).includes(id);
function kiraraFound(id, first, facts, total) {
  if (!Array.isArray(S.kirara)) S.kirara = [];
  if (S.kirara.includes(id)) return null;
  S.kirara.push(id);
  const all = S.kirara.length >= total, pts = (first ? 20 : 15) + (all ? 30 : 0);
  let fresh = false;
  for (const k of facts || []) if (!S.facts.includes(k)) { S.facts.push(k); fresh = true; }
  gainPoints(pts);
  S.log.unshift({ type: 'kirara', t: Date.now(), pts, name: `雲母石を探せ ${S.kirara.length}/${total}${all ? '（ぜんぶ見つけた）' : ''}`, icon: '✨' });
  save();
  renderLog();
  track('kirara_found', { at: id, first, n: S.kirara.length });
  return { pts, n: S.kirara.length, all, fresh };
}

// イベント「八ツ面山の昆虫さがし」（yatsumushi.js）：1日1回。きょうの虫を見つけたら +15pt、はじめて見た虫は1ぴき +5pt（虫手帳 S.yatsuMushi に残る）。
// 八ツ面山の虫の まちメモ（shizen.js の yatsu-mushi）を、まだのものから1つ
const yatsuMushiDue = () => S.yatsuMushiDay !== ymd() && SHIZEN.some(x => x.id === 'yatsu-mushi');
const yatsuMushiSeen = () => (S.yatsuMushi || []).slice();
function yatsuMushiReward(gotTarget, seenIds) {
  if (!yatsuMushiDue()) return { pts: 0, fresh: false, newOnes: 0, total: (S.yatsuMushi || []).length };
  S.yatsuMushiDay = ymd();
  if (!Array.isArray(S.yatsuMushi)) S.yatsuMushi = [];
  const newOnes = [...new Set(seenIds || [])].filter(id => typeof id === 'string' && !S.yatsuMushi.includes(id)).slice(0, 5);
  S.yatsuMushi.push(...newOnes);
  const g = SHIZEN.find(x => x.id === 'yatsu-mushi'), k = g.facts.map((f, i) => `z:yatsu-mushi:${i}`).find(x => !S.facts.includes(x)), fresh = !!k;
  if (fresh) S.facts.push(k);
  const pts = (gotTarget ? 15 : 0) + newOnes.length * 5;
  if (pts) gainPoints(pts);
  S.log.unshift({ type: 'yatsumushi', t: Date.now(), pts, name: `八ツ面山の昆虫さがし${gotTarget ? '（見つけた）' : ''}`, icon: '🪲' });
  save();
  renderLog();
  track('yatsumushi_done', { got: !!gotTarget, fresh: newOnes.length });
  return { pts, fresh, newOnes: newOnes.length, total: S.yatsuMushi.length };
}

// ミニゲームの面ごとの自己ベスト（倉庫番のゲームのように、面ごとに いちばん良い記録と、どこまで解いたかを残す）
// 星が多いほど上。星が同じなら v が良いほど上（lower：v が小さいほど良い。稲刈りの曲がった回数）。成功（星1つ以上）だけ記録する
function miniBest(game, level, stars, v, lower) {
  const all = S.mini || (S.mini = {}), list = all[game] || (all[game] = []), old = list[level] || null;
  const better = stars > 0 && (!old || stars > old.s || (stars === old.s && (lower ? v < old.v : v > old.v)));
  if (better) { list[level] = { s: stars, v }; save(); }
  return { old, best: list[level] || null, fresh: better && !!old };
}
const miniRecords = game => ((S.mini || {})[game] || []).map(r => r || null);
// ミニゲームを開いたときの面：まだ成功していない いちばん前の面（ぜんぶ成功していれば1つ目）
const miniStart = (game, n) => { const r = miniRecords(game); for (let i = 0; i < n; i++) if (!r[i]) return i; return 0; };

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
    ${simple() ? (c.shopBonus ? `<p class="chips"><span>${PIA('bowl', '当店でチェックイン')}${PIA('coin', 'ポイント')}+${c.shopBonus}</span></p>` : '')
      : `${c.text ? `<p>${esc(c.text)}</p>` : ''}${c.shopBonus ? `<p>🍚 期間中、当店でチェックインすると +${c.shopBonus}pt（1日1回）</p>` : ''}`}
    ${c.url ? `<a class="btn mini" href="${esc(utmUrl(c.url, 'campaign_' + c.id))}" target="_blank" rel="noopener" data-camp="${esc(c.id)}">くわしく見る</a>` : ''}</div>`).join('');
}

const SHOP_NOTE = '西尾のお米屋さん（明治25年創業）。車に乗ったままお米を受け取れるドライブスルーや、24時間つかえるコイン精米所もあります。くわしくは ricepia.jp で。';
// 当店の LINE（常連さまポイント：1日1回の来店で+1pt、10ptで100円引き。LINE の友だち登録から。ricepia.jp と同じ）。from でゲームのどこから来たかを分ける
const SHOP_LINE = 'https://ricepia.jp/go/lin.ee/uPhkiiv';
const lineUrl = from => `${SHOP_LINE}?from=game-${from}`;
const hm = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
function shopOpen(s, t = Date.now()) {   // 当店の いま営業中か（spots.json の hours。お店の時刻＝日本時間で）。次にあく時刻も
  const h = s.hours;
  if (!h) return null;
  const d = new Date(t + 9 * 3600000), day = d.getUTCDay();
  const now = d.getUTCHours() * 60 + d.getUTCMinutes(), closedDay = w => (h.closed || []).includes(w);
  if (!closedDay(day) && now >= hm(h.open) && now < hm(h.close)) return { open: true, text: `いま営業中（${h.close}まで）` };
  for (let i = now < hm(h.open) ? 0 : 1; i <= 7; i++) {
    const w = (day + i) % 7;
    if (!closedDay(w)) return { open: false, text: `いまは閉まっています（${i === 0 ? 'きょう' : i === 1 ? 'あす' : WEEK[w] + '曜'}${h.open}から）` };
  }
  return { open: false, text: 'いまは閉まっています' };
}
function shopInfoHtml(s) {   // 当店の窓：営業時間・電話・来店スタンプ・LINE の常連さまポイント
  const h = s.hours, o = shopOpen(s), n = (S.shopDays || []).length;
  return `<div class="shop-info">
    ${h ? `<p>🕘 ${esc(h.open)}〜${esc(h.close)}（${(h.closed || []).length ? (h.closed || []).map(w => WEEK[w]).join('・') + '曜休み' : '年中無休'}）　<b class="${o.open ? 'open' : 'shut'}">${esc(o.text)}</b></p>` : ''}
    ${s.tel ? `<p>📞 <a href="tel:${esc(s.tel.replace(/-/g, ''))}">${esc(s.tel)}</a>${n ? `　🍚 来店スタンプ ${n}こ` : ''}</p>` : ''}
    <p class="shop-line">📱 <b>常連さまポイント</b>：お店で1日1回の来店で+1pt、10ptで100円引き（LINE の友だち登録から）<br>
      <a class="btn mini line" href="${esc(lineUrl('card'))}" target="_blank" rel="noopener">LINEで友だち追加</a></p></div>`;
}
const SHOP_STAMP = { 3: 100, 5: 200, 10: 500 };   // 来店スタンプ（当店に来た日の数）のごほうびポイント
// めぐりの れんさ（落ちものパズルの「まとめて消すほど 大きく得をする」から）：チェックインのあと30分以内に、ちがう名所でチェックインすると
// れんさが つながり、2つめは ×1.2・3つめは ×1.5・4つめからは ×2（スポットのポイントに）。30分あくと 1 からやりなおし。いちばん長い れんさを覚える
const CHAIN = { ms: 30 * 60000, mult: [1, 1, 1.2, 1.5, 2] };
const chainMult = n => CHAIN.mult[Math.min(Math.max(n, 0), CHAIN.mult.length - 1)];
const chainLeft = () => { const c = S.chain; return c && c.last ? Math.max(0, CHAIN.ms - (Date.now() - c.last)) : 0; };
function chainStep(s, now) {
  const c = S.chain || { n: 0, last: 0, id: '', best: 0 };
  c.n = c.last && now - c.last <= CHAIN.ms && c.id !== s.id ? c.n + 1 : 1;
  c.last = now; c.id = s.id; c.best = Math.max(c.best || 0, c.n);
  S.chain = c;
  return { n: c.n, bonus: c.n >= 2 ? Math.round(ptsOf(s) * (chainMult(c.n) - 1)) : 0 };
}

const MZ_STAR_PTS = [0, 2, 5, 10];   // 地図の めいろの ゴールの ★（1〜3）の ボーナス
const MZ_WAY = { good: 1.3, pts: 5 };   // 通った マスが ちかみちの 1.3倍 までなら「まよわず ゴール」
const MZ_SHOO_PTS = 3;   // かかしで こわがった カラスを おいはらった
// 地図の めいろの ゴール（行き先の 名所・人）に 着いた：かかった 時間と めいろの 道のり・★・まよわず ゴール、紙ふぶき。
// lines の 先頭に 行を 足し、ボーナスの ポイントを かえす（名所は checkin、人は 話しかけた とき）
// バイラルループ（運営者の声「バイラルループを作る」：使う → 画面を投稿する → 見た人が知る → 登録する）：めいろの ゴールで、遊んでいた 画面を 1枚 とっておき、
// ごほうびの 窓に「📣 シェア」を 出す（share.js の 'mzgoal'。リンクは すぐ 遊べる ?play=1 と、友だちの +20pt）
let mzShare = null;
function snapMaze() {   // ドット絵の 地図の まん中（お米の まわり）を 正方形に 切りだす。どこにも 送らない（シェアの 画像に だけ 使う）
  try {
    const cv = $('pxCanvas');
    if (!cv || !cv.width || !cv.height) return null;
    const sz = Math.min(cv.width, Math.round(cv.height * 0.75)), out = document.createElement('canvas');
    out.width = out.height = 360;
    out.getContext('2d').drawImage(cv, Math.round((cv.width - sz) / 2), Math.round((cv.height - sz) / 2), sz, sz, 0, 0, 360, 360);
    return out;
  } catch (e) { return null; }
}
function mazeGoal(id, name, lines) {
  const MZ = demo && window.nishioPixel && nishioPixel.maze, gl = MZ && MZ.goal ? MZ.goal(id) : null;   // 着いた とたんに 行き先は 次に かわるので、前の ゴールも 見る
  if (!gl || gl.sec <= 3) return 0;
  let total = 0;
  const t = gl.sec < 60 ? `${Math.round(gl.sec)}秒` : `${Math.floor(gl.sec / 60)}分${String(Math.round(gl.sec % 60)).padStart(2, '0')}秒`;
  const st = gl.stars || 0, stars = st ? '★'.repeat(st) + '☆'.repeat(3 - st) : '', sb = MZ_STAR_PTS[st] || 0;   // 目やすの 時間（めいろの 道のりで きまる）より はやいほど ★が ふえて ボーナス
  if (sb) { total += sb; lines.unshift(`${stars} ${st === 3 ? 'はやい！' : st === 2 ? 'いいね！' : 'ゴール！'} +${sb}`); }
  if (gl.way) {   // 通った マスが ちかみちの 何倍か（ほかの 迷路ゲームの「何手で とけた」）。1.3倍 までなら まよわず ゴールで ボーナス
    const wx = gl.way.toFixed(1);
    if (gl.way <= MZ_WAY.good) { total += MZ_WAY.pts; lines.unshift(`🧭 まよわず ゴール！（通った 道 ${wx}倍） +${MZ_WAY.pts}`); }
    else lines.push(`🧭 通った 道は ちかみちの ${wx}倍（${MZ_WAY.good}倍 までなら ボーナス）`);
  }
  lines.unshift(`🏁 めいろ ゴール！ ${t}${gl.m ? `（めいろの 道のり ${fmtM(gl.m)}）` : ''}`);
  {   // この 道の ふり返り（ポイントは つけない）：ひろった ごはんつぶ・のった びゅんパネル・いちばん 長い コンボ
    const r = gl.run || {}, parts = [r.dots ? `🍚 つぶ ${r.dots}` : '', r.pads ? `💨 びゅん ${r.pads}` : '', r.combo >= 3 ? `🎵 コンボ ×${r.combo}` : ''].filter(Boolean);
    if (parts.length) lines.push(`この 道で がんばったじゃん：${parts.join('・')}`);
  }
  mzShare = { name, sec: gl.sec, stars: st, m: gl.m || 0, run: gl.run || null, img: snapMaze(), t: Date.now() };   // ゴールの ごほうびに シェアの ボタン（画面を 投稿する）
  MZ.goalFx(`${stars ? stars + ' ' : ''}${t}${gl.m ? `・めいろ ${fmtM(gl.m)}` : ''}`);
  track('maze_goal', { spot: name, sec: Math.round(gl.sec), m: Math.round(gl.m), stars: st, way: gl.way ? Math.round(gl.way * 10) / 10 : 0 });
  return total;
}
// めいろの ゴールの 名所に 着いた（pixel.js）：その 名所で チェックイン（近くに ほかの 注目スポットが あって 下の 札が そちらでも）。
// 近さ・待ち時間が 足りなければ 何も しない（false）
function checkinSpot(id) {
  const s = spots.find(x => x.id === id);
  if (!s || !me || driving || !inReach(s) || cooldownLeft(s) > 0) return false;
  selected = s;
  checkin();
  return true;
}
function checkin() {
  const s = selected;
  if (!s || !me) return;
  if (driving) { toast('🚗 車を降りてからチェックインしてね'); return; }
  const now = Date.now();
  // 乗り物（電車・バス・車の助手席）で移動中でもチェックインできる。運転している人は操作しないよう、乗り物の判定ごとに1回だけ知らせる
  if (!demo && now < vehicleUntil && checkin.warned !== vehicleUntil) { checkin.warned = vehicleUntil; toast('🚗 乗り物で移動中です。運転している人は操作しないでください（同乗者・電車・バスならそのまま遊べます）'); }
  if (!demo && me.acc > CFG.maxAccuracy) { toast(`GPSの精度が低いようです（誤差 約${Math.round(me.acc)}m）。少し待ってからもう一度。`); return; }
  if (!inReach(s)) { toast('もう少し近づいてください'); refreshNearby(); return; }
  if (cooldownLeft(s) > 0) { toast(`このスポットは あと${Math.ceil(cooldownLeft(s) / 60000)}分 でまたチェックインできます`); return; }

  const v = S.visits[s.id];
  const lines = [];
  let total = 0, special = null;
  const base = ptsOf(s), theme = weekTheme(), inTheme = inThemeOf(s, theme);
  total += base; lines.push(`${iconOf(s)} スポット +${base}`);
  if (inTheme) { total += base; lines.push(`🎌 今週は${theme.icon}${theme.name}の週（ポイント2倍） +${base}`); }
  const ch = chainStep(s, now);   // めぐりの れんさ：30分以内に ちがう名所へ着くと、スポットのポイントが ×1.2・×1.5・×2
  if (ch.bonus) { total += ch.bonus; lines.push(`🔗 めぐりの れんさ ${ch.n}（30分以内に次の名所） ×${chainMult(ch.n)} +${ch.bonus}`); }
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
    if (S.streak.days % 7 === 0) special = streakDot();   // 7日連続ごとに特別な1枚
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
  if (!v) praiseCheck(s.area || areaNear(s));   // ふつうのスポットには地区がないので、いちばん近い注目スポットの地区で
  movieCheck(s);   // その名所の イベント「ドット絵ムービー」（まだ見ていなければ）
  const jumpNew = s.featured && !s.shop && !featuredToday();   // きょう はじめての名所：ミニゲームがあそべるようになる
  const day = dayState();   // 今日のクエストの数え上げ
  day.checkins++;
  if (!day.spots.includes(s.id)) day.spots.push(s.id);
  if (jumpNew) lines.push('🎮 名所でミニゲーム「にしおジャンプ」があそべる（スポットの窓・きろく から）');
  total += mazeGoal(s.id, s.name, lines);   // 地図の めいろの ゴール（行き先の 名所）に 着いた：かかった 時間と めいろの 道のり、紙ふぶき
  if (['shrine', 'temple', 'worship'].includes(s.kind || s.cat)) day.shrine++;
  // 「はじめてのスポット」：まだ行っていない所がもう無い人は、どのスポットでも達成にする
  if (!v || spots.every(x => x.id === s.id || S.visits[x.id])) day.fresh++;
  if (s.featured && s.area && !day.areas.includes(s.area)) day.areas.push(s.area);
  if (s.shop) day.shop = 1;
  S.checkins++;
  weekStat().spots++;
  track('checkin', { spot: s.name, featured: !!s.featured, first: !v, theme: inTheme ? theme.key : '', chain: ch.n, mode: demo ? 'play' : 'walk' });
  // おみやげ袋：はじめての注目スポットと、今週のテーマの名所では必ず（持てる数に空きがあれば。テーマの名所の袋は1日3つまで：公園の週は公園が千か所あるので）
  const themeBag = inTheme && (day.themeBags || 0) < BAG.themeDaily;
  const bag = !s.shop && ((s.featured && !v) || themeBag) ? giveBag(s.lat, s.lng, s.featured && !v ? 'featured' : 'theme') : null;
  if (bag && !(s.featured && !v)) day.themeBags = (day.themeBags || 0) + 1;
  if (bag) lines.push(`🎒 おみやげ袋（${bag.km}km 歩くと開く）`);
  if (s.shop) track('shop_checkin', { spot: s.name, mode: demo ? 'play' : 'walk' });
  if (s.shop && !(S.shopDays || []).includes(today)) {   // 来店スタンプ：当店（どちらのお店でも）に来た日を1日1こ。3・5・10こで ごほうび
    S.shopDays = [...(S.shopDays || []), today].slice(-400);
    const n = S.shopDays.length, b = SHOP_STAMP[n] || 0;
    lines.push(`🍚 来店スタンプ ${n}こめ`);
    if (b) { total += b; lines.push(`🎁 来店スタンプ ${n}こ たまった！ +${b}`); }
    track('shop_stamp', { n, spot: s.name, mode: demo ? 'play' : 'walk' });
  }
  S.log.unshift({ type: 'spot', t: now, pts: total, name: s.name, icon: iconOf(s), id: s.id });
  // その場所の話（まだ知らないまちメモがあれば。ないときは ほかの話）
  const fk = s.shop ? '' : learnFact('c:' + s.id + ':' + S.checkins);
  const dot = s.shop ? null : gainDot(s.lat, s.lng, 'c:' + s.id, s.area);
  const lvUp = gainPoints(total);
  save();

  const btn = $('spinBtn');
  btn.classList.remove('go'); void btn.offsetWidth; btn.classList.add('go');
  const sp = special ? [`🎉 ${S.streak.days}日連続のごほうび：めずらしい天気のキラの絵`, ...dotLines(special)] : [];
  showReward(total, s.name, s.shop ? [...lines, ...sp, '🍚 当店に来てくれてありがとう！', '📱 お店の常連さまポイントも LINE でたまります'] : [...lines, ...sp, ...(fk ? ['📖 まちメモ +1'] : []), ...dotLines(dot)], lvUp, s.shop ? SHOP_NOTE : fk ? factPool().get(fk) : '', special || dot);
  reactAsk(s);
  if (s.shop) shopAfter(s);   // ごほうびのあと、当店の窓（営業時間・LINE の常連さまポイント）を出す
  map.closePopup();
  renderMarkers();
  refreshNearby();
  updateQuests(1200);   // チェックインの知らせのあとにクエスト達成を知らせる
  setTimeout(checkBadges, 2700);
}

/* ---------- 西尾の名物（meibutsu.js：観光協会と市の資料から） ---------- */
const MEIBUTSU = window.NISHIO_MEIBUTSU || [];
const SHIZEN = window.NISHIO_SHIZEN || [];   // 西尾の海と大地（shizen.js）
const KOME = window.NISHIO_KOME || [];   // 米づくり（kome.js）
const SANGYO = window.NISHIO_SANGYO || [];   // むかしの西尾の仕事（sangyo.js）
const spotSangyo = s => SANGYO.filter(x => (x.spots || []).some(id => 'f-' + id === s.id));
const spotShizen = s => SHIZEN.filter(x => x.spots.some(id => 'f-' + id === s.id));
// イベント「ドット絵ムービー」（movie.js）で見せる話。たからばこ・しらべる などでは出さない（最後まで見ると まちメモ に残る）
const movieFact = k => !!(window.NISHIO_MOVIE && NISHIO_MOVIE.list.some(m => m.facts.includes(k)));
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
  if (S.day && S.day.date && S.day.date !== ymd()) S.prevDay = { date: S.day.date, walked: S.day.walked || 0, trail: S.day.trail || 0, checkins: S.day.checkins || 0, dots: S.day.dots || 0 };   // 前回のさんぽ（日がかわったときの知らせ・きろく）
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
    toast(simple() ? `📜✅${all ? '🏆' : ''} +${gained}pt${lvUp ? `　⭐Lv${lvUp}` : ''}`
      : `📜 クエスト達成！${done.map(t => `「${t}」`).join('')}${all ? '　🏆 今日のクエストぜんぶ達成！' : ''} +${gained}pt${lvUp ? `　🎉 Lv${lvUp}` : ''}`);
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
  for (const x of SHIZEN) x.facts.forEach((f, i) => m.set(`z:${x.id}:${i}`, `${x.icon} ${x.name}：${f}`));
  for (const x of KOME) x.facts.forEach((f, i) => m.set(`k:${x.id}:${i}`, `${x.icon} ${x.name}：${f}`));
  for (const x of SANGYO) x.facts.forEach((f, i) => m.set(`g:${x.id}:${i}`, `${x.icon} ${x.name}：${f}`));
  for (const t of MACHI) t.facts.forEach((f, i) => m.set(`t:${t.id}:${i}`, `${t.icon} ${t.city}：${f}`));
  return m;
}
// 出すまちメモ：まだ持っていないものから、①7市町の外なら そのまちの話 ②そのスポットの話・そこでの行事 ③同じ地区の話 ④まわりのまち以外のほか ⑤ほか の順に選ぶ
function pickFact(c) {
  const pool = factPool(), keys = [...pool.keys()].filter(k => !movieFact(k)), fresh = keys.filter(k => !S.facts.includes(k));   // ムービーで見せる話はのぞく
  const list = fresh.length ? fresh : keys;
  if (!list.length) return '';
  let near = null, nd = Infinity;
  for (const s of spots) { const d = dist(c, s); if ((c.at ? s.name === c.at : true) && d < nd) { near = s; nd = d; } }
  const area = near && near.area, inArea = id => { const s = spots.find(x => x.id === id); return s && s.area === area; };
  const machi = machiAt(c), here = cityAt(c.lat, c.lng), hereNear = !!here && here.name !== '西尾市';
  const tiers = [
    k => machi && k.startsWith(`t:${machi.id}:`),
    k => near && (k === `s:${near.id}` || EVENTS.some(e => k === `e:${e.id}` && evSpotId(e) === near.id) || spotMeibutsu(near).some(x => k.startsWith(`m:${x.id}:`)) || spotShizen(near).some(x => k.startsWith(`z:${x.id}:`)) || spotSangyo(near).some(x => k.startsWith(`g:${x.id}:`))),
    k => area && (k.startsWith(`a:${area}:`) || (k.startsWith('s:') && inArea(k.slice(2))) || EVENTS.some(e => k === `e:${e.id}` && e.spot && inArea(evSpotId(e)))),
    k => !k.startsWith('t:') && factNear(k) === hereNear,   // 西尾市にいるなら西尾の話、となりの市町にいるなら となりの市町の話
    k => !k.startsWith('t:'),   // まわりのまち（刈谷・大府など）の話は、そのまちにいるときだけ（西尾で大府の話が出ないように）
    () => true,
  ];
  for (const t of tiers) { const g = list.filter(t); if (g.length) return g[hashStr(c.id) % g.length]; }
  return '';
}
// まちメモが、となりの市町（areas.json の near の地区・area のある名物）の話か
function factNear(k) {
  const [kind, id] = k.split(':'), areaNear = a => !!(areas.find(x => x.id === a) || {}).near, spotNear = sid => { const sp = spots.find(x => x.id === sid); return !!sp && areaNear(sp.area); };
  if (kind === 'a') return areaNear(id);
  if (kind === 's') return spotNear(id);
  if (kind === 'e') { const e = EVENTS.find(x => x.id === id); return !!e && (e.spot ? spotNear(evSpotId(e)) : areaNear(e.area)); }   // 会場のない行事は、行事の area で
  if (kind === 'm') return !!(MEIBUTSU.find(x => x.id === id) || {}).area;
  if (kind === 'z' || kind === 'k' || kind === 'g') return false;   // 西尾の海と大地・米づくり・むかしの仕事は、西尾市の話
  return true;
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
  if (rewardBusy()) return;   // ほかの ごほうび（同じ位置の知らせで見つけた 路地の行き止まり など）を上書きしない。閉じたら もう一度 調べる（hideReward）
  // あるいて移動では、チェックインと同じく GPS の誤差が大きいときは開けない（乗り物で移動中でも開ける）
  if (!demo && (!me || me.acc > CFG.maxAccuracy)) return;
  const n = nearestChest();
  if (!n || n.d > (demo ? 18 : 30)) return;
  const c = n.c, d = dayState(), welcome = c.id.endsWith(':welcome');
  d.chests.push(c.id);
  if (welcome) S.welcomed = true;
  const pick = pickFact(c), newFact = !!pick && !S.facts.includes(pick);
  track('chest_open', { mode: demo ? 'play' : 'walk' });
  if (newFact) S.facts.push(pick);
  // ようこそ たからばこ（歩く地図）では、はじめの1枚を3枚から えらぶ（「自分の1枚」から絵帳を始める）。ほかは場所で決まる1枚
  const cands = welcome ? firstCands(c) : [];
  const dot = cands.length >= 2 ? null : gainDot(c.lat, c.lng, 'chest:' + c.id);
  // その記録（あるいて移動／操作して移動）ではじめて袋が出る たからばこ は、必ず 1km（あるいて移動には ようこそ たからばこ がないので、記録で見る）
  const firstBag = !S.bagFirst;
  const bag = firstBag ? giveBag(c.lat, c.lng, welcome ? 'welcome' : 'first', 1) : Math.random() < BAG.chestRate ? giveBag(c.lat, c.lng, 'chest') : null;
  if (bag && firstBag) S.bagFirst = true;
  S.log.unshift({ type: 'chest', t: Date.now(), pts: c.pts, name: 'たからばこ', icon: '🎁' });
  const lvUp = gainPoints(c.pts);
  save();
  const show = dt => showReward(c.pts, welcome ? 'ようこそ！ はじめての たからばこ' : 'たからばこを見つけた！', [`🎁 たからばこ +${c.pts}`, ...(newFact ? ['📖 まちメモ +1'] : []), ...dotLines(dt), ...(bag ? [`🎒 おみやげ袋（${bag.km}km 歩くと開く）`] : []), ...(welcome ? ['🧭 つぎは、下の案内の行き先へ行ってみよう'] : [])], lvUp, pick ? factPool().get(pick) : '', dt);
  if (cands.length >= 2) pickFirst(cands, show); else show(dot);
  updateQuests(1500);
  refreshNearby();
}
// はじめの1枚の候補：その場所で出る絵から、題材のちがう3枚（歩く地図で、絵が出る所のときだけ）
function firstCands(c) {
  const D = window.NISHIO_DOTS, out = [];
  if (!D || !document.body.classList.contains('px')) return out;
  for (let j = 0; j < 30 && out.length < 3; j++) {
    const id = D.pick(c.lat, c.lng, `first:${c.id}:${j}`, new Date());
    if (id == null) break;
    if (!out.some(x => D.motifOf(x) === D.motifOf(id))) out.push(id);
  }
  return out;
}
let firstPick = null;   // { cands, done, opt }：えらんでいる途中
// opt：{ title, sub, kira（えらんだ絵を キラに）, ev（GA4 の名前） }。ふだんは はじめの1枚
function pickFirst(cands, done, opt = {}) {
  const D = window.NISHIO_DOTS;
  firstPick = { cands, done, opt };
  const open = () => {
    if (!firstPick || firstPick.cands !== cands) return;
    $('pxInfoBody').innerHTML = `<div class="pick-first"><h4>${PIA('card', '')} ${esc(opt.title || 'はじめの1枚を えらぼう')}</h4><p>${esc(opt.sub || 'えらんだ絵が、西尾ドット絵帳の1枚目になります')}</p>
      <div class="pick3">${cands.map(id => { const f = D.info(id); return `<button type="button" data-pick-dot="${id}"><img src="${D.dataUrl(id)}" alt="${esc(f.name)}" width="96" height="96"/>${starRow(dotStars(f))}<span>${esc(f.title)}</span></button>`; }).join('')}</div></div>`;
    $('pxInfo').hidden = false;
  };
  if (D.ready && !D.ready(cands)) D.load(cands).then(open); else open();
}
function finishFirst(id) {
  const p = firstPick;
  if (!p) return;
  firstPick = null;
  if (p.opt.key && p.opt.key !== stateKey()) { if (!$('pxInfo').hidden) $('pxInfo').hidden = true; return; }   // えらんでいる間に 移動のしかた（記録）を切り替えた：渡さない（予約は もとの記録に残り、もどったとき また出る）
  const dot = addDot(p.cands.includes(id) ? id : p.cands[0], !!p.opt.kira);
  track(p.opt.ev || 'first_dot_pick', { picked: p.cands.indexOf(dot.id), mode: demo ? 'play' : 'walk' });
  save();
  if (!$('pxInfo').hidden) $('pxInfo').hidden = true;
  p.done(dot);
}
// しるしの2枚（昔のドット絵RPGの「2つのうち 1つだけ もらえる」）：地区のしるしを もらったら、その地区の題材の めずらしい天気（雪・満月・虹）の絵を
// 2枚見せて、えらんだ1枚が キラで もらえる（もう1枚は もらえない）。人の話の窓を閉じてから出す。えらぶ前に閉じたアプリでも、次に開いたとき出す
function sealCands(areaId) {
  const D = window.NISHIO_DOTS;
  if (!D) return [];
  const have = new Set((S.dots || []).map(id => D.motifOf(id))), all = D.MOTIFS.map((m, i) => i);
  const here = all.filter(i => (D.MOTIFS[i].areas || []).includes(areaId)), base = here.length >= 2 ? here : all;
  const fresh = base.filter(i => !have.has(i)), pool = (fresh.length >= 2 ? fresh : base).slice();
  const out = [];
  while (out.length < 2 && pool.length) { const m = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; out.push(D.idOf(m, 4, Math.floor(Math.random() * 16), Math.floor(Math.random() * D.NCOMP))); }
  return out;
}
// えらぶ予定は 地区ごとに列（S.sealPicks）に積む（ふつうの地図では 窓が出せないので、歩く地図にしたとき 順に出す）。
// 起動したとき・歩く地図にしたとき・位置が かわったとき（refreshNearby）・窓を閉じたときに 調べる
function sealPickCheck() {
  const p = (S.sealPicks || [])[0];
  if (!p || firstPick || !document.body.classList.contains('px') || !$('pxInfo').hidden || rewardBusy() || !window.NISHIO_DOTS) return;
  if (['log', 'voice', 'rewards', 'settings'].some(t => !$('panel-' + t).hidden)) return;   // ほかのタブ（せってい など）を開いている間は 出さない（地図にもどってから）
  if (document.body.classList.contains('jump-open') || medashiOpen() || (window.NISHIO_MOVIE && NISHIO_MOVIE.playing) || (window.nishioPixel && nishioPixel.sightBusy && nishioPixel.sightBusy())) return;   // ミニゲーム・イベント・ムービー・呼びとめの最中は出さない
  pickFirst(p.cands, dot => {
    S.sealPicks = (S.sealPicks || []).filter(x => x.area !== p.area); save();   // 地区で消す（モードを行き来すると 記録は読み直されて 別のものになる）
    toastAfter(`🔖 ${p.name}のしるしの1枚：「${window.NISHIO_DOTS.info(dot.id).title}」が キラで 絵帳に入った！`);
    const pl = $('panel-log'); if (pl && !pl.hidden) renderLog();
  }, { title: `${p.name}のしるしの1枚を えらぼう`, sub: '2枚のうち、えらんだ1枚だけが キラで もらえます（もう1枚は もらえません。えらばずに とじると、左の1枚）', kira: true, ev: 'seal_dot_pick', key: stateKey() });
}
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-pick-dot]'); if (b) finishFirst(Number(b.dataset.pickDot)); });
// えらばずに窓を閉じたら（とじる・まわりをタップ）、はじめの1枚にする
new MutationObserver(() => { if (firstPick && $('pxInfo').hidden) finishFirst(firstPick.cands[0]); else if ((S.sealPicks || []).length && $('pxInfo').hidden) setTimeout(sealPickCheck, 500); }).observe($('pxInfo'), { attributes: true, attributeFilter: ['hidden'] });   // 人の話の窓を閉じたら、しるしの2枚

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
// あるいて移動では GPS の精度が悪いときもだめ（電車・バスなどの乗り物で移動中は、着いたことにしてよい）
const fixOk = () => !!me && !driving && (demo || me.acc <= CFG.maxAccuracy);   // 最近着いた行き先（この数だけ覚えて、続けてすすめない）
// 次の行き先を決める。from：話した人（なければ環境が決める）。戻り値：{ kind, id, name, lat, lng, why, by, alts }（alts：ほかの候補。札から選べる）
const mazeNow = () => !!(demo && window.nishioPixel && nishioPixel.maze && nishioPixel.maze.playing && nishioPixel.maze.playing());   // 地図の めいろで 遊んでいる（ドット絵の 地図を 出している 間だけ。ふつうの 地図に 切りかえたら 偽）
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
  // 地図の めいろでは、ほかの 行き先と 同じ すすめる範囲まで（めいろの 道のりは まっすぐの 3〜4倍。5km 先の 人や 船の 先の 島は、めいろでは 着けない）
  if (from && Array.isArray(from.refer)) {
    const all = placeNpcs(), lim = mazeNow() ? range : 10000;
    const ref = from.refer.map(([id, words]) => ({ n: all.find(x => x.id === id), words }))
      .find(x => x.n && !npcMet(x.n.id) && !recent.has(x.n.id) && dist(me, x.n) > guideRadius({ kind: 'npc' }) * 1.5 && dist(me, x.n) <= lim);
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
// 聞いた名所：人の話に出てきた（すすめられた）まだ行っていない名所。人をすすめられたときは、その人が立っている名所。
// きろくに影の絵で載り、行くと「めぐったスポット」に入る（昔のドット絵RPGの図鑑の「見た／つかまえた」の2段のしくみ。話を聞くと、行きたい所がふえる）
function heardOf(g, n) {
  const to = g.kind === 'npc' ? placeNpcs().find(x => x.id === g.id) : null, id = to ? 'f-' + to.spot : g.kind === 'spot' ? g.id : null;
  const had = id && (S.heard || {})[id];
  // また すすめられた（同じ人でも別の人でも・選び直しも）ときは、いま すすめた人の いちばん新しい すすめにする（手がかりのページは その人の話に出る）
  if (had) { had.by = n.name; had.byId = n.id; had.t = Date.now(); save(); }
  if (!id || S.visits[id] || had) return '';
  S.heard = { ...(S.heard || {}), [id]: { by: n.name, byId: n.id, t: Date.now() } };
  save();
  return id;
}
// しらべるの手がかりの言い方：人の見た目（npcs.js の look）ごとに2つずつ。どちらを言うかは人ごとに決まっている（id から）。
// 名所の名前だけを入れて、名所についての事実は言わない（見つかる まちメモ は出典つきのもの）
const HINT_SAY = {
  elder: ['{s}に着いたら、よう しらべてみりん。なんか見つかるかもしれんで', '{s}はな、すみずみまで よう見るもんだに'],
  granny: ['{s}へ行ったら、すみっこまで よう見てってね', '{s}に着いたら、あわてんと ゆっくり しらべりんね'],
  man: ['{s}に着いたら、ちょっと しらべてみるといいよ', '{s}は、よう見ると おもしろいもんがあるだに'],
  woman: ['{s}に行ったら、よく見てみて。きっと何か見つかるよ', '{s}に着いたら、まわりも しらべてみりん'],
  kid: ['{s}って、しらべると なんか出てくるんだって！', '{s}に行ったら、たんけんしてみてね！'],
  student: ['{s}は、しらべがいがあるよ', '{s}に着いたら、調べてみなよ。メモしとくといいじゃん'],
  fisher: ['{s}に行ったら、目を こらしてみりん', '{s}に着いたら、よう見ときん。見とるもんが見つけるだに'],
  staff: ['{s}に寄ったら、ぜひ しらべてってくださいね', '{s}に着いたら、まわりも見てみてください'],
  guide: ['{s}に着いたら、ぜひ しらべてみてください。歩いてこそ見つかる話がありますよ', '{s}では、足をとめて よく見てみてください'],
  monk: ['{s}では、心しずかに よう見てごらんなさい', '{s}に着いたら、ゆっくり しらべてごらんなさい'],
};
// おとどけもの：人が次の人をすすめたとき、ときどき「この○○を届けてくれん？」と荷物をあずける（1つずつ・1日3回まで）。
// すすめられた人に話しかけると届けられて +10pt。荷物はどこにでもある物だけ（中身や、その人についての事実は言わない）
// 昔のドット絵RPGの、はじめの町で荷物を あずかって届ける しくみ。人の話で進む、を「人と人をつなぐ」にも
const PARCEL_PTS = 10, PARCEL_DAILY = 3, PARCEL_RATE = 0.5, PARCEL_ITEMS = ['手紙', 'ふろしき包み', '回覧板', 'おすそわけの包み', 'かりていた本'];
function giveParcel(n, toId) {
  const to = placeNpcs().find(x => x.id === toId), day = dayState();
  if (!to || S.parcel || (day.parcels || 0) >= PARCEL_DAILY || Math.random() >= PARCEL_RATE) return null;
  day.parcels = (day.parcels || 0) + 1;
  S.parcel = { from: n.id, fromName: n.name, to: to.id, toName: to.name, item: PARCEL_ITEMS[Math.floor(Math.random() * PARCEL_ITEMS.length)], t: Date.now() };
  save();
  track('parcel_give', { from: n.id, to: to.id, mode: demo ? 'play' : 'walk' });
  return S.parcel;
}
function deliverParcel(n) {
  const p = S.parcel;
  S.parcel = null;
  S.log.unshift({ type: 'parcel', t: Date.now(), pts: PARCEL_PTS, name: `おとどけもの：${p.fromName}から${n.name}へ`, icon: '📦' });
  const lvUp = gainPoints(PARCEL_PTS);
  save();
  track('parcel_done', { from: p.from, to: n.id, mins: Math.round((Date.now() - p.t) / 60000), mode: demo ? 'play' : 'walk' });
  return `📦 ${n.name}「${p.fromName}から${p.item}？ わざわざ ありがとうね」 +${PARCEL_PTS}pt${lvUp ? `　🎉 Lv${lvUp}` : ''}`;
}
function hintSay(n, name) {
  if (n.hint) return n.hint.replace('{s}', () => name);   // 目立つ人は、その人だけの言い方（npcs.js の hint。その人の仕事・好みに たとえるだけで、事実は言わない）
  const list = HINT_SAY[n.look] || HINT_SAY.man, h = [...String(n.id)].reduce((a, c) => a + c.charCodeAt(0), 0);
  return list[h % list.length].replace('{s}', () => name);
}
// 生きもの手帳：歩く地図の田んぼ・水べで、ときどき生きものに出会う（pixel.js の critterStep）。はじめて出会うと手帳に載って +10pt。1日5回まで。
// ふつうは、どこの田んぼ・川・海べりでも見られるものの場面のひとことだけ（豆知識は書かない）。
// 西尾ならではの生きもの（note のあるもの）は、出典（src）で確かめた事実だけを note に書き、手帳に出典といっしょに出す。
// where：paddy 田んぼ／water 川・池・海の水べ／higata 水べのうち、一色干潟（衣崎海岸）・トンボロ干潟から1.5km以内。months：出る月（ないときは1年じゅう）
// at：出る干潟をしぼる（出典の範囲の干潟だけ。IBA の範囲は一色・吉良までで、幡豆のトンボロ干潟は入らない）
// IBA：日本野鳥の会「重要野鳥生息地（IBA）矢作川河口」（矢作川の河口と、矢作古川の河口沖に広がる一色の干潟。西尾市・碧南市にまたがる）
// 昔のドット絵RPGの「草むらを歩くと出会う」しくみ
const IBA_SRC = 'https://ftp.wbsj.org/nature/hogo/others/iba/search/sites/toukai-cyubu/imgs/JP109.pdf';
const CRITTERS = [
  { id: 'sagi', name: 'サギ', where: 'paddy', say: '田んぼで、白いサギが じっと えものを ねらっとる。' },
  { id: 'kaeru', name: 'カエル', where: 'paddy', months: [4, 5, 6, 7, 8, 9], say: 'あぜから、カエルが ぴょんと はねた。' },
  { id: 'tonbo', name: '赤トンボ', where: 'paddy', months: [8, 9, 10], say: '赤トンボが、すいーっと 目の前を とんでいった。' },
  { id: 'kamo', name: 'カモ', where: 'water', say: '水の上を、カモが すいすい およいどる。' },
  { id: 'sakana', name: '魚', where: 'water', months: [4, 5, 6, 7, 8, 9, 10], say: '水の中で、魚が ぱしゃっと はねた。' },
  { id: 'kani', name: 'カニ', where: 'water', months: [5, 6, 7, 8, 9, 10], say: '水べの石のあいだを、小さなカニが よこ歩きしとる。' },
  { id: 'keri', name: 'ケリ', where: 'paddy', say: '田んぼから、鳥が「ケリリッ」と鳴きながら とびあがった。',
    note: '矢作川の河口は、ケリの大切なすみかとして「重要野鳥生息地（IBA）」に選ばれとる。', src: IBA_SRC },
  { id: 'seitaka', name: 'セイタカシギ', where: 'higata', at: ['f-koromozaki'], say: '干潟を、足の長い白黒の鳥が すっすっと歩いとる。',
    note: '2017年には、一色町の竹生新田で繁殖したセイタカシギの数が、国内でいちばん多かったと記録されとる（重要野鳥生息地 IBA の資料）。', src: IBA_SRC },
  { id: 'suzugamo', name: 'スズガモ', where: 'higata', at: ['f-koromozaki'], months: [11, 12, 1, 2, 3], say: '沖のほうに、白と黒のカモが たくさん うかんどる。',
    note: '矢作川の河口は、スズガモが たくさん集まる所として「重要野鳥生息地（IBA）」に選ばれとる。', src: IBA_SRC },
  { id: 'asari', name: 'アサリ', where: 'higata', months: (EVENTS.find(e => e.id === 'shiohigari') || {}).months || [3, 4, 5], say: '干潟の砂に、貝の小さな穴を見つけた。潮干狩りの季節だね。' },
];
const CRITTER_DAILY = 5, CRITTER_PTS = 10, HIGATA = ['f-koromozaki', 'f-tombolo'];
const WHERE_NAME = { paddy: '田んぼ', water: '水べ', higata: '干潟' };
// いま ここ（田んぼ・水べ）で会える生きもの（季節・干潟の近く）
function critterPool(where) {
  const m = new Date().getMonth() + 1;
  const nearIds = where === 'water' ? spots.filter(s => HIGATA.includes(s.id) && dist(me, s) < 1500).map(s => s.id) : [];
  const higata = c => c.where === 'higata' && nearIds.some(id => !c.at || c.at.includes(id));
  return CRITTERS.filter(c => (c.where === where || higata(c)) && (!c.months || c.months.includes(m)));
}
// のこりの数（pixel.js の critterCount）：いま ここで会えるうち、まだ手帳にない数。その日の出会いが おわっていたら null
function critterLeft(where) {
  if ((dayState().critters || 0) >= CRITTER_DAILY || !me) return null;
  const ok = critterPool(where), book = S.critters || {};
  return { left: ok.filter(c => !book[c.id]).length, all: ok.length };
}
function meetCritter(where) {
  const day = dayState();
  if ((day.critters || 0) >= CRITTER_DAILY || !me) return null;
  const ok = critterPool(where);
  if (!ok.length) return null;
  const book = S.critters || (S.critters = {}), fresh = ok.filter(c => !book[c.id]);
  const pool = fresh.length && Math.random() < 0.6 ? fresh : ok;   // まだ手帳にないものに出会いやすく
  return critterMet(pool[Math.floor(Math.random() * pool.length)]);
}
// 水べで じっと見る（pixel.js の waterWatch）：1日2回まで、水の生きものに出会う（歩いて出会う 1/40 の運を待たずに）
const WATCH_DAILY = 2;
const watchOpen = () => (dayState().watch || 0) < WATCH_DAILY && (dayState().critters || 0) < CRITTER_DAILY && !!me;
function watchWater() {
  if (!watchOpen()) return null;
  const m = meetCritter('water');
  if (m) { const day = dayState(); day.watch = (day.watch || 0) + 1; save(); track('water_watch', { critter: m.id, mode: demo ? 'play' : 'walk' }); }
  return m;
}
function critterMet(c) {
  const book = S.critters, first = !book[c.id], day = dayState();
  day.critters = (day.critters || 0) + 1;
  book[c.id] = { n: (book[c.id] ? book[c.id].n : 0) + 1, first: book[c.id] ? book[c.id].first : Date.now() };
  if (first) { gainPoints(CRITTER_PTS); S.log.unshift({ type: 'critter', t: Date.now(), pts: CRITTER_PTS, name: `生きもの手帳：${c.name}`, icon: '🐾' }); badgesSoon(); }   // そろったら賞状
  save();
  track('critter_meet', { critter: c.id, first, mode: demo ? 'play' : 'walk' });
  if (!meetShow(c, first)) toast(`🐾 ${c.say}${first ? `　📗 生きもの手帳に「${c.name}」 +${CRITTER_PTS}pt${c.note ? '（西尾の話つき）' : ''}` : ''}`);
  return c;
}
// 出会いの場面（昔のドット絵RPGの、敵に出会ったときのしくみ）：画面が2回 ちかっと光り、黒いウィンドウに 生きものの絵と、1文字ずつ出る ことば。
// 歩く地図を見ているときだけ（ごほうびの画面が出ているときは、いつもの知らせ）。タップで文字を全部出す・もう一度で閉じる。読み終えて3秒で閉じる
function meetShow(c, first) {
  const box = $('meetBox'), P = window.nishioPixel, spr = P && P.critterSprite(c.id);
  if (!box || !spr || !document.body.classList.contains('px') || rewardBusy()) return false;
  const x = $('meetArt').getContext('2d');
  x.clearRect(0, 0, 16, 16); x.drawImage(spr, 0, 0);
  const text = [`${c.name}に であった！`, c.say, ...(first ? [`📗 生きもの手帳に「${c.name}」 +${CRITTER_PTS}pt${c.note ? '（西尾の話つき）' : ''}`] : [])].join('\n'), chars = [...text];
  const m = meetShow.m = { n: 0, chars, done: false };
  clearInterval(meetShow.iv); clearTimeout(meetShow.t);
  $('meetText').textContent = '';
  document.body.classList.remove('meet-flash'); void document.body.offsetWidth; document.body.classList.add('meet-flash');
  sound.jingle('eye');
  setTimeout(() => {
    box.hidden = false;
    meetShow.iv = setInterval(() => { if (meetShow.m !== m) return; m.n++; meetType(m); }, 45);
  }, 420);   // 光りおわってから
  return true;
}
function meetType(m) {
  $('meetText').textContent = m.chars.slice(0, m.n).join('');
  if (m.n < m.chars.length) return;
  clearInterval(meetShow.iv); m.done = true;
  meetShow.t = setTimeout(meetHide, 3000);
}
function meetHide() { clearInterval(meetShow.iv); clearTimeout(meetShow.t); meetShow.m = null; $('meetBox').hidden = true; }
$('meetBox').addEventListener('click', () => { const m = meetShow.m; if (!m) return meetHide(); if (m.done) meetHide(); else { m.n = m.chars.length; meetType(m); } });
// しらべる：聞いた名所に着いたら、名所の窓の「🔍 しらべる」で、まだ知らない まちメモが1つ見つかる（すすめた人のことば（hintSay）が手がかり）。
// 1か所1回。たからばこと同じく +5pt と まちメモ（昔のドット絵RPGの、何もない所を しらべると見つかる道具のしくみ）
const SEARCH_PTS = 5;
const canSearch = s => { const h = (S.heard || {})[s.id]; return !!h && !h.found; };
// しらべて見つかる まちメモ：名所の窓に出ている説明（s:その名所）と、ムービーで見せる話はのぞき、①その名所の行事 ②その名所の名物・海と大地の話 ③その地区の話 ④同じ地区のほかの名所 の順に、まだ知らないものから
function searchFact(s) {
  const pool = factPool(), fresh = [...pool.keys()].filter(k => !S.facts.includes(k) && k !== `s:${s.id}` && !movieFact(k));   // ムービーで見せる話はのぞく
  const inArea = id => { const x = spots.find(y => y.id === id); return !!x && !!s.area && x.area === s.area; };
  const tiers = [
    k => EVENTS.some(e => k === `e:${e.id}` && evSpotId(e) === s.id),
    k => spotMeibutsu(s).some(m => k.startsWith(`m:${m.id}:`)) || spotShizen(s).some(x => k.startsWith(`z:${x.id}:`)) || spotSangyo(s).some(x => k.startsWith(`g:${x.id}:`)),
    k => !!s.area && k.startsWith(`a:${s.area}:`),
    k => k.startsWith('s:') && inArea(k.slice(2)),
  ];
  for (const t of tiers) { const g = fresh.filter(t); if (g.length) return g[hashStr('search:' + s.id) % g.length]; }
  return pickFact({ id: 'search:' + s.id, lat: s.lat, lng: s.lng, at: s.name });
}
function searchSpot(s) {
  if (!canSearch(s)) return;
  if (!inReach(s)) { toast(`🔍 ${s.name}の近くまで行って しらべよう`); return; }
  S.heard[s.id].found = true;
  const k = searchFact(s), fresh = !!k && !S.facts.includes(k);
  if (fresh) S.facts.push(k);
  const lvUp = gainPoints(SEARCH_PTS);
  S.log.unshift({ type: 'search', t: Date.now(), pts: SEARCH_PTS, name: `しらべた：${s.name}`, icon: '🔍' });
  save();
  track('spot_search', { spot: s.name, mode: demo ? 'play' : 'walk' });
  map.closePopup(); $('pxInfo').hidden = true;
  showReward(SEARCH_PTS, `🔍 ${s.name}を しらべたら 見つかった！`, fresh ? ['📖 まちメモ +1'] : [], lvUp, fresh ? factPool().get(k) : '', null);
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-search]');
  const s = b && spots.find(x => x.id === b.dataset.search);
  if (s) { e.stopPropagation(); searchSpot(s); }
});
// 路地の行き止まり（NetHack の、通路が ぷつっと終わる所を しらべると 隠し扉が見つかる しくみ）：歩く地図で 道が終わる マス（pixel.js の alleyEnd）に
// 入ると、その あたりの まちメモが1つ見つかる（+3pt）。地形そのものが「ここを しらべて」と教える。1マス1回・1日3回まで（ごほうびの画面が出ている間は数えない）
const ALLEY = { pts: 3, daily: 3, keep: 400 };
function alleyFind(x, y, ll) {
  const key = `${x},${y}`, day = dayState();
  if (!Array.isArray(S.alleys)) S.alleys = [];
  if (S.alleys.includes(key) || (day.alleys || 0) >= ALLEY.daily || rewardBusy()) return false;
  S.alleys.push(key); if (S.alleys.length > ALLEY.keep) S.alleys.shift();
  day.alleys = (day.alleys || 0) + 1;
  const k = pickFact({ id: 'alley:' + key, lat: ll.lat, lng: ll.lng }), fresh = !!k && !S.facts.includes(k);
  if (fresh) S.facts.push(k);
  const lvUp = gainPoints(ALLEY.pts);
  S.log.unshift({ type: 'alley', t: Date.now(), pts: ALLEY.pts, name: '路地の行き止まりを しらべた', icon: '🔍' });
  save(); badgesSoon();   // 路地はかせ
  track('alley_find', { fresh, mode: demo ? 'play' : 'walk' });
  showReward(ALLEY.pts, '🔍 路地の行き止まりを しらべたら 見つかった！', fresh ? ['📖 まちメモ +1'] : [], lvUp, fresh ? factPool().get(k) : '', null);
  return true;
}
// 金の米つぶ（pixel.js の 地図の めいろ）：行き止まりに おちている。ひろうと +2pt、きょう 10こごとに +20pt。
// ひろった つぶは S.mzGrainGot（key は「日本の 日の 番号:マス」。つぶの 場所と 同じく 日本の 日づけで かわる。端末の 時間帯が 日本で なくても ずれない）
const MZ_GRAIN = { pts: 2, every: 10, bonus: 20 };
function mzGrainGot() {   // きょう（日本の 日づけ）ひろった つぶ
  const p = Math.floor((Date.now() + 9 * 3600e3) / 86400e3) + ':';
  if (!Array.isArray(S.mzGrainGot) || S.mzGrainGot.some(k => !k.startsWith(p))) S.mzGrainGot = (S.mzGrainGot || []).filter(k => k.startsWith(p));
  return S.mzGrainGot;
}
function mzShoo() {   // めいろで、かかしを こわがった カラスを おいはらった
  const lvUp = gainPoints(MZ_SHOO_PTS);
  if (lvUp) toast(`⭐ レベル${lvUp}！`);
  save();
  track('maze_shoo', {});
  return { pts: MZ_SHOO_PTS };
}
function mzGrain(key) {
  const got = mzGrainGot();
  if (got.includes(key)) return null;
  got.push(key);
  const n = got.length, bonus = n % MZ_GRAIN.every === 0 ? MZ_GRAIN.bonus : 0, pts = MZ_GRAIN.pts + bonus;
  const lvUp = gainPoints(pts);
  if (bonus) S.log.unshift({ type: 'grain', t: Date.now(), pts: MZ_GRAIN.every * MZ_GRAIN.pts + bonus, name: `金の米つぶを ${n}こ ひろった`, icon: '🌾' });   // きろくは 10こごとに まとめて（1こずつだと 最近のポイントが うまる）
  const msg = bonus ? `🌾 金の米つぶ きょう ${n}こ！ ボーナス +${bonus}pt` : n === 1 ? '🌾 金の米つぶ：めいろの 行き止まりに おちているよ（毎日 かわる）' : '';
  if (msg || lvUp) toast(`${msg}${lvUp ? `${msg ? ' ' : ''}⭐ レベル${lvUp}！` : ''}`);
  save();
  track('maze_grain', { n });
  return { n, pts };
}
// イベント「ドット絵ムービー」（movie.js）：西尾の海と大地の話（shizen.js）は、文で ばらばらに出すのではなく、ゆかりの名所に着いたときに ムービーで見せる。
// 最後まで見ると、その話が まちメモ に残る。途中で閉じたら、次に着いたとき（名所の窓の「📽️ ムービー」からも）また見られる
const movieOf = s => (window.NISHIO_MOVIE && s ? NISHIO_MOVIE.movieAt(s.id, s.area) : null);
function movieCheck(s) {
  const m = movieOf(s);
  if (!m || (S.movies || []).includes(m.id) || s.shop) return;
  movieWhenFree(m.id);
}
// ごほうびの画面・人の話・ミニゲーム・殿堂入りの画面が出ている間は待ってから（予約したときの記録が切りかわったら やめる）
function shopAfter(s, key = stateKey(), t0 = Date.now()) {   // 当店でチェックインしたあと：ごほうびが閉じたら、当店の窓を出す（ほかの窓を開いた・30秒すぎた ときは出さない）
  (function go() {
    if (stateKey() !== key || !$('pxInfo').hidden || Date.now() - t0 > 30000) return;
    if (rewardBusy() || document.body.classList.contains('jump-open')) return setTimeout(go, 600);
    if (document.body.classList.contains('px')) { $('pxInfoBody').innerHTML = popupHtml(s); $('pxInfo').hidden = false; }
    else markers.get(s.id)?.openPopup();
  })();
}
function movieWhenFree(id, key = stateKey()) {
  if (movieWhenFree.wait) return;
  movieWhenFree.wait = true;
  function go() {
    if (stateKey() !== key) { movieWhenFree.wait = false; return; }
    if (rewardBusy() || !$('pxInfo').hidden || document.body.classList.contains('jump-open') || medashiOpen() || document.querySelector('[role="dialog"]:not([hidden])')) return setTimeout(go, 600);   // イベントの窓（.medashi）・シェア（ごほうびの「📣 シェア」から開く）などの ダイアログが 開いている 間も 待つ
    movieWhenFree.wait = false; playMovie(id);
  }
  setTimeout(go, 50);   // チェックインの とちゅうで よばれる：そのあと 出す ごほうびの 窓を 待つ（すぐ 調べると まだ ごほうびが なく、ムービーが ごほうびと「🏁 ゴール！」の 上に 出て かくしていた）
}
function playMovie(id) {
  if (!window.NISHIO_MOVIE) return;
  map.closePopup(); $('pxInfo').hidden = true;
  track('movie_play', { movie: id, mode: demo ? 'play' : 'walk' });
  NISHIO_MOVIE.play(id, movieEnd);
}
function movieEnd(m, done) {
  if (!done) return;
  if (!(S.movies || []).includes(m.id)) S.movies = [...(S.movies || []), m.id];
  const pool = factPool(), got = m.facts.filter(k => pool.has(k) && !S.facts.includes(k));
  got.forEach(k => S.facts.push(k));
  save();
  toast(`📽️ ${m.title}${got.length ? `　📖 まちメモ +${got.length}` : ''}`);
  renderLog();
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-movie]');
  if (b) { e.stopPropagation(); playMovie(b.dataset.movie); }
});
// めぐったスポットが区切りの数（PRAISE_AT）になったら、西尾城跡のガイドさんが ほめて、いまいる地区のほかで、めぐった割合がいちばん低い地区をすすめる
const PRAISE_AT = [5, 10, 20, 30, 50, 100];
function praiseCheck(at) {
  const n = Object.keys(S.visits).length;
  if (!PRAISE_AT.includes(n) || (S.praised || []).includes(n)) return;
  S.praised = [...(S.praised || []), n];
  const who = (window.NISHIO_NPCS || []).find(x => x.id === 'castle-guide');
  const open = areas.map(a => ({ a, p: areaProgress(a.id) })).filter(x => x.p.total > x.p.done).sort((x, y) => x.p.done / x.p.total - y.p.done / y.p.total || (y.p.total - y.p.done) - (x.p.total - x.p.done));
  const left = open.find(x => x.a.id !== at) || open[0];
  setTimeout(() => toastAfter(`📜 ${who ? who.name : 'ガイドさん'}「もう${n}か所もめぐったじゃん！${left ? `つぎは${left.a.name}${left.a.id === at ? 'の まだ行っとらん所' : 'のほう'}も歩いてみりん。まだ${left.p.total - left.p.done}か所あるに」` : 'たいしたもんだに」'}`), 1200);   // バッジの知らせ（チェックインの0.8秒あと）が出てから、そのあとに
}
function setGuide(g) {
  S.guide = g ? { ...g, t: Date.now() } : null;
  if (g) S.guides = (S.guides || 0) + 1;
  save();
  renderGuide();   // 人の話で行き先が変わったら、話の窓が開いているあいだも 下の行き先の札をすぐ書きかえる
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
  if (!fixOk()) return;   // GPS の精度が悪い位置からは決めない（ほかの決め直しと同じ）
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
  // 地図の めいろでは、すすめる範囲の 1.5倍より 遠い 行き先（めいろの 前に 人に すすめられた 遠くの 人など）は 決め直す
  // （めいろの 道は ゴールから いちど はなれる ことも あるので、すすめる範囲 ちょうどでは 決め直さない。自分で 選んだ 行き先は そのまま）
  const farLimit = mazeNow() && !g.mine ? GUIDE_RANGE.play * 1.5 : g.refer ? GUIDE_FAR : GUIDE_RANGE[demo ? 'play' : 'walk'] * 2;
  if (dist(me, g) > farLimit && fixOk()) { setGuide(decideGuide(null)); return; }
  if (g.kind === 'npc') return;
  if (dist(me, g) > guideRadius(g) || !fixOk()) return;
  const pts = guideReward(g);
  const next = decideGuide(null);
  setGuide(next);
  // 文字を少なく（ふだん）：次の行き先は下の札に出るので、知らせは「着いた・ポイント・次の名前」だけ
  toast(simple() ? `${g.byId ? '🎉' : '🧭'} ${g.name}${pts ? ` +${pts}pt` : ''}${next ? `　→ ${next.name}` : ''}`
    : `${g.byId ? '🎉 イベント達成：' : '🧭 '}${g.name}に着いた${pts ? ` +${pts}pt` : ''}${next ? `　→ ${next.why}` : ''}`);
  rivalSay(g, next);
}
// さんぽ仲間（ライバル）：行き先（名所・すすめられた人）に3回着くごとに1回、同じくらいの年の さんぽ好きが先に来ていて、次の行き先へ先回りする。
// その行き先に着くと、また会える（昔のドット絵RPGの、先々で待っているライバルのしくみ）。g.name は着いた所の名前
const RIVAL = 'さんぽ仲間のソウタ';
// ライバルが先回りしている所（歩く地図に立たせる：pixel.js）。名所ならその名所、人ならその人のそば
function rivalWhere() {
  const at = S.rival && S.rival.at;
  if (!at) return null;
  const s = spots.find(x => x.id === at), n = !s && placeNpcs().find(x => x.id === at);
  const p = s || (n && { lat: n.lat, lng: n.lng, name: n.spotName });
  return p ? { at, lat: p.lat - 14 / 111320, lng: p.lng - 14 / (111320 * Math.cos(p.lat * Math.PI / 180)), name: p.name } : null;   // 少し南西にずらして、名所の絵や人と重ならないように
}
function rivalSay(g, next) {
  const met = S.rival && S.rival.at === g.id;
  S.rivalN = (S.rivalN || 0) + 1;
  const go = !!next && S.rivalN % 3 === 0;
  const to = next && (next.kind === 'npc' ? (placeNpcs().find(x => x.id === next.id) || {}).spotName || next.name : next.name);   // 人のときは、その人がいる所
  S.rival = go ? { at: next.id } : null;
  save();
  if (met) toastAfter(`🏃 ${RIVAL}「おそかったじゃん！ ${g.name}、いい所だら。${go ? `おれは次、${to}へ行くでね` : 'またね'}」`);
  else if (go) toastAfter(`🏃 ${RIVAL}「${g.name}は もう見たじゃん！ おれは先に${to}へ行っとるでね」`);
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
  S.guide = { ...keep(a), byId: a.byId || g.byId, mine: true, alts: [keep(g), ...g.alts.filter((_, k) => k !== i).map(keep)], t: Date.now() };   // 前の行き先も候補に残す（戻せる）
  // 人のすすめの中から選び直したときも、その人から聞いた名所にする（きろくの影の絵と、その人の話の 🔍 の手がかり）
  const by = S.guide.byId && placeNpcs().find(n => n.id === S.guide.byId);
  if (by) heardOf(S.guide, by);
  save();
  $('guide').classList.remove('open');
  renderGuide();
  toast(`🧭 行き先を「${a.name}」にした`);
  track('guide_pick', { kind: a.kind, mode: demo ? 'play' : 'walk' });
}
// 行き先の名所のドット絵（歩く地図と同じ絵）。人が行き先のときは出さない
const thumbCache = new Map();
function guideThumb(g) {
  if (g.kind === 'npc') return '';
  return spotThumb(spots.find(x => x.id === g.id));
}
function spotThumb(sp) {
  if (!sp || !window.nishioPixel || !nishioPixel.spriteOf) return '';
  if (!thumbCache.has(sp.id)) { try { const c = nishioPixel.spriteOf(sp); thumbCache.set(sp.id, c ? c.toDataURL() : ''); } catch (e) { thumbCache.set(sp.id, ''); } }
  const u = thumbCache.get(sp.id);
  return u ? `<img class="gthumb" src="${u}" alt="" width="28" height="28"/>` : '';
}
function renderGuide() {
  const el = $('guide');
  const g = guideTarget();
  if (!g || !me) { el.hidden = true; return; }
  el.hidden = false;
  // 2行に収める（1行目：行き先と方角・距離、2行目：だれの話か。長い話は「…」。タップで全文）
  const alts = (S.guide && S.guide.alts) || [];
  const mr = demo && window.nishioPixel && nishioPixel.maze && nishioPixel.maze.route ? nishioPixel.maze.route() : null;   // 地図の めいろ：まっすぐ ではなく めいろの 道のり
  const far = mr ? `🌀${fmtM(mr.m)}` : fmtM(dist(me, g));   // 🌀：めいろの 道のり（名前が 長くても 入るように みじかく）
  const gname = `<em class="gn">${mr ? '🏁 ' : ''}${esc(g.name)}</em>`;   // めいろの ときは 行き先が ゴール（地図の 🏁 と おなじ しるし）。長い 名前は こちらを「…」に して 道のりは のこす
  const dir = bearing(me, g), head = simple() && window.NSG_ICONS ? `${NSG_ICONS.arrow(dir)}${guideThumb(g)}${g.byId ? PIA('scroll', 'イベント') : ''} ${gname}<span>　${far}</span>` : `${g.byId ? '📜' : '🧭'} ${gname}<span>　${dir}へ ${far}</span>`;
  el.innerHTML = `<b>${head}</b><small>${esc(g.mine ? '自分で選んだ行き先' : g.by)}「${esc(g.why)}」</small>`
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
  const SEASON_PI = { winter: 'snowman', spring: 'sakura', summer: 'sunflower', autumn: 'momiji' }, WX_PI = { sunny: 'sun', cloudy: 'cloud', rain: 'rain', snow: 'snow' };
  el.innerHTML = (simple()   // 文字を少なく（ふだん）：日付と、季節・天気の絵だけ（タップでくわしく）
    ? `<b>${now.getMonth() + 1}/${now.getDate()} ${PI(SEASON_PI[se.id] || '', se.name)}${wx && WX_PI[wx.kind] ? PI(WX_PI[wx.kind], wx.name) : ''}</b>`
    : `<b>${now.getMonth() + 1}/${now.getDate()}（${WEEKDAY(now)}）${se.icon}${wx ? wx.icon : ''}${where ? `　📍${esc(where)}` : ''}</b>`)
    + (simple() ? koyomiPic(now, sk, p, hs, wx, se, pc, SEASON_PI) : `<span class="more">${esc(KO.line(now))}${wxShort}${pc.city ? `<br>📍 ${esc(pc.city)}${pc.town ? ' ' + esc(pc.town) : ''}` : ''}<br>${esc(sk.name)}：${esc(sk.desc)}<br>${p.icon} ${esc(p.desc)}`
    + (hs.length ? `<br>見ごろ：${hs.map(h => `${h.icon}${esc(h.name)}`).filter((v, i, a) => a.indexOf(v) === i).join('・')}` : '')
    + (KO.doyoUshi(now) ? '<br>🐟 きょうは土用の丑の日' : '') + wxLong + '</span>');
  el.hidden = false;
}
// 文字を少なく（ふだん）：こよみを開いたときも絵が主役。田んぼの1年と天気は Blender で作った絵（tools/blender/pixel-art.py）。くわしい説明は「文字を多く」で
const PADDY_ART = new Set(['stubble', 'soil', 'flooded', 'green', 'gold']), WX_ART = new Set(['sunny', 'cloudy', 'rain', 'snow']);
function koyomiPic(now, sk, p, hs, wx, se, pc, SEASON_PI) {
  const art = (src, alt) => `<img class="ko-art" src="nishio-go/art/${src}.png" alt="${esc(alt)}" width="48" height="48"/>`;
  const cells = [
    PADDY_ART.has(p.tile) ? `<span class="ko-cell">${art('paddy-' + p.tile, p.name)}<b>${esc(p.name)}</b></span>` : '',
    wx && WX_ART.has(wx.kind) ? `<span class="ko-cell">${art('wx-' + wx.kind, wx.name)}<b>${wx.temp !== null ? `${Math.round(wx.temp)}℃` : esc(wx.name)}</b></span>` : '',
    `<span class="ko-cell">${PI(SEASON_PI[se.id] || 'calendar', se.name)}<b>${esc(sk.name)}</b></span>`,
  ].join('');
  const seen = hs.map(h => `${h.icon}${esc(h.name)}`).filter((v, i, a) => a.indexOf(v) === i);
  return `<span class="more ko-pic"><span class="ko-cells">${cells}</span>`
    + (seen.length || KO.doyoUshi(now) ? `<span class="chips">${seen.map(x => `<span>${x}</span>`).join('')}${KO.doyoUshi(now) ? '<span>🐟 土用の丑</span>' : ''}</span>` : '')
    + (pc.city ? `<span class="ko-where">${PIA('pin', '')}${esc(pc.city)}${pc.town ? ' ' + esc(pc.town) : ''}</span>` : '')
    + (wx ? '<small>天気の出典：気象庁（アメダス・天気予報）</small>' : '') + '</span>';
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
    setStatus(gpsError ? esc(gpsError) + (demo ? '' : RESCUE_BTN('geo')) + waitLine() : (demo ? '地図をタップすると、その場所へ移動します。' : '位置情報を待っています…' + waitLine()), true);
    return;
  }
  if (bagDone()) openBagSoon();   // 歩き終えた袋が開いていない（モードを切り替えた・閉じた など）：ここで開く
  const wt = weekTheme(), wk = String(weekNo());
  if (welcomeDue() || firstPick || rewardBusy()) { /* はじめての人は「🎁 すぐ近くに たからばこ！」を読んでもらう：ようこそ たからばこ を開けて、はじめの1枚を えらんで、ごほうびを閉じてから、週の知らせを出す */ }
  else if (store.get('nsg_started', false) && store.get('nsg_theme_wk', '') !== wk) {   // 週に1回：今週のテーマと、先週のまとめ
    store.set('nsg_theme_wk', wk);
    const lw = lastWeekStat();
    setTimeout(() => toastAfter(simple() ? `${wt.icon} 今週は「${wt.name}」で ポイント2倍` : `${wt.icon} 今週は「${wt.name}」の週！ ${wt.name}でチェックインすると ポイント2倍・おみやげ袋${lw ? `（先週は ${fmtM(lw.m)}・新しい絵 ${lw.dots}枚）` : ''}`), 2500);
  } else if (kiraHour() && store.get('nsg_started', false) && store.get('nsg_kira_day', '') !== ymd()) { store.set('nsg_kira_day', ymd()); setTimeout(() => toastAfter('✨ いま キラの時間！（土曜の10時台は キラの絵が出やすい）'), 2500); }   // 前の知らせ（はじめの案内など）を上書きしないよう、あとに
  else if (store.get('nsg_started', false) && S.prevToast !== ymd() && prevDayStat()) {   // 日に1回：前回のさんぽ（知らせたかは記録ごと＝モード・版ごとに。知らせることがない日は使わない）
    const p = prevDayStat();
    S.prevToast = ymd(); save();
    setTimeout(() => toastAfter(`👣 ${p.label}のさんぽ：${prevDayText(p)}`), 2500);
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
    const th = simple() ? spotThumb(selected) : '';
    if (th) $('spinIco').innerHTML = th; else if (simple()) $('spinIco').innerHTML = catArt(selected); else $('spinIco').textContent = iconOf(selected);   // 文字を少なく（ふだん）：その名所のドット絵
    $('spinName').textContent = selected.name;
    const why = driving ? '🚗 車を降りるとチェックインできます'
      : !demo && me.acc > CFG.maxAccuracy ? '📡 GPSの精度が上がるのを待っています…' : '';
    btn.disabled = !!why;
    if (why || !simple()) $('spinSub').textContent = why || `タップして +${ptsOf(selected)}pt${S.visits[selected.id] ? '' : '（初訪問ボーナスあり）'}`;
    else $('spinSub').innerHTML = `${PIA('coin', 'ポイント')}+${ptsOf(selected)}${S.visits[selected.id] ? '' : ' ' + PI('new', 'はじめての場所')}`;
  } else {
    btn.hidden = true;
  }

  renderGuide();
  if ((S.sealPicks || []).length) sealPickCheck();   // まだ えらんでいない しるしの2枚（起動したとき・歩く地図にしたときも ここで出る）
  // 画面をすっきりさせるため、案内パネルは1〜2行だけ：気をつけること（車・範囲外・GPS など）があればそれを、なければ まちメモ とクエストの数
  const msgs = [];
  if (driving) msgs.push('🚗 軽トラで移動中（チェックインは降りてから）');
  if (demo && !document.body.classList.contains('px')) msgs.push('🎮 地図をタップして移動');
  else if (!inPlay(me.lat, me.lng)) {
    msgs.push('📍 遊べる範囲（西尾市と となりの市町、本店から15km）の外です' + (demo ? '' : RESCUE_BTN('range')));
    if (!demo && !refreshNearby.outTracked) { refreshNearby.outTracked = true; track('out_of_range', {}); }
  }
  if (!demo && Date.now() < vehicleUntil) msgs.push('🚗 乗り物で移動中：運転している人は操作しないでください（同乗者・電車・バスならそのまま遊べます。歩いた距離のポイントは歩いた分だけ）');
  if (!demo && me.acc > CFG.maxAccuracy) msgs.push(`📡 GPSの誤差が大きめです（約${Math.round(me.acc)}m）`);
  if (!selected && !guideTarget()) {
    if (nearest) msgs.push(`いちばん近いスポット：<b>${esc(nearest.name)}</b>（${fmtM(nearestD)}）`);
    else if (spotsLoading && !spots.length) msgs.push('スポットを読み込んでいます…');
    else if (!spots.length) msgs.push('スポットがありません。「せってい」から再読み込みしてください。');
  }
  // めぐりの れんさ：つながっている間は、文字を少なく（ふだん）でも のこり時間を出す（次の名所に間に合うか分かるように）
  const cl = chainLeft(), h1 = dayState().h100, chain = [cl ? `${simple() ? PIA('compass', 'めぐりの れんさ') : '🔗'} ${S.chain.n >= 2 ? `れんさ <b>${S.chain.n}</b> のこり${Math.ceil(cl / 60000)}分` : `のこり${Math.ceil(cl / 60000)}分で 次の名所 → れんさ`}` : '',   // 1か所目は まだ つながっていないので「次の名所で れんさ」
    h1 && !h1.done ? `${simple() ? PIA('feet', '100歩たんけん') : '👣'} たんけん <b>${h1.steps}</b>/100` : ''].filter(Boolean).join('　');   // 100歩たんけんの とちゅうも（何歩目か）
  if (!msgs.length && simple()) { setStatus(chain, true); return; }   // 文字を少なく（ふだん）：気をつけることがないときは、下のパネルは行き先の札だけ（数は きろく・とくてん に）
  if (!msgs.length) {
    const qd = todaysQuests().filter(q => dayState().done.includes(q.id)).length, bl = bagLine();
    const bag = bl ? (simple() ? `　${PIA('bag', 'おみやげ袋')} <b>${bl.done}</b>/${bl.b.km}km` : `　🎒 袋 <b>${bl.done}</b>/${bl.b.km}km`) : '';
    msgs.push((simple() ? `${PIA('book', 'まちメモ')} <b>${knownFacts()}</b>　${PIA('scroll', '今日のクエスト')} <b>${qd}</b>/3` : `📖 まちメモ <b>${knownFacts()}</b>　📜 クエスト <b>${qd}</b>/3`) + bag + (chain ? '　' + chain : ''));
  } else if (chain) msgs.push(chain);
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
// こえ：この端末で送ったおたより（受付番号つき）と、nishio-go/voices.json の返事。バッジ（まちづくりの仲間）でも使うので、ここで先に用意する
const fbMine = () => { const m = store.get('nsg_fb_mine', []); return Array.isArray(m) ? m.filter(x => x && /^[0-9a-f]{12}$/.test(x.rid)) : []; };
const voice = { data: null, at: 0 };
const replyOf = rid => (voice.data && voice.data.replies && voice.data.replies[rid]) || null;
const voicesReflected = () => fbMine().filter(m => (replyOf(m.rid) || {}).s === 'reflected').length;
// おたより手帳の数（この端末だけ）：sent 送ったおたより・react ひとこと・themes 答えたお題・wk 答えた週
const fbStats = () => { const x = store.get('nsg_fb_stats', null) || {}; return { sent: x.sent | 0, react: x.react | 0, themes: x.themes | 0, wk: Array.isArray(x.wk) ? x.wk : [] }; };
const fbStatsAdd = f => { const x = fbStats(); f(x); x.wk = x.wk.slice(-60); store.set('nsg_fb_stats', x); };
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
    { id: 'bookev', i: '📖', n: '西尾の歴史はかせ', d: '「本のできごと」を ぜんぶ見る（本に出てくる場所へ行くと起きる）', cur: (S.bookEv || []).length, goal: (window.NISHIO_BOOKEV && NISHIO_BOOKEV.EVENTS.length) || 9 },
    { id: 'oldmap', i: '🗺️', n: '明治の村あつめ', d: '「古い地図」のイベントで、明治39年ごろの村を ぜんぶ見つける', cur: (S.oldmap || []).length, goal: (window.NISHIO_OLDMAP && NISHIO_OLDMAP.VILLAGES.length) || 11 },
    { id: 'critterall', i: '📜', n: '生きもの手帳の賞状', d: `生きもの手帳の${CRITTERS.length}しゅるい ぜんぶに出会う（季節で出るものもあるので、1年かけて）`, cur: CRITTERS.filter(c => (S.critters || {})[c.id]).length, goal: CRITTERS.length },
    { id: 'clear', i: '👑', n: '殿堂入り', d: '5つの地区のしるしを集めて、西尾城跡のガイドさんに会う（クリア）', cur: S.cleared ? 1 : 0, goal: 1 },
    ...areas.filter(a => SEAL_BY[a.id] && (!SEAL_POST.has(a.id) || S.cleared)).map(a => {   // となりの市町のしるしは、クリアしてから出す   // 地区のしるし：その地区を5か所めぐると、地区の人が認めてくれる（制覇の手前の目標）
      const p = areaProgress(a.id), goal = Math.min(SEAL_AT, Math.max(p.total, 1)), by = sealBy(a.id);
      return { id: 'seal-' + a.id, i: '🔖', n: `${a.name}のしるし`, d: `${a.name}の注目スポットを${goal}か所めぐって、${by ? by.name : '地区の人'}に認めてもらう`, cur: p.done, goal, ready: (S.seals || []).includes(a.id) };   // 数がそろっても、その人と話すまでは もらえない
    }),
    ...areas.map(a => {
      const p = areaProgress(a.id);
      return { id: 'area-' + a.id, i: a.icon || '🗾', n: `${a.name}制覇`, d: `${a.name}の注目スポット${p.total}か所すべて`, cur: p.done, goal: Math.max(p.total, 1), ready: spotMeta.loaded && p.total > 0 };
    }),
    { id: 'walk5', i: '🚶', n: '5kmウォーカー', d: '合計5km歩く', cur: km, goal: 5 },
    { id: 'walk42', i: '🏃', n: 'フルマラソン', d: '合計42.195km歩く', cur: km, goal: 42.195 },
    { id: 'alley10', i: '🔍', n: '路地はかせ', d: '歩く地図で、路地の行き止まりを10か所 しらべる', cur: (S.alleys || []).length, goal: 10 },   // 夜の開発の しくみのバッジ
    { id: 'h100', i: '👣', n: 'たんけん名人', d: '100歩たんけんで、はじめての道を50マス 歩く', cur: S.h100best || 0, goal: 50 },
    { id: 'chain4', i: '🔗', n: 'めぐりの達人', d: '30分以内に つぎの名所へ、4か所つづけて めぐる（めぐりの れんさ 4）', cur: (S.chain && S.chain.best) || 0, goal: 4 },
    { id: 'streak7', i: '📅', n: '1週間つづけた', d: '7日連続でチェックイン', cur: S.streak.max || 0, goal: 7 },
    { id: 'meibutsu', i: '🍵', n: '西尾の名物めぐり', d: `${MB_NISHIO.map(m => m.name).join('・')}にゆかりの場所をそれぞれ訪ねる`, cur: MB_NISHIO.filter(m => m.spots.some(id => S.visits['f-' + id])).length, goal: Math.max(MB_NISHIO.length, 1) },
    { id: 'meibutsu2', i: '🧭', n: 'となりまちの名物めぐり', d: `${MB_NEAR.map(m => m.name).join('・')}にゆかりの場所をそれぞれ訪ねる`, cur: MB_NEAR.filter(m => m.spots.some(id => S.visits['f-' + id])).length, goal: Math.max(MB_NEAR.length, 1), ready: MB_NEAR.length > 0 },
    { id: 'memo10', i: '📖', n: 'まちのものしり', d: 'まちメモを10こ集める', cur: knownFacts(), goal: 10 },
    { id: 'memo50', i: '📚', n: 'まち博士', d: 'まちメモを50こ集める', cur: knownFacts(), goal: 50 },
    { id: 'npc5', i: '💬', n: 'ご近所さん', d: '西尾の人5人と話す', cur: NPC_NISHIO.filter(n => npcMet(n.id)).length, goal: 5 },
    { id: 'npcall', i: '🤝', n: '西尾の顔なじみ', d: `西尾の人${NPC_NISHIO.length}人みんなと話す`, cur: NPC_NISHIO.filter(n => npcMet(n.id)).length, goal: Math.max(NPC_NISHIO.length, 1) },
    { id: 'voice1', i: '📮', n: 'まちづくりの仲間', d: 'あなたのおたよりが ゲームに反映される', cur: voicesReflected(), goal: 1 },
    { id: 'voice3', i: '🏘️', n: 'まちの声の名人', d: 'あなたのおたよりが3つ ゲームに反映される', cur: voicesReflected(), goal: 3 },
    { id: 'react10', i: '💬', n: 'ひとこと名人', d: 'チェックインのあとの ひとこと を10回送る', cur: fbStats().react, goal: 10 },
    { id: 'npcnear', i: '🧭', n: 'となりまちの顔なじみ', d: `となりの市町の人${NPC_NEAR.length}人みんなと話す`, cur: NPC_NEAR.filter(n => npcMet(n.id)).length, goal: Math.max(NPC_NEAR.length, 1), ready: NPC_NEAR.length > 0 },
  ];
}
function checkBadges() {
  const got = new Set(S.badges);
  const fresh = badgeDefs().filter(b => b.ready !== false && b.cur >= b.goal && !got.has(b.id));
  if (fresh.length) {
    fresh.forEach(b => S.badges.push(b.id));
    save();
    toastAfter(`🏅 バッジ獲得：${fresh.map(b => b.i + ' ' + b.n).join('、')}`);   // いま出ている知らせ（生きものに出会った など）が消えてから
    if (fresh.some(b => b.id === 'critterall')) toastAfter(`📜 ${(sealBy('nishio') || {}).name || 'ガイドさん'}「生きもの手帳が ぜんぶ そろったじゃん！ 1年 歩きとおした あかしだに。賞状を おくるでね」`);   // 図鑑がそろったら 賞状（昔のドット絵RPGの しくみ）
  }
  sealHints();
}
// 地区のしるしは、数がそろったら その地区の人に会いに行く（話しかけると talkNpc の sealGive で もらえる）。そろったときに1回だけ知らせる
function sealHints() {
  for (const id of Object.keys(SEAL_BY)) {
    if ((S.seals || []).includes(id) || (S.sealHint || []).includes(id) || !sealReady(id)) continue;
    const a = areas.find(x => x.id === id), by = placeNpcs().find(n => n.id === SEAL_BY[id]);
    if (!a || !by) continue;
    S.sealHint = [...(S.sealHint || []), id]; save();
    toastAfter(`🔖 ${a.name}を${sealGoal(id)}か所めぐった！ ${by.spotName ? `${by.spotName}の` : ''}${by.name}に会いに行くと、${a.name}のしるしが もらえるよ`);
  }
  if (clearReady() && !S.cleared && !S.clearHint) {
    const by = placeNpcs().find(n => n.id === CLEAR_BY);
    S.clearHint = true; save();
    toastAfter(`🏯 5つのしるしが そろった！ ${by ? `${by.spotName ? `${by.spotName}の` : ''}${by.name}` : '西尾城跡のガイドさん'}に会いに行こう`);
  }
}
// クリア（殿堂入り）：5つの地区のしるしを そろえて、西尾城跡のガイドさんに会うと、エンディング（ここまでの さんぽの記録）。そのあとも そのまま遊べる（クリア後は となりの市町へ）
// 昔のドット絵RPGの、町ごとの しるしを集めて 最後に認めてもらい、記録が残るしくみ
const CLEAR_BY = 'castle-guide';
const clearReady = () => SEAL_MAIN.every(id => (S.seals || []).includes(id));
function clearGive(n) {
  if (n.id !== CLEAR_BY || S.cleared || !clearReady()) return false;
  S.cleared = { t: Date.now(), rec: clearRecord() };   // 殿堂入りした時点の記録（あとから見ても変わらないように）
  save();
  track('game_clear', { days: dayN(), spots: Object.keys(S.visits).length, mode: demo ? 'play' : 'walk' });
  const key = stateKey();
  badgesSoon();   // バッジ（殿堂入り）は すぐ。知らせは ごほうびの画面が出ている間は閉じてから出る（toastQ）
  setTimeout(() => endingWhenFree(key), 900);
  return true;
}
// 少しあとでバッジを確かめる（知らせの順番のため）。そのあいだに記録（操作して移動／あるいて移動）が切りかわったら、ここでは確かめない（次の機会に確かめる）
function badgesSoon() {
  const key = stateKey();
  setTimeout(() => { if (stateKey() === key) checkBadges(); }, 800);
}
// ごほうびの画面が出ている・絵の読みこみを待っている・人の話の窓が開いている間は待ってから エンディングを出す（あとから出たごほうびに上書きされないように。ガイドさんのことばを読む前に かぶさらないように）
// 待っている予約は1つだけ（バッジを何回押しても、クリア直後の表示と重なっても、エンディングは1回）。
// 予約したときの記録（操作して移動／あるいて移動）に結びつけ、待っている間に記録が切りかわったら取りやめる
function endingWhenFree(key = stateKey()) {
  const w = endingWhenFree;
  if ($('reward').querySelector('.ending') || stateKey() !== key) return;   // もう出ている・予約した記録から切りかわった
  if (w.key === key) return;   // 同じ記録で もう待っている
  const gen = w.gen = (w.gen || 0) + 1;   // 別の記録の待ちがあれば、新しい予約に置きかえる（古い待ちは次に見たとき終わる）
  w.key = key;
  (function go() {
    if (gen !== w.gen) return;
    if (stateKey() !== key || !S.cleared) { w.key = null; return; }
    if (rewardBusy() || !$('pxInfo').hidden) return setTimeout(go, 500);   // 話の窓（しるしを渡すことば）を読んで閉じてから
    w.key = null; showEnding();
  })();
}
function clearRecord() {
  return { spots: Object.keys(S.visits).length, met: (S.met || []).length, km: Math.floor(S.walked / 100) / 10, dots: (S.dots || []).length, facts: knownFacts(), critters: Object.keys(S.critters || {}).length,
    chain: (S.chain && S.chain.best) || 0, h100: S.h100best || 0, alleys: (S.alleys || []).length };   // 夜の開発の記録（いちばんの れんさ・100歩たんけんの自己ベスト・しらべた行き止まり）
}
function showEnding() {
  const npcs = window.NISHIO_NPCS || [], by = npcs.find(n => n.id === CLEAR_BY);
  const r = (S.cleared && S.cleared.rec) || clearRecord(), when = S.cleared && S.cleared.t ? new Date(S.cleared.t) : null;
  const rows = [
    ...(when ? [['殿堂入りした日', `${when.getFullYear()}/${when.getMonth() + 1}/${when.getDate()}`]] : []),
    ['めぐった名所', `${r.spots}か所`], ['話した人', `${r.met}人`], ['歩いた道のり', `${r.km}km`],
    ['西尾ドット絵', `${r.dots}枚`], ['まちメモ', `${r.facts}こ`], ['生きもの', `${r.critters}しゅるい`],
    ...(r.chain >= 2 ? [['いちばんの れんさ', `${r.chain}か所`]] : []), ...(r.h100 ? [['100歩たんけんの自己ベスト', `${r.h100}マス`]] : []), ...(r.alleys ? [['しらべた路地の行き止まり', `${r.alleys}か所`]] : []),   // 前に殿堂入りした人の記録には ないので、あるものだけ
  ];
  const seals = SEAL_MAIN.map(id => { const a = areas.find(x => x.id === id), p = npcs.find(n => n.id === SEAL_BY[id]); return a ? `<li>🔖 ${esc(a.name)}のしるし <small>${esc(p ? p.name : '')}</small></li>` : ''; }).join('');
  const el = $('reward');
  el.innerHTML = `<div class="rw ending"><div class="big">🏯</div><div class="nm">西尾さんぽ 殿堂入り</div>
    <p class="say">${esc(by ? by.name : 'ガイドさん')}「5つの地区を ぜんぶ歩いてくれたじゃん。あんたは もう 西尾さんぽの名人だに！」</p>
    <ul class="rec">${rows.map(([k, v]) => `<li>${esc(k)} <b>${esc(v)}</b></li>`).join('')}</ul>
    <ul class="seals">${seals}</ul>
    <p class="say">🏃 ${esc(RIVAL)}「おめでとう！ つぎは となりの市町も いっしょに歩こまい」</p>
    ${ED.shops ? `<p class="say">🍚 お米屋さん（らいすぴあ・近藤米穀店）「西尾を歩いてくれて ありがとう。おなかが すいたら、お米を買いに 寄ってってね」</p>
    <p><a class="btn mini line" href="${esc(lineUrl('ending'))}" target="_blank" rel="noopener">LINEで友だち追加（常連さまポイント）</a></p>` : ''}
    <p class="note">このあとも そのまま遊べます。きろく の バッジ「👑 殿堂入り」から、いつでも この記録を見られます</p></div>`;
  toastHold(); el.classList.add('show'); clearTimeout(showReward.t);
}
function sealGive(n) {
  const id = Object.keys(SEAL_BY).find(k => SEAL_BY[k] === n.id), a = id && areas.find(x => x.id === id);
  if (!a || (S.seals || []).includes(id) || !sealReady(id)) return '';
  S.seals = [...(S.seals || []), id];
  const cands = sealCands(id);
  if (cands.length === 2) S.sealPicks = [...(S.sealPicks || []), { area: id, name: a.name, cands }];   // 話の窓を閉じたら 2枚から えらぶ（sealPickCheck）
  save();
  badgesSoon();   // バッジの知らせ
  track('seal_get', { area: id, mode: demo ? 'play' : 'walk' });
  return `🔖 ${n.name}「${a.name}を${sealGoal(id)}か所も歩いてくれたじゃん！ ${a.name}のしるし、持ってってちょう」`;
}
// 地区のしるし：地区ごとに、しるしをくれる人（npcs.js の id）。昔のドット絵RPGの、町ごとに認めてもらって集める しくみ
const SEAL_AT = 5, SEAL_BY = { nishio: 'castle-guide', isshiki: 'sakana-okami', kira: 'kira-history', hazu: 'sangane-hiker', sakushima: 'island-granny',
  // クリア後（殿堂入りのあと）だけ：となりの市町のしるし（昔のドット絵RPGの、クリアすると行ける所が ふえる しくみ）
  okazaki: 'okazaki-castle-guide', anjo: 'anjo-museum-guide', hekinan: 'hekinan-philosophy-guide', takahama: 'takahama-oni-guide', kota: 'kota-shiryokan-guide', gamagori: 'gamagori-takeshima-guide' };
const SEAL_POST = new Set(['okazaki', 'anjo', 'hekinan', 'takahama', 'kota', 'gamagori']);
const SEAL_MAIN = Object.keys(SEAL_BY).filter(id => !SEAL_POST.has(id));
const sealBy = id => (window.NISHIO_NPCS || []).find(n => n.id === SEAL_BY[id]);
const sealGoal = id => Math.min(SEAL_AT, Math.max(areaProgress(id).total, 1));
const sealReady = id => (!SEAL_POST.has(id) || !!S.cleared) && spotMeta.loaded && areaProgress(id).total > 0 && areaProgress(id).done >= sealGoal(id);

/* ---------- 放置（操作して移動だけ）：るすばん強化・おかえり ----------
   ・自分で転がす：いちばんたくさん集まる。たからばこ（ドット絵とまちメモが出る）を自由に探せる
   ・るすばん：アプリを閉じていた間も、主人公が西尾やとなりのまちをさんぽして ポイント・まちメモ・ドット絵 を集めてくる（10分から。上限はふつう4時間）。
     ポイントはレベルが上がるほど多い（1時間に 60＋レベル×6）。遊んでいる間ほどは集まらないが、閉じていてもゼロにはならない
   ・ポイントで「るすばん強化」：るすばん中に集まるポイントを多く／るすばんの上限を長く（おまかせ歩きは なくした。運営者の決定 2026年10月） */
const IDLE = { minMin: 10, baseH: 4, napH: 2, ptPerHour: lv => 60 + 6 * lv, maxFacts: 3, dotMin: 120, maxDots: 2,
  ups: [
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
const UP_PI = { bag: 'bag', nap: 'home' };   // るすばん強化の絵（文字を少なく：ふだん）。Blender で作った nishio-go/art/up-<id>.png があるもの
function renderUps() {
  $('upBox').hidden = !demo;
  if (!demo) return;
  const lv = levelOf(S.total), perH = Math.floor(IDLE.ptPerHour(lv) * (1 + 0.5 * upLv('bag')));
  $('upNote').textContent = `🍚 自分で遊ぶ：いちばんたくさん集まり、たからばこ（ドット絵）を自由に探せます。🏠 るすばん：閉じている間も 1時間に約${perH}pt（最大${idleCapH()}時間）と、まちメモ・ドット絵を持ち帰ります。`;
  $('upList').innerHTML = IDLE.ups.map(u => {
    const lv = upLv(u.id), max = lv >= u.cost.length, cost = u.cost[lv];
    if (simple()) return `<li class="up-pic" title="${esc(u.desc)}"><span class="ico">${UP_PI[u.id] ? `<img class="art" src="nishio-go/art/up-${u.id}.png" alt="${esc(u.name)}" width="48" height="48"/>` : PI('up', u.name)}</span><span class="main"><b>${esc(u.name)}</b><span class="lvdots">${u.cost.map((c, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</span></span>`
      + (max ? `<span class="num">${PIA('medal', 'MAX')}</span>` : `<button type="button" class="btn mini" data-up="${u.id}"${S.points < cost ? ' disabled' : ''}>${PIA('coin', 'ポイント')}${cost}</button>`) + '</li>';
    return `<li><span class="ico">${u.icon}</span><span class="main"><b>${esc(u.name)} <small>Lv${lv}/${u.cost.length}</small></b><small>${esc(u.desc)}</small></span>`
      + (max ? '<span class="num">MAX</span>' : `<button type="button" class="btn mini" data-up="${u.id}"${S.points < cost ? ' disabled' : ''}>${cost}pt</button>`) + '</li>';
  }).join('');
}

/* ---------- 画面 ---------- */
function setStatus(html, isHtml) { const el = $('status'); if (isHtml) el.innerHTML = html; else el.textContent = html; el.hidden = !html; }   // 空のときは段ごと隠す

function renderHeader() {
  const lv = levelOf(S.total);
  const lo = needFor(lv), hi = needFor(lv + 1);
  $('lvNum').textContent = lv;
  $('lvFill').style.width = Math.min(100, ((S.total - lo) / (hi - lo)) * 100) + '%';
  $('ptsNum').textContent = S.points.toLocaleString();
  document.querySelectorAll('.mode-sw [data-mode]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.mode === 'demo') === demo)));
}

let toastTimer;
// ごほうびの画面が出ている間の知らせは、画面のいちばん上（着いた所の名前）に重ならないよう、閉じてから1つずつ順に出す（toastQ）
const toastQ = [];
// 同じ知らせが続けて来ても、重ねて出さない（農場のゲームで、同じ知らせが何枚も積み上がって畑が見えなくなったので）
const toastShowing = msg => $('toast').classList.contains('show') && $('toast').textContent === msg;
function toast(msg) {
  const el = $('toast');
  if ($('reward').classList.contains('show') || howtoOpen()) { if (!toastQ.includes(msg)) toastQ.push(msg); return; }   // あそびかたの 札の 上にも 重ねない（とじてから）
  if (toastShowing(msg)) { toast.at = Date.now(); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), toastMs()); return; }   // いま出ている：のばすだけ
  el.textContent = msg; el.classList.add('show'); toast.at = Date.now(); toastDodge();
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), toastMs());
}
// 出しておく時間：あとに待っている知らせが2つ以上あるときは短め（転がり方・バッジ・節目が続けて来ても、30秒も おくれて出ないように）
function toastMs() { return (toastAfter.q || []).length >= 2 ? 2400 : 3800; }   // 読みこみの とちゅうで呼ばれても使えるよう、function で
function howtoOpen() { const h = $('howto'); return !!h && !h.hidden; }
function toastFlush() { if (!$('reward').classList.contains('show') && !howtoOpen()) toastQ.splice(0).forEach(toastAfter); }   // あそびかたを とじたとき（pixel.js）
// ごほうびの画面を出すとき、いま出ている知らせは下げる。出たばかり（1.5秒まで）で まだ読めていないものだけ、閉じてから出し直す
function toastHold() {
  const t = $('toast');
  if (!t.classList.contains('show')) return;
  if (Date.now() - (toast.at || 0) < 1500 && !toastQ.includes(t.textContent)) toastQ.push(t.textContent);
  t.classList.remove('show'); clearTimeout(toastTimer);
}
// 人の話の窓が開いている間、知らせは 窓の下（下の札の すぐ上）に出るが、小さい画面（320×568）では 窓が そこまで のびていて「▶ とじる」に重なった（自分で 遊んで 分かった）。
// 重なるときは 下の札の上に 重ねて出す（low）。ゴールの人に 着いたときは 知らせが 先に出て あとから 窓が開くので、窓の 大きさが かわった ときにも 見る
function toastDodge() {
  const el = $('toast'), dq = document.querySelector('#pxInfo:not([hidden]) .dq');
  if (!dq || !el.classList.contains('show')) { el.classList.remove('low'); return; }
  // 動いている とちゅう（出はじめの transform・low を 外した あとの bottom の transition）では なく、ふつうの 位置に 止まった 形で くらべる：transition の ない 見えない 写しで はかる
  const c = el.cloneNode(true);
  ['id', 'role', 'aria-live'].forEach(a => c.removeAttribute(a)); c.classList.remove('low'); c.style.cssText = 'transition:none;visibility:hidden';
  el.parentNode.appendChild(c);
  const t = c.getBoundingClientRect(), d = dq.getBoundingClientRect();
  c.remove();
  el.classList.toggle('low', t.top < d.bottom && t.bottom > d.top);
}
// 窓が 開く・とじる・話の ページを めくって 高さが かわる（pxInfoBody だけ 書きかわる）たびに 見なおす
if (window.ResizeObserver && document.querySelector('#pxInfo .dq')) new ResizeObserver(toastDodge).observe(document.querySelector('#pxInfo .dq'));
// いま出ている知らせ（同じ動きの中で少しあとに出る知らせも）が消えてから出す
// 待っている知らせが いくつあっても、来た順に1つずつ（同時に出して、あとのものが上書きしないように）
function toastAfter(msg) {
  const afterQ = toastAfter.q || (toastAfter.q = []);   // 読みこみの とちゅうで呼ばれても使えるよう、関数に持たせる
  if (afterQ.includes(msg) || toastShowing(msg)) return;   // 同じ知らせが待っている・いま出ている
  afterQ.push(msg);
  if (afterQ.length > 1) return;   // もう待っている（前のものを出したあとに出す）
  setTimeout(function show() {
    if ($('toast').classList.contains('show')) return setTimeout(show, 600);
    const m = afterQ.shift();
    if (m) toast(m);   // 待っている間に 取りのぞかれて 空になっていることがある
    if (afterQ.length) setTimeout(show, 600);
  }, 150);
}

// 文字を少なく（ふだん）：ごほうびの行を「絵＋数」の札にする（まちメモの文は きろく で読める）
const CHIP = [['🎮', 'jump'], ['🎒', 'bag'], ['🎌', 'calendar'], ['✨', 'star'], ['🎁', 'chest'], ['🖼', 'card'], ['📖', 'book'], ['📅', 'fire'], ['🆕', 'new'], ['🏠', 'home'], ['⏱️', 'clock'], ['🎉', 'star'], ['🍚', 'bowl'], ['📜', 'scroll'], ['🔗', 'compass']];
function rewardChips(lines, fact, total, hero) {   // hero：絵を大きく出すとき（絵の札と、合計と同じ数の札は出さない）
  const out = [];
  let book = false, shown = false;   // shown：大きく出している絵の札（はじめの1枚）はもう出したか
  for (const l of lines) {
    if (/^🏁 めいろ ゴール/.test(l) || /^[★☆]+ /.test(l)) {   // めいろの ゴール：かかった 時間・★の 数（文字を 少なく でも 分かる ように）
      const t = l.startsWith('🏁') ? (l.match(/ゴール！ (\S+?)(（|$)/) || [])[1] || '' : l.split(' ')[0], plus = (l.match(/[+＋]\d+/) || [''])[0];
      out.push(`<span title="${esc(l)}">${PIA(l.startsWith('🏁') ? 'flag' : 'star', l)}${esc(t)}${plus ? ' ' + plus : ''}</span>`);
      continue;
    }
    if (/^🧭 (まよわず|通った 道)/.test(l)) {   // めいろの「まよわず ゴール」：通った 道の 倍率（と ボーナス）の 札（下の「つぎは〜へ」とは べつ）
      const x = (l.match(/([\d.]+)倍/) || [])[1], plus = (l.match(/[+＋]\d+/) || [''])[0];
      out.push(`<span title="${esc(l)}">${PIA('compass', l)}${x ? `${x}倍` : ''}${plus ? ' ' + plus : ''}</span>`);
      continue;
    }
    if (l.startsWith('🧭')) continue;   // 「つぎは〜へ」は下の案内に出ている
    const c = CHIP.find(([e]) => l.startsWith(e)), ic = c ? c[1] : 'flag';   // 名所・キャンペーンなどは旗
    if (ic === 'book') book = true;
    const plus = (l.match(/[+＋]\d+/) || [''])[0], days = (l.match(/（(\d+)日連続）/) || [])[1], time = (l.match(/るすばん\s*((?:\d+時間)?\d+分)/) || [])[1];
    const v = l.startsWith('🔗') ? `×${(l.match(/×([\d.]+)/) || [])[1] || ''} ${plus}` : ic === 'card' ? (/もう持っている/.test(l) ? '' : PIA('new', 'はじめての絵')) : ic === 'bag' && !plus ? ((l.match(/(\d+)km/) || [])[1] || '') + 'km' : ic === 'fire' ? `${days || ''}${plus ? ' ' + plus : ''}` : ic === 'clock' ? (time || '') : plus;
    // 大きく出している絵（はじめの1枚）と、合計と同じ数の札は出さない。るすばんで2枚目からの絵は札で出す
    if (hero && ic === 'card' && !shown) { shown = true; continue; }
    if (hero && ic !== 'card' && v === `+${total}`) continue;
    out.push(`<span title="${esc(l)}">${PIA(ic, l)}${v}</span>`);
  }
  return `<div class="chips">${out.join('')}</div>`;
}
// ドット絵のめずらしさ（星）：西尾にしかない題材は★3、全国有数の名物・産地の題材は★2（docs/dots-nishio.md）。虹・雪・満月の絵は＋1
const DOT_TWO_STARS = new Set(['kabuse', 'matcha', 'ishiusu', 'ike', 'unaju', 'kabayaki', 'ebisen', 'asari', 'tanbo', 'carnation']);
const dotStars = f => (DOT_TWO_STARS.has(f.motif) ? 2 : 3) + (['rainbow', 'snow', 'moon'].includes(f.wk) ? 1 : 0);
const starRow = n => `<div class="stars" aria-label="めずらしさ ${n}">${'<i></i>'.repeat(n)}</div>`;
// チェックインのあとの ひとこと：ごほうびの画面が消えたら、下に小さく出す（react.pending）
const react = { pending: null, shown: 0, t: 0 };
// 田んぼのイベント「芽出しの見きわめ」（medashi.js）が開いている間に来た ごほうびは、閉じてから出す（イベントの下で出て、答えている間に消えないように）
const medashiOpen = () => !!document.querySelector('.medashi:not([hidden]), #howto:not([hidden])');   // イベントの窓（田んぼ・古い地図・本のできごと。どれも .medashi）と「あそびかた」。開いている 間の ごほうびは 待って、とじてから 出す
function showReward(total, name, lines, lvUp, fact, dot, waited) {
  if (medashiOpen()) {   // 待っている ごほうびは来た順に1つずつ（閉じたあと、前のごほうびが消えてから次）
    const q = showReward.pending || (showReward.pending = []);
    q.push([total, name, lines, lvUp, fact, dot, waited]);
    if (q.length === 1) setTimeout(function drain() {
      if (medashiOpen() || $('reward').classList.contains('show') || showReward.waiting) { setTimeout(drain, 600); return; }
      const args = q.shift();
      showReward(...args);
      if (q.length) setTimeout(drain, 600);
    }, 600);
    return;
  }
  const el = $('reward'), D = window.NISHIO_DOTS;
  if (waited !== true) {
    const gen = showReward.gen = (showReward.gen || 0) + 1;   // あとから来たごほうびが先。読みこみを待っている古いごほうびは出さない
    if (dot && D && D.ready && !D.ready([dot.id])) { showReward.waiting = gen; D.load([dot.id]).then(() => { if (showReward.waiting === gen) showReward.waiting = 0; if (gen === showReward.gen) showReward(total, name, lines, lvUp, fact, dot, true); }); return; }   // Blender の絵のシートを読んでから出す（読めなければ前の描き方の絵）
  }
  showReward.waiting = 0;
  sound.jingle(lvUp ? 'levelup' : 'checkin');
  // うれしい場面（はじめて見つけた絵・レベルアップ）には「シェア」のボタン（share.js。押すとシェアの窓）
  const shareKind = dot && (dot.fresh || dot.kira) && D ? 'dot' : lvUp ? 'lvup' : mzShare && !mzShare.shown && Date.now() - mzShare.t < 15000 ? 'mzgoal' : '';   // めいろの ゴール：遊んだ 画面を シェア（ゴールの ごほうびの 1回だけ）
  if (shareKind === 'mzgoal') mzShare.shown = true;
  const shareBtn = shareKind ? `<button type="button" class="btn mini rw-share" data-rw-share="${shareKind}"${shareKind === 'dot' ? ` data-dot="${dot.id}"` : ''}>📣 シェア</button>` : '';
  const stay = shareKind ? 7000 : 0;   // シェアのボタンがあるときは長めに出す（.rw.long の7秒のアニメーションに合わせる）
  if (simple()) {
    // 絵が主役：ドット絵を大きく、金の額縁に。はじめての絵には NEW のリボンと、めずらしさの星
    // いちばん上に、どこで何があったか（チェックインした名所・たからばこ など）。絵の題名は額縁の下の札（絵の題名を、着いた所とまちがえないように）
    const f = dot && D ? D.info(dot.id) : null;
    el.innerHTML = f
      ? `<div class="rw hero long${dot.kira ? ' kira' : ''}">${dot.kira ? '<span class="ribbon kira">キラ</span>' : dot.fresh ? '<span class="ribbon">NEW</span>' : ''}
        <div class="place">${esc(name)}</div>
        <div class="frame"><img class="dot-card" src="${D.dataUrl(dot.id)}" alt="${esc(f.name)}" width="192" height="192"/></div>
        ${starRow(dotStars(f))}<div class="banner">${PIA('card', 'もらった絵')} ${esc(f.title)}</div>
        <div class="sub">${ART32('stat-coin', 'ポイント')}<b>+${total}</b></div>
        ${rewardChips(lines, fact, total, true)}
        ${lvUp ? `<div class="lvup">${PIA('star', 'レベルアップ')} Lv${lvUp}</div>` : ''}${shareBtn}</div>`
      : `<div class="rw${shareKind ? ' long' : ''}"><div class="big">${ART32('stat-coin', 'ポイント')}+${total}</div><div class="nm">${esc(name)}</div>
        ${rewardChips(lines, fact)}
        ${lvUp ? `<div class="lvup">${PIA('star', 'レベルアップ')} Lv${lvUp}</div>` : ''}${shareBtn}</div>`;
    if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
    toastHold(); el.classList.add('show');
    clearTimeout(showReward.t); showReward.t = setTimeout(hideReward, stay || (dot ? 5000 : 2700));
    afterReward();
    return;
  }
  el.innerHTML = `<div class="rw${fact || dot || shareKind ? ' long' : ''}"><div class="big">+${total}pt</div><div class="nm">${esc(name)}</div>
    ${dot && D ? `<img class="dot-card${dot.kira ? ' kira' : ''}" src="${D.dataUrl(dot.id)}" alt="${esc(D.info(dot.id).name)}" width="144" height="144"/>` : ''}
    <ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
    ${fact ? `<p class="fact">💡 ${esc(fact)}</p>` : ''}
    ${lvUp ? `<div class="lvup">🎉 レベルアップ！<br/><span>Lv${lvUp}「${esc(titleOf(lvUp))}」</span></div>` : ''}${shareBtn}</div>`;
  if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
  toastHold(); el.classList.add('show');
  clearTimeout(showReward.t); showReward.t = setTimeout(hideReward, Math.max(stay, fact || dot ? 7000 : 2700));
  afterReward();
}
// ごほうびの画面は、どこかをタップすると消える（タップは下の地図やボタンには届かない）
function hideReward() {
  clearTimeout(showReward.t); const el = $('reward'); el.innerHTML = ''; el.classList.remove('show'); if (react.pending) reactShow();
  toastQ.splice(0).forEach(toastAfter);   // たまった知らせは、1つずつ順に（つなげて1つにすると長すぎて読めなかった）
  setTimeout(tryChest, 300);   // ごほうびの間に着いていた たからばこ を開ける
}
$('reward').addEventListener('click', e => {
  const b = e.target.closest('[data-rw-share]');
  hideReward();
  if (b && window.nishioGo.openShare) { track('share_prompt', { kind: b.dataset.rwShare }); window.nishioGo.openShare(b.dataset.rwShare, { dot: b.dataset.dot ? +b.dataset.dot : null, mzgoal: b.dataset.rwShare === 'mzgoal' ? mzShare : null }); }
});

/* ---------- 西尾ドット絵帳（dots.js：西尾ならではのドット絵 74000枚。ぜんぶ Blender で作った絵） ----------
   西尾市の中で、たからばこを開けたり、スポットにチェックインしたりすると1枚もらえる。どの絵かは場所（地区・土地利用）と季節・時間帯・天気・日にちで決まる */
function gainDot(lat, lng, seed, area) {
  const D = window.NISHIO_DOTS;
  if (!D || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const id = D.pick(lat, lng, seed, new Date(), area);
  return id == null ? null : addDot(id);
}
// キラ：もらうたびに 1/32 で、その絵が金色にかがやく「キラ」になる（もう持っている絵でも。キラは絵ごとに1回）。
// どの絵が出るかは場所・季節・天気で決まるので、運の大当たりはここだけ（docs/location-game-essence.md）
const KIRA_RATE = 1 / 32;
// キラの時間：毎週土曜の10時台（日本時間）は キラが出やすい（2倍）。「この時間だけ」の約束で、みんな同じ時間に遊ぶ理由に
const kiraHour = (d = new Date()) => { const j = new Date(d.getTime() + 9 * 3600e3); return j.getUTCDay() === 6 && j.getUTCHours() === 10; };
function addDot(id, forceKira) {   // forceKira：必ずキラに（7日連続のごほうび。もうキラを持っている絵ならふつう）
  const D = window.NISHIO_DOTS;
  if (!Array.isArray(S.dots)) S.dots = [];
  if (!Array.isArray(S.kira)) S.kira = [];
  const far = kiraFar(), rate = KIRA_RATE * (kiraHour() ? 2 : 1) * far;
  const fresh = !S.dots.includes(id), kira = !S.kira.includes(id) && (forceKira || Math.random() < rate);
  if (fresh) { S.dots.push(id); weekStat().dots++; dayState().dots = (dayState().dots || 0) + 1; }
  if (kira) S.kira.push(id);
  track('dot_get', { motif: D.info(id).motif, fresh, kira, far, mode: demo ? 'play' : 'walk' });
  return { id, fresh, kira, rate: forceKira ? 0 : rate, far };
}
// 7日連続（7日・14日…）のごほうび：まだ持っていない題材の、めずらしい天気（雪・満月・虹）のキラの絵。ふだんは場所で決まる絵を、場所によらず1枚
function streakDot() {
  const D = window.NISHIO_DOTS;
  if (!D) return null;
  const have = new Set((S.dots || []).map(id => D.motifOf(id))), all = D.MOTIFS.map((m, i) => i), pool = all.filter(i => !have.has(i));
  const list = pool.length ? pool : all, m = list[Math.floor(Math.random() * list.length)];
  return addDot(D.idOf(m, 4, Math.floor(Math.random() * 16), Math.floor(Math.random() * D.NCOMP)), true);
}
// 週の記録（月曜はじまり）：先週のまとめ を きろく に出す
function weekStat() {
  const n = weekNo();
  if (!S.week || S.week.no !== n) { if (S.week) S.lastWeek = S.week; S.week = { no: n, m: 0, spots: 0, dots: 0 }; }
  return S.week;
}
const lastWeekStat = () => { weekStat(); return S.lastWeek && S.lastWeek.no === weekNo() - 1 ? S.lastWeek : null; };
// 前回のさんぽ（農場のゲームの「朝のお知らせ」のように、日がかわって はじめて開いたときに、前に遊んだ日のことを1回だけ）。少しも歩いていない・チェックインしていない日は出さない
function prevDayStat() {
  dayState();
  const p = S.prevDay;
  if (!p || !(p.walked >= 30 || p.checkins > 0 || p.dots > 0)) return null;
  const y = new Date(); y.setDate(y.getDate() - 1);
  const [, m, d] = p.date.split('-').map(Number);
  return { ...p, label: p.date === ymd(y) ? 'きのう' : `前回（${m}月${d}日）` };
}
const prevDayText = p => `${fmtM(p.walked)}・チェックイン ${p.checkins}回・新しい絵 ${p.dots}枚`;
function dotLines(dot) {
  const D = window.NISHIO_DOTS;
  if (!dot || !D) return [];
  const f = D.info(dot.id);
  return [`🖼 西尾ドット絵 No.${f.no}「${f.name}」${dot.fresh ? '' : '（もう持っている絵）'}`, ...(dot.kira ? [`✨ キラの絵！（${(r => r ? `${Math.round(1 / r)}回に1回${dot.far > 1 ? '・遠くまで来たので 出やすい' : ''}` : '特別な1枚')(dot.rate === undefined ? KIRA_RATE : dot.rate)}）`] : [])];
}

/* ---------- おみやげ袋（歩くと開く。docs/location-game-essence.md） ----------
   たからばこ（4回に1回。はじめての たからばこ は必ず1km）・はじめての注目スポット・今週のテーマの名所で もらえる。持てるのは3つまで。
   先頭の袋だけ、歩いた距離で中身がたまり、決めた距離（1km・2km・5km）を歩くと開く。中身はポイントと、袋をもらった場所のドット絵
   （まだ持っていない題材を先に）。遠くまで歩く袋ほど多い */
const BAG = { max: 3, chestRate: 0.25, themeDaily: 3, kinds: [{ km: 1, w: 50, pts: 30, dots: 1 }, { km: 2, w: 35, pts: 80, dots: 2 }, { km: 5, w: 15, pts: 200, dots: 3 }] };
function giveBag(lat, lng, why, km) {
  if (!Array.isArray(S.bags)) S.bags = [];
  if (S.bags.length >= BAG.max) return null;
  if (!km) { let r = Math.random() * 100; km = (BAG.kinds.find(k => (r -= k.w) < 0) || BAG.kinds[0]).km; }
  const b = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), km, lat, lng, walked: 0, t: Date.now() };
  S.bags.push(b);
  track('bag_get', { km, why, mode: demo ? 'play' : 'walk' });
  return b;
}
function walkBags(d) {
  const b = Array.isArray(S.bags) && S.bags[0];
  if (!b) return;
  b.walked = Math.min(b.km * 1000, b.walked + d);
  if (b.walked >= b.km * 1000) openBagSoon();
}
const bagDone = () => { const b = Array.isArray(S.bags) && S.bags[0]; return !!b && b.walked >= b.km * 1000; };
// ほかのごほうびが出ている間・絵を読みこんで出るのを待っている間は待つ（重ならないように。消えてしまわないように）
const rewardBusy = () => $('reward').classList.contains('show') || !!showReward.waiting || !!(showReward.pending && showReward.pending.length);
const rewardSoon = () => rewardBusy() || !!openBagSoon.t || !!movieWhenFree.wait;   // 開く予約をした おみやげ袋・ムービーも（田んぼ・旧地図・本のできごとのイベントは、これが済んでから始める）
function openBagSoon() {
  if (openBagSoon.t) return;
  const key = stateKey();   // 予約したときの記録。モードを切り替えたら、その記録の袋は戻ったときに開く（refreshNearby がまた予約する）
  const tick = () => {
    if (stateKey() !== key) { openBagSoon.t = 0; return; }
    if (rewardBusy() || medashiOpen()) { openBagSoon.t = setTimeout(tick, 800); return; }
    openBagSoon.t = 0;
    openBag();
  };
  openBagSoon.t = setTimeout(tick, 800);
}
function bagDot(b, i, taken) {   // まだ持っていない題材 → まだ持っていない絵 → ふつう、の順に、袋をもらった場所の絵から選ぶ
  const D = window.NISHIO_DOTS;
  if (!D) return null;
  const have = new Set(S.dots || []), motifs = new Set([...have].map(id => D.motifOf(id)));
  let best = null, score = -1;
  for (let j = 0; j < 24; j++) {
    const id = D.pick(b.lat, b.lng, `bag:${b.id}:${i}:${j}`, new Date());
    if (id == null) break;   // 西尾市の外：絵はなし（ポイントだけ）
    if (taken.has(id)) continue;
    const sc = !motifs.has(D.motifOf(id)) && ![...taken].some(t => D.motifOf(t) === D.motifOf(id)) ? 2 : !have.has(id) ? 1 : 0;
    if (sc > score) { best = id; score = sc; }
    if (sc === 2) break;
  }
  if (best == null) return null;
  taken.add(best);
  return addDot(best);
}
function openBag() {
  const b = Array.isArray(S.bags) && S.bags[0];
  if (!b || b.walked < b.km * 1000) return;   // モードを切り替えた などで、もう開く袋がない
  S.bags.shift();
  const k = BAG.kinds.find(x => x.km === b.km) || BAG.kinds[0], taken = new Set(), dots = [];
  for (let i = 0; i < k.dots; i++) { const dt = bagDot(b, i, taken); if (dt) dots.push(dt); }
  S.log.unshift({ type: 'bag', t: Date.now(), pts: k.pts, name: `おみやげ袋（${b.km}km）`, icon: '🎒' });
  const lvUp = gainPoints(k.pts);
  track('bag_open', { km: b.km, dots: dots.length, mode: demo ? 'play' : 'walk' });
  save();
  showReward(k.pts, `おみやげ袋をあけた！（${b.km}km 歩いた）`, [`🎒 おみやげ袋 +${k.pts}`, ...dots.flatMap(dotLines)], lvUp, '', dots.find(x => x.kira) || dots.find(x => x.fresh) || dots[0] || null);
  refreshNearby();
}
const bagLine = () => { const b = Array.isArray(S.bags) && S.bags[0]; return b ? { b, done: Math.floor(b.walked / 100) / 10 } : null; };

/* ---------- 今週のテーマ（docs/location-game-essence.md） ----------
   週ごと（月曜はじまり・日本時間）に6つのテーマが順番に回る。テーマに合う名所でチェックインすると、スポットのポイントが2倍・おみやげ袋。
   日付だけで決まるので、だれが遊んでも同じ週は同じテーマ */
const THEMES = [
  { key: 'shrine', icon: '⛩️', name: '神社', cats: ['shrine'] },
  { key: 'temple', icon: '🛕', name: 'お寺', cats: ['temple', 'worship'] },
  { key: 'park', icon: '🌳', name: '公園', cats: ['park'] },
  { key: 'historic', icon: '🏯', name: '史跡と城', cats: ['historic', 'castle'] },
  { key: 'sea', icon: '🌊', name: '海と展望', cats: ['beach', 'view'] },
  { key: 'art', icon: '🖼', name: 'アートと資料館', cats: ['art', 'museum', 'library'] },
];
const weekNo = (d = new Date()) => Math.floor((Math.floor((d.getTime() + 9 * 3600e3) / 86400000) + 3) / 7);   // 日本時間の週の番号（1970-01-01 は木曜なので +3 で月曜に変わる）
const weekTheme = (d = new Date()) => THEMES[weekNo(d) % THEMES.length];
const inThemeOf = (s, theme = weekTheme()) => !s.shop && theme.cats.includes(s.featured ? (s.kind || s.cat) : s.cat);
let dotSel = null;
// 絵帳の手がかり：題材が出る地区と場所（dots.js の areas と lu。lu は国土数値情報の土地利用の1文字）
const DOT_AREA = { nishio: '西尾', isshiki: '一色', kira: '吉良', hazu: '幡豆', sakushima: '佐久島' };
const DOT_LU = { a: '田んぼ', b: '畑', c: '森', d: '野原', e: 'まちなか', f: '道ばた', g: '線路ぞい', h: '公園や境内', i: '川や池', j: '海辺', k: '海辺', l: 'ゴルフ場' };
function dotHint(m) {
  const as = (m.areas || []).filter(a => DOT_AREA[a]), where = as.length >= 5 ? '西尾市のどこか' : as.map(a => DOT_AREA[a]).join('・');
  const lu = [...new Set([...(m.lu || '')].map(c => DOT_LU[c]).filter(Boolean))].slice(0, 2).join('・');
  return `${where}${lu ? 'の ' + lu : ''}で 見つかる`;
}   // 絵帳で開いている題材（null は、さいきんもらった絵）
function renderDots(waited) {
  const D = window.NISHIO_DOTS, grid = $('dotGrid');
  if (!D || !grid) return;
  // 目標は「題材 n/35」と「題材×天気 n/175」。70000枚ぜんぶは目標にしない（置き方のちがいは、見つけるたびの楽しみ）
  const have = (S.dots || []).filter(id => id >= 0 && id < D.COUNT), by = new Map(), wx = new Map();
  for (const id of have) { const f = D.info(id); by.set(f.m, (by.get(f.m) || 0) + 1); if (!wx.has(f.m)) wx.set(f.m, new Set()); wx.get(f.m).add(f.w); }
  const nWx = [...wx.values()].reduce((a, x) => a + x.size, 0), WX_ICON = ['☀️', '☁️', '☔', '🌫️', '🌈'];
  const kira = new Set(S.kira || []);
  $('dotCount').textContent = `題材 ${by.size}/${D.MOTIFS.length}・題材×天気 ${nWx}/${D.MOTIFS.length * 5}・絵 ${have.length.toLocaleString()}枚${kira.size ? `・キラ ${kira.size}枚` : ''}`;
  const last = new Map(); for (const id of have) last.set(D.info(id).m, id);   // 題材ごとの、さいきんもらった絵
  const list = dotSel == null ? have.slice(-24).reverse() : have.filter(id => D.motifOf(id) === dotSel).sort((a, b) => a - b);
  const need = [...list, ...(simple() ? last.values() : [])];
  if (waited !== true && D.ready && !D.ready(need)) { D.load(need).then(() => renderDots(!D.ready(need))); return; }   // Blender の絵のシートを読んでから描く（読めたら、そのあいだに変わった分も見なおす。4秒で読めなければ前の描き方の絵）
  // まだの題材は、絵の影と「どこで出るか」の手がかり（その場所へ行く理由になる）
  if (simple()) $('dotMotifs').innerHTML = D.MOTIFS.map((m, i) => `<li class="pic${dotSel === i ? ' on' : ''}${by.has(i) ? '' : ' none'}"><button type="button" data-dotm="${i}" title="${by.has(i) ? esc(m.name) : 'まだ：' + esc(dotHint(m))}（${by.get(i) || 0}枚）">${by.has(i) ? `<img src="${D.dataUrl(last.get(i))}" alt="" width="72" height="72" loading="lazy"/>` : `<img class="shadow" src="${D.dataUrl(D.idOf(i, 0, 5, 12))}" alt="まだ" width="72" height="72" loading="lazy"/>`}<b>${by.has(i) ? esc(m.name) : '？'}</b>${by.has(i) ? '' : `<small class="hint">${esc(dotHint(m))}</small>`}<span class="wx">${[0, 1, 2, 3, 4].map(w => `<i class="${wx.has(i) && wx.get(i).has(w) ? 'on' : ''}"></i>`).join('')}</span></button></li>`).join('');
  else $('dotMotifs').innerHTML = D.MOTIFS.map((m, i) => `<li class="${dotSel === i ? 'on' : ''}${by.has(i) ? '' : ' none'}"><button type="button" data-dotm="${i}"><span>${by.has(i) ? m.icon : '？'}</span><b>${esc(m.name)}</b>${by.has(i) ? '' : `<small class="hint">📍${esc(dotHint(m))}</small>`}<small>${WX_ICON.map((c, w) => `<i class="${wx.has(i) && wx.get(i).has(w) ? 'on' : ''}">${c}</i>`).join('')} ${by.get(i) || 0}枚</small></button></li>`).join('');
  $('dotNote').textContent = dotSel == null ? 'さいきんもらった絵（題材を押すと、その題材の絵を番号順に見られます）' : `${D.MOTIFS[dotSel].icon} ${D.MOTIFS[dotSel].name}（もう一度押すと、さいきんもらった絵にもどります）`;
  grid.innerHTML = list.length ? list.map(id => { const f = D.info(id); return `<figure${kira.has(id) ? ' class="kira" title="キラの絵"' : ''}><img src="${D.dataUrl(id)}" alt="${esc(f.name)}" width="96" height="96" loading="lazy"/><figcaption>No.${f.no}<br/>${dotSel == null ? esc(f.title) + '<br/>' : ''}${esc(f.label)}</figcaption></figure>`; }).join('')
    : `<p class="empty">${dotSel == null ? 'まだありません。西尾市の中で、たからばこを開けたり、スポットにチェックインしたりしてみよう' : 'この題材の絵は、まだありません'}</p>`;
}
$('dotMotifs').addEventListener('click', e => {
  const b = e.target.closest('[data-dotm]');
  if (!b) return;
  const i = Number(b.dataset.dotm);
  dotSel = dotSel === i ? null : i;
  renderDots();
});

const LOG_PI = { bag: 'bag', walk: 'feet', use: 'gift', chest: 'chest', idle: 'home', welcome: 'star', checkin: 'flag', quest: 'scroll', npc: 'talk', guide: 'compass', spot: 'flag', up: 'up', search: 'book', critter: 'feet', parcel: 'gift', trail: 'feet', trailmile: 'feet', alley: 'book', h100: 'feet' };   // 最近のポイントの絵
const STAT_PI = ['coin', 'star', 'book', 'face', 'flag', 'pin', 'feet', 'fire', 'medal', 'chest'];   // きろく の数字の絵。Blender で作った nishio-go/art/stat-<名前>.png（使えるポイント・レベル・まちメモ・話した人・めぐったスポット・チェックイン・歩いた距離・連続日数・最長連続・合計）
// ころころの きろく（めいろで 転がって ためた もの。ポイントは つけない）：コンボの ベスト・きょう ひろった ごはんつぶ・びゅんの れんさの ベスト
function renderKoroRec() {
  const box = $('koroRec'), P = window.nishioPixel;
  if (!box) return;
  const c = P && P.combo ? P.combo.best : 0, d = P && P.maze && P.maze.dots ? P.maze.dots.n : 0, b = P && P.maze && P.maze.padChain ? P.maze.padChain.best : 0;
  const parts = [c ? `🎵 コンボ ベスト ×${c}` : '', d ? `🍚 きょう ひろった つぶ ${d}` : '', b >= 2 ? `💨 びゅん れんさ ベスト ×${b}` : ''].filter(Boolean);
  box.hidden = !parts.length;
  box.innerHTML = parts.length ? `<p><b>🍙 ころころの きろく</b><small>${parts.map(esc).join('<br>')}</small></p>` : '';
}
function renderLog() {
  const jOk = featuredToday();   // ミニゲームは、きょう名所でチェックインしたら
  $('jumpBtn').disabled = !jOk;
  $('jumpNote').textContent = jOk ? 'コインを集めて西尾城の旗をめざそう（ごほうびは1日1回）' : '名所（注目スポット）でチェックインすると、その日あそべます';
  renderTomorrow();
  renderKoroRec();
  renderBags();
  renderCampaigns();
  renderUps();
  const day = dayState(), qs = todaysQuests();
  $('questList').innerHTML = qs.map(q => {
    const done = day.done.includes(q.id), v = Math.min(q.goal, q.val(day));
    if (simple()) return `<li class="${done ? 'done' : ''}"><span class="ico">${ART32(done ? 'stat-star' : 'quest', done ? '達成' : 'クエスト')}</span><span class="main"><b>${esc(q.text)}</b>
      <span class="bar" title="${q.unit === 'm' ? fmtM(v) + ' / ' + fmtM(q.goal) : v + ' / ' + q.goal}"><i style="width:${Math.round(v / q.goal * 100)}%"></i></span></span><span class="num">${PIA('coin', 'ポイント')}+${q.pts}</span></li>`;
    return `<li class="${done ? 'done' : ''}"><span class="ico">${done ? '✅' : q.icon}</span><span class="main"><b>${esc(q.text)}</b>
      <small>${done ? '達成！' : `${q.unit === 'm' ? fmtM(v) + ' / ' + fmtM(q.goal) : v + ' / ' + q.goal}`}${q.sub ? `・${esc(q.sub)}` : ''}</small></span><span class="num">+${q.pts}</span></li>`;
  }).join('') + (simple()
    ? `<li class="${day.bonus ? 'done' : ''}"><span class="ico">${ART32(day.bonus ? 'stat-medal' : 'quest', '3つぜんぶ達成')}</span><span class="main"><b>3つぜんぶ達成</b></span><span class="num">${PIA('coin', 'ポイント')}+${CFG.pts.questAll}</span></li>`
    : `<li class="${day.bonus ? 'done' : ''}"><span class="ico">${day.bonus ? '🏆' : '🎯'}</span><span class="main"><b>3つぜんぶ達成</b><small>${day.bonus ? '達成！あしたも新しいクエストが出ます' : 'あしたは別のクエストになります'}</small></span><span class="num">+${CFG.pts.questAll}</span></li>`);
  const ev = upcomingEvents();
  $('eventList').innerHTML = ev.length ? ev.map(({ e, when, next }) => {
    const s = e.spot && spots.find(x => x.id === evSpotId(e));
    return `<li class="${next ? 'next' : ''}"><span class="ico">${simple() ? (s && spotThumb(s)) || ART32('calendar', '') : next ? '🗓️' : '📅'}</span><span class="main"><b>${esc(e.name)}</b>
      <small>${esc(when)}${simple() ? '' : `・${esc(e.place)}`}</small></span>${s && demo ? `<button type="button" class="btn mini" data-move="${esc(s.id)}">行く</button>` : s && S.visits[s.id] ? '<span class="num">✓</span>' : ''}</li>`;
  }).join('') : '<li class="empty">今月と来月の行事はありません</li>';
  const facts = factPool();
  $('factCount').textContent = `${S.facts.filter(k => facts.has(k)).length}/${facts.size}`;
  renderDots();
  $('factList').innerHTML = S.facts.filter(k => facts.has(k)).slice().reverse().map(k => `<li><span class="ico">${simple() ? PIA('book', '') : '💡'}</span><span class="main"><small>${esc(facts.get(k))}</small></span></li>`).join('')
    || '<li class="empty">たからばこを開けたり、チェックインしたり、おまかせ歩きで歩いたりすると、まちメモが集まります</li>';
  const lv = levelOf(S.total);
  $('stats').innerHTML = [
    ['使えるポイント', S.points.toLocaleString(), 'pt'], ['レベル', `${lv}`, titleOf(lv)],
    ['まちメモ', knownFacts(), 'こ'], ['話した人', (S.met || []).length, '人'],
    ['めぐったスポット', Object.keys(S.visits).length, 'か所'], ['チェックイン', S.checkins, '回'],
    ['歩いた距離', fmtM(S.walked), ''], ['連続日数', S.streak.last === ymd() || S.streak.last === yesterday() ? S.streak.days : 0, '日'],
    ['最長連続', S.streak.max || 0, '日'], ['これまでの合計', S.total.toLocaleString(), 'pt'],
  ].map(([k, v, u], i) => simple()   // 文字を少なく（ふだん）：名前のかわりにドット絵（名前は読み上げと長押しで）
    ? `<div class="stat pic" title="${esc(k)}"><img class="pi art" src="nishio-go/art/stat-${STAT_PI[i]}.png" alt="${esc(k)}" width="32" height="32"/><b>${esc(v)}<small>${esc(i === 1 ? '' : u)}</small></b></div>`
    : `<div class="stat"><small>${k}</small><b>${esc(v)}<small>${esc(u)}</small></b></div>`).join('');

  // 聞いた名所：まだ行っていないものは影の絵。見出しの数は「聞いた名所のうち、行った数／聞いた数」
  const heard = Object.entries(S.heard || {}), heardLeft = heard.filter(([id]) => !S.visits[id]).sort((a, b) => b[1].t - a[1].t);
  $('heardCount').textContent = heard.length ? `${heard.length - heardLeft.length}/${heard.length}` : '';
  $('heardList').innerHTML = heardLeft.length ? heardLeft.map(([id, h]) => {
    const sp = spots.find(x => x.id === id), far = sp && me ? fmtM(dist(me, sp)) : '';
    return simple()
      ? `<li data-spot="${esc(id)}"><span class="ico heard">${spotThumb(sp) || PIA('pin', '')}</span><span class="main"><b>${esc(sp ? sp.name : id)}</b></span><span class="num">${h.found ? '' : '🔍'}${PIA('talk', esc(h.by))}${far}</span></li>`
      : `<li data-spot="${esc(id)}"><span class="ico heard">${spotThumb(sp) || '❔'}</span><span class="main"><b>${esc(sp ? sp.name : id)}</b><small>${esc(h.by)}から聞いた${h.found ? '' : '（着いたら🔍しらべる）'}${far ? `・ここから ${far}` : ''}</small></span></li>`;
  }).join('') : `<li class="empty">${heard.length ? '聞いた名所は、ぜんぶ行きました！ また西尾の人に話しかけてみよう' : '西尾の人に話しかけると、すすめてくれた名所がここに載ります'}</li>`;

  // 生きもの手帳：出会ったものは絵と回数、まだのものは影と「どこで出会えるか」
  const book = S.critters || {}, cimg = id => { try { const c = window.nishioPixel && nishioPixel.critterSprite(id); return c ? `<img class="gthumb" src="${c.toDataURL()}" alt="" width="28" height="28"/>` : ''; } catch (e) { return ''; } };
  $('critterCount').textContent = `${CRITTERS.filter(c => book[c.id]).length}/${CRITTERS.length}`;
  $('critterList').innerHTML = CRITTERS.map(c => book[c.id]
    ? `<li><span class="ico">${cimg(c.id) || '🐾'}</span><span class="main"><b>${esc(c.name)}</b>${simple() && !c.note ? '' : `<small>${esc(c.note || c.say)}${c.src ? ` <a href="${esc(c.src)}" target="_blank" rel="noopener">出典</a>` : ''}</small>`}</span><span class="num">×${book[c.id].n}</span></li>`
    : `<li><span class="ico heard">${cimg(c.id) || '❔'}</span><span class="main"><b>？？？</b><small>${WHERE_NAME[c.where]}${c.months ? `・${c.months[0]}〜${c.months[c.months.length - 1]}月` : ''}</small></span></li>`).join('');

  const visits = Object.entries(S.visits).sort((a, b) => b[1].last - a[1].last);
  $('visitedList').innerHTML = visits.length ? visits.map(([id, v]) =>
    simple()   // 文字を少なく（ふだん）：名所のドット絵と、行った回数
      ? `<li data-spot="${esc(id)}"><span class="ico">${spotThumb(spots.find(x => x.id === id)) || PIA('pin', '')}</span><span class="main"><b>${esc(v.name)}</b></span><span class="num">${v.featured ? PIA('star', '注目スポット') : ''}×${v.n}</span></li>`
      : `<li data-spot="${esc(id)}"><span class="ico">${esc(v.icon || '📍')}</span><span class="main"><b>${esc(v.name)}</b>
      <small>${v.n}回・最後 ${fmtTime(v.last)}</small></span>${v.featured ? '<span class="num">⭐</span>' : ''}</li>`).join('')
    : '<li class="empty">まだありません。地図のスポットへ歩いてみよう！</li>';

  $('areaList').innerHTML = areas.length ? areas.map(a => {
    const art = simple() && areaArt(a.id);
    const p = areaProgress(a.id), pct = p.total ? Math.round(p.done / p.total * 100) : 0;
    return `<li class="area-row"><span class="ico">${art ? `<img class="gthumb area-art${p.total && p.done === p.total ? ' done' : ''}" src="${art}" alt="" width="32" height="32"/>` : simple() ? PI(p.total && p.done === p.total ? 'medal' : 'flag', '') : esc(a.icon || '🗾')}</span><span class="main"><b>${esc(a.name)}</b>
      ${simple() ? '' : `<small>${esc(a.catch || '')}</small>`}<span class="bar"><i style="width:${pct}%"></i></span></span><span class="num">${p.done}/${p.total}</span></li>`;
  }).join('') : '<li class="empty">地区の情報を読み込めませんでした</li>';

  $('logList').innerHTML = S.log.length ? S.log.slice(0, 50).map(l =>
    `<li><span class="ico">${simple() && (l.type === 'chest' || l.type === 'welcome') ? '<img class="gthumb" src="nishio-go/art/chest.png" alt="" width="28" height="28"/>' : simple() ? (l.type === 'jump' ? PIA('jump', '') : PI(LOG_PI[l.type] || 'flag', '')) : l.type === 'walk' ? '👣' : l.type === 'use' ? '🎁' : esc(l.icon || '📍')}</span><span class="main"><b>${esc(l.name)}</b>
      ${simple() ? '' : `<small>${l.type === 'walk' ? l.date.replace(/^\d+-0?(\d+)-0?(\d+)$/, '$1/$2') : fmtTime(l.t)}</small>`}</span><span class="num${l.pts < 0 ? ' minus' : ''}">${l.pts > 0 ? '+' : ''}${l.pts}</span></li>`).join('')
    : '<li class="empty">まだありません</li>';
}

// 地区の名物の絵（tools/blender/pixel-art.py で Blender から作った 48×48。絵のない地区は ''）
const AREA_ART = new Set(['nishio', 'isshiki', 'kira', 'hazu', 'sakushima', 'okazaki', 'anjo', 'hekinan', 'takahama', 'kota', 'gamagori']);
function areaArt(id) { return AREA_ART.has(id) ? `nishio-go/art/area-${id}.png` : ''; }

// バッジのメダルの絵（文字を少なく：ふだん）。地区の制覇は旗
const BADGE_PI = { critterall: 'book', first: 'feet', spot10: 'map', spot30: 'compass', spot100: 'medal', shrine: 'torii', temple: 'temple', park: 'tree', castle: 'castle', featall: 'star',
  walk5: 'walker', walk42: 'walker', streak7: 'fire', meibutsu: 'tea', meibutsu2: 'tea', memo10: 'book', memo50: 'book', npc5: 'talk', npcall: 'face', npcnear: 'face', voice1: 'talk', voice3: 'home', react10: 'talk', alley10: 'book', h100: 'feet', chain4: 'compass' };
$('badgeGrid').addEventListener('click', e => { const b = e.target.closest('[data-badge="clear"]'); if (b && S.cleared) endingWhenFree(); });   // 殿堂入りのバッジから、エンディングの記録をもう一度
function renderBadges() {
  const got = new Set(S.badges), defs = badgeDefs();
  // 達成率と「もうすぐ」（農場のゲームの実績の画面のように、全体で どこまで来たかと、次に取れそうなもの）
  const isDone = b => got.has(b.id) || (b.ready !== false && b.cur >= b.goal);
  const nDone = defs.filter(isDone).length;
  $('badgeCount').textContent = defs.length ? `${nDone}/${defs.length}（${Math.floor(nDone / defs.length * 100)}%）` : '';
  const soon = defs.filter(b => !isDone(b) && b.ready !== false && b.cur > 0).sort((a, b) => b.cur / b.goal - a.cur / a.goal).slice(0, 2);
  $('badgeSoon').hidden = !soon.length;
  $('badgeSoon').innerHTML = soon.length ? `<b>もうすぐ</b>${soon.map(b => `<span>${simple() ? '' : b.i + ' '}${esc(b.n)}（あと ${(b.goal - b.cur).toLocaleString()}）${simple() ? '' : `<small>${esc(b.d)}</small>`}</span>`).join('')}` : '';
  $('badgeGrid').innerHTML = defs.map(b => {
    const done = got.has(b.id) || (b.ready !== false && b.cur >= b.goal);
    const pct = Math.min(100, (b.cur / b.goal) * 100);
    if (simple()) return `<div class="badge pic ${done ? 'got' : 'locked'}" data-badge="${esc(b.id)}" title="${esc(b.d)}（${done ? '獲得済み' : `${Math.min(b.cur, b.goal)}/${b.goal}`}）"><div class="medal">${PI(BADGE_PI[b.id] || (b.id.startsWith('area-') ? 'flag' : b.id.startsWith('seal-') ? 'scroll' : b.id === 'clear' ? 'castle' : 'star'), b.n)}</div><b>${esc(b.n)}</b>
      ${done ? '' : `<div class="bp"><i style="width:${pct}%"></i></div>`}</div>`;
    return `<div class="badge ${done ? 'got' : 'locked'}" data-badge="${esc(b.id)}"><div class="bi">${b.i}</div><b>${esc(b.n)}</b><small>${esc(b.d)}</small>
      ${done ? '<small>獲得済み</small>' : `<div class="bp"><i style="width:${pct}%"></i></div><small>${Math.min(b.cur, b.goal)}/${b.goal}</small>`}</div>`;
  }).join('');
  const lv = levelOf(S.total);
  $('titleList').innerHTML = TITLES.map(([l, t]) =>
    `<li class="${titleOf(lv) === t ? 'now' : ''}"><span class="ico">${simple() ? PI(lv >= l ? 'medal' : 'lock', lv >= l ? '獲得' : 'まだ') : lv >= l ? '🎖️' : '🔒'}</span><span class="main"><b>${esc(t)}</b>
      <small>Lv${l}${simple() ? '' : `（累計 ${needFor(l).toLocaleString()}pt）`}</small></span>${titleOf(lv) === t ? '<span class="num">いまここ</span>' : ''}</li>`).join('');
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
    '乗り物（時速約30km以上）で移動中も、チェックイン・たからばこ・行き先に着くことはできます（運転中の操作はやめましょう）。歩いた距離のポイントは、歩いた分だけ数えます',
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
            perDay: Number(r.perDay) > 0 ? Math.floor(Number(r.perDay)) : 0, active: r.active === true,
            validMin: Number(r.validMin) > 0 ? Math.round(Number(r.validMin)) : 0,   // この特典だけの 有効時間（分。なければ ぜんぶ 共通の validMin）
            art: /^[a-z0-9-]+$/.test(r.art || '') ? r.art : '' })),   // 品物のドット絵（nishio-go/art/<art>.png）
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
const rewardMin = r => r.validMin || rewardCfg.validMin;   // 特典の クーポンの 有効時間（分）
const rewardMinText = () => { const m = [...new Set(visibleRewards().map(rewardMin))]; return m.length > 1 ? `${Math.min(...m)}〜${Math.max(...m)}` : String(m[0] || rewardCfg.validMin); };
const couponState = c => c.used ? 'used' : Date.now() > c.t + c.validMin * 60000 ? 'expired' : 'valid';
const openCoupon = () => S.coupons.find(c => couponState(c) === 'valid' && !!c.demo === !!demo);   // まだ 使っていない 有効な クーポン（ほかの クーポンとは いっしょに 使えないので、ある 間は 次を 交換しない）
const usedToday = rid => S.coupons.filter(c => c.rid === rid && ymd(new Date(c.t)) === ymd()).length;

let rewardExpT = 0;
function renderRewards() {
  $('walletPts').textContent = S.points.toLocaleString();
  clearTimeout(rewardExpT);
  const oc = openCoupon();   // 使っていない クーポンの 期限が きれたら 描きなおす（併用できない ための「使ってから」を とく）
  if (oc) rewardExpT = setTimeout(() => { if (!$('panel-rewards').hidden) renderRewards(); }, Math.max(0, oc.t + oc.validMin * 60000 - Date.now()) + 500);
  const pic = simple();   // 文字を少なく（ふだん）：品物のドット絵（Blender で作った絵）と、ポイント・回数の札。くわしい条件はタップで
  $('rewardNote').textContent = demo
    ? (pic ? '操作して移動：サンプル（お店では使えません）' : '操作して移動：サンプルの特典で交換の流れを試せます（このクーポンはお店では使えません。お店のとくてんは「あるいて移動」で）。')
    : pic ? `有効${rewardMinText()}分。お店で見せる直前に交換` : `交換すると、その場でクーポン画面が出ます（有効${rewardMinText()}分）。お店で店員さんに見せる直前に交換してください。`;
  $('rewardList').innerHTML = visibleRewards().map(r => {
    const limit = r.perDay && usedToday(r.id) >= r.perDay;
    const short = S.points < r.cost, busy = !!openCoupon();
    const why = busy ? '使っていないクーポンがあります' : limit ? '今日はもう交換しました' : short ? `あと${(r.cost - S.points).toLocaleString()}pt` : '';
    if (pic) return `<li class="reward-pic"><span class="ico">${r.art ? `<img class="art" src="nishio-go/art/${r.art}.png" alt="" width="48" height="48"/>` : PIA('gift', '')}</span><span class="main"><b>${esc(r.name)}${r.active ? '' : ' <em class="sample">サンプル</em>'}</b>
      <span class="chips"><span>${PIA('coin', 'ポイント')}${r.cost.toLocaleString()}</span>${r.perDay ? `<span>${PIA('calendar', '1日に交換できる回数')}×${r.perDay}</span>` : ''}<span>${PIA('clock', 'クーポンの有効時間')}${rewardMin(r)}分</span></span>
      ${r.desc ? `<details><summary>${PIA('scroll', '')} 条件</summary>${esc(r.desc)}</details>` : ''}</span>
      <button type="button" class="btn" data-redeem="${esc(r.id)}" ${why ? 'disabled' : ''} aria-label="${esc(why || '交換')}">${busy ? `${ART32('ticket', '')} 使ってから` : limit ? `${PIA('clock', '')} あした` : short ? `${PIA('coin', '')}あと${(r.cost - S.points).toLocaleString()}` : '交換'}</button></li>`;
    return `<li><span class="ico">🎁</span><span class="main"><b>${esc(r.name)}${r.active ? '' : ' <em class="sample">サンプル</em>'}</b>
      <small>${r.cost.toLocaleString()}pt${r.perDay ? `・1日${r.perDay}回まで` : ''}・有効${rewardMin(r)}分${r.desc ? '・' + esc(r.desc) : ''}</small></span>
      <button type="button" class="btn" data-redeem="${esc(r.id)}" ${why ? 'disabled' : ''}>${why ? esc(why) : '交換'}</button></li>`;
  }).join('') || '<li class="empty">いま交換できる特典はありません</li>';
  const list = S.coupons.slice().sort((a, b) => b.t - a.t).slice(0, 20);
  $('couponList').innerHTML = list.length ? list.map(c => {
    const st = couponState(c);
    const label = st === 'used' ? `使用済み ${fmtTime(c.used)}` : st === 'expired' ? '期限切れ' : `有効 あと${Math.ceil((c.t + c.validMin * 60000 - Date.now()) / 60000)}分`;
    return `<li data-coupon="${esc(c.id)}" class="${st === 'valid' ? 'now' : ''}"><span class="ico">${pic ? ART32('ticket', '') : '🎫'}</span><span class="main"><b>${esc(c.name)}</b>
      <small>${fmtTime(c.t)} 交換・${label}</small></span>${st === 'valid' ? '<span class="num">見せる</span>' : ''}</li>`;
  }).join('') : '<li class="empty">まだありません</li>';
}

function redeem(rid) {
  const r = visibleRewards().find(x => x.id === rid);
  if (!r) return;
  if (S.points < r.cost) { toast('ポイントが足りません'); return; }
  if (openCoupon()) { toast('使っていないクーポンがあります。ほかのクーポンとはいっしょに使えません'); return; }
  if (r.perDay && usedToday(r.id) >= r.perDay) { toast('この特典は今日はもう交換しました'); return; }
  if (!confirm(`「${r.name}」と ${r.cost}pt を交換しますか？\n\n交換するとクーポン画面が出ます（有効${rewardMin(r)}分${r.desc ? `。${r.desc}` : ''}）。お店で店員さんに見せる直前に押してください。交換したポイントは戻せません。`)) return;
  const rnd = new Uint32Array(2);
  (window.crypto || {}).getRandomValues ? crypto.getRandomValues(rnd) : (rnd[0] = Math.random() * 4e9, rnd[1] = Math.random() * 4e9);
  const c = { id: rnd[0].toString(36) + rnd[1].toString(36), rid: r.id, name: r.name, cost: r.cost, t: Date.now(),
    validMin: rewardMin(r), cond: r.desc, code: String(rnd[0] % 10000).padStart(4, '0'), used: 0, demo, sample: !r.active };   // cond：使える 条件（店頭の 画面に 出す）
  S.points -= r.cost;
  S.coupons.push(c);
  S.coupons = S.coupons.slice(-50);
  track('coupon_get', { reward: r.id || r.name, mode: demo ? 'play' : 'walk' });
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
  $('cpCond').textContent = c.cond || '';   // 使える 条件（「お米1袋につき1回まで」など。店員さんが その場で 確かめられる ように）
  $('cpCond').hidden = !c.cond;
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
  track('coupon_use', { reward: c.rid || c.name || '', mode: demo ? 'play' : 'walk' });
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
  if (tab !== 'map') reactHide();   // 「どうだった？」も（きろく・バッジの下の方を ふさいでいた）
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  ['log', 'voice', 'rewards', 'settings'].forEach(t => { $('panel-' + t).hidden = t !== tab; });
  if (tab === 'voice') { renderVoice(); voiceMarkSeen(); loadVoices(); }
  if (tab === 'rewards') renderRewards();
  if (tab === 'log') { renderLog(); renderBadges(); }   // バッジは きろく の下に
  if (tab === 'settings') { renderSpotInfo(); renderGpsInfo(); }
  if (tab === 'map') setTimeout(() => map.invalidateSize(), 0);
}
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => openTab(b.dataset.tab)));
$('lvBtn').addEventListener('click', () => { openTab('log'); $('badgeHead').scrollIntoView(); });

['visitedList', 'heardList'].forEach(id => $(id).addEventListener('click', e => {
  const li = e.target.closest('li[data-spot]');
  const s = li && spots.find(x => x.id === li.dataset.spot);
  if (!s) return;
  follow = false;
  openTab('map');
  if (document.body.classList.contains('px')) { $('pxInfoBody').innerHTML = popupHtml(s); $('pxInfo').hidden = false; return; }   // ドット絵の地図では、ふつうの地図は隠れているので、名所の窓を出す
  map.setView([s.lat, s.lng], 17);
  setTimeout(() => markers.get(s.id)?.openPopup(), 300);
}));

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
  sessionEnd();   // 1回に遊んだ時間・ポイントは、モードごとに分けて送る（るすばん の おかえり より前に新しい回を始める）
  demo = isDemo;
  calledBy = null;   // 呼びとめ・めいろの ゴールで「近くで 話せる」あつかいに した 人は、モードを かえたら もどす（歩く 地図で 遠くから 話せて しまわない ように）
  if (store.get('nsg_started', false)) sessionStart();
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
  setMode(isDemo);
  track('mode_switch', { mode: demo ? 'play' : 'walk' });
  toast(demo ? `🎮 操作して移動にしました（${document.body.classList.contains('px') ? 'スマホを傾けると お米が 迷路を ころころ進みます' : '地図をタップした所へ移動します'}。記録は別です）`
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
  if (window.nishioPixel && nishioPixel.trailClear) nishioPixel.trailClear();   // あしあと（別のかぎに保存）も消す
  toast('記録を削除しました');
});

/* ---------- こえ（プレイヤーの声でそだつ）：おたよりを送る・あなたのおたよりの様子・みんなの声で かわったこと ----------
   /api/feedback（api/feedback.js）に送ると、運営者の非公開の置き場（GitHub の非公開リポジトリの Issue）に届く。
   位置は「いまいる場所の近く」にチェックしたときだけ、0.001度（約100m）に丸めて送る。1日3通まで（docs/feedback.md）
   おたよりごとに、この端末で でたらめな受付番号（rid）を作って送り、送ったものは この端末にだけ覚えておく（nsg_fb_mine）。
   たしかめた結果（受付番号ごとの返事）と、反映されたことは nishio-go/voices.json（tools/feedback-triage.js voices が30分ごとに書く）で知る */
const FB_MAX = 3;
const fb = { shown: 0, theme: '' };
const fbCount = () => { const c = store.get('nsg_fb', null); return c && c.d === ymd() ? c.n : 0; };
const newRid = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('');
const fbText = { spot: 'どんな所？（見どころ・場所の目じるしなど）', fix: 'なにがちがう？（正しくはどうか、分かれば）', fun: 'どうすると、もっと楽しくなる？（あったらうれしい遊び・ごほうび・しかけ など）', idea: 'どんなことで こまった？ どうしてほしい？' };
function fbFill() {   // スポットの選びわけ：チェックインできるスポットを先に、あとは近いじゅん
  const sel = $('fbSpot'), base = me || CFG.home;
  const near = spots.filter(s => s !== selected).map(s => ({ s, d: dist(base, s) })).sort((a, b) => a.d - b.d).slice(0, 12).map(o => o.s);
  sel.replaceChildren(...(selected ? [selected] : []).concat(near).map(s => new Option(s.name, s.id)));
}
function fbKind() {
  const k = $('fbKind').value;
  $('fbSpotRow').hidden = k !== 'fix';
  $('fbNameRow').hidden = k !== 'spot';
  $('fbTextLabel').textContent = fbText[k];
  if (k === 'fix') fbFill();
}
$('fbKind').addEventListener('change', fbKind);
$('fbForm').addEventListener('focusin', () => { if (!fb.shown) fb.shown = Date.now(); });
$('fbForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = t => { $('fbMsg').textContent = t; };
  const kind = $('fbKind').value, name = $('fbName').value.trim(), text = $('fbText').value.trim(), url = $('fbUrl').value.trim();
  if (fbCount() >= FB_MAX) return msg(`おたよりは1日${FB_MAX}通までです。また明日おねがいします。`);
  if (!text) return msg('内容を書いてください。');
  if (kind === 'spot' && !name) return msg('名所の名前を書いてください。');
  if (url && !/^https:\/\/[^\s]+$/.test(url)) return msg('ページは https:// ではじまるアドレスを書いてください。');
  const here = $('fbHere').checked;
  if (here && !me) return msg('いまの場所が分からないので、チェックを外して送るか、場所が出てからもう一度送ってください。');
  const sp = kind === 'fix' ? spots.find(s => s.id === $('fbSpot').value) : null;
  const rid = newRid(), th = fb.theme && VOICE_THEMES.find(x => x.id === fb.theme && x.kind === kind);
  const body = { kind, name: kind === 'spot' ? name : '', text, url, rid, hp: $('fbHp').value, t: fb.shown ? Date.now() - fb.shown : 0, mode: demo ? 'demo' : 'real', ed: ED.id || '' };
  if (th) body.theme = th.id;
  if (here) { body.lat = Math.round(me.lat * 1000) / 1000; body.lng = Math.round(me.lng * 1000) / 1000; }
  if (sp) body.spot = { id: sp.id, name: sp.name };
  const btn = $('fbSend');
  btn.disabled = true; msg('送っています…');
  try {
    const r = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) {
      store.set('nsg_fb', { d: ymd(), n: fbCount() + 1 });
      // この端末にだけ覚えておく（あなたのおたより）。見出しは この端末の中だけで使う
      const head = kind === 'spot' ? name : sp ? sp.name : [...text.replace(/\s+/g, ' ')].slice(0, 24).join('');
      store.set('nsg_fb_mine', [{ rid, kind, head, t: Date.now() }, ...fbMine()].slice(0, 30));
      const wk = String(weekNo()), firstTheme = th && !fbStats().wk.includes(wk);
      fbStatsAdd(x => { x.sent++; if (firstTheme) { x.themes++; x.wk.push(wk); } });
      if (firstTheme) { const lv = gainPoints(20); save(); toastAfter(`🗓 今週のお題に答えた！ お題スタンプ +1（20pt）${lv ? ` レベル${lv}！` : ''}`); }
      $('fbForm').reset(); fb.theme = ''; $('fbText').placeholder = ''; fbKind(); fb.shown = 0;
      renderVoice();
      msg(`とどきました。ありがとう！（受付番号 ${rid.slice(0, 4)}…）たしかめたら「あなたのおたより」でお知らせします。`);
      toast('📮 おたよりを送りました。ありがとう！');
      track('feedback_send', { kind });
    } else msg(r.status === 429 ? 'いまは おたよりが多くて受けつけられません。時間をおいて送ってください。'
      : r.status === 503 || r.status === 404 ? 'おたよりは まだ受けつけていません。ごめんなさい。'
      : '送れませんでした。内容を確かめて、もう一度お試しください。');
  } catch (_) { msg('送れませんでした。通信環境を確かめて、もう一度お試しください。'); }
  finally { btn.disabled = false; }
});

const VOICE_KIND = { spot: '📍 名所', fun: '🎉 もっと面白く', fix: '✏️ まちがい', idea: '😣 こまった' };
const VOICE_ST = { sent: ['📨 とどきました', 'たしかめるまで、少し待ってね'], checking: ['🔍 たしかめています', ''], soon: ['🗓 もうすぐ出ます', ''], already: ['✅ もうありました', ''],
  proposal: ['🗂 運営で検討中', 'すぐには決められないので、運営が考えています'], done: ['👍 いまのままで大丈夫', ''], skip: ['— 反映できませんでした', ''], reflected: ['🎉 反映されました', ''] };
const voiceSeen = () => store.get('nsg_voice_seen', {});   // 受付番号 → 見た返事（s）。反映のお礼は1回だけ（あるいて移動・操作して移動の両方で1回）
function loadVoices(force) {
  if (!force && Date.now() - voice.at < 60000) return Promise.resolve(voice.data);
  voice.at = Date.now();
  return fetch('nishio-go/voices.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null).then(j => {
    if (j && typeof j === 'object') { voice.data = j; voiceNews(); renderVoice(); }
    return voice.data;
  });
}
// 新しい返事があれば知らせる（タブの赤い点・反映されたら お礼とバッジ）
function voiceNews() {
  const seen = voiceSeen(), news = [];
  for (const m of fbMine()) {
    const r = replyOf(m.rid);
    if (!r || seen[m.rid] === r.s) continue;
    news.push({ m, r });
  }
  $('voiceDot').hidden = !news.length;
  // お礼とお知らせは、受けとった印（nsg_voice_paid・nsg_voice_told）を先に保存してから。こえ タブを開かずに何度読みなおしても1回だけ
  const paid = store.get('nsg_voice_paid', {}), told = store.get('nsg_voice_told', {});
  for (const { m, r } of news) {
    if (r.s === 'reflected' && !paid[m.rid]) {
      paid[m.rid] = 1; store.set('nsg_voice_paid', paid);
      const lv = gainPoints(50); save();
      toastAfter(`🎉 あなたの声が反映されました：${r.t || m.head}（お礼 50pt）${lv ? ` レベル${lv}！` : ''}`);
      track('feedback_reflected', { kind: m.kind });
    } else if ((r.s === 'already' || r.s === 'soon') && told[m.rid] !== r.s) {
      told[m.rid] = r.s; store.set('nsg_voice_told', told);
      toastAfter(`📮 ${r.t || 'おたよりの返事がとどきました'}（教えてくれてありがとう！）`);
    }
  }
  if (news.some(n => n.r.s === 'reflected')) checkBadges();
  if (!$('panel-voice').hidden) voiceMarkSeen();
}
function voiceMarkSeen() {
  const seen = voiceSeen();
  for (const m of fbMine()) { const r = replyOf(m.rid); if (r) seen[m.rid] = r.s; }
  store.set('nsg_voice_seen', seen);
  $('voiceDot').hidden = true;
}
function renderVoice() {
  const v = voice.data, c = (v && v.counts) || {}, mine = fbMine();
  const parts = [c.spot && `名所 ${c.spot}か所`, c.fix && `直したこと ${c.fix}件`, c.fun && `新しい遊び ${c.fun}つ`, c.idea && `使いやすく ${c.idea}件`].filter(Boolean);
  $('voiceStats').textContent = parts.length ? `みんなの声で：${parts.join('・')}` : '';
  $('voiceStats').hidden = !parts.length;
  $('voiceIntro').textContent = parts.length ? `📮 みんなの声で ${parts.join('・')}` : '';
  $('voiceIntro').hidden = !parts.length;
  $('voiceMineCard').hidden = !mine.length;
  renderVoiceMe();
  const seen = voiceSeen();
  $('voiceMine').innerHTML = mine.map(m => {
    const r = replyOf(m.rid), st = r ? r.s : 'sent', [label, note] = VOICE_ST[st] || VOICE_ST.checking;
    return `<li class="${r && seen[m.rid] !== r.s ? 'new' : ''}"><span class="st ${esc(st)}">${esc(label)}</span>${esc(VOICE_KIND[m.kind] || '')}「${esc(m.head)}」
      <small>${esc((r && r.t) || note)}${(r && r.t) || note ? '・' : ''}${fmtTime(m.t)}に送った・受付番号 ${esc(m.rid.slice(0, 4))}…</small>
      ${st === 'reflected' ? `<button type="button" class="btn mini" data-share-voice="${esc((r && r.t) || m.head)}">📣 シェア</button>` : ''}</li>`;
  }).join('');
  const log = (v && Array.isArray(v.log) ? v.log : []).slice(0, 30);
  $('voiceLog').innerHTML = log.map(l => `<li>${esc(VOICE_KIND[l.kind] || '📮')} ${esc(l.text)}<small>${esc(String(l.d || '').slice(5).replace('-', '/'))}</small></li>`).join('');
  $('voiceLogEmpty').hidden = log.length > 0;
}
// スポットの窓の「この名所のことを教える」：こえ タブで、そのスポットのまちがいを知らせる形にして開く
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-voice-spot]');
  if (!b) return;
  const s = spots.find(x => x.id === b.dataset.voiceSpot);
  map.closePopup();
  const pi = document.getElementById('pxInfo'); if (pi) pi.hidden = true;
  openTab('voice');
  $('fbKind').value = 'fix'; fbKind();
  if (s) { if (![...$('fbSpot').options].some(o => o.value === s.id)) $('fbSpot').prepend(new Option(s.name, s.id)); $('fbSpot').value = s.id; }
  $('fbCard').scrollIntoView({ block: 'start' });
  $('fbText').focus({ preventScroll: true });
});
loadVoices(true);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadVoices(); });

/* 楽しく声を送る：チェックインのあとの ひとこと・今週のお題・記者のランクと おたより手帳 */
const REACTS = [['love', '😍', 'よかった'], ['photo', '📷', '映える'], ['calm', '🍵', 'ほっこり'], ['hard', '🤔', 'わかりにくい'], ['access', '🚧', '行きにくい']];
// 名所の窓の「みんなの声」（voices.json の reactions。多いじゅんに3つ）
function reactLine(s) {
  const c = voice.data && voice.data.reactions && voice.data.reactions[s.id];
  if (!c) return '';
  const top = REACTS.map(([k, e, n]) => [e, n, c[k] | 0]).filter(x => x[2] > 0).sort((a, b) => b[2] - a[2]).slice(0, 3);
  return top.length ? `<p class="react-line">みんなの声：${top.map(([e, n, k]) => `<span title="${esc(n)}">${e} ${k}</span>`).join(' ')}</p>` : '';
}
// 聞くのは、同じ名所は30日に1回、1日に3回まで
function reactAsk(s) {
  const seen = store.get('nsg_react', {}), day = store.get('nsg_react_day', null) || {};
  if (seen[s.id] && Date.now() - seen[s.id] < 30 * 86400e3) return;
  if (day.d === ymd() && day.n >= 3) return;
  react.pending = s;
}
function reactHide() { clearTimeout(react.t); $('reactBar').hidden = true; $('reactBar').innerHTML = ''; }
function reactShow() {
  const s = react.pending; react.pending = null;
  if (!s) return;
  const day = store.get('nsg_react_day', null) || {};
  store.set('nsg_react_day', { d: ymd(), n: day.d === ymd() ? (day.n | 0) + 1 : 1 });
  react.shown = Date.now();
  $('reactBar').innerHTML = `<p>💬 <b>${esc(s.name)}</b>、どうだった？ <small>タップで みんなの声に（+5pt）</small></p>
    <div class="react-chips">${REACTS.map(([k, e, n]) => `<button type="button" data-react="${k}" data-spot="${esc(s.id)}"><span>${e}</span>${esc(n)}</button>`).join('')}</div>
    <button type="button" class="react-x" data-react-x aria-label="とじる">×</button>`;
  $('reactBar').hidden = false;
  clearTimeout(react.t); react.t = setTimeout(reactHide, 15000);
}
$('reactBar').addEventListener('click', async e => {
  if (e.target.closest('[data-react-x]')) return reactHide();
  const b = e.target.closest('[data-react]');
  if (!b) return;
  const s = spots.find(x => x.id === b.dataset.spot);
  if (!s) return reactHide();
  $('reactBar').querySelectorAll('button').forEach(x => { x.disabled = true; });
  let r = null;
  try { r = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'react', spot: { id: s.id, name: s.name }, r: b.dataset.react, t: Date.now() - react.shown, hp: '' }) }); } catch (_) { /* 通信できない */ }
  reactHide();
  if (r && r.ok) {
    const seen = store.get('nsg_react', {}); seen[s.id] = Date.now();
    for (const [k, t] of Object.entries(seen)) if (Date.now() - t > 30 * 86400e3) delete seen[k];
    store.set('nsg_react', seen);
    fbStatsAdd(x => { x.react++; });
    const lv = gainPoints(5); save();
    toast(`💬 ひとこと ありがとう！ +5pt（${esc(s.name)}の みんなの声に入ります）${lv ? ` レベル${lv}！` : ''}`);
    track('feedback_react', { r: b.dataset.react });
    checkBadges();
  } else toast(r && (r.status === 503 || r.status === 404) ? 'ひとこと は まだ受けつけていません。ごめんなさい。' : 'ひとこと を送れませんでした。また こんど おねがいします。');
});

// 今週のお題（週ごとに かわる。答えると お題スタンプ）
const VOICE_THEMES = [
  { id: 'asa', kind: 'spot', q: 'あなたの好きな「朝の西尾」は どこ？' },
  { id: 'yuuhi', kind: 'spot', q: '夕日や夜景が きれいな場所を教えて' },
  { id: 'shashin', kind: 'spot', q: '写真をとりたくなる場所は？' },
  { id: 'himitsu', kind: 'spot', q: '地元の人しか知らない、ひみつの名所は？' },
  { id: 'kodomo', kind: 'spot', q: '子どもと いっしょに楽しめる場所は？' },
  { id: 'umi', kind: 'spot', q: '海や川の近くで好きな場所は？' },
  { id: 'asobi', kind: 'fun', q: 'このゲームに あったら うれしい遊びは？' },
  { id: 'ame', kind: 'fun', q: '雨の日も楽しくなる しかけを考えて！' },
  { id: 'gohoubi', kind: 'fun', q: 'こんな ごほうびが ほしい！' },
  { id: 'aruku', kind: 'fun', q: 'もっと歩きたくなる しかけは？' },
  { id: 'matsuri', kind: 'fun', q: 'お祭りや行事の日に ゲームで何がおきたら楽しい？' },
  { id: 'nakama', kind: 'fun', q: '家族や友だちと いっしょに遊ぶなら、どんな遊びがいい？' },
];
const themeNow = () => VOICE_THEMES[((weekNo() % VOICE_THEMES.length) + VOICE_THEMES.length) % VOICE_THEMES.length];
$('themeBtn').addEventListener('click', () => {
  const th = themeNow();
  fb.theme = th.id;
  $('fbKind').value = th.kind; fbKind();
  $('fbText').placeholder = th.q;
  $('fbCard').scrollIntoView({ block: 'start' });
  $(th.kind === 'spot' ? 'fbName' : 'fbText').focus({ preventScroll: true });
});
// 記者のランク（反映された数・送った数・ひとこと の数から）と、おたより手帳のスタンプ
const RANKS = [
  { n: '📰 西尾通信の編集長', ok: (x, r) => r >= 10 },
  { n: '🗞 名物記者', ok: (x, r) => r >= 3, next: 'あなたの声が10こ反映されると「西尾通信の編集長」' },
  { n: '📝 まちの記者', ok: (x, r) => r >= 1 || x.react >= 20, next: 'あなたの声が3つ反映されると「名物記者」' },
  { n: '✏️ 見習い記者', ok: x => x.sent >= 1 || x.react >= 3, next: 'あなたの声が1つ反映される（か、ひとこと を20回）と「まちの記者」' },
  { n: '🌱 たんけんの はじまり', ok: () => true, next: 'おたより を1通送る（か、ひとこと を3回）と「見習い記者」' },
];
function renderVoiceMe() {
  const x = fbStats(), r = voicesReflected(), i = RANKS.findIndex(k => k.ok(x, r)), k = RANKS[i];
  $('voiceRank').innerHTML = `あなたは <b>${esc(k.n)}</b>${k.next ? `<small>つぎは：${esc(k.next)}</small>` : ''}`;
  $('voiceStamps').textContent = `📮 おたより ${x.sent} ・ 💬 ひとこと ${x.react} ・ 🗓 お題 ${x.themes} ・ 🎉 反映 ${r}`;
  const th = themeNow();
  $('themeQ').textContent = th.q;
  $('themeDone').hidden = !x.wk.includes(String(weekNo()));
}

/* ---------- 音楽（BGM と効果音） ----------
   nishio-go/bgm/ に mp3 を置くと流れる（無い曲は鳴らさないだけ）。world：せかいちず、checkin：チェックイン、levelup：レベルアップ。
   ふだんの曲（歩く地図・ふつうの地図）は、雨なら「雨」、夜（19〜5時）は「夜」、朝（5〜9時）は「朝」、夕方（16〜19時）は「夕方」、
   それ以外は「昼」の曲から、1曲流し終わるたびに次の曲へ（順番は開くたびにまぜる）。その時間の曲が無ければ昼の曲。
   曲は field・field2（まちかど）・field3（おまつり）・morning・evening・night・rain と、アルバム「西尾の音」100曲（bgm/list.json・bgm/s/。明るい曲）。
   アルバムが読めたら、朝・夕方・夜・雨は もとの静かな曲を外して アルバムの明るい曲だけにする
   ブラウザは最初のタップまで音を出せないので、最初のタップ（はじめの画面のボタンなど）で流し始める */
const sound = (() => {
  const SRC = { checkin: 'nishio-go/bgm/checkin.mp3', levelup: 'nishio-go/bgm/levelup.mp3', eye: 'nishio-go/bgm/eye.mp3', world: 'nishio-go/bgm/world.mp3' };
  const TITLE = { field: 'にしおさんぽ', field2: 'まちかど', field3: 'おまつり', morning: 'あさ', evening: 'ゆうがた', night: 'よる', rain: 'あめ', world: 'せかいちず' };
  const POOL = { day: ['field', 'field2', 'field3'], morning: ['morning'], evening: ['evening'], night: ['night'], rain: ['rain'] };
  const FIELD = new Set(Object.values(POOL).flat()), at = {};   // FIELD：ふだんの曲（1曲流したら次へ）。at：時間帯ごとの いまの曲の番号
  for (const k of FIELD) SRC[k] = `nishio-go/bgm/${k}.mp3`;
  const VOL = 0.28, SFX_VOL = 0.35, els = {}, missing = new Set();   // 音量：BGM 0.28（ひかえめ）、効果音 0.35
  const isBgm = k => k === 'world' || FIELD.has(k);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  for (const m in POOL) { shuffle(POOL[m]); at[m] = 0; }
  let on = store.get('nsg_bgm', true), unlocked = false, scene = 'field', cur = null, ducking = 0;   // ducking：鳴っている効果音の数
  const el = k => {
    if (!els[k]) {
      const a = new Audio(); a.preload = 'none'; a.loop = k === 'world'; a.volume = isBgm(k) ? VOL : SFX_VOL; a.src = SRC[k];
      if (FIELD.has(k)) a.addEventListener('ended', () => { a.currentTime = 0; next(k); });   // ふだんの曲は1回流したら次の曲へ
      a.addEventListener('error', () => { missing.add(k); if (isBgm(k)) apply(); });
      els[k] = a;
    }
    return els[k];
  };
  const moodNow = () => {
    const h = new Date().getHours(), w = weatherNow();
    return w && w.raining ? 'rain' : h >= 19 || h < 5 ? 'night' : h < 9 ? 'morning' : h >= 16 ? 'evening' : 'day';
  };
  const inPool = m => { const P = POOL[m]; for (let i = 0; i < P.length; i++) { const k = P[(at[m] + i) % P.length]; if (!missing.has(k)) return k; } return null; };
  // ふだんの曲：天気（雨）→ 時間帯 → 昼。無い曲は飛ばす
  const fieldSong = () => inPool(moodNow()) || inPool('day');
  const pick = () => (scene === 'world' && !missing.has('world') ? 'world' : fieldSong());
  function next(k) {   // k の次の曲へ（k が入っている時間帯の順番を1つ進める）
    for (const m in POOL) { const i = POOL[m].indexOf(k); if (i >= 0) at[m] = (i + 1) % POOL[m].length; }
    apply();
  }
  // アルバム100曲の一覧を読んで、時間帯ごとの曲に足す（いま流れている曲は そのまま続ける）
  fetch('nishio-go/bgm/list.json').then(r => (r.ok ? r.json() : [])).then(list => {
    // アルバムの曲がある時間帯は、もとの静かな朝・夕方・夜・雨の曲を外す（明るい曲だけにする。アルバムが読めないときの代わりには残る）
    for (const m of ['morning', 'evening', 'night', 'rain']) if (list.some(x => x.m === m)) POOL[m] = POOL[m].filter(k => k !== m);
    for (const x of list) {
      const k = 's' + x.f, m = POOL[x.m] ? x.m : 'day';
      SRC[k] = `nishio-go/bgm/s/${x.f}.mp3`; TITLE[k] = x.t; POOL[m].push(k); FIELD.add(k);
    }
    for (const m in POOL) { shuffle(POOL[m]); at[m] = Math.max(0, POOL[m].indexOf(cur)); }
    apply();
  }).catch(() => {});
  function apply() {
    const live = on && unlocked && !document.hidden, k = live ? pick() : null;
    for (const [n, a] of Object.entries(els)) {
      if (isBgm(n) ? n !== k : !live) {   // 消したとき・画面を離れたときは効果音も止める
        a.pause();
        if (live && n !== k && n[0] === 's') delete els[n];   // 終わったアルバムの曲は手放す（たくさん聞いても重くならないように）
      }
    }
    if (!live) ducking = 0;
    cur = k;
    if (k) { const a = el(k); a.volume = ducking ? VOL * 0.25 : VOL; if (a.paused) a.play().catch(() => {}); }
    $('bgmToggle').checked = on;
    $('bgmNow').textContent = k ? `♪ いまの曲：${TITLE[k] || k}` : '';
    $('bgmNext').hidden = !k || scene === 'world';
  }
  const unlock = () => { if (unlocked) return; unlocked = true; apply(); };
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { once: true, capture: true }));
  document.addEventListener('visibilitychange', apply);
  setInterval(() => { if (cur && cur !== pick()) apply(); }, 60000);   // 時間帯や天気が変わったら曲を変える（1分ごとに見る）
  return {
    apply,
    scene(s) { if (s !== scene) { scene = s; apply(); } },
    toggle(v) { on = v === undefined ? !on : !!v; store.set('nsg_bgm', on); unlocked = true; apply(); },
    next() { if (cur && FIELD.has(cur)) { el(cur).currentTime = 0; next(cur); } },   // 「次の曲」ボタン
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
$('bgmNext').addEventListener('click', () => sound.next());
// アクセス解析（analytics.js）のオン・オフ。切り替えは次に開いたときから
$('anaToggle').checked = !store.get('nsg_noanalytics', false);
// ひきつぎの あいことば（昔のRPGの、続きから遊ぶための文字のしくみ）：いまの記録を縮めて文字にし、別の端末で はりつけると続きから。
// 中身は記録（S）と はじめた日。縮めるのは deflate（CompressionStream がない古いブラウザでは そのまま）
const CODE_HEAD = 'NSG1';
const b64url = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64url = t => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
async function pipeBytes(u8, stream) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer()); }
async function makeCode() {
  const raw = new TextEncoder().encode(JSON.stringify({ s: S, started: store.get('nsg_started', null) }));
  const z = window.CompressionStream ? await pipeBytes(raw, new CompressionStream('deflate-raw')) : null;
  return `${CODE_HEAD}${z ? 'z' : 'p'}.${b64url(z || raw)}`;
}
async function readCode(code) {
  const m = code.replace(/\s+/g, '').match(/^NSG1([zp])\.([\w-]+)$/);
  if (!m) return null;
  try {
    let u8 = unb64url(m[2]);
    if (m[1] === 'z') { if (!window.DecompressionStream) return null; u8 = await pipeBytes(u8, new DecompressionStream('deflate-raw')); }
    const o = JSON.parse(new TextDecoder().decode(u8));
    return o && o.s && o.s.v === 1 && typeof o.s.points === 'number' ? o : null;
  } catch (e) { return null; }
}
$('codeMake').addEventListener('click', async () => {
  $('codeBox').value = await makeCode();
  $('codeCopy').hidden = false;
  track('code_make', { mode: demo ? 'play' : 'walk' });
});
$('codeCopy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('codeBox').value); toast('🔑 あいことばをコピーしました。新しい端末の せってい に はりつけてね'); }
  catch (e) { $('codeBox').select(); toast('🔑 あいことばを えらんだので、コピーしてね'); }
});
$('codeLoad').addEventListener('click', async () => {
  const o = await readCode($('codeBox').value);
  if (!o) { toast('🔑 あいことばが ちがうようです（さいごまで コピーできているか たしかめてね）'); return; }
  if (!confirm(`この端末の いまの記録（${S.points}pt）は、あいことばの記録（${o.s.points}pt・めぐった所 ${Object.keys(o.s.visits || {}).length}か所）に おきかわります。よろしいですか？`)) return;
  store.set(stateKey(), o.s);
  if (o.started && !store.get('nsg_started', null)) store.set('nsg_started', o.started);
  track('code_load', { mode: demo ? 'play' : 'walk' });
  location.reload();
});
$('anaToggle').addEventListener('change', e => { try { localStorage.setItem('nsg_noanalytics', e.target.checked ? '0' : '1'); } catch (err) { /* noop */ } toast(e.target.checked ? '📊 アクセス解析をオンにしました（次に開いたときから）' : '📊 アクセス解析をオフにしました（次に開いたときから送りません）'); });
sound.apply();
// 文字を多めに出す（オフ＝文字を少なくしてドット絵。はじめはオフ）
$('jumpBtn').addEventListener('click', openJump);   // ミニゲーム（runner.js）
document.addEventListener('click', e => { if (e.target.closest('[data-jump-open]')) openJump(); });   // スポットの窓の「ミニゲーム」
$('textToggle').checked = !simple();
$('textToggle').addEventListener('change', e => {
  document.body.classList.toggle('simple', !e.target.checked);
  try { localStorage.setItem('nsg_text_more', e.target.checked ? '1' : '0'); } catch (err) { /* noop */ }
  renderKoyomi.key = null; renderKoyomi(); refreshNearby(); renderMarkers();
  track('text_mode', { more: e.target.checked });
});

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
  // （ごほうびの間に たまった知らせ（バッジなど）が先に出るので、それが消えてから）
  // （その日のごほうびの数は、画面を閉じたりモードを切り替えたりしても続けて数える。session.rewards は1回に遊んだ間の計測だけ）
  const rd = store.get('nsg_rw_day', null), today = ymd(), n = (rd && rd.date === today ? rd.n : 0) + 1;
  store.set('nsg_rw_day', { date: today, n });
  if (n < 2) return;
  afterRewardClosed(() => {
    if (store.get('nsg_tmr_day', '') !== ymd()) { store.set('nsg_tmr_day', ymd()); toastAfter(simple() ? `📅 あしたも来ると +${tomorrowBonus()}pt` : `📅 ${tomorrowItems()[0]}（きろくの「あしたのおたのしみ」）`); }
    setTimeout(a2hsOffer, 4200);
  });
}
// ごほうびの画面が消えてから（重ならないように）。続けてごほうびが出たら、そのぶん待つ
function afterRewardClosed(fn) {
  clearTimeout(afterRewardClosed.t);
  const wait = () => { afterRewardClosed.t = setTimeout(() => ($('reward').classList.contains('show') ? wait() : fn()), 1000); };
  wait();
}
function tomorrowBonus() {   // あした来たときの、その日はじめてのチェックインのボーナス（きょうチェックインしていれば連続）
  const d = S.streak.last === ymd() ? S.streak.days + 1 : 1;
  return CFG.pts.daily + Math.min(d - 1, CFG.pts.streakMax) * CFG.pts.streakStep;
}
function tomorrowItems() {
  const bonus = d => CFG.pts.daily + Math.min(d - 1, CFG.pts.streakMax) * CFG.pts.streakStep;
  const done = S.streak.last === ymd(), d = done ? S.streak.days + 1 : S.streak.last === yesterday() ? S.streak.days + 1 : 1;
  const out = [done ? `名所にチェックインすると 連続${d}日目のボーナス +${bonus(d)}pt` : `きょう名所にチェックインすると 連続${d}日目のボーナス +${bonus(d)}pt。あしたも続けると +${bonus(d + 1)}pt`, '新しい「今日のクエスト」3つ（達成でポイント）', '新しい たからばこ（日によって置き場所が変わる）'];
  if (demo) out.push('閉じている間も るすばん でさんぽ（おかえりのポイントとドット絵）');
  out.push(`あしたの 100歩たんけん：${RIVAL}は ${h100Rival(tomorrow())}マス（勝つと +${H100.win}pt）`);   // さんぽ仲間の あしたの数は 日で決まるので、前もって見せる
  return out;
}
function tomorrow() { const d = new Date(); d.setDate(d.getDate() + 1); return ymd(d); }   // 読みこみの とちゅうで呼ばれても使えるよう、function で
function h100Rival(date) { return 20 + hashStr('h100:' + date) % 41; }   // さんぽ仲間の 100歩たんけん（日で決まる 20〜60マス）
// きろく：今週のテーマ と おみやげ袋
function renderBags() {
  const el = $('bagBox');
  if (!el) return;
  const t = weekTheme(), bags = Array.isArray(S.bags) ? S.bags : [];
  const rows = bags.map((b, i) => { const pct = Math.round(b.walked / (b.km * 1000) * 100); return `<li><span class="ico">${PIA('bag', 'おみやげ袋')}</span><span class="main"><b>${b.km}km の袋${i ? '（つぎの番を待っています）' : '（歩くとたまります）'}</b><span class="bar"><i style="width:${i ? 0 : pct}%"></i></span></span><span class="num">${i ? '—' : `${Math.floor(b.walked / 100) / 10}/${b.km}km`}</span></li>`; }).join('');
  const lw = lastWeekStat();
  const pd = prevDayStat();
  el.innerHTML = `${todayWalkCard()}${pd ? `<p class="lastweek">${PIA('feet', pd.label)} <b>${esc(pd.label)}のさんぽ</b><span>${prevDayText(pd)}</span></p>` : ''}${lw ? `<p class="lastweek">${PIA('feet', '先週')} <b>先週のさんぽ</b><span>${fmtM(lw.m)}・チェックイン ${lw.spots}回・新しい絵 ${lw.dots}枚${lw.h100 ? `・100歩たんけん ${lw.h100}回` : ''}</span></p>` : ''}
    <p class="theme">${PIA('calendar', '今週のテーマ')} <b>今週は ${t.icon} ${esc(t.name)} の週</b><small>${esc(t.name)}でチェックインすると、スポットのポイントが2倍・おみやげ袋がもらえます（月曜に変わります）</small></p>
    <p class="kirahour${kiraHour() ? ' now' : ''}">${PIA('star', 'キラ')} <b>${kiraHour() ? 'いま キラの時間！' : 'キラの時間'}</b><small>毎週土曜の10時台は、キラの絵が出やすい（2倍）。西尾城跡から遠くへ行くほど出やすい（4kmで1.5倍・8kmで2倍）。7日続けて来ると、めずらしい天気のキラの絵</small></p>
    ${window.NISHIO_OLDMAP ? `<p class="oldmap-row"><button type="button" class="btn mini" data-oldmap-view>🗺️ 明治の村の地図 ${(S.oldmap || []).length}/${NISHIO_OLDMAP.VILLAGES.length}</button></p>` : ''}
    <h4>${PIA('bag', '')} おみやげ袋 <small>${bags.length}/${BAG.max}</small></h4>
    <ul class="list">${rows || '<li class="empty">たからばこ・はじめての注目スポット・今週のテーマの名所で もらえます。歩くと開きます</li>'}</ul>`;
}
// きょうのさんぽ（ゲームのおわりに出る「この試合のハイライト」のように）：歩いた距離・はじめて歩いた道・チェックインの3つと、ひとこと
const TRAIL_M = 8;   // 足あとの1マス（pixel.js の TILE_M）
function todayWalkCard() {
  const day = dayState(), walked = day.walked || 0, fresh = (day.trail || 0) * TRAIL_M, best = S.best || { m: 0, date: '' };
  const isBest = best.date === day.date && walked >= 300 && day.bestToast;
  const word = walked < 30 ? 'まだ歩いていません。きょうは どの道を歩こう？'
    : isBest ? '自己ベストの日！ よく歩きました'
    : fresh >= walked * 0.5 ? '知らない道をたくさん歩きました。地図に足あとが ふえています'
    : '地図の足あとの外へ出ると、はじめての道のポイントがもらえます';
  const cell = (label, v) => `<span><small>${label}</small><b>${v}</b></span>`;
  return `<div class="todaywalk"><p><b>${PIA('feet', '')} きょうのさんぽ</b></p>
    <div class="tw3">${cell('歩いた', fmtM(walked))}${cell('はじめての道', fmtM(fresh))}${cell('チェックイン', (day.checkins || 0) + '回')}</div>
    <p class="word">${esc(word)}</p>
    ${dayGoals(day)}
    <small>自己ベスト ${best.m ? fmtM(best.m) : '—'}・これまでに歩いた道 ${fmtM((S.trail || 0) * TRAIL_M)}（つぎの節目 ${fmtM(trailMile(trailMileNext()))} まで あと ${fmtM(Math.max(0, trailMile(trailMileNext()) - (S.trail || 0) * TRAIL_M))}）${S.chain && S.chain.best >= 2 ? `・いちばんの れんさ ${S.chain.best}` : ''}${S.h100best ? `・100歩たんけんの自己ベスト ${S.h100best}マス` : ''}</small></div>`;   // きょうの数は 上の札に
}
// きょうの小さなお楽しみ（毎日の約束）：100歩たんけん・路地の行き止まり・水べで じっと見る の、きょうの進み具合を札で
function dayGoals(day) {
  const h = day.h100, first = store.get('nsg_first_day', '') === ymd();
  const g = [
    ['👣', '100歩たんけん', h && h.done ? `${h.fresh}マス` : h ? `${h.steps}/100歩` : first ? 'あしたから' : 'まだ', !!(h && h.done)],
    ['🔍', '路地の行き止まり', `${day.alleys || 0}/${ALLEY.daily}`, (day.alleys || 0) >= ALLEY.daily],
    ['👀', '水べで じっと見る', `${day.watch || 0}/${WATCH_DAILY}`, (day.watch || 0) >= WATCH_DAILY],
  ];
  return `<div class="tw-goals">${g.map(([i, n, v, done]) => `<span class="${done ? 'done' : ''}" title="${esc(n)}">${i} <small>${esc(n)}</small> <b>${esc(v)}</b>${done ? ' ✓' : ''}</span>`).join('')}</div>`;
}
function renderTomorrow() {
  const el = $('tomorrowBox');
  if (!el) return;
  el.hidden = !store.get('nsg_started', false);
  const items = tomorrowItems();
  el.innerHTML = simple()   // 文字を少なく（ふだん）：絵＋数の札（くわしくは長押しで出る名前）
    ? `<b>${ART32('calendar', '')} あした</b><div class="chips">${[['stat-fire', `+${tomorrowBonus()}`, items[0]], ['quest', '×3', items[1]], ['stat-chest', '', items[2]], ...(demo ? [['home', '', items[3]]] : []), ['stat-feet', `vs${h100Rival(tomorrow())}`, items[items.length - 1]]].map(([ic, v, t]) => `<span title="${esc(t)}">${ART32(ic, t)}${v}</span>`).join('')}</div>`
    : `<b>📅 あしたのおたのしみ</b><ul>${items.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
}
// ホーム画面に追加（Android の Chrome などは追加の画面を出せる。iPhone の Safari は手順を出す）
let a2hsEvt = null, a2hsPending = false;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); a2hsEvt = e;
  // Chrome は、しばらく見てからでないとこの合図を出さない。おすすめを出すはずだった人には、合図が来たところで出す（ごほうびの画面が消えてから）
  if (a2hsPending) { a2hsPending = false; const go = () => ($('reward').classList.contains('show') ? setTimeout(go, 1000) : a2hsOffer()); go(); }
});
window.addEventListener('appinstalled', () => { track('a2hs_installed', {}); store.set('nsg_a2hs_done', true); $('a2hs').hidden = true; });
function standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function a2hsOffer() {
  if (standalone() || store.get('nsg_a2hs_done', false) || Date.now() - store.get('nsg_a2hs_t', 0) < 7 * 86400000) return;
  if (!a2hsEvt && !isIOS()) { a2hsPending = true; return; }   // 追加の画面をまだ出せない（Chrome の合図待ち）。手順も案内できない端末では、合図が来なければ出さない
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
document.addEventListener('visibilitychange', () => { if (document.hidden) sessionEnd(); else if (store.get('nsg_started', false)) sessionStart(); });   // はじめの画面のあいだは数えない
window.addEventListener('pagehide', sessionEnd);

// はじめの画面の絵：お米が 田んぼの あぜ道を コロン、コロンと転がってきて、まん中で止まると ゆらゆらして こっちを見て にっこり、また転がっていく
// （歩く地図と同じ お米の絵・同じ でこぼこの転がり方。pixel.js の riceSpin・riceFeel）。はじめの画面を閉じたら止める
// はじめの画面のアニメーション：お米が 台地の上を ころころ進み、坂（本当の高低差のように）を ひとりでに速くなって転がり下りる。
// 下で ぺたっ、田んぼの あぜ道で ゆっくり止まって、起き上がりこぼしのように ゆらゆら立って にっこり。また右へ転がっていく
function introHero() {
  const cv = $('introHero');
  if (!cv || !cv.getContext) return;
  const x = cv.getContext('2d'), img = new Image(), W = cv.width, H = cv.height;
  const TOP = 46, LOW = 62, S0 = 56, S1 = 96;   // 台地の高さ・下の あぜ道の高さ・坂のはじまりと おわり（点）
  const gY = px => { const t = Math.min(1, Math.max(0, (px - S0) / (S1 - S0))); return TOP + (LOW - TOP) * t * t * (3 - 2 * t); };   // 地面の高さ
  const K = 280, FR = 52, DRAG = 0.3, DRIVE = 32, LEAVE = 40;   // 坂の強さ・ころがり抵抗・空気・台地で押す速さ・出ていく速さ（点/秒）
  const st = { x: -24, v: DRIVE, ang: 0, av: 0, rest: 0, mode: 'drive', sq: 0, sqv: 0, last: 0 };
  const scene = now => {
    const sky = x.createLinearGradient(0, 0, 0, 40);
    sky.addColorStop(0, '#8fd0f4'); sky.addColorStop(1, '#d8f0fb');
    x.fillStyle = sky; x.fillRect(0, 0, W, 40);
    x.fillStyle = '#7fa8c8'; x.fillRect(0, 30, W, 4);   // 遠くの山なみ
    x.fillStyle = '#6dbb4c'; x.fillRect(0, 34, W, H - 34);   // 田んぼ（あぜ道の下まで）
    x.fillStyle = '#4f9a3e';
    for (let r = 0; r < 5; r++) for (let c = 0; c < 20; c++) x.fillRect(((c * 8 + r * 4 - now / 90) % (W + 8) + W + 8) % (W + 8) - 4, 37 + r * 5, 3, 3);   // 稲（風で ゆれて流れる）
    for (let c = 0; c < W; c++) {   // 地面：台地の土手 → 坂 → 田んぼの あぜ道
      const y = Math.round(gY(c + 0.5));
      x.fillStyle = '#c8b078'; x.fillRect(c, y, 1, H - y);
      if (y < LOW) {   // 台地の土手（高い所）：こい土の色に、等高線のような 点の線
        x.fillStyle = '#a8905c'; x.fillRect(c, y + 3, 1, LOW + 3 - (y + 3));
        x.fillStyle = '#86703f'; for (let k = 50; k < LOW + 3; k += 5) if (k > y + 3 && c % 3 !== 0) x.fillRect(c, k, 1, 1);
        if (c < S0 && c % 7 === 2) { x.fillStyle = '#4f9a3e'; x.fillRect(c, y - 2, 2, 2); }   // 台地の上の草
      }
    }
    x.fillStyle = '#b09860'; for (let c = 0; c < 20; c++) { const sx = c * 9 + 3; if (sx > S1) x.fillRect(sx, 64 + (c % 2) * 3, 3, 1); }
  };
  const step = now => {
    if ($('intro').hidden) return;
    const dt = Math.min(0.05, (now - (st.last || now)) / 1000);
    st.last = now;
    const x0 = st.x;
    if (st.mode === 'drive') { st.x += DRIVE * dt; if (st.x >= S0 - 6) { st.mode = 'free'; st.v = DRIVE; } }   // 台地の上は 押して進む
    else if (st.mode === 'free') {   // 坂：ひとりでに速くなり、下りきると ころがり抵抗で ゆっくり止まる
      st.v += (K * (gY(st.x + 0.5) - gY(st.x - 0.5)) - FR - DRAG * st.v) * dt;
      if (st.v <= 0) { st.v = 0; st.mode = 'rest'; st.rest = 2; }
      else { st.x += st.v * dt; if (x0 < S1 && st.x >= S1) { st.sq = 0.14; st.sqv = 0; } }   // 下りきって ぺたっ
    } else if (st.mode === 'rest') { st.rest -= dt; if (st.rest <= 0) st.mode = 'leave'; }
    else { st.x += LEAVE * dt; if (st.x > W + 24) { st.x = -24; st.mode = 'drive'; } }
    const dx = st.x - x0;
    if (dx > 0.001) { st.ang += dx / 9; st.av = dx / 9 / Math.max(dt, 1e-3); }   // 進んだ分だけ回る（半径9点）
    else {   // 止まっている：起き上がりこぼし
      const up = Math.round(st.ang / (Math.PI * 2)) * Math.PI * 2;
      st.av += (up - st.ang) * 70 * dt; st.av *= Math.pow(0.86, dt * 60); st.ang += st.av * dt;
    }
    st.sqv += (-st.sq * 260 - st.sqv * 14) * dt; st.sq += st.sqv * dt;   // つぶれの ばね
    scene(now);
    x.imageSmoothingEnabled = false;
    const gy = gY(st.x), th = st.ang, low = Math.sqrt((10 * Math.sin(th)) ** 2 + (13.5 * Math.cos(th)) ** 2);   // たて長のつぶ：寝ころぶと低く
    x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(Math.round(st.x - 8), Math.round(gy) + 1, 16, 2);
    const cy = gy - low * (1 - st.sq);
    const mood = st.mode === 'free' && st.v > 45 ? 'excited' : st.mode === 'rest' && st.rest > 0.7 ? 'happy' : st.mode === 'rest' && now % 3700 < 140 ? 'blink' : 'smile';   // 表情：坂で速いと ><、止まると ^^
    if (!(window.nishioPixel && nishioPixel.drawRice && nishioPixel.drawRice(x, st.x, cy, th % (Math.PI * 2), st.sq, mood)) && img.complete && img.naturalWidth) {   // 丸く見える描き方（pixel.js）。読めるまでは 絵を回す
      x.save(); x.translate(Math.round(st.x), Math.round(cy)); x.rotate(th % (Math.PI * 2));
      x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0, 32, 32, -16, -16, 32, 32);
      x.restore();
    }
    requestAnimationFrame(step);
  };
  img.src = 'nishio-go/art/rice.png';
  requestAnimationFrame(step);
}
document.addEventListener('DOMContentLoaded', introHero);

/* はじめに */
// 友だちのシェアから来た人（share.js が nsg_friend を立てる）：はじめて遊ぶときに +20pt（1回だけ）。
// 遊びかた（setMode）を決めてから、ポイントを足して保存し、そのあとで「もらった」にする（とちゅうで閉じても なくならない）。知らせだけ少しあとに
const FRIEND_BONUS = 20;
function friendBonus() {
  if (store.get('nsg_friend', 0) !== 1) return;
  gainPoints(FRIEND_BONUS); save();
  store.set('nsg_friend', 2);
  track('friend_bonus', { mode: demo ? 'play' : 'walk' });
  setTimeout(() => toast(`👋 友だちのシェアから来てくれた人に +${FRIEND_BONUS}pt`), 1500);
}
function begin(isDemo) {
  if (!store.get('nsg_started', false)) store.set('nsg_begin_t', Date.now());
  if (!store.get('nsg_first_day', '')) store.set('nsg_first_day', ymd());
  store.set('nsg_started', true);
  track('game_start', { mode: isDemo ? 'play' : 'walk' });
  $('intro').hidden = true;
  // 操作して遊ぶは、スティックで歩けるドット絵の地図で始める（ふつうの地図にしていた人も）
  if (isDemo && !document.body.classList.contains('px') && window.nishioPixel) nishioPixel.setActive(true);
  setMode(isDemo);
  friendBonus();
  // はじめての人は、せかいちずではなく歩く地図から（すぐ近くの ようこそ たからばこ と主人公が見えて、おまかせ歩きも動く）
  if (isDemo && welcomeDue() && window.nishioPixel && nishioPixel.worldMode) nishioPixel.setWorld(false);
  if (isDemo) toast(document.body.classList.contains('px')
    ? (welcomeDue() ? (simple() ? '🎁 すぐ近くに たからばこ！' : '🎁 すぐ近くに たからばこ！ スマホを傾けて（矢印キー・地図を タップでも）近づくと開きます') : '🌀 スマホを傾けて、迷路を 進もう（矢印キー・地図を タップでも）')
    : '🎮 地図をタップするとその場所へ移動します');
  setTimeout(sealPickCheck, 3000);   // えらぶ前に閉じた しるしの2枚
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
  $('intro').hidden = true; setMode(demo);   // setMode が1回に遊んだ時間を数えはじめる
}
else {
  track('intro_view', {});   // はじめての人は、遊びかたを選んだとき（begin）から1回に遊んだ時間を数える
  // 押すのに 抵抗が ある人へ：iPhone は 傾きの 確認が 出ることを 先に 伝える。8秒 押されなければ、いちばん上の ボタンが はねて お米の ふきだし（1回だけ。アクセス解析に intro_nudge）
  if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') $('iosTiltNote').hidden = false;
  setTimeout(() => {
    const b = $('meiroBtn');
    if ($('intro').hidden || !b) return;
    b.classList.add('nudge');
    const tip = document.createElement('span');
    tip.className = 'nudge-tip'; tip.setAttribute('aria-hidden', 'true'); tip.textContent = '🍚 おしても だいじょうぶ！';
    b.append(tip);
    track('intro_nudge', {});
  }, 8000);
}
setInterval(() => { renderMarkers(); refreshNearby(); }, 10000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderMarkers(); refreshNearby(); idleCheck(); } else idleMark(); });
window.addEventListener('pagehide', idleMark);
// 開いている間は るすばん にならない。端末がスリープしていたなどで しばらくタイマーが止まっていたときは、先に おかえり を渡す
setInterval(() => { if (!document.hidden && demo) { if (Date.now() - idleOf().last < 5 * 60000) idleMark(); else idleCheck(); } }, 60000);
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-up]'); if (b) buyUp(b.dataset.up); });

// ドット絵表示（pixel.js）とテストから使う窓口
window.nishioGo = {
  set mzShareTest(v) { mzShare = v; }, snapMaze,   // テスト用：めいろの ゴールの シェア（mzShare）を 置く・遊んでいる 画面を とる
  sound,
  get state() { return S; }, get stateKey() { return stateKey(); }, get spotsVersion() { return spotsVersion; }, get spots() { return spots; }, get me() { return me; }, get demo() { return demo; },
  get areas() { return areas; }, areaProgress,
  get selected() { return selected; }, CFG, REGION, playBounds, cityAt, cityNear, placeAt, setPlace, inPlay,
  // share.js（シェア・広告からの来訪）から使う
  begin, track, utmUrl, jumpReward, harvestReward, dankyuReward, hiryoReward, medashiDue, medashiReward, mushiDue, mushiReward, oldmapFound, oldmapHas, bookEvDone, bookEvHas, kiraraFound, kiraraHas, yatsuMushiDue, yatsuMushiSeen, yatsuMushiReward, rewardBusy, rewardSoon, showReward, toastHold, toastFlush, miniBest, miniRecords, miniStart, FRIEND_BONUS,
  get started() { return store.get('nsg_started', false); }, openTab,
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
  dist, cooldownLeft, inReach, reachOf, guideRadius, renderGuide, checkin, checkinSpot, popupHtml, toast, toastAfter, renderLog, ymd, refreshNearby, get npcs() { return placeNpcs(); }, weekTheme, giveBag, talkNpc, callNpc(id) { calledBy = id || null; }, meetCritter, critterLeft, critterFirst: () => !Object.keys(S.critters || {}).length, watchOpen, watchWater, alleyFind, mzGrain, mzShoo, mzGrainHas: key => mzGrainGot().includes(key), get mzGrains() { return mzGrainGot().length; }, alleyOpen: (x, y) => (dayState().alleys || 0) < ALLEY.daily && !(S.alleys || []).includes(`${x},${y}`), sealCands, sealPickCheck, clearInfo: () => ({ cleared: !!S.cleared, got: SEAL_MAIN.filter(id => (S.seals || []).includes(id)).length, need: SEAL_MAIN.length }), get rival() { return rivalWhere(); }, RIVAL, areaArt, npcMet, chestOpened: id => dayState().chests.includes(id), liveChests, get welcomeChest() { return welcomeDue(); },
  moveTo(lat, lng, kind) { if (!demo) return; follow = false; stepMove = kind === 'step'; try { onFix(lat, lng, 5, Date.now()); } finally { stepMove = false; } },
  get driving() { return driving; },
  get guide() { return guideTarget(); }, decideGuide, setGuide,
  autoInterval, autoLearn, idleCheck, buyUp, IDLE,
  setDriving(on) { driving = !!on && demo; if (!driving) tryChest(); refreshNearby(); },
  invalidateMap() { setTimeout(() => { map.invalidateSize(); if (me) map.setView([me.lat, me.lng]); }, 0); },
  onModeChange(fn) { modeListeners.push(fn); },
};
})();
