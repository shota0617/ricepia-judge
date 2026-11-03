// 風景の描き分け（西尾らしさ1）：地区ごとに 大きな模様（茶畑のうね・港の波・浜の寄せ波・山並み・島の輪）を 地面に薄く重ねる。
// 純関数だけ（DOM・保存・ポイントには触らない）。文字・札は ない。絵は pixel.js の drawTile が 描く。
(function (root) {
  const MOTIFS = {
    nishio: { kind: 'tea', color: '46,96,44' },        // 茶畑のうね（横縞）
    isshiki: { kind: 'wave', color: '38,110,170' },    // 港・海の波
    kira: { kind: 'shore', color: '214,164,84' },      // 浜の寄せ波（斜めの弧）
    hazu: { kind: 'hill', color: '104,84,150' },       // 山並み（三角）
    sakushima: { kind: 'island', color: '24,138,128' } // 島の輪（同心円）
  };
  for (const k in MOTIFS) Object.freeze(MOTIFS[k]);
  Object.freeze(MOTIFS);
  function motifFor(areaId) {
    try {
      const m = typeof areaId === 'string' && Object.prototype.hasOwnProperty.call(MOTIFS, areaId) ? MOTIFS[areaId] : null;
      return m ? { kind: m.kind, color: m.color } : null;
    } catch (e) { return null; }
  }
  // タイル座標から決まる 模様の位相（0〜3）。同じ座標なら いつも同じ。不正な値は 0
  function phase(tx, ty) {
    try {
      if (typeof tx !== 'number' || typeof ty !== 'number' || !isFinite(tx) || !isFinite(ty)) return 0;
      const x = Math.floor(tx), y = Math.floor(ty);
      return (((x * 7 + y * 13 + x * y) % 4) + 4) % 4;
    } catch (e) { return 0; }
  }
  root.nishioLandscape = { MOTIFS, motifFor, phase };
})(typeof window !== 'undefined' ? window : globalThis);
