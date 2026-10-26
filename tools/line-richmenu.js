// LINE 公式アカウント（らいすぴあぶろぐ）の リッチメニューの 絵を、Messaging API で 差しかえる：
//   node tools/line-richmenu.js [画像＝mkt/nishio-go/richmenu-2500x1686.png] [--apply] [--keep-game-link] [--rollback <richMenuId> [--from <richMenuId>]]
// ・いま 既定に なっている メニューを 読み、大きさ・名前・メニューバーの 文字・タップ範囲と アクションを そのまま 写した 新しい メニューを 作って、
//   新しい 絵を 載せ、既定に する（Messaging API では 作った メニューの 絵を あとから 変えられないので、作りなおす）。
//   左上の マス（ゲーム）の アクションは ricepia.jp の ゲームの 欄（にしおさんぽGO の お知らせ。#nishio-go）の リンク（docs/ads-game-kit.md 2章の utm つき）に する。
//   ゲームの 説明と 写真を 見てから 遊べる（運営者の 指示 2026-10-26）。--keep-game-link なら 前のまま。
//   切りかえ用の 別名（alias）が 前の メニューを さして いれば、新しい メニューに 付けかえる。前の メニューは 消さない（--rollback で もどせる）
// ・--apply が ない ときは 読んで 確かめるだけ（何も 変えない）。ログには トークンを 出さない（公開リポジトリの Actions の ログは だれでも 見られる）
// ・ひとりずつ 別の メニューを つないで いる 友だちには、既定の メニューは 出ない（LINE の しくみ）
// 環境変数：LINE_CHANNEL_ACCESS_TOKEN（GitHub の Secrets。チャットには 書かない）
'use strict';
const fs = require('fs'), path = require('path');

const API = process.env.LINE_API_BASE || 'https://api.line.me/v2/bot', DATA = process.env.LINE_DATA_BASE || 'https://api-data.line.me/v2/bot';   // 宛先を かえるのは にせの サーバーで 確かめる ときだけ
const GAME_URL = 'https://ricepia.jp/?utm_source=line&utm_medium=richmenu&utm_campaign=game#nishio-go';   // ricepia.jp の にしおさんぽGO の 欄（その 中の「遊ぶ」から go.ricepia.jp へ）
const args = process.argv.slice(2);
const APPLY = args.includes('--apply'), KEEP = args.includes('--keep-game-link');
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] || '' : ''; };
const ROLLBACK = opt('--rollback'), FROM = opt('--from');   // FROM：別名を はがす 元（ふつうは いまの 既定。差しかえが 途中で 止まった ときは その ログの とおりに）
const IMAGE = path.resolve(args.find((a, i) => !a.startsWith('--') && !['--rollback', '--from'].includes(args[i - 1])) || 'mkt/nishio-go/richmenu-2500x1686.png');
const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

// 絵に 描いた マス（tools/make-promo.js の richMenu() の tileBox の 位置。x0, y0, x1, y1）。
// 前の メニューの タップ範囲は、それぞれ 1つの マスを ぜんぶ ふくみ、ほかの マスに かからない こと（すきまの 白い ところで 区切る）。そうで なければ 止まる
const TILES = [
  ['お米ころころ（左上）', 35, 21, 806, 815],
  ['店舗・営業時間（左下）', 35, 846, 806, 1650],
  ['新米 販売中（中央）', 844, 21, 1654, 1650],
  ['価格表PDF（右上）', 1694, 21, 2463, 815],
  ['常連さまポイント（右下）', 1694, 846, 2463, 1650],
];
const GAME_TILE = TILES[0];

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

async function defaultMenu() {   // いまの 既定の メニュー（ない ときは ''）
  try { return (await call('GET', `${API}/user/all/richmenu`)).richMenuId || ''; } catch (e) { if (/→ 404/.test(e.message)) return ''; throw e; }
}
async function aliasesOf(id) {   // その メニューを さす 別名。一覧を 読めない ときは 止まる
  return ((await call('GET', `${API}/richmenu/alias/list`)).aliases || []).filter(x => x.richMenuId === id);
}

const show = a => {
  const b = a.bounds, act = a.action || {};
  const what = act.type === 'uri' ? act.uri : act.type === 'message' ? `メッセージ「${act.text}」` : act.type === 'postback' ? `postback ${act.data}` : act.type === 'richmenuswitch' ? `切りかえ → ${act.richMenuAliasId}` : act.type;
  return `x ${b.x}〜${b.x + b.width}・y ${b.y}〜${b.y + b.height}　${act.type}${act.label ? `「${act.label}」` : ''}　${what}`;
};

(async () => {
  if (!TOKEN) { console.log('LINE_CHANNEL_ACCESS_TOKEN が ありません（GitHub の Settings → Secrets and variables → Actions に 入れる。チャットには 書かない）'); process.exit(1); }

  if (ROLLBACK) {   // 前の メニューに もどす：差しかえで 付けかえた 別名（FROM か いまの 既定を さす もの）と、既定を もどす
    // 別名を 先に、既定を あとに もどす。とちゅうで 失敗しても 既定は まだ FROM の ままなので、同じ ように 動かせば のこりを やりなおせる
    const m = await call('GET', `${API}/richmenu/${ROLLBACK}`);
    console.log(`もどす 先：${m.name}（${ROLLBACK}）`);
    const now = await defaultMenu(), from = FROM || now;
    const back = from && from !== ROLLBACK ? await aliasesOf(from) : [];
    if (back.length) console.log(`${from} を さす 別名：${back.map(x => x.richMenuAliasId).join(', ')}（もどす 先に 付けかえる）`);
    if (now !== ROLLBACK) console.log(`既定：${now || 'なし'} → ${ROLLBACK}`); else console.log('既定は もう もどす 先です');
    if (!APPLY) { console.log('確かめるだけ（--apply で もどす）'); return; }
    for (const x of back) { await call('POST', `${API}/richmenu/alias/${x.richMenuAliasId}`, { richMenuId: ROLLBACK }); console.log(`別名 ${x.richMenuAliasId} を もどしました`); }
    if (now !== ROLLBACK) { await call('POST', `${API}/user/all/richmenu/${ROLLBACK}`); console.log('既定の メニューを もどしました'); }
    return;
  }

  const img = fs.readFileSync(IMAGE), [w, h] = pngSize(img);
  console.log(`新しい 絵：${path.relative(process.cwd(), IMAGE)}（${w}×${h}・${Math.round(img.length / 1024)}KB）`);
  if (img.length > 1024 * 1024) throw new Error('絵が 1MB を こえて いる（LINE の 上限）');

  const cur = await defaultMenu();
  if (!cur) throw new Error('既定の リッチメニューが ありません（LINE Official Account Manager で 作った メニューは API から 見えない。今まで API で 差しかえていた なら、その メニューを 既定に して から）');
  const old = await call('GET', `${API}/richmenu/${cur}`);
  console.log(`いまの 既定：${old.name}（${cur}）　${old.size.width}×${old.size.height}　メニューバー「${old.chatBarText}」　マス ${old.areas.length}`);
  for (const a of old.areas) console.log(`  ${show(a)}`);
  // 前の メニューが ちがう 大きさ（1280×863 など）で 作られて いても、縦横の 比が 同じ なら、タップ範囲を 絵の 大きさに 広げて 新しい メニューを 作る
  const sx = w / old.size.width, sy = h / old.size.height;
  if (Math.abs(sx / sy - 1) > 0.01) throw new Error(`絵の 大きさ ${w}×${h} と メニューの ${old.size.width}×${old.size.height} の 縦横の 比が ちがう`);
  const scale = (v, k, max) => Math.min(max, Math.round(v * k));
  const scaled = old.areas.map(a => {   // 左上と 右下の かどを それぞれ 広げる（となりの マスと すきまも 重なりも できない）
    const { x, y, width, height } = a.bounds, x0 = scale(x, sx, w), y0 = scale(y, sy, h), x1 = scale(x + width, sx, w), y1 = scale(y + height, sy, h);
    return { ...a, bounds: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } };
  });
  if (sx !== 1 || sy !== 1) { console.log(`タップ範囲を ${w}×${h} に 広げます（×${sx.toFixed(4)}・×${sy.toFixed(4)}）`); for (const a of scaled) console.log(`  ${show(a)}`); }

  // 前の タップ範囲が 絵の マスと 合って いるか：どの タップ範囲も、ちょうど 1つの マスを ぜんぶ ふくみ、ほかの マスには かからない。どの マスも ちょうど 1つの タップ範囲に
  const box = a => [a.bounds.x, a.bounds.y, a.bounds.x + a.bounds.width, a.bounds.y + a.bounds.height];
  const covers = ([ax0, ay0, ax1, ay1], [, x0, y0, x1, y1]) => ax0 <= x0 && ay0 <= y0 && ax1 >= x1 && ay1 >= y1;
  const touches = ([ax0, ay0, ax1, ay1], [, x0, y0, x1, y1]) => ax0 < x1 && ax1 > x0 && ay0 < y1 && ay1 > y0;
  const bad = [], tileOf = new Map();
  for (const a of scaled) {
    const b = box(a), own = TILES.filter(t => covers(b, t)), hit = TILES.filter(t => touches(b, t));
    if (own.length !== 1 || hit.length !== 1) bad.push(`${show(a)}：${own.length !== 1 ? `ふくむ マスが ${own.length} こ` : ''}${hit.length !== 1 ? ` かかる マス ${hit.map(t => t[0]).join('・') || 'なし'}` : ''}`);
    else tileOf.set(a, own[0]);
  }
  for (const t of TILES) { const n = [...tileOf.values()].filter(x => x === t).length; if (n !== 1) bad.push(`${t[0]}：タップ範囲が ${n} こ`); }
  if (bad.length) throw new Error(`いまの タップ範囲が 新しい 絵の マスと 合いません（何も 変えて いません）：\n  ${bad.join('\n  ')}`);

  const areas = scaled.map(a => KEEP || tileOf.get(a) !== GAME_TILE ? a : { bounds: a.bounds, action: { type: 'uri', label: 'お米ころころ', uri: GAME_URL } });
  const menu = { size: { width: w, height: h }, selected: old.selected, name: `${old.name.replace(/（\d{4}-\d{2}-\d{2}）$/, '')}（${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)}）`.slice(0, 300), chatBarText: old.chatBarText, areas };
  console.log(`新しい メニュー：${menu.name}`);
  for (const a of areas) console.log(`  ${show(a)}`);
  await call('POST', `${API}/richmenu/validate`, menu);
  console.log('LINE の 確認（validate）：ok');

  const aliases = await aliasesOf(cur);   // 読めなければ ここで 止まる（別名だけ 前の メニューに のこるのを ふせぐ）
  if (aliases.length) console.log(`前の メニューを さす 別名：${aliases.map(x => x.richMenuAliasId).join(', ')}（新しい メニューに 付けかえる）`);

  if (!APPLY) { console.log('確かめるだけでした（何も 変えて いません）。差しかえるなら apply を つけて もう一度'); return; }

  const id = (await call('POST', `${API}/richmenu`, menu)).richMenuId;
  console.log(`作りました：${id}`);
  try {
    await call('POST', `${DATA}/richmenu/${id}/content`, img, 'image/png');
    console.log('絵を 載せました');
    await call('POST', `${API}/user/all/richmenu/${id}`);
    console.log('既定の メニューに しました');
    for (const x of aliases) { await call('POST', `${API}/richmenu/alias/${x.richMenuAliasId}`, { richMenuId: id }); console.log(`別名 ${x.richMenuAliasId} を 付けかえました`); }
  } catch (e) {   // とちゅうで 止まった：どこまで 変わったかに かかわらず、この 2つで 前の 状態に もどせる
    throw new Error(`${e.message}\n  とちゅうで 止まりました。もどす ときは rollback に ${cur}、rollback_from に ${id} を 入れて 動かす`);
  }
  console.log(`もどす ときは：rollback に ${cur} を 入れて 動かす（前の メニューは 消して いません）`);
})().catch(e => { console.error(`できませんでした：${e.message}`); process.exit(1); });
