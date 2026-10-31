// お米つぶの たびのしるし：西尾市の 地区（西尾・一色・吉良・幡豆・佐久島）に はじめて 入ると、その 地区の 小さな 旗が お米の よこに ならんで ずっと のこり、旅の しるしに なる。
// 5つ そろうと お米が ひと言。旗は この 端末に おぼえて（nsg_shirushi）、あそび直しても のこる。
// （ようこそ＝境を こえた ときだけ 立つ 旗は 約4.5秒で 消える。これは 入った 地区を 数えて 主人公の すがたに のこす ほうで、地区の 顔は 旗の 絵と 色で 出す）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・id：地区（youkoso.js と 同じ id）。emblem：旗の 絵の 名前（pixel.js の drawNakama と そろえる）。color：旗の 色。name：地区の 名前
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 調べた 中身だけ（そこに ない 数字・名前は 書かない）
(function (root) {
  const NK = 'https://nishiokanko.com/tw/specialty/', AN = 'https://aichinow.pref.aichi.jp/modelcourse/detail/122/',
    MAFF = 'https://www.maff.go.jp/j/nousin/sekkei/museum/m_kakuti/27_kogane/index.html';
  const AREAS = [
    { id: 'nishio', name: '西尾', emblem: 'chawan', color: '#7fb069', src: NK },
    { id: 'isshiki', name: '一色', emblem: 'unagi', color: '#5b8fc7', src: NK },
    { id: 'kira', name: '吉良', emblem: 'inaho', color: '#e0b030', src: MAFF },
    { id: 'hazu', name: '幡豆', emblem: 'carnation', color: '#e58fa6', src: NK },
    { id: 'sakushima', name: '佐久島', emblem: 'asari', color: '#3c5a8a', src: AN },
  ];
  const KEY = 'nsg_shirushi';
  const DELAY = 3400;   // ようこそ（境の 旗）の ひと言の あとに 言う までの ミリ秒
  const POP = 900;      // 旗が ぽんと 立つ ミリ秒
  // おぼえて いる 旗の 一覧（壊れた 値・知らない 地区は 捨てる）
  function clean(list) {
    if (!Array.isArray(list)) return [];
    return AREAS.map(a => a.id).filter(id => list.includes(id));
  }
  // 地区 area に はじめて 入った。list＝いまの 一覧。返す：{ list（あたらしい 一覧）, added（ふえたか）, done（5つ そろった ばかりか） }
  function add(list, area) {
    const cur = clean(list);
    if (!AREAS.some(a => a.id === area) || cur.includes(area)) return { list: cur, added: false, done: false };
    const next = clean(cur.concat(area));
    return { list: next, added: true, done: next.length === AREAS.length };
  }
  // 旗が ふえた とき お米が 言う ことば。n＝いまの 旗の 数、area＝いま 入った 地区
  function say(n, area) {
    const a = AREAS.find(x => x.id === area), name = a ? a.name : '';
    if (n >= AREAS.length) return '5つの 地区の 旗が ぜんぶ そろったよ。西尾を ひとめぐりしたよ';
    return name + 'の 旗が ふえたよ。あと ' + (AREAS.length - n) + 'つだね';
  }
  root.NISHIO_SHIRUSHI = { AREAS, KEY, DELAY, POP, clean, add, say };
})(window);
