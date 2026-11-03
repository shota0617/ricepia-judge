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
  // 方向転換（M3）：向きの変わり方は TURN_PER_SEC rad/秒まで。速さは変えず、向きだけを上限の角度まで回す（弧を描いて曲がる）。
  const TURN_PER_SEC = 5.5;
  function limitTurn(vx, vy, pvx, pvy, maxRad) {
    try {
      const x = num(vx), y = num(vy), px = num(pvx), py = num(pvy);
      const sp = Math.hypot(x, y), psp = Math.hypot(px, py);
      if (sp < 0.05 || psp < 0.05 || typeof maxRad !== 'number' || !isFinite(maxRad) || maxRad < 0) return { vx: x, vy: y };
      const cross = px * y - py * x, dot = px * x + py * y;
      const diff = Math.atan2(cross, dot);   // 前の向き→新しい向きの符号つき角度（最短弧）
      if (Math.abs(diff) <= maxRad) return { vx: x, vy: y };
      const turn = diff === -Math.PI || diff === Math.PI ? maxRad : Math.sign(diff) * maxRad;   // ちょうど反対は + 側へ（決定的に）
      const target = Math.atan2(py, px) + turn, c = Math.cos(target), s = Math.sin(target);
      return { vx: sp * c, vy: sp * s };
    } catch (e) { return { vx: 0, vy: 0 }; }
  }
  // 地面の感じ（M4）：地区ごとに ころがり抵抗(crr)と 速さ比例の減り(lin)の 倍率を少しずつ変える（0.8〜1.3。港は よく転がり、茶畑・砂の島は 少し重い）
  const AREA_FEEL = {
    isshiki: { crr: 0.82, lin: 0.85 },
    kira: { crr: 0.95, lin: 0.97 },
    hazu: { crr: 1.12, lin: 1.08 },
    nishio: { crr: 1.18, lin: 1.10 },
    sakushima: { crr: 1.28, lin: 1.15 }
  };
  for (const k in AREA_FEEL) Object.freeze(AREA_FEEL[k]);
  Object.freeze(AREA_FEEL);   // 公開しても書きかえられない（純関数の前提を守る。Codexレビュー指摘）
  function groundFeel(areaId) {
    try {
      const f = typeof areaId === 'string' && Object.prototype.hasOwnProperty.call(AREA_FEEL, areaId) ? AREA_FEEL[areaId] : null;
      return f ? { crr: f.crr, lin: f.lin } : { crr: 1, lin: 1 };
    } catch (e) { return { crr: 1, lin: 1 }; }
  }
  root.nishioRollSync = { R, advance, turnsFor, frameFor, TURN_PER_SEC, limitTurn, AREA_FEEL, groundFeel };
})(typeof window !== 'undefined' ? window : globalThis);
