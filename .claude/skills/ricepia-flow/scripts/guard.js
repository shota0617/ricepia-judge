#!/usr/bin/env node
// push の 前の 見張り：node guard.js [比べる元＝origin/main]
// まもる きまり（くわしくは SKILL.md）を、機械で 見られる ところだけ 調べる。✖ は 直すまで push しない。⚠ は 目で 確かめる
//   ✖ main に いる・作業用の ブランチ（RICEPIA_BRANCH）で ない
//   ✖ ricepia-jp/deploy.txt が main に ある（本番の ricepia.jp を 書きかえる 合図。作業用の ブランチに だけ 置き、動かしたら すぐ 消す）
//   ✖ 足した 行に 秘密の 値らしい もの（API キー・トークン・パスワード・秘密鍵）
//   ✖ コミットの 文に モデルの 名前（Co-Authored-By の 行は のぞく）
//   ⚠ コミットに Co-Authored-By・Claude-Session の 行が ない／ページや コードに メールアドレス／deploy.txt が ブランチに 残っている
'use strict';
const { git } = require('./env');

const BRANCH = process.env.RICEPIA_BRANCH || 'claude/confident-turing-etepui';
const base = process.argv[2] || 'origin/main';
const bad = [], warn = [];

const cur = git('rev-parse', '--abbrev-ref', 'HEAD');
if (cur === 'main' || cur === 'master') bad.push(`main に いる（作業は ${BRANCH} で）`);
else if (cur !== BRANCH) bad.push(`ブランチが ${cur}（push して よいのは ${BRANCH} だけ。別の ブランチは 運営者が 言った ときだけ）`);

const has = (ref, f) => git('ls-tree', '--name-only', ref, f) === f;
if (has(base, 'ricepia-jp/deploy.txt')) bad.push(`ricepia-jp/deploy.txt が ${base} に ある（main には ぜったい 置かない）`);
if (has('HEAD', 'ricepia-jp/deploy.txt')) warn.push('ricepia-jp/deploy.txt が ブランチに ある：運営者の OK を もらって ワークフローを 手で 動かしたら すぐ 消す（さくらの 国外IPアドレスフィルタを 戻すよう 運営者に 伝える）');

// 足した 行
const diff = git('diff', '--unified=0', '--no-color', `${base}...HEAD`);
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
for (const l of diff.split('\n')) {
  if (l.startsWith('+++ ')) { file = l.slice(6); continue; }
  if (!l.startsWith('+') || l.startsWith('+++')) continue;
  const t = l.slice(1);
  for (const [re, what] of SECRET) if (re.test(t)) bad.push(`${file}：${what}らしい 値（値は 出さない。消してから 履歴に 残っていないか 確かめる）`);
  if (/\.(html|js|json|css)$/.test(file) && !file.startsWith('.claude/')) for (const m of t.match(EMAIL) || []) if (!EMAIL_OK.test(m) && !/\.(png|jpe?g|webp|svg|gif)$/i.test(m)) warn.push(`${file}：メールアドレス「${m.replace(/^(.).*@/, '$1…@')}」（運営者の メールは ページに 書かない）`);
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
