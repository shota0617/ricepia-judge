// お米つぶの にもつ：行き先に 着くと、その地区の 名物を お米つぶが あたまに のせて 転がる（つぎの 行き先に 着くまで・長くても 1日）
// （kometalk.js の「着いたね！」の あと、西尾ばなしの 次に ひと言。pixel.js の drawNimotsu が 転がっている お米の あたまに 描く。
//  名所で 話す 西尾ばなし＝komebanashi.js・道ばたの ひとりごと＝michikusa.js・あとを ついてくる おとも＝otomo.js とは ちがい、主人公が「持ち物を 身に つけた すがた」に 変わる）
// 手帳や 図鑑では なく、主人公の 見た目として 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・area：着いた 名所の 地区（areas.json の id。となりの 市町など 地区の ない 所では 持ち物は 変わらない）
// ・id：絵の 名前（pixel.js の drawNakama と そろえる）。months：その 月だけ 先に 出す。say：着いた とき お米が 言う ことば（かざりの 絵文字は つけない）
// ・src：出どころ。事実は docs/nishio-rashisa-brief.md の 調べた 中身だけ（そこに ない 数字・名前は 書かない）
(function (root) {
  const NK = 'https://nishiokanko.com/tw/specialty/', AN = 'https://aichinow.pref.aichi.jp/modelcourse/detail/122/',
    MAFF = 'https://www.maff.go.jp/j/nousin/sekkei/museum/m_kakuti/27_kogane/index.html';
  const KEEP = 24 * 3600 * 1000;   // 持ち物を のせて いる 長さ（つぎの 名所に 着かなくても 1日で おろす）
  const LIST = [
    { id: 'tencha', area: 'nishio', name: 'てん茶の 葉', months: [4, 5], say: '茶摘みの 葉を あたまに のせたよ。', src: NK },
    { id: 'chawan', area: 'nishio', name: '抹茶わん', say: '抹茶わんを あたまに のせたよ。こぼさんように 転がるよ。', src: NK },
    { id: 'unagi', area: 'isshiki', name: 'うなぎ', say: 'うなぎを あたまに のせたよ。落とさんように 転がるよ。', src: NK },
    { id: 'ebisen', area: 'isshiki', name: 'えびせんべい', say: 'えびせんべいを あたまに のせたよ。', src: NK },
    { id: 'chochin', area: 'isshiki', name: '提灯', say: '小さな 提灯を のせたよ。大提灯まつりの 大きさには かなわんけど。', src: NK },
    { id: 'inaho', area: 'kira', name: '金色の 稲穂', months: [9, 10], say: '金色の 稲穂を あたまに のせたよ。黄金堤の 名前の とおりだら。', src: MAFF },
    { id: 'inaho', area: 'kira', name: '稲穂', say: '稲穂を あたまに のせたよ。お米の ふるさとだね。', src: MAFF },
    { id: 'carnation', area: 'hazu', name: 'カーネーション', say: 'カーネーションを あたまに かざったよ。', src: NK },
    { id: 'asari', area: 'sakushima', name: 'アサリ', say: 'アサリを あたまに のせたよ。島の 海の 幸だよ。', src: AN },
  ];
  // 着いた 地区と 月で 持ち物を 1つ えらぶ。last＝いま のせて いる 持ち物の id（なるべく ちがう ものを）、rand＝0〜1の 乱数。地区に 持ち物が なければ null
  function pick(area, month, last, rand) {
    const mine = LIST.filter(x => x.area === area);
    if (!mine.length) return null;
    let from = mine.filter(x => !x.months || x.months.includes(month));
    from = from.filter(x => x.months || !from.some(y => y.months && y.id === x.id));   // 同じ 絵で 月の 合う ものが あれば そちらを 先に
    const other = from.filter(x => x.id !== last);
    const pool = other.length ? other : from;
    return pool[Math.min(pool.length - 1, Math.floor((rand ? rand() : Math.random()) * pool.length))];
  }
  // 記録（{ id, t }）から、いま のせて いる 絵の id（1日たったら ''）
  function current(rec, now) {
    return rec && rec.id && now - rec.t < KEEP && LIST.some(x => x.id === rec.id) ? rec.id : '';
  }
  root.NISHIO_NIMOTSU = { LIST, KEEP, pick, current };
})(window);
