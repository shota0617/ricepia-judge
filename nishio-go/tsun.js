// お米つぶの つんつん：お米つぶを つんつん タップすると、ぴょんと はねて、いる 町と 今の 月に 合った 西尾の 名物が ぽんと 飛び出し、お米が ひと言。
// つづけて タップすると、その 町の 名物が じゅんばんに 出てくる。
// （pixel.js の tsunTap・tsunStep。名所の 西尾ばなし＝komebanashi.js・ひとりごと＝michikusa.js・おとも＝otomo.js・にもつ＝nimotsu.js・ゆめ＝yume.js・であい＝deai.js・
//  こぼれもの＝kobore.js・ごちそう＝gochiso.js・おてだま＝otedama.js・かさ＝kasa.js・めぐり＝meguri.js は お米が 自分で 動く のに 対して、
//  プレイヤーが お米に さわった ことへの 返事。絵は おともと 同じ drawNakama）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・id：絵の 名前（pixel.js の drawNakama と そろえる）。town：その 町名の 所だけ（町名の 正規表現。地区の 町名は pixel.js の here.town）
// ・months：その 月だけ。where：'higata'＝まわりに 海水域が ある 所だけ。say：飛び出した とき お米が 言う ことば（かざりの 絵文字は つけない）
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 調べた 中身だけ（そこに ない 数字・名前は 書かない）
(function (root) {
  const NK = 'https://nishiokanko.com/tw/specialty/', MAFF = 'https://www.maff.go.jp/j/nousin/sekkei/museum/m_kakuti/27_kogane/index.html',
    AN = 'https://aichinow.pref.aichi.jp/modelcourse/detail/122/';
  const NIS = '^(?!一色町|吉良町|東幡豆町|西幡豆町|鳥羽町|寺部町)';   // 西尾地区の 町（一色・吉良・幡豆の 町を のぞく）
  const LIST = [
    { id: 'unagi', name: 'うなぎ', town: '^一色町', say: 'うひゃ、うなぎが 出たよ。一色は うなぎの まちだね', src: NK },
    { id: 'ebisen', name: 'えびせんべい', town: '^一色町', say: 'くすぐったいよ。えびせんが ぽんと 出たよ', src: NK },
    { id: 'chochin', name: '提灯', town: '^一色町', say: 'つんつんしたら 提灯が 出たよ。大提灯まつりの まちだね', src: NK },
    { id: 'tencha', name: 'てん茶の 葉', town: NIS, months: [4, 5], say: 'こそばゆいよ。茶の葉が ぽんと 出たよ', src: NK },
    { id: 'chawan', name: '抹茶わん', town: NIS, say: 'つんつんしたら 抹茶わんが 出たよ。西尾は 抹茶の まちだね', src: NK },
    { id: 'inaho', name: '稲穂', town: '^吉良町', say: 'くすぐったいよ。稲穂が 出たよ。黄金堤の まちだね', src: MAFF },
    { id: 'carnation', name: 'カーネーション', town: '^(東幡豆町|西幡豆町)', say: 'つんつんしたら カーネーションが 出たよ', src: NK },
    { id: 'asari', name: 'アサリ', town: '^(一色町|吉良町|東幡豆町|西幡豆町)', where: 'higata', say: 'あれ、アサリが 出たよ。海が ちかいよ', src: AN },
  ];
  const MS = 1600;   // 飛び出して 消えるまで
  // いる 所：{ city, town, near（まわり 100m メッシュの 土地利用の 文字を まとめた 文字列）, month }
  // 西尾市の 中で、いる 所と 月に 合う 候補を すべて かえす（なければ 空）
  function candidates(c) {
    if (!c || !/西尾/.test(c.city || '')) return [];
    const town = c.town || '', higata = (c.near || '').includes('k');
    return LIST.filter(x => new RegExp(x.town).test(town) && (!x.months || x.months.includes(c.month)) && (x.where !== 'higata' || higata));
  }
  // 次に 出す 1つ。last＝まえに 出した id。候補の 並びで 1つ あとの ものを かえす（つづけて つつくと ひとめぐり。なければ null）
  function next(c, last) {
    const mine = candidates(c);
    if (!mine.length) return null;
    const i = mine.findIndex(x => x.id === last);
    return mine[(i + 1) % mine.length];
  }
  root.NISHIO_TSUN = { LIST, MS, candidates, next };
})(window);
