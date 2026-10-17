// にしおさんぽGO の天気：気象庁の防災情報（アメダスのいまの観測と、きょうの天気予報）から、遊んでいる所の天気を出す
// ・気象庁のデータ（https://www.jma.go.jp/bosai/）をブラウザから直接読む（ほかのサーバーへ現在地は送らない）
// ・アメダスは近くの観測所（気温：岡崎・蒲郡・大府、雨：それに一色も）、予報は愛知県の西部（西尾・岡崎・安城・碧南・幸田・高浜）か東部（蒲郡）
// ・10分ごとに取り直し、端末に10分保存。取れないとき（オフラインなど）は天気なし
// 出典：気象庁ホームページ（アメダス・天気予報）。game.js・pixel.js より先に読む
(function (root) {
'use strict';
const BASE = 'https://www.jma.go.jp/bosai/';
// [観測所番号, 名前, 緯度, 経度, 気温があるか]（アメダス地点表 amedastable.json から）
const STATIONS = [['51226', '岡崎', 34.9183, 137.1933, true], ['51281', '蒲郡', 34.845, 137.2167, true], ['51216', '大府', 34.995, 136.9433, true], ['51271', '一色', 34.8117, 137.0283, false]];
const KEY = 'nsg_weather', TTL = 10 * 60000;
const kinds = {
  sunny: { name: '晴れ', icon: '☀️' }, cloudy: { name: 'くもり', icon: '☁️' }, rain: { name: '雨', icon: '☔' }, snow: { name: '雪', icon: '⛄' },
};
let cur = null, loading = null;
const listeners = [];
const d2 = (a, b) => Math.hypot((a[0] - b[0]) * 111, (a[1] - b[1]) * 91);

// 気象庁の天気コード（3けた）の最初の数字：1 晴れ・2 くもり・3 雨・4 雪
const fromCode = c => ({ 1: 'sunny', 2: 'cloudy', 3: 'rain', 4: 'snow' })[String(c || '')[0]] || null;
async function getJson(u) { const r = await fetch(u, { cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }

function inRing(lat, lng, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][0] > lat) !== (r[j][0] > lat) && lng < (r[j][1] - r[i][1]) * (lat - r[i][0]) / (r[j][0] - r[i][0]) + r[i][1]) inside = !inside;
  }
  return inside;
}
// 東部の予報は蒲郡市だけ（ほかの6市町は西部）。市町の境界（region.js）で決め、どの市町にも入らない所（海の上など）だけ蒲郡のあたりかで決める
function isEast(lat, lng) {
  const cities = (root.NISHIO_REGION && root.NISHIO_REGION.cities) || [];
  const c = cities.find(c => (c.rings || []).some(r => inRing(lat, lng, r)));
  return c ? c.id === 'gamagori' : lng > 137.15 && lat < 34.9;
}

async function load(lat, lng) {
  const east = isEast(lat, lng);
  const [fc, t] = await Promise.all([getJson(BASE + 'forecast/data/forecast/230000.json'), fetch(BASE + 'amedas/data/latest_time.txt', { cache: 'no-cache' }).then(r => r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status)))]);
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)/.exec(t.trim());
  if (!m) throw new Error('時刻が読めない');
  const obs = await getJson(`${BASE}amedas/data/map/${m.slice(1, 7).join('')}.json`);
  const area = fc[0].timeSeries[0].areas.find(a => a.area.code === (east ? '230020' : '230010')) || fc[0].timeSeries[0].areas[0];
  const here = [lat, lng], near = STATIONS.slice().sort((a, b) => d2(here, [a[2], a[3]]) - d2(here, [b[2], b[3]]));
  const tSt = near.find(s => s[4] && obs[s[0]] && obs[s[0]].temp && obs[s[0]].temp[1] === 0);
  const pSt = near.find(s => obs[s[0]] && obs[s[0]].precipitation10m && obs[s[0]].precipitation10m[1] === 0);
  const temp = tSt ? obs[tSt[0]].temp[0] : null;
  const rain10 = pSt ? obs[pSt[0]].precipitation10m[0] : null, rain1h = pSt && obs[pSt[0]].precipitation1h ? obs[pSt[0]].precipitation1h[0] : null;
  const raining = (rain10 || 0) > 0 || (rain1h || 0) >= 0.5;
  const fk = fromCode(area.weatherCodes[0]);
  // いま雨が降っていれば雨（気温が低ければ雪）。降っていなければ、きょうの予報の晴れ・くもり（雨の予報なら「くもり」）
  const kind = raining ? (temp !== null && temp <= 1 ? 'snow' : 'rain') : fk === 'sunny' ? 'sunny' : 'cloudy';
  return { kind, ...kinds[kind], temp, raining, forecast: String(area.weathers[0] || '').replace(/\s+/g, ''), forecastArea: east ? '愛知県東部' : '愛知県西部',
    tempAt: tSt ? tSt[1] : '', rainAt: pSt ? pSt[1] : '', at: m[4] + ':' + m[5], t: Date.now() };
}
function emit() { for (const f of listeners) try { f(cur); } catch (e) { /* noop */ } }
// lat, lng：いまいる所（市町のどのあたりかで、観測所と予報の地域を選ぶだけ。どこにも送らない）
function refresh(lat, lng) {
  if (loading) return loading;
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && Date.now() - s.t < TTL && Math.abs(s.lat - lat) < 0.05 && Math.abs(s.lng - lng) < 0.05) { cur = s.w; emit(); return Promise.resolve(cur); } } catch (e) { /* noop */ }
  loading = load(lat, lng).then(w => {
    cur = w; emit();
    try { localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), lat, lng, w })); } catch (e) { /* noop */ }
    return w;
  }).catch(() => cur).finally(() => { loading = null; });
  return loading;
}
root.NISHIO_WEATHER = { refresh, get current() { return cur; }, onChange(f) { listeners.push(f); }, kinds, STATIONS, isEast };
})(window);
