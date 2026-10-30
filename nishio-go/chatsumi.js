// お米つぶの ちゃつみ：稲荷山茶園公園の そばで 止まって じっと して いると（約3秒）、お米の うしろが 茶畑の ひとこまに なる。
// 茶畑の 一望・茶摘み（4〜5月）・てん茶の 産地・川霧と 気候と 土、の 場面が 7秒ごとに かわり、かわるたび お米が ひと言。
// 動くか ねむりだす（12秒）と 消える（行動：止まった 主人公が 茶畑の 中で 茶摘みを する）
// （pixel.js の chatsumiStep。これまでの 西尾地区の ちゃせき〈石臼で ひいて 点てる〉や 城下町の じょうかまちさんぽ とは ちがい、
//  抹茶の 手前の「畑」の 場面。町名では なく「稲荷山茶園公園の すぐ そば」という 場所に 止まった ときだけ 出る）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・id：場面の 名前。months：この 月だけ（なければ いつでも）。say：場面に なった とき お米が 言う ことば（みじかく。かざりの 絵文字は つけない）
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 1 の 中身だけ（てん茶の 生産量は 日本有数・温暖な 気候と 矢作川の 川霧と 土壌・稲荷山茶園公園から 茶畑を 一望・茶摘みは 4月末〜5月。そこに ない 数字・名前は 書かない）
(function (root) {
  const NK = 'https://nishiokanko.com/tw/specialty/', CITY = 'https://www.city.nishio.aichi.jp/shisei/shokai/1003109.html';
  const PLACE = '稲荷山茶園';   // 注目スポット（spots.json）の 名前に ふくむ ことば
  const R = 200;
  const LIST = [
    { id: 'ichibo', name: '茶畑の 一望', say: '稲荷山茶園公園からは 茶畑を 一望できるに', src: NK },
    { id: 'tsumi', name: '茶摘み', months: [4, 5], say: '茶摘みだに。4月の おわりから 5月が 茶摘みの ころだに', src: NK },
    { id: 'tencha', name: 'てん茶の 産地', say: '西尾は 抹茶の 原料 てん茶の 生産量が 日本有数だに', src: NK },
    { id: 'kiri', name: '川霧と 土', say: '温暖な 気候と 矢作川の 川霧と 土が てん茶を 育てるに', src: NK },
  ];
  const STILL = 3;       // じっと して から 出るまでの 秒（ねむる 12秒より 前）
  const CYCLE = 7000;    // 1つの 場面の 長さ
  // spots：[{ name, lat, lng }]（注目スポット）。いる 所（lat, lng）の まわり R メートルに 稲荷山茶園公園が あるか
  function near(spots, lat, lng) {
    const kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540;
    return (spots || []).some(s => (s.name || '').includes(PLACE) && Math.hypot((s.lng - lng) * kx, (s.lat - lat) * ky) <= R);
  }
  // いる 所：{ city, near（near の 結果）, month }
  // 西尾市の 稲荷山茶園公園の そばで 場面を 1つ えらぶ。last＝まえの id（なるべく ちがう ものを）、rand＝0〜1の 乱数。なければ null
  // 月に 合う 場面（茶摘み）が あれば 先に 出す
  function pick(c, last, rand) {
    if (!c || !/西尾/.test(c.city || '') || !c.near) return null;
    const mine = LIST.filter(x => !x.months || x.months.includes(c.month));
    const other = mine.filter(x => x.id !== last), from = other.length ? other : mine;
    const season = from.filter(x => x.months);
    const pool = season.length && (rand ? rand() : Math.random()) < 0.5 ? season : from;
    return pool[Math.min(pool.length - 1, Math.floor((rand ? rand() : Math.random()) * pool.length))];
  }
  root.NISHIO_CHATSUMI = { LIST, PLACE, R, STILL, CYCLE, near, pick };
})(window);
