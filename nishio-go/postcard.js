// 記念ポストカード：名所（注目スポット）に はじめて チェックインした日に、その名所の ポストカードが 1枚 もらえる。きろくで 眺めるだけ（ポイント・収集・袋・行き先選びには かかわらない）。
// 2回目以降の チェックインでは 上書きしない（最初の 1枚だけ のこる）。未到達の 名所は きろくに 出さない。絵は 新しく 作らず、かおりちゃん（お米の ドット絵）と 絵文字を 使う。
// ・記録は S.postcards（game.js のセーブの 中）：{ 名所id: { day: 'YYYY-MM-DD', say: かおりちゃんの ひとこと } }。こわれた 値は clean が 直す
(function (root) {
  const MAX_CARDS = 400;   // 名所の 数より ずっと 多い。こわれて ふくらんだ 記録を 止める 上限
  const MAX_SAY = 60;
  // カード文に 入れない 表現の 検査リスト（エスケープ表記）
  const BANNED = ['\u307c\u304f', '\u3060\u306b', '\u0032\u0030\u0025'];
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const isId = k => typeof k === 'string' && k.length > 0 && k.length <= 80 && k !== '__proto__';
  // 記録を 直す：日づけが 読めない／ひとことが 文字でない 札は すてる（ひとことが 長すぎれば 切る）
  function clean(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    let n = 0;
    for (const k of Object.keys(raw)) {
      const c = raw[k];
      if (!isId(k) || !c || typeof c !== 'object' || typeof c.day !== 'string' || !DAY.test(c.day) || typeof c.say !== 'string') continue;
      if (++n > MAX_CARDS) break;
      out[k] = { day: c.day, say: c.say.slice(0, MAX_SAY) };
    }
    return out;
  }
  // かおりちゃんの ひとこと（三河弁）。名所の 説明（spots.json の desc）の 最初の ひとことだけを つかう。新しい 数字・順位は 入れない
  function say(name, desc) {
    const n = String(name || '').replace(/（.*?）/g, '');
    const f = String(desc || '').split(/[。、]/)[0].trim();
    const t = f && f.length <= 28 && !BANNED.some(w => f.includes(w)) ? `${n}に 着いたに。${f}んだってぇ。ええとこだら？` : `${n}に 着いたに。ええとこだら？`;
    return t.slice(0, MAX_SAY);
  }
  // 名所 id で 発行：まだ なければ 1枚 足す（fresh）。あれば そのまま（上書きしない）
  function issue(st, id, day, text) {
    const s = clean(st);
    if (!isId(id) || !DAY.test(String(day)) || Object.prototype.hasOwnProperty.call(s, id)) return { st: s, fresh: false };
    if (Object.keys(s).length >= MAX_CARDS) return { st: s, fresh: false };   // 上限に とどいていたら 足さない（401枚目を 新規あつかいにしない）
    s[id] = { day, say: String(text || '').slice(0, MAX_SAY) };
    return { st: s, fresh: true };
  }
  // 全書の 進み具合：持っている 数と 全部の 数から、ぱーせんと と のこりを 返す
  function progress(have, total) {
    const num = v => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
    const t = num(total), h = Math.min(num(have), t);
    return { have: h, total: t, pct: t > 0 ? Math.floor(100 * h / t) : 0, left: t - h };
  }
  root.NISHIO_POSTCARD = { clean, say, issue, progress, MAX_CARDS, MAX_SAY };
})(typeof window !== 'undefined' ? window : globalThis);
