#!/usr/bin/env node
// マージの 題に「[skip ci]」が いるかを 調べる：node skip-ci.js [比べる元＝origin/main]
// 広告の 動画づくり（make-promo.yml）と ricepia.jp の 更新（ricepia-jp.yml）は、main への push で 動く。
// その paths に ふれる PR を そのまま マージすると、広告の 作りなおしや さくらへの アップロードが 動くので、題の 最後に [skip ci] を つける。
// paths は 2つの ワークフローから 読む（ワークフローを かえても ここを 直さなくて よい）
'use strict';
const fs = require('fs'), path = require('path');
const { ROOT, git } = require('./env');

const WF = ['.github/workflows/make-promo.yml', '.github/workflows/ricepia-jp.yml'];
function pathsOf(file) {   // on.push.paths を 読む。読めない 書き方・paths の ない push は null（安全がわ：[skip ci] が いる と みなす）。push が なければ []
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8'), lines = src.split('\n');
  if (/^on:\s*(\[[^\]]*\bpush\b[^\]]*\]|push)\s*$/m.test(src)) return null;   // on: push・on: [push, …]（paths なし）
  let inPush = false, inPaths = false, sawPush = false, out = [];
  for (const l of lines) {
    if (/^\s{2}push:\s*(\{\s*\})?\s*$/.test(l)) { inPush = sawPush = true; continue; }
    if (/^\s{2}push:\s*\S/.test(l)) return null;   // push: {…} などの 1行の 書き方
    if (inPush && /^\s{0,2}\S/.test(l)) { inPush = false; inPaths = false; }
    if (!inPush) continue;
    const inline = l.match(/^\s{4}paths:\s*\[(.*)\]\s*(#.*)?$/);
    if (inline) { out.push(...inline[1].split(',').map(x => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)); continue; }
    if (/^\s{4}paths:\s*$/.test(l)) { inPaths = true; continue; }
    if (/^\s{4}paths(-ignore)?:/.test(l)) return null;   // ほかの 書き方・paths-ignore は 読まない
    if (inPaths) {
      const m = l.match(/^\s{6}-\s*([^\s#]+)/);
      if (m) { out.push(m[1].replace(/^['"]|['"]$/g, '')); continue; }
      if (/^\s{0,4}\S/.test(l)) inPaths = false;
    }
  }
  if (!sawPush) return [];
  return out.length ? out : null;   // push は あるのに paths が 読めない → 安全がわ
}
const glob = g => new RegExp('^' + g.split('**').map(s => s.split('*').map(t => t.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*') + '$');

const base = process.argv[2] || 'origin/main';
const files = git('diff', '-z', '--name-only', `${base}...HEAD`).split('\0').map(f => f.trim()).filter(Boolean);   // -z：日本語などの ファイル名を 引用・エスケープ しない 生の パスで
const hits = [];
for (const wf of WF) {
  if (!fs.existsSync(path.join(ROOT, wf))) continue;
  const ps = pathsOf(wf);
  if (ps === null) { if (files.length) hits.push(`${path.basename(wf)} の push の 条件が 読めない（安全がわ）`); continue; }
  const pats = ps.map(p => [p, glob(p)]);
  for (const f of files) for (const [p, re] of pats) if (re.test(f)) hits.push(`${f}（${path.basename(wf)} の ${p}）`);
}
if (hits.length) {
  console.log('[skip ci] が いります：マージの 題の 最後に「 [skip ci]」を つけてください');
  for (const h of hits) console.log(`  - ${h}`);
  process.exit(10);
}
console.log(`[skip ci] は いりません（${files.length} ファイル。広告づくり・ricepia.jp の paths に ふれていない）`);
