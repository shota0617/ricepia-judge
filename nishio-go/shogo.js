// 地区の称号と、めぐった数で ふえる かおりちゃんの ひとこと。眺めるだけ・読むだけ（ポイント・収集・袋・行き先選び・道すじには かかわらない）。
// 記録は 作らない：S.visits と 地区ごとの 集計（areaProgress）から 毎回 計算する。絵は 新しく 作らず 絵文字だけ。三河弁のみ。
(function (root) {
  // 称号の 対象は 西尾の 5 地区だけ（となりの市町は 対象外）
  const TITLES = {
    nishio: { icon: '🏯', name: '西尾めぐり名人' },
    isshiki: { icon: '🦐', name: '一色めぐり名人' },
    kira: { icon: '🌾', name: '吉良めぐり名人' },
    hazu: { icon: '🌸', name: '幡豆めぐり名人' },
    sakushima: { icon: '⛴️', name: '佐久島めぐり名人' },
  };
  // p は areaProgress の { total, done }。注目スポットが 0 件、または まだ そろっていなければ null
  function title(id, p) {
    const t = Object.prototype.hasOwnProperty.call(TITLES, id) ? TITLES[id] : null;
    if (!t || !p || !(p.total > 0) || !(p.done >= p.total)) return null;
    return t;
  }
  // めぐった 名所の 数の 段階：0=まだ／1=はじめて／2=10か所／3=30か所／4=50か所／5=西尾の 5地区ぜんぶ そろった
  function tier(visits, allDone) {
    const n = Number.isFinite(visits) ? visits : 0;
    if (allDone && n >= 1) return 5;
    return n >= 50 ? 4 : n >= 30 ? 3 : n >= 10 ? 2 : n >= 1 ? 1 : 0;
  }
  const SAY = [
    '',
    'はじめての名所、行けたねぇ。この調子で ぼちぼち めぐりりん',
    '10か所もめぐったん！ だいぶ 西尾に くわしなったなも',
    '30か所とは えらいなぁ。西尾の人みたいだがん',
    '50か所も！ もう 西尾の 名所は おまかせだら',
    '西尾の 5つの地区、ぜんぶ めぐれたねぇ。ほんとに 名人だがん',
  ];
  const say = t => SAY[t] || '';
  root.NISHIO_SHOGO = { TITLES, title, tier, say };
})(typeof window !== 'undefined' ? window : globalThis);
