// きろくの 大きな ビンゴカード：5地区×5スポットの マスが、めぐるたびに 1つずつ 押される。
// 純関数だけ（DOM・保存・ポイントには 触らない）。タテ・ヨコ・ナナメが そろうと line が つく。
(function (root) {
  const N = 5;
  function bingoCard(rows) {
    const src = Array.isArray(rows) ? rows : [];
    const cells = [];
    for (let r = 0; r < N; r++) {
      const row = src[r];
      const rc = row && Array.isArray(row.cells) ? row.cells : [];
      for (let c = 0; c < N; c++) {
        const free = c >= rc.length;
        const on = free ? true : !!rc[c] && rc[c].on === true;
        cells.push({ on, free, line: false, row: r, col: c });
      }
    }
    const lines = [];
    const full = idx => idx.every(i => cells[i].on);
    const mark = idx => idx.forEach(i => { cells[i].line = true; });
    const seq = Array.from({ length: N }, (_, i) => i);
    seq.forEach(r => { const idx = seq.map(c => r * N + c); if (full(idx)) { lines.push({ type: 'row', index: r }); mark(idx); } });
    seq.forEach(c => { const idx = seq.map(r => r * N + c); if (full(idx)) { lines.push({ type: 'col', index: c }); mark(idx); } });
    const d0 = seq.map(i => i * N + i), d1 = seq.map(i => i * N + (N - 1 - i));
    if (full(d0)) { lines.push({ type: 'diag', index: 0 }); mark(d0); }
    if (full(d1)) { lines.push({ type: 'diag', index: 1 }); mark(d1); }
    return { cells, lines, lineCount: lines.length, onCount: cells.filter(c => c.on).length, total: N * N };
  }
  root.nishioBingo = { bingoCard };
})(typeof window !== 'undefined' ? window : globalThis);
