// にしおさんぽGO：ミニゲーム「コンバインで稲刈り」
// ・ドット絵の地図で田んぼの上にいるとき、地図の右上の列の「稲刈り」ボタンから遊べる（pixel.js の pxHarvest。あるいて移動でも）
// ・黄金色の田んぼを、コンバインで1マスずつ刈る。矢印（◀▲▼▶・キーボードの矢印や WASD）を押すと、その向きへ1マス進む
// ・成功の条件：①刈り残しがない ②刈ったあとのマスを通らない（むだ走り0） ③曲がる回数が目安＋2回まで（目安はいちばん少ない刈り方の回数）
//   どれかひとつでもだめなら不成功。目安ちょうどなら「名人」。長い辺にそった往復や、外側からの回り刈りだと、曲がる回数が少なくなる
// ・田んぼは3枚（だんだん広くなる）。成功すると次の田んぼへ。ごほうびは game.js の harvestReward（1日1回）
// ・絵は Blender で作ったもの：田んぼ（nishio-go/maptiles/paddy-gold.png・paddy-stubble.png）、コンバインと軽トラ（sprites.png）
(() => {
  'use strict';
  const W = 192, H = 144, T = 16;   // 画面（12×9マス）
  const FIELDS = [{ w: 5, h: 4, name: '1枚目（小さな田んぼ）' }, { w: 7, h: 5, name: '2枚目（ふつうの田んぼ）' }, { w: 9, h: 6, name: '3枚目（広い田んぼ）' }];
  const SLACK = 2;   // 曲がる回数は、目安より2回多いところまで成功
  const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
  const ORDER = ['up', 'right', 'down', 'left'];
  const KEYMAP = { ArrowUp: 'up', w: 'up', W: 'up', ArrowRight: 'right', d: 'right', D: 'right', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left' };

  let root, cv, ctx, scale = 2, raf = 0, running = false;
  let lv = 0, F, ox, oy, cut, pos, dir, moves, waste, turns, par, done, shown, gen = 0, anim, queue, parts, msg, msgT;   // done：もう動かせない（刈り終わった・おわる）、shown：結果を出した、gen：何回目の田んぼか
  const art = { gold: null, stub: null, spr: null };

  /* ---------- 絵（Blender のシートを読む。読めないあいだは色だけで描く） ---------- */
  function loadArt() {
    if (art.req) return;
    art.req = true;
    const get = (src, key) => { const img = new Image(); img.onload = () => { art[key] = img; }; img.src = src; };
    get('nishio-go/maptiles/paddy-gold.png', 'gold');
    get('nishio-go/maptiles/paddy-stubble.png', 'stub');
    get('nishio-go/maptiles/sprites.png', 'spr');
  }

  /* ---------- 目安（いちばん少ない曲がる回数）：回り刈り（右回り・左回り）と、往復刈り（たて・よこ）で数えて、少ないほう ---------- */
  function turnsOf(path, startDir) {
    let d = startDir, n = 0;
    for (let i = 1; i < path.length; i++) {
      const nd = dirOf(path[i - 1], path[i]);
      n += nd === d ? 0 : (ORDER.indexOf(nd) + 2) % 4 === ORDER.indexOf(d) ? 2 : 1;
      d = nd;
    }
    return n;
  }
  const dirOf = (a, b) => b[0] > a[0] ? 'right' : b[0] < a[0] ? 'left' : b[1] > a[1] ? 'down' : 'up';
  function spiral(w, h, first, step) {   // 入口（左下）から first の向きに進み、行けなくなったら step（1 右回り・3 左回り）だけ向きをかえる
    const seen = new Set(), path = [[0, h - 1]];
    seen.add('0,' + (h - 1));
    let d = ORDER.indexOf(first);
    while (path.length < w * h) {
      let moved = false;
      for (let tries = 0; tries < 2 && !moved; tries++) {
        const [dx, dy] = DIRS[ORDER[d]], [x, y] = path[path.length - 1], nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && !seen.has(nx + ',' + ny)) { path.push([nx, ny]); seen.add(nx + ',' + ny); moved = true; }
        else d = (d + step) % 4;
      }
      if (!moved) return null;
    }
    return path;
  }
  function serpentine(w, h, vertical) {
    const path = [];
    if (vertical) for (let x = 0; x < w; x++) for (let k = 0; k < h; k++) path.push([x, x % 2 ? k : h - 1 - k]);
    else for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) path.push([r % 2 ? w - 1 - k : k, h - 1 - r]);
    return path;
  }
  function parOf(w, h) {
    const cands = [spiral(w, h, 'up', 1), spiral(w, h, 'right', 3), serpentine(w, h, true), serpentine(w, h, false)].filter(p => p && p.length === w * h);
    return Math.min(...cands.map(p => turnsOf([[0, h], ...p], 'up')));   // 入口の外（左下の下）から上向きに入る
  }

  /* ---------- ゲームの進み ---------- */
  function reset(level) {
    lv = level;
    F = FIELDS[lv];
    ox = Math.floor((12 - F.w) / 2); oy = Math.max(1, Math.floor((8 - F.h) / 2));   // 田んぼの左上（マス）。下に道
    cut = Array.from({ length: F.h }, () => new Array(F.w).fill(false));
    pos = [0, F.h]; dir = 'up';   // 入口：左下のマスの下（道の上）
    moves = 0; waste = 0; turns = 0; done = false; shown = false; gen++; queue = []; parts = []; anim = null;
    par = parOf(F.w, F.h);
    say(`${F.name}。曲がる回数を少なく`);
    if (root) root.querySelector('.jump-result').hidden = true;
  }
  function say(t) { msg = t; msgT = performance.now(); }
  const inField = (x, y) => x >= 0 && y >= 0 && x < F.w && y < F.h;
  const left = () => cut.reduce((n, r) => n + r.filter(c => !c).length, 0);

  function move(d) {
    if (done || !running) return;
    if (anim) { if (queue.length < 2) queue.push(d); return; }
    const [dx, dy] = DIRS[d], nx = pos[0] + dx, ny = pos[1] + dy;
    if (!inField(nx, ny)) { say('あぜには出られません'); bump(); return; }
    const t = d === dir ? 0 : (ORDER.indexOf(d) + 2) % 4 === ORDER.indexOf(dir) ? 2 : 1;   // 向きをかえた回数（うしろ向きは2回）
    turns += t;   // 入口からは上にしか入れないので、さいしょの1マスは曲がらない
    anim = { from: pos.slice(), to: [nx, ny], t0: performance.now() };
    dir = d; pos = [nx, ny]; moves++;
    if (cut[ny][nx]) { waste++; say('刈ったマスを走った（むだ走り）'); sound('waste'); }
    else {
      cut[ny][nx] = true; sound('cut');
      for (let i = 0; i < 6; i++) parts.push({ x: (ox + nx) * T + 8, y: (oy + ny) * T + 8, vx: (Math.random() - 0.5) * 1.6, vy: -Math.random() * 1.6, life: 30 });
      if (!left()) { done = true; queue = []; const g = gen; setTimeout(() => { if (running && g === gen) finish(); }, 260); }   // 刈り終わり：連打の先行入力が むだ走り にならないように、ここで止める（とじて開きなおしたら出さない）
    }
  }
  function bump() { sound('bump'); }

  function judge() {
    const rest = left();
    const ok = rest === 0 && waste === 0 && turns <= par + SLACK;
    const reasons = [];
    if (rest) reasons.push(`刈り残しが ${rest}マス あります`);
    if (waste) reasons.push(`刈ったあとを ${waste}回 走りました（むだ走り）`);
    if (turns > par + SLACK) reasons.push(`曲がった回数 ${turns}回 は多すぎます（目安 ${par}回）`);
    const stars = !ok ? 0 : turns <= par ? 3 : turns <= par + 1 ? 2 : 1;
    return { ok, rest, stars, reasons };
  }
  function finish(gaveUp) {
    if (shown) return;
    shown = true; done = true;
    const r = judge(), G = window.nishioGo;
    const got = r.ok && G && G.harvestReward ? G.harvestReward(r.stars, lv) : null;
    const res = root.querySelector('.jump-result');
    const head = r.ok ? (r.stars === 3 ? '名人の刈り方！' : '刈り取り成功！') : (gaveUp && r.rest ? '刈り残しがあります' : '不成功');
    res.innerHTML = `<b>${head}</b>`
      + (r.ok ? `<span>${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}　曲がった回数 ${turns}回（目安 ${par}回）</span>` : r.reasons.map(t => `<span>${t}</span>`).join(''))
      + (!r.ok ? '<span class="harvest-tip">ヒント：長い辺にそってまっすぐ往復するか、外がわからうずまきのように回ると、むだなく少ない曲がりで刈れます</span>' : '')
      + (got > 0 ? `<span>きょうのごほうび +${got}pt</span>` : r.ok && got === null && G && G.harvestReward ? '<span>きょうのごほうびは、もうもらいました（あしたまた）</span>' : '')
      + `<span class="jump-btns"><button type="button" class="btn" data-hv="again">もういちど</button>${r.ok && lv < FIELDS.length - 1 ? '<button type="button" class="btn" data-hv="next">つぎの田んぼ</button>' : ''}<button type="button" class="btn" data-hv="close">もどる</button></span>`;
    res.hidden = false;
    sound(r.ok ? 'clear' : 'fail');
    if (G && G.track) G.track(r.ok ? 'harvest_clear' : 'harvest_fail', { level: lv + 1, turns, par, waste, rest: r.rest, stars: r.stars });
  }

  /* ---------- 音（BGM の設定がオフなら鳴らさない） ---------- */
  let ac = null;
  function sound(kind) {
    try { if (localStorage.getItem('nsg_bgm') === 'false') return; } catch (e) { /* 保存できない環境でも鳴らす */ }
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      const P = { cut: ['square', 220, 160, 0.06], waste: ['sawtooth', 120, 90, 0.12], bump: ['square', 90, 70, 0.08], clear: ['triangle', 520, 880, 0.4], fail: ['triangle', 300, 150, 0.4] }[kind];
      o.type = P[0]; o.frequency.setValueAtTime(P[1], t); o.frequency.linearRampToValueAtTime(P[2], t + P[3]);
      g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + P[3]);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + P[3] + 0.02);
    } catch (e) { /* 音が出せなくても遊べる */ }
  }

  /* ---------- 描く ---------- */
  function draw(now) {
    ctx.fillStyle = '#3f9b3c'; ctx.fillRect(0, 0, W, H);   // まわりは草（あぜ）
    for (let i = 0; i < 40; i++) { ctx.fillStyle = i % 2 ? '#2f7f2e' : '#56b552'; ctx.fillRect((i * 37) % W, (i * 53) % H, 1, 1); }
    ctx.fillStyle = '#a9a9a4'; ctx.fillRect(0, (oy + F.h) * T + 2, W, T - 4);   // 下の道
    ctx.fillStyle = '#6b5a3a'; ctx.fillRect(ox * T - 2, oy * T - 2, F.w * T + 4, F.h * T + 4);   // あぜのふち
    const sway = Math.floor(now / 500) & 1;
    for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) {
      const X = (ox + x) * T, Y = (oy + y) * T, k = (x * 7 + y * 3) % 9;
      const img = cut[y][x] ? art.stub : art.gold;
      if (img) ctx.drawImage(img, k * T, (cut[y][x] ? 0 : sway) * T, T, T, X, Y, T, T);
      else { ctx.fillStyle = cut[y][x] ? '#a89a6a' : '#cfae4a'; ctx.fillRect(X, Y, T, T); }
    }
    // 軽トラ（入口の横に止めてある。もみを運ぶ）
    if (art.spr) ctx.drawImage(art.spr, 0, 0, T, T, (ox + 1) * T + 4, (oy + F.h) * T, T, T);
    // コンバイン（動くあいだは、なめらかに）
    let [px, py] = pos;
    if (anim) {
      const k = Math.min(1, (now - anim.t0) / 120);
      px = anim.from[0] + (anim.to[0] - anim.from[0]) * k; py = anim.from[1] + (anim.to[1] - anim.from[1]) * k;
      if (k >= 1) { anim = null; if (queue.length) setTimeout(() => move(queue.shift()), 0); }
    }
    const X = Math.round((ox + px) * T), Y = Math.round((oy + py) * T);
    if (art.spr) ctx.drawImage(art.spr, (6 + ORDER.indexOf(dir)) * T, 0, T, T, X, Y - 2, T, T);
    else { ctx.fillStyle = '#e0602a'; ctx.fillRect(X + 2, Y + 2, 12, 12); }
    // わらくず
    parts = parts.filter(p => p.life-- > 0);
    for (const p of parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.08; ctx.fillStyle = p.life % 2 ? '#f2d36b' : '#cdbf8e'; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
    // 数字と ひとこと は、絵の上下の文字で（絵の中の 8px の文字では、ドット文字の漢字がつぶれて読めなかった）
    const total = F.w * F.h;
    hud('cut', `刈った ${total - left()}/${total}`, false);
    hud('turn', `曲がる ${turns}（目安${par}）`, turns > par + SLACK);
    hud('waste', `むだ ${waste}`, !!waste);
    hud('msg', msg && now - msgT < 2600 ? msg : '', false);
  }
  function hud(k, text, warn) {   // 変わったときだけ書きかえる
    const el = root.querySelector(`[data-h="${k}"]`);
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('warn', warn);
  }
  function loop(now) {
    if (!running) return;
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
    root.className = 'jump harvest'; root.id = 'harvest'; root.hidden = true;
    root.innerHTML = `<div class="jump-top"><b>コンバインで稲刈り</b><span class="jump-btns"><button type="button" class="btn mini" data-hv="end" aria-label="ここで終える">おわる</button><button type="button" class="btn mini" data-hv="close" aria-label="とじる">とじる</button></span></div>
      <div class="harvest-hud"><span data-h="cut"></span><span data-h="turn"></span><span data-h="waste"></span></div>
      <div class="jump-stage"><canvas width="${W}" height="${H}" aria-label="ミニゲーム コンバインで稲刈り"></canvas><div class="jump-result" hidden></div></div>
      <p class="harvest-msg" data-h="msg"></p>
      <p class="jump-help">矢印で1マスずつ進んで刈る。刈り残し・刈ったあとを走る・曲がりすぎ は不成功。長い辺にそって進むのがコツ</p>
      <div class="harvest-pad"><button type="button" data-dir="up" aria-label="上へ">▲</button><button type="button" data-dir="left" aria-label="左へ">◀</button><button type="button" data-dir="down" aria-label="下へ">▼</button><button type="button" data-dir="right" aria-label="右へ">▶</button></div>`;
    document.body.appendChild(root);
    cv = root.querySelector('canvas'); ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-hv]');
      if (!b) return;
      const a = b.dataset.hv;
      if (a === 'close') close();
      else if (a === 'again') reset(lv);
      else if (a === 'next') reset(Math.min(FIELDS.length - 1, lv + 1));
      else if (a === 'end') finish(true);
    });
    root.querySelectorAll('[data-dir]').forEach(b => {
      b.addEventListener('pointerdown', e => { e.preventDefault(); move(b.dataset.dir); b.classList.add('on'); });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => b.classList.remove('on'));
      b.addEventListener('contextmenu', e => e.preventDefault());
    });
    window.addEventListener('keydown', e => {
      if (!running) return;
      const d = KEYMAP[e.key];
      if (d) { e.preventDefault(); if (!e.repeat) move(d); }
      if (e.key === 'Escape') close();
    });
    window.addEventListener('resize', () => { if (running) fit(); });
  }
  function open() {
    if (!root) build();
    loadArt();
    reset(0);
    root.hidden = false; document.body.classList.add('jump-open');
    fit();
    running = true; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    const G = window.nishioGo; if (G && G.track) G.track('harvest_open', {});
  }
  function close() {
    running = false; cancelAnimationFrame(raf);
    if (root) root.hidden = true;
    document.body.classList.remove('jump-open');
  }
  // テスト用：動かす・ようすを見る・目安のこたえ（回り刈り）
  window.NISHIO_HARVEST = {
    open, close, reset, move(d) { anim = null; queue = []; move(d); anim = null; },
    get info() { return F ? { level: lv, w: F.w, h: F.h, pos: pos.slice(), dir, moves, waste, turns, par, left: left(), done, result: done ? judge() : null } : null; },
    parOf, spiral, serpentine, turnsOf, FIELDS,
  };
})();
