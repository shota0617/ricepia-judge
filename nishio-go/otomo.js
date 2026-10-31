// お米つぶの おとも：転がって いる 町と 今の 月に 合わせて、西尾の 名物が お米つぶの あとを ころころ ついて くる
// （pixel.js の nakamaStep。畑の となりで 出る 季節の 作物＝いちご・なす・大豆と おなじ しくみで、こちらは 町の 名物。
//  出て きた とき、お米が 吹き出しで ひと言。名所で 話す 西尾ばなし＝komebanashi.js・道ばたの ひとりごと＝michikusa.js とは ちがい、主人公と 「いっしょに いる もの」が 変わる）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・id：絵の 名前（pixel.js の drawNakama と そろえる）。town：その 町名の 所だけ（町名の 正規表現。地区の 町名は pixel.js の here.town）
// ・months：その 月だけ。where：'higata'＝まわりに 海水域が ある 所だけ。say：吹き出しの ことば（みじかく。かざりの 絵文字は つけない）
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 調べた 中身だけ
(function (root) {
  const NK = 'https://nishiokanko.com/tw/specialty/', MAFF = 'https://www.maff.go.jp/j/nousin/sekkei/museum/m_kakuti/27_kogane/index.html',
    AN = 'https://aichinow.pref.aichi.jp/modelcourse/detail/122/';
  const NIS = '^(?!一色町|吉良町|東幡豆町|西幡豆町|鳥羽町|寺部町)';   // 西尾地区の 町（一色・吉良・幡豆の 町を のぞく）
  const LIST = [
    { id: 'unagi', name: 'うなぎ', town: '^一色町', say: 'うなぎが ついてきた', src: NK },
    { id: 'ebisen', name: 'えびせんべい', town: '^一色町', say: 'えびせんが ついてきた', src: NK },
    { id: 'tencha', name: 'てん茶の 葉', town: NIS, months: [4, 5], say: '茶摘みの 葉が ついてきた', src: NK },
    { id: 'tencha', name: 'てん茶の 葉', town: NIS, say: 'てん茶の 葉が ついてきた', src: NK },
    { id: 'inaho', name: '金色の 稲穂', town: '^吉良町', months: [9, 10], say: '金色の 稲穂だよ', src: MAFF },
    { id: 'asari', name: 'アサリ', town: '^(一色町|吉良町|東幡豆町|西幡豆町)', where: 'higata', say: 'アサリが ついてきた', src: AN },
  ];
  // いる 所：{ city, town, near（まわり 100m メッシュの 土地利用の 文字を まとめた 文字列）, month }
  // 西尾市の 中で、いる 所に 合う おともを 1つ えらぶ。last＝まえの おともの id（なるべく ちがう ものを）、rand＝0〜1の 乱数
  // なければ null
  function pick(c, last, rand) {
    if (!c || !/西尾/.test(c.city || '')) return null;
    const town = c.town || '', higata = (c.near || '').includes('k');
    const ok = x => new RegExp(x.town).test(town) && (!x.months || x.months.includes(c.month)) && (x.where !== 'higata' || higata);
    let mine = LIST.filter(ok);
    mine = mine.filter(x => x.months || !mine.some(y => y.months && y.id === x.id));   // 同じ 絵で 月の 合う 話が あれば そちらを 先に（月なしは ゆずる）
    if (!mine.length) return null;
    const other = mine.filter(x => x.id !== last);
    const from = other.length ? other : mine;
    return from[Math.min(from.length - 1, Math.floor((rand ? rand() : Math.random()) * from.length))];
  }
  root.NISHIO_OTOMO = { LIST, pick };
})(window);
