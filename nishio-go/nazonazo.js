// お米つぶの なぞなぞ：止まって しばらく じっと して いると、お米が いる 地区に 合った 西尾の なぞなぞを 出す。
// 答えは 2つ。お米の したに ならんだ 2つの 札を タップして 選ぶと、お米が 返事を する（あたり：「そのとおり」／はずれ：ほんとうの 答えを おしえる）。
// （pixel.js の nazoStep・nazoTap。これまでの 話す・ひとりごと・ついてくる・のせる・ゆめ・であい・こぼす・食べる・ほうる・かさ・めぐり・つんつん・かげえ・ねどこ・
//  じっと すると 場面が かわる もの は、お米が 自分で 見せる もの。これは お米が プレイヤーに「聞く」→ プレイヤーが 答える の やりとり）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・id：なぞなぞの 名前。town：その 町名の 所だけ（なければ 西尾市の どこでも）。q：お米の 問い。a：ただしい 答え。b：ちがう 答え（どちらも みじかく）
// ・yes：あたりの とき お米が 言う ことば。no：はずれの とき お米が 言う ことば（ほんとうの 答えを 言う。かざりの 絵文字は つけない）
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 中身だけ（ただしい 答えと 答えあわせの 文は ブリーフに ある ことだけ。b は まちがいの 選びで、ことばには 出さない）
(function (root) {
  const NK = 'https://nishiokanko.com/tw/specialty/', MAFF = 'https://www.maff.go.jp/j/nousin/sekkei/museum/m_kakuti/27_kogane/index.html',
    AN = 'https://aichinow.pref.aichi.jp/modelcourse/detail/122/', MLIT = 'https://www.mlit.go.jp/river/basic_info/jigyo_keikaku/gaiyou/seibi/pdf/yahagigawa-5.pdf';
  const NIS = '^(?!一色町|吉良町|東幡豆町|西幡豆町|鳥羽町|寺部町)';   // 西尾地区の 町（一色・吉良・幡豆の 町を のぞく）
  const ISSHIKI = '^一色町(?!佐久島)', SAKU = '^一色町佐久島', KIRA = '^吉良町', HAZU = '^(東幡豆町|西幡豆町)';
  const LIST = [
    // 西尾地区
    { id: 'tencha', town: NIS, q: '抹茶の 原料は どっちだに？', a: 'てん茶', b: 'ほうじ茶', yes: 'そのとおり。西尾は てん茶の 生産量が 日本有数だに', no: 'ざんねん。てん茶だに。西尾は 生産量が 日本有数だに', src: NK },
    { id: 'chatsumi', town: NIS, q: '茶摘みは いつごろだに？', a: '4月末〜5月', b: '11月〜12月', yes: 'せいかい。茶摘みは 4月末から 5月だに', no: 'ちがうに。茶摘みは 4月末から 5月だに', src: NK },
    { id: 'kiri', town: NIS, q: 'てん茶を 育てる 川霧は どっちの 川だに？', a: '矢作川', b: '木曽川', yes: 'せいかい。矢作川の 川霧が てん茶を 育てるに', no: 'ざんねん。矢作川の 川霧だに', src: NK },
    { id: 'saijo', town: NIS, q: '西条城を 築いたのは だれだに？', a: '足利義氏', b: '吉良義央', yes: 'そのとおり。鎌倉時代の はじめに 足利義氏が 築いた 西条城が 西尾城の はじまりだに', no: 'ざんねん。足利義氏が 鎌倉時代の はじめに 築いた 西条城が はじまりだに', src: NK },
    { id: 'rokuman', town: NIS, q: '西尾は 大給松平家 何万石の 城下町だに？', a: '6万石', b: '3万石', yes: 'せいかい。大給松平家 6万石の 城下町だに', no: 'ざんねん。大給松平家 6万石の 城下町だに', src: NK },
    { id: 'gion', town: NIS, q: '城下町の 栄華が 今も 残る 祭りは どっちだに？', a: '西尾祇園祭', b: '大提灯まつり', yes: 'そのとおり。西尾祇園祭に 栄華が 残っとるに', no: 'ざんねん。西尾祇園祭だに。大提灯まつりは 一色だに', src: NK },
    { id: 'kyoto', town: NIS, q: '西駅の 西側は 寺社が 多い。何と 呼ぶ だに？', a: '三河の小京都', b: '三河の小江戸', yes: 'せいかい。三河の小京都だに', no: 'ざんねん。三河の小京都だに', src: NK },
    // 一色
    { id: 'unagi', town: ISSHIKI, q: '一色の うなぎは 全国の どのくらいだに？', a: '約2割', b: '約5割', yes: 'せいかい。一色の うなぎは 全国の 約2割だに', no: 'ざんねん。全国の 約2割だに', src: NK },
    { id: 'yoman', town: ISSHIKI, q: '一色の 養鰻は いつから だに？', a: '明治27年', b: '昭和27年', yes: 'そのとおり。養鰻は 明治27年から だに', no: 'ざんねん。明治27年から だに', src: NK },
    { id: 'chochin', town: ISSHIKI, q: '巨大な 提灯で 知られる 祭りは どっちだに？', a: '一色大提灯まつり', b: '西尾祇園祭', yes: 'せいかい。一色大提灯まつりだに', no: 'ざんねん。一色大提灯まつりだに', src: NK },
    // 吉良
    { id: 'kogane-nen', town: KIRA, q: '黄金堤を 築いたのは いつだに？', a: '1686年', b: '1886年', yes: 'せいかい。貞享3年、1686年だに', no: 'ざんねん。貞享3年、1686年だに', src: MAFF },
    { id: 'kogane-hito', town: KIRA, q: '黄金堤を 築いたのは だれだに？', a: '吉良上野介義央', b: '足利義氏', yes: 'そのとおり。吉良上野介義央が 私財を 投じて 領民と 一夜で 築いたに', no: 'ざんねん。吉良上野介義央が 私財を 投じて 領民と 一夜で 築いたに', src: MAFF },
    { id: 'kogane-taka', town: KIRA, q: '黄金堤の 高さは どっちだに？', a: '4m', b: '14m', yes: 'せいかい。長さ180m、高さ4mだに', no: 'ざんねん。長さ180m、高さ4mだに', src: MAFF },
    { id: 'kogane-iro', town: KIRA, q: '水害が なくなって 田を 彩ったのは なんだに？', a: '金色の 稲穂', b: '金色の 菊', yes: 'そのとおり。金色の 稲穂が 田を 彩って 黄金堤と 呼ばれたに', no: 'ざんねん。金色の 稲穂だに。それで 黄金堤だに', src: MAFF },
    { id: 'mangekyo', town: KIRA, q: '三河ガラス工芸美術館に ある 巨大な ものは なんだに？', a: '万華鏡', b: '風車', yes: 'せいかい。巨大な 万華鏡だに', no: 'ざんねん。巨大な 万華鏡だに', src: NK },
    // 佐久島
    { id: 'saku-fune', town: SAKU, q: '一色港から 高速船で どのくらい だに？', a: '約20分', b: '約60分', yes: 'せいかい。一色港から 高速船で 約20分だに', no: 'ざんねん。約20分だに', src: NK },
    { id: 'saku-art', town: SAKU, q: '佐久島に 点在 するのは なんだに？', a: 'アート作品', b: '風車', yes: 'そのとおり。アート作品が 点在する 島だに', no: 'ざんねん。アート作品だに。アートの 島だに', src: NK },
    { id: 'saku-kabe', town: SAKU, q: '佐久島の 集落の 景観は どっちだに？', a: '黒壁', b: '白壁', yes: 'せいかい。黒壁の 集落だに', no: 'ざんねん。黒壁の 集落だに', src: NK },
    // 幡豆
    { id: 'hazu-yama', town: HAZU, q: '幡豆の 山並みは どっちだに？', a: '三ヶ根山', b: '富士山', yes: 'せいかい。三ヶ根山の 山並みだに', no: 'ざんねん。三ヶ根山だに', src: NK },
    { id: 'hazu-hana', town: HAZU, q: '西尾が 産地の 花は どっちだに？', a: 'カーネーション', b: 'チューリップ', yes: 'そのとおり。カーネーションの 花き産地だに', no: 'ざんねん。カーネーションだに', src: NK },
    // 西尾市の どこでも
    { id: 'yahagi', q: '矢作川は 西尾で どこに 注ぐだに？', a: '三河湾', b: '伊勢湾', yes: 'せいかい。矢作川は 西尾で 三河湾に 注ぐに', no: 'ざんねん。三河湾に 注ぐに', src: MLIT },
    { id: 'medaka', q: '絶滅危惧II類は どっちだに？', a: 'メダカ', b: 'ドジョウ', yes: 'そのとおり。メダカは 絶滅危惧II類だに', no: 'ざんねん。メダカが 絶滅危惧II類だに', src: MLIT },
  ];
  const STILL = 4.5;      // じっと して から 出るまでの 秒（ねむる 12秒より 前。ごちそうは 5秒までに 出る）
  const SHOW = 12;        // この 秒に なったら ひっこめる（ねむりだす）
  const FIRST = 40000;    // はじめて 出るまでの ミリ秒（あそびはじめて から）
  const GAP = [120000, 90000];   // 次に 出るまで 120〜210秒
  // いる 所：{ city, town }。西尾市の 中で、いる 町に 合う なぞなぞの 候補（町の 決まりが ないものは どこでも）
  function candidates(c) {
    if (!c || !/西尾/.test(c.city || '')) return [];
    const town = c.town || '';
    return LIST.filter(x => !x.town || new RegExp(x.town).test(town));
  }
  // 1つ えらぶ。seen＝もう 出した id（ひとめぐり したら 忘れて 最初から）、rand＝0〜1の 乱数。
  // 戻り値：{ item, seen, flip }。flip が true の とき 答えの 札を 右に ならべる（左右は 毎回 かわる）。なければ null
  function pick(c, seen, rand) {
    const mine = candidates(c);
    if (!mine.length) return null;
    const r = rand || Math.random;
    let base = seen || [], left = mine.filter(x => !base.includes(x.id));
    if (!left.length) { left = mine; base = base.filter(id => !mine.some(x => x.id === id)); }
    const item = left[Math.min(left.length - 1, Math.floor(r() * left.length))];
    return { item, seen: [...base, item.id].slice(-40), flip: r() < 0.5 };
  }
  // 答えた 札（0＝左, 1＝右）が あたりか
  function judge(flip, side) { return (side === 1) === !!flip; }
  root.NISHIO_NAZONAZO = { LIST, STILL, SHOW, FIRST, GAP, candidates, pick, judge };
})(window);
