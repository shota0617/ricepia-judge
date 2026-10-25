#!/usr/bin/env node
// push の 前の 見張り：node guard.js [比べる元＝origin/main] [--pre-merge]
// まもる きまり（くわしくは SKILL.md）を、機械で 見られる ところだけ 調べる。✖ は 直すまで push しない。⚠ は 目で 確かめる
//   ✖ main に いる・作業用の ブランチ（RICEPIA_BRANCH）で ない
//   ✖ ricepia-jp/deploy.txt が main に ある（本番の ricepia.jp を 書きかえる 合図。作業用の ブランチに だけ 置き、動かしたら すぐ 消す）。--pre-merge では ブランチに 残っていても ✖
//   ✖ push する コミットの どれかに 秘密の 値らしい もの（API キー・トークン・パスワード・秘密鍵。あとで 消しても 途中の コミットに のこる）
//   ✖ コミットの 文に モデルの 名前（Co-Authored-By の 行は のぞく）
//   ⚠ コミットに Co-Authored-By・Claude-Session の 行が ない／ページや コードに メールアドレス／deploy.txt が ブランチに 残っている
'use strict';
const { git } = require('./env');

const BRANCH = process.env.RICEPIA_BRANCH || 'claude/confident-turing-etepui';
const PRE_MERGE = process.argv.includes('--pre-merge');   // マージの 前（pre-merge.sh）：deploy.txt が ブランチに 残っていても ✖
const base = process.argv.slice(2).find(a => !a.startsWith('--')) || 'origin/main';
const bad = [], warn = [];

const cur = git('rev-parse', '--abbrev-ref', 'HEAD');
if (cur === 'main' || cur === 'master') bad.push(`main に いる（作業は ${BRANCH} で）`);
else if (cur !== BRANCH) bad.push(`ブランチが ${cur}（push して よいのは ${BRANCH} だけ。別の ブランチは 運営者が 言った ときだけ）`);

const has = (ref, f) => git('ls-tree', '--name-only', ref, f) === f;
if (has(base, 'ricepia-jp/deploy.txt')) bad.push(`ricepia-jp/deploy.txt が ${base} に ある（main には ぜったい 置かない）`);
if (has('HEAD', 'ricepia-jp/deploy.txt')) (PRE_MERGE ? bad : warn).push(PRE_MERGE ? 'ricepia-jp/deploy.txt が ブランチに 残っている：消してから マージする（main に 入ると、あとの push で 本番の ricepia.jp を 書きかえる）' : 'ricepia-jp/deploy.txt が ブランチに ある：運営者の OK を もらって ワークフローを 手で 動かしたら すぐ 消す（さくらの 国外IPアドレスフィルタを 戻すよう 運営者に 伝える）');

// 足した 行
const diff = git('-c', 'core.quotePath=false', 'diff', '--unified=0', '--no-color', `${base}...HEAD`);
let file = '';
const SECRET = [
  [/sk-ant-[A-Za-z0-9_-]{10,}/, 'Anthropic の キー'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/, 'GitHub の トークン'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS の キー'],
  [/\bxox[abpr]-[A-Za-z0-9-]{10,}/, 'Slack の トークン'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, '秘密鍵'],
  [/\b(?:[A-Z0-9_]*(?:TOKEN|PASSWORD|PASSWD|SECRET|API_KEY|ACCESS_KEY))\s*[:=]\s*['"][^'"\s$]{12,}['"]/, '秘密の 値の 代入'],
  [/\bMLY\|[0-9]+\|[A-Za-z0-9]{20,}/, 'Mapillary の トークン'],
];
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, EMAIL_OK = /^(noreply@anthropic\.com|.*@example\.(com|org)|.*@users\.noreply\.github\.com)$/i;
for (const l of diff.split('\n')) {   // 最後の 差分：メールアドレス
  if (l.startsWith('+++ ')) { file = l.slice(6); continue; }
  if (!l.startsWith('+') || l.startsWith('+++')) continue;
  const t = l.slice(1);
  if (/\.(html|js|json|css)$/.test(file) && !file.startsWith('.claude/')) for (const m of t.match(EMAIL) || []) if (!EMAIL_OK.test(m) && !/\.(png|jpe?g|webp|svg|gif)$/i.test(m)) warn.push(`${file}：メールアドレス「${m.replace(/^(.).*@/, '$1…@')}」（運営者の メールは ページに 書かない）`);
}
// 秘密は コミットごとに 見る（あとの コミットで 消しても、途中の コミットは push で 公開される）
// 見る コミット：これから 公開される もの＝main（base）にも リモートの 作業用 ブランチにも ない、すべての 親の がわの コミット
// （まだ push して いない 別の ブランチを 取りこんだ ときの 2つめの 親の がわも。つないだ マージずみの 歴史は リモートに あるので 見ない）
const refOk = r => { try { git('rev-parse', '--verify', '-q', r); return true; } catch (e) { return false; } };
const NOT = ['--not', base, ...(refOk(`origin/${BRANCH}`) ? [`origin/${BRANCH}`] : [])];
const patches = git('-c', 'core.quotePath=false', 'log', '--no-merges', '-p', '--unified=0', '--no-color', '--format=@@@COMMIT %h', 'HEAD', ...NOT);
let sha = '';
file = '';
for (const l of patches.split('\n')) {
  if (l.startsWith('@@@COMMIT ')) { sha = l.slice(10); continue; }
  if (l.startsWith('+++ ')) { file = l.slice(6); continue; }
  if (!l.startsWith('+') || l.startsWith('+++')) continue;
  for (const [re, what] of SECRET) if (re.test(l.slice(1))) bad.push(`${sha} の ${file}：${what}らしい 値（値は 出さない。まだ push して いない コミットなら、その コミットから 消して 作りなおす。push ずみなら 運営者に 伝えて キーを 取りかえて もらう）`);
}
// マージコミット（main の 取りこみ）で 足された 行も 見る：--cc の 差分は、どの 親とも ちがう 行（ぶつかりの 直しで 入った 行）だけを 出す。
// 行の 頭は 親の 数の けたで、どれかが「+」なら 足した 行
for (const m of git('rev-list', '--merges', 'HEAD', ...NOT).split('\n').filter(Boolean)) {
  const cc = git('-c', 'core.quotePath=false', 'show', '--cc', '--unified=0', '--no-color', '--format=', m);
  let f = '', np = 2;
  for (const l of cc.split('\n')) {
    const d = l.match(/^diff --cc (.+)$/); if (d) { f = d[1]; continue; }
    const h = l.match(/^(@{3,}) /); if (h) { np = h[1].length - 1; continue; }
    if (l.startsWith('+++ ') || l.startsWith('--- ')) continue;
    const pre = l.slice(0, np);
    if (pre.length < np || !/^[ +-]+$/.test(pre) || !pre.includes('+') || pre.includes('-')) continue;
    for (const [re, what] of SECRET) if (re.test(l.slice(np))) bad.push(`${m.slice(0, 8)}（マージ）の ${f}：${what}らしい 値（値は 出さない。マージを やりなおす 前に 消す。push ずみなら 運営者に 伝えて キーを 取りかえて もらう）`);
  }
}

// コミットの 文
const MODEL = /\bclaude-(?:opus|sonnet|haiku|fable|instant)[-\w.]*|\b(?:Opus|Sonnet|Haiku|Fable)\s*\d+(?:\.\d+)?\b|\bclaude-\d[-\w.]*/i;
const log = git('log', '--first-parent', '--no-merges', '--format=%H%x1f%B%x1e', `${base}..HEAD`)   // --first-parent：つないだ マージずみの 歴史は 見ない
.split('\x1e').map(s => s.trim()).filter(Boolean);
for (const ent of log) {
  const [sha, msg] = ent.split('\x1f');
  const lines = msg.split('\n');
  const body = lines.filter(x => !/^Co-Authored-By:/i.test(x)).join('\n');
  if (MODEL.test(body)) bad.push(`${sha.slice(0, 8)}：コミットの 文に モデルの 名前（Co-Authored-By の 行の ほかには 書かない）`);
  if (!lines.some(x => /^Co-Authored-By:/i.test(x)) || !lines.some(x => /^Claude-Session:/.test(x))) warn.push(`${sha.slice(0, 8)}：Co-Authored-By・Claude-Session の 行が ない（commit.sh を 使う）`);
}

for (const b of [...new Set(bad)]) console.log(`✖ ${b}`);
for (const w of [...new Set(warn)]) console.log(`⚠ ${w}`);
if (!bad.length && !warn.length) console.log(`ok（${cur}・${log.length} コミット）`);
process.exit(bad.length ? 1 : 0);
