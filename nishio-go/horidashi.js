// お米つぶの ほりだし：一色・幡豆の 海べで 止まって じっと して いると（約3秒）、お米が 砂を ほりはじめ（砂が ぱっぱっと とぶ）、
// 干潟の 貝を ほり当てる。ほり当てた 貝が 砂から ぴょこっと 顔を 出し、お米が ひと言。7秒ごとに つぎの 貝を ほる。動くか ねむりだす（12秒）と 消える（行動：止まった 主人公が 干潟を ほる）
// （pixel.js の horidashiStep。これまでの 名物の 絵を 出す 話す・ひとりごと・ついてくる・のせる・夢・出会い・こぼす・食べる・おてだま・かさ・めぐり・つんつん・かげえ・ねどこ・場所に つかる ゆあみ とは ちがい、
//  干潟の 砂を お米が 自分で ほって、生きものを「ほり当てる」。吉良の 海べは ゆあみ〈ワイキキビーチ〉が あるので ここでは 出さない）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・id：絵の 名前（pixel.js の CRITTER_ROWS と そろえる）。town：その 町名の 所だけ（町名の 正規表現）。say：ほり当てた とき お米が 言う ことば（みじかく。かざりの 絵文字は つけない）
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 調べた 中身だけ（干潟の アサリ・ヤマトシジミ・ウミニナ。そこに ない 数字・名前・やりかたは 書かない）
(function (root) {
  const MLIT = 'https://www.mlit.go.jp/river/basic_info/jigyo_keikaku/gaiyou/seibi/pdf/yahagigawa-5.pdf';
  const LIST = [
    { id: 'asari', name: 'アサリ', town: '^(一色町|東幡豆町|西幡豆町)', say: 'ほったら アサリが 出てきたに', src: MLIT },
    { id: 'shijimi', name: 'ヤマトシジミ', town: '^一色町', say: 'ヤマトシジミが 出てきた', src: MLIT },
    { id: 'uminina', name: 'ウミニナ', town: '^一色町', say: 'ウミニナが おったに', src: MLIT },
  ];
  const STILL = 3;      // じっと して から ほりはじめるまでの 秒（ねむる 12秒より 前）
  const DIG = 2800;     // ほりはじめて から 貝が 顔を 出すまで
  const CYCLE = 7000;   // 1つ ほって つぎの 貝に かわるまで
  // いる 所：{ city, town, near（まわり 100m メッシュの 土地利用の 文字を まとめた 文字列） }
  // 西尾市の 一色・幡豆の 海べ（まわりに 海水域）で、いる 町に 合う 貝を 1つ えらぶ。last＝まえの id（なるべく ちがう ものを）、rand＝0〜1の 乱数。なければ null
  function pick(c, last, rand) {
    if (!c || !/西尾/.test(c.city || '') || !(c.near || '').includes('k')) return null;
    const mine = LIST.filter(x => new RegExp(x.town).test(c.town || ''));
    if (!mine.length) return null;
    const other = mine.filter(x => x.id !== last), from = other.length ? other : mine;
    return from[Math.min(from.length - 1, Math.floor((rand ? rand() : Math.random()) * from.length))];
  }
  root.NISHIO_HORIDASHI = { LIST, STILL, DIG, CYCLE, pick };
})(window);
