// お米つぶの ものさし：西尾市の 中を 転がった 道のりを、吉良の 黄金堤の 長さ（180m）で はかる。
// お米の 左よこに 小さな 堤の めもりが 出て、転がるほど 左から 金色に たまり、180mごとに「黄金堤 ○本ぶん」と お米が ひと言。
// 道のりは この 端末に おぼえて（nsg_monosashi）、あそび直しても つづく。
// （これまでは 時間・場所・止まる こと・地区の 境・タップが きっかけ。これは 転がった 道のりそのものが きっかけで、黄金堤の 長さが ものさしに なる）
// 手帳や 図鑑では なく、主人公の そばに 出す（docs/nishio-rashisa-brief.md の 設計原則）
// ・事実は docs/nishio-rashisa-brief.md の 5 の 黄金堤（長さ180m・高さ4m）だけ。そこに ない 数字は ことばに 書かない（本数は 転がった 道のりの 計算）
(function (root) {
  const SRC = 'https://www.maff.go.jp/j/nousin/sekkei/museum/m_kakuti/27_kogane/index.html';
  const LEN_M = 180;        // 黄金堤の 長さ（m）
  const KEY = 'nsg_monosashi';
  const SHOW = 4000;        // 転がるのを やめて から めもりが 消えるまで（ミリ秒）
  const POP = 1200;         // 1本 できた とき めもりが ぴかっと 光る ミリ秒
  const MAX_M = 1e9;        // 壊れた 値で あふれない ための 上限
  // おぼえて いる 道のり（m）。壊れた 値は 0
  function clean(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_M) : 0;
  }
  // 道のり total（m）に dm（m）を 足す。返す：{ total, born（新しく できた 黄金堤の 本数）}
  function add(total, dm) {
    const a = clean(total), d = clean(dm), b = clean(a + d);
    return { total: b, born: Math.floor(b / LEN_M) - Math.floor(a / LEN_M) };
  }
  // めもりの ようす。n＝できた 本数、frac＝いまの 1本の 何割か（0〜1）
  function gauge(total) {
    const t = clean(total);
    return { n: Math.floor(t / LEN_M), frac: (t % LEN_M) / LEN_M };
  }
  // 本数 n に なった とき お米が 言う ことば
  function say(n) {
    if (n <= 1) return '180m ころがったに。黄金堤の 長さと おなじだに';
    return '黄金堤 ' + n + '本ぶん ころがったに。1本は 180mだに';
  }
  root.NISHIO_MONOSASHI = { LEN_M, KEY, SHOW, POP, SRC, clean, add, gauge, say };
})(window);
