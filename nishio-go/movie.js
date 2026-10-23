// にしおさんぽGO：イベント「ドット絵ムービー」
// ・西尾の海と大地の話（shizen.js。出典つき）を、文でならべるのではなく、その名所に はじめて着いたときの できごととして、短いドット絵の動きで見せる
// ・1本は4場面くらい。場面ごとに字幕1行（字幕は shizen.js の話と同じ中身）。5秒で次へ（画面をタップ・「つぎへ」でも進む）。最後まで見ると、その話が まちメモ に残る（game.js の movieEnd）
// ・絵はぜんぶ、この中で四角を並べて描く（192×144 を整数倍に拡大）。字幕は絵の外の文字（小さな文字を絵に描くと読めないため）
// ・いつ流れるかは game.js（チェックインのごほうびの画面が消えてから）。名所の窓の「📽️ ムービー」から見なおせる
(() => {
  'use strict';
  const W = 192, H = 144, SCENE = 5.5;   // 1場面の秒

  /* ---------- 描く道具 ---------- */
  const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const rnd = i => { let h = Math.imul(i + 1, 2654435761) >>> 0; h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; return (h & 0xffff) / 0x10000; };
  const k01 = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
  const mix = (p, q, k) => { const a = parseInt(p.slice(1), 16), b = parseInt(q.slice(1), 16), ch = s => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k); return `rgb(${ch(16)},${ch(8)},${ch(0)})`; };
  const bands = (c, cols, y0, y1) => { const h = (y1 - y0) / cols.length; cols.forEach((col, i) => R(c, col, 0, y0 + i * h, W, h + 1)); };
  function sky(c, warm = true) { bands(c, warm ? ['#7ec3ef', '#92cff2', '#a8dbf5', '#b8e2f7'] : ['#b9cfe0', '#c8dae8', '#d6e4ee', '#e0eaf1'], 0, 96); }   // 下は海や山でかくれる
  function sun(c, x, y) { R(c, '#ffe27a', x - 4, y - 6, 8, 12); R(c, '#ffe27a', x - 6, y - 4, 12, 8); R(c, '#fff3b0', x - 2, y - 4, 4, 8); }
  function water(c, y0, y1, t) {
    bands(c, ['#3a8fd0', '#2f7cbc', '#2569a6', '#1d5a92'], y0, y1);
    for (let i = 0; i < 14; i++) { const x = (rnd(i) * W + t * 8 * (i % 2 ? 1 : -1) + W) % W; R(c, '#7fc2ee', x, y0 + 2 + (i % 4) * 3, 6, 1); }
  }
  function boat(c, x, y, col = '#f4f1e6') { R(c, '#5a3a22', x, y + 4, 22, 4); R(c, col, x + 2, y + 1, 18, 3); R(c, '#2e2e2e', x + 12, y - 5, 2, 6); R(c, '#d23a2e', x + 6, y - 2, 6, 3); }
  function house(c, x, y, wall = '#222', roof = '#555') { R(c, roof, x - 1, y, 12, 3); R(c, wall, x, y + 3, 10, 7); R(c, '#e8d9a8', x + 3, y + 5, 3, 3); }
  function hill(c, x, y, w, h, col) { for (let i = 0; i < h; i++) { const ww = w * (0.35 + 0.65 * (i / h)); R(c, col, x + (w - ww) / 2, y + i, ww, 1); } }
  function fish(c, x, y, col = '#ffd54f') { R(c, col, x, y, 6, 3); R(c, col, x - 3, y - 1, 2, 5); R(c, '#000', x + 4, y + 1, 1, 1); }

  /* ---------- ムービー（字幕は shizen.js の出典つきの話と同じ中身。facts は見おわると まちメモ に残る話の鍵） ---------- */
  const MOVIES = [
    { id: 'sakushima', title: '佐久島ができるまで', spots: ['sakushima-nishi', 'sakushima-higashi', 'oura-beach', 'kurokabe', 'ohirune-house', 'yatsurugi'],
      facts: ['z:sakushima:0', 'z:sakushima:1'],
      scenes: [
        { cap: '約1800万年前。海の底に、砂や泥が すこしずつ つもっていった。', draw(c, t) {
          water(c, 0, 118, t); R(c, '#c9b27a', 0, 118, W, 26);
          const n = Math.min(6, Math.floor(t * 1.3));
          for (let i = 0; i < n; i++) R(c, ['#b59b62', '#8c7a55', '#c9b27a'][i % 3], 0, 141 - i * 4, W, 4);
          for (let i = 0; i < 90; i++) { const sp = 12 + rnd(i + 7) * 22, y = (rnd(i + 99) * 130 + t * sp) % 118; R(c, i % 3 ? '#d8c49a' : '#9c8a66', rnd(i) * W, y, 1, 1); }
          fish(c, (t * 30) % (W + 20) - 10, 40); fish(c, W - ((t * 22 + 60) % (W + 20)), 70, '#ff9e80');
        } },
        { cap: 'つもった砂や泥は、長い時間で かたい岩（堆積岩）になった。この地層を「師崎層群」という。', draw(c, t) {
          R(c, '#1d5a92', 0, 0, W, 40);
          const k = k01(t, 0.3, 3.5), cols = ['#c9b27a', '#a89060', '#bfa673', '#8c7a55', '#b59b62', '#9c8a66', '#c2aa76', '#8f7c58'];
          cols.forEach((col, i) => R(c, mix(col, i % 2 ? '#6b6560' : '#8a847c', k), 0, 40 + i * 13, W, 13));
          for (let i = 0; i < 5; i++) { const x = 20 + i * 38, y = 4 + (t * 12) % 14; R(c, '#fff', x + 2, y, 2, 8); R(c, '#fff', x, y + 6, 6, 2); R(c, '#fff', x + 1, y + 8, 4, 1); }   // 上からの重み
        } },
        { cap: 'そのころ、日本列島は大陸から分かれ、日本海が できはじめていた と考えられている。', draw(c, t) {
          R(c, '#2f7cbc', 0, 0, W, H);
          R(c, '#8a9a5b', 0, 0, 44, H); R(c, '#8a9a5b', 44, 20, 14, 60); R(c, '#7d8c52', 0, 100, 60, 44);   // 大陸
          const dx = k01(t, 0.3, 4) * 34;
          const arc = [[70, 6, 12, 24], [76, 26, 12, 22], [84, 46, 14, 20], [94, 64, 14, 18], [104, 80, 18, 12], [118, 88, 20, 10], [134, 94, 14, 8]];   // 列島（弓なり）
          for (const [x, y, w, h] of arc) R(c, '#a5b86a', x + dx * (1 - y / 140), y, w, h);
          if (dx > 8) for (let i = 0; i < 6; i++) R(c, '#5aa8e0', 62 + (rnd(i) * dx * 0.8), 20 + i * 14, 3, 1);   // ひらいていく海
        } },
        { cap: 'いまの佐久島。同じ地層は、日間賀島や知多半島の南へ続いている。', draw(c, t) {
          sky(c); sun(c, 160, 16);
          water(c, 70, H, t);
          hill(c, 30, 40, 120, 32, '#5f9a48');
          for (let i = 0; i < 4; i++) R(c, ['#b59b62', '#8c7a55', '#a89060', '#9c8a66'][i], 40, 62 + i * 2, 100, 2);   // 海べの地層
          house(c, 62, 52); house(c, 78, 54); house(c, 96, 52);   // 黒壁の家
          boat(c, ((t * 14) % (W + 30)) - 25, 96);
          if (Math.floor(t * 3) % 2) { R(c, '#fff', 120, 30, 4, 1); R(c, '#fff', 124, 29, 3, 1); }   // カモメ
        } },
      ] },
    { id: 'iwa', title: '山の岩のなりたち', spots: ['yatsuomote', 'tombolo', 'sangane-kannon', 'terabe-jo', 'terabe-beach'],
      facts: ['z:iwa:0', 'z:iwa:1', 'z:iwa:2'],
      scenes: [
        { cap: '中生代ジュラ紀。大洋の底に つもったものが、海のプレートの しずみこみで、大陸のふちに くっついた（美濃帯）。', draw(c, t) {
          R(c, '#2569a6', 0, 0, W, 60); R(c, '#4a3b30', 0, 60, W, H - 60);
          R(c, '#8c6a46', 130, 30, 62, 114); R(c, '#6f8f48', 130, 26, 62, 6);   // 大陸
          const s = (t * 10) % 20;
          for (let x = -20; x < 140; x += 20) { const xx = x + s; R(c, '#5b5f66', xx, 60 + Math.max(0, xx - 100) * 0.5, 20, 10); R(c, '#c9b27a', xx + 4, 57 + Math.max(0, xx - 100) * 0.5, 10, 3); }   // しずむプレートと、のっている積もりもの
          const pile = k01(t, 0.5, 5) * 18;
          for (let i = 0; i < pile; i++) R(c, i % 2 ? '#b59b62' : '#a08458', 112 + i * 0.6, 56 - i, 20 - i * 0.6, 1);   // 大陸のふちに たまる
        } },
        { cap: '白亜紀。地下から 花崗岩のマグマが上ってきて、その熱で まわりの岩が 変成岩に変わった。', draw(c, t) {
          R(c, '#6f8f48', 0, 0, W, 12); R(c, '#4a3b30', 0, 12, W, H);
          const y = 150 - k01(t, 0, 4) * 70, r = 18 + k01(t, 1, 5) * 26;
          for (let i = 0; i < r; i++) R(c, '#6d5a7a', 96 - (r + 10 - i) , y - i * 0.9, (r + 10 - i) * 2, 1);   // 熱で かわる岩（むらさきがかった灰色）
          for (let i = 0; i < 22; i++) R(c, i % 2 ? '#ff7a2a' : '#ffb03a', 96 - (22 - i), y + 4 - i, (22 - i) * 2, 1);   // マグマ
          if (Math.floor(t * 4) % 2) R(c, '#ffe27a', 92, y - 14, 8, 3);
        } },
        { cap: 'マグマは ゆっくり冷えて かたまり、深成岩になった。この地帯を「領家変成帯」という。', draw(c, t) {
          R(c, '#6f8f48', 0, 0, W, 12); R(c, '#4a3b30', 0, 12, W, H);
          const k = k01(t, 0.3, 4);
          for (let i = 0; i < 44; i++) R(c, '#6d5a7a', 96 - (54 - i), 80 - i * 0.9, (54 - i) * 2, 1);
          for (let i = 0; i < 22; i++) R(c, mix(i % 2 ? '#ff7a2a' : '#ffb03a', '#d9d4c8', k), 96 - (22 - i), 84 - i, (22 - i) * 2, 1);
          if (k > 0.5) for (let i = 0; i < 40; i++) R(c, '#3a3a3a', 76 + rnd(i) * 40, 66 + rnd(i + 50) * 18, 1, 1);   // 花崗岩の黒いつぶ
        } },
        { cap: 'いま、幡豆山地や八ツ面山、前島・沖島・梶島の岩場で、その岩が見られる。', draw(c, t) {
          sky(c); sun(c, 30, 18);
          hill(c, 10, 36, 110, 44, '#4f8a3c'); hill(c, 70, 44, 110, 36, '#5f9a48');
          R(c, '#9a958c', 40, 60, 8, 5); R(c, '#9a958c', 120, 64, 10, 5);   // 岩の出たところ
          water(c, 80, H, t);
          [[40, 104], [96, 112], [146, 100]].forEach(([x, y], i) => { hill(c, x, y - 10, 22 + i * 4, 10, '#5f9a48'); R(c, '#8a847c', x - 2, y, 26 + i * 4, 3); });   // 前島・沖島・梶島
        } },
      ] },
    { id: 'mikawawan', title: '三河湾の海の中', spots: ['koromozaki', 'isshiki-port', 'isshiki-sakana', 'kira-waikiki', 'ebisu-beach'],
      facts: ['z:mikawawan:0', 'z:mikawawan:1', 'z:mikawawan:2', 'z:gyogyo:0', 'z:gyogyo:1'],
      scenes: [
        { cap: '三河湾は、面積602km²・平均の深さ9.2m。となりの伊勢湾は、広さが約3倍、水の量は約6倍。', draw(c, t) {
          R(c, '#d8c690', 0, 0, W, H);
          R(c, '#2f7cbc', 0, 110, W, 34);
          R(c, '#3a8fd0', 18, 30, 52, 82); R(c, '#3a8fd0', 30, 18, 26, 14);   // 伊勢湾
          R(c, '#d8c690', 74, 40, 10, 72);   // 知多半島
          R(c, '#3a8fd0', 88, 70, 70, 34); R(c, '#3a8fd0', 96, 62, 22, 10);   // 三河湾
          R(c, '#d8c690', 120, 100, 70, 6);   // 渥美半島
          if (Math.floor(t * 2) % 2) { R(c, '#ffe27a', 86, 68, 74, 1); R(c, '#ffe27a', 86, 104, 74, 1); R(c, '#ffe27a', 86, 68, 1, 37); R(c, '#ffe27a', 159, 68, 1, 37); }
          if (t > 2.5) { R(c, '#fff', 16, 28, 56, 1); R(c, '#fff', 16, 112, 56, 1); }
        } },
        { cap: '海の底は、東の渥美湾が粘土、まん中が砂、西の知多湾（衣浦湾）がシルト。', draw(c, t) {
          water(c, 0, 100, t);
          const segs = [['#9a8f7a', 0, 64], ['#d8c08a', 64, 64], ['#7d6a58', 128, 64]];
          const sx = k01(t, 0, 3.5) * W;
          segs.forEach(([col, x, w]) => R(c, col, x, 100, w, 44));
          for (let i = 0; i < 60; i++) R(c, '#efdcaa', 64 + rnd(i) * 64, 102 + rnd(i + 9) * 40, 1, 1);   // 砂つぶ
          for (let i = 0; i < 40; i++) R(c, '#b3a892', rnd(i + 30) * 64, 102 + rnd(i + 3) * 40, 2, 1);   // シルト
          R(c, '#2569a6', sx, 100, W - sx, 44);   // 左から見えてくる
          R(c, '#ffe27a', sx - 1, 96, 2, 48);
        } },
        { cap: '西尾の沖は、佐久島まで 深さ10mより浅い海。底は砂で、島のまわりは岩場。', draw(c, t) {
          sky(c); R(c, '#8a9a5b', 0, 40, 30, 30);
          water(c, 60, 110, t);
          R(c, '#d8c08a', 0, 110, W, 34);
          hill(c, 126, 46, 66, 18, '#5f9a48'); R(c, '#9a958c', 120, 62, 72, 3);   // 佐久島
          R(c, '#8a847c', 118, 104, 74, 6); R(c, '#8a847c', 126, 98, 10, 6); R(c, '#8a847c', 150, 100, 8, 4);   // 島のまわりの岩場
          for (let y = 62; y < 110; y += 8) R(c, '#fff', 60, y, 3, 1);   // 深さのめもり
          const dy = Math.sin(t * 2) * 3; R(c, '#ffd54f', 80, 84 + dy, 6, 3); fish(c, 100 + (t * 10) % 30, 92);
        } },
        { cap: '西尾の漁師さんは、伊勢湾・三河湾と渥美外海で、小型底引き網や刺し網、貝とり、のり養殖をしている。', draw(c, t) {
          water(c, 0, H, t);
          const x = ((t * 16) % (W + 60)) - 40;
          boat(c, x, 40);
          for (let i = 0; i < 20; i++) R(c, '#e8e2cf', x - i * 1.6, 48 + i * 0.6, 1, 1);   // 引いている網
          boat(c, W - x * 0.6, 84, '#ffd54f');
          for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) { R(c, '#5a3a22', 110 + i * 9, 104 + r * 12, 1, 9); R(c, '#2e4a2a', 110 + i * 9, 108 + r * 12, 8, 2); }   // のり養殖の さお と あみ
        } },
      ] },
    { id: 'daichi', title: '西尾の台地と低地', area: 'nishio',
      facts: ['z:daichi:0', 'z:daichi:1'],
      scenes: [
        { cap: '氷期と間氷期を くり返すなかで、台地（碧海台地）ができた。むかしは「洪積台地」とよばれた。', draw(c, t) {
          const cold = Math.sin(t * 1.4) < 0;
          sky(c, !cold); R(c, cold ? '#e8f0f6' : '#7ec3ef', 0, 0, W, 8);
          const sea = 96 + Math.sin(t * 1.4) * 14;
          R(c, '#6f8f48', 0, 50, 70, 94); R(c, '#7d9a52', 70, 70, 50, 74); R(c, '#8aa65c', 120, 88, 30, 56);   // だんだんの台地
          R(c, '#2f7cbc', 120 + (sea > 96 ? 0 : 30), sea, W, H - sea);
          if (cold) for (let i = 0; i < 10; i++) R(c, '#fff', rnd(i + Math.floor(t * 4)) * W, rnd(i + 3) * 60, 1, 1);   // 雪
        } },
        { cap: '最後の氷期が終わって あたたかくなってから 積もった土で、低い土地ができた（完新世の地層・沖積層）。', draw(c, t) {
          sky(c); sun(c, 160, 16);
          R(c, '#6f8f48', 0, 50, 70, 94); R(c, '#7d9a52', 70, 70, 50, 74);
          const k = k01(t, 0.2, 3.5);
          R(c, '#2f7cbc', 120, 96, W, 48);
          for (let i = 0; i < Math.floor(k * 8); i++) R(c, i % 2 ? '#a08458' : '#8c7a55', 120, 140 - i * 5, W - 120, 5);   // 積もる土
          if (k >= 1) for (let i = 0; i < 6; i++) R(c, '#9ccc5a', 124 + i * 11, 100, 8, 3);   // 田んぼ
          if (k >= 1) { house(c, 84, 60, '#f4f1e6', '#8a5a3a'); house(c, 98, 62, '#f4f1e6', '#5a5a5a'); }
        } },
      ] },
  ];

  /* ---------- 画面 ---------- */
  let root, cv, ctx, raf = 0, cur = null, idx = 0, t0 = 0, onEnd = null, endT = 0;
  function build() {
    root = document.createElement('div');
    root.className = 'jump movie'; root.id = 'movie'; root.hidden = true;
    root.innerHTML = `<div class="jump-top"><b data-mv="title"></b><span class="jump-btns"><button type="button" class="btn mini" data-mv="close" aria-label="とじる">とじる</button></span></div>
      <div class="jump-stage"><canvas width="${W}" height="${H}" aria-label="ドット絵ムービー"></canvas></div>
      <p class="movie-cap" data-mv="cap" aria-live="polite"></p>
      <div class="movie-bar"><span class="movie-dots" data-mv="dots"></span><button type="button" class="btn mini" data-mv="next">つぎへ ▶</button></div>`;
    document.body.appendChild(root);
    cv = root.querySelector('canvas'); ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-mv]');
      if (b && b.dataset.mv === 'close') return close();
      if ((b && b.dataset.mv === 'next') || e.target === cv) next();
    });
    document.addEventListener('keydown', e => { if (!root.hidden && (e.key === 'Escape')) close(); else if (!root.hidden && (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight')) { e.preventDefault(); next(); } });
    window.addEventListener('resize', fit);
  }
  function fit() {
    if (!root || root.hidden) return;
    const box = root.querySelector('.jump-stage'), s = Math.min(box.clientWidth / W, (box.clientHeight || 9999) / H), scale = s >= 2 ? Math.floor(s) : s;
    cv.style.width = W * scale + 'px'; cv.style.height = H * scale + 'px';
  }
  function show(i) {
    idx = i; t0 = performance.now(); endT = 0;
    const sc = cur.scenes[i];
    root.querySelector('[data-mv="cap"]').textContent = sc.cap;
    root.querySelector('[data-mv="dots"]').innerHTML = cur.scenes.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('');
    root.querySelector('[data-mv="next"]').textContent = i < cur.scenes.length - 1 ? 'つぎへ ▶' : 'おわり';
  }
  function next() { if (!cur) return; if (idx < cur.scenes.length - 1) show(idx + 1); else close(); }
  function loop(now) {
    if (!cur) return;
    const t = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H);
    cur.scenes[idx].draw(ctx, Math.min(t, SCENE + 30));
    if (t > SCENE) { if (idx < cur.scenes.length - 1) show(idx + 1); else if (!endT) endT = now; else if (now - endT > 3000) return close(); }   // 最後の場面は、少し長く見せてから閉じる（おまかせ歩きのときも止まったままにならないように）
    raf = requestAnimationFrame(loop);
  }
  function play(id, end) {
    const m = MOVIES.find(x => x.id === id);
    if (!m) return false;
    if (!root) build();
    cur = m; onEnd = end || null;
    root.querySelector('[data-mv="title"]').textContent = `📽️ ${m.title}`;
    root.hidden = false; document.body.classList.add('jump-open');
    fit(); show(0);
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    return true;
  }
  function close() {
    if (!cur) return;
    const m = cur, done = idx >= m.scenes.length - 1;   // 最後の場面まで見たか
    cur = null; cancelAnimationFrame(raf);
    root.hidden = true; document.body.classList.remove('jump-open');
    if (onEnd) onEnd(m, done);
  }
  // spot（spots.json の id。頭に「f-」が付いた読みこみ済みの id でもよい）と地区から、そこで流れるムービー
  const movieAt = (id, area) => { const sid = String(id || '').replace(/^f-/, ''); return MOVIES.find(m => (m.spots || []).includes(sid)) || MOVIES.find(m => m.area && m.area === area) || null; };
  window.NISHIO_MOVIE = { list: MOVIES, play, close, movieAt, get playing() { return cur && cur.id; }, get scene() { return cur ? idx : -1; } };
})();
