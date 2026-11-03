// 歩く地図に出す 実在の店の名前札を えらぶ（桃太郎電鉄のように 実名の店で 西尾を おぼえる）。
// 純関数だけ（DOM・保存・ポイントには 触らない）。pois は pixel.js の [x, y, kind, name, src] の 配列。
(function (root) {
  const KINDS = ['store', 'food', 'cafe', 'konbini', 'super', 'drug', 'bank', 'post', 'fuel', 'home', 'shop'];
  const num = v => typeof v === 'number' && isFinite(v);
  function pickLabels(pois, opts) {
    try {
      if (!Array.isArray(pois)) return [];
      const o = opts && typeof opts === 'object' ? opts : {};
      const limit = Number.isInteger(o.limit) && o.limit > 0 ? Math.min(o.limit, 3) : 3;   // 札は最大3枚（恒常ルール）
      const me = o.me && num(o.me.x) && num(o.me.y) ? o.me : null;
      const goal = typeof o.goalName === 'string' && o.goalName ? o.goalName : '';
      const list = [];
      pois.forEach((p, i) => {
        if (!Array.isArray(p) || !num(p[0]) || !num(p[1])) return;
        if (typeof p[3] !== 'string' || !p[3] || KINDS.indexOf(p[2]) < 0) return;
        list.push({ p, i, d: me ? Math.hypot(p[0] - me.x, p[1] - me.y) : 0 });
      });
      list.sort((a, b) => ((b.p[3] === goal && !!goal) - (a.p[3] === goal && !!goal)) || (a.d - b.d) || (a.i - b.i));
      const seen = new Set(), out = [];
      for (const e of list) {
        if (seen.has(e.p[3])) continue;
        seen.add(e.p[3]); out.push(e.p);
        if (out.length >= limit) break;
      }
      return out;
    } catch (e) { return []; }
  }
  root.nishioShopMap = { KINDS, pickLabels };
})(typeof window !== 'undefined' ? window : globalThis);
