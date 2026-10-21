// にしおさんぽGO：ミニゲーム「段丘をのぼる」（たての段丘崖を、岩のでっぱりをジャンプで上る）
// ・ドット絵の地図で、急な坂（段丘のへりの崖。山や丘はのぞく）のそばにいるとき、地図の右上の列のボタンから遊べる（pixel.js の pxDankyu）
// ・下の田んぼ（氾濫平野）から、少し高い自然堤防、碧海層の見える段丘崖をへて、上の碧海台地の旗をめざす
// ・崖の途中の「露頭」（碧海層が見える所）にさわると、まめちしき。上から落ちてくる小石にあたると ♥ がへる（3つ）。時間切れか ♥ がなくなると不成功
// ・段丘は3つ（だんだん高くなる）：西尾の本で分けた a〜e 地区の名前（a・b 地区の碧海台地 → c・d 地区の碧海台地 → e 地区の段丘）。のぼりきると次の段丘へ
// ・★：のぼりきった・露頭をぜんぶ見た・時間が3分の1以上のこった
// ・ことばは shizen.js（西尾の海と大地。出典つき）の「碧海台地と碧海層」「西尾の低い土地」「自然堤防の上の集落」の話だけを使う
// ・主人公と地面の絵は「にしおジャンプ」と同じ Blender の絵（nishio-go/art/runner.png）。ごほうびは game.js の dankyuReward（1日1回）
// ・操作：◀ ▶ と「ジャンプ」、キーボードは ← → / A D と スペース・↑・Z
(() => {
  'use strict';
  const W = 192, H = 144, T = 16, COLS = W / T;   // 画面（12×9マス）
  // 段丘の名前：西尾の本（shizen.js の出典）89ページで、市内の碧海面（碧海台地）を地形で分けた a〜e の地区。場所は図1-3-133 から
  //   a・b：八ツ面山の西〜矢作川ぞい（碧海層の露頭1〜4）。c：五砂山のあたり、d：矢作川の河口に近い南西。e：幡豆山地のふもと（碧海層相当層の露頭6〜9）
  const LEVELS = [{ rows: 30, time: 45, rock: 150, name: 'a・b 地区の碧海台地', where: '八ツ面山の西〜矢作川ぞい', tip: '田んぼの低い土地と、段丘のへりの崖のようすが分かりやすい所' },
    { rows: 42, time: 60, rock: 120, name: 'c・d 地区の碧海台地', where: '五砂山のあたりと、南西の矢作川の河口に近いあたり', tip: 'a〜d 地区は古くから人が住み、土地が大きく変えられた所' },
    { rows: 56, time: 75, rock: 95, name: 'e 地区の段丘', where: '幡豆山地のふもと', tip: 'ここで見える地層は「碧海層相当層」' }];
  const GRAV = 0.28, JUMP = -5.3, RUN = 1.6, ACC = 0.3;   // 1回のジャンプで約3マス上がる。でっぱりの間は2〜2.5マス
  const ART = ['stand', 'run1', 'run2', 'jump'];
  const KEYMAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ' ': 'jump', ArrowUp: 'jump', z: 'jump', Z: 'jump', w: 'jump', W: 'jump' };

  let root, cv, ctx, scale = 2, raf = 0, running = false, last = 0, acc = 0;
  let lv = 0, L, worldH, plats, outcrops, rocks, pl, camY, keys, hearts, frames, done, shown, seen, msg, msgT, zone, nextRock, rnd, hurtT;
  const art = { sheet: null, spr: {} };

  /* ---------- 絵（にしおジャンプの Blender の絵を借りる。読めないあいだは四角） ---------- */
  function loadArt() {
    if (art.req) return;
    art.req = true;
    const img = new Image();
    img.onload = () => {
      const cut = (sx, flip) => {
        const c = document.createElement('canvas'); c.width = 16; c.height = 16;
        const x = c.getContext('2d');
        if (flip) { x.translate(16, 0); x.scale(-1, 1); }
        x.drawImage(img, sx, 0, 16, 16, 0, 0, 16, 16);
        return c;
      };
      ART.forEach((k, i) => { art.spr[k] = cut(i * 16); art.spr[k + 'L'] = cut(i * 16, true); });
      art.spr.groundTop = cut(10 * 16); art.spr.ground = cut(11 * 16);
      art.sheet = img;
    };
    img.src = 'nishio-go/art/runner.png';
  }

  /* ---------- まめちしき（shizen.js の出典つきの話） ---------- */
  function facts(id) {
    const z = (window.NISHIO_SHIZEN || []).find(x => x.id === id);
    return z ? z.facts.slice() : [];
  }

  /* ---------- 段丘を作る（日と段丘ごとに決まった乱数。毎日ちがう崖） ---------- */
  function seeded(n) {
    let s = n >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function dayNum() { const d = new Date(); return d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate(); }
  // 下から：田んぼ（いちばん下の1マス）→ 小さな段 → 自然堤防（下から5マス目の帯）→ 段丘崖（でっぱり）→ 碧海台地（上から3マス目の帯）
// でっぱりの間は たて2〜3マス（3マスのときは横2マスまで、2マスのときは横3マスまで）。どれも1回のジャンプで届く
  function build(level) {
    L = LEVELS[level];
    rnd = seeded(dayNum() * 7 + level * 101);
    worldH = L.rows * T;
    const levee = L.rows - 5, top = 3;
    plats = [{ x: 0, y: L.rows - 1, w: COLS, kind: 'paddy' }, { x: 1, y: L.rows - 3, w: 3, kind: 'ledge' }, { x: 0, y: levee, w: COLS, kind: 'levee' }, { x: 0, y: top, w: COLS, kind: 'top' }];
    let x = 6, y = levee;
    const path = [];
    while (y > top + 3) {   // 1段ずつ上へ。いちばん上のでっぱりから台地までも2マス以上3マス以下
      const dy = Math.min(rnd() < 0.5 ? 2 : 3, y - top - 2), shift = dy === 3 ? 2 : 3;
      y -= dy;
      const w = 2 + Math.floor(rnd() * 3);
      x = Math.max(0, Math.min(COLS - w, x + Math.round((rnd() * 2 - 1) * shift)));
      const p = { x, y, w, kind: 'ledge' };
      plats.push(p); path.push(p);
    }
    // 道からそれた でっぱり（露頭をおく場所にもなる）
    for (let i = 0; i < path.length; i += 3) {
      const p = path[i], w = 2, sx = p.x > COLS / 2 ? Math.max(0, p.x - 4 - Math.floor(rnd() * 2)) : Math.min(COLS - w, p.x + p.w + 2 + Math.floor(rnd() * 2));
      if (Math.abs(sx - p.x) >= 3) plats.push({ x: sx, y: p.y + 1, w, kind: 'ledge' });
    }
    // 露頭は3つ：崖の下・まん中・上のあたりの でっぱりの上
    const ledges = plats.filter(p => p.kind === 'ledge').sort((a, b) => b.y - a.y);
    outcrops = [0.15, 0.5, 0.85].map((f, i) => {
      const p = ledges[Math.min(ledges.length - 1, Math.floor(f * ledges.length))];
      return { x: (p.x + Math.floor(p.w / 2)) * T, y: (p.y - 1) * T, got: false, n: i };
    }).filter((o, i, a) => a.findIndex(b => b.x === o.x && b.y === o.y) === i);
  }

  /* ---------- ゲームの進み ---------- */
  function reset(level) {
    lv = level;
    build(lv);
    pl = { x: 3 * T, y: (L.rows - 2) * T, vx: 0, vy: 0, face: 1, ground: true };
    rocks = []; keys = { left: false, right: false, jump: false, jumpWas: false };
    hearts = 3; frames = 0; done = false; shown = false; zone = ''; nextRock = 60; hurtT = 0;
    seen = { hekkai: facts('hekkai'), teichi: facts('teichi'), atsuike: facts('teichi-atsuike') };
    camY = worldH - H;
    say(`${lv + 1}つ目：${L.name}（${L.where}）。${L.tip}。上の旗まで のぼろう`);
    if (root) root.querySelector('.jump-result').hidden = true;
  }
  function say(t) { msg = t; msgT = performance.now(); }
  const timeLeft = () => Math.max(0, L.time - frames / 60);

  function zoneOf(y) {   // いる所の名前と、そこで出す話
    const r = y / T;
    if (r <= 3) return 'top';
    if (r >= L.rows - 2) return 'paddy';
    if (r >= L.rows - 6) return 'levee';
    return 'cliff';
  }
  function zoneSay(z) {
    const tei = seen.teichi, hek = seen.hekkai;
    if (z === 'levee') say(`自然堤防：${seen.atsuike[0] || '田んぼより少し高い土地'}`);
    else if (z === 'cliff') say(`段丘崖：${lv === 2 ? L.tip : hek[2] || '台地のへりの崖'}`);   // e 地区は碧海層相当層
    else if (z === 'paddy' && zone) say(`氾濫平野：${tei[0] || 'おもに田んぼ'}`);
  }

  function step() {
    if (done) return;
    frames++;
    // 左右
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (dir) { pl.vx = Math.max(-RUN, Math.min(RUN, pl.vx + dir * ACC)); pl.face = dir; } else pl.vx *= pl.ground ? 0.6 : 0.92;
    // ジャンプ（押した瞬間だけ。地面にいるとき）
    if (keys.jump && !keys.jumpWas && pl.ground) { pl.vy = JUMP; pl.ground = false; sound('jump'); }
    keys.jumpWas = keys.jump;
    pl.vy = Math.min(6, pl.vy + GRAV);
    const oy = pl.y;
    pl.x = Math.max(0, Math.min(W - 10, pl.x + pl.vx));
    pl.y += pl.vy;
    // でっぱりの上にだけ立てる（下からはすりぬけ）
    pl.ground = false;
    if (pl.vy >= 0) for (const p of plats) {
      const top = p.y * T, x0 = p.x * T - 6, x1 = (p.x + p.w) * T - 4;
      if (oy + 15 <= top && pl.y + 15 >= top && pl.x + 5 > x0 && pl.x + 5 < x1) {
        pl.y = top - 15; pl.vy = 0; pl.ground = true;
        if (p.kind === 'top') return clear();
        break;
      }
    }
    // 露頭
    for (const o of outcrops) if (!o.got && Math.abs(pl.x + 5 - (o.x + 8)) < 12 && Math.abs(pl.y + 8 - (o.y + 8)) < 14) {
      o.got = true; sound('find');
      const f = [seen.hekkai[1], seen.hekkai[0], seen.teichi[1]][o.n] || '碧海層が見える所（露頭）';
      say(`露頭 ${outcrops.filter(x => x.got).length}/${outcrops.length}：${f}`);
    }
    // いる所がかわったら、そこの話
    const z = zoneOf(pl.y + 15);
    if (z !== zone) { if (zone) zoneSay(z); zone = z; }
    // 小石（画面の上から落ちる）
    if (--nextRock <= 0) {
      nextRock = Math.max(40, L.rock - Math.floor(frames / 120) * 4) + Math.floor(rnd() * 40);
      rocks.push({ x: 8 + Math.floor(rnd() * (W - 24)), y: camY - 8, vy: 0.6 });
    }
    for (const r of rocks) { r.vy = Math.min(3.2, r.vy + 0.06); r.y += r.vy; }
    rocks = rocks.filter(r => r.y < camY + H + 16);
    if (hurtT > 0) hurtT--;
    else for (const r of rocks) if (Math.abs(r.x + 3 - (pl.x + 5)) < 7 && Math.abs(r.y + 3 - (pl.y + 8)) < 9) {
      r.y = camY + H + 99; hearts--; hurtT = 60; sound('hit');
      say(hearts > 0 ? `小石にあたった（♥ のこり ${hearts}）` : '小石にあたった');
      if (hearts <= 0) return fail('♥ がなくなりました');
      break;
    }
    if (timeLeft() <= 0) return fail('時間切れ');
    // カメラは主人公の少し上をみる
    const want = Math.max(0, Math.min(worldH - H, pl.y - 84));
    camY += (want - camY) * 0.15;
  }
  function stars() {
    const all = outcrops.every(o => o.got), fast = timeLeft() >= L.time / 3;
    return 1 + (all ? 1 : 0) + (fast ? 1 : 0);
  }
  function clear() { done = true; sound('clear'); setTimeout(() => result(true), 300); }
  function fail(why) { done = true; sound('fail'); setTimeout(() => result(false, why), 300); }
  function result(ok, why) {
    if (shown) return;
    shown = true;
    const G = window.nishioGo, st = ok ? stars() : 0;
    const got = ok && G && G.dankyuReward ? G.dankyuReward(st, lv) : null;
    const n = outcrops.filter(o => o.got).length;
    const res = root.querySelector('.jump-result');
    res.innerHTML = `<b>${ok ? `${L.name}に のぼりきった！` : '不成功'}</b><span>${lv + 1}つ目の段丘：${L.name}（${L.where}）</span>`
      + (ok ? `<span>${'★'.repeat(st)}${'☆'.repeat(3 - st)}　露頭 ${n}/${outcrops.length}・のこり ${Math.ceil(timeLeft())}秒</span>` : `<span>${why}</span>`)
      + (got > 0 ? `<span>きょうのごほうび +${got}pt</span>` : ok && got === null && G && G.dankyuReward ? '<span>きょうのごほうびは、もうもらいました（あしたまた）</span>' : '')
      + `<span class="jump-btns"><button type="button" class="btn" data-dk="again">もういちど</button>${ok && lv < LEVELS.length - 1 ? '<button type="button" class="btn" data-dk="next">つぎの段丘</button>' : ''}<button type="button" class="btn" data-dk="close">もどる</button></span>`;
    res.hidden = false;
    if (G && G.track) G.track(ok ? 'dankyu_clear' : 'dankyu_fail', { level: lv + 1, stars: st, outcrops: n, left: Math.ceil(timeLeft()) });
  }

  /* ---------- 音（BGM の設定がオフなら鳴らさない） ---------- */
  let ac = null;
  function sound(kind) {
    try { if (localStorage.getItem('nsg_bgm') === 'false') return; } catch (e) { /* 保存できない環境でも鳴らす */ }
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      const P = { jump: ['square', 330, 520, 0.08], find: ['triangle', 660, 990, 0.2], hit: ['sawtooth', 160, 80, 0.15], clear: ['triangle', 520, 880, 0.4], fail: ['triangle', 300, 150, 0.4] }[kind];
      o.type = P[0]; o.frequency.setValueAtTime(P[1], t); o.frequency.linearRampToValueAtTime(P[2], t + P[3]);
      g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + P[3]);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + P[3] + 0.02);
    } catch (e) { /* 音が出せなくても遊べる */ }
  }

  /* ---------- 描く ---------- */
  const STRATA = ['#b89b6a', '#a8875a', '#c8ad7a', '#9a7a52', '#bfa070'];   // 崖の地層の帯（色だけ。中身の種類は描き分けない）
  function draw(now) {
    const cy = Math.round(camY), c = ctx;
    c.fillStyle = '#9fd3ff'; c.fillRect(0, 0, W, H);   // 空
    const levee = L.rows - 5, top = 3;
    // 段丘崖（台地の下から自然堤防の上まで）：地層の帯
    for (let r = top + 1; r < levee; r++) {
      const Y = r * T - cy;
      if (Y < -T || Y > H) continue;
      for (let k = 0; k < 4; k++) { c.fillStyle = STRATA[(r * 4 + k) % STRATA.length]; c.fillRect(0, Y + k * 4, W, 4); }
    }
    // 崖の中の土の手ざわり
    c.fillStyle = 'rgba(80,60,40,0.25)';
    for (let i = 0; i < 60; i++) { const X = (i * 53) % W, Y = ((i * 97) % ((levee - top) * T)) + (top + 1) * T - cy; if (Y > 0 && Y < H) c.fillRect(X, Y, 2, 1); }
    // 台地の上（空と、台地の家並み・畑）
    const tY = top * T - cy;
    if (tY > -T * 4) {
      c.fillStyle = '#6aa84a'; c.fillRect(0, tY - 2, W, 2);
      for (let i = 0; i < 4; i++) { const X = 12 + i * 46; c.fillStyle = '#f1e6c8'; c.fillRect(X, tY - 14, 16, 12); c.fillStyle = '#59606a'; c.fillRect(X - 2, tY - 18, 20, 5); }
      c.fillStyle = '#8a6a3e'; c.fillRect(W - 22, tY - 30, 2, 30); c.fillStyle = '#d23a2e'; c.fillRect(W - 20, tY - 30, 12, 8);   // ゴールの旗
    }
    // 自然堤防の上の家（集落）と、下の田んぼ
    const lY = levee * T - cy;
    if (lY < H + T) {
      c.fillStyle = '#c8b48a'; c.fillRect(0, lY, W, (L.rows - 1 - levee) * T);
      for (const X of [8, 40, 128, 160]) { c.fillStyle = '#f1e6c8'; c.fillRect(X, lY - 12, 14, 12); c.fillStyle = '#59606a'; c.fillRect(X - 2, lY - 16, 18, 5); }
    }
    const pY = (L.rows - 1) * T - cy;
    if (pY < H) { c.fillStyle = '#d8c060'; c.fillRect(0, pY, W, T); for (let x = 2; x < W; x += 6) { c.fillStyle = '#b89a3a'; c.fillRect(x, pY + 2, 1, 6); } }
    // でっぱり
    for (const p of plats) {
      const Y = p.y * T - cy;
      if (Y < -T || Y > H) continue;
      if (p.kind === 'paddy') continue;
      for (let i = 0; i < p.w; i++) {
        const X = (p.x + i) * T;
        if (art.spr.groundTop) c.drawImage(art.spr.groundTop, X, Y);
        else { c.fillStyle = '#6aa84a'; c.fillRect(X, Y, T, 4); c.fillStyle = '#8a6a3e'; c.fillRect(X, Y + 4, T, 6); }
      }
    }
    // 露頭（碧海層が見える所）：白っぽい地層の帯のかたまり。見つけたら ★
    for (const o of outcrops) {
      const Y = Math.round(o.y - cy);
      if (Y < -T || Y > H) continue;
      c.fillStyle = o.got ? '#e8e2d2' : '#f4f0e0'; c.fillRect(o.x, Y + 2, 16, 12);
      for (let k = 0; k < 3; k++) { c.fillStyle = ['#c8a870', '#a88a5a', '#d8c090'][k]; c.fillRect(o.x + 1, Y + 4 + k * 3, 14, 2); }
      if (!o.got && Math.floor(now / 300) % 2) { c.fillStyle = '#fff'; c.fillRect(o.x + 7, Y - 2, 2, 2); }
      if (o.got) { c.fillStyle = '#f2c230'; c.fillRect(o.x + 6, Y - 4, 4, 4); }
    }
    // 小石
    for (const r of rocks) { const Y = Math.round(r.y - cy); c.fillStyle = '#7a7268'; c.fillRect(Math.round(r.x), Y, 6, 6); c.fillStyle = '#a8a094'; c.fillRect(Math.round(r.x) + 1, Y + 1, 2, 2); }
    // 主人公（あたったあとは点めつ）
    if (!(hurtT > 0 && Math.floor(hurtT / 4) % 2)) {
      const k = !pl.ground ? 'jump' : Math.abs(pl.vx) > 0.3 ? (Math.floor(frames / 6) % 2 ? 'run1' : 'run2') : 'stand';
      const spr = art.spr[k + (pl.face < 0 ? 'L' : '')];
      const X = Math.round(pl.x) - 3, Y = Math.round(pl.y - cy) - 1;
      if (spr) c.drawImage(spr, X, Y);
      else { c.fillStyle = '#3f7fbf'; c.fillRect(X + 3, Y + 2, 10, 14); }
    }
    // 高さのめもり（右はし）
    const prog = 1 - (pl.y / T - top) / (L.rows - 2 - top);
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(W - 5, 10, 3, H - 20);
    c.fillStyle = '#f2c230'; c.fillRect(W - 5, 10 + (H - 20) * (1 - Math.max(0, Math.min(1, prog))), 3, 3);
    hud('name', `${lv + 1}. ${L.name}`, false);
    hud('time', `のこり ${Math.ceil(timeLeft())}秒`, timeLeft() < 10);
    hud('heart', '♥'.repeat(Math.max(0, hearts)) + '♡'.repeat(Math.max(0, 3 - hearts)), hearts <= 1);
    hud('find', `露頭 ${outcrops.filter(o => o.got).length}/${outcrops.length}`, false);
    hud('msg', msg && now - msgT < 5200 ? msg : '', false);
  }
  function hud(k, text, warn) {
    const el = root.querySelector(`[data-h="${k}"]`);
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('warn', warn);
  }
  function loop(t) {
    if (!running) return;
    acc += Math.min(100, t - last); last = t;
    let n = 0;
    while (acc >= 1000 / 60 && n < 6) { step(); acc -= 1000 / 60; n++; }
    if (n === 6) acc = 0;
    draw(t);
    raf = requestAnimationFrame(loop);
  }
  function fit() {
    const box = root.querySelector('.jump-stage');
    const fitS = Math.min(box.clientWidth / W, (box.clientHeight || 9999) / H);
    scale = fitS >= 2 ? Math.floor(fitS) : fitS;
    cv.style.width = W * scale + 'px'; cv.style.height = H * scale + 'px';
  }

  /* ---------- 画面 ---------- */
  function buildUi() {
    root = document.createElement('div');
    root.className = 'jump harvest dankyu'; root.id = 'dankyu'; root.hidden = true;
    root.innerHTML = `<div class="jump-top"><b>段丘をのぼる <small data-h="name"></small></b><button type="button" class="btn mini" data-dk="close" aria-label="とじる">とじる</button></div>
      <div class="harvest-hud"><span data-h="time"></span><span data-h="heart"></span><span data-h="find"></span></div>
      <div class="jump-stage"><canvas width="${W}" height="${H}" aria-label="ミニゲーム 段丘をのぼる"></canvas><div class="jump-result" hidden></div></div>
      <p class="harvest-msg" data-h="msg"></p>
      <p class="jump-help">◀ ▶ で歩いて「ジャンプ」。でっぱりを上って、台地の旗へ。白い地層の「露頭」にさわるとまめちしき。落ちてくる小石に気をつけて</p>
      <div class="jump-pad"><button type="button" data-key="left" aria-label="左へ">◀</button><button type="button" data-key="right" aria-label="右へ">▶</button><button type="button" class="jump-a" data-key="jump" aria-label="ジャンプ">ジャンプ</button></div>`;
    document.body.appendChild(root);
    cv = root.querySelector('canvas'); ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-dk]');
      if (!b) return;
      const a = b.dataset.dk;
      if (a === 'close') close();
      else if (a === 'again') reset(lv);
      else if (a === 'next') reset(Math.min(LEVELS.length - 1, lv + 1));
    });
    root.querySelectorAll('[data-key]').forEach(b => {
      const k = b.dataset.key;
      b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture && b.setPointerCapture(e.pointerId); keys[k] = true; b.classList.add('on'); });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => { keys[k] = false; b.classList.remove('on'); });
      b.addEventListener('contextmenu', e => e.preventDefault());
    });
    window.addEventListener('keydown', e => { if (!running) return; const k = KEYMAP[e.key]; if (k) { keys[k] = true; e.preventDefault(); } if (e.key === 'Escape') close(); });
    window.addEventListener('keyup', e => { const k = KEYMAP[e.key]; if (k && keys) keys[k] = false; });
    window.addEventListener('resize', () => { if (running) fit(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && running && keys) { keys.left = keys.right = keys.jump = false; } });
  }
  function open() {
    if (!root) buildUi();
    loadArt();
    reset(0);
    root.hidden = false; document.body.classList.add('jump-open');
    fit();
    running = true; last = performance.now(); acc = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    const G = window.nishioGo; if (G && G.track) G.track('dankyu_open', {});
  }
  function close() {
    running = false; cancelAnimationFrame(raf);
    if (root) root.hidden = true;
    document.body.classList.remove('jump-open');
  }
  // テスト用：ボタンを押す・ようすを見る・でっぱりの上へ移す
  window.NISHIO_DANKYU = {
    open, close, reset, press(k, on) { if (keys) keys[k] = on; },
    warp(px, py) { if (pl) { pl.x = px; pl.y = py; pl.vy = 0; } },
    get info() { return pl ? { level: lv, rows: L.rows, x: pl.x, y: pl.y, ground: pl.ground, hearts, time: timeLeft(), outcrops: outcrops.map(o => ({ x: o.x, y: o.y, got: o.got })), plats: plats.map(p => ({ ...p })), done, zone } : null; },
    LEVELS,
  };
})();
