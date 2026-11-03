// コロコロの跡（第4弾サイクル36）：転がった道に小さな丸い跡が穏やかに残り、LIFE_MS かけて消える。
// 純関数だけ（DOM・保存・ポイントには触らない）。不正な入力でも例外は出さない。
(function (root) {
  const MAX = 24, GAP = 0.55, LIFE_MS = 12000, ALPHA = 0.38;
  const num = v => typeof v === 'number' && isFinite(v);
  function push(list, x, y, t) {
    try {
      const l = Array.isArray(list) ? list : [];
      if (!num(x) || !num(y) || !num(t)) return l;
      const last = l[l.length - 1];
      if (last && Math.hypot(x - last.x, y - last.y) < GAP) return l;
      const next = l.concat([{ x, y, t }]);
      return next.length > MAX ? next.slice(next.length - MAX) : next;
    } catch (e) { return Array.isArray(list) ? list : []; }
  }
  // ちょうど LIFE_MS の跡までは残す（そのときの濃さは 0 なので描かれない）
  function alive(list, now) {
    try {
      if (!Array.isArray(list)) return [];
      if (!num(now)) return list.slice();
      return list.filter(p => p && num(p.t) && now - p.t <= LIFE_MS);
    } catch (e) { return []; }
  }
  function alphaFor(ageMs) {
    try {
      if (!num(ageMs)) return 0;
      if (ageMs <= 0) return ALPHA;
      if (ageMs >= LIFE_MS) return 0;
      return Math.min(ALPHA, Math.max(0, ALPHA * (1 - ageMs / LIFE_MS)));
    } catch (e) { return 0; }
  }
  root.nishioRollTrail = { MAX, GAP, LIFE_MS, push, alive, alphaFor };
})(typeof window !== 'undefined' ? window : globalThis);
