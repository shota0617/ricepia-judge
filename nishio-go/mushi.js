// にしおさんぽGO：水べのイベント「虫の名前あて」
// ・ドット絵の地図で水べ（となりが水）を歩いていると、1日1回、虫を見ていた人に呼びとめられる（pixel.js の critterStep。15歩で始まる）
// ・3問。虫の名前が出て、3びきの絵から その虫を えらぶ。名前の中に見た目のヒントがある（ミスジ＝3本のすじ など）
//   当たった数で 0・6・12・20pt と、西尾の自然の本にのっている虫の まちメモ（shizen.js の mushi）。ごほうびは game.js の mushiReward（1日1回）
// ・虫の名前は、運営者から受けとった西尾の自然の本の331ページ（図5-3-159〜173）の写真の下の名前のとおり
// ・虫の絵は本の写真をなぞらず、名前があらわす見た目（すじ・星・色・丸さ・首の長さ）だけを ここで描いたもの。
//   名前のヒントの読み（ミスジ＝三筋 など）は ことばの意味で、本に書いてあることではない
(() => {
  'use strict';
  // hint：名前の中の見た目のヒント。look：絵の見た目（画面読み上げ用。名前は言わない）。not：この虫を問うとき、まちがいの絵に出さない虫（ヒントが同じように当てはまるもの）
  const BUGS = [
    { id: 'misuji', name: 'ミスジキイロテントウ', hint: 'ミスジ＝3本のすじ、キイロ＝黄色', look: '黄色い丸い体に、黒い すじが3本', not: [] },
    { id: 'mutsuboshi', name: 'ムツボシツヤコツブゲンゴロウ', hint: 'ムツボシ＝6つの星（てん）、ツヤ＝つやつや、コツブ＝小つぶ', look: '小さな茶色い体に、うすい色の てんが6つ。つやがある', not: ['samehada'] },
    { id: 'haiiro', name: 'ハイイロゲンゴロウ', hint: 'ハイイロ＝灰色', look: '灰色の、たて長の体', not: [] },
    { id: 'oomaru', name: 'オオマルケシゲンゴロウ', hint: 'オオマル＝大きくて丸い', look: '大きくて丸い、黒い体。つやがある', not: ['samehada', 'misuji'] },
    { id: 'samehada', name: 'サメハダマルケシゲンゴロウ', hint: 'サメハダ＝さめの はだのように ざらざら（つぶつぶ）', look: '丸い茶色の体に、こまかい つぶつぶ', not: ['mutsuboshi'] },
    { id: 'kubinaga', name: 'ナガサキクビナガゴミムシ', hint: 'クビナガ＝首が長い', look: '細い体に、長い首と小さい頭', not: [] },
  ];
  const ROUNDS = 3;
  // Blender で焼いた絵のシート（tools/blender/mushi-art.py → nishio-go/art/ev/）。読みこめたら、手描きの絵の上に描きなおす（読みこむまで・読めないときは手描きのまま）
  const SHEET_SRC = 'nishio-go/art/ev/bugs.png', SHEET_N = 32;
  let sheet = null;
  function paintSheet(cv, idx) {
    if (idx < 0) return;
    if (!sheet) { sheet = new Image(); sheet.src = SHEET_SRC; }
    const go = () => { if (!sheet.naturalWidth) return; const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.clearRect(0, 0, cv.width, cv.height); c.drawImage(sheet, idx * SHEET_N, 0, SHEET_N, SHEET_N, 0, 0, cv.width, cv.height); };
    if (sheet.complete && sheet.naturalWidth) go(); else sheet.addEventListener('load', go, { once: true });
  }
  const BUG_SHEET = ['misuji', 'mutsuboshi', 'haiiro', 'oomaru', 'samehada', 'kubinaga', 'hime-kobusuji', 'mikawa-osamushi', 'ookurotsuya', 'seaka', 'atowa', 'kubiboso', 'arame', 'oohiratashide', 'kabuto', 'kokuwa', 'hiratakuwa', 'chibikuwa', 'kinoko-akamaru', 'kiiro-atokiri'];   // シートの並び（mushi-art.py の BUGS）
  let root = null, qs = [], qi = 0, right = 0, answered = false, done = false, lastOpen = 0;   // lastOpen：開いた・閉じた時刻（閉じてから5分は出さない）

  // 虫の絵（32×32 のドット）。だ円の体・頭・6本の足に、名前があらわす もようだけを足す
  function drawBug(cv, id) {
    const c = cv.getContext('2d'), W = 32;
    c.clearRect(0, 0, W, W);
    const px = (x, y, col) => { c.fillStyle = col; c.fillRect(x, y, 1, 1); };
    const oval = (cx, cy, rx, ry, fill, edge) => {
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
        if (d <= 1) px(x, y, d > 0.7 && edge ? edge : fill);
      }
    };
    const legs = (cx, top, h, w, col) => {   // 左右に3本ずつ
      for (let i = 0; i < 3; i++) {
        const y = Math.round(top + h * (0.2 + i * 0.3));
        for (let k = 1; k <= 3; k++) { px(Math.round(cx - w - k), y + (i - 1) * (k > 1 ? 1 : 0), col); px(Math.round(cx + w + k - 1), y + (i - 1) * (k > 1 ? 1 : 0), col); }
      }
    };
    const shine = (x, y) => { px(x, y, '#ffffff'); px(x + 1, y, '#e8e8e8'); px(x, y + 1, '#e8e8e8'); };
    if (id === 'kubinaga') {   // 細い体に、長い首と小さい頭
      legs(16, 15, 12, 3, '#4a3a30');
      oval(16, 21, 3.6, 7, '#3a2a22', '#22180f');
      for (let y = 8; y <= 13; y++) { px(15, y, '#5a3a2a'); px(16, y, '#5a3a2a'); }
      oval(16, 6, 2.2, 2.2, '#4a3226', '#22180f');
      for (let k = 1; k <= 4; k++) { px(14 - k, 5 - k, '#4a3a30'); px(17 + k, 5 - k, '#4a3a30'); }
      return;
    }
    const P = {
      misuji: { rx: 9, ry: 9.5, fill: '#efd25a', edge: '#b8962a', head: '#c97a3c' },
      mutsuboshi: { rx: 6, ry: 8, fill: '#6b3b1e', edge: '#3d200e', head: '#7a4a28' },
      haiiro: { rx: 7.5, ry: 10, fill: '#8f948c', edge: '#5d625b', head: '#7b8079' },
      oomaru: { rx: 11, ry: 11, fill: '#1f1b19', edge: '#0c0a09', head: '#2a2420' },
      samehada: { rx: 8.5, ry: 8.5, fill: '#7d5c33', edge: '#4f3a1f', head: '#8a6a3e' },
    }[id];
    const cy = 18;
    legs(16, cy - P.ry, P.ry * 2, P.rx - 1, '#4a3a30');
    oval(16, cy - P.ry - 1.5, Math.max(3, P.rx * 0.45), 2.6, P.head, null);   // 頭
    oval(16, cy, P.rx, P.ry, P.fill, P.edge);
    for (let y = Math.round(cy - P.ry + 2); y < cy + P.ry - 1; y++) px(15, y, P.edge);   // 羽のあわせめ
    if (id === 'misuji') {   // 黒い すじ3本（たて）
      for (let y = 0; y < W; y++) for (const sx of [10, 15, 20]) {
        const d = ((sx + 0.5 - 16) / P.rx) ** 2 + ((y + 0.5 - cy) / P.ry) ** 2;
        if (d < 0.8 && y > cy - P.ry + 2) { px(sx, y, '#1f1b19'); px(sx + 1, y, '#1f1b19'); }
      }
    } else if (id === 'mutsuboshi') {   // うすい色の てん6つ・つや
      for (const [x, y] of [[12, 13], [19, 13], [12, 18], [19, 18], [13, 22], [18, 22]]) { px(x, y, '#ecd59a'); px(x + 1, y, '#ecd59a'); px(x, y + 1, '#ecd59a'); px(x + 1, y + 1, '#ecd59a'); }
      shine(17, 11);
    } else if (id === 'oomaru') {
      shine(20, 11); px(22, 12, '#9a9a9a');
    } else if (id === 'samehada') {   // ざらざらの つぶ
      for (let y = Math.round(cy - P.ry + 2); y < cy + P.ry - 1; y += 2) for (let x = 9 + (y % 4 ? 1 : 0); x < 24; x += 2) {
        const d = ((x + 0.5 - 16) / P.rx) ** 2 + ((y + 0.5 - cy) / P.ry) ** 2;
        if (d < 0.7) px(x, y, '#4f3a1f');
      }
    } else if (id === 'haiiro') {
      for (let y = 12; y < 26; y += 3) { px(12, y, '#a9aea6'); px(19, y + 1, '#a9aea6'); }
    }
  }

  function build() {
    root = document.createElement('div');
    root.className = 'medashi mushi'; root.id = 'mushi'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'イベント 虫の名前あて');
    document.body.appendChild(root);
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-mu]');
      if (!b) return;
      if (b.dataset.mu === 'close') close();
      else if (b.dataset.mu === 'next') next();
      else pick(b.dataset.mu);
    });
    window.addEventListener('keydown', e => { if (root && !root.hidden && e.key === 'Escape') close(); });
  }
  const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
  // 3問ぶん：問う虫はかぶらない。まちがいの絵は、ヒントが当てはまってしまう虫を のぞいた中から2ひき
  function makeQuiz() {
    return shuffle(BUGS).slice(0, ROUNDS).map(t => {
      const others = shuffle(BUGS.filter(b => b.id !== t.id && !t.not.includes(b.id))).slice(0, 2);
      return { t, opts: shuffle([t, ...others]) };
    });
  }
  function open() {
    const G = window.nishioGo;
    if (!G || !G.mushiDue || !G.mushiDue() || Date.now() - lastOpen < 5 * 60000) return false;
    if (document.body.classList.contains('jump-open') || document.querySelector('.medashi:not([hidden])')) return false;   // ミニゲーム・ほかのイベントの最中は出さない
    const rw = document.getElementById('reward');
    if ((rw && rw.classList.contains('show')) || (G.rewardSoon && G.rewardSoon())) return false;   // ごほうびの画面・出るのを待つ ごほうび・予約した袋やムービーがあるときは待つ
    if (!root) build();
    qs = makeQuiz(); qi = 0; right = 0; done = false; lastOpen = Date.now();
    root.hidden = false;
    render();
    if (G.track) G.track('mushi_open', {});
    return true;
  }
  function render() {
    const q = qs[qi];
    answered = false;
    root.innerHTML = `<div class="md-card"><p class="md-head">🪲 イベント：虫の名前あて <small>${qi + 1}/${ROUNDS}</small></p>
      <p class="md-say">${qi === 0 ? '水べで虫を見ていた人「西尾の自然の本には、虫が いろいろ 写真で のっとるよ。名前に見た目のヒントがあるで、当ててみりん」<br>' : ''}<b>「${q.t.name}」は どれ？</b></p>
      <div class="md-seeds mu-bugs">${q.opts.map(b => `<button type="button" class="md-seed mu-bug" data-mu="${b.id}" aria-label="虫の絵 ${q.opts.indexOf(b) + 1}：${b.look}"><canvas width="32" height="32"></canvas><small>？</small></button>`).join('')}</div>
      <p class="md-res" hidden></p>
      <div class="mu-foot"><button type="button" class="btn mini mu-next" data-mu="next" hidden>${qi + 1 < ROUNDS ? 'つぎの虫' : 'けっか'}</button>
      <button type="button" class="btn mini md-close" data-mu="close">あとで</button></div></div>`;
    root.querySelectorAll('.mu-bug canvas').forEach((cv, i) => { drawBug(cv, q.opts[i].id); paintSheet(cv, BUG_SHEET.indexOf(q.opts[i].id)); });
  }
  function pick(id) {
    if (answered || done || !qs[qi]) return;
    const q = qs[qi], ok = id === q.t.id;
    if (!q.opts.some(b => b.id === id)) return;
    answered = true;
    if (ok) right++;
    root.querySelectorAll('.mu-bug').forEach(b => {
      const x = BUGS.find(y => y.id === b.dataset.mu);
      b.disabled = true; b.classList.add(x.id === q.t.id ? 'right' : x.id === id ? 'wrong' : 'other');
      b.querySelector('small').textContent = x.name;
    });
    const res = root.querySelector('.md-res');
    res.innerHTML = `<b>${ok ? '正解！' : 'ざんねん'}</b> 名前のヒント：${q.t.hint}`;
    res.hidden = false;
    root.querySelector('.mu-next').hidden = false;
  }
  function next() {
    if (!answered || done) return;
    if (++qi < ROUNDS) return render();
    finish();
  }
  function finish() {
    done = true;
    const G = window.nishioGo, r = G && G.mushiReward ? G.mushiReward(right) : { pts: 0, fresh: false };
    root.innerHTML = `<div class="md-card"><p class="md-head">🪲 イベント：虫の名前あて</p>
      <p class="md-say">${right}/${ROUNDS} 当たり！ 水べで虫を見ていた人「${right === ROUNDS ? 'ぜんぶ当たりだがね！' : right ? 'ええ線いっとるよ。' : 'むずかしかったかね。'} 名前を知っとると、見つけたとき うれしいでね」</p>
      <p class="md-res">${r.pts ? `+${r.pts}pt` : 'ポイントなし'}${r.fresh ? '<br><small>📒 西尾の自然の本にのっている虫の まちメモが ふえました（出典：西尾の自然の本 331ページ）</small>' : ''}</p>
      <button type="button" class="btn mini md-close" data-mu="close">とじる</button></div>`;
  }
  function close() { if (root && !root.hidden) { root.hidden = true; lastOpen = Date.now(); } }   // 「あとで」で閉じた時刻から5分は出さない

  // テスト用：開く・えらぶ・つぎへ・ようすを見る
  window.NISHIO_MUSHI = { open, close, pick, next, BUGS, get shown() { return !!root && !root.hidden; }, get q() { return qs[qi] ? { target: qs[qi].t.id, opts: qs[qi].opts.map(b => b.id) } : null; }, get right() { return right; }, get done() { return done; } };
})();
