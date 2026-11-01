// モデルコース（順路ミッション）：西尾の名所を 順番に まわる コースを えらぶと、つぎに 行く 名所が 1つ 分かり、順番どおりに チェックインすると スタンプが 1つ ふえる。
// コースを ぜんぶ まわると、そのコースの 絵が 西尾の 1枚絵の 一部に なる（絵文字だけ。新しい 画像は 使わない）。3コースで 1枚絵が 完成。
// 順番を とばした チェックインは スタンプに ならない（その 名所の チェックイン・ポイント・収集は いつもどおり）。ポイントは つけない（案内と 記録だけ）。
// ・名所は spots.json の 注目スポット（id は 頭の「f-」なし）。島（佐久島・竹島・トンボロ干潟）は 入れない。名前・座標は spots.json から引く（ここには 事実を 書かない）
// ・記録は S.course（game.js のセーブの 中）：{ cur: コースid か null, n: スタンプの数, done: [まわりきった コースid] }。こわれた 値は clean が 直す
(function (root) {
  // band：1枚絵の 3列×（2列ずつ）のうち この コースの 受け持ち。3段の 絵（上から 空・まち・足もと）
  const COURSES = [
    { id: 'jokamachi', name: '西尾城下町コース', icon: '🏯', spots: ['nishio-station', 'nishio-castle', 'shokoso', 'iwase-bunko', 'ibun-jinja', 'kozenji'], band: [['☁️', '🏯'], ['🌳', '⛩️'], ['🏘️', '🌸']] },
    { id: 'chaen', name: '稲荷山・西条コース', icon: '🍵', spots: ['jissoji', 'wakuwaku', 'inariyama-chaen', 'kojuin'], band: [['⛅', '🌄'], ['🍃', '🍵'], ['🌱', '🌱']] },
    { id: 'isshiki', name: '一色コース', icon: '🐟', spots: ['isshiki-sakana', 'isshiki-port', 'isshiki-manabi', 'isshiki-suwa', 'ankyuji'], band: [['🌤️', '⛵'], ['🌊', '🐟'], ['🌊', '🦀']] },
  ];
  const BLANK = '⬜';
  const WALK_M_PER_MIN = 80;   // 歩く速さの 目安（時速 4.8km）。ほんとうの 所要時間では ない
  const byId = id => COURSES.find(c => c.id === id) || null;
  // 記録を 直す：こわれた 値は 「えらんでいない」に。n は 0〜名所の数-1、done は 知っている コースだけ（重ならない）
  function clean(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const c = byId(r.cur);
    const n = c ? Math.max(0, Math.min(c.spots.length - 1, Math.floor(Number(r.n)) || 0)) : 0;
    const done = [];
    for (const id of Array.isArray(r.done) ? r.done : []) if (byId(id) && !done.includes(id)) done.push(id);
    return { cur: c ? c.id : null, n, done };
  }
  // つぎに 行く 名所の id（コースを えらんでいなければ null）
  function next(st) {
    const s = clean(st), c = byId(s.cur);
    return c ? c.spots[s.n] : null;
  }
  // コースを えらぶ（べつの コースに かえると スタンプは 0 から。まわりきった 記録 done は のこる）
  function start(st, id) {
    const s = clean(st);
    if (!byId(id)) return s;
    return s.cur === id ? s : { cur: id, n: 0, done: s.done };
  }
  // コースを やめる（まわりきった 記録は のこる）
  function quit(st) {
    return { cur: null, n: 0, done: clean(st).done };
  }
  // 名所 spotId で チェックインした：順番どおりなら スタンプ +1。stamped＝スタンプが ふえた／completed＝コースを まわりきった
  function advance(st, spotId) {
    const s = clean(st), c = byId(s.cur);
    if (!c || c.spots[s.n] !== spotId) return { st: s, stamped: false, completed: false, course: c };
    if (s.n + 1 >= c.spots.length) return { st: { cur: null, n: 0, done: s.done.includes(c.id) ? s.done : [...s.done, c.id] }, stamped: true, completed: true, course: c };
    return { st: { cur: c.id, n: s.n + 1, done: s.done }, stamped: true, completed: false, course: c };
  }
  // 2点（緯度経度）の 直線きょり（m）
  function dist(a, b) {
    const R = 6371000, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  // コース全体の 距離の 目安（名所どうしの 直線きょりの 合計・m）と、歩く 目安の 分（5分きざみ）。座標が 足りなければ null
  function measure(course, pos) {
    const pts = course.spots.map(id => pos[id]);
    if (pts.some(p => !p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng))) return null;
    let m = 0;
    for (let i = 1; i < pts.length; i++) m += dist(pts[i - 1], pts[i]);
    return { m, min: Math.max(5, Math.round(m / WALK_M_PER_MIN / 5) * 5) };
  }
  const kmText = m => m >= 1000 ? (m / 1000).toFixed(1) + 'km' : Math.round(m / 10) * 10 + 'm';
  // 「約 3.2km・歩いて 約 40分（目安）」
  const measureText = me => me ? `約 ${kmText(me.m)}・歩いて 約 ${me.min}分（目安）` : '';
  // 1枚絵：6列×3段の 絵文字。まわりきった コースの 受け持ちだけ 絵に なり、ほかは ⬜
  function mosaic(done) {
    const d = clean({ cur: null, done }).done;
    const rows = [];
    for (let r = 0; r < 3; r++) {
      let line = '';
      for (const c of COURSES) for (let k = 0; k < 2; k++) line += d.includes(c.id) ? c.band[r][k] : BLANK;
      rows.push(line);
    }
    return rows;
  }
  root.NISHIO_COURSE = { COURSES, BLANK, WALK_M_PER_MIN, byId, clean, next, start, quit, advance, dist, measure, measureText, mosaic };
})(typeof window !== 'undefined' ? window : globalThis);
