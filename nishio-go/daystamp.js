// 14日スタンプカレンダー：さんぽした日に 大きな スタンプ。過去14日を 古い順に 並べる。
// 純関数だけ（DOM・保存・ポイントには 触らない）。日づけは 'YYYY-MM-DD'。
(function (root) {
  const RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  function parse(s) {
    const m = RE.exec(typeof s === 'string' ? s : '');
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    const t = new Date(Date.UTC(y, mo - 1, d));
    // 2月30日 のような 日づけは 落とす
    return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? t : null;
  }
  function fmt(t) {
    const p = n => (n < 10 ? '0' : '') + n;
    return t.getUTCFullYear() + '-' + p(t.getUTCMonth() + 1) + '-' + p(t.getUTCDate());
  }
  // 日数を 足す（月末・年越し・うるう年は Date UTC に まかせる）。ふせいな 入力は ''
  function addDays(dateStr, delta) {
    const t = parse(dateStr), n = Number(delta);
    if (!t || !Number.isFinite(n)) return '';
    t.setUTCDate(t.getUTCDate() + Math.trunc(n));
    return fmt(t);
  }
  // todayStr を 最終日に、古い順 n 日分：[{date, day, on, today}]
  function grid(doneList, todayStr, n) {
    const cnt = n === undefined ? 14 : Math.floor(Number(n));
    if (!parse(todayStr) || !Number.isFinite(cnt) || cnt < 1) return [];
    const done = new Set((Array.isArray(doneList) ? doneList : []).filter(d => parse(d)));
    const out = [];
    for (let i = cnt - 1; i >= 0; i--) {
      const date = addDays(todayStr, -i);
      out.push({ date, day: +date.slice(8), on: done.has(date), today: date === todayStr });
    }
    return out;
  }
  root.nishioDayStamp = { addDays, grid };
})(typeof window !== 'undefined' ? window : globalThis);
