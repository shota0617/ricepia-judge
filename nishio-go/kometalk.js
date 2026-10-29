// お米つぶの おはなし（案内役・10/29 店主「素朴な かわいい キャラクターとの 会話で ゲームが 進むように」）。
// 主人公の お米つぶが 話しかけて、つぎの 行き先を いっしょに 決める。町の人の 話と 同じ 黒い わく（.dq）で、左に お米の 顔。
// タップで つぎへ。さいごの ページに えらぶ ボタンが あれば、えらんだ 答えで ゲームが 進む（行き先が かわる）。
// せっていで オフに できる（オフの 人には、いままでどおり 下の 小さな 知らせだけ）。
(function (root) {
  const KEY = 'nsg_kome_talk';   // '0' なら オフ
  const q = [];
  let box, cv, sayEl, srEl, chEl, nextEl, cur = null, page = 0, typing = 0, full = '', closeT = 0, back = null, mem = null;   // mem：この ページで えらんだ オン・オフ（保存できない ブラウザでも 守る）
  const calm = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function on() { if (mem !== null) return mem; try { return localStorage.getItem(KEY) !== '0'; } catch (e) { return true; } }
  function setOn(v) { mem = !!v; try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { /* なしで続ける */ } if (!v) { q.length = 0; hide(); } }
  function build() {
    if (box) return;
    box = document.createElement('div');
    box.className = 'kome-talk'; box.id = 'komeTalk'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'お米つぶの おはなし');
    box.innerHTML = '<div class="dq"><canvas width="48" height="40" aria-hidden="true"></canvas><div class="kt-body"><b class="kt-name">お米つぶ</b>'
      + '<p class="kt-say"></p><p class="kt-sr" aria-live="polite"></p><div class="kt-ch"></div><button type="button" class="kt-next">▼ つぎへ</button></div>'
      + '<button type="button" class="kt-x" aria-label="おはなしを とじる">✕</button></div>';
    document.body.append(box);
    cv = box.querySelector('canvas'); sayEl = box.querySelector('.kt-say'); srEl = box.querySelector('.kt-sr'); chEl = box.querySelector('.kt-ch'); nextEl = box.querySelector('.kt-next');
    box.addEventListener('click', e => {
      e.stopPropagation();
      const c = e.target.closest('[data-kt]');
      if (c) { pick(+c.dataset.kt); return; }
      if (e.target.closest('.kt-x')) { done(-1); return; }
      if (typing) { finishType(); return; }
      if (!chEl.children.length) step();
    });
    box.addEventListener('keydown', () => clearTimeout(closeT));   // キーで 読んでいる 人の 前で 勝手に とじない
  }
  // 顔：歩く地図の お米と 同じ 描き方（まだ 絵が できていなければ 🍚）
  function face(mood) {
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, 48, 40);
    const P = root.nishioPixel;
    if (!(P && P.drawRice && P.drawRice(g, 24, 22, 0, 0, mood || 'smile'))) { g.font = '26px sans-serif'; g.textAlign = 'center'; g.fillText('🍚', 24, 30); }
  }
  function finishType() { clearInterval(typing); typing = 0; sayEl.textContent = full; afterType(); }
  function afterType() {
    const last = page === cur.pages.length - 1;
    if (last && typeof cur.choices === 'function') cur.choices = cur.choices();   // えらぶ ボタンは 出す ときに 決める（行き先が かわっていても 今の ものを 出す）
    const ch = last && cur.choices && cur.choices.length;
    nextEl.hidden = !!ch;
    nextEl.textContent = last ? '▶ とじる' : '▼ つぎへ';
    if (ch) chEl.innerHTML = cur.choices.map((c, i) => `<button type="button" class="kt-btn" data-kt="${i}">${esc(c)}</button>`).join('');
    if (!box.hidden) { const b = ch ? chEl.firstChild : nextEl; if (b) b.focus({ preventScroll: true }); }   // キーボードで そのまま すすめる
    // えらぶ ボタンの ない さいごの ページは、読まれなくても しばらくで とじる（めいろの じゃまを しない）
    clearTimeout(closeT);
    if (last && !ch) closeT = setTimeout(() => done(-1), 9000);
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function show() {
    let p = cur.pages[page];
    if (typeof p === 'function') p = cur.pages[page] = p();   // 出す ときに 決める ページ（null なら とばす）
    if (!p) { if (page < cur.pages.length - 1) { page++; show(); } else done(-1); return; }
    const t = typeof p === 'string' ? p : p.t;
    face(typeof p === 'string' ? cur.mood : (p.mood || cur.mood));
    chEl.innerHTML = ''; nextEl.hidden = true; full = t;
    srEl.textContent = t;   // 読み上げには 1ページを 1回で わたす（1文字ずつ 書きかえない）
    clearTimeout(closeT); clearInterval(typing); typing = 0;
    if (calm()) { sayEl.textContent = t; afterType(); return; }
    let i = 0; sayEl.textContent = '';
    typing = setInterval(() => { i++; sayEl.textContent = t.slice(0, i); if (i >= t.length) finishType(); }, 40);
  }
  function step() { if (page < cur.pages.length - 1) { page++; show(); } else done(-1); }
  function pick(i) { done(i); }
  function hide() {
    clearInterval(typing); typing = 0; clearTimeout(closeT);
    const had = box && box.contains(document.activeElement);
    if (box) box.hidden = true; cur = null;
    if (had && back && back.isConnected) back.focus({ preventScroll: true });   // キーボードの 人は もとの 場所へ
  }
  function done(i) {
    const c = cur; hide();
    try { if (c && c.then) c.then(i); } catch (e) { console.error(e); }
    setTimeout(pump, 600);
  }
  // 話しかける：pages＝['…', {t:'…', mood:'happy'}, ()=>ページか null]。opts：{ keep（1分半で すてない）, onShow（はじめて 出た とき）, choices:['…'] か ()=>['…'], then:i=>{}（-1＝えらばずに とじた）, mood, busy:()=>bool（ほかの 画面が 出ている）, key（同じ 話を 2つ ためない） }
  function say(pages, opts = {}) {
    if (!on() || !pages || !pages.length) return false;
    if (opts.key && (cur && cur.key === opts.key || q.some(x => x.key === opts.key))) return false;
    build();
    q.push({ pages, ...opts, t0: Date.now() });
    pump();
    return true;
  }
  function pump() {
    if (cur || !q.length) return;
    const n = q[0];
    if (!n.keep && Date.now() - n.t0 > 90000) { q.shift(); pump(); return; }   // keep（はじめての あいさつ）は すてない   // 1分半 出せなかった 話は すてる（古い 行き先の 話を あとから しない）
    if (n.busy && n.busy()) { clearTimeout(pump.t); pump.t = setTimeout(pump, 500); return; }
    cur = q.shift(); page = 0;
    back = document.activeElement;
    box.hidden = false;
    if (cur.onShow) try { cur.onShow(); } catch (e) { console.error(e); }
    show();
    // 話の とちゅうで ごほうび・町の人の 話などが 出たら、そのあいだは よけて、とじたら また 出す
    clearInterval(pump.w);
    pump.w = setInterval(() => { if (!cur) { clearInterval(pump.w); return; } const b = !!(cur.busy && cur.busy()); if (box.hidden !== b) { box.hidden = b; if (b) clearTimeout(closeT); else if (!typing && !chEl.children.length && page === cur.pages.length - 1) afterType(); } }, 400);
  }
  // clear：ためている 話も 今の 話も やめる（遊びかたの 切りかえ など。then は よばない）
  function clear() { q.length = 0; clearInterval(pump.w); hide(); }
  root.nishioKomeTalk = { say, on, setOn, clear, get open() { return !!cur; }, close: () => cur && done(-1), get text() { return cur ? full : ''; }, pickFor: i => cur && pick(i) };
})(window);
