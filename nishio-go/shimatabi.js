// お米つぶの しまたび：佐久島で 止まって じっと して いると（約3秒）、お米の まわりが 島の ひとこまに なる。
// アート作品の 台座に のって 作品みたいに ポーズ → 黒壁の 集落を せなかに ひとやすみ → 一色港からの 高速船が 海を 横ぎる、の 3つが 7秒ごとに かわり、
// かわるたび お米が ひと言。動くか ねむりだす（12秒）と 消える（行動：止まった 主人公が 島の けしきの 中に おさまる）
// （pixel.js の shimatabiStep。これまでの 名物の 絵を 出す 話す・ひとりごと・ついてくる・のせる・夢・出会い・こぼす・食べる・おてだま・かさ・めぐり・つんつん・かげえ・ねどこ、
//  吉良の ゆあみ、干潟の ほりだし、西尾地区の ちゃせき とは ちがい、これまで 何も なかった 佐久島で、島の けしきそのものを お米の 背景に する）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・id：場面の 名前。town：その 町名の 所だけ（町名の 正規表現）。say：場面に なった とき お米が 言う ことば（みじかく。かざりの 絵文字は つけない）
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 調べた 中身だけ（佐久島：三河湾最大の島・一色港から 高速船で 約20分・アート作品が 点在・黒壁の 集落景観。そこに ない 数字・名前は 書かない）
(function (root) {
  const AN = 'https://aichinow.pref.aichi.jp/modelcourse/detail/122/';
  const SAKU = '^一色町佐久島';
  const LIST = [
    { id: 'art', name: 'アート作品', town: SAKU, say: '作品みたいに なったよ。佐久島は アートの 島だね', src: AN },
    { id: 'kurokabe', name: '黒壁の 集落', town: SAKU, say: '黒壁の 集落に とけこんだよ。島の 景色が 作品みたいだね', src: AN },
    { id: 'fune', name: '高速船', town: SAKU, say: '一色港から 船で 約20分だよ。三河湾で いちばん 大きい 島なんだ', src: AN },
  ];
  const STILL = 3;       // じっと して から 出るまでの 秒（ねむる 12秒より 前）
  const CYCLE = 7000;    // 1つの 場面の 長さ
  // いる 所：{ city, town }。西尾市の 佐久島で 場面を 1つ えらぶ。last＝まえの id（なるべく ちがう ものを）、rand＝0〜1の 乱数。なければ null
  function pick(c, last, rand) {
    if (!c || !/西尾/.test(c.city || '')) return null;
    const mine = LIST.filter(x => new RegExp(x.town).test(c.town || ''));
    if (!mine.length) return null;
    const other = mine.filter(x => x.id !== last), from = other.length ? other : mine;
    return from[Math.min(from.length - 1, Math.floor((rand ? rand() : Math.random()) * from.length))];
  }
  root.NISHIO_SHIMATABI = { LIST, STILL, CYCLE, pick };
})(window);
