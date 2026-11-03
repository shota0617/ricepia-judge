// きろくの 大きな スライドパズル：西尾の 名物 8種＋空き1マスの 3×3。空きへ となりの タイルを すべらせて 元の 並びに もどす。
// 純関数だけ（DOM・保存・ポイントには 触らない）。並びは 日づけで 決まり、完成形から 実際に すべらせて 作るので 必ず とける。
(function (root) {
  const N = 9, BLANK = 8;
  function seedOf(s) {   // FNV-1a
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function rng(seed) {   // mulberry32
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function near(a, b) {
    const dr = Math.abs(((a / 3) | 0) - ((b / 3) | 0)), dc = Math.abs((a % 3) - (b % 3));
    return dr + dc === 1;
  }
  function isTiles(t) {
    if (!Array.isArray(t) || t.length !== N) return false;
    const seen = new Array(N).fill(false);
    for (const v of t) {
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= N || seen[v]) return false;
      seen[v] = true;
    }
    return true;
  }
  function move(tiles, idx) {
    if (!Array.isArray(tiles)) return [];
    const out = tiles.slice();
    if (!isTiles(tiles) || typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= N) return out;
    const b = tiles.indexOf(BLANK);
    if (!near(idx, b)) return out;
    out[b] = out[idx]; out[idx] = BLANK;
    return out;
  }
  function start(dayStr) {
    const day = typeof dayStr === 'string' ? dayStr : '';
    const r = rng(seedOf(day));
    for (;;) {
      let t = [0, 1, 2, 3, 4, 5, 6, 7, 8], prev = -1;
      for (let k = 0; k < 40; k++) {
        const b = t.indexOf(BLANK), opts = [];
        for (let i = 0; i < N; i++) if (near(i, b) && i !== prev) opts.push(i);
        const i = opts[Math.floor(r() * opts.length)];
        prev = b;   // 空きが もどる 先（直前の 空きの 位置）への 逆戻しを さける
        t = move(t, i);
      }
      if (!solved(t)) return t;
    }
  }
  function solved(tiles) {
    return Array.isArray(tiles) && tiles.length === N && tiles.every((v, i) => v === i);
  }
  root.nishioSlidePuzzle = { start, move, solved };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.nishioSlidePuzzle;
})(typeof window !== 'undefined' ? window : globalThis);
