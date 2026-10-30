// お米つぶの ようこそ：転がって 西尾市の 地区（西尾・一色・吉良・幡豆・佐久島）の 境を こえると、お米の 足もとに その地区の 名物の 絵が ついた 旗が すっと 立ち、お米が ひと言。
// 旗は 約4.5秒で 消える。地区が かわった ときだけ（同じ 地区の 町名が かわる だけ では 出ない。町名の 札は 別に 出る）。
// （pixel.js の youkosoStep。これまでの 話す・ひとりごと・ついてくる・のせる・ゆめ・であい・こぼす・食べる・ほうる・かさ・めぐり・つんつん・かげえ・ねどこ・
//  じっと すると 始まる 場面 は、時間・場所・止まる ことが きっかけ。これは「地区の 境を こえる」ことが きっかけで、お米が その 地区の 顔を 旗で 知らせる）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・area：地区（nimotsu.js と 同じ id）。id：絵の 名前（pixel.js の drawNakama と そろえる）。months：その 月だけ 先に 出す。say：境を こえた とき お米が 言う ことば（かざりの 絵文字は つけない）
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 調べた 中身だけ（そこに ない 数字・名前は 書かない）
(function (root) {
  const NK = 'https://nishiokanko.com/tw/specialty/', AN = 'https://aichinow.pref.aichi.jp/modelcourse/detail/122/',
    MAFF = 'https://www.maff.go.jp/j/nousin/sekkei/museum/m_kakuti/27_kogane/index.html';
  const LIST = [
    { id: 'tencha', area: 'nishio', name: 'てん茶の 葉', months: [4, 5], say: '西尾に 入ったに。ちょうど 茶摘みの ころだに', src: NK },
    { id: 'chawan', area: 'nishio', name: '抹茶わん', say: '西尾に 入ったに。抹茶の まちだに', src: NK },
    { id: 'unagi', area: 'isshiki', name: 'うなぎ', say: '一色に 入ったに。うなぎは 全国の 約2割だに', src: NK },
    { id: 'ebisen', area: 'isshiki', name: 'えびせんべい', say: '一色に 入ったに。えびせんべいの まちだに', src: NK },
    { id: 'chochin', area: 'isshiki', name: '提灯', say: '一色に 入ったに。大提灯まつりの まちだに', src: NK },
    { id: 'inaho', area: 'kira', name: '金色の 稲穂', months: [9, 10], say: '吉良に 入ったに。黄金堤の 金色の 稲穂だに', src: MAFF },
    { id: 'inaho', area: 'kira', name: '稲穂', say: '吉良に 入ったに。黄金堤の さとだに', src: MAFF },
    { id: 'carnation', area: 'hazu', name: 'カーネーション', say: '幡豆に 入ったに。カーネーションの 花き産地だに', src: NK },
    { id: 'asari', area: 'sakushima', name: 'アサリ', say: '佐久島に ついたに。三河湾で いちばん 大きい 島だに', src: AN },
  ];
  const SHOW = 4500;     // 旗を 立てて おく ミリ秒
  const COOL = 45000;    // 次に 旗を 立てる までの ミリ秒（境を ふらふら 行き来しても うるさく ならない）
  const NIS = /西尾/;
  // いる 所（市・町名）から 地区の id。西尾市の 外・町名が ない（田畑や 山の 中）ときは null
  function areaOf(city, town) {
    if (!NIS.test(city || '') || !town) return null;
    if (/^一色町佐久島/.test(town)) return 'sakushima';
    if (/^一色町/.test(town)) return 'isshiki';
    if (/^吉良町/.test(town)) return 'kira';
    if (/^(東幡豆町|西幡豆町)/.test(town)) return 'hazu';
    return 'nishio';
  }
  // 地区と 月で 旗の 名物を 1つ えらぶ。last＝前に 立てた 旗の id（なるべく ちがう ものを）、rand＝0〜1の 乱数。地区に なければ null
  function pick(area, month, last, rand) {
    const mine = LIST.filter(x => x.area === area);
    if (!mine.length) return null;
    let from = mine.filter(x => !x.months || x.months.includes(month));
    from = from.filter(x => x.months || !from.some(y => y.months && y.id === x.id));   // 同じ 絵で 月の 合う ものが あれば そちらを 先に
    const other = from.filter(x => x.id !== last);
    const pool = other.length ? other : from;
    return pool[Math.min(pool.length - 1, Math.floor((rand ? rand() : Math.random()) * pool.length))];
  }
  // 地区が かわった か。prev＝前に いた 地区（まだ 見ていない＝null、西尾市の 外に いた＝''）、cur＝いまの 地区。
  // 遊びはじめの 一歩目（prev が null）では 出さない。西尾市の 外から 入った ときは 出す
  function entered(prev, cur) { return !!cur && prev !== null && prev !== undefined && prev !== cur; }
  root.NISHIO_YOUKOSO = { LIST, SHOW, COOL, areaOf, pick, entered };
})(window);
