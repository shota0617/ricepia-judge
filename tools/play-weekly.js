// にしおさんぽGO：めいろの ゴールの あとの「めいろ、どうだった？」（★と ひとこと）を 1週間ぶん まとめて、つぎに 直す 候補に する
//   node tools/play-weekly.js   … 日本時間の きのうまでの 7日ぶん（[あそび] 日づけ の Issue の コメント）を 数えて、
//                                  ・非公開リポジトリに Issue「[週の声] 〜」（ひとことの 文も そのまま。同じ 週が あれば 書きかえる）
//                                  ・docs/play-weekly.md（数と 直す 候補だけ。ひとことの 文は 入れない。開発の ループが 読む）
//                                  ・GA4 の 鍵が あれば、アクセス解析の 数（遊んだ 人・めいろの ゴール・たずねた／答えた・シェア）も この週と 先週で ならべる
// 環境変数：FEEDBACK_REPO・FEEDBACK_TOKEN（tools/feedback-triage.js と 同じ）、GA4_PROPERTY_ID・GA4_SERVICE_ACCOUNT_JSON（tools/ga4-lib.js。なくても よい）、
//           WEEK_END（YYYY-MM-DD。無ければ 日本時間の きのう）。FEEDBACK も GA4 も 無ければ なにも しない
// .github/workflows/play-weekly.yml が 毎週 月曜に 動かす。docs/feedback.md
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./feedback-triage.js');
const GA = require('./ga4-lib.js');

const ROOT = process.env.FEEDBACK_ROOT || path.join(__dirname, '..');
const REPO = process.env.FEEDBACK_REPO || '';
const OUT = path.join(ROOT, 'docs/play-weekly.md');
// ひとことの 中の ことばで 分ける（直す 候補の 見当。決まった ことばを 数える だけ）
const THEMES = [
  ['hard', '😵 むずかしい・まよう', /むず|難|まよ|迷|わから|分から|ゴール.*(ない|見え)/],
  ['text', '🔤 字・見た目が 見にくい', /字|文字|小さ|ちいさ|読め|よめ|見にく|みにく/],
  ['slow', '🐢 重い・おそい', /重い|おもい|遅|おそい|カクカク|かくかく|固ま|かたま/],
  ['short', '⌛ もの足りない・すぐ 終わる', /短|みじか|すぐ終|もの足|物足|あっけ/],
  ['long', '🕰 長い・つかれる', /長い|ながい|疲|つかれ|あきた|飽/],
  ['bug', '🐞 うごかない・へん', /バグ|動かな|うごかな|止まっ|止まる|とまっ|とまる|おかしい|へんな|変な/],
  ['fun', '😊 たのしい', /楽し|たのし|面白|おもしろ|好き|すき|最高|よかった|良かった/],
];
// アクセス解析で ならべる イベント（nishio-go の track の 名前）
const GA_EVENTS = [['play_day', 'その日 遊んだ 端末'], ['game_start', 'はじめて 遊んだ 端末'], ['maze_goal', 'めいろの ゴール'], ['play_ask', '「めいろ、どうだった？」を 出した'], ['play_rating', '★を 送った'], ['share_prompt', 'ごほうびなどの シェアの ボタンを おした'], ['share_open', 'シェアの 窓を ひらいた（どこからでも）'], ['share', 'シェアした（どこからでも）'], ['friend_bonus', 'シェアから 来て 遊んだ']];
const ymdShift = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
function weekEnd() {
  const w = process.env.WEEK_END;
  if (w && /^\d{4}-\d{2}-\d{2}$/.test(w) && !isNaN(Date.parse(w))) return w;
  return ymdShift(new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), -1);   // 日本時間の きのう
}
// コメントに 埋めた 送られて きたままの 中身（api/feedback.js の storePlay）。数の 型と はんいを もう一度 たしかめる
function playOf(body) {
  const m = /<!-- nsg-play:([A-Za-z0-9+/=]+) -->/.exec(body || '');
  if (!m) return null;
  let x; try { x = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')); } catch (_) { return null; }
  if (!x || !Number.isInteger(x.r) || x.r < 1 || x.r > 5) return null;
  return { r: x.r, text: typeof x.text === 'string' ? x.text.slice(0, 140) : '', sec: Number.isFinite(x.sec) && x.sec > 0 ? x.sec : null, st: Number.isInteger(x.st) && x.st >= 0 && x.st <= 3 ? x.st : null };
}
async function ratings(from, to) {
  // 題の 日づけで えらぶ（Issue は その日 さいしょの 声で 作られるので、作った 時刻は 日本時間の その日の うち）
  const got = await T.searchIssues(`repo:${REPO} is:issue label:play-ratings created:${ymdShift(from, -1)}..${ymdShift(to, 1)}`);
  const out = [];
  for (const i of got) {
    const m = /^\[あそび\] (\d{4}-\d{2}-\d{2})$/.exec(i.title || '');
    if (!m || m[1] < from || m[1] > to) continue;
    for (let page = 1; page <= 30; page++) {
      const list = await T.gh(`/issues/${i.number}/comments?per_page=100&page=${page}`);
      for (const c of list) { const x = playOf(c.body); if (x) out.push({ ...x, d: m[1] }); }
      if (list.length < 100) break;
    }
  }
  return out;
}
const avg = xs => xs.length ? xs.reduce((a, x) => a + x.r, 0) / xs.length : null;
const f1 = v => v == null ? '—' : v.toFixed(1);
function summarize(list, prev, ga = null) {
  const by = (key, groups) => groups.map(([name, ok]) => { const xs = list.filter(ok); return { name, n: xs.length, avg: avg(xs) }; });
  const s = {
    n: list.length, avg: avg(list), prevN: prev.length, prevAvg: avg(prev),
    dist: [5, 4, 3, 2, 1].map(r => ({ r, n: list.filter(x => x.r === r).length })),
    time: by('sec', [['1分 まで', x => x.sec != null && x.sec <= 60], ['1〜2分', x => x.sec > 60 && x.sec <= 120], ['2分 より 長い', x => x.sec > 120]]),
    stars: by('st', [0, 1, 2, 3].map(n => [`めいろ★${n}`, x => x.st === n])),
    withText: list.filter(x => x.text).length,
    ga,
    themes: THEMES.map(([k, name, re]) => { const xs = list.filter(x => x.text && re.test(x.text)); return { k, name, n: xs.length, avg: avg(xs) }; }).filter(t => t.n),
  };
  // 直す 候補（数が 少ない うちは 言いすぎない：3つ 以上 そろった ものだけ）
  const todo = [], low = list.filter(x => x.r <= 2).length;
  if (s.n >= 5 && low / s.n >= 0.3) todo.push(`★1〜2 が ${Math.round(low / s.n * 100)}%（${low}/${s.n}）。ひとことで いちばん 多い 困りごとから 先に`);
  const [t1, , t3] = s.time;
  if (t1.n >= 3 && t3.n >= 3 && t1.avg - t3.avg >= 0.8) todo.push(`2分 より 長く かかった 人の ★が 低い（${f1(t3.avg)}、1分 まで は ${f1(t1.avg)}）。めいろが 長い・まよいやすい かも`);
  for (const t of s.themes) if (t.k !== 'fun' && t.n >= 3) todo.push(`「${t.name}」の ひとことが ${t.n}つ（その ★の 平均 ${f1(t.avg)}）`);
  if (s.prevN >= 5 && s.n >= 5 && s.prevAvg - s.avg >= 0.5) todo.push(`★の 平均が 先週より 下がった（${f1(s.prevAvg)} → ${f1(s.avg)}）。この 週に 公開した 変更を 見なおす`);
  if (ga) {   // アクセス解析から（これも 数が そろった ときだけ）
    const c = ga.cur, p = ga.prev, pct = (a, b) => Math.round(a / b * 100);
    if (c.play_ask >= 20 && c.play_rating / c.play_ask < 0.2) todo.push(`「めいろ、どうだった？」に 答える 人が 少ない（${pct(c.play_rating, c.play_ask)}%：${c.play_rating}/${c.play_ask}）。出す 時・文・★の 大きさを 見なおす`);
    if (p.play_day >= 20 && c.play_day >= 1 && p.maze_goal >= 20 && c.maze_goal / c.play_day < (p.maze_goal / p.play_day) * 0.7) todo.push(`遊んだ 人あたりの めいろの ゴールが へった（${(p.maze_goal / p.play_day).toFixed(1)} → ${(c.maze_goal / c.play_day).toFixed(1)}）。この 週の 変更で めいろが 遊びにくく なって いないか`);
    // share は どの 入口（きろく・名所・おたより も）からでも 数える ので、分母も どこからでも 数える share_open に そろえる（share_prompt は 一部の 入口だけ。Codex の 指摘）
    if (c.share_open >= 20 && c.share / c.share_open < 0.15) todo.push(`シェアの 窓を ひらいても シェアまで いく 人が 少ない（${pct(c.share, c.share_open)}%：${c.share}/${c.share_open}）。シェアの 窓の 文・画像を 見なおす`);
  }
  s.todo = todo;
  return s;
}
function markdown(s, from, to, quotes) {
  const row = (...c) => `| ${c.join(' | ')} |`;
  const L = [
    `# めいろの ★と ひとこと（${from} 〜 ${to}）`, '',
    '> めいろの ゴールの あとの「めいろ、どうだった？」に 届いた 声の まとめ。tools/play-weekly.js が 毎週 作ります（docs/feedback.md）。',
    quotes ? '> ひとことの 文も そのまま のせて います（非公開）。' : '> 数と 直す 候補だけ。ひとことの 文は 非公開の Issue「[週の声]」に あります。', '',
    `- 届いた 声：**${s.n}**（先週 ${s.prevN}）`,
    `- ★の 平均：**${f1(s.avg)}**（先週 ${f1(s.prevAvg)}）`,
    `- ひとこと つき：${s.withText}`, '',
    '## 直す 候補', '', ...(s.todo.length ? s.todo.map(t => `- ${t}`) : ['- まだ ありません（声が 少ない・目だつ 困りごと なし）']), '',
    '## ★の 数', '', row('★', '数'), row('---', '---'), ...s.dist.map(d => row('★'.repeat(d.r), d.n)), '',
    '## かかった 時間と ★', '', row('時間', '数', '★の 平均'), row('---', '---', '---'), ...s.time.map(t => row(t.name, t.n, f1(t.avg))), '',
    '## めいろの ★（あつめた お米）と ★', '', row('めいろ', '数', '★の 平均'), row('---', '---', '---'), ...s.stars.map(t => row(t.name, t.n, f1(t.avg))), '',
  ];
  if (s.ga) L.push('## アクセス解析（Google アナリティクス。アクセス解析を オフに した 人は 入らない）', '', row('', 'この 週', '先週'), row('---', '---', '---'), ...GA_EVENTS.map(([k, n]) => row(n, s.ga.cur[k] || 0, s.ga.prev[k] || 0)), '');
  if (s.themes.length) L.push('## ひとことの 中身（ことばで 分けた だけ）', '', row('なかま', '数', '★の 平均'), row('---', '---', '---'), ...s.themes.map(t => row(t.name, t.n, f1(t.avg))), '');
  if (quotes) {
    const q = xs => xs.map(x => `- ${'★'.repeat(x.r)}${x.sec != null ? `　${x.sec}秒` : ''}：${x.text.replace(/\s+/g, ' ')}`);
    const low = quotes.filter(x => x.text && x.r <= 2).slice(0, 30), high = quotes.filter(x => x.text && x.r >= 4).slice(0, 15), mid = quotes.filter(x => x.text && x.r === 3).slice(0, 15);
    L.push('## ひとこと（★1〜2）', '', ...(low.length ? q(low) : ['- なし']), '', '## ひとこと（★3）', '', ...(mid.length ? q(mid) : ['- なし']), '', '## ひとこと（★4〜5）', '', ...(high.length ? q(high) : ['- なし']), '');
  }
  return L.join('\n');
}
async function main() {
  const fb = !!(REPO && process.env.FEEDBACK_TOKEN);
  if (!fb && !GA.on()) { console.log('FEEDBACK_REPO / FEEDBACK_TOKEN も GA4 の 鍵も 無いので、なにもしません'); return; }
  const to = weekEnd(), from = ymdShift(to, -6), pFrom = ymdShift(from, -7), pTo = ymdShift(from, -1);
  const list = fb ? await ratings(from, to) : [], prev = fb ? await ratings(pFrom, pTo) : [];
  let ga = null;
  if (GA.on()) {   // アクセス解析が 読めなくても、声の まとめは 出す
    try { const tk = await GA.token(), names = GA_EVENTS.map(e => e[0]); ga = { cur: await GA.eventCounts(tk, names, from, to), prev: await GA.eventCounts(tk, names, pFrom, pTo) }; }
    catch (e) { console.log('アクセス解析を 読めませんでした：' + e.message); }
  }
  const s = summarize(list, prev, ga);
  fs.writeFileSync(OUT, markdown(s, from, to, null) + '\n');
  if (!fb) { console.log(`${from} 〜 ${to}：アクセス解析だけ（声は FEEDBACK_REPO / FEEDBACK_TOKEN が 無いので 数えない）、直す 候補 ${s.todo.length}`); return; }
  const title = `[週の声] ${from} 〜 ${to}`, body = markdown(s, from, to, list) + '\n\n---\n_tools/play-weekly.js（.github/workflows/play-weekly.yml）_';
  try { await T.gh('/labels', { method: 'POST', body: JSON.stringify({ name: 'weekly-voice', color: 'fbca04' }) }); } catch (e) { if (!/^GitHub 422 /.test(e.message)) throw e; }
  const same = (await T.searchIssues(`repo:${REPO} is:issue label:weekly-voice in:title "${from}"`)).find(i => i.title === title);
  if (same) await T.gh(`/issues/${same.number}`, { method: 'PATCH', body: JSON.stringify({ body }) });
  else await T.gh('/issues', { method: 'POST', body: JSON.stringify({ title, body, labels: ['weekly-voice'] }) });
  console.log(`${title}：${s.n}つ（★の 平均 ${f1(s.avg)}）、直す 候補 ${s.todo.length}`);
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { playOf, summarize, markdown, weekEnd, THEMES, GA_EVENTS, main };
