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

// OpenStreetMap への問い合わせと分類は osm-query.js（tools/bake-spots.js と共通）
const { buildQuery, toItems } = window.NSG_OSM;

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
    visits: {}, log: [], streak: { last: '', days: 0, max: 0 }, badges: [], coupons: [], day: null, facts: [], met: [] };
}
let demo = store.get('nsg_mode', 'real') === 'demo';
const stateKey = () => demo ? 'nsg_state_demo' : 'nsg_state';
function loadState() {
  const s = store.get(stateKey(), null);
  return s && s.v === 1 ? Object.assign(freshState(), s) : freshState();
}
let S = loadState();
const modeListeners = [];   // あるいて移動／操作して移動の切り替えを知らせる先（pixel.js）
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
  const osm = osmItems.map(([id, name, cat, lat, lng, raw]) => ({ id, name, raw: raw || name, cat, lat, lng }));
  // spots.json の normal: true は、ふつうのスポットとして足す（OpenStreetMap にない社寺を Wikidata から足したもの）
  for (const c of config) if (c && c.normal && c.id && c.name && Number.isFinite(c.lat) && Number.isFinite(c.lng))
    osm.push({ id: 'n-' + c.id, name: String(c.name), raw: String(c.name), cat: CATS[c.cat] ? c.cat : 'sight', lat: c.lat, lng: c.lng });
  const used = new Set();
  const num = (v, max) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : undefined; };
  const featured = [];
  for (const c of config) {
    if (!c || !c.id || !c.name || c.normal) continue;
    const hasPos = Number.isFinite(c.lat) && Number.isFinite(c.lng);
    const s = { id: 'f-' + c.id, name: String(c.name), cat: 'featured', kind: CATS[c.cat] ? c.cat : 'featured',
      icon: c.icon || '⭐', lat: c.lat, lng: c.lng, featured: true, approx: hasPos && !!c.approx,
      points: num(c.points, 500), reach: num(c.reach, 300), desc: c.desc ? String(c.desc) : '',
      area: typeof c.area === 'string' ? c.area : null,
      shop: !!c.shop, url: typeof c.url === 'string' && /^https:\/\//.test(c.url) ? c.url : '' };
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
  const query = buildQuery([...new Set(config.flatMap(c => (c ? matchesOf(c) : [])))]);
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
      items = await fetchOverpass(query);
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
  if (s.shop) cls.push('shop');
  if (cooldownLeft(s) > 0) cls.push('cool');
  else if (inReach(s)) cls.push('near');
  if (S.visits[s.id]) cls.push('visited');
  return cls.join(' ');
}

function makeIcon(s, cls) {
  const size = s.shop ? 50 : s.featured ? 42 : 34;
  return L.divIcon({ className: '', html: `<div class="${cls}">${iconOf(s)}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

function popupHtml(s) {
  const c = s.featured ? null : (CATS[s.cat] || CATS.sight);
  const v = S.visits[s.id];
  const left = cooldownLeft(s);
  const d = me ? fmtM(dist(me, s)) : '—';
  return `<div class="popup"><h4>${esc(s.name)}</h4>
    <p>${s.shop ? '<span class="tag shop">🍚 当店（近藤米穀店）</span>' : s.featured ? '<span class="tag gold">⭐ 注目スポット</span>' : `<span class="tag">${c.i} ${c.n}</span>`}
    <span class="tag">${ptsOf(s)}pt</span></p>
    ${s.desc ? `<p>${esc(s.desc)}</p>` : ''}
    ${spotEvents(s).map(x => `<p class="ev">📅 ${esc(x.when)}　${esc(x.e.name)}</p>`).join('')}
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
// 話す中身：その人のことばと、その場所で今月・来月にある行事の話
function npcPages(n) {
  const pages = n.lines.slice();
  const ev = spotEvents({ id: 'f-' + n.spot });
  if (ev.length) pages.push(`そうそう、${ev.map(x => `${x.when}に「${x.e.name}」`).join('、')}があるもんで、よかったら来てみりん。`);
  return pages;
}
// 話しかける（近くにいれば話す。はじめてなら +10pt）。戻り値：{ html, near }
function talkNpc(id, page = 0) {
  const n = placeNpcs().find(x => x.id === id);
  if (!n) return null;
  const d = me ? dist(me, n) : Infinity, lim = demo ? NPC_TALK_M.play : NPC_TALK_M.walk;
  const head = `<div class="popup npc"><h4>${NPC_LOOK[n.look] || '🙂'} ${esc(n.name)}</h4><p class="npc-at">${esc(n.spotName)}のそば</p>`;
  if (driving) return { near: false, html: `${head}<p class="npc-say">（車に乗ったままでは話せない。車を降りて話しかけてみよう）</p></div>` };
  if (d > lim) {
    return { near: false, html: `${head}<p class="npc-say">（遠くて声が届かない。近づいて話しかけてみよう${Number.isFinite(d) ? `：あと${fmtM(d - lim)}` : ''}）</p>
      ${demo ? `<button type="button" class="btn mini" data-move-npc="${esc(n.id)}">近くへ移動（操作モード）</button>` : ''}</div>` };
  }
  if (page === 0 && !npcMet(n.id)) {
    S.met = [...(S.met || []), n.id];
    S.log.unshift({ type: 'npc', t: Date.now(), pts: 10, name: `${n.name}と話した`, icon: NPC_LOOK[n.look] || '💬' });
    const lvUp = gainPoints(10);
    save();
    sound.jingle(lvUp ? 'levelup' : 'checkin');
    toast(`💬 はじめて話した：${n.name} +10pt${lvUp ? `　🎉 Lv${lvUp}` : ''}`);
    track('npc_talk', { npc: n.id, mode: demo ? 'play' : 'walk' });
    setTimeout(checkBadges, 800);
  }
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
  if (n) { map.closePopup(); follow = false; onFix(n.lat - 12 / 111320, n.lng, 5, Date.now()); }
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
}

function startGps() {
  if (!('geolocation' in navigator)) { gpsError = 'この端末・ブラウザは位置情報に対応していません。'; refreshNearby(); return; }
  stopGps();
  setStatus('位置情報を取得しています…（屋外の方が早く取れます）');
  watchId = navigator.geolocation.watchPosition(
    pos => { if (!demo) onFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.timestamp || Date.now()); },
    err => {
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
  S.log = S.log.slice(0, 200);
  renderHeader();
  return levelOf(S.total) > before ? levelOf(S.total) : 0;
}

let selected = null;   // シートに表示中のチェックイン候補

// 当店にチェックインしたときの一言（ricepia.jp の内容から）
const SHOP_NOTE = '西尾のお米屋さん（明治25年創業）。車に乗ったままお米を受け取れるドライブスルーや、24時間つかえるコイン精米所もあります。くわしくは ricepia.jp で。';
function checkin() {
  const s = selected;
  if (!s || !me) return;
  if (driving) { toast('🚗 車を降りてからチェックインしてね（十字ボタンのまん中）'); return; }
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
  const lvUp = gainPoints(total);
  save();

  const btn = $('spinBtn');
  btn.classList.remove('go'); void btn.offsetWidth; btn.classList.add('go');
  showReward(total, s.name, s.shop ? [...lines, '🍚 当店に来てくれてありがとう！'] : lines, lvUp, s.shop ? SHOP_NOTE : '');
  map.closePopup();
  renderMarkers();
  refreshNearby();
  updateQuests(1200);   // チェックインの知らせのあとにクエスト達成を知らせる
  setTimeout(checkBadges, 2700);
}

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
const todayEvents = () => EVENTS.filter(e => evDate(e) === ymd());

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
  if (rnd() < 0.35) qs[2] = { id: 'shop', icon: '🌾', text: '当店（近藤米穀店）に寄る', goal: 1, pts: 80, val: d => d.shop };
  // ときどき「今月の行事の会場に行く」（会場がスポットになっていて、船のいらない所だけ）
  const evs = monthEvents(new Date(date + 'T12:00:00')).filter(e => e.spot && !ISLAND_SPOTS.has(e.spot)), er = seeded(hashStr('event:' + date));
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
   置き場所は pixel.js が決める（日付と400m四方の区画から。あるいて移動では公園・神社・お寺などのそばだけ）。近づくと開いて、ポイントと西尾のまめちしき */
function factPool() {   // まめちしき：地区の豆知識・紹介文と、注目スポットの説明（どれも出典つきのデータから）
  const m = new Map();
  for (const a of areas) {
    if (a.trivia) m.set(`a:${a.id}:t`, `${a.name}：${a.trivia}`);
    if (a.summary) m.set(`a:${a.id}:s`, `${a.name}：${a.summary}`);
  }
  for (const s of spots) if (s.featured && s.desc) m.set(`s:${s.id}`, `${s.name}：${s.desc}`);
  for (const e of EVENTS) if (e.desc) m.set(`e:${e.id}`, `${e.name}（${e.when}・${e.place}）：${e.desc}`);
  return m;
}
// たからばこで出すまめちしき：まだ持っていないものから、①そのスポットの話・そこでの行事 ②同じ地区の話 ③ほか の順に選ぶ
function pickFact(c) {
  const pool = factPool(), keys = [...pool.keys()], fresh = keys.filter(k => !S.facts.includes(k));
  const list = fresh.length ? fresh : keys;
  if (!list.length) return '';
  let near = null, nd = Infinity;
  for (const s of spots) { const d = dist(c, s); if ((c.at ? s.name === c.at : true) && d < nd) { near = s; nd = d; } }
  const area = near && near.area, inArea = id => { const s = spots.find(x => x.id === id); return s && s.area === area; };
  const tiers = [
    k => near && (k === `s:${near.id}` || EVENTS.some(e => k === `e:${e.id}` && evSpotId(e) === near.id)),
    k => area && (k.startsWith(`a:${area}:`) || (k.startsWith('s:') && inArea(k.slice(2))) || EVENTS.some(e => k === `e:${e.id}` && e.spot && inArea(evSpotId(e)))),
    () => true,
  ];
  for (const t of tiers) { const g = list.filter(t); if (g.length) return g[hashStr(c.id) % g.length]; }
  return '';
}
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
  const c = n.c, d = dayState();
  d.chests.push(c.id);
  const pick = pickFact(c);
  track('chest_open', { mode: demo ? 'play' : 'walk' });
  if (pick && !S.facts.includes(pick)) S.facts.push(pick);
  S.log.unshift({ type: 'chest', t: Date.now(), pts: c.pts, name: 'たからばこ', icon: '🎁' });
  const lvUp = gainPoints(c.pts);
  save();
  showReward(c.pts, 'たからばこを見つけた！', [`🎁 たからばこ +${c.pts}`], lvUp, pick ? factPool().get(pick) : '');
  updateQuests(1500);
  refreshNearby();
}

/* ---------- 近くのスポット ---------- */
function refreshNearby() {
  const btn = $('spinBtn');
  syncChestMarkers();   // 位置がまだないときも、前のモードのたからばこの印は消す
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
    const why = driving ? '🚗 車を降りるとチェックインできます'
      : lock > 0 ? `🚗 乗り物判定中：あと約${Math.ceil(lock / 1000)}秒で押せます`
      : !demo && me.acc > CFG.maxAccuracy ? '📡 GPSの精度が上がるのを待っています…' : '';
    btn.disabled = !!why;
    $('spinSub').textContent = why || `タップして +${ptsOf(selected)}pt${S.visits[selected.id] ? '' : '（初訪問ボーナスあり）'}`;
  } else {
    btn.hidden = true;
  }

  const msgs = [];
  if (driving) msgs.push('🚗 軽トラで移動中（道だけ走れます。歩いたポイントは降りてから）');
  if (demo && !document.body.classList.contains('px')) msgs.push('🎮 地図をタップして移動');
  else if (!nishioBounds.contains([me.lat, me.lng])) msgs.push('📍 いまは西尾市の外にいるようです');
  if (!demo && Date.now() < vehicleUntil) msgs.push('🚗 乗り物で移動中と判定しました（しばらくチェックインできません）');
  if (!demo && me.acc > CFG.maxAccuracy) msgs.push(`📡 GPSの誤差が大きめです（約${Math.round(me.acc)}m）`);
  if (!selected) {
    if (nearest) msgs.push(`いちばん近いスポット：<b>${esc(nearest.name)}</b>（${fmtM(nearestD)}）`);
    else if (spotsLoading && !spots.length) msgs.push('スポットを読み込んでいます…');
    else if (spots.length) msgs.push('近くのスポットはすべてチェックイン済みです。時間をおいてまた来てね。');
    else msgs.push('スポットがありません。「せってい」から再読み込みしてください。');
  }
  const te = todayEvents();
  if (te.length) msgs.push(`📅 きょうは ${te.slice(0, 2).map(e => `「${esc(e.name)}」`).join('')}${te.length > 2 ? ` ほか${te.length - 2}件` : ''}（きろくで見られます）`);
  const ch = nearestChest();
  if (ch && ch.d <= 300) msgs.push(`🎁 たからばこが近くにある！（${ch.c.at ? `${esc(ch.c.at)}・` : ''}${fmtM(ch.d)}）`);
  if (map.getZoom() < 14 && !document.body.classList.contains('px')) msgs.push('🔍 拡大すると、ふつうのスポットも表示されます');
  const wd = S.walkDay.date === ymd() ? S.walkDay.pts : 0, qd = todaysQuests().filter(q => dayState().done.includes(q.id)).length;
  msgs.push(`📜 今日のクエスト ${qd}/3　👣 歩き ${wd}/${CFG.walkDailyCap}pt`);
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
    { id: 'npc5', i: '💬', n: 'ご近所さん', d: '西尾の人5人と話す', cur: (S.met || []).length, goal: 5 },
    { id: 'npcall', i: '🤝', n: '西尾の顔なじみ', d: `西尾の人${(window.NISHIO_NPCS || []).length}人みんなと話す`, cur: (S.met || []).length, goal: Math.max((window.NISHIO_NPCS || []).length, 1) },
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
  document.querySelectorAll('.mode-sw [data-mode]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.mode === 'demo') === demo)));
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3800);
}

function showReward(total, name, lines, lvUp, fact) {
  sound.jingle(lvUp ? 'levelup' : 'checkin');
  const el = $('reward');
  el.innerHTML = `<div class="rw${fact ? ' long' : ''}"><div class="big">+${total}pt</div><div class="nm">${esc(name)}</div>
    <ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
    ${fact ? `<p class="fact">💡 ${esc(fact)}</p>` : ''}
    ${lvUp ? `<div class="lvup">🎉 レベルアップ！<br/><span>Lv${lvUp}「${esc(titleOf(lvUp))}」</span></div>` : ''}</div>`;
  if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
  clearTimeout(showReward.t); showReward.t = setTimeout(() => { el.innerHTML = ''; }, fact ? 7000 : 2700);
}

function renderLog() {
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
  $('factList').innerHTML = S.facts.filter(k => facts.has(k)).slice().reverse().map(k => `<li><span class="ico">💡</span><span class="main"><small>${esc(facts.get(k))}</small></span></li>`).join('')
    || '<li class="empty">🎁たからばこを開けると、西尾のまめちしきが集まります</li>';
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
  if (document.body.classList.contains('px') && window.nishioPixel) nishioPixel.centerOnMe();   // ドット絵の地図（せかいちず）でも主人公へ
  if (me) map.setView([me.lat, me.lng], Math.max(map.getZoom(), 16));
  else toast(demo ? '地図をタップして移動してください' : '位置情報を取得中です…');
});

/* モード切替 */
function setMode(isDemo) {
  const here = !demo && me ? me : null;   // 歩いていた場所から操作を始める（まだ位置がなければ地図のまん中）
  demo = isDemo;
  store.set('nsg_mode', demo ? 'demo' : 'real');
  S = loadState();
  me = null; lastWalk = null; driving = false;   // 乗り物判定（vehicleUntil）はモードを切り替えても保持する
  if (meMarker) { meMarker.remove(); accCircle.remove(); meMarker = accCircle = null; }
  if (demo) {
    stopGps();
    const c = here || map.getCenter();
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
  if ($('panel-log') && !$('panel-log').hidden) openTab('map');   // きろくの「行く」から来たときは地図へ
});
function switchMode(isDemo) {
  if (isDemo === demo) return;
  setMode(isDemo);
  track('mode_switch', { mode: demo ? 'play' : 'walk' });
  toast(demo ? `🎮 操作して移動にしました（${document.body.classList.contains('px') ? '十字ボタンで歩きます' : '地図をタップした所へ移動します'}。記録は別です）`
    : '🚶 あるいて移動にしました（位置情報を使います）');
}
$('demoToggle').addEventListener('change', e => switchMode(e.target.checked));
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
  const VOL = 0.45, LOOP = new Set(['field', 'world']), els = {}, missing = new Set();
  let on = store.get('nsg_bgm', true), unlocked = false, scene = 'field', cur = null, ducking = 0;   // ducking：鳴っている効果音の数
  const el = k => {
    if (!els[k]) {
      const a = new Audio(); a.preload = 'none'; a.loop = LOOP.has(k); a.volume = VOL; a.src = SRC[k];
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
    $('sndBtn').textContent = on ? '🔊' : '🔇';
    $('sndBtn').setAttribute('aria-label', on ? '音楽（BGM）をオフにする' : '音楽（BGM）をオンにする');
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
$('sndBtn').addEventListener('click', () => { sound.toggle(); toast(store.get('nsg_bgm', true) ? '🔊 音楽をオンにしました' : '🔇 音楽をオフにしました'); });
$('bgmToggle').addEventListener('change', e => sound.toggle(e.target.checked));
// アクセス解析（analytics.js）のオン・オフ。切り替えは次に開いたときから
$('anaToggle').checked = !store.get('nsg_noanalytics', false);
$('anaToggle').addEventListener('change', e => { try { localStorage.setItem('nsg_noanalytics', e.target.checked ? '0' : '1'); } catch (err) { /* noop */ } toast(e.target.checked ? '📊 アクセス解析をオンにしました（次に開いたときから）' : '📊 アクセス解析をオフにしました（次に開いたときから送りません）'); });
sound.apply();

/* 下の案内パネルの高さ（チェックインのボタンが出ると高くなる）を CSS に知らせ、十字ボタンや丸ボタンが隠れないようにする */
if (window.ResizeObserver) new ResizeObserver(() => document.documentElement.style.setProperty('--sheet-h', $('sheet').offsetHeight + 'px')).observe($('sheet'));

/* はじめに */
function begin(isDemo) {
  store.set('nsg_started', true);
  track('game_start', { mode: isDemo ? 'play' : 'walk' });
  $('intro').hidden = true;
  // 操作して遊ぶは、十字ボタンで歩けるドット絵の地図で始める（ふつうの地図にしていた人も）
  if (isDemo && !document.body.classList.contains('px') && window.nishioPixel) nishioPixel.setActive(true);
  setMode(isDemo);
  if (isDemo) toast(document.body.classList.contains('px')
    ? '🎮 左下の十字ボタン（矢印キー）で歩きます'
    : '🎮 地図をタップするとその場所へ移動します');
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
  sound,
  get state() { return S; }, get spotsVersion() { return spotsVersion; }, get spots() { return spots; }, get me() { return me; }, get demo() { return demo; },
  get areas() { return areas; }, areaProgress,
  get selected() { return selected; }, CFG,
  dist, cooldownLeft, inReach, reachOf, popupHtml, toast, ymd, refreshNearby, get npcs() { return placeNpcs(); }, talkNpc, npcMet, chestOpened: id => dayState().chests.includes(id), liveChests,
  moveTo(lat, lng) { if (!demo) return; follow = false; onFix(lat, lng, 5, Date.now()); },
  get driving() { return driving; },
  setDriving(on) { driving = !!on && demo; if (!driving) tryChest(); refreshNearby(); },
  invalidateMap() { setTimeout(() => { map.invalidateSize(); if (me) map.setView([me.lat, me.lng]); }, 0); },
  onModeChange(fn) { modeListeners.push(fn); },
};
})();
