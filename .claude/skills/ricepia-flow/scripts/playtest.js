#!/usr/bin/env node
// 通しの プレイテスト（tools/playtest.js）を 動かして、結果を 短く まとめる
//   node playtest.js                         通しで 1回（落ちた 項目が あれば 終了コード 1）
//   node playtest.js --show mzArrive,npcBump 見たい 項目の 中身も 出す
//   node playtest.js --old HEAD --files nishio-go/pixel.js[,nishio-go/game.js] --show 項目
//                                            直す 前の コードで 新しい 確認が 落ちるかを 見る（別の 作業場所で、そのファイルだけ REF の 中身に して 動かす。いまの 作業ファイルは さわらない）
//   node playtest.js --main                  origin/main だけで 動かす（落ちた 項目が この PR の せいか、もとから ときどき 落ちるのかを 見分ける）
//   node playtest.js --rerun                 落ちた ときに もう1回 動かし、2回 とも 落ちた 項目だけを 本当の 失敗と する
//   --port N                                 ポート（いくつか 同時に 動かす ときは かえる。--old は 8941、--main は 8942 が 既定）
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync, execFileSync } = require('child_process');
const { ROOT, playEnv, git } = require('./env');

const args = process.argv.slice(2), opt = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith('--')) continue;
  const k = a.slice(2), v = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
  opt[k] = v;
}
const show = typeof opt.show === 'string' ? opt.show.split(',') : [];

function run(cwd, port, label) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), `playtest-${label.replace(/[^\w.-]+/g, '_')}-`));   // ref の「/」などは フォルダ名に 入れない
  const r = spawnSync(process.execPath, [path.join(cwd, 'tools', 'playtest.js'), out], { cwd, env: playEnv({ PLAYTEST_PORT: String(port) }), encoding: 'utf8', maxBuffer: 1 << 28, timeout: 15 * 60 * 1000 });
  const f = path.join(out, 'playtest.json');
  if (!fs.existsSync(f)) {
    console.error(`[${label}] プレイテストが 最後まで 動きませんでした（終了コード ${r.status}）`);
    console.error((r.stderr || '').split('\n').slice(-20).join('\n') || (r.stdout || '').split('\n').slice(-20).join('\n'));
    return null;
  }
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const checks = j.checks || {}, bad = Object.keys(checks).filter(k => checks[k] && checks[k].ok === false);
  return { label, out, n: Object.keys(checks).length, bad, failures: j.failures || [], ok: !!j.ok, checks };
}

function report(r) {
  if (!r) return;
  console.log(`[${r.label}] ${r.n} 項目　${r.ok ? 'ok' : `落ちた 項目：${r.bad.join(', ') || '（項目の ok 以外の 条件）'}`}`);
  if (!r.ok) for (const f of r.failures) console.log(`  - ${f}`);
  for (const k of show) console.log(`  ${k}: ${JSON.stringify(r.checks[k])}`);
  console.log(`  結果：${r.out}/playtest.json`);
}

function withOldFiles(ref, files, fn) {   // いまの 作業ファイルは 書きかえない：別の 作業場所（git worktree）に いまの 中身（コミット前の 変更も）を 写し、files だけ ref の 中身に して fn(その場所) を 動かす
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'ricepia-old-'));
  git('worktree', 'add', '-q', '--detach', wt, 'HEAD');
  try {
    const dirty = [...git('diff', '-z', '--name-only', 'HEAD').split('\0'), ...git('ls-files', '-z', '--others', '--exclude-standard').split('\0')].map(f => f.trim()).filter(Boolean);   // -z：日本語の ファイル名も 引用・エスケープ しない 生の パスで
    for (const f of dirty) {
      const src = path.join(ROOT, f), dst = path.join(wt, f);
      if (fs.existsSync(src)) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); } else fs.rmSync(dst, { force: true });
    }
    for (const f of files) fs.writeFileSync(path.join(wt, f), execFileSync('git', ['show', `${ref}:${f}`], { cwd: ROOT, maxBuffer: 1 << 28 }));
    return fn(wt);
  } finally { try { git('worktree', 'remove', '--force', wt); } catch (e) { fs.rmSync(wt, { recursive: true, force: true }); } }
}

let res;
if (opt.old) {
  if (typeof opt.files !== 'string') { console.error('--old には --files a,b を つけてください'); process.exit(2); }
  const files = opt.files.split(',');
  res = withOldFiles(opt.old, files, wt => run(wt, Number(opt.port) || 8941, `old:${opt.old}`));
  report(res);
  console.log('（直す 前の コードで 新しい 確認が 落ちれば、その 確認は 直した ことを 見分けられて います）');
  process.exit(0);
} else if (opt.main) {
  execFileSync('git', ['fetch', 'origin', 'main', '-q'], { cwd: ROOT });
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'ricepia-main-'));
  try {
    git('worktree', 'add', '-q', '--detach', wt, 'origin/main');
    res = run(wt, Number(opt.port) || 8942, 'origin/main');
  } finally { try { git('worktree', 'remove', '--force', wt); } catch (e) { /* noop */ } }
  report(res);
  process.exit(res && res.ok ? 0 : 1);
} else {
  res = run(ROOT, Number(opt.port) || 8899, 'いま');
  report(res);
  if (res && !res.ok && opt.rerun) {
    const again = run(ROOT, Number(opt.port) || 8899, 'もう1回');
    report(again);
    if (again) {
      // 本当の 失敗：2回 とも のこる 失敗が ある（落ちた 項目の 名前と、落ちた 理由の 文を それぞれの 回で 集めて 比べる。
      // 文の 中の JSON・数は のぞく。ページの エラーや 真偽値の 確認も、項目の ok と は 別に 比べる）。1回目と 2回目で 別の ものだけが 落ちたなら、ときどき 落ちる 確認
      const norm = t => String(t).replace(/[（(]\s*[{[].*[}\]]\s*[）)]/g, '').replace(/[{[].*[}\]]/g, '').replace(/-?\d+(\.\d+)?/g, '#').replace(/\s+/g, ' ').trim();
      const keys = r => new Set([...r.bad.map(k => `項目 ${k}`), ...r.failures.map(norm)]);
      const k2 = keys(again), both = [...keys(res)].filter(k => k2.has(k));
      const real = both.length > 0 || (!res.ok && !again.ok && !keys(res).size && !k2.size);
      if (real) console.log(`2回 とも 落ちた：\n${both.map(k => `  - ${k}`).join('\n') || '  （理由の 分からない 失敗）'}`);
      else console.log(`2回 とも 落ちた 項目は ありません（1回目：${res.bad.join(', ') || 'なし'}／2回目：${again.bad.join(', ') || 'なし'}。ときどき 落ちる 確認。--main で main でも 落ちるか 見てください）`);
      process.exit(real ? 1 : 0);
    }
  }
  process.exit(res && res.ok ? 0 : 1);
}
