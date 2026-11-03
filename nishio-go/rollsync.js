// 転がりの同期（M1）：回転角＝移動距離÷半径。半径 R=0.42 マス、円周 2πR≒2.639 マスで ちょうど1回転。
// 純関数だけ（DOM・保存・ポイントには触らない）。dx, dy は1こまの移動量（マス）。
(function (root) {
  const R = 0.42;
  const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);
  const effR = scale => R * (typeof scale === 'number' && isFinite(scale) && scale > 0 ? scale : 1);
  function advance(dx, dy, scale) {
    try {
      const x = num(dx), y = num(dy), r = effR(scale);
      return { dAng: x / r, dPitch: y / r, dist: Math.hypot(x, y) };
    } catch (e) { return { dAng: 0, dPitch: 0, dist: 0 }; }
  }
  function turnsFor(dist, scale) {
    try {
      const d = num(dist);
      return d / (2 * Math.PI * effR(scale));
    } catch (e) { return 0; }
  }
  function frameFor(dist, scale) {
    const f = Math.floor(turnsFor(dist, scale) * 8) % 8;
    return f < 0 ? f + 8 : f;
  }
  root.nishioRollSync = { R, advance, turnsFor, frameFor };
})(typeof window !== 'undefined' ? window : globalThis);
