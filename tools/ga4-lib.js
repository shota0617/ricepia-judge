// Google アナリティクス（GA4）の Data API を読む 道具（tools/ga4-stats.js・tools/play-weekly.js が 使う）
// 環境変数：GA4_PROPERTY_ID（数字）、GA4_SERVICE_ACCOUNT_JSON（サービスアカウントの 鍵 JSON。GA4 で「閲覧者」）。値は チャットや リポジトリに 書かない
'use strict';
const crypto = require('crypto');
const PROP = (process.env.GA4_PROPERTY_ID || '').trim(), KEY = (process.env.GA4_SERVICE_ACCOUNT_JSON || '').trim();
const on = () => !!(PROP && KEY);

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
// その 期間の イベントの 数（{ 名前: 数 }。無い ものは 0）
async function eventCounts(tk, names, startDate, endDate) {
  const j = await report(tk, { dateRanges: [{ startDate, endDate }], dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }], dimensionFilter: byEvent(names) });
  const out = Object.fromEntries(names.map(n => [n, 0]));
  for (const r of j.rows || []) out[r.dimensionValues[0].value] = Number(r.metricValues[0].value);
  return out;
}
module.exports = { on, token, report, byEvent, eventCounts };
