// お米つぶの めぐり：夜に なると、お米つぶが いる 町の 名物が お米の まわりを ゆっくり 輪に なって めぐる（お月さまの ように）。あさに なると 消える。
// （pixel.js の meguriStep。名所の 西尾ばなし＝komebanashi.js・ひとりごと＝michikusa.js・おとも＝otomo.js・にもつ＝nimotsu.js・ゆめ＝yume.js・であい＝deai.js・
//  こぼれもの＝kobore.js・ごちそう＝gochiso.js・おてだま＝otedama.js・かさ＝kasa.js とは ちがい、1日の 時間（夜）に 合わせて 名物が お米の まわりを まわる。絵は おともと 同じ drawNakama）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・id：絵の 名前（pixel.js の drawNakama と そろえる）。town：その 町名の 所だけ（町名の 正規表現。地区の 町名は pixel.js の here.town）
// ・months：その 月だけ。where：'higata'＝まわりに 海水域が ある 所だけ
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 調べた 中身だけ（そこに ない 数字・名前は 書かない）
(function (root) {
  const NK = 'https://nishiokanko.com/tw/specialty/', MAFF = 'https://www.maff.go.jp/j/nousin/sekkei/museum/m_kakuti/27_kogane/index.html',
    AN = 'https://aichinow.pref.aichi.jp/modelcourse/detail/122/';
  const NIS = '^(?!一色町|吉良町|東幡豆町|西幡豆町|鳥羽町|寺部町)';   // 西尾地区の 町（一色・吉良・幡豆の 町を のぞく）
  const LIST = [
    { id: 'chochin', name: '提灯', town: '^一色町', src: NK },
    { id: 'unagi', name: 'うなぎ', town: '^一色町', src: NK },
    { id: 'ebisen', name: 'えびせんべい', town: '^一色町', src: NK },
    { id: 'chawan', name: '抹茶わん', town: NIS, src: NK },
    { id: 'tencha', name: 'てん茶の 葉', town: NIS, months: [4, 5], src: NK },
    { id: 'inaho', name: '稲穂', town: '^吉良町', src: MAFF },
    { id: 'carnation', name: 'カーネーション', town: '^(東幡豆町|西幡豆町)', src: NK },
    { id: 'asari', name: 'アサリ', town: '^(一色町|吉良町|東幡豆町|西幡豆町)', where: 'higata', src: AN },
  ];
  const MAX = 4;   // 輪に 並べる 数の うえ
  // 朝に なって 消える とき お米が 言う ことば
  const END = 'あさだよ。おつかれさん';
  // いる 所：{ city, town, near（まわり 100m メッシュの 土地利用の 文字を まとめた 文字列）, month }
  // 西尾市の 中で、いる 所と 月に 合う 名物を 順に MAX 個まで かえす（なければ 空）
  function ring(c) {
    if (!c || !/西尾/.test(c.city || '')) return [];
    const town = c.town || '', higata = (c.near || '').includes('k');
    return LIST.filter(x => new RegExp(x.town).test(town) && (!x.months || x.months.includes(c.month)) && (x.where !== 'higata' || higata)).slice(0, MAX);
  }
  // 輪に なった ときの お米の ひと言（「提灯と うなぎと よるの さんぽだよ」）
  function say(items) {
    return items.map(x => x.name).join('と') + 'と よるの さんぽだよ';
  }
  root.NISHIO_MEGURI = { LIST, MAX, END, ring, say };
})(window);
