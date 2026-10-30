// お米つぶの まんげきょう：三河工芸ガラス美術館の そばで 止まって じっと して いると（約3秒）、お米の うしろが ガラス工芸の ひとこまに なる。
// ガラス工芸美術館 → 巨大な 万華鏡 → 万華鏡を のぞく、の 場面が 7秒ごとに かわり、かわるたび お米が ひと言。
// 動くか ねむりだす（12秒）と 消える（行動：止まった 主人公が 巨大万華鏡の きらきらを のぞきこむ）
// （pixel.js の mangekyoStep。巨大万華鏡は これまで 話〈komebanashi〉にしか 無く、お米の そばで きらきらが 見える 場面が 無かった。
//  町名では なく「三河工芸ガラス美術館の すぐ そば」という 場所に 止まった ときだけ 出る。ちゃせきより 先に 出る）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・id：場面の 名前。say：場面に なった とき お米が 言う ことば（みじかく。かざりの 絵文字は つけない）
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 5 の 中身だけ（三河ガラス工芸美術館の 巨大な 万華鏡。そこに ない 数字・名前・場所の 説明は 書かない）
(function (root) {
  const NK = 'https://nishiokanko.com/tw/specialty/';
  const PLACE = 'ガラス美術館';   // 注目スポット（spots.json）の 名前に ふくむ ことば
  const R = 150;
  const LIST = [
    { id: 'bijutsu', name: 'ガラス工芸美術館', say: '三河ガラス工芸美術館だに。ガラスが きらきら しとるに', src: NK },
    { id: 'kyodai', name: '巨大な 万華鏡', say: '巨大な 万華鏡が あるに。くるくる 模様が かわるに', src: NK },
    { id: 'nozoku', name: '万華鏡を のぞく', say: 'のぞいたら お米が いっぱい 見えたに', src: NK },
  ];
  const STILL = 3;       // じっと して から 出るまでの 秒（ねむる 12秒より 前）
  const CYCLE = 7000;    // 1つの 場面の 長さ
  // spots：[{ name, lat, lng }]（注目スポット）。いる 所（lat, lng）の まわり R メートルに ガラス美術館が あるか
  function near(spots, lat, lng) {
    const kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540;
    return (spots || []).some(s => (s.name || '').includes(PLACE) && Math.hypot((s.lng - lng) * kx, (s.lat - lat) * ky) <= R);
  }
  // いる 所：{ city, near（near の 結果） }
  // 西尾市の ガラス美術館の そばで 場面を 1つ えらぶ。last＝まえの id（なるべく ちがう ものを）、rand＝0〜1の 乱数。なければ null
  function pick(c, last, rand) {
    if (!c || !/西尾/.test(c.city || '') || !c.near) return null;
    const other = LIST.filter(x => x.id !== last), from = other.length ? other : LIST;
    return from[Math.min(from.length - 1, Math.floor((rand ? rand() : Math.random()) * from.length))];
  }
  root.NISHIO_MANGEKYO = { LIST, PLACE, R, STILL, CYCLE, near, pick };
})(window);
