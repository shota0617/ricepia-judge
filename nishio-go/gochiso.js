// お米つぶの ごちそう：転がるのを やめて 止まると、いる 町と 今の 月に 合った 西尾の 名物食が 目の 前に 出て、お米が「いただきます」。もぐもぐ 食べて、「ごちそうさま」の ひと言
// （pixel.js の gochisoStep。名所の 西尾ばなし＝komebanashi.js・ひとりごと＝michikusa.js・あとを ついてくる おとも＝otomo.js・あたまに のせる にもつ＝nimotsu.js・ゆめ＝yume.js・
//  生きものとの であい＝deai.js・道に こぼす こぼれもの＝kobore.js とは ちがい、止まった お米が 名物食を「食べる」行動。絵は おともと 同じ drawNakama）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・id：絵の 名前（pixel.js の drawNakama と そろえる）。town：その 町名の 所だけ（町名の 正規表現。地区の 町名は pixel.js の here.town）
// ・months：その 月だけ。say：食べおわった とき お米が 言う ことば（みじかく。かざりの 絵文字は つけない）
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 調べた 中身だけ（そこに ない 数字・名前は 書かない）
(function (root) {
  const NK = 'https://nishiokanko.com/tw/specialty/';
  const NIS = '^(?!一色町|吉良町|東幡豆町|西幡豆町|鳥羽町|寺部町)';   // 西尾地区の 町（一色・吉良・幡豆の 町を のぞく）
  const LIST = [
    { id: 'unadon', name: 'うな丼', town: '^一色町', say: 'うな丼、おいしかった', src: NK },
    { id: 'ebisen', name: 'えびせんべい', town: '^一色町', say: 'えびせん、ぱりぱりだった', src: NK },
    { id: 'parfait', name: '抹茶パフェ', town: NIS, months: [5, 6, 7, 8, 9], say: '抹茶パフェ、おいしかった', src: NK },
    { id: 'kakigori', name: 'かき氷', town: NIS, months: [6, 7, 8, 9], say: 'かき氷、ひんやりだった', src: NK },
    { id: 'chasoba', name: '茶そば', town: NIS, say: '茶そば、おいしかった', src: NK },
  ];
  // いる 所：{ city, town, month }
  // 西尾市の 中で、いる 町と 月に 合う 名物食を 1つ えらぶ。last＝まえに 食べた id（なるべく ちがう ものを）、rand＝0〜1の 乱数。なければ null
  function pick(c, last, rand) {
    if (!c || !/西尾/.test(c.city || '')) return null;
    const town = c.town || '';
    const mine = LIST.filter(x => new RegExp(x.town).test(town) && (!x.months || x.months.includes(c.month)));
    if (!mine.length) return null;
    const other = mine.filter(x => x.id !== last);
    const from = other.length ? other : mine;
    return from[Math.min(from.length - 1, Math.floor((rand ? rand() : Math.random()) * from.length))];
  }
  root.NISHIO_GOCHISO = { LIST, pick };
})(window);
