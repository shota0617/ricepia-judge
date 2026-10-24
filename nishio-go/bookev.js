// にしおさんぽGO：イベント「本のできごと」（西尾の歴史の本の中身から）
// ・ゲームの中で、本に出てくる場所に近づく・その町に入ると、そのできごとが起きる（できごとごとに1回だけ）。
//   場面と問いが出て、3つから えらぶ。正解 +20pt、ちがっても +5pt。どちらでも、そのできごとの まちメモ（sangyo.js）が手に入る。
//   ぜんぶ見るとバッジ「西尾の歴史はかせ」（game.js の bookEvDone・badgeDefs）
// ・場面・問い・正解・わけは、運営者から受けとった本のページ（sangyo.js の頭に書いた出典）に書いてあることだけ。
//   まちがいの えらびかたは、問いのための作りもの（本には書いていない）。わけの文は本のとおりのことだけを言う
// ・ほかの窓（説明の窓・パネル・ダイアログ・呼びとめ・ごほうび・ミニゲーム・ほかのイベント）の間は待つ。開いている間は歩かない。
//   続けて出すぎないよう、閉じてから3分は次のできごとを出さない
(() => {
  'use strict';
  // where：{ spot: spots.json の id, r: m } か { village: 明治の村（oldmap.js）の id の配列 } か { town: 町名の正規表現 }
  const EVENTS = [
    { id: 'shisei', title: '西尾町が市になる', when: '1953年（昭和28年）', where: { spot: 'nishio-cityhall', r: 400 },
      scene: '町の人「西尾町は人がふえてきた。これからの発展や みんなの福祉を考えて、市になろうという話が出とるよ」',
      q: '町議会は、市になるための請願書を どうした？',
      a: ['満場一致で採択した', '反対が多くて採択しなかった', '話し合いを先にのばした'],
      why: '西尾町は1953年（昭和28年）12月に市になった。町議会は、市になるための請願書を満場一致で採択した。次の年には『広報西尾』に「市民の声」の欄もつくられた。',
      facts: ['g:shisei:0', 'g:shisei:1'] },
    { id: 'gappei', title: '合併の話し合い', when: '1954年（昭和29年）', where: { village: ['terazu', 'fukuchi', 'hirasaka'] },
      scene: '町の人「町村合併促進法ができて、まわりの町や村と いっしょになる話し合いが始まったよ」',
      q: '1954年6月、西尾市と「合併促進協議会」をつくったのは？',
      a: ['寺津町・福地村・平坂町・室場村', '一色町・吉良町・幡豆町', '岡崎市・安城市・碧南市'],
      why: '1953年9月の町村合併促進法で「昭和の大合併」が始まった。1954年6月、西尾市・寺津町・福地村・平坂町・室場村で「西尾市外四ヶ町村合併促進協議会」ができた。',
      facts: ['g:showa-gappei:0', 'g:showa-gappei:1'] },
    { id: 'yonezu', title: '米津区民一同のよびかけ', when: '昭和の合併のころ', where: { village: ['meiji'] },
      scene: '紙を持った人「米津区民一同から、村のみんなへのお願いだよ。読んでみて」',
      q: '米津区民一同は、村の人に何を呼びかけた？',
      a: ['西尾市への合併を進める運動への理解と協力', '村を2つに分けること', '新しく駅をつくること'],
      why: '碧海郡明治村では「米津区民一同」が、住みやすく楽しい村を続けるため、西尾市への合併を進める運動への理解と協力を、村の人たちに呼びかけた。',
      facts: ['g:showa-gappei:2'] },
    { id: 'sakushima', title: '佐久島の世論調査', when: '1954年（昭和29年）', where: { spot: 'sakushima-nishi', r: 2500 },
      scene: '島の人「みんなの暮らしをもっとよくするには、村の運営を強くせんといかん。島のみんなに聞いてみることになったよ」',
      q: '世論調査の結果、佐久島村の大多数が望んだのは？',
      a: ['一色町への編入合併', '島だけの村のまま続けること', 'となりの島と村をつくること'],
      why: '佐久島村は、住民の福祉のために自治体の運営を強くする必要があると考え、世論調査をした。大多数が一色町への編入合併を望み、1954年に佐久島のすべてを一色町に編入する申請が県知事に出された。',
      facts: ['g:sakushima-hennyu:0'] },
    { id: 'seishi', title: '製糸会社の報告書', when: '1897年（明治30年）', where: { town: /駮馬/ },
      scene: '会社の人「幡豆製糸株式会社の、はじめての報告書ができたよ。国に出しに行かなきゃ」',
      q: '報告書は、だれにあてて出された？',
      a: ['農商務大臣（榎本武揚）', '愛知県知事', '村長'],
      why: '幡豆郡厨村大字駮馬にあった幡豆製糸株式会社は、明治29年上半季の第1回の報告を、1897年2月18日に農商務大臣の榎本武揚あてに出した。明治26年の農商務省令による報告だった。',
      facts: ['g:seishi:0', 'g:seishi:1', 'g:seishi:2'] },
    { id: 'hiryoyama', title: '肥料山の取り上げ', when: '1948年（昭和23年）', where: { village: ['hazu', 'sanwa', 'toyosaka'] }, game: true,
      scene: '農家の人「田んぼにいれる草を、肥料山で刈らんといかん。手伝ってくれん？　そういえば、山の持ち主が肥料山を返せと言いに来るかもしれん…」',
      q: '1948年の方針では、のこった肥料山を持ち主が勝手に取り上げてもいい？',
      a: ['だめ。知事の許可がいる', 'いい。持ち主が決めてよい', '村長がきめる'],
      why: '1948年5月21日の幡豆地方事務所長の方針では、田畑だけが買収されても、のこった肥料山の草刈りには小作の権利があるとされた。持ち主が勝手に取り上げたり売ったりはできず、知事の許可がいるとされた。',
      facts: ['g:hiryoyama:0', 'g:hiryoyama:1', 'g:hiryoyama:3'] },
    { id: 'kojuin', title: '紅樹院の茶園', when: '明治5年', where: { spot: 'kojuin', r: 300 },
      scene: 'お坊さん「京都から来た順道師が、このあたりの土地を見て『茶をつくるのに ちょうどええ』と言ってね。寺の近くに茶園をひらいたんだよ」',
      q: '順道師は、ここの風土が どこに似ていると見た？',
      a: ['京都の宇治', '静岡', '鹿児島'],
      why: '明治5年、京都から来た紅樹院の住職・足立順道師は、この地方の風土が宇治に似ていて茶の栽培に向いていると見て、寺の近くに約4反歩の茶園をひらき、宇治の茶師を招いて製茶を教えた。これが産業としての西尾の茶のはじまり（1941年「西尾茶の沿革」）。',
      facts: ['g:nishio-cha:3', 'g:nishio-cha:1'] },
    { id: 'jissoji-cha', title: '元禄の茶畑の苦情', when: '元禄のころ', where: { spot: 'jissoji', r: 300 },
      scene: '寺の人「むかし、このお寺と正念寺の茶園で、茶の葉をとることで もめごとが起きたそうな。えらい人が決めた書きつけが のこっとるよ」',
      q: 'そのときの老中の判決文は、いまどこにある？',
      a: ['実相寺', '江戸の お城', '京都の御所'],
      why: '元禄のころ、西野町の実相寺と正念寺に茶園があり、茶葉をとることで茶畑の苦情が起きた。そのときの老中の判決文が実相寺にのこっている。だから西尾には古くから茶があったと考えられている（1941年「西尾茶の沿革」）。',
      facts: ['g:nishio-cha:2', 'g:nishio-cha:0'] },
    { id: 'kanko', title: '吉良町の観光の計画', when: '1989年（平成元年）', where: { spot: 'kira-onsen', r: 500 },
      scene: '町の人「吉良町は、愛知県の代表的な観光・レクリエーション地域として期待されとるんだけど…」',
      q: '1989年の計画では、観光客の多くは どこを拠点にしていた？',
      a: ['となりの蒲郡市の温泉街', '吉良温泉', '名古屋のホテル'],
      why: '1989年4月の「吉良町の観光振興計画」では、交通の不便やPR不足などで、観光客の多くが となりの蒲郡市の温泉街を拠点にした「通過型」になっている、とされた。ただ、吉良温泉の旅館などを使う人は ふえていた。',
      facts: ['g:kira-kanko:0', 'g:kira-kanko:1', 'g:kira-kanko:3'] },
  ];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let root = null, cur = null, order = [], picked = false, closedAt = 0;
  const shown = () => !!root && !root.hidden;
  const GAP = 3 * 60000;   // 閉じてから次のできごとまで
  const LATER = 10 * 60000, later = new Map();   // 「あとで」に した できごとは、10分 たつまで また 出さない（めいろの 途中で 同じ 問いが 3分ごとに 出ていた）

  function build() {
    root = document.createElement('div');
    root.className = 'medashi bookev'; root.id = 'bookev'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'イベント 本のできごと');
    document.body.appendChild(root);
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-be]');
      if (!b) return;
      if (b.dataset.be === 'close') close();
      else if (b.dataset.be === 'game') { close(); if (window.NISHIO_HIRYO) NISHIO_HIRYO.open(true); }
      else pick(+b.dataset.be);
    });
    window.addEventListener('keydown', e => { if (shown() && e.key === 'Escape') close(); });
  }
  function open(ev) {
    const G = window.nishioGo;
    if (!G || !G.bookEvDone || (G.bookEvHas && G.bookEvHas(ev.id))) return false;
    if (!root) build();
    cur = ev; picked = false;
    order = ev.a.map((t, i) => i).sort(() => Math.random() - 0.5);
    if (ev.game) {   // ミニゲームで起きるできごと（肥料山の草刈り。持ち主に答えると、見たことになる）
      root.innerHTML = `<div class="md-card be-card"><p class="md-head">📖 本のできごと：${esc(ev.title)}<small>（${esc(ev.when)}）</small></p>
        <p class="md-say">${esc(ev.scene)}</p>
        <div class="be-a"><button type="button" class="btn be-btn" data-be="game">🌿 手伝う（ミニゲーム）</button></div>
        <button type="button" class="btn mini md-close" data-be="close">あとで</button></div>`;
      root.hidden = false;
      if (G.track) G.track('bookev_open', { ev: ev.id });
      return true;
    }
    root.innerHTML = `<div class="md-card be-card"><p class="md-head">📖 本のできごと：${esc(ev.title)}<small>（${esc(ev.when)}）</small></p>
      <p class="md-say">${esc(ev.scene)}</p>
      <p class="be-q"><b>${esc(ev.q)}</b></p>
      <div class="be-a">${order.map(i => `<button type="button" class="btn be-btn" data-be="${i}">${esc(ev.a[i])}</button>`).join('')}</div>
      <p class="md-res" hidden></p>
      <button type="button" class="btn mini md-close" data-be="close">あとで</button></div>`;
    root.hidden = false;
    if (G.track) G.track('bookev_open', { ev: ev.id });
    return true;
  }
  function pick(i) {
    if (picked || !cur) return;
    picked = true;
    const ok = i === 0, G = window.nishioGo, r = G.bookEvDone(cur.id, ok, cur.facts, EVENTS.length) || { pts: 0, n: 0 };
    root.querySelectorAll('.be-btn').forEach(b => { const k = +b.dataset.be; b.disabled = true; b.classList.add(k === 0 ? 'right' : k === i ? 'wrong' : 'other'); });
    const res = root.querySelector('.md-res');
    res.innerHTML = `<b>${ok ? '正解！' : 'ざんねん'}</b> ${esc(cur.why)}<br>${r.pts ? `+${r.pts}pt　` : ''}本のできごと ${r.n}/${EVENTS.length}${r.all ? '　🏅 ぜんぶ見た！' : ''}<br><small>📒 まちメモが ふえました（出典：西尾の歴史の本）</small>`;
    res.hidden = false;
    root.querySelector('.md-close').textContent = 'とじる';
  }
  function close() { if (root) root.hidden = true; closedAt = Date.now(); if (cur && !picked) later.set(cur.id, closedAt); cur = null; }
  function here(ev) {
    const G = window.nishioGo, P = window.nishioPixel, O = window.NISHIO_OLDMAP, me = G && G.me, w = ev.where;
    if (!me) return false;
    if (w.spot) { const s = (G.spots || []).find(x => x.id === 'f-' + w.spot); return !!s && G.dist(me, s) <= w.r; }
    const town = P && P.here && P.hereFresh && P.here.town;   // 古い町名（地図を切り替えたあと）では判定しない
    if (!town) return false;
    if (w.town) return w.town.test(town);
    if (w.village && O) { const v = O.villageOf(town, P.here.city); return !!v && w.village.includes(v.id); }
    return false;
  }
  // 2秒ごとに、いまいる所で起きる まだのできごとを探す（ほかの窓が出ている間・閉じてすぐは待つ）
  function tick() {
    const G = window.nishioGo, P = window.nishioPixel;
    if (!G || !P || shown() || Date.now() - closedAt < GAP) return;
    if (document.querySelector('.medashi:not([hidden])') || document.body.classList.contains('jump-open') || (G.rewardSoon && G.rewardSoon())) return;
    if ((P.mapCovered && P.mapCovered()) || (P.sightBusy && P.sightBusy())) return;
    const ev = EVENTS.find(e => !(G.bookEvHas && G.bookEvHas(e.id)) && !(Date.now() - (later.get(e.id) || -Infinity) < LATER) && here(e));
    if (ev) open(ev);
  }
  setInterval(tick, 2000);
  window.NISHIO_BOOKEV = { EVENTS, open, pick, close, tick, here, get shown() { return shown(); } };
})();
