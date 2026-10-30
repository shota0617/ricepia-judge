// お米つぶの おてだま：ぴょんと とびはねた とき、お米つぶが いる 町と 今の 月に 合った 西尾の 名物を、あたまの 上に ぽーんと ほうりなげて、おちて きたら キャッチ。
// 「とれた」の ひと言。（pixel.js の otedamaStep。名所の 西尾ばなし＝komebanashi.js・ひとりごと＝michikusa.js・おとも＝otomo.js・にもつ＝nimotsu.js・ゆめ＝yume.js・
//  であい＝deai.js・こぼれもの＝kobore.js・ごちそう＝gochiso.js とは ちがい、お米の「とびはねる」動きに 合わせて 名物を ほうり、受けとめる あそび。絵は おともと 同じ drawNakama）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・id：絵の 名前（pixel.js の drawNakama と そろえる）。town：その 町名の 所だけ（町名の 正規表現。地区の 町名は pixel.js の here.town）
// ・months：その 月だけ。where：'higata'＝まわりに 海水域が ある 所だけ。say：キャッチした とき お米が 言う ことば（みじかく。かざりの 絵文字は つけない）
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 調べた 中身だけ（そこに ない 数字・名前は 書かない）
(function (root) {
  const NK = 'https://nishiokanko.com/tw/specialty/', MAFF = 'https://www.maff.go.jp/j/nousin/sekkei/museum/m_kakuti/27_kogane/index.html',
    AN = 'https://aichinow.pref.aichi.jp/modelcourse/detail/122/';
  const NIS = '^(?!一色町|吉良町|東幡豆町|西幡豆町|鳥羽町|寺部町)';   // 西尾地区の 町（一色・吉良・幡豆の 町を のぞく）
  const LIST = [
    { id: 'unagi', name: 'うなぎ', town: '^一色町', say: 'うなぎ、とれた', src: NK },
    { id: 'ebisen', name: 'えびせんべい', town: '^一色町', say: 'えびせん、とれた', src: NK },
    { id: 'chochin', name: '提灯', town: '^一色町', say: '提灯、とれた', src: NK },
    { id: 'tencha', name: 'てん茶の 葉', town: NIS, months: [4, 5], say: '茶の葉、とれた', src: NK },
    { id: 'chawan', name: '抹茶わん', town: NIS, say: '抹茶わん、とれた', src: NK },
    { id: 'inaho', name: '稲穂', town: '^吉良町', say: '稲穂、とれた', src: MAFF },
    { id: 'carnation', name: 'カーネーション', town: '^(東幡豆町|西幡豆町)', say: 'カーネーション、とれた', src: NK },
    { id: 'asari', name: 'アサリ', town: '^(一色町|吉良町|東幡豆町|西幡豆町)', where: 'higata', say: 'アサリ、とれた', src: AN },
  ];
  // いる 所：{ city, town, near（まわり 100m メッシュの 土地利用の 文字を まとめた 文字列）, month }
  // 西尾市の 中で、いる 所に 合う 候補を すべて かえす（なければ 空）
  function candidates(c) {
    if (!c || !/西尾/.test(c.city || '')) return [];
    const town = c.town || '', higata = (c.near || '').includes('k');
    return LIST.filter(x => new RegExp(x.town).test(town) && (!x.months || x.months.includes(c.month)) && (x.where !== 'higata' || higata));
  }
  // 候補から 1つ えらぶ。last＝まえに ほうった id（なるべく ちがう ものを）、rand＝0〜1の 乱数。なければ null
  function pick(c, last, rand) {
    const mine = candidates(c);
    if (!mine.length) return null;
    const other = mine.filter(x => x.id !== last);
    const from = other.length ? other : mine;
    return from[Math.min(from.length - 1, Math.floor((rand ? rand() : Math.random()) * from.length))];
  }
  root.NISHIO_OTEDAMA = { LIST, candidates, pick };
})(window);
