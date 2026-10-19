// にしおさんぽGO：西尾ドット絵帳（西尾ならではのドット絵 74000枚）
// ・西尾市の中で、たからばこを開けたり、スポットにチェックインしたりすると1枚もらえる
// ・絵は37の題材 × 季節と時間帯16 × 置き方・小物25 × 天気5 ＝ 74000枚。どれも 48×48 の1枚の景色で、題材ごとの描き方に組み合わせて描く
//   絵は Blender で立体を作って焼いたもの（tools/blender/dots3d.py → nishio-go/dots3d/ のシート）。下の描き方は、シートが読めないあいだの代わり
//   天気：晴れ・くもり・雨・霧・（冬は雪／夜は満月／ほかは虹）。もらうときの天気は気象庁の実際の天気（weather.js）で決まり、朝は霧のことも、晴れの日はたまに虹や満月
//   番号：No.1〜10000 は はじめの25題材の晴れ（前からある絵。番号は変えない。西尾ならではか確かめて、5題材は絵と名前を入れかえた：docs/dots-nishio.md）、10001〜50000 は同じ25題材の くもり・雨・霧・雪/虹/満月、
//   50001〜74000 はあとから足した12題材（八ツ面山・西尾城の鍮石門・旧近衛邸の茶室・岩瀬文庫の古い本・カーネーションの温室・稲荷山茶園・一色の海苔ひび・吉良温泉と三河湾・華蔵寺の山門・一色の干潟の水鳥・金蓮寺弥陀堂・三河万歳）の5つの天気
//   題材：抹茶（実相寺＝西尾茶のはじまり・覆いをかけたてん茶の茶畑・抹茶と和菓子・石臼・稲荷山茶園）、てんてこ祭、一色のうなぎ（養殖池と水車・うな重・炭火のかば焼き）、
//   えびせんべい、三河湾のあさり、一色さかな広場、佐久島への船、佐久島の黒壁の家並み、幡豆の海と沖の島、西尾城の丑寅櫓、城下町の町家、名鉄の電車、吉良の赤馬、
//   黄金堤、饗庭塩の塩田、西尾祇園祭、鳥羽の火祭り、三河一色の大提灯、三ヶ根山のあじさい、西尾の田んぼ
// ・どの題材が出るかは、その場所の地区（西尾・一色・吉良・幡豆・佐久島。注目スポットはその地区、ほかは いちばん近い注目スポットの地区）と土地利用（田・畑・建物・海辺・森など）で決まる。
//   季節と時間帯は、もらったときの本当の季節と時間（行事とあじさいは、その時期の景色で、色や人の数がかわる）。置き方は場所と日にちで決まる
//   → 全部集めるには、いろいろな地区を、いろいろな季節と時間に歩くことになる
// ・絵だけで、事実の説明はつけない（名物の説明は meibutsu.js のまちメモ）。行事の時期：西尾祇園祭は7月、鳥羽の火祭りは2月、大提灯まつりは8月、三ヶ根山のあじさいは6月ごろ
// pixel.js のあと（nishioPixel.art の tileRoof などを使う）、share.js の前に読み込む
(() => {
  'use strict';
  const P = window.nishioPixel, G = window.nishioGo;
  if (!P || !G) return;
  const { tileRoof } = P.art;
  const PER = 400, NCOMP = 25;

  /* ---------- 色 ---------- */
  const rgb = c => { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const hex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (c, d, f) => { const a = rgb(c), b = rgb(d); return hex(a.map((v, i) => v + (b[i] - v) * f)); };
  const dark = (c, f) => hex(rgb(c).map(v => v * f));
  // 時間帯の色あい（朝は少しあたたかく、夕方はだいだい、夜は暗く青く）。'!' で始まる色（あかり・火）はそのまま
  const TONE = [c => mix(c, '#ffd9a8', 0.12), c => c, c => mix(hex(rgb(c).map((v, i) => v * [1, 0.82, 0.7][i])), '#ff9a50', 0.1), c => hex(rgb(c).map((v, i) => v * [0.32, 0.36, 0.55][i]))];
  const SEASON = ['春', '夏', '秋', '冬'], TIME = ['朝', '昼', '夕方', '夜'];
  const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rndOf = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  /* ---------- 共通の部品（r(x, y, w, h, 色)・h(y, x0, x1, 色)） ---------- */
  const SKY = [['#9fd0f0', '#cfe6f2', '#f8d8b0'], ['#5fb0ea', '#8cc8f0', '#c4e6f8'], ['#4a3e7e', '#c86a6a', '#f6b46a'], ['#0a1230', '#16224a', '#26386a']];
  const SKY_TINT = ['#f4e4ec', '#2a7ad8', '#e8d8a8', '#e8eef4'];
  // 天気（k.wk）：'' 晴れ・cloudy くもり・rain 雨・mist 霧・snow 雪・rainbow 虹・moon 満月。晴れのときは前からの絵とまったく同じに描く
  const WX_SKY = { cloudy: ['#9aa2aa', '#2a3040', 0.55], rain: ['#6e7680', '#1e2430', 0.7], mist: ['#dfe4e6', '#4a5260', 0.6], snow: ['#c8ccd2', '#3a4250', 0.5] };
  const wxStops = (st, k) => { const w = WX_SKY[k.wk]; return w ? st.map(c => mix(c, k.t === 3 ? w[1] : w[0], w[2])) : st; };
  function rainbow(r, cx, cy, rad) {   // 空の虹（外から赤・だいだい・黄・緑・青・むらさき）
    ['#e8504a', '#f09a3a', '#f2d24a', '#6ac05a', '#4a8ad8', '#8a5ac8'].forEach((c, i) => { const rr = rad - i; for (let a = 0; a <= 180; a += 3) { const t = a * Math.PI / 180; r(Math.round(cx + Math.cos(t) * rr), Math.round(cy - Math.sin(t) * rr * 0.7), 1, 1, '!' + mix(c, '#ffffff', 0.15)); } });
  }
  function sky(r, h, k, hz, o = {}) {
    if (k.wk) return wxSky(r, h, k, hz, o);
    const st = SKY[k.t].map(c => mix(c, SKY_TINT[k.s], 0.12));   // 季節で空の色を少しかえる（春はかすみ、夏は濃い青、秋はすんだ色、冬はうすい色）
    for (let y = 0; y < hz; y++) { const f = hz > 1 ? y / (hz - 1) : 1, c = f < 0.5 ? mix(st[0], st[1], f * 2) : mix(st[1], st[2], (f - 0.5) * 2); h(y, 0, 47, '!' + c); }
    const sx = 6 + k.a * 8 + (k.b % 2) * 3;
    if (k.t === 3) {
      for (let i = 0; i < 9 + k.b; i++) { const x = Math.floor(k.R() * 48), y = Math.floor(k.R() * Math.max(1, hz - 2)); r(x, y, 1, 1, '!#e8ecff'); }
      if (!o.noSun) { r(sx, 3, 4, 4, '!#f4eecc'); r(sx + 2, 3, 2, 2, '!' + st[0]); }
    } else if (!o.noSun) {
      const sy = k.t === 1 ? 3 : Math.max(2, hz - 7), col = k.t === 2 ? '#ffd27a' : k.t === 0 ? '#fff0c0' : '#fffbe8';
      r(sx, sy, 4, 4, '!' + col); r(sx - 1, sy + 1, 6, 2, '!' + col); r(sx + 1, sy - 1, 2, 6, '!' + col);
    }
    if (k.t < 3 && !o.noCloud) for (let i = 0; i < 1 + (k.b % 3); i++) { const x = Math.floor(k.R() * 40), y = 2 + Math.floor(k.R() * Math.max(1, hz - 8)); r(x, y, 7, 2, '#ffffff'); r(x + 2, y - 1, 3, 1, '#ffffff'); }
  }
  function wxSky(r, h, k, hz, o) {   // 晴れ以外の空
    const st = wxStops(SKY[k.t].map(c => mix(c, SKY_TINT[k.s], 0.12)), k), R = k.W;
    for (let y = 0; y < hz; y++) { const f = hz > 1 ? y / (hz - 1) : 1, c = f < 0.5 ? mix(st[0], st[1], f * 2) : mix(st[1], st[2], (f - 0.5) * 2); h(y, 0, 47, '!' + c); }
    const sx = 6 + k.a * 8 + (k.b % 2) * 3;
    if (k.wk === 'cloudy' || k.wk === 'rain' || k.wk === 'snow') {   // 雲が空をおおう
      const cc = k.t === 3 ? '#2e3444' : k.wk === 'rain' ? '#5a626c' : '#b4bac0';
      for (let i = 0; i < 5 + k.b; i++) { const x = Math.floor(R() * 44) - 4, y = Math.floor(R() * Math.max(1, hz - 3)); r(x, y, 10 + (i % 3) * 3, 3, '!' + cc); r(x + 2, y - 1, 6, 1, '!' + cc); }
    } else if (k.wk === 'mist') {
      for (let y = Math.max(0, hz - 8); y < hz; y += 2) h(y, 0, 47, '!' + mix(st[2], '#ffffff', 0.35));
    } else if (k.wk === 'rainbow') {
      if (!o.noSun) { r(sx, 3, 4, 4, '!#fffbe8'); }
      rainbow(r, 24 + (k.a - 2) * 3, hz + 2, 18 + (k.b % 3) * 2);
      for (let i = 0; i < 2; i++) { const x = Math.floor(R() * 40), y = 2 + Math.floor(R() * Math.max(1, hz - 8)); r(x, y, 7, 2, '!#f4f6f8'); }
    } else if (k.wk === 'moon') {
      for (let i = 0; i < 18 + k.b * 2; i++) r(Math.floor(R() * 48), Math.floor(R() * Math.max(1, hz - 1)), 1, 1, '!#f4f6ff');
      const mx = 30 - k.a * 4; r(mx + 1, 2, 6, 8, '!#fff6d0'); r(mx, 3, 8, 6, '!#fff6d0'); r(mx + 2, 4, 2, 2, '!#e8dcb0'); r(mx + 5, 6, 1, 1, '!#e8dcb0');
    }
  }
  // 天気の色あい（晴れはそのまま）と、絵の上にかさねる雨・雪・霧
  const WX_TONE = { cloudy: c => mix(c, '#7a8088', 0.1), rain: c => mix(c, '#4a5260', 0.2), mist: c => mix(c, '#dfe4e6', 0.38), snow: c => mix(c, '#eef2f6', 0.15) };
  function wxOver(r, k, y1 = 48) {
    const R = k.W;
    if (k.wk === 'rain') for (let i = 0; i < 40 + k.b * 4; i++) { const x = Math.floor(R() * 50), y = Math.floor(R() * y1); r(x, y, 1, 1, '!#c8dcf0'); r(x - 1, y + 1, 1, 1, '!#a8c0dc'); r(x - 2, y + 2, 1, 1, '!#c8dcf0'); }
    else if (k.wk === 'snow') for (let i = 0; i < 36 + k.b * 4; i++) { const x = Math.floor(R() * 48), y = Math.floor(R() * y1); r(x, y, 1 + (i % 3 === 0), 1 + (i % 3 === 0), '!#ffffff'); }
    else if (k.wk === 'mist') for (let y = 10 + (k.a % 3) * 3; y < y1; y += 9) for (let x = (y * 7) % 11 - 6; x < 48; x += 16) r(x, y, 12, 2, '!' + (k.t === 3 ? '#4a5466' : '#eef2f4'));
  }
  const GRASS = ['#8fca5e', '#4d9a3c', '#b49a52', '#a9a48c'];
  function ground(r, h, k, hz, col = GRASS[k.s]) {
    for (let y = hz; y < 48; y++) h(y, 0, 47, col);
    for (let i = 0; i < 26; i++) r(Math.floor(k.R() * 48), hz + 1 + Math.floor(k.R() * Math.max(1, 47 - hz)), 1, 1, dark(col, 0.82));
    if (k.s === 0) for (let i = 0; i < 6; i++) r(Math.floor(k.R() * 48), hz + 2 + Math.floor(k.R() * Math.max(1, 45 - hz)), 1, 1, '#f6c8d8');
    if (k.s === 3) for (let i = 0; i < 8; i++) r(Math.floor(k.R() * 48), hz + 1 + Math.floor(k.R() * Math.max(1, 46 - hz)), 1, 1, '#e8eef0');
  }
  const LEAF = [['#f2b8cc', '#e898b2'], ['#3f8a34', '#2f6a28'], ['#d8782a', '#b84a22'], ['#7a6a5a', '#5a4a3e']];
  function tree(r, h, k, x, y, sz = 6, evergreen = false) {   // 丸い木。季節で葉の色（春は桜、冬は葉を落とした枝）。evergreen は松などで一年中みどり
    const [l, d] = evergreen ? ['#3f7a3a', '#2a5a2a'] : LEAF[k.s];
    r(x + (sz >> 1) - 1, y + sz - 1, 2, sz, '#6a4a30');
    if (!evergreen && k.s === 3) { r(x + 1, y + 2, sz - 2, 1, d); r(x + 2, y, 1, sz - 1, d); r(x + sz - 3, y + 1, 1, sz - 2, d); return; }
    r(x + 1, y, sz - 2, sz, l); r(x, y + 1, sz, sz - 2, l); r(x + 1, y + sz - 2, sz - 2, 2, d); r(x + sz - 2, y + 1, 1, sz - 2, d);
  }
  function pine(r, k, x, y) { r(x + 2, y + 4, 1, 6, '#6a4a30'); r(x, y + 2, 6, 2, '#2f6a3a'); r(x + 1, y, 5, 2, '#3f7a3a'); r(x + 3, y + 4, 4, 2, '#2f6a3a'); }
  function person(r, x, y, shirt = '#3a6ab8', o = {}) {   // 7マスの人（帽子・顔・服・足）
    if (o.hat) r(x - 1, y, 5, 1, o.hat);
    r(x, y + (o.hat ? 1 : 0), 3, 2, o.face || '#f0c8a0'); r(x - 1, y + 2, 5, 3, shirt); r(x, y + 5, 1, 2, o.leg || '#3a3a48'); r(x + 2, y + 5, 1, 2, o.leg || '#3a3a48');
  }
  function sea(r, h, k, y0, y1, col = '#3f84b8') {
    for (let y = y0; y < y1; y++) h(y, 0, 47, mix(col, '#1f4a78', (y - y0) / Math.max(1, y1 - y0) * 0.6));
    for (let i = 0; i < 10; i++) { const x = Math.floor(k.R() * 44), y = y0 + 1 + Math.floor(k.R() * Math.max(1, y1 - y0 - 1)); r(x, y, 3 + (i % 3), 1, k.t === 3 ? '!#5a6a9a' : '#cfe6f6'); }
  }
  function hills(r, h, k, hz, col, peaks) {   // 遠くの山なみ
    for (let x = 0; x < 48; x++) { let top = hz; for (const [px, ph, pw] of peaks) top = Math.min(top, hz - Math.max(0, ph - Math.abs(x - px) * ph / pw)); for (let y = Math.round(top); y < hz; y++) r(x, y, 1, 1, col); }
  }
  function gull(r, x, y) { r(x, y, 1, 1, '#ffffff'); r(x + 1, y + 1, 1, 1, '#ffffff'); r(x + 2, y, 1, 1, '#ffffff'); }
  function roofTiles(r, h, x0, x1, y, rows, cols = ['#9aa0a8', '#6a7078', '#3a3e46', '#5a6068']) {
    const spans = []; for (let i = 0; i < rows; i++) { const k = rows - 1 - i; spans.push([x0 + k, x1 - k]); }
    tileRoof(r, h, y, spans, cols);
  }
  function windowView(r, h, k, x, y, w, hh) {   // 部屋の窓（外の空と季節の木と、天気が見える）
    r(x - 1, y - 1, w + 2, hh + 2, '#6a4a30');
    const st = k.wk ? wxStops(SKY[k.t], k) : SKY[k.t];
    for (let yy = 0; yy < hh; yy++) { const f = yy / Math.max(1, hh - 1); r(x, y + yy, w, 1, '!' + mix(st[0], st[2], f)); }
    if (k.t === 3 && (!k.wk || k.wk === 'moon' || k.wk === 'rainbow')) r(x + w - 4, y + 1, k.wk === 'moon' ? 3 : 2, k.wk === 'moon' ? 3 : 2, '!#f4eecc');
    const tc = LEAF[k.s][0];
    r(x, y + hh - 3, w, 3, tc); r(x + 2, y + hh - 5, 4, 2, tc);
    if (k.wk === 'rain') for (let i = 0; i < w * hh / 8; i++) r(x + Math.floor(k.W() * w), y + Math.floor(k.W() * (hh - 1)), 1, 2, k.t === 3 ? '!#6a7a9a' : '!#c8dcf0');
    else if (k.wk === 'snow') { for (let i = 0; i < w * hh / 7; i++) r(x + Math.floor(k.W() * w), y + Math.floor(k.W() * hh), 1, 1, '!#ffffff'); r(x, y + hh - 2, w, 2, '!#f4f6f8'); }
    else if (k.wk === 'mist') for (let yy = y + 2; yy < y + hh; yy += 3) r(x, yy, w, 1, k.t === 3 ? '!#4a5466' : '!#eef2f4');
    else if (k.wk === 'rainbow' && k.t !== 3) for (let i = 0; i < 4; i++) r(x + 1 + i, y + 2 + i, w - 2 - i * 2, 1, '!' + ['#e8504a', '#f2d24a', '#6ac05a', '#4a8ad8'][i]);
    else if (k.wk === 'cloudy') { const cc = k.t === 3 ? '!#3a4252' : '!#b4bac0'; r(x + 1, y + 2, w - 4, 2, cc); r(x + 3, y + 1, 4, 1, cc); }
    r(x + (w >> 1), y, 1, hh, '#6a4a30'); r(x, y + (hh >> 1), w, 1, '#6a4a30');
  }
  function table(r, h, y, col = '#8a5a34') { for (let yy = y + 1; yy < 48; yy++) h(yy, 0, 47, col); h(y, 0, 47, mix(col, '#ffffff', 0.25)); for (let x = 3; x < 48; x += 11) r(x, y + 3, 6, 1, dark(col, 0.85)); }

  /* ---------- 題材（draw(r, h, k)。k.s 季節・k.t 時間帯・k.a 置き方 0〜4・k.b 小物 0〜4・k.R 乱数） ---------- */
  const TEA = ['#86c650', '#3f8a34', '#3a7a30', '#4a6a3a'];
  const M = [];
  const def = (key, name, icon, areas, lu, draw, extra = {}) => M.push({ key, name, icon, areas, lu, draw, ...extra });

  // 実相寺：文永8年（1271）創建。開祖の聖一国師が境内に茶の種をまいたのが西尾茶のはじまりといわれる。中心に釈迦堂（西尾市の資料・愛知県の資料）
  def('jissoji', '実相寺（西尾茶のはじまり）', '🍵', ['nishio'], 'ehc', (r, h, k) => {
    const hz = 18, x = 6 + k.a * 2;
    sky(r, h, k, hz); ground(r, h, k, hz, k.s === 3 ? '#a8a48c' : '#7a9a5a');
    if (k.b % 2 === 0) pine(r, k, 40 - k.a, hz - 8); tree(r, h, k, 0, hz - 6, 7, true);
    roofTiles(r, h, x - 3, x + 31, 9, 5, ['#8a8e94', '#62666e', '#3a3e44', '#545860']);
    r(x, 14, 28, 13, '#8a6a48'); for (let px = x + 1; px < x + 28; px += 5) r(px, 14, 1, 13, '#5a4430'); r(x + 9, 17, 10, 10, '#3a2a1e'); for (let lx = x + 10; lx < x + 19; lx += 2) r(lx, 17, 1, 10, '#6a5040');
    r(x - 2, 27, 32, 2, '#a8a49a');
    for (let y = 29; y < 48; y++) h(y, x + 10 - ((y - 29) >> 2), x + 17 + ((y - 29) >> 2), '#c8c3b8');
    for (let i = 0; i < 3 + (k.b % 3); i++) { const bx = (i * 11 + k.a * 3) % 40, by = 34 + (i % 2) * 6; r(bx + 1, by, 8, 4, TEA[k.s]); r(bx, by + 1, 10, 3, TEA[k.s]); r(bx + 1, by + 3, 8, 1, dark(TEA[k.s], 0.7)); if (k.s === 2) { r(bx + 3, by + 1, 1, 1, '#f4f4ec'); r(bx + 6, by + 2, 1, 1, '#f4f4ec'); } }   // 茶の木（秋は白い花）
    if (k.b >= 3) person(r, x + 13, 38, '#4a4a6a');
  });
  def('kabuse', '覆いをかけたてん茶の茶畑', '🍵', ['nishio'], 'abdh', (r, h, k) => {
    const hz = 15 + k.a;
    sky(r, h, k, hz); tree(r, h, k, 2 + k.a * 3, hz - 7, 7); tree(r, h, k, 40 - k.a * 2, hz - 6, 6);
    ground(r, h, k, hz, '#8a6a48');
    const covered = k.s <= 1, tana = k.b % 2 === 1;
    for (let i = 0, y = hz + 2; y < 46; i++) { const th = 3 + (i >> 1); for (let t = 0; t < th; t++) h(y + t, 0, 47, TEA[k.s]); y += th + 2; }
    if (covered && tana) { r(0, hz + 1, 48, 3, '#2a2a2a'); for (let x = 2 + k.a; x < 48; x += 9) r(x, hz + 4, 1, 44 - hz, '#8a7a5a'); for (let y = hz + 5; y < 48; y += 6) h(y, 0, 47, '#3a3a3a'); }
    else if (covered) for (let i = 0, y = hz + 2; y < 46; i++) { const th = 3 + (i >> 1); r(0, y - 1, 48, th, '#262626'); h(y - 1, 0, 47, '#4a4a4a'); y += th + 2; }
    else for (let x = 2 + k.a; x < 48; x += 9) { r(x, hz + 2, 1, 44 - hz, '#8a7a5a'); h(hz + 2, 0, 47, '#7a6a4a'); }
    if (k.b >= 2) { const x = 6 + k.a * 7; r(x, 40, 9, 5, '#d8d4c8'); r(x + 1, 41, 7, 3, '#5a8a3a'); }   // 摘んだ葉のかご
    if (k.b === 4) person(r, 24 + k.a, 34, '#4a6ab8', { hat: '#e8d8a8' });
  });
  const BOWL = ['#2a2624', '#7a4a2a', '#8ab0a0', '#e8e4dc', '#b84a32'];
  const SWEET = [['#f2b8cc', '#7a9a5a'], ['#3a5a8a', '#a8c8e8'], ['#9a5a2a', '#e8c070'], ['#c8303a', '#f4f0e8']];
  def('matcha', '抹茶と和菓子', '🍵', ['nishio'], 'efgh', (r, h, k) => {
    const fy = 26 + (k.a % 2) * 3;
    sky(r, h, k, fy - 6, { noCloud: true }); ground(r, h, k, fy - 6); tree(r, h, k, 4 + k.a * 4, fy - 16, 9); pine(r, k, 34 - k.a, fy - 15);
    r(0, fy - 7, 48, 1, '#5a3a24'); r(0, fy - 7, 2, 7, '#5a3a24'); r(46, fy - 7, 2, 7, '#5a3a24');
    table(r, h, fy, '#a8784a');
    const bx = 8 + k.a * 4, bc = BOWL[k.b];
    r(bx, fy + 5, 14, 7, bc); r(bx + 1, fy + 12, 12, 2, dark(bc, 0.8)); r(bx + 4, fy + 14, 6, 1, dark(bc, 0.6)); h(fy + 5, bx, bx + 13, '#6a9a32'); h(fy + 6, bx + 1, bx + 12, '#8cc040'); r(bx + 4, fy + 6, 3, 1, '#b8e070');
    const cx = bx + 18; r(cx, fy + 2, 2, 8, '#d8c890'); r(cx - 2, fy + 10, 6, 4, '#e8dca8'); for (let i = 0; i < 6; i += 2) r(cx - 2 + i, fy + 10, 1, 4, '#c8b880');
    const [sw, ac] = SWEET[k.s], px = bx + 25 > 40 ? 2 : bx + 25; r(px - 1, fy + 11, 9, 2, '#f4f0e8'); r(px, fy + 7, 7, 4, sw); r(px + 1, fy + 6, 5, 1, sw); r(px + 2, fy + 7, 3, 1, ac);
  }, { wy: 20 });
  def('ishiusu', '石臼でひく抹茶', '🍵', ['nishio'], 'efh', (r, h, k) => {
    for (let y = 0; y < 48; y++) h(y, 0, 47, y < 30 ? '#e8e0c8' : '#c8bc84');
    for (let x = 0; x < 48; x += 3) r(x, 0, 1, 30, '#c8bc9a');
    windowView(r, h, k, 4 + k.a * 5, 4, 14, 14);
    for (let y = 32; y < 48; y += 5) h(y, 0, 47, '#a89a64');
    const x = 14 + k.a * 3;
    r(x + 1, 25, 14, 1, '#b8b4ae'); r(x, 26, 16, 6, '#8a8680'); r(x + 1, 33, 14, 7, '#7a7670'); r(x, 34, 16, 5, '#7a7670'); h(32, x, x + 15, '#4a4640'); h(26, x, x + 15, '#a8a49e');   // 上の臼・下の臼
    for (let gx = x + 2; gx < x + 15; gx += 3) { r(gx, 28, 1, 3, '#6a6660'); r(gx + 1, 35, 1, 3, '#5e5a54'); }
    r(x + 7, 21, 2, 5, '#6a4a30'); r(x + 15, 28, 6, 2, '#8a6a48'); r(x + 20, 26, 2, 4, '#6a4a30');   // 芯棒と、まわす取っ手
    r(x - 2, 40, 20, 3, '#6a9a32'); r(x, 39, 16, 1, '#8cc040');
    const NAT = ['#1a1a1a', '#8a2a2a', '#c8a040', '#2a4a6a', '#5a3a2a'];
    r(4 + ((k.a + 3) % 5) * 7, 38, 5, 6, NAT[k.b]); r(4 + ((k.a + 3) % 5) * 7, 37, 5, 1, mix(NAT[k.b], '#ffffff', 0.3));
  }, { indoor: true });
  // てんてこ祭：熱池八幡社、1月3日。赤装束の厄男が大根を腰に下げ、太鼓に合わせて練り歩き、藁灰をまく。愛知県の無形民俗文化財（Aichi Now）
  def('tenteko', 'てんてこ祭', '🥁', ['nishio'], 'aeh', (r, h, k) => {
    const kk = { ...k, s: 3, t: 1 }; sky(r, h, kk, 16, { noSun: k.a % 2 === 1 }); ground(r, h, kk, 16, '#b8b0a0');
    const tx = 30 - k.a * 3; r(tx, 4, 16, 2, '#c8382c'); r(tx + 1, 6, 14, 1, '#c8382c'); r(tx + 2, 9, 12, 1, '#c8382c'); r(tx + 3, 6, 2, 12, '#c8382c'); r(tx + 11, 6, 2, 12, '#c8382c');
    for (let y = 18; y < 48; y++) h(y, 0, 47, y % 6 ? '#c8c0b0' : '#b8b0a0');
    const n = k.s === 3 ? 6 : 3 + k.s, x0 = 2 + k.a * 2;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * 7, y = 24 + (i % 2) * 2;
      r(x, y, 3, 2, '#f0c8a0'); r(x - 1, y - 1, 5, 1, '#c8202a'); r(x - 1, y + 2, 5, 4, '#d8202a'); r(x, y + 6, 1, 3, '#d8202a'); r(x + 2, y + 6, 1, 3, '#d8202a');
      if (i % 2 === 0) { r(x + 1, y + 5, 2, 3, '#f4f2ea'); r(x + 1, y + 4, 2, 1, '#5a9a3a'); }   // 腰に下げた大根
    }
    if (k.s === 1 || k.s === 3) { const dx = x0 + n * 7 - 3; r(dx, 26, 6, 5, '#8a5a3a'); r(dx, 26, 6, 1, '#e8dcc0'); r(dx, 30, 6, 1, '#e8dcc0'); r(dx - 1, 25, 1, 7, '#5a3a2a'); }   // 太鼓
    if (k.s >= 2) for (let i = 0; i < 26; i++) r(x0 + Math.floor(k.R() * 40), 18 + Math.floor(k.R() * 14), 1, 1, '#8a8a88');   // 藁灰をまく
    for (let i = 0; i < 3 + k.t * 5 + k.b; i++) { const cx = (i * 7 + k.a * 3) % 46; r(cx, 40 + (i % 3), 3, 6, ['#2a2a3a', '#4a3a3a', '#3a4a5a'][i % 3]); r(cx + 1, 38 + (i % 3), 1, 2, '#f0c8a0'); }
  }, { fixed: true, scene: () => ({ s: 3, night: false }), L: [['厄男の行列', '太鼓の囃子', '藁灰まき', '赤装束の6人'], ['人出すくなめ', 'にぎわう', '大にぎわい', '人だかり']] });
  def('ike', 'うなぎの養殖池と水車', '🐟', ['isshiki'], 'abdhi', (r, h, k) => {
    const hz = 14 + k.a;
    sky(r, h, k, hz); ground(r, h, k, hz, '#a8a49a');
    const house = k.b >= 3, w = 46;
    for (const [y0, y1] of [[hz + 3, 30], [33, 46]]) {
      r(1, y0, w, y1 - y0, '#4a6a58'); h(y0, 1, w, '#c8c4bc'); h(y1, 1, w, '#c8c4bc'); r(1, y0, 1, y1 - y0, '#c8c4bc'); r(w, y0, 1, y1 - y0, '#c8c4bc');
      for (let i = 0; i < 5; i++) r(3 + Math.floor(k.R() * 40), y0 + 2 + Math.floor(k.R() * (y1 - y0 - 3)), 3, 1, '#6a8a78');
      for (let i = 0; i < 1 + (k.b % 3); i++) { const x = 4 + ((k.a * 9 + i * 14) % 34), y = y0 + 2; r(x, y, 6, 4, '#e8e8e8'); r(x + 1, y + 1, 4, 2, '#9aa0a8'); r(x - 2, y + 4, 10, 2, '!#dff0f8'); }
    }
    if (house) { for (let y = hz + 1; y < 47; y += 1) { const op = (y - hz) % 4 === 0; if (op) h(y, 0, 47, '#e8ecee'); } for (let x = 0; x < 48; x += 8) r(x + k.a, hz + 1, 1, 46 - hz, '#d8dcde'); r(0, hz, 48, 2, '#f0f2f4'); }
    if (k.b === 2) person(r, 40 - k.a * 2, hz - 7, '#3a5a8a', { hat: '#e8e4dc' });
  });
  def('unaju', 'うな重', '🍱', ['isshiki'], 'efgh', (r, h, k) => {
    for (let y = 0; y < 26; y++) h(y, 0, 47, '#d8ccb0');
    windowView(r, h, k, 26 - k.a * 4, 3, 18, 14);
    table(r, h, 26, '#6a4228');
    const x = 4 + k.a * 3;
    r(x, 30, 26, 14, '#1e1a1a'); r(x + 1, 30, 24, 2, '#a82a22'); r(x + 2, 32, 22, 10, '#f4f0e8');
    for (let i = 0; i < 2 + (k.b % 2); i++) { const ex = x + 3 + i * (k.b % 2 ? 7 : 10), ew = k.b % 2 ? 6 : 9; r(ex, 33, ew, 7, '#8a4a1a'); h(33, ex, ex + ew - 1, '#b8682a'); for (let gx = ex + 1; gx < ex + ew; gx += 3) r(gx, 35, 1, 3, '#5a2a10'); }
    const SUI = ['#1e1a1a', '#a82a22', '#2a2a3a', '#6a3a22', '#1e1a1a'];
    r(x + 30, 34, 9, 7, SUI[k.b]); h(34, x + 30, x + 38, '#e8d8a8'); r(x + 32, 34, 2, 1, '#5a8a3a');
    if (k.b >= 3) r(x + 28, 44, 12, 2, '#c8a060');
  }, { indoor: true });
  def('kabayaki', '炭火のかば焼き', '🐟', ['isshiki', 'nishio'], 'efg', (r, h, k) => {
    const hz = 24;
    sky(r, h, k, hz); for (let y = hz; y < 48; y++) h(y, 0, 47, '#8a7a6a');
    const NOREN = ['#2a3a6a', '#6a2a2a', '#3a5a3a', '#4a3a2a', '#2a2a2a'];
    r(0, 6, 48, hz - 6, '#d8ccb0'); roofTiles(r, h, -2, 49, 2, 4); for (let x = 4 + k.a; x < 46; x += 10) { r(x, 8, 8, 9, NOREN[k.b]); r(x + 3, 10, 2, 3, '#f4f0e8'); }
    const x = 6 + k.a * 3;
    r(x, 36, 30, 10, '#4a4a4a'); r(x, 34, 30, 2, '#2a2a2a'); for (let i = 0; i < 9; i++) r(x + 2 + Math.floor(k.R() * 26), 34 + Math.floor(k.R() * 2), 2, 1, '!#ff7a2a');
    for (let i = 0; i < 3 + (k.b % 2); i++) { r(x + 2, 29 + i * 1, 26, 1, '#c8a878'); r(x + 3 + i * 1, 28 + i, 22, 2, '#8a4a1a'); }
    for (let i = 0; i < 4; i++) { const sx = x + 4 + i * 6 + Math.floor(k.R() * 3), sy = 14 + Math.floor(k.R() * 10); r(sx, sy, 3, 2, '#e8e8e8'); r(sx + 1, sy - 2, 2, 2, '#f4f4f4'); }
  });
  def('ebisen', 'えびせんべい', '🦐', ['isshiki'], 'efghj', (r, h, k) => {
    for (let y = 0; y < 22; y++) h(y, 0, 47, '#c8b898');
    windowView(r, h, k, 4 + k.a * 6, 3, 14, 12);
    for (let y = 16; y < 22; y++) h(y, 0, 47, '#8a6a48');
    table(r, h, 22, '#b88a58');
    const MIX = [['#f2a0a8', '#f4e0c8', '#f0b070'], ['#f4e0c8', '#e88a70', '#e8c080'], ['#f6c0c8', '#ffffff', '#d8a070'], ['#e8907a', '#f4d8b0', '#c8604a'], ['#f4e8d8', '#f2b0b8', '#f0c890']][k.b];
    const bx = 6 + k.a * 2;
    r(bx, 28, 34, 14, '#c89a5a'); r(bx + 1, 27, 32, 1, '#a87a3a'); for (let x = bx + 2; x < bx + 33; x += 4) r(x, 28, 1, 14, '#a87a3a');
    for (let i = 0; i < 9; i++) { const ex = bx + 2 + (i % 5) * 6 + (i >= 5 ? 3 : 0), ey = 25 + (i >= 5 ? 6 : 0) + Math.floor(k.R() * 2), c = MIX[i % 3]; r(ex, ey, 6, 5, c); r(ex + 1, ey - 1, 4, 1, c); r(ex + 2, ey + 1, 2, 1, '#d84a3a'); }
    const sx = bx + 26 - k.a * 3; r(sx, 20, 6, 2, '#e85a3a'); r(sx + 5, 18, 2, 3, '#e85a3a'); r(sx - 2, 21, 2, 1, '#f08a5a');
  }, { indoor: true });
  def('asari', '三河湾のあさり', '🐚', ['isshiki', 'kira', 'hazu', 'sakushima'], 'jk', (r, h, k) => {
    const hz = 16 + (k.a % 3) * 2;
    sky(r, h, k, hz); sea(r, h, k, hz, hz + 6); for (let y = hz + 6; y < 48; y++) h(y, 0, 47, '#c8b88a');
    for (let i = 0; i < 4; i++) { const x = Math.floor(k.R() * 38), y = hz + 9 + Math.floor(k.R() * 10); r(x, y, 8, 2, '#8ab0c8'); }
    for (let i = 0; i < 5 + k.b; i++) { const x = 2 + Math.floor(k.R() * 42), y = 32 + Math.floor(k.R() * 13); r(x, y, 4, 3, '#d8ccb4'); h(y + 1, x, x + 3, '#6a5a4a'); r(x + 1, y, 2, 1, '#8a7a68'); }
    const bx = 30 - k.a * 5; r(bx, 34, 8, 7, '#3a7ac8'); h(34, bx, bx + 7, '#5a9ae8'); r(bx + 1, 32, 6, 1, '#2a2a2a');
    r(bx + 10, 30, 1, 10, '#a87a4a'); r(bx + 8, 40, 5, 2, '#8a8a8a');
    if (k.s <= 1 && k.b % 2 === 0) person(r, 10 + k.a * 4, 26, '#e8a030', { hat: '#f0e8c8' });
  });
  // 一色さかな広場：一色漁港のとなりの海鮮市場。朝市広場、えびせんべい、三河湾の魚介（Aichi Now）
  const AWN = ['#2a6ab8', '#d8302a', '#2a8a5a', '#e8a030', '#6a4a8a'];
  def('sakanahiroba', '一色さかな広場', '🐟', ['isshiki'], 'jkeh', (r, h, k) => {
    const hz = 12;
    sky(r, h, k, hz); sea(r, h, k, hz, hz + 4); for (let y = hz + 4; y < 48; y++) h(y, 0, 47, '#b8b4ac');
    r(30 - k.a * 2, hz - 3, 10, 6, '#f4f4f2'); h(hz + 2, 31 - k.a * 2, 38 - k.a * 2, '#2a5aa8'); r(35 - k.a * 2, hz - 8, 1, 6, '#6a6a6a');   // 港の船
    for (let i = 0; i < 2; i++) {
      const x = 1 + i * 24, c = AWN[(k.b + i) % 5];
      for (let sx = x; sx < x + 22; sx += 4) r(sx, 18, 2, 4, c); r(x, 17, 22, 1, dark(c, 0.7)); r(x, 22, 22, 2, '#f0eee8');
      r(x + 1, 24, 20, 8, '#8a6a48'); r(x + 2, 25, 18, 6, '#d8dce0');
      for (let fx = x + 3; fx < x + 19; fx += 4) { if ((fx + i + k.a) % 3) { r(fx, 26, 3, 1, '#9aa4ae'); r(fx + 3, 26, 1, 1, '#7a848e'); } else { r(fx, 26, 3, 1, '#e85a3a'); r(fx + 2, 25, 1, 1, '#e85a3a'); } }
      for (let fx = x + 3; fx < x + 19; fx += 5) r(fx, 29, 3, 2, (fx + k.b) % 2 ? '#f2b0b8' : '#f4e0c8');   // えびせんべい
    }
    for (let i = 0; i < 3 + k.b; i++) person(r, 3 + ((i * 9 + k.a * 4) % 42), 36 + (i % 2) * 3, ['#3a6ab8', '#c84a6a', '#e8a030', '#3aa870', '#7a5ac8'][i % 5]);
  });
  def('fune', '佐久島への船', '⛴', ['sakushima', 'isshiki'], 'hjk', (r, h, k) => {
    const hz = 20 + (k.a % 2) * 2;
    sky(r, h, k, hz); hills(r, h, k, hz, '#3f6a4a', [[30 - k.a * 4, 5, 10], [38 - k.a * 4, 3, 8]]);
    sea(r, h, k, hz, 48);
    const x = 4 + k.a * 5, y = hz + 8;
    r(x, y + 4, 22, 4, '#f4f4f2'); r(x + 1, y + 8, 20, 1, '#c8ccd0'); h(y + 6, x, x + 21, '#2a6ab8'); r(x + 5, y, 12, 4, '#ffffff'); for (let wx = x + 6; wx < x + 16; wx += 3) r(wx, y + 1, 2, 2, '#3a5a7a'); r(x + 8, y - 3, 3, 3, '#e8e8e8');
    for (let i = 0; i < 4; i++) r(x - 3 - i * 4, y + 8 + (i % 2), 4, 1, '#ffffff');
    gull(r, 34 - k.b * 3, 5 + k.b);
    if (k.b >= 2) { r(36, hz + 14, 8, 2, '#e8e4dc'); r(39, hz + 11, 1, 3, '#8a8a8a'); }
  });
  def('kurokabe', '佐久島の黒壁の家並み', '🏘', ['sakushima'], '', (r, h, k) => {
    const hz = 12;
    sky(r, h, k, hz); for (let y = hz; y < 48; y++) h(y, 0, 47, '#b8b0a0');
    const n = 2 + (k.b % 2), off = k.a * 2;
    for (let i = 0; i < n; i++) {
      const x0 = -2 + i * Math.floor(50 / n) - off, x1 = x0 + Math.floor(50 / n) - 2, top = hz + 2 + (i % 2) * 2;
      roofTiles(r, h, x0, x1, top, 4); r(x0 + 2, top + 4, x1 - x0 - 3, 30 - top, '#26221e'); for (let y = top + 6; y < 34; y += 3) h(y, x0 + 2, x1 - 2, '#3a3430');
      r(x0 + 5, 26, 5, 8, '#5a4a3a');
    }
    for (let y = 34; y < 48; y++) h(y, 10 - ((y - 34) >> 1) + k.a, 37 + ((y - 34) >> 1) - k.a, (y % 3) ? '#d8d0c0' : '#c8c0b0');
    if (k.b >= 2) { r(4 + k.a * 3, 38, 5, 4, '#a85a3a'); r(5 + k.a * 3, 35, 3, 3, k.s === 3 ? '#6a7a5a' : '#4a8a3a'); }
    if (k.b === 4) { r(36 - k.a, 40, 4, 3, '#e8e4dc'); r(36 - k.a, 39, 1, 1, '#e8e4dc'); r(39 - k.a, 39, 1, 1, '#e8e4dc'); }
  });
  def('okinoshima', '幡豆の海と沖の島', '🏝', ['hazu'], 'jkcd', (r, h, k) => {
    const hz = 18 + (k.a % 2) * 2;
    sky(r, h, k, hz); sea(r, h, k, hz, 40);
    const ix = 6 + k.a * 3; hills(r, h, k, hz + 4, '#3f6a3a', [[ix + 6, 6, 7], [ix + 26, 4, 6]]);
    for (let y = 40; y < 48; y++) h(y, 0, 47, '#d8c89a'); h(40, 0, 47, '#f0f0f0');
    pine(r, k, 38 - k.a * 2, 30); if (k.b % 2) pine(r, k, 2 + k.a, 31);
    if (k.b >= 2) { const bx = 20 + k.a * 2; r(bx, hz + 10, 7, 2, '#f4f4f2'); r(bx + 2, hz + 8, 3, 2, '#e8e8e8'); }
    if (k.b === 4) gull(r, 12, 6);
  });
  def('ushitora', '西尾城の丑寅櫓', '🏯', ['nishio'], 'eh', (r, h, k) => {
    const hz = 30;
    sky(r, h, k, hz); ground(r, h, k, hz);
    const x = 12 + k.a * 2;
    for (let y = 30; y < 40; y++) h(y, x - 4 - ((y - 30) >> 1), x + 24 + ((y - 30) >> 1), (y % 3) ? '#9b968a' : '#7a756b');
    roofTiles(r, h, x - 2, x + 22, 16, 4, ['#a8acb2', '#7a7e86', '#3a3e44', '#5a5e66']); r(x, 20, 20, 10, '#f3f1ea'); r(x, 26, 20, 4, '#3a3230'); r(x + 4, 22, 3, 2, '#3a3a3a'); r(x + 13, 22, 3, 2, '#3a3a3a');
    roofTiles(r, h, x + 2, x + 18, 8, 3, ['#a8acb2', '#7a7e86', '#3a3e44', '#5a5e66']); r(x + 4, 11, 12, 5, '#f3f1ea'); r(x + 8, 12, 4, 2, '#3a3a3a'); r(x + 3, 7, 1, 1, '#c8a040'); r(x + 16, 7, 1, 1, '#c8a040');
    if (k.b % 2 === 0) { tree(r, h, k, 1, 24, 8); tree(r, h, k, 39, 25, 8); }
    if (k.b >= 3) { for (let y = 41; y < 48; y++) h(y, 0, 47, '#4f7f9a'); h(41, 0, 47, '#7aa8c0'); }
    if (k.b === 1 || k.b === 4) person(r, 6 + k.a * 7, 38, '#c84a6a');
  });
  def('machiya', '城下町の町家', '🏮', ['nishio'], 'ef', (r, h, k) => {
    sky(r, h, k, 12);
    const NOREN = ['#2a3a6a', '#6a2a2a', '#2f5a3a', '#e8e4dc', '#8a6a2a'];
    for (let i = 0; i < 2; i++) {
      const x0 = i ? 24 : -1, x1 = i ? 48 : 23;
      roofTiles(r, h, x0, x1, 8 + i * 2, 4); r(x0 + 1, 12 + i * 2, x1 - x0 - 2, 28 - i * 2, '#e8dcc0'); r(x0 + 1, 22, x1 - x0 - 2, 18, '#5a3e2a');
      for (let x = x0 + 2; x < x1 - 1; x += 2) r(x, 23, 1, 12, '#8a6a48');
      r(x0 + 6 + k.a, 22, 10, 6, NOREN[(k.b + i) % 5]); r(x0 + 8 + k.a, 23, 2, 3, '#f4f0e8');
    }
    for (let y = 40; y < 48; y++) h(y, 0, 47, '#9a948a'); for (let x = 2; x < 48; x += 8) r(x + k.a, 44, 5, 1, '#8a847a');
    r(20 + k.a, 14, 3, 5, '!#f2c050'); r(20 + k.a, 13, 3, 1, '#2a2a2a'); r(20 + k.a, 19, 3, 1, '#2a2a2a');
    if (k.b >= 3) person(r, 34 - k.a * 3, 38, '#7a3a8a');
  });
  def('densha', '名鉄の電車', '🚃', ['nishio', 'kira'], 'gfe', (r, h, k) => {
    const hz = 22;
    sky(r, h, k, hz); ground(r, h, k, hz, k.s === 2 ? '#c8a848' : GRASS[k.s]);
    tree(r, h, k, 40 - k.a * 2, hz - 7, 7);
    for (let x = 3 + k.a; x < 48; x += 14) { r(x, 6, 1, 26, '#7a7a7a'); r(x - 2, 8, 6, 1, '#7a7a7a'); } h(9, 0, 47, '#3a3a3a');
    r(0, 38, 48, 5, '#8a7a6a'); h(39, 0, 47, '#a8a8a8'); h(41, 0, 47, '#a8a8a8'); for (let x = 1; x < 48; x += 3) r(x, 40, 1, 1, '#6a5a4a');
    const cars = 1 + (k.b % 2), x = -4 + k.a * 4;
    for (let i = 0; i < cars; i++) { const cx = x + i * 26; r(cx, 24, 25, 14, '#c8102e'); r(cx, 24, 25, 1, '#e84a5a'); for (let wx = cx + 2; wx < cx + 23; wx += 5) r(wx, 27, 4, 4, '!#d8e8f4'); r(cx + 1, 35, 23, 1, '#8a0a1e'); r(cx + 3, 37, 4, 2, '#2a2a2a'); r(cx + 18, 37, 4, 2, '#2a2a2a'); }
    r(x + 10, 21, 1, 3, '#3a3a3a'); r(x + 8, 20, 5, 1, '#3a3a3a');
    if (k.b >= 2) { r(x + 1, 32, 2, 2, '!#fff4c0'); }
    if (k.b >= 3) r(30 + k.a, hz + 1, 10, 3, k.s === 0 ? '#f2b8cc' : '#e8d8a8');
  });
  def('akauma', '吉良の赤馬', '🐎', ['kira'], 'efh', (r, h, k) => {
    for (let y = 0; y < 28; y++) h(y, 0, 47, '#d8ccb0');
    windowView(r, h, k, 28 - k.a * 5, 4, 14, 14);
    const CLOTH = ['#2a4a8a', '#8a2a3a', '#2f6a4a', '#e8e0c8', '#4a3a6a'];
    table(r, h, 28, '#7a5232'); r(2, 30, 44, 14, CLOTH[k.b]); h(30, 2, 45, mix(CLOTH[k.b], '#ffffff', 0.25));
    const x = 8 + k.a * 3;
    r(x + 2, 24, 16, 8, '#c8282a'); r(x + 15, 17, 5, 9, '#c8282a'); r(x + 18, 15, 4, 4, '#c8282a'); r(x + 21, 17, 2, 2, '#c8282a');
    for (const lx of [x + 3, x + 7, x + 12, x + 16]) r(lx, 32, 2, 6, '#a82022');
    r(x + 6, 23, 7, 3, '#1a1a1a'); r(x + 7, 24, 5, 1, '#e8c030'); r(x + 19, 16, 1, 1, '#1a1a1a'); r(x + 14, 18, 2, 8, '#1a1a1a'); r(x, 25, 2, 6, '#1a1a1a');
    for (let i = 0; i < 3; i++) r(x + 4 + i * 4, 28, 2, 2, ['#2a6ad8', '#e8c030', '#2aa860'][i]);
    r(x - 1, 38, 22, 1, '#2a2a2a');
  }, { indoor: true });
  def('kogane', '黄金堤', '🌾', ['kira'], 'abic', (r, h, k) => {
    const hz = 14 + (k.a % 2) * 2;
    sky(r, h, k, hz); ground(r, h, k, hz, k.s === 2 ? '#c8a848' : GRASS[k.s]);
    const ty = 24 + (k.a >> 1);
    for (let y = ty; y < ty + 9; y++) { const k2 = y - ty; h(y, 0, 47, k2 < 2 ? '#7aa84a' : mix(GRASS[k.s], '#5a7a3a', 0.4)); }
    h(ty, 0, 47, '#c8b888');
    for (let i = 0; i < 4 + (k.b % 2); i++) pine(r, k, 2 + i * 11 + (k.a % 2) * 3, ty - 10);
    for (let y = ty + 10; y < 48; y++) h(y, 0, 47, (y % 4 === 0) ? '#7aa8c8' : '#5a8ab0');
    if (k.b >= 2) person(r, 20 + k.a * 3, ty - 7, '#e8a030');
    if (k.b === 4) { r(36, ty - 4, 2, 4, '#8a6a48'); r(34, ty - 6, 6, 2, '#e8e4dc'); }
  });
  def('enden', '饗庭塩の塩田', '🧂', ['kira'], 'jhad', (r, h, k) => {
    const hz = 16;
    sky(r, h, k, hz); sea(r, h, k, hz, hz + 5);
    for (let y = hz + 5; y < 48; y++) h(y, 0, 47, '#d8ccb0');
    for (let y = hz + 7; y < 48; y += 3) for (let x = (y % 6) + k.a; x < 48; x += 6) r(x, y, 4, 1, '#c8b898');
    for (let x = 0; x < 48; x += 16) r(x + k.a * 2, hz + 6, 1, 42 - hz, '#a89878');
    const hx = 30 - k.a * 4; r(hx, hz - 4, 14, 9, '#8a6a4a'); roofTiles(r, h, hx - 2, hx + 15, hz - 8, 3, ['#c8b888', '#a89868', '#6a5a3a', '#8a7a58']); r(hx + 10, hz - 12, 2, 4, '#5a4a3a');
    for (let i = 0; i < 3; i++) r(hx + 9 + i, hz - 15 - i * 2, 3, 2, '#e8e8e8');
    person(r, 8 + k.a * 5, 30, '#4a5a8a', { hat: '#d8c890' }); r(5 + k.a * 5, 37, 9, 1, '#8a6a48');
    if (k.b >= 1) r(4 + ((k.a + k.b) % 5) * 8, 40, 5, 4, '#f4f4f0');
    if (k.b >= 3) r(18 + k.b * 3, 44, 5, 3, '#f4f4f0');
  });
  // 行事とあじさい：その時期の景色だけ。s は色・形、t は人の数や時間（夕暮れ〜夜）
  const FEST = { labels: (s, t, L) => `${L[0][s]}・${L[1][t]}` };
  const FIRE = ['!#ffd84a', '!#ff9a3a', '!#fff4c0', '!#ff6a4a'];
  // 西尾祇園祭（伊文神社の祭礼。7月。2日目に神輿の渡御と大名行列、3日目に市民総踊り：愛知県の観光サイト Aichi Now）。s は場面、t は人出
  const KAMI = ['#1e2a4a', '#3a2a4a', '#2a3a2a', '#4a2a2a'];
  def('gion', '西尾祇園祭', '🏮', ['nishio'], 'ef', (r, h, k) => {
    const kk = { ...k, s: 1, t: 1 }; sky(r, h, kk, 12, { noSun: true });
    roofTiles(r, h, -2, 22, 6, 3); roofTiles(r, h, 26, 50, 7, 3); r(0, 9, 22, 13, '#e8dcc0'); r(26, 10, 22, 12, '#d8ccb0'); r(0, 16, 22, 6, '#5a3e2a'); r(26, 16, 22, 6, '#5a3e2a');
    for (let x = 1 + k.a; x < 48; x += 5) { r(x, 13, 3, 3, (x + k.b) % 2 ? '!#f04a3a' : '!#f8f0e0'); r(x + 1, 12, 1, 1, '#2a2a2a'); } h(12, 0, 47, '#3a3a3a');
    for (let y = 22; y < 48; y++) h(y, 0, 47, y % 5 ? '#c8c0b0' : '#b8b0a0');
    const x0 = -4 + k.a * 3, q = (x, y, w, hh, c) => r(x, y + 7, w, hh, c);   // 行列は通りのまん中に
    if (k.s === 0) for (let i = 0; i < 4; i++) { const x = x0 + i * 12; q(x + 1, 6, 1, 20, '#5a4a3a'); q(x - 1, 4, 5, 3, '#1a1a1a'); q(x, 3, 3, 1, '#1a1a1a'); person(q, x, 24, KAMI[(i + k.b) % 4], { hat: '#1a1a1a', leg: '#e8e4dc' }); }
    else if (k.s === 1) { const x = x0 + 10; q(x - 4, 22, 30, 1, '#6a4a30'); q(x + 4, 18, 14, 8, '#1a1a1a'); q(x + 5, 17, 12, 1, '#c8a040'); q(x + 8, 20, 6, 4, '#8a6a3a'); person(q, x - 2, 22, KAMI[k.b % 4], { hat: '#1a1a1a' }); person(q, x + 22, 22, KAMI[(k.b + 1) % 4], { hat: '#1a1a1a' }); }
    else if (k.s === 2) { const x = x0 + 12; q(x - 6, 27, 34, 1, '#6a4a30'); q(x + 4, 16, 14, 11, '#3a2a20'); q(x + 2, 13, 18, 3, '#d8a830'); q(x + 10, 9, 2, 4, '#e8c040'); q(x + 6, 18, 10, 6, '#c8a040'); for (let i = 0; i < 5; i++) person(q, x - 6 + i * 8, 26, '#f4f4f0', { leg: '#2a2a2a' }); }
    else for (let i = 0; i < 6; i++) { const x = x0 + 2 + i * 8; person(q, x, 25 + (i % 2), ['#e86a8a', '#4a8ad8', '#f0c040', '#7a5ac8', '#e8a030', '#3aa870'][(i + k.b) % 6]); q(x - 2, 23 + (i % 2), 1, 3, '#f0c8a0'); q(x + 4, 23 + (i % 2), 1, 3, '#f0c8a0'); }
    for (let i = 0; i < 4 + k.t * 3 + k.b; i++) { const cx = (i * 7 + k.a * 3) % 46; r(cx, 41 + (i % 3), 3, 5, ['#2a2a3a', '#4a3a3a', '#3a4a5a'][i % 3]); r(cx + 1, 39 + (i % 3), 1, 2, '#f0c8a0'); }
  }, { fixed: true, scene: () => ({ s: 1, night: false }), L: [['大名行列の毛槍', '大名行列の駕籠', '神輿の渡御', '市民総踊り'], ['人出すくなめ', 'にぎわう', '大にぎわい', '人だかり']] });
  def('toba', '鳥羽の火祭り', '🔥', ['hazu'], 'eh', (r, h, k) => {
    const kk = { ...k, s: 3, t: k.t === 0 ? 2 : 3 }; sky(r, h, kk, 40, { noCloud: true, noSun: true });
    for (let y = 40; y < 48; y++) h(y, 0, 47, '#3a3028');
    for (let i = 0; i < 2; i++) {
      const x = 6 + i * 22 + (k.a % 3) * 2, top = 12 + (k.s % 2) * 3 + i * 2;
      r(x, top, 10, 40 - top, '#8a7a4a'); for (let y = top + 2; y < 40; y += 4) h(y, x, x + 9, '#5a4a2a'); r(x + 4, top - 4, 2, 4, '#6a5a3a');
      const fh = 8 + k.s * 3 + k.t;
      for (let j = 0; j < 40; j++) { const fx = x - 3 + Math.floor(k.R() * 16), fy = top + 6 - Math.floor(k.R() * fh); r(fx, fy, 2, 2, ['!#ff5a2a', '!#ffb02a', '!#fff08a'][j % 3]); }
      const ny = top + 12 + (k.b % 3) * 4; person(r, x + 3, ny, '#c8302a', { face: '#a87858' }); r(x + 2, ny + 2, 2, 2, '#e8e4dc'); r(x + 5, ny + 3, 2, 2, '#2a5ab8');   // 神男：古い幟でつくった衣装
    }
    for (let i = 0; i < 5 + k.t + k.b; i++) { const cx = (i * 9 + k.a * 4) % 46; r(cx, 42, 3, 5, '#141414'); }
    for (let i = 0; i < 12; i++) r(Math.floor(k.R() * 48), Math.floor(k.R() * 12), 1, 1, '!#ffb02a');
  }, { fixed: true, scene: k => ({ s: 3, night: k.t !== 0 }), L: [['火の粉', '大きな炎', '燃えあがる', '火の柱'], ['夕暮れ', '宵', '夜', '夜ふけ']] });
  const LANT = [['#d8302a', '#2a5ab8', '#e8c030'], ['#2a8a5a', '#d8302a', '#f4f0e8'], ['#6a3a8a', '#e8a030', '#2a5ab8'], ['#c8102e', '#1a1a1a', '#e8c030']];
  def('chochin', '三河一色の大提灯', '🏮', ['isshiki'], 'eh', (r, h, k) => {
    const kk = { ...k, s: 1, t: k.t === 0 ? 2 : 3 }; sky(r, h, kk, 44, { noCloud: true, noSun: k.t !== 3 });
    for (let y = 44; y < 48; y++) h(y, 0, 47, '#4a4038');
    roofTiles(r, h, -2, 49, 34, 4, ['#4a5058', '#3a3e46', '#1e2026', '#2e3238']); r(0, 38, 48, 6, '#3a2a20');
    const n = 2 + (k.b % 2), pal = LANT[k.s];
    for (let i = 0; i < n; i++) {
      const w = n === 2 ? 14 : 11, x = 3 + i * (w + 4) + k.a, y = 4 + (i % 2) * 2, hh = 26 - (i % 2) * 2;
      r(x + 2, y, w - 4, 1, '#1a1a1a'); r(x, y + 1, w, hh, '!#f8e8c0'); r(x - 1, y + 3, w + 2, hh - 4, '!#f8e8c0');
      for (let yy = y + 3; yy < y + hh; yy += 4) h(yy, x, x + w - 1, '!#e8c890');
      r(x + 2, y + 6, w - 4, 8, '!' + mix(pal[i % 3], '#ffffff', 0.1)); r(x + 3, y + 8, 3, 3, '!#f0c8a0'); r(x + w - 6, y + 15, 3, 6, '!' + pal[(i + 1) % 3]);
      r(x + 2, y + hh + 1, w - 4, 1, '#1a1a1a'); r(x + (w >> 1), y - 3, 1, 3, '#2a2a2a');
    }
    for (let i = 0; i < 3 + k.t + k.b; i++) { const cx = (i * 8 + k.a * 5) % 46; r(cx, 41, 3, 6, '#141414'); }
  }, { fixed: true, scene: k => ({ s: 1, night: k.t !== 0 }), L: [['武者の絵', '龍の絵', '花の絵', '赤い絵'], ['夕暮れ', '宵', '夜', '夜ふけ']] });
  const AJI = [['#4a7ad8', '#7aa0f0'], ['#8a5ac8', '#b08ae8'], ['#e87aa8', '#f4a8c8'], ['#f0f2f4', '#d8e4f0']];
  def('ajisai', '三ヶ根山のあじさい', '💠', ['hazu'], 'cd', (r, h, k) => {
    const kk = { ...k, s: 1 }, hz = 14 + (k.a % 2) * 2;
    sky(r, h, kk, hz); sea(r, h, kk, hz, hz + 6); hills(r, h, kk, hz, '#4a6a5a', [[34 - k.a * 4, 3, 10]]);
    for (let y = hz + 6; y < 48; y++) h(y, 0, 47, TONE[1]('#3f7a3a'));
    const [c1, c2] = AJI[k.s];
    for (let i = 0; i < 9 + k.b; i++) {
      const x = Math.floor(k.R() * 42), y = hz + 8 + Math.floor(k.R() * (34 - hz));
      r(x, y + 3, 7, 3, '#2f6a2a'); r(x + 1, y, 5, 4, c1); r(x, y + 1, 7, 2, c1); r(x + 2, y + 1, 2, 1, c2); r(x + 4, y + 2, 1, 1, c2);
    }
    if (k.b >= 3) person(r, 20 + k.a * 3, 30, '#e8e4dc', { hat: '#8a5ac8' });
  }, { fixed: 'time', scene: k => ({ s: 1, night: k.t === 3 }), L: [['青いあじさい', 'むらさきのあじさい', 'もも色のあじさい', '白いあじさい'], TIME] });
  const PADDY = ['#7ab0d0', '#4a9a3a', '#d8b040', '#a89a7a'];
  def('tanbo', '西尾の田んぼ', '🌾', ['nishio', 'isshiki', 'kira', 'hazu'], 'a', (r, h, k) => {
    const hz = 16 + (k.a % 3) * 2;
    sky(r, h, k, hz); hills(r, h, k, hz, '#6a8a7a', [[8 + k.a * 7, 3, 14]]);
    const col = PADDY[k.s];
    for (let y = hz; y < 48; y++) h(y, 0, 47, col);
    for (let y = hz + 2; y < 48; y += 2 + ((y - hz) >> 3)) {
      if (k.s === 0) for (let x = (y % 4); x < 48; x += 4) r(x, y, 1, 1, '#5a9a3a');
      else if (k.s === 1) for (let x = (y % 3); x < 48; x += 3) r(x, y, 1, 2, '#3a7a2a');
      else if (k.s === 2) for (let x = (y % 3); x < 48; x += 3) { r(x, y, 1, 2, '#b8902a'); r(x, y - 1, 1, 1, '#f0d070'); }
      else for (let x = (y % 5); x < 48; x += 5) r(x, y, 1, 1, '#7a6a4a');
    }
    if (k.s === 0) for (let i = 0; i < 4; i++) r(Math.floor(k.R() * 44), hz + 2 + Math.floor(k.R() * 8), 4, 1, '#cfe6f6');
    h(hz + 12 + k.a, 0, 47, '#8a7a5a');
    if (k.b === 1) { r(30 - k.a * 3, 26, 1, 12, '#8a6a48'); r(27 - k.a * 3, 28, 7, 1, '#8a6a48'); r(29 - k.a * 3, 23, 3, 3, '#f0e0b0'); r(28 - k.a * 3, 22, 5, 1, '#c8a040'); r(28 - k.a * 3, 29, 5, 4, '#3a6ab8'); }
    if (k.b === 2) { const x = 8 + k.a * 6; r(x, 30, 5, 3, '#ffffff'); r(x + 4, 27, 1, 3, '#ffffff'); r(x + 4, 26, 2, 1, '#ffffff'); r(x + 5, 26, 1, 1, '#e8a030'); r(x + 1, 33, 1, 3, '#2a2a2a'); }
    if (k.b === 3) { const x = 32 - k.a * 4; r(x, hz - 6, 12, 6, '#e8dcc0'); roofTiles(r, h, x - 2, x + 13, hz - 10, 3); }
    if (k.b === 4 && k.s === 2) { for (let x = 4 + k.a * 3; x < 44; x += 2) r(x, 30, 1, 8, '#c8a040'); r(2 + k.a * 3, 29, 42, 1, '#6a4a30'); }
    else if (k.b === 4) person(r, 14 + k.a * 5, 28, '#4a6ab8', { hat: '#e8d8a8' });
  });

  /* ---------- あとから足した10題材（No.50001〜70000） ---------- */
  def('yatsuomote', '八ツ面山', '⛰', ['nishio'], 'ce', (r, h, k) => {
    const hz = 18 + (k.a % 2) * 2, px = 24 + (k.a - 2) * 3, top = y => 40 - Math.max(0, 22 - Math.abs(y - px) * 22 / 26);
    sky(r, h, k, hz); hills(r, h, k, 40, '#4f7a3f', [[px, 22, 26]]); hills(r, h, k, 40, '#5f8a4a', [[px + 10, 12, 14]]);
    ground(r, h, k, 40);
    for (let y = 22; y < 40; y += 3) { const x = px - 8 + ((y >> 1) % 2 ? 6 : -4); h(y, x, x + 5, '#c8b888'); }
    const n = 5 + (k.b % 3);
    for (let i = 0; i < n; i++) { const x = 2 + i * Math.floor(40 / n) + (k.a % 2) * 2; tree(r, h, k, x, Math.round(top(x + 3)) - 4, 6); }
    if (k.b >= 3) person(r, 30 - k.a * 4, 38, '#e86a8a');
    if (k.b === 4) for (let x = 2; x < 46; x += 5) { r(x, 33, 2, 2, '!#ffe8d0'); r(x + 2, 32, 3, 1, '#c83a3a'); }
  });
  def('chujaku', '西尾城の鍮石門', '🏯', ['nishio'], 'eh', (r, h, k) => {
    const hz = 26, x = 8 + k.a * 2, open = k.b % 2 === 1;
    sky(r, h, k, hz); ground(r, h, k, hz, '#c8c0b0');
    for (let y = 20; y < 40; y++) { h(y, 0, x + 3, (y % 3) ? '#9b968a' : '#7a756b'); h(y, x + 30, 47, (y % 3) ? '#9b968a' : '#7a756b'); }
    for (let xx = 2; xx < 48; xx += 5) { r(xx, 21, 1, 18, '#6f6a61'); }
    roofTiles(r, h, x - 3, x + 35, 6, 4, ['#a8acb2', '#7a7e86', '#3a3e44', '#5a5e66']);
    r(x, 10, 32, 9, '#f3f1ea'); for (let wx = x + 4; wx < x + 30; wx += 8) { r(wx, 12, 4, 4, '#3a3230'); r(wx + 1, 12, 1, 4, '#8a7a6a'); r(wx + 3, 12, 1, 4, '#8a7a6a'); }
    r(x, 19, 32, 2, '#3a3230'); r(x + 2, 21, 3, 19, '#5a3a24'); r(x + 27, 21, 3, 19, '#5a3a24');
    if (open) { r(x + 5, 21, 22, 19, '#2a2018'); for (let y = 26; y < 40; y++) h(y, x + 12 - ((y - 26) >> 1), x + 19 + ((y - 26) >> 1), '#b8b0a0'); }
    else { r(x + 5, 21, 22, 19, '#6a4428'); r(x + 15, 21, 2, 19, '#3a2418'); for (let yy = 24; yy < 40; yy += 4) for (let xx = x + 7; xx < x + 26; xx += 4) r(xx, yy, 1, 1, '#c8a040'); }
    if (k.b >= 2) { tree(r, h, k, 0, 13, 7); tree(r, h, k, 41, 14, 7); }
    if (k.b >= 3) person(r, x + 14, 38, '#3a6ab8');
  });
  def('konoe', '旧近衛邸の茶室', '🍵', ['nishio'], 'eh', (r, h, k) => {
    const hz = 16, x = 2 + k.a * 2;
    sky(r, h, k, hz); ground(r, h, k, hz, k.s === 3 ? '#9a9a7a' : '#5f8a4a');
    roofTiles(r, h, x - 2, x + 30, 10, 4, ['#8a8e94', '#62666e', '#3a3e44', '#545860']);
    r(x, 14, 28, 12, '#e8e2d0'); for (let sx = x + 1; sx < x + 27; sx += 6) { r(sx, 16, 5, 8, '#f6f4ec'); r(sx + 2, 16, 1, 8, '#c8c0ac'); r(sx, 19, 5, 1, '#c8c0ac'); }
    r(x - 2, 26, 32, 2, '#8a6a48'); r(x - 2, 28, 32, 1, '#5a4430');
    if (k.b !== 1) { const px = 26 + k.a; for (let y = 34; y < 44; y++) h(y, px + Math.abs(y - 39) - 2, px + 18 - Math.abs(y - 39), '#4f8fae'); h(35, px + 4, px + 10, '#8cc0d8'); }
    for (let i = 0; i < 4; i++) r(8 + i * 5 + (i % 2), 32 + i * 3, 4, 2, '#a8a49a');
    if (k.b >= 2) { r(4, 36, 3, 1, '#a8a49a'); r(3, 37, 5, 2, '#a8a49a'); r(4, 38, 3, 1, '!#f2d27a'); r(4, 39, 3, 4, '#a8a49a'); r(3, 43, 5, 1, '#8a857a'); }
    if (k.b >= 3) tree(r, h, k, 38 - k.a, 6, 9);
  });
  const BOOK = ['#2a3a5a', '#6a4a2a', '#a8884a', '#3a4a3a', '#5a2a2a', '#c8b890'];
  def('iwase', '岩瀬文庫の古い本', '📚', ['nishio'], 'eh', (r, h, k) => {
    for (let y = 0; y < 30; y++) h(y, 0, 47, '#d8ccb0');
    const sx = k.a < 2 ? 1 : 26;   // 本棚と窓は左右に分ける（窓から季節と天気が見えるように）
    windowView(r, h, k, k.a < 2 ? 26 + k.a * 2 : 3 + (k.a - 2) * 3, 3, 13, 12);
    r(sx, 2, 19, 27, '#6a4a30'); for (let row = 0; row < 4; row++) { const y = 4 + row * 6; for (let bx = sx + 1; bx < sx + 18; bx += 2) r(bx, y, 2, 5, BOOK[(bx + row + k.b) % 6]); h(y + 5, sx + 1, sx + 17, '#4a3020'); }
    table(r, h, 30, '#7a5232');
    const bx = 10 + k.a * 3; r(bx, 34, 22, 9, '#f4eedc'); r(bx + 11, 34, 1, 9, '#c8bca0'); for (let y = 36; y < 42; y += 2) { h(y, bx + 2, bx + 9, '#4a4a4a'); h(y, bx + 13, bx + 20, '#4a4a4a'); }
    r(bx - 1, 43, 24, 1, BOOK[k.b]);
    if (k.b >= 3) { r(bx + 24, 36, 5, 5, '#c8d8e0'); r(bx + 25, 37, 3, 3, '#e8f0f4'); r(bx + 28, 41, 4, 1, '#6a4a30'); }
  }, { indoor: true });
  // 西尾のカーネーション：施設園芸（温室）の生産額が全国トップクラス（愛知県「西尾の農林水産物」）
  const FLOWER = [['#d8283a', '#f04a5a'], ['#f08aa8', '#f8b8c8'], ['#f4f2ec', '#e0dcd0'], ['#f0c838', '#f8e070'], ['#e86a2a', '#f49a5a']];
  def('carnation', 'カーネーションの温室', '💐', ['nishio', 'isshiki', 'kira', 'hazu'], 'abeh', (r, h, k) => {
    const hz = 10 + (k.a % 2) * 2;
    sky(r, h, k, hz); for (let y = hz; y < 48; y++) h(y, 0, 47, '#8a7656');   // ガラス越しの空と、温室の土
    for (let x = -2 + k.a * 2; x < 50; x += 12) { r(x, 0, 1, hz + 2, '#d8dce0'); } h(4, 0, 47, '#d8dce0'); h(hz, 0, 47, '#c8ccd0'); h(hz + 1, 0, 47, '#e8ecee');
    const [c1, c2] = FLOWER[k.b];
    for (let row = 0; row < 4; row++) {   // 手前ほど大きく見える花のうね
      const y = hz + 5 + row * (3 + row * 2), sp = 2 + row, fh = 1 + row;
      r(0, y + fh + 1, 48, 2 + row, '#3f7a3a'); h(y + fh + 3 + row, 0, 47, '#6a5a40');
      for (let x = (row * 3 + k.a) % sp; x < 48; x += sp) { r(x, y + 1, 1, fh + 1, '#4f8a3a'); r(x - (row >> 1), y - fh + 1, 1 + (row >> 1) * 2, fh, c1); if (row >= 2) r(x, y - fh + 1, 1, 1, c2); }
    }
    if (k.b % 2 === 0) person(r, 30 - k.a * 4, hz + 9, '#4a6ab8', { hat: '#e8d8a8' });
    if (k.b >= 3) { r(4 + k.a * 3, 40, 8, 5, '#c8a868'); r(5 + k.a * 3, 38, 6, 2, c1); }   // 摘みとった花のかご
  });
  // 稲荷山茶園：西尾市の茶畑約200haの半分（約100ha）。5月ごろの茶摘みには、茶摘み娘（かすり）の衣装の体験も（tabi-mag・Aichi Now）
  def('chatsumi', '稲荷山茶園', '🍵', ['nishio'], 'abdh', (r, h, k) => {
    const hz = 14 + (k.a % 2) * 2;
    sky(r, h, k, hz); hills(r, h, k, hz + 6, TEA[k.s], [[12 + k.a * 5, 8, 18], [38, 5, 14]]);
    ground(r, h, k, hz + 6, '#8a6a48');
    for (let i = 0, y = hz + 7; y < 48; i++) { const th = 2 + (i >> 1), off = Math.round(Math.sin((i + k.a) * 0.9) * 3); for (let t = 0; t < th; t++) h(y + t, 0, 47, t === th - 1 ? dark(TEA[k.s], 0.72) : TEA[k.s]); if (k.s === 0) for (let x = (i * 5 + off + 50) % 6; x < 48; x += 6) r(x, y, 2, 1, '#c4e88a'); y += th + 1; }
    if (k.s === 0) for (let i = 0; i < 1 + (k.b % 3); i++) {   // 茶摘みの季節：かすりの着物にたすき・すげ笠の茶摘み娘
      const x = 6 + ((k.a * 9 + i * 13) % 34), y = 26 + i * 4;
      r(x - 2, y, 7, 1, '#d8c890'); r(x - 1, y - 1, 5, 1, '#c8b880'); r(x, y + 1, 3, 2, '#f0c8a0');
      r(x - 1, y + 3, 5, 4, '#2a3a6a'); r(x, y + 4, 1, 1, '#f4f4f0'); r(x + 2, y + 5, 1, 1, '#f4f4f0'); r(x - 1, y + 3, 5, 1, '#d8303a');
      r(x + 4, y + 5, 3, 3, '#c8a868');
    }
    if (k.b === 4) { r(36 - k.a * 2, hz - 1, 9, 5, '#e8dcc0'); roofTiles(r, h, 34 - k.a * 2, 46 - k.a * 2, hz - 4, 3); }
  });
  def('nori', '一色の海苔ひび', '🌊', ['isshiki'], 'jk', (r, h, k) => {
    const hz = 16 + (k.a % 2) * 2;
    sky(r, h, k, hz); hills(r, h, k, hz, '#5a7a7a', [[10 + k.a * 6, 3, 10]]); sea(r, h, k, hz, 48);
    for (let row = 0; row < 4; row++) {
      const y = hz + 4 + row * (3 + row * 2), gap = 3 + row * 2, len = 2 + row * 2;
      for (let x = (row * 3 + k.a) % gap; x < 48; x += gap) r(x, y - len, 1, len + 1, '#3a3428');
      r(0, y, 48, 1 + (row >> 1), '#1e2a20'); if (row >= 2) h(y + 2, 0, 47, '#2a3a2a');
    }
    if (k.b >= 2) { const bx = 6 + k.b * 6; r(bx, hz + 8, 10, 3, '#f4f4f2'); r(bx + 2, hz + 6, 4, 2, '#e8e8e8'); person(r, bx + 6, hz + 2, '#e8a030', { hat: '#f0e8c8' }); }
    if (k.b === 4) gull(r, 34, 5);
  });
  def('kiraonsen', '吉良温泉と三河湾', '♨️', ['kira'], 'ejhk', (r, h, k) => {
    const hz = 18;
    sky(r, h, k, hz); sea(r, h, k, hz, 32); hills(r, h, k, hz, '#4a6a5a', [[36 - k.a * 3, 4, 9]]);
    for (let y = 32; y < 48; y++) h(y, 0, 47, '#b8b0a0');
    const HC = ['#f0ece2', '#e8dcc0', '#d8dce0', '#f4e8d8', '#e0d4c4'];
    for (let i = 0; i < 2 + (k.b % 2); i++) { const bx = 2 + i * 15 + (k.a % 2) * 2, bh = 12 + (i % 2) * 5; r(bx, 32 - bh, 13, bh, HC[(k.b + i) % 5]); for (let wy = 34 - bh; wy < 30; wy += 3) for (let wx = bx + 1; wx < bx + 12; wx += 3) r(wx, wy, 2, 2, k.t === 3 ? '!#ffe8a0' : '#5a6a7a'); }
    const px = 26 - k.a * 2; for (let y = 38; y < 46; y++) h(y, px + Math.abs(y - 42), px + 18 - Math.abs(y - 42), '#8ab8c8'); for (const [rx, ry] of [[px - 1, 40], [px + 18, 41], [px + 4, 45], [px + 13, 45]]) r(rx, ry, 3, 2, '#7a756b');
    for (let i = 0; i < 5; i++) { const sx = px + 3 + i * 3, sy = 34 - (i % 2) * 3; r(sx, sy, 2, 3, '#f4f6f8'); r(sx + 1, sy - 2, 2, 2, '#f8fafc'); }
  });
  def('kezoji', '華蔵寺の山門', '⛩', ['kira'], 'ehc', (r, h, k) => {
    const hz = 20, x = 9 + k.a * 2;
    sky(r, h, k, hz); for (let i = 0; i < 6; i++) tree(r, h, k, i * 8, hz - 6 + (i % 2) * 2, 8, i % 2 === 0); ground(r, h, k, hz + 6);
    for (let y = 34; y < 48; y++) h(y, x + 8 - ((y - 34) >> 1), x + 21 + ((y - 34) >> 1), (y % 2) ? '#a8a49a' : '#8a857a');
    roofTiles(r, h, x - 4, x + 33, 8, 5, ['#8a8e94', '#62666e', '#3a3e44', '#545860']);
    r(x, 13, 29, 2, '#5a3a24'); r(x + 1, 15, 3, 19, '#6a4a30'); r(x + 25, 15, 3, 19, '#6a4a30'); r(x + 4, 15, 21, 4, '#8a6a48'); r(x + 7, 19, 15, 15, '#2a2018');
    r(x + 11, 15, 7, 3, '#e8dcb0'); h(16, x + 12, x + 16, '#3a3a3a');
    if (k.b % 2 === 1) for (const lx of [x - 4, x + 31]) { r(lx + 1, 26, 2, 1, '#a8a49a'); r(lx, 27, 4, 2, '#a8a49a'); r(lx + 1, 28, 2, 1, '!#f2d27a'); r(lx + 1, 29, 2, 5, '#a8a49a'); }
    if (k.b >= 3) person(r, x + 13, 38, '#4a4a6a');
  });
  def('higata', '一色の干潟の水鳥', '🐦', ['isshiki'], 'jkai', (r, h, k) => {
    const hz = 15 + (k.a % 2) * 2;
    sky(r, h, k, hz); sea(r, h, k, hz, hz + 6);
    for (let y = hz + 6; y < 48; y++) h(y, 0, 47, '#9a8a6a');
    for (let i = 0; i < 5; i++) { const y = hz + 9 + i * 5, x = (i * 13 + k.a * 4) % 30; r(x, y, 14 + (i % 3) * 4, 2, '#7a9ab0'); r(x + 2, y, 6, 1, '#a8c4d8'); }
    for (let i = 0; i < 4 + k.b * 2; i++) { const x = 2 + Math.floor(k.R() * 42), y = hz + 10 + Math.floor(k.R() * (34 - hz)); r(x, y, 3, 2, '#8a6a4a'); r(x, y + 1, 3, 1, '#f4f0e8'); r(x + 3, y, 1, 1, '#2a2a2a'); r(x + 1, y + 2, 1, 1, '#4a4a4a'); }
    if (k.b >= 2) { const x = 30 - k.a * 4, c = k.b === 4 ? '#f8f8f6' : '#9aa0a8'; r(x, 30, 4, 4, c); r(x + 3, 26, 1, 4, c); r(x + 3, 25, 3, 1, c); r(x + 6, 25, 2, 1, '#e8a030'); r(x + 1, 34, 1, 5, '#3a3a3a'); r(x + 3, 34, 1, 5, '#3a3a3a'); }
  });

  // 金蓮寺弥陀堂：吉良町饗庭。鎌倉時代の阿弥陀堂（方三間・寄棟造・檜皮葺）。国宝、県内最古の木造建築（tabi-mag・愛知県の資料）
  def('konrenji', '金蓮寺弥陀堂', '🏛', ['kira'], 'ehc', (r, h, k) => {
    const hz = 18, x = 9 + k.a * 2;
    sky(r, h, k, hz); for (let i = 0; i < 6; i++) tree(r, h, k, i * 8 - 2, hz - 7 + (i % 2) * 2, 9, true); ground(r, h, k, hz + 6, k.s === 3 ? '#a8a48c' : '#6f8a4a');
    for (let i = 0; i < 9; i++) h(10 + i, x + 9 - i * 1.2 | 0, x + 21 + i * 1.2 | 0, i % 2 ? '#7a5240' : '#8a6050');   // 檜皮葺の寄棟の屋根
    h(10, x + 9, x + 21, '#5a3a2a'); h(19, x - 2, x + 32, '#4a2e22');
    r(x + 1, 20, 28, 12, '#a8845e'); for (let px = x + 1; px < x + 30; px += 9) r(px, 20, 2, 12, '#6a4a30');
    for (let px = x + 4; px < x + 28; px += 9) { r(px, 22, 5, 9, '#5a3e2a'); for (let ly = 23; ly < 31; ly += 2) h(ly, px, px + 4, '#8a6a48'); }
    r(x - 1, 32, 32, 2, '#7a5a40'); r(x - 2, 34, 34, 3, '#a8a49a');
    for (let y = 37; y < 48; y++) h(y, x + 11 - ((y - 37) >> 1), x + 19 + ((y - 37) >> 1), '#c8c3b8');
    if (k.b % 2 === 1) { r(x - 6, 36, 3, 1, '#a8a49a'); r(x - 7, 37, 5, 2, '#a8a49a'); r(x - 6, 38, 3, 1, '!#f2d27a'); r(x - 6, 39, 3, 5, '#a8a49a'); }
    if (k.b >= 3) person(r, x + 14, 40, '#4a4a6a');
  });
  // 三河万歳（森下万歳）：国の重要無形民俗文化財。大名屋敷の座敷で舞ったことから「御殿万歳」。太夫と才蔵の2人で舞う（文化遺産オンライン・Aichi Now）
  const MZ = [['#2a4a8a', '#c8a040'], ['#2a6a4a', '#d8302a'], ['#6a2a4a', '#e8c040'], ['#3a3a6a', '#f4f0e8'], ['#5a3a1a', '#3a8ad8']];
  def('manzai', '三河万歳', '🪭', ['nishio'], 'eh', (r, h, k) => {
    for (let y = 0; y < 28; y++) h(y, 0, 47, '#e8e2d0');
    for (let sx = 0; sx < 48; sx += 12) { r(sx + 1, 2, 10, 24, '#f6f4ec'); for (let gy = 6; gy < 26; gy += 5) h(gy, sx + 1, sx + 10, '#c8c0ac'); r(sx + 6, 2, 1, 24, '#c8c0ac'); }
    windowView(r, h, k, 17 + (k.a % 3) * 2, 4, 14, 12);
    for (let y = 28; y < 48; y++) h(y, 0, 47, '#c8c08a'); for (let y = 28; y < 48; y += 7) h(y, 0, 47, '#5a6a3a'); for (let x = 0; x < 48; x += 16) r(x, 28, 1, 20, '#a89a64');
    const [c1, c2] = MZ[k.b], x1 = 6 + k.a * 2, x2 = 30 - k.a;
    r(x1 + 1, 13, 3, 6, '#1a1a1a'); r(x1, 18, 5, 1, '#1a1a1a'); r(x1, 19, 5, 3, '#f0c8a0');   // 太夫：烏帽子
    r(x1 - 3, 22, 11, 12, c1); r(x1, 24, 5, 5, '#f4f0e8'); r(x1 + 1, 25, 3, 3, c1); r(x1 - 2, 34, 4, 3, c1); r(x1 + 3, 34, 4, 3, c1);
    r(x1 + 8, 18, 6, 4, c2); r(x1 + 8, 22, 1, 2, '#6a4a30');   // 扇
    r(x2, 19, 6, 3, '#d8302a'); r(x2 + 1, 18, 4, 1, '#2a8a5a'); r(x2 + 1, 22, 4, 3, '#f0c8a0');   // 才蔵：大黒頭巾
    r(x2 - 2, 25, 10, 10, '#8a6a48'); r(x2 - 1, 26, 8, 2, c2); r(x2 - 1, 35, 3, 2, '#6a4a30'); r(x2 + 5, 35, 3, 2, '#6a4a30');
    r(x2 + 8, 26, 2, 1, '#2a2a2a'); r(x2 + 7, 27, 4, 3, '#d8a830'); r(x2 + 8, 30, 2, 1, '#2a2a2a');   // 鼓
  }, { indoor: true });

  /* ---------- 番号 ⇄ 絵 ---------- */
  // 番号：0〜9999 ＝ はじめの25題材の晴れ（前からの絵）、10000〜49999 ＝ 同じ25題材の天気1〜4、50000〜69999 ＝ あとの10題材の天気0〜4
  const OLD = 25, NWX = 5, PERM = PER * NWX, COUNT = M.length * PERM;
  const WX_LABEL = ['', 'くもり', '雨', '霧'];
  function split(id) {
    let m, w, r;
    if (id < OLD * PER) { m = Math.floor(id / PER); w = 0; r = id % PER; }
    else if (id < OLD * PERM) { const k = id - OLD * PER; w = 1 + Math.floor(k / (OLD * PER)); m = Math.floor((k % (OLD * PER)) / PER); r = k % PER; }
    else { const k = id - OLD * PERM, n = M.length - OLD; w = Math.floor(k / (n * PER)); m = OLD + Math.floor((k % (n * PER)) / PER); r = k % PER; }
    const sl = Math.floor(r / NCOMP), c = r % NCOMP;
    return { m, w, s: sl >> 2, t: sl & 3, a: Math.floor(c / 5), b: c % 5 };
  }
  function idOf(m, w, slot, comp) {
    const r = slot * NCOMP + comp;
    if (m < OLD) return w === 0 ? m * PER + r : OLD * PER + (w - 1) * OLD * PER + m * PER + r;
    return OLD * PERM + w * (M.length - OLD) * PER + (m - OLD) * PER + r;
  }
  // 74000枚ぜんぶ、Blender で立体を作って焼いた絵（tools/blender/dots3d.py）。題材・季節・時間帯・天気ごとのシート（48×48 が 5×5。並びは置き方の番号）を読み、切り出して使う
  // シートが読めないあいだ（読みこみ中・オフライン）は、前からの描き方で描く
  const SHEETS = new Map();   // '題材-季節-時間帯[-天気]' → { img, st：0 読みこみ中・1 読めた・2 読めなかった, t：読めなかった時刻, p }
  const is3d = id => id >= 0 && id < COUNT;
  const sheetOf = id => { const p = split(id); return { key: `${p.m}-${p.s}-${p.t}${p.w ? '-' + p.w : ''}`, i: p.a * 5 + p.b }; };
  function loadSheet(key) {
    let e = SHEETS.get(key);
    if (!e || (e.st === 2 && Date.now() - e.t > 15000)) {   // 読めなかったシートは、15秒たてば読みなおす（電波が一時とぎれたときなど）
      e = { img: new Image(), st: 0, t: 0 };
      e.p = new Promise(res => { e.img.onload = () => { e.st = 1; res(); }; e.img.onerror = () => { e.st = 2; e.t = Date.now(); res(); }; });
      e.img.src = `nishio-go/dots3d/${key}.png`;
      SHEETS.set(key, e);
    }
    return e;
  }
  const keysOf = ids => [...new Set(ids.filter(is3d).map(id => sheetOf(id).key))];
  // ready(ids)：絵を出してよいか（シートが読めたか、読めなかったと分かった）。load(ids)：シートを読む（4秒で待つのをやめる）
  const ready = ids => keysOf(ids).every(k => SHEETS.has(k) && SHEETS.get(k).st !== 0 && !(SHEETS.get(k).st === 2 && Date.now() - SHEETS.get(k).t > 15000));
  const load = ids => Promise.race([Promise.all(keysOf(ids).map(k => loadSheet(k).p)), new Promise(res => setTimeout(res, 4000))]);
  const sceneOf = (mo, p) => (mo.scene ? mo.scene(p) : { s: p.s, night: p.t === 3 });
  // 天気4つめ：冬の景色は雪、夜は満月、ほかは虹
  const wxKind = (mo, p) => (p.w === 0 ? '' : p.w < 4 ? ['', 'cloudy', 'rain', 'mist'][p.w] : sceneOf(mo, p).s === 3 ? 'snow' : sceneOf(mo, p).night ? 'moon' : 'rainbow');
  const WK_LABEL = { cloudy: 'くもり', rain: '雨', mist: '霧', snow: '雪', rainbow: '虹', moon: '満月' };
  function info(id) {
    if (!(id >= 0 && id < COUNT)) return null;
    const p = split(id), mo = M[p.m], wk = wxKind(mo, p);
    const label = (mo.fixed ? FEST.labels(p.s, p.t, mo.L) : `${SEASON[p.s]}の${TIME[p.t]}`) + (wk ? `・${WK_LABEL[wk]}` : '');
    return { id, no: id + 1, motif: mo.key, m: p.m, w: p.w, wk: wk || 'clear', icon: mo.icon, title: mo.name, label, name: `${mo.name}（${label}）` };
  }
  const motifOf = id => split(id).m;
  const cache = new Map();
  function canvas(id) {
    if (cache.has(id)) return cache.get(id);
    if (!(id >= 0 && id < COUNT)) return null;
    const p = split(id), mo = M[p.m], cv = document.createElement('canvas'), wk = wxKind(mo, p);
    cv.width = cv.height = 48;
    const sh = is3d(id) ? loadSheet(sheetOf(id).key) : null;
    if (sh && sh.st === 1) {   // Blender の絵を切り出す
      const i = sheetOf(id).i;
      cv.getContext('2d').drawImage(sh.img, (i % 5) * 48, Math.floor(i / 5) * 48, 48, 48, 0, 0, 48, 48);
      return keep(id, cv);
    }
    const tTone = TONE[mo.fixed === true ? 1 : p.t], wTone = !mo.indoor && WX_TONE[wk], tone = wTone ? c => wTone(tTone(c)) : tTone;
    const x = cv.getContext('2d');
    const fill = c => { x.fillStyle = c[0] === '!' ? c.slice(1) : tone(c); };
    const r = (px, py, w, hh, c) => { if (w <= 0 || hh <= 0) return; fill(c); x.fillRect(px, py, w, hh); };
    const h = (py, x0, x1, c) => r(x0, py, x1 - x0 + 1, 1, c);
    const k = { ...p, wk, R: rndOf(hashStr('dot:' + id)), W: rndOf(hashStr('wx:' + id)) };
    mo.draw(r, h, k);
    if (wk && !mo.indoor) wxOver(r, k, mo.wy || 48);
    return sh ? cv : keep(id, cv);   // シートが読めないあいだの代わりの絵は、とっておかない（あとで読めたら Blender の絵にする）
  }
  function keep(id, cv) {
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    cache.set(id, cv);
    return cv;
  }
  const dataUrl = id => { const c = canvas(id); return c ? c.toDataURL() : ''; };

  /* ---------- その場所でもらえる1枚 ---------- */
  // 地区：その場所にいちばん近い、地区のわかっている注目スポット（spots.json の area）の地区。注目スポットは西尾市の中に多いので、旧町の境目の近くでもだいたい合う
  const DISTRICTS = new Set(['nishio', 'isshiki', 'kira', 'hazu', 'sakushima']);
  let refs = [], refsOf = null;
  function areaOf(lat, lng) {
    if (refsOf !== G.spots) { refsOf = G.spots; refs = (G.spots || []).filter(x => x.featured && DISTRICTS.has(x.area)); }
    let best = 'nishio', bd = Infinity;
    for (const x of refs) { const d = Math.hypot((lat - x.lat) * 111, (lng - x.lng) * 91); if (d < bd) { bd = d; best = x.area; } }
    return best;
  }
  function nearCoast(lat, lng) {   // まわり約300m（8方向）に海か海浜があるか
    if (!P.luAt) return false;
    for (const [a, b] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const c = P.luAt(lat + a * 0.0027, lng + b * 0.0033); if (c === 'j' || c === 'k') return true; }
    return false;
  }
  const jst = d => new Date(d.getTime() + 9 * 3600e3);   // 西尾の季節と時間（端末の時間帯の設定によらず日本時間）
  const seasonOf = d => [3, 3, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3][jst(d).getUTCMonth()];
  const timeOf = d => { const hr = jst(d).getUTCHours(); return hr >= 5 && hr < 10 ? 0 : hr < 16 && hr >= 10 ? 1 : hr >= 16 && hr < 19 ? 2 : 3; };
  // lat, lng：もらう場所。seed：たからばこやスポットの id（同じ場所・同じ日・同じ時間帯なら同じ1枚）。area：その場所の地区が分かっていれば（注目スポットの area）。西尾市の外なら null
  function pick(lat, lng, seed, now = new Date(), area = '') {
    const c = G.cityAt && G.cityAt(lat, lng);
    if (!c || c.name !== '西尾市') return null;
    if (!DISTRICTS.has(area)) area = areaOf(lat, lng);
    const lu = (P.luAt && P.luAt(lat, lng)) || '', coast = nearCoast(lat, lng);
    // 土地利用が合う題材。海辺の題材（海浜 j・海 k）は、海から約300m以内なら出す（たからばこやスポットは海の上にないので）
    let cand = M.map((m, i) => i).filter(i => M[i].areas.includes(area) && (!M[i].lu || (lu && M[i].lu.includes(lu)) || (coast && /[jk]/.test(M[i].lu))));
    if (!cand.length) cand = M.map((m, i) => i).filter(i => M[i].areas.includes(area));
    const hsh = hashStr(`${seed}:${G.ymd ? G.ymd() : ''}`), m = cand[hsh % cand.length], mo = M[m];
    const s = mo.fixed ? (hsh >>> 8) % 4 : seasonOf(now), t = mo.fixed === true ? (hsh >>> 12) % 4 : timeOf(now);
    return idOf(m, weatherOf(hsh, timeOf(now), sceneOf(mo, { s, t })), s * 4 + t, hashStr(`${seed}:${hsh}`) % NCOMP);   // 朝の霧は本当の時刻で（行事の t は人出の番号なので）
  }
  // 天気：気象庁の今の天気（weather.js）に合わせる。晴れ 0・くもり 1・雨 2・霧 3・4つめ（冬の景色は雪、夜は満月、ほかは虹）。
  // 4つめは景色で絵がかわるので、今の天気とちがう絵にならないときだけ使う：雪の日は冬の景色なら雪（ほかの景色はくもり）、
  // 晴れの日はたまに虹か満月（冬の景色では出さない）。雨が降っている間はいつも雨。朝は（雨と雪のとき以外）3回に1回 霧
  // 天気がわからないときは、晴れ多めに くじで決める
  function weatherOf(hsh, t, sc) {   // t：本当の時間帯（朝 0）、sc：絵の景色（季節 s と、夜 night）
    const wx = window.NISHIO_WEATHER && window.NISHIO_WEATHER.current, kind = wx && wx.kind, u = (hsh >>> 16) % 24, ss = sc.s;
    if (kind === 'rain') return 2;   // 降っている間はいつも雨の絵（weather.js の rain は、いま降っているとき）
    if (t === 0 && u % 3 === 0 && kind !== 'snow') return 3;
    if (kind === 'snow') return ss === 3 ? 4 : 1;
    if (kind === 'cloudy') return 1;
    if (kind === 'sunny') return u === 5 && ss !== 3 ? 4 : 0;
    return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4][u];
  }
  window.NISHIO_DOTS = { COUNT, PER: PERM, MOTIFS: M.map(({ key, name, icon }) => ({ key, name, icon })), info, canvas, dataUrl, pick, areaOf, motifOf, idOf, ready, load };
})();
