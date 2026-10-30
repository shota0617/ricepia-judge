// お米つぶの じょうかまちさんぽ：西尾城の あとの そば（西尾市歴史公園・旧近衛邸・尚古荘の 近く）で 止まって じっと して いると（約3秒）、お米の うしろが 城下町の ひとこまに なる。
// 本丸丑寅櫓・鍮石門・6万石・旧近衛邸の 抹茶・尚古荘・西尾祇園祭・三河の小京都、の 場面が 7秒ごとに かわり、かわるたび お米が ひと言。
// 動くか ねむりだす（12秒）と 消える（行動：止まった 主人公が 城下町の 史跡の 中に おさまる）
// （pixel.js の jokamachiStep。これまでの 名物の 絵を 出す 話す・ひとりごと・ついてくる・のせる・夢・出会い・こぼす・食べる・おてだま・かさ・めぐり・つんつん・かげえ・ねどこ、
//  吉良の ゆあみ、干潟の ほりだし、西尾地区の ちゃせき、佐久島の しまたび、一色の いっしきさんぽ とは ちがい、
//  町名では なく「西尾城の あとの すぐ そば」という 場所に 止まった ときだけ 出る。城下町と 祇園祭は これまで 話や 手帳の 一部に しか 出て いなかった）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・id：場面の 名前。at：この 場所の 近くで だけ 出る（castle＝西尾市歴史公園、konoe＝旧近衛邸、shokoso＝尚古荘）。say：場面に なった とき お米が 言う ことば（みじかく。かざりの 絵文字は つけない）
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 調べた 中身だけ（西条城は 鎌倉時代初期に 足利義氏・大給松平家6万石の 城下町・西尾市歴史公園：本丸丑寅櫓、鍮石門、旧近衛邸、尚古荘・西駅西側は 寺社が 多く 三河の小京都・西尾祇園祭として 今も 残る・旧近衛邸で 抹茶。そこに ない 数字・名前は 書かない）
(function (root) {
  const NK = 'https://nishiokanko.com/tw/specialty/', AICHI = 'https://aichinow.pref.aichi.jp/modelcourse/detail/122/';
  const PLACES = [   // 場所：名前に match を ふくむ 注目スポット（spots.json）の まわり R メートル
    { key: 'castle', match: '西尾市歴史公園' },
    { key: 'konoe', match: '旧近衛邸' },
    { key: 'shokoso', match: '尚古荘' },
  ];
  const R = 150;
  const ALL = ['castle', 'konoe', 'shokoso'];
  const LIST = [
    { id: 'ushitora', name: '本丸丑寅櫓', at: ['castle'], say: '本丸丑寅櫓だに。西尾市歴史公園で 見られるに', src: NK },
    { id: 'yuseki', name: '鍮石門', at: ['castle'], say: '鍮石門だに。西尾市歴史公園の 見どころだに', src: NK },
    { id: 'shijo', name: '西条城', at: ['castle'], say: '鎌倉時代の はじめに 足利義氏が 築いた 西条城が 西尾城の はじまりだに', src: NK },
    { id: 'rokuman', name: '6万石', at: ALL, say: '西尾は 大給松平家 6万石の 城下町だに', src: NK },
    { id: 'konoe', name: '旧近衛邸', at: ['konoe'], say: '旧近衛邸では 抹茶を いただけるに', src: NK },
    { id: 'shokoso', name: '尚古荘', at: ['shokoso'], say: '尚古荘も 西尾市歴史公園の 見どころだに', src: NK },
    { id: 'gion', name: '西尾祇園祭', at: ALL, say: '城下町の 栄華は 西尾祇園祭として 今も 残っとるに', src: NK },
    { id: 'koto', name: '三河の小京都', at: ALL, say: '西駅の 西がわは 寺社が 多くて 三河の小京都だに', src: AICHI },
  ];
  const STILL = 3;       // じっと して から 出るまでの 秒（ねむる 12秒より 前）
  const CYCLE = 7000;    // 1つの 場面の 長さ
  // spots：[{ name, lat, lng }]（注目スポット）。いる 所（lat, lng）の まわり R メートルに ある 場所の key を 返す
  function nearKeys(spots, lat, lng) {
    const out = [], kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540;
    for (const p of PLACES) {
      if ((spots || []).some(s => (s.name || '').includes(p.match) && Math.hypot((s.lng - lng) * kx, (s.lat - lat) * ky) <= R)) out.push(p.key);
    }
    return out;
  }
  // いる 所：{ city, near（nearKeys の 結果） }
  // 西尾市の 西尾城の あとの そばで 場面を 1つ えらぶ。last＝まえの id（なるべく ちがう ものを）、rand＝0〜1の 乱数。なければ null
  function pick(c, last, rand) {
    if (!c || !/西尾/.test(c.city || '') || !(c.near || []).length) return null;
    const mine = LIST.filter(x => x.at.some(k => c.near.includes(k)));
    const other = mine.filter(x => x.id !== last), from = other.length ? other : mine;
    return from[Math.min(from.length - 1, Math.floor((rand ? rand() : Math.random()) * from.length))];
  }
  root.NISHIO_JOKAMACHI = { LIST, PLACES, R, STILL, CYCLE, nearKeys, pick };
})(window);
