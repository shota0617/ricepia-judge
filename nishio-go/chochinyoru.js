// お米つぶの ちょうちんよる：夜（19時〜5時前）に 一色の 町なかで 止まって じっと して いると（約3秒）、お米の うしろに 提灯の あかりが ともる。
// 大提灯に あかりが ともる → 提灯が 一列に ならんで ゆれる → 大きな 提灯を 見あげる、の 3つが 7秒ごとに かわり、
// かわるたび お米が ひと言。動くか ねむりだす（12秒）と 消える（行動：夜の 一色で 止まった 主人公が 巨大な 提灯の 祭りの 町に おさまる）
// （pixel.js の chochinyoruStep。昼の 一色の いっしきさんぽ〈えびせん・うなぎ・養鰻・さかな広場〉とは ちがい、夜だけ 出る 提灯の 場面。夜に 提灯が お米の まわりを まわる めぐり とも ちがい、
//  提灯が 景色に なる。夜の 一色では いっしきさんぽ・めぐりの 輪に 先んじる）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・id：場面の 名前。say：場面に なった とき お米が 言う ことば（みじかく。かざりの 絵文字は つけない）
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 調べた 中身だけ（一色：一色大提灯まつりは 巨大な 提灯で 知られる 祭り。開く 日・数は ブリーフに 無いので 書かない）
(function (root) {
  const NK = 'https://nishiokanko.com/tw/specialty/';
  const TOWN = '^一色町(?!佐久島)';   // 一色の 町（佐久島は しまたびが あるので のぞく）
  const LIST = [
    { id: 'tomoru', name: '大提灯の あかり', say: '提灯に あかりが ともったよ。一色は 大提灯まつりの まちだね', src: NK },
    { id: 'narabu', name: '提灯の れつ', say: '提灯が ずらっと ならんだよ。ゆらゆら きれいじゃん', src: NK },
    { id: 'miage', name: '大提灯を 見あげる', say: '巨大な 提灯だよ。見あげても 見あげても 大きいね', src: NK },
  ];
  const STILL = 3;       // じっと して から 出るまでの 秒（ねむる 12秒より 前）
  const CYCLE = 7000;    // 1つの 場面の 長さ
  // いる 所：{ city, town, night（夜＝true）, near（まわり 100m メッシュの 土地利用の 文字を まとめた 文字列。海水域＝'k'） }
  // 夜の 西尾市の 一色の 町なか（佐久島の 外で、まわりに 海水域が ない 所。海べは ほりだしが 先）で 場面を 1つ えらぶ。last＝まえの id（なるべく ちがう ものを）、rand＝0〜1の 乱数。なければ null
  function pick(c, last, rand) {
    if (!c || !c.night || !/西尾/.test(c.city || '') || !new RegExp(TOWN).test(c.town || '') || (c.near || '').includes('k')) return null;
    const other = LIST.filter(x => x.id !== last), from = other.length ? other : LIST;
    return from[Math.min(from.length - 1, Math.floor((rand ? rand() : Math.random()) * from.length))];
  }
  root.NISHIO_CHOCHINYORU = { LIST, STILL, CYCLE, pick };
})(window);
