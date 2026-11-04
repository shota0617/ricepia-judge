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
  // 点と点を補間してつながった帯にする小セグメント列（最古→最新）。古い端ほど薄くして、最古が落ちても急に消えて見えない
  const STEP = 0.28;
  function segments(list, now) {
    try {
      if (!Array.isArray(list) || !num(now)) return [];
      const pts = list.filter(p => p && num(p.x) && num(p.y) && num(p.t));
      if (pts.length < 2) return [];
      const out = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        const p = pts[i], q = pts[i + 1];
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (!(d <= 3)) continue;   // ひとっとび（ワープ・位置の復元）は来た道ではないのでつながない
        const n = Math.max(1, Math.ceil(d / STEP - 1e-9));
        for (let k = 0; k < n; k++) {
          const u0 = k / n, u1 = (k + 1) / n;
          out.push({
            x1: p.x + (q.x - p.x) * u0, y1: p.y + (q.y - p.y) * u0,
            x2: k + 1 === n ? q.x : p.x + (q.x - p.x) * u1, y2: k + 1 === n ? q.y : p.y + (q.y - p.y) * u1,
            t: p.t + (q.t - p.t) * (u0 + u1) / 2, g: i
          });
        }
      }
      const m = out.length;
      return out.map((s, i) => {
        const frac = m > 1 ? i / (m - 1) : 1;
        const a = Math.min(ALPHA, Math.max(0, alphaFor(now - s.t) * (0.08 + 0.92 * frac)));
        const w = Math.min(1, Math.max(0.30, 0.30 + 0.70 * frac));   // 古い端ほど細く（筆の跡）
        return { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, a, w, g: s.g };
      });
    } catch (e) { return []; }
  }
  // 転がった土地の色（第4弾サイクル39・de Blob）：game.js の AREA_RGB と同じ5地区の色。分からなければ null（従来のクリーム）
  const AREA_COLORS = Object.freeze({ nishio: '122,168,84', isshiki: '78,146,190', kira: '196,124,88', hazu: '146,118,176', sakushima: '66,166,158' });
  function colorFor(areaId) {
    try {
      if (typeof areaId !== 'string' || !Object.prototype.hasOwnProperty.call(AREA_COLORS, areaId)) return null;
      return AREA_COLORS[areaId];
    } catch (e) { return null; }
  }
  root.nishioRollTrail = { MAX, GAP, LIFE_MS, push, alive, alphaFor, segments, colorFor, AREA_COLORS };
})(typeof window !== 'undefined' ? window : globalThis);
