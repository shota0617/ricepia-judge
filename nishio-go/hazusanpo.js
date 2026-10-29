// お米つぶの はずさんぽ：幡豆の 町なか（海べでは ない 所）で 止まって じっと して いると（約3秒）、お米の うしろが 幡豆の ひとこまに なる。
// 三ヶ根山の 山並み → 三ヶ根山の スカイライン → 花きの 産地の カーネーション → あじさいと ひまわり畑、の 4つが 7秒ごとに かわり、
// かわるたび お米が ひと言。動くか ねむりだす（12秒）と 消える（行動：止まった 主人公が 幡豆の 山と 花の 景色の 中に おさまる）
// （pixel.js の hazusanpo Step。これまでの 幡豆は カーネーションを 出す 名物の 絵と、海べの ほりだし だけで、
//  海では ない 幡豆の 町なかで 止まって 遊ぶ 場面が 無かった）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・id：場面の 名前。say：場面に なった とき お米が 言う ことば（みじかく。かざりの 絵文字は つけない）
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 7 の 中身だけ（三ヶ根山は 幡豆地区の 山並み・スカイライン・カーネーションは 花きの 産地・あじさい・ひまわり畑。そこに ない 数字・名前・月は 書かない）
(function (root) {
  const NK = 'https://nishiokanko.com/tw/specialty/', CITY = 'https://www.city.nishio.aichi.jp/shisei/shokai/1003109.html';
  const TOWN = '^(東幡豆町|西幡豆町)';   // 幡豆の 町
  const LIST = [
    { id: 'yamanami', name: '三ヶ根山の 山並み', say: '三ヶ根山の 山並みだに。幡豆の 景色だに', src: CITY },
    { id: 'skyline', name: '三ヶ根山 スカイライン', say: '三ヶ根山には スカイラインが あるに', src: CITY },
    { id: 'carnation', name: 'カーネーション', say: 'カーネーションだに。西尾は 花きの 産地だに', src: NK },
    { id: 'hana', name: 'あじさいと ひまわり畑', say: 'あじさいも ひまわり畑も 西尾の 花の 景色だに', src: NK },
  ];
  const STILL = 3;       // じっと して から 出るまでの 秒（ねむる 12秒より 前）
  const CYCLE = 7000;    // 1つの 場面の 長さ
  // いる 所：{ city, town, near（まわり 100m メッシュの 土地利用の 文字を まとめた 文字列。海水域＝'k'） }
  // 西尾市の 幡豆の 町なか（まわりに 海水域が ない 所。海べは ほりだしが 先）で 場面を 1つ えらぶ。last＝まえの id（なるべく ちがう ものを）、rand＝0〜1の 乱数。なければ null
  function pick(c, last, rand) {
    if (!c || !/西尾/.test(c.city || '') || !new RegExp(TOWN).test(c.town || '') || (c.near || '').includes('k')) return null;
    const other = LIST.filter(x => x.id !== last), from = other.length ? other : LIST;
    return from[Math.min(from.length - 1, Math.floor((rand ? rand() : Math.random()) * from.length))];
  }
  root.NISHIO_HAZUSANPO = { LIST, TOWN, STILL, CYCLE, pick };
})(window);
