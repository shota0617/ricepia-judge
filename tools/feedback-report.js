// にしおさんぽGO：毎月の「西尾市への提案レポート」（プレイヤーの声のまとめ）を、非公開リポジトリの Issue に書く
//   node tools/feedback-report.js prepare   … その月のおたよりを集計して .feedback/report-data.json に、
//                                             Claude がまとめるための文（位置・受付番号は入れない）を .feedback/report-input.json に書く
//   node tools/feedback-report.js post      … 集計と Claude のまとめ（.feedback/report-themes.md。あれば）を、Issue「【西尾市への提案レポート】…」にする
// 環境変数：FEEDBACK_REPO・FEEDBACK_TOKEN（tools/feedback-triage.js と同じ）、REPORT_MONTH（YYYY-MM。無ければ先月）
// 西尾市に見せる資料のもとになるので、数は集計だけ。まとめにおたよりの文がそのまま入っていたら、まとめを載せない（決まった手順で確かめる）
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./feedback-triage.js');

const ROOT = process.env.FEEDBACK_ROOT || path.join(__dirname, '..');
const DIR = path.join(ROOT, '.feedback');
const REPO = process.env.FEEDBACK_REPO || '';
const KIND = { spot: '📍 こんな名所があるよ', fun: '🎉 こうしたらもっと面白い', fix: '✏️ スポットの情報がちがう', idea: '😣 こまった・使いにくい' };
const OUTCOME = [['fixed', '直した（取りこみ済み・待ち）'], ['already', 'もうゲームにあった'], ['proposal', '運営で検討中'], ['spam', '反映しない'], ['needs-check', '人が確認中']];

function month() {
  const m = process.env.REPORT_MONTH;
  if (m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return m;
  const d = new Date(Date.now() + 9 * 3600e3);   // 日本時間の先月
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}
const lastDay = m => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return d; } };

// だいたいの位置から、いちばん近い地区（西尾市の5つの地区の中心。おおよそ）
function areaOf(f, areas) {
  if (f.lat == null || f.lng == null) return '';
  let best = null, bd = Infinity;
  for (const a of areas) { const d = T.dist(f, a); if (d < bd) { bd = d; best = a; } }
  return best && bd < 12000 ? best.name : 'そのほか';
}

async function prepare() {
  fs.mkdirSync(DIR, { recursive: true });
  const m = month();
  if (!REPO || !process.env.FEEDBACK_TOKEN) { console.log('FEEDBACK_REPO / FEEDBACK_TOKEN が無いので、なにもしません'); return; }
  // 日本時間の1日ずつ検索する（月のさかいめを日本時間にそろえる。1日の上限は api/feedback.js で40通なので、1回の検索の上限250件に十分おさまる）
  const issues = [];
  for (let d = 1; d <= lastDay(m); d++) {
    const day = `${m}-${String(d).padStart(2, '0')}`;
    const got = await T.searchIssues(`repo:${REPO} is:issue label:feedback created:${day}T00:00:00+09:00..${day}T23:59:59+09:00`);
    if (got.length >= 250) throw new Error(`${day} のおたよりが多すぎて数えきれません（250件以上）`);
    issues.push(...got);
  }
  const areas = readJson(path.join(ROOT, 'nishio-go/areas.json'), { areas: [] }).areas.filter(a => !a.near);
  const data = { month: m, total: 0, kinds: {}, outcomes: {}, areas: {}, withPlace: 0 }, input = [];
  for (const i of issues) {
    const f = T.payloadOf(i.body);
    if (!f) continue;
    const labels = new Set(i.labels.map(l => l.name || l));
    data.total++;
    data.kinds[f.kind] = (data.kinds[f.kind] || 0) + 1;
    const o = (OUTCOME.find(([k]) => labels.has(k)) || ['open'])[0];
    data.outcomes[o] = (data.outcomes[o] || 0) + 1;
    const a = o === 'spam' ? '' : areaOf(f, areas);   // いたずらは地区の数に入れない
    if (a) { data.withPlace++; data.areas[a] = (data.areas[a] || 0) + 1; }
    if (o !== 'spam') input.push({ n: i.number, kind: f.kind, name: f.name || '', spot: f.spot ? f.spot.name : '', area: a, text: f.text || '' });   // 位置・受付番号は入れない
  }
  const v = readJson(path.join(ROOT, 'nishio-go/voices.json'), {});
  data.reflected = (Array.isArray(v.log) ? v.log : []).filter(l => String(l.d || '').startsWith(m)).map(l => ({ kind: l.kind, text: l.text }));
  data.players = (readJson(path.join(ROOT, 'nishio-go/stats.json'), {}) || {}).players || null;
  fs.writeFileSync(path.join(DIR, 'report-data.json'), JSON.stringify(data, null, 2) + '\n');
  fs.writeFileSync(path.join(DIR, 'report-input.json'), JSON.stringify(input, null, 2) + '\n');
  console.log(`${m}：おたより ${data.total}件（まとめにわたす ${input.length}件）`);
  if (process.env.GITHUB_OUTPUT && input.length >= 3) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'ai=1\n');   // 3件より少ない月は、まとめを作らない
}

function markdown(data, themes) {
  const ym = `${data.month.slice(0, 4)}年${Number(data.month.slice(5))}月`;
  const row = (a, b) => `| ${a} | ${b} |`;
  const lines = [
    `# 【西尾市への提案レポート】${ym} プレイヤーの声`, '',
    '> お散歩ゲーム「にしおさんぽGO」（運営：近藤米穀店 らいすぴあ）に、プレイヤーから届いた おたより（名所のおしらせ・ごいけん）のまとめです。',
    '> 西尾市版は提案用のデモで、西尾市の公式のものではありません。数は集計だけで、送った人が分かる情報は入れていません。', '',
    '## 数で見る', '', '| 項目 | 数 |', '|---|---|',
    row('おたより', `${data.total}件`),
    ...Object.entries(KIND).map(([k, n]) => row(n, `${data.kinds[k] || 0}件`)),
    row('位置つき（だいたい）', `${data.withPlace}件`),
    ...(data.players ? [row('これまでに遊んだ人（累計・アクセス解析）', `${data.players}人`)] : []), '',
    '## どうなったか', '', '| 結果 | 数 |', '|---|---|',
    ...OUTCOME.map(([k, n]) => row(n, `${data.outcomes[k] || 0}件`)),
    row('まだ仕分けていない', `${data.outcomes.open || 0}件`), '',
  ];
  if (Object.keys(data.areas).length) {
    lines.push('## 地区ごと（位置つきのもの・いちばん近い地区）', '', '| 地区 | 数 |', '|---|---|',
      ...Object.entries(data.areas).sort((a, b) => b[1] - a[1]).map(([a, n]) => row(a, `${n}件`)), '');
  }
  lines.push('## この月に ゲームに反映したこと', '', ...(data.reflected.length ? data.reflected.map(r => `- ${KIND[r.kind] ? KIND[r.kind].slice(0, 2) : '📮'} ${r.text}`) : ['- なし']), '');
  if (themes) lines.push('## 声のまとめ（Claude による要約）', '', themes.trim(), '');
  lines.push('---', '_tools/feedback-report.js（.github/workflows/feedback-report.yml）が毎月作ります。公開ページ：https://go.ricepia.jp/nishio-go/minna.html_');
  return lines.join('\n');
}

// まとめに おたよりの中身がそのまま入っていないか：本文は10文字の切れはし（Claude への指示と同じ）、名所の名前欄・スポット欄は
// 2文字以上がそのまま出ていたら（ゲームの名所に同じ名前があるもの＝ゲームのデータにある名前は のぞく）。電話・メール・郵便番号も
function themeLeak(themes, input) {
  const names = new Set(T.known().flatMap(k => k.names).map(T.norm).filter(Boolean)), t = T.norm(themes);
  if (/0\d{1,4}[-‐ー−－]?\d{1,4}[-‐ー−－]?\d{3,4}|[\w.+-]+[@＠][\w-]+\.|〒|\d{3}[-－]\d{4}/.test(themes)) return '電話・メール・郵便番号';
  for (const i of input) {
    for (const f of [i.name, i.spot]) { const n = T.norm(f); if (n.length >= 2 && !names.has(n) && t.includes(n)) return `#${i.n} の名前欄`; }
    const hit = T.leaks(themes, [{ n: i.n, text: i.text }], 10);
    if (hit) return hit;
  }
  return '';
}

async function post() {
  const data = readJson(path.join(DIR, 'report-data.json'), null);
  if (!data || !REPO) { console.log('集計がないので、なにもしません'); return; }
  const input = readJson(path.join(DIR, 'report-input.json'), []);
  let themes = '';
  try { themes = fs.readFileSync(path.join(DIR, 'report-themes.md'), 'utf8').slice(0, 12000); } catch (_) { /* まとめ無し */ }
  // まとめに おたよりの文がそのまま入っていたら載せない（市に見せる資料のもとなので）
  const leak = themes && themeLeak(themes, input);
  if (leak) { console.log(`まとめに おたよりの文が入っていた（${leak}）ので、まとめは載せない`); themes = '（まとめに おたよりの文がそのまま入っていたので、載せませんでした）'; }
  const ym = `${data.month.slice(0, 4)}年${Number(data.month.slice(5))}月`, title = `【西尾市への提案レポート】${ym} プレイヤーの声`;
  const dup = await T.searchIssues(`repo:${REPO} is:issue in:title "${title}"`);
  if (dup.some(i => i.title === title)) { console.log('この月のレポートは もうあります'); return; }
  try { await T.gh('/labels', { method: 'POST', body: JSON.stringify({ name: 'report', color: '0e8a16' }) }); } catch (e) { if (!/^GitHub 422 /.test(e.message)) throw e; }
  await T.gh('/issues', { method: 'POST', body: JSON.stringify({ title, body: markdown(data, themes), labels: ['report'] }) });
  console.log(title);
}

if (require.main === module) {
  const run = { prepare, post }[process.argv[2]];
  if (!run) { console.error('使いかた：node tools/feedback-report.js prepare|post'); process.exit(2); }
  run().catch(e => { console.error(e.message); process.exit(1); });
}
module.exports = { month, areaOf, markdown, prepare, post };
