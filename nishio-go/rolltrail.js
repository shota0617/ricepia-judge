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
  const STEP = 0.14;
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
  // 地区の境の混ざった色（第4弾サイクル40・Gris）：'r,g,b' 2色の k（0..1に丸め）での混合。不正な側は無視し、両方不正なら null
  const parseRgb = v => {
    if (typeof v !== 'string') return null;
    const m = /^(\d{1,3}),(\d{1,3}),(\d{1,3})$/.exec(v);
    if (!m) return null;
    const c = [+m[1], +m[2], +m[3]];
    return c.every(n => n <= 255) ? c : null;
  };
  function mixRgb(a, b, k) {
    try {
      const A = parseRgb(a), B = parseRgb(b);
      if (!A) return B ? B.join(',') : null;
      if (!B) return A.join(',');
      const t = num(k) ? Math.min(1, Math.max(0, k)) : 0;
      return A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',');
    } catch (e) { return null; }
  }
  // 境の前後3小セグメントに広げた4段階の溶け合い（第4弾サイクル41・Journey）：入力は小セグメントごとの 'r,g,b' 配列。入力は変えず新しい配列を返す
  // 狭い地区で境の窓が重なる所は上書きせず、寄与の各成分を平均する（第4弾サイクル43・Chicory）
  function smoothColors(colors) {
    try {
      if (!Array.isArray(colors)) return [];
      const out = colors.slice();
      const acc = colors.map(() => []);
      for (let i = 1; i < colors.length; i++) {
        const A = colors[i - 1], B = colors[i];
        if (A === B || !parseRgb(A) || !parseRgb(B)) continue;
        acc[i - 1].push(mixRgb(A, B, 0.25));
        acc[i].push(mixRgb(A, B, 0.5));
        if (i + 1 < colors.length) acc[i + 1].push(mixRgb(A, B, 0.75));
      }
      acc.forEach((list, j) => {
        if (list.length === 1) out[j] = list[0];
        else if (list.length > 1) {
          const cs = list.map(parseRgb);
          out[j] = [0, 1, 2].map(k => Math.round(cs.reduce((t, c) => t + c[k], 0) / cs.length)).join(',');
        }
      });
      return out;
    } catch (e) { return Array.isArray(colors) ? colors.slice() : []; }
  }
  // 帯のリボン化（第4弾サイクル42・スプラトゥーン）：小セグメントごとの左右の縁を結んだ四角形。隣と縁を共有するので継ぎ目で重ならず、太さも点ごとに連続する。座標はタイル単位
  const HALF = 0.10, JOIN = 1e-6;
  function ribbon(segs) {
    try {
      if (!Array.isArray(segs)) return [];
      const info = segs.map(s => {
        if (!s || !num(s.x1) || !num(s.y1) || !num(s.x2) || !num(s.y2)) return null;
        const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
        if (!(len > 0)) return null;
        return { s, dx: (s.x2 - s.x1) / len, dy: (s.y2 - s.y1) / len, w: (num(s.w) && s.w > 0) ? s.w : 1 };
      });
      const joined = (a, b) => a && b && Math.abs(a.s.x2 - b.s.x1) <= JOIN && Math.abs(a.s.y2 - b.s.y1) <= JOIN;
      const edge = (x, y, dx, dy, w) => {
        const h = HALF * w, nx = -dy, ny = dx;
        return [x + nx * h, y + ny * h, x - nx * h, y - ny * h];
      };
      // 鎖の途中の点：入ってくる向きと出ていく向きの和（真逆なら入ってくる向き）、太さは前後の平均。曲がり角では帯がくびれないよう、なす角の半分の cos で割り戻す（上限2倍。真逆の折り返しは割り戻さない）
      const mid = (a, b) => {
        let dx = a.dx + b.dx, dy = a.dy + b.dy;
        const l = Math.hypot(dx, dy);
        let w = (a.w + b.w) / 2;
        if (l < 1e-9) { dx = a.dx; dy = a.dy; }
        else { dx /= l; dy /= l; const cos = Math.sqrt((1 + Math.min(1, Math.max(-1, a.dx * b.dx + a.dy * b.dy))) / 2); if (cos > 0) w *= Math.min(2, 1 / cos); }
        return { dx, dy, w };
      };
      return info.map((c, i) => {
        if (!c) return null;
        const prev = joined(info[i - 1], c) ? info[i - 1] : null;
        const next = joined(c, info[i + 1]) ? info[i + 1] : null;
        const a = prev ? mid(prev, c) : c, b = next ? mid(c, next) : c;
        const L = edge(c.s.x1, c.s.y1, a.dx, a.dy, a.w), R = edge(c.s.x2, c.s.y2, b.dx, b.dy, b.w);
        return { lx1: L[0], ly1: L[1], rx1: L[2], ry1: L[3], rx2: R[2], ry2: R[3], lx2: R[0], ly2: R[1] };
      });
    } catch (e) { return []; }
  }
  // 同じ場所の重なりは1回だけ（第4弾サイクル44・マリオペイント）：向きに依らず両端点（小数第2位）が同じ小セグメントは最後の1つだけ残す。座標が不正な要素はそのまま残す。入力は変えない
  function dedupe(segs) {
    try {
      if (!Array.isArray(segs)) return [];
      const last = new Map();
      const keyOf = s => {
        if (!s || !num(s.x1) || !num(s.y1) || !num(s.x2) || !num(s.y2)) return null;
        const a = s.x1.toFixed(2) + ',' + s.y1.toFixed(2), b = s.x2.toFixed(2) + ',' + s.y2.toFixed(2);
        return a <= b ? a + '|' + b : b + '|' + a;
      };
      const keys = segs.map(keyOf);
      keys.forEach((k, i) => { if (k !== null) last.set(k, i); });
      return segs.filter((s, i) => keys[i] === null || last.get(keys[i]) === i);
    } catch (e) { return Array.isArray(segs) ? segs.slice() : []; }
  }
  root.nishioRollTrail = { MAX, GAP, LIFE_MS, STEP, push, alive, alphaFor, segments, colorFor, mixRgb, smoothColors, ribbon, dedupe, AREA_COLORS };
})(typeof window !== 'undefined' ? window : globalThis);
