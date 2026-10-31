// お米つぶの であい：転がって いる 最中に、いる 所（田んぼ・川や池・海べ）に 合った 西尾の 生きものが、お米の すこし 前に 姿を 見せる。
// お米は にこにこ顔で ひと言（吹き出し）。生きものは ぴょこぴょこ して、しばらくして はねて いなくなる
// （pixel.js の deaiStep。名所の 西尾ばなし＝komebanashi.js・道ばたの ひとりごと＝michikusa.js・あとを ついてくる おとも＝otomo.js とは ちがい、主人公の 目の 前に 生きものが 出て くる「出会い」。
//  絵は 生きもの手帳と 同じ 16×16〈critterSprites〉。手帳には 書かない：お米つぶの 旅の 中の 場面）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・id：絵の 名前（pixel.js の CRITTER_ROWS と そろえる）。where：paddy＝田んぼ／kawa＝海では ない 川・池・用水の そば／higata＝海べ（まわりに 海水域。town で 町を しぼる）
// ・months：その 月だけ。say：お米の ことば（みじかく。かざりの 絵文字は つけない）。メダカは 水の ある 所だけ（田んぼ・川）、干潟の 生きものは 海べだけ
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 調べた 中身だけ（そこに ない 数字・名前は 書かない）
(function (root) {
  const MLIT = 'https://www.mlit.go.jp/river/basic_info/jigyo_keikaku/gaiyou/seibi/pdf/yahagigawa-5.pdf';
  const LIST = [
    // 田んぼで
    { id: 'medaka', name: 'メダカ', where: 'paddy', months: [4, 5, 6, 7, 8, 9], say: 'メダカが おったよ', src: MLIT },
    { id: 'dojo', name: 'ドジョウ', where: 'paddy', months: [5, 6, 7, 8, 9], say: 'ドジョウが 出てきた', src: MLIT },
    { id: 'ishigame', name: 'ニホンイシガメ', where: 'paddy', say: 'イシガメが 田んぼに', src: MLIT },
    // 川・池・用水で
    { id: 'kamatsuka', name: 'カマツカ', where: 'kawa', say: 'カマツカだよ', src: MLIT },
    { id: 'akaza', name: 'アカザ', where: 'kawa', say: 'アカザが おった', src: MLIT },
    { id: 'misago', name: 'ミサゴ', where: 'kawa', say: 'ミサゴが 見とるよ', src: MLIT },
    // 海べ（一色・吉良・幡豆）で
    { id: 'asari', name: 'アサリ', where: 'higata', town: '^(一色町|吉良町|東幡豆町|西幡豆町)', say: 'アサリが おった', src: MLIT },
    { id: 'shijimi', name: 'ヤマトシジミ', where: 'higata', town: '^一色町', say: 'ヤマトシジミだよ', src: MLIT },
    { id: 'kochidori', name: 'コチドリ', where: 'higata', town: '^一色町', say: 'コチドリが 来とる', src: MLIT },
  ];
  // いる 所：{ city, town, land（土地利用の 1文字）, near（まわり 100m メッシュの 文字を まとめた 文字列）, month }。場所の 見かたは michikusa.js の whereOf と 同じ
  // 西尾市の 中で、いる 所に 合う 生きものを 1つ えらぶ。last＝まえに 会った id（なるべく ちがう ものを）、rand＝0〜1の 乱数。なければ null
  function pick(c, last, rand) {
    const M = root.NISHIO_MICHIKUSA;
    if (!c || !M || !/西尾/.test(c.city || '')) return null;
    const w = M.whereOf(c), town = c.town || '';
    const mine = LIST.filter(x => w.has(x.where) && (!x.town || new RegExp(x.town).test(town)) && (!x.months || x.months.includes(c.month)));
    if (!mine.length) return null;
    const other = mine.filter(x => x.id !== last);
    const from = other.length ? other : mine;
    return from[Math.min(from.length - 1, Math.floor((rand ? rand() : Math.random()) * from.length))];
  }
  root.NISHIO_DEAI = { LIST, pick };
})(window);
