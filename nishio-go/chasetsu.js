// お米つぶの ちゃせき：西尾地区で 止まって じっと して いると（約3秒）、お米の よこに 石臼が 出て てん茶を ひき（石臼が くるくる）、
// つぎに 茶わんに 抹茶を 点てて（茶せんが しゃかしゃか）、できたら お米が ひと言。動くか ねむりだす（12秒）と 消える（行動：道具を つかって 抹茶を 点てる）
// （pixel.js の chasetsuStep。これまでの 名物の 絵を 出す 話す・ひとりごと・ついてくる・のせる・夢・出会い・こぼす・食べる・おてだま・かさ・めぐり・つんつん・かげえ・ねどこ、
//  吉良の 場所に つかる ゆあみ、干潟の 貝を ほる ほりだし とは ちがい、西尾の 抹茶を お米が 石臼で ひいて 自分で 点てる）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・id：できあがりの 種類。town：その 町名の 所だけ（町名の 正規表現）。months：この 月だけ（なければ いつでも。合う 月が あれば そちらを 先に）
// ・say：点て おわった とき お米が 言う ことば（みじかく。かざりの 絵文字は つけない）
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 調べた 中身だけ（てん茶・石臼で 挽いて 自分で 点てる 体験・春の 新茶。そこに ない 数字・名前は 書かない）
(function (root) {
  const NK = 'https://nishiokanko.com/tw/specialty/';
  const NIS = '^(?!一色町|吉良町|東幡豆町|西幡豆町|鳥羽町|寺部町)';   // 西尾地区の 町（一色・吉良・幡豆の 町を のぞく）
  const LIST = [
    { id: 'matcha', name: '抹茶', town: NIS, say: '石臼で ひいて 点てたよ。西尾は 抹茶の まちだね', src: NK },
    { id: 'shincha', name: '新茶の 抹茶', town: NIS, months: [4, 5], say: '新茶の 抹茶を 点てたよ。茶摘みの ころだね', src: NK },
  ];
  const STILL = 3;       // じっと して から 出るまでの 秒（ねむる 12秒より 前）
  const MILL = 3200;     // 石臼で ひく 長さ
  const WHISK = 2600;    // 茶せんで 点てる 長さ
  // いる 所：{ city, town }、month：1〜12。西尾市の 西尾地区で 1つ えらぶ（月に 合う ものを 先に）。なければ null
  function pick(c, month) {
    if (!c || !/西尾/.test(c.city || '')) return null;
    const mine = LIST.filter(x => new RegExp(x.town).test(c.town || ''));
    const now = mine.filter(x => x.months && x.months.includes(month));
    return now.length ? now[0] : (mine.filter(x => !x.months)[0] || null);
  }
  root.NISHIO_CHASETSU = { LIST, STILL, MILL, WHISK, pick };
})(window);
