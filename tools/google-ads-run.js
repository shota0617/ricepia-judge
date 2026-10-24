// tools/google-ads-apply-2026-10.js（Google広告スクリプト）を、Google Ads API 経由でこのまま動かす。
// Google広告の管理画面に貼らなくても、認証情報があれば Claude のクラウド環境などから実行できる。
//   使い方:
//     node tools/google-ads-run.js                 第1週の分を「検証だけ」（validateOnly。アカウントは変わらない）
//     node tools/google-ads-run.js --apply         第1週の分を反映する
//     node tools/google-ads-run.js --step2         第2週（LINE重視の目標設定）を検証だけ
//     node tools/google-ads-run.js --step2 --apply 第2週の分を反映する
//     node tools/google-ads-run.js --job game      にしおさんぽGO のサイトリンク・コールアウトを検証だけ（--apply で反映）
//     node tools/google-ads-run.js --job game-campaign  にしおさんぽGO 専用キャンペーン（一時停止で作る）を検証だけ（--apply で反映）
//     node tools/google-ads-run.js --job serving --out ads.md  配信中の広告をぜんぶ書き出す（読むだけ。3社のAIのレビュー用）
//     node tools/google-ads-run.js --job pause     新米２ を一時停止するのを検証だけ（--apply で反映）
//     node tools/google-ads-run.js --job effect --out effect.txt  広告の効果を見る数字を書き出す（読むだけ。週ごとの LINE 1件の費用・変更履歴など）
//   読む環境変数（値はチャットやリポジトリに書かない）:
//     GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN,
//     GOOGLE_ADS_CUSTOMER_ID（広告アカウントのお客様ID）, GOOGLE_ADS_LOGIN_CUSTOMER_ID（MCC経由のときだけ）,
//     GOOGLE_ADS_API_VERSION（省略時 v25）。試験用に GOOGLE_ADS_API_ENDPOINT / GOOGLE_ADS_TOKEN_URL で送り先を変えられる
// スクリプトは同期的に API を呼ぶ前提なので、HTTP は curl を同期実行して送る（プロキシと証明書の設定もそのまま使える）。
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply'), STEP2 = args.includes('--step2');
const env = k => (process.env[k] || '').trim();
const need = ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_CUSTOMER_ID'];
const missing = need.filter(k => !env(k));
if (missing.length) { console.error('環境変数が足りません: ' + missing.join(', ')); process.exit(2); }
const VERSION = env('GOOGLE_ADS_API_VERSION') || 'v25';
const CID = env('GOOGLE_ADS_CUSTOMER_ID').replace(/-/g, '');
const LOGIN_CID = env('GOOGLE_ADS_LOGIN_CUSTOMER_ID').replace(/-/g, '');
const BASE = (env('GOOGLE_ADS_API_ENDPOINT') || 'https://googleads.googleapis.com') + '/' + VERSION + '/customers/' + CID + '/googleAds:';

// 認証ヘッダーはコマンドラインに出さないよう、本人だけが読めるファイルに書いて curl に渡す
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gads-'));
const headerFile = path.join(tmp, 'headers');
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));

function curl(url, body, headerPath, contentType) {
  const a = ['-sS', '--max-time', '120', '-X', 'POST', '-H', 'Content-Type: ' + contentType, '--data-binary', '@-', '-w', '\n%{http_code}', url];
  if (headerPath) a.splice(0, 0, '-H', '@' + headerPath);
  a.unshift('-q'); // 最初の引数で ~/.curlrc を読ませない（トレース設定などで認証情報がログに残るのを防ぐ）
  const out = execFileSync('curl', a, { input: body, encoding: 'utf8', maxBuffer: 64 << 20 });
  const i = out.lastIndexOf('\n');
  return { status: Number(out.slice(i + 1)), json: out.slice(0, i) ? JSON.parse(out.slice(0, i)) : {} };
}
function token() {
  const form = new URLSearchParams({ client_id: env('GOOGLE_ADS_CLIENT_ID'), client_secret: env('GOOGLE_ADS_CLIENT_SECRET'),
    refresh_token: env('GOOGLE_ADS_REFRESH_TOKEN'), grant_type: 'refresh_token' }).toString();
  const r = curl(env('GOOGLE_ADS_TOKEN_URL') || 'https://oauth2.googleapis.com/token', form, null, 'application/x-www-form-urlencoded');
  if (r.status !== 200 || !r.json.access_token) throw new Error('アクセストークンを取得できません（' + r.status + ' ' + (r.json.error || '') + ' ' + (r.json.error_description || '') + '）');
  return r.json.access_token;
}
fs.writeFileSync(headerFile, ['Authorization: Bearer ' + token(), 'developer-token: ' + env('GOOGLE_ADS_DEVELOPER_TOKEN')]
  .concat(LOGIN_CID ? ['login-customer-id: ' + LOGIN_CID] : []).join('\n') + '\n', { mode: 0o600 });

function errorMessages(json) {
  const e = json.error || {}, msgs = [];
  (e.details || []).forEach(d => (d.errors || []).forEach(x => msgs.push((x.message || '') +
    (x.errorCode ? ' [' + Object.values(x.errorCode).join(',') + ']' : '') + (x.trigger && x.trigger.stringValue ? '「' + x.trigger.stringValue + '」' : ''))));
  return msgs.length ? msgs : [e.message || JSON.stringify(json).slice(0, 300)];
}
function search(query) {
  const out = []; let pageToken;
  do {
    const r = curl(BASE + 'search', JSON.stringify(pageToken ? { query, pageToken } : { query }), headerFile, 'application/json');
    if (r.status !== 200) throw new Error('検索に失敗: ' + errorMessages(r.json).join(' / ') + '\n  ' + query);
    out.push.apply(out, r.json.results || []);
    pageToken = r.json.nextPageToken;
  } while (pageToken);
  return out;
}
let mutateCount = 0;
function mutateAll(ops, opts) {
  mutateCount++;
  const body = { mutateOperations: ops, partialFailure: !!(opts && opts.partialFailure), validateOnly: !APPLY };
  const r = curl(BASE + 'mutate', JSON.stringify(body), headerFile, 'application/json');
  const ok = r.status === 200, msgs = ok ? [] : errorMessages(r.json);
  const res = ((r.json.mutateOperationResponses) || []);
  return ops.map((_, i) => ({ isSuccessful: () => ok, getErrorMessages: () => msgs,
    getResourceName: () => { const x = res[i] && Object.values(res[i])[0]; return x && x.resourceName; } }));
}

// Google広告スクリプトの実行環境のうち、反映スクリプトが使う分だけを用意する
global.Logger = { log: s => console.log(s) };
global.AdsApp = {
  currentAccount: () => ({ getCustomerId: () => CID }),
  getExecutionInfo: () => ({ isPreview: () => !APPLY }),
  search: q => { const rowsOut = search(q); let i = 0; return { hasNext: () => i < rowsOut.length, next: () => rowsOut[i++] }; },
  mutateAll,
  mutate: (op, opts) => mutateAll([op], opts)[0],
};
// 画像は go.ricepia.jp に出ているものと同じ、リポジトリのファイルを読む
const ROOT = path.join(__dirname, '..');
global.UrlFetchApp = { fetch: url => {
  const m = /^https:\/\/go\.ricepia\.jp\/([^?#]+)$/.exec(url);
  if (!m) throw new Error('読めない URL: ' + url);
  const bytes = fs.readFileSync(path.join(ROOT, m[1]));
  return { getBlob: () => ({ getBytes: () => bytes }) };
} };
global.Utilities = { base64Encode: bytes => Buffer.from(bytes).toString('base64') };

const ji = args.indexOf('--job'), JOB = ji >= 0 ? args[ji + 1] : '';
const JOBS = {
  game: ['./google-ads-game-2026-10.js', 'にしおさんぽGO（サイトリンク・コールアウト）'],
  'game-campaign': ['./google-ads-game-campaign-2026-10.js', 'にしおさんぽGO 専用キャンペーン'],
  serving: ['./google-ads-serving-2026-10.js', '配信中の広告の書き出し（読むだけ）'],
  pause: ['./google-ads-pause-2026-10.js', '効果の悪いものを止める'],
  effect: ['./google-ads-effect-2026-10.js', '広告の効果の書き出し（読むだけ）'],
};
if (JOB && !JOBS[JOB]) { console.error('--job は ' + Object.keys(JOBS).join(' / ') + ' のどれか'); process.exit(2); }
const job = require(JOB ? JOBS[JOB][0] : './google-ads-apply-2026-10.js');
if (!JOB) { job.CONFIG.STEP1_COPY_AND_ASSETS = !STEP2; job.CONFIG.STEP2_LINE_GOALS = STEP2; }
console.log((APPLY ? '【反映】' : '【検証だけ（validateOnly）】') + ' API ' + VERSION + ' / ' + (JOB ? JOBS[JOB][1] : STEP2 ? '第2週（目標）' : '第1週（広告文・アセット）'));
job.main();
const oi = args.indexOf('--out');
if (oi >= 0 && job._report.text) fs.writeFileSync(args[oi + 1], job._report.text);
console.log('\nAPI の変更リクエスト ' + mutateCount + ' 回' + (APPLY ? '' : '（検証だけなので、アカウントは変わっていません。--apply で反映）'));
process.exitCode = job._report.failed.length ? 1 : 0;
