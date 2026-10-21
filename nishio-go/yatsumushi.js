// にしおさんぽGO：イベント「八ツ面山の昆虫さがし」
// ・八ツ面山（久麻久神社も）の近くに来ると、1日1回、虫にくわしい人に呼びとめられる。
//   「きょうの虫」を、林の5つの場所（地面・草むら・樹液の木・倒木のキノコ・木の上）から3回までで探す。
//   えらんだ場所に本で書かれている虫が わかる（はじめての虫は虫手帳に入る）。きょうの虫の場所を当てたら見つけた。
//   ごほうびは game.js の yatsuMushiReward（1日1回）：見つけたら +15pt、はじめての虫1ぴき +5pt、八ツ面山の虫の まちメモ1つ
// ・虫・場所・季節は、運営者から受けとった西尾の自然の本 335〜336ページ「八ツ面山」の本文に書いてあることだけ（写真はつかわない）。
//   季節のことばの月（春＝3〜5月・初夏＝5〜6月・盛夏＝7〜8月）は ふつうの言い方での目安。季節が書かれていない虫は、いつでも出る
// ・本に書いてあるのは「その場所で見られる」ことなので、場所をえらんだときは「本では、ここで〜が見られる」と言う（いま本当にいるとは言わない）
// ・虫の絵は写真をなぞらず、かたち（カブト・クワガタ・オサムシ など）と、名前や本文にある色（赤銅色・背赤・キイロ など）だけで描いたもの
// ・ほかの窓（説明の窓・パネル・ダイアログ・呼びとめ・ごほうび・ミニゲーム・ほかのイベント）の間は待つ。「あとで」で閉じたら3分は出さない。
//   同じ八ツ面山の「雲母石を探せ」（kirara.js）がまだなら、そちらを先にし、閉じてから3分あける
(() => {
  'use strict';
  const PLACES = [
    { id: 'jimen', name: '林の中の地面', icon: 'ground' },
    { id: 'kusa', name: '林のふちの草むら', icon: 'grass' },
    { id: 'jueki', name: '樹液の出る木', icon: 'sap' },
    { id: 'kinoko', name: '倒木に生えるキノコ', icon: 'log' },
    { id: 'kinoue', name: '木の上', icon: 'tree' },
  ];
  const HARU = [3, 4, 5], SHOKA = [5, 6], SHOKA_SEIKA = [5, 6, 7, 8];
  // at：本で見られる場所。when：本の季節のことば（null は書かれていない）。form・col：絵のかたちと色
  const BUGS = [
    { id: 'hime-kobusuji', name: 'ヒメコブスジコガネ', at: 'jimen', when: '春', months: HARU, note: '林内の地表をハエのように飛んでいる。成虫も幼虫も、動物や鳥の乾燥した死体に集まって食べ、分解する', form: 'kogane', col: ['#4b4741', '#2e2b27'] },
    { id: 'mikawa-osamushi', name: 'ミカワオサムシ', at: 'jimen', when: '初夏', months: SHOKA, note: '林床を はっている。この辺りの平野部のものは赤銅色だけ', form: 'osa', col: ['#9a5232', '#5e2f1b'] },
    { id: 'ookurotsuya', name: 'オオクロツヤヒラタゴミムシ', at: 'jimen', when: '初夏', months: SHOKA, note: '林床を はっている', form: 'gomi', col: ['#25272b', '#0f1012'], shine: true },
    { id: 'seaka', name: 'セアカヒラタゴミムシ', at: 'kusa', when: '初夏', months: SHOKA, note: '林のふちの草付きなどで、多く見られる', form: 'gomi', col: ['#25272b', '#0f1012'], neck: '#b8442e' },
    { id: 'atowa', name: 'アトワアオゴミムシ', at: 'kusa', when: '初夏', months: SHOKA, note: '林のふちの草付きなどで、多く見られる', form: 'gomi', col: ['#3c4a3a', '#222b21'] },
    { id: 'kubiboso', name: 'クビボソゴミムシ', at: 'kusa', when: '初夏', months: SHOKA, note: '林のふちの草付きなどで、多く見られる', form: 'kubi', col: ['#4a3a32', '#2a201b'] },
    { id: 'arame', name: 'アラメヒゲブトゴミムシダマシ', at: 'kusa', when: '初夏', months: SHOKA, note: '林のふちの草付きなどで、多く見られる', form: 'gomi', col: ['#3b302a', '#221b17'] },
    { id: 'oohiratashide', name: 'オオヒラタシデムシ', at: 'kusa', when: '初夏', months: SHOKA, note: '林のふちの草付きなどで、多く見られる', form: 'shide', col: ['#2b2b2b', '#121212'] },
    { id: 'kabuto', name: 'カブトムシ', at: 'jueki', when: '初夏から盛夏', months: SHOKA_SEIKA, note: '樹液の出る木の多いこの林には、むかしから多くいることで知られている', form: 'kabuto', col: ['#5a3220', '#331b10'] },
    { id: 'kokuwa', name: 'コクワガタ', at: 'jueki', when: '初夏から盛夏', months: SHOKA_SEIKA, note: '樹液の出る木の多いこの林には、むかしから多くいることで知られている', form: 'kuwa', col: ['#2e2622', '#16110e'] },
    { id: 'hiratakuwa', name: 'ヒラタクワガタ', at: 'jueki', when: '初夏から盛夏', months: SHOKA_SEIKA, note: '樹液の出る木の多いこの林には、むかしから多くいることで知られている', form: 'kuwa', col: ['#26241f', '#100f0d'], big: true },
    { id: 'chibikuwa', name: 'チビクワガタ', at: 'jueki', when: '初夏から盛夏', months: SHOKA_SEIKA, note: '樹液の出る木の多いこの林には、むかしから多くいることで知られている', form: 'kuwa', col: ['#2e2622', '#16110e'], small: true },
    { id: 'kinoko-akamaru', name: 'キノコアカマルエンマムシ', at: 'kinoko', when: null, months: null, note: '倒木に生えるキノコに止まる姿がみられる', form: 'maru', col: ['#3a1f1a', '#1e100d'], spot: '#c0392b' },
    { id: 'kiiro-atokiri', name: 'キイロアトキリゴミムシ', at: 'kinoue', when: null, months: null, note: '樹上を好むアトキリゴミムシの仲間', form: 'gomi', col: ['#c9a04a', '#8a6a2a'] },
  ];
  const TRIES = 3;
  let root = null, target = null, left = 0, seen = [], found = false, done = false, closedAt = 0;
  const shown = () => !!root && !root.hidden;
  const GAP = 3 * 60000;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inSeason = (b, m) => !b.months || b.months.includes(m);
  const whenText = b => b.when ? `本では ${b.when}` : '本には季節が書かれていない';

  // 虫の絵（32×32）
  function drawBug(cv, b) {
    const c = cv.getContext('2d'), W = 32;
    c.clearRect(0, 0, W, W);
    const px = (x, y, col) => { if (x >= 0 && y >= 0 && x < W && y < W) { c.fillStyle = col; c.fillRect(x, y, 1, 1); } };
    const oval = (cx, cy, rx, ry, fill, edge) => {
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
        if (d <= 1) px(x, y, d > 0.72 && edge ? edge : fill);
      }
    };
    const legs = (cx, y0, y1, w, col) => { for (let i = 0; i < 3; i++) { const y = Math.round(y0 + (y1 - y0) * (i / 2)); for (let k = 1; k <= 3; k++) { px(Math.round(cx - w - k), y + (i - 1) * (k > 1 ? 1 : 0), col); px(Math.round(cx + w + k - 1), y + (i - 1) * (k > 1 ? 1 : 0), col); } } };
    const ant = (x, y, len, col) => { for (let k = 1; k <= len; k++) { px(x - k, y - k, col); px(x + 1 + k, y - k, col); } };
    const [f, e] = b.col, L = '#3a2e26';
    const s = b.small ? 0.75 : b.big ? 1.12 : 1;
    if (b.form === 'kabuto') {
      legs(16, 15, 25, 7, L);
      oval(16, 21, 7.5, 8.5, f, e);
      oval(16, 11, 5.5, 3.5, f, e);
      for (let y = 2; y <= 8; y++) { px(15, y, e); px(16, y, e); }   // 角
      px(13, 3, e); px(14, 2, e); px(17, 2, e); px(18, 3, e);
      px(13, 20, '#8a5a40');
    } else if (b.form === 'kuwa') {
      const ry = 7 * s, rx = 5.5 * s;
      legs(16, 15, 25, rx - 1, L);
      oval(16, 22, rx, ry, f, e);
      oval(16, 12, rx * 0.95, 3, f, e);
      const jaw = Math.round(6 * s);   // 大あご：外へ ひらいて、先が内へ曲がる（2マスの太さ）
      for (let k = 0; k < jaw; k++) {
        const out = k < jaw - 2 ? Math.floor(k / 2) + 1 : Math.floor((jaw - 3) / 2) + 1 - (k - (jaw - 3));
        px(14 - out, 9 - k, e); px(13 - out, 9 - k, f); px(17 + out, 9 - k, e); px(18 + out, 9 - k, f);
      }
      px(14, 10, e); px(17, 10, e);
    } else if (b.form === 'maru') {   // 丸くて小さい・赤い紋
      legs(16, 13, 23, 7, L);
      oval(16, 17, 8, 7.5, f, e);
      oval(16, 9, 3.5, 2, f, e);
      if (b.spot) for (const [x, y] of [[12, 15], [19, 15], [13, 19], [18, 19]]) { px(x, y, b.spot); px(x + 1, y, b.spot); px(x, y + 1, b.spot); }
      px(19, 13, '#ffffff');
    } else if (b.form === 'shide') {   // ひらたい
      legs(16, 14, 24, 7, L);
      oval(16, 19, 8, 8, f, e);
      oval(16, 9, 5, 2.6, f, e);
      for (let y = 13; y < 26; y += 2) { px(12, y, e); px(20, y, e); }
      ant(15, 7, 3, L);
    } else if (b.form === 'kogane') {   // ずんぐり・こぶ
      legs(16, 14, 24, 6, L);
      oval(16, 19, 7, 8, f, e);
      oval(16, 10, 4.5, 2.6, f, e);
      for (let y = 13; y < 26; y += 3) for (const x of [12, 15, 18]) px(x + (y % 2), y, e);
    } else {   // gomi・osa・kubi：細長い（オサムシ・ゴミムシ）
      const neckW = b.form === 'kubi' ? 1.6 : 3.4, neckY = b.form === 'kubi' ? 9 : 10;
      legs(16, 14, 24, 5, L);
      oval(16, 20, b.form === 'osa' ? 5.5 : 5, 8.5, f, e);
      oval(16, neckY + 1, neckW, b.form === 'kubi' ? 3 : 2.4, b.neck || f, e);
      oval(16, neckY - 3, 2.4, 1.8, f, e);
      ant(15, neckY - 4, 4, L);
      if (b.form === 'osa') for (let y = 14; y < 27; y += 2) { px(13, y, e); px(18, y, e); }   // すじ
      if (b.shine) px(18, 15, '#9aa0a8');
    }
  }
  // 場所の絵（24×24）
  function drawPlace(cv, kind) {
    const c = cv.getContext('2d'), W = 24, px = (x, y, col) => { c.fillStyle = col; c.fillRect(x, y, 1, 1); };
    c.clearRect(0, 0, W, W);
    const fill = (x0, y0, w, h, col) => { c.fillStyle = col; c.fillRect(x0, y0, w, h); };
    if (kind === 'ground') { fill(0, 12, 24, 12, '#7a5a3a'); for (let i = 0; i < 18; i++) px((i * 7) % 24, 13 + (i * 5) % 10, i % 2 ? '#a0703a' : '#c08a3a'); fill(4, 15, 3, 2, '#b5522a'); fill(15, 19, 3, 2, '#c99a3a'); }
    else if (kind === 'grass') { fill(0, 18, 24, 6, '#6b8a3a'); for (let x = 0; x < 24; x += 2) for (let y = 6 + (x * 3) % 7; y < 18; y++) px(x, y, (x + y) % 3 ? '#4f8a2e' : '#7ab04a'); }
    else if (kind === 'sap') { fill(8, 0, 8, 24, '#6b4a2e'); fill(9, 0, 1, 24, '#8a6440'); fill(11, 8, 3, 3, '#c98a1e'); fill(12, 11, 1, 4, '#e0a83a'); fill(12, 15, 1, 1, '#f0c060'); }
    else if (kind === 'log') { fill(0, 14, 24, 7, '#6b4a2e'); fill(0, 14, 24, 1, '#8a6440'); fill(20, 14, 4, 7, '#a07850'); fill(21, 16, 2, 3, '#6b4a2e'); fill(4, 10, 6, 4, '#c0a070'); fill(6, 13, 2, 2, '#e8dcc0'); fill(12, 11, 5, 3, '#b08a5a'); }
    else { fill(10, 14, 4, 10, '#6b4a2e'); for (let y = 0; y < 15; y++) for (let x = 0; x < 24; x++) { const d = ((x - 12) / 11) ** 2 + ((y - 7) / 7.5) ** 2; if (d <= 1) px(x, y, (x * 3 + y) % 5 ? '#3f7a32' : '#5a9a44'); } }
  }

  function build() {
    root = document.createElement('div');
    root.className = 'medashi yatsumushi'; root.id = 'yatsumushi'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'イベント 八ツ面山の昆虫さがし');
    document.body.appendChild(root);
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-ym]');
      if (!b) return;
      if (b.dataset.ym === 'close') close();
      else look(b.dataset.ym);
    });
    window.addEventListener('keydown', e => { if (shown() && e.key === 'Escape') close(); });
  }
  function pickTarget(month) {
    const pool = BUGS.filter(b => inSeason(b, month));
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function open(forceTarget) {
    const G = window.nishioGo;
    if (!G || !G.yatsuMushiDue || !G.yatsuMushiDue()) return false;
    if (!root) build();
    target = (forceTarget && BUGS.find(b => b.id === forceTarget)) || pickTarget(new Date().getMonth() + 1);
    left = TRIES; seen = []; found = false; done = false;
    const book = G.yatsuMushiSeen ? G.yatsuMushiSeen() : [];
    root.innerHTML = `<div class="md-card ym-card"><p class="md-head">🪲 イベント：八ツ面山の昆虫さがし</p>
      <p class="md-say">虫にくわしい人「八ツ面山の林は、落葉樹と常緑樹にスギも混ざって、コウチュウの なかまが いろいろ見られるだよ。西尾の自然の本を見ながら、きょうは この虫を探してみりん」</p>
      <div class="ym-target"><canvas width="32" height="32" aria-hidden="true"></canvas><div><b>${esc(target.name)}</b><br><small>${esc(whenText(target))}${book.includes(target.id) ? '・虫手帳にある虫' : ''}</small></div></div>
      <p class="ym-left">どこを探す？ のこり <b>${left}</b> 回</p>
      <div class="ym-places">${PLACES.map(p => `<button type="button" class="ym-place" data-ym="${p.id}"><canvas width="24" height="24" aria-hidden="true"></canvas><small>${esc(p.name)}</small></button>`).join('')}</div>
      <ul class="ym-log"></ul>
      <p class="md-res" hidden></p>
      <button type="button" class="btn mini md-close" data-ym="close">あとで</button></div>`;
    drawBug(root.querySelector('.ym-target canvas'), target);
    root.querySelectorAll('.ym-place canvas').forEach((cv, i) => drawPlace(cv, PLACES[i].icon));
    root.hidden = false;
    if (G.track) G.track('yatsumushi_open', { target: target.id });
    return true;
  }
  // えらんだ場所で、本に書かれている虫を1ぴき見る（きょうの虫の場所なら、その虫。ちがえば、その場所の虫から まだ見ていないもの・季節のもの を先に）
  function look(placeId) {
    if (done || !target || left <= 0) return;
    const p = PLACES.find(x => x.id === placeId);
    const btn = p && root.querySelector(`.ym-place[data-ym="${p.id}"]`);
    if (!btn || btn.disabled) return;
    btn.disabled = true; left--;
    const G = window.nishioGo, book = G.yatsuMushiSeen ? G.yatsuMushiSeen() : [], m = new Date().getMonth() + 1;
    let b;
    if (p.id === target.at) { b = target; found = true; }
    else {
      const here = BUGS.filter(x => x.at === p.id).sort((a, z) => (book.includes(a.id) - book.includes(z.id)) || (inSeason(z, m) - inSeason(a, m)) || (Math.random() - 0.5));
      b = here[0];
    }
    if (b && !seen.includes(b.id)) seen.push(b.id);
    const li = document.createElement('li');
    li.className = found && b === target ? 'hit' : '';
    li.innerHTML = `<canvas width="32" height="32" aria-hidden="true"></canvas><span><b>${esc(p.name)}</b>：本では、ここで <b>${esc(b.name)}</b> が見られる（${esc(b.when || '季節は書かれていない')}）。${esc(b.note)}${book.includes(b.id) ? '' : ' <em>はじめて！</em>'}</span>`;
    drawBug(li.querySelector('canvas'), b);
    root.querySelector('.ym-log').appendChild(li);
    root.querySelector('.ym-left b').textContent = left;
    if (found || left <= 0) finish();
  }
  function finish() {
    done = true;
    root.querySelectorAll('.ym-place').forEach(x => { x.disabled = true; });
    const G = window.nishioGo, r = G && G.yatsuMushiReward ? G.yatsuMushiReward(found, seen) : { pts: 0, fresh: false, newOnes: 0, total: 0 };
    const where = PLACES.find(x => x.id === target.at);
    const res = root.querySelector('.md-res');
    res.innerHTML = `<b>${found ? `見つけた！ ${esc(target.name)}` : 'ざんねん'}</b>${found ? '' : `　本では「${esc(where.name)}」で見られる虫だった`}<br>${r.pts ? `+${r.pts}pt　` : ''}${r.newOnes ? `虫手帳に ${r.newOnes}ぴき ふえた　` : ''}虫手帳 ${r.total}/${BUGS.length}${r.fresh ? '<br><small>📒 八ツ面山の虫の まちメモが ふえました（出典：西尾の自然の本 335〜336ページ）</small>' : ''}`;
    res.hidden = false;
    root.querySelector('.md-close').textContent = 'とじる';
  }
  function close() { if (root && !root.hidden) { root.hidden = true; closedAt = Date.now(); } }
  function here(at) {   // at：テスト用に場所をわたす
    const G = window.nishioGo, me = at || (G && G.me);
    if (!me) return false;
    return ['yatsuomote', 'kumaku-jinja'].some(id => { const s = (G.spots || []).find(x => x.id === 'f-' + id); return !!s && G.dist(me, s) <= 350; });
  }
  // 2秒ごとに、八ツ面山の近くにいるか確かめる（ほかの窓・閉じてすぐ・雲母石がまだ／閉じてすぐ の間は待つ）
  function tick() {
    const G = window.nishioGo, P = window.nishioPixel, K = window.NISHIO_KIRARA;
    if (!G || !P || shown() || !G.yatsuMushiDue || !G.yatsuMushiDue() || Date.now() - closedAt < GAP) return;
    if (document.querySelector('.medashi:not([hidden])') || document.body.classList.contains('jump-open') || (G.rewardSoon && G.rewardSoon())) return;
    if ((P.mapCovered && P.mapCovered()) || (P.sightBusy && P.sightBusy())) return;
    if (K && ((G.kiraraHas && !G.kiraraHas('yatsuomote')) || Date.now() - (K.closedAt || 0) < GAP)) return;
    if (here()) open();
  }
  setInterval(tick, 2000);
  // テスト用
  window.NISHIO_YATSUMUSHI = { PLACES, BUGS, open, look, close, tick, here, drawBug, get shown() { return shown(); }, get target() { return target && target.id; }, get left() { return left; }, get found() { return found; }, get done() { return done; } };
})();
