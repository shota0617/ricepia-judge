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
  // 区画（SPAN×SPAN マス）：模様を 区画いっぱいの 大きさで 描いて、隣のマスと つなげる
  const SPAN = 4;
  // タイル座標が 属する区画。sx,sy は 区画の原点タイル、lx,ly は 区画の中の位置（0〜SPAN-1）。不正な値は null
  function spanOf(tx, ty) {
    try {
      if (typeof tx !== 'number' || typeof ty !== 'number' || !isFinite(tx) || !isFinite(ty)) return null;
      const x = Math.floor(tx), y = Math.floor(ty);
      const sx = Math.floor(x / SPAN) * SPAN, sy = Math.floor(y / SPAN) * SPAN;
      return { sx, sy, lx: x - sx, ly: y - sy };
    } catch (e) { return null; }
  }
  // 模様の濃さ（alpha 0.24〜0.33）。同じ区画の マスは みんな同じ。不正な値・あふれた計算は 0.24
  function shadeFor(tx, ty) {
    try {
      const s = spanOf(tx, ty);
      if (!s) return 0.24;
      const v = 0.24 + phase(s.sx / SPAN, s.sy / SPAN) * 0.03;   // 大きすぎる座標では phase が NaN に なりうる
      return isFinite(v) ? Math.min(0.33, Math.max(0.24, v)) : 0.24;
    } catch (e) { return 0.24; }
  }
  root.nishioLandscape = { MOTIFS, SPAN, motifFor, phase, spanOf, shadeFor };
})(typeof window !== 'undefined' ? window : globalThis);
