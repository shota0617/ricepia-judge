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
  need(c.operateMode && c.bgmStarted && c.checkinSound && c.cooldown && c.shopCard && c.worldBgm && c.walkMode, '操作・音・当店の案内・あるいて移動のどれかが動かない');
  need(c.rewardTapClose === true, 'ほうびの知らせがチェックインのあとに出ないか、タップで消えない');
  need(c.chestsNearby > 0, 'たからばこが置かれていない');
  need(c.movieOpen === true && c.movieDone === true, 'ドット絵ムービー：八ツ面山でチェックインしても流れないか、最後まで見ても まちメモ に残らない');
  need(c.critter === true, '生きもの手帳：田んぼで生きものに出会っても、手帳に載らない（または絵がない）');
  need(c.heard === true, '聞いた名所：人に行き先をすすめられても、きろく の 聞いた名所 に載らない');
  need(c.parcel !== false, 'おとどけもの：あずかった荷物の あて先の人と話しても、届けられない');
  need(c.heardHint !== false, 'しらべるの手がかり：名所をすすめた人の話に、🔍 の手がかりのページが出ない');
  need(c.eyeNotYet === true && c.eyeLocked === true && c.eyeTalk === true && c.eyeFree === true, '呼びとめ：まだ話していない人の まっすぐ4マス以内に入っても、その人が歩いてきて話しかけない（または、歩いてくる間に動ける・話のあとに動けない）');
  need(c.teleportNoBag === true, '歩く地図の1歩でない瞬間移動で、おみやげ袋が進んだ');
  need(c.dankyu === true, `段丘をのぼる：${c.dankyu}`);
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
