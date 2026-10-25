// LINE 公式アカウント（らいすぴあぶろぐ）の リッチメニューの 絵を、Messaging API で 差しかえる：
//   node tools/line-richmenu.js [画像＝mkt/nishio-go/richmenu-2500x1686.png] [--apply] [--keep-game-link] [--rollback <richMenuId>]
// ・いま 既定に なっている メニューを 読み、大きさ・名前・メニューバーの 文字・タップ範囲と アクションを そのまま 写した 新しい メニューを 作って、
//   新しい 絵を 載せ、既定に する（Messaging API では 作った メニューの 絵を あとから 変えられないので、作りなおす）。
//   左上の マス（ゲーム）の アクションは go.ricepia.jp の リンク（docs/ads-game-kit.md 2章の utm つき）に する。--keep-game-link なら 前のまま。
//   切りかえ用の 別名（alias）が 前の メニューを さして いれば、新しい メニューに 付けかえる。前の メニューは 消さない（--rollback で もどせる）
// ・--apply が ない ときは 読んで 確かめるだけ（何も 変えない）。ログには トークンを 出さない（公開リポジトリの Actions の ログは だれでも 見られる）
// ・ひとりずつ 別の メニューを つないで いる 友だちには、既定の メニューは 出ない（LINE の しくみ）
// 環境変数：LINE_CHANNEL_ACCESS_TOKEN（GitHub の Secrets。チャットには 書かない）
'use strict';
const fs = require('fs'), path = require('path');

const API = process.env.LINE_API_BASE || 'https://api.line.me/v2/bot', DATA = process.env.LINE_DATA_BASE || 'https://api-data.line.me/v2/bot';   // 宛先を かえるのは にせの サーバーで 確かめる ときだけ
const GAME_URL = 'https://go.ricepia.jp/?utm_source=line&utm_medium=richmenu&utm_campaign=game';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply'), KEEP = args.includes('--keep-game-link');
const rb = args.indexOf('--rollback'), ROLLBACK = rb >= 0 ? args[rb + 1] : '';
const IMAGE = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--rollback') || 'mkt/nishio-go/richmenu-2500x1686.png');
const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

// 絵の マス（tools/make-promo.js の richMenu() と docs/ads-game-kit.md 5章）。前の メニューの タップ範囲が これと ずれて いたら 止まる
const TILES = [
  ['お米ころころ（左上）', 0, 0, 825, 830],
  ['店舗・営業時間（左下）', 0, 830, 825, 1686],
  ['新米 販売中（中央）', 825, 0, 1674, 1686],
  ['価格表PDF（右上）', 1674, 0, 2500, 830],
  ['常連さまポイント（右下）', 1674, 830, 2500, 1686],
];

async function call(method, url, body, type = 'application/json') {
  const r = await fetch(url, { method, headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { 'Content-Type': type } : {}) }, body: body && type === 'application/json' ? JSON.stringify(body) : body });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${url.replace(/^https:\/\/[^/]+/, '')} → ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

function pngSize(buf) {   // PNG の 頭（IHDR）から 幅と 高さ
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG では ない');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

const show = a => {
  const b = a.bounds, act = a.action || {};
  const what = act.type === 'uri' ? act.uri : act.type === 'message' ? `メッセージ「${act.text}」` : act.type === 'postback' ? `postback ${act.data}` : act.type === 'richmenuswitch' ? `切りかえ → ${act.richMenuAliasId}` : act.type;
  return `x ${b.x}〜${b.x + b.width}・y ${b.y}〜${b.y + b.height}　${act.type}${act.label ? `「${act.label}」` : ''}　${what}`;
};

(async () => {
  if (!TOKEN) { console.log('LINE_CHANNEL_ACCESS_TOKEN が ありません（GitHub の Settings → Secrets and variables → Actions に 入れる。チャットには 書かない）'); process.exit(1); }

  if (ROLLBACK) {   // 前の メニューに もどす
    const m = await call('GET', `${API}/richmenu/${ROLLBACK}`);
    console.log(`もどす 先：${m.name}（${ROLLBACK}）`);
    if (!APPLY) { console.log('確かめるだけ（--apply で もどす）'); return; }
    await call('POST', `${API}/user/all/richmenu/${ROLLBACK}`);
    console.log('既定の メニューを もどしました');
    return;
  }

  const img = fs.readFileSync(IMAGE), [w, h] = pngSize(img);
  console.log(`新しい 絵：${path.relative(process.cwd(), IMAGE)}（${w}×${h}・${Math.round(img.length / 1024)}KB）`);
  if (img.length > 1024 * 1024) throw new Error('絵が 1MB を こえて いる（LINE の 上限）');

  let cur;
  try { cur = (await call('GET', `${API}/user/all/richmenu`)).richMenuId; } catch (e) { if (!/→ 404/.test(e.message)) throw e; }
  if (!cur) throw new Error('既定の リッチメニューが ありません（LINE Official Account Manager で 作った メニューは API から 見えない。今まで API で 差しかえていた なら、その メニューを 既定に して から）');
  const old = await call('GET', `${API}/richmenu/${cur}`);
  console.log(`いまの 既定：${old.name}（${cur}）　${old.size.width}×${old.size.height}　メニューバー「${old.chatBarText}」　マス ${old.areas.length}`);
  for (const a of old.areas) console.log(`  ${show(a)}`);
  if (old.size.width !== w || old.size.height !== h) throw new Error(`絵の 大きさ ${w}×${h} が メニューの ${old.size.width}×${old.size.height} と ちがう`);

  // 前の タップ範囲が 絵の マスと 合って いるか（どの マスにも、まん中が その マスに 入る 範囲が 1つ）
  const center = a => [a.bounds.x + a.bounds.width / 2, a.bounds.y + a.bounds.height / 2];
  const bad = [];
  for (const [name, x0, y0, x1, y1] of TILES) {
    const hit = old.areas.filter(a => { const [cx, cy] = center(a); return cx >= x0 && cx < x1 && cy >= y0 && cy < y1; });
    if (hit.length !== 1) bad.push(`${name}：タップ範囲が ${hit.length} こ`);
  }
  if (old.areas.length !== TILES.length) bad.push(`タップ範囲の 数が ${old.areas.length}（絵の マスは ${TILES.length}）`);
  if (bad.length) throw new Error(`いまの タップ範囲が 新しい 絵の マスと 合いません：\n  ${bad.join('\n  ')}`);

  const areas = old.areas.map(a => {
    const [cx, cy] = center(a);
    if (KEEP || !(cx < 825 && cy < 830)) return a;
    return { bounds: a.bounds, action: { type: 'uri', label: 'お米ころころ', uri: GAME_URL } };
  });
  const menu = { size: old.size, selected: old.selected, name: `${old.name.replace(/（\d{4}-\d{2}-\d{2}）$/, '')}（${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)}）`.slice(0, 300), chatBarText: old.chatBarText, areas };
  console.log(`新しい メニュー：${menu.name}`);
  for (const a of areas) console.log(`  ${show(a)}`);
  await call('POST', `${API}/richmenu/validate`, menu);
  console.log('LINE の 確認（validate）：ok');

  let aliases = [];
  try { aliases = ((await call('GET', `${API}/richmenu/alias/list`)).aliases || []).filter(x => x.richMenuId === cur); } catch (e) { console.log(`別名の 一覧を 読めませんでした（${e.message}）`); }
  if (aliases.length) console.log(`前の メニューを さす 別名：${aliases.map(x => x.richMenuAliasId).join(', ')}（新しい メニューに 付けかえる）`);

  if (!APPLY) { console.log('確かめるだけでした（何も 変えて いません）。差しかえるなら apply を つけて もう一度'); return; }

  const id = (await call('POST', `${API}/richmenu`, menu)).richMenuId;
  console.log(`作りました：${id}`);
  await call('POST', `${DATA}/richmenu/${id}/content`, img, 'image/png');
  console.log('絵を 載せました');
  await call('POST', `${API}/user/all/richmenu/${id}`);
  console.log('既定の メニューに しました');
  for (const x of aliases) { await call('POST', `${API}/richmenu/alias/${x.richMenuAliasId}`, { richMenuId: id }); console.log(`別名 ${x.richMenuAliasId} を 付けかえました`); }
  console.log(`もどす ときは：rollback に ${cur} を 入れて 動かす（前の メニューは 消して いません）`);
})().catch(e => { console.error(`できませんでした：${e.message}`); process.exit(1); });
