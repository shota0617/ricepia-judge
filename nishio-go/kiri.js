// お米つぶの かわぎり：あさ（日本時間の5時〜8時前）に、西尾市の 川・池・用水の そばを 通ると、川霧が お米の まわりに すうっと たちこめる。
// 霧が 出た とき・はれた とき お米が ひと言。西尾地区では「てん茶は 矢作川の 川霧で 育つ」話を、一色・吉良・幡豆では 矢作川が 三河湾に 注ぐ 話を する
// （pixel.js の kiriStep。これまでの 名物の 絵を 出す 話す・ひとりごと・ついてくる・のせる・夢・出会い・こぼす・食べる・おてだま・かさ・めぐり・つんつん・かげえ・ねどこ、
//  じっと すると 始まる ゆあみ・ほりだし・ちゃせき・しまたび・つつみづくり とは ちがい、1日の 時間（あさ）と 水べの 組みあわせで お米の まわりの 空気が かわる。転がって いても 止まって いても 出る）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・id：場面の 名前。town：その 町名の 所だけ（町名の 正規表現。地区の 町名は pixel.js の here.town）
// ・say：霧が 出た ときの ひと言／end：はれた ときの ひと言（みじかく。かざりの 絵文字は つけない）
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 調べた 中身だけ（てん茶：矢作川の 川霧・温暖な 気候・土壌が 育てる／矢作川は 西尾市で 三河湾に 注ぐ。そこに ない 数字・名前は 書かない）
(function (root) {
  const NK = 'https://nishiokanko.com/tw/specialty/', WIKI = 'https://ja.wikipedia.org/wiki/%E7%9F%A2%E7%B0%AF%E5%B7%9D';
  const NIS = '^(?!一色町|吉良町|東幡豆町|西幡豆町|鳥羽町|寺部町)';   // 西尾地区の 町（一色・吉良・幡豆の 町を のぞく）
  const LIST = [
    { id: 'tencha', name: 'てん茶の 川霧', town: NIS, say: '矢作川の 川霧だに。てん茶は この 霧で 育つんだって', end: '霧が はれたに。今日も ええ お茶に なるに', src: NK },
    { id: 'kawa', name: '矢作川の 川霧', town: '^(一色町|吉良町|東幡豆町|西幡豆町|鳥羽町|寺部町)', say: 'あさの 川霧だに。矢作川は 西尾で 三河湾に 注ぐんだに', end: '霧が はれたに。ええ あさだに', src: WIKI },
  ];
  const FROM = 5, TO = 8;   // 霧の 出る 時間（日本時間。5時〜8時前）
  const EVERY = 2000;       // 場所を しらべる 間かく（ミリ秒）
  // 日本時間の 時（0〜23）が 霧の 時間か
  function morning(hr) { return hr >= FROM && hr < TO; }
  // いる 所：{ city, town, land（土地利用の 1文字。川・池＝'i'）, near（まわり 100m メッシュの 土地利用の 文字を まとめた 文字列） }
  // 西尾市の 川・池・用水の そばで、町に 合う 霧の 話を 1つ かえす。なければ null
  function pick(c) {
    if (!c || !/西尾/.test(c.city || '')) return null;
    if (c.land !== 'i' && !(c.near || '').includes('i')) return null;
    const town = c.town || '', mine = LIST.filter(x => new RegExp(x.town).test(town));
    return mine.length ? mine[0] : null;
  }
  root.NISHIO_KIRI = { LIST, FROM, TO, EVERY, morning, pick };
})(window);
