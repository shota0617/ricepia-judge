// お米つぶの おかえり：しばらく あいだを あけて あそびに もどると、西尾市に 入ったとき お米が「おかえり。3日ぶりだね」と むかえ、
// いる 地区の 名物（月に 合う もの）が お米の よこに ぴょこんと 出て「〜も 待っとったよ」と ひと言。ひと回の あそびに 1回だけ。
// 最後に あそんだ 日は この 端末に おぼえる（nsg_okaeri）。
// （これまでは 時間・場所・止まる こと・地区の 境・タップ・転がった 道のりが きっかけ。これは「もどってきた こと」そのものが きっかけで、お米が 帰りを 迎える）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・名物と 地区の 名前は youkoso.js・shirushi.js の ものを 共用（ブリーフ 1〜5）。ことばの 数字は 日数だけ（あそんだ 日の 計算で、ブリーフの 事実ではない）
(function (root) {
  const KEY = 'nsg_okaeri';
  const SHOW = 5500;      // 名物が お米の よこに いる ミリ秒
  const SAVE = 30000;     // 「最後に あそんだ」を 書きなおす 間かく（ミリ秒）
  const LONG = 30;        // この 日数 いじょうは 数えずに「ひさしぶり」
  const DAY = 86400000;
  // おぼえて いる 時刻。壊れた 値は 0（はじめて）
  function clean(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  // 前に あそんだ 日から 今日までの 日数（日づけの 差。同じ 日は 0、はじめて・未来の 値は 0）
  function days(prev, now) {
    const p = clean(prev);
    if (!p || p > now) return 0;
    const a = new Date(p), b = new Date(now);
    const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()), db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.max(0, Math.round((db - da) / DAY));
  }
  // お米の ことば。n＝日数（1以上）、area＝地区の 名前（西尾 など）、item＝名物の 名前
  function say(n, area, item) {
    const ago = n >= LONG ? 'ひさしぶりだね' : n === 1 ? 'きのうぶりだね' : n + '日ぶりだね';
    return 'おかえり。' + ago + '。' + area + 'の ' + item + 'も 待っとったよ';
  }
  root.NISHIO_OKAERI = { KEY, SHOW, SAVE, LONG, clean, days, say };
})(window);
