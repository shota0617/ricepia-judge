// にしおさんぽGO：版（だれがつくったゲームという設定か）
// ・ふだんは「お店の版」：西尾のお米屋さん 近藤米穀店・らいすぴあ がつくったゲーム（当店が名所・特典・キャンペーンに出る）
// ・nishio-go.html?ed=city で開くと「西尾市版（提案用デモ）」：西尾市が、まちを知ってもらうためにつくった観光のゲーム、と仮定した設定。
//   西尾市に見てもらうための試作で、西尾市の公式ではない。まぎらわしくないよう、画面の上に「提案用デモ」の札をいつも出し、市章などは使わない
//   お店の要素（当店の2店舗とその店員さん・当店に寄るクエスト・特典・キャンペーン・当店HPのボタン）を外し、市役所に観光担当の職員さんを置く
// ・記録（ポイント・めぐった所・行き先など）は版ごとに別（game.js の stateKey）。えらんだ版は localStorage（nsg_edition）に残る。?ed=shop か、せってい の「お店の版にもどす」で戻る
// npcs.js・events.js のあと、game.js の前に読み込む（人と行事の中身を、版に合わせて書きかえる）
(() => {
  'use strict';
  const EDITIONS = {
    shop: { id: 'shop', shops: true },
    city: {
      id: 'city', shops: false,
      tag: '🏛 西尾市版（提案用デモ）',
      title: 'にしおさんぽGO｜西尾市版（提案用デモ）',
      by: '<b>西尾市</b>が、歩いてまちを知ってもらうためにつくったお散歩ゲーム──と仮定した<b>提案用のデモ</b>です。西尾市の公式のものではありません（試作：西尾のお米屋さん 近藤米穀店・らいすぴあ）。',
      credit: '企画（想定）：西尾市／試作・運営：近藤米穀店 らいすぴあ（西尾市）。この版は提案用のデモで、西尾市の公式のものではありません',
      share: '西尾市のお散歩ゲーム（提案用デモ。西尾市の公式ではありません）',
    },
  };
  let id = 'shop';
  try {
    const q = new URLSearchParams(location.search).get('ed');
    if (q === 'city' || q === 'shop') localStorage.setItem('nsg_edition', q);
    if (localStorage.getItem('nsg_edition') === 'city') id = 'city';
  } catch (e) { if (/[?&]ed=city\b/.test(location.search)) id = 'city'; }
  const ED = globalThis.NSG_EDITION = EDITIONS[id];
  if (ED.shops) return;

  // 当店の2店舗にいる店員さんを外し、ほかの人の「すすめる人」からも外す
  const SHOP_SPOTS = new Set(['ricepia', 'kondo-beikoku']);
  const npcs = (window.NISHIO_NPCS || []).filter(n => !SHOP_SPOTS.has(n.spot));
  // 市役所の観光担当の職員さん（話すのは、ほかの人や areas.json・events.js と同じ、出典のある事実だけ）
  npcs.unshift({ id: 'city-staff', spot: 'nishio-cityhall', off: [-25, -20], look: 'guide', name: '市役所の観光担当の職員さん',
    lines: ['ようこそ、西尾市役所へ。わたしは観光の担当だよ。にしおさんぽGOで、西尾のまちをのんびり歩いてみてね。',
      '西尾市は2011年（平成23年）4月に、一色町・吉良町・幡豆町といっしょになって、いまの西尾市になったんだよ。',
      '西尾は抹茶のもとになる「てん茶」の産地。海のほうへ行けば一色のうなぎ、一色港から船で佐久島へも渡れるよ。'],
    refer: [['castle-guide', 'まずは西尾城跡へ行ってみりん。観光ボランティアガイドさんが、丑寅櫓の話をしてくれるよ。'],
      ['sakana-okami', 'うなぎのことは、一色さかな広場のおかみさんにきいてみりん。']] });
  const ids = new Set(npcs.map(n => n.id));
  for (const n of npcs) if (Array.isArray(n.refer)) n.refer = n.refer.filter(([to]) => ids.has(to));
  window.NISHIO_NPCS = npcs;
  // 行事の会場の書き方から「当店」を外す
  const list = (window.NISHIO_EVENTS && window.NISHIO_EVENTS.list) || [];
  for (const e of list) {
    if (typeof e.place === 'string') e.place = e.place.replace(/（当店[^）]*）/g, '');
    if (SHOP_SPOTS.has(e.spot)) delete e.spot;   // 会場が当店の行事は、地図に会場がないので、クエストや行き先にしない
  }

  // 画面：上に「提案用デモ」の札、つくった人の書き方、当店HPのボタンとお店の版のプレイ画面を外す
  document.title = ED.title;
  document.body.classList.add('ed-city');
  const tag = document.createElement('div');
  tag.className = 'ed-tag'; tag.textContent = ED.tag; tag.setAttribute('role', 'note');
  document.body.appendChild(tag);
  const by = document.querySelector('#intro .by'), cr = document.getElementById('creditOp'), home = document.querySelector('.home-btn');
  if (by) by.innerHTML = ED.by;
  if (cr) cr.textContent = ED.credit;
  if (home) home.hidden = true;
  const shots = document.querySelector('#intro .intro-shots');   // はじめの画面のプレイ画面は、お店の版の画面（当店の札・とくてん）が写っているので出さない
  if (shots) shots.remove();
  const box = document.getElementById('edBox'), back = document.getElementById('edShop');
  if (box) box.hidden = false;
  if (back) back.addEventListener('click', () => {
    try { localStorage.setItem('nsg_edition', 'shop'); } catch (e) { /* 残せなくても、?ed= をはずして開きなおせば戻る */ }
    location.href = location.pathname;
  });
})();
