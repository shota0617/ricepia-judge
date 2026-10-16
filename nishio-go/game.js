/* にしおさんぽGO — 西尾市を歩いてスポットを巡るポイントラリー
 * 外部ライブラリ：Leaflet のみ。データはすべて localStorage（キー接頭辞 nsg_）。 */
(() => {
'use strict';

const CFG = {
  center: [34.8625, 137.0570],            // 名鉄西尾駅〜西尾城跡のあたり
  nishioBounds: [[34.69, 136.96], [34.93, 137.21]], // 西尾市（佐久島を含む）のおおよその範囲
  reach: 40,                // チェックインできる距離（m）
  reachApprox: 120,         // 位置が概算の注目スポットは広めに
  accSlack: 25,             // GPS誤差として上乗せする最大値（m）
  maxAccuracy: 80,          // これより精度が悪いとチェックイン不可（m）
  cooldownMin: 60,          // 同じスポットに再チェックインできるまで（分）
  pts: { normal: 10, featured: 30, first: 30, firstFeatured: 100, daily: 20, streakStep: 5, streakMax: 6 },
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

// 注目スポットの名前（spots.json の match）でも探す。名前だけで見つかったものは注目スポットにのみ使う
const reEsc = t => t.replace(/[.*+?^${}()|[\]\\"']/g, '.');   // 正規表現の記号は「任意の1文字」に（取得側は広め、照合はJSで厳密に）
const buildQuery = names => `[out:json][timeout:60];
area["name"="西尾市"]["admin_level"="7"]->.a;
(
  nwr["amenity"="place_of_worship"]["name"](area.a);
  nwr["historic"]["name"](area.a);
  nwr["tourism"~"^(attraction|museum|gallery|viewpoint|artwork|zoo|aquarium|theme_park)$"]["name"](area.a);
  nwr["leisure"="park"]["name"](area.a);
  nwr["amenity"="library"]["name"](area.a);
  nwr["railway"="station"]["name"](area.a);
  nwr["natural"="beach"]["name"](area.a);${names.length ? `
  nwr["name"~"${names.map(m => m.startsWith('=') ? `^${reEsc(m.slice(1))}$` : reEsc(m)).join('|')}"](area.a);` : ''}
);
out center tags;`;

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
const OSM_KEY = 'nsg_osm_v1';

function freshState() {
  return { v: 1, points: 0, total: 0, checkins: 0, walked: 0, walkCarry: 0, walkDay: { date: '', pts: 0 },
    visits: {}, log: [], streak: { last: '', days: 0, max: 0 }, badges: [], coupons: [] };
}
let demo = store.get('nsg_mode', 'real') === 'demo';
const stateKey = () => demo ? 'nsg_state_demo' : 'nsg_state';
function loadState() {
  const s = store.get(stateKey(), null);
  return s && s.v === 1 ? Object.assign(freshState(), s) : freshState();
}
let S = loadState();
const modeListeners = [];   // 本番／デモの切り替えを知らせる先（pixel.js）
const save = () => { if (!store.set(stateKey(), S)) toast('記録を保存できませんでした（ブラウザの保存領域を確認してください）'); };

/* ---------- 地図 ---------- */
if (!window.L) {
  $('status').textContent = '地図を読み込めませんでした。通信環境を確認して再読み込みしてください。';
  $('intro').hidden = true;
  return;
}
const map = L.map('map', { zoomControl: false, minZoom: 11, maxZoom: 19,
  maxBounds: L.latLngBounds([34.55, 136.80], [35.05, 137.40]), maxBoundsViscosity: 0.8 })
  .setView(CFG.center, 15);
L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
  minZoom: 5, maxNativeZoom: 18, maxZoom: 19,
  attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a> | スポット © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
}).addTo(map);
L.control.zoom({ position: 'topright' }).addTo(map);
const nishioBounds = L.latLngBounds(CFG.nishioBounds);

let follow = true;
map.on('dragstart', () => { follow = false; });

/* ---------- スポット ---------- */
let spots = [];
let spotMeta = { osm: 0, osmAt: 0, osmOk: false, featured: 0 };
const markers = new Map();

function catOf(t) {
  if (t.amenity === 'place_of_worship') return t.religion === 'shinto' ? 'shrine' : t.religion === 'buddhist' ? 'temple' : 'worship';
  if (t.historic === 'castle') return 'castle';
  if (t.historic) return 'historic';
  if (t.tourism === 'museum' || t.tourism === 'gallery') return 'museum';
  if (t.tourism === 'viewpoint') return 'view';
  if (t.tourism === 'artwork') return 'art';
  if (t.tourism) return 'sight';
  if (t.leisure === 'park') return 'park';
  if (t.amenity === 'library') return 'library';
  if (t.railway === 'station') return 'station';
  if (t.natural === 'beach') return 'beach';
  return 'other';   // 名前検索でだけ見つかったもの（ふつうのスポットにはしない）
}

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
  const osm = osmItems.map(([id, name, cat, lat, lng, raw]) => ({ id, name, raw: raw || name, cat, lat, lng }));
  const used = new Set();
  const num = (v, max) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : undefined; };
  const featured = [];
  for (const c of config) {
    if (!c || !c.id || !c.name) continue;
    const hasPos = Number.isFinite(c.lat) && Number.isFinite(c.lng);
    const s = { id: 'f-' + c.id, name: String(c.name), cat: 'featured', kind: CATS[c.cat] ? c.cat : 'featured',
      icon: c.icon || '⭐', lat: c.lat, lng: c.lng, featured: true, approx: hasPos && !!c.approx,
      points: num(c.points, 500), reach: num(c.reach, 300), desc: c.desc ? String(c.desc) : '',
      area: typeof c.area === 'string' ? c.area : null };
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
  if (!spots.length) { spots = buildSpots(config.filter(c => c && !c.approx), []); renderMarkers(); refreshNearby(); }

  let ok = false;
  const query = buildQuery([...new Set(config.flatMap(c => (c ? matchesOf(c) : [])))]);
  const stored = store.get(OSM_KEY, null);
  const cached = stored && stored.q === query ? stored : null;   // 注目スポットの名前が変わったら取り直す
  let items = null;
  if (!force && cached && Date.now() - cached.t < CFG.osmCacheDays * 864e5) {
    items = cached.items; spotMeta.osmAt = cached.t; spotMeta.osmOk = true; ok = true;
  } else {
    try {
      items = await fetchOverpass(query);
      spotMeta.osmAt = Date.now(); spotMeta.osmOk = true; ok = true;
      if (!store.set(OSM_KEY, { t: spotMeta.osmAt, q: query, items })) store.del(OSM_KEY);
    } catch (e) {
      const old = cached || stored;   // 取得できなければ古いキャッシュでも使う
      if (old) { items = old.items; spotMeta.osmAt = old.t; spotMeta.osmOk = true; }
      else if (!force) toast('スポット情報（OpenStreetMap）を取得できませんでした。注目スポットだけで遊べます。');
    }
  }
  spots = buildSpots(config, items || []);
  spotMeta.osm = (items || []).length;
  spotMeta.featured = spots.filter(s => s.featured).length;
  spotMeta.loaded = true;
  markers.forEach(m => m.remove());
  markers.clear();
  renderMarkers();
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
  if (cooldownLeft(s) > 0) cls.push('cool');
  else if (inReach(s)) cls.push('near');
  if (S.visits[s.id]) cls.push('visited');
  return cls.join(' ');
}

function makeIcon(s, cls) {
  const size = s.featured ? 42 : 34;
  return L.divIcon({ className: '', html: `<div class="${cls}">${iconOf(s)}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

function popupHtml(s) {
  const c = s.featured ? null : (CATS[s.cat] || CATS.sight);
  const v = S.visits[s.id];
  const left = cooldownLeft(s);
  const d = me ? fmtM(dist(me, s)) : '—';
  return `<div class="popup"><h4>${esc(s.name)}</h4>
    <p>${s.featured ? '<span class="tag gold">⭐ 注目スポット</span>' : `<span class="tag">${c.i} ${c.n}</span>`}
    <span class="tag">${ptsOf(s)}pt</span></p>
    ${s.desc ? `<p>${esc(s.desc)}</p>` : ''}
    <p>現在地から ${d}${s.approx ? '（位置は概算・広めに判定）' : ''}</p>
    <p>${v ? `訪問 ${v.n}回・最後 ${fmtTime(v.last)}` : 'まだ行ったことがありません'}</p>
    ${left ? `<p>再チェックインまで あと${Math.ceil(left / 60000)}分</p>` : ''}
    ${demo ? `<button type="button" class="btn mini" data-move="${esc(s.id)}">ここへ移動（デモ）</button>` : ''}</div>`;
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
map.on('moveend zoomend', renderMarkers);
map.on('zoomend', () => refreshNearby());

/* ---------- 現在地 ---------- */
let me = null;          // {lat,lng,acc,t}
let meMarker = null, accCircle = null, spotRing = null;
let lastWalk = null, vehicleUntil = 0, watchId = null, gpsError = '';

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
}

function startGps() {
  if (!('geolocation' in navigator)) { gpsError = 'この端末・ブラウザは位置情報に対応していません。'; refreshNearby(); return; }
  stopGps();
  setStatus('位置情報を取得しています…（屋外の方が早く取れます）');
  watchId = navigator.geolocation.watchPosition(
    pos => { if (!demo) onFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.timestamp || Date.now()); },
    err => {
      gpsError = err.code === 1
        ? '位置情報の利用が許可されていません。ブラウザの設定で「位置情報」を許可してから再読み込みしてください（「せってい」→デモモードでも試せます）。'
        : err.code === 3 ? '位置情報の取得に時間がかかっています…' : '位置情報を取得できませんでした。電波の良い屋外でお試しください。';
      refreshNearby();
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
}
function stopGps() { if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; } }

/* ---------- 歩いた距離 ---------- */
function trackWalk(p) {
  if (demo) {
    // デモ：タップで移動した距離のうち 500m 以内の移動だけを歩いた扱いにする
    if (lastWalk) { const d = dist(lastWalk, p); if (d <= 500) addWalk(d); }
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
  checkBadges();
}

/* ---------- ポイント ---------- */
const needFor = lv => 25 * (lv - 1) * lv;     // Lv2:50 Lv5:500 Lv10:2250 Lv20:9500 Lv30:21750
const levelOf = total => { let lv = 1; while (total >= needFor(lv + 1)) lv++; return lv; };
const titleOf = lv => TITLES.filter(([l]) => lv >= l).pop()[1];

function gainPoints(n) {
  const before = levelOf(S.total);
  S.points += n; S.total += n;
  S.log = S.log.slice(0, 200);
  renderHeader();
  return levelOf(S.total) > before ? levelOf(S.total) : 0;
}

let selected = null;   // シートに表示中のチェックイン候補

function checkin() {
  const s = selected;
  if (!s || !me) return;
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
  S.visits[s.id] = { n: (v ? v.n : 0) + 1, first: v ? v.first : now, last: now, name: s.name, cat: s.kind || s.cat, icon: iconOf(s), featured: !!s.featured };
  S.checkins++;
  S.log.unshift({ type: 'spot', t: now, pts: total, name: s.name, icon: iconOf(s), id: s.id });
  const lvUp = gainPoints(total);
  save();

  const btn = $('spinBtn');
  btn.classList.remove('go'); void btn.offsetWidth; btn.classList.add('go');
  showReward(total, s.name, lines, lvUp);
  map.closePopup();
  renderMarkers();
  refreshNearby();
  setTimeout(checkBadges, 2700);
}

/* ---------- 近くのスポット ---------- */
function refreshNearby() {
  const btn = $('spinBtn');
  if (!me) {
    btn.hidden = true;
    showRing(null);
    showGuide(null);
    setStatus(gpsError || (demo ? '地図をタップすると、その場所へ移動します。' : '位置情報を待っています…'));
    return;
  }
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
  showGuide(selected ? null : nearest);
  if (selected) {
    btn.hidden = false;
    btn.classList.toggle('feat', !!selected.featured);
    $('spinIco').textContent = iconOf(selected);
    $('spinName').textContent = selected.name;
    const lock = demo ? 0 : vehicleUntil - Date.now();
    const why = lock > 0 ? `🚗 乗り物判定中：あと約${Math.ceil(lock / 1000)}秒で押せます`
      : !demo && me.acc > CFG.maxAccuracy ? '📡 GPSの精度が上がるのを待っています…' : '';
    btn.disabled = !!why;
    $('spinSub').textContent = why || `タップして +${ptsOf(selected)}pt${S.visits[selected.id] ? '' : '（初訪問ボーナスあり）'}`;
  } else {
    btn.hidden = true;
  }

  const msgs = [];
  if (demo) msgs.push(document.body.classList.contains('px') ? '🟡 デモモード：十字ボタン（矢印キー）で歩く' : '🟡 デモモード：地図をタップして移動');
  else if (!nishioBounds.contains([me.lat, me.lng])) msgs.push('📍 いまは西尾市の外にいるようです');
  if (!demo && Date.now() < vehicleUntil) msgs.push('🚗 乗り物で移動中と判定しました（しばらくチェックインできません）');
  if (!demo && me.acc > CFG.maxAccuracy) msgs.push(`📡 GPSの誤差が大きめです（約${Math.round(me.acc)}m）`);
  if (!selected) {
    if (nearest) msgs.push(`いちばん近いスポット：<b>${esc(nearest.name)}</b>（${fmtM(nearestD)}）`);
    else if (spotsLoading && !spots.length) msgs.push('スポットを読み込んでいます…');
    else if (spots.length) msgs.push('近くのスポットはすべてチェックイン済みです。時間をおいてまた来てね。');
    else msgs.push('スポットがありません。「せってい」から再読み込みしてください。');
  }
  if (map.getZoom() < 14 && !document.body.classList.contains('px')) msgs.push('🔍 拡大すると、ふつうのスポットも表示されます');
  const wd = S.walkDay.date === ymd() ? S.walkDay.pts : 0;
  msgs.push(`👣 今日の歩きポイント ${wd}/${CFG.walkDailyCap}pt`);
  setStatus(msgs.join('<br/>'), true);
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
  const featTotal = spotMeta.featured;
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
    { id: 'featall', i: '⭐', n: '注目スポット制覇', d: `注目スポット${featTotal}か所すべて`, cur: countVisits(v => v.featured), goal: Math.max(featTotal, 1), ready: spotMeta.loaded && featTotal > 0 },
    ...areas.map(a => {
      const p = areaProgress(a.id);
      return { id: 'area-' + a.id, i: a.icon || '🗾', n: `${a.name}制覇`, d: `${a.name}の注目スポット${p.total}か所すべて`, cur: p.done, goal: Math.max(p.total, 1), ready: spotMeta.loaded && p.total > 0 };
    }),
    { id: 'walk5', i: '🚶', n: '5kmウォーカー', d: '合計5km歩く', cur: km, goal: 5 },
    { id: 'walk42', i: '🏃', n: 'フルマラソン', d: '合計42.195km歩く', cur: km, goal: 42.195 },
    { id: 'streak7', i: '📅', n: '1週間つづけた', d: '7日連続でチェックイン', cur: S.streak.max || 0, goal: 7 },
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

/* ---------- 画面 ---------- */
function setStatus(html, isHtml) { const el = $('status'); if (isHtml) el.innerHTML = html; else el.textContent = html; }

function renderHeader() {
  const lv = levelOf(S.total);
  const lo = needFor(lv), hi = needFor(lv + 1);
  $('lvNum').textContent = lv;
  $('lvFill').style.width = Math.min(100, ((S.total - lo) / (hi - lo)) * 100) + '%';
  $('ptsNum').textContent = S.points.toLocaleString();
  $('demoTag').hidden = !demo;
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3800);
}

function showReward(total, name, lines, lvUp) {
  const el = $('reward');
  el.innerHTML = `<div class="rw"><div class="big">+${total}pt</div><div class="nm">${esc(name)}</div>
    <ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
    ${lvUp ? `<div class="lvup">🎉 レベルアップ！<br/><span>Lv${lvUp}「${esc(titleOf(lvUp))}」</span></div>` : ''}</div>`;
  if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
  clearTimeout(showReward.t); showReward.t = setTimeout(() => { el.innerHTML = ''; }, 2700);
}

function renderLog() {
  const lv = levelOf(S.total);
  $('stats').innerHTML = [
    ['使えるポイント', S.points.toLocaleString(), 'pt'], ['レベル', `${lv}`, titleOf(lv)],
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
// 本番は active の特典だけ。デモでは無効の特典も「サンプル」として試せる
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
    ? 'デモモード：サンプルの特典で交換の流れを試せます（デモのクーポンはお店では使えません）。'
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
  $('cpShop').textContent = c.demo ? 'デモ（お店では使えません）' : rewardCfg.shop;
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
    : `${me.lat.toFixed(6)}, ${me.lng.toFixed(6)}（${demo ? 'デモの位置' : `誤差 約${Math.round(me.acc)}m`}）`;
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
  clearTimeout(showReward.t); $('reward').innerHTML = '';   // ほかのタブを開いたら、ポイントの知らせは消す
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  ['log', 'badges', 'rewards', 'settings'].forEach(t => { $('panel-' + t).hidden = t !== tab; });
  if (tab === 'rewards') renderRewards();
  if (tab === 'log') renderLog();
  if (tab === 'badges') renderBadges();
  if (tab === 'settings') { renderSpotInfo(); renderGpsInfo(); $('demoToggle').checked = demo; }
  if (tab === 'map') setTimeout(() => map.invalidateSize(), 0);
}
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => openTab(b.dataset.tab)));
$('lvBtn').addEventListener('click', () => openTab('badges'));

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
  if (me) map.setView([me.lat, me.lng], Math.max(map.getZoom(), 16));
  else toast(demo ? '地図をタップして移動してください' : '位置情報を取得中です…');
});

/* モード切替 */
function setMode(isDemo) {
  demo = isDemo;
  store.set('nsg_mode', demo ? 'demo' : 'real');
  S = loadState();
  me = null; lastWalk = null;   // 乗り物判定（vehicleUntil）はモードを切り替えても保持する
  if (meMarker) { meMarker.remove(); accCircle.remove(); meMarker = accCircle = null; }
  if (demo) {
    stopGps();
    const c = map.getCenter();
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
});
$('demoToggle').addEventListener('change', e => { setMode(e.target.checked); toast(demo ? `デモモードにしました（${document.body.classList.contains('px') ? '十字ボタンで歩く' : '地図タップで移動'}）` : '本番モードにしました'); });

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
  if (!confirm(`${demo ? 'デモ' : '本番'}モードのポイントと記録をすべて削除します。よろしいですか？`)) return;
  S = freshState(); save(); renderHeader(); renderLog(); renderMarkers(); refreshNearby(); closeCoupon();
  toast('記録を削除しました');
});

/* はじめに */
function begin(isDemo) {
  store.set('nsg_started', true);
  $('intro').hidden = true;
  setMode(isDemo);
  if (isDemo) toast(document.body.classList.contains('px')
    ? 'デモモード：＋で歩く地図にして、十字ボタン（矢印キー）で歩きます'
    : 'デモモード：地図をタップするとその場所へ移動します');
}
$('startBtn').addEventListener('click', () => begin(false));
$('demoBtn').addEventListener('click', () => begin(true));

/* 起動 */
renderHeader();
loadSpots(false);
loadAreas();
loadRewards();
if (store.get('nsg_started', false)) { $('intro').hidden = true; setMode(demo); }
setInterval(() => { renderMarkers(); refreshNearby(); }, 10000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderMarkers(); refreshNearby(); } });

// ドット絵表示（pixel.js）とテストから使う窓口
window.nishioGo = {
  get state() { return S; }, get spots() { return spots; }, get me() { return me; }, get demo() { return demo; },
  get areas() { return areas; }, areaProgress,
  get selected() { return selected; }, CFG,
  dist, cooldownLeft, inReach, reachOf, popupHtml, toast,
  moveTo(lat, lng) { if (!demo) return; follow = false; onFix(lat, lng, 5, Date.now()); },
  invalidateMap() { setTimeout(() => { map.invalidateSize(); if (me) map.setView([me.lat, me.lng]); }, 0); },
  onModeChange(fn) { modeListeners.push(fn); },
};
})();
