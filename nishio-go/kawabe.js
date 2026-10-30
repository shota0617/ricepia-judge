// お米つぶの かわべさんぽ：西尾市の 川・池・用水の そば（海べでは ない 所）で 止まって じっと して いると（約3秒）、お米の うしろが 水べの ひとこまに なる。
// 矢作川が 三河湾へ 注ぐ → メダカ → アカザと イチモンジタナゴ → ミサゴ → ニホンイシガメ、の 5つが 7秒ごとに かわり、
// かわるたび お米が ひと言。動くか ねむりだす（12秒）と 消える（行動：止まった 主人公が 矢作川と 田んぼの 水べの 生きものの 景色の 中に おさまる）
// （pixel.js の kawabeStep。これまでの 水べの 生きものは 転がって いる 最中に 前に 現れる であい と、海べの 砂を ほる ほりだし だけで、
//  川・池・用水の そばで 止まって 遊ぶ 場面が 無かった。あさだけ 出る かわぎりとも ちがい、1日中 出る）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・id：場面の 名前（pixel.js の kawabeStep の 絵と そろえる）。say：場面に なった とき お米が 言う ことば（みじかく。かざりの 絵文字は つけない）
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 6 の 中身だけ（矢作川は 西尾市で 三河湾に 注ぐ・メダカは 絶滅危惧II類・イチモンジタナゴ・アカザ・ミサゴ・ニホンイシガメは 水田や 畑を 餌場・産卵場に 使う。そこに ない 数字・名前・月は 書かない）
(function (root) {
  const MLIT = 'https://www.mlit.go.jp/river/basic_info/jigyo_keikaku/gaiyou/seibi/pdf/yahagigawa-5.pdf', WIKI = 'https://ja.wikipedia.org/wiki/%E7%9F%A2%E7%B0%AF%E5%B7%9D';
  const LIST = [
    { id: 'yahagi', name: '矢作川が 三河湾へ', say: '矢作川は 西尾で 三河湾に 注ぐんだよ', src: WIKI },
    { id: 'medaka', name: 'メダカ', say: 'メダカが およいどるよ。絶滅危惧II類の さかなだよ', src: MLIT },
    { id: 'uo', name: 'アカザと イチモンジタナゴ', say: 'アカザや イチモンジタナゴが 矢作川に おるよ', src: MLIT },
    { id: 'misago', name: 'ミサゴ', say: 'ミサゴが 空から 見とるよ', src: MLIT },
    { id: 'ishigame', name: 'ニホンイシガメ', say: 'ニホンイシガメは 水田や 畑を えさ場や 産卵場に するよ', src: MLIT },
  ];
  const STILL = 3;       // じっと して から 出るまでの 秒（ねむる 12秒より 前）
  const CYCLE = 7000;    // 1つの 場面の 長さ
  // いる 所：{ city, land（土地利用の 1文字。川・池＝'i'）, near（まわり 100m メッシュの 土地利用の 文字を まとめた 文字列。海水域＝'k'） }
  // 西尾市の 川・池・用水の そば（まわりに 海水域が ない 所。海べは ほりだしが 先）で 場面を 1つ えらぶ。last＝まえの id（なるべく ちがう ものを）、rand＝0〜1の 乱数。なければ null
  function pick(c, last, rand) {
    if (!c || !/西尾/.test(c.city || '')) return null;
    const near = c.near || '';
    if ((c.land !== 'i' && !near.includes('i')) || near.includes('k')) return null;
    const other = LIST.filter(x => x.id !== last), from = other.length ? other : LIST;
    return from[Math.min(from.length - 1, Math.floor((rand ? rand() : Math.random()) * from.length))];
  }
  root.NISHIO_KAWABE = { LIST, STILL, CYCLE, pick };
})(window);
