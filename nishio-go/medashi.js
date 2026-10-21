// にしおさんぽGO：田んぼのイベント「芽出しの見きわめ」
// ・ドット絵の地図で田んぼ（となりも）を歩いていると、1日1回、田んぼの人に呼びとめられる（pixel.js の critterStep。15歩で始まる）
// ・芽を出させた（催芽した）種もみが3つ。「苗づくりに いちばんよいのは？」と聞かれて、1つえらぶ
//   OK（芽と根が少しふくらんだ）＝正解 +20pt／ギリギリOK＝+10pt／伸び過ぎ＝0pt。どれをえらんでも、わけを話してくれて、米づくりの まちメモ（kome.js）が手に入る
// ・ことばは kome.js（運営者から受けとった 農文協の米づくりの本 2ページ「種籾」）に書いてある中身だけ。3つの名前（伸び過ぎ・ギリギリOK・OK）も本のとおり
// ・種もみの絵は、本の写真をなぞらず、ここで描いたもの（だ円のもみに、白い芽の長さだけを変える）。ごほうびは game.js の medashiReward（1日1回）
(() => {
  'use strict';
  // kind：絵の芽の長さ。pts：もらえるポイント。say：えらんだあとの田んぼの人のことば
  const SEEDS = [
    { id: 'ok', name: 'OK', look: '芽と根が、いっしょに少しだけ ふくらんでいる', kind: 0, pts: 20,
      say: 'そう、それ！ 芽と根が いっしょに少しふくらんだのが いちばんええ。根がよう張って、ひょろ長くなりにくい苗に育つだよ。' },
    { id: 'girigiri', name: 'ギリギリOK', look: '芽が、少し大きく ふくらんでいる', kind: 1, pts: 10,
      say: 'ぎりぎり大丈夫じゃん。でも いちばんは、芽と根が いっしょに少しだけ ふくらんだもの。根がよう張る苗になるでね。' },
    { id: 'nobisugi', name: '伸び過ぎ', look: '芽が、長く 伸びている', kind: 2, pts: 0,
      say: 'それは伸び過ぎだに。酸素が足りんまま芽を出させたり、温める時間が長すぎたりすると、芽だけ伸びて 根の張りが悪くなりやすいだよ。' },
  ];
  let root = null, order = [], done = false, lastOpen = 0;   // lastOpen：「あとで」で閉じたら、5分は出さない

  // 種もみの絵（24×32 のドット。だ円のもみ・たてのすじ・上に白い芽）
  function drawSeed(cv, kind) {
    const c = cv.getContext('2d'), W = 24, H = 32;
    c.clearRect(0, 0, W, H);
    const cx = 12, cy = 20, rx = 7, ry = 10;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d > 1) continue;
      const edge = d > 0.72;
      c.fillStyle = edge ? '#9c7b3c' : (x === cx - 3 || x === cx + 2) ? '#cfb478' : x < cx - 2 ? '#f3e2b0' : '#e6cf92';
      c.fillRect(x, y, 1, 1);
    }
    c.fillStyle = '#ffffff';
    if (kind === 0) { c.fillRect(11, 9, 2, 2); c.fillRect(13, 10, 1, 1); }   // 芽と根が少しふくらむ
    else if (kind === 1) { c.fillRect(10, 8, 4, 3); c.fillRect(9, 9, 1, 2); c.fillRect(11, 7, 2, 1); }   // 少し大きくふくらむ
    else { c.fillRect(11, 8, 2, 3); for (let i = 0; i < 7; i++) c.fillRect(10 - i, 7 - Math.floor(i / 2), 2, 1); c.fillRect(13, 9, 3, 1); c.fillRect(15, 10, 2, 1); }   // 芽が長く伸びる
    c.fillStyle = '#d8d8d0';
    if (kind === 2) c.fillRect(3, 4, 1, 1);
  }

  function build() {
    root = document.createElement('div');
    root.className = 'medashi'; root.id = 'medashi'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'イベント 芽出しの見きわめ');
    document.body.appendChild(root);
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-md]');
      if (!b) return;
      if (b.dataset.md === 'close') close();
      else pick(b.dataset.md);
    });
    window.addEventListener('keydown', e => { if (root && !root.hidden && e.key === 'Escape') close(); });
  }
  function open() {
    const G = window.nishioGo;
    if (!G || !G.medashiDue || !G.medashiDue() || Date.now() - lastOpen < 5 * 60000) return false;
    if (document.body.classList.contains('jump-open')) return false;   // ミニゲームの最中は出さない
    const rw = document.getElementById('reward');
    if (rw && rw.classList.contains('show')) return false;   // ごほうびの画面の上には出さない
    if (!root) build();
    order = SEEDS.slice().sort(() => Math.random() - 0.5);
    done = false; lastOpen = Date.now();
    root.innerHTML = `<div class="md-card"><p class="md-head">📜 イベント：芽出しの見きわめ</p>
      <p class="md-say">田んぼの人「ちょっと見てってくれん？ 苗をつくる前に、種もみの芽を出させる（催芽）だよ。この3つのうち、苗づくりに いちばんええのは どれだと思う？」</p>
      <div class="md-seeds">${order.map(s => `<button type="button" class="md-seed" data-md="${s.id}" aria-label="${s.look}"><canvas width="24" height="32"></canvas><small>${s.look}</small></button>`).join('')}</div>
      <p class="md-res" hidden></p>
      <button type="button" class="btn mini md-close" data-md="close">あとで</button></div>`;
    root.querySelectorAll('.md-seed canvas').forEach((cv, i) => drawSeed(cv, order[i].kind));
    root.hidden = false;
    if (G.track) G.track('medashi_open', {});
    return true;
  }
  function pick(id) {
    if (done) return;
    const s = SEEDS.find(x => x.id === id), G = window.nishioGo;
    if (!s) return;
    done = true;
    const r = G && G.medashiReward ? G.medashiReward(s.id, s.pts) : { pts: 0, fresh: false }, pts = r.pts;
    root.querySelectorAll('.md-seed').forEach(b => { const x = SEEDS.find(y => y.id === b.dataset.md); b.disabled = true; b.classList.add(x.id === 'ok' ? 'right' : x.id === id ? 'wrong' : 'other'); b.querySelector('small').textContent = `${x.name}：${x.look}`; });
    const res = root.querySelector('.md-res');
    res.innerHTML = `<b>${s.id === 'ok' ? '正解！' : s.id === 'girigiri' ? 'おしい！' : 'ざんねん'}</b> ${s.say}${pts ? `<br>+${pts}pt` : ''}${r.fresh ? '<br><small>📒 米づくりの まちメモが ふえました（出典：農文協の米づくりの本）</small>' : ''}`;
    res.hidden = false;
    root.querySelector('.md-close').textContent = 'とじる';
  }
  function close() { if (root) root.hidden = true; }

  // テスト用：開く・えらぶ・ようすを見る
  window.NISHIO_MEDASHI = { open, close, pick, SEEDS, get shown() { return !!root && !root.hidden; }, get order() { return order.map(s => s.id); } };
})();
