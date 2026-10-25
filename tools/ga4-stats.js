// にしおさんぽGO の累計プレイ人数を Google アナリティクス（GA4）から数えて nishio-go/stats.json に保存する：node tools/ga4-stats.js
// ・数えるのは game_start イベントの数（遊びかたをえらんで始めた端末の数。はじめの画面は端末ごとに1回だけ）と、
//   play_day イベントの数（その日に遊んだ端末の数）。公開しているドメインで、アクセス解析をオフにしていない人だけ
// ・読む環境変数（値はチャットやリポジトリに書かない。GitHub の Secrets に入れる）:
//     GA4_PROPERTY_ID（GA4 のプロパティID・数字）、GA4_SERVICE_ACCOUNT_JSON（サービスアカウントの鍵 JSON。GA4 で「閲覧者」にしておく）
//   どちらかが無ければ、何もせずに終わる
const crypto = require('crypto'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'nishio-go', 'stats.json');
const SINCE = '2026-10-15';   // にしおさんぽGO を公開した日
const PROP = (process.env.GA4_PROPERTY_ID || '').trim(), KEY = (process.env.GA4_SERVICE_ACCOUNT_JSON || '').trim();
if (!PROP || !KEY) { console.log('GA4_PROPERTY_ID か GA4_SERVICE_ACCOUNT_JSON がないので、数えない（GitHub の Secrets に入れると毎日数えます）'); process.exit(0); }

const b64u = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
async function token() {   // サービスアカウントの鍵で署名した JWT を、アクセストークンに替える
  const sa = JSON.parse(KEY), now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/analytics.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = b64u(crypto.createSign('RSA-SHA256').update(head + '.' + body).sign(sa.private_key));
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${sig}` }) });
  const j = await r.json();
  if (!j.access_token) throw new Error('アクセストークンを取得できません: ' + (j.error_description || j.error || r.status));
  return j.access_token;
}
async function report(tk, req) {
  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROP}:runReport`, { method: 'POST',
    headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
  const j = await r.json();
  if (!r.ok) throw new Error('GA4 のレポートに失敗: ' + ((j.error && j.error.message) || r.status));
  return j;
}
const byEvent = names => ({ filter: { fieldName: 'eventName', inListFilter: { values: names } } });

(async () => {
  const tk = await token();
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);   // 日本の日付
  const total = await report(tk, { dateRanges: [{ startDate: SINCE, endDate: 'today' }], dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }], dimensionFilter: byEvent(['game_start', 'play_day']) });
  const get = name => Number(((total.rows || []).find(r => r.dimensionValues[0].value === name) || { metricValues: [{ value: 0 }] }).metricValues[0].value);
  const daily = await report(tk, { dateRanges: [{ startDate: '29daysAgo', endDate: 'today' }], dimensions: [{ name: 'date' }, { name: 'eventName' }], metrics: [{ name: 'eventCount' }],
    dimensionFilter: byEvent(['game_start', 'play_day']), orderBys: [{ dimension: { dimensionName: 'date' } }] });
  const days = {};
  for (const r of daily.rows || []) {
    const d = r.dimensionValues[0].value.replace(/^(\d{4})(\d\d)(\d\d)$/, '$1-$2-$3'), e = r.dimensionValues[1].value, v = Number(r.metricValues[0].value);
    days[d] = days[d] || { date: d, newPlayers: 0, players: 0 };
    if (e === 'game_start') days[d].newPlayers = v; else days[d].players = v;
  }
  const data = { _説明: 'tools/ga4-stats.js が Google アナリティクスから数えた にしおさんぽGO の人数（アクセス解析をオフにした人は入らない）。players は累計プレイ人数（game_start の数＝遊び始めた端末の数）', since: SINCE, updated: today,
    players: get('game_start'), playDays: get('play_day'), last30: Object.values(days).sort((a, b) => a.date.localeCompare(b.date)) };
  fs.writeFileSync(OUT, JSON.stringify(data, null, 1) + '\n');
  console.log(`累計プレイ人数 ${data.players}人（${SINCE}〜${today}）・のべプレイ日数 ${data.playDays}`);
})().catch(e => { console.error(e.message); process.exit(1); });
