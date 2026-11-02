// 11/2 運営者の声「しゃべらなくていい。吹き出し廃止」：かおりちゃんの おはなし窓は なくなった。
// 窓は 作らない・出さない。game.js が こわれないよう、API の 形だけ のこす（say は いつも false、on は いつも false）。
// 行き先は 既存の 知らせ・ガイドチップで 決まる。nsg_kome_talk の 保存は 見ない。
(function (root) {
  root.nishioKomeTalk = {
    say: () => false,
    on: () => false,
    setOn: () => {},
    clear: () => {},
    get open() { return false; },
    close: () => {},
    get text() { return ''; },
    pickFor: () => {}
  };
})(window);
