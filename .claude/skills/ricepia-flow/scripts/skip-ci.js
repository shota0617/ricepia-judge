#!/usr/bin/env node
// マージの 題に「[skip ci]」が いるかを 調べる：node skip-ci.js [比べる元＝origin/main]
// 広告の 動画づくり（make-promo.yml）と ricepia.jp の 更新（ricepia-jp.yml）は、main への push で 動く。
// その paths に ふれる PR を そのまま マージすると、広告の 作りなおしや さくらへの アップロードが 動くので、題の 最後に [skip ci] を つける。
// paths は 2つの ワークフローから 読む（ワークフローを かえても ここを 直さなくて よい）
'use strict';
const fs = require('fs'), path = require('path');
const { ROOT, git } = require('./env');

const WF = ['.github/workflows/make-promo.yml', '.github/workflows/ricepia-jp.yml'];
function pathsOf(file) {   // on.push.paths の 並びを 読む（この 2つの ファイルの 書き方に 合わせた 小さな 読み方）
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n'), out = [];
  let inPush = false, inPaths = false;
  for (const l of lines) {
    if (/^\s{2}push:\s*$/.test(l)) { inPush = true; continue; }
    if (inPush && /^\s{2}\S/.test(l)) inPush = false;
    if (inPush && /^\s{4}paths:\s*$/.test(l)) { inPaths = true; continue; }
    if (inPaths) {
      const m = l.match(/^\s{6}-\s*([^\s#]+)/);
      if (m) { out.push(m[1].replace(/^['"]|['"]$/g, '')); continue; }
      if (/^\s{0,4}\S/.test(l)) inPaths = false;
    }
  }
  return out;
}
const glob = g => new RegExp('^' + g.split('**').map(s => s.split('*').map(t => t.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*') + '$');

const base = process.argv[2] || 'origin/main';
const files = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean);
const hits = [];
for (const wf of WF) {
  if (!fs.existsSync(path.join(ROOT, wf))) continue;
  const pats = pathsOf(wf).map(p => [p, glob(p)]);
  for (const f of files) for (const [p, re] of pats) if (re.test(f)) hits.push(`${f}（${path.basename(wf)} の ${p}）`);
}
if (hits.length) {
  console.log('[skip ci] が いります：マージの 題の 最後に「 [skip ci]」を つけてください');
  for (const h of hits) console.log(`  - ${h}`);
  process.exit(10);
}
console.log(`[skip ci] は いりません（${files.length} ファイル。広告づくり・ricepia.jp の paths に ふれていない）`);
