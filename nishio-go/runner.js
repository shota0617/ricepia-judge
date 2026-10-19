// にしおさんぽGO：ミニゲーム「にしおジャンプ」（横スクロールのドット絵アクション）
// ・名所（注目スポット）でチェックインした日にあそべる（game.js の openJump）
// ・主人公を左右に動かしてジャンプ。コインを集め、米俵のブロックを下からたたくとコインが出る。カラスは上からふむと逃げていく
// ・石灯籠や茶畑の段をこえ、穴に落ちないように、ゴールの西尾城の旗をめざす。3回まで やりなおせる（落ちたりカラスにぶつかったりすると、まん中の旗から）
// ・操作：画面の ◀ ▶ と「ジャンプ」（長く押すと高く跳ぶ）、キーボードは ← → / A D と スペース・↑・Z
// ・絵は 16×16 のマスを、画面の幅に合わせて整数倍で大きくする（にじまない）。ごほうびは game.js の jumpReward（1日1回）
(() => {
  'use strict';
  const W = 192, H = 144, T = 16;   // 画面（12×9マス。スマホのたて画面で2倍）とマスの大きさ

  /* ---------- 絵（文字1つが1点。'.' はすきま） ---------- */
  const PAL = {
    Y: '#f2c230', y: '#c89a18', S: '#f4c9a0', E: '#2a2a2a', B: '#3f7fbf', b: '#2d5f9a', P: '#2d3a55', K: '#7a4a2a', W: '#ffffff',
    k: '#1e1e24', g: '#3a3a44', O: '#f0a020', R: '#e04a3a', C: '#f2b81f', c: '#ffe07a', d: '#a8780e',
  };
  const HERO = {
    stand: ['.....YYYYY......', '....YYYYYYY.....', '...YYYYYYYYY....', '...YYSSSSSYY....', '...YSSSSESSY....', '...YSSSSSSS.....', '....SSSSSS......',
      '....BBBBBB......', '...SBBBBBBS.....', '...SBBBBBBS.....', '....bBBBBb......', '....PPPPPP......', '....PP..PP......', '....PP..PP......', '...KKK..KKK.....', '................'],
    run1: ['.....YYYYY......', '....YYYYYYY.....', '...YYYYYYYYY....', '...YYSSSSSYY....', '...YSSSSESSY....', '...YSSSSSSS.....', '....SSSSSS......',
      '....BBBBBBS.....', '..SBBBBBBBB.....', '....BBBBBB......', '....bBBBBb......', '....PPPPPP......', '...PPP..PPP.....', '..PPP....PP.....', '..KK.....KKK....', '................'],
    run2: ['.....YYYYY......', '....YYYYYYY.....', '...YYYYYYYYY....', '...YYSSSSSYY....', '...YSSSSESSY....', '...YSSSSSSS.....', '....SSSSSS......',
      '...SBBBBBB......', '....BBBBBBBS....', '....BBBBBB......', '....bBBBBb......', '....PPPPPP......', '.....PPPP.......', '.....PPPP.......', '....KKKK........', '................'],
    jump: ['.....YYYYY...S..', '....YYYYYYY..S..', '...YYYYYYYYY.B..', '...YYSSSSSYY.B..', '...YSSSSESSYBB..', '...YSSSSSSS.B...', '....SSSSSSBB....',
      '....BBBBBBB.....', '..SBBBBBBB......', '..S.BBBBBB......', '....bBBBBb......', '....PPPPPP......', '...PPP..PPP.....', '..KK......PP....', '..........KK....', '................'],
  };
  const CROW = [
    ['................', '.......kkkk.....', '......kkkkkk....', '.....kkWkkkkOO..', '.....kkkkkkkOO..', '..kkkkkkkkkk....', '.kkgggkkkkkk....', 'kkggggggkkkk....',
      '.kkkkkkkkkk.....', '...kkkkkkk......', '.....O..O.......', '....OO..OO......'],
    ['................', '.......kkkk.....', '......kkkkkk....', '.....kkWkkkkOO..', '.....kkkkkkkOO..', '....kkkkkkkk....', '..kkkkkkkkkk....', '.kkggggkkkkk....',
      'kkgggggkkkk.....', '...kkkkkkk......', '......O.O.......', '.....OO.OO......'],
  ];
  const COIN = ['...CCCC...', '..CccccC..', '.CccddccC.', 'CccdddDccC', 'Ccd....dcC', 'Ccd....dcC', 'CccdddDccC', '.CccddccC.', '..CccccC..', '...CCCC...'].map(r => r.replace(/D/g, 'd'));
  const sprites = {};
  function bake(rows, flip = false) {
    const h = rows.length, w = rows[0].length, cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const x = cv.getContext('2d');
    rows.forEach((row, yy) => [...row].forEach((ch, xx) => { if (PAL[ch]) { x.fillStyle = PAL[ch]; x.fillRect(flip ? w - 1 - xx : xx, yy, 1, 1); } }));
    return cv;
  }
  function bakeAll() {
    if (sprites.ok) return;
    for (const k of Object.keys(HERO)) { sprites[k] = bake(HERO[k]); sprites[k + 'L'] = bake(HERO[k], true); }
    sprites.crow = CROW.map(f => bake(f, true)); sprites.crowR = CROW.map(f => bake(f));
    sprites.coin = bake(COIN);
    sprites.ok = true;
  }

  /* ---------- ステージ（9段。文字1つが1マス） ----------
     # 地面  = 石垣のブロック  t 米俵（下からたたくとコイン）  c コイン  e カラス  L 石灯籠（2段）  m 茶畑の段（上に乗れる）  | まん中の旗  F ゴールの旗 */
  function makeLevel() {
    const rows = Array.from({ length: 9 }, () => []);
    const put = (x, y, ch) => { while (rows[y].length <= x) rows[y].push(' '); rows[y][x] = ch; };
    const len = 176;
    for (let x = 0; x < len; x++) { put(x, 7, '#'); put(x, 8, '#'); }
    for (const [a, b] of [[24, 26], [52, 54], [83, 86], [118, 120], [140, 142]]) for (let x = a; x <= b; x++) { put(x, 7, ' '); put(x, 8, ' '); }   // 穴
    const P = [   // [x, y, 文字]
      [8, 4, 't'], [9, 4, '='], [10, 4, 't'], [11, 4, '='], [12, 4, 't'], [10, 1, 'c'], [11, 1, 'c'],
      [16, 6, 'L'], [20, 6, 'e'], [22, 6, 'c'], [23, 5, 'c'],
      [28, 5, 'm'], [29, 5, 'm'], [30, 5, 'm'], [31, 4, 'm'], [32, 4, 'm'], [33, 4, 'm'], [31, 3, 'c'], [32, 3, 'c'], [33, 3, 'c'],
      [38, 6, 'e'], [42, 4, 't'], [43, 4, 't'], [44, 4, 't'], [46, 6, 'L'], [49, 6, 'e'],
      [56, 4, '='], [57, 4, '='], [58, 4, '='], [59, 4, '='], [57, 2, 'c'], [58, 2, 'c'], [62, 6, 'e'], [64, 6, 'e'],
      [68, 6, '|'],
      [72, 6, '='], [73, 6, '='], [73, 5, '='], [74, 6, '='], [74, 5, '='], [74, 4, '='], [75, 6, '='], [75, 5, '='], [75, 4, '='], [75, 3, '='], [76, 2, 'c'], [77, 2, 'c'],
      [80, 6, 'e'], [88, 4, 'm'], [89, 4, 'm'], [90, 4, 'm'], [92, 3, 'm'], [93, 3, 'm'], [94, 3, 'm'], [93, 2, 'c'], [96, 6, 'e'], [98, 6, 'L'],
      [102, 4, 't'], [103, 4, '='], [104, 4, 't'], [105, 4, '='], [106, 4, 't'], [104, 1, 'c'], [108, 6, 'e'], [110, 6, 'e'],
      [114, 5, 'c'], [115, 4, 'c'], [116, 4, 'c'], [117, 5, 'c'], [123, 6, 'L'], [126, 6, 'e'], [128, 4, 'm'], [129, 4, 'm'], [130, 4, 'm'], [131, 4, 'm'],
      [134, 6, 'e'], [136, 4, 't'], [137, 4, 't'],
      [146, 6, '='], [147, 6, '='], [147, 5, '='], [148, 6, '='], [148, 5, '='], [148, 4, '='], [149, 6, '='], [149, 5, '='], [149, 4, '='], [149, 3, '='],
      [150, 6, '='], [150, 5, '='], [150, 4, '='], [150, 3, '='], [151, 2, 'c'], [152, 2, 'c'], [158, 6, 'F'],
    ];
    for (const [x, y, ch] of P) put(x, y, ch);
    for (const r of rows) while (r.length < len) r.push(' ');
    return rows;
  }

  /* ---------- 状態 ---------- */
  let cv, ctx, root, raf = 0, last = 0, running = false, scale = 2;
  let map, ents, pl, camX, coins, lives, check, time, state, keys, msgT, gotCoins;
  const solid = ch => ch === '#' || ch === '=' || ch === 't' || ch === 'u' || ch === 'm' || ch === 'L' || ch === 'l';
  const tileAt = (tx, ty) => (ty < 0 || ty >= 9 || tx < 0 || tx >= map[0].length ? (ty >= 9 ? ' ' : (tx < 0 ? '#' : ' ')) : map[ty][tx]);

  function reset(full) {
    if (full) {
      map = makeLevel(); coins = 0; lives = 3; check = 2; time = 0; gotCoins = new Set();
      ents = [];
      map.forEach((row, ty) => row.forEach((ch, tx) => {
        if (ch === 'e') { ents.push({ k: 'crow', x: tx * T, y: ty * T + 4, vx: -0.4, vy: 0, w: 14, h: 12, alive: true, ox: tx * T }); row[tx] = ' '; }
        if (ch === 'L') { row[tx] = 'L'; if (ty > 0) map[ty - 1][tx] = 'l'; }
      }));
    }
    pl = { x: check * T, y: 6 * T - 4, vx: 0, vy: 0, w: 10, h: 15, onG: false, face: 1, anim: 0, inv: full ? 0 : 90 };
    camX = Math.max(0, pl.x - 72);
    state = 'play';
  }

  /* ---------- 動き ---------- */
  function collide(o, dx, dy) {   // 動かして、マスとぶつかったら戻す
    o.x += dx;
    let hit = false;
    for (const [px, py] of corners(o)) {
      const tx = Math.floor(px / T), ty = Math.floor(py / T);
      if (solid(tileAt(tx, ty))) { o.x = dx > 0 ? tx * T - o.w - 0.01 : (tx + 1) * T + 0.01; hit = true; break; }
    }
    if (hit) o.vx = o.k === 'crow' ? -o.vx : 0;
    o.y += dy;
    let bump = null;
    o.onG = false;
    for (const [px, py] of corners(o)) {
      const tx = Math.floor(px / T), ty = Math.floor(py / T);
      if (solid(tileAt(tx, ty))) {
        if (dy > 0) { o.y = ty * T - o.h - 0.01; o.onG = true; } else { o.y = (ty + 1) * T + 0.01; bump = [tx, ty]; }
        o.vy = 0;
        break;
      }
    }
    return bump;
  }
  function corners(o) { return [[o.x, o.y], [o.x + o.w, o.y], [o.x, o.y + o.h], [o.x + o.w, o.y + o.h], [o.x + o.w / 2, o.y], [o.x + o.w / 2, o.y + o.h]]; }

  function step() {
    time++;
    if (state !== 'play') { msgT--; if (msgT <= 0 && state === 'miss') reset(false); return; }
    const L = keys.left, R = keys.right, J = keys.jump;
    if (L && !R) { pl.vx = Math.max(pl.vx - 0.22, -1.9); pl.face = -1; }
    else if (R && !L) { pl.vx = Math.min(pl.vx + 0.22, 1.9); pl.face = 1; }
    else pl.vx *= pl.onG ? 0.78 : 0.95;
    if (Math.abs(pl.vx) < 0.05) pl.vx = 0;
    if (J && pl.onG && !keys.jumpHeld) { pl.vy = -5.2; pl.onG = false; sound('jump'); }
    keys.jumpHeld = J;
    pl.vy = Math.min(pl.vy + (J && pl.vy < 0 ? 0.2 : 0.42), 6);
    const bump = collide(pl, pl.vx, pl.vy);
    if (bump) hitBlock(bump[0], bump[1]);
    if (pl.x < camX) { pl.x = camX; pl.vx = 0; }
    pl.anim += Math.abs(pl.vx) * 0.15;
    if (pl.inv > 0) pl.inv--;
    // コイン
    for (const [px, py] of corners(pl)) {
      const tx = Math.floor(px / T), ty = Math.floor(py / T);
      if (tileAt(tx, ty) === 'c') { map[ty][tx] = ' '; coins++; sound('coin'); }
      if (tileAt(tx, ty) === '|' && check < tx) check = tx;
      if (tileAt(tx, ty) === 'F') { clear(); return; }
    }
    // カラス
    for (const e of ents) {
      if (e.k === 'pop') { e.y += e.vy; e.vy += 0.3; e.t--; continue; }
      if (!e.alive) { if (e.dead !== undefined) { e.dead--; e.y += 1.5; } continue; }
      if (Math.abs(e.x - pl.x) > W) continue;   // 画面の外は止めておく
      e.vy = Math.min(e.vy + 0.4, 6);
      collide(e, e.vx, e.vy);
      if (e.y > H + 20) e.alive = false;
      if (pl.x < e.x + e.w && pl.x + pl.w > e.x && pl.y < e.y + e.h && pl.y + pl.h > e.y) {
        if (pl.vy > 0 && pl.y + pl.h - e.y < 9) { e.alive = false; e.dead = 30; pl.vy = -3.6; coins++; sound('stomp'); }
        else if (pl.inv <= 0) { miss(); return; }
      }
    }
    ents = ents.filter(e => !(e.k === 'pop' && e.t <= 0));
    if (pl.y > H + 8) { miss(); return; }
    camX = Math.max(0, Math.min(pl.x - 72, map[0].length * T - W));
  }
  function hitBlock(tx, ty) {
    const ch = tileAt(tx, ty);
    if (ch === 't') { map[ty][tx] = 'u'; coins++; ents.push({ k: 'pop', x: tx * T + 3, y: ty * T - 10, vy: -3, t: 22 }); sound('coin'); }
    else sound('bump');
  }
  function miss() {
    lives--; sound('miss');
    if (lives <= 0) { state = 'over'; msgT = 0; finish(false); return; }
    state = 'miss'; msgT = 70;
  }
  function clear() { state = 'clear'; sound('clear'); finish(true); }

  /* ---------- 描く ---------- */
  function drawTile(ch, x, y) {
    const c = ctx;
    if (ch === '#') {
      const top = y === 7 * T;
      c.fillStyle = '#8a5a34'; c.fillRect(x, y, T, T);
      c.fillStyle = '#6e4628'; for (let i = 0; i < 4; i++) c.fillRect(x + ((i * 7 + x / T * 3) % 14), y + 5 + i * 3, 2, 1);
      if (top) { c.fillStyle = '#4d9a3c'; c.fillRect(x, y, T, 4); c.fillStyle = '#7cc04a'; c.fillRect(x, y, T, 1); c.fillRect(x + 3, y + 4, 2, 1); c.fillRect(x + 10, y + 4, 2, 1); }
    } else if (ch === '=') {   // 石垣
      c.fillStyle = '#9b968a'; c.fillRect(x, y, T, T); c.fillStyle = '#7a756b';
      c.fillRect(x, y + 7, T, 1); c.fillRect(x, y + 15, T, 1); c.fillRect(x + 7, y, 1, 7); c.fillRect(x + 3, y + 8, 1, 7); c.fillRect(x + 12, y + 8, 1, 7);
      c.fillStyle = '#b8b3a6'; c.fillRect(x + 1, y + 1, 5, 1); c.fillRect(x + 9, y + 1, 5, 1);
    } else if (ch === 't' || ch === 'u') {   // 米俵
      const used = ch === 'u', glow = !used && Math.floor(time / 12) % 4 === 0;
      c.fillStyle = used ? '#8a6a3e' : glow ? '#f0d890' : '#e0c070'; c.fillRect(x + 1, y + 2, T - 2, T - 4); c.fillRect(x + 2, y + 1, T - 4, T - 2);
      c.fillStyle = used ? '#5e4626' : '#a8803e'; c.fillRect(x + 4, y + 1, 2, T - 2); c.fillRect(x + 10, y + 1, 2, T - 2);
      c.fillStyle = used ? '#6e5432' : '#c8a050'; c.fillRect(x + 1, y + 7, T - 2, 2);
      if (!used) { c.fillStyle = '#fff4c8'; c.fillRect(x + 2, y + 3, 1, 3); }
    } else if (ch === 'm') {   // 茶畑の段（かまぼこ形の茶の木）
      c.fillStyle = '#3f8a34'; c.fillRect(x, y + 3, T, T - 3); c.fillRect(x + 2, y + 1, T - 4, 3);
      c.fillStyle = '#86c650'; c.fillRect(x + 2, y + 1, T - 4, 1); c.fillRect(x + 1, y + 4, 3, 1); c.fillRect(x + 9, y + 3, 3, 1);
      c.fillStyle = '#2f6a28'; c.fillRect(x, y + T - 2, T, 2);
    } else if (ch === 'L' || ch === 'l') {   // 石灯籠
      c.fillStyle = '#a8a49a';
      if (ch === 'l') { c.fillRect(x + 2, y + 6, 12, 3); c.fillRect(x + 4, y + 3, 8, 3); c.fillRect(x + 7, y + 1, 2, 2); c.fillRect(x + 4, y + 9, 8, 7); c.fillStyle = '#ffd27a'; c.fillRect(x + 6, y + 11, 4, 3); }
      else { c.fillRect(x + 6, y, 4, 12); c.fillRect(x + 3, y + 12, 10, 4); c.fillStyle = '#8a857a'; c.fillRect(x + 6, y, 1, 12); }
    } else if (ch === 'c') {
      const f = Math.floor(time / 8) % 4, w = [10, 6, 2, 6][f];
      ctx.drawImage(sprites.coin, 0, 0, 10, 10, x + 3 + (10 - w) / 2, y + 3, w, 10);
    } else if (ch === '|' || ch === 'F') {   // 旗（のぼり）
      const big = ch === 'F';
      c.fillStyle = '#6a4a30'; c.fillRect(x + 7, y - (big ? 64 : 16), 2, (big ? 64 : 16) + T);
      c.fillStyle = '#d23a2e'; c.fillRect(x + 9, y - (big ? 62 : 14), big ? 10 : 7, big ? 30 : 10);
      c.fillStyle = '#f4f1e8'; c.fillRect(x + 11, y - (big ? 58 : 12), big ? 6 : 3, big ? 22 : 6);
      if (big) drawCastle(x + 28, y + T);
    }
  }
  function drawCastle(x, by) {   // ゴールの西尾城（白い壁に灰色の屋根）
    const c = ctx;
    c.fillStyle = '#9b968a'; c.fillRect(x - 4, by - 18, 64, 18);
    c.fillStyle = '#7a756b'; for (let i = 0; i < 64; i += 8) c.fillRect(x - 4 + i, by - 18, 1, 18);
    c.fillStyle = '#f3f1ea'; c.fillRect(x + 4, by - 40, 48, 22); c.fillRect(x + 14, by - 62, 28, 16);
    c.fillStyle = '#62666e'; c.fillRect(x, by - 46, 56, 6); c.fillRect(x + 4, by - 50, 48, 4); c.fillRect(x + 10, by - 66, 36, 5); c.fillRect(x + 16, by - 70, 24, 4);
    c.fillStyle = '#3a3230'; c.fillRect(x + 12, by - 34, 6, 5); c.fillRect(x + 38, by - 34, 6, 5); c.fillRect(x + 25, by - 57, 6, 5);
    c.fillStyle = '#c8a040'; c.fillRect(x + 15, by - 72, 2, 2); c.fillRect(x + 39, by - 72, 2, 2);
  }
  function drawBg() {
    const c = ctx, g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#5fb0ea'); g.addColorStop(1, '#c4e6f8'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) { const x = ((i * 97 - camX * 0.15) % (W + 60) + W + 60) % (W + 60) - 30, y = 12 + (i % 3) * 10; c.fillRect(x, y, 22, 5); c.fillRect(x + 5, y - 3, 12, 3); }
    c.fillStyle = '#7aa88a';   // 遠くの山（三ヶ根山の山なみ）
    for (let x = 0; x < W; x++) { const wx = x + camX * 0.3, h = 26 + Math.sin(wx / 40) * 9 + Math.sin(wx / 17) * 4; c.fillRect(x, 86 - h, 1, h + 30); }
    c.fillStyle = '#4f9e3a';   // 田んぼと茶畑
    for (let x = 0; x < W; x++) { const wx = x + camX * 0.55, h = 12 + Math.sin(wx / 23) * 3; c.fillRect(x, 104 - h, 1, h + 20); }
    c.fillStyle = '#3f8a34'; for (let y = 96; y < 112; y += 4) c.fillRect(0, y, W, 1);
  }
  function draw() {
    const c = ctx;
    drawBg();
    const x0 = Math.floor(camX / T), x1 = Math.ceil((camX + W) / T) + 4;
    c.save(); c.translate(-Math.round(camX), 0);
    for (let ty = 0; ty < 9; ty++) for (let tx = x0 - 4; tx <= x1; tx++) { const ch = tileAt(tx, ty); if (ch !== ' ' && ch !== 'e') drawTile(ch, tx * T, ty * T); }
    for (const e of ents) {
      if (e.k === 'pop') { c.drawImage(sprites.coin, Math.round(e.x), Math.round(e.y)); continue; }
      if (!e.alive && !(e.dead > 0)) continue;
      const fr = (e.vx < 0 ? sprites.crow : sprites.crowR)[Math.floor(time / 10) % 2];
      if (e.dead > 0) { c.save(); c.translate(Math.round(e.x) + 8, Math.round(e.y) + 6); c.scale(1, -1); c.drawImage(fr, -8, -6); c.restore(); }
      else c.drawImage(fr, Math.round(e.x) - 1, Math.round(e.y));
    }
    if (!(pl.inv > 0 && Math.floor(time / 4) % 2) && state !== 'over') {
      const k = !pl.onG ? 'jump' : Math.abs(pl.vx) > 0.2 ? (Math.floor(pl.anim) % 2 ? 'run1' : 'run2') : 'stand';
      c.drawImage(sprites[k + (pl.face < 0 ? 'L' : '')], Math.round(pl.x) - 3, Math.round(pl.y) - 1);
    }
    c.restore();
    // 上の札：コインと、のこり
    c.drawImage(sprites.coin, 6, 5); c.fillStyle = '#fff'; c.font = 'bold 9px sans-serif'; c.textBaseline = 'top';
    text(`×${coins}`, 19, 6); for (let i = 0; i < lives; i++) c.drawImage(sprites.stand, 0, 0, 16, 8, W - 20 - i * 14, 4, 16, 8);
    if (state === 'miss') banner('もういちど！');
    if (state === 'clear') banner('ゴール！ 西尾城に とうちゃく');
    if (state === 'over') banner('ざんねん…');
  }
  function text(s, x, y) { ctx.fillStyle = '#1e1e24'; ctx.fillText(s, x + 1, y + 1); ctx.fillStyle = '#fff'; ctx.fillText(s, x, y); }
  function banner(s) {
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 54, W, 26);
    ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; text(s, W / 2, 62); ctx.textAlign = 'left'; ctx.font = 'bold 9px sans-serif';
  }

  /* ---------- 音（短いピコピコ音。せってい の「音」がオフなら鳴らさない） ---------- */
  let ac = null;
  const SFX = { jump: [440, 700, 0.12], coin: [988, 1480, 0.1], stomp: [260, 120, 0.12], bump: [150, 110, 0.08], miss: [420, 90, 0.5], clear: [523, 1047, 0.7] };
  function sound(k) {
    let on = true;
    try { const v = localStorage.getItem('nsg_bgm'); on = v == null ? true : JSON.parse(v); } catch (e) { /* noop */ }
    const f = SFX[k];
    if (!on || !f) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime;
      o.type = 'square'; o.frequency.setValueAtTime(f[0], t0); o.frequency.exponentialRampToValueAtTime(f[1], t0 + f[2]);
      g.gain.setValueAtTime(0.06, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + f[2]);
      o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + f[2] + 0.02);
    } catch (e) { /* noop */ }
  }

  /* ---------- 画面とループ ---------- */
  let acc = 0;
  function loop(t) {   // 画面の描きかえの回数（60〜144回/秒）にかかわらず、1秒に60回ずつ動かす
    if (!running) return;
    acc += Math.min(100, t - last); last = t;
    let n = 0;
    while (acc >= 1000 / 60 && n < 6) { step(); acc -= 1000 / 60; n++; }
    if (n === 6) acc = 0;
    draw();
    raf = requestAnimationFrame(loop);
  }
  function fit() {
    const box = root.querySelector('.jump-stage');
    const fitS = Math.min(box.clientWidth / W, (box.clientHeight || 9999) / H);
    scale = fitS >= 2 ? Math.floor(fitS) : fitS;   // 2倍以上なら整数倍（にじまない）。それより せまい画面は、幅いっぱいに
    cv.style.width = W * scale + 'px'; cv.style.height = H * scale + 'px';
  }
  function finish(cleared) {
    const G = window.nishioGo, got = G && G.jumpReward ? G.jumpReward(coins, cleared) : null;
    const res = root.querySelector('.jump-result');
    res.innerHTML = `<b>${cleared ? 'クリア！' : 'ゲームオーバー'}</b><span>コイン ${coins}まい</span>`
      + (got > 0 ? `<span>きょうのごほうび +${got}pt</span>` : got === 0 ? '' : '<span>きょうのごほうびは、もうもらいました（あしたまた）</span>')
      + '<span class="jump-btns"><button type="button" class="btn" data-jump="again">もういちど</button><button type="button" class="btn" data-jump="close">もどる</button></span>';
    res.hidden = false;
    if (G && G.track) G.track(cleared ? 'jump_clear' : 'jump_over', { coins });
  }

  function build() {
    root = document.createElement('div');
    root.className = 'jump'; root.id = 'jump'; root.hidden = true;
    root.innerHTML = `<div class="jump-top"><b>にしおジャンプ</b><button type="button" class="btn mini" data-jump="close" aria-label="とじる">とじる</button></div>
      <div class="jump-stage"><canvas width="${W}" height="${H}" aria-label="ミニゲーム にしおジャンプ"></canvas><div class="jump-result" hidden></div></div>
      <p class="jump-help">◀ ▶ で歩いて「ジャンプ」。米俵を下からたたくとコイン、カラスは上からふむ。西尾城の旗がゴール</p>
      <div class="jump-pad"><button type="button" data-key="left" aria-label="左へ">◀</button><button type="button" data-key="right" aria-label="右へ">▶</button><button type="button" class="jump-a" data-key="jump" aria-label="ジャンプ">ジャンプ</button></div>`;
    document.body.appendChild(root);
    cv = root.querySelector('canvas'); ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-jump]');
      if (!b) return;
      if (b.dataset.jump === 'close') close();
      else if (b.dataset.jump === 'again') { root.querySelector('.jump-result').hidden = true; reset(true); }
    });
    const press = (k, on) => { keys[k] = on; };
    root.querySelectorAll('[data-key]').forEach(b => {
      const k = b.dataset.key;
      b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture && b.setPointerCapture(e.pointerId); press(k, true); b.classList.add('on'); });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => { press(k, false); b.classList.remove('on'); });
      b.addEventListener('contextmenu', e => e.preventDefault());
    });
    window.addEventListener('keydown', e => { if (!running) return; const k = KEYMAP[e.key]; if (k) { keys[k] = true; e.preventDefault(); } if (e.key === 'Escape') close(); });
    window.addEventListener('keyup', e => { const k = KEYMAP[e.key]; if (k) keys[k] = false; });
    window.addEventListener('resize', () => { if (running) fit(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && running) { keys = { left: false, right: false, jump: false }; } });
  }
  const KEYMAP = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ' ': 'jump', ArrowUp: 'jump', z: 'jump', Z: 'jump', w: 'jump', W: 'jump' };

  function open() {
    if (!root) build();
    bakeAll();
    keys = { left: false, right: false, jump: false };
    reset(true);
    root.hidden = false; document.body.classList.add('jump-open');
    root.querySelector('.jump-result').hidden = true;
    fit();
    running = true; last = performance.now(); acc = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    const G = window.nishioGo; if (G && G.track) G.track('jump_open', {});
  }
  function close() {
    running = false; cancelAnimationFrame(raf);
    if (root) root.hidden = true;
    document.body.classList.remove('jump-open');
  }
  // テスト用：ボタンを押す・状態を見る
  window.NISHIO_JUMP = { open, close, press(k, on) { if (keys) keys[k] = on; }, warp(tx) { if (pl) { pl.x = tx * T; pl.y = 4 * T; pl.vy = 0; camX = Math.max(0, pl.x - 72); } }, get info() { return pl ? { x: pl.x, y: pl.y, coins, lives, state, check } : null; } };
})();
