// にしおさんぽGO：おたより（非公開リポジトリの Issue）を仕分けて、結果を Issue に書きもどす（.github/workflows/feedback.yml から使う）
//   node tools/feedback-triage.js prepare   … まだ見ていないおたよりを読み、決まった手順で片づくもの（もうゲームにある名所など）は
//                                             その場で返事をして閉じる。のこりを .feedback/items.json に書く（Claude が読む）
//   node tools/feedback-triage.js report    … Claude の結果（.feedback/results.json）と、できたPR（環境変数 PR_URL）を Issue に書く
//   node tools/feedback-triage.js pr        … Claude が直したファイルを確かめて（直してよい場所だけ・JSON と JS が壊れていないか）、PR を作る
// 環境変数：FEEDBACK_REPO（owner/name）、FEEDBACK_TOKEN（そのリポジトリの Issues を読み書きできるトークン）、FEEDBACK_MAX（1回に Claude にわたす数。ふだん5）、
//           CLAUDE_ON（'true' なら Claude にわたす）。pr は GH_TOKEN（このリポジトリに PR を作れるトークン）・GITHUB_REPOSITORY・GITHUB_REF_NAME・GITHUB_RUN_ID・GITHUB_OUTPUT
'use strict';
const fs = require('fs');
const path = require('path');
const OSM = require('../nishio-go/osm-query.js');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, '.feedback');
const REPO = process.env.FEEDBACK_REPO || '';
const TOKEN = process.env.FEEDBACK_TOKEN || '';
const MAX = Math.max(1, Math.min(10, Number(process.env.FEEDBACK_MAX) || 5));
const AI = process.env.CLAUDE_ON === 'true';   // ANTHROPIC_API_KEY があるか（無ければ、決まった手順で片づくものだけ）
const NEAR_M = 500, OSM_M = 400;
const SPOT_CATS = new Set(['shrine', 'temple', 'worship', 'castle', 'historic', 'museum', 'view', 'art', 'sight', 'park', 'library', 'townhall', 'station', 'beach']);
const FOOT = '\n\n---\n_にしおさんぽGO おたより自動仕分け（.github/workflows/feedback.yml）_';

async function gh(p, opt = {}) {
  const r = await fetch('https://api.github.com/repos/' + REPO + p, {
    ...opt,
    headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'nishio-go-feedback', ...(opt.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!r.ok) throw new Error(`GitHub ${r.status} ${p}`);
  return r.status === 204 ? null : r.json();
}
const comment = (n, text) => gh(`/issues/${n}/comments`, { method: 'POST', body: JSON.stringify({ body: text + FOOT }) });
const addLabels = (n, labels) => gh(`/issues/${n}/labels`, { method: 'POST', body: JSON.stringify({ labels }) });
const close = (n, reason = 'completed') => gh(`/issues/${n}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: reason }) });

// Issue の本文に埋めた、送られてきたままの内容（api/feedback.js の issueOf）
function payloadOf(body) {
  const m = [...String(body || '').matchAll(/<!-- nsg-feedback:([A-Za-z0-9+/=]+) -->/g)].pop();   // 本文の最後のもの（api/feedback.js は < > を全角にするので、文の中では まねできない）
  if (!m) return null;
  try { const f = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')); return f && typeof f === 'object' && typeof f.kind === 'string' ? f : null; } catch (_) { return null; }
}

// 名前の比べかた：全角半角・かっこ・空白・記号をそろえて、片方がもう片方をふくむ（短いほうが3文字以上）か、同じなら一致
const norm = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[\s・･\-‐ー－（）()「」『』【】、。,.!！?？'"]/g, '');
function sameName(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.length >= 3 && l.includes(s);
}
function dist(a, b) {
  const R = 6371000, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ゲームにもうある場所（注目スポット・ふつうのスポット・街並みの目印）
function known() {
  const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'nishio-go', f), 'utf8'));
  const out = [];
  for (const s of read('spots.json').spots || []) out.push({ name: s.name, names: [s.name, ...(Array.isArray(s.match) ? s.match.map(m => String(m).replace(/^=/, '')) : [])], lat: s.lat, lng: s.lng, where: s.normal ? 'spots.json（ふつうのスポット）' : 'spots.json（注目スポット）' });
  for (const [, name, cat, lat, lng, raw] of read('osm-spots.json').items || []) if (cat !== 'other') out.push({ name, names: [name, raw], lat, lng, where: 'OpenStreetMap のスポット' });
  for (const [lat, lng, , name] of read('landmarks.json').items || []) out.push({ name, names: [name], lat, lng, where: '街並みの目印' });
  return out;
}
function findKnown(f, list) {
  return list.find(k => k.names.some(n => sameName(n, f.name)) &&
    (f.lat == null ? norm(k.name) === norm(f.name) : Number.isFinite(k.lat) && dist(k, f) <= NEAR_M)) || null;
}

// OpenStreetMap で、送られた位置のまわりに同じ名前の場所があるか
async function findOsm(f) {
  // かっこの中（よみがななど）は外し、空白はなんでもよい文字に。記号は「任意の1文字」に（照合は sameName で厳密に）
  const re = String(f.name).normalize('NFKC').replace(/[（(].*$/, '').trim().replace(/[.*+?^${}()|[\]\\"']/g, '.').replace(/\s+/g, '.*');
  if ([...re].length < 2) return null;
  const q = `[out:json][timeout:25];nwr["name"~"${re}",i](around:${OSM_M},${f.lat},${f.lng});out center tags;`;
  for (const host of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    try {
      const r = await fetch(host, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'nishio-go-feedback' }, signal: AbortSignal.timeout(40000) });
      if (!r.ok) continue;
      const j = await r.json();
      const els = (j.elements || []).filter(e => e.tags && sameName(e.tags.name, f.name)).map(e => {
        const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
        return { id: e.type[0] + e.id, url: `https://www.openstreetmap.org/${e.type}/${e.id}`, name: e.tags.name, cat: OSM.catOf(e.tags), lat, lng, d: Math.round(dist(f, { lat, lng })) };
      }).sort((a, b) => a.d - b.d);
      return els[0] || false;
    } catch (_) { /* つぎのサーバーで */ }
  }
  return null;   // 調べられなかった
}

async function openIssues() {
  const out = [];
  for (let page = 1; page <= 5; page++) {
    const list = await gh(`/issues?labels=feedback&state=open&sort=created&direction=asc&per_page=50&page=${page}`);
    out.push(...list.filter(i => !i.pull_request));
    if (list.length < 50) break;
  }
  return out;
}

async function prepare() {
  fs.mkdirSync(DIR, { recursive: true });
  const items = [];
  if (!REPO || !TOKEN) { console.log('FEEDBACK_REPO / FEEDBACK_TOKEN が無いので、なにもしません'); fs.writeFileSync(path.join(DIR, 'items.json'), '[]\n'); return; }
  const list = known();
  for (const i of await openIssues()) {
    const labels = new Set(i.labels.map(l => l.name));
    if (labels.has('triaged') || labels.has('needs-check')) continue;
    const f = payloadOf(i.body);
    if (!f) { await addLabels(i.number, ['needs-check']); await comment(i.number, '自動では読めない形のおたよりなので、人が見てください。'); continue; }
    if (labels.has('claude-try')) {   // 前の回に Claude にわたしたが、結果が書かれなかった（もう一度はわたさない）
      await addLabels(i.number, ['needs-check']);
      await comment(i.number, '自動での確認が終わらなかったので、人が見てください。');
      continue;
    }
    const hint = {};
    if (f.kind === 'spot') {
      const k = findKnown(f, list);
      if (k) {
        await comment(i.number, `「${f.name}」は、もうゲームにあります（${k.where}：${k.name}${Number.isFinite(k.lat) ? `・${k.lat}, ${k.lng}` : ''}）。`);
        await addLabels(i.number, ['triaged', 'already']); await close(i.number, 'not_planned');
        console.log(`#${i.number} もうある：${k.name}`);
        continue;
      }
      if (f.lat != null) {
        const o = await findOsm(f);
        if (o && SPOT_CATS.has(o.cat)) {
          await comment(i.number, `「${f.name}」は OpenStreetMap にあります（${o.name}・約${o.d}m・${o.url}）。毎週月曜のスポットの作り直し（.github/workflows/bake-spots.yml）で地図に出ます。`);
          await addLabels(i.number, ['triaged', 'already']); await close(i.number, 'completed');
          console.log(`#${i.number} OSMにある：${o.name}`);
          continue;
        }
        hint.osm = o === null ? '調べられなかった' : o ? { ...o, note: 'OpenStreetMap にあるが、名所の種類ではない（お店など）' } : '見つからなかった';
      }
    }
    if (!AI || items.length >= MAX) continue;   // のこりは次の回に（Claude が使えないあいだは、そのまま待つ）
    items.push({ n: i.number, kind: f.kind, name: f.name || '', text: f.text || '', url: f.url || '', lat: f.lat ?? null, lng: f.lng ?? null, spot: f.spot || null, ...hint });
  }
  for (const it of items) await addLabels(it.n, ['claude-try']);
  fs.writeFileSync(path.join(DIR, 'items.json'), JSON.stringify(items, null, 2) + '\n');
  console.log(`Claude にわたす：${items.length}件`);
}

const LABEL = { fixed: 'fixed', proposal: 'proposal', done: 'already', skip: 'spam' };
async function report() {
  const read = f => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (_) { return null; } };
  const items = read('items.json') || [], results = read('results.json');
  const pr = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(process.env.PR_URL || '') ? process.env.PR_URL : '';
  if (!REPO || !TOKEN || !items.length) return;
  for (const it of items) {
    const r = Array.isArray(results) ? results.find(x => x && x.n === it.n) : null;
    if (!r || !Object.hasOwn(LABEL, r.action)) continue;   // 結果が無いものは、次の回に「人が見る」にまわる（claude-try）
    let action = r.action, text = String(r.reply || '').slice(0, 3000);
    if (action === 'fixed' && !pr) { action = 'proposal'; text += '\n\n（直した内容は確認で取りこめなかったので、提案として残します）'; }
    const head = { fixed: `直しました。取りこみ（マージ）を待っています：${pr}`, proposal: '提案です。人が決めてください。', done: 'もう対応ずみ／いまのままで問題ありません。', skip: '反映しないおたよりとして閉じます。' }[action];
    await comment(it.n, `${head}\n\n${text}`);
    await addLabels(it.n, ['triaged', LABEL[action]]);
    if (action !== 'proposal') await close(it.n, action === 'fixed' || action === 'done' ? 'completed' : 'not_planned');
    console.log(`#${it.n} ${action}`);
  }
}

// Claude が直してよいファイル（遊びのデータと画面の文。OpenStreetMap などから作るもの・お店のキャンペーンとごほうび・解析・焼いた絵は除く）
const EDITABLE = p => (p === 'nishio-go.html' || /^nishio-go\/[\w-]+\.(js|json|css)$/.test(p)) &&
  !/^nishio-go\/(osm-spots|landmarks|stats|world|landuse|campaigns|rewards)\.json$|^nishio-go\/(analytics|share)\.js$/.test(p);
const git = (...a) => require('child_process').execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
function changedFiles() {
  return git('status', '--porcelain=v1', '-uall', '-z').split('\0').filter(Boolean)
    .map(l => ({ code: l.slice(0, 2), path: l.slice(3) })).filter(c => !c.path.startsWith('.feedback/'));
}
function revert(c) {
  if (c.code === '??') fs.rmSync(path.join(ROOT, c.path), { force: true });
  else git('checkout', 'HEAD', '--', c.path);
}
// こわれていないか（JSON は読めるか、JS は文法が正しいか）
function intact(p) {
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) return false;   // 消すことはしない
  try {
    if (p.endsWith('.json')) JSON.parse(fs.readFileSync(f, 'utf8'));
    else if (p.endsWith('.js')) require('child_process').execFileSync(process.execPath, ['--check', f], { stdio: 'ignore' });
    return true;
  } catch (_) { return false; }
}
const oneLine = s => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/@/g, '＠').replace(/#(?=\d)/g, '＃').replace(/\s+/g, ' ').trim().slice(0, 200);
async function pr() {
  // 直してよい場所の外の変更は、まだ記録していないファイルも消して戻すので、GitHub Actions の使い捨ての作業場所でだけ動かす
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('pr は GitHub Actions の中でだけ動かします（手元のファイルを消さないように）');
  const out = (k, v) => process.env.GITHUB_OUTPUT && fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
  let files = changedFiles();
  for (const c of files.filter(c => !EDITABLE(c.path))) { console.log('直してよい場所の外なので戻す：' + c.path); revert(c); }
  files = changedFiles();
  if (files.some(c => !intact(c.path))) { console.log('こわれたファイルがあるので、ぜんぶ戻す'); files.forEach(revert); files = []; }
  if (!files.length) { console.log('PR にする変更はありません'); return; }
  const results = (() => { try { return JSON.parse(fs.readFileSync(path.join(DIR, 'results.json'), 'utf8')); } catch (_) { return []; } })();
  const fixed = (Array.isArray(results) ? results : []).filter(r => r && r.action === 'fixed');
  const branch = `feedback/run-${process.env.GITHUB_RUN_ID || Date.now()}`;
  git('checkout', '-b', branch);
  git('add', '--', ...files.map(c => c.path));
  git('-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-q', '-m', 'にしおさんぽGO: おたよりから直す（自動・要確認）');
  git('push', '-q', `https://x-access-token:${process.env.GH_TOKEN}@github.com/${process.env.GITHUB_REPOSITORY}.git`, `HEAD:refs/heads/${branch}`);
  const body = ['プレイヤーからのおたより（非公開の置き場の Issue）を Claude が読んで直した案です。**内容を確かめてからマージしてください。**', '',
    ...(fixed.length ? fixed.map(r => `- ${oneLine(r.public) || '（要約なし）'}`) : ['- （要約なし）']), '',
    '変更してよいのは nishio-go/ の遊びのデータと画面の文だけで、それ以外の変更は自動で取りのぞいています（tools/feedback-triage.js）。',
    'おたよりの文そのもの・送った人の位置は、このPRには書きません。'].join('\n');
  const bodyFile = path.join(DIR, 'pr-body.md');
  fs.writeFileSync(bodyFile, body);
  const url = require('child_process').execFileSync('gh', ['pr', 'create', '--base', process.env.GITHUB_REF_NAME || 'main', '--head', branch,
    '--title', `おたよりから直す（自動・要確認）${fixed.length ? `：${fixed.length}件` : ''}`, '--body-file', bodyFile], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').pop();
  console.log(url);
  out('url', url);
}

if (require.main === module) {
  const run = { prepare, report, pr }[process.argv[2]];
  if (!run) { console.error('使いかた：node tools/feedback-triage.js prepare|report|pr'); process.exit(2); }
  run().catch(e => { console.error(e.message); process.exit(1); });
}
module.exports = { payloadOf, sameName, norm, findKnown, known, EDITABLE, prepare, report };
