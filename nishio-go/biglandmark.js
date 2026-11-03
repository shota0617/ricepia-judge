// 名所の大きな絵（第4弾サイクル24）：近づくほど注目名所の絵が大きく迫る（NEAR マス以内で最大 MAX_SCALE 倍・FAR マス以上で等倍）。
// 純関数だけ（DOM・保存・ポイントには触らない）。不正な入力でも例外は出さない。
(function (root) {
  const NEAR = 3, FAR = 11, MAX_SCALE = 2;
  // 特大の絵（6マス）は画面を覆わないよう、最大 1.25 倍まで穏やかに迫る（第4弾サイクル35）
  const MAX_GIANT = 1.25;
  const AREAS = ['nishio', 'isshiki', 'kira', 'hazu', 'sakushima'];
  function scaleFor(dist) {
    try {
      if (typeof dist !== 'number' || !isFinite(dist)) return 1;
      if (dist <= NEAR) return MAX_SCALE;
      if (dist >= FAR) return 1;
      const k = MAX_SCALE - (MAX_SCALE - 1) * (dist - NEAR) / (FAR - NEAR);
      return Math.min(MAX_SCALE, Math.max(1, k));
    } catch (e) { return 1; }
  }
  function giantScaleFor(dist) {
    try {
      if (typeof dist !== 'number' || !isFinite(dist)) return 1;
      if (dist <= NEAR) return MAX_GIANT;
      if (dist >= FAR) return 1;
      const k = MAX_GIANT - (MAX_GIANT - 1) * (dist - NEAR) / (FAR - NEAR);
      return Math.min(MAX_GIANT, Math.max(1, k));
    } catch (e) { return 1; }
  }
  function isBig(s) {
    try { return !!(s && s.featured && !s.shop && AREAS.includes(s.area)); } catch (e) { return false; }
  }
  root.nishioBigLandmark = { NEAR, FAR, MAX_SCALE, MAX_GIANT, scaleFor, giantScaleFor, isBig };
})(typeof window !== 'undefined' ? window : globalThis);
