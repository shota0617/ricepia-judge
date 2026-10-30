// お米つぶの トンボロさんぽ：トンボロ干潟の そばで 止まって じっと して いると（約3秒）、お米の うしろが 干潟の ひとこまに なる。
// 満ちた 海 → 潮が 引いて 海の 道が あらわれる → トンボロ現象 → 干潟の 生きもの、の 場面が 7秒ごとに かわり、かわるたび お米が ひと言。
// 動くか ねむりだす（12秒）と 消える（行動：止まった 主人公が 潮の 満ち引きと 海の 道を ながめる）
// （pixel.js の tombolo Step。トンボロは これまで 話〈komebanashi〉と 人の 話にしか 無く、お米の そばに 干潟の 景色が 出る 場面が 無かった。
//  町名では なく「トンボロ干潟の すぐ そば」という 場所に 止まった ときだけ 出る。海べの ほりだしより 先に 出る）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・id：場面の 名前。say：場面に なった とき お米が 言う ことば（みじかく。かざりの 絵文字は つけない）
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 3 と 6 の 中身だけ（トンボロ現象〈干潮時に 海の道が 現れる〉は 市内の 見どころの 一つ・干潟の アサリ・ウミニナ。そこに ない 数字・名前・時刻は 書かない）
(function (root) {
  const AICHI = 'https://aichinow.pref.aichi.jp/modelcourse/detail/122/', MLIT = 'https://www.mlit.go.jp/river/basic_info/jigyo_keikaku/gaiyou/seibi/pdf/yahagigawa-5.pdf';
  const PLACE = 'トンボロ干潟';   // 注目スポット（spots.json）の 名前に ふくむ ことば
  const R = 200;
  const LIST = [
    { id: 'mitsu', name: '満ちた 海', say: 'いまは 海だに。干潮に なると 海の道が あらわれるに', src: AICHI },
    { id: 'hiku', name: '潮が 引く', say: '潮が 引いて きたに。砂の 道が 見えて きたに', src: AICHI },
    { id: 'michi', name: '海の 道', say: 'トンボロ現象だに。干潮の ときに 海の道が あらわれるに', src: AICHI },
    { id: 'higata', name: '干潟の 生きもの', say: '干潟には アサリや ウミニナが おるに', src: MLIT },
  ];
  const STILL = 3;       // じっと して から 出るまでの 秒（ねむる 12秒より 前）
  const CYCLE = 7000;    // 1つの 場面の 長さ
  // spots：[{ name, lat, lng }]（注目スポット）。いる 所（lat, lng）の まわり R メートルに トンボロ干潟が あるか
  function near(spots, lat, lng) {
    const kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540;
    return (spots || []).some(s => (s.name || '').includes(PLACE) && Math.hypot((s.lng - lng) * kx, (s.lat - lat) * ky) <= R);
  }
  // いる 所：{ city, near（near の 結果） }
  // 西尾市の トンボロ干潟の そばで 場面を 1つ えらぶ。last＝まえの id（なるべく ちがう ものを）、rand＝0〜1の 乱数。なければ null
  function pick(c, last, rand) {
    if (!c || !/西尾/.test(c.city || '') || !c.near) return null;
    const other = LIST.filter(x => x.id !== last), from = other.length ? other : LIST;
    return from[Math.min(from.length - 1, Math.floor((rand ? rand() : Math.random()) * from.length))];
  }
  root.NISHIO_TOMBOLO = { LIST, PLACE, R, STILL, CYCLE, near, pick };
})(window);
