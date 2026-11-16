

(() => {
'use strict';



const ED = window.NSG_EDITION || { id: 'shop', shops: true };
const CFG = {
  center: [34.86253, 137.05725],
  nishioBounds: [[34.69, 136.96], [34.93, 137.21]],
  home: window.NSG_OSM.HOME,
  reach: 40,
  reachApprox: 120,
  accSlack: 25,
  maxAccuracy: 80,
  cooldownMin: 60,
  pts: { normal: 10, featured: 30, first: 30, firstFeatured: 100, daily: 20, streakStep: 5, streakMax: 6, questAll: 50 },
  walkUnitM: 100,
  walkUnitPts: 1,
  walkDailyCap: 100,
  trailUnit: 50,
  trailPts: 5,
  trailDailyCap: 50,
  walkMaxAcc: 35,
  walkMaxSpeed: 4.5,
  walkMaxGapSec: 180,
  vehicleSpeed: 8.5,
  vehicleLockMs: 120000,
  matchRadius: 1000,
  matchRadiusExact: 300,
  osmCacheDays: 7,
  overpass: ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'],
};


const REGION = (window.NISHIO_REGION && Array.isArray(window.NISHIO_REGION.cities)) ? window.NISHIO_REGION.cities : [];

function inRing(lat, lng, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][0] > lat) !== (r[j][0] > lat) && lng < (r[j][1] - r[i][1]) * (lat - r[i][0]) / (r[j][0] - r[i][0]) + r[i][1]) inside = !inside;
  }
  return inside;
}

function cityAt(lat, lng) {
  for (const c of REGION) {
    if (lat < c.bbox[0][0] || lat > c.bbox[1][0] || lng < c.bbox[0][1] || lng > c.bbox[1][1]) continue;
    if (c.rings.some(r => inRing(lat, lng, r))) return c;
  }
  return null;
}

const PAD_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function cityNear(lat, lng) {
  const c = cityAt(lat, lng);
  if (c) return c;
  for (const [a, b] of PAD_DIRS) { const n = cityAt(lat + a * 0.003, lng + b * 0.003); if (n) return n; }
  return null;
}

const AROUND = (window.NISHIO_REGION && Array.isArray(window.NISHIO_REGION.around)) ? window.NISHIO_REGION.around : [];
function aroundAt(lat, lng) {
  for (const c of AROUND) {
    if (lat < c.bbox[0][0] || lat > c.bbox[1][0] || lng < c.bbox[0][1] || lng > c.bbox[1][1]) continue;
    if (c.rings.some(r => inRing(lat, lng, r))) return c;
  }
  return null;
}

const placeAt = (lat, lng) => cityAt(lat, lng) || aroundAt(lat, lng) || cityNear(lat, lng);

const M_PER_LNG = 111320 * Math.cos(CFG.home.lat * Math.PI / 180);
const homeDist = (lat, lng) => Math.hypot((lat - CFG.home.lat) * 111320, (lng - CFG.home.lng) * M_PER_LNG);
const HOME_BOX = [[CFG.home.lat - CFG.home.r / 111320, CFG.home.lng - CFG.home.r / M_PER_LNG], [CFG.home.lat + CFG.home.r / 111320, CFG.home.lng + CFG.home.r / M_PER_LNG]];

const playBounds = REGION.reduce((b, c) => [[Math.min(b[0][0], c.bbox[0][0]), Math.min(b[0][1], c.bbox[0][1])], [Math.max(b[1][0], c.bbox[1][0]), Math.max(b[1][1], c.bbox[1][1])]],
  [[Math.min(CFG.nishioBounds[0][0], HOME_BOX[0][0]), Math.min(CFG.nishioBounds[0][1], HOME_BOX[0][1])], [Math.max(CFG.nishioBounds[1][0], HOME_BOX[1][0]), Math.max(CFG.nishioBounds[1][1], HOME_BOX[1][1])]]);

const NEAR_AREAS = new Set(['okazaki', 'anjo', 'hekinan', 'kota', 'gamagori', 'takahama']);

const PLAY_PAD = 0.003;
const inPlay = (lat, lng) => (lat > CFG.nishioBounds[0][0] && lat < CFG.nishioBounds[1][0] && lng > CFG.nishioBounds[0][1] && lng < CFG.nishioBounds[1][1])
  || homeDist(lat, lng) <= CFG.home.r + 300
  || [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([a, b]) => !!cityAt(lat + a * PLAY_PAD, lng + b * PLAY_PAD));


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


const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {  } },
};

const track = (name, params) => { if (window.nsgTrack) nsgTrack(name, params); };

const simple = () => document.body.classList.contains('simple');
const PI = (n, alt = '') => (window.NSG_ICONS ? NSG_ICONS.html(n, alt) : '');
const ART32 = (n, alt = '') => `<img class="pi art" src="nishio-go/art/${n}.png" alt="${esc(alt)}" width="32" height="32"/>`;
const ICON_ART = { bag: 'omiyage', chest: 'stat-chest', card: 'card', book: 'stat-book', fire: 'stat-fire', home: 'home', star: 'stat-star', bowl: 'bar-bowl', scroll: 'quest', flag: 'stat-flag',
  coin: 'stat-coin', pin: 'stat-pin', feet: 'stat-feet', medal: 'stat-medal', calendar: 'calendar', talk: 'talk', clock: 'clock',
  car: 'btn-car', walker: 'btn-walker', gift: 'tab-gift', new: 'new', jump: 'ricebag' };
const PIA = (ic, alt = '') => ICON_ART[ic] ? ART32(ICON_ART[ic], alt) : PI(ic, alt);
const OSM_KEY = 'nsg_osm_v1';

function freshState() {
  return { v: 1, points: 0, total: 0, checkins: 0, walked: 0, walkCarry: 0, walkDay: { date: '', pts: 0 },
    visits: {}, log: [], streak: { last: '', days: 0, max: 0 }, badges: [], coupons: [], day: null, facts: [], met: [],
    guide: null, guides: 0, guideDone: [], komeSeen: [], nimotsu: null, idle: { last: 0, lv: {} }, dots: [], kira: [], bags: [], treasureGot: 0, glowGoal: null, glowNear: [], treasureSpot: null, treasureLast: '', cacheGot: 0, questGot: 0, dinoGot: 0, chaseGot: 0, torchGot: 0, brigadeGot: 0, purifyGot: 0, rescueGot: 0, cubeGot: 0, energyGot: 0 };
}
let demo = store.get('nsg_mode', 'real') === 'demo';


if (!demo && store.get('nsg_started', false) && !store.get('nsg_keep_walk', false)) { demo = true; store.set('nsg_mode', 'demo'); }

const stateKey = () => (demo ? 'nsg_state_demo' : 'nsg_state') + (ED.shops ? '' : '_' + ED.id);
function loadState() {
  const s = store.get(stateKey(), null);
  return s && s.v === 1 ? Object.assign(freshState(), s) : freshState();
}
let S = loadState();
let stepMove = false;

let playInteracted = false;




let playT0 = 0;
const notePlayInput = () => { playInteracted = true; window.nsgHandMoved = true; if (!playT0) playT0 = performance.now(); if (window.NISHIO_IDLE_CARD && window.NISHIO_IDLE_CARD.play) window.NISHIO_IDLE_CARD.play(); };
const playSec = sec => (playT0 ? Math.min(sec, (performance.now() - playT0) / 1000) : sec);
const session = { start: Date.now(), on: false, gained: 0, rewards: 0 };
const modeListeners = [];
const save = () => { if (!store.set(stateKey(), S)) toast('このブラウザに きろくを 保存できませんでした。スマホの 空きや、ブラウザの 設定（プライベート モード など）を 見てみてね。'); };


if (!window.L) {

  $('status').innerHTML = '地図を読み込めませんでした。通信環境を確認して、もう 1回 読みこんでください。<br><button type="button" class="btn" id="mapRetry">もう 1回 読みこむ</button>';
  $('status').hidden = false;
  $('mapRetry').addEventListener('click', () => location.reload());
  $('intro').hidden = true;
  return;
}
const map = L.map('map', { zoomControl: false, minZoom: 11, maxZoom: 19,
  maxBounds: L.latLngBounds([playBounds[0][0] - 0.15, playBounds[0][1] - 0.15], [playBounds[1][0] + 0.15, playBounds[1][1] + 0.15]), maxBoundsViscosity: 0.8 })
  .setView(CFG.center, 15);
const gsiTiles = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
  minZoom: 5, maxNativeZoom: 18, maxZoom: 19,
  attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a> | スポット © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
});


const gsiSync = () => { const show = !document.body.classList.contains('px'); if (show && !map.hasLayer(gsiTiles)) gsiTiles.addTo(map); else if (!show && map.hasLayer(gsiTiles)) map.removeLayer(gsiTiles); };
new MutationObserver(gsiSync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
window.addEventListener('load', () => setTimeout(gsiSync, 500), { once: true });
L.control.zoom({ position: 'topright' }).addTo(map);

let follow = true;
map.on('dragstart', () => { follow = false; });


let spots = [], spotsVersion = 0;
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
      if (json.remark && /error|runtime/i.test(json.remark)) throw new Error(json.remark);
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

  const osm = osmItems.filter(it => inPlay(it[3], it[4])).map(([id, name, cat, lat, lng, raw]) => ({ id, name, raw: raw || name, cat, lat, lng }));

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

      sponsor: c.sponsor && typeof c.sponsor.name === 'string' ? { name: String(c.sponsor.name), text: c.sponsor.text ? String(c.sponsor.text) : '', url: typeof c.sponsor.url === 'string' && /^https:\/\//.test(c.sponsor.url) ? c.sponsor.url : '' } : null };
    const match = matchesOf(c);
    const cands = match.length ? osm.filter(o => !used.has(o.id) && match.some(m => nameMatches(o.raw, m))) : [];
    let best = null;
    if (hasPos) {

      let bestD = c.approx ? CFG.matchRadius : CFG.matchRadiusExact;
      for (const o of cands) { const d = dist(s, o); if (d < bestD) { best = o; bestD = d; } }
    } else if (cands.length && cands.every(o => dist(o, cands[0]) < 500)) {
      best = cands[0];
    }
    if (best) {
      s.lat = best.lat; s.lng = best.lng; s.approx = false;
      if (s.kind === 'featured' && best.cat !== 'other') s.kind = best.cat;
      cands.filter(o => dist(o, best) < 500).forEach(o => used.add(o.id));
    } else if (!hasPos) {
      continue;
    }
    featured.push(s);
  }

  const kept = [];
  const grid = new Map();
  const cell = p => `${Math.floor(p.lat / 0.0025)}:${Math.floor(p.lng / 0.0025)}`;
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


let areas = [];
async function loadAreas() {
  try {
    const res = await fetch('nishio-go/areas.json', { cache: 'no-cache' });
    const json = res.ok ? await res.json() : null;
    if (json && Array.isArray(json.areas)) areas = json.areas.filter(a => a && a.id && a.name && Number.isFinite(a.lat) && Number.isFinite(a.lng));
  } catch (e) {  }
  if (spotMeta.loaded) renderLog();
}


function areaNear(p) {
  let best = null, bd = Infinity;
  for (const x of spots) if (x.featured && x.area) { const d = dist(p, x); if (d < bd) { bd = d; best = x; } }
  return best ? best.area : '';
}

const leftLabel = (done, total) => total > 0 ? (done >= total ? 'コンプ！' : `あと${total - done}`) : '';
function areaProgress(id) {
  const list = spots.filter(s => s.featured && s.area === id);
  return { list, total: list.length, done: list.filter(s => S.visits[s.id]).length };
}


const TINT_AREAS = new Set(['nishio', 'isshiki', 'kira', 'hazu', 'sakushima']);
function areaTint(id, p) {
  if (!TINT_AREAS.has(id) || !p || !(p.total > 0) || !(p.done > 0)) return 0;
  return p.done >= p.total ? 3 : p.done * 2 > p.total ? 2 : 1;
}


const AREA_RGB = { nishio: [122, 168, 84], isshiki: [78, 146, 190], kira: [196, 124, 88], hazu: [146, 118, 176], sakushima: [66, 166, 158] };
const areaRgb = id => AREA_RGB[id] || null;

function exploreRing(list) {
  const n = v => Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  const rows = (Array.isArray(list) ? list : []).map(x => { const total = n(x && x.total); return { id: x && x.id, total, done: Math.min(n(x && x.done), total) }; }).filter(x => x.total > 0);
  const total = rows.reduce((a, x) => a + x.total, 0), done = rows.reduce((a, x) => a + x.done, 0);
  if (!total) return { done: 0, total: 0, pct: 0, gradient: '' };
  let at = 0;
  const stops = [];
  rows.forEach(x => {
    const rgb = (AREA_RGB[x.id] || [227, 164, 43]).join(','), a0 = at / total * 100, a1 = (at + x.done) / total * 100, a2 = (at + x.total) / total * 100;
    at += x.total;
    if (x.done > 0) stops.push(`rgb(${rgb}) ${a0}% ${a1}%`);
    if (x.done < x.total) stops.push(`rgba(${rgb},.18) ${a1}% ${a2}%`);
  });
  return { done, total, pct: Math.floor(100 * done / total), gradient: stops.join(', ') };
}
const areaZone = t => { const sp = t && t.id && spots.find(x => x.id === t.id); return (sp && sp.area) || (t && Number.isFinite(t.lat) && spots.length ? areaNear(t) : '') || ''; };

function guideChips(from, g, alts, zoneOf) {
  if (!from || !g) return [];
  const z = zoneOf || (() => '');
  return [{ o: g, alt: -1 }, ...(alts || []).map((o, alt) => ({ o, alt }))].filter(x => x.o && Number.isFinite(x.o.lat) && Number.isFinite(x.o.lng))
    .map(x => ({ name: x.o.name, alt: x.alt, main: x.alt < 0, m: dist(from, x.o), dir: bearing(from, x.o), zone: z(x.o) }))
    .sort((a, b) => a.m - b.m);
}


function areaDexHtml(p) {
  if (!p.total) return '';
  return `<span class="dex">${p.list.map(s => S.visits[s.id] ? `<i class="got" title="${esc(s.name || '')}">${(simple() && spotThumb(s)) || esc(s.icon || '📍')}</i>` : '<i></i>').join('')}</span>`;
}


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
      .catch(() => toast('名所を うまく 読みこめませんでした。少し まってから、もう一度 ためしてね。'))
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
  } catch (e) {  }


  if (!spots.length) { spots = buildSpots(config.filter(c => c && !c.approx), []); spotsVersion++; renderMarkers(); refreshNearby(); }

  let ok = false;
  const names = [...new Set(config.flatMap(c => (c ? matchesOf(c) : [])))], query = buildQuery(names);
  const stored = store.get(OSM_KEY, null);
  const cached = stored && stored.q === query ? stored : null;
  let items = null, baked = null;
  if (!force && cached && Date.now() - cached.t < CFG.osmCacheDays * 864e5) {
    items = cached.items; spotMeta.osmAt = cached.t; spotMeta.osmOk = true; ok = true;
  } else if (!force && (baked = await loadBaked()) && baked.q === query) {

    items = baked.items; spotMeta.osmAt = baked.t; spotMeta.osmOk = true; ok = true;
  } else {
    try {

      const seen = new Set();
      items = [];
      for (const q of buildQueryParts(names)) for (const it of await fetchOverpass(q)) if (!seen.has(it[0])) { seen.add(it[0]); items.push(it); }
      spotMeta.osmAt = Date.now(); spotMeta.osmOk = true; ok = true;
      if (!store.set(OSM_KEY, { t: spotMeta.osmAt, q: query, items })) store.del(OSM_KEY);
    } catch (e) {
      const old = cached || stored || baked || (await loadBaked());
      if (old) { items = old.items; spotMeta.osmAt = old.t; spotMeta.osmOk = true; }
      else if (!force) toast('名所の 地図データ（OpenStreetMap）を うまく 読みこめませんでした。注目スポットだけで 遊べるよ。');
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
  glowRestore(); treasureRestore();
  treasureArm();
  refreshNearby();
  renderSpotInfo();
  return ok;
}

const iconOf = s => s.featured ? s.icon : (CATS[s.cat] || CATS.sight).i;

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
  if (s.shop) cls.push('shop', s.id === 'f-ricepia' ? 'shop-ricepia' : 'shop-kondo');
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


const shopInside = s => s.id === 'f-ricepia' ? '<figure class="shop-pic"><img src="nishio-go/art/giant/ricepia-uriba.png" alt="らいすぴあのお米の売り場（ドット絵）" width="192" height="192" loading="lazy"/><figcaption>お店のなか：銘柄ごとの お米がならぶ売り場</figcaption></figure>' : '';

const shopMascot = s => s.shop ? '<img class="shomai-art" src="nishio-go/art/shomai-cute.png" alt="翔米" width="84" height="116" loading="lazy"/>' : '';

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
    ${shopInside(s)}${shopMascot(s)}
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
    ${shopInside(s)}${shopMascot(s)}
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
      const cls = spotState(s), key = cls + (simple() ? ' simple' : '');
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



const NPC_LOOK = { elder: '👴', granny: '👵', man: '👨', woman: '👩', kid: '🧒', student: '🧑‍🎓', fisher: '🎣', staff: '🧑‍🌾', guide: '🧑‍🏫', monk: '🧑‍🦲' };
const NPC_TALK_M = { play: 30, walk: 60 };
let npcs = [], npcsVersion = -1;
function placeNpcs() {
  if (npcsVersion === spotsVersion) return npcs;
  npcsVersion = spotsVersion;
  npcs = [];
  for (const n of window.NISHIO_NPCS || []) {
    const s = spots.find(x => x.id === 'f-' + n.spot);
    if (!s) continue;
    const [e, nn] = Array.isArray(n.off) ? n.off : [20, 20];
    npcs.push({ ...n, spotName: s.name, lat: s.lat + nn / 111320, lng: s.lng + e / (111320 * Math.cos(s.lat * Math.PI / 180)) });
  }
  return npcs;
}
const npcMet = id => (S.met || []).includes(id);

const NPC_NISHIO = (window.NISHIO_NPCS || []).filter(n => !n.area), NPC_NEAR = (window.NISHIO_NPCS || []).filter(n => n.area);


const npcJust = new Map();
function npcPages(n) {
  const pages = n.lines.slice(), now = new Date();
  if (KO) {
    pages[0] = KO.daypart(now).greet + pages[0];
    const h = KO.seasonSpots(now).find(x => x.spot === n.spot);
    if (h) pages.push(`いまは${h.text}だよ。ちょうどええ時に来たねえ。`);
    if (KO.doyoUshi(now) && MEIBUTSU.some(m => m.id === 'unagi' && m.spots.includes(n.spot))) pages.push('きょうは土用の丑の日。うなぎを食べる人が多い日だもんで、一色のうなぎも大いそがしだよ。');
  }
  const wx = weatherNow();
  if (wx) pages.push(wx.raining ? (wx.kind === 'snow' ? '雪がふっとるねえ。すべらんように気をつけりんよ。' : '雨の中、よう来たねえ。ぬれんように気をつけりんよ。')
    : wx.temp !== null && wx.temp >= 30 ? 'きょうは暑いねえ。水分をとって、休み休み歩きりんよ。'
    : wx.temp !== null && wx.temp <= 5 ? 'きょうは冷えるねえ。あったかくして歩きりんよ。'
    : wx.kind === 'sunny' ? 'ええ天気だねえ。歩くのにちょうどええわ。' : 'くもっとるけど、歩くにはちょうどええね。');
  const ev = spotEvents({ id: 'f-' + n.spot });
  if (ev.length) pages.push(`そうそう、${ev.map(x => `${x.when}に「${x.e.name}」`).join('、')}があるもんで、よかったら来てみりん。`);
  if (npcJust.has(n.id)) pages.splice(1, 0, npcJust.get(n.id));
  if (S.guide && S.guide.byId === n.id) pages.push(`🧭 ${S.guide.why}`);
  const hid = Object.keys(S.heard || {}).filter(id => S.heard[id].byId === n.id && !S.heard[id].found).sort((a, b) => S.heard[b].t - S.heard[a].t)[0];
  const hs = hid && spots.find(x => x.id === hid);
  if (hs) pages.push(`🔍 ${hintSay(n, hs.name)}`);
  if (S.parcel && S.parcel.from === n.id) pages.push(`📦 ${S.parcel.toName}に、その${S.parcel.item}を よろしくね。`);
  if (n.id === SEAL_BY.nishio) pages.push(guideRecord());
  else { const sp = sealPage(n); if (sp) pages.push(sp); }
  return pages;
}


function sealPage(n) {
  const id = Object.keys(SEAL_BY).find(k => SEAL_BY[k] === n.id), a = id && areas.find(x => x.id === id);
  if (!a || (S.seals || []).includes(id) || (SEAL_POST.has(id) && !S.cleared)) return '';
  const p = areaProgress(id), goal = sealGoal(id), left = Math.max(0, goal - p.done);
  if (!p.total || !left) return '';
  return `🔖 ${a.name}の注目スポットを あと${left}か所 めぐったら、${a.name}のしるしを わたすでね（いま ${Math.min(p.done, goal)}/${goal}）。`;
}


function guideRecord() {
  const lv = levelOf(S.total), need = needFor(lv + 1) - S.total;
  const ids = S.cleared ? SEAL_POST : SEAL_MAIN, own = (S.seals || []), got = [...ids].filter(id => own.includes(id)).length;
  const near = [...ids].filter(id => !own.includes(id)).map(id => ({ id, a: areas.find(x => x.id === id), p: areaProgress(id), goal: sealGoal(id) }))
    .filter(x => x.a && x.p.total > 0).map(x => ({ ...x, left: Math.max(0, x.goal - x.p.done) })).sort((a, b) => a.left - b.left)[0];
  const seal = got >= [...ids].length ? (S.cleared ? 'となりの市町のしるしも ぜんぶ そろったね。' : '5つのしるしが そろっとるよ。わしに話しかけてくれりゃあ 殿堂入りだよ。')
    : `しるしは ${got}/${[...ids].length}。${near ? (near.left ? `いちばん近いのは ${near.a.name}のしるしで、あと${near.left}か所めぐると もらえるよ。` : `${near.a.name}のしるしは もう もらえるで、${sealBy(near.id) ? sealBy(near.id).name : '地区の人'}に会いに行きりん。`) : ''}`;
  const day = dayState(), h = day.h100, left = [h && h.done ? '' : store.get('nsg_first_day', '') === ymd() ? '' : '100歩たんけん', (day.alleys || 0) < ALLEY.daily ? `路地の行き止まり あと${ALLEY.daily - (day.alleys || 0)}か所` : '', (day.watch || 0) < WATCH_DAILY ? '水べで じっと見る' : ''].filter(Boolean);
  return `📒 記録しといたよ。つぎの レベル${lv + 1}まで あと${need}pt。${seal}${left.length ? `きょうは まだ ${left.join('・')}が のこっとるよ。` : 'きょうの お楽しみは ぜんぶ すんだね。'}`;
}

function npcSpot(n) {
  const P = window.nishioPixel;
  if (!P || !document.body.classList.contains('px')) return n;
  const t = P.npcTile(n);
  return t.ok ? P.toLatLng(t.x + 0.5, t.y + 0.5) : n;
}

const faceCache = {}, NPC_ART = new Set(['elder', 'granny', 'man', 'woman', 'kid', 'student', 'fisher', 'staff', 'guide', 'monk']);
function npcFace(n) {
  if (NPC_ART.has(n.look)) return `<img class="npc-face art" src="nishio-go/art/npc-${n.look}.png" alt="" width="48" height="48"/>`;
  const P = window.nishioPixel;
  if (!(n.look in faceCache) && P && P.npcSprite) { try { faceCache[n.look] = P.npcSprite(n.look).toDataURL(); } catch (e) { faceCache[n.look] = ''; } }
  return faceCache[n.look] ? `<img class="npc-face" src="${faceCache[n.look]}" alt="" width="48" height="48"/>` : `<span class="npc-face">${NPC_LOOK[n.look] || '🙂'}</span>`;
}


let calledBy = null;
function talkNpc(id, page = 0) {
  const n = placeNpcs().find(x => x.id === id);
  if (!n) return null;
  const d = calledBy === id ? 0 : me ? dist(me, npcSpot(n)) : Infinity, lim = demo ? NPC_TALK_M.play : NPC_TALK_M.walk;
  const pic = simple();
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
  const say = [];

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


  if (page === 0 && S.parcel && S.parcel.to === n.id) { brief.icons += '📦'; say.push(deliverParcel(n)); }
  if (page === 0) { npcJust.delete(n.id); mzNpcShare = null; }
  const seal = page === 0 ? sealGive(n) : '';
  if (seal) { brief.icons += '🔖'; say.push(seal); const w = seal.match(/「(.*)」/); if (w) npcJust.set(n.id, `🔖 ${w[1]}`); }
  if (page === 0 && clearGive(n)) { brief.icons += '🏯'; say.push('🏯 西尾さんぽ 殿堂入り！'); }
  if (page === 0 && fixOk() && !(S.guide && S.guide.byId === n.id)) {
    const arrived = S.guide && S.guide.kind === 'npc' && S.guide.id === n.id ? S.guide : null;
    if (arrived) {
      const pts = guideReward(S.guide);
      brief.icons += '🎉';
      say.push(`🎉 ${S.guide.byId ? 'イベント達成：' : ''}${n.name}に会えた${pts ? ` +${pts}pt` : ''}`);
      const ml = [], mb = mazeGoal(n.id, n.name, ml), mz = takeMzShare();
      if (mz) { mzNpcShare = { ...mz, id: n.id }; if (playAskOk(mz)) playAsk(mz); }
      if (mz) a2hsLater('goal');
      const spl = ml.find(l => l.startsWith('🏃'));
      if (spl && simple()) toastAfter(spl);
      if (ml.length) { if (mb) gainPoints(mb); brief.icons += '🏁'; say.unshift(...ml); }
    }



    const mzKeep = !arrived && guideTarget() && mazeNow();
    const g = mzKeep ? null : decideGuide(n);
    if (g) {
      setGuide({ ...g, byId: n.id }); track('guide_set', { by: n.id, kind: g.kind }); say.push(`📜 イベント発生：${g.name}へ行ってみて`); brief.next = g.name;
      const hid = heardOf(g, n), hs = hid && spots.find(x => x.id === hid);
      if (hs) { brief.marks += '🔍'; say.push(`🔍 「${hintSay(n, hs.name)}」`); }
      const pc = g.kind === 'npc' && giveParcel(n, g.id);
      if (pc) { brief.marks += '📦'; say.push(`📦 「${pc.toName}に、この${pc.item}を届けてくれん？」`); }
    }
    else if (arrived) setGuide(null);
    if (arrived) rivalSay({ ...arrived, name: n.spotName }, g);
  }
  if (say.length && simple()) {
    const got = S.total - brief.t0, lv = levelOf(S.total) > brief.lv0 ? levelOf(S.total) : 0;
    const msg = npcBriefMsg(brief, got, lv, mazeNow());
    if (msg) toast(msg);
  } else if (say.length) toast(say.join('　'));
  const pages = npcPages(n), i = Math.min(page, pages.length - 1);
  const mzBtn = mzNpcShare && mzNpcShare.id === n.id ? '<button type="button" class="btn mini npc-share" data-mz-share>📣 ゴールを シェア</button>' : '';
  if (pic) {
    const dots = `<span class="pg">${pages.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</span>`;
    return { near: true, html: `${head}<p class="npc-say">「${esc(pages[i])}」</p>
    ${i < pages.length - 1 ? `<button type="button" class="btn mini npc-next" data-npc="${esc(n.id)}" data-page="${i + 1}" aria-label="つぎへ（${i + 1}/${pages.length}）">${dots} ▼</button>` : `<p class="npc-end">${dots}<span class="vh">（${pages.length}/${pages.length}）おわり</span></p>`}${mzBtn}</div>` };
  }
  return { near: true, html: `${head}<p class="npc-say">「${esc(pages[i])}」</p>
    ${i < pages.length - 1 ? `<button type="button" class="btn mini npc-next" data-npc="${esc(n.id)}" data-page="${i + 1}">▼ つぎへ（${i + 1}/${pages.length}）</button>` : `<p class="npc-end">（${pages.length}/${pages.length}）</p>`}${mzBtn}</div>` };
}

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

document.addEventListener('click', e => {
  const nx = e.target.closest('[data-npc]');
  if (nx) {
    const r = talkNpc(nx.dataset.npc, Number(nx.dataset.page) || 0);
    const box = nx.closest('.leaflet-popup-content, #pxInfoBody');
    if (r && box) box.innerHTML = r.html;
    e.stopPropagation();
    return;
  }
  const ms = e.target.closest('[data-mz-share]');
  if (ms) { e.stopPropagation(); if (mzNpcShare && window.nishioGo.openShare) { track('share_prompt', { kind: 'mzgoal' }); window.nishioGo.openShare('mzgoal', { mzgoal: mzNpcShare }); } return; }
  const mv = e.target.closest('[data-move-npc]');
  const n = mv && demo && placeNpcs().find(x => x.id === mv.dataset.moveNpc);
  if (n) { const p = npcSpot(n); map.closePopup(); follow = false; onFix(p.lat - 12 / 111320, p.lng, 5, Date.now()); }
});


let me = null;
let meMarker = null, accCircle = null, spotRing = null;
let lastWalk = null, vehicleUntil = 0, watchId = null, gpsError = '', gpsSlow = false;
let driving = false;

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


const KIRA_FAR = [[8000, 2], [4000, 1.5]];
const kiraFar = () => { if (!me) return 1; const d = dist(me, { lat: CFG.center[0], lng: CFG.center[1] }); return (KIRA_FAR.find(([m]) => d >= m) || [0, 1])[1]; };

function farNotice() {
  if (!me || !store.get('nsg_started', false) || (!demo && me.acc > CFG.maxAccuracy)) return;
  const far = kiraFar(), day = dayState();
  if (far <= (day.farTold || 1)) return;
  day.farTold = far; save();
  const km = (KIRA_FAR.find(([, f]) => f === far) || [0])[0] / 1000;
  toastAfter(`✨ 西尾城跡から ${km}km こえた！ ここから先は キラの絵が ${far}倍 出やすい`);
  track('kira_far', { far });
}




const waitS = { i: -1, timer: null, since: 0 };
function waitLine() {
  if (demo || me || (gpsError && !gpsSlow)) { if (waitS.timer) { clearInterval(waitS.timer); waitS.timer = null; } return ''; }
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
      gpsSlow = err.code === 3;
      gpsError = err.code === 1
        ? '位置情報が つかえない ようです。ブラウザの設定で「位置情報」を許可してから、ページを 読みこみなおしてね（「🎮 操作して移動」なら 位置情報なしで 遊べます）。'
        : err.code === 3 ? '位置情報の取得に時間がかかっています…' : '位置情報が とれませんでした。電波のよい 外で、もう一度 ためしてね。';
      refreshNearby();
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
}
function stopGps() { if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; } }


function trackWalk(p) {
  if (demo) {


    if (lastWalk && !driving) {
      const d = dist(lastWalk, p);
      if (d <= 500) addWalk(d, stepMove && d <= 20);
      if (stepMove && d <= 20) addTrail(lastWalk, p);
    }
    lastWalk = p;
    return;
  }
  if (p.acc > CFG.walkMaxAcc) return;
  if (!lastWalk) { lastWalk = p; return; }
  const d = dist(lastWalk, p), dt = (p.t - lastWalk.t) / 1000;
  if (dt <= 0 || d < Math.max(8, p.acc * 0.5)) return;
  const v = d / dt, prev = lastWalk;
  lastWalk = p;
  if (dt > CFG.walkMaxGapSec) return;
  if (v > CFG.vehicleSpeed) { vehicleUntil = Date.now() + CFG.vehicleLockMs; return; }
  if (v > CFG.walkMaxSpeed || Date.now() < vehicleUntil) return;
  addWalk(d);
  addTrail(prev, p, true);
}



function addTrail(a, b, critters) {
  const P = window.nishioPixel;
  if (!P || !P.trailWalk) return;
  const n = P.trailWalk(a.lat, a.lng, b.lat, b.lng, critters && P.critterStep ? (x, y) => P.critterStep(x, y) : null);
  hundred(dist(a, b), n);
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



const H100 = { steps: 100, cap: 30 };
function hundred(meters, fresh) {
  if (driving || store.get('nsg_first_day', '') === ymd()) return;
  const day = dayState();
  let h = day.h100;
  if (h && h.done) return;
  if (!h) { h = day.h100 = { steps: 0, fresh: 0, m: 0 }; toastAfter('👣 100歩たんけん'); }
  const rest = H100.steps * TRAIL_M - (h.m || 0), part = meters > rest ? Math.max(0, rest) / meters : 1;
  h.m = (h.m || 0) + meters;
  const take = Math.min(Math.floor(h.m / TRAIL_M) - h.steps, H100.steps - h.steps), before = h.steps;
  h.fresh += Math.min(Math.round(fresh * part), H100.steps - h.fresh);
  if (take <= 0) return;
  h.steps += take;
  const P = window.nishioPixel;
  if (Math.floor(h.steps / 25) > Math.floor(before / 25) && h.steps < H100.steps) { if (P && P.floatText) P.floatText(`👣 ${h.steps}/100`); save(); }
  if (h.steps < H100.steps) return;
  h.done = true;
  const best = h.fresh > (S.h100best || 0), pts = Math.min(H100.cap, h.fresh);
  if (best) S.h100best = h.fresh;
  weekStat().h100 = (weekStat().h100 || 0) + 1;
  if (pts) { gainPoints(pts); S.log.unshift({ type: 'h100', t: Date.now(), pts, icon: '👣', name: `100歩たんけん：はじめての道 ${h.fresh}マス` }); }
  save(); badgesSoon();
  toastAfter(`🏁 ${h.fresh}マス${pts ? ` +${pts}pt` : ''}`);
  track('h100', { fresh: h.fresh, best, mode: demo ? 'play' : 'walk' });
}



const trailMile = k => 500 * 2 ** k;
function trailMileNext() {
  if (S.trailMile == null) { S.trailMile = 0; while ((S.trail || 0) * TRAIL_M >= trailMile(S.trailMile)) S.trailMile++; }
  return S.trailMile;
}
function trailMiles(after) {
  trailMileNext();
  while (after * TRAIL_M >= trailMile(S.trailMile)) {
    const k = S.trailMile++, pts = 30 * (k + 1), m = trailMile(k);
    S.log.unshift({ type: 'trailmile', t: Date.now(), pts, icon: '👣', name: `歩いた道 ${fmtM(m)} の節目` });
    gainPoints(pts);
    const q = toastAfter.q || [];
    for (let i = q.length - 1; i >= 0; i--) if (q[i].startsWith('👣 歩いた道 ')) q.splice(i, 1);
    toastAfter(`👣 歩いた道 ${fmtM(m)}！ +${pts}pt`);
    track('trail_mile', { m });
  }
}

function addWalk(d, bag = true) {
  dayState().walked += d;
  walkBest();
  weekStat().m += d;
  S.walked += d;
  S.walkCarry += d;
  if (bag) walkBags(d);
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


function walkBest() {
  const day = dayState(), b = S.best || { m: 0, date: '' };
  if (day.walked > b.m) S.best = { m: day.walked, date: day.date };
}


const needFor = lv => 25 * (lv - 1) * lv;
const levelOf = total => { let lv = 1; while (total >= needFor(lv + 1)) lv++; return lv; };
const titleOf = lv => TITLES.filter(([l]) => lv >= l).pop()[1];

function gainPoints(n) {
  const before = levelOf(S.total);
  S.points += n; S.total += n;
  session.gained += n;
  S.log = S.log.slice(0, 200);
  renderHeader.gained = n;
  renderHeader();
  if (demo && !(store.get('nsg_mzgoals', 0) >= 3)) return 0;
  return levelOf(S.total) > before ? levelOf(S.total) : 0;
}


const featuredToday = () => dayState().spots.some(id => { const x = spots.find(z => z.id === id); return x && x.featured && !x.shop; });
const jumpHere = s => !!(s && s.featured && !s.shop && dayState().spots.includes(s.id));
function openJump() {
  if (!featuredToday()) { toast('名所（注目スポット）でチェックインすると、その日ミニゲームであそべます'); return; }
  if (window.NISHIO_JUMP) NISHIO_JUMP.open();
}

function jumpReward(coins, cleared) {
  if (S.jumpDay === ymd() || !featuredToday()) return null;
  const pts = Math.min(30, Math.max(0, coins | 0) + (cleared ? 10 : 0));
  if (!pts) return 0;
  S.jumpDay = ymd();
  gainPoints(pts);
  S.log.unshift({ type: 'jump', t: Date.now(), pts, name: `ミニゲーム「にしおジャンプ」${cleared ? 'クリア' : ''}（コイン${coins | 0}まい）`, icon: '🎮' });
  save();
  renderLog();
  return pts;
}


const MINI_PTS = 20;

function harvestReward(level) {
  if (S.harvestDay === ymd()) return null;
  const pts = MINI_PTS;
  S.harvestDay = ymd();
  gainPoints(pts);
  S.log.unshift({ type: 'harvest', t: Date.now(), pts, name: `ミニゲーム「コンバインで稲刈り」（${(level | 0) + 1}枚目の田んぼ）`, icon: '🌾' });
  save();
  renderLog();
  return pts;
}


function hiryoReward() {
  if (S.hiryoDay === ymd()) return null;
  const pts = MINI_PTS;
  S.hiryoDay = ymd();
  gainPoints(pts);
  S.log.unshift({ type: 'hiryo', t: Date.now(), pts, name: `ミニゲーム「肥料山の草刈り」`, icon: '🌿' });
  save();
  renderLog();
  return pts;
}


function dankyuReward(level) {
  if (S.dankyuDay === ymd()) return null;
  const pts = MINI_PTS;
  S.dankyuDay = ymd();
  gainPoints(pts);
  S.log.unshift({ type: 'dankyu', t: Date.now(), pts, name: `ミニゲーム「段丘をのぼる」（${(level | 0) + 1}つ目の段丘）`, icon: '⛰️' });
  save();
  renderLog();
  return pts;
}


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




function miniBest(game, level, stars, v, lower) {
  const all = S.mini || (S.mini = {}), list = all[game] || (all[game] = []), old = list[level] || null;
  const fresh = stars > 0 && !old;
  if (fresh) { list[level] = { s: stars, v }; save(); }
  return { old, best: list[level] || null, fresh };
}
const miniRecords = game => ((S.mini || {})[game] || []).map(r => r || null);

const miniStart = (game, n) => { const r = miniRecords(game); for (let i = 0; i < n; i++) if (!r[i]) return i; return 0; };

let selected = null;
const guideArrived = { id: '', at: -Infinity }, GUIDE_AUTO_MS = 3000;





let campaigns = [];
async function loadCampaigns() {
  try {
    const res = await fetch('nishio-go/campaigns.json', { cache: 'no-cache' });
    const j = res.ok ? await res.json() : null;
    if (j && Array.isArray(j.campaigns)) campaigns = j.campaigns.filter(c => c && c.id && c.title && /^\d{4}-\d\d-\d\d$/.test(c.from) && /^\d{4}-\d\d-\d\d$/.test(c.to))
      .map(c => ({ id: String(c.id), title: String(c.title), text: c.text ? String(c.text) : '', icon: c.icon ? String(c.icon) : '📣', from: c.from, to: c.to, active: c.active === true,
        url: typeof c.url === 'string' && /^https:\/\//.test(c.url) ? c.url : '', shopBonus: Number(c.bonus && c.bonus.shopCheckin) > 0 ? Math.round(Number(c.bonus.shopCheckin)) : 0 }));
  } catch (e) {  }
  renderCampaigns();
}
const liveCampaigns = () => { const d = ymd(); return campaigns.filter(c => (c.active || demo) && c.from <= d && d <= c.to); };

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

const SHOP_LINE = 'https://ricepia.jp/go/lin.ee/uPhkiiv';
const lineUrl = from => `${SHOP_LINE}?from=game-${from}`;
const hm = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
function shopOpen(s, t = Date.now()) {
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
function shopInfoHtml(s) {
  const h = s.hours, o = shopOpen(s), n = (S.shopDays || []).length;
  return `<div class="shop-info">
    ${h ? `<p>🕘 ${esc(h.open)}〜${esc(h.close)}（${(h.closed || []).length ? (h.closed || []).map(w => WEEK[w]).join('・') + '曜休み' : '年中無休'}）　<b class="${o.open ? 'open' : 'shut'}">${esc(o.text)}</b><br><small>年末年始などは 営業日・時間が かわることが あります（くわしくは お電話で）</small></p>` : ''}
    ${s.tel ? `<p>📞 <a href="tel:${esc(s.tel.replace(/-/g, ''))}">${esc(s.tel)}</a>${n ? `　🍚 来店スタンプ ${n}こ` : ''}</p>` : ''}
    <p class="shop-line">📱 <b>常連さまポイント</b>：お店で1日1回の来店で+1pt、10ptで100円引き（LINE の友だち登録から）<br>
      <a class="btn mini line" href="${esc(lineUrl('card'))}" target="_blank" rel="noopener">LINEで友だち追加</a></p></div>`;
}
const SHOP_STAMP = { 3: 100, 5: 200, 10: 500 };


function chainStep(s, now) {
  const c = S.chain || { n: 0, last: 0, id: '', best: 0 };
  c.n = c.last && c.id !== s.id ? c.n + 1 : 1;
  c.last = now; c.id = s.id; c.best = Math.max(c.best || 0, c.n);
  S.chain = c;
  return { n: c.n };
}


const MZ_SHOO_PTS = 3;





let mzShare = null, mzNpcShare = null;
const takeMzShare = () => { const m = mzShare; mzShare = null; return m; };
function snapMaze() {
  try {
    const cv = $('pxCanvas');
    if (!cv || !cv.width || !cv.height || !document.body.classList.contains('px')) return null;
    const sz = Math.min(cv.width, Math.round(cv.height * 0.75)), out = document.createElement('canvas');
    out.width = out.height = 360;
    out.getContext('2d').drawImage(cv, Math.round((cv.width - sz) / 2), Math.round((cv.height - sz) / 2), sz, sz, 0, 0, 360, 360);
    return out;
  } catch (e) { return null; }
}


function mzSpeed() { return ''; }


const GLOW = { goalPts: 20, nearPts: 10, nearMax: 3, nearCap: 6, nearM: 2000 };
const glow = { goal: null, near: null };
function glowPickGoal(from, cands) {
  if (!from) return null;
  const far = (cands || []).filter(o => o && o.kind === 'spot' && Number.isFinite(o.lat) && Number.isFinite(o.lng)).sort((a, b) => dist(from, b) - dist(from, a))[0];
  return far ? { id: far.id, name: far.name, lat: far.lat, lng: far.lng } : null;
}
function glowPickNear(goal, list, visits, zoneOf, max = GLOW.nearMax) {
  if (!goal) return [];
  const z = zoneOf || (() => ''), gz = z(goal);
  return (list || []).filter(s => s && s.id !== goal.id && !s.shop && !(visits || {})[s.id] && Number.isFinite(s.lat) && Number.isFinite(s.lng)
    && dist(goal, s) <= GLOW.nearM && (!gz || z(s) === gz))
    .sort((a, b) => dist(goal, a) - dist(goal, b)).slice(0, max).map(s => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng }));
}
const glowValid = o => !!o && typeof o.id === 'string' && o.id !== '' && Number.isFinite(o.lat) && Number.isFinite(o.lng);
function glowMergeNear(oldList, picks, cap, goalId) {
  const seen = new Set(), out = [];
  for (const o of [...(Array.isArray(oldList) ? oldList : []), ...(Array.isArray(picks) ? picks : [])]) {
    if (!glowValid(o) || o.id === goalId || seen.has(o.id)) continue;
    seen.add(o.id); out.push({ id: o.id, name: typeof o.name === 'string' ? o.name : '', lat: o.lat, lng: o.lng });
  }
  return out.slice(0, Number.isFinite(cap) ? cap : GLOW.nearCap);
}
function glowCleanOne(item, spotsById, visits) {
  if (!item || typeof item.id !== 'string') return null;
  const sp = (spotsById || {})[item.id];
  if (!sp || (visits || {})[item.id] || sp.shop || sp.kind === 'npc' || !Number.isFinite(sp.lat) || !Number.isFinite(sp.lng)) return null;
  return { id: sp.id, name: sp.name, lat: sp.lat, lng: sp.lng };
}
function glowCleanSaved(list, spotsById, visits) {
  const seen = new Set(), out = [];
  for (const o of (Array.isArray(list) ? list : [])) {
    const c = glowCleanOne(o, spotsById, visits);
    if (c && !seen.has(c.id)) { seen.add(c.id); out.push(c); }
  }
  return out;
}
function glowSave() {
  S.glowGoal = glow.goal || null;
  S.glowNear = glow.near ? glow.near.list.slice() : [];
  save();
}
function glowRestore() {
  const byId = {};
  for (const sp of spots) if (sp && sp.id != null) byId[sp.id] = sp;
  glow.goal = glowCleanOne(S.glowGoal, byId, S.visits);
  const list = glowCleanSaved(S.glowNear, byId, S.visits).slice(0, GLOW.nearCap);
  glow.near = list.length ? { list } : null;
  glowSave();
}
function glowArm(g) {
  if (!g || !mazeNow() || !me) return;
  glow.armed = true;
  const cands = [g, ...(g.alts || [])];
  if (glow.goal && cands.some(o => o.id === glow.goal.id)) return;
  const pick = glowPickGoal(me, cands);
  glow.goal = pick || null;
  if (pick) track('glow_goal', { spot: pick.name });
  glowSave();
}
function glowArrive(id, lines) {
  let pts = 0;
  const gg = glow.goal;
  if (gg && gg.id === id) { pts += GLOW.goalPts; lines.push(`✨ 光るゴール！ +${GLOW.goalPts}`); glow.goal = null; track('glow_goal_hit', {}); }
  const sp = spots.find(x => x.id === id), list = sp ? glowPickNear(sp, spots, S.visits, areaZone) : [];
  const before = new Set((glow.near ? glow.near.list : []).map(x => x.id));
  const merged = glowMergeNear(glow.near ? glow.near.list : [], list, GLOW.nearCap, id);
  glow.near = merged.length ? { list: merged } : null;
  const added = merged.filter(x => !before.has(x.id));
  if (added.length) lines.push(`✨ 近くの 寄り道が 光るよ：${added.map(x => x.name).join('・')}`);
  glowSave();
  return pts;
}
function glowCheckin(id, lines) {
  const n = glow.near;
  if (!n || !n.list.some(x => x.id === id)) return 0;
  n.list = n.list.filter(x => x.id !== id);
  if (!n.list.length) glow.near = null;
  glowSave();
  lines.push(`✨ 光る 寄り道 +${GLOW.nearPts}`); track('glow_near_hit', {});
  return GLOW.nearPts;
}
const glowIds = () => (glow.near ? glow.near.list.map(x => x.id) : []);
function glowHtml() {
  const parts = [];
  if (glow.goal) parts.push(`✨ 光るゴール：${esc(glow.goal.name)} +${GLOW.goalPts}pt`);
  if (glow.near) parts.push(`✨ 光る 寄り道（+${GLOW.nearPts}pt）：${glow.near.list.map(x => esc(x.name)).join('・')}`);
  return parts.length ? `<span class="glow">${parts.join('<br>')}</span>` : '';
}


const TREASURE = { pts: 15, radiusM: 2000 };
const treasure = { cur: null, last: '' };
function treasurePick(from, list, visits, skipId, guideId) {
  if (!from) return null;
  const c = (list || []).filter(s => s && s.kind !== 'npc' && !s.shop && !(visits || {})[s.id] && s.id !== skipId && s.id !== guideId && Number.isFinite(s.lat) && Number.isFinite(s.lng) && dist(from, s) <= TREASURE.radiusM)
    .sort((a, b) => dist(from, a) - dist(from, b))[0];
  return c ? { id: c.id, name: c.name, lat: c.lat, lng: c.lng } : null;
}
function treasureSpawn(skipId) {
  const pick = treasurePick(me, spots, S.visits, skipId, S.guide && S.guide.id);
  treasure.cur = pick || null;
  treasure.last = pick ? '' : (skipId || treasure.last);
  if (pick) track('treasure_spawn', { spot: pick.name });
  treasureMarker();
  treasureSave();
  return treasure.cur;
}
function treasureSave() {
  S.treasureSpot = treasure.cur || null;
  S.treasureLast = treasure.last;
  save();
}
function treasureRestore() {
  const byId = {};
  for (const sp of spots) if (sp && sp.id != null) byId[sp.id] = sp;
  const c = glowCleanOne(S.treasureSpot, byId, S.visits);
  treasure.cur = c && !(S.guide && S.guide.id === c.id) ? c : null;
  treasure.last = typeof S.treasureLast === 'string' ? S.treasureLast : '';
  treasureMarker();
  treasureSave();
}
function treasureArm() {
  const guideId = S.guide && S.guide.id;
  if (treasure.cur && treasure.cur.id !== guideId) return treasure.cur;
  return treasureSpawn(treasure.cur ? treasure.cur.id : treasure.last);
}
function treasureCheckin(id, lines) {
  const t = treasure.cur;
  if (!t || t.id !== id) return 0;
  if (S.guide && S.guide.id === id) { treasureSpawn(id); return 0; }
  S.treasureGot = (S.treasureGot || 0) + 1; save();
  lines.push(`🎁 きらきらお宝ゲット！ +${TREASURE.pts}`); track('treasure_hit', {});
  treasureSpawn(id);
  return TREASURE.pts;
}
function treasureHtml() {
  const t = treasure.cur;
  return t ? `<span class="treasure">🎁 きらきらお宝：${esc(t.name)} +${TREASURE.pts}pt${me ? `（${fmtM(dist(me, t))}・近づいてチェックイン）` : ''}</span>` : '';
}
let treasureMk = null;
function treasureMarker() {
  if (typeof map === 'undefined' || !map) return;
  const t = treasure.cur;
  if (treasureMk) { treasureMk.remove(); treasureMk = null; }
  if (t) treasureMk = L.marker([t.lat, t.lng], { icon: L.divIcon({ className: '', html: '<div class="treasure-mk">🎁</div>', iconSize: [44, 44], iconAnchor: [22, 22] }), keyboard: false, interactive: false, zIndexOffset: 700 }).addTo(map);
}
setInterval(() => { if (me && spots.length && !treasure.cur) { treasureArm(); if (treasure.cur) renderGuide(); } }, 15000);
function mazeGoal(id, name, lines) {
  mzShare = null;
  const MZ = demo && window.nishioPixel && nishioPixel.maze, gl = MZ && MZ.goal ? MZ.goal(id) : null;
  if (!gl || gl.sec <= 3) return 0;
  if (MZ.rescueGoal) MZ.rescueGoal(id);
  let total = 0;
  total += glowArrive(id, lines);
  mzShare = { name, sec: playSec(gl.sec), stars: 0, m: gl.m || 0, run: gl.run || null, img: snapMaze(), t: Date.now(), city: (me && (cityNear(me.lat, me.lng) || {}).name) || '' };
  MZ.goalFx('');
  track('maze_goal', { spot: name, sec: Math.round(mzShare.sec), m: Math.round(gl.m), stars: 0, way: 0 });
  return total;
}


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
  const ch = chainStep(s, now);
  if (!v) {
    const b = s.featured ? CFG.pts.firstFeatured : CFG.pts.first;
    total += b; lines.push(`🆕 はじめての訪問 +${b}`);
  }
  const today = ymd();
  if (S.streak.last !== today) {
    S.streak.days = S.streak.last === yesterday() ? S.streak.days + 1 : 1;
    S.streak.last = today;
    S.streak.max = Math.max(S.streak.max || 0, S.streak.days);
    const b = CFG.pts.daily;
    total += b; lines.push(`📅 今日のはじめて +${b}`);
  }

  if (s.shop) for (const c of liveCampaigns()) {
    const key = c.id + ':' + today;
    if (!c.shopBonus || (S.campDone || []).includes(key)) continue;
    S.campDone = [key, ...(S.campDone || [])].slice(0, 60);
    total += c.shopBonus; lines.push(`${c.icon} ${c.title}${c.active ? '' : '（サンプル）'} +${c.shopBonus}`);
    track('campaign_bonus', { campaign: c.id, mode: demo ? 'play' : 'walk' });
  }
  postcardCheckin(s, lines);
  const courseDone = courseCheckin(s, lines);
  S.visits[s.id] = { n: (v ? v.n : 0) + 1, first: v ? v.first : now, last: now, name: s.name, cat: s.kind || s.cat, icon: iconOf(s), featured: !!s.featured };
  if (!v) praiseCheck(s.area || areaNear(s));
  movieCheck(s);
  const jumpNew = s.featured && !s.shop && !featuredToday();
  const day = dayState();
  day.checkins++;
  if (!day.spots.includes(s.id)) day.spots.push(s.id);
  if (jumpNew) lines.push('🎮 名所でミニゲーム「にしおジャンプ」があそべる（スポットの窓・きろく から）');
  total += treasureCheckin(s.id, lines);
  total += glowCheckin(s.id, lines);
  total += mazeGoal(s.id, s.name, lines);
  const mz = takeMzShare();
  if (['shrine', 'temple', 'worship'].includes(s.kind || s.cat)) day.shrine++;

  if (!v || spots.every(x => x.id === s.id || S.visits[x.id])) day.fresh++;
  if (s.featured && s.area && !day.areas.includes(s.area)) day.areas.push(s.area);
  if (s.shop) day.shop = 1;
  S.checkins++;
  weekStat().spots++;
  track('checkin', { spot: s.name, featured: !!s.featured, first: !v, theme: inTheme ? theme.key : '', chain: ch.n, mode: demo ? 'play' : 'walk' });

  const themeBag = inTheme && (day.themeBags || 0) < BAG.themeDaily;
  const bag = !s.shop && ((s.featured && !v) || themeBag) ? giveBag(s.lat, s.lng, s.featured && !v ? 'featured' : 'theme') : null;
  if (bag && !(s.featured && !v)) day.themeBags = (day.themeBags || 0) + 1;
  if (bag) lines.push(`🎒 おみやげ袋（${bag.km}km 歩くと開く）`);
  if (s.shop) track('shop_checkin', { spot: s.name, mode: demo ? 'play' : 'walk' });
  if (s.shop && !(S.shopDays || []).includes(today)) {
    S.shopDays = [...(S.shopDays || []), today].slice(-400);
    const n = S.shopDays.length, b = SHOP_STAMP[n] || 0;
    lines.push(`🍚 来店スタンプ ${n}こめ`);
    if (b) { total += b; lines.push(`🎁 来店スタンプ ${n}こ たまった！ +${b}`); }
    track('shop_stamp', { n, spot: s.name, mode: demo ? 'play' : 'walk' });
  }
  S.log.unshift({ type: 'spot', t: now, pts: total, name: s.name, icon: iconOf(s), id: s.id });

  const fk = s.shop ? '' : learnFact('c:' + s.id + ':' + S.checkins);
  const dot = s.shop ? null : gainDot(s.lat, s.lng, 'c:' + s.id, s.area);
  const lvUp = gainPoints(total);
  save();

  const btn = $('spinBtn');
  btn.classList.remove('go'); void btn.offsetWidth; btn.classList.add('go');

  if (mz) toast(`⭐ +${total}`);
  else toast(lvUp ? `+${total}pt　⭐ レベル${lvUp}！` : `+${total}pt`);
  setTimeout(() => { if (react.pending) reactShow(); else if (playQ.pending) playShow(); }, 1500);
  reactAsk(s);
  if (courseDone) courseCelebrate();
  a2hsLater('goal');
  if (mz && !playAskOk(mz)) react.pending = null;
  else if (mz) playAsk(mz);

  map.closePopup();
  renderMarkers();
  refreshNearby();
  updateQuests(1200);
  setTimeout(checkBadges, 2700);
}


const MEIBUTSU = window.NISHIO_MEIBUTSU || [];
const SHIZEN = window.NISHIO_SHIZEN || [];
const KOME = window.NISHIO_KOME || [];
const SANGYO = window.NISHIO_SANGYO || [];
const spotSangyo = s => SANGYO.filter(x => (x.spots || []).some(id => 'f-' + id === s.id));
const spotShizen = s => SHIZEN.filter(x => x.spots.some(id => 'f-' + id === s.id));

const MZ_DINO_PTS = 20;
function mzDino() {
  const lvUp = gainPoints(MZ_DINO_PTS);
  S.dinoGot = (S.dinoGot || 0) + 1;
  if (lvUp) toast(`⭐ レベル${lvUp}！`);
  save();
  track('maze_dino', {});
  return { pts: MZ_DINO_PTS };
}

function mzChase() { return null; }

const MZ_ENERGY_PTS = 20;
function mzEnergy() {
  const lvUp = gainPoints(MZ_ENERGY_PTS);
  S.energyGot = (S.energyGot || 0) + 1;
  if (lvUp) toast(`⭐ レベル${lvUp}！`);
  save();
  track('maze_energy', {});
  return { pts: MZ_ENERGY_PTS };
}

const MZ_TORCH_PTS = 10;
function mzTorch() {
  const lvUp = gainPoints(MZ_TORCH_PTS);
  S.torchGot = (S.torchGot || 0) + 1;
  if (lvUp) toast(`⭐ レベル${lvUp}！`);
  save();
  track('maze_torch', {});
  return { pts: MZ_TORCH_PTS };
}

const MZ_BRIGADE_PTS = 5, MZ_BRIGADE_BONUS = 15;
function mzBrigade(done) {
  const pts = MZ_BRIGADE_PTS + (done ? MZ_BRIGADE_BONUS : 0), lvUp = gainPoints(pts);
  if (done) S.brigadeGot = (S.brigadeGot || 0) + 1;
  if (lvUp) toast(`⭐ レベル${lvUp}！`);
  save();
  track('maze_brigade', {});
  return { pts };
}

const MZ_PURIFY_PTS = 5, MZ_PURIFY_BONUS = 20;
function mzPurify(done) {
  const pts = MZ_PURIFY_PTS + (done ? MZ_PURIFY_BONUS : 0), lvUp = gainPoints(pts);
  if (done) S.purifyGot = (S.purifyGot || 0) + 1;
  if (lvUp) toast(`⭐ レベル${lvUp}！`);
  save();
  track('maze_purify', {});
  return { pts };
}

const MZ_RESCUE_JOIN = 5, MZ_RESCUE_PTS = 30;
function mzRescueJoin() {
  const lvUp = gainPoints(MZ_RESCUE_JOIN);
  if (lvUp) toast(`⭐ レベル${lvUp}！`);
  save();
  track('maze_rescue_join', {});
  return { pts: MZ_RESCUE_JOIN };
}
function mzRescue() {
  const lvUp = gainPoints(MZ_RESCUE_PTS);
  S.rescueGot = (S.rescueGot || 0) + 1;
  if (lvUp) toast(`⭐ レベル${lvUp}！`);
  save();
  track('maze_rescue', {});
  return { pts: MZ_RESCUE_PTS };
}

const MZ_CUBE_PTS = 5, MZ_CUBE_DONE = 20;
function mzCube(done) {
  const pts = MZ_CUBE_PTS + (done ? MZ_CUBE_DONE : 0), lvUp = gainPoints(pts);
  if (done) S.cubeGot = (S.cubeGot || 0) + 1;
  if (lvUp) toast(`⭐ レベル${lvUp}！`);
  save();
  track('maze_cube', { done: !!done });
  return { pts };
}

const movieFact = k => !!(window.NISHIO_MOVIE && NISHIO_MOVIE.list.some(m => m.facts.includes(k)));

const KO = window.NISHIO_SEASON || null;

const WX = window.NISHIO_WEATHER || null;
const weatherNow = () => (WX && WX.current) || null;
if (WX) WX.onChange(() => { renderKoyomi.key = null; renderKoyomi(); if (me) refreshNearby(); });

const MB_NISHIO = MEIBUTSU.filter(m => !m.area), MB_NEAR = MEIBUTSU.filter(m => m.area && m.spots.length);
const spotMeibutsu = s => MEIBUTSU.filter(m => m.spots.some(id => 'f-' + id === s.id));

const AREA_TIP = window.NISHIO_AREA_TIP || {};
const spotTip = s => { const m = spotMeibutsu(s)[0]; return (m && (m.tip || m.note)) || (s.featured && s.area && AREA_TIP[s.area]) || ''; };


const EVENTS = (window.NISHIO_EVENTS && NISHIO_EVENTS.list) || [];
const ISLAND_SPOTS = new Set(['sakushima-nishi', 'sakushima-higashi', 'benten-salon', 'suunji', 'ohirune-house', 'kamome-parking', 'oura-beach', 'yatsurugi', 'kurokabe']);
const WEEK = '日月火水木金土';

const evDate = (e, d = new Date()) => e.date && Number(e.date.slice(0, 4)) === d.getFullYear() ? e.date : '';
function evWhen(e, d = new Date()) {
  const x = evDate(e, d);
  if (!x) return e.when;
  const t = new Date(x + 'T00:00:00');
  return `${t.getMonth() + 1}月${t.getDate()}日（${WEEK[t.getDay()]}）`;
}

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
const evSpotId = e => e.spot ? 'f-' + e.spot : '';
const spotEvents = s => upcomingEvents().filter(x => evSpotId(x.e) === s.id);




const QUEST_AREAS = [{ id: 'nishio', name: '西尾', icon: '🍵' }, { id: 'isshiki', name: '一色', icon: '🐟' }, { id: 'kira', name: '吉良', icon: '♨️' }, { id: 'hazu', name: '幡豆', icon: '⛰️' }];
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const seeded = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
function dayState() {
  if (S.day && S.day.date && S.day.date !== ymd()) S.prevDay = { date: S.day.date, walked: S.day.walked || 0, trail: S.day.trail || 0, checkins: S.day.checkins || 0, dots: S.day.dots || 0 };
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

  const evs = monthEvents(new Date(date + 'T12:00:00')).filter(e => e.spot && !e.area && !ISLAND_SPOTS.has(e.spot)), er = seeded(hashStr('event:' + date));
  if (evs.length && qs[2].id !== 'shop' && er() < 0.4) {
    const e = evs[Math.floor(er() * evs.length)];
    qs[2] = { id: 'event', icon: '📅', text: `今月の「${e.name}」の会場に行く`, sub: e.place, goal: 1, pts: 60, val: d => d.spots.includes(evSpotId(e)) ? 1 : 0 };
  }
  return qs;
}

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




const MACHI = window.NISHIO_MACHI || [];


function machiAt(p) {
  if (!p || cityAt(p.lat, p.lng)) return null;
  if (AROUND.length) { const a = aroundAt(p.lat, p.lng); return (a && MACHI.find(t => t.city === a.name)) || null; }
  let best = null, bd = 8000;
  for (const t of MACHI) { const d = dist(p, { lat: t.center[0], lng: t.center[1] }); if (d < bd) { bd = d; best = t; } }
  return best;
}
function factPool() {
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

function pickFact(c) {
  const pool = factPool(), keys = [...pool.keys()].filter(k => !movieFact(k)), fresh = keys.filter(k => !S.facts.includes(k));
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
    k => !k.startsWith('t:') && factNear(k) === hereNear,
    k => !k.startsWith('t:'),
    () => true,
  ];
  for (const t of tiers) { const g = list.filter(t); if (g.length) return g[hashStr(c.id) % g.length]; }
  return '';
}

function factNear(k) {
  const [kind, id] = k.split(':'), areaNear = a => !!(areas.find(x => x.id === a) || {}).near, spotNear = sid => { const sp = spots.find(x => x.id === sid); return !!sp && areaNear(sp.area); };
  if (kind === 'a') return areaNear(id);
  if (kind === 's') return spotNear(id);
  if (kind === 'e') { const e = EVENTS.find(x => x.id === id); return !!e && (e.spot ? spotNear(evSpotId(e)) : areaNear(e.area)); }
  if (kind === 'm') return !!(MEIBUTSU.find(x => x.id === id) || {}).area;
  if (kind === 'z' || kind === 'k' || kind === 'g') return false;
  return true;
}
const knownFacts = () => { const pool = factPool(); return S.facts.filter(k => pool.has(k)).length; };


function liveChests() {
  const list = (window.nishioPixel && nishioPixel.chests) || [], d = dayState(), mode = demo ? 'play' : 'walk';
  return list.filter(c => c.mode === mode && c.id.startsWith(d.date + ':') && !d.chests.includes(c.id));
}

const chestMarkers = new Map();
function syncChestMarkers() {
  const keep = new Set();
  for (const c of liveChests()) {
    keep.add(c.id);
    const m = chestMarkers.get(c.id);
    if (m) m.setLatLng([c.lat, c.lng]);
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
  if (welcomeDue() && !playInteracted) return;
  if (driving) return;
  if (rewardBusy()) return;

  if (!demo && (!me || me.acc > CFG.maxAccuracy)) return;
  const n = nearestChest();
  if (!n || n.d > (demo ? 18 : 30)) return;
  const c = n.c, d = dayState(), welcome = c.id.endsWith(':welcome');
  d.chests.push(c.id);
  if (welcome) S.welcomed = true;
  const pick = pickFact(c), newFact = !!pick && !S.facts.includes(pick);
  track('chest_open', { mode: demo ? 'play' : 'walk' });
  if (newFact) S.facts.push(pick);

  const cands = welcome ? firstCands(c) : [];
  const dot = cands.length >= 2 ? null : gainDot(c.lat, c.lng, 'chest:' + c.id);

  const firstBag = !S.bagFirst;
  const bag = firstBag ? giveBag(c.lat, c.lng, welcome ? 'welcome' : 'first', 1) : Math.random() < BAG.chestRate ? giveBag(c.lat, c.lng, 'chest') : null;
  if (bag && firstBag) S.bagFirst = true;
  S.log.unshift({ type: 'chest', t: Date.now(), pts: c.pts, name: 'たからばこ', icon: '🎁' });
  const lvUp = gainPoints(c.pts);
  save();

  const show = () => {
    const P = window.nishioPixel, say = t => { if (P && P.floatText) P.floatText(t); else toast(t); };
    say(`🎁 +${c.pts}`);
    if (newFact) say('📖 +1');
    if (bag) say(`🎒 ${bag.km}km`);
    if (lvUp) say(`⭐ Lv${lvUp}`);
  };
  if (cands.length >= 2) pickFirst(cands, show); else show(dot);
  if (welcome) ktAskGuide([{ t: 'たからばこ、あいたね！ こんどは 町の 名所や 人を たずねて みよう。', mood: 'happy' }], 'smile');
  updateQuests(1500);
  refreshNearby();
}

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
let firstPick = null;

function pickFirst(cands, done, opt = {}) {
  const D = window.NISHIO_DOTS;
  firstPick = { cands, done, opt };
  if (!opt.title) { finishFirst(cands[0]); return; }
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
  if (p.opt.key && p.opt.key !== stateKey()) { if (!$('pxInfo').hidden) $('pxInfo').hidden = true; return; }
  const dot = addDot(p.cands.includes(id) ? id : p.cands[0], !!p.opt.kira);
  track(p.opt.ev || 'first_dot_pick', { picked: p.cands.indexOf(dot.id), mode: demo ? 'play' : 'walk' });
  save();
  if (!$('pxInfo').hidden) $('pxInfo').hidden = true;
  p.done(dot);
}


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


function sealPickCheck() {
  const p = (S.sealPicks || [])[0];
  if (!p || firstPick || !document.body.classList.contains('px') || !$('pxInfo').hidden || rewardBusy() || !window.NISHIO_DOTS) return;
  if (['log', 'voice', 'rewards', 'settings'].some(t => !$('panel-' + t).hidden)) return;
  if (document.body.classList.contains('jump-open') || medashiOpen() || (window.NISHIO_MOVIE && NISHIO_MOVIE.playing) || (window.nishioPixel && nishioPixel.sightBusy && nishioPixel.sightBusy())) return;
  pickFirst(p.cands, dot => {
    S.sealPicks = (S.sealPicks || []).filter(x => x.area !== p.area); save();
    toastAfter(`🔖 ${p.name}のしるしの1枚：「${window.NISHIO_DOTS.info(dot.id).title}」が キラで 絵帳に入った！`);
    const pl = $('panel-log'); if (pl && !pl.hidden) renderLog();
  }, { title: `${p.name}のしるしの1枚を えらぼう`, sub: '2枚のうち、えらんだ1枚だけが キラで もらえます（もう1枚は もらえません。えらばずに とじると、左の1枚）', kira: true, ev: 'seal_dot_pick', key: stateKey() });
}
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-pick-dot]'); if (b) finishFirst(Number(b.dataset.pickDot)); });

new MutationObserver(() => { if (firstPick && $('pxInfo').hidden) finishFirst(firstPick.cands[0]); else if ((S.sealPicks || []).length && $('pxInfo').hidden) setTimeout(sealPickCheck, 500); }).observe($('pxInfo'), { attributes: true, attributeFilter: ['hidden'] });









const GUIDE_PTS = 5, GUIDE_DAILY = 5, GUIDE_RANGE = { walk: 2000, play: 3000 };



const MAZE_NEAR_MIN = 350, MAZE_NEAR = 900;

const FIRST_MIN = 120, FIRST_MAX = 200;
const WEEKDAY = d => '日月火水木金土'[d.getDay()];
const firstClause = t => String(t || '').split(/[。、]/)[0];

function guideRadius(g) {
  if (g.kind === 'npc') return NPC_TALK_M[demo ? 'play' : 'walk'];
  const s = spots.find(x => x.id === g.id);
  return (s ? reachOf(s) : 40) + Math.min((me && me.acc) || 0, CFG.accSlack);
}
const GUIDE_RECENT = 8;

const mzNoPath = new Map();
const mzNoPathIds = () => { const t = Date.now(); return [...mzNoPath].filter(([, u]) => u > t).map(([id]) => id); };
function guideNoPath(g, firstBand) {
  const cur = S.guide;
  if (!g || !cur || cur.id !== g.id || cur.mine || cur.refer || cur.byId || !mazeNow() || !fixOk()) return false;
  const now = Date.now(), ts = (guideNoPath.ts || []).filter(t => now - t < 30000);
  guideNoPath.ts = ts;
  if (ts.length >= 3) return false;
  ts.push(now); mzNoPath.set(g.id, now + 600000);
  const next = decideGuide(null);
  if (!next || (firstBand && dist(me, next) > FIRST_MAX)) { mzNoPath.delete(g.id); return false; }
  setGuide(next);
  return true;
}
const GUIDE_FAR = 12000;


const fixOk = () => !!me && !driving && (demo || me.acc <= CFG.maxAccuracy);

const mazeNow = () => !!(demo && window.nishioPixel && nishioPixel.maze && nishioPixel.maze.playing && nishioPixel.maze.playing());
function decideGuide(from) {
  const near = demo && mazeNow(), g = decideGuide0(from, false);
  if (g) return near ? { ...g, near: true } : g;
  if (near && store.get('nsg_mzgoals', 0) < 1) { const f = decideGuide0(from, false, true); if (f) return { ...f, near: true }; }
  return near ? decideGuide0(from, true) || decideGuide0(from, true, true) : null;
}
function decideGuide0(from, wide, tooNearOk) {
  if (!me) return null;
  const mazeNear = !wide && demo && mazeNow(), first1 = mazeNear && store.get('nsg_mzgoals', 0) < 1;
  const now = new Date(), range = first1 ? FIRST_MAX : mazeNear ? MAZE_NEAR : GUIDE_RANGE[demo ? 'play' : 'walk'];
  const recent = new Set([...(S.guideDone || []), ...mzNoPathIds()]);

  const five = mazeNear;
  const nearLo = first1 ? (tooNearOk ? 0 : FIRST_MIN) : five || (mazeNow() && !tooNearOk) ? MAZE_NEAR_MIN : 0;
  const okFor = (kind, id) => x => { const d = dist(me, x); return d > Math.max(60, guideRadius({ kind, id }) * 1.5, nearLo) && d <= range && !recent.has(id); };



  const mazeVert = demo && mazeNow();
  const dNS = x => Math.abs((x.lat - me.lat) * 111320), dEW = x => Math.abs((x.lng - me.lng) * 111320 * Math.cos(me.lat * Math.PI / 180));

  const vertFirst = x => mazeVert && dist(me, x) <= MAZE_NEAR && dNS(x) >= dEW(x);
  const goalSort = mazeVert
    ? (a, b) => ((vertFirst(a) ? 0 : 1) - (vertFirst(b) ? 0 : 1)) || dist(me, a) - dist(me, b)
    : (a, b) => dist(me, a) - dist(me, b);
  const far = x => okFor('spot', x.id)(x);
  const by = from ? `${from.name}の話` : 'まわりのようす';
  const say = (a, b) => from ? a : b;
  const cands = [];


  if (from && Array.isArray(from.refer)) {
    const all = placeNpcs(), lim = mazeNow() ? range : 10000, lo = nearLo;
    const ref = from.refer.map(([id, words]) => ({ n: all.find(x => x.id === id), words }))
      .find(x => x.n && !npcMet(x.n.id) && !recent.has(x.n.id) && dist(me, x.n) > Math.max(guideRadius({ kind: 'npc' }) * 1.5, lo) && dist(me, x.n) <= lim);
    if (ref) cands.push({ kind: 'npc', id: ref.n.id, name: `${ref.n.name}（${ref.n.spotName}）`, lat: ref.n.lat, lng: ref.n.lng, why: ref.words, refer: true });
  }

  const wxNow = weatherNow();
  if (wxNow && wxNow.raining) {
    const roof = spots.filter(s => s.featured && !s.shop && (s.kind === 'museum' || s.kind === 'library') && far(s) && !ISLAND_SPOTS.has(s.id.slice(2))).sort(goalSort)[0];
    if (roof) cands.push({ kind: 'spot', id: roof.id, name: roof.name, lat: roof.lat, lng: roof.lng, weather: true, by: from ? undefined : `天気（${wxNow.icon}${wxNow.name}）`,
      why: say(`${wxNow.kind === 'snow' ? '雪' : '雨'}がふっとるもんで、屋根のある${roof.name}で雨宿りしてきりん。`, `${wxNow.icon} ${wxNow.kind === 'snow' ? '雪' : '雨'}がふってきた。屋根のある${roof.name}へ行こう。`) });
  }

  const seasonC = (() => {
    if (!KO) return null;
    const se = KO.season(now), sk = KO.sekki(now);
    const wet = !!(weatherNow() && weatherNow().raining);
    const hs = KO.seasonSpots(now).map(h => ({ h, s: spots.find(x => x.id === 'f-' + h.spot) })).filter(x => x.s && far(x.s) && !ISLAND_SPOTS.has(x.h.spot) && !(wet && (x.h.id === 'umi' || x.s.kind === 'beach'))).sort((a, b) => dist(me, a.s) - dist(me, b.s));
    if (!hs.length) return null;
    const { h, s } = hs[0];
    return { kind: 'spot', id: s.id, name: s.name, lat: s.lat, lng: s.lng, season: true, by: from ? undefined : `季節（${se.icon}${se.name}・${sk.name}のころ）`,
      why: say(`いまは${h.text}だもんで、${s.name}へ行ってみりん。`, `${h.icon} いまは${h.text}。${s.name}へ行ってみよう。`) };
  })();
  if (seasonC && (S.guides || 0) % 2 === 0) cands.push(seasonC);

  for (const { e, when } of upcomingEvents()) {
    const s = e.spot && spots.find(x => x.id === evSpotId(e));
    if (s && far(s) && !ISLAND_SPOTS.has(e.spot)) { cands.push({ kind: 'spot', id: s.id, name: s.name, lat: s.lat, lng: s.lng, why: say(`${when}に${s.name}で「${e.name}」があるもんで、いっぺん見に行ってみりん。`, `${when}に${s.name}で「${e.name}」があるらしい。行ってみよう。`) }); break; }
  }
  if (seasonC && (S.guides || 0) % 2 === 1) cands.push(seasonC);

  const people = placeNpcs().filter(n => !npcMet(n.id) && (!from || n.id !== from.id) && okFor('npc', n.id)(n)).sort(goalSort);

  const top3 = list => { const t = list.slice(0, 3), v = mazeVert ? t.filter(vertFirst) : []; return v.length ? v : t; };
  const pn = top3(people), pickN = pn[(S.guides || 0) % (pn.length || 1)];
  if (pickN) {
    const s = spots.find(x => x.id === 'f-' + pickN.spot), about = firstClause(s && s.desc);
    cands.push({ kind: 'npc', id: pickN.id, name: `${pickN.name}（${pickN.spotName}）`, lat: pickN.lat, lng: pickN.lng,
      why: say(`${pickN.spotName}のそばに${pickN.name}がおるで、話を聞いてみりん。${about ? `（${about}）` : ''}`, `${pickN.spotName}のほうに人がいる。話を聞いてみよう。`) });
  }

  const sp = spots.filter(s => s.featured && !s.shop && !S.visits[s.id] && far(s) && !ISLAND_SPOTS.has(s.id.slice(2))).sort(goalSort)[0];
  if (sp) cands.push({ kind: 'spot', id: sp.id, name: sp.name, lat: sp.lat, lng: sp.lng, why: say(`${sp.name}へは、もう行ったかん？${firstClause(sp.desc)}。`, `${sp.name}が近いらしい。行ってみよう。`) });


  const ordAll = spots.filter(s => !s.featured && !s.shop && !S.visits[s.id] && far(s)).sort(goalSort);

  const ord = top3(ordAll.some(s => s.cat !== 'park') && !(mazeVert && !ordAll.some(s => s.cat !== 'park' && vertFirst(s)) && ordAll.some(vertFirst)) ? ordAll.filter(s => s.cat !== 'park') : ordAll);
  const os = ord[(S.guides || 0) % (ord.length || 1)];
  if (os) {
    const cat = (CATS[os.cat] || {}).n || '名所';
    cands.push({ kind: 'spot', id: os.id, name: os.name, lat: os.lat, lng: os.lng, why: say(`この先に${cat}の「${os.name}」があるで、寄ってみりん。`, `${cat}の「${os.name}」が近くにあるらしい。寄ってみよう。`) });
  }
  if (!cands.length) return null;


  let c = cands.find(x => x.refer) || cands.find(x => x.weather && (!mazeVert || dist(me, x) <= MAZE_NEAR));
  if (first1) c = null;
  if (!c) {

    const vert = mazeVert ? cands.filter(vertFirst) : [], pool = first1 ? [cands.slice().sort((a, b) => dist(me, a) - dist(me, b))[0]] : vert.length ? vert : mazeVert && !five ? [cands.slice().sort(goalSort)[0]] : cands;
    const order = [['spot', 'npc'], ['npc', 'spot']][(S.guides || 0) % 2]; for (const k of order) if ((c = pool.find(x => x.kind === k))) break;
  }
  c = c || cands[0];


  const rest = cands.filter(x => x.id !== c.id).filter((x, i, a) => a.findIndex(y => y.id === x.id) === i);
  const alts = (mazeVert ? rest.sort(first1 ? (a, b) => dist(me, a) - dist(me, b) : goalSort) : rest).slice(0, 2)
    .map(x => ({ kind: x.kind, id: x.id, name: x.name, lat: x.lat, lng: x.lng, why: x.why, by: x.by || by, refer: x.refer, weather: x.weather }));
  return { ...c, by: c.by || by, alts };
}


function heardOf(g, n) {
  const to = g.kind === 'npc' ? placeNpcs().find(x => x.id === g.id) : null, id = to ? 'f-' + to.spot : g.kind === 'spot' ? g.id : null;
  const had = id && (S.heard || {})[id];

  if (had) { had.by = n.name; had.byId = n.id; had.t = Date.now(); save(); }
  if (!id || S.visits[id] || had) return '';
  S.heard = { ...(S.heard || {}), [id]: { by: n.name, byId: n.id, t: Date.now() } };
  save();
  return id;
}


const HINT_SAY = {
  elder: ['{s}に着いたら、よう しらべてみりん。なんか見つかるかもしれんで', '{s}はな、すみずみまで よう見るもんだよ'],
  granny: ['{s}へ行ったら、すみっこまで よう見てってね', '{s}に着いたら、あわてんと ゆっくり しらべりんね'],
  man: ['{s}に着いたら、ちょっと しらべてみるといいよ', '{s}は、よう見ると おもしろいもんがあるんだ'],
  woman: ['{s}に行ったら、よく見てみて。きっと何か見つかるよ', '{s}に着いたら、まわりも しらべてみりん'],
  kid: ['{s}って、しらべると なんか出てくるんだって！', '{s}に行ったら、たんけんしてみてね！'],
  student: ['{s}は、しらべがいがあるよ', '{s}に着いたら、調べてみなよ。メモしとくといいじゃん'],
  fisher: ['{s}に行ったら、目を こらしてみりん', '{s}に着いたら、よう見ときん。見とるもんが見つけるんだ'],
  staff: ['{s}に寄ったら、ぜひ しらべてってくださいね', '{s}に着いたら、まわりも見てみてください'],
  guide: ['{s}に着いたら、ぜひ しらべてみてください。歩いてこそ見つかる話がありますよ', '{s}では、足をとめて よく見てみてください'],
  monk: ['{s}では、心しずかに よう見てごらんなさい', '{s}に着いたら、ゆっくり しらべてごらんなさい'],
};



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
  if (n.hint) return n.hint.replace('{s}', () => name);
  const list = HINT_SAY[n.look] || HINT_SAY.man, h = [...String(n.id)].reduce((a, c) => a + c.charCodeAt(0), 0);
  return list[h % list.length].replace('{s}', () => name);
}







const YAHAGI_SRC = 'https://www.mlit.go.jp/river/basic_info/jigyo_keikaku/gaiyou/seibi/pdf/yahagigawa-5.pdf';
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

  { id: 'medaka', name: 'メダカ', where: 'paddy', months: [4, 5, 6, 7, 8, 9], say: '田んぼの水の上を、小さな魚の群れが すいーっと 泳いどる。',
    note: 'メダカは、矢作川の流域で見つかる魚のうち「絶滅危惧II類」に入っとる（国土交通省の調査）。水のある田んぼや用水が、すみかになっとる。', src: YAHAGI_SRC },
  { id: 'dojo', name: 'ドジョウ', where: 'paddy', months: [4, 5, 6, 7, 8, 9], say: '田んぼの泥の中で、ドジョウが にょろっと もぐった。',
    note: 'ドジョウやシマドジョウは、矢作川の流域に すむ魚として国土交通省の調査に載っとる。', src: YAHAGI_SRC },
  { id: 'ishigame', name: 'ニホンイシガメ', where: 'paddy', months: [4, 5, 6, 7, 8, 9, 10], say: 'あぜの草かげで、石みたいな甲らの カメが ひなたぼっこしとる。',
    note: 'ニホンイシガメは、水田や畑を えさ場や たまごを産む場所に使う（矢作川流域の調査）。田んぼは、カメにも大事な場所だよ。', src: YAHAGI_SRC },
  { id: 'akaza', name: 'アカザ', where: 'kawa', say: '川の石の下から、ひげのある小さな魚が ちらっと のぞいた。',
    note: 'アカザは、矢作川にすむ魚で「絶滅危惧II類」に入っとる（国土交通省の調査）。', src: YAHAGI_SRC },
  { id: 'kamatsuka', name: 'カマツカ', where: 'kawa', say: '川底の砂の上を、細長い魚が すーっと すべっていった。',
    note: 'カマツカは、ギンブナ・モツゴなどと いっしょに、矢作川にすむ魚として国土交通省の調査に載っとる。', src: YAHAGI_SRC },
  { id: 'misago', name: 'ミサゴ', where: 'water', say: '空の高い所から、白い頭の鳥が 水めがけて ぐーんと 降りてきた。',
    note: 'ミサゴは、矢作川の流域で見られる鳥として国土交通省の調査に載っとる。', src: YAHAGI_SRC },
  { id: 'kochidori', name: 'コチドリ', where: 'higata', at: ['f-koromozaki'], say: '砂の上を、小さな鳥が ちょこちょこ 走っては ぴたっと 止まる。',
    note: 'コチドリは、矢作川の河口の汽水域で見られる鳥として国土交通省の調査に載っとる。', src: YAHAGI_SRC },
  { id: 'shijimi', name: 'ヤマトシジミ', where: 'higata', at: ['f-koromozaki'], say: '砂まじりの泥から、黒い小さな貝が のぞいとる。',
    note: 'ヤマトシジミは、アサリ・ウミニナと いっしょに、矢作川の河口の干潟で見つかる貝として国土交通省の調査に載っとる。', src: YAHAGI_SRC },
];
const CRITTER_DAILY = 5, CRITTER_PTS = 10, HIGATA = ['f-koromozaki', 'f-tombolo'];
const WHERE_NAME = { paddy: '田んぼ', water: '水べ', kawa: '川・池', higata: '干潟' };

function critterPool(where) {
  const m = new Date().getMonth() + 1;
  const nearIds = where === 'water' ? spots.filter(s => HIGATA.includes(s.id) && dist(me, s) < 1500).map(s => s.id) : [];
  const higata = c => c.where === 'higata' && nearIds.some(id => !c.at || c.at.includes(id));
  const P = window.nishioPixel, fresh = where === 'water' && !nearIds.length && !!me && !!P && P.waterKind(me.lat, me.lng) === 'kawa';
  return CRITTERS.filter(c => (c.where === where || higata(c) || (c.where === 'kawa' && fresh)) && (!c.months || c.months.includes(m)));
}

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
  const pool = fresh.length && Math.random() < 0.6 ? fresh : ok;
  return critterMet(pool[Math.floor(Math.random() * pool.length)]);
}

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
  if (first) { gainPoints(CRITTER_PTS); S.log.unshift({ type: 'critter', t: Date.now(), pts: CRITTER_PTS, name: `生きもの手帳：${c.name}`, icon: '🐾' }); badgesSoon(); }
  save();
  track('critter_meet', { critter: c.id, first, mode: demo ? 'play' : 'walk' });
  if (!meetShow(c, first)) toast(first ? `🐾 ${c.name}　📗 +${CRITTER_PTS}pt` : `🐾 ${c.name}`);
  return c;
}


function meetShow(c, first) {
  return false;
}
function meetType(m) {
  $('meetText').textContent = m.chars.slice(0, m.n).join('');
  if (m.n < m.chars.length) return;
  clearInterval(meetShow.iv); m.done = true;
  meetShow.t = setTimeout(meetHide, 3000);
}
function meetHide() { clearInterval(meetShow.iv); clearTimeout(meetShow.t); meetShow.m = null; $('meetBox').hidden = true; }


const SEARCH_PTS = 5;
const canSearch = s => { const h = (S.heard || {})[s.id]; return !!h && !h.found; };

function searchFact(s) {
  const pool = factPool(), fresh = [...pool.keys()].filter(k => !S.facts.includes(k) && k !== `s:${s.id}` && !movieFact(k));
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
  save(); badgesSoon();
  track('alley_find', { fresh, mode: demo ? 'play' : 'walk' });
  showReward(ALLEY.pts, '🔍 路地の行き止まりを しらべたら 見つかった！', fresh ? ['📖 まちメモ +1'] : [], lvUp, fresh ? factPool().get(k) : '', null);
  return true;
}


const MZ_GRAIN = { pts: 2, every: 10, bonus: 20 };
function mzGrainGot() {
  const p = Math.floor((Date.now() + 9 * 3600e3) / 86400e3) + ':';
  if (!Array.isArray(S.mzGrainGot) || S.mzGrainGot.some(k => !k.startsWith(p))) S.mzGrainGot = (S.mzGrainGot || []).filter(k => k.startsWith(p));
  return S.mzGrainGot;
}
function mzShoo() {
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
  if (bonus) S.log.unshift({ type: 'grain', t: Date.now(), pts: MZ_GRAIN.every * MZ_GRAIN.pts + bonus, name: `金の米つぶを ${n}こ ひろった`, icon: '🌾' });

  const msg = bonus ? `🌾 金の米つぶ きょう ${n}こ！ ボーナス +${bonus}pt` : n === 1 ? '🌾 金の米つぶ：行き止まりに おちているよ（毎日 かわる）' : '';
  if (msg || lvUp) toast(`${msg}${lvUp ? `${msg ? ' ' : ''}⭐ レベル${lvUp}！` : ''}`);
  save();
  track('maze_grain', { n });
  return { n, pts };
}

const MZ_FRUIT_PTS = 10;
function mzFruit() {
  const lvUp = gainPoints(MZ_FRUIT_PTS);
  if (lvUp) toast(`⭐ レベル${lvUp}！`);
  save();
  track('maze_fruit', {});
  return { pts: MZ_FRUIT_PTS };
}

const MZ_PIECE_PTS = 5, MZ_PIECE_DONE = 15;
function mzPiece(done) {
  const pts = MZ_PIECE_PTS + (done ? MZ_PIECE_DONE : 0), lvUp = gainPoints(pts);
  if (lvUp) toast(`⭐ レベル${lvUp}！`);
  save();
  track('maze_piece', { done: !!done });
  return { pts };
}

const MZ_VIEW_PTS = 15;
function mzView() {
  const lvUp = gainPoints(MZ_VIEW_PTS);
  if (lvUp) toast(`⭐ レベル${lvUp}！`);
  save();
  track('maze_view', {});
  return { pts: MZ_VIEW_PTS };
}

const MZ_CACHE_PTS = 20;
function mzCache() {
  const lvUp = gainPoints(MZ_CACHE_PTS);
  S.cacheGot = (S.cacheGot || 0) + 1;
  if (lvUp) toast(`⭐ レベル${lvUp}！`);
  save();
  track('maze_cache', {});
  return { pts: MZ_CACHE_PTS };
}

const MZ_QUEST_PTS = 5, MZ_QUEST_DONE = 15;
function mzQuest(done) {
  const pts = MZ_QUEST_PTS + (done ? MZ_QUEST_DONE : 0), lvUp = gainPoints(pts);
  if (done) S.questGot = (S.questGot || 0) + 1;
  if (lvUp) toast(`⭐ レベル${lvUp}！`);
  save();
  track('maze_quest', { done: !!done });
  return { pts };
}


const movieOf = s => (window.NISHIO_MOVIE && s ? NISHIO_MOVIE.movieAt(s.id, s.area) : null);
function movieCheck() {

}
function shopAfter(s, key = stateKey(), t0 = Date.now()) {
  (function go() {
    if (stateKey() !== key || !$('pxInfo').hidden || Date.now() - t0 > 30000) return;
    if (rewardBusy() || document.body.classList.contains('jump-open')) return setTimeout(go, 600);
    if (document.body.classList.contains('px')) { $('pxInfoBody').innerHTML = popupHtml(s); $('pxInfo').hidden = false; }
    else markers.get(s.id)?.openPopup();
  })();
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

const PRAISE_AT = [5, 10, 20, 30, 50, 100];
function praiseCheck(at) {
  const n = Object.keys(S.visits).length;
  if (!PRAISE_AT.includes(n) || (S.praised || []).includes(n)) return;
  S.praised = [...(S.praised || []), n];
  const who = (window.NISHIO_NPCS || []).find(x => x.id === 'castle-guide');
  const open = areas.map(a => ({ a, p: areaProgress(a.id) })).filter(x => x.p.total > x.p.done).sort((x, y) => x.p.done / x.p.total - y.p.done / y.p.total || (y.p.total - y.p.done) - (x.p.total - x.p.done));
  const left = open.find(x => x.a.id !== at) || open[0];
  setTimeout(() => toastAfter(`📜 ${who ? who.name : 'ガイドさん'}「もう${n}か所もめぐったじゃん！${left ? `つぎは${left.a.name}${left.a.id === at ? 'の まだ行っとらん所' : 'のほう'}も歩いてみりん。まだ${left.p.total - left.p.done}か所あるよ」` : 'たいしたもんだよ」'}`), 1200);
}
function setGuide(g) {
  S.guide = g ? { ...g, t: Date.now() } : null;
  if (g) S.guides = (S.guides || 0) + 1;
  glowArm(S.guide);
  save();
  renderGuide();
}



const KT = window.nishioKomeTalk;
const ktOn = () => !!(KT && KT.on());
const ktBusy = () => howtoOpen() || modalOpen() || pxBusy() || !$('pxInfo').hidden
  || ['log', 'voice', 'rewards', 'settings'].some(t => !$('panel-' + t).hidden);
function ktAskGuide(lead, mood) {
  if (!ktOn()) return false;
  let shown = [];

  const Q = 'つぎは どこへ 行く？', last = lead[lead.length - 1];
  const pages = !last ? [Q] : [...lead.slice(0, -1), typeof last === 'string' ? `${last}\n${Q}` : { ...last, t: `${last.t}\n${Q}` }];
  return KT.say(pages, { mood, key: 'guide', busy: () => ktBusy() || !S.guide,
    choices: () => { const g = S.guide; shown = g ? [g, ...(g.alts || [])].map(o => o.id) : []; return g ? [g, ...(g.alts || [])].map((o, i) => `${o.kind === 'npc' ? '👤' : '📍'} ${guideDispName(o)}${i ? '' : ' ← おすすめ'}`) : []; },
    then: i => {
      const id = shown[i], g = S.guide;
      if (!id || !g) return;
      if (g.id !== id) { const k = (g.alts || []).findIndex(a => a.id === id); if (k < 0) return; pickAlt(k); }
      toast(`🧭 ${guideDispName(S.guide)}へ 行こう`); track('kome_talk_pick', { alt: i > 0 });
    } });
}

function komeBanashi(g) {
  const KB = window.NISHIO_KOMEBANASHI, sp = spots.find(x => x.id === g.id);
  const r = KB && ktOn() && KB.pick(sp ? sp.area : null, new Date().getMonth() + 1, S.komeSeen);
  if (!r) return [];
  const pages = r.item.pages.map(p => typeof p === 'string' ? { t: p } : p);
  const first = pages[0];
  pages[0] = () => { S.komeSeen = r.seen; save(); track('kome_banashi', { id: r.item.id }); return first; };
  return pages;
}


function komeNimotsu(g) {
  const NM = window.NISHIO_NIMOTSU, sp = spots.find(x => x.id === g.id);
  const it = NM && sp && sp.area && NM.pick(sp.area, new Date().getMonth() + 1, NM.current(S.nimotsu, Date.now()));
  if (!it) return [];
  S.nimotsu = { id: it.id, t: Date.now() }; save(); track('kome_nimotsu', { id: it.id });
  return ktOn() ? [it.say] : [];
}
modeListeners.push(() => { if (KT) KT.clear(); });
const guideTarget = () => {
  const g = S.guide;
  if (!g) return null;
  if (g.kind === 'npc') { const n = placeNpcs().find(x => x.id === g.id); return n ? { ...g, ...npcSpot(n) } : null; }

  const s = spots.find(x => x.id === g.id);
  return s ? { ...g, lat: s.lat, lng: s.lng } : g;
};

function guideReward(g) {
  S.guideDone = [g.id, ...(S.guideDone || []).filter(x => x !== g.id)].slice(0, GUIDE_RECENT);
  const day = dayState();
  day.guide = day.guide || 0;
  const pts = day.guide < GUIDE_DAILY ? GUIDE_PTS : 0;
  if (pts) { day.guide++; gainPoints(pts); S.log.unshift({ type: 'guide', t: Date.now(), pts, name: `すすめられた所に着いた：${g.name}`, icon: '🧭' }); }
  track('guide_arrive', { kind: g.kind, by: g.by, mode: demo ? 'play' : 'walk' });
  return pts;
}




function weatherGuide() {
  const g = S.guide, w = weatherNow(), wet = !!(w && w.raining);
  if (!w) return;
  if (!g || g.refer || g.mine || /の話$/.test(g.by || '') || !!g.weather === wet) return;
  if (!fixOk()) return;
  const key = `${demo}:${wet}:${spotsVersion}:${g.id}:${Math.round(me.lat * 550)}:${Math.round(me.lng * 450)}`;
  if (weatherGuide.key === key) return;
  weatherGuide.key = key;
  const next = decideGuide(null);
  if (wet && !(next && next.weather)) return;
  S.guide = next ? { ...next, t: Date.now() } : null; save();
}
function checkGuide() {
  if (!me) return;

  const g0 = guideTarget();
  if (!(g0 && g0.kind !== 'npc' && dist(me, g0) <= guideRadius(g0) && fixOk())) weatherGuide();
  const g = guideTarget();
  if (!g) {

    if (spots.length && !S.guide && fixOk() && Date.now() - (checkGuide.t || 0) > 5000) { checkGuide.t = Date.now(); setGuide(decideGuide(null)); }
    return;
  }




  const farLimit = mazeNow() && !g.mine ? (g.near ? MAZE_NEAR * 1.3 : GUIDE_RANGE.play * 1.5) : g.refer ? GUIDE_FAR : GUIDE_RANGE[demo ? 'play' : 'walk'] * 2;
  if (dist(me, g) > farLimit && fixOk()) { setGuide(decideGuide(null)); return; }
  if (g.kind === 'npc') return;
  if (dist(me, g) > guideRadius(g) || !fixOk()) return;
  guideArrived.id = g.id; guideArrived.at = performance.now();
  const pts = guideReward(g);
  const next = decideGuide(null);
  setGuide(next);

  const hi = [`${g.name}に 着いたね！`, `${g.name}、いい所じゃん。`, `${g.name}に とうちゃく！`][(S.guides || 0) % 3];
  if (ktAskGuide([{ t: `${hi}${pts ? `　+${pts}pt` : ''}`, mood: 'happy' }, ...komeBanashi(g), ...komeNimotsu(g)], 'smile')) { rivalSay(g, next); return; }
  const msg = arriveMsg(g, pts, next, mazeNow());
  if (msg) toast(msg);
  rivalSay(g, next);
}


function npcBriefMsg(brief, got, lv, maze) {
  const head = brief.icons && `${brief.icons}${got ? ` +${got}pt` : ''}${lv ? ` Lv${lv}` : ''}`;
  const tail = brief.next && (maze ? brief.marks : `📜 → ${brief.next}${brief.marks ? ` ${brief.marks}` : ''}`);
  return [head, tail].filter(Boolean).join('　');
}



function arriveMsg(g, pts, next, maze) {
  const icon = g.byId ? '🎉' : '🧭', p = pts ? ` +${pts}pt` : '';
  if (!simple()) return `${g.byId ? '🎉 イベント達成：' : '🧭 '}${guideDispName(g)}に着いた${p}${next ? `　→ ${next.why}` : ''}`;
  if (maze) return p ? icon + p : '';
  return `${icon} ${guideDispName(g)}${p}`;
}


const RIVAL = 'さんぽ仲間のソウタ';

function rivalWhere() {
  const at = S.rival && S.rival.at;
  if (!at) return null;
  const s = spots.find(x => x.id === at), n = !s && placeNpcs().find(x => x.id === at);
  const p = s || (n && { lat: n.lat, lng: n.lng, name: n.spotName });
  return p ? { at, lat: p.lat - 14 / 111320, lng: p.lng - 14 / (111320 * Math.cos(p.lat * Math.PI / 180)), name: p.name } : null;
}
const RIVAL_NEAR = 300;
function rivalSay(g, next) {
  const met = S.rival && S.rival.at === g.id;

  const np = next && (next.kind === 'npc' ? (n => n && npcSpot(n))(placeNpcs().find(x => x.id === next.id)) : spots.find(x => x.id === next.id) || next);
  const near = !!(np && np.lat && me && dist(me, np) < RIVAL_NEAR);
  S.rivalN = (S.rivalN || 0) + 1;
  if (near && S.rivalN % 3 === 0) S.rivalN--;
  const go = !!next && !near && S.rivalN % 3 === 0;
  const to = next && (next.kind === 'npc' ? (placeNpcs().find(x => x.id === next.id) || {}).spotName || next.name : next.name);
  S.rival = go ? { at: next.id } : null;
  save();

  if (met) toastAfter(`🏃 ${RIVAL}「また 会えたね！ ${g.name}、いい所だら。${go ? `おれは 次、${to}へ 行ってみるね` : 'またね'}」`);
  else if (go) toastAfter(`🏃 ${RIVAL}「${g.name}、いい所だね。おれは ${to}へ 行ってみるね。また 会えるかも」`);
}

$('guide').addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-alt]');
  if (b) { e.stopPropagation(); pickAlt(+b.dataset.alt); return; }
  $('guide').classList.toggle('open');
});
function pickAlt(i) {
  const g = S.guide, a = g && g.alts && g.alts[i];
  if (!a) return;

  const keep = ({ kind, id, name, lat, lng, why, by, byId, refer, weather }) => ({ kind, id, name, lat, lng, why, by, byId, refer, weather });
  S.guide = { ...keep(a), byId: a.byId || g.byId, mine: true, alts: [keep(g), ...g.alts.filter((_, k) => k !== i).map(keep)], t: Date.now() };

  const by = S.guide.byId && placeNpcs().find(n => n.id === S.guide.byId);
  if (by) heardOf(S.guide, by);
  save();
  $('guide').classList.remove('open');
  renderGuide();
  toast(`🧭 行き先を「${guideDispName(a)}」にした`);
  track('guide_pick', { kind: a.kind, mode: demo ? 'play' : 'walk' });
}

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





function guideDispName(g) {
  if (!g || !g.name) return '';
  if (g.kind !== 'npc') return g.name;
  const m = /^([^（）]+)（([^（）]+)）$/.exec(g.name);
  if (m) return `${m[2]}（${m[1]}）`;
  const n = g.id && typeof placeNpcs === 'function' ? placeNpcs().find(x => x.id === g.id) : null;
  return n && n.name && n.spotName && g.name === `${n.name}（${n.spotName}）` ? `${n.spotName}（${n.name}）` : g.name;
}
function renderGuide() {
  const el = $('guide');
  const g = guideTarget();
  if (!g || !me) { el.hidden = true; return; }
  el.hidden = false;
  if (!glow.armed) glowArm(S.guide);

  const alts = (S.guide && S.guide.alts) || [];
  const mr = demo && window.nishioPixel && nishioPixel.maze && nishioPixel.maze.route ? nishioPixel.maze.route() : null;
  const far = fmtM(mr ? mr.m : dist(me, g));
  const gname = `<em class="gn">${mr ? '🏁 ' : ''}${esc(guideDispName(g))}</em>`;
  const head = simple() && window.NSG_ICONS ? `${NSG_ICONS.arrow(bearing(me, g))}${guideThumb(g)}${g.byId ? PIA('scroll', 'イベント') : ''} ${gname}<span>　${far}</span>` : `${g.byId ? '📜' : '🧭'} ${gname}<span>　${far}</span>`;
  el.innerHTML = `<b>${head}</b>`
    + (alts.length ? `<span class="alts"><em>ほかの行き先：</em>${alts.map((a, i) => `<button type="button" class="btn mini" data-alt="${i}">↪ ${esc(guideDispName(a))}${me ? `（${fmtM(dist(me, a))}）` : ''}</button>`).join('')}</span>` : '');
  el.title = `${g.by}「${g.why}」`;

  el.classList.remove('hasChips');
}
const DIR8 = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
function bearing(a, b) {
  const y = Math.sin((b.lng - a.lng) * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180);
  const x = Math.cos(a.lat * Math.PI / 180) * Math.sin(b.lat * Math.PI / 180) - Math.sin(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.cos((b.lng - a.lng) * Math.PI / 180);
  return DIR8[Math.round(((Math.atan2(y, x) * 180 / Math.PI + 360) % 360) / 45) % 8];
}




let place = { city: '', town: '' };
function setPlace(city, town) {
  if (place.city === city && place.town === town) return;
  place = { city, town };
  renderKoyomi();
}

function renderKoyomi() {
  const el = $('koyomi');
  if (!el || !KO) return;
  const now = new Date(), px = document.body.classList.contains('px');
  if (px) { el.hidden = true; renderKoyomi.key = ''; return; }
  if (demo && !(store.get('nsg_mzgoals', 0) >= 3)) { el.hidden = true; renderKoyomi.key = ''; return; }
  const pc = px ? place : { city: ((me && placeAt(me.lat, me.lng)) || {}).name || '', town: '' };
  const key = ymd() + ':' + now.getHours() + ':' + pc.city + ':' + pc.town;
  if (WX) {
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
  el.innerHTML = (simple()
    ? `<b>${now.getMonth() + 1}/${now.getDate()} ${PI(SEASON_PI[se.id] || '', se.name)}${wx && WX_PI[wx.kind] ? PI(WX_PI[wx.kind], wx.name) : ''}</b>`
    : `<b>${now.getMonth() + 1}/${now.getDate()}（${WEEKDAY(now)}）${se.icon}${wx ? wx.icon : ''}${where ? `　📍${esc(where)}` : ''}</b>`)
    + (simple() ? koyomiPic(now, sk, p, hs, wx, se, pc, SEASON_PI) : `<span class="more">${esc(KO.line(now))}${wxShort}${pc.city ? `<br>📍 ${esc(pc.city)}${pc.town ? ' ' + esc(pc.town) : ''}` : ''}<br>${esc(sk.name)}：${esc(sk.desc)}<br>${p.icon} ${esc(p.desc)}`
    + (hs.length ? `<br>見ごろ：${hs.map(h => `${h.icon}${esc(h.name)}`).filter((v, i, a) => a.indexOf(v) === i).join('・')}` : '')
    + (KO.doyoUshi(now) ? '<br>🐟 きょうは土用の丑の日' : '') + wxLong + '</span>');
  el.hidden = false;
}

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

  if (me && store.get('nsg_started', false) && store.get('nsg_play_day', '') !== ymd()) { store.set('nsg_play_day', ymd()); track('play_day', { mode: demo ? 'play' : 'walk', day_n: dayN() }); }
  const btn = $('spinBtn');
  syncChestMarkers();
  if (!me) {
    btn.hidden = true;
    $('guide').hidden = true;
    showRing(null);
    showGuide(null);

    setStatus(gpsError ? esc(gpsError) + (demo ? '' : RESCUE_BTN('geo')) + waitLine() : (demo ? '地図をタップすると、その場所へ移動します。' : waitLine()), true);
    return;
  }
  if (bagDone()) openBagSoon();
  if (welcomeDue() || firstPick || rewardBusy()) {  }
  else if (store.get('nsg_started', false) && S.prevToast !== ymd() && prevDayStat()) {
    const p = prevDayStat();
    S.prevToast = ymd(); save();
    setTimeout(() => toastAfter(`👣 ${p.label}のさんぽ：${prevDayText(p)}`), 2500);
  }
  checkGuide();
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
  showGuide(guideTarget() || (selected ? null : nearest));


  const autoSoon = !!selected && mazeNow() && guideArrived.id === selected.id && performance.now() - guideArrived.at < GUIDE_AUTO_MS;
  if (selected && !autoSoon) {
    btn.hidden = false;
    btn.classList.toggle('feat', !!selected.featured);
    const th = simple() ? spotThumb(selected) : '';
    if (th) $('spinIco').innerHTML = th; else if (simple()) $('spinIco').innerHTML = catArt(selected); else $('spinIco').textContent = iconOf(selected);
    $('spinName').textContent = selected.name;
    const why = driving ? '🚗 車を降りるとチェックインできます'
      : !demo && me.acc > CFG.maxAccuracy ? '📡 GPSが はっきりするまで、ちょっと まってね…' : '';
    btn.disabled = !!why;
    if (why || !simple()) $('spinSub').textContent = why || `タップして +${ptsOf(selected)}pt${S.visits[selected.id] ? '' : '（初訪問ボーナスあり）'}`;
    else $('spinSub').innerHTML = `${PIA('coin', 'ポイント')}+${ptsOf(selected)}${S.visits[selected.id] ? '' : ' ' + PI('new', 'はじめての場所')}`;
  } else {
    btn.hidden = true;
  }

  renderGuide();
  if ((S.sealPicks || []).length) sealPickCheck();

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

  const h1 = dayState().h100, chain = [
    h1 && !h1.done ? `${simple() ? PIA('feet', '100歩たんけん') : '👣'} たんけん <b>${h1.steps}</b>/100` : ''].filter(Boolean).join('　');


  const lowMap = demo && window.innerHeight <= 340 && window.innerWidth > window.innerHeight;
  if (!msgs.length && simple()) { setStatus(lowMap ? '' : chain, true); return; }
  if (!msgs.length) {
    const qd = todaysQuests().filter(q => dayState().done.includes(q.id)).length, bl = bagLine();
    const bag = bl ? (simple() ? `　${PIA('bag', 'おみやげ袋')} <b>${bl.done}</b>/${bl.b.km}km` : `　🎒 袋 <b>${bl.done}</b>/${bl.b.km}km`) : '';
    msgs.push((simple() ? `${PIA('book', 'まちメモ')} <b>${knownFacts()}</b>　${PIA('scroll', '今日のクエスト')} <b>${qd}</b>/3` : `📖 まちメモ <b>${knownFacts()}</b>　📜 クエスト <b>${qd}</b>/3`) + bag + (chain ? '　' + chain : ''));
  } else if (chain) msgs.push(chain);
  setStatus(msgs.slice(0, 2).join('<br/>'), true);
}


function showRing(s) {
  if (!s) { if (spotRing) { spotRing.remove(); spotRing = null; } return; }
  const color = s.featured ? '#e3a42b' : '#2a6fdb';
  if (!spotRing) spotRing = L.circle([s.lat, s.lng], { weight: 2, opacity: 0.7, dashArray: '6 6', fillOpacity: 0.08, interactive: false }).addTo(map);
  spotRing.setLatLng([s.lat, s.lng]).setRadius(reachOf(s)).setStyle({ color, fillColor: color });
}


let guideLine = null;
function showGuide(s) {
  if (!s || !me) { if (guideLine) { guideLine.remove(); guideLine = null; } return; }
  const pts = [[me.lat, me.lng], [s.lat, s.lng]];
  if (!guideLine) guideLine = L.polyline(pts, { color: '#5d6b60', weight: 2, opacity: 0.6, dashArray: '2 6', interactive: false }).addTo(map);
  else guideLine.setLatLngs(pts);
}


function countVisits(fn) { return Object.values(S.visits).filter(fn).length; }

const fbMine = () => { const m = store.get('nsg_fb_mine', []); return Array.isArray(m) ? m.filter(x => x && /^[0-9a-f]{12}$/.test(x.rid)) : []; };
const voice = { data: null, at: 0 };
const replyOf = rid => (voice.data && voice.data.replies && voice.data.replies[rid]) || null;
const voicesReflected = () => fbMine().filter(m => (replyOf(m.rid) || {}).s === 'reflected').length;

const fbStats = () => { const x = store.get('nsg_fb_stats', null) || {}; return { sent: x.sent | 0, react: x.react | 0, themes: x.themes | 0, wk: Array.isArray(x.wk) ? x.wk : [] }; };
const fbStatsAdd = f => { const x = fbStats(); f(x); x.wk = x.wk.slice(-60); store.set('nsg_fb_stats', x); };
function badgeDefs() {
  const uniq = Object.keys(S.visits).length;

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
    { id: 'oldmap', i: '🗺️', n: '明治の村あつめ', d: '「古い地図」のイベントで、明治39年ごろの村を ぜんぶ見つける', cur: (S.oldmap || []).length, goal: (window.NISHIO_OLDMAP && NISHIO_OLDMAP.VILLAGES.length) || 11 },
    { id: 'critterall', i: '📜', n: '生きもの手帳の賞状', d: `生きもの手帳の${CRITTERS.length}しゅるい ぜんぶに出会う（季節で出るものもあるので、1年かけて）`, cur: CRITTERS.filter(c => (S.critters || {})[c.id]).length, goal: CRITTERS.length },
    { id: 'clear', i: '👑', n: '殿堂入り', d: '5つの地区のしるしを集めて、西尾城跡のガイドさんに会う（クリア）', cur: S.cleared ? 1 : 0, goal: 1 },
    ...areas.filter(a => SEAL_BY[a.id] && (!SEAL_POST.has(a.id) || S.cleared)).map(a => {
      const p = areaProgress(a.id), goal = Math.min(SEAL_AT, Math.max(p.total, 1)), by = sealBy(a.id);
      return { id: 'seal-' + a.id, i: '🔖', n: `${a.name}のしるし`, d: `${a.name}の注目スポットを${goal}か所めぐって、${by ? by.name : '地区の人'}に認めてもらう`, cur: p.done, goal, ready: (S.seals || []).includes(a.id) };
    }),
    ...areas.map(a => {
      const p = areaProgress(a.id);
      return { id: 'area-' + a.id, i: a.icon || '🗾', n: `${a.name}制覇`, d: `${a.name}の注目スポット${p.total}か所すべて`, cur: p.done, goal: Math.max(p.total, 1), ready: spotMeta.loaded && p.total > 0 };
    }),
    { id: 'walk5', i: '🚶', n: '5kmウォーカー', d: '合計5km歩く', cur: km, goal: 5 },
    { id: 'walk42', i: '🏃', n: 'フルマラソン', d: '合計42.195km歩く', cur: km, goal: 42.195 },
    { id: 'alley10', i: '🔍', n: '路地はかせ', d: '歩く地図で、路地の行き止まりを10か所 しらべる', cur: (S.alleys || []).length, goal: 10 },
    { id: 'h100', i: '👣', n: 'たんけん名人', d: '100歩たんけんで、はじめての道を50マス 歩く', cur: S.h100best || 0, goal: 50 },

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
    toastAfter(`🏅 バッジ獲得：${fresh.map(b => b.i + ' ' + b.n).join('、')}`);
    if (fresh.some(b => b.id === 'critterall')) toastAfter(`📜 ${(sealBy('nishio') || {}).name || 'ガイドさん'}「生きもの手帳が ぜんぶ そろったじゃん！ 1年 歩きとおした あかしだよ。賞状を おくるでね」`);
  }
  sealHints();
}

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


const CLEAR_BY = 'castle-guide';
const clearReady = () => SEAL_MAIN.every(id => (S.seals || []).includes(id));
function clearGive(n) {
  if (n.id !== CLEAR_BY || S.cleared || !clearReady()) return false;
  S.cleared = { t: Date.now(), rec: clearRecord() };
  save();
  track('game_clear', { days: dayN(), spots: Object.keys(S.visits).length, mode: demo ? 'play' : 'walk' });
  const key = stateKey();
  badgesSoon();
  setTimeout(() => { if (stateKey() === key) toastAfter('👑 殿堂入り！ 記録は きろく の バッジ「👑 殿堂入り」から 見られるよ'); }, 900);
  if (ktOn()) setTimeout(() => KT.say([{ t: 'ぜんぶの 地区を めぐったね！ いっしょに 歩けて うれしかったよ。', mood: 'happy' }, 'このあとも、また いっしょに さんぽ しよう。'], { busy: ktBusy, key: 'clear' }), 1500);
  return true;
}

function badgesSoon() {
  const key = stateKey();
  setTimeout(() => { if (stateKey() === key) checkBadges(); }, 800);
}



function endingWhenFree(key = stateKey()) {
  const w = endingWhenFree;
  if ($('reward').querySelector('.ending') || stateKey() !== key) return;
  if (w.key === key) return;
  const gen = w.gen = (w.gen || 0) + 1;
  w.key = key;
  (function go() {
    if (gen !== w.gen) return;
    if (stateKey() !== key || !S.cleared) { w.key = null; return; }
    if (rewardBusy() || !$('pxInfo').hidden) return setTimeout(go, 500);
    w.key = null; showEnding();
  })();
}
function clearRecord() {
  return { spots: Object.keys(S.visits).length, met: (S.met || []).length, km: Math.floor(S.walked / 100) / 10, dots: (S.dots || []).length, facts: knownFacts(), critters: Object.keys(S.critters || {}).length,
    chain: (S.chain && S.chain.best) || 0, h100: S.h100best || 0, alleys: (S.alleys || []).length };
}
function showEnding() {
  const npcs = window.NISHIO_NPCS || [], by = npcs.find(n => n.id === CLEAR_BY);
  const r = (S.cleared && S.cleared.rec) || clearRecord(), when = S.cleared && S.cleared.t ? new Date(S.cleared.t) : null;
  const rows = [
    ...(when ? [['殿堂入りした日', `${when.getFullYear()}/${when.getMonth() + 1}/${when.getDate()}`]] : []),
    ['めぐった名所', `${r.spots}か所`], ['話した人', `${r.met}人`], ['歩いた道のり', `${r.km}km`],
    ['西尾ドット絵', `${r.dots}枚`], ['まちメモ', `${r.facts}こ`], ['生きもの', `${r.critters}しゅるい`],
    ...(r.alleys ? [['しらべた路地の行き止まり', `${r.alleys}か所`]] : []),
  ];
  const seals = SEAL_MAIN.map(id => { const a = areas.find(x => x.id === id), p = npcs.find(n => n.id === SEAL_BY[id]); return a ? `<li>🔖 ${esc(a.name)}のしるし <small>${esc(p ? p.name : '')}</small></li>` : ''; }).join('');
  const el = $('reward');
  el.innerHTML = `<div class="rw ending"><div class="big">🏯</div><div class="nm">西尾さんぽ 殿堂入り</div>
    <p class="say">${esc(by ? by.name : 'ガイドさん')}「5つの地区を ぜんぶ歩いてくれたじゃん。あんたは もう 西尾さんぽの名人だよ！」</p>
    <ul class="rec">${rows.map(([k, v]) => `<li>${esc(k)} <b>${esc(v)}</b></li>`).join('')}</ul>
    <ul class="seals">${seals}</ul>
    <p class="say">🏃 ${esc(RIVAL)}「おめでとう！ つぎは となりの市町も いっしょに歩こまい」</p>
    ${ED.shops ? `<p class="say">🍚 お米屋さん（らいすぴあ・近藤米穀店）「西尾を歩いてくれて ありがとう。おなかが すいたら、お米を買いに 寄ってってね」</p>
    <p><a class="btn mini line" href="${esc(lineUrl('ending'))}" target="_blank" rel="noopener">LINEで友だち追加（常連さまポイント）</a></p>` : ''}
    <p class="note">このあとも そのまま遊べます。きろく の バッジ「👑 殿堂入り」から、いつでも この記録を見られます</p>
    <button type="button" class="btn mini" data-rw-close>とじる</button></div>`;
  toastHold(); el.classList.add('show'); clearTimeout(showReward.t);
}
function sealGive(n) {
  const id = Object.keys(SEAL_BY).find(k => SEAL_BY[k] === n.id), a = id && areas.find(x => x.id === id);
  if (!a || (S.seals || []).includes(id) || !sealReady(id)) return '';
  S.seals = [...(S.seals || []), id];
  const cands = sealCands(id);
  if (cands.length === 2) S.sealPicks = [...(S.sealPicks || []), { area: id, name: a.name, cands }];
  save();
  badgesSoon();
  track('seal_get', { area: id, mode: demo ? 'play' : 'walk' });
  return `🔖 ${n.name}「${a.name}を${sealGoal(id)}か所も歩いてくれたじゃん！ ${a.name}のしるし、持ってってちょう」`;
}

const SEAL_AT = 5, SEAL_BY = { nishio: 'castle-guide', isshiki: 'sakana-okami', kira: 'kira-history', hazu: 'sangane-hiker', sakushima: 'island-granny',

  okazaki: 'okazaki-castle-guide', anjo: 'anjo-museum-guide', hekinan: 'hekinan-philosophy-guide', takahama: 'takahama-oni-guide', kota: 'kota-shiryokan-guide', gamagori: 'gamagori-takeshima-guide' };
const SEAL_POST = new Set(['okazaki', 'anjo', 'hekinan', 'takahama', 'kota', 'gamagori']);
const SEAL_MAIN = Object.keys(SEAL_BY).filter(id => !SEAL_POST.has(id));
const sealBy = id => (window.NISHIO_NPCS || []).find(n => n.id === SEAL_BY[id]);
const sealGoal = id => Math.min(SEAL_AT, Math.max(areaProgress(id).total, 1));
const sealReady = id => (!SEAL_POST.has(id) || !!S.cleared) && spotMeta.loaded && areaProgress(id).total > 0 && areaProgress(id).done >= sealGoal(id);






const IDLE = { minMin: 10, baseH: 4, napH: 2, ptPerHour: lv => 60 + 6 * lv, maxFacts: 3, dotMin: 120, maxDots: 2,
  ups: [
    { id: 'bag', icon: '🎒', name: 'おおきなリュック', desc: 'るすばん中に集まるポイントが1.5倍・2倍・2.5倍', cost: [400, 1200, 3600] },
    { id: 'nap', icon: '🏠', name: 'るすばん上手', desc: 'るすばんで集まる時間が2時間ずつのびて、まちメモとドット絵も1つずつ多く持ち帰る', cost: [500, 1500, 4500] },
  ] };
const idleOf = () => { if (!S.idle || typeof S.idle !== 'object') S.idle = { last: 0, lv: {} }; if (!S.idle.lv) S.idle.lv = {}; return S.idle; };
const upLv = id => Math.min(3, idleOf().lv[id] || 0);
const idleCapH = () => IDLE.baseH + IDLE.napH * upLv('nap');
const autoInterval = () => [230, 190, 160, 135][upLv('spd')];

function learnFact(id) {
  const c = me || { lat: CFG.center[0], lng: CFG.center[1] };
  const k = pickFact({ id, lat: c.lat, lng: c.lng });
  if (!k || S.facts.includes(k)) return '';
  S.facts.push(k);
  return k;
}

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

  const dots = [], home = spots.filter(x => { const c = cityAt(x.lat, x.lng); return c && c.name === '西尾市'; });
  for (let n = Math.min(IDLE.maxDots + upLv('nap'), Math.floor(min / IDLE.dotMin)), k = 0; k < n && home.length; k++) {
    const sp = home[Math.floor(Math.random() * home.length)], d = gainDot(sp.lat, sp.lng, `idle:${now}:${k}`, sp.area);
    if (d) dots.push(d);
  }
  const h = Math.floor(min / 60), m = Math.round(min % 60), capped = (now - last) / 60000 >= idleCapH() * 60;
  const detail = `${h ? h + '時間' : ''}${m}分${learned.length ? `・まちメモ+${learned.length}` : ''}${dots.length ? `・絵+${dots.length}` : ''}${capped ? `・上限${idleCapH()}時間` : ''}`;
  S.log.unshift({ type: 'idle', t: now, pts, name: `るすばんのさんぽ（${detail}）`, icon: '🏠', mins: Math.round(min), facts: learned.length, dots: dots.length });
  const lvUp = gainPoints(pts);
  save();
  track('idle_return', { minutes: Math.round(min) });
  toast(simple() ? `🏠 +${pts}${lvUp ? ` ⭐Lv${lvUp}` : ''}` : `🏠 るすばん +${pts}pt${lvUp ? ` ⭐Lv${lvUp}` : ''}`);
  renderLog();
  refreshNearby();
}
function idleMark() { if (demo) { idleOf().last = Date.now(); save(); } }

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
const UP_PI = { bag: 'bag', nap: 'home' };
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


function setStatus(html, isHtml) { const el = $('status'); if (isHtml) el.innerHTML = html; else el.textContent = html; el.hidden = !html; }

const PTS_POP_MIN = 5, PTS_POP_MS = 600;
function ptsPop(el) {
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
  clearTimeout(ptsPop.timer);
  ptsPop.timer = setTimeout(() => el.classList.remove('pop'), PTS_POP_MS);
}
function renderHeader() {
  const lv = levelOf(S.total);
  const lo = needFor(lv), hi = needFor(lv + 1);
  $('lvNum').textContent = lv;
  $('lvFill').style.width = Math.min(100, ((S.total - lo) / (hi - lo)) * 100) + '%';
  $('ptsNum').textContent = S.points.toLocaleString();
  const ptsEl = $('ptsNum').closest('.pts'); if (ptsEl) ptsEl.hidden = !(S.points > 0);



  const gained = renderHeader.gained; renderHeader.gained = 0;
  if (ptsEl && gained >= PTS_POP_MIN) ptsPop(ptsEl);
  document.querySelectorAll('.mode-sw [data-mode]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.mode === 'demo') === demo)));
}

let toastTimer;

const toastQ = [];

const toastShowing = msg => $('toast').classList.contains('show') && $('toast').textContent === msg;

const QUIET_NUM = /[+＋]\d|\d+\s?pt|\d+(\.\d+)?\s?km|\d+\s?m[！!・。]|×\d|\d+\/\d+/;
const quietNumMsg = msg => demo && !(store.get('nsg_mzgoals', 0) >= 3) && QUIET_NUM.test(String(msg));
function toast(msg) {
  if (quietNumMsg(msg)) return;
  const el = $('toast');
  if (toastBlocked()) { if (!toastQ.includes(msg)) toastQ.push(msg); return; }
  if (toastQ.length) toastFlush();
  if (toastShowing(msg)) { toast.at = Date.now(); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), toastMs()); return; }
  el.textContent = msg; el.classList.remove('wlow', 'wside', 'wfloor'); el.classList.add('show'); toast.at = Date.now(); toastDodge();
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), toastMs());
}

function toastMs() { return (toastAfter.q || []).length >= 2 ? 2400 : 3800; }
function howtoOpen() { return ['howto'].some(id => $(id) && !$(id).hidden); }

function couponOpen() { const c = $('coupon'); return !!c && !c.hidden; }


function modalOpen() { const sh = $('share'); return couponOpen() || (!!sh && !sh.hidden) || !!document.querySelector('.medashi:not([hidden]), .course-panel:not([hidden])'); }
if (window.MutationObserver && $('share')) new MutationObserver(() => { if ($('share').hidden) toastFlush(); else toastHold(); }).observe($('share'), { attributes: true, attributeFilter: ['hidden'] });
if (window.MutationObserver) new MutationObserver(ms => {
  const ev = ms.find(m => m.target.classList && m.target.classList.contains('medashi'));
  if (!ev) return;
  if (ev.target.hidden) toastFlush(); else toastHold();
}).observe(document.body, { attributes: true, attributeFilter: ['hidden'], subtree: true });

function pxBusy() { try { return !!(window.nishioGo && nishioGo.toastBlock && nishioGo.toastBlock()); } catch (e) { return false; } }
function toastBlocked() { return winBlocked(); }
function winBlocked() { return $('reward').classList.contains('show') || howtoOpen() || modalOpen() || pxBusy(); }

function toastFlush() { if (!toastBlocked()) toastQ.splice(0).forEach(toastAfter); }

function toastHold() {
  const t = $('toast');
  if (!t.classList.contains('show')) return;
  if (Date.now() - (toast.at || 0) < 1500 && !toastQ.includes(t.textContent)) toastQ.push(t.textContent);

  t.style.transition = 'none'; t.classList.remove('show'); void t.offsetWidth; t.style.transition = ''; clearTimeout(toastTimer);
}


function toastDodge() {
  const el = $('toast'), dq = document.querySelector('#pxInfo:not([hidden]) .dq');
  if (!dq || !el.classList.contains('show')) { el.classList.remove('low'); return; }

  const c = el.cloneNode(true);
  ['id', 'role', 'aria-live'].forEach(a => c.removeAttribute(a)); c.classList.remove('low'); c.style.cssText = 'transition:none;visibility:hidden';
  el.parentNode.appendChild(c);
  const t = c.getBoundingClientRect(), d = dq.getBoundingClientRect();
  c.remove();
  el.classList.toggle('low', t.top < d.bottom && t.bottom > d.top);
}

if (window.ResizeObserver && document.querySelector('#pxInfo .dq')) new ResizeObserver(toastDodge).observe(document.querySelector('#pxInfo .dq'));


function toastAfter(msg) {
  const afterQ = toastAfter.q || (toastAfter.q = []);
  if (afterQ.includes(msg) || toastShowing(msg)) return;
  afterQ.push(msg);
  if (afterQ.length > 1) return;
  setTimeout(function show() {
    if ($('toast').classList.contains('show')) return setTimeout(show, 600);
    const m = afterQ.shift();
    if (m) toast(m);
    if (afterQ.length) setTimeout(show, 600);
  }, 150);
}


const CHIP = [['🎮', 'jump'], ['🎒', 'bag'], ['🎌', 'calendar'], ['✨', 'star'], ['🎁', 'chest'], ['🖼', 'card'], ['📖', 'book'], ['📅', 'fire'], ['🆕', 'new'], ['🏠', 'home'], ['⏱️', 'clock'], ['🎉', 'star'], ['🍚', 'bowl'], ['📜', 'scroll'], ['🔗', 'compass']];
function rewardChips(lines, fact, total, hero) {
  const out = [];
  let book = false, shown = false;
  for (const l of lines) {
    if (/^🏁 めいろ ゴール/.test(l) || /^[★☆]+ /.test(l)) {
      const t = l.startsWith('🏁') ? (l.match(/ゴール！ (\S+?)(（|$)/) || [])[1] || '' : l.split(' ')[0], plus = (l.match(/[+＋]\d+/) || [''])[0];
      out.push(`<span title="${esc(l)}">${PIA(l.startsWith('🏁') ? 'flag' : 'star', l)}${esc(t)}${plus ? ' ' + plus : ''}</span>`);
      continue;
    }
    if (l.startsWith('この 道で')) {
      const n = re => (l.match(re) || [])[1];
      const t = [n(/つぶ (\d+)/) ? `🍚${n(/つぶ (\d+)/)}` : '', n(/びゅん (\d+)/) ? `💨${n(/びゅん (\d+)/)}` : '', n(/コンボ ×(\d+)/) ? `🎵×${n(/コンボ ×(\d+)/)}` : ''].filter(Boolean).join(' ');
      if (t) out.push(`<span title="${esc(l)}">${esc(t)}</span>`);
      continue;
    }
    if (l.startsWith('🏃 はやさ')) {
      const v = (l.match(/1秒に ([\d.]+)m/) || [])[1];
      out.push(`<span title="${esc(l)}">${PIA('feet', l)}${v ? `${v}m/秒` : ''}${/ベスト こえた|はじめての ベスト/.test(l) ? PIA('medal', 'ベスト') : ''}</span>`);
      continue;
    }
    if (/^🧭 (まよわず|通った 道)/.test(l)) {
      const x = (l.match(/([\d.]+)倍/) || [])[1], plus = (l.match(/[+＋]\d+/) || [''])[0];
      out.push(`<span title="${esc(l)}">${PIA('compass', l)}${x ? `${x}倍` : ''}${plus ? ' ' + plus : ''}</span>`);
      continue;
    }
    if (l.startsWith('🧭')) continue;
    if (l.startsWith('🍚 来店スタンプ')) { const n = (l.match(/(\d+)こめ/) || [])[1]; if (n) out.push(`<span title="${esc(l)}">${PIA('bowl', l)}${n}こめ</span>`); continue; }
    const c = CHIP.find(([e]) => l.startsWith(e)), ic = c ? c[1] : 'flag';
    if (ic === 'book') book = true;
    const plus = (l.match(/[+＋]\d+/) || [''])[0], days = (l.match(/（(\d+)日連続）/) || [])[1], time = (l.match(/るすばん\s*((?:\d+時間)?\d+分)/) || [])[1];
    const v = l.startsWith('🔗') ? `×${(l.match(/×([\d.]+)/) || [])[1] || ''} ${plus}` : ic === 'card' ? (/もう持っている/.test(l) ? '' : PIA('new', 'はじめての絵')) : ic === 'bag' && !plus ? ((l.match(/(\d+)km/) || [])[1] || '') + 'km' : ic === 'fire' ? `${days || ''}${plus ? ' ' + plus : ''}` : ic === 'clock' ? (time || '') : plus;

    if (hero && ic === 'card' && !shown) { shown = true; continue; }
    if (hero && ic !== 'card' && v === `+${total}`) continue;
    if (!v && (ic === 'flag' || ic === 'bowl')) continue;
    out.push(`<span title="${esc(l)}">${PIA(ic, l)}${v}</span>`);
  }
  return `<div class="chips">${out.join('')}</div>`;
}

const DOT_TWO_STARS = new Set(['kabuse', 'matcha', 'ishiusu', 'ike', 'unaju', 'kabayaki', 'ebisen', 'asari', 'tanbo', 'carnation']);
const dotStars = f => (DOT_TWO_STARS.has(f.motif) ? 2 : 3) + (['rainbow', 'snow', 'moon'].includes(f.wk) ? 1 : 0);
const starRow = n => `<div class="stars" aria-label="めずらしさ ${n}">${'<i></i>'.repeat(n)}</div>`;

const react = { pending: null, shown: 0, t: 0 };

const medashiOpen = () => !!document.querySelector('.medashi:not([hidden]), #howto:not([hidden])');


function showReward(total, name, lines, lvUp, fact, dot) {
  const D = window.NISHIO_DOTS, P = window.nishioPixel;
  let f = null;
  try { f = dot && D && D.info ? D.info(dot.id) : null; } catch (e) { f = null; }
  sound.jingle(lvUp ? 'levelup' : 'checkin');
  if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
  if (P && P.floatText) {
    P.floatText(`+${total}`);
    if (f && !(demo && !(store.get('nsg_mzgoals', 0) >= 3))) P.floatText(dot.kira ? '🖼 キラ' : dot.fresh ? '🖼 NEW' : '🖼 +1');
    if (lvUp) P.floatText(`⭐ Lv${lvUp}`);
  }
  const art = f ? `　🖼 ${dot.kira ? 'キラ ' : dot.fresh ? 'NEW ' : ''}${f.title}` : '';
  toast(`${name.replace(/！.*$/, '！')}　+${total}pt${art}${lvUp ? `　⭐ レベル${lvUp}！` : ''}`);
  lines.filter(l => l.startsWith('🧭')).forEach(toastAfter);
  afterReward();
}


function hideReward(quiet) {
  clearTimeout(showReward.t); const el = $('reward'); el.innerHTML = ''; el.classList.remove('show'); if (!quiet) { if (react.pending) reactShow(); else if (playQ.pending) playShow(); }
  toastQ.splice(0).forEach(toastAfter);
  setTimeout(tryChest, 300);
}
$('reward').addEventListener('click', e => {
  const t = e.target.closest('[data-rw-tip]');
  if (t) {
    const line = t.parentNode.querySelector('.rw-tipline'), open = line.hidden;
    line.hidden = !open; t.setAttribute('aria-expanded', open); t.closest('.rw').classList.toggle('tipopen', open);
    if (open) { clearTimeout(showReward.t); showReward.t = setTimeout(hideReward, 7000); }
    return;
  }
  const b = e.target.closest('[data-rw-share]');
  if (e.target.closest('[data-rw-close]')) { hideReward(); return; }
  if (!b) return;
  hideReward();
  if (window.nishioGo.openShare) { track('share_prompt', { kind: b.dataset.rwShare }); window.nishioGo.openShare(b.dataset.rwShare, { dot: b.dataset.dot ? +b.dataset.dot : null, mzgoal: b.dataset.rwShare === 'mzgoal' ? showReward.mz : null }); }
});



function gainDot(lat, lng, seed, area) {
  const D = window.NISHIO_DOTS;
  if (!D || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const id = D.pick(lat, lng, seed, new Date(), area);
  return id == null ? null : addDot(id);
}


const KIRA_RATE = 1 / 32;

const kiraHour = (d = new Date()) => { const j = new Date(d.getTime() + 9 * 3600e3); return j.getUTCDay() === 6 && j.getUTCHours() === 10; };
function addDot(id, forceKira) {
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

function streakDot() {
  const D = window.NISHIO_DOTS;
  if (!D) return null;
  const have = new Set((S.dots || []).map(id => D.motifOf(id))), all = D.MOTIFS.map((m, i) => i), pool = all.filter(i => !have.has(i));
  const list = pool.length ? pool : all, m = list[Math.floor(Math.random() * list.length)];
  return addDot(D.idOf(m, 4, Math.floor(Math.random() * 16), Math.floor(Math.random() * D.NCOMP)), true);
}

function weekStat() {
  const n = weekNo();
  if (!S.week || S.week.no !== n) { if (S.week) S.lastWeek = S.week; S.week = { no: n, m: 0, spots: 0, dots: 0 }; }
  return S.week;
}
const lastWeekStat = () => { weekStat(); return S.lastWeek && S.lastWeek.no === weekNo() - 1 ? S.lastWeek : null; };

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

const rewardBusy = () => $('reward').classList.contains('show') || !!showReward.waiting || !!(showReward.pending && showReward.pending.length);
const rewardSoon = () => rewardBusy() || !!openBagSoon.t;
function openBagSoon() {
  if (openBagSoon.t) return;
  const key = stateKey();
  const tick = () => {
    if (stateKey() !== key) { openBagSoon.t = 0; return; }
    if (rewardBusy() || medashiOpen()) { openBagSoon.t = setTimeout(tick, 800); return; }
    openBagSoon.t = 0;
    openBag();
  };
  openBagSoon.t = setTimeout(tick, 800);
}
function bagDot(b, i, taken) {
  const D = window.NISHIO_DOTS;
  if (!D) return null;
  const have = new Set(S.dots || []), motifs = new Set([...have].map(id => D.motifOf(id)));
  let best = null, score = -1;
  for (let j = 0; j < 24; j++) {
    const id = D.pick(b.lat, b.lng, `bag:${b.id}:${i}:${j}`, new Date());
    if (id == null) break;
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
  if (!b || b.walked < b.km * 1000) return;
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




const THEMES = [
  { key: 'shrine', icon: '⛩️', name: '神社', cats: ['shrine'] },
  { key: 'temple', icon: '🛕', name: 'お寺', cats: ['temple', 'worship'] },
  { key: 'park', icon: '🌳', name: '公園', cats: ['park'] },
  { key: 'historic', icon: '🏯', name: '史跡と城', cats: ['historic', 'castle'] },
  { key: 'sea', icon: '🌊', name: '海と展望', cats: ['beach', 'view'] },
  { key: 'art', icon: '🖼', name: 'アートと資料館', cats: ['art', 'museum', 'library'] },
];
const weekNo = (d = new Date()) => Math.floor((Math.floor((d.getTime() + 9 * 3600e3) / 86400000) + 3) / 7);
const weekTheme = (d = new Date()) => THEMES[weekNo(d) % THEMES.length];
const inThemeOf = (s, theme = weekTheme()) => !s.shop && theme.cats.includes(s.featured ? (s.kind || s.cat) : s.cat);
let dotSel = null;

const DOT_AREA = { nishio: '西尾', isshiki: '一色', kira: '吉良', hazu: '幡豆', sakushima: '佐久島' };
const DOT_LU = { a: '田んぼ', b: '畑', c: '森', d: '野原', e: 'まちなか', f: '道ばた', g: '線路ぞい', h: '公園や境内', i: '川や池', j: '海辺', k: '海辺', l: 'ゴルフ場' };
function dotHint(m) {
  const as = (m.areas || []).filter(a => DOT_AREA[a]), where = as.length >= 5 ? '西尾市のどこか' : as.map(a => DOT_AREA[a]).join('・');
  const lu = [...new Set([...(m.lu || '')].map(c => DOT_LU[c]).filter(Boolean))].slice(0, 2).join('・');
  return `${where}${lu ? 'の ' + lu : ''}で 見つかる`;
}
function renderDots(waited) {
  const D = window.NISHIO_DOTS, grid = $('dotGrid');
  if (!D || !grid) return;

  const have = (S.dots || []).filter(id => id >= 0 && id < D.COUNT), by = new Map(), wx = new Map();
  for (const id of have) { const f = D.info(id); by.set(f.m, (by.get(f.m) || 0) + 1); if (!wx.has(f.m)) wx.set(f.m, new Set()); wx.get(f.m).add(f.w); }
  const nWx = [...wx.values()].reduce((a, x) => a + x.size, 0), WX_ICON = ['☀️', '☁️', '☔', '🌫️', '🌈'];
  const kira = new Set(S.kira || []);
  $('dotCount').textContent = `題材 ${by.size}/${D.MOTIFS.length}・題材×天気 ${nWx}/${D.MOTIFS.length * 5}・絵 ${have.length.toLocaleString()}枚${kira.size ? `・キラ ${kira.size}枚` : ''}`;
  const last = new Map(); for (const id of have) last.set(D.info(id).m, id);
  const list = dotSel == null ? have.slice(-24).reverse() : have.filter(id => D.motifOf(id) === dotSel).sort((a, b) => a - b);
  const need = [...list, ...(simple() ? last.values() : [])];
  if (waited !== true && D.ready && !D.ready(need)) { D.load(need).then(() => renderDots(!D.ready(need))); return; }

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

const LOG_PI = { bag: 'bag', walk: 'feet', use: 'gift', chest: 'chest', idle: 'home', welcome: 'star', checkin: 'flag', quest: 'scroll', npc: 'talk', guide: 'compass', spot: 'flag', up: 'up', search: 'book', critter: 'feet', parcel: 'gift', trail: 'feet', trailmile: 'feet', alley: 'book', h100: 'feet' };
const STAT_PI = ['coin', 'star', 'book', 'face', 'flag', 'pin', 'feet', 'fire', 'chest', 'chest', 'chest', 'chest', 'chest', 'chest', 'chest', 'fire', 'face', 'star', 'medal', 'chest'];

function renderKoroRec() {
  const box = $('koroRec'), P = window.nishioPixel;
  if (!box) return;
  const d = P && P.maze && P.maze.dots ? P.maze.dots.n : 0;
  box.hidden = !d;
  box.innerHTML = d ? `<p><b>🍙 ころころの きろく</b><small>${esc(`🍚 きょう ひろった つぶ ${d}`)}</small></p>` : '';
}

function renderPhotoQuiz() {
  const box = $('pqBox');
  if (!box) return;
  box.hidden = true;
  const PQ = window.nishioPhotoQuiz;
  if (!PQ) return;
  const list = spots.filter(s => s.featured && s.name).map(s => ({ id: s.id, name: s.name, area: s.area || '' })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const day = ymd(), q = PQ.pick(list, day);
  if (!q) return;
  const byId = id => spots.find(x => x.id === id);
  const art = spotThumb(byId(q.id)).replace('class="gthumb"', 'class="pq-art"').replace(/width="28" height="28"/, 'width="144" height="144"');
  if (!art) return;
  const pqCount = v => { try { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; } catch (e) { return 0; } };
  const rec = store.get('nsg_pq', null) || {};
  const n = pqCount(rec.n);
  const done = rec.day === day && rec.done === true && rec.qid === q.id;
  const res = ok => `<p class="pq-res">${ok ? '⭕' : `❌<small>${esc(byId(q.id).name)}</small>`}</p>`;
  box.innerHTML = `<h3>📸 どこでしょう</h3>${art}`
    + q.choices.map(id => `<button type="button" class="btn pq-choice" data-id="${esc(id)}"${done ? ' disabled' : ''}>${esc(byId(id).name)}</button>`).join('')
    + (done ? res(rec.ok === true) : '') + (n ? `<p class="pq-n">🎯 ${n}</p>` : '');
  box.hidden = false;
  if (done) return;
  box.querySelectorAll('.pq-choice').forEach(b => b.addEventListener('click', () => {
    const cur = store.get('nsg_pq', null) || {};
    if (cur.day === day && cur.done === true && cur.qid === q.id) return renderPhotoQuiz();
    const ok = PQ.judge(q, b.dataset.id);
    store.set('nsg_pq', { day, done: true, ok, qid: q.id, n: pqCount(cur.n) + (ok ? 1 : 0) });
    renderPhotoQuiz();
  }));
}

function renderDayStamps() {
  const box = $('dsBox');
  if (!box) return;
  box.hidden = true;
  const DS = window.nishioDayStamp;
  if (!DS) return;
  const today = ymd(), set = new Set();
  const add = d => { if (typeof d === 'string' && DS.addDays(d, 0)) set.add(d); };
  const saved = store.get('nsg_days', null);
  if (Array.isArray(saved)) saved.forEach(add);
  (Array.isArray(S.log) ? S.log : []).forEach(e => {
    if (!e) return;
    if (e.date) add(e.date);
    else if (Number.isFinite(Number(e.t)) && Number(e.t) > 0) add(ymd(new Date(Number(e.t))));
  });
  if (S.day && S.day.date && ((S.day.walked || 0) > 0 || (S.day.checkins || 0) > 0 || (S.day.spots || []).length > 0 || (S.day.done || []).length > 0)) add(S.day.date);
  if (S.prevDay) add(S.prevDay.date);
  if (S.streak) add(S.streak.last);
  const days = [...set].sort().slice(-60);
  store.set('nsg_days', days);
  const cells = DS.grid(days, today, 14);
  if (!cells.length) return;
  const md = ds => ds.slice(5).replace('-', '/');
  box.innerHTML = `<h3>📅 ${md(cells[0].date)}〜${md(cells[cells.length - 1].date)}</h3><div class="ds-grid">${cells.map(c => `<span class="ds-cell${c.on ? ' on' : ''}${c.today ? ' today' : ''}" aria-label="${esc(c.date)}${c.on ? ' さんぽした日' : ''}${c.today ? ' 今日' : ''}">${c.day}</span>`).join('')}</div>`;
  box.hidden = false;
}

function galleryTiles(visits, spotIds) {
  if (!visits || typeof visits !== 'object') return [];
  const ok = spotIds instanceof Set ? spotIds : new Set(Array.isArray(spotIds) ? spotIds : []);
  const num = x => typeof x === 'number' && isFinite(x) ? x : null;
  return Object.entries(visits).filter(([id, v]) => ok.has(id) && v && typeof v === 'object')
    .map(([id, v], i) => ({ id, name: v.name || id, k: num(v.first) ?? num(v.last) ?? 0, i }))
    .sort((a, b) => a.k - b.k || a.i - b.i).map(({ id, name }) => ({ id, name }));
}
function renderVisitedGallery() {
  const box = $('visitedGallery');
  if (!box) return;
  const tiles = galleryTiles(S.visits, new Set(spots.map(x => x.id))).map(t => {
    const art = spotThumb(spots.find(x => x.id === t.id)).replace('class="gthumb"', 'class="vg-art"').replace(/width="28" height="28"/, 'width="96" height="96"') || '<span class="vg-art vg-pin" aria-hidden="true">📍</span>';
    return `<button type="button" class="vg-tile" data-spot="${esc(t.id)}">${art}<b>${esc(t.name)}</b></button>`;
  });
  box.innerHTML = tiles.join('');
  box.hidden = !tiles.length;
}
function renderLog() {
  renderCourse();
  renderPostcards();
  renderVisitedGallery();
  renderPhotoQuiz();
  renderDayStamps();
  const jOk = featuredToday();
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
    ['これまでの合計', S.total.toLocaleString(), 'pt'],
    ['お宝ゲット', S.treasureGot || 0, '回'], ['かくし宝箱はっけん', S.cacheGot || 0, '回'], ['どうぐクエスト', S.questGot || 0, '回'], ['きょうりゅうと であった', S.dinoGot || 0, '回'], ['夕立から にげきった', S.chaseGot || 0, '回'], ['さんぽエネルギー満タン', S.energyGot || 0, '回'],
    ['たいまつを とった', S.torchGot || 0, '回'], ['おとも旅団 完成', S.brigadeGot || 0, '回'], ['ぜんぶ浄化', S.purifyGot || 0, '回'], ['救助完了', S.rescueGot || 0, '回'], ['回転キューブ 完成', S.cubeGot || 0, '回'],
  ].map(([k, v, u], i) => simple()
    ? `<div class="stat pic" title="${esc(k)}"><img class="pi art" src="nishio-go/art/stat-${STAT_PI[i]}.png" alt="${esc(k)}" width="32" height="32"/><b>${esc(v)}<small>${esc(i === 1 ? '' : u)}</small></b></div>`
    : `<div class="stat"><small>${k}</small><b>${esc(v)}<small>${esc(u)}</small></b></div>`).join('');


  const heard = Object.entries(S.heard || {}), heardLeft = heard.filter(([id]) => !S.visits[id]).sort((a, b) => b[1].t - a[1].t);
  $('heardCount').textContent = heard.length ? `${heard.length - heardLeft.length}/${heard.length}` : '';
  $('heardList').innerHTML = heardLeft.length ? heardLeft.map(([id, h]) => {
    const sp = spots.find(x => x.id === id), far = sp && me ? fmtM(dist(me, sp)) : '';
    return simple()
      ? `<li data-spot="${esc(id)}"><span class="ico heard">${spotThumb(sp) || PIA('pin', '')}</span><span class="main"><b>${esc(sp ? sp.name : id)}</b></span><span class="num">${h.found ? '' : '🔍'}${PIA('talk', esc(h.by))}${far}</span></li>`
      : `<li data-spot="${esc(id)}"><span class="ico heard">${spotThumb(sp) || '❔'}</span><span class="main"><b>${esc(sp ? sp.name : id)}</b><small>${esc(h.by)}から聞いた${h.found ? '' : '（着いたら🔍しらべる）'}${far ? `・ここから ${far}` : ''}</small></span></li>`;
  }).join('') : `<li class="empty">${heard.length ? '聞いた名所は、ぜんぶ行きました！ また西尾の人に話しかけてみよう' : '西尾の人に話しかけると、すすめてくれた名所がここに載ります'}</li>`;


  const book = S.critters || {}, cimg = id => { try { const c = window.nishioPixel && nishioPixel.critterSprite(id); return c ? `<img class="gthumb" src="${c.toDataURL()}" alt="" width="28" height="28"/>` : ''; } catch (e) { return ''; } };
  { const got = CRITTERS.filter(c => book[c.id]).length; $('critterCount').textContent = `${got}/${CRITTERS.length}${CRITTERS.length ? `　${leftLabel(got, CRITTERS.length)}` : ''}`; }
  $('critterList').innerHTML = CRITTERS.map(c => book[c.id]
    ? `<li><span class="ico">${cimg(c.id) || '🐾'}</span><span class="main"><b>${esc(c.name)}</b>${simple() && !c.note ? '' : `<small>${esc(c.note || c.say)}${c.src ? ` <a href="${esc(c.src)}" target="_blank" rel="noopener">出典</a>` : ''}</small>`}</span><span class="num">×${book[c.id].n}</span></li>`
    : `<li><span class="ico heard">${cimg(c.id) || '❔'}</span><span class="main"><b>？？？</b><small>${WHERE_NAME[c.where]}${c.months ? `・${c.months[0]}〜${c.months[c.months.length - 1]}月` : ''}</small></span></li>`).join('');

  $('areaList').innerHTML = areas.length ? areas.map(a => {
    const art = simple() && areaArt(a.id);
    const p = areaProgress(a.id), pct = p.total ? Math.round(p.done / p.total * 100) : 0;
    return `<li class="area-row" data-tint="${areaTint(a.id, p)}"${areaRgb(a.id) ? ` style="--zc:${areaRgb(a.id).join(',')}"` : ''}><span class="ico">${art ? `<img class="gthumb area-art${p.total && p.done === p.total ? ' done' : ''}" src="${art}" alt="" width="32" height="32"/>` : simple() ? PI(p.total && p.done === p.total ? 'medal' : 'flag', '') : esc(a.icon || '🗾')}</span><span class="main"><b>${esc(a.name)}</b>${shogoHtml(a.id, p)}
      ${simple() ? '' : `<small>${esc(a.catch || '')}</small>`}<span class="bar"><i style="width:${pct}%"></i></span>${areaDexHtml(p)}</span><span class="num">${p.done}/${p.total}${p.total ? `<small>　${leftLabel(p.done, p.total)}</small>` : ''}</span></li>`;
  }).join('') : '<li class="empty">地区の情報を読み込めませんでした</li>';

  const ring = exploreRing([...TINT_AREAS].map(id => ({ id, ...areaProgress(id) })));
  const ringEl = $('exploreRing');
  ringEl.hidden = !ring.total;
  ringEl.style.background = ring.gradient ? `conic-gradient(${ring.gradient})` : '';
  $('explorePct').textContent = ring.pct + '%';
  ringEl.setAttribute('aria-label', `全地区のめぐり具合 ${ring.done}/${ring.total}（${ring.pct}%）`);

  $('logList').innerHTML = S.log.length ? S.log.slice(0, 50).map(l =>
    `<li><span class="ico">${simple() && (l.type === 'chest' || l.type === 'welcome') ? '<img class="gthumb" src="nishio-go/art/chest.png" alt="" width="28" height="28"/>' : simple() ? (l.type === 'jump' ? PIA('jump', '') : PI(LOG_PI[l.type] || 'flag', '')) : l.type === 'walk' ? '👣' : l.type === 'use' ? '🎁' : esc(l.icon || '📍')}</span><span class="main"><b>${esc(l.name)}</b>
      ${simple() ? '' : `<small>${l.type === 'walk' ? l.date.replace(/^\d+-0?(\d+)-0?(\d+)$/, '$1/$2') : fmtTime(l.t)}</small>`}</span><span class="num${l.pts < 0 ? ' minus' : ''}">${l.pts > 0 ? '+' : ''}${l.pts}</span></li>`).join('')
    : '<li class="empty">まだありません</li>';
}


const AREA_ART = new Set(['nishio', 'isshiki', 'kira', 'hazu', 'sakushima', 'okazaki', 'anjo', 'hekinan', 'takahama', 'kota', 'gamagori']);
function areaArt(id) { return AREA_ART.has(id) ? `nishio-go/art/area-${id}.png` : ''; }


const BADGE_PI = { critterall: 'book', first: 'feet', spot10: 'map', spot30: 'compass', spot100: 'medal', shrine: 'torii', temple: 'temple', park: 'tree', castle: 'castle', featall: 'star',
  walk5: 'walker', walk42: 'walker', streak7: 'fire', meibutsu: 'tea', meibutsu2: 'tea', memo10: 'book', memo50: 'book', npc5: 'talk', npcall: 'face', npcnear: 'face', voice1: 'talk', voice3: 'home', react10: 'talk', alley10: 'book', h100: 'feet' };
$('badgeGrid').addEventListener('click', e => { const b = e.target.closest('[data-badge="clear"]'); if (b && S.cleared) endingWhenFree(); });
function renderBadges() {
  const got = new Set(S.badges), defs = badgeDefs();

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
    : `${n}か所（注目スポットだけ。地図データを 読みこめませんでした）`;
  $('rules').innerHTML = [
    `スポットまで約${CFG.reach}m以内に近づくと「チェックイン」できます（お店など一部のスポットは範囲が広め。地図の点線の円が範囲です）`,
    `ふつうのスポット ${CFG.pts.normal}pt／⭐注目スポット ${featRange()}`,
    `はじめての訪問 +${CFG.pts.first}pt（注目スポットは +${CFG.pts.firstFeatured}pt）`,
    `その日はじめてのチェックイン +${CFG.pts.daily}pt（毎日同じ）`,
    `同じスポットは${CFG.cooldownMin}分ごとにチェックインできます`,
    `${CFG.walkUnitM}m 歩くごとに ${CFG.walkUnitPts}pt（1日 ${CFG.walkDailyCap}ptまで）。数えるのは、このページを開いて画面がついている間に歩いた距離だけです（画面を消す・ほかのアプリを開くと止まります）`,
    '乗り物（時速約30km以上）で移動中も、チェックイン・たからばこ・行き先に着くことはできます（運転中の操作はやめましょう）。歩いた距離のポイントは、歩いた分だけ数えます',
  ].map(t => `<li>${esc(t)}</li>`).join('');
}


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
            validMin: Number(r.validMin) > 0 ? Math.round(Number(r.validMin)) : 0,
            art: /^[a-z0-9-]+$/.test(r.art || '') ? r.art : '' })),
      };
    }
  } catch (e) {  }
  updateRewardsTab();
}

const visibleRewards = () => rewardCfg.rewards.filter(r => r.active || demo);
function updateRewardsTab() {
  const has = visibleRewards().length > 0;
  $('rewardsTab').hidden = !has;
  if (!has && !$('panel-rewards').hidden) openTab('map');
}
const rewardMin = r => r.validMin || rewardCfg.validMin;
const rewardMinText = () => { const m = [...new Set(visibleRewards().map(rewardMin))]; return m.length > 1 ? `${Math.min(...m)}〜${Math.max(...m)}` : String(m[0] || rewardCfg.validMin); };
const couponState = c => c.used ? 'used' : Date.now() > c.t + c.validMin * 60000 ? 'expired' : 'valid';
const openCoupon = () => S.coupons.find(c => couponState(c) === 'valid' && !!c.demo === !!demo);
const usedToday = rid => S.coupons.filter(c => c.rid === rid && ymd(new Date(c.t)) === ymd()).length;

let rewardExpT = 0;
function renderRewards() {
  $('walletPts').textContent = S.points.toLocaleString();
  clearTimeout(rewardExpT);
  const oc = openCoupon();
  if (oc) rewardExpT = setTimeout(() => { if (!$('panel-rewards').hidden) renderRewards(); }, Math.max(0, oc.t + oc.validMin * 60000 - Date.now()) + 500);
  const pic = simple();
  $('rewardNote').textContent = demo
    ? (pic ? '操作して移動：サンプル（お店では使えません）' : '操作して移動：サンプルの特典で交換の流れを試せます（このクーポンはお店では使えません。お店のとくてんは「あるいて移動」で）。')
    : pic ? `有効${rewardMinText()}分。お店で見せる直前に交換` : `交換すると、その場でクーポン画面が出ます（有効${rewardMinText()}分）。お店で店員さんに見せる直前に交換してください。`;
  $('rewardList').innerHTML = visibleRewards().map(r => {
    const limit = r.perDay && usedToday(r.id) >= r.perDay;
    const short = S.points < r.cost, busy = !!openCoupon();
    const why = busy ? '使っていないクーポンがあります' : limit ? '今日はもう交換しました' : short ? `あと${(r.cost - S.points).toLocaleString()}pt` : '';
    if (pic) return `<li class="reward-pic"><span class="ico">${r.art ? `<img class="art" src="nishio-go/art/${r.art}.png" alt="" width="48" height="48"/>` : PIA('gift', '')}</span><span class="main"><b>${esc(r.name)}${r.active ? '' : ' <em class="sample">サンプル</em>'}</b>
      <span class="chips"><span>${PIA('coin', 'ポイント')}${r.cost.toLocaleString()}</span>${r.perDay ? `<span>${PIA('calendar', '1日に交換できる回数')}×${r.perDay}</span>` : ''}<span>${PIA('clock', 'クーポンの有効時間')}${rewardMin(r)}分</span></span>
      ${r.desc ? `<p class="cond">${PIA('scroll', '')} ${esc(r.desc)}</p>` : ''}</span>
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
    validMin: rewardMin(r), cond: r.desc, code: String(rnd[0] % 10000).padStart(4, '0'), used: 0, demo, sample: !r.active };
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
  toastHold();
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
  $('cpCond').textContent = c.cond || '';
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
  toastFlush();
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


function openTab(tab) {
  hideReward(tab !== 'map');
  if (tab !== 'map') reactHide();
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  ['log', 'voice', 'rewards', 'settings'].forEach(t => { $('panel-' + t).hidden = t !== tab; });
  if (tab === 'voice') { renderVoice(); voiceMarkSeen(); loadVoices(); }
  if (tab === 'rewards') renderRewards();
  if (tab === 'log') { renderLog(); renderBadges(); }
  if (tab === 'settings') { renderSpotInfo(); renderGpsInfo(); }
  if (tab === 'map') setTimeout(() => map.invalidateSize(), 0);
}
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => openTab(b.dataset.tab)));
$('lvBtn').addEventListener('click', () => { openTab('log'); $('badgeHead').scrollIntoView(); });

['heardList', 'visitedGallery'].forEach(id => $(id) && $(id).addEventListener('click', e => {
  const li = e.target.closest('[data-spot]');
  const s = li && spots.find(x => x.id === li.dataset.spot);
  if (!s) return;
  follow = false;
  openTab('map');
  if (document.body.classList.contains('px')) { $('pxInfoBody').innerHTML = popupHtml(s); $('pxInfo').hidden = false; return; }
  map.setView([s.lat, s.lng], 17);
  setTimeout(() => markers.get(s.id)?.openPopup(), 300);
}));

$('spinBtn').addEventListener('click', checkin);
$('locateBtn').addEventListener('click', () => {
  follow = true;
  if (document.body.classList.contains('px') && window.nishioPixel) nishioPixel.centerOnMe();
  if (me) map.setView([me.lat, me.lng], Math.max(map.getZoom(), 16));
  else toast(demo ? '地図をタップして移動してください' : '位置情報を取得中です…');
});


function setMode(isDemo) {

  const inside = p => p && inPlay(p.lat, p.lng);
  const here = !demo && inside(me) ? me : null;
  if (demo && !isDemo) idleMark();
  sessionEnd();
  demo = isDemo;
  calledBy = null;
  if (store.get('nsg_started', false)) sessionStart();
  store.set('nsg_mode', demo ? 'demo' : 'real');
  S = loadState();
  me = null; lastWalk = null; driving = false;
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
  if ($('panel-log') && !$('panel-log').hidden) openTab('map');
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
    toast(ok ? `スポットを更新しました（${spots.length}か所）` : '名所を うまく 読みこめませんでした。通信のよい所で、少し まってから もう一度 ためしてね。');
  }
  finally { btn.disabled = false; }
});
$('resetBtn').addEventListener('click', () => {
  if (!confirm(`「${demo ? '操作して移動' : 'あるいて移動'}」のポイントと記録をすべて削除します。よろしいですか？`)) return;
  S = freshState(); save(); renderHeader(); renderLog(); renderMarkers(); refreshNearby(); closeCoupon();
  if (window.nishioPixel && nishioPixel.trailClear) nishioPixel.trailClear();
  toast('記録を削除しました');
});






const FB_MAX = 3;
const fb = { shown: 0, theme: '' };
const fbCount = () => { const c = store.get('nsg_fb', null); return c && c.d === ymd() ? c.n : 0; };
const newRid = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('');
const fbText = { spot: 'どんな所？（見どころ・場所の目じるしなど）', fix: 'なにがちがう？（正しくはどうか、分かれば）', fun: 'どうすると、もっと楽しくなる？（あったらうれしい遊び・ごほうび・しかけ など）', idea: 'どんなことで こまった？ どうしてほしい？' };
function fbFill() {
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
const voiceSeen = () => store.get('nsg_voice_seen', {});
function loadVoices(force) {
  if (!force && Date.now() - voice.at < 60000) return Promise.resolve(voice.data);
  voice.at = Date.now();
  return fetch('nishio-go/voices.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null).then(j => {
    if (j && typeof j === 'object') { voice.data = j; voiceNews(); renderVoice(); }
    return voice.data;
  });
}

function voiceNews() {
  const seen = voiceSeen(), news = [];
  for (const m of fbMine()) {
    const r = replyOf(m.rid);
    if (!r || seen[m.rid] === r.s) continue;
    news.push({ m, r });
  }
  $('voiceDot').hidden = !news.length;

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


const REACTS = [['love', '😍', 'よかった'], ['photo', '📷', '映える'], ['calm', '🍵', 'ほっこり'], ['hard', '🤔', 'わかりにくい'], ['access', '🚧', '行きにくい']];


function reactLine(s, c = voice.data && voice.data.reactions && voice.data.reactions[s.id]) {
  if (!c) return '';
  const top = REACTS.map(([k, e, n]) => [e, n, c[k] | 0]).filter(x => x[2] > 0).sort((a, b) => b[2] - a[2]).slice(0, 3);
  return top.length ? `<p class="react-line">みんなの声：${top.map(([e, n]) => `<span>${e} ${esc(n)}</span>`).join(' ')}</p>` : '';
}

function reactAsk(s) {
  const seen = store.get('nsg_react', {}), day = store.get('nsg_react_day', null) || {};
  if (seen[s.id] && Date.now() - seen[s.id] < 30 * 86400e3) return;
  if (day.d === ymd() && day.n >= 3) return;
  react.pending = s;
}



const playQ = { pending: null, r: 0, shown: 0, sent: false, t: 0 };
const PLAY_MIN_MS = 900;


const PLAY_ASK_MIN_S = 60;

const playAskOk = mz => !(demo && !(store.get('nsg_mzgoals', 0) > 3) && mz && mz.sec < PLAY_ASK_MIN_S);
function playAsk(mz) {
  if (store.get('nsg_play_ask', '') === ymd()) return;
  playQ.pending = { sec: Math.round(mz.sec), st: 0, mz };
  react.pending = null;
}


new MutationObserver(() => { if (playQ.pending && $('pxInfo').hidden && !$('reward').classList.contains('show')) playShow(); }).observe($('pxInfo'), { attributes: true, attributeFilter: ['hidden'] });
function playShow() {

  if (!playQ.pending || !$('pxInfo').hidden || $('reward').classList.contains('show')) return;
  const ctx = playQ.pending; playQ.pending = null;
  store.set('nsg_play_ask', ymd());
  Object.assign(playQ, { ctx, r: 0, shown: Date.now(), sent: false });
  $('reactBar').classList.add('play');
  $('reactBar').innerHTML = `<p>🎮 めいろ、どうだった？ <small>ゲームを よくするのに 使います（+5pt）</small></p>
    <div class="play-stars" role="group" aria-label="★の 数">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-play="${n}" aria-label="★${n}">★</button>`).join('')}</div>
    <div class="play-more" hidden><input type="text" id="playText" maxlength="140" placeholder="ひとこと（なくてOK）" aria-label="ひとこと"/><button type="button" class="btn mini" data-play-send>送る</button><button type="button" class="btn mini play-share" data-play-share hidden>📣 友だちに</button></div>
    <button type="button" class="react-x" data-play-x aria-label="とじる">×</button>`;
  $('reactBar').hidden = false;
  track('play_ask', {});
  clearTimeout(react.t); react.t = setTimeout(() => playClose(), 20000);
}
async function playSend(text) {
  if (playQ.sent || !playQ.r) return;
  playQ.sent = true;
  const r = playQ.r, ctx = playQ.ctx || {};
  track('play_rating', { r, text: text ? 1 : 0 });
  const wait = PLAY_MIN_MS - (Date.now() - playQ.shown);
  if (wait > 0) await new Promise(f => setTimeout(f, wait));
  let res = null;
  try { res = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'play', r, text: text || '', sec: ctx.sec, st: ctx.st, t: Date.now() - playQ.shown, hp: '' }) }); } catch (e) { res = null; }
  if (res && res.ok) {
    fbStatsAdd(x => { x.react++; });
    const lv = gainPoints(5); save();
    toast(`🎮 ありがとう！ +5pt${lv ? ` レベル${lv}！` : ''}`);
  } else toast(res && (res.status === 503 || res.status === 404) ? '声は まだ受けつけていません。ごめんなさい。' : '声を送れませんでした。また こんど おねがいします。');
}
const playClose = () => reactHide();


function reactHide() {
  clearTimeout(react.t);
  if ($('reactBar').classList.contains('play')) { if (playQ.r && !playQ.sent) playSend(''); $('reactBar').classList.remove('play'); }
  $('reactBar').hidden = true; $('reactBar').innerHTML = '';
}
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
  if (e.target.closest('[data-play-x]')) return playClose();
  const ps = e.target.closest('[data-play]');
  if (ps) {
    playQ.r = +ps.dataset.play;
    $('reactBar').querySelectorAll('[data-play]').forEach(b => b.classList.toggle('on', +b.dataset.play <= playQ.r));
    const more = $('reactBar').querySelector('.play-more'); if (more) more.hidden = false;

    const sh = $('reactBar').querySelector('[data-play-share]'); if (sh) sh.hidden = !(playQ.r >= 4 && playQ.ctx && playQ.ctx.mz && window.nishioGo.openShare);
    clearTimeout(react.t); react.t = setTimeout(() => playClose(), 30000);
    return;
  }
  if (e.target.closest('[data-play-share]')) {
    const v = ($('playText') || {}).value || '', mz = playQ.ctx && playQ.ctx.mz;
    playSend(v.trim().slice(0, 140)); playClose();
    if (mz && window.nishioGo.openShare) { track('share_prompt', { kind: 'mzgoal', from: 'play' }); window.nishioGo.openShare('mzgoal', { mzgoal: mz }); }
    return;
  }
  if (e.target.closest('[data-play-send]')) { const v = ($('playText') || {}).value || ''; await playSend(v.trim().slice(0, 140)); return playClose(); }
  if (e.target.closest('[data-react-x]')) return reactHide();
  const b = e.target.closest('[data-react]');
  if (!b) return;
  const s = spots.find(x => x.id === b.dataset.spot);
  if (!s) return reactHide();
  $('reactBar').querySelectorAll('button').forEach(x => { x.disabled = true; });
  let r = null;
  try { r = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'react', spot: { id: s.id, name: s.name }, r: b.dataset.react, t: Date.now() - react.shown, hp: '' }) }); } catch (_) {  }
  reactHide();
  if (r && r.ok) {
    const seen = store.get('nsg_react', {}); seen[s.id] = Date.now();
    for (const [k, t] of Object.entries(seen)) if (Date.now() - t > 30 * 86400e3) delete seen[k];
    store.set('nsg_react', seen);
    fbStatsAdd(x => { x.react++; });
    const lv = gainPoints(5); save();
    toast(`💬 ありがとう！ +5pt${lv ? ` レベル${lv}！` : ''}`);
    track('feedback_react', { r: b.dataset.react });
    checkBadges();
  } else toast(r && (r.status === 503 || r.status === 404) ? 'ひとこと は まだ受けつけていません。ごめんなさい。' : 'ひとこと を送れませんでした。また こんど おねがいします。');
});


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








const sound = (() => {
  const SRC = { checkin: 'nishio-go/bgm/checkin.mp3', levelup: 'nishio-go/bgm/levelup.mp3', eye: 'nishio-go/bgm/eye.mp3', world: 'nishio-go/bgm/world.mp3' };
  const TITLE = { field: 'にしおさんぽ', field2: 'まちかど', field3: 'おまつり', morning: 'あさ', evening: 'ゆうがた', night: 'よる', rain: 'あめ', world: 'せかいちず' };
  const POOL = { day: ['field', 'field2', 'field3'], morning: ['morning'], evening: ['evening'], night: ['night'], rain: ['rain'] };
  const FIELD = new Set(Object.values(POOL).flat()), at = {};
  for (const k of FIELD) SRC[k] = `nishio-go/bgm/${k}.mp3`;
  const VOL = 0.28, SFX_VOL = 0.35, els = {}, missing = new Set();
  const isBgm = k => k === 'world' || FIELD.has(k);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  for (const m in POOL) { shuffle(POOL[m]); at[m] = 0; }
  let on = store.get('nsg_bgm', true), unlocked = false, scene = 'field', cur = null, ducking = 0;
  const el = k => {
    if (!els[k]) {
      const a = new Audio(); a.preload = 'none'; a.loop = k === 'world'; a.volume = isBgm(k) ? VOL : SFX_VOL; a.src = SRC[k];
      if (FIELD.has(k)) a.addEventListener('ended', () => { a.currentTime = 0; next(k); });
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

  const fieldSong = () => inPool(moodNow()) || inPool('day');
  const pick = () => (scene === 'world' && !missing.has('world') ? 'world' : fieldSong());
  function next(k) {
    for (const m in POOL) { const i = POOL[m].indexOf(k); if (i >= 0) at[m] = (i + 1) % POOL[m].length; }
    apply();
  }

  fetch('nishio-go/bgm/list.json').then(r => (r.ok ? r.json() : [])).then(list => {

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
      if (isBgm(n) ? n !== k : !live) {
        a.pause();
        if (live && n !== k && n[0] === 's') delete els[n];
      }
    }
    if (!live) ducking = 0;
    cur = k;
    if (k) { const a = el(k); a.volume = ducking ? VOL * 0.25 : VOL; if (a.paused) a.play().catch(() => {}); }
    $('bgmToggle').checked = on;
    $('bgmNow').textContent = k ? `♪ いまの曲：${TITLE[k] || k}` : '';
    $('bgmNext').hidden = !k || scene === 'world';
  }


  const mapUp = () => !!(window.nishioPixel && window.nishioPixel.roll && window.nishioPixel.roll.up);
  const unlock = () => {
    if (unlocked || !mapUp()) return;
    unlocked = true;
    ['pointerdown', 'keydown'].forEach(ev => document.removeEventListener(ev, unlock, true));
    apply();
  };
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, true));
  document.addEventListener('visibilitychange', apply);
  setInterval(() => { if (cur && cur !== pick()) apply(); }, 60000);
  return {
    apply,
    scene(s) { if (s !== scene) { scene = s; apply(); } },
    toggle(v) { on = v === undefined ? !on : !!v; store.set('nsg_bgm', on); unlocked = true; apply(); },
    next() { if (cur && FIELD.has(cur)) { el(cur).currentTime = 0; next(cur); } },
    jingle(k) {
      if (!on || !unlocked || document.hidden || missing.has(k)) return;
      const a = el(k);
      if (!a.paused) { a.currentTime = 0; return; }
      const done = () => { a.onended = a.onerror = a.onpause = null; ducking = Math.max(0, ducking - 1); apply(); };
      ducking++; apply();
      a.onended = a.onerror = a.onpause = done;
      a.currentTime = 0; a.play().catch(done);
    },
  };
})();
$('bgmToggle').addEventListener('change', e => sound.toggle(e.target.checked));
$('bgmNext').addEventListener('click', () => sound.next());

$('anaToggle').checked = !store.get('nsg_noanalytics', false);


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
  if (!o) { toast('🔑 あいことばが ちがうみたい（さいごまで コピーできたかな）'); return; }
  if (!confirm(`この端末の いまの記録（${S.points}pt）は、あいことばの記録（${o.s.points}pt・めぐった所 ${Object.keys(o.s.visits || {}).length}か所）に おきかわります。よろしいですか？`)) return;
  store.set(stateKey(), o.s);
  if (o.started && !store.get('nsg_started', null)) store.set('nsg_started', o.started);
  track('code_load', { mode: demo ? 'play' : 'walk' });
  location.reload();
});
$('anaToggle').addEventListener('change', e => { try { localStorage.setItem('nsg_noanalytics', e.target.checked ? '0' : '1'); } catch (err) {  } toast(e.target.checked ? '📊 アクセス解析をオンにしました（次に開いたときから）' : '📊 アクセス解析をオフにしました（次に開いたときから送りません）'); });
sound.apply();

$('jumpBtn').addEventListener('click', openJump);



const CO = window.NISHIO_COURSE;
const coSpot = id => spots.find(x => x.id === 'f-' + id);
const coName = id => { const s = coSpot(id); return s ? s.name.replace(/（.*?）/g, '') : '？'; };
function courseCheckin(s, lines) {
  if (!CO || !String(s.id).startsWith('f-')) return null;
  const r = CO.advance(S.course, s.id.slice(2));
  S.course = r.st;
  if (!r.stamped) return null;
  const len = r.course.spots.length;
  lines.push(r.completed ? `🗾 ${r.course.name} ぜんぶ まわった！ スタンプ ${len}/${len}` : `🗾 ${r.course.name} スタンプ ${r.st.n}/${len}`);
  track('course_stamp', { course: r.course.id, n: r.completed ? len : r.st.n, done: r.completed, mode: demo ? 'play' : 'walk' });
  return r.completed ? r.course : null;
}
function renderCourse() {
  if (!CO) return;
  const st = CO.clean(S.course), c = CO.byId(st.cur), chip = $('courseNext');
  if (chip) {
    const nx = c && coSpot(c.spots[st.n]);
    chip.hidden = !nx;
    if (nx) chip.textContent = `🗾 つぎは ${coName(c.spots[st.n])}　${st.n + 1}/${c.spots.length}`;
  }
  const note = $('courseNote');
  if (note) note.textContent = c ? `${c.name} ${st.n}/${c.spots.length}　つぎ：${coName(c.spots[st.n])}` : st.done.length >= CO.COURSES.length ? '西尾の 1枚絵 できあがり！' : `まわりきった ${st.done.length}/${CO.COURSES.length}　順番に まわって スタンプ`;
}
function coPanelHtml(hi) {
  const st = CO.clean(S.course), pos = {};
  for (const c of CO.COURSES) for (const id of c.spots) { const s = coSpot(id); if (s) pos[id] = s; }
  const items = CO.COURSES.map(c => {
    const on = st.cur === c.id, done = st.done.includes(c.id), n = on ? st.n : done ? c.spots.length : 0;
    const route = c.spots.map((id, i) => `<li class="${i < n ? 'got' : on && i === n ? 'next' : ''}">${i < n ? '✓' : i + 1} ${esc(coName(id))}</li>`).join('');
    const btn = on ? '<button type="button" class="btn mini" data-co="quit">やめる</button>'
      : `<button type="button" class="btn mini" data-co="pick" data-id="${c.id}">${st.cur && st.n > 0 ? 'このコースに かえる（スタンプは 0から）' : done ? 'もういちど' : 'このコースにする'}</button>`;
    return `<section class="co-item${on ? ' on' : ''}"><h4>${c.icon} ${esc(c.name)} ${'●'.repeat(n)}${'○'.repeat(c.spots.length - n)}</h4><p class="co-m">${esc(CO.measureText(CO.measure(c, pos)))}</p><ol class="co-route">${route}</ol>${btn}</section>`;
  }).join('');
  const all = st.done.length >= CO.COURSES.length;
  return `<div class="co-box"><h3>🗾 モデルコース</h3>${hi ? `<p class="co-hi">${esc(hi)}</p>` : ''}${items}<h4>${all ? '西尾の 1枚絵　できあがり！ かおりちゃんも いっしょ！' : '西尾の 1枚絵'}</h4><pre class="co-mosaic${all ? ' done' : ''}" aria-label="スタンプで できる 西尾の 1枚絵">${CO.mosaicScene(st.done).join('\n')}</pre><p class="co-m">かおりちゃんが 手前の 道を てくてく。足跡は まわりきった コースの 分じゃん</p><button type="button" class="btn" data-co="close">とじる</button></div>`;
}
function openCourse(hi) {
  if (!CO) return;
  let el = $('coursePanel');
  if (!el) {
    el = document.createElement('div'); el.id = 'coursePanel'; el.className = 'course-panel';
    el.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-co]');
      if (e.target === el || (b && b.dataset.co === 'close')) { el.hidden = true; return; }
      if (!b) return;
      if (b.dataset.co === 'pick') { S.course = CO.start(S.course, b.dataset.id); track('course_pick', { course: b.dataset.id, mode: demo ? 'play' : 'walk' }); }
      else if (b.dataset.co === 'quit') S.course = CO.quit(S.course);
      save(); renderCourse(); el.innerHTML = coPanelHtml();
    });
    document.body.appendChild(el);
  }
  el.innerHTML = coPanelHtml(hi); el.hidden = false;
}
function courseCelebrate() {
  toastAfter('🗾 コースをまわりきった！ 1枚絵は コースボタンから 見られるよ');
}


const PC = window.NISHIO_POSTCARD;
function postcardCheckin(s, lines) {
  if (!PC || !s.featured || s.shop) return;
  const r = PC.issue(S.postcards, s.id, ymd(), PC.say(s.name, s.desc));
  S.postcards = r.st;
  if (!r.fresh) return;
  lines.push(`💌 記念ポストカード（きろく から）`);
  track('postcard_issue', { spot: s.name, mode: demo ? 'play' : 'walk' });
}
let pcRiceUrl = null;
function pcRice() {
  if (pcRiceUrl !== null) return pcRiceUrl;
  pcRiceUrl = '';
  try {
    const P = window.nishioPixel;
    if (P && P.drawRice) { const c = document.createElement('canvas'); c.width = 48; c.height = 40; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; if (P.drawRice(x, 24, 22, 0, 0, 'smile')) pcRiceUrl = c.toDataURL(); }
  } catch (e) { pcRiceUrl = ''; }
  return pcRiceUrl;
}
function pcEntries() {
  const cards = PC ? PC.clean(S.postcards) : {};
  return Object.entries(cards).map(([id, c]) => {
    const sp = spots.find(x => x.id === id), v = S.visits[id];
    const a = sp && sp.area && areas.find(x => x.id === sp.area);
    return { id, c, name: ((sp && sp.name) || (v && v.name) || '').replace(/（.*?）/g, ''), icon: (sp && iconOf(sp)) || (v && v.icon) || '📮', area: a ? a.name : '' };
  }).filter(e => e.name).sort((a, b) => b.c.day.localeCompare(a.c.day));
}
function renderPostcards() {
  const ul = $('postcardList');
  if (!ul) return;
  const es = pcEntries();
  const total = Array.isArray(spots) ? spots.filter(s => s.featured && !s.shop).length : 0;
  const pg = PC && PC.progress ? PC.progress(es.length, total) : { have: Math.min(es.length, total), total, pct: total > 0 ? Math.floor(100 * Math.min(es.length, total) / total) : 0, left: Math.max(0, total - es.length) };
  if ($('postcardCount')) $('postcardCount').textContent = pg.total > 0 ? `${pg.have}/${pg.total}枚` : es.length ? `${es.length}枚` : '';
  if ($('postcardAlbum')) {
    $('postcardAlbum').hidden = pg.total <= 0;
    if ($('postcardBarFill')) $('postcardBarFill').style.width = `${pg.pct}%`;
    if ($('postcardLeft')) $('postcardLeft').textContent = pg.left > 0 ? `あと ${pg.left}枚` : pg.total > 0 ? 'コンプ！' : '';
  }
  ul.innerHTML = es.length ? es.map(e => `<li data-pc="${esc(e.id)}"><span class="ico">${esc(e.icon)}</span><span class="main"><b>${esc(e.name)}</b><small>${esc(e.c.day)}</small></span></li>`).join('')
    : '<li class="empty">名所（注目スポット）にチェックインすると、記念ポストカードが 1枚もらえます</li>';
}
function openPostcard(id) {
  const e = pcEntries().find(x => x.id === id);
  if (!e) return;
  let el = $('postcardPanel');
  if (!el) {
    el = document.createElement('div'); el.id = 'postcardPanel'; el.className = 'course-panel';
    el.addEventListener('click', ev => { if (ev.target === el || (ev.target.closest && ev.target.closest('[data-pc-close]'))) el.hidden = true; });
    document.body.appendChild(el);
  }
  const rice = pcRice();
  el.innerHTML = `<div class="co-box pc-card"><div class="pc-top"><span class="pc-icon">${esc(e.icon)}</span><b>${esc(e.name)}</b></div><p class="pc-meta">${esc(e.area)}${e.area ? '　' : ''}${esc(e.c.day)} に 到着</p><div class="pc-say">${rice ? `<img class="pi" src="${rice}" alt="かおりちゃん" width="48" height="40"/>` : '<span class="pc-icon">🍚</span>'}<p>${esc(e.c.say)}</p></div><p class="pc-stamp">💌 にしおさんぽGO 記念ポストカード</p><button type="button" class="btn" data-pc-close>とじる</button></div>`;
  el.hidden = false;
}
document.addEventListener('click', e => { const li = e.target.closest && e.target.closest('#postcardList [data-pc]'); if (li) openPostcard(li.dataset.pc); });
$('courseBtn').addEventListener('click', () => openCourse());
$('courseNext').addEventListener('click', () => {
  const c = CO.byId(CO.clean(S.course).cur), s = c && coSpot(c.spots[CO.clean(S.course).n]);
  if (!s) return;
  setGuide({ kind: 'spot', id: s.id, name: s.name, lat: s.lat, lng: s.lng, why: `${c.name}の つぎ`, mine: true, alts: [] });
  toast(`🧭 行き先を「${s.name}」にした`);
});
document.addEventListener('click', e => { if (e.target.closest('[data-jump-open]')) openJump(); });
$('textToggle').checked = !simple();
$('textToggle').addEventListener('change', e => {
  document.body.classList.toggle('simple', !e.target.checked);
  try { localStorage.setItem('nsg_text_more', e.target.checked ? '1' : '0'); } catch (err) {  }
  renderKoyomi.key = null; renderKoyomi(); refreshNearby(); renderMarkers();
  track('text_mode', { more: e.target.checked });
});


if (window.ResizeObserver) new ResizeObserver(() => document.documentElement.style.setProperty('--sheet-h', $('sheet').offsetHeight + 'px')).observe($('sheet'));







function RESCUE_BTN(why) { return `<br/><button type="button" class="btn mini" data-rescue="${why}">🎮 操作して遊ぶ に切り替える（家からでも遊べます）</button>`; }
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-rescue]');
  if (!b) return;
  track('rescue_switch', { why: b.dataset.rescue });
  switchMode(true);
  if (window.nishioPixel && !document.body.classList.contains('px')) nishioPixel.setActive(true);
  if (welcomeDue() && window.nishioPixel && nishioPixel.worldMode) nishioPixel.setWorld(false);
});
function welcomeDue() { return demo && !S.welcomed && S.total < 200; }
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
function dayN() { const f = store.get('nsg_first_day', ''); return /^\d{4}-\d\d-\d\d$/.test(f) ? Math.max(0, Math.round((new Date(ymd()) - new Date(f)) / 86400000)) : -1; }
function afterReward() {
  session.rewards++;
  if (!store.get('nsg_first_reward', false)) {
    store.set('nsg_first_reward', true);
    const t0 = store.get('nsg_begin_t', 0);
    if (t0) track('first_reward', { secs: Math.round((Date.now() - t0) / 1000), mode: demo ? 'play' : 'walk' });
  }



  const rd = store.get('nsg_rw_day', null), today = ymd(), n = (rd && rd.date === today ? rd.n : 0) + 1;
  store.set('nsg_rw_day', { date: today, n });
  if (n < 2) return;
  afterRewardClosed(() => a2hsLater('goal'));
}

function afterRewardClosed(fn) {
  clearTimeout(afterRewardClosed.t);
  const wait = () => { afterRewardClosed.t = setTimeout(() => ($('reward').classList.contains('show') ? wait() : fn()), 1000); };
  wait();
}
function tomorrowBonus() { return CFG.pts.daily; }
function tomorrowItems() {
  const out = [`名所にチェックインすると +${tomorrowBonus()}pt（毎日同じ）`, '新しい「今日のクエスト」3つ（達成でポイント）', '新しい たからばこ（日によって置き場所が変わる）'];
  if (demo) out.push('閉じている間も るすばん でさんぽ（おかえりのポイントとドット絵）');
  out.push(`あしたも 100歩たんけん：はじめての道を さがそう`);
  return out;
}
function tomorrow() { const d = new Date(); d.setDate(d.getDate() + 1); return ymd(d); }

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

const TRAIL_M = 8;

const WALK_SAY = { none: 'きょうは まだ これからだらぁ。ちょっと そこまで 歩いてみりん', short: 'ちょっと歩いたねぇ。ええ散歩だがん', mid: 'よう歩いたなも。西尾の道は ええもんだなぁ', long: 'こんなに歩いたん！ えらいなぁ。足、やすめりんよ', spots: 'あっちこっち 寄れたねぇ。ええ名所めぐりだったがん' };
const kaoriWalkSay = (walked, n) => n >= 3 ? WALK_SAY.spots : walked >= 3000 ? WALK_SAY.long : walked >= 1000 ? WALK_SAY.mid : walked >= 30 ? WALK_SAY.short : WALK_SAY.none;

const SG = window.NISHIO_SHOGO;
function shogoHtml(id, p) { const t = SG && SG.title(id, p); return t ? ` <small class="shogo" title="${esc(t.name)}">${t.icon} ${esc(t.name)}</small>` : ''; }

function shogoSayHtml() {
  if (!SG) return '';
  const ids = Object.keys(SG.TITLES), all = spotMeta.loaded && ids.every(id => SG.title(id, areaProgress(id)));
  const t = SG.say(SG.tier(Object.keys(S.visits || {}).length, all));
  return t ? `<p class="kaori-say">${PIA('talk', 'かおりちゃん')} ${esc(t)}</p>` : '';
}
function todaySpotsHtml(day) {
  const list = (day.spots || []).map(id => spots.find(x => x.id === id)).filter(Boolean);
  if (!list.length) return '';
  return `<ul class="tw-spots">${list.map(sp => `<li><b>${esc(sp.name)}</b>${sp.area && DOT_AREA[sp.area] ? ` <small>${esc(DOT_AREA[sp.area])}</small>` : ''}</li>`).join('')}</ul>`;
}
function todayWalkCard() {
  const day = dayState(), walked = day.walked || 0, fresh = (day.trail || 0) * TRAIL_M, best = S.best || { m: 0, date: '' };
  const word = walked < 30 ? 'まだ歩いていません。きょうは どの道を歩こう？'
    : fresh >= walked * 0.5 ? '知らない道をたくさん歩きました。地図に足あとが ふえています'
    : '地図の足あとの外へ出ると、はじめての道のポイントがもらえます';
  const cell = (label, v) => `<span><small>${label}</small><b>${v}</b></span>`;
  return `<div class="todaywalk"><p><b>${PIA('feet', '')} きょうのさんぽ</b></p>
    <div class="tw3">${cell('歩いた', fmtM(walked))}${cell('はじめての道', fmtM(fresh))}${cell('チェックイン', (day.checkins || 0) + '回')}</div>
    <p class="word">${esc(word)}</p>
    ${todaySpotsHtml(day)}<p class="kaori-say">${PIA('talk', 'かおりちゃん')} ${esc(kaoriWalkSay(walked, (day.spots || []).length))}</p>${shogoSayHtml()}
    ${dayGoals(day)}
    <small>自己ベスト ${best.m ? fmtM(best.m) : '—'}・これまでに歩いた道 ${fmtM((S.trail || 0) * TRAIL_M)}（つぎの節目 ${fmtM(trailMile(trailMileNext()))} まで あと ${fmtM(Math.max(0, trailMile(trailMileNext()) - (S.trail || 0) * TRAIL_M))}）${S.chain && S.chain.best >= 2 ? `・いちばんの れんさ ${S.chain.best}` : ''}${S.h100best ? `・100歩たんけんの自己ベスト ${S.h100best}マス` : ''}</small></div>`;
}

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
  el.innerHTML = simple()
    ? `<b>${ART32('calendar', '')} あした</b><div class="chips">${[['stat-fire', `+${tomorrowBonus()}`, items[0]], ['quest', '×3', items[1]], ['stat-chest', '', items[2]], ...(demo ? [['home', '', items[3]]] : []), ['stat-feet', '', items[items.length - 1]]].map(([ic, v, t]) => `<span title="${esc(t)}">${ART32(ic, t)}${v}</span>`).join('')}</div>`
    : `<b>📅 あしたのおたのしみ</b><ul>${items.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
}








const A2HS = { everyMs: 7 * 86400000, closedMs: 30 * 86400000, showMs: 11000, minPlayMs: 60000, returnMs: 20000, goals: 3, tryMs: 2000, tries: 20 };
let a2hsEvt = null, a2hsPending = '', a2hsTimer = 0, a2hsTry = 0;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); a2hsEvt = e;

  if (a2hsPending) { const w = a2hsPending; a2hsPending = ''; a2hsLater(w); }
});
window.addEventListener('appinstalled', () => { track('a2hs_installed', {}); store.set('nsg_a2hs_done', true); a2hsHide(); });
function standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
const inAppBrowser = ua => /\bLine\/|Instagram|FBAN|FBAV|FB_IAB/.test(String(ua));

function a2hsHow() { return a2hsEvt ? 'prompt' : isIOS() && !inAppBrowser(navigator.userAgent) ? 'ios' : ''; }

function a2hsEligible() {
  if (standalone() || store.get('nsg_a2hs_done', false)) return false;
  const now = Date.now();
  if (now - store.get('nsg_a2hs_t', 0) < A2HS.everyMs || now - store.get('nsg_a2hs_x', 0) < A2HS.closedMs) return false;
  return demo ? store.get('nsg_mzgoals', 0) >= A2HS.goals : (S.checkins || 0) >= A2HS.goals;
}

function a2hsCalm() {
  const P = window.nishioPixel;
  return !document.hidden && !ktBusy() && !rewardBusy() && !$('toast').classList.contains('show') && $('reactBar').hidden && !$('intro').offsetParent
    && !document.querySelector('[role="dialog"]:not([hidden])') && !(P && P.worldMode) && !(P && P.floats && P.floats().length);
}

function a2hsLater(when) {
  clearTimeout(a2hsTry);
  let n = 0;
  const go = () => {
    if (!a2hsEligible() || !$('a2hs').hidden) return;
    if (performance.now() < A2HS.minPlayMs) { a2hsTry = setTimeout(go, A2HS.tryMs); return; }
    if (!a2hsCalm()) { if (++n <= A2HS.tries) a2hsTry = setTimeout(go, A2HS.tryMs); return; }
    a2hsOffer(when);
  };
  a2hsTry = setTimeout(go, A2HS.tryMs);
}
function a2hsOffer(when) {
  if (!a2hsEligible()) return false;
  const how = a2hsHow();
  if (!how) {
    a2hsPending = when || 'goal';
    if (isIOS() && !a2hsOffer.skipped) { a2hsOffer.skipped = true; track('a2hs_skip', { how: 'inapp' }); }
    return false;
  }
  store.set('nsg_a2hs_t', Date.now());
  const el = $('a2hs');
  $('a2hsAdd').hidden = how !== 'prompt';
  $('a2hsText').hidden = how === 'prompt';
  $('a2hsText').textContent = '📲 □↑ →「ホーム画面に追加」で すぐ 開けるよ';
  el.dataset.how = how;
  el.hidden = false;
  void el.offsetWidth; el.classList.add('show');
  clearTimeout(a2hsTimer);
  a2hsTimer = setTimeout(() => { if (!el.hidden) { track('a2hs_later', { how: 'timeout' }); a2hsHide(); } }, A2HS.showMs);
  track('a2hs_shown', { how, when: when || 'goal' });
  return true;
}
function a2hsHide() {
  const el = $('a2hs');
  clearTimeout(a2hsTimer);
  el.classList.remove('show');
  a2hsTimer = setTimeout(() => { el.hidden = true; }, 350);
}
$('a2hsAdd').addEventListener('click', async () => {
  a2hsHide();
  if (!a2hsEvt) return;
  const ev = a2hsEvt;
  a2hsEvt = null;
  ev.prompt();
  const r = await Promise.resolve(ev.userChoice).catch(() => null);
  track('a2hs_click', { outcome: (r && r.outcome) || 'unknown' });
});
$('a2hsNo').addEventListener('click', () => { store.set('nsg_a2hs_x', Date.now()); track('a2hs_later', { how: 'close' }); a2hsHide(); });
setTimeout(() => { if (store.get('nsg_started', false) && dayN() >= 1) a2hsLater('return'); }, A2HS.returnMs);
if (/[?&]src=a2hs\b/.test(location.search)) track('a2hs_open', {});

function sessionEnd() {
  if (!store.get('nsg_started', false) || !session.on) return;
  const secs = Math.round((Date.now() - session.start) / 1000);
  if (secs >= 5) track('session_end', { secs, pts: session.gained, rewards: session.rewards, day_n: dayN(), mode: demo ? 'play' : 'walk', transport_type: 'beacon' });
  session.on = false;
}
function sessionStart() { Object.assign(session, { start: Date.now(), on: true, gained: 0, rewards: 0 }); }
document.addEventListener('visibilitychange', () => { if (document.hidden) sessionEnd(); else if (store.get('nsg_started', false)) sessionStart(); });
window.addEventListener('pagehide', sessionEnd);







const INTRO_SCENES = [['castle', '西尾城'], ['island', '海と 小さな 島'], ['matcha', '抹茶と おかし'], ['teafield', '茶畑'], ['lantern', '大きな ちょうちんの まつり'], ['sunflower', 'ひまわり畑'],
  ['paddy', '田んぼと 山なみ'], ['train', '川を わたる 赤い 電車'], ['beach', '白い 砂浜'], ['unagi', 'うなぎの かば焼き'], ['hydrangea', 'あじさい'], ['autumn', '紅葉と 西尾城']].map(([f, t]) => ({ src: `nishio-go/art/intro/${f}.png`, t }));
const sceneAt = i => INTRO_SCENES[((i % INTRO_SCENES.length) + INTRO_SCENES.length) % INTRO_SCENES.length];
const sceneRand = () => sceneAt(Math.floor(Math.random() * INTRO_SCENES.length));
const sceneSet = n => { const a = INTRO_SCENES.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };
function introHero() {
  const cv = $('introHero');
  if (!cv || !cv.getContext) return;
  const x = cv.getContext('2d'), img = new Image(), W = cv.width, H = cv.height;

  const calmM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches, SHOW = calmM ? 9000 : 4500, FADE = calmM ? 0 : 800;
  const sc = { i: Math.floor(Math.random() * INTRO_SCENES.length), t0: 0, imgs: new Map() };
  const sceneImg = i => { const s = sceneAt(i); let m = sc.imgs.get(s.src); if (!m) { m = new Image(); m.src = s.src; sc.imgs.set(s.src, m); } return m; };
  const ready = m => m && m.complete && m.naturalWidth;
  cv.dataset.scene = '';
  const TOP = 46, LOW = 62, S0 = 56, S1 = 96;
  const gY = px => { const t = Math.min(1, Math.max(0, (px - S0) / (S1 - S0))); return TOP + (LOW - TOP) * t * t * (3 - 2 * t); };
  const K = 280, FR = 52, DRAG = 0.3, DRIVE = 32, LEAVE = 40;
  const st = { x: -24, v: DRIVE, ang: 0, av: 0, rest: 0, mode: 'drive', sq: 0, sqv: 0, last: 0 };
  const scene = now => {
    if (!sc.t0) sc.t0 = now;
    if (now - sc.t0 > SHOW && ready(sceneImg(sc.i + 1))) { sc.i++; sc.t0 = now; }
    const a = sceneImg(sc.i), b = sceneImg(sc.i + 1); sceneImg(sc.i + 2);
    if (ready(a)) {
      x.imageSmoothingEnabled = false; x.globalAlpha = 1; x.drawImage(a, 0, 0, W, H);
      const f = FADE ? (now - sc.t0 - (SHOW - FADE)) / FADE : 0;
      if (f > 0 && ready(b)) { x.globalAlpha = Math.min(1, f); x.drawImage(b, 0, 0, W, H); x.globalAlpha = 1; }
      cv.dataset.scene = sceneAt(f >= 0.5 && ready(b) ? sc.i + 1 : sc.i).src;
    } else {
    const sky = x.createLinearGradient(0, 0, 0, 40);
    sky.addColorStop(0, '#8fd0f4'); sky.addColorStop(1, '#d8f0fb');
    x.fillStyle = sky; x.fillRect(0, 0, W, 40);
    x.fillStyle = '#7fa8c8'; x.fillRect(0, 30, W, 4);
    x.fillStyle = '#6dbb4c'; x.fillRect(0, 34, W, H - 34);
    x.fillStyle = '#4f9a3e';
    for (let r = 0; r < 5; r++) for (let c = 0; c < 20; c++) x.fillRect(((c * 8 + r * 4 - now / 90) % (W + 8) + W + 8) % (W + 8) - 4, 37 + r * 5, 3, 3);
    }
    for (let c = 0; c < W; c++) {
      const y = Math.round(gY(c + 0.5));
      x.fillStyle = '#c8b078'; x.fillRect(c, y, 1, H - y);
      if (y < LOW) {
        x.fillStyle = '#a8905c'; x.fillRect(c, y + 3, 1, LOW + 3 - (y + 3));
        x.fillStyle = '#86703f'; for (let k = 50; k < LOW + 3; k += 5) if (k > y + 3 && c % 3 !== 0) x.fillRect(c, k, 1, 1);
        if (c < S0 && c % 7 === 2) { x.fillStyle = '#4f9a3e'; x.fillRect(c, y - 2, 2, 2); }
      }
    }
    x.fillStyle = '#b09860'; for (let c = 0; c < 20; c++) { const sx = c * 9 + 3; if (sx > S1) x.fillRect(sx, 64 + (c % 2) * 3, 3, 1); }
  };
  const step = now => {
    if ($('intro').hidden) return;
    const dt = Math.min(0.05, (now - (st.last || now)) / 1000);
    st.last = now;
    const x0 = st.x;
    if (st.mode === 'drive') { st.x += DRIVE * dt; if (st.x >= S0 - 6) { st.mode = 'free'; st.v = DRIVE; } }
    else if (st.mode === 'free') {
      st.v += (K * (gY(st.x + 0.5) - gY(st.x - 0.5)) - FR - DRAG * st.v) * dt;
      if (st.v <= 0) { st.v = 0; st.mode = 'rest'; st.rest = 2; }
      else { st.x += st.v * dt; if (x0 < S1 && st.x >= S1) { st.sq = 0.14; st.sqv = 0; } }
    } else if (st.mode === 'rest') { st.rest -= dt; if (st.rest <= 0) st.mode = 'leave'; }
    else { st.x += LEAVE * dt; if (st.x > W + 24) { st.x = -24; st.mode = 'drive'; } }
    const dx = st.x - x0;
    if (dx > 0.001) { st.ang += dx / 9; st.av = dx / 9 / Math.max(dt, 1e-3); }
    else {
      const up = Math.round(st.ang / (Math.PI * 2)) * Math.PI * 2;
      st.av += (up - st.ang) * 70 * dt; st.av *= Math.pow(0.86, dt * 60); st.ang += st.av * dt;
    }
    st.sqv += (-st.sq * 260 - st.sqv * 14) * dt; st.sq += st.sqv * dt;
    scene(now);
    x.imageSmoothingEnabled = false;
    const gy = gY(st.x), th = st.ang, low = Math.sqrt((10 * Math.sin(th)) ** 2 + (13.5 * Math.cos(th)) ** 2);
    x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(Math.round(st.x - 8), Math.round(gy) + 1, 16, 2);
    const cy = gy - low * (1 - st.sq);
    const mood = 'smile';
    if (!(window.nishioPixel && nishioPixel.drawRice && nishioPixel.drawRice(x, st.x, cy, th % (Math.PI * 2), st.sq, mood)) && img.complete && img.naturalWidth) {
      x.save(); x.translate(Math.round(st.x), Math.round(cy)); x.rotate(th % (Math.PI * 2));
      x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0, 32, 32, -16, -16, 32, 32);
      x.restore();
    }
    requestAnimationFrame(step);
  };
  img.src = 'nishio-go/art/rice.png';
  requestAnimationFrame(step);
}

if (window.MutationObserver && $('howto')) new MutationObserver(() => { const h = $('howto'), b = $('howtoScene'); if (h && b && !h.hidden) { const s = sceneRand(); b.style.backgroundImage = `url("${s.src}")`; b.dataset.scene = s.src; b.title = s.t; } }).observe($('howto'), { attributes: true, attributeFilter: ['hidden'] });




const FRIEND_BONUS = 20;
function friendBonus() {
  if (store.get('nsg_friend', 0) !== 1) return;
  gainPoints(FRIEND_BONUS); save();
  store.set('nsg_friend', 2);
  track('friend_bonus', { mode: demo ? 'play' : 'walk' });
  setTimeout(() => toast(`👋 友だちのシェアから来てくれた人に +${FRIEND_BONUS}pt`), 1500);
}
function begin(isDemo) {
  if ($('intro').hidden && store.get('nsg_started', false)) return;
  if (!store.get('nsg_started', false)) store.set('nsg_begin_t', Date.now());
  if (!store.get('nsg_first_day', '')) store.set('nsg_first_day', ymd());
  store.set('nsg_started', true);
  track('game_start', { mode: isDemo ? 'play' : 'walk' });
  $('intro').hidden = true;

  if (isDemo && !document.body.classList.contains('px') && window.nishioPixel) nishioPixel.setActive(true);
  setMode(isDemo);
  friendBonus();

  if (isDemo && welcomeDue() && window.nishioPixel && nishioPixel.worldMode) nishioPixel.setWorld(false);

  if (!isDemo && ktOn() && !store.get('nsg_kome_hello', false)) {
    const px = isDemo && document.body.classList.contains('px'), chest = isDemo && welcomeDue();

    const how = !isDemo ? 'きみが あるくと、いっしょに すすむよ。' : px ? 'スマホを かたむけるか、行きたい 所を タップすると、すすむよ。' : '地図を タップすると、そこへ 行くよ。';
    const pics = sceneSet(3);
    KT.say([{ t: 'はじめまして。あいちのかおりちゃん だよ。いっしょに 町を めぐろう！', mood: 'happy', pic: pics[0] }, { t: how, pic: pics[1] },
      () => (chest && welcomeDue() ? { t: 'まずは、すぐ近くの たからばこを あけに 行こう！', mood: 'excited' } : null)],
    { busy: () => ktBusy() || (px && !store.get('nsg_howto', 0)), key: 'hello', keep: true, onShow: () => store.set('nsg_kome_hello', true), then: () => { if (!chest) ktAskGuide([], 'smile'); } });
    if (isDemo) { setTimeout(sealPickCheck, 3000); return; }
  }
  if (isDemo) toast(document.body.classList.contains('px')
    ? (welcomeDue() ? (simple() ? '🎁 すぐ近くに たからばこ！' : '🎁 すぐ近くに たからばこ！ スマホを傾けて（矢印キー・地図を タップでも）近づくと開きます') : '🌀 スマホを傾けて、迷路を 進もう（矢印キー・地図を タップでも）')
    : '🎮 地図をタップするとその場所へ移動します');
  setTimeout(sealPickCheck, 3000);
}
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('[data-sponsor],[data-camp]');
  if (a) track(a.dataset.sponsor ? 'sponsor_link' : 'campaign_link', { id: a.dataset.sponsor || a.dataset.camp });
});
$('demoBtn').addEventListener('click', () => begin(true));


renderHeader();
loadSpots(false);
loadAreas();
if (ED.shops) { loadRewards(); loadCampaigns(); }
if (store.get('nsg_started', false)) {

  if (!store.get('nsg_first_day', '')) store.set('nsg_first_day', 'unknown');
  if (!store.get('nsg_begin_t', 0)) store.set('nsg_first_reward', true);
  $('intro').hidden = true; setMode(demo);
}
else {


  let noAuto = false; try { noAuto = localStorage.getItem('nsg_noauto') === '1'; } catch (e) {  }
  if (noAuto) {
    track('intro_view', {});
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') $('iosTiltNote').hidden = false;
    document.addEventListener('DOMContentLoaded', introHero);
  } else $('intro').hidden = true;
}


if (!$('intro').hidden) fetch('nishio-go/stats.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).then(j => {
  if (!j || !(j.players >= 100) || !$('playerCount')) return;
  $('playerCount').textContent = `👥 これまでに ${Math.floor(j.players / 10) * 10}人以上が遊んでいます（${j.updated.slice(5).replace('-', '/')}時点）`;
  $('playerCount').hidden = false;
}).catch(() => {  });
setInterval(() => { renderMarkers(); refreshNearby(); }, 10000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderMarkers(); refreshNearby(); idleCheck(); } else idleMark(); });
window.addEventListener('pagehide', idleMark);

setInterval(() => { if (!document.hidden && demo) { if (Date.now() - idleOf().last < 5 * 60000) idleMark(); else idleCheck(); } }, 60000);
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-up]'); if (b) buyUp(b.dataset.up); });


window.nishioGo = {
  galleryTiles,
  a2hs: { cfg: A2HS, offer: a2hsOffer, later: a2hsLater, hide: a2hsHide, eligible: a2hsEligible, calm: a2hsCalm, how: a2hsHow, inApp: inAppBrowser, setEvt(e) { a2hsEvt = e; } },
  notePlayInput, snapMaze, mzSpeed, playAsk, playAskOk, PLAY_ASK_MIN_S, playShow, get playPending() { return playQ.pending; }, set mzNpcShareTest(v) { mzNpcShare = v; },
  sound,
  get nimotsu() { const NM = window.NISHIO_NIMOTSU; return NM ? NM.current(S.nimotsu, Date.now()) : ''; },
  get state() { return S; }, get stateKey() { return stateKey(); }, get spotsVersion() { return spotsVersion; }, get spots() { return spots; }, get me() { return me; }, get demo() { return demo; },
  get areas() { return areas; }, get glowGoal() { return glow.goal || null; }, get glowNear() { return glow.near ? glow.near.list : []; }, areaProgress, exploreRing, areaTint, areaRgb, areaZone, guideChips, AREA_RGB,
  get selected() { return selected; }, CFG, REGION, playBounds, cityAt, cityNear, placeAt, setPlace, inPlay,

  begin, track, utmUrl, arriveMsg, npcBriefMsg, INTRO_SCENES, jumpReward, harvestReward, dankyuReward, hiryoReward, oldmapFound, oldmapHas, kiraraFound, kiraraHas, yatsuMushiDue, yatsuMushiSeen, yatsuMushiReward, rewardBusy, rewardSoon, showReward, toastHold, toastFlush, miniBest, miniRecords, miniStart, FRIEND_BONUS,
  get started() { return store.get('nsg_started', false); }, openTab,
  playMode() {
    if (!document.body.classList.contains('px') && window.nishioPixel) nishioPixel.setActive(true);
    if (!demo) setMode(true);
  }, get campaigns() { return campaigns; }, liveCampaigns, renderCampaigns,
  stats() {
    const lv = levelOf(S.total);
    return { lv, title: titleOf(lv), points: S.points, total: S.total, places: Object.values(S.visits).filter(v => v.featured).length, spots: Object.keys(S.visits).length,
      met: (S.met || []).length, memos: knownFacts(), badges: (S.badges || []).length, demo };
  },
  focusSpot(id) {
    const s = spots.find(x => x.id === 'f-' + id || x.id === id);
    if (!s) return false;
    if (demo) { follow = false; onFix(s.lat, s.lng, 5, Date.now()); if (window.nishioPixel) nishioPixel.centerOnMe(); }
    else { follow = false; map.setView([s.lat, s.lng], 17); }
    toast(`📍 ${s.name}${me && !demo ? `（ここから ${fmtM(dist(me, s))}）` : ''}`);
    return true;
  },
  spotTip, dist, cooldownLeft, inReach, reachOf, guideRadius, renderGuide, checkin, checkinSpot, popupHtml, toast, toastAfter, renderLog, ymd, refreshNearby, reactLine, get npcs() { return placeNpcs(); }, weekTheme, giveBag, talkNpc, callNpc(id) { calledBy = id || null; }, meetCritter, critterLeft, critterFirst: () => !Object.keys(S.critters || {}).length, watchOpen, watchWater, alleyFind, mzGrain, mzFruit, mzPiece, mzView, mzCache, mzQuest, mzDino, mzChase, mzEnergy, mzShoo, mzTorch, mzBrigade, mzPurify, mzRescueJoin, mzRescue, mzCube, mzGrainHas: key => mzGrainGot().includes(key), get mzGrains() { return mzGrainGot().length; }, alleyOpen: (x, y) => (dayState().alleys || 0) < ALLEY.daily && !(S.alleys || []).includes(`${x},${y}`), sealCands, sealPickCheck, clearInfo: () => ({ cleared: !!S.cleared, got: SEAL_MAIN.filter(id => (S.seals || []).includes(id)).length, need: SEAL_MAIN.length }), get rival() { return rivalWhere(); }, rivalSay, RIVAL, areaArt, npcMet, chestOpened: id => dayState().chests.includes(id), liveChests, get welcomeChest() { return welcomeDue(); },
  moveTo(lat, lng, kind) { if (!demo) return; follow = false; stepMove = kind === 'step'; try { onFix(lat, lng, 5, Date.now()); } finally { stepMove = false; } },
  get driving() { return driving; },
  get guide() { return guideTarget(); }, guideDispName, decideGuide, setGuide, guideNoPath, guideKept: () => !!(S.guide && (S.guide.mine || S.guide.refer || S.guide.byId)),
  autoInterval, autoLearn, idleCheck, buyUp, IDLE,
  setDriving(on) { driving = !!on && demo; if (!driving) tryChest(); refreshNearby(); },
  invalidateMap() { setTimeout(() => { map.invalidateSize(); if (me) map.setView([me.lat, me.lng]); }, 0); },
  onModeChange(fn) { modeListeners.push(fn); },
};
})();
