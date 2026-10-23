// にしおさんぽGO：おたより（非公開リポジトリの Issue）を仕分けて、結果を Issue に書きもどす（.github/workflows/feedback.yml から使う）
//   node tools/feedback-triage.js prepare   … まだ見ていないおたよりを読み、決まった手順で片づくもの（もうゲームにある名所など）は
//                                             その場で返事をして閉じる。のこりを .feedback/items.json に書く（Claude が読む）
//   node tools/feedback-triage.js report    … Claude の結果（.feedback/results.json）と、公開前の確認の Issue（環境変数 REVIEW_URL）を おたよりの Issue に書く
//   node tools/feedback-triage.js pr        … Claude が直したファイルを確かめて（直してよい場所だけ・JSON と JS が壊れていないか）、差分を 非公開の置き場の
//                                             「公開前の確認」Issue（ラベル publish-review）に置く。公開のリポジトリには まだ何も出さない
//   node tools/feedback-triage.js publish <番号> … 人が確かめた「公開前の確認」Issue の差分だけを、公開のリポジトリの PR にする（.github/workflows/feedback-publish.yml。マージは人）
//   node tools/feedback-triage.js voices    … プレイヤーへの返事（受付番号ごとの いまの様子）と、反映されたこと（人がマージした PR）を
//                                             nishio-go/voices.json に書いて main にコミットする（ゲームの「こえ」タブが読む）。
//                                             公開ページ nishio-go/minna.html（tools/make-minna.js）も いっしょに作りなおす
// 環境変数：FEEDBACK_REPO（owner/name）、FEEDBACK_TOKEN（そのリポジトリの Issues を読み書きできるトークン）、FEEDBACK_MAX（1回に Claude にわたす数。ふだん5）、
//           CLAUDE_ON（'true' なら Claude にわたす）。pr は GITHUB_RUN_ID・GITHUB_SHA・GITHUB_OUTPUT、publish は GH_TOKEN（このリポジトリに PR を作れるトークン）・GITHUB_REPOSITORY・GITHUB_REF_NAME
'use strict';
const fs = require('fs');
const path = require('path');
const OSM = require('../nishio-go/osm-query.js');

// FEEDBACK_ROOT：作業場所（ワークフローは、Claude が触れない場所にコピーしたこのスクリプトから、作業場所を指して動かす）
const ROOT = process.env.FEEDBACK_ROOT || path.join(__dirname, '..');
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
// 返事のしるし（nsg-status）をつけたら、told（その返事はゲームの公開データに入った）を外す。voices が次に公開データへ入れて、また付ける
async function comment(n, text) {
  await gh(`/issues/${n}/comments`, { method: 'POST', body: JSON.stringify({ body: text + FOOT }) });
  if (text.includes('<!-- nsg-status:')) { try { await gh(`/issues/${n}/labels/told`, { method: 'DELETE' }); } catch (e) { if (!/^GitHub 404 /.test(e.message)) throw e; } }
}
const addLabels = (n, labels) => gh(`/issues/${n}/labels`, { method: 'POST', body: JSON.stringify({ labels }) });
const close = (n, reason = 'completed') => gh(`/issues/${n}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: reason }) });

// プレイヤーへの返事（受付番号 → いまの様子）。この回のぶんを .feedback/status.json にためて、voices がゲームの公開データに書く
// s：checking（たしかめ中）・soon（つぎの更新で出る）・already（もうある）・proposal（運営で検討中）・done（いまのままでよい）・skip（反映しない）・reflected（反映された）
// t：公開してよい短い文（ゲームのデータやスポット名など、こちらで作った文だけ。おたよりの文は入れない）
const RID = /^[0-9a-f]{12}$/;
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (_) { return d; } };
// Issue のコメントにも返事のしるしを残す（voices の push が失敗しても、あとで Issue から返事を作りなおせるように）
const statusMark = (rid, s, t = '') => RID.test(rid || '') ? `\n\n<!-- nsg-status:${Buffer.from(JSON.stringify({ rid, s, t: String(t).slice(0, 120) })).toString('base64')} -->` : '';
function setStatus(rid, s, t = '') {
  if (!RID.test(rid || '')) return;
  fs.mkdirSync(DIR, { recursive: true });
  const st = readJson('status.json', {});
  st[rid] = { s, t: String(t).slice(0, 120) };
  fs.writeFileSync(path.join(DIR, 'status.json'), JSON.stringify(st, null, 2) + '\n');
}

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

// 仕分けで使うラベル（無ければ作る。もうあれば 422 で、それでよい）
const LABELS = ['feedback', 'kind:spot', 'kind:fun', 'kind:fix', 'kind:idea', 'triaged', 'claude-try', 'needs-check', 'already', 'fixed', 'proposal', 'spam', 'reflected', 'announced', 'told', 'reactions', 'counted', 'publish-review'];
async function ensureLabels() {
  for (const name of LABELS) {
    try { await gh('/labels', { method: 'POST', body: JSON.stringify({ name, color: name === 'feedback' ? 'f9d0c4' : name === 'needs-check' ? 'e99695' : 'ededed' }) }); }
    catch (e) { if (!/^GitHub 422 /.test(e.message)) throw e; }
  }
}

// まだ仕分けていないおたより（古いじゅん）。開いたままの提案（triaged）・人が見るもの（needs-check）は、検索の側で外す
// （開いた提案がたまっても、新しいおたよりが取得の範囲から押し出されないように）
async function openIssues() {
  const out = [], q = encodeURIComponent(`repo:${REPO} is:issue is:open label:feedback -label:triaged -label:needs-check`);
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(`https://api.github.com/search/issues?q=${q}&sort=created&order=asc&per_page=50&page=${page}`, {
      headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'nishio-go-feedback' },
    });
    if (!r.ok) throw new Error(`GitHub ${r.status} search`);
    const list = (await r.json()).items || [];
    out.push(...list.filter(i => !i.pull_request));
    if (list.length < 50) break;
  }
  return out;
}

async function prepare() {
  fs.mkdirSync(DIR, { recursive: true });
  const items = [], rids = {};
  if (!REPO || !TOKEN) { console.log('FEEDBACK_REPO / FEEDBACK_TOKEN が無いので、なにもしません'); fs.writeFileSync(path.join(DIR, 'items.json'), '[]\n'); return; }
  await ensureLabels();
  const list = known();
  for (const i of await openIssues()) {
    const labels = new Set(i.labels.map(l => l.name));
    if (labels.has('triaged') || labels.has('needs-check')) continue;
    const f = payloadOf(i.body);
    if (!f) { await addLabels(i.number, ['needs-check']); await comment(i.number, '自動では読めない形のおたよりなので、人が見てください。'); continue; }
    if (labels.has('claude-try')) {   // 前の回に Claude にわたしたが、結果が書かれなかった（もう一度はわたさない）
      setStatus(f.rid, 'checking');
      await addLabels(i.number, ['needs-check']);
      await comment(i.number, '自動での確認が終わらなかったので、人が見てください。' + statusMark(f.rid, 'checking'));
      continue;
    }
    const hint = {};
    if (f.kind === 'spot') {
      const k = findKnown(f, list);
      if (k) {
        await comment(i.number, `「${f.name}」は、もうゲームにあります（${k.where}：${k.name}${Number.isFinite(k.lat) ? `・${k.lat}, ${k.lng}` : ''}）。` + statusMark(f.rid, 'already', `「${k.name}」は もうゲームにあります`));
        await addLabels(i.number, ['triaged', 'already']); await close(i.number, 'not_planned');
        setStatus(f.rid, 'already', `「${k.name}」は もうゲームにあります`);
        console.log(`#${i.number} もうある：${k.name}`);
        continue;
      }
      if (f.lat != null) {
        const o = await findOsm(f);
        if (o && SPOT_CATS.has(o.cat)) {
          await comment(i.number, `「${f.name}」は OpenStreetMap にあります（${o.name}・約${o.d}m・${o.url}）。毎週月曜のスポットの作り直し（.github/workflows/bake-spots.yml）で地図に出ます。` + statusMark(f.rid, 'soon', `「${o.name}」は つぎの月曜の更新で地図に出ます`));
          await addLabels(i.number, ['triaged', 'already']); await close(i.number, 'completed');
          setStatus(f.rid, 'soon', `「${o.name}」は つぎの月曜の更新で地図に出ます`);
          console.log(`#${i.number} OSMにある：${o.name}`);
          continue;
        }
        hint.osm = o === null ? '調べられなかった' : o ? { ...o, note: 'OpenStreetMap にあるが、名所の種類ではない（お店など）' } : '見つからなかった';
      }
    }
    if (!AI || items.length >= MAX) continue;   // のこりは次の回に（Claude が使えないあいだは、そのまま待つ）
    items.push({ n: i.number, kind: f.kind, name: f.name || '', text: f.text || '', url: f.url || '', lat: f.lat ?? null, lng: f.lng ?? null, spot: f.spot || null, ...hint });
    rids[i.number] = RID.test(f.rid || '') ? f.rid : '';
  }
  for (const it of items) { await addLabels(it.n, ['claude-try']); setStatus(rids[it.n], 'checking'); }
  fs.writeFileSync(path.join(DIR, 'rids.json'), JSON.stringify(rids) + '\n');   // 受付番号は Claude にわたさない（items.json に入れない）
  fs.writeFileSync(path.join(DIR, 'items.json'), JSON.stringify(items, null, 2) + '\n');
  console.log(`Claude にわたす：${items.length}件`);
}

const LABEL = { fixed: 'fixed', proposal: 'proposal', done: 'already', skip: 'spam' };
async function report() {
  const read = f => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (_) { return null; } };
  const items = read('items.json') || [], results = read('results.json');
  const m = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/(\d+)$/.exec(process.env.REVIEW_URL || '');
  const review = m ? process.env.REVIEW_URL : '', reviewN = m ? Number(m[1]) : 0;   // 公開前の確認の Issue（非公開の置き場）
  const blocked = fs.existsSync(path.join(DIR, 'blocked.txt'));   // 直した内容に おたよりの文・位置が入っていて、公開を止めた
  const rids = read('rids.json') || {};
  if (!REPO || !TOKEN || !items.length) return;
  for (const it of items) {
    const r = Array.isArray(results) ? results.find(x => x && x.n === it.n) : null;
    if (!r || !Object.hasOwn(LABEL, r.action)) continue;   // 結果が無いものは、次の回に「人が見る」にまわる（claude-try）
    let action = r.action, text = String(r.reply || '').slice(0, 3000);
    if (action === 'fixed' && blocked) {
      await comment(it.n, `直した内容に おたよりの文や位置がそのまま入っていたので、公開せずに止めました。人が見てください。\n\n${text}` + statusMark(rids[it.n], 'checking'));
      await addLabels(it.n, ['triaged', 'needs-check']);
      setStatus(rids[it.n], 'checking');
      console.log(`#${it.n} 止めた`);
      continue;
    }
    if (action === 'fixed' && !review) { action = 'proposal'; text += '\n\n（直した内容は確認で取りこめなかったので、提案として残します）'; }
    const head = { fixed: `直しました。公開前の確認を待っています：${review}`, proposal: '提案です。人が決めてください。', done: 'もう対応ずみ／いまのままで問題ありません。', skip: '反映しないおたよりとして閉じます。' }[action];
    // 反映されたら（人が確認して PR にし、マージしたら）voices がゲームで知らせる。そのときに出す文（公開してよいと確かめたもの）を、しるしとして残す
    const pub = action === 'fixed' ? publicText(r.public, it, knownNames()) : '';
    const mark = action === 'fixed' ? `\n\n<!-- nsg-public:${Buffer.from(JSON.stringify({ review: reviewN, text: pub, kind: it.kind })).toString('base64')} -->` : '';
    const st = { fixed: 'checking', proposal: 'proposal', done: 'done', skip: 'skip' }[action];
    await comment(it.n, `${head}\n\n${text}${mark}${statusMark(rids[it.n], st)}`);
    await addLabels(it.n, ['triaged', LABEL[action]]);
    setStatus(rids[it.n], st);
    if (action !== 'proposal') await close(it.n, action === 'fixed' || action === 'done' ? 'completed' : 'not_planned');
    console.log(`#${it.n} ${action}`);
  }
}

// Claude が直してよいファイル（遊びのデータと画面の文。OpenStreetMap などから作るもの・お店のキャンペーンとごほうび・解析・焼いた絵は除く）
const EDITABLE = p => (p === 'nishio-go.html' || /^nishio-go\/[\w-]+\.(js|json|css)$/.test(p)) &&
  !/^nishio-go\/(osm-spots|landmarks|stats|world|landuse|campaigns|rewards|voices)\.json$|^nishio-go\/(analytics|share)\.js$/.test(p);
const git = (...a) => require('child_process').execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...a], { cwd: ROOT, encoding: 'utf8' });   // フックは動かさない
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
// 公開してよいか：おたよりの文の切れはし（そろえた文字で12文字つづけて同じ）と、送った人の位置（丸めた緯度と経度の両方）が入っていないか
// （Claude が指示に反したり、おたよりに操られたりしても、公開の PR に出さないように、ここで決まった手順で止める）
const LEAK_RUN = 12;
function leaks(text, items, run = LEAK_RUN) {
  const t = norm(text), raw = String(text || '');
  for (const it of items) {
    const s = norm(it.text);
    for (let i = 0; i + run <= s.length; i++) if (t.includes(s.slice(i, i + run))) return `#${it.n} の文`;
    const num = v => new RegExp(`(^|[^\\d.])${String(v).replace('.', '\\.')}(?!\\d)`);
    if (it.lat != null && it.lng != null && num(it.lat).test(raw) && num(it.lng).test(raw)) return `#${it.n} の位置`;
  }
  return '';
}
// PR の本文に出す要約：位置のような数・アドレスがあるもの、おたよりの文の切れはしを含むものは出さない
const safePublic = (s, items) => /\d+\.\d{2,}|https?:|www\./i.test(String(s || '')) || leaks(s, items) ? '' : s;
const oneLine = s => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/@/g, '＠').replace(/#(?=\d)/g, '＃').replace(/\s+/g, ' ').trim().slice(0, 200);
// ゲームの公開データ・公開の PR に出す一文（反映のお知らせ）。出さないもの：位置のような数・アドレス・電話番号・メール・郵便番号、
// おたよりの文の切れはし（そろえた文字で8文字つづけて同じ）、名所の名前欄の文字（ゲームの名所に同じ名前があるとき＝出典で確かめて足したときだけ出してよい）
const PII = /0\d{1,4}[-‐ー−－]?\d{1,4}[-‐ー−－]?\d{3,4}|[\w.+-]+[@＠][\w-]+\.|〒|\d{3}[-－]\d{4}/;
const knownNames = () => { try { return new Set(known().flatMap(k => k.names).map(norm).filter(Boolean)); } catch (_) { return new Set(); } };
function publicText(s, f, names) {
  s = oneLine(s);
  if (!s || /\d+\.\d{2,}|https?:|www\./i.test(s) || PII.test(s)) return '';
  const nm = norm(f.name), nameOk = !nm || (f.kind === 'spot' && names && names.has(nm));
  if (!nameOk && nm.length >= 2 && norm(s).includes(nm)) return '';
  if (leaks(s, [{ n: f.n || 0, text: [f.text, nameOk ? '' : f.name].join(' '), lat: f.lat, lng: f.lng }], 8)) return '';
  return s;
}
async function pr() {
  // 直してよい場所の外の変更は、まだ記録していないファイルも消して戻すので、GitHub Actions の使い捨ての作業場所でだけ動かす
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('pr は GitHub Actions の中でだけ動かします（手元のファイルを消さないように）');
  const out = (k, v) => process.env.GITHUB_OUTPUT && fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
  let files = changedFiles();
  for (const c of files.filter(c => !EDITABLE(c.path))) { console.log('直してよい場所の外なので戻す：' + c.path); revert(c); }
  files = changedFiles();
  if (files.some(c => !intact(c.path))) { console.log('こわれたファイルがあるので、ぜんぶ戻す'); files.forEach(revert); files = []; }
  if (!files.length) { console.log('PR にする変更はありません'); return; }
  const items = (() => { try { return JSON.parse(fs.readFileSync(path.join(DIR, 'items.json'), 'utf8')); } catch (_) { return null; } })();
  // 足した行（新しいファイルは中身ぜんぶ）に、おたよりの文・位置がそのまま入っていたら、公開せずに止めて人にまわす
  const added = git('diff', 'HEAD', '-U0', '--no-color').split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).join('\n') + '\n' +
    files.filter(c => c.code === '??').map(c => fs.readFileSync(path.join(ROOT, c.path), 'utf8')).join('\n');
  const leak = Array.isArray(items) ? leaks(added, items) : '確かめるための items.json が読めない';
  if (leak) {
    console.log(`公開できない変更（${leak}）なので、ぜんぶ戻して人にまわす`);
    files.forEach(revert);
    fs.writeFileSync(path.join(DIR, 'blocked.txt'), leak + '\n');
    return;
  }
  const results = (() => { try { return JSON.parse(fs.readFileSync(path.join(DIR, 'results.json'), 'utf8')); } catch (_) { return []; } })();
  const fixed = (Array.isArray(results) ? results : []).filter(r => r && r.action === 'fixed');
  // 公開のリポジトリには まだ出さない（おたよりを読んだ Claude の変更には、決まった手順では見つけられない形で おたよりの中身が入りうる）。
  // 差分は 非公開の置き場の「公開前の確認」Issue に置き、人が中身を確かめて publish を動かしたときだけ PR にする
  if (files.some(c => c.code === '??')) git('add', '-N', '--', ...files.filter(c => c.code === '??').map(c => c.path));
  const patch = git('diff', 'HEAD', '--no-color', '--binary');
  git('reset', '-q');
  const b64 = Buffer.from(patch).toString('base64');
  if (b64.length > 50000) {
    console.log('差分が大きすぎて「公開前の確認」に置けないので、ぜんぶ戻して人にまわす');
    files.forEach(revert);
    fs.writeFileSync(path.join(DIR, 'blocked.txt'), '差分が大きすぎる\n');
    return;
  }
  const prBody = ['プレイヤーからのおたより（非公開の置き場の Issue）を Claude が読んで直した案です。運営者が公開前に中身を確かめました。**遊んで確かめてからマージしてください。**', '',
    ...(fixed.length ? fixed.map(r => `- ${publicText(r.public, items.find(it => it.n === r.n) || { text: items.map(it => it.text).join(' ') }, knownNames()) || '（要約なし）'}`) : ['- （要約なし）']), '',
    '変更してよいのは nishio-go/ の遊びのデータと画面の文だけで、それ以外の変更は自動で取りのぞいています（tools/feedback-triage.js）。',
    'おたよりの文そのもの・送った人の位置は、このPRには書きません。'].join('\n');
  const fence = '~'.repeat(Math.max(4, ...(patch.match(/~{4,}/g) || []).map(x => x.length + 1)));
  const shown = patch.length > 12000 ? patch.slice(0, 12000) + '\n…（長いので ここまで。のこりは 下の しるしに入っています）' : patch;
  const body = [`おたより ${items.map(it => '#' + it.n).join('・')} を Claude が読んで直した案です。**まだ公開していません。**`, '',
    '1. 下の差分に、おたよりの文・名前・位置・連絡先など 公開してはいけないものが（言いかえや ローマ字・数字の形でも）入っていないか確かめる',
    '2. よければ、公開のリポジトリの Actions →「Nishio feedback publish」→ Run workflow で、この Issue の番号を入れて動かす（PR になる。マージは遊んで確かめてから）',
    '3. だめなら、この Issue を閉じる（おたよりは「提案」にもどる）', '',
    `ファイル：${files.map(c => '`' + c.path + '`').join('・')}`, '',
    '<details><summary>PR の本文（公開される文）</summary>', '', fence, prBody, fence, '', '</details>', '',
    fence + 'diff', shown, fence, '',
    `<!-- nsg-patch:${b64} -->`, `<!-- nsg-prbody:${Buffer.from(prBody).toString('base64')} -->`,
    `<!-- nsg-base:${process.env.GITHUB_SHA || git('rev-parse', 'HEAD').trim()} -->`].join('\n');
  files.forEach(revert);   // 作業場所からも消しておく（このあとの voices が main にコミットするときに まざらないように）
  await ensureLabels();
  const issue = await gh('/issues', { method: 'POST', body: JSON.stringify({ title: `公開前の確認：おたよりから直す（${fixed.length}件・run ${process.env.GITHUB_RUN_ID || ''}）`, body: body + FOOT, labels: ['publish-review'] }) });
  console.log(issue.html_url);
  out('url', issue.html_url);
}

// 人が確かめた「公開前の確認」Issue の差分を、公開のリポジトリの PR にする（AI は動かさない。決まった手順だけ）
async function publish() {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('publish は GitHub Actions の中でだけ動かします');
  const n = Number(process.argv[3]);
  if (!Number.isInteger(n) || n <= 0) throw new Error('「公開前の確認」Issue の番号を入れてください');
  const issue = await gh(`/issues/${n}`);
  if (issue.pull_request || issue.state !== 'open' || !(issue.labels || []).some(l => (l.name || l) === 'publish-review')) throw new Error(`#${n} は 開いている「公開前の確認」Issue ではありません`);
  const pick = k => { const m = [...String(issue.body || '').matchAll(new RegExp(`<!-- nsg-${k}:([A-Za-z0-9+/=]+) -->`, 'g'))].pop(); return m ? m[1] : ''; };
  const patch = Buffer.from(pick('patch'), 'base64').toString('utf8'), prBody = Buffer.from(pick('prbody'), 'base64').toString('utf8');
  if (!patch.trim()) throw new Error(`#${n} に差分がありません`);
  // ふつうのファイルの 中身の変更・新しいファイルだけ（消す・名前を変える・実行できるようにする・リンクは しない）
  if (/^(deleted file mode|old mode|new mode|rename from|copy from|similarity index)/m.test(patch) || /^new file mode (?!100644$)/m.test(patch) || /^index [0-9a-f]+\.\.[0-9a-f]+ (?!100644$)/m.test(patch)) throw new Error(`#${n} の差分に、ふつうのファイルの変更でないものがあります`);
  const paths = [...patch.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)];
  if (!paths.length || paths.length !== (patch.match(/^diff --git /gm) || []).length || paths.some(m => m[1] !== m[2] || !EDITABLE(m[2]))) throw new Error(`#${n} の差分に、直してよい場所の外のファイルがあります`);
  const tmp = path.join(require('os').tmpdir(), `feedback-${n}.patch`);
  fs.writeFileSync(tmp, patch);
  try { git('apply', '--check', tmp); } catch (_) { throw new Error(`#${n} の差分が いまの main に当たりません（もう一度 おたよりの仕分けから）`); }
  git('apply', tmp);
  const files = changedFiles();
  if (!files.length || files.some(c => !EDITABLE(c.path) || !intact(c.path))) { files.forEach(revert); throw new Error(`#${n} の差分を当てると、こわれる・直してよい場所の外が かわるので止めます`); }
  const branch = `feedback/review-${n}`;
  git('checkout', '-q', '-b', branch);
  git('add', '--', ...files.map(c => c.path));
  git('-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-q', '-m', 'にしおさんぽGO: おたよりから直す（自動・確認ずみ）');
  git('push', '-q', `https://x-access-token:${process.env.GH_TOKEN}@github.com/${process.env.GITHUB_REPOSITORY}.git`, `HEAD:refs/heads/${branch}`);
  const bodyFile = path.join(require('os').tmpdir(), `feedback-${n}-body.md`);
  fs.writeFileSync(bodyFile, prBody || 'おたよりから直した案です（運営者が公開前に確かめました）。');
  const url = require('child_process').execFileSync('gh', ['pr', 'create', '--base', process.env.GITHUB_REF_NAME || 'main', '--head', branch,
    '--title', 'おたよりから直す（自動・確認ずみ）', '--body-file', bodyFile], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').pop();
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(url)) throw new Error('PR の URL が読めない：' + url);
  await gh(`/issues/${n}/comments`, { method: 'POST', body: JSON.stringify({ body: `PR にしました：${url}\n\n<!-- nsg-pr:${url} -->` + FOOT }) });
  await close(n, 'completed');
  console.log(url);
}

// ---------- ゲームの公開データ（nishio-go/voices.json）----------
// replies：受付番号 → { s, t, d }（いまの様子）。log：みんなの声で かわったこと（新しいじゅん）。counts：反映した数（種類ごと）
const VOICES = 'nishio-go/voices.json';
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
// reacts：ひとこと（チェックインのあとのワンタップ）の1日ぶんの Issue ごとの数 [{ n: Issue の番号, counts: { スポットの id: { love: 3, … } } }]
const REACT_KEYS = new Set(['love', 'photo', 'calm', 'hard', 'access']);
const STATUS_S = new Set(['checking', 'soon', 'already', 'proposal', 'done', 'skip', 'reflected']);   // 返事の 様子（上の setStatus の s）
function applyVoices(v, status, logs, d = today(), reacts = []) {
  v = v && typeof v === 'object' ? v : {};
  v._説明 = 'にしおさんぽGO のプレイヤーの声（おたより）の公開データ。tools/feedback-triage.js voices が作る。replies は受付番号（端末で作った でたらめな番号）ごとの いまの様子、log は反映されたこと。おたよりの文・送った人の位置は入れない';
  v.replies = v.replies || {}; v.log = Array.isArray(v.log) ? v.log : []; v.counts = v.counts || {};
  let changed = false;
  for (let [rid, x] of Object.entries(status)) {
    const was = v.replies[rid];
    if (!RID.test(rid) || !x || !STATUS_S.has(x.s) || (was && was.s === 'reflected' && x.s !== 'reflected')) continue;   // 反映ずみを戻さない。知らない様子は入れない
    x = { s: x.s, t: String(x.t || '').slice(0, 120) };   // 公開する 短い文は 120字まで（setStatus と同じ）
    if (was && was.s === x.s && (was.t || '') === (x.t || '')) continue;   // 同じ返事は書きなおさない（毎回コミットしないように）
    v.replies[rid] = { s: x.s, ...(x.t ? { t: x.t } : {}), d }; changed = true;
  }
  for (const l of logs) {   // 同じ Issue の反映は1回だけ（id：i＋Issue の番号）
    if (l.id && v.log.some(x => x.id === l.id)) continue;
    v.log.unshift({ ...(l.id ? { id: l.id } : {}), d, kind: l.kind, text: l.text }); v.counts[l.kind] = (v.counts[l.kind] || 0) + 1; changed = true;
  }
  v.log = v.log.slice(0, 200);
  v.reactions = v.reactions || {}; v.reactedIssues = Array.isArray(v.reactedIssues) ? v.reactedIssues : [];
  for (const x of reacts) {   // 同じ日の Issue は1回だけ数える（counted のラベルが付かなくても二重にならない）
    if (v.reactedIssues.includes(x.n)) continue;
    for (const [id, c] of Object.entries(x.counts)) {
      const o = v.reactions[id] = v.reactions[id] || {};
      for (const [k, n] of Object.entries(c)) if (REACT_KEYS.has(k)) o[k] = (o[k] || 0) + n;
    }
    v.reactedIssues.push(x.n); changed = true;
  }
  v.reactedIssues = v.reactedIssues.slice(-500);
  const old = new Date(Date.now() + 9 * 3600e3 - 120 * 86400e3).toISOString().slice(0, 10);
  for (const [rid, x] of Object.entries(v.replies)) if (!(x.d >= old)) { delete v.replies[rid]; changed = true; }   // 120日より前の返事は消す
  if (changed || !v.updated) v.updated = d;
  return v;
}

async function searchIssues(q) {
  const out = [];
  for (let page = 1; page <= 5; page++) {
    const r = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=50&page=${page}`, {
      headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'nishio-go-feedback' },
    });
    if (!r.ok) throw new Error(`GitHub ${r.status} search`);
    const list = (await r.json()).items || [];
    out.push(...list);
    if (list.length < 50) break;
  }
  return out;
}
const comments = n => gh(`/issues/${n}/comments?per_page=100`);
async function allComments(n) {
  const out = [];
  for (let page = 1; page <= 60; page++) {
    const list = await gh(`/issues/${n}/comments?per_page=100&page=${page}`);
    out.push(...list);
    if (list.length < 100) break;
  }
  return out;
}
// 終わった日（日本時間のきのうまで）の ひとこと の Issue を数える
async function reactionsToCount() {
  const out = [], d = today();
  for (const i of await searchIssues(`repo:${REPO} is:issue label:reactions -label:counted`)) {
    const m = /^\[ひとこと\] (\d{4}-\d{2}-\d{2})$/.exec(i.title || '');
    if (!m || m[1] >= d) continue;   // きょうの分は、まだ ふえるので あした数える
    const counts = {};
    for (const c of await allComments(i.number)) {
      const k = /<!-- nsg-react:([A-Za-z0-9+/=]+) -->/.exec(c.body || '');
      if (!k) continue;
      let x; try { x = JSON.parse(Buffer.from(k[1], 'base64').toString('utf8')); } catch (_) { continue; }
      if (!x || typeof x.spot !== 'string' || !/^[\w-]{1,60}$/.test(x.spot) || !REACT_KEYS.has(x.r)) continue;
      const o = counts[x.spot] = counts[x.spot] || {};
      o[x.r] = (o[x.r] || 0) + 1;
    }
    out.push({ n: i.number, counts });
  }
  return out;
}

// 反映されたもの：fixed（自動で作った PR）のうち、人がマージしたもの。reflected（運営が手で反映し「公開: …」とコメントしたもの）
async function announcements() {
  const status = {}, logs = [], done = [], names = knownNames();   // names：いまの main のゲームの名所（voices が main を取ってから呼ぶ）
  for (const i of await searchIssues(`repo:${REPO} is:issue label:feedback -label:announced label:fixed`)) {
    const f = payloadOf(i.body) || {};
    const m = (await comments(i.number)).map(c => /<!-- nsg-public:([A-Za-z0-9+/=]+) -->/.exec(c.body || '')).filter(Boolean).pop();
    if (!m) continue;
    let info; try { info = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')); } catch (_) { continue; }
    if (!info.pr && Number.isInteger(info.review) && info.review > 0) {   // 公開前の確認の Issue から、人が作った PR をさがす
      const rv = await gh(`/issues/${info.review}`).catch(() => null);
      const pm = rv && (await comments(info.review)).map(c => /<!-- nsg-pr:(https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+) -->/.exec(c.body || '')).filter(Boolean).pop();
      if (pm) info.pr = pm[1];
      else if (rv && rv.state === 'closed') {   // 公開しないと決めた（PR にせずに閉じた）
        if (RID.test(f.rid || '')) status[f.rid] = { s: 'proposal' };
        done.push(i.number);
        continue;
      } else continue;   // まだ 確認を待っている
    }
    const pm = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)$/.exec(info.pr || '');
    if (!pm) continue;
    const p = await fetch(`https://api.github.com/repos/${pm[1]}/pulls/${pm[2]}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'nishio-go-feedback', ...(process.env.GH_TOKEN ? { Authorization: 'Bearer ' + process.env.GH_TOKEN } : {}) } }).then(r => (r.ok ? r.json() : null));
    if (!p || p.state !== 'closed') continue;   // まだマージを待っている
    if (p.merged_at) {
      const text = publicText(info.text, { ...f, n: i.number }, names) || 'おたよりをもとに、ゲームを直しました';
      if (RID.test(f.rid || '')) status[f.rid] = { s: 'reflected', t: text };
      logs.push({ id: 'i' + i.number, kind: f.kind || info.kind || 'idea', text });
    } else if (RID.test(f.rid || '')) status[f.rid] = { s: 'proposal' };   // PR を閉じた（運営の判断へ）
    done.push(i.number);
  }
  for (const i of await searchIssues(`repo:${REPO} is:issue label:feedback -label:announced label:reflected`)) {
    const f = payloadOf(i.body) || {};
    const c = (await comments(i.number)).map(c => /^公開[:：]\s*(.+)$/m.exec(c.body || '')).filter(Boolean).pop();
    if (!c) continue;   // 「公開: みんなに見せる一文」のコメントが付くまで待つ
    const text = publicText(c[1], { ...f, n: i.number }, names);
    if (!text) continue;
    if (RID.test(f.rid || '')) status[f.rid] = { s: 'reflected', t: text };
    logs.push({ id: 'i' + i.number, kind: f.kind || 'idea', text });
    done.push(i.number);
  }
  return { status, logs, done };
}

async function voices() {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('voices は GitHub Actions の中でだけ動かします（main にコミットするので）');
  if (!REPO || !TOKEN) return;
  const base = process.env.GITHUB_REF_NAME || 'main', pub = `https://github.com/${process.env.GITHUB_REPOSITORY}.git`;
  const checkoutMain = () => { git('fetch', '-q', pub, base); git('checkout', '-q', '-f', '-B', 'voices-update', 'FETCH_HEAD'); };
  checkoutMain();   // いまの main（人がマージした名所も入っている）で確かめる
  const a = await announcements();
  // まだ公開データに入っていない（told の無い）Issue の、いちばん新しい返事のしるし（nsg-status）から返事を作りなおす。
  // 前の回の push が失敗していても、何日たっていても、返事が消えないように。入れたら told を付ける
  const rebuilt = {}, toldNow = [];
  for (const i of await searchIssues(`repo:${REPO} is:issue label:feedback -label:told`)) {
    const m = (await comments(i.number)).map(c => /<!-- nsg-status:([A-Za-z0-9+/=]+) -->/.exec(c.body || '')).filter(Boolean).pop();
    toldNow.push(i.number);
    if (!m) continue;
    try { const x = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')); if (RID.test(x.rid || '')) rebuilt[x.rid] = { s: x.s, t: x.t || '' }; } catch (_) { /* よめない しるし */ }
  }
  const status = { ...rebuilt, ...readJson('status.json', {}), ...a.status };
  const reacts = await reactionsToCount();
  if (!Object.keys(status).length && !a.logs.length && !reacts.length) { for (const n of toldNow) await addLabels(n, ['told']); console.log('ゲームに知らせることはありません'); return; }
  for (let tries = 1; ; tries++) {
    if (tries > 1) checkoutMain();
    const f = path.join(ROOT, VOICES);
    const v = applyVoices(fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null, status, a.logs, today(), reacts);
    fs.writeFileSync(f, JSON.stringify(v, null, 1) + '\n');
    const page = require('./make-minna.js').write();   // 公開ページ「みんなで見つけた西尾」も作りなおす
    git('add', VOICES, page);
    if (!git('status', '--porcelain', VOICES, page).trim()) break;
    git('-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-q', '-m', 'にしおさんぽGO: プレイヤーの声の返事と反映を更新（自動）');
    try { git('push', '-q', `https://x-access-token:${process.env.GH_TOKEN}@github.com/${process.env.GITHUB_REPOSITORY}.git`, `HEAD:refs/heads/${base}`); break; }
    catch (e) { if (tries >= 3) throw e; console.log('main が先に進んだので、もう一度'); }
  }
  for (const n of a.done) await addLabels(n, ['announced']);
  for (const n of toldNow) await addLabels(n, ['told']);   // main に入った（か、もう入っていた）返事
  for (const x of reacts) { await addLabels(x.n, ['counted']); await close(x.n, 'completed'); }   // 数えた ひとこと の日
  console.log(`返事 ${Object.keys(status).length}件・反映 ${a.logs.length}件・ひとこと ${reacts.length}日ぶん`);
}

if (require.main === module) {
  const run = { prepare, report, pr, publish, voices }[process.argv[2]];
  if (!run) { console.error('使いかた：node tools/feedback-triage.js prepare|report|pr|publish <番号>|voices'); process.exit(2); }
  run().catch(e => { console.error(e.message); process.exit(1); });
}
module.exports = { payloadOf, sameName, norm, findKnown, known, EDITABLE, leaks, safePublic, publicText, applyVoices, announcements, reactionsToCount, searchIssues, gh, dist, prepare, report, voices };
