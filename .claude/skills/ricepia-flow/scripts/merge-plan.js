#!/usr/bin/env node
// マージの 支度：node merge-plan.js <PR の 番号> [--allow-findings]
//   運営者が「マージ」と 言った あと、pre-merge.sh の 次に 動かす。マージ そのものは GitHub の MCP ツール
//   （merge_pull_request）で 行うので、ここでは その ツールに わたす 値を そろえて 確かめ、JSON で 出す。
//   確かめる こと（✖ が あれば 止まる。JSON は 出さない）
//     ✖ PR が 開いて いない・作業用の ブランチの PR で ない・main 向けで ない
//     ✖ PR の 先頭・手元の HEAD・リモートの ブランチが そろって いない（push し忘れ・あとから 積んだ コミット）
//     ✖ main が PR に 取りこまれて いない（pre-merge.sh を 先に）
//     ✖ ricepia-jp/deploy.txt・秘密 などの 見張り（guard.js --pre-merge）
//     ✖ Codex の いちばん 新しい レビューが 先頭の コミットで「指摘が のこっている」（--allow-findings で ⚠ に できる。運営者が それで よいと 言った とき）
//     ⚠ Codex の レビューが 先頭の コミットで まだ ない・実行中（運営者に そう 伝えて から マージ）
//   題：「PR の 題 (#番号)」＋ 広告づくり・ricepia.jp の paths に ふれる ときは「 [skip ci]」（skip-ci.js）
//   説明：PR の 本文の はじめの 段落 ＋ 決まりの 2行（Co-Authored-By・Claude-Session）
'use strict';
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { ROOT, git } = require('./env');

const n = Number(process.argv[2]);
if (!n) { console.error('PR の 番号を ください：node merge-plan.js 288'); process.exit(2); }
const allowFindings = process.argv.includes('--allow-findings');
const REPO = process.env.RICEPIA_REPO || 'shota0617/ricepia-judge', [owner, repo] = REPO.split('/');
const BRANCH = process.env.RICEPIA_BRANCH || 'claude/confident-turing-etepui';
const SESSION = process.env.RICEPIA_SESSION || 'https://claude.ai/code/session_01LKyh5zrgZ1g3dd89iSPEFE';
const COAUTHOR = process.env.RICEPIA_COAUTHOR || 'Claude Opus 5.5 <noreply@anthropic.com>';

const api = p => JSON.parse(execFileSync('curl', ['-sSf', '-H', 'Accept: application/vnd.github+json', `https://api.github.com/repos/${REPO}/${p}`], { encoding: 'utf8', maxBuffer: 1 << 26 }));   // 公開リポジトリなので 読むだけなら トークンは いらない
const bad = [], warn = [];

const pr = api(`pulls/${n}`);
if (pr.state !== 'open') bad.push(`PR #${n} は ${pr.merged ? 'もう マージずみ' : '閉じている'}`);
if (pr.head.ref !== BRANCH) bad.push(`PR #${n} の ブランチが ${pr.head.ref}（${BRANCH} では ない）`);
if (pr.base.ref !== 'main') bad.push(`PR #${n} の 向き先が ${pr.base.ref}（main では ない）`);

execFileSync('git', ['fetch', 'origin', 'main', BRANCH, '-q'], { cwd: ROOT });
const head = pr.head.sha, local = git('rev-parse', 'HEAD'), remote = git('rev-parse', `origin/${BRANCH}`);
if (local !== head || remote !== head) bad.push(`先頭が そろって いない（PR ${head.slice(0, 8)}・手元 ${local.slice(0, 8)}・リモート ${remote.slice(0, 8)}）。push し忘れか、あとから 積んだ コミット`);
try { git('merge-base', '--is-ancestor', 'origin/main', 'HEAD'); } catch (e) { bad.push('main が PR に 取りこまれて いない（pre-merge.sh を 先に 動かす）'); }

const g = spawnSync(process.execPath, [path.join(__dirname, 'guard.js'), '--pre-merge'], { cwd: ROOT, encoding: 'utf8' });
if (g.status !== 0) bad.push(`見張り（guard.js --pre-merge）：\n${g.stdout.trim().split('\n').map(l => '    ' + l).join('\n')}`);

// Codex の レビューの ようす（PR の まとめの コメントに 埋めこまれた 状態を 読む）
let codex = null;
for (let page = 1; page <= 5 && !codex; page++) {
  const cs = api(`issues/${n}/comments?per_page=100&page=${page}`);
  for (const c of cs) { const m = (c.body || '').match(/codex-review-state:v1 (\{.*?\}\}) /); if (m) codex = JSON.parse(m[1].replace(/&#123;/g, '{').replace(/&#125;/g, '}')).code_review; }
  if (cs.length < 100) break;
}
if (!codex || !codex.commit_sha) warn.push('Codex の レビューが まだ ない');
else if (codex.commit_sha !== head) warn.push(`Codex の いちばん 新しい レビューは ${codex.commit_sha.slice(0, 8)}（先頭 ${head.slice(0, 8)} では ない）`);
else if (codex.status !== 'completed') warn.push(`Codex の レビューが ${codex.status}（先頭の コミット）`);
else if (codex.has_unresolved_findings) (allowFindings ? warn : bad).push('Codex の 指摘が のこっている（先頭の コミット）。直すか、運営者が このままで よいと 言えば --allow-findings');
const threads = (() => { try { return api(`pulls/${n}/comments?per_page=100`).length; } catch (e) { return -1; } })();

const sk = spawnSync(process.execPath, [path.join(__dirname, 'skip-ci.js'), 'origin/main'], { cwd: ROOT, encoding: 'utf8' });
const skip = sk.status === 10;
const firstPara = String(pr.body || '').replace(/\r/g, '').split(/\n\s*\n/)[0].trim();
const plan = {
  owner, repo, pullNumber: n, merge_method: 'squash', expectedHeadSha: head,
  commit_title: `${pr.title} (#${n})${skip ? ' [skip ci]' : ''}`,
  commit_message: `${firstPara}\n\nCo-Authored-By: ${COAUTHOR}\nClaude-Session: ${SESSION}`,
};

for (const b of bad) console.log(`✖ ${b}`);
for (const w of warn) console.log(`⚠ ${w}`);
if (bad.length) { console.log('マージの 支度が できて いません（上を 直してから もう一度）'); process.exit(1); }
console.log(`PR #${n}「${pr.title}」　先頭 ${head.slice(0, 8)}　[skip ci]：${skip ? 'いる' : 'いらない'}　Codex：${codex ? `${codex.status}・${codex.commit_sha ? codex.commit_sha.slice(0, 8) : '-'}・指摘 ${codex.has_unresolved_findings ? 'のこり あり' : 'なし'}` : 'なし'}　レビューの コメント ${threads}件`);
console.log('運営者が この PR に「マージ」と 言った ことを 確かめてから、次の 値で merge_pull_request を 呼ぶ：');
console.log(JSON.stringify(plan, null, 2));
console.log(`マージの あと：unsubscribe_pr_activity（#${n}）・確認の 予定を delete_trigger・post-merge.sh <マージの SHA> ${head}`);
