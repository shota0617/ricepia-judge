// お米つぶの いっしきさんぽ：一色の 町なかで 止まって じっと して いると（約3秒）、お米の うしろが 一色の ひとこまに なる。
// えびせんべいを 焼く 体験 → うなぎは 全国の 約2割 → 養鰻は 明治27年から → さかな広場、の 4つが 7秒ごとに かわり、
// かわるたび お米が ひと言。動くか ねむりだす（12秒）と 消える（行動：止まった 主人公が 一色の 港町の 暮らしの 中に おさまる）
// （pixel.js の isshikiStep。これまでの 名物の 絵を 出す 話す・ひとりごと・ついてくる・のせる・夢・出会い・こぼす・食べる・おてだま・かさ・めぐり・つんつん・かげえ・ねどこ、
//  吉良の ゆあみ、干潟の ほりだし、西尾地区の ちゃせき、佐久島の しまたび とは ちがい、海べでも 島でも ない 一色の 町なかに、これまで 止まって 遊ぶ 場面が 無かった）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・id：場面の 名前。say：場面に なった とき お米が 言う ことば（みじかく。かざりの 絵文字は つけない）
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 調べた 中身だけ（一色：うなぎは 全国生産の 約2割・養鰻は 明治27年〈1894年〉から・三河一色さかな広場／さかな村・えびせんべい焼き体験。そこに ない 数字・名前は 書かない）
(function (root) {
  const NK = 'https://nishiokanko.com/tw/specialty/', CITY = 'https://www.city.nishio.aichi.jp/shisei/shokai/1003109.html';
  const TOWN = '^一色町(?!佐久島)';   // 一色の 町（佐久島は しまたびが あるので のぞく）
  const LIST = [
    { id: 'ebisen', name: 'えびせんべい焼き', say: 'えびせんべいを 焼く 体験だに。一色は えびせんべいの まちだに', src: NK },
    { id: 'unagi2', name: 'うなぎ 約2割', say: '一色の うなぎは 全国の 約2割だに', src: CITY },
    { id: 'yoman', name: '養鰻', say: '一色の 養鰻は 明治27年から だに', src: CITY },
    { id: 'sakana', name: 'さかな広場', say: '三河一色さかな広場と さかな村は 一色の 顔だに', src: NK },
  ];
  const STILL = 3;       // じっと して から 出るまでの 秒（ねむる 12秒より 前）
  const CYCLE = 7000;    // 1つの 場面の 長さ
  // いる 所：{ city, town, near（まわり 100m メッシュの 土地利用の 文字を まとめた 文字列。海水域＝'k'） }
  // 西尾市の 一色の 町なか（佐久島の 外で、まわりに 海水域が ない 所。海べは ほりだしが 先）で 場面を 1つ えらぶ。last＝まえの id（なるべく ちがう ものを）、rand＝0〜1の 乱数。なければ null
  function pick(c, last, rand) {
    if (!c || !/西尾/.test(c.city || '') || !new RegExp(TOWN).test(c.town || '') || (c.near || '').includes('k')) return null;
    const other = LIST.filter(x => x.id !== last), from = other.length ? other : LIST;
    return from[Math.min(from.length - 1, Math.floor((rand ? rand() : Math.random()) * from.length))];
  }
  root.NISHIO_ISSHIKI = { LIST, STILL, CYCLE, pick };
})(window);
