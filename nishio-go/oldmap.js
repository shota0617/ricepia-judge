// にしおさんぽGO：イベント「古い地図が出てきた」（明治の村あつめ）
// ・ドット絵の地図で町に入ると、その町が明治39年（1906年）ごろ どの村だったかを書いた「古い地図」が出る（村ごとに はじめての1回だけ）
//   村は11。はじめて見つけた村ごとに +15pt、ぜんぶ見つけるとバッジ「明治の村あつめ」（game.js の oldmapFound・badgeDefs）
// ・中身は次の出典の、文字で読みとれることだけ（本の地図の線や形は写さない）
// ・「明治の村の地図」は、ここで描く：ゲームの地図の町名（OpenStreetMap の位置）を、本で読みとった村ごとに色分けし、
//   いちばん近い町名で土地を分けて（ボロノイ）、村と村のさかいに線を引く。市町の外（海など）は塗らない（region.json の市町の形）。
//   村がわからない町（本の地図で はっきり読めなかった町）は色をつけない。だから、村の形は おおよそ
//    運営者から受けとった、西尾の歴史の資料集のページの写真（2026年10月）。書名は確かめ中
//      地図「（平）成23）年の合併直前」：□ でかこんだ村名が1906（明治39）年の村。そのころの村と、合併直前の町・大字の名前
//      注：室村・花蔵寺村・善明村・平原村・家武村などは1884（明治17）年に組合村をつくった。豊坂村は いまは幸田町にふくまれる
// ・村ごとの大字は、地図で その村の太い線の中に書いてあるもの（村の名前の □ がない所＝西浅井・東浅井・新村・高落・小島・志籠谷・八幡川田・上羽角・下羽角 などは、どの村か読みとれないので入れない）
// ・ほかの窓（説明の窓・パネル・ダイアログ・呼びとめ・ごほうび・ミニゲーム・田んぼのイベント）が出ている間は待つ。開いている間は歩かない（pixel.js の eventShown）
(() => {
  'use strict';
  const VILLAGES = [
    { id: 'nishio', name: '西尾町', city: '西尾市', ooaza: ['新渡場', '伊藤', '上町', '小間', '法光寺', '下町', '西尾町', '道光寺', '戸ケ崎', '寄住', '丁田', '住崎', '新在家', '矢曽根', '今川'] },
    { id: 'meiji', name: '明治村', city: '西尾市', ooaza: ['米津', '南中根'],
      note: '明治村は、中根村・米津村のほかに、碧海郡の7か村をふくんでいた。' },
    { id: 'hirasaka', name: '平坂村', city: '西尾市', ooaza: ['中畑', '田貫', '平坂', '羽塚', '国森', '楠', '富山', '上矢田', '西小梛新田'] },
    { id: 'terazu', name: '寺津村', city: '西尾市', ooaza: ['寺津', '徳永', '巨海', '中根', '刈宿'] },
    { id: 'fukuchi', name: '福地村', city: '西尾市', ooaza: ['針曽根', '行用', '上道目記', '下道目記', '八ケ尻', '市子', '長縄', '菱池', '熱池', '深池', '川口', '細池', '鵜ケ池', '鎌谷', '須脇', '十郎島', '斉藤', '野々宮', '横手', '天竹', '平口', '笹曽根'] },
    { id: 'isshiki', name: '一色村', city: '西尾市', ooaza: ['開正', '治明', '赤羽', '味浜', '養ケ島', '細川', '中外沢', '一色', '前野', '対米', '池田', '大塚', '野田', '惣五郎', '松木島', '藤江', '酒手島', '小薮', '坂田新田', '生田', '千間'] },
    { id: 'yoshida', name: '吉田村', city: '西尾市', ooaza: ['吉田', '大島', '富田', '荻原', '小山田', '富好新田', '白浜新田', '乙川', '宮崎'] },
    { id: 'yokosuka', name: '横須賀村', city: '西尾市', ooaza: ['上横須賀', '下横須賀', '岡山', '瀬戸', '駮馬', '木田', '寺嶋', '寺島', '小牧', '中野', '津平', '酒井', '友国', '饗庭'] },
    { id: 'sanwa', name: '三和村', city: '西尾市', ooaza: ['米野', '上永良', '下永良', '尾花', '江原', '和気', '大和田', '岡島', '駒場', '家武', '室', '高河原', '花蔵寺', '善明', '平原', '貝吹'],
      note: '室村・花蔵寺村・善明村・平原村・家武村などは、1884年（明治17年）に組合村をつくっていた。' },
    { id: 'hazu', name: '幡豆村', city: '西尾市', ooaza: ['西幡豆', '東幡豆', '鳥羽', '宮迫', '寺部'],
      note: '地図には参考として、明治のはじめの村の名前（西幡豆のあたりの八幡・小野谷・欠・門内、東幡豆のあたりの桑畑・洲崎・鹿川 など）も書かれている。' },
    { id: 'toyosaka', name: '豊坂村', city: '幸田町', ooaza: ['須美', '野場', '永野', '六栗', '上六栗', '桐山', '逆川'],
      note: '豊坂村は、いまは幸田町にふくまれている。' },
  ];
  // 地図の町名（OpenStreetMap）を大字の名前に：「一色町味浜」→「味浜」、「八ケ尻町」→「八ケ尻」、ヶ・が → ケ
  const kana = s => s.replace(/[ヶが]/g, 'ケ');
  function villageOf(town, city) {
    if (!town) return null;
    const t = kana(String(town).replace(/^(一色町|吉良町|幡豆町)(?=.)/, '')), t2 = t.replace(/町$/, '');
    return VILLAGES.find(v => v.city === city && v.ooaza.some(o => { const k = kana(o); return k === t || k === t2; })) || null;
  }
  let root = null, closedAt = 0;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shown = () => !!root && !root.hidden;

  function build() {
    root = document.createElement('div');
    root.className = 'medashi oldmap'; root.id = 'oldmap'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'イベント 古い地図が出てきた');
    document.body.appendChild(root);
    root.addEventListener('click', e => { if (e.target.closest('[data-om="close"]')) close(); });
    window.addEventListener('keydown', e => { if (shown() && e.key === 'Escape') close(); });
  }
  // 明治の村の地図：町名の点（タイルの座標）を村ごとに色分けし、いちばん近い町名で土地を分ける。1回だけ計算して取っておく
  const N = 240, PAPER = [236, 222, 188], INK = [92, 62, 30];
  const COLS = [[214, 170, 120], [190, 196, 140], [168, 190, 196], [210, 180, 190], [200, 200, 160], [176, 168, 206], [220, 196, 140], [160, 196, 160], [206, 160, 150], [180, 206, 190], [196, 180, 150]];
  let base = null;
  function buildBase() {
    const P = window.nishioPixel, G = window.nishioGo;
    if (!P || !P.towns || !P.towns.length || !P.toLatLng || !G || !G.cityAt) return null;
    const pts = [];   // [x, y, 村の番号（-1 は わからない）]
    for (const t of P.towns) {
      if (t[3] !== '西尾市' && t[3] !== '幸田町') continue;
      const v = villageOf(t[2], t[3]);
      pts.push([t[0], t[1], v ? VILLAGES.indexOf(v) : -1]);
    }
    const own = pts.filter(p => p[2] >= 0);
    if (own.length < 10) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of own) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    const pad = 120, span = Math.max(x1 - x0, y1 - y0) + pad * 2, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const bx = cx - span / 2, by = cy - span / 2, step = span / N;
    const idx = new Int8Array(N * N).fill(-2);   // -2：市町の外、-1：村がわからない
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const tx = bx + (i + 0.5) * step, ty = by + (j + 0.5) * step, ll = P.toLatLng(tx, ty), c = G.cityAt(ll.lat, ll.lng);
      const city = c && (c.name || c);
      if (city !== '西尾市' && city !== '幸田町') continue;
      let best = -1, bd = Infinity;
      for (const p of pts) { const d = (p[0] - tx) ** 2 + (p[1] - ty) ** 2; if (d < bd) { bd = d; best = p[2]; } }
      idx[j * N + i] = city === '幸田町' && best !== VILLAGES.findIndex(v => v.id === 'toyosaka') ? -1 : best;
    }
    // 村ごとの名前を置く所（その村のマスの まん中）
    const sum = VILLAGES.map(() => [0, 0, 0]);
    for (let k = 0; k < N * N; k++) if (idx[k] >= 0) { const s2 = sum[idx[k]]; s2[0] += k % N; s2[1] += Math.floor(k / N); s2[2]++; }
    return { idx, label: sum.map(s2 => (s2[2] ? [s2[0] / s2[2], s2[1] / s2[2]] : null)) };
  }
  function villageMap(cur, found) {
    try {
      if (!base) base = buildBase();
      if (!base) return '';
      const c = document.createElement('canvas');
      c.width = c.height = N;
      const x = c.getContext('2d'), im = x.createImageData(N, N), d = im.data, { idx } = base;
      for (let k = 0; k < N * N; k++) {
        const v = idx[k], i = k % N, j = Math.floor(k / N);
        const hid = v >= 0 && found && !found.has(VILLAGES[v].id);   // まだ見つけていない村は灰色
        let col = v === -2 ? [196, 206, 210] : v === -1 ? PAPER : hid ? [200, 194, 182] : COLS[v % COLS.length];
        if (v >= 0 && !hid && cur >= 0 && v !== cur) col = col.map((q, n) => Math.round(q * 0.55 + PAPER[n] * 0.45));   // いまの村だけ はっきり
        const edge = v >= -1 && ((i + 1 < N && idx[k + 1] !== v && idx[k + 1] >= -1) || (j + 1 < N && idx[k + N] !== v && idx[k + N] >= -1));
        if (edge && (v >= 0 || idx[k + 1] >= 0 || (k + N < N * N && idx[k + N] >= 0))) col = INK;
        d[k * 4] = col[0]; d[k * 4 + 1] = col[1]; d[k * 4 + 2] = col[2]; d[k * 4 + 3] = 255;
      }
      x.putImageData(im, 0, 0);
      x.textAlign = 'center'; x.textBaseline = 'middle';
      base.label.forEach((p, n) => {
        if (!p || (found && !found.has(VILLAGES[n].id))) return;
        x.font = `${n === cur ? 'bold 15' : '11'}px serif`;
        x.lineWidth = 3; x.strokeStyle = 'rgba(244,234,210,.9)'; x.strokeText(VILLAGES[n].name, p[0], p[1]);
        x.fillStyle = n === cur ? '#9a2a1a' : '#5c3e1e'; x.fillText(VILLAGES[n].name, p[0], p[1]);
      });
      return c.toDataURL('image/png');
    } catch (e) { return ''; }
  }
  function open(v, town) {
    const G = window.nishioGo;
    if (!G || !G.oldmapFound) return false;
    if (!root) build();
    const r = G.oldmapFound(v.id, VILLAGES.length);
    if (!r) return false;
    const img = villageMap(VILLAGES.indexOf(v)), others = v.ooaza.filter(o => kana(o) !== kana(String(town).replace(/^(一色町|吉良町|幡豆町)(?=.)/, '').replace(/町$/, ''))).slice(0, 8);
    root.innerHTML = `<div class="md-card om-card"><p class="md-head">📜 イベント：古い地図が出てきた！</p>
      <div class="om-map">${img ? `<img src="${img}" alt="明治39年ごろの村の地図（いまの町名から描いた おおよその形）" width="240"/>` : ''}<span class="om-stamp">明治39年ごろ<b>${v.name}</b></span></div>
      <p class="md-say">いまの「${esc(town)}」は、明治39年（1906年）のころ「${v.name}」だった。${others.length ? `同じ村だった所：${others.join('・')}${v.ooaza.length - 1 > others.length ? ' など' : ''}。` : ''}${v.note ? `<br>${v.note}` : ''}</p>
      <p class="om-count">明治の村 ${r.n}/${VILLAGES.length}${r.pts ? `　+${r.pts}pt` : ''}${r.all ? '　🏅 ぜんぶ見つけた！' : ''}</p>
      <p class="om-src">出典：西尾の歴史の資料集の地図（平成23年の合併直前の町と、1906年の村）。絵は、いまの町名の位置（OpenStreetMap）から描いた おおよその村の形（色のない所は、村が読みとれなかった所）</p>
      <button type="button" class="btn mini md-close" data-om="close">とじる</button></div>`;
    root.hidden = false;
    if (G.track) G.track('oldmap_open', { village: v.id, n: r.n });
    return true;
  }
  function close() { if (root) root.hidden = true; closedAt = Date.now(); }
  // きろく の「🗺️ 明治の村の地図」：見つけた村だけ色と名前。ポイントは出ない
  function view() {
    const G = window.nishioGo;
    if (!root) build();
    const got = new Set(VILLAGES.filter(v => G && G.oldmapHas && G.oldmapHas(v.id)).map(v => v.id)), img = villageMap(-1, got);
    root.innerHTML = `<div class="md-card om-card"><p class="md-head">🗺️ 明治の村の地図（明治39年ごろ）</p>
      <div class="om-map">${img ? `<img src="${img}" alt="明治39年ごろの村の地図（見つけた村だけ色つき）" width="240"/>` : '<p>地図を読みこんでいます。ドット絵の地図を開いてから、もう一度どうぞ</p>'}</div>
      <p class="om-count">明治の村 ${got.size}/${VILLAGES.length}</p>
      <p class="md-say">${VILLAGES.map(v => got.has(v.id) ? `<b>${v.name}</b>` : '？？村').join('・')}<br><small>町を歩くと「古い地図」が出て、その町の村が地図に色づきます</small></p>
      <p class="om-src">出典：西尾の歴史の資料集の地図（平成23年の合併直前の町と、1906年の村）。絵は、いまの町名の位置（OpenStreetMap）から描いた おおよその村の形（色のない所は、村が読みとれなかった所）</p>
      <button type="button" class="btn mini md-close" data-om="close">とじる</button></div>`;
    root.hidden = false;
    return true;
  }
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-oldmap-view]')) view(); });
  // 1.5秒ごとに、いまいる町を見て、まだ見つけていない村なら出す（ほかの窓が出ている間は待つ）
  function tick() {
    const G = window.nishioGo, P = window.nishioPixel;
    if (!G || !P || !P.here || !P.hereFresh || shown() || Date.now() - closedAt < 3000) return;   // 古い町名（地図を切り替えたあと・位置がまだない）では出さない
    const town = P.here.town, city = P.here.city, v = villageOf(town, city);
    if (!v || (G.oldmapHas && G.oldmapHas(v.id))) return;
    if (document.body.classList.contains('jump-open') || (G.rewardSoon && G.rewardSoon())) return;
    if ((P.mapCovered && P.mapCovered()) || (P.sightBusy && P.sightBusy())) return;
    if (window.NISHIO_MEDASHI && NISHIO_MEDASHI.shown) return;
    open(v, town);
  }
  setInterval(tick, 1500);
  // テスト用
  window.NISHIO_OLDMAP = { VILLAGES, villageOf, villageMap, open, view, close, tick, get shown() { return shown(); } };
})();
