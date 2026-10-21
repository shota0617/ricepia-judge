// にしおさんぽGO：イベント「雲母石を探せ」
// ・八ツ面山・寺部・愛知こどもの国の近くに来ると（場所ごとに1回）、その土地の人に呼びとめられ、石の山から雲母石を探す。
//   20個の石のうち1つが雲母石で、ときどき きらっと光る。見つけると +15pt（1回目で見つけたら +20pt）と、その場所の まちメモ（shizen.js の kirara・kirara-ryoke）。
//   3か所ぜんぶで見つけると、もう +30pt（game.js の kiraraFound）
// ・話の中身は shizen.js の頭に書いた出典だけ：八ツ面山で雲母がとれた・吉良荘の名前のもと という言い伝え（西尾市の資料）、
//   寺部・こどもの国の岩の名前に「黒雲母」が入っていること（浅見ほか、1982 に加筆した地質図の凡例）。地質図の絵はなぞらない
// ・石と雲母石の絵は、ここで描いたもの（写真や図をなぞらない）
// ・ほかの窓（説明の窓・パネル・ダイアログ・呼びとめ・ごほうび・ミニゲーム・ほかのイベント）の間は待つ（本のできごと bookev.js と同じ）。
//   「あとで」で閉じたら、3分は出さない
(() => {
  'use strict';
  const PLACES = [
    { id: 'yatsuomote', name: '八ツ面山', spots: ['yatsuomote', 'kumaku-jinja'], r: 350, tone: ['#8a7356', '#a08a6a', '#6f5c45'],
      who: '山の近くの人', say: '八ツ面山では むかし雲母（うんも）がとれた、といわれとるよ。吉良荘という名前も、それに ちなむ といわれとる。この石の山にも、雲母石が まじっとるかもしれん',
      facts: ['z:kirara:0', 'z:kirara:1'] },
    { id: 'terabe', name: '寺部', spots: ['terabe-jo', 'terabe-beach'], r: 400, tone: ['#8d9190', '#a7aaa6', '#727674'],
      who: '海べの人', say: 'このへんの岩は、地質図だと「片麻状黒雲母角閃石石英閃緑岩」という長い名前でね。名前に「黒雲母」が入っとるだよ。雲母石を探してみりん',
      facts: ['z:kirara-ryoke:0'] },
    { id: 'kodomo', name: '愛知こどもの国', spots: ['aichi-kodomo', 'kodomonokuni-st'], r: 500, tone: ['#93918a', '#aeaca4', '#77756e'],
      who: '公園の人', say: 'こどもの国のあたりの岩も、寺部と同じ名前の岩。地質図には、ほかにも名前に雲母が入る岩が のっとるよ。ここでも探してみて',
      facts: ['z:kirara-ryoke:0', 'z:kirara-ryoke:1'] },
  ];
  const N = 20;
  let root = null, cur = null, mica = -1, tries = 0, found = false, closedAt = 0;
  const shown = () => !!root && !root.hidden;
  const GAP = 3 * 60000;

  // 石の絵（24×24）。seed で形と色の まだらを変える。mica は うすい銀色の板が重なった石
  function drawStone(cv, tone, seed, isMica) {
    const c = cv.getContext('2d'), W = 24;
    c.clearRect(0, 0, W, W);
    let s = seed * 9301 + 49297;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const rx = 7 + rnd() * 3, ry = 5 + rnd() * 3, cx = 12, cy = 14;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 + (rnd() - 0.5) * 0.15;
      if (d > 1) continue;
      let col = d > 0.75 ? tone[2] : y < cy - ry * 0.3 && x < cx ? tone[1] : tone[0];
      if (isMica && d <= 0.75) col = (x + y * 2) % 5 === 0 ? '#e9ecef' : (y % 3 === 0 ? '#c9ced3' : '#b3b9bf');   // 銀色の うすい層
      else if (rnd() < 0.08) col = tone[2];
      c.fillStyle = col; c.fillRect(x, y, 1, 1);
    }
  }

  function build() {
    root = document.createElement('div');
    root.className = 'medashi kirara'; root.id = 'kirara'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'イベント 雲母石を探せ');
    document.body.appendChild(root);
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-kr]');
      if (!b) return;
      if (b.dataset.kr === 'close') close();
      else tap(+b.dataset.kr);
    });
    window.addEventListener('keydown', e => { if (shown() && e.key === 'Escape') close(); });
  }
  function open(pl) {
    const G = window.nishioGo;
    if (!G || !G.kiraraFound || (G.kiraraHas && G.kiraraHas(pl.id))) return false;
    if (!root) build();
    cur = pl; tries = 0; found = false; mica = Math.floor(Math.random() * N);
    const seed0 = Math.floor(Math.random() * 1000);
    root.innerHTML = `<div class="md-card kr-card"><p class="md-head">✨ イベント：雲母石を探せ（${pl.name}）</p>
      <p class="md-say">${pl.who}「${pl.say}」</p>
      <p class="kr-hint">日の光で、ときどき <b>きらっ</b> と光る石があるよ。その石をタップ！</p>
      <div class="kr-grid">${Array.from({ length: N }, (_, i) => `<button type="button" class="kr-stone${i === mica ? ' mica' : ''}" data-kr="${i}" aria-label="石 ${i + 1}" style="--d:${(Math.random() * 1.4).toFixed(2)}s"><canvas width="24" height="24"></canvas></button>`).join('')}</div>
      <p class="md-res" hidden></p>
      <button type="button" class="btn mini md-close" data-kr="close">あとで</button></div>`;
    root.querySelectorAll('.kr-stone canvas').forEach((cv, i) => drawStone(cv, pl.tone, seed0 + i, false));   // 見つけるまでは、ほかの石と同じ見た目（光るだけ）
    root.hidden = false;
    if (G.track) G.track('kirara_open', { at: pl.id });
    return true;
  }
  function tap(i) {
    if (found || !cur || !(i >= 0 && i < N)) return;
    const b = root.querySelector(`.kr-stone[data-kr="${i}"]`);
    if (!b || b.disabled) return;
    tries++;
    if (i !== mica) { b.disabled = true; b.classList.add('plain'); b.setAttribute('aria-label', `石 ${i + 1}：ただの石`); return; }
    found = true;
    drawStone(b.querySelector('canvas'), cur.tone, 7, true);
    b.classList.add('got');
    root.querySelectorAll('.kr-stone').forEach(x => { x.disabled = true; });
    const G = window.nishioGo, r = G.kiraraFound(cur.id, tries === 1, cur.facts, PLACES.length) || { pts: 0, n: 0 };
    const res = root.querySelector('.md-res');
    res.innerHTML = `<b>見つけた！ 雲母石</b>${tries === 1 ? '（1回目で！）' : `（${tries}回目）`}<br>${r.pts ? `+${r.pts}pt　` : ''}雲母石 ${r.n}/${PLACES.length}${r.all ? '　✨ ぜんぶの場所で見つけた！' : ''}${r.fresh ? '<br><small>📒 雲母の まちメモが ふえました（出典：西尾市の資料・西尾の自然の本の地質図）</small>' : ''}`;
    res.hidden = false;
    root.querySelector('.md-close').textContent = 'とじる';
  }
  function close() { if (root) root.hidden = true; closedAt = Date.now(); cur = null; }
  function here(pl, at) {   // at：テスト用に場所をわたす（ふだんは いまの位置）
    const G = window.nishioGo, me = at || (G && G.me);
    if (!me) return false;
    return pl.spots.some(id => { const s = (G.spots || []).find(x => x.id === 'f-' + id); return !!s && G.dist(me, s) <= pl.r; });
  }
  // 2秒ごとに、いまいる所で まだ見つけていない場所を探す（ほかの窓が出ている間・閉じてすぐは待つ）
  function tick() {
    const G = window.nishioGo, P = window.nishioPixel;
    if (!G || !P || shown() || Date.now() - closedAt < GAP) return;
    if (document.querySelector('.medashi:not([hidden])') || document.body.classList.contains('jump-open') || (G.rewardSoon && G.rewardSoon())) return;
    if ((P.mapCovered && P.mapCovered()) || (P.sightBusy && P.sightBusy())) return;
    const pl = PLACES.find(p => !(G.kiraraHas && G.kiraraHas(p.id)) && here(p));
    if (pl) open(pl);
  }
  setInterval(tick, 2000);
  // テスト用
  window.NISHIO_KIRARA = { PLACES, open, tap, close, tick, here, get shown() { return shown(); }, get mica() { return mica; }, get found() { return found; } };
})();
