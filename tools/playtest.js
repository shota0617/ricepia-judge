// にしおさんぽGO を通しでプレイして確かめる台本：node tools/playtest.js [出力フォルダ]
// ヘッドレス Chromium（スマホの画面 390×780）で、はじめの画面 → 操作して移動（スティック・地面をタップ）で3か所めぐり → 当店の案内 →
// あるいて移動（位置情報）→ せかいちず → きろく・バッジ → 呼びとめ、の順に遊び、スクリーンショットと結果（playtest.json）を残す。
// 地図は前もって作った nishio-go/world.json と nishio-go/chunks/ を使う（Overpass と標高タイルには問い合わせない）。
// 環境変数：CHROMIUM=Chromium の場所（省略時は Playwright の既定）、LEAFLET_DIR=Leaflet の dist（ネットにつながらないとき）
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { startServer } = require('./bake-common');

const OUT = path.resolve(process.argv[2] || 'playtest-out');
const PORT = Number(process.env.PLAYTEST_PORT) || 8899, URL = `http://localhost:${PORT}/nishio-go.html`;
const VIEW = { width: 390, height: 780 };
const STATION = [34.8640, 137.0560];   // あるいて移動で使う位置（名鉄 西尾駅の近く）
// 今日のクエストとたからばこは日付で決まるので、台本の中の日付を固定する（この日は「西尾の注目スポット」と「たからばこ2つ」が出て、この道順で達成できる）
const PLAY_DATE = process.env.PLAYTEST_DATE || '2026-10-16T10:00:00+09:00';

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, ...opts });
  await ctx.addInitScript(() => {
    localStorage.setItem('nsg_auto', 'false');   // おまかせ歩きは止めて、台本どおりに歩く
    if (!localStorage.getItem('nsg_roll')) localStorage.setItem('nsg_roll', '0');   // 台本は1マスずつ歩く（かたむけて転がすのは、下の roll のチェックで）
    if (!localStorage.getItem('nsg_view')) { localStorage.setItem('nsg_view', 'px'); localStorage.setItem('nsg_world_on', '0'); }
    window.__played = [];   // 鳴らした音（効果音・BGM）を記録する
    window.__rewards = [];   // 出たごほうびの知らせ（あとから出たものに消されても、出たことは分かるように）
    setInterval(() => { if (window.NISHIO_MOVIE && NISHIO_MOVIE.playing && !window.__keepMovie) NISHIO_MOVIE.close(); }, 200);   // 名所で流れる ドット絵ムービーは閉じて先へ（ムービーは下の movie のチェックで見る）
    document.addEventListener('DOMContentLoaded', () => { const r = document.getElementById('reward'); new MutationObserver(() => { if (r.innerText) window.__rewards.push(r.innerText.replace(/\s+/g, ' ').slice(0, 80)); }).observe(r, { childList: true }); });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { window.__played.push(this.src.split('/').pop()); return play.call(this); };
  });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(PLAY_DATE));   // Date だけ固定（タイマーやアニメーションはふつうに動く）
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (process.env.LEAFLET_DIR) await page.route('https://unpkg.com/**', r => {
    const f = r.request().url().endsWith('.css') ? 'leaflet.css' : 'leaflet.js';
    r.fulfill({ body: fs.readFileSync(path.join(process.env.LEAFLET_DIR, f)), contentType: f.endsWith('css') ? 'text/css' : 'text/javascript' });
  });
  await page.route(/^https:\/\/(cyberjapandata\.gsi\.go\.jp|fonts\.googleapis\.com|[^/]*overpass[^/]*)\//, r => r.fulfill({ status: 504, body: '' }));
  return { ctx, page, errors };
}

// 主人公からスポット（id）またはたからばこ（'chest'：いちばん近いもの）まで、ゲームと同じ通れるマスの決まりで道を探し、矢印キーで歩く
async function walkTo(page, id) {
  const plan = await page.evaluate(id => {
    const s = id === 'chest'
      ? nishioGo.liveChests().sort((a, b) => nishioGo.dist(nishioGo.me, a) - nishioGo.dist(nishioGo.me, b)).map(c => ({ ...c, name: 'たからばこ', reach: 12 }))[0]
      : nishioGo.spots.find(x => x.id === id);
    if (!s) return null;
    const P = nishioPixel, C = P.C, BL = new Set([C.A, C.B, C.M, C.X]), me = nishioGo.me;
    const a = P.toTile(me.lat, me.lng), goal = P.toTile(s.lat, s.lng), reach = nishioGo.reachOf(s) * 0.7 / 8;
    const sx = Math.floor(a.x), sy = Math.floor(a.y), prev = new Map([[sx + ',' + sy, null]]), q = [[sx, sy]];
    const D = [[0, -1, 'ArrowUp'], [0, 1, 'ArrowDown'], [-1, 0, 'ArrowLeft'], [1, 0, 'ArrowRight']];
    let end = null;
    while (q.length && prev.size < 200000) {
      const [x, y] = q.shift();
      if (Math.hypot(x + 0.5 - goal.x, y + 0.5 - goal.y) < reach) { end = [x, y]; break; }
      for (const [dx, dy, k] of D) {
        const nx = x + dx, ny = y + dy, key = nx + ',' + ny;
        if (prev.has(key) || BL.has(P.codeAt(nx, ny) & 31)) continue;
        prev.set(key, [x + ',' + y, k]); q.push([nx, ny]);
      }
    }
    if (!end) return { name: s.name, keys: null };
    const keys = []; let cur = end[0] + ',' + end[1];
    while (prev.get(cur)) { const [pk, k] = prev.get(cur); keys.push(k); cur = pk; }
    return { name: s.name, keys: keys.reverse(), straight: Math.round(nishioGo.dist(me, s)) };
  }, id);
  if (!plan || !plan.keys) return { id, reached: false };
  const facts0 = await page.evaluate(() => nishioGo.state.facts.length);
  for (const k of plan.keys) { await page.keyboard.press(k); await page.waitForTimeout(15); }
  await page.waitForTimeout(500);
  if (id === 'chest') {   // たからばこは近づくと開く：ポイントとまめちしきの知らせが出るか
    // ようこそ たからばこ では、はじめの1枚を3枚から えらぶ窓が出る（2枚目をえらぶ）
    await page.waitForTimeout(800);
    const picks = await page.$$('[data-pick-dot]'), first = { n: picks.length, id: null };
    if (picks.length) { first.id = Number(await picks[1].getAttribute('data-pick-dot')); await picks[1].click(); await page.waitForTimeout(600); }
    // まめちしき：新しいまちメモが1つ増え、文字を多めに出すときは 💡 の文、文字を少なく（ふだん）のときは本の札（文は きろく の まちメモ に入る）
    const popup = await page.evaluate(() => { const r = document.getElementById('reward'); return { text: r.innerText, book: !!r.querySelector('img[alt^="📖"]'), facts: nishioGo.state.facts.length }; });
    return { id, name: plan.name, straightM: plan.straight, steps: plan.keys.length, first, reached: /たからばこ/.test(popup.text) && popup.facts > facts0 && (/💡/.test(popup.text) || popup.book) };
  }
  const spin = await page.evaluate(() => !document.getElementById('spinBtn').hidden && document.getElementById('spinName').textContent);
  return { id, name: plan.name, straightM: plan.straight, steps: plan.keys.length, reached: spin === plan.name };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = startServer(PORT);
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const R = { shots: [], checks: {}, walk: [], errors: [] };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); R.shots.push(name + '.png'); };
  const state = page => page.evaluate(() => ({ pts: nishioGo.state.points, demo: nishioGo.demo, status: document.getElementById('status').textContent }));

  // 1) 操作して移動で遊ぶ（位置情報は許可しておき、あとで同じ画面のまま、あるいて移動に切り替える）
  const { ctx, page, errors } = await newPage(browser, { permissions: ['geolocation'], geolocation: { latitude: STATION[0], longitude: STATION[1], accuracy: 10 } });
  await page.goto(URL); await page.waitForTimeout(800);
  await shot(page, '01-intro');
  // はじめての人と同じく、せかいちずを開いた状態で「操作して遊ぶ」を押す
  // はじめての人は歩く地図から始まり、すぐ近くに「ようこそ たからばこ」が置かれる（docs/retention.md）
  await page.evaluate(() => nishioPixel.setWorld(true));
  await page.click('#demoBtn'); await page.waitForTimeout(2500);
  // 文字を少なく（ふだん）：上のバーと下のタブは文字を出さず、ドット絵だけ
  R.checks.simpleDefault = await page.evaluate(() => document.body.classList.contains('simple') && !!document.querySelector('.tabs img.pi') && getComputedStyle(document.querySelector('.tabs button span')).display === 'none' && getComputedStyle(document.querySelector('.brand .tx')).display === 'none');
  R.checks.firstOnField = await page.evaluate(() => nishioGo.demo && !nishioPixel.worldMode && !document.getElementById('pxPad').hidden);
  R.checks.welcomeChestM = await page.evaluate(() => { const c = nishioGo.liveChests().find(x => x.id.endsWith(':welcome')); return c ? Math.round(nishioGo.dist(nishioGo.me, c)) : null; });
  // せかいちずでもスティックが出て、動かすと歩く地図にもどる
  await page.evaluate(() => nishioPixel.setWorld(true)); await page.waitForTimeout(500);
  R.checks.padOnWorldMap = await page.evaluate(() => nishioGo.demo && nishioPixel.worldMode && !document.getElementById('pxPad').hidden);
  // スティックを上へ倒して少し持ち、はなす（北へ何マスか歩く）
  const lat0 = await page.evaluate(() => nishioGo.me && nishioGo.me.lat);
  const sb = await page.locator('#pxStick').boundingBox();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2); await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + 8, { steps: 4 }); await page.waitForTimeout(700);
  R.checks.stickKnobMoved = await page.evaluate(() => /translate/.test(document.getElementById('pxKnob').style.transform));
  await page.mouse.up(); await page.waitForTimeout(800);
  R.checks.stickWalkedNorth = await page.evaluate(l => !!nishioGo.me && l != null && nishioGo.me.lat > l, lat0);
  R.checks.stickReleased = await page.evaluate(() => !document.getElementById('pxKnob').style.transform && !document.getElementById('pxStick').classList.contains('on'));
  // 地面をタップすると、そこまで歩く（通れるマスで、まわりに人や名所がなく、ボタンに隠れていない所を選ぶ）
  const tapAt = await page.evaluate(() => {
    const P = nishioPixel, C = P.C, BL = new Set([C.A, C.B, C.M, C.X]), a = P.toTile(nishioGo.me.lat, nishioGo.me.lng), sx = Math.floor(a.x), sy = Math.floor(a.y);
    const busy = (x, y) => nishioGo.npcs.some(n => { const q = P.npcTile(n); return Math.abs(q.x - x) < 2 && Math.abs(q.y - y) < 2; }) || nishioGo.spots.some(s => { const q = P.toTile(s.lat, s.lng); return Math.abs(q.x - x - 0.5) < 2 && Math.abs(q.y - y - 0.5) < 2; }) || nishioGo.liveChests().some(ch => { const q = P.toTile(ch.lat, ch.lng); return Math.hypot(q.x - x, q.y - y) < 6; });   // たからばこに近いと、開いて知らせが出て止まる
    for (const [dx, dy] of [[3, 0], [-3, 0], [0, -3], [0, 3], [3, -2], [-3, -2], [4, 0], [-4, 0], [2, 2], [-2, 2]]) {
      const x = sx + dx, y = sy + dy;
      if (BL.has(P.codeAt(x, y) & 31) || busy(x, y)) continue;
      const p = P.tileToClient(x, y);
      if (document.elementFromPoint(p.x, p.y) === document.getElementById('pxCanvas')) return { x, y, cx: p.x, cy: p.y };
    }
    return null;
  });
  if (tapAt) {
    await page.mouse.click(tapAt.cx, tapAt.cy); await page.waitForTimeout(300);
    const goal = await page.evaluate(() => nishioPixel.tapGoal);
    await page.waitForTimeout(2500);
    R.checks.tapWalk = await page.evaluate(([g, t]) => { const a = nishioPixel.toTile(nishioGo.me.lat, nishioGo.me.lng); return !!g && Math.floor(a.x) === g[0] && Math.floor(a.y) === g[1] && Math.abs(g[0] - t.x) + Math.abs(g[1] - t.y) <= 1 && !nishioPixel.tapGoal; }, [goal, tapAt]);
    // 歩いているとちゅうで きろく を開いたら、うしろで歩きつづけない（もとの所へタップして、すぐ きろく）
    const back = await page.evaluate(() => { const a = nishioPixel.toTile(nishioGo.me.lat, nishioGo.me.lng); return nishioPixel.tileToClient(Math.floor(a.x) - 3, Math.floor(a.y)); });
    await page.mouse.click(back.x, back.y);
    const started = await page.evaluate(() => !!nishioPixel.tapGoal);   // 歩きはじめていたか
    await page.click('[data-tab=log]');
    const at = await page.evaluate(() => [nishioGo.me.lat, nishioGo.me.lng]);
    await page.waitForTimeout(1200);
    R.checks.tapWalkStopsOnPanel = started && await page.evaluate(at => !nishioPixel.tapGoal && nishioGo.me.lat === at[0] && nishioGo.me.lng === at[1], at);
    await page.click('[data-tab=map]'); await page.waitForTimeout(300);
    // 地図より外（こよみの札）をさわったら止まる（札は開いたら閉じておく）
    const fwd = await page.evaluate(() => { const a = nishioPixel.toTile(nishioGo.me.lat, nishioGo.me.lng); return nishioPixel.tileToClient(Math.floor(a.x) + 3, Math.floor(a.y)); });
    await page.mouse.click(fwd.x, fwd.y);
    const started2 = await page.evaluate(() => !!nishioPixel.tapGoal && !document.getElementById('koyomi').hidden);
    await page.click('#koyomi');
    const at3 = await page.evaluate(() => [nishioGo.me.lat, nishioGo.me.lng]);
    await page.waitForTimeout(1200);
    R.checks.tapWalkStopsOnTouch = started2 && await page.evaluate(at => !nishioPixel.tapGoal && nishioGo.me.lat === at[0] && nishioGo.me.lng === at[1], at3);
    await page.evaluate(() => { const k = document.getElementById('koyomi'); if (k.classList.contains('open')) k.click(); });
    // ほうびの知らせ（たからばこを開けたとき）や「ホーム画面に追加」の案内が出たときも止まる（行って戻る）
    R.checks.tapWalkStopsOnCover = [];
    for (const [dx, cover] of [[3, 'reward'], [-3, 'a2hs']]) {
      const p = await page.evaluate(dx => { const a = nishioPixel.toTile(nishioGo.me.lat, nishioGo.me.lng); return nishioPixel.tileToClient(Math.floor(a.x) + dx, Math.floor(a.y)); }, dx);
      await page.mouse.click(p.x, p.y);
      const at2 = await page.evaluate(id => { const el = document.getElementById(id); if (id === 'reward') el.classList.add('show'); else el.hidden = false; return [nishioGo.me.lat, nishioGo.me.lng, !!nishioPixel.tapGoal]; }, cover);   // 3つめ：歩きはじめていたか
      await page.waitForTimeout(1200);
      R.checks.tapWalkStopsOnCover.push(await page.evaluate(([at, id]) => { const ok = at[2] && !nishioPixel.tapGoal && nishioGo.me.lat === at[0] && nishioGo.me.lng === at[1]; const el = document.getElementById(id); if (id === 'reward') el.classList.remove('show'); else el.hidden = true; return ok && id; }, [at2, cover]));
    }
  } else R.checks.tapWalk = 'no-spot';
  R.checks.operateMode = await page.evaluate(() => nishioGo.demo && !nishioPixel.worldMode && !document.getElementById('pxPad').hidden);
  R.checks.bgmStarted = await page.evaluate(() => window.__played.some(f => /^(field[23]?|morning|evening|night|rain|\d{3})\.mp3$/.test(f)));   // ふだんの曲（時間・天気・順番で変わる。アルバムの曲は 001.mp3〜100.mp3）
  await shot(page, '02-operate-start');
  R.checks.chestsNearby = await page.evaluate(() => nishioPixel.chests.length);
  R.walk.push(await walkTo(page, 'chest'));
  R.checks.firstPickN = R.walk[0].first && R.walk[0].first.n; R.checks.firstPickId = R.walk[0].first && R.walk[0].first.id;
  R.checks.welcomeBag = await page.evaluate(() => (nishioGo.state.bags || []).map(b => b.km).join(','));   // はじめての たからばこ では必ず 1km の おみやげ袋
  // ふつうの地図のタップのような瞬間移動（歩く地図の1歩でない移動）では、袋は進まない（歩いた距離には入る）。行って、もとの所へ戻る
  R.checks.teleportNoBag = await page.evaluate(() => {
    const b = nishioGo.state.bags[0], w0 = b.walked, d0 = nishioGo.state.walked, at = { lat: nishioGo.me.lat, lng: nishioGo.me.lng };
    nishioGo.moveTo(at.lat + 0.0012, at.lng);
    const ok = nishioGo.state.bags[0].walked === w0 && nishioGo.state.walked > d0;
    nishioGo.moveTo(at.lat, at.lng);
    return ok && nishioGo.state.bags[0].walked === w0;
  });
  // あしあと：歩く地図の1歩で歩いたマスが残り、同じ道をもう一度歩いても ふえず、瞬間移動では残らない
  // ミニゲーム「段丘をのぼる」：3つの段丘とも、自然堤防から台地まで 1回のジャンプ（実際の物理で上がれる高さ・横2マスのすきままで）で届く段がつながり、露頭がある
  R.checks.dankyu = await page.evaluate(() => {
    const D = window.NISHIO_DANKYU;
    if (!D) return 'none';
    D.open();
    const bad = [];
    for (let l = 0; l < D.LEVELS.length; l++) {
      D.reset(l);
      const i = D.info, ps = i.plats.filter(p => p.kind !== 'paddy');
      const gap = (p, q) => Math.max(0, q.x - (p.x + p.w), p.x - (q.x + q.w));
      const start = ps.find(p => p.kind === 'levee'), seen = new Set([start]), q = [start];
      const reach = Math.floor((D.maxRise() - 4) / 16);   // 実際のジャンプで上がれるマス（4点のゆとり）
      if (reach < 3) bad.push(`ジャンプ ${D.maxRise().toFixed(1)}点：3マスに届かない`);
      while (q.length) { const p = q.shift(); for (const n of ps) if (!seen.has(n) && n.y < p.y && p.y - n.y <= reach && gap(p, n) <= 2) { seen.add(n); q.push(n); } }
      if (![...seen].some(p => p.kind === 'top')) bad.push(`${l + 1}:届かない`);
      if (i.outcrops.length < 2) bad.push(`${l + 1}:露頭`);
      if (!/地区/.test(D.LEVELS[l].name)) bad.push(`${l + 1}:名前`);
    }
    D.close();
    return bad.length ? bad.join(',') : true;
  });
  // 第4弾（ほかのゲームを遊んで）：稲刈りの ↶ もどす・ミニゲームの面ごとの自己ベストと つづき・同じ知らせを重ねない・前回のさんぽ・バッジの達成率
  R.checks.fourth = await page.evaluate(async () => {
    const H = window.NISHIO_HARVEST, G = nishioGo, bad = [];
    if (!H) return 'none';
    H.open(); H.reset(0);
    const i0 = H.info; H.move('up'); H.move('right'); const i1 = H.info; H.undo(); const i2 = H.info;
    if (!(i1.moves === 2 && i1.turns === 1 && i2.moves === 1 && i2.turns === 0 && i2.left === i0.left - 1 && i2.pos[0] === 0 && i2.dir === 'up')) bad.push('もどす');
    H.reset(0);
    const { w, h } = H.info, cands = [H.spiral(w, h, 'up', 1), H.spiral(w, h, 'right', 3), H.serpentine(w, h, true), H.serpentine(w, h, false)].filter(p => p && p.length === w * h);
    const path = cands.sort((a, b) => H.turnsOf([[0, h], ...a], 'up') - H.turnsOf([[0, h], ...b], 'up'))[0];
    let at = [0, h];
    for (const p of path) { H.move(p[0] > at[0] ? 'right' : p[0] < at[0] ? 'left' : p[1] > at[1] ? 'down' : 'up'); at = p; }
    await new Promise(r => setTimeout(r, 500));
    const rec = G.miniRecords('harvest')[0], res = document.querySelector('#harvest .jump-result');
    if (!(rec && rec.s === 3 && /自己ベスト/.test(res.textContent) && res.querySelector('[data-lv="1"]') && !res.querySelector('[data-lv="2"]'))) bad.push('自己ベスト');
    const worse = G.miniBest('harvest', 0, 2, 99, true);
    if (worse.fresh || G.miniRecords('harvest')[0].s !== 3) bad.push('悪い記録で上書き');
    H.close(); H.open();
    if (H.info.level !== 1) bad.push('つづき');
    H.close();
    // 同じ知らせ：続けて3回出しても、待ちの列に重ならない
    G.toast('テストの知らせ'); G.toastAfter('テストの知らせ'); G.toastAfter('テストの知らせ'); G.toastAfter('テストの知らせ2'); G.toastAfter('テストの知らせ2');
    const q = G.toastAfter.q || [], n1 = q.filter(m => m === 'テストの知らせ').length, n2 = q.filter(m => m === 'テストの知らせ2').length;
    if (n1 > 1 || n2 !== 1) bad.push(`知らせ ${n1}・${n2}`);
    // 前回のさんぽ：きのうの記録が きろく に出る
    const d = G.state.day, y = new Date(); y.setDate(y.getDate() - 1);
    const keep = JSON.stringify(d);
    G.state.day = { ...d, date: G.ymd(y), walked: 640, checkins: 2, dots: 1 };
    G.renderLog();
    const box = document.getElementById('bagBox').textContent;
    if (!/きのうのさんぽ/.test(box) || !/640m/.test(box)) bad.push('前回のさんぽ');
    G.state.day = { ...JSON.parse(keep), date: G.ymd() }; G.state.prevDay = null; G.renderLog();
    if (!/^\d+\/\d+（\d+%）$/.test(document.getElementById('badgeCount').textContent)) bad.push('バッジの達成率');
    return bad.length ? bad.join(',') : true;
  });
  // 田んぼのイベント「芽出しの見きわめ」：種もみが3つ出て、OK をえらぶと +20pt と米づくりの まちメモ。1日1回
  R.checks.medashi = await page.evaluate(async () => {
    const M = window.NISHIO_MEDASHI, G = nishioGo, bad = [];
    if (!M) return 'none';
    if (G.state.medashiDay === G.ymd()) return 'もう今日は遊んだことになっている';
    const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click();   // ごほうびの画面の上には出ないので、閉じてから
    const p0 = G.state.points;
    // 田んぼを歩いて始まる。きろく のパネルを開いている間は始まらず、閉じたあとの1歩で始まる
    const P = nishioPixel, t = P.toTile(G.me.lat, G.me.lng), x0 = Math.floor(t.x), y0 = Math.floor(t.y);
    let hit = null;
    for (let r = 0; r < 120 && !hit; r++) for (let dy = -r; dy <= r && !hit; dy++) for (let dx = -r; dx <= r; dx++) { const c = P.codeAt(x0 + dx, y0 + dy); if (c === P.C.F || c === P.C.U) { hit = [x0 + dx, y0 + dy]; break; } }
    if (!hit) return '近くに田んぼがない';
    const rb = G.rewardSoon; G.rewardSoon = () => true;   // 絵を読みこんでいて まだ出ていない ごほうび・開く予約をした おみやげ袋があるとき
    if (M.open()) { bad.push('ごほうびを待つ間に出た'); M.close(); }
    G.rewardSoon = rb;
    document.querySelector('.tabs button[data-tab="log"]').click();
    for (let i = 0; i < 20; i++) P.critterStep(hit[0], hit[1]);
    if (M.shown) bad.push('パネルの上に出た');
    document.querySelector('.tabs button[data-tab="map"]').click();
    for (let i = 0; i < 3 && !M.shown; i++) P.critterStep(hit[0], hit[1]);
    if (!M.shown) return `田んぼを歩いても開かない（${document.body.classList.contains('jump-open') ? 'ミニゲーム中' : document.getElementById('reward').classList.contains('show') ? 'ごほうびの画面' : 'ほか'}）${bad.join(',')}`;
    // 開いている間は、矢印キーで主人公が動かない
    const before = G.me.lat + ',' + G.me.lng;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    if (G.me.lat + ',' + G.me.lng !== before) bad.push('開いている間に歩いた');
    // 開いている間に来た ごほうびは、閉じるまで出さない
    G.showReward(1, 'テスト1', [], false, '', null);
    G.showReward(2, 'テスト2', [], false, '', null);
    if (rw.classList.contains('show') || !G.rewardBusy()) bad.push('開いている間に ごほうびが出た');
    if (document.querySelectorAll('#medashi .md-seed').length !== 3) bad.push('種もみが3つでない');
    M.pick('ok');
    if (G.state.points - p0 !== 20) bad.push(`ポイント ${G.state.points - p0}`);
    if (!G.state.facts.includes('k:tanemomi:0')) bad.push('まちメモ');
    if (!/正解/.test(document.querySelector('#medashi .md-res').textContent)) bad.push('こたえ');
    M.close();
    if (G.medashiDue() || M.open()) bad.push('1日に2回');
    await new Promise(r => setTimeout(r, 900));
    if (!rw.classList.contains('show') || !/テスト1/.test(rw.textContent)) bad.push('閉じたあとに 1つめの ごほうびが出ない');
    rw.click();
    await new Promise(r => setTimeout(r, 1600));
    if (!rw.classList.contains('show') || !/テスト2/.test(rw.textContent)) bad.push('1つめを閉じたあとに 2つめの ごほうびが出ない');
    rw.click();
    return bad.length ? bad.join(',') : true;
  });
  // 水べのイベント「虫の名前あて」：水べを歩くと始まり、3問。名前の絵を3びきから えらぶ。3問当たると +20pt と虫の まちメモ。1日1回
  R.checks.mushi = await page.evaluate(async () => {
    const M = window.NISHIO_MUSHI, G = nishioGo, P = nishioPixel, C = P.C, bad = [];
    if (!M) return 'none';
    if (G.state.mushiDay === G.ymd()) return 'もう今日は遊んだことになっている';
    const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click();
    await new Promise(r => setTimeout(r, 1700));   // 芽出しのあとの ごほうびが消えるまで
    if (rw.classList.contains('show')) rw.click();
    let p0 = G.state.points;
    const t = P.toTile(G.me.lat, G.me.lng), x0 = Math.floor(t.x), y0 = Math.floor(t.y);
    const N = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]], walk = new Set([C.A, C.B, C.M, C.X]);
    let hit = null;
    for (let r = 0; r < 200 && !hit; r++) for (let dy = -r; dy <= r && !hit; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = x0 + dx, y = y0 + dy;
      if (walk.has(P.codeAt(x, y)) || !N.some(([a, b]) => P.codeAt(x + a, y + b) === C.A) || N.some(([a, b]) => [C.U, C.F].includes(P.codeAt(x + a, y + b)))) continue;
      hit = [x, y]; break;
    }
    if (!hit) return '近くに水べがない';
    for (let i = 0; i < 20 && !M.shown; i++) P.critterStep(hit[0], hit[1]);
    if (!M.shown) return '水べを歩いても開かない';
    p0 = G.state.points;   // 歩いている間に生きものに出会って ふえた分は数えない
    if (document.querySelectorAll('#mushi .mu-bug').length !== 3) bad.push('虫の絵が3つでない');
    // 画面読み上げでも絵の見た目がわかる（名前は言わない）
    if ([...document.querySelectorAll('#mushi .mu-bug')].some(b => { const x = M.BUGS.find(y => y.id === b.dataset.mu); return !b.getAttribute('aria-label').includes(x.look) || b.getAttribute('aria-label').includes(x.name); })) bad.push('絵の読み上げ');
    // 開いてから5分たって「あとで」で閉じても、閉じた時刻から5分は出ない（10分後には また出る）
    const now0 = Date.now, t0 = now0();
    Date.now = () => t0 + 6 * 60000; M.close();
    if (M.open()) bad.push('閉じてすぐ また開いた');
    Date.now = () => t0 + 12 * 60000;
    if (!M.open()) bad.push('閉じて6分たっても開かない');
    Date.now = now0;
    // 絵は ちがう虫ごとに ちがう（描けている）
    const imgs = [...document.querySelectorAll('#mushi .mu-bug canvas')].map(c => c.toDataURL());
    if (new Set(imgs).size !== 3) bad.push('絵が同じ');
    for (let i = 0; i < 3; i++) {
      const q = M.q;
      if (!q || !q.opts.includes(q.target) || new Set(q.opts).size !== 3) { bad.push('問いの えらぶもの'); break; }
      const B = M.BUGS.find(b => b.id === q.target);
      if (q.opts.some(o => B.not.includes(o))) bad.push('ヒントが当てはまる虫が まちがいに出た');
      M.pick(q.target);
      if (!/正解/.test(document.querySelector('#mushi .md-res').textContent)) bad.push('こたえ');
      M.next();
    }
    if (!M.done || M.right !== 3) bad.push(`当たり ${M.right}`);
    if (G.state.points - p0 !== 20) bad.push(`ポイント ${G.state.points - p0}`);
    if (!G.state.facts.includes('z:mushi:0')) bad.push('まちメモ');
    if (!/3\/3/.test(document.getElementById('mushi').textContent)) bad.push('けっか');
    M.close();
    if (G.mushiDue() || M.open()) bad.push('1日に2回');
    return bad.length ? bad.join(',') : true;
  });
  // イベント「雲母石を探せ」：場所ごとに1回。ちがう石は「ただの石」、雲母石で +15pt（1回目なら +20pt）と まちメモ。3か所ぜんぶで もう +30pt
  R.checks.kirara = await page.evaluate(async () => {
    const K = window.NISHIO_KIRARA, G = nishioGo, bad = [];
    if (!K) return 'none';
    const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click();
    const s = G.spots.find(x => x.id === 'f-yatsuomote');
    if (!s) return '八ツ面山のスポットがない';
    if (!K.here(K.PLACES[0], { lat: s.lat + 0.001, lng: s.lng })) bad.push('八ツ面山の近くで here が偽');
    if (K.here(K.PLACES[0], { lat: 35.17, lng: 136.88 })) bad.push('名古屋で here が真');
    const p0 = G.state.points;
    if (!K.open(K.PLACES[0]) || !K.shown) return '開かない';
    if (document.querySelectorAll('#kirara .kr-stone').length !== 20) bad.push('石が20個でない');
    if (document.querySelectorAll('#kirara .kr-stone.mica').length !== 1) bad.push('雲母石が1つでない');
    const wrong = (K.mica + 1) % 20;
    K.tap(wrong);
    if (K.found || !document.querySelector(`#kirara .kr-stone[data-kr="${wrong}"]`).disabled) bad.push('ちがう石で見つかった・押せたまま');
    K.tap(K.mica);
    if (!K.found) bad.push('雲母石で見つからない');
    if (G.state.points - p0 !== 15) bad.push(`ポイント（2回目）${G.state.points - p0}`);
    if (!G.state.facts.includes('z:kirara:0') || !G.state.facts.includes('z:kirara:1')) bad.push('まちメモ');
    if (!/1\/3/.test(document.getElementById('kirara').textContent)) bad.push('1/3');
    K.close();
    if (K.open(K.PLACES[0])) bad.push('同じ場所で2回');
    const p1 = G.state.points;
    K.open(K.PLACES[1]); K.tap(K.mica); K.close();
    K.open(K.PLACES[2]); K.tap(K.mica);
    if (G.state.points - p1 !== 20 + 20 + 30) bad.push(`ポイント（1回目・ぜんぶ）${G.state.points - p1}`);
    if (!/ぜんぶの場所/.test(document.getElementById('kirara').textContent)) bad.push('ぜんぶ見つけた');
    K.close();
    return bad.length ? bad.join(',') : true;
  });
  // イベント「八ツ面山の昆虫さがし」：1日1回。ちがう場所では その場所の虫が見られ（虫手帳に入る）、きょうの虫の場所で見つける。+15pt と はじめての虫 +5pt
  R.checks.yatsumushi = await page.evaluate(async () => {
    const Y = window.NISHIO_YATSUMUSHI, G = nishioGo, bad = [];
    if (!Y) return 'none';
    const s = G.spots.find(x => x.id === 'f-yatsuomote');
    if (!s || !Y.here({ lat: s.lat + 0.001, lng: s.lng })) bad.push('八ツ面山の近くで here が偽');
    if (Y.here({ lat: 35.17, lng: 136.88 })) bad.push('名古屋で here が真');
    // 虫は本に書いてある場所のどれか・場所ごとに1ぴきはいる・絵が描ける
    if (Y.BUGS.some(b => !Y.PLACES.some(p => p.id === b.at)) || Y.PLACES.some(p => !Y.BUGS.some(b => b.at === p.id))) bad.push('虫と場所');
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const pics = new Set(Y.BUGS.map(b => { Y.drawBug(cv, b); return cv.toDataURL(); }));
    if (pics.size < 10) bad.push(`絵の種類 ${pics.size}`);
    const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click();
    const p0 = G.state.points, t = Y.BUGS.find(b => b.id === 'kabuto');
    if (!Y.open('kabuto') || !Y.shown) return '開かない';
    Y.look('kusa');   // ちがう場所：草むらの虫が見られる
    if (Y.found || Y.left !== 2) bad.push('ちがう場所で見つかった');
    if (!/草むら/.test(document.querySelector('#yatsumushi .ym-log').textContent)) bad.push('草むらの虫');
    Y.look('kusa');   // 同じ場所は2回えらべない
    if (Y.left !== 2) bad.push('同じ場所を2回');
    Y.look(t.at);
    if (!Y.found || !Y.done) bad.push('樹液の木で見つからない');
    if (G.state.points - p0 !== 15 + 10) bad.push(`ポイント ${G.state.points - p0}`);
    if (!G.state.facts.includes('z:yatsu-mushi:0')) bad.push('まちメモ');
    if (!G.yatsuMushiSeen().includes('kabuto')) bad.push('虫手帳');
    Y.close();
    if (G.yatsuMushiDue() || Y.open()) bad.push('1日に2回');
    return bad.length ? bad.join(',') : true;
  });
  // イベントの絵（Blender のシート）：3まいとも読める・大きさが並びと合う・開いた窓の絵がシートの絵に描きかわる
  R.checks.evart = await page.evaluate(async () => {
    const bad = [], load = src => new Promise(r => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = src; });
    const want = { 'nishio-go/art/ev/bugs.png': [640, 32], 'nishio-go/art/ev/stones.png': [312, 24], 'nishio-go/art/ev/places.png': [160, 32], 'nishio-go/art/ev/hiryo.png': [128, 16], 'nishio-go/art/ev/seeds.png': [96, 32], 'nishio-go/art/ev/dankyu.png': [64, 16], 'nishio-go/art/ev/dankyu-flag.png': [16, 32], 'nishio-go/art/ev/dankyu-rock.png': [8, 8] };
    for (const [src, [w, h]] of Object.entries(want)) { const im = await load(src); if (!im || im.naturalWidth !== w || im.naturalHeight !== h) bad.push(`${src} ${im ? im.naturalWidth + 'x' + im.naturalHeight : 'なし'}`); }
    // 虫は角・大あご・触角・足の先まで枠に入っている（どの絵も、ふちの1列は すきとおっている）
    const bugs = await load('nishio-go/art/ev/bugs.png');
    if (bugs) {
      const cv = document.createElement('canvas'); cv.width = 640; cv.height = 32; const c = cv.getContext('2d'); c.drawImage(bugs, 0, 0);
      const d = c.getImageData(0, 0, 640, 32).data, A = (x, y) => d[(y * 640 + x) * 4 + 3];
      for (let i = 0; i < 20; i++) { let cut = false; for (let k = 0; k < 32; k++) if (A(i * 32 + k, 0) || A(i * 32 + k, 31) || A(i * 32, k) || A(i * 32 + 31, k)) cut = true; if (cut) bad.push(`虫${i + 1}が枠で切れている`); }
      // 名前のヒントが絵でわかる：ミスジ（1ぴきめ）の黒いすじが3本、ムツボシ（2ひきめ）の うすい色の点が6つ（その材質の3色が つながったかたまりの数）
      const tones = h => { const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16), k = (r + g + b) / 765 > 0.3 ? 0.38 : 0.16;
        return [[Math.floor(r * 0.62), Math.floor(g * 0.62), Math.floor(Math.min(255, b * 0.72 + 12))], [r, g, b], [r, g, b].map(v => Math.floor(v + (255 - v) * k))].map(c => c.join()); };
      const blobs = (cell, hex) => {
        const set = new Set(tones(hex)), on = (x, y) => x >= 0 && y >= 0 && x < 32 && y < 32 && A(cell * 32 + x, y) && set.has([0, 1, 2].map(j => d[(y * 640 + cell * 32 + x) * 4 + j]).join());
        const seen = new Set(); let n = 0;
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
          if (!on(x, y) || seen.has(y * 32 + x)) continue;
          n++; const st = [[x, y]]; seen.add(y * 32 + x);
          while (st.length) { const [cx, cy] = st.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (on(nx, ny) && !seen.has(ny * 32 + nx)) { seen.add(ny * 32 + nx); st.push([nx, ny]); } } }
        }
        return n;
      };
      if (blobs(0, '#25272b') !== 3) bad.push(`ミスジのすじ ${blobs(0, '#25272b')}本`);
      if (blobs(1, '#ecd59a') !== 6) bad.push(`ムツボシの点 ${blobs(1, '#ecd59a')}こ`);
    }
    // 草刈りのマスは地面がマスいっぱい（すきまがない）。種もみ3つは ちがう絵
    const hi = await load('nishio-go/art/ev/hiryo.png'), se = await load('nishio-go/art/ev/seeds.png');
    if (hi) { const cv = document.createElement('canvas'); cv.width = 128; cv.height = 16; const c = cv.getContext('2d'); c.drawImage(hi, 0, 0); const d = c.getImageData(0, 0, 112, 16).data; for (let i = 3; i < d.length; i += 4) if (d[i] < 255) { bad.push('草刈りのマスに すきま'); break; } }
    if (se) { const cv = document.createElement('canvas'); cv.width = 96; cv.height = 32; const c = cv.getContext('2d'); c.drawImage(se, 0, 0); const u = [0, 1, 2].map(i => c.getImageData(i * 32, 0, 32, 32).data.join()); if (new Set(u).size !== 3) bad.push('種もみの絵が同じ'); }
    // OK の種もみ（1つめ）には、芽のほかに根（材質 ne の色）が見える
    if (se) { const cv = document.createElement('canvas'); cv.width = 96; cv.height = 32; const c = cv.getContext('2d'); c.drawImage(se, 0, 0); const d = c.getImageData(0, 0, 32, 32).data;
      const ne = (() => { const r = 0xec, g = 0xec, b = 0xe4; return [[Math.floor(r * 0.62), Math.floor(g * 0.62), Math.floor(Math.min(255, b * 0.72 + 12))], [r, g, b], [r, g, b].map(v => Math.floor(v + (255 - v) * 0.38))].map(x => x.join()); })();
      let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] && ne.includes([d[i], d[i + 1], d[i + 2]].join())) n++;
      if (!n) bad.push('OK の種もみに根が見えない'); }
    const Y = window.NISHIO_YATSUMUSHI;
    if (Y && Y.BUGS.length + 6 !== 20) bad.push('虫の数とシート');
    return bad.length ? bad.join(',') : true;
  });
  // イベント「古い地図が出てきた」：町名から明治の村がわかり、村の地図が描け、はじめての村で +15pt。2回目は出ない
  R.checks.oldmap = await page.evaluate(async () => {
    const O = window.NISHIO_OLDMAP, G = nishioGo, P = nishioPixel, bad = [];
    // 町名は歩く地図を描いている間だけ新しい。せかいちずに切り替えると、古い町名ではイベントを出さない
    if (!P.hereFresh) bad.push('歩く地図で町名が新しくない');
    P.setWorld(true);
    await new Promise(r => setTimeout(r, 2300));
    if (P.hereFresh) bad.push('せかいちずでも町名が新しいまま');
    P.setWorld(false);
    await new Promise(r => setTimeout(r, 800));
    if (!O) return 'none';
    const v = O.villageOf('一色町味浜', '西尾市'), k = O.villageOf('八ケ尻町', '西尾市'), z = O.villageOf('中野町', '豊橋市');
    if (!v || v.id !== 'isshiki') bad.push('一色町味浜→一色村');
    if (z) bad.push('ほかの市の同じ町名');
    if (!/^data:image\/png/.test(O.villageMap(0) || '')) bad.push('村の地図が描けない');
    const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click();
    const p0 = G.state.points;
    if (!O.open(O.VILLAGES[2], '平坂町') || !O.shown) return '開かない';
    if (G.state.points - p0 !== 15) bad.push(`ポイント ${G.state.points - p0}`);
    if (!/平坂村/.test(document.getElementById('oldmap').textContent)) bad.push('村の名前');
    O.close();
    if (O.open(O.VILLAGES[2], '平坂町')) bad.push('同じ村で2回');
    if (!O.view() || !/平坂村/.test(document.getElementById('oldmap').textContent) || !/1\/11/.test(document.getElementById('oldmap').textContent)) bad.push('きろく の明治の村の地図');
    O.close();
    if (O.villageOf('中根町', '西尾市').id !== 'terazu' || O.villageOf('南中根町', '西尾市').id !== 'meiji') bad.push('中根と南中根');
    return bad.length ? bad.join(',') : true;
  });
  // イベント「本のできごと」：本に出てくる場所の近くで起き、正解で +20pt と まちメモ。同じできごとは2回起きない
  R.checks.bookev = await page.evaluate(() => {
    const B = window.NISHIO_BOOKEV, G = nishioGo, bad = [];
    if (!B) return 'none';
    const pool = B.EVENTS.flatMap(e => e.facts);
    if (pool.some(k => !/^g:[a-z-]+:\d$/.test(k))) bad.push('まちメモの鍵');
    const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click();
    const ev = B.EVENTS.find(e => e.id === 'shisei'), p0 = G.state.points;
    if (!B.open(ev) || !B.shown) return '開かない';
    B.pick(0);
    if (G.state.points - p0 !== 20) bad.push(`ポイント ${G.state.points - p0}`);
    if (!ev.facts.every(k => G.state.facts.includes(k))) bad.push('まちメモ');
    if (!/正解/.test(document.getElementById('bookev').textContent)) bad.push('こたえ');
    B.close();
    if (B.open(ev)) bad.push('2回起きた');
    return bad.length ? bad.join(',') : true;
  });
  // ミニゲーム「肥料山の草刈り」：草を刈って5束で かごがいっぱい、田んぼでおろす。持ち主に「知事の許可」と答えると +10秒、本のできごとも見たことに
  R.checks.hiryo = await page.evaluate(async () => {
    const Y = window.NISHIO_HIRYO, G = nishioGo, B = window.NISHIO_BOOKEV, bad = [];
    if (!Y) return 'none';
    const rw = document.getElementById('reward'); if (rw.classList.contains('show')) rw.click();
    Y.open(true);
    let i = Y.info;
    const col = [...Array(12).keys()].find(x => i.map.slice(0, 7).every(r => r[x] === 'g'));
    if (col === undefined) { Y.close(); return 'まっすぐ刈れる列がない'; }
    while (Y.info.pos[0] !== col) Y.move(Y.info.pos[0] < col ? 'right' : 'left');
    for (let k = 0; k < 6; k++) Y.move('up');
    if (Y.info.carry !== 5) bad.push(`かご ${Y.info.carry}`);
    for (let k = 0; k < 7; k++) Y.move('down');
    if (Y.info.total !== 5 || Y.info.carry !== 0) bad.push(`おろす ${Y.info.total}`);
    Y.setLeft(30.2);
    await new Promise(r => setTimeout(r, 600));
    if (!Y.info.owner) bad.push('持ち主が来ない');
    const l0 = Y.info.left;
    Y.answer('ok');
    if (Y.info.left < l0 + 9) bad.push('+10秒');
    Y.finish('time');
    if (!G.bookEvHas('hiryoyama')) bad.push('本のできごと');
    if (!/草刈り|時間切れ/.test(document.querySelector('#hiryo .jump-result').textContent)) bad.push('結果');
    Y.close();
    if (document.body.classList.contains('jump-open')) bad.push('閉じない');
    return bad.length ? bad.join(',') : true;
  });
  R.checks.trail = await page.evaluate(() => {
    const P = nishioPixel, G = nishioGo, at = { lat: G.me.lat, lng: G.me.lng }, n0 = G.state.trail || 0;
    let t = P.toTile(at.lat, at.lng);
    const x0 = Math.floor(t.x), y0 = Math.floor(t.y);
    const step = (dx, dy) => { t = { x: t.x + dx, y: t.y + dy }; const ll = P.toLatLng(t.x, t.y); G.moveTo(ll.lat, ll.lng, 'step'); };
    for (let i = 0; i < 12; i++) step(1, 0);
    const n1 = G.state.trail || 0, path = Array.from({ length: 13 }, (_, i) => P.trailHas(x0 + i, y0)).every(Boolean);
    for (let i = 0; i < 12; i++) step(-1, 0);
    const n2 = G.state.trail || 0;
    G.moveTo(at.lat + 0.003, at.lng);
    const n3 = G.state.trail || 0, jump = P.toTile(at.lat + 0.003, at.lng), jumped = P.trailHas(Math.floor(jump.x), Math.floor(jump.y));
    G.moveTo(at.lat, at.lng);
    return { total: n1, path, again: n2 - n1, teleport: n3 - n2, jumped, saved: !!localStorage.getItem(G.stateKey + '_trail') || n1 - n0 < 40 };
  });
  await shot(page, '02b-chest');
  await page.waitForTimeout(7500);   // まめちしきの知らせが消えるのを待つ
  for (const id of ['f-nishio-cityhall', 'f-nishio-station', 'f-ricepia']) {
    const w = await walkTo(page, id);
    if (w.reached) { await page.evaluate(() => { const r = document.getElementById('reward'); if (r.classList.contains('show')) r.click(); }); await page.click('#spinBtn'); await page.waitForTimeout(800); w.after = await state(page); }
    R.walk.push(w);
  }
  await shot(page, '03-ricepia-checkin');
  R.checks.weekTheme = await page.evaluate(() => nishioGo.weekTheme().key);
  R.checks.checkinSound = await page.evaluate(() => window.__played.some(f => f === 'checkin.mp3' || f === 'levelup.mp3'));
  // チェックインのほうびの知らせは、タップで消える（消えるまで、下の地図にはタップが届かない）
  R.checks.rewardTapClose = await page.evaluate(() => { const r = document.getElementById('reward'); if (!r.classList.contains('show')) return false; r.click(); return !r.classList.contains('show') && !r.innerHTML; });
  // おみやげ袋：3か所めぐるあいだに 1km 以上歩くので、はじめの袋が開く（ほかのごほうびが出ている間は待ち、消えたら開く）
  // 袋のごほうびは、ドット絵のシートを読みこんでから出るので、出るまで待つ（8秒まで）。歩き方しだいで店に着く前に開いて、
  // チェックインの知らせに消されていることもあるので、いま出ているかではなく、一度出たかを見る
  R.checks.bagOpened = await page.waitForFunction(() => nishioGo.state.log.some(l => l.type === 'bag') && window.__rewards.some(t => /おみやげ袋をあけた/.test(t)), null, { timeout: 8000 }).then(() => true, () => false);
  await shot(page, '03b-bag-open');
  R.checks.cooldown = await page.evaluate(() => document.getElementById('spinBtn').hidden || !document.getElementById('spinSub').textContent.includes('タップして'));
  // 当店の「当店」の札をタップして、お店の案内（サイト・道案内）が開くか
  // 札がスティックなどの下に隠れていたら、見えるところに来るまで少し歩く
  const findTag = () => page.evaluate(() => {
    const h = nishioPixel.shopHits.find(x => x[4].id === 'f-ricepia'); if (!h) return null;
    const cv = document.getElementById('pxCanvas'), r = cv.getBoundingClientRect(), k = cv.width / r.width;
    const x = r.left + (h[0] + h[2]) / 2 / k, y = r.top + (h[1] + 6) / k;
    return { x, y, clear: document.elementFromPoint(x, y) === cv };
  });
  let tag = await findTag();
  for (const k of ['ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowLeft']) {
    if (!tag || tag.clear) break;
    await page.keyboard.press(k); await page.waitForTimeout(400); tag = await findTag();
  }
  if (tag) {
    await page.evaluate(() => { const r = document.getElementById('reward'); if (r.classList.contains('show')) r.click(); });   // 知らせが出ていたら消す（下の地図にタップが届くように）
    await page.waitForTimeout(300);
    await page.mouse.click(tag.x, tag.y); await page.waitForTimeout(500);
    R.checks.shopCard = await page.evaluate(() => !document.getElementById('pxInfo').hidden && /お店のサイト/.test(document.getElementById('pxInfoBody').innerText) && /道案内/.test(document.getElementById('pxInfoBody').innerText) && /LINEで友だち追加/.test(document.getElementById('pxInfoBody').innerText) && /営業中|閉まっています/.test(document.getElementById('pxInfoBody').innerText));   // 当店の窓：サイト・道案内・営業時間・LINE の常連さまポイント
    await shot(page, '04-shop-card');
    await page.evaluate(() => { document.getElementById('pxInfo').hidden = true; });
  } else R.checks.shopCard = false;
  // せかいちず：川の名前・町名・駅名（チェックインのほうびの知らせは7秒出ているので、写す前に消す）
  await page.evaluate(() => { const r = document.getElementById('reward'); if (r.classList.contains('show')) r.click(); });
  await page.click('#pxWorld');
  await page.waitForFunction(() => nishioPixel.worldState === 'ok', null, { timeout: 30000 });
  for (let i = 0; i < 3; i++) await page.$eval('#pxZoomIn', b => b.click());   // 文字を少なく（ふだん）では ＋ は隠れて 🔍 になる
  await page.waitForTimeout(800);
  R.checks.worldLabels = await page.evaluate(() => { const c = { rv: 0, tw: 0, st: 0 }; for (const l of nishioPixel.worldLabels) if (c[l[4]] !== undefined) c[l[4]]++; return c; });
  R.checks.worldBgm = await page.evaluate(() => window.__played.includes('world.mp3'));
  await shot(page, '05-world-map');
  await page.click('#pxWorld'); await page.waitForTimeout(300);
  await page.click('[data-tab=log]'); await page.waitForTimeout(400); await shot(page, '06-log');
  R.checks.reactOffTab = await page.evaluate(() => document.getElementById('reactBar').hidden);   // 「どうだった？」は 地図のタブだけ（きろく の下を ふさがない）
  R.checks.quests = await page.evaluate(() => [...document.querySelectorAll('#questList li')].map(li => (li.classList.contains('done') && !li.innerText.startsWith('✅') ? '✅ ' : '') + li.innerText.replace(/\s+/g, ' ')));   // 文字を少なく（ふだん）では ✅ のかわりに星の絵なので、達成は class で見る
  R.checks.facts = await page.evaluate(() => document.getElementById('factCount').textContent);
  R.checks.todayWalk = await page.evaluate(() => { const el = document.querySelector('#bagBox .todaywalk'); return el ? el.innerText.replace(/\s+/g, ' ') : null; });
  // 絵帳：まだの題材は影と「どこで見つかるか」の手がかり。えらんだ はじめの1枚が絵帳に入っている
  R.checks.dotHints = await page.evaluate(() => document.querySelectorAll('#dotMotifs .hint').length);
  R.checks.firstPickKept = await page.evaluate(id => nishioGo.state.dots.includes(id), R.checks.firstPickId);
  await page.evaluate(() => document.getElementById('badgeHead').scrollIntoView()); await page.waitForTimeout(300); await shot(page, '07-badges');   // バッジは きろく の下
  await page.click('[data-tab=map]'); await page.waitForTimeout(300);
  // 呼びとめ：まだ話していない人の まっすぐ5マス先に立ち、1歩近づくと「！」→ その人が歩いてきて話しかける（歩いてくる間は動けない）
  const eye = await page.evaluate(() => {
    const P = nishioPixel, G = nishioGo, C = P.C, BL = new Set([C.A, C.B, C.M, C.X]);
    for (const n of G.npcs.filter(x => !G.npcMet(x.id))) {
      const q = P.npcTile(n);
      for (const [ux, uy, key] of [[0, 1, 'ArrowUp'], [0, -1, 'ArrowDown'], [1, 0, 'ArrowLeft'], [-1, 0, 'ArrowRight']]) {
        const line = [1, 2, 3, 4, 5].map(i => [q.x + ux * i, q.y + uy * i]);
        const others = G.npcs.filter(o => o !== n).map(o => P.npcTile(o));
        if (line.some(([x, y]) => BL.has(P.codeAt(x, y) & 31) || others.some(o => Math.abs(o.x - x) + Math.abs(o.y - y) <= 5))) continue;
        const ll = P.toLatLng(line[4][0] + 0.5, line[4][1] + 0.5);
        G.moveTo(ll.lat, ll.lng);
        return { id: n.id, name: n.name, key, met0: G.state.met.length };
      }
    }
    return null;
  });
  if (eye) {
    await page.waitForTimeout(700);
    R.checks.eyeNotYet = await page.evaluate(() => document.getElementById('pxInfo').hidden);   // 5マス先では まだ気づかない
    // おとどけもの：この人あての荷物を持っていれば、話しかけたときに届けられる（荷物がなくなり、きろくに残る）
    await page.evaluate(e => { nishioGo.state.parcel = { from: 'playtest', fromName: 'だれか', to: e.id, toName: e.name, item: '手紙', t: Date.now() }; }, eye);
    await page.keyboard.press(eye.key); await page.waitForTimeout(250);
    const at = await page.evaluate(() => [nishioGo.me.lat, nishioGo.me.lng]);
    await page.keyboard.press(eye.key); await page.waitForTimeout(150);
    R.checks.eyeLocked = await page.evaluate(at => nishioGo.me.lat === at[0] && nishioGo.me.lng === at[1], at);
    await shot(page, '07b-eye');
    await page.waitForTimeout(1600);
    R.checks.eyeTalk = await page.evaluate(e => !document.getElementById('pxInfo').hidden && document.getElementById('pxInfoBody').innerText.includes(e.name) && nishioGo.state.met.length === e.met0 + 1 && nishioGo.npcMet(e.id), eye);
    R.checks.parcel = await page.evaluate(id => { const p = nishioGo.state.parcel; return !(p && p.to === id) && nishioGo.state.log.some(l => l.type === 'parcel' && l.name.startsWith('おとどけもの：だれかから')); }, eye.id);   // 届けたあと、この人が次の荷物をあずけることもある
    // 聞いた名所：その人がすすめた名所（人なら、その人が立っている名所）が、まだ行っていなければ きろく に影の絵で載る
    R.checks.heard = await page.evaluate(() => { const g = nishioGo.guide, h = nishioGo.state.heard || {}; return !g || Object.values(h).some(x => x.by) && Object.keys(h).length > 0; });
    // しらべるの手がかり：名所をすすめた人の話の最後のページに、その人のことばで「🔍 ○○…」が出る
    R.checks.heardHint = await page.evaluate(id => { const h = Object.values(nishioGo.state.heard || {}).find(x => x.byId === id); if (!h) return 'no-heard'; const html = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(p => (nishioGo.talkNpc(id, p) || {}).html || '').join(''); return html.includes('🔍'); }, eye.id);   // 手がかりは最後のほうのページ（あとに おとどけもの のページが続くこともある）
    await page.evaluate(() => document.querySelector('#pxInfo [data-close]').click()); await page.waitForTimeout(300);
    await page.keyboard.press(eye.key === 'ArrowUp' ? 'ArrowDown' : eye.key === 'ArrowDown' ? 'ArrowUp' : eye.key === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft'); await page.waitForTimeout(300);
    R.checks.eyeFree = await page.evaluate(at => nishioGo.me.lat !== at[0] || nishioGo.me.lng !== at[1], at);   // 話が終わったら また歩ける
  } else R.checks.eyeTalk = 'no-npc';
  // 生きもの手帳：田んぼで出会うと手帳に載り、その絵がある
  // かたむけて転がす：右の矢印キーを1秒おすと、お米が勢いをつけて右へ転がり（1マスより先へ）、転がった分だけ絵が回る。スマホを左へ傾けても転がる
  R.checks.roll = await (async () => {
    const before = await page.evaluate(() => { nishioPixel.setRoll(true); return null; });
    await page.waitForTimeout(300);
    const a = await page.evaluate(() => nishioPixel.roll);
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(1000); await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(600);
    const b = await page.evaluate(() => nishioPixel.roll);
    // スマホの傾き：はじめの持ち方（40度）を まっすぐにして、左へ20度傾けると 左へ転がる
    await page.evaluate(() => { for (let i = 0; i < 10; i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 40, gamma: 0 })); });
    for (let i = 0; i < 20; i++) { await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 40, gamma: -20 }))); await page.waitForTimeout(50); }
    await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 40, gamma: 0 })));
    await page.waitForTimeout(600);
    const c = await page.evaluate(() => nishioPixel.roll);
    await page.evaluate(() => nishioPixel.setRoll(false));
    return { ready: a.ready, moved: +(b.x - a.x).toFixed(2), rolled: +(b.d - a.d).toFixed(2), tilt: +(c.x - b.x).toFixed(2), ok: !!(a.ready && (b.d - a.d > 0.8) && (Math.abs(b.x - a.x) > 0.8 || Math.abs(b.y - a.y) > 0.3) && (c.d - b.d > 0.5)) };
  })();
  // 坂（本当の高低差）：平らなら さわらなくても動かない。東西南北のどれかに 10% 下る坂を差しこむと、さわらなくても 下る向きへ転がる（かべのない向きで確かめる）
  R.checks.slope = await page.evaluate(async () => {
    nishioPixel.setRoll(true);
    const wait = ms => new Promise(r => setTimeout(r, ms)), at = () => nishioPixel.roll;
    for (let i = 0; i < 20; i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 40, gamma: 0 }));   // スマホを まっすぐに もどす（上の傾けたチェックの あと）
    await wait(800);
    nishioPixel.setHeightFn(() => 5);
    const f0 = at(); await wait(1200); const f1 = at();
    const flat = Math.hypot(f1.x - f0.x, f1.y - f0.y);
    let best = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      nishioPixel.setHeightFn((x, y) => 50 - 0.8 * (x * dx + y * dy));
      const a = at(); await wait(1200); const b = at();
      best = Math.max(best, (b.x - a.x) * dx + (b.y - a.y) * dy);
      if (best > 0.8) break;
    }
    nishioPixel.setHeightFn(null); nishioPixel.setRoll(false);
    return { flat: +flat.toFixed(2), downhill: +best.toFixed(2), ok: flat < 0.1 && best > 0.8 };
  });
  // 転がり方の みがき：はなすと 3.5秒のうちに ぴたっと止まる（いつまでも じわじわ動かない）。かべに押しつけても がたがたしない（さいごの1秒は 止まっている）
  R.checks.rollFeel = await (async () => {
    await page.evaluate(() => nishioPixel.setRoll(true)); await page.waitForTimeout(400);
    const look = () => page.evaluate(() => { const r = nishioPixel.roll, out = []; for (const [k, dx, dy] of [['ArrowLeft', -1, 0], ['ArrowRight', 1, 0], ['ArrowUp', 0, -1], ['ArrowDown', 0, 1]]) { let d = 1; while (d < 9 && !nishioPixel.blockedAt(r.x + dx * d, r.y + dy * d)) d++; out.push([k, d, dx, dy]); } return out.sort((p, q) => q[1] - p[1]); });
    const [open] = await look();
    await page.keyboard.down(open[0]); await page.waitForTimeout(900); await page.keyboard.up(open[0]);
    const t0 = Date.now(); let stopped = false;
    while (Date.now() - t0 < 4000) { await page.waitForTimeout(100); const r = await page.evaluate(() => nishioPixel.roll); if (r.vx === 0 && r.vy === 0) { stopped = true; break; } }
    const stopS = +((Date.now() - t0) / 1000).toFixed(1);
    let still = 'no-wall';
    const wall = (await look()).pop();   // 止まった所から いちばん近い かべ
    if (wall[1] < 9) {
      await page.keyboard.down(wall[0]); await page.waitForTimeout(4500);   // かべまで転がって、はね返りが おさまるまで
      const vs = [];
      for (let i = 0; i < 10; i++) { await page.waitForTimeout(100); const r = await page.evaluate(() => nishioPixel.roll); vs.push(Math.abs(wall[2] ? r.vx : r.vy)); }
      await page.keyboard.up(wall[0]);
      still = vs.every(v => v < 0.05);
    }
    await page.evaluate(() => nishioPixel.setRoll(false));
    const rr = await page.evaluate(() => { const r = nishioPixel.roll; return { round: r.round, flat: r.flat, f0: r.flat }; });
    await page.waitForTimeout(500);
    const flatGrew = (await page.evaluate(() => nishioPixel.roll.flat)) - rr.f0;   // 丸いお米が描けるのに、古い絵（平らな お米）を重ねて描いていないか
    return { stopS, still, round: rr.round, flatGrew, ok: stopped && stopS <= 3.5 && still !== false && rr.round && flatGrew === 0 };
  })();
  // 高低差で とぶ：作った地形（平ら → 2マス先から 20% の下り坂）を 速く こえると とぶ
  R.checks.heightJump = await (async () => {
    await page.evaluate(() => nishioPixel.setRoll(true)); await page.waitForTimeout(400);
    const pick = await page.evaluate(() => { const r = nishioPixel.roll; let best = null; for (const [k, dx, dy] of [['ArrowLeft', -1, 0], ['ArrowRight', 1, 0], ['ArrowUp', 0, -1], ['ArrowDown', 0, 1]]) { let d = 1; while (d < 14 && !nishioPixel.blockedAt(r.x + dx * d, r.y + dy * d)) d++; if (!best || d > best[1]) best = [k, d, dx, dy]; } return { best, x: r.x, y: r.y, j: r.jumps }; });
    const [k, d, dx, dy] = pick.best;
    if (d < 6) { await page.evaluate(() => nishioPixel.setRoll(false)); return { ok: true, skipped: 'no-room', d }; }
    await page.evaluate(([x0, y0, dx, dy]) => nishioPixel.setHeightFn((x, y) => { const s = (x - x0) * dx + (y - y0) * dy; return s < 2 ? 15 : 15 - (s - 2) * 1.6; }), [pick.x, pick.y, dx, dy]);
    await page.keyboard.down(k); await page.waitForTimeout(2200); await page.keyboard.up(k);
    const j = await page.evaluate(() => nishioPixel.roll.jumps);
    await page.evaluate(() => { nishioPixel.setHeightFn(null); nishioPixel.setRoll(false); });
    return { room: d, jumps: j - pick.j, ok: j - pick.j >= 1 };
  })();
  // 転がり方 200：名前が ぜんぶ ちがい、きょうの転がり方が えらべて、ずかんが 開く
  R.checks.koroStyles = await page.evaluate(() => {
    const K = window.NISHIO_KOROSTYLE; if (!K) return { ok: false };
    const L = K.list(), uniq = new Set(L.map(x => x.name)).size;
    const sel = K.select('daily'), cur = K.current();
    K.open(); const cells = document.querySelectorAll('#koroDex .kd-cell').length; K.close();
    return { n: L.length, uniq, daily: cur && cur.name, cells, ok: L.length === 200 && uniq === 200 && sel && !!cur && cells === 200 };
  });
  // 西尾めいろ：1面（西尾駅）の盤ができて、スタートから ゴールまで 道で つながっている。矢印キーで お米が動き、ゴールに着くと「ゴール！」。とじると 歩く地図が また動く
  R.checks.meiro = await (async () => {
    const opened = await page.evaluate(() => window.NISHIO_MEIRO && NISHIO_MEIRO.open(0));
    if (!opened) return { ok: false, opened };
    const built = await page.waitForFunction(() => NISHIO_MEIRO.game && NISHIO_MEIRO.game.board, null, { timeout: 30000 }).then(() => true, () => false);
    if (!built) { await page.evaluate(() => NISHIO_MEIRO.close()); return { ok: false, built }; }
    const b = await page.evaluate(() => { const g = NISHIO_MEIRO.game, b = g.board; return { spot: g.spot.name, len: b.len, tw: b.tw, th: b.th, x: g.x, y: g.y }; });
    await shot(page, '07d-meiro');
    const k = await page.evaluate(() => { const g = NISHIO_MEIRO.game, b = g.board, at = (x, y) => x >= 0 && y >= 0 && x < b.tw && y < b.th && b.cell[y * b.tw + x] === 1; const [x, y] = b.start; return at(x + 1, y) ? 'ArrowRight' : at(x - 1, y) ? 'ArrowLeft' : at(x, y + 1) ? 'ArrowDown' : 'ArrowUp'; });
    await page.keyboard.down(k); await page.waitForTimeout(400); await page.keyboard.up(k);
    const moved = await page.evaluate(([x0, y0]) => { const g = NISHIO_MEIRO.game; return Math.hypot(g.x - x0, g.y - y0); }, [b.x, b.y]);
    await page.evaluate(() => { const g = NISHIO_MEIRO.game; NISHIO_MEIRO.warp(g.board.goal[0] + 0.5, g.board.goal[1] + 0.5); });
    const goal = await page.waitForFunction(() => !document.querySelector('#meiro .mz-clear').hidden && /ゴール/.test(document.querySelector('#meiro .mz-card').innerText), null, { timeout: 5000 }).then(() => true, () => false);
    await page.evaluate(() => NISHIO_MEIRO.close());
    const back = await page.evaluate(() => document.getElementById('meiro').hidden);
    return { ...b, moved: +moved.toFixed(2), goal, back, ok: b.len >= 8 && moved > 0.3 && goal && back };
  })();
  R.checks.critter = await page.evaluate(() => { const c = nishioGo.meetCritter('paddy'); return !!c && !!nishioPixel.critterSprite(c.id) && !!nishioGo.state.critters[c.id]; });
  // イベント「ドット絵ムービー」：八ツ面山でチェックインすると、ごほうびの画面のあとに「山の岩のなりたち」が流れ、最後まで見ると まちメモ に残る
  await page.evaluate(() => { window.__keepMovie = true; const s = nishioGo.spots.find(x => x.id === 'f-yatsuomote'); nishioGo.moveTo(s.lat, s.lng); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { document.getElementById('pxInfo').hidden = true; const r = document.getElementById('reward'); if (r.classList.contains('show')) r.click(); });
  await page.click('#spinBtn').catch(() => {}); await page.waitForTimeout(800);
  await page.evaluate(() => { const r = document.getElementById('reward'); if (r.classList.contains('show')) r.click(); });
  R.checks.movieOpen = await page.waitForFunction(() => window.NISHIO_MOVIE && NISHIO_MOVIE.playing === 'iwa', null, { timeout: 10000 }).then(() => true, () => false);
  if (R.checks.movieOpen) { await shot(page, '07c-movie'); for (let i = 0; i < 4; i++) { await page.click('#movie [data-mv="next"]'); await page.waitForTimeout(200); } }
  R.checks.movieDone = await page.evaluate(() => !window.NISHIO_MOVIE.playing && (nishioGo.state.movies || []).includes('iwa') && nishioGo.state.facts.includes('z:iwa:0'));
  await page.evaluate(() => { window.__keepMovie = false; });
  R.checks.operateFinal = await state(page);
  // せってい の「文字を多めに出す」で、文字が出る（もどすと また少なく）
  await page.click('[data-tab=settings]'); await page.click('#textToggle'); await page.waitForTimeout(200);
  R.checks.textMore = await page.evaluate(() => !document.body.classList.contains('simple') && /（.）/.test(document.getElementById('koyomi').textContent));
  await page.click('#textToggle'); await page.click('[data-tab=map]'); await page.waitForTimeout(200);
  R.checks.textLessAgain = await page.evaluate(() => document.body.classList.contains('simple'));

  // 2) 同じ画面のまま、あるいて移動に切り替える（位置情報で現在地が出るか、記録が操作モードと別か、戻すと操作モードの記録が残っているか）
  await page.click('[data-tab=settings]'); await page.click('.mode-sw [data-mode=real]'); await page.click('[data-tab=map]'); await page.waitForTimeout(3500);   // 移動のしかたは せってい で切り替える
  R.checks.walkMode = await page.evaluate(([la, lo]) => !nishioGo.demo && !!nishioGo.me && Math.abs(nishioGo.me.lat - la) < 1e-4 && Math.abs(nishioGo.me.lng - lo) < 1e-4 && document.getElementById('pxPad').hidden, STATION);
  R.checks.walkModePoints = await page.evaluate(() => nishioGo.state.points);
  R.checks.walkWelcome = await page.evaluate(() => !!nishioGo.state.welcomed && nishioGo.state.log.some(l => l.type === 'welcome'));
  R.checks.walkChests = await page.evaluate(() => nishioGo.liveChests().map(c => c.at || ''));   // あるいて移動ではスポットの上にだけ
  await shot(page, '08-walk-mode');
  await page.click('[data-tab=settings]'); await page.click('.mode-sw [data-mode=demo]'); await page.click('[data-tab=map]'); await page.waitForTimeout(1000);
  R.checks.operatePointsKept = await page.evaluate(() => nishioGo.state.points);
  R.errors.push(...errors);
  await ctx.close();

  await browser.close(); server.close();
  // 合格の条件：どれか1つでも外れたら、理由を failures に書いて終了コード1
  const c = R.checks, fail = [];
  const need = (ok, why) => { if (!ok) fail.push(why); };
  need(R.errors.length === 0, 'ページでエラーが出た');
  need(R.walk.length === 4 && R.walk.every(w => w.reached), 'たからばこか3か所のどこかに着けなかった');
  need(c.padOnWorldMap, 'せかいちずで操作して遊ぶを選んだとき、スティックが出ない');
  need(c.simpleDefault && c.textMore && c.textLessAgain, '文字を少なくする表示がはじめから有効でないか、せってい で切り替わらない');
  need(c.firstOnField && c.welcomeChestM !== null && c.welcomeChestM <= 150, 'はじめての人が歩く地図から始まらないか、近くに ようこそ たからばこ がない');
  need(c.stickKnobMoved && c.stickWalkedNorth && c.stickReleased, 'スティックを上へ倒しても北へ歩かない・はなしても戻らない');
  need(c.tapWalk === true, '地面をタップしても、そこまで歩かない');
  need(c.tapWalkStopsOnPanel === true, 'タップした所へ歩くとちゅうで きろく を開いても、うしろで歩きつづける');
  need(c.tapWalkStopsOnTouch === true, 'タップした所へ歩くとちゅうで 地図の外（こよみの札）をさわっても、うしろで歩きつづける');
  need(String(c.tapWalkStopsOnCover) === 'reward,a2hs', 'タップした所へ歩くとちゅうで ほうびの知らせや ホーム画面に追加 の案内が出ても、うしろで歩きつづける');
  need(c.operateMode && c.bgmStarted && c.checkinSound && c.cooldown && c.shopCard && c.worldBgm && c.walkMode && c.reactOffTab, '操作・音・当店の案内・あるいて移動のどれかが動かない');
  need(c.rewardTapClose === true, 'ほうびの知らせがチェックインのあとに出ないか、タップで消えない');
  need(c.chestsNearby > 0, 'たからばこが置かれていない');
  need(c.movieOpen === true && c.movieDone === true, 'ドット絵ムービー：八ツ面山でチェックインしても流れないか、最後まで見ても まちメモ に残らない');
  need(c.roll && c.roll.ok, 'かたむけて転がす：お米が転がらない（または絵が回らない）');
  need(c.slope && c.slope.ok, '坂：平らな所で動く、または 下り坂で ひとりでに転がらない');
  need(c.rollFeel && c.rollFeel.ok, '転がり方：はなしても なかなか止まらない、または かべに押しつけると がたがたする');
  need(c.heightJump && c.heightJump.ok, '高低差で とぶ：急な下り坂の へりを 速く こえても とばない');
  need(c.koroStyles && c.koroStyles.ok, '転がり方 200：数・名前・ずかん が おかしい');
  need(c.meiro && c.meiro.ok, `西尾めいろ：盤ができない・お米が動かない・ゴールできない・とじられない（${JSON.stringify(c.meiro)}）`);
  need(c.critter === true, '生きもの手帳：田んぼで生きものに出会っても、手帳に載らない（または絵がない）');
  need(c.heard === true, '聞いた名所：人に行き先をすすめられても、きろく の 聞いた名所 に載らない');
  need(c.parcel !== false, 'おとどけもの：あずかった荷物の あて先の人と話しても、届けられない');
  need(c.heardHint !== false, 'しらべるの手がかり：名所をすすめた人の話に、🔍 の手がかりのページが出ない');
  need(c.eyeNotYet === true && c.eyeLocked === true && c.eyeTalk === true && c.eyeFree === true, '呼びとめ：まだ話していない人の まっすぐ4マス以内に入っても、その人が歩いてきて話しかけない（または、歩いてくる間に動ける・話のあとに動けない）');
  need(c.teleportNoBag === true, '歩く地図の1歩でない瞬間移動で、おみやげ袋が進んだ');
  need(c.dankyu === true, `段丘をのぼる：${c.dankyu}`);
  need(c.hiryo === true, `ミニゲーム 肥料山の草刈り：${c.hiryo}`);
  need(c.bookev === true, `イベント 本のできごと：${c.bookev}`);
  need(c.oldmap === true, `イベント 古い地図：${c.oldmap}`);
  need(c.medashi === true, `田んぼのイベント 芽出しの見きわめ：${c.medashi}`);
  need(c.mushi === true, `水べのイベント 虫の名前あて：${c.mushi}`);
  need(c.kirara === true, `イベント 雲母石を探せ：${c.kirara}`);
  need(c.yatsumushi === true, `イベント 八ツ面山の昆虫さがし：${c.yatsumushi}`);
  need(c.evart === true, `イベントの絵（Blender のシート）：${c.evart}`);
  need(c.fourth === true, `第4弾（もどす・自己ベスト・知らせ・前回のさんぽ・バッジ）：${c.fourth}`);
  need(c.trail && c.trail.total > 0 && c.trail.path && c.trail.again === 0 && c.trail.teleport === 0 && !c.trail.jumped, 'あしあと：歩く地図の1歩で歩いた道が残らないか、同じ道でふえる・瞬間移動で残る');
  need(typeof c.todayWalk === 'string' && /きょうのさんぽ/.test(c.todayWalk) && /はじめての道/.test(c.todayWalk), 'きろく に きょうのさんぽ（歩いた・はじめての道）が出ない');
  need(c.welcomeBag === '1' && c.bagOpened === true, 'はじめての たからばこ で 1km の おみやげ袋がもらえないか、1km 歩いても開かない');
  need(typeof c.weekTheme === 'string' && c.weekTheme, '今週のテーマが決まらない');
  need(c.firstPickN === 3 && c.firstPickKept === true, 'ようこそ たからばこ で はじめの1枚を3枚から えらべないか、えらんだ絵が絵帳に入らない');
  need(c.dotHints > 0, '絵帳の まだの題材に、どこで見つかるかの手がかりが出ない');
  need(c.worldLabels && c.worldLabels.rv > 0 && c.worldLabels.tw > 0 && c.worldLabels.st > 0, 'せかいちずに川・町名・駅の名前がない');
  need(Array.isArray(c.quests) && c.quests.length === 4 && c.quests.some(q => q.startsWith('✅')), '今日のクエストが出ないか、1つも達成されない');
  need(/^[1-9]\d*\/[1-9]\d*$/.test(c.facts || ''), 'まめちしきが集まらない');
  need(c.walkModePoints === 30 && c.walkWelcome && c.operatePointsKept === c.operateFinal.pts && c.operateFinal.pts > 0, '記録がモードごとに分かれていない（あるいて移動は ようこそ の +30 だけのはず）');
  need(Array.isArray(c.walkChests) && c.walkChests.length > 0, 'あるいて移動でたからばこが置かれていない');
  need(Array.isArray(c.walkChests) && c.walkChests.every(at => at), 'あるいて移動のたからばこがスポット以外に置かれた');
  R.failures = fail;
  R.ok = fail.length === 0;
  fs.writeFileSync(path.join(OUT, 'playtest.json'), JSON.stringify(R, null, 2));
  console.log(JSON.stringify(R, null, 2));
  process.exit(R.ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
