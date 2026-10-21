// にしおさんぽGO：公開ページ「みんなで見つけた西尾」（nishio-go/minna.html）を作る
// ・西尾ってこんなまち：areas.json（西尾市の5つの地区。出典つき）と meibutsu.js（西尾の名物。出典つき）から
// ・みんなの声で ふえた名所：spots.json のふつうのスポットのうち、おたよりから足したもの（id が fb- で始まる。src に出典）
// ・みんなの声で かわったこと：voices.json の log（おたよりの文・送った人の位置は入っていない）
// 検索や SNS から西尾を知ってもらう入口にするため、ゲームを開かなくても読める静的な HTML にする。
// tools/feedback-triage.js voices が voices.json といっしょに作りなおす。手で作るとき：node tools/make-minna.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CAT = { shrine: '⛩️ 神社', temple: '🪷 お寺', historic: '📜 史跡', castle: '🏯 城跡', museum: '🏛 資料館・美術館', park: '🌳 公園', view: '🌅 ながめのよい所', sight: '📍 名所', art: '🎨 アート', beach: '🏖 海岸' };
const KIND = { spot: '📍 名所', fun: '🎉 もっと面白く', fix: '✏️ まちがい', idea: '😣 使いやすく' };
const GAME = '../nishio-go.html';

function meibutsu() {
  const src = read('nishio-go/meibutsu.js'), box = { window: {} };
  vm.runInNewContext(src, box);
  const sources = (src.match(/^\/\/\s+・.+$/gm) || []).map(l => l.replace(/^\/\/\s+・/, '').trim());   // 先頭のコメントの出典の行（URL の無い市の資料もある）
  return { list: (box.window.NISHIO_MEIBUTSU || []).filter(m => !m.area), sources };   // area があるのは となりの市町の名物（八丁味噌など）なので外す
}

function build() {
  const areas = JSON.parse(read('nishio-go/areas.json')).areas.filter(a => !a.near);
  const spots = JSON.parse(read('nishio-go/spots.json')).spots.filter(s => s.normal && /^fb-/.test(s.id || ''));
  let v = {};
  try { v = JSON.parse(read('nishio-go/voices.json')); } catch (_) { /* まだ無い */ }
  const log = (Array.isArray(v.log) ? v.log : []).slice(0, 50), c = v.counts || {};
  const mb = meibutsu();
  const counts = [c.spot && `名所 ${c.spot}か所`, c.fix && `直したこと ${c.fix}件`, c.fun && `新しい遊び ${c.fun}つ`, c.idea && `使いやすく ${c.idea}件`].filter(Boolean).join('・');
  const updated = v.updated || '';
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>みんなで見つけた西尾｜にしおさんぽGO</title>
<meta name="description" content="西尾市（愛知県）を歩くお散歩ゲーム「にしおさんぽGO」のプレイヤーが教えてくれた西尾の名所と、みんなの声でよくなったこと。抹茶とうなぎのまち・西尾の5つの地区も紹介します。"/>
<meta name="theme-color" content="#2f5d3a"/>
<link rel="canonical" href="https://go.ricepia.jp/nishio-go/minna.html"/>
<meta property="og:type" content="website"/>
<meta property="og:title" content="みんなで見つけた西尾｜にしおさんぽGO"/>
<meta property="og:description" content="プレイヤーの声で ふえていく、西尾の名所。"/>
<meta property="og:url" content="https://go.ricepia.jp/nishio-go/minna.html"/>
<meta property="og:image" content="https://go.ricepia.jp/nishio-go/ogp.png"/>
<meta name="twitter:card" content="summary_large_image"/>
<style>
  :root { --green: #2f5d3a; --ink: #1f2a22; --sub: #5d6b60; --bg: #f6f4ec; --card: #fff; --line: #e3e0d3; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif; line-height: 1.8; }
  header { background: var(--green); color: #fff; padding: 14px 16px; }
  header a { color: #fff; }
  main { max-width: 760px; margin: 0 auto; padding: 16px 16px 48px; }
  h1 { font-size: 24px; margin: 8px 0 4px; }
  h2 { font-size: 18px; margin: 32px 0 10px; padding-left: 10px; border-left: 4px solid var(--green); }
  p, li { font-size: 15px; }
  .lead { color: var(--sub); margin: 0 0 12px; }
  .count { display: inline-block; font-weight: 700; color: #1f5a25; background: #eaf6e2; border-radius: 8px; padding: 4px 10px; }
  .grid { display: grid; gap: 10px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 16px; }
  .card b { font-size: 16px; }
  .card small { display: block; color: var(--sub); font-size: 13px; }
  ul.log { list-style: none; padding: 0; margin: 0; }
  ul.log li { padding: 8px 0; border-top: 1px solid var(--line); }
  ul.log li:first-child { border-top: 0; }
  .cta { display: block; text-align: center; background: var(--green); color: #fff; font-weight: 700; font-size: 17px; border-radius: 14px; padding: 14px; margin: 24px 0; text-decoration: none; }
  .note { color: var(--sub); font-size: 13px; }
  a { color: #1d5fb8; overflow-wrap: anywhere; }
</style>
</head>
<body>
<header><a href="${GAME}?utm_source=minna">← にしおさんぽGO であそぶ</a></header>
<main>
  <h1>みんなで見つけた西尾</h1>
  <p class="lead">愛知県西尾市を歩くお散歩ゲーム「にしおさんぽGO」は、あそぶ人の声でそだつゲームです。プレイヤーが教えてくれた名所や、みんなの声でよくなったことを紹介します。</p>
  ${counts ? `<p class="count">みんなの声で：${esc(counts)}</p>` : ''}

  <h2>西尾ってこんなまち</h2>
  <div class="grid">
${mb.list.map(m => `    <div class="card"><b>${esc(m.icon)} ${esc(m.name)}</b><br/>${esc(m.note)}</div>`).join('\n')}
  </div>
  <p class="note">名物の出典：${mb.sources.map(t => esc(t).replace(/https?:\/\/[^\s）)&]+/g, u => `<a href="${u}" rel="noopener" target="_blank">${u.replace(/^https?:\/\//, '')}</a>`)).join('／')}</p>
  <div class="grid">
${areas.map(a => `    <div class="card"><b>${esc(a.icon)} ${esc(a.name)}（${esc(a.catch)}）</b><br/>${esc(a.summary)}
      <small>出典：${(a.sources || []).map((u, i) => `<a href="${esc(u)}" rel="noopener" target="_blank">${i + 1}</a>`).join(' ')}</small></div>`).join('\n')}
  </div>

  <h2>みんなの声で ふえた名所</h2>
${spots.length ? `  <div class="grid">
${spots.map(s => `    <div class="card"><b>${esc(s.name)}</b> <small>${esc(CAT[s.cat] || '📍 名所')}</small>
      <small><a href="${GAME}?spot=n-${encodeURIComponent(s.id)}&amp;utm_source=minna">ゲームの地図で見る</a>${s.src ? `・<a href="${esc(s.src)}" rel="noopener" target="_blank">出典</a>` : ''}</small></div>`).join('\n')}
  </div>` : '  <p>まだありません。あなたが知っている西尾の名所を、ゲームの「📮 こえ」から教えてください。</p>'}

  <h2>みんなの声で かわったこと</h2>
${log.length ? `  <ul class="log">
${log.map(l => `    <li>${esc(KIND[l.kind] || '📮')} ${esc(l.text)} <small class="note">${esc(String(l.d || '').replace(/-/g, '/'))}</small></li>`).join('\n')}
  </ul>` : '  <p>まだありません。最初のひとりになりませんか？</p>'}

  <a class="cta" href="${GAME}?utm_source=minna&amp;utm_medium=page">にしおさんぽGO で西尾を歩く</a>
  <p class="note">名所は、OpenStreetMap・Wikipedia・Wikidata・西尾市のウェブサイトなどの出典で たしかめてから足しています。このページは にしおさんぽGO（運営：近藤米穀店 らいすぴあ）のもので、西尾市の公式のページではありません。${updated ? `更新：${esc(updated.replace(/-/g, '/'))}` : ''}</p>
</main>
</body>
</html>
`;
}

function write() {
  const f = path.join(ROOT, 'nishio-go/minna.html'), html = build();
  if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== html) fs.writeFileSync(f, html);
  return 'nishio-go/minna.html';
}

if (require.main === module) console.log(write());
module.exports = { build, write };
