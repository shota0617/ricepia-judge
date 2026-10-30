// お米つぶの ねどこ：転がらずに じっと して ねむって しまう（すやすや）と、いる 町と 今の 月に 合った 西尾の 名物が お米の 下に ならんで、ねどこ（ふとん）に なる。
// ねどこが しき おわると、お米が ひと言。おきると ねどこは すっと 消える（住処まわり：お米の ねぐらが 町の 名物で できる）
// （pixel.js の nedokoStep。名所の 西尾ばなし＝komebanashi.js・ひとりごと＝michikusa.js・おとも＝otomo.js・にもつ＝nimotsu.js・ゆめ＝yume.js・であい＝deai.js・
//  こぼれもの＝kobore.js・ごちそう＝gochiso.js・おてだま＝otedama.js・かさ＝kasa.js・めぐり＝meguri.js・つんつん＝tsun.js・かげえ＝kage.js とは ちがい、
//  ねむる 場所そのものを 名物で つくる。ゆめが 頭の よこの 吹き出しに 見る ものなら、これは からだの 下に しく もの。絵は おともと 同じ drawNakama）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・id：絵の 名前（pixel.js の drawNakama と そろえる）。town：その 町名の 所だけ（町名の 正規表現。地区の 町名は pixel.js の here.town）
// ・months：その 月だけ 先に 出す。where：'higata'＝まわりに 海水域が ある 所だけ。say：しき おわった とき お米が 言う ことば（みじかく。かざりの 絵文字は つけない）
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 調べた 中身だけ（そこに ない 数字・名前は 書かない）
(function (root) {
  const NK = 'https://nishiokanko.com/tw/specialty/', MAFF = 'https://www.maff.go.jp/j/nousin/sekkei/museum/m_kakuti/27_kogane/index.html',
    AN = 'https://aichinow.pref.aichi.jp/modelcourse/detail/122/';
  const NIS = '^(?!一色町|吉良町|東幡豆町|西幡豆町|鳥羽町|寺部町)';   // 西尾地区の 町（一色・吉良・幡豆の 町を のぞく）
  const LIST = [
    { id: 'ebisen', name: 'えびせんべい', town: '^一色町', say: 'えびせんの ざぶとんだに。一色の ねどこだに', src: NK },
    { id: 'chochin', name: '提灯', town: '^一色町', say: '提灯の ねどこで ゆらゆら ねむるに', src: NK },
    { id: 'tencha', name: 'てん茶の 葉', town: NIS, months: [4, 5], say: '茶の葉の ふとんだに。茶摘みの ころだに', src: NK },
    { id: 'chawan', name: '抹茶わん', town: NIS, say: '抹茶わんの ねどこだに。西尾は 抹茶の まちだに', src: NK },
    { id: 'inaho', name: '稲穂', town: '^吉良町', say: '稲穂の ふとんで ぬくぬくだに。黄金堤の まちだに', src: MAFF },
    { id: 'carnation', name: 'カーネーション', town: '^(東幡豆町|西幡豆町)', say: 'カーネーションの ベッドだに。ええ かおりだに', src: NK },
    { id: 'asari', name: 'アサリ', town: '^(一色町|吉良町|東幡豆町|西幡豆町)', where: 'higata', say: 'アサリの ベッドだに。海が ちかいに', src: AN },
  ];
  const SETTLE = 1500;   // ねむり はじめて から ねどこが しき おわるまで
  // いる 所：{ city, town, near（まわり 100m メッシュの 土地利用の 文字を まとめた 文字列）, month }
  // 西尾市の 中で、いる 所に 合う ねどこを 1つ えらぶ。last＝まえの ねどこの id（なるべく ちがう ものを）、rand＝0〜1の 乱数。なければ null
  function pick(c, last, rand) {
    if (!c || !/西尾/.test(c.city || '')) return null;
    const town = c.town || '', higata = (c.near || '').includes('k');
    const ok = x => new RegExp(x.town).test(town) && (!x.months || x.months.includes(c.month)) && (x.where !== 'higata' || higata);
    let mine = LIST.filter(ok);
    mine = mine.filter(x => x.months || !mine.some(y => y.months && y.id === x.id));   // 同じ 絵で 月の 合う ものが あれば そちらを 先に
    if (!mine.length) return null;
    const other = mine.filter(x => x.id !== last);
    const from = other.length ? other : mine;
    return from[Math.min(from.length - 1, Math.floor((rand ? rand() : Math.random()) * from.length))];
  }
  root.NISHIO_NEDOKO = { LIST, SETTLE, pick };
})(window);
