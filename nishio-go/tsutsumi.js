// お米つぶの つつみづくり：吉良の 田んぼで 止まって じっと して いると（約3秒）、お米の うしろで 領民に まじって 土を はこび、堤を 築きはじめる。
// 堤が 少しずつ 高く なって 「長さ180m・高さ4m」の 黄金堤が できあがり、つづけて 田の 稲穂が 金色に かわる。そのつど お米が ひと言。
// 動くか ねむりだす（12秒）と 消える。ひと通り おわったら 動くまで くりかえさない（行動：黄金堤の いわれを お米が 自分で 再現する）
// （pixel.js の tsutsumiStep。これまでの 名物の 絵を 出す 話す・ひとりごと・ついてくる・のせる・夢・出会い・こぼす・食べる・おてだま・かさ・めぐり・つんつん・かげえ・ねどこ、
//  吉良温泉に つかる ゆあみ、干潟の ほりだし、抹茶の ちゃせき、佐久島の しまたび とは ちがい、吉良の 田んぼに 黄金堤を 築く 物語の 場面そのもの）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・id：場面の 名前。town：その 町名の 所だけ（町名の 正規表現）。where：'paddy'＝いる 所が 田んぼの ときだけ
// ・say：築きはじめの ひと言／done：できあがりの ひと言／gold：稲穂が 金色に なった ときの ひと言（みじかく。かざりの 絵文字は つけない）
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 調べた 中身だけ（黄金堤：貞享3年（1686年）吉良義央が 私財を 投じて 領民と 一夜で 築いたと 伝わる・長さ180m・高さ4m・
//   その後 水害が なくなり 金色の 稲穂が 田を 彩った。そこに ない 数字・名前は 書かない）
(function (root) {
  const MAFF = 'https://www.maff.go.jp/j/nousin/sekkei/museum/m_kakuti/27_kogane/index.html';
  const LIST = [
    { id: 'kogane', name: '黄金堤', town: '^吉良町', where: 'paddy', say: '領民と いっしょに 一夜で 堤を 築くに',
      done: '長さ180m、高さ4mの 黄金堤が できたに', gold: '水害が なくなって 稲穂が 金色に なったに', src: MAFF },
  ];
  const STILL = 3;       // じっと して から 出るまでの 秒（ねむる 12秒より 前）
  const BUILD = 4200;    // 堤を 築く 長さ
  const GOLD = 3000;     // できあがってから 稲穂が 金色に かわるまで
  const HOLD = 3500;     // 金色に なってから 消えるまで
  // いる 所：{ city, town, land（いる 所の 土地利用 1文字。田＝'a'） }。西尾市の 吉良の 田んぼで 1つ えらぶ。なければ null
  function pick(c) {
    if (!c || !/西尾/.test(c.city || '')) return null;
    const mine = LIST.filter(x => new RegExp(x.town).test(c.town || '') && (x.where !== 'paddy' || c.land === 'a'));
    return mine.length ? mine[0] : null;
  }
  root.NISHIO_TSUTSUMI = { LIST, STILL, BUILD, GOLD, HOLD, pick };
})(window);
