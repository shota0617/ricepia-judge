// にしおさんぽGO：ミニゲーム「肥料山の草刈り」
// ・肥料山（採草地）で草を刈り、背負いかご（5束まで）に入れて、下の田んぼへ運ぶ。60秒で運んだ束の数で ★（15束・25束・35束）
// ・とちゅうで山の持ち主が「肥料山を返してくれ」と言いに来る。1948年の幡豆地方事務所長の方針どおり「知事の許可がいる」と答えると、
//   持ち主は帰って +10秒。「返す」と答えると、そこで草刈りは おしまい
// ・ことばは sangyo.js（資料集649ページ 資料347「肥料山の取扱についての方針」）に書いてあることだけ。草を刈って運ぶ遊び方は、
//   「草を刈る山（採草地）」という中身からの作りもの（何束とったかなどの数は本には書いていない）
// ・遊べる所：ドット絵の地図で丘・山のマス（またはすぐとなり）にいるとき、地図の右上の列の 🌿 ボタン（pixel.js の pxHiryo）。
//   「本のできごと」の「肥料山の取り上げ」（明治の幡豆村・三和村・豊坂村の町で起きる）からも始まる（bookev.js）
// ・ごほうびは game.js の hiryoReward（1日1回）。自己ベストは miniBest（'hiryo'）。持ち主に正しく答えると「本のできごと」も1つ見たことになる
// ・人の絵は、地図の人の絵（pixel.js の npcSprite）を使う
(() => {
  'use strict';
  const W = 192, H = 144, T = 16, COLS = 12, ROWS = 9;   // 画面（12×9マス）
  const TIME = 60, CARRY = 5, OWNER_AT = 30, STARS = [15, 25, 35];
  const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
  const KEYMAP = { ArrowUp: 'up', w: 'up', W: 'up', ArrowRight: 'right', d: 'right', D: 'right', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left' };
  // マス：g 草、c 刈ったあと、r 岩（通れない）、t 木（通れない）、p 道、f 田んぼ（ここで束をおろす）
  let root, cv, ctx, scale = 2, raf = 0, running = false, last = 0;
  let map, pos, carry, done, shown, gen = 0, left, owner, ownerAsked, ownerOk = false, total = 0, msg, msgT, fromEvent = false, parts;
  const art = { me: null, owner: null };

  function layout() {   // 日ごとに岩と木の場所がかわる（その日のうちは同じ）
    const d = new Date(), seed0 = d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate();
    let s = seed0;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const m = [];
    for (let y = 0; y < ROWS; y++) {
      const row = [];
      for (let x = 0; x < COLS; x++) {
        if (y === ROWS - 1) row.push('f');
        else if (y === ROWS - 2) row.push('p');
        else row.push(rnd() < 0.1 ? (rnd() < 0.5 ? 'r' : 't') : 'g');
      }
      m.push(row);
    }
    return m;
  }
  function reset() {
    map = layout(); pos = [5, ROWS - 2]; carry = 0; done = false; shown = false; gen++;
    left = TIME; owner = null; ownerAsked = false; parts = []; last = performance.now();
    total = 0; ownerOk = false;
    say('草を刈って（5束まで）、下の田んぼへ運ぼう');
    if (root) root.querySelector('.jump-result').hidden = true;
  }
  function say(t) { msg = t; msgT = performance.now(); }

  function move(d) {
    if (done || !running || owner) return;
    const [dx, dy] = DIRS[d] || [0, 0], nx = pos[0] + dx, ny = pos[1] + dy;
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return;
    const c = map[ny][nx];
    if (c === 'r' || c === 't') { say(c === 'r' ? '岩があって進めない' : '木があって進めない'); return; }
    if (c === 'g') {
      if (carry >= CARRY) { say('背負いかごが いっぱい。田んぼへ運ぼう'); return; }
      map[ny][nx] = 'c'; carry++;
      for (let i = 0; i < 5; i++) parts.push({ x: nx * T + 8, y: ny * T + 8, vx: (Math.random() - 0.5) * 1.4, vy: -Math.random() * 1.4, life: 24 });
      sound('cut');
    }
    pos = [nx, ny];
    if (c === 'f' && carry) { total += carry; say(`${carry}束 おろした（ぜんぶで ${total}束）`); carry = 0; sound('drop'); }
  }

  function askOwner() {
    owner = { t: performance.now() }; ownerAsked = true;
    const res = root.querySelector('.jump-result');
    res.innerHTML = `<b>山の持ち主が来た</b><span>持ち主「田んぼは買収されてまったで、この肥料山は返してもらうでな」</span>
      <span class="jump-btns hy-ans">${[['ok', '知事の許可がないと取り上げられんはず'], ['give', 'わかった、返すよ'], ['mayor', '村長に決めてもらう']].sort(() => Math.random() - 0.5).map(([k, t]) => `<button type="button" class="btn" data-hy="${k}">${t}</button>`).join('')}</span>`;
    res.hidden = false;
  }
  function answer(a) {
    if (!owner) return;
    owner = null;
    const res = root.querySelector('.jump-result');
    res.hidden = true;
    if (a === 'ok') { left += 10; ownerOk = true; say('持ち主は帰っていった（+10秒）。知事の許可なしには取り上げられない'); }
    else if (a === 'give') { ownerOk = false; finish('give'); }
    else { ownerOk = false; say('持ち主は帰っていった。でも、決めるのは村長ではなく知事の許可だった'); }
    last = performance.now();
  }
  const starsOf = n => STARS.filter(s => n >= s).length;
  function finish(why) {
    if (shown) return;
    shown = true; done = true;
    const G = window.nishioGo, st = starsOf(total);
    const got = st && G && G.hiryoReward ? G.hiryoReward(st) : null;
    const mb = st && G && G.miniBest ? G.miniBest('hiryo', 0, st, total, false) : null;
    const be = window.NISHIO_BOOKEV, ev = be && be.EVENTS.find(e => e.id === 'hiryoyama');
    const bk = ev && G && G.bookEvDone && ownerAsked && !(G.bookEvHas && G.bookEvHas('hiryoyama')) ? G.bookEvDone('hiryoyama', ownerOk, ev.facts, be.EVENTS.length) : null;
    const res = root.querySelector('.jump-result');
    res.innerHTML = `<b>${why === 'give' ? '肥料山を返した…' : st ? '草刈り おわり！' : '時間切れ'}</b>`
      + `<span>${'★'.repeat(st)}${'☆'.repeat(3 - st)}　運んだ束 ${total}（★は ${STARS.join('・')}束）</span>`
      + (mb && mb.best ? `<span>${mb.fresh ? '自己ベスト更新！ ' : '自己ベスト '}${mb.best.v}束</span>` : '')
      + (got > 0 ? `<span>きょうのごほうび +${got}pt</span>` : st && got === null && G && G.hiryoReward ? '<span>きょうのごほうびは、もうもらいました（あしたまた）</span>' : '')
      + (bk ? `<span>📖 本のできごと ${bk.n}/${be.EVENTS.length}${bk.pts ? ` +${bk.pts}pt` : ''}</span>` : '')
      + '<span class="harvest-tip">1948年の幡豆地方事務所長の方針：田畑だけが買収されても、のこった肥料山の草刈りには小作の権利があり、持ち主が勝手に取り上げたり売ったりはできず、知事の許可がいるとされた。肥料山は、田畑といっしょに貸し借りされ、農業にとても大事な役わりをもっていた。</span>'
      + '<span class="jump-btns"><button type="button" class="btn" data-hy="again">もういちど</button><button type="button" class="btn" data-hy="close">もどる</button></span>';
    res.hidden = false;
    sound(st ? 'clear' : 'fail');
    if (G && G.track) G.track('hiryo_end', { total, stars: st, owner: ownerOk, why: why || 'time' });
  }

  /* ---------- 音（BGM の設定がオフなら鳴らさない） ---------- */
  let ac = null;
  function sound(kind) {
    try { if (localStorage.getItem('nsg_bgm') === 'false') return; } catch (e) { /* 保存できない環境でも鳴らす */ }
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      const P = { cut: ['square', 260, 200, 0.05], drop: ['triangle', 440, 660, 0.12], clear: ['triangle', 520, 880, 0.4], fail: ['triangle', 300, 150, 0.4] }[kind];
      o.type = P[0]; o.frequency.setValueAtTime(P[1], t); o.frequency.linearRampToValueAtTime(P[2], t + P[3]);
      g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + P[3]);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + P[3] + 0.02);
    } catch (e) { /* 音が出せなくても遊べる */ }
  }

  /* ---------- 描く ---------- */
  function draw(now) {
    const sway = Math.floor(now / 400) & 1;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const X = x * T, Y = y * T, c = map[y][x], k = (x * 7 + y * 3) % 5;
      if (c === 'f') { ctx.fillStyle = '#7a9a3a'; ctx.fillRect(X, Y, T, T); ctx.fillStyle = '#5c7a2a'; for (let i = 2; i < T; i += 4) ctx.fillRect(X + i, Y + 3, 1, 10); continue; }
      if (c === 'p') { ctx.fillStyle = '#c8b48a'; ctx.fillRect(X, Y, T, T); ctx.fillStyle = '#b09c72'; ctx.fillRect(X + k * 3, Y + 6, 2, 1); continue; }
      ctx.fillStyle = c === 'c' ? '#9cc46a' : '#4f8e34'; ctx.fillRect(X, Y, T, T);   // 山の斜面
      if (c === 'g') { ctx.fillStyle = '#3a7a2a'; for (let i = 0; i < 4; i++) { const gx = X + 2 + i * 4 + (sway && i % 2 ? 1 : 0); ctx.fillRect(gx, Y + 3 + (i % 2) * 2, 1, 10); ctx.fillStyle = i % 2 ? '#6ab04a' : '#3a7a2a'; } }
      if (c === 'c') { ctx.fillStyle = '#7aa850'; for (let i = 0; i < 4; i++) ctx.fillRect(X + 2 + i * 4, Y + 11, 1, 3); }
      if (c === 'r') { ctx.fillStyle = '#8e8a80'; ctx.fillRect(X + 3, Y + 6, 10, 8); ctx.fillStyle = '#b8b4aa'; ctx.fillRect(X + 4, Y + 6, 6, 2); }
      if (c === 't') { ctx.fillStyle = '#6b4a30'; ctx.fillRect(X + 7, Y + 9, 2, 6); ctx.fillStyle = '#2f6b33'; ctx.fillRect(X + 3, Y + 2, 10, 8); ctx.fillStyle = '#3f8a3a'; ctx.fillRect(X + 4, Y + 2, 6, 3); }
    }
    // わらくず
    parts = parts.filter(p => p.life-- > 0);
    for (const p of parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.08; ctx.fillStyle = p.life % 2 ? '#8ccc5a' : '#4f8e34'; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
    // 主人公（せおった束を背中に）
    const [px, py] = pos, X = px * T, Y = py * T;
    if (art.me) ctx.drawImage(art.me, X, Y - 2, T, T); else { ctx.fillStyle = '#e0602a'; ctx.fillRect(X + 4, Y + 2, 8, 12); }
    for (let i = 0; i < carry; i++) { ctx.fillStyle = '#a8c050'; ctx.fillRect(X + 12, Y + 12 - i * 2, 4, 2); }
    if (owner) { const ox = Math.min(COLS - 1, px + 1) * T; if (art.owner) ctx.drawImage(art.owner, ox, Y - 2, T, T); else { ctx.fillStyle = '#556'; ctx.fillRect(ox + 4, Y + 2, 8, 12); } }
    hud('time', `のこり ${Math.ceil(left)}秒`, left < 10);
    hud('carry', `かご ${carry}/${CARRY}`, carry >= CARRY);
    hud('total', `運んだ ${total}束`, false);
    hud('msg', msg && now - msgT < 2600 ? msg : '', false);
  }
  function hud(k, text, warn) {
    const el = root.querySelector(`[data-h="${k}"]`);
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('warn', warn);
  }
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.2, (now - last) / 1000); last = now;
    if (!done && !owner) {
      left -= dt;
      if (!ownerAsked && left <= OWNER_AT) askOwner();
      if (left <= 0) { left = 0; finish('time'); }
    }
    draw(now);
    raf = requestAnimationFrame(loop);
  }
  function fit() {
    const box = root.querySelector('.jump-stage');
    const fitS = Math.min(box.clientWidth / W, (box.clientHeight || 9999) / H);
    scale = fitS >= 2 ? Math.floor(fitS) : fitS;
    cv.style.width = W * scale + 'px'; cv.style.height = H * scale + 'px';
  }

  /* ---------- 画面 ---------- */
  function build() {
    root = document.createElement('div');
    root.className = 'jump harvest hiryo'; root.id = 'hiryo'; root.hidden = true;
    root.innerHTML = `<div class="jump-top"><b>肥料山の草刈り</b><span class="jump-btns"><button type="button" class="btn mini" data-hy="close" aria-label="とじる">とじる</button></span></div>
      <div class="harvest-hud"><span data-h="time"></span><span data-h="carry"></span><span data-h="total"></span></div>
      <div class="jump-stage"><canvas width="${W}" height="${H}" aria-label="ミニゲーム 肥料山の草刈り"></canvas><div class="jump-result" hidden></div></div>
      <p class="harvest-msg" data-h="msg"></p>
      <p class="jump-help">矢印で歩くと草を刈る（背負いかごに5束まで）。下の田んぼに着くと束をおろす。肥料山（採草地）は、田畑といっしょに貸し借りされた、草を刈る山</p>
      <div class="harvest-pad"><button type="button" data-dir="up" aria-label="上へ">▲</button><button type="button" data-dir="left" aria-label="左へ">◀</button><button type="button" data-dir="down" aria-label="下へ">▼</button><button type="button" data-dir="right" aria-label="右へ">▶</button></div>`;
    document.body.appendChild(root);
    cv = root.querySelector('canvas'); ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-hy]');
      if (!b) return;
      const a = b.dataset.hy;
      if (a === 'close') close();
      else if (a === 'again') reset();
      else answer(a);
    });
    root.querySelectorAll('[data-dir]').forEach(b => {
      b.addEventListener('pointerdown', e => { e.preventDefault(); move(b.dataset.dir); b.classList.add('on'); });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => b.classList.remove('on'));
      b.addEventListener('contextmenu', e => e.preventDefault());
    });
    window.addEventListener('keydown', e => {
      if (!running) return;
      const d = KEYMAP[e.key];
      if (d) { e.preventDefault(); move(d); }
      if (e.key === 'Escape') close();
    });
    window.addEventListener('resize', () => { if (running) fit(); });
  }
  function open(byEvent) {
    if (!root) build();
    const P = window.nishioPixel;
    if (P && P.npcSprite) { try { art.me = P.npcSprite('staff'); art.owner = P.npcSprite('elder'); } catch (e) { /* 絵がなくても遊べる */ } }
    fromEvent = !!byEvent;
    reset();
    root.hidden = false; document.body.classList.add('jump-open');
    fit();
    running = true; last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    const G = window.nishioGo; if (G && G.track) G.track('hiryo_open', { by: fromEvent ? 'event' : 'map' });
  }
  function close() {
    running = false; gen++; cancelAnimationFrame(raf);
    if (root) root.hidden = true;
    document.body.classList.remove('jump-open');
  }
  // テスト用
  window.NISHIO_HIRYO = {
    open, close, reset, move, answer, finish, STARS,
    setLeft(v) { left = v; },
    get info() { return map ? { pos: pos.slice(), carry, total, left, owner: !!owner, ownerAsked, done, map: map.map(r => r.join('')) } : null; },
  };
})();
