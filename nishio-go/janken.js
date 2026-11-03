// きろくの 大きな じゃんけん：0=✊ 1=✌️ 2=✋。相手の 手は 日づけで 決まり、勝ち負けは 手の 絵だけで 決まる。
// 純関数だけ（DOM・保存・ポイントには 触らない）。
(function (root) {
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
  function ok(h) { return typeof h === 'number' && Number.isInteger(h) && h >= 0 && h <= 2; }
  function handOf(dayStr) {
    const day = typeof dayStr === 'string' ? dayStr : '';
    return Math.min(2, Math.floor(rng(seedOf(day))() * 3));
  }
  function judge(mine, theirs) {
    if (!ok(mine) || !ok(theirs) || mine === theirs) return 'draw';
    return (mine + 1) % 3 === theirs ? 'win' : 'lose';
  }
  root.nishioJanken = { handOf, judge };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.nishioJanken;
})(typeof window !== 'undefined' ? window : globalThis);
