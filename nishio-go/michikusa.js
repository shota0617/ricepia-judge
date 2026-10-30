// お米つぶの みちくさ：転がって いる 最中に、いる 所（田んぼ・川や池・干潟・町）と 今の 月に 合わせて、お米つぶが 吹き出しで ひとりごとを 言う
// （pixel.js の riceSay。名所に 着いた ときの 西尾ばなし＝komebanashi.js とは ちがい、道ばたで 主人公が 自分で 気づく 形）。
// 手帳や 図鑑では なく、主人公の セリフとして 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・where：どこで 言うか。paddy＝田んぼ（土地利用が 田）／kawa＝川・池・用水の そば（海では ない 水べ）／higata＝海べ（まわりに 海水域）／
//   hatake＝田では ない 農用地／machi＝町名で 決める（town：町名の 正規表現）。地区の 町名は pixel.js の here.town（mzMeibutsuTip と 同じ 見かた）
// ・town：ある ものは その 町名の 所だけ。months：その 月だけ 先に 出す。say：吹き出しの ことば（みじかく。かざりの 絵文字は つけない）
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 調べた 中身だけ（そこに ない 数字・名前は 書かない）
(function (root) {
  const NK = 'https://nishiokanko.com/tw/specialty/', MLIT = 'https://www.mlit.go.jp/river/basic_info/jigyo_keikaku/gaiyou/seibi/pdf/yahagigawa-5.pdf',
    MAFF = 'https://www.maff.go.jp/j/nousin/sekkei/museum/m_kakuti/27_kogane/index.html', AN = 'https://aichinow.pref.aichi.jp/modelcourse/detail/122/';
  const NIS = '^(?!一色町|吉良町|東幡豆町|西幡豆町|鳥羽町|寺部町)';   // 西尾地区の 町（一色・吉良・幡豆の 町を のぞく）
  const LIST = [
    // 田んぼの上で（どの町でも）
    { id: 'p-medaka', where: 'paddy', months: [4, 5, 6, 7, 8, 9], say: 'メダカ、いるかな', src: MLIT },
    { id: 'p-ishigame', where: 'paddy', say: 'イシガメも 来るのかな', src: MLIT },
    { id: 'p-doji', where: 'paddy', months: [5, 6, 7, 8, 9], say: 'ドジョウの 田んぼだに', src: MLIT },
    // 吉良の 田んぼ（黄金堤）
    { id: 'p-kogane', where: 'paddy', town: '^吉良町', say: '黄金堤が 守った 田んぼだに', src: MAFF },
    { id: 'p-kogane-aki', where: 'paddy', town: '^吉良町', months: [9, 10], say: '稲穂が 金色だに', src: MAFF },
    // 川・池・用水の そば
    { id: 'k-akaza', where: 'kawa', say: 'アカザは いるかな', src: MLIT },
    { id: 'k-misago', where: 'kawa', say: 'ミサゴが 見とるかも', src: MLIT },
    { id: 'k-kamatsuka', where: 'kawa', say: 'カマツカの 川だに', src: MLIT },
    // 海べ（一色・吉良・幡豆）
    { id: 'h-asari', where: 'higata', town: '^(一色町|吉良町|東幡豆町|西幡豆町)', say: 'アサリの 海だに', src: AN },
    { id: 'h-shijimi', where: 'higata', town: '^一色町', say: 'ヤマトシジミも いるに', src: MLIT },
    { id: 'h-kochidori', where: 'higata', town: '^一色町', say: 'コチドリが いるかな', src: MLIT },
    // 町で
    { id: 'm-unagi', where: 'machi', town: '^一色町', say: '一色は うなぎの 町だに', src: NK },
    { id: 'm-ebisen', where: 'machi', town: '^一色町', say: 'えびせんべいの 町だに', src: NK },
    { id: 'm-chochin', where: 'machi', town: '^一色町', say: '大提灯まつりの 町だに', src: NK },
    { id: 'm-kira', where: 'machi', town: '^吉良町', say: '吉良は 黄金堤の 里だに', src: MAFF },
    { id: 'm-matcha', where: 'machi', town: NIS, say: '西尾は 抹茶の 町だに', src: NK },
    { id: 'm-mikane', where: 'machi', town: '^(東幡豆町|西幡豆町)', say: '三ヶ根山が 見えるに', src: NK },
    // 農用地（田では ない 畑）。西尾の 畑だと 決まった わけでは ないので「かも」で言う
    { id: 'f-tencha', where: 'hatake', town: NIS, months: [4, 5], say: '茶摘みの ころだに', src: NK },
    { id: 'f-tencha2', where: 'hatake', town: NIS, say: 'てん茶の 畑かも', src: NK },
    { id: 'f-hana', where: 'hatake', say: 'カーネーションの 畑かも', src: NK },
  ];
  // いる 所：{ city, town, land（土地利用の 1文字）, near（まわり 100m メッシュの 文字を まとめた 文字列）, month }
  function whereOf(c) {
    const near = c.near || '', out = new Set();
    if (c.land === 'a') out.add('paddy');
    if (c.land === 'b') out.add('hatake');
    if (near.includes('k')) out.add('higata');
    else if (c.land === 'i' || near.includes('i')) out.add('kawa');
    if (c.town) out.add('machi');
    return out;
  }
  // 西尾市の 中で、いる 所に 合う ひとりごとを 1つ えらぶ。seen＝もう 言った id（ひとめぐり したら 忘れて 最初から）
  // 戻り値：{ item, seen }。なければ null。月が 合う ものを 先に、同じ 所の 話を ひとめぐり するまで 同じ ことは くりかえさない
  function pick(c, seen) {
    if (!c || !/西尾/.test(c.city || '')) return null;
    const w = whereOf(c), town = c.town || '';
    const ok = x => w.has(x.where) && (!x.town || new RegExp(x.town).test(town));
    const mine = LIST.filter(x => ok(x) && (!x.months || x.months.includes(c.month)));   // 月の ちがう 話は 出さない
    if (!mine.length) return null;
    let base = seen || [], left = mine.filter(x => !base.includes(x.id));
    if (!left.length) { left = mine; base = base.filter(id => !mine.some(x => x.id === id)); }
    const best = left.find(x => x.months) || left[0];   // 月が 合う 話を 先に
    return { item: best, seen: [...base, best.id].slice(-40) };
  }
  root.NISHIO_MICHIKUSA = { LIST, pick, whereOf };
})(window);
