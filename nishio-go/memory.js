// きろくの 大きな 絵あわせカード（神経衰弱）：西尾の 名物 6種×2枚。位置を おぼえて 同じ絵を そろえる 遊び。
// 純関数だけ（DOM・保存・ポイントには 触らない）。並びは 日づけで 決まる（日が かわれば 新しい 組）。
(function (root) {
  const ICONS = ['🍵', '🍚', '🌾', '🏯', '🦐', '🌸'];
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
  function deck(dayStr) {
    const day = typeof dayStr === 'string' ? dayStr : '';
    const cards = [];
    ICONS.forEach((icon, pair) => { cards.push({ pair, icon }, { pair, icon }); });
    const r = rng(seedOf(day));
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = cards[i]; cards[i] = cards[j]; cards[j] = t;
    }
    return cards;
  }
  function judge(a, b) {
    const ok = v => typeof v === 'number' && Number.isInteger(v);
    return ok(a) && ok(b) && a === b;
  }
  root.nishioMemory = { deck, judge };
})(typeof window !== 'undefined' ? window : globalThis);
