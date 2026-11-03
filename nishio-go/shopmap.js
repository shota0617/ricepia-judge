// 歩く地図に出す 実在の店の名前札を えらぶ（桃太郎電鉄のように 実名の店で 西尾を おぼえる）。
// 純関数だけ（DOM・保存・ポイントには 触らない）。pois は pixel.js の [x, y, kind, name, src] の 配列。
(function (root) {
  const KINDS = ['store', 'food', 'cafe', 'konbini', 'super', 'drug', 'bank', 'post', 'fuel', 'home', 'shop'];
  const num = v => typeof v === 'number' && isFinite(v);
  const MAX_TILES = 40;   // 主人公から この マス数（1マス8m → 320m）より 遠い店は 札を出さない
  const MAX_NAME = 12;
  function tidy(name) { return typeof name === 'string' ? name.replace(/[\s\u3000]+/g, ' ').trim() : ''; }
  // 表示用の 短い店名（括弧書き・法人格を 除き、長ければ ブランド部分か 12文字で 切る）
  function shortName(name) {
    try {
      const base = tidy(name);
      if (!base) return '';
      let s = base;
      for (let i = 0; i < 4; i++) s = s.replace(/（[^（）]*）|\([^()]*\)/g, '');
      s = tidy(s).replace(/^(株式会社|有限会社|（株）|\(株\)|（有）|\(有\))\s*/, '');
      s = tidy(s);
      if (s.length > MAX_NAME) {
        const sp = s.indexOf(' ');
        if (sp >= 4) s = s.slice(0, sp);
        s = s.slice(0, MAX_NAME);
      }
      return s || base.slice(0, MAX_NAME);
    } catch (e) { return ''; }
  }
  // 札の 段（0〜2）：優先順に おいて、近くて 同じ段の 札と かさなる ときは 上の段へ ずらす
  function layoutLevels(picked) {
    try {
      if (!Array.isArray(picked)) return [];
      const placed = [];
      return picked.map(p => {
        if (!Array.isArray(p) || !num(p[0]) || !num(p[1])) return 0;
        let lv = 2;
        for (let l = 0; l < 3; l++) {
          if (!placed.some(q => q.l === l && Math.abs(q.x - p[0]) < 4 && Math.abs(q.y - p[1]) < 2)) { lv = l; break; }
        }
        placed.push({ x: p[0], y: p[1], l: lv });
        return lv;
      });
    } catch (e) { return []; }
  }
  function pickLabels(pois, opts) {
    try {
      if (!Array.isArray(pois)) return [];
      const o = opts && typeof opts === 'object' ? opts : {};
      const limit = Number.isInteger(o.limit) && o.limit > 0 ? Math.min(o.limit, 3) : 3;   // 札は最大3枚（恒常ルール）
      const me = o.me && num(o.me.x) && num(o.me.y) ? o.me : null;
      const maxTiles = num(o.maxTiles) && o.maxTiles > 0 ? o.maxTiles : MAX_TILES;
      const goal = typeof o.goalName === 'string' && o.goalName ? o.goalName : '';
      const list = [];
      pois.forEach((p, i) => {
        if (!Array.isArray(p) || !num(p[0]) || !num(p[1])) return;
        if (typeof p[3] !== 'string' || !tidy(p[3]) || KINDS.indexOf(p[2]) < 0) return;   // 空白だけの名前は札にしない（c31 Codex指摘）
        const d = me ? Math.hypot(p[0] - me.x, p[1] - me.y) : 0;
        if (me && d > maxTiles) return;
        list.push({ p, i, d });
      });
      list.sort((a, b) => ((b.p[3] === goal && !!goal) - (a.p[3] === goal && !!goal)) || (a.d - b.d) || (a.i - b.i));
      const seen = new Set(), out = [];
      for (const e of list) {
        const key = shortName(e.p[3]) || e.p[3];
        if (seen.has(key)) continue;
        seen.add(key); out.push(e.p);
        if (out.length >= limit) break;
      }
      return out;
    } catch (e) { return []; }
  }
  root.nishioShopMap = { KINDS, MAX_TILES, pickLabels, shortName, layoutLevels };
})(typeof window !== 'undefined' ? window : globalThis);
