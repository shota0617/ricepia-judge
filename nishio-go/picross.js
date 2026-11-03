// きろくの 大きな ドット絵（かおりちゃん）：めぐるほど 少しずつ あらわれる（ピクロスのように）。
// 純関数だけ（DOM・保存・ポイントには 触らない）。
(function (root) {
  const PATTERN = [
    '.....g......',
    '....ggg.g...',
    '.....g.gg...',
    '..oooooooo..',
    '.owwwwwwwwo.',
    '.owkwwwwkwo.',
    '.owkwwwwkwo.',
    '.owwwwwwwwo.',
    '.owwwmmwwwo.',
    '.owwwwwwwwo.',
    '..oooooooo..',
    '............'
  ];
  const COLORS = { g: '#58a447', o: '#7a5a2e', w: '#ffffff', k: '#33302a', m: '#e58aa5', '.': '#dceccf' };
  const N = 144;
  // 色づく順：インデックスのハッシュ順（決まった順で、全体に散らばる）
  const ORDER = Array.from({ length: N }, (_, i) => i)
    .sort((a, b) => ((Math.imul(a + 1, 2654435761) >>> 0) - (Math.imul(b + 1, 2654435761) >>> 0)) || a - b);
  const RANK = new Array(N);
  ORDER.forEach((idx, r) => { RANK[idx] = r; });
  function num(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; }
  function reveal(done, total) {
    const t = Math.floor(num(total));
    const d = t > 0 ? Math.min(Math.floor(num(done)), t) : 0;
    let shown = 0;
    if (t > 0) {
      if (d >= t) shown = N;
      else shown = d > 0 ? Math.min(N - 1, Math.max(1, Math.floor(d / t * N))) : 0;
    }
    const chars = PATTERN.join('');
    const cells = Array.from({ length: N }, (_, i) => {
      const on = RANK[i] < shown, ch = chars[i];
      return { ch, color: on ? COLORS[ch] : null, on };
    });
    return { cells, shown, cellsTotal: N, done: d, total: t };
  }
  root.nishioPicross = { PATTERN, COLORS, reveal };
})(typeof window !== 'undefined' ? window : globalThis);
